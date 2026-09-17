# 工作台：GitHub 与本地文件融合规则

目标不是“启动时强制把本地变成 GitHub 的样子”，而是让工作台每次启动都知道**本地现在是什么、GitHub main 最新是什么、哪些文件不能覆盖、Agent 应该按哪套规则工作**。

## 启动时发生什么

Windows 使用 `start-local.ps1` 时，服务启动前会先运行：

```powershell
node scripts/workspace-context.mjs --fetch-soft
```

它会读取当前 `package.json`、skills 注册表和 Agent prompt；如果当前目录是 Git checkout，还会尽量刷新 `origin/main`，再写出 `outputs/workspace-context.json`。网络失败只记录 warning，不阻止离线工作台；HyperFrames 版本或 skills 契约损坏则会直接阻止启动，避免在半配置状态下继续运行。

工作台本身始终执行**磁盘上的当前文件**。GitHub 只作为上游参照，不能直接覆盖用户尚未提交的本地改动。

## 四种状态

| 状态 | 处理方式 |
|---|---|
| 本地 clean，和 `origin/main` 一致 | 直接工作 |
| 本地 clean，但落后 main | 开发前可 fast-forward 更新 |
| 本地有修改 | 以本地文件为执行源，先保留和理解改动，不 reset/clean |
| 本地有修改，同时 main 更新 | 做三方融合：共同基线 + 本地修改 + GitHub 修改；冲突逐项解决并重新测试，不能让任意一边静默覆盖另一边 |

从 ZIP 或普通文件夹启动时进入 `standalone-local`，Agent 仍可工作，只是不做 Git 同步。

## Agent 的固定 prompt

`prompts/workbench-agent.md` 是工作台 Agent 的统一启动 prompt。Claude 入口由 `CLAUDE.md` 指向它；仓库根 `AGENTS.md` 也要求进入 `video-agent` 后先读取它。Prompt 明确：

- local files are the execution source；
- `origin/main` 是 upstream reference；
- 永不丢弃未提交的本地文件；
- `outputs/` / cache / MP4 不是源码；
- HyperFrames 固定 0.8.33；
- 先加载相关 skills，再规划；
- 失败不伪造成功，版本发布前先检查；
- 推 main 前重新 fetch、融合并复测，禁止 force push。

## 本机继续开发与跨设备衔接

当前工作目录是 `/Users/a1234/Desktop/hyperframe-main`，`main` 跟踪
`https://github.com/Metroids048/hyperframe.git` 的 `origin/main`。
直接在这个目录继续修改，不再解压一份新的项目。

开始工作时先检查状态；工作区干净时拉取最新提交及锁定子模块：

```sh
git status --short --branch
git pull --ff-only origin main
git submodule update --init --recursive
python3 video-agent/scripts/workspace-content.py --all
```

有未提交修改时先提交本轮源码，或明确保存到 stash（包含未跟踪文件）；
分支发生分叉时做三方合并并复测，不能用强制重置覆盖任何一边。
全量内容恢复保留已有文件和整个本地工程，不会用快照覆盖本地新修订。

完成修改后，检查 diff、暂存本轮文件、提交、重新 fetch 并合并新增远端进度，
验证后执行 `git push origin main`。用以下命令确认两边提交一致：

```sh
git fetch origin
git rev-list --left-right --count HEAD...origin/main
git status --short --branch
```

计数应为 `0 0`，工作区应无未提交源码。编辑文件本身不会自动提交或推送；
启动器的工作区检查也只刷新上下文。新增工程和大型媒体需要另用已有
`python3 start.py push` 打包同步，运行前检查打包范围，避免把临时测试输出
当成项目进度。本机配置、凭据和依赖缓存保留本地，不纳入源码提交。

本机启动：在仓库根目录运行 `python3 start.py all`。启动器会使用
`video-agent/config/start.local.json` 中已有的 Node 路径、数据目录和端口。
如果终端没有 Node/npm，用启动器构建；需要单独运行 Node 脚本时使用该配置中的
Node 可执行文件，并把其目录加入当前终端的 PATH，不改动系统全局配置。

## 验证命令

```powershell
npm run doctor:workspace
node scripts/verify-editor.mjs core
node scripts/verify-editor.mjs browser
npm test
```

`doctor:workspace` 不会修改工作树。它只生成上下文和建议动作，因此可以安全地在每次工作台启动前运行。
