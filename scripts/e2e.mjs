import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A separate Playwright invocation owns and closes its memory API and preview.
// This keeps the real registration limit intact without sharing test accounts.
const root = fileURLToPath(new URL("../", import.meta.url));
const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
const testRoot = path.join(root, "tests/e2e");
let interrupted = false;
let activeChild;

function interrupt() {
  if (interrupted) return;
  interrupted = true;
  console.error("\nPrzerwano E2E. Pozostałe pliki nie zostaną uruchomione.");
  if (!activeChild?.pid) return;
  if (process.platform === "win32") {
    // Only the process tree created by this runner, never other local servers.
    const killer = spawn(
      "taskkill",
      ["/pid", String(activeChild.pid), "/T", "/F"],
      {
        stdio: "ignore",
        windowsHide: true,
      },
    );
    killer.on("error", () => activeChild?.kill());
  } else {
    activeChild.kill("SIGINT");
  }
}
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);

async function findFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await findFiles(absolute)));
    else if (/\.spec\.[cm]?[jt]sx?$/.test(entry.name)) found.push(absolute);
  }
  return found.sort();
}

function reporterEnv(overrides) {
  const env = { ...process.env };
  // User-wide reporter destinations must not overwrite another run's files.
  for (const key of Object.keys(env)) {
    if (/^PLAYWRIGHT_(BLOB|JSON|HTML)_(OUTPUT_|REPORT$|OPEN$)/.test(key))
      delete env[key];
  }
  return { ...env, ...overrides };
}

async function runCli(args, env, logPath) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const log = createWriteStream(logPath, { flags: "wx" });
  let logError;
  log.on("error", (error) => {
    logError = error.message;
  });
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root,
      env,
      stdio: ["inherit", "pipe", "pipe"],
      windowsHide: true,
    });
    activeChild = child;
    let spawnError;
    child.on("error", (error) => {
      spawnError = error.message;
    });
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      log.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      log.write(chunk);
    });
    child.on("close", (exitCode, signal) => {
      activeChild = undefined;
      resolve({ exitCode, signal, spawnError });
    });
  });
  await new Promise((resolve) => {
    if (log.destroyed) resolve();
    else {
      log.once("close", resolve);
      log.end();
    }
  });
  return {
    ...result,
    logError,
    startedAt,
    durationMs: Math.round(performance.now() - started),
  };
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function exactFileFilter(file) {
  // Playwright CLI arguments are regular expressions, including on Windows.
  return (
    file
      .split(/[\\/]/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[/\\\\]") + "$"
  );
}

function classify(result, report, blobs) {
  if (interrupted) return "interrupted";
  if (
    result.spawnError ||
    result.signal ||
    !report?.stats ||
    blobs.length === 0 ||
    ![0, 1].includes(result.exitCode)
  )
    return "crashed";
  if (result.logError || report.errors?.length) return "infrastructure-error";
  if (result.exitCode !== 0 || report.stats.unexpected > 0) return "failed";
  return "passed";
}

async function main() {
  if (process.argv.length > 2) {
    throw new Error(
      "Runner uruchamia cały zestaw. Pojedynczy plik: npx playwright test tests/e2e/nazwa.spec.ts",
    );
  }
  const files = await findFiles(testRoot);
  if (!files.length) throw new Error("Nie znaleziono plików E2E w tests/e2e.");
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const runDir = path.join(root, "artifacts/e2e-runs", runId);
  const mergedBlobs = path.join(runDir, "merge-input");
  await mkdir(mergedBlobs, { recursive: true });
  const summaryPath = path.join(runDir, "runner-summary.json");
  const summary = {
    runId,
    startedAt: new Date().toISOString(),
    status: "running",
    files: [],
    plannedFiles: files.map((file) => path.relative(root, file)),
    reports: {
      html: path.join(runDir, "html/index.html"),
      json: path.join(runDir, "report.json"),
    },
  };
  const save = () =>
    writeFile(summaryPath, JSON.stringify(summary, null, 2) + "\n");
  await save();
  console.log(
    `E2E: ${files.length} plików, osobne API dla każdego. Wyniki: ${runDir}`,
  );
  let blobCount = 0;
  for (const [index, file] of files.entries()) {
    if (interrupted) break;
    const label = path
      .relative(testRoot, file)
      .replace(/[^a-zA-Z0-9._-]/g, "-");
    const fileDir = path.join(
      runDir,
      `${String(index + 1).padStart(2, "0")}-${label}`,
    );
    const blobDir = path.join(fileDir, "blob");
    const jsonPath = path.join(fileDir, "report.json");
    await mkdir(fileDir);
    console.log(
      `\n[${index + 1}/${files.length}] ${path.relative(root, file)}`,
    );
    const result = await runCli(
      [
        "test",
        exactFileFilter(file),
        "--config",
        path.join(root, "playwright.config.ts"),
        "--reporter=list,blob,json",
        "--output",
        path.join(fileDir, "test-results"),
      ],
      reporterEnv({
        PLAYWRIGHT_BLOB_OUTPUT_DIR: blobDir,
        PLAYWRIGHT_BLOB_OUTPUT_NAME: "report.zip",
        PLAYWRIGHT_JSON_OUTPUT_FILE: jsonPath,
      }),
      path.join(fileDir, "process.log"),
    );
    const report = await readJson(jsonPath);
    const blobs = (await readdir(blobDir).catch(() => [])).filter((name) =>
      name.endsWith(".zip"),
    );
    for (const [blobIndex, name] of blobs.entries()) {
      await copyFile(
        path.join(blobDir, name),
        path.join(mergedBlobs, `${index + 1}-${blobIndex + 1}.zip`),
      );
      blobCount++;
    }
    const status = classify(result, report, blobs);
    summary.files.push({
      file: path.relative(root, file),
      status,
      ...result,
      stats: report?.stats ?? null,
      reportErrors: report?.errors ?? [],
      artifacts: fileDir,
    });
    console.log(`[${status}] ${path.relative(root, file)}`);
    await save();
  }
  if (blobCount) {
    console.log("\nScalanie raportów HTML i JSON...");
    summary.merge = await runCli(
      ["merge-reports", "--reporter=html,json", mergedBlobs],
      reporterEnv({
        PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(runDir, "html"),
        PLAYWRIGHT_HTML_OPEN: "never",
        PLAYWRIGHT_JSON_OUTPUT_FILE: summary.reports.json,
      }),
      path.join(runDir, "merge.log"),
    );
    summary.merge.ok =
      summary.merge.exitCode === 0 &&
      !summary.merge.spawnError &&
      !summary.merge.logError &&
      !!(await readJson(summary.reports.json));
  } else {
    summary.merge = {
      ok: false,
      reason: "Nie powstał żaden raport blob. Sprawdź logi procesów.",
    };
  }
  summary.finishedAt = new Date().toISOString();
  summary.notRun = summary.plannedFiles.slice(summary.files.length);
  summary.status = interrupted
    ? "interrupted"
    : summary.files.length === files.length &&
        summary.files.every((file) => file.status === "passed") &&
        summary.merge.ok
      ? "passed"
      : "failed";
  await save();
  console.log(
    `\nE2E: ${summary.status}. Podsumowanie procesów: ${summaryPath}`,
  );
  if (summary.merge.ok)
    console.log(`HTML: ${summary.reports.html}\nJSON: ${summary.reports.json}`);
  console.log(
    "Raporty obejmują zakończone zapisy Playwrighta; awarie i pominięte pliki są wymienione w runner-summary.json.",
  );
  process.exitCode = interrupted ? 130 : summary.status === "passed" ? 0 : 1;
}

main().catch((error) => {
  console.error(`Błąd runnera E2E: ${error.message}`);
  process.exitCode = interrupted ? 130 : 1;
});
