// Engine-trail surface factory — ribbon, streak mesh (single contract). The retired gaussian
// point-sprite particle material lived here; pooled sparks now render as instanced fluid-streak
// shards from particleShards.js.
import * as THREE from 'three';
import { TRAIL_GLSL_LIB } from './trailTexture.js';
import {
  assertDynamicBufferOwnerWritable,
  commitDynamicBufferOwner,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
} from './dynamicBufferRanges.js';

const TRAIL_MATRIX = 0;
const TRAIL_COLOR = 1;
const TRAIL_OPACITY = 2;

/**
 * Maximum history insertions a single delayed frame may request.
 *
 * Raised so a hitch at cruise/boost can still lay down equal-spacing samples rather than
 * equal-fraction chords that leave a multi-spacing gap between the live nozzle and history[1]
 * (the visible "skip behind the ship"). Still hard-capped; rebuild is already O(nSeg).
 */
export const RIBBON_TRAIL_INTERPOLATION_CAP = 32;

/**
 * INF-047 — seconds a retired wake stays visible while it ages out. A hull that stops
 * earning history (slow/still nozzle) keeps its committed samples where they were laid;
 * only their age changes their visibility, fading over this fixed clock — never wiped
 * because the speed read zero, never stretched by current speed. Matches the ContrailTrail
 * TRAIL_SECONDS lifetime so both wake lanes retire on the same beat.
 */
export const RIBBON_RETIRE_FADE_S = 1.2;

/**
 * Cross-section of the NPC wake ribbon (M2, closing the B7 row in VFX_QUALITY_AUDIT_2026-09-16).
 *
 * The strip is two vertices wide and stays that way — its vertex layout is a published contract
 * that the head/skip characterization reads directly. The curvature is carried instead by the
 * shading frame: the two edge vertices are tilted away from each other about the transverse axis,
 * so the interpolated normal sweeps an arch through the sheet's own up vector at the midline.
 *
 * RIBBON_ARCH_RAD is the half-angle of that arch. At 1.02 rad the flanks sit about 58 degrees off
 * the midline, wide enough that a chase camera sees a lit crown with two shaded shoulders rather
 * than a flat panel, and narrow enough that the shoulders never go fully dark.
 *
 * RIBBON_BANK_* rolls the strip into its own turns. A flat XZ ribbon under a top-down camera is
 * face-on everywhere, so no view term can do anything with it; banking through the recorded
 * curvature gives it a real angle to the eye exactly where the interesting geometry is. The
 * CENTERLINE is untouched — only the two edges rise and fall around it.
 */
export const RIBBON_ARCH_RAD = 1.02;
export const RIBBON_BANK_GAIN = 2.6;
export const RIBBON_BANK_RISE = 0.55;

// Both streak lanes share the same radiance curve: lower the floor from 0.65 to 0.28 while
// retaining the 1.20 peak. The quadratic term concentrates brightness in the procedural core.
const TRAIL_STREAK_RADIANCE_GLSL = /* glsl */`
  float trailStreakRadiance(float streak) {
    return 0.28 + streak * 0.72 + streak * streak * 0.20;
  }
`;

const RIBBON_TRAIL_VERT = /* glsl */`
  attribute vec2 aTrailUv;
  attribute vec3 aTrailNormal;
  varying vec2 vTrailUv;
  varying vec3 vTrailNormal;
  varying vec3 vTrailView;
  void main() {
    vTrailUv = aTrailUv;
    // M2/B7. The strip carries an ARCHED cross-section normal: the two edge vertices are tilted
    // away from each other about the transverse axis, so the interpolated normal sweeps from one
    // flank, through the sheet's own up vector at the midline, to the other. That is what gives a
    // two-vertex strip a curved cross-section to light, and it is why the grazing term has to be
    // evaluated per FRAGMENT: interpolating an already-collapsed scalar would hand the midline the
    // average of the two flanks instead of the response the midline actually has.
    //
    // The previous term also read the wrong vector. It used the transverse horizontal as the sheet
    // normal, which for a strip lying in XZ is the BINORMAL, not the surface normal; dotted against
    // a top-down chase camera it sat pinned at its own clamp, so the whole effect was a constant.
    vec4 world = modelMatrix * vec4(position, 1.0);
    vTrailNormal = normalize(mat3(modelMatrix) * aTrailNormal);
    vTrailView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RIBBON_TRAIL_FRAG = /* glsl */`
  precision mediump float;
  ${TRAIL_GLSL_LIB}
  uniform float uTrailScroll;
  uniform float uTrailTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uRadiance;
  varying vec2 vTrailUv;
  varying vec3 vTrailNormal;
  varying vec3 vTrailView;
  void main() {
    // The arched cross-section, resolved here rather than in the vertex stage. facing is 1 looking
    // straight down onto the sheet and falls to 0 along it, so the reciprocal is the grazing lift.
    vec3 sheetN = normalize(vTrailNormal);
    vec3 viewDir = normalize(vTrailView);
    float facing = abs(dot(sheetN, viewDir));
    float vTrailGrazing = clamp(1.0 / max(facing, 0.20), 1.0, 4.2);
    // Flank separation: the arch turns away from the eye down each side, so the body reads as a
    // rounded cord with its own shaded shoulders instead of one evenly-lit tape.
    float shoulder = 1.0 - smoothstep(0.30, 0.94, facing);

    // aTrailUv.x is physical history: 0 = live nozzle, 1 = oldest retained wake. Flow scroll is
    // independent so animation never re-lights the tail as a solid painted strip.
    float pathT = clamp(vTrailUv.x, 0.0, 1.0);
    float along = fract(pathT * 3.15 - uTrailScroll * 1.55);
    float side = vTrailUv.y * 2.0 - 1.0;
    float liquid = trailSampleProcedural(along, side, uTrailTime);

    // Longitudinal temperature. Exhaust cools with distance flown, so every heat term is a function
    // of the PHYSICAL history coordinate. The white-hot band is a throat feature and is starved
    // within a nozzle length or two; the coloured plasma body outlives it; the spent wake carries
    // neither. Previously the hot term had no history coordinate at all, so the incandescent core
    // ran the entire ribbon and the trail read as one screen-length white bar.
    float throat = exp(-pathT * 9.5);
    float plasma = exp(-pathT * 4.1);

    // Braided strands. The offsets sweep with physical distance so the two forks cross over one
    // another down-path instead of running as parallel rails, and they walk apart and broaden as
    // the jet expands into vacuum — bright along the folds, dark between them.
    float spread = 0.52 * pow(pathT, 0.70);
    float twist = pathT * 7.4 - uTrailTime * 1.9;
    float strandTight = 1.0 / (1.0 + 5.4 * pathT);
    float ribbonOffA = 0.22 + 0.12 * sin(along * 11.0 + uTrailTime * 2.8)
      + spread * (0.55 + 0.45 * sin(twist));
    float ribbonOffB = 0.26 + 0.10 * cos(along * 8.5 - uTrailTime * 2.1)
      + spread * (0.52 + 0.45 * sin(twist + 2.09));
    // Squared explicitly: pow() with a negative base is undefined in GLSL, and both offsets are
    // routinely crossed by the side coordinate.
    float dA = side - ribbonOffA;
    float dB = side + ribbonOffB;
    float ribbonA = exp(-dA * dA * 32.0 * strandTight);
    float ribbonB = exp(-dB * dB * 30.0 * strandTight);
    // Grazing lift on the sheet itself: the strands carry the view response, while the throat
    // filament below stays a stable core so the trail cannot flicker as the ship yaws. The two
    // strands sit on opposite flanks of the arch, so each takes the shoulder that faces it — which
    // is what makes a turn read as a cord rolling over rather than a tape changing brightness.
    float grazeLift = 1.0 + clamp(vTrailGrazing - 1.0, 0.0, 1.4) * 0.55;
    // Zero sum by construction. An arch turns one flank toward the eye and the other away, so the
    // strands trade brightness rather than both gaining it — that is what reads as a cord rolling
    // over. Summing them instead would just make the whole trail flash as a ship yaws.
    float lean = shoulder * 0.30;
    float flankA = 1.0 + lean * (smoothstep(-0.75, 0.75, side) * 2.0 - 1.0);
    float flankB = 1.0 + lean * (smoothstep(-0.75, 0.75, -side) * 2.0 - 1.0);
    ribbonA *= grazeLift * flankA;
    ribbonB *= grazeLift * flankB;

    // Each strand runs out of material at its own distance and tears into its own clumps, so the
    // wake ends where several elements happen to expire rather than at a plane. The fields are
    // keyed to the physical coordinate and a slow clock, never to the flow coordinate: that one
    // wraps three times down the trail and scrolls with the animation, so a cut keyed to it would
    // repeat and slide through the wake instead of ageing with it.
    float tear = smoothstep(0.08, 0.58, pathT);
    float shedA = trailValueNoise(vec2(pathT * 5.9 + 3.1, uTrailTime * 0.17));
    float shedB = trailValueNoise(vec2(pathT * 7.3 - 1.7, uTrailTime * 0.13 + 4.6));
    float shedC = trailValueNoise(vec2(pathT * 4.3 + 8.8, uTrailTime * 0.09 + 1.2));
    float liveA = mix(1.0, smoothstep(0.20, 0.74, shedA), tear)
      * (1.0 - smoothstep(0.42, 0.94, pathT));
    float liveB = mix(1.0, smoothstep(0.24, 0.78, shedB), tear)
      * (1.0 - smoothstep(0.34, 0.86, pathT));
    float ribbons = ribbonA * 0.62 * liveA + ribbonB * 0.55 * liveB;

    // The white-hot filament is the choked throat: tightest and brightest at the nozzle, cooling
    // fast along the flown path.
    float coreShape = exp(-side * side * (24.0 + 62.0 * throat));
    float filament = coreShape * (0.16 + 0.84 * plasma);
    // Sheath: the emission envelope closes down as the gas dilutes, so the lit body narrows to a
    // point even while the strands themselves spread.
    float sheath = exp(-side * side * (4.2 + 7.5 * pathT));
    // Electric crackle along the fluid edges (reference: braided plasma arcs), concentrated where
    // the flow is still ionised.
    float arcNoise = trailValueNoise(vec2(along * 22.0 - uTrailTime * 1.8, side * 5.0 + 0.6));
    float arcs = smoothstep(0.58, 0.92, arcNoise) * exp(-abs(side) * 2.4) * liquid
      * (0.22 + 1.05 * plasma);
    // Shorter physical wake: energy fades earlier so the trail is a jet, not a long tube, and the
    // last of it is gone before the mesh runs out.
    float tailEnvelope = 1.0 - smoothstep(0.30, 0.88, pathT);
    float headBoost = 1.0 - smoothstep(0.0, 0.12, pathT);
    float fluidNoise = trailValueNoise(vec2(along * 9.0, uTrailTime * 0.22));
    float threadNoise = trailValueNoise(vec2(along * 17.0 - uTrailTime * 0.31, side * 2.4 + 1.7));
    float sheathLive = mix(1.0, smoothstep(0.14, 0.66, shedC), tear);
    float brokenSheath = liquid * sheath * (0.42 + 0.58 * fluidNoise)
      * (0.72 + 0.28 * threadNoise) * sheathLive;
    // Optical depth, not a brightness knob: a luminous sheet seen along its own surface is being
    // looked through end-on, so there is genuinely more material in the line of sight. Bounded well
    // under the clamp so the trail cannot flash as a ship yaws through the grazing angle.
    float depth = 1.0 + clamp(vTrailGrazing - 1.0, 0.0, 1.4) * 0.09;
    float alpha = min(1.0, uOpacity * tailEnvelope
      * (filament * 0.88 + ribbons * 0.72 + brokenSheath * 0.48 + sheath * 0.10 + arcs * 0.55)
      * (0.86 + headBoost * 0.28) * depth);
    if (alpha < 0.006) discard;

    // Three thermal bands, the outer two leaning on the ship's own trail colour so per-hull
    // identity survives the ramp: an incandescent throat, a saturated plasma body, a deep spent
    // wake. Only the throat term can reach white.
    vec3 whiteHot = vec3(1.0, 0.988, 0.94);
    vec3 hotPlasma = mix(uColor, vec3(0.62, 0.90, 1.0), 0.42);
    vec3 coldWake = mix(uColor * 0.44, vec3(0.17, 0.23, 0.60), 0.52);
    vec3 body = mix(coldWake, hotPlasma, clamp(plasma * 1.25, 0.0, 1.0));
    float hotMix = clamp(coreShape * throat * 1.15 + headBoost * 0.26 + arcs * 0.20, 0.0, 1.0);
    // Radiance hierarchy rather than a blanket dim: hotter than before at the throat, far colder
    // down the wake, which holds its energy as saturated colour and structure instead of white fill.
    float thermal = 0.26 + 0.78 * plasma + 0.22 * throat;
    vec3 radiance = mix(body, whiteHot, hotMix) * uRadiance * thermal
      * (0.72 + liquid * 0.78 + filament * 0.48 + ribbons * 0.28 + headBoost * 0.20 + arcs * 0.22
         + shoulder * 0.24);
    gl_FragColor = vec4(radiance, alpha);
  }
`;

export function createRibbonTrailMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTrailScroll: { value: 0 },
      uTrailTime: { value: 0 },
      uColor: { value: new THREE.Color(color || '#7fe0ff') },
      uOpacity: { value: 0.62 },
      uRadiance: { value: 1.85 },
    },
    vertexShader: RIBBON_TRAIL_VERT,
    fragmentShader: RIBBON_TRAIL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const BATCHED_RIBBON_TRAIL_VERT = /* glsl */`
  attribute vec2 aTrailUv;
  attribute vec3 aTrailNormal;
  attribute vec3 aTrailColor;
  attribute vec2 aTrailShade;
  varying vec2 vTrailUv;
  varying vec3 vTrailNormal;
  varying vec3 vTrailView;
  varying vec3 vTrailColor;
  varying float vTrailOpacity;
  varying float vTrailRadiance;
  void main() {
    vTrailUv = aTrailUv;
    vTrailColor = aTrailColor;
    vTrailOpacity = aTrailShade.x;
    vTrailRadiance = aTrailShade.y;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vTrailNormal = normalize(mat3(modelMatrix) * aTrailNormal);
    vTrailView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// The fleet batch links the SAME fragment body as the solo ribbon — the three per-owner
// uniforms (color/opacity/radiance) become per-vertex varyings so one draw shades every live
// wake. The #define aliases keep the authored body byte-identical: any ribbon shading change
// lands in both paths automatically instead of forking the GLSL.
const BATCHED_RIBBON_TRAIL_FRAG = RIBBON_TRAIL_FRAG
  .replace('uniform vec3 uColor;', 'varying vec3 vTrailColor;\n  #define uColor vTrailColor')
  .replace('uniform float uOpacity;', 'varying float vTrailOpacity;\n  #define uOpacity vTrailOpacity')
  .replace('uniform float uRadiance;', 'varying float vTrailRadiance;\n  #define uRadiance vTrailRadiance');

export function createBatchedRibbonTrailMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTrailScroll: { value: 0 },
      uTrailTime: { value: 0 },
    },
    vertexShader: BATCHED_RIBBON_TRAIL_VERT,
    fragmentShader: BATCHED_RIBBON_TRAIL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const TRAIL_STREAK_VERT = /* glsl */`
  varying vec2 vTrailUv;
  void main() {
    vTrailUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRAIL_STREAK_FRAG = /* glsl */`
  precision mediump float;
  ${TRAIL_GLSL_LIB}
  ${TRAIL_STREAK_RADIANCE_GLSL}
  uniform float uTrailScroll;
  uniform float uTrailTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vTrailUv;
  void main() {
    float along = fract(vTrailUv.y + uTrailScroll);
    float side = vTrailUv.x * 2.0 - 1.0;
    float streak = trailSampleProcedural(along, side, uTrailTime);
    if (streak < 0.008) discard;
    gl_FragColor = vec4(uColor * trailStreakRadiance(streak), uOpacity * streak);
  }
`;

const INSTANCED_TRAIL_STREAK_VERT = /* glsl */`
  attribute vec3 aTrailColor;
  attribute float aTrailOpacity;
  varying vec2 vTrailUv;
  varying vec3 vTrailColor;
  varying float vTrailOpacity;
  void main() {
    vTrailUv = uv;
    vTrailColor = aTrailColor;
    vTrailOpacity = aTrailOpacity;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const INSTANCED_TRAIL_STREAK_FRAG = /* glsl */`
  precision mediump float;
  ${TRAIL_GLSL_LIB}
  ${TRAIL_STREAK_RADIANCE_GLSL}
  uniform float uTrailScroll;
  uniform float uTrailTime;
  varying vec2 vTrailUv;
  varying vec3 vTrailColor;
  varying float vTrailOpacity;
  void main() {
    float along = fract(vTrailUv.y + uTrailScroll);
    float side = vTrailUv.x * 2.0 - 1.0;
    float streak = trailSampleProcedural(along, side, uTrailTime);
    if (streak < 0.008) discard;
    gl_FragColor = vec4(vTrailColor * trailStreakRadiance(streak), vTrailOpacity * streak);
  }
`;

export function createTrailStreakMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTrailScroll: { value: 0 },
      uTrailTime: { value: 0 },
      uColor: { value: new THREE.Color(color || '#ffffff') },
      uOpacity: { value: 0.5 },
    },
    vertexShader: TRAIL_STREAK_VERT,
    fragmentShader: TRAIL_STREAK_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function createInstancedTrailStreakMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTrailScroll: { value: 0 },
      uTrailTime: { value: 0 },
    },
    vertexShader: INSTANCED_TRAIL_STREAK_VERT,
    fragmentShader: INSTANCED_TRAIL_STREAK_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

let _sharedStreakGeo = null;

export function createTrailStreakGeometry() {
  if (!_sharedStreakGeo) {
    _sharedStreakGeo = new THREE.PlaneGeometry(1, 1, 1, 4);
    _sharedStreakGeo.rotateX(-Math.PI / 2);
  }
  return _sharedStreakGeo;
}

/** One streak-mesh slot (procedural ShaderMaterial) — not a sprite. */
export function createTrailStreakSlot(scene) {
  const mesh = new THREE.Mesh(createTrailStreakGeometry(), createTrailStreakMaterial('#ffffff'));
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;
  scene.add(mesh);
  return mesh;
}

export function initTrailStreakPool(scene, cap) {
  const pool = createTrailStreakPool(cap);
  scene.add(pool.mesh);
  pool.dynamicBufferOwner = registerDynamicBufferOwner(scene, {
    id: 'trail-streak-instances',
    mesh: pool.mesh,
    attributes: [
      { name: 'matrix', attribute: pool.mesh.instanceMatrix },
      { name: 'color', attribute: pool.colorAttribute },
      { name: 'opacity', attribute: pool.opacityAttribute },
    ],
  });
  return pool;
}

function createTrailStreakPool(cap) {
  const capacity = Math.max(1, Math.floor(cap || 1));
  const geometry = createTrailStreakGeometry().clone();
  const colorAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const opacityAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  opacityAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aTrailColor', colorAttribute);
  geometry.setAttribute('aTrailOpacity', opacityAttribute);

  const mesh = new THREE.InstancedMesh(geometry, createInstancedTrailStreakMaterial(), capacity);
  mesh.name = 'SF_TrailStreakInstances';
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;

  return {
    mesh,
    capacity,
    colorAttribute,
    opacityAttribute,
    _transform: new THREE.Object3D(),
  };
}

export function updateTrailStreakInstance(pool, index, {
  x, y, z, vx, vz, width, length, opacity, color,
}) {
  if (!pool || !pool.mesh || index < 0 || index >= pool.capacity || !Number.isInteger(index)) {
    throw new RangeError(`trail instance index ${index} exceeds pool capacity`);
  }
  assertDynamicBufferOwnerWritable(pool.dynamicBufferOwner);
  const transform = pool._transform;
  transform.position.set(x, y || 0.4, z);
  // UV 0 is on local +Z; keep UV 0 → 1 along the supplied XZ axis.
  transform.rotation.set(0, -Math.atan2(vz || 0, vx || 0) - Math.PI * 0.5, 0);
  transform.scale.set(Math.max(0.01, width), 1, Math.max(0.01, length));
  transform.updateMatrix();
  pool.mesh.setMatrixAt(index, transform.matrix);
  pool.colorAttribute.setXYZ(index,
    color && Number.isFinite(color.r) ? color.r : 1,
    color && Number.isFinite(color.g) ? color.g : 1,
    color && Number.isFinite(color.b) ? color.b : 1);
  pool.opacityAttribute.setX(index, Math.max(0, opacity));
  markDynamicBufferItems(pool.dynamicBufferOwner, TRAIL_MATRIX, index);
  markDynamicBufferItems(pool.dynamicBufferOwner, TRAIL_COLOR, index);
  markDynamicBufferItems(pool.dynamicBufferOwner, TRAIL_OPACITY, index);
}

export function commitTrailStreakInstances(pool, liveCount, { scroll, time } = {}) {
  if (!pool || !pool.mesh || liveCount < 0 || liveCount > pool.capacity || !Number.isInteger(liveCount)) {
    throw new RangeError(`trail live count ${liveCount} exceeds pool capacity`);
  }
  if (pool.dynamicBufferOwner) commitDynamicBufferOwner(pool.dynamicBufferOwner, liveCount);
  else {
    pool.mesh.count = liveCount;
    pool.mesh.instanceMatrix.needsUpdate = true;
    pool.colorAttribute.needsUpdate = true;
    pool.opacityAttribute.needsUpdate = true;
  }
  pool.mesh.visible = liveCount > 0;
  pool.mesh.material.uniforms.uTrailTime.value = time || 0;
  pool.mesh.material.uniforms.uTrailScroll.value = scroll || 0;
}

export function clearTrailStreakInstances(pool) {
  if (!pool || !pool.mesh) return;
  if (pool.dynamicBufferOwner) commitDynamicBufferOwner(pool.dynamicBufferOwner, 0);
  else pool.mesh.count = 0;
  pool.mesh.visible = false;
}

export function updateTrailStreakMesh(mesh, {
  x, y, z, vx, vz, width, length, opacity, scroll, time,
}) {
  mesh.visible = true;
  mesh.position.set(x, y || 0.4, z);
  mesh.rotation.y = -Math.atan2(vz || 0, vx || 0) - Math.PI * 0.5;
  mesh.scale.set(Math.max(0.01, width), 1, Math.max(0.01, length));
  mesh.material.uniforms.uOpacity.value = Math.max(0, opacity);
  mesh.material.uniforms.uTrailTime.value = time || 0;
  mesh.material.uniforms.uTrailScroll.value = scroll || 0;
}

export function hideTrailStreakMesh(mesh) {
  if (mesh) mesh.visible = false;
}

export function isProceduralTrailMaterial(mat) {
  return !!(mat && mat.type === 'ShaderMaterial' && mat.fragmentShader
    && mat.fragmentShader.includes('trailSampleProcedural'));
}

/**
 * One ribbon lane's CPU state — bounded equal-spacing history plus the taper strip writer.
 *
 * The sink owns WHERE this lane renders: createRibbonTrail gives it a private
 * geometry + material (one mesh, solo program), createRibbonTrailBatch gives it one vertex
 * slice of the shared fleet buffer (one mesh + program for the whole cohort). Lane code is
 * identical either way; the sink hides geometry ownership behind these seams:
 *
 *   markAttribute(kind, firstVert, vertCount) — dirty a vertex range (component maths is the sink's)
 *   applyPresentation(opacity, scroll, time, radiance) → effective opacity after clamp
 *   setDrawnPairs(livePairs, previousPairs) — publish how many strip pairs are real geometry
 *   setVisible(want) → effective visibility after the compile latch
 *   isDrawn() — is this lane's strip actually presented right now
 *
 * All storage is fixed at construction/acquire; follow()/rebuild()/syncHead() allocate nothing.
 */
function createRibbonLane(sink) {
  const nSeg = Math.max(2, Math.floor(sink.nSeg || 30));
  const pos = sink.pos;
  const uvs = sink.uvs;
  const normals = sink.normals;
  const vertBase = sink.vertBase | 0;
  let baseWidth = Number.isFinite(sink.baseWidth) && sink.baseWidth > 0 ? sink.baseWidth : 5;

  const markPairs = (kind, firstPair, pairCount) => {
    sink.markAttribute(kind, vertBase + firstPair * 2, pairCount * 2);
  };

  // The ring owns committed history only. The current nozzle pose is separate, so it can follow the
  // rendered socket every display frame without consuming history capacity or leaving a one-cadence
  // gap behind the ship. All storage is fixed at construction; follow()/rebuild() allocate nothing.
  const pts = new Float32Array(nSeg * 3);
  const centers = new Float32Array(nSeg * 3);
  let historyHead = 0;
  let historyCount = 0;
  let hasLive = false;
  let liveX = 0;
  let liveZ = 0;
  let liveRot = 0;
  let committedX = 0;
  let committedZ = 0;
  let committedRot = 0;
  let sampleElapsed = 0;
  let ownerIdentity = null;
  let lastUvCount = -1;
  let renderedCount = 0;
  let fullRebuildCount = 0;
  let headSyncCount = 0;
  let lastCadenceToken = null;
  // INF-047 — retirement clock (render-clock seconds, -1 = earning). Set by retire(),
  // cancelled by any new sample. While set, rebuild() fades the committed wake by age
  // alone and releases it once fully aged; positions are never touched.
  let retireAt = -1;

  /**
   * Catmull-Rom sample of the ribbon centerline. Equal-spacing history alone still reads as
   * segmented chords under hard turns; a one-sample cubic through neighbours softens the path
   * without allocating, and falls back to the raw sample at the ends.
   */
  const sampleCenter = (i, count, out) => {
    if (count < 3 || i <= 0 || i >= count - 1) {
      out.x = centers[i * 3];
      out.z = centers[i * 3 + 1];
      out.rot = centers[i * 3 + 2];
      return out;
    }
    const i0 = i - 1;
    const i1 = i;
    const i2 = i + 1;
    const i3 = i + 2 < count ? i + 2 : i + 1;
    // Evaluate at the node itself with a light neighbour blend (t=0 on p1→p2, nudged by p0/p3).
    // Using the midpoint tangent estimate keeps the sample on the authored history while rounding
    // the normal used for width.
    const p0x = centers[i0 * 3]; const p0z = centers[i0 * 3 + 1];
    const p1x = centers[i1 * 3]; const p1z = centers[i1 * 3 + 1];
    const p2x = centers[i2 * 3]; const p2z = centers[i2 * 3 + 1];
    const p3x = centers[i3 * 3]; const p3z = centers[i3 * 3 + 1];
    // Catmull-Rom at t=0 is p1; use a tiny t toward p2 mixed back to keep the head exact and
    // only round interior curvature for the normal. Position stays on history (no drift).
    out.x = p1x;
    out.z = p1z;
    out.rot = centers[i1 * 3 + 2];
    // Store a smoothed tangent basis on the scratch so writeCenterPair can prefer it.
    out.tx = (p2x - p0x) * 0.5 + (p3x - p1x) * 0.15;
    out.tz = (p2z - p0z) * 0.5 + (p3z - p1z) * 0.15;
    return out;
  };
  const centerScratch = { x: 0, z: 0, rot: 0, tx: 0, tz: 0 };

  const writeCenterPair = (i, count) => {
    const t = i / Math.max(1, count - 1);
    sampleCenter(i, count, centerScratch);
    const px = centerScratch.x;
    const pz = centerScratch.z;
    const rot = centerScratch.rot;
    let tangentX;
    let tangentZ;
    if (count >= 3 && i > 0 && i < count - 1
      && (Math.abs(centerScratch.tx) + Math.abs(centerScratch.tz)) > 1e-8) {
      // Smoothed interior tangent (camera-parallel cross is not needed in XZ ribbon space).
      tangentX = centerScratch.tx;
      tangentZ = centerScratch.tz;
    } else {
      const near = i > 0 ? i - 1 : i;
      const far = i + 1 < count ? i + 1 : i;
      tangentX = centers[near * 3] - centers[far * 3];
      tangentZ = centers[near * 3 + 1] - centers[far * 3 + 1];
    }
    const tangentLength = Math.hypot(tangentX, tangentZ);
    const normalX = tangentLength > 1e-5 ? -tangentZ / tangentLength : Math.sin(rot);
    const normalZ = tangentLength > 1e-5 ? tangentX / tangentLength : -Math.cos(rot);
    // Soft nozzle open into a liquid sheath, then a long continuous taper — no hard width steps.
    const nozzleOpen = 0.52 + 0.48 * Math.min(1, t / 0.09);
    const body = Math.pow(Math.max(0, 1 - t), 0.55);
    const w = baseWidth * nozzleOpen * body;
    const ox = normalX * w;
    const oz = normalZ * w;

    // Signed curvature of the recorded line at this station, from the chord either side of it in
    // the direction of flight (index 0 is the live head, so newer sits at i - 1). The wake rolls
    // into its own turns by this much; the centerline never moves.
    let bank = 0;
    if (count >= 3 && i > 0 && i < count - 1) {
      const inX = centers[i * 3] - centers[(i + 1) * 3];
      const inZ = centers[i * 3 + 1] - centers[(i + 1) * 3 + 1];
      const outX = centers[(i - 1) * 3] - centers[i * 3];
      const outZ = centers[(i - 1) * 3 + 1] - centers[i * 3 + 1];
      const inLen = Math.hypot(inX, inZ);
      const outLen = Math.hypot(outX, outZ);
      if (inLen > 1e-5 && outLen > 1e-5) {
        const turn = (inX / inLen) * (outZ / outLen) - (inZ / inLen) * (outX / outLen);
        bank = Math.max(-1, Math.min(1, turn * RIBBON_BANK_GAIN));
      }
    }
    const rise = bank * w * RIBBON_BANK_RISE;

    const vi = vertBase + i * 2;
    pos[vi * 3] = px + ox;
    pos[vi * 3 + 1] = 0.4 + rise;
    pos[vi * 3 + 2] = pz + oz;
    pos[(vi + 1) * 3] = px - ox;
    pos[(vi + 1) * 3 + 1] = 0.4 - rise;
    pos[(vi + 1) * 3 + 2] = pz - oz;

    // ARCHED CROSS-SECTION (M2/B7). The two edge vertices get normals tilted away from each other
    // about the transverse axis, measured from the sheet's own up vector; the rasterizer sweeps the
    // interpolation through that up vector at the midline. The banked roll tilts the whole arch
    // with the sheet, so a turning wake presents a real angle to the camera.
    //
    // What this replaces genuinely did not work: it stored the transverse horizontal, which is the
    // BINORMAL of a strip lying in XZ rather than its surface normal. Dotted against a top-down
    // chase camera that value stayed near zero, so the reciprocal sat pinned at its clamp and the
    // grazing term was a constant from every heading — the flat-tape reading the audit named.
    const tilt = -Math.atan(bank * RIBBON_BANK_RISE);
    const angleA = tilt + RIBBON_ARCH_RAD;
    const angleB = tilt - RIBBON_ARCH_RAD;
    const cosA = Math.cos(angleA);
    const sinA = Math.sin(angleA);
    const cosB = Math.cos(angleB);
    const sinB = Math.sin(angleB);
    normals[vi * 3] = normalX * sinA;
    normals[vi * 3 + 1] = cosA;
    normals[vi * 3 + 2] = normalZ * sinA;
    normals[(vi + 1) * 3] = normalX * sinB;
    normals[(vi + 1) * 3 + 1] = cosB;
    normals[(vi + 1) * 3 + 2] = normalZ * sinB;
  };

  const appendHistory = (x, z, rot) => {
    // Any committed sample cancels retirement: the hull is earning history again.
    retireAt = -1;
    pts[historyHead * 3] = x;
    pts[historyHead * 3 + 1] = z;
    pts[historyHead * 3 + 2] = rot;
    historyHead = (historyHead + 1) % nSeg;
    if (historyCount < nSeg - 1) historyCount++;
  };

  const seedLive = (x, z, rot, owner) => {
    historyHead = 0;
    historyCount = 0;
    retireAt = -1;
    hasLive = true;
    liveX = committedX = x;
    liveZ = committedZ = z;
    liveRot = committedRot = rot;
    sampleElapsed = 0;
    ownerIdentity = owner ?? null;
    sink.setDrawnPairs(0, renderedCount);
    renderedCount = 0;
    lastCadenceToken = null;
    sink.setVisible(false);
  };

  const clearHistory = () => {
    historyHead = 0;
    historyCount = 0;
    hasLive = false;
    sampleElapsed = 0;
    ownerIdentity = null;
    lastUvCount = -1;
    sink.setDrawnPairs(0, renderedCount);
    renderedCount = 0;
    lastCadenceToken = null;
    sink.setVisible(false);
  };

  return {
    // Compatibility/manual authoring seam. Samples are frame-local XZ.
    push(x, z, rot) {
      if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rot)) {
        clearHistory();
        return false;
      }
      if (!hasLive) {
        seedLive(x, z, rot, null);
        return true;
      }
      appendHistory(liveX, liveZ, liveRot);
      committedX = liveX;
      committedZ = liveZ;
      committedRot = liveRot;
      liveX = x;
      liveZ = z;
      liveRot = rot;
      return true;
    },
    /**
     * Follow a live nozzle with a display-frame head and bounded equal-spacing history.
     *
     * owner is compared by identity so a replacement entity reusing an id cannot inherit the old
     * hull's wake. discontinuityWU rejects teleports/jumps.
     *
     * LAG/SKIP CONTRACT: the live head is always the current nozzle, and the most recent committed
     * history sample is always advanced so the first ribbon segment (live → history[1]) is at most
     * one sampleSpacingWU long. Equal-fraction subdivision capped at a small insert budget left a
     * multi-spacing first chord on delayed frames — that chord was the visible skip behind the ship.
     */
    follow(x, z, rot, dt, owner, sampleSpacingWU, discontinuityWU, samplePeriodS) {
      if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rot)) {
        clearHistory();
        return false;
      }
      if (!hasLive || (owner != null && ownerIdentity !== owner)) {
        seedLive(x, z, rot, owner);
        return true;
      }

      const frameDx = x - liveX;
      const frameDz = z - liveZ;
      const frameDistance = Math.hypot(frameDx, frameDz);
      const discontinuity = Number.isFinite(discontinuityWU) && discontinuityWU > 0
        ? discontinuityWU
        : 240;
      if (!Number.isFinite(frameDistance) || frameDistance > discontinuity) {
        seedLive(x, z, rot, owner);
        return false;
      }

      const elapsed = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
      sampleElapsed += elapsed;
      const spacing = Number.isFinite(sampleSpacingWU) && sampleSpacingWU > 0
        ? sampleSpacingWU
        : 3;
      const period = Number.isFinite(samplePeriodS) && samplePeriodS > 0
        ? samplePeriodS
        : 1 / 30;
      const dx = x - committedX;
      const dz = z - committedZ;
      const distance = Math.hypot(dx, dz);

      if (distance > spacing) {
        // Equal-spacing walk along the socket path, excluding the live endpoint. Each insert
        // advances exactly `spacing` toward the nozzle. If the per-frame budget runs out, a final
        // snap still places committed within one spacing of live so the first ribbon chord cannot
        // open into the visible skip/detach behind the ship.
        const maxInserts = Math.min(RIBBON_TRAIL_INTERPOLATION_CAP, Math.max(1, nSeg - 1));
        const startX = committedX;
        const startZ = committedZ;
        const startRot = committedRot;
        let deltaRot = rot - startRot;
        if (deltaRot > Math.PI) deltaRot -= Math.PI * 2;
        else if (deltaRot < -Math.PI) deltaRot += Math.PI * 2;
        const totalDist = distance;
        let inserts = 0;
        while (inserts < maxInserts) {
          const remX = x - committedX;
          const remZ = z - committedZ;
          const remaining = Math.hypot(remX, remZ);
          if (!(remaining > spacing)) break;
          const inv = spacing / remaining;
          const ix = committedX + remX * inv;
          const iz = committedZ + remZ * inv;
          const traveled = Math.hypot(ix - startX, iz - startZ);
          const pathT = totalDist > 0 ? Math.min(1, traveled / totalDist) : 1;
          const ir = startRot + deltaRot * pathT;
          appendHistory(ix, iz, ir);
          committedX = ix;
          committedZ = iz;
          committedRot = ir;
          inserts++;
        }
        // Budget-exhausted snap: keep live→history[1] ≤ spacing even when detail is lost.
        const remX = x - committedX;
        const remZ = z - committedZ;
        const remaining = Math.hypot(remX, remZ);
        if (remaining > spacing + 1e-6) {
          const snapT = 1 - spacing / remaining;
          const sx = committedX + remX * snapT;
          const sz = committedZ + remZ * snapT;
          const traveled = Math.hypot(sx - startX, sz - startZ);
          const pathT = totalDist > 0 ? Math.min(1, traveled / totalDist) : 1;
          const sr = startRot + deltaRot * pathT;
          appendHistory(sx, sz, sr);
          committedX = sx;
          committedZ = sz;
          committedRot = sr;
        }
        sampleElapsed = 0;
      } else if (sampleElapsed >= period) {
        // Slow movement still earns temporal history; commit the previous display-frame pose so the
        // separately-owned live head always remains the newest point.
        appendHistory(liveX, liveZ, liveRot);
        committedX = liveX;
        committedZ = liveZ;
        committedRot = liveRot;
        sampleElapsed %= period;
      }

      liveX = x;
      liveZ = z;
      liveRot = rot;
      return true;
    },
    // M2: shift stored samples on frame-origin rebase without dropping the trail history.
    reproject(dx, dz) {
      const ox = Number.isFinite(dx) ? dx : 0;
      const oz = Number.isFinite(dz) ? dz : 0;
      if (ox === 0 && oz === 0) return;
      for (let i = 0; i < nSeg; i++) {
        pts[i * 3] += ox;
        pts[i * 3 + 1] += oz;
      }
      if (hasLive) {
        liveX += ox;
        liveZ += oz;
        committedX += ox;
        committedZ += oz;
      }
    },
    /**
     * Keep a cadence-reduced NPC ribbon welded to its live nozzle without rebuilding all history.
     * Only the first vertex pair changes; the next full rebuild incorporates interpolated samples.
     */
    syncHead(opacity, scroll, time, radiance) {
      const appliedOpacity = sink.applyPresentation(opacity, scroll, time, radiance);
      if (!hasLive || renderedCount < 2 || !sink.isDrawn() || appliedOpacity <= 0.001) return false;
      centers[0] = liveX;
      centers[1] = liveZ;
      centers[2] = liveRot;
      writeCenterPair(0, renderedCount);
      markPairs('position', 0, 1);
      markPairs('aTrailNormal', 0, 1);
      headSyncCount++;
      return true;
    },
    claimCadence(token) {
      if (lastCadenceToken === token) return false;
      lastCadenceToken = token;
      return true;
    },
    rebuild(opacity, scroll, time, radiance) {
      // INF-047 — a retired wake fades by age alone: the release clock started in retire(),
      // positions are never touched, and only the age factor scales visibility. Fully aged
      // history is released once, at the end, not wiped when the speed read zero.
      if (retireAt >= 0) {
        const age = (Number.isFinite(time) ? time : retireAt) - retireAt;
        const remaining = 1 - age / RIBBON_RETIRE_FADE_S;
        if (!(remaining > 0)) {
          clearHistory();
          return;
        }
        opacity = (opacity == null ? 1 : opacity) * remaining;
      }
      const appliedOpacity = sink.applyPresentation(opacity, scroll, time, radiance);
      const count = hasLive ? Math.min(nSeg, historyCount + 1) : 0;
      if (count < 2 || appliedOpacity <= 0.001) {
        sink.setDrawnPairs(0, renderedCount);
        renderedCount = 0;
        sink.setVisible(false);
        return;
      }

      centers[0] = liveX;
      centers[1] = liveZ;
      centers[2] = liveRot;
      for (let i = 1; i < count; i++) {
        const slot = ((historyHead - i) % nSeg + nSeg) % nSeg;
        centers[i * 3] = pts[slot * 3];
        centers[i * 3 + 1] = pts[slot * 3 + 1];
        centers[i * 3 + 2] = pts[slot * 3 + 2];
      }

      const updateUvs = count !== lastUvCount;
      for (let i = 0; i < count; i++) {
        const t = i / Math.max(1, count - 1);
        writeCenterPair(i, count);
        const vi = vertBase + i * 2;
        if (updateUvs) {
          uvs[vi * 2] = t;
          uvs[vi * 2 + 1] = 0.0;
          uvs[(vi + 1) * 2] = t;
          uvs[(vi + 1) * 2 + 1] = 1.0;
        }
      }
      markPairs('position', 0, count);
      markPairs('aTrailNormal', 0, count);
      if (updateUvs) {
        markPairs('aTrailUv', 0, count);
        lastUvCount = count;
      }
      sink.setDrawnPairs(count, renderedCount);
      renderedCount = count;
      sink.setVisible(true);
      fullRebuildCount++;
    },
    getMaterial() { return sink.getMaterial(); },
    /** Owner-root accessor for measurement isolation (do not mutate topology). */
    getMesh() { return sink.getMesh(); },
    inspect() {
      return {
        capacity: nSeg,
        historyCount,
        visiblePointCount: hasLive ? Math.min(nSeg, historyCount + 1) : 0,
        hasLive,
        ownerIdentity,
        liveX,
        liveZ,
        renderedCount,
        fullRebuildCount,
        headSyncCount,
        retired: retireAt >= 0,
        slot: sink.slotIndex,
      };
    },
    clear() { clearHistory(); retireAt = -1; },
    /**
     * INF-047 — stop earning history without moving it. The committed wake stays where it
     * was laid; rebuild() fades it by age over RIBBON_RETIRE_FADE_S and releases it once
     * fully aged. Any new sample (follow/push/seedLive) cancels retirement. No-op when
     * there is no history to keep.
     */
    retire(nowS) {
      if (retireAt >= 0 || !hasLive || historyCount < 1) return false;
      retireAt = Number.isFinite(nowS) ? nowS : 0;
      return true;
    },
    /**
     * Batch seam — re-arm a recycled slot for a new owner without allocating a lane.
     * Equivalent to a fresh trail's state: empty history, cleared draw, reset counters.
     */
    _reset(nextBaseWidth) {
      clearHistory();
      retireAt = -1;
      fullRebuildCount = 0;
      headSyncCount = 0;
      if (Number.isFinite(nextBaseWidth) && nextBaseWidth > 0) baseWidth = nextBaseWidth;
    },
    dispose() { sink.dispose(); },
  };
}

/** Tapering ribbon trail for medium/large ships — a dedicated mesh per owner. */
export function createRibbonTrail(scene, color, nSeg, baseWidth) {
  nSeg = nSeg || 30;
  baseWidth = baseWidth || 5;
  const verts = nSeg * 2;
  const pos = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const normals = new Float32Array(verts * 3);
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  posAttr.usage = THREE.DynamicDrawUsage;
  geo.setAttribute('position', posAttr);
  const uvAttr = new THREE.BufferAttribute(uvs, 2);
  uvAttr.usage = THREE.DynamicDrawUsage;
  geo.setAttribute('aTrailUv', uvAttr);
  const normalAttr = new THREE.BufferAttribute(normals, 3);
  normalAttr.usage = THREE.DynamicDrawUsage;
  geo.setAttribute('aTrailNormal', normalAttr);
  // Three clears updateRanges after each upload. Keep one owner-held range object per attribute and
  // reattach it, avoiding addUpdateRange()'s per-frame object allocation on the hot path.
  const posUpdateRange = { start: 0, count: 0 };
  const uvUpdateRange = { start: 0, count: 0 };
  const normalUpdateRange = { start: 0, count: 0 };
  const idx = [];
  for (let i = 0; i < nSeg - 1; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  geo.setIndex(idx);
  const mat = createRibbonTrailMaterial(color);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'SF_RibbonTrail';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  geo.setDrawRange(0, 0);
  scene.add(mesh);

  return createRibbonLane({
    nSeg,
    baseWidth,
    pos,
    uvs,
    normals,
    vertBase: 0,
    markAttribute(kind, firstVert, vertCount) {
      let attribute = null;
      let record = null;
      let itemSize = 0;
      if (kind === 'position') { attribute = posAttr; record = posUpdateRange; itemSize = 3; }
      else if (kind === 'aTrailNormal') { attribute = normalAttr; record = normalUpdateRange; itemSize = 3; }
      else if (kind === 'aTrailUv') { attribute = uvAttr; record = uvUpdateRange; itemSize = 2; }
      else return;
      record.start = firstVert * itemSize;
      record.count = vertCount * itemSize;
      attribute.updateRanges.length = 1;
      attribute.updateRanges[0] = record;
      attribute.needsUpdate = true;
    },
    applyPresentation(opacity, scroll, time, radiance) {
      if (opacity != null) {
        mat.uniforms.uOpacity.value = Number.isFinite(opacity)
          ? Math.max(0, Math.min(1, opacity))
          : 0;
      }
      if (scroll != null) mat.uniforms.uTrailScroll.value = Number.isFinite(scroll) ? scroll : 0;
      if (time != null) mat.uniforms.uTrailTime.value = Number.isFinite(time) ? time : 0;
      if (radiance != null) {
        mat.uniforms.uRadiance.value = Number.isFinite(radiance)
          ? Math.max(0, Math.min(3.2, radiance))
          : 0;
      }
      return mat.uniforms.uOpacity.value;
    },
    setDrawnPairs(count) {
      geo.setDrawRange(0, count > 1 ? (count - 1) * 6 : 0);
    },
    setVisible(want) {
      // Compile latch (same userData.pipelinesPending contract entity meshes use): a
      // lazily-created trail queues its program link after-present, and the first thrust
      // draw before it settles links inside bloomScene (1.7 s Intel brick). Geometry is
      // already built, so reveal on the first rebuild after the latch clears. An
      // sfAdmittedOnce trail already has a linked program — a re-admission latch on it
      // must not blank the live trail mid-flight (same exemption the submit gate uses).
      mesh.visible = mesh.userData.pipelinesPending === true
        && mesh.userData.sfAdmittedOnce !== true ? false : !!want;
      return mesh.visible;
    },
    isDrawn() { return mesh.visible; },
    getMesh() { return mesh; },
    getMaterial() { return mat; },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  });
}

/**
 * Fleet ribbon batch — every NPC wake lane shares ONE BufferGeometry + ONE ShaderMaterial,
 * so a full cohort costs one mesh and one draw call instead of one mesh per ship.
 *
 * Each lane is the shared createRibbonLane core writing its own vertex slice of the pooled
 * arrays; acquire()/dispose() are slot checkouts, never allocations. Dirty uploads publish the
 * min/max component span per attribute through persistent updateRanges records (the same
 * no-allocation contract the solo trail's range records use — a record still attached is an
 * unconsumed publication, so a new mark widens it rather than dropping the older half).
 *
 * Tail hiding without a per-lane drawRange: a lane that shrinks or hides collapses its stale
 * pairs onto its last live pair, so every unused quad is zero-area. The single index buffer
 * therefore spans all slots at all times; dead lanes cost degenerate triangles only.
 */
export function createRibbonTrailBatch(scene, options = {}) {
  const capacity = Math.max(1, Math.floor(options.capacity || 1));
  const nSeg = Math.max(2, Math.floor(options.nSeg || 24));
  const vertsPerLane = nSeg * 2;
  const totalVerts = capacity * vertsPerLane;
  const pos = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const normals = new Float32Array(totalVerts * 3);
  const shade = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 3);
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  posAttr.usage = THREE.DynamicDrawUsage;
  geo.setAttribute('position', posAttr);
  const uvAttr = new THREE.BufferAttribute(uvs, 2);
  uvAttr.usage = THREE.DynamicDrawUsage;
  geo.setAttribute('aTrailUv', uvAttr);
  const normalAttr = new THREE.BufferAttribute(normals, 3);
  normalAttr.usage = THREE.DynamicDrawUsage;
  geo.setAttribute('aTrailNormal', normalAttr);
  const shadeAttr = new THREE.BufferAttribute(shade, 2);
  shadeAttr.usage = THREE.DynamicDrawUsage;
  geo.setAttribute('aTrailShade', shadeAttr);
  const colorAttr = new THREE.BufferAttribute(colors, 3);
  colorAttr.usage = THREE.DynamicDrawUsage;
  geo.setAttribute('aTrailColor', colorAttr);
  const IndexArray = totalVerts > 65535 ? Uint32Array : Uint16Array;
  const idx = new IndexArray(capacity * (nSeg - 1) * 6);
  let indexCursor = 0;
  for (let s = 0; s < capacity; s++) {
    const sb = s * vertsPerLane;
    for (let i = 0; i < nSeg - 1; i++) {
      const b = sb + i * 2;
      idx[indexCursor++] = b;
      idx[indexCursor++] = b + 1;
      idx[indexCursor++] = b + 2;
      idx[indexCursor++] = b + 1;
      idx[indexCursor++] = b + 3;
      idx[indexCursor++] = b + 2;
    }
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  const mat = createBatchedRibbonTrailMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'SF_RibbonTrailBatch';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  scene.add(mesh);

  // One persistent range record per tracked attribute — never allocated per frame. A still-
  // attached record is an unconsumed publication, so a new mark widens it instead of dropping
  // the older dirty half of the span.
  const mark = (attribute, record, startComponent, countComponent) => {
    if (attribute.updateRanges.length === 1 && attribute.updateRanges[0] === record
      && record.count > 0) {
      const end = Math.max(record.start + record.count, startComponent + countComponent);
      record.start = Math.min(record.start, startComponent);
      record.count = end - record.start;
    } else {
      record.start = startComponent;
      record.count = countComponent;
      attribute.updateRanges.length = 1;
      attribute.updateRanges[0] = record;
    }
    attribute.needsUpdate = true;
  };
  const posRange = { start: 0, count: 0 };
  const uvRange = { start: 0, count: 0 };
  const normalRange = { start: 0, count: 0 };
  const shadeRange = { start: 0, count: 0 };
  const colorRange = { start: 0, count: 0 };
  const markAttribute = (kind, firstVert, vertCount) => {
    if (kind === 'position') mark(posAttr, posRange, firstVert * 3, vertCount * 3);
    else if (kind === 'aTrailNormal') mark(normalAttr, normalRange, firstVert * 3, vertCount * 3);
    else if (kind === 'aTrailUv') mark(uvAttr, uvRange, firstVert * 2, vertCount * 2);
    else if (kind === 'aTrailShade') mark(shadeAttr, shadeRange, firstVert * 2, vertCount * 2);
    else if (kind === 'aTrailColor') mark(colorAttr, colorRange, firstVert * 3, vertCount * 3);
  };

  // Same userData.pipelinesPending / sfAdmittedOnce latch contract the solo trail honors.
  const revealBlocked = () => mesh.userData.pipelinesPending === true
    && mesh.userData.sfAdmittedOnce !== true;
  let liveWantCount = 0;
  const refreshMeshVisible = () => {
    mesh.visible = liveWantCount > 0 && !revealBlocked();
  };

  const slots = [];
  const freeSlots = [];
  const colorScratch = new THREE.Color();

  const batch = {
    mesh,
    material: mat,
    capacity,
    nSeg,
    vertsPerLane,
    liveCount: 0,
    /**
     * Check out one ribbon lane. Returns the shared lane API (follow/rebuild/syncHead/
     * retire/clear/reproject/claimCadence/inspect/getMesh/getMaterial/dispose — the
     * createRibbonTrail contract) or null when every slot is occupied.
     */
    acquire(colorCss, baseWidth) {
      if (!freeSlots.length) return null;
      const index = freeSlots.pop();
      const slot = slots[index];
      slot.occupied = true;
      batch.liveCount++;
      const c = colorScratch.set(colorCss || '#7fe0ff');
      const cb = slot.vertBase * 3;
      for (let v = 0; v < vertsPerLane; v++) {
        colors[cb + v * 3] = c.r;
        colors[cb + v * 3 + 1] = c.g;
        colors[cb + v * 3 + 2] = c.b;
      }
      markAttribute('aTrailColor', slot.vertBase, vertsPerLane);
      slot.opacity = 0.62;
      slot.radiance = 1.85;
      slot.api._reset(baseWidth);
      return slot.api;
    },
    inspect() {
      return {
        capacity,
        nSeg,
        vertsPerLane,
        liveCount: batch.liveCount,
        visibleLanes: liveWantCount,
      };
    },
    dispose() {
      for (const slot of slots) {
        if (!slot.occupied) continue;
        slot.occupied = false;
        try { slot.api.clear(); } catch (_) { /* collapse is best-effort at teardown */ }
      }
      slots.length = 0;
      freeSlots.length = 0;
      liveWantCount = 0;
      batch.liveCount = 0;
      mesh.visible = false;
      scene.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };

  const releaseSlot = (slot) => {
    if (!slot || !slot.occupied) return;
    slot.occupied = false;
    batch.liveCount--;
    try { slot.api.clear(); } catch (_) { /* collapsing stale pairs is best-effort */ }
    if (slot.wantsVisible) {
      slot.wantsVisible = false;
      liveWantCount--;
    }
    freeSlots.push(slot.index);
    refreshMeshVisible();
  };

  for (let s = 0; s < capacity; s++) {
    const slot = {
      index: s,
      vertBase: s * vertsPerLane,
      occupied: false,
      wantsVisible: false,
      opacity: 0.62,
      radiance: 1.85,
      api: null,
    };
    slot.api = createRibbonLane({
      nSeg,
      baseWidth: 1,
      pos,
      uvs,
      normals,
      vertBase: slot.vertBase,
      markAttribute,
      applyPresentation(opacity, scroll, time, radiance) {
        // Scroll/time are frame-global: every lane publishes the same values to the shared
        // material, so last-writer-wins is exact. Opacity/radiance are per-owner, carried to
        // the shader as a packed per-vertex vec2 (constant across the strip → interpolation
        // reproduces the solo uniform's value at every fragment).
        if (scroll != null) mat.uniforms.uTrailScroll.value = Number.isFinite(scroll) ? scroll : 0;
        if (time != null) mat.uniforms.uTrailTime.value = Number.isFinite(time) ? time : 0;
        if (opacity != null) {
          slot.opacity = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 0;
        }
        if (radiance != null) {
          slot.radiance = Number.isFinite(radiance) ? Math.max(0, Math.min(3.2, radiance)) : 0;
        }
        const sb = slot.vertBase * 2;
        for (let v = 0; v < vertsPerLane; v++) {
          shade[sb + v * 2] = slot.opacity;
          shade[sb + v * 2 + 1] = slot.radiance;
        }
        markAttribute('aTrailShade', slot.vertBase, vertsPerLane);
        return slot.opacity;
      },
      setDrawnPairs(count) {
        // One index buffer spans every slot at all times, so a lane cannot hide its tail with a
        // drawRange. Every pair beyond the live strip is collapsed onto the last live pair —
        // dead quads become zero-area and emit no fragments, and the boundary quad can never
        // bridge a live strip into stale vertex space. Positions are all a degenerate quad
        // needs, so normals/uvs in the tail are left untouched (never rasterized). Steady
        // state is free: once the wake fills to nSeg there is no tail and nothing is marked.
        const c = Math.max(0, Math.min(nSeg, count | 0));
        if (c >= nSeg) return;
        const src = c > 0 ? c - 1 : 0;
        const sv = (slot.vertBase + src * 2) * 3;
        for (let p = c; p < nSeg; p++) {
          const dv = (slot.vertBase + p * 2) * 3;
          pos[dv] = pos[sv];
          pos[dv + 1] = pos[sv + 1];
          pos[dv + 2] = pos[sv + 2];
          pos[dv + 3] = pos[sv + 3];
          pos[dv + 4] = pos[sv + 4];
          pos[dv + 5] = pos[sv + 5];
        }
        markAttribute('position', slot.vertBase + c * 2, (nSeg - c) * 2);
      },
      setVisible(want) {
        const w = !!want;
        if (w !== slot.wantsVisible) {
          slot.wantsVisible = w;
          liveWantCount += w ? 1 : -1;
        }
        refreshMeshVisible();
        return w && !revealBlocked();
      },
      isDrawn() {
        return slot.wantsVisible && !revealBlocked();
      },
      getMesh() { return mesh; },
      getMaterial() { return mat; },
      dispose() { releaseSlot(slot); },
      slotIndex: s,
    });
    slots.push(slot);
  }
  // Pop order: lowest slot index first, so lanes pack densely at the front of the buffer.
  for (let s = capacity - 1; s >= 0; s--) freeSlots.push(s);

  return batch;
}

export function createPrecompileTrailSurfaces() {
  // Use the live lazy-ribbon factory. The ribbon program key includes the geometry's attribute set
  // (position, aTrailUv, aTrailNormal), so a stand-in ribbon would link a different program.
  const ribbonStaging = new THREE.Group();
  const ribbonOwner = createRibbonTrail(ribbonStaging, '#7fe0ff', 30, 5);
  ribbonOwner.push(-3, 0, 0);
  ribbonOwner.push(3, 0, 0);
  ribbonOwner.rebuild(0.5, 0.17, 0.8);
  const ribbon = ribbonOwner.getMesh();
  ribbon.removeFromParent();
  ribbon.name = 'SF_Precompile_RibbonTrail';
  // The batched fleet program is a DIFFERENT shader (per-vertex tint/shade attributes), so it
  // links its own program and needs its own staged exemplar — otherwise the first live NPC
  // cohort mint links inside the bloom pass.
  const batchStaging = new THREE.Group();
  const ribbonBatch = createRibbonTrailBatch(batchStaging, { capacity: 2, nSeg: 30 });
  const batchLane = ribbonBatch.acquire('#7fe0ff', 5);
  batchLane.push(-3, 0, 0);
  batchLane.push(3, 0, 0);
  batchLane.rebuild(0.5, 0.17, 0.8);
  const batchedRibbon = ribbonBatch.mesh;
  batchedRibbon.removeFromParent();
  batchedRibbon.name = 'SF_Precompile_RibbonTrailBatch';
  const streakPool = createTrailStreakPool(1);
  updateTrailStreakInstance(streakPool, 0, {
    x: 0, y: 0.4, z: 0, vx: 1, vz: 0,
    width: 1, length: 4, opacity: 0.8,
    color: new THREE.Color('#88aaff'),
  });
  commitTrailStreakInstances(streakPool, 1, { scroll: 0.17, time: 0.8 });
  const streak = streakPool.mesh;
  streak.name = 'SF_Precompile_TrailStreak';
  return { ribbon, streak, ribbonBatch: batchedRibbon };
}
