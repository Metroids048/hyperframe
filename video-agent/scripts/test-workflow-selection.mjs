import test from 'node:test';
import assert from 'node:assert/strict';
import {savedWorkflowSelection} from '../web/workflow-selection.mjs';
import {workflowEntries} from '../lib/creative/workflow-intent.mjs';

test('reopened operations retain the operation over the underlying business',()=>{
  assert.deepEqual(savedWorkflowSelection({workflowProfile:'variant',scenarioId:'product_detail'},workflowEntries),{id:'variant',alias:'versions'});
  assert.deepEqual(savedWorkflowSelection({taskMode:'recut',scenarioId:'product_launch'},workflowEntries),{id:'recut',alias:'recut'});
  assert.deepEqual(savedWorkflowSelection({workflow:{taskMode:'variant'},scenarioId:'product_faq'},workflowEntries),{id:'variant',alias:'versions'});
});
test('ordinary edits restore business while legacy tutorials remain selectable',()=>{
  assert.deepEqual(savedWorkflowSelection({taskMode:'edit',scenarioId:'product_detail'},workflowEntries),{id:'product_detail',alias:'detail'});
  assert.deepEqual(savedWorkflowSelection({scenarioId:'product_howto'},workflowEntries),{id:'product_demo',alias:'demo'});
  assert.deepEqual(savedWorkflowSelection({scenarioId:'unknown'},workflowEntries),{id:'auto',alias:'auto'});
});
