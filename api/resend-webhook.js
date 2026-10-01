import crypto from 'node:crypto';
import { readEmailIndex, readSplitMeta, readParticipant, saveParticipant } from './_split-invite-utils.js';

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
  return '';
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).send('Method not allowed');
  try{
    const payload=await rawBody(req);
    verifyWebhook(payload,req.headers||{});
    const event=JSON.parse(payload);
    const emailId=event?.data?.email_id||event?.data?.id||'';
    const state=nextEmailState(event?.type);
    if(!emailId||!state)return res.status(200).json({received:true,ignored:true});

    const index=await readEmailIndex(emailId);
    if(!index)return res.status(200).json({received:true,unmatched:true});
    const meta=await readSplitMeta(index.splitId);
    const participant=await readParticipant(index.splitId,index.participantId);
    if(!meta||!participant)return res.status(200).json({received:true,unmatched:true});

    const updated={
      ...participant,emailStatus:state,
      ...(state==='delivered'?{emailDeliveredAt:event.created_at||new Date().toISOString(),emailError:''}:{}),
      ...(state==='bounced'||state==='complained'?{
        emailError:event?.data?.bounce?.message||event?.type||'Email delivery failed.'
      }:{})
    };
    await saveParticipant(meta.splitId,updated,meta);
    return res.status(200).json({received:true});
  }catch(error){
    console.error(error);
    return res.status(400).json({received:false,error:error?.message||'Invalid webhook.'});
  }
}
