import {insist} from './contracts.mjs';

// Budgets are charged against durable evidence, never reset by a retry.
export function inspectionBudget(batches=[],{action=false}={}) {
  const maxBatches=4,maxSheets=24;
  const sheets=batches.reduce((n,b)=>n+(b.records?.length||0),0);
  return {remaining:Math.max(0,maxBatches-batches.length),remainingSheets:Math.max(0,maxSheets-sheets),
    maxBatches,maxSheets,maxRangeSeconds:action?12:30,maxRanges:3};
}
export function assertInspectionBudget(batches,ranges,{action=false}={}) {
  const budget=inspectionBudget(batches,{action});
  const requestedSheets=ranges.reduce((n,r)=>n+Math.ceil((action?Math.ceil((r.endSeconds-r.startSeconds)*4):Math.max(2,Math.ceil(r.endSeconds-r.startSeconds)+1))/(action?16:9)),0);
  insist(budget.remaining>0&&requestedSheets<=budget.remainingSheets,
    `观察预算不足：剩余${budget.remaining}批/${budget.remainingSheets}张证据图，申请${requestedSheets}张；请保留已有证据并缩小观察缺口，这不代表素材缺失`,'OBSERVATION_BUDGET');
  return {...budget,requestedSheets};
}
