// This job runs independently of browsers and the web process. It needs only
// the production origin and cron credential; wallet keys stay on the web service.
const base=process.env.APP_BASE_URL;
if(!base||!process.env.CRON_SECRET)throw new Error('APP_BASE_URL and CRON_SECRET are required.');
const origin=new URL(base);
if(origin.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(origin.hostname))throw new Error('Production origin must use HTTPS.');
let failed=false;
for(const route of ['reconcile-payments','operations-monitor']){
  try{
    const response=await fetch(new URL(`/api/${route}`,origin),{method:'POST',signal:AbortSignal.timeout(150000),headers:{authorization:`Bearer ${process.env.CRON_SECRET}`,'content-type':'application/json'},body:'{}'});
    const body=await response.json();
    console.log(JSON.stringify({event:route,status:response.status,...body}));
    if(!response.ok||!body.success)failed=true;
  }catch{console.error(JSON.stringify({level:'error',event:route,error:'Production request failed or timed out.'}));failed=true}
}
if(failed)process.exitCode=1;
