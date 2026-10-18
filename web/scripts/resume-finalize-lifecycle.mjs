import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { decodeFunctionData, keccak256 } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { assessReceipt } from '../qualification.js';

if(process.env.ALLOW_STUDIONET_LIVE_WRITES!=='yes')throw new Error('This resumes one already-created synthetic case and writes only its permissionless finalization. Set ALLOW_STUDIONET_LIVE_WRITES=yes for the authorized Studionet qualification.');
const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const evidenceDir=path.join(appRoot,'evidence');
const proofPath=path.join(evidenceDir,'signed-browser-lifecycle.json');
const proof=JSON.parse(fs.readFileSync(proofPath,'utf8'));
const app={name:'ShiftFair',address:'0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd',url:(process.env.APP_URL||'https://shiftfair-genlayer.vercel.app').replace(/\/+$/,'')};
const RPC='https://studio.genlayer.com/api',CHAIN=61999,CHAIN_HEX='0xf22f';
assert.equal(proof.app,app.name);assert.equal(proof.contract,app.address);assert.equal(proof.chainId,CHAIN);
assert.equal(proof.phase,'BROADCAST_REQUIRES_RECONCILIATION');
const adjudication=proof.transactions.at(-1);
assert.equal(adjudication.action,'adjudicate');assert.equal(adjudication.phase,'BROADCAST_NO_FINALITY');assert.match(adjudication.hash,/^0x[a-fA-F0-9]{64}$/);
const prior=proof.transactions.at(-2);
assert.equal(prior.action,'challenge');
const expectedPrior=prior.uiEvidence.canonicalState;
assert.equal(expectedPrior.status,'CHALLENGED');assert.equal(expectedPrior.round,1);assert.equal(expectedPrior.challenges.length,2);
const client=createClient({chain:studionet});
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const readCase=()=>client.readContract({address:app.address,functionName:'get_case',args:[proof.caseId],transactionHashVariant:TransactionHashVariant.LATEST_FINAL});
const readHistory=()=>client.readContract({address:app.address,functionName:'get_history',args:[proof.caseId],transactionHashVariant:TransactionHashVariant.LATEST_FINAL});

// Reconcile the exact existing broadcast and confirm the current state before any additional write.
const priorReceipt=await client.getTransaction({hash:adjudication.hash});
const priorReceiptEvidence=assessReceipt(priorReceipt,'adjudicate');
const [preflightRaw,preflightHistoryRaw]=await Promise.all([readCase(),readHistory()]);
const preflight=parse(preflightRaw),preflightHistory=parse(preflightHistoryRaw);
assert.equal(preflight.id,proof.caseId);assert.equal(preflight.status,'ASSESSED');assert.equal(preflight.round,2);
assert.equal(preflight.challenges.length,2);assert.equal(preflightHistory.length,2);assert.equal(preflight.finalized_at,0);
const preflightEvidence={hash:adjudication.hash,phase:priorReceiptEvidence.phase,consensus:priorReceiptEvidence.consensus,successfulLeaderExecutions:priorReceiptEvidence.leaders.filter(x=>x.execution_result==='SUCCESS').length,validatorCount:priorReceiptEvidence.validators.length,state:{status:preflight.status,round:preflight.round,verdict:preflight.result,challengeCount:preflight.challenges.length,historyEntries:preflightHistory.length,finalizedAt:preflight.finalized_at}};

const finalizer=privateKeyToAccount(generatePrivateKey());
let broadcast=null,sendUsed=false;
const rpc=async(method,params=[])=>{
 const response=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params}),signal:AbortSignal.timeout(30000)});
 const data=await response.json();if(!response.ok||data.error)throw new Error(`RPC ${method}: ${String(data.error?.message||response.status).slice(0,500)}`);return data.result;
};
const savePending=()=>{if(broadcast)fs.writeFileSync(path.join(evidenceDir,'signed-browser-lifecycle-finalization-broadcast.json'),JSON.stringify({schemaVersion:1,app:app.name,contract:app.address,chainId:CHAIN,caseId:proof.caseId,preflight:preflightEvidence,transaction:broadcast,privateKeysPersisted:false,phase:'BROADCAST_NO_FINALITY'},null,2)+'\n')};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const browserErrors=[];page.on('pageerror',error=>browserErrors.push(String(error.message).slice(0,300)));
try{
 await page.exposeFunction('__walletRequest',async request=>{
  const method=request?.method,params=request?.params||[];
  if(method==='eth_requestAccounts'||method==='eth_accounts')return [finalizer.address];
  if(method==='eth_chainId')return CHAIN_HEX;
  if(method==='wallet_getSnaps'||method==='wallet_requestSnaps')return {};
  if(method==='wallet_switchEthereumChain'||method==='wallet_addEthereumChain')return null;
  if(method==='eth_sendTransaction'){
   if(sendUsed)throw new Error('A second write request is prohibited in this resume run');sendUsed=true;
   const raw=params[0];assert.ok(raw);assert.equal(raw.from.toLowerCase(),finalizer.address.toLowerCase());
   assert.equal(raw.to.toLowerCase(),studionet.consensusMainContract.address.toLowerCase());
   const decoded=decodeFunctionData({abi:studionet.consensusMainContract.abi,data:raw.data});
   assert.equal(decoded.functionName,'addTransaction');
   const [sender,recipient]=decoded.args;assert.equal(String(sender).toLowerCase(),finalizer.address.toLowerCase());assert.equal(String(recipient).toLowerCase(),app.address.toLowerCase());
   const nonce=raw.nonce!==undefined?BigInt(raw.nonce):BigInt(await rpc('eth_getTransactionCount',[finalizer.address,'latest']));
   const gas=raw.gas!==undefined?BigInt(raw.gas):BigInt(await rpc('eth_estimateGas',[raw]));
   const value=BigInt(raw.value??'0x0'),eip1559=raw.type==='0x2'||raw.type===2||raw.maxFeePerGas!==undefined;
   const signed={chainId:CHAIN,nonce:Number(nonce),gas,to:raw.to,data:raw.data,value,type:eip1559?'eip1559':'legacy'};
   if(eip1559){signed.maxFeePerGas=BigInt(raw.maxFeePerGas??await rpc('eth_gasPrice',[]));signed.maxPriorityFeePerGas=BigInt(raw.maxPriorityFeePerGas??'0x0')}
   else signed.gasPrice=BigInt(raw.gasPrice??await rpc('eth_gasPrice',[]));
   const serialized=await finalizer.signTransaction(signed),expectedHash=keccak256(serialized);
   const txHash=await rpc('eth_sendRawTransaction',[serialized]);
   broadcast={action:'finalize_case',signer:finalizer.address,expectedHash,hash:txHash,hashMatchesSignedPayload:txHash.toLowerCase()===expectedHash.toLowerCase(),phase:'BROADCAST_NO_FINALITY',to:raw.to,contractRecipient:app.address,nonce:Number(nonce),calldataSha256:createHash('sha256').update(Buffer.from(raw.data.slice(2),'hex')).digest('hex')};
   savePending();console.log(`SIGNED_BROADCAST ShiftFair finalize_case ${txHash}`);
   assert.equal(broadcast.hashMatchesSignedPayload,true);
   return txHash;
  }
  if(typeof method==='string'&&method.startsWith('eth_'))return rpc(method,params);
  throw new Error(`Unsupported provider request ${String(method)}`);
 });
 await page.addInitScript(()=>{
  const handlers=new Map();
  window.ethereum={isMetaMask:true,isConnected:()=>true,networkVersion:'61999',request:req=>window.__walletRequest(req),on:(event,handler)=>{const list=handlers.get(event)||[];list.push(handler);handlers.set(event,list)},removeListener:()=>{}};
 });
 await page.route('**/*',async route=>{
  if(route.request().url().startsWith(RPC)){
   const req=route.request(),cors={'access-control-allow-origin':'*','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type,authorization','content-type':'application/json'};
   if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:cors,body:''});return}
   const response=await fetch(RPC,{method:req.method(),headers:{'content-type':'application/json'},body:req.postDataBuffer(),signal:AbortSignal.timeout(30000)});
   await route.fulfill({status:response.status,headers:{...cors,'content-type':response.headers.get('content-type')||'application/json'},body:Buffer.from(await response.arrayBuffer())});return;
  }
  await route.continue();
 });
 await page.goto(`${app.url}/#on-chain`,{waitUntil:'domcontentloaded',timeout:60000});
 assert.equal(await page.evaluate(()=>window.CONTRACT_ADDRESS),app.address);assert.equal(await page.evaluate(()=>window.RELEASE_QUALIFIED),true);

 // Restore the missing hash from the wallet's saved broadcast record and verify it through the real UI.
 const storageKey=`genlayer-pending-${app.address.toLowerCase()}`;
 await page.evaluate(({key,hash,caseId,prev,wallet,attestor})=>localStorage.setItem(key,JSON.stringify({hash:'',stage:'SIGNING_OR_UNKNOWN_BROADCAST',action:'adjudicate',caseId,prev,wallet,attestor})),{key:storageKey,hash:adjudication.hash,caseId:proof.caseId,prev:expectedPrior,wallet:adjudication.signer,attestor:expectedPrior.attestor});
 await page.locator('#chain-case-id').fill(proof.caseId);
 await page.locator('#chain-resume-hash').fill(adjudication.hash);
 await page.locator('#chain-resume').click();
 await page.waitForFunction(hash=>{const output=document.querySelector('#chain-output')?.textContent||'';return output.includes('VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE')||output.includes(`Transaction ${hash} is not verified.`)},adjudication.hash,{timeout:60000});
 const recoveredOutput=await page.locator('#chain-output').innerText();
 if(!recoveredOutput.includes('VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE'))throw new Error(`The previously broadcast adjudication remains unverified: ${recoveredOutput.slice(0,1000)}`);
 const recovered=JSON.parse(recoveredOutput);assert.equal(recovered.transaction,adjudication.hash);assert.equal(recovered.action,'adjudicate');assert.equal(recovered.case.status,'ASSESSED');assert.equal(recovered.case.round,2);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),storageKey),null,'App must clear the exact-hash lock only after verified execution and canonical state');

 // Repeat preflight immediately before the one new, permissionless finalization write.
 const freshPreflight=parse(await readCase());
 assert.equal(freshPreflight.status,'ASSESSED');assert.equal(freshPreflight.round,2);assert.equal(freshPreflight.finalized_at,0);assert.equal(freshPreflight.challenges.length,2);
 await page.locator('#chain-wallet').click();
 await page.waitForFunction(address=>document.querySelector('#chain-wallet-info')?.textContent.includes(address),finalizer.address,{timeout:20000});
 await page.locator('#chain-case-id').fill(proof.caseId);
 await page.locator('#chain-action').selectOption('finalize_case');
 await page.locator('#chain-execute').click({timeout:30000});
 await page.waitForFunction(()=>{const output=document.querySelector('#chain-output')?.textContent||'';return output.includes('VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE')||output.includes('Submission ')},null,{timeout:600000});
 let uiOutput=await page.locator('#chain-output').innerText();
 if(!uiOutput.includes('VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE')){
  assert.ok(broadcast?.hash,'No signed finalization hash exists to resume');
  await page.locator('#chain-resume-hash').fill(broadcast.hash);
  await page.locator('#chain-resume').click();
  await page.waitForFunction(hash=>{const output=document.querySelector('#chain-output')?.textContent||'';return output.includes('VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE')||output.includes(`Transaction ${hash} is not verified.`)},broadcast.hash,{timeout:60000});
  uiOutput=await page.locator('#chain-output').innerText();
 }
 if(!uiOutput.includes('VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE'))throw new Error(`Exact-hash finalization recovery failed: ${uiOutput.slice(0,1000)}`);
 const finalUi=JSON.parse(uiOutput);assert.equal(finalUi.transaction,broadcast.hash);assert.equal(finalUi.action,'finalize_case');assert.equal(finalUi.case.status,'FINALIZED');assert.equal(finalUi.case.round,2);

 // Independent receipt and latest-final canonical readback after the UI reports success.
 const finalTx=await client.getTransaction({hash:broadcast.hash});
 const finalReceipt=assessReceipt(finalTx,'finalize_case');
 const [stateRaw,historyRaw]=await Promise.all([readCase(),readHistory()]);
 const finalState=parse(stateRaw),history=parse(historyRaw);
 assert.equal(finalState.id,proof.caseId);assert.equal(finalState.status,'FINALIZED');assert.equal(finalState.round,2);
 assert.equal(finalState.result,freshPreflight.result);assert.equal(finalState.challenges.length,2);assert.equal(history.length,2);
 assert.equal(finalState.approved_minutes,finalState.provisional_approved_minutes,'Finalization must preserve the provisional amount');
 assert.deepEqual(browserErrors,[],'Browser runtime must have no uncaught errors');

 const recovery={action:adjudication.action,hash:adjudication.hash,initialError:proof.error||null,uiVerified:true,receipt:{phase:priorReceiptEvidence.phase,consensus:priorReceiptEvidence.consensus,successfulLeaderExecutions:priorReceiptEvidence.leaders.filter(x=>x.execution_result==='SUCCESS').length,validatorCount:priorReceiptEvidence.validators.length},canonicalState:recovered.case};
 adjudication.phase='VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE';
 adjudication.receipt={phase:priorReceiptEvidence.phase,consensus:priorReceiptEvidence.consensus,successfulLeaderExecutions:priorReceiptEvidence.leaders.filter(x=>x.execution_result==='SUCCESS').length,validatorCount:priorReceiptEvidence.validators.length};
 adjudication.uiEvidence={action:'adjudicate',phase:recovered.phase,consensus:recovered.consensus,successfulLeaderExecutions:recovered.genvmLeaders,independentValidators:recovered.independentValidators,canonicalState:recovered.case,historyEntries:recovered.history.length};
 proof.recoveries=[...(proof.recoveries||[]),recovery];
 proof.steps.push({action:'adjudicate',hash:adjudication.hash,state:recovered.case});
 broadcast.phase='VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE';
 broadcast.receipt={phase:finalReceipt.phase,consensus:finalReceipt.consensus,successfulLeaderExecutions:finalReceipt.leaders.filter(x=>x.execution_result==='SUCCESS').length,validatorCount:finalReceipt.validators.length};
 broadcast.uiEvidence={action:'finalize_case',phase:finalUi.phase,consensus:finalUi.consensus,successfulLeaderExecutions:finalUi.genvmLeaders,independentValidators:finalUi.independentValidators,canonicalState:finalState,historyEntries:history.length};
 proof.transactions.push(broadcast);
 proof.steps.push({action:'finalize_case',hash:broadcast.hash,state:finalState});
 proof.terminal={exists:true,status:finalState.status,verdict:finalState.result,round:finalState.round,state:finalState};
 proof.phase='VERIFIED_FULL_BROWSER_LIFECYCLE_AFTER_EXACT_HASH_RECOVERY';
 proof.finalizerAddress=finalizer.address;
 proof.privateKeysPersisted=false;
 proof.browserErrors=browserErrors;
 proof.verifiedAt=new Date().toISOString();
 proof.error=proof.error||'Initial round-two adjudication UI response was uncertain; exact saved hash was reconciled and verified before finalization.';
 fs.writeFileSync(proofPath,JSON.stringify(proof,null,2)+'\n');
 fs.writeFileSync(path.join(evidenceDir,'signed-browser-lifecycle-resumption.json'),JSON.stringify({schemaVersion:1,verifiedAt:new Date().toISOString(),app:app.name,url:app.url,contract:app.address,chainId:CHAIN,caseId:proof.caseId,preflight:preflightEvidence,adjudicationRecovery:recovery,finalization:{...broadcast,uiVerified:true},terminal:{status:finalState.status,verdict:finalState.result,round:finalState.round,challengeCount:finalState.challenges.length,historyEntries:history.length},privateKeysPersisted:false},null,2)+'\n');
 await page.screenshot({path:path.join(evidenceDir,'signed-browser-lifecycle.png'),fullPage:true});
 console.log(JSON.stringify({result:'PASS',caseId:proof.caseId,adjudicationRecovery:adjudication.hash,finalizationHash:broadcast.hash,terminal:{status:finalState.status,verdict:finalState.result,round:finalState.round,challengeCount:finalState.challenges.length,historyEntries:history.length},privateKeysPersisted:false},null,2));
}catch(error){
 if(broadcast){broadcast.lastError=String(error?.message||error).slice(0,1200);savePending()}
 throw error;
}finally{await page.close().catch(()=>{});await browser.close().catch(()=>{})}
