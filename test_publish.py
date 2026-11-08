import json
import hashlib
import unittest
from unittest.mock import patch, Mock
import publish_preview
from pathlib import Path
from tempfile import TemporaryDirectory
from publish_preview import deployment_result


class PreviewTests(unittest.TestCase):
    inspected = {'url':'sole-radar-preview-abc123-veinpsyco.vercel.app','target':'preview','readyState':'READY','name':'sole-radar-preview','id':'dpl_test'}

    def test_rejects_production_and_missing_cli_data(self):
        data = {'status':'ok','deployment':{'url':'https://sole-radar-preview-abc123-veinpsyco.vercel.app','target':None,'id':'test'}}
        self.assertEqual(deployment_result('CLI prefix\n'+json.dumps(data))['id'],'test')
        data['deployment']['target']='production'
        with self.assertRaises(ValueError):deployment_result(json.dumps(data))
        with self.assertRaises(ValueError):deployment_result('unexpected output')
        url = 'https://' + self.inspected['url']
        self.assertEqual(deployment_result(url + '\n'), {'url': url})
        for invalid in (url+'\n'+url, url+'.evil.test', 'https://another-project.vercel.app'):
            with self.assertRaises(ValueError):deployment_result(invalid)

    def test_changed_catalog_cannot_replace_preview_alias(self):
        output = json.dumps({'status':'ok','deployment':{'url':'https://sole-radar-preview-abc123-veinpsyco.vercel.app','target':None,'id':'test'}})
        with patch.object(publish_preview, 'build', return_value=b'old'), patch.object(publish_preview, 'CATALOG', Mock(read_bytes=Mock(return_value=b'new'))), patch.object(publish_preview, 'cli', side_effect=[output,json.dumps(self.inspected)]) as cli, patch.object(publish_preview.subprocess, 'run'):
            with self.assertRaisesRegex(RuntimeError, 'Catalog changed'):
                publish_preview.publish()
        self.assertEqual([c.args[0] for c in cli.call_args_list], ['deploy','inspect'])

    def test_alias_propagation_is_rechecked_before_recording_success(self):
        output = json.dumps({'status':'ok','deployment':{'url':'https://sole-radar-preview-abc123-veinpsyco.vercel.app','target':None,'id':'test'}})
        with TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'data').mkdir()
            with patch.object(publish_preview, 'ROOT', root), patch.object(publish_preview, 'build', return_value=b'same'), patch.object(publish_preview, 'CATALOG', Mock(read_bytes=Mock(return_value=b'same'))), patch.object(publish_preview, 'cli', side_effect=[output,json.dumps(self.inspected),'']), patch.object(publish_preview.time, 'sleep') as sleep, patch.object(publish_preview.subprocess, 'run', side_effect=[None, publish_preview.subprocess.CalledProcessError(1, 'check'), None]) as run:
                publish_preview.publish()
            self.assertEqual(run.call_count, 3)
            for call in run.call_args_list:
                self.assertEqual(call.args[0][-1], hashlib.sha256(b'same').hexdigest())
            sleep.assert_called_once_with(5)
            self.assertEqual(json.loads((root / 'data/deployment.json').read_text())['id'], 'dpl_test')

    def test_unverified_target_never_reaches_alias(self):
        for field,value in [('target','production'),('readyState','ERROR'),('name','other-project'),('url','other.vercel.app')]:
            with self.subTest(field=field), patch.object(publish_preview,'build',return_value=b'snapshot'), patch.object(publish_preview,'cli',side_effect=['https://'+self.inspected['url'],json.dumps(self.inspected | {field:value})]) as cli, patch.object(publish_preview.subprocess,'run') as run:
                with self.assertRaises(ValueError):publish_preview.publish()
                run.assert_not_called()
                self.assertEqual([c.args[0] for c in cli.call_args_list],['deploy','inspect'])


    def test_production_promotes_only_a_ready_matching_catalog(self):
        url = 'https://orcinal-abc123-veinpsyco.vercel.app'
        snapshot = b'{"generatedAt":"test-timestamp"}'
        state = dict(target='production',readyState='READY',name='orcinal',url=url.split('//')[1])
        with TemporaryDirectory() as folder:
            root=Path(folder)
            link=root/'data/production-web/.vercel/project.json'
            link.parent.mkdir(parents=True)
            link.write_text('{"projectName":"orcinal"}')
            for ready in (True,False):
                with self.subTest(ready=ready), patch.object(publish_preview,'ROOT',root), patch.object(publish_preview,'build',return_value=snapshot), patch.object(publish_preview,'cli',side_effect=[url,json.dumps(state),json.dumps(dict(catalogAvailable=ready,generatedAt='test-timestamp')),'']) as cli:
                    if ready:
                        publish_preview.publish_production('https://orcinal.test')
                        self.assertEqual(cli.call_args.args,('alias','set',url,'orcinal.test'))
                    else:
                        with self.assertRaises(ValueError):publish_preview.publish_production('https://orcinal.test')
                        self.assertNotIn('alias',[c.args[0] for c in cli.call_args_list])

if __name__ == '__main__':
    unittest.main()
