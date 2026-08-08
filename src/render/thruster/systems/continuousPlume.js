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
  resolveDriveMode,
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

const ROLE_ORDER = ['core', 'inner', 'sheath', 'vapor', 'distortion'];
const QUALITY_TIERS = ['high', 'medium', 'low'];
const PLUME_INSTANCE_STRIDE = 18;
const PLUME_OFFSET_OFFSET = 0;
const PLUME_AXIS_SCALE_OFFSET = 3;
const PLUME_PARAMS_OFFSET = 7;
const PLUME_DYNAMICS_OFFSET = 11;
const PLUME_COLOR_OFFSET = 15;

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

    // One advection phase per socket, shared by every layer drawn at that nozzle. The shader's
    // warp/noise fields are all keyed off phase, so giving each role its own value made the core,
    // inner, sheath, and vapor churn independently — four separate plumes stacked on one axis.
    // Sharing it per socket is what lets the layers resolve as a single coherent body of liquid,
    // while distinct sockets keep their own field so twin nozzles do not mirror each other.
    this._socketPhase = new Float32Array(this.maxSockets);
    for (let s = 0; s < this.maxSockets; s++) this._socketPhase[s] = (s * 0.37) % 1;

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
        // Per-instance continuum dynamics (uploaded as instanceDynamics / params.w)
        flowSpeed: 1,
        turbulence: 0.5,
        coreSheath: 0.8,
        dissipation: 1,
        boostBlend: 0,
        mode: 'idle',
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
      mode: 'idle',
    };
    this._throttleFlags = {
      reducedMotion: false,
      reducedFlash: false,
      lowQuality: false,
      qualityTier: 'high',
      boostBlend: 0,
      boost: 0,
      cruise: 0,
      reverse: 0,
      retroOnly: false,
      brake: 0,
      speedDrive: 0,
      drive: 0,
      throttle: 0,
      mode: null,
    };
    this._writeFlags = this._emptyA11y;
    this._batchBoostMax = 0;
    this._batchDriveMax = 0;
    this._entityWrites = 0;
    this._fallbackSocket = { x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 };
    this._result = {
      activeCount: 0,
      sample: this._scratchSample,
      drive: 0,
      boostBlend: 0,
      mode: 'idle',
      entityWrites: 0,
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

  /**
   * Begin a multi-entity batch write. Call writeEntity zero+ times, then endWrite.
   * @param {object} a11y
   */
  beginWrite(a11y) {
    this.beginFrame();
    this._writeFlags = a11y || this._emptyA11y;
    this._batchBoostMax = 0;
    this._batchDriveMax = 0;
    this._entityWrites = 0;
    resolveAccessibilityPresentationInto(
      this.recipe,
      this._writeFlags,
      this._presentation,
      this._a11yTables,
    );
  }

  /**
   * Append one entity's sockets into the shared pool. Mutates `driveState` in place.
   * @param {number} throttle
   * @param {Array|null} sockets
   * @param {number} dt
   * @param {number} boost
   * @param {{ plumeDrive:number, boostBlend:number }} driveState
   * @param {object|null} driveSignals
   * @param {number} [socketBudget] remaining sockets allowed for this entity
   */
  writeEntity(throttle, sockets, dt, boost, driveState, driveSignals, socketBudget) {
    const flags = this._writeFlags || this._emptyA11y;
    const state = driveState || this._driveState;
    const signals = driveSignals || null;
    // Commanded forward authority (never smoothed residual). Prefer signals.throttle.
    const commandThrottle = signals && signals.throttle != null
      ? Math.max(0, signals.throttle)
      : Math.max(0, throttle || 0);
    const boostTarget = signals && signals.boost != null ? signals.boost : (boost || 0);
    integrateDriveState(state, throttle || 0, boostTarget, dt || 0, this._driveRates);

    // Fill persistent throttle scratch — resolveDriveMode/sampleThrottleInto read this object.
    const tf = this._throttleFlags;
    tf.reducedMotion = !!flags.reducedMotion;
    tf.reducedFlash = !!flags.reducedFlash;
    tf.lowQuality = !!flags.lowQuality;
    tf.qualityTier = flags.qualityTier || 'high';
    tf.boostBlend = state.boostBlend;
    tf.boost = boostTarget;
    tf.cruise = signals ? (signals.cruise || 0) : 0;
    tf.reverse = signals ? (signals.reverse || 0) : 0;
    tf.retroOnly = !!(signals && signals.retroOnly);
    tf.brake = signals ? (signals.brake || 0) : 0;
    tf.speedDrive = signals ? (signals.speedDrive || 0) : 0;
    tf.drive = state.plumeDrive; // residual / smoothed energy
    tf.throttle = commandThrottle; // commanded — brake mode key
    tf.mode = signals && signals.mode ? signals.mode : null;
    // No object literal: mode resolver reads the same scratch.
    if (!tf.mode) tf.mode = resolveDriveMode(tf, this.recipe);
    sampleThrottleInto(this.recipe, state.plumeDrive, tf, this._scratchSample);

    if (state.boostBlend > this._batchBoostMax) this._batchBoostMax = state.boostBlend;
    if (state.plumeDrive > this._batchDriveMax) this._batchDriveMax = state.plumeDrive;

    const sample = this._scratchSample;
    const geo = this.recipe.geometry;
    const boostBlend = state.boostBlend;
    const intensityScale = this._presentation.intensityScale;
    const socketList = sockets && sockets.length ? sockets : null;
    const budget = Number.isFinite(socketBudget) ? socketBudget : this.maxSockets;
    const nSockets = socketList
      ? Math.min(socketList.length, budget, this.maxSockets)
      : Math.min(1, budget);

    // Per-entity dynamics captured once then written into every slot for this entity.
    const dynFlow = sample.flowSpeed;
    const dynTurb = sample.turbulence;
    const dynCoreSheath = sample.coreSheathBalance;
    const dynDiss = sample.dissipation;
    const dynBoost = boostBlend;
    const dynMode = sample.mode || tf.mode || 'accel';

    let writtenSockets = 0;
    for (let s = 0; s < nSockets; s++) {
      if (this.activeCount >= this.capacity) break;
      const sock = socketList ? socketList[s] : this._fallbackSocket;
      let layerWrote = false;
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
        slot.phase = this._socketPhase[s];
        slot.offset[0] = sock.x;
        slot.offset[1] = sock.y;
        slot.offset[2] = sock.z;
        slot.axis[0] = sock.ax;
        slot.axis[1] = sock.ay;
        slot.axis[2] = sock.az;
        const layering = this.recipe.identity?.layeringCharacter;
        const boostLength = layering?.boostLengthGain?.[role] ?? 0;
        const boostWidth = layering?.boostWidthGain?.[role] ?? 0;
        const motionProfile = this.recipe.accessibility?.reducedMotion;
        const reducedLength = flags.reducedMotion ? (motionProfile?.roleLengthScale?.[role] ?? 1) : 1;
        const reducedWidth = flags.reducedMotion ? (motionProfile?.roleWidthScale?.[role] ?? 1) : 1;
        slot.length = geo.baseLength * sample.length * this._layerLengthScale[li]
          * (1 + boostBlend * boostLength) * reducedLength;
        slot.width = geo.baseWidth * sample.width * this._layerWidthScale[li]
          * (1 + boostBlend * boostWidth) * reducedWidth;
        slot.throttle = sample.effectiveDrive + boostBlend * (layering?.boostStructuralDrive ?? 0);
        slot.intensity = this._layerIntensity[li] * intensityScale;
        slot.opacity = this._layerOpacity[li];
        slot.softEdge = this._layerSoftEdge[li] + this._presentation.softEdgeBoost;
        // Recipe RGB blended with precomputed faction thruster RGB (no object alloc).
        // Core stays white-hot (light blend); sheath/vapor carry more faction identity.
        const br = this._layerColor[li * 3];
        const bg = this._layerColor[li * 3 + 1];
        const bb = this._layerColor[li * 3 + 2];
        const fr = signals && Number.isFinite(signals.factionR) ? signals.factionR : br;
        const fg = signals && Number.isFinite(signals.factionG) ? signals.factionG : bg;
        const fb = signals && Number.isFinite(signals.factionB) ? signals.factionB : bb;
        let factionBlend = 0.28;
        if (role === 'core') factionBlend = 0.12;
        else if (role === 'inner') factionBlend = 0.28;
        else if (role === 'sheath') factionBlend = 0.38;
        else if (role === 'vapor') factionBlend = 0.32;
        else factionBlend = 0.15;
        const ib = 1 - factionBlend;
        slot.color[0] = br * ib + fr * factionBlend;
        slot.color[1] = bg * ib + fg * factionBlend;
        slot.color[2] = bb * ib + fb * factionBlend;
        // Per-instance continuum dynamics (not shared material uniforms).
        slot.flowSpeed = dynFlow * (this._layerScroll[li] / 2.4);
        slot.turbulence = dynTurb;
        slot.coreSheath = dynCoreSheath;
        slot.dissipation = dynDiss;
        slot.boostBlend = dynBoost;
        slot.mode = dynMode;
        const pack = LAYER_ROLE_PACK[role] ?? 0;
        if (pack >= 0 && pack < this._roleActive.length) this._roleActive[pack] += 1;
        layerWrote = true;
      }
      if (layerWrote) writtenSockets += 1;
    }
    this._entityWrites += 1;
    return writtenSockets;
  }

  endWrite() {
    for (let i = this.activeCount; i < this.capacity; i++) {
      this.slots[i].alive = false;
    }
    // Mirror last entity sample for single-entity callers; batch max for fleet uniforms.
    this._driveState.plumeDrive = this._batchDriveMax;
    this._driveState.boostBlend = this._batchBoostMax;
    this._result.activeCount = this.activeCount;
    this._result.sample = this._scratchSample;
    this._result.drive = this._batchDriveMax;
    this._result.boostBlend = this._batchBoostMax;
    this._result.mode = this._scratchSample.mode || 'idle';
    this._result.entityWrites = this._entityWrites || 0;
    this._result.frameAllocations = this._frameAllocs;
    this._result.roles = this._presentation.roles;
    this._result.roleCount = this._presentation.roleCount;
    this._result.presentation = this._presentation;
    return this._result;
  }

  /**
   * Single-entity convenience (preserves prior API). No allocation.
   */
  update(throttle, sockets, a11y, dt, boost, driveSignals) {
    this.beginWrite(a11y);
    this.writeEntity(throttle, sockets, dt, boost, this._driveState, driveSignals, this.maxSockets);
    return this.endWrite();
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
    this._uniformScratch = null;
    this._emptyOpts = Object.freeze({ boost: 0, a11y: null });
    this._optsScratch = { boost: 0, a11y: null };
    this._qualityTier = 'high';
    this._geoTemplates = null;
    this._batching = false;

    if (THREE) {
      this._initThree(THREE, opts);
      if (opts.scene) this.bindDynamicBuffers(opts.scene);
    }
  }

  /**
   * Active segmented geometry vertex/index counts for tests.
   */
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

  /**
   * Switch quality tier geometry without per-frame allocation.
   * Uses prebuilt complete meshes — never a truncated partial plane.
   */
  setQualityTier(tier) {
    const t = tier === 'medium' || tier === 'low' ? tier : 'high';
    if (t === this._qualityTier || !this.layerBatches) {
      this._qualityTier = t;
      return this._qualityTier;
    }
    this._qualityTier = t;
    for (let i = 0; i < this.layerBatches.length; i++) {
      const batch = this.layerBatches[i];
      const tb = batch.tierBuffers[t];
      if (!tb) continue;
      if (batch.dynamicBufferOwner) {
        replaceDynamicBufferAttribute(
          batch.dynamicBufferOwner,
          0,
          tb.backing,
          `plume-quality-tier:${t}`,
        );
      }
      batch.mesh.geometry = tb.geo;
      batch.offset = tb.offset;
      batch.axisScale = tb.axisScale;
      batch.params = tb.params;
      batch.dynamics = tb.dynamics;
      batch.color = tb.color;
      batch.backing = tb.backing;
      batch.attrs = tb.attrs;
      if (batch.dynamicBufferOwner) commitDynamicBufferOwner(batch.dynamicBufferOwner, 0);
      else batch.mesh.count = 0;
      batch.writeCount = 0;
    }
    return this._qualityTier;
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
    this.envelopeParams = resolveEnvelopeParams(this.recipe);
    this.group.userData.axialEnvelope = this.envelopeParams;
    this.group.userData.usesSharedAxialEnvelope = true;
    this.group.userData.segmentCounts = {
      high: resolveSegmentCount(this.recipe, 'high'),
      medium: resolveSegmentCount(this.recipe, 'medium'),
      low: resolveSegmentCount(this.recipe, 'low'),
    };

    const maxPerLayer = this.pool.maxSockets;
    this.layerBatches = [];
    this._uniformScratch = [];
    const idn = this.recipe.identity?.flowCharacter || {};
    const initialTier = opts.qualityTier === 'medium' || opts.qualityTier === 'low'
      ? opts.qualityTier
      : 'high';
    this._qualityTier = initialTier;

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

      bindEnvelopeFromRecipe(mat, this.recipe);

      const capacity = maxPerLayer;
      const tierBuffers = Object.create(null);
      for (let ti = 0; ti < QUALITY_TIERS.length; ti++) {
        const tier = QUALITY_TIERS[ti];
        const segs = resolveSegmentCount(this.recipe, tier);
        const geo = createSegmentedPlumeGeometry(THREE, segs);
        // These compact arrays are retained as the CPU readback contract used by
        // acceptance/capture tooling. The renderer binds only the interleaved
        // backing below, so one instance is one 18-float GPU publication.
        const offset = new Float32Array(capacity * 3);
        const axisScale = new Float32Array(capacity * 4);
        const params = new Float32Array(capacity * 4);
        const dynamics = new Float32Array(capacity * 4);
        const color = new Float32Array(capacity * 3);
        const backing = new THREE.InstancedInterleavedBuffer(
          new Float32Array(capacity * PLUME_INSTANCE_STRIDE),
          PLUME_INSTANCE_STRIDE,
        );
        const instOffset = new THREE.InterleavedBufferAttribute(
          backing, 3, PLUME_OFFSET_OFFSET,
        );
        const instAxis = new THREE.InterleavedBufferAttribute(
          backing, 4, PLUME_AXIS_SCALE_OFFSET,
        );
        const instParams = new THREE.InterleavedBufferAttribute(
          backing, 4, PLUME_PARAMS_OFFSET,
        );
        const instDynamics = new THREE.InterleavedBufferAttribute(
          backing, 4, PLUME_DYNAMICS_OFFSET,
        );
        const instColor = new THREE.InterleavedBufferAttribute(
          backing, 3, PLUME_COLOR_OFFSET,
        );
        geo.setAttribute('instanceOffset', instOffset);
        geo.setAttribute('instanceAxisScale', instAxis);
        geo.setAttribute('instanceParams', instParams);
        geo.setAttribute('instanceDynamics', instDynamics);
        geo.setAttribute('instanceColor', instColor);
        tierBuffers[tier] = {
          geo,
          offset,
          axisScale,
          params,
          dynamics,
          color,
          backing,
          attrs: { instOffset, instAxis, instParams, instDynamics, instColor },
          segments: segs,
        };
      }

      const active = tierBuffers[initialTier];
      let mesh;
      if (THREE.InstancedMesh) {
        mesh = new THREE.InstancedMesh(active.geo, mat, capacity);
        mesh.count = 0;
      } else {
        mesh = new THREE.Mesh(active.geo, mat);
        mesh.count = 0;
      }
      mesh.frustumCulled = false;
      mesh.name = `plume-layer:${role}`;
      mesh.renderOrder = 20 + li;
      mesh.visible = this.pool._layerEnabled[li] === 1;
      this.group.add(mesh);

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
        offset: active.offset,
        axisScale: active.axisScale,
        params: active.params,
        dynamics: active.dynamics,
        color: active.color,
        backing: active.backing,
        attrs: active.attrs,
        tierBuffers,
        capacity,
        writeCount: 0,
        dynamicBufferOwner: null,
        uScratch,
      });
    }

    this._initGpu = true;
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
        id: `continuous-plume:${this.recipe.id}:${batch.role}`,
        mesh: batch.mesh,
        attributes: [{ name: 'instances', attribute: batch.backing }],
      });
      if (batch.dynamicBufferOwner) bound++;
    }
    return bound;
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
   * Begin multi-entity GPU batch (fleet path). Follow with writeEntity + endUpdate.
   */
  beginUpdate(a11y) {
    if (this._disposed) return;
    this._batching = true;
    this._batchA11y = a11y == null ? this._a11y : a11y;
    if (this._batchA11y.qualityTier) this.setQualityTier(this._batchA11y.qualityTier);
    this.pool.beginWrite(this._batchA11y);
  }

  /**
   * @param {number} dt
   * @param {number} throttle
   * @param {Array|null} sockets
   * @param {{boost?:number,cruise?:number,reverse?:number,retroOnly?:boolean,brake?:number,speedDrive?:number,mode?:string}|null} opts
   * @param {{plumeDrive:number,boostBlend:number}} driveState
   * @param {number} [socketBudget]
   */
  writeEntity(dt, throttle, sockets, opts, driveState, socketBudget) {
    if (this._disposed || !this._batching) return 0;
    const o = opts == null ? this._emptyOpts : opts;
    return this.pool.writeEntity(
      throttle,
      sockets,
      dt,
      o.boost == null ? 0 : o.boost,
      driveState,
      o,
      socketBudget,
    );
  }

  endUpdate(dt) {
    if (this._disposed) return this.pool._result;
    this._time += dt || 0;
    const a11y = this._batchA11y || this._a11y;
    const result = this.pool.endWrite();
    this._batching = false;
    this._commitGpu(result, a11y, null);
    return result;
  }

  /**
   * @param {number} dt
   * @param {number} throttle
   * @param {Array|null} sockets
   * @param {{boost?:number,a11y?:object,cruise?:number,reverse?:number,retroOnly?:boolean,brake?:number,speedDrive?:number,mode?:string}|null|undefined} opts
   */
  update(dt, throttle, sockets, opts) {
    if (this._disposed) return this.pool._result;
    this._time += dt || 0;
    const o = opts == null ? this._emptyOpts : opts;
    const boost = o.boost == null ? 0 : o.boost;
    const a11y = o.a11y == null ? this._a11y : o.a11y;
    if (a11y.qualityTier) this.setQualityTier(a11y.qualityTier);
    const result = this.pool.update(throttle, sockets, a11y, dt, boost, o);
    this._commitGpu(result, a11y, sockets);
    return result;
  }

  _commitGpu(result, a11y, sockets) {
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
      for (let b = 0; b < this.layerBatches.length; b++) {
        const batch = this.layerBatches[b];
        assertDynamicBufferOwnerWritable(batch.dynamicBufferOwner);
        batch.writeCount = 0;
      }

      const n = result.activeCount;
      for (let i = 0; i < n; i++) {
        const s = this.pool.slots[i];
        const batch = this.layerBatches[s.layerIndex];
        if (!batch) continue;
        const w = batch.writeCount;
        if (w >= batch.capacity) continue;
        markDynamicBufferItems(batch.dynamicBufferOwner, 0, w);
        const oi = w * 3;
        const a = w * 4;
        const p = w * PLUME_INSTANCE_STRIDE;
        const packed = batch.backing.array;
        const boostBlend = s.boostBlend != null ? s.boostBlend : 0;
        const flowSpeed = s.flowSpeed != null ? s.flowSpeed : 1;
        const turbulence = s.turbulence != null ? s.turbulence : 0.5;
        const coreSheath = s.coreSheath != null ? s.coreSheath : 0.8;
        const dissipation = s.dissipation != null ? s.dissipation : 1;
        batch.offset[oi] = packed[p + PLUME_OFFSET_OFFSET] = s.offset[0];
        batch.offset[oi + 1] = packed[p + PLUME_OFFSET_OFFSET + 1] = s.offset[1];
        batch.offset[oi + 2] = packed[p + PLUME_OFFSET_OFFSET + 2] = s.offset[2];
        batch.axisScale[a] = packed[p + PLUME_AXIS_SCALE_OFFSET] = s.axis[0];
        batch.axisScale[a + 1] = packed[p + PLUME_AXIS_SCALE_OFFSET + 1] = s.axis[1];
        batch.axisScale[a + 2] = packed[p + PLUME_AXIS_SCALE_OFFSET + 2] = s.axis[2];
        batch.axisScale[a + 3] = packed[p + PLUME_AXIS_SCALE_OFFSET + 3] = s.length;
        batch.params[a] = packed[p + PLUME_PARAMS_OFFSET] = s.width;
        batch.params[a + 1] = packed[p + PLUME_PARAMS_OFFSET + 1] = s.throttle;
        batch.params[a + 2] = packed[p + PLUME_PARAMS_OFFSET + 2] = s.phase;
        batch.params[a + 3] = packed[p + PLUME_PARAMS_OFFSET + 3] = boostBlend;
        if (batch.dynamics) {
          batch.dynamics[a] = packed[p + PLUME_DYNAMICS_OFFSET] = flowSpeed;
          batch.dynamics[a + 1] = packed[p + PLUME_DYNAMICS_OFFSET + 1] = turbulence;
          batch.dynamics[a + 2] = packed[p + PLUME_DYNAMICS_OFFSET + 2] = coreSheath;
          batch.dynamics[a + 3] = packed[p + PLUME_DYNAMICS_OFFSET + 3] = dissipation;
        }
        batch.color[oi] = packed[p + PLUME_COLOR_OFFSET] = s.color[0];
        batch.color[oi + 1] = packed[p + PLUME_COLOR_OFFSET + 1] = s.color[1];
        batch.color[oi + 2] = packed[p + PLUME_COLOR_OFFSET + 2] = s.color[2];
        batch.writeCount = w + 1;
      }

      const sample = result.sample;
      const idn = this.recipe.identity.flowCharacter;
      const intensityScale = result.presentation.intensityScale;
      const softBoost = result.presentation.softEdgeBoost;
      for (let b = 0; b < this.layerBatches.length; b++) {
        const batch = this.layerBatches[b];
        if (batch.dynamicBufferOwner) {
          commitDynamicBufferOwner(batch.dynamicBufferOwner, batch.writeCount);
        } else {
          batch.backing.needsUpdate = true;
          batch.mesh.count = batch.writeCount;
        }
        batch.mesh.visible = batch.writeCount > 0 && this.pool._layerEnabled[batch.layerIndex] === 1;

        const li = batch.layerIndex;
        const u = batch.uScratch;
        u.time = this._time;
        // Uniforms remain family-identity fallbacks; per-instance dynamics own continuum.
        u.flowSpeed = sample.flowSpeed * (this.pool._layerScroll[li] / 2.4);
        u.turbulence = sample.turbulence;
        u.coreSheath = sample.coreSheathBalance;
        u.dissipation = sample.dissipation;
        u.boostBlend = result.boostBlend;
        u.swirl = idn.swirl;
        u.fork = idn.fork;
        u.noiseScale = idn.noiseScale;
        u.softEdge = this.pool._layerSoftEdge[li] + softBoost;
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
      // Idle floor keeps a restrained core/nozzle signature when recipe.throttle.idle > 0.
      const idleFloor = this.recipe.throttle?.idle || 0;
      this.group.visible = n > 0 && (result.drive > 0.01 || idleFloor > 0 || result.entityWrites > 0);
    }
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
          if (batch.dynamicBufferOwner) commitDynamicBufferOwner(batch.dynamicBufferOwner, 0);
          else batch.mesh.count = 0;
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
        unregisterDynamicBufferOwner(b.dynamicBufferOwner);
        b.dynamicBufferOwner = null;
        if (b.tierBuffers) {
          for (let ti = 0; ti < QUALITY_TIERS.length; ti++) {
            const tb = b.tierBuffers[QUALITY_TIERS[ti]];
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
