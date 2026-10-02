// INF lane — Mining Instrument (DOM-guarded "own module" pattern, massSeedHud/fieldHud sibling).
//
// The mining beam runs THREE skill rhythms and, before this module, showed none of them at the
// gameplay camera (the HUD heat row reads the GUNS; the only mining signals were a one-time
// 'VENT READY' alert, audio, and an after-the-fact "+N" float). This instrument renders all three
// at the beam contact, world-anchored:
//   1. BEAM HEAT ARC — the held tool's own gauge. The vent band (>= 62% of the gauge, where a
//      release pays up to +75% of the pulse's ore) is TICKED on the arc; inside the band the fill
//      and its bloom head light amber (release cue). Hidden when pct < 0.05 — a cold tool shows
//      nothing (contextual instrument, ORRERY: anchored to content or absent).
//   2. RICH-CORE CHARGE ARC — while a cracked rock's core window is open (3.5 s), an inner ring
//      fills as the beam charges, with the sweet-spot window marked (release inside it for the
//      +3-8 bonus; outside it the core fizzles). Amber charge, red fizzle (a loss is threat-
//      channel language, ORRERY §3.3), amber bloom on the hit. Latched ~1.2 s after resolution,
//      then gone.
//   3. SEAM WORD — ON SEAM (amber: aim here) / OFF SEAM (mute bone) from mining:tick.seamHit.
//      Off-seam beam time pays 35% of the ore (SEAM_YIELD_OFF); the word is where the player
//      learns where the seam is.
//
// Reads ONLY bus events the sim already emits — mining:start/stop, mining:heatChanged
// {pct, band}, mining:tick {contactPos, seamHit}, mining:richCoreExposed/ChargeStart/Completed/
// Fizzle ({windowPct, durationS} carries the window) — filtered to the player (minerId /
// sourceEntityId). Zero sim changes. Writes only its own DOM subtree. Fully guarded headless.
// Presentation advances on SIM time (state.simTime), never wall clock.
//
// ORRERY law: this is element #3 (Arc Gauge) serving the mining verb — light, not boxes. The
// dial is SVG geometry (1px core + a wider low-alpha bloom stroke underneath, never a filter —
// flight HUD budget), painted only with the deckplate tokens that already live on #hud/:root.
// Arc geometry composes the library generators (src/ui/orrery/svg.js); the sheet is self-injected
// so the instrument works standalone exactly like its siblings.

import { arcD, polar, svg } from './orrery/svg.js';

// ── The published numbers (test/ and this sheet agree on these) ────────────────────────────────
// Vent band: heat climbs at BEAM_HEAT_RATE 22/s toward a 100-point gauge, so the band's lower
// edge (0.62) is reached after 0.62 * 100 / 22 ≈ 2.82 s of beam-on time. Releasing inside the
// band pays up to BEAM_VENT_BONUS_MAX 0.75 of the pulse's ore, scaling with depth into the band.
export const VENT_BAND_LO = 0.62;
export const VENT_TIME_TO_BAND_S = (VENT_BAND_LO * 100) / 22; // ≈ 2.82 s on the mk1 beam
// Rich core: the window is open RICH_CORE_DURATION_S 3.5 s; the sweet spot is the middle of the
// charge (1.75 s in), half-width windowPct / 2 — tier windowPct runs 0.12..0.22 (+ rig bonus,
// clamped ≤ 0.5), i.e. ±6%..±11% of progress = ±0.21 s..±0.385 s around the 1.75 s mid-charge.
export const RICH_CORE_SWEET_CENTER = 0.5;
export const RICH_CORE_DURATION_S = 3.5;
export const HEAT_VISIBLE_MIN_PCT = 0.05; // below this the heat arc shows nothing at all
export const SEAM_WORD_ON = 'ON SEAM';
export const SEAM_WORD_OFF = 'OFF SEAM';
export const SEAM_YIELD_OFF = 0.35; // what an off-seam tick pays — the reason the word exists

const RESOLVE_LATCH_S = 1.2;    // hit/fizzle stays readable for a beat, then the ring retires
const CORE_EXPIRY_GRACE_S = 0.5; // the sim owns the real fizzle-at-expiry; the HUD only self-heals
const SEAM_STALE_S = 0.6;       // ticks stop when the rock dies; a stale word would be a lie
const DIAL = 56;                // viewBox px; rendered 1:1, crisp via non-scaling-stroke
const HEAT_R = 24;
const CORE_R = 16;
const FULL_CIRCLE_DEG = 359.999;

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

/** Pure: the heat arc's render state from the last mining:heatChanged payload. */
export function resolveHeatArc({ pct = 0, band = 'cold' } = {}) {
  const p = clamp01(pct);
  if (p < HEAT_VISIBLE_MIN_PCT) {
    return { visible: false, pct: p, band, ventBand: false };
  }
  return {
    visible: true,
    pct: p,
    band,
    ventBand: band === 'vent' || p >= VENT_BAND_LO,
  };
}

/** Pure: the sweet-spot window (progress space 0..1) for a rich core's windowPct. */
export function richCoreWindow(windowPct) {
  const half = clamp01((Number(windowPct) || 0) / 2);
  return {
    lo: clamp01(RICH_CORE_SWEET_CENTER - half),
    hi: clamp01(RICH_CORE_SWEET_CENTER + half),
  };
}

/**
 * Pure: the rich-core ring's render state.
 * core: this module's exposure record; now: state.simTime. States:
 *   'open' (window open, beam not yet charging) → 'charging' (fill advancing) →
 *   'hit' | 'fizzle' (resolved; latched briefly) → invisible.
 */
export function resolveRichCoreCue(core, now) {
  if (!core || !core.window) return { visible: false };
  if (core.resolved) {
    const age = now - core.resolvedAt;
    return {
      visible: age >= 0 && age < RESOLVE_LATCH_S,
      state: core.resolved,
      progress: core.finalProgress,
      window: core.window,
    };
  }
  if (now > core.expiresAt + CORE_EXPIRY_GRACE_S) return { visible: false };
  const duration = Math.max(0.001, Number(core.durationS) || RICH_CORE_DURATION_S);
  const progress = core.charging ? clamp01((now - core.chargeStartedAt) / duration) : 0;
  return {
    visible: true,
    state: core.charging ? 'charging' : 'open',
    progress,
    window: core.window,
  };
}

/** Pure: the seam word for a mining:tick.seamHit. */
export function seamWordFor(seamHit) {
  return seamHit ? SEAM_WORD_ON : SEAM_WORD_OFF;
}

function viewportExtent(primary, fallback, dflt) {
  if (typeof window === 'undefined') return dflt;
  const v = window[primary] || (document.documentElement && document.documentElement[fallback]) || dflt;
  return Number.isFinite(v) ? v : dflt;
}

export const MINING_HUD_CSS = `
.sf-mining-root { position: absolute; inset: 0; pointer-events: none; z-index: 7; }
.sf-mining-mark {
  position: absolute; left: 0; top: 0; display: none; width: 0; height: 0;
  pointer-events: none; will-change: transform;
}
.sf-mining-dial { position: absolute; left: -28px; top: -28px; width: ${DIAL}px; height: ${DIAL}px; overflow: visible; }
.sf-mining-dial path, .sf-mining-dial circle { fill: none; vector-effect: non-scaling-stroke; stroke-linecap: round; }
/* rest light is warm bone at low alpha; amber is the one accent (the vent rhythm); red is loss */
.sf-mining-track { stroke: var(--dp-line-faint, rgb(232 226 212 / .14)); stroke-width: 1; }
.sf-mining-band { stroke: var(--dp-lamp-dim, #8a6b3a); stroke-width: 2.5; opacity: .55; }
.sf-mining-band-tick { stroke: var(--dp-lamp, #f2b950); stroke-width: 1.5; }
.sf-mining-heat { stroke: var(--dp-phos, #dfeeff); stroke-width: 2; }
.sf-mining-heat-bloom { stroke: var(--dp-phos, #dfeeff); stroke-width: 6; opacity: .18; }
.sf-mining-head { fill: var(--dp-phos, #dfeeff); stroke: none; }
.sf-mining-mark.mining-vent .sf-mining-heat { stroke: var(--dp-lamp, #f2b950); stroke-width: 3; }
.sf-mining-mark.mining-vent .sf-mining-heat-bloom { stroke: var(--dp-lamp, #f2b950); opacity: .3; }
.sf-mining-mark.mining-vent .sf-mining-head { fill: var(--dp-lamp-hot, #ffd98c); }
.sf-mining-mark.mining-vent .sf-mining-band { opacity: 1; }
.sf-mining-core-ring { display: none; }
.sf-mining-mark.mining-core .sf-mining-core-ring { display: initial; }
.sf-mining-core-track { stroke: var(--dp-line-faint, rgb(232 226 212 / .14)); stroke-width: 1; }
.sf-mining-core-window { stroke: var(--dp-lamp-dim, #8a6b3a); stroke-width: 3; opacity: .8; }
.sf-mining-core-fill { stroke: var(--dp-lamp, #f2b950); stroke-width: 1.5; }
.sf-mining-core-fill-bloom { stroke: var(--dp-lamp, #f2b950); stroke-width: 5; opacity: .22; }
.sf-mining-mark.mining-core-hit .sf-mining-core-fill { stroke: var(--dp-lamp-hot, #ffd98c); }
.sf-mining-mark.mining-core-hit .sf-mining-core-fill-bloom { stroke: var(--dp-lamp-hot, #ffd98c); opacity: .4; }
.sf-mining-mark.mining-core-fizzle .sf-mining-core-fill,
.sf-mining-mark.mining-core-fizzle .sf-mining-core-fill-bloom { stroke: var(--dp-danger, #ff5038); }
.sf-mining-mark.mining-core-fizzle .sf-mining-core-fill-bloom { opacity: .34; }
.sf-mining-word {
  position: absolute; left: 0; top: 34px; transform: translateX(-50%); display: none;
  font-family: var(--dp-face-etch, var(--hud-data, system-ui));
  font-size: var(--dp-fs-etch, 12px); font-weight: 700; line-height: 1.2;
  font-variation-settings: "wght" 720, "wdth" 68; letter-spacing: .14em; text-transform: uppercase;
  color: var(--dp-ink-mute, #96948e);
  text-shadow: var(--dp-etch-shadow, 0 1px 2px rgb(0 0 0 / .8)); white-space: nowrap;
}
.sf-mining-mark.mining-seam-on .sf-mining-word {
  display: block; color: var(--dp-lamp, #f2b950); text-shadow: var(--dp-emit-lamp, none);
}
.sf-mining-mark.mining-seam-off .sf-mining-word { display: block; }
.sf-mining-root.mining-reduced-motion .sf-mining-mark,
.sf-mining-root.mining-reduced-motion .sf-mining-mark * {
  transition: none !important; animation: none !important;
}
@media (forced-colors: active) {
  .sf-mining-dial path { stroke: CanvasText; }
  .sf-mining-dial circle { fill: CanvasText; }
  .sf-mining-word { color: CanvasText; text-shadow: none; forced-color-adjust: none; }
}
`;

export const miningHud = {
  id: 'miningHud',
  name: 'miningHud',

  init(ctx) {
    this.state = ctx && ctx.state;
    this.helpers = (ctx && ctx.helpers) || {};
    this._bus = (ctx && ctx.bus) || null;
    this._dom = null;
    // Event-mirrored state (plain data only — DOM work lives in update()).
    this._beaming = false;
    this._heat = { pct: 0, band: 'cold' };
    this._core = null;      // { window, durationS, openedAt, expiresAt, charging, chargeStartedAt, resolved, resolvedAt, finalProgress }
    this._seam = null;      // { seamHit, at }
    this._anchor = null;    // { x, z } — latest beam contact / lock point
    this._writeCaches();
    this._handlers = {
      start: (p) => this._onStart(p),
      stop: (p) => this._onStop(p),
      heat: (p) => this._onHeat(p),
      tick: (p) => this._onTick(p),
      coreExposed: (p) => this._onCoreExposed(p),
      coreCharge: (p) => this._onCoreChargeStart(p),
      coreDone: (p) => this._onCoreResolved(p, 'hit'),
      coreFizzle: (p) => this._onCoreResolved(p, 'fizzle'),
    };
    if (this._bus && this._bus.on) {
      this._bus.on('mining:start', this._handlers.start);
      this._bus.on('mining:stop', this._handlers.stop);
      this._bus.on('mining:heatChanged', this._handlers.heat);
      this._bus.on('mining:tick', this._handlers.tick);
      this._bus.on('mining:richCoreExposed', this._handlers.coreExposed);
      this._bus.on('mining:richCoreChargeStart', this._handlers.coreCharge);
      this._bus.on('mining:richCoreCompleted', this._handlers.coreDone);
      this._bus.on('mining:richCoreFizzle', this._handlers.coreFizzle);
    }
  },

  destroy() {
    if (this._bus && this._bus.off && this._handlers) {
      this._bus.off('mining:start', this._handlers.start);
      this._bus.off('mining:stop', this._handlers.stop);
      this._bus.off('mining:heatChanged', this._handlers.heat);
      this._bus.off('mining:tick', this._handlers.tick);
      this._bus.off('mining:richCoreExposed', this._handlers.coreExposed);
      this._bus.off('mining:richCoreChargeStart', this._handlers.coreCharge);
      this._bus.off('mining:richCoreCompleted', this._handlers.coreDone);
      this._bus.off('mining:richCoreFizzle', this._handlers.coreFizzle);
    }
    if (this._dom && this._dom.root && this._dom.root.parentNode) {
      this._dom.root.parentNode.removeChild(this._dom.root);
    }
    this._dom = null;
    this._bus = null;
    this._handlers = null;
    this._beaming = false;
    this._core = null;
    this._seam = null;
    this._writeCaches();
  },

  // ── event mirrors (pure state; no DOM here so the module stays headless-safe) ────────────────

  _onStart(p) {
    if (!p || !this._isPlayer(p.minerId)) return;
    this._beaming = true;
    if (p.position && Number.isFinite(p.position.x) && Number.isFinite(p.position.z)) {
      this._anchor = { x: p.position.x, z: p.position.z };
    }
  },

  _onStop(p) {
    if (p && !this._isPlayer(p.minerId)) return;
    this._beaming = false;
    this._seam = null;
    this._heat = { pct: 0, band: 'cold' };
    // The sim resolves the rich core on the RELEASE edge — and emits mining:stop BEFORE
    // richCoreCompleted/richCoreFizzle in the same tick (mining.js _stopBeam -> _updateRichCore
    // Charge). Keep the ring alive for its resolution beat instead of dropping it here.
    if (this._core && !this._core.resolved) this._core.orphaned = true;
  },

  _onHeat(p) {
    if (!p || !this._isPlayer(p.minerId)) return;
    this._heat = { pct: p.pct, band: p.band };
  },

  _onTick(p) {
    if (!p || !this._isPlayer(p.sourceEntityId)) return;
    this._seam = { seamHit: !!p.seamHit, at: this._now() };
    if (p.contactPos && Number.isFinite(p.contactPos.x) && Number.isFinite(p.contactPos.z)) {
      this._anchor = { x: p.contactPos.x, z: p.contactPos.z };
    }
  },

  _onCoreExposed(p) {
    if (!p || (p.minerId != null && !this._isPlayer(p.minerId))) return;
    const pos = this._entityPos(p.asteroidId);
    const core = {
      asteroidId: p.asteroidId,
      durationS: Number(p.durationS) || RICH_CORE_DURATION_S,
      windowPct: Number(p.windowPct) || 0,
      openedAt: this._now(),
      charging: false,
      chargeStartedAt: null,
      resolved: null,
      resolvedAt: 0,
      finalProgress: 0,
    };
    core.expiresAt = core.openedAt + core.durationS;
    core.window = richCoreWindow(core.windowPct);
    // The rock is already dead when the core exposes — capture its corpse position now; ticks
    // have stopped, so this (or the last contact) is the only truthful anchor left.
    if (pos) core.pos = pos;
    this._core = core;
  },

  _onCoreChargeStart(p) {
    if (!this._core || !p || p.asteroidId !== this._core.asteroidId) return;
    this._core.charging = true;
    this._core.chargeStartedAt = this._now();
  },

  _onCoreResolved(p, outcome) {
    if (!this._core || !p || p.asteroidId !== this._core.asteroidId) return;
    const now = this._now();
    const duration = Math.max(0.001, this._core.durationS);
    this._core.resolved = outcome;
    this._core.resolvedAt = now;
    this._core.finalProgress = this._core.charging
      ? clamp01((now - this._core.chargeStartedAt) / duration)
      : 0;
  },

  // ── per-frame presentation (the only DOM writer) ─────────────────────────────────────────────

  update(dt, state) {
    if (typeof document === 'undefined') return;
    const dom = this._ensureDom();
    if (!dom) return;
    if (state.mode !== 'flight' || (state.ui && state.ui.docked)) { this._hideAll(dom); return; }

    const reducedMotion = !!(state.settings && state.settings.video && state.settings.video.motionReduce)
      || !!(state.settings && state.settings.accessibility
        && state.settings.accessibility.motionPreference === 'reduce');
    if (dom.reducedMotion !== reducedMotion) {
      dom.reducedMotion = reducedMotion;
      dom.root.classList.toggle('mining-reduced-motion', reducedMotion);
    }

    this._state = state;
    const now = this._now();

    // Heat arc + seam word are beam-held voices; the rich-core ring survives the release edge
    // long enough to show what the release bought (see _onStop).
    const heat = this._beaming
      ? resolveHeatArc(this._heat)
      : { visible: false, pct: 0, band: 'cold', ventBand: false };
    const coreCue = resolveRichCoreCue(this._core, now);
    const seamFresh = this._beaming && this._seam && (now - this._seam.at) < SEAM_STALE_S;
    const anyVisible = heat.visible || !!seamFresh || coreCue.visible;
    if (!anyVisible) { this._hideAll(dom); return; }

    if (!this._placeMark(dom, state)) return;

    this._renderHeat(dom, heat);
    this._renderCore(dom, coreCue, now);
    this._renderSeam(dom, seamFresh ? this._seam.seamHit : null);
    this._renderAria(dom, heat, coreCue, seamFresh ? this._seam.seamHit : null);
    this._visible = true;
  },

  _renderHeat(dom, heat) {
    const mark = dom.mark;
    const pct = heat.visible ? heat.pct : 0;
    const dash = heat.visible ? `${(pct * 100).toFixed(1)} 100` : '0 100';
    if (dash !== this._lastHeatDash) {
      this._lastHeatDash = dash;
      dom.heat.setAttribute('stroke-dasharray', dash);
      dom.heatBloom.setAttribute('stroke-dasharray', dash);
    }
    // Bloom head rides the arc tip (write-on-change; quantized event stream keeps this quiet).
    const deg = pct * 360;
    const [hx, hy] = polar(DIAL / 2, DIAL / 2, HEAT_R, deg);
    const headTransform = `translate(${hx.toFixed(1)} ${hy.toFixed(1)})`;
    if (headTransform !== this._lastHeadTransform) {
      this._lastHeadTransform = headTransform;
      dom.head.setAttribute('transform', headTransform);
    }
    const showHead = heat.visible && pct > 0.02;
    if (showHead !== this._lastHeadVisible) {
      this._lastHeadVisible = showHead;
      dom.head.style.display = showHead ? 'initial' : 'none';
    }
    if (heat.ventBand !== this._lastVent) {
      this._lastVent = heat.ventBand;
      mark.classList.toggle('mining-vent', heat.visible && heat.ventBand);
    }
  },

  _renderCore(dom, cue, now) {
    const mark = dom.mark;
    const show = !!(cue && cue.visible);
    if (mark.classList.contains('mining-core') !== show) mark.classList.toggle('mining-core', show);
    if (!show) return;
    if (cue.state !== this._lastCoreState) {
      this._lastCoreState = cue.state;
      mark.classList.toggle('mining-core-charging', cue.state === 'charging');
      mark.classList.toggle('mining-core-hit', cue.state === 'hit');
      mark.classList.toggle('mining-core-fizzle', cue.state === 'fizzle');
    }
    if (cue.window !== this._lastCoreWindow) {
      this._lastCoreWindow = cue.window;
      const w0 = cue.window.lo * 360;
      const w1 = cue.window.hi * 360;
      dom.coreWindow.setAttribute('d', arcD(DIAL / 2, DIAL / 2, CORE_R, w0, Math.max(w0 + 0.01, w1)));
    }
    const dash = cue.state === 'open' ? '0 100' : `${(clamp01(cue.progress) * 100).toFixed(1)} 100`;
    if (dash !== this._lastCoreDash) {
      this._lastCoreDash = dash;
      dom.coreFill.setAttribute('stroke-dasharray', dash);
      dom.coreFillBloom.setAttribute('stroke-dasharray', dash);
    }
  },

  _renderSeam(dom, seamHit) {
    const cls = seamHit === null ? null : (seamHit ? 'mining-seam-on' : 'mining-seam-off');
    if (cls !== this._lastSeamCls) {
      this._lastSeamCls = cls;
      dom.mark.classList.toggle('mining-seam-on', cls === 'mining-seam-on');
      dom.mark.classList.toggle('mining-seam-off', cls === 'mining-seam-off');
      if (cls) dom.word.textContent = seamWordFor(seamHit);
    }
  },

  _renderAria(dom, heat, coreCue, seamHit) {
    const parts = [];
    if (heat.visible) {
      parts.push(`beam heat ${Math.round(heat.pct * 100)} percent`
        + (heat.ventBand ? ', vent band open, release to vent' : ''));
    }
    if (coreCue && coreCue.visible) {
      parts.push(coreCue.state === 'fizzle' ? 'rich core missed'
        : coreCue.state === 'hit' ? 'rich core secured'
          : coreCue.state === 'charging'
            ? `rich core charging, release at mid charge`
            : 'rich core exposed, charge the beam');
    }
    if (seamHit !== null) parts.push(seamHit ? 'on seam' : 'off seam');
    const aria = parts.join('; ') || 'mining beam';
    if (aria !== this._lastAria) {
      this._lastAria = aria;
      dom.mark.setAttribute('aria-label', aria);
    }
  },

  // World-anchored placement (massSeedHud pattern): helpers.worldToScreen on the live contact
  // point; offscreen contact hides the mark — the beam itself is the edge language, threat
  // channel owns screen-edge cues, so this instrument never invents one.
  _placeMark(dom, state) {
    const w2s = this.helpers && this.helpers.worldToScreen;
    const anchor = this._currentAnchor(state);
    if (typeof w2s !== 'function' || !anchor) {
      if (this._visible) { dom.mark.style.display = 'none'; this._visible = false; }
      return false;
    }
    const proj = w2s({ x: anchor.x, y: 0, z: anchor.z });
    if (!proj || proj.onScreen === false
      || !Number.isFinite(proj.x) || !Number.isFinite(proj.y)) {
      if (this._visible) { dom.mark.style.display = 'none'; this._visible = false; }
      return false;
    }
    if (!this._visible) { dom.mark.style.display = 'block'; this._visible = true; }
    const transform = `translate3d(${Math.round(proj.x)}px, ${Math.round(proj.y)}px, 0)`;
    if (transform !== this._lastTransform) {
      this._lastTransform = transform;
      dom.mark.style.transform = transform;
    }
    return true;
  },

  // Anchor priority: the dead rock's captured corpse position (rich core) → the latest beam
  // contact from mining:tick → the mining:start lock position.
  _currentAnchor(state) {
    const core = this._core;
    if (core && core.pos) {
      const live = this._entityPos(core.asteroidId, state);
      return live || core.pos;
    }
    return this._anchor;
  },

  _entityPos(id, state = this._state || this.state) {
    if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
    const e = state.entities.get(id);
    return e && e.pos && Number.isFinite(e.pos.x) && Number.isFinite(e.pos.z)
      ? { x: e.pos.x, z: e.pos.z }
      : null;
  },

  _now() {
    const state = this._state || this.state;
    return state && Number.isFinite(state.simTime) ? state.simTime : 0;
  },

  _isPlayer(id) {
    const state = this._state || this.state;
    return state && state.playerId != null && id === state.playerId;
  },

  _hideAll(dom) {
    if (this._visible) {
      dom.mark.style.display = 'none';
      this._visible = false;
    }
    this._lastVent = null;
    this._lastCoreState = '';
    this._lastSeamCls = null;
    this._lastCoreDash = '';
    this._lastHeatDash = '';
    this._lastHeadVisible = null;
  },

  _writeCaches() {
    this._visible = false;
    this._lastTransform = '';
    this._lastHeatDash = '';
    this._lastHeadTransform = '';
    this._lastHeadVisible = null;
    this._lastVent = null;
    this._lastCoreState = '';
    this._lastCoreWindow = null;
    this._lastCoreDash = '';
    this._lastSeamCls = null;
    this._lastAria = '';
    this._state = null;
  },

  _ensureDom() {
    if (this._dom && this._dom.root.isConnected !== false) return this._dom;
    // Capability check, not an existence check (masslineHud pattern). update() already bails when
    // `document` is absent entirely, but headless registry checks legitimately install a PARTIAL
    // document stub (createElement, never createElementNS), and this instrument is SVG geometry.
    // Testing only `typeof document === 'undefined'` lets that stub through, and the throw takes
    // the whole registry step down with it (scripts/check-sg06-live-*.mjs install exactly one).
    if (typeof document === 'undefined'
      || typeof document.createElement !== 'function'
      || typeof document.createElementNS !== 'function') return null;
    const host = document.getElementById('hud') || document.body;
    if (!host) return null;
    if (!document.getElementById('sf-mining-css')) {
      const style = document.createElement('style');
      style.id = 'sf-mining-css';
      style.textContent = MINING_HUD_CSS;
      (document.head || host).appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'sf-mining-root';

    const mark = document.createElement('div');
    mark.className = 'sf-mining-mark';
    mark.style.display = 'none';
    mark.setAttribute('role', 'img');

    const dial = svg('svg', { class: 'sf-mining-dial', viewBox: `0 0 ${DIAL} ${DIAL}`, 'aria-hidden': 'true' });
    const cx = DIAL / 2;
    // Track + the vent band, both static: the band's lower edge is the ticked rhythm.
    dial.appendChild(svg('path', { d: arcD(cx, cx, HEAT_R, 0, FULL_CIRCLE_DEG), class: 'sf-mining-track' }));
    dial.appendChild(svg('path', {
      d: arcD(cx, cx, HEAT_R, VENT_BAND_LO * 360, FULL_CIRCLE_DEG),
      class: 'sf-mining-band',
    }));
    const [tx0, ty0] = polar(cx, cx, HEAT_R - 4, VENT_BAND_LO * 360);
    const [tx1, ty1] = polar(cx, cx, HEAT_R + 4, VENT_BAND_LO * 360);
    dial.appendChild(svg('path', {
      d: `M ${tx0.toFixed(2)} ${ty0.toFixed(2)} L ${tx1.toFixed(2)} ${ty1.toFixed(2)}`,
      class: 'sf-mining-band-tick',
    }));
    // Heat fill: one closed path, pathLength 100 → dasharray IS the percentage.
    const heatBloom = svg('path', {
      d: arcD(cx, cx, HEAT_R, 0, FULL_CIRCLE_DEG), class: 'sf-mining-heat-bloom',
      pathLength: 100, 'stroke-dasharray': '0 100',
    });
    const heat = svg('path', {
      d: arcD(cx, cx, HEAT_R, 0, FULL_CIRCLE_DEG), class: 'sf-mining-heat',
      pathLength: 100, 'stroke-dasharray': '0 100',
    });
    dial.appendChild(heatBloom);
    dial.appendChild(heat);
    const head = svg('circle', { r: 2.2, class: 'sf-mining-head' });
    dial.appendChild(head);

    // Rich-core inner ring: track + sweet-spot window + charge fill.
    const coreGroup = svg('g', { class: 'sf-mining-core-ring' });
    coreGroup.appendChild(svg('path', { d: arcD(cx, cx, CORE_R, 0, FULL_CIRCLE_DEG), class: 'sf-mining-core-track' }));
    const coreWindow = svg('path', { class: 'sf-mining-core-window' });
    coreGroup.appendChild(coreWindow);
    const coreFillBloom = svg('path', {
      d: arcD(cx, cx, CORE_R, 0, FULL_CIRCLE_DEG), class: 'sf-mining-core-fill-bloom',
      pathLength: 100, 'stroke-dasharray': '0 100',
    });
    const coreFill = svg('path', {
      d: arcD(cx, cx, CORE_R, 0, FULL_CIRCLE_DEG), class: 'sf-mining-core-fill',
      pathLength: 100, 'stroke-dasharray': '0 100',
    });
    coreGroup.appendChild(coreFillBloom);
    coreGroup.appendChild(coreFill);
    dial.appendChild(coreGroup);
    mark.appendChild(dial);

    const word = document.createElement('div');
    word.className = 'sf-mining-word';
    mark.appendChild(word);

    root.appendChild(mark);
    host.appendChild(root);
    this._dom = { root, mark, dial, heat, heatBloom, head, coreWindow, coreFill, coreFillBloom, word, reducedMotion: false };
    this._writeCaches();
    return this._dom;
  },
};

export default miningHud;
