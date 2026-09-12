import path from 'node:path';
import {ROOT} from '../lib/workflow.mjs';
process.env.VIDEO_AGENT_PORT='3040';
process.env.VIDEO_AGENT_EDIT_DATA_DIR=path.join(ROOT,'outputs/upgrade/live-app/projects');
process.env.VIDEO_AGENT_DATA_DIR=path.join(ROOT,'outputs/upgrade/live-app/legacy');
process.env.EDIT_MEDIA_CACHE_DIR=path.join(ROOT,'outputs/upgrade/live-app/media-cache');
process.env.VIDEO_AGENT_CACHE_ROOT=path.join(ROOT,'outputs/upgrade/live-app/speech-cache');
await import('../server.mjs');
