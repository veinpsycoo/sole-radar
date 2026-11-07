"""Public storefront readers. Run: python collector.py --limit 120 (0 = no product cap)."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from html import unescape
from html.parser import HTMLParser
import hashlib
import json
import os
from pathlib import Path
import re
import threading
import time
import refresh_guard
from urllib.parse import urljoin, urlsplit
from urllib.error import URLError, HTTPError
from urllib.request import Request, HTTPRedirectHandler, build_opener

ROOT = Path(__file__).resolve().parent
CATALOG = ROOT / 'data' / 'catalog.json'
SOURCES = [
    dict(id='vitruta', name='Vitruta', url='https://www.vitruta.com', kind='shopify', paths=[]),
    dict(id='merrell', name='Merrell Türkiye', url='https://www.merrell.com.tr', kind='shopify', paths=[]),
    dict(id='newbalance', name='New Balance Türkiye', url='https://www.newbalance.com.tr', kind='nb', paths=['/erkek-spor-ayakkabi', '/kadin-spor-ayakkabi', '/cocuk-ayakkabi']),
    dict(id='sneaksup', name='Sneaks Up', url='https://www.sneaksup.com', kind='su', paths=['/erkek-ayakkabi', '/kadin-ayakkabi', '/cocuk-ayakkabi']),
    dict(id='asics', name='ASICS Türkiye', url='https://www.asics.com.tr', kind='ticimax', paths=['/erkek-ayakkabilar', '/kadin-ayakkabilar', '/cocuk-ayakkabilar']),
    dict(id='salomon', name='Salomon Türkiye', url='https://www.salomon.com.tr', kind='ticimax', paths=['/erkek-ayakkabi', '/kadin-ayakkabi', '/cocuk-ayakkabi']),
    dict(id='spx', name='SPX', url='https://www.spx.com.tr', kind='ld', paths=['/erkek-ayakkabi/', '/kadin/ayakkabi/', '/cocuk/ayakkabi/']),
    dict(id='converse', name='Converse Türkiye', url='https://www.converse.com.tr', kind='ld', paths=['/erkek-ayakkabi/', '/kadin-ayakkabi/', '/cocuk-ayakkabi/']),
    dict(id='puma', name='Puma Türkiye', url='https://tr.puma.com', kind='puma', paths=['/erkek/ayakkabi.html', '/kadin/ayakkabi.html', '/cocuk/erkek-cocuk/ayakkabi.html', '/cocuk/kiz-cocuk/ayakkabi.html']),
    dict(id='reebok', name='Reebok Türkiye', url='https://www.reebok.com.tr', kind='reebok', paths=['/ayakkabi']),
    dict(id='beymen', name='Beymen', url='https://www.beymen.com', kind='beymen', paths=['/tr/erkek-ayakkabi-10011', '/tr/kadin-ayakkabi-10018', '/tr/kids-ayakkabi-canta-94269']),
]
RUN_LOCK = threading.Lock()


class RetailRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        allowed = {urlsplit(s['url']).hostname for s in SOURCES}
        if urlsplit(newurl).scheme != 'https' or urlsplit(newurl).hostname not in allowed:
            raise ValueError('Beklenmeyen yönlendirme')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def now():
    return datetime.now(timezone.utc).isoformat()


def money(value):
    try:
        number = Decimal(str(value))
        if not number.is_finite() or number <= 0 or number > 10000000:
            return None
        return int((number * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError, TypeError):
        return None


def safe_url(value, base='', same_host=False):
    value = urljoin(base, str(value or ''))
    p = urlsplit(value)
    if p.scheme != 'https' or not p.hostname or p.username or p.password:
        return ''
    if same_host and p.hostname != urlsplit(base).hostname:
        return ''
    return value


def get(url):
    for attempt in range(2):
        try:
            return fetch_once(url)
        except HTTPError:
            raise
        except (TimeoutError, URLError):
            if attempt:
                raise
            time.sleep(1)


def fetch_once(url):
    # Only fixed, public retailer origins are requested; redirect destinations are checked too.
    allowed = {urlsplit(s['url']).hostname for s in SOURCES}
    if urlsplit(url).hostname not in allowed or urlsplit(url).scheme != 'https':
        raise ValueError('Kaynak adresi izinli değil')
    request = Request(url, headers={'User-Agent': 'SoleRadar/1.0 (personal price comparison)', 'Accept': 'text/html,application/json'})
    with build_opener(RetailRedirect()).open(request, timeout=25) as response:
        if urlsplit(response.url).hostname not in allowed:
            raise ValueError('Beklenmeyen yönlendirme')
        data = response.read(12000001)
        if len(data) > 12000000:
            raise ValueError('Yanıt boyutu sınırı aşıldı')
        return data.decode('utf-8-sig')


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.links, self.scripts, self.inputs, self.prices = [], [], [], []
        self.current = None
        self.product_brand, self.in_brand = '', False
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and attrs.get('href'):
            self.links.append(attrs)
            if 'product__brand' in attrs.get('class', '').split():
                self.in_brand = True
        if tag == 'input':
            self.inputs.append(attrs)
        if attrs.get('data-price') and 'js-product-price' in attrs.get('class', ''):
            self.prices.append(attrs['data-price'])
        if tag == 'script':
            self.current = [attrs, '']

    def handle_data(self, data):
        if self.in_brand:
            self.product_brand += data
        if self.current is not None:
            self.current[1] += data

    def handle_endtag(self, tag):
        if tag == 'a':
            self.in_brand = False
        if tag == 'script' and self.current is not None:
            self.scripts.append(self.current)
            self.current = None

    def next_data(self):
        for attrs, body in self.scripts:
            if attrs.get('id') == '__NEXT_DATA__':
                return json.loads(body)['props']['pageProps']
        raise ValueError('Beklenen ürün verisi bulunamadı')


def style_code(brand, sku, size=''):
    sku = str(sku or '').strip().upper()
    if size and sku.endswith('-' + str(size).upper()):
        sku = sku[:-(len(str(size)) + 1)]
    patterns = {
        'ASICS': r'(\d{4}[A-Z]\d{3})[-.](\d{3})(?:-|$)',
        'MERRELL': r'(J\d{6})(?:-|$)',
        'SALOMON': r'(L\d{8})(?:-|$)',
        'NEW BALANCE': r'([A-Z]{1,4}\d{2,5}[A-Z0-9]{1,6})$',
        'NIKE': r'([A-Z0-9]{6}-\d{3})(?:-|$)',
        'JORDAN': r'([A-Z0-9]{6}-\d{3})(?:-|$)',
        'ADIDAS': r'([A-Z]{1,2}\d{4,5})$',
        'CONVERSE': r'(A\d{5}[CF]|[A-Z]?\d{5,6}C)(?:-|$)',
        'PUMA': r'(\d{6})[_-](\d{2})(?:-|$)',
    }
    match = re.match(patterns.get(brand.upper(), r'(?!)'), sku)
    return '-'.join(match.groups()) if match else ''


def footwear(text):
    text = str(text).casefold()
    shoe = any(w in text for w in ['ayakkab', 'sneaker', 'sandalet', 'terlik', 'boots', 'shoes', 'footwear', 'krampon']) or re.search(r'\bbot(?:u|lar[ıi]?)?\b', text)
    return bool(shoe) and not any(w in text for w in ['bakım', 'temizleyici', 'çekeceği', 'corap', 'çorap']) and not re.search(r'\b(books?|kitap|kitabı|poster|çanta|bag|bağcık(?:lar[ıi]?)?)\b', text)


def product(source, local_id, name, brand, color, image, url, variants, sku='', size=''):
    brand = unescape(str(brand or 'Marka belirtilmedi')).strip().upper()
    brand = {'NEWBALANCE': 'NEW BALANCE', 'ADIDAS ORIGINALS': 'ADIDAS'}.get(brand, brand)
    variants = [v for v in variants if v['price'] and v.get('available') is True]
    if not variants:
        return None
    link = safe_url(url, source['url'], same_host=True)
    if not link:
        return None
    code = style_code(brand, sku, size)
    # shortcut: only verified brand code formats merge stores; add a tested format for other brands.
    key = brand + ':' + code if code else source['id'] + ':' + str(local_id)
    return dict(id=hashlib.sha256(key.encode()).hexdigest()[:20], name=unescape(str(name)), brand=brand,
                color=unescape(str(color or '')), code=code, image=safe_url(image), sourceId=source['id'],
                url=link, variants=variants, checkedAt=now())


def shopify_rows(source, entries):
    for p in entries:
        if not footwear(p.get('product_type', '') + ' ' + p.get('vendor', '') + ' ' + p['title']):
            continue
        options = p.get('options', [])
        size_i = next((i + 1 for i, o in enumerate(options) if any(w in o['name'].casefold() for w in ['beden', 'size', 'numara'])), None)
        color_i = next((i + 1 for i, o in enumerate(options) if o['name'].casefold() in ['renk', 'color', 'colour']), None)
        groups = {}
        for v in p['variants']:
            color = v.get('option' + str(color_i), '') if color_i else ''
            groups.setdefault(color, []).append(v)
        for color, values in groups.items():
            first = values[0]
            size = str(first.get('option' + str(size_i), '') or '') if size_i else ''
            variants = [dict(size=str(v.get('option' + str(size_i), '') or '') if size_i else '',
                             price=money(v['price']), available=v.get('available') is True) for v in values]
            img = (first.get('featured_image') or (p.get('images') or [{}])[0]).get('src', '')
            row = product(source, str(p['id']) + ':' + color, p['title'], p['vendor'], color, img,
                          '/products/' + p['handle'], variants, first.get('sku'), size)
            if row:
                yield row


def nb_rows(source, entries):
    for p in entries:
        if not footwear(' '.join(x['name'] for x in p.get('categories', []))):
            continue
        stocks = p.get('stocksByBarcode', {})
        variants = [dict(size=' / '.join(x['name'] for x in v.get('stockTypeValues', [])), price=money(p.get('salesPrice')),
                         available=stocks.get(str(v['id']), 0) > 0) for v in p.get('barcodes', [])]
        color = next((a['attributeValues'][0]['value'] for a in p.get('attributes', []) if a['attribute']['name'] == 'Renk' and a['attributeValues']), '')
        img = next((d['filePath'] for d in p.get('documents', []) if d['documentType'] == 'Image'), '')
        row = product(source, p['id'], p['name'], p['brand']['name'], color,
                      'https://newbalance.sm.mncdn.com/mnresize/640/-/' + img if img else '',
                      '/urun/' + p['routePath'], variants, p.get('sku'))
        if row:
            yield row


def su_rows(source, entries):
    for p in entries:
        if not footwear(' '.join(c['name'] for c in p.get('categories', []))):
            continue
        if p.get('price', {}).get('currencyCode') != 'TRY':
            continue
        variants = [dict(size=v['specValueName'], price=money(v.get('newPrice')), available=v.get('quantity', 0) > 0)
                    for v in p.get('variants', []) if v.get('specName') == 'size']
        color = next((v['specValueName'] for v in p.get('relatedVariants', []) if v.get('isSelected')), '')
        img = (p.get('pictures') or [{}])[0].get('url', '')
        row = product(source, p['variantId'], p['productName'], p['brandName'], color, img,
                      '/' + p['slug'], variants, p.get('erpCode'))
        if row:
            yield row


def ticimax_row(source, text, url):
    match = re.search(r'var productDetailModel\s*=\s*', text)
    if not match:
        raise ValueError('Ürün ayrıntı verisi bulunamadı')
    p = json.JSONDecoder().raw_decode(text[match.end():])[0]
    if p['productCurrency'] != 'TRY' or not p.get('productActive'):
        return None
    if not footwear(p['productName'] + ' ' + ' '.join(c.get('tanim', '') for c in p.get('breadCrumb', []))):
        return None
    sizes = {v['urunID']: v['tanim'] for v in p['productVariantData'] if v['ekSecenekTipiTanim'] == 'Beden'}
    color = next((v['tanim'] for v in p['productVariantData'] if v['ekSecenekTipiTanim'] == 'Renk'), '')
    variants = []
    for v in p['products']:
        # Ticimax exposes net price and VAT separately, including discounted prices.
        discounted = v.get('indirimliFiyati', 0) > 0
        amount = Decimal(str(v['indirimliFiyati' if discounted else 'satisFiyati'])) + Decimal(str(v['indirimliKDV' if discounted else 'satisKDV']))
        variants.append(dict(size=sizes.get(v['id'], ''), price=money(amount), available=v.get('aktif') is True and v.get('stokAdedi', 0) > 0))
    image = next((v['imagePath'] for v in p.get('productImages', []) if v.get('active') and v.get('imageType') == 1), '')
    return product(source, p['productId'], p['productName'], p['brandName'], color, image, url, variants, p['stockCode'])


def ld_row(source, text, url):
    parsed = Page(text)
    for attrs, body in parsed.scripts:
        if attrs.get('type') != 'application/ld+json':
            continue
        try:
            p = json.loads(body)
        except json.JSONDecodeError:
            continue
        if not isinstance(p, dict) or p.get('@type') != 'Product':
            continue
        offers = p.get('offers', {})
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        if offers.get('priceCurrency', '').upper() != 'TRY':
            return None
        schema_brand = p.get('brand', '')
        schema_brand = schema_brand.get('name', '') if isinstance(schema_brand, dict) else schema_brand
        brand = 'CONVERSE' if source['id'] == 'converse' else parsed.product_brand.strip() or (schema_brand if schema_brand != 'SPX' else '')
        image = p.get('image', [])
        image = image[0] if isinstance(image, list) and image else image
        # Aggregate stock is not evidence for any individual size.
        variants = [dict(size='', price=money(offers.get('price')), available=offers.get('availability', '').split('/')[-1] == 'InStock')]
        return product(source, urlsplit(url).path, p['name'], brand, '', image, url, variants)
    raise ValueError('Yapılandırılmış fiyat ve stok bulunamadı')


def puma_row(source, text, url):
    parsed = Page(text)
    schema, config = None, None
    for attrs, body in parsed.scripts:
        if attrs.get('type') == 'application/ld+json':
            candidate = json.loads(body)
            if candidate.get('@type') == 'Product':
                schema = candidate
        if attrs.get('type') == 'text/x-magento-init' and 'spConfig' in body:
            config = json.loads(body).get('#product_addtocart_form', {}).get('configurable', {}).get('spConfig')
    if not schema or not config:
        raise ValueError('Puma beden/fiyat verisi bulunamadı')
    if schema.get('offers', {}).get('priceCurrency') != 'TRY':
        return None
    variants = []
    for attribute in config['attributes'].values():
        if attribute['code'] == 'size':
            for size in attribute['options']:
                for pid in size['products']:
                    amount = config['optionPrices'].get(pid, {}).get('finalPrice', {}).get('amount')
                    variants.append(dict(size=size['label'], price=money(amount), available=pid not in size.get('out_of_stock', [])))
    return product(source, schema['sku'], schema['name'], 'PUMA', schema.get('color'), schema['image'], url, variants, schema['sku'])


def reebok_row(source, text, url):
    match = re.search(r"productDetailSchema.*?JSON.stringify\(\s*", text, re.S)
    if not match:
        raise ValueError('Reebok ürün verisi bulunamadı')
    schema = json_object(text[match.end():])
    parsed = Page(text)
    if schema.get('offers', {}).get('priceCurrency') != 'TRY' or not parsed.prices:
        return None
    # The JSON-LD has the old price; the visible product price includes the current discount.
    amount = money(parsed.prices[0])
    variants = [dict(size=v['value'], price=amount, available=v.get('data-is-in-stock') == 'true')
                for v in parsed.inputs if v.get('name') == 'sizeSelection' and v.get('value')]
    return product(source, schema['sku'], schema['name'], 'REEBOK', '', schema['image'][0], url, variants)


def json_object(text):
    """Parse a JS JSON object with trailing commas, never executing storefront code."""
    text = text.lstrip()
    if not text.startswith('{'):
        raise ValueError('Ürün nesnesi bulunamadı')
    result, depth, quoted, escaped = [], 0, False, False
    for i, char in enumerate(text):
        if quoted:
            result.append(char)
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                quoted = False
            continue
        if char == '"':
            quoted = True
        elif char in '{[':
            depth += 1
        elif char in '}]':
            depth -= 1
        elif char == ',' and text[i + 1:].lstrip().startswith(('}', ']')):
            continue
        result.append(char)
        if depth == 0:
            # Some storefront descriptions contain literal newlines inside quoted strings.
            return json.loads(''.join(result), strict=False)
    raise ValueError('Eksik ürün nesnesi')


def beymen_rows(source, entries):
    for p in entries:
        categories = ' '.join(str(p.get(key, '')) for key in ('productSubCategory', 'producMainCategory'))
        if 'ayakkab' not in categories.casefold() or not footwear('Ayakkabı ' + p.get('displayName', '')):
            continue
        if p.get('isOutOfStock') is not False or p.get('isPreOwned') is True:
            continue
        price = money(p.get('actualPrice'))
        display = str(p.get('actualPriceText', '')).strip()
        # Campaign prices can require buying multiple items; only the regular payable price is used.
        if not re.fullmatch(r'[\d.,]+\s+TL', display) or money(display[:-2].strip().replace('.', '').replace(',', '.')) != price:
            continue
        variants = []
        for v in p.get('sizes', []):
            if v.get('inStock') is not True or not isinstance(v.get('sizeName'), str):
                continue
            size = v['sizeName'].strip().replace(',', '.').replace(' 1/3', ' ⅓').replace(' 2/3', ' ⅔')
            size = re.sub(r'^(\d+) 1/2$', r'\1.5', size)
            if not size:
                continue
            system = str(p.get('sizeSystem') or '').upper()
            if system and system not in ('TR', 'EU', 'IT'):
                size = system + ' ' + size
            variants.append(dict(size=size, price=price, available=True))
        images = p.get('images') or []
        image = str(images[0]).replace('{width}', '480').replace('{height}', '640') if images else ''
        # Beymen IDs are not manufacturer style codes, so they must not merge unrelated store offers.
        row = product(source, p['productId'], p['displayName'], p.get('brandName'), p.get('variant'), image, p['productUrl'], variants)
        if row:
            yield row


def collect_source(source, limit=120, progress=None):
    rows, seen, errors = {}, set(), []
    complete, requests = True, 0
    def read(url):
        nonlocal requests
        requests += 1
        time.sleep(.12)
        return get(url)
    def add(entries):
        for row in entries:
            if row:
                rows[row['url'] + '|' + row['color']] = row
    try:
        if source['kind'] == 'shopify':
            if json.loads(read(source['url'] + '/cart.js')).get('currency') != 'TRY':
                raise ValueError('Mağaza para birimi TRY olarak doğrulanamadı')
            for page_no in range(1, 101):
                payload = json.loads(read(source['url'] + f'/products.json?limit=250&page={page_no}'))
                entries = payload['products']
                fingerprint = tuple(p['id'] for p in entries)
                if entries and fingerprint in seen:
                    raise ValueError('Katalog sayfalaması tekrarladı')
                seen.add(fingerprint)
                add(shopify_rows(source, entries))
                if not entries or len(entries) < 250:
                    break
                if limit and len(rows) >= limit:
                    complete = False
                    break
            else:
                complete = False
        elif source['kind'] == 'beymen':
            for path in source['paths']:
                for page_no in range(1, 251):
                    text = read(source['url'] + path + f'?sayfa={page_no}')
                    marker = 'BEYMEN.productListMain ='
                    if marker not in text:
                        raise ValueError('Beymen ürün listesi bulunamadı')
                    payload = json.JSONDecoder().raw_decode(text.split(marker, 1)[1].lstrip())[0]
                    if payload.get('currentPage') != page_no:
                        raise ValueError('Beymen sayfa numarası doğrulanamadı')
                    entries = payload['products']
                    fingerprint = (path, tuple(p['productId'] for p in entries))
                    if entries and fingerprint in seen:
                        raise ValueError('Beymen katalog sayfalaması tekrarladı')
                    seen.add(fingerprint)
                    add(beymen_rows(source, entries))
                    if progress:
                        progress(source['id'], len(rows))
                    if limit and len(rows) >= limit:
                        complete = False
                        break
                    if page_no >= payload['totalPage']:
                        break
                    if not entries:
                        raise ValueError('Beymen sayfası beklenmedik şekilde boş')
                else:
                    complete = False
                if limit and len(rows) >= limit:
                    break
        else:
            for path in source['paths']:
                for page_no in range(1, 101):
                    param = 'pageIndex' if source['kind'] == 'su' else 'sayfa' if source['kind'] == 'ticimax' else 'p' if source['kind'] == 'puma' else 'page'
                    index = page_no
                    url = source['url'] + path + f'?{param}={index}'
                    parsed = Page(read(url))
                    if source['kind'] in ['nb', 'su']:
                        data = parsed.next_data()
                        response = data['data']['response'] if source['kind'] == 'nb' else data['productList']['products']
                        entries = response['products' if source['kind'] == 'nb' else 'data']
                        fingerprint = tuple(p['id' if source['kind'] == 'nb' else 'variantId'] for p in entries)
                        marker = (path, fingerprint)
                        if entries and marker in seen:
                            raise ValueError('Katalog sayfalaması tekrarladı')
                        seen.add(marker)
                        add((nb_rows if source['kind'] == 'nb' else su_rows)(source, entries))
                        has_next = page_no < response['totalPages']
                    else:
                        candidates = []
                        for a in parsed.links:
                            classes = a.get('class', '')
                            is_product = ('detailUrl' in classes if source['kind'] == 'ticimax' else
                                          'js-product-link' in classes if source['id'] == 'spx' else
                                          'product-item__name' in classes or 'swatches-item__link' in classes if source['kind'] == 'puma' else a['href'].startswith('/urun/'))
                            link = safe_url(a['href'], source['url'], same_host=True)
                            if is_product and link:
                                candidates.append(link)
                        candidates = list(dict.fromkeys(candidates))
                        marker = (path, tuple(sorted(candidates)))
                        if candidates and marker in seen:
                            errors.append(path + ': Katalog sayfalaması tekrarladı')
                            break
                        seen.add(marker)
                        if not candidates:
                            if page_no == 1:
                                errors.append(path + ': ürün bağlantısı yok')
                            break
                        links = [link for link in candidates if link not in seen]
                        seen.update(links)
                        if limit:
                            links = links[:max(0, limit - len(rows))]
                        def detail(link):
                            try:
                                reader = {'ticimax': ticimax_row, 'puma': puma_row, 'reebok': reebok_row}.get(source['kind'], ld_row)
                                return reader(source, read(link), link)
                            except Exception as exc:
                                errors.append(link + ': ' + type(exc).__name__ + ': ' + str(exc)[:120])
                                return None
                        with ThreadPoolExecutor(max_workers=2) as pool:
                            add(pool.map(detail, links))
                        has_next = any(re.search(r'[?&]' + param + '=' + str(index + 1) + r'(?:&|$)', unescape(a['href'])) for a in parsed.links)
                    if progress:
                        progress(source['id'], len(rows))
                    if limit and len(rows) >= limit:
                        complete = False
                        break
                    if not has_next:
                        break
                else:
                    complete = False
                if limit and len(rows) >= limit:
                    break
        if not rows:
            raise ValueError('Doğrulanmış stoklu ürün bulunamadı')
    except Exception as exc:
        errors.append(type(exc).__name__ + ': ' + str(exc)[:180])
        complete = False
    return dict(id=source['id'], name=source['name'], url=source['url'], status='partial' if rows and (errors or not complete) else 'ok' if rows else 'error',
                coverage='Tüm erişilebilir kategori sayfaları' if complete and not errors else 'Kısmi katalog',
                checkedAt=now(), count=len(rows), requests=requests, errorCount=len(errors), errors=errors[:3], rows=list(rows.values()))


def assemble(results):
    grouped, statuses = {}, []
    for result in results:
        statuses.append({k: v for k, v in result.items() if k != 'rows'})
        for row in result['rows']:
            item = grouped.setdefault(row['id'], {k: row[k] for k in ['id', 'name', 'brand', 'color', 'code', 'image'] } | {'offers': []})
            offer = {k: row[k] for k in ['sourceId', 'url', 'variants', 'checkedAt']}
            if not any(o['sourceId'] == offer['sourceId'] and o['url'] == offer['url'] for o in item['offers']):
                item['offers'].append(offer)
    return dict(generatedAt=now(), sources=statuses, products=list(grouped.values()))


def refresh(limit=120, progress=None, only=None):
    if not RUN_LOCK.acquire(blocking=False):
        raise RuntimeError('Tarama zaten devam ediyor')
    lock_path = CATALOG.parent / 'refresh.lock'
    lock_fd = None
    try:
        CATALOG.parent.mkdir(parents=True, exist_ok=True)
        lock_fd = refresh_guard.acquire(CATALOG.parent)
        lock_path.write_text(str(os.getpid()), encoding='ascii')
        selected = [s for s in SOURCES if not only or s['id'] in only]
        if not selected:
            raise ValueError('Geçerli kaynak seçilmedi')
        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = {pool.submit(collect_source, s, limit, progress): s for s in selected}
            results = []
            for future in as_completed(futures):
                result = future.result()
                results.append(result)
                cache = CATALOG.parent / 'sources'
                cache.mkdir(exist_ok=True)
                cache_file = cache / (result['id'] + '.json')
                cache_temp = cache_file.with_suffix('.tmp')
                cache_temp.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
                cache_temp.replace(cache_file)
                print(f"{result['name']}: {result['count']} stoklu varyant / {result['status']}", flush=True)
        if only and CATALOG.exists():
            previous = json.loads(CATALOG.read_text(encoding='utf-8'))
            for source in previous['sources']:
                if source['id'] not in only:
                    rows = [{k: v for k, v in p.items() if k != 'offers'} | offer
                            for p in previous['products'] for offer in p['offers'] if offer['sourceId'] == source['id']]
                    results.append(source | {'rows': rows})
        order = {s['id']: i for i, s in enumerate(SOURCES)}
        results.sort(key=lambda r: order[r['id']])
        data = assemble(results)
        CATALOG.parent.mkdir(parents=True, exist_ok=True)
        if CATALOG.exists():
            (CATALOG.parent / 'catalog.previous.json').write_bytes(CATALOG.read_bytes())
        temp = CATALOG.with_suffix('.tmp')
        temp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        temp.replace(CATALOG)
        return data
    finally:
        try:
            if lock_fd is not None:
                try:
                    lock_path.unlink(missing_ok=True)
                finally:
                    refresh_guard.release(lock_fd)
        finally:
            RUN_LOCK.release()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=120, help='Her kaynak için ürün hedefi; 0 tam tarama')
    parser.add_argument('--sources', nargs='+', choices=[s['id'] for s in SOURCES], help='Yalnız seçilen kaynakları güncelle')
    args = parser.parse_args()
    if args.limit < 0:
        parser.error('Limit negatif olamaz')
    data = refresh(args.limit, only=args.sources)
    print(f"Toplam {len(data['products'])} tekil ürün.")
