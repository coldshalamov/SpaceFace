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
  function syncSize() {
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
  const project = (p) => {
    const out = helpers && typeof helpers.worldToScreen === 'function'
      ? helpers.worldToScreen({ x: p.x, y: 0, z: p.z })
      : null;
    return out && Number.isFinite(out.x) && Number.isFinite(out.y)
      ? { x: out.x, y: out.y }
      : { x: -1e6, y: -1e6 };
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
        syncSize();
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
      if (typeof offRestore === 'function') offRestore();
      else if (bus.off) bus.off('save:loaded', onSaveLoaded);
      overlay.destroy();
      canvas.remove();
    },
  };
}

export default mountCapitalBossOverlay;
