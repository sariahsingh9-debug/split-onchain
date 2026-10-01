import health from './health.js';
import {authorizedCron,readOperation,writeOperation,sendAlert,alertConfigured,reconciliationHealth} from './_operations.js';

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed.'});
  if(!authorizedCron(req))return res.status(401).json({success:false,error:'Unauthorized.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{};
    if(body.test){const delivery=await sendAlert({event:'monitoring_test',requestId:req.requestId},{test:true});return res.json({success:true,...delivery})}
    if(body.statusOnly){return res.json({success:true,monitoringConfigured:alertConfigured(),reconciliation:await reconciliationHealth(),lastAlert:await readOperation('last-alert'),lastError:await readOperation('last-error')})}
    const [lastError,lastAlert]=await Promise.all([readOperation('last-error'),readOperation('last-alert')]);
    if(lastError&&(!lastAlert||Date.parse(lastError.time)>Date.parse(lastAlert.acceptedAt)))await sendAlert(lastError);
    let status;
    await health({method:'GET'}, {setHeader(){return this},status(){return this},json(value){status=value;return this}});
    const unhealthy=Object.entries({launch:status.launchReady,payments:status.splitReady,reconciliation:status.services.backgroundReconcile,alerts:alertConfigured()}).filter(([,ok])=>!ok).map(([name])=>name);
    if(unhealthy.length)await sendAlert({event:'service_health_failed',route:'/api/health',status:503,requestId:req.requestId});
    await writeOperation('monitor',{lastCheckAt:new Date().toISOString(),healthy:!unhealthy.length,unhealthy});
    return res.status(unhealthy.length?503:200).json({success:!unhealthy.length,unhealthy});
  }catch{return res.status(503).json({success:false,error:'Monitoring check failed.'})}
}
