import {buildCommerceProject} from '../lib/creative/runner.mjs';

let body = '';
for await (const chunk of process.stdin) body += chunk;
try {
  const request = JSON.parse(body || '{}');
  const result = await buildCommerceProject(request);
  process.stdout.write(JSON.stringify({ok: true, result}) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ok: false, error: {message: error.message, code: error.code || 'COMMERCE_TOOL_FAILED'}}) + '\n');
  process.exitCode = 1;
}
