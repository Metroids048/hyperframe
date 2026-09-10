import "../lib/local-env.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, runtimeEnv } from "../lib/workflow.mjs";
import { pythonExecutable } from "../lib/runtime-tools.mjs";
const tools = runtimeEnv(),
  checks = [];
function command(name, executable, args, required = true) {
  const r = spawnSync(executable, args, {
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
    env: tools,
  });
  const ok = !r.error && r.status === 0;
  checks.push({
    name,
    required,
    status: ok ? "available" : "missing_or_failed",
    detail: ok
      ? (r.stdout || r.stderr || "available").split(/\r?\n/)[0].slice(0, 200)
      : r.error?.code || `exit ${r.status}`,
  });
  return ok;
}
command("FFmpeg", tools.HYPERFRAMES_FFMPEG_PATH, ["-version"]);
command("FFprobe", tools.HYPERFRAMES_FFPROBE_PATH, ["-version"]);
let browser = false;
try {
  browser =
    !!tools.HYPERFRAMES_BROWSER_PATH &&
    (await fs.stat(tools.HYPERFRAMES_BROWSER_PATH)).isFile();
} catch {}
checks.push({
  name: "Chrome / Edge",
  required: true,
  status: browser ? "available" : "missing_or_failed",
  detail: browser
    ? "已找到浏览器；实际渲染能力仍需媒体测试验证"
    : "设置 HYPERFRAMES_BROWSER_PATH，或安装 Chrome / Edge",
});
for (const dependency of ["hyperframes", "gsap", "sharp", "puppeteer-core"]) {
  try {
    if (dependency === "hyperframes")
      await fs.access(path.join(ROOT, "node_modules/hyperframes/dist/cli.js"));
    else import.meta.resolve(dependency);
    checks.push({ name: dependency, required: true, status: "available" });
  } catch {
    checks.push({
      name: dependency,
      required: true,
      status: "missing_or_failed",
      detail: "在 video-agent 运行 npm ci",
    });
  }
}
command(
  "Python (optional for captions/audio analysis)",
  pythonExecutable(),
  ["--version"],
  false,
);
const cli = process.env.VIDEO_AGENT_CODEX_BIN || "codex";
if (command("Codex CLI (semantic planning)", cli, ["--version"], false)) {
  const r = spawnSync(cli, ["login", "status"], {
    encoding: "utf8",
    timeout: 12000,
    windowsHide: true,
    env: tools,
  });
  checks.push({
    name: "ChatGPT subscription login",
    required: false,
    status:
      r.status === 0 && /ChatGPT/i.test((r.stdout || "") + (r.stderr || ""))
        ? "available"
        : "not_verified",
    detail: "未发送模型请求；不验证模型可用额度，不读取或展示登录令牌",
  });
}
for (const id of ["tears-of-steel", "viewport-navigation"]) {
  let ready = false;
  try {
    ready =
      (await fs.stat(path.join(ROOT, "assets/edit-samples", id + ".mp4")))
        .size > 1024;
  } catch {}
  checks.push({
    name: `sample:${id}`,
    required: false,
    status: ready ? "available" : "not_uploaded",
    detail: ready
      ? "样例文件存在；完整性以哈希核验为准"
      : "可以直接上传自己的视频，样例缺失不应阻塞剪辑",
  });
}
const report = {
  platform: process.platform,
  node: process.version,
  coreReady: checks
    .filter((x) => x.required)
    .every((x) => x.status === "available"),
  semanticModel:
    process.env.VIDEO_AGENT_CODEX_MODEL ||
    process.env.VIDEO_AGENT_EDIT_MODEL ||
    "Codex 默认模型",
  checks,
  limitations: [
    "可执行文件存在不等于真实渲染已通过",
    "未调用模型、云语音或视频生成服务",
    "未更改登录、订阅或任何全局配置",
  ],
};
console.log(JSON.stringify(report, null, 2));
if (!report.coreReady) process.exitCode = 1;
