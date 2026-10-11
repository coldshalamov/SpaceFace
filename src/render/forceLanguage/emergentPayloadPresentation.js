// Authoritative emergent shots and retained mechanisms. No simulation writes or event copies:
// the live projectile/attachment ledgers own presence; retirement retains only cosmetic poses.
import * as THREE from 'three';
import { EMERGENT_POOL, EMERGENT_TUNING } from '../../data/emergentPrimitives.js';
import { resolveVfxAccessibilityProfile } from '../vfxAccessibility.js';

const TAU = Math.PI * 2;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const COLORS = { sticky: 0xdb9d49, primer: 0x6adce7, grav: 0xa691dc, mass: 0xf2c591,
  polarity: 0x6aaed7, hijack: 0xd99455, gong: 0xdab570, quantum: 0xb7a2ec,
  shrapnel: 0x927760, spring: 0xb4a3d2, link: 0x86cbc7 };
const CAP = EMERGENT_POOL.projectiles + EMERGENT_POOL.coatings * 3 + EMERGENT_POOL.polarities * 2;
const RETIRE_S = 0.22;

function merge(parts) {
  const positions = [], normals = [];
  for (const part of parts) {
    const geo = part.index ? part.toNonIndexed() : part;
    positions.push(...geo.attributes.position.array);
    normals.push(...geo.attributes.normal.array);
    if (geo !== part) geo.dispose();
    part.dispose();
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return result;
}

function box(x, y, z, px = 0, py = 0, pz = 0, yaw = 0) {
  const geo = new THREE.BoxGeometry(x, y, z);
  geo.rotateY(yaw); geo.translate(px, py, pz); return geo;
}
function needle(length, radius, x = 0) {
  const geo = new THREE.ConeGeometry(radius, length, 5);
  geo.rotateZ(-Math.PI / 2); geo.translate(x, 0, 0); return geo;
}
function collar(x, radius = 0.56) {
  const geo = new THREE.CylinderGeometry(radius, radius, 0.18, 8, 1, true);
  geo.rotateZ(-Math.PI / 2); geo.translate(x, 0, 0); return geo;
}

function connectionGeometry(quantum) {
  const points = [];
  // An elastic coil versus two separated folded ribbons: these tools remain distinguishable
  // without color. Local X spans -0.5..0.5; the instance scales it to the actual two endpoints.
  for (let i = 0; i <= 48; i++) {
    const t = i / 48, taper = Math.sin(t * Math.PI);
    points.push(new THREE.Vector3(t - 0.5, Math.sin(t * TAU * (quantum ? 2 : 6)) * 0.34 * taper,
      Math.cos(t * TAU * (quantum ? 2 : 6)) * 0.34 * taper));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, 48, quantum ? 0.065 : 0.09, quantum ? 3 : 5, false);
}

function payloadGeometry(kind) {
  if (kind === 'spring' || kind === 'link') return connectionGeometry(kind === 'link');
  const parts = [];
  switch (kind) {
    case 'sticky':
      parts.push(box(0.8, 0.55, 0.7), collar(-0.25, 0.48));
      for (const sign of [-1, 1]) parts.push(box(0.9, 0.14, 0.18, 0.25, 0, sign * 0.52, sign * 0.55));
      break;
    case 'primer':
      parts.push(needle(1.5, 0.25, 0.3), box(1.2, 0.16, 0.18, -0.15, 0, -0.42), box(1.6, 0.16, 0.18, 0.05, 0, 0.42));
      break;
    case 'grav':
      parts.push(collar(-0.15, 0.52), needle(1.4, 0.25, 0.25));
      for (const sign of [-1, 1]) parts.push(box(1.1, 0.18, 0.22, 0.28, 0, sign * 0.45, -sign * 0.45));
      break;
    case 'mass':
      parts.push(box(2.2, 0.5, 0.6), needle(0.75, 0.42, 1.25), collar(-0.65), collar(-0.2));
      break;
    case 'polarity':
      parts.push(box(1.1, 0.22, 0.25), box(0.5, 0.5, 0.35, -0.45, 0, -0.36), box(0.5, 0.5, 0.35, 0.45, 0, 0.36));
      break;
    case 'hijack':
      parts.push(needle(2.1, 0.26, 0.35), collar(-0.6, 0.45));
      for (const sign of [-1, 1]) parts.push(box(0.7, 0.12, 0.38, -0.5, 0, sign * 0.35, sign * 0.6));
      break;
    case 'gong':
      parts.push(box(0.35, 0.65, 1.2), box(0.22, 0.42, 0.85, 0.4), needle(0.65, 0.2, 0.85));
      break;
    case 'quantum': {
      for (const sign of [-1, 1]) {
        const facet = new THREE.OctahedronGeometry(0.52, 0);
        facet.scale(0.75, 0.6, 1); facet.translate(sign * 0.45, 0, sign * 0.22); parts.push(facet);
      }
      parts.push(box(1.35, 0.12, 0.12)); break;
    }
    default: parts.push(needle(1.6, 0.28));
  }
  return merge(parts);
}

export class EmergentPayloadPresentation {
  constructor(scene, { toLocal } = {}) {
    if (typeof toLocal !== 'function') throw new Error('EmergentPayloadPresentation requires toLocal');
    this.toLocal = toLocal;
    this.group = new THREE.Group(); this.group.name = 'SF_EmergentPayloads'; scene.add(this.group);
    this.meshes = new Map(); this.slots = new Map(); this.time = 0; this.world = null; this.disposed = false;
    this._matrix = new THREE.Matrix4(); this._position = new THREE.Vector3();
    this._scale = new THREE.Vector3(); this._quaternion = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0); this._local = { x: 0, z: 0 }; this._color = new THREE.Color();
    for (const kind of Object.keys(COLORS)) {
      const geometry = payloadGeometry(kind);
      geometry.setAttribute('iAlpha', new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1));
      const material = new THREE.MeshStandardMaterial({ color: COLORS[kind], roughness: 0.42, metalness: 0.5,
        emissive: COLORS[kind], emissiveIntensity: 0.38, transparent: true, depthWrite: false });
      material.onBeforeCompile = shader => {
        shader.vertexShader = 'attribute float iAlpha; varying float vPayloadAlpha;\n' + shader.vertexShader
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPayloadAlpha = iAlpha;');
        shader.fragmentShader = 'varying float vPayloadAlpha;\n' + shader.fragmentShader
          .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vPayloadAlpha;');
      };
      material.customProgramCacheKey = () => 'emergent-payload-alpha-v1';
      const mesh = new THREE.InstancedMesh(geometry, material, CAP);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
      mesh.name = `emergent-payload-${kind}`; mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.set(kind, mesh); this.group.add(mesh);
    }
  }

  clear() {
    this.slots.clear(); this.world = null;
    for (const mesh of this.meshes.values()) { mesh.count = 0; mesh.visible = false; }
  }

  _touch(key, kind, pose) {
    if (!this.meshes.has(kind)) return;
    let slot = this.slots.get(key);
    if (!slot) {
      if (this.slots.size >= 384) return;
      slot = { born: this.time, gone: null }; this.slots.set(key, slot);
    }
    // Copy numbers, never retain a producer pose that is mutated in-place next fixed step.
    Object.assign(slot, pose, { kind, seen: true, gone: null });
  }

  update(dt, state = {}) {
    if (this.disposed) return;
    const now = finite(state.simTime, this.time + Math.max(0, finite(dt)));
    const world = state.emergent;
    if (world !== this.world || now < this.time) { this.clear(); this.world = world; }
    this.time = now;
    const profile = resolveVfxAccessibilityProfile(state.settings);
    const motion = profile.id.includes('motion') ? 0 : 1;
    const flash = profile.id.includes('flash') ? 0.4 : 1;
    for (const slot of this.slots.values()) slot.seen = false;
    const entity = id => {
      const body = state.entities?.get(id);
      return body?.pos && body.alive !== false ? body : null;
    };
    if (world) {
      for (let i = 0; i < Math.min(world.projectiles?.length || 0, EMERGENT_POOL.projectiles); i++) {
        const shot = world.projectiles[i]; if (!shot?.alive) continue;
        const kind = shot.kind;
        const length = kind === 'mass' ? 2.3 : kind === 'shrapnel' ? 1.1 : 2.6;
        this._touch(`shot:${i}`, kind, { x: shot.x, z: shot.z, y: 1.5,
          yaw: Math.atan2(finite(shot.vz), finite(shot.vx)), sx: length, sy: length, sz: length,
          age: finite(shot.age), projectile: true });
      }
      const attach = (rows, kind, cap, pieces = 1) => {
        for (let i = 0; i < Math.min(rows?.length || 0, cap); i++) {
          const row = rows[i], host = entity(row.hostId); if (!host) continue;
          if (Number.isFinite(row.until) && row.until <= now) continue;
          const radius = Math.max(3, finite(host.radius, 6)), rot = finite(host.rot);
          for (let part = 0; part < pieces; part++) {
            const angle = rot + (kind === 'hijack' ? Math.PI : part * TAU / pieces + 0.6);
            const reach = radius * (kind === 'gong' ? 0.5 : 0.82);
            let x = host.pos.x + Math.cos(angle) * reach, z = host.pos.z + Math.sin(angle) * reach;
            if (kind === 'sticky' && Number.isFinite(row.ox) && Number.isFinite(row.oz)) {
              x = host.pos.x + row.ox; z = host.pos.z + row.oz;
            }
            const beat = kind === 'gong' ? Math.max(0, 1 - (finite(row.next) - now) / EMERGENT_TUNING.gongPeriod) : 0;
            const size = Math.max(1.7, Math.min(4.8, radius * 0.23));
            const key = pieces > 1 ? `${kind}:${row.hostId}:${i}:${part}` : row;
            this._touch(key, kind, { x, z, y: Math.max(1.2, Math.min(10, radius * 0.35)),
              yaw: angle + beat * 0.14 * motion, sx: size, sy: size * (1 + beat * 0.3 * motion), sz: size,
              tint: kind === 'polarity' ? (row.charge < 0 ? 0xffb070 : 0x8bdcf4) : 0xffffff,
              part, hostId: host.id });
          }
        }
      };
      attach(world.stickies, 'sticky', EMERGENT_POOL.stickies);
      attach(world.coatings, 'primer', EMERGENT_POOL.coatings, 3);
      attach(world.polarities, 'polarity', EMERGENT_POOL.polarities, 2);
      attach(world.hijacks, 'hijack', EMERGENT_POOL.hijacks);
      attach(world.gongs, 'gong', EMERGENT_POOL.gongs, 3);
      for (const [owner, pair] of Object.entries(world.owners || {})) for (const kind of ['grav', 'quantum']) {
        const host = entity(pair[kind]); if (!host) continue;
        const size = Math.max(2, Math.min(4, finite(host.radius, 6) * 0.28));
        this._touch(`pending:${owner}:${kind}`, kind, { x: host.pos.x, z: host.pos.z,
          y: Math.max(2, finite(host.radius, 6) * 0.5), yaw: finite(host.rot), sx: size, sy: size, sz: size });
      }
      for (const [rows, kind, cap] of [[world.springs, 'spring', EMERGENT_POOL.springs], [world.links, 'link', EMERGENT_POOL.links]]) {
        for (let i = 0; i < Math.min(rows?.length || 0, cap); i++) {
          const row = rows[i], a = entity(row.aId), b = entity(row.bId); if (!a || !b) continue;
          const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, length = Math.hypot(dx, dz);
          if (length < 0.1) continue;
          this._touch(row, kind, { x: (a.pos.x + b.pos.x) * 0.5, z: (a.pos.z + b.pos.z) * 0.5,
            y: 1.8, yaw: Math.atan2(dz, dx), sx: length,
            sy: kind === 'spring' ? Math.min(6, Math.max(1.2, finite(row.rest, length) / length * 4)) : 3,
            sz: kind === 'spring' ? Math.min(6, Math.max(1.2, finite(row.rest, length) / length * 4)) : 3,
            link: true });
        }
      }
    }
    for (const mesh of this.meshes.values()) { mesh.count = 0; mesh.visible = false; mesh.material.emissiveIntensity = 0.38 * flash; }
    for (const [key, slot] of this.slots) {
      if (!slot.seen && slot.gone == null) slot.gone = now;
      const retired = slot.gone != null ? now - slot.gone : 0;
      // Active links stop immediately; detached hardware cools at its last real position.
      if (!slot.seen && (slot.link || slot.projectile || retired >= RETIRE_S)) { this.slots.delete(key); continue; }
      const mesh = this.meshes.get(slot.kind), index = mesh.count;
      if (index >= CAP) continue;
      const local = this.toLocal(finite(slot.x), finite(slot.z), this._local);
      this._position.set(local.x, slot.y - retired * 2, local.z);
      this._quaternion.setFromAxisAngle(this._up, -finite(slot.yaw));
      this._scale.set(slot.sx, slot.sy, slot.sz);
      this._matrix.compose(this._position, this._quaternion, this._scale);
      mesh.setMatrixAt(index, this._matrix);
      this._color.setHex(slot.tint || 0xffffff); mesh.setColorAt(index, this._color);
      mesh.geometry.attributes.iAlpha.setX(index, Math.max(0, 1 - retired / RETIRE_S));
      mesh.count++; mesh.visible = true;
    }
    for (const mesh of this.meshes.values()) if (mesh.count) {
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      mesh.geometry.attributes.iAlpha.needsUpdate = true;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.clear();
    for (const mesh of this.meshes.values()) { mesh.geometry.dispose(); mesh.material.dispose(); }
    this.group.removeFromParent(); this.group.clear();
  }
}
