import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { chainUI } from './onchain.js';
import { verifyAuditHistory } from './qualification.js';

const APP = window.APP;
const ADDRESS = window.CONTRACT_ADDRESS;
const CHAIN_ID = 61999;
const networkClient = createClient({ chain: studionet });
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const shorten = value => String(value ?? '').length > 22 ? `${String(value).slice(0,12)}…${String(value).slice(-7)}` : String(value ?? '');
const stringify = obj => JSON.stringify(obj, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
const validContract = /^0x[a-fA-F0-9]{40}$/.test(ADDRESS || '');
let page = APP.view[0];
let live = { cases: [], ids: [], total: 0, page: 0, pageSize: 100, loading: false, error: '', checkedAt: null, complete: false };
let activeSearch = '';
const parsed = value => typeof value === 'string' ? JSON.parse(value) : value;
const read = async (functionName, args=[]) => networkClient.readContract({ address: ADDRESS, functionName, args, transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
const pill = status => `<span class="pill">${esc(status || 'UNKNOWN')}</span>`;
const panel = (heading, body, hint='') => `<div class="surface"><div class="section-head"><h2>${esc(heading)}</h2><span class="hint">${esc(hint)}</span></div>${body}</div>`;
const progress = () => `<div class="release"><span class="signal"></span><span><strong>GENLAYER STUDIONET / LIVE CASES.</strong> ${validContract ? 'These records are read from finalized V4 contract state.' : 'No verified contract configured.'} Verified source ${esc(window.CONTRACT_SOURCE_SHA256||'unavailable')}. Wallet signing is ${window.RELEASE_QUALIFIED===true?'enabled after qualification':'locked pending signed-browser and live execution evidence'}. No simulated case is represented as a blockchain record. ${live.checkedAt ? 'Last refreshed: '+esc(live.checkedAt) : ''}</span></div>`;
const badge = r => pill(r.status);
function renderCases(items, emptyMessage='No cases returned from this contract yet.') {
  if (!items.length) return `<div class="blank">${esc(emptyMessage)}</div>`;
  return `<div class="case-list">${items.map(r=>`<div class="case-row" role="button" tabindex="0" data-live-case="${esc(r.id)}"><b>${esc(r.id)}</b><span><b>${esc(r.rule?.slice(0,76)||r.id)}</b><small class="desc">Attestor ${esc(shorten(r.attestor))} · ${esc(r.round || 0)} consensus round(s)</small></span>${badge(r)}<small>${esc(r.consented?'Consented':'Pending consent')}</small></div>`).join('')}</div>`;
}
function loadingNote(){
  if(live.loading) return `<div class="blank">Reading GenLayer contract state…</div>`;
  if(live.error) return `<div class="blank" role="alert">Live read failed: ${esc(live.error)}. There is no simulated fallback.</div>`;
  return '';
}
const refreshButton = `<button id="live-refresh" class="tab">Refresh live records</button>`;
function render(name){
  if(name==='On-chain') return chainUI.render();
  const cases=live.cases;
  const safeEmpty = loadingNote();
  const records = cases.filter(x=>(x.id+' '+(x.status||'')+' '+(x.rule||'')).toLowerCase().includes(activeSearch.toLowerCase()));
  const counts={total:cases.length,frozen:cases.filter(x=>['FROZEN','EVIDENCE_LOCKED','ATTESTED'].includes(x.status)).length,assessed:cases.filter(x=>x.round>0).length,challenged:cases.filter(x=>(x.challenges||[]).length>0).length};
  if(name===APP.view[0]) return progress()+`<div class="stats">${[['Recorded cases',counts.total],['Evidence workflow',counts.frozen],['Consensus assessed',counts.assessed],['Contested cases',counts.challenged]].map(([k,v])=>`<div class="stat"><div class="eyebrow">${esc(k)}</div><div class="value">${v}</div><small>Live, read-only count</small></div>`).join('')}</div>`+`<div class="columns">${panel('Latest actual contract cases',safeEmpty+renderCases(cases.slice().reverse().slice(0,10)),`${cases.length} loaded on page ${live.page+1} of ${Math.max(1,Math.ceil(live.total/live.pageSize))} · ${live.total} canonical cases`)}${panel('Contract and execution integrity',`<div class="risk"><div class="risk-item"><div class="eyebrow">CONTRACT</div><p class="mono">${esc(ADDRESS)}</p></div><div class="risk-item"><div class="eyebrow">FINALITY RULE</div><p>Consensus agreement alone is not execution success. A verified action requires a successful GenVM receipt and exact on-chain state readback.</p></div><div class="risk-item"><div class="eyebrow">EXTERNAL EVIDENCE</div><p>A signed attestor statement proves the wallet making the claim, not independently verified issuer identity or document truth.</p></div></div>`,'Steward integrity checks')}</div>`+`<div class="toolbar" style="margin-top:16px">${refreshButton}<button id="open-onchain" class="cta">Open on-chain case workspace</button></div>`;
  if(['Cases','Claims'].includes(name)) return progress()+panel('Canonical case registry',`<div class="toolbar registry-tools"><input id="case-filter" class="input" aria-label="Search current page of actual cases" placeholder="Search this page by ID, status or frozen rule" value="${esc(activeSearch)}"/>${refreshButton}</div>${safeEmpty}<div id="filtered-cases">${renderCases(records,'No matching cases on this page.')}</div><div class="toolbar registry-pages"><span class="hint">${cases.length} records on page ${live.page+1} / ${Math.max(1,Math.ceil(live.total/live.pageSize))} · ${live.total} total on chain</span><div><button id="cases-prev" class="tab" ${live.page===0?'disabled':''}>Previous</button><input id="case-page" class="input page-input" type="number" min="1" max="${Math.max(1,Math.ceil(live.total/live.pageSize))}" value="${live.page+1}" aria-label="Page number"/><button id="cases-go" class="tab">Go</button><button id="cases-next" class="tab" ${live.complete?'disabled':''}>Next</button></div></div><div class="toolbar registry-tools"><input id="direct-case-id" class="input" placeholder="Exact case ID (including another page)" aria-label="Find exact case ID"/><button id="direct-case-search" class="tab">Open exact ID</button></div>`,'Paged canonical registry · each detail is read from finalized Studionet state');
  if(['Evidence','Policies'].includes(name)) return progress()+panel(name==='Evidence'?'Attested evidence registry':'Frozen policies',safeEmpty+(cases.length?`<div class="case-list">${cases.map(r=>`<div class="case-row" role="button" tabindex="0" data-live-case="${esc(r.id)}"><b>${esc(r.id)}</b><span><b>${esc(name==='Evidence'?(r.evidence_hash||'No locked evidence'):(r.rule_hash||'Unfrozen rule'))}</b><small class="desc">Source ${esc(r.source_ref||'No attested source')} · Attestor ${esc(shorten(r.attestor))}</small></span>${badge(r)}<small>${esc(r.attested?'Attested':'Not attested')}</small></div>`).join('')}</div>`:renderCases([])),`Only contract-recorded ${name.toLowerCase()}`)+`<div class="toolbar" style="margin-top:16px">${refreshButton}</div>`;
  if(name==='Challenges') return progress()+panel('Challenge ledger',safeEmpty+(cases.filter(r=>(r.challenges||[]).length>0).length?`<div class="case-list">${cases.filter(r=>(r.challenges||[]).length>0).map(r=>`<div class="case-row" role="button" tabindex="0" data-live-case="${esc(r.id)}"><b>${esc(r.id)}</b><span><b>${esc((r.challenges||[]).length)} submitted challenge(s)</b><small class="desc">Immutable challenge hash ${esc(r.challenge_hash||'')}</small></span>${badge(r)}</div>`).join('')}</div>`:'<div class="blank">No submitted challenge records yet.</div>'),'Two parties have separate challenge slots')+`<div class="toolbar" style="margin-top:16px">${refreshButton}</div>`;
  if(name==='Audit') return progress()+panel('Append-only consensus lineage',safeEmpty+(cases.length?`<div class="case-list">${cases.map(r=>`<div class="case-row" role="button" tabindex="0" data-live-case="${esc(r.id)}"><b>${esc(r.id)}</b><span><b>${esc(r.round||0)} assessment round(s)</b><small class="desc">Finalized: ${esc(r.finalized_at||'not yet')} · Decision ${esc(r.result||'pending')}</small></span>${badge(r)}</div>`).join('')}</div>`:'<div class="blank">No contract cases available for audit.</div>'),'Select a real case to load its entire hash-linked history');
  if(name==='Schedule') return progress()+panel('Actual shift claims',safeEmpty+(cases.length?`<div class="case-list">${cases.map(r=>`<div class="case-row" role="button" tabindex="0" data-live-case="${esc(r.id)}"><b>${esc(r.id)}</b><span><b>${esc(r.requested_minutes??0)} requested minutes</b><small class="desc">Provisional ${esc(r.provisional_approved_minutes??0)} · Final ${esc(r.approved_minutes??0)} min</small></span>${badge(r)}</div>`).join('')}</div>`:'<div class="blank">No shift cases exist on this contract.</div>'),'No synthetic roster or employee data');
  if(name==='Network') return panel('GenLayer network and wallet',`<div class="detail"><div class="detail-box"><div class="eyebrow">RPC ENDPOINT</div><div class="mono">https://studio.genlayer.com/api</div><div id="rpc-status">Click Recheck to probe chain ID.</div></div><div class="detail-box"><div class="eyebrow">EXPECTED CHAIN ID</div><h2>${CHAIN_ID} / 0xF22F</h2><p class="mono">${esc(ADDRESS)}</p><small>${esc(live.checkedAt||'Not checked')}</small></div><div class="toolbar">${refreshButton}<button id="probe-button" class="tab">Recheck network</button><button id="open-onchain" class="cta">Open on-chain wallet workspace</button></div></div>`,'Studionet 61999');
  return progress()+panel('Actual contract data',safeEmpty+renderCases(cases));
}
async function refresh(requestedPage=live.page){
  if(!validContract){live.error='The contract address is not configured.';live.loading=false;nav(page,false);return}
  live.loading=true;live.error='';nav(page,false);
  try{
    const info=parsed(await read('contract_info'));
    const total=Number(info?.case_count);
    if(!Number.isSafeInteger(total)||total<0)throw new Error('Contract did not return a valid canonical case count');
    const pageSize=100, pageCount=Math.max(1,Math.ceil(total/pageSize));
    const targetPage=Math.min(Math.max(0,requestedPage),pageCount-1);
    const ids=parsed(await read('get_case_ids_page',[targetPage*pageSize,pageSize]));
    if(!Array.isArray(ids)||ids.length>pageSize||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new Error('Unexpected or duplicate case page returned by contract');
    const results=[];
    for(const id of ids){const rec=parsed(await read('get_case',[id]));if(!rec||typeof rec!=='object'||rec.id!==id)throw new Error('Canonical case ID mismatch: '+id);results.push(rec)}
    live={cases:results,ids,total,page:targetPage,pageSize,loading:false,error:'',checkedAt:new Date().toLocaleString(),complete:(targetPage+1)*pageSize>=total};
  }catch(e){live.loading=false;live.error=String(e?.shortMessage||e?.message||e).slice(0,350)}
  // A registry read may finish while the user is signing on the separate
  // on-chain workspace. Do not replace its live form or receipt view.
  if(page!=='On-chain')nav(page,false);
}
function nav(name,doRefresh=true){
  page=name;
  document.querySelectorAll('nav button').forEach(e=>e.classList.toggle('active',e.dataset.page===name));
  $('page-name').textContent=name;
  $('hero-title').textContent=name===APP.view[0]?APP.tagline:name;
  $('hero-subtitle').textContent=name===APP.view[0]?APP.subtitle:'Actual contract state and accountable evidence';
  $('main-content').innerHTML=render(name);
  bind();
  history.replaceState({},'', '#'+encodeURIComponent(name.toLowerCase()));
  if(doRefresh&&name!=='On-chain'&&!live.checkedAt&&!live.loading)void refresh();
}
async function detail(id){
  $('modal-body').innerHTML='<div class="blank">Fetching authentic contract history…</div>';
  $('detail-modal').hidden=false;
  try{
    const record=parsed(await read('get_case',[id]));
    const history=parsed(await read('get_history',[id]));
    if(!Array.isArray(history))throw new Error('Unexpected history response');
    if(!record||record.id!==id)throw new Error('Canonical case ID mismatch');
    const integrity=await verifyAuditHistory(history);
    const a=esc;
    $('modal-body').innerHTML=`<div class="eyebrow">ON-CHAIN CASE / ${a(id)}</div><h2>${a(record.status||'UNKNOWN')}</h2><div class="detail"><div class="detail-box"><div class="eyebrow">FROZEN POLICY</div><p>${a(record.rule||'Not frozen')}</p><p class="mono">${a(record.rule_hash||'No frozen hash')}</p></div><div class="detail-box"><div class="eyebrow">AUTHORITIES</div><p>Creator: ${a(record.creator)}</p><p>Counterparty: ${a(record.recipient)}</p><p>Attestor: ${a(record.attestor)}</p><p>Consent: ${a(record.consented?'Yes':'No')}</p></div><div class="detail-box"><div class="eyebrow">EVIDENCE</div><p>${a(record.evidence||'No evidence')}</p><p class="mono">${a(record.evidence_hash||'No digest')}</p><small>Source: ${a(record.source_ref||'Not attested')}</small></div><div class="detail-box"><div class="eyebrow">DECISION</div><p>Verdict: ${a(record.result||'Not assessed')}</p><p>Round: ${a(record.round||0)}</p><p>Finalized: ${a(record.finalized_at||'No')}</p><p>Challenges: ${a((record.challenges||[]).length)}</p></div></div><div class="surface"><div class="section-head"><h2>Canonical history</h2><span class="hint">${history.length} entries · ${integrity.valid?'hash links verified':'INTEGRITY FAILURE at entry '+integrity.at}</span></div><pre class="mono" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:280px;overflow:auto">${a(stringify(history))}</pre></div><p class="footnote">History integrity: ${integrity.valid?'all SHA-256 entry links verified':'FAILED; do not rely on this audit view'}. A designated on-chain attestor proves wallet control, not independently verified identity or real-world document truth. Source SHA-256: ${esc(window.CONTRACT_SOURCE_SHA256||'unavailable')}.</p>`;
  }catch(e){$('modal-body').textContent='Contract case read failed: '+String(e?.message||e)}
}
async function probe(){
  const e=$('rpc-status');if(e)e.textContent='Checking Studionet RPC…';
  try{const r=await fetch('https://studio.genlayer.com/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'eth_chainId',params:[],id:1})});const q=await r.json();const actual=parseInt(q.result,16);if(e)e.textContent=actual===CHAIN_ID?'Verified chain ID 61999':'Unexpected chain ID: '+actual}catch(err){if(e)e.textContent='Network check failed: '+String(err.message||err)}
}
function bind(){
  if(page==='On-chain'){chainUI.bind();return}
  document.querySelectorAll('[data-live-case]').forEach(n=>{const action=()=>void detail(n.dataset.liveCase);n.addEventListener('click',action);n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();action()}})});
  $('live-refresh')?.addEventListener('click',()=>void refresh(live.page));
  $('cases-prev')?.addEventListener('click',()=>void refresh(Math.max(0,live.page-1)));
  $('cases-next')?.addEventListener('click',()=>void refresh(live.page+1));
  $('cases-go')?.addEventListener('click',()=>{const n=Number($('case-page')?.value);if(Number.isInteger(n)&&n>=1)void refresh(n-1)});
  $('direct-case-search')?.addEventListener('click',()=>{const id=String($('direct-case-id')?.value||'').trim();if(id)void detail(id)});
  $('open-onchain')?.addEventListener('click',()=>nav('On-chain'));
  $('probe-button')?.addEventListener('click',()=>void probe());
  $('case-filter')?.addEventListener('input',e=>{activeSearch=e.target.value;const filtered=live.cases.filter(r=>(r.id+' '+r.status+' '+r.rule).toLowerCase().includes(activeSearch.toLowerCase()));$('filtered-cases').innerHTML=renderCases(filtered);document.querySelectorAll('#filtered-cases [data-live-case]').forEach(n=>n.addEventListener('click',()=>void detail(n.dataset.liveCase)))});
}
document.querySelectorAll('nav button').forEach(e=>e.addEventListener('click',()=>nav(e.dataset.page)));
$('primary-action')?.addEventListener('click',()=>nav('On-chain'));
$('close-unavailable')?.addEventListener('click',()=>{$('unavailable-modal').hidden=true});
$('close-detail')?.addEventListener('click',()=>{$('detail-modal').hidden=true});
const fromHash=decodeURIComponent(location.hash.slice(1)).toLowerCase();
nav([...APP.view,'On-chain'].find(x=>x.toLowerCase()===fromHash)||APP.view[0]);
