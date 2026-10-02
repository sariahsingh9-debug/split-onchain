import crypto from 'node:crypto';
import { Keypair, PublicKey } from '@solana/web3.js';
import { buildCreateLaunchPayload } from '@metaplex-foundation/genesis';
import { list, requireDurableStorage } from './_blob-store.js';
import { deriveFeeWallet, signRoutingPayload, validSolanaAddress } from './_routing-utils.js';
import { creatorSession } from './_creator-utils.js';
import { FIXED_ROUTING } from './_launch-policy.js';
import { quoteInitialBuyUsd } from './_sol-price.js';
import {reportError} from './_operations.js';
import {savePreparedLaunch} from './_launch-recovery.js';

function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body||'{}');return req.body||{}}
function clean(v,max){return String(v??'').trim().slice(0,max)}
function irysUrl(value,required=false){
  const s=String(value||'').trim();if(!s&&!required)return '';
  if(!/^https:\/\/gateway\.irys\.xyz\/[A-Za-z0-9_-]{20,}$/i.test(s))throw new Error(required?'Token image must be a permanent Irys URL.':'Banner must be a permanent Irys URL.');
  return s;
}
function httpsUrl(value,label){
  const s=String(value||'').trim();if(!s)return '';
  try{const u=new URL(s);if(u.protocol!=='https:')throw new Error();return u.toString()}catch{throw new Error(`${label} must be a valid https:// URL.`)}
}
function xUrl(value){
  const s=String(value||'').trim();if(!s)return '';
  if(/^@[A-Za-z0-9_]{1,15}$/.test(s))return `https://x.com/${s.slice(1)}`;
  const url=httpsUrl(s,'X / Twitter');const host=new URL(url).hostname.toLowerCase();
  if(!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(host))throw new Error('X / Twitter must be an x.com or twitter.com URL, or an @handle.');
  return url;
}
async function fetchWithRetry(url,options,{attempts=3}={}){
  let lastError;
  for(let i=0;i<attempts;i++){
    try{const r=await fetch(url,options);if(r.status!==429&&r.status<500)return r;lastError=new Error('Launch service temporarily unavailable ('+r.status+').')}catch(e){lastError=e}
    if(i<attempts-1)await new Promise(r=>setTimeout(r,500*(2**i)));
  }
  throw lastError||new Error('Launch service unavailable.');
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed'});
  try{
    const session=creatorSession(req);
    if(session.family!=='solana')return res.status(401).json({success:false,error:'A Solana launch wallet is required.'});
    const {config,imageUrl,bannerUrl}=bodyOf(req);const wallet=String(config?.wallet||'');
    if(session.wallet!==wallet)return res.status(401).json({success:false,error:'Launch wallet does not match the authenticated wallet.'});
    if(!validSolanaAddress(wallet))return res.status(400).json({success:false,error:'Invalid creator wallet.'});
    if(process.env.SOLANA_NETWORK==='solana-mainnet')await requireDurableStorage();
    const name=clean(config?.name,32);const symbol=clean(config?.symbol,10).toUpperCase();const description=clean(config?.description,250);
    if(name.length<1)return res.status(400).json({success:false,error:'Token name is required.'});
    if(!/^[A-Z0-9_]{1,10}$/.test(symbol))return res.status(400).json({success:false,error:'Ticker must be 1–10 letters, numbers or underscores.'});
    if(Number(config?.supply)!==1000000000)return res.status(400).json({success:false,error:'SPLIT Genesis launches use the fixed 1,000,000,000 token supply.'});
    const image=irysUrl(imageUrl,true);const banner=irysUrl(bannerUrl,false);
    const website=httpsUrl(config?.website,'Website');const twitter=xUrl(config?.x);

    const masterSecret=process.env.SPLIT_ROUTER_MASTER_SECRET;const protocolRecipient=process.env.SPLIT_PROTOCOL_TREASURY;const liquidityRecipient=(process.env.SPLIT_REVENUE_RESERVE_TREASURY||process.env.SPLIT_LIQUIDITY_TREASURY);
    if(!masterSecret||masterSecret.length<32)return res.status(503).json({success:false,error:'SPLIT routing is not configured.'});
    if(!validSolanaAddress(protocolRecipient)||!validSolanaAddress(liquidityRecipient))return res.status(503).json({success:false,error:'SPLIT routing treasury addresses are not configured.'});
    try{await list({prefix:'launch-health/',limit:1})}catch{return res.status(503).json({success:false,error:'Launch storage is temporarily unavailable. Please try again shortly.'})}

    const routing=config.routing||{};
    const creatorBps=FIXED_ROUTING.creatorBps;
    const treasuryBps=FIXED_ROUTING.treasuryBps;
    const liquidityBps=FIXED_ROUTING.reserveBps;
    const protocolBps=FIXED_ROUTING.protocolBps;
    const creatorRecipient=wallet;
    const treasuryRecipient=String(routing.treasuryRecipient||'').trim();
    if(!validSolanaAddress(treasuryRecipient))return res.status(400).json({success:false,error:'Add a valid project treasury wallet.'});

    const firstBuy=await quoteInitialBuyUsd(config.initialBuyUsd);

    const routingId=crypto.randomUUID();const feeWallet=deriveFeeWallet(routingId,masterSecret);const network=process.env.SOLANA_NETWORK||'solana-devnet';
    if(!['solana-devnet','solana-mainnet'].includes(network))throw new Error('SOLANA_NETWORK must be solana-devnet or solana-mainnet.');
    const input={wallet,token:{name,symbol,image,description,externalLinks:{...(website?{website}:{}),...(twitter?{twitter}: {})}},network,quoteMint:'SOL',launchType:'bondingCurve',launch:{creatorFeeWallet:feeWallet.publicKey.toBase58(),firstBuyAmount:firstBuy.sol}};
    const payload=buildCreateLaunchPayload(input);
    const metaplex=await fetchWithRetry('https://api.metaplex.com/v1/launches/create',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    const out=await metaplex.json().catch(()=>({}));
    if(!metaplex.ok||!out?.success){
      void reportError({event:'launch_provider_failed',route:'/api/create-launch',status:metaplex.ok?502:metaplex.status,requestId:req.requestId});
      return res.status(metaplex.ok?502:metaplex.status).json({success:false,error:out?.error?.message||out?.error||'Metaplex could not build the launch.'});
    }

    const routingPayload={
      v:2,routingId,network,feeWallet:feeWallet.publicKey.toBase58(),creatorWallet:wallet,
      creatorRecipient,treasuryRecipient,
      protocolRecipient,liquidityRecipient,creatorBps,treasuryBps,liquidityBps,protocolBps,
      genesisAccount:out.genesisAccount||null,mintAddress:out.mintAddress||null,
      initialBuyUsd:firstBuy.amountUsd,firstBuySol:firstBuy.sol,solUsdPrice:firstBuy.solUsdPrice,
      token:{name,symbol,description,website:website||null,twitter:twitter||null,imageUrl:image,bannerUrl:banner||null},
      createdAt:new Date().toISOString()
    };
    const routingToken=signRoutingPayload(routingPayload,masterSecret);
    await savePreparedLaunch({genesisAccount:out.genesisAccount,creatorWallet:wallet,launch:payload.launch,network,routingId,routingToken,mintAddress:out.mintAddress});
    return res.status(200).json({success:true,network,transactions:out.transactions,routerTransactions:[],blockhash:out.blockhash,mintAddress:out.mintAddress,genesisAccount:out.genesisAccount,launch:payload.launch,feeWallet:feeWallet.publicKey.toBase58(),routingId,routingToken,bannerUrl:banner||null,initialBuy:{usd:firstBuy.amountUsd,sol:firstBuy.sol,solUsdPrice:firstBuy.solUsdPrice}});
  }catch(error){
    console.error(error);
    const message=String(error?.message||'Launch preparation failed.');
    if(/creator login|SPLIT link|expired/i.test(message))return res.status(401).json({success:false,error:'Creator login is required.'});
    const validation=/must be|invalid|ticker|token image|banner|website|twitter|supply|percentage|recipient|network/i.test(message);
    const unavailable=error.code==='STORAGE_NOT_DURABLE'||/temporarily|unavailable|fetch|timeout/i.test(message);
    return res.status(validation?400:(unavailable?503:500)).json({success:false,error:message});
  }
}
