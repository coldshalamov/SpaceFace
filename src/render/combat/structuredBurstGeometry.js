import * as THREE from 'three';

/**
 * Editable surface designs for impulse light. Each patch is a swept, curled sheet, not a
 * camera-facing carrier. UV.x follows the force/expansion; UV.y crosses a folded section.
 * The third coordinate is construction, not a vertex-count embellishment on a flat icon.
 * These meshes are shared by every resident instance in a bucket.
 */
export function createStructuredBurstGeometry(kind = 'glow') {
  if (kind === 'plate') return createStructuralPlateGeometry();
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

/**
 * A structural PLATE: one panel torn off a hull, a slab cleaved off a rock.
 *
 * This is the piece the destruction grammar was missing. A shard is a small irregular lump of
 * matter; a plate is a SHEET — wide, thin, dished, with a stiffening rib down its spine and a
 * ragged tear along one end. When a large body comes apart, plates are what make the break read as
 * structure separating rather than as a bright ball: they are opaque, lit, and they tumble about
 * their own weak axis so the camera repeatedly catches their flat faces and then their edges.
 *
 * Local frame, normalized to a unit box so the instance scale is (length, thickness, width):
 *   x  along the panel      -0.5 .. +0.5   (the torn end is +x)
 *   y  through the panel    about -0.5 .. +0.5 after the pool's thin y-scale
 *   z  across the panel     -0.5 .. +0.5
 *
 * Closed solid: two skins plus a rim, so it is never a two-sided card seen edge-on as nothing.
 * Deterministic: the tear and the surface buckle come from an integer mixer, never Math.random,
 * so the same destruction draws the same panel in every replay.
 */
function plateJitter(i, j, channel) {
  let h = Math.imul(i + 1, 0x27d4eb2f) ^ Math.imul(j + 1, 0x165667b1) ^ Math.imul(channel + 1, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

function createStructuralPlateGeometry() {
  const NX = 6;
  const NZ = 4;
  const positions = [];
  const uvs = [];
  const sections = [];
  const indices = [];
  const topIndex = [];
  const bottomIndex = [];

  for (let i = 0; i <= NX; i++) {
    const u = i / NX;
    topIndex.push([]);
    bottomIndex.push([]);
    for (let j = 0; j <= NZ; j++) {
      const v = j / NZ;
      // The tear runs along the +x end and eats into the last two columns, so the panel reads as
      // something that was ripped out of a bigger surface rather than cut to size.
      const tearDepth = u > 0.68 ? (u - 0.68) / 0.32 : 0;
      const tear = tearDepth * tearDepth * (0.16 + 0.12 * plateJitter(i, j, 0));
      const x = -0.5 + u - tear;
      const z = -0.5 + v + plateJitter(i, j, 1) * 0.012;
      // A shallow dish across the panel plus a spine rib: the rib is why a plate catches a
      // highlight as a line instead of as a flat wash.
      const dish = 0.10 * (1 - 4 * (v - 0.5) * (v - 0.5));
      const rib = 0.16 * Math.exp(-36 * (v - 0.5) * (v - 0.5));
      const buckle = 0.05 * plateJitter(i, j, 2) * u;
      const half = 0.5 * (0.34 + dish + rib) + buckle;
      topIndex[i].push(positions.length / 3);
      positions.push(x, half, z);
      uvs.push(u, v);
      sections.push(u, 1);
      bottomIndex[i].push(positions.length / 3);
      positions.push(x, -half * 0.55, z);
      uvs.push(u, v);
      sections.push(u, -1);
    }
  }

  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const a = topIndex[i][j], b = topIndex[i + 1][j], c = topIndex[i][j + 1], d = topIndex[i + 1][j + 1];
      indices.push(a, c, b, b, c, d);
      const e = bottomIndex[i][j], f = bottomIndex[i + 1][j], g = bottomIndex[i][j + 1], h = bottomIndex[i + 1][j + 1];
      indices.push(e, f, g, g, f, h);
    }
  }
  // Rim: close the slab so it is a solid, not two floating skins.
  for (let i = 0; i < NX; i++) {
    for (const [j, flip] of [[0, false], [NZ, true]]) {
      const t0 = topIndex[i][j], t1 = topIndex[i + 1][j];
      const b0 = bottomIndex[i][j], b1 = bottomIndex[i + 1][j];
      if (flip) indices.push(t0, t1, b0, b0, t1, b1);
      else indices.push(t0, b0, t1, t1, b0, b1);
    }
  }
  for (let j = 0; j < NZ; j++) {
    for (const [i, flip] of [[0, false], [NX, true]]) {
      const t0 = topIndex[i][j], t1 = topIndex[i][j + 1];
      const b0 = bottomIndex[i][j], b1 = bottomIndex[i][j + 1];
      if (flip) indices.push(t0, b0, t1, t1, b0, b1);
      else indices.push(t0, t1, b0, b0, t1, b1);
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
  g.name = 'SF_StructuralPlate';
  g.userData.spacefaceStructuredTransient = 'plate';
  return g;
}
