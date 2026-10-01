import {reportError} from './_operations.js';
const limits=new Map();let bucket=0,total=0;
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({success:false});
  const origin=String(req.headers.origin||'');
  const expected=new URL(process.env.APP_BASE_URL||process.env.RENDER_EXTERNAL_URL||'http://127.0.0.1:3100').origin;
  if(origin!==expected)return res.status(403).json({success:false});
  const now=Math.floor(Date.now()/60000);if(now!==bucket){bucket=now;total=0;limits.clear()}
  const ip=req.socket.remoteAddress;const count=limits.get(ip)||0;
  if(count>=3||total>=30)return res.status(429).json({success:false});
  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body}catch{return res.status(400).json({success:false})}
  if(!['runtime','unhandled-rejection','asset-load'].includes(body?.kind))return res.status(400).json({success:false});
  limits.set(ip,count+1);total++;
  void reportError({event:'browser_'+body.kind,route:'frontend',requestId:req.requestId,status:500});
  return res.status(202).json({success:true});
}
