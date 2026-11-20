import * as THREE from 'three';

// LOOK-05A — triplanar rock surfacing for UV-less rock bodies.
//
// The 24 authored `place_rock_<substance>_<size>` models (Swarm debris, Helios/claim rocks) have no UV
// coordinates, so a texture map on them samples one texel and the body reads as a flat tinted lump. These
// bodies sample one generated set per family in OBJECT space instead: three projections blended by the
// surface normal with a sharp falloff, normals reoriented per axis with the whiteout blend, so strata,
// fractures and grime hold on any shape with no re-export. Object space scaled by the draw scale means the
// texel density is world-correct (a monolith and a pebble show the same grain) and the pattern is glued to the
// rock as it tumbles.
//
// One shader program for every rock family (the set, tile size and tint are uniforms), chained BEFORE
// installIllustratedSurface so the Look's value governor, rim and rock fill still apply on top.
// Until the maps decode the shared `sfTpOn` uniform stays 0 and the rock keeps its authored flat look; when
// they land every installed material flips on together with no recompile.

const ROOT = '/assets/ships/release/surfaces/rock-triplanar/';

/** world units one tile covers; tint multiplies the generated albedo (value governor per substance). */
export const ROCK_TRIPLANAR_FAMILIES = Object.freeze({
  // sat: how much of the generated colour survives (the Helios key light tints, the stone does not shout);
  // contrast: value spread around mid-grey; rough: base roughness; ao: cavity strength from the normal slope;
  // ember: hot-vein emission (0 off); metal: bright-fleck metalness; frost: lifts pale facets;
  // floor (ROCK-03): minimum pigment so the darkest texels never crush to a pure-black hole;
  // rim (ROCK-03/04): cool premultiplied limb emission, dim and broad, so a charcoal body still
  // separates from black space without reading as a lamp. ROCK-04 raised the dark families'
  // limb ~2-3x and their pigment floor a little: at chase zoom in Swarm round 10 the charcoal
  // and scrap bodies were still reading as holes in space (ACCEPT-07 dark-rock crops).
  silicate: Object.freeze({ files: { baseColor: `${ROOT}silicate_basecolor.jpg`, normal: `${ROOT}silicate_normal.png` }, tile: 38, normal: 1.15, tint: [1.16, 1.20, 1.34], sat: 0.20, contrast: 1.25, rough: 0.9, ao: 1.1, ember: 0, metal: 0, frost: 0, floor: 0.040, rim: [0.117, 0.151, 0.247] }),
  slag: Object.freeze({ files: null, alias: 'silicate', tile: 30, normal: 1.3, tint: [0.30, 0.29, 0.32], sat: 0.25, contrast: 1.5, rough: 0.34, ao: 1.0, ember: 3.4, metal: 0, frost: 0, floor: 0.050, rim: [0.070, 0.085, 0.140] }),
  metal: Object.freeze({ files: { baseColor: `${ROOT}metal_basecolor.jpg`, normal: `${ROOT}metal_normal.png` }, tile: 34, normal: 1.2, tint: [1.0, 1.04, 1.16], sat: 0.55, contrast: 1.45, rough: 0.82, ao: 1.1, ember: 0, metal: 0.95, frost: 0, floor: 0.050, rim: [0.110, 0.136, 0.220] }),
  crystal: Object.freeze({ files: { baseColor: `${ROOT}crystal_basecolor.jpg`, normal: `${ROOT}crystal_normal.png` }, tile: 30, normal: 1.0, tint: [1.0, 0.97, 1.08], sat: 0.7, contrast: 1.15, rough: 0.55, ao: 0.9, ember: 0, metal: 0, frost: 0, floor: 0.030, rim: [0.050, 0.052, 0.095] }),
  ice: Object.freeze({ files: { baseColor: `${ROOT}ice_basecolor.jpg`, normal: `${ROOT}ice_normal.png` }, tile: 36, normal: 0.9, tint: [1.55, 1.65, 1.8], sat: 0.7, contrast: 1.1, rough: 0.5, ao: 0.7, ember: 0, metal: 0, frost: 0.35, floor: 0.045, rim: [0.055, 0.080, 0.115] }),
  cooked: Object.freeze({ files: null, alias: 'silicate', tile: 34, normal: 1.2, tint: [0.95, 0.76, 0.66], sat: 0.5, contrast: 1.35, rough: 0.85, ao: 1.1, ember: 0.9, metal: 0, frost: 0, floor: 0.048, rim: [0.130, 0.156, 0.260] }),
  // ROCK-04: `place_rock_junk_*` was missing from SUBSTANCE_FAMILY, so the whole scrap family
  // fell through to its authored flat stone (base 0.068/0.042/0.030) with no limb at all — the
  // near-black lump in the ACCEPT-07 round-10 crops. Salvage scrap, so the grain stays warm
  // brown under the cool limb: dark, not grey.
  junk: Object.freeze({ files: null, alias: 'silicate', tile: 32, normal: 1.2, tint: [0.78, 0.62, 0.52], sat: 0.35, contrast: 1.45, rough: 0.8, ao: 1.05, ember: 0, metal: 0.15, frost: 0, floor: 0.055, rim: [0.125, 0.140, 0.235] }),
});

const SUBSTANCE_FAMILY = Object.freeze({
  silicate: 'silicate', slag: 'slag', metallic_ore: 'metal', reef_metal: 'metal',
  crystal: 'crystal', ice: 'ice', cooked_rock: 'cooked', junk: 'junk',
});

/** Family for a place id (`place_rock_<substance>_<pebble|boulder|monolith>`), else null. */
export function rockTriplanarFamilyForAsset(assetId) {
  const match = /^(?:sf_)?place_rock_(.+)_(?:pebble|boulder|monolith)$/.exec(String(assetId || '').toLowerCase());
  return match ? SUBSTANCE_FAMILY[match[1]] || null : null;
}

// Shared by every installed material: one object per slot, written once when the maps decode.
const TP_ON = { value: 0 };
const flat = (r, g, b) => {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
};
const PLACEHOLDER_ALBEDO = flat(255, 255, 255);
const PLACEHOLDER_NORMAL = flat(128, 128, 255);
const slots = new Map(); // base family -> { albedo: {value}, normal: {value} }

function slotFor(base) {
  let slot = slots.get(base);
  if (!slot) {
    slot = { albedo: { value: PLACEHOLDER_ALBEDO }, normal: { value: PLACEHOLDER_NORMAL } };
    slots.set(base, slot);
  }
  return slot;
}

let readyPromise = null;
let ready = false;

function configure(texture, color) {
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** Decode every family set and warm it on the GPU. Never fatal: failure leaves the rocks on their authored look. */
export function preloadRockTriplanarLibrary(renderer, options = {}) {
  if (readyPromise) return readyPromise;
  const loadTexture = typeof options.loadTexture === 'function'
    ? options.loadTexture : (url) => new THREE.TextureLoader().loadAsync(url);
  const bases = Object.entries(ROCK_TRIPLANAR_FAMILIES).filter(([, f]) => f.files);
  readyPromise = Promise.all(bases.map(async ([name, f]) => {
    const [albedo, normal] = await Promise.all([loadTexture(f.files.baseColor), loadTexture(f.files.normal)]);
    configure(albedo, true); configure(normal, false);
    if (renderer && typeof renderer.initTexture === 'function') { renderer.initTexture(albedo); renderer.initTexture(normal); }
    return [name, albedo, normal];
  })).then((sets) => {
    for (const [name, albedo, normal] of sets) {
      const slot = slotFor(name);
      slot.albedo.value = albedo; slot.normal.value = normal;
    }
    ready = true;
    TP_ON.value = 1;
    return true;
  }).catch((error) => {
    readyPromise = null;
    if (typeof console !== 'undefined') console.warn('[rocks] triplanar rock maps failed; rocks keep their authored look.', error);
    return false;
  });
  return readyPromise;
}

export function rockTriplanarReady() { return ready; }

/** Look-bench / A-B switch: off puts every installed rock back on its authored flat look without a recompile. */
export function setRockTriplanarEnabled(on) { TP_ON.value = on && ready ? 1 : 0; }

export const ROCK_TRIPLANAR_TOKEN = 'spaceface-rock-triplanar-v1';

const VERTEX_PARS = `
varying vec3 vTpPos;
varying vec3 vTpNrm;
`;
const VERTEX_BODY = `
vTpPos = position;
#ifdef USE_INSTANCING
  // ROCK-03: pooled asteroids draw through InstancedMesh — the per-rock scale lives in the
  // instance matrix, not the shared model matrix, or every pooled rock would sample the same
  // unit-sphere texel patch.
  vTpPos *= length(instanceMatrix[0].xyz);
#else
  vTpPos *= length(vec3(modelMatrix[0].x, modelMatrix[0].y, modelMatrix[0].z));
#endif
vTpNrm = normal;
`;
const FRAGMENT_PARS = `
varying vec3 vTpPos;
varying vec3 vTpNrm;
uniform sampler2D sfTpAlbedo;
uniform sampler2D sfTpNormal;
uniform float sfTpOn;
uniform float sfTpTile;
uniform float sfTpNormalScale;
uniform float sfTpMetal;
uniform float sfTpSat;
uniform float sfTpContrast;
uniform float sfTpRough;
uniform float sfTpAo;
uniform float sfTpEmber;
uniform float sfTpFrost;
uniform float sfTpFloor;
uniform vec3 sfTpRim;
uniform vec3 sfTpTint;
uniform vec3 sfTpFlatColor;
uniform mat3 normalMatrix;
`;
// Sharp normal blend; the dominant axis wins and the two seams are narrow. Samples whose weight is
// negligible are skipped (uniform-coherent per fragment neighbourhood, so the cost is two projections on average).
const FRAGMENT_COLOR = `
vec3 sfTpWeights = vec3(1.0, 0.0, 0.0);
vec3 sfTpObjN = normalize(vTpNrm);
vec3 sfTpNormalOut = sfTpObjN;
float sfTpLum = 0.5;
float sfTpEmberMask = 0.0;
float sfTpCavity = 1.0;
if (sfTpOn > 0.5) {
  vec3 sfTpA = pow(abs(sfTpObjN), vec3(6.0));
  sfTpWeights = sfTpA / (sfTpA.x + sfTpA.y + sfTpA.z + 1e-5);
  vec2 sfTpUvX = vTpPos.zy * sfTpTile;
  vec2 sfTpUvY = vTpPos.xz * sfTpTile;
  vec2 sfTpUvZ = vTpPos.xy * sfTpTile;
  vec3 sfTpAlb = vec3(0.0);
  vec3 sfTpNx = vec3(0.0, 0.0, 1.0), sfTpNy = vec3(0.0, 0.0, 1.0), sfTpNz = vec3(0.0, 0.0, 1.0);
  if (sfTpWeights.x > 0.02) {
    sfTpAlb += texture2D(sfTpAlbedo, sfTpUvX).rgb * sfTpWeights.x;
    sfTpNx = texture2D(sfTpNormal, sfTpUvX).xyz * 2.0 - 1.0;
  }
  if (sfTpWeights.y > 0.02) {
    sfTpAlb += texture2D(sfTpAlbedo, sfTpUvY).rgb * sfTpWeights.y;
    sfTpNy = texture2D(sfTpNormal, sfTpUvY).xyz * 2.0 - 1.0;
  }
  if (sfTpWeights.z > 0.02) {
    sfTpAlb += texture2D(sfTpAlbedo, sfTpUvZ).rgb * sfTpWeights.z;
    sfTpNz = texture2D(sfTpNormal, sfTpUvZ).xyz * 2.0 - 1.0;
  }
  sfTpAlb /= max(dot(vec3(1.0), step(vec3(0.02), sfTpWeights) * sfTpWeights), 1e-4);
  sfTpLum = dot(sfTpAlb, vec3(0.2126, 0.7152, 0.0722));
  vec3 sfTpCol = mix(vec3(sfTpLum), sfTpAlb, sfTpSat);
  // ROCK-03: the darkest texels floor at the family's minimum pigment instead of crushing to a
  // pure-black hole, so a charcoal body keeps a whisper of colour and separates from space.
  sfTpCol = max((sfTpCol - 0.16) * sfTpContrast + 0.16, vec3(sfTpFloor));
  sfTpCol += vec3(sfTpFrost * smoothstep(0.30, 0.55, sfTpLum) * 0.5);
  // Whiteout blend: reorient each projection's tangent normal to the object normal, then mix.
  sfTpNx.xy *= sfTpNormalScale; sfTpNy.xy *= sfTpNormalScale; sfTpNz.xy *= sfTpNormalScale;
  // Cavity: where the sampled relief leans hard the surface is a crack or a lip, and it gets dark (read as form).
  float sfTpSlope = dot(vec3(length(sfTpNx.xy), length(sfTpNy.xy), length(sfTpNz.xy)), sfTpWeights);
  sfTpCavity = clamp(1.0 - sfTpAo * sfTpSlope * 0.9, 0.38, 1.0);
  // ROCK-03: the melt shows at the crack floors. The old mask keyed on rare bright rust flecks
  // (~3% of the sheet), so the fissure network the cavity term crushes to black rendered as a
  // black jagged band. The deep end of the relief (low cavity) is that fissure web — but the
  // auto-selected mip averages the slope field flat at gameplay distance, so the mask re-samples
  // the normal one level sharper (three cheap fetches, still the shared program).
  vec3 sfTpMn = vec3(0.0, 0.0, 1.0);
  if (sfTpWeights.x > 0.02) sfTpMn += (texture2D(sfTpNormal, sfTpUvX, -1.5).xyz * 2.0 - 1.0) * sfTpWeights.x;
  if (sfTpWeights.y > 0.02) sfTpMn += (texture2D(sfTpNormal, sfTpUvY, -1.5).xyz * 2.0 - 1.0) * sfTpWeights.y;
  if (sfTpWeights.z > 0.02) sfTpMn += (texture2D(sfTpNormal, sfTpUvZ, -1.5).xyz * 2.0 - 1.0) * sfTpWeights.z;
  sfTpMn /= max(dot(vec3(1.0), step(vec3(0.02), sfTpWeights) * sfTpWeights), 1e-4);
  float sfTpVeinSlope = length(sfTpMn.xy) * sfTpNormalScale;
  float sfTpVeinCavity = clamp(1.0 - sfTpAo * sfTpVeinSlope * 0.9, 0.38, 1.0);
  sfTpEmberMask = max(
    smoothstep(0.66, 0.46, sfTpVeinCavity) * smoothstep(0.62, 0.30, sfTpLum),
    smoothstep(0.26, 0.34, sfTpAlb.r - sfTpAlb.b) * smoothstep(0.10, 0.20, sfTpLum)
  );
  diffuseColor.rgb *= sfTpCol * sfTpTint * mix(0.55, 1.0, sfTpCavity) * sfTpCavity;
  sfTpNx = vec3(sfTpNx.xy + sfTpObjN.zy, abs(sfTpNx.z) * sfTpObjN.x);
  sfTpNy = vec3(sfTpNy.xy + sfTpObjN.xz, abs(sfTpNy.z) * sfTpObjN.y);
  sfTpNz = vec3(sfTpNz.xy + sfTpObjN.xy, abs(sfTpNz.z) * sfTpObjN.z);
  sfTpNormalOut = normalize(sfTpNx.zyx * sfTpWeights.x + sfTpNy.xzy * sfTpWeights.y + sfTpNz.xyz * sfTpWeights.z);
} else {
  diffuseColor.rgb *= sfTpFlatColor;
}
`;
const FRAGMENT_ROUGH = `
if (sfTpOn > 0.5) {
  roughnessFactor = clamp(sfTpRough - 0.28 * (sfTpLum - 0.22), 0.2, 0.98);
  // Bright flecks (metal) are polished: they catch the key and the rim.
  roughnessFactor = mix(roughnessFactor, 0.28, sfTpMetal * smoothstep(0.22, 0.32, sfTpLum));
}
`;
const FRAGMENT_METAL = `
if (sfTpOn > 0.5) {
  metalnessFactor = max(metalnessFactor, sfTpMetal * smoothstep(0.22, 0.32, sfTpLum));
}
`;
const FRAGMENT_EMISSIVE = `
if (sfTpOn > 0.5) {
  // ROCK-03: a cool broad limb for rough rock, dim and wide and far under the bloom threshold —
  // the silhouette guarantee that keeps a charcoal boulder readable against black space without
  // ever reading as a lamp or a glassy edge.
  float sfTpGrazing = clamp(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
  totalEmissiveRadiance += sfTpRim * pow(sfTpGrazing, 1.9);
  if (sfTpEmber > 0.0) {
    // Linear mask, not squared: the vein cores hold full HDR emission (bloom-eligible) while the
    // edges fall off softly — squaring crushed the whole web to ~0 at gameplay distance.
    totalEmissiveRadiance += vec3(1.0, 0.34, 0.08) * (sfTpEmber * sfTpEmberMask);
  }
}
`;
const FRAGMENT_NORMAL = `
if (sfTpOn > 0.5) {
  normal = normalize(normalMatrix * sfTpNormalOut);
}
`;

/**
 * Install the triplanar surface on a UV-less rock material. Chain order matters: call this BEFORE
 * installIllustratedSurface so the Look's governor wraps it. Returns false when the family is unknown.
 */
export function installTriplanarRock(material, family) {
  const spec = ROCK_TRIPLANAR_FAMILIES[family];
  if (!spec || !material || (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial)) return false;
  if (material.userData?.spacefaceTriplanarRock) return true;
  const base = spec.alias || family;
  const slot = slotFor(base);
  const previousHook = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey?.() || '';
  // The authored flat colour carries the substance value (Stone / Stone_deep / Stone_strata); keep its ratio to the
  // family's reference so deep and strata faces stay darker than the plain face, but never below a readable floor.
  const lum = Math.max(0.0001, material.color.r * 0.2126 + material.color.g * 0.7152 + material.color.b * 0.0722);
  const rel = Math.max(0.5, Math.min(1.1, Math.sqrt(lum / 0.1)));
  const tint = new THREE.Vector3(spec.tint[0] * rel, spec.tint[1] * rel, spec.tint[2] * rel);
  const uniforms = {
    sfTpAlbedo: slot.albedo, sfTpNormal: slot.normal, sfTpOn: TP_ON,
    sfTpFlatColor: { value: material.color.clone() },
    sfTpTile: { value: 1 / spec.tile }, sfTpNormalScale: { value: spec.normal },
    sfTpMetal: { value: spec.metal }, sfTpTint: { value: tint },
    sfTpSat: { value: spec.sat }, sfTpContrast: { value: spec.contrast }, sfTpRough: { value: spec.rough },
    sfTpAo: { value: spec.ao }, sfTpEmber: { value: spec.ember }, sfTpFrost: { value: spec.frost },
    sfTpFloor: { value: spec.floor || 0 }, sfTpRim: { value: new THREE.Vector3(...(spec.rim || [0, 0, 0])) },
  };
  // The decoded set owns the color multiplier. Keep the original pigment for the maps-off branch.
  material.color.setRGB(1, 1, 1);
  function triplanarRockShader(shader, renderer) {
    previousHook?.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>${FRAGMENT_COLOR}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>${FRAGMENT_ROUGH}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>${FRAGMENT_METAL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${FRAGMENT_EMISSIVE}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${FRAGMENT_NORMAL}`);
  }
  Object.assign(triplanarRockShader, previousHook);
  material.onBeforeCompile = triplanarRockShader;
  material.customProgramCacheKey = () => `${previousKey}|${ROCK_TRIPLANAR_TOKEN}`;
  material.userData = { ...(material.userData || {}), spacefaceTriplanarRock: family };
  material.needsUpdate = true;
  return true;
}
