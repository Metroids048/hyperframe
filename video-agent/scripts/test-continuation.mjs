import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { codexRequest, codexFailure, codexWorkingDirectory } from "../lib/edit/codex-command.mjs";
import { runtimeTools, pythonExecutable } from "../lib/runtime-tools.mjs";
import { localEditIntent } from "../lib/edit/local-edit-intents.mjs";
import {
  initialTimeline,
  applyOperations,
  duration,
} from "../lib/edit/timeline.mjs";
import { cachedBundle, cachedFile } from "../lib/edit/media-cache.mjs";
import { exportProjectZip } from "../lib/edit/zip-export.mjs";
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "editing-continuation-"));
let count = 0;
async function test(name, fn) {
  await fn();
  console.log("PASS " + name);
  count++;
}
const asset = {
    id: "source",
    kind: "video",
    status: "ready",
    frames: 900,
    width: 640,
    height: 360,
  },
  assets = { source: asset },
  revision = { id: "r1", timeline: initialTimeline(asset) };
const plan = (text) => localEditIntent(revision, text);
try {
  await test("long Windows request directories preserve files after alias cleanup", async () => {
    const directory=path.join(tmp,'nested space '.repeat(12),'request '.repeat(8));
    await fs.mkdir(directory,{recursive:true});
    const working=await codexWorkingDirectory(directory);
    try {
      if(process.platform==='win32')assert.ok(working.cwd.length<200);
      const result=spawnSync(process.execPath,['-e','process.stdout.write("ready")'],{cwd:working.cwd,encoding:'utf8',windowsHide:true});
      assert.equal(result.status,0,result.error?.message);assert.equal(result.stdout,'ready');
      await fs.writeFile(working.file('result.json'),'preserved');
    } finally {await working.cleanup();}
    assert.equal(await fs.readFile(path.join(directory,'result.json'),'utf8'),'preserved');
    if(process.platform==='win32')await assert.rejects(fs.stat(working.cwd),{code:'ENOENT'});
    const short=await codexWorkingDirectory(tmp);assert.equal(short.cwd,tmp);await short.cleanup();assert.ok((await fs.stat(tmp)).isDirectory());
  });
  await test("portable media paths retain explicit overrides", () => {
    const env = {
      HYPERFRAMES_FFMPEG_PATH: "/custom/ffmpeg",
      HYPERFRAMES_BROWSER_PATH: "/custom/chrome",
    };
    assert.equal(
      runtimeTools(tmp, { platform: "linux", env, exists: () => false })
        .HYPERFRAMES_FFMPEG_PATH,
      "/custom/ffmpeg",
    );
    assert.equal(
      runtimeTools(tmp, { platform: "linux", env: {}, exists: () => false })
        .HYPERFRAMES_FFMPEG_PATH,
      "ffmpeg",
    );
    assert.match(
      runtimeTools(tmp, { platform: "win32", env: {}, exists: () => true })
        .HYPERFRAMES_FFMPEG_PATH,
      /win32-x64/,
    );
  });
  await test("HyperFrames receives absolute PATH-resolved media executables", () => {
    const tools = runtimeTools(tmp, {
      platform: "linux",
      env: { PATH: "/tools:/usr/bin", HYPERFRAMES_FFMPEG_PATH: "ffmpeg" },
      exists: (p) => ["/tools/ffmpeg", "/usr/bin/ffprobe"].includes(p),
    });
    assert.equal(tools.HYPERFRAMES_FFMPEG_PATH, "/tools/ffmpeg");
    assert.equal(tools.HYPERFRAMES_FFPROBE_PATH, "/usr/bin/ffprobe");
    const win = runtimeTools(tmp, {
      platform: "win32",
      env: { Path: "C:\\Tools;C:\\Windows" },
      exists: (p) =>
        p === "C:\\Tools\\ffmpeg.exe" || p === "C:\\Tools\\ffprobe.exe",
    });
    assert.equal(win.HYPERFRAMES_FFMPEG_PATH, "C:\\Tools\\ffmpeg.exe");
  });
  await test("Codex uses stdin for complete instructions and no forced private model", () => {
    const input = {
      schemaFile: "schema.json",
      output: "result.json",
      instructions: "Required rules",
      messages: [{ role: "user", content: "删除开头" }],
      images: ["frame.png"],
    };
    const request = codexRequest(input);
    assert.equal(request.args.at(-1), "-");
    assert.equal(request.args.includes("-m"), false);
    assert.ok(request.prompt.includes("Required rules"));
    assert.ok(request.prompt.includes("删除开头"));
    assert.ok(request.args.includes("--output-schema"));
    assert.equal(
      codexRequest({ ...input, model: "explicit-model" }).args.includes(
        "explicit-model",
      ),
      true,
    );
  });
  await test("configured provider reports its own connection without requiring subscription login", async () => {
    const {CodexProvider}=await import('../lib/edit/codex-provider.mjs');
    const previous=process.env.VIDEO_AGENT_CODEX_TRANSPORT;
    process.env.VIDEO_AGENT_CODEX_TRANSPORT='configured';
    const provider=new CodexProvider({skipLoginCheck:true,workerFactory:()=>({})});
    try {
      assert.equal(provider.loggedIn,false);
      assert.equal(provider.status().configured,true);
      assert.equal(provider.status().connectionMode,'configured');
      assert.equal(provider.status().verifiedAt,null);
      process.env.VIDEO_AGENT_CODEX_TRANSPORT='auto';
      assert.equal(provider.status().configured,false);
      assert.equal(provider.status().connectionMode,'subscription');
    } finally {
      await provider.close();
      if(previous===undefined)delete process.env.VIDEO_AGENT_CODEX_TRANSPORT;
      else process.env.VIDEO_AGENT_CODEX_TRANSPORT=previous;
    }
  });
  await test("configured transport reuses credentials while keeping bounded planning", () => {
    const request={schemaFile:'s',output:'o',instructions:'i',messages:[]};
    const args=codexRequest({...request,transport:'configured'}).args;
    assert.ok(!args.includes('--ignore-user-config'));
    assert.equal(args[args.indexOf('--sandbox')+1],'read-only');
    for(const flag of ['features.apps=false','features.shell_tool=false','project_doc_max_bytes=0'])assert.ok(args.includes(flag));
    assert.ok(args.includes('--output-schema'));
    assert.ok(!args.some(a=>a.startsWith('model_provider=')));
    assert.ok(codexRequest({...request,transport:'auto'}).args.includes('--ignore-user-config'));
  });
  await test("HTTPS transport keeps subscription auth without overriding built-in provider", () => {
    const args = codexRequest({schemaFile:"s",output:"o",instructions:"i",messages:[],transport:"https"}).args;
    assert.ok(args.includes('model_providers.subscription-http.requires_openai_auth=true'));
    assert.ok(args.includes('model_providers.subscription-http.supports_websockets=false'));
    assert.ok(!args.some(a=>a.startsWith('model_providers.openai.')));
    assert.throws(()=>codexRequest({transport:"unknown"}));
  });
  await test("Codex errors distinguish unavailable model, old CLI, login, quota and timeout", () => {
    for (const [text, code] of [
      ["model abc is not supported", "CODEX_MODEL_UNAVAILABLE"],
      ["unexpected argument --ignore-user-config", "CODEX_CLI_INCOMPATIBLE"],
      ["HTTP 401 unauthorized", "CODEX_AUTH"],
      ["usage limit reached", "CODEX_LIMIT"],
      ["network disconnected", "CODEX_REQUEST_FAILED"],
    ])
      assert.equal(codexFailure(text).code, code);
    assert.equal(codexFailure("", { timed: true }).code, "CODEX_TIMEOUT");
  });
  await test("Python falls back by platform and respects override", () => {
    const speechRoot = path.resolve("speech-test");
    const speechPython = path.join(speechRoot, ".venv-speech", "Scripts/python.exe");
    assert.equal(pythonExecutable({env:{},platform:"win32",root:speechRoot,exists:p=>p===speechPython}),speechPython);
    assert.equal(
      pythonExecutable({ env: {}, platform: "linux", exists: () => false }),
      "python3",
    );
    assert.equal(
      pythonExecutable({ env: {}, platform: "win32", exists: () => false }),
      "python",
    );
    assert.equal(
      pythonExecutable({
        env: { VIDEO_AGENT_PYTHON: "my-python" },
        platform: "linux",
      }),
      "my-python",
    );
  });
  await test("chat export works without model in Chinese and English", () => {
    for (const text of [
      "导出",
      "导出当前版本",
      "请导出成片为MP4",
      "导出 MP4",
      "export current video as mp4",
    ])
      assert.equal(plan(text)?.result.action, "export", text);
    for (const text of [
      "不要导出",
      "导出前删掉开头3秒",
      "导出并加字幕",
      "export without audio",
    ])
      assert.equal(plan(text), null);
  });
  await test("exact cuts retain frame precision and source mapping", () => {
    const p = plan("删除第 2.033 秒到第 5 秒，其他不变。");
    assert.equal(p.result.operations[0].start, 61);
    assert.equal(p.metrics.modelCalls, 0);
    const next = applyOperations(
      revision.timeline,
      p.result.operations,
      assets,
    );
    assert.equal(duration(next), 811);
    assert.equal(next.clips[1].in, 150);
  });
  await test("prefix/suffix removal, keep and split are deterministic", () => {
    for (const [text, frames] of [
      ["删除开头3秒", 810],
      ["删掉最后3秒", 810],
      ["只保留第2秒至第5秒", 90],
      ["在第3秒处分割", 900],
    ]) {
      const next = applyOperations(
        revision.timeline,
        plan(text).result.operations,
        assets,
      );
      assert.equal(duration(next), frames);
    }
  });
  await test("speed, original volume and mute map only to explicit targets", () => {
    const speed = applyOperations(
      revision.timeline,
      plan("把整个视频设为2倍速").result.operations,
      assets,
    );
    assert.equal(duration(speed), 450);
    const volume = plan("将原声音量调到50%").result.operations;
    assert.equal(volume[0].gain, 0.5);
    assert.equal(plan("关闭原声").result.operations[0].gain, 0);
  });
  await test("unknown clauses, negations, selections and semantic intent never silently drop", () => {
    for (const text of [
      "不要删除开头3秒",
      "删除开头3秒，翻译字幕",
      "删除开头3秒并添加配音",
      "只保留精彩部分",
      "原声音量调到50%，保留所有声音不变",
      "把整个视频设为2倍速，删除最后3秒",
    ])
      assert.equal(plan(text), null, text);
    assert.equal(
      localEditIntent(revision, "删除开头3秒", { startFrame: 0, endFrame: 90 }),
      null,
    );
  });
  await test("invalid exact commands fail clearly without a model repair", () => {
    for (const text of [
      "删除开头30秒",
      "删除第2秒到第99秒",
      "把整个视频设为6倍速",
      "将原声音量调到999%",
      "在第0秒处分割",
    ])
      assert.throws(() => plan(text));
  });
  await test("whole-film speed with separate audio requires synchronization planning", () => {
    const r = structuredClone(revision);
    r.timeline.audio.push({ id: "music" });
    assert.equal(localEditIntent(r, "全片设为2倍速"), null);
  });
  process.env.EDIT_MEDIA_CACHE_DIR = path.join(tmp, "cache");
  let builds = 0;
  const build = async (dir) => {
    builds++;
    await fs.writeFile(path.join(dir, "media.bin"), "media-" + builds);
    return { files: ["media.bin"] };
  };
  await test("bundle cache is reusable and repairs deleted artifacts", async () => {
    const a = await cachedBundle("fixtures", "media", build);
    assert.equal(a.hit, false);
    assert.equal((await cachedBundle("fixtures", "media", build)).hit, true);
    await fs.rm(path.join(a.dir, "media.bin"));
    assert.equal((await cachedBundle("fixtures", "media", build)).hit, false);
    assert.equal(builds, 2);
  });
  await test("bundle cache repairs nonempty same-size corruption", async () => {
    const before = builds;
    const a = await cachedBundle("fixtures", "corrupt-content", build);
    const file = path.join(a.dir, "media.bin");
    const original = await fs.readFile(file);
    await fs.writeFile(file, Buffer.alloc(original.length, 120));
    const rebuilt = await cachedBundle("fixtures", "corrupt-content", build);
    assert.equal(rebuilt.hit, false);
    assert.equal(builds, before + 2);
    assert.equal((await cachedBundle("fixtures", "corrupt-content", build)).hit, true);
  });
  await test("cache rebuild never overwrites media linked by an existing revision", async () => {
    const a = await cachedBundle("fixtures", "linked-revision", build);
    const oldMedia = await fs.readFile(path.join(a.dir,"media.bin"));
    const revisionFile = path.join(tmp,"revision-media.bin");
    await fs.link(path.join(a.dir,"media.bin"),revisionFile);
    await fs.writeFile(path.join(a.dir,"cache.json"),"{}");
    const rebuilt = await cachedBundle("fixtures","linked-revision",build);
    assert.equal(rebuilt.hit,false);
    assert.deepEqual(await fs.readFile(revisionFile),oldMedia);
    assert.notDeepEqual(await fs.readFile(path.join(rebuilt.dir,"media.bin")),oldMedia);
  });
  await test("bundle cache refuses corrupt/traversing or empty artifacts", async () => {
    for (const [key, files] of [
      ["missing", ["missing.bin"]],
      ["escape", ["../outside.bin"]],
      ["absolute", ["/etc/passwd"]],
    ])
      await assert.rejects(
        cachedBundle("fixtures", key, async () => ({ files })),
        /缓存/,
      );
    await assert.rejects(
      cachedBundle("fixtures", "empty", async (dir) => {
        await fs.writeFile(path.join(dir, "empty.bin"), "");
        return { files: ["empty.bin"] };
      }),
    );
  });
  await test("concurrent cache builders coalesce and failed build can retry", async () => {
    let calls = 0;
    const make = async (dir) => {
      calls++;
      await new Promise((r) => setTimeout(r, 30));
      return build(dir);
    };
    const hits = await Promise.all([
      cachedBundle("fixtures", "parallel", make),
      cachedBundle("fixtures", "parallel", make),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(
      // Either concurrent caller can acquire the filesystem lock first.
      // Exactly one builds and one reuses; Promise input order is not lock order.
      hits.map((x) => x.hit).sort(),
      [false, true],
    );
    await assert.rejects(
      cachedBundle("fixtures", "retry", async () => {
        throw Error("cancelled");
      }),
    );
    assert.equal((await cachedBundle("fixtures", "retry", build)).hit, false);
    let times = 0;
    const single = async (file) => {
      times++;
      await fs.writeFile(file, "ok");
    };
    await Promise.all([
      cachedFile("single", "key", ".bin", single),
      cachedFile("single", "key", ".bin", single),
    ]);
    assert.equal(times, 1);
  });
  const project = path.join(tmp, "project");
  await fs.mkdir(path.join(project, "assets"), { recursive: true });
  await fs.writeFile(path.join(project, "timeline.json"), "{}");
  await fs.writeFile(
    path.join(project, "assets", "对白.txt"),
    "中文字幕与标点。",
  );
  await test("project.zip is a real UTF-8 ZIP verified independently by Python", async () => {
    const exported = await exportProjectZip(project, [
      "timeline.json",
      "assets",
    ]);
    assert.equal(exported.files, 2);
    const result = spawnSync(
      pythonExecutable(),
      [
        "-c",
        `import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nassert z.read('assets/对白.txt').decode('utf8')=='中文字幕与标点。'\nassert len(z.namelist())==2`,
        exported.file,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      (await fs.readFile(exported.file)).subarray(0, 4).toString("hex"),
      "504b0304",
    );
  });
  await test("cancelled/oversize/traversing packages never replace a good download", async () => {
    const before = await fs.readFile(path.join(project, "project.zip"));
    const c = new AbortController();
    c.abort();
    await assert.rejects(
      exportProjectZip(project, ["assets"], { signal: c.signal }),
      /取消/,
    );
    await assert.rejects(
      exportProjectZip(project, ["assets"], { maxBytes: 1 }),
      /ZIP/,
    );
    await assert.rejects(exportProjectZip(project, ["../outside"]), /路径/);
    assert.deepEqual(
      await fs.readFile(path.join(project, "project.zip")),
      before,
    );
    assert.ok(
      (await fs.readdir(project)).every((x) => !x.endsWith(".partial")),
    );
  });
  console.log(`${count} continuation tests passed`);
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
