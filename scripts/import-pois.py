"""Import tagged OSM nodes and ways in a Krakow bounding box from the local snapshot.

Needs osmium==4.3.1. Does not infer entrance accessibility or fabricate measurements.
"""
import argparse
import json
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import osmium

ROOT = Path(__file__).resolve().parents[1]
BBOX = (19.79, 49.96, 20.22, 50.13)
LABELS = {"culture": "Kultura", "food": "Gastronomia", "toilet": "Toaleta", "transport": "Transport", "outdoors": "Na zewnątrz"}


def category(tags):
    amenity, tourism = tags.get("amenity"), tags.get("tourism")
    if amenity == "toilets":
        return "toilet"
    if amenity in {"parking", "parking_space", "parking_entrance"}:
        return "transport"
    if amenity in {"restaurant", "cafe", "bar", "pub", "fast_food", "food_court", "ice_cream"}:
        return "food"
    if tags.get("highway") == "bus_stop" or tags.get("railway") in {"station", "tram_stop", "subway_entrance"}:
        return "transport"
    if tourism in {"museum", "gallery", "artwork", "attraction"} or amenity in {"theatre", "cinema", "arts_centre", "library"} or tags.get("historic") in {"castle", "monument", "memorial", "ruins", "manor", "building", "city_gate", "archaeological_site"}:
        return "culture"
    if amenity == "bench" or tags.get("leisure") in {"park", "garden", "playground"} or tourism == "viewpoint":
        return "outdoors"


class Places(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.rows = []

    def node(self, node):
        if not node.location.valid():
            return
        self.add(node, "node", node.location.lon, node.location.lat)

    def way(self, way):
        if way.tags.get("amenity") == "bench":
            return  # The first rest-stop import supports exact bench nodes only.
        if not category(dict(way.tags)):
            return
        points = [(n.location.lon, n.location.lat) for n in way.nodes if n.location.valid()]
        if not points or not any(BBOX[0] <= x <= BBOX[2] and BBOX[1] <= y <= BBOX[3] for x, y in points):
            return
        # Bounding-box center is a representative map point, never an entrance.
        lon = (min(x for x, _ in points) + max(x for x, _ in points)) / 2
        lat = (min(y for _, y in points) + max(y for _, y in points)) / 2
        self.add(way, "way", lon, lat)

    def add(self, obj, osm_type, lon, lat):
        if not (BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]):
            return
        tags = dict(obj.tags)
        kind = category(tags)
        if not kind:
            return
        name = tags.get("name:pl") or tags.get("name")
        is_parking = tags.get("amenity") in {"parking", "parking_space", "parking_entrance"}
        if not name and kind not in {"toilet", "outdoors"} and not is_parking:
            return
        if is_parking:
            name = name or ("Wjazd na parking" if tags.get("amenity") == "parking_entrance" else "Parking")
        name = name or ("Toaleta" if kind == "toilet" else "Ławka" if tags.get("amenity") == "bench" else "Plac zabaw" if tags.get("leisure") == "playground" else "Miejsce na zewnątrz")
        wheelchair = tags.get("wheelchair", "unknown")
        wheelchair = wheelchair if wheelchair in {"yes", "limited", "no"} else "unknown"
        toilet = tags.get("toilets:wheelchair", "unknown")
        # An explicit toilet tag is independent of overall wheelchair access.
        # Keep conflicts visible instead of overwriting a toilet restriction.
        if "toilets:wheelchair" not in tags and kind == "toilet" and wheelchair in {"yes", "limited", "no"}:
            toilet = wheelchair
        if toilet not in {"yes", "limited", "no"}:
            toilet = "unknown"
        address = " ".join(filter(None, [tags.get("addr:street"), tags.get("addr:housenumber")]))
        notes = tags.get("wheelchair:description:pl") or tags.get("wheelchair:description")
        location_note = ("Punkt reprezentatywny obszaru OSM, nie wejście. Sprawdź rzeczywisty dojazd i wejście." if osm_type == "way"
                         else "Położenie punktu nie oznacza potwierdzonego dostępnego wejścia.")
        self.rows.append({"id": f"osm-{osm_type}-{obj.id}", "name": name, "category": kind,
                          "coordinates": [lon, lat], "description": tags.get("description:pl") or tags.get("description") or f"{LABELS[kind]}. Punkt z OpenStreetMap.",
                          "address": address or "Adres nieuzupełniony w OSM",
                          "access": {"wheelchair": wheelchair, "widthCm": None, "surface": tags.get("surface"), "toilet": toilet,
                                     "entranceNotes": " ".join(filter(None, [notes, location_note]))},
                          "sourceUrl": f"https://www.openstreetmap.org/{osm_type}/{obj.id}",
                          "placeType": "parking" if is_parking else "bench" if tags.get("amenity") == "bench" else "toilet" if kind == "toilet" else "park" if tags.get("leisure") == "park" else None,
                          "parking": {"type": tags.get("parking"), "disabledSpaces": tags.get("capacity:disabled"), "capacity": tags.get("capacity"), "maxHeight": tags.get("maxheight"), "wheelchair": tags.get("wheelchair"), "vehicleEntrance": [lon, lat] if tags.get("amenity") == "parking_entrance" else None, "mobilityExit": None, "alightingPoint": None, "transferVerified": False} if is_parking else None,
                          "accessRestriction": tags.get("access"), "openingHours": tags.get("opening_hours"), "fee": tags.get("fee"),
                          "bench": {"backrest": tags.get("backrest"), "armrest": tags.get("armrest")} if tags.get("amenity") == "bench" else None,
                          "verifiedAt": None, "sourceLabel": "OpenStreetMap · bez audytu terenowego",
                          "coordinateKind": "representative-center" if osm_type == "way" else "osm-node",
                          "osmUpdatedAt": obj.timestamp.isoformat() if obj.timestamp else None})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "experiments/ors/input/malopolskie-latest.osm.pbf")
    parser.add_argument("--output", type=Path, default=ROOT / "server/data/places.json")
    parser.add_argument("--parking-only", action="store_true")
    args = parser.parse_args()
    start = time.perf_counter()
    handler = Places()
    location_cache = osmium.index.create_map("flex_mem")
    locations = osmium.NodeLocationsForWays(location_cache)
    locations.ignore_errors()
    with osmium.io.Reader(str(args.input), osmium.osm.NODE | osmium.osm.WAY) as reader:
        snapshot = reader.header().get("osmosis_replication_timestamp")
        osmium.apply(reader, locations, osmium.filter.KeyFilter("amenity", "tourism", "leisure", "railway", "highway", "historic"), handler)
    if args.parking_only:
        handler.rows = [row for row in handler.rows if row.get("placeType") == "parking"]
    handler.rows.sort(key=lambda row: (row["category"], row["name"].casefold(), row["id"]))
    result = {"source": {"label": "OpenStreetMap / Geofabrik Małopolskie", "snapshotDate": snapshot or None,
                         "attribution": "© OpenStreetMap contributors", "url": "https://download.geofabrik.de/europe/poland/malopolskie.html",
                         "license": "ODbL-1.0", "bbox": BBOX, "scope": "Tagged OSM nodes and ways; way coordinates are representative centers, not entrances. Relations excluded. Bounding box, not administrative boundary; no field verification."},
              "importedAt": datetime.now(timezone.utc).isoformat(), "places": handler.rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(json.dumps({"places": len(handler.rows), "categories": dict(Counter(x["category"] for x in handler.rows)),
                      "seconds": round(time.perf_counter() - start, 2), "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
