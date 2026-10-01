import { verifyPayload, readSplitMeta, readParticipant, assertInviteMatchesStorage } from './_split-invite-utils.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({success:false,error:'Method not allowed.'});
  try{
    const payload=verifyPayload(String(req.query?.token||''),'participant');
    const meta=await readSplitMeta(payload.splitId);if(!meta)throw new Error('This SPLIT payment request is no longer available.');
    const participant=await readParticipant(payload.splitId,payload.participantId);if(!participant)throw new Error('This participant payment request is no longer available.');
    assertInviteMatchesStorage(payload,meta,participant);
    return res.status(200).json({success:true,request:{
      splitId:meta.splitId,participantId:participant.id,participantName:participant.name,splitName:meta.name,
      amount:participant.amount,total:meta.total,network:meta.network,networkName:meta.networkName,
      family:meta.network==='solana'?'solana':'evm',asset:meta.asset,payout:meta.payout,
      expiresAt:meta.expiresAtMs||Date.parse(meta.expiresAt),status:participant.status||'pending',
      txHash:participant.txHash||'',payer:participant.payer||'',rejectionReason:participant.rejectionReason||''
    }});
  }catch(error){
    const message=error?.message||'Invalid SPLIT link.';
    const status=/unavailable|storage|not available/i.test(message)?503:400;
    return res.status(status).json({success:false,error:message});
  }
}
