"""Recheck a catalog offer against its retailer; clients cannot supply URLs."""
import json
import re
from decimal import Decimal
from urllib.parse import urlsplit

import collector as c


def quote(product, offer):
    source = next(s for s in c.SOURCES if s['id'] == offer['sourceId']) | {'live_check': True}
    url = c.safe_url(offer['url'], source['url'], same_host=True)
    if not url or urlsplit(url).port not in (None, 443):
        raise ValueError('Geçersiz mağaza adresi')
    kind = source['kind']
    if kind == 'beymen':
        number = re.fullmatch(r'/tr/p_[^/]+_(\d+)', urlsplit(url).path)
        if not number:
            raise ValueError('Ürün adresi tanınmadı')
        summary = json.loads(c.fetch_once(source['url'] + '/sf-api/api/product/' + number[1] + '/productsummary', timeout=7, body=b'{}'))
        p = summary['result']
        if summary.get('success') is not True or str(p['productId']) != number[1]:
            raise ValueError('Ürün doğrulanamadı')
        rows = c.beymen_rows(source, [p | {'sizeSystem': p['sizeInfo'], 'productSubCategory': p['secondLevelOfGoodType'], 'producMainCategory': p['firstLevelOfGoodType'], 'sizes': [] if p['isOutOfStock'] else p['sizes']}])
    elif kind == 'shopify':
        p = json.loads(c.fetch_once(url.split('?')[0] + '.js', timeout=7))
        # Shopify Ajax prices are integer minor units, unlike the catalog feed.
        for v in p['variants']:
            if type(v['price']) is not int:
                raise ValueError('Beklenmeyen fiyat biçimi')
            v.update(price=Decimal(v['price'])/100, featured_image=None)
        rows = c.shopify_rows(source, [p | {'images': [], 'product_type': p['type']}])
    elif kind in ('nb', 'su'):
        text = c.fetch_once(url, timeout=7)
        block = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', text, re.S)
        if not block:
            raise ValueError('Mağaza yanıtı tanınmadı')
        props = json.loads(block[1])['props']['pageProps']
        rows = c.nb_rows(source, [props['data']['response']['product']]) if kind == 'nb' else c.su_rows(source, [props['product']])
    else:
        reader = {'ticimax': c.ticimax_row, 'puma': c.puma_row, 'reebok': c.reebok_row}.get(kind)
        if reader is None:
            raise ValueError('Mağazada numara doğrulanamıyor')
        rows = [reader(source, c.fetch_once(url, timeout=7), url)]
    row = next((r for r in rows if r and r['id'] == product['id'] and r['url'] == url), None)
    if row is None:
        raise ValueError('Güncel ürün eşleşmedi')
    return {k: row[k] for k in ('id', 'sourceId', 'url', 'variants', 'checkedAt')}
