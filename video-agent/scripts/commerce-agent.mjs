import fs from 'node:fs/promises';
import path from 'node:path';
import {buildCommerceProject, VIDEO_AGENT_ROOT} from '../lib/creative/runner.mjs';

const args = process.argv.slice(2);
const inputIndex = args.indexOf('--input');
const render = args.includes('--render');
if (inputIndex < 0 || !args[inputIndex + 1]) {
  console.error('用法: node scripts/commerce-agent.mjs --input examples/commerce/request.sample.json [--render]');
  process.exit(2);
}
try {
  const inputPath = path.resolve(VIDEO_AGENT_ROOT, args[inputIndex + 1]);
  const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  if (render) input.render = true;
  const result = await buildCommerceProject(input);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) {
  console.error(JSON.stringify({error: error.message, code: error.code || 'COMMERCE_RUN_FAILED'}, null, 2));
  process.exitCode = 1;
}
