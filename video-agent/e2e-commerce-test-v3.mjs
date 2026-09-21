#!/usr/bin/env node
import {chromium} from 'playwright';
import {writeFileSync} from 'fs';
import {join} from 'path';

const BASE_URL='http://localhost:3020';
const MATERIALS_DIR=join(process.cwd(),'assets','commerce-motion');

const TEST_VIDEOS=[
  '01-grind.mp4',
  '02-fill.mp4',
  '03-assemble.mp4',
  '04-extract.mp4',
  '05-pour.mp4',
  '06-finish.mp4'
];

const PRODUCT_PROMPT=`把这些咖啡制作素材制作成一条45秒左右、1080×1920竖屏的咖啡机推广视频。

从原素材中选取6—9个有效镜头,至少使用5个不同的有效源区间。开头3秒用实际咖啡制作画面吸引观看,再展开三个真实的咖啡机特点：精准研磨、专业萃取、快速出品,串起完整的咖啡制作过程,最后做自然的行动引导。

统一字体、配色、版式和运动节奏。至少使用两种真正帮助看清制作过程的视觉设计,例如细节放大与标注、整体和特写分屏、随解说出现的重点信息。转场要服务节奏,不要每个镜头都炫技。

加入自然中文讲解、与讲解对齐的字幕和合适的背景音乐。有人声时音乐降低,咖啡机操作声保留。竖屏不能裁掉关键制作动作和设备细节。

自动制作、检查并交付可播放和下载的新视频,显示真实进度,不要只返回方案。`;

async function main(){
  console.log('\n=== OpenClaw WebUI 第一轮完整验收测试 ===\n');
  console.log('测试素材:',TEST_VIDEOS.map(v=>join(MATERIALS_DIR,v)));

  const browser=await chromium.launch({headless:false,slowMo:50});
  const context=await browser.newContext({viewport:{width:1920,height:1080}});
  const page=await context.newPage();

  try {
    // 1. 访问页面
    console.log('\n[步骤1] 访问OpenClaw界面...');
    await page.goto(BASE_URL,{waitUntil:'networkidle',timeout:30000});
    await page.waitForTimeout(3000);

    // 2. 查找并点击主输入框（占位符"想做一条怎样的视频?"）
    console.log('[步骤2] 定位创作对话输入框...');

    // 尝试多种可能的选择器
    let dialogInput=null;
    const selectors=[
      'textarea[placeholder*="想做"]',
      'textarea[placeholder*="视频"]',
      '[contenteditable="true"]',
      '.chat-input textarea',
      '#chat-input',
      'div[role="textbox"]'
    ];

    for(const selector of selectors){
      try{
        const elem=page.locator(selector).first();
        const count=await elem.count();
        if(count>0){
          const isVisible=await elem.isVisible({timeout:1000}).catch(()=>false);
          if(isVisible){
            dialogInput=elem;
            console.log(`  ✓ 找到可见输入框: ${selector}`);
            break;
          }
        }
      }catch(e){
        // 继续尝试下一个
      }
    }

    if(!dialogInput){
      // 最后尝试：找所有textarea，选择可见且不是audio-text的
      const allTextareas=await page.locator('textarea').all();
      for(const ta of allTextareas){
        const id=await ta.getAttribute('id');
        if(id==='audio-text')continue;

        const isVisible=await ta.isVisible().catch(()=>false);
        if(isVisible){
          dialogInput=ta;
          console.log(`  ✓ 找到可见textarea（id="${id}"）`);
          break;
        }
      }
    }

    if(!dialogInput){
      throw new Error('未找到创作对话输入框');
    }

    // 3. 先上传素材
    console.log('[步骤3] 查找并上传素材...');

    // 查找文件上传控件
    const fileInputs=await page.locator('input[type="file"]').all();
    let uploadInput=null;

    for(const input of fileInputs){
      const accept=await input.getAttribute('accept');
      const id=await input.getAttribute('id');

      // 跳过工程包上传
      if(accept&&accept.includes('.zip')){
        console.log(`  跳过工程包上传: id="${id}"`);
        continue;
      }

      uploadInput=input;
      console.log(`  ✓ 选中素材上传控件: id="${id}", accept="${accept}"`);
      break;
    }

    if(!uploadInput){
      throw new Error('未找到素材上传控件');
    }

    const filePaths=TEST_VIDEOS.map(name=>join(MATERIALS_DIR,name));

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

    // 5. 查找并点击生成/提交按钮
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
      // 最后尝试：找所有按钮，选文本包含"生成"的
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

    const startTime=Date.now();
    await submitBtn.click();
    console.log('✓ 需求已提交，开始监控进度...\n');

    // 6. 监控制作进度
    console.log('[步骤6] 等待视频制作完成（最长10分钟）...');
    let lastStatus='';
    let checkCount=0;
    const maxWaitMs=10*60*1000;

    while(Date.now()-startTime<maxWaitMs){
      await page.waitForTimeout(5000);
      checkCount++;

      const elapsed=Math.round((Date.now()-startTime)/1000);

      // 查找状态文本
      const bodyText=await page.locator('body').textContent();
      const statusKeywords=['制作中','处理中','渲染中','生成中','分析中','上传中','完成'];

      for(const keyword of statusKeywords){
        if(bodyText.includes(keyword)){
          if(lastStatus!==keyword){
            lastStatus=keyword;
            console.log(`  [${elapsed}秒] ${keyword}`);
          }
          break;
        }
      }

      // 检查视频元素
      const videos=await page.locator('video').all();
      if(videos.length>0){
        console.log(`✓ 检测到${videos.length}个video元素`);

        // 检查下载链接或按钮
        const downloadCount=await page.locator('a[download], button:has-text("下载")').count();
        if(downloadCount>0){
          console.log(`\n[成功] 视频制作完成！`);
          console.log(`  总耗时: ${elapsed}秒 (${(elapsed/60).toFixed(1)}分钟)`);
          console.log(`  视频元素: ${videos.length}个`);
          console.log(`  下载入口: ${downloadCount}个`);

          await page.waitForTimeout(2000);
          await page.screenshot({path:'e2e-test-success-round1.png',fullPage:true});
          console.log('✓ 已保存成功截图');

          writeFileSync('e2e-test-status-round1.json',JSON.stringify({
            success:true,
            round:1,
            elapsedSeconds:elapsed,
            videoCount:videos.length,
            downloadCount,
            timestamp:new Date().toISOString()
          },null,2));

          console.log('\n[第一轮测试] 通过 ✓\n');
          break;
        }
      }

      // 定期报告
      if(checkCount%12===0){
        console.log(`  [${elapsed}秒] 仍在处理... (检查${checkCount}次)`);
      }

      // 检查错误
      const hasError=bodyText.match(/错误|失败|Error|Failed/i);
      if(hasError){
        console.warn(`⚠ 检测到可能的错误文本`);
      }
    }

    if(Date.now()-startTime>=maxWaitMs){
      throw new Error('超时：10分钟内未完成制作');
    }

  } catch(error){
    console.error('\n[测试失败]',error.message);
    await page.screenshot({path:'e2e-test-error-round1.png',fullPage:true});
    console.log('✓ 已保存错误截图');

    writeFileSync('e2e-test-status-round1.json',JSON.stringify({
      success:false,
      error:error.message,
      timestamp:new Date().toISOString()
    },null,2));

    throw error;
  } finally {
    console.log('\n浏览器保持打开供检查...');
    // 不关闭浏览器，便于人工检查
  }
}

main().catch(err=>{
  console.error('测试异常:',err);
  process.exit(1);
});
