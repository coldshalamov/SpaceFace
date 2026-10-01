// A single bounded mesh for ordnance telegraphs and moving field structure.
// Existing visualFactory bodies and vfx.js detonations remain their owners. This layer supplies
// what they did not: actual danger extent, a readable warning, and a field that follows its source.
// No billboards, light pools, post passes, sim writes, wall clocks, RNG, or private frame loop.
import * as THREE from 'three';
import { BOMB_DEFS, BOMB_DRIFT, bombDef } from '../data/bombs.js';
import { bombFieldEnvelope } from '../combat/bombDynamics.js';
import { readFrameOrigin, interpolateGlobalToFrame } from './frameCoordinates.js';
import { resolveVfxAccessibilityProfile } from './vfxAccessibility.js';
import { entityIndexLaneVersion, entityIndexVersion } from '../world/livingWorldViews.js';

// The telegraph census only reads index.bombs — latch that lane so projectile/pickup churn
// can't wake the quiet latch every frame. -1 (index unready) plays the old null role.
const BOMB_PRESENT_LANES = ['bombs'];
function bombMembershipVersion(state) {
  const laneVersion = entityIndexLaneVersion(state, BOMB_PRESENT_LANES);
  return laneVersion === -1 ? null : laneVersion;
}
import { FIELD_LIFECYCLES, smooth01 } from './forceLanguage/effectLifecycle.js';
import { FlowEnvironment } from './forceLanguage/flowEnvironment.js';
import { BombFlowSurface, createBombFlowPrecompileMesh } from './forceLanguage/bombFlowSurface.js';
import { ForceParticleFlow } from './vfx/forceParticleFlow.js';

// Connected basins, throats and truthful boundaries share one CPU surface draw.
// Singularity channels use a smooth static GPU mesh; transported matter has one lazy parcel draw.
const VERTICES_PER_BOMB = 3600;
const SECTION_VERTICES = 7, SECTION_NORMALS = SECTION_VERTICES * 3, SECTION_DATA = SECTION_VERTICES * 6;
export const BOMB_PRESENTATION_MAX_VERTICES = BOMB_DRIFT.maxWorldActive * VERTICES_PER_BOMB;
const BOMB_PARTICLE_CAPACITY = BOMB_DRIFT.maxWorldActive * 16;
const COLORS = new Map(Object.entries(BOMB_DEFS).map(([id, def]) => [id, new THREE.Color(def.visual.accent)]));
const owners = new WeakMap();
const EMPTY_STATS = Object.freeze({ bombs: 0, vertices: 0, particles: 0, drawCalls: 0, overflow: 0 });
// Detonations still own the post-expiry collapse/burst. These short anticipatory shutdowns
// wind down the field's body before that handoff; its exact force boundary stays until expiry.
const BOMB_FIELD_LIFECYCLES = Object.freeze({
  singularity: Object.freeze({ ...FIELD_LIFECYCLES.well, release: 0.42 }),
  goo: Object.freeze({ ...FIELD_LIFECYCLES.cone, attack: 0.50, release: 0.66 }),
});
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
    roughness: 0.92,
    metalness: 0,
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
varying vec4 vBombSurface;
// Integrate a narrow contour over its screen footprint. Widening alone would turn a distant
// filament into a bright pixel: conserve its coverage while filtering the sharp interior.
float bombBand(float distanceToLine, float width) {
  float footprint = max(fwidth(distanceToLine), 0.0001);
  float filteredWidth = sqrt(width * width + footprint * footprint * 0.65);
  return exp(-pow(distanceToLine / filteredWidth, 2.0)) * width / filteredWidth;
}
float bombWave(float phase, float power, float meanValue) {
  float resolved = 1.0 - smoothstep(0.65, 3.14159, fwidth(phase));
  return mix(meanValue, pow(0.5 + 0.5 * sin(phase), power), resolved);
}
float bombSin(float phase) {
  return sin(phase) * (1.0 - smoothstep(0.8, 3.14159, fwidth(phase)));
}
float bombContour(float edge, float value, float width) {
  float pixel = max(fwidth(value), 0.0001);
  return smoothstep(edge - width - pixel, edge + width + pixel, value);
}`).replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= 0.13;`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float bombV = vBombSurface.x;
float bombT = vBombSurface.z;
float bombPhase = abs(vBombSurface.w);
bool bombTar = vBombSurface.w < -0.5;
bool bombFlowing = bombPhase > 0.5;
// Nested caustics advect into the throat at different speeds; the cooling channels between
// them stay dark. Their wave intersections make fine structure without final-art hash noise.
// Transport warps length and cross-flow independently. Several unequal density waves
// interact to tear open the stream; the luminous folds never fill a uniform neon sheet.
float bombFlow = bombT * 42.0 - bombPhase * 4.2;
float bombWarp = bombSin(bombT * 17.0 - bombPhase * 1.7 + bombV * 3.0);
float bombVortex = bombSin(bombV * 8.0 + bombFlow * 0.43 + bombWarp * 1.8);
float bombSpine = 0.06 + 0.23 * bombWarp + 0.10 * bombVortex;
float bombFork = 0.31 + 0.10 * bombSin(bombFlow * 0.64 - bombV * 2.0);
float bombFold = bombBand(bombV - bombSpine, 0.21);
float bombInner = bombBand(bombV - bombSpine + bombFork, 0.085);
float bombOuter = bombBand(bombV - bombSpine - bombFork * 1.45, 0.12);
float bombTransport = bombWave(bombFlow + bombVortex * 2.0, 2.0, 0.375);
float bombFiligree = bombWave(bombFlow * 2.37 + bombV * 13.0 + bombWarp * 3.0, 5.0, 0.2461);
float bombErosion = 0.5 + 0.24 * bombSin(bombFlow * 0.53 + bombVortex * 1.9)
  + 0.17 * bombSin(bombFlow * 1.17 + bombV * 9.0 - bombWarp)
  + 0.09 * bombSin(bombFlow * 2.63 - bombV * 17.0 + bombVortex);
float bombPatches = bombContour(0.49, bombErosion, 0.105);
float bombAbsorption = bombBand(bombV + 0.26 + 0.12 * bombWarp, 0.16);
float bombWorking = (bombFold + 0.72 * bombInner + 0.48 * bombOuter)
  * (0.20 + 0.80 * bombTransport) * (0.12 + 0.88 * bombPatches)
  * (1.0 - 0.62 * bombAbsorption);
float bombMicrofold = bombBand(bombV - bombSpine + 0.06 * bombSin(bombFlow * 1.7), 0.055)
  * bombFiligree * bombPatches;
bombWorking += bombMicrofold * 0.70;
float bombDrift = bombWave(bombFlow * 0.72 + bombV * 4.0, 2.0, 0.375);
float bombDensity = 0.014 + bombPatches * (0.075 + 0.40 * clamp(bombFold + bombInner + bombOuter,0.0,1.0));
float bombMatter = 0.045 * bombDrift * bombPatches;
if (bombTar) {
  // A broken chemical reaction front crawls around a heavy, mostly unlit body. Broad dark
  // cells and two unequal contour fronts replace the bright plastic spoon spine.
  float chemicalEdge = 0.72 + 0.08 * bombSin(bombT * 31.4159 - bombPhase * 1.7)
    + 0.045 * bombSin(bombT * 69.115 - bombPhase);
  float chemicalFront = bombBand(abs(bombV) - chemicalEdge, 0.070);
  float chemicalCells = bombWave(bombT * 31.4159 + bombV * 6.0 - bombPhase * 1.2, 2.0, 0.375);
  float chemicalVein = bombBand(bombV - 0.26 - 0.20 * bombSin(bombT * 18.85 - bombPhase), 0.115);
  bombWorking = chemicalFront * (0.045 + 0.95 * chemicalCells * chemicalCells)
    + chemicalVein * 0.24 * (1.0 - chemicalCells);
  // Irregular pockets dilute and reconnect. The tar retains a low, substantial body without
  // painting an opaque green floor; reaction light stays attached to the pockets' wet edges.
  float pocket = bombSin(bombT * 18.84956 - bombPhase * 0.6 + bombV * 5.0)
    + 0.48 * bombSin(bombT * 31.4159 + bombV * 8.0 + bombPhase * 0.4);
  bombDensity = (0.34 + 0.40 * bombContour(-0.15, pocket, 0.25)) * (0.72 + 0.28 * chemicalCells)
    + chemicalFront * 0.18;
  bombMatter = 0.26 * (0.25 + 0.75 * chemicalCells)
    * bombBand(bombV - 0.36 - 0.1 * bombSin(bombT * 18.85 - bombPhase), 0.45);
  if (bombT > 1.5) {
    // The basin has polar mesh coordinates, but its material lives in Cartesian space.
    // Angular stripes collapse to a pinwheel at the centre; a continuous wet reaction
    // field keeps the pole seamless and lets separate pools join and recede naturally.
    float theta = (bombT - 2.0) * 6.2831853;
    vec2 wet = vec2(cos(theta),sin(theta)) * bombV;
    float circulation = bombPhase * 1.65;
    // Curl the reaction coordinates at two speeds. Separate pockets meet and break;
    // this is advected chemistry, not a slowly rotating leaf-shaped contour.
    wet += .10 * vec2(bombSin(wet.y * 7.0 - circulation),
      bombSin(wet.x * 6.0 + circulation * .73));
    float field = 0.5 + 0.22 * bombSin(wet.x * 9.0 + bombSin(wet.y * 6.0 + circulation))
      + 0.18 * bombSin(wet.y * 11.0 - circulation + bombSin(wet.x * 5.0 - circulation))
      + 0.10 * bombSin(wet.x * 17.0 + wet.y * 13.0 + circulation);
    float pockets = bombContour(0.49, field, 0.16);
    float reaction = bombBand(field - 0.58, 0.045);
    bombDensity = 0.09 + pockets * 0.53;
    bombMatter = pockets * 0.028;
    float ignition = bombWave(wet.x * 12.0 - wet.y * 9.0 - circulation * 2.1,2.0,0.375);
    bombWorking = reaction * (0.04 + 1.05 * ignition * ignition);
    bombMatter += pockets * ignition * .065;
  }
  diffuseColor.rgb *= 1.8;
} else if (!bombFlowing) {
  bombWorking = 0.12 + 0.65 * bombBand(bombV - 0.12, 0.20);
  bombDensity = 1.0;
}
float bombGrazing = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
float bombEdge = 1.0 - bombContour(bombTar ? 0.97 : 0.94, abs(bombV), bombTar ? 0.028 : 0.048);
float bombTips = bombTar || !bombFlowing ? 1.0
  : bombContour(0.018, bombT, 0.015) * (1.0 - bombContour(0.985, bombT, 0.012));
float bombRadiance = bombTar ? 1.55 : !bombFlowing ? 1.9 : 2.4;
vec3 bombLight = vColor.rgb;
// Thin singularity channels compensate their own local density (floor .22, cap ~3 scaled); alpha
// still reads bombDensity unmodified.
float bombComp = (bombFlowing && !bombTar) ? min(3.0, 1.0 / max(0.22, bombDensity)) * 0.55 : 1.0;
if (bombFlowing && !bombTar) {
  // Travelling surges ride this bomb's own phase; cool-white lift stays on the sharpest crests.
  float bombSurge = bombWave(bombT * 6.0 - bombPhase * 0.9 + bombV * 2.0, 2.0, 0.30);
  bombWorking *= 1.0 + 0.55 * bombSurge;
  bombLight = mix(bombLight, vec3(0.80,0.94,1.0), clamp(bombMicrofold * 0.72,0.0,0.55));
  totalEmissiveRadiance += vec3(0.82,0.93,1.0) * vBombSurface.y
    * pow(min(bombWorking, 1.35), 3.0) * (0.45 + 0.55 * bombSurge) * bombComp;
}
totalEmissiveRadiance += bombLight * vBombSurface.y * (0.025 + bombMatter + bombWorking * bombRadiance) * bombComp * (0.80 + 0.20 * bombGrazing);
diffuseColor.a *= bombEdge * bombTips * clamp(bombDensity, 0.0, 0.72);`);
  };
  material.customProgramCacheKey = () => 'bomb-transport-volume-v7';
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
  mesh.add(createBombFlowPrecompileMesh(createBombTelegraphMaterial));
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
    this.cooling = 0;
    this.environment = new FlowEnvironment();
    this.environments = [this.environment];
    this.environmentSample = { dx: 0, dz: 0, lift: 0, contact: 0, vx: 0, vz: 0 };
    this.deformBody = false;
    this.bodyX = this.bodyZ = this.bodyRadius = 0;
    this.transportAge = 0;
    this.shutdownAge = Infinity;
    this.releaseDuration = .42;
    this.sectionA = new Float64Array(SECTION_DATA + 4);
    this.sectionB = new Float64Array(SECTION_DATA + 4);
    this.particles = null;
    this.flow = null;
    this.flowRequest = { x:0, z:0, radius:1, time:0, envelope:1, seed:0, angle:0,
      r:1, g:1, b:1, opacity:1, transportAge:0, shutdownAge:0, releaseDuration:.42,
      cooling:0, heatScale:1, environment:null };
    this.particleOptions = { reducedMotion: false, reducedFlash: false };
    this.particleBurst = { kind: 'well', x: 0, y: 0.8, z: 0, radius: 1, seed: 0, count: 2,
      life: 1, strength: 1, age: 0, deferUpload: true };
    this.stats = { bombs: 0, vertices: 0, particles: 0, drawCalls: 0, overflow: 0 };
    this.count = 0;
    this.disposed = false;
    // Quiet settled flight: after the first bomb owner exists, empty ticks still
    // paid frustum rebuild + a11y + source walk + setDrawRange(0)/visible=false
    // every frame. Latch after first empty publish; wake on entityIndexVersion
    // or bombs.length. Soft-GPU fps not claimed.
    this._quietEmpty = false;
    this._quietVersion = -1;
  }
  // Cheap dirty wake for quiet bomb-telegraph latch — entityIndexVersion only.
  // No index (version null) refuses the latch so entityList fallback stays truthful.
  // False-wake falls through to one full update and re-latches when empty.
  _quietMaybeAwake(state) {
    const version = bombMembershipVersion(state);
    if (version == null) return true;
    return version !== this._quietVersion;
  }
  update(state, source, alpha) {
    if (this.disposed) return;
    // Quiet settled flight: empty bomb telegraph still paid frustum rebuild + a11y
    // + source walk + setDrawRange(0)/visible=false every tick after the owner was
    // created by a prior bomb. Latch after first empty publish; wake on
    // entityIndexVersion. Soft-GPU fps not claimed.
    if (this._quietEmpty) {
      if (!this._quietMaybeAwake(state)) return;
      this._quietEmpty = false;
    }
    this.count = 0;
    this.flow?.begin();
    const stats = this.stats;
    stats.bombs = stats.vertices = stats.particles = stats.drawCalls = stats.overflow = 0;
    // The small live emission window is sampled from each deployment's local sim age.
    // Recycle the same objects; paused/replayed frames cannot accumulate or drift particles.
    if (this.particles?.live) this.particles.clear();
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
      this.cooling = 0;
      if (d.phase === 'field' && def.field) {
        const f = def.field;
        const envelope = bombFieldEnvelope(now, d.fieldStartedAt, f.durationS, f.endStrength ?? 1);
        if (envelope <= 0) continue;
        const age = Math.max(0, now - (Number(d.fieldStartedAt) || 0));
        const born = Number(d.fieldStartedAt) || 0;
        const recipe = BOMB_FIELD_LIFECYCLES[f.kind] || BOMB_FIELD_LIFECYCLES.goo;
        const shutdownAt = born + f.durationS - recipe.release;
        this.cooling = smooth01((now - shutdownAt) / recipe.release);
        this.transportAge = age;
        this.shutdownAge = f.durationS - recipe.release;
        this.releaseDuration = recipe.release;
        // Each admitted field retains its query cache; switching between 24 bombs must
        // not invalidate one shared sampler and rescan the neighborhood every frame.
        const environmentSlot = stats.bombs - 1;
        this.environment = this.environments[environmentSlot]
          || (this.environments[environmentSlot] = new FlowEnvironment());
        this.environment.update(state, x, z, def.radius, bomb.id, alpha);
        // Paths occupy the real field from the outset. Matter arrives along them at
        // different times; shutdown stops supply, it never plays establishment backward.
        this.field(x, z, def.radius, f.kind, moving ? age : 0, envelope, r, g, b, seed,
          1, 1);
        if (moving) this.fieldParticles(x, z, def.radius, f.kind, age, f.durationS - recipe.release,
          seed, envelope, 1, this.cooling, accessibility);
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
    this.flow?.end();
    stats.vertices = this.count + (this.flow?.count || 0) * (this.flow?.geometry.attributes.position.count || 0);
    if (this.particles?.live) this.particles.publish();
    stats.particles = this.particles?.live || 0;
    stats.drawCalls = (this.count > 0 ? 1 : 0) + (stats.particles > 0 ? 1 : 0) + (this.flow?.count > 0 ? 1 : 0);
    // Fully idle empty (no bombs, no aftermath parcels or particles still animating)
    // → quiet latch when membership version is trustworthy. Soft-GPU fps not claimed.
    if (this.count === 0 && stats.particles === 0 && (this.flow?.count || 0) === 0) {
      const version = bombMembershipVersion(state);
      if (version != null) {
        this._quietEmpty = true;
        this._quietVersion = version;
      } else {
        this._quietEmpty = false;
        this._quietVersion = -1;
      }
    } else {
      this._quietEmpty = false;
    }
  }
  fieldParticles(x, z, radius, kind, age, shutdownAge, seed, envelope, growth, cooling, accessibility) {
    if (kind !== 'singularity' && kind !== 'goo') return;
    const goo = kind === 'goo', interval = goo ? 0.28 : 0.19, life = goo ? 1.6 : 0.94;
    const start = 0.10 + seed / (Math.PI * 2) * 0.11;
    const last = Math.floor((Math.min(age, shutdownAge) - start) / interval);
    if (last < 0) return;
    if (!this.particles) this.particles = new ForceParticleFlow(this.mesh, { capacity: BOMB_PARTICLE_CAPACITY });
    const p = this.particleBurst;
    this.particleOptions.reducedFlash = accessibility.id === 'reduced-flash'
      || accessibility.id === 'reduced-motion-and-flash';
    this.particles.update(0, this.particleOptions);
    p.kind = goo ? 'goo' : 'well'; p.x = x; p.z = z;
    // Leave room for the parcel's own extent inside the truthful force boundary.
    p.radius = radius * Math.max(0.05, growth) * (goo ? 0.94 : 0.90);
    p.life = life; p.strength = envelope * (1 - cooling * 0.86);
    const first = Math.max(0, Math.ceil((age - life - start) / interval));
    for (let pulse = first; pulse <= last; pulse++) {
      p.seed = seed + pulse * 0.61803398875;
      p.age = Math.max(0, age - start - pulse * interval);
      // Late parcels finish their own traversal before the authoritative field expires;
      // they cannot survive as a bright cohort that vanishes at entity removal.
      p.life = Math.min(life, Math.max(.05, shutdownAge + this.releaseDuration - start - pulse * interval));
      p.environment = this.environment;
      this.particles.emit(p);
    }
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
    this.deformBody = false;
    this.surfacePhase = this.surfaceAlong = 0;
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
    this.bodyX = x; this.bodyZ = z; this.bodyRadius = radius;
    this.deformBody = true;
    if (kind === 'singularity') this.gravityWell(x, z, radius, time, envelope, r, g, b, seed, opacity);
    else this.tarCloud(x, z, radius, time, envelope, r, g, b, seed, opacity);
    this.deformBody = false;
    this.surfaceHeat = 1.4;
    this.surfaceAcross = 0;
  }
  gravityWell(x, z, radius, time, envelope, r, g, b, seed, opacity = 1) {
    // Dark throat with a shallow counter-turning lip; the core is a cavity, never a glow ball.
    // Continuous angles close the seam, unlike the old twelve-sided disconnected polygon rim.
    this.surfaceHeat = 0.08;
    const core = radius * 0.055;
    for (let i = 0; i < 40; i++) {
      const a0 = i * Math.PI / 20, a1 = (i + 1) * Math.PI / 20;
      // Capture closes in unequal sectors only after inflowing matter reaches the throat.
      // On loss of supply the lip tears at different angles while the flow still moves.
      const sector = smooth01((this.transportAge - 0.22 - 0.11 * Math.sin(a0 * 3 + seed)) / 0.28)
        * (1 - smooth01((this.cooling - 0.32 - 0.20 * Math.sin(a0 * 5 + seed)) / 0.46));
      const q0 = 1 + 0.10 * Math.sin(a0 * 3 + time * 0.8 + seed);
      const q1 = 1 + 0.10 * Math.sin(a1 * 3 + time * 0.8 + seed);
      const x0 = x + Math.cos(a0) * core * q0, z0 = z + Math.sin(a0) * core * q0;
      const x1 = x + Math.cos(a1) * core * q1, z1 = z + Math.sin(a1) * core * q1;
      this.tri(x, -Math.min(4, radius * 0.035), z, x0, -0.8, z0, x1, -0.8, z1,
        0.035 * r, 0.045 * g, 0.055 * b, opacity * 0.92 * sector, 0, 0, 0, 0, 0, 0);
      this.tri(x0, -0.8, z0, x + (x0 - x) * 1.52, .45, z + (z0 - z) * 1.52,
        x + (x1 - x) * 1.52, .45, z + (z1 - z) * 1.52,
        r * 0.10, g * 0.13, b * 0.17, opacity * 0.72 * sector, 0, 0, 0, 0, 0, 0);
      this.tri(x0, -0.8, z0, x + (x1 - x) * 1.52, .45, z + (z1 - z) * 1.52,
        x1, -0.8, z1, r * 0.10, g * 0.13, b * 0.17, opacity * 0.72 * sector, 0, 0, 0, 0, 0, 0);
    }
    // A shared low accretion basin physically joins the unequal inflows to the throat.
    // It carries intermittent luminous eddies, not a solid disc or three detached fans.
    for (let i = 0; i < 40; i++) for (let j = 0; j < 2; j++) {
      const a0=i/40,a1=(i+1)/40,u0=j/2,u1=(j+1)/2;
      this.accretionVertex(x,z,radius,a0,u0,time,seed,r,g,b,opacity);
      this.accretionVertex(x,z,radius,a0,u1,time,seed,r,g,b,opacity);
      this.accretionVertex(x,z,radius,a1,u0,time,seed,r,g,b,opacity);
      this.accretionVertex(x,z,radius,a1,u0,time,seed,r,g,b,opacity);
      this.accretionVertex(x,z,radius,a0,u1,time,seed,r,g,b,opacity);
      this.accretionVertex(x,z,radius,a1,u1,time,seed,r,g,b,opacity);
    }
    // Retain only descriptors per frame. Curvature and contact normals are evaluated
    // on the GPU, so a long bend never exposes a handful of CPU polygon stations.
    if (!this.flow) {
      this.flow = new BombFlowSurface(this.scene, createBombTelegraphMaterial);
      this.flow.begin();
    }
    const request = this.flowRequest;
    request.x=x; request.z=z; request.radius=radius; request.time=time;
    request.envelope=envelope; request.r=r; request.g=g; request.b=b;
    request.opacity=opacity*.88; request.transportAge=this.transportAge;
    request.shutdownAge=this.shutdownAge; request.releaseDuration=this.releaseDuration;
    request.cooling=this.cooling; request.heatScale=this.heatScale;
    request.environment=this.environment;
    for (let i=0;i<3;i++) {
      request.seed=seed+i*1.917;
      request.angle=i*Math.PI*2/3+seed*.13+Math.sin(seed+i*2.1)*.31;
      this.flow.add(request);
    }
  }
  accretionVertex(x,z,radius,theta,u,time,seed,r,g,b,opacity) {
    const angle=theta*Math.PI*2-time*(.12+.48*(1-u)*(1-u)),ca=Math.cos(angle),sa=Math.sin(angle);
    const reach=radius*(.078+u*(.31+.052*Math.sin(angle*3-time*.45+seed)));
    const elevation=radius*(-.025+.071*u)+radius*.025*u*Math.sin(angle*2+u*4-time*.7+seed);
    const slope=.22+.12*Math.sin(angle*2+u*4-time*.7+seed);
    const length=Math.hypot(1,slope);
    this.nx=-ca*slope/length;this.ny=1/length;this.nz=-sa*slope/length;
    this.surfaceAcross=u*2-1;this.surfaceAlong=theta;
    this.surfacePhase=1+seed+time*.9;this.surfaceHeat=.8*(1-this.cooling*.78);
    // Recirculation emerges after independent feeder streams establish the basin.
    const mature=smooth01((this.transportAge-.65-.16*Math.sin(theta*19+seed))/.55);
    const tearing=1-smooth01((this.cooling-.10-.18*Math.sin(theta*23+u*7+seed))/.72);
    this.vertex(x+ca*reach,elevation,z+sa*reach,r*.42,g*.42,b*.55,opacity*.62*mature*tearing);
  }
  tarCloud(x, z, radius, time, envelope, r, g, b, seed, opacity = 1) {
    // One coherent viscous volume, with unequal lobes joined through a low central basin.
    // The dark body is only part of the influence footprint; chemical light stays on its
    // moving reaction contours. This is shaped matter, not five disconnected green petals.
    for (let i = 0; i < 32; i++) {
      const a0 = i / 32, a1 = (i + 1) / 32;
      for (let j = 0; j < 8; j++) {
        const u0 = j / 8, u1 = (j + 1) / 8;
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
      time, envelope, seed + i * 2.137, i * 2.3 + seed * 0.11, 18, r, g, b, opacity * 0.74);
    this.surfacePhase = this.surfaceAlong = 0;
  }
  tarVertex(x, z, radius, theta, u, time, envelope, seed, r, g, b, opacity) {
    const a = theta * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const extent = radius * (0.67 + 0.095 * Math.sin(a * 3 + seed)
      + 0.085 * Math.sin(a * 5 - seed + time * 0.23));
    const wave = a * 3 + u * 8 - time * 1.35 + seed;
    const belly = Math.sin(Math.PI * u), lobe = 0.72 + 0.28 * Math.sin(wave);
    const depth = Math.min(4, radius * 0.15);
    const height = depth * belly * lobe * envelope * (1 - this.cooling * 0.86);
    const slope = depth * (Math.PI * Math.cos(Math.PI * u) * lobe
      + belly * 2.24 * Math.cos(wave)) * envelope * (1 - this.cooling * 0.86);
    const n = Math.hypot(extent, slope) || 1;
    this.nx = -ca * slope / n; this.ny = extent / n; this.nz = -sa * slope / n;
    this.surfaceAcross = u;
    this.surfaceAlong = 2 + theta;
    this.surfacePhase = -(1 + seed + time * 0.34);
    this.surfaceHeat = 1.6 * envelope * (1 - this.cooling * 0.78);
    this.vertex(x + ca * extent * u, 0.7 + height, z + sa * extent * u,
      r * 0.72, g * 0.80, b * 0.68, opacity * 0.76 * this.tarCoverage(u, a, seed));
  }
  tarCoverage(u, angle, seed) {
    // Three uneven nucleation sites spread locally, coalesce, then perforate in place.
    // Their draining pores are unrelated to the initial fronts, never reverse growth.
    const px=Math.cos(angle)*u, pz=Math.sin(angle)*u;
    let arrival=Infinity;
    for(let i=0;i<3;i++) {
      const a=seed+i*2.17, reach=.22+i*.16;
      const distance=Math.hypot(px-Math.cos(a)*reach,pz-Math.sin(a)*reach);
      arrival=Math.min(arrival,.05+i*.075+distance*(.62+i*.11));
    }
    const fed=smooth01((this.transportAge-arrival)/.22);
    const pores=.34+.19*Math.sin(px*11+pz*7+seed)+.11*Math.sin(pz*19-px*4-seed);
    return fed*(1-smooth01((this.cooling-pores)/.36));
  }
  // Cross-sections are sampled coherently at both ends of every segment. The folded surface
  // has seven vertices across a deep rolled profile, avoiding flat ribbons and faceted kinks.
  swept(x, z, radius, time, envelope, seed, angle, steps, r, g, b, opacity) {
    const a = this.sectionA, bSection = this.sectionB;
    this.sampleSection(a, 0, x, z, radius, time, envelope, seed, angle);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      this.sampleSection(bSection, u, x, z, radius, time, envelope, seed, angle);
      for (let j = 0; j < SECTION_VERTICES - 1; j++) {
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
    this.surfaceAcross = j / (SECTION_VERTICES - 1) * 2 - 1;
    this.surfaceHeat = section[SECTION_DATA];
    this.surfaceAlong = section[SECTION_DATA + 1]; this.surfacePhase = section[SECTION_DATA + 2];
    this.nx = section[p + SECTION_NORMALS]; this.ny = section[p + SECTION_NORMALS + 1]; this.nz = section[p + SECTION_NORMALS + 2];
    this.vertex(section[p], section[p + 1], section[p + 2], r, g, b, opacity * section[SECTION_DATA + 3]);
  }
  sampleSection(out, u, x, z, radius, time, envelope, seed, angle) {
    let cx, cz, cy, nx, nz, width, fold;
    const belly = Math.sin(Math.PI * u);
    const crest = Math.pow(0.5 + 0.5 * Math.cos(u * 10.2 - time * 1.05 + seed), 4);
    out[SECTION_DATA] = (1.0 + crest * 1.7) * (0.40 + envelope * 0.60) * (1 - this.cooling * 0.78);
    out[SECTION_DATA + 1] = u;
    out[SECTION_DATA + 2] = -(1 + seed + time * .34);
    out[SECTION_DATA + 3] = this.tarCoverage(u, angle, seed);
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const side = radius * (0.12 * Math.sin(u * 6.2 + seed)
      + 0.032 * Math.sin(time * 1.38 + seed + u * 4.5) * belly);
    const along = radius * (0.10 + u * 0.86);
    cx = x + ca * along - sa * side; cz = z + sa * along + ca * side;
    nx = -sa; nz = ca;
    const lumps = 0.71 + 0.22 * Math.sin(u * 11.8 - time * 1.72 + seed)
      + 0.07 * Math.sin(u * 23.4 + time * .91 + seed * 2);
    width = Math.min(6, radius * (0.012 + 0.24 * Math.pow(Math.max(0, belly), 0.8))) * lumps * (1 - u * 0.5);
    cy = 0.6 + Math.min(1.6, radius * 0.019) * belly * (1 + Math.sin(u * 8.8 - time * 1.25 + seed));
    fold = Math.min(3.5, radius * 0.145) * Math.pow(Math.max(0, belly), 0.8)
      * (0.80 + 0.20 * Math.sin(u * 12.2 - time * 1.52 + seed)) * envelope * (1 - this.cooling * 0.86);
    for (let j = 0; j < SECTION_VERTICES; j++) {
      const v = j / (SECTION_VERTICES - 1) * 2 - 1, p = j * 3;
      // The heavy wet fold joins its underlying basin with real sidewalls.
      const lateral = v * width;
      const vertical = (1 - v * v) * fold + Math.sin(v * 2.5) * fold * 0.34;
      const dx = width;
      const dy = -2 * v * fold + Math.cos(v * 2.5) * fold * 0.85;
      let px = cx - x + nx * lateral, pz = cz - z + nz * lateral;
      const extent = Math.hypot(px, pz), clamp = Math.min(1, radius / Math.max(0.001, extent));
      out[p] = x + px * clamp;
      out[p + 1] = cy + vertical;
      out[p + 2] = z + pz * clamp;
      const len = Math.hypot(dx, dy) || 1;
      out[p + SECTION_NORMALS] = -nx * dy / len;
      out[p + SECTION_NORMALS + 1] = dx / len;
      out[p + SECTION_NORMALS + 2] = -nz * dy / len;
    }
  }
  face(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    this.nx = nx / len; this.ny = ny / len; this.nz = nz / len;
  }
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, r, g, b, opacity,
    av = 0, bv = -1, cv = 1, au = 0, bu = 1, cu = 1) {
    if (this.count + 3 > BOMB_PRESENTATION_MAX_VERTICES) return;
    this.face(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.surfaceAcross = av; this.surfaceAlong = au;
    this.vertex(ax, ay, az, r, g, b, opacity);
    this.surfaceAcross = bv; this.surfaceAlong = bu;
    this.vertex(bx, by, bz, r, g, b, opacity);
    this.surfaceAcross = cv; this.surfaceAlong = cu;
    this.vertex(cx, cy, cz, r, g, b, opacity);
    this.surfaceAcross = this.surfaceAlong = 0;
  }
  ribbon(ax, az, bx, bz, width, r, g, b, opacity, ay = 0.55, by = 0.55) {
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    if (length < 1e-6 || this.count + 6 > BOMB_PRESENTATION_MAX_VERTICES) return;
    const nx = -dz / length * width / 2, nz = dx / length * width / 2;
    this.tri(ax + nx, ay, az + nz, ax - nx, ay, az - nz, bx + nx, by, bz + nz,
      r, g, b, opacity, -1, 1, -1, 0, 0, 1);
    this.tri(bx + nx, by, bz + nz, ax - nx, ay, az - nz, bx - nx, by, bz - nz,
      r, g, b, opacity, -1, 1, 1, 1, 0, 1);
  }
  vertex(x, y, z, r, g, b, opacity) {
    if (this.count >= BOMB_PRESENTATION_MAX_VERTICES) return;
    let contact = 0;
    if (this.deformBody && this.environment.count) {
      const response=this.environment.samplePoint(x,z,this.environmentSample);
      // Deflect cosmetic matter at the actual surface; neither move the body nor imply
      // a different danger radius. Contacts compress the flow into a raised hot seam.
      let dx=x+response.dx-this.bodyX, dz=z+response.dz-this.bodyZ;
      const bounded=Math.min(1,this.bodyRadius/Math.max(.001,Math.hypot(dx,dz)));
      x=this.bodyX+dx*bounded; z=this.bodyZ+dz*bounded;
      y+=response.lift; contact=response.contact;
    }
    const p = this.count * 3, c = this.count * 4;
    this.positions[p] = x; this.positions[p + 1] = y; this.positions[p + 2] = z;
    this.normals[p] = this.nx; this.normals[p + 1] = this.ny; this.normals[p + 2] = this.nz;
    this.colors[c] = r; this.colors[c + 1] = g; this.colors[c + 2] = b; this.colors[c + 3] = opacity;
    this.surfaces[c] = this.surfaceAcross;
    this.surfaces[c + 1] = (this.surfaceHeat + contact * 1.5) * this.heatScale;
    this.surfaces[c + 2] = this.surfaceAlong;
    this.surfaces[c + 3] = this.surfacePhase;
    this.count++;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._quietEmpty = false;
    this._quietVersion = -1;
    this.particles?.dispose();
    this.flow?.dispose();
    this.scene.remove(this.mesh);
    this.geometry.dispose(); this.material.dispose();
  }
}
