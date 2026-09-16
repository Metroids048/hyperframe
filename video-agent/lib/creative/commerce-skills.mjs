import {createHash} from 'node:crypto';
import {recoveryDecision} from './workflow-gates.mjs';

// Project planning contracts, not external services or grants of tool authority.
const definitions = [
  ['general','general','明确的通用剪辑、章节或角标包装','需要未实现能力或暂停的新视觉生成', ['拆解为已有受控操作','观察真实源窗口与必要动作','继承主/辅助目的和保持项','绑定可编辑对象与资源','检查实际目标变化及保持差异'], '未知能力明确未实现；不默认上新，不增加工具权限，不用二维包装冒充三维重建。', ['可编辑章节','角标','受控剪接','声音与字幕']],
  ['product_launch','launch','让初次接触者认识商品','完整教学或具体问答', ['核验同款和可信重点','选择整体、细节、真实使用和收尾','按有效信息减少表达'], '缺性能资料不写性能；必须真实使用却缺片时请求具体源片，不能静图冒充。', ['主体容器','轻标题','片尾']],
  ['product_detail','detail','解释结构、部位或有依据的特性','无证据的性能推销', ['绑定主张、证据和部位','定位整体与局部源区间','检查标注稳定性','测量旁白并放入证据窗口','装配标注并检查实际成片'], '跟踪不可靠时仅可明确采用稳定镜头或冻结帧；明确要求跟踪时不得用静态箭头冒充。', ['整体局部联动','标注','字幕']],
  ['product_demo','procedure','按步骤理解开箱、安装或使用','只有外观展示且没有过程要求', ['区分开箱安装使用子类型','建立必要步骤依赖和源区间','保护连续动作与源声','先删等待再排步骤','检查起始状态与完成状态'], '缺必要步骤不能计完整教程正例；时长不够不能删必要动作或加速动作迁就旁白。', ['步骤条','保护区','源声同步']],
  ['product_collection','collection','解释多款或搭配关系','单款不涉及组合关系', ['按商品身份分组','确认比较条件','分配各款曝光','从单款到群像'], '不借另一款镜头或事实补缺；删款或改变组合须符合明确要求。', ['网格','分屏','身份标签']],
  ['product_promotion','campaign','说明活动条件时间和行动','未提供活动目的', ['核验必要活动字段','明确价格可选性','排列主题条件行动','核对屏幕与旁白一致','检查条件可读性'], '允许无价格预告；必要日期入口缺失只问缺项，不编造或缩小条件字。', ['日期','条件','行动提示']],
  ['product_faq','evidence_qa','回答具体选购或场景问题','没有具体问题的品牌亮相', ['确定问题与证据边界','先给可证实答案','组织证据和限制','需操作证明时组合procedure流程'], '缺规格或测试不编性能；不能偷换为上新口号。', ['问题卡','证据定位','限制说明']],
  ['recut','recut','保持原意并删冗余','明确另做一条全新作品', ['读取母版业务目的','识别关键内容等待重复与声音上下文','受控剪接','比较删留与原声同步'], 'MP4可剪源片和添加可编辑包装；不能承诺恢复烧录字幕或混合音轨的原分层。', ['受控剪接','字幕','声音']],
  ['variant','variant','基于母版制作用途或画幅变体','没有可定位母版', ['锁定基准与变化保持集','建立独立版本分支','重算主体和文字布局','比较母版与派生内容'], '中心裁切损害主体动作时改源段、分区或保全主体；不得破坏母版或静默降低目标。', ['重框','分区','开头变体']],
];
export const commerceSkills = Object.fromEntries(definitions.map(([scenario,name,trigger,exclude,order,fallback,resources]) => {
  const contract={id:'commerce.'+name,version:1,scenario,trigger,exclude,
    inputs:['原需求','业务目的','操作模式','基准工程与版本','素材范围','确认事实','声音要求','目标与保持对象','缺项'],
    preflight:['目标对象存在且属于基准版本','素材源区间真实有效','事实与必要动作有证据','声音授权和依赖可用'],
    callOrder:order,resourceContract:{functions:resources,pipeline:['功能需求','共用目录召回','素材画幅文字动作依赖过滤','按block或component执行器绑定','局部预览','主工程']},
    preserve:['未要求改变的对象与事实','源时间与声音关联','母版和已提交历史'],
    failureClasses:['missing_evidence','ambiguous_target','unsupported_capability','resource_incompatible','provider_unavailable','quality_failure'],
    nextAction:fallback,outputs:['结构化制作单','源区间与资源回执','原生版本','候选与检查证据'],
    acceptance:['实际目标变化与保持项比对','最终音画字幕窗口核对','降级不自动计质量通过']};
  return [scenario,{...contract,hash:createHash('sha256').update(JSON.stringify(contract)).digest('hex')}];
}));

export function commerceSkillContext(scenario,mode='create',workflow={}) {
  const selected=[commerceSkills[scenario],...(workflow.auxiliaryScenarios||[]).map(id=>commerceSkills[id]),...([...new Set([mode,...(workflow.auxiliaryModes||[])])].filter(m=>['recut','variant'].includes(m)).map(m=>commerceSkills[m]))].filter(Boolean);
  return {version:1,skills:[...new Map(selected.map(s=>[s.id,s])).values()],genericEdit:mode==='edit',
    fallback:'明确编辑直接受控执行；未知业务不得默认上新；真正歧义先读当前工程，再只问最小缺项。供应商故障保留版本和声音，不自动换供应商；指定效果失败不偷换。'};
}

export function failureReceipt(error,{request='',revisionId=null,requirements=[],publishedRevisionId=null}={}) {
  const code=error.code||'INTERNAL_ERROR';
  const category=/^(?:MINIMAX_|CODEX_|PROVIDER_)/.test(code)?'provider_unavailable':/MISSING|NEEDS_INPUT|INSUFFICIENT/.test(code)?'missing_evidence':/SCOPE|TARGET|CONFLICT/.test(code)?'ambiguous_target':/UNSUPPORTED|CAPABILITY/.test(code)?'unsupported_capability':'quality_failure';
  return {version:2,code,category,recovery:recoveryDecision({code}),reason:error.message,originalRequest:request,requirements,baseRevisionId:revisionId,
    actualAction:publishedRevisionId?'版本已保存，后续阶段失败；保留该候选与上一版本':'保留上一有效版本；本次未发布修改',publishedRevisionId,preserved:['工程','已有音轨','素材','历史'],goalReduced:false,qualityAccepted:false,
    nextAction:code==='MINIMAX_SUBMISSION_UNKNOWN'?'核对供应商记录；不得盲目重新提交':category==='missing_evidence'?'只补缺失对象或证据后恢复':category==='provider_unavailable'?'修复对应账户配置或供应商状态后恢复；不自动替换供应商':'定位失败对象，执行最小修复后重新检查'};
}
