
(() => {
  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Gentle reveal for major homepage blocks.
  const blocks = [
    ...document.querySelectorAll(
      '.protocolRailV51, .splitShowcase, .participantSection, .universalRail, .trustSection, .cultureV47, .launchV47, .finalCtaV29'
    )
  ];

  if (!prefersReduced && 'IntersectionObserver' in window) {
    blocks.forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(14px)';
      el.style.transition = 'opacity .65s cubic-bezier(.2,.75,.25,1), transform .65s cubic-bezier(.2,.75,.25,1)';
    });

    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        io.unobserve(entry.target);
      });
    }, { threshold:.08 });

    blocks.forEach(el => io.observe(el));
  }

  // Card pointer light.
  document.querySelectorAll('.card, .splitPreview, .splitCalculator, .settlementCard, .trustPanel').forEach(card => {
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX-r.left)/r.width*100)+'%');
      card.style.setProperty('--my', ((e.clientY-r.top)/r.height*100)+'%');
    }, {passive:true});
  });
})();
