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
  silicate: Object.freeze({ files: { baseColor: `${ROOT}silicate_basecolor.jpg`, normal: `${ROOT}silicate_normal.png` }, tile: 38, normal: 1.0, tint: [0.92, 0.9, 0.88], metal: 0 }),
  slag: Object.freeze({ files: null, alias: 'silicate', tile: 30, normal: 1.15, tint: [0.62, 0.58, 0.56], metal: 0 }),
  metal: Object.freeze({ files: { baseColor: `${ROOT}metal_basecolor.jpg`, normal: `${ROOT}metal_normal.png` }, tile: 34, normal: 1.1, tint: [1.0, 1.0, 1.02], metal: 0.55 }),
  crystal: Object.freeze({ files: { baseColor: `${ROOT}crystal_basecolor.jpg`, normal: `${ROOT}crystal_normal.png` }, tile: 30, normal: 1.0, tint: [0.95, 0.92, 1.0], metal: 0 }),
  ice: Object.freeze({ files: { baseColor: `${ROOT}ice_basecolor.jpg`, normal: `${ROOT}ice_normal.png` }, tile: 36, normal: 0.9, tint: [0.78, 0.82, 0.86], metal: 0 }),
  cooked: Object.freeze({ files: null, alias: 'silicate', tile: 34, normal: 1.1, tint: [0.78, 0.62, 0.52], metal: 0 }),
});

const SUBSTANCE_FAMILY = Object.freeze({
  silicate: 'silicate', slag: 'slag', metallic_ore: 'metal', reef_metal: 'metal',
  crystal: 'crystal', ice: 'ice', cooked_rock: 'cooked',
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
vTpPos = position * length(vec3(modelMatrix[0].x, modelMatrix[0].y, modelMatrix[0].z));
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
uniform vec3 sfTpTint;
uniform mat3 normalMatrix;
`;
// Sharp normal blend; the dominant axis wins and the two seams are narrow. Samples whose weight is
// negligible are skipped (uniform-coherent per fragment neighbourhood, so the cost is two projections on average).
const FRAGMENT_COLOR = `
vec3 sfTpWeights = vec3(1.0, 0.0, 0.0);
vec3 sfTpObjN = normalize(vTpNrm);
vec3 sfTpNormalOut = sfTpObjN;
float sfTpLum = 0.5;
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
  diffuseColor.rgb *= sfTpAlb * sfTpTint;
  // Whiteout blend: reorient each projection's tangent normal to the object normal, then mix.
  sfTpNx.xy *= sfTpNormalScale; sfTpNy.xy *= sfTpNormalScale; sfTpNz.xy *= sfTpNormalScale;
  sfTpNx = vec3(sfTpNx.xy + sfTpObjN.zy, abs(sfTpNx.z) * sfTpObjN.x);
  sfTpNy = vec3(sfTpNy.xy + sfTpObjN.xz, abs(sfTpNy.z) * sfTpObjN.y);
  sfTpNz = vec3(sfTpNz.xy + sfTpObjN.xy, abs(sfTpNz.z) * sfTpObjN.z);
  sfTpNormalOut = normalize(sfTpNx.zyx * sfTpWeights.x + sfTpNy.xzy * sfTpWeights.y + sfTpNz.xyz * sfTpWeights.z);
}
`;
const FRAGMENT_ROUGH = `
if (sfTpOn > 0.5) {
  roughnessFactor = clamp(0.98 - 0.42 * sfTpLum * 2.4, 0.5, 0.96);
}
`;
const FRAGMENT_METAL = `
if (sfTpOn > 0.5) {
  metalnessFactor = max(metalnessFactor, sfTpMetal * smoothstep(0.30, 0.62, sfTpLum));
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
    sfTpTile: { value: 1 / spec.tile }, sfTpNormalScale: { value: spec.normal },
    sfTpMetal: { value: spec.metal }, sfTpTint: { value: tint },
  };
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
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${FRAGMENT_NORMAL}`);
  }
  Object.assign(triplanarRockShader, previousHook);
  material.onBeforeCompile = triplanarRockShader;
  material.customProgramCacheKey = () => `${previousKey}|${ROCK_TRIPLANAR_TOKEN}`;
  material.userData = { ...(material.userData || {}), spacefaceTriplanarRock: family };
  material.needsUpdate = true;
  return true;
}
