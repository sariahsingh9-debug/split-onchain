import crypto from 'node:crypto';
import { redisClient } from './_blob-store.js';

function key(wallet,scope,slot){
  const hash=crypto.createHash('sha256').update(String(wallet||'')).digest('hex');
  return `rate-limit/launch/${hash}/${scope}/${slot}.json`;
}
export async function consumeLaunchQuota(wallet,scope,{limit=12,windowMs=10*60*1000}={}){
  const slot=Math.floor(Date.now()/windowMs);
  const path=key(wallet,scope,slot);
  const client=await redisClient();
  const count=Number(await client.eval("local n=redis.call('incr',KEYS[1]); if n==1 then redis.call('expire',KEYS[1],ARGV[1]) end; return n",1,path,Math.ceil(windowMs/1000)+60));
  if(count>limit){const error=new Error('Too many launch requests from this wallet. Wait a few minutes and try again.');error.code='RATE_LIMIT';throw error}
  return {count,limit};
}
