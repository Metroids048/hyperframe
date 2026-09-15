// Test-only native compiler fixture. No production approval or Agent success.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeCommerceRequest,safeRelativePath,insist} from '../lib/creative/contracts.mjs';
import {prepareCreativeAsset} from '../lib/creative/image-asset.mjs';
import {planCommerceDocument} from '../lib/creative/director.mjs';
import {writeCompiledProject,VIDEO_AGENT_ROOT as root} from '../lib/creative/runner.mjs';
export async function compileCommerceFixture(input){
 const request=normalizeCommerceRequest(input);
 insist(/^data\/commerce-runs\/(fixture-(premium|promotion|functional)|tool-ci|nova-demo)$/.test(request.outputDir||''),'Only named regression fixture directories are allowed');
 insist(request.assets.every(a=>/^data\/commerce-samples\/nova-(hero|detail|context)\.jpg$/.test(a.path)),'Only generated NOVA test images are allowed');
 const directory=safeRelativePath(root,request.outputDir),assetDir=path.join(directory,'assets');await fs.mkdir(assetDir,{recursive:true});
 const assets=[];for(const asset of request.assets){const item=await prepareCreativeAsset(root,asset,assetDir);item.compiledRef='assets/'+path.basename(item.normalizedRef);assets.push(item);}
 await fs.copyFile(path.join(root,'node_modules/gsap/dist/gsap.min.js'),path.join(assetDir,'gsap.min.js'));
 const document=planCommerceDocument(request,assets),status=await writeCompiledProject(directory,document,assets);
 await fs.writeFile(path.join(directory,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
 await fs.writeFile(path.join(directory,'fixture-provenance.json'),JSON.stringify({source:'synthetic-compiler-fixture',productAgentPass:false,productionApproved:false,humanAcceptance:'not_applicable_to_fixture'}));
 return status;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const input=JSON.parse(await fs.readFile(path.join(root,'examples/commerce/request.sample.json'),'utf8'));
 console.log(JSON.stringify(await compileCommerceFixture(input)));
}
