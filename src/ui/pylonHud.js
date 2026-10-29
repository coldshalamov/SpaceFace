// Linked Shield Pylons HUD (DOM-guarded, massSeedHud / gyreHud sibling).
//
// One pill that always NAMES THE NEXT OPERATION of the one deploy key, with the key read live from
// the binding owner (never typed): "PYLON 6 · PLACE FIRST ENDPOINT", "… · LINK SECOND ENDPOINT",
// "… · RECALL PAIR" while the aim sits on a pylon, "… · CAPACITY REACHED". With a wall standing it
// leads with the ONE primary shield resource and the most relevant failure cause: "WALL 84% 31s",
// "WALL STRAINED 22%", "WALL OFFLINE 4s", "WALL COLLAPSE IN 5s". Text first, so no state depends on
// colour or motion; nothing flashes. Shares the bottom-center lane contract (src/ui/hudLayout.js):
// the idle "place first endpoint" hint is a cooldown-class voice and yields to any load-bearing pill.
//
// Reads only: state.shieldPylons (the system's runtime mirror, never serialized), the fitted
// module, input bindings. Writes only its own DOM subtree. Fully guarded headless.

import {
  MSEED_LANE_BASE,
  LANE_PRIORITY,
  claimBottomLaneSeat,
  releaseBottomLaneClaim,
} from './hudLayout.js';
import { resolveActionLabel } from '../systems/input.js';
import { pylonNextOperation, pylonCapacity, pylonCapacityForSpan } from '../systems/shieldPylons.js';
import { PYLON_STATES as S, PYLON_DENIALS as DENY, SHIELD_PYLON_DEF as DEF } from '../data/shieldPylons.js';
import { pylonMirror } from '../combat/pylonShieldQuery.js';

export const PYLON_HUD_CSS = `
.sf-pylon-pill {
  position: absolute; left: 50%; bottom: ${MSEED_LANE_BASE}px; transform: translateX(-50%);
  display: none; align-items: center; gap: var(--dp-gap, 8px); padding: 5px 14px 6px;
  font-family: var(--dp-face-etch, var(--hud-data, system-ui));
  font-size: var(--dp-fs-etch, 12px); font-weight: 700; line-height: 1.2;
  font-variation-settings: "wght" 720, "wdth" 68; letter-spacing: .14em; text-transform: uppercase;
  color: var(--hud-paper, var(--dp-ink, #e8e2d4));
  background: var(--dp-glass-flight, rgb(18 23 29 / .82));
  border: 1px solid var(--hud-line, var(--dp-metal-4, #2f3542));
  border-left: 2px solid var(--dp-lamp, #f2b950);
  border-radius: var(--dp-r-instrument, 3px);
  box-shadow: none; text-shadow: var(--dp-emit, none);
  pointer-events: none; white-space: nowrap; z-index: 7;
}
.sf-pylon-pill.pylon-warning { color: var(--dp-lamp-hot, #ffd98c); text-shadow: var(--dp-emit-lamp, none); }
.sf-pylon-pill.pylon-idle { color: var(--dp-ink-mute, #96948e); border-left-color: var(--dp-lamp-dim, #8a6b3a); text-shadow: var(--dp-etch-shadow, none); }
.sf-pylon-pill .pylon-op { opacity: .92; }
@media (max-width:640px) {
  .sf-pylon-pill { box-sizing:border-box; width:max-content; max-width:calc(100vw - 24px);
    flex-direction:column; gap:0; padding:0 12px; line-height:1; white-space:normal; text-align:center; }
}
@media (forced-colors: active) {
  .sf-pylon-pill { background: Canvas; color: CanvasText; border: 1px solid CanvasText; box-shadow: none; text-shadow: none; forced-color-adjust: none; }
}
`;

// These are instructions for the existing placement plan, never a second eligibility rule.
const PLACEMENT_HINTS = Object.freeze({
  [DENY.cooldown]: 'Projector recharging',
  [DENY.funds]: `Need ${DEF.endpointCostCredits} credits`,
  [DENY.clearance]: 'Choose clear space',
  [DENY.tooClose]: 'Move second endpoint farther away',
  [DENY.tooFar]: 'Move second endpoint closer',
  [DENY.range]: 'Move within placement range',
  [DENY.occupiedSpan]: 'Clear the hostile from the span',
});

function nowOf(state) { return Number.isFinite(state && state.simTime) ? state.simTime : 0; }

/**
 * The pill's two voices, as pure data: { status, op, tone }. `status` is the wall's one primary
 * resource and failure cause ('' with no wall), `op` the next-operation label from the system,
 * `tone` one of 'idle' | 'active' | 'warning'. Returns null when the projector is not fitted.
 */
export function resolvePylonHud(state) {
  if (!state || !(pylonCapacity(state) > 0)) return null;
  const key = resolveActionLabel(state, 'deployShieldPylon') || '';
  const next = pylonNextOperation(state);
  const m = pylonMirror(state);
  const now = nowOf(state);
  let status = '';
  let tone = 'idle';
  const pairs = m ? m.pairs.filter((p) => p.ownerId === state.playerId) : [];
  if (pairs.length) {
    tone = 'active';
    // The most relevant pair: a failing one outranks a healthy one; otherwise the weakest standing wall.
    const rank = (p) => (p.state === S.OVERLOADED || p.state === S.RECOVERING ? 0
      : p.state === S.STRAINED ? 1 : p.state === S.ACTIVE ? 2 : p.state === S.LINKING ? 3 : 4);
    const frac = (p) => (p.capacity > 0 ? p.energy / p.capacity : 1);
    const pair = pairs.slice().sort((a, b) => (rank(a) - rank(b)) || (frac(a) - frac(b)) || (a.id < b.id ? -1 : 1))[0];
    const pct = Math.round(Math.max(0, Math.min(1, frac(pair))) * 100);
    const remaining = Math.max(0, Math.ceil(pair.expireAt - now));
    switch (pair.state) {
      case S.UNPAIRED: status = 'PYLON DOWN'; break;
      case S.LINKING: status = `LINKING ${Math.max(0, pair.activeAt - now).toFixed(1)}s`; break;
      case S.ACTIVE:
        if (pair.warnAt > 0 && now >= pair.warnAt) { status = `WALL COLLAPSE IN ${remaining}s`; tone = 'warning'; }
        else status = `WALL ${pct}% ${remaining}s`;
        break;
      case S.STRAINED: status = `WALL STRAINED ${pct}%`; tone = 'warning'; break;
      case S.OVERLOADED: status = `WALL OFFLINE ${Math.max(0, Math.ceil(pair.overloadUntil - now))}s`; tone = 'warning'; break;
      case S.RECOVERING: status = 'WALL RECOVERING'; tone = 'warning'; break;
      default: status = '';
    }
  }
  let op = next.id === 'full' ? `${next.label} - aim at a pylon to recall` : next.label;
  let preview = null;
  if (next.ok && next.id === 'second' && Number.isFinite(next.span)) {
    // Preview the same capacity the owner will commit, before the second endpoint spends.
    // Moving the aim makes the compact/strong versus long/thin tradeoff visible without a press.
    preview = { span: next.span, capacity: pylonCapacityForSpan(next.span), cost: DEF.endpointCostCredits };
    const span = Math.round(preview.span), capacity = Math.round(preview.capacity);
    if (!status || status === 'PYLON DOWN') status = `${span} u · ${capacity} SHIELD · ${preview.cost} CR`;
    else op += ` · ${span}u/${capacity}SP`; // a standing wall's resource/warning remains first
  } else if (!next.ok && PLACEMENT_HINTS[next.reason]) {
    op = PLACEMENT_HINTS[next.reason];
  }
  return { status, op, key, tone: pairs.length ? tone : 'idle', next, preview };
}

export const pylonHud = {
  name: 'pylonHud',

  init(ctx) {
    this.state = ctx.state;
    this.helpers = ctx.helpers || {};
    this._dom = null;
    this._last = '';
    this._lastClass = '';
    this._visible = false;
    this._laneSeat = '';
  },

  destroy() {
    if (this._dom && this._dom.pill && this._dom.pill.parentNode) this._dom.pill.parentNode.removeChild(this._dom.pill);
    releaseBottomLaneClaim('pylon');
    this._dom = null;
    this._visible = false;
    this._laneSeat = '';
  },

  update(dt, state) {
    if (typeof document === 'undefined') return;
    if (state.mode !== 'flight' || (state.ui && state.ui.docked)) { this._hide(); return; }
    const view = resolvePylonHud(state);
    if (!view) { this._hide(); return; }
    const dom = this._ensureDom();
    if (!dom) return;
    const now = nowOf(state);
    // The idle "place first endpoint" hint is the quietest voice on the lane; any wall is load-bearing.
    const priority = view.tone === 'idle' ? LANE_PRIORITY.cooldown : LANE_PRIORITY.active;
    const seat = claimBottomLaneSeat('pylon', priority, MSEED_LANE_BASE, now);
    if (!seat.visible) { this._hide(); return; }
    const keyed = view.key ? `PYLON ${view.key}` : 'PYLON';
    const statusText = view.status ? `${view.status} · ` : '';
    const text = `${statusText}${keyed} · ${view.op}`;
    if (text !== this._last) {
      this._last = text;
      dom.status.textContent = view.status ? `${view.status} · ` : '';
      dom.op.textContent = `${keyed} · ${view.op}`;
      dom.pill.setAttribute('aria-label', text);
    }
    const cls = view.tone === 'warning' ? 'pylon-warning' : view.tone === 'idle' ? 'pylon-idle' : '';
    if (cls !== this._lastClass) {
      this._lastClass = cls;
      dom.pill.classList.toggle('pylon-warning', cls === 'pylon-warning');
      dom.pill.classList.toggle('pylon-idle', cls === 'pylon-idle');
    }
    if (!this._visible) { dom.pill.style.display = 'flex'; this._visible = true; }
    const next = seat.bottom === MSEED_LANE_BASE ? '' : `${seat.bottom}px`;
    if (next !== this._laneSeat) { this._laneSeat = next; dom.pill.style.bottom = next; }
  },

  _hide() {
    releaseBottomLaneClaim('pylon');
    if (this._dom && this._visible) {
      this._dom.pill.style.display = 'none';
      if (this._laneSeat) { this._dom.pill.style.bottom = ''; this._laneSeat = ''; }
    }
    this._visible = false;
    this._last = '';
  },

  _ensureDom() {
    if (this._dom && this._dom.pill.isConnected !== false) return this._dom;
    const host = document.getElementById('hud') || document.body;
    if (!host) return null;
    if (!document.getElementById('sf-pylon-css')) {
      const style = document.createElement('style');
      style.id = 'sf-pylon-css';
      style.textContent = PYLON_HUD_CSS;
      (document.head || host).appendChild(style);
    }
    const pill = document.createElement('div');
    pill.className = 'sf-pylon-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.setAttribute('aria-atomic', 'true');
    const status = document.createElement('span');
    status.className = 'pylon-status';
    const op = document.createElement('span');
    op.className = 'pylon-op';
    pill.appendChild(status);
    pill.appendChild(op);
    host.appendChild(pill);
    this._dom = { pill, status, op };
    this._last = '';
    this._lastClass = '';
    this._visible = false;
    this._laneSeat = '';
    return this._dom;
  },
};

