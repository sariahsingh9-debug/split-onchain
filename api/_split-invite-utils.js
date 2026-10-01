import crypto from 'node:crypto';

export function requireSecret(){
  const secret=process.env.SPLIT_INVITE_SECRET;
  if(!secret || secret.length<32)throw new Error('SPLIT_INVITE_SECRET is not configured.');
  return secret;
}
export function signPayload(payload){
  const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature=crypto.createHmac('sha256',requireSecret()).update(encoded).digest('base64url');
  return encoded+'.'+signature;
}
export function verifyPayload(token,expectedRole){
  const parts=String(token||'').split('.');
  if(parts.length!==2||!parts[0]||!parts[1])throw new Error('Invalid SPLIT link.');
  const [encoded,signature]=parts;
  const expected=crypto.createHmac('sha256',requireSecret()).update(encoded).digest('base64url');
  let a,b;
  try{a=Buffer.from(signature,'base64url');b=Buffer.from(expected,'base64url')}catch{throw new Error('This SPLIT link is invalid.');}
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw new Error('This SPLIT link is invalid.');
  let payload;
  try{payload=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'))}catch{throw new Error('This SPLIT link is invalid.');}
  if(expectedRole&&payload.role!==expectedRole)throw new Error('This SPLIT link does not have the required access.');
  if(payload.exp&&Date.now()>Number(payload.exp))throw new Error('This SPLIT link has expired.');
  return payload;
}
export function cleanText(value,max=140){
  return String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim().slice(0,max);
}
export function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim())}
export function escapeHtml(value){
  return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function normalizedOrigin(candidate){
  if(!candidate)return '';
  try{
    const u=new URL(/^https?:\/\//i.test(candidate)?candidate:`https://${candidate}`);
    const local=['localhost','127.0.0.1'].includes(u.hostname);
    if(u.protocol!=='https:'&&!(local&&u.protocol==='http:'))return '';
    return u.origin;
  }catch{return ''}
}
export function baseUrl(){
  const explicit=normalizedOrigin(process.env.APP_BASE_URL);
  if(explicit)return explicit;
  const render=normalizedOrigin(process.env.RENDER_EXTERNAL_URL);
  if(render)return render;
  throw new Error('APP_BASE_URL is not configured. Set the public production origin before sending invitations.');
}

// Storage v2 uses one blob per participant, so simultaneous payments cannot
// overwrite one another. The single-file v1 fallback remains readable.
export function splitPath(id){return `split-requests/${id}.json`}
export function splitMetaPath(id){return `split-requests/${id}/meta.json`}
export function participantPath(id,participantId){return `split-requests/${id}/participants/${participantId}.json`}
export function paymentTxPath(network,txHash){
  const safeNetwork=cleanText(network,40).replace(/[^a-zA-Z0-9_-]/g,'_');
  const canonicalHash=network==='solana'?String(txHash||''):String(txHash||'').toLowerCase();
  const digest=crypto.createHash('sha256').update(canonicalHash).digest('hex');
  return `payment-tx-index/${safeNetwork}/${digest}.json`;
}

export function pendingPaymentPath(splitId,participantId){return `payment-pending/${splitId}/${participantId}.json`}
export function emailIndexPath(emailId){
  const digest=crypto.createHash('sha256').update(String(emailId||'')).digest('hex');
  return `email-index/${digest}.json`;
}
export async function writePendingPayment(record){
  return writePrivateJson(pendingPaymentPath(record.splitId,record.participantId),record);
}
// The submitted participant and its recovery index must commit together.
export async function saveSubmittedPayment(meta,participant){
  const {putMany}=await import('./_blob-store.js');
  const pending={splitId:meta.splitId,participantId:participant.id,network:meta.network,txHash:participant.txHash,createdAt:participant.submittedAt};
  let recordKey=participantPath(meta.splitId,participant.id),record=participant;
  if(meta.storageVersion===1){
    record=await readPrivateJson(splitPath(meta.splitId));
    if(!record)throw new Error('SPLIT storage record is unavailable.');
    record.participants=record.participants.map(p=>p.id===participant.id?participant:p);
    recordKey=splitPath(meta.splitId);
  }
  await putMany([[recordKey,JSON.stringify(record)],[pendingPaymentPath(meta.splitId,participant.id),JSON.stringify(pending)]]);
}
export async function removePendingPayment(splitId,participantId){
  const {del}=await import('./_blob-store.js');
  try{await del(pendingPaymentPath(splitId,participantId))}catch{}
}
export async function writeEmailIndex(emailId,record){
  if(!emailId)return null;
  return writePrivateJson(emailIndexPath(emailId),{...record,emailId});
}
export async function readEmailIndex(emailId){
  if(!emailId)return null;
  return readPrivateJson(emailIndexPath(emailId));
}

export async function readPrivateJson(pathname){
  const {get}=await import('./_blob-store.js');
  const result=await get(pathname,{access:'private',useCache:false});
  if(!result?.stream)return null;
  const text=await new Response(result.stream).text();
  return JSON.parse(text);
}
export async function writePrivateJson(pathname,data,{overwrite=true}={}){
  const {put}=await import('./_blob-store.js');
  return put(pathname,JSON.stringify(data),{
    access:'private',addRandomSuffix:false,allowOverwrite:overwrite,contentType:'application/json'
  });
}
export async function readSplitMeta(splitId){
  try{
    const meta=await readPrivateJson(splitMetaPath(splitId));
    if(meta)return meta;
  }catch(error){
    // Continue only so an older single-file SPLIT can still be read.
    if(!String(error?.message||'').toLowerCase().includes('not found')){
      try{const legacy=await readPrivateJson(splitPath(splitId));if(legacy){const {participants,...m}=legacy;return {...m,storageVersion:1}}}catch{}
      throw error;
    }
  }
  const legacy=await readPrivateJson(splitPath(splitId));
  if(!legacy)return null;
  const {participants,...meta}=legacy;
  return {...meta,storageVersion:1};
}
export async function readParticipant(splitId,participantId){
  try{const p=await readPrivateJson(participantPath(splitId,participantId));if(p)return p}catch{}
  const legacy=await readPrivateJson(splitPath(splitId));
  return legacy?.participants?.find(p=>p.id===participantId)||null;
}
export async function writeSplitMeta(splitId,data,{overwrite=true}={}){return writePrivateJson(splitMetaPath(splitId),{...data,storageVersion:2},{overwrite})}
export async function writeParticipant(splitId,participantId,data){return writePrivateJson(participantPath(splitId,participantId),data)}
export async function saveParticipant(splitId,participant,meta=null){
  const splitMeta=meta||await readSplitMeta(splitId);
  if(splitMeta?.storageVersion===1){
    const legacy=await readPrivateJson(splitPath(splitId));
    if(!legacy)throw new Error('SPLIT storage record is unavailable.');
    const index=(legacy.participants||[]).findIndex(p=>p.id===participant.id);
    if(index<0)throw new Error('Participant record was not found.');
    legacy.participants[index]=participant;
    await writePrivateJson(splitPath(splitId),legacy);
    return participant;
  }
  await writeParticipant(splitId,participant.id,participant);
  return participant;
}
export async function listParticipants(splitId,meta=null){
  const splitMeta=meta||await readSplitMeta(splitId);
  if(!splitMeta)return [];
  if(splitMeta.storageVersion===1){
    const legacy=await readPrivateJson(splitPath(splitId));
    return Array.isArray(legacy?.participants)?legacy.participants:[];
  }
  const {list}=await import('./_blob-store.js');
  const prefix=`split-requests/${splitId}/participants/`;
  let cursor;const blobs=[];
  do{
    const page=await list({prefix,limit:100,...(cursor?{cursor}:{})});
    blobs.push(...(page?.blobs||[]));
    cursor=page?.hasMore?page.cursor:undefined;
  }while(cursor&&blobs.length<100);
  const rows=await Promise.all(blobs.map(async b=>{try{return await readPrivateJson(b.pathname)}catch{return null}}));
  return rows.filter(Boolean);
}

// Claim a transaction hash globally after it has been cryptographically/on-chain
// verified. This prevents one on-chain payment from satisfying multiple SPLITs.
export async function claimVerifiedTransaction({network,txHash,splitId,participantId}){
  const pathname=paymentTxPath(network,txHash);
  const record={network,txHash,splitId,participantId,claimedAt:new Date().toISOString()};
  try{
    await writePrivateJson(pathname,record,{overwrite:false});
    return record;
  }catch(error){
    let existing=null;
    try{existing=await readPrivateJson(pathname)}catch{}
    if(existing?.splitId===splitId&&existing?.participantId===participantId)return existing;
    throw new Error('This blockchain transaction has already been used for another SPLIT payment.');
  }
}

export function assertInviteMatchesStorage(payload,meta,participant){
  if(!meta||!participant)throw new Error('This SPLIT payment request is no longer available.');
  const same=(a,b)=>String(a??'')===String(b??'');
  if(!same(payload.splitId,meta.splitId)||!same(payload.participantId,participant.id))throw new Error('This SPLIT link does not match the stored payment request.');
  if(!same(payload.participantName,participant.name)||!same(payload.splitName,meta.name))throw new Error('This SPLIT link does not match the stored participant.');
  if(!same(payload.amount,participant.amount)||!same(payload.total,meta.total)||!same(payload.network,meta.network)||!same(payload.asset,meta.asset)||!same(payload.payout,meta.payout)){
    throw new Error('This SPLIT link no longer matches the stored payment details.');
  }
  if(meta.expiresAt&&Date.now()>Date.parse(meta.expiresAt))throw new Error('This SPLIT payment request has expired.');
  return true;
}
