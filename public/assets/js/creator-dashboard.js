
(() => {
  const d=id=>document.getElementById(id);
  const isDashboardRoute=()=>new URLSearchParams(location.search).get('page')==='dashboard';
  const short=v=>{const s=String(v||'');return s.length>18?s.slice(0,8)+'…'+s.slice(-7):s};
  let dashboardSession='';
  let dashboardWallet='';
  let dashboardFamily='';

  function hideProductViews(){
    ['app','splitCreatorPage','splitPayPage','tokensDirectoryPage'].forEach(id=>{
      const node=d(id);if(node)node.style.display='none';
    });
  }
  function showDashboardRoute(){
    hideProductViews();
    const page=d('creatorDashboardPage');if(page)page.style.display='block';
    const modal=d('walletChooserModal');
    if(page&&modal&&modal.parentElement!==page)page.appendChild(modal);
    document.title='SPLIT Creator Dashboard';
    window.scrollTo({top:0,behavior:'instant'});
    restoreDashboardSession();
  }
  function dashboardGoHome(e){
    e?.preventDefault();
    const url=new URL(location.href);url.searchParams.delete('page');url.hash='';
    history.pushState({page:'home'},'',url);
    d('creatorDashboardPage').style.display='none';
    d('app').style.display='block';
    document.title='SPLIT | Group Payments & Launches';
    window.scrollTo({top:0,behavior:'instant'});
  }
  function dashboardGoTokens(e){
    e?.preventDefault();
    const url=new URL(location.href);url.searchParams.set('page','tokens');url.hash='';
    history.pushState({page:'tokens'},'',url);
    d('creatorDashboardPage').style.display='none';
    d('app').style.display='none';
    d('tokensDirectoryPage').style.display='block';
    document.title='Tokens launched with SPLIT';
    if(typeof window.loadSplitTokensDirectory==='function')window.loadSplitTokensDirectory();
    window.scrollTo({top:0,behavior:'instant'});
  }

  async function getChallenge(family,wallet){
    const res=await fetch('/api/creator-auth-challenge',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({family,wallet})
    });
    const out=await res.json().catch(()=>({}));
    if(!res.ok||!out?.success)throw new Error(out?.error||'Could not create wallet login challenge.');
    return out;
  }

  async function signSolanaMessage(message){
    const bytes=new TextEncoder().encode(message);
    if(launchWalletSession?.type==='standard'){
      const feature=launchWalletSession.wallet?.features?.['solana:signMessage'];
      if(!feature?.signMessage)throw new Error('This wallet does not support message signing.');
      const result=await feature.signMessage({account:launchWalletSession.account,message:bytes});
      const first=Array.isArray(result)?result[0]:result;
      const sig=first?.signature;
      if(!sig)throw new Error('Wallet did not return a login signature.');
      return typeof sig==='string'?sig:await bytesToBase58(sig);
    }
    if(launchWalletSession?.type==='direct'){
      const provider=launchWalletSession.provider;
      if(!provider?.signMessage)throw new Error('This wallet does not support message signing.');
      const result=await provider.signMessage(bytes,'utf8');
      const sig=result?.signature||result;
      if(!sig)throw new Error('Wallet did not return a login signature.');
      return typeof sig==='string'?sig:await bytesToBase58(sig);
    }
    throw new Error('Connect a Solana wallet first.');
  }

  async function finishDashboardLogin(family,wallet,signature,challengeToken){
    const res=await fetch('/api/creator-auth-verify',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({family,wallet,signature,challengeToken})
    });
    const out=await res.json().catch(()=>({}));
    if(!res.ok||!out?.success)throw new Error(out?.error||'Wallet login could not be verified.');
    dashboardSession=out.sessionToken;
    dashboardWallet=out.wallet;
    dashboardFamily=out.family;
    try{localStorage.setItem('split_creator_session',JSON.stringify({token:dashboardSession,wallet:dashboardWallet,family:dashboardFamily,expiresAt:out.expiresAt}))}catch{}
    await loadDashboard();
  }

  async function loginSolana(wallet){
    const status=d('cdAuthStatus');
    try{
      status.textContent='Preparing a secure login message…';
      const challenge=await getChallenge('solana',wallet);
      status.textContent='Sign the login message in your wallet. This does not send a transaction.';
      const signature=await signSolanaMessage(challenge.message);
      status.textContent='Verifying wallet ownership…';
      await finishDashboardLogin('solana',wallet,signature,challenge.challengeToken);
    }catch(error){status.textContent=error?.message||'Wallet login failed.'}
  }

  async function loginEvm(){
    const status=d('cdAuthStatus');
    try{
      if(!window.ethereum)throw new Error('No EVM wallet extension was detected.');
      status.textContent='Connecting EVM wallet…';
      const accounts=await window.ethereum.request({method:'eth_requestAccounts'});
      const wallet=accounts?.[0];
      if(!wallet)throw new Error('Wallet did not return an account.');
      const challenge=await getChallenge('evm',wallet);
      status.textContent='Sign the login message in your wallet. No transaction or gas fee is involved.';
      const signature=await window.ethereum.request({method:'personal_sign',params:[challenge.message,wallet]});
      await finishDashboardLogin('evm',wallet,signature,challenge.challengeToken);
    }catch(error){status.textContent=error?.message||'Wallet login failed.'}
  }

  function collectedText(groups){
    const entries=Object.entries(groups||{}).filter(([,v])=>Number(v)>0);
    if(!entries.length)return '0';
    if(entries.length===1)return entries[0][1]+' '+entries[0][0];
    return entries.slice(0,2).map(([asset,value])=>value+' '+asset).join(' + ')+(entries.length>2?' +…':'');
  }

  function rowEmpty(text){
    const e=document.createElement('div');e.className='cdEmptyV62';e.textContent=text;return e;
  }

  function renderDashboard(data){
    d('cdAuthCard').style.display='none';
    d('cdConsole').style.display='block';
    d('cdWalletLabel').textContent=(dashboardFamily==='solana'?'Solana':'EVM')+' · '+short(dashboardWallet);
    d('cdCollected').textContent=collectedText(data.summary?.collectedByAsset);
    d('cdCollectedDetail').textContent=(data.summary?.paidPeople||0)+' confirmed payment'+((data.summary?.paidPeople||0)===1?'':'s');
    d('cdPending').textContent=String(data.summary?.pendingPeople||0);
    d('cdTokens').textContent=String(data.summary?.tokensLaunched||0);
    d('cdRevenue').textContent=(data.summary?.creatorRevenueSol||'0')+' SOL';
    d('cdSplitCount').textContent=String(data.splits?.length||0);
    d('cdTokenCount').textContent=String(data.tokens?.length||0);

    const splits=d('cdSplitList');splits.innerHTML='';
    if(!data.splits?.length)splits.appendChild(rowEmpty('No SPLITs found for this wallet yet.'));
    (data.splits||[]).forEach(item=>{
      const row=document.createElement('div');row.className='cdRowV62';
      const left=document.createElement('div');
      const title=document.createElement('strong');title.textContent=item.name;
      const meta=document.createElement('p');
      meta.textContent=item.networkName+' · '+item.asset+' · '+item.paidCount+'/'+item.participantCount+' paid';
      left.append(title,meta);
      const right=document.createElement('div');
      const amount=document.createElement('b');amount.textContent=item.collected+' / '+item.total+' '+item.asset;
      const state=document.createElement('em');state.textContent=item.pendingCount+' pending · '+item.submittedCount+' confirming';
      right.append(amount,state);row.append(left,right);splits.appendChild(row);
    });

    const tokens=d('cdTokenList');tokens.innerHTML='';
    if(!data.tokens?.length)tokens.appendChild(rowEmpty('No registered SPLIT token launches found for this wallet.'));
    (data.tokens||[]).forEach(item=>{
      const row=document.createElement('div');row.className='cdRowV62';
      const left=document.createElement('div');
      const title=document.createElement('strong');title.textContent=(item.name||'Token')+' $'+(item.symbol||'');
      const meta=document.createElement('p');meta.textContent=short(item.mintAddress)+' · '+(item.network==='solana-mainnet'?'Mainnet':'Devnet');
      left.append(title,meta);
      const right=document.createElement('div');
      const amount=document.createElement('b');amount.textContent=(item.creatorRevenueSol||'0')+' SOL creator fees';
      const state=document.createElement('em');state.textContent=new Date(item.launchedAt).toLocaleDateString();
      const actions=document.createElement('div');actions.className='cdRowButtonsV62';
      const chain=document.createElement('a');chain.className='btn';chain.target='_blank';chain.rel='noopener noreferrer';chain.textContent='On-chain';
      chain.href='https://solscan.io/token/'+encodeURIComponent(item.mintAddress)+(item.network==='solana-devnet'?'?cluster=devnet':'');
      const claim=document.createElement('button');claim.type='button';claim.className='btn';claim.textContent='Claim fees';
      claim.onclick=async()=>{
        claim.disabled=true;const old=claim.textContent;claim.textContent='Checking…';
        try{
          const res=await fetch('/api/creator-claim-revenue',{
            method:'POST',
            headers:{'content-type':'application/json','authorization':'Bearer '+dashboardSession},
            body:JSON.stringify({mintAddress:item.mintAddress})
          });
          const out=await res.json().catch(()=>({}));
          if(!res.ok||!out?.success)throw new Error(out?.error||'Creator revenue could not be distributed.');
          claim.textContent=out.claimed?'Distributed':'Nothing available';
          setTimeout(()=>loadDashboard(),900);
        }catch(error){
          claim.textContent='Retry';
          d('cdSystemState').querySelector('span').textContent=error?.message||'Revenue distribution failed.';
        }finally{claim.disabled=false;if(claim.textContent==='Checking…')claim.textContent=old}
      };
      actions.append(chain,claim);right.append(amount,state,actions);row.append(left,right);tokens.appendChild(row);
    });

    const activity=d('cdActivityList');activity.innerHTML='';
    if(!data.activity?.length)activity.appendChild(rowEmpty('Creator activity will appear here.'));
    (data.activity||[]).forEach(item=>{
      const row=document.createElement('div');row.className='cdActivityRowV62';
      const time=document.createElement('time');time.textContent=new Date(item.at).toLocaleDateString();
      const title=document.createElement('strong');title.textContent=item.title;
      const detail=document.createElement('span');detail.textContent=item.detail||'';
      row.append(time,title,detail);activity.appendChild(row);
    });
  }

  async function loadSystemHealth(){
    const box=d('cdSystemState');if(!box)return;
    try{
      const res=await fetch('/api/health',{headers:{accept:'application/json'}});
      const out=await res.json().catch(()=>({}));
      const ready=Boolean(out?.splitReady&&out?.storageReady!==false);
      box.classList.toggle('ready',ready);
      const services=out?.services||{};
      const missing=[];
      if(!services.storage)missing.push('storage');
      if(!services.email)missing.push('verified email');
      if(!services.paymentSolana)missing.push('Solana RPC');
      box.querySelector('span').textContent=ready
        ? 'Group payments, persistent storage and email are online.'
        : 'Setup required: '+(missing.join(', ')||'one or more deployment services')+'.';
    }catch{
      box.classList.remove('ready');box.querySelector('span').textContent='Could not read deployment health.';
    }
  }

  async function loadDashboard(){
    if(!dashboardSession)return;
    d('cdAuthStatus').textContent='Loading creator records…';
    try{
      const res=await fetch('/api/creator-dashboard',{headers:{accept:'application/json','authorization':'Bearer '+dashboardSession}});
      const out=await res.json().catch(()=>({}));
      if(res.status===401)throw new Error('Creator session expired. Connect your wallet again.');
      if(!res.ok||!out?.success)throw new Error(out?.error||'Dashboard could not be loaded.');
      renderDashboard(out);
      loadSystemHealth();
    }catch(error){
      d('cdAuthCard').style.display='block';d('cdConsole').style.display='none';
      d('cdAuthStatus').textContent=error?.message||'Dashboard could not be loaded.';
      if(String(error?.message||'').toLowerCase().includes('expired'))logoutDashboard();
    }
  }

  function restoreDashboardSession(){
    let saved=null;try{saved=JSON.parse(localStorage.getItem('split_creator_session')||'null')}catch{}
    if(saved?.token&&saved?.wallet&&Number(saved?.expiresAt)>Date.now()){
      dashboardSession=saved.token;dashboardWallet=saved.wallet;dashboardFamily=saved.family||'solana';
      loadDashboard();
    }else{
      d('cdAuthCard').style.display='block';d('cdConsole').style.display='none';
    }
  }
  function logoutDashboard(){
    dashboardSession='';dashboardWallet='';dashboardFamily='';
    try{localStorage.removeItem('split_creator_session')}catch{}
    d('cdAuthCard').style.display='block';d('cdConsole').style.display='none';d('cdAuthStatus').textContent='';
  }

  d('dashboardNavLink')?.addEventListener('click',e=>{
    e.preventDefault();const url=new URL(location.href);url.searchParams.set('page','dashboard');url.hash='';
    history.pushState({page:'dashboard'},'',url);showDashboardRoute();
  });
  d('cdHomeBrand')?.addEventListener('click',dashboardGoHome);
  d('cdBackHome')?.addEventListener('click',dashboardGoHome);
  d('cdTokensLink')?.addEventListener('click',dashboardGoTokens);
  d('cdRefresh')?.addEventListener('click',loadDashboard);
  d('cdLogout')?.addEventListener('click',logoutDashboard);
  d('cdConnectSolana')?.addEventListener('click',()=>{
    window.onDashboardWalletConnected=(wallet)=>loginSolana(wallet);
    openLaunchWalletModal('dashboard');
  });
  d('cdConnectEvm')?.addEventListener('click',loginEvm);

  window.addEventListener('popstate',()=>{
    if(isDashboardRoute())showDashboardRoute();
    else if(d('creatorDashboardPage')?.style.display==='block')d('creatorDashboardPage').style.display='none';
  });

  let dashboardRefreshTimer=null;
  function scheduleDashboardRefresh(){
    clearInterval(dashboardRefreshTimer);
    dashboardRefreshTimer=setInterval(()=>{
      if(isDashboardRoute()&&dashboardSession&&document.visibilityState==='visible')loadDashboard();
    },15000);
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'&&isDashboardRoute()&&dashboardSession)loadDashboard();
  });

  if(isDashboardRoute())showDashboardRoute();
  scheduleDashboardRefresh();

  window.openSplitDashboard=showDashboardRoute;
})();
