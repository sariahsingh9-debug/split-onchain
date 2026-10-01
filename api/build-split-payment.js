import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction } from '@solana/spl-token';
import { verifyPayload, readSplitMeta, readParticipant, assertInviteMatchesStorage } from './_split-invite-utils.js';
import { decimalToUnits, addressWord, uintWord, SOLANA_MINTS, EVM } from './_payment-config.js';
function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body||'{}');return req.body||{}}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed.'});
  try{
    const {token,payer}=bodyOf(req);const payload=verifyPayload(token,'participant');
    const meta=await readSplitMeta(payload.splitId);const participant=await readParticipant(payload.splitId,payload.participantId);
    assertInviteMatchesStorage(payload,meta,participant);
    if(participant.status==='confirmed')return res.status(409).json({success:false,error:'This SPLIT share is already paid.'});
    if(participant.status==='submitted')return res.status(409).json({success:false,error:'A payment is already submitted for this SPLIT share. Wait for confirmation or refresh the link.'});

    if(meta.network==='solana'){
      const payerKey=new PublicKey(String(payer||''));const destination=new PublicKey(meta.payout);
      // Group payments are always mainnet. Never inherit the launchpad devnet RPC.
      const rpc=process.env.PAYMENT_SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com';
      const connection=new Connection(rpc,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(8000)})});const tx=new Transaction();tx.feePayer=payerKey;
      if(meta.asset==='SOL'){
        tx.add(SystemProgram.transfer({fromPubkey:payerKey,toPubkey:destination,lamports:decimalToUnits(participant.amount,9)}));
      }else{
        const info=SOLANA_MINTS[meta.asset];if(!info)throw new Error('This Solana payment asset is not supported.');
        const mint=new PublicKey(info.mint);const sourceAta=getAssociatedTokenAddressSync(mint,payerKey,false);const destAta=getAssociatedTokenAddressSync(mint,destination,false);
        tx.add(createAssociatedTokenAccountIdempotentInstruction(payerKey,destAta,destination,mint),createTransferCheckedInstruction(sourceAta,mint,destAta,payerKey,decimalToUnits(participant.amount,info.decimals),info.decimals));
      }
      const {blockhash,lastValidBlockHeight}=await connection.getLatestBlockhash('confirmed');tx.recentBlockhash=blockhash;
      return res.status(200).json({success:true,family:'solana',network:'solana-mainnet',transaction:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),lastValidBlockHeight});
    }

    const network=EVM[meta.network];if(!network)throw new Error('This EVM network is not supported.');
    if(!/^0x[a-fA-F0-9]{40}$/.test(String(payer||'')))throw new Error('Invalid payer wallet.');
    if(!/^0x[a-fA-F0-9]{40}$/.test(meta.payout))throw new Error('Invalid recipient wallet.');
    if(network.native.includes(meta.asset))return res.status(200).json({success:true,family:'evm',network:meta.network,chainId:network.chainId,to:meta.payout,value:'0x'+decimalToUnits(participant.amount,18).toString(16)});
    const info=network.tokens[meta.asset];if(!info)throw new Error('This token is not supported on the selected network.');
    const data='0xa9059cbb'+addressWord(meta.payout)+uintWord(decimalToUnits(participant.amount,info.decimals));
    return res.status(200).json({success:true,family:'evm',network:meta.network,chainId:network.chainId,to:info.address,data,tokenContract:info.address});
  }catch(error){console.error(error);return res.status(400).json({success:false,error:error?.message||'Could not build payment.'})}
}
