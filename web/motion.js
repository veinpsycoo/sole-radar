'use strict';
(() => {
  const button = document.getElementById('motion-toggle');
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let context, lenis, tick, manual = null;
  try { const saved = localStorage.getItem('sole-reduced-motion'); if(saved !== null) manual = saved === 'true'; } catch {}
  function setup() {
    context?.revert();
    if (tick && window.gsap) gsap.ticker.remove(tick);
    lenis?.destroy(); lenis = null;
    const reduced = manual === null ? preference.matches : manual;
    document.documentElement.classList.toggle('motion-reduced', reduced);
    window.dispatchEvent(new Event('motion-preference'));
    button.setAttribute('aria-pressed', String(reduced));
    button.setAttribute('aria-label', reduced ? 'Ayakkabıyı döndür ve hareketleri aç' : 'Dönüşü ve hareketleri durdur');
    button.querySelector('span').textContent = reduced ? '▷' : 'Ⅱ';
    button.querySelector('b').textContent = reduced ? 'Döndür' : 'Durdur';
    if (!window.gsap || !window.ScrollTrigger || reduced) return;
    gsap.registerPlugin(ScrollTrigger);
    const desktop = matchMedia('(min-width: 900px)').matches;
    if (desktop && window.Lenis) {
      lenis = new Lenis({anchors:true, smoothWheel:true, syncTouch:false, respectReducedMotion:true});
      lenis.on('scroll', ScrollTrigger.update);
      tick = time => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }
    context = gsap.context(() => {
      gsap.from('#intro-title, .intro .lead, .intro-tags, .summary', {y:24,opacity:0,duration:.6,stagger:.06,ease:'power3.out',scrollTrigger:{trigger:'.intro',start:'top 85%',once:true}});
      gsap.from('.catalog-heading', {y:24,opacity:0,duration:.6,ease:'power3.out',scrollTrigger:{trigger:'.catalog-heading',start:'top 90%',once:true}});
      gsap.to('.scroll-meter', {scaleX:1,transformOrigin:'left',ease:'none',scrollTrigger:{start:0,end:'max',scrub:true}});
    });
  }
  button.addEventListener('click', () => {
    manual = !document.documentElement.classList.contains('motion-reduced');
    try { localStorage.setItem('sole-reduced-motion', String(manual)); } catch {}
    setup();
  });
  preference.addEventListener('change',setup);
  matchMedia('(min-width: 900px)').addEventListener('change',setup);
  window.addEventListener('catalog-ready',()=>{window.ScrollTrigger?.refresh();lenis?.resize();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)lenis?.stop();else lenis?.start();});
  setup();
})();
