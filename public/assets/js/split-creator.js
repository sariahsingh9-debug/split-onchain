
(function(){
  const NETWORKS={
    solana:{name:'Solana',family:'solana',assets:[
      {symbol:'SOL',name:'Solana'},
      {symbol:'USDC',name:'USD Coin'},
      {symbol:'USDT',name:'Tether USD'}
    ]},
    ethereum:{name:'Ethereum',family:'evm',chainId:'0x1',assets:[
      {symbol:'ETH',name:'Ethereum'},
      {symbol:'USDC',name:'USD Coin'},
      {symbol:'USDT',name:'Tether USD'}
    ]},
    base:{name:'Base',family:'evm',chainId:'0x2105',assets:[
      {symbol:'ETH',name:'Ethereum'},
      {symbol:'USDC',name:'USD Coin'}
    ]},
    arbitrum:{name:'Arbitrum',family:'evm',chainId:'0xa4b1',assets:[
      {symbol:'ETH',name:'Ethereum'},
      {symbol:'USDC',name:'USD Coin'}
    ]},
    optimism:{name:'Optimism',family:'evm',chainId:'0xa',assets:[
      {symbol:'ETH',name:'Ethereum'},
      {symbol:'USDC',name:'USD Coin'}
    ]},
    polygon:{name:'Polygon',family:'evm',chainId:'0x89',assets:[
      {symbol:'POL',name:'Polygon'},
      {symbol:'USDC',name:'USD Coin'}
    ]},
    avalanche:{name:'Avalanche',family:'evm',chainId:'0xa86a',assets:[
      {symbol:'AVAX',name:'Avalanche'},
      {symbol:'USDC',name:'USD Coin'},
      {symbol:'USDT',name:'Tether USD'}
    ]},
    bnb:{name:'BNB Chain',family:'evm',chainId:'0x38',assets:[
      {symbol:'BNB',name:'BNB'},
      {symbol:'USDT',name:'Tether USD'}
    ]}
  };

  const el=id=>document.getElementById(id);
  let selectedNetwork='solana';
  let selectedAsset='USDC';
  let networkLocked=true;
  let assetLocked=true;
  let payoutMode='connect';
  let creatorWallet='';
  let deliveryMode='link';
  let emailReady=false;
  let paymentCreationReady=false;
  let createSplitRequestId='';

  function updateCreatorProgress(step){
    document.querySelectorAll('.sc-progressV48 span').forEach((node,index)=>{
      node.classList.toggle('active',index<step);
      node.classList.toggle('current',index===step-1);
    });
  }

  function net(){return NETWORKS[selectedNetwork]}
  function asset(){return net().assets.find(a=>a.symbol===selectedAsset)||net().assets[0]}
  function fmt(v){return Number(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:6})}
  function emailLooksValid(v){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
  }

  function participantRows(){
    return [...document.querySelectorAll('#scPeople .sc-person')].map(row=>({
      name:row.querySelector('.sc-person-name')?.value.trim()||'',
      email:row.querySelector('.sc-person-email')?.value.trim().toLowerCase()||''
    }));
  }

  function newClientRequestId(){
    if(window.crypto?.randomUUID)return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
      const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);
      return v.toString(16);
    });
  }
  function resetCreateSplitRequestId(){createSplitRequestId='';}


  function showCreator(){
    const home=el('app');
    const creator=el('splitCreatorPage');
    const shell=el('homeView');
    const walletModal=el('walletChooserModal');
    if(shell && walletModal && walletModal.parentElement!==shell) shell.appendChild(walletModal);
    if(home) home.style.display='none';
    if(creator) creator.style.display='block';
    renderRecentSplits();refreshCreationConfig();
    window.scrollTo({top:0,behavior:'instant'});
    history.replaceState(null,'','#splitCreator');
  }

  function showHome(){
    const home=el('app');
    const creator=el('splitCreatorPage');
    if(creator) creator.style.display='none';
    if(home) home.style.display='block';
    history.replaceState(null,'',location.pathname+location.search);
    window.scrollTo({top:0,behavior:'instant'});
  }

  window.showSplitCreator=showCreator;
  window.showSplitHome=showHome;

  document.querySelectorAll('[data-open-split-creator="true"], a[href="#splitCreator"]').forEach(a=>{
    a.addEventListener('click',e=>{e.preventDefault();showCreator()});
  });
  el('scBackHome').addEventListener('click',showHome);

  function renderNetworks(){
    const box=el('scNetworkGrid');
    box.innerHTML='';
    if(networkLocked){
      box.className='sc-selection-row';
      const n=net();
      const chosen=document.createElement('button');
      chosen.type='button';
      chosen.className='sc-option selected';
      chosen.disabled=true;
      chosen.innerHTML='<strong>'+n.name+'</strong><span>'+(n.family==='solana'?'Solana ecosystem':'EVM network')+'</span>';
      const change=document.createElement('button');
      change.type='button';
      change.className='sc-reselect';
      change.textContent='Change network';
      change.onclick=()=>{
        networkLocked=false;
        assetLocked=false;
        renderNetworks();
        renderAssets();
      };
      box.append(chosen,change);
      el('scNetworkHelp').textContent='Selected. Change the network if your group uses a different wallet.';
      return;
    }

    box.className='sc-network-grid';
    Object.entries(NETWORKS).forEach(([key,n])=>{
      const b=document.createElement('button');
      b.type='button';
      b.className='sc-option'+(key===selectedNetwork?' selected':'');
      b.innerHTML='<strong>'+n.name+'</strong><span>'+(n.family==='solana'?'Solana ecosystem':'EVM network')+'</span>';
      b.onclick=()=>{
        selectedNetwork=key;
        selectedAsset=NETWORKS[key].assets.some(a=>a.symbol==='USDC')?'USDC':NETWORKS[key].assets[0].symbol;
        networkLocked=true;
        assetLocked=false;
        creatorWallet='';
        el('scWalletText').textContent='Not connected';
        el('scManualAddress').value='';
        renderNetworks();
        renderAssets();
        updateAddressUI();
        calculate();
        resetCreateSplitRequestId();
        updateCreatorProgress(2);
      };
      box.appendChild(b);
    });
  }

  function renderAssets(){
    const box=el('scAssetGrid');
    box.innerHTML='';
    if(assetLocked){
      box.className='sc-selection-row';
      const a=asset();
      const chosen=document.createElement('button');
      chosen.type='button';
      chosen.className='sc-option selected';
      chosen.disabled=true;
      chosen.innerHTML='<strong>'+a.symbol+'</strong><span>'+a.name+'</span>';
      const change=document.createElement('button');
      change.type='button';
      change.className='sc-reselect';
      change.textContent='Change asset';
      change.onclick=()=>{assetLocked=false;renderAssets()};
      box.append(chosen,change);
      el('scAssetHelp').textContent='Selected for '+net().name+'.';
      return;
    }

    box.className='sc-asset-grid';
    net().assets.forEach(a=>{
      const b=document.createElement('button');
      b.type='button';
      b.className='sc-option'+(a.symbol===selectedAsset?' selected':'');
      b.innerHTML='<strong>'+a.symbol+'</strong><span>'+a.name+'</span>';
      b.onclick=()=>{
        selectedAsset=a.symbol;
        assetLocked=true;
        renderAssets();
        calculate();
        resetCreateSplitRequestId();
        updateCreatorProgress(3);
      };
      box.appendChild(b);
    });
    el('scAssetHelp').textContent='Select one asset to continue.';
  }

  function setMode(mode){
    payoutMode=mode;
    el('scModeConnect').classList.toggle('selected',mode==='connect');
    el('scModeManual').classList.toggle('selected',mode==='manual');
    el('scConnectBox').style.display=mode==='connect'?'block':'none';
    el('scManualBox').style.display=mode==='manual'?'block':'none';
    updateRecipient();
  }

  function validAddress(v){
    v=(v||'').trim();
    if(net().family==='solana') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
    return /^0x[a-fA-F0-9]{40}$/.test(v);
  }

  function recipient(){return payoutMode==='connect'?creatorWallet:el('scManualAddress').value.trim()}

  function updateAddressUI(){
    const isSol=net().family==='solana';
    el('scManualLabel').textContent=isSol?'Receiving Solana address':'Receiving EVM address';
    el('scManualAddress').placeholder=isSol?'Solana wallet address':'0x…';
    el('scWalletStatus').textContent='Connect a '+net().name+' compatible wallet.';
    updateRecipient();
  }

  function updateRecipient(){
    const r=recipient();
    el('scSumRecipient').textContent=validAddress(r)?r.slice(0,8)+'…'+r.slice(-6):(payoutMode==='manual'?'Enter address':'Connect wallet');
  }

  function calculate(){
    const people=[...document.querySelectorAll('#scPeople .sc-person')],count=people.length,sym=asset().symbol;
    const decimals=sym==='SOL'?9:['ETH','POL','AVAX','BNB'].includes(sym)||selectedNetwork==='bnb'?18:6;
    let shares=[];
    try{shares=SPLIT_AMOUNT.equal(el('scTotal').value,count,decimals)}catch{}
    const format=v=>SPLIT_AMOUNT.display(v)+' '+sym;
    el('scNetworkBadge').textContent=net().name;el('scAssetBadge').textContent=sym;
    el('scSumTotal').textContent=shares.length?format(SPLIT_AMOUNT.decimal(SPLIT_AMOUNT.units(el('scTotal').value,decimals),decimals)):'—';el('scSumPeople').textContent=count;
    const each=shares.length?(shares.every(x=>x===shares[0])?format(shares[0]):format(shares.at(-1))+' – '+format(shares[0])):'—';
    el('scSumEach').textContent=each;el('scParticipantAmount').textContent=shares.length?format(shares[0]):'—';
    people.forEach((row,i)=>{row.querySelector('.sc-person-share').value=shares[i]?format(shares[i]):'—';row.querySelector('.sc-person-name').setAttribute('aria-label','Participant '+(i+1)+' name');row.querySelector('.sc-person-email').setAttribute('aria-label','Participant '+(i+1)+' email');row.querySelector('.sc-person-share').setAttribute('aria-label','Participant '+(i+1)+' share');row.querySelector('.sc-remove').disabled=count<=2});
    el('scAddPerson').disabled=count>=50;
    updateRecipient();
  }

  function setDelivery(mode){
    deliveryMode=mode;resetCreateSplitRequestId();
    el('splitCreatorPage').dataset.delivery=mode;
    el('scModeLink').classList.toggle('selected',mode==='link');el('scModeEmail').classList.toggle('selected',mode==='email');
    el('scDeliveryNote').textContent=mode==='link'?'Create a unique payment link for each person. Copy the links and share them in your group chat. No email address is required.':'Each person receives their own payment link by email. Delivery status appears after creation.';
    calculate();
  }
  async function refreshCreationConfig(){
    try{
      const res=await fetch('/api/config',{signal:AbortSignal.timeout(8000)});if(!res.ok)throw new Error();const cfg=await res.json();
      emailReady=Boolean(cfg.emailReady);paymentCreationReady=Boolean(cfg.paymentCreationReady);
      el('scModeEmail').disabled=!emailReady;
      el('scModeEmail').title=emailReady?'Send payment links by email':'Email invitations are unavailable; share links instead.';
      el('scAvailability').textContent=paymentCreationReady?'Payments go directly to your receiving wallet. Review the network and exact shares before creating.':'Live payment creation is paused while payment records are secured. You can explore the form and calculator.';
    }catch{paymentCreationReady=false;el('scAvailability').textContent='Payment availability could not be checked. Please try again shortly.'}
    el('scCreateSplit').disabled=!paymentCreationReady;
  }

  function addPerson(name='',email=''){
    const row=document.createElement('div');
    row.className='sc-person';

    const nameInput=document.createElement('input');
    nameInput.className='sc-person-name';
    nameInput.placeholder='Participant name';
    nameInput.autocomplete='name';
    nameInput.value=name;

    const emailInput=document.createElement('input');
    emailInput.className='sc-person-email';
    emailInput.type='email';
    emailInput.placeholder='name@example.com';
    emailInput.autocomplete='email';
    emailInput.value=email;

    const share=document.createElement('input');
    share.className='sc-person-share';
    share.readOnly=true;
    share.tabIndex=-1;

    const remove=document.createElement('button');
    remove.type='button';
    remove.className='sc-remove';
    remove.setAttribute('aria-label','Remove participant');
    remove.textContent='×';
    remove.onclick=()=>{resetCreateSplitRequestId();row.remove();calculate()};

    [nameInput,emailInput].forEach(input=>input.addEventListener('input',()=>{resetCreateSplitRequestId();updateCreatorProgress(4)}));
    row.append(nameInput,emailInput,share,remove);
    el('scPeople').appendChild(row);
    calculate();
  }

  async function connectWallet(){
    const n=net();
    try{
      if(n.family==='solana'){
        window.onSplitWalletConnected=(address,walletName)=>{
          creatorWallet=address;
          el('scWalletText').textContent=(walletName||'Wallet')+' · '+address.slice(0,6)+'…'+address.slice(-6);
          el('scWalletStatus').textContent='Connected on Solana. This wallet will receive the SPLIT.';
          updateRecipient();
        };
        openLaunchWalletModal('split');
        return;
      }

      if(!window.ethereum) throw new Error('No EVM wallet detected. You can use Enter address instead.');
      const chain=await ethereum.request({method:'eth_chainId'});
      if(chain.toLowerCase()!==n.chainId.toLowerCase()){
        try{
          await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:n.chainId}]});
        }catch{
          throw new Error('Switch your wallet to '+n.name+' and try again.');
        }
      }
      const accounts=await ethereum.request({method:'eth_requestAccounts'});
      creatorWallet=accounts[0];
      el('scWalletText').textContent='Wallet · '+creatorWallet.slice(0,6)+'…'+creatorWallet.slice(-4);
      el('scWalletStatus').textContent='Connected on '+n.name+'. This wallet will receive the SPLIT.';
      updateRecipient();
    }catch(err){
      el('scWalletStatus').textContent=err.message||'Wallet connection was not completed.';
    }
  }

  el('scModeConnect').addEventListener('click',()=>setMode('connect'));
  el('scModeManual').addEventListener('click',()=>setMode('manual'));
  el('scManualAddress').addEventListener('input',()=>{
    resetCreateSplitRequestId();
    const ok=validAddress(el('scManualAddress').value);
    el('scManualStatus').textContent=ok?'Valid '+net().name+' address format.':'Enter a valid '+net().name+' address.';
    updateRecipient();
  });
  el('scConnectBtn').addEventListener('click',connectWallet);
  el('scSplitName').addEventListener('input',()=>{resetCreateSplitRequestId();updateCreatorProgress(4)});
  el('scTotal').addEventListener('input',()=>{resetCreateSplitRequestId();calculate();updateCreatorProgress(4)});
  el('scAddPerson').addEventListener('click',()=>{addPerson();updateCreatorProgress(4)});

  let latestCreatedSplit=null;
  let sessionSplits=[];

  function storedSplits(){
    try{
      const parsed=JSON.parse(localStorage.getItem('split_splits')||'[]');
      if(Array.isArray(parsed) && parsed.length) return parsed;
    }catch{}
    return sessionSplits;
  }

  function renderRecentSplits(){
    const host=el('scRecentSplits');
    if(!host)return;
    host.innerHTML='';
    const items=storedSplits().slice(0,4);
    if(!items.length){
      const empty=document.createElement('div');
      empty.className='sc-recent-empty';
      empty.textContent='Your created SPLITs will appear here.';
      host.appendChild(empty);
      return;
    }
    items.forEach(item=>{
      const row=document.createElement('div');
      row.className='sc-recent-row';

      const left=document.createElement('div');
      const title=document.createElement('strong');
      title.textContent=item.name||'Untitled SPLIT';
      const meta=document.createElement('span');
      const paid=(item.invites||[]).filter(x=>x.status==='confirmed'||x.status==='submitted').length;
      const totalPeople=item.people?.length||item.invites?.length||0;
      meta.textContent=totalPeople+' invited · '+paid+' payment'+(paid===1?'':'s')+' submitted · '+(item.networkName||item.network||'Network');
      left.append(title,meta);

      const amount=document.createElement('b');
      amount.textContent=fmt(item.total||0)+' '+(item.asset||'');
      row.append(left,amount);
      host.appendChild(row);
    });
  }

  function renderInviteDelivery(record){
    const host=el('scInviteDeliveryList');
    if(!host)return;
    host.innerHTML='';
    (record.invites||[]).forEach(invite=>{
      const row=document.createElement('div');
      row.className='sc-inviteDeliveryRowV52';

      const who=document.createElement('div');
      const name=document.createElement('strong');
      name.textContent=invite.name||'Participant';
      const email=document.createElement('span');
      email.textContent=invite.email||'';
      who.append(name,email);

      const status=document.createElement('b');
      const paymentState=invite.status==='confirmed'?'Paid':invite.status==='submitted'?'Submitted':invite.status==='rejected'?'Pending':'Pending';
      const emailState=invite.emailStatus==='delivered'
        ? 'Delivered'
        : invite.emailStatus==='bounced'
          ? 'Bounced'
          : invite.emailStatus==='complained'
            ? 'Complaint'
            : invite.emailSent
              ? 'Email accepted'
              : record.deliveryMode==='link'?'Link ready':'Email failed';
      status.textContent=paymentState+' · '+emailState;
      status.dataset.state=invite.status==='confirmed'?'confirmed':invite.emailStatus==='delivered'?'delivered':invite.status||'pending';

      const copy=document.createElement('button');
      copy.type='button';
      copy.className='sc-btn';
      copy.textContent='Copy link';
      copy.onclick=async()=>{
        try{
          await navigator.clipboard.writeText(invite.url);
          copy.textContent='Copied';
          setTimeout(()=>copy.textContent='Copy link',1200);
        }catch{
          el('scCreateStatus').textContent='Copy is blocked in this browser.';
        }
      };

      const resend=document.createElement('button');
      resend.type='button';
      resend.className='sc-btn';
      resend.textContent=invite.emailSent?'Resend':'Retry email';
      resend.onclick=async()=>{
        if(!latestCreatedSplit?.adminToken){
          el('scCreateStatus').textContent='This SPLIT does not have an organizer token.';
          return;
        }
        const previous=resend.textContent;
        resend.disabled=true;
        resend.textContent='Sending…';
        try{
          const response=await fetch('/api/resend-split-invite',{
            method:'POST',
            headers:{'content-type':'application/json'},
            body:JSON.stringify({adminToken:latestCreatedSplit.adminToken,participantId:invite.id})
          });
          const out=await response.json().catch(()=>({}));
          if(!response.ok||!out?.success)throw new Error(out?.error||'Email could not be resent.');
          invite.emailSent=true;
          invite.emailStatus='accepted';
          invite.emailId=out.emailId||invite.emailId||'';
          status.textContent=(invite.status==='confirmed'?'Paid':invite.status==='submitted'?'Submitted':'Pending')+' · Email accepted';
          status.dataset.state=invite.status==='confirmed'?'confirmed':'accepted';
          resend.textContent='Sent';
          el('scCreateStatus').textContent='Invitation sent to '+invite.email+'.';
          setTimeout(()=>{resend.textContent='Resend'},1400);
          try{localStorage.setItem('split_splits',JSON.stringify(sessionSplits))}catch{}
        }catch(error){
          el('scCreateStatus').textContent=error?.message||'Email could not be resent.';
          resend.textContent=previous;
        }finally{
          resend.disabled=false;
        }
      };

      const link=document.createElement('input');link.className='sc-link';link.readOnly=true;link.value=invite.url||'';link.setAttribute('aria-label','Payment link for '+invite.name);link.addEventListener('focus',()=>link.select());
      if(!record.emailReady||!invite.email)resend.hidden=true;
      row.append(who,status,resend,copy,link);
      host.appendChild(row);
    });
  }

  function showCreatedSplit(record){
    latestCreatedSplit=record;
    el('scSuccessPanel').style.display='grid';
    el('scSuccessName').textContent=record.name;
    const sent=(record.invites||[]).filter(x=>x.emailSent).length;
    el('scSuccessMeta').textContent=(record.deliveryMode==='link'?record.people.length+' participant links ready':sent+' of '+record.people.length+' invitations emailed')+' · '+record.asset+' on '+record.networkName;
    renderInviteDelivery(record);
    renderRecentSplits();
    el('scSuccessPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  el('scCreateSplit').addEventListener('click',async()=>{
    const button=el('scCreateSplit');
    const name=el('scSplitName').value.trim();
    const totalRaw=el('scTotal').value.trim();
    const total=Number(totalRaw)||0;
    const people=participantRows();
    const r=recipient();

    if(!name){el('scCreateStatus').textContent='Add a name for the SPLIT.';return}
    if(total<=0){el('scCreateStatus').textContent='Enter a positive total amount.';return}
    if(people.length<2){el('scCreateStatus').textContent='Add at least 2 participants.';return}

    const missingName=people.findIndex(x=>!x.name);
    if(missingName!==-1){
      el('scCreateStatus').textContent='Add a name for participant '+(missingName+1)+'.';
      return;
    }

    const badEmail=people.findIndex(x=>(deliveryMode==='email'||x.email)&&!emailLooksValid(x.email));
    if(badEmail!==-1){
      el('scCreateStatus').textContent='Add a valid email address for '+people[badEmail].name+'.';
      return;
    }

    const emails=people.map(x=>x.email).filter(Boolean);
    if(new Set(emails).size!==emails.length){
      el('scCreateStatus').textContent='Each participant needs a different email address.';
      return;
    }

    if(!validAddress(r)){
      el('scCreateStatus').textContent=payoutMode==='connect'?'Connect your payout wallet first.':'Enter a valid payout address first.';
      return;
    }

    if(!paymentCreationReady){el('scCreateStatus').textContent='Live payment creation is temporarily paused.';return}
    const each=total/people.length;
    button.disabled=true;
    button.textContent='Creating…';
    el('scCreateStatus').textContent=deliveryMode==='email'?'Creating payment links and sending invitations…':'Creating secure participant payment links…';

    try{
      const response=await fetch('/api/create-split-invites',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          name,
          deliveryMode,
          total:totalRaw,
          participants:people,
          network:selectedNetwork,
          networkName:net().name,
          asset:asset().symbol,
          payout:r,
          clientRequestId:createSplitRequestId||(createSplitRequestId=newClientRequestId())
        })
      });
      const out=await response.json().catch(()=>({}));

      if(!response.ok || !out?.success){
        throw new Error(out?.error||'SPLIT invitations could not be created.');
      }

      const record={
        id:out.splitId,
        name,total,people,each,
        network:selectedNetwork,
        networkName:net().name,
        asset:asset().symbol,
        payout:r,
        invites:out.invites||[],
        adminToken:out.adminToken||'',
        storageEnabled:Boolean(out.storageEnabled),
        deliveryMode:out.deliveryMode||deliveryMode,
        emailReady:Boolean(out.emailReady),
        createdAt:new Date().toISOString()
      };

      const existing=storedSplits();
      sessionSplits=[record,...existing.filter(x=>x?.id!==record.id)].slice(0,50);

      try{localStorage.setItem('split_splits',JSON.stringify(sessionSplits))}catch{}

      const sent=record.invites.filter(x=>x.emailSent).length;
      el('scCreateStatus').textContent=record.deliveryMode==='link'?'SPLIT created. Copy and share each participant link below.':sent===record.people.length
        ? 'SPLIT created. All '+sent+' payment invitations were emailed.'
        : 'SPLIT created. '+sent+' of '+record.people.length+' emails were sent — copy any failed links below.';
      showCreatedSplit(record);
      createSplitRequestId='';
    }catch(err){
      el('scCreateStatus').textContent=err?.message||'Could not create the SPLIT.';
    }finally{
      button.disabled=!paymentCreationReady;
      button.textContent='Create SPLIT';
    }
  });

  el('scCopySummary').addEventListener('click',async()=>{
    if(!latestCreatedSplit)return;
    const s=latestCreatedSplit;
    const exactShares=(s.invites||[]).map(i=>String(i.amount||''));
    const uniqueShares=[...new Set(exactShares.filter(Boolean))];
    const shareLine=uniqueShares.length===1
      ? 'Each pays: '+uniqueShares[0]+' '+s.asset
      : 'Shares: calculated exactly per participant';
    const text=[
      'SPLIT — '+s.name,
      'Total: '+fmt(s.total)+' '+s.asset,
      'Participants: '+s.people.length,
      shareLine,
      'Network: '+s.networkName,
      'Recipient: '+s.payout,
      'Participants: '+(s.people||[]).map(p=>p.name+(p.email?' <'+p.email+'>':'')).join(', ')
    ].join('\n');
    try{
      await navigator.clipboard.writeText(text);
      el('scCopySummary').textContent='Copied';
      setTimeout(()=>el('scCopySummary').textContent='Copy summary',1400);
    }catch{
      el('scCreateStatus').textContent='Copy is blocked in this browser. Your SPLIT is still saved.';
    }
  });

  el('scRefreshInviteStatus').addEventListener('click',async()=>{
    if(!latestCreatedSplit?.adminToken){
      el('scCreateStatus').textContent='Server-side status tracking is not available for this SPLIT.';
      return;
    }
    const btn=el('scRefreshInviteStatus');
    const old=btn.textContent;
    btn.disabled=true;btn.textContent='Checking…';
    try{
      const res=await fetch('/api/split-status?token='+encodeURIComponent(latestCreatedSplit.adminToken));
      const out=await res.json().catch(()=>({}));
      if(!res.ok||!out?.success)throw new Error(out?.error||'Could not refresh status.');
      latestCreatedSplit.invites=(latestCreatedSplit.invites||[]).map(inv=>{
        const fresh=(out.participants||[]).find(x=>x.id===inv.id);
        return fresh?{...inv,status:fresh.status,txHash:fresh.txHash||inv.txHash||'',emailStatus:fresh.emailStatus||inv.emailStatus||'',emailSent:Boolean(fresh.emailSent)}:inv;
      });
      sessionSplits=[latestCreatedSplit,...storedSplits().filter(x=>x.id!==latestCreatedSplit.id)].slice(0,50);
      try{localStorage.setItem('split_splits',JSON.stringify(sessionSplits))}catch{}
      renderInviteDelivery(latestCreatedSplit);
      renderRecentSplits();
      el('scCreateStatus').textContent='Payment status refreshed.';
    }catch(err){
      el('scCreateStatus').textContent=err?.message||'Could not refresh payment status.';
    }finally{
      btn.disabled=false;btn.textContent=old;
    }
  });

  el('scModeLink').addEventListener('click',()=>setDelivery('link'));
  el('scModeEmail').addEventListener('click',()=>setDelivery('email'));
  ['','','',''].forEach(()=>addPerson());
  renderNetworks();
  renderAssets();
  setMode('connect');
  updateAddressUI();
  calculate();
  updateCreatorProgress(1);
  renderRecentSplits();

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && el('splitCreatorPage')?.style.display==='block') showHome();
  });

  setDelivery('link');refreshCreationConfig();
  if(location.hash==='#splitCreator') showCreator();
})();
