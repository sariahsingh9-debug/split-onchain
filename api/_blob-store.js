let redisClientPromise=null;

async function redisClient(){
  if(!process.env.REDIS_URL)return null;
  if(!redisClientPromise){
    redisClientPromise=import('ioredis').then(({default:Redis})=>{
      const client=new Redis(process.env.REDIS_URL,{
        maxRetriesPerRequest:2,
        enableReadyCheck:true,
        lazyConnect:true
      });
      client.on('error',error=>console.error('SPLIT storage error:',error?.message||error));
      return client.connect().catch(error=>{
        redisClientPromise=null;
        throw error;
      }).then(()=>client);
    });
  }
  return redisClientPromise;
}

async function netlifyStore(){
  const {getStore}=await import('@netlify/blobs');
  return getStore('split-data');
}

export async function put(pathname,body,options={}){
  const key=String(pathname);
  const value=typeof body==='string'?body:String(body??'');
  const redis=await redisClient();
  if(redis){
    if(options?.allowOverwrite===false){
      const ok=await redis.set(key,value,'NX');
      if(ok!=='OK'){
        const error=new Error('Blob already exists.');
        error.code='BLOB_ALREADY_EXISTS';
        throw error;
      }
    }else{
      await redis.set(key,value);
    }
    return {pathname:key,etag:''};
  }

  const store=await netlifyStore();
  const onlyIfNew=options?.allowOverwrite===false;
  const result=await store.set(key,value,{...(onlyIfNew?{onlyIfNew:true}:{})});
  if(onlyIfNew&&!result?.modified){
    const error=new Error('Blob already exists.');
    error.code='BLOB_ALREADY_EXISTS';
    throw error;
  }
  return {pathname:key,etag:result?.etag||''};
}

export async function get(pathname){
  const key=String(pathname);
  const redis=await redisClient();
  if(redis){
    const value=await redis.get(key);
    if(value===null)return null;
    return {pathname:key,stream:new Response(value).body};
  }

  const store=await netlifyStore();
  const value=await store.get(key,{type:'text',consistency:'strong'});
  if(value===null||value===undefined)return null;
  return {pathname:key,stream:new Response(String(value)).body};
}

export async function del(pathname){
  const key=String(pathname);
  const redis=await redisClient();
  if(redis){await redis.del(key);return}
  const store=await netlifyStore();
  await store.delete(key);
}

export async function list({prefix='',limit=100}={}){
  const redis=await redisClient();
  if(redis){
    const pattern=String(prefix||'')+'*';
    let cursor='0';
    const keys=[];
    do{
      const [next,batch]=await redis.scan(cursor,'MATCH',pattern,'COUNT',Math.max(100,Number(limit)||100));
      cursor=next;
      keys.push(...batch);
      if(keys.length>=Number(limit||100))break;
    }while(cursor!=='0');
    return {blobs:keys.slice(0,Number(limit||100)).map(key=>({pathname:key,key,etag:''})),hasMore:cursor!=='0',cursor:cursor!=='0'?cursor:null};
  }

  const store=await netlifyStore();
  const result=await store.list({prefix:String(prefix||'')});
  const blobs=(result?.blobs||[]).map(entry=>({pathname:entry.key,key:entry.key,etag:entry.etag}));
  return {blobs,hasMore:Boolean(result?.hasMore),cursor:result?.cursor||null};
}
