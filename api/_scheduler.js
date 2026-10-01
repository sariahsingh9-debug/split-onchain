import reconcile from './reconcile-payments.js';
import monitor from './operations-monitor.js';
import {reportError} from './_operations.js';

export function startRecoveryScheduler(){
  if(!process.env.CRON_SECRET)return ()=>{};
  let running=false,stopped=false;
  async function tick(){
    if(running||stopped)return;running=true;
    try{
      for(const [name,handler] of [['reconciliation',reconcile],['monitoring',monitor]]){
        let status=200,result;
        await handler({method:'POST',headers:{authorization:`Bearer ${process.env.CRON_SECRET}`},body:'{}',requestId:'scheduled-'+Date.now()}, {setHeader(){return this},status(value){status=value;return this},json(value){result=value;return this}});
        console.log(JSON.stringify({level:status>=500?'error':'info',event:'scheduled_'+name,status,...result}));
      }
    }catch{await reportError({event:'scheduler_failed',route:'internal-scheduler',status:503})}
    finally{running=false}
  }
  const initial=setTimeout(tick,1000),interval=setInterval(tick,120000);
  return ()=>{stopped=true;clearTimeout(initial);clearInterval(interval)};
}
