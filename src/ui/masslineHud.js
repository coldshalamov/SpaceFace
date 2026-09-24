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
//   4. CADENCE READOUT — the Massline Cadence overlay's pre-release instrument (phase, ON VECTOR
//      status, conditional coast-window strip), mounted in a mid-left instrument slot. Mounted,
//      fed and disposed by this system per the delivery's INTEGRATION-NOTES §6; it renders the
//      same solution mirror the throw diamond reads, so there is exactly one release authority.
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
// Massline Cadence v1 overlay: the pre-release instrument (phase, ON VECTOR status, conditional
// coast-window strip, exit speed / signed clearance / line length). This module is the mount
// owner per the delivery's INTEGRATION-NOTES §6: we create it in _ensureDom, feed it state in
// update, and destroy it on disposal. It reads the SAME new solution mirror this file already
// consumes (state.massline2.throw.solution) — one authority, two surfaces: the world diamond
// below names WHERE the intercept sits, the panel names WHEN/status. No second model exists.
import { createMasslineCadenceReadout } from './masslineCadenceReadout.js';
// INF-078: the throw preview names protected bodies inside the predicted corridor using
// the law's own protected definition and the release geometry's advisory corridor. Read
// only on both sides — the cue never touches release authority.
import { isLawProtectedBody } from '../systems/lawSecurity.js';
import { resolveThrowCollateral } from '../combat/masslineReleaseGeometry.js';

// Lead moving intercept targets by half a fixed sim step. The 60 ms CSS tween then bridges the
// slower real-time cadence when bullet time reduces sim updates to ~21 Hz.
const MARK_PREDICTION_S = 1 / 120;

// M3: denied latches get a 1.2 s floor pill — long enough to read the reason, short enough not
// to outlive the next attempt.
const MASSLINE_DENIAL_PILL_S = 1.2;

// INF-015 — each denial names the condition plus one useful next action. Keys are the
// normalized copy previewStatusCopy emits, so the pill and the acquisition caption agree.
const DENIAL_NEXT_ACTION = Object.freeze({
  'LINE BLOCKED': 'REPOSITION FOR A CLEAR LINE',
  'OUT OF RANGE': 'CLOSE IN',
  'PROTECTED': 'PICK ANOTHER TARGET',
  'COOLDOWN': 'RELEASE AND RETRY',
  'ENDPOINT LOST': 'REACQUIRE',
  'REACQUIRE': 'REACQUIRE',
  'PAIR OUT OF RANGE': 'CLOSE IN',
  'ONE HEAVY ENDPOINT MAX': 'PICK A LIGHTER PAIR',
  'WOULD FORM LOOP': 'CUT THE ACTIVE LINE FIRST',
  'CUT ACTIVE LINE': 'CUT THE ACTIVE LINE FIRST',
  'NO TARGET': 'AIM AT A BODY',
  'LINE FAILED': 'CHECK THE FIT AND RETRY',
  'UNAVAILABLE': 'REPOSITION AND RETRY',
});
export function denialNextAction(status, reason) {
  return DENIAL_NEXT_ACTION[previewStatusCopy(status, reason)] ?? 'REPOSITION AND RETRY';
}

// Wave G1 — the bracket says one state. A three-word reason rides with DENIED.
// Sentences and next-action tutorials stay off this mark.
const BRACKET_DENIAL_REASON = Object.freeze({
  'LINE BLOCKED': 'LINE IS BLOCKED',
  'PROTECTED': 'BODY IS PROTECTED',
  'COOLDOWN': 'LINE ON COOLDOWN',
  'ENDPOINT LOST': 'ENDPOINT WAS LOST',
  'REACQUIRE': 'AIM AND REACQUIRE',
  'ONE HEAVY ENDPOINT MAX': 'PAIR TOO HEAVY',
  'WOULD FORM LOOP': 'WOULD FORM LOOP',
  'CUT ACTIVE LINE': 'CUT ACTIVE LINE',
  'NO TARGET': 'NO BODY AIMED',
  'LINE FAILED': 'LINE DID NOT',
  'UNAVAILABLE': 'LATCH NOT READY',
});

export function resolveMasslineBracketRead(status, reason) {
  const copy = previewStatusCopy(status, reason);
  if (status === 'ready' || copy === 'READY') {
    return { state: 'CAN', text: 'CAN', reason: '' };
  }
  if (copy === 'OUT OF RANGE' || copy === 'PAIR OUT OF RANGE') {
    return { state: 'OUT OF RANGE', text: 'OUT OF RANGE', reason: '' };
  }
  const words = BRACKET_DENIAL_REASON[copy] || 'LATCH NOT READY';
  return { state: 'DENIED', text: 'DENIED', reason: words };
}

export function bracketReadText(read) {
  if (!read) return '';
  return read.reason ? `${read.text} · ${read.reason}` : read.text;
}

/** What the glass paints. CAN and OUT OF RANGE are shapes on the mark; a denial keeps its three-word reason. */
export function bracketPaintText(read) {
  if (!read || read.state === 'CAN' || read.state === 'OUT OF RANGE') return '';
  return read.reason || '';
}

/** Shape id on the acquisition mark: open diamond, broken ring, or crossed diamond. */
export function bracketShapeId(read) {
  if (!read) return '';
  if (read.state === 'CAN') return 'can';
  if (read.state === 'OUT OF RANGE') return 'range';
  return 'denied';
}

const BRACKET_SHAPE_CLASSES = Object.freeze(['ml2-shape-can', 'ml2-shape-range', 'ml2-shape-denied']);

function setBracketShape(mark, shape) {
  if (!mark) return;
  for (const name of BRACKET_SHAPE_CLASSES) setClass(mark, name, name === `ml2-shape-${shape}`);
  setAttr(mark, 'data-bracket-shape', shape || '');
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Words sit on the bracket. If that box would cover the player hull, push them off it.
export function placeBracketWords(mark, hull, label, viewport) {
  const w = Math.max(1, Number(label && label.w) || 1);
  const h = Math.max(1, Number(label && label.h) || 1);
  const gap = 16;
  const vw = viewport && viewport.w > 0 ? viewport.w : 1440;
  const vh = viewport && viewport.h > 0 ? viewport.h : 900;
  const clamp = (rect) => ({
    x: Math.max(8, Math.min(rect.x, Math.max(8, vw - w - 8))),
    y: Math.max(8, Math.min(rect.y, Math.max(8, vh - h - 8))),
    w,
    h,
  });
  const candidates = [
    { x: mark.x - w / 2, y: mark.y - h - gap },
    { x: mark.x - w / 2, y: mark.y + gap },
    { x: mark.x + gap, y: mark.y - h / 2 },
    { x: mark.x - w - gap, y: mark.y - h / 2 },
  ];
  for (const candidate of candidates) {
    const rect = clamp(candidate);
    if (!hull || !rectsOverlap(rect, hull)) return rect;
  }
  const hx = hull.x + hull.w / 2;
  const hy = hull.y + hull.h / 2;
  const dx = mark.x - hx;
  const dy = mark.y - hy;
  const len = Math.hypot(dx, dy);
  if (len < 1) {
    return clamp({ x: hx - w / 2, y: hull.y - h - gap });
  }
  const push = Math.max(hull.w, hull.h) + gap + Math.max(w, h);
  return clamp({
    x: hx + (dx / len) * push - w / 2,
    y: hy + (dy / len) * push - h / 2,
  });
}

function playerHullScreenRect(player, w2s) {
  if (!player || !player.pos || typeof w2s !== 'function') return null;
  const screen = projectWorld(w2s, player.pos.x, player.pos.z);
  if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return null;
  const size = 64;
  return { x: screen.x - size / 2, y: screen.y - size / 2, w: size, h: size };
}

// INF-013 — compact relative-mass interpretation for the acquisition readout: which body is
// going to move, read from the same effective masses the live physics path couples
// (entity.physicsBody.mass ?? entity.mass, the masses stepMassline receives as owner/target).
// A 3x ratio names the likely outcome; anything closer is comparable. Labels say LIKELY —
// a heavy object is never promised immovable.
export const MASS_ANCHOR_RATIO = 3;
export function resolveMassInterpretation(playerMass, targetMass) {
  const p = Number(playerMass);
  const t = Number(targetMass);
  if (!(p > 0) || !(t > 0) || !Number.isFinite(p) || !Number.isFinite(t)) return null;
  if (p >= t * MASS_ANCHOR_RATIO) {
    return { key: 'likely-payload', short: 'PAYLOAD', title: 'Likely payload — it should move more than you' };
  }
  if (t >= p * MASS_ANCHOR_RATIO) {
    return { key: 'likely-anchor', short: 'ANCHOR', title: 'Likely anchor — you should move more than it; nothing is immovable' };
  }
  return { key: 'comparable', short: 'EVEN', title: 'Comparable mass — both bodies move' };
}

// INF-014 — line-load warning with hysteresis. Strain is the solver-owned break ratio the
// telemetry already mirrors (tether.strain); trend is strain per second. The warning turns on
// at high load (or moderate load climbing fast) and stays until the line relaxes well below
// the trip band, so a tightening turn reads distinctly from steady towing without chattering
// around the threshold. Presentation only — the solver is untouched.
export const LINE_LOAD_WARN_ON = 0.75;
export const LINE_LOAD_WARN_RISING_ON = 0.6;
export const LINE_LOAD_RISE_RATE_ON = 0.5;
export const LINE_LOAD_WARN_OFF = 0.5;
export function resolveLineLoadWarning(strain, trendPerS, warned) {
  const s = Number(strain);
  if (!(s >= 0) || !Number.isFinite(s)) return false;
  if (warned) return s > LINE_LOAD_WARN_OFF;
  if (s >= LINE_LOAD_WARN_ON) return true;
  const trend = Number(trendPerS);
  return s >= LINE_LOAD_WARN_RISING_ON && Number.isFinite(trend) && trend >= LINE_LOAD_RISE_RATE_ON;
}

export const MASSLINE_HUD_CSS = `
#sf-ml2 { position:absolute; inset:0; pointer-events:none; z-index:6; }
#sf-ml2 .ml2-mark { position:absolute; left:0; top:0; will-change:transform;
  transition:transform 60ms linear; }
#sf-ml2 .ml2-mark.ml2-offscreen { filter:drop-shadow(0 0 7px rgba(2,6,11,0.92)); }
#sf-ml2 .ml2-mark-label { position:absolute; left:50%; top:calc(100% + 7px); transform:translateX(-50%);
  padding:2px 5px; border:1px solid currentColor; background:rgba(4,14,24,0.82); color:var(--ml2-c,var(--dp-lamp, #f2b950));
  font:750 12px/1.2 system-ui,sans-serif; letter-spacing:.06em; text-shadow:0 1px 2px #02060b;
  white-space:nowrap; }
#sf-ml2 .ml2-preview-link { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
#sf-ml2 .ml2-preview-line { stroke:rgba(242,185,80,0.6); stroke-width:1.5; stroke-dasharray:4 6;
  vector-effect:non-scaling-stroke; }
#sf-ml2 .ml2-preview-link.ml2-snare-preview .ml2-preview-line { stroke:rgba(255,217,140,0.92);
  stroke-width:2.25; stroke-dasharray:10 5 2 5; filter:drop-shadow(0 0 5px rgba(242,185,80,0.72)); }
#sf-ml2 .ml2-preview-link.ml2-bridle-preview .ml2-preview-line { stroke:rgba(255,181,71,0.9);
  stroke-width:2; stroke-dasharray:7 5; filter:drop-shadow(0 0 4px rgba(242,185,80,0.55)); }
#sf-ml2 .ml2-preview.ml2-preview-snare { border-style:solid; border-left-width:1px; }
/* The acquisition MARK is the world anchor: it sits on the candidate itself, so the preview never
   needs a player-to-target link line (see _updateAcquisitionPreview). Shape, not colour, carries
   the state — diamond = ready, circle = protected, dashed = unavailable. */
#sf-ml2 .ml2-preview-mark { position:absolute; left:0; top:0; width:24px; height:24px;
  margin:-12px 0 0 -12px; will-change:transform; transition:transform 60ms linear;
  color:var(--ml2-p,var(--dp-lamp-hot, #ffd98c)); }
#sf-ml2 .ml2-preview-mark i { position:absolute; inset:0; border:2px solid currentColor;
  transform:rotate(45deg); box-shadow:0 0 9px currentColor; }
#sf-ml2 .ml2-preview-mark.ml2-mark-protected i { border-radius:50%; transform:none; }
#sf-ml2 .ml2-preview-mark.ml2-mark-unavailable { color:var(--dp-ink-dim, #a9a696); }
#sf-ml2 .ml2-preview-mark.ml2-mark-unavailable i { border-style:dashed; box-shadow:none; }
/* Phase 4.2 — the latch state is the shape. CAN is an open diamond, range is a broken ring,
   a denial is a diamond with a cross. The word itself is not painted beside the body. */
#sf-ml2 .ml2-preview-mark.ml2-shape-can i { border-style:solid; border-radius:0; transform:rotate(45deg);
  box-shadow:0 0 9px currentColor; background:none; }
#sf-ml2 .ml2-preview-mark.ml2-shape-range i { border-style:solid; border-radius:50%; transform:none;
  border-right-color:transparent; box-shadow:none; background:none; }
#sf-ml2 .ml2-preview-mark.ml2-shape-denied i { border-style:solid; border-radius:0; transform:rotate(45deg);
  box-shadow:none;
  background:linear-gradient(currentColor, currentColor) center/2px 70% no-repeat,
    linear-gradient(currentColor, currentColor) center/70% 2px no-repeat; }
#sf-ml2 .ml2-preview-mark.ml2-bridle-source { color:var(--dp-lamp, #f2b950); }
#sf-ml2 .ml2-preview-mark.ml2-bridle-source i { inset:2px; transform:none; box-shadow:0 0 9px currentColor; }
#sf-ml2 .ml2-preview-mark.ml2-bridle-target { color:#ffb547; }
#sf-ml2 .ml2-preview-mark.ml2-offscreen { filter:drop-shadow(0 0 7px rgba(2,6,11,0.92)); }
#sf-ml2 .ml2-preview { position:absolute; left:0; top:0; min-width:94px;
  transform:translate3d(-9999px,-9999px,0); padding:6px 9px 5px 9px;
  border:1px solid var(--dp-lamp-dim, #8a6b3a); border-left-width:1px;
  background:linear-gradient(90deg,rgba(11,13,16,0.86),rgba(11,13,16,0.4));
  clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px));
  color:var(--dp-ink, #e8e2d4); text-shadow:0 1px 2px #02060b; white-space:nowrap;
  font:650 12px/1.28 var(--dp-face-read, system-ui), sans-serif; letter-spacing:.1em; text-transform:uppercase;
  animation:ml2preview 1.3s ease-in-out infinite; }
#sf-ml2 .ml2-preview.ml2-preview-blocked,
#sf-ml2 .ml2-preview.ml2-preview-protected,
#sf-ml2 .ml2-preview.ml2-preview-out-of-range,
#sf-ml2 .ml2-preview.ml2-preview-invalid { border-style:dashed; color:#ffd08a; }
#sf-ml2 .ml2-preview.ml2-preview-offscreen { border-style:dashed; }
@keyframes ml2preview { 0%,100% { opacity:0.78; } 50% { opacity:1; } }
/* §22 F1 — the release ghost: a thin predicted arc of the payload's own post-release path,
   drawn from the same solution the diamond reads. Cooler and thinner than the intercept mark —
   it is the future, not the target — and it warms to the same amber when the window opens. */
#sf-ml2 svg.ml2-ghost { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
#sf-ml2 .ml2-ghost-path { fill:none; stroke:rgba(140,190,235,0.5); stroke-width:1.4;
  stroke-dasharray:3 7; stroke-linecap:round; vector-effect:non-scaling-stroke; }
#sf-ml2 svg.ml2-ghost.ml2-hot .ml2-ghost-path { stroke:rgba(255,217,140,0.85); }
#sf-ml2 .ml2-throw { width:26px; height:26px; margin:-13px 0 0 -13px; }
#sf-ml2 .ml2-throw .ml2-diamond { width:100%; height:100%; transform:rotate(45deg);
  border:2px solid var(--ml2-c,var(--dp-lamp, #f2b950)); box-shadow:0 0 10px var(--ml2-c,var(--dp-lamp, #f2b950));
  transition:border-color 80ms linear, box-shadow 80ms linear; }
#sf-ml2 .ml2-throw.ml2-hot .ml2-diamond { outline:2px solid var(--ml2-c,var(--dp-lamp, #f2b950)); outline-offset:4px; }
#sf-ml2 .ml2-throw.ml2-hot .ml2-diamond { animation:ml2pulse 0.5s ease-in-out infinite; }
/* INF-016: a degraded intercept reads as shape, not colour — dashed outline, never hot. */
#sf-ml2 .ml2-throw.ml2-degraded .ml2-diamond { border-style:dashed; box-shadow:none; }
#sf-ml2 .ml2-self.ml2-degraded { opacity:0.45; }
@keyframes ml2pulse { 0%,100% { transform:rotate(45deg) scale(1); } 50% { transform:rotate(45deg) scale(1.3); } }
#sf-ml2 .ml2-self { width:0; height:0; margin:-7px 0 0 -7px;
  border-left:7px solid transparent; border-right:7px solid transparent;
  border-bottom:12px solid var(--ml2-c,var(--dp-lamp, #f2b950)); opacity:0.7; filter:drop-shadow(0 0 6px var(--ml2-c,var(--dp-lamp, #f2b950))); }
#sf-ml2 .ml2-self .ml2-mark-label { top:17px; }
#sf-ml2 .ml2-self.ml2-hot { outline:2px solid var(--ml2-c,var(--dp-lamp, #f2b950)); outline-offset:5px; opacity:1; }
#sf-ml2 svg.ml2-ring { position:absolute; left:0; top:0; overflow:visible; }
#sf-ml2 .ml2-ring circle { fill:rgba(242,185,80,0.05); stroke:var(--dp-lamp, #f2b950); stroke-width:1.4;
  stroke-dasharray:10 7; opacity:0.55; }
#sf-ml2 .ml2-meters { position:absolute; left:50%; bottom:120px; transform:translateX(-50%);
  display:flex; flex-direction:row; flex-wrap:wrap; justify-content:center;
  gap:6px 10px; align-items:center; max-width:min(560px, 60vw); }
#sf-ml2 .ml2-pill { display:flex; align-items:center; gap:7px; padding:3px 9px;
  border-radius:var(--dp-r-instrument, 3px);
  background-color:var(--dp-metal-1, #12151a); background-image:none;
  border:0; box-shadow:none;
  font:600 12px/1.4 system-ui, sans-serif; letter-spacing:.06em; color:var(--dp-ink-dim, #cbd5e1); }
#sf-ml2 .ml2-pill .ml2-fill { width:64px; height:4px; border-radius:2px; background:var(--dp-metal-3, rgba(148,163,184,0.22));
  position:relative; overflow:hidden; }
#sf-ml2 .ml2-pill .ml2-fill i { position:absolute; inset:0; transform-origin:left center; background:var(--dp-lamp, var(--dp-lamp, #f2b950)); }
#sf-ml2 .ml2-pill.ml2-on { box-shadow:0 0 8px var(--dp-lamp-bloom, rgba(242,185,80,0.35)); color:var(--dp-lamp-hot, #ffd98c); }
#sf-ml2 .ml2-pill.ml2-cloak .ml2-fill i { background:#9f8bff; }
#sf-ml2 .ml2-pill.ml2-cloak.ml2-on { box-shadow:0 0 8px rgba(159,139,255,.3); color:#efeaff; }
#sf-ml2 .ml2-pill.ml2-strain .ml2-fill i { background:var(--dp-lamp, #f2b950); }
#sf-ml2 .ml2-pill.ml2-strain.ml2-warn { color:#ffd08a; border:1px solid #8a6b3a; }
#sf-ml2 .ml2-pill.ml2-strain.ml2-warn .ml2-fill i { background:#ff9d5c; }
/* Cadence instrument slot: mid-LEFT column — away from the central playfield, clear of the comms
   strip (top-left), the vitals cluster (bottom-left), the FOCUS/CLOAK pills (bottom-centre), the
   objective/band HUD (top-right) and the radar dock (bottom-right). The side columns are the
   flight deck's cue space (see pinToCueRing below), so an instrument belongs there. */
#sf-ml2 .ml2-cadence-slot { position:absolute;
  left:calc(22px + var(--sf-safe-inset-x, 0px)); top:46%; transform:translateY(-50%); }
@media (max-height: 760px) {
  #sf-ml2 .ml2-cadence-slot { top:30%; }
}
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
  #sf-ml2 .ml2-ghost-path { stroke:CanvasText; }
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

const SCREEN_QUERY = { x: 0, y: 0, z: 0 };

function projectWorld(w2s, x, z) {
  SCREEN_QUERY.x = x;
  SCREEN_QUERY.y = 0;
  SCREEN_QUERY.z = z;
  return w2s(SCREEN_QUERY);
}

/**
 * VERB-08 — the meeting diamond is the throw intercept. Hide it when the player is the body
 * that will move: the latched body is the player, or it outweighs the player (a heavy anchor
 * or a self-sling). A lighter payload still gets the diamond.
 */
export function meetingDiamondHidden(throwState, state) {
  if (!throwState || !state || state.playerId == null) return false;
  if (throwState.payloadId === state.playerId) return true;
  const get = state.entities && state.entities.get;
  if (typeof get !== 'function' || throwState.payloadId == null) return false;
  const player = get.call(state.entities, state.playerId);
  const anchor = get.call(state.entities, throwState.payloadId);
  if (!player || !anchor) return false;
  const anchorBody = Number(anchor.physicsBody && anchor.physicsBody.mass);
  const playerBody = Number(player.physicsBody && player.physicsBody.mass);
  const anchorMass = Number.isFinite(anchorBody) && anchorBody > 0 ? anchorBody : Number(anchor.mass);
  const playerMass = Number.isFinite(playerBody) && playerBody > 0 ? playerBody : Number(player.mass);
  return Number.isFinite(anchorMass) && Number.isFinite(playerMass) && anchorMass > playerMass;
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

// INF-078: collateral-cue inputs. Only KNOWN bodies qualify — alive with a finite
// position and a measurable radius. The dead, the unpositioned, and the unmeasurable
// are uncertainty, not evidence, so they never trigger the cue. The actors (payload,
// player, aim target) are not bystanders.
function throwPayloadEntity(throwState, state) {
  const id = throwState && throwState.payloadId;
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(id) || null;
}

function throwPayloadPoint(throwState, state) {
  const payload = throwPayloadEntity(throwState, state);
  return payload && payload.pos ? { x: payload.pos.x, z: payload.pos.z } : null;
}

function throwPayloadRadius(throwState, state) {
  const payload = throwPayloadEntity(throwState, state);
  return payload && Number.isFinite(payload.radius) ? payload.radius : 0;
}

const COLLATERAL_SPOTS = [];
// §22 F1 — the release ghost decimates a long projected path to a bounded polyline and always
// keeps the final point so the arc reaches the predicted contact, not a decimated shortfall.
const GHOST_MAX_POINTS = 48;
const GHOST_FALLBACK_POINTS = [null, null];

function ghostScreenPoint(w2s, p) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
  const s = projectWorld(w2s, p.x, p.z);
  if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
  return `${Math.round(s.x * 10) / 10} ${Math.round(s.y * 10) / 10}`;
}

function throwCollateralSpots(state, throwState) {
  const spots = COLLATERAL_SPOTS;
  let count = 0;
  const entities = state && state.entities;
  if (!entities || typeof entities.forEach !== 'function') {
    spots.length = 0;
    return spots;
  }
  const releaseTarget = throwState && throwState.releaseTarget;
  const aimId = throwState && throwState.aimTargetId != null
    ? throwState.aimTargetId
    : releaseTarget && releaseTarget.targetId;
  entities.forEach((entity) => {
    if (!entity || entity.id === (throwState && throwState.payloadId)
        || entity.id === state.playerId || entity.id === aimId) return;
    if (entity.alive === false || !entity.pos
        || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)
        || !Number.isFinite(entity.radius)) return;
    if (!isLawProtectedBody(entity)) return;
    const data = entity.data || {};
    const raw = data.displayName || data.name || data.label || entity.type || 'body';
    let spot = spots[count];
    if (!spot) spot = spots[count] = { x: 0, z: 0, r: 0, label: '' };
    spot.x = entity.pos.x;
    spot.z = entity.pos.z;
    spot.r = entity.radius;
    spot.label = String(raw).slice(0, 28).toUpperCase();
    count += 1;
  });
  spots.length = count;
  return spots;
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
  // Cadence readout strip: the panel repaints only when this signature rolls, so every value it
  // renders rides here. (Massline Cadence overlay — solution mirror gained payloadSpeed,
  // clearance, decisionStale, fieldAware and the conditional coast `window`.)
  fields[index++] = solution.payloadSpeed;
  fields[index++] = solution.clearance;
  fields[index++] = !!solution.decisionStale;
  fields[index++] = !!solution.fieldAware;
  // INF-016: degraded confidence repaints the diamond the tick the target's turn trips it.
  fields[index++] = !!solution.degraded;
  fields[index++] = Math.round((Number(solution.turnRate) || 0) * 20) / 20;
  fields[index++] = !!(selfSolution && selfSolution.degraded);
  // §22 F1: the release ghost repaints with every fresh prediction sample — sampleTick rolls
  // when `predicted`/`projectedPath` change even if the scalars above happen to hold.
  fields[index++] = solution.sampleTick;
  fields[index++] = selfSolution.sampleTick;
  const cadenceWindow = solution.window;
  fields[index++] = !!cadenceWindow && !!cadenceWindow.reliable;
  fields[index++] = cadenceWindow && cadenceWindow.enterS;
  fields[index++] = cadenceWindow && cadenceWindow.exitS;
  fields[index++] = cadenceWindow ? cadenceWindow.reason : null;
  fields[index++] = playerState.tether && playerState.tether.cadence
    ? playerState.tether.cadence.phase : null;
  fields[index++] = playerState.tether && playerState.tether.restLength;
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
  // M3 denial pill: the remaining-time field is quantized so the signature rolls over as the
  // pill ages out — a stale pill never survives its 1.2 s floor because inputs "didn't change".
  const denial = state.masslineDenial;
  fields[index++] = denial ? denial.reason : null;
  fields[index++] = denial ? denial.targetId : null;
  fields[index++] = denial ? Math.max(0, Math.ceil((finite(denial.untilSimTime) - finite(state.simTime)) * 4)) : 0;
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
  // INF-013: effective masses + interpretation key — the caption repaints after cargo/fitting
  // changes because the signature rolls with them.
  fields[index++] = Math.round(finite(player && player.physicsBody && player.physicsBody.mass)
    || finite(player && player.mass));
  let selectedMass = 0;
  if (selected.targetId != null && state.entities && typeof state.entities.get === 'function') {
    const selectedEntity = state.entities.get(selected.targetId);
    const bodyMass = selectedEntity && selectedEntity.physicsBody && selectedEntity.physicsBody.mass;
    selectedMass = Math.round(finite(bodyMass) || finite(selectedEntity && selectedEntity.mass));
  }
  fields[index++] = selectedMass;
  // INF-014: solver-owned strain (quantized so the bar rolls with it).
  let strain = 0;
  if (playerState.tether && playerState.tether.active) {
    const raw = Number.isFinite(playerState.tether.strain)
      ? playerState.tether.strain
      : finite(playerState.masslineTelemetry && playerState.masslineTelemetry.strain);
    strain = Math.round(finite(raw) * 50) / 50;
  }
  fields[index++] = strain;
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
    this._cadenceReadout = null;
    this._lineLoad = null;
    // M3: every denied latch gets words — the bus event is the one seam all six emit sites share.
    // The denial lands on a state field so it joins the HUD signature and redraws on arrival/expiry.
    // INF-015: a held latch input must not re-announce the same denial every tick, and a
    // successful latch clears a stale pill immediately instead of letting it linger its floor.
    if (ctx.bus && typeof ctx.bus.on === 'function') {
      ctx.bus.on('tether:latchDenied', (p) => {
        if (!this.state) return;
        const reason = p && p.reason;
        const targetId = p && p.targetId;
        const now = finite(this.state.simTime);
        const current = this.state.masslineDenial;
        if (current && Number.isFinite(current.untilSimTime) && current.untilSimTime > now
          && current.reason === reason && current.targetId === targetId) return;
        this.state.masslineDenial = {
          reason,
          targetId,
          untilSimTime: now + MASSLINE_DENIAL_PILL_S,
        };
      });
      ctx.bus.on('tether:latched', () => {
        if (!this.state) return;
        this.state.masslineDenial = null;
      });
    }
  },

  destroy() {
    if (this._cadenceReadout) {
      this._cadenceReadout.destroy();
      this._cadenceReadout = null;
    }
    if (this._dom && this._dom.root && this._dom.root.parentNode) {
      this._dom.root.parentNode.removeChild(this._dom.root);
    }
    this._dom = null;
    if (this.state) this.state.masslineDenial = null;
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
    this._updateMeters(dom, ml2, state);
    this._updateCadenceReadout(state);
  },

  // The pre-latch answer to "what will the Massline grab?" (PHYSICAL_PLAY_GRAMMAR §7.1, rule 2).
  //
  // A MARK sits on the candidate and a caption sits beside it. There is deliberately NO line back
  // to the ship: a dashed player-to-target link reads as a second cable and claims an attachment
  // that does not exist yet — only the real rendered Massline may connect the player to an object.
  // The mark is what makes the caption world-anchored, so no connector is needed.
  _updateAcquisitionPreview(dom, state, player, w2s) {
    // M3: a live latch denial wins the slot for its full 1.2 s floor — a press that grabbed
    // nothing must still say so, in words, at the spot it was aimed.
    // INF-015: a successful latch clears the pill at once — the tether mirror is the truth,
    // not the pill timer.
    if (state.masslineDenial && state.player && state.player.tether && state.player.tether.active) {
      state.masslineDenial = null;
    }
    const denial = state.masslineDenial;
    if (denial && finite(state.simTime) < finite(denial.untilSimTime)) {
      return this._renderDenialPill(dom, state, player, w2s, denial);
    }
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
    const targetScreen = projectWorld(w2s, target.pos.x, target.pos.z);
    if (!targetScreen || !Number.isFinite(targetScreen.x) || !Number.isFinite(targetScreen.y)) {
      return this._hideAcquisitionPreview(dom);
    }

    const viewportWidth = viewportExtent('innerWidth', 'clientWidth', 1440);
    const viewportHeight = viewportExtent('innerHeight', 'clientHeight', 900);
    const offscreen = !targetScreen.onScreen
      || targetScreen.x < 0 || targetScreen.x > viewportWidth
      || targetScreen.y < 0 || targetScreen.y > viewportHeight;
    const pinned = offscreen ? pinToCueRing(targetScreen.x, targetScreen.y, viewportWidth, viewportHeight) : null;
    const cueX = pinned ? pinned.x : targetScreen.x;
    const cueY = pinned ? pinned.y : targetScreen.y;
    const ready = selected.status === 'ready';
    const read = resolveMasslineBracketRead(selected.status, selected.reason);
    const text = bracketReadText(read);
    const paint = bracketPaintText(read);
    const captionWidth = estimateCaptionWidth(paint || text);
    const placed = placeBracketWords(
      { x: cueX, y: cueY },
      playerHullScreenRect(player, w2s),
      { w: captionWidth, h: 18 },
      { w: viewportWidth, h: viewportHeight },
    );
    const labelX = placed.x;
    const labelY = placed.y;

    setStyle(dom.previewMark, 'display', 'block');
    setStyle(dom.previewSourceMark, 'display', 'none');
    setStyle(dom.previewMark, 'transform', `translate3d(${Math.round(cueX)}px, ${Math.round(cueY)}px, 0)`);
    setClass(dom.previewMark, 'ml2-bridle-target', false);
    setClass(dom.previewMark, 'ml2-offscreen', offscreen);
    setClass(dom.previewMark, 'ml2-mark-protected', selected.status === 'protected');
    setClass(dom.previewMark, 'ml2-mark-unavailable', !ready && selected.status !== 'protected');
    setBracketShape(dom.previewMark, bracketShapeId(read));
    setAttr(dom.previewMark, 'aria-hidden', 'false');
    setAttr(dom.previewMark, 'role', 'img');
    setAttr(dom.previewMark, 'aria-label', offscreen ? `${text}, offscreen` : text);

    setStyle(dom.previewEl, 'display', paint ? 'block' : 'none');
    setClass(dom.previewEl, 'ml2-preview-snare', false);
    setClass(dom.previewSvg, 'ml2-snare-preview', false);
    setClass(dom.previewSvg, 'ml2-bridle-preview', false);
    setStyle(dom.previewSvg, 'display', 'none');
    setStyle(dom.previewEl, 'transform', `translate3d(${Math.round(labelX)}px, ${Math.round(labelY)}px, 0)`);
    if (dom.previewEl.textContent !== paint) dom.previewEl.textContent = paint;
    setAttr(dom.previewEl, 'data-bracket-state', read.state);
    setAttr(dom.previewEl, 'aria-label', offscreen ? `${text}, offscreen` : text);
    setAttr(dom.previewEl, 'data-receipt-id', String(receipt.id || ''));
    setAttr(dom.previewEl, 'data-target-id', String(selected.targetId));
    setClass(dom.previewEl, 'ml2-preview-offscreen', offscreen);
    for (const name of ['ready', 'blocked', 'protected', 'out-of-range', 'cooldown', 'invalid']) {
      setClass(dom.previewEl, `ml2-preview-${name}`, selected.status === name);
    }
  },

  // M3 denial pill: a 1.2 s floor caption at the denied target (or just under the ship when the
  // latch had no target at all). Reuses the preview caption DOM — the denial replaces, never
  // stacks on, the acquisition preview.
  _renderDenialPill(dom, state, player, w2s, denial) {
    const denied = denial.targetId != null && state.entities && state.entities.get
      ? state.entities.get(denial.targetId) : null;
    const anchor = denied && denied.pos ? denied.pos : player.pos;
    const screen = projectWorld(w2s, anchor.x, anchor.z);
    if (!finiteProjection(screen)) return this._hideAcquisitionPreview(dom);
    const viewportWidth = viewportExtent('innerWidth', 'clientWidth', 1440);
    const viewportHeight = viewportExtent('innerHeight', 'clientHeight', 900);
    const offscreen = !screen.onScreen
      || screen.x < 0 || screen.x > viewportWidth
      || screen.y < 0 || screen.y > viewportHeight;
    const pinned = offscreen ? pinToCueRing(screen.x, screen.y, viewportWidth, viewportHeight) : null;
    const cueX = pinned ? pinned.x : screen.x;
    const cueY = pinned ? pinned.y : screen.y;
    const read = resolveMasslineBracketRead('invalid', denial.reason);
    const text = bracketReadText(read);
    const paint = bracketPaintText(read);
    const captionWidth = estimateCaptionWidth(paint || text);
    const placed = placeBracketWords(
      { x: cueX, y: cueY },
      playerHullScreenRect(player, w2s),
      { w: captionWidth, h: 18 },
      { w: viewportWidth, h: viewportHeight },
    );
    const labelX = placed.x;
    const labelY = placed.y;
    setStyle(dom.previewMark, 'display', denied ? 'block' : 'none');
    if (denied) {
      setStyle(dom.previewMark, 'transform', `translate3d(${Math.round(cueX)}px, ${Math.round(cueY)}px, 0)`);
      setClass(dom.previewMark, 'ml2-bridle-target', false);
      setClass(dom.previewMark, 'ml2-offscreen', offscreen);
      setClass(dom.previewMark, 'ml2-mark-protected', false);
      setClass(dom.previewMark, 'ml2-mark-unavailable', true);
      setBracketShape(dom.previewMark, bracketShapeId(read));
      setAttr(dom.previewMark, 'aria-hidden', 'false');
      setAttr(dom.previewMark, 'role', 'img');
      setAttr(dom.previewMark, 'aria-label', text);
    }
    setStyle(dom.previewSourceMark, 'display', 'none');
    setStyle(dom.previewSvg, 'display', 'none');
    setStyle(dom.previewEl, 'display', 'block');
    setClass(dom.previewEl, 'ml2-preview-snare', false);
    setStyle(dom.previewEl, 'transform', `translate3d(${Math.round(labelX)}px, ${Math.round(labelY)}px, 0)`);
    if (dom.previewEl.textContent !== paint) dom.previewEl.textContent = paint;
    setAttr(dom.previewEl, 'data-bracket-state', read.state);
    setAttr(dom.previewEl, 'aria-label', text);
    setAttr(dom.previewEl, 'data-receipt-id', '');
    setAttr(dom.previewEl, 'data-target-id', String(denial.targetId ?? ''));
    setClass(dom.previewEl, 'ml2-preview-offscreen', offscreen);
    for (const name of ['ready', 'blocked', 'protected', 'out-of-range', 'cooldown', 'invalid']) {
      setClass(dom.previewEl, `ml2-preview-${name}`, name === 'invalid');
    }
  },

  _hideAcquisitionPreview(dom) {
    setStyle(dom.previewEl, 'display', 'none');
    setBracketShape(dom.previewMark, '');
    setAttr(dom.previewMark, 'aria-hidden', 'true');
    setAttr(dom.previewMark, 'aria-label', '');
    setStyle(dom.previewMark, 'display', 'none');
    setStyle(dom.previewSourceMark, 'display', 'none');
    setStyle(dom.previewSvg, 'display', 'none');
    setClass(dom.previewEl, 'ml2-preview-snare', false);
    setClass(dom.previewSvg, 'ml2-snare-preview', false);
    setClass(dom.previewSvg, 'ml2-bridle-preview', false);
  },

  _updateSnarePreview(dom, preview, w2s) {
    const source = projectWorld(w2s, preview.source.x, preview.source.z);
    const target = projectWorld(w2s, preview.target.x, preview.target.z);
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
    const sourceScreen = projectWorld(w2s, sourceEntity.pos.x, sourceEntity.pos.z);
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
      ? projectWorld(w2s, targetEntity.pos.x, targetEntity.pos.z)
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
    if (!solution || !solution.valid || meetingDiamondHidden(throwState, state)) {
      setStyle(dom.throwEl, 'display', 'none');
      if (dom.ghostSvg) setStyle(dom.ghostSvg, 'display', 'none');
      return;
    }
    // Place the diamond on the intercept ray at either the aim entity or a fixed reach — the
    // POSITION names the consequence ("the rock goes THERE"), the COLOR names the timing.
    const mark = resolveThrowMarkWorldPoint(throwState, state);
    if (!mark) {
      setStyle(dom.throwEl, 'display', 'none');
      if (dom.ghostSvg) setStyle(dom.ghostSvg, 'display', 'none');
      return;
    }
    const proj = projectWorld(w2s, mark.x, mark.z);
    const cue = resolveReleaseCue(proj, {
      viewportWidth: viewportExtent('innerWidth', 'clientWidth', 1440),
      viewportHeight: viewportExtent('innerHeight', 'clientHeight', 900),
      kind: 'throw',
      onSolution: solution.onSolution,
      targetKind: mark.targetKind,
    });
    if (!cue.visible) {
      setStyle(dom.throwEl, 'display', 'none');
      if (dom.ghostSvg) setStyle(dom.ghostSvg, 'display', 'none');
      return;
    }
    setStyle(dom.throwEl, 'display', 'block');
    setStyle(dom.throwEl, 'transform', `translate3d(${cue.x}px, ${cue.y}px, 0)`);
    // INF-016: degraded confidence is its own mark — dashed, never hot, labelled STALE.
    const degradedThrow = solution.degraded === true;
    const hot = !!solution.onSolution && !degradedThrow;
    setClass(dom.throwEl, 'ml2-hot', hot);
    setClass(dom.throwEl, 'ml2-degraded', degradedThrow);
    setClass(dom.throwEl, 'ml2-offscreen', cue.offscreen);
    setCssVar(dom.throwEl, '--ml2-c', rampColor(solution.errorRad, solution.tolRad, hot));
    applyCueState(dom.throwEl, dom.throwLabel, cue);
    // §22 F1 — the release ghost: the payload's predicted post-release path, read-only off the
    // same mirrored solution the diamond and the cadence readout consume. A stale/degraded
    // solution promises nothing, so it paints no path.
    this._updateThrowGhost(dom, solution, throwPayloadPoint(throwState, state), w2s, hot);
    // INF-078: one advisory collateral cue. A known protected body inside the predicted
    // corridor is NAMED, never vetoed: this only extends the caption, release authority
    // and law adjudication are untouched. Stale/degraded solutions and unknown bodies
    // stay silent via the corridor helper's own suppression.
    if (!degradedThrow) {
      const collateral = resolveThrowCollateral(solution,
        throwPayloadPoint(throwState, state), throwPayloadRadius(throwState, state),
        throwCollateralSpots(state, throwState));
      if (collateral) {
        const advisory = `${cue.label} · COLLATERAL RISK · ${collateral.label}`;
        if (dom.throwLabel && dom.throwLabel.textContent !== advisory) {
          dom.throwLabel.textContent = advisory;
        }
        setAttr(dom.throwEl, 'aria-label',
          `${cue.ariaLabel}, possible collateral risk near ${collateral.label.toLowerCase()}`);
      }
    }
    if (degradedThrow) {
      if (dom.throwLabel && dom.throwLabel.textContent !== 'STALE') dom.throwLabel.textContent = 'STALE';
      setAttr(dom.throwEl, 'aria-label', 'Massline throw intercept degraded, target turning');
      setAttr(dom.throwEl, 'data-window-state', 'degraded');
    }
  },

  // §22 F1 — the release ghost. The field-aware solution already carries its own
  // `projectedPath` (the semi-implicit integration the throw will fly); the constant-velocity
  // model carries only `predicted`, so its ghost is the straight segment payload -> intercept.
  // Both read the mirrored solution — no second predictor, no steering. Stale or degraded
  // solutions paint nothing: a prediction that cannot be trusted must not draw one.
  _updateThrowGhost(dom, solution, from, w2s, hot) {
    const svg = dom.ghostSvg;
    if (!svg) return;
    const stale = solution.degraded === true || solution.decisionStale === true;
    let points = null;
    const projected = solution.projectedPath;
    if (Array.isArray(projected) && projected.length >= 2) {
      points = projected;
    } else {
      const predicted = solution.predicted;
      if (from && Number.isFinite(from.x) && Number.isFinite(from.z)
          && predicted && Number.isFinite(predicted.x) && Number.isFinite(predicted.z)) {
        points = GHOST_FALLBACK_POINTS;
        points[0] = from;
        points[1] = predicted;
      }
    }
    if (stale || !points) { setStyle(svg, 'display', 'none'); return; }
    const stride = Math.max(1, Math.ceil(points.length / GHOST_MAX_POINTS));
    const last = points.length - 1;
    let d = '';
    let count = 0;
    for (let i = 0; i < last; i += stride) {
      const seg = ghostScreenPoint(w2s, points[i]);
      if (!seg) continue;
      d += `${count === 0 ? 'M' : 'L'}${seg}`;
      count += 1;
    }
    // The final predicted point always lands so the arc reaches the contact the diamond names.
    const tip = ghostScreenPoint(w2s, points[last]);
    if (tip) {
      d += `${count === 0 ? 'M' : 'L'}${tip}`;
      count += 1;
    }
    if (count < 2) { setStyle(svg, 'display', 'none'); return; }
    if (dom.ghostD !== d) {
      dom.ghostD = d;
      dom.ghostPath.setAttribute('d', d);
    }
    setClass(svg, 'ml2-hot', !!hot);
    setStyle(svg, 'display', 'block');
  },

  _updateSelfMark(dom, throwState, state, w2s) {
    const playerMoves = meetingDiamondHidden(throwState, state);
    const selfDomain = playerMoves || !throwState || !throwState.armed;
    const self = throwState && selfDomain ? throwState.selfSolution : null;
    // Only the self domain owns the ghost here — when the armed throw's diamond is up, the
    // throw path painted it in _updateThrowMark and this mark must leave it alone.
    const hideSelf = () => {
      setStyle(dom.selfEl, 'display', 'none');
      if (selfDomain && dom.ghostSvg) setStyle(dom.ghostSvg, 'display', 'none');
    };
    if (!self) { hideSelf(); return; }
    const target = self.targetId != null ? state.entities.get(self.targetId) : null;
    const targetPos = target && target.pos ? target.pos : self.targetPos;
    if (!targetPos) { hideSelf(); return; }
    const proj = projectWorld(w2s, targetPos.x, targetPos.z);
    const cue = resolveReleaseCue(proj, {
      viewportWidth: viewportExtent('innerWidth', 'clientWidth', 1440),
      viewportHeight: viewportExtent('innerHeight', 'clientHeight', 900),
      kind: 'self',
      onSolution: self.onSolution,
      targetKind: self.targetKind,
    });
    if (!cue.visible) { hideSelf(); return; }
    setStyle(dom.selfEl, 'display', 'block');
    setStyle(dom.selfEl, 'transform', `translate3d(${cue.x}px, ${cue.y - 26}px, 0)`);
    // INF-016: the self-sling cue degrades exactly like the throw diamond.
    const degradedSelf = self.degraded === true;
    setClass(dom.selfEl, 'ml2-hot', !!self.onSolution && !degradedSelf);
    setClass(dom.selfEl, 'ml2-degraded', degradedSelf);
    setClass(dom.selfEl, 'ml2-offscreen', cue.offscreen);
    setCssVar(dom.selfEl, '--ml2-c', rampColor(self.errorRad, self.tolRad, self.onSolution));
    applyCueState(dom.selfEl, dom.selfLabel, cue);
    // The self-sling is a throw whose payload is the player — the same ghost reads the same
    // mirrored fields, from the player's own position rather than the tethered anchor's.
    const selfFrom = state.entities && state.entities.get
      ? state.entities.get(state.playerId) : null;
    this._updateThrowGhost(dom, self, selfFrom && selfFrom.pos, w2s,
      !!self.onSolution && !degradedSelf);
    if (degradedSelf) {
      if (dom.selfLabel && dom.selfLabel.textContent !== 'STALE') dom.selfLabel.textContent = 'STALE';
      setAttr(dom.selfEl, 'aria-label', 'Massline self-sling intercept degraded, target turning');
      setAttr(dom.selfEl, 'data-window-state', 'degraded');
    }
  },

  _updateCloakRing(dom, cloakState, player, w2s) {
    if (!cloakState || !cloakState.active || !(cloakState.radius > 0)) {
      setStyle(dom.ringSvg, 'display', 'none');
      return;
    }
    const center = projectWorld(w2s, player.pos.x, player.pos.z);
    const edge = projectWorld(w2s, player.pos.x + cloakState.radius, player.pos.z);
    if (!center || !Number.isFinite(center.x) || !edge || !Number.isFinite(edge.x)) {
      setStyle(dom.ringSvg, 'display', 'none');
      return;
    }
    const r = Math.max(6, Math.abs(edge.x - center.x));
    setStyle(dom.ringSvg, 'display', 'block');
    setStyle(dom.ringSvg, 'transform', `translate3d(${center.x}px, ${center.y}px, 0)`);
    setAttr(dom.ringCircle, 'r', String(r));
  },

  _updateMeters(dom, ml2, state) {
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
    // INF-014: one bounded line-load cue over the solver-owned strain telemetry. The bar shows
    // current stress; the warn class fires when load is high or climbing fast, with hysteresis
    // so it does not chatter. Read-only: the solver is never written.
    const tether = state && state.player && state.player.tether;
    const telemetry = state && state.player && state.player.masslineTelemetry;
    const active = !!(tether && tether.active && tether.targetId != null);
    const strain = active
      ? (Number.isFinite(tether.strain) ? tether.strain : finite(telemetry && telemetry.strain))
      : 0;
    const now = finite(state && state.simTime);
    const prev = this._lineLoad || null;
    const trend = prev && now > prev.t ? (strain - prev.strain) / Math.max(1e-3, now - prev.t) : 0;
    const warned = resolveLineLoadWarning(strain, trend, !!(prev && prev.warned));
    this._lineLoad = { strain, t: now, warned };
    const showStrain = active && strain > 0.02;
    setStyle(dom.strainPill, 'display', showStrain ? 'flex' : 'none');
    if (showStrain) {
      setStyle(dom.strainFill, 'transform', `scaleX(${clamp01(strain)})`);
      setClass(dom.strainPill, 'ml2-warn', warned);
      setAttr(dom.strainPill, 'aria-label', warned
        ? `Massline line load high and ${trend > 0 ? 'rising' : 'holding'} — ease the turn before it breaks`
        : `Massline line load ${Math.round(clamp01(strain) * 100)} percent`);
    } else if (prev && prev.warned) {
      setClass(dom.strainPill, 'ml2-warn', false);
    }
  },

  // Cadence instrument (Massline Cadence overlay). Pure DOM view over the new preview/window
  // mirror; visible whenever a tether is active — including BEFORE the throw is armed, which is
  // the whole point: the pre-release cue must be readable, not only the armed diamond. Every
  // value it renders is in the HUD signature above, so this runs only on real changes.
  _updateCadenceReadout(state) {
    if (!this._cadenceReadout) return;
    this._cadenceReadout.update(state);
  },

  _hideAll() {
    const dom = this._dom;
    if (!dom) return;
    // Visibility gates are outside the normal signature (there is no player/projection payload to
    // hash there). Forget the last visible signature so re-entering flight repaints a recreated or
    // previously hidden tree even when the underlying values happen to be unchanged.
    clearHudSignature(this.state, 'masslineHud');
    setStyle(dom.throwEl, 'display', 'none');
    if (dom.ghostSvg) setStyle(dom.ghostSvg, 'display', 'none');
    setStyle(dom.selfEl, 'display', 'none');
    setStyle(dom.ringSvg, 'display', 'none');
    this._hideAcquisitionPreview(dom);
    setStyle(dom.btPill, 'display', 'none');
    setStyle(dom.ckPill, 'display', 'none');
    if (dom.strainPill) setStyle(dom.strainPill, 'display', 'none');
    this._lineLoad = null;
    // The panel gates itself on tether.active, not on flight/docked — hide it explicitly here so
    // it never outlives the flight HUD (docked, flag off, dead player).
    if (this._cadenceReadout) this._cadenceReadout.element.hidden = true;
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

    // Release ghost (§22 F1): the predicted arc rides the same fullscreen-SVG pattern as the
    // preview link and sits UNDER the intercept diamond it predicts toward.
    const ghostSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ghostSvg.setAttribute('class', 'ml2-ghost');
    ghostSvg.style.display = 'none';
    ghostSvg.setAttribute('aria-hidden', 'true');
    const ghostPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ghostPath.setAttribute('class', 'ml2-ghost-path');
    ghostSvg.appendChild(ghostPath);
    root.appendChild(ghostSvg);

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
    const strain = makePill('LINE', 'ml2-strain');
    root.appendChild(meters);

    // Cadence instrument slot (mid-left column). The component owns its subtree; this system owns
    // its lifecycle: create here, update in update(), destroy in destroy() and on rebuild below.
    // OPTIONAL by contract (INTEGRATION-NOTES §6): headless partial-DOM stubs (documented above)
    // provide createElement but no ownerDocument/append/querySelector on their nodes — the
    // readout needs a real document, so its absence degrades to "no panel" and never takes the
    // registry step down. The other three surfaces stay fully headless-safe.
    if (this._cadenceReadout) {
      this._cadenceReadout.destroy();
      this._cadenceReadout = null;
    }
    let cadenceReadout = null;
    try {
      const cadenceSlot = document.createElement('div');
      cadenceSlot.className = 'ml2-cadence-slot';
      cadenceReadout = createMasslineCadenceReadout(cadenceSlot);
      root.appendChild(cadenceSlot);
      this._cadenceReadout = cadenceReadout;
    } catch {
      this._cadenceReadout = null;   // no real DOM: the instrument is simply not mounted
    }

    host.appendChild(root);
    this._dom = {
      root, previewEl, previewMark, previewSourceMark, previewSvg, previewLine,
      ghostSvg, ghostPath, ghostD: null,
      throwEl, throwLabel, selfEl, selfLabel, ringSvg, ringCircle,
      btPill: bt.pill, btFill: bt.bar, ckPill: ck.pill, ckFill: ck.bar,
      strainPill: strain.pill, strainFill: strain.bar,
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
  // M3: snare_/bridle_ denial reasons carry their inner cause after the prefix — strip it so a
  // denied remote latch reads with the same words as a denied ordinary latch.
  const r = typeof reason === 'string'
    ? reason.replace(/^(snare|bridle)_/, '')
    : reason;
  if (status === 'protected' || r === 'protected') return 'PROTECTED';
  if (status === 'blocked' || r === 'blocked') return 'LINE BLOCKED';
  if (status === 'out-of-range' || r === 'out-of-range' || r === 'out_of_range') return 'OUT OF RANGE';
  if (status === 'cooldown' || r === 'cooldown') return 'COOLDOWN';
  if (r === 'target-lost' || r === 'endpoint_lost' || r === 'target_lost') return 'ENDPOINT LOST';
  if (r === 'preview-stale' || r === 'preview_stale') return 'REACQUIRE';
  if (r === 'pair_out_of_range') return 'PAIR OUT OF RANGE';
  if (r === 'two_heavy_endpoints') return 'ONE HEAVY ENDPOINT MAX';
  if (r === 'attachment_cycle') return 'WOULD FORM LOOP';
  if (r === 'controller_attachment_limit' || r === 'owner_attachment_limit') return 'CUT ACTIVE LINE';
  // M3: the previously-silent denials. "no words" was the bug — never fall through to nothing.
  if (r === 'no-target' || r === 'no_target') return 'NO TARGET';
  if (r === 'create_failed' || r === 'unknown_attachment_def'
    || r === 'attachment_authority_unavailable' || r === 'authority_unavailable') {
    return 'LINE FAILED';
  }
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
  return Math.max(94, 20 + String(text || '').length * 7.8);
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

// Offscreen acquisition cues ride an ellipse around the reticle, not the screen rectangle. Every
// corner of the flight deck holds an instrument (integrity, speed, power rail, radar), so a
// rectangle clamp parked the cue on top of hardware; the ellipse keeps the side columns and the
// bottom deck clear at every viewport while still pointing the way to the target.
function pinToCueRing(rawX, rawY, viewportWidth, viewportHeight) {
  const cx = viewportWidth / 2;
  const cy = viewportHeight / 2;
  const rx = Math.max(60, cx - Math.max(220, viewportWidth * 0.17));
  const ry = Math.max(60, cy - Math.max(110, viewportHeight * 0.15));
  const dx = finite(rawX) - cx;
  const dy = finite(rawY) - cy;
  const reach = Math.hypot(dx / rx, dy / ry);
  if (!(reach > 0)) return { x: cx, y: cy + ry };
  const scale = reach > 1 ? 1 / reach : 1;
  return { x: cx + dx * scale, y: cy + dy * scale };
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
