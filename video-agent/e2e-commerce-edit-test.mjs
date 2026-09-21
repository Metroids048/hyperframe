#!/usr/bin/env node
import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'fs';

const BASE_URL='http://localhost:3020';

const EDIT_PROMPT=`上一版还太像常规产品介绍。前4秒直接展示真实萃取中的关键动作，不要先放静态研磨画面；把完整制作演示移到第二段，再用细节解释为什么值得关注。

删掉两处信息重复的展示，换成其他真实细节镜头。第二个特点改成整体和细节并排展示，不要编造使用前后效果。

随新顺序重写受影响的讲解，重新对齐字幕，调整相应节奏和音量衔接。

保留咖啡机身份、已确认事实、原来的背景音乐曲目、整体视觉风格、结尾行动引导、时长和竖屏输出。不要把没涉及的部分全部重做。`;

async function main(){
  console.log('\n=== 第二轮测试：实质性重剪辑 ===\n');

  const browser=await chromium.launch({headless:false});
  const context=await browser.newContext({viewport:{width:1920,height:1080}});
  const page=await context.newPage();

  try {
    // 1. 访问同一会话页面
    console.log('[步骤1] 访问OpenClaw界面（保持第一轮会话）...');
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // 2. 在同一对话中提交编辑需求
    console.log('[步骤2] 在同一会话提交实质性重剪辑需求...');
    const textarea=await page.locator('textarea, [contenteditable="true"]').first();
    if(!textarea){
      throw new Error('未找到对话输入框');
    }

    await textarea.fill(EDIT_PROMPT);
    await page.waitForTimeout(500);

    const submitBtn=await page.locator('button[type="submit"], button:has-text("发送")').first();
    if(!submitBtn){
      throw new Error('未找到提交按钮');
    }

    console.log('[步骤3] 提交编辑请求，监控进度...');
    const startTime=Date.now();
    await submitBtn.click();

    // 3. 监控编辑进度
    console.log('[步骤4] 等待编辑完成（最长6分钟）...');
    let lastProgress='';
    const maxWaitMs=6*60*1000;

    while(Date.now()-startTime<maxWaitMs){
      await page.waitForTimeout(5000);

      const progressText=await page.locator('text=/制作中|处理中|渲染中|已完成/').allTextContents();
      if(progressText.length>0&&progressText[0]!==lastProgress){
        lastProgress=progressText[0];
        console.log(`  进度: ${lastProgress} (已等待${Math.round((Date.now()-startTime)/1000)}秒)`);
      }

      // 检查新版本视频
      const videoCount=await page.locator('video').count();
      if(videoCount>0){
        console.log(`✓ 检测到${videoCount}个视频元素`);

        const downloadLinks=await page.locator('a[download]').count();
        if(downloadLinks>0){
          const elapsed=Math.round((Date.now()-startTime)/1000);
          console.log(`\n[成功] 编辑完成，耗时: ${elapsed}秒`);

          await page.waitForTimeout(2000);
          await page.screenshot({path:'e2e-test-result-round2.png',fullPage:true});
          console.log('✓ 已保存截图: e2e-test-result-round2.png');

          writeFileSync('e2e-test-status-round2.json',JSON.stringify({
            success:true,
            round:2,
            elapsedSeconds:elapsed,
            timestamp:new Date().toISOString()
          },null,2));

          break;
        }
      }

      const errorText=await page.locator('text=/错误|失败/i').allTextContents();
      if(errorText.length>0){
        throw new Error(`编辑失败: ${errorText.join(', ')}`);
      }
    }

    if(Date.now()-startTime>=maxWaitMs){
      throw new Error('超时：6分钟内未完成编辑');
    }

    console.log('\n[第二轮测试] 通过 ✓');

  } catch(error){
    console.error('\n[测试失败]',error.message);
    await page.screenshot({path:'e2e-test-error-round2.png',fullPage:true});

    writeFileSync('e2e-test-status-round2.json',JSON.stringify({
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
