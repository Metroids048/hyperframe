# Hyperframe 本地视频工作台

## 下载后运行当前项目

支持 Git 检出或 GitHub 下载 ZIP。安装 Python 3.10+ 与 Node 22+ 后，在仓库根目录运行：

```sh
python start.py all
```

启动器会安装锁定依赖、恢复随仓库交付的内容、构建当前 WebUI，并打开实际启动地址；启动不会自动提交或推送。默认首页是电商视频创作工作台：保留目标、画幅、场景和顶部作品下拉框，已移除素材目录和历史样例区域。顶部选择“米家相机 · 广告精剪 V2”即可播放、下载视频和原生工程。

只同步远程、不启动服务时：

```sh
python start.py push
```

或在仓库根目录运行 `python push.py`。大于 GitHub 单文件限制的视频会写入 `workspace-content` 分块。本机配置和凭据由同步脚本排除，换设备后需在本机单独配置。日常源码开发与拉取、合并、验证、推送流程见 [工作区同步说明](video-agent/docs/WORKSPACE-SYNC.md)。

若默认端口已被另一个目录的工作台占用，启动器使用新端口并打印、打开正确地址，不复用其他仓库的页面。`/edit` 是保留的旧剪辑入口，`/create` 是早期生成入口；它们不是当前首页。

## 项目架构与代码地图

- [整体架构与视频任务链路](PROJECT_ARCHITECTURE_GUIDE.zh-CN.md)：按当前工作树说明目录职责、输入到成品的主链、HyperFrames 资源调度，以及 OpenClaw / HyperFrames 的改造边界。
- [架构图 PNG](PROJECT_ARCHITECTURE.png)：可直接查看和分享；[Mermaid 源文件](PROJECT_ARCHITECTURE.mmd)可继续编辑。
- [video-agent 代码与配置清单](PROJECT_CODE_INVENTORY.md)：当前工作树中 1740 个源码、配置和文档路径的分区清单。

## 随仓库交付的内容

- [米家 V2 MP4](video-agent/deliverables/mijia-v2/mijia-product-ad-v2.mp4)
- [米家 V2 原生工程 ZIP](video-agent/deliverables/mijia-v2/mijia-v2-hyperframes-project.zip)
- [完整工作区内容清单](workspace-content/manifest.json)：本地素材、工程版本、成片、对照、审查和测试证据，以去重后的字节块保存，单块小于 GitHub 单文件限制，无需 Git LFS。
- 当前源码、官方固定子模块、原有示例和素材继续保留。

`start.py` 自动恢复运行必需的工程和交付内容；需要把全部历史证据也展开到原路径时运行：

```sh
python video-agent/scripts/workspace-content.py --all
```

恢复逐块校验 SHA-256，保留已有文件；已存在的本地工程整体保留，不混入快照版本。缺失或损坏的仓库内容会明确报错。本机配置、凭据、依赖与可重建缓存不随源码同步，内容包排除项记录在清单中。

米家 V2 保留参考作者作品身份，不因此变成产品 Agent 自动生成验收。人工认可状态保持原有记录，不自动通过。
