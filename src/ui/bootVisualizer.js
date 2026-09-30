import { BOOT_MEDIA, createBootMediaPlayback } from './bootMediaPlayback.js';

const owners = new WeakMap();
const EMPTY = Object.freeze({ ready: Promise.resolve({ status: 'unavailable' }),
  start() {}, stop() {}, updateProgress() {}, destroy() {}, inspect: () => ({ status: 'unavailable' }) });

/** The SAME owner is acquired by the entry shell and every loading presenter.
 * No live-art/module-import race, no poster over an invisible worker, and no
 * main-thread optical canvas masking an otherwise continuously playing video.
 */
export function getBootVisualizer(document = globalThis.document, options = {}) {
  if (!document?.getElementById || !document?.createElement) return EMPTY;
  if (owners.has(document)) return owners.get(document);
  const overlay = document.getElementById('boot-overlay');
  if (!overlay?.insertBefore) return EMPTY;
  const host = options.host || document.defaultView || globalThis;
  let video = document.getElementById('boot-intro-video');
  if (!video) {
    video = document.createElement('video'); video.id = 'boot-intro-video';
    video.className = 'boot-canvas boot-video';
    overlay.insertBefore(video, overlay.querySelector?.('.boot-scrim') || null);
  }
  if (typeof video.play !== 'function') return EMPTY;
  video.setAttribute('aria-hidden', 'true'); video.setAttribute('muted', '');
  video.setAttribute('playsinline', ''); video.setAttribute('data-boot-native', 'true');
  // Existing title optics remain live; boot optics are already in the media.
  video.__sfSignalRemix?.destroy?.();
  let mediaQuery;
  try { mediaQuery = host.matchMedia?.('(prefers-reduced-motion: reduce)'); } catch {}
  const reduced = () => !!mediaQuery?.matches || !!document.documentElement?.classList?.contains('sf-reduce-motion');
  const quiet = () => !!document.documentElement?.classList?.contains('sf-reduce-flash');
  let disposed = false, wanted = false, pageHidden = false, art = null, artPending = null;
  let clock = null, clockStart = null, progress = { progress: 0 };
  const onScreen = () => !document.hidden && !pageHidden && wanted;
  const loadArtwork = options.loadArtwork || (() => import('./loadingTerminalArt.js'));
  function syncArt() { if (art) { if (onScreen() && !reduced() && media.inspect().status === 'fallback') art.start(); else art.stop(); } }
  function fallback() {
    if (disposed || !wanted || art || artPending || quiet() || reduced()) return;
    // Only a real media failure admits the preserved 2D worker fallback. A
    // network deadline alone does NOT create another competing GL context.
    video.style.visibility = 'hidden'; overlay.classList.remove('boot-video-live');
    artPending = Promise.resolve().then(loadArtwork).then(module => {
      if (disposed || !wanted) return;
      const canvas = module.ensureBootTerminalCanvas(document);
      if (!canvas) return;
      art = module.createTerminalArtwork({ canvas, overlay: null, force2D: true, document });
      art?.updateProgress(progress); syncArt();
    }).catch(error => {
      if (!disposed) {
        video.style.visibility = ''; // at least preserve the authored poster
        overlay.dataset.bootVisualState = 'poster';
        console.warn('[boot] media and live fallback unavailable', error);
      }
    }).finally(() => { artPending = null; });
  }
  const media = createBootMediaPlayback({ video, host, timeoutMs: options.timeoutMs ?? 2500,
    sources: options.sources || BOOT_MEDIA, motionReduced: reduced, flashReduced: quiet,
    hidden: () => !!document.hidden || pageHidden,
    onFallback: fallback,
    onState({ status }) {
      if (disposed) return;
      overlay.dataset.bootVisualState = status;
      if (status !== 'fallback') {
        video.style.visibility = ''; overlay.classList.add('boot-video-live'); art?.stop();
      }
    },
  });
  if (!media) return EMPTY;
  function stopClock() { if (clock !== null) host.clearInterval(clock); clock = null; }
  function refresh() {
    media.refresh(); syncArt();
    if (!onScreen()) { stopClock(); return; }
    if (clock !== null) return;
    const el = overlay.querySelector?.('[data-loading-clock]');
    if (!el) return;
    clockStart ??= host.performance?.now?.() ?? Date.now();
    clock = host.setInterval(() => {
      const t = Math.max(0, ((host.performance?.now?.() ?? Date.now()) - clockStart) / 1000);
      el.textContent = `00:${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor(t * 10) % 10}`;
    }, 250);
  }
  const hidePage = () => { pageHidden = true; refresh(); };
  const showPage = () => { pageHidden = false; refresh(); };
  document.addEventListener?.('visibilitychange', refresh);
  mediaQuery?.addEventListener?.('change', refresh);
  host.addEventListener?.('pagehide', hidePage); host.addEventListener?.('pageshow', showPage);
  let observer = null;
  if (host.MutationObserver && document.documentElement) {
    observer = new host.MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  const ctl = {
    ready: media.ready,
    start() { if (disposed) return media.ready; wanted = true; media.start(); if (media.inspect().failed) fallback(); refresh(); return media.ready; },
    stop() { wanted = false; media.stop(); art?.stop(); stopClock(); },
    updateProgress(stage = {}) { progress = stage; art?.updateProgress(stage); },
    inspect() { return { ...media.inspect(), fallback: !!art, fallbackPending: !!artPending }; },
    destroy() {
      if (disposed) return;
      ctl.stop(); disposed = true; media.destroy(); art?.destroy(); art = null;
      observer?.disconnect(); document.removeEventListener?.('visibilitychange', refresh);
      mediaQuery?.removeEventListener?.('change', refresh);
      host.removeEventListener?.('pagehide', hidePage); host.removeEventListener?.('pageshow', showPage);
      owners.delete(document);
    },
  };
  owners.set(document, ctl);
  return ctl;
}
