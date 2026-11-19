// Pure silhouette recipes for Bolus fauna. No Three.
// The collider stays a ball. These shapes are what the mesh builder wears.
// A stopped louse, fingerling, or mite gains two splayed cards and nothing else.

const TISSUE = 0x8a5048;
const TENDON = 0x5a2828;
const SUTURE = 0xf4f1ea;
const STONE = 0x6a5848;
const PALE = 0xc4b59a;

function quad(id, a, b, c, d, color, glow) {
  return {
    id,
    color,
    tissue: !glow,
    glow: !!glow,
    doubleSided: true,
    indices: null,
    positions: [
      a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2],
      a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2],
    ],
    // Duplicated triangle vertices share the same corner coordinates.
    ...(!glow ? { uvs: [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1] } : {}),
  };
}

function tri(id, a, b, c, color, glow) {
  return {
    id,
    color,
    tissue: !glow,
    glow: !!glow,
    doubleSided: true,
    indices: null,
    positions: [a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]],
    ...(!glow ? { uvs: [0, 0, 1, 0, 0.5, 1] } : {}),
  };
}

function clonePart(part) {
  return {
    id: part.id,
    color: part.color,
    tissue: part.tissue,
    glow: part.glow,
    ...(part.doubleSided ? { doubleSided: true } : {}),
    ...(part.emissiveIntensity != null ? { emissiveIntensity: part.emissiveIntensity } : {}),
    indices: part.indices ? part.indices.slice() : null,
    positions: part.positions.slice(),
    ...(part.uvs ? { uvs: part.uvs.slice() } : {}),
    ...(part.normals ? { normals: part.normals.slice() } : {}),
  };
}

function strap(id, color, length, thick, y) {
  const h = length / 2;
  const t = thick;
  return quad(id, [-h, y, -t], [h, y, -t], [h, y, t], [-h, y, t], color);
}

function bulb(id, color, r, x) {
  return quad(
    id,
    [x - r, r * 0.35, -r * 0.4],
    [x + r, r * 0.2, -r * 0.2],
    [x + r * 0.8, -r * 0.15, r * 0.45],
    [x - r * 0.7, -r * 0.3, r * 0.2],
    color,
  );
}

// Low-resolution closed tissue volumes. Radial ripples give each sac its own
// creases while keeping a fixed triangle budget and the existing part identities.
function flesh(id, color, center, radii, folds = 3, depth = 0.12) {
  const positions = [], uvs = [], indices = [];
  const rings = 8, sides = 12;
  for (let i = 0; i <= rings; i++) {
    const v = i / rings, latitude = Math.PI * v;
    for (let j = 0; j <= sides; j++) {
      const u = j / sides, angle = u * Math.PI * 2;
      const ripple = 1 + depth * Math.cos(folds * angle + 0.7 * Math.cos(latitude)) * Math.sin(latitude);
      positions.push(center[0] + radii[0] * Math.sin(latitude) * Math.cos(angle) * ripple,
        center[1] + radii[1] * Math.cos(latitude),
        center[2] + radii[2] * Math.sin(latitude) * Math.sin(angle) * ripple);
      uvs.push(u, v);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return { id, color, tissue: true, glow: false, doubleSided: true, positions, indices, uvs };
}

function catmullRomStation(points, v) {
  const n = points.length;
  if (n === 2) {
    return points[0].map((val, k) => val + (points[1][k] - val) * v);
  }
  const scaled = Math.max(0, Math.min(n - 1, v * (n - 1)));
  const k = Math.min(n - 2, Math.floor(scaled));
  const t = scaled - k;
  const p0 = points[Math.max(0, k - 1)];
  const p1 = points[k];
  const p2 = points[k + 1];
  const p3 = points[Math.min(n - 1, k + 2)];
  const t2 = t * t, t3 = t2 * t;
  const out = new Array(5);
  for (let c = 0; c < 5; c++) {
    out[c] = 0.5 * (
      2 * p1[c]
      + (-p0[c] + p2[c]) * t
      + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2
      + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3
    );
  }
  out[3] = Math.max(0.005, out[3]);
  out[4] = Math.max(0.005, out[4]);
  return out;
}

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

function weldPartNormals(positions, indices) {
  const normals = new Array(positions.length).fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const ux = positions[ib] - positions[ia];
    const uy = positions[ib + 1] - positions[ia + 1];
    const uz = positions[ib + 2] - positions[ia + 2];
    const vx = positions[ic] - positions[ia];
    const vy = positions[ic + 1] - positions[ia + 1];
    const vz = positions[ic + 2] - positions[ia + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const base of [ia, ib, ic]) {
      normals[base] += nx;
      normals[base + 1] += ny;
      normals[base + 2] += nz;
    }
  }
  const groups = new Map();
  const count = positions.length / 3;
  for (let v = 0; v < count; v++) {
    const p = v * 3;
    const key = `${Math.round(positions[p] * 1e5)},${Math.round(positions[p + 1] * 1e5)},${Math.round(positions[p + 2] * 1e5)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, g = { ids: [], sx: 0, sy: 0, sz: 0 });
    g.ids.push(p);
    g.sx += normals[p];
    g.sy += normals[p + 1];
    g.sz += normals[p + 2];
  }
  for (const g of groups.values()) {
    const len = Math.hypot(g.sx, g.sy, g.sz) || 1;
    const nx = g.sx / len;
    const ny = g.sy / len;
    const nz = g.sz / len;
    for (const p of g.ids) {
      normals[p] = nx;
      normals[p + 1] = ny;
      normals[p + 2] = nz;
    }
  }
  return normals;
}

function mergeRawParts(id, color, rawParts, { tissue = true, glow = false, emissiveIntensity } = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  let offset = 0;
  for (const part of rawParts) {
    for (let i = 0; i < part.positions.length; i++) positions.push(part.positions[i]);
    for (let i = 0; i < part.uvs.length; i++) uvs.push(part.uvs[i]);
    for (let i = 0; i < part.indices.length; i++) indices.push(part.indices[i] + offset);
    offset += part.positions.length / 3;
  }
  const normals = weldPartNormals(positions, indices);
  return {
    id,
    color,
    tissue,
    glow,
    ...(emissiveIntensity != null ? { emissiveIntensity } : {}),
    positions,
    indices,
    uvs,
    normals,
  };
}

function volLobeData(points, {
  folds = 4,
  depth = 0.14,
  rings = 14,
  sides = 12,
  phase = 0.7,
  ventralScale = 1.0,
  keel = 0,
  tipTaper = 0.45,
  squareness = 1.0,
  twist = 0,
} = {}) {
  const spine = [];
  for (let i = 0; i <= rings; i++) {
    const lat = Math.PI * (0.08 + 0.84 * (i / rings));
    const v = 0.5 - 0.5 * Math.cos(lat);
    spine.push({ lat, st: catmullRomStation(points, v), frac: i / rings });
  }
  const positions = [];
  const uvs = [];
  const indices = [];
  let prevN = null;
  let prevB = null;
  let firstT = null;
  let lastT = null;
  for (let i = 0; i <= rings; i++) {
    const { lat, st, frac } = spine[i];
    const pPrev = spine[Math.max(0, i - 1)].st;
    const pNext = spine[Math.min(rings, i + 1)].st;
    const tangent = normVec([pNext[0] - pPrev[0], pNext[1] - pPrev[1], pNext[2] - pPrev[2]]);
    if (i === 0) firstT = tangent;
    if (i === rings) lastT = tangent;
    let normal;
    if (!prevN) {
      const ref = Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
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
    const cap = Math.min(1, Math.sin(lat) / 0.587785);
    const vCoord = 0.04 + 0.92 * frac;
    const tw = twist * frac;
    for (let j = 0; j <= sides; j++) {
      const uCoord = j / sides;
      const angle = uCoord * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const shapedC = squareness === 1 ? cosA : Math.sign(cosA) * Math.pow(Math.abs(cosA), squareness);
      const shapedS = squareness === 1 ? sinA : Math.sign(sinA) * Math.pow(Math.abs(sinA), squareness);
      const rotC = shapedC * Math.cos(tw) - shapedS * Math.sin(tw);
      const rotS = shapedC * Math.sin(tw) + shapedS * Math.cos(tw);
      const ripple = 1 + depth * Math.cos(folds * angle + phase * Math.cos(lat)) * Math.sin(lat);
      const keelMod = keel ? (1 + keel * Math.max(0, sinA) * Math.sin(lat)) : 1;
      const vFlat = sinA < 0 ? ventralScale : 1;
      const rc = rotC * st[3] * cap * ripple;
      const rs = rotS * st[4] * cap * ripple * vFlat * keelMod;
      positions.push(
        st[0] + normal[0] * rc + binormal[0] * rs,
        st[1] + normal[1] * rc + binormal[1] * rs,
        st[2] + normal[2] * rc + binormal[2] * rs,
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
  const s0 = spine[0].st;
  const sN = spine[rings].st;
  const r0 = Math.min(s0[3], s0[4]) * tipTaper;
  const rN = Math.min(sN[3], sN[4]) * tipTaper;
  const startTip = positions.length / 3;
  positions.push(s0[0] - firstT[0] * r0, s0[1] - firstT[1] * r0, s0[2] - firstT[2] * r0);
  uvs.push(0.5, 0);
  const endTip = positions.length / 3;
  positions.push(sN[0] + lastT[0] * rN, sN[1] + lastT[1] * rN, sN[2] + lastT[2] * rN);
  uvs.push(0.5, 1);
  const lastRing = rings * (sides + 1);
  for (let j = 0; j < sides; j++) {
    indices.push(startTip, j + 1, j);
    indices.push(endTip, lastRing + j, lastRing + j + 1);
  }
  return { positions, uvs, indices };
}

function volLobe(id, color, points, opts = {}) {
  const raw = volLobeData(points, opts);
  return {
    id,
    color,
    tissue: opts.tissue !== false && !opts.glow,
    glow: !!opts.glow,
    ...(opts.emissiveIntensity != null ? { emissiveIntensity: opts.emissiveIntensity } : {}),
    positions: raw.positions,
    indices: raw.indices,
    uvs: raw.uvs,
    normals: weldPartNormals(raw.positions, raw.indices),
  };
}

function volDomeData({
  offset = [0, 0, 0],
  rx = 0.8,
  rz = 0.5,
  radialRings = 12,
  sides = 28,
  lobeFreq = 6,
  lobeAmp = 0.12,
  lobePhase = 0,
  dorsalY = (r) => (1 - r * r) * 0.28,
  ventralY = (r) => -(1 - r * r) * 0.18,
  rimRound = 0.1,
} = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const rimMod = (r, th) => 1 + lobeAmp * Math.sin(r * Math.PI * 0.5) * Math.cos(lobeFreq * th + lobePhase + 0.6 * r);
  const addSheet = (isTop) => {
    const centerIdx = positions.length / 3;
    positions.push(offset[0], offset[1] + (isTop ? dorsalY(0, 0) : ventralY(0, 0)), offset[2]);
    uvs.push(0.5, 0.5);
    const ringStarts = [];
    for (let ri = 1; ri <= radialRings; ri++) {
      const r = ri / radialRings;
      ringStarts.push(positions.length / 3);
      for (let j = 0; j < sides; j++) {
        const theta = (j / sides) * Math.PI * 2;
        const mod = rimMod(r, theta);
        const lx = rx * r * mod * Math.cos(theta);
        const lz = rz * r * mod * Math.sin(theta);
        let ly = isTop ? dorsalY(r, theta) : ventralY(r, theta);
        if (ri === radialRings) {
          ly = 0.5 * (dorsalY(1, theta) + ventralY(1, theta));
        } else if (ri === radialRings - 1) {
          const midRim = 0.5 * (dorsalY(1, theta) + ventralY(1, theta));
          ly = ly + (midRim - ly) * rimRound;
        }
        positions.push(offset[0] + lx, offset[1] + ly, offset[2] + lz);
        const maxScale = 1 + Math.abs(lobeAmp) + 0.08;
        const u = Math.max(0.02, Math.min(0.98, 0.5 + 0.46 * (lx / (rx * maxScale))));
        const v = Math.max(0.02, Math.min(0.98, 0.5 + (isTop ? 0.46 : -0.46) * (lz / (rz * maxScale))));
        uvs.push(u, v);
      }
    }
    const r0 = ringStarts[0];
    for (let j = 0; j < sides; j++) {
      const next = (j + 1) % sides;
      if (isTop) indices.push(centerIdx, r0 + next, r0 + j);
      else indices.push(centerIdx, r0 + j, r0 + next);
    }
    for (let ri = 0; ri < radialRings - 1; ri++) {
      const inner = ringStarts[ri];
      const outer = ringStarts[ri + 1];
      for (let j = 0; j < sides; j++) {
        const next = (j + 1) % sides;
        const a = inner + j;
        const b = inner + next;
        const c = outer + j;
        const d = outer + next;
        if (isTop) indices.push(a, b, d, a, d, c);
        else indices.push(a, d, b, a, c, d);
      }
    }
  };
  addSheet(true);
  addSheet(false);
  return { positions, uvs, indices };
}

function volDome(id, color, opts = {}) {
  const raw = volDomeData(opts);
  return {
    id,
    color,
    tissue: opts.tissue !== false && !opts.glow,
    glow: !!opts.glow,
    ...(opts.emissiveIntensity != null ? { emissiveIntensity: opts.emissiveIntensity } : {}),
    positions: raw.positions,
    indices: raw.indices,
    uvs: raw.uvs,
    normals: weldPartNormals(raw.positions, raw.indices),
  };
}

function volTorus(id, color, {
  R = 0.72,
  rxScale = 1,
  rzScale = 1,
  yOffset = 0,
  tubeRx = 0.09,
  tubeRy = 0.08,
  majorSegs = 28,
  minorSegs = 12,
  majorFolds = 6,
  majorAmp = 0.08,
  minorFolds = 4,
  minorAmp = 0.12,
  waveY = 0.03,
  waveFreq = 3,
} = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= majorSegs; i++) {
    const uFrac = i / majorSegs;
    const u = uFrac * Math.PI * 2;
    const radMod = 1 + majorAmp * Math.cos(majorFolds * u);
    const cy = yOffset + waveY * Math.sin(waveFreq * u);
    const cx = Math.cos(u) * R * rxScale * radMod;
    const cz = Math.sin(u) * R * rzScale * radMod;
    for (let j = 0; j <= minorSegs; j++) {
      const vFrac = j / minorSegs;
      const v = vFrac * Math.PI * 2;
      const secMod = 1 + minorAmp * Math.cos(minorFolds * v + 1.1 * Math.cos(u * 2));
      const dr = Math.cos(v) * tubeRx * secMod;
      const dy = Math.sin(v) * tubeRy * secMod;
      positions.push(cx + Math.cos(u) * dr, cy + dy, cz + Math.sin(u) * dr);
      uvs.push(uFrac, vFrac);
    }
  }
  const stride = minorSegs + 1;
  for (let i = 0; i < majorSegs; i++) {
    for (let j = 0; j < minorSegs; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, d, b, b, d, c);
    }
  }
  return {
    id,
    color,
    tissue: true,
    glow: false,
    positions,
    indices,
    uvs,
    normals: weldPartNormals(positions, indices),
  };
}

// Closed, creased tissue volume swept along a curved spine with parallel-transported frames.
function foldedLobe(id, color, points, { folds = 4, depth = 0.14, rings = 12, sides = 10, tiltX = 0 } = {}) {
  const spine = [];
  for (let i = 0; i <= rings; i++) {
    const latitude = Math.PI * (0.10 + 0.80 * (i / rings));
    const v = 0.5 - 0.5 * Math.cos(latitude);
    spine.push({ latitude, station: catmullRomStation(points, v) });
  }
  const positions = [], uvs = [], indices = [];
  let prevN = null, prevB = null;
  let firstT = null, lastT = null;
  for (let i = 0; i <= rings; i++) {
    const { latitude, station } = spine[i];
    const pPrev = spine[Math.max(0, i - 1)].station;
    const pNext = spine[Math.min(rings, i + 1)].station;
    const tangent = normVec([pNext[0] - pPrev[0], pNext[1] - pPrev[1], pNext[2] - pPrev[2]]);
    if (i === 0) firstT = tangent;
    if (i === rings) lastT = tangent;
    let normal;
    if (!prevN) {
      const ref = Math.abs(tangent[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
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
    const cap = Math.min(1, Math.sin(latitude) / 0.587785);
    const vCoord = 0.04 + 0.92 * (i / rings);
    for (let j = 0; j <= sides; j++) {
      const uCoord = j / sides;
      const angle = uCoord * Math.PI * 2;
      const ripple = 1 + depth * Math.cos(folds * angle + 0.7 * Math.cos(latitude)) * Math.sin(latitude);
      const rc = Math.cos(angle) * station[3] * cap * ripple;
      const rs = Math.sin(angle) * station[4] * cap * ripple;
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
      const a = i * (sides + 1) + j, b = a + sides + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const s0 = spine[0].station, sN = spine[rings].station;
  const r0 = Math.min(s0[3], s0[4]) * 0.45, rN = Math.min(sN[3], sN[4]) * 0.45;
  const startTip = positions.length / 3;
  positions.push(s0[0] - firstT[0] * r0, s0[1] - firstT[1] * r0, s0[2] - firstT[2] * r0);
  uvs.push(0.5, 0);
  const endTip = positions.length / 3;
  positions.push(sN[0] + lastT[0] * rN, sN[1] + lastT[1] * rN, sN[2] + lastT[2] * rN);
  uvs.push(0.5, 1);
  const lastRing = rings * (sides + 1);
  for (let j = 0; j < sides; j++) {
    indices.push(startTip, j + 1, j);
    indices.push(endTip, lastRing + j, lastRing + j + 1);
  }
  if (tiltX) {
    const c = Math.cos(tiltX), s = Math.sin(tiltX);
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1], z = positions[i + 2];
      positions[i + 1] = y * c - z * s;
      positions[i + 2] = y * s + z * c;
    }
  }
  return { id, color, tissue: true, glow: false, doubleSided: true, positions, indices, uvs };
}

// Faceted closed mineral prism seated into a parent mass.
function prism(id, color, base, tip, radius, sides = 5) {
  const positions = [], uvs = [], indices = [];
  const axis = [tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]];
  const t = normVec(axis);
  const ref = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const n = normVec(crossVec(ref, t));
  const b = normVec(crossVec(t, n));
  const pushPt = (p, u, v) => {
    const idx = positions.length / 3;
    positions.push(p[0], p[1], p[2]);
    uvs.push(u, v);
    return idx;
  };
  const baseCenter = pushPt(base, 0.5, 0);
  const tipCenter = pushPt(tip, 0.5, 1);
  const baseRing = [], shoulderRing = [];
  const shoulder = [
    base[0] + axis[0] * 0.62,
    base[1] + axis[1] * 0.62,
    base[2] + axis[2] * 0.62,
  ];
  for (let j = 0; j <= sides; j++) {
    const u = j / sides;
    const angle = u * Math.PI * 2 + 0.3;
    const mod = 0.85 + 0.22 * Math.cos((j % sides) * 2.1);
    const dx = (n[0] * Math.cos(angle) + b[0] * Math.sin(angle)) * radius * mod;
    const dy = (n[1] * Math.cos(angle) + b[1] * Math.sin(angle)) * radius * mod;
    const dz = (n[2] * Math.cos(angle) + b[2] * Math.sin(angle)) * radius * mod;
    baseRing.push(pushPt([base[0] + dx, base[1] + dy, base[2] + dz], u, 0.1));
    shoulderRing.push(pushPt([shoulder[0] + dx * 0.62, shoulder[1] + dy * 0.62, shoulder[2] + dz * 0.62], u, 0.65));
  }
  for (let j = 0; j < sides; j++) {
    indices.push(baseCenter, baseRing[j + 1], baseRing[j]);
    indices.push(baseRing[j], baseRing[j + 1], shoulderRing[j]);
    indices.push(baseRing[j + 1], shoulderRing[j + 1], shoulderRing[j]);
    indices.push(shoulderRing[j], shoulderRing[j + 1], tipCenter);
  }
  return { id, color, tissue: true, glow: false, doubleSided: true, positions, indices, uvs };
}

// Merged closed 3D comb teeth so the row renders in one mesh without detached flat cards.
function teethRow(id, color, anchors) {
  const positions = [], uvs = [], indices = [];
  const sides = 6;
  for (const tooth of anchors) {
    const ringPoints = [tooth.base, tooth.mid, tooth.tip];
    const radii = [tooth.baseR, tooth.midR, 0.004];
    const vSteps = [0, 0.45, 0.9];
    const baseIdx = positions.length / 3;
    positions.push(tooth.base[0], tooth.base[1] + tooth.baseR * 0.2, tooth.base[2]);
    uvs.push(0.5, 0);
    const rings = [];
    for (let r = 0; r < 3; r++) {
      const p = ringPoints[r];
      const rad = radii[r];
      const ring = [];
      for (let j = 0; j <= sides; j++) {
        const u = j / sides;
        const a = u * Math.PI * 2;
        const idx = positions.length / 3;
        positions.push(p[0] + Math.cos(a) * rad, p[1], p[2] + Math.sin(a) * rad * 0.85);
        uvs.push(u, vSteps[r]);
        ring.push(idx);
      }
      rings.push(ring);
    }
    const tipIdx = positions.length / 3;
    positions.push(tooth.tip[0], tooth.tip[1] - 0.03, tooth.tip[2] - 0.01);
    uvs.push(0.5, 1);
    for (let j = 0; j < sides; j++) {
      indices.push(baseIdx, rings[0][j + 1], rings[0][j]);
      for (let r = 0; r < 2; r++) {
        indices.push(rings[r][j], rings[r][j + 1], rings[r + 1][j]);
        indices.push(rings[r][j + 1], rings[r + 1][j + 1], rings[r + 1][j]);
      }
      indices.push(rings[2][j], rings[2][j + 1], tipIdx);
    }
  }
  return { id, color, tissue: true, glow: false, doubleSided: true, positions, indices, uvs };
}

function buildKnob() {
  return {
    parts: [
      volDome('knob_bulb', 0x8e5446, {
        offset: [0.0, 0.06, 0.0],
        rx: 0.50,
        rz: 0.32,
        radialRings: 12,
        sides: 28,
        lobeFreq: 5,
        lobeAmp: 0.14,
        dorsalY: (r, th) => 0.24 * (1 - r * r) + 0.032 * Math.cos(5 * th) * r,
        ventralY: (r, th) => -0.18 * (1 - r * r) + 0.02 * Math.cos(5 * th) * r,
        rimRound: 0.14,
      }),
      volLobe('knob_root', 0x5c2e28, [
        [-0.82, -0.05, -0.05, 0.075, 0.065],
        [-0.32, -0.02, 0.04, 0.15, 0.12],
        [0.32, -0.02, 0.02, 0.145, 0.115],
        [0.80, -0.05, -0.05, 0.072, 0.062],
      ], { folds: 5, depth: 0.14, rings: 14, sides: 12 }),
    ],
  };
}

function buildTendon() {
  return {
    parts: [
      volLobe('tendon_strap', 0x603a30, [
        [-0.92, -0.02, -0.06, 0.115, 0.092],
        [-0.48, 0.02, 0.04, 0.09, 0.08],
        [0.0, 0.04, 0.06, 0.102, 0.088],
        [0.48, 0.01, -0.02, 0.09, 0.08],
        [0.92, -0.02, 0.06, 0.115, 0.092],
      ], { folds: 6, depth: 0.13, rings: 18, sides: 12, phase: 0.8, twist: 0.9, tipTaper: 0.38 }),
    ],
  };
}

function buildTooth() {
  const knob = buildKnob();
  const barb = volLobe('tooth_barb', 0xb59c80, [
    [0.08, 0.04, 0.0, 0.085, 0.075],
    [0.54, 0.12, 0.08, 0.095, 0.08],
    [0.98, 0.15, 0.19, 0.072, 0.062],
    [1.30, 0.07, 0.12, 0.036, 0.032],
  ], { folds: 3, depth: 0.10, rings: 14, sides: 12, tipTaper: 0.55 });
  return { parts: knob.parts.map(clonePart).concat([barb]) };
}

function buildSuture() {
  const loops = [
    [[-0.20, -0.04, -0.09, 0.038, 0.034], [-0.12, 0.12, -0.02, 0.042, 0.038], [-0.07, 0.04, 0.10, 0.040, 0.036], [-0.16, -0.11, 0.02, 0.038, 0.034]],
    [[-0.03, -0.11, 0.03, 0.040, 0.036], [0.02, 0.06, 0.11, 0.044, 0.038], [0.05, 0.12, -0.04, 0.042, 0.036], [-0.02, -0.04, -0.10, 0.038, 0.034]],
    [[0.11, 0.11, -0.03, 0.038, 0.034], [0.18, 0.03, 0.10, 0.042, 0.036], [0.14, -0.11, 0.02, 0.040, 0.034], [0.09, -0.03, -0.09, 0.038, 0.034]],
  ].map((pts) => volLobeData(pts, { folds: 3, depth: 0.10, rings: 10, sides: 8, tipTaper: 0.4 }));
  return {
    parts: [
      volLobe('suture_strap', SUTURE, [
        [-0.92, 0.0, -0.04, 0.105, 0.084],
        [-0.44, 0.02, 0.03, 0.125, 0.082],
        [0.0, 0.01, 0.03, 0.082, 0.062],
        [0.44, 0.02, 0.02, 0.125, 0.082],
        [0.92, 0.0, -0.04, 0.105, 0.084],
      ], { folds: 4, depth: 0.12, rings: 18, sides: 12, squareness: 0.65 }),
      mergeRawParts('suture_stitch', SUTURE, loops),
    ],
  };
}

function buildTendril() {
  return {
    parts: [
      volLobe('tendril_stem', 0x7a473b, [
        [-0.78, 0.0, -0.04, 0.085, 0.072],
        [-0.34, 0.03, 0.04, 0.13, 0.10],
        [0.14, 0.01, 0.0, 0.115, 0.092],
      ], { folds: 5, depth: 0.15, rings: 14, sides: 12 }),
      volLobe('fork_a', 0x905849, [
        [0.02, 0.01, 0.02, 0.095, 0.078],
        [0.40, 0.10, 0.25, 0.11, 0.07],
        [0.78, 0.15, 0.40, 0.082, 0.05],
        [1.04, 0.10, 0.32, 0.038, 0.028],
      ], { folds: 5, depth: 0.18, rings: 14, sides: 10 }),
      volLobe('fork_b', 0x6b3d33, [
        [0.02, -0.01, -0.02, 0.092, 0.076],
        [0.38, -0.09, -0.23, 0.105, 0.068],
        [0.76, -0.14, -0.38, 0.078, 0.048],
        [1.02, -0.09, -0.30, 0.036, 0.026],
      ], { folds: 5, depth: 0.18, rings: 14, sides: 10 }),
    ],
  };
}

function buildLantern() {
  return {
    parts: [
      volLobe('lantern_shaft', 0x70483a, [
        [0.0, 0.04, -0.03, 0.095, 0.08],
        [0.02, 0.22, -0.04, 0.078, 0.068],
        [0.07, 0.39, -0.01, 0.065, 0.058],
        [0.04, 0.52, 0.03, 0.048, 0.042],
      ], { folds: 4, depth: 0.12, rings: 14, sides: 12 }),
      volDome('lantern_sac', 0x805043, {
        offset: [0, 0.04, 0],
        rx: 0.54,
        rz: 0.25,
        radialRings: 12,
        sides: 28,
        lobeFreq: 5,
        lobeAmp: 0.11,
        dorsalY: (r, th) => 0.28 * (1 - r * r * 0.85) - 0.13 * Math.exp(-r * r * 6.5) + 0.03 * Math.cos(5 * th) * r,
        ventralY: (r, th) => -0.27 * (1 - r * r) + 0.02 * Math.cos(5 * th) * r,
        rimRound: 0.14,
      }),
      volDome('lantern_glow', 0xdc8262, {
        tissue: false,
        glow: true,
        emissiveIntensity: 0.48,
        offset: [-0.03, 0.20, 0.04],
        rx: 0.13,
        rz: 0.082,
        radialRings: 8,
        sides: 18,
        lobeFreq: 5,
        lobeAmp: 0.16,
        dorsalY: (r, th) => 0.055 * (1 - r * r) + 0.01 * Math.cos(5 * th) * r,
        ventralY: (r) => -0.045 * (1 - r * r),
        rimRound: 0.14,
      }),
    ],
  };
}

function buildFingerling() {
  return {
    parts: [
      foldedLobe('fingerling_sliver', 0x8d5b47, [
        [-0.96, 0.0, 0.05, 0.04, 0.035],
        [-0.45, 0.02, -0.05, 0.11, 0.095],
        [0.10, 0.03, 0.05, 0.135, 0.115],
        [0.60, 0.02, -0.02, 0.115, 0.10],
        [0.98, 0.0, 0.02, 0.045, 0.04],
      ], { folds: 4, depth: 0.15, rings: 14, sides: 10 }),
      foldedLobe('fingerling_crest', 0x6b3f33, [
        [-0.64, 0.05, -0.02, 0.07, 0.06],
        [-0.20, 0.10, 0.02, 0.085, 0.07],
        [0.24, 0.08, 0.01, 0.065, 0.055],
      ], { folds: 3, depth: 0.14, rings: 8, sides: 8 }),
    ],
  };
}

function buildLouse() {
  const legs = [];
  for (const side of [-1, 1]) {
    for (const xOff of [-0.36, 0.0, 0.36]) {
      legs.push(volLobeData([
        [xOff, -0.02, side * 0.30, 0.040, 0.034],
        [xOff * 1.06, -0.04, side * 0.46, 0.034, 0.028],
        [xOff * 1.12, -0.08, side * 0.56, 0.018, 0.016],
      ], { folds: 3, depth: 0.10, rings: 8, sides: 8 }));
    }
  }
  return {
    parts: [
      volDome('louse_coin', 0x743942, {
        rx: 0.78,
        rz: 0.48,
        radialRings: 12,
        sides: 28,
        lobeFreq: 8,
        lobeAmp: 0.06,
        dorsalY: (r, th) => 0.10 * (1 - r * r) + 0.015 * Math.cos(4 * th) * r,
        ventralY: (r) => -0.06 * (1 - r * r),
        rimRound: 0.16,
      }),
      mergeRawParts('louse_legs', 0x4b2128, legs),
    ],
  };
}

function buildDrum() {
  return {
    parts: [
      volDome('drum_skin', 0x845245, {
        rx: 0.92,
        rz: 0.46,
        radialRings: 12,
        sides: 28,
        lobeFreq: 6,
        lobeAmp: 0.08,
        dorsalY: (r, th) => 0.14 * (1 - r * r) - 0.08 * Math.exp(-r * r * 5.5) + 0.024 * Math.cos(6 * th) * r * (1 - r * 0.35),
        ventralY: (r, th) => -0.15 * (1 - r * r) + 0.018 * Math.cos(6 * th) * r,
        rimRound: 0.15,
      }),
      volTorus('drum_rim', 0x523129, {
        R: 0.88,
        rxScale: 1.0,
        rzScale: 0.52,
        yOffset: 0.02,
        tubeRx: 0.085,
        tubeRy: 0.08,
        majorSegs: 28,
        minorSegs: 12,
        majorFolds: 6,
        majorAmp: 0.06,
        minorFolds: 4,
        minorAmp: 0.12,
        waveY: 0.03,
        waveFreq: 3,
      }),
    ],
  };
}

function buildValve() {
  const upperLip = volLobeData([
    [-0.84, 0.0, 0.0, 0.09, 0.08],
    [-0.38, 0.05, 0.18, 0.16, 0.115],
    [0.02, 0.07, 0.23, 0.17, 0.12],
    [0.40, 0.04, 0.17, 0.155, 0.11],
    [0.84, 0.0, 0.0, 0.09, 0.08],
  ], { folds: 5, depth: 0.15, rings: 16, sides: 12 });
  const lowerLip = volLobeData([
    [-0.84, 0.0, 0.0, 0.09, 0.08],
    [-0.38, -0.04, -0.17, 0.155, 0.11],
    [0.02, -0.05, -0.22, 0.165, 0.115],
    [0.40, -0.03, -0.16, 0.15, 0.105],
    [0.84, 0.0, 0.0, 0.09, 0.08],
  ], { folds: 5, depth: 0.15, rings: 16, sides: 12 });
  return { parts: [mergeRawParts('valve_lip', 0x9a6070, [upperLip, lowerLip])] };
}

function buildGlove() {
  return {
    parts: [
      flesh('glove_palm', 0x7d4c3b, [-0.10, 0.02, 0.02], [0.46, 0.16, 0.36], 5, 0.15),
      foldedLobe('glove_digit_0', 0x956450, [
        [0.12, 0.03, -0.18, 0.095, 0.08],
        [0.54, 0.09, -0.26, 0.085, 0.072],
        [0.92, 0.04, -0.32, 0.048, 0.042],
      ], { folds: 4, depth: 0.14, rings: 8, sides: 8 }),
      foldedLobe('glove_digit_1', 0x956450, [
        [0.14, 0.04, 0.02, 0.10, 0.085],
        [0.62, 0.08, 0.05, 0.09, 0.075],
        [1.04, 0.02, 0.08, 0.05, 0.045],
      ], { folds: 4, depth: 0.14, rings: 8, sides: 8 }),
      foldedLobe('glove_digit_2', 0x956450, [
        [0.06, 0.01, 0.20, 0.095, 0.08],
        [0.44, 0.04, 0.38, 0.082, 0.07],
        [0.78, -0.02, 0.52, 0.045, 0.04],
      ], { folds: 4, depth: 0.14, rings: 8, sides: 8 }),
    ],
  };
}

function buildHauler() {
  const parts = [];
  const angles = [0.2, 0.9, 1.6, 2.3, 3.0, 3.7, 4.4];
  const rx = 0.98;
  const rz = 0.52;
  const ribPoints = [];
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i];
    const rMod = 0.94 + 0.05 * Math.cos(i * 2.1);
    const cx = Math.cos(a) * rx * rMod;
    const cz = Math.sin(a) * rz * rMod;
    const txRaw = -rx * Math.sin(a);
    const tzRaw = rz * Math.cos(a);
    const tLen = Math.hypot(txRaw, tzRaw) || 1;
    const tx = txRaw / tLen;
    const tz = tzRaw / tLen;
    const nx = tz;
    const nz = -tx;
    const halfSpan = 0.22;
    const camber = 0.045;
    const yBase = 0.02 + 0.015 * Math.sin(i * 1.3);
    parts.push(volLobe(`plate_${i}`, 0x684b3e, [
      [cx - tx * halfSpan - nx * 0.02, yBase - 0.01, cz - tz * halfSpan - nz * 0.02, 0.075, 0.095],
      [cx + nx * camber, yBase + 0.02, cz + nz * camber, 0.092, 0.125],
      [cx + tx * halfSpan - nx * 0.02, yBase - 0.01, cz + tz * halfSpan - nz * 0.02, 0.075, 0.095],
    ], { folds: 3, depth: 0.09, rings: 12, sides: 10, squareness: 0.55, tipTaper: 0.32 }));
    ribPoints.push([Math.cos(a) * rx * 0.86, -0.01, Math.sin(a) * rz * 0.86, 0.09, 0.082]);
  }
  parts.push(volLobe('hauler_rib', 0x4b2e28, ribPoints, { folds: 4, depth: 0.12, rings: 18, sides: 10, tipTaper: 0.3 }));
  return { parts };
}

function buildRib() {
  // Two closed cartilage lobes retain the existing child order and motion contract.
  // Each station is [x, y, z, in-plane radius, depth radius]. The smaller return
  // seats inside the crook near the origin, so its inherited flare cannot unseat it.
  function lobe(id, stations) {
    // One midpoint per authored span rounds the long crook without extra parts or
    // smoothing away the deliberately tapered ends. End stations stay exact.
    const authored = stations;
    stations = [];
    for (let i = 0; i < authored.length - 1; i++) {
      const a = authored[Math.max(0, i - 1)], b = authored[i];
      const c = authored[i + 1], d = authored[Math.min(authored.length - 1, i + 2)];
      stations.push(b, b.map((v, k) => (-a[k] + 9 * v + 9 * c[k] - d[k]) / 16));
    }
    stations.push(authored[authored.length - 1]);
    const sides = 8;
    const positions = [], indices = [], uvs = [];
    const lengths = [0];
    for (let i = 1; i < stations.length; i++) {
      const a = stations[i - 1], b = stations[i];
      lengths.push(lengths[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    for (let i = 0; i < stations.length; i++) {
      const p = stations[i];
      const a = stations[Math.max(0, i - 1)], b = stations[Math.min(stations.length - 1, i + 1)];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = -(b[1] - a[1]) / length, ny = (b[0] - a[0]) / length;
      for (let j = 0; j <= sides; j++) {
        const angle = (j % sides) / sides * Math.PI * 2;
        positions.push(p[0] + nx * Math.cos(angle) * p[3], p[1] + ny * Math.cos(angle) * p[3], p[2] + Math.sin(angle) * p[4]);
        uvs.push(j / sides, lengths[i] / lengths[lengths.length - 1]);
      }
    }
    for (let i = 0; i < stations.length - 1; i++) {
      for (let j = 0; j < sides; j++) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const capRim = new Map();
    for (const end of [0, stations.length - 1]) {
      const p = stations[end], center = positions.length / 3, ring = end * (sides + 1);
      positions.push(p[0], p[1], p[2]); uvs.push(0.5, 0.5);
      const rim = positions.length / 3;
      for (let j = 0; j < sides; j++) {
        const v = ring + j, angle = j / sides * Math.PI * 2;
        capRim.set(rim + j, v);
        positions.push(...positions.slice(v * 3, v * 3 + 3));
        uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
      }
      for (let j = 0; j < sides; j++) {
        const next = (j + 1) % sides;
        if (end) indices.push(center, rim + j, rim + next);
        else indices.push(center, rim + next, rim + j);
      }
    }
    // Area-weighted normals share both the wrap and radial-cap UV seams.
    const normals = new Array(positions.length).fill(0);
    const canonical = (v) => capRim.get(v) ?? (v < stations.length * (sides + 1) && v % (sides + 1) === sides ? v - sides : v);
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.slice(i, i + 3).map(v => v * 3);
      const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
      const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      for (const v of indices.slice(i, i + 3)) for (let k = 0; k < 3; k++) normals[canonical(v) * 3 + k] += n[k];
    }
    for (let v = 0; v < positions.length / 3; v++) {
      const c = canonical(v) * 3;
      const length = c === v * 3 ? Math.hypot(normals[c], normals[c + 1], normals[c + 2]) : 1;
      for (let k = 0; k < 3; k++) normals[v * 3 + k] = normals[c + k] / length;
    }
    // Lay the authored crook toward the XZ flight plane, not on an upright card.
    // This is vertex construction only: the entity yaw and fauna motion stay unchanged.
    const c = Math.cos(Math.PI * 5 / 12), s = Math.sin(Math.PI * 5 / 12);
    for (const values of [positions, normals]) for (let i = 0; i < values.length; i += 3) {
      const y = values[i + 1], z = values[i + 2];
      values[i + 1] = y * c - z * s;
      values[i + 2] = y * s + z * c;
    }
    // Reserve the unchanged motion envelope: root scale <=1.12, charge offset <=hypot(.1,.45).
    // Including the secondary 1.25 flare scale, every posed vertex remains inside radius16.
    for (let i = 0; i < positions.length; i++) positions[i] *= 0.93;
    return { id, color: TISSUE, tissue: true, glow: false, positions, indices, uvs, normals };
  }
  return { parts: [
    lobe('rib_hook', [
      [0.36, -0.35, 0.06, 0.055, 0.075], [0.45, -0.22, 0.07, 0.105, 0.14],
      [0.53, -0.02, 0.07, 0.13, 0.18], [0.56, 0.20, 0.06, 0.145, 0.21],
      [0.51, 0.43, 0.04, 0.15, 0.22], [0.37, 0.64, 0.01, 0.155, 0.22],
      [0.16, 0.75, -0.02, 0.15, 0.205], [-0.04, 0.70, -0.03, 0.135, 0.18],
      [-0.12, 0.54, -0.02, 0.12, 0.16], [-0.06, 0.34, 0.0, 0.13, 0.15],
      [0.03, 0.20, 0.02, 0.09, 0.12],
    ]),
    lobe('rib_return', [
      [-0.04, 0.33, 0.0, 0.11, 0.13], [0.01, 0.23, 0.0, 0.14, 0.155],
      [0.07, 0.10, 0.01, 0.12, 0.13], [0.17, 0.04, 0.02, 0.075, 0.085],
      [0.27, 0.07, 0.02, 0.025, 0.035],
    ]),
  ] };
}

function buildBezoar() {
  return {
    parts: [
      foldedLobe('bezoar_stone', 0x745846, [
        [-0.84, -0.02, -0.03, 0.05, 0.04],
        [-0.30, 0.02, -0.02, 0.27, 0.20],
        [0.22, 0.01, 0.02, 0.24, 0.18],
        [0.80, -0.01, 0.03, 0.05, 0.04],
      ], { folds: 5, depth: 0.18, rings: 12, sides: 10 }),
      prism('bezoar_lump', 0x94745c, [0.04, 0.02, 0.0], [0.12, 0.40, -0.02], 0.17, 5),
    ],
  };
}

function buildMite() {
  const palps = [-1, 1].map((side) => volLobeData([
    [0.24, 0.0, side * 0.08, 0.036, 0.030],
    [0.40, 0.02, side * 0.14, 0.030, 0.025],
    [0.50, -0.01, side * 0.07, 0.018, 0.016],
  ], { folds: 3, depth: 0.10, rings: 8, sides: 8 }));
  return {
    parts: [
      volLobe('mite_body', 0x5d2a38, [
        [-0.36, -0.01, 0.0, 0.055, 0.045],
        [-0.12, 0.02, 0.0, 0.14, 0.105],
        [0.18, 0.03, 0.0, 0.155, 0.115],
        [0.38, 0.01, 0.0, 0.07, 0.055],
      ], { folds: 5, depth: 0.14, rings: 12, sides: 10 }),
      mergeRawParts('mite_palps', 0x3d1924, palps),
    ],
  };
}

function buildNerve() {
  return {
    parts: [
      flesh('nerve_cord', 0x704236, [0, 0.07, 0.03], [1.08, 0.16, 0.18], 5, 0.16),
    ],
  };
}

function buildRing() {
  const positions = [];
  const R = 0.9;
  const tube = 0.18;
  const U = 12;
  const V = 6;
  for (let i = 0; i < U; i++) {
    const u = (i / U) * Math.PI * 2;
    for (let j = 0; j < V; j++) {
      const v = (j / V) * Math.PI * 2;
      const cx = Math.cos(u) * R;
      const cz = Math.sin(u) * R;
      positions.push(
        cx + Math.cos(u) * Math.cos(v) * tube,
        Math.sin(v) * tube,
        cz + Math.sin(u) * Math.cos(v) * tube,
      );
    }
  }
  const indices = [];
  for (let i = 0; i < U; i++) {
    const i2 = (i + 1) % U;
    for (let j = 0; j < V; j++) {
      const j2 = (j + 1) % V;
      const a = i * V + j;
      const b = i2 * V + j;
      const c = i2 * V + j2;
      const d = i * V + j2;
      indices.push(a, b, c, a, c, d);
    }
  }
  return {
    parts: [{
      id: 'ring_torus',
      color: PALE,
      tissue: true,
      glow: false,
      positions,
      indices,
    }],
  };
}

function buildHairball() {
  return {
    parts: [
      volLobe('hair_0', 0x834c40, [
        [-0.78, -0.04, -0.14, 0.055, 0.05],
        [-0.34, 0.14, 0.20, 0.078, 0.068],
        [0.18, 0.10, -0.18, 0.082, 0.07],
        [0.74, -0.02, 0.16, 0.052, 0.046],
      ], { folds: 4, depth: 0.14, rings: 16, sides: 10 }),
      volLobe('hair_1', 0x834c40, [
        [-0.66, 0.08, 0.18, 0.052, 0.046],
        [-0.14, -0.10, -0.22, 0.075, 0.065],
        [0.34, 0.14, 0.18, 0.072, 0.062],
        [0.78, 0.02, -0.12, 0.048, 0.042],
      ], { folds: 4, depth: 0.14, rings: 16, sides: 10 }),
      volLobe('hair_2', 0x834c40, [
        [-0.54, -0.10, 0.06, 0.05, 0.045],
        [0.0, 0.16, 0.06, 0.07, 0.06],
        [0.54, -0.08, -0.08, 0.05, 0.045],
      ], { folds: 4, depth: 0.14, rings: 12, sides: 10 }),
      volDome('hair_knot', 0x42201d, {
        rx: 0.46,
        rz: 0.30,
        radialRings: 10,
        sides: 24,
        lobeFreq: 5,
        lobeAmp: 0.16,
        dorsalY: (r, th) => 0.18 * (1 - r * r) + 0.03 * Math.cos(5 * th) * r,
        ventralY: (r, th) => -0.15 * (1 - r * r) + 0.02 * Math.cos(5 * th) * r,
        rimRound: 0.14,
      }),
    ],
  };
}

function buildBaleen() {
  return {
    parts: [
      foldedLobe('baleen_ribbon', 0x824e3d, [
        [-0.56, 0.06, -0.18, 0.13, 0.055],
        [-0.28, -0.02, 0.21, 0.16, 0.06],
        [0.0, 0.05, -0.22, 0.17, 0.062],
        [0.28, -0.03, 0.21, 0.16, 0.06],
        [0.56, 0.04, -0.17, 0.13, 0.055],
      ], { folds: 4, depth: 0.16, rings: 18, sides: 10 }),
      foldedLobe('baleen_keel', 0x5c362c, [
        [-0.46, 0.02, 0.06, 0.08, 0.055],
        [-0.16, -0.04, -0.10, 0.095, 0.06],
        [0.16, 0.03, 0.10, 0.095, 0.06],
        [0.46, -0.02, -0.06, 0.08, 0.055],
      ], { folds: 3, depth: 0.14, rings: 12, sides: 8 }),
    ],
  };
}

function buildFloater() {
  return {
    parts: [
      flesh('floater_sac', 0x825140, [0.02, 0.08, 0.02], [0.54, 0.32, 0.24], 5, 0.18),
      foldedLobe('floater_nipple', 0x633b30, [
        [-0.04, -0.08, -0.06, 0.15, 0.13],
        [-0.14, -0.28, -0.18, 0.105, 0.095],
        [-0.22, -0.46, -0.32, 0.05, 0.045],
      ], { folds: 4, depth: 0.15, rings: 8, sides: 8 }),
    ],
  };
}

function buildBlister() {
  const lantern = buildLantern();
  return {
    parts: lantern.parts.map(clonePart).concat([
      flesh('blister_cap', 0xa87962, [0.3, 0.21, 0], [0.25, 0.22, 0.2], 4, 0.1),
    ]),
  };
}

function buildCyst() {
  const floater = buildFloater();
  return {
    parts: floater.parts.map(clonePart).concat([
      flesh('cyst_node', 0xb69f82, [-0.28, 0.18, 0.06], [0.26, 0.22, 0.19], 4, 0.12),
    ]),
  };
}

function buildPolyp() {
  return {
    parts: [
      flesh('polyp_stalk', 0x704338, [0, 0.25, 0], [0.18, 0.12, 0.1], 3),
      flesh('polyp_head', 0x8f5945, [0, 0.02, 0], [0.5, 0.2, 0.25], 6, 0.2),
    ],
  };
}

function buildConcretion() {
  const stone = buildBezoar();
  return {
    parts: stone.parts.map(clonePart).concat([
      flesh('concretion_grit', 0x9c7b62, [0.36, 0.03, 0.15], [0.24, 0.15, 0.17], 4, 0.18),
    ]),
  };
}

function buildPapilla() {
  return { parts: [flesh('papilla_bud', 0x956450, [0.1, 0.06, 0], [0.36, 0.3, 0.19], 5, 0.18), flesh('papilla_neck', 0x704338, [0, -0.25, 0], [0.2, 0.13, 0.1], 3)] };
}

function buildHush() {
  return {
    parts: [
      volLobe('hush_pin', 0xa8967c, [
        [-0.48, 0.01, 0.0, 0.11, 0.095],
        [-0.08, 0.03, 0.03, 0.105, 0.09],
        [0.38, 0.01, -0.02, 0.078, 0.068],
        [0.82, -0.02, 0.02, 0.038, 0.034],
      ], { folds: 4, depth: 0.15, rings: 16, sides: 12 }),
      volDome('hush_head', PALE, {
        offset: [-0.44, 0.02, 0.0],
        rx: 0.26,
        rz: 0.22,
        radialRings: 10,
        sides: 24,
        lobeFreq: 6,
        lobeAmp: 0.14,
        dorsalY: (r, th) => 0.19 * (1 - r * r * 0.85) + 0.025 * Math.cos(6 * th) * r,
        ventralY: (r, th) => -0.16 * (1 - r * r) + 0.018 * Math.cos(6 * th) * r,
        rimRound: 0.14,
      }),
    ],
  };
}

function buildSpur() {
  const spike = flesh('spur_spike', 0x8b5b47, [0, 0.32, 0], [0.15, 0.56, 0.1], 3, 0.12);
  for (let i = 0; i < spike.positions.length; i += 3) {
    const taper = 1 - 0.55 * Math.max(0, (spike.positions[i + 1] - 0.32) / 0.56);
    spike.positions[i] *= taper;
    spike.positions[i + 2] *= taper;
  }
  return { parts: [spike] };
}

function buildFrenum() {
  return {
    parts: [
      volLobe('frenum_strap', 0x764539, [
        [-0.86, -0.02, -0.10, 0.08, 0.065],
        [-0.40, 0.04, 0.08, 0.145, 0.105],
        [0.02, 0.06, -0.04, 0.155, 0.115],
        [0.44, 0.03, 0.10, 0.14, 0.10],
        [0.88, -0.02, -0.08, 0.075, 0.06],
      ], { folds: 5, depth: 0.15, rings: 16, sides: 12, keel: 0.24, ventralScale: 0.82 }),
      volLobe('frenum_bridle', 0x542c25, [
        [-0.56, 0.03, 0.02, 0.065, 0.055],
        [-0.14, 0.09, -0.02, 0.085, 0.07],
        [0.24, 0.08, 0.04, 0.08, 0.065],
        [0.58, 0.02, -0.02, 0.06, 0.05],
      ], { folds: 3, depth: 0.14, rings: 12, sides: 10 }),
    ],
  };
}

function buildComb() {
  const teeth = [];
  for (let i = 0; i < 6; i++) {
    const x = -0.45 + i * 0.18;
    const arc = Math.cos(((i - 2.5) / 2.5) * 0.8);
    teeth.push({
      base: [x, 0.04 + arc * 0.03, 0.0],
      mid: [x * 1.04, -0.17 + arc * 0.02, -0.06],
      tip: [x * 1.08, -0.38, -0.15],
      baseR: 0.058,
      midR: 0.034,
    });
  }
  return {
    parts: [
      foldedLobe('comb_back', 0x7a4b3a, [
        [-0.64, 0.01, 0.02, 0.12, 0.11],
        [-0.22, 0.07, 0.01, 0.15, 0.13],
        [0.22, 0.07, -0.01, 0.15, 0.13],
        [0.64, 0.01, 0.02, 0.12, 0.11],
      ], { folds: 5, depth: 0.15, rings: 12, sides: 10 }),
      teethRow('comb_teeth', 0x9e725c, teeth),
    ],
  };
}

function buildUvula() {
  return {
    parts: [
      volLobe('uvula_root', 0x6e4035, [
        [-0.58, 0.14, -0.08, 0.105, 0.095],
        [-0.22, 0.22, -0.03, 0.155, 0.12],
        [0.22, 0.22, -0.03, 0.155, 0.12],
        [0.58, 0.14, -0.08, 0.105, 0.095],
      ], { folds: 5, depth: 0.14, rings: 14, sides: 12 }),
      volLobe('uvula_drop', 0x8e5342, [
        [0.0, 0.21, -0.02, 0.145, 0.115],
        [0.04, 0.03, 0.09, 0.17, 0.135],
        [0.08, -0.17, 0.18, 0.145, 0.11],
        [0.04, -0.32, 0.24, 0.082, 0.068],
      ], { folds: 5, depth: 0.15, rings: 16, sides: 12 }),
    ],
  };
}

function buildCrook() {
  return {
    parts: [
      foldedLobe('crook_staff', 0x825140, [
        [-0.62, -0.04, -0.10, 0.095, 0.085],
        [-0.22, 0.02, -0.05, 0.12, 0.105],
        [0.18, 0.04, 0.02, 0.125, 0.11],
        [0.44, 0.02, 0.06, 0.105, 0.09],
      ], { folds: 5, depth: 0.15, rings: 12, sides: 10 }),
      foldedLobe('crook_hook', 0x6b4133, [
        [0.32, 0.02, 0.04, 0.105, 0.09],
        [0.54, 0.06, 0.22, 0.115, 0.10],
        [0.46, 0.04, 0.42, 0.105, 0.09],
        [0.20, -0.02, 0.44, 0.068, 0.06],
      ], { folds: 4, depth: 0.16, rings: 12, sides: 10 }),
    ],
  };
}

function buildPleat() {
  return {
    parts: [
      flesh('pleat_a', 0x8c5a46, [0, 0.1, -0.09], [0.73, 0.12, 0.14], 5, 0.18),
      flesh('pleat_b', 0x603b30, [0, -0.08, 0.16], [0.66, 0.13, 0.17], 5, 0.18),
    ],
  };
}

function buildLip() {
  return {
    parts: [
      volLobe('lip_rim', 0x9b6d57, [
        [-0.86, 0.02, -0.12, 0.085, 0.07],
        [-0.42, 0.10, 0.10, 0.14, 0.11],
        [0.04, 0.12, 0.16, 0.155, 0.12],
        [0.46, 0.09, 0.08, 0.135, 0.105],
        [0.86, 0.01, -0.12, 0.08, 0.065],
      ], { folds: 5, depth: 0.14, rings: 18, sides: 12, keel: 0.18 }),
      volLobe('lip_fold', 0x6b3d33, [
        [-0.70, -0.05, -0.02, 0.085, 0.075],
        [-0.24, -0.07, 0.12, 0.135, 0.11],
        [0.24, -0.07, 0.11, 0.135, 0.11],
        [0.70, -0.05, -0.03, 0.08, 0.07],
      ], { folds: 5, depth: 0.15, rings: 16, sides: 12 }),
    ],
  };
}

function buildScale() {
  return {
    parts: [
      flesh('scale_plate', 0x755443, [0.3, 0.05, 0.08], [0.52, 0.47, 0.15], 4, 0.12),
      flesh('scale_root', 0x694135, [0, -0.34, 0], [0.32, 0.1, 0.09], 3),
    ],
  };
}

function buildPearl() {
  return {
    parts: [
      flesh('pearl_core', 0xb29a7b, [0, -0.02, 0], [0.16, 0.43, 0.13], 3, 0.08),
      flesh('pearl_seat', 0x704338, [0, -0.5, 0], [0.4, 0.1, 0.09], 4, 0.15),
    ],
  };
}

function buildMote() {
  return {
    parts: [
      flesh('mote_sliver', 0x8b5c48, [0, 0, 0], [0.32, 0.07, 0.065], 3, 0.12),
      flesh('mote_spark', 0xa7795e, [0.32, 0.01, 0.02], [0.085, 0.07, 0.055], 3, 0.1),
    ],
  };
}

const BUILDERS = {
  bolus_knob: buildKnob,
  bolus_tendon: buildTendon,
  bolus_tooth: buildTooth,
  bolus_suture: buildSuture,
  bolus_tendril: buildTendril,
  bolus_lantern: buildLantern,
  bolus_fingerling: buildFingerling,
  bolus_louse: buildLouse,
  bolus_drum: buildDrum,
  bolus_valve: buildValve,
  bolus_glove: buildGlove,
  bolus_hauler: buildHauler,
  bolus_rib: buildRib,
  bolus_bezoar: buildBezoar,
  bolus_mite: buildMite,
  bolus_nerve: buildNerve,
  bolus_ring: buildRing,
  bolus_hairball: buildHairball,
  bolus_baleen: buildBaleen,
  bolus_floater: buildFloater,
  bolus_blister: buildBlister,
  bolus_cyst: buildCyst,
  bolus_polyp: buildPolyp,
  bolus_concretion: buildConcretion,
  bolus_papilla: buildPapilla,
  bolus_hush: buildHush,
  bolus_spur: buildSpur,
  bolus_frenum: buildFrenum,
  bolus_comb: buildComb,
  bolus_uvula: buildUvula,
  bolus_crook: buildCrook,
  bolus_pleat: buildPleat,
  bolus_lip: buildLip,
  bolus_scale: buildScale,
  bolus_pearl: buildPearl,
  bolus_mote: buildMote,
};

const FREEZE = new Set(['bolus_louse', 'bolus_fingerling', 'bolus_mite']);

function splayCards() {
  return [
    quad('splay_card_0', [-0.9, 0.02, 0.05], [-0.15, 0.2, 0.1], [-0.2, -0.05, 0.35], [-0.85, -0.12, 0.2], PALE),
    quad('splay_card_1', [0.15, 0.18, 0.08], [0.95, 0.02, 0.12], [0.8, -0.1, 0.32], [0.2, -0.02, 0.28], PALE),
  ];
}

export function bolusSilhouette(speciesId, pose) {
  const build = BUILDERS[speciesId] || buildKnob;
  const recipe = build();
  const parts = recipe.parts.map(clonePart);
  if (pose && pose.stopped && FREEZE.has(speciesId)) parts.push(...splayCards());
  return { speciesId, parts };
}

export function bolusSilhouetteIds() {
  return Object.keys(BUILDERS);
}

export function partCentroid(mesh) {
  const p = mesh.positions;
  let x = 0;
  let y = 0;
  let z = 0;
  const n = p.length / 3;
  for (let i = 0; i < n; i++) {
    x += p[i * 3];
    y += p[i * 3 + 1];
    z += p[i * 3 + 2];
  }
  return { x: x / n, y: y / n, z: z / n };
}

export function colorChannelMax(hex) {
  return Math.max((hex >> 16) & 255, (hex >> 8) & 255, hex & 255) / 255;
}
