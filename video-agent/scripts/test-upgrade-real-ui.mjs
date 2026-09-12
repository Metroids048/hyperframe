import {runtimeEnv} from '../lib/workflow.mjs';
// Read-only browser acceptance against an explicitly supplied isolated live
// project. This test never imports, edits, renders, or starts a service.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const options = Object.fromEntries(
  process.argv.slice(2).map((x) => {
    const [k, ...v] = x.replace(/^--/, "").split("=");
    return [k, v.join("=")];
  }),
);
const base = options.base || "http://127.0.0.1:3040",
  projectId = options.project;
assert(
  projectId,
  "Pass --project=<isolated project ID>; no user project is chosen implicitly.",
);
const endpoint = new URL(base);
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname),
  "Only a local test service is allowed.",
);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  out = options.out
    ? path.resolve(options.out)
    : path.join(
        root,
        "outputs/upgrade/real-ui",
        new Date().toISOString().replace(/[:.]/g, "-"),
      );
await fs.mkdir(out, { recursive: true });
const checks = [],
  errors = [],
  consoleErrors = [],
  blockedMutations = [],
  requestFailures = [];
const json = async (route) => {
  const r = await fetch(base + route);
  assert(r.ok, `${route}: HTTP ${r.status}`);
  return r.json();
};
const initial = await json("/api/edit-projects/" + projectId),
  catalog = await json("/api/edit-samples");
const current = initial.revisions.find(
  (r) => r.id === initial.currentRevisionId,
);
assert(current?.previewUrl, "Project must have a playable revision.");
assert(
  initial.revisions.length >= 2,
  "A second revision is required to test original comparison.",
);
const browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH || runtimeEnv().HYPERFRAMES_BROWSER_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 1000 },
  }),
  page = await browser.newPage();
await page.setRequestInterception(true);
page.on("request", (req) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) {
    blockedMutations.push({ method: req.method(), url: req.url() });
    req.abort("blockedbyclient");
  } else req.continue();
});
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.location().url?.endsWith("/favicon.ico"))
    consoleErrors.push({ text: m.text(), location: m.location() });
});
page.on("requestfailed", (r) =>
  requestFailures.push({ url: r.url(), reason: r.failure()?.errorText }),
);
const pass = (s) => {
  checks.push(s);
  console.log("PASS " + s);
};
async function ready() {
  await page.waitForFunction(
    () => {
      const p = document.querySelector("#player");
      return (
        p &&
        p.ready &&
        p.duration > 0 &&
        !document.querySelector("#viewer").hidden
      );
    },
    { timeout: 90000 },
  );
}
async function playerState() {
  return page.$eval("#player", (p) => ({
    ready: p.ready,
    duration: p.duration,
    currentTime: p.currentTime,
    paused: p.paused,
    src: p.getAttribute("src"),
  }));
}
try {
  const pages = await Promise.all(
    ["/", "/edit", "/create"].map(async (route) => {
      const r = await fetch(base + route);
      assert.equal(r.status, 200);
      return r.text();
    }),
  );
  assert.match(pages[0], /id="chat-form"/);
  assert.match(pages[1], /id="chat-form"/);
  assert.equal(pages[0], pages[1]);
  assert.match(pages[2], /id="description"/);
  pass("/ 与 /edit 是相同聊天编辑器，/create 保留图片成片入口");
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#sample-gallery .sample-card");
  assert.equal(
    await page.$$eval(
      "textarea",
      (es) => es.filter((e) => e.checkVisibility()).length,
    ),
    1,
  );
  const expectedIds = [
    "tears-of-steel",
    "viewport-navigation",
    "mandarin-interview",
  ];
  for (const id of expectedIds)
    assert(
      catalog.some((s) => s.id === id),
      `Missing real sample ${id}`,
    );
  assert(
    !catalog.some((s) => ["product", "coffee", "narration"].includes(s.id)),
    "Synthetic legacy demos should not be in the real source gallery",
  );
  const zh = catalog.find((s) => s.id === "mandarin-interview");
  assert(
    zh.burnedInSubtitles,
    "Mandarin sample must disclose existing subtitles",
  );
  await page.$eval(
    '#sample-gallery [data-sample-id="mandarin-interview"]',
    (b) => (b.closest(".sample-card").querySelector("details").open = true),
  );
  const sourceCard = await page.$eval(
    '#sample-gallery [data-sample-id="mandarin-interview"]',
    (b) => ({
      text: b.closest(".sample-card").textContent,
      links: [...b.closest(".sample-card").querySelectorAll("a")].map(
        (a) => a.href,
      ),
    }),
  );
  assert.match(sourceCard.text, /原片已有字幕/);
  assert(
    sourceCard.links.some((h) =>
      h.includes("creativecommons.org/licenses/by/3.0"),
    ),
  );
  assert.match(sourceCard.text, /China News Service|中国新闻社/);
  await page.screenshot({
    path: path.join(out, "01-real-source-gallery.png"),
    fullPage: true,
  });
  await page.click("#chat-prompts button");
  assert(await page.$eval("#prompt", (e) => !!e.value));
  assert.equal(blockedMutations.length, 0);
  pass("真实素材卡展示许可、作者与原字幕提示；建议只填草稿");
  await page.goto(base + "/edit?project=" + encodeURIComponent(projectId), {
    waitUntil: "domcontentloaded",
  });
  await ready();
  await page.waitForFunction(() => {
    const p=document.querySelector('#player'),doc=p?.shadowRoot?.querySelector('iframe')?.contentDocument;
    const v=doc?.querySelector('video[data-start="0"]');
    if(!v||v.readyState<2||v.seeking||Math.abs(v.currentTime-Number(v.dataset.mediaStart||0))>1/30+.005)return false;
    return [...doc.querySelectorAll('.caption')].every(c=>{const visible=getComputedStyle(c).visibility!=='hidden'&&getComputedStyle(c).display!=='none'&&Number(getComputedStyle(c.querySelector('.caption-content')).opacity)>.01;return visible===(Math.round(Number(c.dataset.start)*30)===0);});
  },{timeout:20000});
  pass('暂停初始预览已显示源视频首帧，未来字幕不会提前出现');
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
    path: path.join(out, "02-desktop-preview.png"),
    fullPage: true,
  });
  pass("真实 HyperFrames 播放器 ready，桌面左聊天右预览");
  const before = await playerState();
  // A user click starts the real player. Keep seeking as a separate assertion.
  await page.evaluate(() =>
    document.querySelector("#player").scrollIntoView({ block: "center" }),
  );
  await page.hover("#player");
  const playButton = await page.$("pierce/.hfp-play-btn");
  assert(playButton, "The real HyperFrames play control must be present");
  await playButton.click();
  await page.waitForFunction(
    (t) => document.querySelector("#player").currentTime > t + 0.5,
    { timeout: 20000 },
    before.currentTime,
  );
  const playing = await playerState();
  assert.equal(playing.paused, false);
  await page.evaluate(() => document.querySelector("#player").pause());
  pass("点击真实播放器后时间连续前进");
  const seekTime = Math.min(3, current.media.duration / 2);
  await page.$eval("#player", (p, t) => p.seek(t), seekTime);
  await page.waitForFunction(
    (t) => Math.abs(document.querySelector("#player").currentTime - t) < 0.12,
    { timeout: 10000 },
    seekTime,
  );
  await page.screenshot({
    path: path.join(out, "03-seek.png"),
    fullPage: true,
  });
  pass("真实播放器 seek 定位成功");
  await page.click("#compare-original");
  await ready();
  assert.equal((await playerState()).src, initial.revisions[0].previewUrl);
  await page.screenshot({
    path: path.join(out, "04-original-comparison.png"),
    fullPage: true,
  });
  await page.click("#compare-original");
  await ready();
  assert.equal((await playerState()).src, current.previewUrl);
  pass("原片对比和返回当前版本均可播放");
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
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
    path: path.join(out, "05-mobile.png"),
    fullPage: true,
  });
  pass("手机预览在上，聊天在下，无横向溢出");
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready();
  assert.equal((await playerState()).src, current.previewUrl);
  pass("带 SSE 的页面刷新可恢复真实预览");
  assert.deepEqual(blockedMutations, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  const final = await json("/api/edit-projects/" + projectId);
  assert.equal(final.currentRevisionId, initial.currentRevisionId);
  assert.equal(final.revisions.length, initial.revisions.length);
  assert.equal(final.messages.length, initial.messages.length);
  pass("验收全程只读，项目版本与消息未变，零页面与控制台异常");
  await fs.writeFile(
    path.join(out, "report.json"),
    JSON.stringify(
      {
        testType: "live read-only UI and actual HyperFrames player",
        base,
        projectId,
        currentRevisionId: current.id,
        checks,
        errors,
        consoleErrors,
        blockedMutations,
        requestFailures,
        playerBefore: before,
        playerPlaying: playing,
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
    JSON.stringify(
      {
        error: e.stack,
        checks,
        errors,
        consoleErrors,
        blockedMutations,
        requestFailures,
      },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
}
