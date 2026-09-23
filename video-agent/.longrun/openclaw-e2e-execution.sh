#!/bin/bash
# OpenClaw E2E Test Execution Script
# 完整的视频生成和编辑端到端测试

set -e

PROJECT_ROOT="/Users/a1234/Desktop/hyperframe-main/video-agent"
SERVER_URL="http://localhost:3024"
TEST_ID="openclaw-e2e-$(date +%s)"
OUTPUT_DIR="$PROJECT_ROOT/.longrun/e2e-test-$TEST_ID"

echo "======================================"
echo "OpenClaw E2E 测试开始"
echo "测试ID: $TEST_ID"
echo "服务器: $SERVER_URL"
echo "======================================"

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

# 准备测试请求
cat > "$OUTPUT_DIR/request.json" <<'EOF'
{
  "product": {
    "name": "蓝牙降噪耳机",
    "id": "electronics",
    "facts": [
      "主动降噪技术,有效降低环境噪音",
      "30小时超长续航,支持快充",
      "人体工学设计,舒适佩戴",
      "蓝牙5.3,连接稳定"
    ],
    "price": "¥299",
    "cta": "立即购买,限时优惠",
    "audience": "年轻上班族,通勤人群"
  },
  "scenario": "product_launch",
  "platform": "xiaohongshu",
  "style": "premium",
  "output": {
    "durationSeconds": 30,
    "width": 1080,
    "height": 1920
  },
  "finalRenderQuality": "high"
}
EOF

echo ""
echo "1️⃣ 发送视频生成请求..."
RESPONSE=$(curl -s -X POST "$SERVER_URL/api/commerce/create" \
  -H "Content-Type: application/json" \
  -d @"$OUTPUT_DIR/request.json")

echo "$RESPONSE" | jq '.' > "$OUTPUT_DIR/create-response.json"

PROJECT_ID=$(echo "$RESPONSE" | jq -r '.projectId // empty')
JOB_ID=$(echo "$RESPONSE" | jq -r '.jobId // empty')

if [ -z "$PROJECT_ID" ]; then
  echo "❌ 创建任务失败"
  echo "$RESPONSE"
  exit 1
fi

echo "✅ 任务创建成功"
echo "   Project ID: $PROJECT_ID"
echo "   Job ID: $JOB_ID"

# 保存任务信息
cat > "$OUTPUT_DIR/task-info.json" <<EOF
{
  "testId": "$TEST_ID",
  "projectId": "$PROJECT_ID",
  "jobId": "$JOB_ID",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "serverUrl": "$SERVER_URL"
}
EOF

echo ""
echo "2️⃣ 等待任务完成..."
echo "   任务状态查询: $SERVER_URL/api/commerce/status/$PROJECT_ID"

# 轮询任务状态
MAX_WAIT=600  # 10分钟
ELAPSED=0
POLL_INTERVAL=5

while [ $ELAPSED -lt $MAX_WAIT ]; do
  sleep $POLL_INTERVAL
  ELAPSED=$((ELAPSED + POLL_INTERVAL))

  STATUS_RESPONSE=$(curl -s "$SERVER_URL/api/commerce/status/$PROJECT_ID")
  echo "$STATUS_RESPONSE" | jq '.' > "$OUTPUT_DIR/status-$ELAPSED.json"

  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status // "unknown"')
  STAGE=$(echo "$STATUS_RESPONSE" | jq -r '.stage // "unknown"')
  PROGRESS=$(echo "$STATUS_RESPONSE" | jq -r '.progress // 0')

  echo "   [$ELAPSED s] 状态: $STATUS | 阶段: $STAGE | 进度: $PROGRESS%"

  if [ "$STATUS" = "complete" ]; then
    echo "✅ 任务完成!"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "❌ 任务失败"
    echo "$STATUS_RESPONSE" | jq '.error // .message'
    exit 1
  fi
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  echo "⏱️  等待超时"
  exit 1
fi

echo ""
echo "3️⃣ 下载成品视频..."
VIDEO_URL="$SERVER_URL/api/commerce/download/$PROJECT_ID/final"
OUTPUT_VIDEO="$OUTPUT_DIR/final-video.mp4"

curl -s -o "$OUTPUT_VIDEO" "$VIDEO_URL"

if [ -f "$OUTPUT_VIDEO" ] && [ -s "$OUTPUT_VIDEO" ]; then
  VIDEO_SIZE=$(stat -f%z "$OUTPUT_VIDEO" 2>/dev/null || stat -c%s "$OUTPUT_VIDEO")
  echo "✅ 视频下载成功 ($(($VIDEO_SIZE / 1024 / 1024)) MB)"

  # 检查视频质量参数
  if command -v ffprobe &> /dev/null; then
    echo ""
    echo "📊 视频质量参数:"
    ffprobe -v quiet -show_format -show_streams "$OUTPUT_VIDEO" | grep -E "(codec_name|width|height|bit_rate|duration)" | head -10
  fi
else
  echo "❌ 视频下载失败"
  exit 1
fi

echo ""
echo "4️⃣ 测试编辑功能..."
cat > "$OUTPUT_DIR/edit-request.json" <<EOF
{
  "projectId": "$PROJECT_ID",
  "message": "把第3个场景的文字改成'超长续航30小时'"
}
EOF

EDIT_RESPONSE=$(curl -s -X POST "$SERVER_URL/api/commerce/edit" \
  -H "Content-Type: application/json" \
  -d @"$OUTPUT_DIR/edit-request.json")

echo "$EDIT_RESPONSE" | jq '.' > "$OUTPUT_DIR/edit-response.json"

REVISION=$(echo "$EDIT_RESPONSE" | jq -r '.revision // empty')
if [ -n "$REVISION" ]; then
  echo "✅ 编辑请求成功,新版本: $REVISION"
else
  echo "⚠️  编辑可能未成功"
fi

echo ""
echo "======================================"
echo "✅ E2E 测试完成!"
echo "======================================"
echo ""
echo "📁 输出目录: $OUTPUT_DIR"
echo "🎬 成品视频: $OUTPUT_VIDEO"
echo "🔗 Project ID: $PROJECT_ID"
echo ""
echo "查看项目详情:"
echo "  curl http://localhost:3024/api/commerce/project/$PROJECT_ID | jq"
echo ""
