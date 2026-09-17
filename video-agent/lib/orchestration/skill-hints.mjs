// Lexical evidence is supplemental; object operations and revision state take precedence.
export const skillHints={
  'timeline-edit':/剪|删|保留|移|插入|调.*时间|倍速|加速|慢放|裁|导出|下载|export|trim|cut|speed|reorder|delete|keep|split|move|insert/i,
  'speech-captions':/字幕|配音|旁白|朗读|说|台词|翻译|caption|voice|speech|transcri|subtitle|translate/i,
  'visual-composition':/画中画|[Bb]-?roll|叠加|转场|画幅|横屏|竖屏|裁|主体|画面|overlay|crop|transition|picture/i,
  'audio-mix':/音乐|音量|响度|原声|声音|淡入|淡出|静音|music|audio|volume|duck|loudness|lufs/i,
  'rough-cut':/停顿|空白|静音|精华|精彩|总结|摘要|访谈|口播|镜头|场景|节奏|因果|独立看懂|重复表达|按.*内容|silence|pause|highlight|scene/i,
  'hyperframes':/hyperframes?|合成|composition|工作台|生成.*视频|创建.*视频|做.*视频|视频.*生成/i,
  'faceless-explainer':/文章|主题|笔记|讲解|解释|科普|教程|知识|无真人|faceless|explainer|article|topic/i,
  'hyperframes-creative':/信息图|流程图|对比|步骤|数据|图表|标题动画|片头|片尾|品牌|强调|callout|infographic|diagram|chart|creative/i,
  'media-use':/截图|图片|照片|素材图|展示.*图|screen|image|photo|screenshot|b-?roll|media/i,
  'hyperframes-animation':/动画|动效|转场|运动|缩放|推近|淡入|淡出|motion|animate|animation|transition|gsap/i,
  'commerce-promo':/商品|电商|带货|卖货|产品宣传|商品宣传|产品广告|product\s*(?:promo|ad)|e-?commerce|shopping\s*video/i
};
