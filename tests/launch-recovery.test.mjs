import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Keypair} from '@solana/web3.js';
import {fakeRedis} from './helpers/fake-redis.mjs';
const redis=await fakeRedis();process.env.REDIS_URL=redis.url;
process.env.SPLIT_ROUTER_MASTER_SECRET='test-master-secret-'.repeat(3);
process.env.SOLANA_NETWORK='solana-devnet';
const storage=await import('../api/_blob-store.js');
const {savePreparedLaunch,recoverLaunches}=await import('../api/_launch-recovery.js');
const {deriveFeeWallet,signRoutingPayload}=await import('../api/_routing-utils.js');
const address=()=>Keypair.generate().publicKey.toBase58();
const routingId='test-recovery',wallet=address(),mint=address(),genesis=address();
const route={routingId,network:'solana-devnet',creatorWallet:wallet,creatorRecipient:wallet,treasuryRecipient:address(),liquidityRecipient:address(),protocolRecipient:address(),creatorBps:3500,treasuryBps:2000,liquidityBps:3500,protocolBps:1000,feeWallet:deriveFeeWallet(routingId,process.env.SPLIT_ROUTER_MASTER_SECRET).publicKey.toBase58(),mintAddress:mint,genesisAccount:genesis,token:{name:'Recovery',symbol:'RCV',imageUrl:'https://gateway.irys.xyz/'+'a'.repeat(43)}};
const body={routingId,network:route.network,creatorWallet:wallet,mintAddress:mint,genesisAccount:genesis,launch:{type:'bondingCurve'},routingToken:signRoutingPayload(route,process.env.SPLIT_ROUTER_MASTER_SECRET)};
const originalFetch=globalThis.fetch;let onchain=false,registrations=0,providerReady=false;
globalThis.fetch=async(url,options)=>{
  if(String(url).includes('metaplex')){registrations++;return Response.json(providerReady?{success:true,token:{mintAddress:mint},launch:{link:'https://www.metaplex.com/token/'+mint}}:{success:false},{status:providerReady?200:400})}
  const request=JSON.parse(options.body);
  return Response.json({jsonrpc:'2.0',id:request.id,result:{context:{slot:1},value:onchain?{data:['','base64'],executable:false,lamports:1,owner:address(),rentEpoch:0}:null}});
};
after(async()=>{globalThis.fetch=originalFetch;await storage.closeStorage();await redis.close()});
test('closed-browser launch registers and indexes automatically only after an account exists; outages retain recovery',async()=>{
  await savePreparedLaunch(body);
  await recoverLaunches();assert.equal(registrations,0);assert.ok(await storage.get('launch-pending/'+routingId+'.json'));
  onchain=true;await recoverLaunches();assert.equal(registrations,1);assert.ok(await storage.get('launch-pending/'+routingId+'.json'));
  providerReady=true;await recoverLaunches();assert.equal(registrations,2);
  assert.equal(await storage.get('launch-pending/'+routingId+'.json'),null);
  const record=JSON.parse(await new Response((await storage.get('launch-directory/'+mint+'.json')).stream).text());
  assert.equal(record.creatorWallet,wallet);assert.equal(record.creatorPercent,35);
  assert.equal([...redis.records.keys()].filter(x=>x.includes('/launches/'+mint+'.json')).length,1);
  await recoverLaunches();assert.equal(registrations,2);
});
test('browser resumes registration after a timeout without broadcasting a second transaction',async()=>{
  const source=fs.readFileSync(new URL('../public/assets/js/launchpad.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf("const LAUNCH_RECOVERY_KEY="),source.indexOf('window.SPLIT_LAUNCH_ADAPTER='));
  const saved=new Map();let sends=0,confirms=0,registers=0;
  const context=vm.createContext({localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},navigator:{},launchWalletAddress:wallet,launchWalletSession:{name:'test'},launchAuthTokenV72:'test',launchServiceConfig:{network:'solana-devnet',launchReady:true},refreshLaunchServiceConfig:async()=>{},ensureLaunchAuthV72:async()=>{},setLaunchError:()=>{},sendLaunchTransaction:async()=>{sends++;return 'signature'},waitForSignature:async()=>{if(++confirms===1)throw new Error('RPC timeout')},fetch:async()=>{registers++;return Response.json({success:true,token:{mintAddress:mint}})}});
  vm.runInContext(code,context);
  saved.set('split-launch-recovery-v1',JSON.stringify({config:{wallet},built:{network:'solana-devnet',transactions:['unsigned'],routingId,routingToken:body.routingToken,mintAddress:mint},signatures:[]}));
  await assert.rejects(()=>vm.runInContext('productionLaunch({})',context),/RPC timeout/);
  assert.equal(sends,1);assert.equal(registers,0);
  await vm.runInContext('productionLaunch({})',context);
  assert.equal(sends,1);assert.equal(registers,1);assert.equal(saved.size,0);
});
test('Wallet Standard transaction output arrays return the broadcast signature',async()=>{
  const source=fs.readFileSync(new URL('../public/assets/js/launchpad.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('async function sendLaunchTransaction('),source.indexOf('async function waitForSignature('));
  let chain;
  const context=vm.createContext({base64ToBytes:()=>new Uint8Array([1]),bytesToBase58:async()=> 'encoded-signature',launchWalletSession:{type:'standard',account:{},wallet:{features:{'solana:signAndSendTransaction':{signAndSendTransaction:async input=>{chain=input.chain;return [{signature:new Uint8Array([2])}]}}}}}});
  vm.runInContext(code,context);
  assert.equal(await vm.runInContext("sendLaunchTransaction('unsigned','solana-mainnet')",context),'encoded-signature');
  assert.equal(chain,'solana:mainnet');
});
