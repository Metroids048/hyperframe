import {insist} from './contracts.mjs';
export function validateTextStyle(style={}) {
  insist(style&&typeof style==='object'&&!Array.isArray(style)&&Object.keys(style).every(k=>['color','fontSize','fontWeight'].includes(k)),'文字样式仅支持颜色、字号和字重','INVALID_TEXT_STYLE');
  if(style.color!==undefined)insist(/^#[0-9a-f]{6}$/i.test(style.color),'文字颜色必须为六位十六进制颜色','INVALID_TEXT_STYLE');
  if(style.fontSize!==undefined)insist(Number.isFinite(style.fontSize)&&style.fontSize>=12&&style.fontSize<=240,'文字字号必须为12—240','INVALID_TEXT_STYLE');
  if(style.fontWeight!==undefined)insist(Number.isInteger(style.fontWeight)&&style.fontWeight>=100&&style.fontWeight<=900,'文字字重必须为100—900','INVALID_TEXT_STYLE');
  return style;
}
export function textStyleCSS(style={}) {
  validateTextStyle(style);
  return Object.entries(style).map(([k,v])=>({color:'color',fontSize:'font-size',fontWeight:'font-weight'}[k])+':'+v+(k==='fontSize'?'px':'')).join(';');
}
