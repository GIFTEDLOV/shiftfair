import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { chainUI, getWalletState, subscribeWallet, connectGlobalWallet, disconnectWallet, switchOrAddStudionet } from './onchain.js';
import { CASE_REGISTRY_PAGE_SIZE, shouldCancelRegistryRead, verifyAuditHistory } from './qualification.js';

const APP = window.APP;
const ADDRESS = window.CONTRACT_ADDRESS;
const CHAIN_ID = 61999;
const networkClient = createClient({ chain: studionet });
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const shorten = value => String(value ?? '').length > 22 ? `${String(value).slice(0,10)}…${String(value).slice(-6)}` : String(value ?? '');
const stringify = obj => JSON.stringify(obj, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
const validContract = /^0x[a-fA-F0-9]{40}$/.test(ADDRESS || '');
let page = 'Dashboard';
let live = { cases: [], ids: [], total: 0, page: 0, pageSize: CASE_REGISTRY_PAGE_SIZE, loading: false, error: '', checkedAt: null, complete: false };
let refreshGeneration = 0;
let activeSearch = '';
const parsed = value => typeof value === 'string' ? JSON.parse(value) : value;
const read = async (functionName, args=[]) => networkClient.readContract({ address: ADDRESS, functionName, args, transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
const pill = status => `<span class="pill">${esc(status || 'UNKNOWN')}</span>`;
const panel = (heading, body, hint='') => `<div class="surface"><div class="section-head"><h2>${esc(heading)}</h2><span class="hint">${esc(hint)}</span></div>${body}</div>`;
const progress = () => `<div class="release"><span class="signal"></span><span><strong>GENLAYER STUDIONET / LIVE CASES.</strong> ${validContract ? 'These records are read from finalized V4 contract state.' : 'No verified contract configured.'} Verified source ${esc(window.CONTRACT_SOURCE_SHA256||'unavailable')}. Wallet signing is ${window.RELEASE_QUALIFIED===true?'enabled after qualification':'locked pending signed-browser and live execution evidence'}. No simulated case is represented as a blockchain record. ${live.checkedAt ? 'Last refreshed: '+esc(live.checkedAt) : ''}</span></div>`;
const badge = r => pill(r.status);

function renderLifecycleStepper(status) {
  const steps = [
    { key: 'DRAFT', label: '1. Draft' },
    { key: 'CONSENT', label: '2. Consent' },
    { key: 'FROZEN', label: '3. Frozen' },
    { key: 'EVIDENCE_LOCKED', label: '4. Evidence' },
    { key: 'ATTESTED', label: '5. Attested' },
    { key: 'ASSESSED', label: '6. Assessed' },
    { key: 'CHALLENGED', label: '7. Challenge' },
    { key: 'FINALIZED', label: '8. Finalized' }
  ];
  
  const order = { 'DRAFT': 0, 'FROZEN': 2, 'EVIDENCE_LOCKED': 3, 'ATTESTED': 4, 'ASSESSED': 5, 'CHALLENGED': 6, 'FINALIZED': 7 };
  const currentIdx = order[status] ?? 0;
  
  return `<div class="lifecycle-stepper" aria-label="Case Lifecycle Progress">
    ${steps.map((s, idx) => {
      const isCompleted = idx < currentIdx;
      const isActive = idx === currentIdx;
      const cls = isCompleted ? 'step completed' : isActive ? 'step active' : 'step';
      return `<div class="${cls}">
        <span class="step-num">${isCompleted ? '✓' : idx + 1}</span>
        <span class="step-label">${s.label}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function renderConsensusMatrix(record, history) {
  const latestRound = history && history.length ? history[history.length - 1] : null;
  const vector = latestRound?.vector || {};
  
  const factBadge = val => val === true ? `<span class="fact-true">TRUE</span>` : val === false ? `<span class="fact-false">FALSE</span>` : `<span class="fact-pending">PENDING</span>`;
  
  return `<div class="surface" style="margin-top:14px">
    <div class="section-head">
      <h2>GenLayer AI Consensus Facts</h2>
      <span class="hint">Round ${esc(latestRound?.round || record?.round || 1)} · Strict Validator Equivalence</span>
    </div>
    <div class="consensus-matrix">
      <div class="consensus-head">
        <span>Semantic Factor</span>
        <span>AI Verdict</span>
        <span>Deterministic Rule Effect</span>
      </div>
      <div class="consensus-row">
        <div><b>Supervisor authorized</b><small class="desc">Did an authorized manager approve the extra shift?</small></div>
        <div>${factBadge(vector.supervisor_authorized)}</div>
        <small class="muted">Required for APPROVED shift hours</small>
      </div>
      <div class="consensus-row">
        <div><b>Attendance matches shift</b><small class="desc">Do timesheet/badge records corroborate requested hours?</small></div>
        <div>${factBadge(vector.attendance_matches_shift)}</div>
        <small class="muted">Required for APPROVED shift hours</small>
      </div>
      <div class="consensus-row">
        <div><b>Evidence sufficient</b><small class="desc">Is proof complete, verifiable and uncontradicted?</small></div>
        <div>${factBadge(vector.evidence_sufficient)}</div>
        <small class="muted">If false, deterministically REVIEW_REQUIRED</small>
      </div>
    </div>
    <p class="footnote" style="margin-top:10px">Deterministic outcome: <b>${esc(record?.result || latestRound?.verdict || 'Awaiting finality')}</b>. Capped approved minutes: <b>${esc(record?.approved_minutes || record?.provisional_approved_minutes || 0)} min</b>. GenLayer validators vote strictly on facts; smart contract code alone maps facts to outcomes.</p>
  </div>`;
}

function renderCases(items, emptyMessage='No cases returned from this contract yet.') {
  if (!items.length) return `<div class="blank">${esc(emptyMessage)}</div>`;
  
  return `<div class="folder-grid">${items.map((r, index) => {
    const themeIdx = index % 4;
    const cappedMinutes = r.provisional_approved_minutes ?? r.approved_minutes ?? (r.max_minutes ? Math.min(r.requested_minutes || 0, r.max_minutes) : (r.requested_minutes || 0));
    return `
    <div class="folder-card folder-theme-${themeIdx}" role="button" tabindex="0" data-live-case="${esc(r.id)}">
      <div class="folder-tab">
        <span class="folder-tab-badge">PROJECT 0${index + 1}</span>
        <span class="folder-tab-id">#${esc(r.id)}</span>
      </div>
      <div class="folder-content">
        <div class="folder-header">
          <div class="folder-rule-title">${esc(r.rule?.slice(0, 72) || r.id)}</div>
          ${badge(r)}
        </div>
        <div class="folder-meta-grid">
          <div class="folder-meta-item">
            <span class="folder-meta-label">REQUESTED SHIFT</span>
            <span class="folder-meta-value">${esc(r.requested_minutes ?? 0)} min</span>
          </div>
          <div class="folder-meta-item">
            <span class="folder-meta-label">POLICY CAPPED</span>
            <span class="folder-meta-value">${esc(cappedMinutes)} min</span>
          </div>
          <div class="folder-meta-item">
            <span class="folder-meta-label">ATTESTOR WALLET</span>
            <span class="folder-meta-value mono">${esc(shorten(r.attestor))}</span>
          </div>
          <div class="folder-meta-item">
            <span class="folder-meta-label">CONSENSUS</span>
            <span class="folder-meta-value">${esc(r.round || 0)} round(s) · ${esc(r.consented ? 'Consented' : 'Pending')}</span>
          </div>
        </div>
        <div class="folder-action">
          <span>Inspect Case Details & History →</span>
        </div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function loadingNote() {
  if (live.loading) return `<div class="blank">Reading GenLayer contract state…</div>`;
  if (live.error) return `<div class="blank" role="alert">Live read failed: ${esc(live.error)}. There is no simulated fallback.</div>`;
  return '';
}

const refreshButton = `<button id="live-refresh" class="tab">Refresh live records</button>`;

/* === FULL NUDGE-FOLIO MULTI-SECTION LANDING PAGE === */
function renderLandingPage(cases, counts) {
  const safeEmpty = loadingNote();
  const recentCases = cases.slice().reverse().slice(0, 4);
  
  return `
    <div class="nudge-landing">
      <!-- Section 1: Clean Focused Hero (Excess design removed) -->
      <section class="nudge-hero-section">
        <div class="clean-hero-box">
          <div class="eyebrow" style="margin-bottom:12px; color:var(--nudge-blue)">INTELLIGENT CONTRACT DISPUTE RESOLUTION</div>
          <h1 class="hero-headline-giant">Shift policy and overtime evidence</h1>
          <p class="hero-subhead">
            Deterministic shift claims resolved against frozen work rules and attested attendance records, capped by immutable contract arithmetic on GenLayer Studionet.
          </p>
          <div class="hero-cta-group">
            <button class="hero-btn-primary" id="hero-enter-app">⚡ Enter App →</button>
          </div>
        </div>
      </section>

      <!-- Section 2: "About ShiftFair / Protocol Pillars" -->
      <section class="nudge-about-section">
        <div class="nudge-about-sticky">
          <span class="about-badge">about shiftfair!</span>
          <h2>Policy-Bound Work Arbitrations</h2>
          <p>
            ShiftFair eliminates payroll disputes by anchoring employment agreements to immutable GenLayer Intelligent Contracts. Attested attendance evidence is independently evaluated by GenLayer AI validators with mathematical overtime capping.
          </p>
          <div class="about-stat-pills">
            <div class="stat-pill-item">+${counts.total} Recorded Cases</div>
            <div class="stat-pill-item">+61999 Studionet</div>
            <div class="stat-pill-item">+100% Capped Arithmetic</div>
          </div>
        </div>

        <div class="nudge-feature-grid">
          <div class="nudge-feature-card">
            <span class="feature-card-num">01 / ARITHMETIC</span>
            <h3 class="feature-card-title">Deterministic Capping</h3>
            <p class="feature-card-desc">Requested shift minutes are verified and mathematically capped against frozen policy terms. No arbitrary deductions.</p>
          </div>
          <div class="nudge-feature-card">
            <span class="feature-card-num">02 / VERIFICATION</span>
            <h3 class="feature-card-title">Supervisor & Badge Proof</h3>
            <p class="feature-card-desc">Requires corroborated supervisor authorization and biometric/badge attendance proofs before state progression.</p>
          </div>
          <div class="nudge-feature-card">
            <span class="feature-card-num">03 / PROVENANCE</span>
            <h3 class="feature-card-title">Tamper-Resistant Locks</h3>
            <p class="feature-card-desc">Every piece of evidence is hashed via SHA-256 and anchored with immutable previous-hash history links.</p>
          </div>
          <div class="nudge-feature-card">
            <span class="feature-card-num">04 / CONSENSUS</span>
            <h3 class="feature-card-title">Multi-Validator AI</h3>
            <p class="feature-card-desc">GenVM non-deterministic execution reaches verifiable majority agreement without single-party manipulation.</p>
          </div>
        </div>
      </section>

      <!-- Section 3: "FEATURED WORKS / DISPUTES" -->
      <section class="nudge-featured-section">
        <div class="nudge-section-header">
          <div>
            <h2 class="nudge-section-title-giant">FEATURED<br/>WORKS</h2>
          </div>
          <div>
            <p class="nudge-section-subtitle">Live contract cases fetched from finalized GenLayer state</p>
          </div>
        </div>
        ${safeEmpty}
        ${renderCases(recentCases.length ? recentCases : cases.slice(0, 4))}
        <div class="toolbar" style="margin-top:16px; justify-content:flex-end">
          <button id="view-all-claims-btn" class="cta">Enter App to Explore Full Registry (${cases.length}) →</button>
        </div>
      </section>

      <!-- Section 4: "PROTOCOL PIPELINE & CONSENSUS MATRIX" -->
      <section class="nudge-audit-section">
        <div class="nudge-section-header">
          <div>
            <h2 class="nudge-section-title-giant">PROTOCOL<br/>SERVICES</h2>
          </div>
          <div>
            <p class="nudge-section-subtitle">8-stage dispute lifecycle & strict AI validator equivalence</p>
          </div>
        </div>
        ${renderLifecycleStepper('FINALIZED')}
        ${renderConsensusMatrix(recentCases[0] || cases[0], null)}
      </section>

      <!-- Section 5: "ON-CHAIN ACTION & ENTER APP" -->
      <section class="nudge-contact-card">
        <div>
          <h2>Ready to arbitrate a shift dispute?</h2>
          <p>
            Enter the ShiftFair workspace to create a new shift claim, sign policy consent, submit attendance evidence, or challenge an existing determination.
          </p>
        </div>
        <div class="contact-btn-group">
          <button class="contact-btn-white" id="landing-launch-workspace">Enter App Now →</button>
        </div>
      </section>
    </div>
  `;
}

function renderWorkspaceDashboard(cases, counts) {
  const safeEmpty = loadingNote();
  const recent = cases.slice().reverse().slice(0, 5);
  return progress() + `
    <div class="workspace-dashboard">
      <div class="section-head">
        <div>
          <div class="eyebrow">SHIFTFAIR WORKSPACE</div>
          <h2 style="font-size:24px; margin-top:4px">Dispute Resolution Desk</h2>
          <p class="muted" style="margin:4px 0 0">Active GenLayer Studionet workspace for submitting shift claims, freezing work rules, attesting attendance proofs, and challenging determinations.</p>
        </div>
        <div class="toolbar" style="margin:0">
          <button id="dash-create-claim" class="cta">+ New Shift Claim</button>
          <button id="dash-open-onchain" class="tab">On-Chain Desk</button>
        </div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="eyebrow">CANONICAL CASES</div>
          <div class="value">${counts.total}</div>
          <small>Recorded on-chain</small>
        </div>
        <div class="stat">
          <div class="eyebrow">FROZEN RULES</div>
          <div class="value">${counts.frozen}</div>
          <small>Policy terms locked</small>
        </div>
        <div class="stat">
          <div class="eyebrow">GENVM ASSESSED</div>
          <div class="value">${counts.assessed}</div>
          <small>Evaluated by AI consensus</small>
        </div>
        <div class="stat">
          <div class="eyebrow">CHALLENGES</div>
          <div class="value">${counts.challenged}</div>
          <small>Second-round reviews</small>
        </div>
      </div>

      <div class="columns">
        <div class="surface">
          <div class="section-head">
            <h3>Recent Active Claims & Disputes</h3>
            <button id="dash-view-all-claims" class="tab">View All Registry (${cases.length}) →</button>
          </div>
          ${safeEmpty}
          <div class="case-list">
            ${recent.length ? renderCases(recent) : '<div class="blank">No cases recorded yet.</div>'}
          </div>
        </div>

        <div class="surface">
          <div class="section-head">
            <h3>Quick On-Chain Actions</h3>
          </div>
          <div class="risk">
            <div class="risk-item">
              <b>1. Submit New Shift Claim</b>
              <p>Initialize a new dispute claim with employee hours, employer counterparty, and designated attestor address.</p>
              <button id="dash-quick-claim" class="cta" style="margin-top:8px;padding:8px 14px;font-size:12px">Launch Claim Form →</button>
            </div>
            <div class="risk-item">
              <b>2. Provide Counterparty Consent</b>
              <p>Counterparties must sign consent to lock baseline shift policies and allow evidence ingestion.</p>
              <button id="dash-quick-consent" class="tab" style="margin-top:8px;padding:8px 14px;font-size:12px">Consent Workspace →</button>
            </div>
            <div class="risk-item">
              <b>3. Attest Verified Attendance</b>
              <p>Designated third-party attestors sign attendance digests with cryptographic timestamp binding.</p>
              <button id="dash-quick-evidence" class="tab" style="margin-top:8px;padding:8px 14px;font-size:12px">Evidence Desk →</button>
            </div>
            <div class="risk-item">
              <b>4. Review AI Consensus & Challenges</b>
              <p>Inspect strict validator fact vectors and submit appeals within the challenge window.</p>
              <button id="dash-quick-audit" class="tab" style="margin-top:8px;padding:8px 14px;font-size:12px">Audit Lineage →</button>
            </div>
          </div>
        </div>
      </div>

      <div class="toolbar" style="margin-top:20px">
        ${refreshButton}
      </div>
    </div>
  `;
}

function render(name) {
  if (name === 'On-chain') return chainUI.render();
  const cases = live.cases;
  const safeEmpty = loadingNote();
  const records = cases.filter(x => (x.id + ' ' + (x.status || '') + ' ' + (x.rule || '')).toLowerCase().includes(activeSearch.toLowerCase()));
  const counts = {
    total: cases.length,
    frozen: cases.filter(x => ['FROZEN', 'EVIDENCE_LOCKED', 'ATTESTED'].includes(x.status)).length,
    assessed: cases.filter(x => x.round > 0).length,
    challenged: cases.filter(x => (x.challenges || []).length > 0).length
  };
  
  if (name === 'Overview' || name === APP.view[0]) {
    return renderLandingPage(cases, counts);
  }

  if (name === 'Dashboard') {
    return renderWorkspaceDashboard(cases, counts);
  }
  
  if (['Cases', 'Claims'].includes(name)) {
    return progress() + panel('Canonical case registry', `<div class="toolbar registry-tools"><input id="case-filter" class="input" aria-label="Search current page of actual cases" placeholder="Search this page by ID, status or frozen rule" value="${esc(activeSearch)}"/>${refreshButton}</div>${safeEmpty}<div id="filtered-cases">${renderCases(records, 'No matching cases on this page.')}</div><div class="toolbar registry-pages"><span class="hint">${cases.length} records on page ${live.page+1} / ${Math.max(1,Math.ceil(live.total/live.pageSize))} · ${live.total} total on chain</span><div><button id="cases-prev" class="tab" ${live.page===0?'disabled':''}>Previous</button><input id="case-page" class="input page-input" type="number" min="1" max="${Math.max(1,Math.ceil(live.total/live.pageSize))}" value="${live.page+1}" aria-label="Page number"/><button id="cases-go" class="tab">Go</button><button id="cases-next" class="tab" ${live.complete?'disabled':''}>Next</button></div></div><div class="toolbar registry-tools"><input id="direct-case-id" class="input" placeholder="Exact case ID (including another page)" aria-label="Find exact case ID"/><button id="direct-case-search" class="tab">Open exact ID</button></div>`, 'Paged canonical registry · each detail is read from finalized Studionet state');
  }
  
  if (['Evidence', 'Policies'].includes(name)) {
    return progress() + panel(name === 'Evidence' ? 'Attested evidence registry' : 'Frozen policies', safeEmpty + (cases.length ? renderCases(cases) : renderCases([])), `Only contract-recorded ${name.toLowerCase()}`) + `<div class="toolbar" style="margin-top:20px">${refreshButton}</div>`;
  }
  
  if (name === 'Challenges') {
    return progress() + panel('Challenge ledger', safeEmpty + (cases.filter(r => (r.challenges || []).length > 0).length ? renderCases(cases.filter(r => (r.challenges || []).length > 0)) : '<div class="blank">No submitted challenge records yet.</div>'), 'Two parties have separate challenge slots') + `<div class="toolbar" style="margin-top:20px">${refreshButton}</div>`;
  }
  
  if (name === 'Audit') {
    return progress() + panel('Append-only consensus lineage', safeEmpty + (cases.length ? renderCases(cases) : '<div class="blank">No contract cases available for audit.</div>'), 'Select a real case to load its entire hash-linked history') + `<div class="toolbar" style="margin-top:20px">${refreshButton}</div>`;
  }
  
  if (name === 'Schedule') {
    return progress() + panel('Actual shift claims', safeEmpty + (cases.length ? renderCases(cases) : '<div class="blank">No shift cases exist on this contract.</div>'), 'No synthetic roster or employee data') + `<div class="toolbar" style="margin-top:20px">${refreshButton}</div>`;
  }
  
  if (name === 'Network') {
    return panel('GenLayer network and wallet', `<div class="detail"><div class="detail-box"><div class="eyebrow">RPC ENDPOINT</div><div class="mono">https://studio.genlayer.com/api</div><div id="rpc-status">Click Recheck to probe chain ID.</div></div><div class="detail-box"><div class="eyebrow">EXPECTED CHAIN ID</div><h2>${CHAIN_ID} / 0xF22F</h2><p class="mono">${esc(ADDRESS)}</p><small>${esc(live.checkedAt || 'Not checked')}</small></div><div class="toolbar">${refreshButton}<button id="probe-button" class="tab">Recheck network</button><button id="open-onchain" class="cta">Open on-chain wallet workspace</button></div></div>`, 'Studionet 61999');
  }
  
  return progress() + panel('Actual contract data', safeEmpty + renderCases(cases));
}

async function refresh(requestedPage = live.page) {
  if (!validContract) {
    live.error = 'The contract address is not configured.';
    live.loading = false;
    nav(page, false);
    return;
  }
  const generation = ++refreshGeneration;
  const cancelled = () => shouldCancelRegistryRead(generation, refreshGeneration, page);
  live.loading = true;
  live.error = '';
  nav(page, false);
  try {
    const info = parsed(await read('contract_info'));
    if (cancelled()) return;
    const total = Number(info?.case_count);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Contract did not return a valid canonical case count');
    const pageSize = CASE_REGISTRY_PAGE_SIZE, pageCount = Math.max(1, Math.ceil(total / pageSize));
    const targetPage = Math.min(Math.max(0, requestedPage), pageCount - 1);
    const ids = parsed(await read('get_case_ids_page', [targetPage * pageSize, pageSize]));
    if (cancelled()) return;
    if (!Array.isArray(ids) || ids.length > pageSize || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) {
      throw new Error('Unexpected or duplicate case page returned by contract');
    }
    const results = [];
    for (const id of ids) {
      if (cancelled()) return;
      const rec = parsed(await read('get_case', [id]));
      if (cancelled()) return;
      if (!rec || typeof rec !== 'object' || rec.id !== id) throw new Error('Canonical case ID mismatch: ' + id);
      results.push(rec);
    }
    live = { cases: results, ids, total, page: targetPage, pageSize, loading: false, error: '', checkedAt: new Date().toLocaleString(), complete: (targetPage + 1) * pageSize >= total };
  } catch (e) {
    if (cancelled()) return;
    live.loading = false;
    live.error = String(e?.shortMessage || e?.message || e).slice(0, 350);
  }
  if (page !== 'On-chain') nav(page, false);
}

function nav(name, doRefresh = true) {
  if (name === 'On-chain') {
    refreshGeneration++;
    live.loading = false;
  }
  page = name;
  const isLanding = (name === 'Overview');
  const appLayout = document.getElementById('app-layout') || document.querySelector('.layout');
  if (appLayout) {
    appLayout.className = isLanding ? 'layout landing-mode' : 'layout workspace-mode';
  }
  
  document.querySelectorAll('nav button').forEach(e => e.classList.toggle('active', e.dataset.page === name));
  const pageNameEl = $('page-name');
  if (pageNameEl) pageNameEl.textContent = name;
  
  const backBtn = $('back-to-landing-btn') || $('nav-back-to-landing');
  if (backBtn) {
    backBtn.style.display = isLanding ? 'none' : 'inline-flex';
  }
  
  if ($('hero-area')) {
    $('hero-area').style.display = 'none';
  }
  
  $('main-content').innerHTML = render(name);
  bind();
  if (isLanding) {
    if (location.pathname.startsWith('/app')) history.pushState({}, '', '/');
    history.replaceState({}, '', '#' + encodeURIComponent(name.toLowerCase()));
  } else {
    if (!location.pathname.startsWith('/app')) history.pushState({}, '', '/app');
    history.replaceState({}, '', '/app#' + encodeURIComponent(name.toLowerCase()));
  }
  if (doRefresh && name !== 'On-chain' && !live.checkedAt && !live.loading) void refresh();
}

async function detail(id) {
  $('modal-body').innerHTML = '<div class="blank">Fetching authentic contract history…</div>';
  $('detail-modal').hidden = false;
  try {
    const record = parsed(await read('get_case', [id]));
    const history = parsed(await read('get_history', [id]));
    if (!Array.isArray(history)) throw new Error('Unexpected history response');
    if (!record || record.id !== id) throw new Error('Canonical case ID mismatch');
    const integrity = await verifyAuditHistory(history);
    const a = esc;
    
    $('modal-body').innerHTML = `
      <div class="eyebrow">ON-CHAIN CASE / ${a(id)}</div>
      <h2>${a(record.status || 'UNKNOWN')}</h2>
      ${renderLifecycleStepper(record.status)}
      <div class="detail">
        <div class="detail-box">
          <div class="eyebrow">FROZEN POLICY / RULE</div>
          <p>${a(record.rule || 'Not frozen')}</p>
          <p class="mono">${a(record.rule_hash || 'No frozen hash')}</p>
        </div>
        <div class="detail-box">
          <div class="eyebrow">SHIFT MINUTES ARITHMETIC</div>
          <p>Requested: <b>${a(record.requested_minutes ?? 0)} min</b></p>
          <p>Policy Maximum: <b>${a(record.max_minutes ?? 0)} min</b></p>
          <p>Provisional Approved: <b>${a(record.provisional_approved_minutes ?? 0)} min</b></p>
          <p>Final Approved: <b>${a(record.approved_minutes ?? 0)} min</b></p>
        </div>
        <div class="detail-box">
          <div class="eyebrow">AUTHORITIES</div>
          <p>Creator: <span class="mono">${a(record.creator)}</span></p>
          <p>Counterparty: <span class="mono">${a(record.recipient)}</span></p>
          <p>Attestor: <span class="mono">${a(record.attestor)}</span></p>
          <p>Consent: <b>${a(record.consented ? 'Yes' : 'No')}</b></p>
        </div>
        <div class="detail-box">
          <div class="eyebrow">EVIDENCE</div>
          <p>${a(record.evidence || 'No evidence')}</p>
          <p class="mono">${a(record.evidence_hash || 'No digest')}</p>
          <small>Source: ${a(record.source_ref || 'Not attested')}</small>
        </div>
      </div>
      ${renderConsensusMatrix(record, history)}
      <div class="surface" style="margin-top:14px">
        <div class="section-head">
          <h2>Canonical history</h2>
          <span class="hint">${history.length} entries · ${integrity.valid ? 'hash links verified' : 'INTEGRITY FAILURE at entry ' + integrity.at}</span>
        </div>
        <pre class="mono" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto">${a(stringify(history))}</pre>
      </div>
      <p class="footnote" style="margin-top:10px">History integrity: ${integrity.valid ? 'all SHA-256 entry links verified' : 'FAILED; do not rely on this audit view'}. A designated on-chain attestor proves wallet control, not independently verified identity or real-world document truth. Source SHA-256: ${esc(window.CONTRACT_SOURCE_SHA256 || 'unavailable')}.</p>
    `;
  } catch (e) {
    $('modal-body').textContent = 'Contract case read failed: ' + String(e?.message || e);
  }
}

async function probe() {
  const e = $('rpc-status');
  if (e) e.textContent = 'Checking Studionet RPC…';
  try {
    const r = await fetch('https://studio.genlayer.com/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 })
    });
    const q = await r.json();
    const actual = parseInt(q.result, 16);
    if (e) e.textContent = actual === CHAIN_ID ? 'Verified chain ID 61999' : 'Unexpected chain ID: ' + actual;
  } catch (err) {
    if (e) e.textContent = 'Network check failed: ' + String(err.message || err);
  }
}

function updateGlobalWalletUI(ws) {
  const labelEl = $('global-wallet-label');
  const btnEl = $('global-wallet-btn');
  const heroBtn = $('hero-connect-wallet');
  const networkNameEl = $('global-network-name');
  const signalDot = $('global-signal-dot');
  
  if (ws.connected && ws.address) {
    const short = shorten(ws.address);
    if (labelEl) labelEl.textContent = short;
    if (btnEl) {
      btnEl.classList.add('connected');
      btnEl.title = `Connected: ${ws.address} (Studionet 61999)`;
    }
    if (heroBtn) heroBtn.textContent = short;
    if (networkNameEl) networkNameEl.textContent = 'Studionet · 61999';
    if (signalDot) signalDot.style.background = '#10b981';
  } else if (ws.address && !ws.isStudionet) {
    if (labelEl) labelEl.textContent = 'Wrong Network';
    if (btnEl) btnEl.classList.remove('connected');
    if (heroBtn) heroBtn.textContent = 'Switch Network';
    if (networkNameEl) networkNameEl.textContent = `Chain ${ws.chainId || 'Unknown'}`;
    if (signalDot) signalDot.style.background = '#ef4444';
  } else {
    if (labelEl) labelEl.textContent = 'Connect Wallet';
    if (btnEl) btnEl.classList.remove('connected');
    if (heroBtn) heroBtn.textContent = 'Connect Wallet';
    if (networkNameEl) networkNameEl.textContent = 'Studionet · 61999';
    if (signalDot) signalDot.style.background = '#10b981';
  }
}

function openWalletModal() {
  const ws = getWalletState();
  const modal = $('wallet-modal');
  const body = $('wallet-modal-body');
  if (!modal || !body) return;
  
  if (ws.connected) {
    body.innerHTML = `
      <div class="detail-box" style="margin-bottom:14px">
        <div class="eyebrow">CONNECTED ACCOUNT</div>
        <p class="mono" style="font-size:13px;font-weight:700">${esc(ws.address)}</p>
        <button id="copy-wallet-address" class="tab" style="font-size:11px;padding:4px 10px;margin-top:6px">📋 Copy Address</button>
      </div>
      <div class="detail-box" style="margin-bottom:14px">
        <div class="eyebrow">NETWORK</div>
        <p><b>GenLayer Studionet</b> (Chain ID: 61999 / 0xF22F)</p>
        <small class="muted">RPC: https://studio.genlayer.com/api</small>
      </div>
      <div class="toolbar" style="margin:0">
        <a href="https://explorer-studio.genlayer.com/address/${esc(ws.address)}" target="_blank" rel="noopener noreferrer" class="tab" style="display:inline-block;padding:8px 14px">Explorer ↗</a>
        <button id="modal-disconnect-wallet" class="tab" style="color:#ef4444">Disconnect</button>
      </div>
    `;
    $('copy-wallet-address')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(ws.address);
      $('copy-wallet-address').textContent = '✓ Copied!';
      setTimeout(() => { if ($('copy-wallet-address')) $('copy-wallet-address').textContent = '📋 Copy Address'; }, 2000);
    });
    $('modal-disconnect-wallet')?.addEventListener('click', () => {
      disconnectWallet();
      modal.hidden = true;
    });
  } else if (ws.address && !ws.isStudionet) {
    body.innerHTML = `
      <div class="detail-box" style="margin-bottom:14px;border-color:#fca5a5;background:#fef2f2">
        <div class="eyebrow" style="color:#b91c1c">UNSUPPORTED CHAIN</div>
        <p style="color:#b91c1c">Your wallet is connected to Chain ID <b>${esc(ws.chainId)}</b>. ShiftFair requires GenLayer Studionet (61999).</p>
        <button id="modal-switch-network" class="cta" style="margin-top:8px">Switch to Studionet</button>
      </div>
    `;
    $('modal-switch-network')?.addEventListener('click', async () => {
      try {
        await switchOrAddStudionet();
        modal.hidden = true;
      } catch (err) {
        alert('Network switch failed: ' + (err?.message || err));
      }
    });
  } else {
    body.innerHTML = `
      <div class="detail-box" style="margin-bottom:14px">
        <div class="eyebrow">NO WALLET CONNECTED</div>
        <p class="muted">Connect your browser wallet (MetaMask or EIP-1193 compatible) to create shift claims, sign consents, submit evidence, and challenge determinations.</p>
        <button id="modal-connect-wallet" class="cta" style="margin-top:10px">Connect Web3 Wallet</button>
      </div>
    `;
    $('modal-connect-wallet')?.addEventListener('click', async () => {
      try {
        await connectGlobalWallet();
        modal.hidden = true;
      } catch (err) {
        alert('Wallet connection failed: ' + (err?.message || err));
      }
    });
  }
  
  modal.hidden = false;
}

async function handleWalletAction() {
  const ws = getWalletState();
  if (ws.connected) {
    openWalletModal();
  } else if (ws.address && !ws.isStudionet) {
    try {
      await switchOrAddStudionet();
    } catch {
      openWalletModal();
    }
  } else {
    try {
      await connectGlobalWallet();
    } catch {
      openWalletModal();
    }
  }
}

function bind() {
  if (page === 'On-chain') {
    chainUI.bind();
    return;
  }
  
  document.querySelectorAll('[data-live-case]').forEach(n => {
    const action = () => void detail(n.dataset.liveCase);
    n.addEventListener('click', action);
    n.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        action();
      }
    });
  });
  
  $('live-refresh')?.addEventListener('click', () => void refresh(live.page));
  $('cases-prev')?.addEventListener('click', () => void refresh(Math.max(0, live.page - 1)));
  $('cases-next')?.addEventListener('click', () => void refresh(live.page + 1));
  $('cases-go')?.addEventListener('click', () => {
    const n = Number($('case-page')?.value);
    if (Number.isInteger(n) && n >= 1) void refresh(n - 1);
  });
  $('direct-case-search')?.addEventListener('click', () => {
    const id = String($('direct-case-id')?.value || '').trim();
    if (id) void detail(id);
  });
  $('open-onchain')?.addEventListener('click', () => nav('On-chain'));
  $('probe-button')?.addEventListener('click', () => void probe());
  $('case-filter')?.addEventListener('input', e => {
    activeSearch = e.target.value;
    const filtered = live.cases.filter(r => (r.id + ' ' + (r.status || '') + ' ' + (r.rule || '')).toLowerCase().includes(activeSearch.toLowerCase()));
    $('filtered-cases').innerHTML = renderCases(filtered);
    document.querySelectorAll('#filtered-cases [data-live-case]').forEach(n => n.addEventListener('click', () => void detail(n.dataset.liveCase)));
  });

  // Landing Page & Enter App CTAs
  $('nav-enter-app-btn')?.addEventListener('click', () => nav('Dashboard'));
  $('hero-enter-app')?.addEventListener('click', () => nav('Dashboard'));
  $('landing-launch-workspace')?.addEventListener('click', () => nav('Dashboard'));
  $('back-to-landing-btn')?.addEventListener('click', () => nav('Overview'));
  $('hero-connect-wallet')?.addEventListener('click', handleWalletAction);
  $('hero-view-registry')?.addEventListener('click', () => nav('Claims'));
  $('view-all-claims-btn')?.addEventListener('click', () => nav('Claims'));
  $('landing-wallet-trigger')?.addEventListener('click', handleWalletAction);

  // Dashboard Workspace triggers
  $('dash-create-claim')?.addEventListener('click', () => nav('On-chain'));
  $('dash-open-onchain')?.addEventListener('click', () => nav('On-chain'));
  $('dash-view-all-claims')?.addEventListener('click', () => nav('Claims'));
  $('dash-quick-claim')?.addEventListener('click', () => nav('On-chain'));
  $('dash-quick-consent')?.addEventListener('click', () => nav('On-chain'));
  $('dash-quick-evidence')?.addEventListener('click', () => nav('Evidence'));
  $('dash-quick-audit')?.addEventListener('click', () => nav('Audit'));
}

// Global Wallet Listeners
subscribeWallet(updateGlobalWalletUI);
$('global-wallet-btn')?.addEventListener('click', handleWalletAction);
$('close-wallet-modal')?.addEventListener('click', () => { $('wallet-modal').hidden = true; });

// Navigation & Modals
document.querySelectorAll('nav button').forEach(e => e.addEventListener('click', () => nav(e.dataset.page)));
$('nav-enter-app-btn')?.addEventListener('click', () => nav('Dashboard'));
$('nav-back-to-landing')?.addEventListener('click', () => nav('Overview'));
$('nav-brand-logo')?.addEventListener('click', () => nav('Overview'));
$('primary-action')?.addEventListener('click', () => nav('On-chain'));
$('close-unavailable')?.addEventListener('click', () => { $('unavailable-modal').hidden = true; });
$('close-detail')?.addEventListener('click', () => { $('detail-modal').hidden = true; });

const fromHash = decodeURIComponent(location.hash.slice(1)).toLowerCase();
const isAppPath = location.pathname.startsWith('/app');
if (isAppPath) {
  nav([...APP.view, 'On-chain'].find(x => x.toLowerCase() === fromHash) || 'Dashboard');
} else {
  nav([...APP.view, 'On-chain'].find(x => x.toLowerCase() === fromHash) || 'Overview');
}

window.addEventListener('popstate', () => {
  if (location.pathname.startsWith('/app')) {
    if (page === 'Overview') nav('Dashboard', false);
  } else {
    if (page !== 'Overview') nav('Overview', false);
  }
});
