#!/bin/bash
NODE_PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"
if [ ! -f "$NODE_PATH" ]; then
  echo "错误: ChatGPT node 不存在于 $NODE_PATH"
  exit 1
fi
"$NODE_PATH" e2e-commerce-test-v4.mjs "$@"
