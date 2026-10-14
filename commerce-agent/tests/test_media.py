import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import math
import struct
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import runtime


class RealMediaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix='commerce-agent-test-')
        cls.root = Path(cls.tmp.name).resolve()
        cls.old = dict(os.environ)
        repo = ROOT.parent / 'video-agent/node_modules'
        ffmpeg = os.environ.get('COMMERCE_FFMPEG') or shutil.which('ffmpeg') or str(repo / '@ffmpeg-installer/darwin-arm64/ffmpeg')
        ffprobe = os.environ.get('COMMERCE_FFPROBE') or shutil.which('ffprobe') or str(repo / '@ffprobe-installer/darwin-arm64/ffprobe')
        os.environ.update(COMMERCE_FFMPEG=ffmpeg, COMMERCE_FFPROBE=ffprobe,
                          COMMERCE_AGENT_DATA=str(cls.root/'tasks'), COMMERCE_INPUT_ROOTS=str(cls.root/'inputs'),
                          COMMERCE_SESSION_KEY='isolated-media-verification', COMMERCE_TOOL_CALL_ID='initial')
        (cls.root/'inputs').mkdir()
        cls.source = cls.root/'inputs/source.mp4'
        runtime.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x240:rate=30',
                     '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v','libx264','-pix_fmt','yuv420p',
                     '-c:a','aac',str(cls.source)])

    @classmethod
    def tearDownClass(cls):
        os.environ.clear()
        os.environ.update(cls.old)
        cls.tmp.cleanup()

    def wait(self, task):
        for _ in range(80):
            value = runtime.task_action({'runId':task['runId'],'action':'wait','waitSeconds':1})
            if value['status'] not in ['created','queued','running']:
                self.assertEqual(value['status'],'ready_for_review',value)
                return value
        self.fail('real media render never completed')

    def test_actual_probe_returns_visible_frames_and_source_times(self):
        result = runtime.inspect_media({'paths':[str(self.source)]})['media'][0]
        self.assertTrue(result['audio'])
        self.assertAlmostEqual(result['duration'],3,delta=.1)
        self.assertEqual(len(result['frames']),4)
        for frame in result['frames']:
            self.assertGreater(Path(frame['path']).stat().st_size,1000)

    def test_real_render_then_scoped_edit_preserves_source_and_original(self):
        os.environ['COMMERCE_TOOL_CALL_ID']='render-first'
        recipe={'width':320,'height':240,'shots':[{'id':'opening','source':str(self.source),'start':.25,'duration':1.5}]}
        first=self.wait(runtime.media({'operation':'render','recipe':recipe}))
        before=runtime.probe(Path(first['artifacts'][0]['path']))
        self.assertTrue(before['audio'])
        self.assertAlmostEqual(before['duration'],1.5,delta=.12)
        os.environ['COMMERCE_TOOL_CALL_ID']='edit-duration'
        second=self.wait(runtime.media({'operation':'revise','runId':first['runId'],
                                       'changes':[{'shotId':'opening','field':'duration','value':1}]}))
        old=runtime.read_task(first['runId']); new=runtime.read_task(second['runId'])
        self.assertEqual(new['parentRunId'],old['runId'])
        self.assertEqual(old['request']['recipe']['shots'][0]['duration'],1.5)
        self.assertEqual(new['request']['recipe']['shots'][0]['source'],str(self.source))
        self.assertEqual(new['request']['recipe']['shots'][0]['start'],.25)
        self.assertEqual(runtime.probe(Path(first['artifacts'][0]['path']))['sha256'],before['sha256'])

    def test_scope_range_and_cross_session_rejection(self):
        with self.assertRaises(runtime.ToolError): runtime.media_path('/etc/passwd')
        recipe={'shots':[{'id':'a','source':str(self.source),'start':2.5,'duration':2}]}
        with self.assertRaises(runtime.ToolError) as error: runtime.validate_recipe(recipe)
        self.assertEqual(error.exception.code,'SOURCE_RANGE')
        os.environ['COMMERCE_TOOL_CALL_ID']='session-isolation'
        task,_=runtime.new_task('render',{'recipe':{}})
        previous=os.environ['COMMERCE_SESSION_KEY']; os.environ['COMMERCE_SESSION_KEY']='other-session'
        try:
            with self.assertRaises(runtime.ToolError): runtime.read_task(task['runId'])
        finally: os.environ['COMMERCE_SESSION_KEY']=previous

    def test_duplicate_tool_call_reuses_run_and_rejects_changed_input(self):
        os.environ['COMMERCE_TOOL_CALL_ID']='same-call'
        first,created=runtime.new_task('render',{'recipe':{'x':1}})
        second,recreated=runtime.new_task('render',{'recipe':{'x':1}})
        self.assertTrue(created); self.assertFalse(recreated)
        self.assertEqual(first['runId'],second['runId'])
        with self.assertRaises(runtime.ToolError): runtime.new_task('render',{'recipe':{'x':2}})

    def test_muting_an_existing_music_recipe_removes_all_audio(self):
        os.environ['COMMERCE_TOOL_CALL_ID']='music-first'
        first=self.wait(runtime.media({'operation':'render','recipe':{'width':320,'height':240,
            'shots':[{'id':'a','source':str(self.source),'duration':.6}], 'audio':{'source':str(self.source),'volume':.1}}}))
        os.environ['COMMERCE_TOOL_CALL_ID']='mute-all'
        second=self.wait(runtime.media({'operation':'revise','runId':first['runId'],
                                       'changes':[{'field':'mute','value':True}]}))
        self.assertFalse(second['artifacts'][0]['audio'])

    def test_concurrent_replayed_calls_create_one_task(self):
        os.environ['COMMERCE_TOOL_CALL_ID'] = 'concurrent-call'
        with ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(lambda _: runtime.new_task('render', {'recipe': {'same': True}}), range(6)))
        self.assertEqual(sum(created for _, created in results), 1)
        self.assertEqual(len({task['runId'] for task, _ in results}), 1)

    def test_two_audio_tracks_mix_at_requested_times(self):
        high = self.root / 'inputs/high.wav'
        runtime.run([runtime.binary('ffmpeg'), '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-t', '0.3', str(high)])
        os.environ['COMMERCE_TOOL_CALL_ID'] = 'two-tracks'
        result = self.wait(runtime.media({'operation': 'render', 'recipe': {'width': 320, 'height': 240,
            'shots': [{'id': 'a', 'source': str(self.source), 'duration': 1, 'sourceAudio': False}],
            'audioTracks': [{'source': str(self.source), 'volume': .7}, {'source': str(high), 'volume': .7, 'start': .4, 'loop': True}]}}))
        raw = subprocess.run([runtime.binary('ffmpeg'), '-v', 'error', '-i', result['artifacts'][0]['path'],
                              '-map', '0:a:0', '-ar', '16000', '-ac', '1', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
        samples = [v[0] for v in struct.iter_unpack('<f', raw)]
        def energy(frequency, start):
            values = samples[round(start * 16000):round((start + .1) * 16000)]
            sin = sum(v * math.sin(2 * math.pi * frequency * i / 16000) for i, v in enumerate(values))
            cos = sum(v * math.cos(2 * math.pi * frequency * i / 16000) for i, v in enumerate(values))
            return math.hypot(sin, cos) / len(values)
        self.assertGreater(energy(440, .1), .005)
        self.assertGreater(energy(880, .6), max(.005, energy(880, .1) * 10))


if __name__=='__main__': unittest.main()
