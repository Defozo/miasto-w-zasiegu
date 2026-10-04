"""Recreate only this experiment's container and verify the existing graph survives."""
import json
import subprocess
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from test_routes import ROUTES, base_request, validate_route

ROOT = Path(__file__).resolve().parent
BASE = "http://127.0.0.1:18082/ors"
FILES = ["/home/ors/graphs/wheelchair/" + name for name in ("edges", "nodes", "ext_wheelchair", "landmarks_wheelchair_recommended")]


def fetch(path, body=None):
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Accept": "application/geo+json" if body else "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


def graph_hashes():
    lines = subprocess.check_output(["docker", "exec", "cracow-ors-spike", "sha256sum", *FILES], encoding="utf-8").splitlines()
    return {line.split()[1]: line.split()[0] for line in lines}


def main():
    before_status, before_hashes = fetch("/v2/status"), graph_hashes()
    started = datetime.now(timezone.utc).isoformat()
    t = time.perf_counter()
    subprocess.run(["docker", "compose", "-f", str(ROOT / "compose.yml"), "up", "-d", "--force-recreate"], check=True)
    last_error = None
    while time.perf_counter() - t < 180:
        try:
            if fetch("/v2/health").get("status") == "ready":
                break
        except Exception as exc:
            last_error = str(exc)
        time.sleep(1)
    else:
        raise TimeoutError(f"No readiness after recreation: {last_error}")
    elapsed = time.perf_counter() - t
    after_status, after_hashes = fetch("/v2/status"), graph_hashes()
    request = base_request(ROUTES[0])
    route = fetch("/v2/directions/wheelchair/geojson", request)
    validation, _ = validate_route(route, request)
    result = {"started_at_utc": started, "seconds_until_ready": round(elapsed, 3),
              "graph_hashes_before": before_hashes, "graph_hashes_after": after_hashes,
              "graph_hashes_unchanged": before_hashes == after_hashes,
              "graph_date_before": before_status["engine"]["graph_date"], "graph_date_after": after_status["engine"]["graph_date"],
              "post_recreation_route": validation,
              "overall": "PASS" if before_hashes == after_hashes and before_status["engine"]["graph_date"] == after_status["engine"]["graph_date"] and not validation["errors"] else "FAIL"}
    (ROOT / "evidence" / "persistence-test.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    logs = subprocess.run(["docker", "logs", "--timestamps", "cracow-ors-spike"], capture_output=True)
    (ROOT / "evidence" / "restart-container.log").write_bytes(logs.stdout + b"\nSTDERR:\n" + logs.stderr)
    print(json.dumps(result, indent=2))
    if result["overall"] != "PASS":
        raise RuntimeError("Graph persistence test failed.")


if __name__ == "__main__":
    main()
