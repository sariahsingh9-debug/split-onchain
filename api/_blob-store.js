import { getStore } from '@netlify/blobs';

const STORE_NAME='split-data';

function store(){
  return getStore(STORE_NAME);
}

export async function put(pathname, body, options={}){
  const onlyIfNew=options?.allowOverwrite===false;
  const result=await store().set(String(pathname), typeof body==='string'?body:String(body??''), {
    ...(onlyIfNew?{onlyIfNew:true}:{})
  });
  if(onlyIfNew && !result?.modified){
    const error=new Error('Blob already exists.');
    error.code='BLOB_ALREADY_EXISTS';
    throw error;
  }
  return {pathname:String(pathname),etag:result?.etag||''};
}

export async function get(pathname){
  const value=await store().get(String(pathname),{type:'text',consistency:'strong'});
  if(value===null || value===undefined)return null;
  return {pathname:String(pathname),stream:new Response(String(value)).body};
}

export async function del(pathname){
  await store().delete(String(pathname));
}

export async function list({prefix=''}={}){
  const result=await store().list({prefix:String(prefix||'')});
  const blobs=(result?.blobs||[]).map(entry=>({
    pathname:entry.key,
    key:entry.key,
    etag:entry.etag
  }));
  return {blobs,hasMore:false,cursor:null};
}
