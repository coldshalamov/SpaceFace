/** Optional live decoration for title and legacy video hosts.
 * Native boot media already contains these optics. It MUST stay out of this
 * main-thread renderer, or a frozen canvas masks an otherwise playing movie.
 */
import { attachIntroSignalRemix } from './introSignalRemix.js';
const installed = new WeakMap();
const selector = '#boot-intro-video:not([data-boot-native]), #cinematic-splash .cine-video';

export function installIntroSignalRemix(document = globalThis.document, env = globalThis) {
  if (!document?.querySelectorAll || !document.body || typeof env.MutationObserver !== 'function') return null;
  if (installed.has(document)) return installed.get(document);
  const entries = new Map();
  let disposed = false;
  let motionQuery = null;
  try { motionQuery = env.matchMedia?.('(prefers-reduced-motion: reduce)'); } catch {}
  const motion = () => !!motionQuery?.matches || document.documentElement?.classList.contains('sf-reduce-motion');
  const flash = () => !!document.documentElement?.classList.contains('sf-reduce-flash');
  function visible(entry) {
    const root = entry.root;
    if (!entry.video.isConnected || document.hidden || root.hidden || root.classList.contains('hidden')
        || root.classList.contains('is-closing')) return false;
    try { const s = env.getComputedStyle?.(root); if (s && (s.display === 'none' || s.visibility === 'hidden')) return false; } catch {}
    return true;
  }
  function cancelInit(entry) {
    if (entry.idle == null) return;
    if (entry.idleAPI) env.cancelIdleCallback?.(entry.idle);
    else env.cancelAnimationFrame?.(entry.idle);
    entry.idle = null;
  }
  function reconcile(entry) {
    if (disposed || entry.dead) return;
    if (entry.video.hasAttribute?.('data-boot-native')) { remove(entry); return; }
    if (!entry.video.isConnected) { remove(entry); return; }
    const show = visible(entry), reduced = motion();
    // The existing video controllers own play/pause. We only pause a movie
    // for visibility / a newly selected reduced-motion preference, and restore
    // precisely that playback intent (never turn an externally paused video on).
    if ((!show || reduced) && !entry.video.paused) {
      entry.held = true; entry.expectedPause = true;
      try { entry.video.pause(); } catch {}
    } else if (show && !reduced && entry.held) {
      entry.held = false;
      try { entry.video.play()?.catch?.(() => {}); } catch {}
    }
    if (entry.ctl) {
      entry.ctl.preferences({ motion: !!reduced, flash: flash() });
      if (show && !reduced && !entry.video.paused) entry.ctl.resume();
      else entry.ctl.pause();
      return;
    }
    if (!show || reduced || entry.video.paused || entry.video.readyState < 2 || entry.failed) {
      cancelInit(entry); return;
    }
    if (entry.idle != null) return;
    const init = () => {
      entry.idle = null;
      if (entry.dead || disposed || !visible(entry) || motion() || entry.video.paused) return;
      if (entry.video.hasAttribute?.('data-boot-native')) { remove(entry); return; }
      try { entry.ctl = attachIntroSignalRemix(entry.video, { document, env }); } catch {}
      if (!entry.ctl) { entry.failed = true; return; }
      entry.ctl.preferences({ motion: false, flash: flash() });
      entry.ctl.resume();
    };
    entry.idleAPI = typeof env.requestIdleCallback === 'function';
    entry.idle = entry.idleAPI ? env.requestIdleCallback(init, { timeout: 1200 }) : env.requestAnimationFrame(init);
  }
  function remove(entry) {
    if (entry.dead) return;
    entry.dead = true; cancelInit(entry); entry.watcher.disconnect();
    for (const [node, event, fn] of entry.listeners) node.removeEventListener(event, fn);
    entry.ctl?.destroy(); entries.delete(entry.video);
  }
  function add(video) {
    if (entries.has(video) || !video.isConnected || video.hasAttribute?.('data-boot-native')) return;
    const root = video.closest('#boot-overlay, #cinematic-splash');
    if (!root) return;
    const entry = { video, root, ctl: null, idle: null, failed: false, dead: false,
      held: false, expectedPause: false, listeners: [], watcher: null };
    entries.set(video, entry);
    const listen = (node, event, fn) => { node.addEventListener(event, fn); entry.listeners.push([node, event, fn]); };
    const update = () => reconcile(entry);
    listen(video, 'playing', update); listen(video, 'loadeddata', update);
    listen(video, 'pause', () => {
      if (entry.expectedPause) entry.expectedPause = false;
      else entry.held = false;
      entry.ctl?.pause();
    });
    const failed = () => { entry.failed = true; cancelInit(entry); entry.ctl?.destroy(); entry.ctl = null; };
    listen(video, 'error', failed);
    const source = video.querySelector('source'); if (source) listen(source, 'error', failed);
    entry.watcher = new env.MutationObserver(update);
    entry.watcher.observe(root, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    reconcile(entry);
  }
  const scan = () => {
    for (const entry of entries.values()) if (!entry.video.isConnected) remove(entry);
    for (const video of document.querySelectorAll(selector)) add(video);
  };
  const structure = new env.MutationObserver(records => {
    // Boot progress and all game HUD text mutations are irrelevant. Do not
    // rescan the entire UI for every percentage/clock/health update.
    for (const record of records) {
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (node.nodeType === 1 && (node.matches?.(selector) || node.querySelector?.(selector)
            || [...entries.values()].some(e => node === e.root || node.contains?.(e.video)))) { scan(); return; }
      }
    }
  });
  const refresh = () => { for (const entry of entries.values()) reconcile(entry); };
  const preferences = new env.MutationObserver(refresh);
  preferences.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  structure.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', refresh);
  motionQuery?.addEventListener?.('change', refresh);
  const pagehide = () => { for (const entry of entries.values()) { cancelInit(entry); entry.ctl?.pause(); } };
  env.addEventListener?.('pagehide', pagehide); env.addEventListener?.('pageshow', refresh);
  const ctl = {
    refresh,
    inspect: () => [...entries.values()].map(e => ({ host: e.root.id, initialized: !!e.ctl,
      failed: e.failed, pending: e.idle != null, ...(e.ctl?.inspect() || {}) })),
    destroy() {
      if (disposed) return;
      disposed = true; structure.disconnect(); preferences.disconnect();
      document.removeEventListener('visibilitychange', refresh);
      motionQuery?.removeEventListener?.('change', refresh);
      env.removeEventListener?.('pagehide', pagehide); env.removeEventListener?.('pageshow', refresh);
      for (const entry of entries.values()) remove(entry);
      installed.delete(document);
    },
  };
  installed.set(document, ctl); scan(); return ctl;
}
