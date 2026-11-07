"""Static export of the preview for GitHub Pages (veinpsycoo.github.io/sole-radar/), because vercel.app is blocked on some TR networks."""
import json, re, shutil
from pathlib import Path
import site_pages as s
from collector import ROOT, CATALOG

BASE = '/sole-radar'
OUT = ROOT / 'data/github-export'


def fix(text):
    text = re.sub(r'/modeller/\?page=(\d+)', r'/modeller/page/\1/', text)
    text = re.sub(r'((?:href|src|action)=")/(?!/)', r'\1' + BASE + '/', text)
    text = text.replace('<head>', '<head><meta name="referrer" content="no-referrer">', 1)
    text = text.replace("fetch('/api/catalog')", "fetch('" + BASE + "/api/catalog.json')")
    text = text.replace("fetch('/api/status')", "fetch('" + BASE + "/api/status.json')")
    return text


def write(path, body):
    f = OUT / path.lstrip('/')
    if path.endswith('/'):
        f = f / 'index.html'
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(fix(body), encoding='utf-8')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    data = s.catalog()
    paths = ['/', '/blog/', '/modeller/', '/robots.txt', '/sitemap.xml', '/llms.txt', '/yontem/', '/hakkimizda/', '/gizlilik/']
    paths += ['/blog/' + a['slug'] + '/' for a in s.ARTICLES]
    paths += ['/urun/' + p['id'] + '/' for p in data['products']]
    n = 0
    for p in paths:
        r = s.resolve(p)
        if r and r[0] == 200:
            body = r[1]
            if p.startswith('/urun/'):
                # Static hosting cannot apply query filters on the server.
                body = body.replace('<section class="offer-detail">', '<section class="offer-detail" hidden>')
                body = body.replace('<p class="lead">', '<p class="lead" hidden>')
                body = body.replace('<form class="detail-size"', '<p id="static-status" role="status">Beden ve güncel stok kontrol ediliyor…</p><form class="detail-size"')
                body = body.replace('</body>', '<script src="/static-detail.js" defer></script><noscript>Güncel beden ve fiyatlar için JavaScript gerekli. Mağazada kontrol et.</noscript></body>')
                body = re.sub(r'<script type="application/ld\+json">.*?</script>', '', body)
            write(p, body); n += 1
    active = sum(bool(s.fresh_offers(p, data)) for p in data['products'])
    for number in range(1, (active + 59) // 60 + 1):
        write(f'/modeller/page/{number}/', s.resolve('/modeller/', f'page={number}')[1])
    for name in ['app.js', 'size-picker.js', 'size-picker.css', 'hero-3d.js', 'motion.js', 'style.css', 'editorial.css', 'pages.css']:
        (OUT / name).write_text(fix((ROOT / 'web' / name).read_text(encoding='utf-8')), encoding='utf-8')
    with (OUT / 'pages.css').open('a', encoding='utf-8') as css:
        css.write('\n[hidden]{display:none!important}\n')
    (OUT / 'vendor').mkdir(exist_ok=True)
    assets = ['radar.svg', 'social-card.png', 'fonts.css', 'LENIS-LICENSE.txt']
    assets += [p.name for pattern in ('*.ttf', '*.woff2', '*-OFL.txt') for p in (ROOT / 'web/vendor').glob(pattern)]
    for name in assets:
        shutil.copy2(ROOT / 'web/vendor' / name, OUT / 'vendor' / name)
    for css in (OUT / 'vendor').glob('*.css'):
        css.write_text(css.read_text(encoding='utf-8').replace('url(/vendor/', 'url(' + BASE + '/vendor/'), encoding='utf-8')
    shutil.copy2(ROOT / 'web/static-detail.js', OUT / 'static-detail.js')
    (OUT / 'api').mkdir(exist_ok=True)
    shutil.copy(CATALOG, OUT / 'api' / 'catalog.json')
    (OUT / 'api' / 'status.json').write_text(json.dumps({'running': False, 'readOnly': True, 'preview': True, 'error': '', 'progress': {}}), encoding='utf-8')
    nf = s.page('Sayfa bulunamadı', 'Aradığın sayfa bulunamadı.', '/404', '<h1>Bu sayfa radarımızda yok.</h1><a href="/">Ana sayfaya dön ↗</a>', index=False)
    (OUT / '404.html').write_text(fix(nf), encoding='utf-8')
    (OUT / '.nojekyll').write_text('')
    assert (OUT / 'index.html').exists() and n >= len(data['products'])
    print('pages', n)


if __name__ == '__main__':
    main()
