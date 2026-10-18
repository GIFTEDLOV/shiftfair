import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { assessReceipt } from '../qualification.js';

const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const proofPath=path.join(appRoot,'evidence','signed-browser-lifecycle.json');
const outputPath=path.join(appRoot,'evidence','signed-browser-lifecycle-readback.json');
const proof=JSON.parse(fs.readFileSync(proofPath,'utf8'));
assert.equal(proof.app,'ShiftFair');
assert.equal(proof.contract,'0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd');
assert.equal(proof.chainId,61999);
assert.equal(proof.privateKeysPersisted,false);
assert.ok(['VERIFIED_FULL_BROWSER_LIFECYCLE','VERIFIED_FULL_BROWSER_LIFECYCLE_AFTER_EXACT_HASH_RECOVERY'].includes(proof.phase));
assert.equal(proof.transactions.length,10);

const client=createClient({chain:studionet});
const receipts=[];
for(const item of proof.transactions){
 const tx=await client.getTransaction({hash:item.hash});
 const evidence=assessReceipt(tx,item.action);
 receipts.push({action:item.action,hash:item.hash,phase:evidence.phase,consensus:evidence.consensus,successfulLeaderExecutions:evidence.leaders.filter(x=>x.execution_result==='SUCCESS').length,validatorCount:evidence.validators.length});
}
const [rawState,rawHistory]=await Promise.all([
 client.readContract({address:proof.contract,functionName:'get_case',args:[proof.caseId],transactionHashVariant:TransactionHashVariant.LATEST_FINAL}),
 client.readContract({address:proof.contract,functionName:'get_history',args:[proof.caseId],transactionHashVariant:TransactionHashVariant.LATEST_FINAL})
]);
const state=typeof rawState==='string'?JSON.parse(rawState):rawState;
const history=typeof rawHistory==='string'?JSON.parse(rawHistory):rawHistory;
assert.equal(state.id,proof.caseId);
assert.equal(state.status,'FINALIZED');
assert.equal(state.round,2);
assert.equal(state.challenges.length,2);
assert.equal(history.length,2);
assert.equal(state.result,proof.terminal.verdict);
const result={schemaVersion:1,verifiedAt:new Date().toISOString(),verification:'independent post-run GenLayerJS 1.1.8 Studionet read',app:proof.app,contract:proof.contract,chainId:proof.chainId,caseId:proof.caseId,receiptCount:receipts.length,receipts,canonical:{status:state.status,verdict:state.result,round:state.round,challengeCount:state.challenges.length,historyEntries:history.length,creator:state.creator,recipient:state.recipient,attestor:state.attestor,finalizedAt:state.finalized_at},syntheticQualificationOnly:true,privateKeysPersisted:false};
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify(result,null,2)+'\n');
