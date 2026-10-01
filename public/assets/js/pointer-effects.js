
(() => {
  const root=document.querySelector('.root');
  if(root && matchMedia('(pointer:fine)').matches){
    window.addEventListener('pointermove',e=>{
      root.style.setProperty('--spot-x',e.clientX+'px');
      root.style.setProperty('--spot-y',e.clientY+'px');
    },{passive:true});
  }

  const links=[...document.querySelectorAll('.navlinks a[href^="#"]')];
  const sections=links.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if('IntersectionObserver' in window && sections.length){
    const navObserver=new IntersectionObserver(entries=>{
      const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if(!visible)return;
      links.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+visible.target.id));
    },{rootMargin:'-30% 0px -58% 0px',threshold:[0,.15,.35,.6]});
    sections.forEach(s=>navObserver.observe(s));
  }
})();
