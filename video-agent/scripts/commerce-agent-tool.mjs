import {buildCommerceProject, patchCommerceProject, renderCommerceProject} from '../lib/creative/runner.mjs';

let body = '';
for await (const chunk of process.stdin) body += chunk;
try {
  const input = JSON.parse(body || '{}');
  const action = input.action || 'create';
  let result;
  if (action === 'create') result = await buildCommerceProject(input.request || input);
  else if (action === 'patch') result = await patchCommerceProject(input);
  else if (action === 'render') result = await renderCommerceProject(input);
  else throw Object.assign(new Error(`不支持的 commerce action：${action}`), {code: 'UNSUPPORTED_ACTION'});
  process.stdout.write(JSON.stringify({ok: true, action, result}) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ok: false, error: {message: error.message, code: error.code || 'COMMERCE_TOOL_FAILED'}}) + '\n');
  process.exitCode = 1;
}
