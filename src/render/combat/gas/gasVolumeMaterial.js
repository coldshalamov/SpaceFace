// Gas / smoke / dust — the bounded raymarch that turns the baked films into matter.
//
// REPRESENTATION, and why this one
// --------------------------------
// Bounded 3D density playback. Not a flipbook: a flipbook has to face the camera to hide that it
// is flat, and a fly-through effect that turns to face you is the rotating square the standard
// rejects outright. This marches a real volume inside an oriented box, so flying around or through
// a body shows its actual shape, and the manual depth write makes it occlude and be occluded by
// hulls and rocks correctly.
//
// COST CONTROL - four mechanisms, all of them quality-preserving
// --------------------------------------------------------------
// 1. TIGHT BOUNDS. The bake stores the occupied AABB of every frame. The vertex shader shrinks the
//    proxy box to it, so the effect rasterises fewer pixels AND every ray has a shorter span. On
//    fracture-dust frame 0 the occupied box is 7.4% of the unit cube.
// 2. ADAPTIVE SAMPLES. Step count scales with projected size, between MIN and MAX. A body 30 px
//    across does not deserve the same march as one filling the screen.
// 3. EARLY OUT. The march stops once it is opaque, and rejects a ray that never finds matter.
// 4. SHARED EVERYTHING. One atlas texture, one motion texture, one material, one instanced draw
//    for all four families; the family is an instance attribute, not a second pipeline.
//
// DETAIL, and the M4 line
// -----------------------
// Sub-voxel detail is a domain warp by the BAKED MOTION FIELD, tiled inside its own cell. That is
// solver output used as a transport field, which M4 admits explicitly; it is not hash noise, and
// the visible artwork is still the baked film. Amplitude and frequency are per-family, so dust
// is granular and ambient gas is smooth.

import * as THREE from 'three';
import { GAS_FILM, decodeGasFilm } from './gasVolumeData.js';
import { GAS_FAMILIES, gasFilmFor } from './gasFamilies.js';

const G = GAS_FILM.grid;
const MG = GAS_FILM.motionGrid;
const [AX, AY, AZ] = GAS_FILM.atlas;
const MAX_MARCH_STEPS = 28;

let decoded = null;

/** Decode once per process; the two textures are shared by every gas batch. */
export function createGasVolumeTextures() {
  if (!decoded) decoded = decodeGasFilm();
  const density = new THREE.Data3DTexture(decoded.density, AX * G, AY * G, AZ * G);
  density.name = 'SF_GasDensityFilm_RG8';
  density.format = THREE.RGFormat;
  density.type = THREE.UnsignedByteType;
  density.minFilter = THREE.LinearFilter;
  density.magFilter = THREE.LinearFilter;
  density.wrapS = THREE.ClampToEdgeWrapping;
  density.wrapT = THREE.ClampToEdgeWrapping;
  density.wrapR = THREE.ClampToEdgeWrapping;
  density.unpackAlignment = 1;
  density.generateMipmaps = false;
  density.needsUpdate = true;

  const motion = new THREE.Data3DTexture(decoded.motion, AX * MG, AY * MG, AZ * MG);
  motion.name = 'SF_GasMotionField_RGBA8';
  motion.format = THREE.RGBAFormat;
  motion.type = THREE.UnsignedByteType;
  motion.minFilter = THREE.LinearFilter;
  motion.magFilter = THREE.LinearFilter;
  motion.wrapS = THREE.ClampToEdgeWrapping;
  motion.wrapT = THREE.ClampToEdgeWrapping;
  motion.wrapR = THREE.ClampToEdgeWrapping;
  motion.unpackAlignment = 1;
  motion.generateMipmaps = false;
  motion.needsUpdate = true;
  return { density, motion };
}

/** Flat vec3[64]: two entries per atlas cell, min then max, in normalised cell space. */
export function packCellBounds() {
  const bounds = [];
  for (let i = 0; i < GAS_FILM.slots * 2; i++) bounds.push(new THREE.Vector3(0, 0, 0));
  for (const family of GAS_FAMILIES) {
    const film = gasFilmFor(family);
    if (!film) continue;
    for (let f = 0; f < film.frames; f++) {
      const cell = film.cellOffset + f;
      const b = film.bounds;
      bounds[cell * 2].set(b[f * 6], b[f * 6 + 1], b[f * 6 + 2]);
      bounds[cell * 2 + 1].set(b[f * 6 + 3], b[f * 6 + 4], b[f * 6 + 5]);
    }
  }
  return bounds;
}

function familyUniformArrays() {
  const albedo = [];
  const emissive = [];
  const shape = [];
  const look = [];
  for (let slot = 0; slot < 4; slot++) {
    const family = GAS_FAMILIES.find((f) => f.slot === slot) || GAS_FAMILIES[0];
    albedo.push(new THREE.Vector3(...family.albedo));
    emissive.push(new THREE.Vector3(...family.emissive));
    shape.push(new THREE.Vector4(
      family.absorbGain, family.emissionGain, family.detailAmp, family.detailScale,
    ));
    look.push(new THREE.Vector4(
      family.shadowGain, family.auxWarmth, family.rimLift, family.grainGain,
    ));
  }
  return { albedo, emissive, shape, look };
}

const SHARED = /* glsl */`
  attribute vec4 aGasPose;   // xyz centre in scene-local space, w heading about Y
  attribute vec4 aGasScale;  // xyz body extent in world units, w opacity
  attribute vec4 aGasTint;   // rgb colour multiplier, w normalised phase 0..1
  attribute vec4 aGasFilm;   // x cell offset, y frame count, z family + 8*pingpong, w seed
  attribute vec4 aGasOcclude;// xyz occluder centre in scene-local space, w radius (<=0 disables)

  varying vec3 vFilmPos;
  varying vec3 vFilmCam;
  varying vec3 vBoxMin;
  varying vec3 vBoxMax;
  varying vec3 vCentre;
  varying vec3 vScale;
  varying vec3 vTint;
  varying vec4 vOccluder;
  varying vec2 vCells;
  varying float vHeading;
  varying float vBlend;
  varying float vOpacity;
  varying float vFamily;
  varying float vSeed;
  varying float vSteps;
  varying float vWorldPerFilm;

  vec3 gasRotateY(vec3 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
  }
`;

const VERTEX = /* glsl */`
  ${SHARED}
  uniform vec3 uCellBounds[${GAS_FILM.slots * 2}];
  uniform float uViewportHeight;
  uniform vec2 uStepRange;     // min, max march samples
  uniform vec2 uPixelRange;    // projected diameter in px that maps to min / max samples

  void main() {
    float count = max(1.0, aGasFilm.y);
    float span = count - 1.0;
    float phase = clamp(aGasTint.w, 0.0, 1.0);
    // A ping-pong family walks a triangle wave, so the loop has no seam and the pair of frames
    // being blended is always ASCENDING - which keeps the baked forward motion vectors valid.
    float pingpong = step(4.0, aGasFilm.z);
    float walk = mix(phase, 1.0 - abs(1.0 - 2.0 * phase), pingpong) * span;
    float f0 = floor(walk);
    float f1 = min(span, f0 + 1.0);
    vBlend = walk - f0;
    vCells = aGasFilm.x + vec2(f0, f1);
    vFamily = aGasFilm.z - 8.0 * pingpong;
    vSeed = aGasFilm.w;

    int c0 = int(vCells.x) * 2;
    int c1 = int(vCells.y) * 2;
    vBoxMin = min(uCellBounds[c0], uCellBounds[c1]);
    vBoxMax = max(uCellBounds[c0 + 1], uCellBounds[c1 + 1]);

    vCentre = aGasPose.xyz;
    vHeading = aGasPose.w;
    vScale = aGasScale.xyz;
    vOpacity = aGasScale.w;
    vTint = aGasTint.rgb;

    vec3 filmP = mix(vBoxMin, vBoxMax, position + 0.5);
    vFilmPos = filmP;
    vec3 objectP = (filmP - 0.5) * vScale;
    vec4 world = modelMatrix * vec4(vCentre + gasRotateY(objectP, vHeading), 1.0);

    // Identity object transforms are the norm here, but inverting keeps a translated diagnostic
    // parent honest instead of silently offsetting every ray origin.
    vec3 camLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    vFilmCam = gasRotateY(camLocal - vCentre, -vHeading) / max(vScale, vec3(0.0001)) + 0.5;

    vWorldPerFilm = length(vScale) * 0.5773503;

    vec4 occl = aGasOcclude;
    vOccluder = vec4(
      gasRotateY(occl.xyz - vCentre, -vHeading) / max(vScale, vec3(0.0001)) + 0.5,
      occl.w / max(0.0001, vWorldPerFilm)
    );

    // Sample count follows projected size: a distant puff is not worth a near body's march.
    vec4 viewCentre = viewMatrix * modelMatrix * vec4(vCentre, 1.0);
    float bodyRadius = 0.5 * length(vScale * (vBoxMax - vBoxMin));
    float pixels = uViewportHeight * projectionMatrix[1][1] * bodyRadius
      / max(0.001, -viewCentre.z);
    vSteps = mix(uStepRange.x, uStepRange.y,
      smoothstep(uPixelRange.x, uPixelRange.y, pixels));

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */`
  precision highp sampler3D;
  ${SHARED}
  uniform sampler3D uDensityFilm;
  uniform sampler3D uMotionField;
  uniform vec3 uAlbedo[4];
  uniform vec3 uEmissive[4];
  uniform vec4 uShape[4];      // absorbGain, emissionGain, detailAmp, detailScale
  uniform vec4 uLook[4];       // shadowGain, auxWarmth, rimLift, grainGain
  uniform vec3 uKeyDirection;
  uniform mat4 uWorldToClip;
  uniform mat4 uObjectToWorld;
  uniform float uRadiance;
  uniform float uOccluderSoftness;
  uniform float uNearFadeWu;
  uniform float uMotionMax;

  const float CELL_X = ${AX}.0;
  const float CELL_Y = ${AY}.0;
  const float GRID = ${G}.0;
  const float MOTION_GRID = ${MG}.0;
  const vec3 FILM_DIMS = vec3(${AX * G}.0, ${AY * G}.0, ${AZ * G}.0);
  const vec3 MOTION_DIMS = vec3(${AX * MG}.0, ${AY * MG}.0, ${AZ * MG}.0);

  vec3 gasCellOrigin(float cell) {
    return vec3(mod(cell, CELL_X), mod(floor(cell / CELL_X), CELL_Y), floor(cell / (CELL_X * CELL_Y)));
  }

  // Square-root companding in the bake keeps tenuous edges alive in four bits; undo it here.
  vec2 gasDensity(vec3 p, float cell) {
    vec3 uvw = (0.5 + clamp(p, 0.0, 1.0) * (GRID - 1.0) + gasCellOrigin(cell) * GRID) / FILM_DIMS;
    vec2 d = texture(uDensityFilm, uvw).rg;
    return d * d;
  }

  /** Baked displacement in grid cells per frame interval. */
  vec3 gasMotion(vec3 p, float cell) {
    vec3 uvw = (0.5 + clamp(p, 0.0, 1.0) * (MOTION_GRID - 1.0)
      + gasCellOrigin(cell) * MOTION_GRID) / MOTION_DIMS;
    return (texture(uMotionField, uvw).rgb * 2.0 - 1.0) * uMotionMax;
  }

  void main() {
    int family = int(vFamily);
    vec4 shape = uShape[family];
    vec4 look = uLook[family];

    vec3 ray = normalize(vFilmPos - vFilmCam);
    vec3 safeRay = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), ray)) * max(abs(ray), vec3(0.00001));
    vec3 a = (vBoxMin - vFilmCam) / safeRay;
    vec3 b = (vBoxMax - vFilmCam) / safeRay;
    vec3 nearV = min(a, b);
    vec3 farV = max(a, b);
    float begin = max(0.0, max(nearV.x, max(nearV.y, nearV.z)));
    float end = min(farV.x, min(farV.y, farV.z));
    if (end <= begin) discard;

    float steps = clamp(vSteps, 3.0, ${MAX_MARCH_STEPS}.0);
    float stride = (end - begin) / steps;
    float cellToFilm = 1.0 / GRID;
    vec3 detailOffset = vec3(vSeed * 3.7, vSeed * 1.9, vSeed * 2.3);

    vec3 sum = vec3(0.0);
    float transmittance = 1.0;
    float first = -1.0;

    for (int i = 0; i < ${MAX_MARCH_STEPS}; i++) {
      if (float(i) >= steps) break;
      float along = begin + (float(i) + 0.5) * stride;
      vec3 p = vFilmCam + ray * along;

      // Sub-voxel structure: the cell's own solved motion field, tiled, used as a domain warp.
      vec3 tiled = fract(p * shape.w + detailOffset);
      p += gasMotion(tiled, vCells.x) * shape.z;

      // Motion-vector frame interpolation: walk each frame toward the other along its own baked
      // transport before blending. A straight cross-dissolve of two volumes boils; this does not.
      vec3 m0 = gasMotion(p, vCells.x);
      vec3 m1 = gasMotion(p, vCells.y);
      vec2 fieldA = gasDensity(p - m0 * (vBlend * cellToFilm), vCells.x);
      vec2 fieldB = gasDensity(p + m1 * ((1.0 - vBlend) * cellToFilm), vCells.y);
      vec2 field = mix(fieldA, fieldB, vBlend);

      float density = field.r;
      float aux = field.g;

      // Depth-aware soft intersection with the surface this gas came off. The analytic sphere is
      // the hull or rock face the emitter handed us; the gas dilutes into it instead of ending on
      // a hard line, and samples inside it contribute nothing.
      if (vOccluder.w > 0.0) {
        float gap = length(p - vOccluder.xyz) - vOccluder.w;
        density *= smoothstep(0.0, uOccluderSoftness, gap);
      }
      // Fly-through: fade the first metres in front of the eye so entering a body is a dissolve
      // rather than a near-plane cut.
      density *= smoothstep(0.0, uNearFadeWu, along * vWorldPerFilm);

      if (density > 0.0025) {
        if (first < 0.0) first = along;
        float absorb = 1.0 - exp(-density * stride * shape.x);

        // Two taps along one fixed key. Bounded single scattering reveals the baked lobes and
        // cavities as rounded masses; it is not a flat opacity mask.
        vec3 key = uKeyDirection * 0.055;
        float blocker = gasDensity(p + key, vCells.x).r + gasDensity(p + key * 2.4, vCells.x).r;
        float light = exp(-blocker * look.x);
        float painted = 0.08 + 0.42 * smoothstep(0.16, 0.40, light)
          + 0.50 * smoothstep(0.58, 0.80, light);

        // One expression, four materials. auxWarmth whitens (condensate), grainGain darkens
        // (coarse rock flour), emissionGain self-lights (still-burning gas).
        vec3 tinted = mix(uAlbedo[family], uEmissive[family], look.y * aux);
        vec3 grained = tinted * (1.0 - look.w * aux);
        vec3 scatter = grained * (0.10 + 1.02 * painted) * vTint;
        scatter *= 1.0 + look.z * (1.0 - smoothstep(0.0, 0.30, density));
        vec3 emitted = uEmissive[family] * vTint * shape.y * pow(aux, 0.8) * (0.30 + 0.70 * light);

        sum += transmittance * absorb * (scatter + emitted);
        transmittance *= 1.0 - absorb;
        if (transmittance < 0.018) break;
      }
    }

    float alpha = (1.0 - transmittance) * vOpacity;
    if (alpha < 0.004 || first < 0.0) discard;

    // Depth from the first OCCUPIED sample, never the proxy's back face, so a body sorts against
    // hulls and rocks by where its matter actually starts.
    vec3 firstFilm = vFilmCam + ray * first;
    vec3 objectPoint = vCentre + gasRotateY((firstFilm - 0.5) * vScale, vHeading);
    vec4 clip = uWorldToClip * uObjectToWorld * vec4(objectPoint, 1.0);
    gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);

    // Premultiplied. One pass covers both the soot that OCCLUDES and the fire that ADDS, which a
    // split normal/additive bucket pair cannot do for the same body.
    gl_FragColor = vec4(sum * uRadiance * vOpacity, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createGasVolumeMaterial(textures) {
  const families = familyUniformArrays();
  const material = new THREE.ShaderMaterial({
    name: 'SF_GasVolume_baked-density-march',
    uniforms: {
      uDensityFilm: { value: textures.density },
      uMotionField: { value: textures.motion },
      uCellBounds: { value: packCellBounds() },
      uAlbedo: { value: families.albedo },
      uEmissive: { value: families.emissive },
      uShape: { value: families.shape },
      uLook: { value: families.look },
      uKeyDirection: { value: new THREE.Vector3(-0.42, 0.78, 0.30).normalize() },
      uWorldToClip: { value: new THREE.Matrix4() },
      uObjectToWorld: { value: new THREE.Matrix4() },
      uRadiance: { value: 1 },
      uOccluderSoftness: { value: 0.16 },
      uNearFadeWu: { value: 3.2 },
      uMotionMax: { value: GAS_FILM.motionMaxCells },
      uViewportHeight: { value: 800 },
      uStepRange: { value: new THREE.Vector2(6, MAX_MARCH_STEPS) },
      uPixelRange: { value: new THREE.Vector2(18, 260) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.BackSide,
    forceSinglePass: true,
    toneMapped: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  material.userData.spacefaceTransientTechnique = 'baked-density-film';
  material.userData.spacefaceGasVolume = true;
  return material;
}

export const GAS_MAX_MARCH_STEPS = MAX_MARCH_STEPS;
