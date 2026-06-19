// Input system: samples keyboard + mouse, projects the cursor to the world plane, and writes
// state.input each tick. Control scheme (Phase 1 flight rework — "arrows fly, mouse aims"):
//   ↑/W  thrust forward along the nose   ↓/S  reverse thrust (weaker)
//   ←→ / A D  YAW the ship's nose left/right (not strafe — the ship banks into the turn)
//   Q/E  lateral thrusters left/right
//   Mouse  independent aim for gimballed weapons + click to fire
//   LMB / Space  fire group 1 (manual)   RMB  mining beam (group 2)   Shift  boost
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

export const input = {
  name: 'input',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    const keys = (this._keys = Object.create(null));
    this._ndc = { x: 0, y: 0 };
    this._m0 = false; this._m2 = false;

    addEventListener('keydown', (e) => { keys[e.code] = true; });
    addEventListener('keyup', (e) => { keys[e.code] = false; });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; this._m0 = this._m2 = false; });
    addEventListener('mousemove', (e) => {
      this._ndc.x = (e.clientX / innerWidth) * 2 - 1;
      this._ndc.y = -(e.clientY / innerHeight) * 2 + 1;
    });
    addEventListener('mousedown', (e) => { if (e.button === 0) this._m0 = true; if (e.button === 2) this._m2 = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this._m0 = false; if (e.button === 2) this._m2 = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
  },

  // True if any of the bound codes for `action` is currently held.
  _held(state, action) {
    const k = this._keys;
    for (const code of binding(state, action)) if (k[code]) return true;
    return false;
  },

  update(dt, state) {
    const inp = state.input;
    if (state.mode !== 'flight' || state.ui.screenStack.length > 0) {
      // No flight input while docked/modal: zero thrust/turn/fire but keep aim so the reticle rests.
      inp.moveX = 0; inp.moveZ = 0; inp.turnIntent = 0;
      inp.fire = false; inp.boost = false; inp.fireGroup = null;
      return;
    }

    // --- direction: yaw the nose + throttle forward/reverse along the nose (rebindable) ---
    const up = this._held(state, 'forward');
    const down = this._held(state, 'reverse');
    const right = this._held(state, 'yawRight');
    const left = this._held(state, 'yawLeft');
    const strafeRight = this._held(state, 'strafeRight');
    const strafeLeft = this._held(state, 'strafeLeft');

    inp.turnIntent = (right ? 1 : 0) - (left ? 1 : 0);   // +1 = turn clockwise (toward +rot)
    inp.moveZ = (up ? 1 : 0) - (down ? 1 : 0);            // throttle: +1 forward, -1 reverse
    inp.moveX = (strafeRight ? 1 : 0) - (strafeLeft ? 1 : 0); // lateral thrusters: +1 ship-local right

    inp.boost = this._held(state, 'boost');
    // LMB always fires (ergonomic constant); keyboard fire is rebindable.
    inp.fire = this._m0 || this._held(state, 'fire');
    inp.fireGroup = this._m2 ? 2 : (inp.fire ? 1 : null);

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

    // Mouse aim is INDEPENDENT of the nose: weapons gimbal toward the cursor (Phase 2).
    const w = this.helpers.raycastToPlane ? this.helpers.raycastToPlane(this._ndc) : { x: 0, z: 0 };
    inp.aimWorld.x = w.x; inp.aimWorld.z = w.z;
    const p = state.entities.get(state.playerId);
    if (p) inp.aimAngle = Math.atan2(w.z - p.pos.z, w.x - p.pos.x);
    inp.mouseNdc.x = this._ndc.x; inp.mouseNdc.y = this._ndc.y;
  },
};
