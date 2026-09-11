// Original sound follows its video object; independent music/voice tracks retain
// their own project timing. Captions keep the original source-track identity.
export function alignSourceAudio(document) {
  document.audioGraph = (document.audioGraph || []).flatMap(track => {
    if (!track.sourceNodeId) return [track];
    const node = document.nodes.find(n => n.id === track.sourceNodeId && n.kind === 'video');
    if (!node) return [];
    const shift = node.startFrame - track.startFrame;
    return [{...track, sceneId:node.sceneId, assetId:node.assetId,
      startFrame:node.startFrame, durationFrames:node.durationFrames,
      sourceStartSeconds:node.params?.sourceStartSeconds ?? 0,
      playbackRate:node.params?.playbackRate ?? 1,
      ...(track.fadeInFrames !== undefined ? {fadeInFrames:Math.min(track.fadeInFrames,node.durationFrames)} : {}),
      ...(track.fadeOutFrames !== undefined ? {fadeOutFrames:Math.min(track.fadeOutFrames,Math.max(0,node.durationFrames-(track.fadeInFrames||0)))} : {}),
      ...(track.ducking ? {ducking:track.ducking.flatMap(span=>{
        const startFrame=Math.max(node.startFrame,span.startFrame+shift),endFrame=Math.min(node.startFrame+node.durationFrames,span.endFrame+shift);
        return endFrame>startFrame?[{...span,startFrame,endFrame}]:[];
      })} : {}),
    }];
  });
}

export function sliceSourceAudio(track, oldNode, node) {
  const first=oldNode.startFrame+Math.round(((node.params?.sourceStartSeconds||0)-(oldNode.params?.sourceStartSeconds||0))/(oldNode.params?.playbackRate??1)*30);
  const last=first+node.durationFrames,originalEnd=track.startFrame+track.durationFrames;
  return {...track,sourceNodeId:node.id,sceneId:node.sceneId,startFrame:first,durationFrames:node.durationFrames,
    captionSourceId:track.captionSourceId||track.id,
    ...(track.fadeInFrames!==undefined?{fadeInFrames:first===track.startFrame?Math.min(track.fadeInFrames,node.durationFrames):0}:{}),
    ...(track.fadeOutFrames!==undefined?{fadeOutFrames:last===originalEnd?Math.min(track.fadeOutFrames,node.durationFrames):0}:{}),
    ...(track.ducking?{ducking:track.ducking.flatMap(span=>{const startFrame=Math.max(first,span.startFrame),endFrame=Math.min(last,span.endFrame);return endFrame>startFrame?[{...span,startFrame,endFrame}]:[];})}:{}),
  };
}
