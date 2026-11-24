import * as THREE from 'three';
import { EVENT_COMMON_GLSL, EVENT_VOLUME_GLSL } from '../vfx/runtime/eventMaterial.glsl.js';
import { createVfxEventGeometry } from '../vfx/runtime/eventGeometry.js';
import { explosionPattern01 } from './phasedExplosions.js';
import { resolveVfxAccessibilityProfile } from '../vfxAccessibility.js';
import { volatileClassOf } from '../../data/commodityVolatileClasses.js';
import {
  assertDynamicBufferOwnerWritable, commitDynamicBufferOwner, markDynamicBufferItems,
  registerDynamicBufferOwner, unregisterDynamicBufferOwner,
} from '../dynamicBufferRanges.js';

// These are different material constructions, not palettes on the same radial blast.
export const RUPTURE_FAMILY = Object.freeze({ mineral: 0, armor: 1, reactor: 2, fuel: 3 });
const HANDLED_PHASES = new Set([
  'ignition', 'contact-compression', 'terrain-spall', 'collision-shear', 'kinetic-tear',
  'internal', 'internal-secondary', 'breakup', 'rupture', 'pressure', 'residue',
]);
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;

export function explosionRuptureFamily(entry) {
  if (entry.materialId === 'fuel') return 'fuel';
  if (entry.materialId === 'rock' || entry.materialId === 'ice') return 'mineral';
  const source = String(entry.sourceType || '').toLowerCase();
  if (source.includes('volatile') || source.includes('fuel')) return 'fuel';
  if (source.includes('asteroid') || source.includes('rock') || source.includes('mineral')) return 'mineral';
  if (entry.cause === 'kinetic' || entry.cause === 'terrain_collision' || entry.cause === 'ship_collision') return 'armor';
  if ((!source || source === 'unknown') && entry.cause === 'explosive') return 'fuel';
  return 'reactor';
}

/** Resolve the destroyed substance, never the material of the weapon that struck it. */
export function explosionSourceMaterial(receipt = {}, entity = null) {
  const source = receipt.entity || entity;
  const data = source?.data || receipt.data || {};
  const material = receipt.materialId || receipt.presentation?.materialId || data.materialId;
  if (material === 'fuel' || data.volatileClass === 'explosive'
    || volatileClassOf(data.commodityId || receipt.commodityId)?.id === 'explosive'
    || data.typeId === 'ast_gas_cloud') return 'fuel';
  if (material === 'rock' || material === 'ice' || material === 'hull' || material === 'armor') return material;
  const type = receipt.type || receipt.victimClass || source?.type;
  if (type === 'asteroid') return data.typeId === 'ast_icy' ? 'ice' : 'rock';
  if (type === 'ship' || type === 'drone' || type === 'station' || type === 'wreck') return 'hull';
  return 'unknown';
}

function ruptureAxis(entry) {
  if (entry.hasNormal && (entry.cause === 'terrain_collision' || entry.cause === 'ship_collision')) {
    let x = finite(entry.normalX), z = finite(entry.normalZ);
    if (x < -1e-8 || (Math.abs(x) <= 1e-8 && z < 0)) { x = -x; z = -z; }
    if (entry.cause === 'terrain_collision') {
      let into = x * finite(entry.targetVelocityX) + z * finite(entry.targetVelocityZ);
      if (Math.abs(into) <= 1e-8 && entry.hasDirection !== false) into = x * finite(entry.dirX) + z * finite(entry.dirZ);
      if (into > 1e-8) { x = -x; z = -z; }
    }
    if (Math.hypot(x, z) > 1e-8) return Math.atan2(z || 0, x || 0);
  }
  return Math.atan2(finite(entry.dirZ), finite(entry.dirX, 1));
}

const VERTEX = /* glsl */`
  ${EVENT_COMMON_GLSL}
  attribute vec3 aOrigin;
  attribute vec4 aShape; // family, length, width, height
  attribute vec4 aPhase; // age, lifetime, seed, motion scale
  attribute vec4 aMotion; // angle, speed, inherited x, inherited z
  attribute vec2 aAppearance; // alpha, heat multiplier
  attribute vec2 aEventSection;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec4 vPhase;
  varying vec2 vAppearance;
  varying vec2 vSection;
  varying float vKind;
  void main() {
    float age = aPhase.x;
    float t = clamp(age / max(aPhase.y, 0.0001), 0.0, 1.0);
    float seed = aPhase.z;
    float motion = aPhase.w;
    vec3 local = sfEventLocal(aShape.x, uv, aEventSection, seed, t, aShape.yzw);
    // Pressure loses acceleration before it loses matter. Analytic drag keeps pause,
    // cadence and rebases from changing a parcel's trajectory.
    float drift = (1.0 - exp(-age * 2.6)) / 2.6 * motion;
    local.x += aMotion.y * drift;
    local = sfEventRotate(local, aMotion.x);
    local.xz += aMotion.zw * age * 0.12 * motion;
    vec4 world = modelMatrix * vec4(aOrigin + local, 1.0);
    vWorld = world.xyz;
    vUv = uv;
    vPhase = aPhase;
    vAppearance = aAppearance;
    vSection = aEventSection;
    vKind = aShape.x;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */`
  ${EVENT_VOLUME_GLSL}
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec4 vPhase;
  varying vec2 vAppearance;
  varying vec2 vSection;
  varying float vKind;
  void main() {
    float t = clamp(vPhase.x / max(vPhase.y, 0.0001), 0.0, 1.0);
    vec3 pigment = sfEventFamilyColor(vKind, vPhase.z);
    vec4 event = sfEventSurface(vKind, vUv, vSection, vPhase.z, t, vWorld,
      pigment, vAppearance.x, vAppearance.y);
    if (event.a < 0.003) discard;
    gl_FragColor = event;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class ExplosionRupture {
  constructor(scene, { capacity = 96, localize = null } = {}) {
    this.capacity = Math.max(8, Math.floor(capacity));
    this.time = 0;
    this.localize = localize;
    this.scratch = { x: 0, z: 0 };
    this.activeCount = 0;
    this.dirty = false;
    this.disposed = false;
    this.records = Array.from({ length: this.capacity }, () => ({ alive: false }));
    const geometry = createVfxEventGeometry({ instanced: true, rows: 8, columns: 5 });
    this.attributes = [3, 4, 4, 4, 2].map(size =>
      new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * size), size).setUsage(THREE.DynamicDrawUsage));
    const names = ['aOrigin', 'aShape', 'aPhase', 'aMotion', 'aAppearance'];
    for (let i = 0; i < names.length; i++) geometry.setAttribute(names[i], this.attributes[i]);
    const material = new THREE.ShaderMaterial({
      name: 'SF_ExplosionRupture_closed-event-volumes', vertexShader: VERTEX, fragmentShader: FRAGMENT,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      forceSinglePass: true, blending: THREE.NormalBlending, toneMapped: false,
    });
    material.userData.spacefaceTransientTechnique = 'closed-folded-event-volumes';
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'SF_VFX_explosion_rupture';
    // The native explosion scheduler publishes immediately, so loading owns the first draw.
    this.mesh.userData.spacefaceOpeningImmediateFirstUse = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.mesh.visible = false;
    this.roots = [this.mesh];
    scene.add(this.mesh);
    this.dynamicBufferOwner = registerDynamicBufferOwner(scene, {
      id: 'explosion-rupture-sheets', mesh: this.mesh,
      attributes: this.attributes.map((attribute, i) => ({ name: names[i], attribute })),
    });
  }

  /** Called by the existing phased explosion scheduler; does not invent simulation events. */
  emitPhase(phase, entry, settings) {
    if (this.disposed || !entry || !HANDLED_PHASES.has(phase)) return false;
    const family = explosionRuptureFamily(entry), kind = RUPTURE_FAMILY[family];
    const sourceRadius = Math.max(2, finite(entry.radius, 8));
    // Scale tightly to what was hit and cap every family so a single rupture lobe never
    // turns into an arena-covering cream shell or towers above ship hulls.
    const maxFamilyR = kind === 1 ? 11 : 12;
    const r = Math.min(sourceRadius, 7 + Math.sqrt(sourceRadius) * 1.8, maxFamilyR);
    if (settings) this.settings = settings;
    const effSettings = settings || this.settings;
    const video = effSettings && effSettings.video;
    const lowBudget = !!video && (
      video.qualityPreset === 'low'
      || video.qualityPreset === 'integrated'
      || video.qualityPreset === 'igpu60'
      || video.particleQuality === 'low'
    );
    const rawCount = phase === 'rupture' ? (kind === 0 ? 4 : kind === 2 ? (entry.classId === 'capital' ? 7 : 4) : 3)
      : phase === 'ignition' ? 2
      : phase === 'residue' ? 2
      : phase === 'pressure' ? (kind === 2 ? 1 : 0)
      : phase === 'terrain-spall' || phase === 'kinetic-tear' ? 3 : 2;
    const count = lowBudget && rawCount > 0 ? Math.max(1, Math.ceil(rawCount * 0.5)) : rawCount;
    const maxActive = lowBudget ? Math.min(this.capacity, 24) : this.capacity;
    const radiusScale = entry.classId === 'capital' ? 1.12 : 1;
    const axis = ruptureAxis(entry);
    const residual = phase === 'residue';
    this.scratch.x = finite(entry.x); this.scratch.z = finite(entry.z);
    if (this.localize) this.localize(this.scratch.x, this.scratch.z, this.scratch);
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= maxActive) break;
      const seed = explosionPattern01(entry.serial, phase, i, 44);
      const pick = explosionPattern01(entry.serial, phase, i, 45);
      const side = i % 2 ? 1 : -1;
      const primary = phase === 'rupture' || phase === 'kinetic-tear';
      // Fracture and pressure carry separate short volumes. Their source seats, arrival and
      // velocity differ, leaving an irregular cavity rather than tracing its entire rim.
      const compact = kind === 0 || kind === 2;
      const phaseReach = compact
        ? (phase === 'ignition' ? 0.28 : primary ? 0.62 : residual ? 0.38 : 0.46)
        : phase === 'ignition' ? 0.40 : primary ? (kind === 3 ? 0.85 : 0.88) : residual ? 0.58 : 0.60;
      const spread = kind === 1 ? 0.44 : kind === 0 ? 1.75 : kind === 2 ? 5.8 : 2.3;
      let angle = axis + ((i + 0.5) / Math.max(1, count) - 0.5) * spread + (seed - 0.5) * (compact ? 0.82 : 0.34);
      if (phase === 'internal-secondary') angle += 1.4;
      if (entry.cause === 'ship_collision' && kind === 1 && i % 2) angle += Math.PI;
      const seat = sourceRadius * (phase.includes('internal') ? 0.30 : compact ? 0.12 : 0.08);
      const seatSide = compact ? (pick - 0.5) * 2 : side;
      const seatAlong = compact ? (seed - 0.5) * seat * 0.70 : 0;
      let rec = this.records.find(row => !row.alive);
      if (!rec) break; // preserves admitted choreography rather than recycling live volumes
      Object.assign(rec, {
        alive: true, family, phase, serial: entry.serial,
        born: this.time + i * (compact ? 0.036 + pick * 0.012 : residual ? 0.024 : 0.008),
        life: (kind === 0 ? 0.44 : kind === 1 ? 0.38 : kind === 2 ? 0.48 : 0.54)
          * (residual ? 1.25 : 1) * (0.84 + pick * 0.32),
        x: this.scratch.x + Math.cos(axis + Math.PI * 0.5) * seatSide * seat + Math.cos(axis) * seatAlong,
        y: -0.90 - i * 0.04,
        z: this.scratch.z + Math.sin(axis + Math.PI * 0.5) * seatSide * seat + Math.sin(axis) * seatAlong,
        kind, length: r * phaseReach * radiusScale * (0.72 + seed * 0.48),
        width: r * (kind === 0 ? 0.25 : kind === 1 ? 0.22 : kind === 2 ? 0.27 : 0.30) * (0.85 + pick * 0.30),
        height: Math.min(2.0, r * (kind === 0 ? 0.12 : kind === 1 ? 0.15 : kind === 2 ? 0.18 : 0.16)),
        angle, speed: r * (primary ? (compact ? 2.2 : 1.7) : residual ? 0.6 : 0.45)
          * (compact ? 0.55 + pick * 1.05 : 0.7 + pick * 0.6),
        vx: finite(entry.targetVelocityX), vz: finite(entry.targetVelocityZ),
        seed, motion: 1, alpha: residual ? 0.18 : 0.38,
        heat: residual ? 0.06 : phase === 'ignition' ? 0.85 : 0.68,
      });
      this.activeCount++;
    }
    this.dirty = true;
    return true;
  }

  update(simTime, settings) {
    if (this.disposed) return;
    const next = finite(simTime, this.time);
    if (next < this.time - 1e-8) { this.clear(); this.time = next; return; }
    if (settings && settings !== this.settings) { this.settings = settings; this.dirty = true; }
    const profileId = resolveVfxAccessibilityProfile(this.settings).id;
    if (profileId !== this.profileId) { this.profileId = profileId; this.dirty = true; }
    if (next === this.time && !this.dirty) return;
    this.time = next;
    if (!this.activeCount && !this.dirty) return;
    this._publish(settings);
  }

  _publish(settings) {
    assertDynamicBufferOwnerWritable(this.dynamicBufferOwner);
    const profile = resolveVfxAccessibilityProfile(settings || this.settings);
    const motionScale = (settings || this.settings)?.video?.motionReduce ? 0.24 : 1;
    const [origin, shape, phase, motion, appearance] = this.attributes;
    let count = 0;
    for (const rec of this.records) {
      if (!rec.alive) continue;
      const age = this.time - rec.born;
      if (age >= rec.life) { rec.alive = false; this.activeCount--; continue; }
      if (age < 0) continue;
      origin.setXYZ(count, rec.x, rec.y, rec.z);
      shape.setXYZW(count, rec.kind, rec.length, rec.width, rec.height);
      phase.setXYZW(count, age, rec.life, rec.seed, rec.motion * motionScale);
      motion.setXYZW(count, rec.angle, rec.speed, rec.vx, rec.vz);
      appearance.setXY(count, rec.alpha * profile.flashOpacityScale, rec.heat);
      count++;
    }
    for (let i = 0; i < this.attributes.length; i++) markDynamicBufferItems(this.dynamicBufferOwner, i, 0, count);
    commitDynamicBufferOwner(this.dynamicBufferOwner, count);
    if (!this.dynamicBufferOwner) for (const attribute of this.attributes) attribute.needsUpdate = true;
    this.mesh.geometry.instanceCount = count;
    this.mesh.visible = count > 0;
    this.dirty = false;
  }

  reproject(dx, dz) {
    if (this.disposed || !this.activeCount) return;
    for (const rec of this.records) if (rec.alive) { rec.x += finite(dx); rec.z += finite(dz); }
    this.dirty = true;
    this._publish();
  }

  clear() {
    for (const rec of this.records) rec.alive = false;
    this.activeCount = 0;
    this.mesh.geometry.instanceCount = 0;
    this.mesh.visible = false;
    this.dirty = false;
    commitDynamicBufferOwner(this.dynamicBufferOwner, 0);
  }

  dispose() {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    unregisterDynamicBufferOwner(this.dynamicBufferOwner);
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
  }
}
