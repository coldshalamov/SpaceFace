import * as THREE from 'three';
import { worldSizeForPixels } from '../weapons/pixelFloor.js';

export const ARCADE_STRUCTURAL_FX_CAPACITY = Object.freeze({
  blades: 128,
  arcs: 48,
  shards: 64,
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

function createBladeGeometry() {
  // A deliberately graphic five-point blade. It carries a readable silhouette at the chase camera;
  // there is no radial alpha field and no camera-facing sprite hidden inside the implementation.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.50, 0, -0.07,
    -0.12, 0, -0.50,
     0.50, 0,  0.00,
    -0.12, 0,  0.50,
    -0.50, 0,  0.07,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 4, 2, 3, 4]);
  geometry.computeVertexNormals();
  geometry.name = 'SF_ArcadeBladeGeometry';
  return geometry;
}

function createBrokenArcGeometry(segments = 10) {
  // A partial arc rather than a full shock ring. The open ends and asymmetric sweep keep it from
  // becoming the generic expanding-circle language explicitly rejected by the art direction.
  const positions = [];
  const indices = [];
  const start = -0.72;
  const sweep = 1.44;
  const halfWidth = 0.075;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = start + sweep * t;
    const taper = 0.35 + Math.sin(Math.PI * t) * 0.65;
    const inner = 1 - halfWidth * taper;
    const outer = 1 + halfWidth * taper;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    positions.push(c * inner, 0, s * inner, c * outer, 0, s * outer);
    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = 'SF_ArcadeBrokenArcGeometry';
  return geometry;
}

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
    this.capacity = capacity;
    this.slots = Array.from({ length: capacity }, createSlot);
    this.cursor = 0;
    this.serial = 0;
    this.live = 0;
    this.spawned = 0;
    this.evicted = 0;
    this.rejected = 0;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = makeInstanceColor(capacity);
    this.mesh.userData.spacefaceArcadeStructuralFx = true;
    this.mesh.renderOrder = kind === 'shard' ? 9 : 13;
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
        return index;
      }
    }

    let victim = -1;
    let victimPriority = Infinity;
    let victimProgress = -Infinity;
    for (let i = 0; i < this.capacity; i++) {
      const slot = this.slots[i];
      const progress = slot.life > 1e-6 ? slot.age / slot.life : 1;
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
    slot.life = Math.max(0.03, finite(spec.life, 0.12));
    slot.priority = clamp01(finite(spec.priority, DEFAULT_PRIORITY));
    slot.serial = this.serial++;
    slot.x = finite(spec.x);
    slot.y = finite(spec.y, this.kind === 'shard' ? 0.65 : 0.45);
    slot.z = finite(spec.z);
    slot.vx = finite(spec.vx);
    slot.vy = finite(spec.vy);
    slot.vz = finite(spec.vz);
    slot.drag = Math.max(0, finite(spec.drag, this.kind === 'shard' ? 1.4 : 3.5));
    slot.gravity = finite(spec.gravity, this.kind === 'shard' ? -9 : 0);
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
    this._spawnStart.set(spec.color || '#ffffff');
    this._spawnEnd.set(spec.endColor || spec.color || '#ffffff');
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
      if (slot.age >= slot.life) {
        slot.alive = false;
        this.live = Math.max(0, this.live - 1);
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

      const t = clamp01(slot.age / slot.life);
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
      if (this.kind === 'shard') {
        envelope = 1 - smoothstep(0.78, 1, t);
      } else {
        const attack = smoothstep(0, 0.08, t);
        const release = 1 - smoothstep(0.48, 1, t);
        envelope = attack * release;
      }
      const r = slot.r0 + (slot.r1 - slot.r0) * shaped;
      const g = slot.g0 + (slot.g1 - slot.g0) * shaped;
      const b = slot.b0 + (slot.b1 - slot.b0) * shaped;
      const radiance = slot.intensity * envelope;
      this._color.setRGB(r * radiance, g * radiance, b * radiance);

      this._position.set(slot.x, slot.y, slot.z);
      if (this.kind === 'shard') {
        this._euler.set(slot.pitch, -slot.angle, slot.roll);
        this._quaternion.setFromEuler(this._euler);
        const shrink = Math.max(0.02, envelope);
        this._scale.set(visibleLength * shrink, visibleWidth * shrink, visibleWidth * shrink);
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
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
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
    for (const slot of this.slots) slot.alive = false;
    this._initializeDeadInstances();
  }

  inspect() {
    return {
      kind: this.kind,
      capacity: this.capacity,
      live: this.live,
      spawned: this.spawned,
      evicted: this.evicted,
      rejected: this.rejected,
      geometry: this.mesh.geometry && this.mesh.geometry.name,
    };
  }

  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

function arcadeAdditiveMaterial(name) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.name = name;
  material.userData.spacefaceArcadeVfxMaterial = true;
  return material;
}

function arcadeShardMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.16,
    flatShading: true,
  });
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
    this._disposed = false;
  }

  spawnBlade(spec) { return this.blades.spawn(spec); }
  spawnArc(spec) { return this.arcs.spawn(spec); }
  spawnShard(spec) { return this.shards.spawn(spec); }

  update(dt, camera = null, viewportHeight = 1000) {
    this.blades.update(dt, camera, viewportHeight);
    this.arcs.update(dt, camera, viewportHeight);
    this.shards.update(dt, camera, viewportHeight);
  }

  reproject(dx, dz) {
    this.blades.reproject(dx, dz);
    this.arcs.reproject(dx, dz);
    this.shards.reproject(dx, dz);
  }

  clear() {
    this.blades.clear();
    this.arcs.clear();
    this.shards.clear();
  }

  getMeshes() {
    return [this.blades.mesh, this.arcs.mesh, this.shards.mesh];
  }

  getOwnerRoots() {
    return [this.group];
  }

  inspect() {
    return {
      schema: 'spaceface.arcadeStructuralFx.v1',
      live: {
        blades: this.blades.live,
        arcs: this.arcs.live,
        shards: this.shards.live,
      },
      pools: {
        blades: this.blades.inspect(),
        arcs: this.arcs.inspect(),
        shards: this.shards.inspect(),
      },
    };
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.blades.dispose();
    this.arcs.dispose();
    this.shards.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
