// Deterministic macro geology for the five shared common-rock geometry buckets. Texture maps own
// micro-regolith only; strata, joints, accumulation, and sparse inclusions are evaluated in object
// space so they remain physically attached and do not become UV wallpaper.

export const COMMON_ROCK_VARIANTS = Object.freeze([
  Object.freeze({ name: 'slab-strata', strata: 1.15, strataAmp: 0.66, tilt: [0.18, 0.94, 0.12], jointA: [0.92, 0.08, 0.28], jointB: [0.12, 0.22, 0.96], spacing: 0.55, sharp: 6.8, regolith: 0.42, mineral: 0.08, mineralAxis: [0.35, 0.88, 0.15], displace: 0.28, axisScale: [1.06, 0.72, 0.88], breakAxis: [0.72, 0.42, -0.23], breakDepth: 0.15, lobe: 0.035 }),
  Object.freeze({ name: 'shear-fault', strata: 0.72, strataAmp: 0.42, tilt: [0.62, 0.55, 0.42], jointA: [0.15, 0.95, -0.22], jointB: [0.88, -0.12, 0.35], spacing: 0.38, sharp: 8.8, regolith: 0.28, mineral: 0.11, mineralAxis: [0.72, 0.18, 0.55], displace: 0.30, axisScale: [1.05, 0.86, 0.78], breakAxis: [-0.35, 0.61, 0.71], breakDepth: 0.18, lobe: 0.045 }),
  Object.freeze({ name: 'blocky-regolith', strata: 0.95, strataAmp: 0.52, tilt: [-0.25, 0.82, 0.48], jointA: [0.55, 0.42, 0.72], jointB: [-0.68, 0.55, 0.28], spacing: 0.72, sharp: 5.4, regolith: 0.68, mineral: 0.05, mineralAxis: [0.22, 0.45, 0.85], displace: 0.26, axisScale: [0.88, 1.02, 0.84], breakAxis: [0.48, -0.19, 0.86], breakDepth: 0.14, lobe: 0.055 }),
  Object.freeze({ name: 'layered-ledge', strata: 1.55, strataAmp: 0.78, tilt: [0.05, 0.98, -0.08], jointA: [0.98, 0.05, 0.05], jointB: [0.08, 0.12, 0.98], spacing: 0.48, sharp: 7.4, regolith: 0.35, mineral: 0.14, mineralAxis: [0.48, 0.72, 0.22], displace: 0.31, axisScale: [1.08, 0.68, 0.92], breakAxis: [-0.66, 0.29, 0.69], breakDepth: 0.16, lobe: 0.03 }),
  Object.freeze({ name: 'cross-jointed', strata: 0.88, strataAmp: 0.48, tilt: [0.42, 0.68, 0.58], jointA: [0.72, 0.55, -0.35], jointB: [-0.42, 0.78, 0.42], spacing: 0.32, sharp: 9.4, regolith: 0.38, mineral: 0.09, mineralAxis: [0.15, 0.62, 0.75], displace: 0.29, axisScale: [0.86, 1.04, 0.82], breakAxis: [0.81, -0.46, 0.35], breakDepth: 0.17, lobe: 0.05 }),
]);

// These are response identities rather than four tints. The runtime blends them in object space,
// then applies the shared Rock023-derived maps as microstructure. Values are deliberately different
// in several PBR dimensions so a fracture wall cannot become "matrix, but darker" and a ferrite
// inclusion stays mill iron: metallic, not an emissive ore lamp and not a cyan crystal.
export const COMMON_ROCK_MATERIAL_ROLES = Object.freeze({
  // Cut industrial stone: cool-neutral slate/basalt matrix, deep dark fracture walls with strong
  // relief, matte dust regolith, and worn dark mill-iron ferrite (never chrome or muddy clay).
  matrix: Object.freeze({ color: [0.84, 0.85, 0.88], roughness: 0.86, metalness: 0.02, ao: 0.98, normalStrength: 1.05 }),
  fracture: Object.freeze({ color: [0.40, 0.41, 0.44], roughness: 0.95, metalness: 0.01, ao: 0.44, normalStrength: 1.65 }),
  regolith: Object.freeze({ color: [0.68, 0.67, 0.66], roughness: 0.98, metalness: 0.005, ao: 0.80, normalStrength: 0.72 }),
  ferrite: Object.freeze({ color: [0.68, 0.62, 0.56], roughness: 0.38, metalness: 0.62, ao: 0.92, normalStrength: 0.38 }),
});

/** Mineral sheen mixed onto common rock. Worn gunmetal iron in the cut, not a cyan crystal. */
export const COMMON_ROCK_MINERAL_SHEEN = Object.freeze([0.64, 0.60, 0.56]);

// UV transforms live on the five shared geometries, not on the shared material. This keeps a single
// draw-compatible material while ensuring the Rock023 microstructure is attached, deterministic,
// and not stamped with the same whorl orientation on every body.
export const COMMON_ROCK_UV_TRANSFORMS = Object.freeze([
  Object.freeze({ scale: [1.38, 0.62], rotation: 0.02, offset: [0.08, 0.17] }),
  Object.freeze({ scale: [0.74, 1.3], rotation: 0.43, offset: [0.31, 0.06] }),
  Object.freeze({ scale: [1.08, 1.08], rotation: 1.08, offset: [0.13, 0.39] }),
  Object.freeze({ scale: [1.56, 0.56], rotation: -0.28, offset: [0.42, 0.22] }),
  Object.freeze({ scale: [0.86, 1.28], rotation: 0.76, offset: [0.24, 0.48] }),
]);

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const dot = (x, y, z, axis) => x * axis[0] + y * axis[1] + z * axis[2];
const smoothstep = (edge0, edge1, value) => {
  const t = clamp01((value - edge0) / Math.max(1e-9, edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function variantAt(index) {
  const normalized = ((Number(index) || 0) % COMMON_ROCK_VARIANTS.length + COMMON_ROCK_VARIANTS.length)
    % COMMON_ROCK_VARIANTS.length;
  return COMMON_ROCK_VARIANTS[normalized];
}

export function strataField(x, y, z, variantIndex = 0) {
  const variant = variantAt(variantIndex);
  const along = dot(x, y, z, variant.tilt);
  const frequency = variant.strata;
  const layers = 0.55 * Math.sin(along * frequency * 2.1)
    + 0.28 * Math.sin(along * frequency * 4.3 + 0.7)
    + 0.17 * Math.sin((x * 1.1 + z * 0.9) * frequency * 1.4 + along * 0.35);
  return clamp01(0.5 + 0.5 * layers * variant.strataAmp);
}

/** One coherent broken bedding plane, broad enough to survive the gameplay camera.
 *  Its gentle shear is shared by the mesh relief and substance fields; no UV seam or animation.
 */
export function structuralFaultDistance(x, y, z, variantIndex = 0) {
  const variant = variantAt(variantIndex);
  const shear = Math.sin(x * 2.3 + z * 3.1 + variantIndex * 0.7) * 0.045
    + Math.sin(y * 4.2 - z * 1.4) * 0.024;
  return dot(x, y, z, variant.jointA) + shear - Math.sin(variantIndex * 2.7) * 0.10;
}

export function structuralFaultField(x, y, z, variantIndex = 0) {
  return 1 - smoothstep(0.035, 0.17, Math.abs(structuralFaultDistance(x, y, z, variantIndex)));
}

export function fractureField(x, y, z, variantIndex = 0) {
  const variant = variantAt(variantIndex);
  const nearestPlane = (axis, spacing, sharpness) => {
    const plane = dot(x, y, z, axis) / spacing;
    const distance = Math.abs(plane - Math.floor(plane + 0.5));
    return Math.exp(-distance * distance * sharpness * sharpness);
  };
  const primary = nearestPlane(variant.jointA, variant.spacing, variant.sharp);
  const secondary = nearestPlane(variant.jointB, variant.spacing * 1.35, variant.sharp * 0.85);
  // Plane fields are intentionally narrowed after the smooth distance evaluation. Without this
  // threshold almost half the body reads as a crack and "fracture" becomes a blanket material.
  const smallJoints = smoothstep(0.56, 0.96, Math.max(primary, secondary * 0.84));
  return Math.max(smallJoints * 0.72, structuralFaultField(x, y, z, variantIndex));
}

export function sampleGeology(x, y, z, variantIndex = 0) {
  const variant = variantAt(variantIndex);
  const strata = strataField(x, y, z, variantIndex);
  const fracture = fractureField(x, y, z, variantIndex);
  const length = Math.hypot(x, y, z) || 1;
  const lowerSurface = clamp01(0.55 - (y / length) * 0.55);
  const regolith = clamp01(variant.regolith * (0.3 + lowerSurface * 0.7)
    * (0.45 + (1 - fracture) * 0.55));
  const alongMineral = dot(x, y, z, variant.mineralAxis);
  const mx = x - alongMineral * variant.mineralAxis[0];
  const my = y - alongMineral * variant.mineralAxis[1];
  const mz = z - alongMineral * variant.mineralAxis[2];
  const polarInclusion = Math.exp(-(mx * mx + my * my + mz * mz) * 6.5)
    * (0.82 + 0.18 * Math.sin(alongMineral * 5.5 + variantIndex));
  // Exposed altered pockets follow one shoulder of the break. They are sparse,
  // non-emissive and smoother than the matrix, so movement reveals a mineral glint.
  const shoulderDistance = (Math.abs(structuralFaultDistance(x, y, z, variantIndex)) - 0.18) / 0.115;
  const faultInclusion = Math.exp(-shoulderDistance * shoulderDistance)
    * smoothstep(0.05, 0.58, alongMineral) * 0.94;
  const inclusion = Math.max(polarInclusion, faultInclusion);
  const inclusionThreshold = 0.73 - variant.mineral * 1.15;
  const mineral = smoothstep(inclusionThreshold, inclusionThreshold + 0.18, inclusion);
  const height = Math.max(-0.38, Math.min(0.45,
    (strata - 0.5) * variant.strataAmp * 0.42
      - fracture * 0.11 - structuralFaultField(x, y, z, variantIndex) * 0.075
      + regolith * 0.035
      + mineral * 0.045));
  return { strata, fracture, regolith, mineral, height, variantName: variant.name };
}

export function silhouetteRadius(x, y, z, variantIndex = 0) {
  const variant = variantAt(variantIndex);
  const normalizedIndex = ((Number(variantIndex) || 0) % COMMON_ROCK_VARIANTS.length
    + COMMON_ROCK_VARIANTS.length) % COMMON_ROCK_VARIANTS.length;
  const [sx, sy, sz] = variant.axisScale;
  const ellipsoid = 1 / Math.sqrt(
    (x * x) / (sx * sx) + (y * y) / (sy * sy) + (z * z) / (sz * sz),
  );
  const planeRadius = (normal, distance) => {
    const alignment = Math.abs(dot(x, y, z, normal));
    return alignment > 1e-5 ? distance / alignment : Infinity;
  };
  const boxRadius = (px, py, pz, extents) => {
    let radius = Infinity;
    if (Math.abs(px) > 1e-5) radius = Math.min(radius, extents[0] / Math.abs(px));
    if (Math.abs(py) > 1e-5) radius = Math.min(radius, extents[1] / Math.abs(py));
    if (Math.abs(pz) > 1e-5) radius = Math.min(radius, extents[2] / Math.abs(pz));
    return radius;
  };

  let shaped = ellipsoid;
  const halfPlane = (normal, distance) => {
    const alignment = dot(x, y, z, normal);
    return alignment > 1e-5 ? distance / alignment : Infinity;
  };
  if (normalizedIndex === 0) {
    // Flattened stratified slab: broad side mass, clipped top/bottom bedding planes + cleaved flank.
    shaped = Math.min(ellipsoid * 1.06, planeRadius([0, 1, 0], 0.50), halfPlane([0.82, 0.22, 0.53], 0.78), halfPlane([-0.68, 0.34, -0.65], 0.82));
    shaped *= 1 + Math.sign(Math.sin((y + 0.08) * 12.0)) * 0.03;
  } else if (normalizedIndex === 1) {
    // Sheared wedge: box-derived planes in a skewed frame plus two angular cleavage cuts.
    const wedge = boxRadius(x, y + x * 0.46, z - x * 0.16, [1.04, 0.62, 0.74]);
    shaped = Math.min(wedge * 0.90 + ellipsoid * 0.10, halfPlane([-0.74, 0.42, 0.52], 0.76));
    shaped *= 1 - smoothstep(0.14, 0.78, dot(x, y, z, variant.breakAxis)) * 0.24;
  } else if (normalizedIndex === 2) {
    // Chipped quarry block: six coherent planes with diagonal shear bevels so it never reads smooth.
    const block = boxRadius(x, y, z, [0.84, 0.78, 0.92]);
    shaped = Math.min(block * 0.92 + ellipsoid * 0.08, halfPlane([0.62, 0.52, -0.58], 0.75), halfPlane([-0.70, -0.22, 0.68], 0.80));
    shaped *= 1 - smoothstep(0.48, 0.90, dot(x, y, z, variant.breakAxis)) * 0.16;
  } else if (normalizedIndex === 3) {
    // Asymmetric ledged body: a flat cap and crisp stepped quarry-like side terraces.
    const ledgeSide = dot(x, y, z, [0.92, 0.08, 0.28]);
    const terrace = ledgeSide > 0.46 ? 0.76 : ledgeSide > 0.02 ? 0.92 : ledgeSide > -0.42 ? 1.06 : 0.84;
    shaped = Math.min(ellipsoid * terrace, planeRadius([0.05, 0.99, -0.08], 0.54), halfPlane([0.45, 0.35, -0.82], 0.78));
  } else {
    // Cross-jointed crag: an asymmetric angular mass split by both joint families and a shear plane.
    const azimuth = Math.atan2(z, x);
    const lobes = 1 + Math.sin(azimuth * 3 + y * 1.7) * 0.14 * (1 - y * y * 0.50);
    shaped = Math.min(ellipsoid * lobes, halfPlane([0.78, -0.38, 0.49], 0.76), halfPlane([-0.55, 0.58, -0.60], 0.80));
    shaped *= 1 - smoothstep(0.40, 0.88, Math.abs(dot(x, y, z, variant.jointA))) * 0.11;
  }

  const structuralCut = fractureField(x, y, z, normalizedIndex)
    * [0.07, 0.10, 0.065, 0.085, 0.115][normalizedIndex];
  const oppositeChip = smoothstep(0.66, 0.94, -dot(x, y, z, variant.jointB));
  return Math.max(0.52, Math.min(1.1,
    shaped - structuralCut - oppositeChip * variant.breakDepth * 0.26,
  ));
}

// Per-family fractured rock silhouettes (metal, ice, crystal, exotic, gas, optic_mirror).
// Every family builds asymmetric broken geology from planar cleavage cuts, stepped fault terraces,
// and directional elongation rotated per variant so neighbours never match and none reads as a ball.
const FAMILY_ROT_YAW = Object.freeze([0.0, 1.24, 2.51, 3.82, 5.06]);
const FAMILY_ROT_PITCH = Object.freeze([0.12, -0.28, 0.34, -0.18, 0.24]);
const FAMILY_AXES = Object.freeze({
  metal: Object.freeze([[1.18, 0.68, 0.78], [0.92, 0.82, 1.14], [1.16, 0.64, 0.86], [0.84, 0.94, 1.08], [1.12, 0.74, 0.74]]),
  ice: Object.freeze([[1.20, 0.60, 0.80], [0.98, 0.72, 1.16], [1.22, 0.56, 0.74], [0.86, 0.84, 1.12], [1.16, 0.66, 0.82]]),
  crystal: Object.freeze([[1.12, 0.82, 0.80], [0.88, 0.94, 1.12], [1.16, 0.72, 0.82], [0.84, 1.00, 0.90], [1.10, 0.80, 0.84]]),
  exotic: Object.freeze([[1.18, 0.74, 0.72], [0.82, 1.02, 0.86], [1.14, 0.76, 0.90], [0.92, 0.70, 1.16], [1.08, 0.88, 0.76]]),
  gas: Object.freeze([[1.08, 0.78, 0.90], [0.92, 0.90, 0.84], [1.12, 0.72, 0.86], [0.86, 0.94, 0.98], [1.08, 0.80, 0.82]]),
  optic_mirror: Object.freeze([[1.14, 0.70, 0.92], [1.06, 0.74, 0.98], [1.16, 0.68, 0.88], [0.96, 0.78, 1.08], [1.10, 0.72, 0.90]]),
});
const CLEAVE_PLANES = Object.freeze([
  // [nx, ny, nz, dist] — unit normals slicing bold asymmetric fracture planes into the hull
  Object.freeze([0.80, 0.38, 0.46, 0.70]),
  Object.freeze([-0.68, 0.52, 0.51, 0.68]),
  Object.freeze([0.38, -0.48, -0.79, 0.72]),
  Object.freeze([-0.82, -0.26, -0.51, 0.72]),
  Object.freeze([0.14, 0.92, -0.36, 0.64]),
  Object.freeze([-0.24, -0.88, 0.41, 0.66]),
  Object.freeze([0.92, -0.18, -0.34, 0.76]),
  Object.freeze([-0.46, 0.20, -0.86, 0.72]),
]);

export function familySilhouette(x, y, z, family = 'metal', variantIndex = 0) {
  const v = ((Number(variantIndex) || 0) % 5 + 5) % 5;
  const yaw = FAMILY_ROT_YAW[v];
  const pitch = FAMILY_ROT_PITCH[v];
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Rotate query vector into the variant's fractured frame so every neighbour has a distinct posture.
  const rx0 = x * cy + z * sy;
  const rz0 = -x * sy + z * cy;
  const ry = y * cp - rz0 * sp;
  const rz = y * sp + rz0 * cp;
  const rx = rx0;

  const axesTable = FAMILY_AXES[family] || FAMILY_AXES.metal;
  const [sx, syA, sz] = axesTable[v];
  let r = 1 / Math.sqrt((rx * rx) / (sx * sx) + (ry * ry) / (syA * syA) + (rz * rz) / (sz * sz));

  const cut = (nx, ny, nz, dist) => {
    const a = rx * nx + ry * ny + rz * nz;
    return a > 1e-4 ? dist / a : Infinity;
  };
  // Tight smooth-min preserves crisp angular fracture corners without zero-area slivers.
  const smin = (a, b, k) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  };

  if (family === 'optic_mirror') {
    // Sculpted cleaved dark-iron reflector monolith: crisp planar bevel cuts + stepped iron shoulders.
    const k = 0.006;
    r = smin(r, cut(0.86, 0.24, 0.45, 0.72), k);
    r = smin(r, cut(-0.84, 0.28, 0.46, 0.74), k);
    r = smin(r, cut(0.42, 0.22, -0.88, 0.70), k);
    r = smin(r, cut(-0.46, 0.26, -0.85, 0.74), k);
    r = smin(r, cut(0.08, 0.98, 0.16, 0.56), k);
    r = smin(r, cut(-0.10, -0.97, -0.20, 0.58), k);
    r = smin(r, cut(0.22, -0.32, 0.92, 0.74), k);
    r = smin(r, cut(-0.56, 0.64, 0.52, 0.70), k);
    const step = (smoothstep(-0.04, 0.04, rx * 0.72 - rz * 0.68) - 0.5) * 0.07;
    return Math.max(0.54, Math.min(1.06, r + step));
  }

  const k = family === 'ice' ? 0.008 : family === 'metal' || family === 'exotic' ? 0.012 : 0.018;
  const planeCount = family === 'ice' ? 6 : 5;
  for (let p = 0; p < planeCount; p++) {
    const plane = CLEAVE_PLANES[(p + v * 2) % CLEAVE_PLANES.length];
    const jitter = ((p * 7 + v * 13) % 5 - 2) * 0.035;
    const tighten = family === 'ice' ? -0.025 : family === 'exotic' ? -0.015 : 0.0;
    r = smin(r, cut(plane[0], plane[1], plane[2], plane[3] + jitter + tighten), k);
  }

  // Deep stepped fault terrace + cleft grooves (creates unmistakable broken quarry notches in silhouette).
  const faultCoord = rx * 0.68 - rz * 0.62 + ry * 0.39 + (v - 2) * 0.09;
  const faultStep = (smoothstep(-0.05, 0.05, faultCoord) - 0.5) * (family === 'ice' ? 0.18 : 0.14);
  const faultGroove = Math.exp(-faultCoord * faultCoord * 32) * (family === 'gas' ? 0.18 : 0.13);

  const crossCoord = rz * 0.76 + rx * 0.54 - ry * 0.36 - (v - 2) * 0.07;
  const crossStep = (smoothstep(-0.06, 0.06, crossCoord) - 0.5) * 0.09;
  const crossGroove = Math.exp(-crossCoord * crossCoord * 36) * 0.10;

  // Ridged geological crag (sharp rocky edges and chipped ribs, NOT soft sinusoidal blobs).
  const w1 = 1 - Math.abs(Math.sin(rx * 2.8 + rz * 2.3 + v * 1.9));
  const w2 = 1 - Math.abs(Math.cos(ry * 3.4 - rx * 2.6 + rz * 1.7 + v * 1.1));
  const crag = ((w1 * w1 * 0.6 + w2 * w2 * 0.4) - 0.45) * (family === 'gas' ? 0.16 : family === 'ice' ? 0.09 : 0.14);

  // Porous craters on volatile gas rock so it reads as craggy cinder/pumice stone.
  let crater = 0;
  if (family === 'gas') {
    const c1 = Math.max(0, 1 - Math.hypot(rx - 0.52, ry - 0.35, rz + 0.44) * 1.50);
    const c2 = Math.max(0, 1 - Math.hypot(rx + 0.48, ry + 0.28, rz - 0.50) * 1.55);
    const c3 = Math.max(0, 1 - Math.hypot(rx + 0.10, ry - 0.55, rz + 0.55) * 1.65);
    crater = (c1 * c1 + c2 * c2 + c3 * c3) * 0.18;
  }

  return Math.max(0.52, Math.min(1.08, r + faultStep + crossStep - faultGroove - crossGroove + crag - crater));
}

function materialRoleWeights(sample) {
  const ferrite = smoothstep(0.08, 0.78, sample.mineral);
  const fracture = smoothstep(0.2, 0.86, sample.fracture) * (1 - ferrite);
  // Accumulation needs enough area to survive the gameplay camera and mip filtering. It remains
  // gravity/orientation-linked by sample.regolith, but the response can now become a real surface
  // identity on the lower shelves instead of an imperceptible tint mixed under the matrix.
  const regolithGain = sample.variantName === 'blocky-regolith' ? 1.45 : 2.15;
  const regolith = clamp01(sample.regolith * regolithGain) * (1 - fracture) * (1 - ferrite);
  const matrix = Math.max(0.025, 1 - ferrite - fracture - regolith);
  const total = matrix + fracture + regolith + ferrite;
  return {
    matrix: matrix / total,
    fracture: fracture / total,
    regolith: regolith / total,
    ferrite: ferrite / total,
  };
}

function blendRoleProperty(weights, property, channel = null) {
  let value = 0;
  for (const role of Object.keys(COMMON_ROCK_MATERIAL_ROLES)) {
    const response = COMMON_ROCK_MATERIAL_ROLES[role][property];
    value += weights[role] * (channel == null ? response : response[channel]);
  }
  return value;
}

/** Macro/mid-scale material response stored once in shared vertex attributes at geometry build. */
export function surfaceResponse(x, y, z, variantIndex = 0) {
  const sample = sampleGeology(x, y, z, variantIndex);
  const weights = materialRoleWeights(sample);
  const heightTone = Math.max(0.78, Math.min(1.08, 0.93 + sample.height * 0.55));
  return {
    ...sample,
    roleWeights: weights,
    baseColor: [0, 1, 2].map((channel) => (
      blendRoleProperty(weights, 'color', channel) * heightTone
    )),
    ao: blendRoleProperty(weights, 'ao'),
    roughness: blendRoleProperty(weights, 'roughness'),
    metalness: blendRoleProperty(weights, 'metalness'),
    normalStrength: blendRoleProperty(weights, 'normalStrength'),
    roleContrast: Math.max(weights.fracture, weights.regolith, weights.ferrite),
  };
}

export function displacementScalar(x, y, z, variantIndex = 0) {
  return sampleGeology(x, y, z, variantIndex).height * variantAt(variantIndex).displace;
}

export function macroTone(x, y, z, variantIndex = 0) {
  return surfaceResponse(x, y, z, variantIndex).baseColor;
}

export function geologyLatticeHash(variantIndex, samples = 16) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const u = (i + 0.5) / samples;
      const v = (j + 0.5) / samples;
      const theta = Math.PI * 2 * u * 1.6180339887;
      const phi = Math.acos(2 * v - 1);
      const sample = sampleGeology(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
        variantIndex,
      );
      for (const value of [
        sample.strata,
        sample.fracture,
        sample.regolith,
        sample.mineral,
        sample.height,
        silhouetteRadius(
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta),
          variantIndex,
        ),
      ]) {
        const quantized = (Math.floor(value * 1e6) | 0) >>> 0;
        hash ^= quantized & 0xff; hash = Math.imul(hash, 0x01000193);
        hash ^= (quantized >>> 8) & 0xff; hash = Math.imul(hash, 0x01000193);
        hash ^= (quantized >>> 16) & 0xff; hash = Math.imul(hash, 0x01000193);
        hash ^= (quantized >>> 24) & 0xff; hash = Math.imul(hash, 0x01000193);
      }
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
