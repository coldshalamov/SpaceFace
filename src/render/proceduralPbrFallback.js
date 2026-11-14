import * as THREE from 'three';

const SIZE = 128;
const VARIANT_COUNT = 4;

// This is a bounded bridge for legacy GLBs, not a substitute for authored baking. The distinct
// frequency/response ranges keep unlike materials from collapsing into one universal noise skin.
// Manufactured surfaces get broad zones only: fine-grain relief (`grain`, default 0) under the
// top-down camera reads as leather or hammered tin (tools/blender/forge/FORGE.md, look rule 6), so
// only rock keeps it, and hard-surface normal strength is a whisper.
const ROLE_RECIPES = Object.freeze({
  hull:       Object.freeze({ macro: 2, micro: 23, color: 0.035, rough: 0.12, metal: 0.06, normal: 0.06, directional: 0.15, metalMultiplier: 0.78 }),
  accent:     Object.freeze({ macro: 3, micro: 31, color: 0.045, rough: 0.14, metal: 0.05, normal: 0.05, directional: 0.08, metalMultiplier: 0.74 }),
  mechanical: Object.freeze({ macro: 4, micro: 47, color: 0.025, rough: 0.11, metal: 0.08, normal: 0.06, directional: 0.72, metalMultiplier: 0.91 }),
  warning:    Object.freeze({ macro: 3, micro: 29, color: 0.035, rough: 0.16, metal: 0.05, normal: 0.05, directional: 0.20, metalMultiplier: 0.72 }),
  geology:    Object.freeze({ macro: 5, micro: 19, color: 0.095, rough: 0.18, metal: 0.11, normal: 0.46, directional: 0.05, metalMultiplier: 0.68, fracture: 0.58, grain: 1 }),
  radiator:   Object.freeze({ macro: 6, micro: 53, color: 0.025, rough: 0.13, metal: 0.08, normal: 0.06, directional: 0.88, metalMultiplier: 0.94 }),
  docking:    Object.freeze({ macro: 3, micro: 37, color: 0.055, rough: 0.19, metal: 0.09, normal: 0.07, directional: 0.48, metalMultiplier: 0.88 }),
  ceramic:    Object.freeze({ macro: 4, micro: 41, color: 0.035, rough: 0.15, metal: 0.02, normal: 0.04, directional: 0.06, metalMultiplier: 0.35 }),
  service:    Object.freeze({ macro: 2, micro: 27, color: 0.065, rough: 0.18, metal: 0.11, normal: 0.07, directional: 0.36, metalMultiplier: 0.82 }),
  rubber:     Object.freeze({ macro: 6, micro: 61, color: 0.018, rough: 0.08, metal: 0.0, normal: 0.05, directional: 0.10, metalMultiplier: 0.0 }),
  repair:     Object.freeze({ macro: 2, micro: 17, color: 0.055, rough: 0.20, metal: 0.06, normal: 0.08, directional: 0.22, metalMultiplier: 0.58 }),
});

const cache = new Map();
// A material-profile pass is synchronous. Reuse its last partial bundle's field for a sibling
// material, but release the temporary arrays at the end of the turn rather than retaining them.
let recentField = null;
let fieldReleaseScheduled = false;

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

function makeLattice(cellsX, cellsY, seed) {
  const px = Math.max(1, Math.round(cellsX));
  const py = Math.max(1, Math.round(cellsY));
  const values = new Float64Array(px * py);
  for (let y = 0; y < py; y += 1) {
    for (let x = 0; x < px; x += 1) values[y * px + x] = latticeHash(x, y, seed);
  }
  return { px, py, values };
}

// Bundle texels are sampled within [0, 1); the lattice's final edge wraps to its first row/column.
function tileNoise(u, v, lattice) {
  const { px, py, values } = lattice;
  const sx = u * px;
  const sy = v * py;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = x0 + 1 === px ? 0 : x0 + 1;
  const y1 = y0 + 1 === py ? 0 : y0 + 1;
  const tx = smooth(sx - x0);
  const ty = smooth(sy - y0);
  const a = values[y0 * px + x0];
  const b = values[y0 * px + x1];
  const c = values[y1 * px + x0];
  const d = values[y1 * px + x1];
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

function periodicField(u, v, recipe, lattices, out) {
  const macro = tileNoise(u, v, lattices.macro) * 2 - 1;
  const meso = tileNoise(u, v, lattices.meso) * 2 - 1;
  // Manufactured recipes intentionally use no fine grain. Do not evaluate an entire
  // noise field whose contribution to every output channel is multiplied by zero.
  const grain = recipe.grain || 0;
  const micro = grain ? tileNoise(u, v, lattices.micro) * 2 - 1 : 0;
  // Brushed/radiator/docking roles get long irregular grooves rather than a regular sine grating.
  const brushed = tileNoise(u, v, lattices.brushed) * 2 - 1;
  // Geology uses narrow contour ridges from a separate field, producing broken strata/fracture paths.
  let fracture = 0;
  if (recipe.fracture) {
    const fractureNoise = tileNoise(u, v, lattices.fracture);
    const ridge = Math.max(0, 1 - Math.abs(fractureNoise - 0.5) * 9);
    fracture = ridge * ridge;
  }
  const height = macro * 0.38 + meso * 0.30
    + micro * (0.22 - recipe.directional * 0.08) * grain
    + brushed * recipe.directional * 0.18 + fracture * (recipe.fracture || 0);
  out.macro = macro;
  out.meso = meso;
  out.micro = micro;
  out.fracture = fracture;
  out.height = height;
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

function buildBundle(role, variant, requested) {
  const recipe = ROLE_RECIPES[role];
  const seed = hashToken(`${role}:${variant}`);
  const key = `${role}:${variant}`;
  const reusable = recentField?.key === key ? recentField : null;
  const albedo = requested.albedo ? new Uint8Array(SIZE * SIZE * 4) : null;
  const normal = requested.normal ? new Uint8Array(SIZE * SIZE * 4) : null;
  const orm = requested.orm ? new Uint8Array(SIZE * SIZE * 4) : null;
  const heights = reusable?.heights || new Float32Array(SIZE * SIZE);
  // Keep the double precision used by the pixel recipe, without allocating one
  // temporary object per texel each time a role/variant bundle is first built.
  const fields = reusable?.fields || new Float64Array(SIZE * SIZE * 4);
  const field = { macro: 0, meso: 0, micro: 0, fracture: 0, height: 0 };

  if (!reusable) {
    // Each lattice point is sampled many times. Hash it once per bundle instead of four times
    // per field, per pixel; Float64 preserves the original interpolation inputs exactly.
    const lattices = {
      macro: makeLattice(recipe.macro, recipe.macro + 1, seed + 11),
      meso: makeLattice(recipe.macro * 3 + 1, recipe.macro * 2 + 3, seed + 37),
      micro: recipe.grain ? makeLattice(recipe.micro, recipe.micro + 5, seed + 71) : null,
      brushed: makeLattice(Math.max(2, recipe.macro), recipe.micro + 17, seed + 103),
      fracture: recipe.fracture ? makeLattice(recipe.macro + 3, recipe.macro * 2 + 5, seed + 151) : null,
    };
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const index = y * SIZE + x;
        periodicField(x / SIZE, y / SIZE, recipe, lattices, field);
        const offset = index * 4;
        fields[offset] = field.macro;
        fields[offset + 1] = field.meso;
        fields[offset + 2] = field.micro;
        fields[offset + 3] = field.fracture;
        heights[index] = field.height;
      }
    }
  }

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = y * SIZE + x;
      const offset = index * 4;
      const left = heights[y * SIZE + ((x - 1 + SIZE) % SIZE)];
      const right = heights[y * SIZE + ((x + 1) % SIZE)];
      const down = heights[((y - 1 + SIZE) % SIZE) * SIZE + x];
      const up = heights[((y + 1) % SIZE) * SIZE + x];
      if (normal) {
        const gradientScale = recipe.fracture ? 1.8 : (recipe.directional > 0.7 ? 2.6 : 3.0);
        const dx = (right - left) * gradientScale;
        const dy = (up - down) * gradientScale;
        const invLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        normal[offset] = clampByte(128 + (-dx * invLength) * 127);
        normal[offset + 1] = clampByte(128 + (-dy * invLength) * 127);
        normal[offset + 2] = clampByte(invLength * 255);
        normal[offset + 3] = 255;
      }

      if (albedo || orm) {
        const macro = fields[offset];
        const meso = fields[offset + 1];
        const micro = fields[offset + 2];
        const fracture = fields[offset + 3];
        // Cavity AO from local height Laplacian supplies contact shading to color and ORM.
        const laplacian = (left + right + up + down) * 0.25 - heights[index];
        const cavity = Math.max(0, laplacian * (recipe.fracture ? 1.5 : 1.1));
        if (albedo) {
          const cavityDarken = 1.0 - cavity * 0.32;
          const colorValue = (238 + 255 * recipe.color * (macro * 0.58 + meso * 0.30 + micro * 0.06 * (recipe.grain || 0) - fracture * 0.38)) * cavityDarken;
          albedo[offset] = clampByte(colorValue);
          albedo[offset + 1] = clampByte(colorValue);
          albedo[offset + 2] = clampByte(colorValue);
          albedo[offset + 3] = 255;
        }
        if (orm) {
          // glTF packs ambient occlusion, roughness and metalness into red, green and blue.
          const aoFactor = Math.max(0.38, 1.0 - cavity * 1.6);
          const roughness = 0.82 + recipe.rough * (macro * 0.42 + meso * 0.30 + micro * 0.18 * (recipe.grain || 0) + fracture * 0.5);
          const metallic = recipe.metalMultiplier + recipe.metal * (macro * 0.54 - fracture * 0.3);
          orm[offset] = clampByte(aoFactor * 255);
          orm[offset + 1] = clampByte(roughness * 255);
          orm[offset + 2] = clampByte(metallic * 255);
          orm[offset + 3] = 255;
        }
      }
    }
  }

  const prefix = `SF_RuntimePbr_${role}_v${variant}`;
  const bundle = {};
  if (albedo) bundle.albedo = makeTexture(albedo, THREE.SRGBColorSpace, `${prefix}_BaseColor`);
  if (normal) bundle.normal = makeTexture(normal, THREE.NoColorSpace, `${prefix}_Normal`);
  if (orm) bundle.orm = makeTexture(orm, THREE.NoColorSpace, `${prefix}_ORM`);
  return { bundle, fieldData: reusable || { key, heights, fields } };
}

function bundleFor(role, materialName, assetId, missing) {
  const variant = hashToken(`${assetId || 'asset'}:${materialName || role}`) % VARIANT_COUNT;
  const key = `${role}:${variant}`;
  let bundle = cache.get(key);
  const requested = {
    albedo: missing.baseColor && !bundle?.albedo,
    normal: missing.normal && !bundle?.normal,
    orm: (missing.roughness || missing.metalness) && !bundle?.orm,
  };
  if (requested.albedo || requested.normal || requested.orm) {
    const { bundle: generated, fieldData } = buildBundle(role, variant, requested);
    if (bundle) Object.assign(bundle, generated);
    else {
      bundle = generated;
      cache.set(key, bundle);
    }
    if (!bundle.albedo || !bundle.normal || !bundle.orm) {
      recentField = fieldData;
      if (!fieldReleaseScheduled) {
        fieldReleaseScheduled = true;
        queueMicrotask(() => {
          recentField = null;
          fieldReleaseScheduled = false;
        });
      }
    } else if (recentField?.key === key) {
      recentField = null;
    }
  }
  return { bundle, variant };
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

  const { bundle, variant } = bundleFor(role, material.name, assetId, missing);
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
      id: 'runtime-role-surface-v2',
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
  let textures = 0;
  for (const bundle of cache.values()) {
    textures += Number(!!bundle.albedo) + Number(!!bundle.normal) + Number(!!bundle.orm);
  }
  const temporaryFieldBytes = recentField ? recentField.heights.byteLength + recentField.fields.byteLength : 0;
  return Object.freeze({
    bundles: cache.size,
    textures,
    temporaryFieldBytes,
    maxBundles: Object.keys(ROLE_RECIPES).length * VARIANT_COUNT,
    textureSize: SIZE,
  });
}

export function _resetProceduralPbrFallbackForTest() {
  cache.clear();
  recentField = null;
}
