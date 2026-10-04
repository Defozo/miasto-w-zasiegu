"""Extract actual address tags and named streets from the local OSM PBF. No online geocoder."""
import argparse
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
import osmium

ROOT = Path(__file__).resolve().parents[1]
BBOX = (19.79, 49.96, 20.22, 50.13)
ROAD_TYPES = {"residential", "living_street", "pedestrian", "primary", "secondary", "tertiary", "unclassified", "service", "footway"}


class Locations(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.rows = []

    def node(self, node):
        if node.location.valid():
            self.add(node, "node", node.location.lon, node.location.lat)

    def way(self, way):
        tags = dict(way.tags)
        if not tags.get("addr:housenumber") and not (tags.get("highway") in ROAD_TYPES and tags.get("name")):
            return
        points = [(n.location.lon, n.location.lat) for n in way.nodes if n.location.valid()]
        if not points:
            return
        if tags.get("addr:housenumber"):
            lon = (min(x for x, _ in points) + max(x for x, _ in points)) / 2
            lat = (min(y for _, y in points) + max(y for _, y in points)) / 2
        else:
            lon, lat = points[len(points) // 2]
        self.add(way, "way", lon, lat)

    def add(self, obj, osm_type, lon, lat):
        if not (BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]):
            return
        tags = dict(obj.tags)
        street = tags.get("addr:street") or tags.get("addr:place")
        house = tags.get("addr:housenumber")
        city = tags.get("addr:city", "")
        if street and house:
            label = f"{street} {house}" + (f", {city}" if city else "")
            kind, precision = "address", "address"
        elif osm_type == "way" and tags.get("highway") in ROAD_TYPES and tags.get("name"):
            label = tags.get("name:pl") or tags["name"]
            kind, precision = "street", "approximate"
        else:
            return
        self.rows.append({"id": f"address-osm-{osm_type}-{obj.id}" if kind == "address" else f"street-osm-way-{obj.id}",
                          "label": label, "coordinates": [round(lon, 7), round(lat, 7)], "kind": kind, "precision": precision,
                          "sourceLabel": "OpenStreetMap · adres z tagów, wejście niezweryfikowane" if kind == "address" else "OpenStreetMap · przybliżony punkt ulicy",
                          "sourceUrl": f"https://www.openstreetmap.org/{osm_type}/{obj.id}",
                          "coordinateKind": "osm-node" if osm_type == "node" else "representative-center",
                          "street": street if kind == "address" else label, "houseNumber": house if kind == "address" else None,
                          "city": city or None})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "experiments/ors/input/malopolskie-latest.osm.pbf")
    parser.add_argument("--output", type=Path, default=ROOT / "server/data/locations.json")
    args = parser.parse_args()
    start = time.monotonic()
    handler = Locations()
    locations = osmium.NodeLocationsForWays(osmium.index.create_map("flex_mem"))
    locations.ignore_errors()
    with osmium.io.Reader(str(args.input), osmium.osm.NODE | osmium.osm.WAY) as reader:
        snapshot = reader.header().get("osmosis_replication_timestamp")
        osmium.apply(reader, locations, osmium.filter.KeyFilter("addr:housenumber", "highway"), handler)
    data = {"source": {"label": "OpenStreetMap / Geofabrik Małopolskie", "snapshotDate": snapshot or None,
                       "attribution": "© OpenStreetMap contributors", "license": "ODbL-1.0", "bbox": BBOX,
                       "scope": "OSM address nodes/ways and named street ways; representative coordinates are not verified entrances. Relations excluded."},
            "importedAt": datetime.now(timezone.utc).isoformat(), "locations": handler.rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"locations": len(handler.rows), "addresses": sum(x["kind"] == "address" for x in handler.rows),
                      "streetSegments": sum(x["kind"] == "street" for x in handler.rows), "seconds": round(time.monotonic()-start, 2)}))


if __name__ == "__main__":
    main()
