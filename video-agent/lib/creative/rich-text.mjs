import {insist} from './contracts.mjs';

// Styles select existing, unique literal text. They never supply rendered copy or markup.
export function textStyleSegments(text, styles = []) {
  insist(typeof text === 'string' && Array.isArray(styles) && styles.length <= 32, '局部文字样式数量无效', 'CUSTOM_TEXT_STYLE');
  const ranges = styles.map(style => {
    insist(style && Object.keys(style).every(k => ['elementId', 'match', 'fontSize', 'fontWeight', 'color'].includes(k)), '局部文字样式属性不支持', 'CUSTOM_TEXT_STYLE');
    insist(typeof style.match === 'string' && style.match.trim() && text.includes(style.match) && text.indexOf(style.match) === text.lastIndexOf(style.match), '局部样式必须唯一匹配原生文字中的完整字串', 'CUSTOM_TEXT_STYLE');
    insist(Number.isFinite(style.fontSize) && style.fontSize >= 12 && style.fontSize <= 240 && Number.isInteger(style.fontWeight) && style.fontWeight >= 100 && style.fontWeight <= 900 && /^#[0-9a-f]{6}$/i.test(style.color), '局部文字字号、字重或颜色越界', 'CUSTOM_TEXT_STYLE');
    return {start: text.indexOf(style.match), end: text.indexOf(style.match) + style.match.length, style};
  }).sort((a, b) => a.start - b.start);
  const segments = []; let cursor = 0;
  for (const range of ranges) {
    insist(range.start >= cursor, '局部文字样式不能重叠', 'CUSTOM_TEXT_STYLE');
    if (range.start > cursor) segments.push({text: text.slice(cursor, range.start)});
    segments.push({text: text.slice(range.start, range.end), style: range.style, start: range.start, end: range.end});
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({text: text.slice(cursor)});
  return segments;
}

export function rebaseTextStyles(bundle, nodeId, previous, next) {
  if (!bundle.textStyles?.length || previous === next) return;
  const elementIds = new Set(bundle.objects.filter(o => o.nodeId === nodeId).map(o => o.elementId));
  let left = 0, right = 0;
  while (left < Math.min(previous.length, next.length) && previous[left] === next[left]) left++;
  while (right < Math.min(previous.length, next.length) - left && previous.at(-right - 1) === next.at(-right - 1)) right++;
  bundle.textStyles = bundle.textStyles.flatMap(style => {
    if (!elementIds.has(style.elementId)) return [style];
    if (next.includes(style.match) && next.indexOf(style.match) === next.lastIndexOf(style.match)) return [style];
    const start = previous.indexOf(style.match), end = start + style.match.length;
    if (start >= 0 && left >= start && previous.length - right <= end) {
      const match = next.slice(start, end + next.length - previous.length);
      if (match.trim() && next.indexOf(match) === next.lastIndexOf(match)) return [{...style, match}];
    }
    // Do not invent copy to preserve formatting when a change crosses its boundary.
    (bundle.textStyleReview ??= []).push({nodeId, match: style.match, reason: '文字修改跨越样式范围或匹配不再唯一，已移除该局部样式；需要复核排版'});
    return [];
  });
}
