import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { decodeFunctionData, keccak256 } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

if (process.env.ALLOW_STUDIONET_LIVE_WRITES !== 'yes') {
  throw new Error('This writes permanent synthetic qualification records. Set ALLOW_STUDIONET_LIVE_WRITES=yes only for an authorized Studionet run.');
}

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slug = path.basename(path.resolve(webRoot, '..')).toLowerCase();
const apps = {
  parcelcourt: { name: 'ParcelCourt', address: '0xC0B3De8897015a9aAfDc06EB4d09FD2F4d62BA72', url: 'https://parcelcourt-genlayer.vercel.app' },
  shiftfair: { name: 'ShiftFair', address: '0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd', url: 'https://shiftfair-genlayer.vercel.app' }
};
const app = apps[slug];
assert.ok(app, 'Run only from ParcelCourt or ShiftFair');
const targetUrl = (process.env.APP_URL || app.url).replace(/\/+$/, '');
const RPC = 'https://studio.genlayer.com/api';
const CHAIN = 61999;
const CHAIN_HEX = '0xf22f';
const accounts = [0, 1, 2].map(() => privateKeyToAccount(generatePrivateKey()));
let activeIndex = 0;
let currentAction = '';
let actionBroadcastAttempted = false;
const client = createClient({ chain: studionet });
const caseId = `BROWSER-LIFECYCLE-${Date.now()}-${app.name}`;
const evidenceDir = path.resolve(webRoot, '..', 'evidence');
const proofPath = path.join(evidenceDir, 'signed-browser-lifecycle.json');
const screenshotPath = path.join(evidenceDir, 'signed-browser-lifecycle.png');
const record = {
  schemaVersion: 1,
  app: app.name,
  url: targetUrl,
  contract: app.address,
  chainId: CHAIN,
  caseId,
  syntheticQualificationOnly: true,
  signerAddresses: accounts.map(account => account.address),
  privateKeysPersisted: false,
  transactions: [],
  steps: [],
  phase: 'PREFLIGHT'
};
const save = () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(proofPath, JSON.stringify(record, null, 2) + '\n');
};
const rpc = async (method, params = []) => {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(30000)
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(`RPC ${method}: ${String(payload.error?.message || response.status).slice(0, 400)}`);
  return payload.result;
};
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const exists = await client.readContract({
  address: app.address, functionName: 'case_exists', args: [caseId],
  transactionHashVariant: TransactionHashVariant.LATEST_FINAL
});
if (exists !== false) throw new Error('Preflight did not prove the unique case ID is absent');
record.preflight = { functionName: 'case_exists', exists, source: 'GenLayerJS 1.1.8 LATEST_FINAL' };
record.phase = 'PREFLIGHT_CLEAR';
save();

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const browserErrors = [];
page.on('pageerror', error => browserErrors.push(String(error.message).slice(0, 300)));
page.on('console', message => {
  if (message.type() === 'error') browserErrors.push(String(message.text()).slice(0, 300));
});

try {
  await page.exposeFunction('__setActiveTestSigner', index => {
    if (!Number.isInteger(index) || index < 0 || index >= accounts.length) throw new Error('Invalid test signer index');
    activeIndex = index;
    return accounts[index].address;
  });
  await page.exposeFunction('__testWalletRequest', async request => {
    const method = request?.method;
    const params = request?.params || [];
    const account = accounts[activeIndex];
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account.address];
    if (method === 'eth_chainId') return CHAIN_HEX;
    if (method === 'wallet_getSnaps' || method === 'wallet_requestSnaps') return {};
    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
      const requested = params[0]?.chainId;
      if (requested && Number.parseInt(requested, 16) !== CHAIN) throw new Error('Refusing any network other than Studionet 61999');
      return null;
    }
    if (method === 'eth_sendTransaction') {
      if (actionBroadcastAttempted) throw new Error('Duplicate signed write blocked; do not retry this step');
      actionBroadcastAttempted = true;
      const raw = params[0];
      if (!raw || raw.from?.toLowerCase() !== account.address.toLowerCase()) throw new Error('Wallet sender differs from the active party');
      if (raw.to?.toLowerCase() !== studionet.consensusMainContract.address.toLowerCase()) throw new Error('Unexpected GenLayer consensus contract');
      if (Number.parseInt(raw.chainId || CHAIN_HEX, 16) !== CHAIN) throw new Error('Refusing a transaction for another chain');
      const decoded = decodeFunctionData({ abi: studionet.consensusMainContract.abi, data: raw.data });
      if (decoded.functionName !== 'addTransaction') throw new Error('Expected GenLayer consensus addTransaction');
      const [sender, recipient] = decoded.args;
      if (String(sender).toLowerCase() !== account.address.toLowerCase() || String(recipient).toLowerCase() !== app.address.toLowerCase()) {
        throw new Error('Signed transaction sender or embedded project contract is incorrect');
      }
      const nonce = raw.nonce !== undefined ? BigInt(raw.nonce) : BigInt(await rpc('eth_getTransactionCount', [account.address, 'latest']));
      const gas = raw.gas !== undefined ? BigInt(raw.gas) : BigInt(await rpc('eth_estimateGas', [raw]));
      const value = BigInt(raw.value ?? '0x0');
      const eip1559 = raw.type === '0x2' || raw.type === 2 || raw.maxFeePerGas !== undefined;
      const transaction = {
        chainId: CHAIN, nonce: Number(nonce), gas, to: raw.to, data: raw.data, value,
        type: eip1559 ? 'eip1559' : 'legacy'
      };
      if (eip1559) {
        transaction.maxFeePerGas = BigInt(raw.maxFeePerGas ?? await rpc('eth_gasPrice', []));
        transaction.maxPriorityFeePerGas = BigInt(raw.maxPriorityFeePerGas ?? '0x0');
      } else {
        transaction.gasPrice = BigInt(raw.gasPrice ?? await rpc('eth_gasPrice', []));
      }
      const serialized = await account.signTransaction(transaction);
      const expectedHash = keccak256(serialized);
      const txRecord = {
        action: currentAction,
        signer: account.address,
        expectedHash,
        phase: 'SIGNED_NOT_BROADCAST',
        to: raw.to,
        contractRecipient: app.address,
        nonce: Number(nonce),
        calldataSha256: createHash('sha256').update(Buffer.from(raw.data.slice(2), 'hex')).digest('hex')
      };
      record.transactions.push(txRecord);
      record.phase = 'SIGNED_NOT_BROADCAST';
      save();
      let hash;
      try {
        hash = await rpc('eth_sendRawTransaction', [serialized]);
      } catch (error) {
        txRecord.phase = 'UNKNOWN_BROADCAST_STATE';
        txRecord.broadcastError = String(error.message || error).slice(0, 400);
        record.phase = 'UNKNOWN_BROADCAST_STATE';
        save();
        throw new Error('Broadcast outcome uncertain. The exact signed hash is saved; no write will be retried.');
      }
      txRecord.hash = hash;
      txRecord.phase = 'BROADCAST_NO_FINALITY';
      txRecord.hashMatchesSignedPayload = hash.toLowerCase() === expectedHash.toLowerCase();
      record.phase = 'BROADCAST_NO_FINALITY';
      save();
      console.log(`SIGNED_BROADCAST ${app.name} ${currentAction} ${hash}`);
      if (!txRecord.hashMatchesSignedPayload) throw new Error('Broadcast hash differs from the locally signed transaction');
      return hash;
    }
    if (typeof method === 'string' && method.startsWith('eth_')) return rpc(method, params);
    throw new Error(`Unsupported EIP-1193 method ${String(method)}`);
  });
  await page.addInitScript(() => {
    const handlers = new Map();
    window.ethereum = {
      isMetaMask: true,
      isConnected: () => true,
      networkVersion: '61999',
      request: request => window.__testWalletRequest(request),
      on: (event, handler) => {
        const list = handlers.get(event) || [];
        list.push(handler);
        handlers.set(event, list);
      },
      removeListener: () => {}
    };
    window.__switchTestSigner = async index => {
      const address = await window.__setActiveTestSigner(index);
      for (const handler of handlers.get('accountsChanged') || []) handler([address]);
      return address;
    };
  });
  await page.route('**/*', async route => {
    if (route.request().url().startsWith(RPC)) {
      const req = route.request();
      const cors = {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST,OPTIONS',
        'access-control-allow-headers': 'content-type,authorization',
        'content-type': 'application/json'
      };
      if (req.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors, body: '' });
        return;
      }
      const response = await fetch(RPC, {
        method: req.method(), headers: { 'content-type': 'application/json' },
        body: req.postDataBuffer(), signal: AbortSignal.timeout(30000)
      });
      await route.fulfill({
        status: response.status,
        headers: { ...cors, 'content-type': response.headers.get('content-type') || 'application/json' },
        body: Buffer.from(await response.arrayBuffer())
      });
    } else {
      await route.continue();
    }
  });
  await page.goto(`${targetUrl}/#on-chain`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (await page.evaluate(() => window.CONTRACT_ADDRESS) !== app.address ||
      await page.evaluate(() => window.RELEASE_QUALIFIED) !== true) {
    throw new Error('Production contract binding or signed-write qualification gate mismatch');
  }
  const distinct = new Set(accounts.map(account => account.address.toLowerCase()));
  if (distinct.size !== 3) throw new Error('Creator, recipient and attestor test wallets are not distinct');

  await page.locator('#chain-case-id').fill(caseId);
  await page.locator('#chain-recipient').fill(accounts[1].address);
  await page.locator('#chain-attestor').fill(accounts[2].address);
  await page.locator('#chain-rule').fill(`Synthetic ${app.name} qualification only: test policy and test evidence; no real-world claim or settlement.`);
  await page.locator('#chain-hours').fill('24');
  if (app.name === 'ShiftFair') {
    await page.locator('#requested-minutes').fill('120');
    await page.locator('#max-minutes').fill('90');
  }

  const steps = [
    { action: 'create_case', signer: 0, status: 'DRAFT', evidence: 'Synthetic qualification evidence only.' },
    { action: 'consent', signer: 1, status: 'DRAFT' },
    { action: 'freeze', signer: 0, status: 'FROZEN' },
    { action: 'submit_evidence', signer: 1, status: 'EVIDENCE_LOCKED', evidence: 'Synthetic test evidence. It does not establish delivery, employment or issuer identity.' },
    { action: 'attest_evidence', signer: 2, status: 'ATTESTED', source: 'SYNTHETIC-QUALIFICATION-ONLY' },
    { action: 'adjudicate', signer: 0, status: 'ASSESSED', round: 1 },
    { action: 'challenge', signer: 0, status: 'CHALLENGED', evidence: 'Test challenge: confirm that the synthetic evidence supports each frozen condition.' },
    { action: 'challenge', signer: 1, status: 'CHALLENGED', evidence: 'Test response: independently dispute the synthetic record; no factual claim is made.' },
    { action: 'adjudicate', signer: 0, status: 'ASSESSED', round: 2 },
    { action: 'finalize_case', signer: 2, status: 'FINALIZED', round: 2 }
  ];
  record.phase = 'LIFECYCLE_RUNNING';
  record.expectedSteps = steps.map(({ action, signer, status, round }) => ({ action, signerAddress: accounts[signer].address, status, round: round ?? null }));
  save();

  for (const step of steps) {
    currentAction = step.action;
    actionBroadcastAttempted = false;
    const signer = accounts[step.signer];
    await page.evaluate(index => window.__switchTestSigner(index), step.signer);
    await page.locator('#chain-wallet').click();
    await page.waitForFunction(address => document.querySelector('#chain-wallet-info')?.textContent.includes(address), signer.address, { timeout: 20000 });
    await page.locator('#chain-case-id').fill(caseId);
    await page.locator('#chain-action').selectOption(step.action);
    if (step.evidence) await page.locator('#chain-evidence').fill(step.evidence);
    if (step.source) await page.locator('#chain-source').fill(step.source);
    const priorHash = record.transactions.at(-1)?.hash || null;
    await page.locator('#chain-execute').click({ timeout: 30000 });
    await page.waitForFunction(() => {
      const output = document.querySelector('#chain-output')?.textContent || '';
      return output.includes('VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE') || output.includes('Submission ');
    }, null, { timeout: 600000 });
    const output = await page.locator('#chain-output').innerText();
    const transaction = record.transactions.at(-1);
    if (!transaction || transaction.action !== step.action || transaction.hash === priorHash) {
      throw new Error(`No unique signed broadcast was captured for ${step.action}: ${output.slice(0, 500)}`);
    }
    if (!output.includes('VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE')) {
      throw new Error(`The app did not verify ${step.action}; saved hash ${transaction.hash}: ${output.slice(0, 500)}`);
    }
    const uiEvidence = JSON.parse(output);
    if (uiEvidence.transaction !== transaction.hash || uiEvidence.phase !== 'FINALIZED' ||
        uiEvidence.case?.status !== step.status) {
      throw new Error(`Unexpected canonical state for ${step.action}: ${output.slice(0, 700)}`);
    }
    if (step.round && uiEvidence.case?.round !== step.round) throw new Error(`Unexpected semantic round after ${step.action}`);
    if (step.action === 'create_case' && uiEvidence.case?.creator?.toLowerCase() !== signer.address.toLowerCase()) {
      throw new Error('Created case owner differs from signed browser wallet');
    }
    if (step.action === 'challenge' && !uiEvidence.case?.challenges?.some(challenge => challenge.actor?.toLowerCase() === signer.address.toLowerCase())) {
      throw new Error('Challenge state does not record the signed party');
    }
    transaction.phase = 'VERIFIED_FINALIZED_EXECUTION_AND_CANONICAL_STATE';
    transaction.uiEvidence = {
      action: step.action,
      phase: uiEvidence.phase,
      consensus: uiEvidence.consensus,
      successfulLeaderExecutions: uiEvidence.genvmLeaders,
      independentValidators: uiEvidence.independentValidators,
      canonicalState: uiEvidence.case,
      historyEntries: uiEvidence.history?.length ?? null
    };
    record.steps.push({ action: step.action, hash: transaction.hash, state: uiEvidence.case });
    record.phase = `STEP_${record.steps.length}_OF_${steps.length}_VERIFIED`;
    save();
  }

  for (const txRecord of record.transactions) {
    let transaction;
    let lastError;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        transaction = await client.getTransaction({ hash: txRecord.hash });
        break;
      } catch (error) {
        lastError = String(error?.shortMessage || error?.message || error).slice(0, 300);
        if (attempt < 5) await delay(Math.min(20000, 3000 * (2 ** attempt)));
      }
    }
    if (!transaction) throw new Error(`Independent receipt read failed for ${txRecord.hash}: ${lastError}`);
    const phase = transaction?.statusName ?? transaction?.status_name;
    const consensus = transaction?.resultName ?? transaction?.result_name;
    const leaders = transaction?.consensus_data?.leader_receipt || [];
    const material = leaders.filter(item => !(item.execution_result === 'ERROR' && /validator execution cancelled after quorum/i.test(String(item?.genvm_result?.stderr || item?.error || ''))));
    const successful = material.filter(item => item.execution_result === 'SUCCESS');
    const failed = material.filter(item => item.execution_result !== 'SUCCESS');
    const validators = transaction?.consensus_data?.validators || [];
    if (phase !== 'FINALIZED' || consensus !== 'MAJORITY_AGREE' || !successful.length || failed.length ||
        (['adjudicate'].includes(txRecord.action) && !validators.length)) {
      throw new Error(`Independent receipt failed for ${txRecord.action}: ${phase}/${consensus}; leaders=${successful.length}, failed=${failed.length}, validators=${validators.length}`);
    }
    txRecord.receipt = {
      phase,
      consensus,
      successfulLeaderExecutions: successful.length,
      postQuorumCancellations: leaders.length - material.length,
      validatorCount: validators.length,
      leaderExecutionResults: leaders.map(item => ({
        execution_result: item.execution_result,
        canceledAfterQuorum: item.execution_result === 'ERROR' && /validator execution cancelled after quorum/i.test(String(item?.genvm_result?.stderr || item?.error || ''))
      })),
      validatorReceiptSha256: createHash('sha256').update(JSON.stringify(validators)).digest('hex')
    };
    save();
    await delay(1200);
  }

  const finalReadRaw = await client.readContract({
    address: app.address, functionName: 'get_case', args: [caseId],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL
  });
  const finalExists = await client.readContract({
    address: app.address, functionName: 'case_exists', args: [caseId],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL
  });
  const finalState = parse(finalReadRaw);
  if (finalExists !== true || finalState?.id !== caseId || finalState?.status !== 'FINALIZED' || finalState?.round !== 2) {
    throw new Error('Independent latest-final read does not show the expected round-two finalized case');
  }
  record.terminal = { exists: finalExists, status: finalState.status, verdict: finalState.result, round: finalState.round, state: finalState };
  record.phase = 'VERIFIED_FULL_BROWSER_LIFECYCLE';
  record.browserErrors = browserErrors;
  record.verifiedAt = new Date().toISOString();
  if (browserErrors.length) throw new Error('Browser JavaScript errors: ' + browserErrors.join(' | '));
  save();
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(JSON.stringify({
    result: 'PASS',
    app: app.name,
    url: targetUrl,
    caseId,
    signerAddresses: record.signerAddresses,
    privateKeysPersisted: false,
    transactionCount: record.transactions.length,
    transactionHashes: record.transactions.map(tx => tx.hash),
    terminal: record.terminal,
    proof: proofPath
  }, null, 2));
} catch (error) {
  record.error = String(error.message || error).slice(0, 1200);
  record.phase = record.transactions.some(tx => tx.hash) ? 'BROADCAST_REQUIRES_RECONCILIATION' : record.phase;
  record.browserErrors = browserErrors;
  save();
  console.error(JSON.stringify({
    app: app.name,
    caseId,
    phase: record.phase,
    error: record.error,
    lastBroadcast: record.transactions.at(-1)?.hash || null,
    proof: proofPath
  }, null, 2));
  process.exitCode = 1;
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}
