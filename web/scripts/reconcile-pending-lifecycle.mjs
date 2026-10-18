import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { assessReceipt } from '../qualification.js';

const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const proofPath=path.join(appRoot,'evidence','signed-browser-lifecycle.json');
const outputPath=path.join(appRoot,'evidence','signed-browser-lifecycle-reconciliation.json');
const proof=JSON.parse(fs.readFileSync(proofPath,'utf8'));
const pending=[...proof.transactions].reverse().find(item=>item.phase==='BROADCAST_NO_FINALITY');
if(!pending?.hash)throw new Error('No exact saved broadcast hash requires reconciliation');
const client=createClient({chain:studionet});
const result={schemaVersion:1,checkedAt:new Date().toISOString(),verification:'read-only reconciliation of the exact saved broadcast hash',app:'ShiftFair',contract:proof.contract,chainId:proof.chainId,caseId:proof.caseId,action:pending.action,hash:pending.hash,receiptRead:null,canonicalRead:null};
try{
 const tx=await client.getTransaction({hash:pending.hash});
 const leaders=tx?.consensus_data?.leader_receipt||[];
 const validators=tx?.consensus_data?.validators||[];
 let assessment='NOT_FINALIZED';
 if((tx?.statusName??tx?.status_name)==='FINALIZED'){
  try{assessReceipt(tx,pending.action);assessment='PASS'}catch(error){assessment=`FAIL: ${String(error?.message||error)}`}
 }
 result.receiptRead={status:tx?.statusName??tx?.status_name??null,consensus:tx?.resultName??tx?.result_name??null,executionResult:tx?.execution_result??null,assessment,leaderExecutions:leaders.map(entry=>({execution_result:entry.execution_result,stderr:String(entry?.genvm_result?.stderr||'').slice(0,1200)})),validatorCount:validators.length};
}catch(error){result.receiptError=String(error?.shortMessage||error?.message||error).slice(0,1600)}
try{
 const [rawState,rawHistory]=await Promise.all([
  client.readContract({address:proof.contract,functionName:'get_case',args:[proof.caseId],transactionHashVariant:TransactionHashVariant.LATEST_FINAL}),
  client.readContract({address:proof.contract,functionName:'get_history',args:[proof.caseId],transactionHashVariant:TransactionHashVariant.LATEST_FINAL})
 ]);
 const state=typeof rawState==='string'?JSON.parse(rawState):rawState;
 const history=typeof rawHistory==='string'?JSON.parse(rawHistory):rawHistory;
 result.canonicalRead={status:state?.status??null,round:state?.round??null,verdict:state?.result??null,challengeCount:Array.isArray(state?.challenges)?state.challenges.length:null,historyEntries:Array.isArray(history)?history.length:null,caseId:state?.id??null,finalizedAt:state?.finalized_at??null};
}catch(error){result.canonicalError=String(error?.shortMessage||error?.message||error).slice(0,1600)}
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify(result,null,2)+'\n');
