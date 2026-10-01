(()=>{'use strict';
const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>Array.from(r.querySelectorAll(s));
const live=document.createElement('div');live.className='spx-live';live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');document.body.prepend(live);
const skip=document.createElement('a');skip.className='spx-skip';skip.href='#main-content';skip.textContent='Skip to main content';document.body.prepend(skip);
const main=qs('main')||qs('[role="main"]')||qs('section');if(main&&!main.id)main.id='main-content';
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
  [/Netlify Blobs must be available before sending payment invitations\.?/gi,'Secure payment storage is temporarily unavailable. Please try again shortly.'],
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

function findHeading(words){const terms=words.map(x=>x.toLowerCase());return qsa('h1,h2,h3,h4,[role="heading"]').find(el=>{const t=(el.textContent||'').toLowerCase();return terms.some(w=>t.includes(w))})}
function go(words){const h=findHeading(words);const target=h?.closest('section,article')||h;if(target){target.scrollIntoView({behavior:'smooth',block:'start'});closeGuide();return true}return false}

const guide=document.createElement('button');guide.type='button';guide.className='spx-guide';guide.dataset.state='warn';guide.setAttribute('aria-haspopup','dialog');guide.setAttribute('aria-expanded','false');guide.innerHTML='<span class="spx-dot" aria-hidden="true"></span><span>SPLIT guide</span>';document.body.appendChild(guide);
const backdrop=document.createElement('div');backdrop.className='spx-backdrop';backdrop.dataset.open='false';backdrop.innerHTML=`
<div class="spx-modal" role="dialog" aria-modal="true" aria-labelledby="spx-title">
  <div class="spx-modal-top">
    <div><div class="spx-eyebrow">ONE SPLIT · TWO PRODUCTS</div><h2 id="spx-title">Know where to go.</h2><p>Payments handles shared expenses. Launch handles token creation and creator revenue. Wallet approvals always happen in your wallet.</p></div>
    <button class="spx-close" type="button" aria-label="Close">×</button>
  </div>
  <div class="spx-grid">
    <div class="spx-card"><small>GROUP PAYMENTS</small><h3>SPLIT Payments</h3><p>Create a payment request, divide the total, share participant links and track each confirmed on-chain payment.</p><button class="spx-action primary" type="button" data-go="payments">Go to Payments</button></div>
    <div class="spx-card"><small>TOKEN CREATION</small><h3>SPLIT Launch</h3><p>Connect a Solana wallet, create a token launch, track creator revenue and manage launches from the creator dashboard.</p><button class="spx-action" type="button" data-go="launch">Go to Launch</button></div>
  </div>
  <div class="spx-status" aria-label="SPLIT system status">
    <div class="spx-status-row"><strong>Payments</strong><span data-status="payments">Checking…</span></div>
    <div class="spx-status-row"><strong>Launchpad</strong><span data-status="launch">Checking…</span></div>
    <div class="spx-status-row"><strong>Email invites</strong><span data-status="email">Checking…</span></div>
    <div class="spx-status-row"><strong>Storage</strong><span data-status="storage">Checking…</span></div>
  </div>
  <div class="spx-trust"><a href="/trust.html">Trust & fees</a><a href="/terms.html">Terms & risks</a><a href="/privacy.html">Privacy</a><a href="/launches.html">Token directory</a></div>
</div>`;
document.body.appendChild(backdrop);
const closeBtn=qs('.spx-close',backdrop);
function openGuide(){backdrop.dataset.open='true';guide.setAttribute('aria-expanded','true');closeBtn.focus();refreshHealth()}
function closeGuide(){backdrop.dataset.open='false';guide.setAttribute('aria-expanded','false');guide.focus()}
guide.addEventListener('click',openGuide);closeBtn.addEventListener('click',closeGuide);backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeGuide()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&backdrop.dataset.open==='true')closeGuide()});
qs('[data-go="payments"]',backdrop).addEventListener('click',()=>{if(!go(['group payment','create split','payments']))toast('Payments section','Use the Create SPLIT area on this page.')});
qs('[data-go="launch"]',backdrop).addEventListener('click',()=>{if(!go(['launch','token']))toast('Launch section','Use the token launch area on this page.')});

function setStatus(name,text){const el=qs('[data-status="'+name+'"]',backdrop);if(el)el.textContent=text}
let lastHealth=null;
async function refreshHealth(){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5500);
  try{
    const response=await fetch('/api/health',{cache:'no-store',signal:controller.signal});
    const h=await response.json();lastHealth=h;
    const pay=Boolean(h.splitReady),launch=Boolean(h.launchReady),storage=Boolean(h.services?.storage),email=Boolean(h.services?.email);
    setStatus('payments',pay?'Operational':'Needs attention');
    setStatus('launch',launch?'Operational':'Needs attention');
    setStatus('storage',storage?'Operational':'Needs attention');
    setStatus('email',email?'Operational':h.services?.emailConfigured?'Verification pending':'Manual links available');
    if(pay&&launch){guide.dataset.state=email?'ok':'warn';guide.lastElementChild.textContent=email?'Core systems online':'Core systems online'}else if(pay||launch){guide.dataset.state='warn';guide.lastElementChild.textContent='Partial service'}else{guide.dataset.state='bad';guide.lastElementChild.textContent='Service issue'}
  }catch{setStatus('payments','Status unavailable');setStatus('launch','Status unavailable');setStatus('email','Status unavailable');setStatus('storage','Status unavailable');guide.dataset.state='warn';guide.lastElementChild.textContent='SPLIT guide'}
  finally{clearTimeout(timer)}
}
refreshHealth();setInterval(refreshHealth,120000);

window.addEventListener('error',e=>{const msg=makeFriendly(e?.message||'');if(/not configured|temporarily unavailable/i.test(msg))toast('Something needs attention',msg,6500)});
window.addEventListener('unhandledrejection',e=>{const msg=makeFriendly(e?.reason?.message||e?.reason||'');if(/not configured|temporarily unavailable/i.test(msg))toast('Something needs attention',msg,6500)});
})();