import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parse} from 'parse5';
const failures=[];const requireCheck=(ok,message)=>{if(!ok)failures.push(message)};
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
requireCheck(!Object.keys(pkg.dependencies).some(k=>/@netlify|@vercel/.test(k)),'Obsolete hosting dependency.');
requireCheck(!fs.existsSync('netlify')&&!fs.existsSync('netlify.toml'),'Obsolete hosting adapter.');
for(const file of [...fs.readdirSync('api').map(f=>'api/'+f),...fs.readdirSync('public/assets/js').map(f=>'public/assets/js/'+f),'server.mjs','scripts/reconcile-render.mjs','scripts/build.mjs'])if(/\.(js|mjs)$/.test(file))execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
const html=fs.readFileSync('public/index.html','utf8');parse(html);
requireCheck(!/<style\b/.test(html),'Inline homepage stylesheet.');requireCheck(!/data:image\//.test(html),'Embedded homepage image.');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))requireCheck(/src=/.test(m[1])||/application\/ld\+json/.test(m[1]),'Inline homepage behavior.');
for(const m of html.matchAll(/(?:src|href)="(\/(?:assets\/|split-production\.js)[^"]*)"/g))requireCheck(fs.existsSync('public'+m[1]),'Missing asset: '+m[1]);
const policy=fs.readFileSync('api/_launch-policy.js','utf8');for(const amount of ['3500','2000','1000'])requireCheck(policy.includes(amount),'Fee policy changed.');
requireCheck(policy.includes('5'),'Minimum first buy changed.');
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('SPLIT audit passed: server syntax, frontend assets, Render runtime, and launch policy.');
