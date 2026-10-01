import {list,get,del,acquireLease} from './_blob-store.js';
import {readSplitMeta,readParticipant} from './_split-invite-utils.js';
import {reconcileParticipant} from './_split-reconcile.js';
import {authorizedCron,readOperation,writeOperation,reportError} from './_operations.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method))return res.status(405).json({success:false,error:'Method not allowed.'});
  if(process.env.SPLIT_STORAGE_MAINTENANCE==='true')return res.status(503).json({success:false,error:'Storage maintenance is in progress.'});
  if(!authorizedCron(req))return res.status(401).json({success:false,error:'Unauthorized.'});
  let release;
  try{
    release=await acquireLease('operations/reconcile-lock',180);
    if(!release)return res.status(409).json({success:false,error:'Reconciliation is already running.'});
    const state=await readOperation('reconciliation');
    const start=Date.now();const stats={checked:0,confirmed:0,rejected:0,pending:0,removed:0,errors:0};
    let cursor=state?.cursor||'0',pages=0,remainingKeys=state?.remainingKeys||[];
    do{
      const page=remainingKeys.length?{blobs:remainingKeys.map(pathname=>({pathname})),cursor:cursor==='0'?null:cursor}:await list({prefix:'payment-pending/',limit:100,cursor});
      const keys=page.blobs.map(b=>b.pathname);let index=0;
      async function worker(){
        while(index<keys.length&&Date.now()-start<60000){
          const key=keys[index++];
          try{
            const record=await get(key);if(!record)continue;
            const item=JSON.parse(await new Response(record.stream).text());stats.checked++;
            const meta=await readSplitMeta(item.splitId),participant=await readParticipant(item.splitId,item.participantId);
            if(!meta||!participant||participant.status!=='submitted'||participant.txHash!==item.txHash){await del(key);stats.removed++;continue}
            const next=await reconcileParticipant(meta,participant);
            if(next.status==='confirmed')stats.confirmed++;
            else if(next.status==='rejected')stats.rejected++;
            else {
              stats.pending++;if(next.verificationUnavailable)stats.errors++;
              if(Date.now()-Date.parse(item.createdAt||participant.submittedAt)>1800000)void reportError({event:'payment_pending_over_30_minutes',route:'/api/reconcile-payments',status:503,requestId:req.requestId});
            }
          }catch{stats.errors++;stats.pending++}
        }
      }
      await Promise.all(Array.from({length:Math.min(4,keys.length)},worker));
      remainingKeys=keys.slice(index);cursor=page.cursor||'0';pages++;
      // Save continuation after every completed page, so restarts resume fairly.
      await writeOperation('reconciliation',{...state,...stats,cursor,remainingKeys,lastRunAt:new Date().toISOString(),lastSuccessAt:stats.errors?state?.lastSuccessAt:new Date().toISOString()});
    }while((cursor!=='0'||remainingKeys.length)&&pages<20&&Date.now()-start<60000);
    if(stats.errors)await reportError({event:'reconciliation_records_failed',route:'/api/reconcile-payments',status:503,requestId:req.requestId});
    const result={success:!stats.errors,...stats,hasMore:cursor!=='0'||remainingKeys.length>0,durationMs:Date.now()-start};
    console.log(JSON.stringify({level:stats.errors?'error':'info',event:'reconciliation_completed',...result}));
    return res.status(stats.errors?503:200).json(result);
  }catch{
    await reportError({event:'reconciliation_failed',route:'/api/reconcile-payments',status:503,requestId:req.requestId});
    return res.status(503).json({success:false,error:'Payment reconciliation failed.'});
  }finally{await release?.().catch(()=>{})}
}
