import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {insist} from './contracts.mjs';
const sourcePath='third_party/hyperframes/registry/blocks/chromatic-radial-split/chromatic-radial-split.html';
function loadShader(){
let source;
try { source=readFileSync(new URL('../../../'+sourcePath,import.meta.url),'utf8'); }
catch { insist(false,'缺少固定版本官方 Chromatic Radial Split 资源；请恢复 third_party 子模块','SHADER_SOURCE'); }
// Exact fragment program from the pinned local official blueprint. Its demo
// labels and canvas text capture are deliberately not an execution source.
const fragment=source.match(/"(void main\(\)\{vec2 c=v_uv-\.5;[^"\n]+)"/)?.[1];
insist(fragment,'官方色散着色器实现缺失','SHADER_SOURCE');
const sourceSha256=createHash('sha256').update(source).digest('hex');
return {fragment,sourceSha256};
}
function runtime(configs,fragment){
 const root=document.getElementById('commerce-root');
 const states=configs.map(c=>{
  const canvas=document.getElementById(c.canvasId),gl=canvas.getContext('webgl',{preserveDrawingBuffer:true,alpha:false});
  if(!gl)throw Error('Chromatic Radial Split requires WebGL');
  const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const program=gl.createProgram();
  gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec2 a_pos;varying vec2 v_uv;void main(){v_uv=a_pos*.5+.5;v_uv.y=1.-v_uv.y;gl_Position=vec4(a_pos,0.,1.);}'));
  gl.attachShader(program,compile(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 v_uv;uniform sampler2D u_from;uniform sampler2D u_to;uniform float u_progress;'+fragment));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const pos=gl.getAttribLocation(program,'a_pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  const textures=[0,1].map(()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);return t;});
  const media=c.mediaIds.map(id=>document.getElementById(id));
  if(media.some(m=>!m||!['IMG','VIDEO'].includes(m.tagName)))throw Error('Shader media binding missing');
  const surface=document.createElement('canvas');surface.width=canvas.width;surface.height=canvas.height;const ctx=surface.getContext('2d');
  const draw=()=>{
   const time=window.__timelines['commerce-root']?.time()||0,p=(time-c.start)/c.duration;
   canvas.style.opacity=p>0&&p<1?'1':'0';if(p<=0||p>=1)return;
   gl.useProgram(program);gl.viewport(0,0,canvas.width,canvas.height);
   for(let i=0;i<2;i++){
    const m=media[i],replacement=m.nextElementSibling,frame=replacement?.classList.contains('__render_frame__')&&replacement.complete&&replacement.naturalWidth?replacement:m,w=frame.videoWidth||frame.naturalWidth,h=frame.videoHeight||frame.naturalHeight;if(!w||!h)return;
    ctx.fillStyle=c.background;ctx.fillRect(0,0,surface.width,surface.height);
    const b=m.getBoundingClientRect(),r=root.getBoundingClientRect(),sx=surface.width/r.width,sy=surface.height/r.height;
    const x=(b.left-r.left)*sx,y=(b.top-r.top)*sy,bw=b.width*sx,bh=b.height*sy,fit=getComputedStyle(m).objectFit;
    const scale=fit==='contain'?Math.min(bw/w,bh/h):Math.max(bw/w,bh/h);
    ctx.save();ctx.beginPath();ctx.rect(x,y,bw,bh);ctx.clip();ctx.drawImage(frame,x+(bw-w*scale)/2,y+(bh-h*scale)/2,w*scale,h*scale);ctx.restore();
    gl.activeTexture(i===0?gl.TEXTURE0:gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,textures[i]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,surface);gl.uniform1i(gl.getUniformLocation(program,i===0?'u_from':'u_to'),i);
   }
   gl.uniform1f(gl.getUniformLocation(program,'u_progress'),p*p*(3-2*p));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  };
  for(const m of media)for(const event of ['seeked','loadeddata','load'])m.addEventListener(event,draw);
  return draw;
 });
 const timeline=window.__timelines['commerce-root'];timeline.eventCallback('onUpdate',()=>states.forEach(draw=>draw()));
 // The pinned renderer invokes this hook after every exact-frame batch has
 // decoded. Preserve its existing color-grading work, then sample those frames.
 const wrapped=new WeakSet();
 const bindRenderHook=()=>{const grading=window.__hf?.colorGrading;if(!grading||wrapped.has(grading))return;wrapped.add(grading);const priorRedraw=grading.redraw;grading.redraw=function(...args){priorRedraw?.apply(this,args);states.forEach(draw=>draw());};};
 bindRenderHook();
 // The engine installs its runtime after author scripts, so bind again when
 // its first exact-frame sibling is inserted, before that batch decodes.
 new MutationObserver(bindRenderHook).observe(root,{childList:true,subtree:true});
 document.addEventListener('load',event=>{if(event.target?.classList?.contains('__render_frame__'))states.forEach(draw=>draw());},true);
 states.forEach(draw=>draw());
}
export function compileChromatic(document,objectMap){
 const {fragment,sourceSha256}=document.transitions.some(t=>t.effect==='chromatic-split')?loadShader():{};
 const configs=document.transitions.filter(t=>t.effect==='chromatic-split').map(t=>{
  const nodes=[t.fromSceneId,t.toSceneId].map(id=>document.nodes.find(n=>n.sceneId===id&&['image','video'].includes(n.kind)));
  insist(nodes.every(Boolean),'色散转场必须绑定相邻真实媒体','SHADER_MEDIA');
  return {canonicalId:'chromatic-radial-split',runtimeName:t.effect,transitionId:t.id,canvasId:'shader-'+t.id,start:document.scenes.find(s=>s.id===t.toSceneId).startFrame/30,duration:t.durationFrames/30,mediaIds:nodes.map(n=>n.kind==='video'?'obj-'+n.id:objectMap[n.id].domId),assetIds:nodes.map(n=>n.assetId),background:document.design.background,sourcePath,sourceSha256};
 });
 return {receipts:configs,html:configs.map(c=>`<canvas id="${c.canvasId}" width="${document.output.width}" height="${document.output.height}" data-layout-ignore style="position:absolute;inset:0;width:100%;height:100%;z-index:200;opacity:0;pointer-events:none"></canvas>`).join(''),script:configs.length?`(${runtime.toString()})(${JSON.stringify(configs)},${JSON.stringify(fragment)});`:''};
}
