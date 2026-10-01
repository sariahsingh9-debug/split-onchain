import { list, get } from './_blob-store.js';
import { creatorSession, listCreatorRecords, writeCreatorSplitIndex, writeCreatorLaunchIndex } from './_creator-utils.js';
import { readSplitMeta } from './_split-invite-utils.js';
import { reconcileSplit } from './_split-reconcile.js';
import { decimalToUnits, unitsToDecimal } from './_payment-config.js';

async function readJson(pathname){
  const result=await get(pathname,{access:'private',useCache:false});
  if(!result?.stream)return null;
  return JSON.parse(await new Response(result.stream).text());
}
const walletEq=(a,b,family)=>family==='evm'
  ? String(a||'').toLowerCase()===String(b||'').toLowerCase()
  : String(a||'')===String(b||'');

async function discoverSplits(wallet,family){
  const found=[];let cursor;
  do{
    const page=await list({prefix:'split-requests/',limit:100,...(cursor?{cursor}:{})});
    for(const blob of page?.blobs||[]){
      if(!blob.pathname.endsWith('/meta.json'))continue;
      try{
        const meta=await readJson(blob.pathname);
        if(meta&&walletEq(meta.creatorWallet||meta.payout,wallet,family)){
          const item=await writeCreatorSplitIndex(meta,'');
          found.push(item);
        }
      }catch{}
    }
    cursor=page?.hasMore?page.cursor:undefined;
  }while(cursor&&found.length<100);
  return found;
}
async function discoverLaunches(wallet){
  const found=[];let cursor;
  do{
    const page=await list({prefix:'launch-directory/',limit:100,...(cursor?{cursor}:{})});
    for(const blob of page?.blobs||[]){
      try{
        const record=await readJson(blob.pathname);
        if(record?.creatorWallet===wallet){
          // Older launches can be recovered for viewing, but their routing token
          // is not reconstructable from public metadata.
          const route={creatorWallet:wallet,routingId:'legacy-'+record.mintAddress};
          const item=await writeCreatorLaunchIndex(route,record,'');
          found.push(item);
        }
      }catch{}
    }
    cursor=page?.hasMore?page.cursor:undefined;
  }while(cursor&&found.length<100);
  return found;
}
function addAsset(group,asset,units,decimals){
  const current=group[asset]?decimalToUnits(group[asset],decimals):0n;
  group[asset]=unitsToDecimal(current+BigInt(units),decimals);
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({success:false,error:'Method not allowed.'});
  try{
    const session=creatorSession(req);
    let splitRefs=await listCreatorRecords(session.wallet,session.family,'splits',250);
    let launches=await listCreatorRecords(session.wallet,session.family,'launches',250);
    if(!splitRefs.length)splitRefs=await discoverSplits(session.wallet,session.family);
    if(session.family==='solana'&&!launches.length)launches=await discoverLaunches(session.wallet);
    const revenue=session.family==='solana'?await listCreatorRecords(session.wallet,'solana','revenue',500):[];

    const splits=[];const collectedByAsset={};let pendingPeople=0,paidPeople=0;
    for(const ref of splitRefs.slice(0,100)){
      try{
        const meta=await readSplitMeta(ref.splitId);if(!meta)continue;
        const participants=await reconcileSplit(meta,4);
        let collected=0n,paid=0,pending=0,submitted=0,rejected=0;
        for(const p of participants){
          const units=BigInt(p.amountUnits||decimalToUnits(p.amount,meta.decimals));
          if(p.status==='confirmed'){collected+=units;paid++;paidPeople++}
          else if(p.status==='submitted'){submitted++;pendingPeople++}
          else if(p.status==='rejected'){rejected++;pendingPeople++}
          else{pending++;pendingPeople++}
        }
        addAsset(collectedByAsset,meta.asset,collected,meta.decimals);
        splits.push({
          splitId:meta.splitId,name:meta.name,network:meta.network,networkName:meta.networkName,asset:meta.asset,
          total:meta.total,collected:unitsToDecimal(collected,meta.decimals),participantCount:participants.length,
          paidCount:paid,pendingCount:pending+rejected,submittedCount:submitted,createdAt:meta.createdAt
        });
      }catch{}
    }
    splits.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));

    const revenueByRouting=new Map();
    let grossRevenueLamports=0n;
    for(const event of revenue){
      const creatorTransfer=(event.transfers||[]).find(x=>x?.name==='creator');
      const amount=BigInt(creatorTransfer?.lamports||0);grossRevenueLamports+=amount;
      revenueByRouting.set(event.routingId,(revenueByRouting.get(event.routingId)||0n)+amount);
    }
    launches=launches.map(item=>({
      ...item,
      creatorRevenueSol:unitsToDecimal(revenueByRouting.get(item.routingId)||0n,9),
      routingTokenAvailable:Boolean(item.routingToken)
    })).sort((a,b)=>new Date(b.launchedAt)-new Date(a.launchedAt));

    const activity=[];
    for(const s of splits){
      activity.push({at:s.createdAt,title:'SPLIT created',detail:`${s.name} · ${s.total} ${s.asset}`});
      if(s.paidCount)activity.push({at:s.createdAt,title:'Payments confirmed',detail:`${s.paidCount}/${s.participantCount} paid · ${s.name}`});
    }
    for(const t of launches)activity.push({at:t.launchedAt,title:'Token launched',detail:`${t.name||'Token'} $${t.symbol||''}`});
    for(const r of revenue){
      const creatorTransfer=(r.transfers||[]).find(x=>x?.name==='creator');
      activity.push({at:r.createdAt,title:'Creator fees received',detail:`${unitsToDecimal(BigInt(creatorTransfer?.lamports||0),9)} SOL · $${r.symbol||''}`});
    }
    activity.sort((a,b)=>new Date(b.at)-new Date(a.at));

    return res.status(200).json({
      success:true,wallet:session.wallet,family:session.family,
      summary:{
        collectedByAsset,pendingPeople,paidPeople,tokensLaunched:launches.length,
        creatorRevenueSol:unitsToDecimal(grossRevenueLamports,9)
      },
      splits:splits.slice(0,100),tokens:launches.slice(0,100),activity:activity.slice(0,60)
    });
  }catch(error){
    const msg=error?.message||'Dashboard could not be loaded.';
    return res.status(/login|required|expired/i.test(msg)?401:400).json({success:false,error:msg});
  }
}
