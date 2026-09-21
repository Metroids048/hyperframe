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
  ["video_task", "Submit a natural-language video task and preserve the editable project. A queued/running result is a successful asynchronous acknowledgement: report its real projectId/jobId/stage and stop; do not poll in the same turn."],
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
    fit: { type: "string", maxLength: 30 }, sourceStartSeconds: { type: "number", minimum: 0 }, playbackRate: { type: "number", minimum: 0.1, maximum: 5 },
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
const nativeWriteFields = { operationId: Type.Optional(idSchema), authorizationId: Type.Optional(idSchema) };
const schemas = {
  // A task without an explicit project is a valid new task. The authorization
  // route creates the native editable project and returns its identity before
  // the write reaches the engine. Keeping this nullable here is required for
  // both text-only requests and Control UI uploads.
  video_task: Type.Object({ projectId: Type.Optional({ anyOf: [idSchema, { type: "null" }] }), message: { type: "string", minLength: 1, maxLength: 20000 }, attachmentIds: Type.Optional({ type: "array", maxItems: 30, items: idSchema }), attachmentPaths: Type.Optional({ type: "array", maxItems: 30, items: { type: "string", minLength: 1, maxLength: 1024 } }), baseRevisionId: Type.Optional(baseRevision), selectedNodeId: optionalId }, { additionalProperties: false }),
  video_project_list: Type.Object({ query: Type.Optional({ type: "string", maxLength: 200 }), maxItems: Type.Optional({ type: "integer", minimum: 1, maximum: 50 }) }, { additionalProperties: false }),
  video_project_open: Type.Object({ projectId: idSchema }, { additionalProperties: false }),
  video_job_status: Type.Object({ projectId: idSchema, jobId: idSchema }, { additionalProperties: false }),
  video_result: Type.Object({ projectId: idSchema, revisionId: optionalNullableId }, { additionalProperties: false }),
  video_cancel: Type.Object({ projectId: idSchema, baseRevisionId: Type.Optional(baseRevision), jobId: idSchema }, { additionalProperties: false })
};

let uploadRouteRegistered = false;
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
          const trustedContext = { trusted: true, workspaceId: config.workspaceId, sessionKey, agentId: toolContext.agentId || null, toolCallId,
            messageId: toolContext.messageId || toolContext.inboundMessageId || `tool:${toolCallId}` };
          let input = { ...params };
          const writes = ["video_task","video_cancel"];
          if (writes.includes(name)) {
            // Tool arguments are model output. Never trust model-supplied
            // authorization or idempotency identifiers for a write.
            const authorizationInput = { ...input };
            delete authorizationInput.authorizationId;
            delete authorizationInput.operationId;
            const authorizationResponse = await fetch(config.bridgeUrl.replace(/\/$/, "") + "/api/openclaw/authorize", {
              method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
              body: JSON.stringify({ tool: name, input: authorizationInput, trustedContext }), signal
            });
            const authorizationPayload = await authorizationResponse.json().catch(() => ({ error: "authorization endpoint returned invalid JSON" }));
            if (!authorizationResponse.ok) { const error = new Error(authorizationPayload.error || ("commerce authorization " + authorizationResponse.status)); Object.assign(error, authorizationPayload); throw error; }
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
          const response = await fetch(config.bridgeUrl.replace(/\/$/, "") + "/api/openclaw/tools", {
            method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(body), signal
          });
          const payload = await response.json().catch(() => ({ error: "bridge returned invalid JSON" }));
          if (!response.ok) { const error = new Error(payload.error || ("commerce bridge " + response.status)); Object.assign(error, payload); throw error; }
          return { content: [{ type: "text", text: JSON.stringify(payload) }] };
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
