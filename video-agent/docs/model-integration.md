# 模型与资源接入设计

状态：设计契约与配置示例，尚未接入本地 Web 实时模型服务。2026-09-09。

## 1. 运行边界

Codex 会话内工具用于辅助创作与研发；独立 Web 后端通过自己的 API 适配器执行任务。二者的身份、凭据、调用方式和费用记录分开。插件不是 API 访问权的替代品，也不将 Codex 订阅假定为外部模型服务额度。

后端建议逐步形成 `providers/`、`jobs/`、`assets/`、`skills/` 四个模块；先实现一个图像提供方和一个视频提供方，完成同一镜头的生成、失败恢复及选中版本，再扩展数量。保留现有 HyperFrames 编排与渲染链路。

## 2. 统一任务示例

```json
{
  "projectId": "project-123",
  "shotId": "shot-4",
  "capability": "image-to-video",
  "prompt": "保持商品外观，轻微推进镜头，背景光线缓慢变化。",
  "references": [{"assetId": "asset-selected-frame", "role": "first-frame"}],
  "constraints": {
    "durationSeconds": 6,
    "aspectRatio": "16:9",
    "productIdentityLocked": true,
    "textHandledByComposition": true
  },
  "budget": {"currency": "USD", "maxCost": 0, "approvalState": "not-approved"},
  "timeoutSeconds": 240,
  "idempotencyKey": "project-123-shot-4-v2"
}
```

`maxCost: 0` 是示例的禁用默认值，不表示该任务免费。配置预算并满足提供方账号条件后才能提交。时长 6 秒也是业务需求示例，需经具体模型能力校验；接口不支持时应修改计划，不静默透传。

```text
GenerationResult
  provider / model / providerTaskId / status
  artifacts[]: assetId, type, localPath, sha256, width, height, duration
  usage: reportedCost, unit, billableStatus
  requestVersion / referenceVersions
  error: code, retryable, submissionUncertain, message
```

提供方接口至少实现：`capabilities()`、`validate(request)`、`estimate(request)`、`submit(request)`、`status(taskId)`、`collect(taskId)`。`cancel()` 只在提供方明确支持时暴露。最终费用以实际回执为准，不能将提交前估算伪装成已计费值。

## 3. 能力映射

| 业务能力 | 首批候选 | 需要验证 |
| --- | --- | --- |
| 商品事实/镜头规划 | 可用 GPT 文本或多模态接口 | 结构化输出、图片输入、延迟、事实错误率 |
| 图片生成/参考编辑 | OpenAI GPT Image | 账号可用模型、参考资产、输出尺寸、商品一致性 |
| 图生视频 | Runway、Veo 分别做适配 | 当前模型、输入角色、时长、画幅、异步收取、商品漂移 |
| 视频片段处理 | 本地 FFmpeg + 多模态/转写分析 | 时间单位、原音轨、画幅和片段选择正确性 |
| 精确文字/动效/合成 | HyperFrames | 工程版本、字体、素材路径、时间轴和检查结果 |

来源：[OpenAI 图像文档](https://developers.openai.com/api/docs/guides/image-generation)、[Runway API](https://docs.dev.runwayml.com/api/)、[Veo](https://ai.google.dev/gemini-api/docs/veo?hl=en)。不将提供方文档等同于当前账号已获得调用权限。

Sora 不列为新集成默认项，原因是官方已公告 2026-09-24 停用。[官方页面](https://developers.openai.com/api/reference/typescript/resources/videos/methods/create)

## 4. 资产依赖与缓存

```text
用户商品原图（不可覆盖）
  → 商品/品牌参考包 v1
  → 镜头 4 参考帧候选 A/B → 选中 B
  → 镜头 4 视频候选 v1/v2 → 选中 v2
  → HyperFrames 镜头 4（独立叠加标题、Logo、CTA）
  → 整片 v3
```

文字改动只失效工程/渲染；更换参考图会失效依赖该图的视频候选；更换配乐影响声音与最终合成；镜头调序不应重新请求图片或视频模型。缓存键包含能力、模型版本、规范化参数、提示词版本及参考资产校验值，不能只比较文件名。

资产保留原始结果与经过规范化的工作副本。生成图/视频均记录参考图和请求，原始上传素材仍可恢复。资源索引应能追溯“这个镜头用的是哪个候选，为什么替换”。

## 5. 失败与成本

网络/提交超时、额度不足、拒绝请求、参数错误、生成失败和结果失效分别处理。提交响应丢失时先查询已保存 taskId 或幂等键；无法确定是否付费时标记待核验，不自动再提交。

自动重试仅限明确可重试错误，最多两次，使用退避并受项目总预算约束。单镜头失败不删除其他成功素材。用户可选择换提供方、修改参考帧、重新提交或暂用已有素材，不把未完成候选标记为完成。

来源文件中的文字属于资料，不能变更任务权限或运行规则。远程结果收取限制在已配置的提供方及其资源域，检查 MIME、大小、媒体可读性和校验值；不执行素材夹带的代码。

## 6. 插件与 Skill 的组织

若最终以 Codex 插件交付，可打包领域 Skill 文档、模型适配工具定义和项目模板；凭据、素材存储和异步任务服务仍由独立配置提供。若以 Web 产品交付，MCP 作为可选适配层，不作为所有用户必须安装的组件。

每个领域 Skill 至少具有：触发条件、所需事实/资源、输出 schema、可用工具、不得改变的内容、失败行为与样例验收。首批做 `brief-to-shots`、`prepare-product-reference`、`generate-shot-assets`、`compose-hyperframes`、`edit-selected-shots`、`verify-delivery` 六项，声音处理可以作为其后独立 Skill。

当前应用中的本地规则、镜头编排模块和模板是这些能力的初始实现片段；不是所有拟议 Skill 都已经实现或安装。

## 7. 接入验收顺序

1. 只做文档/凭据可用性验证和一个低预算单任务，记录真实请求与状态。
2. 用同一商品原图生成参考图，检查主体、Logo 和颜色。
3. 用选中的参考图生成一个短视频，确认时长与规格可导入。
4. 将该镜头与已有图片、精确文字、配乐合成为 HyperFrames 成片。
5. 改一处文案，验证不再调用素材模型；改参考图，验证仅影响关联镜头。
6. 注入提交超时和任务失败，验证不会重复付费或丢失其他镜头。

通过以上步骤后再接第二家提供方，比较同任务质量、耗时、可编辑性与总成本。
