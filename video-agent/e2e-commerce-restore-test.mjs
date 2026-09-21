#!/usr/bin/env node
import {chromium} from 'playwright';
import {writeFileSync} from 'fs';

const BASE_URL='http://localhost:3020';

const RESTORE_PROMPT=`保留刚才的新开头、新叙事顺序、新镜头和新讲解字幕。只把第二个特点展示段（细节并排展示）的版式恢复成第一版的单独展示方式，其他地方保持刚才这版，不要把整条视频回滚。`;

async function main(){
  console.log('\n=== 第三轮测试：选择性历史恢复 ===\n');

  const browser=await chromium.launch({headless:false});
  const context=await browser.newContext({viewport:{width:1920,height:1080}});
  const page=await context.newPage();

  try {
    // 1. 访问同一会话页面
    console.log('[步骤1] 访问OpenClaw界面（保持第二轮会话）...');
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // 2. 在同一对话中提交恢复需求
    console.log('[步骤2] 在同一会话提交选择性恢复需求...');
    const textarea=await page.locator('textarea, [contenteditable="true"]').first();
    if(!textarea){
      throw new Error('未找到对话输入框');
    }

    await textarea.fill(RESTORE_PROMPT);
    await page.waitForTimeout(500);

    const submitBtn=await page.locator('button[type="submit"], button:has-text("发送")').first();
    if(!submitBtn){
      throw new Error('未找到提交按钮');
    }

    console.log('[步骤3] 提交恢复请求，监控进度...');
    const startTime=Date.now();
    await submitBtn.click();

    // 3. 监控恢复进度
    console.log('[步骤4] 等待恢复完成（最长3分钟）...');
    let lastProgress='';
    const maxWaitMs=3*60*1000;

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
          console.log(`\n[成功] 恢复完成，耗时: ${elapsed}秒`);

          await page.waitForTimeout(2000);
          await page.screenshot({path:'e2e-test-result-round3.png',fullPage:true});
          console.log('✓ 已保存截图: e2e-test-result-round3.png');

          writeFileSync('e2e-test-status-round3.json',JSON.stringify({
            success:true,
            round:3,
            elapsedSeconds:elapsed,
            timestamp:new Date().toISOString()
          },null,2));

          break;
        }
      }

      const errorText=await page.locator('text=/错误|失败/i').allTextContents();
      if(errorText.length>0){
        throw new Error(`恢复失败: ${errorText.join(', ')}`);
      }
    }

    if(Date.now()-startTime>=maxWaitMs){
      throw new Error('超时：3分钟内未完成恢复');
    }

    console.log('\n[第三轮测试] 通过 ✓');

  } catch(error){
    console.error('\n[测试失败]',error.message);
    await page.screenshot({path:'e2e-test-error-round3.png',fullPage:true});

    writeFileSync('e2e-test-status-round3.json',JSON.stringify({
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
