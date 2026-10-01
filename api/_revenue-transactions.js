import bs58 from 'bs58';
import { VersionedTransaction, Transaction } from '@solana/web3.js';
import { readPrivateJson, writePrivateJson } from './_split-invite-utils.js';
export function prepareRevenueTransaction(base64,signers){
  const bytes=Buffer.from(base64,'base64');let tx;
  try{tx=VersionedTransaction.deserialize(bytes)}catch{tx=Transaction.from(bytes)}
  const required=tx instanceof VersionedTransaction?tx.message.staticAccountKeys.slice(0,tx.message.header.numRequiredSignatures):tx.signatures.map(x=>x.publicKey);
  const actual=required.map(key=>signers.find(s=>s.publicKey.equals(key))).filter(Boolean);
  if(!actual.length)throw new Error('The creator-revenue transaction has no available signer.');
  if(tx instanceof VersionedTransaction)tx.sign(actual);else tx.partialSign(...actual);
  const raw=Buffer.from(tx.serialize());
  const signature=tx instanceof VersionedTransaction?tx.signatures[0]:tx.signature;
  if(!signature||!signature.some(n=>n!==0))throw new Error('Creator-revenue transaction was not fully signed.');
  return {raw:raw.toString('base64'),signature:bs58.encode(signature),blockhash:tx instanceof VersionedTransaction?tx.message.recentBlockhash:tx.recentBlockhash};
}
export function revenueJournalPath(id){return `revenue-pending/${id}.json`}
export async function persistRevenueJournal(id,state){await writePrivateJson(revenueJournalPath(id),state)}
export async function readRevenueJournal(id){return readPrivateJson(revenueJournalPath(id))}
// The signed bytes are saved before sending. Every retry sends the same signature.
export async function resumeRevenueTransactions(connection,state,{timeoutMs=18000}={}){
  const started=Date.now();
  for(const tx of state.transactions){
    let status=(await connection.getSignatureStatuses([tx.signature],{searchTransactionHistory:true})).value?.[0];
    if(status?.err)throw new Error('A creator-revenue transaction failed on-chain. Review its transaction reference before retrying.');
    if(status&&['confirmed','finalized'].includes(status.confirmationStatus))continue;
    if(!status){
      const valid=await connection.isBlockhashValid(tx.blockhash,'confirmed');
      if(!valid.value)throw new Error('The previous creator-revenue transaction expired without a confirmed receipt. Review its transaction reference before submitting a new distribution.');
      try{await connection.sendRawTransaction(Buffer.from(tx.raw,'base64'),{skipPreflight:false,maxRetries:3})}catch{}
    }
    while(Date.now()-started<timeoutMs){
      status=(await connection.getSignatureStatuses([tx.signature],{searchTransactionHistory:true})).value?.[0];
      if(status?.err)throw new Error('A creator-revenue transaction failed on-chain.');
      if(status&&['confirmed','finalized'].includes(status.confirmationStatus))break;
      await new Promise(resolve=>setTimeout(resolve,1200));
    }
    if(!status||!['confirmed','finalized'].includes(status.confirmationStatus))return false;
  }
  return true;
}
