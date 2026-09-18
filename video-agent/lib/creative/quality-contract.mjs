import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const fileName='config/quality/acceptance.v1.json';
const cache=new Map();
const allowedStatuses=new Set(['pending','pass','fail','not_applicable','blocked']);

function invalid(message){
  const error=new Error(`Invalid quality contract: ${message}`);
  error.code='QUALITY_CONTRACT_INVALID';
  throw error;
}

export function validateQualityContract(value){
  if(!value||typeof value!=='object'||Array.isArray(value))invalid('root must be an object');
  if(value.schemaVersion!==1||typeof value.id!=='string'||!value.id.trim())invalid('schemaVersion 1 and id are required');
  if(!Array.isArray(value.dimensions)||!value.dimensions.length||new Set(value.dimensions).size!==value.dimensions.length||value.dimensions.some(x=>typeof x!=='string'||!x.trim()))invalid('dimensions must be unique non-empty strings');
  if(!Array.isArray(value.statuses)||value.statuses.some(x=>!allowedStatuses.has(x))||[...allowedStatuses].some(x=>!value.statuses.includes(x)))invalid('statuses must contain the complete supported status set');
  if(!Array.isArray(value.hardBlockers)||value.hardBlockers.some(x=>typeof x!=='string'||!x.trim()))invalid('hardBlockers must be strings');
  if(!value.coverage||typeof value.coverage!=='object'||Array.isArray(value.coverage))invalid('coverage is required');
  for(const [dimension,requirements] of Object.entries(value.coverage))if(!value.dimensions.includes(dimension)&&!['motion','audio'].includes(dimension)||!Array.isArray(requirements)||!requirements.length||requirements.some(x=>typeof x!=='string'||!x.trim()))invalid(`coverage.${dimension} must contain requirements`);
  for(const key of ['candidateAllowed','requiresFullVideoObservation','requiresAudioObservation','requiresHumanAcceptance'])if(typeof value.delivery?.[key]!=='boolean')invalid(`delivery.${key} must be boolean`);
  if(!allowedStatuses.has(value.delivery?.unreviewedStatus))invalid('delivery.unreviewedStatus is invalid');
  for(const key of ['preserveLastValidRevision','explicitEffectMayNotBeSubstituted','optionalDecorationMayBeRemoved','neverInventMediaOrFacts'])if(typeof value.fallback?.[key]!=='boolean')invalid(`fallback.${key} must be boolean`);
  return value;
}

export async function loadQualityContract(root){
  const file=path.join(root,fileName);
  const stat=await fs.stat(file);
  const cached=cache.get(file);
  if(cached&&cached.mtimeMs===stat.mtimeMs)return cached.value;
  const bytes=await fs.readFile(file);
  const value=validateQualityContract(JSON.parse(bytes));
  const policyHash=createHash('sha256').update(bytes).digest('hex');
  const result=Object.freeze({...value,policyHash,policyFile:fileName});
  cache.set(file,{mtimeMs:stat.mtimeMs,value:result});
  return result;
}

export function pendingDimensions(contract,{audioRequired=true}={}){
  return Object.fromEntries(contract.dimensions.map(d=>[d,
    d==='audioPerception'&&!audioRequired?'not_applicable':
    d==='humanAcceptance'?'pending':'pending'
  ]));
}

export function qualityCoverage(contract,overrides={}){
  return Object.fromEntries(Object.entries(contract.coverage).map(([key,requirements])=>[
    key,{required:[...requirements],observed:overrides[key]?.observed||[],unreviewed:requirements.filter(x=>!(overrides[key]?.observed||[]).includes(x))}
  ]));
}
