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

export const MASSLINE_HUD_CSS = `
#sf-ml2 { position:absolute; inset:0; pointer-events:none; z-index:6; }
#sf-ml2 .ml2-mark { position:absolute; left:0; top:0; will-change:transform;
  transition:transform 60ms linear; }
#sf-ml2 .ml2-mark.ml2-offscreen { filter:drop-shadow(0 0 7px rgba(2,6,11,0.92)); }
#sf-ml2 .ml2-mark-label { position:absolute; left:50%; top:calc(100% + 7px); transform:translateX(-50%);
  padding:2px 5px; border:1px solid currentColor; background:rgba(4,14,24,0.82); color:var(--ml2-c,#5fd7ff);
  font:750 11px/1.2 system-ui,sans-serif; letter-spacing:0.08em; text-shadow:0 1px 2px #02060b;
  white-space:nowrap; }
#sf-ml2 .ml2-preview-link { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
#sf-ml2 .ml2-preview-line { stroke:rgba(125,224,255,0.62); stroke-width:1.5; stroke-dasharray:4 6;
  vector-effect:non-scaling-stroke; }
#sf-ml2 .ml2-preview { position:absolute; left:0; top:0; min-width:94px; min-height:42px;
  transform:translate3d(-9999px,-9999px,0); padding:7px 9px 6px 30px;
  border:1px solid rgba(125,224,255,0.88); border-left-width:3px;
  background:linear-gradient(90deg,rgba(4,14,24,0.82),rgba(4,14,24,0.36));
  clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px));
  color:#e5f8ff; text-shadow:0 1px 2px #02060b; white-space:nowrap;
  font:650 10px/1.28 system-ui,sans-serif; letter-spacing:0.075em;
  animation:ml2preview 1.3s ease-in-out infinite; }
#sf-ml2 .ml2-preview::before { content:''; position:absolute; left:9px; top:11px; width:11px; height:11px;
  border:2px solid currentColor; transform:rotate(45deg); }
#sf-ml2 .ml2-preview.ml2-preview-blocked,
#sf-ml2 .ml2-preview.ml2-preview-protected,
#sf-ml2 .ml2-preview.ml2-preview-out-of-range,
#sf-ml2 .ml2-preview.ml2-preview-invalid { border-style:dashed; color:#ffd08a; }
#sf-ml2 .ml2-preview.ml2-preview-offscreen { border-style:dashed; }
#sf-ml2 .ml2-preview.ml2-preview-protected::before { border-radius:50%; transform:none; }
@keyframes ml2preview { 0%,100% { opacity:0.78; } 50% { opacity:1; } }
#sf-ml2 .ml2-throw { width:26px; height:26px; margin:-13px 0 0 -13px; }
#sf-ml2 .ml2-throw .ml2-diamond { width:100%; height:100%; transform:rotate(45deg);
  border:2px solid var(--ml2-c,#5fd7ff); box-shadow:0 0 10px var(--ml2-c,#5fd7ff);
  transition:border-color 80ms linear, box-shadow 80ms linear; }
#sf-ml2 .ml2-throw.ml2-hot .ml2-diamond { outline:2px solid var(--ml2-c,#5fd7ff); outline-offset:4px; }
#sf-ml2 .ml2-throw.ml2-hot .ml2-diamond { animation:ml2pulse 0.5s ease-in-out infinite; }
@keyframes ml2pulse { 0%,100% { transform:rotate(45deg) scale(1); } 50% { transform:rotate(45deg) scale(1.3); } }
#sf-ml2 .ml2-self { width:0; height:0; margin:-7px 0 0 -7px;
  border-left:7px solid transparent; border-right:7px solid transparent;
  border-bottom:12px solid var(--ml2-c,#5fd7ff); opacity:0.7; filter:drop-shadow(0 0 6px var(--ml2-c,#5fd7ff)); }
#sf-ml2 .ml2-self .ml2-mark-label { top:17px; }
#sf-ml2 .ml2-self.ml2-hot { outline:2px solid var(--ml2-c,#5fd7ff); outline-offset:5px; opacity:1; }
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
#sf-ml2.ml2-reduced-motion .ml2-preview { animation:none; opacity:1; }
#sf-ml2.ml2-reduced-flash .ml2-throw.ml2-hot .ml2-diamond { animation:none; }
@media (prefers-reduced-motion: reduce) {
  #sf-ml2 .ml2-mark { transition:none; }
  #sf-ml2 .ml2-throw.ml2-hot .ml2-diamond { animation:none; }
  #sf-ml2 .ml2-preview { animation:none; opacity:1; }
}
@media (forced-colors: active) {
  #sf-ml2 .ml2-preview { color:CanvasText; background:Canvas; border-color:CanvasText; forced-color-adjust:auto; }
  #sf-ml2 .ml2-preview-line { stroke:CanvasText; }
  #sf-ml2 .ml2-mark { color:CanvasText; forced-color-adjust:auto; filter:none; }
  #sf-ml2 .ml2-throw .ml2-diamond { border-color:CanvasText; box-shadow:none; outline-color:CanvasText; }
  #sf-ml2 .ml2-self { border-bottom-color:CanvasText; outline-color:CanvasText; }
  #sf-ml2 .ml2-mark-label { color:CanvasText; background:Canvas; border-color:CanvasText; text-shadow:none; }
}
`;

export function resolveReleaseCue(projection, options = {}) {
  const rawX = projection && Number(projection.x);
  const rawY = projection && Number(projection.y);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return { visible: false };
  const viewportWidth = Math.max(60, Number(options.viewportWidth) || 1440);
  const viewportHeight = Math.max(60, Number(options.viewportHeight) || 900);
  const offscreen = projection.onScreen === false
    || rawX < 0 || rawX > viewportWidth || rawY < 0 || rawY > viewportHeight;
  const x = offscreen ? clampRange(rawX, 30, viewportWidth - 30) : rawX;
  const y = offscreen ? clampRange(rawY, 30, viewportHeight - 30) : rawY;
  const direction = offscreen
    ? offscreenDirection(rawX - viewportWidth / 2, rawY - viewportHeight / 2)
    : 'onscreen';
  const onSolution = !!options.onSolution;
  const kind = options.kind === 'self' ? 'self-sling' : 'throw';
  const target = options.targetKind === 'waypoint' ? ' waypoint' : '';
  const state = onSolution ? 'open' : 'aligning';
  const label = onSolution ? 'RELEASE' : 'ALIGN';
  const offscreenCopy = offscreen ? `, target offscreen ${direction}` : ', target onscreen';
  return {
    visible: true,
    x,
    y,
    offscreen,
    direction,
    state,
    label,
    ariaLabel: `Massline ${kind}${target} release window ${state}${offscreenCopy}`,
  };
}

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
    const reducedFlash = !!(state.settings && state.settings.accessibility
      && state.settings.accessibility.flashReduce);
    dom.root.classList.toggle('ml2-reduced-flash', reducedFlash);
    dom.previewEl.style.display = 'none';
    dom.previewSvg.style.display = 'none';
    this._updateThrowMark(dom, ml2.throw, state, w2s);
    this._updateSelfMark(dom, ml2.throw, state, w2s);
    this._updateCloakRing(dom, ml2.cloak, player, w2s);
    this._updateMeters(dom, ml2);
  },

  _updateAcquisitionPreview(dom, state, player, w2s) {
    const receipt = state.masslineAcquisition;
    const selected = receipt && receipt.selected;
    const tethered = !!(state.player && state.player.tether && state.player.tether.active);
    if (!selected || tethered) {
      dom.previewEl.style.display = 'none';
      dom.previewSvg.style.display = 'none';
      return;
    }
    const target = state.entities && state.entities.get ? state.entities.get(selected.targetId) : null;
    if (!target || !target.pos) {
      dom.previewEl.style.display = 'none';
      dom.previewSvg.style.display = 'none';
      return;
    }
    const targetScreen = w2s({ x: target.pos.x, y: 0, z: target.pos.z });
    const playerScreen = w2s({ x: player.pos.x, y: 0, z: player.pos.z });
    if (!targetScreen || !playerScreen
        || !Number.isFinite(targetScreen.x) || !Number.isFinite(targetScreen.y)
        || !Number.isFinite(playerScreen.x) || !Number.isFinite(playerScreen.y)) {
      dom.previewEl.style.display = 'none';
      dom.previewSvg.style.display = 'none';
      return;
    }

    const viewportWidth = viewportExtent('innerWidth', 'clientWidth', 1440);
    const viewportHeight = viewportExtent('innerHeight', 'clientHeight', 900);
    const offscreen = !targetScreen.onScreen;
    const cueX = offscreen ? clampRange(targetScreen.x, 30, viewportWidth - 30) : targetScreen.x;
    const cueY = offscreen ? clampRange(targetScreen.y, 30, viewportHeight - 30) : targetScreen.y;
    const labelX = cueX > viewportWidth * 0.62 ? cueX - 154 : cueX + 18;
    const labelY = clampRange(cueY - 22, 8, viewportHeight - 58);
    const confidence = Math.round(clamp01(selected.confidence) * 100);
    const status = previewStatusCopy(selected.status, selected.reason);
    const intent = String(selected.intentLabel || selected.context || 'PICK').toUpperCase();
    const label = String(selected.targetLabel || selected.targetType || 'Target');
    dom.previewEl.style.display = 'block';
    dom.previewEl.style.transform = `translate3d(${Math.round(labelX)}px, ${Math.round(labelY)}px, 0)`;
    dom.previewEl.textContent = `${label} · ${intent} · ${confidence}% · ${status}`;
    dom.previewEl.setAttribute('aria-label', `Massline ${intent} ${label}, ${confidence} percent, ${status.toLowerCase()}${offscreen ? ', offscreen' : ''}`);
    dom.previewEl.setAttribute('data-receipt-id', String(receipt.id || ''));
    dom.previewEl.setAttribute('data-target-id', String(selected.targetId));
    dom.previewEl.classList.toggle('ml2-preview-offscreen', offscreen);
    for (const name of ['ready', 'blocked', 'protected', 'out-of-range', 'cooldown', 'invalid']) {
      dom.previewEl.classList.toggle(`ml2-preview-${name}`, selected.status === name);
    }

    dom.previewSvg.style.display = 'block';
    dom.previewLine.setAttribute('x1', String(Math.round(playerScreen.x)));
    dom.previewLine.setAttribute('y1', String(Math.round(playerScreen.y)));
    dom.previewLine.setAttribute('x2', String(Math.round(cueX)));
    dom.previewLine.setAttribute('y2', String(Math.round(cueY)));
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
    const cue = resolveReleaseCue(proj, {
      viewportWidth: viewportExtent('innerWidth', 'clientWidth', 1440),
      viewportHeight: viewportExtent('innerHeight', 'clientHeight', 900),
      kind: 'throw',
      onSolution: solution.onSolution,
      targetKind: aim ? 'entity' : 'point',
    });
    if (!cue.visible) { dom.throwEl.style.display = 'none'; return; }
    dom.throwEl.style.display = 'block';
    dom.throwEl.style.transform = `translate3d(${cue.x}px, ${cue.y}px, 0)`;
    const hot = !!solution.onSolution;
    dom.throwEl.classList.toggle('ml2-hot', hot);
    dom.throwEl.classList.toggle('ml2-offscreen', cue.offscreen);
    dom.throwEl.style.setProperty('--ml2-c', rampColor(solution.errorRad, solution.tolRad, hot));
    applyCueState(dom.throwEl, dom.throwLabel, cue);
  },

  _updateSelfMark(dom, throwState, state, w2s) {
    const self = throwState && !throwState.armed ? throwState.selfSolution : null;
    if (!self) { dom.selfEl.style.display = 'none'; return; }
    const target = self.targetId != null ? state.entities.get(self.targetId) : null;
    const targetPos = target && target.pos ? target.pos : self.targetPos;
    if (!targetPos) { dom.selfEl.style.display = 'none'; return; }
    const proj = w2s({ x: targetPos.x, y: 0, z: targetPos.z });
    const cue = resolveReleaseCue(proj, {
      viewportWidth: viewportExtent('innerWidth', 'clientWidth', 1440),
      viewportHeight: viewportExtent('innerHeight', 'clientHeight', 900),
      kind: 'self',
      onSolution: self.onSolution,
      targetKind: self.targetKind,
    });
    if (!cue.visible) { dom.selfEl.style.display = 'none'; return; }
    dom.selfEl.style.display = 'block';
    dom.selfEl.style.transform = `translate3d(${cue.x}px, ${cue.y - 26}px, 0)`;
    dom.selfEl.classList.toggle('ml2-hot', !!self.onSolution);
    dom.selfEl.classList.toggle('ml2-offscreen', cue.offscreen);
    dom.selfEl.style.setProperty('--ml2-c', rampColor(self.errorRad, self.tolRad, self.onSolution));
    applyCueState(dom.selfEl, dom.selfLabel, cue);
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
    dom.previewEl.style.display = 'none';
    dom.previewSvg.style.display = 'none';
    dom.btPill.style.display = 'none';
    dom.ckPill.style.display = 'none';
  },

  _ensureDom() {
    if (this._dom && this._dom.root.isConnected !== false) return this._dom;
    // Capability check, not an existence check. update() already bails when `document` is absent
    // entirely, but headless checks legitimately install a PARTIAL document stub, and this is the
    // only one of the four deployable HUDs that needs SVG. Testing `typeof document === 'undefined'`
    // let a stub with createElement but no createElementNS through, and the throw took the whole
    // registry step down with it (scripts/check-depth-program-k1-behavior.mjs installs exactly such
    // a stub, which is why that check could not run at all).
    if (typeof document === 'undefined'
      || typeof document.createElement !== 'function'
      || typeof document.createElementNS !== 'function') return null;
    const host = document.getElementById('hud') || document.body;
    if (!host) return null;
    if (!document.getElementById('sf-ml2-css')) {
      const style = document.createElement('style');
      style.id = 'sf-ml2-css';
      style.textContent = MASSLINE_HUD_CSS;
      (document.head || host).appendChild(style);
    }
    const root = document.createElement('div');
    root.id = 'sf-ml2';

    const previewSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    previewSvg.setAttribute('class', 'ml2-preview-link');
    previewSvg.style.display = 'none';
    const previewLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    previewLine.setAttribute('class', 'ml2-preview-line');
    previewSvg.appendChild(previewLine);
    root.appendChild(previewSvg);

    const previewEl = document.createElement('div');
    previewEl.className = 'ml2-preview';
    previewEl.style.display = 'none';
    previewEl.setAttribute('role', 'status');
    previewEl.setAttribute('aria-live', 'polite');
    previewEl.setAttribute('aria-atomic', 'true');
    root.appendChild(previewEl);

    const throwEl = document.createElement('div');
    throwEl.className = 'ml2-mark ml2-throw';
    throwEl.style.display = 'none';
    const diamond = document.createElement('div');
    diamond.className = 'ml2-diamond';
    throwEl.appendChild(diamond);
    const throwLabel = document.createElement('span');
    throwLabel.className = 'ml2-mark-label';
    throwEl.appendChild(throwLabel);
    throwEl.setAttribute('role', 'status');
    throwEl.setAttribute('aria-live', 'polite');
    throwEl.setAttribute('aria-atomic', 'true');
    root.appendChild(throwEl);

    const selfEl = document.createElement('div');
    selfEl.className = 'ml2-mark ml2-self';
    selfEl.style.display = 'none';
    const selfLabel = document.createElement('span');
    selfLabel.className = 'ml2-mark-label';
    selfEl.appendChild(selfLabel);
    selfEl.setAttribute('role', 'status');
    selfEl.setAttribute('aria-live', 'polite');
    selfEl.setAttribute('aria-atomic', 'true');
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
      root, previewEl, previewSvg, previewLine, throwEl, throwLabel, selfEl, selfLabel, ringSvg, ringCircle,
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

function previewStatusCopy(status, reason) {
  if (status === 'ready') return 'READY';
  if (status === 'protected' || reason === 'protected') return 'PROTECTED';
  if (status === 'blocked' || reason === 'blocked') return 'LINE BLOCKED';
  if (status === 'out-of-range' || reason === 'out-of-range') return 'OUT OF RANGE';
  if (status === 'cooldown' || reason === 'cooldown') return 'COOLDOWN';
  if (reason === 'target-lost') return 'TARGET LOST';
  if (reason === 'preview-stale') return 'REACQUIRE';
  return 'UNAVAILABLE';
}

function viewportExtent(windowKey, documentKey, fallback) {
  const fromWindow = typeof window !== 'undefined' ? Number(window[windowKey]) : 0;
  if (fromWindow > 0) return fromWindow;
  const fromDocument = typeof document !== 'undefined'
    ? Number(document.documentElement && document.documentElement[documentKey])
    : 0;
  return fromDocument > 0 ? fromDocument : fallback;
}

function clampRange(value, min, max) {
  return Math.max(min, Math.min(max, finite(value)));
}

function offscreenDirection(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay < ax * 0.4) return dx < 0 ? 'left' : 'right';
  if (ax < ay * 0.4) return dy < 0 ? 'up' : 'down';
  return `${dy < 0 ? 'upper' : 'lower'} ${dx < 0 ? 'left' : 'right'}`;
}

function applyCueState(element, label, cue) {
  if (label && label.textContent !== cue.label) label.textContent = cue.label;
  if (element.getAttribute('aria-label') !== cue.ariaLabel) element.setAttribute('aria-label', cue.ariaLabel);
  element.setAttribute('data-window-state', cue.state);
  element.setAttribute('data-direction', cue.direction);
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function finite(v) { return Number.isFinite(v) ? v : 0; }
