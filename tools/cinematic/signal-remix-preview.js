// Real sources side by side; no mock movie or substitute models in this review.
import { attachIntroSignalRemix, SIGNAL_REMIX } from '../../src/ui/introSignalRemix.js';
import { installIntroSignalRemix } from '../../src/ui/introSignalRemixBoot.js';
import { createSignalTableaux } from '../../src/ui/loadingSignalTableaux.js';
import { createIntroGLEngine, createIntro2DEngine, INTRO_GL_SOURCES } from '../../src/ui/loadingTerminalArt.js';
const params = new URLSearchParams(location.search);
if (params.has('capture')) document.documentElement.classList.add('capture');
if (params.has('art')) document.documentElement.classList.add('art-only');
const video = document.querySelector('video');
let legacy = document.querySelector('#legacy');
const managed = params.has('managed');
const manager = managed ? installIntroSignalRemix(document) : null;
let remix = null, engine = null, tableaux = null, loop = null, view = 'remix', held = false;
const errors = [];
window.__remixProof = { ready: false, errors };
function stopLegacy() {
  if (loop != null) cancelAnimationFrame(loop); loop = null;
  engine?.receive({ type:'destroy' }); engine = null; tableaux?.dispose(); tableaux = null;
  // A canvas cannot switch between WebGL and 2D contexts. Replace this DEV
  // comparison surface when switching, never the production movie/canvas.
  const fresh = document.createElement('canvas'); fresh.id = 'legacy'; legacy.replaceWith(fresh); legacy = fresh;
}
async function seek(seconds) {
  video.pause(); remix?.pause();
  if (Math.abs(video.currentTime - seconds) < .001 && video.readyState >= 2) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Video seek timed out')); }, 10000);
    const cleanup = () => { clearTimeout(timeout); video.removeEventListener('seeked', done); video.removeEventListener('error', bad); };
    const done = () => {
      cleanup();
      if (Math.abs(video.currentTime - seconds) > .1) reject(new Error(`Seek landed at ${video.currentTime}, expected ${seconds}. Use signal-remix-server.py (HTTP byte ranges).`));
      else resolve();
    }, bad = () => { cleanup(); reject(new Error('Movie unavailable')); };
    video.addEventListener('seeked', done); video.addEventListener('error', bad); video.currentTime = seconds;
  });
}
function setView(next) {
  stopLegacy(); view = next;
  remix?.pause(); if (remix) remix.canvas.style.display = 'none';
  video.style.visibility = next === 'terminal' || next === 'tableaux' ? 'hidden' : 'visible';
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === next));
  const w = Math.min(1280, innerWidth), h = Math.round(w * innerHeight / innerWidth);
  legacy.width = w; legacy.height = h;
  if (next === 'remix') {
    remix ||= attachIntroSignalRemix(video, { onError: error => errors.push(error.message) }); if (!held) remix?.resume();
    video.playbackRate = SIGNAL_REMIX.sourceSeconds / SIGNAL_REMIX.loopSeconds;
  } else if (next === 'original') video.playbackRate = 1;
  else if (next === 'terminal') {
    legacy.style.display = 'block';
    engine = createIntroGLEngine({ document, sources: INTRO_GL_SOURCES, engine2D: createIntro2DEngine,
      raf: requestAnimationFrame.bind(window), cancel: cancelAnimationFrame.bind(window), post() {} });
    engine.receive({ type:'init', canvas: legacy, width: w, height: h, reducedMotion: false });
  } else {
    legacy.style.display = 'block'; tableaux = createSignalTableaux({ document, quick:true });
    const ctx = legacy.getContext('2d');
    const tick = ts => { const art = tableaux.render({ time:ts/1000+41, width:w, height:h }); ctx.drawImage(art,0,0,w,h); loop=requestAnimationFrame(tick); };
    loop = requestAnimationFrame(tick);
  }
  if (!held && (next === 'remix' || next === 'original')) video.play().catch(e => errors.push(e.message));
  else video.pause();
}
for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => setView(button.dataset.view);
document.querySelector('#hold').onclick = () => {
  held = !held;
  if (held) { video.pause(); remix?.pause(); if (loop != null) cancelAnimationFrame(loop); engine?.receive({type:'stop'}); }
  else setView(view);
};
video.addEventListener('error', () => errors.push('The shipped intro movie could not be loaded.'));
await new Promise(resolve => { if (video.readyState >= 2) resolve(); else video.addEventListener('loadeddata', resolve, {once:true}); });
if (!managed) setView('remix');
else await video.play().catch(() => {});
window.__remixProof = {
  ready: true, errors, manager, video,
  get controller() { return remix || video.__sfSignalRemix; },
  async frame(time, mode = 'remix', sourceTime = (time * 32 / 18) % 32) {
    held = true; setView(mode); await seek(sourceTime);
    if (mode === 'remix') {
      // A bounded warm-up gives deterministic phosphor exposure on still grabs.
      for (let i=0;i<12;i++) remix.renderAt(Math.max(0,time-(11-i)/30),sourceTime,1/30);
    } else if (mode === 'tableaux') {
      if (loop != null) cancelAnimationFrame(loop); loop=null;
      legacy.getContext('2d').drawImage(tableaux.render({time:time+41,width:legacy.width,height:legacy.height}),0,0,legacy.width,legacy.height);
    } else if (mode === 'terminal') engine.receive({type:'lab',t:time+8,freeze:true,clear:true});
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    return { view, sourceTime:video.currentTime, status:remix?.inspect() };
  },
  play() { held=false; setView(view); },
  destroy() { stopLegacy(); remix?.destroy(); manager?.destroy(); video.pause(); },
};
