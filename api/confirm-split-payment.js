import { verifyPayload, readSplitMeta, readParticipant, assertInviteMatchesStorage } from './_split-invite-utils.js';
import { reconcileParticipant } from './_split-reconcile.js';
function bodyOf(req){return typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed.'});
  try{
    const body=bodyOf(req),payload=verifyPayload(body.token,'participant');
    const meta=await readSplitMeta(payload.splitId),participant=await readParticipant(payload.splitId,payload.participantId);
    assertInviteMatchesStorage(payload,meta,participant);
    if(participant.status==='confirmed')return res.status(200).json({success:true,confirmed:true,status:'confirmed'});
    if(!participant.txHash||participant.txHash!==(meta.network==='solana'?String(body.txHash||'').trim():String(body.txHash||'').trim().toLowerCase()))return res.status(409).json({success:false,error:'Save the matching submitted transaction before confirming it.'});
    const result=await reconcileParticipant(meta,participant);
    if(result.status==='rejected')return res.status(400).json({success:false,confirmed:false,pending:false,retryAllowed:true,error:result.rejectionReason});
    if(result.verificationUnavailable)return res.status(503).json({success:false,confirmed:false,pending:true,error:'Payment verification is temporarily unavailable. Your transaction is saved and will be checked automatically.'});
    return res.status(200).json({success:true,confirmed:result.status==='confirmed',pending:result.status!=='confirmed',status:result.status});
  }catch(error){return res.status(400).json({success:false,error:error?.message||'Payment verification failed.'})}
}
