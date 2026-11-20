// The instrument and native media own the first frame BEFORE the game graph.
import { bootMark } from '../core/bootTimeline.js';
import { mountBootRing } from './orrery/bootRing.js';
import { yieldForBootPaint } from '../core/bootScheduler.js';
import { getBootVisualizer } from './bootVisualizer.js';
import {
  annotateStartupFailure, clearStartupRetry,
  findBrokenModules, presentStartupFailure, startupProbeHrefs, summarizeStartupError,
} from './bootStartupFailure.js';

bootMark('boot-entry-evaluated');

function sessionStore() {
  try { return window.sessionStorage; } catch { return null; }
}

// intro.css used to stand the HUD down through body:has(#boot-overlay:not(.hidden)) — a document
// :has() whose re-scan ran on every HUD mutation all session. The overlay's .hidden flag now mirrors
// into body.sf-boot-open here; every writer (loadingPresenter, failure panes, boot error paths) is
// covered by the one observer. index.html ships the class set because the veil starts visible.
function watchBootVeil(overlay) {
  if (!overlay || typeof MutationObserver !== 'function' || !document.body) return;
  const sync = () => {
    const open = !overlay.classList.contains('hidden');
    if (document.body.classList.contains('sf-boot-open') !== open) {
      document.body.classList.toggle('sf-boot-open', open);
    }
  };
  new MutationObserver(sync).observe(overlay, { attributes: true, attributeFilter: ['class'] });
  sync();
}

// The boot film is decoration: any key or click dismisses it from its first
// frame, and it never blocks the game graph. The listener is armed before the
// movie can paint and detaches when the loading veil first lifts — loading
// transitions after the title keep their own movies.
function armBootFilmSkip(overlay, artwork) {
  if (!artwork || typeof artwork.skipFilm !== 'function' || typeof window === 'undefined') return;
  const skip = () => { try { artwork.skipFilm(); } catch (_) { /* decoration */ } };
  const detach = () => {
    window.removeEventListener('keydown', skip, true);
    window.removeEventListener('pointerdown', skip, true);
  };
  window.addEventListener('keydown', skip, true);
  window.addEventListener('pointerdown', skip, true);
  if (overlay && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(() => {
      if (!overlay.classList.contains('hidden')) return;
      detach();
      observer.disconnect();
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  } else {
    setTimeout(detach, 600000); // observers missing: bound the listener's life
  }
}

async function start() {
  const overlay = document.getElementById('boot-overlay');
  watchBootVeil(overlay);
  let ring = null, artwork = null;
  try {
    ring = mountBootRing(document, overlay);
    ring.report({ id: 'boot-modules', progress: .01, ceiling: .14, label: 'Loading flight systems' });
    ring.start();
    bootMark('boot-instrument-mounted');
  } catch (error) { console.warn('[boot] progress instrument unavailable', error); }
  try {
    artwork = getBootVisualizer(document);
    artwork.start();
    armBootFilmSkip(overlay, artwork);
    bootMark('boot-media-requested');
  } catch (error) { console.warn('[boot] artwork unavailable', error); }
  // The game graph evaluates while the movie proves itself — native playback is
  // compositor-driven, so the eval burst cannot freeze the film. The old
  // media-first handoff serialized the whole module graph behind the playback
  // proof: up to 9 s of dead time before main.js even began.
  bootMark('main-import-start');
  const mainModule = import('../main.js');
  void Promise.all([ring?.ready, artwork?.playbackReady ?? artwork?.ready])
    .then((proofs) => {
      bootMark('boot-media-proof', proofs?.[1]?.reason || proofs?.[1]?.status || 'settled');
    })
    .catch(() => {});
  await yieldForBootPaint();
  try {
    await mainModule;
    bootMark('main-module-evaluated');
    clearStartupRetry(sessionStore());
    // Boot's rich optics are baked into its clip. The live remix remains on the
    // title route, but cannot put a frozen opaque GL canvas over native boot media.
    void import('./introSignalRemixBoot.js').then(module => module.installIntroSignalRemix())
      .catch(() => { /* Decoration cannot block boot. */ });
  } catch (error) {
    ring?.stop(); artwork?.stop();
    // A failed dynamic import is cached for the document's life, so the one recovery that works
    // is a fresh load: reload once on our own, then stop and say what failed rather than loop.
    const outcome = presentStartupFailure({
      overlay, error, storage: sessionStore(), reload: () => window.location.reload(),
    });
    console.error('[SpaceFace] game module failed to load', error);
    // On the dead end, name the file that cannot parse — the bare "Unexpected token" message
    // does not say. Parse failures only: a fetch or resolution error has no file to re-parse.
    if (outcome === 'failed' && error instanceof SyntaxError) {
      findBrokenModules({ hrefs: startupProbeHrefs(document) }).then((culprits) => {
        if (culprits.length) console.error('[SpaceFace] module file(s) failed to parse:', culprits);
        annotateStartupFailure({ overlay, culprits, summary: summarizeStartupError(error) });
      }).catch(() => { /* the dead-end message already stands */ });
    }
  }
}
void start();
