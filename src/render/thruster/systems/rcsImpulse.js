/**
 * RCS impulse system — short directional jets, structurally distinct from main plume.
 * Preallocated slots; fire/update never allocate after init.
 */

import { sampleImpulseEnvelope } from './throttleResponse.js';
import {
  compileAccessibilityTables,
  createPresentationScratch,
  resolveAccessibilityPresentationInto,
} from './accessibility.js';
// resolveAccessibilityPresentationInto used by sampleRadiance
import {
  createFlowFlipbookMaterial,
  setMaterialUniforms,
  LAYER_ROLE_PACK,
  computeLayerRadiance,
  bindEnvelopeFromRecipe,
} from '../materials/flowFlipbookMaterial.js';
import {
  createSegmentedPlumeGeometry,
  resolveSegmentCount,
  segmentedVertexCount,
  segmentedIndexCount,
} from '../geometry/segmentedPlumeGeometry.js';
import { EventLightPool } from './eventLight.js';
import {
  assertDynamicBufferOwnerWritable,
  commitDynamicBufferOwner,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
  replaceDynamicBufferAttribute,
  unregisterDynamicBufferOwner,
} from '../../dynamicBufferRanges.js';

const RCS_QUALITY_TIERS = ['high', 'medium', 'low'];
const RCS_DYNAMIC_ATTRIBUTE_KEYS = ['instOffset', 'instAxis', 'instParams', 'instDynamics', 'instColor'];

function hexToRgb(hex, out) {
  if (typeof hex === 'string' && hex.length >= 7) {
    out[0] = parseInt(hex.slice(1, 3), 16) / 255;
    out[1] = parseInt(hex.slice(3, 5), 16) / 255;
    out[2] = parseInt(hex.slice(5, 7), 16) / 255;
  } else {
    out[0] = 0.9;
    out[1] = 0.95;
    out[2] = 1.0;
  }
}

export class RcsImpulsePool {
  constructor(recipe, opts = {}) {
    this.recipe = recipe;
    this.maxImpulses = opts.maxImpulses ?? 16;
    this.maxLayers = opts.maxLayers ?? 4;
    this.capacity = this.maxImpulses * this.maxLayers;
    this._allocCount = 0;
    this._frameAllocs = 0;
    this.activeImpulseCount = 0;
    this.activeSlotCount = 0;

    this._a11yTables = compileAccessibilityTables(recipe);
    this._presentation = createPresentationScratch(8);
    this._emptyA11y = {
      reducedMotion: false,
      reducedFlash: false,
      lowQuality: false,
      qualityTier: 'high',
    };
    this._timing = {
      attack: recipe.timing.attack,
      sustain: recipe.timing.sustain,
      release: recipe.timing.release,
    };
    this._totalLife =
      (recipe.timing.attack || 0) + (recipe.timing.sustain || 0) + (recipe.timing.release || 0);

    // Compiled layers
    this._layerRole = new Array(this.maxLayers);
    this._layerEnabled = new Uint8Array(this.maxLayers);
    this._layerIntensity = new Float32Array(this.maxLayers);
    this._layerOpacity = new Float32Array(this.maxLayers);
    this._layerSoftEdge = new Float32Array(this.maxLayers);
    this._layerWidthScale = new Float32Array(this.maxLayers);
    this._layerLengthScale = new Float32Array(this.maxLayers);
    this._layerScroll = new Float32Array(this.maxLayers);
    this._layerColor = new Float32Array(this.maxLayers * 3);
    this._layerTextureId = new Array(this.maxLayers);
    this._layerBlend = new Array(this.maxLayers);
    this._layerCount = 0;
    const layers = recipe.layers || [];
    for (let i = 0; i < layers.length && this._layerCount < this.maxLayers; i++) {
      const L = layers[i];
      const idx = this._layerCount++;
      this._layerRole[idx] = L.role;
      this._layerEnabled[idx] = L.enabled === false ? 0 : 1;
      this._layerIntensity[idx] = L.intensity ?? 1;
      this._layerOpacity[idx] = L.opacity ?? 0.5;
      this._layerSoftEdge[idx] = L.softEdge ?? 0.3;
      this._layerWidthScale[idx] = L.widthScale ?? 1;
      this._layerLengthScale[idx] = L.lengthScale ?? 1;
      this._layerScroll[idx] = L.scrollSpeed ?? 1;
      const c = [0, 0, 0];
      hexToRgb(L.colorHex, c);
      this._layerColor[idx * 3] = c[0];
      this._layerColor[idx * 3 + 1] = c[1];
      this._layerColor[idx * 3 + 2] = c[2];
      this._layerTextureId[idx] = L.texture?.id || null;
      this._layerBlend[idx] = L.blend || 'additive';
      this._allocCount += 1;
    }

    this.impulses = new Array(this.maxImpulses);
    for (let i = 0; i < this.maxImpulses; i++) {
      this.impulses[i] = {
        alive: false,
        age: 0,
        strength: 1,
        origin: [0, 0, 0],
        axis: [0, 0, 1],
      };
      this._allocCount += 1;
    }

    this.slots = new Array(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      this.slots[i] = {
        alive: false,
        impulseIndex: -1,
        layerIndex: 0,
        layerRole: 'core',
        offset: [0, 0, 0],
        axis: [0, 0, 1],
        length: 0.5,
        width: 0.25,
        envelope: 0,
        phase: (i % 13) * 0.05,
        color: [0.9, 0.95, 1.0],
        intensity: 1,
      };
      this._allocCount += 1;
    }

    this._result = {
      activeImpulseCount: 0,
      activeSlotCount: 0,
      frameAllocations: 0,
      roles: this._presentation.roles,
      roleCount: 0,
      presentation: this._presentation,
    };
  }

  get allocationCount() {
    return this._allocCount;
  }

  beginFrame() {
    this._frameAllocs = 0;
  }

  get frameAllocations() {
    return this._frameAllocs;
  }

  fire(origin, axis, strength = 1) {
    for (let i = 0; i < this.maxImpulses; i++) {
      const imp = this.impulses[i];
      if (!imp.alive) {
        imp.alive = true;
        imp.age = 0;
        imp.strength = strength;
        imp.origin[0] = origin[0];
        imp.origin[1] = origin[1];
        imp.origin[2] = origin[2];
        const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
        imp.axis[0] = axis[0] / len;
        imp.axis[1] = axis[1] / len;
        imp.axis[2] = axis[2] / len;
        return i;
      }
    }
    let oldest = 0;
    let oldestAge = -1;
    for (let i = 0; i < this.maxImpulses; i++) {
      if (this.impulses[i].age > oldestAge) {
        oldestAge = this.impulses[i].age;
        oldest = i;
      }
    }
    const imp = this.impulses[oldest];
    imp.alive = true;
    imp.age = 0;
    imp.strength = strength;
    imp.origin[0] = origin[0];
    imp.origin[1] = origin[1];
    imp.origin[2] = origin[2];
    const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    imp.axis[0] = axis[0] / len;
    imp.axis[1] = axis[1] / len;
    imp.axis[2] = axis[2] / len;
    return oldest;
  }

  _findLayerIndex(role) {
    for (let i = 0; i < this._layerCount; i++) {
      if (this._layerRole[i] === role) return i;
    }
    return -1;
  }

  update(dt, a11y) {
    this.beginFrame();
    if (this.recipe.kind !== 'impulse_burst') {
      throw new Error('RcsImpulsePool requires kind=impulse_burst recipe');
    }
    const flags = a11y || this._emptyA11y;
    resolveAccessibilityPresentationInto(
      this.recipe,
      flags,
      this._presentation,
      this._a11yTables,
    );

    let aliveImp = 0;
    for (let i = 0; i < this.maxImpulses; i++) {
      const imp = this.impulses[i];
      if (!imp.alive) continue;
      imp.age += dt;
      if (imp.age > this._totalLife) {
        imp.alive = false;
        continue;
      }
      aliveImp += 1;
    }
    this.activeImpulseCount = aliveImp;

    const geo = this.recipe.geometry;
    this.activeSlotCount = 0;
    for (let i = 0; i < this.maxImpulses; i++) {
      const imp = this.impulses[i];
      if (!imp.alive) continue;
      let env = sampleImpulseEnvelope(imp.age, this._timing);
      if (flags.reducedMotion && this.recipe.accessibility?.reducedMotion?.holdMs) {
        const hold = this.recipe.accessibility.reducedMotion.holdMs / 1000;
        if (imp.age < hold) env = Math.max(env, 0.64);
      }
      env *= imp.strength;
      if (env <= 0.001) continue;

      for (let r = 0; r < this._presentation.roleCount; r++) {
        const role = this._presentation.roles[r];
        const li = this._findLayerIndex(role);
        if (li < 0 || !this._layerEnabled[li]) continue;
        if (this.activeSlotCount >= this.capacity) break;
        const slot = this.slots[this.activeSlotCount++];
        slot.alive = true;
        slot.impulseIndex = i;
        slot.layerIndex = li;
        slot.layerRole = role;
        slot.offset[0] = imp.origin[0];
        slot.offset[1] = imp.origin[1];
        slot.offset[2] = imp.origin[2];
        slot.axis[0] = imp.axis[0];
        slot.axis[1] = imp.axis[1];
        slot.axis[2] = imp.axis[2];
        const motionProfile = this.recipe.accessibility?.reducedMotion;
        const reducedLength = flags.reducedMotion ? (motionProfile?.roleLengthScale?.[role] ?? 1) : 1;
        const reducedWidth = flags.reducedMotion ? (motionProfile?.roleWidthScale?.[role] ?? 1) : 1;
        slot.length = geo.baseLength * this._layerLengthScale[li] * (0.55 + env * 0.7) * reducedLength;
        slot.width = geo.baseWidth * this._layerWidthScale[li] * (0.7 + env * 0.45) * reducedWidth;
        // Accessibility intensity belongs to the material uniform. Keeping envelope geometric
        // prevents reduced flash from being applied a second time through vThrottle.
        slot.envelope = env;
        slot.intensity = this._layerIntensity[li] * this._presentation.intensityScale * env;
        slot.color[0] = this._layerColor[li * 3];
        slot.color[1] = this._layerColor[li * 3 + 1];
        slot.color[2] = this._layerColor[li * 3 + 2];
      }
    }
    for (let i = this.activeSlotCount; i < this.capacity; i++) {
      this.slots[i].alive = false;
    }

    this._result.activeImpulseCount = this.activeImpulseCount;
    this._result.activeSlotCount = this.activeSlotCount;
    this._result.frameAllocations = this._frameAllocs;
    this._result.roles = this._presentation.roles;
    this._result.roleCount = this._presentation.roleCount;
    this._result.presentation = this._presentation;
    return this._result;
  }
}

export function assertRcsStructurallyDistinct(mainRecipe, rcsRecipe) {
  const failures = [];
  if (rcsRecipe.kind !== 'impulse_burst') failures.push('RCS kind must be impulse_burst');
  if (mainRecipe.kind !== 'continuous_plume') failures.push('main kind must be continuous_plume');
  const mainLife = mainRecipe.timing.attack + mainRecipe.timing.sustain + mainRecipe.timing.release;
  const rcsLife = rcsRecipe.timing.attack + rcsRecipe.timing.sustain + rcsRecipe.timing.release;
  if (rcsLife > 0.55) failures.push('RCS total life > 0.55s');
  if (
    rcsRecipe.geometry.aspect === mainRecipe.geometry.aspect &&
    rcsRecipe.geometry.baseLength / rcsRecipe.geometry.baseWidth >
      (mainRecipe.geometry.baseLength / mainRecipe.geometry.baseWidth) * 0.85
  ) {
    failures.push('RCS aspect ratio too similar to main stream (miniature engine risk)');
  }
  if (rcsRecipe.throttle.idle > 0.02) failures.push('RCS must not hold continuous idle');
  if (rcsRecipe.geometry.baseLength >= mainRecipe.geometry.baseLength * 0.45) {
    failures.push('RCS baseLength too close to main plume length');
  }
  if (rcsRecipe.identity?.timingCharacter?.oneShot !== true) {
    failures.push('RCS timingCharacter.oneShot must be true');
  }
  const sameColors =
    rcsRecipe.layers[0]?.colorHex === mainRecipe.layers[0]?.colorHex &&
    rcsRecipe.layers[1]?.colorHex === mainRecipe.layers[1]?.colorHex;
  if (sameColors && rcsRecipe.geometry.aspect === mainRecipe.geometry.aspect) {
    failures.push('RCS differs only by tint/same aspect — insufficient identity separation');
  }
  return { ok: failures.length === 0, failures, rcsLife, mainLife };
}

export class RcsImpulseSystem {
  constructor(THREE, recipe, opts = {}) {
    this.THREE = THREE;
    this.recipe = recipe;
    this.pool = new RcsImpulsePool(recipe, {
      maxImpulses: opts.maxImpulses ?? 16,
      maxLayers: opts.maxLayers ?? 4,
    });
    this.eventLights = new EventLightPool(recipe, { maxLights: opts.maxEventLights ?? 8 });
    this.group = null;
    this.layerBatches = null;
    this._time = 0;
    this._a11y = opts.a11y || this.pool._emptyA11y;
    this._textures = opts.textures || {};
    this._disposed = false;
    this._qualityTier = 'high';
    if (THREE) {
      this._initThree(THREE, opts);
      if (opts.scene) this.bindDynamicBuffers(opts.scene);
    }
  }

  getActiveGeometryStats() {
    if (!this.layerBatches || !this.layerBatches.length) {
      return { segments: 0, vertexCount: 0, indexCount: 0, tier: this._qualityTier };
    }
    const geo = this.layerBatches[0].mesh && this.layerBatches[0].mesh.geometry;
    const segments = geo?.userData?.plumeSegments
      ?? resolveSegmentCount(this.recipe, this._qualityTier);
    return {
      segments,
      vertexCount: geo?.userData?.plumeVertexCount ?? segmentedVertexCount(segments),
      indexCount: geo?.userData?.plumeIndexCount ?? segmentedIndexCount(segments),
      tier: this._qualityTier,
    };
  }

  setQualityTier(tier) {
    const t = tier === 'medium' || tier === 'low' ? tier : 'high';
    if (t === this._qualityTier || !this.layerBatches) {
      this._qualityTier = t;
      return this._qualityTier;
    }
    this._qualityTier = t;
    for (let i = 0; i < this.layerBatches.length; i++) {
      const batch = this.layerBatches[i];
      const tb = batch.tierBuffers && batch.tierBuffers[t];
      if (!tb) continue;
      if (batch.dynamicBufferOwner) {
        for (let bindingIndex = 0; bindingIndex < RCS_DYNAMIC_ATTRIBUTE_KEYS.length; bindingIndex++) {
          const key = RCS_DYNAMIC_ATTRIBUTE_KEYS[bindingIndex];
          replaceDynamicBufferAttribute(
            batch.dynamicBufferOwner,
            bindingIndex,
            tb.attrs[key],
            `rcs-quality-tier:${t}`,
          );
        }
      }
      batch.mesh.geometry = tb.geo;
      batch.offset = tb.offset;
      batch.axisScale = tb.axisScale;
      batch.params = tb.params;
      batch.dynamics = tb.dynamics;
      batch.color = tb.color;
      batch.attrs = tb.attrs;
      if (batch.dynamicBufferOwner) commitDynamicBufferOwner(batch.dynamicBufferOwner, 0);
      else batch.mesh.count = 0;
      batch.writeCount = 0;
    }
    return this._qualityTier;
  }

  _initThree(THREE, opts) {
    const materialFactory = opts.materialFactory || createFlowFlipbookMaterial;
    this.group = new THREE.Group();
    this.group.name = `rcs-system:${this.recipe.id}`;
    this.group.userData.rcsImpulse = true;
    this.layerBatches = [];
    const idn = this.recipe.identity.flowCharacter;
    const capacity = this.pool.maxImpulses;
    const initialTier = opts.qualityTier === 'medium' || opts.qualityTier === 'low'
      ? opts.qualityTier
      : 'high';
    this._qualityTier = initialTier;

    for (let li = 0; li < this.pool._layerCount; li++) {
      const role = this.pool._layerRole[li];
      const texId = this.pool._layerTextureId[li];
      const map = (texId && this._textures[texId]) || this._textures.default || null;
      const baseIntensity = this.pool._layerIntensity[li];
      const mat = materialFactory(THREE, {
        name: `rcs:${this.recipe.id}:${role}`,
        role,
        textureId: texId,
        map,
        blend: this.pool._layerBlend[li],
        softEdge: this.pool._layerSoftEdge[li],
        intensity: baseIntensity,
        opacity: this.pool._layerOpacity[li],
        flowSpeed: idn.baseFlow,
        noiseScale: idn.noiseScale,
        swirl: idn.swirl,
        fork: idn.fork,
        useFlipbook: false,
        impulseJet: true,
        coreWhitenessCap: this.recipe.accessibility?.reducedFlash?.coreWhitenessCap ?? 0.35,
        layerRole: LAYER_ROLE_PACK[role] ?? 0,
        minProjectedWidth: role === 'core' ? 0.08 : 0.095,
      });
      if (mat && typeof mat.then === 'function') {
        throw new TypeError('RCS materialFactory returned a Promise');
      }
      bindEnvelopeFromRecipe(mat, this.recipe);

      const tierBuffers = Object.create(null);
      for (let ti = 0; ti < RCS_QUALITY_TIERS.length; ti++) {
        const tier = RCS_QUALITY_TIERS[ti];
        const segs = resolveSegmentCount(this.recipe, tier);
        const geo = createSegmentedPlumeGeometry(THREE, segs);
        const offset = new Float32Array(capacity * 3);
        const axisScale = new Float32Array(capacity * 4);
        const params = new Float32Array(capacity * 4);
        const dynamics = new Float32Array(capacity * 4);
        const color = new Float32Array(capacity * 3);
        const instOffset = new THREE.InstancedBufferAttribute(offset, 3);
        const instAxis = new THREE.InstancedBufferAttribute(axisScale, 4);
        const instParams = new THREE.InstancedBufferAttribute(params, 4);
        const instDynamics = new THREE.InstancedBufferAttribute(dynamics, 4);
        const instColor = new THREE.InstancedBufferAttribute(color, 3);
        geo.setAttribute('instanceOffset', instOffset);
        geo.setAttribute('instanceAxisScale', instAxis);
        geo.setAttribute('instanceParams', instParams);
        geo.setAttribute('instanceDynamics', instDynamics);
        geo.setAttribute('instanceColor', instColor);
        tierBuffers[tier] = {
          geo, offset, axisScale, params, dynamics, color,
          attrs: { instOffset, instAxis, instParams, instDynamics, instColor },
          segments: segs,
        };
      }
      const active = tierBuffers[initialTier];
      const mesh = new THREE.InstancedMesh(active.geo, mat, capacity);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.name = `rcs-layer:${role}`;
      mesh.renderOrder = 30 + li;
      this.group.add(mesh);

      const uScratch = {
        time: 0,
        flowSpeed: idn.baseFlow,
        reducedMotion: false,
        reducedFlash: false,
        intensity: baseIntensity,
        opacity: this.pool._layerOpacity[li],
        softEdge: this.pool._layerSoftEdge[li],
      };

      this.layerBatches.push({
        role,
        layerIndex: li,
        mesh,
        material: mat,
        baseIntensity,
        offset: active.offset,
        axisScale: active.axisScale,
        params: active.params,
        dynamics: active.dynamics,
        color: active.color,
        attrs: active.attrs,
        tierBuffers,
        capacity,
        writeCount: 0,
        dynamicBufferOwner: null,
        uScratch,
      });
    }
  }

  bindDynamicBuffers(scene) {
    if (!scene || !this.layerBatches) return 0;
    let bound = 0;
    for (let batchIndex = 0; batchIndex < this.layerBatches.length; batchIndex++) {
      const batch = this.layerBatches[batchIndex];
      if (batch.dynamicBufferOwner) {
        bound++;
        continue;
      }
      batch.dynamicBufferOwner = registerDynamicBufferOwner(scene, {
        id: `rcs-impulse:${this.recipe.id}:${batch.role}`,
        mesh: batch.mesh,
        attributes: RCS_DYNAMIC_ATTRIBUTE_KEYS.map((key) => ({
          name: key,
          attribute: batch.attrs[key],
        })),
      });
      if (batch.dynamicBufferOwner) bound++;
    }
    return bound;
  }

  assertLayerBindings() {
    const failures = [];
    if (!this.layerBatches) return { ok: false, failures: ['no GPU batches'] };
    for (let i = 0; i < this.layerBatches.length; i++) {
      const b = this.layerBatches[i];
      const li = b.layerIndex;
      if (b.material.userData.textureId !== this.pool._layerTextureId[li]) {
        failures.push(`${b.role}: texture mismatch`);
      }
      if (typeof b.material.then === 'function') failures.push(`${b.role}: promise material`);
      if (Math.abs(b.material.uniforms.uIntensity.value - this.pool._layerIntensity[li]) > 1e-4) {
        failures.push(`${b.role}: intensity`);
      }
    }
    return { ok: failures.length === 0, failures };
  }

  fire(origin, axis, strength = 1) {
    return this.pool.fire(origin, axis, strength);
  }

  /**
   * @param {number} dt
   * @param {object|null|undefined} a11y - omit/null uses pool empty a11y (no alloc)
   */
  update(dt, a11y) {
    if (this._disposed) return this.pool._result;
    this._time += dt || 0;
    const flags = a11y == null ? this._a11y : a11y;
    if (flags.qualityTier) this.setQualityTier(flags.qualityTier);
    const result = this.pool.update(dt, flags);

    // Event lights: begin → write each impulse → finalize (counts always correct)
    this.eventLights.beginFrame();
    for (let i = 0; i < this.pool.maxImpulses; i++) {
      const imp = this.pool.impulses[i];
      if (!imp.alive) continue;
      const env = sampleImpulseEnvelope(imp.age, this.pool._timing) * imp.strength;
      if (env <= 0.02) continue;
      this.eventLights.writeRcs(imp.origin, env, result.presentation.eventLightScale);
    }
    this.eventLights.finalize();

    if (this.layerBatches && !this._disposed) {
      const motionScale = this.recipe.accessibility?.reducedMotion?.flowSpeedScale ?? 0.08;
      const baseFlow = this.recipe.identity.flowCharacter.baseFlow
        * (flags.reducedMotion ? motionScale : 1);
      for (let b = 0; b < this.layerBatches.length; b++) {
        const batch = this.layerBatches[b];
        assertDynamicBufferOwnerWritable(batch.dynamicBufferOwner);
        batch.writeCount = 0;
      }
      for (let i = 0; i < result.activeSlotCount; i++) {
        const s = this.pool.slots[i];
        const batch = this.layerBatches[s.layerIndex];
        if (!batch) continue;
        const w = batch.writeCount;
        if (w >= batch.capacity) continue;
        const o = w * 3;
        const a = w * 4;
        batch.offset[o] = s.offset[0];
        batch.offset[o + 1] = s.offset[1];
        batch.offset[o + 2] = s.offset[2];
        batch.axisScale[a] = s.axis[0];
        batch.axisScale[a + 1] = s.axis[1];
        batch.axisScale[a + 2] = s.axis[2];
        batch.axisScale[a + 3] = s.length;
        batch.params[a] = s.width;
        batch.params[a + 1] = s.envelope;
        batch.params[a + 2] = s.phase;
        batch.params[a + 3] = 0; // boost not used for impulse jets
        if (batch.dynamics) {
          batch.dynamics[a] = baseFlow;
          batch.dynamics[a + 1] = 0.5;
          batch.dynamics[a + 2] = 0.9;
          batch.dynamics[a + 3] = 1.0;
        }
        batch.color[o] = s.color[0];
        batch.color[o + 1] = s.color[1];
        batch.color[o + 2] = s.color[2];
        for (let bindingIndex = 0; bindingIndex < RCS_DYNAMIC_ATTRIBUTE_KEYS.length; bindingIndex++) {
          markDynamicBufferItems(batch.dynamicBufferOwner, bindingIndex, w);
        }
        batch.writeCount = w + 1;
      }
      const intensityScale = result.presentation.intensityScale;
      for (let b = 0; b < this.layerBatches.length; b++) {
        const batch = this.layerBatches[b];
        if (batch.dynamicBufferOwner) {
          commitDynamicBufferOwner(batch.dynamicBufferOwner, batch.writeCount);
        } else {
          batch.attrs.instOffset.needsUpdate = true;
          batch.attrs.instAxis.needsUpdate = true;
          batch.attrs.instParams.needsUpdate = true;
          if (batch.attrs.instDynamics) batch.attrs.instDynamics.needsUpdate = true;
          batch.attrs.instColor.needsUpdate = true;
          batch.mesh.count = batch.writeCount;
        }
        batch.mesh.visible = batch.writeCount > 0;
        const u = batch.uScratch;
        u.time = this._time;
        u.flowSpeed = baseFlow;
        u.reducedMotion = !!flags.reducedMotion;
        u.reducedFlash = !!flags.reducedFlash;
        const reducedFlashGain = flags.reducedFlash
          ? (this.recipe.accessibility?.reducedFlash?.roleIntensityGain?.[batch.role] ?? 1)
          : 1;
        const reducedMotionGain = flags.reducedMotion
          ? (this.recipe.accessibility?.reducedMotion?.roleIntensityGain?.[batch.role] ?? 1)
          : 1;
        u.intensity = batch.baseIntensity * intensityScale * reducedFlashGain * reducedMotionGain;
        const opacityGain = flags.reducedMotion
          ? (this.recipe.accessibility?.reducedMotion?.roleOpacityGain?.[batch.role] ?? 1)
          : 1;
        u.opacity = Math.min(1, this.pool._layerOpacity[batch.layerIndex] * opacityGain);
        u.softEdge = this.pool._layerSoftEdge[batch.layerIndex];
        setMaterialUniforms(batch.material, u);
      }
      this.group.visible = result.activeSlotCount > 0;
    }
    return result;
  }

  reset() {
    for (let i = 0; i < this.pool.maxImpulses; i++) {
      this.pool.impulses[i].alive = false;
      this.pool.impulses[i].age = 0;
    }
    this.pool.activeImpulseCount = 0;
    this.pool.activeSlotCount = 0;
    for (let i = 0; i < this.pool.capacity; i++) this.pool.slots[i].alive = false;
    this.eventLights.reset();
    if (this.layerBatches) {
      for (let b = 0; b < this.layerBatches.length; b++) {
        const batch = this.layerBatches[b];
        batch.writeCount = 0;
        if (batch.mesh) {
          if (batch.dynamicBufferOwner) commitDynamicBufferOwner(batch.dynamicBufferOwner, 0);
          else batch.mesh.count = 0;
          batch.mesh.visible = false;
        }
      }
    }
    if (this.group) this.group.visible = false;
    this._time = 0;
  }

  destroy() {
    this.reset();
  }

  dispose() {
    if (this._disposed) return;
    this.reset();
    if (this.layerBatches) {
      for (let i = 0; i < this.layerBatches.length; i++) {
        const b = this.layerBatches[i];
        unregisterDynamicBufferOwner(b.dynamicBufferOwner);
        b.dynamicBufferOwner = null;
        if (b.tierBuffers) {
          for (let ti = 0; ti < RCS_QUALITY_TIERS.length; ti++) {
            const tb = b.tierBuffers[RCS_QUALITY_TIERS[ti]];
            if (tb?.geo?.dispose) tb.geo.dispose();
          }
        } else if (b.mesh?.geometry?.dispose) {
          b.mesh.geometry.dispose();
        }
        if (b.material?.dispose) b.material.dispose();
        b.mesh = null;
        b.material = null;
      }
    }
    this._disposed = true;
  }

  sampleRadiance(role, envelope, a11y = {}) {
    const li = this.pool._findLayerIndex(role);
    if (li < 0) return 0;
    resolveAccessibilityPresentationInto(
      this.recipe,
      a11y,
      this.pool._presentation,
      this.pool._a11yTables,
    );
    return computeLayerRadiance(
      this.pool._layerIntensity[li],
      this.pool._presentation.intensityScale,
      envelope,
      !!a11y.reducedFlash,
    );
  }
}
