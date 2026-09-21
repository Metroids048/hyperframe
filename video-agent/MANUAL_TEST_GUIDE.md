# OpenClaw 手动测试指南

## 当前状态

✅ **所有服务已启动并正常运行**
- Gateway (18789端口): ✓ 正常
- Backend (3024端口): ✓ 正常  
- Bridge Server: ✓ 正常
- 插件API: ✓ 测试通过

## 手动测试步骤

### 1. 打开OpenClaw

在浏览器中访问：
```
http://127.0.0.1:18789/chat?session=agent%3Acommerce-control%3Adashboard%3A4b3675f3-1eab-4af9-993b-e86625aef11c
```

或者点击桌面的"OpenClaw视频编辑.command"

### 2. 进入commerce-control对话

在左侧会话列表中找到并点击：`commerce-control`

### 3. 测试插件功能

#### 测试1: 查看项目列表
在输入框中输入：
```
查看我的视频项目列表
```

**预期结果：**
- ✅ 应该显示项目列表（至少有1个测试项目）
- ❌ **不应该**显示"Tool error"或"ERROR"

#### 测试2: 创建视频任务  
在输入框中输入：
```
帮我生成一个iPhone 15 Pro的商品视频，专业风格
```

**预期结果：**
- ✅ 应该返回任务ID和项目ID
- ✅ 任务状态应该是"queued"或"completed"
- ❌ **不应该**显示"Tool error"

#### 测试3: 查询任务状态
在输入框中输入：
```
查看任务 [上一步返回的任务ID] 的状态
```

**预期结果：**
- ✅ 应该返回任务进度和状态
- ✅ 状态应该是"完成"(100%)

## 常见问题排查

### 如果看到"Tool error"

1. **检查服务状态**
```bash
curl http://127.0.0.1:18789/
curl http://127.0.0.1:3024/projects
```

2. **查看后端日志**
```bash
tail -50 ~/.openclaw/hyperframe/backend-manual.log
```

3. **重启服务**
双击桌面的"OpenClaw视频编辑.command"

### 如果插件无法调用

1. **检查环境变量**
```bash
grep VIDEO_AGENT ~/.openclaw/hyperframe/backend-manual.log
```
应该看到：`VIDEO_AGENT_BRIDGE_URL = http://127.0.0.1:3024`

2. **手动测试bridge-server**
```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node test-openclaw-plugin.mjs
```

## 测试脚本

### 自动化API测试
```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node test-openclaw-plugin.mjs
```

### 诊断连接问题
```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/diagnose-openclaw-connection.mjs
```

### 完整连接测试
```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node test-openclaw-connection.mjs
```

## 验收标准

✅ **基础功能验收**
- [ ] 能够查看视频项目列表
- [ ] 能够创建新的视频任务
- [ ] 能够查询任务状态
- [ ] 插件调用无ERROR提示

✅ **商品视频生成验收** 
- [ ] 能够指定商品信息（名称、描述、分类）
- [ ] 能够选择视频风格（专业/活泼/简约）
- [ ] 返回有效的任务ID和项目ID
- [ ] 任务状态正常显示

✅ **系统稳定性验收**
- [ ] 服务启动脚本可靠（双击.command文件）
- [ ] 服务健康检查正常
- [ ] 无端口冲突
- [ ] 无进程残留

## 已修复的问题

1. ✅ bridge-server端口硬编码 → 改为环境变量
2. ✅ 服务启动不稳定 → 增强守护脚本
3. ✅ 日志路径错误 → 修正为backend-manual.log
4. ✅ 诊断脚本缺失 → 新增完整诊断工具

## 下一步工作

完成手动测试后，需要：

1. **记录测试结果** - 每个测试用例的实际表现
2. **截图证据** - 成功和失败的界面截图
3. **性能数据** - 响应时间、任务完成时间
4. **bug清单** - 发现的任何问题和错误信息

请在浏览器中完成上述测试，并告诉我测试结果！
