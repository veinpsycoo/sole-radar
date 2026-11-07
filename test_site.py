from datetime import datetime, timedelta, timezone
import json
import os
import re
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import public_app
import site_pages as pages


class SiteTests(unittest.TestCase):
    def test_live_quote_uses_catalog_url_and_verified_variant_stock(self):
        import live_quote
        from collector import SOURCES, beymen_rows
        source = next(s for s in SOURCES if s['id']=='beymen')
        product = dict(productId=17, displayName='Sneaker', brandName='Example', productUrl='/tr/p_example_17', actualPrice=499, actualPriceText='499 TL', isOutOfStock=False, firstLevelOfGoodType='AYAKKABI', secondLevelOfGoodType='AYAKKABI', sizeInfo='TR', sizes=[dict(sizeName='45',inStock=True)])
        row = next(beymen_rows(source,[product | {'productSubCategory':'AYAKKABI'}]))
        offer = {k:row[k] for k in ('sourceId','url')}
        current = product | {'actualPrice':299, 'actualPriceText':'299 TL'}
        with patch.object(live_quote.c,'fetch_once',return_value=json.dumps({'success':True,'result':current})):
            self.assertEqual(live_quote.quote(row, offer)['variants'][0]['price'],29900)
        with patch.object(live_quote.c,'fetch_once',return_value=json.dumps({'success':True,'result':current | {'isOutOfStock':True}})):
            self.assertEqual(live_quote.quote(row, offer)['variants'],[])
        with patch.object(live_quote.c,'fetch_once') as fetch:
            with self.assertRaises(ValueError):
                live_quote.quote(row,offer | {'url':'https://other.test/tr/p_example_17'})
            fetch.assert_not_called()

    def test_selectable_sizes_are_adult_eu_and_fraction_labels_match(self):
        for value, expected in [('44,5','44.5'), ('36⅔','36 ⅔'), ('35','35'), ('50','50'), ('50.5',''), ('34',''), ('S',''), ('One Size',''), ('12 Ay',''), ('US 8',''), ('','')]:
            self.assertEqual(pages.shoe_size(value), expected, value)

    def setUp(self):
        self.env = patch.dict(os.environ, {'SITE_URL': 'https://example.test'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.now = datetime.now(timezone.utc)
        self.offer = {'sourceId': 'newbalance', 'url': 'https://www.newbalance.com.tr/test', 'checkedAt': self.now.isoformat(), 'variants': [{'size': '42', 'price': 129999, 'available': True}]}
        self.data = {'products': [], 'sources': [{'id': 'newbalance', 'status': 'ok'}], 'generatedAt': self.now.isoformat()}

    def call(self, path='/', method='GET', host='example.test'):
        result = {}
        def start(status, headers):
            result.update(status=int(status[:3]), headers=dict(headers))
        result['body'] = b''.join(public_app.application({'HTTP_HOST': host, 'PATH_INFO': path, 'REQUEST_METHOD': method}, start))
        return result

    def test_freshness_and_stock_boundary(self):
        product = {'offers': [self.offer]}
        self.assertEqual(pages.fresh_offers(product, self.data, self.now)[0]['price'], 129999)
        for seconds in (86400, 86401, -301):
            self.offer['checkedAt'] = (self.now-timedelta(seconds=seconds)).isoformat()
            self.assertEqual(pages.fresh_offers(product, self.data, self.now), [])
        self.offer['checkedAt'] = self.now.isoformat()
        self.offer['variants'][0]['available'] = False
        self.assertEqual(pages.fresh_offers(product, self.data, self.now), [])

    def test_untrusted_offer_and_failed_source_are_excluded(self):
        for url in ('javascript:alert(1)', 'https://evil.example/fake'):
            self.offer['url'] = url
            self.assertEqual(pages.fresh_offers({'offers': [self.offer]}, self.data, self.now), [])
        self.offer['url'] = 'https://www.newbalance.com.tr/test'
        self.data['sources'][0]['status'] = 'error'
        self.assertEqual(pages.fresh_offers({'offers': [self.offer]}, self.data, self.now), [])

    def test_money_and_schema_escaping(self):
        self.assertEqual(pages.money(129999), '1.299,99 ₺')
        self.assertEqual(pages.stamp('2026-11-06T22:41:42.770416+00:00'), '07.11.2026 01:41 TSİ')
        self.assertEqual(pages.stamp('2026-11-06T22:41:42+03:00'), '06.11.2026 22:41 TSİ')
        self.assertEqual(pages.stamp('<script>'), 'Tarih doğrulanamadı')
        self.assertEqual(pages.stamp('2026-11-06T22:41:42'), 'Tarih doğrulanamadı')
        meta = pages.metadata('"<title>', '<desc>', '/', {'name': '</script><script>alert(1)</script>'})
        self.assertNotIn('</script><script>', meta)
        schema = re.search(r'application/ld\+json">(.*?)</script>', meta).group(1)
        self.assertEqual(json.loads(schema)['name'], '</script><script>alert(1)</script>')

    def test_blog_is_server_rendered_and_canonical(self):
        for article in pages.ARTICLES:
            r = self.call('/blog/' + article['slug'] + '/')
            self.assertEqual(r['status'], 200)
            html = r['body'].decode()
            self.assertIn(article['sections'][0]['text'], html)
            self.assertIn('rel="canonical"', html)
            self.assertIn("'sha256-", r['headers']['Content-Security-Policy'])
            self.assertNotIn('unsafe-inline', r['headers']['Content-Security-Policy'])

    def test_production_is_read_only_and_does_not_expose_files(self):
        self.assertEqual(self.call('/api/refresh', 'POST')['status'], 405)
        self.assertEqual(self.call('/', host='attacker.test')['status'], 403)
        for path in ('/.env', '/collector.py', '/vendor/../../server.py', '/unknown'):
            self.assertEqual(self.call(path)['status'], 404)
        self.assertEqual(self.call('/blog/', 'HEAD')['body'], b'')
        self.assertTrue(json.loads(self.call('/api/status')['body'])['readOnly'])

    def test_preview_is_not_indexed_and_sitemap_is_valid(self):
        with patch.dict(os.environ, {'SITE_URL': ''}):
            self.assertIn('Disallow: /', pages.resolve('/robots.txt')[1])
            self.assertIn('noindex,follow', pages.homepage())
        ET.fromstring(pages.resolve('/sitemap.xml')[1])
        self.assertIn('https://example.test/sitemap.xml', pages.resolve('/robots.txt')[1])

    def test_preview_share_card_does_not_enable_indexing(self):
        with patch.dict(os.environ, {'SITE_URL': '', 'PREVIEW_HOST':'sole-radar-preview.vercel.app'}):
            html = pages.homepage()
        self.assertIn('https://sole-radar-preview.vercel.app/vendor/social-card.png', html)
        self.assertIn('summary_large_image', html)
        self.assertIn('noindex,follow', html)
        self.assertNotIn('rel="canonical"', html)

    def test_pagination_rejects_invalid_numbers(self):
        for query in ('page=0', 'page=-1', 'page=not-a-number', 'page=999999'):
            self.assertEqual(pages.resolve('/modeller/', query)[0], 404)

    def test_product_schema_matches_current_visible_prices(self):
        p = {'id': 'a'*20, 'name': '<Shoe>', 'brand': 'Brand', 'image': 'https://example.test/image.jpg', 'offers': [self.offer]}
        self.data['products'] = [p]
        with patch.object(pages, 'catalog', return_value=self.data):
            status, html, _ = pages.resolve('/urun/' + p['id'] + '/')
        self.assertEqual(status, 200)
        self.assertIn('&lt;Shoe&gt;', html)
        self.assertIn('1.299,99 ₺', html)
        self.assertIn('"lowPrice": "1299.99"', html)
        self.assertIn('noindex,follow', html)  # Single-store pages aren't SEO comparison pages.

    def test_three_sizes_use_cheapest_matching_stock_and_preserve_selection(self):
        self.offer['variants'] = [
            {'size': '42', 'price': 100, 'available': True},
            {'size': '44.5', 'price': 90000, 'available': True},
            {'size': '45', 'price': 70000, 'available': True},
            {'size': '45', 'price': 200, 'available': False},
        ]
        p = {'id': 'a'*20, 'name': 'Shoe', 'brand': 'Brand', 'image': '', 'offers': [self.offer]}
        self.data['products'] = [p]
        with patch.object(pages, 'catalog', return_value=self.data):
            html = pages.resolve('/urun/' + p['id'] + '/', 'beden=44%2C5&beden=45&beden=46&beden=42')[1]
        self.assertIn('value="44.5" checked', html)
        self.assertIn('value="45" checked', html)
        self.assertIn('value="46" checked', html)
        self.assertNotIn('İkinci numara', html)
        self.assertIn('"lowPrice": "700.00"', html)
        self.assertIn('"highPrice": "900.00"', html)
        self.assertNotIn('<li>42 ', html)
        self.assertNotIn('2,00 ₺', html)
        self.assertEqual(len(self.offer['variants']), 4)

    def test_selected_size_controls_visible_and_schema_prices(self):
        self.offer['variants'].append({'size': '41', 'price': 99999, 'available': True})
        p = {'id': 'a'*20, 'name': 'Shoe', 'brand': 'Brand', 'image': '', 'offers': [self.offer]}
        self.data['products'] = [p]
        with patch.object(pages, 'catalog', return_value=self.data):
            html = pages.resolve('/urun/' + p['id'] + '/', 'beden=42')[1]
            missing = pages.resolve('/urun/' + p['id'] + '/', 'beden=%3Ctest%3E')[1]
        self.assertIn('value="42" checked', html)
        self.assertIn('"lowPrice": "1299.99"', html)
        self.assertNotIn('999,99', html)
        self.assertIn('noindex,follow', html)
        self.assertNotIn('value="&lt;test&gt;"', missing)
        self.assertNotIn('<test>', missing)
        self.assertNotIn('AggregateOffer', missing)
        self.assertEqual(len(self.offer['variants']), 2)


if __name__ == '__main__':
    unittest.main()
