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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
    matrix: new THREE.MeshStandardMaterial({ color: 0x8a7357, roughness: 0.96, metalness: 0.05,
      bumpMap: bump, bumpScale: 0.75, envMap: envMap || null, envMapIntensity: 0.3 }),
    basalt: new THREE.MeshStandardMaterial({ color: 0x454a58, roughness: 0.82, metalness: 0.12,
      bumpMap: bump, bumpScale: 0.9, envMap: envMap || null, envMapIntensity: 0.4 }),
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

// ---------------------------------------------------------------- Motherload-3D cell kit
// The works playfield reads as a cut rock face: every solid cell is the SAME block — a full-footprint
// unit with a beveled front pad, so the grid reads as masonry joints without any overlay lines. All
// variation lives INSIDE the face (relief, tint, bump); the footprint never lies about the sim grid.
// Local space: footprint x/y in [-0.5, 0.5], front pad at z=0, body extends to z=-1.

function pushQuad(pos, nrm, uv, a, b, c, d, uvs) {
  // two triangles a-b-c, a-c-d
  pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const [ua, ub, uc, ud] = uvs;
  uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
  for (let i = 0; i < 6; i++) nrm.push(0, 0, 0); // computeVertexNormals gives flat facets
}

// 3 block variants: IDENTICAL silhouette (one thin uniform grout), differing only in pad lift so
// raking light gives faint relief variety. Deterministic per cell.
// Design law §2.1: the pad cap is a FLAT SQUARE face — no beveled pyramid fan, no relief bulge —
// and every footprint reads as the same square. A wide or varying chamfer turns the chess board
// into loose bricks (2026-08-21 review of the first theater build), so the grout stays ≈2% per side.
export function makeCellBlockGeos() {
  const variants = [
    { bev: 0.018, lift: 0.012 },
    { bev: 0.018, lift: 0.018 },
    { bev: 0.018, lift: 0.024 },
  ];
  return variants.map((v) => {
    const pos = [], nrm = [], uv = [];
    const p = 0.5 - v.bev;                    // pad half-extent
    const zF = v.lift;                        // pad plane (proud of z=0)
    const zB = -v.bev * 1.7;                  // full footprint resumes here
    const pad = { pp: [p, p, zF], pn: [p, -p, zF], np: [-p, p, zF], nn: [-p, -p, zF] };
    // pad cap: one flat quad (wound CCW seen from +z)
    pushQuad(pos, nrm, uv, pad.np, pad.nn, pad.pn, pad.pp, [[0, 1], [0, 0], [1, 0], [1, 1]]);
    // bevel ring (pad edge → full footprint at zB), wound outward
    const out = { pp: [0.5, 0.5, zB], pn: [0.5, -0.5, zB], np: [-0.5, 0.5, zB], nn: [-0.5, -0.5, zB] };
    pushQuad(pos, nrm, uv, pad.pn, out.pn, out.pp, pad.pp, [[1, 0], [1, 0.04], [1, 0.96], [1, 1]]);
    pushQuad(pos, nrm, uv, pad.nn, out.nn, out.pn, pad.pn, [[0, 0], [0, 0.04], [1, 0.04], [1, 0]]);
    pushQuad(pos, nrm, uv, pad.np, out.np, out.nn, pad.nn, [[0, 1], [0, 0.96], [0, 0.04], [0, 0]]);
    pushQuad(pos, nrm, uv, pad.pp, out.pp, out.np, pad.np, [[1, 1], [1, 0.96], [0, 0.96], [0, 1]]);
    // side walls (zB → z=-1)
    const bak = { pp: [0.5, 0.5, -1], pn: [0.5, -0.5, -1], np: [-0.5, 0.5, -1], nn: [-0.5, -0.5, -1] };
    pushQuad(pos, nrm, uv, out.pn, bak.pn, bak.pp, out.pp, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    pushQuad(pos, nrm, uv, out.nn, bak.nn, bak.pn, out.pn, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    pushQuad(pos, nrm, uv, out.np, bak.np, bak.nn, out.nn, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    pushQuad(pos, nrm, uv, out.pp, bak.pp, bak.np, out.np, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    // back cap
    pushQuad(pos, nrm, uv, bak.pp, bak.pn, bak.nn, bak.np, [[1, 1], [1, 0], [0, 0], [0, 1]]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  });
}

// A mineral cluster erupting from the rock face: a crust knob + a fan of flat-shaded crystal shards.
// Local space: base sits on the face plane (z≈0), crystals grow toward +z, footprint ~1 across.
// Merge once; instance per vein cell with in-plane rotation / scale for variety.
export function makeOreClusterGeo(variant = 0) {
  const parts = [];
  const rnd = (i, salt) => hash2(i * 7 + variant * 31 + 5, salt * 13 + variant + 3);
  // tight crust knob the shards erupt from
  const crust = new THREE.DodecahedronGeometry(0.17, 0);
  crust.scale(1.05, 0.85, 0.4);
  crust.translate(0, 0, 0.03);
  parts.push(crust);
  const n = variant % 2 === 0 ? 5 : 4;
  const base = new THREE.Matrix4().makeRotationX(Math.PI / 2); // cone +y → +z (out of the face)
  for (let i = 0; i < n; i++) {
    const h = 0.16 + rnd(i, 1) * 0.12;
    const r = 0.05 + rnd(i, 2) * 0.028;
    const shard = new THREE.ConeGeometry(r, h, 5);
    shard.translate(0, h / 2, 0);
    const a = (i / n) * Math.PI * 2 + rnd(i, 3) * 0.9;
    const tilt = i === 0 ? 0.06 : 0.24 + rnd(i, 4) * 0.3;
    const tiltAxis = new THREE.Vector3(Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2), 0).normalize();
    const m = new THREE.Matrix4().makeRotationZ(a)
      .multiply(new THREE.Matrix4().makeRotationAxis(tiltAxis, tilt))
      .multiply(base);
    shard.applyMatrix4(m);
    shard.translate(Math.cos(a) * (0.03 + rnd(i, 6) * 0.09), Math.sin(a) * (0.03 + rnd(i, 6) * 0.09),
      0.03 + rnd(i, 7) * 0.03);
    parts.push(shard);
  }
  // mergeGeometries refuses mixed indexed/non-indexed inputs (cones are indexed, the crust is
  // not) — normalize everything to non-indexed first.
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// Pocket of pressurized vapor: three hash-displaced lobes merged into one churning mass.
// Compact — it seethes INSIDE the cell, cradled by the block's bevel. Geometry carries the
// structure (faceted, lit, occluding); no alpha-gradient stand-ins.
export function makeGasVaporGeo() {
  const lobes = [
    { p: [-0.1, 0.06, 0.08], s: [0.2, 0.17, 0.14] },
    { p: [0.11, -0.08, 0.07], s: [0.18, 0.16, 0.13] },
    { p: [0.01, 0.02, 0.13], s: [0.24, 0.2, 0.17] },
  ];
  const parts = lobes.map((L, li) => {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const j = 1 + (hash2(i * 3 + li * 17, li * 5 + 1) - 0.5) * 0.55;
      pos.setXYZ(i, v.x * j, v.y * j, v.z * j);
    }
    geo.computeVertexNormals();
    geo.scale(L.s[0], L.s[1], L.s[2]);
    geo.translate(L.p[0], L.p[1], L.p[2]);
    return geo;
  });
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// Jagged crack strips that lie on a block face (z≈0): the "this cell is unstable" fissure language.
export function makeCrackGeos() {
  const geos = [];
  for (let v = 0; v < 3; v++) {
    const pos = [], nrm = [], uv = [];
    const pts = [];
    let y = (hash2(v, 1) - 0.5) * 0.34;
    for (let i = 0; i <= 4; i++) {
      pts.push([-0.32 + (i / 4) * 0.64, y]);
      y += (hash2(v * 9 + i, 2) - 0.5) * 0.3;
      y = Math.max(-0.3, Math.min(0.3, y));
    }
    // one branch off the middle segment (null = pen-stroke break)
    const [bx, by] = pts[2];
    pts.push(null);
    pts.push([bx, by]);
    pts.push([bx + (hash2(v, 5) - 0.5) * 0.22, by + 0.14 + hash2(v, 6) * 0.12]);
    const w = 0.024;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (!a || !b) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * w, ny = (dx / len) * w;
      pushQuad(pos, nrm, uv,
        [a[0] + nx, a[1] + ny, 0], [a[0] - nx, a[1] - ny, 0],
        [b[0] - nx, b[1] - ny, 0], [b[0] + nx, b[1] + ny, 0],
        [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geos.push(geo);
  }
  return geos;
}

// The drilling rover, rebuilt to read as a vehicle at table scale: hazard-yellow track guard over
// treads with spinning road wheels, gunmetal hull, warm cabin window, blinking roof beacon, rear
// cable socket (the umbilical lands there), headlamp bar, and an articulated drill arm whose auger
// extends and spins while boring. Built facing +x at cell scale; the live renderer flips the body
// for left travel, aims dyn.arm at the dig direction, spins dyn.auger, and bobs dyn.body.
// Returns { group, pulses, dyn: { body, wheels, beacon, arm, auger, augerSlide, lampAnchor, socket } }.
export function makeRover(S, envMap) {
  const g = new THREE.Group();
  const pulses = [];
  const dyn = { wheels: [] };
  const frame = metalMat(0x11161f, envMap);
  const hullMat = metalMat(0x2c3648, envMap);
  const paint = metalMat(0xc98f2e, envMap);
  paint.roughness = 0.52;

  const body = new THREE.Group();
  body.position.y = -S * 0.06; // treads ride near the tunnel floor
  g.add(body);
  dyn.body = body;

  // tread pod + hazard track guard
  const tread = new THREE.Mesh(new THREE.BoxGeometry(S * 0.78, S * 0.2, S * 0.36), frame);
  tread.position.y = -S * 0.24; tread.castShadow = true; body.add(tread);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(S * 0.82, S * 0.05, S * 0.4), paint);
  guard.position.y = -S * 0.115; guard.castShadow = true; body.add(guard);
  // road wheels (groups so rotation.z spins the disc + spoke in screen plane)
  const wheelGeo = new THREE.CylinderGeometry(S * 0.082, S * 0.082, S * 0.05, 12);
  for (const wx of [-0.26, 0, 0.26]) {
    const wg = new THREE.Group();
    wg.position.set(S * wx, -S * 0.24, S * 0.19);
    const w = new THREE.Mesh(wheelGeo, metalMat(0x39445c, envMap));
    w.rotation.x = Math.PI / 2;
    w.castShadow = true;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(S * 0.13, S * 0.026, S * 0.056), frame);
    wg.add(w, spoke);
    body.add(wg);
    dyn.wheels.push(wg);
  }
  // hull + sloped nose plate
  const hull = new THREE.Mesh(new THREE.BoxGeometry(S * 0.6, S * 0.26, S * 0.4), hullMat);
  hull.position.set(-S * 0.04, S * 0.04, 0); hull.castShadow = true; body.add(hull);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(S * 0.2, S * 0.22, S * 0.36), paint);
  nose.position.set(S * 0.3, S * 0.02, 0); nose.rotation.z = -0.32; nose.castShadow = true; body.add(nose);
  // cabin + warm window slit
  const cab = new THREE.Mesh(new THREE.BoxGeometry(S * 0.22, S * 0.2, S * 0.32), hullMat);
  cab.position.set(-S * 0.2, S * 0.24, 0); cab.castShadow = true; body.add(cab);
  const winMat = emissiveMat(0xffd9a0, 1.0);
  pulses.push({ mat: winMat, base: 1.0, amp: 0.12 });
  const win = new THREE.Mesh(new THREE.BoxGeometry(S * 0.1, S * 0.09, S * 0.33), winMat);
  win.position.set(-S * 0.13, S * 0.25, 0); body.add(win);
  // roof beacon (blinks while driving, strobes while boring)
  const beaconMat = emissiveMat(0xffb23e, 0.5);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.015, S * 0.02, S * 0.09, 6), frame);
  mast.position.set(-S * 0.2, S * 0.38, 0); body.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(S * 0.045, 8, 6), beaconMat);
  beacon.position.set(-S * 0.2, S * 0.43, 0); body.add(beacon);
  dyn.beacon = beaconMat;

  // rear cable socket — the umbilical's landing collar
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.06, S * 0.075, S * 0.1, 10), frame);
  socket.rotation.z = Math.PI / 2; socket.position.set(-S * 0.36, S * 0.1, 0); body.add(socket);
  const collarMat = emissiveMat(0x0ea5e9, 1.2);
  pulses.push({ mat: collarMat, base: 1.2, amp: 0.3 });
  const collar = new THREE.Mesh(new THREE.TorusGeometry(S * 0.065, S * 0.018, 8, 16), collarMat);
  collar.rotation.y = Math.PI / 2; collar.position.set(-S * 0.4, S * 0.1, 0); body.add(collar);
  dyn.socket = socket;

  // headlamp bar — lampAnchor keeps the SpotLight parenting contract
  const lampBar = new THREE.Group();
  lampBar.position.set(S * 0.3, S * 0.16, 0); body.add(lampBar);
  const lampMat = emissiveMat(0xffe5a4, 1.7);
  for (const lz of [-0.1, 0.1]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.035, S * 0.045, S * 0.05, 8), lampMat);
    lamp.rotation.z = -Math.PI / 2; lamp.position.set(0, 0, S * lz); lampBar.add(lamp);
  }
  dyn.lampAnchor = lampBar;

  // articulated drill arm: shoulder at the nose, aims at the dig direction
  const arm = new THREE.Group();
  arm.position.set(S * 0.34, S * 0.02, 0);
  body.add(arm);
  dyn.arm = arm;
  const armSeg = new THREE.Mesh(new THREE.BoxGeometry(S * 0.3, S * 0.07, S * 0.09), paint);
  armSeg.position.x = S * 0.15; armSeg.castShadow = true; arm.add(armSeg);
  const piston = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.025, S * 0.025, S * 0.26, 8), frame);
  piston.rotation.z = Math.PI / 2; piston.position.set(S * 0.12, -S * 0.055, 0); arm.add(piston);
  // slide the auger rides on — extends while boring so the bit visibly bites the wall
  const slide = new THREE.Group();
  slide.position.x = S * 0.3;
  arm.add(slide);
  dyn.augerSlide = slide;
  const holder = new THREE.Group();
  holder.rotation.z = -Math.PI / 2; // child +y points along arm +x
  slide.add(holder);
  const augerMat = new THREE.MeshStandardMaterial({
    color: 0x9aa4b8, roughness: 0.32, metalness: 0.88, envMap: envMap || null, flatShading: true,
  });
  const auger = new THREE.Mesh(new THREE.ConeGeometry(S * 0.13, S * 0.46, 6), augerMat);
  auger.castShadow = true;
  holder.add(auger);
  // welded spiral fins so the spin reads at distance
  for (let i = 0; i < 3; i++) {
    const a = i * (Math.PI * 2 / 3);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(S * 0.2, S * 0.018, S * 0.045), frame);
    fin.position.set(Math.cos(a) * S * 0.05, 0, Math.sin(a) * S * 0.05);
    fin.rotation.y = -a;
    fin.rotation.z = 0.45;
    auger.add(fin);
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(S * 0.045, S * 0.12, 5), emissiveMat(0x39d0ff, 1.4));
  tip.position.y = S * 0.27; auger.add(tip);
  dyn.auger = auger;

  g.userData.dyn = dyn;
  return { group: g, pulses, dyn };
}

// The surface winch derrick the tether spools from: two A-legs straddling the entry shaft, a
// hazard-painted crossbeam, a winch drum with lit collars, and a slow beacon. Group origin sits at
// the plateau top over the shaft; the cable hangs from dyn.drum.
export function makeDerrick(S, envMap) {
  const g = new THREE.Group();
  const pulses = [];
  const dyn = {};
  const frame = metalMat(0x1a2130, envMap);
  const paint = metalMat(0xc98f2e, envMap);
  paint.roughness = 0.55;
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(S * 0.09, S * 1.5, S * 0.12), frame);
    leg.position.set(sx * S * 0.5, S * 0.6, 0);
    leg.rotation.z = -sx * 0.22;
    leg.castShadow = true;
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(S * 0.26, S * 0.07, S * 0.3), paint);
    foot.position.set(sx * S * 0.66, -S * 0.08, 0);
    g.add(foot);
    // cross brace
    const brace = new THREE.Mesh(new THREE.BoxGeometry(S * 1.1, S * 0.05, S * 0.06), frame);
    brace.position.set(0, S * 0.45, 0);
    g.add(brace);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(S * 1.35, S * 0.1, S * 0.14), paint);
  beam.position.y = S * 1.32; beam.castShadow = true; g.add(beam);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.13, S * 0.13, S * 0.3, 14),
    metalMat(0x39445c, envMap));
  drum.rotation.x = Math.PI / 2; drum.position.set(0, S * 1.14, 0); drum.castShadow = true; g.add(drum);
  const drumRingMat = emissiveMat(0x0ea5e9, 1.1);
  pulses.push({ mat: drumRingMat, base: 1.1, amp: 0.35 });
  for (const dz of [-0.14, 0.14]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(S * 0.135, S * 0.02, 8, 20), drumRingMat);
    ring.position.set(0, S * 1.14, S * dz); g.add(ring);
  }
  dyn.drum = drum;
  const beaconMat = emissiveMat(0xffb23e, 0.8);
  pulses.push({ mat: beaconMat, base: 0.8, amp: 0.5 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(S * 0.05, 8, 6), beaconMat);
  beacon.position.set(S * 0.6, S * 1.42, 0); g.add(beacon);
  dyn.beacon = beaconMat;
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
