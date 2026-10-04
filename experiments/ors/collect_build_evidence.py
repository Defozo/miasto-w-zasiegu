"""Capture the built graph size, image, server status and real build log metrics."""
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EVIDENCE = ROOT / "evidence"


def docker(*args):
    return subprocess.check_output(["docker", *args], encoding="utf-8").strip()


def main():
    log = (EVIDENCE / "build-container.log").read_text(encoding="utf-8")
    ansi = re.sub(r"\x1b\[[0-9;]*m", "", log)
    (EVIDENCE / "build-container.clean.log").write_text(ansi, encoding="utf-8")
    counts = re.findall(r"nodes: ([\d\u202f]+), edges: ([\d\u202f]+)", ansi)
    times = re.findall(r"Total time: ([\d.]+)s", ansi)
    sizes = docker("exec", "cracow-ors-spike", "du", "-sk", "/home/ors/graphs", "/home/ors/elevation_cache")
    disks = {line.split()[1]: int(line.split()[0]) * 1024 for line in sizes.splitlines()}
    subprocess.run(["docker", "cp", "cracow-ors-spike:/home/ors/graphs/wheelchair/graph_build_info.yml", str(EVIDENCE / "graph_build_info.yml")], check=True, capture_output=True)
    status = json.loads((EVIDENCE / "status.json").read_text(encoding="utf-8"))
    obs = json.loads((EVIDENCE / "build-observations.json").read_text(encoding="utf-8"))
    sampled_memory = []
    for item in obs:
        raw = item["docker_stats"].get("MemUsage", "").split(" / ")[0]
        m = re.fullmatch(r"([\d.]+)([GMK]?i?B)", raw)
        if m:
            multiplier = {"B": 1, "KiB": 1024, "MiB": 1024 ** 2, "GiB": 1024 ** 3, "kB": 1000, "MB": 10 ** 6, "GB": 10 ** 9}[m[2]]
            sampled_memory.append(float(m[1]) * multiplier)
    result = {
        "collected_at_utc": datetime.now(timezone.utc).isoformat(),
        "container": "cracow-ors-spike",
        "base_url": "http://127.0.0.1:18082/ors",
        "container_state": json.loads(docker("inspect", "--format", "{{json .State}}", "cracow-ors-spike")),
        "image_digests": json.loads((EVIDENCE / "image-digests.json").read_text(encoding="utf-8-sig")),
        "engine": status["engine"],
        "configured_resources": {"container_memory_gib": 12, "jvm_xms_gib": 2, "jvm_xmx_gib": 8, "cpu_limit": 6},
        "ors_initialization_seconds_from_log": float(times[-1]) if times else None,
        "graph_nodes_from_log": int(counts[-1][0].replace("\u202f", "")) if counts else None,
        "graph_edges_from_log": int(counts[-1][1].replace("\u202f", "")) if counts else None,
        "disk_allocated_bytes": disks,
        "largest_sampled_docker_memory_bytes": round(max(sampled_memory)) if sampled_memory else None,
        "memory_note": "Maximum among periodic docker stats observations, not an instrumented peak or minimum RAM requirement.",
        "ready_observed_utc": (EVIDENCE / "ready-observed.txt").read_text(encoding="utf-8"),
    }
    (EVIDENCE / "build-summary.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "container_state"}, indent=2))


if __name__ == "__main__":
    main()
