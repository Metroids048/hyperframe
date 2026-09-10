import fs from 'node:fs/promises';
const f='scripts/acceptance.mjs';let s=await fs.readFile(f,'utf8');
s=s.replace("page.on('request',req=>{if(req.isInterceptResolutionHandled())", "const networkHandler=req=>{if(req.isInterceptResolutionHandled())").replace("else req.continue();});", "else req.continue();};page.on('request',networkHandler);").replace('await page.setRequestInterception(false);',"page.off('request',networkHandler);await page.setRequestInterception(false);");
await fs.writeFile(f,s);
