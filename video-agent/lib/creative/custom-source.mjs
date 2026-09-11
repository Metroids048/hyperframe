import {parse} from 'acorn';
import {parseFragment,serialize} from 'parse5';
import postcss from 'postcss';
import {insist} from './contracts.mjs';

const safeId=s=>typeof s==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stringify=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const tags=new Set(['div','span','p','h1','h2','img','svg','g','path','circle','ellipse','rect','line','polyline','polygon','text']);
const attrs=new Set(['id','class','viewBox','width','height','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','d','points','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','stroke-dashoffset','opacity','transform','preserveAspectRatio']);
const cssProperties=new Set(['position','inset','top','right','bottom','left','width','height','max-width','max-height','min-width','min-height','display','align-items','justify-content','flex-direction','gap','padding','margin','box-sizing','background','background-color','color','border','border-color','border-width','border-style','border-radius','box-shadow','overflow','opacity','font-size','font-weight','line-height','letter-spacing','text-align','white-space','transform','transform-origin','fill','stroke','stroke-width','stroke-dasharray','stroke-dashoffset','clip-path','z-index','object-fit','object-position']);
const animationProperties=new Set(['x','y','xPercent','yPercent','scale','scaleX','scaleY','rotation','rotationX','rotationY','opacity','autoAlpha','transformOrigin','strokeDashoffset','strokeDasharray','clipPath','borderRadius','backgroundColor','color','fill','stroke','duration','ease','delay','stagger','repeat','yoyo','immediateRender']);
export const CUSTOM_SOURCE_CONTRACT=`custom-native 是当前组件不支持的原创HTML/SVG/CSS/GSAP场景。customSourceJson为JSON字符串，结构 {html,css,timeline,parameters:[{name,value,min,max}],objects:[{elementId,ref}],motionTargets:[elementId]}。所有DOM id用英文字母开头，只含字母数字短横线下划线。对象ref对应本场text的role(title/feature/price/cta)、media-1/media-2，或decoration-1等原创图形；每个文字/图片节点都必须映射且不可重复；视频已由场景media列表绑定独立原生对象，不必在源码objects中重复映射。额外编号/标签可用ref:label-1等，并在该object中声明text；text只允许1—99编号或用户原话中的逐字文案，仍须把DOM留空以注入原生文字对象。文字节点DOM留空，真实文案由原生对象注入；图片用空img，由真实asset填src。如果选择在源码声明视频媒体ref，只能映射到空div；它只是绑定占位，真正视频在全画幅底层持续播放，由引擎独立处理源入点、时间和原声。不得给该占位写动画或列入motionTargets；请对独立文字、SVG线条、标注、角标等叠层编排动效。不要画大色块遮住实拍主体。允许div/span/p/h1/h2/img/svg/g/path/circle/ellipse/rect/line/polyline/polygon/text；不写script/style标签、内联style、事件、外链、动画标签、SVG defs。CSS只能#id规则，允许普通布局/颜色/字体大小/变换/边框，不能url/import/animation/transition/伪元素/全局规则，默认系统字体。使用当前画幅的像素布局，主体留在画布内。timeline只是一系列tl.to/from/fromTo/set("#id",{字面量GSAP属性},绝对秒数); 可在数值位置使用params.name及简单+-*/算式，禁止定义变量、函数、循环、调用外部API、回调。所有duration/延迟/重复必须有限，结束不超过场景时长。params.sceneSeconds是引擎注入的本场真实分配秒数，不得自行声明或覆盖；请用它的比例计算入场、持续运动、结束时间，例如duration:params.sceneSeconds*.7、起点params.sceneSeconds*.1，使原创时间线自动适应最终分镜时长，不用猜场景秒数。动画属性仅x/y/xPercent/yPercent/scale/scaleX/scaleY/rotation/rotationX/rotationY/opacity/autoAlpha/transformOrigin/strokeDashoffset/strokeDasharray/clipPath/borderRadius/backgroundColor/color/fill/stroke/duration/ease/delay/stagger/repeat/yoyo/immediateRender。不要改变left/top做动画。至少一个motionTarget必须在实际时间采样中有可见运动。原创图形可以多层、多对象、路径，不套已有模板；可调运动值声明在parameters，下一轮按名称修改。普通场景customSourceJson为空字符串。`;

export function customParameters(bundle,overrides={}){
  insist(Array.isArray(bundle.parameters)&&bundle.parameters.length<=24,'自定义参数数量无效','CUSTOM_PARAMETERS');
  const values={},names=new Set();
  for(const p of bundle.parameters){insist(safeId(p.name)&&!['constructor','prototype','__proto__','sceneSeconds'].includes(p.name)&&!names.has(p.name),'自定义参数名无效','CUSTOM_PARAMETERS');names.add(p.name);const value=overrides[p.name]??p.value;insist([p.min,p.max,value].every(Number.isFinite)&&p.min>=-20000&&p.max<=20000&&p.min<=value&&value<=p.max,'自定义参数超出声明范围','CUSTOM_PARAMETERS');values[p.name]=value;}
  insist(Object.keys(overrides).every(k=>names.has(k)),'自定义场景不支持这个参数','CUSTOM_PARAMETERS');return values;
}
function valueOf(node,params){
  if(node.type==='Literal'){insist(typeof node.value!=='object'&&['string','number','boolean'].includes(typeof node.value),'不支持的动画字面量','CUSTOM_SCRIPT');return node.value;}
  if(node.type==='UnaryExpression'&&['+','-'].includes(node.operator)){const n=valueOf(node.argument,params);insist(typeof n==='number','无效数值表达式','CUSTOM_SCRIPT');return node.operator==='-'?-n:n;}
  if(node.type==='MemberExpression'&&!node.computed&&node.object.type==='Identifier'&&node.object.name==='params'&&node.property.type==='Identifier'){insist(Object.hasOwn(params,node.property.name),'动画引用未知参数','CUSTOM_PARAMETERS');return params[node.property.name];}
  if(node.type==='BinaryExpression'&&['+','-','*','/'].includes(node.operator)){const a=valueOf(node.left,params),b=valueOf(node.right,params);insist(typeof a==='number'&&typeof b==='number','动画表达式只能计算数字','CUSTOM_SCRIPT');const n=node.operator==='+'?a+b:node.operator==='-'?a-b:node.operator==='*'?a*b:a/b;insist(Number.isFinite(n)&&Math.abs(n)<=20000,'动画计算越界','CUSTOM_SCRIPT');return n;}
  if(node.type==='ObjectExpression'){const result={};insist(node.properties.length<=24,'动画属性过多','CUSTOM_SCRIPT');for(const p of node.properties){insist(p.type==='Property'&&!p.computed&&!p.method&&p.kind==='init'&&['Identifier','Literal'].includes(p.key.type),'动画属性必须为普通字面量','CUSTOM_SCRIPT');const name=p.key.name??p.key.value;insist(animationProperties.has(name)&&!Object.hasOwn(result,name),'不支持的动画属性','CUSTOM_SCRIPT');result[name]=valueOf(p.value,params);}return result;}
  insist(false,'源码只能使用有限的GSAP时间线调用','CUSTOM_SCRIPT');
}

/** Parse untrusted source; return regenerated markup/CSS and canonical finite animation calls. No eval. */
export function compileCustomSource(bundle,{scene,nodes,assets={},params=scene.effectParams||{}}){
  insist(bundle&&['html','css','timeline'].every(k=>typeof bundle[k]==='string'&&bundle[k].length<=32000),'自定义源码缺失或过大','CUSTOM_SOURCE');
  const values={...customParameters(bundle,params),sceneSeconds:scene.durationFrames/30},prefix='custom-'+scene.id+'-',tree=parseFragment(bundle.html),ids=new Map();let count=0;
  const errors=[];parseFragment(bundle.html,{onParseError:e=>errors.push(e.code)});insist(errors.length===0,'自定义HTML语法错误','CUSTOM_HTML');
  function visit(parent){for(const node of parent.childNodes||[]){
    if(node.nodeName==='#text'){insist(!node.value.trim(),'自定义文字必须来自原生文字对象','CUSTOM_TEXT');continue;}
    insist(tags.has(node.tagName)&&++count<=160,'自定义HTML含不支持标签或过多元素','CUSTOM_HTML');
    for(const attr of node.attrs){insist(!attr.namespace&&attrs.has(attr.name)&&!/[<>\\]/.test(attr.value),'自定义HTML属性不支持','CUSTOM_HTML');insist(attr.value.length<=6000&&!/(?:url\s*\(|javascript:|data:|https?:|file:)/i.test(attr.value),'自定义HTML外部引用被禁止','CUSTOM_RESOURCE');}
    const id=node.attrs.find(a=>a.name==='id');if(id){insist(safeId(id.value)&&!ids.has(id.value),'自定义元素ID无效或重复','CUSTOM_HTML');ids.set(id.value,node);id.value=prefix+id.value;}
    visit(node);
  }}visit(tree);
  insist(Array.isArray(bundle.objects)&&bundle.objects.length>=1&&bundle.objects.length<=100,'自定义对象图无效','CUSTOM_OBJECTS');
  const mapped=new Set(),nodeIds=new Set(),objects=[],videoBindings=new Set();
  for(const mapping of bundle.objects){const element=ids.get(mapping.elementId),native=nodes.find(n=>n.id===mapping.nodeId);insist(element&&native&&!mapped.has(mapping.elementId)&&!nodeIds.has(native.id),'自定义对象映射无效','CUSTOM_OBJECTS');mapped.add(mapping.elementId);nodeIds.add(native.id);objects.push({elementId:mapping.elementId,domId:native.kind==='video'?'obj-'+native.id:prefix+mapping.elementId,nodeId:native.id});element.attrs.push({name:'data-object-id',value:native.id});
    if(native.kind==='text'){insist(['div','span','p','h1','h2','text'].includes(element.tagName)&&!element.childNodes?.some(n=>n.tagName),'文字对象必须为叶节点','CUSTOM_TEXT');element.childNodes=[{nodeName:'#text',value:native.params.text,parentNode:element}];}
    else if(native.kind==='image'){insist(element.tagName==='img'&&assets[native.assetId],'自定义图片缺少真实素材','CUSTOM_RESOURCE');const ref=assets[native.assetId].compiledRef||assets[native.assetId].ref;insist(/^assets\/[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp)$/i.test(ref),'自定义图片路径越界','CUSTOM_RESOURCE');element.attrs.push({name:'src',value:ref},{name:'alt',value:''},{name:'data-start',value:String(scene.startFrame/30)},{name:'data-duration',value:String(scene.durationFrames/30)});}
    else if(native.kind==='video'){insist(element.tagName==='div'&&!element.childNodes?.some(n=>n.tagName),'视频须映射到空div作为全画幅底层，由引擎独立播放','CUSTOM_RESOURCE');videoBindings.add(mapping.elementId);element.attrs.push({name:'style',value:'display:none!important'});}
    else insist(['shape','component'].includes(native.kind),'自定义源码中不支持该媒体类型','CUSTOM_RESOURCE');
  }
  insist(nodes.filter(n=>!['audio','video'].includes(n.kind)).every(n=>nodeIds.has(n.id)),'自定义场景遗漏原生对象','CUSTOM_OBJECTS');
  for(const [id,element] of ids)if(element.tagName==='img')insist(mapped.has(id),'图片必须声明原生素材','CUSTOM_RESOURCE');
  const sheet=postcss.parse(bundle.css);let declarations=0;
  sheet.walkAtRules(()=>insist(false,'自定义CSS禁止导入及全局规则','CUSTOM_CSS'));
  sheet.walkRules(rule=>{insist(rule.parent===sheet,'自定义CSS不允许嵌套规则','CUSTOM_CSS');const selectors=rule.selector.split(',').map(s=>s.trim());insist(selectors.every(s=>/^#[a-zA-Z][a-zA-Z0-9_-]*$/.test(s)&&ids.has(s.slice(1))),'CSS只能选择本场景ID','CUSTOM_CSS');rule.selector=selectors.map(s=>'#'+scene.id+' #'+prefix+s.slice(1)).join(',');});
  sheet.walkDecls(d=>{insist(++declarations<=500&&cssProperties.has(d.prop)&&!d.important&&d.parent.type==='rule','自定义CSS属性不支持','CUSTOM_CSS');insist(!/[\\<>@]/.test(d.value)&&!/(?:url\s*\(|expression\s*\(|var\s*\(|image-set\s*\(|(?:https?|data|file):)/i.test(d.value),'自定义CSS外链/动态引用被禁止','CUSTOM_CSS');insist(d.value.length<=300,'CSS值过长','CUSTOM_CSS');for(const n of d.value.replace(/#[0-9a-f]{3,8}\b/ig,'').matchAll(/[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi))insist(Math.abs(Number(n[0]))<=20000,'CSS尺寸超出资源边界','CUSTOM_RESOURCE');if(d.prop==='position')insist(['absolute','relative','static'].includes(d.value),'不支持的定位方式','CUSTOM_CSS');});
  const ast=parse(bundle.timeline,{ecmaVersion:2022});insist(ast.body.length>0&&ast.body.length<=160,'自定义时间线数量无效','CUSTOM_SCRIPT');const calls=[];
  for(const stmt of ast.body){const call=stmt.expression;insist(stmt.type==='ExpressionStatement'&&call?.type==='CallExpression'&&call.callee.type==='MemberExpression'&&!call.callee.computed&&call.callee.object.type==='Identifier'&&call.callee.object.name==='tl'&&call.callee.property.type==='Identifier'&&['to','from','fromTo','set'].includes(call.callee.property.name),'源码只能包含有限GSAP调用','CUSTOM_SCRIPT');const method=call.callee.property.name;insist(call.arguments.length===(method==='fromTo'?4:3),'GSAP参数数量无效','CUSTOM_SCRIPT');const args=call.arguments.map(n=>valueOf(n,values)),selector=args[0],at=args.at(-1);insist(typeof selector==='string'&&/^#[a-zA-Z][a-zA-Z0-9_-]*$/.test(selector)&&ids.has(selector.slice(1)),'动画只能选择本场景对象','CUSTOM_SCRIPT');
    insist(!videoBindings.has(selector.slice(1)),'视频占位不做动画；实拍由引擎播放，请对独立文字或图形叠层编排动效','CUSTOM_MOTION');
    const vars=args.slice(1,-1);for(const v of vars){insist(v&&typeof v==='object'&&!Array.isArray(v),'GSAP属性对象无效','CUSTOM_SCRIPT');for(const [key,value] of Object.entries(v)){insist(typeof value==='number'?Number.isFinite(value)&&Math.abs(value)<=20000:typeof value==='string'?value.length<=180&&!/[<>\\]/.test(value)&&!/(?:url\s*\(|javascript:|data:|https?:|file:)/i.test(value):typeof value==='boolean','动画值无效','CUSTOM_SCRIPT');if(['opacity','autoAlpha'].includes(key))insist(value>=0&&value<=1,'透明度无效','CUSTOM_SCRIPT');if(['scale','scaleX','scaleY'].includes(key))insist(value>=0&&value<=10,'缩放越界','CUSTOM_RESOURCE');}}
    const end=vars.at(-1),duration=method==='set'?0:(end.duration??.5),repeat=end.repeat??0,delay=end.delay??0;insist([at,duration,repeat,delay].every(Number.isFinite)&&at>=0&&duration>=0&&delay>=0&&Number.isInteger(repeat)&&repeat>=0&&repeat<=20&&at+delay+duration*(repeat+1)<=scene.durationFrames/30+.001,`场景 ${scene.id} 仅 ${scene.durationFrames/30} 秒；${selector} 的 tl.${method} 从 ${at} 秒开始，delay=${delay}、duration=${duration}、repeat=${repeat}，结束于 ${at+delay+duration*(repeat+1)} 秒。请将本场所有调用结束时间保持在 ${scene.durationFrames/30} 秒以内且重复次数为 0—20 的整数`,'CUSTOM_DURATION');
    args[0]='#'+prefix+selector.slice(1);args[args.length-1]=at+scene.startFrame/30;calls.push({method,args,elementId:selector.slice(1)});
  }
  insist(Array.isArray(bundle.motionTargets)&&bundle.motionTargets.length>0&&bundle.motionTargets.length<=20&&bundle.motionTargets.every(id=>mapped.has(id)&&calls.some(c=>c.elementId===id&&c.method!=='set')),'自定义场景缺少可验证运动目标','CUSTOM_MOTION');
  const sampleTimes=[...new Set(calls.flatMap(c=>{const vars=c.args.at(-2),at=c.args.at(-1)+(vars.delay||0),duration=c.method==='set'?0:vars.duration??.5;return Array.from({length:(vars.repeat||0)+1},(_,i)=>[at+duration*i+duration/2,at+duration*(i+1)]).flat();}).filter(t=>t>=scene.startFrame/30&&t<(scene.startFrame+scene.durationFrames)/30))].sort((a,b)=>a-b);
  insist(sampleTimes.length<=400,'自定义场景关键过程帧过多','CUSTOM_RESOURCE');
  return {html:serialize(tree),css:sheet.toString(),timeline:calls.map(c=>`tl.${c.method}(${c.args.map(stringify).join(',')});`).join('\n'),objects,motionTargets:bundle.motionTargets.map(id=>prefix+id),sampleTimes,parameters:values};
}
