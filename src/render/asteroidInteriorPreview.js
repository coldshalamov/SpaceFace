// Asteroid-interior LOOK LAB (dev-only proof harness) — renders the drill/works cutaway in the REAL
// 3D engine so we can judge whether "render it in the flight world's engine" actually reads as
// congruent, versus the current flat Canvas2D playfield. This is a throwaway look-dev harness in the
// spirit of shipPreview.js / _plumelab: it reuses the LIVE renderer + scene + 3-point light rig +
// baked PMREM nebula env, builds a cutaway into a temp group, and renders it through a dedicated
// bloom+SSAO composer. It mutates nothing in the sim and ships behind ?dev=astlab (SF_DEBUG only).
//
// The whole point is congruence-by-construction: the rock material is the SAME palette as the
// in-flight asteroids (visualFactory ast_common_rock: 0x4a4540, rough .98), the lights and nebula
// environment are the SAME ones the flight world uses, and real geometry means real normals — so
// lighting does the depth work that no amount of 2D hand-painting can fake.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------- deterministic noise + textures
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// A self-contained tiling value-noise canvas used as a bumpMap so the rock surface catches the
// raking light as irregular stone instead of flat cubes. Grayscale height → THREE reads it as relief.
export function makeRockBumpTexture(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const img = g.createImageData(size, size);
  const cells = 10;
  // smooth value noise (bilinear over a coarse lattice) + a finer octave of grain
  const lattice = [];
  for (let i = 0; i <= cells; i++) { lattice[i] = []; for (let j = 0; j <= cells; j++) lattice[i][j] = hash2(i, j); }
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = smooth(fx - x0), ty = smooth(fy - y0);
      const a = lattice[x0][y0], b = lattice[x0 + 1][y0], c = lattice[x0][y0 + 1], d = lattice[x0 + 1][y0 + 1];
      let v = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
      // fine grain octave
      v = v * 0.78 + hash2(x * 3 + 1, y * 3 + 7) * 0.22;
      const px = (y * size + x) * 4;
      const lum = Math.max(0, Math.min(255, (v * 255) | 0));
      img.data[px] = img.data[px + 1] = img.data[px + 2] = lum;
      img.data[px + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------- the cutaway layout
// A hand-designed cross-section that mirrors a real works site: a solid rock mass with an access
// shaft dropping to a carved chamber, ore veins sitting in the surrounding stone (so contact reads),
// a lethal gas pocket, and the machine cluster in the open space. Cell kinds:
//   'matrix' warm silicate · 'basalt' dark dense · 'ore:<tint>' vein · 'gas' pocket · 0 carved/open
export const INTERIOR_COLS = 30, INTERIOR_ROWS = 18;
const COLS = INTERIOR_COLS, ROWS = INTERIOR_ROWS;
// cell (col,row) → world (x,y) centre, matching buildRock's placement. Row 0 is the top surface.
export function cellToWorld(c, r, S) {
  return { x: (c - COLS / 2 + 0.5) * S, y: (ROWS / 2 - r - 0.5) * S };
}
export function buildLayout() {
  const grid = [];
  for (let r = 0; r < ROWS; r++) { grid[r] = []; for (let c = 0; c < COLS; c++) grid[r][c] = 'matrix'; }
  // basalt banding through the lower third
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (r >= 12 && hash2(c * 2, r * 5) > 0.42) grid[r][c] = 'basalt';
  }
  const open = (r, c) => { if (r >= 0 && r < ROWS && c >= 0 && c < COLS) grid[r][c] = 0; };
  // access shaft from the surface down to the chamber (col 14)
  for (let r = 0; r <= 6; r++) { open(r, 14); open(r, 15); }
  // main chamber
  for (let r = 6; r <= 11; r++) for (let c = 10; c <= 19; c++) open(r, c);
  // a lateral drift to the right (toward the ore body)
  for (let c = 19; c <= 24; c++) { open(8, c); open(9, c); }
  // a lower gallery
  for (let c = 8; c <= 16; c++) { open(13, c); open(14, c); }
  // ore veins embedded in the solid rock touching the chamber walls (contact faces)
  const ore = (r, c, tint) => { if (grid[r] && grid[r][c] && grid[r][c] !== 0) grid[r][c] = 'ore:' + tint; };
  ore(7, 9, 'iron'); ore(8, 9, 'iron'); ore(9, 9, 'copper'); ore(10, 9, 'iron');
  ore(7, 20, 'copper'); ore(8, 25, 'iron'); ore(9, 25, 'copper'); ore(10, 20, 'iron');
  ore(6, 12, 'diamond'); ore(12, 12, 'diamond');
  ore(14, 8, 'copper'); ore(15, 16, 'iron');
  // gas pocket, sealed in the lower-left rock (never breach it)
  grid[15][4] = 'gas'; grid[15][5] = 'gas'; grid[16][4] = 'gas'; grid[16][5] = 'gas'; grid[14][5] = 'gas';
  return grid;
}

const ORE_TINT = {
  iron: { col: 0xb08e5e, emissive: 0x201408, ei: 0.0, glow: false },
  copper: { col: 0x2fae9b, emissive: 0x08302b, ei: 0.15, glow: true },
  diamond: { col: 0x9fe4ff, emissive: 0x2aa8ff, ei: 0.9, glow: true },
};

// ---------------------------------------------------------------- geometry builders
// Rock materials matching the in-flight ast_common_rock palette, warmed for the interior light.
export function makeRockMaterials(envMap) {
  const bump = makeRockBumpTexture(256);
  return {
    matrix: new THREE.MeshStandardMaterial({ color: 0x554a3c, roughness: 0.96, metalness: 0.05,
      bumpMap: bump, bumpScale: 1.15, envMap: envMap || null, envMapIntensity: 0.3 }),
    basalt: new THREE.MeshStandardMaterial({ color: 0x2c2f38, roughness: 0.82, metalness: 0.12,
      bumpMap: bump, bumpScale: 1.2, envMap: envMap || null, envMapIntensity: 0.4 }),
  };
}

export function buildRock(group, grid, S, depth, mats) {
  const boxes = { matrix: [], basalt: [] };
  const oreCells = [];
  const gasCells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = grid[r][c];
    if (k === 0) continue;
    const x = (c - COLS / 2 + 0.5) * S;
    const y = (ROWS / 2 - r - 0.5) * S;
    if (k === 'gas') { gasCells.push({ x, y }); continue; }
    if (typeof k === 'string' && k.startsWith('ore:')) { oreCells.push({ x, y, tint: k.slice(4) }); }
    const bucket = (k === 'basalt') ? 'basalt' : 'matrix';
    // Heavy seeded variance so it reads as fractured natural stone, not masonry: full 3-axis
    // rotation breaks the grid seams, uneven depth roughens the face, per-instance colour kills the
    // uniform-grey tell. This is the difference between "asteroid rock" and "dungeon brick wall".
    // Blocks are scaled ABOVE cell size so they overlap their neighbours (no gaps → solid rock mass,
    // not floating tiles), with only moderate rotation for a rough face. Overlap keeps the carved
    // cavities legible while colour + depth variance kills the uniform-brick tell.
    const jx = (hash2(c, r) - 0.5) * S * 0.22;
    const jy = (hash2(c + 9, r + 3) - 0.5) * S * 0.22;
    const jz = -depth * 0.05 + hash2(c + 5, r + 7) * depth * 0.42;
    boxes[bucket].push({
      x: x + jx, y: y + jy, z: jz,
      sx: S * (1.08 + hash2(c + 2, r + 8) * 0.34),
      sy: S * (1.08 + hash2(c + 11, r + 2) * 0.34),
      d: depth * (0.95 + hash2(c, r + 1) * 0.7),
      rx: (hash2(c + 4, r + 6) - 0.5) * 0.22,
      ry: (hash2(c + 7, r + 1) - 0.5) * 0.22,
      rz: (hash2(c + 3, r + 9) - 0.5) * 0.3,
      tint: 0.8 + hash2(c + 13, r + 5) * 0.34, // brightness multiplier over the base rock colour
      warm: (hash2(c + 6, r + 8) - 0.32) * 0.14, // per-block hue drift, biased warm (it's stone)
      rubble: hash2(c + 21, r + 17),
    });
  }
  // instanced rock (matrix + basalt) — one draw each, real normals, cast/receive shadow, per-instance
  // colour so no two blocks are quite the same stone.
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const rubble = [];
  for (const bucket of ['matrix', 'basalt']) {
    const list = boxes[bucket];
    if (!list.length) continue;
    const inst = new THREE.InstancedMesh(geo, mats[bucket], list.length);
    inst.castShadow = true; inst.receiveShadow = true;
    list.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(b.rx, b.ry, b.rz);
      dummy.scale.set(b.sx, b.sy, b.d);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      col.setRGB(Math.min(1.3, b.tint + b.warm), b.tint, Math.max(0, b.tint - b.warm * 1.15));
      inst.setColorAt(i, col);
      // a scattered chip of rubble on ~40% of blocks to break the clean cube tops where rock meets air
      if (b.rubble > 0.6) rubble.push({ x: b.x + (b.rubble - 0.65) * S, y: b.y - (b.rubble - 0.62) * S, z: b.z + b.d * 0.5,
        s: S * (0.16 + b.rubble * 0.2), r: b.rubble * 6, tint: b.tint });
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    group.add(inst);
  }
  // rubble scatter: small tilted chips sharing the rock material, breaking the grid silhouette
  if (rubble.length) {
    const rgeo = new THREE.DodecahedronGeometry(0.5, 0);
    const rinst = new THREE.InstancedMesh(rgeo, mats.matrix, rubble.length);
    rinst.castShadow = true; rinst.receiveShadow = true;
    rubble.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(b.r, b.r * 1.7, b.r * 0.6);
      dummy.scale.setScalar(b.s);
      dummy.updateMatrix();
      rinst.setMatrixAt(i, dummy.matrix);
      col.setRGB(b.tint, b.tint * 0.97, b.tint * 0.92);
      rinst.setColorAt(i, col);
    });
    rinst.instanceMatrix.needsUpdate = true;
    if (rinst.instanceColor) rinst.instanceColor.needsUpdate = true;
    group.add(rinst);
  }
  // dark backing wall so open cavities have a floor behind them (reads as depth)
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(COLS * S * 1.3, ROWS * S * 1.3),
    new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 1, metalness: 0 }));
  back.position.z = -depth * 1.1; back.receiveShadow = true;
  group.add(back);
  return { oreCells, gasCells };
}

export function buildOre(group, oreCells, S, depth, envMap, pulseTargets) {
  const geo = new THREE.IcosahedronGeometry(S * 0.16, 0);
  for (const cell of oreCells) {
    const t = ORE_TINT[cell.tint] || ORE_TINT.iron;
    const mat = new THREE.MeshStandardMaterial({
      color: t.col, emissive: t.emissive, emissiveIntensity: t.ei,
      roughness: 0.35, metalness: 0.6, envMap: envMap || null, flatShading: true,
    });
    if (t.glow) pulseTargets.push({ mat, base: t.ei, amp: t.ei * 0.5 });
    // a little cluster of nodules embedded in the front face of the cell
    const n = 3 + ((hash2(cell.x | 0, cell.y | 0) * 4) | 0);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      const a = hash2(cell.x | 0, i * 7 + 1) * Math.PI * 2;
      const rr = hash2(i * 3 + 2, cell.y | 0) * S * 0.28;
      m.position.set(cell.x + Math.cos(a) * rr, cell.y + Math.sin(a) * rr, depth * 0.42 + hash2(i, 9) * S * 0.1);
      m.scale.setScalar(0.6 + hash2(i + 1, 3) * 0.9);
      m.castShadow = true;
      group.add(m);
    }
  }
}

export function buildGas(group, gasCells, S, depth, pulseTargets) {
  if (!gasCells.length) return;
  let cx = 0, cy = 0; for (const g of gasCells) { cx += g.x; cy += g.y; } cx /= gasCells.length; cy /= gasCells.length;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1c8f74, emissive: 0x18d69a, emissiveIntensity: 0.7,
    roughness: 1, metalness: 0, transparent: true, opacity: 0.42, depthWrite: false,
  });
  pulseTargets.push({ mat, base: 0.7, amp: 0.35 });
  const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(S * 1.15, 2), mat);
  blob.position.set(cx, cy, depth * 0.1);
  blob.scale.set(1.6, 1.3, 0.7);
  group.add(blob);
  // a soft point light inside the pocket so it lights the surrounding rock teal
  const gl = new THREE.PointLight(0x2fe0b0, 6, S * 7, 2);
  gl.position.set(cx, cy, depth * 0.6);
  group.add(gl);
}

// ---------------------------------------------------------------- machines (code-built, ship palette)
export function metalMat(color, envMap) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.82, envMap: envMap || null });
}
export function emissiveMat(color, ei = 1.2) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: ei, roughness: 0.5, metalness: 0.2 });
}

// Single-cell placeable devices for the interactive build lab AND the live works renderer. Each is
// built at LOCAL origin (cell centre at 0,0, floor at z=0) and extrudes toward the camera (+z), so
// it snaps flush onto a build tile and reads face-on in the top-down build view. Returns
// { group, pulses, dyn } — pulses breathe the emissives; dyn holds named handles the live renderer
// animates from machine status (lamp material, spinning parts, progress bar, pod silhouette).
// ~1 cell footprint by design — factory-tile scale.
export function makeMachine(kind, S, envMap) {
  const g = new THREE.Group();
  const pulses = [];
  const dyn = {};
  const dark = 0x161b24, mid = 0x222a36;
  let lampZ = S * 0.9;
  if (kind === 'core') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.4, S * 0.46, S * 1.3, 6), metalMat(mid, envMap));
    body.rotation.x = Math.PI / 2; body.position.z = S * 0.65; body.castShadow = true; g.add(body);
    const ringMat = emissiveMat(0x39d0ff, 1.7); pulses.push({ mat: ringMat, base: 1.7, amp: 0.7 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(S * 0.5, S * 0.07, 12, 32), ringMat);
    ring.position.z = S * 1.15; g.add(ring); g.userData.spin = ring;
    // A torus spinning on its own axis is invisible — orbit a bright bead around it instead.
    const orbit = new THREE.Group(); orbit.position.z = S * 1.15; g.add(orbit);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(S * 0.09, 8, 6), emissiveMat(0xbfefff, 2.2));
    bead.position.x = S * 0.5; orbit.add(bead);
    dyn.orbit = orbit;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(S * 0.34, S * 0.4, 6), metalMat(dark, envMap));
    cap.rotation.x = Math.PI / 2; cap.position.z = S * 1.45; g.add(cap);
    lampZ = S * 1.5;
  } else if (kind === 'extractor') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(S * 0.82, S * 0.82, S * 0.85), metalMat(dark, envMap));
    body.position.z = S * 0.42; body.castShadow = true; g.add(body);
    const drill = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.12, S * 0.12, S * 0.7, 10), metalMat(mid, envMap));
    drill.position.set(-S * 0.42, 0, S * 0.42); drill.rotation.z = Math.PI / 2; drill.castShadow = true; g.add(drill);
    dyn.piston = drill; dyn.pistonBase = -S * 0.42;
    const barMat = emissiveMat(0x62e08a, 1.4); pulses.push({ mat: barMat, base: 1.4, amp: 0.6 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(S * 0.6, S * 0.09, S * 0.06), barMat);
    bar.position.set(0, 0, S * 0.86); g.add(bar);
  } else if (kind === 'gas_tap') {
    // Rounded pressure tank + teal condenser ring + a visible intake turbine — the "tap it,
    // never breach it" machine wears the gas glow color on purpose.
    const tank = new THREE.Mesh(new THREE.SphereGeometry(S * 0.34, 18, 14), metalMat(mid, envMap));
    tank.scale.set(1.08, 1.08, 1.3); tank.position.z = S * 0.44; tank.castShadow = true; g.add(tank);
    const bandMat = emissiveMat(0x2fd4a5, 1.2); pulses.push({ mat: bandMat, base: 1.2, amp: 0.5 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(S * 0.37, S * 0.045, 8, 28), bandMat);
    band.position.z = S * 0.44; g.add(band);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.14, S * 0.19, S * 0.22, 10), metalMat(dark, envMap));
    collar.rotation.x = Math.PI / 2; collar.position.z = S * 0.94; g.add(collar);
    const turbine = new THREE.Group(); turbine.position.z = S * 1.08; g.add(turbine);
    const bladeMat = emissiveMat(0x2fd4a5, 1.5);
    for (let i = 0; i < 3; i++) {
      const a = i * (Math.PI * 2 / 3);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(S * 0.26, S * 0.06, S * 0.03), bladeMat);
      blade.rotation.z = a;
      blade.position.set(Math.cos(a) * S * 0.13, Math.sin(a) * S * 0.13, 0);
      turbine.add(blade);
    }
    dyn.turbine = turbine;
    lampZ = S * 1.1;
  } else if (kind === 'refinery') {
    // Furnace housing: amber process slit on the top face goes hot while running, dead grey
    // when starved (the live renderer drives dyn.furnace intensity).
    const body = new THREE.Mesh(new THREE.BoxGeometry(S * 0.82, S * 0.68, S * 0.64), metalMat(mid, envMap));
    body.position.z = S * 0.32; body.castShadow = true; g.add(body);
    const furnaceMat = emissiveMat(0xff9d4d, 0.25);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(S * 0.52, S * 0.12, S * 0.05), furnaceMat);
    slit.position.z = S * 0.66; g.add(slit);
    dyn.furnace = furnaceMat;
    const hopper = new THREE.Mesh(new THREE.ConeGeometry(S * 0.18, S * 0.28, 4), metalMat(dark, envMap));
    hopper.rotation.x = -Math.PI / 2; hopper.position.set(-S * 0.22, S * 0.16, S * 0.78); hopper.castShadow = true; g.add(hopper);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.08, S * 0.1, S * 0.5, 8), metalMat(0x0e1218, envMap));
    stack.rotation.x = Math.PI / 2; stack.position.set(S * 0.26, -S * 0.18, S * 0.78); stack.castShadow = true; g.add(stack);
    lampZ = S * 1.0;
  } else if (kind === 'fabricator') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(S * 0.86, S * 0.86, S * 0.8), metalMat(mid, envMap));
    body.position.z = S * 0.4; body.castShadow = true; g.add(body);
    const winMat = emissiveMat(0xff9a3c, 1.3); pulses.push({ mat: winMat, base: 1.3, amp: 0.55 });
    const win = new THREE.Mesh(new THREE.BoxGeometry(S * 0.5, S * 0.5, S * 0.08), winMat);
    win.position.z = S * 0.82; g.add(win);
    // Job-progress strip, left-anchored so scale.x reads as a fill bar.
    const stripGeo = new THREE.BoxGeometry(S * 0.62, S * 0.08, S * 0.05);
    stripGeo.translate(S * 0.31, 0, 0);
    const stripMat = emissiveMat(0x39d0ff, 1.4);
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.set(-S * 0.31, -S * 0.34, S * 0.84); strip.scale.x = 0.001; g.add(strip);
    dyn.progressBar = strip;
    lampZ = S * 0.95;
  } else if (kind === 'cargo_port') {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(S * 0.44, S * 0.12, 10, 24), metalMat(mid, envMap));
    collar.position.z = S * 0.28; collar.castShadow = true; g.add(collar);
    const guideMat = emissiveMat(0x39d0ff, 1.5); pulses.push({ mat: guideMat, base: 1.5, amp: 0.9 });
    const guide = new THREE.Mesh(new THREE.TorusGeometry(S * 0.24, S * 0.05, 8, 20), guideMat);
    guide.position.z = S * 0.34; g.add(guide);
    // Waiting courier pod, shown by the live renderer when fleet.podsReady > 0.
    const pod = new THREE.Mesh(new THREE.SphereGeometry(S * 0.16, 12, 10), metalMat(0x8fb7d8, envMap));
    pod.scale.set(1, 1, 1.7); pod.position.z = S * 0.62; pod.castShadow = true; pod.visible = false; g.add(pod);
    dyn.pod = pod;
    lampZ = S * 0.6;
  } else if (kind === 'conduit') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(S * 0.9, S * 0.9, S * 0.1), metalMat(0x0e1218, envMap));
    plate.position.z = S * 0.05; plate.receiveShadow = true; g.add(plate);
    const lineMat = emissiveMat(0x39d0ff, 1.2); pulses.push({ mat: lineMat, base: 1.2, amp: 0.5 });
    const line = new THREE.Mesh(new THREE.BoxGeometry(S * 0.86, S * 0.14, S * 0.06), lineMat);
    line.position.z = S * 0.12; g.add(line);
  }
  if (kind !== 'conduit') {
    // Uniform corner status lamp — the one glyph every machine shares. The live renderer recolors
    // dyn.lamp from machine status; the lab leaves it at idle slate.
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x5a7aa0, emissive: 0x5a7aa0, emissiveIntensity: 1.3, roughness: 0.5, metalness: 0.2,
    });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(S * 0.11, S * 0.11, S * 0.09), lampMat);
    lamp.position.set(S * 0.33, S * 0.33, lampZ);
    g.add(lamp);
    dyn.lamp = lampMat;
  }
  g.userData.dyn = dyn;
  return { group: g, pulses, dyn };
}

// The drilling rover, congruent with the machine language: dark treads, slate hull, cyan canopy,
// warm headlamp block, and a faceted auger mast out the +x nose (flat-shaded 5-sided cone so spin
// actually reads). Built facing +x at cell scale; the live renderer rotates the group per faceDir
// and spins dyn.auger while boring. Returns { group, pulses, dyn: { auger, lampAnchor } }.
export function makeRover(S, envMap) {
  const g = new THREE.Group();
  const pulses = [];
  const dyn = {};
  // Tread base + road wheels (cylinders across z so they read in the top-down view).
  const tread = new THREE.Mesh(new THREE.BoxGeometry(S * 0.68, S * 0.2, S * 0.36), metalMat(0x0c111c, envMap));
  tread.position.y = -S * 0.22; tread.castShadow = true; g.add(tread);
  const wheelGeo = new THREE.CylinderGeometry(S * 0.095, S * 0.095, S * 0.42, 10);
  const wheelMat = metalMat(0x1b2434, envMap);
  for (const wx of [-0.24, 0, 0.24]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(S * wx, -S * 0.26, 0);
    w.castShadow = true;
    g.add(w);
  }
  // Hull + sloped nose.
  const hull = new THREE.Mesh(new THREE.BoxGeometry(S * 0.58, S * 0.26, S * 0.32), metalMat(0x26324a, envMap));
  hull.position.y = -S * 0.02; hull.castShadow = true; g.add(hull);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(S * 0.2, S * 0.2, S * 0.28), metalMat(0x26324a, envMap));
  nose.position.set(S * 0.32, -S * 0.06, 0); nose.rotation.z = -0.3; nose.castShadow = true; g.add(nose);
  // Canopy — the pilot light.
  const canopyMat = emissiveMat(0x39d0ff, 1.1); pulses.push({ mat: canopyMat, base: 1.1, amp: 0.25 });
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(S * 0.2, S * 0.13, S * 0.24), canopyMat);
  canopy.position.set(-S * 0.06, S * 0.17, 0); g.add(canopy);
  // Headlamp emitter block: the live renderer parents its SpotLight here.
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(S * 0.07, S * 0.09, S * 0.14), emissiveMat(0xffe5a4, 1.7));
  lamp.position.set(S * 0.34, S * 0.05, 0); g.add(lamp);
  dyn.lampAnchor = lamp;
  // Auger mast in a holder so it can spin about its own long axis (+x after the holder turn).
  const holder = new THREE.Group();
  holder.position.set(S * 0.55, -S * 0.04, 0);
  holder.rotation.z = -Math.PI / 2;
  g.add(holder);
  const augerMat = new THREE.MeshStandardMaterial({
    color: 0x8b97ad, roughness: 0.35, metalness: 0.85, envMap: envMap || null, flatShading: true,
  });
  const auger = new THREE.Mesh(new THREE.ConeGeometry(S * 0.13, S * 0.44, 5), augerMat);
  auger.castShadow = true;
  holder.add(auger);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(S * 0.05, 8, 6), emissiveMat(0x39d0ff, 1.5));
  tip.position.y = S * 0.22; auger.add(tip);
  dyn.auger = auger;
  g.userData.dyn = dyn;
  return { group: g, pulses, dyn };
}

function machineBase(group, x, y, z, envMap) {
  const g = new THREE.Group(); g.position.set(x, y, z); group.add(g);
  return g;
}

function buildMachines(group, S, depth, envMap, pulseTargets) {
  const bodyDark = 0x161b24, bodyMid = 0x222a36;
  const z = depth * 0.55;
  // Massline Core — the anchor: hex column with a spinning emissive ring
  {
    const g = machineBase(group, 0, (ROWS / 2 - 8.5) * S, z, envMap);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.5, S * 0.62, S * 2.4, 6), metalMat(bodyMid, envMap));
    col.castShadow = true; g.add(col);
    const ringMat = emissiveMat(0x39d0ff, 1.6); pulseTargets.push({ mat: ringMat, base: 1.6, amp: 0.7 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(S * 0.72, S * 0.09, 12, 32), ringMat);
    ring.position.y = S * 0.2; ring.rotation.x = Math.PI / 2; g.add(ring);
    g.userData.spin = ring;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(S * 0.5, S * 0.5, 6), metalMat(bodyDark, envMap));
    cap.position.y = S * 1.45; cap.castShadow = true; g.add(cap);
  }
  // Geological Extractor — box body with a drill barrel reaching into the left ore wall + status bar
  {
    const g = machineBase(group, (10 - COLS / 2 + 1.2) * S, (ROWS / 2 - 8.5) * S, z, envMap);
    const body = new THREE.Mesh(new THREE.BoxGeometry(S * 1.4, S * 1.4, S * 1.1), metalMat(bodyDark, envMap));
    body.castShadow = true; g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.22, S * 0.22, S * 1.6, 12), metalMat(bodyMid, envMap));
    barrel.rotation.z = Math.PI / 2; barrel.position.x = -S * 1.1; barrel.castShadow = true; g.add(barrel);
    const bitMat = emissiveMat(0xffb35c, 1.0); pulseTargets.push({ mat: bitMat, base: 1.0, amp: 0.6 });
    const bit = new THREE.Mesh(new THREE.ConeGeometry(S * 0.26, S * 0.5, 12), bitMat);
    bit.rotation.z = Math.PI / 2; bit.position.x = -S * 2.0; g.add(bit);
    const barMat = emissiveMat(0x62e08a, 1.3);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(S * 1.0, S * 0.12, S * 0.12), barMat);
    bar.position.set(0, S * 0.82, S * 0.5); g.add(bar);
  }
  // Fabricator — wider housing with a glowing amber process window
  {
    const g = machineBase(group, (18 - COLS / 2 + 0.5) * S, (ROWS / 2 - 8.5) * S, z, envMap);
    const body = new THREE.Mesh(new THREE.BoxGeometry(S * 1.7, S * 1.5, S * 1.1), metalMat(bodyMid, envMap));
    body.castShadow = true; g.add(body);
    const winMat = emissiveMat(0xff9a3c, 1.1); pulseTargets.push({ mat: winMat, base: 1.1, amp: 0.5 });
    const win = new THREE.Mesh(new THREE.BoxGeometry(S * 1.0, S * 0.7, S * 0.1), winMat);
    win.position.z = S * 0.56; g.add(win);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.18, S * 0.22, S * 0.9, 8), metalMat(0x0e1218, envMap));
    stack.position.set(S * 0.5, S * 1.1, 0); stack.castShadow = true; g.add(stack);
  }
  // Cargo Port — at the top of the access shaft, a docking collar with a cyan guide light
  {
    const g = machineBase(group, (14.5 - COLS / 2) * S, (ROWS / 2 - 2.0) * S, z, envMap);
    const ringMat = metalMat(bodyMid, envMap);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(S * 0.7, S * 0.18, 10, 24), ringMat);
    collar.rotation.x = Math.PI / 2; collar.castShadow = true; g.add(collar);
    const guideMat = emissiveMat(0x39d0ff, 1.4); pulseTargets.push({ mat: guideMat, base: 1.4, amp: 0.9 });
    const guide = new THREE.Mesh(new THREE.TorusGeometry(S * 0.42, S * 0.06, 8, 20), guideMat);
    guide.rotation.x = Math.PI / 2; guide.position.y = -S * 0.1; g.add(guide);
  }
}

// emissive conduit ribbons on the chamber floor connecting the machines (power=amber, lane=cyan)
function buildConduits(group, S, depth, pulseTargets) {
  const z = depth * 0.32, floorY = (ROWS / 2 - 9.2) * S;
  const seg = (x0, x1, color, ei) => {
    const mat = emissiveMat(color, ei);
    const len = Math.abs(x1 - x0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, S * 0.08, S * 0.08), mat);
    m.position.set((x0 + x1) / 2, floorY, z);
    group.add(m);
    return mat;
  };
  const lane = seg((10 - COLS / 2 + 1.2) * S, (18 - COLS / 2 + 0.5) * S, 0x39d0ff, 1.0);
  const power = seg((10 - COLS / 2 + 1.2) * S, 0, 0xffb35c, 0.9);
  pulseTargets.push({ mat: lane, base: 1.0, amp: 0.6 }, { mat: power, base: 0.9, amp: 0.5 });
}

// ---------------------------------------------------------------- main entry
export async function runAsteroidInteriorLab(SF) {
  const state = SF.state || (SF.SF && SF.SF.state);
  const render = state && state.render;
  const renderer = render && render.renderer;
  const scene = render && render.scene;
  if (!renderer || !scene) { console.warn('[astlab] no live renderer/scene'); return null; }
  console.log('[astlab] starting interior look lab');

  // wait briefly for the PMREM nebula env-map bake (metallic machines want it; rock does not)
  for (let i = 0; i < 30 && !render.envMap; i++) await new Promise((r) => setTimeout(r, 100));
  const envMap = render.envMap || scene.environment || null;
  console.log('[astlab] envMap', envMap ? 'ready' : 'none (lights only)');

  // hide the live entities so the cutaway owns the frame (restored on stop)
  const hidden = [];
  for (const child of scene.children) { if (child.userData && child.userData.kind) { child.visible = false; hidden.push(child); } }

  const group = new THREE.Group();
  group.userData.astlab = true;
  scene.add(group);

  const S = 2.2, depth = S * 1.5;
  const mats = makeRockMaterials(envMap);
  const pulseTargets = [];
  const grid = buildLayout();
  const { oreCells, gasCells } = buildRock(group, grid, S, depth, mats);
  buildOre(group, oreCells, S, depth, envMap, pulseTargets);
  buildGas(group, gasCells, S, depth, pulseTargets);
  buildMachines(group, S, depth, envMap, pulseTargets);
  buildConduits(group, S, depth, pulseTargets);

  // dedicated light rig for the cutaway: a warm key raking across the face (real shadows into the
  // cavities), a cool rim for edge read, and a soft fill. Added to the group so stop() removes them.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
  key.position.set(-COLS * S * 0.35, ROWS * S * 0.5, depth * 6 + 40);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -COLS * S * 0.7; sc.right = COLS * S * 0.7; sc.top = ROWS * S * 0.7; sc.bottom = -ROWS * S * 0.7;
  sc.near = 1; sc.far = depth * 20 + 120; sc.updateProjectionMatrix();
  group.add(key); group.add(key.target);
  const rim = new THREE.DirectionalLight(0x6a86ff, 0.75);
  rim.position.set(COLS * S * 0.5, -ROWS * S * 0.4, -depth * 4);
  group.add(rim); group.add(rim.target);
  const fill = new THREE.DirectionalLight(0xbfd0ff, 0.5);
  fill.position.set(0, 0, depth * 8 + 60);
  group.add(fill); group.add(fill.target);
  // a warm work-light down in the machine chamber so the installed hardware reads against the stone
  const workLight = new THREE.PointLight(0xffcf9a, 16, S * 18, 2);
  workLight.position.set(0, (ROWS / 2 - 8) * S, depth * 3);
  group.add(workLight);

  // orthographic cross-section camera, tilted a touch so cavity depth + box sides read
  const aspect = renderer.domElement.width / renderer.domElement.height || 1.6;
  const halfH = ROWS * S * 0.62;
  const cam = new THREE.OrthographicCamera(-halfH * aspect, halfH * aspect, halfH, -halfH, 0.1, 2000);
  const camDist = 200;
  const baseYaw = 0.22, basePitch = 0.16;

  // dedicated composer: render → bloom (emissives only) → tonemap/output
  const size = new THREE.Vector2(); renderer.getSize(size);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.85, 0.6, 0.55);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let raf = 0, stopped = false, ready = false;
  // One synchronous frame: pose the camera, breathe the emissives, spin the core, render the composer.
  // Kept synchronous so a capture harness can call renderFrame() then toDataURL() in the same task and
  // reliably read THIS frame back, regardless of the game's own render loop sharing the canvas.
  const renderFrame = (t) => {
    const yaw = baseYaw + Math.sin(t * 0.25) * 0.06;
    const pitch = basePitch + Math.sin(t * 0.19) * 0.03;
    cam.position.set(Math.sin(yaw) * camDist, Math.sin(pitch) * camDist, Math.cos(yaw) * Math.cos(pitch) * camDist);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    key.target.position.set(0, 0, 0); rim.target.position.set(0, 0, 0);
    for (const p of pulseTargets) p.mat.emissiveIntensity = p.base + Math.sin(t * 1.6 + p.base * 3) * p.amp;
    for (const c of group.children) if (c.userData && c.userData.spin) c.userData.spin.rotation.z = t * 0.6;
    try { composer.render(); } catch (e) { if (!ready) console.warn('[astlab] composer render failed, falling back', e); renderer.render(scene, cam); }
  };
  const loop = () => {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    renderFrame((typeof performance !== 'undefined' ? performance.now() : 0) / 1000);
    if (!ready) { ready = true; try { window.__astlabReady = true; } catch (_) {} console.log('[astlab] first frame rendered'); }
  };
  loop();

  const handle = {
    group, camera: cam, composer,
    renderFrame: () => renderFrame((typeof performance !== 'undefined' ? performance.now() : 0) / 1000),
    stop() {
      stopped = true; cancelAnimationFrame(raf);
      scene.remove(group);
      for (const child of hidden) child.visible = true;
      try { composer.dispose && composer.dispose(); } catch (_) {}
      try { window.__astlabReady = false; } catch (_) {}
    },
  };
  try { window.__astlab = handle; } catch (_) {}
  return handle;
}
