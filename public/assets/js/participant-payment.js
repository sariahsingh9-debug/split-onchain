
(() => {
  const $=id=>document.getElementById(id);
  let inviteToken='';
  let requestData=null;
  let paymentWalletAddress='';
  let paymentWalletName='';

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
      $('payAmount').textContent=Number(requestData.amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:6});
      $('payAsset').textContent=requestData.asset;
      $('payNetwork').textContent=requestData.networkName;
      $('payRecipient').textContent=shortAddress(requestData.payout);
      $('payRecipient').title=requestData.payout;
      $('payParticipant').textContent=requestData.participantName;
      $('payExpiry').textContent=new Date(requestData.expiresAt).toLocaleDateString();

      if(requestData.status==='confirmed'){
        $('payConnectBtn').style.display='none';
        $('payNowBtn').style.display='none';
        setPayStatus('This payment has already been confirmed.','success');
      }else if(requestData.status==='submitted'){
        $('payConnectBtn').style.display='none';
        $('payNowBtn').style.display='none';
        setPayStatus('Payment submitted. Checking on-chain confirmation…','ready');
        if(requestData.txHash){
          confirmPaymentV57(requestData.txHash).then(result=>{
            if(result?.confirmed){
              requestData.status='confirmed';
              $('payRequestState').textContent='Payment confirmed';
              setPayStatus('Paid. SPLIT verified the exact on-chain payment. Transaction: '+shortAddress(requestData.txHash),'success');
            }else{
              setPayStatus(result?.message||'Payment is still confirming on-chain.','ready');
            }
          }).catch(error=>setPayStatus(error?.message||'Could not refresh payment confirmation.','error'));
        }
      }else{
        if(requestData.status==='rejected'&&requestData.rejectionReason){
          setPayStatus('Previous transaction rejected: '+requestData.rejectionReason+' You can submit a new payment.','error');
        }
        $('payConnectBtn').style.display='block';
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
    if(!requestData||!paymentWalletAddress)return;
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
      const save=await fetch('/api/record-split-payment',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({token:inviteToken,txHash,payer:paymentWalletAddress})
      });
      const saved=await save.json().catch(()=>({}));
      if(!save.ok||!saved?.success)throw new Error(saved?.error||'The transaction was sent, but SPLIT could not save its reference.');

      $('payRequestState').textContent='Payment submitted';
      $('payConnectBtn').style.display='none';
      button.style.display='none';
      setPayStatus('Transaction submitted. Verifying the exact recipient, asset and amount on-chain…');

      const confirmation=await confirmPaymentV57(txHash);
      if(confirmation.confirmed){
        $('payRequestState').textContent='Payment confirmed';
        setPayStatus('Paid. SPLIT verified the exact on-chain payment. Transaction: '+shortAddress(txHash),'success');
      }else{
        setPayStatus((confirmation.message||'Payment confirmation is still pending.')+' Transaction: '+shortAddress(txHash),'ready');
      }
    }catch(err){
      setPayStatus(err?.message||'The payment was not completed.','error');
      if(button.style.display!=='none'){
        button.disabled=false;
        button.textContent='Pay my share';
      }
    }
  }

  $('payConnectBtn')?.addEventListener('click',connectForPayment);
  $('payNowBtn')?.addEventListener('click',payShare);

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadInvite);
  else loadInvite();
})();
