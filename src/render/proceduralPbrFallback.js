import * as THREE from 'three';

const SIZE = 128;
const VARIANT_COUNT = 4;

// This is a bounded bridge for legacy GLBs, not a substitute for authored baking. The distinct
// frequency/response ranges keep unlike materials from collapsing into one universal noise skin.
const ROLE_RECIPES = Object.freeze({
  hull:       Object.freeze({ macro: 2, micro: 23, color: 0.035, rough: 0.12, metal: 0.06, normal: 0.24, directional: 0.15, metalMultiplier: 0.78 }),
  accent:     Object.freeze({ macro: 3, micro: 31, color: 0.045, rough: 0.14, metal: 0.05, normal: 0.20, directional: 0.08, metalMultiplier: 0.74 }),
  mechanical: Object.freeze({ macro: 4, micro: 47, color: 0.025, rough: 0.11, metal: 0.08, normal: 0.17, directional: 0.72, metalMultiplier: 0.91 }),
  warning:    Object.freeze({ macro: 3, micro: 29, color: 0.035, rough: 0.16, metal: 0.05, normal: 0.22, directional: 0.20, metalMultiplier: 0.72 }),
  geology:    Object.freeze({ macro: 5, micro: 19, color: 0.095, rough: 0.18, metal: 0.11, normal: 0.46, directional: 0.05, metalMultiplier: 0.68, fracture: 0.58 }),
  radiator:   Object.freeze({ macro: 6, micro: 53, color: 0.025, rough: 0.13, metal: 0.08, normal: 0.13, directional: 0.88, metalMultiplier: 0.94 }),
  docking:    Object.freeze({ macro: 3, micro: 37, color: 0.055, rough: 0.19, metal: 0.09, normal: 0.28, directional: 0.48, metalMultiplier: 0.88 }),
  ceramic:    Object.freeze({ macro: 4, micro: 41, color: 0.035, rough: 0.15, metal: 0.02, normal: 0.16, directional: 0.06, metalMultiplier: 0.35 }),
  service:    Object.freeze({ macro: 2, micro: 27, color: 0.065, rough: 0.18, metal: 0.11, normal: 0.25, directional: 0.36, metalMultiplier: 0.82 }),
  rubber:     Object.freeze({ macro: 6, micro: 61, color: 0.018, rough: 0.08, metal: 0.0, normal: 0.12, directional: 0.10, metalMultiplier: 0.0 }),
  repair:     Object.freeze({ macro: 2, micro: 17, color: 0.055, rough: 0.20, metal: 0.06, normal: 0.30, directional: 0.22, metalMultiplier: 0.58 }),
});

const cache = new Map();

function hashToken(token) {
  let hash = 2166136261;
  const text = String(token || 'surface');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function smooth(value) {
  return value * value * (3 - 2 * value);
}

function latticeHash(x, y, seed) {
  let value = Math.imul(x ^ seed, 0x27d4eb2d) ^ Math.imul(y + seed, 0x165667b1);
  value ^= value >>> 15;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return (value >>> 0) / 0xffffffff;
}

function wrap(value, period) {
  const remainder = value % period;
  return remainder < 0 ? remainder + period : remainder;
}

function tileNoise(u, v, cellsX, cellsY, seed) {
  const px = Math.max(1, Math.round(cellsX));
  const py = Math.max(1, Math.round(cellsY));
  const sx = u * px;
  const sy = v * py;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = smooth(sx - x0);
  const ty = smooth(sy - y0);
  const a = latticeHash(wrap(x0, px), wrap(y0, py), seed);
  const b = latticeHash(wrap(x0 + 1, px), wrap(y0, py), seed);
  const c = latticeHash(wrap(x0, px), wrap(y0 + 1, py), seed);
  const d = latticeHash(wrap(x0 + 1, px), wrap(y0 + 1, py), seed);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function periodicField(u, v, recipe, seed) {
  const macro = tileNoise(u, v, recipe.macro, recipe.macro + 1, seed + 11) * 2 - 1;
  const meso = tileNoise(u, v, recipe.macro * 3 + 1, recipe.macro * 2 + 3, seed + 37) * 2 - 1;
  const micro = tileNoise(u, v, recipe.micro, recipe.micro + 5, seed + 71) * 2 - 1;
  // Brushed/radiator/docking roles get long irregular grooves rather than a regular sine grating.
  const brushed = tileNoise(u, v, Math.max(2, recipe.macro), recipe.micro + 17, seed + 103) * 2 - 1;
  // Geology uses narrow contour ridges from a separate field, producing broken strata/fracture paths.
  const fractureNoise = tileNoise(u, v, recipe.macro + 3, recipe.macro * 2 + 5, seed + 151);
  const ridge = Math.max(0, 1 - Math.abs(fractureNoise - 0.5) * 9);
  const fracture = recipe.fracture ? ridge * ridge : 0;
  const height = macro * 0.38 + meso * 0.30
    + micro * (0.22 - recipe.directional * 0.08)
    + brushed * recipe.directional * 0.18 + fracture * (recipe.fracture || 0);
  return { macro, meso, micro, brushed, fracture, height };
}

function makeTexture(data, colorSpace, name) {
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = name;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  // Bundles are shared by bounded role/variant buckets across resident blueprints.
  texture.dispose = () => {};
  return texture;
}

function buildBundle(role, variant) {
  const recipe = ROLE_RECIPES[role];
  const seed = hashToken(`${role}:${variant}`);
  const albedo = new Uint8Array(SIZE * SIZE * 4);
  const normal = new Uint8Array(SIZE * SIZE * 4);
  const orm = new Uint8Array(SIZE * SIZE * 4);
  const heights = new Float32Array(SIZE * SIZE);
  const fields = new Array(SIZE * SIZE);

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = y * SIZE + x;
      const field = periodicField(x / SIZE, y / SIZE, recipe, seed);
      fields[index] = field;
      heights[index] = field.height;
    }
  }

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = y * SIZE + x;
      const offset = index * 4;
      const field = fields[index];
      const left = heights[y * SIZE + ((x - 1 + SIZE) % SIZE)];
      const right = heights[y * SIZE + ((x + 1) % SIZE)];
      const down = heights[((y - 1 + SIZE) % SIZE) * SIZE + x];
      const up = heights[((y + 1) % SIZE) * SIZE + x];
      const gradientScale = recipe.fracture ? 1.8 : (recipe.directional > 0.7 ? 2.6 : 3.0);
      const dx = (right - left) * gradientScale;
      const dy = (up - down) * gradientScale;
      const invLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);

      const colorValue = 238 + 255 * recipe.color * (field.macro * 0.58 + field.meso * 0.30 + field.micro * 0.06 - field.fracture * 0.38);
      albedo[offset] = clampByte(colorValue);
      albedo[offset + 1] = clampByte(colorValue);
      albedo[offset + 2] = clampByte(colorValue);
      albedo[offset + 3] = 255;

      normal[offset] = clampByte(128 + (-dx * invLength) * 127);
      normal[offset + 1] = clampByte(128 + (-dy * invLength) * 127);
      normal[offset + 2] = clampByte(invLength * 255);
      normal[offset + 3] = 255;

      // glTF/Three multiplies these map channels by the material's authored scalar factor.
      // Keep the maps near unity so the role factor stays authoritative while gaining variation.
      const roughness = 0.82 + recipe.rough * (field.macro * 0.42 + field.meso * 0.30 + field.micro * 0.18 + field.fracture * 0.5);
      const metallic = recipe.metalMultiplier + recipe.metal * (field.macro * 0.54 - field.fracture * 0.3);
      orm[offset] = 255;
      orm[offset + 1] = clampByte(roughness * 255);
      orm[offset + 2] = clampByte(metallic * 255);
      orm[offset + 3] = 255;
    }
  }

  const prefix = `SF_RuntimePbr_${role}_v${variant}`;
  return Object.freeze({
    albedo: makeTexture(albedo, THREE.SRGBColorSpace, `${prefix}_BaseColor`),
    normal: makeTexture(normal, THREE.NoColorSpace, `${prefix}_Normal`),
    orm: makeTexture(orm, THREE.NoColorSpace, `${prefix}_ORM`),
  });
}

function bundleFor(role, materialName, assetId) {
  const variant = hashToken(`${assetId || 'asset'}:${materialName || role}`) % VARIANT_COUNT;
  const key = `${role}:${variant}`;
  if (!cache.has(key)) cache.set(key, buildBundle(role, variant));
  return { bundle: cache.get(key), variant };
}

export function supportsProceduralPbrFallback(role) {
  return Object.prototype.hasOwnProperty.call(ROLE_RECIPES, role);
}

export function applyProceduralPbrFallback(material, role, { assetId = null, allowTextures = true } = {}) {
  if (!allowTextures || !supportsProceduralPbrFallback(role) || !material) return false;
  const missing = {
    baseColor: !material.map,
    normal: !(material.normalMap || material.bumpMap),
    roughness: !material.roughnessMap,
    metalness: !material.metalnessMap,
  };
  if (!Object.values(missing).some(Boolean)) return false;

  const { bundle, variant } = bundleFor(role, material.name, assetId);
  if (missing.baseColor) material.map = bundle.albedo;
  if (missing.normal) {
    material.normalMap = bundle.normal;
    const strength = ROLE_RECIPES[role].normal;
    material.normalScale = new THREE.Vector2(strength, strength);
  }
  if (missing.roughness) material.roughnessMap = bundle.orm;
  if (missing.metalness) material.metalnessMap = bundle.orm;
  material.userData = {
    ...(material.userData || {}),
    spacefaceProceduralPbrFallback: Object.freeze({
      id: 'runtime-role-surface-v1',
      role,
      variant,
      textureSize: SIZE,
      supplied: Object.freeze({ ...missing }),
      sourceRemasterStillRequired: true,
    }),
  };
  material.needsUpdate = true;
  return true;
}

export function proceduralPbrFallbackDiagnostics() {
  return Object.freeze({ bundles: cache.size, maxBundles: Object.keys(ROLE_RECIPES).length * VARIANT_COUNT, textureSize: SIZE });
}

export function _resetProceduralPbrFallbackForTest() {
  cache.clear();
}
