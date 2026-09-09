import * as THREE from 'three';

/**
 * Editable surface designs for impulse light. Each patch is a swept, curled sheet, not a
 * camera-facing carrier. UV.x follows the force/expansion; UV.y crosses a folded section.
 * The third coordinate is construction, not a vertex-count embellishment on a flat icon.
 * These meshes are shared by every resident instance in a bucket.
 */
export function createStructuredBurstGeometry(kind = 'glow') {
  if (!['glow', 'ring', 'blade', 'arc'].includes(kind)) {
    throw new RangeError(`Unknown structured burst: ${kind}`);
  }
  const positions = [], uvs = [], sections = [], indices = [];
  function sheet(rows, columns, phase, evaluate) {
    const base = positions.length / 3;
    for (let i = 0; i <= rows; i++) {
      const u = i / rows;
      for (let j = 0; j <= columns; j++) {
        const v = j / columns;
        positions.push(...evaluate(u, v * 2 - 1));
        uvs.push(u, v);
        sections.push(phase, Math.sin(Math.PI * u));
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < columns; j++) {
        const a = base + i * (columns + 1) + j, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  if (kind === 'glow' || kind === 'blade') {
    const count = kind === 'glow' ? 9 : 3;
    for (let k = 0; k < count; k++) {
      const theta = kind === 'glow' ? [0,.47,-.60,1.34,-1.28,2.16,-2.48,2.84,-.16][k] : (k - 1) * 0.37;
      const length = kind === 'glow' ? [0.54,0.41,0.47,0.31,0.36,0.25,0.22,0.18,0.38][k] : [0.78, 1, 0.69][k];
      const width = kind === 'glow' ? [.12,.070,.087,.066,.074,.054,.045,.063,.070][k] : [0.25, 0.38, 0.22][k];
      sheet(10, 6, k * 0.61803399 % 1, (u, v) => {
        const taper = kind === 'glow'
          ? Math.pow(1-u,1.15)*(0.54+0.46*Math.sin(u*Math.PI))
          : Math.pow(Math.sin(Math.PI * Math.min(0.999, u) * 0.94), 0.65) * (1 - 0.76 * u);
        const sweep = theta + (k % 2 ? -1 : 1) * (kind === 'glow' ? .12 : .48) * u * u;
        const along = kind === 'glow' ? 0.003 + length * u : -0.5 + length * u;
        const cross = width * taper * v;
        const curl = width * taper * (0.8 * v * v - 0.26) + 0.075 * Math.sin(u * Math.PI * 1.4 + k) * u;
        return [along * Math.cos(sweep) - cross * Math.sin(sweep), curl,
          along * Math.sin(sweep) + cross * Math.cos(sweep)];
      });
    }
  } else {
    const count = kind === 'ring' ? 3 : 1;
    const sweeps = kind === 'ring' ? [2.48, 1.91, 1.22] : [1.44];
    const starts = kind === 'ring' ? [-0.24, 2.56, 4.69] : [-0.72];
    const radius = kind === 'ring' ? 0.48 : 1;
    for (let k = 0; k < count; k++) {
      sheet(18, 6, 0.17 + k * 0.29, (u, v) => {
        const a = starts[k] + u * sweeps[k];
        const taper = Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.6);
        const corrugation = 1 + 0.042 * Math.sin(u * Math.PI * 4 + k * 1.3);
        const width = (kind === 'ring' ? 0.105 : 0.095) * taper;
        const r = radius * corrugation + v * width;
        const y = width * (1.6 * v * v - 0.48) + 0.035 * Math.sin(a * 2.1) * taper;
        return [Math.cos(a) * r, y, Math.sin(a) * r];
      });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aSurfaceSection', new THREE.Float32BufferAttribute(sections, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.name = `SF_SweptImpulse_${kind}`;
  g.userData.spacefaceStructuredTransient = kind;
  return g;
}
