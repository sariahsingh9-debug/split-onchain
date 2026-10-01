import { list, get } from './_blob-store.js';

async function readJson(pathname){
  const result=await get(pathname,{access:'private',useCache:false});
  if(!result?.stream)return null;
  const text=await new Response(result.stream).text();
  return JSON.parse(text);
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({success:false,error:'Method not allowed.'});

  try{
    let cursor;
    const records=[];

    do{
      const page=await list({
        prefix:'launch-directory/',
        limit:1000,
        ...(cursor?{cursor}:{})
      });
      const blobs=Array.isArray(page?.blobs)?page.blobs:[];
      const chunk=await Promise.all(blobs.map(async blob=>{
        try{return await readJson(blob.pathname)}catch{return null}
      }));
      records.push(...chunk.filter(Boolean));
      cursor=page?.hasMore?page.cursor:undefined;
    }while(cursor && records.length<5000);

    records.sort((a,b)=>new Date(b.launchedAt)-new Date(a.launchedAt));

    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({
      success:true,
      launches:records.slice(0,5000)
    });
  }catch(error){
    // An unconnected Blob store should show an empty directory instead of
    // breaking the standalone public page.
    console.warn('SPLIT public launch directory unavailable:',error?.message||error);
    return res.status(200).json({
      success:true,
      launches:[],
      storageConfigured:false
    });
  }
}
