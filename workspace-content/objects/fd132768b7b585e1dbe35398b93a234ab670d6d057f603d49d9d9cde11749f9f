# 固定提交审查与下一轮收口

本包针对 Metroids048/hyperframe 的 46c6ff6066fba063f18b0fd057180eece65994fc（2026-09-15）。未修改用户仓库，未访问用户本机服务或付费生成账号。

- AUDIT.md：实际源码、CI和隔离复现结论。
- CLOSEOUT_R1.md：单商品主链路收口合同与12项验收。
- START_CODEX.txt：发送到当前本地Codex会话的指令。解压本包到项目中的一个资料目录即可；不用运行包内原模块来替换项目源码。
- evidence/CI_FINDINGS.md：真实CI日志相关摘录及定位。
- evidence/probes/：哈希与固定提交一致的两个原模块、已运行的隔离复现脚本及模拟依赖；evidence/edit是其隔离依赖。不是生产修复，也不是整仓测试。
- evidence/sandbox-clone-attempt.log：本会话容器的克隆网络失败，不是用户机器的故障。

## 复现脚本说明

在本包目录内，使用可用的Node 22+运行 `node evidence/probes/audit-probes.mjs`。此命令在本会话Node v22.16.0已运行，并再次从交付包运行检查。脚本禁用真实fetch，HTTP为模拟，没有付费。fixture目录为脚本自建并清理，不触碰用户工程。

脚本“成功”代表已复现审查时的旧行为，不能作为产品验收通过。修复工程时，应将对应测试转换为正确行为断言。

没有包含API Key、用户认证文件、字体文件或未经实际产生的成片。
