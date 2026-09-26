import * as THREE from 'three';
import { BatchedParticleRenderer, ParticleSystem, ConstantValue, RenderMode } from 'three.quarks';

const TAU = Math.PI * 2;
const KINDS = ['well', 'repulsor', 'cone', 'skim', 'seed', 'heat', 'current', 'repair', 'transfer', 'goo'];
const COLORS = [
  [0.38, 0.52, 1.4], [1.4, 0.38, 0.10], [0.30, 0.90, 1.35],
  [0.18, 1.20, 0.88], [0.65, 0.40, 1.25], [1.55, 0.52, 0.08],
  [0.42, 0.80, 1.50], [0.28, 1.35, 0.72], [0.72, 0.48, 1.40], [0.38, 0.74, 0.12],
];
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
// Cosmetic event/ordinal stream. No shared/global RNG state, including Quarks emitters.
function unit(seed, ordinal) {
  let n = (Math.trunc(seed * 65536) ^ Math.imul(ordinal + 1, 0x9e3779b1)) >>> 0;
  n = Math.imul(n ^ n >>> 16, 0x7feb352d);
  n = Math.imul(n ^ n >>> 15, 0x846ca68b);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}

function streakGeometry() {
  const positions = [], uv = [], indices = [];
  // Two twisted, intersecting tapered leaves, with real cross-section and no camera-facing axis.
  for (let leaf = 0; leaf < 2; leaf++) {
    const start = positions.length / 3;
    for (let i = 0; i <= 8; i++) {
      const u = i / 8, taper = Math.pow(Math.sin(u * Math.PI), 0.7);
      const twist = leaf * Math.PI / 2 + u * 0.8;
      for (let side = -1; side <= 1; side += 2) {
        positions.push(u - 0.5, Math.cos(twist) * side * taper * 0.5,
          Math.sin(twist) * side * taper * 0.5);
        uv.push(u, (side + 1) / 2);
      }
      if (i < 8) {
        const a = start + i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Custom zero emitter avoids PointEmitter's ambient random sampling. Transport owns launch pose.
const STILL_EMITTER = {
  type: 'spaceface-force', update() {},
  initialize(p) { p.position.set(0, 0, 0); p.velocity.set(0, 0, 0); },
};
const WHITE = {
  type: 'color', startGen() {}, genColor(_memory, out) { out.set(1, 1, 1, 1); },
};

// m: kind, origin XYZ, heading XZ, reach, phase, variation, strength, transport age, length, width.
function trajectory(m, t, out) {
  const kind = m[0], reach = m[6], phase = m[7], variety = m[8];
  const ease = 1 - Math.pow(1 - t, 2.1), envelope = Math.sin(Math.PI * t);
  let along = 0, across = 0, height = 0;
  if (kind === 0 || kind === 4 || kind === 7) {
    // Captured matter accelerates inward; repair converges without a gravity orbit.
    let r = reach * (0.82 + variety * 0.16) * Math.pow(1 - t, kind === 0 ? 1.35 : 1.8);
    let a = phase + (kind === 0 ? -3.8 * ease : kind === 4 ? 0.45 * envelope : 0.12 * envelope);
    if (kind === 4 && t > 0.66) r += reach * (t - 0.66) * 0.25;
    along = Math.cos(a) * r; across = Math.sin(a) * r;
    height = reach * (kind === 0 ? 0.075 : 0.025) * envelope * Math.sin(a);
  } else if (kind === 1 || kind === 5) {
    // Fast separation, decelerating wake, then cooling. Heat curls in the expelled material.
    const r = reach * (0.07 + ease * (0.72 + variety * 0.22));
    const a = phase + (kind === 5 ? 0.26 * Math.sin(t * 6 + variety * 8) * envelope : 0.045 * envelope);
    along = Math.cos(a) * r; across = Math.sin(a) * r;
    height = reach * (kind === 5 ? 0.12 : 0.03) * envelope * Math.sin(phase * 1.7);
  } else if (kind === 9) {
    // A parcel creeps through the tar, pulls into a short viscous neck, then settles back
    // into the same lobe. It neither converges like repair nor launches like hot ejecta.
    const r = reach * (0.20 + variety * 0.48 + ease * 0.10 + envelope * 0.025);
    const a = phase + ease * 0.12 + envelope * Math.sin(phase * 2) * 0.045;
    along = Math.cos(a) * r; across = Math.sin(a) * r;
    height = reach * 0.055 * envelope * envelope * (0.65 + variety * 0.35);
  } else {
    const spread = kind === 2 ? 0.36 : kind === 3 ? 0.09 : kind === 6 ? 0.065 : 0.045;
    along = reach * (0.02 + ease * 0.94);
    across = reach * ((variety - 0.5) * spread * ease
      + Math.sin(t * (kind === 6 ? 27 : 8) + phase) * spread * envelope * 0.38);
    if (kind === 2) across = clamp(across, -along * Math.tan(m[13]) * 0.95, along * Math.tan(m[13]) * 0.95);
    if (kind === 3) across = clamp(across, -m[14] * 0.95, m[14] * 0.95);
    height = reach * (kind === 3 ? 0.06 : 0.02) * envelope * Math.cos(t * 9 + phase);
  }
  out.set(m[1] + m[4] * along - m[5] * across, m[2] + height,
    m[3] + m[5] * along + m[4] * across);
}

class TransportBehavior {
  constructor(owner) {
    this.type = 'SpaceFaceForceTransport'; this.owner = owner;
    this.next = new THREE.Vector3(); this.axis = new THREE.Vector3();
    this.forward = new THREE.Vector3(1, 0, 0);
  }
  initialize(p) {
    const owner = this.owner, event = owner.event, ordinal = owner.ordinal++;
    const m = p.forceFlow || (p.forceFlow = new Float64Array(15));
    const variety = unit(event.seed, ordinal * 3), phase = unit(event.seed, ordinal * 3 + 1) * TAU;
    m[0] = event.kind; m[1] = event.x; m[2] = event.y; m[3] = event.z;
    m[4] = event.dx; m[5] = event.dz; m[6] = event.radius; m[7] = phase; m[8] = variety;
    m[9] = event.strength; m[10] = event.age;
    m[11] = clamp(event.radius * (0.065 + variety * 0.055), 0.65, 4.5);
    m[12] = clamp(m[11] * (0.042 + unit(event.seed, ordinal * 3 + 2) * 0.025), 0.045, 0.22);
    if (event.kind === 9) m[12] = m[11] * (0.16 + variety * 0.045);
    m[13] = event.halfAngle; m[14] = event.halfWidth;
    p.life = event.life * (0.74 + variety * 0.26);
    p.age = Math.min(p.life, event.age);
    m[10] = p.age;
    p.velocity.set(0, 0, 0);
    this.update(p, 0);
  }
  update(p, dt) {
    const m = p.forceFlow, owner = this.owner;
    const age = Math.min(p.life, p.age + dt), t = age / p.life;
    if (!owner.reducedMotion) m[10] = Math.min(p.life, m[10] + dt);
    const travel = m[10] / p.life;
    trajectory(m, travel, p.position);
    trajectory(m, Math.min(1, travel + 0.005), this.next);
    this.axis.copy(this.next).sub(p.position);
    if (this.axis.lengthSq() > 1e-10) {
      this.axis.normalize(); p.rotation.setFromUnitVectors(this.forward, this.axis);
    }
    const cooling = Math.pow(1 - t, 1.6), launch = Math.min(1, 0.22 + t * 12);
    // Width/length follow the transported parcel, independent of lifecycle fade under reduced motion.
    const shape = travel;
    p.size.set(m[11] * (0.78 + 0.46 * Math.sin(shape * Math.PI)) * (1 - shape * 0.43),
      m[12] * (1 - shape * 0.56), m[12] * (1 - shape * 0.56));
    const viscous = m[0] === 9, stretch = Math.sin(shape * Math.PI);
    if (viscous) {
      // Stretch the lifted neck while narrowing its cross-section, then flatten on rejoining.
      p.size.set(m[11] * (0.80 + stretch * 1.15), m[12] / (1 + stretch * 0.75),
        m[12] / (1 + stretch * 0.75));
    }
    const rgb = COLORS[m[0]], hot = (viscous ? 0.22 + cooling * 0.72 + stretch * 0.26 : 0.24 + cooling * 2.3)
      * m[9] * (owner.reducedFlash ? 0.36 : 1);
    const ember = m[0] === 5 ? t : 0;
    p.color.set(rgb[0] * hot, rgb[1] * hot * (1 - ember * 0.65),
      rgb[2] * hot * (1 - ember * 0.85), launch * cooling * (0.52 + m[8] * 0.22));
  }
  frameUpdate() {} reset() {}
}

/** Bounded, seeded parcel transport on the production Quarks mesh runtime. Parent must be identity. */
export class ForceParticleFlow {
  constructor(parent, { capacity = 384 } = {}) {
    this.capacity = clamp(Math.floor(finite(capacity, 384)), 1, 2048);
    this.disposed = false; this.ordinal = 0; this.reducedMotion = false; this.reducedFlash = false;
    this.event = { kind: 0, x: 0, y: 0.5, z: 0, dx: 1, dz: 0, radius: 10, seed: 0, strength: 1, life: 0.8,
      halfAngle: 0.56, halfWidth: 52, age: 0 };
    this.geometry = streakGeometry(); this.matrix = new THREE.Matrix4();
    this.material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    this.renderer = new BatchedParticleRenderer(); this.renderer.name = 'SF_ForceParticleTransport';
    this.behavior = new TransportBehavior(this);
    this.system = new ParticleSystem({ duration: 1, looping: false, onlyUsedByOther: true,
      startLife: new ConstantValue(1), startSpeed: new ConstantValue(0), startSize: new ConstantValue(1),
      startColor: WHITE, startRotation: new ConstantValue(0), shape: STILL_EMITTER,
      emissionOverTime: new ConstantValue(0), emissionOverDistance: new ConstantValue(0),
      worldSpace: true, renderMode: RenderMode.Mesh, instancingGeometry: this.geometry,
      material: this.material, behaviors: [this.behavior], renderOrder: 17 });
    this.renderer.addSystem(this.system);
    // addSystem already registered the exact renderer settings. Leaving this constructor flag
    // set makes Quarks delete/re-add during Map.forEach, advancing the first live frame twice.
    this.system.neededToUpdateRender = false;
    this.batch = this.renderer.batches[this.renderer.systemToBatchIndex.get(this.system)];
    this.batch.maxParticles = this.capacity; this.batch.setupBuffers();
    // Quarks owns instancing and transforms; this response only filters the actual leaf silhouette.
    const mat = this.batch.material;
    mat.name = 'SF_FilteredForceParticleTransport'; mat.toneMapped = false;
    mat.vertexShader = `varying vec2 vForceUv;\n${mat.vertexShader}`
      .replace('void main() {', 'void main() { vForceUv = uv;');
    mat.fragmentShader = `varying vec2 vForceUv;\n${mat.fragmentShader}`.replace(
      'vec4 diffuseColor = vColor;', `vec4 diffuseColor = vColor;
      float across = abs(vForceUv.y * 2.0 - 1.0);
      float coverage = 1.0 - smoothstep(max(0.0, 1.0-max(0.40, fwidth(across)*1.25)), 1.0, across);
      float tipAA = max(fwidth(vForceUv.x), 0.025);
      coverage *= smoothstep(0.0, tipAA, vForceUv.x) * (1.0 - smoothstep(1.0-tipAA, 1.0, vForceUv.x));
      diffuseColor.a *= coverage;
      diffuseColor.rgb *= 0.48 + 0.52 * (1.0 - across * across);`);
    mat.needsUpdate = true;
    this.renderer.frustumCulled = false; this.batch.frustumCulled = false;
    // Warm all particle-owned memory once; bursts recycle these objects without allocations.
    this.system.spawn(this.capacity, this.system.emissionState, this.matrix);
    this.system.particleNum = 0; this.batch.geometry.instanceCount = 0;
    this.renderer.visible = false;
    if (parent) parent.add(this.renderer, this.system.emitter);
  }
  get live() { return this.disposed ? 0 : this.system.particleNum; }
  emit({ kind, x, z, y = 0.5, dx = 1, dz = 0, radius = 10, seed = 0, count = 8, life = 0.8, strength = 1,
    halfAngle = 0.56, halfWidth = 52, age = 0, deferUpload = false } = {}) {
    const code = KINDS.indexOf(kind);
    if (this.disposed || code < 0 || !Number.isFinite(x) || !Number.isFinite(z) || !(strength > 0)) return 0;
    const n = Math.min(this.capacity - this.live, Math.max(0, Math.floor(finite(count))));
    if (!n) return 0;
    const event = this.event, len = Math.hypot(finite(dx), finite(dz)) || 1;
    event.kind = code; event.x = x; event.y = finite(y, 0.5); event.z = z;
    event.dx = finite(dx, 1) / len; event.dz = finite(dz) / len;
    if (!event.dx && !event.dz) event.dx = 1;
    event.radius = clamp(finite(radius, 10), 0.2, 2000); event.seed = finite(seed);
    event.strength = clamp(finite(strength, 1), 0, 3); event.life = clamp(finite(life, 0.8), 0.08, 3);
    event.age = Math.max(0, finite(age));
    event.halfAngle = clamp(finite(halfAngle, 0.56), 0.001, 1.55);
    event.halfWidth = Math.max(0.001, finite(halfWidth, 52));
    this.ordinal = 0;
    const first = this.live;
    this.system.spawn(n, this.system.emissionState, this.matrix);
    // Continuous fields can sample an absolute local age into these recycled objects. This
    // makes rewind/culling/rebase exact without replaying missed emissions or allocating history.
    for (let i = first; i < this.live;) {
      if (this.system.particles[i].age >= this.system.particles[i].life) {
        const last = --this.system.particleNum, expired = this.system.particles[i];
        this.system.particles[i] = this.system.particles[last]; this.system.particles[last] = expired;
      } else i++;
    }
    // Callers emit after their update phase. Publish this burst immediately, including when
    // the next simulation frame is paused; uploading is not a lifecycle/transport step.
    if (!deferUpload) this.publish();
    return this.live - first;
  }
  publish() {
    if (this.disposed) return;
    this.batch.update();
    this.renderer.visible = this.live > 0;
  }
  update(dt, { reducedMotion = false, reducedFlash = false } = {}) {
    if (this.disposed) return;
    this.reducedMotion = reducedMotion; this.reducedFlash = reducedFlash;
    if (!Number.isFinite(dt) || dt <= 0 || !this.live) return;
    // Quarks caps a step at .1s; subdivide so retirement still follows elapsed simulation time.
    let remaining = Math.min(dt, 3.1);
    while (remaining > 1e-8 && this.live) {
      const step = Math.min(0.05, remaining);
      this.renderer.update(step); remaining -= step;
    }
    this.renderer.visible = this.live > 0;
  }
  reproject(dx, dz) {
    if (this.disposed || !Number.isFinite(dx) || !Number.isFinite(dz)) return;
    for (let i = 0; i < this.live; i++) {
      const p = this.system.particles[i]; p.forceFlow[1] += dx; p.forceFlow[3] += dz;
      p.position.x += dx; p.position.z += dz;
    }
    // Upload without advancing lifecycle or transport, including paused origin shifts.
    this.batch.update();
  }
  clear() {
    if (this.disposed) return;
    this.system.particleNum = 0; this.batch.geometry.instanceCount = 0; this.renderer.visible = false;
  }
  dispose() {
    if (this.disposed) return;
    this.clear(); this.disposed = true;
    this.system.dispose(); this.batch.material.dispose(); this.batch.dispose();
    this.geometry.dispose(); this.material.dispose(); this.renderer.removeFromParent();
    this.renderer.batches.length = 0; this.renderer.systemToBatchIndex.clear();
  }
}
