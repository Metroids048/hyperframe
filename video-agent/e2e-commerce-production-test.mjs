#!/usr/bin/env node
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,existsSync} from 'fs';
import {join,resolve} from 'path';

const BASE_URL='http://localhost:3020';
const MATERIALS_DIR=resolve('assets/commerce-motion');
const TEST_VIDEOS=[
  '01-grind.mp4',
  '02-fill.mp4',
  '03-assemble.mp4',
  '04-extract.mp4',
  '05-pour.mp4',
  '06-finish.mp4'
];

const PRODUCT_PROMPT=`把这些咖啡制作素材制作成一条45秒左右、1080×1920竖屏的咖啡机推广视频。

从原素材中选取6—9个有效镜头，至少使用5个不同的有效源区间。开头3秒用实际咖啡制作画面吸引观看，再展开三个真实的咖啡机特点：精准研磨、专业萃取、快速出品，串起完整的咖啡制作过程，最后做自然的行动引导。

统一字体、配色、版式和运动节奏。至少使用两种真正帮助看清制作过程的视觉设计，例如细节放大与标注、整体和特写分屏、随解说出现的重点信息。转场要服务节奏，不要每个镜头都炫技。

加入自然中文讲解、与讲解对齐的字幕和合适的背景音乐。有人声时音乐降低，咖啡机操作声保留。竖屏不能裁掉关键制作动作和设备细节。

自动制作、检查并交付可播放和下载的新视频，显示真实进度，不要只返回方案。`;

async function main(){
  console.log('启动浏览器测试...');
  const browser=await chromium.launch({headless:false});
  const context=await browser.newContext({viewport:{width:1920,height:1080}});
  const page=await context.newPage();

  try {
    // 1. 访问OpenClaw WebUI
    console.log('\n[步骤1] 访问OpenClaw界面...');
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // 2. 查找上传控件
    console.log('[步骤2] 定位文件上传控件...');
    const uploadInput=await page.locator('input[type="file"]').first();
    if(!uploadInput){
      throw new Error('未找到文件上传控件');
    }

    // 3. 上传6个咖啡视频素材
    console.log('[步骤3] 上传6个咖啡制作素材...');
    const filePaths=TEST_VIDEOS.map(name=>join(MATERIALS_DIR,name));
    await uploadInput.setInputFiles(filePaths);
    await page.waitForTimeout(2000);

    // 4. 查找对话输入框并提交完整需求
    console.log('[步骤4] 提交完整商品视频需求...');
    const textarea=await page.locator('textarea, [contenteditable="true"]').first();
    if(!textarea){
      throw new Error('未找到对话输入框');
    }

    await textarea.fill(PRODUCT_PROMPT);
    await page.waitForTimeout(500);

    // 5. 点击提交按钮
    const submitBtn=await page.locator('button[type="submit"], button:has-text("发送"), button:has-text("提交")').first();
    if(!submitBtn){
      throw new Error('未找到提交按钮');
    }

    console.log('[步骤5] 提交请求，开始监控进度...');
    const startTime=Date.now();
    await submitBtn.click();

    // 6. 监控进度和状态
    console.log('[步骤6] 等待视频制作完成（最长10分钟）...');
    let lastProgress='';
    const maxWaitMs=10*60*1000; // 10分钟

    while(Date.now()-startTime<maxWaitMs){
      await page.waitForTimeout(5000);

      // 检查页面上的进度信息
      const progressText=await page.locator('text=/制作中|处理中|渲染中|已完成|进度/').allTextContents();
      if(progressText.length>0&&progressText[0]!==lastProgress){
        lastProgress=progressText[0];
        console.log(`  进度: ${lastProgress} (已等待${Math.round((Date.now()-startTime)/1000)}秒)`);
      }

      // 检查是否出现视频播放器
      const videoElement=await page.locator('video').count();
      if(videoElement>0){
        console.log('✓ 检测到视频元素');

        // 检查是否有下载链接
        const downloadLink=await page.locator('a[download], a:has-text("下载")').count();
        if(downloadLink>0){
          console.log('✓ 检测到下载链接');

          const elapsed=Math.round((Date.now()-startTime)/1000);
          console.log(`\n[成功] 视频制作完成，总耗时: ${elapsed}秒 (${Math.round(elapsed/60)}分钟)`);

          // 等待视频加载
          await page.waitForTimeout(2000);

          // 截图保存结果
          await page.screenshot({path:'e2e-test-result-round1.png',fullPage:true});
          console.log('✓ 已保存页面截图: e2e-test-result-round1.png');

          // 记录成功
          writeFileSync('e2e-test-status.json',JSON.stringify({
            success:true,
            round:1,
            elapsedSeconds:elapsed,
            timestamp:new Date().toISOString(),
            videoDetected:true,
            downloadLinkDetected:true
          },null,2));

          break;
        }
      }

      // 检查错误信息
      const errorText=await page.locator('text=/错误|失败|Error/i').allTextContents();
      if(errorText.length>0){
        console.error('✗ 检测到错误:', errorText);
        throw new Error(`视频制作失败: ${errorText.join(', ')}`);
      }
    }

    if(Date.now()-startTime>=maxWaitMs){
      throw new Error('超时：10分钟内未完成视频制作');
    }

    console.log('\n[第一轮测试] 通过 ✓');

  } catch(error){
    console.error('\n[测试失败]',error.message);
    await page.screenshot({path:'e2e-test-error.png',fullPage:true});
    console.log('✓ 已保存错误截图: e2e-test-error.png');

    writeFileSync('e2e-test-status.json',JSON.stringify({
      success:false,
      error:error.message,
      timestamp:new Date().toISOString()
    },null,2));

    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(err=>{
  console.error('测试异常:',err);
  process.exit(1);
});
