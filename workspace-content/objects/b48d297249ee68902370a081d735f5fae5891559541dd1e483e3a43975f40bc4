# 固定提交的 GitHub Actions 证据

仓库：Metroids048/hyperframe
提交：46c6ff6066fba063f18b0fd057180eece65994fc
查询日期：2026-09-15
证据来自 GitHub 连接器读取真实 workflow runs、jobs 和 job logs，不是本会话执行的 CI，也不是本机问题推测。以下为相关日志摘录，不是完整日志。

## 1. Conversational editing checks

Run: 34943708804；conclusion: failure。
Windows job 104298073999 与 Ubuntu job 104298074231 均在 checkout 步骤失败；其后的环境安装、核心回归、浏览器/媒体验收均 skipped。

Ubuntu 原始日志定位：
`https://github.com/Metroids048/hyperframe/actions/runs/34943708804/job/104298074231`

相关原文：

```text
2026-09-15T07:50:42.2140927Z ##[error]fatal: No url found for submodule path 'third_party/hyperframes' in .gitmodules
2026-09-15T07:50:42.2173931Z ##[error]The process '/usr/bin/git' failed with exit code 128
```

同时有 68 个文件应为 LFS pointer 但不是的警告。该警告需审查，但不把它错误地当成本 job 的直接 fatal 原因。

## 2. Commerce native pipeline

Run: 34943708823；job: 104298073890；conclusion: failure。
Checkout、Node 安装、媒体工具安装与 npm ci 已成功，随后 staged production regressions 失败。后续原生测试、路由检查、30秒竖屏渲染与上传结果均 skipped。

原始日志定位：
`https://github.com/Metroids048/hyperframe/actions/runs/34943708823/job/104298073890`

相关原文：

```text
2026-09-15T07:51:10.4975525Z # Error: ENOENT: no such file or directory, open '/home/runner/work/hyperframe/hyperframe/third_party/hyperframes/registry/blocks/chromatic-radial-split/chromatic-radial-split.html'
2026-09-15T07:51:10.4977944Z #     at file:///home/runner/work/hyperframe/hyperframe/video-agent/lib/creative/chromatic-split.mjs:5:14
2026-09-15T07:51:10.5031437Z not ok 1 - scripts/test-commerce-next.mjs
2026-09-15T07:51:10.5045668Z not ok 2 - scripts/test-commerce-quality-next.mjs
2026-09-15T07:51:10.5050140Z # pass 0
2026-09-15T07:51:10.5050314Z # fail 2
```

这是两个测试文件在导入阶段失败，不能解读为里面的全部业务断言都执行并失败。

## 3. 源码交叉核对

- 固定提交的根 `.gitmodules` 经 GitHub fetch_file 返回 404。
- `third_party/hyperframes` 与 `third_party/hyperframes-launches` 在仓库内容接口中是零长度关联提交项，而不是已展开的源码文件夹。
- `video-agent/lib/creative/chromatic-split.mjs` 顶层同步读取 `third_party/hyperframes/registry/blocks/chromatic-radial-split/chromatic-radial-split.html`，与 CI ENOENT 堆栈一致。

## 4. 结论边界

不能宣称最新提交 CI 已通过；也不能归因为所有测试断言失败。直接问题是仓库依赖交付/加载不完整，导致校验链路先行中断。
不推测用户 Mac 上已下载目录不存在，不要求把个人密钥推到仓库。修复应保证干净检出可恢复必要的锁定资源，同时保留已有本地素材和未提交修改。
