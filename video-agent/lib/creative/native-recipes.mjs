import {commerceLayoutSource,commerceLayoutResources} from './commerce-layouts.mjs';
import {resourceHash} from './capabilities.mjs';

export const nativeRecipeContract={version:4,layoutVariants:{'video-text-pivot':['auto','step-strip'],'comparison-split':['auto','detail-focus']},resources:['lt-mask-reveal','titlecard-reveal','kinetic-type-beats',...commerceLayoutResources],methods:['footage-cut','parameterized','composition-adapt','original'],limits:{media:4,texts:5,maxTextCharacters:80,minSeconds:2},resourceLimits:{'lt-mask-reveal':{media:1,texts:2},'titlecard-reveal':{media:1,texts:2},'kinetic-type-beats':{media:0,texts:3,maxTextCharacters:32,minSeconds:3},'comparison-split':{media:2,texts:3,minSeconds:3},'grid-card-assemble':{media:4,texts:5,minSeconds:3},'video-text-pivot':{media:1,texts:3,minSeconds:3,requiresVideo:true}}};

export function isCoreExpressiveShot(shot={}){
 const text=[shot.purpose,shot.newInformation,shot.visualDirection,shot.editorialDecision?.placementReason].join(' ');
 return shot.coreExpressive===true||shot.priority==='hero'||/(?:hero|hook|卖点|核心|开场|片尾|结尾|cta|行动)/i.test(text);
}

/** Reviewed local implementations derived from the pinned source blueprints.
 * Text and media are bound by the native compiler, never interpolated as HTML.
 * Unrepresentable requests keep the original authoring route.
 */
export function instantiateNativeRecipe(shot,design,output,assets){
  const method=shot.productionMethod;
  if(!['footage-cut','parameterized'].includes(method))return null;
  // Stable recipes remain useful for supporting information. Core memory
  // points must opt into composition-adapt/original so a generic plate cannot
  // silently become the whole creative idea.
  if(method==='parameterized'&&isCoreExpressiveShot(shot)&&shot.allowParameterizedCore!==true)return null;
  if(shot.layoutVariant&&shot.layoutVariant!=='auto'&&!commerceLayoutResources.includes(shot.resourceId))return null;
  if(method==='parameterized'&&shot.resourceId==='kinetic-type-beats'){
    if(shot.media.length||!shot.text.length||shot.text.length>3||shot.text.some(t=>[...t.text].length>32)||shot.durationSeconds<3)return null;
    const {width:w,height:h}=output,m=Math.round(Math.min(w,h)*.09),rows=shot.text.length;
    const size=Math.floor(Math.min(design.typeScale?.title||Math.min(w,h)*.09,(w-2*m)/Math.min(16,Math.max(...shot.text.map(t=>[...t.text].length))),h*.075));
    const html=['<div id="rule"></div>'],css=[`#rule{position:absolute;left:${m}px;top:${h*.2}px;width:${w-2*m}px;height:4px;background:${design.accent};transform-origin:left center}`],timeline=['tl.from("#rule",{scaleX:0,duration:0.55,ease:"power2.inOut"},0.1);'],objects=[],motionTargets=['rule'];
    for(let i=0;i<rows;i++){
      const id='text'+(i+1);html.push(`<div id="${id}"></div>`);objects.push({elementId:id,ref:'text-'+(i+1)});
      css.push(`#${id}{position:absolute;left:${m}px;top:${h*(.29+i*.19)}px;width:${w-2*m}px;font-size:${size}px;line-height:1.1;font-weight:${i===0?900:500};color:${i===0?design.accent:design.foreground}}`);
      timeline.push(`tl.from("#${id}",{clipPath:"inset(100% 0 0 0)",y:24,duration:0.5,ease:"power3.out"},${.2+i*.28});`);motionTargets.push(id);
    }
    objects.push({elementId:'rule',ref:'decoration-1'});
    return {source:{html:html.join(''),css:css.join('\n'),timeline:timeline.join('\n'),parameters:[],objects,motionTargets,textStyles:[]},method,adapterId:shot.resourceId,adapterVersion:nativeRecipeContract.version,parameterHash:resourceHash({shot,design,output}),implementationHash:resourceHash(instantiateNativeRecipe.toString())};
  }
  const layout=commerceLayoutSource({...shot,productionMethod:method},design,output,assets);
  if(layout)return {source:layout,requestedMethod:shot.productionMethod,method,adapterId:shot.resourceId,adapterVersion:nativeRecipeContract.version,parameterHash:resourceHash({shot,design,output}),implementationHash:resourceHash(commerceLayoutSource.toString()),sourceFiles:['lib/creative/native-recipes.mjs','lib/creative/commerce-layouts.mjs']};
  if(commerceLayoutResources.includes(shot.resourceId))return null;
  if(shot.media.length>1||shot.text.length>2||shot.text.some(t=>[...t.text].length>80)||shot.durationSeconds<2)return null;
  if(method==='footage-cut'&&(shot.media.length!==1||shot.text.length||assets.find(a=>a.id===shot.media[0].assetId)?.kind!=='video'))return null;
  if(method==='parameterized'&&!nativeRecipeContract.resources.includes(shot.resourceId))return null;
  if(shot.resourceId==='lt-mask-reveal'&&(shot.media.length!==1||!shot.text.length))return null;
  const {width:w,height:h}=output,margin=Math.round(Math.min(w,h)*.06),objects=[],html=[],css=[],timeline=[],motionTargets=[];
  if(shot.media.length){html.push(assets.find(a=>a.id===shot.media[0].assetId)?.kind==='image'?'<img id="media">':'<div id="media"></div>');objects.push({elementId:'media',ref:'media-1'});css.push('#media{left:0;top:0;width:100%;height:100%;object-fit:cover}');}
  if(shot.text.length){
    const lower=shot.media.length>0,top=lower?Math.round(h*.73):Math.round(h*.33),boxWidth=w-2*margin;
    html.push('<div id="plate"></div>');css.push(`#plate{position:absolute;left:${margin}px;top:${top}px;width:${boxWidth}px;height:${Math.round(h*(lower?.23:.36))}px;background:${design.background};border-left:6px solid ${design.accent}}`);
    let y=top+Math.round(h*.018);
    for(const [i,t]of shot.text.entries()){
      const id='text'+(i+1),available=boxWidth-2*margin,preferred=i?design.typeScale?.body:design.typeScale?.title;
      const size=Math.round(Math.max(Math.min(w,h)*.025,Math.min(preferred||w*(i?.035:.055),available/Math.min(Math.max([...t.text].length,1),24))));
      html.push(`<div id="${id}"></div>`);objects.push({elementId:id,ref:'text-'+(i+1)});
      css.push(`#${id}{position:absolute;left:${2*margin}px;top:${y}px;width:${available}px;font-size:${size}px;font-weight:${i?400:800};line-height:1.25;color:${design.foreground}}`);
      y+=Math.ceil([...t.text].length/(available/size))*size*1.25+h*.012;
      motionTargets.push(id);if(shot.resourceId==='lt-mask-reveal'&&i===0)timeline.push(`tl.from("#${id}",{clipPath:"inset(0 100% 0 0)",duration:0.5,ease:"power2.inOut"},0.15);`);else timeline.push(`tl.from("#${id}",{opacity:0,y:16,duration:0.45,ease:"power3.out"},${.15+i*.12});`);
      timeline.push(`tl.to("#${id}",{opacity:0,duration:0.2},params.sceneSeconds-0.25);`);
    }
    if(y>top+h*(lower?.23:.36))return null;
  }
  const source={html:html.join(''),css:css.join('\n'),timeline:timeline.join('\n'),parameters:[],objects,motionTargets,textStyles:[]};
  return {source,method,adapterId:method==='footage-cut'?'native-footage-cut':shot.resourceId,adapterVersion:nativeRecipeContract.version,parameterHash:resourceHash({shot,design,output}),implementationHash:resourceHash(instantiateNativeRecipe.toString())};
}
