import {reportError} from './_operations.js';
import { put } from './_blob-store.js';
import { verifyRoutingToken, validSolanaAddress } from './_routing-utils.js';
import { writeCreatorLaunchIndex, creatorSession } from './_creator-utils.js';

function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body||'{}');return req.body||{}}
function clean(v,max=250){return String(v??'').trim().slice(0,max)}
function safeHttps(value){
  const s=String(value||'').trim();
  if(!s)return '';
  try{const u=new URL(s);return u.protocol==='https:'?u.toString():''}catch{return ''}
}
async function persistDirectoryRecord(record,route,routingToken,attempts=1){
  let lastError=null;
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      await put(
        `launch-directory/${record.mintAddress}.json`,
        JSON.stringify(record),
        {access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'}
      );
      await writeCreatorLaunchIndex(route,record,routingToken);
      return true;
    }catch(error){
      lastError=error;
      if(attempt<attempts-1)await new Promise(r=>setTimeout(r,1000*Math.min(8,2**attempt)));
    }
  }
  if(lastError)throw lastError;
  return false;
}
async function fetchWithRetry(url,options={},attempts=3){
  let last;
  for(let i=0;i<attempts;i++){
    try{
      const r=await fetch(url,options);
      if(r.status!==429&&r.status<500)return r;
      last=new Error('Metaplex temporarily unavailable ('+r.status+').');
    }catch(e){last=e}
    if(i<attempts-1)await new Promise(r=>setTimeout(r,600*(2**i)));
  }
  throw last||new Error('Metaplex unavailable.');
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed'});
  try{
    const session=creatorSession(req);
    if(session.family!=='solana')return res.status(401).json({success:false,error:'A Solana launch wallet is required.'});
    const body=bodyOf(req);
    const {genesisAccount,creatorWallet,launch,network='solana-devnet',routingId,routingToken,mintAddress}=body;

    if(session.wallet!==creatorWallet)return res.status(401).json({success:false,error:'Launch wallet does not match the authenticated wallet.'});

    if(!validSolanaAddress(genesisAccount)||!launch||!validSolanaAddress(creatorWallet)){
      return res.status(400).json({success:false,error:'Missing or invalid launch registration data.'});
    }

    const masterSecret=process.env.SPLIT_ROUTER_MASTER_SECRET;
    if(!masterSecret||masterSecret.length<32)throw new Error('SPLIT routing is not configured.');

    const route=verifyRoutingToken(routingToken,masterSecret);
    if(route.routingId!==routingId||route.network!==network||route.creatorWallet!==creatorWallet){
      throw new Error('Launch routing data does not match this registration.');
    }
    if(route.genesisAccount&&route.genesisAccount!==genesisAccount){
      throw new Error('Genesis account does not match the prepared launch.');
    }
    if(route.mintAddress&&mintAddress&&route.mintAddress!==mintAddress){
      throw new Error('Mint address does not match the prepared launch.');
    }

    const configured=process.env.SOLANA_NETWORK||'solana-devnet';
    if(network!==configured)throw new Error('Launch network does not match this SPLIT deployment.');

    const register=await fetchWithRetry(
      'https://api.metaplex.com/v1/launches/register',
      {
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({network,creatorWallet,genesisAccount,launch})
      }
    );
    const out=await register.json().catch(()=>({}));
    if(!register.ok||!out?.success){
      void reportError({event:'launch_registration_provider_failed',route:'/api/register-launch',status:register.ok?502:register.status,requestId:req.requestId});
      return res.status(register.ok?502:register.status).json({
        success:false,
        error:out?.error?.message||out?.error||'Metaplex launch registration failed.'
      });
    }

    const finalMint=clean(out?.token?.mintAddress||mintAddress||route.mintAddress,80);
    const launchUrl=safeHttps(out?.launch?.link);
    const token=route.token||{};
    let directoryPersisted=false;
    let directoryWarning='';

    if(finalMint&&token.name&&token.symbol&&safeHttps(token.imageUrl)){
      const record={
        v:3,
        mintAddress:finalMint,
        name:clean(token.name,40),
        symbol:clean(token.symbol,12).toUpperCase(),
        description:clean(token.description,280),
        imageUrl:safeHttps(token.imageUrl),
        bannerUrl:safeHttps(token.bannerUrl),
        website:safeHttps(token.website),
        x:safeHttps(token.twitter),
        creatorWallet:route.creatorWallet,
        creatorPercent:Number(route.creatorBps)/100,
        treasuryPercent:Number(route.treasuryBps)/100,
        liquidityPercent:Number(route.liquidityBps)/100,
        protocolPercent:Number(route.protocolBps)/100,
        initialBuyUsd:Number(route.initialBuyUsd||0),firstBuySol:Number(route.firstBuySol||0),
        network,
        launchUrl,
        genesisAccount:clean(genesisAccount,90),
        launchedAt:new Date().toISOString()
      };
      let lastStorageError=null;
      try{
        directoryPersisted=await persistDirectoryRecord(record,route,routingToken,4);
      }catch(error){
        lastStorageError=error;
      }
      if(!directoryPersisted){
        console.error('Launch registered but immediate durable indexing failed:',lastStorageError?.message||lastStorageError);
        directoryWarning='Token launched and registered. SPLIT is retrying the Tokens directory update in the background.';
        try{
          req.waitUntil?.(
            persistDirectoryRecord(record,route,routingToken,8)
              .catch(error=>console.error('Background token-directory retry failed:',error?.message||error))
          );
        }catch(error){
          console.error('Could not start background token-directory retry:',error?.message||error);
        }
      }
    }else{
      directoryWarning='Token launched and registered, but signed directory metadata was incomplete.';
    }

    return res.status(200).json({
      ...out,
      success:true,
      token:{...(out?.token||{}),...(finalMint?{mintAddress:finalMint}:{})},
      launch:{...(out?.launch||{}),...(launchUrl?{link:launchUrl}:{})},
      routingId:route.routingId,
      routingToken,
      directoryPersisted,
      directoryWarning
    });
  }catch(error){
    console.error(error);
    const message=error?.message||'Registration failed.';
    const status=/invalid|does not match|different|missing/i.test(message)?400:500;
    return res.status(status).json({success:false,error:message});
  }
}
