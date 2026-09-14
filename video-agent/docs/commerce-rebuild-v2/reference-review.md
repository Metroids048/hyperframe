# G2 实际参考与差距证据

2026-09-14；证据目录 outputs/commerce-rebuild-v2。此记录不代表 G2/G3 已过关，也不代表六片已交付。

| 官方参考 | 实际检查片段 | 可见机制与本项目验收标准 | 来源及兼容 |
|---|---|---|---|
| HyperFrames Launch | 0.6/2/4/7/10/12秒；完整解码，12秒1倍速浏览器播放 | 奶白底上的巨大衬线文字逐段形成，进入大幅主体；信息有主次与阅读停留。新片验证主体尺度、标题揭示及停留，不复制官方品牌 | https://github.com/heygen-com/hyperframes-launches/tree/main/hyperframes-launch；Launch完整工程含GSAP/Lottie/Three/shader。本轮取CSS遮罩与GSAP时序，未声称全部运行时兼容 |
| Capstone timeline default v2 | 3/6/9/12/16/20秒；完整解码，12秒1倍速浏览器播放 | 持续绿色基线与指针穿过代码、轨道、图表；停留后推进。新片验证整体/细节位置关系、共同锚点和推进后稳定阅读 | https://hyperframes.heygen.com/prompting/capstone；本轮实现CSS/GSAP确定性seek，无GPU扩展依赖 |
| Variables Launch | 1/3/6/10/14/18秒；完整解码，12秒1倍速浏览器播放 | 固定中心排版替换强调词，随后视频位于参数面板之间；风格变化不破坏信息骨架 | https://github.com/heygen-com/hyperframes-launches/tree/main/variables-launch；本轮验证独立标题/媒体/强调色，不整段烤平 |

实际MP4、逐帧接触表、浏览器播放截图位于 references/；playback-evidence.json记录time/rate/frame计数。播放为静音浏览器验证，不冒充真人听音。源码检出提交 launches=6259ea7aa45042fa6ebf941538cf7621cf6dad0f，framework=10e8447ac0dfe6144cc224435e7399d45d7a126d。运行引擎仍为项目锁定0.8.33。框架Apache 2.0与官方工程素材许可分别核对：Launch示例源码/媒体按README仅参考使用，不复制进入新商品交付。

## 相同输入对照

输入：g2-inputs.json及g2-request.txt；两张Caleb Oquendo/Pexels黑色耳机照片、原创轻节拍音轨，12秒横屏。A是开发者HTML校准，examples/commerce/rebuild-g2-A；B从真实WebUI上传和提交，project=d10732b4-bbdf-4dbb-b527-9a5451b4b31a，run=262dd99b-5a6d-4464-864e-819648f56994。B未接收A源码/分镜。A/B准备有重叠，不把本次时序写成严格A完成后才启动B。预算始终累计同一run。

## 已复现的实际损失：最终组装丢弃图片镜头源码

lib/creative/production.mjs project.assemble对全图片镜头原先设置sources[i]=null，导致nativeScenePlan选择media-cut；已审镜头源码中的布局、标题时序、图形及锚线未进入原生工程。不是单纯Prompt形容词不足。

工程级最小复现（明确不是模型B）：同一照片、同一源码，assembly-before/diagnostic.mp4只剩满幅图与底部标题；assembly-after/diagnostic.mp4保留左侧大字、右侧商品和紫色锚线。前者2节点/0源码包，后者3节点/1源码包。实际HyperFrames check/render及关键帧已查看。

修复取消全图片时的null分支，仍经过normalizeMediaBindings和受限源码验证；未开放任意JS，未修改隔离权限。实际project.assemble回归测试覆盖原生custom-native选择、独立图形对象及scaleX时序保留。真实B成片仍待评估，不能用这个工程复现替代应用验收。

## 第二处已在真实B中确认的损失

B的story-plan.json第二幕明确productionMethod=composition-adapt，visualDirection要求引导线分别指向头梁和耳垫。实际scene-002.json却来自resources.instantiate_native：固定图卡、三条0.5秒淡入及18px位移，没有引导线。原因是native-recipes.mjs强制把composition-adapt转为parameterized。修复保留导演方法，parameterized仍可明确选择，composition-adapt进入实际受限源码制作。

同时停止在最终组装/方向预览重建模板源码：被检查和局部修过的源码作为权威，保留原始来源收据并标记validated-checkpoint-source；最终仍重新编译和隔离验证。恢复迁移只使发生方法降级的镜头及依赖组装失效，保留旧源码/收据，预算和run保持。14项相关测试包含真实project.assemble、明确parameterized模式下局部源码不被模板覆盖、同一run恢复前后调用数/预算不变。


## 2026-09-14 WebUI交付后的视觉复核（未通过高级标准）

连续播放证据见 browser-delivery/report.json。以下为实际播放期间截帧可见的问题，非官方质量通过。六条采用同一基础参数化布局序列，sourceBundles为空；不应描述为弧线接力、源坐标导航或节拍杂志已实现。

- N1 `rev-e7a84d122046deb8`，7.2–15.0 / 21.7–28.7秒：左右分栏的短标签过小且换行，局部镜头裁切过紧；最小修复范围为第2/4幕图片取景与文字排版。 实际证据：`outputs/commerce-rebuild-v2/browser-delivery/N1-contact.jpg` 及同目录带实际播放时间的截图。
- N2 `rev-06757d88e977e20d`，0–40秒：没有贯穿整体位置参照与可验证移动放大镜；当前为普通分区与局部图卡，不能判结构导航通过。 实际证据：`outputs/commerce-rebuild-v2/browser-delivery/N2-contact.jpg` 及同目录带实际播放时间的截图。
- N3 `rev-1f8c49c25af67f90`，0–9.6 / 9.3–28.2秒：标题下仍有制作要求式文字，中段为“场景展示/细节近看”，未形成随动作变化的步骤图解；最小修复范围为对应文字对象和时间。 实际证据：`outputs/commerce-rebuild-v2/browser-delivery/N3-contact.jpg` 及同目录带实际播放时间的截图。
- N4 `rev-fae7fc5853efb6f8`，0–30秒：图片与基本淡入布局重复，未看到杂志式文字与形状匹配主机制。 实际证据：`outputs/commerce-rebuild-v2/browser-delivery/N4-contact.jpg` 及同目录带实际播放时间的截图。
- N5 `rev-ef53679b0e8432ea`，0–15秒：耳机整体被竖屏cover裁切，价格与条件没有参与独立海报式构图。 实际证据：`outputs/commerce-rebuild-v2/browser-delivery/N5-contact.jpg` 及同目录带实际播放时间的截图。
- N6 `rev-d23656aef98b4594`，0–20秒：问题文案存在，但没有贯穿问题—证据的路径对象；不能将通用细节图卡视为路径推演。 实际证据：`outputs/commerce-rebuild-v2/browser-delivery/N6-contact.jpg` 及同目录带实际播放时间的截图。
