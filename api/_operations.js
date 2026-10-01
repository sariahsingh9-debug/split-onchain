import crypto from 'node:crypto';
import {redisClient,put,get} from './_blob-store.js';
const fallbackAlerts=new Map();

export function authorizedCron(req){
  const expected=process.env.CRON_SECRET;if(!expected)return false;
  const actual=Buffer.from(String(req.headers.authorization||''));const wanted=Buffer.from(`Bearer ${expected}`);
  return actual.length===wanted.length&&crypto.timingSafeEqual(actual,wanted);
}
export function alertConfigured(){return Boolean((process.env.SPLIT_ALERT_RESEND_API_KEY||process.env.RESEND_API_KEY)&&(process.env.SPLIT_ALERT_FROM||process.env.SPLIT_EMAIL_FROM)&&process.env.SPLIT_ALERT_EMAIL)}
export async function readOperation(name){const record=await get(`operations/${name}.json`);return record?JSON.parse(await new Response(record.stream).text()):null}
export async function writeOperation(name,record){await put(`operations/${name}.json`,JSON.stringify(record))}
export async function sendAlert(event,{test=false}={}){
  if(!alertConfigured())throw new Error('Error alert delivery is not configured.');
  // Only operational facts are sent, never bodies, query strings, messages or headers.
  const facts={event:String(event.event||'service_error').slice(0,80),route:String(event.route||'').split('?')[0].slice(0,120),status:Number(event.status)||0,requestId:String(event.requestId||'').slice(0,80),time:new Date().toISOString()};
  const bucket=Math.floor(Date.now()/600000);
  const id=crypto.createHash('sha256').update([facts.event,facts.route,facts.status,test?'test-'+bucket:bucket].join(':')).digest('hex');
  let client;const lock=`operations/alert-lock/${id}`;
  try{client=await redisClient();if(await client.set(lock,'1','EX',test?30:600,'NX')!=='OK')return {deduplicated:true}}
  catch{if(fallbackAlerts.has(id))return {deduplicated:true};fallbackAlerts.set(id,Date.now());for(const [key,time] of fallbackAlerts)if(Date.now()-time>600000)fallbackAlerts.delete(key)}
  try{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{authorization:`Bearer ${process.env.SPLIT_ALERT_RESEND_API_KEY||process.env.RESEND_API_KEY}`,'content-type':'application/json','Idempotency-Key':`split-ops-${id}`},body:JSON.stringify({from:process.env.SPLIT_ALERT_FROM||process.env.SPLIT_EMAIL_FROM,to:[process.env.SPLIT_ALERT_EMAIL],subject:test?'SPLIT monitoring test':`SPLIT alert: ${facts.event}`,text:`SPLIT needs attention.\n\n${JSON.stringify(facts,null,2)}\n\nOpen the Render service logs and search for the request ID.\nhttps://dashboard.render.com/web/${process.env.RENDER_SERVICE_ID||'srv-dauq99vpn0mc738n5510'}`})});
    const body=await response.json().catch(()=>({}));
    if(!response.ok||!body.id)throw new Error('Error alert email was not accepted.');
    await writeOperation('last-alert',{...facts,acceptedAt:new Date().toISOString(),emailId:body.id,test}).catch(()=>{});
    return {accepted:true,emailId:body.id};
  }catch(error){await client?.del(lock).catch(()=>{});fallbackAlerts.delete(id);throw error}
}
export async function reportError(event){
  const facts={level:'error',event:String(event.event||'service_error'),route:String(event.route||'').split('?')[0],status:Number(event.status)||0,requestId:String(event.requestId||''),time:new Date().toISOString()};
  console.error(JSON.stringify(facts));
  await writeOperation('last-error',facts).catch(()=>{});
  try{await sendAlert(facts)}catch{console.error(JSON.stringify({level:'error',event:'alert_delivery_failed',requestId:facts.requestId}))}
}
export async function reconciliationHealth(){
  const state=await readOperation('reconciliation');
  const age=state?.lastSuccessAt?Date.now()-Date.parse(state.lastSuccessAt):Infinity;
  return {configured:Boolean(process.env.CRON_SECRET),healthy:Number.isFinite(age)&&age<360000,lastSuccessAt:state?.lastSuccessAt||null,checked:state?.checked||0};
}
