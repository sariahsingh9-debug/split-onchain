import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { decimalToUnits, SOLANA_MINTS, EVM, evmRpc } from './_payment-config.js';

export class PaymentVerificationError extends Error{
  constructor(message,{reject=false}={}){super(message);this.name='PaymentVerificationError';this.reject=reject}
}
const eq=(a,b)=>String(a||'').toLowerCase()===String(b||'').toLowerCase();
const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function evmRpcCall(url,method,params){
  let response;
  try{
    response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  }catch{throw new PaymentVerificationError('The blockchain RPC is temporarily unavailable.');}
  const body=await response.json().catch(()=>({}));
  if(!response.ok||body.error)throw new PaymentVerificationError(body?.error?.message||'The blockchain RPC is temporarily unavailable.');
  return body.result;
}
function requestedAfterMs(meta,payload){
  const payloadIat=Number(payload?.iat||0);
  const metaTime=Date.parse(meta?.createdAt||'');
  return Math.max(Number.isFinite(payloadIat)?payloadIat:0,Number.isFinite(metaTime)?metaTime:0);
}
function ensureNotPreexisting(blockTimeSeconds,requestedMs){
  if(!blockTimeSeconds)return false;
  // A short allowance handles normal RPC/server clock drift while still preventing
  // replay of an older transfer from before this SPLIT existed.
  if((Number(blockTimeSeconds)*1000)<requestedMs-120000){
    throw new PaymentVerificationError('This transaction happened before this SPLIT payment request was created.',{reject:true});
  }
  return true;
}

async function verifySolana(meta,participant,payload,signature){
  const rpc=process.env.PAYMENT_SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com';
  const connection=new Connection(rpc,'confirmed');
  let statuses;
  try{statuses=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})}catch{throw new PaymentVerificationError('Solana is temporarily unavailable.');}
  const status=statuses?.value?.[0];
  if(!status)return {pending:true,message:'Transaction is not visible on Solana yet.'};
  if(status.err)throw new PaymentVerificationError('The Solana transaction failed on-chain.',{reject:true});
  if(!['confirmed','finalized'].includes(status.confirmationStatus))return {pending:true,message:'Transaction is still confirming on Solana.'};

  let tx;
  try{tx=await connection.getParsedTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0})}catch{throw new PaymentVerificationError('Solana transaction details are temporarily unavailable.');}
  if(!tx)return {pending:true,message:'Transaction details are not available yet.'};
  if(tx.meta?.err)throw new PaymentVerificationError('The Solana transaction failed on-chain.',{reject:true});

  let blockTime=tx.blockTime;
  if(!blockTime&&Number.isFinite(tx.slot)){
    try{blockTime=await connection.getBlockTime(tx.slot)}catch{}
  }
  if(!ensureNotPreexisting(blockTime,requestedAfterMs(meta,payload)))return {pending:true,message:'Waiting for Solana block time before confirming this payment.'};

  const payer=String(participant.payer||'');
  if(!payer)throw new PaymentVerificationError('The submitted payment has no recorded payer wallet.',{reject:true});
  let payerKey;
  try{payerKey=new PublicKey(payer)}catch{throw new PaymentVerificationError('The recorded payer wallet is invalid.',{reject:true});}

  const accountKeys=tx.transaction?.message?.accountKeys||[];
  const payerSigned=accountKeys.some(k=>{
    const key=typeof k==='string'?k:(k?.pubkey?.toBase58?.()||String(k?.pubkey||''));
    return key===payerKey.toBase58()&&Boolean(k?.signer);
  });
  if(!payerSigned)throw new PaymentVerificationError('The submitted transaction was not signed by the wallet attached to this payment.',{reject:true});

  const instructions=[...(tx.transaction?.message?.instructions||[]),...((tx.meta?.innerInstructions||[]).flatMap(x=>x.instructions||[]))];
  if(meta.asset==='SOL'){
    const expected=decimalToUnits(participant.amount,9);
    const ok=instructions.some(ix=>{
      const parsed=ix?.parsed;
      if(ix?.program!=='system'||parsed?.type!=='transfer')return false;
      const info=parsed.info||{};
      return info.source===payerKey.toBase58()&&info.destination===meta.payout&&BigInt(info.lamports||0)===expected;
    });
    if(!ok)throw new PaymentVerificationError('The Solana transaction does not match this SPLIT recipient, payer and SOL amount.',{reject:true});
  }else{
    const info=SOLANA_MINTS[meta.asset];
    if(!info)throw new PaymentVerificationError('This Solana asset is not supported.',{reject:true});
    const mint=new PublicKey(info.mint);
    const sourceAta=getAssociatedTokenAddressSync(mint,payerKey,false).toBase58();
    const destinationAta=getAssociatedTokenAddressSync(mint,new PublicKey(meta.payout),false).toBase58();
    const expected=decimalToUnits(participant.amount,info.decimals);
    const ok=instructions.some(ix=>{
      const parsed=ix?.parsed;
      if(!parsed||!['spl-token','spl-token-2022'].includes(ix?.program)||parsed.type!=='transferChecked')return false;
      const i=parsed.info||{};
      const amount=i.tokenAmount?.amount??i.amount;
      return i.source===sourceAta&&i.destination===destinationAta&&i.authority===payerKey.toBase58()&&(!i.mint||i.mint===info.mint)&&BigInt(amount||0)===expected;
    });
    if(!ok)throw new PaymentVerificationError('The Solana token transfer does not match this SPLIT payer, recipient, token and amount.',{reject:true});
  }
  return {confirmed:true,blockTime};
}

async function verifyEvm(meta,participant,payload,hash){
  const cfg=EVM[meta.network];
  if(!cfg)throw new PaymentVerificationError('This EVM network is not supported.',{reject:true});
  const url=evmRpc(meta.network);
  if(!url)throw new PaymentVerificationError('EVM verification RPC is not configured.');

  const receipt=await evmRpcCall(url,'eth_getTransactionReceipt',[hash]);
  if(!receipt)return {pending:true,message:'Transaction is not mined yet.'};
  if(String(receipt.status).toLowerCase()!=='0x1')throw new PaymentVerificationError('The EVM transaction failed on-chain.',{reject:true});
  const tx=await evmRpcCall(url,'eth_getTransactionByHash',[hash]);
  if(!tx)return {pending:true,message:'Transaction details are not available yet.'};

  if(!eq(tx.from,participant.payer))throw new PaymentVerificationError('The submitted transaction was sent by a different wallet.',{reject:true});
  const block=await evmRpcCall(url,'eth_getBlockByNumber',[receipt.blockNumber,false]);
  if(!block)return {pending:true,message:'Waiting for block timestamp before confirming this payment.'};
  ensureNotPreexisting(Number(BigInt(block.timestamp||'0x0')),requestedAfterMs(meta,payload));

  if(cfg.native.includes(meta.asset)){
    if(!eq(tx.to,meta.payout)||BigInt(tx.value||'0x0')!==decimalToUnits(participant.amount,18)){
      throw new PaymentVerificationError('The EVM transaction does not match this SPLIT recipient and amount.',{reject:true});
    }
  }else{
    const token=cfg.tokens[meta.asset];
    if(!token)throw new PaymentVerificationError('This token is not supported on the selected network.',{reject:true});
    const expected=decimalToUnits(participant.amount,token.decimals);
    const payerTopic='0x'+String(participant.payer).toLowerCase().replace(/^0x/,'').padStart(64,'0');
    const recipientTopic='0x'+String(meta.payout).toLowerCase().replace(/^0x/,'').padStart(64,'0');
    const matchingLog=(receipt.logs||[]).find(log=>{
      if(!eq(log.address,token.address))return false;
      const topics=(log.topics||[]).map(x=>String(x).toLowerCase());
      if(topics[0]!==TRANSFER_TOPIC||topics.length<3)return false;
      if(topics[1]!==payerTopic||topics[2]!==recipientTopic)return false;
      try{return BigInt(log.data||'0x0')===expected}catch{return false}
    });
    if(!matchingLog)throw new PaymentVerificationError('The token Transfer event does not match this SPLIT payer, recipient and amount.',{reject:true});
  }
  return {confirmed:true,blockNumber:receipt.blockNumber};
}

export async function verifyPaymentTransaction({meta,participant,payload=null,txHash}){
  const hash=String(txHash||'').trim();
  if(meta.network==='solana'){
    if(!/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(hash))throw new PaymentVerificationError('Invalid Solana transaction signature.',{reject:true});
    return verifySolana(meta,participant,payload,hash);
  }
  if(!/^0x[a-fA-F0-9]{64}$/.test(hash))throw new PaymentVerificationError('Invalid EVM transaction hash.',{reject:true});
  return verifyEvm(meta,participant,payload,hash);
}
