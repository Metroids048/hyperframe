import path from 'node:path';
import {captureRuntimeIdentity} from '../lib/creative/runtime-build.mjs';
const root=path.resolve(import.meta.dirname,'..');
console.log(JSON.stringify(await captureRuntimeIdentity(root,process.env.VIDEO_AGENT_CREATIVE_DATA_DIR||path.join(root,'data/commerce-runs'))));
