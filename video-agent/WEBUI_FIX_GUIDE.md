# OpenClaw WebUI 访问修复指南

## 问题描述

访问 OpenClaw 对话页面时，显示错误：
```
需要认证
Gateway 可以访问，但缺认证配置
请在 OpenClaw dashboard 中配置 OPENCLAW_GATEWAY_TOKEN
```

## 根本原因

OpenClaw Gateway 日志显示：
```
[ws] unauthorized ... reason=token_missing
unauthorized: gateway token missing (open the dashboard URL and paste the token in Control UI settings)
```

**这是正常的安全机制**：OpenClaw WebUI 需要在浏览器端配置 Gateway Token 才能连接到后端。

## 解决步骤

### 步骤 1：获取 Gateway Token

Token 已配置在环境变量中：
```bash
cat ~/.openclaw/hyperframe/environment.json | grep OPENCLAW_GATEWAY_TOKEN
```

当前 token：`dTly_Ao3FiXcgP1YP07Q9m3Nd7eMZHSNuln8re7_urs`

### 步骤 2：在浏览器中配置 Token

**方法 A：使用带 token 的 URL（推荐）**

直接访问这个 URL，会自动配置 token：
```
http://127.0.0.1:18789/?token=dTly_Ao3FiXcgP1YP07Q9m3Nd7eMZHSNuln8re7_urs
```

**方法 B：手动在设置中配置**

1. 打开 OpenClaw Dashboard：
   ```
   http://127.0.0.1:18789/
   ```

2. 点击页面右上角的**设置图标**（齿轮 ⚙️）

3. 找到 **Gateway Token** 或 **Authentication** 配置项

4. 粘贴 token：`dTly_Ao3FiXcgP1YP07Q9m3Nd7eMZHSNuln8re7_urs`

5. 点击 **Save** 或 **Connect** 按钮

### 步骤 3：访问对话页面

配置完成后，刷新对话页面：
```
http://127.0.0.1:18789/chat?session=agent%3Acommerce-control%3Adashboard%3Ae9a62ff5-12b0-48c1-af71-9bf90b33cad1
```

此时应该能正常显示对话界面，而不再显示"需要认证"错误。

## 验证成功

成功后的表现：
- ✅ 页面正常加载对话界面
- ✅ 可以输入消息并发送
- ✅ 右上角显示连接状态为"已连接"或"Connected"
- ✅ Gateway 日志不再显示 `token_missing` 错误

## 快速启动脚本

创建启动脚本自动打开配置好 token 的页面：

```bash
cat > ~/Desktop/启动OpenClaw视频编辑.command << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"

# 读取 token
TOKEN=$(grep -o '"OPENCLAW_GATEWAY_TOKEN": "[^"]*"' ~/.openclaw/hyperframe/environment.json | cut -d'"' -f4)

# 打开带 token 的页面
open "http://127.0.0.1:18789/?token=$TOKEN"

# 等待 2 秒后打开对话页面
sleep 2
open "http://127.0.0.1:18789/chat?session=agent%3Acommerce-control%3Adashboard%3Ae9a62ff5-12b0-48c1-af71-9bf90b33cad1"

echo "OpenClaw WebUI 已启动"
echo "如果浏览器没有自动打开，请手动访问："
echo "http://127.0.0.1:18789/chat?session=agent%3Acommerce-control%3Adashboard%3Ae9a62ff5-12b0-48c1-af71-9bf90b33cad1"
EOF

chmod +x ~/Desktop/启动OpenClaw视频编辑.command
```

双击桌面上的 `启动OpenClaw视频编辑.command` 即可自动配置并打开 WebUI。

## 注意事项

1. **Token 是持久化的**：配置一次后，浏览器会记住 token（存储在 localStorage），下次访问不需要重新配置

2. **清除浏览器缓存后需重新配置**：如果清除了浏览器数据，需要重新配置 token

3. **不同浏览器需要分别配置**：Chrome、Safari、Firefox 等浏览器各自存储 token，需要分别配置

4. **Token 轮换**：如果重新生成了 Gateway，需要使用新的 token

## 服务状态检查

所有服务都正常运行：

```bash
# OpenClaw Gateway
lsof -i :18789  # ✅ 正在监听

# Video Agent Backend  
curl http://127.0.0.1:3024/api/health  # ✅ 返回 {"ok":true}

# 检查日志
tail -f ~/.openclaw/hyperframe/gateway-manual.log
tail -f ~/.openclaw/hyperframe/backend-manual.log
```

## 其他已修复的问题

1. ✅ Session conflict 错误 - 已修复 `session-bindings.mjs`
2. ✅ Control Agent 询问用户选择项目 - 已强化 instructions
3. ✅ Backend 启动崩溃 - 已添加 try-catch
4. ✅ 中文回复问题 - 已强制中文输出

现在唯一需要做的就是在浏览器中配置 Gateway Token。
