import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {searchCommonsVideo,downloadCommonsVideo} from '../lib/creative/external-assets.mjs';
import {businessContract,productionAdmission} from '../lib/creative/commerce-focus.mjs';

const videoBytes=Buffer.from('fixture-video-bytes');
const searchResponse={query:{pages:{'42':{title:'File:Outdoor coffee brewing.webm',imageinfo:[{url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Outdoor_coffee_brewing.webm',descriptionurl:'https://commons.wikimedia.org/wiki/File:Outdoor_coffee_brewing.webm',mime:'video/webm',size:videoBytes.length,extmetadata:{LicenseShortName:{value:'CC BY 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'},Artist:{value:'Example Author'},ImageDescription:{value:'Outdoor brewing scene'}}}]}}}};

test('Commons video search, download and registration retain provenance and source-review rights',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'commons-video-'));const projectDirectory=path.join(root,'project');await fs.mkdir(projectDirectory);
  const calls=[];
  const fetchImpl=async(input,options={})=>{
    const url=String(input);calls.push({url,options});
    if(url.includes('/w/api.php'))return new Response(JSON.stringify(searchResponse),{status:200,headers:{'content-type':'application/json'}});
    return new Response(videoBytes,{status:200,headers:{'content-type':'video/webm','content-length':String(videoBytes.length)}});
  };
  try{
    const candidate=await searchCommonsVideo('outdoor coffee scene',{fetchImpl});
    assert.equal(candidate.mime,'video/webm');assert.equal(candidate.artist,'Example Author');assert.equal(candidate.query,'outdoor coffee scene');
    const asset=await downloadCommonsVideo(candidate,{root,projectDirectory,fetchImpl});
    assert.equal(asset.kind,'video');assert.equal(asset.rights.status,'source-review');assert.equal(asset.rights.license,'CC BY 4.0');
    assert.equal(asset.externalSource.sourceUrl,candidate.sourceUrl);assert.equal(asset.externalSource.downloadUrl,candidate.downloadUrl);assert.equal(asset.externalSource.query,candidate.query);
    assert.equal(asset.sha256,createHash('sha256').update(videoBytes).digest('hex'));
    assert.deepEqual(await fs.readFile(path.join(root,asset.path)),videoBytes);
    assert.equal(asset.deliveryStatus,'candidate-only');assert.equal(calls.length,2);assert.equal(calls[1].options.redirect,'error');
    const registry=path.join(root,'assets/commerce-focus-v1');await fs.mkdir(registry,{recursive:true});await fs.writeFile(path.join(registry,'review-registry.json'),JSON.stringify({assets:[]}));
    const admission=await productionAdmission(root,businessContract({businessGoal:['launch']}),[{...asset,mediaMetadata:{width:1920,height:1080,duration:5}}]);
    assert.equal(admission.status,'blocked');assert.ok(admission.issues.some(issue=>issue.includes('权利依据')));
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('Commons video download rejects a non allowlisted host before requesting it',async()=>{
  let requested=false;
  await assert.rejects(downloadCommonsVideo({mime:'video/mp4',downloadUrl:'https://example.org/video.mp4'},{root:'/tmp',projectDirectory:'/tmp',fetchImpl:async()=>{requested=true;return new Response(videoBytes);}}),{code:'EXTERNAL_ASSET_URL_REJECTED'});
  assert.equal(requested,false);
});

test('Commons video search rejects non allowlisted result URLs',async()=>{
  const malicious=structuredClone(searchResponse);malicious.query.pages['42'].imageinfo[0].url='https://example.org/video.mp4';
  await assert.rejects(searchCommonsVideo('outdoor scene',{fetchImpl:async()=>new Response(JSON.stringify(malicious),{status:200,headers:{'content-type':'application/json'}})}),{code:'EXTERNAL_ASSET_URL_REJECTED'});
});
