"""Read-only production WSGI app. Serve with Waitress behind an HTTPS proxy."""
import base64
import hashlib
from http import HTTPStatus
import json
import mimetypes
import os
import live_quote
import re
from urllib.parse import urlsplit
from collector import ROOT, CATALOG
from site_pages import resolve, site_url, catalog, fresh_offers, page, HTML

STATIC = {'radar.js', 'app.js', 'size-picker.js', 'size-picker.css', 'hero-3d.js', 'motion.js', 'style.css', 'editorial.css', 'pages.css'}


def response(path, query):
    route = re.fullmatch(r'/api/teklif/([0-9a-f]{20})/(0|[1-9][0-9]?)', path)
    if route:
        p = next((item for item in catalog()['products'] if item['id'] == route[1]), None)
        index = int(route[2])
        if not p or index >= len(p['offers']):
            return 404, b'{}', 'application/json'
        try:
            return 200, json.dumps(live_quote.quote(p, p['offers'][index])).encode(), 'application/json'
        except (OSError, ValueError, KeyError, TypeError, IndexError, ArithmeticError):
            return 503, b'{}', 'application/json'
    if path == '/healthz':
        return 200, b'{"status":"ok"}', 'application/json'
    if path == '/readyz':
        data = catalog()
        available = any(fresh_offers(p, data) for p in data['products'])
        return (200 if available else 503), json.dumps({'catalogAvailable': available, 'generatedAt': data['generatedAt']}).encode(), 'application/json'
    if path == '/api/status':
        return 200, json.dumps({'running': False, 'readOnly': True, 'preview': not bool(site_url()), 'generatedAt':catalog().get('generatedAt'), 'error': '', 'progress': {}}).encode(), 'application/json'
    if path == '/api/catalog':
        return 200, CATALOG.read_bytes() if CATALOG.exists() else b'{"products":[],"sources":[],"generatedAt":null}', 'application/json; charset=utf-8'
    resolved = resolve(path, query)
    if resolved:
        status, body, mime = resolved
        return status, body.encode('utf-8'), mime
    name = path.removeprefix('/')
    if name in STATIC or re.fullmatch(r'vendor/(?:vision/)?[a-zA-Z0-9_.-]+', name):
        file = ROOT / 'web' / name
        if file.is_file() and not file.is_symlink() and file.resolve().is_relative_to(ROOT / 'web'):
            return 200, file.read_bytes(), mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
    return 404, page('Sayfa bulunamadı', 'Aradığın sayfa bulunamadı.', path, '<h1>Bu sayfa radarımızda yok.</h1><a href="/">Ana sayfaya dön ↗</a>', index=False).encode('utf-8'), HTML


def application(environ, start_response):
    host = urlsplit(site_url()).netloc
    hosts = {host} if host else {os.environ.get('VERCEL_URL', ''), os.environ.get('PREVIEW_HOST', '')} - {''}
    path = environ.get('PATH_INFO', '/')
    method = environ.get('REQUEST_METHOD', 'GET')
    if environ.get('HTTP_HOST') not in hosts:
        status, body, mime = 403, b'Invalid host', 'text/plain'
    elif method not in ('GET', 'HEAD'):
        status, body, mime = 405, b'Read-only service', 'text/plain'
    else:
        try:
            status, body, mime = response(path, environ.get('QUERY_STRING', ''))
        except (OSError, ValueError, KeyError):
            status, body, mime = 503, b'Service temporarily unavailable', 'text/plain'
    hashes = ' '.join("'sha256-" + base64.b64encode(hashlib.sha256(s).digest()).decode() + "'" for s in re.findall(rb'<script type="application/ld\+json">(.*?)</script>', body))
    wasm = "'wasm-unsafe-eval'" if path == '/foto/' else ''
    account_script = 'https://www.gstatic.com https://apis.google.com' if path == '/hesabim/' else ''
    account_network = "https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://www.googleapis.com https://www.gstatic.com; frame-src https://orcinal.firebaseapp.com https://accounts.google.com" if path == '/hesabim/' else ''
    headers = [('Content-Type', mime), ('Content-Length', str(len(body))), ('X-Content-Type-Options', 'nosniff'), ('Referrer-Policy', 'no-referrer'), ('Cache-Control', 'public, max-age=86400' if path.startswith('/vendor/') and status == 200 else 'no-store'), ('Content-Security-Policy', f"default-src 'self'; script-src 'self' {wasm} {hashes} {account_script}; style-src 'self'; img-src 'self' https: blob:; connect-src 'self' {account_network}; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"), ('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')]
    if path.startswith('/api/teklif/'):
        headers += [('Access-Control-Allow-Origin', '*'), ('Vercel-CDN-Cache-Control', 'public, s-maxage=45' if status==200 else 'public, s-maxage=15')]
    if status == 405:
        headers.append(('Allow', 'GET, HEAD'))
    if path.startswith('/api/') or path in ('/healthz', '/readyz'):
        headers.append(('X-Robots-Tag', 'noindex'))
    start_response(f'{status} {HTTPStatus(status).phrase}', headers)
    return [b'' if method == 'HEAD' else body]
