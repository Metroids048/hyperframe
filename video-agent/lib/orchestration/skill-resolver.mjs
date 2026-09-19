import {readFileSync} from 'node:fs';
import {skillHints} from './skill-hints.mjs';
const registry=JSON.parse(readFileSync(new URL('../../config/skills/registry.json',import.meta.url),'utf8'));
export function resolveSkills(decision,{operations=[],document,revision,project}={}) {
  const reasons=new Map(),add=(id,reason)=>reasons.set(id,[...(reasons.get(id)||[]),reason]);
  const state=document||revision?.timeline;
  for(const op of operations){
    const type=op.type||'';
    if(/caption|speech|voiceover/.test(type))add('speech-captions','operation:'+type);
    if(/audio|volume|voiceover|speech/.test(type))add('audio-mix','operation:'+type);
    if(/transition|effect|text_style|overlay|output|media/.test(type))add('visual-composition','operation:'+type);
    if(/transition|effect/.test(type))add('hyperframes-animation','operation:'+type);
    if(/trim|split|duration|reorder|range|move|insert|speed/.test(type))add('timeline-edit','operation:'+type);
  }
  for(const target of decision.targets||[]){
    const kind=typeof target==='string'?target:target.kind;
    for(const [id,kinds] of Object.entries({'speech-captions':['caption','voice'],'audio-mix':['audio','voice'],'visual-composition':['transition','text','visual'],'hyperframes-animation':['transition','effect'],'timeline-edit':['timeline']}))if(kinds.includes(kind))add(id,'target:'+kind);
  }
  // Hints do not authorize operations. Actual object types and the structured plan do.
  for(const [id,pattern] of Object.entries(skillHints))if(pattern.test(decision.message||''))add(id,'request-evidence');
  if(['edit','recut','variant'].includes(decision.mode)&&(state||project?.currentRevisionId))add('conversation-edit','existing-revision');
  if(decision.mode==='recut')add('rough-cut','mode:recut');
  if(decision.mode==='export')add('timeline-edit','mode:export');
  if(['create','recut'].includes(decision.mode)&&!project?.currentRevisionId&&decision.scenario?.startsWith('product_')){
    add('commerce-promo','business-scenario:'+decision.scenario);
    add('product-understanding','production-stage:product.understand');
    add('marketing-planner','production-stage:marketing.plan');
    add('video-director','production-stage:video.direct');
    add('hyperframes','production-stage:hyperframes.adapt');
  }
  if(document?.scenes){add('hyperframes','native-document');if(document.businessContract?.scenarioId?.startsWith('product_'))add('commerce-promo','native-business-contract');}
  if(['undo','redo','restore','cancel','status','clarify'].includes(decision.mode))reasons.clear();
  const skills=registry.skills.filter(s=>reasons.has(s.id)).map(({instructions,snapshot,...s})=>s);
  return {skills,reasons:Object.fromEntries(reasons)};
}
