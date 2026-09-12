import fs from 'node:fs/promises';
const file='scripts/acceptance.mjs';
let s=await fs.readFile(file,'utf8');
s=s.replace("await first.click({clickCount:3});await first.type('ACCEPTANCE');", "await first.click();await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await first.type('ACCEPTANCE');");
await fs.writeFile(file,s);
