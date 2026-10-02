import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const artifactDir=process.env.BROWSER_ARTIFACT_DIR||path.join(os.tmpdir(),'split-browser-check');fs.mkdirSync(artifactDir,{recursive:true});
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3100',NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',code=>reject(new Error('Server exited '+code)))});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const width of [1440,375]){
  const page=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'});const errors=[],missing=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/assets/')&&r.status()!==200)missing.push(r.url())});
  await page.route('**/api/**',route=>route.fulfill({json:{success:true,ok:true,coreReady:true,splitReady:true,launchReady:true,network:'solana-devnet',paymentCreationReady:true,storageDurable:true,emailReady:false,routerReady:true,uploadReady:true,storageReady:true,launchAuthReady:true,services:{storage:true,email:true},launches:[],tokens:[]}}));
  await page.goto('http://127.0.0.1:3100');
  await page.screenshot({path:path.join(artifactDir,'improved-home-'+width+'.png'),fullPage:true});
  assert.equal(await page.locator('#showcaseCalcEach').textContent(),'$300.00');
  await page.locator('#showcaseCalcTotal').fill('10');await page.locator('#showcaseCalcPeople').fill('3');
  assert.equal(await page.locator('#showcaseCalcEach').textContent(),'$3.333333–$3.333334');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>window.showSplitCreator());
  assert.equal(await page.locator('.sc-person-email').first().isVisible(),false);
  assert.equal(await page.locator('#scNetworkGrid .selected').count(),0);
  assert.equal(await page.locator('#scAssetGrid button').count(),0);
  assert.equal(await page.locator('#scConnectBtn').isDisabled(),true);
  assert.equal(await page.locator('#scSumEach').textContent(),'—');
  await page.locator('#scNetworkGrid button').filter({hasText:'Solana ecosystem'}).click();
  assert.equal(await page.locator('#scSumEach').textContent(),'300.00 USDC');
  assert.equal(await page.locator('#splitCreatorPage').isVisible(),true);
  await page.screenshot({path:path.join(artifactDir,'improved-form-'+width+'.png'),fullPage:true});
  await page.locator('#scModeManual').click();assert.equal(await page.locator('#scManualAddress').isVisible(),true);
  const before=await page.locator('#scPeople .sc-person').count();await page.locator('#scAddPerson').click();assert.equal(await page.locator('#scPeople .sc-person').count(),before+1);
  await page.locator('#scTotal').fill('2400');await page.locator('#scTotal').dispatchEvent('input');assert.match(await page.locator('#scSumTotal').textContent(),/2,400/);assert.equal(await page.locator('#scSumEach').textContent(),'480.00 USDC');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#scBackHome').click();assert.equal(await page.locator('#app').isVisible(),true);
  await page.evaluate(()=>openLaunchCreator());assert.equal(await page.locator('#launchModal').isVisible(),true);
  assert.equal(await page.locator('#launchInitialBuyUsd').getAttribute('min'),'5');
  await page.evaluate(()=>openLaunchWalletModal('launch'));assert.equal(await page.locator('#walletChooserModal').isVisible(),true);
  await page.evaluate(()=>closeLaunchWalletModal());await page.evaluate(()=>closeLaunchCreator());
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  console.log('Browser flow passed at width',width);await page.close();
 }
 const page=await browser.newPage({viewport:{width:375,height:950}});
 let saveAvailable=false;const records=[];
 const hash='0x'+'a'.repeat(64),payer='0x'+'1'.repeat(40);
 await page.addInitScript(({hash,payer})=>{
  window.ethereum={async request({method}){
   if(method==='eth_requestAccounts')return [payer];
   if(method==='eth_chainId')return '0x2105';
   if(method==='eth_sendTransaction'){localStorage.setItem('test-wallet-sends',String(Number(localStorage.getItem('test-wallet-sends')||0)+1));return hash}
   throw new Error('Unexpected wallet request '+method);
  }};
 },{hash,payer});
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/verify-split-invite')return route.fulfill({json:{success:true,request:{splitId:'recovery-test',participantId:'person',participantName:'A',splitName:'Exact share',family:'evm',network:'base',networkName:'Base',asset:'ETH',amount:'0.000000000000000001',payout:'0x'+'2'.repeat(40),expiresAt:Date.now()+86400000,status:'pending'}}});
  if(url.pathname==='/api/build-split-payment')return route.fulfill({json:{success:true,family:'evm',network:'base',chainId:'0x2105',to:'0x'+'2'.repeat(40),value:'0x1'}});
  if(url.pathname==='/api/record-split-payment'){
   records.push(route.request().postDataJSON());
   return route.fulfill({status:saveAvailable?200:503,json:saveAvailable?{success:true,persisted:true,status:'confirmed',confirmed:true}:{success:false,error:'Storage temporarily unavailable.'}});
  }
  return route.fulfill({json:{success:true,launches:[],tokens:[],network:'solana-devnet'}});
 });
 await page.goto('http://127.0.0.1:3100/?pay=browser-recovery-test');
 await page.locator('#payAmount').filter({hasText:'0.000000000000000001'}).waitFor();
 assert.equal(await page.locator('#payRecipient').textContent(),'0x'+'2'.repeat(40));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#payConnectBtn').click();await page.locator('#payNowBtn').click();
 await page.locator('#payStatus').filter({hasText:'Do not send again'}).waitFor();
 assert.equal(await page.locator('#payNowBtn').isVisible(),false);
 assert.equal(await page.locator('#payRecoveryHash').inputValue(),hash);
 await page.reload();
 await page.locator('#payStatus').filter({hasText:'Do not send again'}).waitFor();
 assert.equal(await page.locator('#payConnectBtn').isVisible(),false);
 assert.equal(await page.locator('#payRecoveryHash').inputValue(),hash);
 saveAvailable=true;await page.locator('#payRecoveryCheck').click();
 await page.locator('#payRequestState').filter({hasText:'Payment confirmed'}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('test-wallet-sends')),'1');
 assert.equal(await page.evaluate(()=>localStorage.getItem('split-payment-recovery:recovery-test:person')),null);
 assert.ok(records.length>=3);for(const record of records){assert.equal(record.txHash,hash);assert.equal(record.payer,payer)}
 console.log('Payment reference survives failed storage and reload without a second wallet transfer.');await page.close();
}finally{await browser.close();server.kill()}
