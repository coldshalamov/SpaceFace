// Region-shaped populations of genuinely distant stars, not clouds/rocks drawn as glow cards.
// One static, interleaved point buffer; one draw; no textures, lights, raymarch or frame uploads.
import * as THREE from 'three';

// One entry per deep-field structure recipe (src/render/deepFieldStructureRecipes.js). Every
// authored recipe has a formation so no region's sky is silently dark: `core_trade_constellation`
// is the DEFAULT_STRUCTURE fallback and the core-class sectors, `galactic_spur` is the galactic
// band. Anchor/span are NDC at the shipping camera; parallax is the sky's slide per WU flown.
export const STELLAR_FORMATIONS = Object.freeze([
  Object.freeze({ recipe: 'helios_orbital_void', name: 'distant-edge-on-spiral', shape: 'spiral',
    anchor: [-0.48, 0.42], span: 0.53, tilt: -0.20, flatten: 0.24,
    cool: '#7698c9', warm: '#e9c796', intensity: 0.52, parallax: 0.012 }),
  Object.freeze({ recipe: 'belt_broken_dust_lane', name: 'amber-stellar-river', shape: 'stream',
    anchor: [-0.16, 0.52], span: 0.76, tilt: 0.13, flatten: 0.58,
    cool: '#b29c82', warm: '#eed0a0', intensity: 0.40, parallax: 0.016 }),
  Object.freeze({ recipe: 'fringe_tidal_filament', name: 'blue-flocculent-spiral', shape: 'spiral',
    anchor: [0.38, 0.47], span: 0.49, tilt: -0.42, flatten: 0.62,
    cool: '#709dcf', warm: '#ded1b4', intensity: 0.62, parallax: 0.010 }),
  Object.freeze({ recipe: 'anomaly_electromagnetic_scar', name: 'divided-stellar-stream', shape: 'fork',
    anchor: [-0.38, 0.44], span: 0.61, tilt: 0.42, flatten: 0.70,
    cool: '#668ac5', warm: '#abb9d9', intensity: 0.54, parallax: 0.014 }),
  // The trade core: a populous spiral seen nearly face-on, warm-white, opposite the flight corridor.
  Object.freeze({ recipe: 'core_trade_constellation', name: 'populous-core-spiral', shape: 'spiral',
    anchor: [0.46, 0.40], span: 0.50, tilt: 0.62, flatten: 0.84,
    cool: '#8ea4c9', warm: '#f1ddb6', intensity: 0.46, parallax: 0.011 }),
  // The galactic band: one wide, gently tilted stellar stream across the top of the glass.
  Object.freeze({ recipe: 'galactic_spur', name: 'wide-galactic-band', shape: 'stream',
    anchor: [0.04, 0.50], span: 0.88, tilt: -0.09, flatten: 0.52,
    cool: '#9db0d0', warm: '#e6d8bf', intensity: 0.44, parallax: 0.013 }),
]);
const FAMILIES = STELLAR_FORMATIONS.length;
export const STELLAR_CAPACITY_PER_FORMATION = 8192;
const SKY_DEPTH = -160;
const WEIGHT_DARK = 1e-4;

export function stellarFormationIndex(recipeId) {
  return STELLAR_FORMATIONS.findIndex((entry) => entry.recipe === recipeId);
}

function randomStream(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seeded stellar population sampling, not a noise texture or an animated density field.
// The explicit arm/stream trajectories own the large-scale form; individual stars fill them.
export function sampleStellarFormation(shape, random, out) {
  const a = Math.max(1e-7, random());
  const gaussian = Math.min(3, Math.sqrt(-2 * Math.log(a))) * Math.cos(2 * Math.PI * random());
  let x, y, radius;
  if (shape === 'spiral') {
    const family = random();
    if (family < 0.16) {
      radius = Math.min(0.40, -Math.log(Math.max(1e-7, random())) * 0.12);
      const angle = random() * Math.PI * 2;
      x = Math.cos(angle) * radius; y = Math.sin(angle) * radius * 0.86;
    } else {
      radius = Math.pow(random(), 1.10) * 0.97;
      const branch = random() < 0.5 ? 0 : Math.PI;
      // Two open, winding arms, with a small diffuse disk population between them.
      const angle = family < 0.73
        ? branch + 2.25 * Math.log(1 + radius * 5) + gaussian * (0.14 + radius * 0.24)
        : random() * Math.PI * 2;
      const breadth = (random() - 0.5) * 0.055;
      x = Math.cos(angle) * radius + breadth;
      y = Math.sin(angle) * radius + breadth * 0.6;
    }
  } else {
    const t = random();
    x = t * 2 - 1;
    const branch = random() < 0.66 ? 1 : -1;
    const envelope = Math.sin(Math.PI * t);
    y = shape === 'fork'
      ? branch * (0.06 + 0.32 * Math.pow(1 - t, 1.55)) + 0.10 * Math.sin(t * 4.5)
      : 0.15 * Math.sin(t * 5.2) + branch * 0.055 * envelope;
    y += gaussian * (0.025 + 0.037 * envelope);
    // Ends lose stars/radiance gradually; no shared rectangular or circular cut-off.
    radius = 0.35 + Math.abs(x) * 0.65;
  }
  out[0] = x; out[1] = y; out[2] = radius;
  return out;
}

// Per-family weight and phase live in float arrays indexed by the star's family attribute. Uniform
// arrays may be indexed dynamically in a vertex shader (GLSL ES 1.00 App. A and ES 3.00), so the
// family count is a data fact, not a vec4 ceiling.
const VERTEX = /* glsl */`
  #define SF_FAMILIES ${FAMILIES}
  attribute vec3 aStellarColor;
  attribute float aStellarSize;
  attribute float aStellarFamily;
  uniform float uWeights[SF_FAMILIES];
  uniform float uPhaseX[SF_FAMILIES];
  uniform float uPhaseZ[SF_FAMILIES];
  uniform vec2 uRootOffset;
  uniform float uPixelScale, uDensity;
  varying vec3 vColor;
  varying float vFlux;
  void main() {
    int family = int(aStellarFamily + 0.5);
    float weight = uWeights[family];
    vColor = aStellarColor;
    vFlux = 0.0;
    if (weight < 0.00001) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 1.0;
      return;
    }
    vec3 p = position;
    p.x += uRootOffset.x - uPhaseX[family];
    p.z += uRootOffset.y - uPhaseZ[family];
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float projected = aStellarSize * uPixelScale / max(1.0, -mv.z);
    gl_PointSize = clamp(projected * sqrt(uDensity), 0.8, 4.5);
    vFlux = weight * min(1.0, projected * projected);
  }
`;
const FRAGMENT = /* glsl */`
  precision highp float;
  varying vec3 vColor;
  varying float vFlux;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 >= 1.0 || vFlux < 0.00001) discard;
    // Tiny distant stars are the explicit sky-only point-sprite exception.
    float aperture = 1.0 - smoothstep(0.04, 1.0, r2);
    gl_FragColor = vec4(vColor, aperture * vFlux);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const sizeScratch = new THREE.Vector2();

function retireFormation(record) {
  if (!record) return;
  if (record.points.parent) record.points.parent.remove(record.points);
  record.points.geometry.dispose();
  record.points.material.dispose();
}

/** What the placement depends on. Same signature → the existing buffers are exactly right. */
function placementSignature(background, camera, bufferHeight) {
  return [
    background.seed >>> 0, background.tierName || '', background.lowTier ? 1 : 0,
    camera.aspect.toFixed(5), camera.fov, Number(background.bgY) || 0, Number(background.H) || 0,
    bufferHeight,
  ].join('|');
}

function createFormationRecord(background) {
  const count = STELLAR_CAPACITY_PER_FORMATION * FAMILIES;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aStellarColor', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aStellarSize', new THREE.BufferAttribute(new Float32Array(count), 1));
  geometry.setAttribute('aStellarFamily', new THREE.BufferAttribute(new Float32Array(count), 1));
  const uniforms = {
    uWeights: { value: new Array(FAMILIES).fill(0) },
    uPhaseX: { value: new Array(FAMILIES).fill(0) },
    uPhaseZ: { value: new Array(FAMILIES).fill(0) },
    uRootOffset: { value: new THREE.Vector2() },
    uPixelScale: { value: 1 }, uDensity: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'SpaceFace_ResolvedStellarFormation', vertexShader: VERTEX, fragmentShader: FRAGMENT,
    uniforms, transparent: true, depthTest: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'DeepField_ResolvedStellarFormation';
  points.renderOrder = -85;
  points.frustumCulled = false;
  const record = {
    points, family: -1, lastTime: null, activeStars: 0, attributeBytes: count * 8 * 4,
    signature: null, anchorX: 0, anchorZ: 0, rebuilds: 0, refills: 0,
  };
  const period = Math.max(4000, (Number(background.H) || 0) * 80);
  function phase(value) { return ((value + period * 0.5) % period + period) % period - period * 0.5; }
  points.onBeforeRender = (renderer, scene, renderCamera) => {
    const next = stellarFormationIndex(background.deepFieldRecipe?.id);
    const now = Number(background.bgTime) || 0;
    const dt = record.lastTime == null ? 0 : Math.max(0, Math.min(0.1, now - record.lastTime));
    const ease = record.lastTime == null ? 1 : 1 - Math.exp(-dt / 0.32);
    record.lastTime = now;
    record.family = next;
    const frameOrigin = background.state?.world?.frameOrigin;
    const globalX = renderCamera.position.x + (Number(frameOrigin?.x) || 0);
    const globalZ = renderCamera.position.z + (Number(frameOrigin?.z) || 0);
    const weights = uniforms.uWeights.value;
    const phaseX = uniforms.uPhaseX.value;
    const phaseZ = uniforms.uPhaseZ.value;
    let lit = false;
    for (let i = 0; i < FAMILIES; i++) {
      const target = i === next ? STELLAR_FORMATIONS[i].intensity : 0;
      weights[i] += (target - weights[i]) * ease;
      if (weights[i] < WEIGHT_DARK) weights[i] = 0;
      else lit = true;
      phaseX[i] = phase((globalX - record.anchorX) * STELLAR_FORMATIONS[i].parallax);
      phaseZ[i] = phase((globalZ - record.anchorZ) * STELLAR_FORMATIONS[i].parallax);
    }
    const perFamily = background.lowTier ? 2048 : background.tierName === 'mid' ? 4096 : 8192;
    // A region with no formation submits no vertices: draw range zero, not 49k early-outs.
    geometry.setDrawRange(0, lit ? perFamily * FAMILIES : 0);
    record.activeStars = next < 0 ? 0 : perFamily;
    uniforms.uDensity.value = STELLAR_CAPACITY_PER_FORMATION / perFamily;
    uniforms.uRootOffset.value.set(renderCamera.position.x - background.group.position.x,
      renderCamera.position.z - background.group.position.z);
    renderer.getDrawingBufferSize(sizeScratch);
    uniforms.uPixelScale.value = sizeScratch.y * renderCamera.projectionMatrix.elements[5] * 0.5;
  };
  return record;
}

/** Fill the record's buffers in place for this camera. Positions are relative to the camera. */
function fillFormation(record, background, camera, pixelScale) {
  const geometry = record.points.geometry;
  const positions = geometry.getAttribute('position').array;
  const colors = geometry.getAttribute('aStellarColor').array;
  const sizes = geometry.getAttribute('aStellarSize').array;
  const families = geometry.getAttribute('aStellarFamily').array;
  const point = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const sample = [0, 0, 0];
  const depth = background.bgY + SKY_DEPTH;
  for (let family = 0; family < FAMILIES; family++) {
    const spec = STELLAR_FORMATIONS[family];
    const random = randomStream((background.seed ^ (0x193f17 * (family + 1))) >>> 0);
    const cool = new THREE.Color(spec.cool), warm = new THREE.Color(spec.warm);
    const ct = Math.cos(spec.tilt), st = Math.sin(spec.tilt);
    for (let i = 0; i < STELLAR_CAPACITY_PER_FORMATION; i++) {
      // Interleaving makes every low-quality prefix retain every regional population.
      const index = i * FAMILIES + family;
      sampleStellarFormation(spec.shape, random, sample);
      // A galaxy's central population is thicker than its disk. A single flattened nucleus
      // reads like a white needle; diffuse arms need width, not closed concentric point rings.
      const roundCore = spec.shape === 'spiral' ? Math.exp(-sample[2] * 11) : 0;
      const sx = sample[0], sy = sample[1] * (spec.flatten + (0.80 - spec.flatten) * roundCore);
      const nx = spec.anchor[0] + (sx * ct - sy * st) * spec.span;
      const ny = spec.anchor[1] + (sx * st + sy * ct) * spec.span * camera.aspect;
      point.set(nx, ny, 0.5).unproject(camera).sub(camera.position);
      const t = (depth - camera.position.y) / Math.min(-1e-5, point.y);
      point.multiplyScalar(t).add(camera.position);
      projected.copy(point).applyMatrix4(camera.matrixWorldInverse);
      positions[index * 3] = point.x - camera.position.x;
      positions[index * 3 + 1] = SKY_DEPTH;
      positions[index * 3 + 2] = point.z - camera.position.z;
      const central = Math.pow(Math.max(0, 1 - sample[2]), 3.2);
      const end = spec.shape === 'spiral' ? 1 - 0.75 * Math.pow(sample[2], 4)
        : Math.pow(Math.max(0, 1 - Math.abs(sample[0])), 0.45);
      const energy = (0.10 + random() * 0.27 + central * 0.06) * end;
      colors[index * 3] = (cool.r + (warm.r - cool.r) * central) * energy;
      colors[index * 3 + 1] = (cool.g + (warm.g - cool.g) * central) * energy;
      colors[index * 3 + 2] = (cool.b + (warm.b - cool.b) * central) * energy;
      sizes[index] = (2.5 + random() * 1.3) * Math.max(1, -projected.z) / Math.max(1, pixelScale);
      families[index] = family;
    }
  }
  for (const name of ['position', 'aStellarColor', 'aStellarSize', 'aStellarFamily']) {
    geometry.getAttribute(name).needsUpdate = true;
  }
  record.points.material.uniforms.uPixelScale.value = pixelScale;
}

/**
 * Attach (or refresh) a resident, region-shaped stellar population on the existing background root.
 * A stellar formation fades between regional identities, but its star positions never morph.
 * This follows the actual render camera, independently of whether the game passes focus or eye
 * position to SpaceBackground.update. Galactic phase is reduced in JS doubles before upload.
 *
 * Rebuild contract: called from `_buildLayers` (first bake, sector bakes, every resize). When the
 * placement inputs are unchanged the call returns the existing record untouched. When they change
 * (aspect, tier, camera height) the same typed arrays and material are refilled in place — no
 * allocation, no shader recompile, and the crossfade weights survive — so a window drag cannot
 * feed the GC wall. Only a missing camera retires the layer.
 */
export function rebuildDeepFieldStars(background) {
  const previous = background.stellarFormation;
  const camera = background.camera;
  if (!camera?.isPerspectiveCamera) {
    retireFormation(previous);
    background.stellarFormation = null;
    return null;
  }
  camera.updateMatrixWorld(true);
  background.renderer.getDrawingBufferSize(sizeScratch);
  const bufferHeight = sizeScratch.y;
  const signature = placementSignature(background, camera, bufferHeight);
  const reusable = !!previous && previous.points.parent === background.group;
  if (reusable && previous.signature === signature) return previous;
  const record = reusable ? previous : createFormationRecord(background);
  if (!reusable) {
    retireFormation(previous);
    background.group.add(record.points);
    record.rebuilds += 1;
  } else {
    record.refills += 1;
  }
  const origin = background.state?.world?.frameOrigin || {};
  // The coordinate bridge temporarily projects in global camera space during resize/sector work.
  const globalProjection = background._spaceBackgroundGlobalProjection === true;
  record.anchorX = camera.position.x + (globalProjection ? 0 : Number(origin.x) || 0);
  record.anchorZ = camera.position.z + (globalProjection ? 0 : Number(origin.z) || 0);
  const pixelScale = bufferHeight * camera.projectionMatrix.elements[5] * 0.5;
  fillFormation(record, background, camera, pixelScale);
  record.signature = signature;
  background.stellarFormation = record;
  return record;
}
