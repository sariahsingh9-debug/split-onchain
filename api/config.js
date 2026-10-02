import { storageHealth } from './_blob-store.js';
import { invitationEmailReady } from './_email-capabilities.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
  const network=process.env.SOLANA_NETWORK||'solana-devnet';
  const routerReady=Boolean(process.env.SPLIT_ROUTER_MASTER_SECRET&&process.env.SPLIT_ROUTER_PAYER_SECRET_KEY&&process.env.SPLIT_PROTOCOL_TREASURY&&(process.env.SPLIT_REVENUE_RESERVE_TREASURY||process.env.SPLIT_LIQUIDITY_TREASURY));
  const uploadReady=Boolean(process.env.IRYS_SOLANA_PRIVATE_KEY);
  const launchAuthReady=Boolean(process.env.SPLIT_INVITE_SECRET);
  const emailReady=invitationEmailReady();
  const storage=await storageHealth();const storageReady=storage.ready;
  const maintenance=process.env.SPLIT_STORAGE_MAINTENANCE==='true';
  // Never expose a custom RPC URL to the browser; it may contain an API key.
  return res.status(200).json({network,routerReady,uploadReady,launchAuthReady,emailReady,emailOptional:true,storageReady,storageDurable:storage.durable,maintenance,paymentCreationReady:storage.durable&&!maintenance,launchReady:routerReady&&uploadReady&&launchAuthReady&&storageReady&&!maintenance&&(network==='solana-devnet'||storage.durable),splitReady:storage.durable&&!maintenance});
}
