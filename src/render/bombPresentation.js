// A single bounded mesh for ordnance telegraphs and moving field structure.
// Existing visualFactory bodies and vfx.js detonations remain their owners. This layer supplies
// what they did not: actual danger extent, a readable warning, and a field that follows its source.
// No billboards, light pools, post passes, sim writes, wall clocks, RNG, or private frame loop.
import * as THREE from 'three';
import { BOMB_DEFS, BOMB_DRIFT, bombDef } from '../data/bombs.js';
import { bombFieldEnvelope } from '../combat/bombDynamics.js';
import { readFrameOrigin, interpolateGlobalToFrame } from './frameCoordinates.js';
import { resolveVfxAccessibilityProfile } from './vfxAccessibility.js';
import { FIELD_LIFECYCLES, sampleFieldLifecycle } from './forceLanguage/effectLifecycle.js';

// Four continuous 28-station, folded inflow surfaces plus the throat and truthful boundary.
// Still one lazy draw, with no per-frame allocations or additional material/pipeline variants.
const VERTICES_PER_BOMB = 3600;
export const BOMB_PRESENTATION_MAX_VERTICES = BOMB_DRIFT.maxWorldActive * VERTICES_PER_BOMB;
const COLORS = new Map(Object.entries(BOMB_DEFS).map(([id, def]) => [id, new THREE.Color(def.visual.accent)]));
const owners = new WeakMap();
const EMPTY_STATS = Object.freeze({ bombs: 0, vertices: 0, drawCalls: 0, overflow: 0 });
// One stable cosmetic seed per identity. Numeric and string ids both work; sim RNG is untouched.
function bombVisualSeed(id) {
  if (typeof id === 'number') return ((Math.imul(id | 0, 16807) >>> 0) % 65521) / 65521 * 6.283185307;
  let hash = 2166136261;
  const text = typeof id === 'string' ? id : 'bomb';
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967296 * 6.283185307;
}

/** Exact program recipe the cook retains so the first live drop is not a new shader key. */
export function createBombTelegraphMaterial() {
  const material = new THREE.MeshStandardMaterial({
    name: 'BombTelegraphGeometry',
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: 0.64,
    metalness: 0.08,
    toneMapped: true,
  });
  // The dark body keeps depth without bloom; only the curved working fold carries HDR energy.
  // This is an analytic surface response, so it has no sprite/texture resolution to expose.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 bombSurface;
varying vec4 vBombSurface;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vBombSurface = bombSurface;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec4 vBombSurface;`).replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= 0.065;`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float bombV = vBombSurface.x;
float bombT = vBombSurface.z;
float bombPhase = abs(vBombSurface.w);
bool bombTar = vBombSurface.w < -0.5;
bool bombFlowing = bombPhase > 0.5;
// Nested caustics advect into the throat at different speeds; the cooling channels between
// them stay dark. Their wave intersections make fine structure without final-art hash noise.
float bombSpine = 0.12 + 0.19 * sin(bombT * 11.0 - bombPhase * 2.0);
float bombFork = 0.22 + 0.095 * sin(bombT * 21.0 - bombPhase * 2.6);
float bombFold = exp(-pow((bombV - bombSpine) * 24.0, 2.0));
float bombInner = exp(-pow((bombV - bombSpine + bombFork) * 32.0, 2.0));
float bombOuter = exp(-pow((bombV - bombSpine - bombFork * 1.5) * 28.0, 2.0));
float bombTransport = pow(0.5 + 0.5 * sin(bombT * 57.0 - bombPhase * 8.0 + bombV * 5.0), 5.0);
float bombFiligree = pow(0.5 + 0.5 * sin(bombT * 86.0 - bombPhase * 5.3 + bombV * 13.0), 14.0);
float bombWorking = (bombFold + 0.65 * bombInner + 0.40 * bombOuter) * (0.38 + 0.62 * bombTransport)
  + 0.13 * bombFiligree * (1.0 - abs(bombV));
if (bombTar) {
  // A broken chemical reaction front crawls around a heavy, mostly unlit body. Broad dark
  // cells and two unequal contour fronts replace the bright plastic spoon spine.
  float chemicalEdge = 0.72 + 0.08 * sin(bombT * 31.4159 - bombPhase * 1.7)
    + 0.045 * sin(bombT * 69.115 - bombPhase);
  float chemicalFront = exp(-pow((abs(bombV) - chemicalEdge) * 28.0, 2.0));
  float chemicalCells = 0.5 + 0.5 * sin(bombT * 43.98 + bombV * 6.0 - bombPhase * 1.2);
  float chemicalVein = exp(-pow((bombV - 0.26 - 0.20 * sin(bombT * 18.85 - bombPhase)) * 26.0, 2.0));
  bombWorking = chemicalFront * (0.18 + 0.82 * pow(chemicalCells, 3.0))
    + chemicalVein * 0.12 * pow(1.0 - chemicalCells, 3.0);
  diffuseColor.rgb *= 0.55 + chemicalCells * 0.45;
} else if (!bombFlowing) {
  bombWorking = 0.12 + 0.65 * exp(-pow((bombV - 0.12) * 5.0, 2.0));
}
float bombGrazing = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
float bombEdge = 1.0 - smoothstep(bombTar ? 0.94 : 0.88, 1.0, abs(bombV));
totalEmissiveRadiance += vColor.rgb * vBombSurface.y * (0.015 + bombWorking) * (0.80 + 0.20 * bombGrazing);
diffuseColor.a *= bombEdge;`);
  };
  material.customProgramCacheKey = () => 'bomb-transport-radiance-v2';
  return material;
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
  geometry.setAttribute('bombSurface', new THREE.BufferAttribute(new Float32Array([0, 2, 0, 1, 0, 2, 0.5, 1, 0, 2, 1, 1]), 4));
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
    this.surfaces = new Float32Array(BOMB_PRESENTATION_MAX_VERTICES * 4);
    this.geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.normalAttribute = new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute = new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage);
    this.surfaceAttribute = new THREE.BufferAttribute(this.surfaces, 4).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('normal', this.normalAttribute);
    this.geometry.setAttribute('color', this.colorAttribute);
    this.geometry.setAttribute('bombSurface', this.surfaceAttribute);
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
    this.surfaceAcross = 0;
    this.surfaceHeat = 1.4;
    this.surfaceAlong = 0;
    this.surfacePhase = 0;
    this.heatScale = 1;
    this.life = { build: 0, release: 0, scale: 0, crossScale: 0, opacity: 0, stage: 'dead' };
    this.sectionA = new Float64Array(33);
    this.sectionB = new Float64Array(33);
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
    this.heatScale = accessibility.id === 'full' ? 1 : accessibility.flashOpacityScale;
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
      const seed = bombVisualSeed(bomb.id);
      if (d.phase === 'field' && def.field) {
        const f = def.field;
        const envelope = bombFieldEnvelope(now, d.fieldStartedAt, f.durationS, f.endStrength ?? 1);
        if (envelope <= 0) continue;
        const age = Math.max(0, now - (Number(d.fieldStartedAt) || 0));
        sampleFieldLifecycle(now, Number(d.fieldStartedAt) || 0, -1,
          f.kind === 'singularity' ? FIELD_LIFECYCLES.well : FIELD_LIFECYCLES.seed, this.life);
        this.field(x, z, def.radius, f.kind, moving ? age : 0, envelope, r, g, b, seed,
          moving ? this.life.scale : 1, this.life.opacity);
      } else {
        const speed = Math.hypot(bomb.vel?.x || 0, bomb.vel?.z || 0);
        const ax = speed > 0.01 ? bomb.vel.x / speed : Math.cos(bomb.rot || 0);
        const az = speed > 0.01 ? bomb.vel.z / speed : Math.sin(bomb.rot || 0);
        this.drift(x, z, ax, az, speed, r, g, b, d.armed, now, d.spawnedAt, def.id,
          moving ? Math.max(0, now - (Number(d.spawnedAt) || 0)) : 0, seed);
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
      this.surfaceAttribute.clearUpdateRanges(); this.surfaceAttribute.addUpdateRange(0, this.count * 4);
      this.positionAttribute.needsUpdate = this.normalAttribute.needsUpdate = this.colorAttribute.needsUpdate = this.surfaceAttribute.needsUpdate = true;
    }
    stats.vertices = this.count;
    stats.drawCalls = this.count > 0 ? 1 : 0;
  }
  drift(x, z, ax, az, speed, r, g, b, armed, now, spawnedAt, kind = 'bomb_frag', time = 0, seed = 0) {
    const armedT = Math.max(0, Math.min(1, (now - (Number(spawnedAt) || 0)) / BOMB_DRIFT.armS));
    const px = -az, pz = ax;
    // First vertex is the collar hub at the interpolated source so origin-rebase tests stay rigid.
    this.surfaceHeat = 1.6;
    this.collar(x, z, ax, az, r, g, b, armed || armedT >= 1 ? 0.92 : 0.28 + armedT * 0.45, 1.6 + armedT * 1.05);
    this.payloadAccent(x, z, ax, az, kind, time, seed, r, g, b, armedT);
    this.surfaceHeat = 0.85;
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
    this.surfaceHeat = 1.4;
  }
  payloadAccent(x, z, ax, az, kind, time, seed, r, g, b, armed) {
    const px = -az, pz = ax;
    this.surfaceHeat = 2.2 + armed * 0.8;
    if (kind === 'bomb_singularity' || kind === 'bomb_scrambler') {
      // Gravity gyroscopes counterturn; Havoc is an open, asymmetric tumbling screw.
      const gyro = kind === 'bomb_singularity';
      for (let branch = 0; branch < (gyro ? 2 : 3); branch++) {
        const phase = seed + branch * 2.2 + time * (branch % 2 ? -0.72 : 0.93);
        let lx = x, lz = z, ly = 1.2;
        for (let j = 0; j <= 20; j++) {
          const u = j / 20, a = u * (gyro ? Math.PI * 2 : Math.PI * 1.28) + phase;
          const rad = gyro ? 4.5 + branch * 0.8 : 2.6 + u * (5 + branch);
          const sx = Math.cos(a) * rad, sz = Math.sin(a) * rad * (gyro ? 0.66 : 0.86);
          const nx = x + ax * sx + px * sz, nz = z + az * sx + pz * sz;
          const ny = 1.7 + Math.sin(a + branch) * (gyro ? 3.1 : 2.2);
          if (j) this.ribbon(lx, lz, nx, nz, gyro ? 0.9 : 1.2 - u * 0.6, r, g, b, 0.76, ly, ny);
          lx = nx; lz = nz; ly = ny;
        }
      }
    } else if (kind === 'bomb_goo') {
      // Compact sagging blisters; same viscous vocabulary as the released tar, at capsule scale.
      for (let i = 0; i < 3; i++) this.swept(x, z, 7, time, 1, seed + i,
        i * Math.PI * 2 / 3, 1, 8, r, g, b, 0.9);
    } else if (kind === 'bomb_concussion') {
      for (let side = -1; side <= 1; side += 2) {
        let lx = x + ax * 4, lz = z + az * 4, ly = 1;
        for (let j = 1; j <= 12; j++) {
          const u = j / 12, a = u * Math.PI * 0.85;
          const reach = 5.5 + 0.5 * Math.sin(time * 1.8 + seed);
          const nx = x + ax * Math.cos(a) * 4 + px * side * Math.sin(a) * reach;
          const nz = z + az * Math.cos(a) * 4 + pz * side * Math.sin(a) * reach;
          const ny = 1 + Math.sin(a) * 2.8;
          this.ribbon(lx, lz, nx, nz, 1.5, r, g, b, 0.82, ly, ny);
          lx = nx; lz = nz; ly = ny;
        }
      }
    } else {
      const count = kind === 'bomb_thermite' ? 3 : kind === 'bomb_emp' ? 5 : 4;
      for (let i = 0; i < count; i++) {
        const side = i % 2 ? 1 : -1;
        const f = (i - (count - 1) / 2) * 1.4;
        let lx = x + px * f, lz = z + pz * f, ly = 1.4;
        const segments = kind === 'bomb_thermite' ? 12 : kind === 'bomb_emp' ? 5 : 3;
        for (let j = 1; j <= segments; j++) {
          const u = j / segments;
          let along, across, height, width;
          if (kind === 'bomb_thermite') {
            along = -u * (7.8 + i * 1.3);
            across = f + Math.sin(u * 7.4 - time * 3 + seed + i) * u * 1.25;
            height = 1.4 + Math.sin(u * Math.PI) * 3.2;
            width = 2 * (1 - u * 0.86);
          } else if (kind === 'bomb_emp') {
            along = -u * 7;
            across = f + side * u * 4.2 + Math.sin(j * 2 + seed) * u * 0.8;
            height = 1.4 + u * 1.6 + 0.3 * Math.sin(time * 2.1 + seed + i);
            width = 0.75;
          } else if (kind === 'bomb_anchor') {
            along = (i < 2 ? 1 : -1) * (u < 0.7 ? 5.2 : 3.7);
            across = side * (u < 0.7 ? 2 + u * 3.5 : 4.4);
            height = 1.4 + u * 3.4;
            width = 1.5;
          } else {
            along = (i < 2 ? 1 : -1) * (2 + u * 4.2);
            across = side * (1.7 + u * 1.8);
            height = 1.4 + Math.sin(u * Math.PI) * 1.8;
            width = 1.8 * (1 - u * 0.65);
          }
          const nx = x + ax * along + px * across, nz = z + az * along + pz * across;
          this.ribbon(lx, lz, nx, nz, width, r, g, b, 0.82, ly, height);
          lx = nx; lz = nz; ly = height;
        }
      }
    }
    this.surfaceAcross = 0;
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
  field(x, z, radius, kind, time, envelope, r, g, b, seed, growth = 1, opacity = 1) {
    this.surfaceAcross = 0;
    this.surfaceHeat = 0.32;
    // A quiet set of physical standing edges always marks the real influence radius. The
    // expressive body can unfurl, creep or weaken without claiming a different gameplay range.
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + seed * 0.07;
      const dx = Math.cos(a), dz = Math.sin(a);
      const outerX = x + dx * radius, outerZ = z + dz * radius;
      this.ribbon(outerX, outerZ, outerX - dx * radius * 0.045,
        outerZ - dz * radius * 0.045, 1.4, r, g, b, 0.56, 1, 3.8);
    }
    if (kind === 'singularity') this.gravityWell(x, z, radius * growth, time, envelope, r, g, b, seed, opacity);
    else this.tarCloud(x, z, radius * growth, time, envelope, r, g, b, seed, opacity);
    this.surfaceHeat = 1.4;
    this.surfaceAcross = 0;
  }
  gravityWell(x, z, radius, time, envelope, r, g, b, seed, opacity = 1) {
    // Dark throat with a shallow counter-turning lip; the core is a cavity, never a glow ball.
    // Continuous angles close the seam, unlike the old twelve-sided disconnected polygon rim.
    this.surfaceHeat = 0.08;
    const core = radius * 0.078;
    for (let i = 0; i < 40; i++) {
      const a0 = i * Math.PI / 20, a1 = (i + 1) * Math.PI / 20;
      const q0 = 1 + 0.10 * Math.sin(a0 * 3 + time * 0.8 + seed);
      const q1 = 1 + 0.10 * Math.sin(a1 * 3 + time * 0.8 + seed);
      const x0 = x + Math.cos(a0) * core * q0, z0 = z + Math.sin(a0) * core * q0;
      const x1 = x + Math.cos(a1) * core * q1, z1 = z + Math.sin(a1) * core * q1;
      this.tri(x, -radius * 0.054, z, x0, -1.8, z0, x1, -1.8, z1,
        0.035 * r, 0.045 * g, 0.055 * b, opacity * 0.92);
      this.tri(x0, -1.8, z0, x + (x0 - x) * 1.52, 2.2, z + (z0 - z) * 1.52,
        x + (x1 - x) * 1.52, 2.2, z + (z1 - z) * 1.52,
        r * 0.36, g * 0.36, b * 0.36, opacity * 0.82);
      this.tri(x0, -1.8, z0, x + (x1 - x) * 1.52, 2.2, z + (z1 - z) * 1.52,
        x1, -1.8, z1, r * 0.36, g * 0.36, b * 0.36, opacity * 0.82);
    }
    // Four broad caustic curtains feed the throat. Their outer reaches, widths and helical
    // bend differ by seed, with a crest travelling inward and actual continuously flexing form.
    for (let i = 0; i < 4; i++) {
      this.swept(x, z, radius, time, envelope, seed + i * 1.917,
        i * Math.PI / 2 + seed * 0.13, 0, 28, r, g, b, opacity * 0.83);
    }
  }
  tarCloud(x, z, radius, time, envelope, r, g, b, seed, opacity = 1) {
    // One coherent viscous volume, with unequal lobes joined through a low central basin.
    // The dark body is only part of the influence footprint; chemical light stays on its
    // moving reaction contours. This is shaped matter, not five disconnected green petals.
    for (let i = 0; i < 48; i++) {
      const a0 = i / 48, a1 = (i + 1) / 48;
      for (let j = 0; j < 5; j++) {
        const u0 = j / 5, u1 = (j + 1) / 5;
        this.tarVertex(x, z, radius, a0, u0, time, envelope, seed, r, g, b, opacity);
        this.tarVertex(x, z, radius, a0, u1, time, envelope, seed, r, g, b, opacity);
        this.tarVertex(x, z, radius, a1, u0, time, envelope, seed, r, g, b, opacity);
        this.tarVertex(x, z, radius, a1, u0, time, envelope, seed, r, g, b, opacity);
        this.tarVertex(x, z, radius, a0, u1, time, envelope, seed, r, g, b, opacity);
        this.tarVertex(x, z, radius, a1, u1, time, envelope, seed, r, g, b, opacity);
      }
    }
    // Unequal creeping reaches overlap the basin and physically connect its outer lobes.
    for (let i = 0; i < 3; i++) this.swept(x, z, radius * (0.90 + i * 0.025),
      time, envelope, seed + i * 2.137, i * 2.3 + seed * 0.11, 1, 18, r, g, b, opacity * 0.74);
    this.surfacePhase = this.surfaceAlong = 0;
  }
  tarVertex(x, z, radius, theta, u, time, envelope, seed, r, g, b, opacity) {
    const a = theta * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const extent = radius * (0.67 + 0.095 * Math.sin(a * 3 + seed)
      + 0.085 * Math.sin(a * 5 - seed + time * 0.23));
    const wave = a * 3 + u * 8 - time * 0.35 + seed;
    const belly = Math.sin(Math.PI * u), lobe = 0.72 + 0.28 * Math.sin(wave);
    const height = radius * 0.095 * belly * lobe * envelope;
    const slope = radius * 0.095 * (Math.PI * Math.cos(Math.PI * u) * lobe
      + belly * 2.24 * Math.cos(wave)) * envelope;
    const n = Math.hypot(extent, slope) || 1;
    this.nx = -ca * slope / n; this.ny = extent / n; this.nz = -sa * slope / n;
    this.surfaceAcross = u;
    this.surfaceAlong = theta;
    this.surfacePhase = -(1 + seed + time * 0.34);
    this.surfaceHeat = 2.8 * envelope;
    this.vertex(x + ca * extent * u, 0.7 + height, z + sa * extent * u,
      r * 0.72, g * 0.80, b * 0.68, opacity * 0.76);
  }
  // Cross-sections are sampled coherently at both ends of every segment. The folded surface
  // has five vertices across its curved profile, avoiding disconnected flat ribbon corners.
  swept(x, z, radius, time, envelope, seed, angle, kind, steps, r, g, b, opacity) {
    const a = this.sectionA, bSection = this.sectionB;
    this.sampleSection(a, 0, x, z, radius, time, envelope, seed, angle, kind);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      this.sampleSection(bSection, u, x, z, radius, time, envelope, seed, angle, kind);
      for (let j = 0; j < 4; j++) {
        this.sectionVertex(a, j, r, g, b, opacity);
        this.sectionVertex(a, j + 1, r, g, b, opacity);
        this.sectionVertex(bSection, j, r, g, b, opacity);
        this.sectionVertex(bSection, j, r, g, b, opacity);
        this.sectionVertex(a, j + 1, r, g, b, opacity);
        this.sectionVertex(bSection, j + 1, r, g, b, opacity);
      }
      a.set(bSection);
    }
    this.surfaceAcross = 0;
    this.surfaceAlong = this.surfacePhase = 0;
  }
  sectionVertex(section, j, r, g, b, opacity) {
    const p = j * 3;
    this.surfaceAcross = j * 0.5 - 1;
    this.surfaceHeat = section[30];
    this.surfaceAlong = section[31]; this.surfacePhase = section[32];
    this.nx = section[p + 15]; this.ny = section[p + 16]; this.nz = section[p + 17];
    this.vertex(section[p], section[p + 1], section[p + 2], r, g, b, opacity);
  }
  sampleSection(out, u, x, z, radius, time, envelope, seed, angle, kind) {
    let cx, cz, cy, nx, nz, width, fold;
    const belly = Math.sin(Math.PI * u);
    const crest = Math.pow(0.5 + 0.5 * Math.cos(u * 10.2 - time * (kind ? 1.05 : 4.2) + seed), 4);
    out[30] = (kind ? 1.0 + crest * 1.7 : 2.7 + crest * 3.5) * (0.40 + envelope * 0.60);
    out[31] = u;
    out[32] = (kind ? -1 : 1) * (1 + seed + time * (kind ? 0.34 : 0.9));
    if (kind === 0) {
      const reach = radius * (0.91 - u * 0.82);
      const bend = angle + u * (2.1 + 0.22 * Math.sin(seed)) - time * 0.37
        + 0.10 * Math.sin(u * 7 - time * 1.4 + seed);
      const slope = 2.1 + 0.22 * Math.sin(seed) + 0.7 * Math.cos(u * 7 - time * 1.4 + seed);
      const ca = Math.cos(bend), sa = Math.sin(bend);
      cx = x + ca * reach; cz = z + sa * reach;
      const dx = -radius * 0.82 * ca - reach * sa * slope;
      const dz = -radius * 0.82 * sa + reach * ca * slope;
      const len = Math.hypot(dx, dz) || 1;
      nx = -dz / len; nz = dx / len;
      width = radius * (0.028 + belly * 0.050) * (0.36 + 0.64 * Math.sqrt(Math.max(0, belly)));
      cy = radius * (0.090 * (1 - u) - 0.050 * u + belly * 0.034
        * Math.sin(u * 7.2 - time * 2.2 + seed)) * (0.55 + envelope * 0.45);
      fold = width * (0.54 + 0.16 * Math.sin(u * 9 - time * 2.5 + seed));
    } else {
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const side = radius * (0.12 * Math.sin(u * 6.2 + seed)
        + 0.032 * Math.sin(time * 0.58 + seed + u * 4.5) * belly);
      const along = radius * (0.10 + u * 0.86);
      cx = x + ca * along - sa * side; cz = z + sa * along + ca * side;
      nx = -sa; nz = ca;
      const lumps = 0.79 + 0.16 * Math.sin(u * 11.8 - time * 0.52 + seed);
      width = radius * (0.022 + 0.19 * Math.pow(Math.max(0, belly), 0.68)) * lumps;
      cy = 0.6 + radius * 0.019 * belly * (1 + Math.sin(u * 8.8 - time * 0.55 + seed));
      fold = radius * 0.095 * Math.pow(Math.max(0, belly), 0.8)
        * (0.80 + 0.20 * Math.sin(u * 12.2 - time * 0.62 + seed)) * envelope;
    }
    for (let j = 0; j < 5; j++) {
      const v = j * 0.5 - 1, p = j * 3;
      out[p] = cx + nx * v * width;
      out[p + 1] = cy + (1 - v * v) * fold + (kind ? 0 : v * width * 0.20);
      out[p + 2] = cz + nz * v * width;
      const slope = -2 * v * fold + (kind ? 0 : width * 0.20);
      const len = Math.hypot(width, slope) || 1;
      out[p + 15] = -nx * slope / len; out[p + 16] = width / len; out[p + 17] = -nz * slope / len;
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
    this.surfaces[c] = this.surfaceAcross;
    this.surfaces[c + 1] = this.surfaceHeat * this.heatScale;
    this.surfaces[c + 2] = this.surfaceAlong;
    this.surfaces[c + 3] = this.surfacePhase;
    this.count++;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.mesh);
    this.geometry.dispose(); this.material.dispose();
  }
}
