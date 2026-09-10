// Offline core checks and real-browser checks are deliberately separate.
// This harness never reads user login tokens or calls a paid model provider.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { ROOT, runtimeEnv } from "../lib/workflow.mjs";
const group = process.argv[2] || "core";
if (!["core", "browser"].includes(group))
  throw Error("Usage: node scripts/verify-editor.mjs core|browser");
const output = path.join(
  ROOT,
  "outputs/upgrade/verification",
  group + "-" + new Date().toISOString().replaceAll(":", "-"),
);
await fs.mkdir(output, { recursive: true });
const commands =
  group === "core"
    ? [
        "build-web",
        "test-upgrade-timeline",
        "test-upgrade-planner",
        "test-upgrade-service",
        "test-caption-translation",
        "test-edit-quality-evaluation",
        "test-continuation",
        "test-fast-intents",
        "test-edit-review-precision",
        "test-project-atomic-save",
        "test-analysis-evidence",
        "test-revision-history",
      ]
    : [
        "build-web",
        "test-editor-upgrade-ui",
        "test-upgrade-media",
        "test-upgrade-preview",
        "test-upgrade-edge-media",
        "test-upgrade-loudness",
        "test-upgrade-generation",
        "test-conversation-media",
      ];
const report = {
  group,
  status: "running",
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpu: os.cpus()[0]?.model,
    memoryBytes: os.totalmem(),
  },
  suites: [],
  limitations: [
    "No authenticated semantic model, ASR or TTS provider is exercised.",
    "CI timings are not the original i5/16GB Windows baseline.",
    "Automated tests do not establish a human quality score.",
  ],
};
const save = () =>
  fs.writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
await save();
let failed = false;
for (const name of commands) {
  const start = performance.now();
  let log = "",
    timedOut = false;
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/" + name + ".mjs"], {
      cwd: ROOT,
      env: { ...runtimeEnv(), PYTHONUTF8: "1" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(
      () => {
        timedOut = true;
        if (process.platform === "win32" && child.pid)
          spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        else child.kill("SIGKILL");
      },
      15 * 60 * 1000,
    );
    const record = (bytes) => {
      const text = bytes.toString();
      log += text;
      process.stdout.write(text);
    };
    child.stdout.on("data", record);
    child.stderr.on("data", record);
    child.on("error", (error) => {
      log += error.message;
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
  await fs.writeFile(path.join(output, name + ".log"), log);
  const item = {
    name,
    status: result.code === 0 && !timedOut ? "passed" : "failed",
    durationMs: Math.round(performance.now() - start),
    passedAssertions: (log.match(/^PASS\b/gm) || []).length,
    ...result,
    timedOut,
  };
  report.suites.push(item);
  await save();
  if (item.status !== "passed") {
    failed = true;
    if (group === "core") break;
  }
}
report.status = failed ? "failed" : "passed";
report.passedAssertions = report.suites.reduce(
  (sum, item) => sum + item.passedAssertions,
  0,
);
await save();
console.log("Verification report:", output);
if (failed) process.exitCode = 1;
