
(() => {
  const wantsTokens=()=>{
    const params=new URLSearchParams(location.search);
    return params.get('page')==='tokens';
  };

  function showTokensRoute(){
    const app=document.getElementById('app');
    const creator=document.getElementById('splitCreatorPage');
    const pay=document.getElementById('splitPayPage');
    const tokens=document.getElementById('tokensDirectoryPage');
    if(app)app.style.display='none';
    if(creator)creator.style.display='none';
    if(pay)pay.style.display='none';
    if(tokens)tokens.style.display='block';
    document.title='Tokens launched with SPLIT';
    window.scrollTo({top:0,behavior:'instant'});
  }

  function showMainRoute(){
    const app=document.getElementById('app');
    const tokens=document.getElementById('tokensDirectoryPage');
    if(tokens)tokens.style.display='none';
    if(app)app.style.display='block';
    document.title='SPLIT | Group Payments & Launches';
  }

  function goHomeFromTokens(event){
    if(event)event.preventDefault();
    const url=new URL(location.href);
    url.searchParams.delete('page');
    url.hash='';
    history.pushState({page:'home'},'',url);
    showMainRoute();
    window.scrollTo({top:0,behavior:'instant'});
  }

  function goLaunchpadFromTokens(event){
    if(event)event.preventDefault();
    const url=new URL(location.href);
    url.searchParams.delete('page');
    url.hash='launchpad';
    history.pushState({page:'home'},'',url);
    showMainRoute();
    requestAnimationFrame(()=>{
      document.getElementById('launchpad')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
  }

  function tokensExplorerUrl(item){
    const cluster=item.network==='solana-devnet'?'?cluster=devnet':'';
    return 'https://solscan.io/token/'+encodeURIComponent(item.mintAddress)+cluster;
  }
  function tokensShort(value){
    const s=String(value||'');
    return s.length>16?s.slice(0,7)+'…'+s.slice(-7):s;
  }
  function tokensDate(value){
    try{return new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}
    catch{return '—'}
  }

  let tdLaunches=[];

  function tdCard(item){
    const article=document.createElement('article');
    article.className='tdCoinV55';

    const banner=document.createElement('div');
    banner.className='tdBannerV55';
    if(item.bannerUrl){
      banner.style.backgroundImage=`linear-gradient(to bottom,transparent 35%,rgba(5,5,5,.72)),url("${String(item.bannerUrl).replaceAll('"','%22')}")`;
    }

    const body=document.createElement('div');
    body.className='tdCoinBodyV55';

    const head=document.createElement('div');
    head.className='tdCoinHeadV55';

    let avatar;
    if(item.imageUrl){
      avatar=document.createElement('img');
      avatar.className='tdAvatarV55';
      avatar.src=item.imageUrl;avatar.alt='';avatar.loading='lazy';
    }else{
      avatar=document.createElement('div');
      avatar.className='tdAvatarFallbackV55';
      avatar.textContent=(item.symbol||'?').slice(0,1);
    }

    const title=document.createElement('div');
    title.className='tdCoinTitleV55';
    const small=document.createElement('small');
    small.textContent=tokensDate(item.launchedAt);
    const strong=document.createElement('strong');
    strong.textContent=item.name||'Unnamed token';
    const em=document.createElement('em');
    em.textContent='$'+(item.symbol||'TOKEN');
    strong.appendChild(em);title.append(small,strong);

    const state=document.createElement('span');
    state.className='tdStateV55';
    state.textContent=item.network==='solana-devnet'?'Devnet':'Live';
    head.append(avatar,title,state);

    const desc=document.createElement('p');
    desc.className='tdDescV55';
    desc.textContent=item.description||'Launched through SPLIT.';

    const stats=document.createElement('div');
    stats.className='tdStatsV55';
    const makeStat=(label,value)=>{
      const row=document.createElement('div');
      const a=document.createElement('span');a.textContent=label;
      const b=document.createElement('strong');b.textContent=value;
      row.append(a,b);return row;
    };
    stats.append(
      makeStat('Mint',tokensShort(item.mintAddress)),
      makeStat('SPLIT Protocol','10% of creator revenue'),
      makeStat('Revenue reserve',(item.liquidityPercent??35)+'%'),
      makeStat('Network',item.network==='solana-devnet'?'Solana Devnet':'Solana')
    );

    const actions=document.createElement('div');
    actions.className='tdActionsV55';
    const explorer=document.createElement('a');
    explorer.className='btn primary';
    explorer.href=tokensExplorerUrl(item);
    explorer.target='_blank';explorer.rel='noopener noreferrer';
    explorer.textContent='View on-chain';

    const launch=document.createElement('a');
    launch.className='btn';
    launch.href=item.launchUrl||tokensExplorerUrl(item);
    launch.target='_blank';launch.rel='noopener noreferrer';
    launch.textContent=item.launchUrl?'Open launch':'Mint details';
    actions.append(explorer,launch);

    body.append(head,desc,stats,actions);
    article.append(banner,body);
    return article;
  }

  function tdRender(){
    const grid=document.getElementById('tdGrid');
    const search=document.getElementById('tdSearch');
    const sort=document.getElementById('tdSort');
    const count=document.getElementById('tdCount');
    if(!grid||!search||!sort||!count)return;

    const q=search.value.trim().toLowerCase();
    let filtered=tdLaunches.filter(item=>{
      const hay=[item.name,item.symbol,item.mintAddress,item.description].join(' ').toLowerCase();
      return !q||hay.includes(q);
    });
    if(sort.value==='oldest')filtered.sort((a,b)=>new Date(a.launchedAt)-new Date(b.launchedAt));
    else if(sort.value==='name')filtered.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    else filtered.sort((a,b)=>new Date(b.launchedAt)-new Date(a.launchedAt));

    grid.innerHTML='';
    count.textContent=filtered.length+' launch'+(filtered.length===1?'':'es');

    if(!filtered.length){
      const empty=document.createElement('div');
      empty.className='tdEmptyV55';
      const wrap=document.createElement('div');
      const strong=document.createElement('strong');
      strong.textContent=q?'No matching tokens.':'No SPLIT token launches yet.';
      const span=document.createElement('span');
      span.textContent=q
        ? 'Try another name, ticker or mint address.'
        : 'The first successfully registered token will appear here automatically.';
      wrap.append(strong,span);empty.appendChild(wrap);grid.appendChild(empty);
      return;
    }
    filtered.forEach(item=>grid.appendChild(tdCard(item)));
  }

  async function loadTokensDirectory(){
    try{
      const res=await fetch('/api/public-launches',{headers:{accept:'application/json'}});
      const out=await res.json().catch(()=>({}));
      if(!res.ok||!out?.success)throw new Error(out?.error||'Could not load SPLIT launches.');
      tdLaunches=Array.isArray(out.launches)?out.launches:[];
      tdRender();
    }catch(error){
      const grid=document.getElementById('tdGrid');
      const count=document.getElementById('tdCount');
      if(grid){
        grid.innerHTML='';
        const box=document.createElement('div');
        box.className='tdErrorV55';
        const wrap=document.createElement('div');
        const strong=document.createElement('strong');strong.textContent='Directory unavailable.';
        const span=document.createElement('span');
        span.textContent='The token directory is temporarily unavailable. Please try again shortly.';
        wrap.append(strong,span);box.appendChild(wrap);grid.appendChild(box);
      }
      if(count)count.textContent='Preview mode';
    }
  }

  const nav=document.getElementById('tokensNavLink');
  nav?.addEventListener('click',e=>{
    e.preventDefault();
    const url=new URL(location.href);
    url.searchParams.set('page','tokens');
    history.pushState({page:'tokens'},'',url);
    showTokensRoute();
    loadTokensDirectory();
  });

  document.getElementById('tdSearch')?.addEventListener('input',tdRender);
  document.getElementById('tdSort')?.addEventListener('change',tdRender);
  window.loadSplitTokensDirectory=loadTokensDirectory;
  document.getElementById('tdBackHome')?.addEventListener('click',goHomeFromTokens);
  document.getElementById('tdHomeBrand')?.addEventListener('click',goHomeFromTokens);
  document.getElementById('tdLaunchToken')?.addEventListener('click',goLaunchpadFromTokens);

  window.addEventListener('popstate',()=>{
    if(wantsTokens()){
      showTokensRoute();loadTokensDirectory();
    }else{
      showMainRoute();
    }
  });

  if(wantsTokens()){
    showTokensRoute();
    loadTokensDirectory();
  }
})();
