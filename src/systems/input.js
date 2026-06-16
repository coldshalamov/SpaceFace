// Input system: samples keyboard + mouse, projects the cursor to the world plane, and writes
// state.input each tick (ARCHITECTURE §0.1 control scheme: keyboard move + mouse aim).
// Flight/combat keys are owned here; UI-owned global keys are handled in src/ui/input.js.
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
      inp.moveX = 0; inp.moveZ = 0; inp.fire = false; inp.boost = false; inp.fireGroup = null;
      return;
    }
    const k = this._keys;
    // Support both WASD and arrow keys for movement (arrows now work as requested)
    const up = k['KeyW'] || k['ArrowUp'];
    const down = k['KeyS'] || k['ArrowDown'];
    const right = k['KeyD'] || k['ArrowRight'];
    const left = k['KeyA'] || k['ArrowLeft'];
    inp.moveZ = (up ? 1 : 0) - (down ? 1 : 0);   // forward / reverse
    inp.moveX = (right ? 1 : 0) - (left ? 1 : 0);   // strafe right / left
    inp.boost = !!(k['ShiftLeft'] || k['ShiftRight']);
    inp.fire = this._m0 || !!k['Space'];
    inp.fireGroup = this._m2 ? 2 : (inp.fire ? 1 : null);

    const w = this.helpers.raycastToPlane ? this.helpers.raycastToPlane(this._ndc) : { x: 0, z: 0 };
    inp.aimWorld.x = w.x; inp.aimWorld.z = w.z;
    const p = state.entities.get(state.playerId);
    if (p) inp.aimAngle = Math.atan2(w.z - p.pos.z, w.x - p.pos.x);
    inp.mouseNdc.x = this._ndc.x; inp.mouseNdc.y = this._ndc.y;
  },
};
