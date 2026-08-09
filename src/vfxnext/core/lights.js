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
    for (let i = 0; i < capacity; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 100, 2);
      l.name = `vfxnext:eventLight${i}`;
      l.visible = false;
      this.lights.push(l);
    }
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
    const i = this._claim(priority);
    if (i < 0) return -1;
    const l = this.lights[i];
    l.position.set(x, y, z);
    l.color.set(color);
    l.distance = distance;
    l.visible = true;
    l.intensity = peak;
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
        this.lights[i].intensity = 0;
        this.lights[i].visible = false;
        continue;
      }
      live++;
      const k = this.state[s + 3] === FALLOFF_FLASH
        ? Math.pow(1 - age, 3.2)
        : (1 - age) * (age < 0.15 ? age / 0.15 : 1);
      this.lights[i].intensity = this.state[s + 2] * k;
    }
    this._live = live;
  }

  get live() { return this._live; }

  clear() {
    this.alive.fill(0);
    for (const l of this.lights) { l.intensity = 0; l.visible = false; }
    this._live = 0;
  }
}
