/**
 * SpaceFace · Cyberpunk Solid-Raster Dot-Matrix & ASCII Artwork Engine
 *
 * Full-screen, dense, high-contrast 120x60 phosphor raster animation featuring:
 * 1. Eerie cybernetic female android with detailed facial contours, blinking eye, glowing cybernetic eye, and cranial cables.
 * 2. 3D Megacity canyon with solid skyscrapers, illuminated window grids, flying AVs with light trails, and searchlights.
 * 3. Deep-space kinetic dogfight with detailed ship hulls, laser beams, missile detonations, and tumbling debris.
 * 4. Ominous AI Core / Dyson aperture with interlocking iris blades, central glowing pupil, and rotating runic rings.
 * 5. Tessera corvette entering hyper-warp with mach shock diamond thruster plumes, warp tunnel rings, and star streaks.
 */

const WORKER_SCRIPT = `
const COLS = 120;
const ROWS = 60;
const TOTAL_CELLS = COLS * ROWS;

const CHAR_DENSITY = [
  ' ', '·', '.', ':', ';', '+', '=', 'x', '*', '#',
  '%', '■', '░', '▒', '▓', '▀', '▄', '█'
];

const SCENE_PALETTES = [
  // Scene 1: Biomechanical Android (Emerald, Cyan, Violet, Core White)
  ['#041a16', '#0d5c48', '#14a37f', '#4ef0c0', '#b48cff', '#ffffff'],
  // Scene 2: Megacity Canyon (Dark Charcoal, Deep Amber, Neon Gold, Hot Magenta, White)
  ['#140d04', '#4a2c08', '#b86e00', '#ffb700', '#ff0066', '#ffffff'],
  // Scene 3: Kinetic Dogfight (Deep Navy, Electric Cyan, Incendiary Orange, Fiery Red, White)
  ['#060a18', '#0077b6', '#00e5ff', '#ff5500', '#ff2200', '#ffffff'],
  // Scene 4: Ominous AI Core (Abyssal Void, Royal Purple, Neon Violet, Crimson Flare, White)
  ['#0a0414', '#3d0c5a', '#8a2be2', '#c77dff', '#ff0055', '#ffffff'],
  // Scene 5: Hyper-Warp Corvette (Midnight Cyan, Deep Azure, Vasimr Cyan, Plasma Lime, White)
  ['#04121a', '#004b75', '#00b4d8', '#7df9ff', '#39ff14', '#ffffff']
];

// Framebuffer buffers (allocated once, zero GC)
const lumBuffer = new Float32Array(TOTAL_CELLS);
const colorBuffer = new Uint8Array(TOTAL_CELLS);
const decayBuffer = new Float32Array(TOTAL_CELLS);
const glyphBuffer = new Uint8Array(TOTAL_CELLS);

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

// 2nd-order gyro state
let gyroX = 0, gyroY = 0, targetGyroX = 0, targetGyroY = 0;

// Raster Helper Functions
function clearFrame() {
  lumBuffer.fill(0);
  colorBuffer.fill(0);
  glyphBuffer.fill(0);
}

function setPixel(x, y, lum, colorIdx, glyphIdx = -1) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || ix >= COLS || iy < 0 || iy >= ROWS) return;
  const idx = iy * COLS + ix;
  if (lum > lumBuffer[idx]) {
    lumBuffer[idx] = Math.min(1.0, lum);
    colorBuffer[idx] = colorIdx;
    if (glyphIdx >= 0) glyphBuffer[idx] = glyphIdx;
  }
}

function drawLine(x0, y0, x1, y1, lum, colorIdx, glyphIdx = -1) {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let cx = x0;
  let cy = y0;
  while (true) {
    setPixel(cx, cy, lum, colorIdx, glyphIdx);
    if (Math.abs(cx - x1) < 0.5 && Math.abs(cy - y1) < 0.5) break;
    let e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
}

function fillRect(x0, y0, w, h, lum, colorIdx, glyphIdx = -1) {
  const minX = Math.max(0, Math.floor(x0));
  const maxX = Math.min(COLS - 1, Math.floor(x0 + w));
  const minY = Math.max(0, Math.floor(y0));
  const maxY = Math.min(ROWS - 1, Math.floor(y0 + h));

  for (let y = minY; y <= maxY; y++) {
    const rowOff = y * COLS;
    for (let x = minX; x <= maxX; x++) {
      const idx = rowOff + x;
      if (lum > lumBuffer[idx]) {
        lumBuffer[idx] = lum;
        colorBuffer[idx] = colorIdx;
        if (glyphIdx >= 0) glyphBuffer[idx] = glyphIdx;
      }
    }
  }
}

function fillCircle(cx, cy, r, lum, colorIdx, aspect = 0.5) {
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(COLS - 1, Math.ceil(cx + r));
  const rY = r * aspect;
  const minY = Math.max(0, Math.floor(cy - rY));
  const maxY = Math.min(ROWS - 1, Math.ceil(cy + rY));

  for (let y = minY; y <= maxY; y++) {
    const dy = (y - cy) / aspect;
    const dy2 = dy * dy;
    const rowOff = y * COLS;
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const d2 = dx * dx + dy2;
      if (d2 <= r * r) {
        const falloff = 1.0 - (d2 / (r * r)) * 0.4;
        const finalLum = lum * falloff;
        const idx = rowOff + x;
        if (finalLum > lumBuffer[idx]) {
          lumBuffer[idx] = finalLum;
          colorBuffer[idx] = colorIdx;
        }
      }
    }
  }
}

function drawText(str, startX, startY, colorIdx, lum = 0.95) {
  for (let i = 0; i < str.length; i++) {
    const x = startX + i;
    if (x >= COLS) break;
    if (startY < 0 || startY >= ROWS) break;
    const idx = startY * COLS + x;
    lumBuffer[idx] = Math.max(lumBuffer[idx], lum);
    colorBuffer[idx] = colorIdx;
  }
}

// -------------------------------------------------------------
// SCENE 1: EERIE CYBERNETIC FEMALE ANDROID
// -------------------------------------------------------------
function renderScene1(t) {
  const cx = 60 + gyroX * 8;
  const cy = 30 + gyroY * 5;
  const breath = Math.sin(t * 1.4) * 0.8;

  // Background subtle neural matrix grid
  for (let y = 4; y < ROWS - 4; y += 4) {
    for (let x = 6; x < COLS - 6; x += 6) {
      setPixel(x, y, 0.12, 1, 1);
    }
  }

  // Head Silhouette & Shading (Solid Face Contour)
  const headW = 19;
  const headH = 24;
  for (let y = -headH; y <= headH; y++) {
    const normY = y / headH;
    // Egg/jaw shape equation
    let wAtY = Math.sqrt(Math.max(0, 1.0 - normY * normY)) * headW;
    if (normY > 0.1) {
      // Taper to jaw
      wAtY *= (1.0 - (normY - 0.1) * 0.48);
    } else if (normY < -0.3) {
      // Cranial dome
      wAtY *= (1.0 - (-normY - 0.3) * 0.15);
    }

    const rowY = cy + y + breath * 0.5;
    for (let x = -wAtY; x <= wAtY; x++) {
      const normX = x / headW;
      const dCenter = Math.sqrt(normX * normX + normY * normY);

      // 3D volumetric face lighting
      let lum = 0.35 + (1.0 - dCenter) * 0.45 + (normX * 0.2);
      let col = 1;

      // Cheekbone highlights
      if (normY > -0.15 && normY < 0.25 && Math.abs(normX) > 0.35 && Math.abs(normX) < 0.75) {
        lum += 0.25;
        col = 2;
      }
      // Forehead highlight
      if (normY < -0.35 && Math.abs(normX) < 0.5) {
        lum += 0.2;
        col = 2;
      }

      setPixel(cx + x, rowY, lum, col);
    }
  }

  // Neck & Shoulders
  for (let y = 14; y < 28; y++) {
    const rowY = cy + y + breath;
    const neckW = 9 + (y - 14) * 1.8;
    for (let x = -neckW; x <= neckW; x++) {
      const edge = Math.abs(x) / neckW;
      const lum = (1.0 - edge * 0.6) * 0.45;
      setPixel(cx + x, rowY, lum, 1);
    }
  }

  // Cranial Shunt Ports & Heavy Cables
  const cableRoots = [
    [-14, -12], [-16, -6], [-17, 2], [-15, 10],
    [14, -12], [16, -6], [17, 2], [15, 10]
  ];
  for (let i = 0; i < cableRoots.length; i++) {
    const [rx, ry] = cableRoots[i];
    const rootX = cx + rx;
    const rootY = cy + ry + breath * 0.5;
    const side = rx < 0 ? -1 : 1;
    const targetX = side < 0 ? 4 : COLS - 5;
    const targetY = ROWS - 4 + (i % 4) * 2;

    // Cable catenary sag
    for (let s = 0; s <= 1.0; s += 0.02) {
      const px = rootX + (targetX - rootX) * s;
      const sag = Math.sin(s * Math.PI) * (8 + i * 2);
      const py = rootY + (targetY - rootY) * s + sag + Math.sin(t * 2 + i) * 0.6;

      const isDataPulse = Math.abs((s - ((t * 0.8 + i * 0.25) % 1.0))) < 0.05;
      const lum = isDataPulse ? 0.95 : 0.45;
      const col = isDataPulse ? 5 : (side < 0 ? 2 : 4);
      setPixel(px, py, lum, col, isDataPulse ? 17 : 12);
    }
  }

  // Facial Features
  // 1. Nose bridge & tip
  const noseY = cy + 2 + breath * 0.5;
  drawLine(cx, noseY - 6, cx, noseY + 2, 0.85, 3);
  drawLine(cx - 2, noseY + 2, cx + 2, noseY + 2, 0.85, 3);

  // 2. Lips
  const mouthY = cy + 9 + breath * 0.5;
  drawLine(cx - 5, mouthY, cx + 5, mouthY, 0.75, 2);
  drawLine(cx - 3, mouthY + 1, cx + 3, mouthY + 1, 0.9, 3);

  // 3. Left Eye (Organic, with blinking)
  const eyeY = cy - 4 + breath * 0.5;
  const isBlink = (t % 3.8) < 0.15;
  const leftEyeX = cx - 7;
  if (isBlink) {
    drawLine(leftEyeX - 4, eyeY, leftEyeX + 4, eyeY, 0.65, 2);
  } else {
    // Eye outline
    drawLine(leftEyeX - 4, eyeY - 1, leftEyeX + 4, eyeY - 1, 0.85, 3);
    drawLine(leftEyeX - 4, eyeY + 1, leftEyeX + 4, eyeY + 1, 0.75, 2);
    // Iris & pupil
    setPixel(leftEyeX, eyeY, 0.95, 5, 17);
    setPixel(leftEyeX - 1, eyeY, 0.7, 3);
    setPixel(leftEyeX + 1, eyeY, 0.7, 3);
  }

  // 4. Right Eye (Cybernetic 32-Step Reticle & Laser Saccade)
  const rightEyeX = cx + 7;
  const reticleAngle = (t * 4.0) % (Math.PI * 2);
  // Outer reticle ring
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    const rx = rightEyeX + Math.cos(a + reticleAngle) * 4.5;
    const ry = eyeY + Math.sin(a + reticleAngle) * 2.5;
    setPixel(rx, ry, 0.85, 4, 16);
  }
  // Glowing Core
  setPixel(rightEyeX, eyeY, 1.0, 5, 17);
  drawLine(rightEyeX - 2, eyeY, rightEyeX + 2, eyeY, 0.9, 4);
  drawLine(rightEyeX, eyeY - 2, rightEyeX, eyeY + 2, 0.9, 4);

  // Forehead Cybernetic Interface Port
  const portY = cy - 14 + breath * 0.5;
  fillRect(cx - 4, portY - 2, 8, 4, 0.8, 4);
  setPixel(cx - 2, portY, 0.95, 5);
  setPixel(cx + 2, portY, 0.95, 5);

  // HUD Labels
  drawText('[NEURAL_BIOFEED // SYNC_99.8%]', 4, 3, 3, 0.9);
  drawText('PUPIL_TRACK: LOCKED // TARGET_ACQUIRED', 4, 5, 2, 0.75);
}

// -------------------------------------------------------------
// SCENE 2: DYSTOPIAN MEGACITY CANYON WITH SMOG & AVs
// -------------------------------------------------------------
function renderScene2(t) {
  const panX = (t * 8) % 36;
  const skyY = 18;

  // Background Smog / Atmospheric Density Gradient
  for (let y = 0; y < ROWS; y++) {
    const smogFactor = y / ROWS;
    const smogLum = 0.08 + Math.pow(smogFactor, 2.2) * 0.28;
    const col = smogFactor > 0.6 ? 1 : 0;
    for (let x = 0; x < COLS; x += 3) {
      if (Math.sin(x * 0.4 + y * 0.3 + t) > 0.2) {
        setPixel(x, y, smogLum, col, 12);
      }
    }
  }

  // Towering Megastructure Skyscraper Silhouettes
  const buildings = [
    { x: -10, w: 22, h: 46, style: 0 },
    { x: 16,  w: 18, h: 52, style: 1 },
    { x: 38,  w: 26, h: 42, style: 0 },
    { x: 68,  w: 20, h: 56, style: 2 },
    { x: 92,  w: 24, h: 48, style: 1 },
    { x: 120, w: 20, h: 50, style: 0 }
  ];

  for (let b of buildings) {
    const bx = b.x - panX * 0.4;
    const by = ROWS - b.h;
    // Building Solid Hull
    fillRect(bx, by, b.w, b.h, 0.45, 1, 16);
    // Roof Antenna / Spire
    drawLine(bx + b.w * 0.5, by, bx + b.w * 0.5, by - 8, 0.85, 3, 17);
    setPixel(bx + b.w * 0.5, by - 8, Math.sin(t * 8) > 0 ? 0.95 : 0.2, 4);

    // Glowing Window Arrays
    for (let wy = by + 4; wy < ROWS - 4; wy += 3) {
      for (let wx = bx + 3; wx < bx + b.w - 3; wx += 3) {
        const isLit = ((Math.floor(wx * 7 + wy * 13 + b.x) % 7) > 2);
        if (isLit) {
          const winLum = 0.65 + Math.sin(wx + wy + t * 2) * 0.25;
          setPixel(wx, wy, winLum, 2, 17);
        }
      }
    }

    // Commercial Neon Hologram Billboards on Skyscraper side
    if (b.style === 2) {
      const holoY = by + 12;
      fillRect(bx + 2, holoY, b.w - 4, 7, 0.85, 4, 15);
      drawText('KAIJU_AI', Math.floor(bx + 4), holoY + 3, 5, 1.0);
    }
  }

  // Sweeping Searchlights from City Penthouses
  const swAngle = Math.sin(t * 1.5) * 0.65;
  const swOriginX = 78 - panX * 0.4;
  const swOriginY = 12;
  for (let r = 0; r < 50; r += 1) {
    const lx = swOriginX + Math.sin(swAngle) * r * 1.8;
    const ly = swOriginY + Math.cos(swAngle) * r * 0.8;
    const spread = (r / 50) * 4;
    for (let sp = -spread; sp <= spread; sp++) {
      setPixel(lx + sp, ly, 0.35 * (1.0 - r / 50), 3);
    }
  }

  // Skyway AV Corridors (Dense Traffic Ribbons)
  const lanes = [
    { y: 32, dir: 1, speed: 45, col: 2 },
    { y: 38, dir: -1, speed: 55, col: 4 },
    { y: 45, dir: 1, speed: 65, col: 3 }
  ];

  for (let lane of lanes) {
    // Guideway Rail
    drawLine(0, lane.y, COLS - 1, lane.y, 0.25, 0);

    // AV Vehicles
    const count = 6;
    for (let i = 0; i < count; i++) {
      const avT = ((t * lane.speed + i * (COLS / count)) % (COLS + 20)) - 10;
      const avX = lane.dir > 0 ? avT : (COLS - avT);
      const avY = lane.y - 1;

      // AV Hull
      fillRect(avX - 2, avY, 4, 2, 0.9, lane.col, 17);
      // Continuous Headlight / Taillight Beam
      if (lane.dir > 0) {
        drawLine(avX + 2, avY + 1, avX + 12, avY + 1, 0.7, 5); // Headlight beam
        drawLine(avX - 2, avY + 1, avX - 8, avY + 1, 0.8, 4);  // Red taillight streak
      } else {
        drawLine(avX - 2, avY + 1, avX - 12, avY + 1, 0.7, 5);
        drawLine(avX + 2, avY + 1, avX + 8, avY + 1, 0.8, 4);
      }
    }
  }

  drawText('[SECTOR_09 // NIGHT_METROPOLIS]', 4, 3, 3, 0.9);
  drawText('ELEV: +1420m // TRAFFIC_FLOW: ACTIVE', 4, 5, 2, 0.75);
}

// -------------------------------------------------------------
// SCENE 3: KINETIC SPACE COMBAT & DETONATION
// -------------------------------------------------------------
function renderScene3(t) {
  const blastCycle = (t * 1.2) % 2.5;

  // Background Starfield & Distant Nebula
  for (let i = 0; i < 40; i++) {
    const sx = (i * 37) % COLS;
    const sy = (i * 19) % ROWS;
    setPixel(sx, sy, 0.25 + Math.sin(t * 3 + i) * 0.15, 1, 1);
  }

  // Interceptor Ship (Attacker)
  const intX = 24 + Math.sin(t * 3.5) * 4;
  const intY = 28 + Math.cos(t * 2.8) * 3;

  // Draw Interceptor Delta Wings & Fuselage
  drawLine(intX + 12, intY, intX - 8, intY - 6, 0.85, 2, 17);
  drawLine(intX + 12, intY, intX - 8, intY + 6, 0.85, 2, 17);
  drawLine(intX - 8, intY - 6, intX - 4, intY, 0.75, 1, 16);
  drawLine(intX - 8, intY + 6, intX - 4, intY, 0.75, 1, 16);
  fillRect(intX - 4, intY - 2, 8, 4, 0.95, 2, 17);
  // Thruster fire
  drawLine(intX - 8, intY, intX - 18, intY, 0.95, 4, 17);

  // Target Frigate / Capital Ship
  const frigX = 85;
  const frigY = 30;

  if (blastCycle < 0.8) {
    // Target Ship Intact & Under Attack
    // Draw Frigate Solid Hull
    fillRect(frigX - 18, frigY - 8, 36, 16, 0.65, 1, 16);
    // Command Bridge & Armor Ribs
    fillRect(frigX - 8, frigY - 12, 16, 5, 0.85, 2, 17);
    drawLine(frigX - 18, frigY, frigX + 18, frigY, 0.95, 3);
    for (let r = -14; r <= 14; r += 7) {
      drawLine(frigX + r, frigY - 8, frigX + r, frigY + 8, 0.75, 2);
    }

    // High-Velocity Kinetic Railgun Laser Beams
    const beamT = (blastCycle * 4.0) % 1.0;
    const beamX0 = intX + 12;
    const beamY0 = intY;
    const beamX1 = frigX - 10;
    const beamY1 = frigY - 2;
    drawLine(beamX0, beamY0, beamX1, beamY1, 0.98, 5, 17);
    // Secondary Tracer
    drawLine(beamX0, beamY0 + 2, beamX1, beamY1 + 4, 0.85, 3, 16);

    // Deflector Shield Spark Impact
    fillCircle(beamX1, beamY1, 6, 0.95, 5);
  } else {
    // Catastrophic 4-Stage Rupture & Explosion
    const expT = (blastCycle - 0.8) / 1.7; // 0.0 to 1.0
    const blastRadius = Math.pow(expT, 0.45) * 32;

    // Expanding Primary Shockwave Ring
    for (let a = 0; a < Math.PI * 2; a += 0.08) {
      const rx = frigX + Math.cos(a) * blastRadius;
      const ry = frigY + Math.sin(a) * (blastRadius * 0.55);
      setPixel(rx, ry, (1.0 - expT) * 0.95, 3, 17);
    }

    // Central White-Hot Antimatter Core Flash
    if (expT < 0.4) {
      fillCircle(frigX, frigY, (1.0 - expT / 0.4) * 14, 1.0, 5);
    }

    // Tumbling Hull Armor Shards & Shrapnel (48 polygonal fragments)
    for (let i = 0; i < 48; i++) {
      const angle = (i / 48) * Math.PI * 2 + (i % 3) * 0.4;
      const speed = 12 + (i % 7) * 4;
      const dist = Math.pow(expT, 0.5) * speed * 2.2;
      const sx = frigX + Math.cos(angle) * dist;
      const sy = frigY + Math.sin(angle) * (dist * 0.55);

      const tumble = expT * 12 + i;
      const shardSize = 2 + (i % 3);
      const isGlint = Math.cos(tumble) > 0.7;

      fillRect(sx, sy, shardSize, shardSize * 0.6, isGlint ? 1.0 : (1.0 - expT), isGlint ? 5 : 4, 17);
    }
  }

  drawText('[KINETIC_ENGAGEMENT // HOSTILE_DESTROYED]', 4, 3, 4, 0.95);
  drawText('TARGET_DISTANCE: CLOSING // RAILGUN_BURST: NOMINAL', 4, 5, 2, 0.75);
}

// -------------------------------------------------------------
// SCENE 4: OMINOUS AI CORE & INTERLOCKING DYSON IRIS
// -------------------------------------------------------------
function renderScene4(t) {
  const cx = 60 + gyroX * 6;
  const cy = 30 + gyroY * 4;

  // Background Hexagonal Containment Grid
  for (let y = 2; y < ROWS; y += 6) {
    for (let x = 3; x < COLS; x += 10) {
      drawLine(x, y, x + 4, y, 0.2, 1);
      drawLine(x + 4, y, x + 6, y + 3, 0.2, 1);
      drawLine(x + 6, y + 3, x + 4, y + 6, 0.2, 1);
      drawLine(x + 4, y + 6, x, y + 6, 0.2, 1);
    }
  }

  // 32-Tooth Outer Industrial Bevel Gear Ring
  const gearR = 26;
  const gearAngle = t * 0.4;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
    const isTooth = Math.sin(a * 16 + gearAngle * 4) > 0;
    const rCurr = isTooth ? gearR + 2.5 : gearR;
    const gx = cx + Math.cos(a + gearAngle) * rCurr * 1.5;
    const gy = cy + Math.sin(a + gearAngle) * rCurr * 0.8;
    setPixel(gx, gy, 0.75, 2, 16);
  }

  // 12-Blade Interlocking Mechanical Iris Aperture
  const irisDilation = 0.5 + Math.sin(t * 2.0) * 0.25; // 0.25 to 0.75
  const innerR = 7 * irisDilation;
  const outerR = 22;

  for (let b = 0; b < 12; b++) {
    const bladeAngle = (b / 12) * Math.PI * 2 + t * 0.2;
    for (let r = innerR; r <= outerR; r += 1.2) {
      const curAngle = bladeAngle + (r - innerR) * 0.08;
      const bx = cx + Math.cos(curAngle) * r * 1.5;
      const by = cy + Math.sin(curAngle) * r * 0.8;

      const edgeDist = Math.abs(r - innerR);
      const lum = edgeDist < 2.0 ? 0.95 : 0.55;
      const col = edgeDist < 2.0 ? 3 : (b % 2 === 0 ? 2 : 1);
      setPixel(bx, by, lum, col, 17);
    }
  }

  // Einstein Ring Caustic Rim at Event Horizon
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    const rx = cx + Math.cos(a) * (innerR * 1.5);
    const ry = cy + Math.sin(a) * (innerR * 0.8);
    setPixel(rx, ry, 0.98, 5, 17);
  }

  // Central Machine-God Synthetic Pupil / Singularity
  const pupilR = innerR * 0.65;
  // Inner black void
  fillCircle(cx, cy, pupilR * 1.4, 0.0, 0);
  // Red core pupil dot
  setPixel(cx, cy, 1.0, 4, 17);
  drawLine(cx - 3, cy, cx + 3, cy, 0.85, 4);
  drawLine(cx, cy - 2, cx, cy + 2, 0.85, 4);

  // Rotating Keplerian Accretion Runes
  const runeStr = '01X7F9A4BCDE5890';
  for (let i = 0; i < runeStr.length; i++) {
    const ra = (i / runeStr.length) * Math.PI * 2 - t * 1.2;
    const rDist = outerR * 1.25;
    const rx = Math.floor(cx + Math.cos(ra) * rDist * 1.5);
    const ry = Math.floor(cy + Math.sin(ra) * rDist * 0.8);
    drawText(runeStr[i], rx, ry, 3, 0.85);
  }

  drawText('[AI_CORE // APERTURE_FLUX_NOMINAL]', 4, 3, 3, 0.95);
  drawText('CONTAINMENT: 99.98% // IRIS_CYCLE: ACTIVE', 4, 5, 2, 0.75);
}

// -------------------------------------------------------------
// SCENE 5: TESSERA CORVETTE HYPER-WARP BREAKOUT
// -------------------------------------------------------------
function renderScene5(t) {
  const cx = 60 + gyroX * 8;
  const cy = 30 + gyroY * 5;
  const warpPhase = (t * 2.0) % 3.0;

  // Relativistic Warp Tunnel Jump Rings (8 Expanding Toroids)
  for (let i = 0; i < 8; i++) {
    const ringZ = ((i / 8 - (t * 0.8) % 1.0) + 1.0) % 1.0;
    const ringR = Math.pow(ringZ, 2.2) * 45;
    const ringLum = Math.sin(ringZ * Math.PI) * 0.85;

    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const rx = cx + Math.cos(a) * ringR * 1.6;
      const ry = cy + Math.sin(a) * ringR * 0.85;
      setPixel(rx, ry, ringLum, ringZ > 0.6 ? 4 : 2, 16);
    }
  }

  // Relativistic Star Streaks (Long Beams Radial Outward)
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    const r0 = 12 + (i % 5) * 4;
    const r1 = r0 + 18 + (i % 7) * 6;
    const x0 = cx + Math.cos(angle) * r0 * 1.5;
    const y0 = cy + Math.sin(angle) * r0 * 0.8;
    const x1 = cx + Math.cos(angle) * r1 * 1.5;
    const y1 = cy + Math.sin(angle) * r1 * 0.8;

    drawLine(x0, y0, x1, y1, 0.65, i % 2 === 0 ? 3 : 2, 17);
  }

  // 3D Faceted Tessera Corvette (Player Ship in Center)
  const shipX = cx;
  const shipY = cy + 2;

  // Ship Hull Geometry
  // Nose chine & cockpit
  drawLine(shipX, shipY - 10, shipX - 16, shipY + 6, 0.95, 3, 17);
  drawLine(shipX, shipY - 10, shipX + 16, shipY + 6, 0.95, 3, 17);
  // Wing trailing edge
  drawLine(shipX - 16, shipY + 6, shipX - 6, shipY + 4, 0.85, 2, 16);
  drawLine(shipX + 16, shipY + 6, shipX + 6, shipY + 4, 0.85, 2, 16);
  drawLine(shipX - 6, shipY + 4, shipX + 6, shipY + 4, 0.85, 2, 16);
  // Center cockpit canopy
  fillRect(shipX - 3, shipY - 6, 6, 8, 0.95, 5, 17);

  // Supersonic Mach Shock Diamond Ion Thruster Plumes
  const nozzles = [shipX - 5, shipX + 5];
  for (let nx of nozzles) {
    for (let d = 0; d < 4; d++) {
      const nodeY = shipY + 6 + d * 5;
      const nodeR = 2.5 - d * 0.5;
      // Diamond node
      drawLine(nx - nodeR, nodeY, nx, nodeY + 3, 0.95, 4, 17);
      drawLine(nx + nodeR, nodeY, nx, nodeY + 3, 0.95, 4, 17);
      drawLine(nx, nodeY - 2, nx - nodeR, nodeY, 0.95, 4, 17);
      drawLine(nx, nodeY - 2, nx + nodeR, nodeY, 0.95, 4, 17);
    }
  }

  drawText('[VESSEL: TESSERA-MK3 // HYPER_WARP_ENGAGED]', 4, 3, 3, 0.95);
  drawText('WARP_FACTOR: 9.94 // CELESTIAL_TRANSIT: ACTIVE', 4, 5, 2, 0.75);
}

// -------------------------------------------------------------
// MAIN RENDER LOOP (60 FPS)
// -------------------------------------------------------------
function renderFrame(timestamp) {
  if (!running) return;
  if (!startTime) startTime = timestamp;
  const dt = Math.min(0.05, (timestamp - (lastTime || timestamp)) / 1000);
  lastTime = timestamp;

  currentProgress += (targetProgress - currentProgress) * Math.min(1, dt * 6);

  const elapsed = (timestamp - startTime) / 1000;
  const loopTime = elapsed % 15.0; // 3.0s per act
  const actIdx = Math.floor(loopTime / 3.0) % 5;

  // Smooth Gyro Interpolation
  gyroX += (targetGyroX - gyroX) * Math.min(1, dt * 8);
  gyroY += (targetGyroY - gyroY) * Math.min(1, dt * 8);

  // 1. Clear Frame Luminance Buffer
  clearFrame();

  // 2. Render Active Narrative Act
  switch (actIdx) {
    case 0: renderScene1(elapsed); break;
    case 1: renderScene2(elapsed); break;
    case 2: renderScene3(elapsed); break;
    case 3: renderScene4(elapsed); break;
    default: renderScene5(elapsed); break;
  }

  // 3. Physical P31 CRT Phosphor Decay (Trail Persistence)
  const decayRate = Math.exp(-9.0 * dt);
  for (let i = 0; i < TOTAL_CELLS; i++) {
    const prev = decayBuffer[i] * decayRate;
    const cur = lumBuffer[i];
    decayBuffer[i] = Math.max(cur, prev);
  }

  // 4. Render to Canvas via 2D Context
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#02050a';
  ctx.fillRect(0, 0, width, height);

  const cellW = width / COLS;
  const cellH = height / ROWS;
  const activePalette = SCENE_PALETTES[actIdx];

  ctx.font = 'bold 9px "IBM Plex Mono", "Consolas", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let r = 0; r < ROWS; r++) {
    const rowOff = r * COLS;
    for (let c = 0; c < COLS; c++) {
      const idx = rowOff + c;
      const lum = decayBuffer[idx];
      if (lum <= 0.05) continue;

      let charIdx = glyphBuffer[idx];
      if (charIdx === 0) {
        charIdx = Math.min(CHAR_DENSITY.length - 1, Math.floor(lum * CHAR_DENSITY.length));
      }
      const ch = CHAR_DENSITY[charIdx];

      const colIdx = Math.min(activePalette.length - 1, colorBuffer[idx]);
      const x = c * cellW + cellW * 0.5;
      const y = r * cellH + cellH * 0.5;

      ctx.fillStyle = lum > 0.85 ? '#ffffff' : activePalette[colIdx];
      ctx.fillText(ch, x, y);
    }
  }

  // 5. Horizontal Laser Scanline
  const scanY = ((timestamp * 0.0006) % 1) * height;
  ctx.strokeStyle = 'rgba(78, 240, 192, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, scanY);
  ctx.lineTo(width, scanY);
  ctx.stroke();

  // 6. Waveform Oscilloscope Sub-window
  if (waveCtx) {
    waveCtx.clearRect(0, 0, waveW, waveH);
    waveCtx.strokeStyle = '#4ef0c0';
    waveCtx.lineWidth = 1.5;
    waveCtx.beginPath();
    const t = timestamp * 0.006;
    const midY = waveH * 0.45;
    for (let x = 0; x < waveW; x += 3) {
      const y = midY + Math.sin(x * 0.08 + t) * (waveH * 0.28) + Math.sin(x * 0.22 - t * 1.5) * (waveH * 0.12);
      if (x === 0) waveCtx.moveTo(x, y);
      else waveCtx.lineTo(x, y);
    }
    waveCtx.stroke();
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
    targetGyroX = Math.max(-1.0, Math.min(1.0, Number(msg.x) || 0));
    targetGyroY = Math.max(-1.0, Math.min(1.0, Number(msg.y) || 0));
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

  // Idempotent PER CANVAS. This element is set up from two places: the inline module in index.html
  // (bootstrapLoadingTerminal) and createLoadingPresenter, which calls this factory DIRECTLY and so
  // skips the activeTerminalInstance guard. Setting the same canvas up twice is fatal rather than
  // wasteful, because transferControlToOffscreen cannot be undone. Pinned by
  // test/loading-boot-resilience.test.mjs; do not drop this in a rewrite.
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
        ? (waveformCanvas.__sfTransferred = true, waveformCanvas.transferControlToOffscreen())
        : null;

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

  // transferControlToOffscreen is IRREVERSIBLE. `offscreenSupported` can still go false after it
  // succeeds (Blob, Worker, postMessage all follow it), and calling getContext on a canvas whose
  // control was already handed over throws InvalidStateError straight out of the boot path --
  // which hung this game on its loading screen for two days. There is no context to fall back to.
  // Pinned by test/loading-boot-resilience.test.mjs; do not drop this in a rewrite.
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
    const rawAct = (elapsed % 15.0) / 3.0;
    const actIdx = Math.floor(rawAct) % 5;

    const actTitles = [
      'NEURAL_BIOFEED // GHOST_IN_THE_WIRE',
      'SECTOR_09 // NIGHT_METROPOLIS',
      'KINETIC_ENGAGEMENT // HOSTILE_DESTROYED',
      'AI_CORE // APERTURE_FLUX_NOMINAL',
      'VESSEL: TESSERA-MK3 // HYPER_WARP_ENGAGED',
    ];

    const diagStreamEl = overlay.querySelector('[data-loading-diag-stream]');
    if (diagStreamEl) {
      const actLogs = [
        '[ACT_01] NEURAL_BIOFEED // GHOST_IN_THE_WIRE',
        '[ACT_02] SECTOR_09 // NIGHT_METROPOLIS_SURVEILLANCE',
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
