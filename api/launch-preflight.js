import { Connection, PublicKey } from '@solana/web3.js';
import { creatorSession } from './_creator-utils.js';
import { quoteInitialBuyUsd } from './_sol-price.js';

function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body||'{}');return req.body||{}}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed.'});
  try{
    const session=creatorSession(req);
    if(session.family!=='solana')throw new Error('A Solana launch wallet is required.');
    const body=bodyOf(req);
    if(body.wallet&&String(body.wallet)!==session.wallet)throw new Error('Launch wallet does not match the authenticated wallet.');

    const quote=await quoteInitialBuyUsd(body.initialBuyUsd);
    const network=process.env.SOLANA_NETWORK||'solana-devnet';
    if(!['solana-devnet','solana-mainnet'].includes(network))throw new Error('SOLANA_NETWORK must be solana-devnet or solana-mainnet.');
    const rpc=process.env.SOLANA_RPC_URL||(network==='solana-mainnet'?'https://api.mainnet-beta.solana.com':'https://api.devnet.solana.com');
    const connection=new Connection(rpc,'confirmed');
    const balanceLamports=await connection.getBalance(new PublicKey(session.wallet),'confirmed');

    if(balanceLamports<quote.lamports){
      return res.status(402).json({
        success:false,
        error:`Wallet needs at least ${quote.sol.toFixed(6)} SOL for the ${quote.amountUsd.toFixed(2)} USDC-equivalent first buy, plus additional SOL for network/launch costs.`,
        ...quote,
        balanceSol:Number((balanceLamports/1e9).toFixed(9))
      });
    }

    return res.status(200).json({
      success:true,
      network,
      ...quote,
      balanceSol:Number((balanceLamports/1e9).toFixed(9)),
      note:'Metaplex Genesis first buys settle in SOL. SPLIT converts the selected USDC-equivalent amount to SOL when preparing the launch.'
    });
  }catch(error){
    const message=String(error?.message||'Launch preflight failed.');
    const auth=/login|required|expired|authenticated|wallet does not match/i.test(message);
    return res.status(auth?401:400).json({success:false,error:message});
  }
}
