import { escapeHtml } from './_split-invite-utils.js';

export function inviteSubject(meta,participant){
  return `${meta.name}: your share is ${participant.amount} ${meta.asset}`;
}
export function inviteText(meta,participant,url){
  return `Hi ${participant.name},\n\nYour share of ${meta.name} is ${participant.amount} ${meta.asset} on ${meta.networkName}.\nReview and pay: ${url}\n\nCheck the amount, network and recipient before signing. SPLIT never asks for a seed phrase or private key.`;
}
export function creatorMessage(meta,invites){
  return {
    from:process.env.SPLIT_EMAIL_FROM,to:[meta.creatorEmail],
    subject:`${meta.name}: your SPLIT is created`,
    text:`Your SPLIT ${meta.name} is created.\nTotal: ${meta.total} ${meta.asset} on ${meta.networkName}\nReceiving wallet: ${meta.payout}\n\nParticipant payment links:\n${invites.map(p=>`${p.name}: ${p.amount} ${meta.asset}\n${p.url}`).join('\n\n')}\n\nEach participant receives their own invitation. Keep this confirmation so you can share the links again.`,
    html:`<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#171717"><div style="max-width:620px;margin:auto;padding:32px"><strong>SPLIT</strong><h1>${escapeHtml(meta.name)} is created</h1><p>Total: ${escapeHtml(meta.total)} ${escapeHtml(meta.asset)} on ${escapeHtml(meta.networkName)}</p><p>Receiving wallet: ${escapeHtml(meta.payout)}</p><h2>Participant payment links</h2>${invites.map(p=>`<p><strong>${escapeHtml(p.name)}</strong> · ${escapeHtml(p.amount)} ${escapeHtml(meta.asset)}<br><a href="${escapeHtml(p.url)}">Review payment request</a></p>`).join('')}<p>Each participant receives their own invitation. Keep this confirmation so you can share the links again.</p></div></body></html>`
  };
}
export function inviteHtml(meta,participant,url){
  const safeName=escapeHtml(participant.name);
  const safeSplit=escapeHtml(meta.name);
  const safeAmount=escapeHtml(participant.amount);
  const safeAsset=escapeHtml(meta.asset);
  const safeNetwork=escapeHtml(meta.networkName);
  const safeUrl=escapeHtml(url);
  return `<!doctype html><html><body style="margin:0;background:#050505;color:#fff;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:620px;margin:0 auto;padding:42px 24px">
    <div style="font-size:18px;font-weight:800;letter-spacing:-.04em;margin-bottom:44px">SPLIT</div>
    <div style="color:#777;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Payment request</div>
    <h1 style="font-size:42px;line-height:1;margin:14px 0 18px;letter-spacing:-.055em">${safeSplit}</h1>
    <p style="color:#8a8a8a;line-height:1.6;margin:0 0 28px">Hi ${safeName}, your share of this SPLIT is ready.</p>
    <div style="border:1px solid #262626;border-radius:18px;padding:24px;background:#0a0a0a">
      <div style="color:#666;font-size:10px;text-transform:uppercase;letter-spacing:.12em">Your share</div>
      <div style="font-size:38px;font-weight:800;margin:8px 0 20px">${safeAmount} <span style="color:#777;font-size:16px">${safeAsset}</span></div>
      <div style="color:#777;font-size:12px;margin-bottom:18px">${safeNetwork}</div>
      <a href="${safeUrl}" style="display:block;background:#fff;color:#000;text-decoration:none;text-align:center;padding:15px 18px;border-radius:12px;font-weight:800">Review & pay my share</a>
    </div>
    <p style="color:#555;font-size:11px;line-height:1.6;margin-top:22px">Check the amount, network and recipient in your wallet before signing. SPLIT never asks for a seed phrase or private key.</p>
  </div></body></html>`;
}
function resendHeaders(idempotencyKey){
  const key=process.env.RESEND_API_KEY;
  if(!key)throw new Error('Email delivery is unavailable right now.');
  return {'authorization':`Bearer ${key}`,'content-type':'application/json','Idempotency-Key':idempotencyKey};
}
async function send(path,message,idempotencyKey){
  for(let attempt=0;attempt<2;attempt++){
    let response;
    try{response=await fetch(`https://api.resend.com${path}`,{
      method:'POST',headers:resendHeaders(idempotencyKey),body:JSON.stringify(message),signal:AbortSignal.timeout(15000)
    })}catch(error){if(!attempt)continue;throw new Error('Email delivery could not be confirmed. Retry with the same creation request.');}
    const out=await response.json().catch(()=>({}));
    if(response.ok)return out;
    if(!attempt&&(response.status===429||response.status>=500)){
      await new Promise(resolve=>setTimeout(resolve,1000));continue;
    }
    throw new Error(out?.message||'Email delivery failed.');
  }
}
export async function sendInviteBatch(messages,idempotencyKey){
  if(!Array.isArray(messages)||!messages.length)return [];
  if(messages.length>100)throw new Error('Too many email invitations in one batch.');
  const out=await send('/emails/batch',messages,idempotencyKey);
  if(!Array.isArray(out?.data)||out.data.length!==messages.length||out.data.some(x=>!x?.id))throw new Error('Email delivery receipts could not be confirmed. Retry with the same creation request.');
  return out.data;
}
export async function sendOneInvite(message,idempotencyKey){
  const out=await send('/emails',message,idempotencyKey);
  if(!out?.id)throw new Error('Email delivery receipt could not be confirmed.');
  return out;
}
