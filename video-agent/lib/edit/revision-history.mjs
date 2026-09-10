export function parseRevisionNumber(value){
  const raw=String(value??'').trim();
  if(/^\d{1,4}$/.test(raw)){const n=Number(raw);return Number.isSafeInteger(n)&&n>0?n:null;}
  if(!/^[零〇一二两三四五六七八九十百千]+$/.test(raw))return null;
  const digit={零:0,'〇':0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  const unit={十:10,百:100,千:1000};let section=0,number=0,saw=false;
  for(const ch of raw){
    if(ch in digit){number=digit[ch];saw=true;continue;}
    const u=unit[ch];if(!u)return null;saw=true;if(number===0)number=1;section+=number*u;number=0;
  }
  const total=section+number;return saw&&total>0&&total<=9999?total:null;
}

export function historySource(revisions,revision){
  if(!revision)return null;
  const sourceId=revision.navigation?.restoredFromId;
  return sourceId?revisions.find(r=>r.id===sourceId)||revision:revision;
}

export function undoNavigation(revisions,revision){
  const source=historySource(revisions,revision);
  const target=source?.parentId?revisions.find(r=>r.id===source.parentId):null;
  if(!target)return null;
  return {target,navigation:{restoredFromId:target.id,redoStack:[source.id,...(revision.navigation?.redoStack||[])]}};
}

export function redoNavigation(revisions,revision){
  const stack=[...(revision?.navigation?.redoStack||[])];
  const targetId=stack.shift();if(!targetId)return null;
  const target=revisions.find(r=>r.id===targetId);if(!target)return null;
  return {target,navigation:{restoredFromId:target.id,redoStack:stack}};
}
