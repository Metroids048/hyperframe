# 电商对话剪辑实例

`fixtures/` 放了三组可以直接交给 Commerce runner 的自然语言需求。每组都使用仓库内 `prepare-commerce-fixtures.mjs` 生成的三张合成商品图，因此不需要下载素材或配置模型。

| 输入 | 对话需求覆盖 | 预期动效链路 |
| --- | --- | --- |
| `fixtures/01-premium-image.json` | 20 秒、克制质感、慢推近、局部细节、卖点标注 | `product-reveal` → `image-pan-zoom` → `detail-inset` → `feature-callout` → `end-card`，淡入转场 |
| `fixtures/02-promotion-price.json` | 15 秒促销、价格、较快节奏、方向转场、CTA 脉冲 | 在上述链路中加入 `price-lockup`，使用方向转场 |
| `fixtures/03-functional-single-image.json` | 10 秒、单图、无卖点时不编造信息、清晰 CTA | 单图降级为 `image-pan-zoom` / `split-detail`，使用方向转场 |

准备素材并构建三个可编辑工程：

```powershell
npm run test:commerce:fixtures
```

命令会把工程写入 `data/commerce-runs/fixture-*`（该目录属于运行产物，不纳入 Git），并检查 `document.json`、`index.html`、`manifest.json`、对象 ID、场景动效顺序、转场和总时长。要查看某一组实际输出，可单独运行：

```powershell
npm run commerce:fixtures
node scripts/commerce-agent.mjs --input examples/commerce/fixtures/02-promotion-price.json
```

输出目录中的 `document.json` 是后续对话修改的原生工程状态；例如先创建再把标题改成“限时 ¥129”，使用 `scripts/commerce-agent-tool.mjs` 的 `patch` action 更新对应 `nodeId`，其他节点和上一版 revision 会保留。需要 MP4 时再对该目录调用 `renderCommerceProject` 或运行 `commerce-agent.mjs --render`。

这些样例先覆盖图片商品的剪辑与动效编排，旁白、音乐和自动生成媒体暂不在范围内；输入中的 `message` 用来记录用户意图，当前 planner 依据结构化商品信息和 style 选择确定性动效组件。
