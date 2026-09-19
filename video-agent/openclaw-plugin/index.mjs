import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { Type } from "typebox";

const TOOLS = [
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
  taskMode: Type.Optional({ type: "string", enum: ["create", "edit", "recut", "variant"] }),
  scenarioId: Type.Optional({ type: "string", enum: ["product_launch", "product_detail", "product_demo", "product_collection", "product_promotion", "product_faq", "general"] }),
  workflowProfile: Type.Optional(idSchema),
  selectedNodeId: optionalId
};
const schemas = {
  commerce_project_list: Type.Object({ query: Type.Optional({ type: "string", maxLength: 200 }), maxItems: Type.Optional({ type: "integer", minimum: 1, maximum: 50 }) }, { additionalProperties: false }),
  commerce_project_get: Type.Object({ projectId: idSchema }, { additionalProperties: false }),
  commerce_resource_search: Type.Object({ projectId: optionalId, query: Type.Optional({ type: "string", maxLength: 500 }) }, { additionalProperties: false }),
  commerce_plan_validate: Type.Object({ projectId: idSchema, baseRevisionId: optionalId, requestedChanges: Type.Optional(changes), keep: Type.Optional(keep) }, { additionalProperties: false }),
  commerce_create_video: Type.Object({ projectId: idSchema, baseRevisionId: baseRevision, operationId: idSchema, message: { type: "string", minLength: 1, maxLength: 20000 }, requestedChanges: changes, keep, authorizationId: idSchema, ...writeContext }, { additionalProperties: false }),
  commerce_edit_video: Type.Object({ projectId: idSchema, baseRevisionId: baseRevision, operationId: idSchema, message: { type: "string", minLength: 1, maxLength: 20000 }, requestedChanges: changes, keep, authorizationId: idSchema, ...writeContext }, { additionalProperties: false }),
  commerce_generate_asset: Type.Object({ projectId: idSchema, baseRevisionId: baseRevision, operationId: idSchema, message: { type: "string", minLength: 1, maxLength: 20000 }, requestedChanges: changes, keep, authorizationId: idSchema, ...writeContext }, { additionalProperties: false }),
  commerce_job_get: Type.Object({ projectId: idSchema, jobId: idSchema }, { additionalProperties: false }),
  commerce_job_control: Type.Object({ projectId: idSchema, baseRevisionId: baseRevision, operationId: idSchema, jobId: idSchema, action: { type: "string", enum: ["cancel", "resume"] }, requestedChanges: changes, keep, authorizationId: idSchema }, { additionalProperties: false }),
  commerce_revision_control: Type.Object({ projectId: idSchema, baseRevisionId: baseRevision, operationId: idSchema, revisionId: optionalId, action: { type: "string", enum: ["undo", "redo", "restore"] }, requestedChanges: changes, keep, authorizationId: idSchema }, { additionalProperties: false }),
  commerce_export: Type.Object({ projectId: idSchema, baseRevisionId: baseRevision, operationId: idSchema, revisionId: optionalId, requestedChanges: changes, keep, authorizationId: idSchema }, { additionalProperties: false }),
  commerce_artifact_list: Type.Object({ projectId: idSchema, revisionId: optionalId }, { additionalProperties: false })
};

function buildTool(name, description) {
  return { name, label: name, description, parameters: schemas[name],
    factory({ config, toolContext }) {
      const sessionKey = toolContext.sessionKey;
      return { name, label: name, description, parameters: schemas[name],
        async execute(toolCallId, params, signal) {
          if (!sessionKey) throw new Error("missing trusted OpenClaw session; commerce tool is blocked");
          if (signal?.aborted) throw new Error("tool call cancelled");
          const token = process.env[config.bridgeTokenEnv];
          if (!token) throw new Error("missing bridge token; commerce tool is blocked");
          const body = { tool: name, input: params, trustedContext: { trusted: true, workspaceId: config.workspaceId, sessionKey, agentId: toolContext.agentId || null, toolCallId } };
          const response = await fetch(config.bridgeUrl.replace(/\/$/, "") + "/api/openclaw/tools", {
            method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(body), signal
          });
          const payload = await response.json().catch(() => ({ error: "bridge returned invalid JSON" }));
          if (!response.ok) throw new Error(payload.error || ("commerce bridge " + response.status));
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
export default defineToolPlugin({ id: "commerce-engine", name: "Commerce Engine", description: "Controlled tools for the existing video-agent commerce service.", activation: { onStartup: true }, configSchema, tools: () => TOOLS.map(([name, description]) => buildTool(name, description)) });
