import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

// Exercise the actual browser client and auth bridge without contacting Clerk.
// Node transforms their TypeScript in memory; no application files are rewritten.
const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const sessionSource = await readFile(
  new URL("../../web/src/auth/session.ts", import.meta.url),
  "utf8",
);
const sessionUrl = moduleUrl(
  stripTypeScriptTypes(sessionSource, { mode: "transform" }),
);
const clientSource = await readFile(
  new URL("../../web/src/passports/passport-api.ts", import.meta.url),
  "utf8",
);
assert.ok(
  clientSource.includes('import("../auth/session")'),
  "The private client must dynamically load the auth bridge.",
);
const clientUrl = moduleUrl(
  stripTypeScriptTypes(
    clientSource.replace('"../auth/session"', JSON.stringify(sessionUrl)),
    { mode: "transform" },
  ),
);
const { connectAuth } = await import(sessionUrl);
const { passportRequest, PassportApiError } = await import(clientUrl);

async function browserGlobals(run, fetchImpl) {
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.fetch = fetchImpl;
  try {
    await run();
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test("private passport requests obtain a fresh Bearer token while public widget requests never read the token", async () => {
  let tokenRequests = 0;
  const requests = [];
  const disconnect = connectAuth(
    async () => `token-${++tokenRequests}`,
    async () => {},
  );
  try {
    await browserGlobals(
      async () => {
        await passportRequest("/place-passports/mine");
        await passportRequest("/place-passports/drafts", {
          body: { expectedUserId: "author" },
        });
        await passportRequest("/place-passports/test-place", { public: true });
      },
      async (url, options) => {
        requests.push({ url, ...options });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    );
    assert.equal(tokenRequests, 2);
    assert.equal(requests[0].headers.Authorization, "Bearer token-1");
    assert.equal(requests[1].headers.Authorization, "Bearer token-2");
    assert.equal(requests[1].headers["Content-Type"], "application/json");
    assert.equal(requests[2].headers.Authorization, undefined);
    assert.equal(requests[2].credentials, "omit");
    assert.equal(requests[2].cache, "no-store");
  } finally {
    disconnect();
  }
});

test("an aborted identity change cannot send a private request after a delayed token", async () => {
  let fetched = false;
  const disconnect = connectAuth(
    () => new Promise(() => {}),
    async () => {},
  );
  try {
    await browserGlobals(
      async () => {
        const controller = new AbortController();
        const request = passportRequest("/place-passports/mine", {
          signal: controller.signal,
        });
        controller.abort();
        await assert.rejects(request, (error) => error.name === "AbortError");
        assert.equal(fetched, false);
      },
      async () => {
        fetched = true;
        throw new Error("A cancelled request must not reach the network.");
      },
    );
  } finally {
    disconnect();
  }
});

test("the passport client retains conflict codes so private and published conflicts can be handled differently", async () => {
  await browserGlobals(
    async () => {
      await assert.rejects(
        passportRequest("/place-passports/drafts/test", {
          method: "PUT",
          body: {},
        }),
        (error) => {
          assert.ok(error instanceof PassportApiError);
          assert.equal(error.code, "DRAFT_CONFLICT");
          assert.equal(error.status, 409);
          return true;
        },
      );
    },
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "DRAFT_CONFLICT",
            message: "Szkic zmienił się w innej karcie.",
          },
        }),
        { status: 409 },
      ),
  );
});
