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

  const browser=await chromium.launch({headless:false,slowMo:100});
  const context=await browser.newContext({viewport:{width:1920,height:1080}});
  const page=await context.newPage();

  try {
    // 1. 访问页面
    console.log('\n[步骤1] 访问OpenClaw界面...');
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 2. 直接在对话框输入需求（让系统提示上传素材）
    console.log('[步骤2] 在对话框输入完整需求...');
    const textarea=await page.locator('textarea').first();
    if(!textarea){
      throw new Error('未找到对话输入框');
    }

    await textarea.click();
    await textarea.fill(PRODUCT_PROMPT);
    await page.waitForTimeout(1000);

    // 3. 查找并上传素材
    console.log('[步骤3] 查找素材上传方式...');

    // 尝试方式1：找"上传视频"、"素材库"等按钮
    const uploadBtns=await page.locator('button, [role="button"]').all();
    let uploadTriggered=false;

    for(const btn of uploadBtns){
      const text=await btn.textContent();
      if(text&&(text.includes('上传')||text.includes('素材')||text.includes('视频'))){
        console.log(`  找到按钮: "${text}"`);
        try{
          await btn.click();
          await page.waitForTimeout(500);
          uploadTriggered=true;
          break;
        }catch(e){
          console.log(`  点击失败，继续尝试...`);
        }
      }
    }

    // 尝试方式2：直接查找支持多文件的file input
    console.log('[步骤4] 定位文件上传控件...');
    const fileInputs=await page.locator('input[type="file"]').all();
    let targetInput=null;

    for(const input of fileInputs){
      const accept=await input.getAttribute('accept');
      const multiple=await input.getAttribute('multiple');
      const id=await input.getAttribute('id');

      console.log(`  找到input: id="${id}", accept="${accept}", multiple="${multiple}"`);

      // 跳过工程包上传（accept=".zip"）
      if(accept&&accept.includes('.zip')){
        console.log(`  跳过工程包上传控件`);
        continue;
      }

      // 优先选择支持多文件或接受视频的input
      if(multiple!==null||(accept&&accept.includes('video'))){
        targetInput=input;
        console.log(`  ✓ 选中此上传控件`);
        break;
      }
    }

    if(!targetInput&&fileInputs.length>0){
      // 如果没找到理想的，使用第一个非.zip的
      for(const input of fileInputs){
        const accept=await input.getAttribute('accept');
        if(!accept||!accept.includes('.zip')){
          targetInput=input;
          console.log(`  使用默认上传控件`);
          break;
        }
      }
    }

    if(!targetInput){
      throw new Error('未找到合适的文件上传控件');
    }

    // 4. 上传素材
    console.log('[步骤5] 上传6个咖啡制作素材...');
    const filePaths=TEST_VIDEOS.map(name=>join(MATERIALS_DIR,name));

    try{
      await targetInput.setInputFiles(filePaths);
      console.log('✓ 素材已上传');
    }catch(uploadErr){
      console.log('多文件上传失败，尝试逐个上传...');
      for(let i=0;i<filePaths.length;i++){
        await targetInput.setInputFiles(filePaths[i]);
        console.log(`  已上传 ${i+1}/${filePaths.length}: ${TEST_VIDEOS[i]}`);
        await page.waitForTimeout(500);
      }
    }

    await page.waitForTimeout(2000);

    // 5. 提交需求
    console.log('[步骤6] 提交完整商品视频需求...');
    const submitBtn=await page.locator('button:has-text("发送"), button:has-text("提交"), button:has-text("生成")').first();
    if(!submitBtn){
      throw new Error('未找到提交按钮');
    }

    const startTime=Date.now();
    await submitBtn.click();
    console.log('✓ 需求已提交，开始监控进度...\n');

    // 6. 监控制作进度（最长10分钟）
    console.log('[步骤7] 等待视频制作完成（最长10分钟）...');
    let lastProgress='';
    const maxWaitMs=10*60*1000;
    let progressChecks=0;

    while(Date.now()-startTime<maxWaitMs){
      await page.waitForTimeout(5000);
      progressChecks++;

      // 查找进度相关文本
      const bodyText=await page.locator('body').textContent();
      const progressMatches=bodyText.match(/(制作中|处理中|渲染中|上传中|分析中|生成中|已完成|完成)/g);

      if(progressMatches&&progressMatches.length>0){
        const currentProgress=progressMatches[progressMatches.length-1];
        if(currentProgress!==lastProgress){
          lastProgress=currentProgress;
          const elapsed=Math.round((Date.now()-startTime)/1000);
          console.log(`  [${elapsed}秒] 进度: ${currentProgress}`);
        }
      }

      // 检查视频元素
      const videoCount=await page.locator('video').count();
      if(videoCount>0){
        console.log(`✓ 检测到${videoCount}个视频元素`);

        // 检查下载链接
        const downloadLinks=await page.locator('a[download], button:has-text("下载")').count();
        if(downloadLinks>0){
          const elapsed=Math.round((Date.now()-startTime)/1000);
          console.log(`\n[成功] 视频制作完成！总耗时: ${elapsed}秒 (${(elapsed/60).toFixed(1)}分钟)`);

          await page.waitForTimeout(2000);
          await page.screenshot({path:'e2e-test-result-round1.png',fullPage:true});
          console.log('✓ 已保存页面截图: e2e-test-result-round1.png');

          writeFileSync('e2e-test-status-round1.json',JSON.stringify({
            success:true,
            round:1,
            elapsedSeconds:elapsed,
            videoCount:videoCount,
            timestamp:new Date().toISOString()
          },null,2));

          console.log('\n[第一轮测试] 通过 ✓\n');
          break;
        }
      }

      // 检查错误
      const errorKeywords=['错误','失败','异常','Error','Failed'];
      for(const keyword of errorKeywords){
        const errorElems=await page.locator(`text=/${keyword}/i`).count();
        if(errorElems>0){
          const errorTexts=await page.locator(`text=/${keyword}/i`).allTextContents();
          console.warn(`⚠ 检测到可能的错误: ${errorTexts.slice(0,3).join(', ')}`);
        }
      }

      if(progressChecks%12===0){
        const elapsed=Math.round((Date.now()-startTime)/1000);
        console.log(`  [${elapsed}秒] 仍在等待... (已检查${progressChecks}次)`);
      }
    }

    if(Date.now()-startTime>=maxWaitMs){
      throw new Error('超时：10分钟内未完成视频制作');
    }

  } catch(error){
    console.error('\n[测试失败]',error.message);
    await page.screenshot({path:'e2e-test-error-round1.png',fullPage:true});
    console.log('✓ 已保存错误截图: e2e-test-error-round1.png');

    writeFileSync('e2e-test-status-round1.json',JSON.stringify({
      success:false,
      error:error.message,
      timestamp:new Date().toISOString()
    },null,2));

    throw error;
  } finally {
    console.log('\n浏览器将保持打开状态供检查...');
    // await context.close();
    // await browser.close();
  }
}

main().catch(err=>{
  console.error('测试异常:',err);
  process.exit(1);
});
