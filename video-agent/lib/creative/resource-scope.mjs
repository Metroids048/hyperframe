// Positions are resolved against the current revision, never a previous count.
const numeral='[零〇一二两三四五六七八九十百\\d]+';
const unit='(?:个)?(?:转场|切点)|处';
function number(text){
 if(/^\d+$/.test(text))return Number(text);
 if(!/^[一二两三四五六七八九]$|^[一二三四五六七八九]?十[一二三四五六七八九]?$/.test(text))return NaN;
 const digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
 let value=0,current=0;for(const c of text){if(c==='十'||c==='百'){value+=(current||1)*(c==='十'?10:100);current=0;}else current=digits[c];}return value+current;
}
export function transitionScopes(clause,{exclusive=false}={}){
 if(/其余|其他/.test(clause))return [{kind:'others'}];
 const scopes=[];let rest=clause;
 const add=(index,relative=false)=>scopes.push(relative?{kind:'relative-transition',offset:index}:{kind:'transition',index:index-1});
 rest=rest.replace(new RegExp('第('+numeral+')(?:'+unit+')?\\s*(?:至|到|—|-)\\s*第?('+numeral+')(?:'+unit+')','g'),(_,a,b)=>{a=number(a);b=number(b);if(!Number.isInteger(a)||!Number.isInteger(b)||a<1||b<a||b-a>1000)scopes.push({kind:'unresolved'});else for(let i=a;i<=b;i++)add(i);return '';});
 rest=rest.replace(new RegExp('倒数第?('+numeral+')(?:'+unit+')|最后(?:一)?(?:'+unit+')','g'),(_,n)=>{add(n?number(n):1,true);return '';});
 // A shared final unit applies to every member, including 第二、第三处.
 rest=rest.replace(new RegExp('第'+numeral+'(?:(?:'+unit+'))?(?:\\s*[、和及与]\\s*第?'+numeral+'(?:(?:'+unit+'))?)+','g'),list=>{if(!new RegExp(unit).test(list))scopes.push({kind:'unresolved'});else for(const n of list.match(new RegExp(numeral,'g')))add(number(n));return '';});
 rest=rest.replace(new RegExp('第('+numeral+')(?:'+unit+')','g'),(_,n)=>{add(number(n));return '';});
 rest=rest.replace(/(?:the\s+)?(last|first|second|third)\s+transition/ig,(_,n)=>{n=n.toLowerCase();add({last:1,first:1,second:2,third:3}[n],n==='last');return '';});
 if(/最后|倒数|第|某[一处个]|[这那哪]一?处|局部|部分|中间|开头|结尾/.test(rest)||exclusive&&!scopes.length)scopes.push({kind:'unresolved'});
 return scopes.length?scopes:[{kind:'all'}];
}

export function resourceInstructionText(text){
 // Quoted display copy is data; a quoted resource name remains a valid name.
 return String(text).replace(/“[^”]*”|「[^」]*」|"[^"]*"|'[^']*'/g,(quoted,offset,whole)=>
   /(?:标题|字幕|台词|文字)[^。；\n]{0,20}(?:写|改成|改为|是|为)\s*$/.test(whole.slice(0,offset))||/^(?:“[^”]*”|「[^」]*」|"[^"]*"|'[^']*')$/.test(whole.trim())?'':quoted
 ).replace(new RegExp('(第'+numeral+')\\s*[，,]\\s*(?=第?'+numeral+'(?:'+unit+'))','g'),'$1、');
}
