
const toastEl=document.getElementById('toast');let timer;
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>toastEl.classList.remove('show'),2600)}
const store={get(k,f=[]){try{return JSON.parse(localStorage.getItem('split_'+k))??f}catch(e){return f}},set(k,v){try{localStorage.setItem('split_'+k,JSON.stringify(v))}catch(e){}}};
let projects=store.get('projects');
document.querySelectorAll('.card').forEach(c=>c.addEventListener('pointermove',e=>{const r=c.getBoundingClientRect();c.style.setProperty('--mx',((e.clientX-r.left)/r.width*100)+'%');c.style.setProperty('--my',((e.clientY-r.top)/r.height*100)+'%')}));
window.addEventListener('pointermove',e=>{const o=document.querySelector('.orb');if(o)o.style.transform=`translate(calc(-50% + ${(e.clientX-innerWidth/2)*.015}px),calc(-50% + ${(e.clientY-innerHeight/2)*.015}px))`});
function scrollToId(id){const el=document.getElementById(id);if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}
let launchWalletAddress='';
let walletConnectContext='launch';
let launchImageData='';
let launchBannerData='';
let launchWalletSession=null;
let walletStandardRegistry=null;
let walletStandardWallets=[];
let launchServiceConfig=null;
let mwaRegistered=false;
let latestLaunchResultV57=null;
let launchAuthTokenV72='';
let launchAuthWalletV72='';
let launchAuthExpiresV72=0;

const POPULAR_SOLANA_WALLETS=[
  {key:'mwa',name:'Device Wallet',abbr:'DW',url:'',mobileOnly:true},
  {key:'phantom',name:'Phantom',abbr:'PH',url:'https://phantom.app/'},
  {key:'solflare',name:'Solflare',abbr:'SF',url:'https://www.solflare.com/'},
  {key:'backpack',name:'Backpack',abbr:'BP',url:'https://backpack.app/'},
  {key:'coinbase',name:'Coinbase Wallet',abbr:'CB',url:'https://www.coinbase.com/wallet'},
  {key:'trust',name:'Trust Wallet',abbr:'TW',url:'https://trustwallet.com/'},
  {key:'okx',name:'OKX Wallet',abbr:'OK',url:'https://www.okx.com/web3'},
  {key:'brave',name:'Brave Wallet',abbr:'BR',url:'https://brave.com/wallet/'},
  {key:'nightly',name:'Nightly',abbr:'NI',url:'https://nightly.app/'},
  {key:'glow',name:'Glow',abbr:'GL',url:'https://glow.app/'}
];

function isMobileBrowser(){return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)}
function isAndroidBrowser(){return /Android/i.test(navigator.userAgent)}
function isInAppBrowserV73(){
  return /WhatsApp|FBAN|FBAV|Instagram|Line\/|Snapchat|Twitter|wv\)|; wv/i.test(navigator.userAgent||'');
}
function injectedSolanaWalletsV73(){
  const found=[];
  for(const p of POPULAR_SOLANA_WALLETS){
    if(p.key==='mwa')continue;
    const provider=directWalletProvider(p.key);
    if(provider)found.push({key:p.key,name:p.name,provider});
  }
  return found;
}
function walletSiteUrlV73(){
  const u=new URL(window.location.origin+window.location.pathname);
  u.searchParams.set('launch','1');
  u.searchParams.set('launchWallet','1');
  return u.toString();
}
async function copyWalletSiteUrlV73(){
  const value=walletSiteUrlV73();
  try{
    await navigator.clipboard.writeText(value);
    toast('SPLIT link copied');
  }catch(e){
    const ta=document.createElement('textarea');
    ta.value=value;document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');toast('SPLIT link copied')}catch(_){}
    ta.remove();
  }
}
function setWalletRuntimeNoteV73(){
  const note=document.getElementById('walletRuntimeV73');
  const manual=document.getElementById('walletManualV73');
  if(!note)return;
  const detected=injectedSolanaWalletsV73();
  note.className='walletRuntimeV73 show';
  if(detected.length){
    note.classList.add('good');
    note.innerHTML='<strong>Wallet detected.</strong> '+detected.map(x=>x.name).join(', ')+' can connect from this browser.';
    if(manual)manual.style.display='none';
    return;
  }
  if(isMobileBrowser()){
    if(isInAppBrowserV73()){
      note.innerHTML='<strong>This in-app browser cannot expose your Solana wallet.</strong> Tap Phantom, Solflare or Backpack below to open SPLIT inside the wallet app.';
    }else{
      note.innerHTML='<strong>Mobile wallet connection uses the wallet app browser.</strong> Tap Phantom, Solflare or Backpack below. Once SPLIT opens inside the wallet, tap Connect again.';
    }
    if(manual)manual.style.display='flex';
    return;
  }
  note.innerHTML='<strong>No Solana wallet extension detected yet.</strong> Enable Phantom, Solflare, Backpack or another Wallet Standard extension for this site, then click its button below.';
  if(manual)manual.style.display='none';
}
function withWalletTimeoutV73(promise,ms=15000){
  let timer;
  return Promise.race([
    promise,
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Wallet did not respond. Reopen the wallet and try again.')),ms)})
  ]).finally(()=>clearTimeout(timer));
}

function openLaunchCreator(){
  const m=document.getElementById('launchModal');
  m.style.display='flex';
  restoreLaunchDraft();
  updateLaunchPreview();
  refreshLaunchServiceConfig();
  initWalletStandard().catch(()=>{});
  const last=Array.isArray(projects)?projects.find(p=>p?.status==='DEPLOYED'&&p?.mintAddress):null;
  if(last)showLaunchResultV57(last);
  setTimeout(()=>document.getElementById('launchName')?.focus(),50);
}
function closeLaunchCreator(){document.getElementById('launchModal').style.display='none'}

function setLaunchError(msg=''){
  const el=document.getElementById('launchError');
  if(el)el.textContent=msg;
}
function solanaAddressLooksValid(v){
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(v||'').trim());
}
function launchPct(id){
  const n=Number(document.getElementById(id)?.value);
  return Number.isFinite(n)?Math.max(0,Math.min(90,n)):0;
}
function updateLaunchPreview(){
  const name=document.getElementById('launchName')?.value.trim()||'Your token';
  const symbol=(document.getElementById('launchSymbol')?.value.trim().toUpperCase()||'TOKEN').slice(0,10);
  const supply=Math.max(0,Number(document.getElementById('launchSupply')?.value)||0);
  const creator=35;
  const treasury=20;
  const liquidity=35;
  const total=100;
  const initialBuy=Math.max(5,Number(document.getElementById('launchInitialBuyUsd')?.value)||5);

  const n=document.getElementById('previewTokenName'); if(n)n.textContent=name;
  const s=document.getElementById('previewTokenSymbol'); if(s)s.textContent='$'+symbol;
  const q=document.getElementById('previewQuote'); if(q)q.textContent='10% of creator revenue';
  const sp=document.getElementById('previewSupply'); if(sp)sp.textContent=supply?Math.floor(supply).toLocaleString():'—';
  const r=document.getElementById('previewRouting'); if(r)r.textContent='35% / 20% / 35%';
  const ib=document.getElementById('previewInitialBuy'); if(ib)ib.textContent='≥ $'+initialBuy.toFixed(2)+' USDC equivalent';
  const t=document.getElementById('feeRouteTotal'); if(t){t.textContent=total+'%';t.style.color=Math.abs(total-100)<.001?'#fff':'#8f8f8f'}
  const bars=[['feeCreatorBar',creator],['feeTreasuryBar',treasury],['feeLiquidityBar',liquidity],['feeProtocolBar',10]];
  bars.forEach(([id,val])=>{const el=document.getElementById(id);if(el)el.style.width=Math.max(0,val)+'%'});

  let msg='';
  if(initialBuy<5)msg='Initial buy must be at least $5 USDC-equivalent.';
  setLaunchError(msg);
}
function readLaunchImage(input,previewId,uploadId,sideId,sideWrapId){
  const file=input?.files?.[0];
  if(!file)return;
  if(file.size>3*1024*1024){input.value='';setLaunchError('Images must be 3 MB or smaller.');return}
  if(!file.type.startsWith('image/')){input.value='';setLaunchError('Choose an image file.');return}
  const reader=new FileReader();
  reader.onload=()=>{
    const data=String(reader.result||'');
    const preview=document.getElementById(previewId);
    const upload=document.getElementById(uploadId);
    const side=document.getElementById(sideId);
    const sideWrap=document.getElementById(sideWrapId);
    if(preview)preview.src=data;
    if(upload)upload.classList.add('hasImage');
    if(side){side.src=data;side.style.display='block'}
    if(sideWrap)sideWrap.classList.add('hasImage');
    if(input.id==='launchImage')launchImageData=data;
    if(input.id==='launchBanner')launchBannerData=data;
    setLaunchError('');
  };
  reader.readAsDataURL(file);
}

async function refreshLaunchServiceConfig(){
  const badge=document.getElementById('launchRuntimeBadge');
  const text=document.getElementById('launchRuntimeText');
  try{
    const res=await fetch('/api/config',{headers:{'accept':'application/json'}});
    if(!res.ok)throw new Error('Config unavailable');
    const data=await res.json();
    launchServiceConfig=data;
    document.querySelectorAll('[data-launch-network-notice]').forEach(el=>{el.textContent=data.network==='solana-mainnet'?'Solana mainnet · wallet approval uses real SOL. Review the costs before signing.':'Solana devnet · test launches only. Devnet tokens have no real monetary value.'});
    const directoryNetwork=document.getElementById('tdNetwork');if(directoryNetwork)directoryNetwork.textContent=data.network==='solana-mainnet'?'Solana mainnet':'Solana devnet';
    const ready=Boolean(data?.launchReady);
    if(badge){
      badge.classList.toggle('ready',ready);
      badge.style.display='inline-flex';
    }
    if(text)text.textContent=ready
      ? (data.network==='solana-mainnet'?'Mainnet':'Devnet')+' launch services ready'
      : 'Launch services need deployment setup';
  }catch(e){
    launchServiceConfig=null;
    if(badge)badge.style.display='inline-flex';
    if(text)text.textContent='Launch services unavailable';
  }
}

/* ---------- wallet chooser + mobile app opening ---------- */
function openLaunchWalletModal(context='launch'){
  walletConnectContext=context||'launch';
  const modal=document.getElementById('walletChooserModal');
  if(modal)modal.style.display='flex';
  const title=document.getElementById('walletChooserTitle');
  const kicker=document.getElementById('walletChooserKicker');
  const intro=document.getElementById('walletChooserIntro');
  if(title)title.textContent=walletConnectContext==='split'
    ? 'Choose your payout wallet.'
    : walletConnectContext==='payment'
      ? 'Choose the wallet you will pay with.'
      : walletConnectContext==='dashboard'
        ? 'Choose your creator wallet.'
        : 'Choose a launch wallet.';
  if(kicker)kicker.textContent=walletConnectContext==='split'
    ? 'SPLIT payout'
    : walletConnectContext==='payment'
      ? 'Participant payment'
      : walletConnectContext==='dashboard'
        ? 'Creator dashboard'
        : 'Solana wallets';
  if(intro)intro.textContent=walletConnectContext==='split'
    ? 'Connect the Solana wallet that should receive this SPLIT. Installed compatible wallets open their normal approval flow.'
    : walletConnectContext==='payment'
      ? 'Connect the Solana wallet you want to use for this payment. The wallet will show the final transaction before signing.'
      : walletConnectContext==='dashboard'
        ? 'Connect the creator wallet. SPLIT will ask you to sign a login message only — no transaction and no fee.'
        : 'Connect the Solana wallet that will sign the token launch. SPLIT never receives your private key.';
  const hint=document.getElementById('walletMobileHint');
  if(hint)hint.style.display=isMobileBrowser()?'block':'none';
  const initialBuyPanel=document.getElementById('launchInitialBuyPanelV72');
  if(initialBuyPanel)initialBuyPanel.style.display=walletConnectContext==='launch'?'block':'none';
  setLaunchError('');

  // Render known/deeplink wallets immediately. A blocked CDN must never leave
  // the chooser empty.
  renderLaunchWalletOptions();
  setWalletRuntimeNoteV73();

  initWalletStandard()
    .then(()=>{
      if(walletStandardRegistry)walletStandardWallets=walletStandardRegistry.get();
      renderLaunchWalletOptions();
      setWalletRuntimeNoteV73();
    })
    .catch(()=>{
      renderLaunchWalletOptions();
      setWalletRuntimeNoteV73();
    });
}
function closeLaunchWalletModal(){
  const modal=document.getElementById('walletChooserModal');
  if(modal)modal.style.display='none';
}
function normalizeWalletName(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function walletNameMatches(wallet,popular){
  const n=normalizeWalletName(wallet?.name);
  const p=normalizeWalletName(popular.name);
  const k=normalizeWalletName(popular.key);
  if(popular.key==='mwa')return n.includes('mobilewalletadapter')||n.includes('solanamobile');
  return n===p||n.includes(k)||p.includes(n);
}
async function registerMobileWalletAdapter(){
  if(mwaRegistered||!isAndroidBrowser()||!window.isSecureContext)return;
  try{
    const mobile=await import('https://cdn.jsdelivr.net/npm/@solana-mobile/wallet-standard-mobile@0.6.0/+esm');
    mobile.registerMwa({
      appIdentity:{
        name:'SPLIT',
        uri:window.location.origin,
        icon:'split-icon.png'
      },
      authorizationCache:mobile.createDefaultAuthorizationCache(),
      chains:['solana:mainnet','solana:devnet'],
      chainSelector:mobile.createDefaultChainSelector(),
      onWalletNotFound:mobile.createDefaultWalletNotFoundHandler()
    });
    mwaRegistered=true;
  }catch(e){
    console.warn('Mobile Wallet Adapter registration failed',e);
  }
}
async function initWalletStandard(){
  if(walletStandardRegistry)return walletStandardRegistry;
  await registerMobileWalletAdapter();
  try{
    const mod=await import('https://cdn.jsdelivr.net/npm/@wallet-standard/app@1.1.1/+esm');
    walletStandardRegistry=mod.getWallets();
    walletStandardWallets=walletStandardRegistry.get();
    walletStandardRegistry.on('register',()=>{
      walletStandardWallets=walletStandardRegistry.get();
      renderLaunchWalletOptions();
    });
    walletStandardRegistry.on('unregister',()=>{
      walletStandardWallets=walletStandardRegistry.get();
      renderLaunchWalletOptions();
    });
    return walletStandardRegistry;
  }catch(e){
    console.warn('Wallet Standard could not be loaded',e);
    walletStandardRegistry=null;
    walletStandardWallets=[];
    return null;
  }
}
function directWalletProvider(key){
  const candidates={
    phantom:()=>window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null),
    solflare:()=>window.solflare || (window.solana?.isSolflare ? window.solana : null),
    backpack:()=>window.backpack?.solana || window.backpack || (window.solana?.isBackpack ? window.solana : null),
    okx:()=>window.okxwallet?.solana || window.okxWallet?.solana,
    trust:()=>window.trustwallet?.solana || window.trustWallet?.solana,
    brave:()=>window.braveSolana || (window.solana?.isBraveWallet ? window.solana : null),
    nightly:()=>window.nightly?.solana || window.nightlySolana,
    glow:()=>window.glowSolana || window.glow?.solana,
    coinbase:()=>window.coinbaseSolana || window.coinbaseWalletExtension?.solana
  };
  try{return candidates[key]?.()||null}catch(e){return null}
}
function walletBrowseLink(key){
  const target=encodeURIComponent(walletSiteUrlV73());
  const ref=encodeURIComponent(window.location.origin);
  if(key==='phantom')return `https://phantom.app/ul/browse/${target}?ref=${ref}`;
  if(key==='solflare')return `https://solflare.com/ul/v1/browse/${target}?ref=${ref}`;
  if(key==='backpack')return `https://backpack.app/ul/v1/browse/${target}?ref=${ref}`;
  return '';
}
function walletOptionMarkup(popular,standardWallet,directProvider){
  const detected=Boolean(standardWallet||directProvider);
  if(popular.key==='mwa'&&!isAndroidBrowser())return '';
  const mobileLink=isMobileBrowser()&&!detected?walletBrowseLink(popular.key):'';
  const cls='walletOption'+(popular.key==='mwa'?' deviceWallet':'');
  if(isMobileBrowser()&&!detected&&!mobileLink&&popular.key!=='mwa')return '';
  if(mobileLink){
    return `<a class="${cls}" data-mobile-link="true" data-wallet-key="${popular.key}" href="${mobileLink}" onclick="saveLaunchDraft();try{sessionStorage.setItem('split_wallet_return','${popular.key}')}catch(e){}">
      <span class="walletIcon">${popular.abbr}</span>
      <span><strong>${popular.name}</strong><small>Open SPLIT inside the wallet app</small></span>
      <span class="walletStatus ready">Open app</span>
    </a>`;
  }
  const desktopMissing=!isMobileBrowser()&&!detected&&popular.key!=='mwa';
  return `<button class="${cls}" type="button" data-wallet-key="${popular.key}">
    <span class="walletIcon">${popular.abbr}</span>
    <span><strong>${popular.name}</strong><small>${detected?'Installed extension detected':popular.key==='mwa'?'Open a compatible installed Android wallet':desktopMissing?'Click to detect the installed extension':'Wallet not detected'}</small></span>
    <span class="walletStatus ${detected||popular.key==='mwa'?'ready':''}">${detected?'Connect':popular.key==='mwa'?'Choose':desktopMissing?'Detect':'Install'}</span>
  </button>`;
}
function renderLaunchWalletOptions(){
  const popularGrid=document.getElementById('walletPopularGrid');
  const otherGrid=document.getElementById('walletInstalledGrid');
  const otherLabel=document.getElementById('walletInstalledLabel');
  if(!popularGrid||!otherGrid)return;

  popularGrid.innerHTML=POPULAR_SOLANA_WALLETS.map(p=>{
    const sw=walletStandardWallets.find(w=>walletNameMatches(w,p));
    return walletOptionMarkup(p,sw,directWalletProvider(p.key));
  }).join('');

  popularGrid.querySelectorAll('[data-wallet-key]').forEach(btn=>{
    btn.addEventListener('click',()=>selectLaunchWallet(btn.dataset.walletKey));
  });

  const matched=new Set();
  POPULAR_SOLANA_WALLETS.forEach(p=>{
    const sw=walletStandardWallets.find(w=>walletNameMatches(w,p));
    if(sw)matched.add(sw);
  });
  const others=walletStandardWallets.filter(w=>!matched.has(w)&&w?.features?.['standard:connect']);
  otherGrid.innerHTML=others.map(w=>`<button class="walletOption" type="button" data-standard-index="${walletStandardWallets.indexOf(w)}">
    <span class="walletIcon">${String(w.name||'W').slice(0,2).toUpperCase()}</span>
    <span><strong>${w.name||'Installed wallet'}</strong><small>Installed · Wallet Standard compatible</small></span>
    <span class="walletStatus ready">Connect</span>
  </button>`).join('');
  otherGrid.querySelectorAll('[data-standard-index]').forEach(btn=>{
    btn.addEventListener('click',()=>connectWalletStandard(walletStandardWallets[Number(btn.dataset.standardIndex)]));
  });
  if(otherLabel)otherLabel.style.display=others.length?'block':'none';
}
async function selectLaunchWallet(key){
  const popular=POPULAR_SOLANA_WALLETS.find(p=>p.key===key);

  // First use Wallet Standard if the installed extension registered itself.
  let standardWallet=walletStandardWallets.find(w=>popular&&walletNameMatches(w,popular));
  if(standardWallet)return connectWalletStandard(standardWallet);

  // Then use the wallet's injected Solana provider. Calling connect() is what
  // opens the installed desktop extension popup.
  let provider=directWalletProvider(key);
  if(provider)return connectDirectSolanaWallet(provider,popular?.name||key);

  if(key==='mwa'){
    await registerMobileWalletAdapter();
    await initWalletStandard();
    const mwa=walletStandardWallets.find(w=>walletNameMatches(w,{key:'mwa',name:'Device Wallet'}));
    if(mwa)return connectWalletStandard(mwa);
    return setLaunchError('No compatible Android device wallet responded.');
  }

  const mobileLink=walletBrowseLink(key);
  if(isMobileBrowser()&&mobileLink){
    saveLaunchDraft();
    window.location.href=mobileLink;
    return;
  }

  // Desktop extensions can inject slightly after page load. Retry discovery
  // before deciding the wallet is unavailable.
  setLaunchError('Looking for '+(popular?.name||'wallet')+' extension...');
  await new Promise(r=>setTimeout(r,650));

  if(walletStandardRegistry){
    walletStandardWallets=walletStandardRegistry.get();
    standardWallet=walletStandardWallets.find(w=>popular&&walletNameMatches(w,popular));
    if(standardWallet)return connectWalletStandard(standardWallet);
  }

  provider=directWalletProvider(key);
  if(provider)return connectDirectSolanaWallet(provider,popular?.name||key);

  // Do not send desktop users straight to a download page. If the extension
  // is already installed but unavailable in this page, tell them what to fix.
  setLaunchError(
    (popular?.name||'This wallet')+
    ' extension was not available to this page. Open the deployed SPLIT site directly in a normal browser tab, make sure the extension is enabled for the site, then click again.'
  );
  renderLaunchWalletOptions();
  setWalletRuntimeNoteV73();
}
async function connectWalletStandard(wallet){
  try{
    if(!wallet?.features?.['standard:connect'])throw new Error('This wallet does not expose Wallet Standard connect.');
    const result=await withWalletTimeoutV73(wallet.features['standard:connect'].connect());
    const account=result?.accounts?.[0]||wallet.accounts?.[0];
    if(!account?.address||!solanaAddressLooksValid(account.address))throw new Error('Wallet did not return a valid Solana account.');
    launchWalletSession={type:'standard',wallet,account,name:wallet.name||'Wallet'};
    launchWalletAddress=account.address;
    finishLaunchWalletConnection();
  }catch(e){
    setLaunchError(e?.message||'Wallet connection was cancelled.');
  }
}
async function connectDirectSolanaWallet(provider,name='Wallet'){
  try{
    const result=await withWalletTimeoutV73(provider.connect());
    const address=String(result?.publicKey||provider.publicKey||'');
    if(!solanaAddressLooksValid(address))throw new Error('Wallet did not return a valid Solana address.');
    launchWalletSession={type:'direct',provider,name};
    launchWalletAddress=address;
    finishLaunchWalletConnection();
  }catch(e){
    setLaunchError(e?.message||'Wallet connection was cancelled.');
  }
}
function finishLaunchWalletConnection(){
  if(walletConnectContext==='split' && typeof window.onSplitWalletConnected==='function'){
    window.onSplitWalletConnected(launchWalletAddress,launchWalletSession?.name||'Wallet');
    closeLaunchWalletModal();
    setLaunchError('');
    return;
  }

  if(walletConnectContext==='payment' && typeof window.onPaymentWalletConnected==='function'){
    window.onPaymentWalletConnected(launchWalletAddress,launchWalletSession?.name||'Wallet');
    closeLaunchWalletModal();
    setLaunchError('');
    return;
  }

  if(walletConnectContext==='dashboard' && typeof window.onDashboardWalletConnected==='function'){
    window.onDashboardWalletConnected(launchWalletAddress,launchWalletSession?.name||'Wallet');
    closeLaunchWalletModal();
    setLaunchError('');
    return;
  }

  const status=document.getElementById('launchWalletStatus');
  if(status){
    status.innerHTML=(launchWalletSession?.name||'Wallet')+' · '+launchWalletAddress.slice(0,5)+'...'+launchWalletAddress.slice(-5)
      +'<div class="connectedWalletName">Connected for Solana launch signing</div>';
  }
  if(launchAuthWalletV72&&launchAuthWalletV72!==launchWalletAddress){launchAuthTokenV72='';launchAuthWalletV72='';launchAuthExpiresV72=0;}
  const creator=document.getElementById('creatorRecipient');
  if(creator)creator.value=launchWalletAddress;
  const btn=document.getElementById('connectLaunchWallet');
  if(btn)btn.textContent='Wallet & first buy';
  closeLaunchWalletModal();
  setLaunchError('');
}
async function connectSolanaLaunchWallet(){openLaunchWalletModal('launch')}

/* ---------- launch config ---------- */
function getLaunchConfig(){
  const initialBuyUsd=Number(document.getElementById('launchInitialBuyUsd')?.value)||0;
  return {
    name:document.getElementById('launchName')?.value.trim()||'',
    symbol:document.getElementById('launchSymbol')?.value.trim().toUpperCase()||'',
    description:document.getElementById('launchDescription')?.value.trim()||'',
    supply:Number(document.getElementById('launchSupply')?.value)||0,
    website:document.getElementById('launchWebsite')?.value.trim()||'',
    x:document.getElementById('launchX')?.value.trim()||'',
    media:{
      imageName:document.getElementById('launchImage')?.files?.[0]?.name||'',
      bannerName:document.getElementById('launchBanner')?.files?.[0]?.name||''
    },
    initialBuyUsd,
    routing:{
      creator:35,treasury:20,liquidity:35,protocol:10,
      creatorRecipient:launchWalletAddress,
      treasuryRecipient:document.getElementById('treasuryRecipient')?.value.trim()||'',
      liquidityManaged:true
    },
    wallet:launchWalletAddress,
    network:'Solana'
  };
}
function validateLaunchConfig(c,{requireWallet=true,requireFiles=true}={}){
  if(!c.name)return 'Add a token name.';
  if(!c.symbol)return 'Add a token ticker.';
  if(!/^[A-Z0-9_]{1,10}$/.test(c.symbol))return 'Ticker must be 1–10 letters or numbers.';
  if(!Number.isFinite(c.supply)||c.supply<=0)return 'Add a valid token supply.';
  if(Math.round(c.supply)!==1000000000)return 'Genesis API launches currently use a fixed 1,000,000,000 token supply.';
  if(requireFiles&&!document.getElementById('launchImage')?.files?.[0])return 'Add a token image.';
  if(!Number.isFinite(c.initialBuyUsd)||c.initialBuyUsd<5)return 'Initial buy must be at least $5 USDC-equivalent.';
  if(c.routing.creator!==35||c.routing.treasury!==20||c.routing.liquidity!==35||c.routing.protocol!==10)return 'Launch routing is fixed at 35% / 20% / 35% / 10%.';
  if(c.routing.creatorRecipient!==c.wallet)return 'Creator recipient must be the connected launch wallet.';
  if(!solanaAddressLooksValid(c.routing.treasuryRecipient))return 'Add a valid project treasury wallet.';
  if(requireWallet&&!solanaAddressLooksValid(c.wallet))return 'Connect a Solana wallet.';
  return '';
}
function saveLaunchDraft(){
  const c=getLaunchConfig();
  const draft={...c,saved:new Date().toISOString()};
  try{localStorage.setItem('split_launch_draft',JSON.stringify(draft))}catch(e){}
  return draft;
}
function restoreLaunchDraft(){
  let d=null;
  try{d=JSON.parse(localStorage.getItem('split_launch_draft')||'null')}catch(e){}
  if(!d)return;
  const set=(id,val)=>{const el=document.getElementById(id);if(el&&val!==undefined&&val!==null&&String(val)!=='')el.value=val};
  set('launchName',d.name);set('launchSymbol',d.symbol);set('launchDescription',d.description);set('launchSupply',d.supply);
  set('launchWebsite',d.website);set('launchX',d.x);
  set('launchInitialBuyUsd',Math.max(5,Number(d.initialBuyUsd)||5));
  set('treasuryRecipient',d.routing?.treasuryRecipient);
}

async function signLaunchAuthMessageV72(message){
  const bytes=new TextEncoder().encode(message);
  if(launchWalletSession?.type==='standard'){
    const feature=launchWalletSession.wallet?.features?.['solana:signMessage'];
    if(!feature?.signMessage)throw new Error('This wallet must support message signing to use the SPLIT launchpad.');
    const result=await feature.signMessage({account:launchWalletSession.account,message:bytes});
    const first=Array.isArray(result)?result[0]:result;
    const sig=first?.signature;
    if(!sig)throw new Error('Wallet did not return an authorization signature.');
    return typeof sig==='string'?sig:await bytesToBase58(sig);
  }
  if(launchWalletSession?.type==='direct'){
    const provider=launchWalletSession.provider;
    if(!provider?.signMessage)throw new Error('This wallet must support message signing to use the SPLIT launchpad.');
    const result=await provider.signMessage(bytes,'utf8');
    const sig=result?.signature||result;
    if(!sig)throw new Error('Wallet did not return an authorization signature.');
    return typeof sig==='string'?sig:await bytesToBase58(sig);
  }
  throw new Error('Connect a Solana wallet first.');
}
async function ensureLaunchAuthV72(){
  if(launchAuthTokenV72&&launchAuthWalletV72===launchWalletAddress&&launchAuthExpiresV72>Date.now()+30000)return launchAuthTokenV72;
  setLaunchError('Authorize SPLIT Launchpad in your wallet. This is a free message signature, not a transaction.');
  const challengeRes=await fetch('/api/creator-auth-challenge',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({family:'solana',wallet:launchWalletAddress})
  });
  const challenge=await challengeRes.json().catch(()=>({}));
  if(!challengeRes.ok||!challenge?.success)throw new Error(challenge?.error||'Could not prepare launch authorization.');
  const signature=await signLaunchAuthMessageV72(challenge.message);
  const verifyRes=await fetch('/api/creator-auth-verify',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({family:'solana',wallet:launchWalletAddress,signature,challengeToken:challenge.challengeToken})
  });
  const verified=await verifyRes.json().catch(()=>({}));
  if(!verifyRes.ok||!verified?.success)throw new Error(verified?.error||'Launch wallet authorization failed.');
  launchAuthTokenV72=verified.sessionToken;
  launchAuthWalletV72=verified.wallet;
  launchAuthExpiresV72=Number(verified.expiresAt||0);
  return launchAuthTokenV72;
}
async function launchPreflightV72(config){
  const token=await ensureLaunchAuthV72();
  setLaunchError('Checking the required initial buy and wallet balance…');
  const res=await fetch('/api/launch-preflight',{
    method:'POST',
    headers:{'content-type':'application/json','authorization':'Bearer '+token},
    body:JSON.stringify({wallet:config.wallet,initialBuyUsd:config.initialBuyUsd})
  });
  const out=await res.json().catch(()=>({}));
  if(!res.ok||!out?.success)throw new Error(out?.error||'Launch preflight failed.');
  const quote=document.getElementById('launchInitialBuyQuoteV72');
  if(quote)quote.textContent=`${out.amountUsd.toFixed(2)} USDC-equivalent ≈ ${Number(out.sol).toFixed(6)} SOL at the current SOL/USD quote. Network/launch costs are additional.`;
  return out;
}

/* ---------- production media + Metaplex launch ---------- */
async function uploadOneLaunchFile(file,kind){
  if(!file)return null;
  const reader=await new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(String(r.result||''));
    r.onerror=()=>reject(new Error('Could not read '+kind+' file.'));
    r.readAsDataURL(file);
  });
  const res=await fetch('/api/upload-media',{
    method:'POST',
    headers:{'content-type':'application/json','authorization':'Bearer '+launchAuthTokenV72},
    body:JSON.stringify({
      dataUrl:reader,
      filename:file.name,
      contentType:file.type,
      kind
    })
  });
  const out=await res.json().catch(()=>({}));
  if(!res.ok||!out?.url)throw new Error(out?.error||('Could not upload '+kind+'.'));
  return out.url;
}
function base64ToBytes(value){
  const raw=atob(value);
  const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
}
async function bytesToBase58(bytes){
  const mod=await import('https://cdn.jsdelivr.net/npm/bs58@6.0.0/+esm');
  const bs58=mod.default||mod;
  return bs58.encode(bytes);
}
async function sendLaunchTransaction(base64Tx,network){
  const bytes=base64ToBytes(base64Tx);

  if(launchWalletSession?.type==='standard'){
    const feature=launchWalletSession.wallet?.features?.['solana:signAndSendTransaction'];
    if(!feature?.signAndSendTransaction)throw new Error('This wallet cannot sign and send Solana transactions.');
    const chain=network==='solana-devnet'?'solana:devnet':'solana:mainnet';
    const result=await feature.signAndSendTransaction({
      transaction:bytes,
      account:launchWalletSession.account,
      chain
    });
    const signature=result?.signature;
    if(!signature)throw new Error('Wallet did not return a transaction signature.');
    return typeof signature==='string'?signature:await bytesToBase58(signature);
  }

  if(launchWalletSession?.type==='direct'){
    const web3=await import('https://cdn.jsdelivr.net/npm/@solana/web3.js@1.99.0/+esm');
    let tx;
    try{tx=web3.VersionedTransaction.deserialize(bytes)}
    catch(e){tx=web3.Transaction.from(bytes)}
    const provider=launchWalletSession.provider;
    if(!provider?.signAndSendTransaction)throw new Error('This wallet cannot sign and send transactions from this browser.');
    const result=await provider.signAndSendTransaction(tx);
    const sig=result?.signature||result;
    return typeof sig==='string'?sig:await bytesToBase58(sig);
  }
  throw new Error('Connect a launch wallet first.');
}
async function waitForSignature(signature,network,timeoutMs=65000){
  const started=Date.now();
  let lastError='';
  while(Date.now()-started<timeoutMs){
    try{
      const res=await fetch('/api/solana-signature-status',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({signature,network})
      });
      const out=await res.json().catch(()=>({}));
      if(res.ok&&out?.failed)throw new Error(out?.error||'A launch transaction failed on-chain.');
      if(res.ok&&out?.confirmed)return true;
      if(!res.ok)lastError=out?.error||'Solana RPC is temporarily unavailable.';
    }catch(error){
      if(String(error?.message||'').includes('failed on-chain'))throw error;
      lastError=error?.message||lastError;
    }
    await new Promise(r=>setTimeout(r,1400));
  }
  throw new Error(lastError||'Transaction confirmation timed out. Check the wallet before retrying.');
}
async function productionLaunch(config){
  await refreshLaunchServiceConfig();
  if(!launchServiceConfig?.launchReady)throw new Error('Launch services are temporarily unavailable. Please try again shortly.');
  
  const preflight=await launchPreflightV72(config);
  const imageFile=document.getElementById('launchImage')?.files?.[0]||null;
  const bannerFile=document.getElementById('launchBanner')?.files?.[0]||null;

  setLaunchError(`Initial buy ready: $${preflight.amountUsd.toFixed(2)} ≈ ${Number(preflight.sol).toFixed(6)} SOL. Uploading token media permanently...`);
  const imageUrl=await uploadOneLaunchFile(imageFile,'token-image');
  const bannerUrl=bannerFile?await uploadOneLaunchFile(bannerFile,'banner'):null;

  setLaunchError('Preparing the token launch...');
  const buildRes=await fetch('/api/create-launch',{
    method:'POST',
    headers:{'content-type':'application/json','authorization':'Bearer '+launchAuthTokenV72},
    body:JSON.stringify({config,imageUrl,bannerUrl})
  });
  const built=await buildRes.json().catch(()=>({}));
  if(!buildRes.ok||!built?.success)throw new Error(built?.error||'Could not prepare the token launch.');

  const allTransactions=[
    ...(Array.isArray(built.routerTransactions)?built.routerTransactions:[]),
    ...(Array.isArray(built.transactions)?built.transactions:[])
  ];
  if(!allTransactions.length)throw new Error('Launch service returned no launch transactions.');

  const signatures=[];
  for(let i=0;i<allTransactions.length;i++){
    const firstBuyText=i===0&&built?.initialBuy?.sol?` · includes ≈ ${Number(built.initialBuy.sol).toFixed(6)} SOL first buy`:'';
    setLaunchError(`Approve launch transaction ${i+1} of ${allTransactions.length}${firstBuyText} in ${launchWalletSession?.name||'your wallet'}...`);
    const sig=await sendLaunchTransaction(allTransactions[i],built.network);
    signatures.push(sig);
    setLaunchError(`Confirming launch transaction ${i+1} of ${allTransactions.length}...`);
    await waitForSignature(sig,built.network);
  }

  setLaunchError('Registering launch...');
  const registerRes=await fetch('/api/register-launch',{
    method:'POST',
    headers:{'content-type':'application/json','authorization':'Bearer '+launchAuthTokenV72},
    body:JSON.stringify({
      genesisAccount:built.genesisAccount,
      creatorWallet:launchWalletAddress,
      launch:built.launch,
      network:built.network,
      routingId:built.routingId||null,
      routingToken:built.routingToken||null,
      mintAddress:built.mintAddress
    })
  });
  const registered=await registerRes.json().catch(()=>({}));
  if(!registerRes.ok||!registered?.success)throw new Error(registered?.error||'Token was created but launch registration failed.');

  return {
    mintAddress:registered?.token?.mintAddress||built.mintAddress,
    signature:signatures[signatures.length-1]||'',
    signatures,
    launchUrl:registered?.launch?.link||'',
    routingId:registered?.routingId||built.routingId||null,
    routingToken:registered?.routingToken||built.routingToken||null,
    bannerUrl,
    imageUrl,
    initialBuy:built.initialBuy||null
  };
}
window.SPLIT_LAUNCH_ADAPTER={launch:productionLaunch};

function showLaunchResultV57(item){
  if(!item?.mintAddress)return;
  latestLaunchResultV57=item;
  const panel=document.getElementById('launchResultV57');
  const name=document.getElementById('launchResultNameV57');
  const mint=document.getElementById('launchResultMintV57');
  const network=document.getElementById('launchResultNetworkV57');
  const open=document.getElementById('openLaunchPageV57');
  const claim=document.getElementById('claimRevenueV57');
  const status=document.getElementById('launchResultStatusV57');
  if(panel)panel.style.display='block';
  if(name)name.textContent=(item.name||'Token')+' · $'+(item.symbol||'TOKEN');
  if(mint)mint.textContent=item.mintAddress;
  if(network)network.textContent=(launchServiceConfig?.network==='solana-mainnet'?'Solana Mainnet':'Solana Devnet');
  if(open){
    open.style.display=item.launchUrl?'inline-flex':'none';
    if(item.launchUrl)open.href=item.launchUrl;
  }
  if(claim)claim.disabled=!item.routingToken;
  if(status)status.textContent=item.routingToken
    ? 'Creator revenue can be claimed and distributed according to this launch\'s routing rules.'
    : 'Revenue routing is unavailable for this saved launch.';
}

async function claimAndDistributeRevenueV57(){
  const item=latestLaunchResultV57;
  const button=document.getElementById('claimRevenueV57');
  const status=document.getElementById('launchResultStatusV57');
  if(!item?.routingToken){if(status)status.textContent='No revenue-routing token is available for this launch.';return}
  button.disabled=true;
  const old=button.textContent;
  button.textContent='Checking fees…';
  if(status)status.textContent='Checking Metaplex creator fees and applying the fixed 35% / 20% / 35% / 10% routing…';
  try{
    const res=await fetch('/api/claim-fees',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({routingToken:item.routingToken})
    });
    const out=await res.json().catch(()=>({}));
    if(!res.ok||!out?.success)throw new Error(out?.error||'Creator revenue could not be distributed.');
    if(out.claimed){
      const sol=(Number(out.claimedLamports||0)/1e9).toLocaleString(undefined,{maximumFractionDigits:9});
      status.textContent='Claimed and distributed '+sol+' SOL from the creator-fee pool. The creator wallet receives its fixed 35% share.';
      button.textContent='Check again';
    }else{
      status.textContent=out.message||'No creator revenue is available to distribute yet.';
      button.textContent='Check again';
    }
  }catch(error){
    if(status)status.textContent=error?.message||'Revenue distribution failed.';
    button.textContent=old;
  }finally{button.disabled=false}
}

async function launchProject(){
  const button=document.getElementById('deployButton');
  setLaunchError('');
  try{
    if(!launchWalletAddress){
      openLaunchWalletModal();
      setLaunchError('Choose a wallet to continue.');
      return;
    }
    const config=getLaunchConfig();
    const err=validateLaunchConfig(config);
    if(err)return setLaunchError(err);

    button.disabled=true;
    button.textContent='Preparing launch...';
    const result=await window.SPLIT_LAUNCH_ADAPTER.launch(config);
    if(!result?.mintAddress)throw new Error('Launch provider did not return a token mint.');

    const item={
      id:(crypto.randomUUID?crypto.randomUUID():String(Date.now())),
      ...config,
      mintAddress:result.mintAddress,
      txHash:result.signature||'',
      signatures:result.signatures||[],
      launchUrl:result.launchUrl||'',
      routingId:result.routingId||'',
      routingToken:result.routingToken||'',
      bannerUrl:result.bannerUrl||'',
      imageUrl:result.imageUrl||'',
      initialBuy:result.initialBuy||null,
      status:'DEPLOYED',
      created:new Date().toISOString()
    };
    if(!Array.isArray(projects))projects=[];
    projects.unshift(item);
    store.set('projects',projects);
    setLaunchError('Token launched successfully.');
    toast('Token launched successfully');
    showLaunchResultV57(item);
    button.disabled=false;
    button.textContent='Launch another token';
  }catch(e){
    console.error(e);
    setLaunchError(e?.message||'Launch failed.');
    button.disabled=false;
    button.textContent='Launch token';
  }
}
document.querySelectorAll('.navlinks a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();scrollToId(a.getAttribute('href').slice(1))}));
document.querySelector('.navactions .navLaunchpadV62')?.addEventListener('click',e=>{e.preventDefault();openLaunchCreator()});



document.addEventListener('click',e=>{if(e.target.id==='launchModal')closeLaunchCreator()});
document.getElementById('launchModal')?.querySelector('#launchSupply')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();launchProject()}});
document.getElementById('claimRevenueV57')?.addEventListener('click',claimAndDistributeRevenueV57);
document.getElementById('copyLaunchMintV57')?.addEventListener('click',async()=>{const mint=latestLaunchResultV57?.mintAddress;if(!mint)return;try{await navigator.clipboard.writeText(mint);toast('Mint copied')}catch{toast('Copy blocked by browser')}});

['launchName','launchSymbol','launchDescription','launchSupply','launchWebsite','launchX','launchInitialBuyUsd','treasuryRecipient']
  .forEach(id=>document.getElementById(id)?.addEventListener('input',updateLaunchPreview));
document.querySelectorAll('input[name="launchQuote"]').forEach(el=>el.addEventListener('change',updateLaunchPreview));
document.getElementById('launchImage')?.addEventListener('change',e=>readLaunchImage(e.target,'launchImagePreview','tokenImageUpload','sideTokenPreview','tokenAvatar'));
document.getElementById('launchBanner')?.addEventListener('change',e=>readLaunchImage(e.target,'launchBannerPreview','tokenBannerUpload','sideBannerPreview','bannerPreviewBox'));

const showcaseTotal=document.getElementById('showcaseCalcTotal');
const showcasePeople=document.getElementById('showcaseCalcPeople');
const previewTotal=document.getElementById('previewTotal');
const previewPeople=document.getElementById('previewPeople');
const showcaseEach=document.getElementById('showcaseCalcEach');
const previewShares=[...document.querySelectorAll('#groupPayShowcase .splitShare')];
const previewCollected=document.getElementById('previewCollected');

const showcaseMoney=n=>'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function setShowcase(total,people){const safeTotal=Math.max(0,Number(total)||0),safePeople=Math.max(2,Math.min(50,Math.floor(Number(people)||2))),each=safeTotal/safePeople;previewTotal.textContent=showcaseMoney(safeTotal);previewPeople.textContent=safePeople;showcaseEach.textContent=showcaseMoney(each);previewShares.forEach((el,i)=>{el.textContent=i<safePeople?showcaseMoney(each):'—'});previewCollected.textContent=showcaseMoney(each*Math.min(3,safePeople))+' USDC · '+Math.min(3,safePeople)+' of '+safePeople+' paid'}
function calculatorChanged(){
  try{
    const count=Number(showcasePeople.value);
    const shares=SPLIT_AMOUNT.equal(showcaseTotal.value,count,6);
    setShowcase(showcaseTotal.value,count);
    showcaseEach.textContent=shares.every(x=>x===shares[0])?'$'+SPLIT_AMOUNT.display(shares[0]):'$'+SPLIT_AMOUNT.display(shares.at(-1))+'–$'+SPLIT_AMOUNT.display(shares[0]);
    previewShares.forEach((el,i)=>{el.textContent=i<count?'$'+SPLIT_AMOUNT.display(shares[i]):'—';el.closest('.participant').hidden=i>=count});
    document.getElementById('previewProgress').style.width=(Math.min(3,count)/count*100)+'%';
    previewCollected.textContent='$'+SPLIT_AMOUNT.display(SPLIT_AMOUNT.decimal(shares.slice(0,Math.min(3,count)).reduce((n,v)=>n+SPLIT_AMOUNT.units(v,6),0n),6))+' USDC · '+Math.min(3,count)+' of '+count+' paid';
    document.querySelector('#groupPayShowcase .calcHint').textContent='Exact shares · any remainder is allocated to the first participants';
  }catch(error){showcaseEach.textContent='—';document.querySelector('#groupPayShowcase .calcHint').textContent=error.message}
}
showcaseTotal?.addEventListener('input',calculatorChanged);showcasePeople?.addEventListener('input',calculatorChanged);
calculatorChanged();
refreshLaunchServiceConfig();
