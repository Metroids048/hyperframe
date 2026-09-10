# 24 项对话剪辑质量盲评

当前状态：**pending，尚未判断达到 85 分**。这些文件建立可复现的评测过程；没有预填专家成片、真人评分或成功率。数学单元测试中的虚构分数只用于检验评分程序，不属于产品质量证据。

## 评什么、由谁评

`benchmark.json` 包含 6 个任务组，每组 4 项：时间与重排、内容与选段、字幕与翻译、声音与配音、画面与构图、复合与连续修改。C01～C12 是开发校准集；H01～H12 是保留集，每组分别占 2 项。本次开发不得运行保留集来调提示词、技能或代码。看过保留集成片评分后再调优，必须更换保留集并升基准版本。

专家与 Agent 获得相同原片、相同文字要求、相同可用配乐、相同输出规格。专家熟练使用 HyperFrames 制作参考片；Agent 成片必须来自真实模型运行，最多自动修正两轮，保存模型、应用构建版本、工具版本、任务 ID 和时间记录。给评审的 Agent 文件须为人工改时间线之前的结果。人工补救时间另记，不用补救后的成片冒充自动结果。

至少两位不同的人独立完整看片，并分别评两个匿名候选。两人不交换评分，不看身份映射；评审身份可使用稳定化名。评分包含图像、完整声音、字幕与内容逻辑，不能只看缩略图或转写稿。自动检查是补充证据，不能代替真人评分。

| 维度 | 权重 | 评分依据 |
|---|---:|---|
| 要求完成度与关键内容保留 | 25 | 每项要求是否兑现，重要信息是否遗漏，是否添加未要求内容 |
| 叙事逻辑与选段 | 20 | 选段是否合适，信息与因果关系是否能看懂 |
| 剪切点、节奏和句子完整性 | 15 | 是否切进词或句子，节奏是否自然，是否有无意义空白 |
| 字幕准确、同步与可读性 | 15 | 字词、翻译、时间、断句、位置；未要求字幕时检查是否擅自添加 |
| 配音、混音与音画一致 | 15 | 台词、音色、语速、清晰度、音乐压低、无削波及同步 |
| 构图与视觉完成度 | 10 | 主体完整、画幅、叠层、转场和文字布局 |

每维填 0～100 分。建议锚点：100 为完整达到要求且无需修正；85 为总体可用、有少量可见不足；70 为需要实质修改；50 为多项要求未完成；0 为不可评或完全失败。没有字幕或音乐要求时，按该维的正确保留行为评，不填任意满分；缺少观看证据则保持 pending。

## 素材冻结

基准素材 ID 为 `tos`、`tutorial`、`talk`、`mandarin`、`music`，它们是评测 ID，不要求等同应用自动生成的素材 UUID。每项任务显式列出使用哪些素材。

- `tos`：Tears of Steel 官方原片 185～275 秒，90 秒，真人拍摄与 CGI 合成。该区间已在本轮确认；本基准仍需填入实际文件、哈希与观看确认才能标记 frozen。
- `tutorial`：Blender Viewport Navigation 真实录屏全片，拟使用 221.833 秒版本；以实际文件检测为准。
- `talk`：真实讲话素材，至少 60 秒，含自然停顿。`mandarin`：真实普通话讲话，至少 90 秒。若二者绑定同一份授权采访，必须在素材备注中披露，不能将其统计为两种独立来源。
- `music`：双方共用的授权音乐，至少 30 秒。片段重复使用必须来自同一份已冻结文件。

普通话采访若有烧录字幕，须记录这一特征。任务中生成的可编辑字幕必须避开烧录文字；只能修正新字幕，不能宣称改变了原画面文字。任务 H05 的“听不清”是检查诚实表达，不允许凭已烧录文字猜补不对应的声音。

复制 `asset-inputs.template.json` 为自己的素材清单，填绝对文件路径、来源、许可、署名；实际观看并确认是预期内容后将 `verifiedContent` 设为 true。不要把图片补帧或合成旁白伪装成真人原片。然后运行：

```powershell
node scripts/evaluate-edit-quality.mjs validate
node scripts/evaluate-edit-quality.mjs freeze --assets docs/evaluation/asset-inputs.json --out outputs/evaluation/benchmark.frozen.json
```

冻结会检测文件、时长、哈希和必要声明，写入新的基准文件。命令返回该文件的 SHA-256。修改素材、要求、字幕基准或节选边界后须重新冻结并生成新运行，不能混用旧评分。

## 成片与双评审输入

复制 `artifacts.template.json` 到新的工作文件 `artifacts.json`。填入冻结基准文件的 SHA-256、真实运行信息，以及 24 个任务的专家/Agent 视频路径和 SHA-256。相对视频路径以 `artifacts.json` 所在目录为基准。每个任务的 `inputHashes` 必须与冻结素材逐一匹配；`expert.creatorId` 必须列在运行的 `expertIds` 中。

`agentRun` 保存首轮是否成功、自动修正轮数、人工补救分钟数、耗时、任务 ID、是否有人工时间线修改。技术检查完成后将 `technicalChecks.status` 设为 completed，真实记录损坏文件、丢素材、错误内容、未授权声音、严重音画不同步、错误版本等硬失败。即使技术失败，仍保留记录，不从统计中删掉失败任务。

```powershell
node scripts/evaluate-edit-quality.mjs prepare --benchmark outputs/evaluation/benchmark.frozen.json --artifacts docs/evaluation/artifacts.json --out outputs/evaluation/run-001
```

`prepare` 先核对全部输入和成片。缺数据只输出 readiness.json 与 pending，不生成假视频或评分。数据齐备后生成：

- `reviewer-1/`、`reviewer-2/`：各自的匿名视频和 `review.json`，分别交给对应评审。
- `private/`：随机种子、身份映射、冻结基准和成片清单。由评测管理员保管，不能发给评审。

可选 `--seed` 用于复现随机顺序；种子只能由管理员保留，不应公开给评审。每个新评测使用新的输出目录。两个静态 `reviewer-*.template.json` 只展示字段；正式评审填写 prepare 生成的文件。匿名化处理文件名和展示顺序，不声称视频内容或编码元数据完全无法暴露制作方式；评审不得检查编码元数据或原文件身份。

评审完整观看后填自己的 `reviewerKey`、`independent=true`、ISO 时间格式的 `completedAt`。对每个候选填六个分数、观看确认、问题代码和备注，完成时设 `status=completed`。空分数保留 null，不能填 0 代替“还没看”。

```powershell
node scripts/evaluate-edit-quality.mjs score --run outputs/evaluation/run-001
```

输出 `report.json`。退出码 0 表示完整评测通过；1 表示未过门槛或输入错误；2 表示数据/评审未齐。`status` 命令可对模板生成明确的待完成报告：

```powershell
node scripts/evaluate-edit-quality.mjs status --artifacts docs/evaluation/artifacts.template.json --out outputs/evaluation/pending.json
```

## 计分和判定

先分别计算每位评审对候选片的六维加权分，再对两位评审取均值。每项任务的相对分 = Agent 均分 ÷ 专家均分 × 100。报告保留原始相对分；为避免个别超过专家的任务掩盖弱项，汇总时单项封顶 100。专家均分为零、专家参考片有硬失败、输入或观看记录缺失时保持 pending，必须补齐或重做有效参考片。

完整 24 项和单独 12 项保留集都必须满足：平均相对分至少 85；每任务组平均至少 80；每项至少 70；Agent 硬性失败为零。判定使用未四舍五入的值。不得只拿通过的任务算平均，也不能用高审美分抵消损坏文件或重要内容错误。校准集结果单独报告，便于定位改进点；保留集不满足时不能宣称整体达到 85。

报告还给出首轮成功率、平均自动修正轮数和人工补救时间。两位评审产生的是这套素材和要求下的有限证据，不代表所有视频类型都达到相同水平。现在缺少专家成片与两位真人评分，因此 `reached85` 必须为 false。

程序回归：`node scripts/test-edit-quality-evaluation.mjs`。其输出明确标记为 synthetic-unit-tests-only，不是盲评成片或真人评分。
