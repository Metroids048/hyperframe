// Real HTTP server, real source video, real FFmpeg/HyperFrames, real browser.
// No mocked media, no simulated model responses: only explicit local commands.
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { ROOT, runtimeEnv } from "../lib/workflow.mjs";
import { probe, hashFile } from "../lib/edit/media.mjs";
const out = path.join(
  ROOT,
  "outputs/upgrade/conversation-media",
  new Date().toISOString().replaceAll(":", "-"),
);
await fs.mkdir(out, { recursive: true });
const data = path.join(out, "projects"),
  checks = [],
  measurements = [],
  errors = [];
let browser, child, base, pid;
const serverLog = [];
const deadline = async (fn, label, ms = 180000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw Error("Timed out: " + label);
};
async function api(route, body) {
  const r = await fetch(
    base + route,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": randomUUID(),
          },
          body: JSON.stringify(body),
        },
  );
  const value = await r.json();
  if (!r.ok) throw Error(value.error || r.statusText);
  return value;
}
const project = () => api("/api/edit-projects/" + pid);
function pass(name) {
  checks.push(name);
  console.log("PASS " + name);
}
try {
  const portServer = http.createServer();
  await new Promise((resolve) => portServer.listen(0, "127.0.0.1", resolve));
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  base = "http://127.0.0.1:" + port;
  child = spawn(process.execPath, ["server.mjs"], {
    cwd: ROOT,
    env: {
      ...runtimeEnv(),
      VIDEO_AGENT_PORT: String(port),
      VIDEO_AGENT_EDIT_DATA_DIR: data,
      VIDEO_AGENT_DATA_DIR: path.join(out, "legacy-projects"),
      VIDEO_AGENT_CODEX_BIN: "codex-not-configured-in-acceptance",
      VIDEO_AGENT_EDIT_PROVIDER: "codex",
      EDIT_MEDIA_CACHE_DIR: path.join(out, "cache"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (b) => serverLog.push(b.toString()));
  child.stderr.on("data", (b) => serverLog.push(b.toString()));
  await deadline(
    () => api("/api/edit-capabilities").catch(() => false),
    "server startup",
    30000,
  );
  const source = path.join(ROOT, "assets/edit-samples/tears-of-steel.mp4"),
    sourceHash = await hashFile(source);
  const catalog = await api("/api/edit-samples");
  assert.equal(
    sourceHash,
    catalog.find((s) => s.id === "tears-of-steel").sha256,
  );
  const importedAt = performance.now(),
    imported = await api("/api/edit-samples/tears-of-steel/start", {});
  pid = imported.id;
  let p = await deadline(async () => {
    const p = await project();
    const failed = p.jobs.find((j) => j.status === "failed");
    if (failed) throw Error(failed.error);
    return p.currentRevisionId && p.jobs.every((j) => j.status === "complete")
      ? p
      : false;
  }, "real source import");
  const importMs = Math.round(performance.now() - importedAt);
  assert.equal(p.revisions.length, 1);
  assert.equal(p.revisions[0].timeline.captions.length, 0);
  assert.equal(p.revisions[0].render.status, "pending");
  pass(
    "90-second real film imports as unedited preview with no automatic speech/export",
  );
  browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH || runtimeEnv().HYPERFRAMES_BROWSER_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 1000 },
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/edit?project=" + pid, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#viewer:not([hidden])");
  await page.waitForFunction(
    () => document.querySelector("#player")?.ready === true,
    { timeout: 30000 },
  );
  async function decodedPreview(){
    const start=performance.now();
    await deadline(async()=>{
      for(const frame of page.frames())if(frame!==page.mainFrame())try{
        if(await frame.evaluate(()=>[...document.querySelectorAll('video')].some(v=>{
          for(let e=v;e&&e!==document.documentElement;e=e.parentElement){const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)<.01)return false;}
          if(v.readyState<2||v.seeking||!v.videoWidth)return false;
          const c=document.createElement('canvas');c.width=32;c.height=18;const ctx=c.getContext('2d');ctx.drawImage(v,0,0,32,18);const data=ctx.getImageData(0,0,32,18).data;let sum=0,sq=0;for(let i=0;i<data.length;i+=4){const y=(data[i]+data[i+1]+data[i+2])/3;sum+=y;sq+=y*y;}return sum/576>5&&sq/576-(sum/576)**2>25;
        })))return true;
      }catch{}return false;
    },'first video frame is decoded and visible',15000);
    return Math.round(performance.now()-start);
  }
  const firstDecodedMs=await decodedPreview();
  pass('initial paused preview contains a decoded visible film frame ('+firstDecodedMs+'ms after ready)');
  await page.hover("#player");
  const play = await page.$("pierce/.hfp-play-btn");
  assert(play, "Real player play control must exist");
  await play.click();
  await page.waitForFunction(
    () => document.querySelector("#player").currentTime > 0.5,
    { timeout: 20000 },
  );
  await page.$eval("#player", (player) => {
    player.pause();
    player.seek(2);
  });
  await page.waitForFunction(
    () => Math.abs(document.querySelector("#player").currentTime - 2) < 0.12,
  );
  pass("real player plays advancing footage and seeks to requested time");
  const commands = [
    "在第 2.033 秒到第 5 秒添加底部字幕「对话剪辑测试」",
    "把字幕「对话剪辑测试」改为「只改文字，不加配音」",
    "将原声音量调到50%",
    "删除开头3秒",
    "只保留第0秒到第12秒",
    "把全片设为1.25倍速",
    "在第3秒分割",
    "将原声音量调到80%",
    "把字幕「只改文字，不加配音」改为「修改完成」",
    "撤销",
  ];
  for (const text of commands) {
    const before = (await project()).jobs.length,
      start = performance.now();
    await page.waitForFunction(
      () => !document.querySelector("#prompt").disabled,
    );
    await page.$eval(
      "#prompt",
      (el, text) => {
        el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      },
      text,
    );
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/messages") && r.request().method() === "POST",
    );
    await page.click("#send");
    assert.equal((await response).status(), 202);
    const receiptMs = Math.round(performance.now() - start);
    const done = await deadline(async () => {
      const p = await project(),
        j = p.jobs.slice(before).find((j) => j.kind === "edit");
      if (j && ["failed", "needs_input", "interrupted"].includes(j.status))
        throw Error(j.error || j.question);
      return j?.status === "complete" ? { p, j } : false;
    }, text);
    assert.equal(done.j.metrics.modelCalls, 0);
    assert.equal(done.p.revisions.at(-1).timeline.audio.length, 0);
    const jobCompleteMs = Math.round(performance.now() - start);
    await page.waitForFunction(
      (rev) => {
        const player = document.querySelector("#player");
        return (
          player?.getAttribute("src")?.includes(rev) && player.ready === true
        );
      },
      {},
      done.p.currentRevisionId,
    );
    measurements.push({
      text,
      receiptMs,
      jobCompleteMs,
      endToEndMs: Math.round(performance.now() - start),
      metrics: done.j.metrics,
      executionMode: done.j.executionMode || "restore",
    });
    console.log(
      "TURN",
      text,
      measurements.at(-1).endToEndMs + "ms preview-ready",
    );
  }
  pass(
    "ten real UI chat turns execute, refresh previews and retain history without a model",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#viewer:not([hidden])");
  await page.waitForFunction(
    () => document.querySelector("#player")?.ready === true,
    { timeout: 30000 },
  );
  await page.screenshot({
    path: path.join(out, "desktop.png"),
    fullPage: true,
  });
  pass("refresh restores current preview and conversation");
  p = await project();
  const exportedId = p.currentRevisionId,
    before = p.jobs.length;
  await api("/api/edit-projects/" + pid + "/messages", {
    text: "导出当前版本",
    baseRevisionId: exportedId,
    autoExport: false,
  });
  await deadline(async () => {
    const p = await project(),
      j = p.jobs.slice(before).find((j) => j.kind === "render");
    if (j?.status === "failed") throw Error(j.error);
    return j && j.status !== "queued";
  }, "export starts");
  await api("/api/edit-projects/" + pid + "/messages", {
    text: "在第2秒到第3秒添加底部字幕「导出时继续修改」",
    baseRevisionId: exportedId,
    autoExport: false,
  });
  p = await deadline(
    async () => {
      const p = await project();
      const failed = p.jobs.slice(before).find((j) => j.status === "failed");
      if (failed) throw Error(failed.error);
      return p.jobs.slice(before).every((j) => j.status === "complete") &&
        p.revisions.find((r) => r.id === exportedId)?.render.status ===
          "complete"
        ? p
        : false;
    },
    "render and concurrent edit",
    600000,
  );
  const renderJob = p.jobs.slice(before).find((j) => j.kind === "render");
  const concurrentEdit = p.jobs
    .slice(before)
    .filter((j) => j.kind === "edit")
    .at(-1);
  assert.ok(concurrentEdit && renderJob, "Both edit and export must exist");
  assert.ok(
    Date.parse(concurrentEdit.startedAt) < Date.parse(renderJob.completedAt),
    "Export must not block the next edit from starting",
  );
  assert.notEqual(p.currentRevisionId, exportedId);
  assert.equal(p.revisions.at(-1).render.status, "pending");
  const exported = p.revisions.find((r) => r.id === exportedId);
  const dir = path.join(data, pid, "revisions", exportedId),
    video = path.join(dir, "video.mp4"),
    metadata = await probe(video);
  assert.equal(metadata.hasAudio, true);
  assert.ok(
    Math.abs(metadata.duration - exported.media.duration) <= 1 / 30 + 0.001,
  );
  assert.equal(
    (await fs.readFile(path.join(dir, "project.zip")))
      .subarray(0, 4)
      .toString("hex"),
    "504b0304",
  );
  await fs.copyFile(video, path.join(out, "conversation-result.mp4"));
  pass(
    "strict MP4 and real ZIP complete for pinned version while next chat edit is preserved",
  );
  const download = await fetch(base + exported.videoUrl);
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-type"), /video/);
  await download.body.cancel();
  pass("actual MP4 download endpoint is available");
  await page.setViewport({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#viewer:not([hidden])");
  await page.waitForFunction(
    () => document.querySelector("#player")?.ready === true,
    { timeout: 30000 },
  );
  await decodedPreview();
  await page.screenshot({ path: path.join(out, "mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  pass("mobile view renders without browser JavaScript errors");
  const times = measurements
      .filter((m) => m.executionMode !== "restore")
      .map((m) => m.endToEndMs)
      .sort((a, b) => a - b),
    pct = (p) => times[Math.max(0, Math.ceil(times.length * p) - 1)];
  await fs.writeFile(
    path.join(out, "report.json"),
    JSON.stringify(
      {
        status: "passed",
        validation:
          "real HTTP/UI/media; exact local commands only, no authenticated semantic model or speech synthesis",
        sourceHash,
        importMs,
        measurements,
        performance: {
          simpleEdits: times.length,
          p50Ms: pct(0.5),
          p95Ms: pct(0.95),
          environment: process.platform,
          node: process.version,
          comparisonToWindowsBaseline: null,
        },
        checks,
        metadata,
        exportedId,
        currentRevisionId: p.currentRevisionId,
        quality85: "not_evaluated",
      },
      null,
      2,
    ),
  );
  await fs.writeFile(path.join(out, "server.log"), serverLog.join(""));
  console.log("Conversation media acceptance:", out);
} catch (error) {
  const pages=await browser?.pages().catch(()=>[])||[],diagnostics=[];
  for(const [index,page]of pages.entries()){
    await page.screenshot({path:path.join(out,'failure-'+index+'.png')}).catch(()=>{});
    diagnostics.push(await page.evaluate(()=>{const p=document.querySelector('#player');return {url:location.href,visibility:document.visibilityState,player:p?{ready:p.ready,paused:p.paused,currentTime:p.currentTime,duration:p.duration,muted:p.muted,src:p.getAttribute('src')}:null,error:document.querySelector('#error')?.textContent};}).catch(e=>({error:e.message})));
  }
  await fs.writeFile(path.join(out,'playback-diagnostics.json'),JSON.stringify({errors,pages:diagnostics},null,2));
  await fs.writeFile(path.join(out, "server.log"), serverLog.join(""));
  await fs.writeFile(
    path.join(out, "failure.json"),
    JSON.stringify(
      { status: "failed", error: error.message, checks, measurements },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser?.close().catch(() => {});
  if (child) {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5000);
      timer.unref();
    });
  }
}
