// Input system: samples keyboard + mouse, projects the cursor to the world plane, and writes
// state.input each tick. THREE control schemes, picked by settings.gameplay.controlScheme
// ('pilot' default | 'helm-assist' | 'classic'):
//
//   PILOT (default) — KEYBOARD FLIES, MOUSE FIGHTS. The mouse never steers the nose: it aims
//   weapons, picks targets and throws the Massline. W/↑ thrust, S/↓ brakes/reverses.
//   A/D and ←/→ are CONTEXTUAL — one rule: while coasting they YAW the nose (line up a retro
//   burn, whip the nose around mid-drift); while forward thrust is held they STRAFE, with a
//   gentle coordinated carve (PILOT_CARVE_TURN) so W+D still banks into a curve instead of
//   crab-sliding. S/↓ brake restores full yaw authority so you can spin hard without releasing
//   thrust. Q/E strafe explicitly in every state (orbit-adjust during pursuit). LMB fire.
//
//   HELM ASSIST — the ship's NOSE FOLLOWS THE MOUSE CURSOR (rate-limited by the ship's
//   own turn stats, so mass still reads). W thrusts, S/↓ brakes/reverses, A/D lateral strafe.
//   Braking is computed through the normal thrust pipeline — heavy ships brake
//   heavy). LMB fire. Arrows also fly: up/down thrust, left/right strafe while forward thrust is
//   held; left/right arrows yaw the ship when forward thrust is not held so keyboard pilots still
//   have direct nose control.
//
//   CLASSIC — the 1.x scheme: ↑/W throttle, A/D yaw the nose (bank into turns), Q/E strafe,
//   mouse aims weapons independently, LMB fires. The arrow cluster keeps the same flight split:
//   bare ←/→ yaw, W/↑ + ←/→ strafe.
//
//   ALL schemes: RMB mining beam (group 2) · Shift boost/dash · X countermeasure · G pursuit assist
//   toggle (owned by autoTargetAssist — pointer motion adjusts a persistent target-relative slot) ·
//   Space/F Massline (tap latch/cut, hold line control) · Q charge throw (helm) · R detonate
//   charges · C scanner pulse · V cruise.
//   MMB TAP = pursuit/approach toggle: ship target → the same bounded pursuit slot; station/other
//   target → goto autopilot. Any manual movement input releases pursuit within this input tick.
//   New verbs land on state.input.actions.* as edge-triggered flags (the LOCKED input contract in
//   BUILD_PLAN_2_0 §0) — consumer systems (tetherGameplay, impulseCharges, scanner, cruise) read
//   them; input never calls those systems directly.
// Flight/combat keys are owned here; UI-owned global keys are handled in src/ui/input.js.
// NOTE: NPC ships NEVER read state.input — they write e.data.intent directly (ai.js), so this
// control remap does not affect them.
//
// REBINDING (V2 §12): flight actions are resolved through a bindings map keyed by action id. The
// defaults below are mirrored as `settings.controls.bindings` on first run; the Settings/Controls
// tab captures a new key per action and persists it. Input reads state.settings.controls.bindings
// (falling back to DEFAULT_BINDINGS) so changes take effect immediately, no restart needed.

// Action -> default KeyboardEvent.code. A binding may map to MULTIPLE codes (e.g. throttle uses
// both KeyW and ArrowUp) so WASD-and-arrows both work out of the box. The settings layer stores an
// array per action; the UI lets the player set a primary + keeps the arrow-cluster as a secondary
// for movement so arrow-key players aren't stranded.
import { createGamepad } from './gamepad.js';
import { createTouch } from './touch.js';
import { createMasslineInputGrammar } from './masslineInputGrammar.js';
import { adjustPursuitSlot, createPursuitSlot } from '../core/flight/pursuitSlotAssist.js';
import { wrapAngle } from '../core/rng.js';
import { massline2Flag, travelFlag } from '../data/featureFlags.js';
import { TRAVEL_DRIVE_STATES } from '../core/flight/propulsionKernel.js';

// Helm-assist steering: turnIntent saturates at ±1 beyond this much nose-to-cursor error (rad),
// so the ship's own yaw controller (rate caps, banking, class tuning) shapes the actual turn.
const HELM_SOFT_ANGLE = 0.55;
const HELM_DEADBAND = 0.012;   // rad — below this the nose is "on" the cursor; stops micro-jitter
const BRAKE_SOFT_SPEED = 24;   // wu/s — counter-thrust ramps down below this for a smooth settle
const TETHER_ORBIT_SOFT_ANGLE = 0.46;  // latched/coasting: favor guns-in orbit over drift-facing
const PILOT_CARVE_TURN = 0.35; // pilot scheme: fraction of yaw blended in while strafing under
                               // forward thrust — the ship banks and carves instead of crab-sliding

// ---- Travel Burn latch (atlas D5 / W1-5) ------------------------------------------------------
// The kernel is PURE and only ever shapes the governor cap; the state machine, its timers and its
// bindings live here with the input owner (propulsionKernel.js:22-24). `TRAVEL_DRIVE_STATES` is
// imported rather than redeclared so there is exactly one spelling of the axis in the tree.
//
// Spool is a deliberate commitment window, not a loading bar: engaging costs you ~1.6 s during
// which you are still fully manoeuvrable but not yet gaining cap, so committing to a burn in a
// hot sector is a real decision. Cooldown is the price of breaking it.
const TRAVEL_SPOOL_S = 1.6;
const TRAVEL_COOLDOWN_S = 3;
// Below this the pilot is not really "braking" — it keeps a feathered retro-touch from dropping a
// long haul, while a deliberate brake still breaks the latch instantly.
const TRAVEL_BRAKE_BREAK_EPS = 0.08;

function neutralTravelDrive() {
  return {
    // --- kernel-facing contract (propulsionKernel.js normalizeTravelDrive). Extra keys below are
    // ignored by the kernel, so HUD/diagnostic fields can share this one published address.
    state: 'off',
    cap: 0,          // carried ramp state: the kernel advances it, we feed it straight back
    rampMult: 1,     // lane infrastructure (D8) multiplies this; nothing does yet
    // --- latch-owned timers and provenance (never read by the kernel)
    spoolT: 0,
    cooldownT: 0,
    engagedT: 0,
    breakReason: null,
  };
}

/**
 * True when the pilot is actively braking hard enough to break the latch.
 *
 * D5's feel rule is an ASYMMETRY and it is the whole point of the feature: **braking breaks the
 * latch, steering does not.** So this reads the brake actuator and reverse throttle ONLY — it must
 * never consult `turnIntent` or `moveX`. A pilot correcting course, carving, or spinning the nose
 * mid-burn keeps the burn; a pilot who reaches for the brake has decided to stop travelling.
 */
function travelBrakeBreaks(inp) {
  if (!inp) return false;
  if (inp.brake) return true;
  return finiteOr(inp.moveZ, 0) < -TRAVEL_BRAKE_BREAK_EPS;
}

/**
 * Interdiction seam (D5: "Damage or lane disruption forces Cooldown — that is the interdiction
 * hook"). Wired now, triggered by nothing yet: D8's lane prototype and the damage path are the
 * intended writers. Both a level flag and a one-shot request are honoured so a future disruptor
 * can either hold the drive down or knock it out once.
 */
function travelDisrupted(state) {
  const p = state && state.player;
  if (!p) return false;
  const drive = p.travelDrive;
  if (drive && (drive.disrupted === true || drive.disruptRequest === true)) return true;
  return false;
}

function clearTravelDisruptRequest(state) {
  const drive = state && state.player && state.player.travelDrive;
  if (drive && drive.disruptRequest === true) drive.disruptRequest = false;
}

function finiteOr(v, fallback) { return Number.isFinite(v) ? v : fallback; }

/**
 * Advance the travel-drive latch one tick and publish `state.input.travelDrive` for the kernel.
 *
 * THE CARRIED-CAP ROUND TRIP IS THE WHOLE RAMP. The kernel is pure: it consumes `travelDrive.cap`,
 * advances it one step toward the ceiling, and republishes it at `result.telemetry.travelCap`
 * (kernel :324-325, :871). Nobody persists it in between — we read last tick's published value back
 * off the player's flight frame and hand it in again. `input` is first in UPDATE_ORDER and
 * `flightSlot` is later, so "last tick" is exactly right; dropping this feedback would leave the
 * cap pinned at its seed and the drive would do nothing at all.
 *
 * Everything here is gated on `travelFlag('travelBurn')` read at CALL TIME. Under node the flag is
 * false, so not one key is written and the sim goldens cannot see this system.
 */
function stepTravelLatch(host, state, inp, dt) {
  if (!travelFlag('travelBurn')) {
    // Flag off: leave no trace at all, and drop any latch state a flag flip mid-session left behind.
    if (inp.travelDrive) delete inp.travelDrive;
    host._travel = null;
    return;
  }

  const drive = host._travel || (host._travel = neutralTravelDrive());
  const step = Math.max(0, finiteOr(dt, 0));
  const pressed = host._travelEdge;
  const disrupted = travelDisrupted(state);
  const braking = travelBrakeBreaks(inp);

  // Feed the kernel's published ramp back in. Reading the frame the kernel actually wrote (rather
  // than re-deriving a ramp here) keeps ONE owner of the ramp maths — the kernel.
  const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  const frame = player && player._flightFrame;
  if (frame && Number.isFinite(frame.travelCap)) drive.cap = Math.max(0, frame.travelCap);
  if (frame && Number.isFinite(frame.travelCeiling)) drive.ceiling = frame.travelCeiling;

  const toCooldown = (reason) => {
    drive.state = 'cooldown';
    drive.cooldownT = 0;
    drive.engagedT = 0;
    drive.spoolT = 0;
    drive.breakReason = reason;
  };

  switch (drive.state) {
    case 'off':
      if (disrupted) { toCooldown('disrupted'); break; }
      if (pressed) { drive.state = 'spooling'; drive.spoolT = 0; drive.breakReason = null; }
      break;

    case 'spooling':
      // Disruption and braking both kill a spool. A second press is a CANCEL, not a disengage:
      // nothing was earned yet, so it costs no cooldown — the punishment is for breaking a burn.
      if (disrupted) { toCooldown('disrupted'); break; }
      if (braking) { toCooldown('brake'); break; }
      if (pressed) { drive.state = 'off'; drive.spoolT = 0; drive.breakReason = 'cancelled'; break; }
      drive.spoolT += step;
      if (drive.spoolT >= TRAVEL_SPOOL_S) {
        drive.state = 'engaged';
        drive.spoolT = TRAVEL_SPOOL_S;
        drive.engagedT = 0;
        drive.breakReason = null;
      }
      break;

    case 'engaged':
      if (disrupted) { toCooldown('disrupted'); break; }
      if (braking) { toCooldown('brake'); break; }
      if (pressed) { toCooldown('pilot'); break; }
      drive.engagedT += step;
      break;

    case 'cooldown':
    default:
      drive.cooldownT += step;
      // A live disruption holds the drive down rather than letting the timer run out under it.
      if (disrupted) drive.cooldownT = 0;
      else if (drive.cooldownT >= TRAVEL_COOLDOWN_S) {
        drive.state = 'off';
        drive.cooldownT = 0;
        drive.breakReason = null;
      }
      break;
  }

  clearTravelDisruptRequest(state);
  if (!TRAVEL_DRIVE_STATES.includes(drive.state)) drive.state = 'off';

  // One published address, kernel-shaped. Extra keys are ignored by normalizeTravelDrive and are
  // what the HUD reads, so the latch has a single source of truth.
  inp.travelDrive = drive;
}

// Verb keys shared by both schemes (GDD 2.0 physics verbs + sensors).
const VERB_BINDINGS = {
  tether:         ['Space', 'KeyF'], // PQ-003: Space primary, F retained as a permanent alias
  chargeDetonate: ['KeyR'],   // edge: detonate all armed impulse charges
  scanPulse:      ['KeyC'],   // edge: scanner pulse (8 s cd owned by scanner system)
  cruise:         ['KeyV'],   // edge: toggle cruise charge (cruise system owns state)
  autopursuit:    [],         // level mirror for the MMB/G-selected pursuit slot.
  deployBeacon:   ['KeyU'],   // edge: drop a claim beacon in open space (beacons system owns cost/cap).
                              //   The UI router owns U only when a claimable body is in range; in open
                              //   space it falls through to this flight verb (see check-claim-base-input).
  // Massline Physics Identity (Wave M2). Every letter key is spoken for, so the two new verbs sit
  // on the free left-pinky cluster next to WASD; both are rebindable like every other action.
  bulletTime:     ['CapsLock'],   // level: hold for time dilation (bulletTime system owns meter)
  cloak:          ['Backquote'],  // edge: toggle the cloak module (cloak system owns energy/gating)
  // PQ-011/SF-11 deployable anchor Mass Seed. Every letter code is claimed (P alone would collide
  // with the UI pause route), so the verb ships on Digit4: left-hand reachable off WASD, free
  // repo-wide (Digit1-3 are modal-prompt answers only; flight verbs are suppressed under modals),
  // and rebindable like every other flight verb.
  // Edge: launch the seed toward the aim point (massSeed system owns lifecycle/cooldown/cap).
  deployMassSeed: ['Digit4'],
  // PQ-012/SF-12 continuous field tools. Digit5-7 are free repo-wide (checked against both scheme
  // tables and ui/bindings.js, same as Digit4), left-hand reachable off WASD, and rebindable like
  // every flight verb. The fields system owns lifecycle/cooldown/cap for all three.
  deployWell:         ['Digit5'], // edge: deploy an attractive Well at the aim point (PULL)
  deployRepulsor:     ['Digit6'], // edge: drop a Repulsor at the ship (outward SHOVE)
  toggleClearingCone: ['Digit7'], // edge: toggle the ship-attached forward Clearing Cone (snowplow)
  // PQ-013/SF-14 planetary skim collector. Digit8 is free repo-wide (checked against both scheme
  // tables and ui/bindings.js, same audit as Digit4-7) and sits with the deployable family. The
  // planetRuntime system owns the collector state; yield is path x density, never a hold timer.
  toggleSkimCollector: ['Digit8'], // edge: toggle the atmospheric skim collector (The Anvil bands)
  // Travel Burn latch (atlas D5, W1-5). Num Lock is the authored default: it is a genuine latch
  // key on a full keyboard, it is never used for anything else in this game, and it carries a
  // physical indicator light that matches "the drive is engaged". Many laptops have no Num Lock
  // key at all (or bury it behind Fn), so a second code ships in the SAME array — the existing
  // multi-code idiom this table already uses for WASD-and-arrows, not a parallel laptop scheme.
  // KeyH is free repo-wide (checked against both VERB/scheme tables and ui/bindings.js) and sits
  // under the right index finger on the home row, so it is reachable on any chassis.
  travelBurn:     ['NumLock', 'KeyH'],   // edge: toggle the travel drive (latch owns the state machine)
};

const DEFAULT_BINDINGS = {   // CLASSIC scheme (1.x) + the new verbs
  forward:  ['KeyW', 'ArrowUp'],
  reverse:  ['KeyS', 'ArrowDown'],
  yawRight: ['KeyD', 'ArrowRight'],
  yawLeft:  ['KeyA', 'ArrowLeft'],
  strafeLeft:  ['KeyQ'],
  strafeRight: ['KeyE'],
  boost:    ['ShiftLeft', 'ShiftRight'],
  fire:     [],                 // LMB fires; Space is the new-profile Massline action
  brake:    [],                 // classic derives brake from reverse-held (legacy feel)
  autoFire: ['KeyG'],
  countermeasure: ['KeyX'],    // deploy chaff/ECM (P1-7) — X by default, remappable
  chargeThrow: ['KeyY'],       // classic: Q/E are strafe and T is the tech-tree UI key, so throw lives on Y
  reelIn:  [],                 // classic: arrows are movement; reel via helm scheme only
  reelOut: [],
  ...VERB_BINDINGS,
  // Mouse buttons (LMB=fire, RMB=group2/mine) are not remappable in this pass — they're ergonomic
  // constants. Keyboard equivalents (Space to fire) ARE remappable.
};

const HELM_BINDINGS = {      // HELM ASSIST (default): mouse owns the nose
  forward:  ['KeyW', 'ArrowUp'],
  reverse:  ['KeyS', 'ArrowDown'],
  yawRight: [],                // nose follows cursor — yaw keys retired in this scheme
  yawLeft:  [],
  strafeLeft:  ['KeyA', 'ArrowLeft'],
  strafeRight: ['KeyD', 'ArrowRight'],
  boost:    ['ShiftLeft', 'ShiftRight'],
  fire:     [],                // LMB only
  brake:    [],                // S/Down brakes; Space is Massline on new profiles
  autoFire: ['KeyG'],
  countermeasure: ['KeyX'],
  chargeThrow: ['KeyQ'],
  reelIn:  [],
  reelOut: [],
  ...VERB_BINDINGS,
};

const PILOT_BINDINGS = {     // PILOT (default): keyboard flies, mouse fights
  forward:  ['KeyW', 'ArrowUp'],
  reverse:  ['KeyS', 'ArrowDown'],
  yawRight: ['KeyD', 'ArrowRight'],  // contextual: strafe (+carve) while forward thrust is held
  yawLeft:  ['KeyA', 'ArrowLeft'],
  strafeLeft:  ['KeyQ'],             // explicit strafe in every state (pursuit orbit-adjust)
  strafeRight: ['KeyE'],
  boost:    ['ShiftLeft', 'ShiftRight'],
  fire:     [],                      // LMB fires — the mouse is a weapon, not a rudder
  brake:    [],                      // S/Down brakes; Space is Massline on new profiles
  autoFire: ['KeyG'],
  countermeasure: ['KeyX'],
  chargeThrow: ['KeyY'],             // Q/E are strafe here, so throw lives on Y (classic parity)
  reelIn:  [],
  reelOut: [],
  ...VERB_BINDINGS,
};

const SCHEME_BINDINGS = { pilot: PILOT_BINDINGS, classic: DEFAULT_BINDINGS, 'helm-assist': HELM_BINDINGS };

// Active control scheme; pilot is the default — flight physics is the game's toy, and the toy
// is played with the keyboard while the mouse targets/fires/grapples. Helm-assist (mouse-nose)
// remains selectable for players who prefer cursor steering.
function activeScheme(state) {
  const s = state.settings && state.settings.gameplay && state.settings.gameplay.controlScheme;
  return SCHEME_BINDINGS[s] ? s : 'pilot';
}

// Resolve the live binding for an action: player rebinds (settings) win, then the active scheme's
// table, then classic defaults. Always returns an array of codes.
function binding(state, action) {
  const cfg = state.settings && state.settings.controls && state.settings.controls.bindings;
  const scheme = SCHEME_BINDINGS[activeScheme(state)];
  const list = (cfg && cfg[action]) || scheme[action] || DEFAULT_BINDINGS[action];
  return Array.isArray(list) ? list : (list ? [list] : []);
}

export const DEFAULTS = { BINDINGS: DEFAULT_BINDINGS, SCHEMES: SCHEME_BINDINGS };

const KEY_CODE_FALLBACKS = {
  w: 'KeyW',
  a: 'KeyA',
  s: 'KeyS',
  d: 'KeyD',
  q: 'KeyQ',
  e: 'KeyE',
  f: 'KeyF',
  c: 'KeyC',
  x: 'KeyX',
  g: 'KeyG',
  r: 'KeyR',
  v: 'KeyV',
  t: 'KeyT',
  ' ': 'Space',
  space: 'Space',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  shift: 'ShiftLeft',
};

const OPPOSING_ACTIONS = new Map([
  ['forward', 'reverse'],
  ['reverse', 'forward'],
  ['yawRight', 'yawLeft'],
  ['yawLeft', 'yawRight'],
  ['strafeRight', 'strafeLeft'],
  ['strafeLeft', 'strafeRight'],
]);

function eventCode(e) {
  if (e && e.code) return e.code;
  const key = e && typeof e.key === 'string' ? e.key.toLowerCase() : '';
  return KEY_CODE_FALLBACKS[key] || '';
}

function actionForCode(state, code) {
  for (const action of Object.keys(DEFAULT_BINDINGS)) {
    if (binding(state, action).includes(code)) return action;
  }
  return null;
}

function clearActionCodes(state, keys, action, exceptCode) {
  for (const code of binding(state, action)) {
    if (code !== exceptCode) keys[code] = false;
  }
}

function isTextEntryTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [data-text-input]');
}

function isUiCommandTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return !!target.closest('button, [role="button"], a[href], input, textarea, select, [contenteditable="true"], [contenteditable=""], #ui-root, #screens');
}

function modalInputActive() {
  const body = typeof document !== 'undefined' ? document.body : null;
  return !!(body && body.classList && typeof body.classList.contains === 'function'
    && body.classList.contains('ui-modal-open'));
}

function syncPointerScreen(state, x, y) {
  if (!state || !state.input || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const pointerScreen = state.input.pointerScreen || (state.input.pointerScreen = { x: 0, y: 0, active: false });
  pointerScreen.x = x;
  pointerScreen.y = y;
  pointerScreen.active = true;
}

function viewportSize() {
  return {
    width: typeof innerWidth === 'number' ? Math.max(1, innerWidth) : 1,
    height: typeof innerHeight === 'number' ? Math.max(1, innerHeight) : 1,
  };
}

function centeredPointer() {
  const { width, height } = viewportSize();
  return {
    width,
    height,
    cx: width * 0.5,
    cy: height * 0.5,
  };
}

export const input = {
  name: 'input',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    const keys = (this._keys = Object.create(null));
    this._ndc = { x: 0, y: 0 };
    this._lastPursuitPointerDelta = null;
    const viewportW = typeof innerWidth === 'number' ? innerWidth : 0;
    const viewportH = typeof innerHeight === 'number' ? innerHeight : 0;
    this._screen = { x: Math.floor(viewportW * 0.5), y: Math.floor(viewportH * 0.5), active: false };
    this._m0 = false; this._m1 = false; this._m2 = false;
    this._masslineGrammar = createMasslineInputGrammar();
    this._lastKbmMs = performance.now();
    this._canvas = (typeof document !== 'undefined') ? document.getElementById('gl-canvas') : null;

    this.gamepad = createGamepad(ctx);
    ctx.gamepad = this.gamepad;

    // Touch layer (P1-12): virtual dual-stick + buttons for touchscreens. Auto-detects on touch
    // devices; the overlay is built lazily. Merged below alongside gamepad so gameplay is unchanged.
    this.touch = createTouch(ctx);
    ctx.touch = this.touch;
    this.touch.autoDetect();
    // Re-evaluate on resize (phone rotate / tablet dock) unless the player set an explicit choice.
    addEventListener('resize', () => this.touch.autoDetect());

    addEventListener('keydown', (e) => {
      const code = eventCode(e);
      if (!code) return;
      if (modalInputActive() || isTextEntryTarget(e.target) || isUiCommandTarget(e.target)) {
        keys[code] = false;
        return;
      }
      const action = actionForCode(this.state, code);
      const opposingAction = action && OPPOSING_ACTIONS.get(action);
      if (opposingAction) clearActionCodes(this.state, keys, opposingAction, code);
      keys[code] = true;
      this._lastKbmMs = performance.now();
    });
    addEventListener('keyup', (e) => {
      const code = eventCode(e);
      if (code) keys[code] = false;
    });
    addEventListener('blur', () => {
      for (const k in keys) keys[k] = false;
      this._m0 = this._m1 = this._m2 = false;
      this._lastPursuitPointerDelta = null;
      const slot = this.state && this.state.input && this.state.input.pursuitSlot;
      if (slot && slot.active) {
        this.state.input.pursuitSlot = {
          ...slot,
          active: false,
          reason: 'focus-lost',
          releasedTick: this.state.tick,
        };
      }
      this._masslineGrammar.reset();
    });
    const pointerSurface = this._canvas || window;
    const handlePointerMove = (e) => {
      if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
      const geometry = centeredPointer();
      const inp = this.state && this.state.input;
      const movementX = Number.isFinite(e.movementX) ? e.movementX : 0;
      const movementY = Number.isFinite(e.movementY) ? e.movementY : 0;
      // Primary-pointer movement also emits a compatibility mousemove with the same timestamp and
      // coordinates. Keep both listeners for aim reachability and standalone mouse events, while
      // suppressing only that paired duplicate from the pursuit station.
      const lastPointerDelta = this._lastPursuitPointerDelta;
      const duplicatePursuitPointerDelta = e.type === 'mousemove'
        && !!lastPointerDelta
        && e.timeStamp === lastPointerDelta.timeStamp
        && movementX === lastPointerDelta.movementX
        && movementY === lastPointerDelta.movementY;
      if (e.type === 'pointermove') {
        this._lastPursuitPointerDelta = {
          timeStamp: e.timeStamp,
          movementX,
          movementY,
        };
      }
      if (!duplicatePursuitPointerDelta && inp && inp.pursuitSlot && inp.pursuitSlot.active
        && (movementX !== 0 || movementY !== 0)) {
        // The ordinary pointer remains weapon aim. Its relative deltas also nudge the selected
        // target-frame station; no pointer lock, sampled world path, or persistent turn command.
        inp.pursuitSlot = adjustPursuitSlot(inp.pursuitSlot, { movementX, movementY });
      }
      this._screen.x = e.clientX;
      this._screen.y = e.clientY;
      this._screen.active = true;
      this._ndc.x = (this._screen.x / geometry.width) * 2 - 1;
      this._ndc.y = -(this._screen.y / geometry.height) * 2 + 1;
      syncPointerScreen(this.state, this._screen.x, this._screen.y);
      this._lastKbmMs = performance.now();
    };
    // Capture pointer truth before overlays can consume the event. Electron focus/activation can
    // otherwise leave the software cursor at its fallback center until a later unhandled move.
    addEventListener('mousemove', handlePointerMove, { capture: true });
    addEventListener('pointermove', handlePointerMove, { capture: true });
    pointerSurface.addEventListener('mousedown', (e) => {
      handlePointerMove(e);
      if (this._canvas && e.target !== this._canvas) {
        this._m0 = false; this._m1 = false; this._m2 = false;
        return;
      }
      if (!this._canvas && isUiCommandTarget(e.target)) {
        this._m0 = false; this._m1 = false; this._m2 = false;
        return;
      }
      if (e.button === 0) this._m0 = true;
      if (e.button === 1) this._m1 = true;
      if (e.button === 2) this._m2 = true;
      this._lastKbmMs = performance.now();
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this._m0 = false; if (e.button === 1) this._m1 = false; if (e.button === 2) this._m2 = false; });
    pointerSurface.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  // True if any of the bound codes for `action` is currently held.
  _held(state, action) {
    const k = this._keys;
    for (const code of binding(state, action)) if (k[code]) return true;
    return false;
  },

  _heldExcept(state, action, exceptCode) {
    const k = this._keys;
    for (const code of binding(state, action)) if (code !== exceptCode && k[code]) return true;
    return false;
  },

  update(dt, state) {
    const gp = this.gamepad;
    if (gp) gp.tick(dt);
    const tp = this.touch;
    if (tp) tp.tick(dt);

    const inp = state.input;
    inp.autoFire = false;
    // The LOCKED input contract (BUILD_PLAN_2_0 §0): consumer systems read these each tick.
    const acts = inp.actions || (inp.actions = {
      brake: false, cruise: false, tetherFire: false, tetherCut: false, reelDelta: 0,
      chargeThrow: false, chargeDetonate: false, scanPulse: false, autopursuit: false, deployBeacon: false,
      bulletTime: false, cloakToggle: false, throwArm: false, travelBurn: false, deployMassSeed: false,
      deployWell: false, deployRepulsor: false, toggleClearingCone: false, toggleSkimCollector: false,
    });
    const masslineGrammar = this._masslineGrammar || (this._masslineGrammar = createMasslineInputGrammar());
    if (state.mode !== 'flight' || state.ui.screenStack.length > 0 || modalInputActive()) {
      // No flight input while docked/modal: zero thrust/turn/fire but keep aim so the reticle rests.
      inp.moveX = 0; inp.moveZ = 0; inp.turnIntent = 0;
      inp.fire = false; inp.boost = false; inp.brake = false; inp.fireGroup = null;
      acts.brake = false; acts.cruise = false; acts.tetherFire = false; acts.tetherCut = false;
      acts.reelDelta = 0; acts.chargeThrow = false; acts.chargeDetonate = false; acts.scanPulse = false; acts.autopursuit = false;
      acts.deployBeacon = false;
      acts.bulletTime = false; acts.cloakToggle = false; acts.throwArm = false; acts.travelBurn = false;
      acts.deployMassSeed = false;
      acts.deployWell = false; acts.deployRepulsor = false; acts.toggleClearingCone = false;
      acts.toggleSkimCollector = false;
      const masslineHeldThroughModal = this._held(state, 'tether')
        || !!(gp && gp.isConnected() && gp.actions.massline && gp.actions.massline.held);
      acts.massline = masslineGrammar.reset(masslineHeldThroughModal);
      inp.tetherMode = null;
      if (inp.pursuitSlot && inp.pursuitSlot.active) {
        inp.pursuitSlot = {
          ...inp.pursuitSlot,
          active: false,
          reason: 'controls-blocked',
          releasedTick: state.tick,
        };
      }
      this._m0 = false; this._m1 = false; this._m2 = false;
      this._prevM1 = false;
      this._edgePrev = this._edgePrev || {};
      // Docking or opening a menu drops the travel drive, exactly like pursuit: you cannot be
      // hand-flying a burn from a station screen. Reset outright rather than into cooldown — the
      // pilot did not break the latch, the game mode changed underneath it.
      this._travelEdge = false;
      if (this._travel) this._travel = neutralTravelDrive();
      if (inp.travelDrive) inp.travelDrive = this._travel || undefined;
      return;
    }

    // --- direction: yaw the nose + throttle forward/reverse along the nose (rebindable) ---
    const scheme = activeScheme(state);
    const helm = scheme === 'helm-assist';
    const pilot = scheme === 'pilot';
    const up = this._held(state, 'forward');
    const down = this._held(state, 'reverse');
    const kbdBrakeHeld = this._held(state, 'brake');
    let kbdTurn = 0;
    let kbdMoveX = 0;
    let kbdLineOrbit = 0;
    if (pilot) {
      // PILOT: one rule. Coasting → side keys YAW the nose (line up retro burns, spin
      // mid-drift). Forward thrust held → side keys STRAFE, blended with a gentle carve yaw
      // so W+D banks into a curve. Brake restores coasting yaw so W+Space+A/D spins fast.
      // Q/E strafe explicitly in every state.
      const side = (this._held(state, 'yawRight') ? 1 : 0) - (this._held(state, 'yawLeft') ? 1 : 0);
      kbdLineOrbit = side;
      const explicit = (this._held(state, 'strafeRight') ? 1 : 0) - (this._held(state, 'strafeLeft') ? 1 : 0);
      if (up && !kbdBrakeHeld) {
        kbdMoveX = Math.max(-1, Math.min(1, side + explicit));
        kbdTurn = side * PILOT_CARVE_TURN;
      } else {
        kbdTurn = side;
        kbdMoveX = explicit;
      }
    } else {
      const arrowLeftHeld = !!this._keys.ArrowLeft;
      const arrowRightHeld = !!this._keys.ArrowRight;
      const arrowYaw = !up && (arrowLeftHeld || arrowRightHeld);
      const arrowStrafe = up;
      const right = helm
        ? (arrowYaw && arrowRightHeld)
        : (this._heldExcept(state, 'yawRight', 'ArrowRight') || (arrowYaw && arrowRightHeld));
      const left = helm
        ? (arrowYaw && arrowLeftHeld)
        : (this._heldExcept(state, 'yawLeft', 'ArrowLeft') || (arrowYaw && arrowLeftHeld));
      const strafeRight = helm
        ? (this._heldExcept(state, 'strafeRight', 'ArrowRight') || (arrowStrafe && arrowRightHeld))
        : (this._held(state, 'strafeRight') || (arrowStrafe && arrowRightHeld));
      const strafeLeft = helm
        ? (this._heldExcept(state, 'strafeLeft', 'ArrowLeft') || (arrowStrafe && arrowLeftHeld))
        : (this._held(state, 'strafeLeft') || (arrowStrafe && arrowLeftHeld));
      const arrowTurn = arrowYaw
        ? ((arrowRightHeld ? 1 : 0) - (arrowLeftHeld ? 1 : 0))
        : 0;
      kbdTurn = arrowTurn || ((right ? 1 : 0) - (left ? 1 : 0));
      kbdLineOrbit = kbdTurn;
      kbdMoveX = (strafeRight ? 1 : 0) - (strafeLeft ? 1 : 0);
    }
    const kbdMoveZ = (up ? 1 : 0) - (down ? 1 : 0);
    const kbdBoost = this._held(state, 'boost');
    const kbdFire = this._m0 || this._held(state, 'fire');

    // --- gamepad merge (left stick = yaw/throttle, right stick = aim, RT/LT/RB fire/mine/boost) ---
    let gpTurn = 0;
    let gpMoveZ = 0;
    let gpBoost = false;
    let gpFire = false;
    let gpMine = false;
    let gpBrake = false;
    let gpCountermeasure = false;
    let gpAimActive = false;
    if (gp && gp.isConnected()) {
      gpTurn = gp.axes.leftX;
      gpMoveZ = -gp.axes.leftY; // stick up = forward
      gpBoost = gp.actions.boost && gp.actions.boost.held;
      gpFire = gp.actions.fire && gp.actions.fire.held;
      gpMine = gp.actions.mine && gp.actions.mine.held;
      gpBrake = gp.actions.brake && gp.actions.brake.held;
      gpCountermeasure = gp.actions.countermeasure && gp.actions.countermeasure.held;
      gpAimActive = Math.abs(gp.axes.rightX) > 0.001 || Math.abs(gp.axes.rightY) > 0.001;
    }

    // --- touch merge (P1-12): virtual dual-stick. Left stick = yaw/throttle (same as gamepad),
    //     right stick = aim, on-screen buttons = fire/mine/boost. A touch modality is the most
    //     deliberate input (a thumb on a stick), so when touch is active it wins over kbm/gp. ---
    let tpTurn = 0, tpMoveZ = 0, tpMoveX = 0;
    let tpBoost = false, tpFire = false, tpMine = false;
    let tpAimActive = false;
    const touchActive = !!(tp && tp.isConnected());
    if (touchActive) {
      tpTurn = tp.axes.leftX;
      tpMoveZ = -tp.axes.leftY;
      tpBoost = tp.actions.boost && tp.actions.boost.held;
      tpFire = tp.actions.fire && tp.actions.fire.held;
      tpMine = tp.actions.mine && tp.actions.mine.held;
      tpAimActive = Math.abs(tp.axes.rightX) > 0.001 || Math.abs(tp.axes.rightY) > 0.001;
    }

    // Keyboard/mouse is authoritative when both are active (whichever moved last wins for aim).
    const kbmRecent = this._lastKbmMs >= (gp ? gp.lastActiveMs : 0) && this._lastKbmMs >= (tp ? tp.lastActiveMs : 0);

    inp.turnIntent = kbdTurn || gpTurn || tpTurn;
    inp.moveX = kbdMoveX || tpMoveX;
    inp.moveZ = kbdMoveZ || (gpBrake ? -1 : gpMoveZ) || tpMoveZ;
    inp.boost = kbdBoost || gpBoost || tpBoost;
    inp.brake = (helm || pilot)
      ? (down || this._held(state, 'brake') || gpBrake)
      : (down || gpBrake || gpMoveZ < -0.55 || tpMoveZ < -0.55);
    inp.fire = kbdFire || gpFire || tpFire;
    // Massline throw-arm (§3.3, flag massline2.throw): while latched to a throwable payload
    // (hostile ship/drone, fracture chunk, cargo mass), RMB is throwArm — mining yields and
    // masslineThrow owns the solution/auto-cut. While latched to a mineable asteroid or wreck,
    // RMB stays the mining beam so tether station-keeping works for extraction (the designed
    // dance partner; see mining.activeMineableTetherTarget). Unlatched play is unchanged.
    const mineHeld = !!(this._m2 || gpMine || tpMine);
    const tetherLatched = !!(state.player && state.player.tether && state.player.tether.active);
    const throwArmHeld = massline2Flag('throw') && tetherLatched && mineHeld
      && isThrowArmPayload(state);
    inp.fireGroup = (mineHeld && !throwArmHeld) ? 2 : (inp.fire ? 1 : null);

    // Countermeasure deploy (P1-7): edge-triggered flag consumed by systems/countermeasures.js.
    // We set a flag (not deploy directly) so the countermeasures system owns the cooldown/equip
    // logic + AI auto-deploy in one place.
    if (this._held(state, 'countermeasure') || gpCountermeasure) {
      if (!this._cmHeld) { inp.deployCountermeasure = true; this._cmHeld = true; }
    } else {
      this._cmHeld = false;
    }

    const p = state.entities.get(state.playerId);
    const gpOrTouchAim = gpAimActive || tpAimActive;
    const aimAxes = tpAimActive ? tp.axes : (gpAimActive ? gp.axes : null);
    if (aimAxes && !kbmRecent && p) {
      // Right-stick / right-touch aim is independent of the ship nose, like the mouse.
      const ax = aimAxes.rightX;
      const ay = -aimAxes.rightY; // world +Z is "up" on the stick
      const angle = Math.atan2(ay, ax);
      const dist = 300;
      inp.aimAngle = angle;
      inp.aimWorld.x = p.pos.x + Math.cos(angle) * dist;
      inp.aimWorld.z = p.pos.z + Math.sin(angle) * dist;
      inp.mouseNdc.x = ax;
      inp.mouseNdc.y = ay;
    } else {
      // Mouse aim is INDEPENDENT of the nose: weapons gimbal toward the cursor (Phase 2).
      const w = this.helpers.raycastToPlane ? this.helpers.raycastToPlane(this._ndc) : { x: 0, z: 0 };
      inp.aimWorld.x = w.x; inp.aimWorld.z = w.z;
      if (p) inp.aimAngle = Math.atan2(w.z - p.pos.z, w.x - p.pos.x);
      inp.mouseNdc.x = this._ndc.x; inp.mouseNdc.y = this._ndc.y;
      const pointerScreen = inp.pointerScreen || (inp.pointerScreen = { x: 0, y: 0, active: false });
      pointerScreen.x = this._screen.x;
      pointerScreen.y = this._screen.y;
      pointerScreen.active = this._screen.active;
    }

    // --- Pursuit-slot selection / approach toggle (MMB tap or bound key) ---------------------
    // MMB and G select the same target-relative station. MMB keeps its non-ship GOTO behavior;
    // the retired fixed-tail autopursuit/path follower has no fallback here. The slot may coexist
    // with a Massline attachment, while any deliberate movement key releases it this tick.
    const pursuitKeyHeld = this._held(state, 'autopursuit');
    const pursuitPressed = (this._m1 && !this._prevM1) || (pursuitKeyHeld && !this._prevPursuitKey);
    this._prevM1 = this._m1;
    this._prevPursuitKey = pursuitKeyHeld;

    const lockId = state.player ? state.player.targetId : null;
    const lockEnt = (lockId != null && state.entities && typeof state.entities.get === 'function')
      ? state.entities.get(lockId) : null;
    const lockAlive = !!(lockEnt && lockEnt.alive !== false && lockEnt.pos);
    const lockIsShip = lockAlive && (lockEnt.type === 'ship' || lockEnt.type === 'drone');
    const cruiseState = state.player && state.player.cruise;
    const cruiseBusy = !!(cruiseState && (cruiseState.phase === 'charging' || cruiseState.phase === 'cruising'));
    const manualPursuitOverride = Math.abs(inp.turnIntent) > 0.08
      || Math.abs(inp.moveZ) > 0.08
      || Math.abs(inp.moveX) > 0.08
      || inp.brake
      || inp.boost;
    let pursuitSlot = inp.pursuitSlot;
    if (pursuitSlot && pursuitSlot.active) {
      const targetLost = !lockIsShip || lockEnt.id !== pursuitSlot.targetId;
      if (manualPursuitOverride || targetLost || cruiseBusy) {
        const reason = manualPursuitOverride ? 'manual-override' : targetLost ? 'target-lost' : 'cruise';
        pursuitSlot = inp.pursuitSlot = { ...pursuitSlot, active: false, reason, releasedTick: state.tick };
        this.bus.emit('toast', {
          text: targetLost && !manualPursuitOverride ? 'Pursuit target lost' : 'Pursuit assist released',
          kind: 'info',
          ttl: 2,
        });
      }
    }

    // Manual input wins even when MMB lands in the same fixed tick: do not briefly re-arm a slot
    // after the release path above has already observed deliberate pilot authority.
    if (pursuitPressed && !manualPursuitOverride) {
      if (pursuitSlot && pursuitSlot.active) {
        pursuitSlot = inp.pursuitSlot = {
          ...pursuitSlot,
          active: false,
          reason: 'toggled-off',
          releasedTick: state.tick,
        };
        this.bus.emit('toast', { text: 'Pursuit assist OFF', kind: 'info', ttl: 2 });
      } else if (lockIsShip && !cruiseBusy) {
        pursuitSlot = inp.pursuitSlot = createPursuitSlot({ host: p, target: lockEnt, source: 'mmb' });
        this.bus.emit('toast', {
          text: 'Pursuit assist: ' + entityLabel(lockEnt) + ' · movement keys release',
          kind: 'good',
          ttl: 3,
        });
      } else if (lockAlive) {
        this.bus.emit('ui:setCourse', {
          pos: { x: lockEnt.pos.x, z: lockEnt.pos.z },
          targetEntityId: lockEnt.id,
          label: entityLabel(lockEnt),
          arrivalRadius: Math.max(36, (lockEnt.radius || 0) + 30),
          autopilot: true,
        });
        this.bus.emit('toast', { text: 'Autopilot: ' + entityLabel(lockEnt), kind: 'info', ttl: 2 });
      } else {
        this.bus.emit('toast', { text: 'No target — select one to pursue', kind: 'info', ttl: 2 });
      }
    }

    // G is owned by autoTargetAssist, which toggles this same slot immediately after input.

    // --- LOCKED input contract (BUILD_PLAN_2_0 §0): edge-triggered verb flags ---
    const edges = this._edgePrev || (this._edgePrev = {});
    const edge = (action) => {
      const held = this._held(state, action);
      const was = !!edges[action];
      edges[action] = held;
      return held && !was;
    };
    const tetherHeld = this._held(state, 'tether');
    const gpMassline = gp && gp.isConnected() && gp.actions.massline;
    const gpMasslineAllowed = !(state.ui && state.ui.dockInRange);
    const gpMasslineHeld = !!(gpMasslineAllowed && gpMassline && gpMassline.held);
    const masslineHeld = tetherHeld || gpMasslineHeld;
    const tetherActive = !!(state.player && state.player.tether && state.player.tether.active);
    const dedicatedLineLength = (this._held(state, 'reelOut') ? 1 : 0) - (this._held(state, 'reelIn') ? 1 : 0);
    const rawLineLength = dedicatedLineLength || -inp.moveZ;
    const rawOrbitDirection = kbdLineOrbit || gpTurn || tpTurn;
    const masslineCommand = (!tetherHeld && gpMassline && gpMassline.held && !gpMasslineAllowed)
      ? masslineGrammar.reset(true)
      : masslineGrammar.step(dt, {
        attached: tetherActive,
        held: masslineHeld,
        lineLength: rawLineLength,
        orbitDirection: rawOrbitDirection,
        pump: inp.boost,
        source: tetherHeld ? 'keyboard' : (gpMasslineHeld ? 'gamepad' : null),
      });
    const nearestTetherMode = !!(this._keys.ControlLeft || this._keys.ControlRight);
    acts.massline = masslineCommand;
    acts.tetherFire = masslineCommand.latch;
    acts.tetherCut = masslineCommand.cut;
    inp.tetherMode = masslineCommand.latch && nearestTetherMode ? 'nearest' : null;
    acts.chargeThrow = edge('chargeThrow');
    acts.chargeDetonate = edge('chargeDetonate');
    acts.scanPulse = edge('scanPulse');
    acts.cruise = edge('cruise');
    acts.autopursuit = !!(inp.pursuitSlot && inp.pursuitSlot.active);
    acts.deployBeacon = edge('deployBeacon');
    // PQ-011 anchor Mass Seed: ordinary edge verb (Digit4 default, rebindable like every flight verb).
    acts.deployMassSeed = edge('deployMassSeed');
    // PQ-012 field tools: three ordinary edge verbs (Digit5-7 default, rebindable like every flight verb).
    acts.deployWell = edge('deployWell');
    acts.deployRepulsor = edge('deployRepulsor');
    acts.toggleClearingCone = edge('toggleClearingCone');
    // PQ-013 skim collector: ordinary edge verb (Digit8 default, rebindable like every flight verb).
    acts.toggleSkimCollector = edge('toggleSkimCollector');
    // Massline Wave M2 verbs. bulletTime is a LEVEL (hold-to-dilate; the system owns the meter and
    // may refuse when empty); cloakToggle is an edge; throwArm was resolved above where the mining
    // beam routing is decided (single owner for the RMB arbitration).
    acts.bulletTime = this._held(state, 'bulletTime');
    acts.cloakToggle = edge('cloak');
    acts.throwArm = throwArmHeld;
    // Travel Burn latch (D5/W1-5). Edge-triggered toggle; the state machine below owns what a
    // press MEANS in each state (arm a spool, cancel a spool, disengage a burn).
    const travelPressed = edge('travelBurn') || !!(gp && gp.isConnected() && gp.actions.travelBurn && gp.actions.travelBurn.pressed);
    this._travelEdge = travelPressed;
    acts.travelBurn = travelPressed;
    // Positive reelDelta lengthens the authoritative line; line-control uses ship-local axes.
    acts.reelDelta = masslineCommand.lineControl ? masslineCommand.lineLength : dedicatedLineLength;
    if (masslineCommand.lineControl) {
      // Line-control axes are ship-local commands, not simultaneous flight commands. Releasing the
      // Massline action restores manual flight on the next fixed tick; weapon aim/fire stay free.
      inp.moveX = 0;
      inp.moveZ = 0;
      inp.turnIntent = 0;
      inp.boost = false;
      inp.brake = false;
    }
    acts.brake = inp.brake;
    // Run after Massline arbitration so line-control axes cannot also masquerade as manual braking.
    stepTravelLatch(this, state, inp, dt);

    // --- Helm Assist steering (GDD §4.1): the nose chases the cursor unless direct yaw is held.
    // Gamepad/touch players keep stick-yaw even in helm scheme (kbmRecent gates the override).
    if (helm && p && kbmRecent && this._screen.active && !masslineCommand.lineControl) {
      const manualYaw = Math.abs(inp.turnIntent) > 0.001;
      // Tether trailing (GDD §4.3): while latched and loaded, hand most attitude authority to
      // the line — the nose-anchored joint torques the hull, so the tail swings outboard and the
      // ship orbits guns-in. Direct yaw input still wins so keyboard pilots can deliberately spin.
      const tetherAngle = manualYaw ? null : tetherFacingAngle(p, state, state.player && state.player.tether);
      if (tetherAngle != null) {
        const tetherErr = wrapAngle(tetherAngle - p.rot);
        inp.turnIntent = Math.max(-1, Math.min(1, tetherErr / TETHER_ORBIT_SOFT_ANGLE));
      } else if (!manualYaw) {
        const err = wrapAngle(inp.aimAngle - p.rot);
        inp.turnIntent = Math.abs(err) < HELM_DEADBAND
          ? 0
          : Math.max(-1, Math.min(1, err / HELM_SOFT_ANGLE));
      }
      if (inp.brake) {
        // Brake-to-stop: decompose the counter-velocity direction into the SAME ship axes
        // stepTranslation uses (forward = cos/sin rot, right = -sin/cos rot) and feed it through
        // the normal thrust pipeline — so braking respects per-class accel and reads as mass.
        const speed = Math.hypot(p.vel.x, p.vel.z);
        if (speed > 0.5) {
          const nx = -p.vel.x / speed, nz = -p.vel.z / speed;
          const cf = Math.cos(p.rot), sf = Math.sin(p.rot);
          const k = Math.min(1, Math.max(0.4, speed / BRAKE_SOFT_SPEED));
          inp.moveZ = (nx * cf + nz * sf) * k;
          inp.moveX = (nx * -sf + nz * cf) * k;
        } else {
          inp.moveZ = 0; inp.moveX = 0;
        }
      }
    }
  },
};

function entityLabel(e) {
  return (e && (e.name || (e.data && e.data.name))) || (e && e.type) || 'target';
}

/**
 * True when the active tether payload should steal RMB for throwArm.
 * Ships/drones = combat throw (case D). Fracture chunks / tow payloads = throw-mass (case C).
 * Parent asteroids and wrecks keep RMB as the mining/salvage beam so latched extraction works.
 */
function isThrowArmPayload(state) {
  const tether = state && state.player && state.player.tether;
  if (!tether || !tether.active || tether.targetId == null) return false;
  const target = state.entities && state.entities.get && state.entities.get(tether.targetId);
  if (!target || target.alive === false) return false;
  if (target.type === 'ship' || target.type === 'drone') return true;
  if (target.type === 'asteroid' && target.data && target.data.isChunk) return true;
  if (target.type === 'payload') return true;
  return false;
}

function tetherFacingAngle(player, state, tether) {
  if (!player || !state || !tether || !tether.active || tether.targetId == null) return null;
  const phase = String(tether.phase || 'slack');
  if (phase === 'slack') return null;
  const target = state.entities && state.entities.get && state.entities.get(tether.targetId);
  if (!target || target.alive === false || !target.pos || !player.pos) return null;
  return Math.atan2(target.pos.z - player.pos.z, target.pos.x - player.pos.x);
}
