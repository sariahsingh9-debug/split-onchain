import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {reportError} from './api/_operations.js';
import {startRecoveryScheduler} from './api/_scheduler.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const port=Number(process.env.PORT||10000);
const publicDir=path.join(__dirname,'public');
const indexPath=path.join(publicDir,'index.html');

function productionIndex(){return fs.readFileSync(indexPath,'utf8')}
let indexHtml=productionIndex();

app.disable('x-powered-by');
app.set('trust proxy',1);
app.use((req,res,next)=>{
  const requestId=crypto.randomUUID();
  req.requestId=requestId;
  res.setHeader('X-Request-Id',requestId);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('X-Permitted-Cross-Domain-Policies','none');
  res.setHeader('Origin-Agent-Cluster','?1');
  const proto=String(req.headers['x-forwarded-proto']||'').toLowerCase();
  if(proto==='https')res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
  res.on('finish',()=>{
    const critical=['/api/create-launch','/api/register-launch','/api/creator-claim-revenue'];
    if((res.statusCode>=500&&req.path!=='/api/health')||(critical.includes(req.path)&&res.statusCode>=400&&!([400,401,402,403,405,409,429].includes(res.statusCode))))void reportError({event:'request_failed',requestId,route:req.path,status:res.statusCode});
  });
  next();
});

// Bound expensive unauthenticated work. Upload wallet quotas are also atomic.
const requestLimits=new Map();let requestWindow=0;
app.use('/api',(req,res,next)=>{
  if(process.env.SPLIT_STORAGE_MAINTENANCE==='true'&&!['/config','/health','/public-launches'].includes(req.path))return res.status(503).json({success:false,error:'Payment storage maintenance is in progress. Please try again shortly.'});
  if(req.method!=='POST')return next();
  const origin=req.headers.origin;
  const expected=process.env.APP_BASE_URL||process.env.RENDER_EXTERNAL_URL;
  if(origin&&expected&&origin!==new URL(expected).origin)return res.status(403).json({success:false,error:'This request must come from the SPLIT website.'});
  const caps={'/create-split-invites':20,'/creator-auth-challenge':60,'/creator-auth-verify':60,'/create-launch':20,'/upload-media':30};
  const cap=caps[req.path];if(!cap)return next();
  const window=Math.floor(Date.now()/600000);if(window!==requestWindow){requestWindow=window;requestLimits.clear()}
  const key=req.ip+':'+req.path,count=(requestLimits.get(key)||0)+1;
  if(requestLimits.size>10000&&!requestLimits.has(key))return res.status(429).json({success:false,error:'SPLIT is busy. Please retry shortly.'});
  requestLimits.set(key,count);
  if(count>cap){res.setHeader('Retry-After',String(600-Math.floor(Date.now()/1000)%600));return res.status(429).json({success:false,error:'Too many requests. Please wait a few minutes and try again.'})}
  next();
});

// Preserve the exact request body for signed webhooks while still supporting
// the existing SPLIT bodyOf(req) helpers.
app.use(express.text({type:'*/*',limit:'6mb'}));

const apiNames=new Set([
  'build-split-payment','claim-fees','config','confirm-split-payment',
  'create-launch','create-split-invites','creator-auth-challenge',
  'creator-auth-verify','creator-claim-revenue','creator-dashboard',
  'health','launch-preflight','public-launches','reconcile-payments',
  'record-split-payment','register-launch','resend-split-invite',
  'resend-webhook','solana-signature-status','split-status',
  'upload-media','verify-split-invite','operations-monitor','client-error'
]);

app.all('/api/:name',async(req,res)=>{
  try{
    const name=String(req.params.name||'');
    if(!apiNames.has(name))return res.status(404).json({success:false,error:'API route not found.'});
    req.waitUntil=(promise)=>Promise.resolve(promise).catch(()=>reportError({event:'background_task_failed',route:req.path,requestId:req.requestId,status:500}));
    const mod=await import(`./api/${name}.js`);
    await mod.default(req,res);
  }catch(error){
    console.error(JSON.stringify({level:'error',event:'api_exception',requestId:req.requestId,route:req.path}));
    if(!res.headersSent)res.status(500).json({success:false,error:'SPLIT could not complete that request. Please try again.'});
  }
});

app.get(['/', '/index.html'],(req,res)=>{
  // Refresh during development/redeploys without ever exposing server secrets.
  if(process.env.NODE_ENV!=='production')indexHtml=productionIndex();
  res.setHeader('Cache-Control','no-cache');
  res.type('html').send(indexHtml);
});

app.use(express.static(publicDir,{
  extensions:['html'],
  index:false,
  maxAge:'1h'
}));
app.use('/assets',(req,res)=>res.status(404).send('Asset not found.'));

app.use((error,req,res,next)=>{
  if(res.headersSent)return next(error);
  const status=error?.type==='entity.too.large'?413:error?.status===400?400:500;
  res.status(status).json({success:false,error:status===413?'Request is too large.':'SPLIT could not complete that request.',requestId:req.requestId});
});

app.get('/healthz',(req,res)=>res.json({ok:true,service:'split-onchain',version:'76.1.1'}));

app.get('*',(req,res)=>{
  res.setHeader('Cache-Control','no-cache');
  res.type('html').send(indexHtml);
});

const server=app.listen(port,'0.0.0.0',()=>{
  console.log(`SPLIT listening on port ${port}`);
});
const stopRecovery=startRecoveryScheduler();
process.on('unhandledRejection',()=>{void reportError({event:'unhandled_rejection',status:500})});
process.on('uncaughtException',async()=>{await reportError({event:'uncaught_exception',status:500});process.exit(1)});
process.on('SIGTERM',()=>{stopRecovery();server.close(()=>process.exit(0))});
