// Pure throat mesh for The Bolus. No Three. Positions are sector-local X, Y, Z.
// Y is up. The ship flies the XZ plane. Seed jitter is a unit or two on ribs and banks.
// Mouth z and the cough anchor do not move.

import { hash32, mulberry32 } from '../core/rng.js';
import { BOLUS_SECTOR_ID, bolusIrisOpenAmount } from '../data/theBolus.js';

export const BOLUS_CANAL_COLORS = Object.freeze({
  bank: 0x3a0c10,
  shelf: 0x4a1014,
  acid: 0x6a8a20,
  mouth: 0xc4b59a,
  coughCrease: 0x8d2a32,
  coughLip: 0xd8c8b0,
  lumen: 0x2a0c10,
  iris: 0x6a2030,
  cilia: 0x7a3840,
  rib: 0x4a2420,
  baleen: 0x7a4038,
  collar: 0xc4b59a,
  buoy: 0x8a847c,
  villus: 0x5a2028,
});

export const BOLUS_LANTERN_SHAFTS = Object.freeze([
  Object.freeze({ x: -560, y: 36, z: -1800 }),
  Object.freeze({ x: -560, y: 36, z: -1200 }),
  Object.freeze({ x: -560, y: 36, z: -600 }),
  Object.freeze({ x: -560, y: 36, z: 0 }),
  Object.freeze({ x: -560, y: 36, z: 600 }),
]);

const MOUTH_Z = -2624;
const COUGH = Object.freeze({ x: 2347, z: 1173 });
const NEAR_Z0 = -2624;
const NEAR_Z1 = 1400;
const LUMEN_Y = 0;
const CREST_Y = 72;
const ACID_TILT = (12 * Math.PI) / 180;

function part(id, positions, indices, color, kind, normals) {
  return {
    id,
    positions,
    indices: indices || null,
    normals: normals || null,
    color,
    kind: kind || 'static',
  };
}

function pushTri(index, a, b, c) {
  index.push(a, b, c);
}

function ribbonIndices(steps, across) {
  const index = [];
  for (let s = 0; s < steps; s++) {
    for (let a = 0; a < across - 1; a++) {
      const i = s * across + a;
      const i2 = i + 1;
      const j = (s + 1) * across + a;
      const j2 = j + 1;
      pushTri(index, i, j, j2);
      pushTri(index, i, j2, i2);
    }
  }
  return index;
}

function planeNormals(count, x, y, z) {
  const out = new Array(count * 3);
  for (let i = 0; i < count; i++) {
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  return out;
}

export function acidNormal() {
  return { x: 0, y: Math.cos(ACID_TILT), z: Math.sin(ACID_TILT) };
}

export function acidScroll(simTime, quiet, previous) {
  if (quiet) return previous || 0;
  const t = Number(simTime) || 0;
  const span = 48;
  return ((t * 14) % span + span) % span;
}

export function ciliaLean(simTime, coasting) {
  if (!coasting) return 0;
  return Math.sin((Number(simTime) || 0) * 1.5 * Math.PI * 2) * ((18 * Math.PI) / 180);
}

export function baleenPitch(boostEdge) {
  return boostEdge ? (-25 * Math.PI) / 180 : 0;
}

export function ribRadial(onCrest, stalled) {
  if (stalled) return 0;
  return onCrest ? 48 : 0;
}

export function irisHoleAcross(openAmount) {
  const amount = openAmount > 0 ? (openAmount < 1 ? openAmount : 1) : 0;
  const inner = 16 + (260 - 16) * amount;
  return inner * 2;
}

export function bolusIrisOpenAmountAt(simTime) {
  return bolusIrisOpenAmount(simTime);
}

function rngFor(seed) {
  return mulberry32(hash32(seed == null ? 1 : seed, BOLUS_SECTOR_ID, 'bolus-canal'));
}

function bankRibbon(id, color, kind, xAt, yAt, steps, z0, z1, rng, amp) {
  const across = xAt.length;
  const positions = [];
  for (let s = 0; s <= steps; s++) {
    const z = z0 + ((z1 - z0) * s) / steps;
    for (let a = 0; a < across; a++) {
      const jx = rng ? (rng() - 0.5) * amp : 0;
      const jy = rng ? (rng() - 0.5) * amp * 0.5 : 0;
      positions.push(xAt[a] + jx, yAt[a] + jy, z);
    }
  }
  return part(id, positions, ribbonIndices(steps, across), color, kind);
}

export function nearBankCrest(seed) {
  const rng = rngFor(seed);
  const steps = 50;
  const crest = bankRibbon(
    'near_bank_crest',
    BOLUS_CANAL_COLORS.bank,
    'bank',
    [-1100, -980, -860, -740],
    [6, 18, 34, CREST_Y],
    steps,
    NEAR_Z0,
    NEAR_Z1,
    rng,
    1.2,
  );
  const across = 4;
  const pos = crest.positions;
  for (let s = 0; s <= steps; s++) {
    let maxOther = -Infinity;
    for (let a = 0; a < across - 1; a++) {
      const y = pos[(s * across + a) * 3 + 1];
      if (y > maxOther) maxOther = y;
    }
    const crestI = (s * across + (across - 1)) * 3;
    let x = pos[crestI];
    if (x < -1500) x = -1500;
    if (x > -400) x = -400;
    pos[crestI] = x;
    const y = pos[crestI + 1] + 0.4;
    pos[crestI + 1] = y < maxOther + 6 ? maxOther + 6 : y;
    if (pos[crestI + 1] < LUMEN_Y + 48) pos[crestI + 1] = LUMEN_Y + 48;
  }
  return crest;
}

export function farBankCrest(seed) {
  const rng = rngFor(seed);
  const crest = bankRibbon(
    'far_bank_crest',
    BOLUS_CANAL_COLORS.bank,
    'bank',
    [780, 900, 1020, 1160],
    [0, 2, 4, 8],
    50,
    NEAR_Z0,
    NEAR_Z1,
    rng,
    1.2,
  );
  const pos = crest.positions;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i] < 740) pos[i] = 740;
    if (pos[i + 1] > 18) pos[i + 1] = 18;
  }
  return crest;
}

export function mouthLip() {
  const N = 48;
  const inner = 210;
  const outer = 460;
  const positions = [];
  for (let ring = 0; ring < 2; ring++) {
    const r = ring === 0 ? inner : outer;
    for (let i = 0; i < N; i++) {
      const theta = (i / N) * Math.PI * 2;
      const x = Math.cos(theta) * r;
      let y = Math.sin(theta) * r;
      if (x < 0 && y >= 0) y += 56;
      positions.push(x, y, MOUTH_Z);
    }
  }
  const indices = [];
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    indices.push(i, N + i, N + i2);
    indices.push(i, N + i2, i2);
  }
  return part('mouth_lip', positions, indices, BOLUS_CANAL_COLORS.mouth, 'mouth');
}

function flap(id, color, yHinge, yTrail) {
  const x0 = COUGH.x - 320;
  const x1 = COUGH.x + 320;
  const z0 = COUGH.z;
  const z1 = COUGH.z + 220;
  const cols = 8;
  const rows = 4;
  const positions = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const y = yHinge + (yTrail - yHinge) * t;
    const z = z0 + (z1 - z0) * t;
    for (let c = 0; c <= cols; c++) {
      const x = x0 + ((x1 - x0) * c) / cols;
      positions.push(x, y, z);
    }
  }
  return part(id, positions, ribbonIndices(rows, cols + 1), color, 'cough');
}

export function coughLips() {
  const crease = flap('cough_crease', BOLUS_CANAL_COLORS.coughCrease, 70, 150);
  const lip = flap('cough_lip', BOLUS_CANAL_COLORS.coughLip, -30, -130);
  return {
    flaps: [crease, lip],
    anchor: COUGH,
  };
}

export function shelfRibbon(seed) {
  const rng = rngFor(seed);
  return bankRibbon(
    'shelf',
    BOLUS_CANAL_COLORS.shelf,
    'shelf',
    [-1040, -920, -800],
    [LUMEN_Y + 1, LUMEN_Y + 4, LUMEN_Y + 8],
    50,
    NEAR_Z0,
    NEAR_Z1,
    rng,
    0.6,
  );
}

export function lumenGrid() {
  const x0 = 200;
  const x1 = 700;
  const z0 = -2400;
  const z1 = 1200;
  const cols = 10;
  const rows = 18;
  const positions = [];
  for (let r = 0; r <= rows; r++) {
    const z = z0 + ((z1 - z0) * r) / rows;
    for (let c = 0; c <= cols; c++) {
      const x = x0 + ((x1 - x0) * c) / cols;
      positions.push(x, LUMEN_Y, z);
    }
  }
  return part('lumen', positions, ribbonIndices(rows, cols + 1), BOLUS_CANAL_COLORS.lumen, 'lumen');
}

export function acidSheet() {
  const grid = lumenGrid();
  const n = acidNormal();
  const normals = planeNormals(grid.positions.length / 3, n.x, n.y, n.z);
  return part('acid', grid.positions.slice(), grid.indices.slice(), BOLUS_CANAL_COLORS.acid, 'acid', normals);
}

export function irisBlades(openAmount = 0) {
  const amount = openAmount > 0 ? (openAmount < 1 ? openAmount : 1) : 0;
  const inner = irisHoleAcross(amount) / 2;
  const outer = inner + 70;
  const blades = [];
  const count = 12;
  for (let b = 0; b < count; b++) {
    const a0 = (b / count) * Math.PI * 2;
    const a1 = ((b + 1) / count) * Math.PI * 2;
    const positions = [
      Math.cos(a0) * inner, Math.sin(a0) * inner, 400,
      Math.cos(a1) * inner, Math.sin(a1) * inner, 400,
      Math.cos(a1) * outer, Math.sin(a1) * outer, 400,
      Math.cos(a0) * inner, Math.sin(a0) * inner, 400,
      Math.cos(a1) * outer, Math.sin(a1) * outer, 400,
      Math.cos(a0) * outer, Math.sin(a0) * outer, 400,
    ];
    blades.push(part(`iris_blade_${b}`, positions, null, BOLUS_CANAL_COLORS.iris, 'iris'));
  }
  return blades;
}

function ringPart(id, z, radius, color, kind, rng) {
  const wobble = rng ? (rng() - 0.5) * 3 : 0;
  const r = radius + wobble;
  const N = 16;
  const positions = [];
  const indices = [];
  const tube = 10;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const cx = Math.cos(a) * r;
    const cy = Math.sin(a) * r * 0.55 + 24;
    positions.push(cx, cy, z);
    positions.push(Math.cos(a) * (r + tube), Math.sin(a) * (r * 0.55 + tube) + 24, z);
  }
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    const inner = i * 2;
    const outer = inner + 1;
    const inner2 = i2 * 2;
    const outer2 = inner2 + 1;
    indices.push(inner, outer, outer2);
    indices.push(inner, outer2, inner2);
  }
  return part(id, positions, indices, color, kind);
}

export function ribRings(seed) {
  const rng = rngFor(seed);
  const rings = [];
  let n = 0;
  for (let z = -2400; z <= 1200; z += 200) {
    rings.push(ringPart(`rib_${n}`, z, 280, BOLUS_CANAL_COLORS.rib, 'rib', rng));
    n += 1;
  }
  return rings;
}

function card(id, x, y, z, w, h, color, kind) {
  const positions = [
    x, y, z,
    x + w, y + h * 0.2, z + 8,
    x + w * 0.2, y + h, z - 6,
    x, y, z,
    x + w * 0.2, y + h, z - 6,
    x - w * 0.15, y + h * 0.7, z + 4,
  ];
  return part(id, positions, null, color, kind);
}

export function ciliaCards() {
  const cards = [];
  let n = 0;
  for (let z = -2500; z <= 1300; z += 140) {
    cards.push(card(`cilia_${n}`, -1000, 40, z, 36, 28, BOLUS_CANAL_COLORS.cilia, 'cilia'));
    n += 1;
  }
  return cards;
}

export function baleenPlates() {
  const plates = [];
  for (let i = 0; i < 8; i++) {
    const z = -1680 + i * 22;
    plates.push(card(`baleen_${i}`, -760, 18, z, 18, 46, BOLUS_CANAL_COLORS.baleen, 'baleen'));
  }
  return plates;
}

function collar() {
  return ringPart('station_collar', -900, 120, BOLUS_CANAL_COLORS.collar, 'static', null);
}

function buoyCage() {
  const x = -1100;
  const z = -1700;
  const s = 40;
  const positions = [
    x - s, 10, z - s, x + s, 10, z - s, x + s, 70, z - s,
    x - s, 10, z - s, x + s, 70, z - s, x - s, 70, z - s,
    x - s, 10, z + s, x - s, 70, z + s, x + s, 70, z + s,
    x - s, 10, z + s, x + s, 70, z + s, x + s, 10, z + s,
  ];
  return part('buoy_cage', positions, null, BOLUS_CANAL_COLORS.buoy, 'static');
}

function villi(seed) {
  const rng = rngFor(seed);
  const out = [];
  for (let i = 0; i < 24; i++) {
    const x = 220 + rng() * 460;
    const z = -2200 + rng() * 3200;
    const h = 16 + rng() * 22;
    out.push(part(`villus_${i}`, [
      x, LUMEN_Y, z,
      x + 6, LUMEN_Y, z + 4,
      x + 2, h, z + 1,
    ], null, BOLUS_CANAL_COLORS.villus, 'static'));
  }
  return out;
}

export function buildBolusCanal(seed) {
  const near = nearBankCrest(seed);
  const far = farBankCrest(seed);
  const mouth = mouthLip();
  const cough = coughLips();
  const parts = [
    near,
    far,
    shelfRibbon(seed),
    lumenGrid(),
    acidSheet(),
    mouth,
    cough.flaps[0],
    cough.flaps[1],
    collar(),
    buoyCage(),
    ...irisBlades(0),
    ...ribRings(seed),
    ...ciliaCards(),
    ...baleenPlates(),
    ...villi(seed),
  ];
  // Shift the collar onto the station X. ringPart is centered on X = 0.
  const station = parts.find((row) => row.id === 'station_collar');
  for (let i = 0; i < station.positions.length; i += 3) station.positions[i] -= 980;
  const buoy = parts.find((row) => row.id === 'buoy_cage');
  return { parts, mouth, near, far, cough, buoy, shafts: BOLUS_LANTERN_SHAFTS };
}

export function boundaryLoopCount(indices) {
  if (!indices || indices.length < 3) return 0;
  const counts = new Map();
  const add = (a, b) => {
    const k = a < b ? `${a}:${b}` : `${b}:${a}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  };
  for (let i = 0; i < indices.length; i += 3) {
    add(indices[i], indices[i + 1]);
    add(indices[i + 1], indices[i + 2]);
    add(indices[i + 2], indices[i]);
  }
  const adj = new Map();
  for (const [k, c] of counts) {
    if (c !== 1) continue;
    const pair = k.split(':');
    const a = Number(pair[0]);
    const b = Number(pair[1]);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  const seen = new Set();
  let loops = 0;
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    loops += 1;
    let cur = start;
    let prev = -1;
    for (let guard = 0; guard < indices.length; guard++) {
      seen.add(cur);
      const nexts = adj.get(cur);
      let nxt = -1;
      for (let i = 0; i < nexts.length; i++) {
        if (nexts[i] !== prev) {
          nxt = nexts[i];
          break;
        }
      }
      if (nxt < 0) break;
      prev = cur;
      cur = nxt;
      if (cur === start) break;
    }
  }
  return loops;
}

export function bboxOf(positions) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return {
    minX, minY, minZ, maxX, maxY, maxZ,
    dx: maxX - minX,
    dy: maxY - minY,
    dz: maxZ - minZ,
  };
}

export function meanY(positions) {
  let sum = 0;
  let n = 0;
  for (let i = 1; i < positions.length; i += 3) {
    sum += positions[i];
    n += 1;
  }
  return n ? sum / n : 0;
}

export function flatnessRatio(positions) {
  const n = positions.length / 3;
  if (n < 3) return 1;
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (let i = 0; i < n; i++) {
    mx += positions[i * 3];
    my += positions[i * 3 + 1];
    mz += positions[i * 3 + 2];
  }
  mx /= n;
  my /= n;
  mz /= n;
  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3] - mx;
    const y = positions[i * 3 + 1] - my;
    const z = positions[i * 3 + 2] - mz;
    xx += x * x;
    xy += x * y;
    xz += x * z;
    yy += y * y;
    yz += y * z;
    zz += z * z;
  }
  let a00 = xx;
  let a01 = xy;
  let a02 = xz;
  let a11 = yy;
  let a12 = yz;
  let a22 = zz;
  for (let iter = 0; iter < 12; iter++) {
    if (a01 * a01 > 1e-18) {
      const tau = (a11 - a00) / (2 * a01);
      const t = Math.sign(tau) / (Math.abs(tau) + Math.hypot(1, tau));
      const c = 1 / Math.hypot(1, t);
      const s = t * c;
      const n00 = c * c * a00 - 2 * s * c * a01 + s * s * a11;
      const n11 = s * s * a00 + 2 * s * c * a01 + c * c * a11;
      const n02 = c * a02 - s * a12;
      const n12 = s * a02 + c * a12;
      a00 = n00;
      a11 = n11;
      a01 = 0;
      a02 = n02;
      a12 = n12;
    }
    if (a02 * a02 > 1e-18) {
      const tau = (a22 - a00) / (2 * a02);
      const t = Math.sign(tau) / (Math.abs(tau) + Math.hypot(1, tau));
      const c = 1 / Math.hypot(1, t);
      const s = t * c;
      const n00 = c * c * a00 - 2 * s * c * a02 + s * s * a22;
      const n22 = s * s * a00 + 2 * s * c * a02 + c * c * a22;
      const n01 = c * a01 - s * a12;
      const n12 = s * a01 + c * a12;
      a00 = n00;
      a22 = n22;
      a02 = 0;
      a01 = n01;
      a12 = n12;
    }
    if (a12 * a12 > 1e-18) {
      const tau = (a22 - a11) / (2 * a12);
      const t = Math.sign(tau) / (Math.abs(tau) + Math.hypot(1, tau));
      const c = 1 / Math.hypot(1, t);
      const s = t * c;
      const n11 = c * c * a11 - 2 * s * c * a12 + s * s * a22;
      const n22 = s * s * a11 + 2 * s * c * a12 + c * c * a22;
      const n01 = c * a01 - s * a02;
      const n02 = s * a01 + c * a02;
      a11 = n11;
      a22 = n22;
      a12 = 0;
      a01 = n01;
      a02 = n02;
    }
  }
  const ev = [Math.abs(a00), Math.abs(a11), Math.abs(a22)].sort((p, q) => p - q);
  const max = ev[2] || 1;
  return ev[0] / max;
}

function crestRows(positions, across) {
  const rows = [];
  const steps = positions.length / 3 / across;
  for (let s = 0; s < steps; s++) {
    let best = -Infinity;
    let bestA = -1;
    let ties = 0;
    for (let a = 0; a < across; a++) {
      const y = positions[(s * across + a) * 3 + 1];
      if (y > best + 1e-6) {
        best = y;
        bestA = a;
        ties = 1;
      } else if (Math.abs(y - best) <= 1e-6) ties += 1;
    }
    rows.push({ y: best, a: bestA, ties, z: positions[(s * across) * 3 + 2] });
  }
  return rows;
}

export function auditNearBank(mesh) {
  const issues = [];
  const box = bboxOf(mesh.positions);
  if (!(box.dz / Math.max(box.dx, box.dy) >= 8)) issues.push('span');
  if (boundaryLoopCount(mesh.indices) < 1) issues.push('closed');
  const rows = crestRows(mesh.positions, 4);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i];
    if (x < -1500 - 1e-6 || x > -400 + 1e-6) issues.push('x');
  }
  for (const row of rows) {
    if (row.ties !== 1 || row.a !== 3) issues.push('crest');
    if (!(row.y >= LUMEN_Y + 48)) issues.push('height');
  }
  return { ok: issues.length === 0, issues, box };
}

export function auditFarBank(mesh, near) {
  const issues = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    if (!(mesh.positions[i] > 700)) issues.push('x');
  }
  if (!(meanY(mesh.positions) <= meanY(near.positions) - 24)) issues.push('mean');
  if (mesh.positions.length === near.positions.length) {
    let same = true;
    for (let i = 0; i < mesh.positions.length; i++) {
      if (mesh.positions[i] !== near.positions[i]) {
        same = false;
        break;
      }
    }
    if (same) issues.push('equal');
  }
  return { ok: issues.length === 0, issues };
}

export function auditMouth(mesh) {
  const issues = [];
  if (boundaryLoopCount(mesh.indices) !== 2) issues.push('loops');
  let maxAbsZ = 0;
  let maxR = 0;
  let minR = Infinity;
  let shelf = 0;
  let shelfN = 0;
  let acid = 0;
  let acidN = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i];
    const y = mesh.positions[i + 1];
    const z = mesh.positions[i + 2];
    const radius = Math.hypot(x, y);
    if (radius < minR) minR = radius;
    if (radius > maxR) maxR = radius;
    if (Math.abs(z + 2624) > maxAbsZ) maxAbsZ = Math.abs(z + 2624);
    if (x < 0) {
      shelf += y;
      shelfN += 1;
    } else if (x > 0) {
      acid += y;
      acidN += 1;
    }
  }
  if (minR < 210 - 1e-3) issues.push('hole');
  if (maxAbsZ > 80) issues.push('z');
  if (!(maxR >= 400)) issues.push('outer');
  if (!(shelfN && acidN && shelf / shelfN > acid / acidN)) issues.push('arc');
  return { ok: issues.length === 0, issues, maxR, minR };
}

export function auditCough(flaps) {
  const issues = [];
  if (!flaps || flaps.length !== 2) issues.push('count');
  const seps = [];
  for (const flapMesh of flaps || []) {
    const box = bboxOf(flapMesh.positions);
    if (!(box.dx >= 600)) issues.push('span');
    if (!(flatnessRatio(flapMesh.positions) < 0.2)) issues.push('flat');
  }
  if (flaps && flaps.length === 2) {
    const a = flaps[0].positions;
    const b = flaps[1].positions;
    const n = Math.min(a.length, b.length) / 3;
    const cols = 9;
    let hinge = 0;
    let trail = 0;
    let hingeN = 0;
    let trailN = 0;
    let minGap = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = a[i * 3] - b[i * 3];
      const dy = a[i * 3 + 1] - b[i * 3 + 1];
      const dz = a[i * 3 + 2] - b[i * 3 + 2];
      const d = Math.hypot(dx, dy, dz);
      if (d < minGap) minGap = d;
      const colRow = Math.floor(i / cols);
      if (colRow === 0) {
        hinge += d;
        hingeN += 1;
      }
      if (colRow === 4) {
        trail += d;
        trailN += 1;
      }
    }
    if (!(minGap >= 80)) issues.push('gap');
    if (!(trailN && hingeN && trail / trailN > hinge / hingeN)) issues.push('trail');
    seps.push(minGap);
  }
  return { ok: issues.length === 0, issues };
}

export function spherePart(n = 16) {
  const positions = [];
  const indices = [];
  for (let y = 0; y <= n; y++) {
    const v = (y / n) * Math.PI;
    for (let x = 0; x <= n; x++) {
      const u = (x / n) * Math.PI * 2;
      positions.push(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
    }
  }
  const row = n + 1;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * row + x;
      indices.push(i, i + row, i + 1);
      indices.push(i + 1, i + row, i + row + 1);
    }
  }
  return part('sphere', positions, indices, 0xffffff, 'sphere');
}
