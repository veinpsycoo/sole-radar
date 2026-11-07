"""Local-only app. No dependencies: python server.py"""
import argparse
import json
import mimetypes
import base64
import hashlib
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
from urllib.parse import urlsplit
from collector import ROOT, CATALOG, refresh
from site_pages import resolve
import refresh_guard


class App(ThreadingHTTPServer):
    def __init__(self, port, limit):
        super().__init__(('127.0.0.1', port), Handler)
        self.limit = limit
        self.state = {'running': False, 'error': '', 'progress': {}}
        self.lock = threading.Lock()

    def status(self):
        state = dict(self.state)
        if refresh_guard.running(CATALOG.parent):
            state['running'] = True
        return state

    def update(self):
        try:
            refresh(self.limit, lambda source, count: self.state['progress'].update({source: count}))
        except Exception as exc:
            self.state['error'] = str(exc)
        finally:
            with self.lock:
                self.state['running'] = False


class Handler(BaseHTTPRequestHandler):
    def authorized_host(self):
        return self.headers.get('Host') in [f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}']

    def send(self, code, content, mime='application/json; charset=utf-8'):
        if not isinstance(content, bytes):
            content = json.dumps(content, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        hashes = ' '.join("'sha256-" + base64.b64encode(hashlib.sha256(s).digest()).decode() + "'" for s in re.findall(rb'<script type="application/ld\+json">(.*?)</script>', content))
        self.send_header('Content-Security-Policy', f"default-src 'self'; img-src 'self' https: blob:; script-src 'self' {hashes}; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        if not self.authorized_host():
            return self.send(403, {'error': 'Geçersiz adres'})
        path = urlsplit(self.path).path
        if path == '/api/status':
            return self.send(200, self.server.status())
        if path == '/api/catalog':
            if not CATALOG.exists():
                return self.send(200, {'generatedAt': None, 'products': [], 'sources': []})
            return self.send(200, CATALOG.read_bytes())
        result = resolve(path, urlsplit(self.path).query)
        if result:
            code, body, mime = result
            return self.send(code, body.encode('utf-8'), mime)
        files = {'/hero-3d.js': ('hero-3d.js', 'text/javascript; charset=utf-8'), '/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'), '/motion.js': ('motion.js', 'text/javascript; charset=utf-8'), '/style.css': ('style.css', 'text/css; charset=utf-8'), '/editorial.css': ('editorial.css', 'text/css; charset=utf-8')}
        files['/pages.css'] = ('pages.css', 'text/css; charset=utf-8')
        for asset in (ROOT / 'web' / 'vendor').iterdir():
            if asset.is_file() and not asset.is_symlink():
                files['/vendor/' + asset.name] = ('vendor/' + asset.name, mimetypes.guess_type(asset.name)[0] or 'application/octet-stream')
        if path not in files:
            return self.send(404, {'error': 'Bulunamadı'})
        file, mime = files[path]
        return self.send(200, (ROOT / 'web' / file).read_bytes(), mime)

    def do_POST(self):
        origin = self.headers.get('Origin')
        host = self.headers.get('Host')
        if not self.authorized_host() or (origin and origin != 'http://' + host) or self.headers.get('Content-Type') != 'application/json':
            return self.send(403, {'error': 'İstek bu uygulamadan gelmeli'})
        if self.path != '/api/refresh':
            return self.send(404, {'error': 'Bulunamadı'})
        if self.headers.get('Content-Length', '0') not in ['0', '2'] or self.headers.get('Transfer-Encoding'):
            return self.send(400, {'error': 'İstek gövdesi kabul edilmiyor'})
        self.rfile.read(int(self.headers.get('Content-Length', '0')))
        with self.server.lock:
            if self.server.status()['running']:
                return self.send(409, {'error': 'Tarama sürüyor'})
            self.server.state.update(running=True, error='', progress={})
            threading.Thread(target=self.server.update, daemon=True).start()
        return self.send(202, {'running': True})

    def log_message(self, *_):
        pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8767)
    parser.add_argument('--limit', type=int, default=0)
    args = parser.parse_args()
    if args.limit < 0:
        parser.error('Limit negatif olamaz')
    app = App(args.port, args.limit)
    print(f'SOLE RADAR: http://127.0.0.1:{args.port}', flush=True)
    try:
        app.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        app.server_close()
