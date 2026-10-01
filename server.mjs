import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const port=Number(process.env.PORT||10000);
const publicDir=path.join(__dirname,'public');
const indexPath=path.join(publicDir,'index.html');

function productionIndex(){
  const raw=fs.readFileSync(indexPath,'utf8');
  const favicon='<link rel="icon" href="/favicon.ico?v=split-v76" sizes="any"><link rel="icon" type="image/png" sizes="64x64" href="/favicon.png?v=split-v76"><link rel="shortcut icon" href="/favicon.ico?v=split-v76">';
  const withFavicon=raw.includes('/favicon.png')?raw:raw.replace('</head>',favicon+'</head>');
  const withCss=withFavicon.includes('/split-production.css')?withFavicon:withFavicon.replace('</head>','<link rel="stylesheet" href="/split-production.css"></head>');
  return withCss.includes('/split-production.js')?withCss:withCss.replace('</body>','<script defer src="/split-production.js"></script></body>');
}
let indexHtml=productionIndex();

app.disable('x-powered-by');
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
  res.on('finish',()=>{if(res.statusCode>=500)console.error('SPLIT request failed',{requestId,method:req.method,path:req.path,status:res.statusCode})});
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
  'upload-media','verify-split-invite'
]);

app.all('/api/:name',async(req,res)=>{
  try{
    const name=String(req.params.name||'');
    if(!apiNames.has(name))return res.status(404).json({success:false,error:'API route not found.'});
    req.waitUntil=(promise)=>Promise.resolve(promise).catch(error=>console.error('Background task failed:',error));
    const mod=await import(`./api/${name}.js`);
    await mod.default(req,res);
  }catch(error){
    console.error('SPLIT API error:',{requestId:req.requestId,error:error?.message||error});
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

app.get('*',(req,res)=>{
  res.setHeader('Cache-Control','no-cache');
  res.type('html').send(indexHtml);
});

app.listen(port,'0.0.0.0',()=>{
  console.log(`SPLIT listening on port ${port}`);
});
