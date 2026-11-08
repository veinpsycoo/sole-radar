"""Refresh the catalog at a fixed interval. Run separately from the public app."""
import argparse
from datetime import datetime, timezone
import json
import signal
import threading
from collector import CATALOG, refresh
from publish_preview import publish, publish_production


def run(interval=21600, once=False, publish_after_refresh=False, production_origin=None):
    stopping = threading.Event()
    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, lambda *_: stopping.set())
    while not stopping.is_set():
        state = {'startedAt': datetime.now(timezone.utc).isoformat(), 'running': True, 'error': ''}
        CATALOG.parent.mkdir(parents=True, exist_ok=True)
        status = CATALOG.parent / 'worker-status.json'
        def save():
            temporary = status.with_suffix('.tmp')
            temporary.write_text(json.dumps(state), encoding='utf-8')
            temporary.replace(status)
        save()
        try:
            data = refresh(limit=0)
            state['generatedAt'] = data['generatedAt']
            state['sources'] = {s['id']: s['status'] for s in data['sources']}
            if publish_after_refresh or production_origin:
                if not data['products'] or not any(s['status'] != 'error' for s in data['sources']):
                    raise ValueError('No usable catalog to publish')
                if publish_after_refresh:
                    publish()
                if production_origin:
                    publish_production(production_origin)
                state['publishedAt'] = datetime.now(timezone.utc).isoformat()
        except Exception as exc:
            state['error'] = type(exc).__name__ + ': ' + str(exc)[:180]
            print(state['error'], flush=True)
        finally:
            state.update(running=False, completedAt=datetime.now(timezone.utc).isoformat())
            save()
        if once:
            return not state['error']
        stopping.wait(interval)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--interval', type=int, default=21600, help='Seconds between completed scans (minimum 1 hour)')
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--publish', action='store_true', help='Publish a verified preview after each successful scan')
    parser.add_argument('--production-origin', help='Update this configured HTTPS domain after each successful scan')
    args = parser.parse_args()
    if args.interval < 3600:
        parser.error('Minimum interval is 3600 seconds')
    if run(args.interval, args.once, args.publish, args.production_origin) is False:
        raise SystemExit(1)
