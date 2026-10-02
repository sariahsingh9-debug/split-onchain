import {Connection,PublicKey} from '@solana/web3.js';
import {put,get,list,acquireLease} from './_blob-store.js';
import {registerSignedLaunch} from './register-launch.js';
import {readOperation,writeOperation,reportError} from './_operations.js';

export async function savePreparedLaunch(body){
  await put(`launch-pending/${body.routingId}.json`,JSON.stringify({...body,preparedAt:new Date().toISOString()}),{allowOverwrite:false});
}

// This job only registers existing on-chain accounts. It never signs or sends a launch.
export async function recoverLaunches(){
  if(process.env.SPLIT_STORAGE_MAINTENANCE==='true')return;
  const release=await acquireLease('operations/launch-recovery-lock',180);if(!release)return;
  try{
  const start=Date.now();
  const state=await readOperation('launch-recovery');
  const page=state?.remainingKeys?.length?{blobs:state.remainingKeys.map(pathname=>({pathname})),cursor:state.cursor}:await list({prefix:'launch-pending/',limit:20,cursor:state?.cursor||'0'});
  const network=process.env.SOLANA_NETWORK||'solana-devnet';
  const rpc=process.env.SOLANA_RPC_URL||(network==='solana-mainnet'?'https://api.mainnet-beta.solana.com':'https://api.devnet.solana.com');
  const connection=new Connection(rpc,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(8000)})});
  let registered=0,index=0;
  for(const entry of page.blobs){
    if(Date.now()-start>45000)break;index++;
    try{
      const record=await get(entry.pathname);if(!record)continue;
      const body=JSON.parse(await new Response(record.stream).text());
      if(body.network!==network)continue;
      const account=await connection.getAccountInfo(new PublicKey(body.genesisAccount),'confirmed');
      if(!account)continue;
      await registerSignedLaunch(body);registered++;
    }catch{
      await reportError({event:'launch_recovery_pending',route:'internal-launch-recovery',status:503});
    }
  }
  await writeOperation('launch-recovery',{cursor:page.cursor||'0',remainingKeys:page.blobs.slice(index).map(x=>x.pathname),registered,lastRunAt:new Date().toISOString()});
  console.log(JSON.stringify({event:'launch_recovery_completed',registered}));
  return {registered};
  }finally{await release()}
}
