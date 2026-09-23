import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { Type } from "typebox";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// Keep the ingress limit aligned with the Control UI patch and backend import
// guard. This is the original-media ingress budget; the optional media
// understanding budget is configured separately in OpenClaw.
const DEFAULT_VIDEO_UPLOAD_BYTES = 64 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = Number.isFinite(Number(process.env.OPENCLAW_VIDEO_UPLOAD_MAX_BYTES)) && Number(process.env.OPENCLAW_VIDEO_UPLOAD_MAX_BYTES) > 0
  ? Math.floor(Number(process.env.OPENCLAW_VIDEO_UPLOAD_MAX_BYTES))
  : DEFAULT_VIDEO_UPLOAD_BYTES;
const MAX_VIDEO_UPLOAD_MIB = Math.round(MAX_VIDEO_UPLOAD_BYTES / 1024 / 1024);

const TOOLS = [
  ["video_prepare", "Synchronously optimize the request, identify product/platform/scene/mode/output/audio, inspect acquisition policy, and return real preparation/research/resource receipts before production."],
  ["video_resource_search", "Search the server-owned local material and HyperFrames 0.8.33 catalog. Returns candidates, compatibility, runtime, and execution status without side effects."],
  ["video_web_research", "Run controlled read-only commerce research against public pages. Returns URL, title, evidence, usage type, and rights restrictions; never downloads media."],
  ["video_task", "Submit a prepared natural-language video task and preserve the editable project. A queued/running result is a successful asynchronous acknowledgement: show the business stage and keep internal IDs hidden unless diagnostic details were requested; do not poll in the same turn."],
  ["video_project_list", "List editable video projects so the user can choose one in chat."],
  ["video_project_open", "Read the current editable project and delivery state."],
  ["video_job_status", "Read a real video job status and checkpoint when the user explicitly asks for status; do not call repeatedly while a task is running."],
  ["video_result", "List the authorized artifacts for a video revision."],
  ["video_cancel", "Cancel a persisted video job."]
];

const idSchema = { type: "string", minLength: 1, maxLength: 200 };
const optionalId = Type.Optional(idSchema);
const optionalNullableId = Type.Optional({ anyOf: [idSchema, { type: "null" }] });
const baseRevision = { anyOf: [idSchema, { type: "null" }] };
const nativeOperationTypes = [
  "add_text", "update_text_style", "update_text", "update_effect_params", "set_scene_effect",
  "replace_asset", "set_scene_duration", "set_node_duration", "reorder_scenes", "set_transition",
  "change_output", "lock_scene", "unlock_scene", "update_media", "retime_document", "duplicate_media",
  "add_audio", "update_audio", "remove_audio", "split_scene", "trim_scene", "generate_captions", "regenerate_speech", "update_caption",
  "update_caption_style", "set_captions", "remove_caption", "update_custom_source",
  // Intent markers are accepted for create/export requests that do not patch
  // an existing native document.
  "create", "generate", "export"
];
const operationFields = {
  nodeId: { type: "string", minLength: 1, maxLength: 200 }, sceneId: { type: "string", minLength: 1, maxLength: 200 },
  assetId: { type: "string", minLength: 1, maxLength: 200 }, text: { type: "string", minLength: 1, maxLength: 240 },
  durationFrames: { type: "integer", minimum: 1 }, localStartFrame: { type: "integer", minimum: 0 },
  sceneIds: { type: "array", minItems: 1, maxItems: 100, items: { type: "string", minLength: 1, maxLength: 200 } },
  fromSceneId: { type: "string", minLength: 1, maxLength: 200 }, toSceneId: { type: "string", minLength: 1, maxLength: 200 },
  effect: { type: "string", minLength: 1, maxLength: 100 }, width: { type: "integer", minimum: 1 }, height: { type: "integer", minimum: 1 },
  params: { type: "object", additionalProperties: false, properties: {
    language: { type: "string", enum: ["zh", "en", "source"] }, voice: { type: "string", minLength: 1, maxLength: 100 }, rate: { type: "number", minimum: 0.5, maximum: 2 },
    fit: { type: "string", maxLength: 30 }, sourceStartSeconds: { type: "number", minimum: 0 }, playbackRate: { type: "number", minimum: 0.1, maximum: 5 }, focusX: { type: "number", minimum: 0, maximum: 1 }, focusY: { type: "number", minimum: 0, maximum: 1 },
    offsetY: { type: "number" }, offsetYDelta: { type: "number" }, color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, fontSize: { type: "number", minimum: 12, maximum: 240 }, fontWeight: { type: "integer", minimum: 100, maximum: 900 },
    atFrame: { type: "integer", minimum: 1 }, startFrame: { type: "integer", minimum: 0 }, endFrame: { type: "integer", minimum: 1 }, volume: { type: "number", minimum: 0, maximum: 2 }, role: { type: "string", maxLength: 40 }, newId: { type: "string", minLength: 1, maxLength: 200 },
    html: { type: "string", maxLength: 20000 }, css: { type: "string", maxLength: 30000 }, timeline: { type: "string", maxLength: 30000 },
    parameters: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false, properties: { name: { type: "string", maxLength: 100 }, value: { type: "number" }, min: { type: "number" }, max: { type: "number" } }, required: ["name", "value", "min", "max"] } },
    objects: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false, properties: { elementId: { type: "string", maxLength: 200 }, nodeId: { type: "string", maxLength: 200 } }, required: ["elementId", "nodeId"] } },
    motionTargets: { type: "array", maxItems: 100, items: { type: "string", maxLength: 200 } },
    textStyles: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false, properties: { elementId: { type: "string", maxLength: 200 }, match: { type: "string", maxLength: 200 }, fontSize: { type: "number" }, fontWeight: { type: "number" }, color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" } }, required: ["elementId", "match", "fontSize", "fontWeight", "color"] } },
    values: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false, properties: { name: { type: "string", maxLength: 100 }, value: { type: "number" } }, required: ["name", "value"] } }
    ,captions: { type: "array", maxItems: 500, items: { type: "object", additionalProperties: false, properties: { id: { type: "string", maxLength: 200 }, text: { type: "string", maxLength: 500 }, startFrame: { type: "integer", minimum: 0 }, endFrame: { type: "integer", minimum: 1 }, assetId: { type: "string", maxLength: 200 }, sourceStartSeconds: { type: "number", minimum: 0 }, sourceEndSeconds: { type: "number", minimum: 0 } }, required: ["id", "text", "startFrame", "endFrame"] } }
  } }
};
function operation(type, required){
  const properties={type:{const:type}};for(const key of required)properties[key]=operationFields[key];
  for(const key of Object.keys(operationFields))if(!required.includes(key)&&key!=='type')properties[key]=operationFields[key];
  return {type:"object",required:["type",...required],properties,additionalProperties:false};
}
const operationSchemas=[
  operation("update_text",["nodeId","text"]), operation("update_caption",["nodeId","text"]), operation("update_text_style",["nodeId","params"]), operation("update_caption_style",["params"]),
  operation("generate_captions",["params"]), operation("regenerate_speech",["nodeId","params"]), operation("replace_asset",["nodeId","assetId"]), operation("update_media",["nodeId","params"]), operation("update_audio",["nodeId","params"]), operation("remove_audio",["nodeId"]), operation("remove_caption",["nodeId"]),
  operation("set_scene_duration",["sceneId","durationFrames"]), operation("set_node_duration",["nodeId","durationFrames"]), operation("set_scene_effect",["sceneId","effect"]), operation("update_effect_params",["sceneId","params"]), operation("set_transition",["fromSceneId","toSceneId","effect","durationFrames"]), operation("change_output",["width","height"]), operation("reorder_scenes",["sceneIds"]), operation("lock_scene",["sceneId"]), operation("unlock_scene",["sceneId"]), operation("split_scene",["sceneId","params"]), operation("trim_scene",["sceneId","params"]), operation("duplicate_media",["sceneId","nodeId","params"]), operation("add_audio",["assetId","params"]), operation("retime_document",["durationFrames"]), operation("update_custom_source",["sceneId","params"]),
  operation("add_text",["sceneId","text"]), operation("set_captions",["params"]), operation("create",[]), operation("generate",[]), operation("export",[])
];
const changes={type:"array",minItems:1,maxItems:100,description:"按操作类型使用严格参数；业务生成操作先预检后执行。",items:{oneOf:operationSchemas}};
const keep = { type: "array", maxItems: 100, items: { type: "string", minLength: 1, maxLength: 500 } };
const writeContext = {
  attachmentIds: Type.Optional({ type: "array", maxItems: 30, items: idSchema }),
  // OpenClaw Control UI stores local uploads behind opaque inbound receipts.
  // Only media://inbound/<filename> values belong here; the backend resolves
  // and imports them before the authorized operation runs.
  attachmentPaths: Type.Optional({ type: "array", maxItems: 30, items: { type: "string", minLength: 1, maxLength: 1024 } }),
  taskMode: Type.Optional({ type: "string", enum: ["create", "edit", "recut", "variant"] }),
  scenarioId: Type.Optional({ type: "string", enum: ["product_launch", "product_detail", "product_demo", "product_collection", "product_promotion", "product_faq", "general"] }),
  workflowProfile: Type.Optional(idSchema),
  selectedNodeId: optionalId
};
const outputSchema = Type.Optional(Type.Object({
  width: Type.Optional({type:"integer",minimum:1,maximum:16384}), height: Type.Optional({type:"integer",minimum:1,maximum:16384}), durationSeconds: Type.Optional({type:"number",minimum:1,maximum:3600}), fps: Type.Optional({type:"number",minimum:1,maximum:120})
},{additionalProperties:false}));
const audioSchema = Type.Optional(Type.Object({
  mode: Type.Optional({type:"string",maxLength:40}), narration: Type.Optional({type:"string",maxLength:200}), music: Type.Optional({type:"string",maxLength:200}), original: Type.Optional({type:"string",maxLength:200}), voice: Type.Optional({type:"string",maxLength:100})
},{additionalProperties:false}));
const orchestrationFields = {
  taskMode: Type.Optional({ type: "string", enum: ["create", "edit", "recut", "variant"] }),
  scenarioId: Type.Optional({ type: "string", enum: ["product_launch", "product_detail", "product_demo", "product_collection", "product_promotion", "product_faq", "general"] }),
  workflowProfile: Type.Optional(idSchema), selectedNodeId: optionalId,
  platform: Type.Optional({type:"string",maxLength:80}), output: outputSchema, audio: audioSchema,
  // Explicitly identify a recoverable child job so retry cannot create a new job.
  resumeJobId: Type.Optional({ anyOf: [idSchema, { type: "null" }], description: "Use null for a new task or new revision. Set an existing job ID only when the user explicitly asks to resume that same job without changing its request." }),
};
const nativeWriteFields = { operationId: Type.Optional(idSchema), authorizationId: Type.Optional(idSchema) };
const schemas = {
  // A task without an explicit project is a valid new task. The authorization
  // route creates the native editable project and returns its identity before
  // the write reaches the engine. Keeping this nullable here is required for
  // both text-only requests and Control UI uploads.
  video_prepare: Type.Object({ projectId: Type.Optional({ anyOf: [idSchema, { type: "null" }] }), message: { type: "string", minLength: 1, maxLength: 20000 }, ...writeContext, ...orchestrationFields }, { additionalProperties: false }),
  video_resource_search: Type.Object({ projectId: Type.Optional({ anyOf: [idSchema, { type: "null" }] }), query: {type:"string",minLength:1,maxLength:500} }, { additionalProperties: false }),
  video_web_research: Type.Object({ projectId: Type.Optional({ anyOf: [idSchema, { type: "null" }] }), query: Type.Optional({type:"string",maxLength:500}), urls: Type.Optional({type:"array",maxItems:3,items:{type:"string",minLength:1,maxLength:2048}}), maxItems: Type.Optional({type:"integer",minimum:1,maximum:10}) }, { additionalProperties: false }),
  video_task: Type.Object({ projectId: Type.Optional({ anyOf: [idSchema, { type: "null" }] }), message: { type: "string", minLength: 1, maxLength: 20000 }, ...writeContext, ...orchestrationFields, baseRevisionId: Type.Optional(baseRevision) }, { additionalProperties: false }),
  video_project_list: Type.Object({ query: Type.Optional({ type: "string", maxLength: 200 }), maxItems: Type.Optional({ type: "integer", minimum: 1, maximum: 50 }) }, { additionalProperties: false }),
  video_project_open: Type.Object({ projectId: idSchema }, { additionalProperties: false }),
  video_job_status: Type.Object({ projectId: idSchema, jobId: idSchema }, { additionalProperties: false }),
  video_result: Type.Object({ projectId: idSchema, revisionId: optionalNullableId }, { additionalProperties: false }),
  video_cancel: Type.Object({ projectId: idSchema, baseRevisionId: Type.Optional(baseRevision), jobId: idSchema }, { additionalProperties: false })
};

let uploadRouteRegistered = false;
function resolveConfigValue(value, envName) {
  const configured = String(value || '').trim();
  if (configured && !configured.includes('${')) return configured;
  return String(process.env[envName] || '').trim();
}
function resolveBridgeUrl(config) {
  const value = resolveConfigValue(config?.bridgeUrl, 'VIDEO_AGENT_BRIDGE_URL');
  if (!/^https?:\/\/[^\s]+$/.test(value)) throw new Error('commerce bridge URL is not configured');
  return value.replace(/\/$/, '');
}
function resolveWorkspaceId(config) {
  return resolveConfigValue(config?.workspaceId, 'VIDEO_AGENT_WORKSPACE_ID');
}
const RESPONSE_PRIORITY = new Set([
  "schemaVersion", "tool", "status", "stage", "id", "projectId", "jobId", "operationId",
  "revisionId", "currentRevisionId", "baseRevisionId", "resultRevisionId", "childProjectId", "childJobId",
  "name", "title", "code", "error", "message", "question", "retryable", "resumeAllowed", "actionRequired",
  "deliveryValid", "deliveryStatus", "rights", "usageType", "blockingGaps", "requiredInputs",
  "previewUrl", "videoUrl", "downloadUrl", "nativeProjectUrl", "url", "optimizedBrief",
  "files", "artifacts", "artifact"
]);
const RESPONSE_BULK_FIELDS = new Set(["document", "input", "history", "messages", "logs"]);
const RESPONSE_LINK_FIELDS = new Set(["url", "previewUrl", "videoUrl", "downloadUrl", "nativeProjectUrl", "packageUrl"]);
function toolResponseText(payload) {
  const original = JSON.stringify(payload);
  const sourceBytes = Buffer.byteLength(original);
  if (sourceBytes <= 6000) return original;
  let omittedCount = 0;
  const omittedPaths = [];
  const omit = location => {
    omittedCount++;
    if (omittedPaths.length < 6) omittedPaths.push(location.slice(0, 100));
  };
  const size = value => Buffer.byteLength(JSON.stringify(value));
  function summarize(value, budget, location, depth = 0, field = "") {
    if (value === undefined) return undefined;
    if (budget < 16) { omit(location); return undefined; }
    if (typeof value === "string") {
      if (RESPONSE_LINK_FIELDS.has(field)) {
        if (size(value) <= budget) return value;
        omit(location);
        return undefined;
      }
      const limit = Math.min(budget, 1200);
      if (size(value) <= limit) return value;
      let lower = 0;
      let upper = Math.min(value.length, limit);
      while (lower < upper) {
        const middle = Math.ceil((lower + upper) / 2);
        if (size(value.slice(0, middle) + "…[truncated]") <= limit) lower = middle;
        else upper = middle - 1;
      }
      omit(location);
      return value.slice(0, lower).replace(/[\uD800-\uDBFF]$/, "") + "…[truncated]";
    }
    if (value === null || typeof value !== "object") return size(value) <= budget ? value : undefined;
    if (depth >= 7) { omit(location); return undefined; }
    const array = Array.isArray(value);
    const result = array ? [] : {};
    const keys = Object.keys(value).filter(key => {
      if (!array && RESPONSE_BULK_FIELDS.has(key)) { omit(`${location}/${key}`); return false; }
      return true;
    }).sort((left, right) => array ? 0 : Number(RESPONSE_PRIORITY.has(right)) - Number(RESPONSE_PRIORITY.has(left)));
    const selected = keys.slice(0, array ? 12 : 48);
    if (selected.length < keys.length) omit(location);
    let remaining = budget - 2;
    for (const [index, key] of selected.entries()) {
      const overhead = array ? 1 : size(key) + 2;
      const available = remaining - overhead;
      const allowance = RESPONSE_LINK_FIELDS.has(key) ? available
        : ["files", "artifacts", "artifact"].includes(key) ? Math.min(available, 3500)
        : Math.min(available, Math.max(64, Math.floor(available / (selected.length - index))));
      const child = summarize(value[key], allowance, `${location}/${key}`, depth + 1, key);
      if (child === undefined) { if (array) break; continue; }
      if (array) result.push(child);
      else Object.defineProperty(result, key, { value: child, enumerable: true });
      remaining -= overhead + size(child);
    }
    return result;
  }
  const summary = summarize(payload, 6000, "");
  const responseSummary = {
    truncated: omittedCount > 0, sourceBytes, omittedCount, omittedPaths,
    notice: "Partial response; omitted data is not evidence of absence or approval. Use a specific project/job/revision or a narrower search; full records remain in the video workspace."
  };
  const result = summary && !Array.isArray(summary) && typeof summary === "object"
    ? { ...summary, responseSummary } : { result: summary, responseSummary };
  if (size(result) > 7500) responseSummary.omittedPaths = [];
  return JSON.stringify(result);
}
function bridgeError(payload, fallback) {
  const details = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const error = new Error(toolResponseText({ ...details, error: details.error || fallback }));
  if (typeof payload?.code === "string") error.code = payload.code.slice(0, 200);
  if (typeof payload?.retryable === "boolean") error.retryable = payload.retryable;
  return error;
}
function registerUploadRoute(api) {
  if (uploadRouteRegistered || !api?.registerHttpRoute) return;
  uploadRouteRegistered = true;
  api.registerHttpRoute({ path: "/plugins/commerce-engine/upload", auth: "plugin", match: "exact", handler: async (req, res) => {
    if (req.method !== "POST") { res.statusCode = 405; res.end("method not allowed"); return true; }
    const host = String(req.headers.host || "");
    const origin = String(req.headers.origin || "");
    const remote = String(req.socket?.remoteAddress || "");
    const loopbackRemote = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
    const loopbackHost = /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host);
    const localOrigin = !origin || /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(origin);
    if (!loopbackRemote || !loopbackHost || !localOrigin) {
      res.statusCode = 403; res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ok:false, error:"视频上传只允许从本机 Control UI 发起"})); return true;
    }
    const mime = String(req.headers["content-type"] || "application/octet-stream").split(";")[0].toLowerCase();
    const rawName = String(req.headers["x-openclaw-file-name"] || "video.mp4");
    let fileName; try { fileName = decodeURIComponent(rawName); } catch { fileName = rawName; }
    fileName = path.basename(fileName).replace(/[^A-Za-z0-9._-]/g, "_").slice(-160) || "video.mp4";
    const ext = path.extname(fileName).toLowerCase();
    if (!["video/mp4", "video/quicktime", "video/webm", "application/octet-stream", ""].includes(mime) || ![".mp4", ".mov", ".webm"].includes(ext)) { res.statusCode = 415; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ ok:false, error:"仅支持 MP4、MOV、WebM 视频" })); return true; }
    const limit = MAX_VIDEO_UPLOAD_BYTES;
    const declaredLength = Number(req.headers["content-length"] || 0);
    if (Number.isFinite(declaredLength) && declaredLength > limit) {
      res.statusCode = 413; res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ok:false, error:`视频不能超过 ${MAX_VIDEO_UPLOAD_MIB} MiB`})); return true;
    }
    // OPENCLAW_STATE_DIR is the one canonical root.  The backend imports from
    // <state>/media/inbound, so the plugin must use the same default when the
    // environment is not explicitly configured.
    const stateRoot = path.resolve(process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw", "hyperframe", "state"));
    const inbound = path.resolve(process.env.OPENCLAW_INBOUND_MEDIA_DIR || path.join(stateRoot, "media", "inbound")); await fsp.mkdir(inbound, {recursive:true, mode:0o700});
    const id = crypto.randomUUID(); const target = path.join(inbound, `${id}-${fileName}`); const temp = `${target}.part`;
    let bytes = 0;
    try {
      await new Promise((resolve, reject) => { const out = fs.createWriteStream(temp, {flags:"wx", mode:0o600}); const fail = e => { out.destroy(); reject(e); }; req.on("data", chunk => { bytes += chunk.length; if (bytes > limit) fail(Object.assign(new Error(`视频不能超过 ${MAX_VIDEO_UPLOAD_MIB} MiB`), {statusCode:413})); else if (!out.write(chunk)) req.pause(); }); out.on("drain", () => req.resume()); req.on("end", () => out.end(resolve)); req.on("error", reject); out.on("error", reject); });
      await fsp.rename(temp, target);
      const detectedMime = mime === "application/octet-stream" || !mime ? (ext === ".mov" ? "video/quicktime" : ext === ".webm" ? "video/webm" : "video/mp4") : mime;
      res.statusCode = 200; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ok:true, mediaPath:`media://inbound/${path.basename(target)}`, fileName, mimeType:detectedMime, bytes, path:target})); return true;
    } catch (error) { await fsp.rm(temp, {force:true}).catch(()=>{}); res.statusCode = error.statusCode || 500; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ok:false, error:error.message || "视频上传失败"})); return true; }
  }});
}

function buildTool(name, description) {
  return { name, label: name, description, parameters: schemas[name],
    factory({ config, toolContext, api }) {
      registerUploadRoute(api);
      const sessionKey = toolContext.sessionKey;
      return { name, label: name, description, parameters: schemas[name],
        async execute(toolCallId, params, signal) {
          if (!sessionKey) throw new Error("missing trusted OpenClaw session; commerce tool is blocked");
          if (signal?.aborted) throw new Error("tool call cancelled");
          const token = process.env[config.bridgeTokenEnv];
          if (!token) throw new Error("missing bridge token; commerce tool is blocked");
          const trustedContext = { trusted: true, workspaceId: resolveWorkspaceId(config), sessionKey, agentId: toolContext.agentId || null, toolCallId,
            messageId: toolContext.messageId || toolContext.inboundMessageId || `tool:${toolCallId}` };
          let input = { ...params };
          const writes = ["video_task","video_cancel"];
          // Attachment import is a side effect even during preparation. Keep
          // text-only preparation read-only, but obtain the same server-issued
          // write authorization before the bridge touches inbound media.
          const attachmentAuthorization = name === "video_prepare" &&
            ((Array.isArray(input.attachmentPaths) && input.attachmentPaths.length) ||
             (Array.isArray(input.attachmentIds) && input.attachmentIds.length));
          if (writes.includes(name) || attachmentAuthorization) {
            // Tool arguments are model output. Never trust model-supplied
            // authorization or idempotency identifiers for a write.
            const authorizationInput = { ...input };
            delete authorizationInput.authorizationId;
            delete authorizationInput.operationId;
            const authorizationResponse = await fetch(resolveBridgeUrl(config) + "/api/openclaw/authorize", {
              method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
              body: JSON.stringify({ tool: name, input: authorizationInput, trustedContext }), signal
            });
            const authorizationPayload = await authorizationResponse.json().catch(() => ({ error: "authorization endpoint returned invalid JSON" }));
            if (!authorizationResponse.ok) throw bridgeError(authorizationPayload, "commerce authorization " + authorizationResponse.status);
            input = { ...authorizationInput,
              projectId: authorizationPayload.projectId || authorizationInput.projectId,
              // `null` is the authoritative base for a draft/new project. Do
              // not use ?? here: it would erase the property and make the
              // facade report the misleading "baseRevisionId missing" error.
              baseRevisionId: Object.hasOwn(authorizationPayload, "baseRevisionId") ? authorizationPayload.baseRevisionId : authorizationInput.baseRevisionId,
              authorizationId: authorizationPayload.authorizationId,
              operationId: authorizationPayload.operationId
            };
          }
          const body = { tool: name, input, trustedContext };
          const bridge = resolveBridgeUrl(config);
          const response = await fetch(bridge + "/api/openclaw/tools", {
            method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(body), signal
          });
          const payload = await response.json().catch(() => ({ error: "bridge returned invalid JSON" }));
          if (!response.ok) throw bridgeError(payload, "commerce bridge " + response.status);
          return { content: [{ type: "text", text: toolResponseText(payload) }] };
        }
      };
    }
  };
}

const configSchema = Type.Object({
  bridgeUrl: Type.String({ pattern: "^https?://[^\\s]+$" }),
  bridgeTokenEnv: Type.String({ pattern: "^[A-Z][A-Z0-9_]{2,80}$" }),
  workspaceId: Type.String({ minLength: 1, maxLength: 200 })
});
const pluginEntry = defineToolPlugin({ id: "commerce-engine", name: "Commerce Engine", description: "Controlled tools for the existing video-agent commerce service.", activation: { onStartup: true }, configSchema, tools: () => TOOLS.map(([name, description]) => buildTool(name, description)) });
const registerTools = pluginEntry.register;
pluginEntry.register = (api) => { registerUploadRoute(api); return registerTools(api); };
export default pluginEntry;
