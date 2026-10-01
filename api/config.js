import { list } from './_blob-store.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
  const network=process.env.SOLANA_NETWORK||'solana-devnet';
  const routerReady=Boolean(process.env.SPLIT_ROUTER_MASTER_SECRET&&process.env.SPLIT_ROUTER_PAYER_SECRET_KEY&&process.env.SPLIT_PROTOCOL_TREASURY&&(process.env.SPLIT_REVENUE_RESERVE_TREASURY||process.env.SPLIT_LIQUIDITY_TREASURY));
  const uploadReady=Boolean(process.env.IRYS_SOLANA_PRIVATE_KEY);
  const launchAuthReady=Boolean(process.env.SPLIT_INVITE_SECRET);
  const emailReady=Boolean(process.env.RESEND_API_KEY&&process.env.SPLIT_EMAIL_FROM&&process.env.SPLIT_INVITE_SECRET);
  let storageReady=false;try{await list({prefix:'split-health/',limit:1});storageReady=true}catch{}
  // Never expose a custom RPC URL to the browser; it may contain an API key.
  return res.status(200).json({network,routerReady,uploadReady,launchAuthReady,emailReady,emailOptional:true,storageReady,launchReady:routerReady&&uploadReady&&launchAuthReady&&storageReady,splitReady:storageReady});
}
