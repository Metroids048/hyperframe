# 资料来源与界限

sources/AUDIT_BASELINE.md：上一轮审查与W0—W5增量；其已验证和未验证边界保持。
sources/INHERITED_CONTRACT.md：八场景完整合同与77个子编号旧项及模块段落义务。
sources/SCENARIO_DESIGN.md：人读业务正文；本文按场景六步分解，不重写所有业务目标。
sources/ROUTING_AUDIO_REFERENCE.md：通用意图、兜底与多轮编辑设计；其中旧MiniMax未接入状态由最新审查实际成果更新。

执行计划参考：OpenAI官方 https://developers.openai.com/cookbook/articles/codex_exec_plans 。采用独立可验证里程碑、当前工作树、自包含恢复和持续更新；不引用其早期模型推荐或长时运行样例作为本项目保证。
项目指令加载参考：OpenAI官方 https://learn.chatgpt.com/docs/agent-configuration/agents-md 。因此启动需核对实际生效AGENTS链，而不是认为任意agent.md/codex.md文件名都会自动加载。
HyperFrames装配参考：本会话可用hyperframes-registry Skill和 https://hyperframes.heygen.com/catalog 。block/component/example/skill的真实处理按锁定本地版本确认；轨道顺序与视觉z-index不能根据不同版本文档的一句话草率等同。

MiniMax文档在实施时按账户区域核对：语音/v1/t2a_v2、音色POST/v1/get_voice、音乐/v1/music_generation及实际错误码。本文不冻结模型名、价格或区域端点，也不以未经复核的410推断所有用户不可用。

本轮实际工作：读取给定文件、继承约束、拆解任务、生成依赖图和文档、运行资料级检查。未访问新的仓库推送、用户localhost或密钥，未执行生产代码/付费API/成片验收。任务状态不预填通过。
