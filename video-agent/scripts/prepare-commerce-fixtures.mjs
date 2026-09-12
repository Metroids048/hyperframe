import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'data/commerce-samples');
await fs.mkdir(out,{recursive:true});

const common=`<defs>
<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#eee8dc"/><stop offset="1" stop-color="#a9917e"/></linearGradient>
<linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b57a50"/><stop offset="1" stop-color="#56392d"/></linearGradient>
<linearGradient id="label" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4ecdd"/><stop offset="1" stop-color="#d8cbb8"/></linearGradient>
<filter id="blur"><feGaussianBlur stdDeviation="34"/></filter>
<filter id="shadow"><feDropShadow dx="0" dy="28" stdDeviation="24" flood-color="#2b1c16" flood-opacity=".35"/></filter>
</defs>`;
const bottle=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})" filter="url(#shadow)">
<rect x="110" y="180" width="420" height="620" rx="66" fill="url(#glass)"/>
<rect x="195" y="92" width="250" height="170" rx="52" fill="#704633"/>
<rect x="238" y="15" width="164" height="118" rx="38" fill="#51382d"/>
<rect x="252" y="35" width="136" height="18" fill="#b18b6d" opacity=".75"/>
<rect x="150" y="470" width="340" height="220" rx="30" fill="url(#label)" stroke="#fff5e7" stroke-opacity=".35" stroke-width="3"/>
<path d="M195 535h250" stroke="#705645" stroke-width="5" stroke-linecap="round"/>
<path d="M188 584h72m24 0h48m38 0h72" stroke="#604738" stroke-width="14" stroke-linecap="round"/>
<circle cx="320" cy="635" r="14" fill="none" stroke="#604738" stroke-width="5"/>
<rect x="145" y="235" width="45" height="455" rx="22" fill="#fff5dd" opacity=".48"/>
</g>`;
const hero=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">${common}
<rect width="1080" height="1350" fill="url(#paper)"/><circle cx="240" cy="470" r="410" fill="#d7cbb8" opacity=".78"/>
<circle cx="940" cy="255" r="145" fill="#63705b" opacity=".36" filter="url(#blur)"/>
<circle cx="90" cy="1040" r="145" fill="#66705f" opacity=".35" filter="url(#blur)"/>
<rect y="1040" width="1080" height="310" fill="#654c3d"/>
<path d="M250 980h580l80 74H170z" fill="#ede4d6"/><rect x="218" y="1048" width="645" height="180" rx="44" fill="#d4c5af"/>
${bottle(218,245,.98)}</svg>`;
const detail=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">${common}
<rect width="1080" height="1350" fill="#30241f"/><circle cx="250" cy="350" r="170" fill="none" stroke="#d9ad6e" stroke-width="7"/><circle cx="250" cy="350" r="132" fill="none" stroke="#f5ecdd" stroke-width="2"/>
<path d="M370 470L555 650" stroke="#d9ad6e" stroke-width="5"/><rect x="70" y="615" width="345" height="126" rx="30" fill="#eee4d4"/>
<path d="M110 658h214m-214 29h154m-154 29h248" stroke="#5c4336" stroke-width="12" stroke-linecap="round"/>
${bottle(390,180,1.1)}</svg>`;
const context=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">${common}
<rect width="1080" height="1350" fill="url(#paper)"/><rect y="1030" width="1080" height="320" fill="#594438"/>
<rect x="90" y="105" width="400" height="500" rx="34" fill="#f0e8da" opacity=".92"/><circle cx="290" cy="315" r="130" fill="#a58c74"/>
<path d="M875 480c-55 150-82 340-85 560" stroke="#525342" stroke-width="25" fill="none"/>
<ellipse cx="850" cy="520" rx="150" ry="82" fill="#41533f"/><ellipse cx="945" cy="650" rx="155" ry="88" fill="#41533f"/><ellipse cx="805" cy="755" rx="145" ry="82" fill="#4d6048"/><ellipse cx="930" cy="845" rx="165" ry="92" fill="#41533f"/>
<rect x="470" y="930" width="490" height="155" rx="42" fill="#d8c7af"/>
${bottle(535,390,.72)}</svg>`;
for(const [name,svg] of [['nova-hero.jpg',hero],['nova-detail.jpg',detail],['nova-context.jpg',context]]){
  // libvips on Windows cannot atomically replace an existing JPEG. Remove the
  // previous generated fixture first so `npm run commerce:fixtures` is
  // repeatable after a prior run.
  await fs.rm(path.join(out,name), {force:true});
  await sharp(Buffer.from(svg)).jpeg({quality:92,chromaSubsampling:'4:4:4'}).toFile(path.join(out,name));
}
console.log(`Prepared 3 synthetic commerce fixtures in ${out}`);
