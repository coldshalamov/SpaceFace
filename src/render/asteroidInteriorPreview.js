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
// Rock materials.
//
// TWO MODES, one contract. Passing `surface` (the decoded common-rock map set from
// src/render/rockSurfaceLibrary.js — { baseColor, normal, orm }) builds the SAME PBR stone the
// flight world puts on every asteroid: authored basecolor + normal + packed ORM, roughness/
// metalness driven by the map (roughness 1 / metalness 1 are multipliers over the ORM channels,
// exactly as visualFactory's astMaterial does it). The tints below are multipliers over that dark
// authored albedo (texture linear mean ≈ 0.047) chosen so a lit cell face lands on the design law
// §3.5 targets — silicate matrix #7a6955, dense basalt #453f3a — through the shared ACES composite.
//
// Without `surface` (the ?dev=astlab harness, and any host that has not decoded the library) the
// materials fall back to the old flat-colour + procedural bump pair so the lab still renders.
export function makeRockMaterials(envMap, surface = null) {
  if (!surface || !surface.baseColor) {
    const bump = makeRockBumpTexture(256);
    return {
      // NB: no vertexColors here. The ?dev=astlab harness feeds these same materials plain
      // BoxGeometry/DodecahedronGeometry with no colour attribute, and a USE_COLOR program with no
      // attribute bound reads (0,0,0) — every rock would render black.
      matrix: new THREE.MeshStandardMaterial({ color: 0x8a7357, roughness: 0.96, metalness: 0.05,
        bumpMap: bump, bumpScale: 0.75, envMap: envMap || null, envMapIntensity: 0.3 }),
      basalt: new THREE.MeshStandardMaterial({ color: 0x454a58, roughness: 0.82, metalness: 0.12,
        bumpMap: bump, bumpScale: 0.9, envMap: envMap || null, envMapIntensity: 0.4 }),
      ice: new THREE.MeshStandardMaterial({ color: 0xb9d6d8, roughness: 0.26, metalness: 0.0,
        bumpMap: bump, bumpScale: 0.3, envMap: envMap || null, envMapIntensity: 1.2 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x6f5b48, roughness: 0.78, metalness: 0.22,
        bumpMap: bump, bumpScale: 0.85, envMap: envMap || null, envMapIntensity: 0.5 }),
      exotic: new THREE.MeshStandardMaterial({ color: 0x352a4d, roughness: 0.62, metalness: 0.18,
        bumpMap: bump, bumpScale: 0.8, envMap: envMap || null, envMapIntensity: 0.7 }),
      gas: new THREE.MeshStandardMaterial({ color: 0x4a4a36, roughness: 0.94, metalness: 0.04,
        bumpMap: bump, bumpScale: 1.0, envMap: envMap || null, envMapIntensity: 0.25 }),
    };
  }
  const build = (tint, normalScale, roughMul, metalMul, envI) => new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(tint[0], tint[1], tint[2]),
    map: surface.baseColor,
    normalMap: surface.normal,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    aoMap: surface.orm,
    aoMapIntensity: 0.85,
    roughnessMap: surface.orm,
    metalnessMap: surface.orm,
    roughness: roughMul,
    metalness: metalMul,
    envMap: envMap || null,
    envMapIntensity: envI,
    // carries makeCellBlockGeos' baked joint/cavity occlusion (and multiplies the instance tint)
    vertexColors: true,
  });
  // The tints are SOLVED, not eyeballed: authored basecolour linear mean (0.0471, 0.0384, 0.0287)
  // × tint = the albedo that, under the works light rig, comes out of the shared ACES composite
  // (exposure 1.25, grade off) on the law's §3.5 hex. Both tints run cool because both the stone
  // and the key light are already warm — a warm tint on top is exactly the tan wash the owner
  // rejected ("L* 63.9 measured against the law's 45.5").
  // PQ-130.04 — SIX HOSTS, NOT TWO. Design law §3.5 asks every material to differ in three channels
  // at once (hue + surface pattern + inclusion shape). Hue can ride the per-instance tint, but
  // ROUGHNESS, METALNESS and ENV INTENSITY cannot — and "pale glassy ice" and "obviously-not-normal
  // violet" are exactly those. So each host material row below is a real material, and buildRock()
  // buckets cells onto it. The extra tints were solved the same way the first two were: fitting the
  // measured tint→sRGB response of this rig (out ≈ A·tint^g per channel, anchored on the matrix and
  // basalt pair) and inverting it onto the law's hex.
  return {
    // Silicate matrix — the anonymous warm stone. Target #7a6955 (L* 45.5).
    matrix: build([1.29, 1.62, 1.95], 1.35, 1.0, 1.0, 0.30),
    // Dense basalt — darker, cooler, less rough, so it takes a sheen the matrix never does.
    // Target #453f3a.
    basalt: build([0.38, 0.61, 1.03], 1.15, 0.86, 1.35, 0.42),
    // Iron/metal seam host — rust-toned rock. Target #6f5b48. Slightly less rough than the matrix
    // so the branching vein's metal has a host that can hold a soft sheen beside it.
    metal: build([1.05, 1.23, 1.48], 1.30, 0.94, 1.15, 0.36),
    // Deep exotic host — target #352a4d. The red and green multipliers are crushed hard on purpose:
    // this is the one stone in the mine that is not a brown, and it must read as wrong.
    exotic: build([0.22, 0.28, 1.65], 1.10, 0.72, 1.20, 0.60),
    // Ice — target #b9d6d8. THE ONE COLD MATERIAL: bright pale albedo, low roughness and a high env
    // intensity so it takes a real specular off the work lamp and a cold reflection off the sky
    // panel. That reflection standing in front of a bright body is the "slight transmission look"
    // without paying for a transmission pass on this screen's private context.
    ice: build([3.16, 6.32, 9.25], 0.55, 0.30, 0.30, 1.25),
    // Gas pocket host — target #4a4a36, a dead olive. Rougher than anything else and almost no env:
    // the pocket must never catch a highlight, because a highlight is what makes a cell read as
    // treasure. Its danger is carried by the cracks and the dark core, not by brightness.
    gas: build([0.44, 0.83, 0.91], 1.45, 1.12, 0.55, 0.14),
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

// Paint: a matte industrial coat, not a plastic toy. Roughness stays high so painted panels read
// as sprayed steel next to the polished machined parts.
export function paintMat(color, envMap, rough = 0.58) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.25, envMap: envMap || null });
}

// Single-cell placeable devices for the interactive build lab AND the live works renderer. Each is
// built at LOCAL origin (cell centre at 0,0, floor at z=0) and extrudes toward the camera (+z), so
// it snaps flush onto a build tile and reads face-on in the top-down build view. Returns
// { group, pulses, dyn } — dyn holds named handles the live renderer animates from machine status
// (lamp material, spinning parts, progress slider, pod silhouette).
//
// LAW §2.7 — THESE ARE OBJECTS, NOT ICONS. No emissive rings, bars or halos. Every part is real
// hardware with metal roughness/metalness, a chamfered plinth, bolts, and cast shadows. The only
// light-emitting parts left are things that would genuinely emit: the shared corner status lamp,
// the refinery furnace slit, and the fabricator viewport. Everything that used to be a glowing
// torus is now a machined collar, a counterweight, a heat sink or a guide rail.
export function makeMachine(kind, S, envMap) {
  const g = new THREE.Group();
  const pulses = [];
  const dyn = {};
  const dark = 0x1a1712, mid = 0x2c2a28, steel = 0x6d7075, brass = 0x8a6b3a;
  let lampZ = S * 0.9;

  // Every machine is bolted to the rock on the same chamfered plinth — a shared silhouette cue
  // that reads "installed equipment" before you can tell which machine it is.
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(S * 0.94, S * 0.94, S * 0.14), paintMat(0x35302a, envMap, 0.72));
  plinth.position.z = S * 0.07;
  plinth.castShadow = true; plinth.receiveShadow = true;
  g.add(plinth);
  for (const bx of [-1, 1]) {
    for (const by of [-1, 1]) {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.035, S * 0.035, S * 0.05, 6), metalMat(steel, envMap));
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(bx * S * 0.38, by * S * 0.38, S * 0.16);
      g.add(bolt);
    }
  }

  if (kind === 'gas_tap') {
    // Gas tap: a pressure vessel in a strap cradle with a real intake turbine. Nothing glows —
    // the danger colour belongs to the gas cell, never to the machine that makes it safe.
    const tank = new THREE.Mesh(new THREE.SphereGeometry(S * 0.32, 20, 14), metalMat(0x9a9c9e, envMap));
    tank.scale.set(1.06, 1.06, 1.28); tank.position.z = S * 0.52; tank.castShadow = true; g.add(tank);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(S * 0.35, S * 0.038, 8, 24), metalMat(dark, envMap));
    strap.position.z = S * 0.52; g.add(strap);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.13, S * 0.18, S * 0.2, 10), metalMat(mid, envMap));
    collar.rotation.x = Math.PI / 2; collar.position.z = S * 0.98; collar.castShadow = true; g.add(collar);
    const turbine = new THREE.Group(); turbine.position.z = S * 1.1; g.add(turbine);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.05, S * 0.05, S * 0.06, 8), metalMat(steel, envMap));
    hub.rotation.x = Math.PI / 2; turbine.add(hub);
    for (let i = 0; i < 5; i++) {
      const a = i * (Math.PI * 2 / 5);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(S * 0.22, S * 0.055, S * 0.02), metalMat(steel, envMap));
      blade.rotation.z = a;
      blade.rotation.x = 0.42;
      blade.position.set(Math.cos(a) * S * 0.14, Math.sin(a) * S * 0.14, 0);
      turbine.add(blade);
    }
    dyn.turbine = turbine;
    lampZ = S * 1.16;
  } else if (kind === 'fabricator') {
    // Fabricator: a sealed bay with a small lit viewport (a real window, not a glowing panel) and
    // a physical gantry head that slides along a rail as the job runs.
    const body = new THREE.Mesh(new THREE.BoxGeometry(S * 0.84, S * 0.8, S * 0.74), metalMat(mid, envMap));
    body.position.z = S * 0.48; body.castShadow = true; g.add(body);
    const winFrame = new THREE.Mesh(new THREE.BoxGeometry(S * 0.48, S * 0.36, S * 0.05), metalMat(dark, envMap));
    winFrame.position.set(0, S * 0.06, S * 0.845); g.add(winFrame);
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x2a1f12, emissive: 0xffb648, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.1,
    });
    const win = new THREE.Mesh(new THREE.BoxGeometry(S * 0.4, S * 0.28, S * 0.03), winMat);
    win.position.set(0, S * 0.06, S * 0.87); g.add(win);
    // Progress reads as a gantry head travelling a rail — dyn.progressBar keeps its 0..1 contract,
    // but it now drives position along the rail instead of the width of a neon bar.
    const rail = new THREE.Mesh(new THREE.BoxGeometry(S * 0.62, S * 0.05, S * 0.05), metalMat(steel, envMap));
    rail.position.set(0, -S * 0.3, S * 0.88); g.add(rail);
    const head = new THREE.Mesh(new THREE.BoxGeometry(S * 0.1, S * 0.11, S * 0.11), metalMat(brass, envMap));
    head.position.set(-S * 0.31, -S * 0.3, S * 0.92); head.castShadow = true; g.add(head);
    dyn.progressBar = head;
    dyn.progressTravel = S * 0.62;
    dyn.progressBase = -S * 0.31;
    lampZ = S * 1.0;
  } else if (kind === 'cargo_port') {
    // Cargo port: a launch collar with physical guide rails and a berthed pod. The old emissive
    // guide torus is now a machined ring the key light picks out.
    const collar = new THREE.Mesh(new THREE.TorusGeometry(S * 0.42, S * 0.11, 10, 24), metalMat(mid, envMap));
    collar.position.z = S * 0.34; collar.castShadow = true; g.add(collar);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(S * 0.23, S * 0.045, 8, 20), metalMat(steel, envMap));
    ring.position.z = S * 0.42; g.add(ring);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const guide = new THREE.Mesh(new THREE.BoxGeometry(S * 0.05, S * 0.05, S * 0.4), paintMat(0x6d3f1c, envMap));
      guide.position.set(Math.cos(a) * S * 0.36, Math.sin(a) * S * 0.36, S * 0.42);
      guide.castShadow = true; g.add(guide);
    }
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(S * 0.14, S * 0.22, 6, 12), metalMat(0x9fb2c4, envMap));
    pod.rotation.x = Math.PI / 2; pod.position.z = S * 0.66; pod.castShadow = true; pod.visible = false; g.add(pod);
    dyn.pod = pod;
    lampZ = S * 0.72;
  } else if (kind === 'conduit') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(S * 0.9, S * 0.9, S * 0.1), metalMat(0x141211, envMap));
    plate.position.z = S * 0.05; plate.receiveShadow = true; g.add(plate);
    const run = new THREE.Mesh(new THREE.BoxGeometry(S * 0.86, S * 0.13, S * 0.08), metalMat(brass, envMap));
    run.position.z = S * 0.13; run.castShadow = true; g.add(run);
  }
  if (kind !== 'conduit') {
    // The one glyph every machine shares: a small hooded status lamp. It is a LAMP — a real
    // fixture with a metal hood — so it reads as equipment even before its colour means anything.
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.075, S * 0.09, S * 0.07, 8), metalMat(dark, envMap));
    hood.rotation.x = Math.PI / 2;
    hood.position.set(S * 0.32, S * 0.32, lampZ - S * 0.03);
    g.add(hood);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x2a2b2e, emissive: 0x5a7aa0, emissiveIntensity: 0.85, roughness: 0.4, metalness: 0.1,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(S * 0.055, 10, 8), lampMat);
    lamp.position.set(S * 0.32, S * 0.32, lampZ + S * 0.02);
    g.add(lamp);
    dyn.lamp = lampMat;
    dyn.lampAnchor = lamp;
  }
  g.userData.dyn = dyn;
  return { group: g, pulses, dyn };
}

// ---------------------------------------------------------------- Motherload-3D cell kit
// The works playfield reads as a cut rock face: every solid cell is the SAME block — a full-footprint
// unit with a beveled front pad, so the grid reads as masonry joints without any overlay lines. All
// variation lives INSIDE the face (relief, tint, bump); the footprint never lies about the sim grid.
// Local space: footprint x/y in [-0.5, 0.5], front pad at z=0, body extends to z=-1.

function pushQuad(pos, nrm, uv, a, b, c, d, uvs, col = null, ao = null, facet = null, f = 0) {
  // two triangles a-b-c, a-c-d
  pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const [ua, ub, uc, ud] = uvs;
  uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
  for (let i = 0; i < 6; i++) nrm.push(0, 0, 0); // computeVertexNormals gives flat facets
  if (col && ao) {
    const [aa, ab, ac, ad] = ao;
    for (const k of [aa, ab, ac, aa, ac, ad]) col.push(k, k, k);
  }
  if (facet) for (let i = 0; i < 6; i++) facet.push(f);
}

// 3 block variants: identical silhouette, different bevel depth / pad relief. Deterministic per cell.
export function makeCellBlockGeos() {
  // JOINT GEOMETRY IS THE GRID. Narrower bevels with a much steeper drop turn the seam between two
  // cells from a wide lit channel (which reads as a painted outline) into a deep V-groove that
  // shadows itself. The lift spread is widened so the cut face is uneven stone rather than a plane
  // of identical pads — under the perspective camera that unevenness is visible relief.
  const variants = [
    { bev: 0.022, lift: 0.030, bulge: 0.022, drop: 6.4 },
    { bev: 0.031, lift: 0.068, bulge: 0.058, drop: 5.6 },
    { bev: 0.040, lift: 0.104, bulge: -0.016, drop: 5.8 },
  ];
  // BAKED CONTACT DARKENING. A groove between two blocks is dark because almost no sky reaches
  // the bottom of it, and no directional rig can express that — with lights alone the up-facing
  // bevel catches the rim head-on and every cell grows a bright cool frame, which is the painted
  // outline again. So occlusion is baked per vertex: 1.0 on the pad, falling into the joint and
  // down the cavity wall. It rides the standard vertexColors path, multiplying with the
  // per-instance tint, and costs nothing at runtime.
  const AO = { pad: 1.0, padEdge: 0.90, groove: 0.14, wallTop: 0.17, wallBottom: 0.46, back: 0.10 };
  return variants.map((v) => {
    const pos = [], nrm = [], uv = [], col = [], facet = [];
    const p = 0.5 - v.bev;                    // pad half-extent
    const zF = v.lift;                        // pad plane (proud of z=0)
    const zB = -v.bev * (v.drop || 1.7);      // full footprint resumes here
    const pad = {
      pp: [p, p, zF], pn: [p, -p, zF], np: [-p, p, zF], nn: [-p, -p, zF], cc: [0, 0, zF + v.bulge],
    };
    // Pad cap: 4 triangles fanned to the relief centre (wound CCW seen from +z).
    // NORMALS ARE AUTHORED, NOT COMPUTED. computeVertexNormals on a non-indexed fan gives each of
    // the four triangles its own flat normal, so every cell wore a hard X-shaped crease across its
    // face — the single loudest "these are cardboard boxes" tell in the old capture. The pad is a
    // gently domed stone instead: the centre points straight out and the corners tilt outward in
    // proportion to the bulge, shading as one smooth surface. The z scale (DEPTH) vs xy scale (S)
    // is folded in so the tilt is right in world space, not local space.
    const domeK = (v.bulge * 3.3) / (0.7 * 2.2);
    const domeN = (x, y) => {
      const L = Math.hypot(x, y) || 1;
      const nx = (x / L) * domeK; const ny = (y / L) * domeK;
      const m = Math.hypot(nx, ny, 1);
      return [nx / m, ny / m, 1 / m];
    };
    const fan = [[pad.pp, pad.pn], [pad.pn, pad.nn], [pad.nn, pad.np], [pad.np, pad.pp]];
    for (const [a, b] of fan) {
      pos.push(...b, ...a, ...pad.cc);
      nrm.push(...domeN(b[0], b[1]), ...domeN(a[0], a[1]), 0, 0, 1);
      uv.push(b[0] + 0.5, b[1] + 0.5, a[0] + 0.5, a[1] + 0.5, 0.5, 0.5);
      for (const k of [AO.padEdge, AO.padEdge, AO.pad]) col.push(k, k, k);
      for (let i = 0; i < 3; i++) facet.push(1);
    }
    // bevel ring (pad edge → full footprint at zB), wound outward.
    // UV LAW: the bevel is a CONTINUATION of the face, so its uv is the same plan projection the
    // pad fan uses (x+0.5, y+0.5). The old authored uvs held u constant across each bevel quad —
    // harmless under a grey bump map, but with a real basecolour it smears one texel column into a
    // painted stripe around every cell, which is precisely the drawn outline design law §2.7 bans.
    const planUv = (v) => [v[0] + 0.5, v[1] + 0.5];
    const out = { pp: [0.5, 0.5, zB], pn: [0.5, -0.5, zB], np: [-0.5, 0.5, zB], nn: [-0.5, -0.5, zB] };
    const bevel = (a, b, c, d) => pushQuad(pos, nrm, uv, a, b, c, d,
      [planUv(a), planUv(b), planUv(c), planUv(d)], col,
      [AO.padEdge, AO.groove, AO.groove, AO.padEdge], facet, 0.5);
    bevel(pad.pn, out.pn, out.pp, pad.pp);
    bevel(pad.nn, out.nn, out.pn, pad.pn);
    bevel(pad.np, out.np, out.nn, pad.nn);
    bevel(pad.pp, out.pp, out.np, pad.np);
    // Side walls (zB → z=-1). These are the cavity walls a carved neighbour exposes — you look
    // straight down into them under the perspective camera, so they carry a full 0..1 texture
    // patch whose v runs with real depth (the wall is ~1 unit tall, matching the pad's density).
    const bak = { pp: [0.5, 0.5, -1], pn: [0.5, -0.5, -1], np: [-0.5, 0.5, -1], nn: [-0.5, -0.5, -1] };
    const wall = (a, b, c, d, u0, u1) => pushQuad(pos, nrm, uv, a, b, c, d,
      [[u0, 1], [u0, 0], [u1, 0], [u1, 1]], col,
      [AO.wallTop, AO.wallBottom, AO.wallBottom, AO.wallTop], facet, 0);
    wall(out.pn, bak.pn, bak.pp, out.pp, 0, 1);
    wall(out.nn, bak.nn, bak.pn, out.pn, 0, 1);
    wall(out.np, bak.np, bak.nn, out.nn, 0, 1);
    wall(out.pp, bak.pp, bak.np, out.np, 0, 1);
    // back cap
    pushQuad(pos, nrm, uv, bak.pp, bak.pn, bak.nn, bak.np,
      [planUv(bak.pp), planUv(bak.pn), planUv(bak.nn), planUv(bak.np)], col,
      [AO.back, AO.back, AO.back, AO.back], facet, 0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // sfFacet is tri-state, and the works renderer reads both halves of it:
    //   1.0  pad   — continuous world-planar rock uv, full normal map
    //   0.5  bevel — same continuous uv (so the stone flows into the joint), but the normal map is
    //               damped: a plan projection onto a near-vertical chamfer leaves almost no uv
    //               derivative, and the tangent-less TBN three derives from it then amplifies the
    //               perturbation into a bright rim around every cell
    //   0.0  wall / back — its own local unwrap (a plan projection would smear), full normal map
    geo.setAttribute('sfFacet', new THREE.Float32BufferAttribute(facet, 1));
    const authored = nrm.slice();
    geo.computeVertexNormals();
    // Restore the authored dome normals over the computed flat ones for the pad fan only.
    const nAttr = geo.getAttribute('normal');
    for (let i = 0; i < 12; i++) nAttr.setXYZ(i, authored[i * 3], authored[i * 3 + 1], authored[i * 3 + 2]);
    nAttr.needsUpdate = true;
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

// ---------------------------------------------------------------- PQ-130.04 material identity kit
// Design law §3.5: every material differs in THREE CHANNELS AT ONCE — hue, surface pattern and
// INCLUSION SHAPE. Hue is the host material (makeRockMaterials) plus the cluster tint; surface
// pattern is the host's roughness/normal and the relief below; this block is the third channel.
// Every builder here returns ONE merged geometry in the cell's local space: footprint ~1 across,
// base on the cut face at z≈0, growing toward +z. The works renderer instances them per cell and
// scales by S, so the whole identity kit costs one draw call per family.
//
// Nothing in here is a billboard, a sprite, a flat fill or an emissive halo (law §2.7). Every shape
// is closed, lit geometry that occupies a real part of the cell and casts into the raking key.

// A raised ridge running along a polyline: two sloped faces meeting at a crest, so a light raking
// across the face catches one flank and shadows the other. This is what makes a vein read as a vein
// at 120px instead of as a painted squiggle.
function ridgeAlong(pts, halfW, height) {
  const pos = [];
  const push = (a, b, c) => { pos.push(...a, ...b, ...c); };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (!a || !b) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * halfW, ny = (dx / len) * halfW;
    const aL = [a[0] + nx, a[1] + ny, 0], aR = [a[0] - nx, a[1] - ny, 0], aC = [a[0], a[1], height];
    const bL = [b[0] + nx, b[1] + ny, 0], bR = [b[0] - nx, b[1] - ny, 0], bC = [b[0], b[1], height];
    // WINDING IS LOAD-BEARING: computeVertexNormals derives the normal from triangle order, and a
    // ridge wound the other way faces INTO the rock — three culls it and the vein renders as
    // nothing at all while every line of code that built it still looks right.
    push(aL, bC, bL); push(aL, aC, bC);   // left flank  (normal +n, +z)
    push(aC, bR, bC); push(aC, aR, bR);   // right flank (normal -n, +z)
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.computeVertexNormals();
  return geo;
}

// IRON / METAL SEAM (law §3.5 "rust-toned rock with a metallic branch running through it").
// A branching vein ridge crossing the whole cell plus angular crystal chips seated along it. The
// chips are OCTAHEDRA, deliberately flat and faceted: iron's inclusion shape is angular chips, and
// that shape has to survive a squint against the ice family's plates and the exotic's lattice.
export function makeMetalVeinGeo(variant = 0) {
  const rnd = (i, salt) => hash2(i * 11 + variant * 53 + 7, salt * 17 + variant + 2);
  const parts = [];
  // Main branch: a wandering polyline from one edge of the cell to the other.
  const main = [];
  const a0 = (variant % 2 === 0 ? 0.35 : -0.4) + (rnd(0, 1) - 0.5) * 0.5;
  let x = -0.46, y = a0 * 0.5;
  for (let i = 0; i <= 5; i++) {
    main.push([x, y]);
    x += 0.184;
    y += (rnd(i, 2) - 0.5) * 0.26;
    y = Math.max(-0.4, Math.min(0.4, y));
  }
  parts.push(ridgeAlong(main, 0.078, 0.155));
  // Two side branches off interior nodes — a vein forks, a stripe does not.
  for (const [ni, dir] of [[1, 1], [3, -1]]) {
    const [bx, by] = main[ni];
    const br = [[bx, by]];
    let cx = bx, cy = by;
    for (let i = 0; i < 2; i++) {
      cx += (0.07 + rnd(ni + i, 3) * 0.09);
      cy += dir * (0.11 + rnd(ni + i, 4) * 0.12);
      br.push([Math.max(-0.47, Math.min(0.47, cx)), Math.max(-0.45, Math.min(0.45, cy))]);
    }
    parts.push(ridgeAlong(br, 0.050, 0.105));
  }
  // Angular chips: 5 flattened octahedra seated on the ridge, occupying a real part of the cell.
  const nChips = 4;
  for (let i = 0; i < nChips; i++) {
    const node = main[1 + (i % (main.length - 2))];
    const r = 0.145 + rnd(i, 5) * 0.075;
    const chip = new THREE.OctahedronGeometry(r, 0);
    chip.scale(1.0, 0.82 + rnd(i, 6) * 0.3, 0.62);
    chip.rotateZ(rnd(i, 7) * Math.PI);
    chip.rotateX(rnd(i, 8) * 0.7);
    chip.translate(node[0] + (rnd(i, 9) - 0.5) * 0.12, node[1] + (rnd(i, 10) - 0.5) * 0.12,
      0.10 + rnd(i, 11) * 0.05);
    parts.push(chip);
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// ICE (law §3.5 "pale glassy blue, the one cold material"). Inclusion shape is intersecting flat
// PLATES with fractured edges — nothing else in the mine is planar, so ice reads instantly even in
// grayscale. The material (makeRockMaterials.ice / the cluster's ice branch) supplies the sheen.
export function makeIceSheenGeo(variant = 0) {
  const rnd = (i, salt) => hash2(i * 13 + variant * 41 + 11, salt * 19 + variant + 5);
  const parts = [];
  const n = 4;
  for (let i = 0; i < n; i++) {
    const w = 0.30 + rnd(i, 1) * 0.20;
    const h = 0.20 + rnd(i, 2) * 0.17;
    const plate = new THREE.BoxGeometry(w, h, 0.048 + rnd(i, 3) * 0.036);
    // Shear the plate so its faces are not all parallel to the cut plane: a plate you see edge-on
    // is what makes the cluster read as broken ice instead of a stack of coasters.
    plate.rotateZ((rnd(i, 4) - 0.5) * 2.4);
    plate.rotateX(0.35 + (rnd(i, 5) - 0.5) * 1.3);
    plate.rotateY((rnd(i, 6) - 0.5) * 1.1);
    plate.translate((rnd(i, 7) - 0.5) * 0.36, (rnd(i, 8) - 0.5) * 0.36, 0.09 + rnd(i, 9) * 0.08);
    parts.push(plate);
  }
  // A couple of small shards in the gaps so the silhouette is not four rectangles.
  for (let i = 0; i < 3; i++) {
    const sh = new THREE.TetrahedronGeometry(0.085 + rnd(i, 10) * 0.055, 0);
    sh.rotateZ(rnd(i, 11) * Math.PI);
    sh.rotateX(rnd(i, 12) * Math.PI);
    sh.translate((rnd(i, 13) - 0.5) * 0.5, (rnd(i, 14) - 0.5) * 0.5, 0.05 + rnd(i, 15) * 0.05);
    parts.push(sh);
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// DEEP EXOTIC (law §3.5 "obviously-not-normal violet lattice; the visible prize"). The inclusion is
// a STRUT LATTICE — an octahedral cage of thin bars with nodes at the vertices. It is the only
// regular, engineered-looking shape in a mine full of broken rock, which is exactly the read: this
// material does not belong here.
export function makeExoticLatticeGeo(variant = 0) {
  const rnd = (i, salt) => hash2(i * 23 + variant * 67 + 3, salt * 29 + variant + 9);
  const parts = [];
  const R = 0.34 + (variant % 2) * 0.04;
  const zc = 0;
  const verts = [
    [R, 0, zc], [-R, 0, zc], [0, R, zc], [0, -R, zc], [0, 0, zc + R * 0.85], [0, 0, zc - R * 0.85],
  ];
  const edges = [[0, 2], [2, 1], [1, 3], [3, 0], [0, 4], [2, 4], [1, 4], [3, 4], [0, 5], [2, 5], [1, 5], [3, 5]];
  const up = new THREE.Vector3(0, 1, 0);
  for (const [ia, ib] of edges) {
    const a = new THREE.Vector3(...verts[ia]);
    const b = new THREE.Vector3(...verts[ib]);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const bar = new THREE.BoxGeometry(0.046, len, 0.046);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    bar.applyQuaternion(q);
    bar.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(bar);
  }
  for (let i = 0; i < verts.length; i++) {
    const node = new THREE.OctahedronGeometry(0.078 + rnd(i, 1) * 0.025, 0);
    node.translate(verts[i][0], verts[i][1], verts[i][2]);
    parts.push(node);
  }
  const cage = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  cage.rotateX(0.62 + (variant % 2) * 0.28);
  cage.rotateY(0.44 + variant * 0.51);
  cage.rotateZ(variant * 0.37);
  cage.translate(0, 0, 0.30);
  // A low mineralised crust the cage grows out of, so it is seated in the rock, not floating on it.
  const crust = new THREE.DodecahedronGeometry(0.32, 0);
  crust.scale(1.0, 0.9, 0.24);
  crust.translate(0, 0, 0.03);
  return mergeGeometries([cage, crust].map((p) => (p.index ? p.toNonIndexed() : p)), false);
}

// GAS POCKET — the BLOCK ITSELF is cracked (law §3.5 / playfield §5.5), so the identity is a set of
// RADIAL hairline fissures running out of a dark core, not a crystal and not a halo. Returned as
// separate variants so neighbouring pockets are not stamped from one die.
export function makeRadialCrackGeos() {
  const geos = [];
  for (let v = 0; v < 3; v++) {
    const parts = [];
    const n = 6 + (v % 2);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + hash2(v * 7 + i, 1) * 0.55;
      const pts = [[Math.cos(a0) * 0.07, Math.sin(a0) * 0.07]];
      let a = a0;
      let rr = 0.10;
      const segs = 4 + Math.floor(hash2(v + i, 2) * 3);
      for (let k = 0; k < segs; k++) {
        a += (hash2(v * 5 + i * 3 + k, 3) - 0.5) * 0.7;
        rr += 0.075 + hash2(i + k, 4) * 0.075;
        if (rr > 0.48) break;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      if (pts.length < 2) continue;
      // Fissures the light finds, not drawn lines — but they have to reach the cell edge, or the
      // pocket reads as a smudge in the middle of an ordinary block instead of a cracked one.
      parts.push(ridgeAlong(pts, 0.028 + hash2(v, i) * 0.012, 0.055));
    }
    geos.push(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false));
  }
  return geos;
}

// The gas pocket's DARK CENTRE (law §3.5 `#2b2d1f`): a socket pressed into the cut face that the
// fissures radiate from. Concave and unlit-looking because it is genuinely in shadow — the one
// place on this board where the warm key cannot reach.
export function makeGasCoreGeo() {
  const cone = new THREE.ConeGeometry(0.30, 0.30, 10, 1, true);
  cone.rotateX(-Math.PI / 2);          // opening toward +z, apex sunk into the rock
  cone.translate(0, 0, -0.12);
  const floor = new THREE.CircleGeometry(0.055, 8);
  floor.translate(0, 0, -0.12);
  return mergeGeometries([cone, floor].map((gg) => (gg.index ? gg.toNonIndexed() : gg)), false);
}

// VENTED POCKET (law §3.5, D2 permanence): once a pocket blows, its cell is gone from the sim, so
// what stays is a scar on the cavity floor — the pocket SPLIT OPEN, two lips levered apart around a
// dead gap. Flat, dull, gray-green; nothing about it suggests there is anything left to take.
export function makeVentedScarGeo() {
  const parts = [];
  for (const side of [-1, 1]) {
    const lip = new THREE.BoxGeometry(0.66, 0.26, 0.055);
    lip.rotateX(side * 0.34);
    lip.translate(0, side * 0.19, 0.03);
    parts.push(lip);
    for (let i = 0; i < 3; i++) {
      const shard = new THREE.TetrahedronGeometry(0.062 + hash2(i, side + 2) * 0.04, 0);
      shard.rotateZ(hash2(i * 3, side) * Math.PI);
      shard.translate(-0.28 + i * 0.28, side * (0.30 + hash2(i, 5) * 0.08), 0.035);
      parts.push(shard);
    }
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// DENSE BASALT's surface pattern (law §3.5 "clearly darker, heavy, banded — reads structural").
// Two shallow ledges across the cell. Bedded rock is banded, and a band is a step in the surface
// long before it is a change in colour: at the raking key's angle each ledge draws its own hard
// shadow line, so basalt reads as layered even in a grayscale still.
export function makeBasaltBandGeo(variant = 0) {
  const rnd = (i, salt) => hash2(i * 31 + variant * 19 + 13, salt * 7 + variant + 4);
  const parts = [];
  for (let i = 0; i < 2; i++) {
    const y = -0.22 + i * 0.34 + (rnd(i, 1) - 0.5) * 0.14;
    const h = 0.075 + rnd(i, 2) * 0.06;
    const ledge = new THREE.BoxGeometry(0.94, h, 0.085 + rnd(i, 3) * 0.045);
    ledge.rotateZ((rnd(i, 4) - 0.5) * 0.10);
    ledge.translate((rnd(i, 5) - 0.5) * 0.05, y, 0.024);
    parts.push(ledge);
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// THE MK LOCK STAMP (law §5 "an engraved MK2 stamp fades in on the cell face"; playfield §5.5 "a
// readable stamp on a dull vein, not an 8px sprite"). A chamfered plate lying on the cut face. The
// front pane and the chamfer share ONE plan-projected uv over the plate's full footprint, so a
// single canvas texture paints an engraved field with a bezel border and the numerals fall exactly
// on the recessed pane. It is a lit object with a real normal, so the key light rakes across the
// bezel and the plate reads as stamped metal rather than a decal.
export function makeMkStampGeo() {
  const bx = 0.34, by = 0.20;          // plate half-extents (local cell units)
  const c = 0.055;                     // chamfer inset
  const h = 0.062;                     // plate height above the face
  const pos = [], uv = [];
  const U = (x, y) => [x / (2 * bx) + 0.5, y / (2 * by) + 0.5];
  const quad = (a, b, cc, d) => {
    pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
    const [ua, ub, uc, ud] = [U(a[0], a[1]), U(b[0], b[1]), U(cc[0], cc[1]), U(d[0], d[1])];
    uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
  };
  const o = { pp: [bx, by, 0], pn: [bx, -by, 0], np: [-bx, by, 0], nn: [-bx, -by, 0] };
  const f = {
    pp: [bx - c, by - c, h], pn: [bx - c, -(by - c), h],
    np: [-(bx - c), by - c, h], nn: [-(bx - c), -(by - c), h],
  };
  quad(f.nn, f.pn, f.pp, f.np);        // engraved pane
  quad(o.nn, o.pn, f.pn, f.nn);        // chamfers
  quad(o.pn, o.pp, f.pp, f.pn);
  quad(o.pp, o.np, f.np, f.pp);
  quad(o.np, o.nn, f.nn, f.np);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- PQ-130.07 event geometry
// Law §5 events are OBJECTS in the scene, not sprites drawn over it (§2.7 "no cartoon"). The three
// geometries below are the new bodies the events need; everything else the events use already
// exists (chunks, the vented scar, the MK stamp, the rover's hopper lid).

// A VAPOR PUFF — the gas that floods the tunnel after a pocket lets go. Deliberately a solid lobed
// body with real normals, not a billboard: it is rendered with a LIT material so the work light and
// the cool starlight fill rake across it exactly as they rake across the rock beside it. An
// additive sprite here would read as the neon halo the law bans.
export function makeVaporPuffGeo(variant = 0) {
  const rnd = (i, salt) => hash2(i * 37 + variant * 23 + 5, salt * 11 + variant + 2);
  const lobes = [
    { p: [0, 0, 0], s: 0.5 },
    { p: [0.31, 0.16, 0.05], s: 0.33 },
    { p: [-0.27, 0.21, -0.04], s: 0.30 },
    { p: [0.08, -0.26, 0.06], s: 0.28 },
  ];
  const parts = lobes.map((L, li) => {
    const geo = new THREE.IcosahedronGeometry(L.s, 1);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const j = 1 + (rnd(i * 3 + li * 17, li + 1) - 0.5) * 0.5;
      pos.setXYZ(i, v.x * j, v.y * j, v.z * j);
    }
    geo.computeVertexNormals();
    geo.translate(
      L.p[0] + (rnd(li, 7) - 0.5) * 0.1,
      L.p[1] + (rnd(li, 8) - 0.5) * 0.1,
      L.p[2],
    );
    return geo;
  });
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// A SCORCH PLATE for the rover's flank — law §5 "a visible scar/chip on the rover". Not a decal
// quad: a thin blistered plate with a raised lip, so the key light finds the buckled edge and the
// damage reads as sheet metal that took a blast rather than a dark sticker. Unit-cell local; the
// caller scales it onto the hull.
export function makeScorchPlateGeo(variant = 0) {
  const rnd = (i, salt) => hash2(i * 41 + variant * 29 + 3, salt * 13 + variant + 6);
  const parts = [];
  // buckled skin: overlapping shallow slabs at slightly different tilts
  for (let i = 0; i < 5; i++) {
    const w = 0.22 + rnd(i, 1) * 0.2;
    const h = 0.18 + rnd(i, 2) * 0.16;
    const slab = new THREE.BoxGeometry(w, h, 0.03 + rnd(i, 3) * 0.02);
    slab.rotateZ((rnd(i, 4) - 0.5) * 0.7);
    slab.rotateX((rnd(i, 5) - 0.5) * 0.35);
    slab.translate((rnd(i, 6) - 0.5) * 0.42, (rnd(i, 7) - 0.5) * 0.4, 0.012);
    parts.push(slab);
  }
  // a torn lip standing proud on one side — the edge that caught the pressure
  const lip = new THREE.BoxGeometry(0.4, 0.05, 0.07);
  lip.rotateZ(0.24);
  lip.translate(-0.1, 0.22, 0.035);
  parts.push(lip);
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// THE COURIER POD (law §5 "pod visibly slides up the shaft, clears the surface"). A stubby freight
// canister: nose cone, ribbed barrel, three fins and a tail skirt. Built in cell-local units and
// scaled by the caller so it reads at both zoom registers.
export function makeCourierPodGeo() {
  const parts = [];
  const barrel = new THREE.CylinderGeometry(0.15, 0.16, 0.46, 12, 1);
  parts.push(barrel);
  const nose = new THREE.ConeGeometry(0.15, 0.2, 12);
  nose.translate(0, 0.33, 0);
  parts.push(nose);
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.TorusGeometry(0.158, 0.016, 6, 14);
    rib.rotateX(Math.PI / 2);
    rib.translate(0, -0.14 + i * 0.14, 0);
    parts.push(rib);
  }
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.BoxGeometry(0.02, 0.16, 0.13);
    fin.translate(0, -0.19, 0.14);
    fin.rotateY((i / 3) * Math.PI * 2);
    parts.push(fin);
  }
  const skirt = new THREE.CylinderGeometry(0.11, 0.13, 0.08, 12, 1);
  skirt.translate(0, -0.27, 0);
  parts.push(skirt);
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// ---------------------------------------------------------------- rover construction helpers
// One BufferGeometry welded from a set of transformed boxes. Panel clusters that never move
// relative to one another — hazard chevrons, the hopper cage, the auger flighting, a load layer —
// cost one draw call between them instead of one each. The rover is a single vehicle, not fifty
// loose objects on the GPU.
function boxSetGeo(specs) {
  const pos = [], nor = [], uvs = [];
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  for (const s of specs) {
    const g = new THREE.BoxGeometry(s.w, s.h, s.d).toNonIndexed();
    e.set(s.rx || 0, s.ry || 0, s.rz || 0);
    m.makeRotationFromEuler(e);
    m.setPosition(s.x || 0, s.y || 0, s.z || 0);
    g.applyMatrix4(m);
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const t = g.attributes.uv.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < n.length; i++) nor.push(n[i]);
    for (let i = 0; i < t.length; i++) uvs.push(t[i]);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.computeBoundingSphere();
  return out;
}

// A TRACKED UNDERCARRIAGE, NOT WHEELS. Three fat road wheels under a box read as a toy truck at
// play size; what says "mining machine" is a continuous track — a stadium-shaped frame, a drive
// sprocket at each end, and tread plates marching around the loop. The plates are ONE
// InstancedMesh whose matrices are re-laid along the loop path whenever the rig moves, so the
// tread visibly crawls instead of a wheel spinning on the spot. Returns the loop-path writer so
// the works renderer can drive it from the distance the body actually travels.
function makeTrackUnit(S, mats, { L, R, w, lugCount, wheels, wheelZ }) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(S * L, S * 2 * R, S * w), mats.frame);
  frame.castShadow = true; frame.receiveShadow = true;
  g.add(frame);
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(S * R, S * R, S * w, 14), mats.frame);
    cap.rotation.x = Math.PI / 2;
    cap.position.x = sx * S * L / 2;
    cap.castShadow = true; cap.receiveShadow = true;
    g.add(cap);
  }
  // tread plates on the loop path
  const arc = Math.PI * R;
  const P = 2 * L + 2 * arc;
  const off = R + 0.019;
  const lugGeo = new THREE.BoxGeometry(S * 0.052, S * 0.038, S * (w + 0.05));
  const inst = new THREE.InstancedMesh(lugGeo, mats.tread, lugCount);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.castShadow = true;
  inst.frustumCulled = false;
  g.add(inst);
  const dummy = new THREE.Object3D();
  const place = (phase) => {
    for (let i = 0; i < lugCount; i++) {
      let s = (phase + i * (P / lugCount)) % P;
      if (s < 0) s += P;
      let px, py, rot;
      if (s < L) {                       // lower run, travelling +x
        px = -L / 2 + s; py = -off; rot = 0;
      } else if (s < L + arc) {          // front sprocket
        const phi = -Math.PI / 2 + (s - L) / R;
        px = L / 2 + off * Math.cos(phi); py = off * Math.sin(phi); rot = phi + Math.PI / 2;
      } else if (s < 2 * L + arc) {      // upper run, travelling -x
        px = L / 2 - (s - L - arc); py = off; rot = Math.PI;
      } else {                           // rear sprocket
        const phi = Math.PI / 2 + (s - 2 * L - arc) / R;
        px = -L / 2 + off * Math.cos(phi); py = off * Math.sin(phi); rot = phi + Math.PI / 2;
      }
      dummy.position.set(S * px, S * py, 0);
      dummy.rotation.set(0, 0, rot);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  };
  place(0);
  // sprockets + road wheels, hung outboard so they read as discs against the dark frame
  const spinners = [];
  if (wheels) {
    const spokeGeo = boxSetGeo([
      { w: S * 0.115, h: S * 0.021, d: S * 0.05 },
      { w: S * 0.115, h: S * 0.021, d: S * 0.05, rz: Math.PI / 2 },
    ]);
    const sprGeo = new THREE.CylinderGeometry(S * 0.07, S * 0.07, S * 0.05, 12);
    for (const sx of [-1, 1]) {
      const wg = new THREE.Group();
      wg.position.set(sx * S * L / 2, 0, S * wheelZ);
      const disc = new THREE.Mesh(sprGeo, mats.wheel);
      disc.rotation.x = Math.PI / 2; disc.castShadow = true;
      const spokes = new THREE.Mesh(spokeGeo, mats.steel);
      spokes.position.z = S * 0.028;
      wg.add(disc, spokes);
      g.add(wg);
      spinners.push(wg);
    }
    const roadGeo = new THREE.CylinderGeometry(S * 0.044, S * 0.044, S * 0.044, 10);
    const roadBar = new THREE.BoxGeometry(S * 0.068, S * 0.015, S * 0.048);
    for (const fx of [-0.3, 0, 0.3]) {
      const wg = new THREE.Group();
      wg.position.set(S * L * fx, -S * (R - 0.05), S * wheelZ);
      const disc = new THREE.Mesh(roadGeo, mats.wheel);
      disc.rotation.x = Math.PI / 2;
      const bar = new THREE.Mesh(roadBar, mats.steel);
      bar.position.z = S * 0.024;
      wg.add(disc, bar);
      g.add(wg);
      spinners.push(wg);
    }
  }
  return { group: g, place, spinners };
}

// The surface winch derrick the tether spools from: two A-legs straddling the entry shaft, a
// painted crossbeam, a winch drum with machined flanges, and a hooded amber beacon. Group origin
// sits at the plateau top over the shaft; the cable hangs from dyn.drum. Its paint is a weathered
// works orange, deliberately NOT the rover's safety yellow — the rover owns that colour alone.
export function makeDerrick(S, envMap) {
  const g = new THREE.Group();
  const pulses = [];
  const dyn = {};
  const frame = metalMat(0x22201d, envMap);
  const steel = metalMat(0x7c8188, envMap);
  const paint = paintMat(0x9b5c22, envMap, 0.6);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(S * 0.1, S * 1.5, S * 0.13), frame);
    leg.position.set(sx * S * 0.5, S * 0.6, 0);
    leg.rotation.z = -sx * 0.22;
    leg.castShadow = true;
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(S * 0.28, S * 0.08, S * 0.32), paint);
    foot.position.set(sx * S * 0.66, -S * 0.08, 0);
    foot.castShadow = true;
    g.add(foot);
    // cross brace
    const brace = new THREE.Mesh(new THREE.BoxGeometry(S * 1.1, S * 0.055, S * 0.065), frame);
    brace.position.set(0, S * 0.45, 0);
    brace.castShadow = true;
    g.add(brace);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(S * 1.35, S * 0.11, S * 0.15), paint);
  beam.position.y = S * 1.32; beam.castShadow = true; g.add(beam);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.13, S * 0.13, S * 0.3, 14), metalMat(0x3c4046, envMap));
  drum.rotation.x = Math.PI / 2; drum.position.set(0, S * 1.14, 0); drum.castShadow = true; g.add(drum);
  for (const dz of [-0.15, 0.15]) {
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.155, S * 0.155, S * 0.025, 14), steel);
    flange.rotation.x = Math.PI / 2;
    flange.position.set(0, S * 1.14, S * dz);
    flange.castShadow = true;
    g.add(flange);
  }
  dyn.drum = drum;
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x2a1d08, emissive: 0xffb648, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.1,
  });
  const beaconHood = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.058, S * 0.058, S * 0.024, 8), frame);
  beaconHood.position.set(S * 0.6, S * 1.465, 0); g.add(beaconHood);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(S * 0.05, 10, 8), beaconMat);
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

// ---------------------------------------------------------------- PQ-130.10b network bodies
// Law §7 asks the networks to be OBJECTS on the board, not a painted diagram: a crate is a crate,
// a flow dot is a puck riding the lane floor, a junction is a bolted box where two runs meet. Each
// geometry below is authored in CELL SPACE (1.0 = one cell) so the works renderer scales it by its
// own `S` and nothing here has to know the world scale. Everything is real relief that the scene's
// raking key light can carve — §2.7 bans a flat fill or a halo standing in for an object.

/**
 * The port's output pile: 1–5 stages of stacked shipping crates, keyed to the port buffer.
 * Stage 1 is a single crate on the floor; stage 5 is a two-high six-crate pallet. Each crate is a
 * boxed body with two raised bands, so the pile reads as freight even at the site register where a
 * crate is four pixels across — a plain cube at that size is a smudge.
 */
export function makeCrateStackGeo(stage = 1) {
  const n = Math.max(1, Math.min(5, Math.round(stage)));
  const C = 0.225;                    // crate edge, in cells — freight, not pebbles
  const GAP = 0.052;                  // wide enough that individual boxes separate from straight down
  const P = C + GAP;
  // Deterministic pile plans: [x, y, z] crate centres in cell space, floor at z = 0.
  // The camera looks STRAIGHT DOWN, so a pile that grows only in x reads as a bar and a pile that
  // grows only in z reads as one crate. Every stage therefore spreads its FOOTPRINT first: the plan
  // view is the picture, and the second layer is the bonus.
  const PLANS = [
    [[0, 0, 0]],
    [[-P / 2, -P / 2, 0], [P / 2, P / 2, 0]],
    [[-P / 2, -P / 2, 0], [P / 2, -P / 2, 0], [-P / 2, P / 2, 0]],
    [[-P / 2, -P / 2, 0], [P / 2, -P / 2, 0], [-P / 2, P / 2, 0], [P / 2, P / 2, 0]],
    [[-P / 2, -P / 2, 0], [P / 2, -P / 2, 0], [-P / 2, P / 2, 0], [P / 2, P / 2, 0],
      [-P / 2, 0, P], [P / 2, 0, P]],
  ];
  const specs = [];
  // A stacked pile leans a little; the yaw is per-slot and fixed, so a crate never jitters between
  // frames and the pile is the same pile every time the same stage is drawn.
  const YAW = [0.04, -0.07, 0.11, -0.03, 0.08, -0.1];
  PLANS[n - 1].forEach(([x, y, z], i) => {
    const rz = YAW[i % YAW.length];
    specs.push({ w: C, h: C, d: C, x, y, z: z + C / 2, rz });
    // Two banding rings proud of the body: seen from an angle they are straps, and seen from
    // straight down their 4% overhang throws the edge shadow that separates one box from the next.
    specs.push({ w: C * 1.045, h: C * 1.045, d: C * 0.06, x, y, z: z + C * 0.26, rz });
    specs.push({ w: C * 1.045, h: C * 1.045, d: C * 0.06, x, y, z: z + C * 0.75, rz });
    // THE LID CROSS. This camera looks straight down, so the only face of a crate anyone ever sees
    // is its top — a bare cube up there is a brown square. Two raised straps across the lid are what
    // make the pile read as freight rather than as a painted patch.
    specs.push({ w: C * 1.0, h: C * 0.13, d: C * 0.07, x, y, z: z + C + C * 0.03, rz });
    specs.push({ w: C * 0.13, h: C * 1.0, d: C * 0.07, x, y, z: z + C + C * 0.03, rz });
  });
  return boxSetGeo(specs);
}

/**
 * One material flow dot: a low domed puck that rides the lane floor. Direction-agnostic on
 * purpose — a lane turns four ways and a dot must never have to be re-oriented mid-run.
 */
export function makeFlowDotGeo() {
  const parts = [];
  const body = new THREE.CylinderGeometry(0.052, 0.058, 0.03, 10, 1);
  body.rotateX(Math.PI / 2);
  parts.push(body);
  const dome = new THREE.SphereGeometry(0.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 1, 0.52);
  dome.rotateX(Math.PI / 2);
  dome.translate(0, 0, 0.015);
  parts.push(dome);
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

/**
 * A cable junction: the bolted node where three or more runs meet. Slightly proud of the run so a
 * branch is legible as a fitting rather than a crossing of two painted lines.
 */
export function makeJunctionNodeGeo() {
  const parts = [];
  const body = new THREE.CylinderGeometry(0.1, 0.115, 0.075, 8, 1);
  body.rotateX(Math.PI / 2);
  parts.push(body);
  const cap = new THREE.CylinderGeometry(0.068, 0.068, 0.03, 8, 1);
  cap.rotateX(Math.PI / 2);
  cap.translate(0, 0, 0.05);
  parts.push(cap);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const bolt = new THREE.CylinderGeometry(0.014, 0.014, 0.02, 5, 1);
    bolt.rotateX(Math.PI / 2);
    bolt.translate(Math.cos(a) * 0.082, Math.sin(a) * 0.082, 0.045);
    parts.push(bolt);
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

/**
 * The why-glyph plate (law §6.7): a rounded plate that carries ONE drawn symbol — never a word —
 * on a blocked machine seat. Unit square in x/y with uv 0..1 across the whole plate, so the caller
 * paints the symbol into a canvas texture the way the §5 want chips already do.
 */
export function makeWhyGlyphPlateGeo(radius = 0.22, segsPerCorner = 5) {
  const r = Math.max(0.01, Math.min(0.5, radius));
  const pts = [];
  const corners = [[0.5 - r, 0.5 - r, 0], [-0.5 + r, 0.5 - r, Math.PI / 2],
    [-0.5 + r, -0.5 + r, Math.PI], [0.5 - r, -0.5 + r, -Math.PI / 2]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= segsPerCorner; i++) {
      const a = a0 + (i / segsPerCorner) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  const pos = [], nor = [], uv = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    // fan from the plate centre
    for (const [px, py] of [[0, 0], a, b]) {
      pos.push(px, py, 0);
      nor.push(0, 0, 1);
      uv.push(px + 0.5, py + 0.5);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/**
 * Seat brackets (law §6.7, owner ruling 2026-08-21: "NO solid cell fills, ever"). Four corner Ls
 * inset at the cell's bevel ring — a surveyor's mark on the block, not a painted face. Unit cell in
 * x/y; `thickness` and `arm` are cell fractions so the caller can solve a constant SCREEN width.
 */
export function makeSeatBracketGeo(thickness = 0.03, arm = 0.3) {
  const t = Math.max(0.004, thickness);
  const a = Math.max(t * 2, arm);
  const h = 0.5 - t * 0.5 - 0.025;         // sit just inside the bevel, off the groove
  const pos = [], nor = [], uv = [];
  const rect = (cx, cy, w, hh) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - hh / 2, y1 = cy + hh / 2;
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y0], [x1, y1], [x0, y1]]) {
      pos.push(x, y, 0);
      nor.push(0, 0, 1);
      uv.push(x + 0.5, y + 0.5);
    }
  };
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      rect(sx * (h - a / 2 + t / 2), sy * h, a, t);   // the arm running along x
      rect(sx * h, sy * (h - a / 2 + t / 2), t, a);   // the arm running along y
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  // Drawn ink as a fraction of the cell: 8 bars, minus the four corner overlaps. The works renderer
  // publishes this so a check can assert the seat mark never becomes a fill again.
  g.userData.inkFrac = 8 * a * t - 4 * t * t;
  return g;
}
