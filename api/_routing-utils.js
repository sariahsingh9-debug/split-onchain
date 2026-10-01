import crypto from 'node:crypto';
import { Keypair, PublicKey } from '@solana/web3.js';
import { assertFixedRoute } from './_launch-policy.js';

export function validSolanaAddress(value){try{new PublicKey(String(value||''));return true}catch{return false}}
export function deriveFeeWallet(routingId,secret){
  const seed=crypto.createHmac('sha256',secret).update('split-fee-wallet:'+routingId).digest().subarray(0,32);
  return Keypair.fromSeed(Uint8Array.from(seed));
}
export function signRoutingPayload(payload,secret){
  const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig=crypto.createHmac('sha256',secret).update(encoded).digest('base64url');
  return encoded+'.'+sig;
}
export function verifyRoutingToken(token,secret){
  const parts=String(token||'').split('.');
  if(parts.length!==2)throw new Error('Invalid routing token.');
  const [encoded,sig]=parts;
  const expected=crypto.createHmac('sha256',secret).update(encoded).digest('base64url');
  const a=Buffer.from(sig,'base64url');const b=Buffer.from(expected,'base64url');
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw new Error('Routing token signature is invalid.');
  const route=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
  if(!route?.routingId||!route?.feeWallet)throw new Error('Routing token is incomplete.');
  const bps=[route.creatorBps,route.treasuryBps,route.liquidityBps,route.protocolBps].map(Number);
  if(bps.some(v=>!Number.isInteger(v)||v<0)||bps.reduce((a,b)=>a+b,0)!==10000)throw new Error('Routing percentages are invalid.');
  assertFixedRoute(route);
  const fee=deriveFeeWallet(route.routingId,secret);
  if(fee.publicKey.toBase58()!==route.feeWallet)throw new Error('Fee-wallet derivation mismatch.');
  for(const [bpsKey,addressKey] of [['creatorBps','creatorRecipient'],['treasuryBps','treasuryRecipient'],['liquidityBps','liquidityRecipient'],['protocolBps','protocolRecipient']]){
    if(Number(route[bpsKey])>0&&!validSolanaAddress(route[addressKey]))throw new Error('Routing recipient is invalid.');
  }
  return route;
}
