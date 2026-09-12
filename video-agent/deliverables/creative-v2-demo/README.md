# HyperFrames Creative v2 演示包

此目录来自现有 WebUI 的真实运行。输入素材是仓库内的真实本地样例，输出由 `/api/commerce-chat` 生成并渲染，不是手工修改 HTML 的样片。

## 启动

在 `video-agent` 目录运行 `npm start`，打开 `http://127.0.0.1:3020/creative-v2`。

## 已跑通的演示

### 纯文字动态短片

模式选择 `Text → Motion`，不上传素材，粘贴 `inputs/text-demo/PASTE_FIRST.txt`。产品现在允许无媒体的文字路线，并生成 10 秒、1080×1920 原生工程。

### 图片商品展示与续改

上传 `inputs/image-demo/coffee.jpg`、`product.jpg`、`narration.jpg`，粘贴 `inputs/image-demo/PASTE_FIRST.txt`。本次真实运行生成了 15 秒竖版 MP4，并在同一项目上完成了标题续改；对应工程和 revision 文档在 `outputs/image-demo-revision/`，初始 revision 在 `outputs/image-demo-initial/`。

## 复跑

1. 从页面选择模式并上传输入目录中的原始素材。
2. 粘贴首轮文本并点击生成，等待预览出现。
3. 继续粘贴 `FOLLOWUPS.txt` 中的修改语句；每次修改都应产生新的 revision。
4. 页面或 `/api/commerce/{projectId}/video` 下载当前 MP4；原生工程保存在服务数据目录的对应项目目录中。

## 事实与许可

图片来自本地 `assets/edit-samples`，作为仓库测试样例使用；演示文本只描述图片可见的中性细节，不添加品牌、价格或性能事实。人工观片、专家评分和发布审核仍需单独进行。
