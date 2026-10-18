import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const project=path.basename(path.resolve(root,'..')).toLowerCase();
const config={parcelcourt:{expectedAddress:'0xC0B3De8897015a9aAfDc06EB4d09FD2F4d62BA72',port:4180,label:'ParcelCourt'},shiftfair:{expectedAddress:'0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd',port:4181,label:'ShiftFair'}}[project];
assert.ok(config,`Unsupported project folder: ${project}`);
const {expectedAddress,port,label}=config;
const base=process.env.APP_URL?.replace(/\/+$/,'')||`http://127.0.0.1:${port}`;
const useLocalPreview=!process.env.APP_URL;
const evidenceDir=path.resolve(root,'..','evidence');
const signedProof=JSON.parse(fs.readFileSync(path.join(evidenceDir,'browser-signed-live.json'),'utf8'));
assert.equal(signedProof.app,label,'Signed browser evidence belongs to this app');
assert.equal(signedProof.contract,expectedAddress,'Signed browser evidence matches the bound contract');
assert.equal(signedProof.chainId,61999,'Signed browser evidence matches Studionet');
assert.equal(signedProof.phase,'VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE');
assert.equal(signedProof.keyPersisted,false,'Ephemeral test key must not be persisted');
assert.equal(signedProof.hashMatchesSignedPayload,true,'Broadcast hash must match the ephemeral signer payload');
assert.equal(signedProof.receipt.phase,'FINALIZED');
assert.equal(signedProof.receipt.consensus,'MAJORITY_AGREE');
assert.ok(signedProof.receipt.successfulLeaderExecutions>0);
assert.ok(signedProof.receipt.validatorCount>0);
const signedTx=signedProof.transactions.find(item=>item.method==='create_case'&&item.broadcastHash);
assert.ok(signedTx,'A real signed transaction hash is required');
const server=useLocalPreview?spawn(process.execPath,[path.join(root,'node_modules','vite','bin','vite.js'),'preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'}):null;
let browser;
try{
 let ready=!useLocalPreview;
 if(useLocalPreview){
  for(let n=0;n<80;n++){
   try{const response=await fetch(base);if(response.ok){ready=true;break}}catch{}
   await delay(250);
  }
 }else{
  const response=await fetch(base,{signal:AbortSignal.timeout(30000)});
  assert.ok(response.ok,`Production app request failed with HTTP ${response.status}`);
 }
 assert.equal(ready,true,'Vite preview failed to start');
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
const state={account:signedProof.form.creator,other:'0x'+'c'.repeat(40),chain:'0x1',rejectAccounts:false,rejectSend:false,requests:[]};
 await page.exposeFunction('__walletRequest',async request=>{
  state.requests.push(request.method);
  if(request.method==='eth_requestAccounts'||request.method==='eth_accounts'){
   if(state.rejectAccounts&&request.method==='eth_requestAccounts'){
    state.rejectAccounts=false;
    return {__error:{code:4001,message:'User rejected the wallet request'}};
   }
   return [state.account];
  }
  if(request.method==='eth_chainId')return state.chain;
  if(request.method==='eth_sendTransaction'){state.requests.push('browser-signature-request');return {__error:{code:4001,message:'User rejected the transaction signature'}};}
  if(request.method==='wallet_getSnaps'||request.method==='wallet_requestSnaps')return {};
  if(request.method==='wallet_switchEthereumChain'||request.method==='wallet_addEthereumChain')return null;
  return {__error:{code:-32601,message:`Unexpected provider method ${request.method}`}};
 });
 await page.addInitScript(()=>{
  const handlers=new Map();
  window.ethereum={isMetaMask:true,isConnected:()=>true,selectedAddress:null,networkVersion:'61999',
   request:async request=>{const result=await window.__walletRequest(request);if(result?.__error){const error=new Error(result.__error.message);error.code=result.__error.code;throw error}return result},
   on:(event,fn)=>{const listeners=handlers.get(event)||[];listeners.push(fn);handlers.set(event,listeners)},removeListener:()=>{}};
  window.__emitWalletEvent=(event,value)=>{for(const listener of handlers.get(event)||[])listener(value)};
 });
 await page.goto(`${base}/#on-chain`,{waitUntil:'domcontentloaded'});
 assert.equal(await page.evaluate(()=>window.CONTRACT_ADDRESS),expectedAddress,'Incorrect ParcelCourt deployment binding');
 assert.equal(await page.evaluate(()=>window.RELEASE_QUALIFIED),true,'Public wallet controls require completed signed live qualification');
 assert.equal(await page.locator('#chain-execute').isDisabled(),false,'Qualified wallet write control should be available');

 state.rejectAccounts=true;
 await page.locator('#chain-wallet').click();
 await page.waitForFunction(()=>document.querySelector('#chain-output')?.textContent.includes('User rejected the wallet request'));
 assert.equal(await page.locator('#chain-wallet-info').innerText(),'Wallet not connected');

 await page.locator('#chain-wallet').click();
 await page.waitForFunction(()=>document.querySelector('#chain-output')?.textContent.includes('Wrong network: 1; expected Studionet 61999'));
 assert.match(await page.locator('#chain-wallet-info').innerText(),/Wrong chain; expected Studionet 61999/);

 state.chain='0xf22f';
 await page.locator('#chain-wallet').click();
 await page.waitForFunction(address=>document.querySelector('#chain-wallet-info')?.textContent.includes(address),state.account);
 await page.evaluate(address=>window.__emitWalletEvent('accountsChanged',[address]),state.other);
 await page.waitForFunction(()=>document.querySelector('#chain-wallet-info')?.textContent.includes('account changed'));
 assert.match(await page.locator('#chain-wallet-info').innerText(),/Reconnect required/);

 await page.locator('#chain-wallet').click();
 await page.waitForFunction(address=>document.querySelector('#chain-wallet-info')?.textContent.includes(address),state.account);
 await page.evaluate(()=>window.__emitWalletEvent('chainChanged','0x1'));
 await page.waitForFunction(()=>document.querySelector('#chain-wallet-info')?.textContent.includes('network changed'));
 assert.match(await page.locator('#chain-wallet-info').innerText(),/Reconnect to Studionet/);
 assert.equal(state.requests.some(method=>method==='eth_sendTransaction'||method==='eth_sendRawTransaction'),false,'No provider write is allowed in wallet-state tests');

 await page.setViewportSize({width:390,height:844});
 const mobile=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,navClient:document.querySelector('.sidebar nav').clientWidth,navScroll:document.querySelector('.sidebar nav').scrollWidth}));
 assert.equal(mobile.document,mobile.viewport,'Mobile document must not overflow horizontally');
 assert.equal(mobile.body,mobile.viewport,'Mobile body must not overflow horizontally');
 assert.ok(mobile.navScroll>=mobile.navClient,'Mobile navigation remains available in its scroll container');
 assert.equal(await page.locator('.sidebar nav .nav-label').first().isVisible(),true,'Mobile navigation labels must remain visible and accessible');
 assert.deepEqual(errors,[],'Browser JavaScript errors');
 const signingPage=await browser.newPage({viewport:{width:1440,height:900}});
 signingPage.on('pageerror',error=>errors.push(error.message));
 const rpcMethods=[];let injectReceiptReadTimeout=false;let receiptReadTimeoutInjected=false;
 await signingPage.exposeFunction('__walletRequest',async request=>{
  state.requests.push(request.method);
  if(request.method==='eth_requestAccounts'||request.method==='eth_accounts')return [state.account];
  if(request.method==='eth_chainId')return '0xf22f';
  if(request.method==='wallet_getSnaps'||request.method==='wallet_requestSnaps')return {};
  if(request.method==='wallet_switchEthereumChain'||request.method==='wallet_addEthereumChain')return null;
  if(request.method==='eth_sendTransaction'){state.requests.push('browser-signature-request');return {__error:{code:4001,message:'User rejected the transaction signature'}};}
  return {__error:{code:-32601,message:`Unexpected provider method ${request.method}`}};
 });
 await signingPage.addInitScript(()=>{
  const handlers=new Map();
  window.ethereum={isMetaMask:true,isConnected:()=>true,selectedAddress:null,networkVersion:'61999',request:async request=>{const result=await window.__walletRequest(request);if(result?.__error){const error=new Error(result.__error.message);error.code=result.__error.code;throw error}return result},on:(event,fn)=>{const listeners=handlers.get(event)||[];listeners.push(fn);handlers.set(event,listeners)},removeListener:()=>{}};
 });
 await signingPage.route('**/*',async route=>{
  const request=route.request();
  if(request.url().startsWith('https://studio.genlayer.com/api')){
   const cors={'access-control-allow-origin':'*','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type,authorization','content-type':'application/json'};
   if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:cors,body:''});return;}
   const payload=request.postDataJSON();rpcMethods.push(payload?.method||'unknown');
   if(injectReceiptReadTimeout&&!receiptReadTimeoutInjected&&payload?.method==='eth_getTransactionByHash'){
    receiptReadTimeoutInjected=true;
    await route.fulfill({status:504,headers:{...cors,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:payload.id,error:{code:-32000,message:'Simulated one-time receipt-read timeout; retry against live Studionet'}})});return;
   }
   const response=await fetch('https://studio.genlayer.com/api',{method:request.method(),headers:{'content-type':'application/json'},body:request.postDataBuffer(),signal:AbortSignal.timeout(30000)});
   await route.fulfill({status:response.status,headers:{...cors,'content-type':response.headers.get('content-type')||'application/json'},body:Buffer.from(await response.arrayBuffer())});return;
  }
  await route.continue();
 });
 state.chain='0xf22f';
 const sendsBefore=state.requests.filter(method=>method==='browser-signature-request').length;
 await signingPage.goto(`${base}/#on-chain`,{waitUntil:'domcontentloaded'});
 await signingPage.locator('#chain-wallet').click();
 await signingPage.waitForFunction(address=>document.querySelector('#chain-wallet-info')?.textContent.includes(address),state.account);
 const caseId=`BROWSER-REJECT-${Date.now()}-${label}`;
 await signingPage.locator('#chain-case-id').fill(caseId);
 await signingPage.locator('#chain-recipient').fill('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
 await signingPage.locator('#chain-attestor').fill('0x'+'b'.repeat(40));
 await signingPage.locator('#chain-rule').fill('Provider-only rejection test. No contract write is expected.');
 await signingPage.locator('#chain-hours').fill('24');
 if(await signingPage.locator('#requested-minutes').count()){
  await signingPage.locator('#requested-minutes').fill('90');
  await signingPage.locator('#max-minutes').fill('90');
 }
 await signingPage.locator('#chain-action').selectOption('create_case');
 await signingPage.locator('#chain-execute').click();
 await signingPage.waitForFunction(()=>{const output=document.querySelector('#chain-output')?.textContent||'';return output.includes('User rejected the transaction signature')||output.includes('Submission did not produce a transaction hash')},null,{timeout:15000});
 const rejected=await signingPage.locator('#chain-output').innerText();
 assert.match(rejected,/User rejected/i,`Expected signing rejection after live preflight; got: ${rejected}`);
 assert.equal(await signingPage.evaluate(address=>localStorage.getItem(`genlayer-pending-${address.toLowerCase()}`),expectedAddress),null,'A wallet rejection must release the duplicate-write lock');
 assert.equal(state.requests.filter(method=>method==='browser-signature-request').length,sendsBefore+1,'The rejected signing request must be observed exactly once');

 await signingPage.locator('#chain-case-id').fill(signedProof.caseId);
 await signingPage.locator('#chain-read').click();
 await signingPage.waitForFunction(id=>{try{return JSON.parse(document.querySelector('#chain-output')?.textContent||'{}').case?.id===id}catch{return false}},signedProof.caseId,{timeout:60000});
 const canonical=JSON.parse(await signingPage.locator('#chain-output').innerText()).case;
 assert.equal(canonical.status,'DRAFT','The signed case should remain a draft qualification record');
 assert.equal(canonical.creator.toLowerCase(),signedProof.form.creator.toLowerCase());
 assert.equal(canonical.attestor.toLowerCase(),signedProof.form.attestor.toLowerCase());
 await signingPage.evaluate(({address,proof,record,hash})=>localStorage.setItem(`genlayer-pending-${address.toLowerCase()}`,JSON.stringify({hash,stage:'BROADCAST_NO_FINALITY',action:'create_case',caseId:proof.caseId,prev:null,wallet:record.creator,attestor:record.attestor})),{address:expectedAddress,proof:signedProof,record:canonical,hash:signedTx.broadcastHash});
 await signingPage.locator('#chain-execute').click();
 await signingPage.waitForFunction(hash=>(document.querySelector('#chain-output')?.textContent||'').includes(`Pending wallet request or transaction ${hash}`),signedTx.broadcastHash,{timeout:10000});
 assert.equal(state.requests.filter(method=>method==='browser-signature-request').length,sendsBefore+1,'A stored broadcast hash must block duplicate signing');
 injectReceiptReadTimeout=true;
 await signingPage.locator('#chain-resume').click();
 try{await signingPage.waitForFunction(()=>document.querySelector('#chain-output')?.textContent.includes('VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE'),null,{timeout:30000})}catch(error){throw new Error(`${error.message}; receiptTimeoutInjected=${receiptReadTimeoutInjected}; RPC methods=${rpcMethods.join(', ')}; UI=${(await signingPage.locator('#chain-output').innerText()).slice(0,1200)}`)}
 assert.equal(receiptReadTimeoutInjected,true,`Receipt recovery should retry after one transient timeout; RPC methods observed: ${rpcMethods.join(', ')}`);
 const recovered=JSON.parse(await signingPage.locator('#chain-output').innerText());
 assert.equal(recovered.status,'VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE');
 assert.equal(recovered.transaction,signedTx.broadcastHash);
 assert.equal(recovered.phase,'FINALIZED');
 assert.equal(recovered.consensus,'MAJORITY_AGREE');
 assert.ok(recovered.genvmLeaders>0);
 assert.ok(recovered.independentValidators>0);
 assert.equal(recovered.case.id,signedProof.caseId);
 assert.equal(recovered.case.status,'DRAFT');
 assert.equal(recovered.case.creator.toLowerCase(),signedProof.form.creator.toLowerCase());
 assert.deepEqual(recovered.history,[]);
 const signatureCountBeforeHashAttach=state.requests.filter(method=>method==='browser-signature-request').length;
 await signingPage.evaluate(({address,proof,record})=>localStorage.setItem(`genlayer-pending-${address.toLowerCase()}`,JSON.stringify({hash:'',stage:'SIGNING_OR_UNKNOWN_BROADCAST',action:'create_case',caseId:proof.caseId,prev:null,wallet:record.creator,attestor:record.attestor})),{address:expectedAddress,proof:signedProof,record:canonical});
 await signingPage.locator('#chain-resume-hash').fill(signedTx.broadcastHash);
 await signingPage.locator('#chain-resume').click();
 await signingPage.waitForFunction(()=>document.querySelector('#chain-output')?.textContent.includes('VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE'),null,{timeout:30000});
 const attachedHash=JSON.parse(await signingPage.locator('#chain-output').innerText());
 assert.equal(attachedHash.transaction,signedTx.broadcastHash,'Unknown broadcast recovery must reconcile the exact saved hash');
 assert.equal(await signingPage.evaluate(address=>localStorage.getItem(`genlayer-pending-${address.toLowerCase()}`),expectedAddress),null,'Only verified receipt and canonical state may clear the pending lock');
 assert.equal(state.requests.filter(method=>method==='browser-signature-request').length,signatureCountBeforeHashAttach,'Hash attachment and recovery must not request another signature');
 assert.equal(errors.length,0,'Browser JavaScript errors');
 const qualification={schemaVersion:1,generatedAt:new Date().toISOString(),app:label,contract:expectedAddress,chainId:61999,browser:'Chromium via Playwright',viewport:{desktop:'1440x900',mobile:`${mobile.viewport}px`},mobile,wrongNetwork:'PASS',accountChanged:'PASS',networkChanged:'PASS',walletRejection:{status:'PASS',liveReadOnlyPreflight:'case_exists',signatureRequests:1,broadcast:false,pendingLockReleased:true},duplicateWriteLock:{status:'PASS',storedHash:signedTx.broadcastHash,additionalSignatureRequests:0},timeoutRecovery:{status:'PASS',savedBroadcastHash:signedTx.broadcastHash,firstReceiptRead:'one simulated HTTP 504',retriedAgainstLiveRPC:receiptReadTimeoutInjected,terminalPhase:recovered.phase},unknownBroadcastHashRecovery:{status:'PASS',attachedHash:signedTx.broadcastHash,additionalSignatureRequests:0,pendingLockClearedAfterVerifiedState:true},signedLiveRecovery:{status:'PASS',sourceEvidence:'browser-signed-live.json',caseId:signedProof.caseId,hash:signedTx.broadcastHash,phase:recovered.phase,consensus:recovered.consensus,successfulLeaderExecutions:signedProof.receipt.successfulLeaderExecutions,validatorCount:signedProof.receipt.validatorCount,canonicalStatus:recovered.case.status,canonicalCreator:recovered.case.creator},javascriptErrors:errors};
 fs.mkdirSync(evidenceDir,{recursive:true});
 fs.writeFileSync(path.join(evidenceDir,'browser-wallet-e2e.json'),JSON.stringify(qualification,null,2)+'\n');
 await signingPage.screenshot({path:path.join(evidenceDir,'browser-signed-live.png'),fullPage:true});
 await signingPage.close();
 console.log(JSON.stringify({result:'PASS',scope:'Chromium wallet rejection/network/account/mobile tests; live preflight; duplicate lock and real signed transaction recovery with GenVM receipt and canonical state',mobile,providerRequests:state.requests.length,rejectedMessage:rejected.slice(0,180),signedLiveRecovery:qualification.signedLiveRecovery}));
}finally{
 await browser?.close();
 server?.kill();
}
