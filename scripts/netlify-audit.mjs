import { readFileSync, existsSync, readdirSync } from 'node:fs';

const fail=[];
const index=readFileSync('public/index.html','utf8');
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const apiFiles=readdirSync('api').filter(x=>x.endsWith('.js'));
const functions=readdirSync('netlify/functions').filter(x=>x.endsWith('.mjs'));

if(index.includes('Vercel environment variables'))fail.push('frontend still mentions Vercel environment variables');
if(!pkg.dependencies['@netlify/blobs'])fail.push('@netlify/blobs missing');
if(pkg.dependencies['@vercel/blob']||pkg.dependencies['@vercel/functions'])fail.push('Vercel runtime dependencies still present');
if(!existsSync('netlify.toml'))fail.push('netlify.toml missing');
if(!existsSync('netlify/functions/create-launch.mjs'))fail.push('create-launch function missing');
if(!existsSync('netlify/functions/register-launch.mjs'))fail.push('register-launch function missing');
if(!existsSync('netlify/functions/upload-media.mjs'))fail.push('upload-media function missing');
if(!existsSync('netlify/functions/solana-signature-status.mjs'))fail.push('signature status function missing');
if(!existsSync('api/_blob-store.js'))fail.push('Netlify Blobs adapter missing');

const vercelImports=apiFiles.flatMap(file=>{
  const text=readFileSync('api/'+file,'utf8');
  return text.includes('@vercel/')?[file]:[];
});
if(vercelImports.length)fail.push('Vercel imports remain: '+vercelImports.join(', '));
const badWaitUntil=apiFiles.flatMap(file=>{
  const text=readFileSync('api/'+file,'utf8');
  return /(^|[^.\w])waitUntil\s*\(/m.test(text)?[file]:[];
});
if(badWaitUntil.length)fail.push('Unbound waitUntil remains: '+badWaitUntil.join(', '));


const createLaunch=readFileSync('api/create-launch.js','utf8');
const routing=readFileSync('api/_routing-utils.js','utf8');
const frontend=readFileSync('public/index.html','utf8');
const configApi=readFileSync('api/config.js','utf8');
const uploadMedia=readFileSync('api/upload-media.js','utf8');

if(!createLaunch.includes('FIXED_ROUTING'))fail.push('fixed launch routing not enforced server-side');
if(!createLaunch.includes('firstBuyAmount:firstBuy.sol'))fail.push('Metaplex first buy not wired');
if(!routing.includes('assertFixedRoute(route)'))fail.push('routing token does not enforce fixed split');
if(!frontend.includes('35% / 20% / 35%'))fail.push('frontend fixed split missing');
if(!frontend.includes('launchInitialBuyUsd'))fail.push('initial buy UI missing');
if(!existsSync('netlify/functions/launch-preflight.mjs'))fail.push('launch preflight function missing');
if(!uploadMedia.includes('creatorSession(req)'))fail.push('media upload is not creator-authenticated');
if(!configApi.includes('SPLIT_REVENUE_RESERVE_TREASURY'))fail.push('new reserve env name not recognized');
if(!configApi.includes('launchAuthReady'))fail.push('launch readiness does not check wallet-auth secret');
if(frontend.includes('On Vercel'))fail.push('user-facing Vercel wording remains');


if(!frontend.includes('setWalletRuntimeNoteV73'))fail.push('v73 wallet runtime guidance missing');
if(!frontend.includes('walletSiteUrlV73'))fail.push('v73 wallet-app resume URL missing');
if(!frontend.includes("u.searchParams.get('launchWallet')!=='1'"))fail.push('mobile wallet resume flow missing');
if(!frontend.includes('renderLaunchWalletOptions();\n  setWalletRuntimeNoteV73();'))fail.push('wallet chooser does not render synchronously');

console.log(`API source files: ${apiFiles.length}`);
console.log(`Netlify functions: ${functions.length}`);
if(fail.length){
  console.error(fail.map(x=>'FAIL: '+x).join('\n'));
  process.exit(1);
}
console.log('SPLIT Netlify audit passed.');
