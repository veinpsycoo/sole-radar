import unittest
from export_ghpages import fix


class StaticExportTests(unittest.TestCase):
    def test_relative_site_paths_api_and_pagination(self):
        self.assertEqual(fix('href="/modeller/?page=2"'), 'href="/sole-radar/modeller/page/2/"')
        self.assertEqual(fix('href="/urun/example/?beden=44.5&beden=45"'), 'href="/sole-radar/urun/example/?beden=44.5&beden=45"')
        self.assertEqual(fix("fetch('/api/catalog')"), "fetch('/sole-radar/api/catalog.json')")
        self.assertEqual(fix("fetch('/api/status')"), "fetch('/sole-radar/api/status.json')")
        self.assertEqual(fix('href="https://store.example/x"'), 'href="https://store.example/x"')


if __name__ == '__main__':
    unittest.main()
