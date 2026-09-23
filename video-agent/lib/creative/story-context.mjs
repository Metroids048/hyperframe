const EVIDENCE_RECORD_FIELDS=['id','file','assetId','sourceSha256','sha256','startSeconds','endSeconds','times','batchKey','tool','state','precisionLimitSeconds','continuousPlaybackVerified','reason'];

// Story-plan requests already carry the selected evidence index and its image
// payload. Keep the accumulated inspection ledger as a compact address book so
// the model can avoid repeating work without receiving duplicate observations.
export function compactStoryEvidenceBatches(batches=[]){
  return batches.map(batch=>({
    key:batch.key||null,
    tool:batch.tool||null,
    selectionKey:batch.selectionKey||null,
    records:(batch.records||[]).map(record=>Object.fromEntries(EVIDENCE_RECORD_FIELDS.filter(key=>record[key]!==undefined).map(key=>[key,record[key]])))
  }));
}
