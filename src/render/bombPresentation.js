// A single bounded mesh for ordnance telegraphs and moving field structure.
// Existing visualFactory bodies and vfx.js detonations remain their owners. This layer supplies
// what they did not: actual danger extent, a readable warning, and a field that follows its source.
// No billboards, light pools, post passes, sim writes, wall clocks, RNG, or private frame loop.
import * as THREE from 'three';
import { BOMB_DEFS, BOMB_DRIFT, bombDef } from '../data/bombs.js';
import { bombFieldEnvelope } from '../combat/bombDynamics.js';
import { readFrameOrigin, interpolateGlobalToFrame } from './frameCoordinates.js';
import { resolveVfxAccessibilityProfile } from './vfxAccessibility.js';

const VERTICES_PER_BOMB = 900;
export const BOMB_PRESENTATION_MAX_VERTICES = BOMB_DRIFT.maxWorldActive * VERTICES_PER_BOMB;
const COLORS = new Map(Object.entries(BOMB_DEFS).map(([id, def]) => [id, new THREE.Color(def.visual.accent)]));
const owners = new WeakMap();
const EMPTY_STATS = Object.freeze({ bombs: 0, vertices: 0, drawCalls: 0, overflow: 0 });

/** Exact program recipe the cook retains so the first live drop is not a new shader key. */
export function createBombTelegraphMaterial() {
  return new THREE.MeshStandardMaterial({
    name: 'BombTelegraphGeometry',
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: 0.46,
    metalness: 0.28,
    toneMapped: true,
  });
}

/** Tiny retained owner for the cook. Same material key as the live batch; not the 24-bomb buffer. */
export function createBombPresentationPrecompileMesh() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -2, 0.4, 0, 2, 0.4, 0, 0, 1.6, 2,
  ]), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0,
  ]), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array([
    0.35, 0.78, 1, 0.82, 0.35, 0.78, 1, 0.82, 0.35, 0.78, 1, 0.82,
  ]), 4));
  const mesh = new THREE.Mesh(geometry, createBombTelegraphMaterial());
  mesh.name = 'SF_Precompile_BombTelegraphs';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.precompileRetainedPipeline = 'bomb-telegraph';
  return mesh;
}

/** Explicit disposal seam, also used on scene replacement and leaving the flight route. */
export function releaseBombPresentation(state) {
  const owner = state && owners.get(state);
  if (owner) { owner.dispose(); owners.delete(state); }
}
export function bombPresentationStats(state) { return owners.get(state)?.stats || EMPTY_STATS; }

/** Called by the existing presentation phase after prepareFrame, before the shared scene draw. */
export function updateBombPresentation(state, alpha = 1) {
  if (!state) return;
  const scene = state.render?.scene;
  if (state.mode !== 'flight' || !scene?.isScene) { releaseBombPresentation(state); return; }
  let owner = owners.get(state);
  if (owner && owner.scene !== scene) { releaseBombPresentation(state); owner = null; }
  const index = state.entityIndex;
  const source = index?.__spacefaceEntityIndexV1 && index.ready === true && Array.isArray(index.bombs)
    ? index.bombs : state.entityList;
  if (!source) return;
  if (!owner) {
    // Strict no-op until the first bomb exists; no new baseline draw or startup allocation.
    let found = false;
    for (const e of source) if (e?.alive && e.type === 'bomb') { found = true; break; }
    if (!found) return;
    owner = new BombPresentationBatch(scene);
    owners.set(state, owner);
  }
  owner.update(state, source, alpha);
}

export class BombPresentationBatch {
  constructor(scene) {
    this.scene = scene;
    this.positions = new Float32Array(BOMB_PRESENTATION_MAX_VERTICES * 3);
    this.normals = new Float32Array(BOMB_PRESENTATION_MAX_VERTICES * 3);
    this.colors = new Float32Array(BOMB_PRESENTATION_MAX_VERTICES * 4);
    this.geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.normalAttribute = new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute = new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('normal', this.normalAttribute);
    this.geometry.setAttribute('color', this.colorAttribute);
    this.geometry.setDrawRange(0, 0);
    this.material = createBombTelegraphMaterial();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'BombFieldTelegraphs';
    this.mesh.frustumCulled = false; // individual bomb extents are culled before vertices are written
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.origin = { x: 0, z: 0 };
    this.local = { x: 0, z: 0 };
    this.sphere = new THREE.Sphere();
    this.frustum = new THREE.Frustum();
    this.clip = new THREE.Matrix4();
    this.nx = 0;
    this.ny = 1;
    this.nz = 0;
    this.stats = { bombs: 0, vertices: 0, drawCalls: 0, overflow: 0 };
    this.count = 0;
    this.disposed = false;
  }
  update(state, source, alpha) {
    if (this.disposed) return;
    this.count = 0;
    const stats = this.stats;
    stats.bombs = stats.vertices = stats.drawCalls = stats.overflow = 0;
    readFrameOrigin(state, this.origin);
    const camera = state.render?.camera;
    const cull = !!(camera?.projectionMatrix && camera?.matrixWorldInverse);
    if (cull) {
      camera.updateMatrixWorld();
      this.frustum.setFromProjectionMatrix(this.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    }
    const now = Number(state.simTime) || 0;
    const accessibility = resolveVfxAccessibilityProfile(state.settings);
    const moving = !state.settings?.video?.motionReduce;
    const brightness = accessibility.id === 'full' ? 1 : 0.62;
    for (const bomb of source) {
      if (!bomb?.alive || bomb.type !== 'bomb' || !bomb.data || !bomb.pos) continue;
      const d = bomb.data, def = bombDef(d.bombId);
      interpolateGlobalToFrame(bomb.prevPos || bomb.pos, bomb.pos, alpha, this.origin, this.local);
      const x = this.local.x, z = this.local.z;
      this.sphere.center.set(x, 0, z); this.sphere.radius = def.radius + 8;
      if (cull && !this.frustum.intersectsSphere(this.sphere)) continue;
      if (stats.bombs >= BOMB_DRIFT.maxWorldActive) { stats.overflow++; continue; }
      stats.bombs++;
      const color = COLORS.get(def.id);
      const r = color.r * brightness, g = color.g * brightness, b = color.b * brightness;
      const seed = Math.abs(Math.trunc(bomb.id)) || 1;
      if (d.phase === 'field' && def.field) {
        const f = def.field;
        const envelope = bombFieldEnvelope(now, d.fieldStartedAt, f.durationS, f.endStrength ?? 1);
        if (envelope <= 0) continue;
        this.field(x, z, def.radius, f.kind, moving ? now : 0, envelope, r, g, b, seed);
      } else {
        const speed = Math.hypot(bomb.vel?.x || 0, bomb.vel?.z || 0);
        const ax = speed > 0.01 ? bomb.vel.x / speed : Math.cos(bomb.rot || 0);
        const az = speed > 0.01 ? bomb.vel.z / speed : Math.sin(bomb.rot || 0);
        this.drift(x, z, ax, az, speed, r, g, b, d.armed, now, d.spawnedAt);
        if (d.phase === 'warning') {
          const progress = Math.max(0, Math.min(1, (now - d.warningAt) / Math.max(0.001, d.resolveAt - d.warningAt)));
          this.warning(x, z, def.radius, r, g, b, progress, def.field?.kind === 'singularity');
        }
      }
    }
    this.geometry.setDrawRange(0, this.count);
    this.mesh.visible = this.count > 0;
    if (this.count > 0) {
      this.positionAttribute.clearUpdateRanges(); this.positionAttribute.addUpdateRange(0, this.count * 3);
      this.normalAttribute.clearUpdateRanges(); this.normalAttribute.addUpdateRange(0, this.count * 3);
      this.colorAttribute.clearUpdateRanges(); this.colorAttribute.addUpdateRange(0, this.count * 4);
      this.positionAttribute.needsUpdate = this.normalAttribute.needsUpdate = this.colorAttribute.needsUpdate = true;
    }
    stats.vertices = this.count;
    stats.drawCalls = this.count > 0 ? 1 : 0;
  }
  drift(x, z, ax, az, speed, r, g, b, armed, now, spawnedAt) {
    const armedT = Math.max(0, Math.min(1, (now - spawnedAt) / BOMB_DRIFT.armS));
    const px = -az, pz = ax;
    // First vertex is the collar hub at the interpolated source so origin-rebase tests stay rigid.
    this.collar(x, z, ax, az, r, g, b, armed || armedT >= 1 ? 0.92 : 0.28 + armedT * 0.45, 1.6 + armedT * 1.05);
    const wake = 11 + Math.min(28, speed * 0.07);
    let lastX = x - ax * 2.6, lastZ = z - az * 2.6, lastY = 1.35;
    for (let i = 1; i <= 5; i++) {
      const u = i / 5;
      const nextX = x - ax * (2.6 + wake * u) + px * Math.sin(u * 6.2) * 1.1;
      const nextZ = z - az * (2.6 + wake * u) + pz * Math.sin(u * 6.2) * 1.1;
      const nextY = 1.35 - u * 0.7;
      this.ribbon(lastX, lastZ, nextX, nextZ, 4.6 - u * 3.1, r, g, b, (armed ? 0.78 : 0.5) * (1 - u * 0.38), lastY, nextY);
      lastX = nextX; lastZ = nextZ; lastY = nextY;
    }
  }
  collar(x, z, _ax, _az, r, g, b, opacity, height) {
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
      const x0 = x + Math.cos(a0) * 2.25, z0 = z + Math.sin(a0) * 2.25;
      const x1 = x + Math.cos(a1) * 2.25, z1 = z + Math.sin(a1) * 2.25;
      this.tri(x, height * 0.32, z, x0, 0.28, z0, x1, 0.28, z1, r, g, b, opacity * 0.55);
      this.tri(x0, 0.28, z0, x1, 0.28, z1, (x0 + x1) * 0.5, height, (z0 + z1) * 0.5, r, g, b, opacity);
    }
  }
  warning(x, z, radius, r, g, b, progress, inward) {
    // Six standing vanes whose outer tips sit on the live blast radius — physical markers, not a HUD reticle.
    const vane = Math.max(5.5, radius * 0.055);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + 0.18;
      const dx = Math.cos(a), dz = Math.sin(a);
      const px = -dz, pz = dx;
      const tipX = x + dx * radius, tipZ = z + dz * radius;
      const back = inward ? vane * 1.35 : -vane * 1.35;
      const hx = tipX + dx * back, hz = tipZ + dz * back;
      const half = vane * 0.55;
      const yTop = 4.2 + progress * 6.4;
      this.tri(
        tipX, 0.4, tipZ,
        hx + px * half, 0.4, hz + pz * half,
        hx, yTop, hz,
        r, g, b, 0.44 + progress * 0.4,
      );
      this.tri(
        tipX, 0.4, tipZ,
        hx, yTop, hz,
        hx - px * half, 0.4, hz - pz * half,
        r, g, b, 0.44 + progress * 0.4,
      );
    }
    this.ribbon(x - 6, z - 8, x - 6 + 13 * progress, z - 8, 2.1, r, g, b, 0.9, 0.85, 0.85);
  }
  field(x, z, radius, kind, time, envelope, r, g, b, seed) {
    if (kind === 'singularity') this.gravityWell(x, z, radius, time, envelope, r, g, b, seed);
    else this.tarCloud(x, z, radius, time, envelope, r, g, b, seed);
  }
  gravityWell(x, z, radius, time, envelope, r, g, b, seed) {
    const R = radius;
    const rimY = (9.2 + R * 0.042) * envelope;
    const coreY = -R * 0.048 * envelope;
    const coreR = R * 0.08;
    // Inner lip first so origin-rebase tests stay rigid with the interpolated source.
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2;
      const j0 = 0.9 + 0.18 * Math.sin(i * 1.9 + seed * 0.21);
      const j1 = 0.9 + 0.18 * Math.sin((i + 1) * 1.9 + seed * 0.21);
      const x0 = x + Math.cos(a0) * coreR * j0, z0 = z + Math.sin(a0) * coreR * j0;
      const x1 = x + Math.cos(a1) * coreR * j1, z1 = z + Math.sin(a1) * coreR * j1;
      const x2 = x + Math.cos(a0) * coreR * (j0 + 0.85), z2 = z + Math.sin(a0) * coreR * (j0 + 0.85);
      const x3 = x + Math.cos(a1) * coreR * (j1 + 0.85), z3 = z + Math.sin(a1) * coreR * (j1 + 0.85);
      this.tri(x0, coreY, z0, x1, coreY, z1, x2, coreY + rimY * 0.2, z2, 0.05, 0.07, 0.09, 0.82);
      this.tri(x1, coreY, z1, x3, coreY + rimY * 0.2, z3, x2, coreY + rimY * 0.2, z2, 0.05, 0.07, 0.09, 0.82);
    }
    for (const band of [{ u: 0.38, w: 0.09, y: 0.34 }, { u: 0.62, w: 0.1, y: 0.62 }]) {
      const segs = 12;
      for (let i = 0; i < segs; i++) {
        if ((i + seed) % 5 === 2) continue;
        const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
        const jitter = 0.045 * Math.sin(i * 1.81 + seed * 0.23);
        const r0 = R * (band.u + jitter), r1 = R * (band.u + band.w + jitter);
        const yIn = rimY * band.y + coreY * (1 - band.y);
        const yOut = yIn + rimY * 0.12;
        const x00 = x + Math.cos(a0) * r0, z00 = z + Math.sin(a0) * r0;
        const x01 = x + Math.cos(a1) * r0, z01 = z + Math.sin(a1) * r0;
        const x10 = x + Math.cos(a0) * r1, z10 = z + Math.sin(a0) * r1;
        const x11 = x + Math.cos(a1) * r1, z11 = z + Math.sin(a1) * r1;
        this.tri(x00, yIn, z00, x01, yIn, z01, x10, yOut, z10, r, g, b, 0.3 + envelope * 0.2);
        this.tri(x01, yIn, z01, x11, yOut, z11, x10, yOut, z10, r, g, b, 0.3 + envelope * 0.2);
      }
    }
    const rim = 12;
    for (let i = 0; i < rim; i++) {
      const a0 = (i / rim) * Math.PI * 2, a1 = ((i + 1) / rim) * Math.PI * 2;
      const w0 = 0.88 + 0.14 * Math.sin(i * 1.67 + seed * 0.29);
      const w1 = 0.88 + 0.14 * Math.sin((i + 1) * 1.67 + seed * 0.29);
      const y0 = rimY * (0.78 + 0.28 * Math.sin(i * 2.05 + seed));
      const y1 = rimY * (0.78 + 0.28 * Math.sin((i + 1) * 2.05 + seed));
      const ox0 = x + Math.cos(a0) * R * w0, oz0 = z + Math.sin(a0) * R * w0;
      const ox1 = x + Math.cos(a1) * R * w1, oz1 = z + Math.sin(a1) * R * w1;
      const ix0 = x + Math.cos(a0) * R * (w0 - 0.11), iz0 = z + Math.sin(a0) * R * (w0 - 0.11);
      const ix1 = x + Math.cos(a1) * R * (w1 - 0.11), iz1 = z + Math.sin(a1) * R * (w1 - 0.11);
      const fx0 = x + Math.cos(a0) * R * (w0 + 0.045), fz0 = z + Math.sin(a0) * R * (w0 + 0.045);
      const fx1 = x + Math.cos(a1) * R * (w1 + 0.045), fz1 = z + Math.sin(a1) * R * (w1 + 0.045);
      this.tri(ox0, y0, oz0, ox1, y1, oz1, ix0, y0 * 0.72, iz0, r, g, b, 0.34 + envelope * 0.2);
      this.tri(ox1, y1, oz1, ix1, y1 * 0.72, iz1, ix0, y0 * 0.72, iz0, r, g, b, 0.34 + envelope * 0.2);
      this.tri(ox0, 0.35, oz0, ox1, 0.35, oz1, ox0, y0, oz0, r, g, b, 0.26 + envelope * 0.16);
      this.tri(ox1, 0.35, oz1, ox1, y1, oz1, ox0, y0, oz0, r, g, b, 0.26 + envelope * 0.16);
      this.tri(ox0, y0, oz0, ox1, y1, oz1, fx0, y0 * 0.55, fz0, r, g, b, 0.22 + envelope * 0.12);
      this.tri(ox1, y1, oz1, fx1, y1 * 0.55, fz1, fx0, y0 * 0.55, fz0, r, g, b, 0.22 + envelope * 0.12);
    }
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7 + seed * 0.06 + 0.08;
      let lastX = x + Math.cos(a) * R * 0.9;
      let lastZ = z + Math.sin(a) * R * 0.9;
      let lastY = rimY * 0.7;
      for (let j = 1; j <= 5; j++) {
        const u = j / 5;
        const bend = 0.22 * Math.sin(u * Math.PI * 1.4 + i * 0.7);
        const reach = R * (0.9 - u * 0.78);
        const nextX = x + Math.cos(a + bend) * reach, nextZ = z + Math.sin(a + bend) * reach;
        const nextY = rimY * (1 - u) * 0.58 + coreY * u;
        const head = (time * 0.55 + i * 0.13) % 1;
        const pulse = Math.max(0, 1 - Math.abs(u - head) * 4.2);
        const opacity = (0.18 + pulse * 0.4) * (0.5 + 0.5 * envelope);
        this.ribbon(lastX, lastZ, nextX, nextZ, (3.6 - u * 2.4) + pulse * 1.4, r, g, b, opacity, lastY, nextY);
        lastX = nextX; lastZ = nextZ; lastY = nextY;
      }
    }
  }
  tarCloud(x, z, radius, time, envelope, r, g, b, seed) {
    const lobes = 12;
    for (let i = 0; i < lobes; i++) {
      const a0 = (i / lobes) * Math.PI * 2, a1 = ((i + 1) / lobes) * Math.PI * 2;
      if (i % 4 === 2) continue;
      const w0 = 0.78 + 0.2 * Math.sin(i * 2.11 + seed * 0.29);
      const w1 = 0.78 + 0.2 * Math.sin((i + 1) * 2.11 + seed * 0.29);
      const y0 = (4.4 + Math.sin(i * 1.3 + seed) * 2.6) * envelope;
      const y1 = (4.4 + Math.sin((i + 1) * 1.3 + seed) * 2.6) * envelope;
      const x0 = x + Math.cos(a0) * radius * w0, z0 = z + Math.sin(a0) * radius * w0;
      const x1 = x + Math.cos(a1) * radius * w1, z1 = z + Math.sin(a1) * radius * w1;
      this.ribbon(x0, z0, x1, z1, 6.4, r, g, b, 0.32 + envelope * 0.18, y0, y1);
    }
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI * 2 / 6 + seed * 0.13;
      const mound = radius * (0.18 + (i % 3) * 0.08);
      const mx = x + Math.cos(a + 0.35) * mound, mz = z + Math.sin(a + 0.35) * mound;
      const h = (5.2 + (i % 2) * 3.1) * envelope;
      const s = 9 + (i % 3) * 3;
      this.tri(mx, h, mz, mx + s, 0.35, mz + s * 0.35, mx - s * 0.4, 0.35, mz + s * 0.85, r, g, b, 0.3 * envelope + 0.16);
      let lastX = x + Math.cos(a) * radius * 0.86;
      let lastZ = z + Math.sin(a) * radius * 0.86;
      let lastY = 5.2 * envelope;
      for (let j = 1; j <= 6; j++) {
        const u = j / 6;
        const wander = 0.28 * Math.sin(i * 2.1 + j * 1.7 + seed * 0.05);
        const reach = radius * (0.86 - u * 0.68);
        const nextX = x + Math.cos(a + wander) * reach, nextZ = z + Math.sin(a + wander) * reach;
        const nextY = (5.2 - u * 2.2 + Math.sin(u * Math.PI) * 3.4) * envelope;
        const head = (time * 0.12 + i * 0.17) % 1;
        const pulse = Math.max(0, 1 - Math.abs(u - head) * 4);
        this.ribbon(lastX, lastZ, nextX, nextZ, 4.2 + 3.1 * Math.sin(u * Math.PI), r, g, b,
          (0.24 + pulse * 0.24) * (0.5 + 0.5 * envelope), lastY, nextY);
        lastX = nextX; lastZ = nextZ; lastY = nextY;
      }
    }
  }
  face(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    this.nx = nx / len; this.ny = ny / len; this.nz = nz / len;
  }
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, r, g, b, opacity) {
    if (this.count + 3 > BOMB_PRESENTATION_MAX_VERTICES) return;
    this.face(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.vertex(ax, ay, az, r, g, b, opacity);
    this.vertex(bx, by, bz, r, g, b, opacity);
    this.vertex(cx, cy, cz, r, g, b, opacity);
  }
  ribbon(ax, az, bx, bz, width, r, g, b, opacity, ay = 0.55, by = 0.55) {
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    if (length < 1e-6 || this.count + 6 > BOMB_PRESENTATION_MAX_VERTICES) return;
    const nx = -dz / length * width / 2, nz = dx / length * width / 2;
    this.tri(ax + nx, ay, az + nz, ax - nx, ay, az - nz, bx + nx, by, bz + nz, r, g, b, opacity);
    this.tri(bx + nx, by, bz + nz, ax - nx, ay, az - nz, bx - nx, by, bz - nz, r, g, b, opacity);
  }
  vertex(x, y, z, r, g, b, opacity) {
    if (this.count >= BOMB_PRESENTATION_MAX_VERTICES) return;
    const p = this.count * 3, c = this.count * 4;
    this.positions[p] = x; this.positions[p + 1] = y; this.positions[p + 2] = z;
    this.normals[p] = this.nx; this.normals[p + 1] = this.ny; this.normals[p + 2] = this.nz;
    this.colors[c] = r; this.colors[c + 1] = g; this.colors[c + 2] = b; this.colors[c + 3] = opacity;
    this.count++;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.mesh);
    this.geometry.dispose(); this.material.dispose();
  }
}
