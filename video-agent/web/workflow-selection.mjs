// Restore the saved operation as well as its underlying business scene.
export function savedWorkflowSelection(request, entries) {
  const candidates = [request.workflowProfile, request.workflow?.workflowProfile,
    request.taskMode, request.workflow?.taskMode, request.scenarioId,
    request.businessContract?.scenarioId];
  for (const value of candidates) {
    const entry = entries.find(item => item.id === value || item.alias === value ||
      (value === 'product_howto' && item.id === 'product_demo'));
    if (entry) return {id: entry.id, alias: entry.alias};
  }
  return {id: 'auto', alias: 'auto'};
}
