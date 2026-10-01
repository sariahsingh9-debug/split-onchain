import crypto from 'node:crypto';
import { readPrivateJson, writePrivateJson } from './_split-invite-utils.js';

function key(wallet,scope,slot){
  const hash=crypto.createHash('sha256').update(String(wallet||'')).digest('hex');
  return `rate-limit/launch/${hash}/${scope}/${slot}.json`;
}
export async function consumeLaunchQuota(wallet,scope,{limit=12,windowMs=10*60*1000}={}){
  const slot=Math.floor(Date.now()/windowMs);
  const path=key(wallet,scope,slot);
  let record=null;
  try{record=await readPrivateJson(path)}catch{}
  const count=Number(record?.count||0)+1;
  if(count>limit)throw new Error('Too many launch requests from this wallet. Wait a few minutes and try again.');
  await writePrivateJson(path,{count,slot,updatedAt:new Date().toISOString()});
  return {count,limit};
}
