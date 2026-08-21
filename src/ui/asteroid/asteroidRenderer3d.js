// Asteroid works 3D renderer — the drill playfield drawn in the game's own engine, rebuilt as a
// Motherload-style cutaway in real 3D. The legibility laws this pass enforces:
//   - PERFECT FLAT GRID (design law §2.1): zero yaw, zero pitch — cells project as axis-aligned
//     squares on a chess board. The camera pans and zooms between exactly two registers (work /
//     site); it never rotates or tilts. The front pad is a flat square face.
//   - ONE CELL = ONE BLOCK. Every solid cell is the same block, footprint-aligned to the sim
//     grid; joints read as masonry seams, never overlay lines. Variation lives inside the face
//     (relief, tint, bump), never across the cell boundary.
//   - CARVED = HONEST CAVITY. A dug cell opens a real recess: cavity floor plus the side walls of
//     the blocks around it. What you see is what the sim has.
//   - EVERY CELL SPEAKS, FROM THE FIRST FRAME (law §2.3 — fog of war deleted). Each material is a
//     host material + a surface + an inclusion SHAPE (law §3.5's three channels), so a stranger can
//     name ore / gas / plain rock / ice / exotic at work zoom without hovering anything.
//   - SEAMS ARE BODIES, NOT CELLS. Contiguous same-ore cells share one perimeter outline and one
//     count chip, and aiming at a seam cell previews the bodies the cut would leave behind.
//   - GAS IS DANGER, NOT LOOT. A pocket is the block itself cracked — a dark core sunk in the cut
//     face, fissures radiating out of it, a wisp drifting above. Never a crystal, never a halo.
//   - THE RIG IS A VEHICLE. Treads, beacon, cabin light, articulated auger arm that bites the wall,
//     on a lit umbilical spooling down from the surface derrick you entered through.
//   - THE BOARD IS A BODY, NOT A TILE WALL: an irregular silhouette skirt wraps the field so the
//     asteroid reads against space (law §4) at the edges of work zoom and across site zoom.
//
// Contract with the screen shell (asteroidScreen.js):
//   - read-only over game state: draws state.drill / the site record, never mutates either;
//   - the shell owns the rAF loop, DOM panels, bus subscriptions and input; it calls
//     render(dt, timeS, ui) every frame and forwards drill/site events through notify();
//   - pickCell(clientX, clientY) raycasts the cut plane so the flat camera stays pixel-honest;
//   - inputZoom(deltaY) snaps between the two zoom registers (wheel or key, law §4).
//
// The scene presents through the game's shared bloom/grade pipeline (src/render/bloom.js) — the
// same canonical ACES/exposure composite the flight world uses. No private EffectComposer.
//
// Determinism note: all layout variation derives from hash32(col,row) — the same rock always looks
// the same. Math.random only feathers cosmetic particle bursts, as the shipped 2D screen did.
import * as THREE from 'three';
import { hash32 } from '../../core/rng.js';
import { DRILL_CONST, tileIndex, avatarDrawPos, drillTierReqForOre } from '../../systems/drill.js';
import { connectivityMask } from '../../systems/siteLogistics.js';
import { spawnParticleBurst, stepParticles, drillGasShakeOffset } from '../screens/drill.js';
import { ORE_TINTS, STATUS_COLORS } from './asteroidRenderer2d.js';
import { createBloom } from '../../render/bloom.js';
import {
  preloadRockSurfaceLibrary, getReadyRockSurfaceTextures, ROCK_SURFACE_TEXTURE_REPEAT,
} from '../../render/rockSurfaceLibrary.js';
import {
  makeRockMaterials, makeMachine, makeRover, makeDerrick, metalMat,
  makeCellBlockGeos, makeOreClusterGeo, makeGasVaporGeo,
  makeMetalVeinGeo, makeIceSheenGeo, makeExoticLatticeGeo, makeRadialCrackGeos,
  makeGasCoreGeo, makeVentedScarGeo, makeBasaltBandGeo, makeMkStampGeo,
} from '../../render/asteroidInteriorPreview.js';

const { COLS, ROWS, SCAN_RADIUS, SCAN_ACTIVE_S } = DRILL_CONST;
export const VIEW_ROWS = 18;

const TILE = 40;              // px-space kept for parity with the shipped particle/shake helpers
const S = 2.2;                // world units per cell — the astlab-proven scale for these builders
const DEPTH = S * 1.5;        // block body depth; the cavity recess carved cells reveal
// Law §2.1 — the board is an axis-aligned chess board: zero yaw, zero pitch, no tilt ever.
const CAM_YAW = 0;
const CAM_PITCH = 0;
// Law §2.7 — straight-down PERSPECTIVE, narrow FOV. The optical axis is perpendicular to the cut
// plane, so the pad plane is parallel to the image plane and the grid stays a perfect chess board;
// what perspective buys is real depth on bevels, cavity walls, the rover and the machines.
const CAM_FOV = 31;
const HALF_FOV_TAN = Math.tan((CAM_FOV * Math.PI) / 180 / 2);
// Law §4 — two zoom registers, only two. Work: ~16 columns on the glass (96–128px cells at
// 1920×1080). Site: the whole asteroid silhouette with ≥16px cells. Register snaps are 180ms
// eased detents, not freeform zoom.
const WORK_COLS = 16;
const ZOOM_SNAP_S = 0.18;
// Soft leash (law §4): the rover stays within the middle 50% of the screen; the camera eases at
// ≤ 6 cells/s with a 120ms ease-out.
const CAM_EASE_T = 0.12;
const CAM_MAX_CELLS_S = 6;
// Irregular silhouette fringe around the field, in cells (law §4 — a body, not a wall-to-wall
// tile fill). The camera clamps to this body so work zoom never floats in pure void.
const SKIRT_CELLS = 4;

// Depth layering (camera looks down -z). The cut plane is the law: every solid block's front pad
// lands exactly at ROCK_FACE; carved cells recess to Z.back. Block pads protrude up to ~0.22
// proud of the plane (bevel relief), so face overlays sit at +0.24 and beyond.
const ROCK_FACE = DEPTH;
const Z = {
  back: -0.55,                // cavity floor
  overlay: 0.14,              // conduits hug the cavity floor
  rover: 0.62,                // the rig rides inside the tunnel
  stain: ROCK_FACE + 0.24,    // bore-damage decals sit on the cut face
  ore: ROCK_FACE + 0.27,      // crystal bases
  gas: ROCK_FACE + 0.42,      // seeping vapor, proud of the face
  particles: ROCK_FACE + 0.5,
  face: ROCK_FACE + 0.42,     // cursor / ring / pick plane — just proud of everything
  surface: ROCK_FACE * 0.45,  // derrick stands in the slice plane
};

const ENTRY_COL = Math.floor(COLS / 2);

// ---------------------------------------------------------------- material identity (law §3.5)
// PQ-130.04 "Cells speak". The sim's tile grammar is `dirt | rock | vein(ore) | gas | empty`; the
// design law's board palette is a SIX-MATERIAL vocabulary. This table is the mapping, and it is the
// single place presentation decides what a cell IS. Nothing downstream re-derives it.
//
// Families are assigned on the commodity's own character, never on its price:
//   metal  — the workable metal ladder (iron → platinum): rust-toned host, branching metallic vein,
//            angular chips. One inclusion shape for the whole ladder; the hue separates them.
//   ice    — raw diamond, the one cold, glassy, planar commodity in the ladder (law's "Ice" row).
//   exotic — stellarite, the deep gems and the prism shard: the law's "Deep exotic" — a violet host
//            under a strut lattice, visible from the first frame as aspiration you cannot yet cut.
//   matrix — silicate, which IS the matrix; its vein is a richer patch of the same warm stone.
const ORE_FAMILY = {
  cmdty_silicate: 'matrix',
  cmdty_ore_iron: 'metal',
  cmdty_ore_copper: 'metal',
  cmdty_ore_bronzium: 'metal',
  cmdty_ore_silverium: 'metal',
  cmdty_ore_goldium: 'metal',
  cmdty_ore_platinium: 'metal',
  cmdty_ore_einsteinium: 'exotic',
  cmdty_gem_emerald: 'exotic',
  cmdty_gem_ruby: 'exotic',
  cmdty_gem_diamond: 'ice',
  cmdty_exotic_amazonite: 'exotic',
};

// Seam count chips read `Fe 9` (law §3.5). Two glyphs, mono, no prose.
const ORE_SYMBOL = {
  cmdty_silicate: 'Si',
  cmdty_ore_iron: 'Fe',
  cmdty_ore_copper: 'Cu',
  cmdty_ore_bronzium: 'Ni',
  cmdty_ore_silverium: 'Ag',
  cmdty_ore_goldium: 'Au',
  cmdty_ore_platinium: 'Pt',
  cmdty_ore_einsteinium: 'St',
  cmdty_gem_emerald: 'Em',
  cmdty_gem_ruby: 'Ru',
  cmdty_gem_diamond: 'Di',
  cmdty_exotic_amazonite: 'Px',
};

// One host material per row of the law's table. Six instanced buckets instead of two: hue alone
// cannot carry ice's gloss or the exotic's wrongness — roughness, metalness and env intensity are
// material properties, and they live in makeRockMaterials.
const ROCK_BUCKETS = ['matrix', 'basalt', 'metal', 'ice', 'exotic', 'gas'];

// Mirrors the pad lift of each variant in makeCellBlockGeos (local units, scaled by DEPTH). The
// inclusion kit sits ON the pad it grows out of, so a high-relief block does not swallow its own
// vein — without this the same cluster reads proud on one cell and half-buried on the next.
const BLOCK_LIFTS = [0.030, 0.068, 0.104];
// ...and the matching centre bulge, which is what the pad's highest point actually sits at.
const BLOCK_BULGES = [0.022, 0.058, -0.016];
const padLocalTop = (v) => BLOCK_LIFTS[v] + Math.max(0, BLOCK_BULGES[v]);

function familyForOre(oreId) { return ORE_FAMILY[oreId] || 'metal'; }

// The one classifier. Returns null only for a cell that is not there.
function materialIdFor(tile) {
  if (!tile || tile.type === 'empty') return null;
  if (tile.type === 'rock') return 'basalt';
  if (tile.type === 'gas') return 'gas';
  if (tile.type === 'vein' && tile.ore) return familyForOre(tile.ore);
  return 'matrix';
}

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
.ast3d-overlay { position:absolute; inset:0; pointer-events:none; overflow:hidden; font-family:"Spline Sans Mono", ui-monospace, Consolas, monospace; }
.ast3d-floater { position:absolute; transform:translate(-50%,-50%); font-size:13px; font-weight:500; color:#ffb648; text-shadow:0 1px 3px rgba(0,0,0,.8); white-space:nowrap; }
.ast3d-flash-gas { position:absolute; inset:0; background:rgba(255,98,66,.4); opacity:0; }
.ast3d-flash-cargo { position:absolute; inset:0; opacity:0;
  background:linear-gradient(rgba(255,182,72,.34), rgba(255,182,72,0) 18%, rgba(255,182,72,0) 82%, rgba(255,182,72,.34)); }
`;
  document.head.appendChild(s);
}

// Tiny procedural "workshop" environment baked through PMREM so the metal machines have
// something believable to reflect (the vendored addons ship no RoomEnvironment).
// The panels mirror the light rig exactly — warm work-light below-left, cool starlight above, a
// dim cold floor. A cyan panel used to live here, so EVERY metal in the scene reflected a strip of
// neon teal that no code review would ever spot. Design law §2.7: no neon anywhere.
function bakeEnvMap(renderer) {
  const sc = new THREE.Scene();
  const dis = [];
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); dis.push(geo, mat); sc.add(m); return m; };
  add(new THREE.BoxGeometry(14, 14, 14), new THREE.MeshBasicMaterial({ color: 0x090810, side: THREE.BackSide }));
  // warm work-light bank, low and to the left (matches the raking key)
  add(new THREE.BoxGeometry(5, 0.2, 3), new THREE.MeshBasicMaterial({ color: 0xffd9b0 })).position.set(-3.4, -3.6, 1.5);
  // cool starlight wash from above (matches the rim)
  add(new THREE.BoxGeometry(8, 0.2, 5), new THREE.MeshBasicMaterial({ color: 0x8fa8d8 })).position.set(0, 5.4, -1);
  // dim cold bounce off the far rock
  add(new THREE.BoxGeometry(7, 0.2, 4), new THREE.MeshBasicMaterial({ color: 0x1c2130 })).position.set(0, -5, -2);
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

  // ---------------------------------------------------------------- renderer + shared bloom pipeline
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The shared composite owns tone mapping (its COLOR-MANAGEMENT INVARIANT); a renderer-level map
  // would only ever apply to a direct canvas draw, which this screen never makes.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x0b0a12, 1); // space behind the rock (law §3.5)

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0a12);

  const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 1, 2000);

  // The game's canonical bloom/grade composite — same ACES + exposure presentation as flight.
  // Exposure 1.25 preserves the brightness the scene was authored for under the retired composer.
  const bloom = createBloom(renderer, 1120, 640);
  bloom.setOptions({ exposure: 1.25 });

  const envRT = bakeEnvMap(renderer);
  const envMap = envRT.texture;
  scene.environment = envMap;

  // ---------------------------------------------------------------- lights
  // DEPTH IS SOLD BY LIGHT (law §2.7 / §3.5): a raking WARM key from slightly below-left that
  // casts real shadows into every cavity, a cool starlight RIM from above, and a deliberately
  // WEAK fill. The old rig ran key:fill ≈ 1.6:1 with the fill head-on down the camera axis — a
  // head-on fill erases exactly the relief the bevels exist to show, and was a real cause of the
  // flat cardboard read. Contract here is ≈ 5:1 on the pad, with every light raking so the ratio
  // is a ratio of *contributions*, not of raw intensities.
  const lightRig = new THREE.Group();
  scene.add(lightRig);
  // Key: work-light amber. Direction is set every frame in poseCamera().
  const key = new THREE.DirectionalLight(0xffdcbc, 9.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.08;
  const sc = key.shadow.camera;
  sc.left = -COLS * S * 0.62; sc.right = COLS * S * 0.62;
  sc.top = VIEW_ROWS * S * 0.85; sc.bottom = -VIEW_ROWS * S * 0.85;
  sc.near = 1; sc.far = 900;
  sc.updateProjectionMatrix();
  lightRig.add(key, key.target);
  // Rim: cold starlight spilling in from above the cut. Weak on purpose — a strong cool
  // directional from above lights the up-facing bevel of EVERY block head-on, and the board grows
  // a painted blue grid. The soft cool-from-above job belongs to the hemisphere below.
  const rim = new THREE.DirectionalLight(0x9db8f0, 1.2);
  lightRig.add(rim, rim.target);
  // Fill: weak and WARM. Inside a bore, the light that is not the work lamp is bounce off warm
  // rock, not starlight; a cool fill down here is what made every joint read as a blue line.
  const fill = new THREE.DirectionalLight(0xd8c3a8, 1.3);
  lightRig.add(fill, fill.target);
  // Hemisphere: the law's warm/cool split (§3.5) expressed as a SOFT GRADIENT over surface
  // orientation instead of a hard directional. Up-facing stone catches cold sky, down-facing stone
  // catches warm bounce off the bore floor, and nothing gets a hard painted edge out of it.
  scene.add(new THREE.HemisphereLight(0x8fa6cf, 0x7a5636, 1.1));

  // ---------------------------------------------------------------- space + body extents
  // Warm-white stars behind the rock (law §3.5): the only billboard-style exception in the game,
  // tiny and bright at sky depth. Deterministic LCG so the sky is stable across sessions.
  const STAR_Z = -320;
  const starGeo = new THREE.BufferGeometry();
  {
    // Under perspective the sky plane must cover the widest frustum any register can open: the
    // site register dollies back to ~223 units, so the star plane is ~543 units from the eye. Span
    // is solved from the FOV (with headroom for a 2.4 aspect ultrawide) rather than guessed from
    // cell counts, which is what the old 3.2×/2.4× multipliers did — they left bare black corners.
    const starDepth = Math.abs(STAR_Z) + 240;
    const spanY = starDepth * HALF_FOV_TAN * 2 * 1.15;
    const spanX = spanY * 2.4;
    const N = 2600;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    let seed = 0x5f3a71c4 >>> 0;
    const rr = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rr() - 0.5) * spanX;
      pos[i * 3 + 1] = (rr() - 0.5) * spanY;
      pos[i * 3 + 2] = STAR_Z + (rr() - 0.5) * 40;
      const b = 0.35 + rr() * 0.65;
      col[i * 3] = b;               // warm white: slight amber lean
      col[i * 3 + 1] = b * 0.97;
      col[i * 3 + 2] = b * 0.9;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const starMat = new THREE.PointsMaterial({
    size: 1.8, sizeAttenuation: false, vertexColors: true,
    transparent: true, opacity: 0.95, depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  // The asteroid body = field + silhouette skirt + surface headroom (derrick, plateau).
  function bodyExtents() {
    return {
      minX: -(COLS / 2 + SKIRT_CELLS) * S,
      maxX: (COLS / 2 + SKIRT_CELLS) * S,
      minY: worldY(ROWS - 1) - S / 2 - SKIRT_CELLS * S,
      maxY: worldY(-1) + S * 3.2,
    };
  }

  // ---------------------------------------------------------------- session containers
  const rockGroup = new THREE.Group();      // instanced blocks + plateau + backing wall
  const oreRoot = new THREE.Group();        // instanced material inclusions + the MK lock plate
  const gasRoot = new THREE.Group();        // per-cell gas pocket groups
  const siteRoot = new THREE.Group();       // machines
  const overlayRoot = new THREE.Group();    // merged conduit meshes
  const fxRoot = new THREE.Group();         // particles / rings / cursor / scan / crack decal
  scene.add(rockGroup, oreRoot, gasRoot, siteRoot, overlayRoot, fxRoot);

  let disposed = false;   // guards async surface arrival against a screen that already left

  // ---------------------------------------------------------------- rock surface (law §2.7)
  // THE CELL FACE IS THE FLIGHT GAME'S ROCK. Same three authored maps every asteroid outside
  // wears (src/render/rockSurfaceLibrary.js: basecolor + normal + packed ORM), same PBR wiring
  // visualFactory.astMaterial uses. The library is a process-wide singleton, already decoded by
  // the flight renderer by the time anyone can tether to a rock; calling preload again is a
  // no-op that just hands back the resolved set. This screen owns a second WebGL context, so the
  // maps upload once more here — but the *source* is shared, so there is no second decode.
  //
  // PER-CELL UV WINDOW: one InstancedMesh draws hundreds of cells from one geometry, so every
  // cell would otherwise show the identical crop and the field would read as wallpaper. The
  // vertex patch below hashes each instance's own translation into a texture offset, so every
  // block is a different piece of the same stone. No extra attributes, no geometry clones.
  // THE CUT FACE IS ONE BODY OF STONE, NOT A GRID OF CROPS.
  //
  // The obvious way to texture an instanced cell kit is to hand every block its own crop of the
  // map. That was tried and it is exactly wrong: a hundred unrelated rectangles of photographed
  // cliff, butted edge to edge, read as wallpaper cut into squares no matter how good the source
  // is. So the pad and its bevel take a CONTINUOUS WORLD-PLANAR projection — one unbroken rock
  // face that the grooves are cut into. The grid then comes from the geometry (the groove, its
  // shadow, the lift step), which is what a grid cut into rock actually looks like.
  //
  // Cavity walls are the exception: a plan projection smears on a near-vertical surface, so walls
  // keep their own local patch, hashed per cell. The sfFacet attribute authored by
  // makeCellBlockGeos (1 = cut face, 0 = wall/back) selects between them per vertex.
  // Cells spanned by one repeat of the map across the cut face, and the angle that repeat is
  // rotated by. THE ROTATION IS THE POINT: an axis-aligned repeat lands the same authored crack in
  // the same corner of every Nth cell, and the eye locks onto that instantly. Off-axis, the repeat
  // never lines up with a joint and the wall reads as one irregular body of rock.
  const ROCK_UV_CELLS = 4.3;
  const ROCK_UV_ANGLE = 0.54;    // ~31 degrees
  const ROCK_WALL_WINDOW = 0.34; // fraction of the map one cavity wall shows
  function patchRockUvWindow(mat) {
    const k = 1 / (ROCK_UV_CELLS * S);
    const rc = (Math.cos(ROCK_UV_ANGLE) * k).toFixed(6);
    const rs = (Math.sin(ROCK_UV_ANGLE) * k).toFixed(6);
    const wallWin = (ROCK_WALL_WINDOW / ROCK_SURFACE_TEXTURE_REPEAT).toFixed(6);
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float sfFacet;\nvarying float vSfNmScale;')
        .replace('#include <uv_vertex>', [
          '#include <uv_vertex>',
          '#ifdef USE_MAP',
          '  vec4 sfWorld = modelMatrix *',
          '  #ifdef USE_INSTANCING',
          '    instanceMatrix *',
          '  #endif',
          '    vec4( position, 1.0 );',
          '  vec2 sfPlanar = vec2( sfWorld.x * ' + rc + ' - sfWorld.y * ' + rs + ',',
          '                       sfWorld.x * ' + rs + ' + sfWorld.y * ' + rc + ' );',
          '  vec2 sfCellKey = vec2(0.0);',
          '  #ifdef USE_INSTANCING',
          '    sfCellKey = instanceMatrix[3].xy;',
          '  #endif',
          '  vec2 sfLocal = vMapUv * ' + wallWin + ' + vec2(',
          '    fract(sin(dot(sfCellKey, vec2(12.9898, 78.233))) * 43758.5453),',
          '    fract(sin(dot(sfCellKey, vec2(63.7264, 21.5391))) * 24634.6345));',
          '  float sfPlanarMix = step( 0.25, sfFacet );',
          '  vSfNmScale = 1.0 - 0.68 * ( sfPlanarMix * ( 1.0 - step( 0.75, sfFacet ) ) );',
          '  vec2 sfWin = mix( sfLocal, sfPlanar, sfPlanarMix );',
          '  vMapUv = sfWin;',
          '  #ifdef USE_NORMALMAP',
          '    vNormalMapUv = sfWin;',
          '  #endif',
          '  #ifdef USE_AOMAP',
          '    vAoMapUv = sfWin;',
          '  #endif',
          '  #ifdef USE_ROUGHNESSMAP',
          '    vRoughnessMapUv = sfWin;',
          '  #endif',
          '  #ifdef USE_METALNESSMAP',
          '    vMetalnessMapUv = sfWin;',
          '  #endif',
          '#endif',
        ].join('\n'));
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSfNmScale;')
        .replace('#include <normal_fragment_maps>', [
          'vec3 sfGeoNormal = normal;',
          '#include <normal_fragment_maps>',
          'normal = normalize( mix( sfGeoNormal, normal, vSfNmScale ) );',
        ].join('\n'));
    };
    // Distinct cache key: the patched program must not be shared with an unpatched standard
    // material that happens to carry the same defines.
    mat.customProgramCacheKey = () => `sf-ast-rock-uv:${ROCK_UV_CELLS}:${ROCK_WALL_WINDOW}`;
    return mat;
  }

  let rockMats = makeRockMaterials(envMap, getReadyRockSurfaceTextures());
  const rockSurfaceReady = !!getReadyRockSurfaceTextures();
  if (rockSurfaceReady) { for (const b of ROCK_BUCKETS) patchRockUvWindow(rockMats[b]); }
  else {
    // Cold host (a direct deep-link into the works screen, or a test harness that never booted the
    // flight renderer): decode now and swap the maps in on arrival. The board is never blank —
    // it renders on the procedural fallback for a frame or two and then becomes real stone.
    preloadRockSurfaceLibrary(renderer).then((surface) => {
      if (!surface || disposed) return;
      const next = makeRockMaterials(envMap, surface);
      for (const b of ROCK_BUCKETS) patchRockUvWindow(next[b]);
      const old = rockMats;
      rockMats = next;
      for (const bucket of ROCK_BUCKETS) {
        for (const inst of rockInst[bucket]) inst.material = next[bucket];
      }
      if (plateauInst) plateauInst.material = next.matrix;
      if (skirtInst) skirtInst.material = next.matrix;
      for (const b of ROCK_BUCKETS) old[b].dispose();
    }).catch(() => { /* procedural fallback already on screen */ });
  }

  // Shared cell-kit geometry (never disposed per cell — see sharedGeos)
  const blockGeos = makeCellBlockGeos();
  const clusterGeos = [makeOreClusterGeo(0), makeOreClusterGeo(1)];
  const gasVaporGeo = makeGasVaporGeo();
  const cellQuad = new THREE.PlaneGeometry(S, S);

  // PQ-130.04 INCLUSION KIT — the third identity channel (law §3.5). One shape family per material
  // row, two variants each so a seam is not a row of identical stamps. A stranger has to be able to
  // name ore / gas / plain rock / ice / exotic with no hover, so the shapes are chosen to differ in
  // SILHOUETTE, not only in hue: angular chips on a forked ridge (metal), intersecting flat plates
  // (ice), a regular strut cage (exotic), a knob-and-shard cluster (silicate).
  const inclusionGeos = {
    matrix: clusterGeos,
    metal: [makeMetalVeinGeo(0), makeMetalVeinGeo(1)],
    ice: [makeIceSheenGeo(0), makeIceSheenGeo(1)],
    exotic: [makeExoticLatticeGeo(0), makeExoticLatticeGeo(1)],
  };
  // Basalt's ledges ride the rock material, which is vertexColors + sfFacet driven: give the band
  // geometry both attributes so it takes the SAME continuous world-planar stone as the pad. Without
  // sfFacet the shader falls to the cavity-wall unwrap; without a colour attribute it renders black.
  const bandGeos = [0, 1, 2].map((v) => {
    const geo = makeBasaltBandGeo(v);
    const n = geo.getAttribute('position').count;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(0.9), 3));
    geo.setAttribute('sfFacet', new THREE.Float32BufferAttribute(new Float32Array(n).fill(1), 1));
    return geo;
  });
  const seamChipGeo = new THREE.PlaneGeometry(1, 1);   // count chips are MESHES, see makeChip()
  const gasCrackGeos = makeRadialCrackGeos();
  const gasCoreGeo = makeGasCoreGeo();
  const ventedScarGeo = makeVentedScarGeo();
  const mkStampGeo = makeMkStampGeo();

  // GAS POCKET (law §3.5 "a cracked, breathing cell — danger, never treasure"). Three parts, and
  // not one of them glows at rest: the host block is its own dead-olive material, a DARK CORE is
  // pressed into the cut face, RADIAL hairline fissures run out of it, and a thin wisp drifts above.
  // The old build read as loot — an emissive lime mass under two MeshBasic amber streaks, i.e. a
  // flat unlit colour fill (playfield §3) wearing a glow (law §2.7). Emissive here is now reserved
  // for the breach itself, which is an event with a real flare, not a resting state.
  const gasMat = new THREE.MeshStandardMaterial({
    color: 0x5c6430, emissive: 0x000000, emissiveIntensity: 0,
    roughness: 0.96, metalness: 0.0, flatShading: true,
    transparent: true, opacity: 0.26, depthWrite: false,
  });
  const gasVaporHotMat = new THREE.MeshStandardMaterial({
    color: 0x9aa845, emissive: 0x6e7a12, emissiveIntensity: 1.1,
    roughness: 0.85, metalness: 0.0, flatShading: true,
    transparent: true, opacity: 0.72, depthWrite: false,
  });
  const gasCoreMat = new THREE.MeshStandardMaterial({
    color: 0x2b2d1f, roughness: 1, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.05,
  });
  const gasCrackMat = new THREE.MeshStandardMaterial({
    color: 0x9caa4a, roughness: 0.88, metalness: 0.04, envMap, envMapIntensity: 0.16, flatShading: true,
  });
  const gasCrackHotMat = new THREE.MeshStandardMaterial({
    color: 0xf4ffa8, emissive: 0x8a7a10, emissiveIntensity: 0.95, roughness: 0.5, metalness: 0.06, flatShading: true,
  });
  // VENTED POCKET (law §3.5): permanently dead gray-green, and the only thing on the board with no
  // reason to catch the eye.
  const ventedMat = new THREE.MeshStandardMaterial({
    color: 0x4a463f, roughness: 0.97, metalness: 0.03, envMap, envMapIntensity: 0.18, flatShading: true,
  });

  // ore — cached materials per (oreId, locked); inclusions instanced per bucket.
  //
  // SURFACE IS THE SECOND IDENTITY CHANNEL (law §3.5), so it is a property of the FAMILY, not a
  // constant: metal is a polished conductor, ice is a near-mirror dielectric, the exotic lattice is
  // a semi-metal, silicate is dull mineral. Read the four rows side by side and they are four
  // different substances even before the hue lands.
  //
  // NO RESTING EMISSIVE (law §2.7). Six of the twelve ore rows used to self-emit at 0.85 — the
  // deep/exotic ones — which is exactly the neon-pickup read the owner rejected, and the first thing
  // bloom finds. Colour now comes from albedo + the raking key + roughness, like every other object
  // in the flight world.
  const ORE_SURFACE = {
    metal: { roughness: 0.40, metalness: 0.58, envMapIntensity: 1.35 },
    ice: { roughness: 0.13, metalness: 0.0, envMapIntensity: 1.45, transparent: true, opacity: 0.8 },
    exotic: { roughness: 0.22, metalness: 0.5, envMapIntensity: 1.3 },
    matrix: { roughness: 0.86, metalness: 0.06, envMapIntensity: 0.3 },
  };
  const oreMats = new Map();
  function oreMaterial(oreId, locked) {
    const key2 = `${oreId}:${locked ? 1 : 0}`;
    let m = oreMats.get(key2);
    if (m) return m;
    const tint = ORE_TINTS[oreId] || ORE_TINTS.cmdty_silicate;
    const fam = familyForOre(oreId);
    const col = new THREE.Color(tint.vein);
    // Pull every family back off its glint. The glint is where the SPECULAR should land, not the
    // albedo — leaning the base colour into it is how a mineral turns into a paper cut-out.
    if (tint.glint) col.lerp(new THREE.Color(tint.glint), fam === 'ice' ? 0.1 : (fam === 'matrix' ? 0.1 : 0.15));
    const surf = ORE_SURFACE[fam] || ORE_SURFACE.matrix;
    m = new THREE.MeshStandardMaterial({
      color: col, flatShading: true, envMap,
      emissive: 0x000000, emissiveIntensity: 0,
      ...surf,
    });
    // A LOCKED VEIN IS DULL, NOT DARK (law §5 / §3.5): the same mineral, oxidised over — it keeps
    // its hue so you can still tell what you are looking at and want it, and loses the polish that
    // says "cut me". Value is legible; permission is not yet granted.
    if (locked) {
      m.color.multiplyScalar(0.62);
      m.roughness = Math.min(1, m.roughness + 0.42);
      m.metalness *= 0.5;
      m.envMapIntensity *= 0.35;
      if (m.transparent) m.opacity = Math.min(1, m.opacity + 0.14);
    }
    oreMats.set(key2, m);
    return m;
  }
  // THE MK LOCK STAMP (law §5, playfield §5.5). The old build hung a THREE.Sprite over every locked
  // vein — a camera-facing billboard carrying an 8px "MK2", which is the exact stand-in playfield
  // §5.5 names and §5.6 bans. It is now ONE engraved plate: a chamfered lit mesh whose albedo map
  // paints a bezel and a recessed pane, seated on the cell face and fading in over 600ms while the
  // rig is aimed at it — which is also what law §5's "Locked material" row actually asks for.
  const stampTextures = new Map();
  const stampMats = new Map();
  function stampTexture(tier) {
    let t = stampTextures.get(tier);
    if (t) return t;
    const W = 272, H = 160;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const rr = (x, y, w, h, r) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    g.fillStyle = '#6d6355'; g.fillRect(0, 0, W, H);          // bezel — the chamfer samples this
    g.fillStyle = '#7d7263'; rr(10, 8, W - 20, H - 16, 12); g.fill();
    g.fillStyle = '#3b332a'; rr(30, 26, W - 60, H - 52, 9); g.fill();   // recessed pane
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 62px "Spline Sans Mono", ui-monospace, Consolas, monospace';
    g.fillStyle = 'rgba(255,244,222,0.20)';                    // chisel highlight on the lower edge
    g.fillText(`MK${tier}`, W / 2, H / 2 + 4);
    g.fillStyle = '#221c15';                                   // the cut itself
    g.fillText(`MK${tier}`, W / 2, H / 2);
    t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    stampTextures.set(tier, t);
    return t;
  }
  function stampMaterial(tier) {
    let m = stampMats.get(tier);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        map: stampTexture(tier), roughness: 0.44, metalness: 0.72, envMap, envMapIntensity: 0.8,
        transparent: true, opacity: 0,
      });
      m.dispose = () => {}; // cache-owned: disposeGroup must not release the shared program
      stampMats.set(tier, m);
    }
    return m;
  }

  // Conduit materials (law §7). These are PHYSICAL RUNS bolted along the tunnel floor, not neon
  // dashes: a dark armoured casing carrying either a gold power cable or a pale steel material
  // lane. Each keeps a small emissive floor so a live run is still legible in an unlit tunnel —
  // the renderer breathes it with flow/charge — but the colour is in the JACKET, and the metal
  // reads under the key light first.
  const laneCoreMat = new THREE.MeshStandardMaterial({
    color: 0x7d97ab, emissive: 0x5cc8f2, emissiveIntensity: 0.14,
    roughness: 0.38, metalness: 0.8, envMap,
  });
  const powerCoreMat = new THREE.MeshStandardMaterial({
    color: 0xb8863a, emissive: 0xffb648, emissiveIntensity: 0.18,
    roughness: 0.34, metalness: 0.85, envMap,
  });
  const casingMat = metalMat(0x1c1814, envMap);
  casingMat.roughness = 0.66;

  // cursor / ghost / ring shared bits
  // Aim/build affordances. These are the only drawn overlays left on the board, and they wear the
  // chrome palette (§3.2 gold / mint / coral) — never the old console cyan.
  const frameMat = new THREE.MeshBasicMaterial({ color: 0xffb648, transparent: true, opacity: 0.8, depthTest: false });
  const ringSolidMat = new THREE.MeshBasicMaterial({ color: 0x7cd9a2, transparent: true, opacity: 0.15, depthTest: false });
  const ringEmptyMat = new THREE.MeshBasicMaterial({ color: 0x8a7a66, transparent: true, opacity: 0.07, depthTest: false });
  const padOkMat = new THREE.MeshBasicMaterial({ color: 0x7cd9a2, transparent: true, opacity: 0.12, depthTest: false });
  const padBadMat = new THREE.MeshBasicMaterial({ color: 0xff6242, transparent: true, opacity: 0.15, depthTest: false });
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
  const scanMat = new THREE.MeshBasicMaterial({ color: 0xffb648, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false });
  const scanRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), scanMat);
  scanRing.visible = false;
  scanRing.renderOrder = 27;
  fxRoot.add(scanRing);

  // event pulse rings (install / break) — small pool, life-driven
  const pulseRings = [];
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x7cd9a2, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false });
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

  // DAMAGE PERSISTS. A half-bored cell used to spring back to pristine the instant the bit left
  // it, which made every abandoned bore a lie about the sim. Damage now lives on the cell: the
  // block stays sunk in its socket, and it keeps whichever of the three authored crack stages its
  // remaining hp earns. One InstancedMesh per stage, because an instanced draw cannot switch
  // texture per instance.
  const CRACK_CAP = 96;
  const damagedCells = new Map();   // idx -> { c, r, stage }
  let crackDirty = false;
  const crackStageMeshes = crackTexs.map((tex) => {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(S, S), mat, CRACK_CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.renderOrder = 24;
    mesh.frustumCulled = false;
    fxRoot.add(mesh);
    return mesh;
  });
  function boreStageFor(tile) {
    if (!tile || tile.type === 'empty' || !tile.maxHp) return -1;
    const prog = 1 - Math.max(0, tile.hp) / tile.maxHp;
    if (prog <= 0.04) return -1;
    return { prog, stage: Math.min(2, Math.floor(prog * 3)) };
  }
  // Re-read a cell's hp and park its block + crack stage where the sim says they belong.
  function syncCellDamage(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    const idx = tileIndex(c, r);
    const tile = field && field[c] && field[c][r];
    const rec = cellRock.get(idx);
    const info = boreStageFor(tile);
    if (info === -1 || !rec || rec.carved) {
      if (damagedCells.delete(idx)) crackDirty = true;
      if (rec && !rec.carved) {
        setRockMatrix(c, r, false);
        rec.mesh.setMatrixAt(rec.i, dummy.matrix);
        rec.mesh.instanceMatrix.needsUpdate = true;
      }
      return;
    }
    setRockMatrix(c, r, false, info.prog);
    rec.mesh.setMatrixAt(rec.i, dummy.matrix);
    rec.mesh.instanceMatrix.needsUpdate = true;
    const prev = damagedCells.get(idx);
    if (!prev || prev.stage !== info.stage) {
      damagedCells.set(idx, { c, r, stage: info.stage });
      crackDirty = true;
    }
  }
  function rebuildCrackInstances() {
    crackDirty = false;
    const counts = [0, 0, 0];
    for (const [idx, dmg] of damagedCells) {
      const m = crackStageMeshes[dmg.stage];
      if (counts[dmg.stage] >= CRACK_CAP) continue;
      // The live target owns the animated single decal; skip it here so they do not double up.
      if (digCell && digCell.idx === idx) continue;
      dummy.position.set(worldX(dmg.c), worldY(dmg.r), Z.stain + 0.01);
      dummy.rotation.set(0, 0, (hash32(dmg.c, dmg.r, 'ckr') % 4) * (Math.PI / 2));
      dummy.scale.setScalar(0.72 + dmg.stage * 0.12);
      dummy.updateMatrix();
      m.setMatrixAt(counts[dmg.stage]++, dummy.matrix);
    }
    for (let i = 0; i < 3; i++) {
      crackStageMeshes[i].count = counts[i];
      crackStageMeshes[i].instanceMatrix.needsUpdate = true;
    }
  }

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
  const HOT_BIT = new THREE.Color(0xff6242);   // law §4 — the bit's hot end

  // MACHINE WORK LIGHTS — a FIXED pool (law §2.7: "emissive only as small plausible lamps with a
  // real light"). The count never changes, because THREE bakes the light count into every shader
  // program: adding or removing one light per machine placement would recompile every material in
  // the scene and hitch the frame. Instead three lights exist for the life of the screen, are
  // re-aimed at whichever machines most deserve them, and drop to intensity 0 when unused. None of
  // them casts a shadow — only the key and the rover headlamp do.
  const MACHINE_LIGHT_POOL = 3;
  const machineLights = [];
  for (let i = 0; i < MACHINE_LIGHT_POOL; i++) {
    const l = new THREE.PointLight(0xffb069, 0, S * 4.2, 2);
    l.castShadow = false;
    l.position.set(0, 0, -900);   // parked off the board until claimed
    scene.add(l);
    machineLights.push(l);
  }

  // surface derrick (the umbilical winch) — built per session over the entry shaft
  let derrickBuilt = null;
  let derrickBaseY = 0;

  // umbilical
  let umbilical = null;      // { casing, core }
  let umbilicalKey = '';
  let umbilicalTimer = 0;
  const umbCasingMat = metalMat(0x1b1815, envMap);
  umbCasingMat.roughness = 0.58;
  // The tether's power core: a gold conductor inside the jacket, not a neon light-rope.
  const umbCoreMat = new THREE.MeshStandardMaterial({
    color: 0xb8863a, emissive: 0xffb648, emissiveIntensity: 0.3,
    roughness: 0.34, metalness: 0.88, envMap,
  });

  // ---------------------------------------------------------------- per-session state
  let motionReduce = false;
  let field = null;
  let timeSNow = 0;
  const cellRock = new Map();   // idx -> { mesh, i, carved, c, r }
  let rockInst = Object.fromEntries(ROCK_BUCKETS.map((b) => [b, []])); // one InstancedMesh per (bucket, variant)
  let bandInsts = [];           // basalt's banded relief — one instanced ledge pair per basalt cell
  let plateauInst = null;
  let skirtInst = null;         // irregular silhouette fringe around the field (law §4)
  let backWall = null;
  let oreBuckets = new Map();   // `${ore}:${locked}` -> { key, mesh, cap, n, cells: Map<idx, i> }
  let oreCaps = new Map();      // oreId -> vein count in the field (survey can only reveal, never add)
  let oreCellIndex = new Map(); // idx -> { bucket, i, idx }
  const oreWakes = [];          // reveal pop-in animations
  // Seam bodies (law §3.5 "seams render as bodies"): 4-connected components of same-ore vein cells,
  // recomputed from the tile grid whenever the field changes. The sim has no component registry —
  // asteroidFormations tracks discovery records for whole bodies in the sector, not cell adjacency
  // inside one rock — so the renderer owns this and pays a single flood fill per field edit.
  let seamBodies = [];          // [{ id, ore, key, cells:[idx], cx, cy, count }]
  let seamOfCell = new Map();   // idx -> body
  let seamsDirty = true;
  let seamOutline = null;       // LineSegments — every body's perimeter, material detail colour
  let splitOutline = null;      // LineSegments — the split preview's sub-body perimeters
  let splitSig = '';            // aim signature; the preview only rebuilds when the aim moves
  let splitBodies = [];         // [{ count, ore, cx, cy }] — resulting bodies while aiming
  const chipPool = [];          // reused count-chip meshes (mesh, not DOM: the word budget is 15)
  const chipTextures = new Map();
  let chipFontReady = false;
  const ventedScars = new Map();// idx -> Mesh (a blown pocket leaves a scar on the cavity floor)
  let mkStamp = null;           // the single engraved lock plate; it follows the aim (law §5)
  let mkStampT = 0;             // 0..1 fade, 600ms per law §5
  let mkStampCell = -1;
  const gasByCell = new Map();  // idx -> { group, vapor, cracks, phase, baseScale, hot }
  const machines = new Map();   // machineId -> { group, defId, dyn, col, row, geoSig, arms, pulses }
  let ghost = null;             // { defId, group }
  let overlaySig = '';
  let drillTheta = 0;
  let digCell = null;           // { c, r, idx } — block currently taking the bit
  let digGasHot = null;         // gas entry currently screaming under the bit
  let dustTimer = 0;
  let lastRevealCell = { col: -1, row: -1 };
  const gasShake = { t: 0, elapsed: 0 };
  const timers = { gasFlash: 0, cargoFlash: 0 };
  let pulseEntries = [];        // [{mat, base, amp}] — rover + derrick

  // shared geometry that must survive per-cell group disposal
  const sharedGeos = new Set([...blockGeos, ...clusterGeos, gasVaporGeo, cellQuad, partGeo, chunkGeo,
    ...inclusionGeos.metal, ...inclusionGeos.ice, ...inclusionGeos.exotic, ...bandGeos,
    ...gasCrackGeos, gasCoreGeo, ventedScarGeo, mkStampGeo, seamChipGeo]);

  // DOM overlay — spatial annotations only (floaters / alarm washes); rig vitals are crest +
  // rig-cluster instruments (design law §6 — the scene stays sovereign).
  const dom = { root: null, floaters: [], flashGas: null, flashCargo: null };
  function buildDomOverlay() {
    if (dom.root) return;
    const root = document.createElement('div');
    root.className = 'ast3d-overlay';
    root.setAttribute('aria-hidden', 'true');
    dom.flashGas = document.createElement('div');
    dom.flashGas.className = 'ast3d-flash-gas';
    dom.flashCargo = document.createElement('div');
    dom.flashCargo.className = 'ast3d-flash-cargo';
    root.append(dom.flashGas, dom.flashCargo);
    // The stage (canvas' full-bleed parent) so the overlay hugs the canvas box exactly.
    (canvas.parentElement || wrapEl).appendChild(root);
    dom.root = root;
  }

  // ---------------------------------------------------------------- sizing + zoom registers
  // The board is sovereign: the canvas fills the stage box and the ortho box is derived from the
  // live aspect, so cells stay square at every window size. Two registers, only two (law §4):
  // work (WORK_COLS columns across) and site (the whole body), snapped with a 180ms ease.
  let zoomRegister = 'work';   // 'work' | 'site'
  let zoomKCur = 1;            // 1 = work; <1 zoomed out toward site
  let zoomAnim = null;         // { from, to, t }

  function canvasAspect() {
    const w = canvas.clientWidth || wrapEl.clientWidth || 1;
    const h = canvas.clientHeight || wrapEl.clientHeight || 1;
    return Math.max(0.2, w / h);
  }
  function workHalfW() { return (WORK_COLS / 2) * S; }
  function siteZoomK() {
    const b = bodyExtents();
    const aspect = canvasAspect();
    const needHalfW = Math.max((b.maxX - b.minX) / 2, ((b.maxY - b.minY) / 2) * aspect) * 1.05;
    return Math.min(1, workHalfW() / needHalfW);
  }
  function viewHalfExtents() {
    const halfW = workHalfW() / zoomKCur;
    return { halfW, halfH: halfW / canvasAspect() };
  }
  // The zoom registers are still expressed as half-extents on the cut plane — that is the contract
  // the leash, the body clamp, siteZoomK and the 180ms detent are all written against. Perspective
  // only changes how a half-extent becomes a camera: instead of an ortho box we solve the DISTANCE
  // at which the fixed FOV subtends exactly that height on the pad plane. Everything downstream is
  // untouched, and the detent now eases a dolly instead of a box.
  function camDistanceFor(halfH) { return halfH / HALF_FOV_TAN + ROCK_FACE; }
  function applyView() {
    const { halfW, halfH } = viewHalfExtents();
    camera.fov = CAM_FOV;
    camera.aspect = canvasAspect();
    // Near/far hug the slab so depth precision stays on the rock, not on empty space.
    camera.near = Math.max(0.5, camDistanceFor(halfH) - ROCK_FACE - S * 6);
    camera.far = camDistanceFor(halfH) + Math.abs(STAR_Z) + 200;
    camera.updateProjectionMatrix();
    // Shadow texel density follows the visible window, not the whole field. The shadow camera
    // stays ORTHOGRAPHIC — a directional key has no eye point, and a perspective shadow map here
    // would only add swim.
    sc.left = -halfW * 1.8; sc.right = halfW * 1.8;
    sc.top = halfH * 1.8; sc.bottom = -halfH * 1.8;
    sc.updateProjectionMatrix();
  }
  function setZoomRegister(reg) {
    if (zoomRegister === reg && !zoomAnim) return;
    zoomRegister = reg;
    const to = reg === 'site' ? siteZoomK() : 1;
    if (motionReduce || ZOOM_SNAP_S <= 0) {
      zoomAnim = null;
      zoomKCur = to;
      applyView();
      return;
    }
    zoomAnim = { from: zoomKCur, to, t: 0 };
  }
  function inputZoom(deltaY) {
    setZoomRegister(deltaY > 0 ? 'site' : 'work');
  }
  // Z key (law §4): a detent toggle between the two registers, never a third position.
  function toggleZoomRegister() {
    setZoomRegister(zoomRegister === 'site' ? 'work' : 'site');
  }
  function stepZoom(dt) {
    if (!zoomAnim) return;
    zoomAnim.t += dt;
    const raw = Math.min(1, zoomAnim.t / ZOOM_SNAP_S);
    const eased = 1 - Math.pow(1 - raw, 3); // ease-out cubic over the 180ms detent
    zoomKCur = zoomAnim.from + (zoomAnim.to - zoomAnim.from) * eased;
    if (raw >= 1) {
      zoomKCur = zoomAnim.to;
      zoomAnim = null;
    }
    applyView();
  }

  // wrapEl is the sovereign stage: the canvas fills it and the projection follows the aspect.
  function resize() {
    const w = Math.max(64, wrapEl.clientWidth | 0);
    const h = Math.max(48, wrapEl.clientHeight | 0);
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    bloom.setSize(Math.round(w * dpr), Math.round(h * dpr));
    applyView();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  if (ro) ro.observe(wrapEl);

  // ---------------------------------------------------------------- rock
  // One cell = one block, footprint-aligned, front pad flush with the cut plane. The grid reads
  // through the bevel joints; tint + bump + three relief variants carry the stone. Never jitter
  // position/rotation/scale across the boundary — the sim grid and the picture are the same thing.
  const dummy = new THREE.Object3D();
  const colScratch = new THREE.Color();

  const bucketFor = materialIdFor;

  // Per-instance tint. Three rules, all of them corrections of a measured defect:
  //   1. NO SURVEY BRANCH. Law §2.3 removed fog of war; the old code tinted essentially the whole
  //      field 27% blue-over-red until it was surveyed, which is a fog layer wearing a hat.
  //      Survey state must not touch a cell's colour at all.
  //   2. WARM BORE / COOL SPACE. The old gradient ran warm at the surface and cool at depth —
  //      backwards. The surface is what faces cold starlight; the deep bore is where the work
  //      lights live, so depth warms.
  //   3. ±5% VARIANCE, not ±20%. Twenty percent per cell reads as a patchwork quilt and fights
  //      the texture, which is where the real variation now comes from.
  //   4. STRATA, NOT SALT AND PEPPER. Rock is laid down in beds. Per-cell random value makes a
  //      noisy quilt; what reads as geology is LOW-FREQUENCY banding on a slightly tilted axis,
  //      with broad patches over it and only a whisper of per-cell grain. Two sinusoids at
  //      different periods give wide beds with the occasional thin seam between them.
  function rockInstanceColor(c, r, _bucket, out) {
    const depthT = r / ROWS;
    const bed = r + c * 0.22;                                          // beds dip slightly
    const strata = Math.sin(bed * 0.42) * 0.055 + Math.sin(bed * 1.17 + 1.9) * 0.028;
    const patch = (rnd01(Math.floor(c / 5), Math.floor(r / 4), 'pt') - 0.5) * 0.06;
    const grain = (rnd01(c + 13, r + 5, 'rt') - 0.5) * 0.07;
    const tint = Math.max(0.05, 1 + strata + patch + grain - depthT * 0.10);
    const warm = (rnd01(c + 6, r + 8, 'rw') - 0.5) * 0.04 + depthT * 0.08 - 0.03 + strata * 0.5;
    out.setRGB(Math.max(0, tint + warm), tint, Math.max(0, tint - warm * 1.2));
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
    for (const bucket of ROCK_BUCKETS) {
      for (const inst of rockInst[bucket]) {
        rockGroup.remove(inst);
        inst.dispose();
      }
      rockInst[bucket] = [];
    }
    for (const bi of bandInsts) { rockGroup.remove(bi); bi.dispose(); }
    bandInsts = [];
    cellRock.clear();
    // Bucket by material AND block variant — one InstancedMesh per (bucket, variant).
    const lists = {};
    for (const b of ROCK_BUCKETS) lists[b] = blockGeos.map(() => []);
    const basaltCells = [];
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const bucket = bucketFor(field[c][r]);
        if (!bucket) continue;
        const v = hash32(c, r, 'ckv') % blockGeos.length;
        lists[bucket][v].push({ c, r });
        if (bucket === 'basalt') basaltCells.push({ c, r, v });
      }
    }
    for (const bucket of ROCK_BUCKETS) {
      for (let v = 0; v < blockGeos.length; v++) {
        const list = lists[bucket][v];
        const inst = new THREE.InstancedMesh(blockGeos[v], rockMats[bucket], Math.max(1, list.length));
        inst.castShadow = true;
        inst.receiveShadow = true;
        inst.frustumCulled = false;
        list.forEach((cell, i) => {
          setRockMatrix(cell.c, cell.r, false);
          inst.setMatrixAt(i, dummy.matrix);
          inst.setColorAt(i, rockInstanceColor(cell.c, cell.r, bucket, colScratch));
          cellRock.set(tileIndex(cell.c, cell.r), { mesh: inst, i, carved: false, c: cell.c, r: cell.r });
        });
        inst.count = list.length;
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        rockGroup.add(inst);
        rockInst[bucket].push(inst);
      }
    }
    // BASALT IS BANDED (law §3.5). The ledges ride the SAME rock material as the pad they sit on —
    // same continuous world-planar projection, same authored stone — so a band is a step in the
    // surface that the raking key shadows, never a stripe painted across the cell.
    for (let v = 0; v < bandGeos.length; v++) {
      const list = basaltCells.filter((cell) => cell.v === v);
      if (!list.length) continue;
      const bi = new THREE.InstancedMesh(bandGeos[v], rockMats.basalt, list.length);
      bi.castShadow = true;
      bi.receiveShadow = true;
      bi.frustumCulled = false;
      list.forEach((cell, i) => {
        dummy.position.set(worldX(cell.c), worldY(cell.r), ROCK_FACE + padLocalTop(cell.v) * DEPTH);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(S, S, S);
        dummy.updateMatrix();
        bi.setMatrixAt(i, dummy.matrix);
        bi.setColorAt(i, rockInstanceColor(cell.c, cell.r, 'basalt', colScratch).multiplyScalar(0.93));
      });
      bi.instanceMatrix.needsUpdate = true;
      if (bi.instanceColor) bi.instanceColor.needsUpdate = true;
      rockGroup.add(bi);
      bandInsts.push(bi);
    }
    if (!backWall) {
      // THE TUNNEL FLOOR IS STONE. It used to be a flat cold slab (0x0a0c12), which is what made a
      // carved cell read as a hole punched in a picture instead of a room with a floor. It is the
      // same authored rock, warm and deep in shadow (law §3.5 bored tunnel #1f1a15), tiled at the
      // cell's texel density so the floor and the walls are visibly one continuous body.
      const surface = getReadyRockSurfaceTextures();
      let mat;
      if (surface && surface.baseColor) {
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setRGB(1.02, 0.94, 0.80),
          map: surface.baseColor,
          normalMap: surface.normal,
          normalScale: new THREE.Vector2(1.6, 1.6),
          aoMap: surface.orm,
          aoMapIntensity: 1,
          roughnessMap: surface.orm,
          metalnessMap: surface.orm,
          roughness: 1,
          metalness: 1,
        });
        // Same texel density as the cut face, so the floor and the walls above it are one body.
        const tile = (COLS / ROCK_UV_CELLS) / ROCK_SURFACE_TEXTURE_REPEAT;
        mat.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', [
            '#include <uv_vertex>',
            `#ifdef USE_MAP`,
            `  vMapUv *= ${tile.toFixed(4)};`,
            '  #ifdef USE_NORMALMAP',
            '    vNormalMapUv = vMapUv;',
            '  #endif',
            '  #ifdef USE_AOMAP',
            '    vAoMapUv = vMapUv;',
            '  #endif',
            '  #ifdef USE_ROUGHNESSMAP',
            '    vRoughnessMapUv = vMapUv;',
            '  #endif',
            '  #ifdef USE_METALNESSMAP',
            '    vMetalnessMapUv = vMapUv;',
            '  #endif',
            '#endif',
          ].join('\n'));
        };
        mat.customProgramCacheKey = () => 'sf-ast-cavity-floor';
      } else {
        mat = new THREE.MeshStandardMaterial({ color: 0x231d16, roughness: 1, metalness: 0 });
      }
      backWall = new THREE.Mesh(new THREE.PlaneGeometry(COLS * S, ROWS * S), mat);
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
      // Sits partway between the cut plane and the back wall: far enough behind to read as the
      // recessed crust the shaft was sunk through, near enough that the field in front of it does
      // not bury the whole surface strip in its own shadow.
      dummy.position.set(worldX(c), worldY(-1), ROCK_FACE * 0.5);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(S * 1.02, S * (0.55 + h * 0.8), DEPTH);
      dummy.updateMatrix();
      plateauInst.setMatrixAt(i, dummy.matrix);
      // Crust caps: the same stone, a touch cooler and dimmer than the interior because this is
      // the face that has been staring at cold starlight, not sitting in the work-light pool.
      const t = 0.86 + rnd01(c, 78, 'pt') * 0.1;
      plateauInst.setColorAt(i, colScratch.setRGB(t * 0.97, t, t * 1.05));
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

  // The silhouette skirt (law §4): an irregular fringe of crust blocks around the field rectangle
  // so the board reads as an asteroid body against space — visible at the edges of work zoom and
  // across the whole site register. Same block kit, darker cooler crust tint, deterministic noise.
  function buildSkirt() {
    if (skirtInst) {
      rockGroup.remove(skirtInst);
      skirtInst.dispose();
      skirtInst = null;
    }
    const cells = [];
    const scan = SKIRT_CELLS + 2;
    for (let c = -scan; c < COLS + scan; c++) {
      for (let r = -1; r < ROWS + scan; r++) {
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) continue;      // the field itself
        if (r === -1 && c >= -2 && c <= COLS + 1) continue;          // the plateau row owns this strip
        const dc = Math.max(0, -c, c - (COLS - 1));
        const dr = Math.max(0, -r, r - (ROWS - 1));
        const dist = Math.hypot(dc, dr);
        if (dist > 1.15 + rnd01(c, r, 'sk') * 2.7) continue;          // irregular boundary 1–4 cells deep
        cells.push({ c, r, edge: Math.min(1, dist / (SKIRT_CELLS + 1)) });
      }
    }
    if (!cells.length) return;
    skirtInst = new THREE.InstancedMesh(blockGeos[hash32(cells.length, 91, 'skg') % blockGeos.length], rockMats.matrix, cells.length);
    skirtInst.castShadow = true;
    skirtInst.receiveShadow = true;
    skirtInst.frustumCulled = false;
    cells.forEach((cell, i) => {
      dummy.position.set(worldX(cell.c), worldY(cell.r), ROCK_FACE - S * 0.08);
      dummy.rotation.set(0, 0, 0);
      const wobble = 1.02 + rnd01(cell.c + 31, cell.r + 17, 'skw') * 0.16;
      dummy.scale.set(S * wobble, S * wobble, DEPTH * 1.15);
      dummy.updateMatrix();
      skirtInst.setMatrixAt(i, dummy.matrix);
      // crust: darker and cooler toward the rim, still the same stone family
      const t = 0.92 - cell.edge * 0.3 + rnd01(cell.c + 3, cell.r + 9, 'skt') * 0.06;
      skirtInst.setColorAt(i, colScratch.setRGB(t * 0.95, t, t * 1.08));
    });
    skirtInst.instanceMatrix.needsUpdate = true;
    if (skirtInst.instanceColor) skirtInst.instanceColor.needsUpdate = true;
    rockGroup.add(skirtInst);
  }

  function carveCell(c, r) {
    const idx = tileIndex(c, r);
    const rec = cellRock.get(idx);
    if (rec && !rec.carved) {
      rec.carved = true;
      setRockMatrix(c, r, true);
      rec.mesh.setMatrixAt(rec.i, dummy.matrix);
      rec.mesh.instanceMatrix.needsUpdate = true;
    }
    // Pruning damage belongs HERE, not at the call sites: carveCell is reached from the break
    // event AND from refreshCells, and a crack quad left behind by the second path would hang at
    // Z.stain over an empty cell — a decal floating in a void.
    if (damagedCells.delete(idx)) { crackDirty = true; rebuildCrackInstances(); }
    if (digCell && digCell.idx === idx) digCell = null;
    removeOreAt(c, r);
    removeGasAt(c, r);
    seamsDirty = true;   // a cut can split a body in two; the outline is the promise it made
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

  function oreBucketFor(oreId, locked) {
    const key2 = `${oreId}:${locked ? 1 : 0}`;
    let b = oreBuckets.get(key2);
    if (b) return b;
    const cap = Math.max(1, oreCaps.get(oreId) || 1);
    const geos = inclusionGeos[familyForOre(oreId)] || clusterGeos;
    const mesh = new THREE.InstancedMesh(geos[(oreId.length + (locked ? 1 : 0)) % geos.length], oreMaterial(oreId, locked), cap);
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

  // The cut face of a solid block, in world z. Each cell's pad sits at its own relief height, so an
  // inclusion placed at one constant z reads proud on a low block and half-buried on a high one.
  function padZ(c, r) {
    return ROCK_FACE + padLocalTop(hash32(c, r, 'ckv') % blockGeos.length) * DEPTH;
  }

  // Per-family placement. Footprint is deliberately just under one cell for the metal vein (it runs
  // edge to edge and must not spill into its neighbour) and looser for the clusters.
  const INCLUSION_FIT = {
    metal: [0.96, 0.06],
    ice: [0.92, 0.12],
    exotic: [0.94, 0.12],
    matrix: [1.04, 0.16],
  };

  // EVERY VEIN IS VISIBLE FROM THE FIRST FRAME (law §2.3 — the survey gate is gone). A vein erupts
  // its family's inclusion; a tier-locked one wears the same shape in a dulled, oxidised finish,
  // and the engraved MK plate arrives when the rig aims at it (law §5).
  function syncOreAt(c, r) {
    const tile = field[c] && field[c][r];
    const idx = tileIndex(c, r);
    const wanted = !!(tile && tile.type === 'vein' && tile.ore);
    const existing = oreCellIndex.get(idx);
    if (!wanted) {
      if (existing) killOreInstance(existing);
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
    const fam = familyForOre(tile.ore);
    // A metal vein snaps to one of four axis orientations so neighbouring seam cells CHAIN into one
    // continuous branch across the body instead of each cell wearing its own unrelated squiggle.
    const rotZ = fam === 'metal'
      ? (hash32(c, r, 'or') % 4) * (Math.PI / 2)
      : rnd01(c, r, 'or') * Math.PI * 2;
    const fit = INCLUSION_FIT[fam] || INCLUSION_FIT.matrix;
    const scale = S * (fit[0] + rnd01(c, r, 'os') * fit[1]);
    const z = padZ(c, r) - 0.09;
    dummy.position.set(worldX(c), worldY(r), z);
    dummy.rotation.set(0, 0, rotZ);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    b.mesh.setMatrixAt(i, dummy.matrix);
    b.mesh.count = b.n;
    b.mesh.instanceMatrix.needsUpdate = true;
    b.cells.set(idx, i);
    const entry = { bucket: b, i, idx };
    oreCellIndex.set(idx, entry);
    oreWakes.push({ entry, x: worldX(c), y: worldY(r), z, rotZ, scale, t0: timeSNow });
  }

  function removeOreAt(c, r) {
    const idx = tileIndex(c, r);
    const existing = oreCellIndex.get(idx);
    if (existing) killOreInstance(existing);
  }

  function removeGasAt(c, r) {
    const idx = tileIndex(c, r);
    const rec = gasByCell.get(idx);
    if (!rec) return;
    gasRoot.remove(rec.group);
    gasByCell.delete(idx);
    if (digGasHot === rec) digGasHot = null;
  }

  // A GAS POCKET IS A CRACKED BLOCK (law §3.5 / §2.3). No tell, no reveal, no pulse: it is visible
  // from the first frame like every other material, and its danger is carried by the shape of the
  // cell — a dark core sunk into the cut face, hairline fissures radiating out of it, and a thin
  // wisp drifting above. Never a crystal, never a halo.
  function syncGasAt(c, r) {
    const idx = tileIndex(c, r);
    const tile = field[c] && field[c][r];
    const existing = gasByCell.get(idx);
    if (!tile || tile.type !== 'gas') {
      if (existing) removeGasAt(c, r);
      return;
    }
    if (existing) return;
    const face = padZ(c, r);
    const group = new THREE.Group();
    group.position.set(worldX(c), worldY(r), 0);
    // The dark centre — a socket the light cannot reach.
    const core = new THREE.Mesh(gasCoreGeo, gasCoreMat);
    core.position.z = face - 0.02;
    core.rotation.z = rnd01(c, r, 'gk') * Math.PI * 2;
    core.scale.setScalar(S);
    group.add(core);
    // Radial hairline fissures, seated on the pad so the raking key finds their flanks.
    const cracks = [];
    const cm = new THREE.Mesh(gasCrackGeos[hash32(c, r, 'gcr') % gasCrackGeos.length], gasCrackMat);
    cm.position.z = face - 0.012;
    cm.rotation.z = rnd01(c, r, 'gcz') * Math.PI * 2;
    cm.scale.setScalar(S);
    cm.castShadow = true;
    group.add(cm);
    cracks.push(cm);
    // The breath: a small wisp that drifts, seeping out of the core.
    const vapor = new THREE.Mesh(gasVaporGeo, gasMat);
    vapor.position.z = face + 0.14;
    vapor.rotation.z = rnd01(c, r, 'gv') * Math.PI * 2;
    const baseScale = S * (0.62 + rnd01(c, r, 'gs') * 0.14);
    vapor.scale.set(baseScale, baseScale, baseScale * 0.55);
    group.add(vapor);
    gasRoot.add(group);
    gasByCell.set(idx, { group, vapor, cracks, phase: rnd01(c, r, 'gp') * Math.PI * 2, baseScale, hot: false });
  }

  // A blown pocket leaves a permanent scar (law §3.5 "vented pocket", D2 permanence). The sim clears
  // the tile outright, so the cell itself is gone — what stays is the split-open lip on the cavity
  // floor, dead gray-green, for as long as this session holds the rock.
  function addVentedScar(c, r) {
    const idx = tileIndex(c, r);
    if (ventedScars.has(idx)) return;
    const m = new THREE.Mesh(ventedScarGeo, ventedMat);
    m.position.set(worldX(c), worldY(r), Z.back + 0.07);
    m.rotation.z = rnd01(c, r, 'vs') * Math.PI * 2;
    m.scale.setScalar(S);
    m.receiveShadow = true;
    gasRoot.add(m);
    ventedScars.set(idx, m);
  }

  function clearVentedScars() {
    for (const [, m] of ventedScars) gasRoot.remove(m);
    ventedScars.clear();
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
        rec.mesh.setColorAt(rec.i, rockInstanceColor(col, row, materialIdFor(tile), colScratch));
        touchedColor = true;
      }
      syncOreAt(col, row);
    }
    if (touchedColor) {
      for (const bucket of ROCK_BUCKETS) {
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
      // Physical clamp arms: machined steel with the worked material's tint in the PAINT, not in
      // an emissive. A clamp bolted to a seam is hardware; a glowing bar is an icon (law §2.7).
      const mat = new THREE.MeshStandardMaterial({
        color: armTint(cell), emissive: 0x000000, emissiveIntensity: 0, roughness: 0.46, metalness: 0.66,
        envMap,
      });
      mat._own = true;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(len, S * 0.075, S * 0.075), mat);
      bar.position.set(dx * len * 0.55, dy * len * 0.55, S * 0.34);
      bar.rotation.z = Math.atan2(dy, dx);
      bar.castShadow = true;
      arms.add(bar);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(S * 0.12, S * 0.2, S * 0.2), mat);
      pad.position.set(dx * S * 0.52, dy * S * 0.52, S * 0.34);
      pad.rotation.z = Math.atan2(dy, dx);
      pad.castShadow = true;
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
            ? 0.75 + 0.5 * Math.sin(timeS * 3.2) : 0.9;
        }
        const running = state === 'running' || state === 'throttled' || state === 'limited';
        rec.lightRunning = running;
        rec.lightState = state;
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
            ? (motionReduce ? 1.5 : 1.25 + 0.55 * Math.sin(timeS * 5)) : 0.08;
        }
        if (rec.dyn.progressBar) {
          const p = status && Number.isFinite(status.progress) ? Math.max(0, Math.min(1, status.progress)) : 0;
          // The gantry head TRAVELS its rail. Same 0..1 contract, a mechanism instead of a bar.
          rec.dyn.progressBar.position.x = rec.dyn.progressBase + rec.dyn.progressTravel * p;
        }
        if (rec.dyn.pod) rec.dyn.pod.visible = !!(site.fleet && site.fleet.podsReady > 0);
      }
    }
    for (const id of [...machines.keys()]) {
      if (!seen.has(id)) removeMachine(id);
    }
    syncMachineLights(timeS);
  }

  // Claim the fixed light pool for the machines that most deserve a real lamp: a running furnace
  // first (it has an open fire in it), then anything else that is running, then faults so a dark
  // machine still has a colour on the rock beside it. Everything unclaimed parks at intensity 0.
  const lightPick = [];
  function syncMachineLights(timeS) {
    lightPick.length = 0;
    for (const [, rec] of machines) {
      const anchor = rec.dyn.furnaceAnchor || rec.dyn.lampAnchor;
      if (!anchor) continue;
      const st = rec.lightState || 'idle';
      let rank = 0;
      if (rec.dyn.furnace && rec.lightRunning) rank = 3;
      else if (rec.lightRunning) rank = 2;
      else if (FAULT_STATES.has(st)) rank = 1;
      if (!rank) continue;
      lightPick.push({ rec, anchor, rank, st });
    }
    lightPick.sort((a, b) => b.rank - a.rank);
    for (let i = 0; i < machineLights.length; i++) {
      const l = machineLights[i];
      const pick = lightPick[i];
      if (!pick) { l.intensity = 0; l.position.set(0, 0, -900); continue; }
      pick.anchor.getWorldPosition(l.position);
      l.position.z += S * 0.16;
      if (pick.rank === 3) {
        l.color.setHex(0xff8a30);
        l.intensity = motionReduce ? 5.2 : 4.4 + 1.4 * Math.sin(timeS * 5);
      } else {
        l.color.setHex(pick.rank === 2 ? 0xffc07a : statusColorHex({ state: pick.st }));
        l.intensity = pick.rank === 2 ? 2.1 : 1.2;
      }
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

  // Soft-leash follow (law §4): the camera only moves when the rover leaves the middle 50% of
  // the glass, eases with a 120ms time constant, and never pans faster than 6 cells/s. Work
  // register follows the rover in X and Y; the site register centers the whole body.
  const look = { x: 0, y: 0 };
  let lookInit = false;
  let lookSnapNext = false;   // first work frame snaps to the clamped framing instead of easing in
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function easeLook(tx, ty, dt, capped) {
    if (motionReduce) {
      look.x = tx; look.y = ty;
      return;
    }
    const k = 1 - Math.exp(-dt / CAM_EASE_T);
    let nx = look.x + (tx - look.x) * k;
    let ny = look.y + (ty - look.y) * k;
    if (capped) {
      const maxStep = CAM_MAX_CELLS_S * S * dt;
      nx = clamp(nx, look.x - maxStep, look.x + maxStep);
      ny = clamp(ny, look.y - maxStep, look.y + maxStep);
    }
    look.x = nx; look.y = ny;
  }

  function stepCamera(d, dt) {
    const drawPos = avatarDrawPos(d.avatar, TILE);
    const roverX = pxToWorldX(drawPos.x + TILE / 2);
    const roverY = pxToWorldY(drawPos.y + TILE / 2);
    const { halfW, halfH } = viewHalfExtents();
    if (!lookInit) {
      look.x = roverX;
      look.y = roverY;
      lookInit = true;
      lookSnapNext = true;
    }
    if (zoomRegister === 'site') {
      const b = bodyExtents();
      easeLook((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, dt, false);
    } else {
      // leash: the camera waits while the rover stays inside the middle half of the view
      const slackX = halfW * 0.25;
      const slackY = halfH * 0.25;
      let desiredX = look.x;
      let desiredY = look.y;
      if (roverX > look.x + slackX) desiredX = roverX - slackX;
      else if (roverX < look.x - slackX) desiredX = roverX + slackX;
      if (roverY > look.y + slackY) desiredY = roverY - slackY;
      else if (roverY < look.y - slackY) desiredY = roverY + slackY;
      // clamp to the body: a little space may show past the silhouette edge, never pure void
      const b = bodyExtents();
      const loX = b.minX + halfW - S * 2.5;
      const hiX = b.maxX - halfW + S * 2.5;
      const loY = b.minY + halfH - S * 2;
      const hiY = b.maxY - halfH + S * 0.5;
      const cx = loX > hiX ? (b.minX + b.maxX) / 2 : clamp(desiredX, loX, hiX);
      const cy = loY > hiY ? (b.minY + b.maxY) / 2 : clamp(desiredY, loY, hiY);
      if (lookSnapNext) { look.x = cx; look.y = cy; lookSnapNext = false; }
      else easeLook(cx, cy, dt, true);
    }
    return { x: look.x, y: look.y };
  }

  function poseCamera(centerX, centerY, shakeX, shakeY) {
    const cx = centerX + shakeX;
    const cy = centerY + shakeY;
    // Zero yaw, zero pitch (law §2.1): the optical axis is exactly +z→-z, dead perpendicular to
    // the cut plane. Only the DOLLY changes between registers.
    const { halfH } = viewHalfExtents();
    camera.position.set(cx, cy, camDistanceFor(halfH));
    camera.up.set(0, 1, 0);
    camera.lookAt(cx, cy, 0);
    camera.updateMatrixWorld();

    // ---- the rig tracks the view so texel density stays where the player is looking ----
    // KEY: warm work-light raking in from BELOW-LEFT and only slightly in front of the cut plane.
    // Shallow z is the whole point: a light near the plane grazes every pad, so the bevel that
    // faces it lights, the bevel that faces away goes dark, and a carved cell throws a real
    // shadow down its own wall. Aimed at the plane, not at the camera.
    // reach is view-scaled and every offset is proportional to it, so the incidence angles (and
    // therefore the key:fill ratio measured on a pad) are identical in both zoom registers.
    const reach = Math.max(halfH, S * 8);
    key.position.set(cx - reach * 1.15, cy - reach * 0.78, reach * 0.54);
    key.target.position.set(cx, cy, 0);
    // RIM: cold starlight from straight above and a little behind the plane — the blue lip on the
    // top edge of every block, and the separation between the plateau and space.
    rim.position.set(cx + reach * 0.22, cy + reach * 1.45, reach * 0.30);
    rim.target.position.set(cx, cy, 0);
    // FILL: weak, cool, raking from the opposite quadrant to the key. Never head-on.
    fill.position.set(cx + reach * 1.12, cy + reach * 0.46, reach * 0.50);
    fill.target.position.set(cx, cy, 0);
  }

  function pickCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const { origin, direction } = raycaster.ray;
    if (Math.abs(direction.z) < 1e-6) return null;
    // Intersect the PAD PLANE, not the fx plane. Under ortho the two were interchangeable; under
    // perspective every plane offset costs a radial parallax shift that grows off-axis, and
    // Z.face sits 0.42 proud of the pads — enough to misfire a cell near the frame edge.
    const t = (ROCK_FACE - origin.z) / direction.z;
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


  // ---------------------------------------------------------------- seams as bodies (law §3.5)
  // "Contiguous same-material cells share a brightened perimeter outline and one small count chip
  // at the body's center at work zoom. Aiming the drill at a seam cell draws the SPLIT PREVIEW
  // instantly: the outline breaks into the two resulting bodies with their new counts."
  //
  // This is the leaf's one piece of real bookkeeping, and it is the difference between a board you
  // read and a board you count on your fingers. Mechanic law §1.2 ("machines feed through faces —
  // approach a seam from its dead end") is unplayable if you cannot see where a body begins and
  // ends, and §1's anti-random test demands the permanent consequence preview at decision time.
  //
  // WHERE THE COMPONENTS COME FROM: the renderer, by flood fill over the tile grid.
  // src/systems/asteroidFormations.js is registry-registered but it tracks DISCOVERY RECORDS for
  // whole bodies across a sector (id, anchor, epoch) — it has no notion of cell adjacency inside
  // one rock's cut face, so there is nothing there to read. A 28×45 four-way fill is ~1260 visits
  // and runs only when the field actually changes (entry, and every cell a cut removes).
  const NBR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let seamSerial = 0;

  const seamLineMat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.56, depthWrite: false,
  });
  // A BODY IS TWO CELLS OR MORE. Outlining every isolated vein cell as well puts a rectangle around
  // roughly one cell in six — a hundred and eighty boxes on a 28×45 field — and the board stops
  // reading as rock and starts reading as a spreadsheet. A lone cell is already fully identified by
  // its host colour and its inclusion; what an outline adds is CONTIGUITY, which it alone has none
  // of. Law §3.5's subject is the seam, and a seam is what contiguity makes.
  const SEAM_MIN_BODY = 2;
  // The split preview is the same drawing, louder and one step further in: you are being shown a
  // consequence, so it out-reads the resting outline it replaces.
  const splitLineMat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false,
  });

  function seamOreOf(tile) {
    return tile && tile.type === 'vein' && tile.ore ? tile.ore : null;
  }

  function rebuildSeams() {
    seamsDirty = false;
    seamSerial++;
    seamBodies = [];
    seamOfCell = new Map();
    if (!field) return;
    const seen = new Uint8Array(COLS * ROWS);
    const stack = [];
    for (let c0 = 0; c0 < COLS; c0++) {
      for (let r0 = 0; r0 < ROWS; r0++) {
        const i0 = tileIndex(c0, r0);
        if (seen[i0]) continue;
        seen[i0] = 1;
        const ore = seamOreOf(field[c0][r0]);
        if (!ore) continue;
        const cells = [];
        stack.length = 0;
        stack.push([c0, r0]);
        while (stack.length) {
          const [cc, rr] = stack.pop();
          cells.push({ c: cc, r: rr, idx: tileIndex(cc, rr) });
          for (const [dc, dr] of NBR4) {
            const nc = cc + dc, nr = rr + dr;
            if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
            const ni = tileIndex(nc, nr);
            if (seen[ni]) continue;
            if (seamOreOf(field[nc][nr]) !== ore) continue;
            seen[ni] = 1;
            stack.push([nc, nr]);
          }
        }
        const body = { id: seamBodies.length, ore, cells, count: cells.length };
        Object.assign(body, seamAnchor(cells));
        for (const cell of cells) seamOfCell.set(cell.idx, body);
        seamBodies.push(body);
      }
    }
  }

  // The chip sits on a MEMBER cell nearest the centroid — an L-shaped body's centroid can land in
  // solid matrix outside the seam, and a count chip floating over the wrong material is a lie.
  function seamAnchor(cells) {
    let mx = 0, my = 0;
    for (const cell of cells) { mx += cell.c; my += cell.r; }
    mx /= cells.length; my /= cells.length;
    let best = cells[0], bestD = Infinity;
    for (const cell of cells) {
      const d = (cell.c - mx) * (cell.c - mx) + (cell.r - my) * (cell.r - my);
      if (d < bestD) { bestD = d; best = cell; }
    }
    return { ac: best.c, ar: best.r };
  }

  // The aimed cell: what the bit is in, or — when the rig is only facing — the cell it faces. The
  // split preview and the MK stamp both key off this, so "aimed" means the same thing to both.
  function aimCell(d) {
    if (!d || !d.avatar) return null;
    if (d.avatar.isDrilling && d.avatar.drillTarget) {
      const t = d.avatar.drillTarget;
      return (t.col >= 0 && t.col < COLS && t.row >= 0 && t.row < ROWS) ? { col: t.col, row: t.row } : null;
    }
    let c = d.avatar.col, r = d.avatar.row;
    const dir = d.avatar.faceDir || 'down';
    if (dir === 'left') c--; else if (dir === 'right') c++; else if (dir === 'up') r--; else r++;
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return { col: c, row: r };
  }

  // Perimeter of a cell set, as world-space line segments. An edge is drawn where the neighbour is
  // NOT in the set, which is exactly the body's silhouette. Inset off the joint so the line lands on
  // the lit pad rather than vanishing into the groove's own shadow.
  function perimeterInto(cellIdxSet, cells, inset, colour, pos, col) {
    const has = (c, r) => (c >= 0 && c < COLS && r >= 0 && r < ROWS && cellIdxSet.has(tileIndex(c, r)));
    for (const cell of cells) {
      const x0 = worldX(cell.c) - S / 2 + inset, x1 = worldX(cell.c) + S / 2 - inset;
      const y0 = worldY(cell.r) - S / 2 + inset, y1 = worldY(cell.r) + S / 2 - inset;
      const z = Z.face;
      const seg = (ax, ay, bx, by) => {
        pos.push(ax, ay, z, bx, by, z);
        for (let k = 0; k < 2; k++) col.push(colour.r, colour.g, colour.b);
      };
      if (!has(cell.c, cell.r - 1)) seg(x0, y1, x1, y1);   // row-1 is up in world y
      if (!has(cell.c, cell.r + 1)) seg(x0, y0, x1, y0);
      if (!has(cell.c - 1, cell.r)) seg(x0, y0, x0, y1);
      if (!has(cell.c + 1, cell.r)) seg(x1, y0, x1, y1);
    }
  }

  function seamOutlineColour(ore) {
    // "a BRIGHTENED perimeter outline, the material's detail color" — the vein hue carried halfway
    // to its glint. The raw glint alone is near-white on the pale ores, and a white box around a
    // cell is a UI selection marker, not a seam.
    const t = ORE_TINTS[ore] || ORE_TINTS.cmdty_silicate;
    return new THREE.Color(t.vein).lerp(new THREE.Color(t.glint || t.vein), 0.35);
  }

  function setLines(existing, pos, col, mat) {
    if (existing) { fxRoot.remove(existing); existing.geometry.dispose(); }
    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    lines.renderOrder = 24;
    fxRoot.add(lines);
    return lines;
  }

  // ---- count chips. MESHES, not DOM: the overlay layer lives inside .ast-screen, and design law
  // §11.3 caps the whole screen at 15 visible words — a board with ten seams on it would blow that
  // budget on its own. A textured plate scaled to a constant pixel height is the same drawing with
  // none of the accounting.
  const CHIP_H_PX = 20;         // pill height; the 13px numerals inside clear the §11.4 12px floor
  const CHIP_TEXT_PX = 13;
  const CHIP_SS = 3;            // supersample so the glyphs stay crisp on the board

  function chipTexture(label) {
    const key = `${label}|${chipFontReady ? 1 : 0}`;
    let rec = chipTextures.get(key);
    if (rec) return rec;
    const cv = document.createElement('canvas');
    const g0 = cv.getContext('2d');
    const font = `500 ${CHIP_TEXT_PX * CHIP_SS}px "Spline Sans Mono", ui-monospace, Consolas, monospace`;
    g0.font = font;
    const tw = g0.measureText(label).width;
    const padX = 8 * CHIP_SS;
    cv.width = Math.ceil(tw + padX * 2);
    cv.height = CHIP_H_PX * CHIP_SS;
    const g = cv.getContext('2d');
    g.font = font;
    const rr = cv.height / 2;
    g.beginPath();
    g.moveTo(rr, 0);
    g.arcTo(cv.width, 0, cv.width, cv.height, rr);
    g.arcTo(cv.width, cv.height, 0, cv.height, rr);
    g.arcTo(0, cv.height, 0, 0, rr);
    g.arcTo(0, 0, cv.width, 0, rr);
    g.closePath();
    g.fillStyle = 'rgba(34,28,21,0.93)';     // --aw-surface
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#f2e8d5';                 // --aw-ink
    g.fillText(label, cv.width / 2, cv.height / 2 + CHIP_SS);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    rec = { tex, wPx: cv.width / CHIP_SS, hPx: CHIP_H_PX };
    chipTextures.set(key, rec);
    return rec;
  }

  let chipsUsed = 0;
  function emitChip(label, wx, wy) {
    let chip = chipPool[chipsUsed];
    if (!chip) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
      const mesh = new THREE.Mesh(seamChipGeo, mat);
      mesh.renderOrder = 26;
      mesh.frustumCulled = false;
      fxRoot.add(mesh);
      chip = { mesh, mat, wPx: 0, hPx: 0 };
      chipPool.push(chip);
    }
    chipsUsed++;
    const rec = chipTexture(label);
    chip.mat.map = rec.tex;
    chip.mat.needsUpdate = true;
    chip.wPx = rec.wPx;
    chip.hPx = rec.hPx;
    chip.mesh.position.set(wx, wy, Z.face + 0.05);
    chip.mesh.visible = true;
  }

  // The chip is a piece of chrome sitting in a 3D scene, so it holds a CONSTANT PIXEL SIZE: its
  // world scale is solved from the live camera every frame. 13px stays 13px at either window size,
  // which is what keeps it above the §11.4 floor instead of merely above it at 1920.
  function layoutChips() {
    const halfH = viewHalfExtents().halfH;
    const pxPerWu = (canvas.clientHeight || 1) / (2 * halfH);
    for (let i = 0; i < chipPool.length; i++) {
      const chip = chipPool[i];
      if (i >= chipsUsed) { chip.mesh.visible = false; continue; }
      chip.mesh.scale.set(chip.wPx / pxPerWu, chip.hPx / pxPerWu, 1);
    }
  }

  // Everything the seam layer draws, once per frame.
  function syncSeamAnnotations(d) {
    if (seamsDirty) rebuildSeams();
    // Chips are a WORK-ZOOM instrument (law §3.5). At site zoom a 13px pill over a 16px cell is
    // noise, so the bodies keep their outlines and drop their counts.
    const workZoom = zoomRegister === 'work' && zoomKCur > 0.82;

    const aim = aimCell(d);
    const aimIdx = aim ? tileIndex(aim.col, aim.row) : -1;
    const aimBody = aim ? seamOfCell.get(aimIdx) : null;
    const sig = `${seamSerial}|${aimBody ? aimBody.id : -1}|${aimIdx}`;
    if (sig !== splitSig) {
      splitSig = sig;
      rebuildSeamLines(aimBody, aimIdx);
    }

    chipsUsed = 0;
    if (workZoom) {
      for (const b of splitBodies) emitChip(`${ORE_SYMBOL[b.ore] || '··'} ${b.count}`, b.wx, b.wy);
      for (const b of seamBodies) {
        if (aimBody && b.id === aimBody.id) continue;   // it is being previewed apart
        if (b.count < SEAM_MIN_BODY) continue;          // a single cell is a cell, not a seam
        emitChip(`${ORE_SYMBOL[b.ore] || '··'} ${b.count}`, worldX(b.ac), worldY(b.ar));
      }
    }
    layoutChips();
  }

  // Rebuild both line layers. When the rig is aimed at a seam cell the parent body's outline is
  // withheld and the sub-bodies the cut would leave are drawn in its place — that IS the preview.
  function rebuildSeamLines(aimBody, aimIdx) {
    const pos = [], col = [];
    const inset = S * 0.022;
    for (const b of seamBodies) {
      if (aimBody && b.id === aimBody.id) continue;
      if (b.count < SEAM_MIN_BODY) continue;
      const set = new Set(b.cells.map((cell) => cell.idx));
      perimeterInto(set, b.cells, inset, seamOutlineColour(b.ore), pos, col);
    }
    seamOutline = setLines(seamOutline, pos, col, seamLineMat);

    splitBodies = [];
    const spos = [], scol = [];
    if (aimBody && aimBody.count >= SEAM_MIN_BODY) {
      const colour = seamOutlineColour(aimBody.ore);
      const remaining = new Set(aimBody.cells.map((cell) => cell.idx));
      remaining.delete(aimIdx);
      const byIdx = new Map(aimBody.cells.map((cell) => [cell.idx, cell]));
      const seen = new Set();
      for (const cell of aimBody.cells) {
        if (!remaining.has(cell.idx) || seen.has(cell.idx)) continue;
        const part = [];
        const stack = [cell];
        seen.add(cell.idx);
        while (stack.length) {
          const cur = stack.pop();
          part.push(cur);
          for (const [dc, dr] of NBR4) {
            const nc = cur.c + dc, nr = cur.r + dr;
            if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
            const ni = tileIndex(nc, nr);
            if (!remaining.has(ni) || seen.has(ni)) continue;
            seen.add(ni);
            stack.push(byIdx.get(ni));
          }
        }
        const set = new Set(part.map((p) => p.idx));
        perimeterInto(set, part, S * 0.11, colour, spos, scol);
        const anchor = seamAnchor(part);
        splitBodies.push({ ore: aimBody.ore, count: part.length, wx: worldX(anchor.ac), wy: worldY(anchor.ar) });
      }
    }
    splitOutline = setLines(splitOutline, spos, scol, splitLineMat);
  }

  function clearSeamAnnotations() {
    seamOutline = setLines(seamOutline, [], [], seamLineMat);
    splitOutline = setLines(splitOutline, [], [], splitLineMat);
    splitBodies = [];
    splitSig = '';
    for (const chip of chipPool) chip.mesh.visible = false;
    chipsUsed = 0;
  }

  // ---- the MK lock plate (law §5 "Locked material"): one engraved stamp, on the aimed cell, in
  // over 600ms and out fast. Dull ore says "there is value here"; the stamp says "not with this bit".
  function syncMkStamp(d, dt) {
    const aim = aimCell(d);
    const tile = aim && field[aim.col] ? field[aim.col][aim.row] : null;
    const req = tile && tile.type === 'vein' && tile.ore
      ? (tile.tierReq || drillTierReqForOre(tile.ore)) : 0;
    const locked = !!req && drillSys.getDrillTier() < req;
    const idx = locked ? tileIndex(aim.col, aim.row) : -1;
    if (idx !== mkStampCell) {
      mkStampCell = idx;
      if (idx >= 0) {
        if (!mkStamp) {
          mkStamp = new THREE.Mesh(mkStampGeo, stampMaterial(req));
          mkStamp.castShadow = true;
          mkStamp.renderOrder = 22;
          oreRoot.add(mkStamp);
        }
        mkStamp.material = stampMaterial(req);
        mkStamp.position.set(worldX(aim.col), worldY(aim.row) - S * 0.27, padZ(aim.col, aim.row));
        mkStamp.scale.setScalar(S * 1.15);
      }
    }
    if (!mkStamp) return;
    const target = idx >= 0 ? 1 : 0;
    mkStampT = Math.max(0, Math.min(1, mkStampT + (target ? dt / 0.6 : -dt / 0.2)));
    mkStamp.material.opacity = mkStampT;
    mkStamp.visible = mkStampT > 0.015;
  }

  // Spline Sans Mono is vendored for this screen (law §3.3) but a canvas2d context only resolves a
  // webfont once the document has actually loaded it. Kick that once and re-bake the chip textures
  // when it lands, so the numerals are the law's face and not the fallback mono.
  if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
    document.fonts.load(`500 ${CHIP_TEXT_PX * CHIP_SS}px "Spline Sans Mono"`).then(() => {
      if (disposed) return;
      chipFontReady = true;
      splitSig = '';   // force the chip labels through chipTexture() again
    }).catch(() => {});
  }

  // ---------------------------------------------------------------- headless debug hook (law §11)
  // §11.1 (flatness) and §11.6 (no fog) are asserted against the LIVE renderer, not against a
  // re-implementation of it in the check — a check that recomputes the projection itself would pass
  // happily while the board on screen lied. scripts/check-asteroid-theater.mjs reads this.
  canvas.__ast3d = {
    // What this cell DRAWS AS. `revealed` is a live read of the presentation visibility gate, so a
    // regression that puts fog back fails the check instead of quietly re-hiding the board.
    cellAppearance(col, row) {
      if (!field || col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
      const tile = field[col][row];
      const material = materialIdFor(tile);
      const body = seamOfCell.get(tileIndex(col, row));
      return {
        type: tile ? tile.type : 'empty',
        material,
        ore: (tile && tile.ore) || null,
        family: tile && tile.ore ? familyForOre(tile.ore) : null,
        revealed: drillSys.isTileSurveyed(col, row),
        // There is no anonymous appearance left in this renderer: materialIdFor resolves every
        // non-empty tile to one of the law's six rows, and nothing downstream can withhold it.
        anonymous: !!tile && tile.type !== 'empty' && !material,
        seam: body ? { ore: body.ore, count: body.count } : null,
      };
    },
    // The cell's nominal footprint on the cut plane, projected through the LIVE camera: four screen
    // corners, clockwise from top-left. Nominal (not the per-variant pad) because the relief lift
    // varies 0.030–0.104 by design and that is exactly the noise a 0.5px flatness law must not eat.
    projectCell(col, row) {
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
      const x0 = worldX(col) - S / 2, x1 = worldX(col) + S / 2;
      const y0 = worldY(row) - S / 2, y1 = worldY(row) + S / 2;
      return [
        worldToScreen(x0, y1, ROCK_FACE), worldToScreen(x1, y1, ROCK_FACE),
        worldToScreen(x1, y0, ROCK_FACE), worldToScreen(x0, y0, ROCK_FACE),
      ];
    },
    seams() {
      return seamBodies.map((b) => ({ ore: b.ore, count: b.count, ac: b.ac, ar: b.ar }));
    },
    splitPreview() {
      return splitBodies.map((b) => ({ ore: b.ore, count: b.count }));
    },
    get zoomRegister() { return zoomRegister; },
    get cols() { return COLS; },
    get rows() { return ROWS; },
  };

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
        // NOT a restore. The bit leaving a cell does not heal it — the block keeps its sink and
        // hands its crack stage over to the persistent pool (law §5, bore progress).
        const prev = digCell;
        digCell = null;
        syncCellDamage(prev.c, prev.r);
      }
      crackDecal.visible = false;
      if (digGasHot) { setGasHot(digGasHot, false); digGasHot = null; }
      if (crackDirty) rebuildCrackInstances();
      return;
    }
    const idx = tileIndex(tgt.col, tgt.row);
    if (!digCell || digCell.idx !== idx) {
      const prev = digCell;
      digCell = { c: tgt.col, r: tgt.row, idx };
      if (prev) syncCellDamage(prev.c, prev.r);
      crackDirty = true;   // the new target must drop out of the persistent pool
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
    // keep the persistent record in step with the live bore so leaving mid-stage is seamless
    const live = damagedCells.get(idx);
    if (prog > 0.04) {
      if (!live || live.stage !== stage) { damagedCells.set(idx, { c: tgt.col, r: tgt.row, stage }); crackDirty = true; }
    } else if (live) { damagedCells.delete(idx); crackDirty = true; }
    if (crackDirty) rebuildCrackInstances();
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
      if (p.wasGas) addVentedScar(p.col, p.row);
      carveCell(p.col, p.row);
      refreshCells(neighborhood(p.col, p.row, 1));
      crackDecal.visible = false;
      const { x, y } = centerPx(p.col, p.row);
      const rockColor = p.wasGas ? '#8a9426'
        : (p.type === 'rock' ? '#4a5162' : '#7a6650');
      spawnChunks(x, y, rockColor, motionReduce ? 4 : 8);
      burst({ x, y, count: motionReduce ? 5 : 10, color: '#a78262', life: 0.45, size: 2.8, speed: 60, kind: 'dust', gravity: 55, cone: Math.PI * 2 });
      firePulseRing(p.col, p.row, 0xffb648, 0.3);
      return;
    }
    if (evt === 'yield') {
      const { x, y } = centerPx(p.col, p.row);
      const tint = (ORE_TINTS[p.ore] || {}).vein || '#ffb648';
      burst({ x, y, count: 10, color: tint, life: 0.55, size: 2.4, speed: 55, kind: 'spark', gravity: 40, cone: Math.PI * 2 });
      spawnFloater(x, y - 8, `+${p.qty}`, '#ffb648');
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
      // A TAP-BITE IS A STRIKE, NOT A GRIND. The drive leaf reports `bite` on a single-tap bore
      // and `bore` (0..1) on the continuous one, so the two read differently: a bite throws three
      // times the sparks in a wider cone, kicks a chip loose, and punches the block one stage
      // deeper in its socket for a beat. Continuous grind stays a thin steady spray.
      if (p.bite) {
        burst({ x: cx, y: cy, count: motionReduce ? 4 : 9, color: tint, life: 0.34, size: 2.3,
          speed: 78, kind: 'spark', cone: 2.0, gravity: 28 });
        if (!motionReduce) spawnChunks(cx, cy, tint, 2);
        const bIdx = tileIndex(p.col, p.row);
        const bRec = cellRock.get(bIdx);
        if (bRec && !bRec.carved) {
          const bore = Number.isFinite(p.bore) ? Math.max(0, Math.min(1, p.bore)) : 0;
          setRockMatrix(p.col, p.row, false, Math.min(1, bore + 0.22));
          bRec.mesh.setMatrixAt(bRec.i, dummy.matrix);
          bRec.mesh.instanceMatrix.needsUpdate = true;
        }
      } else {
        burst({ x: cx, y: cy, count: 3, color: tint, life: 0.28, size: 1.8, speed: 45, kind: 'spark', cone: 1.1, gravity: 20 });
      }
      return;
    }
    if (evt === 'scanPulse') {
      if (d) refreshCells(neighborhood(d.avatar.col, d.avatar.row, SCAN_RADIUS));
      return;
    }
    if (evt === 'install') {
      firePulseRing(p.col, p.row, 0x7cd9a2, 0.6);
      const { x, y } = centerPx(p.col, p.row);
      burst({ x, y, count: motionReduce ? 4 : 12, color: '#c9b48a', life: 0.5, size: 2.4, speed: 55, kind: 'dust', cone: Math.PI * 2 });
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
    for (const [, m] of gasByCell) gasRoot.remove(m.group);
    gasByCell.clear();
    clearVentedScars();
    clearSeamAnnotations();
    seamBodies = [];
    seamOfCell = new Map();
    seamsDirty = true;
    mkStampCell = -1;
    mkStampT = 0;
    if (mkStamp) mkStamp.visible = false;
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
    lookInit = false;
    zoomRegister = 'work';
    zoomKCur = 1;
    zoomAnim = null;
    applyView();
    digCell = null;
    digGasHot = null;
    crackDecal.visible = false;
    dustTimer = 0;
    lastRevealCell = { col: -1, row: -1 };
    // surface dressing is per-session (plateau tint/derrick position are field-stable but cheap)
    if (plateauInst) { rockGroup.remove(plateauInst); plateauInst.dispose(); plateauInst = null; }
    if (skirtInst) { rockGroup.remove(skirtInst); skirtInst.dispose(); skirtInst = null; }
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
    buildRock();
    buildSurface();
    buildSkirt();
    // seed ore / gas / half-bored damage for the already-known parts of the field. Damage is
    // seeded from hp on entry so a reloaded site shows every abandoned bore exactly as it was.
    damagedCells.clear();
    crackDirty = true;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const tile = field[c][r];
        if (tile.type === 'gas') syncGasAt(c, r);
        else if (tile.type === 'vein') syncOreAt(c, r);
        if (tile.type !== 'empty' && tile.maxHp && tile.hp < tile.maxHp) syncCellDamage(c, r);
      }
    }
    rebuildCrackInstances();
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
    stepZoom(dt);
    const cam = stepCamera(d, dt);
    poseCamera(cam.x, cam.y, (shakePx.x / TILE) * S, (-shakePx.y / TILE) * S);

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
    // THE BIT HEATS (law §4). Tool steel goes from a dull scorched brown toward a coral glow as
    // the drill temperature climbs. It is the one part of the rig allowed to emit, and it only
    // emits when it has earned it.
    if (roverBuilt.dyn.bitMat) {
      const heat = Math.max(0, Math.min(1, (d.drillTemp || 0) / 100));
      roverBuilt.dyn.bitMat.emissive.setHex(0x9a6f4a).lerp(HOT_BIT, heat);
      roverBuilt.dyn.bitMat.emissiveIntensity = heat * heat * 1.5;
    }
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
    // A live run brightens its jacket a little; a dead one goes to bare metal. Ceiling stays low
    // so a cable never out-shouts a real lamp or blooms.
    laneCoreMat.emissiveIntensity = flowing
      ? (motionReduce ? 0.34 : 0.26 + 0.13 * Math.sin(timeS * 4.2)) : 0.06;
    powerCoreMat.emissiveIntensity = worstRatio >= 1 ? 0.36 : 0.05 + worstRatio * 0.22;
    syncUmbilical(d, rx, ry, moving, dt);

    // dig progress: crack + sink the target block, dribble dust off the face
    syncDigTarget(d, dt);

    // THE POCKET BREATHES (law §3.5 "a cracked, breathing cell"). At rest that is a slow drift of
    // the wisp inside the cell and a shallow swell — motion you notice without being told, at a
    // rate nothing else on the board moves at. It is NOT a colour pulse: the old build breathed by
    // scaling a SHARED material's emissive, so one hot pocket lit every pocket in the rock, and the
    // resting state glowed. Hot is a material swap, per cell, and only a real breach earns it.
    for (const [, g] of gasByCell) {
      if (!motionReduce) {
        g.vapor.position.x = Math.sin(timeS * 0.23 + g.phase) * S * 0.07;
        g.vapor.position.y = Math.sin(timeS * 0.16 + g.phase * 1.7) * S * 0.05;
        g.vapor.rotation.z = g.phase + timeS * (g.hot ? 0.85 : 0.07);
        const br = 1 + Math.sin(timeS * (g.hot ? 3.4 : 0.38) + g.phase) * (g.hot ? 0.11 : 0.055);
        g.vapor.scale.setScalar(g.baseScale * br);
      }
      const wantMat = g.hot ? gasVaporHotMat : gasMat;
      if (g.vapor.material !== wantMat) g.vapor.material = wantMat;
    }

    // ore wake pops (the survey's reward beat)
    for (let i = oreWakes.length - 1; i >= 0; i--) {
      const w = oreWakes[i];
      // the vein may have been drilled out mid-pop — never resurrect a killed instance
      if (!w.entry.bucket.cells.has(w.entry.idx)) { oreWakes.splice(i, 1); continue; }
      const t = motionReduce ? 1 : (timeS - w.t0) / 0.24;
      const k = t >= 1 ? 1 : (1 - Math.pow(1 - Math.max(0, t), 2));
      const overshoot = t < 1 && !motionReduce ? 1 + Math.sin(Math.min(1, t) * Math.PI) * 0.14 : 1;
      dummy.position.set(w.x, w.y, w.z);
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
    syncSeamAnnotations(d);
    syncMkStamp(d, dt);
    syncScanRing(d, rx, ry);
    stepFx(dt);
    stepDom(d, dt);
    bloom.render(scene, camera);
  }

  // ---------------------------------------------------------------- teardown
  function dispose() {
    for (const [, b] of oreBuckets) { oreRoot.remove(b.mesh); b.mesh.dispose(); }
    oreBuckets.clear();
    for (const [, g] of gasByCell) gasRoot.remove(g.group);
    gasByCell.clear();
    clearVentedScars();
    for (const id of [...machines.keys()]) removeMachine(id);
    if (ghost) { fxRoot.remove(ghost.group); disposeGroup(ghost.group); ghost = null; }
    if (umbilical) {
      scene.remove(umbilical.casing, umbilical.core);
      umbilical.casing.geometry.dispose();
      umbilical.core.geometry.dispose();
      umbilical = null;
    }
    rebuildOverlays(null);
    for (const bucket of ROCK_BUCKETS) {
      for (const inst of rockInst[bucket]) inst.dispose();
      rockInst[bucket] = [];
    }
    for (const bi of bandInsts) { rockGroup.remove(bi); bi.dispose(); }
    bandInsts = [];
    cellRock.clear();
    if (plateauInst) { rockGroup.remove(plateauInst); plateauInst.dispose(); plateauInst = null; }
    if (skirtInst) { rockGroup.remove(skirtInst); skirtInst.dispose(); skirtInst = null; }
    if (derrickBuilt) { scene.remove(derrickBuilt.group); disposeGroup(derrickBuilt.group); derrickBuilt = null; }
    if (backWall) { backWall.geometry.dispose(); backWall.material.dispose(); backWall = null; }
    if (ro) ro.disconnect();
    bloom.dispose();
    scene.remove(stars);
    starGeo.dispose();
    starMat.dispose();
    for (const m of oreMats.values()) m.dispose();
    for (const m of stampMats.values()) { delete m.dispose; m.dispose(); }
    for (const t of stampTextures.values()) t.dispose();
    if (mkStamp) { oreRoot.remove(mkStamp); mkStamp = null; }
    for (const chip of chipPool) { fxRoot.remove(chip.mesh); chip.mat.dispose(); }
    chipPool.length = 0;
    for (const rec of chipTextures.values()) rec.tex.dispose();
    chipTextures.clear();
    seamLineMat.dispose(); splitLineMat.dispose();
    gasVaporHotMat.dispose(); gasCoreMat.dispose(); ventedMat.dispose();
    canvas.__ast3d = null;
    laneCoreMat.dispose(); powerCoreMat.dispose(); casingMat.dispose();
    gasMat.dispose(); gasCrackMat.dispose(); gasCrackHotMat.dispose();
    frameMat.dispose(); ringSolidMat.dispose(); ringEmptyMat.dispose(); padOkMat.dispose(); padBadMat.dispose();
    scanMat.dispose(); scanRing.geometry.dispose();
    crackDecalMat.dispose(); crackDecal.geometry.dispose();
    for (const m of crackStageMeshes) { fxRoot.remove(m); m.geometry.dispose(); m.material.dispose(); m.dispose(); }
    crackStageMeshes.length = 0;
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
    for (const l of machineLights) scene.remove(l);
    machineLights.length = 0;
    disposed = true;
    for (const b of ROCK_BUCKETS) rockMats[b].dispose();
    key.shadow.map && key.shadow.map.dispose();
    rim.shadow && rim.shadow.map && rim.shadow.map.dispose();
    scene.environment = null;
    envRT.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.setSize(0, 0, false);
    if (dom.root) dom.root.remove();
  }

  return { begin, render, notify, refreshCells, pickCell, inputZoom, setZoomRegister, toggleZoomRegister, dispose };
}
