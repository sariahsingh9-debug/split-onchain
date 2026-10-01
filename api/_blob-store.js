import crypto from 'node:crypto';

let clientPromise;
export async function redisClient(){
  if(!process.env.REDIS_URL)throw new Error('Persistent storage is not configured.');
  if(!clientPromise){
    clientPromise=import('ioredis').then(async({default:Redis})=>{
      const client=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:2,lazyConnect:true,connectTimeout:5000,commandTimeout:10000});
      client.on('error',()=>console.error(JSON.stringify({level:'error',event:'storage_connection_error'})));
      try{await client.connect();return client}catch(error){client.disconnect();clientPromise=null;throw error}
    });
  }
  return clientPromise;
}
export async function closeStorage(){if(clientPromise){const client=await clientPromise;client.disconnect();clientPromise=null}}
export async function put(pathname,body,options={}){
  const client=await redisClient();const key=String(pathname),value=String(body??'');
  const args=[key,value];
  if(options.ttlSeconds)args.push('EX',Math.max(1,Math.ceil(options.ttlSeconds)));
  if(options.allowOverwrite===false)args.push('NX');
  const result=await client.set(...args);
  if(result!== 'OK'){const error=new Error('Record already exists.');error.code='BLOB_ALREADY_EXISTS';throw error}
  return {pathname:key,etag:''};
}
export async function get(pathname){
  const value=await (await redisClient()).get(String(pathname));
  return value===null?null:{pathname:String(pathname),stream:new Response(value).body};
}
export async function del(pathname){await (await redisClient()).del(String(pathname))}
export async function putMany(entries){
  const client=await redisClient();const transaction=client.multi();
  for(const [key,value] of entries)transaction.set(String(key),String(value));
  const results=await transaction.exec();
  if(!results||results.some(([error])=>error))throw new Error('Could not save the payment and recovery record.');
}
// COUNT is a hint. Return the entire SCAN batch: slicing it loses keys forever.
export async function list({prefix='',limit=100,cursor='0'}={}){
  if(!/^\d+$/.test(String(cursor)))throw new Error('Invalid storage cursor.');
  const escaped=String(prefix).replace(/[\\*?\[\]]/g,'\\$&');
  const [next,keys]=await (await redisClient()).scan(String(cursor),'MATCH',escaped+'*','COUNT',Math.min(1000,Math.max(1,Number(limit)||100)));
  return {blobs:[...new Set(keys)].map(key=>({pathname:key,key,etag:''})),hasMore:next!=='0',cursor:next!=='0'?next:null};
}
export async function acquireLease(key,seconds=180){
  const token=crypto.randomUUID();const client=await redisClient();
  if(await client.set(key,token,'EX',seconds,'NX')!=='OK')return null;
  return async()=>client.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) end return 0",1,key,token);
}
