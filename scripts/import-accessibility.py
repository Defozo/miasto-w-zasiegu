"""Import accessibility features from the existing OSM snapshot. No field audit.

Keeps original geometry and tags. Atomic publication preserves the last good file.
Run with experiments/ors/.venv/Scripts/python.exe scripts/import-accessibility.py.
"""
import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import osmium

ROOT = Path(__file__).resolve().parents[1]
BBOX = (19.79, 49.96, 20.22, 50.13)
HIGHWAYS = {"footway", "pedestrian", "path", "steps", "living_street", "residential", "service", "cycleway", "track", "unclassified", "tertiary", "secondary", "primary"}
KEYS = {"highway", "footway", "name", "barrier", "kerb", "kerb:height", "height", "width", "est_width", "maxwidth:physical", "surface", "smoothness", "incline", "wheelchair", "foot", "access", "crossing", "tactile_paving", "bridge", "tunnel", "layer", "level", "entrance", "door", "ramp", "ramp:wheelchair", "step_count"}


def inside(x, y):
    return BBOX[0] <= x <= BBOX[2] and BBOX[1] <= y <= BBOX[3]


class Features(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.curbs = {}

    def append(self, obj, kind, geometry, tags, osm_type):
        row = {"type": "Feature", "id": f"osm-{osm_type}-{obj.id}", "geometry": geometry,
               "properties": {"kind": kind, "osmId": str(obj.id), "osmType": osm_type,
                              "tags": {k: v for k, v in tags.items() if k in KEYS or k.startswith(("sidewalk:", "kerb:", "ramp:"))},
                              "sourceUrl": f"https://www.openstreetmap.org/{osm_type}/{obj.id}",
                              "updatedAt": obj.timestamp.isoformat() if obj.timestamp else None,
                              "verification": "source-only"}}
        self.rows.append(row)
        return row

    def node(self, node):
        if not node.location.valid() or not inside(node.location.lon, node.location.lat):
            return
        tags = dict(node.tags)
        kind = ("kerb" if tags.get("barrier") == "kerb" or "kerb" in tags or "kerb:height" in tags
                else "lift" if tags.get("highway") == "elevator"
                else "entrance" if tags.get("entrance") and any(k in tags for k in ["width", "wheelchair", "ramp", "step_count"])
                else None)
        if kind:
            row = self.append(node, kind, {"type": "Point", "coordinates": [node.location.lon, node.location.lat]}, tags, "node")
            if kind == "kerb":
                row["properties"]["wayIds"] = []
                row["properties"]["crossingWayIds"] = []
                self.curbs[node.id] = row

    def way(self, way):
        tags = dict(way.tags)
        kind = "kerb" if tags.get("barrier") == "kerb" else "steps" if tags.get("highway") == "steps" else "path" if tags.get("highway") in HIGHWAYS else None
        if not kind:
            return
        nodes = list(way.nodes)
        if any(not n.location.valid() for n in nodes):
            return  # Never bridge missing source geometry.
        points = [[n.location.lon, n.location.lat] for n in nodes]
        if len(points) < 2 or not any(inside(*p) for p in points):
            return
        self.append(way, kind, {"type": "LineString", "coordinates": points}, tags, "way")
        if kind != "kerb":
            for n in nodes:
                if n.ref in self.curbs:
                    p = self.curbs[n.ref]["properties"]
                    p["wayIds"].append(str(way.id))
                    if tags.get("footway") == "crossing":
                        p["crossingWayIds"].append(str(way.id))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "experiments/ors/input/malopolskie-latest.osm.pbf")
    parser.add_argument("--output", type=Path, default=ROOT / "server/data/accessibility.json")
    args = parser.parse_args()
    handler = Features()
    loc = osmium.NodeLocationsForWays(osmium.index.create_map("flex_mem"))
    loc.ignore_errors()
    with osmium.io.Reader(str(args.input), osmium.osm.NODE | osmium.osm.WAY) as reader:
        snapshot = reader.header().get("osmosis_replication_timestamp")
        osmium.apply(reader, loc, osmium.filter.KeyFilter("highway", "barrier", "kerb", "kerb:height", "entrance"), handler)
    if not handler.curbs or not handler.rows:
        raise RuntimeError("Empty import; the previous snapshot was preserved")
    data = {"schemaVersion": 1, "source": {"label": "OpenStreetMap", "url": "https://download.geofabrik.de/europe/poland/malopolskie.html",
            "license": "ODbL-1.0", "termsUrl": "https://www.openstreetmap.org/copyright", "attribution": "© OpenStreetMap contributors",
            "snapshotAt": snapshot, "importedAt": datetime.now(timezone.utc).isoformat(), "bbox": BBOX,
            "scope": "Nodes inside the rectangle; ways with a node inside it; no relations. Not a field audit."},
            "features": handler.rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(args.output)
    import runpy
    runpy.run_path(str(ROOT / 'scripts/index-accessibility.py'))['build_index'](args.output)
    print(json.dumps({"features": len(handler.rows), "kinds": dict(Counter(f["properties"]["kind"] for f in handler.rows)), "output": str(args.output)}))


if __name__ == "__main__":
    main()
