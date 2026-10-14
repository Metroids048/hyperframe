"""Local validation only: these tests do not claim provider execution success."""
import os
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import provider
import runtime


class ProviderBoundaries(unittest.TestCase):
    def test_catalog_has_real_tts_schema_and_does_not_reuse_example_speech(self):
        identity = 'rhart-audio/text-to-audio/speech-2.8-hd'
        self.assertEqual(provider.catalog({'capabilityId': identity})['task'], 'text-to-speech')
        with self.assertRaises(runtime.ToolError) as error:
            provider.prepare({'capabilityId': identity})
        self.assertEqual(error.exception.code, 'PARAMETER_REQUIRED')
        value = provider.prepare({'capabilityId': identity, 'prompt': '这是用户明确要求朗读的内容。'})
        self.assertEqual(value['params']['text'], '这是用户明确要求朗读的内容。')
        self.assertNotIn('pronunciation_dict', value['params'])

    def test_budget_is_global_reserved_and_model_estimate_cannot_authorize(self):
        old = dict(os.environ)
        with tempfile.TemporaryDirectory() as tmp:
            try:
                os.environ.update(COMMERCE_AGENT_DATA=tmp, COMMERCE_GENERATION_BUDGET_CNY='2', COMMERCE_COST_CEILINGS_JSON='{}')
                task = {'runId': 'one', 'request': {'capabilityId': 'test-endpoint', 'estimatedCostCny': .01}}
                with self.assertRaises(runtime.ToolError) as error: provider.reserve(task)
                self.assertEqual(error.exception.code, 'PRICE_NOT_VERIFIED')
                os.environ['COMMERCE_COST_CEILINGS_JSON'] = '{"test-endpoint":1.5}'
                provider.reserve(task)
                provider.reserve(task)
                with self.assertRaises(runtime.ToolError) as error:
                    provider.reserve({'runId': 'two', 'request': {'capabilityId': 'test-endpoint'}})
                self.assertEqual(error.exception.code, 'BUDGET_EXCEEDED')
            finally:
                os.environ.clear(); os.environ.update(old)

    def test_model_cannot_set_undocumented_parameters(self):
        with self.assertRaises(runtime.ToolError) as error:
            provider.prepare({'capabilityId': 'rhart-audio/text-to-audio/speech-2.8-hd', 'prompt': 'test', 'params': {'apiKey': 'forbidden'}})
        self.assertEqual(error.exception.code, 'PARAMETER_UNKNOWN')


if __name__ == '__main__': unittest.main()
