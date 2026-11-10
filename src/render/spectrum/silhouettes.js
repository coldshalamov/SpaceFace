// Flat XZ silhouettes for Spectrum props. The sim does not import this module.
// A renderer extrudes each ring a few world-units on Y. No camera-facing card.

import { SPECTRUM_PROP_KINDS } from '../../data/spectrum/props.js';

export function silhouetteRings() {
  return SPECTRUM_PROP_KINDS.map((kind) => ({
    id: kind.id,
    role: kind.role,
    points: kind.footprint.map(([x, z]) => ({ x, z })),
  }));
}

export function silhouetteBounds(id) {
  const kind = SPECTRUM_PROP_KINDS.find((row) => row.id === id);
  if (!kind) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < kind.footprint.length; i++) {
    const [x, z] = kind.footprint[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return {
    id,
    minX, maxX, minZ, maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    vertices: kind.footprint.length,
  };
}
