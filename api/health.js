import { Connection } from '@solana/web3.js';
import { storageHealth } from './_blob-store.js';
import { invitationEmailReady } from './_email-capabilities.js';
import {reconciliationHealth,alertConfigured} from './_operations.js';

function senderDomain(value){
  const raw=String(value||'').trim();
  const match=raw.match(/<([^>]+)>/);const email=(match?.[1]||raw).trim();
  return email.includes('@')?email.split('@').pop().toLowerCase():'';
}
async function emailHealth(){
  const configured=Boolean(process.env.RESEND_API_KEY&&process.env.SPLIT_EMAIL_FROM&&process.env.SPLIT_INVITE_SECRET);
  if(!configured)return {configured:false,domainVerified:false,webhook:Boolean(process.env.RESEND_WEBHOOK_SECRET)};
  const wanted=senderDomain(process.env.SPLIT_EMAIL_FROM);
  try{
    const response=await fetch('https://api.resend.com/domains?limit=100',{
      signal:AbortSignal.timeout(5000),
      headers:{authorization:`Bearer ${process.env.RESEND_API_KEY}`}
    });
    const body=await response.json().catch(()=>({}));
    const domains=Array.isArray(body?.data)?body.data:Array.isArray(body)?body:[];
    const domain=domains.find(x=>String(x?.name||'').toLowerCase()===wanted);
    return {configured:true,domainVerified:domain?.status==='verified'||invitationEmailReady(),webhook:Boolean(process.env.RESEND_WEBHOOK_SECRET)};
  }catch{return {configured:true,domainVerified:false,webhook:Boolean(process.env.RESEND_WEBHOOK_SECRET)}}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed.'});
  const network=process.env.SOLANA_NETWORK||'solana-devnet';
  const launchRpc=process.env.SOLANA_RPC_URL||(network==='solana-mainnet'?'https://api.mainnet-beta.solana.com':'https://api.devnet.solana.com');
  const paymentRpc=process.env.PAYMENT_SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com';
  const emailPromise=emailHealth();
  const reconciliation=await reconciliationHealth().catch(()=>({configured:Boolean(process.env.CRON_SECRET),healthy:false,lastSuccessAt:null}));
  const email=await emailPromise;
  let storage;
  const services={
    launchSolana:false,paymentSolana:false,storage:false,
    email:invitationEmailReady(),
    emailConfigured:email.configured,emailDomainVerified:email.domainVerified,emailWebhook:email.webhook,
    media:Boolean(process.env.IRYS_SOLANA_PRIVATE_KEY),
    launchAuth:Boolean(process.env.SPLIT_INVITE_SECRET),
    router:Boolean(process.env.SPLIT_ROUTER_MASTER_SECRET&&process.env.SPLIT_ROUTER_PAYER_SECRET_KEY&&process.env.SPLIT_PROTOCOL_TREASURY&&(process.env.SPLIT_REVENUE_RESERVE_TREASURY||process.env.SPLIT_LIQUIDITY_TREASURY)),
    backgroundReconcile:reconciliation.healthy,
    monitoring:alertConfigured()
  };
  const connection=url=>new Connection(url,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(5000)})});
  await Promise.all([
    connection(launchRpc).getLatestBlockhash('confirmed').then(()=>{services.launchSolana=true}).catch(()=>{}),
    connection(paymentRpc).getLatestBlockhash('confirmed').then(()=>{services.paymentSolana=true}).catch(()=>{}),
    storageHealth().then(state=>{storage=state;services.storage=state.ready;services.storageDurable=state.durable})
  ]);
  const launchReady=services.launchSolana&&services.storage&&services.media&&services.router&&services.launchAuth;
  const splitReady=services.paymentSolana&&services.storage;
  const coreReady=launchReady&&splitReady;
  return res.status(coreReady?200:503).json({
    ok:coreReady,coreReady,network,launchReady,splitReady,emailReady:services.email,emailOptional:true,storageReady:services.storage,storageDurable:Boolean(storage?.durable),maintenance:process.env.SPLIT_STORAGE_MAINTENANCE==='true',paymentCreationReady:Boolean(storage?.durable)&&process.env.SPLIT_STORAGE_MAINTENANCE!=='true',productionReady:process.env.SPLIT_STORAGE_MAINTENANCE!=='true'&&coreReady&&Boolean(storage?.durable)&&network==='solana-mainnet'&&reconciliation.healthy&&services.monitoring,services,reconciliation
  });
}
