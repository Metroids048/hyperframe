# R1 当前交付与12项验收

更新：2026-09-15。**当前是可审阅候选，R1 尚未全部完成。**

已保留本地工程、素材和改动；没有重建、回退或推送。审查基线为 `46c6ff6066fba063f18b0fd057180eece65994fc`。本地根目录没有 `.git`，只读基线在 evidence/baseline-repo。HyperFrames 仍为0.8.33。执行服务经 start.py 启动，沿用已有订阅配置。

## 可直接检查的交付

- [原工作台：精剪当前版本](http://127.0.0.1:3020/?project=1e8ec7c7-d4b3-4a5d-8c41-10e768bcd4dc)
- [重开后的工作台：基础对照版](http://127.0.0.1:3020/?project=8f41aa0c-c7fa-422f-87f3-91bcd100fd42)
- [30秒精剪候选 MP4](C:/Users/admin/Desktop/hyperframe-main/video-agent/outputs/r1-closeout-delivery/03-detail-chromatic.mp4)
- [基础候选 MP4](C:/Users/admin/Desktop/hyperframe-main/video-agent/outputs/r1-closeout-delivery/04-basic.mp4)
- [并排对照：左基础、右精剪](C:/Users/admin/Desktop/hyperframe-main/video-agent/outputs/r1-closeout-delivery/05-basic-left-polished-right.mp4)
- [精剪原生工程，含初始与两次修改历史](C:/Users/admin/Desktop/hyperframe-main/video-agent/outputs/r1-closeout-delivery/03-detail-chromatic-native.zip)
- [基础版原生工程](C:/Users/admin/Desktop/hyperframe-main/video-agent/outputs/r1-closeout-delivery/04-basic-native.zip)
- [初始候选](C:/Users/admin/Desktop/hyperframe-main/video-agent/outputs/r1-closeout-delivery/01-original.mp4)、[第一次字幕修改版](C:/Users/admin/Desktop/hyperframe-main/video-agent/outputs/r1-closeout-delivery/02-subtitle-edit.mp4)

目录内标记 `before-admission-fix` 的旧包仅为故障证据，不是交付工程。当前两个交付ZIP没有凭据配置或字体文件；使用本机字体，异机仍须具备适用字体。ZIP以内容哈希存储文件，不能只按ZIP条目名称判断工程记录是否存在；真实重开已验证完整记录与历史。

## 12项真实状态

|编号|状态|实际证据与边界|
|---|---|---|
|C01|本地限定等价通过；远端未验证|evidence/staged-clean.log：独立干净安装、限定40项检查。修复third_party交付、子模块URL/恢复、官方源依赖及shader惰性加载。两条远端CI未推送重跑，不能称远端通过。|
|C02|正确行为回归通过；真实UI已有素材分支通过|evidence/r1-final-regression.log、r1-followup-regression-20260915.log。营销按持久化镜头缺口决策，保留模式/场景下拉；真实供应商image/video仍未执行。|
|C03|隔离回归通过|三画幅映射及缓存身份检查；不支持请求提交前阻断。没有真实付费三画幅输出。|
|C04|隔离回归通过|锁内重读、并发/重试去重、未知提交先对账、持久取消；未把本地文件数量当真实提交次数。见R1回归。|
|C05|故障注入回归通过|部分成功后复用已完成镜头sha、查询原task、续作缺失镜头。真实耳机制作也多次从同一job恢复；这不是RunningHub真实故障恢复。|
|C06|本地回归与当前UI通过|实际阶段与产物驱动状态；本片观察到理解修改、渲染84%、媒体检查、打包、完成与可下载结果。历史错误保留；已修成功修改摘要与重开进度文案。|
|C07|回归与本片范围检查通过|确切名称/URL/别名、否定和首转场范围、无匹配不假resolved。edit2-invariants.json证明仅首处chromatic-split，第二处不变；未声称全目录适配。|
|C08|本片实际渲染通过|current-shader-seek.json及原生取样：同一1.567秒三次PNG哈希一致；真实UI前进到8秒再回到转场。comparison-mp4覆盖转场前中后、字幕与首尾。|
|C09|受阻，未执行|本地未发现有效RunningHub Key/授权配置；无新增RunningHub付费调用，不拿已有视频充当真实生成输出。|
|C10|已有素材WebUI闭环通过；生成全链未通过|同一原job自动完成候选MP4+原生工程导出；900帧、30秒、1080×1920、30fps、无音轨、完整解码通过。不能替代C09要求的生成链路。|
|C11|部分完成|同一原工程完成两次指定修改并各自导出；实际UI撤销/重做；完整包重开保留3版本，再修改基础版并重新渲染导出。第三次指定结尾文案未提供，已请求输入；没有把基础对照修改冒充第三次指定修改。|
|C12|候选对照与技术/抽帧检查完成；人评待审核|comparison-invariants.json证明两版素材、源区间、镜头、文字、布局、音轨和规格一致。两条独立竖屏片及并排对照完整解码，12时点实际帧已观察。未签人工认可。|

## 当前版本与检查范围

原工程：初始 `rev-15a95c50d27634af` → 字幕编辑 `rev-5c114c9dd0b2f1be` → 细节提前/色散 `rev-fc2150f90243a259`。

第一次仅将“看看结构细节”改为“结构细节”并移到y=1450，源镜头、声音、时序与转场不变。第二次使实拍从第73帧提前到第43帧，片头减少30帧、片尾增加30帧，源实拍区间与速度不变，总长900帧；首转场9帧chromatic-split、第二转场9帧淡化。均无生图/生视频/TTS。

重开工程保留上述三个原始revision、节点、源Bundle、素材、声音与转场；evidence/reopen-invariants.json。基础版 `rev-407d68eb4792b7ad` 在重开工程上生成，真实界面再次导出，非仅取旧MP4缓存。

媒体帧覆盖0、1.4、1.567、1.767、6.7、6.8、8、9.2、20、26.417、28、29.967秒。已观察主体一致、结构文字位于媒体框下方、直接显隐/渐变区别、首处色散与第二处淡化、结尾稳定。源视频本身为横幅，采用contain保留画幅；不能修复原片已经超出取景范围的内容。技术检测没有黑帧区间或重复源区间；片头/片尾为明确静图，不假称动态镜头。抽帧和播放器检查不代替真人完整观片与认可。

## 来源、成本与耗时

商品为银白色头戴耳机。素材池 `assets/r1-headphones`，同源视频及抽帧图；只作为内部审查素材，商业权利未确认。没有新增商品性能、价格、品牌承诺。全片静音，未合成声音。

资源锁、真实回执与参数随原生包提供。当前运行时0.8.33，资源快照commit `6e3308be4f2ab886597fcee7c5896a5f842ec4b6`。原生展示/文字结构、蓝图改编、官方色散的执行方式在resource-receipts.json分别标注；蓝图改编不声称逐字安装官方组件。历史说明文件仅按已登记commit及精确sha打包，不能充当当前可执行适配器。没有完成所有官方Examples或全量目录的真实渲染验收。

RunningHub新增费用为0（未调用）；已有模型订阅实际调用，货币成本不可从本地记录精确得出，不估造金额。初始工程16:54创建，期间多次模型超时和修复恢复；最终create记录323.8秒仅为最后一次恢复计时，不能当全过程耗时。字幕修改86.1秒+导出125.4秒；色散修改76.0秒+导出130.9秒；成功重开131.2秒；基础修改133.2秒+导出178.4秒，另保留一次71.6秒失败记录。

## 回归与未完成项

core报告为passed；npm test 20/20。browser聚合报告曾因一次12秒导航等待失败，报告保持failed；失败的test-conversation-media已独立重跑退出0，日志conversation-media-resume-retest-20260915.log。当前补修的离散文字显隐、不可见负例及假运动负例真实浏览器3/3通过；原生包/历史参考/隔离预算组合24/24通过。附件probe只用于旧缺陷复现，不计产品通过。

尚需用户给出第三次替换的确切结尾文字，随后在原工程继续第三次修改、导出与重开检查。RunningHub真实输出/成本链路需本地有效Key和已有授权；远端CI需可推送工作副本和相应权限。人工审阅保持pending。
