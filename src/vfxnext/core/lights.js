// VFX NEXT — bounded event lights.
//
// Dynamic lights are the most expensive thing an effect can ask for and the most likely reason a
// promotion gets rejected: src/render/vfx.js exports EVENT_LIGHT_POOL_SIZE = 6 for the ENTIRE live
// game. This pool defaults to 4 so a VFX NEXT effect can never consume the live budget outright,
// and every family declares its light cost in its brief so an integrator can do the arithmetic
// before wiring anything.
//
// The pool is fixed-allocation: N PointLights are created once, added to the scene once, and never
// removed. "Spawning" a light is re-aiming an existing one. Adding/removing lights from a scene
// forces material recompiles in Three, which is a frame-hitch generator — the exact class of bug
// recorded in the project's hitch history.
//
// FIXED ALLOCATION IS NOT ENOUGH, and an earlier version of this file got it wrong. Never add or
// remove a scene light, AND never toggle `.visible` either. src/render/vfx.js states the contract
// verbatim: "Pool lights stay VISIBLE forever and flash via intensity only. three bakes the visible
// light COUNT into every shader program, so toggling .visible forces a synchronous whole-scene
// shader recompile (measured multi-second stalls on Intel/ANGLE). The count must never change at
// runtime — precompile.js warms shaders against this same count." Visibility toggling mutates the
// same cache key that add/remove does. A dead slot is `intensity = 0`, which contributes no light
// and no recompile.
//
// ACCESSIBILITY. `intensityScale` is the reduced-flash hook, and it must reach the LIGHTS, not only
// the particles. The live owner scales peak at its single light choke point
// (`peak *= accessibility.eventLightPeakScale`). An earlier version of this pool scaled every
// particle substrate and left all four PointLights at full peak — i.e. the brightest, most
// flash-sensitive element in the frame was the one element reduced-flash did not cover.

import * as THREE from 'three';

const FALLOFF_LINEAR = 0;
const FALLOFF_FLASH = 1;

export class LightPool {
  constructor({ capacity = 4 } = {}) {
    this.capacity = capacity;
    this.lights = [];
    this.state = new Float32Array(capacity * 4); // age, life, peak, falloffMode
    this.priority = new Float32Array(capacity);
    this.alive = new Uint8Array(capacity);
    this._cursor = 0;
    this._live = 0;
    // Reduced-flash scale, 1 = unreduced. Applied to peak at spawn AND to the live value each
    // update, so lowering it mid-flight dims lights already in the air rather than only the next one.
    this.intensityScale = 1;
    for (let i = 0; i < capacity; i++) {
      // intensity 0, visible TRUE. See the file header: a dead slot is dark, never hidden.
      const l = new THREE.PointLight(0xffffff, 0, 100, 2);
      l.name = `vfxnext:eventLight${i}`;
      this.lights.push(l);
    }
  }

  /** Reduced-flash control. Mirrors the live owner's `accessibility.eventLightPeakScale`. */
  setIntensityScale(scale) {
    this.intensityScale = Number.isFinite(scale) ? Math.max(0, scale) : 1;
    return this;
  }

  addTo(scene) { for (const l of this.lights) scene.add(l); return this; }

  _claim(priority) {
    let worst = -1, worstP = priority;
    for (let n = 0; n < this.capacity; n++) {
      const i = this._cursor;
      this._cursor = (this._cursor + 1) % this.capacity;
      if (!this.alive[i]) return i;
      if (this.priority[i] < worstP) { worstP = this.priority[i]; worst = i; }
    }
    return worst;
  }

  /** `flash` falloff spikes instantly and decays on a steep curve — a detonation. `linear` holds
   *  then eases — a burning secondary or a sustained plume. Choosing the wrong one is why some
   *  explosions look like a lamp being switched on. */
  spawn({ x, y, z, color = 0xffb060, peak = 40, life = 0.25, distance = 120, priority = 0, falloff = 'flash' }) {
    if (!Number.isFinite(life) || !(life > 0)) return -1;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return -1;
    const i = this._claim(priority);
    if (i < 0) return -1;
    const l = this.lights[i];
    l.position.set(x, y, z);
    l.color.set(color);
    l.distance = distance;
    l.intensity = peak * this.intensityScale;
    const s = i * 4;
    this.state[s] = 0; this.state[s + 1] = life; this.state[s + 2] = peak;
    this.state[s + 3] = falloff === 'linear' ? FALLOFF_LINEAR : FALLOFF_FLASH;
    this.priority[i] = priority;
    this.alive[i] = 1;
    return i;
  }

  update(dt) {
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      const s = i * 4;
      this.state[s] += dt;
      const age = this.state[s] / this.state[s + 1];
      if (age >= 1) {
        this.alive[i] = 0;
        this.lights[i].intensity = 0; // dark, never hidden — see the file header
        continue;
      }
      live++;
      const k = this.state[s + 3] === FALLOFF_FLASH
        ? Math.pow(1 - age, 3.2)
        : (1 - age) * (age < 0.15 ? age / 0.15 : 1);
      this.lights[i].intensity = this.state[s + 2] * k * this.intensityScale;
    }
    this._live = live;
  }

  get live() { return this._live; }

  clear() {
    this.alive.fill(0);
    for (const l of this.lights) l.intensity = 0; // dark, never hidden
    this._live = 0;
  }
}
