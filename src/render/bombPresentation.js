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
    this.colors = new Float32Array(BOMB_PRESENTATION_MAX_VERTICES * 4);
    this.geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute = new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('color', this.colorAttribute);
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    this.material.name = 'BombTelegraphGeometry';
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'BombFieldTelegraphs';
    this.mesh.frustumCulled = false; // individual bomb extents are culled before vertices are written
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.origin = { x: 0, z: 0 };
    this.local = { x: 0, z: 0 };
    this.sphere = new THREE.Sphere();
    this.frustum = new THREE.Frustum();
    this.clip = new THREE.Matrix4();
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
    if (cull) this.frustum.setFromProjectionMatrix(this.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
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
      if (d.phase === 'field' && def.field) {
        const f = def.field;
        const envelope = bombFieldEnvelope(now, d.fieldStartedAt, f.durationS, f.endStrength ?? 1);
        if (envelope <= 0) continue;
        this.field(x, z, def.radius, f.kind, moving ? now : 0, envelope, r, g, b);
      } else {
        const speed = Math.hypot(bomb.vel?.x || 0, bomb.vel?.z || 0);
        const ax = speed > 0.01 ? bomb.vel.x / speed : Math.cos(bomb.rot || 0);
        const az = speed > 0.01 ? bomb.vel.z / speed : Math.sin(bomb.rot || 0);
        this.ribbon(x - ax * 3, z - az * 3, x - ax * (8 + Math.min(20, speed * 0.06)), z - az * (8 + Math.min(20, speed * 0.06)), 0.7, r, g, b, d.armed ? 0.65 : 0.28);
        const armed = Math.max(0, Math.min(1, (now - d.spawnedAt) / BOMB_DRIFT.armS));
        for (let i = 0; i < 4; i++) {
          const shift = (i - 1.5) * 2.4;
          this.ribbon(x + ax * shift - az * 3, z + az * shift + ax * 3,
            x + ax * shift - az * 5, z + az * shift + ax * 5, 0.9, r, g, b, armed >= (i + 1) / 4 ? 0.8 : 0.15);
        }
        if (d.phase === 'warning') {
          // Eight separated chevrons, not a stock blast ring. Their tips are EXACTLY the live
          // surface-distance radius; no expanding cosmetic circle pretends to be a shockwave.
          this.boundary(x, z, def.radius, r, g, b, 0.75, def.field?.kind === 'singularity');
          const progress = Math.max(0, Math.min(1, (now - d.warningAt) / Math.max(0.001, d.resolveAt - d.warningAt)));
          this.ribbon(x - 6, z - 7, x - 6 + 12 * progress, z - 7, 1.8, r, g, b, 0.9);
        }
      }
    }
    this.geometry.setDrawRange(0, this.count);
    this.mesh.visible = this.count > 0;
    if (this.count > 0) {
      this.positionAttribute.clearUpdateRanges(); this.positionAttribute.addUpdateRange(0, this.count * 3);
      this.colorAttribute.clearUpdateRanges(); this.colorAttribute.addUpdateRange(0, this.count * 4);
      this.positionAttribute.needsUpdate = this.colorAttribute.needsUpdate = true;
    }
    stats.vertices = this.count;
    stats.drawCalls = this.count > 0 ? 1 : 0;
  }
  boundary(x, z, radius, r, g, b, opacity, inward) {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4, dx = Math.cos(angle), dz = Math.sin(angle);
      const px = x + dx * radius, pz = z + dz * radius;
      const back = inward ? 5 : -5;
      this.ribbon(px + dx * back - dz * 3, pz + dz * back + dx * 3, px, pz, 0.8, r, g, b, opacity);
      this.ribbon(px, pz, px + dx * back + dz * 3, pz + dz * back - dx * 3, 0.8, r, g, b, opacity);
    }
  }
  field(x, z, radius, kind, time, envelope, r, g, b) {
    const pull = kind === 'singularity';
    this.boundary(x, z, radius, r, g, b, 0.27 + envelope * 0.18, pull);
    // Read the force: inward travelling filaments for gravity; broad, slow, irregular veins for
    // viscous tar. Neither motif implies tangential forces the sim does not actually apply.
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      let lastX = x + Math.cos(a) * radius * 0.92;
      let lastZ = z + Math.sin(a) * radius * 0.92;
      for (let j = 1; j <= 8; j++) {
        const u = j / 8;
        const bend = pull ? 0.10 * Math.sin(u * Math.PI) : 0.15 * Math.sin(i * 2.1 + j * 1.7);
        const reach = radius * (0.92 - u * 0.83);
        const nextX = x + Math.cos(a + bend) * reach, nextZ = z + Math.sin(a + bend) * reach;
        const head = ((time * (pull ? 0.7 : 0.12) + i * 0.137) % 1);
        const pulse = Math.max(0, 1 - Math.abs(u - head) * 5);
        const opacity = (pull ? 0.10 + pulse * 0.52 : 0.19 + pulse * 0.17) * (0.35 + 0.65 * envelope);
        this.ribbon(lastX, lastZ, nextX, nextZ, pull ? 0.7 + pulse : 1.6 + 2.5 * Math.sin(u * Math.PI), r, g, b, opacity);
        lastX = nextX; lastZ = nextZ;
      }
    }
    if (pull) {
      // Opaque faceted absence at the focus, not an additive glow ball.
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3, next = (i + 1) * Math.PI / 3;
        this.vertex(x, z, 0.015, 0.022, 0.027, 1);
        this.vertex(x + Math.cos(a) * 6, z + Math.sin(a) * 6, 0.015, 0.022, 0.027, 1);
        this.vertex(x + Math.cos(next) * 6, z + Math.sin(next) * 6, 0.015, 0.022, 0.027, 1);
      }
    }
  }
  ribbon(ax, az, bx, bz, width, r, g, b, opacity) {
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    if (length < 1e-6 || this.count + 6 > BOMB_PRESENTATION_MAX_VERTICES) return;
    const nx = -dz / length * width / 2, nz = dx / length * width / 2;
    this.vertex(ax + nx, az + nz, r, g, b, opacity); this.vertex(ax - nx, az - nz, r, g, b, opacity);
    this.vertex(bx + nx, bz + nz, r, g, b, opacity); this.vertex(bx + nx, bz + nz, r, g, b, opacity);
    this.vertex(ax - nx, az - nz, r, g, b, opacity); this.vertex(bx - nx, bz - nz, r, g, b, opacity);
  }
  vertex(x, z, r, g, b, opacity) {
    if (this.count >= BOMB_PRESENTATION_MAX_VERTICES) return;
    const p = this.count * 3, c = this.count * 4;
    this.positions[p] = x; this.positions[p + 1] = 0.35; this.positions[p + 2] = z;
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
