import fs from 'node:fs/promises';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {businessContract} from '../lib/creative/commerce-focus.mjs';
const dir='data/commerce-runs/2c34075d-b02d-4c13-8ac9-f2da2df7ea8f',version=dir+'/versions/job-a8dfd435-347c-420e-91bb-7cb710f314e8';
const proof=JSON.parse(await fs.readFile(version+'/run-input.json')),p=JSON.parse(await fs.readFile(dir+'/native-project.json'));
const request=normalizeCommerceRequest({...p.request,projectId:p.id,assets:p.assets,outputDir:version});request.commerceProfile='commerce-focus-v1';request.businessContract=businessContract(request);
function diff(a,b,key='request'){if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],key+'.'+k);}else console.log(JSON.stringify({key,before:a,after:b}));}
diff(proof.request,request);
