import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fakeRedis} from './helpers/fake-redis.mjs';
const redis=await fakeRedis();
Object.assign(process.env,{REDIS_URL:redis.url,SPLIT_INVITE_SECRET:'test-only-secret-at-least-thirty-two-characters',APP_BASE_URL:'https://split.example',RESEND_API_KEY:'test-key',SPLIT_EMAIL_FROM:'SPLIT <payments@split.example>',SPLIT_EMAIL_DOMAIN_VERIFIED:'true',RESEND_WEBHOOK_SECRET:'whsec_'+Buffer.from('test-webhook-secret').toString('base64')});
const {default:create}=await import('../api/create-split-invites.js');
const {default:webhook}=await import('../api/resend-webhook.js');
const utils=await import('../api/_split-invite-utils.js');
const storage=await import('../api/_blob-store.js');
const originalFetch=globalThis.fetch;
after(async()=>{globalThis.fetch=originalFetch;await storage.closeStorage();await redis.close()});
function response(){return {code:200,setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}}}
const input=()=>({name:'Dinner <friends>',total:'1',network:'base',asset:'USDC',payout:'0x'+'2'.repeat(40),deliveryMode:'email',creatorEmail:'organizer@example.test',clientRequestId:crypto.randomUUID(),participants:[{name:'First <person>',email:'first@example.test'},{name:'Second',email:'second@example.test'}]});
async function call(body){const res=response();await create({method:'POST',body},res);return res}
function provider(){const calls=[];globalThis.fetch=async(url,options)=>{const messages=JSON.parse(options.body);calls.push({url,key:options.headers['Idempotency-Key'],messages});return Response.json({data:messages.map((_,i)=>({id:'email-'+calls.length+'-'+i}))})};return calls}
async function event(emailId,type,signatureValid=true){
 const body=JSON.stringify({type,created_at:new Date().toISOString(),data:{email_id:emailId}});
 const id=crypto.randomUUID(),timestamp=String(Math.floor(Date.now()/1000));
 const signature=crypto.createHmac('sha256',Buffer.from('test-webhook-secret')).update(`${id}.${timestamp}.${body}`).digest('base64');
 const res=response();await webhook({method:'POST',body,headers:{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':'v1,'+(signatureValid?signature:'forged')}},res);return res;
}
test('creation emails each participant privately and confirms all links to the creator',async()=>{
 const calls=provider(),body=input(),res=await call(body);assert.equal(res.code,200);assert.equal(calls.length,1);assert.equal(calls[0].messages.length,3);
 for(let i=0;i<2;i++){
  const m=calls[0].messages[i];assert.deepEqual(m.to,[body.participants[i].email]);assert.ok(m.html.includes(res.body.invites[i].url));assert.ok(m.text.includes(res.body.invites[i].url));assert.ok(!m.html.includes(res.body.invites[1-i].url));assert.ok(!m.html.includes(body.participants[1-i].email));assert.ok(!m.html.includes('<friends>'));assert.ok(!m.html.includes('<person>'));
 }
 const confirmation=calls[0].messages[2];assert.deepEqual(confirmation.to,[body.creatorEmail]);for(const p of res.body.invites)assert.ok(confirmation.text.includes(p.url));
 assert.equal(res.body.creatorDelivery.emailSent,true);
 const first=res.body.invites[0];await utils.saveParticipant(body.clientRequestId,{...await utils.readParticipant(body.clientRequestId,first.id),status:'confirmed',txHash:'paid-tx'});
 assert.equal((await event(first.emailId,'email.delivered')).code,200);
 const retry=await call(body);assert.equal(calls.length,1);assert.equal(retry.body.invites[0].status,'confirmed');assert.equal(retry.body.invites[0].emailStatus,'delivered');
 assert.equal((await call({...body,creatorEmail:'changed@example.test'})).code,409);
});
test('creator can also be a participant and link sharing remains available without email',async()=>{
 const calls=provider(),body=input();body.creatorEmail=body.participants[0].email;
 assert.equal((await call(body)).code,200);assert.equal(calls[0].messages.length,3);
 const links={...input(),deliveryMode:'link',creatorEmail:'',participants:[{name:'One'},{name:'Two'}]};assert.equal((await call(links)).code,200);assert.equal(calls.length,1);
});
test('missing creator or participant email fails before any split or email is created',async()=>{
 const calls=provider();for(const mutate of [b=>b.creatorEmail='',b=>b.creatorEmail='bad',b=>b.participants[1].email='']){
  const body=input();mutate(body);assert.equal((await call(body)).code,400);assert.equal(await utils.readSplitMeta(body.clientRequestId),null);
 }assert.equal(calls.length,0);
});
test('network retries reuse identical batch content and idempotency key',async()=>{
 let attempts=0;const payloads=[];globalThis.fetch=async(url,options)=>{payloads.push({body:options.body,key:options.headers['Idempotency-Key']});if(++attempts===1)throw new Error('timeout');return Response.json({data:JSON.parse(options.body).map((_,i)=>({id:'retried-'+i}))})};
 const res=await call(input());assert.equal(res.code,200);assert.equal(res.body.creatorDelivery.emailSent,true);assert.deepEqual(payloads[0],payloads[1]);
});
test('invalid receipts remain pending and a creation retry repairs the same split',async()=>{
 let attempts=0;globalThis.fetch=async()=>{attempts++;return Response.json({data:[]})};const body=input(),first=await call(body);
 assert.equal(first.code,200);assert.ok(first.body.emailBatchError);assert.equal(first.body.creatorDelivery.emailSent,false);assert.ok(first.body.invites.every(p=>!p.emailSent));
 const calls=provider(),retry=await call(body);assert.equal(retry.body.splitId,first.body.splitId);assert.equal(retry.body.creatorDelivery.emailSent,true);assert.equal(calls[0].key,'split-invites/'+body.clientRequestId);
});
test('saved receipts repair interrupted state writes without another send',async()=>{
 const calls=provider(),body=input(),created=await call(body),p=created.body.invites[0];await utils.saveParticipant(body.clientRequestId,{...await utils.readParticipant(body.clientRequestId,p.id),emailId:'',emailSent:false,emailStatus:'pending',status:'confirmed'});
 const retry=await call(body);assert.equal(calls.length,1);assert.equal(retry.body.invites[0].emailSent,true);assert.equal(retry.body.invites[0].status,'confirmed');
});
test('signed webhooks track creator and participant outcomes without regressions',async()=>{
 provider();const body=input(),created=await call(body),meta=await utils.readSplitMeta(body.clientRequestId),p=created.body.invites[0];
 assert.equal((await event(p.emailId,'email.delivered',false)).code,400);assert.equal((await utils.readParticipant(body.clientRequestId,p.id)).emailStatus,'accepted');
 assert.equal((await event(meta.creatorEmailId,'email.delivered')).code,200);assert.equal((await utils.readSplitMeta(body.clientRequestId)).creatorEmailStatus,'delivered');
 await event(meta.creatorEmailId,'email.sent');assert.equal((await utils.readSplitMeta(body.clientRequestId)).creatorEmailStatus,'delivered');
 await event(p.emailId,'email.failed');await event(p.emailId,'email.sent');assert.equal((await utils.readParticipant(body.clientRequestId,p.id)).emailStatus,'failed');
 assert.equal((await event('not-yet-indexed','email.delivered')).code,503);
});

test('creation receipt repair preserves a newer individual resend receipt',async()=>{
 const calls=provider(),body=input(),created=await call(body),p=created.body.invites[0];
 await utils.saveParticipant(body.clientRequestId,{...await utils.readParticipant(body.clientRequestId,p.id),emailId:'newer-resend',emailStatus:'delivered'});
 const retry=await call(body);assert.equal(calls.length,1);assert.equal(retry.body.invites[0].emailId,'newer-resend');assert.equal(retry.body.invites[0].emailStatus,'delivered');
});
