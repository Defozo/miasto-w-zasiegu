import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('imports', Path(__file__).resolve().parents[1] / 'scripts/run-data-imports.py')
imports = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imports)


class DataImportTests(unittest.TestCase):
    def test_failed_activation_restores_previous_pointer_and_restarts_it(self):
        with tempfile.TemporaryDirectory() as root:
            pointer = Path(root) / 'osm-current.json'
            before = {'schemaVersion': 1, 'generation': 'old'}
            imports.atomic_json(pointer, before)
            restarted, checked = [], []
            def verify(value):
                checked.append(value)
                if value == 'new':
                    raise RuntimeError('unhealthy')
            with self.assertRaisesRegex(RuntimeError, 'unhealthy'):
                imports.activate_generation(pointer, {'schemaVersion': 1, 'generation': 'new'}, lambda: restarted.append(1), verify)
            self.assertEqual(imports.read_json(pointer), before)
            self.assertEqual(checked, ['new', 'old'])
            self.assertEqual(len(restarted), 2)

    def test_first_failed_activation_restores_original_directory(self):
        with tempfile.TemporaryDirectory() as root:
            pointer = Path(root) / 'osm-current.json'
            checked = []
            def verify(value):
                checked.append(value)
                if value is not None:
                    raise RuntimeError('unhealthy')
            with self.assertRaises(RuntimeError):
                imports.activate_generation(pointer, {'generation': 'new'}, lambda: None, verify)
            self.assertFalse(pointer.exists())
            self.assertEqual(checked, ['new', None])

    def test_concurrent_job_cannot_enter_and_lock_releases(self):
        with tempfile.TemporaryDirectory() as root:
            lock = Path(root) / 'test.lock'
            with imports.job_lock(lock):
                with self.assertRaises(OSError):
                    with imports.job_lock(lock):
                        self.fail('second import entered')
            with imports.job_lock(lock):
                pass

    def test_bad_download_checksum_never_returns_success(self):
        from io import BytesIO
        class Response(BytesIO):
            headers = {}
        with tempfile.TemporaryDirectory() as root:
            with patch.object(imports.urllib.request, 'urlopen', side_effect=[Response(b'0' * 32), Response(b'x' * 1024 ** 2)]):
                with self.assertRaisesRegex(ValueError, 'checksum'):
                    imports.download_pbf(Path(root) / 'source.osm.pbf')

    def test_empty_generation_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            imports.atomic_json(Path(root) / 'places.json', {'source': {}, 'places': []})
            with self.assertRaisesRegex(ValueError, 'Empty'):
                imports.validate_generation(Path(root), None)


if __name__ == '__main__':
    unittest.main()
