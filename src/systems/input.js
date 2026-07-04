// Input system: samples keyboard + mouse, projects the cursor to the world plane, and writes
// state.input each tick. TWO control schemes (GDD_2_0 §4.1), picked by
// settings.gameplay.controlScheme ('helm-assist' default | 'classic'):
//
//   HELM ASSIST (default) — the ship's NOSE FOLLOWS THE MOUSE CURSOR (rate-limited by the ship's
//   own turn stats, so mass still reads). W/S thrust fwd/rev, A/D lateral strafe, Space =
//   brake-to-stop (computed counter-thrust through the normal thrust pipeline — heavy ships brake
//   heavy). LMB fire. Arrows reel the tether in/out while latched.
//
//   CLASSIC — the 1.x scheme: ↑/W throttle, ←→/A D yaw the nose (bank into turns), Q/E strafe,
//   mouse aims weapons independently, Space fires.
//
//   BOTH schemes: RMB mining beam (group 2) · Shift boost/dash · X countermeasure · F auto-fire
//   G tether latch/cut · Q charge throw (helm) · R detonate charges · C scanner pulse · V cruise.
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
import { wrapAngle } from '../core/rng.js';

// Helm-assist steering: turnIntent saturates at ±1 beyond this much nose-to-cursor error (rad),
// so the ship's own yaw controller (rate caps, banking, class tuning) shapes the actual turn.
const HELM_SOFT_ANGLE = 0.55;
const HELM_DEADBAND = 0.012;   // rad — below this the nose is "on" the cursor; stops micro-jitter
const BRAKE_SOFT_SPEED = 24;   // wu/s — counter-thrust ramps down below this for a smooth settle

// Verb keys shared by both schemes (GDD 2.0 physics verbs + sensors).
const VERB_BINDINGS = {
  tether:         ['KeyG'],   // edge: latch when free, cut when attached
  chargeDetonate: ['KeyR'],   // edge: detonate all armed impulse charges
  scanPulse:      ['KeyC'],   // edge: scanner pulse (8 s cd owned by scanner system)
  cruise:         ['KeyV'],   // edge: toggle cruise charge (cruise system owns state)
};

const DEFAULT_BINDINGS = {   // CLASSIC scheme (1.x) + the new verbs
  forward:  ['KeyW', 'ArrowUp'],
  reverse:  ['KeyS', 'ArrowDown'],
  yawRight: ['KeyD', 'ArrowRight'],
  yawLeft:  ['KeyA', 'ArrowLeft'],
  strafeLeft:  ['KeyQ'],
  strafeRight: ['KeyE'],
  boost:    ['ShiftLeft', 'ShiftRight'],
  fire:     ['Space'],          // mouse LMB also fires (see update)
  brake:    [],                 // classic derives brake from reverse-held (legacy feel)
  autoFire: ['KeyF'],
  countermeasure: ['KeyX'],    // deploy chaff/ECM (P1-7) — X by default, remappable
  chargeThrow: ['KeyY'],       // classic: Q/E are strafe and T is the tech-tree UI key, so throw lives on Y
  reelIn:  [],                 // classic: arrows are movement; reel via helm scheme only
  reelOut: [],
  ...VERB_BINDINGS,
  // Mouse buttons (LMB=fire, RMB=group2/mine) are not remappable in this pass — they're ergonomic
  // constants. Keyboard equivalents (Space to fire) ARE remappable.
};

const HELM_BINDINGS = {      // HELM ASSIST (default): mouse owns the nose
  forward:  ['KeyW'],
  reverse:  ['KeyS'],
  yawRight: [],                // nose follows cursor — yaw keys retired in this scheme
  yawLeft:  [],
  strafeLeft:  ['KeyA'],
  strafeRight: ['KeyD'],
  boost:    ['ShiftLeft', 'ShiftRight'],
  fire:     [],                // LMB only — Space becomes brake
  brake:    ['Space'],
  autoFire: ['KeyF'],
  countermeasure: ['KeyX'],
  chargeThrow: ['KeyQ'],
  reelIn:  ['ArrowUp'],        // arrows are free in helm — they winch the tether
  reelOut: ['ArrowDown'],
  ...VERB_BINDINGS,
};

const SCHEME_BINDINGS = { classic: DEFAULT_BINDINGS, 'helm-assist': HELM_BINDINGS };

// Active control scheme; helm-assist is the 2.0 default (GDD §4.1).
function activeScheme(state) {
  const s = state.settings && state.settings.gameplay && state.settings.gameplay.controlScheme;
  return SCHEME_BINDINGS[s] ? s : 'helm-assist';
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

export const input = {
  name: 'input',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    const keys = (this._keys = Object.create(null));
    this._ndc = { x: 0, y: 0 };
    this._m0 = false; this._m2 = false;
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
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; this._m0 = this._m2 = false; });
    const pointerSurface = this._canvas || window;
    pointerSurface.addEventListener('mousemove', (e) => {
      if (this._canvas && e.target !== this._canvas) return;
      this._ndc.x = (e.clientX / innerWidth) * 2 - 1;
      this._ndc.y = -(e.clientY / innerHeight) * 2 + 1;
      this._lastKbmMs = performance.now();
    });
    pointerSurface.addEventListener('mousedown', (e) => {
      if (this._canvas && e.target !== this._canvas) {
        this._m0 = false; this._m2 = false;
        return;
      }
      if (!this._canvas && isUiCommandTarget(e.target)) {
        this._m0 = false; this._m2 = false;
        return;
      }
      if (e.button === 0) this._m0 = true;
      if (e.button === 2) this._m2 = true;
      this._lastKbmMs = performance.now();
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this._m0 = false; if (e.button === 2) this._m2 = false; });
    pointerSurface.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  // True if any of the bound codes for `action` is currently held.
  _held(state, action) {
    const k = this._keys;
    for (const code of binding(state, action)) if (k[code]) return true;
    return false;
  },

  update(dt, state) {
    const gp = this.gamepad;
    if (gp) gp.tick(dt);
    const tp = this.touch;
    if (tp) tp.tick(dt);

    const inp = state.input;
    // The LOCKED input contract (BUILD_PLAN_2_0 §0): consumer systems read these each tick.
    const acts = inp.actions || (inp.actions = {
      brake: false, cruise: false, tetherFire: false, tetherCut: false, reelDelta: 0,
      chargeThrow: false, chargeDetonate: false, scanPulse: false,
    });
    if (state.mode !== 'flight' || state.ui.screenStack.length > 0 || modalInputActive()) {
      // No flight input while docked/modal: zero thrust/turn/fire but keep aim so the reticle rests.
      inp.moveX = 0; inp.moveZ = 0; inp.turnIntent = 0;
      inp.fire = false; inp.boost = false; inp.brake = false; inp.fireGroup = null;
      acts.brake = false; acts.cruise = false; acts.tetherFire = false; acts.tetherCut = false;
      acts.reelDelta = 0; acts.chargeThrow = false; acts.chargeDetonate = false; acts.scanPulse = false;
      this._m0 = false; this._m2 = false;
      this._edgePrev = this._edgePrev || {};
      return;
    }

    // --- direction: yaw the nose + throttle forward/reverse along the nose (rebindable) ---
    const up = this._held(state, 'forward');
    const down = this._held(state, 'reverse');
    const right = this._held(state, 'yawRight');
    const left = this._held(state, 'yawLeft');
    const strafeRight = this._held(state, 'strafeRight');
    const strafeLeft = this._held(state, 'strafeLeft');

    const kbdTurn = (right ? 1 : 0) - (left ? 1 : 0);
    const kbdMoveZ = (up ? 1 : 0) - (down ? 1 : 0);
    const kbdMoveX = (strafeRight ? 1 : 0) - (strafeLeft ? 1 : 0);
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

    const helm = activeScheme(state) === 'helm-assist';
    inp.turnIntent = kbdTurn || gpTurn || tpTurn;
    inp.moveX = kbdMoveX || tpMoveX;
    inp.moveZ = kbdMoveZ || (gpBrake ? -1 : gpMoveZ) || tpMoveZ;
    inp.boost = kbdBoost || gpBoost || tpBoost;
    inp.brake = helm
      ? (this._held(state, 'brake') || gpBrake)
      : (down || gpBrake || gpMoveZ < -0.55 || tpMoveZ < -0.55);
    inp.fire = kbdFire || gpFire || tpFire;
    inp.fireGroup = (this._m2 || gpMine || tpMine) ? 2 : (inp.fire ? 1 : null);

    // Auto-fire toggle (edge-triggered): F flips state.input.autoFire.
    if (this._held(state, 'autoFire')) {
      if (!this._autoFireHeld) {
        inp.autoFire = !inp.autoFire;
        this._autoFireHeld = true;
        this.bus.emit('toast', { text: 'Auto-fire ' + (inp.autoFire ? 'ON' : 'OFF'), kind: 'info', ttl: 2 });
      }
    } else {
      this._autoFireHeld = false;
    }

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
    }

    // --- LOCKED input contract (BUILD_PLAN_2_0 §0): edge-triggered verb flags ---
    const edges = this._edgePrev || (this._edgePrev = {});
    const edge = (action) => {
      const held = this._held(state, action);
      const was = !!edges[action];
      edges[action] = held;
      return held && !was;
    };
    const tetherEdge = edge('tether');
    acts.tetherFire = tetherEdge;    // tetherGameplay disambiguates by attach state:
    acts.tetherCut = tetherEdge;     // free → latch, attached → cut (single G toggle)
    acts.chargeThrow = edge('chargeThrow');
    acts.chargeDetonate = edge('chargeDetonate');
    acts.scanPulse = edge('scanPulse');
    acts.cruise = edge('cruise');
    // reelIn (ArrowUp) SHORTENS the line (negative rest-length delta pulls you toward the anchor);
    // reelOut (ArrowDown) pays out slack. Positive reelDelta = longer rest length in the tether system.
    acts.reelDelta = (this._held(state, 'reelOut') ? 1 : 0) - (this._held(state, 'reelIn') ? 1 : 0);
    acts.brake = inp.brake;

    // --- Helm Assist steering (GDD §4.1): the nose chases the cursor ---
    // Gamepad/touch players keep stick-yaw even in helm scheme (kbmRecent gates the override).
    if (helm && p && kbmRecent) {
      const err = wrapAngle(inp.aimAngle - p.rot);
      inp.turnIntent = Math.abs(err) < HELM_DEADBAND
        ? 0
        : Math.max(-1, Math.min(1, err / HELM_SOFT_ANGLE));
      // Tether trailing (GDD §4.3): while latched and coasting, hand most attitude authority to
      // the line — the nose-anchored joint torques the hull, so the tail swings outboard and the
      // ship orbits guns-in. Any thrust/brake/boost input restores full helm authority.
      const tether = state.player && state.player.tether;
      const coasting = !inp.moveZ && !inp.moveX && !inp.boost && !inp.brake;
      if (tether && tether.active && coasting) inp.turnIntent *= 0.12;
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
