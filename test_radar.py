import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from radar_data import record
from releases import events

class RadarTests(unittest.TestCase):
    def test_size_history_and_confirmed_absence(self):
        at=datetime.now(timezone.utc)
        checked=at.isoformat()
        source={'id':'vitruta','status':'ok','checkedAt':checked}
        product={'id':'a'*20,'offers':[{'sourceId':'vitruta','checkedAt':checked,'url':'https://www.vitruta.com/products/shoe','variants':[{'size':'44.5','price':100,'available':True},{'size':'45','price':80,'available':True}]}]}
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            read=lambda:json.loads((folder/'a.json').read_text(encoding='utf-8'))[product['id']]
            record({'products':[product],'sources':[source]},folder,at)
            self.assertEqual(list(read()['days'].values()),[{'44.5':100,'45':80}])
            record({'products':[],'sources':[source|{'status':'partial'}]},folder,at)
            self.assertNotIn('completeAt',read())
            record({'products':[],'sources':[source]},folder,at)
            self.assertNotIn('current',read());self.assertEqual(read()['completeAt'],checked)
            record({'products':[],'sources':[source]},folder,at+timedelta(days=32))
            self.assertNotIn(product['id'],json.loads((folder/'a.json').read_text()))

    def test_calendar_rejects_changed_source(self):
        with self.assertRaises(ValueError):
            events('<html></html>',datetime.now(timezone.utc))
