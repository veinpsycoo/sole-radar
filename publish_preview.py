"""Publish the demonstration site by default. Production uses its explicitly configured domain."""
import json
import hashlib
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlsplit
from site_pages import site_url
from build_preview import build
from collector import ROOT, CATALOG


def cli(*args, directory=None):
    result = subprocess.run(['vercel.cmd', *args, '--scope', 'veinpsyco'], cwd=directory or ROOT / 'preview', capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900)
    if result.returncode:
        raise RuntimeError((result.stdout + result.stderr)[-2000:])
    return result.stdout


def deployment_result(output):
    match = re.search(r'\{\s*"status"\s*:', output)
    if match:
        result = json.JSONDecoder().raw_decode(output[match.start():])[0]['deployment']
    else:
        urls = re.findall(r'(?m)^https://sole-radar-preview-[a-z0-9]+-veinpsyco\.vercel\.app\s*$', output.strip())
        if len(urls) != 1:
            raise ValueError('Vercel did not return one deployment URL; existing alias was left unchanged')
        result = {'url': urls[0].strip()}
    if result.get('target') == 'production' or not re.fullmatch(r'https://sole-radar-preview-[a-z0-9]+-veinpsyco\.vercel\.app', result['url']):
        raise ValueError('Unexpected deployment target; existing alias was left unchanged')
    return result


def publish():
    snapshot = build()
    fingerprint = hashlib.sha256(snapshot).hexdigest()
    result = deployment_result(cli('deploy', '--yes', '--target', 'preview', '--no-wait'))
    inspected = json.loads(cli('inspect', result['url'], '--wait', '--timeout', '10m', '--json'))
    if (inspected.get('target') != 'preview' or inspected.get('readyState') != 'READY'
            or inspected.get('name') != 'sole-radar-preview'
            or 'https://' + inspected.get('url', '') != result['url']
            or not str(inspected.get('id', '')).startswith('dpl_')):
        raise ValueError('Deployment inspection did not confirm a ready SOLE RADAR preview')
    result['id'] = inspected['id']
    subprocess.run(['node', 'check_preview.mjs', result['url'], '', fingerprint], cwd=ROOT, check=True, timeout=180)
    if CATALOG.read_bytes() != snapshot:
        raise RuntimeError('Catalog changed during deployment; existing alias was left unchanged')
    cli('alias', 'set', result['url'], 'sole-radar-preview.vercel.app')
    for attempt in range(4):
        try:
            subprocess.run(['node', 'check_preview.mjs', 'https://sole-radar-preview.vercel.app', 'data/preview-check.json', fingerprint], cwd=ROOT, check=True, timeout=180)
            break
        except subprocess.CalledProcessError:
            if attempt == 3:
                raise
            # Alias changes can briefly serve the previous deployment at an edge.
            time.sleep(5 * (attempt + 1))
    state = {'preview': 'https://sole-radar-preview.vercel.app', 'deployment': result['url'], 'id': result['id'], 'target': 'preview', 'noindex': True}
    (ROOT / 'data/deployment.json').write_text(json.dumps(state, indent=2), encoding='utf-8')
    print('Verified preview published: ' + state['preview'], flush=True)


def publish_production(origin):
    origin = site_url(origin)
    if not origin:
        raise ValueError('Missing production origin')
    domain = urlsplit(origin).hostname
    folder = ROOT / 'data/production-web'
    linked = json.loads((folder / '.vercel/project.json').read_text(encoding='utf-8'))
    snapshot = build(origin)

    def run(*args):
        return cli(*args, directory=folder)

    output = run('deploy', '--prod', '--skip-domain', '--no-wait', '--yes')
    match = re.search(r'\{\s*"status"\s*:', output)
    if match:
        deployment = json.JSONDecoder().raw_decode(output[match.start():])[0]['deployment']
        url = deployment['url']
    else:
        lines = [line.strip() for line in output.splitlines() if line.strip().startswith('https://')]
        url = lines[0] if len(lines) == 1 else ''
    if not re.fullmatch(r'https://[a-z0-9-]+\.vercel\.app', url):
        raise ValueError('Missing Vercel production candidate URL')
    state = json.loads(run('inspect', url, '--wait', '--timeout', '10m', '--json'))
    if (state.get('target') != 'production' or state.get('readyState') != 'READY'
            or state.get('name') != linked['projectName'] or 'https://' + state.get('url', '') != url):
        raise ValueError('Unexpected Vercel production candidate')
    health = json.loads(run('curl', '/readyz', '--deployment', url, '--', '--fail', '--silent'))
    if health.get('catalogAvailable') is not True or health.get('generatedAt') != json.loads(snapshot)['generatedAt']:
        raise ValueError('Production candidate catalog failed verification')
    run('alias', 'set', url, domain)
    print('Verified production catalog deployed to ' + origin, flush=True)


if __name__ == '__main__':
    publish()
