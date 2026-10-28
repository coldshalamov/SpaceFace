// One reusable spot map per selected hero source, independently scheduled from the solar map.
// THREE's spot shadow frustum culls casters; existing castShadow/receiveShadow flags remain owned
// by the asset renderer. No global caster flag sweep, six-face point map, or per-frame resize.
import * as THREE from 'three';

const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;

/** Pose caster culling before a scheduled depth pass; a reused map keeps its original matrix. */
export function prepareNocturneShadowCamera(renderer, light, enabled = true) {
  const shadow = light?.shadow;
  if (!enabled || !renderer?.shadowMap?.enabled || !shadow || !(light.intensity > 0)) return null;
  if (shadow.needsUpdate || !shadow.map) {
    light.updateMatrixWorld?.(true);
    light.target?.updateMatrixWorld?.(true);
    shadow.updateMatrices?.(light);
  }
  return shadow.camera || null;
}

export class NocturneShadowBudget {
  constructor(slots, { renderer = null, count = 1, resolution = 512, movingHz = 15, maxUpdatesPerFrame = 1 } = {}) {
    this.renderer = renderer;
    this.movingInterval = 1 / Math.max(1, finite(movingHz, 15));
    this.maxUpdatesPerFrame = Math.max(1, Math.floor(finite(maxUpdatesPerFrame, 1)));
    this.records = [];
    this.updates = 0;
    this.skipped = 0;
    this.requested = false;
    const size = Math.max(128, Math.min(1024, 2 ** Math.round(Math.log2(Math.max(128, finite(resolution, 512))))));
    for (let i = 0; i < slots.length && this.records.length < count; i++) {
      const slot = slots[i];
      if (slot.kind !== 'spot' || !slot.light.shadow) continue;
      const light = slot.light;
      slot.shadow = true;
      light.castShadow = true; // structural, kept stable until disposal
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = true;
      light.shadow.mapSize.set(size, size);
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = Math.max(1, light.distance || 450);
      light.shadow.camera.updateProjectionMatrix();
      light.shadow.bias = -0.00015;
      light.shadow.normalBias = 0.12;
      light.shadow.radius = 1;
      this.records.push({ slot, source: null, position: new THREE.Vector3(Infinity, Infinity, Infinity),
        target: new THREE.Vector3(Infinity, Infinity, Infinity), range: -1, angle: -1, epoch: -1,
        clock: Infinity, valid: false, pending: false });
    }
  }

  get count() { return this.records.length; }
  invalidate() { for (const record of this.records) record.valid = false; }
  setMovingHz(hz) { this.movingInterval = 1 / Math.max(1, finite(hz, 15)); }

  update(dt, { enabled = true, casterEpoch = 0, renderer = this.renderer } = {}) {
    const step = Math.max(0, finite(dt, 0));
    let remaining = this.maxUpdatesPerFrame;
    this.requested = false;
    for (const record of this.records) {
      record.clock += step;
      const { slot } = record;
      const light = slot.light;
      const source = slot.source;
      if (!enabled || !source || light.intensity <= 0) {
        light.shadow.needsUpdate = false;
        // A disabled map must refresh before it can illuminate a different place.
        if (!enabled || !source) record.valid = false;
        continue;
      }
      if (record.pending && light.shadow.needsUpdate) {
        // Draw preparation can run without a submitted frame (loading/admission). Preserve a
        // request until WebGLShadowMap consumes it instead of losing a stationary fixture map.
        if (renderer?.shadowMap) renderer.shadowMap.needsUpdate = true;
        this.requested = true;
        remaining--;
        continue;
      }
      record.pending = false;
      const reassigned = record.source !== source;
      const moved = record.position.distanceToSquared(light.position) > 0.0625
        || record.target.distanceToSquared(light.target.position) > 0.0625;
      const changed = reassigned || !record.valid || record.range !== light.distance
        || record.angle !== light.angle || record.epoch !== casterEpoch;
      const due = changed || ((moved || !source.stationary) && record.clock >= this.movingInterval);
      if (!due || remaining <= 0) {
        light.shadow.needsUpdate = false;
        this.skipped++;
        continue;
      }
      if (record.range !== light.distance) {
        light.shadow.camera.far = Math.max(1, light.distance || 450);
        light.shadow.camera.updateProjectionMatrix();
      }
      light.shadow.needsUpdate = true;
      if (renderer?.shadowMap) renderer.shadowMap.needsUpdate = true;
      record.source = source;
      record.position.copy(light.position);
      record.target.copy(light.target.position);
      record.range = light.distance;
      record.angle = light.angle;
      record.epoch = casterEpoch;
      record.clock = 0;
      record.valid = true;
      record.pending = true;
      this.requested = true;
      this.updates++;
      remaining--;
    }
    return this.requested;
  }

  dispose({ disposeGpu = true } = {}) {
    for (const record of this.records) {
      const shadow = record.slot.light.shadow;
      // A lost context owns no live GPU objects. Even dispatching a dispose event can call
      // stale renderer listeners; detach CPU references without entering those listeners.
      if (disposeGpu) { shadow.map?.dispose(); shadow.mapPass?.dispose(); }
      shadow.map = null;
      shadow.mapPass = null;
      shadow.needsUpdate = false;
      record.source = null;
      record.slot = null;
    }
    this.records.length = 0;
    this.renderer = null;
    this.requested = false;
  }
}
