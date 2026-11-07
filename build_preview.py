"""Package only public app files and a catalog snapshot for Vercel Preview."""
from pathlib import Path
import json
import shutil
from collector import ROOT, CATALOG


def build():
    destination = ROOT / 'preview'
    for folder in ('api', 'web', 'public/vendor', 'content', 'data'):
        (destination / folder).mkdir(parents=True, exist_ok=True)
    for name in ('collector.py', 'site_pages.py', 'public_app.py', 'live_quote.py', 'refresh_guard.py', 'releases.py', 'radar_data.py'):
        shutil.copy2(ROOT / name, destination / name)
    shutil.copy2(ROOT / 'content/articles.json', destination / 'content/articles.json')
    if (CATALOG.parent/'radar').is_dir():
        shutil.copytree(CATALOG.parent/'radar', destination/'public/radar', dirs_exist_ok=True)
    snapshot = CATALOG.read_bytes()
    if (CATALOG.parent/'radar/releases.json').is_file():
        (destination/'data/radar').mkdir(exist_ok=True)
        shutil.copy2(CATALOG.parent/'radar/releases.json', destination/'data/radar/releases.json')
    (destination / 'data/catalog.json').write_bytes(snapshot)
    (destination / 'public/catalog.json').write_bytes(snapshot)
    shutil.copy2(ROOT / 'web/account.html', destination / 'web/account.html')
    files = ['app.js', 'radar.js', 'size-picker.js', 'size-picker.css', 'hero-3d.js', 'motion.js', 'style.css', 'editorial.css', 'pages.css']
    shutil.copy2(ROOT / 'web/index.html', destination / 'web/index.html')
    for name in files:
        shutil.copy2(ROOT / 'web' / name, destination / 'public' / name)
    shutil.copytree(ROOT/'web/vendor/vision', destination/'public/vendor/vision', dirs_exist_ok=True)
    assets = ['orcinal.svg', 'orcinal-account.js', 'orcinal-firebase.json', 'radar.svg', 'social-card.png', 'fonts.css', 'gsap.min.js', 'ScrollTrigger.min.js', 'lenis.min.js', 'lenis.css', 'LENIS-LICENSE.txt']
    assets += [p.name for p in (ROOT / 'web/vendor').glob('*-OFL.txt')]
    assets += [p.name for p in (ROOT / 'web/vendor').glob('*.woff2')]
    assets += [p.name for p in (ROOT / 'web/vendor').glob('*.ttf')]
    # Retired homepage photos must not persist in a reused preview package.
    for i in range(1, 37):
        (destination / 'public/vendor' / f'nb9060-{i:02}.webp').unlink(missing_ok=True)
    for name in assets:
        shutil.copy2(ROOT / 'web/vendor' / name, destination / 'public/vendor' / name)
    (destination / 'api/index.py').write_text('from public_app import application as app\n', encoding='utf-8')
    (destination / 'requirements.txt').write_text('# The preview WSGI application uses the Python standard library only.\n', encoding='utf-8')
    (destination / '.python-version').write_text('3.12\n', encoding='utf-8')
    config = {
        'version': 2,
        'framework': None,
        'env': {'PREVIEW_HOST': 'sole-radar-preview.vercel.app'},
        'functions': {'api/index.py': {'includeFiles': '{web/**,content/**,data/catalog.json,data/radar/releases.json}', 'maxDuration': 30}},
        'routes': [
            {'src': '/(.*)', 'headers': {'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'}, 'continue': True},
            {'src': '/vendor/(.*)', 'headers': {'Cache-Control': 'public, max-age=86400'}, 'continue': True},
            {'src': '/api/catalog', 'dest': '/catalog.json', 'headers': {'Access-Control-Allow-Origin': '*'}},
            {'handle': 'filesystem'},
            {'src': '/(.*)', 'dest': '/api/index.py'}
        ]
    }
    (destination / 'vercel.json').write_text(json.dumps(config, indent=2), encoding='utf-8')
    # No keys, local logs, source caches, or user files belong in the deployment.
    (destination / '.vercelignore').write_text('.env*\n.vercel\n__pycache__\n', encoding='utf-8')
    print(f'Preview package ready: {destination}')
    return snapshot


if __name__ == '__main__':
    build()
