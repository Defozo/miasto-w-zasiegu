"""Join parking areas to their actual OSM road/footway nodes in the same snapshot.

No nearest-road projection, inferred pedestrian shortcut or field verification.
Run after import-pois.py --parking-only. Output is an optional routing overlay.
"""
import argparse
import json
import math
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
import osmium

ROOT = Path(__file__).resolve().parents[1]
BBOX = (19.79, 49.96, 20.22, 50.13)
RESTRICTED = {'no', 'private', 'permit', 'residents', 'staff', 'employees', 'delivery', 'agricultural', 'forestry', 'bus', 'taxi'}
CAR_ROADS = {'service', 'residential', 'unclassified', 'living_street', 'tertiary', 'secondary', 'primary', 'road', 'track'}


def restricted(value):
    return any(part.strip() in RESTRICTED for part in (value or '').split(';'))


def permitted(tags, mode):
    keys = ['motorcar', 'motor_vehicle', 'vehicle', 'access'] if mode == 'car' else ['foot', 'access']
    access = next((tags[k] for k in keys if k in tags), None)
    if restricted(access):
        return False
    if mode == 'foot' and tags.get('wheelchair') == 'no':
        return False
    road = tags.get('highway')
    if road:
        explicit_motor = next((tags[k] for k in ['motorcar', 'motor_vehicle', 'vehicle'] if k in tags), None)
        if mode == 'car' and road not in CAR_ROADS and explicit_motor not in {'yes', 'designated', 'permissive', 'destination', 'customers'}:
            return False
        if mode == 'foot' and road in {'steps', 'motorway', 'motorway_link', 'trunk', 'trunk_link', 'construction', 'proposed'}:
            return False
    return True


def inside(point, ring):
    x, y = point
    result = False
    for a, b in zip(ring, ring[1:]):
        # Count the boundary itself as contained for a tagged entrance.
        cross = (x-a[0])*(b[1]-a[1]) - (y-a[1])*(b[0]-a[0])
        if abs(cross) < 1e-13 and min(a[0], b[0])-1e-10 <= x <= max(a[0], b[0])+1e-10 and min(a[1], b[1])-1e-10 <= y <= max(a[1], b[1])+1e-10:
            return True
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            result = not result
    return result


class ParkingGeometry(osmium.SimpleHandler):
    def __init__(self, ids):
        super().__init__()
        self.ids, self.items, self.nodes = ids, {}, {}

    def node(self, n):
        if not n.location.valid() or not (BBOX[0] <= n.location.lon <= BBOX[2] and BBOX[1] <= n.location.lat <= BBOX[3]):
            return
        tags = dict(n.tags)
        identifier = f'osm-node-{n.id}'
        point = [n.location.lon, n.location.lat]
        if identifier in self.ids:
            self.items[identifier] = {'kind': tags.get('amenity'), 'tags': tags, 'refs': [n.id], 'points': [point]}
        if identifier in self.ids or tags.get('entrance') or tags.get('barrier') or tags.get('highway') == 'elevator':
            self.nodes[n.id] = {'coordinates': point, 'tags': tags, 'updatedAt': n.timestamp.isoformat()}

    def way(self, w):
        identifier = f'osm-way-{w.id}'
        if identifier not in self.ids:
            return
        if not all(n.location.valid() for n in w.nodes):
            return
        self.items[identifier] = {'kind': w.tags.get('amenity'), 'tags': dict(w.tags),
                                  'refs': [n.ref for n in w.nodes], 'points': [[n.lon, n.lat] for n in w.nodes]}


class RoadConnections(osmium.SimpleHandler):
    def __init__(self, wanted):
        super().__init__()
        self.wanted, self.connections = wanted, defaultdict(list)

    def way(self, w):
        if not w.tags.get('highway') or w.tags.get('area') == 'yes':
            return
        refs = [n.ref for n in w.nodes]
        for node_id in self.wanted.intersection(refs):
            self.connections[node_id].append({'wayId': w.id, 'tags': dict(w.tags), 'updatedAt': w.timestamp.isoformat()})


def build_overlay(geometry, connections, snapshot):
    areas, cells = {}, defaultdict(list)
    for identifier, item in geometry.items.items():
        ring = item['points']
        if item['kind'] == 'parking' and len(ring) >= 4 and ring[0] == ring[-1]:
            areas[identifier] = item
            xs, ys = [p[0] for p in ring], [p[1] for p in ring]
            for x in range(math.floor(min(xs)*1000), math.floor(max(xs)*1000)+1):
                for y in range(math.floor(min(ys)*1000), math.floor(max(ys)*1000)+1):
                    cells[x, y].append(identifier)

    def containing(point):
        return [identifier for identifier in cells[math.floor(point[0]*1000), math.floor(point[1]*1000)]
                if inside(point, areas[identifier]['points'])]

    parent_ids, extra_nodes = {}, defaultdict(set)
    for identifier, item in geometry.items.items():
        if item['kind'] not in {'parking_space', 'parking_entrance'}:
            continue
        # A whole space, not just its centre, must belong to exactly one area.
        def same_level(area):
            child_type = item['tags'].get('parking') or item['tags'].get('location')
            parent_type = area['tags'].get('parking') or area['tags'].get('location')
            if child_type in {'underground', 'multi-storey', 'rooftop'} and parent_type != child_type:
                return False
            return item['tags'].get('layer', '0') == area['tags'].get('layer', '0')
        parents = [p for p in containing(item['points'][0]) if same_level(areas[p]) and all(inside(point, areas[p]['points']) for point in item['points'])]
        if len(parents) == 1:
            parent_ids[identifier] = parents[0]
            if item['kind'] == 'parking_entrance':
                extra_nodes[parents[0]].update(item['refs'])
    for node_id, node in geometry.nodes.items():
        if node['tags'].get('entrance') not in {None, 'no', 'emergency'}:
            # A building door merely inside an underground parking footprint is
            # not evidence that it exits that car park. Require a shared boundary.
            parents = [p for p in containing(node['coordinates']) if node_id in areas[p]['refs']]
            if len(parents) == 1:
                extra_nodes[parents[0]].add(node_id)

    records = {}
    for identifier, item in geometry.items.items():
        point_by_ref = dict(zip(item['refs'], item['points']))
        node_ids = set(item['refs']) | extra_nodes[identifier]
        entry = {'kind': item['kind'], 'parentParkingId': parent_ids.get(identifier),
                 'vehicleEntrances': [], 'mobilityExits': [], 'transferVerified': False,
                 'vehicleAccess': 'unknown', 'mobilityAccess': 'unknown'}
        if identifier in areas:
            entry['area'] = item['points']
        for node_id in sorted(node_ids):
            node = geometry.nodes.get(node_id, {'tags': {}, 'coordinates': point_by_ref.get(node_id), 'updatedAt': None})
            for mode, field in [('car', 'vehicleEntrances'), ('foot', 'mobilityExits')]:
                if not permitted(item['tags'], mode) or not permitted(node['tags'], mode):
                    continue
                roads = [road for road in connections.get(node_id, []) if permitted(road['tags'], mode)]
                # An explicit car-only entrance must not become a pedestrian exit.
                if not roads:
                    continue
                entry[field].append({'coordinates': node['coordinates'], 'nodeId': node_id,
                                     'sourceUrl': f'https://www.openstreetmap.org/node/{node_id}',
                                     'connection': 'shared-osm-node', 'updatedAt': node['updatedAt'],
                                     'ways': [{'id': r['wayId'], 'updatedAt': r['updatedAt']} for r in roads]})
        if not permitted(item['tags'], 'car'):
            entry['vehicleAccess'] = 'restricted'
        elif entry['vehicleEntrances']:
            entry['vehicleAccess'] = 'mapped'
        elif len(item['refs']) == 1 and connections.get(item['refs'][0]):
            # An isolated POI with no road remains unknown. An attached POI whose
            # every connected road prohibits cars must not snap across that rule.
            entry['vehicleAccess'] = 'restricted'
        if not permitted(item['tags'], 'foot') or (len(item['refs']) == 1 and connections.get(item['refs'][0]) and not entry['mobilityExits']):
            entry['mobilityAccess'] = 'restricted'
        records[identifier] = entry
    return {'schemaVersion': 1, 'snapshotAt': snapshot, 'importedAt': datetime.now(timezone.utc).isoformat(),
            'method': 'OSM area containment for identity; shared OSM node for access. No field verification.',
            'records': records, 'counts': {'kinds': dict(Counter(r['kind'] for r in records.values())),
                'grouped': len(parent_ids), 'vehicleConnections': sum(bool(r['vehicleEntrances']) for r in records.values()),
                'pedestrianConnections': sum(bool(r['mobilityExits']) for r in records.values())}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT/'experiments/ors/input/malopolskie-latest.osm.pbf')
    parser.add_argument('--parkings', type=Path, default=ROOT/'server/data/parkings.json')
    parser.add_argument('--output', type=Path, default=ROOT/'server/data/parking-access.json')
    args = parser.parse_args()
    parkings = json.loads(args.parkings.read_text(encoding='utf-8'))
    geometry = ParkingGeometry({p['id'] for p in parkings['places']})
    cache = osmium.index.create_map('flex_mem')
    locations = osmium.NodeLocationsForWays(cache)
    locations.ignore_errors()
    with osmium.io.Reader(str(args.input), osmium.osm.NODE | osmium.osm.WAY) as reader:
        snapshot = reader.header().get('osmosis_replication_timestamp')
        if not snapshot or snapshot != parkings['source']['snapshotDate']:
            raise ValueError('Parking import and road connections must use the same OSM snapshot')
        osmium.apply(reader, locations, osmium.filter.KeyFilter('amenity', 'entrance', 'barrier', 'highway'), geometry)
    print(json.dumps({'phase': 'parking geometry', 'records': len(geometry.items)}), flush=True)
    wanted = set(geometry.nodes)
    for item in geometry.items.values():
        wanted.update(item['refs'])
    roads = RoadConnections(wanted)
    with osmium.io.Reader(str(args.input), osmium.osm.WAY) as reader:
        osmium.apply(reader, osmium.filter.KeyFilter('highway'), roads)
    overlay = build_overlay(geometry, roads.connections, snapshot)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(f'.{os.getpid()}.tmp')
    temporary.write_text(json.dumps(overlay, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    temporary.replace(args.output)
    print(json.dumps(overlay['counts'], ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
