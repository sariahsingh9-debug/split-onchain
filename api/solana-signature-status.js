import { Connection } from '@solana/web3.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const signature=String(body.signature||'').trim();
    if(!/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(signature))return res.status(400).json({success:false,error:'Invalid Solana signature.'});
    const configured=process.env.SOLANA_NETWORK||'solana-devnet';
    if(body.network&&body.network!==configured)return res.status(400).json({success:false,error:'Signature network does not match this SPLIT deployment.'});
    const rpc=process.env.SOLANA_RPC_URL||(configured==='solana-mainnet'?'https://api.mainnet-beta.solana.com':'https://api.devnet.solana.com');
    const connection=new Connection(rpc,'confirmed');
    const status=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true}))?.value?.[0]||null;
    if(status?.err)return res.status(200).json({success:true,failed:true,error:'Transaction failed on-chain.'});
    const confirmed=Boolean(status&&['confirmed','finalized'].includes(status.confirmationStatus));
    return res.status(200).json({success:true,confirmed,pending:!confirmed,confirmationStatus:status?.confirmationStatus||null});
  }catch(error){return res.status(503).json({success:false,error:error?.message||'Solana RPC is temporarily unavailable.'})}
}
