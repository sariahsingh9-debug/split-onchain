import crypto from 'node:crypto';
import { signPayload, baseUrl } from './_split-invite-utils.js';
import { normalizeCreatorWallet } from './_creator-utils.js';

function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body||'{}');return req.body||{}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed.'});
  try{
    const body=bodyOf(req);
    const n=normalizeCreatorWallet(body.wallet,body.family);
    const now=Date.now(),exp=now+5*60*1000,nonce=crypto.randomBytes(18).toString('hex');
    const origin=baseUrl();
    const message=[
      'Sign in to SPLIT',
      '',
      `Wallet: ${n.wallet}`,
      `Origin: ${origin}`,
      `Nonce: ${nonce}`,
      `Expires: ${new Date(exp).toISOString()}`,
      '',
      'This signature proves wallet ownership only. It does not authorize a blockchain transaction.'
    ].join('\n');
    const challengeToken=signPayload({v:1,role:'creator_challenge',wallet:n.wallet,family:n.family,nonce,message,iat:now,exp});
    return res.status(200).json({success:true,message,challengeToken,expiresAt:exp});
  }catch(error){return res.status(400).json({success:false,error:error?.message||'Could not create login challenge.'})}
}
