// Deterministic macro geology for the five shared common-rock geometry buckets. Texture maps own
// micro-regolith only; strata, joints, accumulation, and sparse inclusions are evaluated in object
// space so they remain physically attached and do not become UV wallpaper.

export const COMMON_ROCK_VARIANTS = Object.freeze([
  Object.freeze({ name: 'slab-strata', strata: 1.15, strataAmp: 0.62, tilt: [0.18, 0.94, 0.12], jointA: [0.92, 0.08, 0.28], jointB: [0.12, 0.22, 0.96], spacing: 0.55, sharp: 6.2, regolith: 0.42, mineral: 0.08, mineralAxis: [0.35, 0.88, 0.15], displace: 0.24, axisScale: [1.04, 0.76, 0.92], breakAxis: [0.72, 0.42, -0.23], breakDepth: 0.11, lobe: 0.035 }),
  Object.freeze({ name: 'shear-fault', strata: 0.72, strataAmp: 0.38, tilt: [0.62, 0.55, 0.42], jointA: [0.15, 0.95, -0.22], jointB: [0.88, -0.12, 0.35], spacing: 0.38, sharp: 8.5, regolith: 0.28, mineral: 0.11, mineralAxis: [0.72, 0.18, 0.55], displace: 0.26, axisScale: [1.02, 0.89, 0.81], breakAxis: [-0.35, 0.61, 0.71], breakDepth: 0.14, lobe: 0.045 }),
  Object.freeze({ name: 'blocky-regolith', strata: 0.95, strataAmp: 0.48, tilt: [-0.25, 0.82, 0.48], jointA: [0.55, 0.42, 0.72], jointB: [-0.68, 0.55, 0.28], spacing: 0.72, sharp: 4.8, regolith: 0.68, mineral: 0.05, mineralAxis: [0.22, 0.45, 0.85], displace: 0.22, axisScale: [0.91, 1.03, 0.86], breakAxis: [0.48, -0.19, 0.86], breakDepth: 0.09, lobe: 0.055 }),
  Object.freeze({ name: 'layered-ledge', strata: 1.55, strataAmp: 0.74, tilt: [0.05, 0.98, -0.08], jointA: [0.98, 0.05, 0.05], jointB: [0.08, 0.12, 0.98], spacing: 0.48, sharp: 7.1, regolith: 0.35, mineral: 0.14, mineralAxis: [0.48, 0.72, 0.22], displace: 0.28, axisScale: [1.05, 0.72, 0.94], breakAxis: [-0.66, 0.29, 0.69], breakDepth: 0.12, lobe: 0.03 }),
  Object.freeze({ name: 'cross-jointed', strata: 0.88, strataAmp: 0.44, tilt: [0.42, 0.68, 0.58], jointA: [0.72, 0.55, -0.35], jointB: [-0.42, 0.78, 0.42], spacing: 0.32, sharp: 9.2, regolith: 0.38, mineral: 0.09, mineralAxis: [0.15, 0.62, 0.75], displace: 0.25, axisScale: [0.88, 1.04, 0.84], breakAxis: [0.81, -0.46, 0.35], breakDepth: 0.13, lobe: 0.05 }),
]);

// These are response identities rather than four tints. The runtime blends them in object space,
// then applies the shared Rock023-derived maps as microstructure. Values are deliberately different
// in several PBR dimensions so a fracture wall cannot become "matrix, but darker" and a ferrite
// inclusion cannot become an orange emissive ore cue.
export const COMMON_ROCK_MATERIAL_ROLES = Object.freeze({
  matrix: Object.freeze({ color: [1.08, 1.04, 0.96], roughness: 0.78, metalness: 0.025, ao: 0.98, normalStrength: 0.74 }),
  fracture: Object.freeze({ color: [0.48, 0.52, 0.56], roughness: 0.965, metalness: 0.012, ao: 0.58, normalStrength: 1.2 }),
  regolith: Object.freeze({ color: [1.19, 1.1, 0.88], roughness: 0.985, metalness: 0.006, ao: 0.84, normalStrength: 0.5 }),
  ferrite: Object.freeze({ color: [0.72, 0.61, 0.48], roughness: 0.38, metalness: 0.58, ao: 0.9, normalStrength: 0.34 }),
});

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
  return smoothstep(0.56, 0.96, Math.max(primary, secondary * 0.84));
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
  const inclusion = Math.exp(-(mx * mx + my * my + mz * mz) * 6.5)
    * (0.82 + 0.18 * Math.sin(alongMineral * 5.5 + variantIndex));
  const inclusionThreshold = 0.73 - variant.mineral * 1.15;
  const mineral = smoothstep(inclusionThreshold, inclusionThreshold + 0.18, inclusion);
  const height = Math.max(-0.38, Math.min(0.45,
    (strata - 0.5) * variant.strataAmp * 0.42
      - fracture * 0.11
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
  if (normalizedIndex === 0) {
    // Flattened stratified slab: broad side mass, clipped top/bottom bedding planes.
    shaped = Math.min(ellipsoid * 1.04, planeRadius([0, 1, 0], 0.52));
    shaped *= 1 + Math.sign(Math.sin((y + 0.08) * 12.0)) * 0.025;
  } else if (normalizedIndex === 1) {
    // Sheared wedge: box-derived planes in a skewed frame plus one deep breakaway face.
    const wedge = boxRadius(x, y + x * 0.42, z - x * 0.12, [1.02, 0.65, 0.76]);
    shaped = wedge * 0.86 + ellipsoid * 0.14;
    shaped *= 1 - smoothstep(0.18, 0.82, dot(x, y, z, variant.breakAxis)) * 0.2;
  } else if (normalizedIndex === 2) {
    // Chipped block: six coherent planes, chamfered enough to avoid primitive-box reads.
    const block = boxRadius(x, y, z, [0.84, 0.8, 0.9]);
    shaped = block * 0.88 + ellipsoid * 0.12;
    shaped *= 1 - smoothstep(0.55, 0.92, dot(x, y, z, variant.breakAxis)) * 0.12;
  } else if (normalizedIndex === 3) {
    // Asymmetric ledged body: a flat cap and stepped quarry-like side terraces.
    const ledgeSide = dot(x, y, z, [0.92, 0.08, 0.28]);
    const terrace = ledgeSide > 0.46 ? 0.8 : ledgeSide > 0.02 ? 0.92 : ledgeSide > -0.42 ? 1.04 : 0.88;
    shaped = Math.min(ellipsoid * terrace, planeRadius([0.05, 0.99, -0.08], 0.56));
  } else {
    // Cross-jointed/lobed body: an asymmetric clover mass cut by both joint families.
    const azimuth = Math.atan2(z, x);
    const lobes = 1 + Math.sin(azimuth * 3 + y * 1.7) * 0.11 * (1 - y * y * 0.55);
    shaped = ellipsoid * lobes;
    shaped *= 1 - smoothstep(0.45, 0.9, Math.abs(dot(x, y, z, variant.jointA))) * 0.08;
  }

  const structuralCut = fractureField(x, y, z, normalizedIndex)
    * [0.055, 0.085, 0.05, 0.07, 0.1][normalizedIndex];
  const oppositeChip = smoothstep(0.7, 0.96, -dot(x, y, z, variant.jointB));
  return Math.max(0.52, Math.min(1.1,
    shaped - structuralCut - oppositeChip * variant.breakDepth * 0.24,
  ));
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
