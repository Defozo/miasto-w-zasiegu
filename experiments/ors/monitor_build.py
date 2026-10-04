"""Record real health and resource samples; do not equate a running JVM with ready ORS."""
import json
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EVIDENCE = ROOT / "evidence"
BASE = "http://127.0.0.1:18082/ors"


def main():
    samples = []
    started = time.perf_counter()
    while time.perf_counter() - started < 1800:
        sample = {"at_utc": datetime.now(timezone.utc).isoformat()}
        try:
            with urllib.request.urlopen(BASE + "/v2/health", timeout=5) as response:
                sample["health"] = json.load(response)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            sample["health_error"] = str(exc)
        stat = subprocess.run(["docker", "stats", "--no-stream", "--format", "{{json .}}", "cracow-ors-spike"], capture_output=True, text=True)
        sample["docker_stats"] = json.loads(stat.stdout) if stat.returncode == 0 and stat.stdout.strip() else {"error": stat.stderr}
        samples.append(sample)
        (EVIDENCE / "build-observations.json").write_text(json.dumps(samples, indent=2), encoding="utf-8")
        print(json.dumps(sample), flush=True)
        if sample.get("health", {}).get("status") == "ready":
            for endpoint in ["health", "status"]:
                with urllib.request.urlopen(BASE + "/v2/" + endpoint, timeout=30) as response:
                    (EVIDENCE / (endpoint + ".json")).write_bytes(response.read())
            (EVIDENCE / "ready-observed.txt").write_text(sample["at_utc"], encoding="utf-8")
            log = subprocess.run(["docker", "logs", "--timestamps", "cracow-ors-spike"], capture_output=True)
            (EVIDENCE / "build-container.log").write_bytes(log.stdout + b"\nSTDERR:\n" + log.stderr)
            print("ORS ready, evidence saved.", flush=True)
            return
        state = subprocess.run(["docker", "inspect", "--format", "{{.State.Running}}", "cracow-ors-spike"], capture_output=True, text=True)
        if state.returncode or state.stdout.strip() != "true":
            raise RuntimeError("ORS container stopped before reaching ready.")
        time.sleep(15)
    raise TimeoutError("ORS did not become ready within 30 minutes.")


if __name__ == "__main__":
    main()
