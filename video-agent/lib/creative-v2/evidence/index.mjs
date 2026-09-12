import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
export const EVIDENCE_VERSION=1;
const TYPES=new Set(["text","image","video","audio"]);
const hash=v=>crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0,16);
export function createEvidencePack(input={}){
 const assets=(input.assets||[]).map((a,i)=>{const p=String(a.path||a.name||""); const ext=path.extname(p).toLowerCase(); const kind=a.kind||({".png":"image",".jpg":"image",".jpeg":"image",".webp":"image",".mp4":"video",".mov":"video",".webm":"video",".mp3":"audio",".wav":"audio"}[ext]); if(!TYPES.has(kind)) throw new Error(`Unsupported asset type: ${p}`); return {id:a.id||`asset-${hash([p,kind]).slice(0,12)}`,kind,path:p,metadata:{width:a.width??null,height:a.height??null,duration:a.duration??null,fps:a.fps??null,hasAudio:a.hasAudio??null},visualEvidence:a.visualEvidence||[],audioEvidence:a.audioEvidence||[],provenance:a.provenance||{status:"unknown"},rights:a.rights||{status:"unknown"}}});
 const facts=(input.facts||[]).map((f,i)=>typeof f==="string"?{id:`fact-${i+1}`,text:f,status:"provided",source:"user"}:f).filter(f=>f.text);
 const pack={schemaVersion:EVIDENCE_VERSION,id:`evidence-${hash([input.request||"",assets,facts])}`,request:String(input.request||input.message||""),assets,factualClaims:facts,allowedTextFacts:facts.map(f=>f.text),prohibitedClaims:input.prohibitedClaims||[],constraints:input.constraints||{},provenance:input.provenance||{status:"unknown"}};
 return pack;
}
export function validateEvidencePack(pack){if(!pack||pack.schemaVersion!==EVIDENCE_VERSION||!Array.isArray(pack.assets)||!Array.isArray(pack.factualClaims)) throw new Error("Invalid EvidencePack"); return true;}
export function saveEvidencePack(pack,file){validateEvidencePack(pack); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,JSON.stringify(pack,null,2));}
