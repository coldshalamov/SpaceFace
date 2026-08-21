// Massline HUD surfaces (Wave M2, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// Three read-only surfaces over massline2 runtime state, in the BP-11 "SYSTEMS-only surfacing
// module" style (DOM fully guarded; own scoped CSS; pointer-events none):
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
import {
  clearHudSignature,
  clearHudSignatures,
  hudFieldsUnchanged,
} from './hudSkipUnchanged.js';

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
#sf-ml2 .ml2-preview-link.ml2-snare-preview .ml2-preview-line { stroke:rgba(125,224,255,0.92);
  stroke-width:2.25; stroke-dasharray:10 5 2 5; filter:drop-shadow(0 0 5px rgba(125,224,255,0.72)); }
#sf-ml2 .ml2-preview-link.ml2-bridle-preview .ml2-preview-line { stroke:rgba(255,181,71,0.9);
  stroke-width:2; stroke-dasharray:7 5; filter:drop-shadow(0 0 4px rgba(125,224,255,0.55)); }
#sf-ml2 .ml2-preview.ml2-preview-snare { border-style:solid; border-left-width:3px; }
/* The acquisition MARK is the world anchor: it sits on the candidate itself, so the preview never
   needs a player-to-target link line (see _updateAcquisitionPreview). Shape, not colour, carries
   the state — diamond = ready, circle = protected, dashed = unavailable. */
#sf-ml2 .ml2-preview-mark { position:absolute; left:0; top:0; width:24px; height:24px;
  margin:-12px 0 0 -12px; will-change:transform; transition:transform 60ms linear;
  color:var(--ml2-p,#7de0ff); }
#sf-ml2 .ml2-preview-mark i { position:absolute; inset:0; border:2px solid currentColor;
  transform:rotate(45deg); box-shadow:0 0 9px currentColor; }
#sf-ml2 .ml2-preview-mark.ml2-mark-protected i { border-radius:50%; transform:none; }
#sf-ml2 .ml2-preview-mark.ml2-mark-unavailable { color:#ffd08a; }
#sf-ml2 .ml2-preview-mark.ml2-mark-unavailable i { border-style:dashed; box-shadow:none; }
#sf-ml2 .ml2-preview-mark.ml2-bridle-source { color:#7de0ff; }
#sf-ml2 .ml2-preview-mark.ml2-bridle-source i { inset:2px; transform:none; box-shadow:0 0 9px currentColor; }
#sf-ml2 .ml2-preview-mark.ml2-bridle-target { color:#ffb547; }
#sf-ml2 .ml2-preview-mark.ml2-offscreen { filter:drop-shadow(0 0 7px rgba(2,6,11,0.92)); }
#sf-ml2 .ml2-preview { position:absolute; left:0; top:0; min-width:94px;
  transform:translate3d(-9999px,-9999px,0); padding:6px 9px 5px 9px;
  border:1px solid rgba(125,224,255,0.88); border-left-width:3px;
  background:linear-gradient(90deg,rgba(4,14,24,0.82),rgba(4,14,24,0.36));
  clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px));
  color:#e5f8ff; text-shadow:0 1px 2px #02060b; white-space:nowrap;
  font:650 10px/1.28 system-ui,sans-serif; letter-spacing:0.075em;
  animation:ml2preview 1.3s ease-in-out infinite; }
#sf-ml2 .ml2-preview.ml2-preview-blocked,
#sf-ml2 .ml2-preview.ml2-preview-protected,
#sf-ml2 .ml2-preview.ml2-preview-out-of-range,
#sf-ml2 .ml2-preview.ml2-preview-invalid { border-style:dashed; color:#ffd08a; }
#sf-ml2 .ml2-preview.ml2-preview-offscreen { border-style:dashed; }
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
#sf-ml2.ml2-reduced-motion .ml2-mark,
#sf-ml2.ml2-reduced-motion .ml2-preview-mark { transition:none; }
#sf-ml2.ml2-reduced-motion .ml2-throw.ml2-hot .ml2-diamond { animation:none; }
#sf-ml2.ml2-reduced-motion .ml2-preview { animation:none; opacity:1; }
#sf-ml2.ml2-reduced-flash .ml2-throw.ml2-hot .ml2-diamond { animation:none; }
@media (prefers-reduced-motion: reduce) {
  #sf-ml2 .ml2-mark, #sf-ml2 .ml2-preview-mark { transition:none; }
  #sf-ml2 .ml2-throw.ml2-hot .ml2-diamond { animation:none; }
  #sf-ml2 .ml2-preview { animation:none; opacity:1; }
}
@media (forced-colors: active) {
  #sf-ml2 .ml2-preview { color:CanvasText; background:Canvas; border-color:CanvasText; forced-color-adjust:auto; }
  #sf-ml2 .ml2-preview-line { stroke:CanvasText; }
  #sf-ml2 .ml2-preview-mark { color:CanvasText; forced-color-adjust:auto; filter:none; }
  #sf-ml2 .ml2-preview-mark i { border-color:CanvasText; box-shadow:none; }
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

// Resolve the world anchor independently from DOM projection. R3B release targets are captured
// when the line latches (or when a current precision-input intent repaints them), so a fixed point
// must stay fixed even when gun/UI selection or a stale aimWorld changes underneath the throw.
// The final payload-ray branch keeps old fixtures and partial runtime states readable.
export function resolveThrowMarkWorldPoint(throwState, state) {
  if (!throwState || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  const releaseTarget = throwState.releaseTarget;
  const targetId = releaseTarget && releaseTarget.targetId != null
    ? releaseTarget.targetId
    : throwState.aimTargetId;
  if (targetId != null) {
    const entity = state.entities.get(targetId);
    if (entity && entity.alive !== false && entity.pos
      && Number.isFinite(entity.pos.x) && Number.isFinite(entity.pos.z)) {
      return {
        x: entity.pos.x + finite(entity.vel && entity.vel.x) * MARK_PREDICTION_S,
        z: entity.pos.z + finite(entity.vel && entity.vel.z) * MARK_PREDICTION_S,
        targetKind: releaseTarget && releaseTarget.kind === 'waypoint' ? 'waypoint' : 'entity',
      };
    }
  }
  if (releaseTarget && releaseTarget.pos
    && Number.isFinite(releaseTarget.pos.x) && Number.isFinite(releaseTarget.pos.z)) {
    return {
      x: releaseTarget.pos.x,
      z: releaseTarget.pos.z,
      targetKind: releaseTarget.kind === 'waypoint' ? 'waypoint' : 'point',
    };
  }
  const payload = state.entities.get(throwState.payloadId);
  const solution = throwState.solution;
  if (!payload || !payload.pos || !solution || !Number.isFinite(solution.interceptAngle)) return null;
  return {
    x: payload.pos.x + Math.cos(solution.interceptAngle) * 220,
    z: payload.pos.z + Math.sin(solution.interceptAngle) * 220,
    targetKind: 'point',
  };
}

const EMPTY_HUD_OBJECT = Object.freeze({});

function appendEntityFields(fields, cursor, state, id) {
  if (id == null) return cursor;
  fields[cursor++] = id;
  const entity = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(id)
    : null;
  fields[cursor++] = entity && entity.alive !== false;
  fields[cursor++] = entity && entity.pos && entity.pos.x;
  fields[cursor++] = entity && entity.pos && entity.pos.z;
  fields[cursor++] = entity && entity.vel && entity.vel.x;
  fields[cursor++] = entity && entity.vel && entity.vel.z;
  fields[cursor++] = entity && entity.type;
  const data = entity && entity.data;
  fields[cursor++] = data && (data.displayName || data.name || data.label);
  return cursor;
}

/** Only values read by the Massline DOM route belong in this fixed scalar block. `state.tick` is
 * deliberately absent: it changes on every fixed step even while the displayed values are equal. */
function writeMasslineHudFields(fields, state, player) {
  const ml2 = state.massline2 || EMPTY_HUD_OBJECT;
  const throwState = ml2.throw || EMPTY_HUD_OBJECT;
  const solution = throwState.solution || EMPTY_HUD_OBJECT;
  const selfSolution = throwState.selfSolution || EMPTY_HUD_OBJECT;
  const cloak = ml2.cloak || EMPTY_HUD_OBJECT;
  const bulletTime = ml2.bulletTime || EMPTY_HUD_OBJECT;
  const playerState = state.player || EMPTY_HUD_OBJECT;
  const receipt = state.masslineAcquisition || EMPTY_HUD_OBJECT;
  const selected = receipt.selected || EMPTY_HUD_OBJECT;
  const snare = playerState.masslineSnarePreview || EMPTY_HUD_OBJECT;
  const bridle = state.masslineBridle || EMPTY_HUD_OBJECT;
  const camera = state.camera || EMPTY_HUD_OBJECT;
  const settings = state.settings || EMPTY_HUD_OBJECT;
  const video = settings.video || EMPTY_HUD_OBJECT;
  const access = settings.accessibility || EMPTY_HUD_OBJECT;
  let index = 0;
  fields[index++] = player && player.pos && player.pos.x;
  fields[index++] = player && player.pos && player.pos.z;
  fields[index++] = camera.zoom;
  fields[index++] = camera.tilt;
  fields[index++] = video.fov;
  fields[index++] = !!video.motionReduce;
  fields[index++] = access.motionPreference;
  fields[index++] = !!access.flashReduce;
  fields[index++] = !!throwState.armed;
  fields[index++] = !!solution.valid;
  fields[index++] = !!solution.onSolution;
  fields[index++] = solution.interceptAngle;
  fields[index++] = solution.errorRad;
  fields[index++] = solution.tolRad;
  fields[index++] = throwState.payloadId;
  fields[index++] = throwState.aimTargetId;
  fields[index++] = throwState.releaseTarget && throwState.releaseTarget.targetId;
  fields[index++] = throwState.releaseTarget && throwState.releaseTarget.pos && throwState.releaseTarget.pos.x;
  fields[index++] = throwState.releaseTarget && throwState.releaseTarget.pos && throwState.releaseTarget.pos.z;
  fields[index++] = throwState.releaseTarget && throwState.releaseTarget.kind;
  fields[index++] = !!selfSolution.onSolution;
  fields[index++] = selfSolution.errorRad;
  fields[index++] = selfSolution.tolRad;
  fields[index++] = selfSolution.targetId;
  fields[index++] = selfSolution.targetPos && selfSolution.targetPos.x;
  fields[index++] = selfSolution.targetPos && selfSolution.targetPos.z;
  fields[index++] = !!cloak.active;
  fields[index++] = !!cloak.available;
  fields[index++] = cloak.energy;
  fields[index++] = cloak.radius;
  fields[index++] = !!bulletTime.active;
  fields[index++] = bulletTime.energy;
  fields[index++] = snare.receiptId;
  fields[index++] = !!snare.valid;
  fields[index++] = snare.source && snare.source.x;
  fields[index++] = snare.source && snare.source.z;
  fields[index++] = snare.target && snare.target.x;
  fields[index++] = snare.target && snare.target.z;
  fields[index++] = !!(playerState.remoteMassline && playerState.remoteMassline.active);
  fields[index++] = bridle.phase;
  fields[index++] = bridle.sourceId;
  fields[index++] = bridle.sourceReceiptId;
  fields[index++] = bridle.lastDenial;
  fields[index++] = bridle.lastDenialTargetId;
  fields[index++] = selected.status;
  fields[index++] = selected.reason;
  fields[index++] = selected.targetId;
  fields[index++] = selected.confidence;
  fields[index++] = selected.intentLabel;
  fields[index++] = selected.context;
  fields[index++] = selected.targetLabel;
  fields[index++] = selected.targetType;
  fields[index++] = receipt.id;
  fields[index++] = !!(playerState.tether && playerState.tether.active);
  fields[index++] = bridle.phase
    ? Math.max(0, Math.ceil(Number(bridle.expiresAt) - Number(state.simTime)))
    : '';
  fields[index++] = typeof window !== 'undefined' ? window.innerWidth : '';
  fields[index++] = typeof window !== 'undefined' ? window.innerHeight : '';
  fields[index++] = !!massline2Flag('bulletTime');
  fields[index++] = !!massline2Flag('cloak');
  index = appendEntityFields(fields, index, state, throwState.payloadId);
  index = appendEntityFields(fields, index, state, throwState.aimTargetId);
  index = appendEntityFields(
    fields,
    index,
    state,
    throwState.releaseTarget && throwState.releaseTarget.targetId,
  );
  index = appendEntityFields(fields, index, state, selfSolution.targetId);
  index = appendEntityFields(fields, index, state, selected.targetId);
  index = appendEntityFields(fields, index, state, bridle.sourceId);
  return index;
}

export function masslineHudInputsUnchanged(state, player) {
  return hudFieldsUnchanged(state, 'masslineHud', writeMasslineHudFields, player);
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
    clearHudSignatures(this.state);
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

    const ml2 = state.massline2 || EMPTY_HUD_OBJECT;
    if (masslineHudInputsUnchanged(state, player)) return;
    const reducedMotion = !!(state.settings && state.settings.video && state.settings.video.motionReduce)
      || !!(state.settings && state.settings.accessibility
        && state.settings.accessibility.motionPreference === 'reduce');
    setClass(dom.root, 'ml2-reduced-motion', reducedMotion);
    const reducedFlash = !!(state.settings && state.settings.accessibility
      && state.settings.accessibility.flashReduce);
    setClass(dom.root, 'ml2-reduced-flash', reducedFlash);
    this._updateAcquisitionPreview(dom, state, player, w2s);
    this._updateThrowMark(dom, ml2.throw, state, w2s);
    this._updateSelfMark(dom, ml2.throw, state, w2s);
    this._updateCloakRing(dom, ml2.cloak, player, w2s);
    this._updateMeters(dom, ml2);
  },

  // The pre-latch answer to "what will the Massline grab?" (PHYSICAL_PLAY_GRAMMAR §7.1, rule 2).
  //
  // A MARK sits on the candidate and a caption sits beside it. There is deliberately NO line back
  // to the ship: a dashed player-to-target link reads as a second cable and claims an attachment
  // that does not exist yet — only the real rendered Massline may connect the player to an object.
  // The mark is what makes the caption world-anchored, so no connector is needed.
  _updateAcquisitionPreview(dom, state, player, w2s) {
    const snarePreview = state.player && state.player.masslineSnarePreview;
    const remoteActive = !!(state.player && state.player.remoteMassline && state.player.remoteMassline.active);
    const bridleSetup = state.masslineBridle;
    if (bridleSetup && bridleSetup.phase === 'select_endpoint_b' && !remoteActive) {
      this._updateTwinBridlePreview(dom, bridleSetup, state, w2s);
      return;
    }
    if (snarePreview && snarePreview.valid && !remoteActive) {
      this._updateSnarePreview(dom, snarePreview, w2s);
      return;
    }
    const receipt = state.masslineAcquisition;
    const selected = receipt && receipt.selected;
    const tethered = !!(state.player && state.player.tether && state.player.tether.active);
    if (!selected || tethered) return this._hideAcquisitionPreview(dom);
    const target = state.entities && state.entities.get ? state.entities.get(selected.targetId) : null;
    if (!target || !target.pos) return this._hideAcquisitionPreview(dom);
    const targetScreen = w2s({ x: target.pos.x, y: 0, z: target.pos.z });
    if (!targetScreen || !Number.isFinite(targetScreen.x) || !Number.isFinite(targetScreen.y)) {
      return this._hideAcquisitionPreview(dom);
    }

    const viewportWidth = viewportExtent('innerWidth', 'clientWidth', 1440);
    const viewportHeight = viewportExtent('innerHeight', 'clientHeight', 900);
    const offscreen = !targetScreen.onScreen
      || targetScreen.x < 0 || targetScreen.x > viewportWidth
      || targetScreen.y < 0 || targetScreen.y > viewportHeight;
    const cueX = offscreen ? clampRange(targetScreen.x, 30, viewportWidth - 30) : targetScreen.x;
    const cueY = offscreen ? clampRange(targetScreen.y, 30, viewportHeight - 30) : targetScreen.y;
    const ready = selected.status === 'ready';
    const confidence = Math.round(clamp01(selected.confidence) * 100);
    const status = previewStatusCopy(selected.status, selected.reason);
    const intent = String(selected.intentLabel || selected.context || 'PICK').toUpperCase();
    const label = String(selected.targetLabel || selected.targetType || 'Target');
    const text = `${label} · ${intent} · ${confidence}% · ${status}`;

    // Keep the caption beside the mark and inside the frame. The estimate only decides which SIDE
    // of the mark it sits on; a wrong guess shifts the caption, it never hides information.
    const captionWidth = estimateCaptionWidth(text);
    const preferLeft = cueX + 20 + captionWidth > viewportWidth - 12;
    const labelX = clampRange(preferLeft ? cueX - 20 - captionWidth : cueX + 20, 8, Math.max(8, viewportWidth - 12 - captionWidth));
    const labelY = clampRange(cueY - 14, 8, viewportHeight - 40);

    setStyle(dom.previewMark, 'display', 'block');
    setStyle(dom.previewSourceMark, 'display', 'none');
    setStyle(dom.previewMark, 'transform', `translate3d(${Math.round(cueX)}px, ${Math.round(cueY)}px, 0)`);
    setClass(dom.previewMark, 'ml2-bridle-target', false);
    setClass(dom.previewMark, 'ml2-offscreen', offscreen);
    setClass(dom.previewMark, 'ml2-mark-protected', selected.status === 'protected');
    setClass(dom.previewMark, 'ml2-mark-unavailable', !ready && selected.status !== 'protected');

    setStyle(dom.previewEl, 'display', 'block');
    setClass(dom.previewEl, 'ml2-preview-snare', false);
    setClass(dom.previewSvg, 'ml2-snare-preview', false);
    setClass(dom.previewSvg, 'ml2-bridle-preview', false);
    setStyle(dom.previewSvg, 'display', 'none');
    setStyle(dom.previewEl, 'transform', `translate3d(${Math.round(labelX)}px, ${Math.round(labelY)}px, 0)`);
    if (dom.previewEl.textContent !== text) dom.previewEl.textContent = text;
    setAttr(dom.previewEl, 'aria-label', `Massline ${intent} ${label}, ${confidence} percent, ${status.toLowerCase()}${offscreen ? ', offscreen' : ''}`);
    setAttr(dom.previewEl, 'data-receipt-id', String(receipt.id || ''));
    setAttr(dom.previewEl, 'data-target-id', String(selected.targetId));
    setClass(dom.previewEl, 'ml2-preview-offscreen', offscreen);
    for (const name of ['ready', 'blocked', 'protected', 'out-of-range', 'cooldown', 'invalid']) {
      setClass(dom.previewEl, `ml2-preview-${name}`, selected.status === name);
    }
  },

  _hideAcquisitionPreview(dom) {
    setStyle(dom.previewEl, 'display', 'none');
    setStyle(dom.previewMark, 'display', 'none');
    setStyle(dom.previewSourceMark, 'display', 'none');
    setStyle(dom.previewSvg, 'display', 'none');
    setClass(dom.previewEl, 'ml2-preview-snare', false);
    setClass(dom.previewSvg, 'ml2-snare-preview', false);
    setClass(dom.previewSvg, 'ml2-bridle-preview', false);
  },

  _updateSnarePreview(dom, preview, w2s) {
    const source = w2s({ x: preview.source.x, y: 0, z: preview.source.z });
    const target = w2s({ x: preview.target.x, y: 0, z: preview.target.z });
    if (!finiteProjection(source) || !finiteProjection(target)) {
      this._hideAcquisitionPreview(dom);
      return;
    }
    const viewportWidth = viewportExtent('innerWidth', 'clientWidth', 1440);
    const viewportHeight = viewportExtent('innerHeight', 'clientHeight', 900);
    const sx = clampRange(source.x, 18, viewportWidth - 18);
    const sy = clampRange(source.y, 18, viewportHeight - 18);
    const tx = clampRange(target.x, 18, viewportWidth - 18);
    const ty = clampRange(target.y, 18, viewportHeight - 18);
    const midX = (sx + tx) * 0.5;
    const midY = (sy + ty) * 0.5;
    const text = 'TRANSVERSE SNARE · READY · MASSLINE TO DEPLOY';
    const captionWidth = estimateCaptionWidth(text);
    const labelX = clampRange(midX - captionWidth * 0.5, 8, Math.max(8, viewportWidth - captionWidth - 12));
    const labelY = clampRange(midY + 16, 8, viewportHeight - 40);

    setAttr(dom.previewLine, 'x1', String(Math.round(sx)));
    setAttr(dom.previewLine, 'y1', String(Math.round(sy)));
    setAttr(dom.previewLine, 'x2', String(Math.round(tx)));
    setAttr(dom.previewLine, 'y2', String(Math.round(ty)));
    setStyle(dom.previewSvg, 'display', 'block');
    setClass(dom.previewSvg, 'ml2-snare-preview', true);
    setClass(dom.previewSvg, 'ml2-bridle-preview', false);
    setStyle(dom.previewMark, 'display', 'none');
    setStyle(dom.previewSourceMark, 'display', 'none');
    setStyle(dom.previewEl, 'display', 'block');
    setStyle(dom.previewEl, 'transform', `translate3d(${Math.round(labelX)}px, ${Math.round(labelY)}px, 0)`);
    if (dom.previewEl.textContent !== text) dom.previewEl.textContent = text;
    setAttr(dom.previewEl, 'aria-label', 'Transverse Snare ready. Press Massline to deploy the shown crossing line.');
    setAttr(dom.previewEl, 'data-receipt-id', String(preview.receiptId || ''));
    setAttr(dom.previewEl, 'data-target-id', 'free-target-line');
    setClass(dom.previewEl, 'ml2-preview-snare', true);
    for (const name of ['ready', 'blocked', 'protected', 'out-of-range', 'cooldown', 'invalid']) {
      setClass(dom.previewEl, `ml2-preview-${name}`, false);
    }
  },

  _updateTwinBridlePreview(dom, setup, state, w2s) {
    const sourceEntity = state.entities?.get ? state.entities.get(setup.sourceId) : null;
    if (!sourceEntity || !sourceEntity.pos) {
      this._hideAcquisitionPreview(dom);
      return;
    }
    const sourceScreen = w2s({ x: sourceEntity.pos.x, y: 0, z: sourceEntity.pos.z });
    if (!finiteProjection(sourceScreen)) {
      this._hideAcquisitionPreview(dom);
      return;
    }

    const viewportWidth = viewportExtent('innerWidth', 'clientWidth', 1440);
    const viewportHeight = viewportExtent('innerHeight', 'clientHeight', 900);
    const sx = clampRange(sourceScreen.x, 24, viewportWidth - 24);
    const sy = clampRange(sourceScreen.y, 24, viewportHeight - 24);
    setStyle(dom.previewSourceMark, 'display', 'block');
    setStyle(dom.previewSourceMark, 'transform', `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0)`);
    setClass(dom.previewSourceMark, 'ml2-offscreen', sourceScreen.onScreen === false);

    const receipt = state.masslineAcquisition;
    const selected = receipt && receipt.selected;
    const targetEntity = selected && state.entities?.get ? state.entities.get(selected.targetId) : null;
    const sameEndpoint = !!(targetEntity && targetEntity.id === sourceEntity.id);
    const pairDenial = setup.lastDenial && setup.lastDenialTargetId === selected?.targetId
      ? setup.lastDenial
      : null;
    const targetScreen = targetEntity && targetEntity.pos
      ? w2s({ x: targetEntity.pos.x, y: 0, z: targetEntity.pos.z })
      : null;
    const hasTarget = finiteProjection(targetScreen) && !sameEndpoint;
    let anchorX = sx;
    let anchorY = sy;
    if (hasTarget) {
      const tx = clampRange(targetScreen.x, 24, viewportWidth - 24);
      const ty = clampRange(targetScreen.y, 24, viewportHeight - 24);
      anchorX = (sx + tx) * 0.5;
      anchorY = (sy + ty) * 0.5;
      setStyle(dom.previewMark, 'display', 'block');
      setStyle(dom.previewMark, 'transform', `translate3d(${Math.round(tx)}px, ${Math.round(ty)}px, 0)`);
      setClass(dom.previewMark, 'ml2-bridle-target', true);
      setClass(dom.previewMark, 'ml2-mark-protected', selected.status === 'protected');
      setClass(dom.previewMark, 'ml2-mark-unavailable', !!pairDenial
        || (selected.status !== 'ready' && selected.status !== 'protected'));
      setClass(dom.previewMark, 'ml2-offscreen', targetScreen.onScreen === false);
      setAttr(dom.previewLine, 'x1', String(Math.round(sx)));
      setAttr(dom.previewLine, 'y1', String(Math.round(sy)));
      setAttr(dom.previewLine, 'x2', String(Math.round(tx)));
      setAttr(dom.previewLine, 'y2', String(Math.round(ty)));
      setStyle(dom.previewSvg, 'display', 'block');
      setClass(dom.previewSvg, 'ml2-bridle-preview', true);
      setClass(dom.previewSvg, 'ml2-snare-preview', false);
    } else {
      setStyle(dom.previewMark, 'display', 'none');
      setStyle(dom.previewSvg, 'display', 'none');
      setClass(dom.previewSvg, 'ml2-bridle-preview', false);
    }

    const sourceLabel = worldEntityLabel(sourceEntity);
    const remaining = Math.max(0, Math.ceil(finite(setup.expiresAt) - finite(state.simTime)));
    let text;
    let aria;
    if (sameEndpoint) {
      text = `${sourceLabel} · A AGAIN · MASSLINE TO CANCEL`;
      aria = `Twin Bridle endpoint A ${sourceLabel}. The same endpoint is selected; press Massline to cancel.`;
    } else if (hasTarget) {
      const targetLabel = worldEntityLabel(targetEntity);
      const status = previewStatusCopy(pairDenial ? 'invalid' : selected.status, pairDenial || selected.reason);
      text = `${sourceLabel} A ↔ ${targetLabel} B · ${status} · ${remaining}S`;
      aria = pairDenial
        ? `Twin Bridle endpoint A ${sourceLabel}, endpoint B ${targetLabel}, cannot link: ${status.toLowerCase()}.`
        : `Twin Bridle endpoint A ${sourceLabel}, endpoint B ${targetLabel}, ${status.toLowerCase()}. Press Massline to link.`;
    } else {
      const denial = setup.lastDenial ? ` · ${previewStatusCopy('invalid', setup.lastDenial)}` : '';
      text = `${sourceLabel} · A LOCKED · AIM ENDPOINT B · ${remaining}S${denial}`;
      aria = `Twin Bridle endpoint A ${sourceLabel} locked. Aim at endpoint B and press Massline. ${remaining} seconds remain.`;
    }
    const captionWidth = estimateCaptionWidth(text);
    const labelX = clampRange(anchorX - captionWidth * 0.5, 8, Math.max(8, viewportWidth - captionWidth - 12));
    const labelY = clampRange(anchorY + 20, 8, viewportHeight - 40);
    setStyle(dom.previewEl, 'display', 'block');
    setStyle(dom.previewEl, 'transform', `translate3d(${Math.round(labelX)}px, ${Math.round(labelY)}px, 0)`);
    setClass(dom.previewEl, 'ml2-preview-snare', false);
    if (dom.previewEl.textContent !== text) dom.previewEl.textContent = text;
    setAttr(dom.previewEl, 'aria-label', aria);
    setAttr(dom.previewEl, 'data-receipt-id', String((selected && receipt.id) || setup.sourceReceiptId || ''));
    setAttr(dom.previewEl, 'data-target-id', String((selected && selected.targetId) || ''));
    const visualStatus = pairDenial ? 'invalid' : selected?.status;
    for (const name of ['ready', 'blocked', 'protected', 'out-of-range', 'cooldown', 'invalid']) {
      setClass(dom.previewEl, `ml2-preview-${name}`, visualStatus === name);
    }
  },

  _updateThrowMark(dom, throwState, state, w2s) {
    const solution = throwState && throwState.armed ? throwState.solution : null;
    if (!solution || !solution.valid) { setStyle(dom.throwEl, 'display', 'none'); return; }
    // Place the diamond on the intercept ray at either the aim entity or a fixed reach — the
    // POSITION names the consequence ("the rock goes THERE"), the COLOR names the timing.
    const mark = resolveThrowMarkWorldPoint(throwState, state);
    if (!mark) { setStyle(dom.throwEl, 'display', 'none'); return; }
    const proj = w2s({ x: mark.x, y: 0, z: mark.z });
    const cue = resolveReleaseCue(proj, {
      viewportWidth: viewportExtent('innerWidth', 'clientWidth', 1440),
      viewportHeight: viewportExtent('innerHeight', 'clientHeight', 900),
      kind: 'throw',
      onSolution: solution.onSolution,
      targetKind: mark.targetKind,
    });
    if (!cue.visible) { setStyle(dom.throwEl, 'display', 'none'); return; }
    setStyle(dom.throwEl, 'display', 'block');
    setStyle(dom.throwEl, 'transform', `translate3d(${cue.x}px, ${cue.y}px, 0)`);
    const hot = !!solution.onSolution;
    setClass(dom.throwEl, 'ml2-hot', hot);
    setClass(dom.throwEl, 'ml2-offscreen', cue.offscreen);
    setCssVar(dom.throwEl, '--ml2-c', rampColor(solution.errorRad, solution.tolRad, hot));
    applyCueState(dom.throwEl, dom.throwLabel, cue);
  },

  _updateSelfMark(dom, throwState, state, w2s) {
    const self = throwState && !throwState.armed ? throwState.selfSolution : null;
    if (!self) { setStyle(dom.selfEl, 'display', 'none'); return; }
    const target = self.targetId != null ? state.entities.get(self.targetId) : null;
    const targetPos = target && target.pos ? target.pos : self.targetPos;
    if (!targetPos) { setStyle(dom.selfEl, 'display', 'none'); return; }
    const proj = w2s({ x: targetPos.x, y: 0, z: targetPos.z });
    const cue = resolveReleaseCue(proj, {
      viewportWidth: viewportExtent('innerWidth', 'clientWidth', 1440),
      viewportHeight: viewportExtent('innerHeight', 'clientHeight', 900),
      kind: 'self',
      onSolution: self.onSolution,
      targetKind: self.targetKind,
    });
    if (!cue.visible) { setStyle(dom.selfEl, 'display', 'none'); return; }
    setStyle(dom.selfEl, 'display', 'block');
    setStyle(dom.selfEl, 'transform', `translate3d(${cue.x}px, ${cue.y - 26}px, 0)`);
    setClass(dom.selfEl, 'ml2-hot', !!self.onSolution);
    setClass(dom.selfEl, 'ml2-offscreen', cue.offscreen);
    setCssVar(dom.selfEl, '--ml2-c', rampColor(self.errorRad, self.tolRad, self.onSolution));
    applyCueState(dom.selfEl, dom.selfLabel, cue);
  },

  _updateCloakRing(dom, cloakState, player, w2s) {
    if (!cloakState || !cloakState.active || !(cloakState.radius > 0)) {
      setStyle(dom.ringSvg, 'display', 'none');
      return;
    }
    const center = w2s({ x: player.pos.x, y: 0, z: player.pos.z });
    const edge = w2s({ x: player.pos.x + cloakState.radius, y: 0, z: player.pos.z });
    if (!center || !Number.isFinite(center.x) || !edge || !Number.isFinite(edge.x)) {
      setStyle(dom.ringSvg, 'display', 'none');
      return;
    }
    const r = Math.max(6, Math.abs(edge.x - center.x));
    setStyle(dom.ringSvg, 'display', 'block');
    setStyle(dom.ringSvg, 'transform', `translate3d(${center.x}px, ${center.y}px, 0)`);
    setAttr(dom.ringCircle, 'r', String(r));
  },

  _updateMeters(dom, ml2) {
    const bt = ml2.bulletTime;
    const showBt = massline2Flag('bulletTime') && bt && (bt.active || bt.energy < 0.999);
    setStyle(dom.btPill, 'display', showBt ? 'flex' : 'none');
    if (showBt) {
      setStyle(dom.btFill, 'transform', `scaleX(${clamp01(bt.energy)})`);
      setClass(dom.btPill, 'ml2-on', !!bt.active);
    }
    const ck = ml2.cloak;
    const showCk = massline2Flag('cloak') && ck && ck.available;
    setStyle(dom.ckPill, 'display', showCk ? 'flex' : 'none');
    if (showCk) {
      setStyle(dom.ckFill, 'transform', `scaleX(${clamp01(ck.energy)})`);
      setClass(dom.ckPill, 'ml2-on', !!ck.active);
    }
  },

  _hideAll() {
    const dom = this._dom;
    if (!dom) return;
    // Visibility gates are outside the normal signature (there is no player/projection payload to
    // hash there). Forget the last visible signature so re-entering flight repaints a recreated or
    // previously hidden tree even when the underlying values happen to be unchanged.
    clearHudSignature(this.state, 'masslineHud');
    setStyle(dom.throwEl, 'display', 'none');
    setStyle(dom.selfEl, 'display', 'none');
    setStyle(dom.ringSvg, 'display', 'none');
    this._hideAcquisitionPreview(dom);
    setStyle(dom.btPill, 'display', 'none');
    setStyle(dom.ckPill, 'display', 'none');
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

    // Ordinary target acquisition never draws a player-to-target link. This SVG is reserved for
    // remote-head previews whose exact world-to-world segment is the thing a press will deploy;
    // once deployed, the real rendered Massline cable replaces it.
    const previewSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    previewSvg.setAttribute('class', 'ml2-preview-link');
    previewSvg.style.display = 'none';
    const previewLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    previewLine.setAttribute('class', 'ml2-preview-line');
    previewSvg.appendChild(previewLine);
    root.appendChild(previewSvg);

    // World-anchored acquisition mark: the candidate the Massline will grab, drawn ON the candidate.
    const previewMark = document.createElement('div');
    previewMark.className = 'ml2-preview-mark';
    previewMark.style.display = 'none';
    previewMark.setAttribute('aria-hidden', 'true');
    const previewMarkGlyph = document.createElement('i');
    previewMark.appendChild(previewMarkGlyph);
    root.appendChild(previewMark);

    const previewSourceMark = document.createElement('div');
    previewSourceMark.className = 'ml2-preview-mark ml2-bridle-source';
    previewSourceMark.style.display = 'none';
    previewSourceMark.setAttribute('aria-hidden', 'true');
    const previewSourceGlyph = document.createElement('i');
    previewSourceMark.appendChild(previewSourceGlyph);
    root.appendChild(previewSourceMark);

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
      root, previewEl, previewMark, previewSourceMark, previewSvg, previewLine, throwEl, throwLabel, selfEl, selfLabel, ringSvg, ringCircle,
      btPill: bt.pill, btFill: bt.bar, ckPill: ck.pill, ckFill: ck.bar,
    };
    // A recreated DOM tree must receive its first complete paint even when the state object was
    // reused across a route/new-run boundary and its previous signature happens to match.
    clearHudSignatures(this.state);
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
  if (reason === 'target-lost' || reason === 'endpoint_lost') return 'ENDPOINT LOST';
  if (reason === 'preview-stale') return 'REACQUIRE';
  if (reason === 'pair_out_of_range') return 'PAIR OUT OF RANGE';
  if (reason === 'two_heavy_endpoints') return 'ONE HEAVY ENDPOINT MAX';
  if (reason === 'attachment_cycle') return 'WOULD FORM LOOP';
  if (reason === 'controller_attachment_limit') return 'CUT ACTIVE BRIDLE';
  return 'UNAVAILABLE';
}

function worldEntityLabel(entity) {
  const data = entity && entity.data;
  const label = data && (data.displayName || data.name || data.label);
  if (typeof label === 'string' && label.trim()) return label.trim();
  const type = entity && entity.type || 'endpoint';
  return type === 'asteroid' ? 'Anchor' : type.charAt(0).toUpperCase() + type.slice(1);
}

// Layout-free width estimate for the caption. Used only to choose which side of the mark the
// caption sits on, so an imprecise glyph metric shifts it, never truncates or hides it. 10px
// system-ui at 0.075em tracking averages ~5.9px per character; the padding+border is 20px.
function estimateCaptionWidth(text) {
  return Math.max(94, 20 + String(text || '').length * 5.9);
}

function viewportExtent(windowKey, documentKey, fallback) {
  const fromWindow = typeof window !== 'undefined' ? Number(window[windowKey]) : 0;
  if (fromWindow > 0) return fromWindow;
  const fromDocument = typeof document !== 'undefined'
    ? Number(document.documentElement && document.documentElement[documentKey])
    : 0;
  return fromDocument > 0 ? fromDocument : fallback;
}

function finiteProjection(value) {
  return !!(value && Number.isFinite(value.x) && Number.isFinite(value.y));
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
  setAttr(element, 'aria-label', cue.ariaLabel);
  setAttr(element, 'data-window-state', cue.state);
  setAttr(element, 'data-direction', cue.direction);
}

function setStyle(element, property, value) {
  if (!element) return;
  const cache = element._sfStyle || (element._sfStyle = Object.create(null));
  if (cache[property] === value) return;
  cache[property] = value;
  element.style[property] = value;
}

function setCssVar(element, property, value) {
  if (!element) return;
  const cache = element._sfCssVar || (element._sfCssVar = Object.create(null));
  if (cache[property] === value) return;
  cache[property] = value;
  element.style.setProperty(property, value);
}

function setAttr(element, name, value) {
  if (!element) return;
  const cache = element._sfAttr || (element._sfAttr = Object.create(null));
  if (cache[name] === value) return;
  cache[name] = value;
  element.setAttribute(name, value);
}

function setClass(element, name, enabled) {
  if (!element) return;
  const cache = element._sfClass || (element._sfClass = Object.create(null));
  const value = !!enabled;
  if (cache[name] === value) return;
  cache[name] = value;
  element.classList.toggle(name, value);
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function finite(v) { return Number.isFinite(v) ? v : 0; }
