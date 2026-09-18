import fs from 'node:fs/promises';
import path from 'node:path';
import {ffmpeg,run,probe,hashFile} from '../edit/media.mjs';

// A visual quality reference is separate from selectable product media. Its
// contents never become facts, assets, source selections or acceptance evidence.
export async function visualDirectionReference(root,outputDir,{signal}={}){
 const source=path.join(root,'deliverables/mijia-v2/mijia-product-ad-v2.mp4');
 try{await fs.access(source);}catch(error){if(error.code==='ENOENT')return {inputs:[],receipt:{status:'unavailable',purpose:'quality-reference-only'}};throw error;}
 const sourceSha256=await hashFile(source),metadata=await probe(source,signal),folder=path.join(outputDir,'direction-reference');await fs.mkdir(folder,{recursive:true});
 const inputs=[],frames=[];
 for(const [i,fraction]of [.18,.45,.76].entries()){
  const seconds=Math.min(metadata.duration-1/30,metadata.duration*fraction),name='reference-'+i+'.jpg',file=path.join(folder,name);
  await run(ffmpeg,['-y','-v','error','-ss',String(seconds),'-i',source,'-frames:v','1','-vf','scale=960:960:force_original_aspect_ratio=decrease',file],{signal,timeout:30000});
  frames.push({file:'direction-reference/'+name,seconds,sha256:await hashFile(file)});
  inputs.push({type:'input_text',text:`米家V2仅作信息层级与完成度参考（${seconds.toFixed(2)}秒抽帧）。不是本次商品证据，禁止复用其文字、品牌、事实、商品画面或固定分镜。按本次素材设计自己的构图、节奏和视觉语言；这不是对参考片的完整视听验收。`},{type:'input_image',image_url:'data:image/jpeg;base64,'+(await fs.readFile(file)).toString('base64')});
 }
 const receipt={version:1,status:'sampled',purpose:'quality-reference-only',source:'deliverables/mijia-v2/mijia-product-ad-v2.mp4',sourceSha256,frames,productEvidence:false,qualityAccepted:false};
 await fs.writeFile(path.join(folder,'receipt.json'),JSON.stringify(receipt,null,2));return {inputs,receipt};
}
