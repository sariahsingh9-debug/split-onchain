import { creatorSession, listCreatorRecords } from './_creator-utils.js';
import { claimAndDistribute } from './_creator-revenue.js';
import {reportError} from './_operations.js';

function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body||'{}');return req.body||{}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed.'});
  try{
    const session=creatorSession(req);
    if(session.family!=='solana')return res.status(400).json({success:false,error:'Token creator revenue uses a Solana creator wallet.'});
    const mint=String(bodyOf(req).mintAddress||'').trim();
    const launches=await listCreatorRecords(session.wallet,'solana','launches',250);
    const launch=launches.find(x=>x.mintAddress===mint);
    if(!launch)return res.status(404).json({success:false,error:'This launch was not found for the connected creator wallet.'});
    if(!launch.routingToken)return res.status(409).json({success:false,error:'This older launch does not have a recoverable revenue-routing credential.'});
    return res.status(200).json(await claimAndDistribute(launch.routingToken));
  }catch(error){
    const msg=error?.message||'Creator revenue could not be distributed.';
    const auth=/login|expired|SPLIT link/i.test(msg);
    if(!auth)void reportError({event:'creator_revenue_claim_failed',route:'/api/creator-claim-revenue',status:500,requestId:req.requestId});
    return res.status(auth?401:500).json({success:false,error:msg});
  }
}
