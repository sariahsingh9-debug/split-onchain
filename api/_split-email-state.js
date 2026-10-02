import {acquireLease} from './_blob-store.js';
import {readParticipant,saveParticipant,writeEmailIndex} from './_split-invite-utils.js';

// Email receipts share the payment lock and merge into the latest record, so a
// slow provider response cannot overwrite a payment that has already completed.
export async function recordAcceptedEmail(meta,participantId,emailId,extra={},replace=false){
  const release=await acquireLease(`operations/participant/${meta.splitId}/${participantId}`,180);
  if(!release)throw new Error('Participant status is being updated. Retry shortly.');
  try{
    const current=await readParticipant(meta.splitId,participantId);
    if(!current)throw new Error('Participant record was not found.');
    const updated=current.emailId===emailId||(!replace&&current.emailSent&&current.emailId)?current:{...current,...extra,emailId,emailSent:true,emailStatus:'accepted',emailError:''};
    await saveParticipant(meta.splitId,updated,meta);
    await writeEmailIndex(emailId,{splitId:meta.splitId,participantId});
    return updated;
  }finally{await release().catch(()=>{})}
}
