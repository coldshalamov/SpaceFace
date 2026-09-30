// Only this small graph is evaluated before the first loading frame. The game graph and artwork
// are dynamically imported after the instrument has painted, in BOTH raw and bundled launchers.
import { mountBootRing } from './orrery/bootRing.js';
import { yieldForBootPaint } from '../core/bootScheduler.js';

async function start() {
  const overlay = document.getElementById('boot-overlay');
  let ring = null;
  try {
    ring = mountBootRing(document, overlay);
    ring.report({ id: 'boot-modules', progress: .01, ceiling: .14, label: 'Loading flight systems' });
    ring.start();
    // A working worker normally acknowledges immediately. A blocked worker has a bounded
    // handshake and an already-drawn SVG fallback; decoration cannot strand the game.
    await ring.ready;
  } catch (error) { console.warn('[boot] progress instrument unavailable', error); }
  await yieldForBootPaint();
  // Artwork failure is independent of game failure. Keep the existing cinematic/fallback code.
  void import('./loadingTerminalArt.js').then((module) => module.bootstrapLoadingTerminal())
    .catch((error) => console.warn('[boot] artwork unavailable', error));
  // Optional optics: preserves the existing video and both artwork fallbacks. Decoration cannot
  // block boot; its observers catch the intro video hosts whenever they mount.
  void import('./introSignalRemixBoot.js').then((module) => module.installIntroSignalRemix())
    .catch(() => { /* Decoration cannot block boot. */ });
  try { await import('../main.js'); }
  catch (error) {
    ring?.stop();
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
