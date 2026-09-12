import fs from 'node:fs';
let s=fs.readFileSync('scripts/build-web.mjs','utf8');s=s.replace("+'\\n'+(await fs.readFile(path.join(ROOT,'web/experience.js'),'utf8'))","+'\\n'+(await fs.readFile(path.join(ROOT,'web/experience.js'),'utf8'))+'\\n'+(await fs.readFile(path.join(ROOT,'web/shots.js'),'utf8'))");fs.writeFileSync('scripts/build-web.mjs',s);
