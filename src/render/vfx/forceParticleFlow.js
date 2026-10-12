import * as THREE from 'three';
import { materialFieldsForScene } from './materialEnvironment.js';
import { registerMaterialOwner, unregisterMaterialOwner, createMaterialContactRead } from './materialDirector.js';
import { MATERIAL_FLOW_KINDS as KINDS, MATERIAL_FLOW_RECIPES } from './livingVfxCatalog.js';
import { MATERIAL_STATE_SIZE, seedMaterialParcel, settleMaterialParcel, advanceMaterialParcel, writeMaterialPosition } from './materialFlow.js';
import { BatchedParticleRenderer, ParticleSystem, ConstantValue, RenderMode } from 'three.quarks';

const TAU = Math.PI * 2;
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

// Per-parcel environment contact snapshot: up to 3 records × 8 fields
// (x, z, radius, vx, vz, material, strength, spare). Floats only — no live producer reference.
const CONTACT_STRIDE = 8, CONTACT_CAPACITY = 3;

class TransportBehavior {
  constructor(owner) {
    this.type = 'SpaceFaceForceTransport'; this.owner = owner;
    this.axis = new THREE.Vector3();
    this.velocity = new Float64Array(3); this.curlScratch = new Float64Array(6);
    this.forward = new THREE.Vector3(1, 0, 0);
  }
  initialize(p) {
    const owner = this.owner, event = owner.event, ordinal = owner.ordinal++;
    const m = p.forceFlow || (p.forceFlow = new Float64Array(15));
    const contacts = p.forceContacts || (p.forceContacts = new Float64Array(CONTACT_STRIDE * CONTACT_CAPACITY));
    let contactCount = 0;
    const env = event.environment;
    if (env && env.records) {
      // Snapshot the first CONTACT_CAPACITY valid records only. Malformed or strength-0 records
      // must not become origin colliders or leak NaN into the transport.
      const available = Number.isFinite(env.count) ? Math.min(env.count, env.records.length)
        : env.records.length;
      for (let i = 0; i < Math.min(CONTACT_CAPACITY, available); i++) {
        const r = env.records[i];
        if (r == null || !Number.isFinite(r.x) || !Number.isFinite(r.z)
          || !Number.isFinite(r.radius) || !(r.radius > 0)) continue;
        const strength = r.strength == null ? 1 : finite(r.strength);
        if (!(strength > 0)) continue;
        const o = contactCount * CONTACT_STRIDE;
        contacts[o] = r.x; contacts[o + 1] = r.z; contacts[o + 2] = r.radius;
        contacts[o + 3] = finite(r.vx); contacts[o + 4] = finite(r.vz);
        contacts[o + 5] = finite(r.material); contacts[o + 6] = Math.min(1, strength);
        contactCount++;
      }
    }
    p.forceContactCount = contactCount;
    p.forceContactHeat = 0;
    p.forceFlowInit = false;
    const variety = unit(event.seed, ordinal * 3), phase = unit(event.seed, ordinal * 3 + 1) * TAU;
    m[0] = event.kind; m[1] = event.x; m[2] = event.y; m[3] = event.z;
    m[4] = event.dx; m[5] = event.dz; m[6] = event.radius; m[7] = phase; m[8] = variety;
    m[9] = event.strength; m[10] = event.age;
    m[11] = clamp(event.radius * (0.065 + variety * 0.055), 0.65, 24.0);
    m[12] = clamp(m[11] * (0.085 + unit(event.seed, ordinal * 3 + 2) * 0.015), 0.055, 2.30);
    if (event.kind === 9) m[12] = m[11] * (0.16 + variety * 0.045);
    m[13] = event.halfAngle; m[14] = event.halfWidth;
    p.life = event.life * (0.74 + variety * 0.26);
    p.age = Math.min(p.life, event.age);
    m[10] = p.age;
    const k = p.forceKinematics || (p.forceKinematics = new Float64Array(MATERIAL_STATE_SIZE));
    seedMaterialParcel(m, k, p.life, Math.trunc(event.seed * 65536), this.velocity, this.curlScratch);
    settleMaterialParcel(m, k, p.life, contacts, contactCount);
    // Absolute-age admissions (culled/reconstructed fields) replay the identical bounded solver.
    advanceMaterialParcel(m, k, p.life, p.age, contacts, contactCount, this.velocity, this.curlScratch);
    p.velocity.set(0, 0, 0);
    this.update(p, 0);
  }
  update(p, dt) {
    const m = p.forceFlow, owner = this.owner;
    const age = Math.min(p.life, p.age + dt), t = age / p.life;
    const k = p.forceKinematics;
    if (!owner.reducedMotion) advanceMaterialParcel(m, k, p.life, dt,
      p.forceContacts, p.forceContactCount, this.velocity, this.curlScratch, owner.ambientFields);
    m[10] = k[6];
    const travel = m[10] / p.life;
    const viscous = m[0] === 9, shape = travel, stretch = Math.sin(shape * Math.PI);
    // Reduced motion freezes the fully adjusted pose — trajectory, contact deflection, size and
    // orientation — bitwise. Recomputing the same pose could flip a ulp and break exact rebases.
    if (!(owner.reducedMotion && p.forceFlowInit)) {
      writeMaterialPosition(m, k, p.position);
      p.forceContactHeat = k[8];
      this.axis.set(m[4] * k[3] - m[5] * k[5], k[4], m[5] * k[3] + m[4] * k[5]);
      if (this.axis.lengthSq() > 1e-10) {
        this.axis.normalize(); p.rotation.setFromUnitVectors(this.forward, this.axis);
      }
      // Width/length follow the transported parcel, independent of lifecycle fade under reduced
      // motion. Differential stretch broadens energy parcels mid-flight while staying streaks.
      const bulge = viscous ? 0 : 0.38 * stretch;
      p.size.set(m[11] * (0.78 + 0.46 * stretch) * (1 - shape * 0.43) * (1 + bulge * 0.55),
        m[12] * (1 - shape * 0.56) * (1 + bulge), m[12] * (1 - shape * 0.56) * (1 + bulge));
      if (viscous) {
        // Stretch the lifted neck while narrowing its cross-section, then flatten on rejoining.
        p.size.set(m[11] * (0.80 + stretch * 1.15), m[12] / (1 + stretch * 0.75),
          m[12] / (1 + stretch * 0.75));
      }
      p.forceFlowInit = true;
    }
    const cooling = Math.pow(1 - t, MATERIAL_FLOW_RECIPES[m[0]].cooling), launch = Math.min(1, 0.22 + t * 12);
    // A single slow flare crests once per parcel then cools — no strobing. Surface contact
    // adds local heat where the parcel actually touches a body snapshot.
    const flare = Math.exp(-Math.pow((t - (0.18 + m[8] * 0.22)) / 0.14, 2));
    const rgb = MATERIAL_FLOW_RECIPES[m[0]].rgb, hot = (viscous
      ? 0.22 + cooling * 0.72 + stretch * 0.26
      : (0.24 + cooling * 2.3) * (1 + flare * 0.9) + p.forceContactHeat * 1.1)
      * m[9] * (owner.reducedFlash ? 0.36 : 1);
    const ember = m[0] === 5 ? t : 0;
    p.color.set(rgb[0] * hot, rgb[1] * hot * (1 - ember * 0.65),
      rgb[2] * hot * (1 - ember * 0.85), launch * cooling * (0.52 + m[8] * 0.22) * k[14]);
  }
  frameUpdate() {} reset() {}
}

/** Bounded, seeded parcel transport on the production Quarks mesh runtime. Parent must be identity. */
export class ForceParticleFlow {
  constructor(parent, { capacity = 384 } = {}) {
    this.capacity = clamp(Math.floor(finite(capacity, 384)), 1, 2048);
    this.disposed = false; this.ordinal = 0; this.reducedMotion = false; this.reducedFlash = false;
    this.event = { kind: 0, x: 0, y: 0.5, z: 0, dx: 1, dz: 0, radius: 10, seed: 0, strength: 1, life: 0.8,
      halfAngle: 0.56, halfWidth: 52, age: 0, environment: null };
    this.stats = { emitted: 0, dropped: 0, updates: 0 };
    this.contactLight = createMaterialContactRead(); this._materialScene = null;
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
    this.flowShape = new Float32Array(this.capacity * 4);
    this.flowShapeAttribute = new THREE.InstancedBufferAttribute(this.flowShape, 4).setUsage(THREE.DynamicDrawUsage);
    this.batch.geometry.setAttribute('aFlowShape', this.flowShapeAttribute);
    this.flowTail = new Float32Array(this.capacity * 3); this.flowMid = new Float32Array(this.capacity * 3);
    this.flowTailAttribute = new THREE.InstancedBufferAttribute(this.flowTail, 3).setUsage(THREE.DynamicDrawUsage);
    this.flowMidAttribute = new THREE.InstancedBufferAttribute(this.flowMid, 3).setUsage(THREE.DynamicDrawUsage);
    this.batch.geometry.setAttribute('aFlowTail', this.flowTailAttribute);
    this.batch.geometry.setAttribute('aFlowMid', this.flowMidAttribute);
    // Quarks owns instancing and transforms; this response only filters the actual leaf silhouette.
    const mat = this.batch.material;
    mat.name = 'SF_FilteredForceParticleTransport'; mat.toneMapped = false;
    mat.uniforms.uFlowViewportHeight = { value: 800 };
    mat.vertexShader = `uniform float uFlowViewportHeight; attribute vec3 aFlowTail; attribute vec3 aFlowMid; attribute vec4 aFlowShape; varying vec4 vFlowShape; varying vec2 vForceUv;\n${mat.vertexShader}`
      .replace('void main() {', 'void main() { vForceUv = uv; vFlowShape = aFlowShape;')
      .replace('float sx = size.x, sy = size.y, sz = size.z;', `
        float distanceToCamera=abs((modelViewMatrix*vec4(offset,1.0)).z);
        float pixelWidth=distanceToCamera*2.0/max(.001,projectionMatrix[1][1])/max(1.0,uFlowViewportHeight)*1.65;
        float sx=size.x,sy=max(size.y,pixelWidth),sz=max(size.z,pixelWidth);
      `)
      .replace('vec4 mvPosition = modelViewMatrix * (matrix * vec4( position, 1.0 ));', `
        float u=uv.x, history=smoothstep(0.0,.055,aFlowShape.z);
        vec3 control=2.0*aFlowMid-.5*aFlowTail;
        vec3 path=(1.0-u)*(1.0-u)*aFlowTail+2.0*u*(1.0-u)*control;
        vec4 authored=matrix*vec4(position,1.0);
        vec4 crossSection=matrix*vec4(0.0,position.y,position.z,0.0);
        vec4 recorded=vec4(offset+path+crossSection.xyz,1.0);
        vec4 mvPosition=modelViewMatrix*mix(authored,recorded,history);
      `);
    mat.fragmentShader = `varying vec4 vFlowShape; varying vec2 vForceUv;\n${mat.fragmentShader}`.replace(
      'vec4 diffuseColor = vColor;', `vec4 diffuseColor = vColor;
      float across = abs(vForceUv.y * 2.0 - 1.0);
      float coverage = 1.0 - smoothstep(max(0.0, 1.0-max(0.40, fwidth(across)*1.25)), 1.0, across);
      float tipAA = max(fwidth(vForceUv.x), 0.025);
      coverage *= smoothstep(0.0, tipAA, vForceUv.x) * (1.0 - smoothstep(1.0-tipAA, 1.0, vForceUv.x));
      diffuseColor.a *= coverage;
      diffuseColor.rgb *= 0.48 + 0.52 * (1.0 - across * across);
      // Small hot leading core, coloured cooling tail: the parcel reads as a transported
      // droplet of heat rather than a uniform streak. uv.x runs tail(0) to head(1).
      float parcelHead = smoothstep(0.15, 0.80, vForceUv.x);
      diffuseColor.rgb *= 0.56 + 0.92 * pow(parcelHead, 1.8);
      diffuseColor.b *= 1.0 + 0.30 * (1.0 - parcelHead);
      // A compact bright head followed by a torn, cooler folded body. Colour does not erase
      // the silhouette: kinetic darts, current junctions and cohesive matter have different reads.
      float crease = exp(-pow((vForceUv.y - .38) / .19, 2.0));
      float tail = smoothstep(0.0, .48, vForceUv.x);
      float heat = vFlowShape.y;
      float material = vFlowShape.w;
      if (material > 9.5 && material < 10.5) diffuseColor.a *= tail; // ballistic cut
      if (material > 5.5 && material < 6.5) {
        float bridge = 1.0 - smoothstep(.72, .88, abs(vForceUv.x - .65) * 2.0);
        diffuseColor.rgb += vec3(.5, .7, 1.0) * bridge * crease * .7;
      }
      float energy=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));
      vec3 chroma=diffuseColor.rgb/max(1.0,energy);
      diffuseColor.rgb=chroma*(.58+min(1.15,energy*.26))*(.55+crease*.75);
      diffuseColor.rgb+=vec3(1.0,.95,.86)*pow(parcelHead,9.0)*pow(crease,3.0)*min(1.6,energy*.35);
      diffuseColor.rgb += vec3(1.0, .86, .67) * heat * crease * parcelHead;
      diffuseColor.a *= .56 + .44 * tail;`);
    mat.needsUpdate = true;
    this.viewport = new THREE.Vector4();
    this.batch.onBeforeRender = renderer => {
      renderer.getCurrentViewport(this.viewport);
      mat.uniforms.uFlowViewportHeight.value = Math.max(1, this.viewport.w);
    };
    this.renderer.frustumCulled = false; this.batch.frustumCulled = false;
    // Warm all particle-owned memory once; bursts recycle these objects without allocations.
    this.system.spawn(this.capacity, this.system.emissionState, this.matrix);
    this.system.particleNum = 0; this.batch.geometry.instanceCount = 0;
    this.renderer.visible = false;
    if (parent) parent.add(this.renderer, this.system.emitter);
    registerMaterialOwner(this);
  }
  get live() { return this.disposed ? 0 : this.system.particleNum; }
  emit({ kind, x, z, y = 0.5, dx = 1, dz = 0, radius = 10, seed = 0, count = 8, life = 0.8, strength = 1,
    halfAngle = 0.56, halfWidth = 52, age = 0, deferUpload = false, environment = null } = {}) {
    const code = KINDS.indexOf(kind);
    if (this.disposed || code < 0 || !Number.isFinite(x) || !Number.isFinite(z) || !(strength > 0)) return 0;
    const n = Math.min(this.capacity - this.live, Math.max(0, Math.floor(finite(count))));
    this.stats.dropped += Math.max(0, Math.floor(finite(count))) - n;
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
    event.environment = environment;
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
    this.stats.emitted += Math.max(0, this.live - first);
    return this.live - first;
  }
  publish() {
    if (this.disposed) return;
    this.batch.update();
    this._publishShape();
    this.renderer.visible = this.live > 0;
  }
  _publishShape() {
    registerMaterialOwner(this);
    const light = this.contactLight; light.active = false; light.intensity = 0;
    const data = this.flowShape;
    for (let i = 0; i < this.live; i++) {
      const p = this.system.particles[i], k = p.forceKinematics, j = i * 4;
      data[j] = k[12];
      data[j + 1] = this.reducedFlash ? 0 : k[8];
      data[j + 2] = k[6]; data[j + 3] = p.forceFlow[0];
      const m = p.forceFlow, tail = Math.max(18, 18 + (k[50] - 1) * 3), mid = Math.min(30, tail);
      const q = i * 3, R = m[6], c = m[4], sn = m[5];
      let dx = (k[tail] - k[0]) * R, dz = (k[tail + 2] - k[2]) * R;
      this.flowTail[q] = c * dx - sn * dz; this.flowTail[q + 1] = (k[tail + 1] - k[1]) * R;
      this.flowTail[q + 2] = sn * dx + c * dz;
      dx = (k[mid] - k[0]) * R; dz = (k[mid + 2] - k[2]) * R;
      this.flowMid[q] = c * dx - sn * dz; this.flowMid[q + 1] = (k[mid + 1] - k[1]) * R;
      this.flowMid[q + 2] = sn * dx + c * dz;
      // Only material that really touched a retained body may request local reflected light.
      const power = this.reducedFlash ? 0 : k[8] * p.color.w * 7;
      if (k[13] > 0 && power > .025 && power > light.intensity) {
        const rgb = MATERIAL_FLOW_RECIPES[p.forceFlow[0]].rgb;
        light.active = true; light.x = p.position.x; light.y = p.position.y + 5; light.z = p.position.z;
        light.r = Math.min(1, rgb[0]); light.g = Math.min(1, rgb[1]); light.b = Math.min(1, rgb[2]);
        light.intensity = Math.min(3.5, power); light.range = Math.min(75, Math.max(16, p.forceFlow[6] * .45));
      }
    }
    if (this.live) {
      this.flowShapeAttribute.clearUpdateRanges();
      this.flowShapeAttribute.addUpdateRange(0, this.live * 4);
      this.flowShapeAttribute.needsUpdate = true;
      this.flowTailAttribute.clearUpdateRanges(); this.flowTailAttribute.addUpdateRange(0, this.live * 3);
      this.flowMidAttribute.clearUpdateRanges(); this.flowMidAttribute.addUpdateRange(0, this.live * 3);
      this.flowTailAttribute.needsUpdate = this.flowMidAttribute.needsUpdate = true;
    }
  }
  inspect() {
    let contacts = 0;
    for (let i = 0; i < this.live; i++) contacts += this.system.particles[i].forceKinematics[13];
    return { schema: 'spaceface.material-transport.v1', live: this.live, capacity: this.capacity,
      contacts, ...this.stats, batches: this.renderer.batches.length };
  }
  update(dt, { reducedMotion = false, reducedFlash = false } = {}) {
    if (this.disposed) return;
    this.reducedMotion = reducedMotion; this.reducedFlash = reducedFlash;
    if (!Number.isFinite(dt) || dt <= 0 || !this.live) return;
    registerMaterialOwner(this);
    this.ambientFields=materialFieldsForScene(this._materialScene);
    this.stats.updates++;
    if (dt >= 3) { this.clear(); return; }
    // Quarks caps a step at .1s; subdivide so retirement still follows elapsed simulation time.
    let remaining = Math.min(dt, 3.1);
    while (remaining > 1e-8 && this.live) {
      const step = Math.min(0.05, remaining);
      this.renderer.update(step); remaining -= step;
    }
    this._publishShape();
    this.renderer.visible = this.live > 0;
  }
  reproject(dx, dz) {
    if (this.disposed || !Number.isFinite(dx) || !Number.isFinite(dz)) return;
    for (let i = 0; i < this.live; i++) {
      const p = this.system.particles[i]; p.forceFlow[1] += dx; p.forceFlow[3] += dz;
      p.position.x += dx; p.position.z += dz;
      // Frame-local contact snapshots reproject with the trajectory origins they belong to.
      const n = p.forceContactCount | 0, c = p.forceContacts;
      for (let j = 0; j < n; j++) { c[j * CONTACT_STRIDE] += dx; c[j * CONTACT_STRIDE + 1] += dz; }
    }
    // Upload without advancing lifecycle or transport, including paused origin shifts.
    this.batch.update(); this._publishShape();
  }
  clear() {
    if (this.disposed) return;
    this.system.particleNum = 0; this.batch.geometry.instanceCount = 0; this.renderer.visible = false;
    this.contactLight.active = false; this.contactLight.intensity = 0;
  }
  dispose() {
    if (this.disposed) return;
    this.clear(); this.disposed = true; unregisterMaterialOwner(this);
    this.system.dispose(); this.batch.material.dispose(); this.batch.dispose();
    this.geometry.dispose(); this.material.dispose(); this.renderer.removeFromParent();
    this.renderer.batches.length = 0; this.renderer.systemToBatchIndex.clear();
  }
}
