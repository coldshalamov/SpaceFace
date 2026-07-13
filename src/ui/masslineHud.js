// Massline HUD surfaces (Wave M2, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// Three read-only surfaces over massline2 runtime state, in the BP-11 "SYSTEMS-only surfacing
// module" style (DOM fully guarded; no hud.js edits; own scoped CSS; pointer-events none):
//
//   1. RELEASE-TIMING INDICATOR — the glowing read Robin asked for. While a throw is armed, a
//      diamond sits on the predicted intercept and ramps cool cyan → hot amber as the payload's
//      velocity sweeps toward the solution, pulsing white when the window is open ("release
//      NOW"). While merely latched with a selected target, a dimmer chevron shows the same read
//      for YOUR OWN exit (the self-sling timing).
//   2. CLOAK DETECTION RING — the world-radius circle showing how close someone must be to see
//      you; grows with thrust/fire, shrinks while coasting dark (pixel radius derived from
//      worldToScreen like the hud.js target arcs).
//   3. METER CHIPS — bullet-time and cloak energy as sf-chip pills with micro-fills, in a
//      standalone cluster beside the bottom-left stack (its own container; the three-anchor
//      layout contract is untouched).
//
// Reads only: state.massline2.*, state.player.tether, entities, helpers.worldToScreen. Writes
// nothing but its own DOM. Runs late in UPDATE_ORDER; every update exits immediately when the
// master flag is off or the DOM is absent (headless-safe by construction).
import { massline2Flag } from '../data/featureFlags.js';

// Lead moving intercept targets by half a fixed sim step. The 60 ms CSS tween then bridges the
// slower real-time cadence when bullet time reduces sim updates to ~21 Hz.
const MARK_PREDICTION_S = 1 / 120;

const CSS = `
#sf-ml2 { position:absolute; inset:0; pointer-events:none; z-index:6; }
#sf-ml2 .ml2-mark { position:absolute; left:0; top:0; will-change:transform;
  transition:transform 60ms linear; }
#sf-ml2 .ml2-throw { width:26px; height:26px; margin:-13px 0 0 -13px; }
#sf-ml2 .ml2-throw .ml2-diamond { width:100%; height:100%; transform:rotate(45deg);
  border:2px solid var(--ml2-c,#5fd7ff); box-shadow:0 0 10px var(--ml2-c,#5fd7ff);
  transition:border-color 80ms linear, box-shadow 80ms linear; }
#sf-ml2 .ml2-throw.ml2-hot .ml2-diamond { animation:ml2pulse 0.5s ease-in-out infinite; }
@keyframes ml2pulse { 0%,100% { transform:rotate(45deg) scale(1); } 50% { transform:rotate(45deg) scale(1.3); } }
#sf-ml2 .ml2-self { width:0; height:0; margin:-7px 0 0 -7px;
  border-left:7px solid transparent; border-right:7px solid transparent;
  border-bottom:12px solid var(--ml2-c,#5fd7ff); opacity:0.7; filter:drop-shadow(0 0 6px var(--ml2-c,#5fd7ff)); }
#sf-ml2 svg.ml2-ring { position:absolute; left:0; top:0; overflow:visible; }
#sf-ml2 .ml2-ring circle { fill:rgba(95,215,255,0.04); stroke:#5fd7ff; stroke-width:1.4;
  stroke-dasharray:10 7; opacity:0.55; }
#sf-ml2 .ml2-meters { position:absolute; left:22px; bottom:158px; display:flex; flex-direction:column;
  gap:6px; align-items:flex-start; }
#sf-ml2 .ml2-pill { display:flex; align-items:center; gap:7px; padding:3px 9px; border-radius:999px;
  background:rgba(10,16,24,0.62); border:1px solid rgba(148,163,184,0.28);
  font:600 10px/1.4 system-ui, sans-serif; letter-spacing:0.08em; color:#cbd5e1; }
#sf-ml2 .ml2-pill .ml2-fill { width:64px; height:4px; border-radius:2px; background:rgba(148,163,184,0.22);
  position:relative; overflow:hidden; }
#sf-ml2 .ml2-pill .ml2-fill i { position:absolute; inset:0; transform-origin:left center; background:#5fd7ff; }
#sf-ml2 .ml2-pill.ml2-on { border-color:#5fd7ff; color:#e0f6ff; }
#sf-ml2 .ml2-pill.ml2-cloak .ml2-fill i { background:#9f8bff; }
#sf-ml2 .ml2-pill.ml2-cloak.ml2-on { border-color:#9f8bff; color:#efeaff; }
#sf-ml2.ml2-reduced-motion .ml2-mark { transition:none; }
#sf-ml2.ml2-reduced-motion .ml2-throw.ml2-hot .ml2-diamond { animation:none; }
@media (prefers-reduced-motion: reduce) {
  #sf-ml2 .ml2-mark { transition:none; }
  #sf-ml2 .ml2-throw.ml2-hot .ml2-diamond { animation:none; }
}
`;

export const masslineHud = {
  id: 'masslineHud',
  name: 'masslineHud',

  init(ctx) {
    this.state = ctx.state;
    this.helpers = ctx.helpers;
    this._dom = null;
  },

  destroy() {
    if (this._dom && this._dom.root && this._dom.root.parentNode) {
      this._dom.root.parentNode.removeChild(this._dom.root);
    }
    this._dom = null;
  },

  update(dt, state) {
    if (typeof document === 'undefined') return;
    if (!massline2Flag('enabled')) { this._hideAll(); return; }
    const dom = this._ensureDom();
    if (!dom) return;
    if (state.mode !== 'flight' || (state.ui && state.ui.docked)) { this._hideAll(); return; }
    const w2s = this.helpers && this.helpers.worldToScreen;
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (typeof w2s !== 'function' || !player || !player.alive) { this._hideAll(); return; }

    const ml2 = state.massline2 || {};
    const reducedMotion = !!(state.settings && state.settings.video && state.settings.video.motionReduce)
      || !!(state.settings && state.settings.accessibility
        && state.settings.accessibility.motionPreference === 'reduce');
    dom.root.classList.toggle('ml2-reduced-motion', reducedMotion);
    this._updateThrowMark(dom, ml2.throw, state, w2s);
    this._updateSelfMark(dom, ml2.throw, state, w2s);
    this._updateCloakRing(dom, ml2.cloak, player, w2s);
    this._updateMeters(dom, ml2);
  },

  _updateThrowMark(dom, throwState, state, w2s) {
    const solution = throwState && throwState.armed ? throwState.solution : null;
    if (!solution || !solution.valid) { dom.throwEl.style.display = 'none'; return; }
    const payload = state.entities.get(throwState.payloadId);
    if (!payload || !payload.pos) { dom.throwEl.style.display = 'none'; return; }
    // Place the diamond on the intercept ray at either the aim entity or a fixed reach — the
    // POSITION names the consequence ("the rock goes THERE"), the COLOR names the timing.
    const aim = throwState.aimTargetId != null ? state.entities.get(throwState.aimTargetId) : null;
    const px = aim && aim.pos
      ? aim.pos.x + finite(aim.vel && aim.vel.x) * MARK_PREDICTION_S
      : payload.pos.x + Math.cos(solution.interceptAngle) * 220;
    const pz = aim && aim.pos
      ? aim.pos.z + finite(aim.vel && aim.vel.z) * MARK_PREDICTION_S
      : payload.pos.z + Math.sin(solution.interceptAngle) * 220;
    const proj = w2s({ x: px, y: 0, z: pz });
    if (!proj || !proj.onScreen) { dom.throwEl.style.display = 'none'; return; }
    dom.throwEl.style.display = 'block';
    dom.throwEl.style.transform = `translate3d(${proj.x}px, ${proj.y}px, 0)`;
    const hot = !!solution.onSolution;
    dom.throwEl.classList.toggle('ml2-hot', hot);
    dom.throwEl.style.setProperty('--ml2-c', rampColor(solution.errorRad, solution.tolRad, hot));
  },

  _updateSelfMark(dom, throwState, state, w2s) {
    const self = throwState && !throwState.armed ? throwState.selfSolution : null;
    if (!self) { dom.selfEl.style.display = 'none'; return; }
    const target = state.entities.get(self.targetId);
    if (!target || !target.pos) { dom.selfEl.style.display = 'none'; return; }
    const proj = w2s({ x: target.pos.x, y: 0, z: target.pos.z });
    if (!proj || !proj.onScreen) { dom.selfEl.style.display = 'none'; return; }
    dom.selfEl.style.display = 'block';
    dom.selfEl.style.transform = `translate3d(${proj.x}px, ${proj.y - 26}px, 0)`;
    dom.selfEl.style.setProperty('--ml2-c', rampColor(self.errorRad, self.tolRad, self.onSolution));
  },

  _updateCloakRing(dom, cloakState, player, w2s) {
    if (!cloakState || !cloakState.active || !(cloakState.radius > 0)) {
      dom.ringSvg.style.display = 'none';
      return;
    }
    const center = w2s({ x: player.pos.x, y: 0, z: player.pos.z });
    const edge = w2s({ x: player.pos.x + cloakState.radius, y: 0, z: player.pos.z });
    if (!center || !Number.isFinite(center.x) || !edge || !Number.isFinite(edge.x)) {
      dom.ringSvg.style.display = 'none';
      return;
    }
    const r = Math.max(6, Math.abs(edge.x - center.x));
    dom.ringSvg.style.display = 'block';
    dom.ringSvg.style.transform = `translate3d(${center.x}px, ${center.y}px, 0)`;
    dom.ringCircle.setAttribute('r', String(r));
  },

  _updateMeters(dom, ml2) {
    const bt = ml2.bulletTime;
    const showBt = massline2Flag('bulletTime') && bt && (bt.active || bt.energy < 0.999);
    dom.btPill.style.display = showBt ? 'flex' : 'none';
    if (showBt) {
      dom.btFill.style.transform = `scaleX(${clamp01(bt.energy)})`;
      dom.btPill.classList.toggle('ml2-on', !!bt.active);
    }
    const ck = ml2.cloak;
    const showCk = massline2Flag('cloak') && ck && ck.available;
    dom.ckPill.style.display = showCk ? 'flex' : 'none';
    if (showCk) {
      dom.ckFill.style.transform = `scaleX(${clamp01(ck.energy)})`;
      dom.ckPill.classList.toggle('ml2-on', !!ck.active);
    }
  },

  _hideAll() {
    const dom = this._dom;
    if (!dom) return;
    dom.throwEl.style.display = 'none';
    dom.selfEl.style.display = 'none';
    dom.ringSvg.style.display = 'none';
    dom.btPill.style.display = 'none';
    dom.ckPill.style.display = 'none';
  },

  _ensureDom() {
    if (this._dom && this._dom.root.isConnected !== false) return this._dom;
    const host = document.getElementById('hud') || document.body;
    if (!host) return null;
    if (!document.getElementById('sf-ml2-css')) {
      const style = document.createElement('style');
      style.id = 'sf-ml2-css';
      style.textContent = CSS;
      (document.head || host).appendChild(style);
    }
    const root = document.createElement('div');
    root.id = 'sf-ml2';

    const throwEl = document.createElement('div');
    throwEl.className = 'ml2-mark ml2-throw';
    throwEl.style.display = 'none';
    const diamond = document.createElement('div');
    diamond.className = 'ml2-diamond';
    throwEl.appendChild(diamond);
    root.appendChild(throwEl);

    const selfEl = document.createElement('div');
    selfEl.className = 'ml2-mark ml2-self';
    selfEl.style.display = 'none';
    root.appendChild(selfEl);

    const ringSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ringSvg.setAttribute('class', 'ml2-ring');
    ringSvg.setAttribute('width', '0');
    ringSvg.setAttribute('height', '0');
    ringSvg.style.display = 'none';
    const ringCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ringCircle.setAttribute('cx', '0');
    ringCircle.setAttribute('cy', '0');
    ringCircle.setAttribute('r', '60');
    ringSvg.appendChild(ringCircle);
    root.appendChild(ringSvg);

    const meters = document.createElement('div');
    meters.className = 'ml2-meters';
    const makePill = (label, extraClass) => {
      const pill = document.createElement('div');
      pill.className = `ml2-pill ${extraClass}`;
      pill.style.display = 'none';
      const text = document.createElement('span');
      text.textContent = label;
      const fill = document.createElement('span');
      fill.className = 'ml2-fill';
      const bar = document.createElement('i');
      fill.appendChild(bar);
      pill.appendChild(text);
      pill.appendChild(fill);
      meters.appendChild(pill);
      return { pill, bar };
    };
    const bt = makePill('FOCUS', 'ml2-bt');
    const ck = makePill('CLOAK', 'ml2-cloak');
    root.appendChild(meters);

    host.appendChild(root);
    this._dom = {
      root, throwEl, selfEl, ringSvg, ringCircle,
      btPill: bt.pill, btFill: bt.bar, ckPill: ck.pill, ckFill: ck.bar,
    };
    return this._dom;
  },
};

// Cool cyan (far from solution) -> hot amber (near) -> white pulse handled by the .ml2-hot class.
function rampColor(errorRad, tolRad, hot) {
  if (hot) return '#ffffff';
  const tol = Math.max(0.02, Number(tolRad) || 0.02);
  const frac = clamp01(Math.abs(Number(errorRad) || Math.PI) / (tol * 6)); // 0 = nearly there
  const hue = 38 + (195 - 38) * frac;   // 38 amber .. 195 cyan
  return `hsl(${Math.round(hue)}, 95%, 62%)`;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function finite(v) { return Number.isFinite(v) ? v : 0; }
