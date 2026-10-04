"""Verify actual PBF processing and a clean child-process exit, without touching evidence."""
import argparse
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def worker(directory):
    import importlib.metadata
    import osmium
    from audit_osm import Audit
    from inspect_route_osm import Ways

    pbf = Path(directory) / "tiny.osm.pbf"
    with osmium.SimpleWriter(str(pbf)) as writer:
        writer.add_node(osmium.osm.mutable.Node(id=1, location=(19.94, 50.06)))
        writer.add_node(osmium.osm.mutable.Node(id=2, location=(19.941, 50.061)))
        writer.add_way(osmium.osm.mutable.Way(id=101, nodes=[1, 2],
                       tags={"highway": "footway", "surface": "asphalt", "width": "1.2"}))
        writer.add_way(osmium.osm.mutable.Way(id=102, nodes=[1, 2],
                       tags={"highway": "pedestrian", "wheelchair": "yes"}))

    audit = Audit()
    with osmium.io.Reader(str(pbf)) as reader:
        osmium.apply(reader, audit)
    ways = Ways({101, 102})
    with osmium.io.Reader(str(pbf), osmium.osm.WAY) as reader:
        osmium.apply(reader, ways)
    assert audit.totals["nodes"] == 2 and audit.totals["ways"] == 2
    assert sum(audit.ways.values()) == 2 and audit.tags["width"] == 1
    assert {row["osm_way_id"] for row in ways.rows} == {101, 102}
    assert sum(bool(row["width_related_tags"]) for row in ways.rows) == 1
    print(json.dumps({"osmium_version": importlib.metadata.version("osmium"),
                      "python_version": sys.version.split()[0], "pbf_nodes": 2,
                      "pbf_ways": 2, "audit_selected_ways": 2, "joined_ways": 2,
                      "ways_with_width": 1, "checks": "PASS"}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", metavar="TEMP_DIRECTORY", help=argparse.SUPPRESS)
    parser.add_argument("--timeout", type=float, default=15)
    args = parser.parse_args()
    if args.worker:
        worker(args.worker)
        return 0
    start = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="ors-osmium-exit-") as directory:
        try:
            result = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--worker", directory],
                                    capture_output=True, text=True, timeout=args.timeout)
        except subprocess.TimeoutExpired as error:
            print(json.dumps({"overall": "FAIL", "reason": "PBF worker did not exit within timeout",
                              "timeout_seconds": args.timeout, "stdout": str(error.stdout)}))
            return 1
        output = {"overall": "PASS" if result.returncode == 0 else "FAIL",
                  "child_exit_code": result.returncode, "child_stdout": result.stdout,
                  "child_stderr": result.stderr, "elapsed_seconds": round(time.perf_counter() - start, 3),
                  "interpreter": sys.executable}
        print(json.dumps(output, indent=2))
        return 0 if result.returncode == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
