// Sculpted organic folded-volume geometries for open-water fauna (batch 2).
// Pure deterministic BufferGeometry builders: closed folded manifolds, smooth seam-welded
// normals, continuous [0..1] UVs, and bounded triangle budgets. No runtime state or randomness.
import * as THREE from 'three';

function normVec(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function crossVec(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function catmullRomStation(points, v, clampRadii = true) {
  const n = points.length;
  if (n === 2) return points[0].map((val, k) => val + (points[1][k] - val) * v);
  const scaled = Math.max(0, Math.min(n - 1, v * (n - 1)));
  const k = Math.min(n - 2, Math.floor(scaled));
  const t = scaled - k;
  const p0 = points[Math.max(0, k - 1)];
  const p1 = points[k];
  const p2 = points[k + 1];
  const p3 = points[Math.min(n - 1, k + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  const out = new Array(p1.length);
  for (let c = 0; c < p1.length; c++) {
    out[c] = 0.5 * (
      2 * p1[c]
      + (-p0[c] + p2[c]) * t
      + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2
      + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3
    );
  }
  if (clampRadii) {
    out[3] = Math.max(0.01, out[3]);
    out[4] = Math.max(0.01, out[4]);
  }
  return out;
}

/** Smooth coincident vertex normals across UV wrap seams and closed caps without flattening creases. */
export function finalizeOrganicGeometry(geometry, name) {
  geometry.computeVertexNormals();
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let g = groups.get(key);
    if (!g) {
      g = { ids: [], sx: 0, sy: 0, sz: 0 };
      groups.set(key, g);
    }
    g.ids.push(i);
    g.sx += norm.getX(i);
    g.sy += norm.getY(i);
    g.sz += norm.getZ(i);
  }
  for (const g of groups.values()) {
    const len = Math.hypot(g.sx, g.sy, g.sz) || 1;
    const nx = g.sx / len;
    const ny = g.sy / len;
    const nz = g.sz / len;
    for (const id of g.ids) norm.setXYZ(id, nx, ny, nz);
  }
  norm.needsUpdate = true;
  if (name) geometry.name = name;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeBufferGeometry(positions, uvs, indices, name) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return finalizeOrganicGeometry(g, name);
}

/** Merge multiple indexed BufferGeometries into one draw-call-efficient geometry. */
export function mergeGeometries(geos, name) {
  const positions = [];
  const uvs = [];
  const indices = [];
  let offset = 0;
  for (const g of geos) {
    const p = g.attributes.position;
    const u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      uvs.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) indices.push(g.index.getX(i) + offset);
    } else {
      for (let i = 0; i < p.count; i++) indices.push(offset + i);
    }
    offset += p.count;
  }
  return makeBufferGeometry(positions, uvs, indices, name);
}

/** Closed, creased organic lobe swept along a 3D Catmull-Rom spine ([x, y, z, rx, ry]). */
export function createFoldedLobe(points, opts = {}) {
  const {
    name = 'FoldedLobe',
    folds = 5,
    depth = 0.14,
    twist = 0,
    rings = 16,
    sides = 12,
    startCap = 0.45,
    endCap = 0.45,
    dorsal = 1.0,
    ventral = 1.0,
    refUp = null,
  } = opts;
  const spine = [];
  for (let i = 0; i <= rings; i++) {
    const latitude = Math.PI * (0.08 + 0.84 * (i / rings));
    const v = 0.5 - 0.5 * Math.cos(latitude);
    spine.push({ latitude, v, station: catmullRomStation(points, v, true) });
  }
  const positions = [];
  const uvs = [];
  const indices = [];
  let prevN = null;
  let prevB = null;
  let firstT = null;
  let lastT = null;

  for (let i = 0; i <= rings; i++) {
    const { latitude, v, station } = spine[i];
    const pPrev = spine[Math.max(0, i - 1)].station;
    const pNext = spine[Math.min(rings, i + 1)].station;
    const tangent = normVec([pNext[0] - pPrev[0], pNext[1] - pPrev[1], pNext[2] - pPrev[2]]);
    if (i === 0) firstT = tangent;
    if (i === rings) lastT = tangent;

    let normal;
    if (!prevN) {
      const ref = refUp || (Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]);
      normal = normVec(crossVec(ref, tangent));
    } else {
      const dot = prevN[0] * tangent[0] + prevN[1] * tangent[1] + prevN[2] * tangent[2];
      const ortho = [prevN[0] - dot * tangent[0], prevN[1] - dot * tangent[1], prevN[2] - dot * tangent[2]];
      normal = Math.hypot(ortho[0], ortho[1], ortho[2]) > 1e-5
        ? normVec(ortho)
        : normVec(crossVec(prevB, tangent));
    }
    const binormal = normVec(crossVec(tangent, normal));
    prevN = normal;
    prevB = binormal;

    const cap = Math.min(1, Math.sin(latitude) / 0.52);
    const vCoord = 0.05 + 0.90 * (i / rings);
    for (let j = 0; j <= sides; j++) {
      const uCoord = j / sides;
      const angle = uCoord * Math.PI * 2;
      const ripple = 1 + depth * Math.cos(folds * angle + twist * v + 0.7 * Math.cos(latitude)) * Math.sin(latitude);
      const asym = Math.sin(angle) >= 0 ? dorsal : ventral;
      const rc = Math.cos(angle) * station[3] * cap * ripple;
      const rs = Math.sin(angle) * station[4] * cap * ripple * asym;
      positions.push(
        station[0] + normal[0] * rc + binormal[0] * rs,
        station[1] + normal[1] * rc + binormal[1] * rs,
        station[2] + normal[2] * rc + binormal[2] * rs,
      );
      uvs.push(uCoord, vCoord);
    }
  }

  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j;
      const b = a + sides + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  const s0 = spine[0].station;
  const sN = spine[rings].station;
  const r0 = Math.min(s0[3], s0[4]) * startCap;
  const rN = Math.min(sN[3], sN[4]) * endCap;
  const startCapRing = positions.length / 3;
  for (let j = 0; j <= sides; j++) {
    positions.push(s0[0] - firstT[0] * r0, s0[1] - firstT[1] * r0, s0[2] - firstT[2] * r0);
    uvs.push(j / sides, 0);
  }
  const endCapRing = positions.length / 3;
  for (let j = 0; j <= sides; j++) {
    positions.push(sN[0] + lastT[0] * rN, sN[1] + lastT[1] * rN, sN[2] + lastT[2] * rN);
    uvs.push(j / sides, 1);
  }
  const lastRing = rings * (sides + 1);
  for (let j = 0; j < sides; j++) {
    indices.push(startCapRing + j, j + 1, j);
    indices.push(endCapRing + j, lastRing + j, lastRing + j + 1);
  }
  return makeBufferGeometry(positions, uvs, indices, name);
}

/** Closed asymmetric folded organic sac (no polar UV collapse). */
export function createFoldedSac(rx, ry, rz, opts = {}) {
  const {
    name = 'FoldedSac',
    folds = 5,
    depth = 0.14,
    rings = 10,
    sides = 14,
    asymFn = null,
  } = opts;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= rings; i++) {
    const v = i / rings;
    const lat = Math.PI * v;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    for (let j = 0; j <= sides; j++) {
      const u = j / sides;
      const phi = u * Math.PI * 2;
      const ripple = 1 + depth * Math.cos(folds * phi + 0.7 * cosLat) * sinLat;
      let px = rx * sinLat * Math.cos(phi) * ripple;
      let py = ry * cosLat;
      let pz = rz * sinLat * Math.sin(phi) * ripple;
      if (asymFn) {
        const out = asymFn(px, py, pz, v, phi);
        if (out) { px = out[0]; py = out[1]; pz = out[2]; }
      }
      positions.push(px, py, pz);
      uvs.push(u, v);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j;
      const b = a + sides + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return makeBufferGeometry(positions, uvs, indices, name);
}

/** Closed thick-walled revolved cupped vessel (inner floor -> wall -> lip -> outer wall -> base). */
export function createThickCuppedVessel(profile, opts = {}) {
  const {
    name = 'ThickCuppedVessel',
    sides = 28,
    modFn = null,
    tiltX = 0,
  } = opts;
  const m = profile.length - 1;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= m; i++) {
    const v = i / m;
    const [rBase, yBase] = profile[i];
    for (let j = 0; j <= sides; j++) {
      const u = j / sides;
      const phi = u * Math.PI * 2;
      let r = rBase;
      let y = yBase;
      if (modFn) {
        const out = modFn(rBase, yBase, phi, v, i);
        if (out) { r = out[0]; y = out[1]; }
      }
      positions.push(r * Math.cos(phi), y, r * Math.sin(phi));
      uvs.push(u, v);
    }
  }
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j;
      const b = a + sides + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  if (tiltX) {
    const c = Math.cos(tiltX);
    const s = Math.sin(tiltX);
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const z = positions[i + 2];
      positions[i + 1] = y * c - z * s;
      positions[i + 2] = y * s + z * c;
    }
  }
  return makeBufferGeometry(positions, uvs, indices, name);
}

/** Tapered double-sided undulating fin/membrane strip swept along a 3D spine ([x,y,z,nx,ny,nz]). */
export function createFinStrip(spinePts, spans = 4, rings = 24, name = 'FinStrip') {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= rings; i++) {
    const v = i / rings;
    const st = catmullRomStation(spinePts, v, false);
    for (let j = 0; j <= spans; j++) {
      const s = j / spans;
      const wave = Math.sin(v * Math.PI * 6) * s * s * 0.25;
      positions.push(
        st[0] + st[3] * s,
        st[1] + st[4] * s + wave,
        st[2] + st[5] * s,
      );
      uvs.push(s, v);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < spans; j++) {
      const a = i * (spans + 1) + j;
      const b = a + spans + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return makeBufferGeometry(positions, uvs, indices, name);
}

// ── 1. Pilgrim Spine (radius: 16, forward +Z, bounds ~23 x 5.8 x 16.5) ───────────────────────

export function createPilgrimVertebraGeometry() {
  const centrum = createFoldedLobe([
    [0, -0.2, -3.8, 1.32, 1.10],
    [0, 0.35, -1.3, 2.45, 1.48],
    [0, 0.45, 1.6, 2.55, 1.55],
    [0, 0.0, 4.7, 1.60, 1.05],
    [0, -0.3, 6.9, 0.60, 0.46],
  ], { folds: 5, depth: 0.16, rings: 14, sides: 12, dorsal: 1.0, ventral: 0.85 });

  const portWing = createFoldedLobe([
    [-1.4, 0.15, 1.6, 1.50, 0.85],
    [-5.4, 0.3, 0.1, 1.92, 0.78],
    [-9.8, -0.15, -2.7, 1.00, 0.42],
  ], { folds: 4, depth: 0.15, rings: 12, sides: 10 });

  const starboardWing = createFoldedLobe([
    [1.4, 0.15, 1.6, 1.50, 0.85],
    [5.4, 0.3, 0.1, 1.92, 0.78],
    [9.8, -0.15, -2.7, 1.00, 0.42],
  ], { folds: 4, depth: 0.15, rings: 12, sides: 10 });

  const dorsalCrest = createFoldedLobe([
    [0, 1.55, -2.4, 0.68, 0.56],
    [0, 1.95, 0.3, 0.84, 0.66],
    [0, 1.60, 3.0, 0.58, 0.50],
  ], { folds: 3, depth: 0.12, rings: 10, sides: 8 });

  return mergeGeometries([centrum, portWing, starboardWing, dorsalCrest], 'Pilgrim_Vertebra_Body');
}

export function createPilgrimGanglionGeometry() {
  return createFoldedLobe([
    [0, 2.25, -1.9, 0.52, 0.42],
    [0, 2.68, 0.3, 0.76, 0.56],
    [0, 2.30, 2.5, 0.48, 0.38],
  ], { folds: 4, depth: 0.12, rings: 10, sides: 10, name: 'Pilgrim_Route_Ganglion' });
}

export function createPilgrimCordGeometry() {
  return createFoldedLobe([
    [0, 0.0, 0.2, 0.95, 0.85],
    [-0.85, -0.12, -1.0, 0.78, 0.70],
    [0.7, -0.15, -2.05, 0.64, 0.56],
    [-0.28, -0.08, -3.1, 0.36, 0.32],
  ], { folds: 4, depth: 0.15, rings: 12, sides: 10, name: 'Pilgrim_Route_Cord' });
}

// ── 2. Suture Mite (radius: 4, forward +Z, bounds ~11.2 x 3.4 x 7.5) ─────────────────────────

export function createSutureMiteBodyGeometry() {
  const thorax = createFoldedSac(2.3, 1.15, 1.75, {
    folds: 5, depth: 0.12, rings: 10, sides: 14,
    asymFn: (x, y, z) => [x, y + 0.15, z + 0.55],
  });
  const abdomen = createFoldedSac(2.65, 1.35, 2.05, {
    folds: 6, depth: 0.16, rings: 10, sides: 14,
    asymFn: (x, y, z) => [x, y + 0.1 * Math.cos(x), z - 0.95],
  });
  return mergeGeometries([thorax, abdomen], 'SutureMite_Carapace');
}

export function createSutureMiteLegsGeometry() {
  const legs = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const zRoot = 1.1 - k * 1.15;
      const zMid = zRoot + (k === 0 ? 0.55 : k === 2 ? -0.65 : -0.1);
      const zTip = zMid + (k === 0 ? 0.45 : k === 2 ? -0.55 : -0.15);
      legs.push(createFoldedLobe([
        [side * 1.6, 0.0, zRoot, 0.34, 0.28],
        [side * 3.7, 0.35, zMid, 0.28, 0.24],
        [side * 5.4, -0.65, zTip, 0.14, 0.12],
      ], { folds: 3, depth: 0.1, rings: 8, sides: 8 }));
    }
  }
  return mergeGeometries(legs, 'SutureMite_Legs');
}

export function createSutureMiteMandiblesGeometry() {
  const pair = [];
  for (const side of [-1, 1]) {
    pair.push(createFoldedLobe([
      [side * 0.95, -0.05, -0.2, 0.38, 0.32],
      [side * 1.45, 0.12, 0.95, 0.32, 0.26],
      [side * 0.65, 0.05, 1.95, 0.16, 0.14],
    ], { folds: 3, depth: 0.12, rings: 9, sides: 8 }));
  }
  return mergeGeometries(pair, 'SutureMite_Mandibles');
}

export function createSutureMiteSpinneretsGeometry() {
  const pair = [];
  for (const side of [-1, 1]) {
    pair.push(createFoldedLobe([
      [side * 0.75, 0.1, 0.2, 0.44, 0.38],
      [side * 1.35, 0.18, -0.85, 0.34, 0.30],
      [side * 1.75, 0.05, -1.75, 0.16, 0.14],
    ], { folds: 4, depth: 0.14, rings: 8, sides: 8 }));
  }
  return mergeGeometries(pair, 'SutureMite_Spinnerets');
}

export function createSutureMiteEyeGeometry() {
  return createFoldedSac(0.68, 0.48, 0.56, {
    folds: 3, depth: 0.08, rings: 8, sides: 10, name: 'SutureMite_SensoryEye',
  });
}

// ── 3. Stone Lung (radius: 46, bounds ~48 x 14.5 x 33) ──────────────────────────────────────

export function createStoneLungMoundGeometry() {
  const profile = [
    [0.0, -2.9],
    [5.2, -2.5],
    [8.4, 0.5],
    [9.6, 4.6],
    [12.0, 6.0],
    [15.0, 4.1],
    [19.2, 0.4],
    [20.0, -3.4],
    [13.0, -5.2],
    [0.0, -5.5],
  ];
  return createThickCuppedVessel(profile, {
    name: 'StoneLung_RockMantle',
    sides: 30,
    tiltX: -0.22,
    modFn: (r, y, phi, v) => {
      const ridge = 1 + 0.095 * Math.cos(7 * phi + 0.4 * v * Math.PI)
        + 0.06 * Math.sin(3 * phi + 1.1)
        + 0.045 * Math.cos(11 * phi - 0.5);
      const ellip = Math.hypot(1.04 * Math.cos(phi), 0.72 * Math.sin(phi));
      return [r * ridge * ellip, y + 0.68 * Math.sin(5 * phi) * Math.sin(v * Math.PI)];
    },
  });
}

export function createStoneLungThroatGeometry() {
  const profile = [
    [6.4, 0.2],
    [7.0, 3.2],
    [8.6, 5.2],
    [10.2, 4.1],
    [9.1, 1.2],
    [6.4, 0.2],
  ];
  return createThickCuppedVessel(profile, {
    name: 'StoneLung_GillThroat',
    sides: 28,
    tiltX: -0.22,
    modFn: (r, y, phi) => {
      const pleat = 1 + 0.14 * Math.cos(6 * phi);
      const ellip = Math.hypot(1.04 * Math.cos(phi), 0.72 * Math.sin(phi));
      return [r * pleat * ellip, y + 0.58 * Math.cos(6 * phi)];
    },
  });
}

export function createStoneLungCoreGeometry() {
  return createFoldedSac(5.5, 3.8, 4.3, {
    folds: 6, depth: 0.18, rings: 12, sides: 16, name: 'StoneLung_SporeBladder',
  });
}

// ── 4. Spindle Mother (radius: 34, bounds ~32 x 22 x 15) ────────────────────────────────────

export function createSpindleMotherBodyGeometry() {
  return createFoldedLobe([
    [0.0, -10.8, 0.0, 1.4, 1.3],
    [-0.5, -6.2, 0.4, 4.8, 4.4],
    [0.4, -0.5, -0.3, 4.3, 3.9],
    [-0.3, 5.2, 0.3, 3.5, 3.2],
    [0.0, 9.8, 0.0, 1.6, 1.5],
  ], {
    name: 'SpindleMother_Spindle',
    folds: 5,
    depth: 0.18,
    twist: Math.PI * 1.4,
    rings: 20,
    sides: 14,
    startCap: 0.55,
    endCap: 0.6,
    refUp: [1, 0, 0],
  });
}

function spindlePodPositions() {
  const pods = [];
  for (let ring = 0; ring < 3; ring++) {
    const y = -5.5 + ring * 5.0;
    const r = 4.6 - ring * 0.65;
    const count = 5;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ring * 0.65;
      pods.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r, a, scale: 1.0 - ring * 0.1 });
    }
  }
  return pods;
}

export function createSpindleMotherCalyxesGeometry() {
  const calyxes = [];
  for (const p of spindlePodPositions()) {
    calyxes.push(createFoldedLobe([
      [p.x * 0.72, p.y - 0.6, p.z * 0.72, 1.25 * p.scale, 1.15 * p.scale],
      [p.x * 0.96, p.y - 0.1, p.z * 0.96, 1.45 * p.scale, 1.3 * p.scale],
    ], { folds: 4, depth: 0.16, rings: 5, sides: 6 }));
  }
  return mergeGeometries(calyxes, 'SpindleMother_Calyxes');
}

export function createSpindleMotherSacsGeometry() {
  const sacs = [];
  for (const p of spindlePodPositions()) {
    const nx = Math.cos(p.a);
    const nz = Math.sin(p.a);
    sacs.push(createFoldedLobe([
      [p.x * 0.88, p.y - 0.1, p.z * 0.88, 0.95 * p.scale, 0.9 * p.scale],
      [p.x * 1.16 + nx * 0.8, p.y + 0.35, p.z * 1.16 + nz * 0.8, 1.08 * p.scale, 1.0 * p.scale],
      [p.x * 1.26 + nx * 1.35, p.y + 0.65, p.z * 1.26 + nz * 1.35, 0.55 * p.scale, 0.5 * p.scale],
    ], { folds: 4, depth: 0.1, rings: 5, sides: 6 }));
  }
  return mergeGeometries(sacs, 'SpindleMother_SporeSacs');
}

export function createSpindleMotherCrownGeometry() {
  return createFoldedSac(1.75, 1.85, 1.65, {
    folds: 5, depth: 0.14, rings: 9, sides: 12, name: 'SpindleMother_Crown',
    asymFn: (x, y, z) => [x, y + 9.2, z],
  });
}

export function createSpindleMotherJuvenilesGeometry() {
  const buds = [];
  const anchors = [
    [-14.5, 3.5, 2.2],
    [14.8, 2.2, -2.5],
    [-10.2, -3.5, -5.2],
    [11.0, -2.2, 5.0],
    [2.5, 8.2, -5.8],
  ];
  for (const [ax, ay, az] of anchors) {
    const dirX = Math.sign(ax) || 1;
    buds.push(createFoldedLobe([
      [ax - dirX * 1.2, ay - 0.3, az - 0.5, 0.42, 0.35],
      [ax, ay + 0.15, az, 0.92, 0.72],
      [ax + dirX * 1.3, ay + 0.3, az + 0.5, 0.35, 0.3],
    ], { folds: 4, depth: 0.14, rings: 8, sides: 8 }));
  }
  return mergeGeometries(buds, 'SpindleMother_Juveniles');
}

// ── 5. Void Carrier (radius: 80, vessel-scale stratified buoyant hull, ~53 x 14 x 31) ────────

export function createVoidCarrierHullGeometry() {
  const lowerDeck = createFoldedSac(25.5, 3.6, 13.8, {
    folds: 8, depth: 0.12, rings: 12, sides: 18,
    asymFn: (x, y, z) => [x, y - 2.6, z + 0.8 * Math.cos(x * 0.12)],
  });
  const midDeck = createFoldedSac(22.0, 3.2, 11.4, {
    folds: 7, depth: 0.14, rings: 12, sides: 18,
    asymFn: (x, y, z) => [x, y + 1.1, z + 1.6],
  });
  const topCrownDeck = createFoldedSac(14.5, 2.6, 8.4, {
    folds: 6, depth: 0.15, rings: 10, sides: 16,
    asymFn: (x, y, z) => [x, y + 4.4, z + 2.4],
  });
  return mergeGeometries([lowerDeck, midDeck, topCrownDeck], 'VoidCarrier_StratifiedHull');
}

export function createVoidCarrierLayersGeometry() {
  const ribs = [];
  for (const side of [-1, 1]) {
    ribs.push(createFoldedLobe([
      [side * 6.0, -0.6, 12.2, 2.2, 1.1],
      [side * 16.5, -0.2, 7.2, 2.6, 1.2],
      [side * 25.0, -0.8, -1.5, 2.1, 0.9],
      [side * 19.0, -1.4, -10.5, 1.4, 0.65],
    ], { folds: 4, depth: 0.16, rings: 14, sides: 10 }));
    ribs.push(createFoldedLobe([
      [side * 4.5, 2.7, 9.2, 1.6, 0.85],
      [side * 13.5, 2.9, 3.8, 1.85, 0.9],
      [side * 19.5, 2.2, -4.5, 1.3, 0.6],
    ], { folds: 4, depth: 0.14, rings: 12, sides: 10 }));
  }
  return mergeGeometries(ribs, 'VoidCarrier_CarrierLayers');
}

export function createVoidCarrierNodesGeometry() {
  const pods = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const z = 8.2 - k * 3.8;
      const x = side * (16.5 + Math.sin(k * 0.65) * 5.2);
      pods.push(createFoldedSac(1.35, 0.95, 1.25, {
        folds: 4, depth: 0.1, rings: 7, sides: 10,
        asymFn: (px, py, pz) => [px + x, py + 0.65, pz + z],
      }));
    }
  }
  return mergeGeometries(pods, 'VoidCarrier_BroodNodes');
}

export function createVoidCarrierRelayGeometry() {
  return createFoldedLobe([
    [0, 6.2, 6.8, 1.35, 0.75],
    [0, 6.8, 2.4, 1.75, 0.95],
    [0, 6.1, -2.4, 1.2, 0.7],
  ], { folds: 4, depth: 0.12, rings: 10, sides: 10, name: 'VoidCarrier_RelayCrest' });
}

export function createVoidCarrierStreamersGeometry() {
  const streamers = [];
  for (const side of [-1, 1]) {
    streamers.push(createFoldedLobe([
      [side * 7.5, -1.6, -7.2, 1.3, 0.7],
      [side * 10.5, -2.0, -11.4, 1.0, 0.5],
      [side * 7.8, -2.4, -14.8, 0.45, 0.25],
    ], { folds: 3, depth: 0.15, rings: 10, sides: 8 }));
  }
  return mergeGeometries(streamers, 'VoidCarrier_Streamers');
}

// ── 6. Wake Eel (radius: 11, serpentine S-coil along +Z, bounds ~30.5 x 4.2 x 23.5) ─────────

const EEL_SPINE = [
  [0.0, 0.15, 6.2, 1.54, 1.20],
  [4.6, 0.24, 4.5, 1.85, 1.34],
  [7.0, 0.18, 1.8, 1.76, 1.28],
  [1.8, 0.04, -0.3, 1.62, 1.20],
  [-5.4, -0.06, -2.3, 1.40, 1.10],
  [-7.4, -0.10, -4.4, 1.00, 0.80],
  [-2.2, -0.08, -6.1, 0.44, 0.36],
];

export function createWakeEelBodyGeometry() {
  const body = createFoldedLobe(EEL_SPINE, {
    folds: 5,
    depth: 0.14,
    rings: 32,
    sides: 12,
    dorsal: 1.12,
    ventral: 0.85,
  });
  // Sculpted predatory head jaws oriented forward along +Z.
  const upperJaw = createFoldedLobe([
    [0.0, 0.52, 4.8, 1.34, 0.62],
    [-0.45, 0.44, 6.4, 1.00, 0.44],
    [-0.85, 0.20, 7.3, 0.38, 0.22],
  ], { folds: 3, depth: 0.12, rings: 8, sides: 8 });
  const lowerJaw = createFoldedLobe([
    [0.0, -0.28, 4.7, 1.16, 0.50],
    [-0.42, -0.34, 6.2, 0.86, 0.36],
    [-0.80, -0.18, 7.0, 0.32, 0.18],
  ], { folds: 3, depth: 0.1, rings: 8, sides: 8 });
  return mergeGeometries([body, upperJaw, lowerJaw], 'WakeEel_Body');
}

export function createWakeEelFinsGeometry() {
  const dorsalBlade = createFoldedLobe([
    [4.4, 1.48, 4.5, 0.18, 0.64],
    [7.0, 1.54, 1.8, 0.22, 0.78],
    [1.8, 1.40, -0.3, 0.22, 0.76],
    [-5.4, 1.24, -2.3, 0.20, 0.66],
    [-7.4, 0.94, -4.4, 0.16, 0.52],
    [-2.2, 0.46, -6.1, 0.10, 0.26],
  ], { folds: 3, depth: 0.14, rings: 26, sides: 8 });
  const outerRibbon = createFoldedLobe([
    [6.1, 0.18, 4.8, 1.00, 0.18],
    [8.7, 0.12, 1.8, 1.20, 0.18],
    [3.0, 0.02, -0.6, 0.92, 0.16],
    [-6.8, -0.08, -2.6, 1.12, 0.16],
    [-8.7, -0.10, -4.6, 0.88, 0.14],
    [-2.7, -0.08, -6.2, 0.40, 0.10],
  ], { folds: 3, depth: 0.16, rings: 24, sides: 8 });
  const innerRibbon = createFoldedLobe([
    [2.9, 0.14, 4.2, 0.92, 0.16],
    [5.2, 0.10, 1.8, 1.06, 0.16],
    [0.5, 0.0, 0.0, 0.82, 0.15],
    [-3.9, -0.06, -2.0, 0.96, 0.15],
    [-6.0, -0.08, -4.2, 0.78, 0.14],
    [-1.7, -0.06, -5.9, 0.34, 0.10],
  ], { folds: 3, depth: 0.16, rings: 24, sides: 8 });
  return mergeGeometries([dorsalBlade, outerRibbon, innerRibbon], 'WakeEel_WakeFins');
}

export function createWakeEelGlowGeometry() {
  const nodes = [
    createFoldedLobe([
      [-0.85, 0.24, 5.1, 0.28, 0.22],
      [-0.95, 0.18, 6.6, 0.22, 0.18],
    ], { folds: 3, depth: 0.08, rings: 6, sides: 8 }),
    createFoldedLobe([
      [0.75, 0.24, 5.1, 0.28, 0.22],
      [-0.15, 0.18, 6.6, 0.22, 0.18],
    ], { folds: 3, depth: 0.08, rings: 6, sides: 8 }),
  ];
  for (let i = 1; i < EEL_SPINE.length - 1; i++) {
    const [sx, sy, sz] = EEL_SPINE[i];
    nodes.push(createFoldedSac(0.45, 0.36, 0.58, {
      folds: 3, depth: 0.08, rings: 6, sides: 8,
      asymFn: (x, y, z) => [x + sx, y + sy + 1.78, z + sz],
    }));
  }
  return mergeGeometries(nodes, 'WakeEel_SignalChain');
}

// ── 7. Cold Bell (radius: 20, tilted thick-walled bell + ribs + clapper, ~28 x 13.5 x 17) ────

const BELL_TILT_X = 1.62;

export function createColdBellShellGeometry() {
  // Ordered outer apex -> outer lip -> inner rim -> inner apex for outward-facing winding.
  const profile = [
    [0.0, 4.9],
    [5.4, 3.7],
    [8.6, 0.6],
    [10.8, -2.2],
    [11.4, -3.5],
    [10.4, -4.5],
    [7.8, -3.5],
    [5.9, -0.3],
    [3.5, 2.0],
    [0.0, 2.6],
  ];
  return createThickCuppedVessel(profile, {
    name: 'ColdBell_Shell',
    sides: 30,
    tiltX: BELL_TILT_X,
    modFn: (r, y, phi, v) => {
      const poleBlend = Math.min(1, r / 3.0);
      const flute = 1 + 0.09 * Math.cos(6 * phi) * Math.sin(v * Math.PI);
      const ellip = Math.hypot(1.08 * Math.cos(phi), 0.72 * Math.sin(phi));
      const scallop = poleBlend * Math.cos(6 * phi) * 0.42 * (y < -1.2 ? 1 : 0.25);
      const archLift = poleBlend * Math.max(0, Math.sin(phi)) * 1.15 * (y < -1.8 ? 1 : 0);
      return [r * flute * ellip, y + scallop + archLift];
    },
  });
}

export function createColdBellRibsGeometry() {
  const ribs = [];
  const c = Math.cos(BELL_TILT_X);
  const s = Math.sin(BELL_TILT_X);
  const tilt = (x, y, z) => [x, y * c - z * s, y * s + z * c];
  ribs.push(createFoldedSac(1.65, 0.9, 1.35, {
    folds: 6, depth: 0.1, rings: 8, sides: 12,
    asymFn: (x, y, z) => tilt(x, y + 4.85, z),
  }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const ellip = Math.hypot(1.08 * ca, 0.72 * sa);
    const archLift = Math.max(0, sa) * 1.15;
    const pts = [
      [...tilt(ca * 0.9 * ellip, 4.75, sa * 0.9 * ellip), 0.58, 0.45],
      [...tilt(ca * 5.6 * ellip, 3.4, sa * 5.6 * ellip), 0.72, 0.54],
      [...tilt(ca * 9.0 * ellip, 0.3, sa * 9.0 * ellip), 0.68, 0.50],
      [...tilt(ca * 11.1 * ellip, -3.1 + archLift, sa * 11.1 * ellip), 0.46, 0.35],
    ];
    ribs.push(createFoldedLobe(pts, { folds: 3, depth: 0.12, rings: 10, sides: 8 }));
  }
  return mergeGeometries(ribs, 'ColdBell_Ribs');
}

export function createColdBellClapperGeometry() {
  // Suspended piezo clapper rooted at inner dome apex and hanging slightly beyond the open rim.
  const stem = createFoldedLobe([
    [0, 0.0, 0, 0.36, 0.36],
    [0, -3.1, 0, 0.30, 0.30],
    [0, -6.2, 0, 0.46, 0.46],
  ], { folds: 3, depth: 0.1, rings: 8, sides: 8, refUp: [1, 0, 0] });
  const bulb = createFoldedSac(1.60, 1.85, 1.60, {
    folds: 5, depth: 0.15, rings: 10, sides: 12,
    asymFn: (x, y, z) => [x, y - 7.3, z],
  });
  const g = mergeGeometries([stem, bulb], 'ColdBell_PiezoClapper');
  g.rotateX(BELL_TILT_X);
  return g;
}

// ── 8. Furnace Maw (radius: 22, EXACT 18.0 WU XZ radius + 9-child contract for Maw Worksite) ─

export function createFurnaceBowlGeometry() {
  const profile = [
    [0.0, -2.8],
    [6.5, -2.4],
    [10.8, -0.4],
    [12.4, 2.8],
    [14.2, 4.8],
    [16.2, 4.0],
    [16.8, 0.5],
    [14.6, -3.5],
    [8.2, -4.9],
    [0.0, -5.2],
  ];
  return createThickCuppedVessel(profile, {
    name: 'FurnaceMaw_VentBowl',
    sides: 28,
    modFn: (r, y, phi, v) => {
      const fin = 1 + 0.0714 * Math.cos(7 * phi) * (v > 0.35 && v < 0.88 ? 1 : 0.3);
      return [r * fin, y + 0.5 * Math.cos(7 * phi) * (v > 0.2 && v < 0.7 ? 1 : 0)];
    },
  });
}

export function createFurnaceThroatGeometry() {
  return createFoldedSac(7.8, 3.0, 7.8, {
    folds: 7, depth: 0.2, rings: 12, sides: 16, name: 'FurnaceMaw_Throat',
  });
}

export function createFurnaceJawGeometry() {
  return createFoldedLobe([
    [0, -0.4, 0.0, 1.5, 1.1],
    [0, 1.9, -0.6, 1.2, 0.88],
    [0, 3.8, -2.2, 0.72, 0.52],
    [0, 4.9, -4.0, 0.22, 0.18],
  ], { folds: 4, depth: 0.14, rings: 10, sides: 8, refUp: [1, 0, 0], name: 'FurnaceMaw_JawTooth' });
}
