# Hyperframe 八场景Demo制作方案

基线：`90c78f037c2c483b5e3fe8abf2b9fb679ffe8ad3`（main核对于2026-09-17）。本版响应最新要求：从全局层规划转入逐场景真实业务交付。已有能力继续用，阻塞当前成片的共同问题就地修复；不再等待另建全局Router等五个计划文件完成后才生产。

## 已核实与尚未核实
已核对素材目录十条文件、八场景设计、场景配置加载代码和S02既有音频交付记录。素材匹配基于仓库文件信息与可访问来源页，**本轮未取得视频文件连续观察/解码，也未成功下载新增视频，未调用用户本机生产服务或生成新MP4**。下面是明确的制作初选和验收合同，不是“所有素材已合适”的结论。

前两轮回复的完成百分比不是项目实测统计，不作为制作准入或交付依据。以真实调用链、当前输入和产物证据为准。

## 范围和成片数量
采用当前S01—S08，不另造场景编号。S01—S06为业务目的，S07精剪与S08多版为任务模式，仍继承母工程业务规则。S01—S07各至少一条完整片，S08至少两个独立派生片，**至少九条场景交付视频**。多轮修改后的版本不冒充额外场景。

## 1. 素材对应（初选）
| ID | 已存在的仓库文件 | 候选场景 | 处理 | 来源页 |
|---|---|---|---|---|
| MAT-01 | `素材/8004703-uhd_3840_2160_25fps.mp4` | 不强配 | 待本地观察，不能由数字文件名推断商品或场景 | 本轮未核实来源页 |
| MAT-02 | `素材/ASUS_PROART_RTX_4070_Ti_Unboxing_-_By_INVADERPC.webm` | S02、S08 | S02优先复用既有原生工程；S08复用通过检查的S02母版 | https://commons.wikimedia.org/wiki/File:ASUS_PROART_RTX_4070_Ti_Unboxing_-_By_INVADERPC.webm |
| MAT-03 | `素材/Best_technology_First_test_-_Metal_3D_printer-2015-HD.webm` | 不强配 | 不列为本轮消费电商主Demo；可作为工业流程/通用精剪备用 | https://commons.wikimedia.org/wiki/File:Best_technology_First_test_-_Metal_3D_printer-2015-HD.webm |
| MAT-04 | `素材/Bestandteile_eines_Smartphones.webm` | 不强配 | 不用于某个具体手机SKU的详情正例；科普备用 | https://commons.wikimedia.org/wiki/File:Bestandteile_eines_Smartphones.webm |
| MAT-05 | `素材/Elsa_Lee_Paris_-_Parisienne_2017_-_Vimeo.webm` | S04、S07 | S04视觉参考；只有确认多商品身份和足够重组空间后才作为输入备选 | https://commons.wikimedia.org/wiki/File:Elsa_Lee_Paris_-_Parisienne_2017_-_Vimeo.webm |
| MAT-06 | `素材/Nissin_Cup_Noodle_Gohan_curry_flavoured,_-2013_a.webm` | S03 | S03使用教程首选候选，动作与包装文字须本地逐段核对 | https://commons.wikimedia.org/wiki/File:Nissin_Cup_Noodle_Gohan_curry_flavoured,_-2013_a.webm |
| MAT-07 | `素材/Steam_Deck_Unboxing.webm` | S01、S06 | 分别制作商品亮相与盒内实物问答；复用素材而不复用同一信息结构 | https://commons.wikimedia.org/wiki/File:Steam_Deck_Unboxing.webm |
| MAT-08 | `素材/Video_of_a_complete_use_session_with_a_gyroscopic_exercise_tool.webm` | S07 | S07原意保持型精剪首选候选 | https://commons.wikimedia.org/wiki/File:Video_of_a_complete_use_session_with_a_gyroscopic_exercise_tool.webm |
| MAT-09 | `素材/Xiaomi_MiJia_4K_Action_Camera_Unboxing.webm` | 不强配 | 保留原件；不作为本轮S01/S03成果认定 | 本轮未核实来源页 |
| MAT-10 | `素材/invideo生成.mp4` | 不强配 | 保留为待审参考；不计为本项目Agent产出 | 本轮未核实来源页 |

保留每条素材原件。数字文件名和“生成”文件名不能证明内容；原广告只改标题不能当Agent从素材制作。首饰和香水补镜头详见`04_SUPPLEMENTAL_SOURCES.json`；补充项均未下载，无本地SHA，不称已补齐。

## 2. 八场景制作安排
| 场景 | Demo主题 | 素材ID | 目标输出 | 路由期待 | 最少实片 |
|---|---|---|---|---|---|
| S01 新品首发／品牌亮相 | Steam Deck既有型号亮相演示 | MAT-07 | 24秒 / 9:16 | `product_launch + create` | 1 |
| S02 商品详情／卖点图解 | ASUS ProArt显卡结构详情 | MAT-02 | 35秒 / 16:9 | `product_detail + edit` | 1 |
| S03 开箱／安装／使用教程 | 即食饭调制流程演示 | MAT-06 | 55秒 / 16:9 | `product_demo + create` | 1 |
| S04 穿搭／组合／系列展示 | 首饰单品与佩戴组合 | pexels-9430537、pexels-9430543、pexels-9430550 | 30秒 / 9:16 | `product_collection + create` | 1 |
| S05 活动促销／直播预告 | 香水视觉＋明确虚构的直播演示活动 | pexels-8447362、pexels-8447672、pexels-8453909 | 22秒 / 9:16 | `product_promotion + create` | 1 |
| S06 选购说明／场景问答 | Steam Deck这次开箱的实物清单问答 | MAT-07 | 30秒 / 16:9 | `product_faq + create` | 1 |
| S07 已有视频精剪与包装 | 握力球过程片精剪 | MAT-08 | 55秒 / 16:9 | `product_demo + recut` | 1 |
| S08 一稿多版／开头／画幅调整 | S02显卡母版的开头版＋竖屏版 | MAT-02 | 35秒 / 16:9 + 9:16 | `product_detail + variant` | 2 |

同一素材用于S01与S06是故意的差异验证：商品亮相与购买前问答必须有不同取舍与证据组织，不能仅换片头。S08与母版复用同素材属于该场景本身。

## 3. 推荐执行顺序
**S02 → S03 → S01 → S04 → S05 → S06 → S07 → S08。**

S02先复用已成功的声音、字幕、原生工程，同时复现和修复记录中的实际视觉问题，最快建立可依赖母版。S03验证动作链，再做亮相、组合、活动、问答，最后证明精剪与多版复用。顺序是就绪任务间优先级；只有S08有硬前置S02。外部缺项不强行跳成成功，也不拖停无关场景。

每次只允许一个生产主任务/写入者。每场景走完输入准入→普通需求→Agent取舍→资源执行→完整片→局部问题修复→八轮对话→原生包重开。通过一项立即冻结有效证据；后续只复验受影响部分，不机械把八片全部重做。

## 4. S02复用边界
已有记录：`video-agent/deliverables/minimax-audio-integrated-20260916/verification.json`。记录35秒、1920×1080、30fps、八个版本，TTS换声/字幕保持/音乐入轨与撤销重做；它明确把创意与听感认可留给用户。

远端该交付目录实际列出MP4、frame-32s.png和verification.json，没有直接列出历史ZIP；验证记录中的ZIP是本地路径，不能假设已经上传在同目录。先从本地原生工程或项目既有workspace恢复机制定位历史包，找不到时记录具体缺口，不以MP4重新导入冒充分层。先核对原生包、当前版本以及普通需求产生的Agent来源。记录中的19.2秒暗/虚细节、33.4秒整体与三视角、说明底板先于文字仅是需复现的检查点，不在未看新修订时断言仍有问题。只修复复现项。MiniMax音乐HTTP410是该记录中的限制，现场重新查当前状态；无需更换已有效的TTS链或无关供应商。

## 5. 场景配置如何进入生产
沿现有`lib/creative/service.mjs`消息入口到`message-routing.mjs`、`workflow-intent.mjs`、`commerce-skills.mjs`。六类配置保留在`commerce/scenes/`，由`scene-package.mjs`按阶段加载。`RESOURCE_PROFILE.json`/`COMPONENTS.json`/`TEMPLATES.json`是候选与约束，实际资源经`resource-catalog.mjs`和现有执行器绑定到原生对象。

关键不是一次加载所有skills/templates，而是本场景需求匹配实际能力。每片至少有一个明确服务业务的视觉机制，并在实际画面、源码/对象、资源回执中对应；没有必要时不加效果。强效果不遮挡教程关键动作、不改变商品颜色、不把问答边界藏成小字。

## 6. 商用目标与演示素材边界
来源页许可不等于所有商品/人物/商标/音轨均已获投放授权。显卡与掌机Commons来源有License review needed提示；珠宝/握力球还有相同方式共享要求。Pexels页面允许免费使用和修改，同时禁止暗示人物或品牌背书。署名、修改声明、许可证明和需要的第三方授权随工程记录。

S05没有用户提供的真实活动，采用显著标注的虚构测试事实包，只证明活动链路；真实投放必须换入已确认活动字段与已放行素材。未授权素材可以保持候选/研究资料状态，不能因已在本机就忽略许可，也不能标“直接商用通过”。这与技术、业务演示通过分开记录。

## 7. 不再膨胀范围
不增加商品图/原始镜头生成，不新建WebUI或Agent服务，不把全量116卡重新规划作为前置。重构仅限当前Demo必须的断点；安全、事实、主体保护、版本隔离和原生可编辑门槛保留。全部生产通过现有消息链，不由Codex手写终片绕过产品Agent。

逐场景完整业务稿、初始需求和八轮编辑详见`scenes/S01.md`至`S08.md`。
