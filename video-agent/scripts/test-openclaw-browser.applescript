-- OpenClaw 浏览器自动化测试脚本
-- 模拟真实用户操作

on run
	tell application "Safari"
		activate

		-- 打开OpenClaw Control
		set theURL to "http://127.0.0.1:18789"

		-- 检查是否已有窗口打开
		if (count of windows) = 0 then
			make new document
		end if

		set URL of front document to theURL

		-- 等待页面加载
		delay 3

		-- 返回成功
		return "✅ 已打开OpenClaw Control: " & theURL
	end tell
end run
