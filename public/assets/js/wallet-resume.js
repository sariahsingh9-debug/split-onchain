
/* v73 — resume mobile wallet connection after wallet-app deeplink */
(function(){
  async function resume(){
    try{
      const u=new URL(window.location.href);
      if(u.searchParams.get('launchWallet')!=='1')return;

      if(typeof openLaunchCreator==='function')openLaunchCreator();

      // Remove resume flags so refreshing the page does not keep reopening dialogs.
      u.searchParams.delete('launchWallet');
      u.searchParams.delete('launch');
      history.replaceState({},'',u.pathname+(u.searchParams.toString()?'?'+u.searchParams.toString():'')+u.hash);

      setTimeout(()=>{
        if(typeof openLaunchWalletModal==='function')openLaunchWalletModal('launch');
      },220);
    }catch(e){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',resume,{once:true});
  else resume();
})();
