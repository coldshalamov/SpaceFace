// Gyre Snare HUD (DOM-guarded, fieldHud sibling).
//
// The pill reports the held-verb lash's one-voice state: SEARCHING while the basin pulls,
// the katamari's live mass/count while it holds, STRAIN when the tethered ball nears the
// break distance, and BALL AWAY for the thrown bowling ball's short flight. Shares the
// bottom-center lane contract (src/ui/hudLayout.js); writes only its own DOM subtree.

import {
  FIELD_LANE_BASE,
  LANE_PRIORITY,
  claimBottomLaneSeat,
  releaseBottomLaneClaim,
} from './hudLayout.js';

export const GYRE_HUD_CSS = `
.sf-gyre-pill {
  position: absolute; left: 50%; bottom: ${FIELD_LANE_BASE}px; transform: translateX(-50%);
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
.sf-gyre-pill.gyre-holding { color: var(--dp-lamp-hot, #ffd98c); text-shadow: var(--dp-emit-lamp, none); }
.sf-gyre-pill.gyre-strain { color: var(--dp-danger-hot, #ff8a70); border-left-color: var(--dp-danger, #ff5038); text-shadow: 0 0 10px var(--dp-danger-bloom, rgb(255 80 56 / .38)); }
.sf-gyre-pill.gyre-launched { color: var(--dp-lamp-hot, #ffd98c); text-shadow: var(--dp-emit-lamp, none); }
.sf-gyre-pill.gyre-ball { border-left-color: var(--dp-lamp-dim, #8a6b3a); }
@media (forced-colors: active) {
  .sf-gyre-pill { background: Canvas; color: CanvasText; border: 1px solid CanvasText; box-shadow: none; text-shadow: none; forced-color-adjust: none; }
}
`;

export const gyreHud = {
  id: 'gyreHud',
  name: 'gyreHud',

  init(ctx) {
    this.state = ctx.state;
    this.helpers = ctx.helpers || {};
    this._dom = null;
    this._lastText = '';
    this._lastClass = '';
    this._visible = false;
    this._laneSeat = '';
  },

  destroy() {
    if (this._dom && this._dom.root && this._dom.root.parentNode) this._dom.root.parentNode.removeChild(this._dom.root);
    releaseBottomLaneClaim('gyre');
    this._dom = null;
    this._visible = false;
    this._laneSeat = '';
  },

  update(dt, state) {
    if (typeof document === 'undefined') return;
    const dom = this._ensureDom();
    if (!dom) return;
    if (state.mode !== 'flight' || (state.ui && state.ui.docked)) { this._hide(dom); return; }
    const g = state.gyreSnare || null;
    const { text, cls } = this._resolve(g);
    if (!text) { this._hide(dom); return; }
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const seat = claimBottomLaneSeat('gyre', LANE_PRIORITY.active, FIELD_LANE_BASE, now);
    if (!seat.visible) { this._hide(dom); return; }
    this._apply(dom, text, cls);
    this._applyLaneSeat(dom.pill, seat.bottom);
  },

  _resolve(g) {
    if (!g || !g.phase || g.phase === 'off') {
      // A thrown clump still on the map deserves a quiet "it's yours" dot for its short flight.
      if (g && g.launchedId != null) {
        return { text: 'GYRE — BALL AWAY', cls: 'gyre-ball' };
      }
      return { text: '', cls: '' };
    }
    if (g.phase === 'launching') {
      return { text: `GYRE — BOWL ${Math.round(g.clumpMass || 0)}t`, cls: 'gyre-launched' };
    }
    if (g.phase === 'holding') {
      const count = (g.absorbs || 0) + 1;
      const mass = Math.round(g.clumpMass || 0);
      if ((g.strain01 || 0) > 0.35) {
        return { text: `GYRE — STRAIN ${mass}t`, cls: 'gyre-strain' };
      }
      return { text: `GYRE — ${count} MASS ${mass}t`, cls: 'gyre-holding' };
    }
    return { text: 'GYRE — SEARCHING', cls: '' };
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
      dom.pill.classList.toggle('gyre-holding', cls === 'gyre-holding');
      dom.pill.classList.toggle('gyre-strain', cls === 'gyre-strain');
      dom.pill.classList.toggle('gyre-launched', cls === 'gyre-launched');
      dom.pill.classList.toggle('gyre-ball', cls === 'gyre-ball');
    }
    if (!this._visible) {
      dom.pill.style.display = 'flex';
      this._visible = true;
    }
  },

  _applyLaneSeat(pill, bottom) {
    const next = bottom === FIELD_LANE_BASE ? '' : `${bottom}px`;
    if (next === this._laneSeat) return;
    this._laneSeat = next;
    pill.style.bottom = next;
  },

  _hide(dom) {
    releaseBottomLaneClaim('gyre');
    if (dom && this._visible) {
      dom.pill.style.display = 'none';
      if (this._laneSeat) { dom.pill.style.bottom = ''; this._laneSeat = ''; }
    }
    this._visible = false;
    this._lastText = '';
  },

  _ensureDom() {
    if (this._dom && this._dom.root.isConnected !== false) return this._dom;
    const host = document.getElementById('hud') || document.body;
    if (!host) return null;
    if (!document.getElementById('sf-gyre-css')) {
      const style = document.createElement('style');
      style.id = 'sf-gyre-css';
      style.textContent = GYRE_HUD_CSS;
      (document.head || host).appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'sf-gyre-root';
    const pill = document.createElement('div');
    pill.className = 'sf-gyre-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.setAttribute('aria-atomic', 'true');
    const pillText = document.createElement('span');
    pillText.className = 'gyre-tag';
    pill.appendChild(pillText);
    root.appendChild(pill);
    host.appendChild(root);
    this._dom = { root, pill, pillText };
    this._lastText = '';
    this._lastClass = '';
    this._visible = false;
    this._laneSeat = '';
    return this._dom;
  },
};
