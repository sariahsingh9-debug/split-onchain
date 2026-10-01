import { Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction } from '@solana/web3.js';
import { verifyRoutingToken, deriveFeeWallet } from './_routing-utils.js';
import { writeCreatorRevenueEvent } from './_creator-utils.js';

function readSecretKey(raw,name){
  if(!raw)throw new Error(name+' is not configured.');let value;
  try{value=JSON.parse(raw)}catch{throw new Error(name+' must be a JSON array secret key.')}
  if(!Array.isArray(value))throw new Error(name+' must be a JSON array secret key.');
  return Keypair.fromSecretKey(Uint8Array.from(value));
}
async function waitForSignature(connection,signature,timeoutMs=18000){
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    const status=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true}))?.value?.[0];
    if(status?.err)throw new Error('A creator-revenue transaction failed on-chain.');
    if(status&&['confirmed','finalized'].includes(status.confirmationStatus))return true;
    await new Promise(r=>setTimeout(r,1200));
  }
  throw new Error('Creator-revenue transaction confirmation timed out.');
}
function signerMap(signers){return new Map(signers.map(s=>[s.publicKey.toBase58(),s]))}
async function signAndSend(connection,base64Tx,signers){
  const bytes=Buffer.from(base64Tx,'base64');let raw;const available=signerMap(signers);
  try{
    const tx=VersionedTransaction.deserialize(bytes);
    const required=tx.message.staticAccountKeys.slice(0,tx.message.header.numRequiredSignatures).map(k=>k.toBase58());
    const actual=required.map(k=>available.get(k)).filter(Boolean);
    if(!actual.length)throw new Error('No required signer is available for a creator-revenue transaction.');
    tx.sign(actual);raw=tx.serialize();
  }catch(versionedError){
    try{
      const tx=Transaction.from(bytes);
      const required=(tx.signatures||[]).map(x=>x.publicKey.toBase58());
      const actual=required.map(k=>available.get(k)).filter(Boolean);
      if(!actual.length)throw new Error('No required signer is available for a creator-revenue transaction.');
      tx.partialSign(...actual);raw=tx.serialize();
    }catch(legacyError){throw new Error(legacyError?.message||versionedError?.message||'Creator-revenue transaction could not be signed.')}
  }
  const sig=await connection.sendRawTransaction(raw,{skipPreflight:false,maxRetries:3});
  return sig;
}

export async function claimAndDistribute(routingToken){
  const master=process.env.SPLIT_ROUTER_MASTER_SECRET;
  if(!master||master.length<32)throw new Error('SPLIT routing is not configured.');
  const route=verifyRoutingToken(routingToken,master);
  const configured=process.env.SOLANA_NETWORK||'solana-devnet';
  if(route.network!==configured)throw new Error('This launch belongs to a different Solana network.');

  const feeWallet=deriveFeeWallet(route.routingId,master);
  const payer=readSecretKey(process.env.SPLIT_ROUTER_PAYER_SECRET_KEY,'SPLIT_ROUTER_PAYER_SECRET_KEY');
  const rpc=process.env.SOLANA_RPC_URL||(route.network==='solana-mainnet'?'https://api.mainnet-beta.solana.com':'https://api.devnet.solana.com');
  const connection=new Connection(rpc,'confirmed');

  const claimResp=await fetch('https://api.metaplex.com/v1/creator-rewards/claim',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({wallet:feeWallet.publicKey.toBase58(),payer:payer.publicKey.toBase58(),network:route.network})
  });
  const claimBody=await claimResp.json().catch(()=>({}));
  const message=String(claimBody?.error?.message||claimBody?.error||'');
  const noRewards=claimResp.status===400&&message.toLowerCase().includes('no rewards available');
  if(!claimResp.ok&&!noRewards)throw new Error(message||'Creator rewards could not be claimed.');

  const claimSignatures=[];
  if(claimResp.ok){
    for(const tx of (claimBody?.data?.transactions||claimBody?.transactions||[])){
      claimSignatures.push(await signAndSend(connection,tx,[payer,feeWallet]));
    }
  }

  if(claimSignatures.length){
    const started=Date.now();
    while(Date.now()-started<18000){
      const statuses=(await connection.getSignatureStatuses(claimSignatures,{searchTransactionHistory:true}))?.value||[];
      const failed=statuses.find(x=>x?.err);
      if(failed)throw new Error('A creator-revenue claim transaction failed on-chain.');
      if(statuses.length===claimSignatures.length&&statuses.every(x=>x&&['confirmed','finalized'].includes(x.confirmationStatus)))break;
      await new Promise(r=>setTimeout(r,1200));
    }
    const finalStatuses=(await connection.getSignatureStatuses(claimSignatures,{searchTransactionHistory:true}))?.value||[];
    if(!finalStatuses.every(x=>x&&['confirmed','finalized'].includes(x.confirmationStatus))){
      return {success:true,claimed:false,pending:true,message:'Creator-fee claim was submitted. Wait a few seconds and click Check again to finish distribution.',claimSignatures};
    }
  }

  const balance=BigInt(await connection.getBalance(feeWallet.publicKey,'confirmed'));
  if(balance<=0n)return {success:true,claimed:false,message:'No creator revenue is available to distribute yet.',claimSignatures};

  const recipients=[
    {name:'creator',address:route.creatorRecipient,bps:Number(route.creatorBps)},
    {name:'treasury',address:route.treasuryRecipient,bps:Number(route.treasuryBps)},
    {name:'reserve',address:route.liquidityRecipient,bps:Number(route.liquidityBps)},
    {name:'protocol',address:route.protocolRecipient,bps:Number(route.protocolBps)}
  ].filter(x=>x.bps>0);

  const tx=new Transaction();tx.feePayer=payer.publicKey;let allocated=0n;const transfers=[];
  recipients.forEach((r,index)=>{
    const lamports=index===recipients.length-1?balance-allocated:(balance*BigInt(r.bps))/10000n;
    allocated+=lamports;
    if(lamports>0n){
      tx.add(SystemProgram.transfer({fromPubkey:feeWallet.publicKey,toPubkey:new PublicKey(r.address),lamports}));
      transfers.push({...r,lamports:lamports.toString()});
    }
  });
  if(!tx.instructions.length)return {success:true,claimed:false,message:'Nothing to distribute.',claimSignatures};

  const {blockhash}=await connection.getLatestBlockhash('confirmed');tx.recentBlockhash=blockhash;tx.partialSign(payer,feeWallet);
  const distributionSignature=await connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
  try{await waitForSignature(connection,distributionSignature,18000)}catch(error){
    return {success:true,claimed:false,pending:true,message:'Revenue distribution was submitted and is still confirming. Check again shortly.',claimSignatures,distributionSignature};
  }

  try{
    await writeCreatorRevenueEvent(route,{grossLamports:balance.toString(),distributionSignature,transfers});
  }catch(error){
    console.warn('Revenue distributed but creator history could not be indexed:',error?.message||error);
  }

  return {
    success:true,claimed:true,feeWallet:feeWallet.publicKey.toBase58(),
    claimedLamports:balance.toString(),claimSignatures,distributionSignature,transfers
  };
}
