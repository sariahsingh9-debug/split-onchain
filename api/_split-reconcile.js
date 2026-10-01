import {
  readParticipant, listParticipants, saveParticipant, claimVerifiedTransaction,
  removePendingPayment
} from './_split-invite-utils.js';
import { verifyPaymentTransaction, PaymentVerificationError } from './_payment-verify.js';
import { reportError } from './_operations.js';
import { acquireLease } from './_blob-store.js';

async function mapLimit(items,limit,fn){
  const output=new Array(items.length);let cursor=0;
  async function worker(){while(true){const i=cursor++;if(i>=items.length)return;output[i]=await fn(items[i],i)}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return output;
}

export async function reconcileParticipant(meta,p){
  if(process.env.SPLIT_STORAGE_MAINTENANCE==='true'||p.status!=='submitted'||!p.txHash)return p;
  const release=await acquireLease(`operations/participant/${meta.splitId}/${p.id}`,180);
  if(!release)return {...p,verificationBusy:true};
  try{
    const current=await readParticipant(meta.splitId,p.id);
    if(!current||current.status!=='submitted'||current.txHash!==p.txHash)return current||p;
    p=current;
    const result=await verifyPaymentTransaction({meta,participant:p,txHash:p.txHash});
    if(result.confirmed){
      await claimVerifiedTransaction({network:meta.network,txHash:p.txHash,splitId:meta.splitId,participantId:p.id});
      const latest=await readParticipant(meta.splitId,p.id)||p;
      if(latest.status==='confirmed'||(latest.txHash&&latest.txHash!==p.txHash))return latest;
      const updated={...latest,status:'confirmed',confirmedAt:new Date().toISOString(),rejectionReason:'',rejectedAt:''};
      await saveParticipant(meta.splitId,updated,meta);
      await removePendingPayment(meta.splitId,p.id);
      return updated;
    }
    return p;
  }catch(error){
    if(error instanceof PaymentVerificationError&&error.reject){
      const latest=await readParticipant(meta.splitId,p.id)||p;
      if(latest.status==='confirmed'||(latest.txHash&&latest.txHash!==p.txHash))return latest;
      const updated={...latest,status:'rejected',rejectionReason:error.message,rejectedAt:new Date().toISOString()};
      await saveParticipant(meta.splitId,updated,meta);
      await removePendingPayment(meta.splitId,p.id);
      return updated;
    }
    void reportError({event:'payment_verification_unavailable',route:'/api/reconcile-payments',status:503});
    return {...p,verificationUnavailable:true};
  }finally{await release().catch(()=>{})}
}
export async function reconcileSplit(meta,limit=4){
  const participants=await listParticipants(meta.splitId,meta);
  return mapLimit(participants,limit,p=>reconcileParticipant(meta,p));
}
