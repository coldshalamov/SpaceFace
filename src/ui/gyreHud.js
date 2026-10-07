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
import { GYRE_SNARE } from '../data/gyreSnare.js';

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
.sf-gyre-pill.gyre-full { color: var(--dp-lamp-hot, #ffd98c); border-left-color: var(--dp-lamp-hot, #ffd98c); text-shadow: var(--dp-emit-lamp, none); }
.sf-gyre-fill {
  position: absolute; left: 2px; bottom: 0; height: 2px; width: 0;
  background: linear-gradient(90deg, var(--dp-lamp, #f2b950), var(--dp-danger, #ff5038));
  border-radius: 1px; opacity: .85; pointer-events: none;
}
.sf-gyre-fuse {
  position: absolute; left: 2px; top: 0; height: 2px; width: 0;
  background: linear-gradient(90deg, var(--dp-lamp-dim, #8a6b3a), var(--dp-lamp, #f2b950));
  border-radius: 1px; opacity: .7; pointer-events: none;
}
@media (forced-colors: active) { .sf-gyre-fill { background: CanvasText; } .sf-gyre-fuse { background: CanvasText; } }
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
    this._strainOn = false; // hysteresis: enter at 0.40, exit at 0.25 — no boundary flapping
    this._bowlUntil = -1;   // simTime deadline — the BOWL read holds ~0.4 s past the 5-tick burst
    this._bowlMass = 0;
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
    const { text, cls, strain, fuse } = this._resolve(g, Number.isFinite(state.simTime) ? state.simTime : 0);
    if (!text) { this._hide(dom); return; }
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const seat = claimBottomLaneSeat('gyre', LANE_PRIORITY.active, FIELD_LANE_BASE, now);
    if (!seat.visible) { this._hide(dom); return; }
    this._apply(dom, text, cls, strain, fuse);
    this._applyLaneSeat(dom.pill, seat.bottom);
  },

  _resolve(g, now) {
    if (!g) return { text: '', cls: '' };
    // A live ball's quiet grave telegraphs on EVERY phase, not just OFF — a re-beamed
    // lash would otherwise swallow the countdown exactly while a second lash winds.
    // "+N" names the OTHER live balls still flying — the pill only mirrors the freshest,
    // but a second bowl mid-flight shouldn't make the first one's grave invisible.
    const bttl = g.ballTtlS || 0;
    const extraBalls = Math.max(0, (g.liveBalls || 0) - 1);
    let ballTxt = bttl > 0 && bttl < GYRE_SNARE.ballTtlWarnS
      ? ` · ball ${Math.max(1, Math.ceil(bttl))}s` : '';
    // Other live balls still flying read even when the primary's countdown isn't
    // running — a second bowl mid-flight shouldn't make the first one's grave silent.
    if (extraBalls > 0) {
      ballTxt += ballTxt ? ` +${extraBalls}` : ` · +${extraBalls} ball${extraBalls > 1 ? 's' : ''}`;
    }
    // Fuse speaks during BEAM too — a lashing <8 s from dry shouldn't announce itself
    // only through the after-the-fact dry toast.
    const fuseS = g.fuseS || 0;
    const fuseTxt = fuseS > 0 && fuseS < GYRE_SNARE.fuseWarnVisS ? ` · ${Math.max(1, Math.ceil(fuseS))}s` : '';
    if (!g.phase || g.phase === 'off') {
      // A thrown clump still on the map deserves a quiet "it's yours" dot for its short flight.
      if (g && g.launchedId != null) {
        // The launch beat lands first: BOWL survives ~0.4 s past the burst ticks before
        // the pill flips to BALL AWAY.
        if (now < this._bowlUntil) {
          return { text: `GYRE — BOWL ${this._bowlMass}t`, cls: 'gyre-launched' };
        }
        const mass = Math.round(g.ballMass || 0);
        // A sweep-adopted ball has no member ledger (ballMembers never serialized) —
        // "×1" would claim it ate nothing. Show mass only until the ledger exists.
        const count = g.members == null ? null : (g.absorbs || 0) + 1;
        // The thrown ball's 9 s flight is otherwise silent — the same ·Ns countdown
        // the fuse uses telegraphs the quiet-TTL grave before the ribbon just dims.
        const ttlS = g.ballTtlS || 0;
        const ttlTxt = ttlS > 0 && ttlS < GYRE_SNARE.ballTtlWarnS ? ` · ${Math.max(1, Math.ceil(ttlS))}s` : '';
        const label = mass > 0 ? (count != null ? `GYRE — BALL AWAY ×${count} · ${mass}t` : `GYRE — BALL AWAY · ${mass}t`) : 'GYRE — BALL AWAY';
        return { text: label + ttlTxt, cls: 'gyre-ball' };
      }
      return { text: '', cls: '' };
    }
    if (g.phase === 'launching') {
      this._bowlUntil = now + 0.4;
      this._bowlMass = Math.round(g.clumpMass || 0);
      return { text: `GYRE — BOWL ${this._bowlMass}t${ballTxt}`, cls: 'gyre-launched' };
    }
    if (g.phase === 'holding') {
      const count = (g.absorbs || 0) + 1;
      const mass = Math.round(g.clumpMass || 0);
      const s = g.strain01 || 0;
      if (s > 0.4) this._strainOn = true;
      else if (s < 0.25) this._strainOn = false;
      // Funnel still feeding while held: "+N" keeps katamari anticipation legible —
      // basinCount publishes through HOLD, so the ball's next meal is named.
      const net = g.basinCount || 0;
      const tail = net > 0 ? ` +${net}` : '';
      // Mass-scaled cap drain makes the fuse legible BEFORE the dry auto-bowl: under ~8 s
      // of burn the readout appends the countdown and the top fuse bar drains with it.
      const fuse = fuseS;
      if (this._strainOn) {
        return { text: `GYRE — STRAIN ×${count} · ${mass}t${tail}${fuseTxt}${ballTxt}`, cls: 'gyre-strain', strain: s, fuse };
      }
      // Saturation reads: the cap is a hard ceiling, so "why isn't it eating?" gets a flag.
      const full = g.maxClumpMass != null && (g.clumpMass || 0) >= g.maxClumpMass;
      if (full) {
        return { text: `GYRE — ×${count} · ${mass}t FULL${tail}${fuseTxt}${ballTxt}`, cls: 'gyre-full', strain: s, fuse };
      }
      return { text: `GYRE — ×${count} · ${mass}t${tail}${fuseTxt}${ballTxt}`, cls: 'gyre-holding', strain: s, fuse };
    }
    // Net anticipation: material already inside the cone names the catch before it
    // lands — "×N IN NET" instead of a bare SEARCHING sweep. A beam towing only
    // non-absorbables (loot it drags but never eats) gets its own word: TOWING ×N —
    // the "why won't it snag?" read instead of silence.
    const net = g.basinCount || 0;
    const tow = g.towCount || 0;
    if (net > 0) {
      return { text: `GYRE — ×${net} IN NET${fuseTxt}${ballTxt}`, cls: '', fuse: fuseS };
    }
    if (tow > 0) {
      return { text: `GYRE — TOWING ×${tow}${fuseTxt}${ballTxt}`, cls: '', fuse: fuseS };
    }
    return { text: `GYRE — SEARCHING${fuseTxt}${ballTxt}`, cls: '', fuse: fuseS };
  },

  _apply(dom, text, cls, strain, fuse) {
    if (!text) { this._hide(dom); return; }
    if (text !== this._lastText) {
      this._lastText = text;
      dom.pillText.textContent = text;
      dom.pill.setAttribute('aria-label', text);
    }
    // The continuous strain01 rides a thin fill bar under the pill — the eye gets
    // the slip building long before the binary STRAIN flag flips at 0.40.
    const s = Math.max(0, Math.min(1, Number.isFinite(strain) ? strain : 0));
    dom.fill.style.width = `${Math.round(s * 100)}%`;
    dom.fill.style.display = s > 0.02 ? 'block' : 'none';
    // Fuse bar (top edge): cap ÷ current drain, clamped to an 8 s window — a shrinking
    // countdown. Only the hold family carries it; a beaming-empty fuse is long and the
    // constant bar would be noise.
    const f = Number.isFinite(fuse) ? Math.max(0, Math.min(1, fuse / GYRE_SNARE.fuseWarnVisS)) : 0;
    dom.fuse.style.width = `${Math.round(f * 100)}%`;
    // Only the last fuseWarnVisS s draw: a healthy burn pinning the bar at 100% is
    // noise, not signal — the countdown language is the same gate the ·Ns text uses.
    dom.fuse.style.display = f > 0.02 && fuse < GYRE_SNARE.fuseWarnVisS ? 'block' : 'none';
    if (cls !== this._lastClass) {
      this._lastClass = cls;
      dom.pill.classList.toggle('gyre-holding', cls === 'gyre-holding');
      dom.pill.classList.toggle('gyre-strain', cls === 'gyre-strain');
      dom.pill.classList.toggle('gyre-launched', cls === 'gyre-launched');
      dom.pill.classList.toggle('gyre-ball', cls === 'gyre-ball');
      dom.pill.classList.toggle('gyre-full', cls === 'gyre-full');
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
    pill.appendChild(pillText);
    const fill = document.createElement('span');
    fill.className = 'sf-gyre-fill';
    fill.style.display = 'none';
    pill.appendChild(fill);
    const fuse = document.createElement('span');
    fuse.className = 'sf-gyre-fuse';
    fuse.style.display = 'none';
    pill.appendChild(fuse);
    root.appendChild(pill);
    host.appendChild(root);
    this._dom = { root, pill, pillText, fill, fuse };
    this._lastText = '';
    this._lastClass = '';
    this._visible = false;
    this._laneSeat = '';
    return this._dom;
  },
};
