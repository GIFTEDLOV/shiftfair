import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const evidenceDir=path.resolve(root,'..','evidence');
const proof=JSON.parse(fs.readFileSync(path.join(evidenceDir,'signed-browser-lifecycle.json'),'utf8'));
const readback=JSON.parse(fs.readFileSync(path.join(evidenceDir,'signed-browser-lifecycle-readback.json'),'utf8'));
assert.equal(proof.app,'ShiftFair');
const useLocal=!process.env.APP_URL;
const base=(process.env.APP_URL||'http://127.0.0.1:4183').replace(/\/+$/,'');
const server=useLocal?spawn(process.execPath,[path.join(root,'node_modules','vite','bin','vite.js'),'preview','--host','127.0.0.1','--port','4183','--strictPort'],{cwd:root,stdio:'ignore'}):null;
const browser=await chromium.launch({headless:true});
try{
 if(useLocal){let ready=false;for(let i=0;i<80;i++){try{const response=await fetch(base);if(response.ok){ready=true;break}}catch{}await delay(250)}assert.equal(ready,true,'Local production preview failed to start')}
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`${base}/#claims`,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#case-page',{timeout:60000});
 await page.waitForFunction(()=>{const main=document.querySelector('#main-content')?.innerText||'';return main.includes('Live read failed:')||!main.includes('Reading GenLayer contract state')});
 assert.doesNotMatch(await page.locator('#main-content').innerText(),/Live read failed:/,'Initial canonical registry read must succeed');
 const maxPage=Number(await page.locator('#case-page').getAttribute('max'));
 assert.ok(Number.isInteger(maxPage)&&maxPage>=1,'The on-chain registry must expose a valid page count');
 const visitPage=async n=>{
  await page.locator('#case-page').fill(String(n));
  await page.locator('#cases-go').click();
  await page.waitForFunction(n=>{
   const main=document.querySelector('#main-content')?.innerText||'';
   return document.querySelector('#case-page')?.value===String(n)&&!main.includes('Reading GenLayer contract state')&&!main.includes('Live read failed:');
  },maxPage,{timeout:60000});
  assert.ok(await page.locator('#filtered-cases [data-live-case]').count()<=10,'Registry page exceeds the public page bound');
 };
 await visitPage(maxPage);
 const firstVisibleId=await page.locator('#filtered-cases [data-live-case]').first().getAttribute('data-live-case');
 if(firstVisibleId){
  await page.locator('#case-filter').fill(firstVisibleId);
  await page.waitForFunction(id=>document.querySelectorAll('#filtered-cases [data-live-case]').length===1&&document.querySelector('#filtered-cases [data-live-case]')?.dataset.liveCase===id,firstVisibleId);
 }
 await page.locator('#direct-case-id').fill(proof.caseId);
 await page.locator('#direct-case-search').click();
 await page.waitForFunction(()=>document.querySelector('#modal-body')?.textContent.includes('ON-CHAIN CASE /'));
 const detail=await page.locator('#modal-body').innerText();
 for(const expected of ['FINALIZED',readback.canonical.verdict,'History integrity: all SHA-256 entry links verified'])assert.ok(detail.includes(expected),`Live case detail omitted ${expected}`);
 assert.deepEqual(errors,[],'Browser JavaScript errors');
 await page.screenshot({path:path.join(evidenceDir,'signed-browser-registry.png'),fullPage:true});
 const result={schemaVersion:1,generatedAt:new Date().toISOString(),app:'ShiftFair',url:base,contract:proof.contract,chainId:61999,caseId:proof.caseId,search:{page:maxPage,pageSize:10,filter:'exact on-chain case ID',resultCount:1},detail:{status:'FINALIZED',verdict:readback.canonical.verdict,challengeCount:readback.canonical.challengeCount,historyEntries:readback.canonical.historyEntries,historyLinks:'verified'},javascriptErrors:errors};
 fs.writeFileSync(path.join(evidenceDir,'signed-browser-registry.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({result:'PASS',...result}));
}finally{await browser.close();server?.kill()}
