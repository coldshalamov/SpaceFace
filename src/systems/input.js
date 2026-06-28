// Input system: samples keyboard + mouse, projects the cursor to the world plane, and writes
// state.input each tick. Control scheme (Phase 1 flight rework — "arrows fly, mouse aims"):
//   ↑/W  thrust forward along the nose   ↓/S  reverse thrust (weaker)
//   ←→ / A D  YAW the ship's nose left/right (not strafe — the ship banks into the turn)
//   Q/E  lateral thrusters left/right
//   Mouse  independent aim for gimballed weapons + click to fire
//   LMB / Space / RT  fire group 1 (manual)   RMB / LT  mining beam (group 2)   Shift / RB  boost
//   X / R3  deploy countermeasure if equipped
//   F  toggle auto-fire (handled in weapons; only the toggle edge lives here)
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

const DEFAULT_BINDINGS = {
  forward:  ['KeyW', 'ArrowUp'],
  reverse:  ['KeyS', 'ArrowDown'],
  yawRight: ['KeyD', 'ArrowRight'],
  yawLeft:  ['KeyA', 'ArrowLeft'],
  strafeLeft:  ['KeyQ'],
  strafeRight: ['KeyE'],
  boost:    ['ShiftLeft', 'ShiftRight'],
  fire:     ['Space'],          // mouse LMB also fires (see update)
  autoFire: ['KeyF'],
  countermeasure: ['KeyX'],    // deploy chaff/ECM (P1-7) — X by default, remappable
  // Mouse buttons (LMB=fire, RMB=group2/mine) are not remappable in this pass — they're ergonomic
  // constants. Keyboard equivalents (Space to fire) ARE remappable.
};

// Resolve the live binding for an action: prefer settings, fall back to defaults. Always returns an
// array of codes (so a missing setting doesn't break input).
function binding(state, action) {
  const cfg = state.settings && state.settings.controls && state.settings.controls.bindings;
  const list = (cfg && cfg[action]) || DEFAULT_BINDINGS[action];
  return Array.isArray(list) ? list : (list ? [list] : []);
}

export const DEFAULTS = { BINDINGS: DEFAULT_BINDINGS };

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
    if (state.mode !== 'flight' || state.ui.screenStack.length > 0 || modalInputActive()) {
      // No flight input while docked/modal: zero thrust/turn/fire but keep aim so the reticle rests.
      inp.moveX = 0; inp.moveZ = 0; inp.turnIntent = 0;
      inp.fire = false; inp.boost = false; inp.brake = false; inp.fireGroup = null;
      this._m0 = false; this._m2 = false;
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

    inp.turnIntent = kbdTurn || gpTurn || tpTurn;
    inp.moveX = kbdMoveX || tpMoveX;
    inp.moveZ = kbdMoveZ || (gpBrake ? -1 : gpMoveZ) || tpMoveZ;
    inp.boost = kbdBoost || gpBoost || tpBoost;
    inp.brake = down || gpBrake || gpMoveZ < -0.55 || tpMoveZ < -0.55;
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
  },
};
