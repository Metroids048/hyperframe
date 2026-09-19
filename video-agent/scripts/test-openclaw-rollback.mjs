import assert from "node:assert/strict";
import {createStructuredProvider} from "../lib/openclaw/provider-selection.mjs";
import {OpenClawStageProvider} from "../lib/openclaw/openclaw-stage-provider.mjs";
const old=process.env.COMMERCE_AGENT_RUNTIME;
const oldToken=process.env.OPENCLAW_STAGE_TOKEN,oldModel=process.env.OPENCLAW_STAGE_MODEL;
try {
  delete process.env.OPENCLAW_STAGE_TOKEN;delete process.env.OPENCLAW_STAGE_MODEL;
  process.env.COMMERCE_AGENT_RUNTIME="openclaw";
  const openclaw=createStructuredProvider();
  assert.equal(openclaw.runtime,"openclaw");
  assert.ok(openclaw.provider instanceof OpenClawStageProvider);
  await assert.rejects(()=>openclaw.provider.structured("x",[],{type:"object"}),error=>error.code==="OPENCLAW_STAGE_BLOCKED");
  await openclaw.provider.close();
  process.env.COMMERCE_AGENT_RUNTIME="shadow";
  const shadow=createStructuredProvider();
  assert.equal(shadow.runtime,"shadow");
  assert.equal(shadow.provider.constructor.name,"CodexProvider","shadow compares OpenClaw routing but production must stay on the legacy provider");
  await shadow.provider.close();
  process.env.COMMERCE_AGENT_RUNTIME="legacy";
  const legacy=createStructuredProvider({cacheRoot:"/tmp/openclaw-rollback-test"});
  assert.equal(legacy.runtime,"legacy");
  assert.equal(legacy.provider.constructor.name,"CodexProvider");
  await legacy.provider.close();
  console.log("local rollback routing rehearsal passed; no Gateway or media job was started");
} finally {
  if(old===undefined) delete process.env.COMMERCE_AGENT_RUNTIME; else process.env.COMMERCE_AGENT_RUNTIME=old;
  if(oldToken===undefined) delete process.env.OPENCLAW_STAGE_TOKEN; else process.env.OPENCLAW_STAGE_TOKEN=oldToken;
  if(oldModel===undefined) delete process.env.OPENCLAW_STAGE_MODEL; else process.env.OPENCLAW_STAGE_MODEL=oldModel;
}
