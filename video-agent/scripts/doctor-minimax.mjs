// Read-only by default. --voices queries the account; no paid generation here.
import '../lib/local-env.mjs';
import {ROOT} from '../lib/workflow.mjs';
import {MiniMaxClient,minimaxConfig} from '../lib/edit/adapters/minimax-client.mjs';
import {minimaxCapabilityStatus} from '../lib/edit/adapters/minimax.mjs';
const report={speechEngine:process.env.VIDEO_AGENT_TTS_ENGINE||'kokoro',capabilities:minimaxCapabilityStatus(),liveVerification:'not_run'};
try {
  for(const kind of ['voices','speech','music']) {
    const config=minimaxConfig(kind);
    Object.assign(report.capabilities[kind],{region:config.region,origin:config.origin,model:config.model,credentialKind:config.key.startsWith('sk-api-')?'pay-as-you-go-format':config.key?'unverified':'missing'});
  }
  if(process.argv.includes('--quota')) {
    const config=minimaxConfig('speech');
    if(!config.key)throw new Error('MiniMax未配置');
    const url=config.region==='cn'?'https://www.minimaxi.com/v1/token_plan/remains':'https://api.minimax.io/v1/token_plan/remains';
    const response=await fetch(url,{headers:{Authorization:'Bearer '+config.key},redirect:'error',signal:AbortSignal.timeout(20000)});
    const body=await response.json();
    report.tokenPlan={httpStatus:response.status,providerStatusCode:body.base_resp?.status_code,checkedAt:new Date().toISOString(),resources:[]};
    if(response.ok&&body.base_resp?.status_code===0&&Array.isArray(body.model_remains)) {
      report.tokenPlan.accountHasQueryablePlan=true;
      report.tokenPlan.resources=body.model_remains.map(r=>({resource:r.model_name,intervalRemainingPercent:r.current_interval_remaining_percent,weeklyRemainingPercent:r.current_weekly_remaining_percent,intervalStart:r.start_time,intervalEnd:r.end_time,weeklyStart:r.weekly_start_time,weeklyEnd:r.weekly_end_time}));
    }
    report.tokenPlan.note='套餐额度查询不返回人民币余额，也不证明某次生成请求成功。';
    // Official CLI selects wallet balance for sk-api- credentials. A successful
    // plan query for the same account must not relabel that credential.
    if(config.key.startsWith('sk-api-')) {
      const balanceUrl=(config.region==='cn'?'https://api.minimaxi.com':'https://api.minimax.io')+'/account/query_balance';
      const balanceResponse=await fetch(balanceUrl,{headers:{Authorization:'Bearer '+config.key},redirect:'error',signal:AbortSignal.timeout(20000)});
      const balance=await balanceResponse.json();
      report.payAsYouGo={httpStatus:balanceResponse.status,providerStatusCode:balance.base_resp?.status_code,availableAmount:balance.available_amount??null,cashBalance:balance.cash_balance??null,voucherBalance:balance.voucher_balance??null,creditBalance:balance.credit_balance??null};
    }
  }
  if(process.argv.includes('--voices')) {
    const result=await new MiniMaxClient({root:ROOT}).execute('voices');
    report.voiceCount=result.voices.length;report.voices=result.voices;
    report.capabilities.voices.liveVerification=result.provenance;
    report.liveVerification='voice_catalog_only';
  }
} catch(error) {report.error={code:error.code||'MINIMAX_CONFIG',message:error.message};process.exitCode=1;}
console.log(JSON.stringify(report,null,2));
