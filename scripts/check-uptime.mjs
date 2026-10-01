// Public readiness checks require no wallet, email, cron, or repository secrets.
const base=process.env.APP_BASE_URL||'https://split-onchain.onrender.com';
let healthy=false;
for(let attempt=0;attempt<6;attempt++){
  try{
    const alive=await fetch(new URL('/healthz',base),{signal:AbortSignal.timeout(30000)});
    if(!alive.ok)throw new Error('Service unavailable.');
    const response=await fetch(new URL('/api/health',base),{signal:AbortSignal.timeout(25000)});
    const status=await response.json();
    if(response.ok&&status.coreReady&&status.services?.backgroundReconcile&&status.services?.monitoring){healthy=true;console.log(JSON.stringify({event:'operational_health_ok',reconciliation:status.reconciliation}));break}
    console.log(JSON.stringify({event:'operational_health_not_ready',attempt:attempt+1,coreReady:status.coreReady,reconciliationReady:status.services?.backgroundReconcile,monitoringReady:status.services?.monitoring}));
  }catch{console.error('Production health check could not complete.');}
  if(attempt<5)await new Promise(resolve=>setTimeout(resolve,10000));
}
if(!healthy)process.exitCode=1;
