"""Join a live ORS route's OSM way IDs to tags in the exact local input PBF."""
import json
import urllib.request
from pathlib import Path

import osmium

from test_routes import ROUTES, base_request

ROOT = Path(__file__).resolve().parent
EVIDENCE = ROOT / "evidence"


class Ways(osmium.SimpleHandler):
    def __init__(self, ids):
        super().__init__()
        self.ids, self.rows = ids, []

    def way(self, way):
        if way.id in self.ids:
            tags = dict(way.tags)
            self.rows.append({"osm_way_id": way.id, "osm_url": f"https://www.openstreetmap.org/way/{way.id}", "tags": tags,
                              "width_related_tags": {k: v for k, v in tags.items() if "width" in k}})


def main():
    request_body = base_request(ROUTES[0])
    request_body["extra_info"] = ["osmid", "surface", "waytype"]
    (EVIDENCE / "florianska-extra-info.request.json").write_text(json.dumps(request_body, indent=2), encoding="utf-8")
    req = urllib.request.Request("http://127.0.0.1:18082/ors/v2/directions/wheelchair/geojson", data=json.dumps(request_body).encode(),
                                 headers={"Content-Type": "application/json", "Accept": "application/geo+json"})
    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.load(response)
    (EVIDENCE / "florianska-extra-info.response.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    ids = {int(v[2]) for v in result["features"][0]["properties"]["extras"]["osmId"]["values"]}
    handler = Ways(ids)
    # Only way tags are needed; skip parsing nodes and relations.
    with osmium.io.Reader(str(ROOT / "input" / "malopolskie-latest.osm.pbf"), osmium.osm.WAY) as reader:
        osmium.apply(reader, handler)
    missing = ids - {v["osm_way_id"] for v in handler.rows}
    output = {"requested_osm_way_ids": sorted(ids), "ids_not_found_in_pbf": sorted(missing), "ways": handler.rows,
              "matched_way_count": len(handler.rows), "ways_with_any_width_related_tag": sum(bool(v["width_related_tags"]) for v in handler.rows),
              "interpretation": "Checks tag presence in the exact imported snapshot. No physical width was measured. Inferred ORS wheelchair attributes may also depend on nodes/sidewalk tags; this join preserves all way tags for review."}
    (EVIDENCE / "florianska-osm-tags.json").write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(output, indent=2, ensure_ascii=False))
    if missing:
        raise RuntimeError("Some route OSM IDs were not found in the imported PBF.")


if __name__ == "__main__":
    main()
