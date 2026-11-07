import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import collector as c
from server import App


def source(sid):
    return next(s for s in c.SOURCES if s['id'] == sid)


class CollectorTests(unittest.TestCase):
    def beymen_product(self):
        return {'productId': 123, 'displayName': 'XT-6 Sneaker', 'brandName': 'Salomon', 'variant': 'Gri',
                'productUrl': '/tr/p_salomon-xt-6_123', 'productSubCategory': 'AYAKKABI', 'isOutOfStock': False,
                'actualPrice': 11195, 'actualPriceText': '11.195 TL', 'promotedOrActualPrice': 8956,
                'sizeSystem': 'TR', 'images': ['https://cdn.beymen.com/mnresize/{width}/{height}/shoe.jpg'],
                'sizes': [{'sizeName': '44,5', 'inStock': True}, {'sizeName': '45', 'inStock': False},
                          {'sizeName': '44 2/3', 'inStock': True}, {'sizeName': '46', 'inStock': 'true'}]}

    def test_beymen_actual_price_checked_sizes_and_fraction_not_campaign(self):
        p = self.beymen_product()
        row = list(c.beymen_rows(source('beymen'), [p]))[0]
        self.assertEqual(row['variants'], [{'size': '44.5', 'price': 1119500, 'available': True},
                                           {'size': '44 ⅔', 'price': 1119500, 'available': True}])
        self.assertEqual(row['brand'], 'SALOMON')
        self.assertEqual(row['code'], '')
        self.assertIn('/480/640/', row['image'])
        p['sizeSystem'] = 'US'
        self.assertEqual(list(c.beymen_rows(source('beymen'), [p]))[0]['variants'][0]['size'], 'US 44.5')

    def test_beymen_rejects_unknown_stock_currency_mismatch_and_bags(self):
        for changes in ({'actualPriceText': '11.195 USD'}, {'actualPrice': 8956}, {'isOutOfStock': True},
                        {'isOutOfStock': None}, {'sizes': []}, {'productSubCategory': 'ÇANTA'},
                        {'displayName': 'Ayakkabı bakım seti'}, {'isPreOwned': True}, {'productUrl': 'https://evil.example/shoe'}):
            with self.subTest(changes=changes):
                self.assertEqual(list(c.beymen_rows(source('beymen'), [self.beymen_product() | changes])), [])

    def test_beymen_pagination_collects_each_page_and_fails_repeated_page(self):
        src = source('beymen') | {'paths': ['/tr/erkek-ayakkabi-10011']}
        def page(number):
            p = self.beymen_product() | {'productId': number, 'productUrl': f'/tr/p_shoe_{number}'}
            return 'BEYMEN.productListMain = ' + json.dumps({'currentPage': number, 'totalPage': 2, 'products': [p]}) + ';'
        with patch.object(c, 'get', side_effect=[page(1), page(2)]) as get, patch.object(c.time, 'sleep'):
            result = c.collect_source(src, limit=0)
        self.assertEqual((result['status'], result['count'], result['requests']), ('ok', 2, 2))
        self.assertTrue(get.call_args_list[1].args[0].endswith('?sayfa=2'))
        with patch.object(c, 'get', side_effect=[page(1), page(1)]), patch.object(c.time, 'sleep'):
            failed = c.collect_source(src, limit=0)
        self.assertEqual(failed['status'], 'partial')
        self.assertEqual(failed['errorCount'], 1)

    def test_money_rounds_decimal_and_rejects_invalid(self):
        self.assertEqual(c.money('5899.00003'), 589900)
        self.assertEqual(c.money('10.005'), 1001)
        for bad in ['NaN', 'Infinity', 0, -1, None, '1.000,50']:
            self.assertIsNone(c.money(bad))

    def test_non_shoes_are_not_catalogued(self):
        for name in ['Clima Bottle', 'Urban Bottle', 'Ayakkabı bakım seti', 'Sneaker çorap', 'Botanik poster', 'Books New Shoes: Contemporary Footwear Design', 'Ayakkabı çanta', 'Ayakkabı bağcık seti', 'Ayakkabı bağcıkları']:
            self.assertFalse(c.footwear(name), name)
        for name in ['Kadın Bot', 'Outdoor Ayakkabı', 'Sandalet', 'Sneaker', 'Krampon', 'Bağcıklı Erkek Ayakkabı']:
            self.assertTrue(c.footwear(name), name)

    def test_codes_preserve_colors(self):
        self.assertEqual(c.style_code('ASICS', '1011C080-020-10'), '1011C080-020')
        self.assertNotEqual(c.style_code('ASICS', '1011C080-020'), c.style_code('ASICS', '1011C080-001'))
        self.assertEqual(c.style_code('PUMA', '313625_01'), '313625-01')
        self.assertEqual(c.style_code('NEW BALANCE', 'U204L5YB-42', '42'), 'U204L5YB')
        self.assertEqual(c.style_code('Unknown', '123'), '')
        self.assertEqual(c.style_code('NEW BALANCE', '530'), '')

    def test_untrusted_urls(self):
        for value in ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com']:
            self.assertEqual(c.safe_url(value), '')
        self.assertEqual(c.safe_url('//evil.test/x', source('asics')['url'], True), '')
        self.assertEqual(c.safe_url('/x', source('asics')['url'], True), 'https://www.asics.com.tr/x')
        with self.assertRaises(ValueError):
            c.get('http://127.0.0.1/private')
        with self.assertRaises(ValueError):
            c.RetailRedirect().redirect_request(Request(source('asics')['url']),None,302,'',{},'http://127.0.0.1/private')

    def test_merge_only_exact_full_codes(self):
        def row(sid, code):
            return c.product(source(sid), 'local', 'Same name', 'ASICS', 'Blue', '', '/x', [{'size':'42','price':50000,'available':True}], code)
        a, b, different = row('asics','1011C080-020'), row('vitruta','1011C080-020-42'), row('spx','1011C080-001')
        catalog = c.assemble([{'id':'asics','rows':[a]}, {'id':'vitruta','rows':[b]}, {'id':'spx','rows':[different]}])
        self.assertEqual(len(catalog['products']),2)
        self.assertEqual(len(catalog['products'][0]['offers']),2)
        self.assertNotEqual(row('spx','')['id'], row('asics','')['id'])

    def test_unknown_stock_is_never_active(self):
        p=c.product(source('asics'),'1','Shoe','ASICS','','','/x',[{'size':'42','price':100,'available':None}])
        self.assertIsNone(p)

    def test_shopify_colors_sizes_and_out_of_stock(self):
        p={'id':1,'title':'Ayakkabı','product_type':'Sneaker','vendor':'ASICS','handle':'shoe',
           'options':[{'name':'Renk'},{'name':'Beden'}], 'images':[], 'variants':[
               {'sku':'1011C080-001-42','option1':'Black','option2':'42','price':'100.50','available':True},
               {'sku':'1011C080-001-43','option1':'Black','option2':'43','price':'100.50','available':False},
               {'sku':'1011C080-020-42','option1':'Blue','option2':'42','price':'110','available':True}]}
        rows=list(c.shopify_rows(source('vitruta'),[p]))
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[0]['variants'],[{'size':'42','price':10050,'available':True}])
        self.assertNotEqual(rows[0]['id'],rows[1]['id'])

    def test_ticimax_vat_discount_and_stock(self):
        p={'productCurrency':'TRY','productActive':True,'productName':'Koşu Ayakkabısı','brandName':'ASICS','productId':1,'stockCode':'1011C080-020-10',
           'productVariantData':[{'urunID':2,'tanim':'42','ekSecenekTipiTanim':'Beden'}],
           'products':[{'id':2,'aktif':True,'stokAdedi':2,'satisFiyati':100,'satisKDV':10,'indirimliFiyati':80,'indirimliKDV':8}], 'productImages':[]}
        row=c.ticimax_row(source('asics'),'var productDetailModel = '+json.dumps(p),source('asics')['url']+'/x')
        self.assertEqual(row['variants'],[{'size':'42','price':8800,'available':True}])
        p['products'][0]['stokAdedi']=0
        self.assertIsNone(c.ticimax_row(source('asics'),'var productDetailModel = '+json.dumps(p),source('asics')['url']+'/x'))

    def test_product_stock_does_not_invent_size(self):
        p={'@type':'Product','name':'Asics Ayakkabı','image':[],'offers':{'priceCurrency':'TRY','price':100,'availability':'https://schema.org/InStock'}}
        row=c.ld_row(source('spx'),'<script type="application/ld+json">'+json.dumps(p)+'</script>',source('spx')['url']+'/x')
        self.assertEqual(row['variants'][0]['size'],'')

    def test_spx_uses_visible_brand_not_first_word_or_store(self):
        p={'@type':'Product','name':'GO RUN CONSISTENT','brand':{'name':'SPX'},'image':[],'offers':{'priceCurrency':'TRY','price':100,'availability':'https://schema.org/InStock'}}
        html='<a class="product__brand" href="/markalar/skechers/">SKECHERS</a><script type="application/ld+json">'+json.dumps(p)+'</script>'
        row=c.ld_row(source('spx'),html,source('spx')['url']+'/x')
        self.assertEqual(row['brand'],'SKECHERS')

    def test_newbalance_barcode_size_mapping(self):
        p={'id':1,'categories':[{'name':'Ayakkabı'}],'stocksByBarcode':{'10':0,'11':2},'barcodes':[{'id':10,'stockTypeValues':[{'name':'42'}]},{'id':11,'stockTypeValues':[{'name':'43'}]}],
           'salesPrice':100,'name':'NB','brand':{'name':'New Balance'},'routePath':'shoe','sku':'U204L5YB'}
        row=list(c.nb_rows(source('newbalance'),[p]))[0]
        self.assertEqual([v['size'] for v in row['variants']],['43'])

    def test_reebok_uses_visible_discount_not_old_schema_price(self):
        p={'sku':'123','name':'Shoe','image':['https://example.com/a.jpg'],'offers':{'priceCurrency':'TRY','price':'3999.99'}}
        html='<script>document.querySelector("#productDetailSchema").textContent=JSON.stringify('+json.dumps(p)+')</script><aside class="js-product-price" data-price="2499"></aside><input name="sizeSelection" value="42" data-is-in-stock="true"><input name="sizeSelection" value="43" data-is-in-stock="false">'
        row=c.reebok_row(source('reebok'),html,source('reebok')['url']+'/x')
        self.assertEqual(row['variants'],[{'size':'42','price':249900,'available':True}])

    def test_storefront_trailing_commas_preserve_quoted_text(self):
        self.assertEqual(c.json_object('{"text":"line one\nline two",}'), {'text':'line one\nline two'})
        self.assertEqual(c.json_object('{"text":"a,} and \\"quoted\\"", "items":[1,2,],} ); malicious()'),
                         {'text':'a,} and "quoted"','items':[1,2]})
        with self.assertRaises(ValueError):c.json_object('{"bad":')

    def test_transient_timeout_retries_once(self):
        with patch.object(c,'fetch_once',side_effect=[TimeoutError(), 'ok']) as fetch,patch.object(c.time,'sleep'):
            self.assertEqual(c.get(source('asics')['url']),'ok')
            self.assertEqual(fetch.call_count,2)

    def test_puma_variant_specific_price_and_stock(self):
        schema={'@type':'Product','sku':'313625_01','name':'Shoe','image':'https://example.com/x.jpg','offers':{'priceCurrency':'TRY'}}
        config={'attributes':{'1':{'code':'size','options':[{'label':'42','products':['p'],'out_of_stock':[]},{'label':'43','products':[],'out_of_stock':['q']}]}},'optionPrices':{'p':{'finalPrice':{'amount':99}}}}
        html='<script type="application/ld+json">'+json.dumps(schema)+'</script><script type="text/x-magento-init">'+json.dumps({'#product_addtocart_form':{'configurable':{'spConfig':config}}})+'</script>'
        row=c.puma_row(source('puma'),html,source('puma')['url']+'/x')
        self.assertEqual(row['variants'],[{'size':'42','price':9900,'available':True}])

    def test_sneaksup_uses_one_based_page_query(self):
        urls=[]
        def fetch(url):
            urls.append(url)
            page=1 if 'pageIndex=1' in url else 2
            p={'variantId':page,'productName':'Shoe','brandName':'NIKE','categories':[{'name':'AYAKKABI'}],'price':{'currencyCode':'TRY'},'slug':str(page),'variants':[{'specName':'size','specValueName':'42','newPrice':100,'quantity':1}]}
            response={'productList':{'products':{'data':[p],'totalPages':2}}}
            return '<script id="__NEXT_DATA__">'+json.dumps({'props':{'pageProps':response}})+'</script>'
        with patch.object(c,'get',side_effect=fetch),patch.object(c.time,'sleep'):
            result=c.collect_source(source('sneaksup')|{'paths':['/erkek-ayakkabi']},0)
        self.assertEqual(result['status'],'ok')
        self.assertEqual(result['count'],2)
        self.assertTrue(urls[0].endswith('pageIndex=1'))
        self.assertTrue(urls[1].endswith('pageIndex=2'))

    def test_failed_source_does_not_publish_old_offers(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(c,'CATALOG',Path(directory)/'catalog.json'):
            c.CATALOG.write_text(json.dumps({'products':[{'id':'old'}],'sources':[]}))
            with patch.object(c,'collect_source',return_value={'id':'vitruta','name':'Vitruta','status':'error','count':0,'rows':[]}):
                result=c.refresh(1,only=['vitruta'])
            self.assertEqual(result['products'],[])
            self.assertTrue((Path(directory)/'catalog.previous.json').exists())
            self.assertFalse((Path(directory)/'refresh.lock').exists())

    def test_overlapping_categories_still_visit_later_pages(self):
        s=source('spx')|{'paths':['/men','/women']}
        schema={'@type':'Product','name':'Shoe','offers':{'priceCurrency':'TRY','price':100,'availability':'https://schema.org/InStock'}}
        def fetch(url):
            if '/item-' in url:return '<script type="application/ld+json">'+json.dumps(schema)+'</script>'
            if '/men?' in url:return '<a class="js-product-link" href="/item-a">A</a>'
            if 'page=1' in url:return '<a class="js-product-link" href="/item-a">A</a><a href="?page=2">Next</a>'
            return '<a class="js-product-link" href="/item-b">B</a>'
        with patch.object(c,'get',side_effect=fetch),patch.object(c.time,'sleep'):
            result=c.collect_source(s,0)
        self.assertEqual(result['count'],2)
        self.assertEqual(result['status'],'ok')

    def test_concurrent_process_lock_preserves_catalog(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(c,'CATALOG',Path(directory)/'catalog.json'):
            lock=Path(directory)/'refresh.lock';lock.write_text('other-process')
            with self.assertRaises(RuntimeError):c.refresh()
            self.assertEqual(lock.read_text(),'other-process')
            self.assertFalse(c.RUN_LOCK.locked())


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory=tempfile.TemporaryDirectory()
        cls.catalog=Path(cls.directory.name)/'catalog.json'
        cls.catalog_patch=patch('server.CATALOG',cls.catalog);cls.catalog_patch.start()
        cls.app=App(0,1)
        cls.thread=threading.Thread(target=cls.app.serve_forever,daemon=True);cls.thread.start()
        cls.base='http://127.0.0.1:'+str(cls.app.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.app.shutdown();cls.app.server_close();cls.thread.join()
        cls.catalog_patch.stop();cls.directory.cleanup()

    def test_external_refresh_is_visible_and_blocks_duplicate(self):
        lock=self.catalog.parent/'refresh.lock'
        lock.write_text('external-process')
        try:
            with urlopen(self.base+'/api/status') as response:
                self.assertTrue(json.load(response)['running'])
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(self.base+'/api/refresh',data=b'{}',headers={'Content-Type':'application/json'}))
            self.assertEqual(error.exception.code,409)
            error.exception.close()
        finally:
            lock.unlink()

    def test_private_files_and_unknown_paths_are_not_served(self):
        for path in ['/collector.py','/data/catalog.previous.json','/../server.py']:
            with self.assertRaises(HTTPError) as error:urlopen(self.base+path)
            self.assertEqual(error.exception.code,404)
            error.exception.close()

    def test_external_origin_and_host_cannot_refresh(self):
        for headers in [{'Origin':'https://evil.test','Content-Type':'application/json'},{'Host':'evil.test','Content-Type':'application/json'},{'Content-Type':'text/plain'}]:
            with self.assertRaises(HTTPError) as error:urlopen(Request(self.base+'/api/refresh',data=b'{}',headers=headers))
            self.assertEqual(error.exception.code,403)
            error.exception.close()
        self.assertFalse(self.app.state['running'])

    def test_refresh_endpoint_starts_one_job(self):
        with patch.object(self.app,'update') as update:
            request=Request(self.base+'/api/refresh',data=b'{}',headers={'Content-Type':'application/json'})
            with urlopen(request) as response:self.assertEqual(response.status,202)
            with self.assertRaises(HTTPError) as error:urlopen(request)
            self.assertEqual(error.exception.code,409)
            error.exception.close()
            self.assertEqual(update.call_count,1)
            self.app.state['running']=False


if __name__=='__main__':
    unittest.main()
