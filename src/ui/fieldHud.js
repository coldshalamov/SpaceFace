// PQ-012 / SF-12 — Field HUD (DOM-guarded "own module" pattern, massSeedHud sibling).
//
// The HUD's ONLY job is what world-space form cannot carry (bible §8.1): the exact remaining
// number, the state word, and denial REASONS (the world cannot say *why* a deploy was refused).
// Everything positional/directional/boundary lives in the world (the continuous flow + predictor).
// One socket, one readout at a time (one-voice discipline): denial > active field > cooldown.
//
// Reads only: state.fields (active / cooldowns / lastDenial), state.simTime. Writes only its own
// DOM subtree. No sim state. Fully guarded headless. Never touches hud.js/targetPanel/styles/*
// (PQ-015 lease) — it self-injects its own scoped CSS like massSeedHud.
//
// INST-01: the tell is an instrument on the deck, not a cyan web pill. The injected sheet paints
// only with the tokens that already live on #hud / :root (deckplate register, src/ui/deckplate/):
// the flight glass face, the etched legend voice, and the warm lamp as the one accent (danger is
// the lamp driven red; good news reads in bone). No hand-mixed card survives here.

import {
  CINDER_SLUICE_SECTOR_ID,
  CINDER_SLUICE_SITE_ID,
  cinderSluicePhase,
  pointInsideCinderSluice,
} from '../data/environmentalMachinery.js';

export const FIELD_HUD_CSS = `
.sf-field-pill {
  position: absolute; left: 50%; bottom: 146px; transform: translateX(-50%);
  display: none; align-items: center; gap: var(--dp-gap, 8px); padding: 5px 14px 6px;
  font-family: var(--dp-face-etch, var(--hud-data, system-ui));
  font-size: var(--dp-fs-etch, 12px); font-weight: 700; line-height: 1.2;
  font-variation-settings: "wght" 720, "wdth" 68; letter-spacing: .14em; text-transform: uppercase;
  color: var(--hud-paper, var(--dp-ink, #e8e2d4));
  background: var(--dp-glass-flight, rgb(18 23 29 / .82));
  border: 1px solid var(--hud-line, var(--dp-metal-4, #2f3542));
  border-left: 2px solid var(--dp-lamp, #f2b950);
  border-radius: var(--dp-r-instrument, 3px);
  box-shadow: none;
  text-shadow: var(--dp-emit, none);
  pointer-events: none; white-space: nowrap;
}
/* the lamp in the left edge is the state channel; the etched legend never changes voice */
.sf-field-pill.field-repulsor { color: var(--dp-lamp-hot, #ffd98c); text-shadow: var(--dp-emit-lamp, none); }
.sf-field-pill.field-denied { color: var(--dp-danger-hot, #ff8a70); border-left-color: var(--dp-danger, #ff5038); text-shadow: 0 0 10px var(--dp-danger-bloom, rgb(255 80 56 / .38)); }
.sf-field-pill.field-cooldown { color: var(--dp-ink-mute, #96948e); border-left-color: var(--dp-lamp-dim, #8a6b3a); text-shadow: var(--dp-etch-shadow, none); }
.sf-field-pill.field-current-warning { color: var(--dp-lamp-hot, #ffd98c); text-shadow: var(--dp-emit-lamp, none); }
.sf-field-pill.field-current-surge { color: var(--dp-danger-hot, #ff8a70); border-left-color: var(--dp-danger, #ff5038); text-shadow: 0 0 10px var(--dp-danger-bloom, rgb(255 80 56 / .38)); }
/* calm current is information: bone ink, no lamp lit */
.sf-field-pill.field-current-calm { border-left-color: var(--hud-line, var(--dp-metal-4, #2f3542)); }
@media (forced-colors: active) {
  .sf-field-pill { background: Canvas; color: CanvasText; border: 1px solid CanvasText; box-shadow: none; text-shadow: none; forced-color-adjust: none; }
}
`;

const KIND_LABEL = { well: 'WELL', repulsor: 'REPULSOR', cone: 'CONE' };

export const fieldHud = {
  id: 'fieldHud',
  name: 'fieldHud',

  init(ctx) {
    this.state = ctx.state;
    this.helpers = ctx.helpers || {};
    this._dom = null;
    this._lastText = '';
    this._lastClass = '';
    this._visible = false;
    this._cinderPhaseOut = {};
  },

  destroy() {
    if (this._dom && this._dom.root && this._dom.root.parentNode) this._dom.root.parentNode.removeChild(this._dom.root);
    this._dom = null;
    this._visible = false;
  },

  update(dt, state) {
    if (typeof document === 'undefined') return;
    const dom = this._ensureDom();
    if (!dom) return;
    if (state.mode !== 'flight' || (state.ui && state.ui.docked)) { this._hide(dom); return; }
    const f = state.fields || null;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const environmental = this._resolveEnvironmental(state, now);
    const { text, cls } = this._resolve(f, now, environmental);
    this._apply(dom, text, cls);
  },

  // One-voice resolution: a fresh denial wins for a beat, then an occupied environmental timing
  // corridor, then the primary active player field, then a pending cooldown. Returns { text, cls }.
  _resolve(f, now, environmental = null) {
    if (!f && !environmental) return { text: '', cls: '' };
    // Denial (transient, ~1.8s): the reason is the HUD's whole job here.
    const denial = f && f.lastDenial;
    if (denial && Number.isFinite(denial.at) && now - denial.at < 1.8) {
      const label = KIND_LABEL[denial.kind] || 'FIELD';
      if (denial.reason === 'cooldown' && Number.isFinite(denial.readyAt)) {
        return { text: `${label} DENIED — COOLDOWN ${Math.max(0, Math.ceil(denial.readyAt - now))}s`, cls: 'field-denied' };
      }
      return { text: `${label} DENIED`, cls: 'field-denied' };
    }
    if (environmental) {
      if (environmental.phase === 'quiet') {
        return { text: 'CINDER SLUICE — CURRENT QUIET', cls: 'field-current-calm' };
      }
      const seconds = Math.max(0, Math.ceil(environmental.remainingS));
      const label = environmental.phase === 'warning'
        ? 'WARNING'
        : environmental.phase === 'surge' ? 'SURGE' : 'CALM';
      const cls = environmental.phase === 'warning'
        ? 'field-current-warning'
        : environmental.phase === 'surge' ? 'field-current-surge' : 'field-current-calm';
      return { text: `CINDER SLUICE — ${label} ${seconds}s`, cls };
    }
    // Primary active field: prefer the cone (held tool), else the deployed field expiring soonest.
    const active = Array.isArray(f && f.active) ? f.active : [];
    let cone = null, soonest = null;
    for (const rec of active) {
      // Authored environmental fields use the same pooled world-space presentation but are not a
      // player deploy. Their hazard language/site clock owns the readout; never let one masquerade
      // as the player's held Clearing Cone.
      if (rec.tag === 'environmental' || rec.tag === 'npc') continue;
      if (rec.kind === 'cone') cone = rec;
      else if (!soonest || rec.expireAt < soonest.expireAt) soonest = rec;
    }
    if (cone) {
      return { text: `CONE — ${cone.engaged ? 'CLEARING' : 'PROJECTING'}`, cls: '' };
    }
    if (soonest) {
      const label = KIND_LABEL[soonest.kind] || 'FIELD';
      const remain = Number.isFinite(soonest.expireAt) ? Math.max(0, Math.ceil(soonest.expireAt - now)) : null;
      // INF-042: the pill words the enforced lifecycle — a building or fading field never
      // masquerades as a fully armed one. Records without a phase read as before.
      const stateWord = soonest.phase === 'winding' ? 'FORMING'
        : soonest.phase === 'dissipating' ? 'FADING'
          : soonest.engaged ? 'ENGAGED' : 'ARMED';
      const cls = soonest.kind === 'repulsor' ? 'field-repulsor' : '';
      return { text: remain != null ? `${label} — ${stateWord} ${remain}s` : `${label} — ${stateWord}`, cls };
    }
    // Cooldown readiness (soonest pending).
    const cds = f && f.cooldowns || {};
    let bestKind = null, bestReady = Infinity;
    for (const kind of Object.keys(cds)) {
      const until = cds[kind];
      if (Number.isFinite(until) && until - now > 0.05 && until < bestReady) { bestReady = until; bestKind = kind; }
    }
    if (bestKind) {
      return { text: `${KIND_LABEL[bestKind] || 'FIELD'} READY ${Math.max(0, Math.ceil(bestReady - now))}s`, cls: 'field-cooldown' };
    }
    return { text: '', cls: '' };
  },

  _resolveEnvironmental(state, now) {
    if (!state || state.mode !== 'flight'
      || !state.world || state.world.currentSectorId !== CINDER_SLUICE_SECTOR_ID) return null;
    const record = state.sites && state.sites.worldById
      && state.sites.worldById[CINDER_SLUICE_SITE_ID];
    const player = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    if (!record || !player || player.alive === false || !pointInsideCinderSluice(player.pos)) return null;
    if (!this._cinderPhaseOut) this._cinderPhaseOut = {};
    return cinderSluicePhase(record, now, this._cinderPhaseOut);
  },

  _apply(dom, text, cls) {
    if (!text) { this._hide(dom); return; }
    if (text !== this._lastText) {
      this._lastText = text;
      dom.pillText.textContent = text;
      dom.pill.setAttribute('aria-label', text);
    }
    if (cls !== this._lastClass) {
      this._lastClass = cls;
      dom.pill.classList.toggle('field-repulsor', cls === 'field-repulsor');
      dom.pill.classList.toggle('field-denied', cls === 'field-denied');
      dom.pill.classList.toggle('field-cooldown', cls === 'field-cooldown');
      dom.pill.classList.toggle('field-current-warning', cls === 'field-current-warning');
      dom.pill.classList.toggle('field-current-surge', cls === 'field-current-surge');
      dom.pill.classList.toggle('field-current-calm', cls === 'field-current-calm');
    }
    if (!this._visible) {
      dom.pill.style.display = 'flex';
      this._visible = true;
    }
  },

  _hide(dom) {
    if (dom && this._visible) dom.pill.style.display = 'none';
    this._visible = false;
    this._lastText = '';
  },

  _ensureDom() {
    if (this._dom && this._dom.root.isConnected !== false) return this._dom;
    const host = document.getElementById('hud') || document.body;
    if (!host) return null;
    if (!document.getElementById('sf-field-css')) {
      const style = document.createElement('style');
      style.id = 'sf-field-css';
      style.textContent = FIELD_HUD_CSS;
      (document.head || host).appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'sf-field-root';
    const pill = document.createElement('div');
    pill.className = 'sf-field-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.setAttribute('aria-atomic', 'true');
    const pillText = document.createElement('span');
    pillText.className = 'field-tag';
    pill.appendChild(pillText);
    root.appendChild(pill);
    host.appendChild(root);
    this._dom = { root, pill, pillText };
    this._lastText = '';
    this._lastClass = '';
    this._visible = false;
    return this._dom;
  },
};
