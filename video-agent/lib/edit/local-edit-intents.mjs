import { duration, frame, EditError } from "./timeline.mjs";
import { selectSkills } from "./skills.mjs";

// Deliberately finite grammar: every clause must be understood. No model, shell,
// network or subjective editing is hidden behind these commands.
const n = "(\\d+(?:\\.\\d{1,3})?)";
const range =
  "第?\\s*" + n + "\\s*秒\\s*(?:到|至|～|~|-)\\s*第?\\s*" + n + "\\s*秒";
const protections = new Set([
  "其他不变",
  "其他内容不变",
  "其余不变",
  "其余内容不变",
]);
function result(revision, text, operations, summary, action = null) {
  const selectedSkills = selectSkills(text, operations).map(
    ({ id, version, source, sourceCommit, license }) => ({
      id,
      version,
      source,
      sourceCommit,
      license,
    }),
  );
  return {
    result: {
      analysisRequired: false,
      contentBased: false,
      summary,
      clarification: null,
      action,
      toolRequests: [],
      operations,
    },
    model: null,
    executionMode: "exact-local-intent",
    selectedSkills,
    toolCalls: [
      {
        tool: "exact_edit_intent",
        status: "completed",
        revisionId: revision.id,
      },
    ],
    metrics: { modelCalls: 0, planMs: 0, executionMode: "exact-local-intent" },
  };
}
export function localEditIntent(revision, text, selection) {
  if (selection || typeof text !== "string" || text.length > 6000) return null;
  const message = text.trim().replace(/[。！!\s]+$/u, "");
  if (
    /^(?:请)?(?:导出(?:当前(?:版本|视频)|视频|成片)?(?:为|成)?(?:\s*MP4)?|export(?:\s+(?:current\s+)?(?:video|version))?(?:\s+(?:as\s+)?mp4)?)$/iu.test(
      message,
    )
  )
    return result(revision, text, [], "导出当前版本", "export");
  const parts = message
    .split(/[，,；;。]/u)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.length || parts.slice(1).some((x) => !protections.has(x)))
    return null;
  const first = parts[0],
    t = revision.timeline,
    total = duration(t);
  let m, ops, summary;
  const checkRange = (start, end) => {
    if (start < 0 || end <= start || end > total)
      throw new EditError(
        "时间范围超出当前视频；请使用 0～" +
          (total / 30).toFixed(2) +
          " 秒内的有效范围",
      );
  };
  if ((m = new RegExp("^(?:删除|删掉|去掉)" + range + "$").exec(first))) {
    const start = frame(+m[1]),
      end = frame(+m[2]);
    checkRange(start, end);
    if (start === 0 && end === total)
      throw new EditError("不能删除整个视频；请至少保留一帧");
    ops = [{ type: "delete_range", start, end }];
    summary = `已删除第 ${m[1]}～${m[2]} 秒，其余片段顺序不变。`;
  } else if (
    (m = new RegExp("^(?:只保留|仅保留|保留)" + range + "$").exec(first))
  ) {
    const start = frame(+m[1]),
      end = frame(+m[2]);
    checkRange(start, end);
    ops = [{ type: "keep_ranges", ranges: [{ start, end }] }];
    summary = `已保留第 ${m[1]}～${m[2]} 秒。`;
  } else if (
    (m = new RegExp(
      "^(?:删除|删掉|去掉)(开头|结尾|前|最后)\\s*" + n + "\\s*秒$",
    ).exec(first))
  ) {
    const length = frame(+m[2]),
      head = ["开头", "前"].includes(m[1]);
    if (length < 1 || length >= total)
      throw new EditError("删除时长必须大于 0，并且短于整个视频");
    ops = [
      {
        type: "delete_range",
        start: head ? 0 : total - length,
        end: head ? length : total,
      },
    ];
    summary = `已删除${head ? "开头" : "结尾"} ${m[2]} 秒。`;
  } else if (
    (m = new RegExp("^在第?\\s*" + n + "\\s*秒(?:处)?(?:分割|切开)$").exec(
      first,
    ))
  ) {
    const at = frame(+m[1]);
    if (at <= 0 || at >= total) throw new EditError("分割点必须位于视频内部");
    ops = [{ type: "split", at }];
    summary = `已在第 ${m[1]} 秒分割，视频内容未删除。`;
  } else if (
    (m = new RegExp(
      "^(?:把)?(?:整个视频|全片)(?:设为|设置为|改为|改成)\\s*" +
        n +
        "\\s*倍速$",
    ).exec(first))
  ) {
    // Separate soundtracks/overlays need an explicit synchronization decision.
    if (
      t.audio.length ||
      t.overlays?.length ||
      t.transitions?.length ||
      t.captions.some((c) => c.anchor === "timeline")
    )
      return null;
    const rate = +m[1];
    if (rate < 0.1 || rate > 5) throw new EditError("倍速范围为 0.1～5");
    ops = t.clips.map((c) => ({ type: "clip_speed", id: c.id, rate }));
    summary = `已将全片设置为 ${rate} 倍速，讲话字幕随源内容同步。`;
  } else if (
    (m = new RegExp(
      "^(?:把|将)?(?:全片)?原声音量(?:设为|设置为|改为|调到|调为)\\s*" +
        n +
        "\\s*[%％]$",
    ).exec(first))
  ) {
    const gain = +m[1] / 100;
    if (gain < 0 || gain > 2) throw new EditError("原声音量范围为 0%～200%");
    ops = t.clips.map((c) => ({ type: "clip_volume", id: c.id, gain }));
    summary = `已将主视频原声音量设置为 ${m[1]}%，其他音轨不变。`;
  } else if (/^(?:关闭原声|原声静音)$/.test(first)) {
    ops = t.clips.map((c) => ({ type: "clip_volume", id: c.id, gain: 0 }));
    summary = "已关闭主视频原声，其他音轨不变。";
  } else return null;
  return result(revision, text, ops, summary);
}
