import {resourceHash} from './capabilities.mjs';

export const nativeRecipeContract={version:1,resources:['lt-mask-reveal','titlecard-reveal'],methods:['footage-cut','parameterized','composition-adapt','original'],limits:{media:1,texts:2,maxTextCharacters:80,minSeconds:2}};

/** Reviewed local implementations derived from the pinned source blueprints.
 * Text and media are bound by the native compiler, never interpolated as HTML.
 * Unrepresentable requests keep the original authoring route.
 */
export function instantiateNativeRecipe(shot,design,output,assets){
  const method=shot.productionMethod;
  if(!['footage-cut','parameterized'].includes(method))return null;
  if(shot.media.length>1||shot.text.length>2||shot.text.some(t=>[...t.text].length>80)||shot.durationSeconds<2)return null;
  if(method==='footage-cut'&&(shot.media.length!==1||shot.text.length||assets.find(a=>a.id===shot.media[0].assetId)?.kind!=='video'))return null;
  if(method==='parameterized'&&!nativeRecipeContract.resources.includes(shot.resourceId))return null;
  if(shot.resourceId==='lt-mask-reveal'&&(shot.media.length!==1||!shot.text.length))return null;
  const {width:w,height:h}=output,margin=Math.round(Math.min(w,h)*.06),objects=[],html=[],css=[],timeline=[],motionTargets=[];
  if(shot.media.length){html.push('<div id="media"></div>');objects.push({elementId:'media',ref:'media-1'});css.push('#media{left:0;top:0;width:100%;height:100%}');}
  if(shot.text.length){
    const lower=shot.media.length>0,top=lower?Math.round(h*.73):Math.round(h*.33),boxWidth=w-2*margin;
    html.push('<div id="plate"></div>');css.push(`#plate{position:absolute;left:${margin}px;top:${top}px;width:${boxWidth}px;height:${Math.round(h*(lower?.23:.36))}px;background:var(--brand-background);border-left:6px solid var(--brand-accent)}`);
    let y=top+Math.round(h*.018);
    for(const [i,t]of shot.text.entries()){
      const id='text'+(i+1),available=boxWidth-2*margin,preferred=i?design.typeScale?.body:design.typeScale?.title;
      const size=Math.round(Math.max(Math.min(w,h)*.025,Math.min(preferred||w*(i?.035:.055),available/Math.min(Math.max([...t.text].length,1),24))));
      html.push(`<div id="${id}"></div>`);objects.push({elementId:id,ref:'text-'+(i+1)});
      css.push(`#${id}{position:absolute;left:${2*margin}px;top:${y}px;width:${available}px;font-size:${size}px;font-weight:${i?400:800};line-height:1.25;color:var(--brand-foreground)}`);
      y+=Math.ceil([...t.text].length/(available/size))*size*1.25+h*.012;
      motionTargets.push(id);if(shot.resourceId==='lt-mask-reveal'&&i===0)timeline.push(`tl.from("#${id}",{clipPath:"inset(0 100% 0 0)",duration:0.5,ease:"power2.inOut"},0.15);`);else timeline.push(`tl.from("#${id}",{opacity:0,y:16,duration:0.45,ease:"power3.out"},${.15+i*.12});`);
      timeline.push(`tl.to("#${id}",{opacity:0,duration:0.2},params.sceneSeconds-0.25);`);
    }
    if(y>top+h*(lower?.23:.36))return null;
  }
  const source={html:html.join(''),css:css.join('\n'),timeline:timeline.join('\n'),parameters:[],objects,motionTargets,textStyles:[]};
  return {source,method,adapterId:method==='footage-cut'?'native-footage-cut':shot.resourceId,adapterVersion:nativeRecipeContract.version,parameterHash:resourceHash({shot,design,output}),implementationHash:resourceHash(instantiateNativeRecipe.toString())};
}
