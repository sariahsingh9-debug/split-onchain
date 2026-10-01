import crypto from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import {
  signPayload, cleanText, validEmail, baseUrl,
  readSplitMeta, listParticipants, writeSplitMeta, writeParticipant, saveParticipant, writeEmailIndex
} from './_split-invite-utils.js';
import { writeCreatorSplitIndex } from './_creator-utils.js';
import { decimalToUnits, unitsToDecimal, decimalsFor, PAYMENT_NETWORK_NAMES } from './_payment-config.js';
import { inviteSubject, inviteHtml, sendInviteBatch } from './_split-email.js';

function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body||'{}');return req.body||{}}
function addressLooksValid(network,value){
  const s=String(value||'').trim();
  if(network==='solana'){try{new PublicKey(s);return true}catch{return false}}
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}
function requestId(value){
  const s=String(value||'').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s)?s:crypto.randomUUID();
}
function participantId(splitId,index,email){
  return crypto.createHash('sha256').update(`${splitId}:${index}:${email}`).digest('hex').slice(0,32);
}
function fingerprint(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}
function makeParticipantToken(meta,p){
  return signPayload({
    v:2,role:'participant',splitId:meta.splitId,participantId:p.id,participantName:p.name,
    splitName:meta.name,amount:p.amount,total:meta.total,network:meta.network,
    networkName:meta.networkName,asset:meta.asset,payout:meta.payout,iat:meta.createdAtMs,exp:meta.expiresAtMs
  });
}
function safePublicParticipant(p){
  const {amountUnits,...publicParticipant}=p;
  return publicParticipant;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed.'});
  try{
    const input=bodyOf(req);
    const name=cleanText(input.name,90);
    const totalInput=cleanText(input.total,80);
    const network=cleanText(input.network,30).toLowerCase();
    const asset=cleanText(input.asset,15).toUpperCase();
    const payout=cleanText(input.payout,80);
    const incoming=Array.isArray(input.participants)?input.participants:[];
    const networkName=PAYMENT_NETWORK_NAMES[network];

    if(!name)return res.status(400).json({success:false,error:'Split name is required.'});
    if(!networkName)return res.status(400).json({success:false,error:'Unsupported payment network.'});
    if(incoming.length<2||incoming.length>50)return res.status(400).json({success:false,error:'A SPLIT requires 2–50 participants.'});
    if(!addressLooksValid(network,payout))return res.status(400).json({success:false,error:'The payout address is invalid for the selected network.'});

    const decimals=decimalsFor(network,asset);
    const totalUnits=decimalToUnits(totalInput,decimals);
    if(totalUnits<=0n)return res.status(400).json({success:false,error:'Enter a positive total amount.'});
    if(totalUnits<BigInt(incoming.length))return res.status(400).json({success:false,error:'The total is too small to give every participant a non-zero share.'});

    const baseShare=totalUnits/BigInt(incoming.length);
    const remainder=totalUnits%BigInt(incoming.length);
    const total=unitsToDecimal(totalUnits,decimals);
    const splitId=requestId(input.clientRequestId);
    const normalized=incoming.map((p,index)=>{
      const participantName=cleanText(p?.name,80);
      const email=cleanText(p?.email,160).toLowerCase();
      const units=baseShare+(BigInt(index)<remainder?1n:0n);
      return {
        id:participantId(splitId,index,email),name:participantName,email,
        amount:unitsToDecimal(units,decimals),amountUnits:units.toString(),
        status:'pending',txHash:'',payer:'',rejectionReason:'',emailSent:false,emailId:'',emailStatus:'pending',emailError:''
      };
    });
    for(let i=0;i<normalized.length;i++){
      if(!normalized[i].name)return res.status(400).json({success:false,error:`Participant ${i+1} needs a name.`});
      if(!validEmail(normalized[i].email))return res.status(400).json({success:false,error:`${normalized[i].name} needs a valid email address.`});
    }
    if(new Set(normalized.map(p=>p.email)).size!==normalized.length)return res.status(400).json({success:false,error:'Each participant must use a different email address.'});
    if(!process.env.SPLIT_EMAIL_FROM)return res.status(503).json({success:false,error:'SPLIT_EMAIL_FROM is not configured.'});
    if(!process.env.RESEND_API_KEY)return res.status(503).json({success:false,error:'RESEND_API_KEY is not configured.'});

    const requestFingerprint=fingerprint({
      name,totalUnits:totalUnits.toString(),network,asset,payout,
      participants:normalized.map(p=>({id:p.id,name:p.name,email:p.email,amountUnits:p.amountUnits}))
    });
    const now=Date.now();
    let meta={
      v:2,splitId,name,total,totalUnits:totalUnits.toString(),splitMode:'equal',decimals,
      network,networkName,asset,payout,creatorWallet:payout,creatorFamily:network==='solana'?'solana':'evm',participantCount:normalized.length,requestFingerprint,
      createdAtMs:now,createdAt:new Date(now).toISOString(),expiresAtMs:now+(30*24*60*60*1000),expiresAt:new Date(now+(30*24*60*60*1000)).toISOString()
    };

    // clientRequestId makes the operation safe to retry if the browser loses the
    // response after the server has already created links or submitted email.
    let existingMeta=null;
    try{existingMeta=await readSplitMeta(splitId)}catch(error){
      if(!/not found/i.test(String(error?.message||'')))console.warn('SPLIT idempotency read:',error?.message||error);
    }
    if(existingMeta){
      if(existingMeta.requestFingerprint&&existingMeta.requestFingerprint!==requestFingerprint){
        return res.status(409).json({success:false,error:'This SPLIT creation request id was already used for different details. Change the form and try again.'});
      }
      meta=existingMeta;
    }else{
      try{
        await writeSplitMeta(splitId,meta,{overwrite:false});
      }catch(error){
        try{existingMeta=await readSplitMeta(splitId)}catch{}
        if(!existingMeta)return res.status(503).json({success:false,error:'SPLIT storage is not connected. Netlify Blobs must be available before sending payment invitations.'});
        if(existingMeta.requestFingerprint&&existingMeta.requestFingerprint!==requestFingerprint){
          return res.status(409).json({success:false,error:'This SPLIT creation request id was already used for different details.'});
        }
        meta=existingMeta;
      }
    }

    // Repair a partially-created request without overwriting payment state from an
    // already-existing participant record.
    let stored=[];
    try{stored=await listParticipants(splitId,meta)}catch(error){
      console.error('SPLIT private storage unavailable:',error?.message||error);
      return res.status(503).json({success:false,error:'SPLIT storage is temporarily unavailable.'});
    }
    const storedById=new Map(stored.map(p=>[p.id,p]));
    const participants=[];
    for(const expected of normalized){
      const current=storedById.get(expected.id);
      if(current){
        if(current.name!==expected.name||current.email!==expected.email||String(current.amountUnits||'')!==expected.amountUnits){
          return res.status(409).json({success:false,error:'Stored participant details do not match this retried creation request.'});
        }
        participants.push(current);
      }else{
        await writeParticipant(splitId,expected.id,expected);
        participants.push(expected);
      }
    }

    const root=baseUrl();
    const invites=participants.map(p=>{
      const token=makeParticipantToken(meta,p);
      return {...p,url:`${root}/?pay=${encodeURIComponent(token)}`};
    });
    const adminToken=signPayload({v:2,role:'admin',splitId,iat:meta.createdAtMs||Date.parse(meta.createdAt),exp:(meta.createdAtMs||Date.parse(meta.createdAt))+(365*24*60*60*1000)});
    try{await writeCreatorSplitIndex(meta,adminToken)}catch(error){
      console.warn('Creator SPLIT index could not be updated:',error?.message||error);
    }

    let batchError='';let deliveryStateWarning='';
    if(invites.some(x=>!x.emailSent)&&!meta.emailBatchAcceptedAt){
      const attemptedAt=Number(meta.emailBatchAttemptedAtMs||0);
      const retryWindowMs=23*60*60*1000;

      // Resend remembers idempotency keys for 24 hours. If an old attempt has an
      // unknown outcome, do not auto-send the whole batch again after that window;
      // the organizer can safely resend individual participants from the UI.
      if(attemptedAt&&Date.now()-attemptedAt>retryWindowMs){
        batchError='The original email attempt is too old to auto-retry safely. Use Retry email beside any participant who still needs the link.';
      }else{
        if(!attemptedAt){
          meta={...meta,emailBatchAttemptedAtMs:Date.now(),emailBatchAttemptedAt:new Date().toISOString()};
          await writeSplitMeta(splitId,meta);
        }

        let delivered=null;
        try{
          const messages=invites.map(invite=>({
            from:process.env.SPLIT_EMAIL_FROM,
            to:[invite.email],
            subject:inviteSubject(meta,invite),
            html:inviteHtml(meta,invite,invite.url)
          }));
          delivered=await sendInviteBatch(messages,`split-invites/${splitId}`);
        }catch(error){
          batchError=error?.message||'Email delivery failed.';
          console.error('SPLIT invite batch failed:',batchError);
        }

        if(delivered){
          meta={...meta,emailBatchAcceptedAt:new Date().toISOString()};
          try{await writeSplitMeta(splitId,meta)}catch(error){
            deliveryStateWarning='Emails were accepted, but SPLIT could not persist the batch receipt. Do not recreate the SPLIT; use the individual retry controls if needed.';
            console.error('SPLIT email batch receipt persistence:',error?.message||error);
          }

          for(let i=0;i<invites.length;i++){
            invites[i].emailSent=true;
            invites[i].emailStatus='accepted';
            invites[i].emailId=delivered[i]?.id||invites[i].emailId||'';
          }
          try{
            await Promise.all(invites.map(async invite=>{
              const updated={...invite,emailStatus:'accepted'};delete updated.url;
              await saveParticipant(splitId,updated,meta);
              if(updated.emailId)await writeEmailIndex(updated.emailId,{splitId,participantId:updated.id});
            }));
          }catch(error){
            deliveryStateWarning=deliveryStateWarning||'Emails were accepted, but SPLIT could not persist every delivery status. Use the participant links below rather than recreating the SPLIT.';
            console.error('SPLIT email state persistence:',error?.message||error);
          }
        }
      }
    }

    return res.status(200).json({
      success:true,splitId,adminToken,storageEnabled:true,idempotent:Boolean(existingMeta),
      emailBatchError:batchError,deliveryStateWarning,
      invites:invites.map(safePublicParticipant)
    });
  }catch(error){
    console.error(error);
    const status=/not configured|storage|blob/i.test(String(error?.message||''))?503:400;
    return res.status(status).json({success:false,error:error?.message||'Could not create SPLIT invitations.'});
  }
}
