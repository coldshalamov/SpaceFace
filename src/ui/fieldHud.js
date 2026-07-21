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

const FIELD_HUD_CSS = `
.sf-field-pill {
  position: absolute; left: 50%; bottom: 146px; transform: translateX(-50%);
  display: none; align-items: center; gap: 8px; padding: 4px 12px;
  font: 600 12px/1.2 "Segoe UI", system-ui, sans-serif; letter-spacing: 0.08em;
  color: #cfe8ff; background: rgba(10, 18, 28, 0.72); border: 1px solid rgba(120, 190, 235, 0.4);
  border-radius: 3px; pointer-events: none; white-space: nowrap;
}
.sf-field-pill .field-tag { font-weight: 700; }
.sf-field-pill.field-repulsor { color: #ffe0b0; border-color: rgba(240, 180, 90, 0.5); }
.sf-field-pill.field-denied { color: #ffb0a0; border-color: rgba(240, 110, 90, 0.6); }
.sf-field-pill.field-cooldown { color: #9fb4c8; border-color: rgba(120, 140, 160, 0.35); }
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
  },

  destroy() {
    if (this._dom && this._dom.root && this._dom.root.parentNode) this._dom.root.parentNode.removeChild(this._dom.root);
    this._dom = null;
  },

  update(dt, state) {
    if (typeof document === 'undefined') return;
    const dom = this._ensureDom();
    if (!dom) return;
    if (state.mode !== 'flight' || (state.ui && state.ui.docked)) { this._hide(dom); return; }
    const f = state.fields || null;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const { text, cls } = this._resolve(f, now);
    this._apply(dom, text, cls);
  },

  // One-voice resolution: a fresh denial wins for a beat, then the primary active field, then a
  // pending cooldown. Returns { text, cls }.
  _resolve(f, now) {
    if (!f) return { text: '', cls: '' };
    // Denial (transient, ~1.8s): the reason is the HUD's whole job here.
    const denial = f.lastDenial;
    if (denial && Number.isFinite(denial.at) && now - denial.at < 1.8) {
      const label = KIND_LABEL[denial.kind] || 'FIELD';
      if (denial.reason === 'cooldown' && Number.isFinite(denial.readyAt)) {
        return { text: `${label} DENIED — COOLDOWN ${Math.max(0, Math.ceil(denial.readyAt - now))}s`, cls: 'field-denied' };
      }
      return { text: `${label} DENIED`, cls: 'field-denied' };
    }
    // Primary active field: prefer the cone (held tool), else the deployed field expiring soonest.
    const active = Array.isArray(f.active) ? f.active : [];
    let cone = null, soonest = null;
    for (const rec of active) {
      if (rec.kind === 'cone') cone = rec;
      else if (!soonest || rec.expireAt < soonest.expireAt) soonest = rec;
    }
    if (cone) {
      return { text: `CONE — ${cone.engaged ? 'CLEARING' : 'PROJECTING'}`, cls: '' };
    }
    if (soonest) {
      const label = KIND_LABEL[soonest.kind] || 'FIELD';
      const remain = Number.isFinite(soonest.expireAt) ? Math.max(0, Math.ceil(soonest.expireAt - now)) : null;
      const stateWord = soonest.engaged ? 'ENGAGED' : 'ARMED';
      const cls = soonest.kind === 'repulsor' ? 'field-repulsor' : '';
      return { text: remain != null ? `${label} — ${stateWord} ${remain}s` : `${label} — ${stateWord}`, cls };
    }
    // Cooldown readiness (soonest pending).
    const cds = f.cooldowns || {};
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
    }
    dom.pill.style.display = 'flex';
  },

  _hide(dom) {
    if (dom) dom.pill.style.display = 'none';
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
    return this._dom;
  },
};
