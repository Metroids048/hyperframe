// Usage: node scripts/compare-commerce-films.mjs document1.json document2.json ...
import fs from 'node:fs/promises';
import path from 'node:path';
import {compareEditorialSignatures} from '../lib/creative/editorial-strategy.mjs';
const files=process.argv.slice(2);if(files.length<2)throw Error('At least two actual document.json files are required');
const records=[];
for(const file of files){const doc=JSON.parse(await fs.readFile(file,'utf8'));records.push({id:doc.revisionId||path.resolve(file),signature:doc.editorialReview?.sourceRevisionId===doc.revisionId?doc.editorialReview.signature:[]});}
console.log(JSON.stringify(compareEditorialSignatures(records),null,2));
