import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionHashVariant, TransactionStatus } from "genlayer-js/types";
import { waitForFinalizedExecution, canPerform, expectedStatusAfterAction, matchesExpectedStatus } from "./qualification.js";

// Separate immutable deploy-and-audit binding from UI's ability to sign.
// RELEASE_QUALIFIED is false until independent GenVM and signed browser E2E evidence exists.
const ADDRESS = window.CONTRACT_ADDRESS;
const BOUND = /^0x[a-fA-F0-9]{40}$/.test(ADDRESS ?? "");
const QUALIFIED = window.RELEASE_QUALIFIED === true;
const reader = createClient({ chain: studionet });
let wallet = null, walletAddress = "", walletChain = null, pending = false;
const el = id => document.getElementById(id);
const html = x => String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const format = x => JSON.stringify(x,(_,v)=>typeof v==="bigint"?v.toString():v,2);
const message = e => String(e?.shortMessage||e?.message||e).slice(0,600);
const val = x => (el(x)?.value??"").trim();
const addrValid = x => /^0x[a-fA-F0-9]{40}$/.test(x);
const canonical = x => {const y=typeof x==="string"?JSON.parse(x):x;if(!y||typeof y!=="object"||Array.isArray(y))throw Error("Invalid canonical object");return y};
const read = async(name,args=[]) => reader.readContract({address:ADDRESS,functionName:name,args,transactionHashVariant:TransactionHashVariant.LATEST_FINAL});
const exactNum = (x,min,max) => {const n=Number(x);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`Value must be an integer from ${min} to ${max}`);return n};
const field = (id,label,placeholder,type="text") => `<label class="chain-field"><span class="eyebrow">${html(label)}</span><input class="input" type="${html(type)}" id="${html(id)}" placeholder="${html(placeholder)}" ${type==="number"?'step="1" min="0"':''}/></label>`;
const report=(x,status="")=>{if(el("chain-output")){el("chain-output").textContent=typeof x==="string"?x:format(x);el("chain-output").dataset.status=status;}};
const chainIsRight=()=>walletChain===61999 && addrValid(walletAddress);
function resetWallet(reason){wallet=null;walletAddress="";walletChain=null;if(el("chain-wallet-info"))el("chain-wallet-info").textContent=reason||"Wallet disconnected"}
const caseId=()=>val("chain-case-id");
const currentTxStorage=()=>`genlayer-pending-${ADDRESS?.toLowerCase()||'unset'}`;
const txSaved=()=>{const raw=window.localStorage.getItem(currentTxStorage());return raw?JSON.parse(raw):null};
const txRemember=v=>{if(v)window.localStorage.setItem(currentTxStorage(),JSON.stringify(v));else window.localStorage.removeItem(currentTxStorage());};
const canonicalHistory=x=>{const p=typeof x==="string"?JSON.parse(x):x;if(!Array.isArray(p))throw Error("Invalid audit history");return p};
const receiptPhase=tx=>tx?.statusName??tx?.status_name;
const receiptResult=tx=>tx?.resultName??tx?.result_name;
async function afterTx(saved,{recovery=false}={}){
  if(!saved.hash)throw Error("A wallet signing request has an unknown broadcast state. Do not submit again; reconcile the wallet activity before clearing this lock.");
  // Recovery is deliberately bounded. A transient RPC outage should return control to the user quickly,
  // while preserving the exact hash and duplicate-write lock for another explicit resume attempt.
  const {transaction:tx,...evidence}=await waitForFinalizedExecution(reader,saved.hash,saved.action,{attempts:recovery?3:180,interval:4000});
  const state=canonical(await read("get_case",[saved.caseId]));
  const prev=saved.prev||{};
  const target=expectedStatusAfterAction(saved.action);
  const checks={
    consent:state.status==="DRAFT"&&state.consented===true&&prev.consented===false,
    create_case:state.status==="DRAFT"&&state.id===saved.caseId&&state.creator?.toLowerCase()===saved.wallet.toLowerCase()&&state.attestor?.toLowerCase()===saved.attestor.toLowerCase(),
    freeze:state.status==="FROZEN"&&!!state.rule_hash,
    submit_evidence:state.status==="EVIDENCE_LOCKED"&&!!state.evidence_hash,
    attest_evidence:state.status==="ATTESTED"&&state.attested===true&&!!state.attestation_hash&&state.attestor?.toLowerCase()===saved.wallet.toLowerCase(),
    adjudicate:state.status==="ASSESSED"&&state.round===Number(prev.round||0)+1&&typeof state.result==="string"&&!!state.result,
    challenge:state.status==="CHALLENGED"&&Array.isArray(state.challenges)&&state.challenges.length===Number(prev.challenges?.length||0)+1&&state.challenges.some(x=>x.actor?.toLowerCase()===saved.wallet.toLowerCase()),
    finalize_case:state.status==="FINALIZED"&&Number(state.finalized_at)>0
  };
  if(!matchesExpectedStatus(saved.action,state.status)||checks[saved.action]!==true)throw Error("Canonical finalized state does not prove the requested transition: "+JSON.stringify({action:saved.action,expected:target||null,check:checks[saved.action]??false,caseId:state.id||null,expectedCaseId:saved.caseId,status:state.status,creator:state.creator||null,expectedCreator:saved.wallet||null,attestor:state.attestor||null,expectedAttestor:saved.attestor||null}));
  const history=canonicalHistory(await read("get_history",[saved.caseId]));
  if(saved.action==="adjudicate"&&history.length!==state.round)throw Error("Canonical semantic history length does not match the assessed round");
  txRemember(null);
  report({status:"VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE",transaction:saved.hash,action:saved.action,phase:receiptPhase(tx),consensus:receiptResult(tx),genvmLeaders:evidence.leaders.length,independentValidators:evidence.validators.length,case:state,history},"success");
}
async function resume(){const old=txSaved();if(!old)return report("No pending signed transaction or wallet request to resume.","error");if(!old.hash)return report("A signing request has unknown broadcast state. Inspect the connected wallet's activity and identify its exact transaction hash before making any new write.","error");try{report({status:"RECOVERING_OR_PENDING",hash:old.hash});await afterTx(old,{recovery:true})}catch(e){report(`Transaction ${old.hash} is not verified. Keep the duplicate-write lock and resume this exact hash after checking its status. ${message(e)}`,"error")}}
export const chainUI={
  render(){const extra=window.APP.label==="SHIFTFAIR"
      ?field("requested-minutes","Requested minutes","120","number")+field("max-minutes","Policy maximum minutes","90","number"):"";
    const badge=QUALIFIED?"SIGNED WRITES VERIFIED":"PRE-RELEASE / TRANSACTIONS LOCKED";
    return `<div class="release"><span class="signal"></span><span>Every registry page and case detail is read from finalized Studionet state. Positive verdicts are provisional until finalization. Third-party on-chain attestation proves which wallet vouched for evidence, <strong>not whether the external record is true.</strong></span></div>
    <div class="stats"><div class="stat"><div class="eyebrow">CHAIN</div><div class="value" style="font-size:24px">61999</div><small>Studionet</small></div><div class="stat"><div class="eyebrow">CONTRACT</div><div class="value" style="font-size:24px">${BOUND?"Bound":"Unbound"}</div><small>GenLayer native</small></div><div class="stat"><div class="eyebrow">WALLET WRITES</div><div class="value" style="font-size:24px">${QUALIFIED?"Qualified":"Locked"}</div><small>Independent gate</small></div></div>
    <div class="columns"><div class="surface"><div class="section-head"><h2>Live connection</h2><span class="pill">${badge}</span></div><p class="mono" style="overflow-wrap:anywhere">${html(ADDRESS||"NO V4 ADDRESS DEPLOYED")}</p><p class="muted">RPC: https://studio.genlayer.com/api</p><div class="toolbar"><button class="cta" id="chain-inspect" ${!BOUND?'disabled':''}>Read contract metadata</button><button id="chain-wallet" class="tab">Connect wallet</button></div><p id="chain-wallet-info" class="footnote">Not connected. No wallet secrets are requested or stored.</p></div>
    <div class="surface"><div class="section-head"><h2>Live case read</h2><span class="hint">Immutable canonical state</span></div>${field("chain-case-id","Case ID","CASE-2026-001")}
    <div class="toolbar"><button class="cta" id="chain-read" ${!BOUND?'disabled':''}>Fetch case + history</button><button class="tab" id="chain-resume">Resume submitted tx</button></div><p class="footnote">A timeout after a tx hash is returned must not be treated as failure. Resume that hash before attempting another write.</p></div></div>
    <div class="surface" style="margin-top:18px"><div class="section-head"><h2>Signed multi-party lifecycle</h2><span class="hint">Create → consent → freeze → evidence → attest → adjudicate → challenge / finalize</span></div>
    <div class="detail"><div class="detail-box">${field("chain-recipient","Counterparty wallet","0x…")}${field("chain-attestor","Designated third-party attestor wallet","0x…")}${field("chain-rule","Frozen agreement / policy","Objective terms and burden of proof")}${field("chain-hours","Deadline in hours","24","number")}${extra}
    <p class="footnote">The designated on-chain attestor wallet must differ from both parties. The counterparty consents before freezing the rule and designated attestor. For genuine carrier, timesheet, invoice or notice evidence, use an externally verifiable source record; a hash alone is not authentication.</p></div>
    <div class="detail-box"><label class="chain-field"><span class="eyebrow">Action</span><select class="input" id="chain-action"><option value="create_case">Create case</option><option value="consent">Counterparty consent</option><option value="freeze">Freeze clause</option><option value="submit_evidence">Lock evidence</option><option value="attest_evidence">Third-party attestation</option><option value="adjudicate">Independent semantic consensus</option><option value="challenge">Challenge assessment</option><option value="finalize_case">Finalize after review window</option></select></label>
    <label class="chain-field"><span class="eyebrow">Evidence / challenge statement</span><textarea class="input" id="chain-evidence" rows="4" placeholder="Bounded text; do not include secrets"></textarea></label>${field("chain-source","External source record reference","Official immutable record ID, URL or issuer reference")}
    <button class="cta" id="chain-execute" ${!QUALIFIED?'disabled title="Signed-browser, live execution, and canonical state qualification is incomplete"':''}>Sign and submit transaction</button><p class="footnote">Never infer success from a wallet popup or consensus agreement alone. A successful GenVM result and canonical state readback are mandatory.</p></div></div></div>
    <div class="surface" style="margin-top:18px"><div class="section-head"><h2>Canonical chain events</h2><span class="hint">No fabricated transaction receipts</span></div><pre class="mono" id="chain-output" style="white-space:pre-wrap;max-height:430px;overflow:auto">Select a live read operation.</pre></div>`;
  },
  bind(){
    el("chain-inspect")?.addEventListener("click",async()=>{try{report(canonical(await read("contract_info")),"success")}catch(e){report(message(e),"error")}});
    el("chain-read")?.addEventListener("click",async()=>{const id=caseId();if(!id)return report("Case reference required.","error");try{const [record,history]=await Promise.all([read("get_case",[id]),read("get_history",[id])]);report({case:canonical(record),history:canonicalHistory(history)},"success")}catch(e){report(message(e),"error")}});
    el("chain-resume")?.addEventListener("click",resume);
    el("chain-wallet")?.addEventListener("click",async()=>{if(!window.ethereum)return report("EIP-1193 provider unavailable.","error");try{
      const accounts=await window.ethereum.request({method:"eth_requestAccounts"});
      const addr=accounts?.[0];if(!addrValid(addr))throw Error("Missing valid wallet address");
      walletChain=parseInt(await window.ethereum.request({method:"eth_chainId"}),16);
      if(walletChain!==61999)throw Error(`Wrong network: ${walletChain}; expected Studionet 61999`);
      wallet=createClient({chain:studionet,account:addr,provider:window.ethereum});
      await wallet.connect("studionet");
      walletChain=parseInt(await window.ethereum.request({method:"eth_chainId"}),16);
      if(walletChain!==61999)throw Error(`Wrong network: ${walletChain}; expected Studionet 61999`);
      walletAddress=addr;
      el("chain-wallet-info").textContent=`Wallet ${addr} · Studionet 61999 · ${QUALIFIED?"writes qualified":"writes remain locked"}`;
      report({wallet:walletAddress,chainId:walletChain,releaseQualified:QUALIFIED},"success");
    }catch(e){const reason=message(e);resetWallet(reason.startsWith("Wrong network:")?"Wrong chain; expected Studionet 61999.":"Wallet not connected");report(reason,"error")}});
    window.ethereum?.on?.("accountsChanged",accounts=>{if(!accounts?.length||accounts[0]?.toLowerCase()!==walletAddress.toLowerCase())resetWallet("Wallet account changed. Reconnect required.")});
    window.ethereum?.on?.("chainChanged",chain=>{if(parseInt(chain,16)!==61999)resetWallet("Wallet network changed. Reconnect to Studionet.")});
    el("chain-execute")?.addEventListener("click",async()=>{
      if(!QUALIFIED||!BOUND)return report("Writes gated until v4 qualification is complete.","error");
      if(pending)return report("A transaction is already processing.","error");
      if(!wallet||!chainIsRight())return report("Connect a valid Studionet account first.","error");
      if(!navigator.locks?.request)return report("This browser cannot safely prevent duplicate signed writes. Use a Chromium browser with Web Locks enabled.","error");
      pending=true;
      try{await navigator.locks.request(`genlayer-write-${ADDRESS.toLowerCase()}`,{ifAvailable:true},async lock=>{
        if(!lock)throw Error("Another browser tab is signing or reconciling a write for this contract.");
        const pendingTx=txSaved();if(pendingTx)throw Error(`Pending wallet request or transaction ${pendingTx.hash||"with unknown hash"}. Resume and reconcile before any new write.`);
        await performWrite();
      });}catch(e){report(message(e),"error")}finally{pending=false}
    });
  }
};
async function performWrite(){
      if(!QUALIFIED||!BOUND)return report("Writes gated until qualification is complete.","error");
      if(!wallet||!chainIsRight())return report("Connect a valid Studionet account first.","error");
      const id=caseId(),action=val("chain-action");if(!/^[A-Za-z0-9_-]{1,96}$/.test(id))return report("Invalid case identifier.","error");
      let hash="";
      try{
        // Always recheck network and account immediately before wallet signing.
        const chain=parseInt(await window.ethereum.request({method:"eth_chainId"}),16);
        const accounts=await window.ethereum.request({method:"eth_accounts"});
        if(chain!==61999||accounts?.[0]?.toLowerCase()!==walletAddress.toLowerCase())throw Error("Wallet chain or account changed before signing");
        let previous=null;
        if(action==="create_case"){
          // Reject unknown-state instead of treating a timeout as evidence of no case.
          const exists=await read("case_exists",[id]);
          if(typeof exists!=="boolean")throw Error("Cannot verify on-chain case existence; no write submitted.");
          if(exists)throw Error("Case already exists. Provide a new ID.");
        }else{
          previous=canonical(await read("get_case",[id]));
        }
        if(action!=="create_case"&&!canPerform(action,previous,walletAddress,Date.now()/1000))throw Error("Wallet is not authorized for this transition from canonical state "+previous.status);
        let args=[id];const note=val("chain-evidence");
        if(action==="create_case"){
          const to=val("chain-recipient"),attestor=val("chain-attestor");
          if(!addrValid(to)||!addrValid(attestor)||new Set([to.toLowerCase(),attestor.toLowerCase(),walletAddress.toLowerCase()]).size!==3)throw Error("Creator, counterparty and attestor must be distinct valid addresses");
          const deadline=Math.floor(Date.now()/1000)+exactNum(val("chain-hours"),1,8760)*3600;
          const rule=val("chain-rule");if(!rule||new TextEncoder().encode(rule).length>2048)throw Error("Rule text must be 1 to 2048 bytes");
          args=[id,to,rule,deadline];if(window.APP.label==="SHIFTFAIR")args.push(exactNum(val("requested-minutes"),1,10080),exactNum(val("max-minutes"),1,10080));args.push(attestor);
        }else if(action==="submit_evidence"||action==="challenge"){
          if(!note||new TextEncoder().encode(note).length>(action==="challenge"?512:4096))throw Error("Invalid text length");args.push(note);
        }else if(action==="attest_evidence"){
          if(walletAddress.toLowerCase()!==previous.attestor.toLowerCase())throw Error("Only the precommitted attestor can attest");
          const source=val("chain-source");if(!source||new TextEncoder().encode(source).length>256)throw Error("Invalid source reference");
          args.push(previous.evidence_hash,source);
        }
        const call={address:ADDRESS,functionName:action,args};
        const intent={hash:"",stage:"SIGNING_OR_UNKNOWN_BROADCAST",action,caseId:id,prev:previous,wallet:walletAddress,attestor:action==="create_case"?val("chain-attestor"):previous?.attestor,intentId:crypto.randomUUID()};
        txRemember(intent); // Persist before the wallet request; storage failure blocks signing.
        report("Requesting wallet signature. The app has locked duplicate writes while the wallet request is unresolved…");
        try{hash=await wallet.writeContract({...call,value:0n});}
        catch(e){if(e?.code===4001||e?.name==="UserRejectedRequestError"){txRemember(null);throw e;}txRemember(intent);throw Error("Wallet response is uncertain; duplicate writes are locked until wallet activity is reconciled. "+message(e));}
        const saved={hash,stage:"BROADCAST",action,caseId:id,prev:previous,wallet:walletAddress,attestor:action==="create_case"?val("chain-attestor"):previous?.attestor};txRemember(saved);
        report({status:"SUBMITTED_UNVERIFIED",hash,action});
        await afterTx(saved);
      }catch(e){report(`Submission ${hash?"was broadcast and must be reconciled before retry":"did not produce a transaction hash"}. ${message(e)}`,"error")}
}
