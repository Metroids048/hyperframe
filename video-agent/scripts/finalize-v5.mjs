import fs from 'node:fs';
let s=fs.readFileSync('web/index.html','utf8');const duplicate='<a id="download-plan" class="text-link" hidden>下载分镜</a>';const second=s.indexOf(duplicate,s.indexOf(duplicate)+duplicate.length);if(second>=0)s=s.slice(0,second)+s.slice(second+duplicate.length);
const start=s.indexOf('<details id="extracted">'),end=s.indexOf('</details>',start)+10,extra=s.slice(start,end);s=s.slice(0,start)+s.slice(end);s=s.replace('</form>',extra+'</form>').replace('rows="7"','rows="5"');fs.writeFileSync('web/index.html',s);
fs.appendFileSync('web/style.css','\n.generate-footer{position:static}.input-materials textarea{min-height:132px}.input-materials .small{font-size:12px}.plan-actions .button{white-space:normal}\n');
