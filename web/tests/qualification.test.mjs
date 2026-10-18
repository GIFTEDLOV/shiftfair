import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { assessReceipt, canPerform, CASE_REGISTRY_PAGE_SIZE, expectedStatusAfterAction, shouldCancelRegistryRead, verifyAuditHistory, waitForFinalizedExecution } from '../qualification.js';
const actorA='0x'+'a'.repeat(40), actorB='0x'+'b'.repeat(40), attestor='0x'+'c'.repeat(40);
test('every signed lifecycle action has a canonical post-transaction status, including counterparty consent',()=>{
 assert.deepEqual(['create_case','consent','freeze','submit_evidence','attest_evidence','adjudicate','challenge','finalize_case'].map(expectedStatusAfterAction),['DRAFT','DRAFT','FROZEN','EVIDENCE_LOCKED','ATTESTED','ASSESSED','CHALLENGED','FINALIZED']);
 assert.equal(expectedStatusAfterAction('unknown_action'),null);
});
test('canonical registry pages stay within RPC limits and stale reads stop before wallet actions',()=>{
 assert.equal(CASE_REGISTRY_PAGE_SIZE,10);
 assert.equal(shouldCancelRegistryRead(2,3,'Cases'),true);
 assert.equal(shouldCancelRegistryRead(3,3,'On-chain'),true);
 assert.equal(shouldCancelRegistryRead(3,3,'Cases'),false);
});
test('receipt success requires finalized majority, a successful GenVM leader, and validators for semantic decisions',()=>{
 const tx={statusName:'FINALIZED',result_name:'MAJORITY_AGREE',consensus_data:{leader_receipt:[{execution_result:'SUCCESS'},{execution_result:'ERROR',genvm_result:{stderr:'Validator execution cancelled after quorum'}}],validators:[{vote:'AGREE'}]}};
 assert.equal(assessReceipt(tx,'adjudicate').phase,'FINALIZED');
 assert.throws(()=>assessReceipt({...tx,result_name:'MAJORITY_DISAGREE'},'adjudicate'));
 assert.throws(()=>assessReceipt({...tx,consensus_data:{...tx.consensus_data,leader_receipt:[{execution_result:'ERROR'}]}},'adjudicate'));
 assert.throws(()=>assessReceipt({...tx,consensus_data:{leader_receipt:[{execution_result:'SUCCESS'}],validators:[]}},'adjudicate'));
 assert.doesNotThrow(()=>assessReceipt({...tx,consensus_data:{leader_receipt:[{execution_result:'SUCCESS'}],validators:[]}},'challenge'));
});
test('browser reconciliation retries reads and checks full transaction receipt details',async()=>{
 const hash='0x'+'d'.repeat(64);
 const transaction={statusName:'FINALIZED',resultName:'MAJORITY_AGREE',consensus_data:{leader_receipt:[{execution_result:'SUCCESS'},{execution_result:'ERROR',genvm_result:{stderr:'Validator execution cancelled after quorum'}}],validators:[{vote:'AGREE'}]}};
 const calls=[];
 const states=[new Error('temporary 502 gateway response'),{statusName:'ACCEPTED'},transaction];
 const evidence=await waitForFinalizedExecution({getTransaction:async args=>{calls.push(args);const next=states.shift();if(next instanceof Error)throw next;return next}},hash,'create_case',{attempts:3,interval:0});
 assert.deepEqual(calls,[{hash},{hash},{hash}]);
 assert.equal(evidence.transaction,transaction);
 assert.equal(evidence.phase,'FINALIZED');
 assert.equal(evidence.consensus,'MAJORITY_AGREE');
 assert.equal(evidence.leaders.length,2);
 assert.equal(evidence.validators.length,1);
});
test('browser reconciliation rejects finality without GenVM execution evidence',async()=>{
 await assert.rejects(waitForFinalizedExecution({getTransaction:async()=>({statusName:'FINALIZED',resultName:'MAJORITY_AGREE'})},'0x'+'e'.repeat(64),'create_case',{attempts:1,interval:0}));
});
test('each party may use one challenge slot; first challenge cannot preempt the response window',()=>{
 const record={status:'CHALLENGED',round:1,last_at:1000,creator:actorA,recipient:actorB,challenges:[{actor:actorA}]};
 assert.equal(canPerform('challenge',record,actorA,1001),false);
 assert.equal(canPerform('challenge',record,actorB,1001),true);
 assert.equal(canPerform('adjudicate',record,actorA,1001),false);
 assert.equal(canPerform('adjudicate',record,actorA,1000+86401),true);
 assert.equal(canPerform('adjudicate',{...record,challenges:[...record.challenges,{actor:actorB}]},actorB,1001),true);
});
test('role and transition checks match the three-party contract model',()=>{
 const draft={status:'DRAFT',creator:actorA,recipient:actorB,consented:false,attestor};
 assert.equal(canPerform('consent',draft,actorB,0),true);
 assert.equal(canPerform('consent',draft,actorA,0),false);
 assert.equal(canPerform('freeze',{...draft,consented:true},actorA,0),true);
 assert.equal(canPerform('attest_evidence',{status:'EVIDENCE_LOCKED',attestor},attestor,0),true);
});
test('first round finalization waits for response deadline; second round can finalize',()=>{
 const first={status:'ASSESSED',round:1,last_at:1000};
 assert.equal(canPerform('finalize_case',first,actorA,1001),false);
 assert.equal(canPerform('finalize_case',first,actorA,87401),true);
 assert.equal(canPerform('finalize_case',{...first,round:2},actorA,1001),true);
});
test('audit history validates canonical SHA-256 and previous-hash links',async()=>{
 const hash=async text=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(text))).toString('hex');
 const one={round:1,vector:{z:true,a:false},verdict:'UNRESOLVED',binding_sha256:'b'.repeat(64),at:10,prev:''};
 one.entry_hash=await hash(JSON.stringify({at:10,binding_sha256:'b'.repeat(64),prev:'',round:1,vector:{a:false,z:true},verdict:'UNRESOLVED'}));
 const two={round:2,vector:{z:true,a:true},verdict:'SUPPORTED',binding_sha256:'c'.repeat(64),at:20,prev:one.entry_hash};
 two.entry_hash=await hash(JSON.stringify({at:20,binding_sha256:'c'.repeat(64),prev:one.entry_hash,round:2,vector:{a:true,z:true},verdict:'SUPPORTED'}));
 assert.deepEqual(await verifyAuditHistory([one,two]),{valid:true,entries:2});
 assert.equal((await verifyAuditHistory([one,{...two,prev:'0'.repeat(64)}])).valid,false);
});
