
(() => {
  const reveal = () => {
    const els = [...document.querySelectorAll('[data-reveal]')];
    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('revealed'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      });
    }, {threshold: .12});
    els.forEach(el => io.observe(el));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reveal);
  else reveal();
})();
