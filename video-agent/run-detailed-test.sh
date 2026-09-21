#!/bin/bash
set -e
export DISPLAY=:99
/Applications/Codex.app/Contents/Resources/app/bin/node test-v4-integration.mjs 2>&1 | tee /tmp/openclaw-detailed-test.log
