// Input system: samples keyboard + mouse, projects the cursor to the world plane, and writes
// state.input each tick. Control scheme (Phase 1 flight rework — "arrows fly, mouse aims"):
//   ↑/W  thrust forward along the nose   ↓/S  reverse thrust (weaker)
//   ←→ / A D  YAW the ship's nose left/right (not strafe — the ship banks into the turn)
//   Mouse  independent aim for gimballed weapons + click to fire
//   LMB / Space  fire group 1 (manual)   RMB  mining beam (group 2)   Shift  boost
//   F  toggle auto-fire (handled in weapons; only the toggle edge lives here)
// Flight/combat keys are owned here; UI-owned global keys are handled in src/ui/input.js.
// NOTE: NPC ships NEVER read state.input — they write e.data.intent directly (ai.js), so this
// control remap does not affect them.
export const input = {
  name: 'input',
  init(ctx) {
    this.state = ctx.state;
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

  update(dt, state) {
    const inp = state.input;
    if (state.mode !== 'flight' || state.ui.screenStack.length > 0) {
      // No flight input while docked/modal: zero thrust/turn/fire but keep aim so the reticle rests.
      inp.moveX = 0; inp.moveZ = 0; inp.turnIntent = 0;
      inp.fire = false; inp.boost = false; inp.fireGroup = null;
      return;
    }
    const k = this._keys;

    // --- direction: yaw the nose + throttle forward/reverse along the nose ---
    // Support both WASD and arrow keys. Left/Right & A/D turn the ship (yaw intent), NOT strafe.
    const up = k['KeyW'] || k['ArrowUp'];
    const down = k['KeyS'] || k['ArrowDown'];
    const right = k['KeyD'] || k['ArrowRight'];
    const left = k['KeyA'] || k['ArrowLeft'];

    inp.turnIntent = (right ? 1 : 0) - (left ? 1 : 0);   // +1 = turn clockwise (toward +rot)
    inp.moveZ = (up ? 1 : 0) - (down ? 1 : 0);            // throttle: +1 forward, -1 reverse
    inp.moveX = 0;                                        // no strafe in the new model (kept for AI compat)

    inp.boost = !!(k['ShiftLeft'] || k['ShiftRight']);
    inp.fire = this._m0 || !!k['Space'];
    inp.fireGroup = this._m2 ? 2 : (inp.fire ? 1 : null);

    // Auto-fire toggle (edge-triggered): F flips state.input.autoFire.
    if (k['KeyF']) {
      if (!this._autoFireHeld) {
        inp.autoFire = !inp.autoFire;
        this._autoFireHeld = true;
        this.state.bus.emit('toast', { text: 'Auto-fire ' + (inp.autoFire ? 'ON' : 'OFF'), kind: 'info', ttl: 2 });
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
