import { PNG } from 'pngjs';

const SHIP_PROFILES = Object.freeze({
  dart: Object.freeze({
    seed: 0x3a61,
    hull: [60, 66, 70],
    red: [132, 43, 32],
    repair: [98, 99, 94],
    patchThreshold: 12,
    marking: [157, 49, 34],
  }),
  lode: Object.freeze({
    seed: 0x70de,
    hull: [65, 62, 58],
    red: [118, 42, 33],
    repair: [116, 104, 79],
    patchThreshold: 56,
    marking: [151, 126, 81],
  }),
  rig: Object.freeze({
    seed: 0x91a7,
    hull: [57, 63, 62],
    red: [106, 39, 31],
    repair: [99, 92, 78],
    patchThreshold: 32,
    marking: [133, 111, 73],
  }),
});

const MATERIAL_PROFILES = Object.freeze({
  // Intact hull coating and oxide-red paint are dielectrics. Metallic response appears only at
  // exposed chips or explicitly bare replacement panels.
  hull: Object.freeze({ roughness: 0.58, metallic: 0.08 }),
  red: Object.freeze({ roughness: 0.64, metallic: 0.02 }),
  mechanical: Object.freeze({ color: [34, 39, 43], roughness: 0.52, metallic: 0.82 }),
  threat: Object.freeze({ color: [76, 16, 14], roughness: 0.31, metallic: 0.04 }),
  warm: Object.freeze({ color: [128, 73, 27], roughness: 0.45, metallic: 0.04 }),
  glass: Object.freeze({ color: [23, 43, 50], roughness: 0.2, metallic: 0.04 }),
  heatmetal: Object.freeze({ color: [58, 48, 44], roughness: 0.44, metallic: 0.92 }),
  refractory: Object.freeze({ color: [154, 148, 132], roughness: 0.82, metallic: 0 }),
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function byte(value) {
  return Math.round(clamp(value, 0, 255));
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < String(value).length; index++) {
    hash ^= String(value).charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function hash2d(x, y, seed) {
  let value = Math.imul(x + 0x9e3779b9, 0x85ebca6b)
    ^ Math.imul(y + 0x7f4a7c15, 0xc2b2ae35)
    ^ seed;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function materialRole(materialName) {
  const token = String(materialName || '').toLowerCase();
  if (token.includes('heatmetal')) return 'heatmetal';
  if (token.includes('refractory')) return 'refractory';
  if (token.includes('red') || token.includes('paint')) return 'red';
  if (token.includes('mechanical')) return 'mechanical';
  // The legacy slot name remains part of the runtime contract, but Ashline authors it as
  // hostile sodium-red threat hardware rather than literal cyan.
  if (token.includes('cyan')) return 'threat';
  if (token.includes('warm')) return 'warm';
  if (token.includes('glass')) return 'glass';
  return 'hull';
}

function colorForRole(role, ship) {
  if (role === 'hull') return ship.hull;
  if (role === 'red') return ship.red;
  return MATERIAL_PROFILES[role].color;
}

function encodePng(width, height, data) {
  const png = new PNG({ width, height });
  png.data = data;
  return PNG.sync.write(png, { colorType: 6, inputColorType: 6, inputHasAlpha: true, deflateLevel: 9 });
}

function serviceMark(shipKey, x, y, size, seed) {
  if (shipKey === 'dart') {
    const diagonal = x / size + y / size;
    return Math.abs(diagonal - (0.9 + (seed & 7) * 0.018)) < 0.018 ? 1 : 0;
  }
  if (shipKey === 'rig') {
    const ghost = x / size - y / size * 0.36;
    return Math.abs(ghost - (0.28 + (seed & 3) * 0.025)) < 0.025 ? 0.42 : 0;
  }
  return 0;
}

export function makeAshlineSurfaceMaps({
  shipKey,
  materialName,
  size = 1024,
} = {}) {
  const ship = SHIP_PROFILES[shipKey];
  if (!ship) throw new Error(`unknown Ashline ship key '${shipKey}'`);
  if (!Number.isInteger(size) || size < 32) throw new Error('Ashline texture size must be an integer >= 32');

  const role = materialRole(materialName);
  const material = MATERIAL_PROFILES[role];
  const baseColor = colorForRole(role, ship);
  const seed = (ship.seed ^ hashString(materialName)) >>> 0;
  const panelWidth = Math.max(24, Math.round(size * (0.16 + (seed & 7) * 0.006)));
  const panelHeight = Math.max(24, Math.round(size * (0.18 + ((seed >>> 3) & 7) * 0.006)));
  const pixelCount = size * size;
  const height = new Float32Array(pixelCount);
  const base = Buffer.alloc(pixelCount * 4);
  const orm = Buffer.alloc(pixelCount * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const outputOffset = index * 4;
      const localX = x % panelWidth;
      const localY = y % panelHeight;
      const edgeDistance = Math.min(
        localX,
        panelWidth - 1 - localX,
        localY,
        panelHeight - 1 - localY,
      );
      const seam = clamp((2.4 - edgeDistance) / 2.4, 0, 1);
      const bevel = clamp(1 - Math.abs(edgeDistance - 4.5) / 2.5, 0, 1);
      const cellX = Math.floor(x / panelWidth);
      const cellY = Math.floor(y / panelHeight);
      const acceptsPatch = role === 'hull' || role === 'red';
      const patch = acceptsPatch
        && hash2d(cellX, cellY, seed ^ 0xa511e9b3) * 255 < ship.patchThreshold ? 1 : 0;
      const patchRidge = patch * clamp(1 - Math.abs(edgeDistance - 7) / 2.4, 0, 1);
      const cornerX = Math.min(localX, panelWidth - 1 - localX);
      const cornerY = Math.min(localY, panelHeight - 1 - localY);
      const fastenerDistance = Math.hypot(cornerX - 8, cornerY - 8);
      const fastener = clamp(1 - fastenerDistance / 3.2, 0, 1);
      const scratch = ((x * 7 + y * 3 + seed) % 257) < 1 ? 1 : 0;
      const noise = hash2d(x, y, seed);
      const broadNoise = hash2d(Math.floor(x / 8), Math.floor(y / 8), seed ^ 0x1b873593);
      const chip = acceptsPatch
        && seam > 0.15
        && noise > (shipKey === 'lode' ? 0.68 : 0.78) ? 1 : 0;
      const ceramicSpall = role === 'refractory'
        && seam > 0.08
        && noise > 0.84 ? 1 : 0;
      const sootDirection = shipKey === 'rig'
        ? clamp((x / size - 0.48) * 1.5, 0, 1)
        : shipKey === 'dart'
          ? clamp((x / size - 0.72) * 2.6, 0, 1)
          : clamp((y / size - 0.76) * 2.4, 0, 1);
      const soot = sootDirection * (0.35 + broadNoise * 0.65);
      const marking = serviceMark(shipKey, x, y, size, seed);

      const constructionRelief = role === 'refractory'
        ? 0.18
        : role === 'heatmetal'
          ? 0.48
          : 1;
      height[index] = 0.5 - seam * 0.2 * constructionRelief
        + bevel * 0.035 * constructionRelief
        + patchRidge * 0.12
        + fastener * 0.16 * constructionRelief
        - scratch * 0.045;

      let color = [...baseColor];
      if (acceptsPatch && patch) {
        color = color.map((component, channel) => component * 0.32 + ship.repair[channel] * 0.68);
      }
      if (role === 'hull' && marking > 0) {
        color = color.map((component, channel) =>
          component * (1 - marking * 0.62) + ship.marking[channel] * marking * 0.62);
      }
      const exposed = role === 'red' ? [104, 98, 88] : [112, 106, 96];
      if (chip) color = color.map((component, channel) => component * 0.25 + exposed[channel] * 0.75);
      if (ceramicSpall) {
        const spall = [103, 99, 90];
        color = color.map((component, channel) => component * 0.28 + spall[channel] * 0.72);
      }
      const shade = 0.86 + broadNoise * 0.2 + noise * 0.04 - seam * 0.12 - soot * 0.24;
      base[outputOffset] = byte(color[0] * shade);
      base[outputOffset + 1] = byte(color[1] * shade);
      base[outputOffset + 2] = byte(color[2] * shade);
      base[outputOffset + 3] = 255;

      const roughness = clamp(
        material.roughness + (broadNoise - 0.5) * 0.16 + seam * 0.08
          + patch * 0.07 + soot * 0.18 - chip * 0.06 + ceramicSpall * 0.08,
        0.08,
        0.96,
      );
      const metallic = clamp(
        material.metallic + chip * (0.88 - material.metallic)
          + patch * (0.56 - material.metallic),
        0,
        1,
      );
      const ao = clamp(0.96 - seam * 0.3 - soot * 0.09, 0.42, 1);
      orm[outputOffset] = byte(ao * 255);
      orm[outputOffset + 1] = byte(roughness * 255);
      orm[outputOffset + 2] = byte(metallic * 255);
      orm[outputOffset + 3] = 255;
    }
  }

  const normal = Buffer.alloc(pixelCount * 4);
  const sampleHeight = (x, y) => height[
    clamp(y, 0, size - 1) * size + clamp(x, 0, size - 1)
  ];
  const normalStrength = role === 'refractory'
    ? 1.25
    : role === 'threat' || role === 'warm' || role === 'glass'
      ? 1.5
      : 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = sampleHeight(x - 1, y);
      const right = sampleHeight(x + 1, y);
      const up = sampleHeight(x, y - 1);
      const down = sampleHeight(x, y + 1);
      let nx = -(right - left) * normalStrength;
      let ny = (down - up) * normalStrength;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      const offset = (y * size + x) * 4;
      normal[offset] = byte(128 + nx * 127);
      normal[offset + 1] = byte(128 + ny * 127);
      normal[offset + 2] = byte(128 + nz * 127);
      normal[offset + 3] = 255;
    }
  }

  return {
    baseColor: encodePng(size, size, base),
    normal: encodePng(size, size, normal),
    orm: encodePng(size, size, orm),
    metadata: {
      shipKey,
      materialName,
      role,
      serviceHistory: shipKey === 'dart'
        ? 'stripped-interceptor'
        : shipKey === 'lode'
          ? 'patched-heavy-brawler'
          : 'tether-salvage-raider',
    },
  };
}
