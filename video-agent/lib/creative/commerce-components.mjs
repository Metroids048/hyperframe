import {digest} from './commerce-focus.mjs';

// Business templates compose the existing native adapters; these are not MP4 presets.
export const commerceComponents={
  hero_media:{nativeKinds:['video','image'],purpose:'保护主体的真实媒体容器',resources:['video-text-pivot','comparison-split']},
  title:{nativeKinds:['text'],purpose:'独立可改的标题',resources:['titlecard-reveal']},
  detail_callout:{nativeKinds:['text','shape'],purpose:'与可信细节对应的标注',resources:['comparison-split','lt-mask-reveal']},
  operation_step:{nativeKinds:['text'],purpose:'绑定源动作与保护区的步骤说明',resources:['lt-mask-reveal','video-text-pivot']},
  caption:{nativeKinds:['text'],purpose:'普通字幕与声音独立',resources:['caption-editorial-emphasis']},
  ending:{nativeKinds:['text','video'],purpose:'完整收尾和已提供的下一步提示',resources:['titlecard-reveal']},
};
export const commerceTemplates={
  product_launch:{id:'commerce-launch-v1',version:1,structure:['建立商品','真实使用','可信细节','整体回归与收尾'],components:['hero_media','title','detail_callout','caption','ending'],rule:'按有效内容调整镜头，不按槽位补造内容；先主体、后说明；价格与Logo可缺省。'},
  product_howto:{id:'commerce-howto-v1',version:1,structure:['前置准备','必要操作及依赖','完成结果'],components:['hero_media','title','operation_step','caption','ending'],rule:'镜头服从真实步骤及源时间，字幕避开保护区，不得跳步、逆放或用静图代替动作。'},
};
export function commerceResourceContext(contract){
  const template=commerceTemplates[contract?.scenarioId==='product_demo'?'product_howto':contract?.scenarioId];
  return template?{template,components:Object.fromEntries(template.components.map(k=>[k,commerceComponents[k]])),sha256:digest({template,commerceComponents})}:null;
}
export function commerceComponentReceipt(document){
  const context=commerceResourceContext(document.businessContract);if(!context)return null;
  const instances=document.nodes.flatMap(n=>{
    let componentId=['video','image'].includes(n.kind)?'hero_media':n.semanticRole==='title'?'title':n.semanticRole==='caption'?'caption':n.semanticRole==='cta'?'ending':n.semanticRole==='feature'?(['product_howto','product_demo'].includes(document.businessContract.scenarioId)?'operation_step':'detail_callout'):null;
    return componentId?[{componentId,nodeId:n.id,sceneId:n.sceneId,assetId:n.assetId||null}]:[];
  });
  return {templateId:context.template.id,version:context.template.version,resourceHash:context.sha256,instances,method:'business structure compiled into existing editable native objects',visualAcceptance:'pending-final-output-review'};
}
