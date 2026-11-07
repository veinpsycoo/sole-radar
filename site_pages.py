"""Shared, server-rendered public pages. No client JavaScript needed to read offers."""
from datetime import datetime, timezone, timedelta
from functools import lru_cache
from html import escape
import json
import os
import re
from urllib.parse import parse_qs, urlsplit
from collector import ROOT, CATALOG, SOURCES, safe_url

HTML = 'text/html; charset=utf-8'
SOURCE_NAMES = {s['id']: s['name'] for s in SOURCES}
SOURCE_HOSTS = {urlsplit(s['url']).hostname for s in SOURCES}
ARTICLES = json.loads((ROOT / 'content/articles.json').read_text(encoding='utf-8-sig'))


def site_url():
    value = os.environ.get('SITE_URL', '').rstrip('/')
    if not value:
        return ''
    u = urlsplit(value)
    if u.scheme != 'https' or not u.hostname or u.path or u.query or u.fragment or u.username or u.port:
        raise ValueError('SITE_URL must be a bare HTTPS origin, e.g. https://your-domain.com')
    return value


@lru_cache(maxsize=1)
def _read_catalog(stamp):
    return json.loads(CATALOG.read_text(encoding='utf-8'))


def catalog():
    return _read_catalog(CATALOG.stat().st_mtime_ns) if CATALOG.exists() else {'products': [], 'sources': [], 'generatedAt': None}


def shoe_size(value):
    match = re.fullmatch(r'(\d{2})(?:(\.5)|\s*([⅓⅔]))?', str(value).strip().replace(',', '.'))
    if not match or not 35 <= int(match[1]) <= 50 or (match[1] == '50' and (match[2] or match[3])):
        return ''
    return match[1] + (match[2] or (' ' + match[3] if match[3] else ''))


def fresh_offers(product, data, at=None):
    at = at or datetime.now(timezone.utc)
    usable = {s['id'] for s in data['sources'] if s['status'] != 'error'}
    result = []
    for offer in product['offers']:
        try:
            age = (at - datetime.fromisoformat(offer['checkedAt'])).total_seconds()
            url = urlsplit(offer['url'])
            if not -300 <= age < 86400 or offer['sourceId'] not in usable or url.scheme != 'https' or url.hostname not in SOURCE_HOSTS:
                continue
            variants = [v for v in offer['variants'] if v.get('available') is True and type(v.get('price')) is int and v['price'] > 0]
            if variants:
                result.append(offer | {'variants': variants, 'price': min(v['price'] for v in variants)})
        except (ValueError, TypeError, KeyError):
            continue
    return sorted(result, key=lambda o: o['price'])


def money(value):
    return f'{value / 100:,.2f}'.replace(',', '_').replace('.', ',').replace('_', '.') + ' ₺'


def stamp(value):
    try:
        date = datetime.fromisoformat(value)
        if date.tzinfo is None:
            return 'Tarih doğrulanamadı'
        return date.astimezone(timezone(timedelta(hours=3))).strftime('%d.%m.%Y %H:%M TSİ')
    except (TypeError, ValueError):
        return 'Tarih doğrulanamadı'


def metadata(title, description, path, schema=None, index=True):
    base = site_url()
    preview = os.environ.get('PREVIEW_HOST', '') or os.environ.get('VERCEL_URL', '')
    sharing_base = base or ('https://' + preview if re.fullmatch(r'[a-zA-Z0-9.-]+\.vercel\.app', preview) else '')
    url = sharing_base + path if sharing_base else ''
    result = f'<meta name="description" content="{escape(description)}"><meta name="robots" content="{"index,follow" if base and index else "noindex,follow"}">'
    if base:
        result += f'<link rel="canonical" href="{escape(base + path)}">'
    if url:
        result += f'<meta property="og:url" content="{escape(url)}">'
    kind = 'article' if schema and schema.get('@type') == 'Article' else 'website'
    result += f'<meta property="og:title" content="{escape(title)}"><meta property="og:description" content="{escape(description)}"><meta property="og:type" content="{kind}"><meta property="og:site_name" content="SOLE RADAR"><meta property="og:locale" content="tr_TR"><meta name="twitter:card" content="{"summary_large_image" if sharing_base else "summary"}">'
    if sharing_base:
        result += f'<meta property="og:image" content="{sharing_base}/vendor/social-card.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="SOLE RADAR — Aradığın çift. En iyi fiyatıyla."><meta name="twitter:image" content="{sharing_base}/vendor/social-card.png">'
    if schema:
        result += '<script type="application/ld+json">' + json.dumps(schema, ensure_ascii=False).replace('<', '\\u003c') + '</script>'
    return result


def page(title, description, path, body, schema=None, index=True):
    return f'''<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)} — SOLE RADAR</title>{metadata(title, description, path, schema, index)}<link rel="icon" href="/vendor/radar.svg?v=2"><link rel="stylesheet" href="/vendor/fonts.css"><link rel="stylesheet" href="/pages.css"><link rel="stylesheet" href="/size-picker.css"><script src="/size-picker.js?v=sizes2" defer></script></head><body class="reading-page"><a class="skip" href="#content">İçeriğe geç</a><header><a class="wordmark" href="/">SOLE<span>RADAR</span> ↗</a><nav aria-label="Ana menü"><a href="/modeller/">Modeller</a><a href="/blog/">Rehber</a><a href="/yontem/">Yöntemimiz</a></nav></header><main id="content">{body}</main><footer><a href="/">SOLE RADAR ↗</a><p>Bağımsız ayakkabı keşfi ve fiyat karşılaştırması.</p><a href="/hakkimizda/">Hakkımızda</a> · <a href="/gizlilik/">Gizlilik</a> · <a href="/yontem/">Veri yöntemi</a></footer></body></html>'''


def article_cards():
    return '<div class="reading-grid">' + ''.join(f'<article><p class="eyebrow">{escape(a["category"])}</p><h3><a href="/blog/{a["slug"]}/">{escape(a["title"])}</a></h3><p>{escape(a["description"])}</p><a href="/blog/{a["slug"]}/" aria-label="Rehberi oku ↗ — {escape(a["title"])}">Rehberi oku ↗</a></article>' for a in ARTICLES) + '</div>'


def product_cards(products, data):
    cards = []
    for p in products:
        offers = fresh_offers(p, data)
        price = money(offers[0]['price']) if offers else 'Güncel teklif yok'
        cards.append(f'<article class="product-preview"><a href="/urun/{escape(p["id"])}/"><img src="{escape(safe_url(p["image"]))}" alt="{escape(p["name"])}" width="320" height="240" loading="lazy"><span>{escape(p["brand"])}</span><h3>{escape(p["name"])}</h3><p>{escape(p.get("color", ""))}</p><strong>{price}</strong></a></article>')
    return '<div class="reading-grid">' + ''.join(cards) + '</div>'


MODEL_PAGES = {
    '/model/new-balance-9060/': ('NEW BALANCE', '9060', re.compile(r'(?<!\d)9060(?!\d)', re.I)),
    '/model/salomon-xt-6/': ('SALOMON', 'XT-6', re.compile(r'\bXT[ -]?6\b', re.I)),
}


def homepage():
    html = (ROOT / 'web/index.html').read_text(encoding='utf-8')
    html = re.sub(r'<meta name="description"[^>]+>', '', html)
    html = html.replace('</head>', metadata('SOLE RADAR — Ayakkabı fiyatlarını karşılaştır', 'Üç bedene kadar seç, marka belirle, stoklu ayakkabıları en düşük fiyattan karşılaştır. Tekliflerin kaynağını ve son kontrol zamanını gör.', '/', {'@context': 'https://schema.org', '@type': 'WebSite', 'name': 'SOLE RADAR', **({'url': site_url()} if site_url() else {})}) + '<link rel="stylesheet" href="/pages.css"></head>')
    html = html.replace('</main>', '<section class="reading-home"><p class="eyebrow">03 / RADAR REHBERİ</p><h2>İyi bir seçim, doğru bilgiyle başlar.</h2>' + article_cards() + '<p><a href="/modeller/">Tüm model sayfaları ↗</a> · <a href="/yontem/">Karşılaştırma yöntemimiz ↗</a></p></section></main>')
    return html


def resolve(path, query=''):
    """Return (status, body, MIME) for content routes, or None for other assets."""
    if path == '/':
        return 200, homepage(), HTML
    if path == '/blog/':
        return 200, page('Radar rehberi', 'Ayakkabı fiyatı, beden ve stok karşılaştırması için açık ve pratik rehberler.', path, '<p class="eyebrow">RADAR / REHBER</p><h1>Bir sonraki çifti<br>bilerek seç.</h1><p class="lead">Fiyat etiketinin arkasındaki detaylar.</p>' + article_cards()), HTML
    article = next((a for a in ARTICLES if path == '/blog/' + a['slug'] + '/'), None)
    if article:
        a = article
        body = f'<article class="prose"><a href="/blog/">← Tüm rehberler</a><p class="eyebrow">{escape(a["category"])}</p><h1>{escape(a["title"])}</h1><p class="byline">SOLE RADAR · <time datetime="{a["date"]}">{a["date"]}</time></p><p class="lead">{escape(a["intro"])}</p>'
        body += ''.join(f'<section><h2>{escape(s["title"])}</h2><p>{escape(s["text"])}</p></section>' for s in a['sections'])
        body += '<h2>İlgili sayfalar</h2><ul>' + ''.join(f'<li><a href="{escape(l["url"])}">{escape(l["label"])}</a></li>' for l in a['links']) + '</ul></article>'
        schema = {'@context': 'https://schema.org', '@type': 'Article', 'headline': a['title'], 'description': a['description'], 'datePublished': a['date'], 'dateModified': a['date'], 'inLanguage': 'tr-TR', 'author': {'@type': 'Organization', 'name': 'SOLE RADAR', 'url': site_url() + '/hakkimizda/'}, 'publisher': {'@type': 'Organization', 'name': 'SOLE RADAR'}}
        return 200, page(a['title'], a['description'], path, body, schema), HTML
    if path in ('/yontem/', '/hakkimizda/', '/gizlilik/'):
        titles = {'/yontem/': 'Fiyatları nasıl karşılaştırıyoruz?', '/hakkimizda/': 'SOLE RADAR hakkında', '/gizlilik/': 'Gizlilik ve yerel tercihler'}
        texts = {
            '/yontem/': '<p class="lead">SOLE RADAR, tanımlı mağazaların kamuya açık ürün sayfalarındaki fiyat ve stokları karşılaştırır. Ürün satmaz, ödeme almaz ve stok ayırmaz.</p><h2>Eşleştirme ve beden</h2><p>Tanınan tam model ve renk kodları eşleştirilir. Kodu belirsiz kayıtlar ayrı tutulur. Beden seçildiğinde yalnızca o beden etiketiyle doğrulanan stoklu varyantların fiyatları kullanılır. Ana numara seçimi yetişkin EU 35–50 aralığıyla sınırlıdır; yarım ve kesirli numaralar korunur. Beden ölçü sistemleri arasında tahmini dönüşüm yapılmaz.</p><h2>Güncellik ve kapsam</h2><p>Her teklifin kontrol tarihi görünür. 24 saati geçen veya kaynağı başarısız olan teklifler aktif sonuçlardan çıkarılır. Kısmi tarama, kaynağın tüm ürünlerinin okunamadığını belirtir. Varsayılan sıralama ürün fiyatınadır. Kargo dahil seçiminde yalnız geçerli teslimat kuralı doğrulanan mağazalar karşılaştırılır. Üyelik ve koşullu sepet kampanyaları dahil değildir.</p><h2>Orijinallik ve bağımsızlık</h2><p>Mağaza adreslerini sınırlandırıyoruz; fiziksel ürün incelemesi veya orijinallik sertifikası sunmuyoruz. Satın almadan önce satıcıyı, ürün kodunu, bedeni ve toplam tutarı mağazada doğrula. Listelenen mağazaların resmî temsilcisi değiliz.</p><h2>Düzeltme</h2><p>Mağazanın sayfasıyla bir fark gördüğünde son kontrol zamanını karşılaştır. Mağazada güncel bilgi esas alınır. Kaynak hataları tarama raporunda görünür; başarısız kaynağın teklifi güncelmiş gibi gösterilmez.</p>',
            '/hakkimizda/': '<p class="lead">SOLE RADAR, Türkiye’deki tanımlı ayakkabı mağazalarını tek bir arama deneyiminde buluşturan bağımsız bir fiyat karşılaştırma projesidir.</p><h2>Ne yapıyoruz?</h2><p>Model, renk ve bedene göre teklifleri görünür kılıyor; fiyatın nereden ve ne zaman alındığını gösteriyoruz. Satış işlemi seçtiğin mağazada gerçekleşir. Sitedeki rehberler karşılaştırma sürecini açıklar; fiziksel olarak denemediğimiz ürünler için deneyim veya uzmanlık iddiasında bulunmayız.</p><p><a href="/yontem/">Veri yöntemimizi ve sınırlarını incele ↗</a></p>',
            '/gizlilik/': '<p class="lead">Mevcut sürüm üyelik veya ödeme bilgisi istemez. Arama ve filtreleme tarayıcında yapılır.</p><h2>Kaydedilen seçimler ve alarmlar</h2><p>Web sıralamaları tarayıcında, mobil sıralamalar cihazında saklanır. Fotoğrafla arama görseli cihazında işler. Mobil alarm açıldığında Expo bildirim anahtarı, ürün, numara ve isteğe bağlı hedef fiyat Cloudflare üzerindeki alarm servisine gönderilir. Expo, Apple veya Google bildirimi cihazına iletir. Alarmı kaldırabilir veya 90 günlük saklama süresinin dolmasını bekleyebilirsin.</p><h2>Yerel kayıt</h2><p>Hareketleri azaltma tercihi tarayıcının yerel depolamasında sole-reduced-motion anahtarıyla saklanır. Tarayıcı site verilerini temizlediğinde bu tercih silinir. Filtreler sayfa bağlantısında görünür ve bağlantıyı paylaştığında alıcı tarafından okunabilir.</p><h2>Dış mağazalar ve görseller</h2><p>Ürün görselleri mağazaların sunucularından yüklenebilir; bu istekler IP adresi ve tarayıcıya ait standart bağlantı bilgilerini ilgili sunucuya iletir. Mağaza bağlantısına geçtiğinde o mağazanın gizlilik politikası geçerlidir. Uygulama kodu reklam takip aracı veya analiz çerezi eklemez.</p><h2>Yayın altyapısı</h2><p>Web sitesi GitHub Pages üzerinde, alternatif önizleme ve katalog uç noktası Vercel üzerinde barındırılır. Bu sağlayıcılar bağlantı ve güvenlik günlükleri tutabilir. Kişisel veri veya gizlilik soruların için aşağıdaki destek adresine yazabilirsin. Bu açıklama web sitesi ve SOLE RADAR mobil uygulaması için geçerlidir.</p>'}
        texts[path] += '<h2>İşletmeci ve destek</h2><p>Muhammet Çay · <a href="mailto:veinpsyco@gmail.com">veinpsyco@gmail.com</a></p>'
        return 200, page(titles[path], titles[path] + ' Kaynaklar, güncellik ve sınırlar.', path, '<article class="prose"><h1>' + titles[path] + '</h1>' + texts[path] + '</article>'), HTML
    if path == '/robots.txt':
        text = 'User-agent: *\n' + ('Allow: /\nDisallow: /api/\nSitemap: ' + site_url() + '/sitemap.xml\n' if site_url() else 'Disallow: /\n')
        return 200, text, 'text/plain; charset=utf-8'
    if path == '/llms.txt':
        text = '# SOLE RADAR\n\n> Türkiye’deki tanımlı ayakkabı mağazalarının fiyat ve stok karşılaştırması. Fiziksel ürün orijinalliği doğrulanmaz.\n\n## Yöntem\n- [Veri yöntemimiz](' + site_url() + '/yontem/): Eşleştirme, 24 saatlik güncellik sınırı, fiyat kapsamı.\n- [Radar rehberi](' + site_url() + '/blog/): Alışveriş ve beden rehberleri.\n\nFiyatları aktarırken mağazayı, bedeni ve kontrol tarihini belirtin. Eski teklifleri güncel fiyat olarak alıntılamayın.\n'
        return 200, text, 'text/plain; charset=utf-8'
    if re.fullmatch(r'/radar/(?:[a-f0-9]|shipping|releases)\.json', path):
        file = CATALOG.parent / path.lstrip('/')
        return (200, file.read_text(encoding='utf-8'), 'application/json') if file.is_file() else (404, '{}', 'application/json')
    if path == '/foto/':
        body = '<h1>Fotoğrafla model bul</h1><p class="lead">Tek ayakkabının yandan çekilmiş fotoğrafını seç. Pilot katalogdaki benzer modelleri cihazında karşılaştırır. Fotoğrafın yüklenmez.</p><label>Ayakkabı fotoğrafı <input id="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><p id="photo-status" role="status"></p><ul id="photo-results"></ul><script defer src="/vendor/vision/ort.wasm.min.js"></script><script defer src="/vendor/vision/photo.js"></script>'
        return 200, page('Fotoğrafla sneaker modeli bul', 'Fotoğrafına benzeyen sneaker modellerini keşfet.', path, body), HTML
    if path == '/takvim/':
        from releases import URL
        file = CATALOG.parent/'radar/releases.json'
        feed = json.loads(file.read_text(encoding='utf-8')) if file.is_file() else {}
        now = datetime.now(timezone.utc)
        recent = feed.get('checkedAt') and now - datetime.fromisoformat(feed['checkedAt']) < timedelta(days=2)
        items = [e for e in feed.get('items', []) if recent and datetime.fromisoformat(e['start'].replace('Z','+00:00')) > now]
        cards = ''.join(f'<li data-release="{escape(e["start"])}"><time>{stamp(e["start"])}</time> · <a href="{escape(e["url"])}">{escape(e["name"])}</a> · {escape(e["code"])}</li>' for e in items)
        body = '<h1>Türkiye sneaker çıkış takvimi</h1><p class="lead">Nike SNKRS Türkiye · Türkiye saati</p><ul data-calendar-checked="'+escape(feed.get('checkedAt',''))+'">'+cards+'</ul><p id="calendar-empty"'+(' hidden' if cards else '')+'>Doğrulanmış yaklaşan çıkış bulunmuyor.</p><p><a href="'+URL+'">Resmî takvimi aç ↗</a></p><script defer src="/radar.js"></script>'
        return 200, page('Türkiye sneaker çıkış takvimi', 'Türkiye satış noktası doğrulanmış sneaker çıkışları.', path, body, index=bool(items)), HTML
    if path in MODEL_PAGES:
        brand, label, pattern = MODEL_PAGES[path]
        data = catalog()
        matches = [p for p in data['products'] if p['brand'].upper() == brand and pattern.search(p['name']) and fresh_offers(p, data)]
        title = f'{brand.title()} {label} fiyatları ve stoklu numaralar'
        body = f'<h1>{escape(title)}</h1><p class="lead"><a href="/?brand={brand.replace(" ", "%20")}&amp;model={label}#catalog">Numaranı seç ve teklifleri sırala ↗</a></p>'
        body += f'<section id="family" data-brand="{escape(brand)}" data-model="{escape(label)}"><label>Renk <select aria-label="Renk"><option>Tüm renkler</option></select></label> <label>Numara <select aria-label="Numara"><option>Tüm numaralar</option></select></label><p role="status"></p><ol></ol></section><script defer src="/radar.js"></script>'
        body += product_cards(matches, data) if matches else '<p>Bu model için güncel teklif bulunmuyor.</p>'
        return 200, page(title, title, path, body, index=bool(matches)), HTML
    if path not in ('/modeller/', '/sitemap.xml') and not re.fullmatch(r'/urun/[a-f0-9]{20}/', path):
        return None
    data = catalog()
    if path == '/sitemap.xml':
        paths = ['/', '/blog/', '/modeller/', '/yontem/', '/hakkimizda/'] + ['/blog/' + a['slug'] + '/' for a in ARTICLES]
        # Only comparison pages with multiple current stores are search-index candidates.
        paths += [path for path,(brand, _, pattern) in MODEL_PAGES.items() if any(p['brand'].upper() == brand and pattern.search(p['name']) and fresh_offers(p, data) for p in data['products'])]
        paths += ['/urun/' + p['id'] + '/' for p in data['products'] if len({o['sourceId'] for o in fresh_offers(p, data)}) >= 2]
        body = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + (''.join('<url><loc>' + escape(site_url() + p) + '</loc></url>' for p in paths) if site_url() else '') + '</urlset>'
        return 200, body, 'application/xml; charset=utf-8'
    if path == '/modeller/':
        try:
            number = int(parse_qs(query).get('page', ['1'])[0])
        except ValueError:
            number = 0
        products = [p for p in data['products'] if fresh_offers(p, data)]
        if number < 1 or number > max(1, (len(products) + 59) // 60):
            return 404, page('Sayfa bulunamadı', 'Model sayfası bulunamadı.', path, '<h1>Bu sayfa yok.</h1><a href="/modeller/">Modellere dön</a>', index=False), HTML
        selected = products[(number-1)*60:number*60]
        body = '<p class="eyebrow">KEŞFET / MODELLER</p><h1>Radarındaki modeller.</h1><p class="lead">Kaynağı belli, kontrol tarihi görünür. Bedenle aramak için <a href="/#catalog">filtreleri aç.</a></p>' + product_cards(selected, data)
        body += '<nav class="pagination" aria-label="Model sayfaları">'
        if number > 1:
            body += f'<a href="/modeller/?page={number-1}">← Önceki</a>'
        body += f'<span>Sayfa {number}</span>'
        if number*60 < len(products):
            body += f'<a href="/modeller/?page={number+1}">Sonraki →</a>'
        body += '</nav>'
        return 200, page('Ayakkabı modelleri' + (f' — Sayfa {number}' if number > 1 else ''), 'Güncel mağaza teklifleri olan ayakkabı modellerini keşfet.', path + (f'?page={number}' if number > 1 else ''), body), HTML
    p = next((p for p in data['products'] if path == '/urun/' + p['id'] + '/'), None)
    if not p:
        return 404, page('Ürün bulunamadı', 'Bu ürün kaydı bulunamadı.', path, '<h1>Ürün bulunamadı.</h1><a href="/modeller/">Modelleri keşfet</a>', index=False), HTML
    offers = fresh_offers(p, data)
    selected_sizes = list(dict.fromkeys(size for value in parse_qs(query).get('beden', []) if (size := shoe_size(value))))[:3]
    selected_size = ' / '.join(selected_sizes).replace('.', ',')
    sizes = sorted({size for o in offers for v in o['variants'] if (size := shoe_size(v.get('size', '')))}, key=lambda value: float(value.replace(' ⅓', '.333').replace(' ⅔', '.667')))
    if parse_qs(query).get('beden'):
        offers = [o | {'variants': [v for v in o['variants'] if shoe_size(v['size']) in selected_sizes]} for o in offers]
        offers = [o | {'price': min(v['price'] for v in o['variants'])} for o in offers if o['variants']]
        offers.sort(key=lambda o: o['price'])
    body = f'<a href="/modeller/">← Modeller</a><div class="product-detail"><img src="{escape(safe_url(p["image"]))}" alt="{escape(p["name"])}" width="640" height="480"><div><p class="eyebrow">{escape(p["brand"])}</p><h1>{escape(p["name"])}</h1><p>{escape(p.get("color", ""))}</p><p>Ürün kodu: {escape(p.get("code") or "Mağazaya özel kayıt")}</p><p class="lead">{money(offers[0]["price"]) + "’den başlayan" if offers else "Güncel teklif bulunmuyor."}</p><p>Fiyatlar bedene göre değişebilir. Kargo ve koşullu kampanyalar dahil değildir.</p></div></div><h2>Mağazalar, bedenler ve fiyatlar</h2>'
    body += f'<section id="price-history" data-product="{escape(p["id"])}"><h2>Numarana göre fiyat geçmişi</h2><div role="status">Gözlemler yükleniyor…</div></section><script defer src="/radar.js"></script>'
    choices = list(dict.fromkeys(sizes + selected_sizes))
    checks = ''.join(f'<label><input type="checkbox" name="beden" value="{escape(size)}"{" checked" if size in selected_sizes else ""}><span>{escape(size.replace(".", ","))}</span></label>' for size in choices)
    body += '<form class="detail-size" method="get"><details class="size-picker" data-size-picker><summary aria-label="Ayak numaralarını seç"><span data-size-label>Numaranı seç</span></summary><div class="size-picker-panel"><div class="size-options" role="group" aria-label="En fazla üç ayak numarası seç">' + checks + '</div><p data-size-count role="status">En fazla üç numara seçebilirsin.</p></div></details><button type="submit">Uygula</button></form>'
    if selected_size:
        body += f'<p><strong>{escape(selected_size)} beden</strong> için doğrulanmış teklifler gösteriliyor.</p>' if offers else f'<p>{escape(selected_size)} beden için güncel teklif bulunmuyor. Başka bir beden seçebilirsin.</p>'
    for o in offers:
        body += f'<section class="offer-detail"><h3><a href="{escape(o["url"])}" rel="noopener noreferrer">{escape(SOURCE_NAMES.get(o["sourceId"], o["sourceId"]))} ↗</a></h3><p>Son kontrol: <time datetime="{escape(o["checkedAt"])}">{stamp(o["checkedAt"])}</time></p><ul class="sizes-list">' + ''.join(f'<li>{escape(v.get("size") or "Beden doğrulanmadı")} <strong>{money(v["price"])}</strong></li>' for v in o['variants']) + '</ul></section>'
    body += '<p><a href="/yontem/">Verinin kapsamını ve karşılaştırma yöntemini oku.</a> Satın almadan önce mağazada ürün kodunu, bedeni ve son tutarı kontrol et.</p>'
    schema = {'@context': 'https://schema.org', '@type': 'Product', 'name': p['name'], 'image': safe_url(p['image']), 'brand': {'@type': 'Brand', 'name': p['brand']}}
    if p.get('code'):
        schema['sku'] = p['code']
    if offers:
        prices = [v['price'] for o in offers for v in o['variants']]
        schema['offers'] = {'@type': 'AggregateOffer', 'priceCurrency': 'TRY', 'lowPrice': f'{min(prices)/100:.2f}', 'highPrice': f'{max(prices)/100:.2f}', 'offerCount': len(offers)}
    return 200, page(p['name'] + ' fiyat karşılaştırması', f'{p["brand"]} {p["name"]}: mağaza teklifleri, stoklu bedenler ve kontrol tarihleri.', path, body, schema, not selected_size and len({o['sourceId'] for o in offers}) >= 2), HTML
