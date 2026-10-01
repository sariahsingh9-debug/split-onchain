import Redis from 'ioredis';
// Run from Render's private network. Keep the original instance until verification
// and the application's connection switch are complete; a free-tier upgrade erases it.
if(!process.env.SOURCE_REDIS_URL||!process.env.TARGET_REDIS_URL)throw new Error('Set SOURCE_REDIS_URL and TARGET_REDIS_URL in the secure runtime environment.');
if(process.env.SOURCE_REDIS_URL===process.env.TARGET_REDIS_URL)throw new Error('Source and target must be different instances.');
if(!process.argv.includes('--source-paused'))throw new Error('Pause payment writes and reconciliation first, then pass --source-paused.');
const copy=process.argv.includes('--copy'),verify=process.argv.includes('--verify');
if(copy===verify)throw new Error('Choose --copy or --verify.');
const options={lazyConnect:true,maxRetriesPerRequest:2,connectTimeout:5000,commandTimeout:10000};
const source=new Redis(process.env.SOURCE_REDIS_URL,options),target=new Redis(process.env.TARGET_REDIS_URL,options);
source.on('error',()=>{});target.on('error',()=>{});
const prefixes=['split-requests/','payment-pending/','payment-tx-index/','creator-index/','launch-directory/','revenue-pending/','email-index/'];
try{
 await source.connect();await target.connect();
 const info=await target.info('persistence');
 if(!/^aof_enabled:1\r?$/m.test(info)||!/^aof_last_write_status:ok\r?$/m.test(info))throw new Error('Target persistence is not ready.');
 let cursor='0',count=0;const seen=new Set();
 do{
  const [next,keys]=await source.scan(cursor,'COUNT',100);cursor=next;
  for(const key of keys){
   if(seen.has(key)||!prefixes.some(prefix=>key.startsWith(prefix)))continue;seen.add(key);
   const value=await source.get(key);if(value===null)continue;
   if(copy){const result=await target.set(key,value,'NX');if(result!=='OK'&&await target.get(key)!==value)throw new Error('A target record differs; migration stopped without overwriting it.')}
   if(await target.get(key)!==value)throw new Error('Record verification failed; do not switch storage.');count++;
  }
 }while(cursor!=='0');
 console.log(JSON.stringify({success:true,mode:copy?'copy':'verify',verifiedRecords:count}));
} catch {console.error('Storage migration failed. Keep the original storage connection and inspect the runtime configuration.');process.exitCode=1}
finally{source.disconnect();target.disconnect()}
