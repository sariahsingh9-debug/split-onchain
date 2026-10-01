import { escapeHtml } from './_split-invite-utils.js';

export function inviteSubject(meta,participant){
  return `${meta.name}: your share is ${participant.amount} ${meta.asset}`;
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
export async function sendInviteBatch(messages,idempotencyKey){
  if(!Array.isArray(messages)||!messages.length)return [];
  if(messages.length>100)throw new Error('Too many email invitations in one batch.');
  const response=await fetch('https://api.resend.com/emails/batch',{
    method:'POST',headers:resendHeaders(idempotencyKey),body:JSON.stringify(messages)
  });
  const out=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(out?.message||out?.error||'Email delivery failed.');
  return Array.isArray(out?.data)?out.data:[];
}
export async function sendOneInvite(message,idempotencyKey){
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:resendHeaders(idempotencyKey),body:JSON.stringify(message)
  });
  const out=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(out?.message||out?.error||'Email delivery failed.');
  return out;
}
