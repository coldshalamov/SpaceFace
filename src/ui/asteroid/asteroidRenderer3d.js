// Asteroid works 3D renderer — the drill playfield drawn in the game's own engine.
// Replaces asteroidRenderer2d's canvas painting with a dedicated Three.js scene: instanced rock
// carved live from the REAL drill field, per-ore nodule clusters that respect survey + tier gates,
// machines/conduits mirrored from the durable site record, and a lit rover with a working
// headlight. Same grid, same sim, same inputs — only the pixels changed.
//
// Contract with the screen shell (asteroidScreen.js):
//   - read-only over game state: draws state.drill / the site record, never mutates either;
//   - the shell owns the rAF loop, DOM panels, bus subscriptions and input; it calls
//     render(dt, timeS, ui) every frame and forwards drill/site events through notify();
//   - pickCell(clientX, clientY) replaces the 2D canvas' linear pixel→cell math (raycast
//     against the rock-face plane, so the tilted camera stays pixel-honest for building).
//
// Determinism note: like the 2D painter, all *layout* variation derives from hash32(col,row) —
// the same rock always looks the same. Math.random only feathers cosmetic particle bursts,
// exactly as the shipped 2D screen did.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { hash32 } from '../../core/rng.js';
import { DRILL_CONST, tileIndex, avatarDrawPos, drillTierReqForOre } from '../../systems/drill.js';
import { connectivityMask } from '../../systems/siteLogistics.js';
import { spawnParticleBurst, stepParticles, drillGasShakeOffset } from '../screens/drill.js';
import { ORE_TINTS, STATUS_COLORS } from './asteroidRenderer2d.js';
import { makeRockMaterials, makeMachine, makeRover, metalMat, emissiveMat } from '../../render/asteroidInteriorPreview.js';

const { COLS, ROWS, SCAN_RADIUS, SCAN_ACTIVE_S } = DRILL_CONST;
export const VIEW_ROWS = 18;

const TILE = 40;              // px-space kept for parity with the shipped particle/shake helpers
const S = 2.2;                // world units per cell — the astlab-proven scale for these builders
const DEPTH = S * 1.5;        // rock slab depth basis (blocks jitter around it)
// Camera tilt — THE one aesthetic number the plan reserved for taste. Small on purpose: enough
// for block sides + machine height to read, small enough that the grid stays a precision surface.
const CAM_YAW = 0.10;
const CAM_PITCH = 0.15;
const CAM_DIST = 260;

// Depth layering (camera looks down -z; rock front faces land around z ≈ DEPTH * 0.7).
const Z = {
  back: -DEPTH * 1.1,
  overlay: 0.18,              // conduits hug the cavity floor
  rover: DEPTH * 0.34,
  ore: DEPTH * 0.5,
  particles: DEPTH * 0.66,
  face: DEPTH * 0.72,         // cursor / ring / pick plane — the "glass" over the rock face
};

const MACHINE_KIND = {
  sm_massline_core: 'core',
  sm_extractor: 'extractor',
  sm_gas_tap: 'gas_tap',
  sm_refinery: 'refinery',
  sm_fabricator: 'fabricator',
  sm_cargo_port: 'cargo_port',
};

const FAULT_STATES = new Set(['no-power', 'starved', 'backlogged', 'no-network', 'no-geology', 'no-pods']);

const worldX = (c) => (c - COLS / 2 + 0.5) * S;
const worldY = (r) => (ROWS / 2 - r - 0.5) * S;
const pxToWorldX = (px) => (px / TILE - COLS / 2) * S;
const pxToWorldY = (py) => (ROWS / 2 - py / TILE) * S;
const rnd01 = (c, r, salt) => (hash32(c, r, salt) % 1000) / 1000;

const STYLE_ID = 'sf-ast3d-style';
function injectOverlayStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.ast3d-overlay { position:absolute; inset:0; pointer-events:none; overflow:hidden; font-family:"IBM Plex Mono", Consolas, monospace; }
.ast3d-tick { position:absolute; right:0; height:1px; width:6px; background:rgba(138,148,161,.42); }
.ast3d-tick span { position:absolute; right:9px; top:-4px; font-size:8.5px; font-weight:500; color:rgba(138,148,161,.55); letter-spacing:.05em; }
.ast3d-floater { position:absolute; transform:translate(-50%,-50%); font-size:11px; font-weight:600; text-shadow:0 1px 3px rgba(0,0,0,.8); white-space:nowrap; }
.ast3d-flash-gas { position:absolute; inset:0; background:rgba(255,84,112,.45); opacity:0; }
.ast3d-flash-cargo { position:absolute; inset:0; opacity:0;
  background:linear-gradient(rgba(255,179,92,.34), rgba(255,179,92,0) 18%, rgba(255,179,92,0) 82%, rgba(255,179,92,.34)); }
`;
  document.head.appendChild(s);
}

// Tiny procedural "workshop" environment baked through PMREM so the metal machines have
// something believable to reflect (the vendored addons ship no RoomEnvironment).
function bakeEnvMap(renderer) {
  const sc = new THREE.Scene();
  const dis = [];
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); dis.push(geo, mat); sc.add(m); return m; };
  add(new THREE.BoxGeometry(14, 14, 14), new THREE.MeshBasicMaterial({ color: 0x0b1018, side: THREE.BackSide }));
  add(new THREE.BoxGeometry(5, 0.2, 3), new THREE.MeshBasicMaterial({ color: 0xfff1dc })).position.set(-3, 5, 0);
  add(new THREE.BoxGeometry(0.2, 3, 4), new THREE.MeshBasicMaterial({ color: 0x39d0ff })).position.set(5, 1, 2);
  add(new THREE.BoxGeometry(7, 0.2, 4), new THREE.MeshBasicMaterial({ color: 0x2a3a66 })).position.set(0, -5, -2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(sc, 0.05);
  pmrem.dispose();
  for (const d of dis) d.dispose();
  return rt;
}

export function createAsteroidRenderer3d({ canvas, wrapEl, drillSys, getDrill, getSite, getProjection }) {
  injectOverlayStyle();

  // ---------------------------------------------------------------- renderer + composer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080f);

  const halfW = (COLS * S / 2) * 1.02;
  const halfH = halfW * (VIEW_ROWS / COLS);
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 2000);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1120, 720), 0.85, 0.55, 0.4);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const envRT = bakeEnvMap(renderer);
  const envMap = envRT.texture;
  scene.environment = envMap;

  // ---------------------------------------------------------------- lights
  const lightRig = new THREE.Group();
  scene.add(lightRig);
  const key = new THREE.DirectionalLight(0xfff0dc, 3.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.05;
  const sc = key.shadow.camera;
  sc.left = -COLS * S * 0.62; sc.right = COLS * S * 0.62;
  sc.top = VIEW_ROWS * S * 0.85; sc.bottom = -VIEW_ROWS * S * 0.85;
  sc.near = 1; sc.far = 900;
  sc.updateProjectionMatrix();
  lightRig.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x6a86ff, 0.55);
  rim.position.set(COLS * S * 0.5, -VIEW_ROWS * S, DEPTH * 3);
  lightRig.add(rim, rim.target);
  const fill = new THREE.DirectionalLight(0xbfd0ff, 0.22);
  fill.position.set(0, 0, 300);
  lightRig.add(fill, fill.target);
  scene.add(new THREE.AmbientLight(0x27303f, 0.34));

  // ---------------------------------------------------------------- session containers
  const rockGroup = new THREE.Group();      // instanced rock + backing wall
  const oreRoot = new THREE.Group();        // per-cell nodule clusters
  const gasRoot = new THREE.Group();        // per-cell gas blobs
  const siteRoot = new THREE.Group();       // machines
  const overlayRoot = new THREE.Group();    // merged conduit meshes
  const fxRoot = new THREE.Group();         // particles / rings / cursor / scan
  scene.add(rockGroup, oreRoot, gasRoot, siteRoot, overlayRoot, fxRoot);

  const rockMats = makeRockMaterials(envMap);

  // gas — one breathing material shared by every pocket (bloom does the halo work)
  const gasMat = new THREE.MeshStandardMaterial({
    color: 0x1c8f74, emissive: 0x18d69a, emissiveIntensity: 1.05,
    roughness: 1, metalness: 0, transparent: true, opacity: 0.5, depthWrite: false,
  });
  const gasGeo = new THREE.IcosahedronGeometry(S * 0.62, 1);

  // ore — cached materials per (oreId, locked) + shared nodule geometry
  const oreGeo = new THREE.IcosahedronGeometry(S * 0.15, 0);
  const oreMats = new Map();
  function oreMaterial(oreId, locked) {
    const key2 = `${oreId}:${locked ? 1 : 0}`;
    let m = oreMats.get(key2);
    if (m) return m;
    const tint = ORE_TINTS[oreId] || ORE_TINTS.cmdty_silicate;
    const col = new THREE.Color(tint.vein);
    if (locked) col.multiplyScalar(0.42);
    m = new THREE.MeshStandardMaterial({
      color: col, roughness: 0.32, metalness: 0.65, flatShading: true, envMap,
      emissive: !locked && tint.glow ? new THREE.Color(tint.glow) : new THREE.Color(0x000000),
      emissiveIntensity: !locked && tint.glow ? 0.85 : 0,
    });
    oreMats.set(key2, m);
    return m;
  }
  const badgeTextures = new Map();
  function badgeTexture(tier) {
    let t = badgeTextures.get(tier);
    if (t) return t;
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 32;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(7,10,16,0.78)';
    g.fillRect(0, 0, 64, 32);
    g.strokeStyle = 'rgba(255,92,92,0.9)';
    g.lineWidth = 2;
    g.strokeRect(2, 2, 60, 28);
    g.fillStyle = '#ff8a4a';
    g.font = 'bold 16px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`MK${tier}`, 32, 17);
    t = new THREE.CanvasTexture(cv);
    badgeTextures.set(tier, t);
    return t;
  }

  // conduit materials — plan palette: cyan = command/lane, amber = power/process
  const laneCoreMat = emissiveMat(0x39d0ff, 0.5);
  const powerCoreMat = emissiveMat(0xffb35c, 0.9);
  const casingMat = metalMat(0x10151f, envMap);
  casingMat.roughness = 0.7;

  // cursor / ghost / ring shared bits
  const frameMat = new THREE.MeshBasicMaterial({ color: 0x39d0ff, transparent: true, opacity: 0.85, depthTest: false });
  const ringSolidMat = new THREE.MeshBasicMaterial({ color: 0x62e08a, transparent: true, opacity: 0.17, depthTest: false });
  const ringEmptyMat = new THREE.MeshBasicMaterial({ color: 0x5a7aa0, transparent: true, opacity: 0.08, depthTest: false });
  const padOkMat = new THREE.MeshBasicMaterial({ color: 0x62e08a, transparent: true, opacity: 0.13, depthTest: false });
  const padBadMat = new THREE.MeshBasicMaterial({ color: 0xff5c5c, transparent: true, opacity: 0.16, depthTest: false });
  const cellQuad = new THREE.PlaneGeometry(S, S);
  const cursorGroup = new THREE.Group();
  {
    const bar = new THREE.BoxGeometry(S, S * 0.06, S * 0.02);
    for (const [x, y, rz] of [[0, S / 2, 0], [0, -S / 2, 0], [S / 2, 0, Math.PI / 2], [-S / 2, 0, Math.PI / 2]]) {
      const b = new THREE.Mesh(bar, frameMat);
      b.position.set(x, y, 0);
      b.rotation.z = rz;
      cursorGroup.add(b);
    }
    cursorGroup.visible = false;
    cursorGroup.renderOrder = 30;
    fxRoot.add(cursorGroup);
  }
  const ringQuads = [];
  for (let i = 0; i < 8; i++) {
    const q = new THREE.Mesh(cellQuad, ringEmptyMat);
    q.visible = false;
    q.renderOrder = 28;
    fxRoot.add(q);
    ringQuads.push(q);
  }
  const padQuad = new THREE.Mesh(cellQuad, padOkMat);
  padQuad.visible = false;
  padQuad.renderOrder = 29;
  fxRoot.add(padQuad);

  // scan pulse ring
  const scanMat = new THREE.MeshBasicMaterial({ color: 0x39d0ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false });
  const scanRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), scanMat);
  scanRing.visible = false;
  scanRing.renderOrder = 27;
  fxRoot.add(scanRing);

  // event pulse rings (install / break) — small pool, life-driven
  const pulseRings = [];
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x62e08a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40), mat);
    mesh.visible = false;
    mesh.renderOrder = 27;
    fxRoot.add(mesh);
    pulseRings.push({ mesh, mat, t: 0, dur: 0.6 });
  }
  function firePulseRing(col, row, colorHex, dur = 0.6) {
    const p = pulseRings.find((x) => x.t <= 0) || pulseRings[0];
    p.mesh.position.set(worldX(col), worldY(row), Z.face + 0.03);
    p.mat.color.setHex(colorHex);
    p.t = dur; p.dur = dur;
    p.mesh.visible = true;
  }

  // particles — px-space sim (the shipped helpers), instanced additive chips on screen
  const PARTICLE_CAP = 200;
  const partGeo = new THREE.BoxGeometry(1, 1, 1);
  const partMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const partMesh = new THREE.InstancedMesh(partGeo, partMat, PARTICLE_CAP);
  partMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  partMesh.count = 0;
  partMesh.renderOrder = 26;
  fxRoot.add(partMesh);
  let particles = [];
  const burst = (opts) => {
    const before = particles.length;
    spawnParticleBurst(particles, opts);
    for (let i = before; i < particles.length; i++) {
      particles[i]._c3 = new THREE.Color(particles[i].color);
    }
  };

  // rover
  const roverBuilt = makeRover(S, envMap);
  const rover = roverBuilt.group;
  rover.visible = false;
  scene.add(rover);
  const headlight = new THREE.SpotLight(0xffe0b0, 46, S * 8, 0.62, 0.55, 1.6);
  headlight.position.copy(roverBuilt.dyn.lampAnchor.position);
  const headTarget = new THREE.Object3D();
  headTarget.position.set(S * 3.2, 0, 0);
  rover.add(headlight, headTarget);
  headlight.target = headTarget;
  const roverGlow = new THREE.PointLight(0x39d0ff, 3.4, S * 3.6, 2);
  roverGlow.position.set(0, S * 0.3, S * 0.4);
  rover.add(roverGlow);

  // umbilical
  let umbilical = null;      // { casing, core }
  let umbilicalKey = '';

  // ---------------------------------------------------------------- per-session state
  let motionReduce = false;
  let field = null;
  const cellRock = new Map();   // idx -> { mesh, i, carved, c, r }
  let rockInst = { matrix: [], basalt: [] };   // one InstancedMesh per chunk variant
  let backWall = null;
  const oreByCell = new Map();  // idx -> Group
  const gasByCell = new Map();  // idx -> Mesh
  const machines = new Map();   // machineId -> { group, defId, dyn, pulses, col, row, geoSig }
  let ghost = null;             // { defId, group }
  let overlaySig = '';
  let lookY = null;
  let drillTheta = 0;
  const gasShake = { t: 0, elapsed: 0 };
  const timers = { gasFlash: 0, cargoFlash: 0 };
  let pulseEntries = [];        // [{mat, base, amp}] — machines + rover + gas

  // DOM overlay — spatial annotations only (depth ruler / floaters / alarm washes); rig vitals
  // are deck instruments now (ASTEROID_OPS_UI_BRIEF: the scene stays sovereign).
  const dom = { root: null, ticks: [], floaters: [], flashGas: null, flashCargo: null };
  function buildDomOverlay() {
    if (dom.root) return;
    const root = document.createElement('div');
    root.className = 'ast3d-overlay';
    root.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 16; i++) {
      const t = document.createElement('div');
      t.className = 'ast3d-tick';
      t.style.display = 'none';
      const lbl = document.createElement('span');
      t.appendChild(lbl);
      root.appendChild(t);
      dom.ticks.push(t);
    }
    dom.flashGas = document.createElement('div');
    dom.flashGas.className = 'ast3d-flash-gas';
    dom.flashCargo = document.createElement('div');
    dom.flashCargo.className = 'ast3d-flash-cargo';
    root.append(dom.flashGas, dom.flashCargo);
    // The stage (canvas' shrink-wrapping parent) so the overlay hugs the canvas box exactly,
    // even when the viewport letterboxes inside the console frame.
    (canvas.parentElement || wrapEl).appendChild(root);
    dom.root = root;
  }

  // ---------------------------------------------------------------- sizing
  // wrapEl is the letterbox region: fit the grid's aspect inside BOTH dimensions.
  function resize() {
    const availW = Math.max(64, wrapEl.clientWidth | 0);
    const availH = Math.max(48, wrapEl.clientHeight | 0);
    const w = Math.max(64, Math.min(availW, Math.round(availH * COLS / VIEW_ROWS)));
    const h = Math.max(48, Math.round(w * VIEW_ROWS / COLS));
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, true);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  if (ro) ro.observe(wrapEl);

  // ---------------------------------------------------------------- rock
  // Craggy chunk variants instead of clean boxes: a segmented unit box with its vertices pushed
  // by a position-keyed hash (coincident verts move together, so faces stay stitched while the
  // silhouette breaks), then flat re-normal'd for faceted stone. Three variants, hash-assigned
  // per cell — the wall stops reading as tiles.
  const ROCK_VARIANTS = 3;
  function makeChunkGeo(salt) {
    const geo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const qx = Math.round((v.x + 0.5) * 2);
      const qy = Math.round((v.y + 0.5) * 2);
      const qz = Math.round((v.z + 0.5) * 2);
      const j = (axis) => ((hash32(qx * 7 + qz, qy * 13 + qz, `${salt}${axis}`) % 1000) / 1000 - 0.5);
      pos.setXYZ(i, v.x + j('x') * 0.2, v.y + j('y') * 0.2, v.z + j('z') * 0.24);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }
  const chunkGeos = Array.from({ length: ROCK_VARIANTS }, (_, i) => makeChunkGeo(`ck${i}`));
  const dummy = new THREE.Object3D();
  const colScratch = new THREE.Color();

  function bucketFor(tile) {
    if (!tile || tile.type === 'empty' || tile.type === 'gas') return null;
    return tile.type === 'rock' ? 'basalt' : 'matrix';
  }

  function rockInstanceColor(c, r, surveyed, out) {
    const tint = 0.72 + rnd01(c + 13, r + 5, 'rt') * 0.52;
    const warm = (rnd01(c + 6, r + 8, 'rw') - 0.32) * 0.2;
    if (surveyed) {
      out.setRGB(Math.min(1.35, tint + warm), tint, Math.max(0, tint - warm * 1.15));
    } else {
      // Unsurveyed mass still reads as SOLID ROCK, but noticeably darker + cooler — the survey
      // is fog-of-war, and warmth spreading around the bore is the reveal reward. (The faceted
      // chunk normals brightened everything, so the unknown side leans harder into the dark.)
      const g = tint * 0.36;
      out.setRGB(g * 0.92, g * 1.02, g * 1.3);
    }
    return out;
  }

  function setRockMatrix(c, r, carved) {
    if (carved) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0, 0, 0);
    } else {
      const jx = (rnd01(c, r, 'jx') - 0.5) * S * 0.26;
      const jy = (rnd01(c + 9, r + 3, 'jy') - 0.5) * S * 0.26;
      const jz = -DEPTH * 0.12 + rnd01(c + 5, r + 7, 'jz') * DEPTH * 0.62;
      dummy.position.set(worldX(c) + jx, worldY(r) + jy, jz);
      dummy.rotation.set(
        (rnd01(c + 4, r + 6, 'rx') - 0.5) * 0.3,
        (rnd01(c + 7, r + 1, 'ry') - 0.5) * 0.3,
        (rnd01(c + 3, r + 9, 'rz') - 0.5) * 0.55,
      );
      dummy.scale.set(
        S * (1.05 + rnd01(c + 2, r + 8, 'sx') * 0.42),
        S * (1.05 + rnd01(c + 11, r + 2, 'sy') * 0.42),
        DEPTH * (0.9 + rnd01(c, r + 1, 'sd') * 0.75),
      );
    }
    dummy.updateMatrix();
  }

  function buildRock() {
    for (const bucket of ['matrix', 'basalt']) {
      for (const inst of rockInst[bucket]) {
        rockGroup.remove(inst);
        inst.dispose();
      }
      rockInst[bucket] = [];
    }
    cellRock.clear();
    // Bucket by material AND chunk variant — one InstancedMesh per (bucket, variant).
    const lists = { matrix: [], basalt: [] };
    for (let v = 0; v < ROCK_VARIANTS; v++) { lists.matrix.push([]); lists.basalt.push([]); }
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const bucket = bucketFor(field[c][r]);
        if (bucket) lists[bucket][hash32(c, r, 'ckv') % ROCK_VARIANTS].push({ c, r });
      }
    }
    for (const bucket of ['matrix', 'basalt']) {
      for (let v = 0; v < ROCK_VARIANTS; v++) {
        const list = lists[bucket][v];
        const inst = new THREE.InstancedMesh(chunkGeos[v], rockMats[bucket], Math.max(1, list.length));
        inst.castShadow = true;
        inst.receiveShadow = true;
        list.forEach((cell, i) => {
          const surveyed = drillSys.isTileSurveyed(cell.c, cell.r);
          setRockMatrix(cell.c, cell.r, false);
          inst.setMatrixAt(i, dummy.matrix);
          inst.setColorAt(i, rockInstanceColor(cell.c, cell.r, surveyed, colScratch));
          cellRock.set(tileIndex(cell.c, cell.r), { mesh: inst, i, carved: false, c: cell.c, r: cell.r });
        });
        inst.count = list.length;
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        rockGroup.add(inst);
        rockInst[bucket].push(inst);
      }
    }
    if (!backWall) {
      backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(COLS * S * 1.4, ROWS * S * 1.15),
        new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 1, metalness: 0 }),
      );
      backWall.position.z = Z.back;
      backWall.receiveShadow = true;
      rockGroup.add(backWall);
    }
  }

  function carveCell(c, r) {
    const rec = cellRock.get(tileIndex(c, r));
    if (rec && !rec.carved) {
      rec.carved = true;
      setRockMatrix(c, r, true);
      rec.mesh.setMatrixAt(rec.i, dummy.matrix);
      rec.mesh.instanceMatrix.needsUpdate = true;
    }
    removeOreAt(c, r);
    removeGasAt(c, r);
  }

  // ---------------------------------------------------------------- ore + gas per cell
  function disposeGroup(group) {
    group.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        if (o.geometry && o.geometry !== oreGeo && o.geometry !== gasGeo && o.geometry !== cellQuad) o.geometry.dispose();
        // Materials here are either shared caches (ore/gas/frame) or per-build (machines/ghosts):
        // per-build ones are tagged _own at creation.
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m && m._own) m.dispose();
      }
    });
  }

  function removeOreAt(c, r) {
    const idx = tileIndex(c, r);
    const g = oreByCell.get(idx);
    if (!g) return;
    oreRoot.remove(g);
    disposeGroup(g);
    oreByCell.delete(idx);
  }

  function removeGasAt(c, r) {
    const idx = tileIndex(c, r);
    const m = gasByCell.get(idx);
    if (!m) return;
    gasRoot.remove(m);
    gasByCell.delete(idx);
  }

  function ensureGasAt(c, r) {
    const idx = tileIndex(c, r);
    if (gasByCell.has(idx)) return;
    const m = new THREE.Mesh(gasGeo, gasMat);
    m.position.set(
      worldX(c) + (rnd01(c, r, 'gx') - 0.5) * S * 0.2,
      worldY(r) + (rnd01(c, r, 'gy') - 0.5) * S * 0.2,
      DEPTH * 0.34,
    );
    m.scale.set(1.12 + rnd01(c, r, 'gs') * 0.25, 0.95 + rnd01(c, r, 'gt') * 0.25, 0.85);
    gasRoot.add(m);
    gasByCell.set(idx, m);
  }

  // Surveyed veins grow their nodule cluster; tier-locked ones sit dull under an MK badge.
  function syncOreAt(c, r) {
    const tile = field[c] && field[c][r];
    const idx = tileIndex(c, r);
    const wanted = tile && tile.type === 'vein' && tile.ore && drillSys.isTileSurveyed(c, r);
    if (!wanted) { removeOreAt(c, r); return; }
    const req = tile.tierReq || drillTierReqForOre(tile.ore);
    const locked = drillSys.getDrillTier() < req;
    const existing = oreByCell.get(idx);
    if (existing && existing.userData.ore === tile.ore && existing.userData.locked === locked) return;
    removeOreAt(c, r);
    const g = new THREE.Group();
    g.userData.ore = tile.ore;
    g.userData.locked = locked;
    const mat = oreMaterial(tile.ore, locked);
    const n = 3 + (hash32(c, r, 'on') % 3);
    const a0 = rnd01(c, r, 'oa') * Math.PI;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(oreGeo, mat);
      const t = (i / Math.max(1, n - 1)) - 0.5;
      m.position.set(
        worldX(c) + Math.cos(a0) * t * S * 0.5 + (rnd01(c + i, r, 'ox') - 0.5) * S * 0.22,
        worldY(r) + Math.sin(a0) * t * S * 0.5 + (rnd01(c, r + i, 'oy') - 0.5) * S * 0.22,
        Z.ore + rnd01(c + i, r + i, 'oz') * S * 0.16,
      );
      m.scale.setScalar(0.65 + rnd01(i + 1, c + r, 'os') * 0.8);
      m.castShadow = true;
      g.add(m);
    }
    if (locked) {
      const sMat = new THREE.SpriteMaterial({ map: badgeTexture(req), transparent: true, depthTest: false });
      sMat._own = true;
      const badge = new THREE.Sprite(sMat);
      badge.scale.set(S * 0.7, S * 0.35, 1);
      badge.position.set(worldX(c), worldY(r), Z.face);
      badge.renderOrder = 25;
      g.add(badge);
    }
    oreRoot.add(g);
    oreByCell.set(idx, g);
  }

  function refreshCells(cells) {
    if (!field) return;
    let touchedColor = false;
    for (const { col, row } of cells) {
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
      const tile = field[col] && field[col][row];
      if (!tile) continue;
      const idx = tileIndex(col, row);
      const rec = cellRock.get(idx);
      if (tile.type === 'empty') {
        carveCell(col, row);
        continue;
      }
      if (tile.type === 'gas') { ensureGasAt(col, row); continue; }
      if (rec && !rec.carved) {
        const surveyed = drillSys.isTileSurveyed(col, row);
        rec.mesh.setColorAt(rec.i, rockInstanceColor(col, row, surveyed, colScratch));
        touchedColor = true;
      }
      syncOreAt(col, row);
    }
    if (touchedColor) {
      for (const bucket of ['matrix', 'basalt']) {
        for (const inst of rockInst[bucket]) {
          if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        }
      }
    }
  }

  function neighborhood(c, r, radius) {
    const out = [];
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) out.push({ col: c + dc, row: r + dr });
    }
    return out;
  }

  // ---------------------------------------------------------------- machines
  function buildMachineAt(m) {
    const kind = MACHINE_KIND[m.defId] || 'fabricator';
    const built = makeMachine(kind, S, envMap);
    built.group.traverse((o) => {
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mt of mats) mt._own = true;
      }
    });
    built.group.position.set(worldX(m.col), worldY(m.row), 0);
    siteRoot.add(built.group);
    const rec = {
      group: built.group, defId: m.defId, dyn: built.dyn || {}, col: m.col, row: m.row,
      geoSig: '', arms: null, pulses: built.pulses || [],
    };
    machines.set(m.id, rec);
    return rec;
  }

  function removeMachine(id) {
    const rec = machines.get(id);
    if (!rec) return;
    siteRoot.remove(rec.group);
    disposeGroup(rec.group);
    machines.delete(id);
  }

  // Contact arms — the §1 ring made visible: one clamp bar per worked face, tinted by what
  // that face feeds on (parity with the 2D painter, now with real depth).
  function armTint(cell) {
    if (cell.kind === 'gas') return 0x2fd4a5;
    if (cell.kind === 'ore') return new THREE.Color((ORE_TINTS[cell.ore] || {}).vein || '#9aa4b8').getHex();
    if (cell.kind === 'matrix') return 0x8a7a62;
    return 0x7a8698;
  }

  function syncMachineArms(rec, pm) {
    const isContact = rec.defId === 'sm_extractor' || rec.defId === 'sm_gas_tap';
    const geo = isContact && pm && pm.geo ? pm.geo : null;
    const sig = geo ? geo.cells.map((c) => `${c.col},${c.row},${c.kind},${c.ore || ''}`).join(';') : '';
    if (sig === rec.geoSig) return;
    rec.geoSig = sig;
    if (rec.arms) {
      rec.group.remove(rec.arms);
      disposeGroup(rec.arms);
      rec.arms = null;
    }
    if (!geo) return;
    const arms = new THREE.Group();
    for (const cell of geo.cells || []) {
      if (cell.kind === 'empty') continue;
      if (rec.defId === 'sm_gas_tap' && cell.kind !== 'gas') continue;
      const dx = Math.sign(cell.col - rec.col);
      const dy = -Math.sign(cell.row - rec.row); // world y is up; rows grow down
      const len = Math.hypot(dx, dy) * S * 0.5;
      const mat = new THREE.MeshStandardMaterial({
        color: armTint(cell), emissive: armTint(cell), emissiveIntensity: 0.75, roughness: 0.5, metalness: 0.3,
      });
      mat._own = true;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(len, S * 0.07, S * 0.07), mat);
      bar.position.set(dx * len * 0.55, dy * len * 0.55, S * 0.34);
      bar.rotation.z = Math.atan2(dy, dx);
      arms.add(bar);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(S * 0.16, S * 0.16, S * 0.1), mat);
      pad.position.set(dx * S * 0.52, dy * S * 0.52, S * 0.34);
      arms.add(pad);
    }
    rec.group.add(arms);
    rec.arms = arms;
  }

  function statusColorHex(status) {
    return new THREE.Color(STATUS_COLORS[(status && status.state) || 'idle'] || STATUS_COLORS.idle).getHex();
  }

  function syncMachines(site, projection, timeS) {
    const seen = new Set();
    if (site) {
      for (const m of site.machines) {
        seen.add(m.id);
        let rec = machines.get(m.id);
        if (!rec || rec.defId !== m.defId || rec.col !== m.col || rec.row !== m.row) {
          if (rec) removeMachine(m.id);
          rec = buildMachineAt(m);
        }
        const pm = projection && projection.machines ? projection.machines.find((x) => x.id === m.id) : null;
        const status = pm ? pm.status : null;
        const state = (status && status.state) || 'idle';
        syncMachineArms(rec, pm);
        if (rec.dyn.lamp) {
          const hex = statusColorHex(status);
          rec.dyn.lamp.color.setHex(hex);
          rec.dyn.lamp.emissive.setHex(hex);
          rec.dyn.lamp.emissiveIntensity = FAULT_STATES.has(state) && !motionReduce
            ? 1.1 + 0.7 * Math.sin(timeS * 3.2) : 1.3;
        }
        const running = state === 'running' || state === 'throttled' || state === 'limited';
        if (rec.dyn.orbit) rec.dyn.orbit.rotation.z = motionReduce ? 0.8 : timeS * 1.1;
        if (rec.dyn.turbine) {
          rec.dyn.turbine.rotation.z = motionReduce
            ? 0.4 : timeS * ((status && status.genMW) ? 5 : 0.5);
        }
        if (rec.dyn.piston) {
          const bob = motionReduce || !running ? 0 : Math.abs(Math.sin(timeS * 3.1)) * S * 0.09;
          rec.dyn.piston.position.x = rec.dyn.pistonBase - bob;
        }
        if (rec.dyn.furnace) {
          const hot = running;
          rec.dyn.furnace.emissiveIntensity = hot
            ? (motionReduce ? 1.4 : 1.2 + 0.5 * Math.sin(timeS * 5)) : 0.15;
        }
        if (rec.dyn.progressBar) {
          const p = status && Number.isFinite(status.progress) ? Math.max(0, Math.min(1, status.progress)) : 0;
          rec.dyn.progressBar.scale.x = Math.max(0.001, p);
        }
        if (rec.dyn.pod) rec.dyn.pod.visible = !!(site.fleet && site.fleet.podsReady > 0);
      }
    }
    for (const id of [...machines.keys()]) {
      if (!seen.has(id)) removeMachine(id);
    }
  }

  // ---------------------------------------------------------------- overlays (conduits)
  function overlaySignature(site) {
    if (!site) return 'none';
    let h = 17;
    for (const i of site.overlays.power) h = (h * 31 + i + 1) | 0;
    h = (h * 37 + 7) | 0;
    for (const i of site.overlays.lane) h = (h * 31 + i + 1) | 0;
    h = (h * 37 + site.machines.length) | 0;
    for (const m of site.machines) h = (h * 31 + tileIndex(m.col, m.row)) | 0;
    return String(h);
  }

  function rebuildOverlays(site) {
    for (const child of [...overlayRoot.children]) {
      overlayRoot.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
    if (!site) return;
    const machineCells = new Set(site.machines.map((m) => tileIndex(m.col, m.row)));
    const kinds = [
      { name: 'lane', cells: new Set(site.overlays.lane), coreMat: laneCoreMat, w: 0.3 },
      { name: 'power', cells: new Set(site.overlays.power), coreMat: powerCoreMat, w: 0.18 },
    ];
    const shared = new Set([...kinds[0].cells].filter((i) => kinds[1].cells.has(i)));
    for (const kind of kinds) {
      const has = (c, r) => {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
        const idx = tileIndex(c, r);
        return kind.cells.has(idx) || machineCells.has(idx);
      };
      const casingGeos = [];
      const coreGeos = [];
      const arms = [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]];
      for (const idx of kind.cells) {
        const c = idx % COLS;
        const r = Math.floor(idx / COLS);
        // Shared cells split off the centreline so the two systems read in parallel (2D §2 rule).
        const off = shared.has(idx) ? (kind.name === 'lane' ? -S * 0.16 : S * 0.16) : 0;
        const cx = worldX(c);
        const cy = worldY(r) + off;
        const mask = connectivityMask(has, c, r);
        let any = false;
        for (const [bit, dc, dr] of arms) {
          if (!(mask & bit)) continue;
          any = true;
          const dx = dc, dy = -dr;
          const len = S * 0.5 + S * 0.06;
          const cg = new THREE.BoxGeometry(len, S * kind.w, S * 0.1);
          cg.rotateZ(Math.atan2(dy, dx));
          cg.translate(cx + dx * len / 2, cy + dy * len / 2, Z.overlay);
          casingGeos.push(cg);
          const eg = new THREE.BoxGeometry(len, S * kind.w * 0.36, S * 0.12);
          eg.rotateZ(Math.atan2(dy, dx));
          eg.translate(cx + dx * len / 2, cy + dy * len / 2, Z.overlay + 0.05);
          coreGeos.push(eg);
        }
        const puck = new THREE.CylinderGeometry(S * kind.w * 0.62, S * kind.w * 0.62, S * 0.12, 10);
        puck.rotateX(Math.PI / 2);
        puck.translate(cx, cy, Z.overlay + 0.05);
        casingGeos.push(puck);
        if (!any) {
          // Isolated cell — a lit stub so a lone painted tile still reads as live conduit.
          const dot = new THREE.CylinderGeometry(S * kind.w * 0.4, S * kind.w * 0.4, S * 0.14, 10);
          dot.rotateX(Math.PI / 2);
          dot.translate(cx, cy, Z.overlay + 0.08);
          coreGeos.push(dot);
        }
      }
      const merge = (geos, mat, shadow) => {
        if (!geos.length) return;
        const mergedGeo = mergeBufferGeometriesCompat(geos);
        if (!mergedGeo) return;
        const mesh = new THREE.Mesh(mergedGeo, mat);
        mesh.receiveShadow = shadow;
        overlayRoot.add(mesh);
      };
      merge(casingGeos, casingMat, true);
      merge(coreGeos, kind.coreMat, false);
      for (const g of [...casingGeos, ...coreGeos]) g.dispose();
    }
  }

  // Minimal merge (positions/normals/uv discarded where absent) — avoids importing the utils addon
  // for what is a handful of boxes: we bake each source geometry's transform in above, so a simple
  // attribute concat suffices.
  function mergeBufferGeometriesCompat(geos) {
    try {
      const out = new THREE.BufferGeometry();
      const attrs = ['position', 'normal'];
      for (const name of attrs) {
        let itemSize = 0;
        let total = 0;
        for (const g of geos) {
          const a = g.attributes[name];
          if (!a) return null;
          itemSize = a.itemSize;
          total += a.count;
        }
        const arr = new Float32Array(total * itemSize);
        let offset = 0;
        for (const g of geos) {
          arr.set(g.attributes[name].array, offset);
          offset += g.attributes[name].array.length;
        }
        out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
      }
      const idxArr = [];
      let vertBase = 0;
      for (const g of geos) {
        const idx = g.index;
        if (!idx) return null;
        for (let i = 0; i < idx.count; i++) idxArr.push(idx.getX(i) + vertBase);
        vertBase += g.attributes.position.count;
      }
      out.setIndex(idxArr);
      return out;
    } catch (_) {
      return null;
    }
  }

  // ---------------------------------------------------------------- umbilical
  function syncUmbilical(d, roverX, roverY, moving) {
    const trail = d.cableTrail || [];
    const cellKey = `${trail.length}:${d.avatar.col}:${d.avatar.row}`;
    if (!moving && cellKey === umbilicalKey && umbilical) return;
    umbilicalKey = cellKey;
    if (umbilical) {
      scene.remove(umbilical.casing, umbilical.core);
      umbilical.casing.geometry.dispose();
      umbilical.core.geometry.dispose();
      umbilical = null;
    }
    const pts = [new THREE.Vector3(worldX(Math.floor(COLS / 2)), worldY(0) + S * 1.6, Z.rover - 0.3)];
    for (const p of trail) pts.push(new THREE.Vector3(worldX(p.col), worldY(p.row), Z.rover - 0.3));
    pts.push(new THREE.Vector3(roverX, roverY + S * 0.1, Z.rover - 0.15));
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.12);
    const segs = Math.min(240, pts.length * 7);
    const casing = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, S * 0.075, 6, false), umbCasingMat);
    casing.castShadow = true;
    const core = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, S * 0.032, 5, false), umbCoreMat);
    scene.add(casing, core);
    umbilical = { casing, core };
  }
  const umbCasingMat = metalMat(0x0f1722, envMap);
  umbCasingMat.roughness = 0.62;
  const umbCoreMat = emissiveMat(0x0ea5e9, 0.85);

  // ---------------------------------------------------------------- ghost
  function ensureGhost(defId) {
    if (ghost && ghost.defId === defId) return ghost;
    if (ghost) {
      fxRoot.remove(ghost.group);
      disposeGroup(ghost.group);
      ghost = null;
    }
    if (!defId) return null;
    const built = makeMachine(MACHINE_KIND[defId] || 'fabricator', S, envMap);
    built.group.traverse((o) => {
      if (o.isMesh) {
        const wasArray = Array.isArray(o.material);
        const cloned = (wasArray ? o.material : [o.material]).map((m) => {
          const t = m.clone();
          t.transparent = true;
          t.opacity = 0.45;
          t.depthWrite = false;
          t._own = true;
          m.dispose(); // the fresh originals from makeMachine are never rendered
          return t;
        });
        o.material = wasArray ? cloned : cloned[0];
        o.castShadow = false;
      }
    });
    built.group.renderOrder = 24;
    fxRoot.add(built.group);
    ghost = { defId, group: built.group };
    return ghost;
  }

  // ---------------------------------------------------------------- camera + picking
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function cameraCenterY(d, dt) {
    const drawPos = avatarDrawPos(d.avatar, TILE);
    const target = pxToWorldY(drawPos.y + TILE / 2);
    const minY = worldY(ROWS - 1) - S / 2 + (VIEW_ROWS / 2) * S;
    const maxY = worldY(0) + S / 2 - (VIEW_ROWS / 2) * S;
    const clamped = Math.max(minY, Math.min(maxY, target));
    if (lookY == null || Number.isNaN(lookY)) lookY = clamped;
    else {
      const rate = motionReduce ? 1 : 10;
      lookY += (clamped - lookY) * Math.min(1, rate * dt);
      lookY = Math.max(minY, Math.min(maxY, lookY));
    }
    return lookY;
  }

  function poseCamera(centerY, shakeX, shakeY) {
    const cx = shakeX;
    const cy = centerY + shakeY;
    camera.position.set(
      cx + Math.sin(CAM_YAW) * CAM_DIST,
      cy + Math.sin(CAM_PITCH) * CAM_DIST,
      Math.cos(CAM_YAW) * Math.cos(CAM_PITCH) * CAM_DIST,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(cx, cy, 0);
    camera.updateMatrixWorld();
    // Key light + shadow volume track the view so texel density stays where the player looks.
    // Deliberately raking (lateral+above, shallow z) so block sides light and cavities shadow.
    key.position.set(cx - COLS * S * 0.5, cy + VIEW_ROWS * S * 0.72, DEPTH * 5 + 22);
    key.target.position.set(cx, cy, 0);
    rim.target.position.set(cx, cy, 0);
    fill.target.position.set(cx, cy, 0);
  }

  function pickCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const { origin, direction } = raycaster.ray;
    if (Math.abs(direction.z) < 1e-6) return null;
    const t = (Z.face - origin.z) / direction.z;
    if (t < 0) return null;
    const px = origin.x + direction.x * t;
    const py = origin.y + direction.y * t;
    const col = Math.floor(px / S + COLS / 2);
    const row = Math.floor(ROWS / 2 - py / S);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    return { col, row };
  }

  const projV = new THREE.Vector3();
  function worldToScreen(x, y, z) {
    projV.set(x, y, z).project(camera);
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    return { x: (projV.x * 0.5 + 0.5) * w, y: (-projV.y * 0.5 + 0.5) * h };
  }

  // ---------------------------------------------------------------- cursor / ghost / ring sync
  function syncCursor(ui) {
    const cursor = ui && ui.cursor;
    const showGhost = !!(cursor && ui.mode === 'build' && ui.buildKind === 'machine' && ui.buildDefId);
    cursorGroup.visible = !!cursor;
    padQuad.visible = false;
    for (const q of ringQuads) q.visible = false;
    if (!cursor) { if (ghost) ghost.group.visible = false; return; }
    const cx = worldX(cursor.col);
    const cy = worldY(cursor.row);
    cursorGroup.position.set(cx, cy, Z.face);
    if (showGhost) {
      const g = ensureGhost(ui.buildDefId);
      if (g) {
        g.group.visible = true;
        g.group.position.set(cx, cy, 0.02);
      }
      frameMat.color.setHex(ui.canOk ? 0x62e08a : 0xff5c5c);
      padQuad.visible = true;
      padQuad.material = ui.canOk ? padOkMat : padBadMat;
      padQuad.position.set(cx, cy, Z.face - 0.02);
      // Contact-ring preview: what the machine would read, solid = feedable.
      let qi = 0;
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (!dc && !dr) continue;
          const cc = cursor.col + dc;
          const rr = cursor.row + dr;
          if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
          const tile = field[cc] && field[cc][rr];
          const solid = tile && tile.type !== 'empty';
          const q = ringQuads[qi++];
          q.visible = true;
          q.material = solid ? ringSolidMat : ringEmptyMat;
          q.position.set(worldX(cc), worldY(rr), Z.face - 0.04);
        }
      }
    } else {
      if (ghost) ghost.group.visible = false;
      frameMat.color.setHex(0x39d0ff);
    }
  }

  function syncScanRing(d, roverX, roverY) {
    const active = d.scan && d.scan.active > 0;
    scanRing.visible = !!active;
    if (!active) return;
    const progress = motionReduce ? 1 : 1 - Math.min(1, d.scan.active / SCAN_ACTIVE_S);
    const radius = Math.max(0.01, progress * SCAN_RADIUS * S);
    scanRing.position.set(roverX, roverY, Z.face + 0.05);
    scanRing.scale.setScalar(radius);
    scanMat.opacity = motionReduce ? 0.28 : Math.max(0.08, 0.48 * (1 - progress));
  }

  // ---------------------------------------------------------------- particles + floaters
  function stepFx(dt) {
    particles = stepParticles(particles, dt);
    if (particles.length > PARTICLE_CAP) {
      particles.copyWithin(0, particles.length - PARTICLE_CAP);
      particles.length = PARTICLE_CAP;
    }
    let n = 0;
    for (const p of particles) {
      if (p.isFloater) continue;
      if (n >= PARTICLE_CAP) break;
      const alpha = Math.max(0, p.life / (p.maxLife || 0.001));
      const sizeW = (p.size / TILE) * S * (p.isDust || p.isSteam ? (1 + (1 - alpha) * 2) : 1);
      dummy.position.set(pxToWorldX(p.x), pxToWorldY(p.y), Z.particles);
      dummy.rotation.set(0, 0, (p.x + p.y) * 0.1);
      dummy.scale.setScalar(Math.max(0.001, sizeW));
      dummy.updateMatrix();
      partMesh.setMatrixAt(n, dummy.matrix);
      colScratch.copy(p._c3 || colScratch.set(0xffffff)).multiplyScalar(alpha);
      partMesh.setColorAt(n, colScratch);
      n++;
    }
    partMesh.count = n;
    if (n) {
      partMesh.instanceMatrix.needsUpdate = true;
      if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;
    }
    for (const p of pulseRings) {
      if (p.t <= 0) continue;
      p.t -= dt;
      const a = Math.max(0, p.t / p.dur);
      p.mat.opacity = 0.5 * a;
      p.mesh.scale.setScalar(S * (1.4 - a * 0.7));
      if (p.t <= 0) p.mesh.visible = false;
    }
  }

  function spawnFloater(px, py, text, color) {
    if (!dom.root) return;
    const el = document.createElement('div');
    el.className = 'ast3d-floater';
    el.style.color = color;
    el.textContent = text;
    dom.root.appendChild(el);
    dom.floaters.push({ el, px, py, life: 0.95, vy: -22 });
  }

  function stepDom(d, dt) {
    if (!dom.root) return;
    if (timers.gasFlash > 0) timers.gasFlash = Math.max(0, timers.gasFlash - dt);
    if (timers.cargoFlash > 0) timers.cargoFlash = Math.max(0, timers.cargoFlash - dt);
    dom.flashGas.style.opacity = timers.gasFlash > 0 ? String((motionReduce ? 0.55 : 1) * timers.gasFlash) : '0';
    dom.flashCargo.style.opacity = timers.cargoFlash > 0 ? String(Math.min(1, timers.cargoFlash)) : '0';
    // depth ruler — tick every 2 rows, labeled in metres like the 2D view
    const h = canvas.clientHeight || 1;
    let ti = 0;
    for (let i = 0; i <= Math.ceil(ROWS / 2) && ti < dom.ticks.length; i++) {
      const yW = worldY(i * 2) + S / 2;
      const p = worldToScreen(halfW * 0.985, yW, Z.face);
      if (p.y < 0 || p.y > h) continue;
      const tick = dom.ticks[ti++];
      tick.style.display = 'block';
      tick.style.top = `${p.y.toFixed(1)}px`;
      tick.firstChild.textContent = `${i * 10}M`;
    }
    for (; ti < dom.ticks.length; ti++) dom.ticks[ti].style.display = 'none';
    // floaters ride the projection so they stay glued to their cell while the camera settles
    for (let i = dom.floaters.length - 1; i >= 0; i--) {
      const f = dom.floaters[i];
      f.life -= dt;
      f.py += f.vy * dt; // px-space rise
      if (f.life <= 0) {
        f.el.remove();
        dom.floaters.splice(i, 1);
        continue;
      }
      const p = worldToScreen(pxToWorldX(f.px), pxToWorldY(f.py), Z.face);
      f.el.style.left = `${p.x.toFixed(1)}px`;
      f.el.style.top = `${p.y.toFixed(1)}px`;
      f.el.style.opacity = String(Math.min(1, f.life / 0.4));
    }
  }

  // ---------------------------------------------------------------- notify (screen → renderer)
  function notify(evt, p = {}) {
    const d = getDrill();
    const centerPx = (col, row) => ({ x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 });
    if (evt === 'break') {
      carveCell(p.col, p.row);
      refreshCells(neighborhood(p.col, p.row, 1));
      const { x, y } = centerPx(p.col, p.row);
      burst({ x, y, count: motionReduce ? 5 : 12, color: '#a78262', life: 0.45, size: 2.8, speed: 60, kind: 'spark', gravity: 55, cone: Math.PI * 2 });
      firePulseRing(p.col, p.row, 0x39d0ff, 0.3);
      return;
    }
    if (evt === 'yield') {
      const { x, y } = centerPx(p.col, p.row);
      const tint = (ORE_TINTS[p.ore] || {}).vein || '#39d0ff';
      burst({ x, y, count: 10, color: tint, life: 0.55, size: 2.4, speed: 55, kind: 'spark', gravity: 40, cone: Math.PI * 2 });
      spawnFloater(x, y - 8, `+${p.qty}`, '#39d0ff');
      return;
    }
    if (evt === 'gasHit') {
      timers.gasFlash = motionReduce ? 0.25 : 0.75;
      gasShake.t = 0.42;
      gasShake.elapsed = 0;
      const { x, y } = centerPx(p.col, p.row);
      burst({ x, y, count: motionReduce ? 4 : 14, color: '#8d66ff', life: 0.55, size: 3, speed: 70, kind: 'spark', cone: Math.PI * 2 });
      return;
    }
    if (evt === 'spark') {
      if (motionReduce || !d) return;
      const dir = d.avatar.faceDir || 'down';
      let cx = p.col * TILE + TILE / 2;
      let cy = p.row * TILE + TILE / 2;
      if (dir === 'right') cx = p.col * TILE;
      else if (dir === 'left') cx = p.col * TILE + TILE;
      else if (dir === 'down') cy = p.row * TILE;
      else if (dir === 'up') cy = p.row * TILE + TILE;
      const tint = p.type === 'vein' && p.ore ? ((ORE_TINTS[p.ore] || {}).vein || '#ffb35c') : '#a78262';
      burst({ x: cx, y: cy, count: 3, color: tint, life: 0.28, size: 1.8, speed: 45, kind: 'spark', cone: 1.1, gravity: 20 });
      return;
    }
    if (evt === 'scanPulse') {
      if (d) refreshCells(neighborhood(d.avatar.col, d.avatar.row, SCAN_RADIUS));
      return;
    }
    if (evt === 'install') {
      firePulseRing(p.col, p.row, 0x62e08a, 0.6);
      const { x, y } = centerPx(p.col, p.row);
      burst({ x, y, count: motionReduce ? 4 : 12, color: '#39d0ff', life: 0.5, size: 2.4, speed: 55, kind: 'spark', cone: Math.PI * 2 });
      return;
    }
    if (evt === 'cargoFull') {
      timers.cargoFlash = motionReduce ? 0.4 : 1.0;
    }
  }

  // ---------------------------------------------------------------- session lifecycle
  function begin(opts = {}) {
    motionReduce = !!opts.motionReduce;
    const d = getDrill();
    field = d ? d.field : null;
    buildDomOverlay();
    resize();
    // clear per-session content
    for (const [, g] of oreByCell) { oreRoot.remove(g); disposeGroup(g); }
    oreByCell.clear();
    for (const [, m] of gasByCell) gasRoot.remove(m);
    gasByCell.clear();
    for (const id of [...machines.keys()]) removeMachine(id);
    overlaySig = '';
    rebuildOverlays(null);
    umbilicalKey = '';
    if (umbilical) {
      scene.remove(umbilical.casing, umbilical.core);
      umbilical.casing.geometry.dispose();
      umbilical.core.geometry.dispose();
      umbilical = null;
    }
    particles.length = 0;
    partMesh.count = 0;
    for (const f of dom.floaters) f.el.remove();
    dom.floaters.length = 0;
    timers.gasFlash = 0;
    timers.cargoFlash = 0;
    gasShake.t = 0;
    drillTheta = 0;
    lookY = null;
    if (!field) { rover.visible = false; return; }
    buildRock();
    // seed ore / gas for the already-known parts of the field
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const tile = field[c][r];
        if (tile.type === 'gas') ensureGasAt(c, r);
        else if (tile.type === 'vein') syncOreAt(c, r);
      }
    }
    rover.visible = true;
    pulseEntries = [
      ...roverBuilt.pulses,
      { mat: gasMat, base: 0.7, amp: 0.32 },
    ];
  }

  // ---------------------------------------------------------------- frame
  function render(dt, timeS, ui) {
    const d = getDrill();
    if (!d || !field) return;
    const site = getSite ? getSite() : null;
    const projection = getProjection ? getProjection() : null;

    // camera + shake
    if (gasShake.t > 0) {
      gasShake.t = Math.max(0, gasShake.t - dt);
      gasShake.elapsed += dt;
    }
    const shakePx = drillGasShakeOffset(gasShake.t, gasShake.elapsed, motionReduce);
    const centerY = cameraCenterY(d, dt);
    poseCamera(centerY, (shakePx.x / TILE) * S, (-shakePx.y / TILE) * S);

    // rover
    const drawPos = avatarDrawPos(d.avatar, TILE);
    const rx = pxToWorldX(drawPos.x + TILE / 2);
    const ry = pxToWorldY(drawPos.y + TILE / 2);
    const moving = (d.avatar.moveDuration > 0 && d.avatar.moveElapsed < d.avatar.moveDuration);
    let shakeLX = 0, shakeLY = 0;
    if (d.avatar.isDrilling) {
      drillTheta += 42 * (1 + (d.drillTemp || 0) / 120) * dt;
      if (!motionReduce) {
        const amp = (1.2 + (d.drillTemp || 0) / 80) * 0.6 * (S / TILE);
        shakeLX = Math.sin(timeS * 53) * amp;
        shakeLY = Math.cos(timeS * 71) * amp;
      }
    }
    rover.position.set(rx + shakeLX, ry + shakeLY, Z.rover);
    const dirRot = { right: [0, 0, 0], left: [0, Math.PI, 0], down: [0, 0, -Math.PI / 2], up: [0, 0, Math.PI / 2] };
    const rot = dirRot[d.avatar.faceDir || 'down'] || dirRot.down;
    rover.rotation.set(rot[0], rot[1], rot[2]);
    roverBuilt.dyn.auger.rotation.y = drillTheta;
    headlight.intensity = d.energyDepleted ? 10 : 46;

    // site: machines + overlays + umbilical
    syncMachines(site, projection, timeS);
    const sig = overlaySignature(site);
    if (sig !== overlaySig) {
      overlaySig = sig;
      rebuildOverlays(site);
    }
    const flowing = !!(projection && projection.machines && projection.machines.some((m) => m.status
      && (m.status.state === 'running' || m.status.state === 'limited' || m.status.state === 'throttled')));
    const worstRatio = projection && projection.power.length
      ? projection.power.reduce((w, p) => Math.min(w, p.ratio), 1) : 1;
    laneCoreMat.emissiveIntensity = flowing
      ? (motionReduce ? 0.9 : 0.75 + 0.35 * Math.sin(timeS * 4.2)) : 0.3;
    powerCoreMat.emissiveIntensity = worstRatio >= 1 ? 1.0 : 0.25 + worstRatio * 0.55;
    syncUmbilical(d, rx, ry, moving);

    // fx + ui chrome
    syncCursor(ui);
    syncScanRing(d, rx, ry);
    stepFx(dt);
    if (!motionReduce) {
      for (const p of pulseEntries) p.mat.emissiveIntensity = p.base + Math.sin(timeS * 1.6 + p.base * 3) * p.amp;
      for (const [, rec] of machines) {
        for (const p of rec.pulses) p.mat.emissiveIntensity = p.base + Math.sin(timeS * 1.6 + p.base * 3) * p.amp;
      }
    }
    stepDom(d, dt);

    composer.render();
  }

  // ---------------------------------------------------------------- teardown
  function dispose() {
    if (ro) ro.disconnect();
    for (const [, g] of oreByCell) disposeGroup(g);
    oreByCell.clear();
    for (const id of [...machines.keys()]) removeMachine(id);
    if (ghost) disposeGroup(ghost.group);
    if (umbilical) {
      umbilical.casing.geometry.dispose();
      umbilical.core.geometry.dispose();
    }
    rebuildOverlays(null);
    for (const bucket of ['matrix', 'basalt']) {
      for (const inst of rockInst[bucket]) inst.dispose();
      rockInst[bucket] = [];
    }
    for (const [, t] of badgeTextures) t.dispose();
    for (const [, m] of oreMats) m.dispose();
    for (const m of [gasMat, laneCoreMat, powerCoreMat, casingMat, umbCasingMat, umbCoreMat,
      frameMat, ringSolidMat, ringEmptyMat, padOkMat, padBadMat, scanMat, partMat,
      rockMats.matrix, rockMats.basalt]) m.dispose();
    for (const g of [oreGeo, gasGeo, cellQuad, partGeo, ...chunkGeos]) g.dispose();
    if (backWall) backWall.geometry.dispose();
    disposeGroup(rover);
    envRT.dispose();
    if (dom.root) dom.root.remove();
    try { composer.dispose && composer.dispose(); } catch (_) { /* pass chain best-effort */ }
    renderer.dispose();
  }

  return { begin, render, notify, refreshCells, pickCell, dispose };
}
