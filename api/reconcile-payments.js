import { list, get, del } from './_blob-store.js';
import { readSplitMeta, readParticipant } from './_split-invite-utils.js';
import { reconcileParticipant } from './_split-reconcile.js';

async function readJson(pathname){
  const result=await get(pathname,{access:'private',useCache:false});
  if(!result?.stream)return null;
  return JSON.parse(await new Response(result.stream).text());
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed.'});
  const secret=process.env.CRON_SECRET;
  if(!secret)return res.status(503).json({success:false,error:'CRON_SECRET is not configured.'});
  if(String(req.headers.authorization||'')!==`Bearer ${secret}`)return res.status(401).json({success:false,error:'Unauthorized.'});

  try{
    const page=await list({prefix:'payment-pending/',limit:100});
    const records=(await Promise.all((page?.blobs||[]).map(b=>readJson(b.pathname).catch(()=>null)))).filter(Boolean);
    let confirmed=0,rejected=0,pending=0,removed=0;

    for(const item of records){
      try{
        const meta=await readSplitMeta(item.splitId);
        const participant=await readParticipant(item.splitId,item.participantId);
        if(!meta||!participant||participant.status!=='submitted'||participant.txHash!==item.txHash){
          try{await del(`payment-pending/${item.splitId}/${item.participantId}.json`);removed++}catch{}
          continue;
        }
        const next=await reconcileParticipant(meta,participant);
        if(next.status==='confirmed')confirmed++;
        else if(next.status==='rejected')rejected++;
        else pending++;
      }catch{pending++}
    }
    return res.status(200).json({success:true,checked:records.length,confirmed,rejected,pending,removed,hasMore:Boolean(page?.hasMore)});
  }catch(error){
    console.error(error);
    return res.status(500).json({success:false,error:error?.message||'Payment reconciliation failed.'});
  }
}
