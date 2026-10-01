import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const port=Number(process.env.PORT||10000);

app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
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
    console.error('SPLIT API error:',error);
    if(!res.headersSent)res.status(500).json({success:false,error:'Internal server error.'});
  }
});

app.use(express.static(path.join(__dirname,'public'),{
  extensions:['html'],
  index:'index.html',
  maxAge:'1h'
}));

app.get('*',(req,res)=>{
  res.sendFile(path.join(__dirname,'public','index.html'));
});

app.listen(port,'0.0.0.0',()=>{
  console.log(`SPLIT listening on port ${port}`);
});
