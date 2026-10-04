import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace

path = Path(__file__).resolve().parents[1]/'scripts/import-parking-access.py'
spec = importlib.util.spec_from_file_location('parking_access', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ParkingAccessTest(unittest.TestCase):
    def test_mode_specific_access(self):
        self.assertFalse(module.permitted({'highway': 'service', 'access': 'private', 'foot': 'yes'}, 'car'))
        self.assertTrue(module.permitted({'highway': 'service', 'access': 'private', 'foot': 'yes'}, 'foot'))
        self.assertFalse(module.permitted({'highway': 'footway', 'access': 'yes'}, 'car'))
        self.assertFalse(module.permitted({'highway': 'steps'}, 'foot'))
        self.assertFalse(module.permitted({'access': 'private;customers'}, 'car'))

    def test_shared_node_access_and_parent_identity(self):
        ring = [[19.9, 50.0], [19.91, 50.0], [19.91, 50.01], [19.9, 50.01], [19.9, 50.0]]
        geometry = SimpleNamespace(items={
            'osm-way-1': {'kind': 'parking', 'tags': {}, 'refs': [1, 2, 3, 4, 1], 'points': ring},
            'osm-node-5': {'kind': 'parking_space', 'tags': {}, 'refs': [5], 'points': [[19.905, 50.005]]},
        }, nodes={})
        roads = {1: [{'wayId': 100, 'tags': {'highway': 'service', 'foot': 'no'}, 'updatedAt': None}],
                 3: [{'wayId': 101, 'tags': {'highway': 'footway'}, 'updatedAt': None}]}
        rows = module.build_overlay(geometry, roads, '2026-10-01')['records']
        self.assertEqual(rows['osm-node-5']['parentParkingId'], 'osm-way-1')
        self.assertEqual([p['nodeId'] for p in rows['osm-way-1']['vehicleEntrances']], [1])
        self.assertEqual([p['nodeId'] for p in rows['osm-way-1']['mobilityExits']], [3])
        self.assertFalse(rows['osm-way-1']['transferVerified'])


if __name__ == '__main__':
    unittest.main()
