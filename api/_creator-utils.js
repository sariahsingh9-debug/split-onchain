import crypto from 'node:crypto';
import { list } from './_blob-store.js';
import { readPrivateJson, writePrivateJson, verifyPayload } from './_split-invite-utils.js';

export function normalizeCreatorWallet(wallet,family=''){
  const raw=String(wallet||'').trim();
  if(family==='evm'||/^0x[a-fA-F0-9]{40}$/.test(raw)){
    if(!/^0x[a-fA-F0-9]{40}$/.test(raw))throw new Error('Invalid EVM creator wallet.');
    return {wallet:raw.toLowerCase(),family:'evm'};
  }
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw))throw new Error('Invalid Solana creator wallet.');
  return {wallet:raw,family:'solana'};
}
export function creatorHash(wallet,family=''){
  const n=normalizeCreatorWallet(wallet,family);
  return crypto.createHash('sha256').update(`${n.family}:${n.wallet}`).digest('hex');
}
export function creatorPrefix(wallet,family=''){return `creator-index/${creatorHash(wallet,family)}`}
export function creatorSplitPath(wallet,splitId,family=''){return `${creatorPrefix(wallet,family)}/splits/${splitId}.json`}
export function creatorLaunchPath(wallet,mint,family='solana'){return `${creatorPrefix(wallet,family)}/launches/${mint}.json`}
export function creatorRevenuePath(wallet,routingId,eventId,family='solana'){return `${creatorPrefix(wallet,family)}/revenue/${routingId}/${eventId}.json`}

export async function writeCreatorSplitIndex(meta,adminToken=''){
  const n=normalizeCreatorWallet(meta.creatorWallet||meta.payout,meta.network==='solana'?'solana':'evm');
  const record={
    type:'split',splitId:meta.splitId,name:meta.name,network:meta.network,networkName:meta.networkName,
    asset:meta.asset,total:meta.total,payout:meta.payout,creatorWallet:n.wallet,family:n.family,
    participantCount:meta.participantCount,createdAt:meta.createdAt,expiresAt:meta.expiresAt,
    adminToken
  };
  await writePrivateJson(creatorSplitPath(n.wallet,meta.splitId,n.family),record);
  return record;
}
export async function writeCreatorLaunchIndex(route,record,routingToken){
  const n=normalizeCreatorWallet(route.creatorWallet,'solana');
  const item={
    type:'launch',creatorWallet:n.wallet,family:'solana',mintAddress:record.mintAddress,
    name:record.name,symbol:record.symbol,network:record.network,launchedAt:record.launchedAt,
    imageUrl:record.imageUrl,bannerUrl:record.bannerUrl,launchUrl:record.launchUrl,
    routingId:route.routingId,routingToken
  };
  await writePrivateJson(creatorLaunchPath(n.wallet,record.mintAddress,'solana'),item);
  return item;
}
export async function writeCreatorRevenueEvent(route,{grossLamports,distributionSignature,transfers=[]}){
  const n=normalizeCreatorWallet(route.creatorWallet,'solana');
  const eventId=`${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const item={
    type:'revenue',creatorWallet:n.wallet,routingId:route.routingId,mintAddress:route.mintAddress||'',
    tokenName:route.token?.name||'',symbol:route.token?.symbol||'',network:route.network,
    grossLamports:String(grossLamports||'0'),distributionSignature:distributionSignature||'',
    transfers,createdAt:new Date().toISOString()
  };
  await writePrivateJson(creatorRevenuePath(n.wallet,route.routingId,eventId,'solana'),item);
  return item;
}
export async function listCreatorRecords(wallet,family,type,limit=250){
  const n=normalizeCreatorWallet(wallet,family);
  const prefix=`${creatorPrefix(n.wallet,n.family)}/${type}/`;
  let cursor;const blobs=[];
  do{
    const page=await list({prefix,limit:100,...(cursor?{cursor}:{})});
    blobs.push(...(page?.blobs||[]));
    cursor=page?.hasMore?page.cursor:undefined;
  }while(cursor&&blobs.length<limit);
  const rows=await Promise.all(blobs.slice(0,limit).map(async b=>{try{return await readPrivateJson(b.pathname)}catch{return null}}));
  return rows.filter(Boolean);
}
export function creatorSession(req){
  const header=String(req.headers?.authorization||'');
  if(!header.startsWith('Bearer '))throw new Error('Creator login is required.');
  const payload=verifyPayload(header.slice(7),'creator');
  const n=normalizeCreatorWallet(payload.wallet,payload.family);
  return {...payload,wallet:n.wallet,family:n.family};
}
