import { verifyPayload, readSplitMeta } from './_split-invite-utils.js';
import { reconcileSplit } from './_split-reconcile.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({success:false,error:'Method not allowed.'});
  try{
    const admin=verifyPayload(String(req.query?.token||''),'admin');
    const meta=await readSplitMeta(admin.splitId);
    if(!meta)return res.status(404).json({success:false,error:'SPLIT record was not found.'});
    const participants=await reconcileSplit(meta,4);
    return res.status(200).json({
      success:true,splitId:meta.splitId,
      creatorDelivery:{email:meta.creatorEmail||'',emailSent:Boolean(meta.creatorEmailSent),emailStatus:meta.creatorEmailStatus||'',emailError:meta.creatorEmailError||''},
      participants:participants.map(p=>({
        id:p.id,name:p.name,email:p.email,status:p.status||'pending',txHash:p.txHash||'',
        submittedAt:p.submittedAt||'',confirmedAt:p.confirmedAt||'',rejectionReason:p.rejectionReason||'',
        emailSent:Boolean(p.emailSent),emailStatus:p.emailStatus||'',emailDeliveredAt:p.emailDeliveredAt||'',
        emailError:p.emailError||''
      }))
    });
  }catch(error){return res.status(400).json({success:false,error:error?.message||'Could not load SPLIT status.'})}
}
