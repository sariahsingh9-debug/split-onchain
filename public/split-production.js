(()=>{'use strict';
const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>Array.from(r.querySelectorAll(s));
const live=document.createElement('div');live.className='spx-live';live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');document.body.prepend(live);
const skip=document.createElement('a');skip.className='spx-skip';skip.href='#main-content';skip.textContent='Skip to main content';document.body.prepend(skip);
const main=qs('main')||qs('[role="main"]')||qs('section');if(main&&!main.id)main.id='main-content';if(main)skip.href='#'+main.id;
document.title='SPLIT — Group payments + token launches';
let meta=qs('meta[name="description"]');if(!meta){meta=document.createElement('meta');meta.name='description';document.head.appendChild(meta)}meta.content='Create group payment requests, track participant payments, and launch Solana tokens through SPLIT.';
qsa('a[target="_blank"]').forEach(a=>{const rel=new Set(String(a.rel||'').split(/\s+/).filter(Boolean));rel.add('noopener');rel.add('noreferrer');a.rel=Array.from(rel).join(' ')});

/* The SPLIT brand/logo is always a Home control, including dynamically rendered navs. */
function wireHomeBrand(root=document){
  const candidates=qsa('nav .brand,header .brand,nav [class*="logo"],header [class*="logo"],nav img[src*="split-logo"],header img[src*="split-logo"],nav img[src*="split-icon"],header img[src*="split-icon"]',root);
  candidates.forEach(el=>{
    const existingLink=el.closest('a');
    if(existingLink){existingLink.href='/';existingLink.setAttribute('aria-label','SPLIT home');return}
    if(el.dataset.spxHome==='1')return;
    el.dataset.spxHome='1';el.setAttribute('role','link');el.setAttribute('tabindex','0');el.setAttribute('aria-label','SPLIT home');
    el.style.cursor='pointer';
    const home=()=>{window.location.href='/'};
    el.addEventListener('click',home);
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();home()}});
  });
}
wireHomeBrand();

const toastWrap=document.createElement('div');toastWrap.className='spx-toast-wrap';document.body.appendChild(toastWrap);
function toast(title,detail='',ms=5000){const el=document.createElement('div');el.className='spx-toast';el.innerHTML='<div></div><small></small>';el.firstChild.textContent=title;el.lastChild.textContent=detail;toastWrap.appendChild(el);live.textContent=[title,detail].filter(Boolean).join('. ');setTimeout(()=>el.remove(),ms)}
window.addEventListener('offline',()=>toast('You are offline','Wallet and payment actions need an internet connection.',7000));
window.addEventListener('online',()=>toast('Back online','SPLIT can reconnect to its services.',3500));

const friendlyRules=[
  [/SPLIT_EMAIL_FROM is not configured\.?/gi,'Email invitations are unavailable right now. Create the SPLIT and share the participant links manually.'],
  [/RESEND_API_KEY is not configured\.?/gi,'Email invitations are unavailable right now. Create the SPLIT and share the participant links manually.'],
  [/\b(?:SPLIT_[A-Z0-9_]+|REDIS_URL|SOLANA_RPC_URL|PAYMENT_SOLANA_RPC_URL|IRYS_SOLANA_PRIVATE_KEY|CRON_SECRET)\b\s+is not configured\.?/gi,'This feature is temporarily unavailable. Please try again shortly.']
];
function makeFriendly(value){let out=String(value||'');for(const [re,replacement] of friendlyRules)out=out.replace(re,replacement);return out}
function sanitizeNode(root){
  if(!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){const p=n.parentElement;if(!p||['SCRIPT','STYLE','NOSCRIPT','TEXTAREA'].includes(p.tagName))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT}});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(n=>{const next=makeFriendly(n.nodeValue);if(next!==n.nodeValue)n.nodeValue=next});
  qsa('[class*="error"],[class*="alert"],[data-error]',root.nodeType===1?root:document).forEach(el=>{if(/error|failed|unavailable|invalid|try again/i.test(el.textContent||'')){el.setAttribute('role','alert');el.setAttribute('aria-live','polite')}});
}
sanitizeNode(document.body);
new MutationObserver(mutations=>{for(const m of mutations){m.addedNodes.forEach(n=>{if(n.nodeType===1||n.nodeType===3){const root=n.nodeType===3?n.parentElement:n;sanitizeNode(root);if(root?.querySelectorAll)wireHomeBrand(root)}})}}).observe(document.body,{subtree:true,childList:true,characterData:false});

const serviceStatus=qs('#cdServiceStatus');
function setStatus(name,text){const el=qs('[data-status="'+name+'"]',serviceStatus);if(el)el.textContent=text}
function setSummary(text,state){
  if(!serviceStatus)return;
  serviceStatus.dataset.state=state;
  qs('[data-status-summary]',serviceStatus).textContent=text;
}
async function refreshHealth(){
  if(!serviceStatus)return;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5500);
  try{
    const response=await fetch('/api/health',{cache:'no-store',signal:controller.signal});
    if(!response.ok&&response.status!==503)throw new Error('Health unavailable');
    const h=await response.json();
    const pay=Boolean(h.splitReady),launch=Boolean(h.launchReady),storage=Boolean(h.services?.storage),email=Boolean(h.services?.email);
    setStatus('payments',h.paymentCreationReady&&pay?'Operational':pay?'New payments paused':'Needs attention');
    setStatus('launch',launch?(h.network==='solana-mainnet'?'Mainnet':'Devnet · test only'):'Needs attention');
    setStatus('storage',storage?(h.storageDurable?'Persistent':'Persistence required'):'Needs attention');
    setStatus('email',email?'Operational':h.services?.emailConfigured?'Verification pending':'Manual links available');
    if(h.productionReady)setSummary('Production systems online','ok');
    else if(pay&&launch&&storage)setSummary(h.storageDurable?'Devnet launchpad · payments available':'Preview available · live payments paused','warn');
    else if(pay||launch)setSummary('Partial service','warn');
    else setSummary('Service issue','bad');
  }catch{setStatus('payments','Status unavailable');setStatus('launch','Status unavailable');setStatus('email','Status unavailable');setStatus('storage','Status unavailable');setSummary('Status unavailable','warn')}
  finally{clearTimeout(timer)}
}
serviceStatus?.addEventListener('toggle',()=>{if(serviceStatus.open)refreshHealth()});
refreshHealth();setInterval(refreshHealth,120000);

window.addEventListener('error',e=>{const msg=makeFriendly(e?.message||'');if(/not configured|temporarily unavailable/i.test(msg))toast('Something needs attention',msg,6500)});
window.addEventListener('unhandledrejection',e=>{const msg=makeFriendly(e?.reason?.message||e?.reason||'');if(/not configured|temporarily unavailable/i.test(msg))toast('Something needs attention',msg,6500)});
})();

// Keep keyboard focus inside open dialogs and restore it on close.
(()=>{
  const dialogs=[...document.querySelectorAll('[aria-modal="true"]')];let previous=null,current=null;
  const open=()=>dialogs.filter(el=>getComputedStyle(el).display!=='none').sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0)).at(-1);
  const observer=new MutationObserver(()=>{
    const next=open();if(next===current)return;
    if(next){if(!current)previous=document.activeElement;current=next;const focus=next.querySelector('button,input,a[href]');focus?.focus()}
    else{current=null;previous?.focus();previous=null}
  });dialogs.forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['style']}));
  document.addEventListener('keydown',event=>{
    const active=open();if(!active)return;
    if(event.key==='Escape'){event.preventDefault();active.id==='walletChooserModal'?closeLaunchWalletModal():closeLaunchCreator();return}
    if(event.key!=='Tab')return;
    const items=[...active.querySelectorAll('button,input,select,textarea,a[href]')].filter(el=>!el.disabled&&!el.hidden&&el.getClientRects().length);
    const first=items[0],last=items.at(-1);
    if(event.shiftKey&&(document.activeElement===first||!active.contains(document.activeElement))){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&(document.activeElement===last||!active.contains(document.activeElement))){event.preventDefault();first?.focus()}
  });
})();
