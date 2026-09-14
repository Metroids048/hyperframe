// Native product layouts: every photo and text keeps its existing object id.
export function editorialDisplay(document,scene,n,assets,imageMarkup,textEl){
 const portrait=document.output.height>document.output.width,variant=scene.effectParams.variant,accent=['#7160A8','#506348','#865245','#315A70'][scene.effectParams.palette];
 const media=n.media.filter(m=>m.kind==='image');
 const heading=n.title||n.text[0],rest=n.text.filter(t=>t!==heading);
 const photo=(m,i)=>`<div class="ed-photo ed-photo-${i} enter" data-layout-allow-overflow><div class="media-motion motion">${imageMarkup(assets[m.assetId],{...m,params:{...m.params,fit:'contain'}})}</div></div>`;
 return `<div class="editorial ${portrait?'ed-portrait':'ed-landscape'} ed-v${variant}" style="--ed-accent:${accent}"><div class="ed-index enter">${String(document.scenes.indexOf(scene)+1).padStart(2,'0')} / ${String(document.scenes.length).padStart(2,'0')}</div><div class="ed-rule enter"></div><div class="ed-copy">${heading?textEl(heading,'ed-heading'):''}${rest.map(t=>textEl(t,t.semanticRole==='price'?'ed-price':'ed-detail')).join('')}</div><div class="ed-gallery">${media.map(photo).join('')}</div></div>`;
}
export const editorialCSS=`
.editorial{position:absolute;inset:0;background:#f1f0eb;color:#172421;overflow:hidden}
.ed-index{position:absolute;left:6%;top:5%;font-size:25px;font-weight:650;letter-spacing:.12em;color:var(--ed-accent)}
.ed-rule{position:absolute;left:6%;right:6%;top:11%;height:3px;background:var(--ed-accent);transform-origin:left}
.ed-copy{position:absolute;left:6%;top:20%;width:31%;display:flex;flex-direction:column;gap:34px}
.ed-heading{font-size:104px;font-weight:750;line-height:1.12;letter-spacing:-.04em;overflow-wrap:anywhere}
.ed-detail{font-size:36px;font-weight:550;line-height:1.5;overflow-wrap:anywhere}
.ed-price{font-size:110px;font-weight:800;line-height:1.1;color:var(--ed-accent)}
.ed-gallery{position:absolute;left:43%;right:5%;top:16%;bottom:8%;display:flex;gap:24px}
.ed-photo{position:relative;flex:1;min-width:0;overflow:hidden;background:#e4e5df}
.ed-photo img{width:100%;height:100%;display:block;object-fit:contain}
.ed-v1 .ed-copy{top:15%;width:85%;flex-direction:row;align-items:center;gap:50px}
.ed-v1 .ed-heading{font-size:76px}.ed-v1 .ed-detail{font-size:32px;max-width:45%}
.ed-v1 .ed-gallery{left:6%;right:6%;top:34%;bottom:7%}
.ed-v2 .ed-copy{top:17%;width:86%}.ed-v2 .ed-heading{font-size:78px}
.ed-v2 .ed-gallery{left:6%;right:6%;top:36%;bottom:7%}
.ed-v3 .ed-copy{top:22%;width:37%}.ed-v3 .ed-gallery{left:49%;right:6%;top:16%;bottom:8%}
.ed-portrait .ed-index{top:4%;font-size:30px}.ed-portrait .ed-rule{top:8%}
.ed-portrait .ed-copy{top:11%;left:7%;width:86%;gap:24px;flex-direction:column;align-items:flex-start}
.ed-portrait .ed-heading{font-size:98px;line-height:1.16}.ed-portrait .ed-detail{font-size:46px;line-height:1.35;max-width:100%}
.ed-portrait .ed-gallery{left:7%;right:7%;top:36%;bottom:6%;gap:20px}
.ed-portrait.ed-v1 .ed-gallery{top:31%;bottom:7%}
.ed-portrait.ed-v2 .ed-gallery{top:31%;flex-direction:column}
.ed-portrait.ed-v2 .ed-photo{min-height:0}
.ed-portrait.ed-v3 .ed-copy{top:12%}.ed-portrait.ed-v3 .ed-gallery{top:44%}
`;
