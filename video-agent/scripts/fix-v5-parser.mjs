import fs from 'node:fs';
let s=fs.readFileSync('lib/demo-planner.mjs','utf8');s=s.replace('/(?:商品|产品)(?:名)?(?:叫|是|为)?[：:\\s]*([^，。；\\s]{1,12})/','/(?:商品|产品)(?:名)?(?:(?:叫|是|为)[：:\\s]*|[：:\\s]+)([^，。；\\s]{1,12})/');fs.writeFileSync('lib/demo-planner.mjs',s);
s=fs.readFileSync('scripts/test-v5.mjs','utf8').replace('给保温杯制作一条简约的商品展示短片。','给青柠气泡水制作一条简约的商品展示短片。').replace("assert.equal(p.brief.product,'保温杯')","assert.equal(p.brief.product,'青柠气泡水')");fs.writeFileSync('scripts/test-v5.mjs',s);
s=fs.readFileSync('start-local.ps1','utf8').replace("if ($taskHealth.ok) { Write-Host", "if ($taskHealth.ok -and $taskHealth.version -eq '0.5.0-demo') { Write-Host");fs.writeFileSync('start-local.ps1',s);
