import * as THREE from 'three';
import { createStructuredBurstGeometry } from './structuredBurstGeometry.js';
import { spawnImpactStructuralBeats } from './causalStructuralBurst.js';
import { createStructuralSurfaceMaterial } from './transientVfxMaterials.js';
import { worldSizeForPixels } from '../weapons/pixelFloor.js';
import { SHARED_MATERIAL_ROLE, stampSharedMaterialRole } from '../sharedMaterialRoles.js';

export const ARCADE_STRUCTURAL_FX_CAPACITY = Object.freeze({
  blades: 128,
  arcs: 48,
  shards: 64,
  plates: 32,
});

const DEFAULT_PRIORITY = 0.5;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const ZERO_SCALE = new THREE.Vector3(0, 0, 0);
const BLACK = new THREE.Color(0, 0, 0);

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function smoothstep(edge0, edge1, value) {
  const x = clamp01((value - edge0) / Math.max(1e-6, edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function easeOutCubic(value) {
  const x = clamp01(value);
  return 1 - (1 - x) ** 3;
}

function createBladeGeometry() { return createStructuredBurstGeometry('blade'); }
function createBrokenArcGeometry() { return createStructuredBurstGeometry('arc'); }

function createShardGeometry() {
  // An opaque irregular triangular prism. This is matter, not an emissive primitive pretending to
  // be smoke: it catches scene light, inherits momentum, tumbles, cools, and disappears only at end.
  const positions = [
    -0.55, -0.12, -0.22,
     0.52,  0.02,  0.00,
    -0.28,  0.20,  0.28,
    -0.42,  0.16, -0.16,
     0.42, -0.08,  0.04,
    -0.20, -0.18,  0.22,
  ];
  const indices = [
    0, 1, 2,
    5, 4, 3,
    0, 3, 4, 0, 4, 1,
    1, 4, 5, 1, 5, 2,
    2, 5, 3, 2, 3, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = 'SF_ArcadePhysicalShardGeometry';
  return geometry;
}

function createSlot() {
  return {
    alive: false,
    age: 0,
    // Seconds this element waits, held at zero scale, before its own life begins. One spawn call
    // can therefore author a whole beat sheet — contact, then compression, then the matter finally
    // leaving — without a second pool, a scheduler, or a per-frame revisit of the event.
    delay: 0,
    life: 0.1,
    priority: DEFAULT_PRIORITY,
    serial: -1,
    x: 0,
    y: 0.4,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    drag: 0,
    gravity: 0,
    angle: 0,
    angularVelocity: 0,
    pitch: 0,
    pitchVelocity: 0,
    roll: 0,
    rollVelocity: 0,
    length0: 1,
    length1: 1,
    width0: 1,
    width1: 1,
    minWidthPixels: 0,
    minLengthPixels: 0,
    intensity: 1,
    r0: 1,
    g0: 1,
    b0: 1,
    r1: 0,
    g1: 0,
    b1: 0,
  };
}

function makeInstanceColor(capacity) {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

class StructuralPool {
  constructor({ name, geometry, material, capacity, scene, kind }) {
    this.kind = kind;
    // Shards and plates are lit matter, not impulse light: they share the solid spawn defaults,
    // carry no shader phase channel, and draw before the additive surfaces.
    this.solid = kind === 'shard' || kind === 'plate';
    this.capacity = capacity;
    this.slots = Array.from({ length: capacity }, createSlot);
    this.cursor = 0;
    this.serial = 0;
    this.live = 0;
    this.highWater = 0;
    this.spawned = 0;
    this.evicted = 0;
    this.rejected = 0;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = makeInstanceColor(capacity);
    this.phase = this.solid ? null
      : new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    if (this.phase) {
      this.phase.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('aStructuralPhase', this.phase);
    }
    this.mesh.userData.spacefaceArcadeStructuralFx = true;
    this.mesh.renderOrder = this.solid ? 9 : 13;
    this._matrix = new THREE.Matrix4();
    this._position = new THREE.Vector3();
    this._quaternion = new THREE.Quaternion();
    this._scale = new THREE.Vector3();
    this._color = new THREE.Color();
    this._spawnStart = new THREE.Color();
    this._spawnEnd = new THREE.Color();
    this._euler = new THREE.Euler();
    this._initializeDeadInstances();
    if (scene && typeof scene.add === 'function') scene.add(this.mesh);
  }

  _initializeDeadInstances() {
    this._matrix.compose(this._position.set(0, -10000, 0), this._quaternion.identity(), ZERO_SCALE);
    for (let i = 0; i < this.capacity; i++) {
      this.mesh.setMatrixAt(i, this._matrix);
      this.mesh.setColorAt(i, BLACK);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  claim(priority = DEFAULT_PRIORITY) {
    const requested = clamp01(priority);
    for (let offset = 0; offset < this.capacity; offset++) {
      const index = (this.cursor + offset) % this.capacity;
      if (!this.slots[index].alive) {
        this.cursor = (index + 1) % this.capacity;
        this.live++;
        this.highWater = Math.max(this.highWater, this.live);
        return index;
      }
    }

    let victim = -1;
    let victimPriority = Infinity;
    let victimProgress = -Infinity;
    for (let i = 0; i < this.capacity; i++) {
      const slot = this.slots[i];
      // Progress runs from its own start, so a beat still waiting out its delay reads as negative
      // progress and is the LAST thing recycled. A later beat of an event in flight is never
      // cannibalised to draw the opening beat of the next one.
      const progress = slot.life > 1e-6 ? (slot.age - slot.delay) / slot.life : 1;
      if (slot.priority < victimPriority
        || (slot.priority === victimPriority && progress > victimProgress)) {
        victim = i;
        victimPriority = slot.priority;
        victimProgress = progress;
      }
    }
    if (victim < 0 || victimPriority > requested) {
      this.rejected++;
      return -1;
    }
    this.evicted++;
    this.cursor = (victim + 1) % this.capacity;
    return victim;
  }

  spawn(spec = {}) {
    const index = this.claim(spec.priority);
    if (index < 0) return false;
    const slot = this.slots[index];
    slot.alive = true;
    slot.age = 0;
    slot.delay = Math.max(0, finite(spec.delay, 0));
    slot.life = Math.max(0.03, finite(spec.life, 0.12));
    slot.priority = clamp01(finite(spec.priority, DEFAULT_PRIORITY));
    slot.serial = this.serial++;
    slot.x = finite(spec.x);
    slot.y = finite(spec.y, this.solid ? 0.65 : 0.45);
    slot.z = finite(spec.z);
    slot.vx = finite(spec.vx);
    slot.vy = finite(spec.vy);
    slot.vz = finite(spec.vz);
    slot.drag = Math.max(0, finite(spec.drag, this.solid ? 1.4 : 3.5));
    slot.gravity = finite(spec.gravity, this.solid ? -9 : 0);
    slot.angle = finite(spec.angle);
    slot.angularVelocity = finite(spec.angularVelocity);
    slot.pitch = finite(spec.pitch);
    slot.pitchVelocity = finite(spec.pitchVelocity);
    slot.roll = finite(spec.roll);
    slot.rollVelocity = finite(spec.rollVelocity);
    slot.length0 = Math.max(0.01, finite(spec.length0, finite(spec.length, 1)));
    slot.length1 = Math.max(0, finite(spec.length1, slot.length0));
    slot.width0 = Math.max(0.01, finite(spec.width0, finite(spec.width, 1)));
    slot.width1 = Math.max(0, finite(spec.width1, slot.width0));
    slot.minWidthPixels = Math.max(0, finite(spec.minWidthPixels));
    slot.minLengthPixels = Math.max(0, finite(spec.minLengthPixels));
    slot.intensity = Math.max(0, finite(spec.intensity, 1));
    this._spawnStart.set(spec.color == null ? 0xffffff : spec.color);
    this._spawnEnd.set(spec.endColor == null ? (spec.color == null ? 0xffffff : spec.color) : spec.endColor);
    slot.r0 = this._spawnStart.r; slot.g0 = this._spawnStart.g; slot.b0 = this._spawnStart.b;
    slot.r1 = this._spawnEnd.r; slot.g1 = this._spawnEnd.g; slot.b1 = this._spawnEnd.b;
    this.spawned++;
    return true;
  }

  update(dt, camera = null, viewportHeight = 1000) {
    const step = Math.max(0, Math.min(0.05, finite(dt)));
    const camPos = camera && camera.position;
    const fov = camera && Number.isFinite(camera.fov) ? camera.fov : 50;
    let changed = false;
    for (let i = 0; i < this.capacity; i++) {
      const slot = this.slots[i];
      if (!slot.alive) continue;
      slot.age += step;
      if (slot.age >= slot.delay + slot.life) {
        slot.alive = false;
        this.live = Math.max(0, this.live - 1);
        this._matrix.compose(this._position.set(0, -10000, 0), this._quaternion.identity(), ZERO_SCALE);
        this.mesh.setMatrixAt(i, this._matrix);
        this.mesh.setColorAt(i, BLACK);
        changed = true;
        continue;
      }
      if (slot.age < slot.delay) {
        // Reserved, not yet born: held off-stage at zero scale so the slot it already owns cannot
        // show the previous occupant, and its motion does not start integrating early.
        this._matrix.compose(this._position.set(0, -10000, 0), this._quaternion.identity(), ZERO_SCALE);
        this.mesh.setMatrixAt(i, this._matrix);
        this.mesh.setColorAt(i, BLACK);
        changed = true;
        continue;
      }

      const damping = Math.exp(-slot.drag * step);
      slot.vx *= damping;
      slot.vy = slot.vy * damping + slot.gravity * step;
      slot.vz *= damping;
      slot.x += slot.vx * step;
      slot.y += slot.vy * step;
      slot.z += slot.vz * step;
      slot.angle += slot.angularVelocity * step;
      slot.pitch += slot.pitchVelocity * step;
      slot.roll += slot.rollVelocity * step;

      const t = clamp01((slot.age - slot.delay) / slot.life);
      if (this.phase) this.phase.setXY(i, t, (slot.serial * 0.618033988749895) % 1);
      const shaped = easeOutCubic(t);
      const length = slot.length0 + (slot.length1 - slot.length0) * shaped;
      const width = slot.width0 + (slot.width1 - slot.width0) * shaped;
      const distance = camPos
        ? Math.max(0.01, Math.hypot(camPos.x - slot.x, camPos.y - slot.y, camPos.z - slot.z))
        : 144;
      const visibleWidth = Math.max(
        width,
        slot.minWidthPixels > 0
          ? worldSizeForPixels(distance, slot.minWidthPixels, fov, viewportHeight)
          : 0,
      );
      const visibleLength = Math.max(
        length,
        slot.minLengthPixels > 0
          ? worldSizeForPixels(distance, slot.minLengthPixels, fov, viewportHeight)
          : 0,
      );

      let envelope;
      if (this.solid) {
        envelope = 1 - smoothstep(0.78, 1, t);
      } else {
        const attack = smoothstep(0, 0.03, t);
        const release = 1 - smoothstep(0.62, 1, t);
        envelope = attack * release;
      }
      const r = slot.r0 + (slot.r1 - slot.r0) * shaped;
      const g = slot.g0 + (slot.g1 - slot.g0) * shaped;
      const b = slot.b0 + (slot.b1 - slot.b0) * shaped;
      const radiance = slot.intensity * envelope;
      this._color.setRGB(r * radiance, g * radiance, b * radiance);

      this._position.set(slot.x, slot.y, slot.z);
      if (this.solid) {
        this._euler.set(slot.pitch, -slot.angle, slot.roll);
        this._quaternion.setFromEuler(this._euler);
        const shrink = Math.max(0.02, envelope);
        // A plate is a SHEET: it keeps its span and stays thin through the thickness, so tumbling
        // alternately shows a broad lit face and a near-invisible edge. A shard is a lump.
        const through = this.kind === 'plate' ? Math.max(0.02, visibleWidth * 0.16) : visibleWidth;
        this._scale.set(visibleLength * shrink, through * shrink, visibleWidth * shrink);
      } else {
        this._quaternion.setFromAxisAngle(Y_AXIS, -slot.angle);
        const thickness = this.kind === 'arc' ? Math.max(0.35, visibleWidth) : 1;
        this._scale.set(visibleLength, thickness, visibleWidth);
      }
      this._matrix.compose(this._position, this._quaternion, this._scale);
      this.mesh.setMatrixAt(i, this._matrix);
      this.mesh.setColorAt(i, this._color);
      changed = true;
    }
    if (changed) {
      if (this.phase) this.phase.needsUpdate = true;
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
    // An idle pool costs nothing. Parked zero-scale instances still cost a draw call and a full
    // instance-buffer traversal every frame; four pools that are quiet most of the time do not.
    this.mesh.visible = this.live > 0;
  }

  reproject(dx, dz) {
    const ox = finite(dx);
    const oz = finite(dz);
    if (!ox && !oz) return;
    for (const slot of this.slots) {
      if (!slot.alive) continue;
      slot.x += ox;
      slot.z += oz;
    }
  }

  clear() {
    this.live = 0;
    for (const slot of this.slots) {
      slot.alive = false;
      slot.delay = 0;
      slot.age = 0;
    }
    this._initializeDeadInstances();
    this.mesh.visible = false;
  }

  inspect() {
    return {
      kind: this.kind,
      capacity: this.capacity,
      live: this.live,
      highWater: this.highWater,
      spawned: this.spawned,
      evicted: this.evicted,
      rejected: this.rejected,
      geometry: this.mesh.geometry && this.mesh.geometry.name,
    };
  }

  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    if (typeof this.mesh.dispose === 'function') this.mesh.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

function arcadeAdditiveMaterial(name) { return createStructuralSurfaceMaterial(name); }

function createStructuralPlateGeometryForPool() { return createStructuredBurstGeometry('plate'); }

function arcadePlateMaterial() {
  // Structural sheet stock. Smoother and more metallic than a shard, so a tumbling panel sweeps a
  // real highlight across its face instead of reading as one more grey chip.
  const material = stampSharedMaterialRole(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0.34,
    flatShading: true,
    side: THREE.DoubleSide,
  }), SHARED_MATERIAL_ROLE.HULL);
  material.name = 'SF_StructuralPlateMaterial';
  material.userData.spacefaceArcadeVfxMaterial = true;
  return material;
}

function arcadeShardMaterial() {
  const material = stampSharedMaterialRole(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.16,
    flatShading: true,
  }), SHARED_MATERIAL_ROLE.HULL);
  material.name = 'SF_ArcadePhysicalShardMaterial';
  material.userData.spacefaceArcadeVfxMaterial = true;
  return material;
}

export class ArcadeStructuralFx {
  constructor(scene = null, options = {}) {
    const capacities = { ...ARCADE_STRUCTURAL_FX_CAPACITY, ...(options.capacities || {}) };
    this.group = new THREE.Group();
    this.group.name = 'SF_ArcadeStructuralFx';
    this.group.userData.spacefaceArcadeStructuralFx = true;
    if (scene && typeof scene.add === 'function') scene.add(this.group);
    this.blades = new StructuralPool({
      name: 'SF_ArcadeBladePool',
      geometry: createBladeGeometry(),
      material: arcadeAdditiveMaterial('SF_ArcadeBladeMaterial'),
      capacity: capacities.blades,
      scene: this.group,
      kind: 'blade',
    });
    this.arcs = new StructuralPool({
      name: 'SF_ArcadeBrokenArcPool',
      geometry: createBrokenArcGeometry(),
      material: arcadeAdditiveMaterial('SF_ArcadeBrokenArcMaterial'),
      capacity: capacities.arcs,
      scene: this.group,
      kind: 'arc',
    });
    this.shards = new StructuralPool({
      name: 'SF_ArcadePhysicalShardPool',
      geometry: createShardGeometry(),
      material: arcadeShardMaterial(),
      capacity: capacities.shards,
      scene: this.group,
      kind: 'shard',
    });
    this.plates = new StructuralPool({
      name: 'SF_StructuralPlatePool',
      geometry: createStructuralPlateGeometryForPool(),
      material: arcadePlateMaterial(),
      capacity: capacities.plates,
      scene: this.group,
      kind: 'plate',
    });
    // Supporting layers, attached by the renderer. They are composed BY the impact recipe and must
    // never subscribe to the same simulation event themselves — that is what used to stack three
    // bursts on one contact.
    this._gas = null;
    this._debris = null;
    // One resident spawn spec so composing an impact allocates nothing per element.
    this._impactSpec = {
      priority: DEFAULT_PRIORITY, life: 0.12, delay: 0,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      drag: NaN, gravity: NaN,
      angle: 0, angularVelocity: 0, pitch: 0, pitchVelocity: 0, roll: 0, rollVelocity: 0,
      length0: 1, length1: 1, width0: 1, width1: 1,
      minWidthPixels: 0, minLengthPixels: 0,
      intensity: 1, color: 0xffffff, endColor: 0xffffff,
    };
    this._disposed = false;
  }

  spawnBlade(spec) { return this.blades.spawn(spec); }
  spawnArc(spec) { return this.arcs.spawn(spec); }
  spawnShard(spec) { return this.shards.spawn(spec); }
  spawnPlate(spec) { return this.plates.spawn(spec); }

  /**
   * Bind the gas and debris layers. Both are optional and both are called through a guarded
   * optional call, so this lane's work lands whether or not they exist yet.
   * @param {{gas?: {emitFromImpact?: Function}, debris?: {emitFromImpact?: Function}}} layers
   */
  attachSupportingLayers(layers = {}) {
    this._gas = layers.gas || null;
    this._debris = layers.debris || null;
    return this;
  }

  /**
   * THE composition point for a contact. One simulation event becomes ONE recipe: this lane's
   * authored ignition and structure first, then the gas layer's material, then the debris layer's
   * solids. Primary structure is admitted before decorative residue, so under saturation the thing
   * that carries the meaning of the hit is the thing that survives.
   *
   * @param {object} rec an impact record, WORLD space (see `impactEventRecord.js`). Passed to the
   *   supporting layers untouched — they localise for themselves.
   * @param {object} [view] caller-owned, reused: `{ x, y, z, priority, reduced, forcedColors,
   *   hero }` where x/y/z are the contact point already in the renderer's local (floating-origin)
   *   frame. Omit it and the record's own world coordinates are used.
   * @returns {number} primitives this lane spawned.
   */
  emitImpact(rec, view) {
    if (!rec) return 0;
    const spawned = spawnImpactStructuralBeats({
      fx: this,
      rec,
      spec: this._impactSpec,
      lx: view && Number.isFinite(view.x) ? view.x : rec.x,
      ly: view && Number.isFinite(view.y) ? view.y : rec.y,
      lz: view && Number.isFinite(view.z) ? view.z : rec.z,
      priority: view && Number.isFinite(view.priority) ? view.priority : DEFAULT_PRIORITY,
      reduced: !!(view && view.reduced),
      forcedColors: !!(view && view.forcedColors),
      hero: !!(view && view.hero),
    });
    if (this._gas?.emitFromImpact) this._gas.emitFromImpact(rec);
    if (this._debris?.emitFromImpact) this._debris.emitFromImpact(rec);
    return spawned;
  }

  update(dt, camera = null, viewportHeight = 1000) {
    this.blades.update(dt, camera, viewportHeight);
    this.arcs.update(dt, camera, viewportHeight);
    this.shards.update(dt, camera, viewportHeight);
    this.plates.update(dt, camera, viewportHeight);
  }

  reproject(dx, dz) {
    this.blades.reproject(dx, dz);
    this.arcs.reproject(dx, dz);
    this.shards.reproject(dx, dz);
    this.plates.reproject(dx, dz);
  }

  clear() {
    this.blades.clear();
    this.arcs.clear();
    this.shards.clear();
    this.plates.clear();
  }

  getMeshes() {
    return [this.blades.mesh, this.arcs.mesh, this.shards.mesh, this.plates.mesh];
  }

  getOwnerRoots() {
    return [this.group];
  }

  stats() {
    return {
      blades: {
        highWater: this.blades.highWater,
        live: this.blades.live,
        capacity: this.blades.capacity,
        spawned: this.blades.spawned,
        evicted: this.blades.evicted,
        rejected: this.blades.rejected,
      },
      arcs: {
        highWater: this.arcs.highWater,
        live: this.arcs.live,
        capacity: this.arcs.capacity,
        spawned: this.arcs.spawned,
        evicted: this.arcs.evicted,
        rejected: this.arcs.rejected,
      },
      shards: {
        highWater: this.shards.highWater,
        live: this.shards.live,
        capacity: this.shards.capacity,
        spawned: this.shards.spawned,
        evicted: this.shards.evicted,
        rejected: this.shards.rejected,
      },
      plates: {
        highWater: this.plates.highWater,
        live: this.plates.live,
        capacity: this.plates.capacity,
        spawned: this.plates.spawned,
        evicted: this.plates.evicted,
        rejected: this.plates.rejected,
      },
    };
  }

  inspect() {
    return {
      schema: 'spaceface.arcadeStructuralFx.v1',
      live: {
        blades: this.blades.live,
        arcs: this.arcs.live,
        shards: this.shards.live,
        plates: this.plates.live,
      },
      highWater: {
        blades: this.blades.highWater,
        arcs: this.arcs.highWater,
        shards: this.shards.highWater,
        plates: this.plates.highWater,
      },
      stats: this.stats(),
      pools: {
        blades: this.blades.inspect(),
        arcs: this.arcs.inspect(),
        shards: this.shards.inspect(),
        plates: this.plates.inspect(),
      },
    };
  }

  contextLossResources() {
    return [
      this.group,
      this.blades.mesh, this.blades.mesh.geometry, this.blades.mesh.material,
      this.arcs.mesh, this.arcs.mesh.geometry, this.arcs.mesh.material,
      this.shards.mesh, this.shards.mesh.geometry, this.shards.mesh.material,
      this.plates.mesh, this.plates.mesh.geometry, this.plates.mesh.material,
    ];
  }

  handleContextLost() {
    this.dispose();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.blades.dispose();
    this.arcs.dispose();
    this.shards.dispose();
    this.plates.dispose();
    this._gas = null;
    this._debris = null;
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
