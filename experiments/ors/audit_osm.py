"""Count tag presence in a declared Krakow rectangle, not accessibility or graph coverage.

Dependency: osmium==4.3.1 (pip). No remote OSM API requests.
"""
import json
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parent
BBOX = (19.79, 49.96, 20.22, 50.13)  # west, south, east, north
HIGHWAYS = {"footway", "pedestrian", "path", "steps", "living_street", "residential", "service", "cycleway"}
KEYS = ("width", "est_width", "maxwidth:physical", "wheelchair", "surface", "smoothness", "incline", "kerb", "kerb:height", "sidewalk", "crossing")


class Audit(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.inside = set()
        self.totals = Counter()
        self.ways = Counter()
        self.tags = Counter()
        self.nodes_with_tags = Counter()
        self.examples = []

    def node(self, n):
        self.totals["nodes"] += 1
        if n.location.valid() and BBOX[0] <= n.location.lon <= BBOX[2] and BBOX[1] <= n.location.lat <= BBOX[3]:
            self.inside.add(n.id)
            for key in KEYS:
                if key in n.tags:
                    self.nodes_with_tags[key] += 1

    def way(self, w):
        self.totals["ways"] += 1
        kind = w.tags.get("highway")
        if kind not in HIGHWAYS or not any(n.ref in self.inside for n in w.nodes):
            return
        self.ways[kind] += 1
        for key in KEYS:
            if key in w.tags:
                self.tags[key] += 1
        if "width" in w.tags and len(self.examples) < 15:
            self.examples.append({"osm_way_id": w.id, "tags": dict(w.tags)})

    def relation(self, r):
        self.totals["relations"] += 1


def main():
    pbf = ROOT / "input" / "malopolskie-latest.osm.pbf"
    start = time.perf_counter()
    handler = Audit()
    with osmium.io.Reader(str(pbf)) as reader:
        osmium.apply(reader, handler)
    n = sum(handler.ways.values())
    result = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "elapsed_seconds": round(time.perf_counter() - start, 2),
        "source_file": str(pbf),
        "bbox_west_south_east_north": BBOX,
        "method": "All OSM ways in selected highway categories with at least one node inside the rectangle. Counts refer to OSM objects, not distances, unique physical paths or ORS graph edges. Includes steps and private/restricted paths. Rectangle is not Krakow administrative boundary.",
        "complete_pbf_object_counts": dict(handler.totals),
        "nodes_inside_rectangle": len(handler.inside),
        "selected_way_count": n,
        "selected_highway_counts": dict(handler.ways),
        "tag_presence_selected_ways": {key: {"count": handler.tags[key], "percent": round(handler.tags[key] / n * 100, 3)} for key in KEYS},
        "tag_presence_all_nodes_inside_rectangle": dict(handler.nodes_with_tags),
        "width_examples": handler.examples,
        "caveats": ["Missing width does not mean wide enough.", "Road width is not necessarily sidewalk clear width.", "A present tag may be old, imprecise or incorrect.", "An aggregate count cannot validate an individual route."]
    }
    (ROOT / "evidence" / "osm-tag-audit.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "width_examples"}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
