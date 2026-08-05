// PQ-011 / SF-11 — Mass Seed HUD (DOM-guarded "own module" pattern, masslineHud sibling).
//
// Two pieces, both text/shape-first so state never depends on color or motion:
//   1. A status pill: phase + exact seconds ("ANCHOR 24s", "COLLAPSE IN 5s", "SEED READY 7s").
//      The expiry countdown is the PRIMARY timing channel — the world beacon/strobe is redundant.
//   2. A world-anchored lock-point marker while the seed travels: a diamond + "LOCK" label at the
//      published deterministic lockPos, so the player sees where the anchor WILL exist before it
//      does. Hidden once the frame lock lands (the physical anchor + acquisition preview take over).
//
// Reads only: state.massSeed, state.player.massSeed, entities, helpers.worldToScreen.
// Writes only: its own DOM subtree. No sim state. Fully guarded headless.

const MASS_SEED_HUD_CSS = `
.sf-mseed-root { position: absolute; inset: 0; pointer-events: none; z-index: 7; }
.sf-mseed-pill {
  position: absolute; left: 50%; bottom: 118px; transform: translateX(-50%);
  display: none; align-items: center; gap: 8px; padding: 4px 12px;
  font: 600 12px/1.2 "Segoe UI", system-ui, sans-serif; letter-spacing: 0.08em;
  color: #cfe8ff; background: rgba(10, 18, 28, 0.72); border: 1px solid rgba(120, 190, 235, 0.4);
  border-radius: 3px; pointer-events: none; white-space: nowrap;
}
.sf-mseed-pill .mseed-tag { font-weight: 700; }
.sf-mseed-pill.mseed-warning { color: #ffd9a0; border-color: rgba(240, 170, 70, 0.65); }
.sf-mseed-pill.mseed-cooldown { color: #9fb4c8; border-color: rgba(120, 140, 160, 0.35); }
.sf-mseed-mark { position: absolute; display: none; pointer-events: none; will-change: transform; }
.sf-mseed-mark.mseed-offscreen { filter: drop-shadow(0 0 7px rgba(2, 6, 11, 0.92)); }
.sf-mseed-mark.mseed-offscreen .mseed-diamond { border-style: dashed; }
.sf-mseed-mark .mseed-diamond {
  width: 12px; height: 12px; margin: -6px 0 0 -6px;
  border: 2px solid rgba(140, 215, 250, 0.9); transform: rotate(45deg);
  background: rgba(20, 40, 60, 0.35);
}
.sf-mseed-mark .mseed-mark-label {
  position: absolute; left: 10px; top: -8px; font: 600 10px/1.1 "Segoe UI", system-ui, sans-serif;
  letter-spacing: 0.1em; color: #bfe6ff; text-shadow: 0 1px 2px rgba(0,0,0,0.8); white-space: nowrap;
}
.sf-mseed-root.mseed-reduced-motion .sf-mseed-mark .mseed-diamond { border-style: dashed; }
`;

function viewportExtent(primary, fallback, dflt) {
  if (typeof window === 'undefined') return dflt;
  const v = window[primary] || (document.documentElement && document.documentElement[fallback]) || dflt;
  return Number.isFinite(v) ? v : dflt;
}

function clampRange(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function projectedDirection(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay < ax * 0.4) return dx < 0 ? 'left' : 'right';
  if (ax < ay * 0.4) return dy < 0 ? 'top' : 'bottom';
  return `${dy < 0 ? 'upper' : 'lower'} ${dx < 0 ? 'left' : 'right'}`;
}

function resolveWorldBearingEdge(width, height, playerPos, targetPos, margin) {
  if (!playerPos || !targetPos) return null;
  const worldDx = Number(targetPos.x) - Number(playerPos.x);
  const worldDz = Number(targetPos.z) - Number(playerPos.z);
  const length = Math.hypot(worldDx, worldDz);
  if (!Number.isFinite(worldDx) || !Number.isFinite(worldDz) || length < 0.001) return null;

  // The chase camera keeps a fixed world orientation. Match the radar/objective contract: +X is
  // left and +Z is up. A perspective projection of a behind-camera point is mirrored, so its raw
  // screen coordinate must never choose the edge direction when world positions are available.
  const dx = -worldDx / length;
  const dy = -worldDz / length;
  const mx = Math.max(24, width / 2 - margin);
  const my = Math.max(24, height / 2 - margin);
  const tx = Math.abs(dx) > 0.001 ? mx / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 0.001 ? my / Math.abs(dy) : Infinity;
  const edgeT = Math.min(tx, ty);
  const x = width / 2 + dx * edgeT;
  const y = height / 2 + dy * edgeT;
  const direction = x > width * 0.72
    ? 'right'
    : (x < width * 0.28 ? 'left' : (dy < 0 ? 'top' : 'bottom'));
  return { x, y, direction };
}

export function resolveMassSeedLockCue(projection, options = {}) {
  const rawX = projection && Number(projection.x);
  const rawY = projection && Number(projection.y);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return { visible: false };

  const viewportWidth = Math.max(320, Number(options.viewportWidth) || 1440);
  const viewportHeight = Math.max(240, Number(options.viewportHeight) || 900);
  const margin = Math.max(24, Number(options.margin) || 24);
  const offscreen = projection.onScreen === false
    || rawX < 0 || rawX > viewportWidth || rawY < 0 || rawY > viewportHeight;
  if (!offscreen) {
    return {
      visible: true,
      x: rawX,
      y: rawY,
      offscreen: false,
      direction: 'onscreen',
      ariaLabel: 'Mass Seed lock point onscreen',
    };
  }

  const worldEdge = resolveWorldBearingEdge(
    viewportWidth,
    viewportHeight,
    options.playerPos,
    options.targetPos,
    margin,
  );
  const direction = worldEdge
    ? worldEdge.direction
    : projectedDirection(rawX - viewportWidth / 2, rawY - viewportHeight / 2);
  return {
    visible: true,
    x: worldEdge ? worldEdge.x : clampRange(rawX, margin, viewportWidth - margin),
    y: worldEdge ? worldEdge.y : clampRange(rawY, margin, viewportHeight - margin),
    offscreen: true,
    direction,
    ariaLabel: `Mass Seed lock point offscreen ${direction}`,
  };
}

export const massSeedHud = {
  id: 'massSeedHud',
  name: 'massSeedHud',

  init(ctx) {
    this.state = ctx.state;
    this.helpers = ctx.helpers || {};
    this._dom = null;
    this._lastPillText = '';
    this._lastPillClass = '';
    this._pillVisible = false;
    this._markVisible = false;
    this._markOffscreen = null;
    this._lastMarkDirection = '';
    this._lastMarkTransform = '';
    this._lastMarkAria = '';
  },

  destroy() {
    if (this._dom && this._dom.root && this._dom.root.parentNode) {
      this._dom.root.parentNode.removeChild(this._dom.root);
    }
    this._dom = null;
    this._pillVisible = false;
  },

  update(dt, state) {
    if (typeof document === 'undefined') return;
    const dom = this._ensureDom();
    if (!dom) return;
    if (state.mode !== 'flight' || (state.ui && state.ui.docked)) { this._hideAll(); return; }

    const reducedMotion = !!(state.settings && state.settings.video && state.settings.video.motionReduce)
      || !!(state.settings && state.settings.accessibility
        && state.settings.accessibility.motionPreference === 'reduce');
    if (dom.reducedMotion !== reducedMotion) {
      dom.reducedMotion = reducedMotion;
      dom.root.classList.toggle('mseed-reduced-motion', reducedMotion);
    }

    const ms = state.massSeed || null;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    this._updatePill(dom, state, ms, now);
    this._updateLockMarker(dom, state, ms);
  },

  _updatePill(dom, state, ms, now) {
    let text = '';
    let cls = '';
    if (ms && ms.phase && ms.phase !== 'idle' && ms.phase !== 'collapsing') {
      if (ms.phase === 'travel') {
        text = `SEED → LOCK ${Math.max(0, ms.lockAt - now).toFixed(1)}s`;
      } else if (ms.phase === 'locking') {
        text = 'SEED FRAME LOCK…';
      } else if (ms.phase === 'active') {
        text = `ANCHOR ${Math.max(0, Math.ceil(ms.expireAt - now))}s`;
      } else if (ms.phase === 'warning') {
        text = `ANCHOR COLLAPSE IN ${Math.max(0, Math.ceil(ms.expireAt - now))}s`;
        cls = 'mseed-warning';
      }
    } else {
      const ps = state.player && state.player.massSeed;
      const cooldown = ps && Number.isFinite(ps.cooldownUntil) ? ps.cooldownUntil - now : 0;
      if (cooldown > 0.05) {
        text = `SEED READY IN ${Math.ceil(cooldown)}s`;
        cls = 'mseed-cooldown';
      }
    }
    if (!text) {
      if (this._pillVisible) dom.pill.style.display = 'none';
      this._pillVisible = false;
      this._lastPillText = '';
      return;
    }
    if (text !== this._lastPillText) {
      this._lastPillText = text;
      dom.pillText.textContent = text;
      dom.pill.setAttribute('aria-label', text);
    }
    if (cls !== this._lastPillClass) {
      this._lastPillClass = cls;
      dom.pill.classList.toggle('mseed-warning', cls === 'mseed-warning');
      dom.pill.classList.toggle('mseed-cooldown', cls === 'mseed-cooldown');
    }
    if (!this._pillVisible) {
      dom.pill.style.display = 'flex';
      this._pillVisible = true;
    }
  },

  _updateLockMarker(dom, state, ms) {
    const travelling = !!(ms && (ms.phase === 'travel' || ms.phase === 'locking') && ms.lockPos);
    if (!travelling) {
      if (this._markVisible) { dom.mark.style.display = 'none'; this._markVisible = false; }
      return;
    }
    const w2s = this.helpers && this.helpers.worldToScreen;
    if (typeof w2s !== 'function') {
      if (this._markVisible) { dom.mark.style.display = 'none'; this._markVisible = false; }
      return;
    }
    const proj = w2s({ x: ms.lockPos.x, y: 0, z: ms.lockPos.z });
    if (!proj || !Number.isFinite(proj.x) || !Number.isFinite(proj.y)) {
      if (this._markVisible) { dom.mark.style.display = 'none'; this._markVisible = false; }
      return;
    }
    const vw = viewportExtent('innerWidth', 'clientWidth', 1440);
    const vh = viewportExtent('innerHeight', 'clientHeight', 900);
    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    const cue = resolveMassSeedLockCue(proj, {
      viewportWidth: vw,
      viewportHeight: vh,
      playerPos: player && player.pos,
      targetPos: ms.lockPos,
    });
    if (!cue.visible) {
      if (this._markVisible) { dom.mark.style.display = 'none'; this._markVisible = false; }
      return;
    }
    if (!this._markVisible) dom.mark.style.display = 'block';
    const transform = `translate3d(${Math.round(cue.x)}px, ${Math.round(cue.y)}px, 0)`;
    if (transform !== this._lastMarkTransform) {
      this._lastMarkTransform = transform;
      dom.mark.style.transform = transform;
    }
    if (cue.offscreen !== this._markOffscreen) {
      this._markOffscreen = cue.offscreen;
      dom.mark.classList.toggle('mseed-offscreen', cue.offscreen);
    }
    if (cue.direction !== this._lastMarkDirection) {
      this._lastMarkDirection = cue.direction;
      dom.mark.setAttribute('data-direction', cue.direction);
    }
    const remaining = Math.max(0, ms.lockAt - (Number.isFinite(state.simTime) ? state.simTime : 0));
    const phaseLabel = ms.phase === 'locking' ? 'LOCKING' : `LOCK ${remaining.toFixed(1)}s`;
    const label = cue.offscreen ? `${phaseLabel} · ${cue.direction.toUpperCase()}` : phaseLabel;
    if (dom.markLabel.textContent !== label) dom.markLabel.textContent = label;
    const aria = `${cue.ariaLabel}; ${ms.phase === 'locking' ? 'locking' : `lock in ${remaining.toFixed(1)} seconds`}`;
    if (aria !== this._lastMarkAria) {
      this._lastMarkAria = aria;
      dom.mark.setAttribute('aria-label', aria);
    }
    this._markVisible = true;
  },

  _hideAll() {
    const dom = this._dom;
    if (!dom) return;
    if (this._pillVisible) dom.pill.style.display = 'none';
    if (this._markVisible) dom.mark.style.display = 'none';
    this._pillVisible = false;
    this._lastPillText = '';
    this._markVisible = false;
  },

  _ensureDom() {
    if (this._dom && this._dom.root.isConnected !== false) return this._dom;
    const host = document.getElementById('hud') || document.body;
    if (!host) return null;
    if (!document.getElementById('sf-mseed-css')) {
      const style = document.createElement('style');
      style.id = 'sf-mseed-css';
      style.textContent = MASS_SEED_HUD_CSS;
      (document.head || host).appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'sf-mseed-root';

    const pill = document.createElement('div');
    pill.className = 'sf-mseed-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.setAttribute('aria-atomic', 'true');
    const pillText = document.createElement('span');
    pillText.className = 'mseed-tag';
    pill.appendChild(pillText);
    root.appendChild(pill);

    const mark = document.createElement('div');
    mark.className = 'sf-mseed-mark';
    mark.style.display = 'none';
    const diamond = document.createElement('div');
    diamond.className = 'mseed-diamond';
    mark.appendChild(diamond);
    const markLabel = document.createElement('span');
    markLabel.className = 'mseed-mark-label';
    mark.appendChild(markLabel);
    root.appendChild(mark);

    host.appendChild(root);
    this._dom = { root, pill, pillText, mark, markLabel, reducedMotion: false };
    this._lastPillText = '';
    this._lastPillClass = '';
    this._pillVisible = false;
    this._markVisible = false;
    this._markOffscreen = null;
    this._lastMarkDirection = '';
    this._lastMarkTransform = '';
    this._lastMarkAria = '';
    return this._dom;
  },
};
