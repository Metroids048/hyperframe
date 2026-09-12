import {runtimeEnv} from '../lib/workflow.mjs';
// Isolated frontend contract tests. The API and player are simulated; this does
// not claim model quality, real speech, or MP4 rendering acceptance.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(
  root,
  "outputs/upgrade/ui",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
await fs.mkdir(out, { recursive: true });
const checks = [],
  requests = [],
  streams = new Set(),
  projects = new Map(),
  timers = new Set();
const id = "00000000-0000-4000-8000-000000000001";
let projectCounter = 1,
  jobCounter = 0,
  sequence = 0,
  sseAvailable = true,
  connected = true;
const later = (fn, ms) => {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
};
function asset(name = "真人样例.mp4", n = 1) {
  return {
    id: "a" + n,
    name,
    kind: "video",
    status: "ready",
    duration: 90,
    frames: 2700,
    mediaUrl: "/mock.mp4",
    analysis: {
      transcript: {
        segments: [
          { start: 1, end: 3, text: "今天我们一起完成这个任务。" },
          { start: 4, end: 6, text: "先保留主要信息，再调整节奏。" },
        ],
      },
    },
  };
}
function makeRevision(p, description = "原始素材", operations = []) {
  const n = p.revisions.length + 1,
    r = {
      id: "r" + n,
      number: n,
      parentId: p.currentRevisionId || null,
      description,
      operations,
      media: { width: 1280, height: 720, duration: 90 },
      timeline: {
        schemaVersion: 2,
        fps: 30,
        clips: [
          {
            id: "c1",
            assetId: "a1",
            in: 0,
            out: 2700,
            start: 0,
            end: 2700,
            rate: 1,
          },
        ],
        captions: [],
        audio: [],
      },
      previewUrl: "/preview/r" + n,
      videoUrl: null,
    };
  p.revisions.push(r);
  p.currentRevisionId = r.id;
  return r;
}
function makeProject(name = "真实样例 · 英语") {
  const p = {
    id:
      projectCounter === 1
        ? id
        : `00000000-0000-4000-8000-${String(projectCounter).padStart(12, "0")}`,
    name,
    assets: { a1: asset() },
    revisions: [],
    messages: [],
    jobs: [],
    sampleId: "tears-of-steel",
  };
  projectCounter++;
  makeRevision(p);
  projects.set(p.id, p);
  return p;
}
function emit(p, j, type = "job") {
  sequence++;
  const event = {
    projectId: p.id,
    sequence,
    type,
    jobId: j?.id,
    kind: j?.kind,
    status: j?.status,
    stage: j?.stage,
    progress: j?.progress,
    revisionId: j?.revisionId,
  };
  for (const s of streams)
    if (s.pid === p.id)
      s.res.write(`id: ${sequence}\ndata: ${JSON.stringify(event)}\n\n`);
}
function task(p, kind, body) {
  const j = {
    id: "j" + ++jobCounter,
    kind,
    status: "running",
    stage: kind === "render" ? "正在导出" : "正在修改",
    progress: 22,
    revisionId: body.revisionId,
    baseRevisionId: body.baseRevisionId,
  };
  p.jobs.push(j);
  emit(p, j);
  return j;
}
function completeEdit(p, j, body) {
  if (j.status === "cancelled") return;
  const r = makeRevision(p, body.text || "已恢复选中的版本", [
    { type: "caption_add", start: 60, end: 120, text: "前端合同测试" },
  ]);
  r.timeline.captions = [
    {
      id: "cap",
      start: 60,
      end: 120,
      text: "前端合同测试",
      voicePolicy: "none",
    },
  ];
  j.status = "complete";
  j.stage = "预览已准备好";
  j.progress = 100;
  j.revisionId = r.id;
  p.messages.push({
    role: "assistant",
    text: "已按要求完成修改，请播放修改处检查。",
    jobId: j.id,
    revisionId: r.id,
  });
  emit(p, j, "revision");
}
async function read(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const str = Buffer.concat(chunks).toString();
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
const player = `customElements.define('hyperframes-player',class extends HTMLElement{currentTime=0;volume=1;muted=false;connectedCallback(){this.style.display='grid';this.style.placeItems='center';this.style.background='linear-gradient(135deg,#263a32,#102018)';this.textContent='视频预览 · 前端合同测试';}seek(t){this.currentTime=t;this.dispatchEvent(new CustomEvent('timeupdate',{detail:{currentTime:t}}));}play(){this.dispatchEvent(new Event('play'));return Promise.resolve();}pause(){}});`;
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost"),
    route = u.pathname;
  const json = (data, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(data));
  };
  try {
    if (
      ["/", "/edit", "/editor.html", "/editor.js", "/editor.css"].includes(
        route,
      )
    ) {
      const name = ["/", "/edit"].includes(route)
        ? "editor.html"
        : route.slice(1);
      res.writeHead(200, {
        "Content-Type": name.endsWith(".js")
          ? "text/javascript"
          : name.endsWith(".css")
            ? "text/css"
            : "text/html; charset=utf-8",
      });
      res.end(await fs.readFile(path.join(root, "web", name)));
      return;
    }
    if (route === "/editor-player.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(player);
      return;
    }
    if (route === "/api/edit-capabilities") {
      json({
        configured: connected,
        connectionMode: "subscription",
        model: "test",
        skills: [{ id: "captions" }],
        workflows: [{ id: "captions", name: "字幕" }],
      });
      return;
    }
    if (route === "/api/edit-samples") {
      json([
        {
          id: "tears-of-steel",
          title: "钢铁之泪 · 真人剧情",
          description: "真人对白与动作镜头",
          duration: 90,
          language: "en",
        },
        {
          id: "viewport-navigation",
          title: "录屏教程",
          duration: 90,
          language: "en",
        },
        {
          id: "conference-talk",
          title: "演讲现场",
          duration: 90,
          language: "en",
        },
      ]);
      return;
    }
    if (route.endsWith("/start")) {
      requests.push({ route, body: await read(req) });
      json(makeProject(), 201);
      return;
    }
    if (route === "/api/edit-projects") {
      if (req.method === "GET")
        json([...projects.values()].map((p) => ({ id: p.id, name: p.name })));
      else {
        const b = await read(req);
        requests.push({ route, body: b });
        const p = makeProject(b.name);
        p.revisions = [];
        p.currentRevisionId = null;
        p.assets = {};
        json(p, 201);
      }
      return;
    }
    const match = /^\/api\/edit-projects\/([^/]+)(?:\/(.*))?$/.exec(route);
    if (match) {
      const p = projects.get(match[1]),
        action = match[2] || "";
      if (!p) {
        json({ error: "不存在" }, 404);
        return;
      }
      if (action === "events") {
        requests.push({ route, after: u.searchParams.get("after") });
        if (!sseAvailable) {
          json({ error: "SSE disabled for polling test" }, 503);
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        });
        res.write(": open\n\n");
        const s = { pid: p.id, res };
        streams.add(s);
        res.on("close", () => streams.delete(s));
        return;
      }
      if (req.method === "GET" && !action) {
        json(p);
        return;
      }
      if (action === "assets") {
        await read(req);
        const name = decodeURIComponent(req.headers["x-file-name"]);
        requests.push({ route, name });
        const n = Object.keys(p.assets).length + 1;
        p.assets["a" + n] = asset(name, n);
        if (!p.revisions.length) makeRevision(p);
        const j = task(p, "asset", {});
        j.status = "complete";
        j.progress = 100;
        j.stage = "素材可播放";
        json({ jobId: j.id }, 202);
        emit(p, j, "asset");
        return;
      }
      if (["messages", "render", "restore", "analyze"].includes(action)) {
        const body = await read(req);
        requests.push({ route, body });
        const j = task(p, action === "messages" ? "edit" : action, body);
        if (action === "messages") {
          p.messages.push({ role: "user", text: body.text, jobId: j.id });
          later(
            () => completeEdit(p, j, body),
            body.text.includes("慢速") ? 3000 : 450,
          );
        }
        if (action === "restore") later(() => completeEdit(p, j, body), 150);
        if (action === "analyze")
          later(() => {
            j.status = "complete";
            j.stage = "文字稿准备好";
            emit(p, j);
          }, 150);
        if (action === "render")
          later(() => {
            if (j.status === "cancelled") return;
            const r = p.revisions.find((r) => r.id === body.revisionId);
            r.videoUrl = "/download/" + r.id;
            r.subtitlesUrl = "/subtitles";
            r.packageUrl = "/package";
            j.status = "complete";
            j.progress = 100;
            j.stage = "导出完成";
            emit(p, j);
          }, 2200);
        json({ jobId: j.id }, 202);
        return;
      }
      const jm = /^jobs\/([^/]+)\/(cancel|retry)$/.exec(action);
      if (jm) {
        const j = p.jobs.find((j) => j.id === jm[1]);
        requests.push({ route });
        if (jm[2] === "cancel") {
          j.status = "cancelled";
          j.stage = "已停止";
        } else {
          j.status = "running";
          j.stage = "正在重试";
          later(() => {
            j.status = "complete";
            j.stage = "重试完成";
            emit(p, j);
          }, 180);
        }
        json({ jobId: j.id });
        emit(p, j);
        return;
      }
    }
    json({ error: "not found" }, 404);
  } catch (e) {
    json({ error: e.message }, 500);
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH || runtimeEnv().HYPERFRAMES_BROWSER_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 1000 },
  }),
  page = await browser.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const pass = (s) => {
  checks.push(s);
  console.log("PASS " + s);
};
async function wait(fn, arg) {
  await page.waitForFunction(fn, { timeout: 12000 }, arg);
}
async function prompt(text) {
  await page.$eval(
    "#prompt",
    (e, t) => {
      e.value = t;
      e.dispatchEvent(new Event("input"));
    },
    text,
  );
}
try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#sample-gallery button");
  assert.equal(
    await page.$$eval(
      "textarea",
      (es) => es.filter((e) => e.checkVisibility()).length,
    ),
    1,
  );
  assert.equal(
    await page.$eval("#timeline-section", (e) => e.checkVisibility()),
    false,
  );
  assert(
    await page.evaluate(
      () =>
        document.querySelector(".chat").getBoundingClientRect().right <=
        document.querySelector("main").getBoundingClientRect().left,
    ),
  );
  await page.screenshot({
    path: path.join(out, "01-desktop.png"),
    fullPage: true,
  });
  pass("桌面左聊天右预览，唯一输入框，无手动时间轴");
  await page.click("#chat-prompts button");
  assert(await page.$eval("#prompt", (e) => !!e.value));
  assert.equal(requests.filter((r) => r.route.endsWith("/messages")).length, 0);
  await prompt("我的未发送草稿");
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await page.$eval("#prompt", (e) => e.value), "我的未发送草稿");
  pass("建议仅填入要求，刷新保留新项目草稿");
  await page.click('#sample-gallery [data-sample-id="tears-of-steel"]');
  await wait(() => !document.querySelector("#viewer").hidden);
  const p = projects.get(id);
  assert.equal(p.revisions.length, 1);
  assert.equal(p.jobs.length, 0);
  assert.equal(requests.filter((r) => r.route.endsWith("/messages")).length, 0);
  assert.equal(await page.$eval("#prompt", (e) => e.value), "我的未发送草稿");
  pass("动态真实样例目录，导入原片不自动剪辑");
  await page.evaluate(() => document.querySelector("#player").seek(2.5));
  await page.click("#reference-frame");
  await prompt("给这帧加说明字幕，不要配音");
  await page.click("#send");
  await wait(() =>
    document.querySelector("#version-label").textContent.includes("02"),
  );
  const message = requests.find((r) => r.route.endsWith("/messages"));
  assert.equal(message.body.autoExport, false);
  assert.equal(message.body.selection.kind, "frame");
  assert.equal(message.body.selection.startFrame, 75);
  assert.equal(message.body.selection.endFrame, 76);
  assert.equal(p.revisions.at(-1).timeline.audio.length, 0);
  assert.equal(await page.$eval("#downloads", (e) => e.hidden), true);
  pass("当前帧引用精确到30fps；字幕请求autoExport=false，预览不冒充已导出");
  await page.click("#open-range");
  await page.$eval("#range-start", (e) => (e.value = "1.1"));
  await page.$eval("#range-end", (e) => (e.value = "3.2"));
  await page.click("#reference-range");
  await page.reload({ waitUntil: "domcontentloaded" });
  await wait(() => !document.querySelector("#selection").hidden);
  assert.match(
    await page.$eval("#selection-text", (e) => e.textContent),
    /1.10/,
  );
  await page.click("#clear-selection");
  await page.click("#show-library");
  await page.click("#transcript button");
  assert.match(
    await page.$eval("#selection-text", (e) => e.textContent),
    /今天我们一起/,
  );
  await page.click("#clear-selection");
  pass("范围引用和草稿刷新恢复，文字稿句子映射至成片");
  const before = p.currentRevisionId;
  await page.click("#export");
  await wait(() => !document.querySelector("#export-status").hidden);
  await prompt("导出时继续添加一行字幕");
  assert.equal(await page.$eval("#send", (e) => e.disabled), false);
  await page.click("#send");
  await wait(() =>
    document.querySelector("#version-label").textContent.includes("03"),
  );
  const lastMessage = requests
    .filter((r) => r.route.endsWith("/messages"))
    .at(-1);
  assert.equal(lastMessage.body.afterCurrent, false);
  assert.equal(
    requests.find((r) => r.route.endsWith("/render")).body.revisionId,
    before,
  );
  await wait(() => document.querySelector("#export-stage a"));
  assert.match(
    await page.$eval("#player", (e) => e.getAttribute("src")),
    /r3$/,
  );
  assert.equal(await page.$eval("#downloads", (e) => e.hidden), true);
  assert.match(
    await page.$eval("#export-stage a", (e) => e.textContent),
    /第 2 版/,
  );
  pass("导出不阻塞聊天，固定旧版本导出完成不覆盖最新预览");
  await page.click("#compare-original");
  assert.match(
    await page.$eval("#player", (e) => e.getAttribute("src")),
    /r1$/,
  );
  await page.click("#compare-original");
  assert.match(
    await page.$eval("#player", (e) => e.getAttribute("src")),
    /r3$/,
  );
  await page.click("#watch-change");
  assert.equal(await page.$eval("#player", (e) => e.currentTime), 1.6);
  await page.click("#undo");
  await wait(() =>
    document.querySelector("#version-label").textContent.includes("04"),
  );
  await page.select("#versions", "r2");
  assert.equal(await page.$eval("#restore", (e) => e.hidden), false);
  await page.click("#restore");
  await wait(() =>
    document.querySelector("#version-label").textContent.includes("05"),
  );
  assert.equal(
    requests.filter((r) => r.route.endsWith("/restore")).at(-1).body.revisionId,
    "r2",
  );
  pass("原片对比、播放修改处、撤销和历史恢复可用");
  await prompt("慢速修改以验证排队");
  await page.click("#send");
  await wait(() =>
    document.querySelector("#chat-stage").textContent.includes("正在修改"),
  );
  await prompt("排队的第二条要求");
  assert.match(await page.$eval("#send", (e) => e.textContent), /排队/);
  await page.click("#send");
  assert.equal(
    requests.filter((r) => r.route.endsWith("/messages")).at(-1).body
      .afterCurrent,
    true,
  );
  await prompt("刷新仍保留的草稿");
  await page.reload({ waitUntil: "domcontentloaded" });
  await wait(
    () => document.querySelector("#prompt").value === "刷新仍保留的草稿",
  );
  assert(
    requests
      .filter((r) => r.route.endsWith("/events"))
      .some((r) => Number(r.after) > 0),
  );
  await wait(() => document.querySelector("#chat-task").hidden);
  pass("编辑期间排队、刷新恢复任务，SSE使用已保存游标");
  const fileA = path.join(out, "fixture-a.mp4"),
    fileB = path.join(out, "fixture-b.mp4");
  await fs.writeFile(fileA, "mock upload A");
  await fs.writeFile(fileB, "mock upload B");
  await (await page.$("#file")).uploadFile(fileA, fileB);
  await wait(() =>
    document.querySelector("#source-label").textContent.includes("3 份素材"),
  );
  assert.equal(
    requests.filter((r) => r.name?.startsWith("fixture-")).length,
    2,
  );
  assert.equal(projects.size, 1);
  pass("同一项目一次选择两个素材均被上传，不创建新项目");
  await page.setViewport({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert(
    await page.evaluate(
      () =>
        document.querySelector("main").getBoundingClientRect().bottom <=
        document.querySelector(".chat").getBoundingClientRect().top + 1,
    ),
  );
  await page.screenshot({
    path: path.join(out, "02-mobile.png"),
    fullPage: true,
  });
  pass("手机预览在上聊天在下，无横向溢出");
  await page.setViewport({ width: 1440, height: 1000 });
  await page.screenshot({
    path: path.join(out, "03-editor.png"),
    fullPage: true,
  });
  connected = false;
  await page.click("#model-help");
  await wait(() =>
    document.querySelector("#provider-status").textContent.includes("连接模型"),
  );
  connected = true;
  await page.click("#close-model");
  await page.click("#model-help");
  await wait(() =>
    document.querySelector("#provider-status").textContent.includes("可以开始"),
  );
  await page.click("#close-model");
  pass("重新打开连接设置会刷新真实登录状态");
  sseAvailable = false;
  for (const s of streams) s.res.end();
  await page.reload({ waitUntil: "domcontentloaded" });
  await wait(() => !document.querySelector("#viewer").hidden);
  await prompt("没有事件流时也能修改");
  await page.click("#send");
  const expected = p.revisions.length + 1;
  await wait(
    (n) =>
      document
        .querySelector("#version-label")
        .textContent.includes(String(n).padStart(2, "0")),
    expected,
  );
  pass("事件流不可用时轮询仍能恢复修改结果");
  await prompt("慢速修改以验证取消");
  await page.click("#send");
  await wait(() => !document.querySelector("#chat-cancel").hidden);
  const cancelled = p.jobs.at(-1);
  await page.click("#chat-cancel");
  await wait(() => document.querySelector("#chat-stage").textContent.includes("已停止"));
  assert.equal(cancelled.status, "cancelled");
  pass("停止当前修改只取消编辑任务，已完成版本保留");
  const failedAnalysis = task(p, "analyze", {});
  failedAnalysis.status = "failed";
  failedAnalysis.error = "读取文字稿暂时失败";
  await page.reload({ waitUntil: "domcontentloaded" });
  await wait(() => !document.querySelector("#chat-retry").hidden);
  await page.click("#chat-retry");
  await wait(() => document.querySelector("#chat-task").hidden);
  assert.equal(failedAnalysis.status, "complete");
  pass("导入与分析失败即使没有聊天消息也有重试入口");
  const failed = task(p, "edit", {});
  failed.status = "failed";
  failed.error = "测试网络失败";
  p.messages.push({
    role: "assistant",
    text: failed.error,
    error: true,
    jobId: failed.id,
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".message-retry");
  await page.click(".message-retry");
  await wait(() => document.querySelector(".message.resolved"));
  pass("失败消息提供可执行重试，并在成功后更新");
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(out, "report.json"),
    JSON.stringify(
      {
        testType: "isolated frontend contract; mock API and mock player",
        checks,
        errors,
        requests,
        finishedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log("REPORT " + out);
} catch (e) {
  await page.screenshot({
    path: path.join(out, "failure.png"),
    fullPage: true,
  });
  await fs.writeFile(
    path.join(out, "failure.json"),
    JSON.stringify({ error: e.stack, checks, errors, requests }, null, 2),
  );
  throw e;
} finally {
  for (const t of timers) clearTimeout(t);
  await browser.close();
  for (const s of streams) s.res.end();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
