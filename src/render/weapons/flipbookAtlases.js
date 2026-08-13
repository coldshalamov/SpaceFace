import * as THREE from 'three';
import { ATLAS_ROW } from './recipes.js';

export const FLIPBOOK_TILE = 128;
export const FLIPBOOK_COLS = 8;
export const FLIPBOOK_ROWS = 8;
export const FLIPBOOK_FRAMES = 8;

function hash(n) {
  let x = (n | 0) * 374761393 + 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function burstMask(u, v, frame, row) {
  const t = frame / Math.max(1, FLIPBOOK_FRAMES - 1);
  const envelope = t < 0.38 ? t / 0.38 : Math.max(0, 1 - (t - 0.38) / 0.62);
  const dx = u - 0.5;
  const dy = v - 0.5;
  const r = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const directional = row === ATLAS_ROW.PULSE_MUZZLE || row === ATLAS_ROW.RAIL_MUZZLE
    || row === ATLAS_ROW.PULSE_IMPACT_HULL;
  const slit = directional ? Math.abs(Math.cos(ang)) : 1;
  const lobes = 0.055 * Math.sin(ang * (3 + (row % 4)) + row * 0.7) * envelope;
  const filaments = Math.max(0, 0.045 - Math.abs(r - (0.12 + envelope * 0.32)))
    * (0.35 + 0.65 * Math.abs(Math.sin(ang * (7 + row % 5) + frame)));
  const radius = (0.07 + envelope * (directional ? 0.34 : 0.4)) * (0.55 + 0.45 * slit);
  let d = radius + lobes - r;
  d += filaments;
  if (row === ATLAS_ROW.EMP_MUZZLE) {
    d += 0.05 * Math.max(0, Math.cos(ang * 4.0) * envelope - 0.3);
  }
  if (row === ATLAS_ROW.KINETIC_MUZZLE) {
    d *= 0.75 + 0.5 * hash(frame * 17 + Math.floor(ang * 6));
  }
  return Math.max(0, Math.min(1, d * 16)) * envelope;
}

function rowTint(row) {
  switch (row) {
    case ATLAS_ROW.PULSE_MUZZLE:
    case ATLAS_ROW.PULSE_IMPACT_SHIELD:
    case ATLAS_ROW.PULSE_IMPACT_HULL:
      return [0.22, 0.82, 1.0];
    case ATLAS_ROW.PLASMA_MUZZLE:
      return [1.0, 0.45, 0.18];
    case ATLAS_ROW.KINETIC_MUZZLE:
      return [1.0, 0.86, 0.62];
    case ATLAS_ROW.RAIL_MUZZLE:
      return [0.92, 0.97, 1.0];
    case ATLAS_ROW.EXPLOSIVE_MUZZLE:
      return [1.0, 0.55, 0.22];
    case ATLAS_ROW.EMP_MUZZLE:
      return [0.55, 0.72, 1.0];
    default:
      return [1, 1, 1];
  }
}

let cached = null;

export function getWeaponFlipbookAtlas() {
  if (cached) return cached;
  const size = FLIPBOOK_TILE * FLIPBOOK_COLS;
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < FLIPBOOK_ROWS; row++) {
    const tint = rowTint(row);
    for (let col = 0; col < FLIPBOOK_COLS; col++) {
      const frame = col;
      for (let ty = 0; ty < FLIPBOOK_TILE; ty++) {
        for (let tx = 0; tx < FLIPBOOK_TILE; tx++) {
          const u = (tx + 0.5) / FLIPBOOK_TILE;
          const v = (ty + 0.5) / FLIPBOOK_TILE;
          const mask = burstMask(u, v, frame, row);
          const px = col * FLIPBOOK_TILE + tx;
          const py = row * FLIPBOOK_TILE + ty;
          const i = (py * size + px) * 4;
          const heat = Math.min(1, mask * 1.35);
          data[i] = Math.round(tint[0] * 255 * heat);
          data[i + 1] = Math.round(tint[1] * 255 * heat);
          data[i + 2] = Math.round(tint[2] * 255 * heat);
          data[i + 3] = Math.round(Math.min(1, mask * 1.6) * 255);
        }
      }
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.name = 'SF_WeaponFlipbookAtlas';
  cached = texture;
  return texture;
}

export function flipbookUvRect(row, frame) {
  const safeRow = Math.max(0, Math.min(FLIPBOOK_ROWS - 1, row | 0));
  const safeFrame = Math.max(0, Math.min(FLIPBOOK_FRAMES - 1, frame | 0));
  return {
    u: safeFrame / FLIPBOOK_COLS,
    v: 1 - (safeRow + 1) / FLIPBOOK_ROWS,
    w: 1 / FLIPBOOK_COLS,
    h: 1 / FLIPBOOK_ROWS,
  };
}
