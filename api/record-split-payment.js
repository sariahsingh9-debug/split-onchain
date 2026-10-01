import { verifyPayload, readSplitMeta, readParticipant, listParticipants, saveSubmittedPayment, assertInviteMatchesStorage } from './_split-invite-utils.js';
import { reportError } from './_operations.js';
import { reconcileParticipant } from './_split-reconcile.js';
function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body||'{}');return req.body||{}}
function validHash(network,value){const s=String(value||'').trim();return network==='solana'?/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(s):/^0x[a-fA-F0-9]{64}$/.test(s)}
function validPayer(network,value){const s=String(value||'').trim();return network==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s):/^0x[a-fA-F0-9]{40}$/.test(s)}
async function backgroundConfirm(meta,participant){
  const started=Date.now();
  let current=participant;
  while(Date.now()-started<240000){
    try{
      current=await reconcileParticipant(meta,current);
      if(current.status!=='submitted')return current;
    }catch(error){
      console.warn('Background payment verification retry:',error?.message||error);
    }
    await new Promise(r=>setTimeout(r,2500));
  }
  return current;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed.'});
  try{
    const {token,txHash,payer}=bodyOf(req);const payload=verifyPayload(token,'participant');
    const meta=await readSplitMeta(payload.splitId);const participant=await readParticipant(payload.splitId,payload.participantId);
    assertInviteMatchesStorage(payload,meta,participant);
    const signature=String(txHash||'').trim();const payerAddress=String(payer||'').trim();
    if(!validHash(meta.network,signature))return res.status(400).json({success:false,error:'Invalid transaction reference.'});
    if(!validPayer(meta.network,payerAddress))return res.status(400).json({success:false,error:'Invalid payer wallet.'});
    if(participant.status==='confirmed')return res.status(200).json({success:true,persisted:true,status:'confirmed'});
    if(participant.status==='submitted'&&participant.txHash===signature)return res.status(200).json({success:true,persisted:true,status:'submitted'});
    if(participant.status==='submitted'&&participant.txHash!==signature)return res.status(409).json({success:false,error:'A different transaction is already being verified for this payment request.'});

    const all=await listParticipants(meta.splitId,meta);
    const reused=all.find(p=>p.id!==participant.id&&p.txHash&&String(p.txHash).toLowerCase()===signature.toLowerCase());
    if(reused)return res.status(409).json({success:false,error:'This transaction is already attached to another participant in this SPLIT.'});

    const updated={...participant,status:'submitted',txHash:signature,payer:payerAddress,submittedAt:new Date().toISOString(),rejectionReason:'',rejectedAt:''};
    try{await saveSubmittedPayment(meta,updated)}catch{
      void reportError({event:'payment_recovery_save_failed',route:'/api/record-split-payment',status:503,requestId:req.requestId});
      return res.status(503).json({success:false,persisted:false,error:'Payment tracking could not be saved. Keep your transaction reference and try again.'});
    }
    let final=updated;
    try{final=await reconcileParticipant(meta,updated)}catch{}
    if(final.status==='submitted'){
      try{req.waitUntil?.(backgroundConfirm(meta,final))}catch(error){
        console.warn('Background payment confirmation could not start:',error?.message||error);
      }
    }
    return res.status(200).json({
      success:true,persisted:true,status:final.status||'submitted',
      confirmed:final.status==='confirmed'
    });
  }catch(error){console.error(error);return res.status(400).json({success:false,error:error?.message||'Could not record payment.'})}
}
