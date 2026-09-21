#!/usr/bin/env node
import {chromium} from 'playwright';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));

const TEST_VIDEOS=[
  '01-grind.mp4',
  '02-fill.mp4',
  '03-assemble.mp4',
  '04-extract.mp4',
  '05-pour.mp4',
  '06-finish.mp4'
];

const PRODUCT_PROMPT=`把这些商品素材制作成一条45秒左右、1080×1920竖屏的商品推广视频。

从原素材中选取6—9个有效镜头,至少使用5个不同的有效源区间。开头3秒用实际产品画面吸引观看,再展开三个有依据的产品特点,串起一个看得懂的使用过程,最后做自然的行动引导。

统一字体、配色、版式和运动节奏。至少使用两种真正帮助看清商品的视觉设计,例如细节放大与标注、整体和特写分屏、随解说出现的重点信息。转场要服务节奏,不要每个镜头都炫技。

加入自然中文讲解、与讲解对齐的字幕和合适的背景音乐。有人声时音乐降低,有价值的产品操作声保留。竖屏不能裁掉关键商品结构和操作动作。

自动制作、检查并交付可播放和下载的新视频,显示真实进度,不要只返回方案。`;

console.log('=== OpenClaw WebUI 第一轮完整验收测试（V4：网络监听版） ===\n');

const filePaths=TEST_VIDEOS.map(name=>
  path.join(__dirname,'assets/commerce-motion',name)
);
console.log('测试素材:',filePaths,'\n');

const browser=await chromium.launch({
  headless:false,
  slowMo:100
});

try{
  const context=await browser.newContext({
    viewport:{width:1400,height:900}
  });

  const page=await context.newPage();

  // 监听所有网络请求
  const requests=[];
  page.on('request',request=>{
    const url=request.url();
    if(url.includes('/api/')){
      requests.push({
        url,
        method:request.method(),
        headers:request.headers(),
        postData:request.postData()?.substring(0,200)
      });
      console.log(`[网络] ${request.method()} ${url}`);
    }
  });

  page.on('response',async response=>{
    const url=response.url();
    if(url.includes('/api/')){
      const status=response.status();
      console.log(`[响应] ${status} ${url}`);
      if(status>=400){
        try{
          const body=await response.text();
          console.log(`[错误响应] ${body.substring(0,200)}`);
        }catch(e){
          // ignore
        }
      }
    }
  });

  console.log('[步骤1] 访问OpenClaw界面...');
  await page.goto('http://localhost:3020',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(2000);

  // 2. 查找对话输入框
  console.log('[步骤2] 定位创作对话输入框...');

  const inputSelectors=[
    'textarea[placeholder*="想做"]',
    'textarea[placeholder*="输入"]',
    'textarea[placeholder*="描述"]',
    '#message-input',
    'textarea.message-input',
    'textarea[name="message"]'
  ];

  let dialogInput=null;
  for(const selector of inputSelectors){
    try{
      const input=page.locator(selector).first();
      const count=await input.count();
      if(count>0){
        const isVisible=await input.isVisible({timeout:500}).catch(()=>false);
        if(isVisible){
          dialogInput=input;
          console.log(`  ✓ 找到可见输入框: ${selector}`);
          break;
        }
      }
    }catch(e){
      // 继续
    }
  }

  if(!dialogInput){
    throw new Error('未找到对话输入框');
  }

  // 3. 查找并上传素材
  console.log('[步骤3] 查找并上传素材...');

  const uploadSelectors=[
    'input[type="file"][id="images"]',
    'input[type="file"][accept*="video"]',
    'input[type="file"]:not([id="package-file"])',
    'input[type="file"][multiple]'
  ];

  let uploadInput=null;
  for(const selector of uploadSelectors){
    try{
      const input=page.locator(selector).first();
      const count=await input.count();
      if(count>0){
        const id=await input.getAttribute('id');
        if(id==='package-file'){
          console.log(`  跳过工程包上传: id="${id}"`);
          continue;
        }
        uploadInput=input;
        const accept=await input.getAttribute('accept');
        console.log(`  ✓ 选中素材上传控件: id="${id}", accept="${accept}"`);
        break;
      }
    }catch(e){
      // 继续
    }
  }

  if(!uploadInput){
    throw new Error('未找到素材上传控件');
  }

  try{
    await uploadInput.setInputFiles(filePaths);
    console.log(`✓ 已上传6个素材文件`);
  }catch(e){
    console.log('批量上传失败，尝试逐个上传...');
    for(let i=0;i<filePaths.length;i++){
      await uploadInput.setInputFiles(filePaths[i]);
      console.log(`  ${i+1}/6: ${TEST_VIDEOS[i]}`);
      await page.waitForTimeout(800);
    }
  }

  await page.waitForTimeout(2000);

  // 4. 输入完整需求
  console.log('[步骤4] 填写视频制作需求...');
  await dialogInput.click();
  await dialogInput.fill(PRODUCT_PROMPT);
  console.log(`✓ 已输入${PRODUCT_PROMPT.length}字需求`);
  await page.waitForTimeout(1000);

  // 5. 查找并点击提交按钮
  console.log('[步骤5] 查找提交按钮...');

  const submitSelectors=[
    'button:has-text("生成视频")',
    'button:has-text("生成")',
    'button:has-text("提交")',
    'button:has-text("发送")',
    'button[type="submit"]',
    '.submit-btn',
    '#submit-btn'
  ];

  let submitBtn=null;
  for(const selector of submitSelectors){
    try{
      const btn=page.locator(selector).first();
      const count=await btn.count();
      if(count>0){
        const isVisible=await btn.isVisible({timeout:500}).catch(()=>false);
        if(isVisible){
          submitBtn=btn;
          console.log(`  ✓ 找到提交按钮: ${selector}`);
          break;
        }
      }
    }catch(e){
      // 继续
    }
  }

  if(!submitBtn){
    const allButtons=await page.locator('button').all();
    for(const btn of allButtons){
      const text=await btn.textContent();
      if(text&&(text.includes('生成')||text.includes('提交')||text.includes('发送'))){
        const isVisible=await btn.isVisible().catch(()=>false);
        if(isVisible){
          submitBtn=btn;
          console.log(`  ✓ 找到按钮: "${text.trim()}"`);
          break;
        }
      }
    }
  }

  if(!submitBtn){
    throw new Error('未找到提交按钮');
  }

  console.log('\n[关键] 点击提交，监听网络请求...\n');
  const beforeRequestCount=requests.length;

  await submitBtn.click();

  // 等待请求发出
  await page.waitForTimeout(3000);

  const newRequests=requests.slice(beforeRequestCount);
  console.log(`\n[网络统计] 提交后发出了 ${newRequests.length} 个API请求:`);
  newRequests.forEach(req=>{
    console.log(`  ${req.method} ${req.url}`);
    if(req.postData){
      console.log(`    数据: ${req.postData}`);
    }
  });

  // 检查是否有draft或message请求
  const hasDraft=newRequests.some(r=>r.url.includes('/api/commerce-chat')&&r.postData?.includes('"action":"draft"'));
  const hasMessage=newRequests.some(r=>r.url.includes('/api/commerce-chat')&&r.postData?.includes('"action":"message"'));

  console.log(`\n[验证] draft请求: ${hasDraft?'✓':'✗'}`);
  console.log(`[验证] message请求: ${hasMessage?'✓':'✗'}`);

  if(!hasDraft&&!hasMessage){
    console.log('\n[失败] 提交按钮点击后，没有发送draft或message请求到后端！');
    console.log('[失败] 这说明前端提交逻辑有问题，或者按钮点击没有触发表单提交。');
  }else{
    console.log('\n[成功] 请求已发送到后端！');
  }

  console.log('\n浏览器保持打开供检查...');
  await page.waitForTimeout(60000);

}catch(error){
  console.error('\n[测试失败]',error.message);
  throw error;
}finally{
  await browser.close();
}
