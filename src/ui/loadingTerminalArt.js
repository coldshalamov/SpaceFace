/**
 * SpaceFace · Cyberpunk LIDAR Dot-Matrix & ASCII Music-Video Engine (Iteration 19/20)
 *
 * Major Focus: Optical Spherical Barrel Distortion, CRT Corner Vignette Falloff,
 * Cathode Scanlines & Retrace Beam, High-Voltage Power-On Boot Flare, and Cyberdeck Bezel.
 */

const WORKER_SCRIPT = `
const GLYPH_RAMP_32 = [
  ' ', '·', '.', '\`', ',', ':', ';', '-', '~', '=',
  '+', '*', '!', '?', '/', '(', '%', '&', '8', '#',
  'X', 'H', 'M', 'W', '░', '▒', '▓', '▀', '▄', '▌', '▐', '█'
];

const BAYER_4X4 = new Float32Array([
   0/16 - 0.5,  8/16 - 0.5,  2/16 - 0.5, 10/16 - 0.5,
  12/16 - 0.5,  4/16 - 0.5, 14/16 - 0.5,  6/16 - 0.5,
   3/16 - 0.5, 11/16 - 0.5,  1/16 - 0.5,  9/16 - 0.5,
  15/16 - 0.5,  7/16 - 0.5, 13/16 - 0.5,  5/16 - 0.5
]);

const GRID_COLS = 120;
const GRID_ROWS = 60;
const TOTAL_CELLS = GRID_COLS * GRID_ROWS;
const POINT_COUNT = 1600;

// Monolithic Unified Memory Allocation (512 KB)
const TOTAL_BYTES = 524288;
const MemorySlab = new ArrayBuffer(TOTAL_BYTES);

const currentLuminance = new Float32Array(MemorySlab, 0, TOTAL_CELLS);
const persistentDecay = new Float32Array(MemorySlab, TOTAL_CELLS * 4, TOTAL_CELLS);
const diffuseScratch = new Float32Array(MemorySlab, TOTAL_CELLS * 8, TOTAL_CELLS);
const cellChars = new Uint8Array(MemorySlab, TOTAL_CELLS * 12, TOTAL_CELLS);
const cellColors = new Uint8Array(MemorySlab, TOTAL_CELLS * 13, TOTAL_CELLS);

const ptX = new Float32Array(MemorySlab, TOTAL_CELLS * 14, POINT_COUNT);
const ptY = new Float32Array(MemorySlab, TOTAL_CELLS * 14 + POINT_COUNT * 4, POINT_COUNT);
const ptZ = new Float32Array(MemorySlab, TOTAL_CELLS * 14 + POINT_COUNT * 8, POINT_COUNT);

const RAIN_COLS = 40;
const rainY = new Float32Array(MemorySlab, TOTAL_CELLS * 14 + POINT_COUNT * 12, RAIN_COLS);
const rainSpeed = new Float32Array(MemorySlab, TOTAL_CELLS * 14 + POINT_COUNT * 12 + RAIN_COLS * 4, RAIN_COLS);

// Gyro & Reticle State: [thetaX, thetaY, velX, velY, targetX, targetY, lastMoveTime, rx, ry, rvx, rvy]
const gyroState = new Float32Array(MemorySlab, TOTAL_CELLS * 14 + POINT_COUNT * 12 + RAIN_COLS * 8, 12);

// Flat In-Place Scratch Registers for Evaluation Loops (Zero GC)
const evalScratch1 = new Float32Array(5);
const evalScratch2 = new Float32Array(5);
const projScratch = new Float32Array(4);
const curlScratch = new Float32Array(3);

// Pre-computed CRT Optical Lookup Tables
const crtVignette = new Float32Array(TOTAL_CELLS);
const crtDistortX = new Float32Array(TOTAL_CELLS);
const crtDistortY = new Float32Array(TOTAL_CELLS);

(function initCRTTables() {
  const k1 = 0.065;
  const k2 = 0.025;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const idx = r * GRID_COLS + c;
      const u = (c / (GRID_COLS - 1)) * 2.0 - 1.0;
      const v = (r / (GRID_ROWS - 1)) * 2.0 - 1.0;
      const r2 = u * u + v * v;
      const r4 = r2 * r2;
      const factor = 1.0 + k1 * r2 + k2 * r4;
      crtDistortX[idx] = u * factor;
      crtDistortY[idx] = v * factor;

      const vig = Math.max(0, (1.0 - u * u * 0.85) * (1.0 - v * v * 0.85));
      crtVignette[idx] = Math.pow(vig, 0.38);
    }
  }
})();

for (let i = 0; i < POINT_COUNT; i++) {
  ptX[i] = (Math.random() - 0.5) * 4.0;
  ptY[i] = (Math.random() - 0.5) * 4.0;
  ptZ[i] = (Math.random() - 0.5) * 4.0;
}

for (let c = 0; c < RAIN_COLS; c++) {
  rainY[c] = Math.random();
  rainSpeed[c] = 0.25 + Math.random() * 0.45;
}

let canvas = null;
let waveCanvas = null;
let ctx = null;
let waveCtx = null;
let width = 640;
let height = 380;
let waveW = 200;
let waveH = 48;

let running = false;
let startTime = 0;
let lastTime = 0;
let currentProgress = 0.05;
let targetProgress = 0.05;
let reducedMotion = false;

const SCENE_PALETTES = [
  ['rgba(13, 56, 46, 0.45)', 'rgba(78, 195, 230, 0.90)', 'rgba(122, 247, 208, 0.95)', '#ffffff', 'rgba(255, 60, 90, 0.95)', 'rgba(180, 140, 255, 0.90)'],
  ['rgba(16, 38, 48, 0.45)', 'rgba(74, 144, 226, 0.90)', 'rgba(255, 183, 0, 0.95)', '#ffffff', 'rgba(255, 80, 40, 0.95)', 'rgba(255, 0, 128, 0.85)'],
  ['rgba(18, 20, 40, 0.45)', 'rgba(0, 240, 255, 0.90)', 'rgba(191, 0, 255, 0.95)', '#ffffff', 'rgba(255, 69, 0, 0.95)', 'rgba(255, 165, 0, 0.90)'],
  ['rgba(25, 10, 40, 0.45)', 'rgba(0, 229, 255, 0.90)', 'rgba(157, 0, 255, 0.95)', '#ffffff', 'rgba(255, 20, 147, 0.95)', 'rgba(123, 44, 191, 0.90)'],
  ['rgba(10, 30, 45, 0.45)', 'rgba(78, 195, 230, 0.90)', 'rgba(57, 255, 20, 0.95)', '#ffffff', 'rgba(191, 0, 255, 0.95)', 'rgba(125, 249, 255, 0.95)']
];

function fastHash31(x, y, seed) {
  let n = (x * 374761393 + y * 668265263 + seed * 3266489917) >>> 0;
  n = (n ^ (n >>> 13)) * 1274126177 >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) * (1.0 / 4294967295.0);
}

function potentialField(x, y, z, t, component) {
  const s = 0.85;
  const off = component * 13.7;
  return Math.sin(x * s + off + t * 0.5) * Math.cos(y * s - off + t * 0.4) +
         Math.sin(z * s + off * 0.5 - t * 0.6) * Math.cos(x * s * 0.5 + t * 0.3);
}

function computeCurlNoise(x, y, z, t, out) {
  const eps = 0.05;
  const inv2Eps = 1.0 / (2.0 * eps);
  const dpsiZ_dy = (potentialField(x, y + eps, z, t, 2) - potentialField(x, y - eps, z, t, 2)) * inv2Eps;
  const dpsiY_dz = (potentialField(x, y, z + eps, t, 1) - potentialField(x, y, z - eps, t, 1)) * inv2Eps;
  out[0] = dpsiZ_dy - dpsiY_dz;

  const dpsiX_dz = (potentialField(x, y, z + eps, t, 0) - potentialField(x, y, z - eps, t, 0)) * inv2Eps;
  const dpsiZ_dx = (potentialField(x + eps, y, z, t, 2) - potentialField(x - eps, y, z, t, 2)) * inv2Eps;
  out[1] = dpsiX_dz - dpsiZ_dx;

  const dpsiY_dx = (potentialField(x + eps, y, z, t, 1) - potentialField(x - eps, y, z, t, 1)) * inv2Eps;
  const dpsiX_dy = (potentialField(x, y + eps, z, t, 0) - potentialField(x, y - eps, z, t, 0)) * inv2Eps;
  out[2] = dpsiY_dx - dpsiX_dy;
}

function blitText(str, startX, startY, colorIdx, luminance = 0.85) {
  for (let i = 0; i < str.length; i++) {
    const x = startX + i;
    if (x >= GRID_COLS) break;
    if (startY >= GRID_ROWS) break;
    const idx = startY * GRID_COLS + x;
    const ch = str[i];
    let rampIdx = 10;
    for (let r = 0; r < GLYPH_RAMP_32.length; r++) {
      if (GLYPH_RAMP_32[r] === ch) { rampIdx = r; break; }
    }
    currentLuminance[idx] = Math.max(currentLuminance[idx], luminance);
    cellChars[idx] = rampIdx;
    cellColors[idx] = colorIdx;
  }
}

// ACT 1: BIOMECHANICAL ANDROID
function evaluateAct1(idx, t, out) {
  const p = idx / POINT_COUNT;
  const breathY = Math.sin(t * 1.0) * 0.035;
  const jawPitch = Math.sin(t * 1.0) * 0.015;

  if (p < 0.48) {
    const u = (p / 0.48);
    const fu = ((u * 25) % 1) * 2 - 1;
    const fv = Math.floor(u * 25) / 12.5 - 1;
    const mask = fu * fu * 1.15 + fv * fv * 0.85;
    if (mask < 1.0) {
      const noseRidge = Math.exp(-fu * fu * 18) * Math.max(0, -fv * 0.8 + 0.4) * 0.45;
      const cheekBones = Math.exp(-(fu * fu - 0.25) * (fu * fu - 0.25) * 8) * Math.exp(-fv * fv * 4) * 0.25;
      const chinBump = Math.exp(-fu * fu * 12) * Math.exp(-(fv + 0.8) * (fv + 0.8) * 16) * 0.35;
      const lipsRidge = Math.exp(-fu * fu * 8) * Math.exp(-(fv + 0.45) * (fv + 0.45) * 24) * 0.28;
      const baseZ = Math.sqrt(Math.max(0, 1.0 - mask)) * 0.65;
      out[0] = fu * 0.78;
      out[1] = fv * 1.2 + 0.1 + breathY + (fv < -0.4 ? jawPitch : 0);
      out[2] = baseZ + noseRidge + cheekBones + chinBump + lipsRidge;
      out[3] = 2;
      out[4] = 26;
      return;
    }
  }
  if (p < 0.64) {
    const u = (p - 0.48) / 0.16;
    const isBlink = (t % 4.2) < 0.16;
    const blinkH = isBlink ? 0.015 : 0.12;
    const saccadeX = Math.sin(t * 3.7) > 0.85 ? 0.03 : 0.0;
    const a = u * Math.PI * 2;
    out[0] = 0.38 + saccadeX + Math.cos(a) * 0.20;
    out[1] = 0.28 + breathY + Math.sin(a) * blinkH;
    out[2] = 0.60;
    out[3] = 1;
    out[4] = 1;
    return;
  }
  if (p < 0.76) {
    const u = (p - 0.64) / 0.12;
    const stepAngle = Math.floor(t * 8.0) * (Math.PI / 16.0);
    const ringAngle = u * Math.PI * 4 + stepAngle;
    const ringLayer = Math.floor(u * 2);
    const ringRadius = 0.12 + ringLayer * 0.08;
    out[0] = -0.38 + Math.cos(ringAngle) * ringRadius;
    out[1] = 0.28 + breathY + Math.sin(ringAngle) * ringRadius;
    out[2] = 0.70 - ringLayer * 0.05;
    out[3] = 4;
    out[4] = 31;
    return;
  }
  const u = (p - 0.76) / 0.24;
  const cableIdx = Math.floor(u * 8);
  const cableT = (u * 8) % 1;
  const side = cableIdx % 2 === 0 ? -1 : 1;
  const rootX = side * (0.55 + (cableIdx / 8) * 0.40);
  const rootY = 0.65 - (cableIdx / 8) * 0.35 + breathY;
  const endX = side * (1.8 + (cableIdx / 8) * 0.6);
  const endY = -1.8 - (cableIdx / 8) * 0.4;
  const aSag = 0.42;

  out[1] = rootY + cableT * (endY - rootY) + aSag * (Math.cosh((cableT - 0.5) / aSag) - Math.cosh(0.5 / aSag));
  out[0] = rootX + cableT * (endX - rootX) + 0.05 * Math.sin(cableT * Math.PI) * Math.cos(t * 2.2 + cableIdx);
  out[2] = -0.1 - cableT * 0.8 + 0.12 * Math.sin(cableT * Math.PI) * Math.sin(t * 2.8 + cableIdx);

  const pulsePos = (t * 2.5 + cableIdx * 0.3) % 1.0;
  const isPulse = Math.abs(cableT - pulsePos) < 0.06;
  out[3] = isPulse ? 3 : (cableIdx % 2 === 0 ? 1 : 5);
  out[4] = isPulse ? 31 : 14;
}

// ACT 2: MEGACITY CANYON
function evaluateAct2(idx, t, out) {
  const p = idx / POINT_COUNT;
  if (p < 0.65) {
    const bldgCount = 12;
    const bIdx = Math.floor((p / 0.65) * bldgCount);
    const bP = ((p / 0.65) * bldgCount) % 1;
    const gx = ((bIdx % 4) - 1.5) * 1.5;
    const gz = (Math.floor(bIdx / 4) - 1.0) * 1.5;
    const hSeed = ((bIdx * 43 + 7) % 11) / 10;
    const bHeight = 1.0 + Math.pow(hSeed, 2.4) * 2.6;
    const corner = Math.floor(bP * 4);
    const cp = (bP * 4) % 1;
    const cx = (corner === 0 || corner === 3 ? -0.42 : 0.42);
    const cz = (corner === 0 || corner === 1 ? -0.42 : 0.42);
    const cy = -1.4 + cp * bHeight;

    const isWindowLit = ((Math.floor(cy * 8) * 7 + Math.floor(cx * 8) * 13 + bIdx) % 5) !== 0;
    out[0] = gx + cx;
    out[1] = cy;
    out[2] = gz + cz;
    if (cy > 0.6) {
      out[4] = cp > 0.92 ? 31 : (isWindowLit ? 30 : 25);
      out[3] = 1;
    } else if (cy < -0.5) {
      out[4] = isWindowLit ? 24 : 8;
      out[3] = isWindowLit ? 2 : 0;
    } else {
      out[4] = isWindowLit ? 26 : 10;
      out[3] = bIdx === 4 ? 2 : (isWindowLit ? 1 : 0);
    }
    return;
  }
  if (p < 0.85) {
    const u = (p - 0.65) / 0.20;
    const lane = Math.floor(u * 4);
    const lp = (u * 4 + t * 0.85) % 1;
    const isOutbound = lane % 2 === 0;
    const p0x = isOutbound ? -2.8 : 2.8;
    const p1x = isOutbound ? -0.5 : 0.5;
    const p2x = isOutbound ? 0.5 : -0.5;
    const p3x = isOutbound ? 2.8 : -2.8;
    const s = lp;
    out[0] = Math.pow(1 - s, 3) * p0x + 3 * Math.pow(1 - s, 2) * s * p1x + 3 * (1 - s) * s * s * p2x + Math.pow(s, 3) * p3x;
    out[1] = -0.6 + lane * 0.45 + Math.sin(s * Math.PI) * 0.15;
    out[2] = (lane - 1.5) * 1.3;
    out[3] = isOutbound ? 1 : 4;
    out[4] = isOutbound ? 31 : 10;
    return;
  }
  const u = (p - 0.85) / 0.15;
  const swAngle = t * 1.6;
  const rayR = u * 3.0;
  out[0] = Math.cos(swAngle) * rayR;
  out[1] = 1.9 - u * 3.2;
  out[2] = Math.sin(swAngle) * rayR;
  out[3] = 2;
  out[4] = 8;
}

// ACT 3: KINETIC SPACE COMBAT
function evaluateAct3(idx, t, out) {
  const p = idx / POINT_COUNT;
  const blastP = (t * 1.8) % 1.0;
  const frigateOriginX = 1.1;
  const frigateOriginY = 0.15;
  const frigateOriginZ = 1.8;

  if (p < 0.25) {
    const u = p / 0.25;
    const hx = -1.1 + Math.sin(t * 3.2) * 0.18;
    const hy = -0.2 + Math.cos(t * 2.6) * 0.18;
    const hz = 0.2;
    if (u < 0.35) {
      const nu = u / 0.35;
      out[0] = hx; out[1] = hy; out[2] = hz - 0.8 + nu * 1.6; out[3] = 1; out[4] = 31;
    } else {
      const tracerT = ((u - 0.35) / 0.65 + t * 5.0) % 1.0;
      const helixAngle = tracerT * Math.PI * 12 - t * 18;
      const helixRadius = 0.08 * (1 - tracerT);
      out[0] = hx + tracerT * 2.2 + Math.cos(helixAngle) * helixRadius;
      out[1] = hy + tracerT * 0.35 + Math.sin(helixAngle) * helixRadius;
      out[2] = hz + tracerT * 1.6;
      out[3] = 3; out[4] = 10;
    }
    return;
  }

  if (p < 0.45) {
    const u = (p - 0.25) / 0.20;
    const explosionT = Math.max(0, blastP - 0.12) / 0.88;
    const sedovR = Math.pow(explosionT, 0.40) * 3.4;
    const waveAngle = u * Math.PI * 16 + t * 4.0;
    const waveElev = Math.sin(u * Math.PI * 8) * 0.85;
    out[0] = frigateOriginX + Math.cos(waveAngle) * sedovR;
    out[1] = frigateOriginY + waveElev * sedovR;
    out[2] = frigateOriginZ + Math.sin(waveAngle) * sedovR;
    out[3] = explosionT < 0.25 ? 3 : (explosionT < 0.6 ? 4 : 1);
    out[4] = explosionT < 0.3 ? 31 : 24;
    return;
  }

  if (p < 0.80) {
    const u = (p - 0.45) / 0.35;
    if (blastP < 0.15) {
      const ribIdx = Math.floor(u * 8);
      const ribAngle = ((u * 8) % 1) * Math.PI * 2;
      out[0] = frigateOriginX + Math.cos(ribAngle) * (0.35 + ribIdx * 0.04);
      out[1] = frigateOriginY + Math.sin(ribAngle) * 0.25;
      out[2] = frigateOriginZ - 0.6 + (ribIdx / 8) * 1.2;
      out[3] = ribIdx === 4 ? 4 : 1;
      out[4] = 31;
    } else {
      const explosionT = (blastP - 0.15) / 0.85;
      const shardIdx = Math.floor(u * 48);
      const shardT = (u * 48) % 1;
      const phi = (shardIdx / 48) * Math.PI * 2;
      const theta = (shardT - 0.5) * Math.PI;
      const dirX = Math.cos(phi) * Math.cos(theta) * 0.7 + 0.3;
      const dirY = Math.sin(theta);
      const dirZ = Math.sin(phi) * Math.cos(theta) * 0.7 + 0.3;
      const blastRadius = Math.pow(explosionT, 0.45) * 3.4;
      const tumbleAngle = explosionT * (5.0 + (shardIdx % 9) * 3.0);
      out[0] = frigateOriginX + dirX * blastRadius + Math.sin(tumbleAngle) * 0.20;
      out[1] = frigateOriginY + dirY * blastRadius + Math.cos(tumbleAngle) * 0.20;
      out[2] = frigateOriginZ + dirZ * blastRadius;
      const isSpecularFlash = Math.cos(tumbleAngle + shardIdx) > 0.75;
      const isCookoff = explosionT > 0.35 && (shardIdx % 6 === 0);
      out[3] = isSpecularFlash ? 3 : (isCookoff ? 4 : (explosionT < 0.3 ? 3 : 5));
      out[4] = isSpecularFlash ? 31 : (isCookoff ? 30 : 25);
    }
    return;
  }

  const u = (p - 0.80) / 0.20;
  const cookIdx = Math.floor(u * 4);
  const cookT = (u * 4 + blastP * 2.0) % 1.0;
  const cookOffsets = [[-0.3, 0.1, -0.4], [0.4, -0.2, 0.3], [0.0, 0.0, 0.0], [-0.2, -0.3, 0.5]];
  const off = cookOffsets[cookIdx];
  const emberR = cookT * 1.4;
  out[0] = frigateOriginX + off[0] + Math.cos(cookT * Math.PI * 6 + cookIdx) * emberR;
  out[1] = frigateOriginY + off[1] + Math.sin(cookT * Math.PI * 6 + cookIdx) * emberR;
  out[2] = frigateOriginZ + off[2] + cookT * 0.6;
  out[3] = cookIdx === 2 ? 3 : (cookIdx === 1 ? 5 : 4);
  out[4] = 31;
}

// ACT 4: OMINOUS AI CORE
function evaluateAct4(idx, t, out) {
  const p = idx / POINT_COUNT;
  if (p < 0.35) {
    const u = p / 0.35;
    const blade = Math.floor(u * 12);
    const bp = (u * 12) % 1;
    const baseAngle = (blade / 12) * Math.PI * 2 + t * 0.45;
    const dilation = Math.sin(t * 2.8) * 0.22 + 0.65;
    const rOuter = 2.0;
    const rInner = dilation * 0.65;
    const curR = rInner + bp * (rOuter - rInner);
    const curAngle = baseAngle + bp * 0.75;
    out[0] = Math.cos(curAngle) * curR;
    out[1] = Math.sin(curAngle) * curR * 0.85;
    out[2] = 0.25 - bp * 0.35;
    out[3] = bp < 0.15 ? 3 : (bp > 0.85 ? 1 : 2);
    out[4] = bp < 0.15 ? 31 : 26;
    return;
  }
  if (p < 0.55) {
    const u = (p - 0.35) / 0.20;
    const ringAngle = u * Math.PI * 2 + t * 1.8;
    const rEinstein = 0.58 + Math.sin(t * 8.0 + u * 12.0) * 0.02;
    out[0] = Math.cos(ringAngle) * rEinstein;
    out[1] = Math.sin(ringAngle) * rEinstein * 0.85;
    out[2] = 0.40;
    out[3] = 3;
    out[4] = 31;
    return;
  }
  if (p < 0.75) {
    const u = (p - 0.55) / 0.20;
    const gearAngle = u * Math.PI * 2 - t * 0.35;
    const isTooth = Math.sin(u * Math.PI * 64) > 0;
    const rGear = isTooth ? 2.55 : 2.25;
    out[0] = Math.cos(gearAngle) * rGear;
    out[1] = Math.sin(gearAngle) * rGear * 0.75;
    out[2] = -0.25;
    out[3] = isTooth ? 3 : 1;
    out[4] = isTooth ? 31 : 1;
    return;
  }
  const u = (p - 0.75) / 0.25;
  const baseVortexAngle = u * Math.PI * 8 + t * 3.5;
  const rInfall = 0.40 + Math.pow(u, 0.65) * 2.8;
  const dragAngle = baseVortexAngle + 1.2 / (rInfall * rInfall + 0.1);
  const doppler = Math.cos(dragAngle);
  out[0] = Math.cos(dragAngle) * rInfall;
  out[1] = Math.sin(dragAngle) * rInfall * 0.65;
  out[2] = -0.5 + u * 1.6;
  out[3] = doppler > 0.3 ? 3 : (doppler < -0.3 ? 0 : 5);
  out[4] = (idx * 17 + Math.floor(t * 8)) % GLYPH_RAMP_32.length;
}

// ACT 5: TESSERA CORVETTE
function evaluateAct5(idx, t, out) {
  const p = idx / POINT_COUNT;
  const warpPhase = (t * 0.85) % 1.0;
  const beta = Math.min(0.992, warpPhase * 1.15);

  if (p < 0.40) {
    const u = p / 0.40;
    const pitchDrift = Math.sin(t * 1.5) * 0.06;
    const rollDrift = Math.cos(t * 1.2) * 0.08;

    if (u < 0.25) {
      const nu = u / 0.25;
      out[0] = (Math.sin(idx * 7) * 0.15) * (1 - nu);
      out[1] = 0.12 + Math.sin(nu * Math.PI) * 0.22 + pitchDrift;
      out[2] = 0.8 + nu * 1.6;
      out[3] = 3;
      out[4] = 31;
    } else if (u < 0.70) {
      const wu = (u - 0.25) / 0.45;
      const side = wu < 0.5 ? -1 : 1;
      const wp = (wu % 0.5) / 0.5;
      out[0] = side * (0.35 + wp * 2.4);
      out[1] = -wp * 0.22 + rollDrift * side;
      out[2] = 0.6 - wp * 2.0;
      out[3] = wp > 0.8 ? 3 : 1;
      out[4] = 31;
    } else {
      const cu = (u - 0.70) / 0.30;
      out[0] = 0;
      out[1] = 0.32 - cu * 0.12 + pitchDrift;
      out[2] = -0.5 + cu * 2.2;
      out[3] = 2;
      out[4] = 25;
    }
    return;
  }

  if (p < 0.60) {
    const u = (p - 0.40) / 0.20;
    const nozzleIdx = u < 0.5 ? -0.85 : 0.85;
    const plumeT = ((u % 0.5) / 0.5 * 4.0 + t * 7.5) % 1.0;
    const diamondPhase = plumeT * 4.0;
    const diamondNode = Math.floor(diamondPhase);
    const nodeFrac = diamondPhase % 1.0;
    const diamondR = (0.28 - diamondNode * 0.04) * Math.sin(nodeFrac * Math.PI) * (1.0 + Math.sin(t * 28) * 0.2);
    out[0] = nozzleIdx + Math.cos(plumeT * Math.PI * 8) * diamondR;
    out[1] = -0.05 + Math.sin(plumeT * Math.PI * 8) * diamondR;
    out[2] = -1.5 - plumeT * 3.2;
    out[3] = nodeFrac < 0.35 ? 3 : (beta > 0.7 ? 4 : 2);
    out[4] = nodeFrac < 0.3 ? 31 : 26;
    return;
  }

  if (p < 0.85) {
    const u = (p - 0.60) / 0.25;
    const ringIdx = Math.floor(u * 8);
    const ringT = (u * 8) % 1.0;
    const ringZ = ((ringIdx / 8 - warpPhase * 2.0) % 1.0 + 1.0) % 1.0;
    const zPos = -4.0 + ringZ * 6.5;

    const octAngle = Math.floor(ringT * 8) * (Math.PI / 4.0) + t * 0.4;
    const rBase = 1.6 * Math.cosh(zPos / 3.0);
    out[0] = Math.cos(octAngle) * rBase;
    out[1] = Math.sin(octAngle) * rBase * 0.75;
    out[2] = zPos;
    const isBreakout = ringZ > 0.82;
    out[3] = isBreakout ? 3 : (beta > 0.6 ? 4 : 1);
    out[4] = isBreakout ? 31 : 10;
    return;
  }

  const u = (p - 0.85) / 0.15;
  const warpAngle = u * Math.PI * 2 + t * 0.3;
  const rStar = 1.2 + ((idx * 19 + t * 8.5) % 3.0);
  out[0] = Math.cos(warpAngle) * rStar;
  out[1] = Math.sin(warpAngle) * rStar * 0.65;
  out[2] = -rStar - beta * 3.5;
  out[3] = beta > 0.8 ? 3 : (beta > 0.4 ? 4 : 1);
  out[4] = 31;
}

function projectInPlace(x, y, z, cx, cy, scale, yaw, pitch, roll, out, dist = 5.5) {
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const x1 = x * cosY + z * sinY;
  const y1 = y;
  const z1 = -x * sinY + z * cosY;

  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
  const x2 = x1;
  const y2 = y1 * cosP - z1 * sinP;
  const z2 = y1 * sinP + z1 * cosP;

  const cosR = Math.cos(roll), sinR = Math.sin(roll);
  const x3 = x2 * cosR - y2 * sinR;
  const y3 = x2 * sinR + y2 * cosR;
  const z3 = z2;

  const depth = z3 + dist;
  const pers = dist / Math.max(0.4, depth);
  out[0] = cx + x3 * scale * pers;
  out[1] = cy - y3 * scale * pers;
  out[2] = depth;
  out[3] = depth > 0.4 ? 1.0 : 0.0;
}

function renderFrame(timestamp) {
  if (!running) return;

  if (!startTime) startTime = timestamp;
  const dt = Math.min(0.05, (timestamp - (lastTime || timestamp)) / 1000);
  lastTime = timestamp;

  currentProgress += (targetProgress - currentProgress) * Math.min(1, dt * 6);

  const elapsed = (timestamp - startTime) / 1000;
  const loopTime = elapsed % 12.0;
  const rawAct = loopTime / 2.4;
  const actIdx = Math.floor(rawAct) % 5;
  const actPhase = rawAct % 1;

  // High-Voltage CRT Boot Flare Phase (< 0.40s)
  const bootPhase = elapsed < 0.40 ? (elapsed / 0.40) : 1.0;
  const bootExpandY = Math.pow(bootPhase, 3.5);

  // 2nd-Order Spring-Mass-Damper Kinematics for Camera Gyro Tilt
  const omegaN = 8.5;
  const zeta = 0.72;

  const timeSinceMove = (timestamp - gyroState[6]) / 1000;
  let targetYaw = gyroState[4];
  let targetPitch = gyroState[5];
  if (timeSinceMove > 2.0) {
    const idleWeight = Math.min(1.0, (timeSinceMove - 2.0) * 0.5);
    const idleYaw = 0.08 * Math.sin(0.42 * elapsed);
    const idlePitch = 0.05 * Math.cos(0.28 * elapsed);
    targetYaw = targetYaw * (1.0 - idleWeight) + idleYaw * idleWeight;
    targetPitch = targetPitch * (1.0 - idleWeight) + idlePitch * idleWeight;
  }

  const accelYaw = -omegaN * omegaN * (gyroState[0] - targetYaw) - 2 * zeta * omegaN * gyroState[2];
  const accelPitch = -omegaN * omegaN * (gyroState[1] - targetPitch) - 2 * zeta * omegaN * gyroState[3];
  gyroState[2] += accelYaw * dt;
  gyroState[3] += accelPitch * dt;
  gyroState[0] += gyroState[2] * dt;
  gyroState[1] += gyroState[3] * dt;

  const rSlewSpeed = 6.5 * dt;
  gyroState[7] += (targetYaw * 3.5 - gyroState[7]) * rSlewSpeed;
  gyroState[8] += (targetPitch * 3.5 - gyroState[8]) * rSlewSpeed;

  const morphStart = 0.70;
  let tau = 0.0;
  if (actPhase >= morphStart) {
    tau = (actPhase - morphStart) / (1.0 - morphStart);
  }
  const smootherstep = tau * tau * tau * (tau * (tau * 6 - 15) + 10);
  const turbWeight = 4.0 * tau * (1.0 - tau) * Math.sin(Math.PI * tau);

  const nextActIdx = (actIdx + 1) % 5;

  const cx = width * 0.5 + gyroState[0] * width * 0.12;
  const cy = height * 0.48 + gyroState[1] * height * 0.12;
  const scale = Math.min(width, height) * 0.28;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#02050a';
  ctx.fillRect(0, 0, width, height);

  // 1. Reset Current Frame Luminance Buffer
  for (let i = 0; i < TOTAL_CELLS; i++) {
    currentLuminance[i] = 0.0;
    cellChars[i] = 0;
    cellColors[i] = 0;
  }

  // 2. Matrix Code Rain Down Background Columns
  for (let c = 0; c < RAIN_COLS; c++) {
    if (!reducedMotion) {
      rainY[c] += rainSpeed[c] * dt * 0.8;
      if (rainY[c] > 1.2) rainY[c] = -0.2;
    }
    const colX = Math.floor((c / RAIN_COLS) * GRID_COLS);
    const headRow = Math.floor(rainY[c] * GRID_ROWS);
    for (let r = 0; r < 8; r++) {
      const curRow = headRow - r;
      if (curRow >= 0 && curRow < GRID_ROWS) {
        const cellIdx = curRow * GRID_COLS + colX;
        if (cellIdx < TOTAL_CELLS) {
          const rainL = (1.0 - r / 8) * 0.65;
          currentLuminance[cellIdx] = Math.max(currentLuminance[cellIdx], rainL);
          cellChars[cellIdx] = (c * 7 + r * 13 + Math.floor(timestamp * 0.005)) % GLYPH_RAMP_32.length;
          cellColors[cellIdx] = r === 0 ? 3 : 2;
        }
      }
    }
  }

  let camYaw = (timestamp * 0.00045) + gyroState[0];
  let camPitch = 0.15 + Math.sin(timestamp * 0.0008) * 0.08 + gyroState[1];
  let camRoll = -0.05 + Math.cos(timestamp * 0.0006) * 0.04;

  if (reducedMotion) {
    camYaw = 0.35;
    camPitch = 0.15;
    camRoll = 0.0;
  }

  // 3. 3D LIDAR Scene Particle Sampling with Zero-Allocation Morphing
  for (let i = 0; i < POINT_COUNT; i++) {
    switch (actIdx) {
      case 0: evaluateAct1(i, loopTime, evalScratch1); break;
      case 1: evaluateAct2(i, loopTime, evalScratch1); break;
      case 2: evaluateAct3(i, loopTime, evalScratch1); break;
      case 3: evaluateAct4(i, loopTime, evalScratch1); break;
      default: evaluateAct5(i, loopTime, evalScratch1); break;
    }
    switch (nextActIdx) {
      case 0: evaluateAct1(i, loopTime, evalScratch2); break;
      case 1: evaluateAct2(i, loopTime, evalScratch2); break;
      case 2: evaluateAct3(i, loopTime, evalScratch2); break;
      case 3: evaluateAct4(i, loopTime, evalScratch2); break;
      default: evaluateAct5(i, loopTime, evalScratch2); break;
    }

    const baseX = evalScratch1[0] + (evalScratch2[0] - evalScratch1[0]) * smootherstep;
    const baseY = evalScratch1[1] + (evalScratch2[1] - evalScratch1[1]) * smootherstep;
    const baseZ = evalScratch1[2] + (evalScratch2[2] - evalScratch1[2]) * smootherstep;

    let tx = baseX;
    let ty = baseY;
    let tz = baseZ;

    if (turbWeight > 0.001 && !reducedMotion) {
      computeCurlNoise(baseX * 0.75, baseY * 0.75, baseZ * 0.75, timestamp * 0.001, curlScratch);
      const turbAmp = 0.45 * turbWeight;
      tx += curlScratch[0] * turbAmp;
      ty += curlScratch[1] * turbAmp;
      tz += curlScratch[2] * turbAmp;
    }

    if (!reducedMotion) {
      ptX[i] += (tx - ptX[i]) * Math.min(1, dt * 8.0);
      ptY[i] += (ty - ptY[i]) * Math.min(1, dt * 8.0);
      ptZ[i] += (tz - ptZ[i]) * Math.min(1, dt * 8.0);
    } else {
      ptX[i] = tx;
      ptY[i] = ty;
      ptZ[i] = tz;
    }

    const col = smootherstep > 0.5 ? evalScratch2[3] : evalScratch1[3];
    const glyph = smootherstep > 0.5 ? evalScratch2[4] : evalScratch1[4];

    projectInPlace(ptX[i], ptY[i], ptZ[i], cx, cy, scale, camYaw, camPitch, camRoll, projScratch);
    if (projScratch[3] > 0.5 && projScratch[0] >= 0 && projScratch[0] < width && projScratch[1] >= 0 && projScratch[1] < height) {
      const gridX = Math.floor((projScratch[0] / width) * GRID_COLS);
      const gridY = Math.floor((projScratch[1] / height) * GRID_ROWS);
      if (gridX >= 0 && gridX < GRID_COLS && gridY >= 0 && gridY < GRID_ROWS) {
        const cellIdx = gridY * GRID_COLS + gridX;
        const depthAlpha = Math.max(0.35, Math.min(1.0, 1.4 - projScratch[2] / 6.5));
        currentLuminance[cellIdx] = Math.max(currentLuminance[cellIdx], depthAlpha);
        cellChars[cellIdx] = glyph % GLYPH_RAMP_32.length;
        cellColors[cellIdx] = col;
      }
    }
  }

  // 4. Dynamic In-Grid Micro-HUD Telemetry Overlays
  const hexOffset = Math.floor(timestamp * 0.015) % 256;
  for (let r = 2; r < 20; r++) {
    const addr = (0x7F00 + r * 4 + hexOffset).toString(16).toUpperCase();
    const b1 = ((r * 37 + hexOffset) % 256).toString(16).padStart(2, '0').toUpperCase();
    const b2 = ((r * 53 + hexOffset * 2) % 256).toString(16).padStart(2, '0').toUpperCase();
    blitText(\`\${addr}:\${b1}\${b2}\`, GRID_COLS - 13, r, 0, 0.25);
  }

  if (actIdx === 0) {
    blitText('[BIO_FEED // GHOST_IN_THE_WIRE]', 3, 2, 2, 0.85);
    blitText('OCULAR_SYNC: 99.4% [LOCKED]', 3, 3, 1, 0.65);
    blitText('HR: 42 BPM // SYNAPSE: NOMINAL', 3, 4, 0, 0.45);
  } else if (actIdx === 1) {
    blitText('[SECTOR_09 // METROPOLIS_SURVEILLANCE]', 3, 2, 2, 0.85);
    blitText('ELEV: +1420m // DENSITY: 1.48e5/km²', 3, 3, 1, 0.65);
    blitText('SKYWAY_AV_CORRIDOR: 4-LANE ACTIVE', 3, 4, 4, 0.55);
  } else if (actIdx === 2) {
    const rng = Math.max(0.2, (4.2 - (loopTime % 2.4) * 1.8)).toFixed(2);
    blitText('[TGT_LOCK: HOSTILE_FRIGATE]', 3, 2, 4, 0.95);
    blitText(\`RNG: \${rng}km // REL_V: +340m/s\`, 3, 3, 3, 0.85);
    blitText('KINETIC_RAILGUN: DISCHARGED', 3, 4, 4, 0.65);
  } else if (actIdx === 3) {
    blitText('[AI_CORE: NUCLEUS-09 // OMNI_IRIS]', 3, 2, 2, 0.85);
    blitText('APERTURE_FLUX: 4.82 PPa // SINGULARITY', 3, 3, 1, 0.65);
    blitText('INGESTION_RATE: 1.44 PB/s', 3, 4, 5, 0.55);
  } else {
    blitText('[VESSEL: TESSERA-MK3 // CORVETTE]', 3, 2, 2, 0.85);
    blitText('WARP_SPOOL: [██████████░░] 84.6%', 3, 3, 3, 0.85);
    blitText('NAV_VECTOR: [SEC_07 // HELIOS_GATE]', 3, 4, 1, 0.65);
  }

  // Tactical Reticle Follower
  const retGridX = Math.floor(GRID_COLS * 0.5 + gyroState[7] * 18);
  const retGridY = Math.floor(GRID_ROWS * 0.5 + gyroState[8] * 12);
  if (retGridX >= 2 && retGridX < GRID_COLS - 3 && retGridY >= 2 && retGridY < GRID_ROWS - 2) {
    blitText('[+]', retGridX - 1, retGridY, 3, 0.95);
  }

  // 5. Physical P31 CRT Dual-Component Exponential Decay & 5-Point Diffusion
  const decayFactorFast = Math.exp(-14.0 * dt);
  const decayFactorSlow = Math.exp(-2.2 * dt);

  for (let i = 0; i < TOTAL_CELLS; i++) {
    const prevD = persistentDecay[i];
    const decayed = prevD * (0.75 * decayFactorFast + 0.25 * decayFactorSlow);
    persistentDecay[i] = Math.max(currentLuminance[i], decayed);
  }

  const kappa = 0.035;
  for (let r = 0; r < GRID_ROWS; r++) {
    const rowOffset = r * GRID_COLS;
    const upRow = r > 0 ? (r - 1) * GRID_COLS : rowOffset;
    const downRow = r < GRID_ROWS - 1 ? (r + 1) * GRID_COLS : rowOffset;

    for (let c = 0; c < GRID_COLS; c++) {
      const idx = rowOffset + c;
      const leftIdx = rowOffset + (c > 0 ? c - 1 : c);
      const rightIdx = rowOffset + (c < GRID_COLS - 1 ? c + 1 : c);
      const upIdx = upRow + c;
      const downIdx = downRow + c;

      const centerD = persistentDecay[idx];
      const sumNeighbors = persistentDecay[leftIdx] + persistentDecay[rightIdx] + persistentDecay[upIdx] + persistentDecay[downIdx];
      diffuseScratch[idx] = (1.0 - 4.0 * kappa) * centerD + kappa * sumNeighbors;
    }
  }

  // 6. CRT Spherical Distortion & Multi-Channel Spectral Phosphor Grading
  const cellW = width / GRID_COLS;
  const cellH = height / GRID_ROWS;
  const frameSeed = Math.floor(timestamp * 0.06);
  const activePalette = SCENE_PALETTES[actIdx];

  ctx.font = 'bold 9px "IBM Plex Mono", "Consolas", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let r = 0; r < GRID_ROWS; r++) {
    const bayerRow = (r % 4) * 4;
    const driftY = Math.sin(0.11 * r + 0.35 * (timestamp * 0.001));

    // Boot Flare vertical expansion mask
    const normRow = Math.abs((r / GRID_ROWS) - 0.5) * 2.0;
    if (normRow > bootExpandY) continue;

    for (let c = 0; c < GRID_COLS; c++) {
      const idx = r * GRID_COLS + c;
      const activeL = currentLuminance[idx];
      const ghostL = diffuseScratch[idx];
      const fgE = Math.max(activeL, ghostL * 0.85);

      const thermalGrain = fastHash31(c, r, frameSeed);
      const atmosphericDrift = 0.5 + 0.3 * Math.sin(0.07 * c + driftY) + 0.2 * Math.cos(0.14 * c - 0.08 * r - timestamp * 0.0002);
      const ambientNoise = (0.65 * thermalGrain + 0.35 * atmosphericDrift);
      const combinedE = (fgE + (0.015 + 0.042 * ambientNoise) * (1.0 - fgE)) * crtVignette[idx];

      const dither = BAYER_4X4[bayerRow + (c % 4)] * 0.035;
      const perceptualI = Math.max(0, Math.min(1, Math.pow(combinedE, 1.85) + dither));
      let rampIdx = Math.min(31, Math.floor(perceptualI * 31.99));

      let colIdx = cellColors[idx];
      if (combinedE > 0.82) {
        colIdx = 3;
      } else if (activeL < 0.05 && ghostL > 0.04) {
        colIdx = 0;
      } else if (activeL < 0.05) {
        colIdx = thermalGrain > 0.75 ? 2 : 0;
      }

      if (rampIdx > 0) {
        // CRT Barrel Curvature mapping
        const uDist = crtDistortX[idx];
        const vDist = crtDistortY[idx];
        if (Math.abs(uDist) <= 1.0 && Math.abs(vDist) <= 1.0) {
          const x = (uDist * 0.5 + 0.5) * width;
          const y = (vDist * 0.5 + 0.5) * height;
          ctx.fillStyle = colIdx === 3 ? '#ffffff' : activePalette[colIdx];
          ctx.fillText(GLYPH_RAMP_32[rampIdx], x, y);
        }
      }
    }
  }

  // 7. Horizontal LIDAR Laser Scanline Beam & CRT Retrace Line
  const scanlineY = ((timestamp * 0.00085) % 1) * height;
  ctx.strokeStyle = 'rgba(122, 247, 208, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, scanlineY);
  ctx.lineTo(width, scanlineY);
  ctx.stroke();

  // 8. Waveform Oscilloscope
  if (waveCtx) {
    waveCtx.clearRect(0, 0, waveW, waveH);
    waveCtx.strokeStyle = '#7af7d0';
    waveCtx.lineWidth = 1.4;
    waveCtx.beginPath();
    const t = timestamp * 0.007;
    const midY = waveH * 0.38;
    const amp = waveH * 0.28;
    for (let x = 0; x < waveW; x += 3) {
      const k = x * 0.09;
      const y = midY + Math.sin(k + t) * amp * 0.65 + Math.sin(k * 2.3 - t * 1.4) * amp * 0.25;
      if (x === 0) waveCtx.moveTo(x, y);
      else waveCtx.lineTo(x, y);
    }
    waveCtx.stroke();

    const bars = 16;
    const bw = Math.floor((waveW - 8) / bars);
    for (let b = 0; b < bars; b++) {
      const bx = 4 + b * bw;
      const fh = Math.max(2, (waveH * 0.28) * (Math.sin(timestamp * 0.009 + b * 0.55) * 0.5 + 0.5));
      waveCtx.fillStyle = b % 3 === 0 ? 'rgba(122, 247, 208, 0.85)' : 'rgba(78, 195, 230, 0.65)';
      waveCtx.fillRect(bx, waveH - 2 - fh, bw - 2, fh);
    }
  }

  requestAnimationFrame(renderFrame);
}

self.onmessage = function(e) {
  const msg = e.data;
  if (!msg) return;
  if (msg.type === 'init') {
    canvas = msg.canvas;
    waveCanvas = msg.waveformCanvas;
    width = msg.width || 640;
    height = msg.height || 380;
    waveW = msg.waveWidth || 200;
    waveH = msg.waveHeight || 48;
    reducedMotion = !!msg.reducedMotion;
    ctx = canvas.getContext('2d');
    if (waveCanvas) waveCtx = waveCanvas.getContext('2d');
    running = true;
    requestAnimationFrame(renderFrame);
  } else if (msg.type === 'progress') {
    targetProgress = Math.max(0, Math.min(1, Number(msg.progress) || 0));
  } else if (msg.type === 'pointer') {
    gyroState[4] = Math.max(-1.0, Math.min(1.0, Number(msg.x) || 0)) * 0.25;
    gyroState[5] = Math.max(-1.0, Math.min(1.0, Number(msg.y) || 0)) * 0.18;
    gyroState[6] = performance.now();
  } else if (msg.type === 'stop') {
    running = false;
  }
};
`;

let activeTerminalInstance = null;

export function createTerminalArtwork({
  canvas,
  waveformCanvas,
  overlay,
  document: doc = globalThis.document,
} = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    return {
      updateProgress() {},
      start() {},
      stop() {},
      destroy() {},
    };
  }

  // Idempotent PER CANVAS. This element is set up from two places: the inline module in
  // index.html (bootstrapLoadingTerminal) and createLoadingPresenter, which calls this factory
  // DIRECTLY and so skips the activeTerminalInstance guard below. Setting the same canvas up
  // twice is fatal, not merely wasteful, because transferControlToOffscreen is irreversible.
  // This hung the game on the loading screen for two days. Pinned by
  // test/loading-boot-resilience.test.mjs -- do not remove it in a rewrite.
  if (canvas.__sfTerminalArt) return canvas.__sfTerminalArt;

  let running = false;
  let worker = null;
  let workerUrl = null;
  let animFrameId = null;
  let startTime = 0;
  let lastTime = 0;
  let currentProgress = 0.05;
  let targetProgress = 0.05;
  let currentStageId = 'loading';

  function isReducedMotion() {
    if (!doc) return false;
    try {
      if (doc.documentElement && doc.documentElement.classList.contains('sf-reduce-motion')) return true;
      if (globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    } catch {}
    return false;
  }

  let offscreenSupported = false;
  try {
    if (
      typeof globalThis.Worker === 'function' &&
      typeof globalThis.Blob === 'function' &&
      typeof canvas.transferControlToOffscreen === 'function'
    ) {
      const offscreen = canvas.transferControlToOffscreen();
      canvas.__sfTransferred = true;   // irreversible from this line on
      const offscreenWave = waveformCanvas && typeof waveformCanvas.transferControlToOffscreen === 'function'
        ? waveformCanvas.transferControlToOffscreen()
        : null;
      if (offscreenWave) waveformCanvas.__sfTransferred = true;

      const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
      workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);

      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 640, height: 380 };
      const w = Math.round((rect.width || 640) * dpr);
      const h = Math.round((rect.height || 380) * dpr);

      const transferList = [offscreen];
      if (offscreenWave) transferList.push(offscreenWave);

      worker.postMessage(
        {
          type: 'init',
          canvas: offscreen,
          waveformCanvas: offscreenWave,
          width: w,
          height: h,
          waveWidth: 200,
          waveHeight: 48,
          reducedMotion: isReducedMotion(),
        },
        transferList
      );

      offscreenSupported = true;
    }
  } catch (err) {
    offscreenSupported = false;
  }

  function onPointerMove(e) {
    if (!worker || !canvas) return;
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const nx = ((e.clientX - rect.left) / rect.width) * 2.0 - 1.0;
    const ny = ((e.clientY - rect.top) / rect.height) * 2.0 - 1.0;
    worker.postMessage({ type: 'pointer', x: nx, y: ny });
  }

  if (overlay && typeof overlay.addEventListener === 'function') {
    overlay.addEventListener('pointermove', onPointerMove, { passive: true });
  }

  // `transferred` is tracked SEPARATELY from `offscreenSupported`. The transfer is the
  // irreversible step; everything after it (Blob, Worker, postMessage) can still fail, and when
  // it does offscreenSupported goes false while the canvas is already gone. Calling getContext
  // here then throws InvalidStateError straight out of the boot path. There is no context to
  // fall back to once control has been handed over -- the honest answer is null.
  const canUse2d = (el) => !!el && !el.__sfTransferred && typeof el.getContext === 'function';
  const ctx = !offscreenSupported && canUse2d(canvas) ? canvas.getContext('2d') : null;

  let lastDomTime = 0;
  function updateTelemetry(time) {
    if (time - lastDomTime < 90) return;
    lastDomTime = time;
    if (!overlay || typeof overlay.querySelector !== 'function') return;

    const clockEl = overlay.querySelector('[data-loading-clock]');
    if (clockEl) {
      const elapsed = (time - startTime) / 1000;
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(Math.floor(elapsed % 60)).padStart(2, '0');
      const ms = String(Math.floor((elapsed * 10) % 10));
      clockEl.textContent = `00:${mins}:${secs}.${ms}`;
    }

    const elapsed = (time - startTime) / 1000;
    const rawAct = (elapsed % 12.0) / 2.4;
    const actIdx = Math.floor(rawAct) % 5;

    const actTitles = [
      'NEURAL_BIOFEED // GHOST_IN_THE_WIRE',
      'SECTOR_09 // LIDAR_METROPOLIS',
      'KINETIC_COMBAT // INTERCEPT_DOGFIGHT',
      'AI_CORE // OMNI_IRIS_SYNTHESIS',
      'TESSERA_CORVETTE // HYPERDRIVE_IGNITION',
    ];

    const diagStreamEl = overlay.querySelector('[data-loading-diag-stream]');
    if (diagStreamEl) {
      const actLogs = [
        '[ACT_01] NEURAL_BIOFEED // GHOST_IN_THE_WIRE',
        '[ACT_02] SECTOR_09 // LIDAR_METROPOLIS_SURVEILLANCE',
        '[ACT_03] KINETIC_COMBAT // INTERCEPT_DOGFIGHT',
        '[ACT_04] AI_CORE_APERTURE // OMNI_IRIS_SYNTHESIS',
        '[ACT_05] TESSERA_CORVETTE // HYPERDRIVE_IGNITION',
      ];
      let html = '';
      for (let i = 0; i < actLogs.length; i++) {
        if (i < actIdx) {
          html += `<div class="boot-diag-line is-done"><span class="diag-tag">[OK]</span> ${actLogs[i]}</div>`;
        } else if (i === actIdx) {
          html += `<div class="boot-diag-line is-done is-latest"><span class="diag-tag">[⌖]</span> ${actLogs[i]}</div>`;
        } else {
          html += `<div class="boot-diag-line is-pending"><span class="diag-tag">[..]</span> ${actLogs[i]}</div>`;
        }
      }
      diagStreamEl.innerHTML = html;
    }

    const hexEl = overlay.querySelector('[data-loading-hex]');
    if (hexEl) {
      const baseAddr = 0x7fa0 + Math.floor((time / 160) % 64) * 0x10;
      const b1 = Math.floor(Math.sin(time * 0.003 + 1) * 127 + 128).toString(16).padStart(2, '0').toUpperCase();
      const b2 = Math.floor(Math.cos(time * 0.005 + 2) * 127 + 128).toString(16).padStart(2, '0').toUpperCase();
      hexEl.textContent = `0x${baseAddr.toString(16).toUpperCase()}: ${b1} ${b2} 53 46 20 4C 49 44 41 52 20 4F 4E`;
    }

    const subsysEl = overlay.querySelector('[data-loading-subsystems]');
    if (subsysEl) {
      const p = currentProgress;
      const pwr = Math.round(Math.min(100, 52 + p * 48));
      const ion = Math.round(Math.min(100, 20 + p * 80));
      const opt = Math.round(Math.min(100, 30 + p * 70));
      const nav = Math.round(Math.min(100, 40 + p * 60));

      const renderLedBar = (pct) => {
        const segs = 14;
        const activeCount = Math.round((pct / 100) * segs);
        let barHtml = '<div class="subsys-led-bar">';
        for (let s = 0; s < segs; s++) {
          const cls = s < activeCount ? 'subsys-seg active' : 'subsys-seg';
          barHtml += `<span class="${cls}"></span>`;
        }
        barHtml += '</div>';
        return barHtml;
      };

      subsysEl.innerHTML = `
        <div class="boot-subsys-row"><span class="subsys-name">PWR_CORE</span>${renderLedBar(pwr)}<span class="subsys-val">${pwr}%</span></div>
        <div class="boot-subsys-row"><span class="subsys-name">AVIONICS</span>${renderLedBar(ion)}<span class="subsys-val">${ion}%</span></div>
        <div class="boot-subsys-row"><span class="subsys-name">OPT_ARRAY</span>${renderLedBar(opt)}<span class="subsys-val">${opt}%</span></div>
        <div class="boot-subsys-row"><span class="subsys-name">NAV_LINK</span>${renderLedBar(nav)}<span class="subsys-val">${nav}%</span></div>
      `;
    }

    const segsEl = overlay.querySelector('[data-loading-segments]');
    const pctEl = overlay.querySelector('[data-loading-pct]');
    const stageNameEl = overlay.querySelector('[data-loading-stage-name]');
    if (segsEl) {
      const count = 28;
      const filled = Math.round(currentProgress * count);
      segsEl.textContent = `[${'█'.repeat(filled)}${'.'.repeat(Math.max(0, count - filled))}]`;
    }
    if (pctEl) pctEl.textContent = `${Math.round(currentProgress * 100)}%`;
    if (stageNameEl) stageNameEl.textContent = actTitles[actIdx];
  }

  const safeRaf = typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : (fn) => setTimeout(() => fn(Date.now()), 16);
  const safeCancelRaf = typeof globalThis.cancelAnimationFrame === 'function'
    ? globalThis.cancelAnimationFrame.bind(globalThis)
    : (id) => clearTimeout(id);

  function fallbackRenderFrame(timestamp) {
    if (!running) return;
    if (!startTime) startTime = timestamp;
    lastTime = timestamp;

    if (ctx) {
      const w = canvas.width || 640;
      const h = canvas.height || 380;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#02050a';
      ctx.fillRect(0, 0, w, h);
    }

    updateTelemetry(timestamp);
    animFrameId = safeRaf(fallbackRenderFrame);
  }

  const instance = {
    start() {
      if (running) return;
      running = true;
      startTime = 0;
      lastTime = 0;
      if (!offscreenSupported) {
        animFrameId = safeRaf(fallbackRenderFrame);
      } else {
        const telemetryLoop = (ts) => {
          if (!running) return;
          if (!startTime) startTime = ts;
          updateTelemetry(ts);
          animFrameId = safeRaf(telemetryLoop);
        };
        animFrameId = safeRaf(telemetryLoop);
      }
    },
    stop() {
      running = false;
      if (overlay && typeof overlay.removeEventListener === 'function') {
        overlay.removeEventListener('pointermove', onPointerMove);
      }
      if (animFrameId != null) {
        safeCancelRaf(animFrameId);
        animFrameId = null;
      }
      if (worker) {
        worker.postMessage({ type: 'stop' });
      }
    },
    updateProgress(stage = {}) {
      targetProgress = Math.max(0, Math.min(1, Number(stage.progress) || 0));
      currentStageId = String(stage.id || 'loading');
      if (worker) {
        worker.postMessage({ type: 'progress', progress: targetProgress, id: currentStageId });
      }
    },
    destroy() {
      this.stop();
      if (worker) {
        try { worker.terminate(); } catch {}
        worker = null;
      }
      if (workerUrl) {
        try { URL.revokeObjectURL(workerUrl); } catch {}
        workerUrl = null;
      }
      if (activeTerminalInstance === this) {
        activeTerminalInstance = null;
      }
      // Release the per-canvas guard so a genuine re-mount can rebuild. The canvas keeps its
      // __sfTransferred mark: that fact never becomes untrue.
      if (canvas && canvas.__sfTerminalArt === this) canvas.__sfTerminalArt = null;
    },
  };

  activeTerminalInstance = instance;
  if (canvas) canvas.__sfTerminalArt = instance;
  return instance;
}

export function bootstrapLoadingTerminal(document = globalThis.document) {
  if (!document || typeof document.getElementById !== 'function') return null;
  if (activeTerminalInstance) return activeTerminalInstance;

  const canvas = document.getElementById('boot-terminal-canvas');
  const waveformCanvas = document.getElementById('boot-waveform-canvas');
  const overlay = document.getElementById('boot-overlay');

  if (!canvas) return null;
  const instance = createTerminalArtwork({ canvas, waveformCanvas, overlay, document });
  instance.start();
  return instance;
}
