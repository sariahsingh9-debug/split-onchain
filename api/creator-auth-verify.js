import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { verifyMessage } from 'ethers';
import { verifyPayload, signPayload } from './_split-invite-utils.js';
import { normalizeCreatorWallet } from './_creator-utils.js';

function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body||'{}');return req.body||{}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed.'});
  try{
    const {family,wallet,signature,challengeToken}=bodyOf(req);
    const challenge=verifyPayload(challengeToken,'creator_challenge');
    const n=normalizeCreatorWallet(wallet,family);
    if(challenge.wallet!==n.wallet||challenge.family!==n.family)throw new Error('Wallet does not match the login challenge.');
    const message=String(challenge.message||'');
    let valid=false;

    if(n.family==='solana'){
      let sig;
      try{sig=bs58.decode(String(signature||''))}catch{throw new Error('Invalid Solana login signature.')}
      valid=nacl.sign.detached.verify(
        new TextEncoder().encode(message),
        sig,
        new PublicKey(n.wallet).toBytes()
      );
    }else{
      let recovered='';
      try{recovered=verifyMessage(message,String(signature||''))}catch{throw new Error('Invalid EVM login signature.')}
      valid=recovered.toLowerCase()===n.wallet.toLowerCase();
    }
    if(!valid)throw new Error('Wallet signature could not be verified.');

    const now=Date.now(),exp=now+24*60*60*1000;
    const sessionToken=signPayload({v:1,role:'creator',wallet:n.wallet,family:n.family,iat:now,exp});
    return res.status(200).json({success:true,wallet:n.wallet,family:n.family,sessionToken,expiresAt:exp});
  }catch(error){return res.status(400).json({success:false,error:error?.message||'Creator login failed.'})}
}
