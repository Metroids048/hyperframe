// Parameterized native layouts derived from the pinned comparison/grid/pivot
// blueprints. All content remains bound through native media/text references.
export const commerceLayoutResources=['comparison-split','grid-card-assemble','video-text-pivot'];
export function commerceLayoutSource(shot,design,output,assets){
  if(!commerceLayoutResources.includes(shot.resourceId)||shot.productionMethod!=='parameterized'||shot.durationSeconds<3)return null;
  const media=shot.media,texts=shot.text,n=media.length;
  if(n<1||n>4||texts.length<1||texts.some(t=>[...t.text].length>80))return null;
  const grid=shot.resourceId==='grid-card-assemble',pivot=shot.resourceId==='video-text-pivot';
  if(!grid&&n>2||pivot&&(n!==1||assets.find(a=>a.id===media[0].assetId)?.kind!=='video'))return null;
  if(texts.length>(grid?n+1:3))return null;
  const {width:w,height:h}=output,portrait=h>w,m=Math.round(Math.min(w,h)*.055),gap=Math.round(m*.55);
  const aspect=media.map(m=>{const a=assets.find(a=>a.id===m.assetId)?.mediaMetadata;return a?.width/a?.height||1;}),mostlyTall=aspect.every(r=>r<1);
  const html=[],css=[],timeline=[],objects=[],motionTargets=[];
  let invalid=false;
  const box=(id,x,y,width,height,extra='')=>{html.push(`<div id="${id}"></div>`);css.push(`#${id}{position:absolute;left:${Math.round(x)}px;top:${Math.round(y)}px;width:${Math.round(width)}px;height:${Math.round(height)}px;${extra}}`);};
  const animate=(id,i,axis='y')=>{motionTargets.push(id);timeline.push(`tl.from("#${id}",{opacity:0,${axis}:18,duration:0.5,ease:"power3.out"},${(.15+i*.12).toFixed(2)});`);};
  const label=(index,x,y,width,height)=>{
    const id='text'+(index+1),value=texts[index].text,min=Math.min(w,h)*.027;
    let size=Math.min(design.typeScale?.[index?'body':'title']||Math.min(w,h)*(index?.04:.06),height/1.3);
    while(size>=min&&Math.ceil([...value].length/Math.max(1,Math.floor(width/size)))*size*1.3>height)size-=1;
    if(size<min){invalid=true;return;}
    box(id,x,y,width,height,`font-size:${Math.floor(size)}px;line-height:1.3;font-weight:${index?500:800};color:${design.foreground}`);objects.push({elementId:id,ref:'text-'+(index+1)});animate(id,index+1);
  };
  const image=(index,x,y,width,height)=>{const id='media'+(index+1);box(id,x,y,width,height,'object-fit:cover');if(assets.find(a=>a.id===media[index].assetId)?.kind==='image')html[html.length-1]=`<img id="${id}">`;objects.push({elementId:id,ref:'media-'+(index+1)});if(!pivot)animate(id,index,'x');};
  if(grid){
    const heading=texts[0].role==='title'||texts.length===n+1,cols=portrait&&!mostlyTall&&n<=3?1:Math.min(n,2),rows=Math.ceil(n/cols),top=heading?h*.18:m;
    if(heading)label(0,m,m,w-2*m,h*.1);
    const cw=(w-2*m-gap*(cols-1))/cols,ch=(h-top-m-gap*(rows-1))/rows;
    for(let i=0;i<n;i++){
      const x=m+(i%cols)*(cw+gap),y=top+Math.floor(i/cols)*(ch+gap),ti=i+(heading?1:0),hasLabel=ti<texts.length;
      image(i,x,y,cw,ch*(hasLabel?.73:1));
      if(hasLabel)label(ti,x,y+ch*.76,cw,ch*.22);
    }
  }else if(n===2){
    label(0,m,m,w-2*m,h*.12);
    const top=h*.15,area=h-top-m,vertical=portrait&&!mostlyTall;
    for(let i=0;i<2;i++){
      const cw=vertical?w-2*m:(w-2*m-gap)/2,ch=vertical?(area-gap)/2:area,x=vertical?m:m+i*(cw+gap),y=vertical?top+i*(ch+gap):top;
      image(i,x,y,cw,ch*(texts[i+1] ? .78 : 1));
      if(texts[i+1])label(i+1,x,y+ch*.8,cw,ch*.18);
    }
  }else{
    const mediaW=portrait?w-2*m:w*.62-m,mediaH=portrait?Math.min(h*.6,mediaW/aspect[0]):h-2*m;
    image(0,m,m,mediaW,mediaH);
    const x=portrait?m:w*.66,y=portrait?m+mediaH+m:m,width=portrait?w-2*m:w*.34-m,area=portrait?h-y-m:h-2*m,th=Math.min((area-gap*(texts.length-1))/texts.length,h*.14);
    for(let i=0;i<texts.length;i++)label(i,x,y+i*(th+gap),width,th);
  }
  if(invalid)return null;
  return {html:html.join(''),css:css.join('\n'),timeline:timeline.join('\n'),parameters:[],objects,motionTargets,textStyles:[]};
}
