#!/bin/bash
# 原生Safari浏览器E2E测试脚本

BASE_URL="http://localhost:3020"
MATERIALS_DIR="$(pwd)/assets/commerce-motion"

echo "=== OpenClaw WebUI 原生浏览器验收测试 ==="
echo ""
echo "[准备] 打开Safari并访问OpenClaw界面..."

# 1. 打开Safari并访问页面
osascript <<EOF
tell application "Safari"
    activate
    if (count of windows) is 0 then
        make new document
    end if
    set URL of front document to "$BASE_URL"
    delay 3
end tell
EOF

echo ""
echo "[提示] Safari已打开OpenClaw界面"
echo ""
echo "=== 手动操作步骤 ==="
echo ""
echo "第一轮：完整商品视频制作"
echo "------------------------"
echo "1. 点击页面上的文件上传控件"
echo "2. 选择以下6个咖啡视频素材："
echo "   - $MATERIALS_DIR/01-grind.mp4"
echo "   - $MATERIALS_DIR/02-fill.mp4"
echo "   - $MATERIALS_DIR/03-assemble.mp4"
echo "   - $MATERIALS_DIR/04-extract.mp4"
echo "   - $MATERIALS_DIR/05-pour.mp4"
echo "   - $MATERIALS_DIR/06-finish.mp4"
echo ""
echo "3. 在对话框中输入以下完整需求："
echo ""
cat <<'PROMPT'
把这些咖啡制作素材制作成一条45秒左右、1080×1920竖屏的咖啡机推广视频。

从原素材中选取6—9个有效镜头,至少使用5个不同的有效源区间。开头3秒用实际咖啡制作画面吸引观看,再展开三个真实的咖啡机特点：精准研磨、专业萃取、快速出品,串起完整的咖啡制作过程,最后做自然的行动引导。

统一字体、配色、版式和运动节奏。至少使用两种真正帮助看清制作过程的视觉设计,例如细节放大与标注、整体和特写分屏、随解说出现的重点信息。转场要服务节奏,不要每个镜头都炫技。

加入自然中文讲解、与讲解对齐的字幕和合适的背景音乐。有人声时音乐降低,咖啡机操作声保留。竖屏不能裁掉关键制作动作和设备细节。

自动制作、检查并交付可播放和下载的新视频,显示真实进度,不要只返回方案。
PROMPT
echo ""
echo "4. 点击提交/发送按钮"
echo "5. 观察进度显示,等待视频制作完成（预计10分钟内）"
echo "6. 完成后播放视频,检查质量"
echo "7. 点击下载按钮,保存视频文件"
echo ""
echo "第二轮：实质性重剪辑（第一轮完成后继续）"
echo "---------------------------------------"
echo "在同一会话中输入："
echo ""
cat <<'EDIT'
上一版还太像常规产品介绍。前4秒直接展示真实萃取中的关键动作,不要先放静态研磨画面；把完整制作演示移到第二段,再用细节解释为什么值得关注。

删掉两处信息重复的展示,换成其他真实细节镜头。第二个特点改成整体和细节并排展示,不要编造使用前后效果。

随新顺序重写受影响的讲解,重新对齐字幕,调整相应节奏和音量衔接。

保留咖啡机身份、已确认事实、原来的背景音乐曲目、整体视觉风格、结尾行动引导、时长和竖屏输出。不要把没涉及的部分全部重做。
EDIT
echo ""
echo "完成后记录："
echo "- 两个版本的视频文件路径"
echo "- 实际耗时"
echo "- 观察到的问题（如有）"
echo ""

# 打开素材目录方便选择
open "$MATERIALS_DIR"
echo "[提示] 素材目录已打开: $MATERIALS_DIR"
echo ""
echo "准备就绪,开始手动测试..."
