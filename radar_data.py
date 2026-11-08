"""Per-size price observations shared by the site, app and notification service."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re

from site_pages import catalog, fresh_offers, shoe_size
from collector import CATALOG

TR = timezone(timedelta(hours=3))


def record(data, directory, at=None):
    at = at or datetime.now(timezone.utc)
    cutoff = (at.astimezone(TR).date()-timedelta(days=29)).isoformat()
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    groups = {key: [] for key in '0123456789abcdef'}
    for p in data['products']:
        if re.fullmatch(r'[a-f0-9]{20}', p['id']):
            groups[p['id'][0]].append(p)
    source_checks = {s['id']:s['checkedAt'] for s in data['sources'] if s.get('status')=='ok' and s.get('checkedAt') and -300 <= (at-datetime.fromisoformat(s['checkedAt'])).total_seconds() < 86400}
    for key, products in groups.items():
        path = directory / (key + '.json')
        rows = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
        for row in rows.values():
            row['days'] = {day:v for day,v in row['days'].items() if day >= cutoff}
            row.pop('current', None)
            row.pop('completeAt', None)
        for p in products:
            current = {}
            row = rows.setdefault(p['id'], {'days':{}})
            for offer in fresh_offers(p, data, at):
                checked = datetime.fromisoformat(offer['checkedAt'])
                day = checked.astimezone(TR).date().isoformat()
                row.setdefault('stores', {})[offer['sourceId']] = day
                row['lastSeen'] = max(row.get('lastSeen', ''), offer['checkedAt'])
                for v in offer['variants']:
                    size = shoe_size(v['size'])
                    if not size:
                        continue
                    prices = row['days'].setdefault(day,{})
                    prices[size] = min(v['price'], prices.get(size, v['price']))
                    candidates = current.setdefault(size, [])
                    candidates.append([v['price'], offer['checkedAt']])
            if current:
                row['current'] = current
        for row in rows.values():
            stores = {key:day for key,day in row.get('stores',{}).items() if day >= cutoff}
            row['stores'] = stores
            if stores and all(store in source_checks for store in stores):
                row['completeAt'] = min(source_checks[store] for store in stores)
        rows = {k:v for k,v in rows.items() if v['days']}
        temp = path.with_suffix('.tmp')
        temp.write_text(json.dumps(rows, separators=(',',':'), ensure_ascii=False), encoding='utf-8')
        temp.replace(path)


def update(data, directory):
    record(data, directory)
    from releases import update_releases
    update_releases(directory)


if __name__ == '__main__':
    update(catalog(), CATALOG.parent/'radar')
