/**
 * Batched continuous thruster plume — zero per-frame object allocation after init.
 *
 * Per-layer InstancedMesh + material groups bind declared texture, blend, intensity,
 * opacity, softEdge, and flipbook metadata. Camera-facing axial billboard geometry.
 */

import {
  sampleThrottleInto,
  integrateDriveState,
  compileDriveRates,
} from './throttleResponse.js';
import {
  compileAccessibilityTables,
  createPresentationScratch,
  resolveAccessibilityPresentationInto,
} from './accessibility.js';
// sampleThrottleInto + resolveAccessibilityPresentationInto also used by sampleRadiance
import {
  createFlowFlipbookMaterial,
  setMaterialUniforms,
  LAYER_ROLE_PACK,
  computeLayerRadiance,
  bindEnvelopeFromRecipe,
} from '../materials/flowFlipbookMaterial.js';
import { resolveEnvelopeParams } from '../geometry/axialWidthEnvelope.js';
import { EventLightPool } from './eventLight.js';

const ROLE_ORDER = ['core', 'inner', 'sheath', 'vapor', 'distortion'];

/**
 * Parse #RRGGBB into preallocated rgb array.
 */
function hexToRgb(hex, out) {
  if (typeof hex === 'string' && hex.length >= 7) {
    out[0] = parseInt(hex.slice(1, 3), 16) / 255;
    out[1] = parseInt(hex.slice(3, 5), 16) / 255;
    out[2] = parseInt(hex.slice(5, 7), 16) / 255;
  } else {
    out[0] = 0.4;
    out[1] = 0.8;
    out[2] = 1.0;
  }
}

/**
 * Pure allocation accounting used by tests without Three.js.
 * Compiles recipe layer tables at construction.
 */
export class PlumeSlotPool {
  /**
   * @param {object} recipe validated recipe
   * @param {{ maxSockets?: number, maxLayers?: number }} opts
   */
  constructor(recipe, opts = {}) {
    this.recipe = recipe;
    this.maxSockets = opts.maxSockets ?? 4;
    this.maxLayers = opts.maxLayers ?? 5;
    this.capacity = this.maxSockets * this.maxLayers;
    this.activeCount = 0;
    this._allocCount = 0;
    this._frameAllocs = 0;

    // Precompile layer descriptors (stable identity)
    this._a11yTables = compileAccessibilityTables(recipe);
    this._driveRates = { driveRise: 9.5, driveFall: 4.2, boostRise: 8.5, boostFall: 3.6 };
    compileDriveRates(recipe, this._driveRates);
    this._presentation = createPresentationScratch(8);
    this._emptyA11y = {
      reducedMotion: false,
      reducedFlash: false,
      lowQuality: false,
      qualityTier: 'high',
    };

    // Per-role compiled scalars (index by ROLE_ORDER)
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
    this._layerFlipbook = new Uint8Array(this.maxLayers);
    this._layerFlipCols = new Uint8Array(this.maxLayers);
    this._layerFlipRows = new Uint8Array(this.maxLayers);
    this._layerFlipFps = new Float32Array(this.maxLayers);
    this._layerCount = 0;

    const layers = recipe.layers || [];
    for (let i = 0; i < layers.length && this._layerCount < this.maxLayers; i++) {
      const L = layers[i];
      const idx = this._layerCount++;
      this._layerRole[idx] = L.role;
      this._layerEnabled[idx] = L.enabled === false ? 0 : 1;
      this._layerIntensity[idx] = L.intensity ?? 1;
      this._layerOpacity[idx] = L.opacity ?? 0.5;
      this._layerSoftEdge[idx] = L.softEdge ?? 0.28;
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
      const isFlip = L.texture?.mode === 'flipbook';
      this._layerFlipbook[idx] = isFlip ? 1 : 0;
      this._layerFlipCols[idx] = L.texture?.cols || 4;
      this._layerFlipRows[idx] = L.texture?.rows || 4;
      this._layerFlipFps[idx] = L.texture?.fps || 16;
      this._allocCount += 1;
    }

    /** @type {object[]} */
    this.slots = new Array(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      this.slots[i] = {
        alive: false,
        socketIndex: 0,
        layerIndex: 0,
        layerRole: 'core',
        offset: [0, 0, 0],
        axis: [-1, 0, 0],
        length: 1,
        width: 0.4,
        throttle: 0,
        phase: (i % 17) * 0.037,
        color: [0.4, 0.8, 1.0],
        intensity: 1,
        opacity: 0.5,
        softEdge: 0.28,
      };
      this._allocCount += 1;
    }

    this._driveState = { plumeDrive: 0, boostBlend: 0 };
    this._scratchSample = {
      throttle: 0,
      length: 0,
      width: 0,
      turbulence: 0,
      coreSheathBalance: 0,
      dissipation: 0,
      flowSpeed: 0,
      effectiveDrive: 0,
    };
    this._fallbackSocket = { x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 };
    this._result = {
      activeCount: 0,
      sample: this._scratchSample,
      drive: 0,
      boostBlend: 0,
      frameAllocations: 0,
      roles: this._presentation.roles,
      roleCount: 0,
      presentation: this._presentation,
    };

    // Per-role active counts for GPU batch upload
    this._roleActive = new Int32Array(ROLE_ORDER.length);
    this._roleSlotStart = new Int32Array(ROLE_ORDER.length);
  }

  get allocationCount() {
    return this._allocCount;
  }

  beginFrame() {
    this._frameAllocs = 0;
    this.activeCount = 0;
    for (let i = 0; i < this._roleActive.length; i++) this._roleActive[i] = 0;
  }

  get frameAllocations() {
    return this._frameAllocs;
  }

  /**
   * Find compiled layer index by role string. No allocation.
   */
  _findLayerIndex(role) {
    for (let i = 0; i < this._layerCount; i++) {
      if (this._layerRole[i] === role) return i;
    }
    return -1;
  }

  update(throttle, sockets, a11y, dt, boost) {
    this.beginFrame();
    const flags = a11y || this._emptyA11y;
    integrateDriveState(this._driveState, throttle, boost || 0, dt || 0, this._driveRates);
    sampleThrottleInto(this.recipe, this._driveState.plumeDrive, flags, this._scratchSample);
    resolveAccessibilityPresentationInto(
      this.recipe,
      flags,
      this._presentation,
      this._a11yTables,
    );

    const sample = this._scratchSample;
    const geo = this.recipe.geometry;
    // Turbo changes the pressure envelope by role. Keeping the white core compact while
    // the inner flow/sheath/vapor expand makes boost legible at the game camera without
    // turning the whole exhaust into one overexposed blob.
    const boostBlend = this._driveState.boostBlend;
    const intensityScale = this._presentation.intensityScale;

    const socketList = sockets && sockets.length ? sockets : null;
    const nSockets = socketList
      ? Math.min(socketList.length, this.maxSockets)
      : 1;

    for (let s = 0; s < nSockets; s++) {
      const sock = socketList ? socketList[s] : this._fallbackSocket;
      for (let r = 0; r < this._presentation.roleCount; r++) {
        const role = this._presentation.roles[r];
        const li = this._findLayerIndex(role);
        if (li < 0 || !this._layerEnabled[li]) continue;
        if (this.activeCount >= this.capacity) break;
        const slot = this.slots[this.activeCount++];
        slot.alive = true;
        slot.socketIndex = s;
        slot.layerIndex = li;
        slot.layerRole = role;
        slot.offset[0] = sock.x;
        slot.offset[1] = sock.y;
        slot.offset[2] = sock.z;
        slot.axis[0] = sock.ax;
        slot.axis[1] = sock.ay;
        slot.axis[2] = sock.az;
        const layering = this.recipe.identity?.layeringCharacter;
        const boostLength = layering?.boostLengthGain?.[role] ?? 0;
        const boostWidth = layering?.boostWidthGain?.[role] ?? 0;
        // Reduced motion retains the engineered pressure zones while shortening and calming the
        // downstream exhaust. The core is widened slightly so it cannot minify out at the real
        // chase camera; broad layers contract instead of becoming a large static blue smudge.
        const motionProfile = this.recipe.accessibility?.reducedMotion;
        const reducedLength = flags.reducedMotion ? (motionProfile?.roleLengthScale?.[role] ?? 1) : 1;
        const reducedWidth = flags.reducedMotion ? (motionProfile?.roleWidthScale?.[role] ?? 1) : 1;
        slot.length = geo.baseLength * sample.length * this._layerLengthScale[li]
          * (1 + boostBlend * boostLength) * reducedLength;
        slot.width = geo.baseWidth * sample.width * this._layerWidthScale[li]
          * (1 + boostBlend * boostWidth) * reducedWidth;
        // A bounded boost contribution reaches the shader as a structural/turbulence cue. It is
        // not an opacity proxy: the dedicated boost uniform alters axial frequency and shear.
        slot.throttle = sample.effectiveDrive + boostBlend * (layering?.boostStructuralDrive ?? 0);
        slot.intensity = this._layerIntensity[li] * intensityScale;
        slot.opacity = this._layerOpacity[li];
        slot.softEdge = this._layerSoftEdge[li] + this._presentation.softEdgeBoost;
        slot.color[0] = this._layerColor[li * 3];
        slot.color[1] = this._layerColor[li * 3 + 1];
        slot.color[2] = this._layerColor[li * 3 + 2];

        const pack = LAYER_ROLE_PACK[role] ?? 0;
        if (pack >= 0 && pack < this._roleActive.length) this._roleActive[pack] += 1;
      }
    }

    for (let i = this.activeCount; i < this.capacity; i++) {
      this.slots[i].alive = false;
    }

    this._result.activeCount = this.activeCount;
    this._result.sample = this._scratchSample;
    this._result.drive = this._driveState.plumeDrive;
    this._result.boostBlend = this._driveState.boostBlend;
    this._result.frameAllocations = this._frameAllocs;
    this._result.roles = this._presentation.roles;
    this._result.roleCount = this._presentation.roleCount;
    this._result.presentation = this._presentation;
    return this._result;
  }

  resetDrive() {
    this._driveState.plumeDrive = 0;
    this._driveState.boostBlend = 0;
  }
}

/**
 * Three.js-backed continuous plume: one InstancedMesh per recipe layer.
 */
export class ContinuousPlumeSystem {
  /**
   * @param {typeof import('three')} THREE
   * @param {object} recipe
   * @param {object} [opts]
   */
  constructor(THREE, recipe, opts = {}) {
    this.THREE = THREE;
    this.recipe = recipe;
    this.pool = new PlumeSlotPool(recipe, {
      maxSockets: opts.maxSockets ?? 4,
      maxLayers: opts.maxLayers ?? 5,
    });
    this.eventLights = new EventLightPool(recipe, { maxLights: opts.maxEventLights ?? 4 });
    this.group = null;
    this.layerBatches = null;
    this._time = 0;
    this._a11y = opts.a11y || this.pool._emptyA11y;
    this._textures = opts.textures || {};
    this._initGpu = false;
    this._disposed = false;
    this._nozzleScratch = { x: 0, y: 0, z: 0 };
    // Persistent per-layer uniform write scratch (never reallocated on update)
    this._uniformScratch = null;
    // Hot-path defaults: never allocate `{}` when opts omitted
    this._emptyOpts = Object.freeze({ boost: 0, a11y: null });
    this._optsScratch = { boost: 0, a11y: null };

    if (THREE) {
      this._initThree(THREE, opts);
    }
  }

  _initThree(THREE, opts) {
    const materialFactory = opts.materialFactory || createFlowFlipbookMaterial;
    if (typeof materialFactory !== 'function') {
      throw new TypeError('materialFactory must be a synchronous function');
    }

    this.group = new THREE.Group();
    this.group.name = `plume-system:${this.recipe.id}`;
    this.group.userData.continuousPlume = true;
    this.group.userData.recipeId = this.recipe.id;
    // Shared envelope contract resolved once from recipe
    this.envelopeParams = resolveEnvelopeParams(this.recipe);
    this.group.userData.axialEnvelope = this.envelopeParams;
    this.group.userData.usesSharedAxialEnvelope = true;

    const maxPerLayer = this.pool.maxSockets;
    this.layerBatches = [];
    this._uniformScratch = [];
    const idn = this.recipe.identity?.flowCharacter || {};

    for (let li = 0; li < this.pool._layerCount; li++) {
      const role = this.pool._layerRole[li];
      const texId = this.pool._layerTextureId[li];
      const map = (texId && this._textures[texId]) || this._textures.default || null;
      const isDistort = role === 'distortion';
      const baseIntensity = this.pool._layerIntensity[li];
      const mat = materialFactory(THREE, {
        name: `plume:${this.recipe.id}:${role}`,
        role,
        textureId: texId,
        map,
        blend: this.pool._layerBlend[li],
        softEdge: this.pool._layerSoftEdge[li],
        intensity: baseIntensity,
        opacity: this.pool._layerOpacity[li],
        flowSpeed: (idn.baseFlow ?? 2.6) * (this.pool._layerScroll[li] / 2.6),
        noiseScale: idn.noiseScale ?? 1.5,
        swirl: idn.swirl ?? 0.45,
        fork: idn.fork ?? 0.4,
        useFlipbook: !!this.pool._layerFlipbook[li],
        flipbookCols: this.pool._layerFlipCols[li],
        flipbookRows: this.pool._layerFlipRows[li],
        flipbookFps: this.pool._layerFlipFps[li],
        coreWhitenessCap: this.recipe.accessibility?.reducedFlash?.coreWhitenessCap ?? 0.35,
        layerRole: LAYER_ROLE_PACK[role] ?? 0,
        distortion: isDistort,
        distortEnabled: isDistort && opts.distortionEnabled !== false,
        distortStrength: opts.distortStrength ?? 0.35,
        minProjectedWidth: role === 'core' ? 0.065 : role === 'inner' ? 0.075 : 0.085,
      });

      if (mat && typeof mat.then === 'function') {
        throw new TypeError('materialFactory returned a Promise — materials must be synchronous');
      }

      // Bind shared axial envelope from recipe once at construction (no per-frame alloc)
      bindEnvelopeFromRecipe(mat, this.recipe);

      const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
      geo.translate(0.5, 0, 0);

      const capacity = maxPerLayer;
      const offset = new Float32Array(capacity * 3);
      const axisScale = new Float32Array(capacity * 4);
      const params = new Float32Array(capacity * 4);
      const color = new Float32Array(capacity * 3);
      const instOffset = new THREE.InstancedBufferAttribute(offset, 3);
      const instAxis = new THREE.InstancedBufferAttribute(axisScale, 4);
      const instParams = new THREE.InstancedBufferAttribute(params, 4);
      const instColor = new THREE.InstancedBufferAttribute(color, 3);
      geo.setAttribute('instanceOffset', instOffset);
      geo.setAttribute('instanceAxisScale', instAxis);
      geo.setAttribute('instanceParams', instParams);
      geo.setAttribute('instanceColor', instColor);

      let mesh;
      if (THREE.InstancedMesh) {
        mesh = new THREE.InstancedMesh(geo, mat, capacity);
        mesh.count = 0;
      } else {
        mesh = new THREE.Mesh(geo, mat);
        mesh.count = 0;
      }
      mesh.frustumCulled = false;
      mesh.name = `plume-layer:${role}`;
      mesh.renderOrder = 20 + li;
      mesh.visible = this.pool._layerEnabled[li] === 1;
      this.group.add(mesh);

      // Persistent uniform write record (mutated in place each frame)
      const uScratch = {
        time: 0,
        flowSpeed: 0,
        turbulence: 0,
        coreSheath: 0,
        dissipation: 0,
        boostBlend: 0,
        swirl: idn.swirl ?? 0.45,
        fork: idn.fork ?? 0.4,
        noiseScale: idn.noiseScale ?? 1.5,
        softEdge: this.pool._layerSoftEdge[li],
        intensity: baseIntensity,
        opacity: this.pool._layerOpacity[li],
        reducedMotion: false,
        reducedFlash: false,
        useFlipbook: !!this.pool._layerFlipbook[li],
        flipbookCols: this.pool._layerFlipCols[li],
        flipbookRows: this.pool._layerFlipRows[li],
        flipbookFps: this.pool._layerFlipFps[li],
        distortEnabled: isDistort && opts.distortionEnabled !== false,
      };
      this._uniformScratch.push(uScratch);

      this.layerBatches.push({
        role,
        layerIndex: li,
        mesh,
        material: mat,
        baseIntensity,
        offset,
        axisScale,
        params,
        color,
        attrs: { instOffset, instAxis, instParams, instColor },
        capacity,
        writeCount: 0,
        uScratch,
      });
    }

    this._initGpu = true;
  }

  /**
   * Prove each layer batch bound its declared texture id / blend / flipbook flags.
   */
  assertLayerBindings() {
    const failures = [];
    if (!this.layerBatches) return { ok: false, failures: ['no GPU batches'] };
    for (let i = 0; i < this.layerBatches.length; i++) {
      const b = this.layerBatches[i];
      const li = b.layerIndex;
      const ud = b.material.userData || {};
      if (ud.layerRole !== this.pool._layerRole[li]) {
        failures.push(`${b.role}: layerRole mismatch`);
      }
      if (ud.textureId !== this.pool._layerTextureId[li]) {
        failures.push(`${b.role}: textureId ${ud.textureId} != ${this.pool._layerTextureId[li]}`);
      }
      if (ud.blend !== this.pool._layerBlend[li] && b.role !== 'distortion') {
        // distortion forced to alpha
        failures.push(`${b.role}: blend ${ud.blend} != ${this.pool._layerBlend[li]}`);
      }
      const u = b.material.uniforms;
      if (!u || !u.uIntensity) failures.push(`${b.role}: missing uIntensity`);
      else if (Math.abs(u.uIntensity.value - this.pool._layerIntensity[li]) > 1e-4) {
        failures.push(`${b.role}: intensity not bound`);
      }
      if (u.uOpacity && Math.abs(u.uOpacity.value - this.pool._layerOpacity[li]) > 1e-4) {
        failures.push(`${b.role}: opacity not bound`);
      }
      if (u.uSoftEdge && Math.abs(u.uSoftEdge.value - this.pool._layerSoftEdge[li]) > 1e-4) {
        failures.push(`${b.role}: softEdge not bound`);
      }
      if (this.pool._layerFlipbook[li] && u.uUseFlipbook && u.uUseFlipbook.value < 0.5) {
        failures.push(`${b.role}: flipbook not enabled`);
      }
      if (b.role === 'distortion' && !ud.distortionInterface) {
        failures.push('distortion batch missing interface flag');
      }
      if (typeof b.material.then === 'function') {
        failures.push(`${b.role}: material is thenable`);
      }
    }
    return { ok: failures.length === 0, failures };
  }

  /**
   * @param {number} dt
   * @param {number} throttle
   * @param {Array|null} sockets
   * @param {{boost?:number,a11y?:object}|null|undefined} opts - omit or null; never pass fresh {}
   */
  update(dt, throttle, sockets, opts) {
    if (this._disposed) return this.pool._result;
    this._time += dt || 0;
    // No hot default object: omitted/null/undefined uses preallocated empty opts
    const o = opts == null ? this._emptyOpts : opts;
    const boost = o.boost == null ? 0 : o.boost;
    const a11y = o.a11y == null ? this._a11y : o.a11y;
    const result = this.pool.update(throttle, sockets, a11y, dt, boost);

    const sock0 = sockets && sockets.length ? sockets[0] : this.pool._fallbackSocket;
    this._nozzleScratch.x = sock0.x;
    this._nozzleScratch.y = sock0.y;
    this._nozzleScratch.z = sock0.z;
    this.eventLights.beginFrame();
    this.eventLights.writeMain(
      result.drive,
      this._nozzleScratch,
      result.presentation.eventLightScale,
      result.boostBlend,
    );
    this.eventLights.finalize();

    if (this._initGpu && this.layerBatches && !this._disposed) {
      for (let b = 0; b < this.layerBatches.length; b++) this.layerBatches[b].writeCount = 0;

      const n = result.activeCount;
      for (let i = 0; i < n; i++) {
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
        batch.params[a + 1] = s.throttle;
        batch.params[a + 2] = s.phase;
        batch.params[a + 3] = 1.0; // intensity is uniform-only (no double multiply)
        batch.color[o] = s.color[0];
        batch.color[o + 1] = s.color[1];
        batch.color[o + 2] = s.color[2];
        batch.writeCount = w + 1;
      }

      const sample = result.sample;
      const idn = this.recipe.identity.flowCharacter;
      const intensityScale = result.presentation.intensityScale;
      const softBoost = result.presentation.softEdgeBoost;
      for (let b = 0; b < this.layerBatches.length; b++) {
        const batch = this.layerBatches[b];
        batch.attrs.instOffset.needsUpdate = true;
        batch.attrs.instAxis.needsUpdate = true;
        batch.attrs.instParams.needsUpdate = true;
        batch.attrs.instColor.needsUpdate = true;
        if (batch.mesh.isInstancedMesh) batch.mesh.count = batch.writeCount;
        else batch.mesh.count = batch.writeCount;
        batch.mesh.visible = batch.writeCount > 0 && this.pool._layerEnabled[batch.layerIndex] === 1;

        const li = batch.layerIndex;
        const u = batch.uScratch;
        // Mutate persistent scratch — no object allocation
        u.time = this._time;
        u.flowSpeed = sample.flowSpeed * (this.pool._layerScroll[li] / 2.4);
        u.turbulence = sample.turbulence;
        u.coreSheath = sample.coreSheathBalance;
        u.dissipation = sample.dissipation;
        u.boostBlend = result.boostBlend;
        u.swirl = idn.swirl;
        u.fork = idn.fork;
        u.noiseScale = idn.noiseScale;
        u.softEdge = this.pool._layerSoftEdge[li] + softBoost;
        // Intensity once: base * accessibility (fragment applies throttle response only).
        const reducedFlashGain = a11y.reducedFlash
          ? (this.recipe.accessibility?.reducedFlash?.roleIntensityGain?.[batch.role] ?? 1)
          : 1;
        const reducedMotionGain = a11y.reducedMotion
          ? (this.recipe.accessibility?.reducedMotion?.roleIntensityGain?.[batch.role] ?? 1)
          : 1;
        u.intensity = batch.baseIntensity * intensityScale * reducedFlashGain * reducedMotionGain;
        const opacityGain = a11y.reducedMotion
          ? (this.recipe.accessibility?.reducedMotion?.roleOpacityGain?.[batch.role] ?? 1)
          : 1;
        u.opacity = Math.min(1, this.pool._layerOpacity[li] * opacityGain);
        u.reducedMotion = !!a11y.reducedMotion;
        u.reducedFlash = !!a11y.reducedFlash;
        u.useFlipbook = !!this.pool._layerFlipbook[li];
        u.flipbookCols = this.pool._layerFlipCols[li];
        u.flipbookRows = this.pool._layerFlipRows[li];
        u.flipbookFps = this.pool._layerFlipFps[li];
        u.distortEnabled = batch.role === 'distortion' && !a11y.reducedMotion;
        setMaterialUniforms(batch.material, u);
      }
      this.group.visible = n > 0 && (result.drive > 0.01 || this.recipe.throttle.idle > 0);
    }

    return result;
  }

  /** Clear sim state; keep GPU resources. Idempotent. */
  reset() {
    this.pool.resetDrive();
    this.pool.beginFrame();
    for (let i = 0; i < this.pool.capacity; i++) this.pool.slots[i].alive = false;
    this.eventLights.reset();
    if (this.layerBatches) {
      for (let b = 0; b < this.layerBatches.length; b++) {
        const batch = this.layerBatches[b];
        batch.writeCount = 0;
        if (batch.mesh) {
          batch.mesh.count = 0;
          batch.mesh.visible = false;
        }
      }
    }
    if (this.group) this.group.visible = false;
    this._time = 0;
  }

  /** Alias for reset + mark inactive. */
  destroy() {
    this.reset();
  }

  /**
   * Dispose owned GPU resources once. Idempotent.
   */
  dispose() {
    if (this._disposed) return;
    this.reset();
    if (this.layerBatches) {
      for (let i = 0; i < this.layerBatches.length; i++) {
        const b = this.layerBatches[i];
        if (b.mesh?.geometry?.dispose) b.mesh.geometry.dispose();
        if (b.material?.dispose) b.material.dispose();
        b.mesh = null;
        b.material = null;
      }
    }
    this._disposed = true;
    this._initGpu = false;
  }

  /** Effective radiance for tests (single intensity path). */
  sampleRadiance(role, throttle, a11y = {}) {
    const li = this.pool._findLayerIndex(role);
    if (li < 0) return 0;
    const sample = this.pool._scratchSample;
    sampleThrottleInto(this.recipe, throttle, a11y, sample);
    // Temporarily resolve a11y for intensityScale
    resolveAccessibilityPresentationInto(
      this.recipe,
      a11y,
      this.pool._presentation,
      this.pool._a11yTables,
    );
    return computeLayerRadiance(
      this.pool._layerIntensity[li],
      this.pool._presentation.intensityScale,
      sample.effectiveDrive,
      !!a11y.reducedFlash,
    );
  }
}

export { ROLE_ORDER };
