import * as THREE from 'three';

/**
 * Folded lancet: three curved fins taper to a point and twist around the flight axis.
 * The silhouette is geometry, so a projectile remains a sharp energy object at oblique views.
 *
 * @param {number} planes Number of radial intersecting planes (default 3 = 60-degree star cross-section)
 * @returns {THREE.BufferGeometry}
 */
export function createSpindleGeometry(planes = 3) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let p = 0; p < planes; p++) {
    const base = positions.length / 3;
    const stations = [[0, 0.03], [0.20, 0.24], [0.55, 0.48], [0.78, 0.40], [1, 0.0]];
    for (let s = 0; s < stations.length; s++) {
      const [t, width] = stations[s];
      const angle = p * Math.PI / planes + (t - 0.5) * 0.7;
      const cy = Math.cos(angle), cz = Math.sin(angle);
      for (let k = 0; k < 3; k++) {
        const side = k - 1;
        const fold = (1 - side * side) * width * 0.24;
        positions.push(t - 0.5, side * width * cy - fold * cz, side * width * cz + fold * cy);
        uvs.push(t, k / 2);
      }
      if (s < stations.length - 1) for (let k = 0; k < 2; k++) {
        const a = base + s * 3 + k;
        indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.name = 'FoldedEnergyLancet';
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}
