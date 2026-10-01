import { verifyPayload, readSplitMeta, readParticipant, saveParticipant, assertInviteMatchesStorage, claimVerifiedTransaction, removePendingPayment } from './_split-invite-utils.js';
import { verifyPaymentTransaction, PaymentVerificationError } from './_payment-verify.js';
function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body||'{}');return req.body||{}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed.'});
  let meta,participant,payload,hash;
  try{
    const body=bodyOf(req);payload=verifyPayload(body.token,'participant');hash=String(body.txHash||'').trim();
    meta=await readSplitMeta(payload.splitId);participant=await readParticipant(payload.splitId,payload.participantId);
    assertInviteMatchesStorage(payload,meta,participant);
    if(participant.status==='confirmed')return res.status(200).json({success:true,confirmed:true,status:'confirmed'});
    if(!participant.txHash)return res.status(409).json({success:false,confirmed:false,error:'Save the submitted transaction before confirming it.'});
    if(participant.txHash!==hash)return res.status(409).json({success:false,confirmed:false,error:'This is not the transaction attached to the payment request.'});
    if(participant.status==='rejected')return res.status(400).json({success:false,confirmed:false,retryAllowed:true,error:participant.rejectionReason||'This transaction was rejected. Submit a new payment.'});

    const result=await verifyPaymentTransaction({meta,participant,payload,txHash:hash});
    if(result.pending)return res.status(200).json({success:true,confirmed:false,pending:true,message:result.message});
    await claimVerifiedTransaction({network:meta.network,txHash:hash,splitId:meta.splitId,participantId:participant.id});
    const latest=await readParticipant(meta.splitId,participant.id)||participant;
    if(latest.txHash&&latest.txHash!==hash)throw new Error('A different transaction is now attached to this payment request.');
    const updated={...latest,status:'confirmed',txHash:hash,confirmedAt:new Date().toISOString(),rejectionReason:'',rejectedAt:''};
    await saveParticipant(meta.splitId,updated,meta);
    await removePendingPayment(meta.splitId,participant.id);
    return res.status(200).json({success:true,confirmed:true,status:'confirmed'});
  }catch(error){
    console.error(error);
    if(error instanceof PaymentVerificationError&&error.reject&&meta&&participant){
      try{
        const latest=await readParticipant(meta.splitId,participant.id)||participant;
        if(!latest.txHash||latest.txHash===hash){
          const updated={...latest,status:'rejected',rejectionReason:error.message,rejectedAt:new Date().toISOString()};
          await saveParticipant(meta.splitId,updated,meta);
          await removePendingPayment(meta.splitId,participant.id);
        }
      }catch{}
      return res.status(400).json({success:false,confirmed:false,pending:false,retryAllowed:true,error:error.message});
    }
    const status=/temporarily|unavailable|RPC/i.test(String(error?.message||''))?503:400;
    return res.status(status).json({success:false,confirmed:false,pending:status===503,error:error?.message||'Payment verification failed.'});
  }
}
