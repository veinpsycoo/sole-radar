from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch
import worker


class WorkerTests(unittest.TestCase):
    def test_once_records_failure_and_stops(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(worker, 'CATALOG', Path(folder) / 'catalog.json'), patch.object(worker, 'refresh', side_effect=ValueError('test failure')) as refresh, patch.object(worker.signal, 'signal'):
            worker.run(once=True)
            state = json.loads((Path(folder) / 'worker-status.json').read_text(encoding='utf-8'))
            self.assertFalse(state['running'])
            self.assertIn('ValueError', state['error'])
            refresh.assert_called_once_with(limit=0)

    def test_publishes_only_usable_catalog_and_records_publication_failure(self):
        for products, fails in [([], False), ([{'id':'test'}], False), ([{'id':'test'}], True)]:
            with self.subTest(products=bool(products), fails=fails), tempfile.TemporaryDirectory() as folder, patch.object(worker,'CATALOG',Path(folder)/'catalog.json'), patch.object(worker.signal,'signal'), patch.object(worker,'refresh',return_value={'generatedAt':'test','sources':[{'id':'test','status':'ok'}],'products':products}), patch.object(worker,'publish',side_effect=RuntimeError('publish failed') if fails else None) as publish:
                ok = worker.run(once=True, publish_after_refresh=True)
                state = json.loads((Path(folder)/'worker-status.json').read_text())
                self.assertEqual(ok, bool(products) and not fails)
                self.assertEqual(publish.call_count, int(bool(products)))
                self.assertEqual('publishedAt' in state, bool(products) and not fails)


if __name__ == '__main__':
    unittest.main()
