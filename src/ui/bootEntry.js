// The instrument and native media own the first frame BEFORE the game graph.
import { mountBootRing } from './orrery/bootRing.js';
import { yieldForBootPaint } from '../core/bootScheduler.js';
import { getBootVisualizer } from './bootVisualizer.js';

async function start() {
  const overlay = document.getElementById('boot-overlay');
  let ring = null, artwork = null;
  try {
    ring = mountBootRing(document, overlay);
    ring.report({ id: 'boot-modules', progress: .01, ceiling: .14, label: 'Loading flight systems' });
    ring.start();
  } catch (error) { console.warn('[boot] progress instrument unavailable', error); }
  try {
    artwork = getBootVisualizer(document);
    artwork.start();
  } catch (error) { console.warn('[boot] artwork unavailable', error); }
  // PR #188's index modulepreloads warm transfers in parallel. Do not start
  // main's EVALUATION here until the movie is visible: that eager import is
  // precisely the startup race this media-first handoff eliminates.
  // Both promises are bounded. A real pair of media frames, not play() resolving
  // or a worker heartbeat, normally releases the game import. Network/codec
  // failure still releases it, with an explicit fallback instead of a deadlock.
  await Promise.all([ring?.ready, artwork?.ready]);
  await yieldForBootPaint();
  try {
    await import('../main.js');
    // Boot's rich optics are baked into its clip. The live remix remains on the
    // title route, but cannot put a frozen opaque GL canvas over native boot media.
    void import('./introSignalRemixBoot.js').then(module => module.installIntroSignalRemix())
      .catch(() => { /* Decoration cannot block boot. */ });
  } catch (error) {
    ring?.stop(); artwork?.stop();
    if (overlay) {
      overlay.classList.remove('hidden'); overlay.style.display = 'flex';
      overlay.setAttribute('aria-busy', 'false');
      const label = overlay.querySelector('[data-loading-label]');
      const detail = overlay.querySelector('[data-loading-detail]');
      if (label) label.textContent = 'Startup could not finish';
      if (detail) { detail.textContent = 'Reload to retry. Your saved games have not been changed.'; detail.classList.add('boot-error'); }
    }
    console.error('[SpaceFace] game module failed to load', error);
  }
}
void start();
