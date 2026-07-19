/**
 * Bounded event-light contribution.
 * Contract: beginFrame() → writeMain/writeRcs… → finalize()
 * finalize() recomputes activeCount; writes alone never leave stale counts.
 */

import { sampleCurve } from '../recipes/validate.js';

export class EventLightPool {
  constructor(recipe, opts = {}) {
    this.recipe = recipe;
    this.maxLights = opts.maxLights ?? 8;
    this._allocCount = 0;
    this._frameAllocs = 0;
    this.activeCount = 0;
    this._finalized = true;

    const el = recipe.eventLight || {};
    this.enabled = el.enabled !== false;
    this.maxIntensity = el.maxIntensity ?? 2;
    this.maxRange = el.maxRange ?? 8;
    this.color = [1, 1, 1];
    if (typeof el.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(el.color)) {
      this.color[0] = parseInt(el.color.slice(1, 3), 16) / 255;
      this.color[1] = parseInt(el.color.slice(3, 5), 16) / 255;
      this.color[2] = parseInt(el.color.slice(5, 7), 16) / 255;
    }
    this.throttleScale = el.throttleScale || { at0: 0.15, at1: 1.0, exp: 1.0 };

    this.lights = new Array(this.maxLights);
    for (let i = 0; i < this.maxLights; i++) {
      this.lights[i] = {
        alive: false,
        x: 0,
        y: 0,
        z: 0,
        intensity: 0,
        range: 0,
        r: this.color[0],
        g: this.color[1],
        b: this.color[2],
        kind: i === 0 ? 'main' : 'rcs',
      };
      this._allocCount += 1;
    }

    this._result = {
      activeCount: 0,
      frameAllocations: 0,
      lights: this.lights,
    };
  }

  get allocationCount() {
    return this._allocCount;
  }

  get frameAllocations() {
    return this._frameAllocs;
  }

  /** Begin a frame: clear write marks but keep buffers. */
  beginFrame() {
    this._frameAllocs = 0;
    this._finalized = false;
    for (let i = 0; i < this.maxLights; i++) {
      this.lights[i].alive = false;
      this.lights[i].intensity = 0;
      this.lights[i].range = 0;
    }
    this.activeCount = 0;
    this._result.activeCount = 0;
  }

  reset() {
    this.beginFrame();
    this.finalize();
  }

  writeMain(throttle, nozzle, eventLightScale, boost = 0) {
    if (!this.enabled) return;
    if (this._finalized) this.beginFrame();
    const scale = sampleCurve(this.throttleScale, Math.max(0, throttle));
    const a11y = eventLightScale == null ? 1 : eventLightScale;
    let intensity = this.maxIntensity * scale * a11y * (1 + Math.min(1, boost) * 0.35);
    intensity = Math.min(this.maxIntensity, Math.max(0, intensity));
    const range = this.maxRange * (0.45 + scale * 0.55) * Math.min(1, a11y + 0.25);
    const L = this.lights[0];
    L.alive = intensity > 0.02;
    L.x = nozzle.x;
    L.y = nozzle.y;
    L.z = nozzle.z;
    L.intensity = L.alive ? intensity : 0;
    L.range = L.alive ? Math.min(this.maxRange, range) : 0;
    L.r = this.color[0];
    L.g = this.color[1];
    L.b = this.color[2];
    L.kind = 'main';
  }

  /**
   * Write RCS light into next free slot (1..) or specified index.
   * @returns slot index or -1
   */
  writeRcs(origin, envelope, eventLightScale, slotIndex) {
    if (!this.enabled) return -1;
    if (this._finalized) this.beginFrame();
    let idx = slotIndex;
    if (idx == null || idx < 1) {
      idx = -1;
      for (let i = 1; i < this.maxLights; i++) {
        if (!this.lights[i].alive) {
          idx = i;
          break;
        }
      }
      if (idx < 0) {
        // steal oldest rcs among 1..
        idx = 1;
      }
    }
    if (idx < 1 || idx >= this.maxLights) return -1;
    const a11y = eventLightScale == null ? 1 : eventLightScale;
    const L = this.lights[idx];
    const intensity = Math.min(this.maxIntensity, this.maxIntensity * 0.55 * envelope * a11y);
    L.alive = intensity > 0.02;
    L.x = origin[0];
    L.y = origin[1];
    L.z = origin[2];
    L.intensity = L.alive ? intensity : 0;
    L.range = L.alive ? Math.min(this.maxRange, this.maxRange * 0.4 * (0.5 + envelope * 0.5)) : 0;
    L.r = this.color[0];
    L.g = this.color[1];
    L.b = this.color[2];
    L.kind = 'rcs';
    return idx;
  }

  /** Recompute activeCount and result shell. Idempotent. */
  finalize() {
    let n = 0;
    for (let i = 0; i < this.maxLights; i++) {
      if (this.lights[i].alive && this.lights[i].intensity > 0.02) n += 1;
      else {
        this.lights[i].alive = false;
        this.lights[i].intensity = 0;
      }
    }
    this.activeCount = n;
    this._result.activeCount = n;
    this._result.frameAllocations = this._frameAllocs;
    this._finalized = true;
    return this._result;
  }

  /** Convenience: main-only path. */
  updateMain(throttle, nozzle, eventLightScale, boost = 0) {
    this.beginFrame();
    this.writeMain(throttle, nozzle, eventLightScale, boost);
    return this.finalize();
  }

  /** @deprecated use writeRcs + finalize */
  setRcs(slotIndex, origin, envelope, eventLightScale) {
    if (this._finalized) this.beginFrame();
    return this.writeRcs(origin, envelope, eventLightScale, slotIndex);
  }

  clearRcs() {
    for (let i = 1; i < this.maxLights; i++) {
      this.lights[i].alive = false;
      this.lights[i].intensity = 0;
      this.lights[i].range = 0;
      this.lights[i].kind = 'rcs';
    }
  }

  snapshotActive(outArray) {
    let n = 0;
    for (let i = 0; i < this.maxLights && n < outArray.length; i++) {
      if (this.lights[i].alive) outArray[n++] = i;
    }
    return n;
  }
}
