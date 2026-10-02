import {acquireLease} from './_blob-store.js';
import crypto from 'node:crypto';
import { readEmailIndex, readSplitMeta, readParticipant, saveParticipant, writeSplitMeta } from './_split-invite-utils.js';

export const config={api:{bodyParser:false}};

async function rawBody(req){
  if(Buffer.isBuffer(req.body))return req.body.toString('utf8');
  if(typeof req.body==='string')return req.body;
  const chunks=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
function verifyWebhook(payload,headers){
  const secret=String(process.env.RESEND_WEBHOOK_SECRET||'');
  if(!secret.startsWith('whsec_'))throw new Error('RESEND_WEBHOOK_SECRET is not configured.');
  const id=String(headers['svix-id']||'');
  const timestamp=String(headers['svix-timestamp']||'');
  const signatures=String(headers['svix-signature']||'').split(/\s+/).filter(Boolean);
  if(!id||!timestamp||!signatures.length)throw new Error('Missing webhook signature headers.');
  const age=Math.abs(Date.now()/1000-Number(timestamp));
  if(!Number.isFinite(age)||age>300)throw new Error('Webhook timestamp is outside the allowed window.');
  const key=Buffer.from(secret.slice(6),'base64');
  const expected=crypto.createHmac('sha256',key).update(`${id}.${timestamp}.${payload}`).digest('base64');
  const valid=signatures.some(part=>{
    const [,sig]=part.split(',');
    if(!sig)return false;
    const a=Buffer.from(sig),b=Buffer.from(expected);
    return a.length===b.length&&crypto.timingSafeEqual(a,b);
  });
  if(!valid)throw new Error('Invalid webhook signature.');
}
function nextEmailState(type){
  if(type==='email.delivered')return 'delivered';
  if(type==='email.bounced')return 'bounced';
  if(type==='email.complained')return 'complained';
  if(type==='email.delivery_delayed')return 'delayed';
  if(type==='email.sent')return 'sent';
  if(type==='email.failed')return 'failed';
  if(type==='email.suppressed')return 'suppressed';
  return '';
}
function shouldUpdate(current,state){
  const rank={pending:0,accepted:1,sent:2,delayed:2,delivered:3,failed:4,suppressed:4,bounced:4,complained:5};
  return (rank[state]||0)>=(rank[current]||0);
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).send('Method not allowed');
  let release;let verified=false;
  try{
    const payload=await rawBody(req);
    verifyWebhook(payload,req.headers||{});verified=true;
    const event=JSON.parse(payload);
    const emailId=event?.data?.email_id||event?.data?.id||'';
    const state=nextEmailState(event?.type);
    if(!emailId||!state)return res.status(200).json({received:true,ignored:true});

    const index=await readEmailIndex(emailId);
    // A delivery event can arrive before the creation request saves its receipt.
    if(!index)return res.status(503).json({received:false,error:'Email receipt is not indexed yet.'});
    const lock=index.role==='creator'?`operations/create-split/${index.splitId}`:`operations/participant/${index.splitId}/${index.participantId}`;
    release=await acquireLease(lock,180);
    if(!release)return res.status(503).json({received:false,error:'Delivery status is being updated. Retry shortly.'});
    const meta=await readSplitMeta(index.splitId);
    if(index.role==='creator'){
      if(meta?.creatorEmailId===emailId&&shouldUpdate(meta.creatorEmailStatus,state)){
        await writeSplitMeta(meta.splitId,{...meta,creatorEmailStatus:state,
          ...(state==='delivered'?{creatorEmailDeliveredAt:event.created_at||new Date().toISOString()}:{}),
          creatorEmailError:['bounced','complained','failed','suppressed'].includes(state)?event?.data?.bounce?.message||event.type:''});
      }
      return res.status(200).json({received:true});
    }
    const participant=await readParticipant(index.splitId,index.participantId);
    if(!meta||!participant)return res.status(200).json({received:true,unmatched:true});
    if(participant.emailId!==emailId||!shouldUpdate(participant.emailStatus,state))return res.status(200).json({received:true,ignored:true});

    const updated={
      ...participant,emailStatus:state,
      ...(state==='delivered'?{emailDeliveredAt:event.created_at||new Date().toISOString(),emailError:''}:{}),
      ...(['bounced','complained','failed','suppressed'].includes(state)?{
        emailError:event?.data?.bounce?.message||event?.type||'Email delivery failed.'
      }:{})
    };
    await saveParticipant(meta.splitId,updated,meta);
    return res.status(200).json({received:true});
  }catch(error){
    console.error(error);
    return res.status(verified?503:400).json({received:false,error:verified?'Delivery status is temporarily unavailable.':'Invalid webhook signature.'});
  }finally{await release?.().catch(()=>{})}
}
