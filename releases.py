import json
import re
from datetime import datetime, timezone
from urllib.request import Request, urlopen

URL = 'https://www.nike.com/tr/launch?s=upcoming'


def events(html, at):
    match = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not match:
        raise ValueError('Takvim biçimi değişti')
    state = json.loads(json.loads(match[1])['props']['pageProps']['initialState'])['product']
    rows = {}
    for thread in state['threads']['data']['items'].values():
        product = state['products']['data']['items'].get(thread.get('productId'), {})
        if product.get('productType') != 'FOOTWEAR' or product.get('currency') != 'TRY' or not product.get('isActive'):
            continue
        start = product.get('commerceStartDate')
        if not start or datetime.fromisoformat(start.replace('Z','+00:00')) <= at:
            continue
        slug = thread.get('seo', {}).get('slug', '')
        url = 'https://www.nike.com/tr/launch/t/' + slug if re.fullmatch(r'[\w-]+', slug) else URL
        rows[product['styleColor']] = dict(code=product['styleColor'], name=product['title'], start=start, url=url)
    return sorted(rows.values(), key=lambda i:i['start'])


def update_releases(directory):
    at = datetime.now(timezone.utc)
    try:
        with urlopen(Request(URL, headers={'User-Agent':'SoleRadar/1.0'}), timeout=10) as r:
            if r.url.split('?')[0] not in (URL.split('?')[0], 'https://www.nike.com/tr/launch/upcoming'):
                return
            items = events(r.read(3000000).decode(), at)
    except (ValueError, KeyError, TypeError, OSError):
        return
    temp = directory/'releases.tmp'
    temp.write_text(json.dumps({'checkedAt':at.isoformat(),'items':items},ensure_ascii=False),encoding='utf-8')
    temp.replace(directory/'releases.json')
