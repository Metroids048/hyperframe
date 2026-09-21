#!/bin/bash
set -e
export DISPLAY=:99
node test-v4-integration.mjs 2>&1 | tee /tmp/openclaw-test-final.log
