const scene = document.querySelector('.shoe-scene');
const frames = [];
let visible = true, timer, frame = 0, ready = false;
function rotate() {
  clearInterval(timer);
  const running = ready && visible && !document.hidden && !document.documentElement.classList.contains('motion-reduced');
  scene.dataset.rotating = String(running);
  if (running) timer = setInterval(() => {
    frame = (frame + 1) % frames.length;
    scene.querySelector('#hero-shoe').replaceWith(frames[frame]);
    scene.dataset.frame = String(frame);
  }, 180);
}
async function loadFrames() {
  try {
    await Promise.all(Array.from({length:36}, async (_, i) => {
      const image = new Image();
      image.id = 'hero-shoe';
      image.alt = '';
      image.width = 800; image.height = 600;
      image.src = `/vendor/nb9060-${String(i + 1).padStart(2, '0')}.webp?v=2`;
      await image.decode();
      frames[i] = image;
    }));
    ready = true;
    scene.classList.add('ready');
    rotate();
  } catch {
    // Keep the first photograph if a frame fails; never flash a broken image.
    scene.classList.add('failed');
  }
}
document.addEventListener('visibilitychange', rotate);
window.addEventListener('motion-preference', rotate);
new IntersectionObserver(entries => { visible = entries[0].isIntersecting; rotate(); }).observe(scene);
loadFrames();
