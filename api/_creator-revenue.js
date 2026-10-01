import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { verifyRoutingToken, deriveFeeWallet } from './_routing-utils.js';
import { writeCreatorRevenueEvent } from './_creator-utils.js';
import { acquireLease, del, requireDurableStorage } from './_blob-store.js';
import { prepareRevenueTransaction, revenueJournalPath, persistRevenueJournal, readRevenueJournal, resumeRevenueTransactions } from './_revenue-transactions.js';
function readSecretKey(raw){
  let value;try{value=JSON.parse(raw)}catch{throw new Error('The creator-revenue signer is not configured.')}
  if(!Array.isArray(value))throw new Error('The creator-revenue signer is not configured.');
  return Keypair.fromSecretKey(Uint8Array.from(value));
}
export async function claimAndDistribute(routingToken){
  const master=process.env.SPLIT_ROUTER_MASTER_SECRET;
  if(!master||master.length<32)throw new Error('SPLIT routing is not configured.');
  const route=verifyRoutingToken(routingToken,master),configured=process.env.SOLANA_NETWORK||'solana-devnet';
  if(route.network!==configured)throw new Error('This launch belongs to a different Solana network.');
  if(configured==='solana-mainnet')await requireDurableStorage();
  const release=await acquireLease(`operations/revenue/${route.routingId}`,180);
  if(!release)return {success:true,claimed:false,pending:true,message:'This creator revenue is already being checked. Please check again shortly.'};
  try{
    const feeWallet=deriveFeeWallet(route.routingId,master),payer=readSecretKey(process.env.SPLIT_ROUTER_PAYER_SECRET_KEY);
    const rpc=process.env.SOLANA_RPC_URL||(route.network==='solana-mainnet'?'https://api.mainnet-beta.solana.com':'https://api.devnet.solana.com');
    const connection=new Connection(rpc,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(8000)})});
    let state=await readRevenueJournal(route.routingId),claimSignatures=[];
    if(!state){
      const response=await fetch('https://api.metaplex.com/v1/creator-rewards/claim',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json'},body:JSON.stringify({wallet:feeWallet.publicKey.toBase58(),payer:payer.publicKey.toBase58(),network:route.network})});
      const body=await response.json().catch(()=>({})),message=String(body?.error?.message||body?.error||'');
      const noRewards=response.status===400&&message.toLowerCase().includes('no rewards available');
      if(!response.ok&&!noRewards)throw new Error(message||'Creator rewards could not be claimed.');
      const transactions=(body?.data?.transactions||body?.transactions||[]).map(tx=>prepareRevenueTransaction(tx,[payer,feeWallet]));
      if(transactions.length){state={phase:'claim',transactions,createdAt:new Date().toISOString()};await persistRevenueJournal(route.routingId,state)}
    }
    if(state){
      const confirmed=await resumeRevenueTransactions(connection,state);
      if(!confirmed)return {success:true,claimed:false,pending:true,message:'The saved revenue transaction is still confirming. Check again to resume the same transaction.',claimSignatures:state.phase==='claim'?state.transactions.map(tx=>tx.signature):[],distributionSignature:state.phase==='distribution'?state.transactions[0].signature:undefined};
      if(state.phase==='distribution'){
        const signature=state.transactions[0].signature;
        await writeCreatorRevenueEvent(route,{grossLamports:state.balance,distributionSignature:signature,transfers:state.transfers});
        await del(revenueJournalPath(route.routingId));
        return {success:true,claimed:true,feeWallet:feeWallet.publicKey.toBase58(),claimedLamports:state.balance,claimSignatures:state.claimSignatures||[],distributionSignature:signature,transfers:state.transfers};
      }
      claimSignatures=state.transactions.map(tx=>tx.signature);
      await del(revenueJournalPath(route.routingId));
    }
    const balance=BigInt(await connection.getBalance(feeWallet.publicKey,'confirmed'));
    if(balance<=0n)return {success:true,claimed:false,message:'No creator revenue is available to distribute yet.',claimSignatures};
    const recipients=[{name:'creator',address:route.creatorRecipient,bps:route.creatorBps},{name:'treasury',address:route.treasuryRecipient,bps:route.treasuryBps},{name:'reserve',address:route.liquidityRecipient,bps:route.liquidityBps},{name:'protocol',address:route.protocolRecipient,bps:route.protocolBps}];
    const tx=new Transaction();tx.feePayer=payer.publicKey;let allocated=0n;const transfers=[];
    recipients.forEach((r,index)=>{
      const lamports=index===3?balance-allocated:balance*BigInt(r.bps)/10000n;allocated+=lamports;
      if(lamports){tx.add(SystemProgram.transfer({fromPubkey:feeWallet.publicKey,toPubkey:new PublicKey(r.address),lamports}));transfers.push({...r,lamports:lamports.toString()})}
    });
    tx.recentBlockhash=(await connection.getLatestBlockhash('confirmed')).blockhash;tx.partialSign(payer,feeWallet);
    const distribution=prepareRevenueTransaction(tx.serialize().toString('base64'),[payer,feeWallet]);
    state={phase:'distribution',transactions:[distribution],balance:balance.toString(),transfers,claimSignatures,createdAt:new Date().toISOString()};
    await persistRevenueJournal(route.routingId,state);
    if(!await resumeRevenueTransactions(connection,state))return {success:true,claimed:false,pending:true,message:'Revenue distribution is saved and still confirming. Check again to resume it.',claimSignatures,distributionSignature:distribution.signature};
    await writeCreatorRevenueEvent(route,{grossLamports:balance.toString(),distributionSignature:distribution.signature,transfers});
    await del(revenueJournalPath(route.routingId));
    return {success:true,claimed:true,feeWallet:feeWallet.publicKey.toBase58(),claimedLamports:balance.toString(),claimSignatures,distributionSignature:distribution.signature,transfers};
  }finally{await release().catch(()=>{})}
}
