import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {fakeRedis} from './helpers/fake-redis.mjs';
const redis=await fakeRedis();process.env.REDIS_URL=redis.url;process.env.CRON_SECRET='test-credential';
process.env.SPLIT_ALERT_EMAIL='owner@example.com';process.env.SPLIT_EMAIL_FROM='SPLIT <alerts@example.com>';process.env.RESEND_API_KEY='never-include-in-alert';
const storage=await import('../api/_blob-store.js');const operations=await import('../api/_operations.js');
const {saveSubmittedPayment,readParticipant}=await import('../api/_split-invite-utils.js');
const {default:reconcile}=await import('../api/reconcile-payments.js');
const realFetch=globalThis.fetch;const emails=[];let rpcAvailable=true;
globalThis.fetch=async(url,options)=>{
 const body=JSON.parse(options.body);
 if(String(url).includes('api.resend.com')){emails.push(body);return Response.json({id:'email-'+emails.length})}
 if(!rpcAvailable)throw new Error('RPC unavailable');
 const hash=body.params?.[0];let result;
 if(body.method==='eth_getTransactionReceipt')result={status:'0x1',blockNumber:'0x10',logs:[]};
 if(body.method==='eth_getTransactionByHash')result={from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),value:'0x16345785d8a0000'};
 if(body.method==='eth_getBlockByNumber')result={timestamp:'0x'+Math.floor(Date.now()/1000).toString(16)};
 return Response.json({jsonrpc:'2.0',id:1,result});
};
after(async()=>{globalThis.fetch=realFetch;await storage.closeStorage();await redis.close()});
function response(){return {code:200,body:null,setHeader(){return this},status(code){this.code=code;return this},json(body){this.body=body;return this}}}
const request={method:'POST',headers:{authorization:'Bearer test-credential'},requestId:'request-test'};
test('missing launch authentication returns 401 rather than producing a server error alert',async()=>{
 const {default:launch}=await import('../api/create-launch.js');const res=response();await launch({method:'POST',headers:{},body:'{}'},res);assert.equal(res.code,401);
});
test('cron authentication rejects absent and incorrect credentials',async()=>{
 for(const headers of [{},{authorization:'Bearer wrong'}]){const res=response();await reconcile({...request,headers},res);assert.equal(res.code,401)}
});
test('storage pagination scans all keys and preserves immutable records',async()=>{
 for(let i=0;i<135;i++)await storage.put('page/'+i,'value');
 let cursor='0';const keys=new Set();do{const page=await storage.list({prefix:'page/',limit:20,cursor});for(const key of page.blobs)keys.add(key.pathname);cursor=page.cursor||'0'}while(cursor!=='0');
 assert.equal(keys.size,135);
 await storage.put('unique','first',{allowOverwrite:false});await assert.rejects(()=>storage.put('unique','second',{allowOverwrite:false}));
 assert.equal(await new Response((await storage.get('unique')).stream).text(),'first');
});
test('alerts deduplicate and never include submitted secrets or signed links',async()=>{
 const event={event:'launch_failed',route:'/api/create-launch?token=SECRET',status:503,requestId:'request-test',message:'seed secret',headers:{authorization:'secret'}};
 const first=await operations.sendAlert(event);const second=await operations.sendAlert(event);
 assert.equal(first.accepted,true);assert.equal(second.deduplicated,true);
 const payload=JSON.stringify(emails.at(-1));for(const secret of ['SECRET','seed secret','never-include-in-alert'])assert.equal(payload.includes(secret),false);
});
test('scheduled reconciliation confirms payments with no browser and across more than 100 records',async()=>{
 const meta={splitId:'closed-browser',storageVersion:2,network:'base',asset:'ETH',payout:'0x'+'2'.repeat(40),createdAt:new Date().toISOString()};
 await storage.put('split-requests/closed-browser/meta.json',JSON.stringify(meta));
 for(let i=0;i<125;i++)await saveSubmittedPayment(meta,{id:'p'+i,status:'submitted',payer:'0x'+'1'.repeat(40),amount:'0.1',txHash:'0x'+(i+1).toString(16).padStart(64,'0'),submittedAt:new Date().toISOString()});
 let calls=0;do{const res=response();await reconcile(request,res);assert.equal(res.code,200);calls++;if(!res.body.hasMore)break}while(calls<10);
 for(let i=0;i<125;i++)assert.equal((await readParticipant(meta.splitId,'p'+i)).status,'confirmed');
 assert.equal((await operations.reconciliationHealth()).healthy,true);
 assert.equal([...redis.records.keys()].filter(k=>k.startsWith('payment-pending/')).length,0);
});
test('RPC failure keeps the payment pending and does not report a successful heartbeat',async()=>{
 const meta={splitId:'outage',storageVersion:2,network:'base',asset:'ETH',payout:'0x'+'2'.repeat(40),createdAt:new Date().toISOString()};
 await storage.put('split-requests/outage/meta.json',JSON.stringify(meta));
 await saveSubmittedPayment(meta,{id:'p1',status:'submitted',payer:'0x'+'1'.repeat(40),amount:'0.1',txHash:'0x'+'f'.repeat(64),submittedAt:new Date().toISOString()});
 await operations.writeOperation('reconciliation',{cursor:'0',lastSuccessAt:'2000-01-01T00:00:00Z'});
 rpcAvailable=false;const res=response();await reconcile(request,res);rpcAvailable=true;
 assert.equal(res.code,503);assert.equal((await readParticipant('outage','p1')).status,'submitted');assert.equal((await operations.reconciliationHealth()).healthy,false);
 const retry=response();await reconcile(request,retry);assert.equal(retry.code,200);assert.equal((await readParticipant('outage','p1')).status,'confirmed');
});
test('stale cron heartbeat and concurrent scheduler runs are detected',async()=>{
 await operations.writeOperation('reconciliation',{lastSuccessAt:'2000-01-01T00:00:00Z'});assert.equal((await operations.reconciliationHealth()).healthy,false);
 const release=await storage.acquireLease('operations/reconcile-lock');const res=response();await reconcile(request,res);assert.equal(res.code,409);await release();
});
