import {resourceHash} from './capabilities.mjs';

/** Keep the original adaptation receipt and bind checks to this exact native revision. */
export function bindResourceChecks(document,{engineering=false,visual='pending'}={}){
  if(!document.resourceReceipts)return document;
  document.resourceReceipts=document.resourceReceipts.map(receipt=>{
    const bundle=document.sourceBundles.find(b=>b.sceneId===receipt.sceneId);
    return {...receipt,currentRevisionId:document.revisionId,currentBundleHash:bundle?resourceHash(bundle):null,
      currentObjectIds:document.nodes.filter(n=>n.sceneId===receipt.sceneId).map(n=>n.id),
      checks:{engineering:engineering?'compiled-isolated-hyperframes-checked':'pending',visual,human:'pending',rights:'separate-review'},
      status:engineering?'engineering-checked':'modified-awaiting-check'};
  });return document;
}
