import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3100',NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',code=>reject(new Error('Server exited '+code)))});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const width of [1440,375]){
  const page=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'});const errors=[],missing=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/assets/')&&r.status()!==200)missing.push(r.url())});
  await page.route('**/api/**',route=>route.fulfill({json:{success:true,ok:true,coreReady:true,splitReady:true,launchReady:true,network:'solana-devnet',routerReady:true,uploadReady:true,storageReady:true,launchAuthReady:true,services:{storage:true,email:true},launches:[],tokens:[]}}));
  await page.goto('http://127.0.0.1:3100');
  await page.evaluate(()=>window.showSplitCreator());
  assert.equal(await page.locator('#splitCreatorPage').isVisible(),true);
  await page.locator('#scModeManual').click();assert.equal(await page.locator('#scManualAddress').isVisible(),true);
  const before=await page.locator('#scPeople .sc-person').count();await page.locator('#scAddPerson').click();assert.equal(await page.locator('#scPeople .sc-person').count(),before+1);
  await page.locator('#scTotal').fill('2400');await page.locator('#scTotal').dispatchEvent('input');assert.match(await page.locator('#scSumTotal').textContent(),/2,400/);
  await page.locator('#scBackHome').click();assert.equal(await page.locator('#app').isVisible(),true);
  await page.evaluate(()=>openLaunchCreator());assert.equal(await page.locator('#launchModal').isVisible(),true);
  assert.equal(await page.locator('#launchInitialBuyUsd').getAttribute('min'),'5');
  await page.evaluate(()=>openLaunchWalletModal('launch'));assert.equal(await page.locator('#walletChooserModal').isVisible(),true);
  await page.evaluate(()=>closeLaunchWalletModal());await page.evaluate(()=>closeLaunchCreator());
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  console.log('Browser flow passed at width',width);await page.close();
 }
}finally{await browser.close();server.kill()}
