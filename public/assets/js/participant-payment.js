
(() => {
  const $=id=>document.getElementById(id);
  let inviteToken='';
  let requestData=null;
  let paymentWalletAddress='';
  let paymentWalletName='';
  let pendingPayment=null;
  let checkingPayment=false;

  const shortAddress=v=>{
    const s=String(v||'');
    return s.length>16?s.slice(0,7)+'…'+s.slice(-7):s;
  };

  function showPaymentPage(){
    const app=$('app');
    const creator=$('splitCreatorPage');
    const page=$('splitPayPage');
    const shell=$('homeView');
    const walletModal=$('walletChooserModal');

    if(app)app.style.display='none';
    if(creator)creator.style.display='none';
    if(page)page.style.display='block';

    // Keep the shared wallet chooser usable while the homepage is hidden.
    if(page && walletModal && walletModal.parentElement!==page)page.appendChild(walletModal);
    window.scrollTo({top:0,behavior:'instant'});
  }

  function setPayStatus(message,state=''){
    const node=$('payStatus');
    if(!node)return;
    node.textContent=message||'';
    node.dataset.state=state;
  }

  function recoveryKey(){return 'split-payment-recovery:'+requestData.splitId+':'+requestData.participantId}
  function validReference(record){
    if(!record)return false;
    return requestData.family==='solana'
      ?/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(record.txHash)&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(record.payer)
      :/^0x[a-fA-F0-9]{64}$/.test(record.txHash)&&/^0x[a-fA-F0-9]{40}$/.test(record.payer);
  }
  function rememberPayment(record){
    pendingPayment=record;
    try{localStorage.setItem(recoveryKey(),JSON.stringify(record))}catch{}
    $('payRecovery').open=true;
    $('payRecoveryHash').value=record.txHash;
    $('payRecoveryPayer').value=record.payer;
    $('payConnectBtn').style.display='none';
    $('payNowBtn').style.display='none';
  }
  function forgetPayment(){
    pendingPayment=null;
    try{localStorage.removeItem(recoveryKey())}catch{}
  }
  function showConfirmed(txHash){
    requestData.status='confirmed';forgetPayment();
    $('payRequestState').textContent='Payment confirmed';
    $('payConnectBtn').style.display='none';$('payNowBtn').style.display='none';$('payRecovery').hidden=true;
    setPayStatus(txHash?'Paid. SPLIT verified the exact on-chain payment. Transaction: '+txHash:'This payment has already been confirmed.','success');
  }
  async function checkExistingPayment(record,{persisted=false}={}){
    if(checkingPayment)return;
    checkingPayment=true;$('payRecoveryCheck').disabled=true;
    try{
      if(!persisted){
        const response=await fetch('/api/record-split-payment',{
          method:'POST',headers:{'content-type':'application/json'},keepalive:true,signal:AbortSignal.timeout(25000),
          body:JSON.stringify({token:inviteToken,txHash:record.txHash,payer:record.payer})
        });
        const saved=await response.json().catch(()=>({}));
        if(!response.ok||!saved.success)throw new Error(saved.error||'Payment tracking could not be saved.');
        if(saved.status==='rejected')throw new Error('The transaction did not match this payment. Refresh the link to review its verification result.');
        if(saved.confirmed){showConfirmed(record.txHash);return}
      }
      $('payRequestState').textContent='Payment submitted';
      setPayStatus('Checking the existing transaction. Do not send another payment.','ready');
      const result=await confirmPaymentV57(record.txHash);
      if(result.confirmed)showConfirmed(record.txHash);
      else setPayStatus((result.message||'Payment confirmation is still pending.')+' Your transaction reference is saved below. Do not send another payment.','ready');
    }catch(error){
      setPayStatus((error?.message||'The existing payment could not be checked.')+' Keep the transaction reference below and retry Check existing payment. Do not send again.','error');
    }finally{checkingPayment=false;$('payRecoveryCheck').disabled=false}
  }

  async function loadInvite(){
    const params=new URLSearchParams(location.search);
    inviteToken=params.get('pay')||'';
    if(!inviteToken)return false;

    showPaymentPage();

    try{
      const res=await fetch('/api/verify-split-invite?token='+encodeURIComponent(inviteToken),{
        headers:{accept:'application/json'}
      });
      const out=await res.json().catch(()=>({}));
      if(!res.ok||!out?.success)throw new Error(out?.error||'This payment request is invalid.');

      requestData=out.request;
      $('payRequestState').textContent=requestData.status==='confirmed'?'Payment confirmed':'Payment requested';
      $('payTitle').textContent=requestData.splitName;
      $('payIntro').textContent=(requestData.participantName||'You')+', this is your share of the SPLIT.';
      $('payAmount').textContent=window.SPLIT_AMOUNT.display(requestData.amount);
      if($('payAmount').textContent.length>12)$('payAmount').style.fontSize='clamp(24px,4vw,48px)';
      $('payAsset').textContent=requestData.asset;
      $('payNetwork').textContent=requestData.networkName;
      $('payRecipient').textContent=requestData.payout;
      $('payRecipient').title=requestData.payout;
      $('payParticipant').textContent=requestData.participantName;
      $('payExpiry').textContent=new Date(requestData.expiresAt).toLocaleDateString();

      if(requestData.status==='confirmed'){
        showConfirmed(requestData.txHash);
      }else if(requestData.status==='submitted'){
        $('payConnectBtn').style.display='none';
        $('payNowBtn').style.display='none';
        setPayStatus('Payment submitted. Checking on-chain confirmation…','ready');
        if(requestData.txHash){
          const record={txHash:requestData.txHash,payer:requestData.payer};
          rememberPayment(record);void checkExistingPayment(record,{persisted:true});
        }
      }else{
        if(requestData.status==='rejected'&&requestData.rejectionReason){
          setPayStatus('Previous transaction rejected: '+requestData.rejectionReason+' You can submit a new payment.','error');
        }
        $('payConnectBtn').style.display='block';
        if(requestData.status==='rejected')forgetPayment();
        else{
          let record;
          try{record=JSON.parse(localStorage.getItem(recoveryKey()))}catch{}
          if(validReference(record)){rememberPayment(record);void checkExistingPayment(record)}
        }
      }
    }catch(err){
      $('payRequestState').textContent='Request unavailable';
      $('payTitle').textContent='This link cannot be used.';
      $('payIntro').textContent=err?.message||'The payment request could not be verified.';
      $('payConnectBtn').style.display='none';
      setPayStatus('Ask the organizer to send a new SPLIT link.','error');
    }
    return true;
  }

  async function connectForPayment(){
    if(!requestData)return;
    if(requestData.family==='solana'){
      window.onPaymentWalletConnected=(address,walletName)=>{
        paymentWalletAddress=address;
        paymentWalletName=walletName||'Wallet';
        $('payConnectBtn').textContent=paymentWalletName+' · '+shortAddress(address);
        $('payNowBtn').style.display='block';
        setPayStatus('Wallet connected. Review the amount, then approve the transaction in your wallet.','ready');
      };
      openLaunchWalletModal('payment');
      return;
    }

    try{
      if(!window.ethereum)throw new Error('No EVM wallet extension was detected in this browser.');
      const accounts=await window.ethereum.request({method:'eth_requestAccounts'});
      if(!accounts?.[0])throw new Error('No wallet account was returned.');
      paymentWalletAddress=accounts[0];
      paymentWalletName='EVM wallet';
      $('payConnectBtn').textContent='Wallet · '+shortAddress(paymentWalletAddress);
      $('payNowBtn').style.display='block';
      setPayStatus('Wallet connected. Review the amount, then approve the transaction in your wallet.','ready');
    }catch(err){
      setPayStatus(err?.message||'Wallet connection was cancelled.','error');
    }
  }

  async function confirmPaymentV57(txHash){
    const started=Date.now();
    let lastMessage='Waiting for blockchain confirmation…';
    while(Date.now()-started<75000){
      try{
        const res=await fetch('/api/confirm-split-payment',{
          method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({token:inviteToken,txHash})
        });
        const out=await res.json().catch(()=>({}));
        if(res.ok&&out?.confirmed)return out;
        if(out?.error && !out?.pending)throw new Error(out.error);
        lastMessage=out?.message||lastMessage;
      }catch(error){
        if(String(error?.message||'').toLowerCase().includes('does not match'))throw error;
      }
      setPayStatus(lastMessage);
      await new Promise(r=>setTimeout(r,1800));
    }
    return {confirmed:false,pending:true,message:'Payment was submitted, but final confirmation is still pending.'};
  }

  async function payShare(){
    if(!requestData||!paymentWalletAddress||pendingPayment)return;
    const button=$('payNowBtn');
    button.disabled=true;
    button.textContent='Preparing payment…';
    setPayStatus('Building the exact payment transaction…');

    try{
      const build=await fetch('/api/build-split-payment',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({token:inviteToken,payer:paymentWalletAddress})
      });
      const tx=await build.json().catch(()=>({}));
      if(!build.ok||!tx?.success)throw new Error(tx?.error||'Could not prepare the payment.');

      let txHash='';

      if(tx.family==='solana'){
        setPayStatus('Approve the payment in '+(paymentWalletName||'your wallet')+'…');
        txHash=await sendLaunchTransaction(tx.transaction,tx.network);
      }else{
        if(!window.ethereum)throw new Error('Your EVM wallet is no longer available.');
        const current=await window.ethereum.request({method:'eth_chainId'});
        if(String(current).toLowerCase()!==String(tx.chainId).toLowerCase()){
          await window.ethereum.request({
            method:'wallet_switchEthereumChain',
            params:[{chainId:tx.chainId}]
          });
        }
        setPayStatus('Approve the payment in your wallet…');
        txHash=await window.ethereum.request({
          method:'eth_sendTransaction',
          params:[{
            from:paymentWalletAddress,
            to:tx.to,
            ...(tx.value?{value:tx.value}:{}),
            ...(tx.data?{data:tx.data}:{})
          }]
        });
      }

      setPayStatus('Transaction submitted. Saving the payment reference…');
      const record={txHash,payer:paymentWalletAddress};
      rememberPayment(record);
      await checkExistingPayment(record);
    }catch(err){
      setPayStatus(err?.message||'The payment was not completed.','error');
      if(!pendingPayment&&button.style.display!=='none'){
        button.disabled=false;
        button.textContent='Pay my share';
      }
    }
  }

  $('payConnectBtn')?.addEventListener('click',connectForPayment);
  $('payNowBtn')?.addEventListener('click',payShare);
  $('payRecoveryCheck')?.addEventListener('click',()=>{
    const record={txHash:$('payRecoveryHash').value.trim(),payer:$('payRecoveryPayer').value.trim()};
    if(!requestData||!validReference(record)){setPayStatus('Enter a valid transaction reference and sending wallet address for this network.','error');return}
    rememberPayment(record);void checkExistingPayment(record);
  });
  window.addEventListener('pagehide',()=>{
    if(!pendingPayment||!inviteToken)return;
    // A small keepalive request may finish after navigation. The same reference
    // also remains locally for recovery on the next visit.
    void fetch('/api/record-split-payment',{method:'POST',headers:{'content-type':'application/json'},keepalive:true,body:JSON.stringify({token:inviteToken,...pendingPayment})}).catch(()=>{});
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadInvite);
  else loadInvite();
})();
