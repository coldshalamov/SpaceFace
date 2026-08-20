// Asteroid works 3D renderer — the drill playfield drawn in the game's own engine, rebuilt as a
// Motherload-style cutaway in real 3D. The legibility laws this pass enforces:
//   - ONE CELL = ONE BLOCK. Every solid cell is the same beveled block, footprint-aligned to the
//     sim grid; joints read as masonry seams, never overlay lines. Variation lives inside the
//     face (relief, tint, bump), never across the cell boundary.
//   - CARVED = HONEST CAVITY. A dug cell opens a real recess: cavity floor plus the side walls of
//     the blocks around it. What you see is what the sim has.
//   - VEINS ARE TREASURE. Surveyed (or approached) veins erupt as crystal clusters tinted by ore,
//     on a mineral stain — you can see what a cell holds before you spend it.
//   - GAS IS DANGER, NOT LOOT. Pockets stay hidden until their tell (nearby digging or a survey),
//     then read as a cracked cell seeping sickly vapor — never a glowing pickup.
//   - THE RIG IS A VEHICLE. Treads, beacon, cabin light, articulated auger arm that bites the wall,
//     on a lit umbilical spooling down from the surface derrick you entered through.
//
// Contract with the screen shell (asteroidScreen.js):
//   - read-only over game state: draws state.drill / the site record, never mutates either;
//   - the shell owns the rAF loop, DOM panels, bus subscriptions and input; it calls
//     render(dt, timeS, ui) every frame and forwards drill/site events through notify();
//   - pickCell(clientX, clientY) raycasts the cut plane so the tilted camera stays pixel-honest.
//
// Determinism note: all layout variation derives from hash32(col,row) — the same rock always looks
// the same. Math.random only feathers cosmetic particle bursts, as the shipped 2D screen did.
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
import {
  makeRockMaterials, makeMachine, makeRover, makeDerrick, metalMat, emissiveMat,
  makeCellBlockGeos, makeOreClusterGeo, makeGasVaporGeo, makeCrackGeos,
} from '../../render/asteroidInteriorPreview.js';

const { COLS, ROWS, SCAN_RADIUS, SCAN_ACTIVE_S } = DRILL_CONST;
export const VIEW_ROWS = 18;

const TILE = 40;              // px-space kept for parity with the shipped particle/shake helpers
const S = 2.2;                // world units per cell — the astlab-proven scale for these builders
const DEPTH = S * 1.5;        // block body depth; the cavity recess carved cells reveal
// Camera tilt — small on purpose: enough for block sides + cavity floors to read, small enough
// that the grid stays a precision surface.
const CAM_YAW = 0.10;
const CAM_PITCH = 0.15;
const CAM_DIST = 260;

// Depth layering (camera looks down -z). The cut plane is the law: every solid block's front pad
// lands exactly at ROCK_FACE; carved cells recess to Z.back. Block pads protrude up to ~0.22
// proud of the plane (bevel relief), so face overlays sit at +0.24 and beyond.
const ROCK_FACE = DEPTH;
const Z = {
  back: -0.55,                // cavity floor
  overlay: 0.14,              // conduits hug the cavity floor
  rover: 0.62,                // the rig rides inside the tunnel
  stain: ROCK_FACE + 0.24,    // mineral stains / murk sit on the cut face
  ore: ROCK_FACE + 0.27,      // crystal bases
  gas: ROCK_FACE + 0.42,      // seeping vapor, proud of the face
  particles: ROCK_FACE + 0.5,
  face: ROCK_FACE + 0.42,     // cursor / ring / pick plane — just proud of everything
  surface: ROCK_FACE * 0.45,  // derrick stands in the slice plane
};

const ENTRY_COL = Math.floor(COLS / 2);

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

// Crack decal canvases for the block being bored: three stages of spread, drawn once.
// Deterministic LCG — the overlay is static content, not a per-frame random.
function makeCrackDecalTexture(stage) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  let seed = (9151 + stage * 733) >>> 0;
  const rr = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  g.strokeStyle = 'rgba(10,7,4,0.92)';
  g.lineCap = 'round';
  const branches = 4 + stage * 2;
  for (let b = 0; b < branches; b++) {
    let x = 128 + (rr() - 0.5) * 30;
    let y = 128 + (rr() - 0.5) * 30;
    let a = (b / branches) * Math.PI * 2 + rr() * 0.7;
    const segs = 3 + Math.floor(rr() * 3) + stage;
    g.lineWidth = 4.5 - stage * 0.4 - rr();
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < segs; i++) {
      a += (rr() - 0.5) * 1.1;
      const len = 14 + rr() * 26;
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // chip specks around the impact point
  g.fillStyle = 'rgba(10,7,4,0.85)';
  const specks = 4 + stage * 5;
  for (let i = 0; i < specks; i++) {
    const a = rr() * Math.PI * 2;
    const r = 8 + rr() * (30 + stage * 22);
    g.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 2.5, 2.5);
  }
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

export function createAsteroidRenderer3d({ canvas, wrapEl, drillSys, getDrill, getSite, getProjection }) {
  injectOverlayStyle();

  // ---------------------------------------------------------------- renderer + composer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080f);

  const halfW = (COLS * S / 2) * 1.02;
  const halfH = halfW * (VIEW_ROWS / COLS);
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 2000);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1120, 720), 0.7, 0.55, 0.55);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const envRT = bakeEnvMap(renderer);
  const envMap = envRT.texture;
  scene.environment = envMap;

  // ---------------------------------------------------------------- lights
  const lightRig = new THREE.Group();
  scene.add(lightRig);
  const key = new THREE.DirectionalLight(0xfff0dc, 4.2);
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
  // The cut face is flat-on to the camera: the fill is what lights the pads. It must be strong
  // enough that unsurveyed mass reads as solid rock, not void.
  const fill = new THREE.DirectionalLight(0xcfd8ea, 1.7);
  fill.position.set(0, 0, 300);
  lightRig.add(fill, fill.target);
  scene.add(new THREE.AmbientLight(0x2a3342, 0.85));

  // ---------------------------------------------------------------- session containers
  const rockGroup = new THREE.Group();      // instanced blocks + plateau + backing wall
  const oreRoot = new THREE.Group();        // instanced crystal clusters + stains + badges
  const gasRoot = new THREE.Group();        // per-cell gas pocket groups
  const siteRoot = new THREE.Group();       // machines
  const overlayRoot = new THREE.Group();    // merged conduit meshes
  const fxRoot = new THREE.Group();         // particles / rings / cursor / scan / crack decal
  scene.add(rockGroup, oreRoot, gasRoot, siteRoot, overlayRoot, fxRoot);

  const rockMats = makeRockMaterials(envMap);

  // Shared cell-kit geometry (never disposed per cell — see sharedGeos)
  const blockGeos = makeCellBlockGeos();
  const clusterGeos = [makeOreClusterGeo(0), makeOreClusterGeo(1)];
  const gasVaporGeo = makeGasVaporGeo();
  const crackGeos = makeCrackGeos();
  const cellQuad = new THREE.PlaneGeometry(S, S);

  // gas pocket language — a sickly vapor mass seething inside the cell + amber warning fissures
  // on the face. Reads as "cracked containment", never as a pickup.
  const gasMat = new THREE.MeshStandardMaterial({
    color: 0x6b7416, emissive: 0x464e08, emissiveIntensity: 0.4,
    roughness: 0.9, metalness: 0.05, flatShading: true,
  });
  const gasCrackBase = new THREE.Color(0xffc23e);
  const gasCrackMat = new THREE.MeshBasicMaterial({ color: 0xffc23e, transparent: true, opacity: 0.9, depthWrite: false });
  const gasCrackHotMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 1, depthWrite: false });

  // ore — cached materials per (oreId, locked); clusters instanced per bucket
  const oreMats = new Map();
  function oreMaterial(oreId, locked) {
    const key2 = `${oreId}:${locked ? 1 : 0}`;
    let m = oreMats.get(key2);
    if (m) return m;
    const tint = ORE_TINTS[oreId] || ORE_TINTS.cmdty_silicate;
    // Crystals must read against shadowed rock at gameplay zoom: bright base leaning toward the
    // glint, a touch of self-emission in the vein hue so the colour survives the dark, modest
    // metalness so the env doesn't drag them black.
    const col = new THREE.Color(tint.vein);
    if (tint.glint) col.lerp(new THREE.Color(tint.glint), 0.3);
    if (locked) col.multiplyScalar(0.42);
    m = new THREE.MeshStandardMaterial({
      color: col, roughness: 0.3, metalness: 0.35, flatShading: true, envMap,
      emissive: locked ? new THREE.Color(0x000000) : new THREE.Color(tint.glow || tint.vein),
      emissiveIntensity: locked ? 0 : (tint.glow ? 0.85 : 0.3),
    });
    oreMats.set(key2, m);
    return m;
  }
  // mineral stain: one instanced quad for every revealed vein, tinted per cell — a dark
  // mineralised blotch the cluster sits in
  const stainMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34, depthWrite: false });

  const badgeTextures = new Map();
  // Shared badge sprite materials, one per tier: disposeGroup() frees per-cell (_own) materials,
  // and a disposed sprite material releases the shared sprite GL program once its last user dies —
  // the next badge would then re-link it mid-render. Cache-owned + noDispose keeps it pinned.
  const badgeMats = new Map();
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
  function badgeSpriteMaterial(tier) {
    let m = badgeMats.get(tier);
    if (!m) {
      m = new THREE.SpriteMaterial({ map: badgeTexture(tier), transparent: true, depthTest: false });
      m.dispose = () => {}; // cache-owned: per-cell disposeGroup must not release the shared program
      badgeMats.set(tier, m);
    }
    return m;
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

  // crack decal on the block being bored — stage textures swapped as the bit sinks
  const crackTexs = [makeCrackDecalTexture(0), makeCrackDecalTexture(1), makeCrackDecalTexture(2)];
  const crackDecalMat = new THREE.MeshBasicMaterial({ map: crackTexs[0], transparent: true, depthWrite: false });
  const crackDecal = new THREE.Mesh(new THREE.PlaneGeometry(S, S), crackDecalMat);
  crackDecal.visible = false;
  crackDecal.renderOrder = 25;
  fxRoot.add(crackDecal);

  // particles — px-space sim (the shipped helpers), instanced additive chips on screen…
  const PARTICLE_CAP = 200;
  const partGeo = new THREE.BoxGeometry(1, 1, 1);
  const partMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const partMesh = new THREE.InstancedMesh(partGeo, partMat, PARTICLE_CAP);
  partMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  partMesh.count = 0;
  partMesh.renderOrder = 26;
  partMesh.frustumCulled = false;
  fxRoot.add(partMesh);
  // …plus opaque tumbling rock chunks (real debris, not glow confetti)
  const CHUNK_CAP = 72;
  const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
  const chunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.05, envMap, envMapIntensity: 0.3 });
  const chunkMesh = new THREE.InstancedMesh(chunkGeo, chunkMat, CHUNK_CAP);
  chunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chunkMesh.count = 0;
  chunkMesh.frustumCulled = false;
  fxRoot.add(chunkMesh);
  let particles = [];
  const burst = (opts) => {
    const before = particles.length;
    spawnParticleBurst(particles, opts);
    for (let i = before; i < particles.length; i++) {
      particles[i]._c3 = new THREE.Color(particles[i].color);
    }
  };
  // Rock-colored tumbling chunks with real gravity — the crumble when a block lets go.
  function spawnChunks(px, py, colorHex, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 26 + Math.random() * 85;
      const life = 0.75 + Math.random() * 0.4;
      particles.push({
        x: px + (Math.random() - 0.5) * 9, y: py + (Math.random() - 0.5) * 9,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        color: colorHex, _c3: new THREE.Color(colorHex).multiplyScalar(0.65 + Math.random() * 0.5),
        size: 3.6 + Math.random() * 3.4,
        life, maxLife: life,
        gravity: 190, kind: 'chunk', isChunk: true,
        rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 11,
      });
    }
  }

  // rover — a vehicle, not a dot
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
  // a small warm work light — not the blue orb that read as "you are this dot"
  const roverGlow = new THREE.PointLight(0xffd9a8, 2.6, S * 3.4, 2);
  roverGlow.position.set(0, S * 0.3, S * 0.4);
  rover.add(roverGlow);
  // the headlamp cone lights the face the rig is working
  const headSpot = new THREE.SpotLight(0xffe0b0, 30, S * 5, 0.7, 0.6, 1.5);
  headSpot.position.copy(roverBuilt.dyn.lampAnchor.position);
  rover.add(headSpot);
  headSpot.target = headTarget;
  const roverAnim = { flipY: 0, armAim: -Math.PI / 2, bite: 0, wheelSpin: 0, lean: 0, bob: 0 };

  // surface derrick (the umbilical winch) — built per session over the entry shaft
  let derrickBuilt = null;
  let derrickBaseY = 0;

  // umbilical
  let umbilical = null;      // { casing, core }
  let umbilicalKey = '';
  let umbilicalTimer = 0;
  const umbCasingMat = metalMat(0x232c3c, envMap);
  umbCasingMat.roughness = 0.62;
  const umbCoreMat = emissiveMat(0x0ea5e9, 2.4);

  // ---------------------------------------------------------------- per-session state
  let motionReduce = false;
  let field = null;
  let timeSNow = 0;
  const cellRock = new Map();   // idx -> { mesh, i, carved, c, r }
  let rockInst = { matrix: [], basalt: [] };   // one InstancedMesh per (bucket, block variant)
  let plateauInst = null;
  let backWall = null;
  let oreBuckets = new Map();   // `${ore}:${locked}` -> { key, mesh, cap, n, cells: Map<idx, i> }
  let oreCaps = new Map();      // oreId -> vein count in the field (survey can only reveal, never add)
  let oreCellIndex = new Map(); // idx -> { bucket, i, idx }
  const oreWakes = [];          // reveal pop-in animations
  let stainMesh = null;         // InstancedMesh — one mineral stain quad per revealed vein
  let stainCells = new Map();   // idx -> stain slot
  let stainCellsCap = 0;
  let stainN = 0;
  const badges = new Map();     // idx -> Sprite (tier-locked veins)
  const gasByCell = new Map();  // idx -> { group, vapor, cracks, phase, baseScale, hot }
  const machines = new Map();   // machineId -> { group, defId, dyn, col, row, geoSig, arms, pulses }
  let ghost = null;             // { defId, group }
  let overlaySig = '';
  let lookY = null;
  let drillTheta = 0;
  let digCell = null;           // { c, r, idx } — block currently taking the bit
  let digGasHot = null;         // gas entry currently screaming under the bit
  let dustTimer = 0;
  let lastRevealCell = { col: -1, row: -1 };
  const gasShake = { t: 0, elapsed: 0 };
  const timers = { gasFlash: 0, cargoFlash: 0 };
  let pulseEntries = [];        // [{mat, base, amp}] — rover + derrick

  // shared geometry that must survive per-cell group disposal
  const sharedGeos = new Set([...blockGeos, ...clusterGeos, gasVaporGeo, ...crackGeos, cellQuad, partGeo, chunkGeo]);

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
  // One cell = one block, footprint-aligned, front pad flush with the cut plane. The grid reads
  // through the bevel joints; tint + bump + three relief variants carry the stone. Never jitter
  // position/rotation/scale across the boundary — the sim grid and the picture are the same thing.
  const dummy = new THREE.Object3D();
  const colScratch = new THREE.Color();

  function bucketFor(tile) {
    if (!tile || tile.type === 'empty') return null;
    return tile.type === 'rock' ? 'basalt' : 'matrix';
  }

  function rockInstanceColor(c, r, bucket, surveyed, out) {
    const depthT = r / ROWS;
    const tintBase = (0.82 + rnd01(c + 13, r + 5, 'rt') * 0.4) * (1.08 - depthT * 0.3);
    let tint = tintBase;
    let warm = (rnd01(c + 6, r + 8, 'rw') - 0.32) * 0.2;
    if (depthT < 0.09) warm += 0.1;    // sun-warmed regolith near the surface
    else warm -= depthT * 0.05;        // cooler with depth
    if (bucket === 'basalt') tint *= 0.8;
    if (surveyed) {
      // Surveyed: full warmth — the survey "identifies", it does not switch the lights on.
      out.setRGB(Math.min(1.35, tint + warm), tint, Math.max(0, tint - warm * 1.15));
    } else {
      // Unsurveyed mass reads as the SAME ROCK, cooled and slightly dimmed — fog hides identity
      // (ore/gas veins), never substance. The field must be legible before the first pulse.
      const g = tint * 0.8;
      out.setRGB(g * 0.88 + warm * 0.2, g * 0.97, Math.min(1.35, g * 1.12));
    }
    return out;
  }

  function setRockMatrix(c, r, carved, dig = 0) {
    if (carved) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0, 0, 0);
    } else {
      // dig: the block being bored cracks loose — sinks into the face and shrinks in its socket
      const shrink = 1 - dig * 0.12;
      dummy.position.set(worldX(c), worldY(r), ROCK_FACE - dig * S * 0.2);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(S * shrink, S * shrink, DEPTH);
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
    // Bucket by material AND block variant — one InstancedMesh per (bucket, variant).
    const lists = { matrix: [], basalt: [] };
    for (let v = 0; v < blockGeos.length; v++) { lists.matrix.push([]); lists.basalt.push([]); }
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const bucket = bucketFor(field[c][r]);
        if (bucket) lists[bucket][hash32(c, r, 'ckv') % blockGeos.length].push({ c, r });
      }
    }
    for (const bucket of ['matrix', 'basalt']) {
      for (let v = 0; v < blockGeos.length; v++) {
        const list = lists[bucket][v];
        const inst = new THREE.InstancedMesh(blockGeos[v], rockMats[bucket], Math.max(1, list.length));
        inst.castShadow = true;
        inst.receiveShadow = true;
        inst.frustumCulled = false;
        list.forEach((cell, i) => {
          const surveyed = drillSys.isTileSurveyed(cell.c, cell.r);
          setRockMatrix(cell.c, cell.r, false);
          inst.setMatrixAt(i, dummy.matrix);
          inst.setColorAt(i, rockInstanceColor(cell.c, cell.r, bucket, surveyed, colScratch));
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

  // The surface strip: a jagged plateau row above the field + the winch derrick over the entry
  // shaft. This is where you came in — the umbilical spools down from the drum.
  function buildSurface() {
    if (plateauInst) {
      rockGroup.remove(plateauInst);
      plateauInst.dispose();
      plateauInst = null;
    }
    if (derrickBuilt) {
      scene.remove(derrickBuilt.group);
      disposeGroup(derrickBuilt.group);
      derrickBuilt = null;
    }
    plateauInst = new THREE.InstancedMesh(blockGeos[0], rockMats.matrix, COLS + 2);
    plateauInst.castShadow = true;
    plateauInst.receiveShadow = true;
    plateauInst.frustumCulled = false;
    for (let i = 0; i < COLS + 2; i++) {
      const c = i - 1;
      const h = rnd01(c, 77, 'ph');
      dummy.position.set(worldX(c), worldY(-1), 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(S * 1.02, S * (0.55 + h * 0.8), DEPTH);
      dummy.updateMatrix();
      plateauInst.setMatrixAt(i, dummy.matrix);
      const t = 0.62 + rnd01(c, 78, 'pt') * 0.3;
      plateauInst.setColorAt(i, colScratch.setRGB(t * 1.08, t, t * 0.94));
    }
    plateauInst.instanceMatrix.needsUpdate = true;
    if (plateauInst.instanceColor) plateauInst.instanceColor.needsUpdate = true;
    rockGroup.add(plateauInst);

    derrickBuilt = makeDerrick(S, envMap);
    // per-session build: tag materials so disposeGroup frees them with the next begin()/dispose()
    derrickBuilt.group.traverse((o) => {
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mt of mats) mt._own = true;
      }
    });
    derrickBaseY = worldY(-1) + (S * (0.55 + rnd01(ENTRY_COL, 77, 'ph') * 0.8)) / 2;
    derrickBuilt.group.position.set(worldX(ENTRY_COL), derrickBaseY, Z.surface);
    scene.add(derrickBuilt.group);
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
        if (o.geometry && !sharedGeos.has(o.geometry)) o.geometry.dispose();
        // Materials here are either shared caches (ore/gas/frame) or per-build (machines/ghosts):
        // per-build ones are tagged _own at creation.
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m && m._own) m.dispose();
      }
    });
  }

  function addStain(idx, c, r, oreId) {
    if (!stainMesh || stainCells.has(idx) || stainN >= stainCellsCap) return;
    const i = stainN++;
    const tint = (ORE_TINTS[oreId] || {}).vein || '#9aa4b8';
    dummy.position.set(worldX(c), worldY(r), Z.stain);
    dummy.rotation.set(0, 0, rnd01(c, r, 'sr') * Math.PI * 2);
    dummy.scale.setScalar(S * (0.88 + rnd01(c, r, 'ss') * 0.14));
    dummy.updateMatrix();
    stainMesh.setMatrixAt(i, dummy.matrix);
    stainMesh.setColorAt(i, colScratch.set(tint).multiplyScalar(0.22));
    stainMesh.count = stainN;
    stainMesh.instanceMatrix.needsUpdate = true;
    if (stainMesh.instanceColor) stainMesh.instanceColor.needsUpdate = true;
    stainCells.set(idx, i);
  }

  function removeStain(idx) {
    const i = stainCells.get(idx);
    if (i == null || !stainMesh) return;
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    stainMesh.setMatrixAt(i, dummy.matrix);
    stainMesh.instanceMatrix.needsUpdate = true;
    stainCells.delete(idx);
  }

  function addBadge(idx, c, r, tier) {
    if (badges.has(idx)) return;
    const sMat = badgeSpriteMaterial(tier); // shared per tier — cache-owned, disposeGroup leaves it alone
    const badge = new THREE.Sprite(sMat);
    badge.scale.set(S * 0.3, S * 0.15, 1);
    badge.position.set(worldX(c) + S * 0.28, worldY(r) + S * 0.28, Z.face);
    badge.renderOrder = 25;
    oreRoot.add(badge);
    badges.set(idx, badge);
  }

  function removeBadge(idx) {
    const badge = badges.get(idx);
    if (!badge) return;
    oreRoot.remove(badge);
    badges.delete(idx);
  }

  function oreBucketFor(oreId, locked) {
    const key2 = `${oreId}:${locked ? 1 : 0}`;
    let b = oreBuckets.get(key2);
    if (b) return b;
    const cap = Math.max(1, oreCaps.get(oreId) || 1);
    const mesh = new THREE.InstancedMesh(clusterGeos[(oreId.length + (locked ? 1 : 0)) % clusterGeos.length], oreMaterial(oreId, locked), cap);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    oreRoot.add(mesh);
    b = { key: key2, mesh, cap, n: 0, cells: new Map() };
    oreBuckets.set(key2, b);
    return b;
  }

  function killOreInstance(entry) {
    if (!entry) return;
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    entry.bucket.mesh.setMatrixAt(entry.i, dummy.matrix);
    entry.bucket.mesh.instanceMatrix.needsUpdate = true;
    entry.bucket.cells.delete(entry.idx);
    oreCellIndex.delete(entry.idx);
  }

  // Surveyed veins erupt their crystal cluster on a mineral stain; tier-locked ones sit dull
  // under an MK badge. Cluster scale-pops on reveal — the survey's reward beat.
  function syncOreAt(c, r) {
    const tile = field[c] && field[c][r];
    const idx = tileIndex(c, r);
    const wanted = tile && tile.type === 'vein' && tile.ore && drillSys.isTileSurveyed(c, r);
    const existing = oreCellIndex.get(idx);
    if (!wanted) {
      if (existing) killOreInstance(existing);
      removeBadge(idx);
      removeStain(idx);
      return;
    }
    const req = tile.tierReq || drillTierReqForOre(tile.ore);
    const locked = drillSys.getDrillTier() < req;
    const key2 = `${tile.ore}:${locked ? 1 : 0}`;
    if (existing && existing.bucket.key === key2) return;
    if (existing) killOreInstance(existing);
    const b = oreBucketFor(tile.ore, locked);
    if (b.n >= b.cap) return; // cap = vein count of this ore in the field; cannot overflow honestly
    const i = b.n++;
    const rotZ = rnd01(c, r, 'or') * Math.PI * 2;
    const scale = S * (1.12 + rnd01(c, r, 'os') * 0.2);
    dummy.position.set(worldX(c), worldY(r), Z.ore);
    dummy.rotation.set(0, 0, rotZ);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    b.mesh.setMatrixAt(i, dummy.matrix);
    b.mesh.count = b.n;
    b.mesh.instanceMatrix.needsUpdate = true;
    b.cells.set(idx, i);
    const entry = { bucket: b, i, idx };
    oreCellIndex.set(idx, entry);
    oreWakes.push({ entry, x: worldX(c), y: worldY(r), rotZ, scale, t0: timeSNow });
    addStain(idx, c, r, tile.ore);
    if (locked) addBadge(idx, c, r, req);
    else removeBadge(idx);
  }

  function removeOreAt(c, r) {
    const idx = tileIndex(c, r);
    const existing = oreCellIndex.get(idx);
    if (existing) killOreInstance(existing);
    removeBadge(idx);
    removeStain(idx);
  }

  function removeGasAt(c, r) {
    const idx = tileIndex(c, r);
    const rec = gasByCell.get(idx);
    if (!rec) return;
    gasRoot.remove(rec.group);
    gasByCell.delete(idx);
    if (digGasHot === rec) digGasHot = null;
  }

  // Gas stays hidden until its tell (digging nearby, or a survey pulse) — then the cell reads as
  // cracked rock venting sickly vapor. It must never read as a collectible.
  function syncGasAt(c, r) {
    const idx = tileIndex(c, r);
    const tile = field[c] && field[c][r];
    const revealed = !!(tile && tile.type === 'gas' && (tile.surveyed || drillSys.isHazardRevealed(c, r)));
    const existing = gasByCell.get(idx);
    if (!revealed) {
      if (existing) removeGasAt(c, r);
      return;
    }
    if (existing) return;
    const group = new THREE.Group();
    group.position.set(worldX(c), worldY(r), 0);
    const vapor = new THREE.Mesh(gasVaporGeo, gasMat);
    vapor.position.z = Z.gas;
    vapor.rotation.z = rnd01(c, r, 'gv') * Math.PI * 2;
    const baseScale = S * (0.55 + rnd01(c, r, 'gs') * 0.15);
    vapor.scale.setScalar(baseScale);
    group.add(vapor);
    const cracks = [];
    const nCracks = 2 + (hash32(c, r, 'gc') % 2);
    for (let i = 0; i < nCracks; i++) {
      const cm = new THREE.Mesh(crackGeos[hash32(c + i * 3, r, 'gcr') % crackGeos.length], gasCrackMat);
      cm.position.z = Z.stain + 0.03 + i * 0.006;
      cm.rotation.z = rnd01(c + i, r, 'gcz') * Math.PI * 2;
      cm.scale.setScalar(S);
      group.add(cm);
      cracks.push(cm);
    }
    gasRoot.add(group);
    gasByCell.set(idx, { group, vapor, cracks, phase: rnd01(c, r, 'gp') * Math.PI * 2, baseScale, hot: false });
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
      if (tile.type === 'gas') syncGasAt(col, row);
      if (rec && !rec.carved) {
        const surveyed = drillSys.isTileSurveyed(col, row);
        rec.mesh.setColorAt(rec.i, rockInstanceColor(col, row, tile.type === 'rock' ? 'basalt' : 'matrix', surveyed, colScratch));
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
    if (cell.kind === 'gas') return 0xd8b93a;
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

  // Minimal merge (positions/normals/uv discarded where absent) — a handful of boxes baked with
  // their transforms above, so a simple attribute concat suffices.
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
  // The tether is the way home: a lit-core cable spooling off the surface derrick's winch drum,
  // down the entry shaft, along every cell the rig has visited, to the socket on its back.
  function syncUmbilical(d, roverX, roverY, moving, dt) {
    umbilicalTimer -= dt;
    const trail = d.cableTrail || [];
    const cellKey = `${trail.length}:${d.avatar.col}:${d.avatar.row}`;
    if (umbilical && cellKey === umbilicalKey && !(moving && umbilicalTimer <= 0)) return;
    umbilicalKey = cellKey;
    umbilicalTimer = 0.09;
    if (umbilical) {
      scene.remove(umbilical.casing, umbilical.core);
      umbilical.casing.geometry.dispose();
      umbilical.core.geometry.dispose();
      umbilical = null;
    }
    const drumY = derrickBaseY + S * 1.14;
    const pts = [
      new THREE.Vector3(worldX(ENTRY_COL), drumY, Z.surface),
      new THREE.Vector3(worldX(ENTRY_COL), worldY(0) + S * 0.6, Z.rover - 0.15),
    ];
    for (const p of trail) pts.push(new THREE.Vector3(worldX(p.col), worldY(p.row), Z.rover - 0.1));
    pts.push(new THREE.Vector3(
      roverX - (roverAnim.flipY > Math.PI / 2 ? -1 : 1) * S * 0.38, roverY + S * 0.1, Z.rover - 0.05,
    ));
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.12);
    const segs = Math.min(240, pts.length * 7);
    const casing = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, S * 0.13, 7, false), umbCasingMat);
    casing.castShadow = true;
    const core = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, S * 0.088, 5, false), umbCoreMat);
    scene.add(casing, core);
    umbilical = { casing, core };
  }

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
    // Relaxed top clamp: at the surface the frame includes the plateau, the derrick, and a slice
    // of sky — "you came in from up there" — then follows the bore down.
    const maxY = worldY(0) + S / 2 - (VIEW_ROWS / 2) * S + S * 3.2;
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
    // Deliberately raking (lateral+above, shallow z) so block bevels light and cavities shadow.
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

  // ---------------------------------------------------------------- dig progress
  // The block under the bit cracks, sinks, and sheds dust before it lets go — the physics of
  // "how much longer" read straight off the rock, no instrument required.
  function syncDigTarget(d, dt) {
    const tgt = d.avatar.isDrilling ? d.avatar.drillTarget : null;
    const tile = tgt && field[tgt.col] && field[tgt.col][tgt.row];
    if (!tgt || !tile || tile.type === 'empty') {
      if (digCell) {
        restoreDigBlock();
        digCell = null;
      }
      crackDecal.visible = false;
      if (digGasHot) { setGasHot(digGasHot, false); digGasHot = null; }
      return;
    }
    const idx = tileIndex(tgt.col, tgt.row);
    if (!digCell || digCell.idx !== idx) {
      if (digCell) restoreDigBlock();
      digCell = { c: tgt.col, r: tgt.row, idx };
    }
    const prog = Math.max(0, Math.min(1, 1 - (Math.max(0, tile.hp) / (tile.maxHp || 1))));
    const rec = cellRock.get(idx);
    if (rec && !rec.carved) {
      setRockMatrix(tgt.col, tgt.row, false, prog);
      rec.mesh.setMatrixAt(rec.i, dummy.matrix);
      rec.mesh.instanceMatrix.needsUpdate = true;
    }
    crackDecal.visible = true;
    crackDecal.position.set(worldX(tgt.col), worldY(tgt.row), Z.stain + 0.015);
    const stage = Math.min(2, Math.floor(prog * 3));
    if (crackDecalMat.map !== crackTexs[stage]) {
      crackDecalMat.map = crackTexs[stage];
      crackDecalMat.needsUpdate = true;
    }
    crackDecal.scale.setScalar(0.68 + prog * 0.32);
    // a gas pocket under the bit screams: fissures run hot, vapor churns hard
    if (tile.type === 'gas') {
      const g = gasByCell.get(idx);
      if (g && digGasHot !== g) {
        if (digGasHot) setGasHot(digGasHot, false);
        setGasHot(g, true);
        digGasHot = g;
      }
    } else if (digGasHot) {
      setGasHot(digGasHot, false);
      digGasHot = null;
    }
    // dust + chips dribbling off the contact face
    dustTimer -= dt;
    if (dustTimer <= 0) {
      dustTimer = motionReduce ? 0.22 : 0.09;
      const px = tgt.col * TILE + TILE / 2 - (tgt.col - d.avatar.col) * TILE * 0.5;
      const py = tgt.row * TILE + TILE / 2 - (tgt.row - d.avatar.row) * TILE * 0.5;
      const dustColor = tile.type === 'rock' ? '#59606e' : (tile.type === 'gas' ? '#8a9426' : '#8a715a');
      burst({
        x: px, y: py, count: 2, color: dustColor, life: 0.5, size: 2.6,
        speed: 22, gravity: 30, kind: 'dust', cone: 1.6,
        angle: Math.atan2(d.avatar.row - tgt.row, d.avatar.col - tgt.col),
      });
      if (!motionReduce && tile.hp > 0) spawnChunks(px, py, dustColor, 1);
    }
  }

  function restoreDigBlock() {
    const rec = digCell && cellRock.get(digCell.idx);
    if (rec && !rec.carved) {
      setRockMatrix(digCell.c, digCell.r, false);
      rec.mesh.setMatrixAt(rec.i, dummy.matrix);
      rec.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function setGasHot(rec, hot) {
    rec.hot = hot;
    for (const cm of rec.cracks) cm.material = hot ? gasCrackHotMat : gasCrackMat;
  }

  // ---------------------------------------------------------------- particles + floaters
  function stepFx(dt) {
    particles = stepParticles(particles, dt);
    if (particles.length > PARTICLE_CAP) {
      particles.copyWithin(0, particles.length - PARTICLE_CAP);
      particles.length = PARTICLE_CAP;
    }
    let n = 0;
    let nc = 0;
    for (const p of particles) {
      if (p.isFloater) continue;
      const alpha = Math.max(0, p.life / (p.maxLife || 0.001));
      if (p.isChunk) {
        // opaque tumbling debris: gravity falls, screen-plane spin, shrinks as it crumbles
        if (nc >= CHUNK_CAP) continue;
        p.rot += p.spin * dt;
        dummy.position.set(pxToWorldX(p.x), pxToWorldY(p.y), Z.particles);
        dummy.rotation.set(0, 0, p.rot);
        dummy.scale.setScalar(Math.max(0.001, (p.size / TILE) * S * (0.35 + 0.65 * alpha)));
        dummy.updateMatrix();
        chunkMesh.setMatrixAt(nc, dummy.matrix);
        chunkMesh.setColorAt(nc, p._c3 || colScratch.set(0x8a715a));
        nc++;
        continue;
      }
      if (n >= PARTICLE_CAP) continue;
      const sizeW = (p.size / TILE) * S * (p.isDust || p.isSteam ? (1 + (1 - alpha) * 2) : 1);
      dummy.position.set(pxToWorldX(p.x), pxToWorldY(p.y), Z.particles);
      dummy.rotation.set(0, 0, (p.x + p.y) * 0.1);
      dummy.scale.setScalar(Math.max(0.001, sizeW * alpha));
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
    chunkMesh.count = nc;
    if (nc) {
      chunkMesh.instanceMatrix.needsUpdate = true;
      if (chunkMesh.instanceColor) chunkMesh.instanceColor.needsUpdate = true;
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
      if (digCell && digCell.idx === tileIndex(p.col, p.row)) digCell = null;
      crackDecal.visible = false;
      const { x, y } = centerPx(p.col, p.row);
      const rockColor = p.wasGas ? '#8a9426'
        : (p.type === 'rock' ? '#4a5162' : '#7a6650');
      spawnChunks(x, y, rockColor, motionReduce ? 4 : 8);
      burst({ x, y, count: motionReduce ? 5 : 10, color: '#a78262', life: 0.45, size: 2.8, speed: 60, kind: 'dust', gravity: 55, cone: Math.PI * 2 });
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
      spawnChunks(x, y, '#8a9426', motionReduce ? 5 : 12);
      burst({ x, y, count: motionReduce ? 5 : 16, color: '#ffc23e', life: 0.6, size: 3, speed: 85, kind: 'spark', cone: Math.PI * 2 });
      burst({ x, y, count: motionReduce ? 4 : 10, color: '#5f6d12', life: 0.8, size: 3.4, speed: 45, kind: 'steam', cone: Math.PI * 2 });
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
      const tint = p.type === 'vein' && p.ore ? ((ORE_TINTS[p.ore] || {}).vein || '#ffb35c')
        : (p.type === 'rock' ? '#59606e' : (p.type === 'gas' ? '#ffc23e' : '#a78262'));
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
    for (const [, b] of oreBuckets) { oreRoot.remove(b.mesh); b.mesh.dispose(); }
    oreBuckets = new Map();
    oreCellIndex = new Map();
    oreWakes.length = 0;
    for (const [, badge] of badges) oreRoot.remove(badge);
    badges.clear();
    if (stainMesh) { oreRoot.remove(stainMesh); stainMesh.dispose(); stainMesh = null; }
    stainCells = new Map();
    stainN = 0;
    for (const [, m] of gasByCell) gasRoot.remove(m.group);
    gasByCell.clear();
    for (const id of [...machines.keys()]) removeMachine(id);
    overlaySig = '';
    rebuildOverlays(null);
    umbilicalKey = '';
    umbilicalTimer = 0;
    if (umbilical) {
      scene.remove(umbilical.casing, umbilical.core);
      umbilical.casing.geometry.dispose();
      umbilical.core.geometry.dispose();
      umbilical = null;
    }
    particles.length = 0;
    partMesh.count = 0;
    chunkMesh.count = 0;
    for (const f of dom.floaters) f.el.remove();
    dom.floaters.length = 0;
    timers.gasFlash = 0;
    timers.cargoFlash = 0;
    gasShake.t = 0;
    drillTheta = 0;
    lookY = null;
    digCell = null;
    digGasHot = null;
    crackDecal.visible = false;
    dustTimer = 0;
    lastRevealCell = { col: -1, row: -1 };
    // surface dressing is per-session (plateau tint/derrick position are field-stable but cheap)
    if (plateauInst) { rockGroup.remove(plateauInst); plateauInst.dispose(); plateauInst = null; }
    if (derrickBuilt) { scene.remove(derrickBuilt.group); disposeGroup(derrickBuilt.group); derrickBuilt = null; }
    if (!field) { rover.visible = false; return; }

    // ore capacity: survey can only reveal what the field already holds
    oreCaps = new Map();
    let veinTotal = 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const tile = field[c][r];
        if (tile && tile.type === 'vein' && tile.ore) {
          oreCaps.set(tile.ore, (oreCaps.get(tile.ore) || 0) + 1);
          veinTotal++;
        }
      }
    }
    stainCellsCap = Math.max(1, veinTotal);
    stainMesh = new THREE.InstancedMesh(cellQuad, stainMat, stainCellsCap);
    stainMesh.frustumCulled = false;
    stainMesh.count = 0;
    stainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    oreRoot.add(stainMesh);

    buildRock();
    buildSurface();
    // seed ore / gas for the already-known parts of the field
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const tile = field[c][r];
        if (tile.type === 'gas') syncGasAt(c, r);
        else if (tile.type === 'vein') syncOreAt(c, r);
      }
    }
    rover.visible = true;
    pulseEntries = [
      ...roverBuilt.pulses,
      ...(derrickBuilt ? derrickBuilt.pulses : []),
    ];
  }

  // ---------------------------------------------------------------- frame
  function render(dt, timeS, ui) {
    const d = getDrill();
    if (!d || !field) return;
    timeSNow = timeS;
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

    // reveal-on-approach: crossing a cell boundary re-surveys what the rig's lamps touch
    if (d.avatar.col !== lastRevealCell.col || d.avatar.row !== lastRevealCell.row) {
      lastRevealCell = { col: d.avatar.col, row: d.avatar.row };
      refreshCells(neighborhood(d.avatar.col, d.avatar.row, 3));
    }

    // ---------------------------------------------------------------- rover
    const drawPos = avatarDrawPos(d.avatar, TILE);
    const rx = pxToWorldX(drawPos.x + TILE / 2);
    const ry = pxToWorldY(drawPos.y + TILE / 2);
    const moving = (d.avatar.moveDuration > 0 && d.avatar.moveElapsed < d.avatar.moveDuration);
    const drilling = !!d.avatar.isDrilling;
    let shakeLX = 0, shakeLY = 0;
    if (drilling) {
      drillTheta += 42 * (1 + (d.drillTemp || 0) / 120) * dt;
      if (!motionReduce) {
        const amp = (1.2 + (d.drillTemp || 0) / 80) * 0.6 * (S / TILE);
        shakeLX = Math.sin(timeS * 53) * amp;
        shakeLY = Math.cos(timeS * 71) * amp;
      }
    }
    rover.position.set(rx + shakeLX, ry + shakeLY, Z.rover);
    // body flips for left travel; the articulated arm aims at the dig face instead of
    // somersaulting the whole vehicle
    const faceDir = d.avatar.faceDir || 'down';
    const flipTarget = faceDir === 'left' ? Math.PI : 0;
    roverAnim.flipY += (flipTarget - roverAnim.flipY) * Math.min(1, 12 * dt);
    if (Math.abs(roverAnim.flipY - flipTarget) < 0.002) roverAnim.flipY = flipTarget;
    rover.rotation.set(0, roverAnim.flipY, 0);
    const aimTarget = faceDir === 'down' ? -Math.PI / 2 : (faceDir === 'up' ? Math.PI / 2 : 0);
    roverAnim.armAim += (aimTarget - roverAnim.armAim) * Math.min(1, 10 * dt);
    roverBuilt.dyn.arm.rotation.z = roverAnim.armAim;
    // the auger bites: fast attack, slow retract (asymmetric envelope)
    const biteTarget = drilling ? 1 : 0;
    const biteRate = biteTarget > roverAnim.bite ? 9 : 3.5;
    roverAnim.bite += (biteTarget - roverAnim.bite) * Math.min(1, biteRate * dt);
    roverBuilt.dyn.augerSlide.position.x = S * (0.3 + 0.3 * roverAnim.bite);
    roverBuilt.dyn.auger.rotation.y = drillTheta;
    // wheels, lean, bob
    const leanTarget = (moving && (faceDir === 'left' || faceDir === 'right')) ? -0.05 : 0;
    if (moving && !motionReduce) {
      roverAnim.wheelSpin -= (TILE / (d.avatar.moveDuration || 0.1)) * dt * 0.09;
      roverAnim.bob = Math.sin(timeS * 11) * S * 0.012;
    } else {
      roverAnim.bob *= Math.max(0, 1 - 6 * dt);
    }
    roverAnim.lean += (leanTarget - roverAnim.lean) * Math.min(1, 8 * dt);
    roverBuilt.dyn.body.position.y = -S * 0.06 + roverAnim.bob;
    roverBuilt.dyn.body.rotation.z = roverAnim.lean;
    for (const w of roverBuilt.dyn.wheels) w.rotation.z = roverAnim.wheelSpin;
    // beacon: idle pulse, brisk blink rolling, strobe under the bit
    const beaconBusy = drilling ? 9 : (moving ? 5 : 0);
    roverBuilt.dyn.beacon.emissiveIntensity = motionReduce
      ? (drilling || moving ? 1.2 : 0.5)
      : (beaconBusy ? (Math.sin(timeS * beaconBusy) > 0 ? 2.3 : 0.15) : 0.5);
    // headlight points where the work is (left/right ride the body flip)
    const ht = faceDir === 'down' ? [0, -S * 3.2] : (faceDir === 'up' ? [0, S * 3.2] : [S * 3.2, 0]);
    headTarget.position.set(ht[0], ht[1], S * 0.3);
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
    syncUmbilical(d, rx, ry, moving, dt);

    // dig progress: crack + sink the target block, dribble dust off the face
    syncDigTarget(d, dt);

    // gas pockets churn; fissures breathe with heat
    for (const [, g] of gasByCell) {
      if (!motionReduce) {
        g.vapor.rotation.z = g.phase + timeS * (g.hot ? 0.85 : 0.18);
        const br = 1 + Math.sin(timeS * (g.hot ? 3.4 : 0.8) + g.phase) * (g.hot ? 0.09 : 0.04);
        g.vapor.scale.setScalar(g.baseScale * br);
      }
      g.vapor.material.emissiveIntensity = g.hot ? 1.15 : 0.55;
    }
    if (!motionReduce) {
      gasCrackMat.color.copy(gasCrackBase).multiplyScalar(1 + 0.28 * Math.sin(timeS * 1.3));
      gasCrackHotMat.color.setHex(0xffe27a).multiplyScalar(1 + 0.4 * Math.sin(timeS * 7));
    }

    // ore wake pops (the survey's reward beat)
    for (let i = oreWakes.length - 1; i >= 0; i--) {
      const w = oreWakes[i];
      // the vein may have been drilled out mid-pop — never resurrect a killed instance
      if (!w.entry.bucket.cells.has(w.entry.idx)) { oreWakes.splice(i, 1); continue; }
      const t = motionReduce ? 1 : (timeS - w.t0) / 0.24;
      const k = t >= 1 ? 1 : (1 - Math.pow(1 - Math.max(0, t), 2));
      const overshoot = t < 1 && !motionReduce ? 1 + Math.sin(Math.min(1, t) * Math.PI) * 0.14 : 1;
      dummy.position.set(w.x, w.y, Z.ore);
      dummy.rotation.set(0, 0, w.rotZ);
      dummy.scale.setScalar(w.scale * (0.25 + 0.75 * k) * overshoot);
      dummy.updateMatrix();
      w.entry.bucket.mesh.setMatrixAt(w.entry.i, dummy.matrix);
      w.entry.bucket.mesh.instanceMatrix.needsUpdate = true;
      if (t >= 1) oreWakes.splice(i, 1);
    }

    for (const e of pulseEntries) {
      e.mat.emissiveIntensity = e.base + Math.sin(timeS * 1.6) * e.amp;
    }

    syncCursor(ui);
    syncScanRing(d, rx, ry);
    stepFx(dt);
    stepDom(d, dt);
    composer.render();
  }

  // ---------------------------------------------------------------- teardown
  function dispose() {
    for (const [, b] of oreBuckets) { oreRoot.remove(b.mesh); b.mesh.dispose(); }
    oreBuckets.clear();
    for (const [, badge] of badges) oreRoot.remove(badge);
    badges.clear();
    if (stainMesh) { oreRoot.remove(stainMesh); stainMesh.dispose(); stainMesh = null; }
    for (const [, g] of gasByCell) gasRoot.remove(g.group);
    gasByCell.clear();
    for (const id of [...machines.keys()]) removeMachine(id);
    if (ghost) { fxRoot.remove(ghost.group); disposeGroup(ghost.group); ghost = null; }
    if (umbilical) {
      scene.remove(umbilical.casing, umbilical.core);
      umbilical.casing.geometry.dispose();
      umbilical.core.geometry.dispose();
      umbilical = null;
    }
    rebuildOverlays(null);
    for (const bucket of ['matrix', 'basalt']) {
      for (const inst of rockInst[bucket]) inst.dispose();
      rockInst[bucket] = [];
    }
    cellRock.clear();
    if (plateauInst) { rockGroup.remove(plateauInst); plateauInst.dispose(); plateauInst = null; }
    if (derrickBuilt) { scene.remove(derrickBuilt.group); disposeGroup(derrickBuilt.group); derrickBuilt = null; }
    if (backWall) { backWall.geometry.dispose(); backWall.material.dispose(); backWall = null; }
    if (ro) ro.disconnect();
    for (const m of oreMats.values()) m.dispose();
    for (const m of badgeMats.values()) m.dispose();
    for (const t of badgeTextures.values()) t.dispose();
    laneCoreMat.dispose(); powerCoreMat.dispose(); casingMat.dispose();
    gasMat.dispose(); gasCrackMat.dispose(); gasCrackHotMat.dispose();
    stainMat.dispose();
    frameMat.dispose(); ringSolidMat.dispose(); ringEmptyMat.dispose(); padOkMat.dispose(); padBadMat.dispose();
    scanMat.dispose(); scanRing.geometry.dispose();
    crackDecalMat.dispose(); crackDecal.geometry.dispose();
    for (const t of crackTexs) t.dispose();
    for (const p of pulseRings) { p.mat.dispose(); p.mesh.geometry.dispose(); }
    umbCasingMat.dispose(); umbCoreMat.dispose();
    partGeo.dispose(); partMat.dispose(); chunkGeo.dispose(); chunkMat.dispose();
    for (const g of sharedGeos) {
      if (g === cellQuad || g === partGeo || g === chunkGeo) continue; // already disposed above
      g.dispose();
    }
    cellQuad.dispose(); // belt + suspenders: not in the sharedGeos loop above
    disposeGroup(rover);
    key.shadow.map && key.shadow.map.dispose();
    rim.shadow && rim.shadow.map && rim.shadow.map.dispose();
    scene.environment = null;
    envRT.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.setSize(0, 0, false);
    composer.setSize(0, 0);
    if (dom.root) dom.root.remove();
  }

  return { begin, render, notify, refreshCells, pickCell, dispose };
}
