const sortValue=value=>Array.isArray(value)?value.map(sortValue):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sortValue(value[k])])):value;
const canonicalJson=value=>JSON.stringify(sortValue(value));
async function sha256(text){const hash=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function verifyAuditHistory(history,digest=sha256){
  if(!Array.isArray(history))throw new Error('Invalid audit history');
  let previous='';
  for(let index=0;index<history.length;index++){
    const source=history[index];
    if(!source||typeof source!=='object'||Array.isArray(source))return {valid:false,at:index};
    const entry={...source}, claimed=entry.entry_hash;
    delete entry.entry_hash;
    if(typeof claimed!=='string'||!claimed||entry.prev!==previous||await digest(canonicalJson(entry))!==claimed)return {valid:false,at:index};
    previous=claimed;
  }
  return {valid:true,entries:history.length};
}
function canceledAfterQuorum(receipt){return receipt?.execution_result==='ERROR'&&/validator execution cancelled after quorum/i.test(String(receipt?.genvm_result?.stderr||receipt?.error||''));}
const EXPECTED_STATUS_BY_ACTION=Object.freeze({
  create_case:'DRAFT',
  consent:'DRAFT',
  freeze:'FROZEN',
  submit_evidence:'EVIDENCE_LOCKED',
  attest_evidence:'ATTESTED',
  adjudicate:'ASSESSED',
  challenge:'CHALLENGED',
  finalize_case:'FINALIZED'
});
export function expectedStatusAfterAction(action){return EXPECTED_STATUS_BY_ACTION[action]||null;}
export function assessReceipt(tx,action){
  const phase=tx?.statusName??tx?.status_name;
  const consensus=tx?.resultName??tx?.result_name;
  const leaders=tx?.consensus_data?.leader_receipt||[];
  const material=leaders.filter(x=>!canceledAfterQuorum(x));
  const successful=material.filter(x=>x.execution_result==='SUCCESS');
  const failed=material.filter(x=>x.execution_result!=='SUCCESS');
  const validators=tx?.consensus_data?.validators||[];
  if(phase!=='FINALIZED'||consensus!=='MAJORITY_AGREE'||!successful.length||failed.length||(action==='adjudicate'&&!validators.length)){
    throw new Error('Insufficient finality, consensus, successful GenVM execution, or independent-validator receipt evidence');
  }
  return {phase,consensus,leaders,validators};
}
export async function waitForFinalizedExecution(client,hash,action,{attempts=180,interval=4000}={}){
 if(!client||typeof client.getTransaction!=='function')throw new Error('GenLayerJS full transaction reader is unavailable');
 let last='no receipt returned';
 for(let attempt=0;attempt<attempts;attempt++){
  let transaction;
  try{transaction=await client.getTransaction({hash})}catch(error){last=String(error?.shortMessage||error?.message||error).slice(0,240);if(attempt+1<attempts)await new Promise(resolve=>setTimeout(resolve,interval));continue}
  const phase=transaction?.statusName??transaction?.status_name;
  if(phase==='FINALIZED')return {transaction,...assessReceipt(transaction,action)};
  if(['CANCELED','UNDETERMINED','LEADER_TIMEOUT','VALIDATORS_TIMEOUT'].includes(phase))throw new Error(`Transaction ${hash} ended at ${phase} without successful finalization`);
  last=`current status ${phase||'not found'}`;
  if(attempt+1<attempts)await new Promise(resolve=>setTimeout(resolve,interval));
 }
 throw new Error(`Could not verify finalized transaction ${hash}: ${last}`);
}
export function canPerform(action,record,actor,nowSeconds){
  const who=String(actor||'').toLowerCase(), creator=String(record?.creator||'').toLowerCase(), recipient=String(record?.recipient||'').toLowerCase();
  const slots=Array.isArray(record?.challenges)?record.challenges:[];
  const party=who===creator||who===recipient;
  switch(action){
    case 'consent': return record?.status==='DRAFT'&&!record.consented&&who===recipient;
    case 'freeze': return record?.status==='DRAFT'&&record.consented&&who===creator;
    case 'submit_evidence': return record?.status==='FROZEN'&&!record.evidence&&party;
    case 'attest_evidence': return record?.status==='EVIDENCE_LOCKED'&&!record.attested&&who===String(record.attestor||'').toLowerCase();
    case 'adjudicate': return ['ATTESTED','CHALLENGED'].includes(record?.status)&&party&&(record.status!=='CHALLENGED'||slots.length===2||nowSeconds>Number(record.last_at)+86400);
    case 'challenge': return ['ASSESSED','CHALLENGED'].includes(record?.status)&&record.round===1&&nowSeconds<=Number(record.last_at)+86400&&slots.length<2&&party&&!slots.some(x=>String(x.actor||'').toLowerCase()===who);
    case 'finalize_case': return record?.status==='ASSESSED'&&(record.round===2||nowSeconds>Number(record.last_at)+86400);
    default: return false;
  }
}
