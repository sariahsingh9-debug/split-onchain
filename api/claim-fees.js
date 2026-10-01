import { claimAndDistribute } from './_creator-revenue.js';
function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body||'{}');return req.body||{}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed'});
  try{return res.status(200).json(await claimAndDistribute(bodyOf(req).routingToken))}
  catch(error){console.error(error);return res.status(500).json({success:false,error:error?.message||'Fee claim failed.'})}
}
