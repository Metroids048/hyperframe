import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

/** Explicit overrides win. Never send shell commands through an executable path. */
export function runtimeTools(
  root,
  {
    env = process.env,
    platform = process.platform,
    home = os.homedir(),
    exists = existsSync,
  } = {},
) {
  const first = (values) => values.find((value) => value && exists(value));
  const windows = platform === "win32";
  const ffmpeg =
    env.HYPERFRAMES_FFMPEG_PATH ||
    first(
      windows
        ? [
            path.join(
              root,
              "node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe",
            ),
          ]
        : [],
    ) ||
    "ffmpeg";
  const ffprobe =
    env.HYPERFRAMES_FFPROBE_PATH ||
    first(
      windows
        ? [
            path.join(
              root,
              "node_modules/@ffprobe-installer/win32-x64/ffprobe.exe",
            ),
          ]
        : [],
    ) ||
    "ffprobe";
  const browser =
    env.HYPERFRAMES_BROWSER_PATH ||
    first(
      windows
        ? [
            path.join(
              env.PROGRAMFILES || "C:/Program Files",
              "Google/Chrome/Application/chrome.exe",
            ),
            path.join(
              env["PROGRAMFILES(X86)"] || "C:/Program Files (x86)",
              "Microsoft/Edge/Application/msedge.exe",
            ),
            path.join(
              env.LOCALAPPDATA || path.join(home, "AppData/Local"),
              "Google/Chrome/Application/chrome.exe",
            ),
          ]
        : platform === "darwin"
          ? [
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              "/Applications/Chromium.app/Contents/MacOS/Chromium",
            ]
          : [
              "/usr/bin/google-chrome",
              "/usr/bin/google-chrome-stable",
              "/usr/bin/chromium",
              "/usr/bin/chromium-browser",
            ],
    );
  return {
    HYPERFRAMES_FFMPEG_PATH: ffmpeg,
    HYPERFRAMES_FFPROBE_PATH: ffprobe,
    ...(browser ? { HYPERFRAMES_BROWSER_PATH: browser } : {}),
  };
}

export function pythonExecutable({
  env = process.env,
  platform = process.platform,
  home = os.homedir(),
  exists = existsSync,
} = {}) {
  if (env.VIDEO_AGENT_PYTHON || env.HYPERFRAMES_PYTHON)
    return env.VIDEO_AGENT_PYTHON || env.HYPERFRAMES_PYTHON;
  const cached = path.join(
    home,
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/python",
    platform === "win32" ? "python.exe" : "bin/python3",
  );
  return exists(cached) ? cached : platform === "win32" ? "python" : "python3";
}
