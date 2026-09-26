// Packet 09 presentation mount: hosts createCapitalBossOverlay inside the existing render host.
//
// The adapter (src/presentation/capitalBossPresentation.js) is renderer-only: it draws the exact
// world-space warning geometry the score evaluates onto a transparent 2D canvas, through the
// gameplay camera's projection (ctx.helpers.worldToScreen) — never a second camera. This mount
// owns only host concerns: the DOM canvas, device-pixel-ratio scaling, the flight-mode gate, the
// reduced-motion setting, and restore-on-load / destroy-on-teardown. No renderer clock enters
// gameplay: clockForFight reads each fight's OWN encounter clock, which the sim freeze holds still.
import { createCapitalBossOverlay } from '../presentation/capitalBossPresentation.js';

const reducedMotionOf = (state) => !!(state && state.settings && state.settings.video
  && state.settings.video.motionReduce);

export function mountCapitalBossOverlay({ root, bus, state, helpers }) {
  if (typeof document === 'undefined' || !root || !bus) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'sf-capital-boss-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  root.appendChild(canvas);

  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  // Reading clientWidth inside the draw loop is a forced layout every frame; the box only moves
  // with a real resize, so a ResizeObserver (window resize as fallback) re-arms one re-measure
  // instead. Where neither API exists the flag stays set and every draw measures, as before.
  let sizeDirty = true;
  const markSizeDirty = () => { sizeDirty = true; };
  let sizeObserver = null;
  let windowResizeBound = false;
  if (typeof ResizeObserver === 'function') {
    sizeObserver = new ResizeObserver(markSizeDirty);
    sizeObserver.observe(root);
  } else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', markSizeDirty);
    windowResizeBound = true;
  }
  const observingSize = !!(sizeObserver || windowResizeBound);
  function syncSize() {
    sizeDirty = !observingSize;
    const width = root.clientWidth || window.innerWidth || 0;
    const height = root.clientHeight || window.innerHeight || 0;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  }
  syncSize();

  // The repo's worldToScreen reports window CSS pixels for authoritative global XZ; the adapter
  // draws in canvas-local CSS pixels. The overlay canvas covers the window at (0,0), so the
  // coordinates are the same space — only the unused onScreen flag is dropped.
  const _projWorld = { x: 0, y: 0, z: 0 };
  const _projScreen = { x: 0, y: 0, onScreen: false };
  const _projOut = { x: -1e6, y: -1e6 };
  const project = (p) => {
    _projWorld.x = p.x; _projWorld.z = p.z;
    const out = helpers && typeof helpers.worldToScreen === 'function'
      ? helpers.worldToScreen(_projWorld, _projScreen)
      : null;
    if (out && Number.isFinite(out.x) && Number.isFinite(out.y)) {
      _projOut.x = out.x; _projOut.y = out.y;
    } else {
      _projOut.x = -1e6; _projOut.y = -1e6;
    }
    return _projOut;
  };
  const clockForFight = (fightId) => {
    const fights = state && state.capitalBossEncounters && state.capitalBossEncounters.fights;
    const record = fights && fights[String(fightId)];
    return record && Number.isFinite(record.clock) ? record.clock : 0;
  };

  let reducedMotion = reducedMotionOf(state);
  let overlay = createCapitalBossOverlay({
    canvas,
    bus,
    worldToScreen: project,
    clockForFight,
    reducedMotion,
  });

  // After a save restore the score's records exist again (same tick, or rebound with new runtime
  // ids); the overlay re-arms its telegraphs from the restored fights instead of waiting for the
  // next cast event.
  const onSaveLoaded = () => {
    const fights = (state && state.capitalBossEncounters && state.capitalBossEncounters.fights) || {};
    overlay.restore(fights);
  };
  const offRestore = bus.on('save:loaded', onSaveLoaded);

  let clearedWhileAway = false;
  return {
    draw(currentState) {
      const st = currentState || state;
      // Accessibility: a flipped reduced-motion setting rebuilds the adapter's motion treatment.
      const wanted = reducedMotionOf(st);
      if (wanted !== reducedMotion) {
        overlay.destroy();
        reducedMotion = wanted;
        overlay = createCapitalBossOverlay({
          canvas,
          bus,
          worldToScreen: project,
          clockForFight,
          reducedMotion,
        });
      }
      if (st && st.mode === 'flight') {
        if (sizeDirty) syncSize();
        overlay.draw();
        clearedWhileAway = false;
      } else if (!clearedWhileAway) {
        // Menus/dock: stop presenting the flight warning; leave the canvas clean.
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        clearedWhileAway = true;
      }
    },
    destroy() {
      if (sizeObserver) sizeObserver.disconnect();
      if (windowResizeBound) window.removeEventListener('resize', markSizeDirty);
      if (typeof offRestore === 'function') offRestore();
      else if (bus.off) bus.off('save:loaded', onSaveLoaded);
      overlay.destroy();
      canvas.remove();
    },
  };
}

export default mountCapitalBossOverlay;
