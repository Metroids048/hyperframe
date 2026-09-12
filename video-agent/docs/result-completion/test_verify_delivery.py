"""Synthetic checker self-tests. These are NOT hyperframe application tests."""
from __future__ import annotations

import copy
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from verify_delivery import EvidenceChecker, canonical_hash, sha256_file, source_fingerprint


class CheckerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
            raise unittest.SkipTest('self-tests require FFmpeg and FFprobe')
        cls.temp = tempfile.TemporaryDirectory(prefix='delivery-checker-selftest-')
        cls.root = Path(cls.temp.name)
        (cls.root/'source.mjs').write_text('// synthetic self-test source\n',encoding='utf-8')
        (cls.root/'definition.md').write_text('Synthetic 1-second checker test, not a product requirement.',encoding='utf-8')
        for audio, name in [(True,'with_audio.mp4'),(False,'silent.mp4')]:
            cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x240:rate=30']
            if audio:
                cmd+=['-f','lavfi','-i','sine=frequency=440:sample_rate=48000']
            cmd+=['-t','1','-c:v','libx264','-pix_fmt','yuv420p']
            if audio:
                cmd+=['-c:a','aac']
            cmd+=[str(cls.root/name)]
            subprocess.run(cmd,check=True,capture_output=True,timeout=30)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def record(self,name,kind=None):
        out={'path':name,'sha256':sha256_file(self.root/name)}
        if kind:out['kind']=kind
        return out

    def write(self,name,value):
        (self.root/name).write_text(json.dumps(value,ensure_ascii=False),encoding='utf-8')

    def setUp(self):
        self.write('document.json',{'revisionId':'r1','durationFrames':30,'output':{'width':320,'height':240}})
        self.write('native-package.json',{'synthetic_fixture':True})
        self.write('input.json',{'synthetic_fixture':True,'seconds':1})
        self.write('raw-evidence.json',{'synthetic_checker_test_only':True})
        self.write('resources.json',{'synthetic_checker_test_only':True})
        self.write('creative.json',{'synthetic_checker_test_only':True})
        src=[self.record('source.mjs')]
        fp=source_fingerprint(src)
        spec={'id':'A','definition_source':self.record('definition.md'),'expected_outcome':'video',
              'duration_seconds':1,'fps':30,'width':320,'height':240,'audio':'required',
              'origin':'fresh_webui','required_artifacts':['input','run_evidence'],
              'required_checks':['media_contract','browser_playback']}
        self.contract={'schema_version':1,'frozen':True,'cases':[spec],'independent_groups':[]}
        self.freeze()
        case={'id':'A','status':'verified_machine','hard_violations':[], 'run_id':'run-A','revision_id':'r1',
              'workspace_fingerprint':fp,'origin':'fresh_webui','creative_attempt_id':'creative-A',
              'creative_cache_reused':False,'artifacts':[
                  self.record('with_audio.mp4','final_video'),self.record('document.json','native_document'),
                  self.record('native-package.json','native_project'),self.record('input.json','input'),
                  self.record('raw-evidence.json','run_evidence'),self.record('resources.json','resource_receipts'),
                  self.record('creative.json','creative_receipts')], 'checks':[]}
        for name in spec['required_checks']:
            filename=name+'.json'
            self.write(filename,{'check':name,'status':'passed','case_id':'A','run_id':'run-A','revision_id':'r1',
                                 'workspace_fingerprint':fp,'evidence_paths':['raw-evidence.json']})
            case['checks'].append({'name':name,**self.record(filename)})
        self.manifest={'schema_version':1,'source_files':src,'workspace_fingerprint':fp,'cases':[case]}

    def freeze(self):
        self.contract['scope_sha256']=canonical_hash(self.contract['cases'])

    def check(self):
        return EvidenceChecker(self.root,shutil.which('ffprobe')).validate(self.contract,self.manifest)

    def reject(self,fragment):
        result=self.check()
        self.assertEqual(result['verdict'],'INCOMPLETE_OR_INVALID')
        self.assertTrue(any(fragment in e for e in result['errors']),result['errors'])

    def test_01_valid_evidence_is_not_product_acceptance(self):
        result=self.check()
        self.assertEqual(result['errors'],[])
        self.assertEqual(result['verdict'],'EVIDENCE_COMPLETE_AWAITING_ACCEPTANCE')
        self.assertFalse(result['product_accepted'])
        self.assertFalse(result['commercial_use_cleared'])

    def test_02_unfrozen_scope(self):
        self.contract['frozen']=False;self.reject('not frozen')

    def test_03_changed_scope_digest(self):
        self.contract['cases'][0]['duration_seconds']=2;self.reject('scope_sha256')

    def test_04_missing_video(self):
        self.manifest['cases'][0]['artifacts']=[a for a in self.manifest['cases'][0]['artifacts'] if a['kind']!='final_video']
        self.reject('missing artifact kind: final_video')

    def test_05_corrupt_file_hash(self):
        self.manifest['cases'][0]['artifacts'][0]['sha256']='0'*64;self.reject('hash mismatch')

    def test_06_wrong_duration(self):
        self.contract['cases'][0]['duration_seconds']=60;self.freeze();self.reject('duration mismatch')

    def test_07_missing_requested_audio(self):
        self.manifest['cases'][0]['artifacts'][0]=self.record('silent.mp4','final_video');self.reject('audio required')

    def test_08_wrong_native_revision(self):
        self.write('document.json',{'revisionId':'stale','durationFrames':30,'output':{'width':320,'height':240}})
        self.manifest['cases'][0]['artifacts'][1]=self.record('document.json','native_document')
        self.reject('revision mismatch')

    def test_09_stale_workspace_receipt(self):
        receipt=json.loads((self.root/'browser_playback.json').read_text())
        receipt['workspace_fingerprint']='0'*64;self.write('browser_playback.json',receipt)
        self.manifest['cases'][0]['checks'][1]={'name':'browser_playback',**self.record('browser_playback.json')}
        self.reject('receipt workspace_fingerprint')

    def test_10_missing_original_case(self):
        spec=copy.deepcopy(self.contract['cases'][0]);spec['id']='B';self.contract['cases'].append(spec);self.freeze()
        self.reject('required case missing')

    def test_11_duplicate_independence_ids(self):
        spec=copy.deepcopy(self.contract['cases'][0]);spec['id']='B';self.contract['cases'].append(spec);self.freeze()
        case=copy.deepcopy(self.manifest['cases'][0]);case['id']='B';self.manifest['cases'].append(case)
        self.contract['independent_groups']=[['A','B']]
        self.reject('distinct run_id')

    def test_12_behavior_case_does_not_require_video(self):
        spec=self.contract['cases'][0];spec['expected_outcome']='behavior';self.freeze()
        case=self.manifest['cases'][0];case['artifacts']=[a for a in case['artifacts'] if a['kind'] in ['input','run_evidence']]
        self.assertEqual(self.check()['errors'],[])

    def test_13_creative_cache_reuse_flagged(self):
        self.contract['independent_groups']=[['A']]
        self.manifest['cases'][0]['creative_cache_reused']=True
        self.reject('creative-cache reuse')

    def test_14_required_check_missing(self):
        self.manifest['cases'][0]['checks'].pop();self.reject('missing required check')

    def test_15_path_outside_root(self):
        self.manifest['cases'][0]['artifacts'][0]['path']='../outside.mp4';self.reject('A/artifact')

    def test_16_source_inventory_tampered(self):
        self.manifest['source_files'][0]['sha256']='0'*64;self.reject('workspace/source')

    def test_17_empty_raw_evidence_list(self):
        receipt=json.loads((self.root/'browser_playback.json').read_text());receipt['evidence_paths']=[]
        self.write('browser_playback.json',receipt)
        self.manifest['cases'][0]['checks'][1]={'name':'browser_playback',**self.record('browser_playback.json')}
        self.reject('raw evidence paths')

    def test_18_unknown_status_not_passed(self):
        self.manifest['cases'][0]['status']='unknown';self.reject('unverified/failed/blocked')

    def test_19_zero_files_template_rejected(self):
        self.manifest={'schema_version':1,'source_files':[],'cases':[]}
        self.reject('required case missing')

    def test_20_wrong_dimensions(self):
        self.contract['cases'][0]['width']=1080;self.freeze();self.reject('width mismatch')


if __name__=='__main__':
    unittest.main(verbosity=2)
