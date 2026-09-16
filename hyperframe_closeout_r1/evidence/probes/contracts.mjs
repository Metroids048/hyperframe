// Benign fixture-only path and condition stubs. Not a test of production security.
import path from 'node:path';
export function insist(ok,message,code){if(!ok)throw Object.assign(new Error(message),{code});}
export function safeRelativePath(root,rel){const p=path.resolve(root,rel);if(!p.startsWith(path.resolve(root)+path.sep))throw Error('OUTSIDE_FIXTURE');return p;}
