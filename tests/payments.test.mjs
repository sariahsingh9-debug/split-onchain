import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {fakeRedis} from './helpers/fake-redis.mjs';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
const redis=await fakeRedis();process.env.REDIS_URL=redis.url;process.env.SPLIT_INVITE_SECRET='test-only-credential-that-is-at-least-32-characters';process.env.APP_BASE_URL='http://localhost:3100';
const storage=await import('../api/_blob-store.js'),utils=await import('../api/_split-invite-utils.js');
const {default:create}=await import('../api/create-split-invites.js');
const context={window:{}};vm.runInNewContext(fs.readFileSync('public/assets/js/payment-math.js','utf8'),context);const math=context.window.SPLIT_AMOUNT;
after(async()=>{await storage.closeStorage();await redis.close()});
function response(){return {code:200,setHeader(){return this},status(n){this.code=n;return this},json(body){this.body=body;return this}}}
const input=()=>({name:'Weekend trip',total:'10',network:'base',asset:'USDC',payout:'0x'+'2'.repeat(40),deliveryMode:'link',clientRequestId:randomUUID(),participants:[{name:'A'},{name:'B'},{name:'C'}]});
const call=async(body)=>{const res=response();await create({method:'POST',body},res);return res};
test('manual links need no participant email and exact shares add up to the total',async()=>{
 const body=input(),res=await call(body);assert.equal(res.code,200);assert.equal(res.body.deliveryMode,'link');assert.equal(res.body.invites.length,3);
 assert.deepEqual(res.body.invites.map(p=>p.amount),['3.333334','3.333333','3.333333']);assert.equal(res.body.invites.reduce((n,p)=>n+BigInt(p.amountUnits||math.units(p.amount,6)),0n),10000000n);
 for(const invite of res.body.invites){const payload=utils.verifyPayload(new URL(invite.url).searchParams.get('pay'),'participant');assert.equal(payload.amount,invite.amount);assert.equal(payload.participantName,invite.name)}
});
test('retry preserves payment state and rejects changed request details',async()=>{
 const body=input(),first=await call(body),person=first.body.invites[0];
 const stored=await utils.readParticipant(body.clientRequestId,person.id);await utils.saveParticipant(body.clientRequestId,{...stored,status:'confirmed'});
 const retry=await call(body);assert.equal(retry.code,200);assert.equal(retry.body.idempotent,true);assert.equal(retry.body.invites[0].status,'confirmed');
 const changed=await call({...body,total:'20'});assert.equal(changed.code,409);
});
test('nonpersistent storage refuses new financial requests before storing records',async()=>{
 redis.persistence.durable=false;const body=input(),res=await call(body);redis.persistence.durable=true;
 assert.equal(res.code,503);assert.equal(await utils.readSplitMeta(body.clientRequestId),null);assert.match(res.body.error,/durable payment storage/);
});
test('email delivery is unavailable without a verified sender and invalid optional emails are rejected',async()=>{
 const email=await call({...input(),deliveryMode:'email'});assert.equal(email.code,503);
 const body=input();body.participants[0].email='invalid';assert.equal((await call(body)).code,400);
});
test('frontend math preserves small remainders and large values without floating point errors',()=>{
 assert.deepEqual(Array.from(math.equal('10',3,6)),['3.333334','3.333333','3.333333']);
 assert.deepEqual(Array.from(math.equal('0.000005',3,6)),['0.000002','0.000002','0.000001']);
 const value='9007199254740993.123456';const shares=Array.from(math.equal(value,7,6));assert.equal(shares.reduce((n,x)=>n+math.units(x,6),0n),math.units(value,6));
 assert.throws(()=>math.equal('1e6',4,6));assert.throws(()=>math.equal('1',1,6));
});
test('one EVM transaction cannot satisfy two requests by changing its letter case',async()=>{
 const txHash='0x'+'a'.repeat(64);await utils.claimVerifiedTransaction({network:'base',txHash,splitId:'one',participantId:'one'});
 await assert.rejects(()=>utils.claimVerifiedTransaction({network:'base',txHash:txHash.toUpperCase().replace('0X','0x'),splitId:'two',participantId:'two'}));
});
test('upload quotas count concurrent attempts atomically',async()=>{
 const {consumeLaunchQuota}=await import('../api/_launch-rate-limit.js');
 const results=await Promise.allSettled(Array.from({length:20},()=>consumeLaunchQuota('wallet','media',{limit:12})));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,12);
});
test('a receipt is indexed once when confirmation is retried after an interrupted response',async()=>{
 const {writeCreatorRevenueEvent,creatorPrefix}=await import('../api/_creator-utils.js');const {Keypair}=await import('@solana/web3.js');
 const route={creatorWallet:Keypair.generate().publicKey.toBase58(),routingId:'route',network:'solana-devnet'};
 for(let i=0;i<2;i++)await writeCreatorRevenueEvent(route,{grossLamports:'1000',distributionSignature:'confirmed-signature',transfers:[]});
 const records=await storage.list({prefix:creatorPrefix(route.creatorWallet,'solana')+'/revenue/'});assert.equal(records.blobs.length,1);
});

test('safe integer encoding handles Solana amounts and rejects overflows',async()=>{
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);const safe=require('../vendor/safe-bigint-buffer/index.cjs');
 for(const n of [0n,1n,255n,256n,2n**64n-1n])for(const [encode,decode] of [[safe.toBufferLE,safe.toBigIntLE],[safe.toBufferBE,safe.toBigIntBE]])assert.equal(decode(encode(n,8)),n);
 assert.throws(()=>safe.toBufferLE(2n**64n,8));assert.throws(()=>safe.toBufferLE(-1n,8));assert.throws(()=>safe.toBigIntLE(Buffer.alloc(16385)));
 const {Keypair}=await import('@solana/web3.js');const {createTransferCheckedInstruction}=await import('@solana/spl-token');
 const keys=Array.from({length:4},()=>Keypair.generate().publicKey);const tx=createTransferCheckedInstruction(...keys,2n**64n-1n,6);
 assert.equal(safe.toBigIntLE(tx.data.subarray(1,9)),2n**64n-1n);
});
test('a saved revenue transaction resumes the same signed bytes and skips confirmed transactions',async()=>{
 const {Keypair,Transaction,SystemProgram}=await import('@solana/web3.js');const {prepareRevenueTransaction,persistRevenueJournal,readRevenueJournal,resumeRevenueTransactions}=await import('../api/_revenue-transactions.js');
 const signer=Keypair.generate(),recipient=Keypair.generate().publicKey;
 const transaction=new Transaction({feePayer:signer.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:recipient,lamports:1000n}));transaction.sign(signer);
 const prepared=prepareRevenueTransaction(transaction.serialize().toString('base64'),[signer]);const state={phase:'distribution',transactions:[prepared]};await persistRevenueJournal('test-journal',state);
 let status=null;const submitted=[];const connection={async getSignatureStatuses(){return {value:[status]}},async isBlockhashValid(){return {value:true}},async sendRawTransaction(bytes){submitted.push(bytes.toString('base64'));return prepared.signature}};
 assert.equal(await resumeRevenueTransactions(connection,await readRevenueJournal('test-journal'),{timeoutMs:0}),false);
 assert.deepEqual(submitted,[prepared.raw]);
 status={confirmationStatus:'confirmed',err:null};assert.equal(await resumeRevenueTransactions(connection,state),true);assert.equal(submitted.length,1);
});
test('an expired unconfirmed revenue transaction cannot trigger a replacement distribution',async()=>{
 const {resumeRevenueTransactions}=await import('../api/_revenue-transactions.js');let sent=false;
 const connection={async getSignatureStatuses(){return {value:[null]}},async isBlockhashValid(){return {value:false}},async sendRawTransaction(){sent=true}};
 await assert.rejects(()=>resumeRevenueTransactions(connection,{transactions:[{signature:'saved',blockhash:'expired'}]}),/expired/);assert.equal(sent,false);
});

test('requests reject amounts that cannot fit the network transfer format',async()=>{
 const body=input();body.total=(2n**256n).toString();body.asset='ETH';assert.equal((await call(body)).code,400);
});

test('the patched Solana RPC stack builds the exact signed-link transfer and rejects tampering',async()=>{
 const {Keypair,Transaction,SystemInstruction}=await import('@solana/web3.js');const {default:build}=await import('../api/build-split-payment.js');
 const recipient=Keypair.generate().publicKey,payer=Keypair.generate().publicKey;const body={...input(),network:'solana',asset:'SOL',payout:recipient.toBase58(),total:'0.003'};
 const created=await call(body);assert.equal(created.code,200);const token=new URL(created.body.invites[0].url).searchParams.get('pay');
 const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{const rpc=JSON.parse(options.body);return Response.json({jsonrpc:'2.0',id:rpc.id,result:{context:{slot:1},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:123}}})};
 try{
  const res=response();await build({method:'POST',body:{token,payer:payer.toBase58()}},res);assert.equal(res.code,200);
  const transfer=SystemInstruction.decodeTransfer(Transaction.from(Buffer.from(res.body.transaction,'base64')).instructions[0]);assert.equal(transfer.lamports,1000000n);assert.equal(transfer.toPubkey.toBase58(),recipient.toBase58());
  const [payload,signature]=token.split('.');const details=JSON.parse(Buffer.from(payload,'base64url'));details.amount='1000';const tampered=Buffer.from(JSON.stringify(details)).toString('base64url')+'.'+signature;
  const denied=response();await build({method:'POST',body:{token:tampered,payer:payer.toBase58()}},denied);assert.equal(denied.code,400);
 }finally{globalThis.fetch=original}
});

test('storage maintenance pauses new requests before they are persisted',async()=>{
 process.env.SPLIT_STORAGE_MAINTENANCE='true';const body=input();
 try{const res=await call(body);assert.equal(res.code,503);assert.equal(await utils.readSplitMeta(body.clientRequestId),null)}finally{delete process.env.SPLIT_STORAGE_MAINTENANCE}
});
