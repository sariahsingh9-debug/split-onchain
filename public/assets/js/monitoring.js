(()=>{
  let count=0;const reported=new Set();
  function report(kind){
    if(count>=3||reported.has(kind))return;count++;reported.add(kind);
    fetch('/api/client-error',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind}),keepalive:true}).catch(()=>{});
  }
  addEventListener('error',event=>{
    if(event.target?.tagName==='SCRIPT'||event.target?.tagName==='LINK')report('asset-load');
    else if(event.filename&&new URL(event.filename,location.origin).origin===location.origin)report('runtime');
  },true);
  addEventListener('unhandledrejection',event=>{
    const error=event.reason;const message=String(error?.message||'');
    if(error?.code===4001||error?.code==='ACTION_REJECTED'||/user rejected|user denied|cancelled|canceled/i.test(message))return;
    report('unhandled-rejection');
  });
})();
