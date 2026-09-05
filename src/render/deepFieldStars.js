// Region-shaped populations of genuinely distant stars, not clouds/rocks drawn as glow cards.
// One static, interleaved point buffer; one draw; no textures, lights, raymarch or frame uploads.
import * as THREE from 'three';

export const STELLAR_FORMATIONS = Object.freeze([
  Object.freeze({ recipe: 'helios_orbital_void', name: 'distant-edge-on-spiral', shape: 'spiral',
    anchor: [-0.48, 0.42], span: 0.53, tilt: -0.20, flatten: 0.24,
    cool: '#7698c9', warm: '#e9c796', intensity: 0.52, parallax: 0.012 }),
  Object.freeze({ recipe: 'belt_broken_dust_lane', name: 'amber-stellar-river', shape: 'stream',
    anchor: [-0.16, 0.52], span: 0.76, tilt: 0.13, flatten: 0.58,
    cool: '#899ec1', warm: '#dfb987', intensity: 0.40, parallax: 0.016 }),
  Object.freeze({ recipe: 'fringe_tidal_filament', name: 'blue-flocculent-spiral', shape: 'spiral',
    anchor: [0.38, 0.47], span: 0.49, tilt: -0.42, flatten: 0.62,
    cool: '#709dcf', warm: '#ded1b4', intensity: 0.62, parallax: 0.010 }),
  Object.freeze({ recipe: 'anomaly_electromagnetic_scar', name: 'divided-stellar-stream', shape: 'fork',
    anchor: [-0.38, 0.44], span: 0.61, tilt: 0.42, flatten: 0.70,
    cool: '#668ac5', warm: '#abb9d9', intensity: 0.54, parallax: 0.014 }),
]);
const FAMILIES = STELLAR_FORMATIONS.length;
export const STELLAR_CAPACITY_PER_FORMATION = 8192;
const SKY_DEPTH = -160;

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
    if (family < 0.20) {
      radius = Math.min(0.40, -Math.log(Math.max(1e-7, random())) * 0.075);
      const angle = random() * Math.PI * 2;
      x = Math.cos(angle) * radius; y = Math.sin(angle) * radius * 0.86;
    } else {
      radius = Math.pow(random(), 0.70) * 0.97;
      const branch = random() < 0.5 ? 0 : Math.PI;
      // Two open, winding arms, with a small diffuse disk population between them.
      const angle = family < 0.86
        ? branch + 4.25 * Math.log(1 + radius * 4) + gaussian * (0.045 + radius * 0.08)
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

const VERTEX = /* glsl */`
  attribute vec3 aStellarColor;
  attribute float aStellarSize;
  attribute float aStellarFamily;
  uniform vec4 uWeights, uPhaseX, uPhaseZ;
  uniform vec2 uRootOffset;
  uniform float uPixelScale, uDensity;
  varying vec3 vColor;
  varying float vFlux;
  void main() {
    vec4 family = vec4(
      1.0 - step(0.5, aStellarFamily),
      step(0.5, aStellarFamily) * (1.0 - step(1.5, aStellarFamily)),
      step(1.5, aStellarFamily) * (1.0 - step(2.5, aStellarFamily)),
      step(2.5, aStellarFamily)
    );
    float weight = dot(uWeights, family);
    vColor = aStellarColor;
    vFlux = 0.0;
    if (weight < 0.00001) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 1.0;
      return;
    }
    vec3 p = position;
    p.x += uRootOffset.x - dot(uPhaseX, family);
    p.z += uRootOffset.y - dot(uPhaseZ, family);
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

/**
 * Attach a resident, region-shaped stellar population to the existing background root.
 * A stellar formation fades between regional identities, but its star positions never morph.
 * This follows the actual render camera, independently of whether the game passes focus or eye
 * position to SpaceBackground.update. Galactic phase is reduced in JS doubles before upload.
 */
export function rebuildDeepFieldStars(background) {
  const previous = background.stellarFormation;
  if (previous) {
    background.group.remove(previous.points);
    previous.points.geometry.dispose(); previous.points.material.dispose();
  }
  const camera = background.camera;
  if (!camera?.isPerspectiveCamera) { background.stellarFormation = null; return; }
  camera.updateMatrixWorld(true);
  const origin = background.state?.world?.frameOrigin || {};
  // The coordinate bridge temporarily projects in global camera space during resize/sector work.
  const globalProjection = background._spaceBackgroundGlobalProjection === true;
  const anchorX = camera.position.x + (globalProjection ? 0 : Number(origin.x) || 0);
  const anchorZ = camera.position.z + (globalProjection ? 0 : Number(origin.z) || 0);
  const count = STELLAR_CAPACITY_PER_FORMATION * FAMILIES;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const families = new Float32Array(count);
  const point = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const sizeScratch = new THREE.Vector2();
  background.renderer.getDrawingBufferSize(sizeScratch);
  const pixelScale = sizeScratch.y * camera.projectionMatrix.elements[5] * 0.5;
  const sample = [0, 0, 0];
  const depth = background.bgY + SKY_DEPTH;
  for (let family = 0; family < FAMILIES; family++) {
    const spec = STELLAR_FORMATIONS[family];
    const random = randomStream((background.seed ^ (0x193f17 * (family + 1))) >>> 0);
    const cool = new THREE.Color(spec.cool), warm = new THREE.Color(spec.warm);
    const ct = Math.cos(spec.tilt), st = Math.sin(spec.tilt);
    for (let i = 0; i < STELLAR_CAPACITY_PER_FORMATION; i++) {
      // Interleaving makes every low-quality prefix retain all four regional populations.
      const index = i * FAMILIES + family;
      sampleStellarFormation(spec.shape, random, sample);
      const sx = sample[0], sy = sample[1] * spec.flatten;
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
      const energy = (0.15 + random() * 0.40 + central * 0.22) * end;
      colors[index * 3] = (cool.r + (warm.r - cool.r) * central) * energy;
      colors[index * 3 + 1] = (cool.g + (warm.g - cool.g) * central) * energy;
      colors[index * 3 + 2] = (cool.b + (warm.b - cool.b) * central) * energy;
      sizes[index] = (2.2 + random() * 1.2) * Math.max(1, -projected.z) / Math.max(1, pixelScale);
      families[index] = family;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aStellarColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aStellarSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aStellarFamily', new THREE.BufferAttribute(families, 1));
  const uniforms = {
    uWeights: { value: new THREE.Vector4() }, uPhaseX: { value: new THREE.Vector4() },
    uPhaseZ: { value: new THREE.Vector4() }, uRootOffset: { value: new THREE.Vector2() },
    uPixelScale: { value: pixelScale }, uDensity: { value: 1 },
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
  const record = { points, family: -1, lastTime: null, activeStars: 0, attributeBytes: count * 8 * 4 };
  const period = Math.max(4000, background.H * 80);
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
    for (let i = 0; i < FAMILIES; i++) {
      const target = i === next ? STELLAR_FORMATIONS[i].intensity : 0;
      const weight = uniforms.uWeights.value.getComponent(i);
      uniforms.uWeights.value.setComponent(i, weight + (target - weight) * ease);
      uniforms.uPhaseX.value.setComponent(i, phase((globalX - anchorX) * STELLAR_FORMATIONS[i].parallax));
      uniforms.uPhaseZ.value.setComponent(i, phase((globalZ - anchorZ) * STELLAR_FORMATIONS[i].parallax));
    }
    const perFamily = background.lowTier ? 2048 : background.tierName === 'mid' ? 4096 : 8192;
    geometry.setDrawRange(0, perFamily * FAMILIES);
    record.activeStars = next < 0 ? 0 : perFamily;
    uniforms.uDensity.value = STELLAR_CAPACITY_PER_FORMATION / perFamily;
    uniforms.uRootOffset.value.set(renderCamera.position.x - background.group.position.x,
      renderCamera.position.z - background.group.position.z);
    renderer.getDrawingBufferSize(sizeScratch);
    uniforms.uPixelScale.value = sizeScratch.y * renderCamera.projectionMatrix.elements[5] * 0.5;
  };
  background.group.add(points);
  background.stellarFormation = record;
  return record;
}
