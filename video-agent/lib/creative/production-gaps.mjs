// Only explicit runtime/tool limitations are classified here. Unknown or mixed
// business omissions remain visible; this never declares missing material present.
export function classifyProductionGap(gap) {
  const text=String(gap);
  if(/provider\.transcribe|语音对齐工具|运行时.{0,24}(?:对齐|转写)|没有可调用.{0,24}(?:语音|对齐)|缺少.{0,20}(?:短语级|词级|实测时间)/i.test(text))return 'speech_alignment';
  if(/(?:缺少|没有|不具备).{0,24}(?:听音能力|听音工具|音频感知能力)|(?:模型|运行时).{0,24}(?:无法试听|无法听取)|运行时提供原声核验能力/.test(text))return 'audio_review_capability';
  if(/观察预算|抽帧预算|帧数量超出|工具.{0,16}(?:超时|失败|不可用)/.test(text))return 'runtime';
  return 'input';
}
export function assertNoInternalInputGap(gaps) {
  const internal=gaps.map(text=>({text,kind:classifyProductionGap(text)})).filter(g=>g.kind!=='input');
  if(internal.length)throw Object.assign(Error('制作工具能力待恢复，原素材与输入已保留；无需重复上传：'+internal.map(g=>g.text).join('；')),
    {code:internal.some(g=>g.kind==='speech_alignment')?'SPEECH_ALIGNMENT_REQUIRED':'PRODUCTION_CAPABILITY_REQUIRED',gaps,internalGaps:internal});
}
