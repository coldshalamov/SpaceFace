// Gas / smoke / dust — the pooled runtime.
//
// One instanced batch, one material, one atlas, four families. Owns the MATTER and its evolution;
// it never owns an event. Nothing in this directory subscribes to the bus: the impacts lane is the
// sole trigger for contact events and calls emitFromImpact(rec), and src/render/vfx.js drives the
// rest from its own handlers. That is deliberate - two subscribers to one event is two bursts.
//
// Pause, floating origin and idle cost are contract, not polish:
//   * phase advances on the SIM clock delta, so a paused sim freezes the gas even while the
//     display keeps producing frames
//   * bodies live in scene-local space and reproject(dx, dz) follows a floating-origin rebase
//   * an empty pool touches no attribute and uploads nothing

import * as THREE from 'three';
import {
  assertDynamicBufferOwnerWritable,
  commitDynamicBufferOwner,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
  unregisterDynamicBufferOwner,
} from '../../dynamicBufferRanges.js';
import { impactOutwardNormal } from '../impactEventRecord.js';
import { GAS_FAMILIES, GAS_FAMILY_BY_ID, gasFamilyForImpact, gasFilmFor } from './gasFamilies.js';
import {
  createGasVolumeMaterial,
  createGasVolumeTextures,
  releaseGasVolumeTextures,
} from './gasVolumeMaterial.js';

const ATTR_POSE = 0;
const ATTR_SCALE = 1;
const ATTR_TINT = 2;
const ATTR_FILM = 3;
const ATTR_OCCLUDE = 4;

const CAPACITY = GAS_FAMILIES.reduce((sum, family) => sum + family.capacity, 0);
const FAMILY_COUNT = GAS_FAMILIES.length;
const _viewportScratch = new THREE.Vector2();

function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

function dynamicAttribute(capacity, itemSize) {
  const attribute = new THREE.InstancedBufferAttribute(
    new Float32Array(capacity * itemSize), itemSize,
  );
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

class GasVolumeField {
  constructor(scene, options = {}) {
    this.scene = scene;
    this._localize = typeof options.localize === 'function' ? options.localize : null;
    this._localScratch = { x: 0, z: 0 };
    this._normalScratch = { x: 0, y: 0, z: 0 };
    this._textures = createGasVolumeTextures();
    this.material = createGasVolumeMaterial(this._textures);

    // The proxy is a plain box; the vertex shader shrinks it to the frame's occupied bounds.
    // normal/uv are stripped because the march needs neither and they are per-vertex bandwidth.
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.deleteAttribute('normal');
    geometry.deleteAttribute('uv');
    this.geometry = geometry;

    this._pose = dynamicAttribute(CAPACITY, 4);
    this._scaleAttr = dynamicAttribute(CAPACITY, 4);
    this._tint = dynamicAttribute(CAPACITY, 4);
    this._film = dynamicAttribute(CAPACITY, 4);
    this._occlude = dynamicAttribute(CAPACITY, 4);
    geometry.setAttribute('aGasPose', this._pose);
    geometry.setAttribute('aGasScale', this._scaleAttr);
    geometry.setAttribute('aGasTint', this._tint);
    geometry.setAttribute('aGasFilm', this._film);
    geometry.setAttribute('aGasOcclude', this._occlude);

    this.mesh = new THREE.InstancedMesh(geometry, this.material, CAPACITY);
    this.mesh.name = 'SF_VFX_gas_volumes';
    this.mesh.count = 0;
    // A visible count-0 InstancedMesh still reaches setProgram inside a presented pass —
    // the boot brick measured on this field (222ms bloomScene link before the opening warm
    // landed). Stay invisible until the first live emit; renderer.compile() traverses
    // invisible objects, so the opening/restore warm still links the raymarch program
    // off-present.
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    // Under the additive burst layer (sprite buckets are 11) so flashes read on top of the body.
    this.mesh.renderOrder = 10;
    this.mesh.userData.spacefaceVfxGasBatch = true;
    this.mesh.userData.spacefaceStructuredTransient = 'baked-density-film';
    const material = this.material;
    const mesh = this.mesh;
    this.mesh.onBeforeRender = (renderer, _scene, camera) => {
      material.uniforms.uWorldToClip.value.multiplyMatrices(
        camera.projectionMatrix, camera.matrixWorldInverse,
      );
      material.uniforms.uObjectToWorld.value.copy(mesh.matrixWorld);
      if (renderer && typeof renderer.getDrawingBufferSize === 'function') {
        material.uniforms.uViewportHeight.value = renderer.getDrawingBufferSize(_viewportScratch).y;
      }
    };

    this.dynamicBufferOwner = registerDynamicBufferOwner(scene, {
      id: 'combat-gas-volumes',
      mesh: this.mesh,
      attributes: [
        { name: 'pose', attribute: this._pose },
        { name: 'scale', attribute: this._scaleAttr },
        { name: 'tint', attribute: this._tint },
        { name: 'film', attribute: this._film },
        { name: 'occlude', attribute: this._occlude },
      ],
    });
    if (scene && typeof scene.add === 'function') scene.add(this.mesh);

    // Struct of arrays: the update loop must not allocate.
    this._x = new Float32Array(CAPACITY);
    this._y = new Float32Array(CAPACITY);
    this._z = new Float32Array(CAPACITY);
    this._heading = new Float32Array(CAPACITY);
    this._baseScale = new Float32Array(CAPACITY);
    this._aspect = new Float32Array(CAPACITY);
    this._age = new Float32Array(CAPACITY);
    this._life = new Float32Array(CAPACITY);
    this._r = new Float32Array(CAPACITY);
    this._g = new Float32Array(CAPACITY);
    this._b = new Float32Array(CAPACITY);
    this._peak = new Float32Array(CAPACITY);
    this._driftX = new Float32Array(CAPACITY);
    this._driftZ = new Float32Array(CAPACITY);
    this._seed = new Float32Array(CAPACITY);
    this._occX = new Float32Array(CAPACITY);
    this._occY = new Float32Array(CAPACITY);
    this._occZ = new Float32Array(CAPACITY);
    this._occR = new Float32Array(CAPACITY);
    this._familyIndex = new Int32Array(CAPACITY);

    this._active = new Int32Array(CAPACITY);
    this._order = new Int32Array(CAPACITY);
    this._free = new Int32Array(CAPACITY);
    for (let i = 0; i < CAPACITY; i++) this._free[i] = CAPACITY - 1 - i;
    this._freeCount = CAPACITY;
    this._liveCount = 0;
    this._familyLive = new Int32Array(FAMILY_COUNT);
    this._writtenCount = 0;
    this._lastSimTime = null;
    this._emitSerial = 0;
    this._radiance = 1;
    this._motionScale = 1;

    // Cell offsets and frame counts, resolved once.
    this._filmOffset = new Float32Array(FAMILY_COUNT);
    this._filmFrames = new Float32Array(FAMILY_COUNT);
    this._filmKey = new Float32Array(FAMILY_COUNT);
    for (let f = 0; f < FAMILY_COUNT; f++) {
      const film = gasFilmFor(GAS_FAMILIES[f]);
      this._filmOffset[f] = film ? film.cellOffset : 0;
      this._filmFrames[f] = film ? film.frames : 1;
      this._filmKey[f] = GAS_FAMILIES[f].slot + (film && film.loop ? 8 : 0);
    }
  }

  get liveCount() { return this._liveCount; }

  /**
   * registerDynamicBufferOwner returns null for a scene with no coordinator - a bare scene in a
   * test, a probe harness, or any consumer that has not installed one. The ranged-publication path
   * is preferred, but without this fallback the batch would silently never draw.
   */
  _publish(count) {
    // Reveal only with live instances — an empty draw would link the march program cold
    // (the brick this field produced at boot). Compile covers hidden meshes, so the first
    // emit presents an already-warm program.
    this.mesh.visible = count > 0;
    if (this.dynamicBufferOwner) {
      commitDynamicBufferOwner(this.dynamicBufferOwner, count);
      return;
    }
    this.mesh.count = count;
    this._pose.needsUpdate = true;
    this._scaleAttr.needsUpdate = true;
    this._tint.needsUpdate = true;
    this._film.needsUpdate = true;
    this._occlude.needsUpdate = true;
  }

  /**
   * Reduced motion must not freeze a volume - a frozen volume IS the translucent static primitive
   * the standard rejects. It lowers optical energy and lengthens the arc instead.
   */
  setAccessibility(profile) {
    if (!profile) { this._radiance = 1; this._motionScale = 1; return; }
    const flash = Number.isFinite(profile.flashOpacityScale) ? profile.flashOpacityScale : 1;
    this._radiance = Math.max(0.2, flash);
    this._motionScale = profile.id && String(profile.id).includes('motion') ? 0.62 : 1;
  }

  _allocate(familyIndex) {
    const family = GAS_FAMILIES[familyIndex];
    if (this._familyLive[familyIndex] >= family.capacity) return -1;
    if (this._freeCount <= 0) return -1;
    const slot = this._free[--this._freeCount];
    this._active[this._liveCount++] = slot;
    this._familyLive[familyIndex]++;
    this._familyIndex[slot] = familyIndex;
    return slot;
  }

  _retire(cursor) {
    const slot = this._active[cursor];
    this._familyLive[this._familyIndex[slot]]--;
    this._active[cursor] = this._active[--this._liveCount];
    this._free[this._freeCount++] = slot;
  }

  /**
   * Emit one body. `options` is read, never retained.
   * @returns {boolean} false when the family is saturated or the request was degenerate.
   */
  emit(familyId, options) {
    const family = GAS_FAMILY_BY_ID[familyId];
    if (!family || !options) return false;
    const familyIndex = GAS_FAMILIES.indexOf(family);
    const slot = this._allocate(familyIndex);
    if (slot < 0) return false;

    let x = Number.isFinite(options.x) ? options.x : 0;
    let z = Number.isFinite(options.z) ? options.z : 0;
    if (this._localize && options.world !== false) {
      const local = this._localize(x, z, this._localScratch);
      x = local.x; z = local.z;
    }
    const severity = Math.min(1, Math.max(0, Number.isFinite(options.severity) ? options.severity : 1));
    const scale = Math.max(0.35, Number.isFinite(options.scale) ? options.scale : 6);

    this._x[slot] = x;
    this._y[slot] = Number.isFinite(options.y) ? options.y : 0;
    this._z[slot] = z;
    this._heading[slot] = Number.isFinite(options.heading) ? options.heading : 0;
    this._baseScale[slot] = scale;
    this._aspect[slot] = Math.max(0.25, Number.isFinite(options.aspect) ? options.aspect : 1);
    this._age[slot] = 0;
    this._life[slot] = Math.max(0.12, family.life * (0.62 + 0.38 * severity)
      * (Number.isFinite(options.lifeScale) ? options.lifeScale : 1));
    this._r[slot] = Number.isFinite(options.r) ? options.r : 1;
    this._g[slot] = Number.isFinite(options.g) ? options.g : 1;
    this._b[slot] = Number.isFinite(options.b) ? options.b : 1;
    this._peak[slot] = family.opacity * (0.55 + 0.45 * severity)
      * (Number.isFinite(options.opacity) ? options.opacity : 1);
    const drift = family.drift * (0.5 + 0.5 * severity);
    this._driftX[slot] = Number.isFinite(options.driftX) ? options.driftX : Math.cos(this._heading[slot]) * drift;
    this._driftZ[slot] = Number.isFinite(options.driftZ) ? options.driftZ : Math.sin(this._heading[slot]) * drift;
    // Deterministic per-body variation. No ambient randomness: the serial is the only entropy and
    // it is replaced by the caller's own seed whenever there is one.
    this._emitSerial = (this._emitSerial + 1) % 65536;
    const seed = Number.isFinite(options.seed) ? options.seed : (this._emitSerial * 0.6180339887);
    this._seed[slot] = seed - Math.floor(seed);

    let occX = options.occluderX;
    let occZ = options.occluderZ;
    if (this._localize && Number.isFinite(occX) && Number.isFinite(occZ) && options.world !== false) {
      const local = this._localize(occX, occZ, this._localScratch);
      occX = local.x; occZ = local.z;
    }
    this._occX[slot] = Number.isFinite(occX) ? occX : 0;
    this._occY[slot] = Number.isFinite(options.occluderY) ? options.occluderY : 0;
    this._occZ[slot] = Number.isFinite(occZ) ? occZ : 0;
    this._occR[slot] = Number.isFinite(options.occluderRadius) && Number.isFinite(occX)
      ? Math.max(0, options.occluderRadius) : 0;
    return true;
  }

  emitCombustion(options) { return this.emit('combustion', options); }
  emitFractureDust(options) { return this.emit('dust', options); }
  emitVent(options) { return this.emit('vent', options); }
  emitAmbient(options) { return this.emit('ambient', options); }

  /**
   * THE single entry point for contact events. The impacts lane owns the timing and the record;
   * this reads it and emits the matter. Never subscribe to the same simulation event here.
   *
   * @param {object} rec a filled impact record (src/render/combat/impactEventRecord.js)
   * @returns {boolean} true when at least one body was emitted.
   */
  emitFromImpact(rec) {
    if (!rec || !Number.isFinite(rec.x) || !Number.isFinite(rec.y) || !Number.isFinite(rec.z)) {
      return false;
    }
    const severity = Math.min(1, Math.max(0, Number.isFinite(rec.severity) ? rec.severity : 0));
    const family = gasFamilyForImpact(rec.materialId, rec.eventClass, severity);
    if (!family) return false;
    const radius = Math.max(0.5, Number.isFinite(rec.radiusWU) ? rec.radiusWU : 2);
    // A breach radius describes a contact patch; a breakup/detonation radius already describes
    // the whole affected body. Applying contact expansion to that full radius then multiplying
    // by the family's growth again made an 18 WU hull leave a 129 WU opaque gas blanket.
    const wholeBody = rec.eventClass === 'breakup' || rec.eventClass === 'detonation';
    const scale = radius * (wholeBody ? 0.9 + 0.7 * severity : 2.1 + 3.4 * severity);
    const seed = Number.isFinite(rec.serial) ? (rec.serial % 997) / 997 : undefined;
    const outward = impactOutwardNormal(rec, this._normalScratch);

    if (outward) {
      // A signed contact has an outward side: stand the body off the surface along it, point the
      // film's forward axis outward, and park the soft occluder sphere behind the contact so the
      // gas dilutes into the hull face instead of ending on a hard line.
      const standoff = radius * 0.4 + scale * 0.16;
      return this.emit(family.id, {
        x: rec.x + outward.x * standoff,
        y: rec.y + outward.y * standoff,
        z: rec.z + outward.z * standoff,
        heading: Math.atan2(outward.z, outward.x),
        severity,
        scale,
        seed,
        occluderX: rec.x - outward.x * radius * 2.6,
        occluderY: rec.y - outward.y * radius * 2.6,
        occluderZ: rec.z - outward.z * radius * 2.6,
        occluderRadius: radius * 2.6,
      });
    }

    // UNSIGNED axis. The sign of (nx,ny,nz) is a collider-ordering artifact, so no direction may
    // be read off it. Draw symmetric about the axis: two half bodies, opposite headings, and a
    // small occluder centred ON the contact so the fade is radial rather than one-sided.
    const axis = rec.hasNormal
      ? Math.atan2(rec.nz, rec.nx)
      : (Number.isFinite(seed) ? seed * Math.PI * 2 : 0);
    const half = scale * 0.68;
    let emitted = false;
    for (let side = 0; side < 2; side++) {
      const heading = axis + (side === 0 ? 0 : Math.PI);
      const offset = radius * 0.5;
      emitted = this.emit(family.id, {
        x: rec.x + Math.cos(heading) * offset,
        y: rec.y,
        z: rec.z + Math.sin(heading) * offset,
        heading,
        severity: severity * 0.85,
        scale: half,
        seed: seed == null ? undefined : (seed + side * 0.5) % 1,
        occluderX: rec.x,
        occluderY: rec.y,
        occluderZ: rec.z,
        occluderRadius: radius * 0.6,
      }) || emitted;
    }
    return emitted;
  }

  /** Follow a floating-origin rebase. Bodies are stored in scene-local space. */
  reproject(dx, dz) {
    const ox = Number.isFinite(dx) ? dx : 0;
    const oz = Number.isFinite(dz) ? dz : 0;
    if (ox === 0 && oz === 0) return;
    for (let cursor = 0; cursor < this._liveCount; cursor++) {
      const slot = this._active[cursor];
      this._x[slot] += ox; this._z[slot] += oz;
      this._occX[slot] += ox; this._occZ[slot] += oz;
    }
  }

  clear() {
    while (this._liveCount > 0) this._retire(this._liveCount - 1);
    this._lastSimTime = null;
    if (this._writtenCount !== 0) {
      assertDynamicBufferOwnerWritable(this.dynamicBufferOwner);
      this._publish(0);
      this._writtenCount = 0;
    }
  }

  /**
   * @param {number} simTime state.simTime. A paused sim holds this still and the gas holds with it.
   * @returns {number} bodies drawn this frame.
   */
  update(simTime, camera) {
    const now = Number.isFinite(simTime) ? simTime : null;
    let dt = 0;
    if (now != null) {
      if (this._lastSimTime != null) dt = Math.min(0.1, Math.max(0, now - this._lastSimTime));
      this._lastSimTime = now;
    }
    if (this._liveCount === 0) {
      // A sleeping pool costs one branch. It writes no attribute and uploads nothing.
      if (this._writtenCount !== 0) {
        assertDynamicBufferOwnerWritable(this.dynamicBufferOwner);
        this._publish(0);
        this._writtenCount = 0;
      }
      return 0;
    }

    const step = dt * this._motionScale;
    const camX = camera && camera.position ? camera.position.x : 0;
    const camY = camera && camera.position ? camera.position.y : 0;
    const camZ = camera && camera.position ? camera.position.z : 0;

    let cursor = 0;
    let ordered = 0;
    while (cursor < this._liveCount) {
      const slot = this._active[cursor];
      this._age[slot] += step;
      if (this._age[slot] >= this._life[slot]) { this._retire(cursor); continue; }
      this._x[slot] += this._driftX[slot] * step;
      this._z[slot] += this._driftZ[slot] * step;
      const family = GAS_FAMILIES[this._familyIndex[slot]];
      const dx = this._x[slot] - camX;
      const dy = this._y[slot] - camY;
      const dz = this._z[slot] - camZ;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq <= family.drawRangeWu * family.drawRangeWu) this._order[ordered++] = slot;
      cursor++;
    }
    if (ordered === 0) {
      if (this._writtenCount !== 0) {
        assertDynamicBufferOwnerWritable(this.dynamicBufferOwner);
        this._publish(0);
        this._writtenCount = 0;
      }
      return 0;
    }

    // Premultiplied over-blending is order dependent and three.js cannot sort inside one
    // InstancedMesh. Insertion sort far-to-near: allocation free, and the order barely changes
    // between adjacent frames so it is near-linear in practice.
    for (let a = 1; a < ordered; a++) {
      const slot = this._order[a];
      const ax = this._x[slot] - camX, ay = this._y[slot] - camY, az = this._z[slot] - camZ;
      const aDist = ax * ax + ay * ay + az * az;
      let b = a - 1;
      while (b >= 0) {
        const prev = this._order[b];
        const px = this._x[prev] - camX, py = this._y[prev] - camY, pz = this._z[prev] - camZ;
        if (px * px + py * py + pz * pz >= aDist) break;
        this._order[b + 1] = this._order[b];
        b--;
      }
      this._order[b + 1] = slot;
    }

    // Instance data is written in SORTED order, not slot order: the batch draws 0..n-1, so the
    // far-to-near sequence has to be the attribute sequence for premultiplied over-blending to
    // composite correctly. The pool slot stays the CPU identity and never reaches the GPU.
    assertDynamicBufferOwnerWritable(this.dynamicBufferOwner);
    for (let i = 0; i < ordered; i++) {
      const slot = this._order[i];
      const familyIndex = this._familyIndex[slot];
      const family = GAS_FAMILIES[familyIndex];
      const t = Math.min(1, this._age[slot] / this._life[slot]);

      const grow = 1 + (family.growth - 1) * easeOutCubic(Math.min(1, t * 1.25));
      const base = this._baseScale[slot] * grow;
      const lateral = base * (1 + family.spread * t) / Math.sqrt(this._aspect[slot]);
      const along = base * this._aspect[slot];
      // Rise fast, hold, then thin out. Dispersal is carried by growth plus falling opacity, so
      // the body dilutes the way matter does instead of blinking out at full density.
      const rise = Math.min(1, t / family.rise);
      const fade = t <= family.fade ? 1 : 1 - Math.min(1, (t - family.fade) / (1 - family.fade));
      const opacity = this._peak[slot] * rise * fade * fade;
      const phase = family.cycles > 1 ? (t * family.cycles) % 1 : t;

      this._pose.setXYZW(i, this._x[slot], this._y[slot], this._z[slot], this._heading[slot]);
      this._scaleAttr.setXYZW(i, along, lateral, lateral, opacity);
      this._tint.setXYZW(i, this._r[slot], this._g[slot], this._b[slot], phase);
      this._film.setXYZW(i,
        this._filmOffset[familyIndex], this._filmFrames[familyIndex],
        this._filmKey[familyIndex], this._seed[slot]);
      this._occlude.setXYZW(i,
        this._occX[slot], this._occY[slot], this._occZ[slot], this._occR[slot]);
      markDynamicBufferItems(this.dynamicBufferOwner, ATTR_POSE, i);
      markDynamicBufferItems(this.dynamicBufferOwner, ATTR_SCALE, i);
      markDynamicBufferItems(this.dynamicBufferOwner, ATTR_TINT, i);
      markDynamicBufferItems(this.dynamicBufferOwner, ATTR_FILM, i);
      markDynamicBufferItems(this.dynamicBufferOwner, ATTR_OCCLUDE, i);
    }

    this.material.uniforms.uRadiance.value = this._radiance;
    this._publish(ordered);
    this._writtenCount = ordered;
    return ordered;
  }

  diagnostics() {
    return {
      live: this._liveCount,
      drawn: this._writtenCount,
      capacity: CAPACITY,
      families: GAS_FAMILIES.map((family, index) => ({
        id: family.id, live: this._familyLive[index], capacity: family.capacity,
      })),
    };
  }

  dispose() {
    try { unregisterDynamicBufferOwner(this.dynamicBufferOwner); } catch (_) { /* teardown race */ }
    if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh);
    if (this.mesh) this.mesh.onBeforeRender = null;
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    // Refcounted: the GPU copy survives until the last batch (live pool, precompile warm-up) goes.
    if (this._textures) {
      this._textures = null;
      releaseGasVolumeTextures();
    }
  }
}

/**
 * Build the gas subsystem.
 * @param {THREE.Scene} scene the render scene the batch is added to
 * @param {{localize?: (x:number,z:number,out:object)=>{x:number,z:number}}} [options]
 *   `localize` converts world XZ to the renderer's floating-origin frame; omit it in tests.
 */
export function createGasSystem(scene, options = {}) {
  return new GasVolumeField(scene, options);
}

export const GAS_VOLUME_CAPACITY = CAPACITY;
export { GasVolumeField };
