import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { Type } from "typebox";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const TOOLS = [
  ["commerce_project_create", "Create and bind a clean native commerce project for this OpenClaw session."],
  ["commerce_project_list", "List editable video projects so the user can choose one in chat."],
  ["commerce_project_get", "Read the current project, revision, objects, and delivery state."],
  ["commerce_resource_search", "Search executable local commerce resources without installing anything."],
  ["commerce_plan_validate", "Validate a plan, target scope, keep-set, and base revision."],
  ["commerce_create_video", "Enqueue a bounded new video job and return its job id."],
  ["commerce_edit_video", "Enqueue a bounded object-level edit and return its job id."],
  ["commerce_generate_asset", "Enqueue an explicitly authorized asset generation job."],
  ["commerce_job_get", "Read a real job status and checkpoint."],
  ["commerce_job_control", "Cancel or resume a persisted job."],
  ["commerce_revision_control", "Undo, redo, or restore a validated revision."],
  ["commerce_export", "Enqueue export for a validated revision."],
  ["commerce_artifact_list", "List authorized artifacts for a revision."]
];

const idSchema = { type: "string", minLength: 1, maxLength: 200 };
const optionalId = Type.Optional(idSchema);
const baseRevision = { anyOf: [idSchema, { type: "null" }] };
const changes = { type: "array", minItems: 1, maxItems: 100, items: { type: "object", additionalProperties: true } };
const keep = { type: "array", maxItems: 100, items: { type: "string", minLength: 1, maxLength: 500 } };
const writeContext = {
  attachmentIds: Type.Optional({ type: "array", maxItems: 30, items: idSchema }),
  // OpenClaw Control UI stores local uploads as inbound MediaPaths. The
  // model may copy those paths into this field; the backend validates the
  // directory and imports them before the authorized operation runs.
  attachmentPaths: Type.Optional({ type: "array", maxItems: 30, items: { type: "string", minLength: 1, maxLength: 1024 } }),
  taskMode: Type.Optional({ type: "string", enum: ["create", "edit", "recut", "variant"] }),
  scenarioId: Type.Optional({ type: "string", enum: ["product_launch", "product_detail", "product_demo", "product_collection", "product_promotion", "product_faq", "general"] }),
  workflowProfile: Type.Optional(idSchema),
  selectedNodeId: optionalId
};
const nativeWriteFields = { operationId: Type.Optional(idSchema), authorizationId: Type.Optional(idSchema) };
const schemas = {
  commerce_project_create: Type.Object({ name: Type.Optional({ type: "string", maxLength: 200 }), request: Type.Optional({ type: "object", additionalProperties: true }), ...nativeWriteFields }, { additionalProperties: false }),
  commerce_project_list: Type.Object({ query: Type.Optional({ type: "string", maxLength: 200 }), maxItems: Type.Optional({ type: "integer", minimum: 1, maximum: 50 }) }, { additionalProperties: false }),
  commerce_project_get: Type.Object({ projectId: idSchema }, { additionalProperties: false }),
  commerce_resource_search: Type.Object({ projectId: optionalId, query: Type.Optional({ type: "string", maxLength: 500 }) }, { additionalProperties: false }),
  commerce_plan_validate: Type.Object({ projectId: idSchema, baseRevisionId: baseRevision, requestedChanges: changes, keep }, { additionalProperties: false }),
  commerce_create_video: Type.Object({ projectId: idSchema, baseRevisionId: baseRevision, message: { type: "string", minLength: 1, maxLength: 20000 }, requestedChanges: changes, keep, ...nativeWriteFields, ...writeContext }, { additionalProperties: false }),
  commerce_edit_video: Type.Object({ projectId: idSchema, baseRevisionId: baseRevision, message: { type: "string", minLength: 1, maxLength: 20000 }, requestedChanges: changes, keep, ...nativeWriteFields, ...writeContext }, { additionalProperties: false }),
  commerce_generate_asset: Type.Object({ projectId: idSchema, baseRevisionId: baseRevision, message: { type: "string", minLength: 1, maxLength: 20000 }, requestedChanges: changes, keep,
    // These fields are part of the executor contract.  Keep them explicit so
    // capability probing can distinguish an image request from the default
    // video branch and can bind an already-approved source asset.
    assetKind: Type.Optional({ type: "string", enum: ["image", "video"] }),
    target: Type.Optional({ type: "string", enum: ["image", "video"] }),
    sourceAssetId: Type.Optional(idSchema),
    ...nativeWriteFields, ...writeContext }, { additionalProperties: false }),
  commerce_job_get: Type.Object({ projectId: idSchema, jobId: idSchema }, { additionalProperties: false }),
  commerce_job_control: Type.Object({ projectId: idSchema, baseRevisionId: baseRevision, jobId: idSchema, action: { type: "string", enum: ["cancel", "resume"] }, requestedChanges: changes, keep, ...nativeWriteFields }, { additionalProperties: false }),
  commerce_revision_control: Type.Object({ projectId: idSchema, baseRevisionId: baseRevision, revisionId: optionalId, action: { type: "string", enum: ["undo", "redo", "restore"] }, requestedChanges: changes, keep, ...nativeWriteFields }, { additionalProperties: false }),
  commerce_export: Type.Object({ projectId: idSchema, baseRevisionId: baseRevision, revisionId: optionalId, requestedChanges: changes, keep, ...nativeWriteFields }, { additionalProperties: false }),
  commerce_artifact_list: Type.Object({ projectId: idSchema, revisionId: optionalId }, { additionalProperties: false })
};

let uploadRouteRegistered = false;
function registerUploadRoute(api) {
  if (uploadRouteRegistered || !api?.registerHttpRoute) return;
  uploadRouteRegistered = true;
  api.registerHttpRoute({ path: "/plugins/commerce-engine/upload", auth: "gateway", match: "exact", handler: async (req, res) => {
    if (req.method !== "POST") { res.statusCode = 405; res.end("method not allowed"); return; }
    const mime = String(req.headers["content-type"] || "application/octet-stream").split(";")[0].toLowerCase();
    const rawName = String(req.headers["x-openclaw-file-name"] || "video.mp4");
    let fileName; try { fileName = decodeURIComponent(rawName); } catch { fileName = rawName; }
    fileName = path.basename(fileName).replace(/[^A-Za-z0-9._-]/g, "_").slice(-160) || "video.mp4";
    const ext = path.extname(fileName).toLowerCase();
    if (!["video/mp4", "video/quicktime", "video/webm", "application/octet-stream", ""].includes(mime) || ![".mp4", ".mov", ".webm"].includes(ext)) { res.statusCode = 415; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ ok:false, error:"仅支持 MP4、MOV、WebM 视频" })); return; }
    const limit = 1024 * 1024 * 1024;
    // OPENCLAW_STATE_DIR is the one canonical root.  The backend imports from
    // <state>/media/inbound, so the plugin must use the same default when the
    // environment is not explicitly configured.
    const stateRoot = path.resolve(process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw", "hyperframe", "state"));
    const inbound = path.join(stateRoot, "media", "inbound"); await fsp.mkdir(inbound, {recursive:true, mode:0o700});
    const id = crypto.randomUUID(); const target = path.join(inbound, `${id}-${fileName}`); const temp = `${target}.part`;
    let bytes = 0;
    try {
      await new Promise((resolve, reject) => { const out = fs.createWriteStream(temp, {flags:"wx", mode:0o600}); const fail = e => { out.destroy(); reject(e); }; req.on("data", chunk => { bytes += chunk.length; if (bytes > limit) fail(Object.assign(new Error("视频超过 1 GiB 限制"), {statusCode:413})); else if (!out.write(chunk)) req.pause(); }); out.on("drain", () => req.resume()); req.on("end", () => out.end(resolve)); req.on("error", reject); out.on("error", reject); });
      await fsp.rename(temp, target);
      const detectedMime = mime === "application/octet-stream" || !mime ? (ext === ".mov" ? "video/quicktime" : ext === ".webm" ? "video/webm" : "video/mp4") : mime;
      res.statusCode = 200; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ok:true, mediaPath:`media://inbound/${path.basename(target)}`, fileName, mimeType:detectedMime, bytes, path:target}));
    } catch (error) { await fsp.rm(temp, {force:true}).catch(()=>{}); res.statusCode = error.statusCode || 500; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ok:false, error:error.message || "视频上传失败"})); }
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
          if (name === "commerce_project_create") input = { ...input, projectId: "new" };
  const writes = ["commerce_project_create","commerce_create_video","commerce_edit_video","commerce_generate_asset","commerce_job_control","commerce_revision_control","commerce_export"];
          if (writes.includes(name) && !input.authorizationId) {
            const authorizationResponse = await fetch(config.bridgeUrl.replace(/\/$/, "") + "/api/openclaw/authorize", {
              method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
              body: JSON.stringify({ tool: name, input, trustedContext }), signal
            });
            const authorizationPayload = await authorizationResponse.json().catch(() => ({ error: "authorization endpoint returned invalid JSON" }));
            if (!authorizationResponse.ok) { const error = new Error(authorizationPayload.error || ("commerce authorization " + authorizationResponse.status)); Object.assign(error, authorizationPayload); throw error; }
            input = { ...input, authorizationId: authorizationPayload.authorizationId, operationId: input.operationId || authorizationPayload.operationId };
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
