#!/bin/bash
# 快速验证OpenClaw视频功能是否正常

echo "🧪 OpenClaw 视频功能验证"
echo "================================"
echo ""

# 1. 检查服务状态
echo "1️⃣  检查服务状态..."
GATEWAY=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18789/)
BACKEND=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3024/projects)

if [ "$GATEWAY" = "200" ]; then
  echo "   ✅ Gateway: 正常运行"
else
  echo "   ❌ Gateway: 异常 (HTTP $GATEWAY)"
fi

if [ "$BACKEND" = "200" ]; then
  echo "   ✅ Backend: 正常运行"
else
  echo "   ❌ Backend: 异常 (HTTP $BACKEND)"
fi

echo ""

# 2. 测试插件API
echo "2️⃣  测试视频插件API..."

# 测试项目列表
PROJECTS=$(curl -s http://127.0.0.1:3024/projects)
PROJECT_COUNT=$(echo "$PROJECTS" | grep -o '"id"' | wc -l | tr -d ' ')

if [ "$PROJECT_COUNT" -gt 0 ]; then
  echo "   ✅ 项目列表API: 正常 (找到 $PROJECT_COUNT 个项目)"
else
  echo "   ⚠️  项目列表API: 返回空"
fi

# 测试创建任务
TASK_RESULT=$(curl -s -X POST http://127.0.0.1:3024/video \
  -H "Content-Type: application/json" \
  -d '{
    "product": {
      "name": "测试商品",
      "description": "自动化测试",
      "category": "electronics"
    },
    "style": "professional"
  }')

TASK_ID=$(echo "$TASK_RESULT" | grep -o '"taskId":"[^"]*"' | cut -d'"' -f4)
PROJECT_ID=$(echo "$TASK_RESULT" | grep -o '"projectId":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TASK_ID" ] && [ -n "$PROJECT_ID" ]; then
  echo "   ✅ 创建任务API: 正常"
  echo "      任务ID: $TASK_ID"
  echo "      项目ID: $PROJECT_ID"
else
  echo "   ❌ 创建任务API: 失败"
fi

echo ""

# 3. 浏览器测试指引
echo "3️⃣  浏览器手动测试"
echo "================================"
echo ""
echo "📋 测试步骤："
echo ""
echo "   1. 在已打开的浏览器中，找到 'commerce-control' 对话"
echo "   2. 在输入框中输入："
echo ""
echo "      查看我的视频项目列表"
echo ""
echo "   3. 检查结果："
echo "      ✅ 应该显示项目列表"
echo "      ❌ 不应该看到 'Tool error' 或 'ERROR'"
echo ""
echo "   4. 再次输入："
echo ""
echo "      帮我生成一个 iPhone 15 Pro 的商品视频"
echo ""
echo "   5. 检查结果："
echo "      ✅ 应该返回任务ID和项目ID"
echo "      ✅ 显示任务状态（已完成或处理中）"
echo "      ❌ 不应该看到 'Tool error'"
echo ""
echo "================================"
echo ""

# 4. 总结
echo "4️⃣  验证总结"
echo "================================"
echo ""

ALL_OK=true

if [ "$GATEWAY" != "200" ] || [ "$BACKEND" != "200" ]; then
  ALL_OK=false
fi

if [ "$PROJECT_COUNT" -le 0 ]; then
  ALL_OK=false
fi

if [ -z "$TASK_ID" ] || [ -z "$PROJECT_ID" ]; then
  ALL_OK=false
fi

if [ "$ALL_OK" = true ]; then
  echo "✅ 所有后端服务和API测试通过！"
  echo ""
  echo "📝 下一步："
  echo "   1. 在浏览器中完成上述手动测试"
  echo "   2. 如果没有看到 'Tool error'，说明功能正常"
  echo "   3. 将测试结果告诉我"
else
  echo "❌ 部分测试失败，请检查日志："
  echo "   tail -50 ~/.openclaw/hyperframe/backend-manual.log"
fi

echo ""
