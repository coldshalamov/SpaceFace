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
import { connectivityMask, storeTotal } from '../../systems/siteLogistics.js';
import { contactKind, contactProfile } from '../../systems/siteProduction.js';
// PQ-130.10b: the Faces lens asks the SIM whether a seat is legal — canInstall is the same answer
// asteroidScreen's ghost gets, so a mint cell can never disagree with the refusal the click earns.
// `asteroidSites` is the module singleton the registry hands to ctx, so this is the live system.
import { asteroidSites } from '../../systems/asteroidSites.js';
import { spawnParticleBurst, stepParticles } from '../screens/drill.js';
import { CONTACT_YIELD } from '../../data/sites.js';
import { ORE_TINTS, STATUS_COLORS } from './asteroidRenderer2d.js';
import { createBloom } from '../../render/bloom.js';
import {
  preloadRockSurfaceLibrary, getReadyRockSurfaceTextures, ROCK_SURFACE_TEXTURE_REPEAT,
} from '../../render/rockSurfaceLibrary.js';
import {
  makeRockMaterials, makeMachine, makeRover, metalMat,
  makeCellBlockGeos, makeOreClusterGeo, makeGasVaporGeo,
  makeMetalVeinGeo, makeIceSheenGeo, makeExoticLatticeGeo, makeRadialCrackGeos,
  makeGasCoreGeo, makeVentedScarGeo, makeBasaltBandGeo, makeMkStampGeo,
  makeVaporPuffGeo, makeScorchPlateGeo, makeCourierPodGeo,
  makeCrateStackGeo, makeFlowDotGeo, makeJunctionNodeGeo, makeWhyGlyphPlateGeo, makeSeatBracketGeo,
} from '../../render/asteroidInteriorPreview.js';
import {
  createWorksPartLoader,
  CARGO_PORT_HOOKS,
  CARGO_PORT_LAUNCH_CLEAR_WU,
  DERRICK_HOOKS,
  EXTRACTOR_HOOKS,
  FABRICATOR_HOOKS,
  GAS_TAP_HOOKS,
  MASSLINE_CORE_HOOKS,
  REFINERY_HOOKS,
  recordWorksInstanceResources,
  resolveWorksConduitPiece,
} from './worksPartLoader.js';
import {
  createWorksInclusionCatalog,
  createWorksInclusionInstance,
  releaseWorksInclusionInstance,
  selectWorksInclusionVariant,
  setWorksInclusionRegister,
  worksInclusionFamilyForCommodity,
} from './worksInclusionKit.js';

const { COLS, ROWS, SCAN_RADIUS, SCAN_ACTIVE_S } = DRILL_CONST;
export const VIEW_ROWS = 18;

const TILE = 40;              // px-space kept for parity with the shipped particle/shake helpers
const S = 2.2;                // world units per cell — the astlab-proven scale for these builders
// Same 8-cell contact ring as siteProduction.contactProfile (RING_OFFSETS is not exported).
// Exported so the ring contract is checkable without a canvas — see contactRingDivergence().
export const CONTACT_RING = Object.freeze([
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]);

/**
 * Compare this module's copy of the ring against the sim's own contactProfile on a synthetic
 * field that exercises every contactKind plus an out-of-bounds edge. Pure: no THREE, no DOM,
 * no module state — callable from a plain Node test.
 * @returns {string|null} null when the two agree; a human-readable divergence otherwise.
 */
export function contactRingDivergence() {
  const n = 5;
  const probe = [];
  for (let c = 0; c < n; c++) {
    probe[c] = [];
    for (let r = 0; r < n; r++) {
      const m = (c + r) % 5;
      if (m === 0) probe[c][r] = { type: 'vein', ore: `ore_${c}_${r}` };
      else if (m === 1) probe[c][r] = { type: 'gas' };
      else if (m === 2) probe[c][r] = { type: 'rock' };
      else if (m === 3) probe[c][r] = { type: 'empty' };
      else probe[c][r] = { type: 'dirt' };
    }
  }
  // Two seats. (2,2) is fully surrounded, so its ring exercises every contactKind; (0,0) hangs
  // off the corner, so five of its eight neighbours are out of bounds and must come back 'empty'
  // rather than reading past the array. A machine only ever sits on a hollow cell.
  for (const [oc, or] of [[2, 2], [0, 0]]) {
    const seat = probe[oc][or];
    probe[oc][or] = { type: 'empty' };
    const cells = contactProfile(probe, oc, or, n, n).cells;
    probe[oc][or] = seat;
    if (cells.length !== CONTACT_RING.length) {
      return `CONTACT_RING length ${CONTACT_RING.length} diverged from siteProduction.contactProfile ring ${cells.length}`;
    }
    for (let i = 0; i < CONTACT_RING.length; i++) {
      const dc = CONTACT_RING[i][0], dr = CONTACT_RING[i][1];
      const c = oc + dc, r = or + dr;
      const tile = (c >= 0 && c < n && r >= 0 && r < n && probe[c]) ? probe[c][r] : null;
      const kind = contactKind(tile);
      const ore = kind === 'ore' ? tile.ore : null;
      const cell = cells[i];
      if (cell.col !== c || cell.row !== r || cell.kind !== kind || cell.ore !== ore) {
        return `CONTACT_RING[${i}] around seat ${oc},${or} expected `
          + `{col:${c},row:${r},kind:${kind},ore:${ore}} but siteProduction.contactProfile gave `
          + `{col:${cell.col},row:${cell.row},kind:${cell.kind},ore:${cell.ore}}`;
      }
    }
  }
  return null;
}

// PQ-131.01 — the standing-mount lifecycle, pure so it can be gated without WebGL.
//
// WHY THIS EXISTS. The authored rover swap is armed twice: once during renderer setup and again
// from begin(). Both fired while the first load was still in the air, so the works loader took two
// leases for one screen session (worksStats.loaded: 2, released: 0 in the PQ-131.00 receipt) and
// the second arrival ran the renderer's disposeGroup() over the FIRST authored seat — whose
// geometry and materials are the same shared blueprint instances the surviving seat draws with.
//
// The contract: while an attempt is in the air every caller joins it; once an attempt has STOOD
// (resolved truthy) later callers get that settled result and nothing re-runs; a miss (null) or a
// throw clears the latch so a later begin() is a real retry. reset() retires the latch on teardown.
export function createSingleFlightMount(run) {
  if (typeof run !== 'function') throw new TypeError('[singleFlightMount] run must be a function');
  let inFlight = null;
  return {
    invoke() {
      if (inFlight) return inFlight;
      // Start immediately rather than on the next microtask: the caller is arming an asset fetch,
      // and a deferred start widens the very window two callers used to race through.
      let started;
      try {
        started = Promise.resolve(run());
      } catch (error) {
        return Promise.reject(error);
      }
      const attempt = started.then(
        (result) => {
          if (!result && inFlight === attempt) inFlight = null;
          return result;
        },
        (error) => {
          if (inFlight === attempt) inFlight = null;
          throw error;
        },
      );
      inFlight = attempt;
      return attempt;
    },
    reset() { inFlight = null; },
    get armed() { return inFlight !== null; },
  };
}

// Module load REPORTS a divergence; it must never throw. uiRoot.registerScreens() swallows a
// module-evaluation rejection with a console.warn and skips the screen, so a throw here would
// delete the whole mining board from the game while boot and every headless check stayed green
// — the exact silent-unplayable failure check:playable exists to catch. The hard gate that fails
// a build lives in test/asteroid-works-render.test.mjs.
{
  const divergence = contactRingDivergence();
  if (divergence) console.error(`[asteroidRenderer3d] ${divergence}`);
}
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
// PQ-131.00 proof mount: a fixed cell the capture can find. Off unless the query/dev flag
// or canvas.__ast3d.mountWorksProof() turns it on — a normal session must not grow a stray object.
const WORKS_PROOF_ID = 'drill_platform';
const WORKS_PROOF_CELL = Object.freeze({ col: 20, row: 4 });
const WORKS_PROOF_FOOTPRINT_CELLS = 2;
const WORKS_BG = Object.freeze([0x0b, 0x0a, 0x12]);

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

export function authoredWorksMachineKind(defId) {
  const kind = MACHINE_KIND[defId];
  if (kind === 'core') return 'massline_core';
  return kind === 'extractor' || kind === 'fabricator' || kind === 'refinery'
    || kind === 'cargo_port' || kind === 'gas_tap'
    ? kind
    : null;
}

function authoredWorksMachineLabel(kind) {
  if (kind === 'massline_core') return 'Massline Core';
  if (kind === 'fabricator') return 'Fabricator';
  if (kind === 'extractor') return 'Extractor';
  if (kind === 'refinery') return 'Refinery';
  if (kind === 'cargo_port') return 'Cargo Port';
  if (kind === 'gas_tap') return 'Gas Tap';
  return kind;
}

function bindAuthoredWorksMachine(kind, source) {
  if (kind === 'massline_core') return bindAuthoredMasslineCore(source);
  if (kind === 'fabricator') return bindAuthoredFabricator(source);
  if (kind === 'extractor') return bindAuthoredExtractor(source);
  if (kind === 'refinery') return bindAuthoredRefinery(source);
  if (kind === 'cargo_port') return bindAuthoredCargoPort(source);
  if (kind === 'gas_tap') return bindAuthoredGasTap(source);
  throw new Error(`[asteroidRenderer3d] no authored bind for ${kind}`);
}

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
/* Law §9 "Damage: edge vignette + camera kick, never a modal". These are EDGE vignettes: the
   centre of the glass — where the rock, the rig and the cut are — stays completely clear, and the
   colour only gathers in the last third toward the frame. A full-bleed wash over the board reads
   as a modal dimmer and hides the very thing the event is about. */
.ast3d-vignette { position:absolute; inset:0; opacity:0; }
.ast3d-flash-gas { background:radial-gradient(ellipse 55% 55% at 50% 50%,
  rgba(255,98,66,0) 0%, rgba(255,98,66,0) 46%, rgba(255,98,66,.34) 82%, rgba(255,98,66,.66) 100%); }
.ast3d-flash-cargo { background:radial-gradient(ellipse 58% 58% at 50% 50%,
  rgba(255,182,72,0) 0%, rgba(255,182,72,0) 52%, rgba(255,182,72,.18) 84%, rgba(255,182,72,.38) 100%); }
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
// PQ-130.10b, law §6.7: build mode strengthens the gridlines ~15%. The grid on this board is CUT
// (grooves between pads), so the strengthening is a SHADOW GATHER in the groove — a dark warm band
// hugging each cell edge, transparent everywhere else — not a drawn wireframe laid over the rock.
// One repeat is exactly one cell, so the band lands in the joint the geometry already has.
function makeGridGrooveTexture() {
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, N, N);
  // 2px of a 128px cell each side => a ~3% joint once two neighbours meet: at a 110px work-zoom
  // cell that is a 3.4px groove, which is the joint's real width.
  const band = 2;
  const grad = g.createLinearGradient(0, 0, 0, band * 2);
  grad.addColorStop(0, 'rgba(9,6,3,0.95)');
  grad.addColorStop(1, 'rgba(9,6,3,0)');
  for (const [x, y, w, h] of [[0, 0, N, band * 2], [0, N - band * 2, N, band * 2]]) {
    g.save();
    g.translate(x, y === 0 ? 0 : N);
    if (y !== 0) g.scale(1, -1);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.restore();
  }
  const gradV = g.createLinearGradient(0, 0, band * 2, 0);
  gradV.addColorStop(0, 'rgba(9,6,3,0.95)');
  gradV.addColorStop(1, 'rgba(9,6,3,0)');
  for (const left of [true, false]) {
    g.save();
    g.translate(left ? 0 : N, 0);
    if (!left) g.scale(-1, 1);
    g.fillStyle = gradV;
    g.fillRect(0, 0, band * 2, N);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(COLS, ROWS);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The why-glyph bank (law §6.7): one drawn SYMBOL per refusal, never a word. The reason strings are
// the sim's own (`asteroidSites.canInstall().reason`), so the plate can never name a rule the click
// would not enforce. Gold = you can fix this where you stand; coral = not this cell, ever; ink-3 =
// something is already there. Anything unmapped falls to a plain bar, which is honest about the
// renderer not having a symbol rather than inventing a meaning.
const WHY_GLYPH = {
  materials: { hue: '#ffb648', shape: 'stack' },
  'rover-not-adjacent': { hue: '#ffb648', shape: 'rover' },
  'rover-here': { hue: '#ffb648', shape: 'rover' },
  occupied: { hue: '#8a7a66', shape: 'filled' },
  'needs-gas-contact': { hue: '#ff6242', shape: 'pocket' },
  unique: { hue: '#ff6242', shape: 'single' },
  'survey-stale': { hue: '#ff6242', shape: 'broken' },
};

function makeWhyGlyphTexture(reason) {
  const spec = WHY_GLYPH[reason] || { hue: '#8a7a66', shape: 'bar' };
  const SS = 3;
  const N = 34 * SS;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(34,28,21,0.93)';           // --aw-surface: the plate body
  g.fillRect(0, 0, N, N);
  g.strokeStyle = spec.hue;
  g.lineWidth = 1.6 * SS;
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, N - g.lineWidth, N - g.lineWidth);
  const c = N / 2;
  const u = 3.1 * SS;                            // one glyph unit
  g.strokeStyle = spec.hue;
  g.fillStyle = spec.hue;
  g.lineWidth = 1.5 * SS;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (spec.shape === 'stack') {
    // a short stack of goods with the top course missing: the cost you have not got
    g.fillRect(c - u * 1.7, c + u * 0.5, u * 3.4, u * 0.9);
    g.fillRect(c - u * 1.7, c - u * 0.7, u * 2.1, u * 0.9);
    g.strokeRect(c - u * 1.7 + g.lineWidth / 2, c - u * 2.0, u * 3.4 - g.lineWidth, u * 0.95);
  } else if (spec.shape === 'rover') {
    // the rig, seen from the side: hull + two road wheels. It has to come here first.
    g.fillRect(c - u * 1.6, c - u * 0.9, u * 3.2, u * 1.3);
    g.beginPath();
    g.arc(c - u * 0.9, c + u * 0.9, u * 0.55, 0, Math.PI * 2);
    g.arc(c + u * 0.9, c + u * 0.9, u * 0.55, 0, Math.PI * 2);
    g.fill();
  } else if (spec.shape === 'filled') {
    // a full socket
    g.fillRect(c - u * 1.5, c - u * 1.5, u * 3, u * 3);
  } else if (spec.shape === 'pocket') {
    // a sealed pocket with its fissures: this machine wants gas contact and there is none
    g.beginPath();
    g.arc(c, c, u * 1.5, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.4;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * u * 0.4, c + Math.sin(a) * u * 0.4);
      g.lineTo(c + Math.cos(a) * u * 1.5, c + Math.sin(a) * u * 1.5);
      g.stroke();
    }
  } else if (spec.shape === 'single') {
    // one, and only one, on this rock
    g.beginPath();
    g.arc(c, c, u * 1.5, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(c, c, u * 0.55, 0, Math.PI * 2);
    g.fill();
  } else if (spec.shape === 'broken') {
    // a survey that no longer joins up
    for (const dx of [-1, 1]) {
      g.beginPath();
      g.moveTo(c + dx * u * 0.5, c);
      g.lineTo(c + dx * u * 1.7, c);
      g.stroke();
    }
  } else {
    g.fillRect(c - u * 1.6, c - u * 0.35, u * 3.2, u * 0.7);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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

// Atlas materials belong to the loader blueprint and are shared by every instantiated rover.
// Any authored mesh whose material changes at runtime must receive an instance-owned clone first,
// otherwise a lamp or cutter update repaints the hull, glass, and every other atlas consumer.
export function isolateWorksMeshMaterials(meshes, instanceOwned = []) {
  const isolated = [];
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    const source = Array.isArray(mesh.material)
      ? mesh.material
      : (mesh.material ? [mesh.material] : []);
    if (!source.length) continue;
    const clones = [];
    for (let m = 0; m < source.length; m++) {
      const material = source[m];
      if (!material || typeof material.clone !== 'function') continue;
      const clone = material.clone();
      clones.push(clone);
      isolated.push(clone);
      instanceOwned.push(clone);
    }
    if (!clones.length) continue;
    mesh.material = Array.isArray(mesh.material) ? clones : clones[0];
  }
  return isolated;
}

export function bindAuthoredDerrick(group) {
  if (!group || typeof group.traverse !== 'function') {
    throw new TypeError('[asteroidRenderer3d] authored Derrick group is required');
  }
  const hooks = group.userData.worksHooks || {};
  for (const name of DERRICK_HOOKS) {
    if (!hooks[name]) throw new Error(`[asteroidRenderer3d] authored Derrick is missing ${name}`);
  }

  const lampMeshes = [];
  group.traverse((obj) => {
    if (obj.isMesh && /^LOD[012]_lamp_[LR]_lens$/.test(obj.name || '')) lampMeshes.push(obj);
  });
  const instanceOwned = [];
  const lampMats = isolateWorksMeshMaterials(lampMeshes, instanceOwned);
  recordWorksInstanceResources(group, instanceOwned);
  const drumBaseZ = hooks.drum_spin.rotation.z;

  return {
    group,
    pulses: [],
    authored: true,
    source: group,
    dyn: {
      drum: hooks.drum_spin,
      cableAnchor: hooks.cable_anchor,
      lamps: [hooks.lamp_L, hooks.lamp_R],
      lampMats,
      setDrumSpin(theta) { hooks.drum_spin.rotation.z = drumBaseZ + theta; },
    },
  };
}

// PQ-131.03 — bind the accepted Extractor without mutating the lease's shared blueprint. The
// machine is authored Z-up, exported Y-up, then seated into this renderer's XY cut plane exactly
// like the accepted rover. Functional meshes are reparented by worksPartLoader before this seam:
// the cutting head reciprocates from head_face, the belt scrolls on an instance-owned sampler, and
// the status lens changes without repainting the frame's shared atlas material.
export function bindAuthoredExtractor(group) {
  if (!group || typeof group.traverse !== 'function') {
    throw new TypeError('[asteroidRenderer3d] authored Extractor group is required');
  }
  const hooks = group.userData.worksHooks || {};
  for (const name of EXTRACTOR_HOOKS) {
    if (!hooks[name]) throw new Error(`[asteroidRenderer3d] authored Extractor is missing ${name}`);
  }

  const seat = new THREE.Group();
  seat.name = 'extractor_seat';
  seat.rotation.x = Math.PI / 2;
  seat.add(group);

  const beltMeshes = [];
  const lampMeshes = [];
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    if (/^LOD[012]_belt$/.test(obj.name || '')) beltMeshes.push(obj);
    if (/^LOD[012]_lamp_lens$/.test(obj.name || '')) lampMeshes.push(obj);
  });

  const instanceOwned = [];
  const beltMats = isolateWorksMeshMaterials(beltMeshes, instanceOwned);
  const lampMats = isolateWorksMeshMaterials(lampMeshes, instanceOwned);
  const beltPhaseMaps = [];
  const textureKeys = ['map', 'normalMap', 'aoMap', 'metalnessMap', 'roughnessMap', 'emissiveMap'];
  for (let i = 0; i < beltMats.length; i++) {
    const material = beltMats[i];
    for (let t = 0; t < textureKeys.length; t++) {
      const key = textureKeys[t];
      const source = material[key];
      if (!source || typeof source.clone !== 'function') continue;
      const sampler = source.clone();
      sampler.wrapS = THREE.RepeatWrapping;
      sampler.wrapT = THREE.RepeatWrapping;
      material[key] = sampler;
      beltPhaseMaps.push(sampler);
      instanceOwned.push(sampler);
    }
  }

  const fallbackLamp = new THREE.MeshStandardMaterial({ color: 0x1c1812 });
  fallbackLamp.emissive.setHex(0x000000);
  fallbackLamp.emissiveIntensity = 0;
  instanceOwned.push(fallbackLamp);
  recordWorksInstanceResources(group, instanceOwned);

  return {
    group: seat,
    pulses: [],
    authored: true,
    source: group,
    dyn: {
      piston: hooks.head_face,
      pistonBase: hooks.head_face.position.x,
      belt: hooks.belt,
      lamp: lampMats[0] || fallbackLamp,
      lampMats: lampMats.length ? lampMats : [fallbackLamp],
      lampAnchor: hooks.lamp,
      setBeltPhase(phase, active = true) {
        if (!active) return;
        const offset = phase - Math.floor(phase);
        for (let i = 0; i < beltPhaseMaps.length; i++) {
          beltPhaseMaps[i].offset.x = offset;
          beltPhaseMaps[i].needsUpdate = true;
        }
      },
    },
  };
}

// PQ-131.02 — bind the accepted square-flange Massline Core. The source is Y-up after glTF
// export, so its ring_spin hook turns around local Y before the seat maps that axis onto the
// Works cut plane's +Z normal. Only the recessed lamp meshes get instance materials; the atlas
// shared by the wellhead and rotating ring remains immutable across placements.
export function bindAuthoredMasslineCore(group) {
  if (!group || typeof group.traverse !== 'function') {
    throw new TypeError('[asteroidRenderer3d] authored Massline Core group is required');
  }
  const hooks = group.userData.worksHooks || {};
  for (const name of MASSLINE_CORE_HOOKS) {
    if (!hooks[name]) throw new Error(`[asteroidRenderer3d] authored Massline Core is missing ${name}`);
  }

  const seat = new THREE.Group();
  seat.name = 'massline_core_seat';
  seat.rotation.x = Math.PI / 2;
  seat.add(group);

  const lampMeshes = [];
  group.traverse((obj) => {
    if (obj.isMesh && /^LOD[012]_massline_core_lamp$/.test(obj.name || '')) lampMeshes.push(obj);
  });
  const instanceOwned = [];
  const lampMats = isolateWorksMeshMaterials(lampMeshes, instanceOwned);
  const fallbackLamp = new THREE.MeshStandardMaterial({ color: 0x1c1812 });
  fallbackLamp.emissive.setHex(0x000000);
  fallbackLamp.emissiveIntensity = 0;
  instanceOwned.push(fallbackLamp);
  recordWorksInstanceResources(group, instanceOwned);
  const ringBaseY = hooks.ring_spin.rotation.y;

  return {
    group: seat,
    pulses: [],
    authored: true,
    source: group,
    dyn: {
      ring: hooks.ring_spin,
      setOrbitTheta(theta) { hooks.ring_spin.rotation.y = ringBaseY + theta; },
      lamp: lampMats[0] || fallbackLamp,
      lampMats: lampMats.length ? lampMats : [fallbackLamp],
      lampAnchor: hooks.lamp,
    },
  };
}

// PQ-131.04 — bind the accepted furnace-stack-tank Refinery. Beauty export keeps the charging-well
// lens dark; the live route drives that isolated slit 0-1 while the status lamp is the only other
// instance material. stack_vent stays an authored empty at the flue outlet. The atlas on the
// jacket/stack/tank is shared and never cloned.
const REFINERY_FURNACE_EMISSIVE = new THREE.Color(1, 0.45, 0.12);

export function bindAuthoredRefinery(group) {
  if (!group || typeof group.traverse !== 'function') {
    throw new TypeError('[asteroidRenderer3d] authored Refinery group is required');
  }
  const hooks = group.userData.worksHooks || {};
  for (const name of REFINERY_HOOKS) {
    if (!hooks[name]) throw new Error(`[asteroidRenderer3d] authored Refinery is missing ${name}`);
  }

  const seat = new THREE.Group();
  seat.name = 'refinery_seat';
  seat.rotation.x = Math.PI / 2;
  seat.add(group);

  const furnaceMeshes = [];
  const lampMeshes = [];
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    if (/^LOD[012]_furnace_slit$/.test(obj.name || '')) furnaceMeshes.push(obj);
    if (/^LOD[012]_lamp_lens$/.test(obj.name || '')) lampMeshes.push(obj);
  });
  const instanceOwned = [];
  const furnaceMats = isolateWorksMeshMaterials(furnaceMeshes, instanceOwned);
  const lampMats = isolateWorksMeshMaterials(lampMeshes, instanceOwned);
  for (let i = 0; i < furnaceMats.length; i++) {
    furnaceMats[i].emissive.copy(REFINERY_FURNACE_EMISSIVE);
    furnaceMats[i].emissiveIntensity = 0.08;
  }
  const fallbackLamp = new THREE.MeshStandardMaterial({ color: 0x1c1812 });
  fallbackLamp.emissive.setHex(0x000000);
  fallbackLamp.emissiveIntensity = 0;
  instanceOwned.push(fallbackLamp);
  const fallbackFurnace = new THREE.MeshStandardMaterial({ color: 0x160c05 });
  fallbackFurnace.emissive.copy(REFINERY_FURNACE_EMISSIVE);
  fallbackFurnace.emissiveIntensity = 0.08;
  instanceOwned.push(fallbackFurnace);
  recordWorksInstanceResources(group, instanceOwned);
  const furnaceOwned = furnaceMats.length ? furnaceMats : [fallbackFurnace];

  return {
    group: seat,
    pulses: [],
    authored: true,
    source: group,
    dyn: {
      furnace: furnaceOwned[0],
      furnaceMats: furnaceOwned,
      setFurnaceIntensity(intensity) {
        const value = Number.isFinite(intensity) ? intensity : 0.08;
        for (let i = 0; i < furnaceOwned.length; i++) furnaceOwned[i].emissiveIntensity = value;
      },
      furnaceAnchor: hooks.furnace_slit,
      stackVent: hooks.stack_vent,
      lamp: lampMats[0] || fallbackLamp,
      lampMats: lampMats.length ? lampMats : [fallbackLamp],
      lampAnchor: hooks.lamp,
    },
  };
}

// PQ-131.08 — bind the accepted open-H Fabricator. The source's gantry_head is authored at
// progress 0 and travels 1.4 m along local +X; keeping that motion on the authored pivot makes the
// visible mechanism itself the progress read. Lamp materials are instance-owned so status changes
// cannot repaint the frame or another placement that shares the package blueprint.
export function bindAuthoredFabricator(group) {
  if (!group || typeof group.traverse !== 'function') {
    throw new TypeError('[asteroidRenderer3d] authored Fabricator group is required');
  }
  const hooks = group.userData.worksHooks || {};
  for (const name of FABRICATOR_HOOKS) {
    if (!hooks[name]) throw new Error(`[asteroidRenderer3d] authored Fabricator is missing ${name}`);
  }

  const seat = new THREE.Group();
  seat.name = 'fabricator_seat';
  seat.rotation.x = Math.PI / 2;
  seat.add(group);

  const lampMeshes = [];
  group.traverse((obj) => {
    if (obj.isMesh && /^LOD[012]_Lamp$/.test(obj.name || '')) lampMeshes.push(obj);
  });
  const instanceOwned = [];
  const lampMats = isolateWorksMeshMaterials(lampMeshes, instanceOwned);
  const fallbackLamp = new THREE.MeshStandardMaterial({ color: 0x1c1812 });
  fallbackLamp.emissive.setHex(0x000000);
  fallbackLamp.emissiveIntensity = 0;
  instanceOwned.push(fallbackLamp);
  recordWorksInstanceResources(group, instanceOwned);
  const travel = hooks.gantry_head.userData && hooks.gantry_head.userData.travel;
  const axis = travel && travel.axis;
  const progress0 = travel && travel.progress0;
  if (!travel || !Array.isArray(axis) || axis.length !== 3
      || Math.abs(axis[0] - 1) > 1e-6 || Math.abs(axis[1]) > 1e-6 || Math.abs(axis[2]) > 1e-6
      || !Array.isArray(progress0) || progress0.length !== 3
      || !Number.isFinite(progress0[0]) || !Number.isFinite(travel.length) || travel.length <= 0) {
    throw new Error('[asteroidRenderer3d] authored Fabricator has an invalid gantry_head travel contract');
  }
  const progressBase = progress0[0];
  const progressTravel = travel.length;

  return {
    group: seat,
    pulses: [],
    authored: true,
    source: group,
    dyn: {
      progressBar: hooks.gantry_head,
      progressBase,
      progressTravel,
      setProgress(progress) {
        const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
        hooks.gantry_head.position.x = progressBase + progressTravel * p;
      },
      lamp: lampMats[0] || fallbackLamp,
      lampMats: lampMats.length ? lampMats : [fallbackLamp],
      lampAnchor: hooks.lamp,
    },
  };
}

// PQ-131.09 — bind the accepted keyed-well Cargo Port. crate_0..4 are cumulative freight
// planforms on the +X apron; pod_root translates along glTF +Y (Blender +Z) from the seated
// well pose to the 1.55 wu launch-clear pose. Only pod, crate, and thruster materials are
// instance-owned; the port/cradle atlas stays shared.
export function bindAuthoredCargoPort(group) {
  if (!group || typeof group.traverse !== 'function') {
    throw new TypeError('[asteroidRenderer3d] authored Cargo Port group is required');
  }
  const hooks = group.userData.worksHooks || {};
  for (const name of CARGO_PORT_HOOKS) {
    if (!hooks[name]) throw new Error(`[asteroidRenderer3d] authored Cargo Port is missing ${name}`);
  }

  const seat = new THREE.Group();
  seat.name = 'cargo_port_seat';
  seat.rotation.x = Math.PI / 2;
  seat.add(group);

  const crateMeshes = [];
  const podMeshes = [];
  const thrusterMeshes = [];
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    const stem = String(obj.name || '').replace(/^LOD[012]_/, '');
    if (/^crate_[0-4]$/.test(stem)) crateMeshes.push(obj);
    else if (stem === 'pod') podMeshes.push(obj);
    else if (stem === 'pod_thruster') thrusterMeshes.push(obj);
  });

  const instanceOwned = [];
  isolateWorksMeshMaterials(crateMeshes, instanceOwned);
  isolateWorksMeshMaterials(podMeshes, instanceOwned);
  const lampMats = isolateWorksMeshMaterials(thrusterMeshes, instanceOwned);
  const fallbackLamp = new THREE.MeshStandardMaterial({ color: 0x1c1812 });
  fallbackLamp.emissive.setHex(0x000000);
  fallbackLamp.emissiveIntensity = 0;
  instanceOwned.push(fallbackLamp);
  recordWorksInstanceResources(group, instanceOwned);

  const crates = [];
  for (let i = 0; i < 5; i++) crates.push(hooks[`crate_${i}`]);
  const podBaseY = hooks.pod_root.position.y;
  let crateStage = 0;
  let podLaunch = 0;

  function setCrateStage(stage) {
    const n = Number.isFinite(stage) ? Math.max(0, Math.min(5, stage | 0)) : 0;
    crateStage = n;
    for (let i = 0; i < crates.length; i++) crates[i].visible = i < n;
  }
  setCrateStage(0);

  return {
    group: seat,
    pulses: [],
    authored: true,
    source: group,
    dyn: {
      crates,
      cradle: hooks.cradle,
      pod: hooks.pod_root,
      podThruster: hooks.pod_thruster,
      podBaseY,
      podTravel: CARGO_PORT_LAUNCH_CLEAR_WU,
      setCrateStage,
      crateStage() { return crateStage; },
      setPodLaunch(amount) {
        const p = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
        podLaunch = p;
        hooks.pod_root.position.y = podBaseY + CARGO_PORT_LAUNCH_CLEAR_WU * p;
      },
      podLaunch() { return podLaunch; },
      setPodVisible(visible) {
        hooks.pod_root.visible = !!visible;
      },
      lamp: lampMats[0] || fallbackLamp,
      lampMats: lampMats.length ? lampMats : [fallbackLamp],
      lampAnchor: hooks.pod_thruster,
    },
  };
}

// PQ-131.07 — bind the accepted wall-manifold Gas Tap. The source is biased to the +X wall with
// the lance occupying the neighbouring pocket. facing.rotation.z maps that authored +X onto the
// live gas contact. Handwheel and gauge needle turn about glTF +Y (Blender +Z stem / face
// normal). Only the hooded lamp is instance-owned; the manifold atlas stays shared.
export const GAS_TAP_NEEDLE_SWEEP = -2.1;
export const GAS_TAP_GENMW_FULL = CONTACT_YIELD.gasPowerPerContact * 2;
export const GAS_TAP_FEED_FULL = CONTACT_YIELD.gasFeedPerMinPerContact * 2;

export function resolveGasTapWallYaw(field, col, row, cols = COLS, rows = ROWS) {
  const cardinals = [
    { dc: 1, dr: 0, yaw: 0 },
    { dc: 0, dr: -1, yaw: Math.PI / 2 },
    { dc: -1, dr: 0, yaw: Math.PI },
    { dc: 0, dr: 1, yaw: -Math.PI / 2 },
  ];
  for (let i = 0; i < cardinals.length; i++) {
    const c = cardinals[i];
    const cc = col + c.dc;
    const rr = row + c.dr;
    const tile = (cc >= 0 && cc < cols && rr >= 0 && rr < rows && field && field[cc])
      ? field[cc][rr]
      : null;
    if (contactKind(tile) === 'gas') return c.yaw;
  }
  const diagonals = [
    { dc: 1, dr: -1, yaw: 0 },
    { dc: 1, dr: 1, yaw: 0 },
    { dc: -1, dr: -1, yaw: Math.PI },
    { dc: -1, dr: 1, yaw: Math.PI },
  ];
  for (let i = 0; i < diagonals.length; i++) {
    const d = diagonals[i];
    const cc = col + d.dc;
    const rr = row + d.dr;
    const tile = (cc >= 0 && cc < cols && rr >= 0 && rr < rows && field && field[cc])
      ? field[cc][rr]
      : null;
    if (contactKind(tile) === 'gas') return d.yaw;
  }
  return 0;
}

export function gasTapNeedleAmount(status) {
  const state = (status && status.state) || 'idle';
  const running = state === 'running' || state === 'throttled' || state === 'limited';
  if (!running) return 0;
  const gen = status && Number.isFinite(status.genMW) ? Math.max(0, status.genMW) : 0;
  if (gen > 0) return Math.max(0, Math.min(1, gen / GAS_TAP_GENMW_FULL));
  const feed = status && status.ratePerMin && Number.isFinite(status.ratePerMin.cmdty_gas_hydrogen)
    ? Math.max(0, status.ratePerMin.cmdty_gas_hydrogen)
    : 0;
  if (feed > 0) return Math.max(0, Math.min(1, feed / GAS_TAP_FEED_FULL));
  return 0;
}

export function bindAuthoredGasTap(group) {
  if (!group || typeof group.traverse !== 'function') {
    throw new TypeError('[asteroidRenderer3d] authored Gas Tap group is required');
  }
  const hooks = group.userData.worksHooks || {};
  for (const name of GAS_TAP_HOOKS) {
    if (!hooks[name]) throw new Error(`[asteroidRenderer3d] authored Gas Tap is missing ${name}`);
  }

  const facing = new THREE.Group();
  facing.name = 'gas_tap_facing';
  const seat = new THREE.Group();
  seat.name = 'gas_tap_seat';
  seat.rotation.x = Math.PI / 2;
  seat.add(group);
  facing.add(seat);

  const lampMeshes = [];
  group.traverse((obj) => {
    if (obj.isMesh && /^LOD[012]_lamp$/.test(obj.name || '')) lampMeshes.push(obj);
  });
  const instanceOwned = [];
  const lampMats = isolateWorksMeshMaterials(lampMeshes, instanceOwned);
  const fallbackLamp = new THREE.MeshStandardMaterial({ color: 0x1c1812 });
  fallbackLamp.emissive.setHex(0x000000);
  fallbackLamp.emissiveIntensity = 0;
  instanceOwned.push(fallbackLamp);
  recordWorksInstanceResources(group, instanceOwned);
  const wheelBaseY = hooks.valve_wheel.rotation.y;
  const needleBaseY = hooks.gauge_needle.rotation.y;

  return {
    group: facing,
    pulses: [],
    authored: true,
    source: group,
    dyn: {
      wheel: hooks.valve_wheel,
      needle: hooks.gauge_needle,
      wheelBaseY,
      needleBaseY,
      setWallYaw(yaw) {
        facing.rotation.z = Number.isFinite(yaw) ? yaw : 0;
      },
      wallYaw() { return facing.rotation.z; },
      setWheelSpin(theta) {
        hooks.valve_wheel.rotation.y = wheelBaseY + (Number.isFinite(theta) ? theta : 0);
      },
      setNeedleAmount(amount) {
        const p = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
        hooks.gauge_needle.rotation.y = needleBaseY + GAS_TAP_NEEDLE_SWEEP * p;
      },
      lamp: lampMats[0] || fallbackLamp,
      lampMats: lampMats.length ? lampMats : [fallbackLamp],
      lampAnchor: hooks.lamp,
    },
  };
}

export function presentAuthoredGasTapGhost(source) {
  if (!source || typeof source.traverse !== 'function') return 0;
  source.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false;
    obj.renderOrder = 24;
  });
  return countDrawnWorksMeshes(source);
}

// PQ-131.09 / PQ-131.07 — one authored/fallback transaction. Success never constructs the
// procedural stand-in. Failure builds exactly one fallback. Authored and fallback are never
// both standing. Late arrivals after a newer generation or teardown are released once.
function createWorksAuthoredMountLifecycle(label, {
  load,
  prepare,
  mount,
  unmount,
  release,
  buildFallback,
  disposeFallback,
  isClosed = () => false,
} = {}) {
  for (const [name, fn] of Object.entries({
    load, prepare, mount, unmount, release, buildFallback, disposeFallback,
  })) {
    if (typeof fn !== 'function') {
      throw new TypeError(`[${label}] ${name} must be a function`);
    }
  }

  let generation = 0;
  let current = null;
  let fallback = null;
  let state = Object.freeze({
    generation,
    phase: 'empty',
    authored: false,
    fallback: false,
    failure: null,
  });

  const publish = (next) => {
    state = Object.freeze({
      generation,
      phase: next.phase,
      authored: next.authored,
      fallback: next.fallback,
      failure: next.failure || null,
    });
    return state;
  };

  const releaseRecord = (record) => {
    if (!record || record.released) return false;
    record.released = true;
    if (record.mounted) {
      record.mounted = false;
      unmount(record);
    }
    if (record.source) release(record.source, record);
    return true;
  };

  const retireVisible = () => {
    if (current) {
      releaseRecord(current);
      current = null;
    }
    if (fallback !== null) {
      disposeFallback(fallback);
      fallback = null;
    }
  };

  const cancelled = (attemptGeneration) => (
    attemptGeneration !== generation || isClosed()
  );

  async function rebuild() {
    generation += 1;
    const attemptGeneration = generation;
    retireVisible();
    publish({ phase: 'loading', authored: false, fallback: false, failure: null });

    const abort = () => ({ status: 'cancelled', state });
    const fail = (reason) => {
      if (cancelled(attemptGeneration)) return { status: 'cancelled', state };
      fallback = buildFallback(reason);
      publish({
        phase: 'fallback',
        authored: false,
        fallback: true,
        failure: reason,
      });
      return { status: 'fallback', state };
    };

    let source = null;
    try {
      source = await load();
    } catch (error) {
      return fail(error && error.message ? error.message : String(error));
    }
    if (cancelled(attemptGeneration)) {
      if (source) releaseRecord({ source, released: false, mounted: false });
      return abort();
    }
    if (!source) return fail('authored load returned no part');

    let prepared = null;
    try {
      prepared = prepare(source);
    } catch (error) {
      releaseRecord({ source, released: false, mounted: false });
      return fail(error && error.message ? error.message : String(error));
    }
    if (cancelled(attemptGeneration)) {
      releaseRecord({ source, released: false, mounted: false });
      return abort();
    }
    if (!prepared) {
      releaseRecord({ source, released: false, mounted: false });
      return fail('authored part preparation failed');
    }

    const record = {
      ...prepared,
      source,
      released: false,
      mounted: false,
    };
    try {
      mount(record);
      record.mounted = true;
    } catch (error) {
      releaseRecord(record);
      return fail(error && error.message ? error.message : String(error));
    }
    if (cancelled(attemptGeneration)) {
      releaseRecord(record);
      return abort();
    }

    current = record;
    publish({ phase: 'authored', authored: true, fallback: false, failure: null });
    return { status: 'authored', state };
  }

  function cancel(reason = 'cancelled') {
    generation += 1;
    retireVisible();
    publish({
      phase: reason === 'disposed' ? 'disposed' : 'empty',
      authored: false,
      fallback: false,
      failure: null,
    });
  }

  return Object.freeze({
    rebuild,
    cancel,
    stats: () => state,
  });
}

export function createCargoPortMountLifecycle(opts) {
  return createWorksAuthoredMountLifecycle('cargoPortMount', opts);
}

export function createGasTapMountLifecycle(opts) {
  return createWorksAuthoredMountLifecycle('gasTapMount', opts);
}

// Courier climb on the authored Cargo Port. Rise is the 1.55 wu collar-clear, then the pose holds
// long enough to read (and to capture) before the pod leaves. The old board-plane yellow capsule
// is a different object and must not stand next to this one.
export const CARGO_POD_RISE_S = 1.7;
export const CARGO_POD_CLEAR_HOLD_S = 1.25;

export function createCargoPodLaunchClock({
  riseS = CARGO_POD_RISE_S,
  holdS = CARGO_POD_CLEAR_HOLD_S,
} = {}) {
  let phase = 'idle';
  let elapsed = 0;

  const sample = () => {
    if (phase === 'rising') {
      const span = riseS > 0 ? riseS : CARGO_POD_RISE_S;
      return {
        phase,
        pose: Math.max(0, Math.min(1, elapsed / span)),
        visible: true,
      };
    }
    if (phase === 'holding') {
      return { phase, pose: 1, visible: true };
    }
    return { phase: 'idle', pose: 0, visible: false };
  };

  return Object.freeze({
    notifyLaunch() {
      phase = 'rising';
      elapsed = 0;
      return sample();
    },
    reset() {
      phase = 'idle';
      elapsed = 0;
      return sample();
    },
    step(dt, { motionReduce = false } = {}) {
      let remaining = Math.max(0, Number(dt) || 0);
      if (phase === 'rising' && motionReduce) {
        phase = 'holding';
        elapsed = 0;
      }
      while (remaining > 0 && phase !== 'idle') {
        if (phase === 'rising') {
          const left = Math.max(0, riseS - elapsed);
          if (remaining >= left) {
            remaining -= left;
            phase = 'holding';
            elapsed = 0;
          } else {
            elapsed += remaining;
            remaining = 0;
          }
        } else if (phase === 'holding') {
          const left = Math.max(0, holdS - elapsed);
          if (remaining >= left) {
            remaining -= left;
            phase = 'idle';
            elapsed = 0;
          } else {
            elapsed += remaining;
            remaining = 0;
          }
        } else {
          break;
        }
      }
      return sample();
    },
    sample,
  });
}

export function countDrawnWorksMeshes(root) {
  let n = 0;
  if (!root) return 0;
  root.traverse((obj) => {
    if (!obj.isMesh || obj.visible === false) return;
    let parent = obj.parent;
    while (parent) {
      if (parent.visible === false) return;
      parent = parent.parent;
    }
    n += 1;
  });
  return n;
}

// Placement ghost is the empty port: crates off, pod seated in the well. LOD tags stay in charge
// of which hull is drawn.
export function presentAuthoredCargoPortGhost(source) {
  if (!source || typeof source.traverse !== 'function') return 0;
  const hooks = source.userData.worksHooks || {};
  for (let i = 0; i < 5; i++) {
    const crate = hooks[`crate_${i}`];
    if (crate) crate.visible = false;
  }
  if (hooks.pod_root) hooks.pod_root.visible = true;
  source.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false;
    obj.renderOrder = 24;
  });
  return countDrawnWorksMeshes(source);
}

export function shouldDrawProceduralCourierPod(authoredCargoMounted) {
  return !authoredCargoMounted;
}

// PQ-131.06 — authored Conduit transaction, kept pure so its async lifecycle is testable without
// a canvas or WebGL context. A successful transaction never asks for the procedural network at all.
// The fallback is an error path, not a hidden second renderer sitting behind accepted authored art.
//
// Each rebuild invalidates the prior generation. Late arrivals are released exactly once and may
// not install a stale fallback. The callbacks deliberately own scene/loader details; this controller
// owns only the all-or-fallback commit and its truthful diagnostics.
export function createConduitMountLifecycle({
  load,
  prepare,
  mount,
  unmount,
  release,
  buildFallback,
  disposeFallback,
  isClosed = () => false,
} = {}) {
  for (const [name, fn] of Object.entries({
    load, prepare, mount, unmount, release, buildFallback, disposeFallback,
  })) {
    if (typeof fn !== 'function') {
      throw new TypeError(`[conduitMount] ${name} must be a function`);
    }
  }

  let generation = 0;
  let current = [];
  let fallback = null;
  let state = Object.freeze({
    generation,
    phase: 'empty',
    desiredCount: 0,
    authoredCount: 0,
    fallback: false,
    failure: null,
  });

  const publish = (next) => {
    state = Object.freeze({
      generation,
      phase: next.phase,
      desiredCount: next.desiredCount,
      authoredCount: next.authoredCount,
      fallback: next.fallback,
      failure: next.failure || null,
    });
    return state;
  };

  const releaseRecord = (record) => {
    if (!record || record.released) return false;
    record.released = true;
    if (record.mounted) {
      record.mounted = false;
      unmount(record);
    }
    release(record.source, record);
    return true;
  };

  const releaseRecords = (records) => {
    for (let i = records.length - 1; i >= 0; i--) releaseRecord(records[i]);
    records.length = 0;
  };

  const retireVisible = () => {
    releaseRecords(current);
    if (fallback !== null) {
      disposeFallback(fallback);
      fallback = null;
    }
  };

  const cancelled = (attemptGeneration) => (
    attemptGeneration !== generation || isClosed()
  );

  async function rebuild(desiredInput) {
    const desired = Array.isArray(desiredInput) ? desiredInput.slice() : [];
    generation += 1;
    const attemptGeneration = generation;
    retireVisible();
    publish({
      phase: desired.length ? 'loading' : 'empty',
      desiredCount: desired.length,
      authoredCount: 0,
      fallback: false,
      failure: null,
    });
    if (!desired.length) return { status: 'empty', state };

    const staged = [];
    const abort = () => {
      releaseRecords(staged);
      return { status: 'cancelled', state };
    };
    const fail = (reason) => {
      releaseRecords(staged);
      if (cancelled(attemptGeneration)) return { status: 'cancelled', state };
      fallback = buildFallback(desired, reason);
      publish({
        phase: 'fallback',
        desiredCount: desired.length,
        authoredCount: 0,
        fallback: true,
        failure: reason,
      });
      return { status: 'fallback', state };
    };

    for (let i = 0; i < desired.length; i++) {
      if (cancelled(attemptGeneration)) return abort();
      let source = null;
      try {
        source = await load(desired[i], i);
      } catch (error) {
        return fail(error && error.message ? error.message : String(error));
      }
      if (cancelled(attemptGeneration)) {
        if (source) releaseRecord({ source, desired: desired[i], released: false, mounted: false });
        return abort();
      }
      if (!source) return fail(`authored load returned no part at index ${i}`);

      let prepared = null;
      try {
        prepared = prepare(source, desired[i], i);
      } catch (error) {
        releaseRecord({ source, desired: desired[i], released: false, mounted: false });
        return fail(error && error.message ? error.message : String(error));
      }
      if (!prepared) {
        releaseRecord({ source, desired: desired[i], released: false, mounted: false });
        return fail(`authored part preparation failed at index ${i}`);
      }
      staged.push({
        ...prepared,
        source,
        desired: desired[i],
        released: false,
        mounted: false,
      });
    }

    if (cancelled(attemptGeneration)) return abort();
    try {
      for (let i = 0; i < staged.length; i++) {
        staged[i].mounted = true;
        mount(staged[i], i);
      }
    } catch (error) {
      return fail(error && error.message ? error.message : String(error));
    }
    if (cancelled(attemptGeneration)) return abort();

    current = staged.splice(0);
    publish({
      phase: 'authored',
      desiredCount: desired.length,
      authoredCount: current.length,
      fallback: false,
      failure: null,
    });
    return { status: 'authored', state };
  }

  function cancel(reason = 'cancelled') {
    generation += 1;
    retireVisible();
    publish({
      phase: reason === 'disposed' ? 'disposed' : 'empty',
      desiredCount: 0,
      authoredCount: 0,
      fallback: false,
      failure: null,
    });
  }

  return Object.freeze({
    rebuild,
    cancel,
    stats: () => state,
  });
}

// The swap seam is deliberately Derrick-scoped. Keeping it pure lets the focused test put a rover,
// a machine, and unrelated scene dressing beside the old mount and prove none of them are replaced.
export function replaceDerrickInScene(scene, current, next, position) {
  if (!scene || typeof scene.add !== 'function') {
    throw new TypeError('[asteroidRenderer3d] a scene is required for the Derrick swap');
  }
  if (!next || !next.group) {
    throw new TypeError('[asteroidRenderer3d] an authored Derrick binding is required');
  }
  if (current && current !== next && current.group && current.group.parent) {
    current.group.parent.remove(current.group);
  }
  if (position) next.group.position.copy(position);
  if (next.group.parent !== scene) scene.add(next.group);
  next.group.visible = true;
  return next;
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
  const worksPresentationBackground = scene.background;
  const worksPresentationEnvironment = scene.environment;

  let disposed = false;   // guards async surface arrival against a screen that already left
  let worksTearingDown = false;

  // PQ-131.00 — authored-part lease bound to THIS renderer. Created on demand when the
  // proof is armed; a normal player session never constructs it.
  let worksLoader = null;
  let worksProofGroup = null;
  let worksProofGen = 0;
  let worksProofWanted = false;
  let worksProofArmed = false;
  let worksHostWasVisible = false;
  let worksHostObs = null;
  let worksRetirePromise = null;
  let worksRetireToken = null;
  let worksRetireGen = 0;
  let glTeardownDone = false;
  const worksBox = new THREE.Box3();
  const worksBoxTmp = new THREE.Box3();
  const worksSize = new THREE.Vector3();
  const worksCenter = new THREE.Vector3();
  const worksCorner = new THREE.Vector3();
  const worksProofTmpColor = new THREE.Color();
  let worksProofMaskMaterial = null;
  let worksProofBlackMat = null;
  let worksProofFlatMat = null;
  let worksProofGhostMat = null;
  let worksProofMaskCovered = new Uint8Array(0);
  let worksProofMaskErode = new Uint8Array(0);
  let worksProofLumaScratch = new Float64Array(0);
  let worksProofSavedMaterials = null;
  function getWorksProofMaskMaterial() {
    if (!worksProofMaskMaterial) {
      worksProofMaskMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        toneMapped: false,
        fog: false,
        side: THREE.DoubleSide,
      });
    }
    return worksProofMaskMaterial;
  }
  function getWorksProofBlackMat() {
    if (!worksProofBlackMat) {
      worksProofBlackMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    }
    return worksProofBlackMat;
  }
  function getWorksProofFlatMat() {
    if (!worksProofFlatMat) {
      worksProofFlatMat = new THREE.MeshBasicMaterial({ color: 0x777777, toneMapped: false });
    }
    return worksProofFlatMat;
  }
  function getWorksProofGhostMat() {
    if (!worksProofGhostMat) {
      worksProofGhostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
    }
    return worksProofGhostMat;
  }
  function restoreWorksProofMaterials() {
    const saved = worksProofSavedMaterials;
    if (!saved) return;
    for (let i = 0; i < saved.length; i++) {
      saved[i].mesh.material = saved[i].material;
    }
    worksProofSavedMaterials = null;
  }
  function snapshotRendererPresentation() {
    renderer.getClearColor(worksProofTmpColor);
    const children = scene.children;
    let visibleChildCount = 0;
    for (let i = 0; i < children.length; i++) {
      if (children[i].visible) visibleChildCount += 1;
    }
    return {
      toneMapping: renderer.toneMapping,
      outputColorSpace: renderer.outputColorSpace,
      clearColor: '#' + worksProofTmpColor.getHexString(),
      clearAlpha: renderer.getClearAlpha(),
      overrideMaterialNull: scene.overrideMaterial === null,
      backgroundIsBaseline: scene.background === worksPresentationBackground,
      environmentIsBaseline: scene.environment === worksPresentationEnvironment,
      autoClear: renderer.autoClear,
      renderTargetNull: renderer.getRenderTarget() === null,
      visibleChildCount,
    };
  }
  function worksProofFlagOn() {
    try {
      if (typeof location === 'undefined') return false;
      const q = new URLSearchParams(location.search);
      return q.get('worksProof') === '1' || q.get('dev') === 'works-proof';
    } catch (_) {
      return false;
    }
  }
  function snapshotRendererInfo() {
    const info = renderer.info;
    const programs = info.programs;
    return {
      memory: {
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      programs: Array.isArray(programs) ? programs.length : (programs && programs.size) || 0,
      render: {
        triangles: info.render.triangles,
        calls: info.render.calls,
      },
    };
  }
  let zoomRegister = 'work';   // 'work' | 'site' — read by ensureWorksLoader below at setup time
  function ensureWorksLoader() {
    if (worksTearingDown || disposed || glTeardownDone) return null;
    if (!worksLoader) {
      worksLoader = createWorksPartLoader({ renderer });
      worksLoader.setRegister(zoomRegister);
    }
    return worksLoader;
  }
  function collectNamedMeshes(root, test) {
    const out = [];
    root.traverse((obj) => {
      if (obj.isMesh && test(obj.name || '')) out.push(obj);
    });
    return out;
  }
  function firstMaterial(meshes) {
    for (let i = 0; i < meshes.length; i++) {
      const mat = meshes[i].material;
      if (mat) return mat;
    }
    return null;
  }
  function bindAuthoredRover(group) {
    const hooks = group.userData.worksHooks || {};
    const seat = new THREE.Group();
    seat.name = 'rover_seat';
    seat.rotation.x = Math.PI / 2;
    seat.add(group);
    const boom = hooks.boom_pivot || new THREE.Object3D();
    const bit = hooks.bit_tip || new THREE.Object3D();
    const lid = hooks.hopper_lid || new THREE.Object3D();
    const lamp = hooks.lamp_socket || new THREE.Object3D();
    const vent = hooks.vent_stack || new THREE.Object3D();
    const fills = [];
    for (let i = 0; i < 5; i++) {
      const hook = hooks[`hopper_fill_${i}`];
      const meshes = collectNamedMeshes(group, (n) => n === `hopper_fill_${i}` || n.endsWith(`_hopper_fill_${i}`));
      if (hook) {
        hook.visible = false;
        fills.push(hook);
      } else if (meshes.length) {
        meshes.forEach((m) => { m.visible = false; });
        fills.push(meshes[0]);
      } else {
        const dummy = new THREE.Object3D();
        dummy.visible = false;
        group.add(dummy);
        fills.push(dummy);
      }
    }
    const trackL = collectNamedMeshes(group, (n) => n === 'track_L' || n.endsWith('_track_L'));
    const trackR = collectNamedMeshes(group, (n) => n === 'track_R' || n.endsWith('_track_R'));
    const trackPhaseMaps = [];
    // Every clone made below belongs to THIS instance, not to the blueprint the lease shares
    // between clones. Hand each one to the loader so releaseWorksPart retires it — a clone the
    // loader never sees survives the group it was made for.
    const instanceOwned = [];
    function prepareTrackScroll(meshes) {
      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i];
        if (!mesh.material) continue;
        const mat = mesh.material.clone();
        mesh.material = mat;
        instanceOwned.push(mat);
        const maps = [mat.map, mat.normalMap, mat.aoMap, mat.metalnessMap, mat.roughnessMap];
        for (let m = 0; m < maps.length; m++) {
          const tex = maps[m];
          if (!tex || trackPhaseMaps.indexOf(tex) >= 0) continue;
          // Shared atlas — clone the sampler so a tread offset cannot drag the hull UVs.
          const clone = tex.clone();
          clone.wrapS = THREE.RepeatWrapping;
          clone.wrapT = THREE.RepeatWrapping;
          if (mat.map === tex) mat.map = clone;
          if (mat.normalMap === tex) mat.normalMap = clone;
          if (mat.aoMap === tex) mat.aoMap = clone;
          if (mat.metalnessMap === tex) mat.metalnessMap = clone;
          if (mat.roughnessMap === tex) mat.roughnessMap = clone;
          trackPhaseMaps.push(clone);
          instanceOwned.push(clone);
        }
      }
    }
    prepareTrackScroll(trackL);
    prepareTrackScroll(trackR);
    // THE CUTTER. The authored part carries one LOD<n>_Bit mesh per LOD, parented under bit_tip;
    // the loader hands them back already bound. Two things have to be true for the bit to read as
    // a working tool: it spins on its own axis (local +X is the cutter's length after the Y-up
    // export), and it is the only thing that heats. The whole vehicle shares ONE atlas material,
    // so heat MUST be driven on a per-mesh clone — writing emissive on the shared material lights
    // the tub, the tracks, the glass and the boom orange every time the drill warms up.
    const cutterMeshes = (group.userData.worksCutterMeshes || []).slice();
    const cutterMats = [];
    for (let i = 0; i < cutterMeshes.length; i++) {
      const mesh = cutterMeshes[i];
      if (!mesh.material || Array.isArray(mesh.material)) continue;
      const mat = mesh.material.clone();
      mesh.material = mat;
      cutterMats.push(mat);
      instanceOwned.push(mat);
    }
    // Cycle 79 still exports its physical lamp and beacon lens as one merged Lamp mesh per LOD.
    // Isolate that atlas region so its steady power state cannot repaint the rover. When a later
    // artifact preserves a separately named BeaconLens, it receives its own clones and strobe;
    // until then there is deliberately no fake independent beacon animation.
    const beaconMeshes = collectNamedMeshes(group, (n) => /BeaconLens|_Beacon\b|Beacon/.test(n));
    const lampMeshes = collectNamedMeshes(
      group,
      (n) => /_Lamp\b|_Lamp$|Lamp/.test(n) && !/_Boom/.test(n) && !/Beacon/.test(n),
    );
    const lampMats = isolateWorksMeshMaterials(lampMeshes, instanceOwned);
    const beaconMats = isolateWorksMeshMaterials(beaconMeshes, instanceOwned);
    const glassMeshes = collectNamedMeshes(group, (n) => /_Glass\b|_Glass$|Glass/.test(n));
    const scarMeshes = collectNamedMeshes(group, (n) => n === 'scar_plate' || n.endsWith('_scar_plate'));
    for (let i = 0; i < scarMeshes.length; i++) scarMeshes[i].visible = false;
    const bitMat = cutterMats[0] || null;
    const glassMat = firstMaterial(glassMeshes);
    const dummyMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
    dummyMat.emissive.setHex(0x000000);
    dummyMat.emissiveIntensity = 0;
    instanceOwned.push(dummyMat);
    recordWorksInstanceResources(group, instanceOwned);
    const ventLocal = vent.position || new THREE.Vector3();
    const dyn = {
      body: seat,
      arm: boom,
      auger: bit,
      augerSlide: boom,
      augerRestX: boom.position.x,
      augerBiteX: 0.22,
      bitMat: bitMat || dummyMat,
      bitMats: cutterMats.length ? cutterMats : null,
      cutters: cutterMeshes,
      hopperStages: fills,
      hopperLid: lid,
      lidOpenX: lid.position.x,
      lidShutX: lid.position.x,
      ventOffset: { x: ventLocal.x / S, y: ventLocal.y / S },
      lampAnchor: lamp,
      lampMat: lampMats[0] || dummyMat,
      lampMats: lampMats.length ? lampMats : null,
      cabGlass: glassMat || dummyMat,
      beacon: beaconMats[0] || dummyMat,
      beaconMats: beaconMats.length ? beaconMats : null,
      wheels: [],
      setTrackPhase(phase) {
        for (let i = 0; i < trackPhaseMaps.length; i++) {
          trackPhaseMaps[i].offset.x = phase;
          trackPhaseMaps[i].needsUpdate = true;
        }
      },
      // Local +X is the cutter's own length. Spinning bit_tip instead would swing the bit around
      // the socket like a rotor: the exported socket sits off the cutter's centreline.
      setBitSpin(theta) {
        for (let i = 0; i < cutterMeshes.length; i++) cutterMeshes[i].rotation.x = theta;
      },
    };
    return {
      group: seat,
      pulses: [],
      dyn,
      authored: true,
      source: group,
      scars: scarMeshes,
      cutters: cutterMeshes,
    };
  }
  function unmountWorksProof({ forget = false } = {}) {
    if (forget) worksProofWanted = false;
    restoreWorksProofMaterials();
    if (!worksProofGroup) return;
    const group = worksProofGroup;
    worksProofGroup = null;
    if (worksLoader) worksLoader.releaseWorksPart(group);
    else if (group.parent) group.parent.remove(group);
  }
  function rendererContextLive() {
    try {
      const gl = renderer.getContext && renderer.getContext();
      if (!gl) return false;
      if (typeof gl.isContextLost === 'function' && gl.isContextLost()) return false;
      return !disposed && !glTeardownDone;
    } catch (_) {
      return false;
    }
  }
  function retireWorksAssets(reason = 'works-screen-exit') {
    if (worksRetirePromise) return worksRetirePromise;
    disposeOverlayParts('disposed');
    unmountWorksProof();
    const loader = worksLoader;
    worksLoader = null;
    const token = { n: ++worksRetireGen, reason };
    const runtimeDone = loader ? loader.dispose(reason) : 0;
    const mine = Promise.resolve(runtimeDone).then(() => {
      // Snapshot after lease.release + authored-runtime retirement, while this
      // WebGLRenderer is still live. Do not wait until after forceContextLoss().
      const info = snapshotRendererInfo();
      info.rendererLive = rendererContextLive();
      info.afterWorksRelease = true;
      canvas.__ast3dDisposeInfo = info;
      return info;
    });
    worksRetireToken = token;
    worksRetirePromise = mine;
    mine.then(
      () => {
        if (worksRetireToken === token) {
          worksRetirePromise = null;
          worksRetireToken = null;
        }
      },
      () => {
        if (worksRetireToken === token) {
          worksRetirePromise = null;
          worksRetireToken = null;
        }
      },
    );
    return mine;
  }
  function inspectWorksColourSpace(group) {
    const rows = [];
    if (!group) return rows;
    group.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        rows.push({
          name: obj.name,
          map: mat.map ? mat.map.colorSpace : null,
          normal: mat.normalMap ? mat.normalMap.colorSpace : null,
          orm: mat.aoMap ? mat.aoMap.colorSpace : null,
        });
      }
    });
    return rows;
  }
  function inspectWorksLod(group) {
    const visible = [];
    const hidden = [];
    if (!group) {
      return {
        visible, hidden, register: zoomRegister,
        nodeLod: null, tags: [], untaggedMeshes: 0,
      };
    }
    group.traverse((obj) => {
      if (!obj.isMesh || !obj.userData.worksLod) return;
      if (obj.visible) visible.push(obj.name);
      else hidden.push(obj.name);
    });
    visible.sort();
    hidden.sort();
    const tags = Array.isArray(group.userData.worksLodTags)
      ? group.userData.worksLodTags.slice()
      : [];
    tags.sort();
    return {
      visible,
      hidden,
      register: zoomRegister,
      nodeLod: group.userData.worksNodeLod || null,
      tags,
      untaggedMeshes: group.userData.worksUntaggedMeshes || 0,
    };
  }
  function measureWorksBox(group, includeHidden) {
    worksBox.makeEmpty();
    group.updateWorldMatrix(true, true);
    group.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      if (!includeHidden && obj.visible === false) return;
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
      if (!obj.geometry.boundingBox) return;
      worksBoxTmp.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
      worksBox.union(worksBoxTmp);
    });
    return worksBox;
  }
  function seatWorksProofGroup(group) {
    group.rotation.set(Math.PI / 2, 0, 0);
    group.scale.set(1, 1, 1);
    group.position.set(0, 0, 0);
    const nativeBox = measureWorksBox(group, true);
    nativeBox.getSize(worksSize);
    const native = {
      min: nativeBox.min.toArray(),
      max: nativeBox.max.toArray(),
      size: worksSize.toArray(),
    };
    const footprint = Math.max(worksSize.x, worksSize.y);
    const target = S * WORKS_PROOF_FOOTPRINT_CELLS;
    const scale = footprint > 1e-4 ? target / footprint : 1;
    group.scale.setScalar(scale);
    const scaled = measureWorksBox(group, true);
    scaled.getCenter(worksCenter);
    group.position.set(
      worldX(WORKS_PROOF_CELL.col) - worksCenter.x,
      worldY(WORKS_PROOF_CELL.row) - worksCenter.y,
      ROCK_FACE - scaled.min.z,
    );
    group.updateMatrixWorld(true);
    return {
      native,
      scale,
      rotation: [group.rotation.x, group.rotation.y, group.rotation.z],
      position: [group.position.x, group.position.y, group.position.z],
      footprintCells: WORKS_PROOF_FOOTPRINT_CELLS,
    };
  }
  function captureScenePass() {
    renderer.info.reset();
    let scenePass = { triangles: 0, calls: 0 };
    const orig = renderer.render;
    let seen = false;
    renderer.render = function worksScenePassProbe(scn, cam) {
      const out = orig.call(this, scn, cam);
      if (!seen && scn === scene) {
        seen = true;
        scenePass = {
          triangles: renderer.info.render.triangles,
          calls: renderer.info.render.calls,
        };
      }
      return out;
    };
    try {
      bloom.render(scene, camera);
    } finally {
      renderer.render = orig;
    }
    return scenePass;
  }
  function projectWorksBox(group) {
    const box = measureWorksBox(group, false);
    if (box.isEmpty()) return null;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let inClip = false;
    const xs = [box.min.x, box.max.x];
    const ys = [box.min.y, box.max.y];
    const zs = [box.min.z, box.max.z];
    for (let ix = 0; ix < 2; ix++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let iz = 0; iz < 2; iz++) {
          worksCorner.set(xs[ix], ys[iy], zs[iz]).project(camera);
          const sx = (worksCorner.x * 0.5 + 0.5) * w;
          const sy = (-worksCorner.y * 0.5 + 0.5) * h;
          minX = Math.min(minX, sx);
          minY = Math.min(minY, sy);
          maxX = Math.max(maxX, sx);
          maxY = Math.max(maxY, sy);
          if (worksCorner.z >= -1 && worksCorner.z <= 1) inClip = true;
        }
      }
    }
    const visLeft = Math.max(0, minX);
    const visTop = Math.max(0, minY);
    const visRight = Math.min(w, maxX);
    const visBottom = Math.min(h, maxY);
    const visW = Math.max(0, visRight - visLeft);
    const visH = Math.max(0, visBottom - visTop);
    const width = maxX - minX;
    const height = maxY - minY;
    return {
      minX, minY, maxX, maxY, width, height,
      visW, visH,
      canvasW: w,
      canvasH: h,
      onScreen: visW > 0 && visH > 0 && inClip,
      areaOnScreen: visW * visH,
    };
  }
  function statsFromPixels(data, width, height) {
    const bg = WORKS_BG;
    let nonBackground = 0;
    let lit = 0;
    let sumLuma = 0;
    let sumLitLuma = 0;
    const pixels = width * height;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const bgDist = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
      if (bgDist < 18) continue;
      nonBackground += 1;
      sumLuma += luma;
      if (luma >= 24) {
        lit += 1;
        sumLitLuma += luma;
      }
    }
    return {
      pixels,
      nonBackground,
      lit,
      meanLuma: nonBackground ? sumLuma / nonBackground : 0,
      meanLitLuma: lit ? sumLitLuma / lit : 0,
    };
  }
  function deltaFromPixels(a, b) {
    const n = Math.min(a.length, b.length);
    let changed = 0;
    let sumAbs = 0;
    let mountedLitChanged = 0;
    let sumMountedLuma = 0;
    for (let i = 0; i < n; i += 4) {
      const dr = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (dr < 24) continue;
      changed += 1;
      sumAbs += dr;
      const luma = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
      sumMountedLuma += luma;
      if (luma >= 24) mountedLitChanged += 1;
    }
    return {
      changed,
      meanAbs: changed ? sumAbs / changed : 0,
      mountedLitChanged,
      meanMountedLuma: changed ? sumMountedLuma / changed : 0,
    };
  }
  function erodeCoverage(src, dst, width, height) {
    let count = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        let on = src[i];
        if (on) {
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) on = 0;
          else if (!src[i - 1] || !src[i + 1] || !src[i - width] || !src[i + width]) on = 0;
        }
        dst[i] = on;
        count += on;
      }
    }
    return count;
  }
  function materialWouldPaint(mat) {
    if (!mat) return false;
    if (mat.visible === false) return false;
    if (mat.colorWrite === false) return false;
    if (mat.transparent === true && mat.opacity <= 0.01) return false;
    return true;
  }
  function meshWouldPaint(mesh) {
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (let i = 0; i < mat.length; i++) {
        if (materialWouldPaint(mat[i])) return true;
      }
      return false;
    }
    return materialWouldPaint(mat);
  }
  function renderWorksProofMask(box) {
    const empty = {
      covered: worksProofMaskCovered.subarray(0, 0),
      coveredCount: 0,
      width: 0,
      height: 0,
      excludedMeshes: [],
    };
    if (!worksProofGroup || !box || box.width <= 0 || box.height <= 0) return empty;

    const prevOverride = scene.overrideMaterial;
    const prevBackground = scene.background;
    const prevAutoClear = renderer.autoClear;
    const prevClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(worksProofTmpColor);
    const prevClearHex = worksProofTmpColor.getHex();
    const prevTone = renderer.toneMapping;
    const prevRT = renderer.getRenderTarget();
    const hid = [];
    const children = scene.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child === worksProofGroup) continue;
      if (child.visible) {
        child.visible = false;
        hid.push(child);
      }
    }
    const swapped = [];
    const hidProof = [];
    const excludedMeshes = [];

    try {
      // Per-mesh white mask on the proof group only. A scene-wide overrideMaterial
      // would admit invisible / colorWrite-off / opacity-0 meshes into the coverage.
      scene.overrideMaterial = null;
      worksProofGroup.traverse((obj) => {
        if (!obj.isMesh) return;
        if (!obj.visible) return;
        if (!meshWouldPaint(obj)) {
          excludedMeshes.push(obj.name || '');
          obj.visible = false;
          hidProof.push(obj);
          return;
        }
        swapped.push({ mesh: obj, material: obj.material });
        obj.material = getWorksProofMaskMaterial();
      });
      excludedMeshes.sort();
      scene.background = null;
      renderer.autoClear = true;
      renderer.setRenderTarget(null);
      renderer.setClearColor(0x000000, 1);
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.clear();
      renderer.render(scene, camera);
      const raw = readProjectedPixels(box);
      const pixels = raw.width * raw.height;
      if (pixels < 1 || !raw.data || raw.data.length < 4) {
        return {
          covered: worksProofMaskCovered.subarray(0, 0),
          coveredCount: 0,
          width: 0,
          height: 0,
          excludedMeshes,
        };
      }
      if (worksProofMaskCovered.length < pixels) {
        worksProofMaskCovered = new Uint8Array(pixels);
      }
      const covered = worksProofMaskCovered;
      let coveredCount = 0;
      const data = raw.data;
      for (let i = 0, p = 0; p < pixels; i += 4, p++) {
        const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        const on = luma >= 8 ? 1 : 0;
        covered[p] = on;
        coveredCount += on;
      }
      // Two 4-connected erodes: drop the AA/bloom ring around every silhouette
      // (outer hull and internal truss edges) so a flat fill cannot inherit
      // neighbour-rock variety. Threshold remains luma ≥ 8; this is interior.
      if (coveredCount > 0) {
        if (worksProofMaskErode.length < pixels) {
          worksProofMaskErode = new Uint8Array(pixels);
        }
        erodeCoverage(covered, worksProofMaskErode, raw.width, raw.height);
        coveredCount = erodeCoverage(worksProofMaskErode, covered, raw.width, raw.height);
      }
      return {
        covered: covered.subarray(0, pixels),
        coveredCount,
        width: raw.width,
        height: raw.height,
        excludedMeshes,
      };
    } finally {
      for (let i = 0; i < swapped.length; i++) {
        swapped[i].mesh.material = swapped[i].material;
      }
      for (let i = 0; i < hidProof.length; i++) hidProof[i].visible = true;
      for (let i = 0; i < hid.length; i++) hid[i].visible = true;
      scene.overrideMaterial = prevOverride;
      scene.background = prevBackground;
      renderer.autoClear = prevAutoClear;
      renderer.setClearColor(prevClearHex, prevClearAlpha);
      renderer.toneMapping = prevTone;
      renderer.setRenderTarget(prevRT);
    }
  }
  function maskedStats(beautyData, mask) {
    const zero = {
      count: 0, meanLuma: 0, medianLuma: 0, stdevLuma: 0,
      meanR: 0, meanG: 0, meanB: 0, p05Luma: 0, p95Luma: 0,
    };
    if (!beautyData || !mask || !mask.covered) return zero;
    const covered = mask.covered;
    const nPix = Math.min(covered.length, Math.floor(beautyData.length / 4));
    if (worksProofLumaScratch.length < nPix) {
      worksProofLumaScratch = new Float64Array(nPix);
    }
    const lumas = worksProofLumaScratch;
    let count = 0;
    let sumL = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let p = 0; p < nPix; p++) {
      if (!covered[p]) continue;
      const i = p * 4;
      const r = beautyData[i];
      const g = beautyData[i + 1];
      const b = beautyData[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumas[count] = luma;
      count += 1;
      sumL += luma;
      sumR += r;
      sumG += g;
      sumB += b;
    }
    if (!count) return zero;
    const view = lumas.subarray(0, count);
    view.sort((a, b) => a - b);
    const meanLuma = sumL / count;
    let varSum = 0;
    for (let i = 0; i < count; i++) {
      const d = view[i] - meanLuma;
      varSum += d * d;
    }
    const mid = count >> 1;
    const medianLuma = (count & 1) ? view[mid] : 0.5 * (view[mid - 1] + view[mid]);
    const p05Luma = view[Math.min(count - 1, Math.floor(0.05 * (count - 1)))];
    const p95Luma = view[Math.min(count - 1, Math.floor(0.95 * (count - 1)))];
    return {
      count,
      meanLuma,
      medianLuma,
      stdevLuma: Math.sqrt(varSum / count),
      meanR: sumR / count,
      meanG: sumG / count,
      meanB: sumB / count,
      p05Luma,
      p95Luma,
    };
  }
  function maskedDelta(mountedData, unmountedData, mask) {
    if (!mountedData || !unmountedData || !mask || !mask.covered) {
      return { changed: 0, changedFrac: 0 };
    }
    const covered = mask.covered;
    const nPix = Math.min(
      covered.length,
      Math.floor(mountedData.length / 4),
      Math.floor(unmountedData.length / 4),
    );
    let coveredCount = 0;
    let changed = 0;
    for (let p = 0; p < nPix; p++) {
      if (!covered[p]) continue;
      coveredCount += 1;
      const i = p * 4;
      const dr = Math.abs(mountedData[i] - unmountedData[i])
        + Math.abs(mountedData[i + 1] - unmountedData[i + 1])
        + Math.abs(mountedData[i + 2] - unmountedData[i + 2]);
      if (dr >= 24) changed += 1;
    }
    return {
      changed,
      changedFrac: coveredCount ? changed / coveredCount : 0,
    };
  }
  function worksProofNegativeControl(mode) {
    if (mode !== 'black' && mode !== 'flat' && mode !== 'ghost' && mode !== 'off') {
      throw new Error(`[worksProof] unknown negative-control mode "${mode}"`);
    }
    if (!worksProofGroup) {
      throw new Error('[worksProof] negative-control requires a mounted group');
    }
    if (mode === 'off') {
      restoreWorksProofMaterials();
      return { ok: true, mode };
    }
    if (!worksProofSavedMaterials) {
      const saved = [];
      worksProofGroup.traverse((obj) => {
        if (!obj.isMesh) return;
        saved.push({ mesh: obj, material: obj.material });
      });
      worksProofSavedMaterials = saved;
    }
    const mat = mode === 'black'
      ? getWorksProofBlackMat()
      : mode === 'flat'
        ? getWorksProofFlatMat()
        : getWorksProofGhostMat();
    const saved = worksProofSavedMaterials;
    for (let i = 0; i < saved.length; i++) saved[i].mesh.material = mat;
    return { ok: true, mode };
  }
  function readProjectedPixels(box) {
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    const bw = canvas.width || 1;
    const bh = canvas.height || 1;
    const left = Math.max(0, box.minX);
    const top = Math.max(0, box.minY);
    const right = Math.min(cssW, box.maxX);
    const bottom = Math.min(cssH, box.maxY);
    const cssRW = Math.max(0, right - left);
    const cssRH = Math.max(0, bottom - top);
    if (cssRW < 1 || cssRH < 1) {
      return { width: 0, height: 0, data: new Uint8ClampedArray(0), x: 0, y: 0 };
    }
    const x = Math.max(0, Math.floor(left * bw / cssW));
    const y = Math.max(0, Math.floor(top * bh / cssH));
    const rw = Math.max(1, Math.min(bw - x, Math.ceil(cssRW * bw / cssW)));
    const rh = Math.max(1, Math.min(bh - y, Math.ceil(cssRH * bh / cssH)));
    const tmp = document.createElement('canvas');
    tmp.width = rw;
    tmp.height = rh;
    const ctx = tmp.getContext('2d');
    if (!ctx) {
      const err = new Error('[worksProof] 2d context is null');
      err.name = 'WorksProofReadError';
      throw err;
    }
    ctx.drawImage(canvas, x, y, rw, rh, 0, 0, rw, rh);
    const image = ctx.getImageData(0, 0, rw, rh);
    return { width: rw, height: rh, data: image.data, x, y };
  }
  function sampleWorksProof(withPart, forcedBox) {
    if (!worksProofGroup) return null;
    const prev = worksProofGroup.visible;
    try {
      worksProofGroup.visible = !!withPart;
      const scenePass = captureScenePass();
      const box = forcedBox || projectWorksBox(worksProofGroup);
      let pixels = null;
      if (box && box.width > 0 && box.height > 0) {
        const raw = readProjectedPixels(box);
        pixels = statsFromPixels(raw.data, raw.width, raw.height);
        pixels.readX = raw.x;
        pixels.readY = raw.y;
        pixels.readW = raw.width;
        pixels.readH = raw.height;
        pixels._data = raw.data;
      }
      return { scenePass, box, pixels, lod: inspectWorksLod(worksProofGroup) };
    } finally {
      worksProofGroup.visible = prev;
    }
  }
  function compareWorksProof() {
    if (!worksProofGroup) return null;
    const prev = worksProofGroup.visible;
    const shadowSaved = [];
    let box = null;
    let mask = {
      covered: worksProofMaskCovered.subarray(0, 0),
      coveredCount: 0,
      width: 0,
      height: 0,
      excludedMeshes: [],
    };
    let mounted = null;
    let unmounted = null;
    try {
      worksProofGroup.traverse((obj) => {
        if (!obj.isMesh) return;
        shadowSaved.push({ mesh: obj, castShadow: obj.castShadow });
        obj.castShadow = false;
      });
      worksProofGroup.visible = true;
      box = projectWorksBox(worksProofGroup);
      mask = renderWorksProofMask(box);
      mounted = sampleWorksProof(true, box);
      unmounted = sampleWorksProof(false, box);
    } finally {
      worksProofGroup.visible = prev;
      for (let i = 0; i < shadowSaved.length; i++) {
        shadowSaved[i].mesh.castShadow = shadowSaved[i].castShadow;
      }
    }
    let delta = null;
    let masked = {
      stats: maskedStats(null, mask),
      statsUnmounted: maskedStats(null, mask),
      delta: maskedDelta(null, null, mask),
    };
    if (mounted && mounted.pixels && unmounted && unmounted.pixels
      && mounted.pixels._data && unmounted.pixels._data) {
      delta = deltaFromPixels(mounted.pixels._data, unmounted.pixels._data);
      masked = {
        stats: maskedStats(mounted.pixels._data, mask),
        statsUnmounted: maskedStats(unmounted.pixels._data, mask),
        delta: maskedDelta(mounted.pixels._data, unmounted.pixels._data, mask),
      };
    }
    if (mounted && mounted.pixels) delete mounted.pixels._data;
    if (unmounted && unmounted.pixels) delete unmounted.pixels._data;
    const excluded = (mask.excludedMeshes || []).slice();
    excluded.sort();
    return {
      box,
      mounted,
      unmounted,
      delta,
      mask: {
        coveredCount: mask.coveredCount,
        width: mask.width,
        height: mask.height,
        excludedMeshes: excluded,
      },
      masked,
      shadowsSuppressed: true,
      lod: inspectWorksLod(worksProofGroup),
      transform: worksProofGroup.userData.worksTransform || null,
      rendererLive: rendererContextLive(),
      presentation: snapshotRendererPresentation(),
    };
  }
  async function mountWorksProof() {
    if (worksTearingDown || disposed || glTeardownDone) {
      return { ok: false, reason: 'tearing-down' };
    }
    armWorksProof();
    const pendingRetire = worksRetirePromise;
    if (pendingRetire) await pendingRetire;
    if (worksTearingDown || disposed || glTeardownDone) {
      return { ok: false, reason: 'tearing-down' };
    }
    const loader = ensureWorksLoader();
    if (!loader) return { ok: false, reason: 'no-loader' };
    const gen = ++worksProofGen;
    unmountWorksProof();
    const group = await loader.loadWorksPart(WORKS_PROOF_ID);
    if (worksTearingDown || disposed || glTeardownDone || gen !== worksProofGen) {
      if (group && loader) loader.releaseWorksPart(group);
      return {
        ok: false,
        reason: (worksTearingDown || disposed || glTeardownDone) ? 'tearing-down' : 'stale',
      };
    }
    if (!group) return { ok: false, reason: 'load-null', stats: loader.stats() };
    // Authored places are Y-up (flight). The mine's pad faces +Z (camera). Rotate so the
    // platform stands on the cut plane without mutating shared geometry.
    const transform = seatWorksProofGroup(group);
    group.userData.worksTransform = transform;
    group.name = 'worksProof_drill_platform';
    scene.add(group);
    worksProofGroup = group;
    worksProofWanted = true;
    worksHostWasVisible = true;
    const hookNames = group.userData.worksHooks || {};
    const hooks = {};
    for (const name of Object.keys(hookNames)) hooks[name] = hookNames[name] ? name : null;
    return {
      ok: true,
      id: WORKS_PROOF_ID,
      cell: { col: WORKS_PROOF_CELL.col, row: WORKS_PROOF_CELL.row },
      stats: loader.stats(),
      hooks,
      colourSpace: inspectWorksColourSpace(group),
      nodeLod: group.userData.worksNodeLod || null,
      transform,
      lod: inspectWorksLod(group),
    };
  }
  function worksHostExiting() {
    const ast = wrapEl.closest && wrapEl.closest('.ast-screen');
    const host = (ast && ast.parentElement) || ast || wrapEl;
    return !!(host.classList && host.classList.contains('sf-screen--exiting'))
      || (host.style && host.style.display === 'none')
      || (host.hasAttribute && host.hasAttribute('hidden'));
  }
  function maybeRetireOnHide() {
    if (disposed || worksTearingDown) return;
    if (!worksProofArmed) return;
    // A 0×0 wrapper (minimised window, collapsed flex) is not screen exit.
    if (!worksHostExiting()) {
      const becameVisible = !worksHostWasVisible;
      worksHostWasVisible = true;
      if (becameVisible && worksProofWanted && !worksProofGroup) void mountWorksProof();
      return;
    }
    if (worksHostWasVisible) {
      worksHostWasVisible = false;
      void retireWorksAssets('works-screen-exit');
    }
  }
  // ScreenManager puts sf-screen--exiting / display:none on the mount root (parent of .ast-screen).
  const astScreen = wrapEl.closest && wrapEl.closest('.ast-screen');
  const worksHost = (astScreen && astScreen.parentElement) || astScreen || wrapEl;
  function armWorksProof() {
    if (worksProofArmed) return;
    worksProofArmed = true;
    if (worksHostObs || typeof MutationObserver === 'undefined' || !worksHost) return;
    worksHostObs = new MutationObserver(() => maybeRetireOnHide());
    worksHostObs.observe(worksHost, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  }
  if (worksProofFlagOn()) armWorksProof();

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

  // ------------------------------------------------------- PQ-130.10b: the site reads (law §7)
  // The two run materials above are TEMPLATES from here on. Nothing renders with them directly:
  // rebuildOverlays clones one per connected network so a dead island can go dark on its own while
  // the live spine beside it keeps its floor. These are the two ends of that range.
  const CABLE_LIVE = new THREE.Color(0xb8863a);   // powered armour under the warm key
  const CABLE_DEAD = new THREE.Color(0x5f574c);   // no generator on this net: bare, desaturated metal
  const LANE_LIVE = new THREE.Color(0x7d97ab);    // a lane with stock in it — pale steel jacket
  const LANE_DEAD = new THREE.Color(0x5b5b5c);    // track bolted to nothing
  const overlayParts = [];       // { kind, key, mat, mesh } — one per NETWORK, state-driven
  const overlayCasings = [];     // shared dark armour, state-free
  const authoredOverlayParts = []; // per-cell accepted Conduit release pieces
  let conduitMountLifecycle = null;
  const laneFlows = [];          // { key, routes:[{pts,cum,len}], phase }
  const netState = { power: new Map(), lane: new Map() };
  const overlayWidth = { lane: 0, power: 0 };    // cell fractions of the last build, for §7 checks
  const RUNNING_STATES = new Set(['running', 'limited', 'throttled', 'building', 'staged']);
  // A LAMP THAT MEANS "BROKEN", NOT "HUNGRY". Law §5 gave starved/unpowered a DARK housing plus a
  // gold want chip (PQ-130.07) and that stays. These two are different in kind: a machine seated
  // against the wrong rock, or bolted to no lane at all, will never resolve on its own — nobody is
  // bringing it anything. That earns the coral lamp §3.2 reserves for "cost you cannot pay".
  const CORAL_FAULTS = new Set(['no-geology', 'no-network']);

  // Flow dots (law §7: slow dots on the tunnel floor, moving toward the port, ~1/s at work zoom).
  // SPEED IS CONSTANT and SPACING carries the buffer. Scaling speed with the buffer would make a
  // full lane read as a FAST lane, which is a lie about the throughput cap the sim actually runs.
  const FLOW_DOT_MAX = 56;
  const FLOW_SPEED_WU = S * 1.55;         // world units per second ≈ 1.55 cells/s
  const FLOW_GAP_EMPTY = S * 4.0;         // a nearly-empty lane: one dot every four cells
  const FLOW_GAP_FULL = S * 1.35;         // a full lane: a queue nose to tail
  const flowDotGeo = makeFlowDotGeo();
  const flowDotMat = new THREE.MeshStandardMaterial({
    color: 0x4a7f99, emissive: 0x5cc8f2, emissiveIntensity: 0.42,
    roughness: 0.36, metalness: 0.5, envMap,
  });
  const flowDots = new THREE.InstancedMesh(flowDotGeo, flowDotMat, FLOW_DOT_MAX);
  flowDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  flowDots.frustumCulled = false;
  flowDots.count = 0;
  overlayRoot.add(flowDots);
  const junctionNodeGeo = makeJunctionNodeGeo();
  // The lane's lid. OWNER RULING 2026-08-21: the flow is dots INSIDE a translucent tray, not a line
  // drawn on the rock — so the run is a covered conveyor and the dots are freight under glass.
  const trayMat = new THREE.MeshStandardMaterial({
    // Dark glass, not white plastic: at 0.2 opacity over a lit channel the pale tint read as chalk
    // and put a flat grey bar down the shaft. Low albedo + a tight specular is what glass over a
    // lamp actually looks like.
    color: 0x55636d, roughness: 0.07, metalness: 0.1, envMap, envMapIntensity: 1.5,
    transparent: true, opacity: 0.16, depthWrite: false,
  });

  // The port's pile. Crates are the thing a drone or a laser flyby would take, so they are real
  // freight standing on the tunnel floor beside the port — not a gauge painted on the housing.
  const crateMat = new THREE.MeshStandardMaterial({
    color: 0x8a6a42, roughness: 0.76, metalness: 0.16, envMap,
  });
  const crateGeos = [];        // lazily built, indexed by stage 1..5
  let crateMesh = null;
  let crateStageNow = 0;
  let crateCell = null;        // the tunnel cell the pile stands on, or null = on the port itself

  // ---- overlay lenses (law §6.5). One at a time; V cycles; Tab belongs to the drawers (§6.6).
  // Heat is a FUTURE law (§12 stages 5-7 park `siteThermalModel`), so it is deliberately absent
  // from the cycle rather than stubbed as a lens that shows nothing.
  const LENS_ORDER = ['faces', 'network', 'plan'];
  let lensName = null;

  // ---- build-mode board feedback (law §6.7) ----
  const facesCache = { sig: '', t: -1e9, seats: [], blocked: [] };
  let facesShown = 0;
  // The two refusals the board already answers with an object you can see.
  const SELF_EVIDENT_REFUSALS = new Set(['occupied', 'rover-here']);
  const WHY_MAX = 6;
  const whyPlateGeo = makeWhyGlyphPlateGeo(0.26);
  const whyTextures = new Map();
  const whyPool = [];
  let whyUsed = 0;

  // Gridline strengthening (law §6.7: "~15%" while placing). The board's grid is CUT INTO THE ROCK
  // — grooves between pads, not painted lines — so strengthening it means the grooves gather more
  // shadow, which is what a deeper masonry joint looks like. Zero in drive: the drive board is
  // exactly the board .03 lit, untouched.
  const GRID_BUILD_K = 0.15;
  let gridK = 0;
  const gridMat = new THREE.MeshBasicMaterial({
    map: makeGridGrooveTexture(), transparent: true, opacity: 0, depthWrite: false, depthTest: false,
  });
  const gridPlane = new THREE.Mesh(new THREE.PlaneGeometry(COLS * S, ROWS * S), gridMat);
  gridPlane.position.set(0, 0, ROCK_FACE + 0.30);
  gridPlane.renderOrder = 22;
  gridPlane.visible = false;
  fxRoot.add(gridPlane);

  // cursor / ghost / ring shared bits
  // Aim/build affordances. These are the only drawn overlays left on the board, and they wear the
  // chrome palette (§3.2 gold / mint / coral) — never the old console cyan.
  // THE HOVER BOX. It used to be a 7px cyan frame at 80% — the loudest object on the board and
  // the wrong hue twice over: §3.2 reserves `--aw-sky` cyan for MATERIAL FLOW, and the cursor is
  // not flow, it is where your eye already is. It is now a hairline of `--aw-ink` bone at 55%,
  // held to 1.5 SCREEN PIXELS at every zoom, over a soft inner shadow that seats the cell without
  // drawing a second line. Build mode keeps its mint/coral verdict — that is .09's language.
  const HOVER_INK = 0xf2e8d5;      // --aw-ink
  const HOVER_ALPHA = 0.55;
  const HOVER_PX = 1.5;
  const frameMat = new THREE.MeshBasicMaterial({ color: HOVER_INK, transparent: true, opacity: HOVER_ALPHA, depthTest: false });
  // OWNER RULING 2026-08-21 — "NO solid cell fills, ever, for any lens or build feedback." The four
  // full-cell wash quads that used to live here (mint pad, coral pad, mint contact ring, grey empty
  // ring) painted flat rectangles over a 3D board; in the owner's own screenshot the valid seats
  // read as solid green blocks and a blocked cell as a solid red box. They are DELETED. Every seat,
  // contact and refusal verdict is now drawn as corner brackets on the block's own bevel ring —
  // 1.8 screen px of ink, under 12% of the cell's area, colour by meaning. See seatBrackets below.
  const cursorGroup = new THREE.Group();
  const cursorBars = [];
  const CURSOR_BAR_H = S * 0.06;   // the geometry's own thickness; scale.y solves the live pixels
  {
    const bar = new THREE.BoxGeometry(S, CURSOR_BAR_H, S * 0.02);
    for (const [x, y, rz] of [[0, S / 2, 0], [0, -S / 2, 0], [S / 2, 0, Math.PI / 2], [-S / 2, 0, Math.PI / 2]]) {
      const b = new THREE.Mesh(bar, frameMat);
      b.position.set(x, y, 0);
      b.rotation.z = rz;
      cursorGroup.add(b);
      cursorBars.push(b);
    }
    // the inner shadow: a soft dark gather just inside the four edges. It gives the outline its
    // seat in the rock without adding a second drawn line, which is what a 1.5px hairline needs to
    // stay legible over a bright ore face and over dark basalt alike.
    const innerShadow = new THREE.Mesh(cellQuad, new THREE.MeshBasicMaterial({
      map: makeInnerShadowTexture(), transparent: true, opacity: 0.5,
      depthTest: false, depthWrite: false, color: 0xffffff,
    }));
    innerShadow.position.z = -0.01;
    innerShadow.scale.setScalar(0.995);   // cellQuad is already S x S
    innerShadow.renderOrder = 29;
    cursorGroup.add(innerShadow);
    cursorGroup.visible = false;
    cursorGroup.renderOrder = 30;
    fxRoot.add(cursorGroup);
  }
  // ---- seat brackets: the ONE marking language for seats, contacts and refusals (owner ruling) --
  // One InstancedMesh, per-instance colour, held at a constant SCREEN thickness by rebuilding the
  // (tiny) geometry whenever the zoom actually changes. Mint = a seat this machine may take; dim
  // mint = a face that would feed it; bone = a face that is hollow and feeds nothing; coral = the
  // cursor's own cell, refused.
  const SEAT_MAX = 160;
  const SEAT_PX = 1.8;                 // the law's 1.5-2px edge
  const seatMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false,
  });
  let seatGeo = makeSeatBracketGeo(0.03, 0.3);
  let seatGeoKey = '';
  const seatBrackets = new THREE.InstancedMesh(seatGeo, seatMat, SEAT_MAX);
  seatBrackets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  seatBrackets.frustumCulled = false;
  seatBrackets.renderOrder = 28;
  seatBrackets.count = 0;
  seatBrackets.visible = false;
  fxRoot.add(seatBrackets);
  const SEAT_TINT = {
    seat: new THREE.Color(0x7cd9a2),      // --aw-mint: a legal seat
    contact: new THREE.Color(0x5fae82),   // a face that would feed the machine
    hollow: new THREE.Color(0x6f6252),    // a face that is already hollow: feeds nothing, ever
    refused: new THREE.Color(0xff6242),   // --aw-coral: this cell, refused
  };
  let seatsUsed = 0;
  function seatGeometryForZoom() {
    // Thickness is solved against the LIVE camera so the mark is the same weight at both registers;
    // the key quantises it so a 180ms zoom ease does not rebuild a geometry sixty times.
    const t = Math.max(0.012, Math.min(0.07, SEAT_PX / Math.max(1, S * pxPerWorldUnit())));
    const key = t.toFixed(3);
    if (key === seatGeoKey) return;
    seatGeoKey = key;
    const next = makeSeatBracketGeo(t, Math.max(0.22, Math.min(0.34, t * 9)));
    seatBrackets.geometry = next;
    seatGeo.dispose();
    seatGeo = next;
  }
  function markSeat(col, row, tint) {
    if (seatsUsed >= SEAT_MAX) return;
    dummy.position.set(worldX(col), worldY(row), Z.face - 0.04);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(S);
    dummy.updateMatrix();
    seatBrackets.setMatrixAt(seatsUsed, dummy.matrix);
    seatBrackets.setColorAt(seatsUsed, SEAT_TINT[tint] || SEAT_TINT.seat);
    seatsUsed++;
  }
  function flushSeats() {
    seatBrackets.count = seatsUsed;
    seatBrackets.visible = seatsUsed > 0;
    if (seatsUsed) {
      seatBrackets.instanceMatrix.needsUpdate = true;
      if (seatBrackets.instanceColor) seatBrackets.instanceColor.needsUpdate = true;
    }
  }

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
  chunkMesh.castShadow = true;    // real debris throws a real shadow (law §2.7)
  chunkMesh.frustumCulled = false;
  fxRoot.add(chunkMesh);
  let particles = [];

  // `depth` is optional: a burst that belongs to an OBJECT in the tunnel (the rover's coolant
  // vent) must composite at that object's depth, not on the face plane 3 world units nearer the
  // camera, or an additive chip reads as a bloom blob floating over the rock.
  const burst = (opts, depth) => {
    const before = particles.length;
    spawnParticleBurst(particles, opts);
    for (let i = before; i < particles.length; i++) {
      particles[i]._c3 = new THREE.Color(particles[i].color);
      if (depth !== undefined) particles[i]._z = depth;
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
        rx: Math.random() * Math.PI, ry: Math.random() * Math.PI,
      });
    }
  }

  // ---- PQ-130.07 spawners (law §5 timings) ----

  // "3-5 chunk sprites pop from the cell (60-120ms apart), arc ~250ms into the hopper."
  // Real lit debris on chunkMesh, released on a stagger and flown to wherever the hopper IS when
  // each one lands — the target is re-read every frame, so driving away mid-payout still loads.
  function spawnOreArc(px, py, hex, count) {
    let delay = 0;
    const c = new THREE.Color(hex);
    for (let i = 0; i < count; i++) {
      oreArcs.push({
        delay,
        t: 0,
        x0: px + (Math.random() - 0.5) * TILE * 0.42,
        y0: py + (Math.random() - 0.5) * TILE * 0.42,
        c3: c.clone().multiplyScalar(0.72 + Math.random() * 0.5),
        size: 6.4 + Math.random() * 3.6,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 13,
        rx: Math.random() * Math.PI,
        ry: Math.random() * Math.PI,
        lift: 0.7 + Math.random() * 0.6,
      });
      delay += (motionReduce ? 0.03 : 0.06) + Math.random() * 0.06;   // law: 60-120ms apart
    }
  }

  // "vapor floods adjacent tunnel cells ~1.2s" — seeded in the breached cell and in every hollow
  // neighbour, because gas goes where there is room to go.
  function spawnVapor(col, row) {
    const seeds = [[col, row, 3]];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = col + dc, r = row + dr;
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
      const tile = field[c] && field[c][r];
      if (!tile || tile.type !== 'empty') continue;      // only tunnel cells flood
      seeds.push([c, r, 2]);
    }
    vaporT = 0;
    for (const [c, r, n] of seeds) {
      for (let i = 0; i < (motionReduce ? 1 : n); i++) {
        if (vapors.length >= VAPOR_CAP) return;
        vapors.push({
          x: worldX(c) + (Math.random() - 0.5) * S * 0.55,
          y: worldY(r) + (Math.random() - 0.5) * S * 0.55,
          z: Z.rover + 0.1,
          t: 0,
          life: VAPOR_LIFE_S * (0.72 + Math.random() * 0.4),
          scale: S * (0.17 + Math.random() * 0.16),
          driftX: (Math.random() - 0.5) * S * 0.55,
          driftY: (0.25 + Math.random() * 0.5) * S,
          rot: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 1.1,
          geo: (Math.random() * vaporGeos.length) | 0,
        });
      }
    }
  }

  // "bit skates off with 6-10 sparks over 300ms" — metallic and warm, and STAGGERED across the
  // 300ms rather than thrown in one puff, because a skate is the bit walking across the face.
  function startSkate(px, py, hex) {
    skate.t = SKATE_DUR_S;
    skate.left = motionReduce ? 4 : 6 + ((Math.random() * 5) | 0);   // 6-10
    skate.next = 0;
    skate.x = px;
    skate.y = py;
    skate.hex = hex;
  }

  // rover — a vehicle, not a dot. The container holds either the procedural fallback or the
  // authored works part; pose (cell, facing) is applied here so a swap does not lose the seat.
  const rover = new THREE.Group();
  rover.name = 'rover';
  rover.visible = false;
  scene.add(rover);
  let roverBuilt = makeRover(S, envMap);
  rover.add(roverBuilt.group);
  let authoredRoverGroup = null;
  // ONE standing authored rover per screen session. Setup arms the swap and begin() re-arms it,
  // and before this both fired while the first load was still in flight: the loader took two
  // leases (worksStats.loaded: 2, released: 0 in the .00 receipt) and the second arrival ran
  // disposeGroup() over the FIRST authored seat — whose geometry and materials are the same
  // blueprint instances the surviving seat draws with. Single-flight at the mount, single-flight
  // at the loader, and every superseded or retired group goes back through releaseWorksPart.
  const authoredRoverMount = createSingleFlightMount(async () => {
    const loader = ensureWorksLoader();
    if (!loader) return null;
    const group = await loader.loadStandingPart('rover');
    if (worksTearingDown || disposed || glTeardownDone) {
      if (group) loader.releaseWorksPart(group);
      return null;
    }
    if (!group) return null;
    if (authoredRoverGroup === group) return group;
    const authored = bindAuthoredRover(group);
    const previous = roverBuilt;
    const previousGroup = authoredRoverGroup;
    if (previous && previous.group && previous.group.parent === rover) {
      rover.remove(previous.group);
      // A superseded AUTHORED seat draws with the lease's shared blueprint resources; only the
      // procedural fallback owns geometry this renderer may dispose outright.
      if (previous.authored) loader.releaseWorksPart(previousGroup);
      else disposeGroup(previous.group);
    } else if (previousGroup && previousGroup !== group) {
      loader.releaseWorksPart(previousGroup);
    }
    if (headlight.parent) headlight.parent.remove(headlight);
    if (headTarget.parent) headTarget.parent.remove(headTarget);
    roverBuilt = authored;
    authoredRoverGroup = group;
    rover.add(authored.group);
    const lamp = roverBuilt.dyn.lampAnchor;
    headlight.position.copy(lamp.position);
    roverBuilt.dyn.body.add(headlight, headTarget);
    headlight.target = headTarget;
    roverScars.length = 0;
    roverScarsShown = 0;
    for (let i = 0; i < authored.scars.length; i++) {
      authored.scars[i].visible = false;
      roverScars.push(authored.scars[i]);
    }
    roverAnim.hopStage = -1;
    return group;
  });
  function mountAuthoredRover() {
    if (worksTearingDown || disposed || glTeardownDone) return Promise.resolve(null);
    return authoredRoverMount.invoke().catch((error) => {
      // Loud, and the procedural rover stays on camera: the authored swap is not accepted yet.
      console.error('[asteroidRenderer3d] authored rover swap failed; the procedural rover stands', error);
      return null;
    });
  }
  // Retiring the standing rover is a loader operation, never a bare disposeGroup: the seat draws
  // with the lease's shared blueprint resources, and only releaseWorksPart knows which clones
  // belong to this instance.
  function releaseAuthoredRover() {
    authoredRoverMount.reset();
    const group = authoredRoverGroup;
    authoredRoverGroup = null;
    if (!group) return;
    if (group.parent) group.parent.remove(group);
    if (worksLoader) worksLoader.releaseWorksPart(group);
  }
  // ONE headlamp, and it is a real light (law §4): a warm cone out of the lamp housings onto the
  // rock face the rig is working, with a modest shadow map so the boom and the auger throw their
  // own shadow into the cut. PQ-130.03 carried two overlapping spots for the same job; the second
  // bought nothing but another lighting term in every shader on this screen.
  // The light and its target hang off dyn.body, not the rover group: the lamp anchor's position is
  // BODY-local, so parenting to the rover would mis-aim the cone by the chassis ride height and
  // leave the beam behind whenever the body bobs or leans.
  const headlight = new THREE.SpotLight(0xffe0b0, 52, S * 8, 0.6, 0.55, 1.6);
  headlight.position.copy(roverBuilt.dyn.lampAnchor.position);
  headlight.castShadow = true;
  headlight.shadow.mapSize.set(512, 512);
  headlight.shadow.camera.near = S * 0.3;
  headlight.shadow.camera.far = S * 7;
  headlight.shadow.normalBias = 0.06;
  headlight.shadow.bias = -0.0009;
  const headTarget = new THREE.Object3D();
  headTarget.position.set(S * 3.2, 0, 0);
  roverBuilt.dyn.body.add(headlight, headTarget);
  headlight.target = headTarget;
  // a small warm work light — not the blue orb that read as "you are this dot"
  const roverGlow = new THREE.PointLight(0xffd9a8, 3.2, S * 3.4, 2);
  roverGlow.position.set(0, S * 0.3, S * 0.4);
  rover.add(roverGlow);
  const roverAnim = {
    flipY: 0, armAim: -Math.PI / 2, bite: 0, wheelSpin: 0, lean: 0, bob: 0,
    trackPhase: 0, hopStage: -1, lid: 0, lastTemp: 0, vent: 0, ventTick: 0,
  };
  let cargoFullLatch = false;                  // set by notify('cargoFull'), cleared when it drains
  const HOT_BIT = new THREE.Color(0xff6242);   // law §4 — the bit's hot end
  // Hopper fill in FIVE VISIBLE STAGES (law §4), read off the real hold so the bin on the rover's
  // back and the crest's hold gauge are the same number told twice. The first chunk lands the
  // moment the hold stops being empty; then even steps up to the lid.
  const HOPPER_STEPS = [0.02, 0.22, 0.42, 0.62, 0.82];

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

  // Authored surface Derrick — one standing lease per works-screen lifetime. Its source was built
  // at native works scale (one 2.2 wu cell wide, three cells tall), so runtime only places it.
  let derrickBuilt = null;
  let authoredDerrickGroup = null;
  let derrickBaseY = 0;
  let derrickDrumTheta = 0;
  const derrickMountPosition = new THREE.Vector3();
  const derrickCableWorld = new THREE.Vector3();

  function placeAuthoredDerrick() {
    if (!derrickBuilt) return;
    derrickMountPosition.set(worldX(ENTRY_COL), derrickBaseY, Z.surface);
    replaceDerrickInScene(scene, derrickBuilt, derrickBuilt, derrickMountPosition);
  }

  const authoredDerrickMount = createSingleFlightMount(async () => {
    const loader = ensureWorksLoader();
    if (!loader) return null;
    const group = await loader.loadStandingPart('derrick');
    if (worksTearingDown || disposed || glTeardownDone) {
      if (group) loader.releaseWorksPart(group);
      return null;
    }
    if (!group) return null;
    if (authoredDerrickGroup === group) {
      placeAuthoredDerrick();
      return group;
    }
    const authored = bindAuthoredDerrick(group);
    derrickMountPosition.set(worldX(ENTRY_COL), derrickBaseY, Z.surface);
    derrickBuilt = replaceDerrickInScene(scene, derrickBuilt, authored, derrickMountPosition);
    authoredDerrickGroup = group;
    return group;
  });

  function mountAuthoredDerrick() {
    if (worksTearingDown || disposed || glTeardownDone) return Promise.resolve(null);
    return authoredDerrickMount.invoke().catch((error) => {
      // Loud and visible in diagnostics. PQ-131.05 intentionally deleted the procedural model;
      // a failed accepted release must not disguise itself behind the obsolete cheap picture.
      console.error('[asteroidRenderer3d] authored Derrick load failed; surface head-frame is absent', error);
      return null;
    });
  }

  function releaseAuthoredDerrick() {
    authoredDerrickMount.reset();
    const group = authoredDerrickGroup;
    authoredDerrickGroup = null;
    derrickBuilt = null;
    if (!group) return;
    if (group.parent) group.parent.remove(group);
    if (worksLoader) worksLoader.releaseWorksPart(group);
  }

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
  const authoredOreByCell = new Map();
  let inclusionKitCatalog = null;
  let authoredInclusionKitGroup = null;
  let authoredMkStamp = null;
  const machines = new Map();   // machineId -> { group, defId, dyn, col, row, geoSig, arms, pulses }
  let ghost = null;             // { defId, group }
  let overlaySig = '';
  let drillTheta = 0;
  let digCell = null;           // { c, r, idx } — block currently taking the bit
  let digGasHot = null;         // gas entry currently screaming under the bit
  let dustTimer = 0;
  let lastRevealCell = { col: -1, row: -1 };
  const timers = { gasFlash: 0, cargoFlash: 0 };
  let pulseEntries = [];        // [{mat, base, amp}] — rover + derrick

  // One standing combined kit supplies every per-cell ore, gas, scar, and lock instance. The
  // instances borrow its GPU resources and are always detached before the standing lease retires.
  const authoredInclusionMount = createSingleFlightMount(async () => {
    const loader = ensureWorksLoader();
    if (!loader) return null;
    const group = await loader.loadStandingPart('inclusion_kit');
    if (worksTearingDown || disposed || glTeardownDone) {
      if (group) loader.releaseWorksPart(group);
      return null;
    }
    if (!group) return null;
    if (authoredInclusionKitGroup !== group) {
      try {
        inclusionKitCatalog = createWorksInclusionCatalog(group);
      } catch (error) {
        // loadStandingPart caches successful groups. A contract failure must evict that standing
        // lease or every retry would inherit the same invalid group and its resources forever.
        loader.releaseWorksPart(group);
        throw error;
      }
      authoredInclusionKitGroup = group;
    }
    rebuildAuthoredInclusionPresentation();
    return group;
  });

  function mountAuthoredInclusionKit() {
    if (worksTearingDown || disposed || glTeardownDone) return Promise.resolve(null);
    return authoredInclusionMount.invoke().catch((error) => {
      console.error('[asteroidRenderer3d] authored Inclusion Kit load failed; procedural inclusions stand', error);
      return null;
    });
  }

  function releaseAuthoredInclusionKit() {
    authoredInclusionMount.reset();
    clearAuthoredInclusionInstances();
    const group = authoredInclusionKitGroup;
    authoredInclusionKitGroup = null;
    inclusionKitCatalog = null;
    if (group && worksLoader) worksLoader.releaseWorksPart(group);
  }

  // ---------------------------------------------------------------- PQ-130.07 "the sim speaks"
  // Law §5: every sim event gets a BOARD expression with the law's own timings, and none of them
  // prints a text row. The state below is that whole table's working memory. Every entry has a
  // reset line in begin() and dispose() — an event timer that survives a session re-entry replays
  // somebody else's explosion.

  // Camera kick — law §5 gas row: "camera kicks 4px for 180ms". FOUR SCREEN PIXELS: the offset is
  // solved against the live px-per-world-unit every frame, so the kick is the same size at work
  // zoom and at site zoom instead of scaling with the dolly. (The 8px/420ms curve exported by
  // src/ui/screens/drill.js belongs to the retired 2D overlay and is left alone — two headless
  // checks import that module.)
  const KICK_DUR_S = 0.18;
  const KICK_PX = 4;
  const kick = { t: 0, elapsed: 0 };

  // Ore chunks arcing to the hopper — law §5 ore row: "3-5 chunk sprites pop from the cell
  // (60-120ms apart), arc ~250ms into the hopper". They are lit PBR bodies on chunkMesh, not
  // sprites (§2.7), and they are parametric rather than ballistic because the target moves: the
  // rover can drive off mid-arc and the ore must still land in its bin.
  const ARC_DUR_S = 0.25;
  const oreArcs = [];           // { delay, t, x0, y0, c3, size, rot, spin }

  // Vapor — law §5 gas row: "vapor floods adjacent tunnel cells ~1.2s". LIT bodies with real
  // normals on their own instanced mesh, so the work light rakes across them; an additive sprite
  // would be the neon halo §2.7 bans.
  const VAPOR_LIFE_S = 1.2;
  const VAPOR_CAP = 28;
  const vapors = [];            // { x, y, z, t, life, scale, drift, rot, spin }
  let vaporT = 0;               // age of the whole cloud; the fade is shared, not per-puff

  // The 150ms yellow-green flash INSIDE the breached cell (not on the glass).
  const cellFlash = { t: 0, dur: 0.15, col: -1, row: -1 };
  let gasBreachT = -99;           // one eruption per breach, however many events describe it

  // Refusals — law §5: "identical refusals within 5s do not replay their full effect". Keyed by
  // cell + reason so aiming at a different locked seam still speaks.
  const REFUSAL_SUPPRESS_S = 5;
  const refusalSeen = new Map();  // `${idx}|${reason}` -> timeS of the last full expression
  let blockedLatch = false;       // rising-edge detector on d.avatar.drillBlocked
  let blockedCell = -1;
  const skate = { t: 0, left: 0, next: 0, x: 0, y: 0, hex: 0xffb35c };  // 6-10 sparks over 300ms
  const SKATE_DUR_S = 0.3;

  // Machine placement settle — law §5: "ghost snaps in with a 120ms settle; its lamp lights mint".
  const SETTLE_S = 0.12;
  const settles = new Map();      // tileIndex -> seconds remaining

  // Want chips — law §5 starved row: "a small gold want chip floats above it showing the missing
  // input's swatch or a power glyph". Mesh chips like the seam counts, so the §11.3 word budget is
  // untouched: they carry a SWATCH or a GLYPH, never a word.
  const wantChipPool = [];        // { mesh, mat, wPx, hPx }
  const wantTextures = new Map();
  let wantChipsUsed = 0;

  // Courier launch — law §5: "pod visibly slides up the shaft, clears the surface". Detected off
  // site.fleet.launches, which the sim increments on every departure; the screen does not forward
  // site:courierLaunched to the renderer and its owner is out of this leaf's write set.
  // Authored Cargo Port owns the cell-local collar climb. The board-plane yellow capsule is only
  // the fallback when that authored seat is absent.
  const POD_RISE_S = CARGO_POD_RISE_S;
  const cargoLaunch = createCargoPodLaunchClock();
  let podMesh = null;
  let podT = -1;                  // <0 = parked (procedural shaft pod only)
  let lastLaunches = null;        // null until the first frame that sees a site (never 0: a return
                                  // visit to a producing site must not replay its whole history)

  // The rover's blast scars — law §5: "a visible scar/chip on the rover". Toggled on by the first
  // breach and worn for the rest of the session; the rig does not buff itself out mid-shift.
  const roverScars = [];
  let roverScarsShown = 0;

  // Floater stacking (law §5 repeat rules): consecutive yields on the same cell step upward instead
  // of piling into one illegible smear of numerals.
  let lastFloater = { idx: -1, t: -99, tier: 0 };

  // What the board last said, for the §11.8 headless assertion. Counters only — no text is drawn.
  const eventLog = {
    lastEvent: null, yields: 0, gasBreaches: 0, refusals: 0, refusalsSuppressed: 0,
    cargoRefusals: 0, installs: 0, courierLaunches: 0,
  };
  function mark(name, col, row) {
    eventLog.lastEvent = { name, col: col == null ? -1 : col, row: row == null ? -1 : row, t: timeSNow };
  }

  // ---- PQ-130.07 event bodies (built once; law §2.7 wants objects, not sprites) ----
  // VAPOR: an instanced LIT body. MeshStandard, not additive — the work light and the cool fill
  // rake across each puff exactly as they rake across the rock it is pouring out of.
  const vaporGeos = [makeVaporPuffGeo(0), makeVaporPuffGeo(1), makeVaporPuffGeo(2)];
  // Matte and thin. The first build gave this an envMap and half opacity, and one puff at full
  // growth read as a polished chrome ball parked on the rig — gas neither reflects nor occludes.
  const vaporMat = new THREE.MeshStandardMaterial({
    color: 0x8e9678, roughness: 1, metalness: 0, transparent: true, opacity: 0.24,
    depthWrite: false, envMapIntensity: 0, flatShading: false, side: THREE.DoubleSide,
  });
  const vaporMesh = new THREE.InstancedMesh(vaporGeos[0], vaporMat, VAPOR_CAP);
  vaporMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  vaporMesh.count = 0;
  vaporMesh.frustumCulled = false;
  vaporMesh.renderOrder = 24;
  fxRoot.add(vaporMesh);

  // THE BREACH FLASH: 150ms of yellow-green light inside the cell that let go. A real PointLight
  // plus a small additive core, so the flash lights the cavity walls instead of painting a disc
  // over them — that is the difference between an explosion and a sticker.
  const flashLight = new THREE.PointLight(0xd8e04a, 0, S * 5.5, 2);
  flashLight.castShadow = false;
  flashLight.position.set(0, 0, -900);
  scene.add(flashLight);

  // THE COURIER POD, parked off-board until a launch claims it.
  const podGeo = makeCourierPodGeo();
  const podMat = metalMat(0xb9b2a4, envMap);
  podMat.roughness = 0.44;

  // BLAST SCARS on the rig's flank (law §5 "a visible scar/chip on the rover"). Three plates are
  // welded onto the chassis at build time and start hidden; each breach shows one more, so the
  // vehicle carries the shift's history the way the hopper carries the hold. Scorched paint is
  // paint that has stopped being paint: near-black, rough, barely any spec — it reads as damage
  // beside the safety yellow instead of as a decal printed on it.
  const scarGeos = [makeScorchPlateGeo(0), makeScorchPlateGeo(1), makeScorchPlateGeo(2)];
  const scarMat = new THREE.MeshStandardMaterial({
    color: 0x2a2018, roughness: 0.95, metalness: 0.08, envMap, envMapIntensity: 0.18,
  });
  {
    const SCAR_AT = [
      [S * -0.12, S * 0.10, S * 0.19, 0.35, S * 0.30],
      [S * 0.16, S * -0.02, S * 0.19, -0.7, S * 0.24],
      [S * -0.26, S * 0.20, S * 0.19, 1.1, S * 0.21],
    ];
    for (let i = 0; i < scarGeos.length; i++) {
      const [x, y, z, rz, sc] = SCAR_AT[i];
      const m = new THREE.Mesh(scarGeos[i], scarMat);
      m.position.set(x, y, z);
      m.rotation.z = rz;
      m.scale.setScalar(sc);
      m.castShadow = false;
      m.visible = false;
      roverBuilt.dyn.body.add(m);
      roverScars.push(m);
    }
  }
  void mountAuthoredRover();
  void mountAuthoredInclusionKit();


  // shared geometry that must survive per-cell group disposal
  const sharedGeos = new Set([...blockGeos, ...clusterGeos, gasVaporGeo, cellQuad, partGeo, chunkGeo,
    ...inclusionGeos.metal, ...inclusionGeos.ice, ...inclusionGeos.exotic, ...bandGeos,
    ...gasCrackGeos, gasCoreGeo, ventedScarGeo, mkStampGeo, seamChipGeo,
    ...vaporGeos, ...scarGeos, podGeo]);

  // DOM overlay — spatial annotations only (floaters / alarm washes); rig vitals are crest +
  // rig-cluster instruments (design law §6 — the scene stays sovereign).
  const dom = { root: null, floaters: [], flashGas: null, flashCargo: null };
  function buildDomOverlay() {
    if (dom.root) return;
    const root = document.createElement('div');
    root.className = 'ast3d-overlay';
    root.setAttribute('aria-hidden', 'true');
    dom.flashGas = document.createElement('div');
    dom.flashGas.className = 'ast3d-vignette ast3d-flash-gas';
    dom.flashCargo = document.createElement('div');
    dom.flashCargo.className = 'ast3d-vignette ast3d-flash-cargo';
    root.append(dom.flashGas, dom.flashCargo);
    // The stage (canvas' full-bleed parent) so the overlay hugs the canvas box exactly — but
    // inserted IMMEDIATELY AFTER THE CANVAS, not appended at the end. The screen mounts the rig
    // cluster and its drawers into this same stage after the canvas, and an appended overlay
    // paints over them: measured, a 400ms damage vignette washed the Heat/Charge gauges from
    // rgb(45,37,27) to rgb(120,59,41), which is the instrument telling a lie about heat during
    // exactly the moment you need to read it. This is board weather; the instruments sit above it.
    const host = canvas.parentElement || wrapEl;
    if (canvas.parentElement === host && canvas.nextSibling) host.insertBefore(root, canvas.nextSibling);
    else host.appendChild(root);
    dom.root = root;
  }

  // ---------------------------------------------------------------- sizing + zoom registers
  // The board is sovereign: the canvas fills the stage box and the ortho box is derived from the
  // live aspect, so cells stay square at every window size. Two registers, only two (law §4):
  // work (WORK_COLS columns across) and site (the whole body), snapped with a 180ms ease.
  // (zoomRegister is declared early, beside the works loader, because ensureWorksLoader reads it
  // during setup — a later declaration here put it in the temporal dead zone at first load.)
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
    if (worksLoader) worksLoader.setRegister(reg);
    setAllAuthoredInclusionRegisters(reg);
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
    maybeRetireOnHide();
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

    derrickBaseY = worldY(-1) + (S * (0.55 + rnd01(ENTRY_COL, 77, 'ph') * 0.8)) / 2;
    if (derrickBuilt) placeAuthoredDerrick();
    else void mountAuthoredDerrick();
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

  function inclusionRotation(family, c, r, salt) {
    const h = hash32(family, c, r, salt, 'rotation');
    if (family === 'iron' || family === 'nickel' || family === 'silver' || family === 'gold') {
      return (h % 4) * (Math.PI / 2);
    }
    return (h / 4294967296) * Math.PI * 2;
  }

  function makeAuthoredInclusion(family, c, r, z, salt = 'cell') {
    if (!inclusionKitCatalog) return null;
    const variant = selectWorksInclusionVariant({ family, col: c, row: r, salt });
    const instance = createWorksInclusionInstance(inclusionKitCatalog, variant, zoomRegister);
    instance.position.set(worldX(c), worldY(r), z);
    instance.rotation.z = family === 'lock' ? 0 : inclusionRotation(family, c, r, salt);
    instance.userData.worksInclusionCell = tileIndex(c, r);
    return instance;
  }

  function setAllAuthoredInclusionRegisters(register) {
    for (const instance of authoredOreByCell.values()) setWorksInclusionRegister(instance, register);
    for (const rec of gasByCell.values()) {
      if (rec.authored) setWorksInclusionRegister(rec.authored, register);
    }
    for (const scar of ventedScars.values()) {
      if (scar.userData && scar.userData.worksInclusionShared) {
        setWorksInclusionRegister(scar, register);
      }
    }
    if (authoredMkStamp) setWorksInclusionRegister(authoredMkStamp, register);
  }

  function removeAuthoredOreAtIndex(idx) {
    const instance = authoredOreByCell.get(idx);
    if (!instance) return false;
    authoredOreByCell.delete(idx);
    releaseWorksInclusionInstance(instance);
    return true;
  }

  function clearAuthoredOreInstances() {
    for (const instance of authoredOreByCell.values()) releaseWorksInclusionInstance(instance);
    authoredOreByCell.clear();
  }

  function clearAuthoredMkStamp() {
    if (!authoredMkStamp) return;
    releaseWorksInclusionInstance(authoredMkStamp);
    authoredMkStamp = null;
  }

  function clearAuthoredInclusionInstances() {
    clearAuthoredOreInstances();
    for (const rec of gasByCell.values()) {
      if (rec.authored) {
        releaseWorksInclusionInstance(rec.authored);
        rec.authored = null;
      }
    }
    clearVentedScars();
    clearAuthoredMkStamp();
  }

  // Swap the complete inclusion surface as one transaction. Until the standing kit is ready the
  // procedural board remains playable; once ready, no cell double-draws the old and new shapes.
  function rebuildAuthoredInclusionPresentation() {
    if (!field || !inclusionKitCatalog || worksTearingDown || disposed || glTeardownDone) return;
    const scarCells = [...ventedScars.keys()].map((idx) => ({
      c: idx % COLS,
      r: Math.floor(idx / COLS),
    }));

    clearAuthoredOreInstances();
    for (const [, bucket] of oreBuckets) {
      oreRoot.remove(bucket.mesh);
      bucket.mesh.dispose();
    }
    oreBuckets = new Map();
    oreCellIndex = new Map();
    oreWakes.length = 0;

    if (digGasHot) digGasHot = null;
    for (const [, rec] of gasByCell) {
      if (rec.authored) releaseWorksInclusionInstance(rec.authored);
      gasRoot.remove(rec.group);
    }
    gasByCell.clear();
    clearVentedScars();
    if (mkStamp) {
      oreRoot.remove(mkStamp);
      mkStamp = null;
    }
    clearAuthoredMkStamp();
    mkStampCell = -1;

    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const tile = field[c] && field[c][r];
        if (!tile) continue;
        if (tile.type === 'gas') syncGasAt(c, r);
        else if (tile.type === 'vein') syncOreAt(c, r);
      }
    }
    // Loading the kit is a representation swap, not a fresh survey event: do not make every vein
    // on an established board pop simultaneously when the async asset finishes decoding.
    for (const instance of authoredOreByCell.values()) instance.scale.setScalar(1);
    oreWakes.length = 0;
    for (const cell of scarCells) addVentedScar(cell.c, cell.r);
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
    const authoredExisting = authoredOreByCell.get(idx);
    if (!wanted) {
      if (existing) killOreInstance(existing);
      if (authoredExisting) removeAuthoredOreAtIndex(idx);
      return;
    }
    const req = tile.tierReq || drillTierReqForOre(tile.ore);
    const locked = drillSys.getDrillTier() < req;
    const authoredFamily = worksInclusionFamilyForCommodity(tile.ore);
    if (inclusionKitCatalog && authoredFamily) {
      if (existing) killOreInstance(existing);
      const variant = selectWorksInclusionVariant({
        family: authoredFamily,
        col: c,
        row: r,
        salt: tile.ore,
      });
      if (authoredExisting
          && authoredExisting.userData.worksInclusionVariant === variant
          && authoredExisting.userData.worksInclusionOreId === tile.ore) {
        authoredExisting.userData.worksInclusionLocked = locked;
        return;
      }
      if (authoredExisting) removeAuthoredOreAtIndex(idx);
      const instance = createWorksInclusionInstance(inclusionKitCatalog, variant, zoomRegister);
      const rotZ = inclusionRotation(authoredFamily, c, r, tile.ore);
      const z = padZ(c, r) - 0.035;
      instance.position.set(worldX(c), worldY(r), z);
      instance.rotation.z = rotZ;
      instance.userData.worksInclusionCell = idx;
      instance.userData.worksInclusionOreId = tile.ore;
      instance.userData.worksInclusionLocked = locked;
      instance.userData.worksInclusionFamily = authoredFamily;
      oreRoot.add(instance);
      authoredOreByCell.set(idx, instance);
      if (!motionReduce) instance.scale.setScalar(0.25);
      oreWakes.push({ instance, idx, scale: 1, t0: timeSNow });
      return;
    }
    if (authoredExisting) removeAuthoredOreAtIndex(idx);
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
    removeAuthoredOreAtIndex(idx);
  }

  function removeGasAt(c, r) {
    const idx = tileIndex(c, r);
    const rec = gasByCell.get(idx);
    if (!rec) return;
    if (rec.authored) releaseWorksInclusionInstance(rec.authored);
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
    const cracks = [];
    let core = null;
    let authored = null;
    if (inclusionKitCatalog) {
      const variant = selectWorksInclusionVariant({ family: 'gas', col: c, row: r, salt: 'gas' });
      authored = createWorksInclusionInstance(inclusionKitCatalog, variant, zoomRegister);
      authored.position.set(0, 0, face - 0.025);
      authored.rotation.z = inclusionRotation('gas', c, r, 'gas');
      authored.userData.worksInclusionCell = idx;
      group.add(authored);
      // The accepted fissure is the resting shape. This old crack mesh is retained only as the
      // brief hot-under-bit event overlay, hidden at rest, so the two representations never stack.
      const hotCrack = new THREE.Mesh(
        gasCrackGeos[hash32(c, r, 'gcr') % gasCrackGeos.length],
        gasCrackHotMat,
      );
      hotCrack.position.z = face - 0.006;
      hotCrack.rotation.z = rnd01(c, r, 'gcz') * Math.PI * 2;
      hotCrack.scale.setScalar(S);
      hotCrack.castShadow = true;
      hotCrack.visible = false;
      group.add(hotCrack);
      cracks.push(hotCrack);
    } else {
      // Failure fallback: a dark socket and radial fissures keep the board playable and legible.
      core = new THREE.Mesh(gasCoreGeo, gasCoreMat);
      core.position.z = face - 0.02;
      core.rotation.z = rnd01(c, r, 'gk') * Math.PI * 2;
      core.scale.setScalar(S);
      group.add(core);
      const cm = new THREE.Mesh(
        gasCrackGeos[hash32(c, r, 'gcr') % gasCrackGeos.length],
        gasCrackMat,
      );
      cm.position.z = face - 0.012;
      cm.rotation.z = rnd01(c, r, 'gcz') * Math.PI * 2;
      cm.scale.setScalar(S);
      cm.castShadow = true;
      group.add(cm);
      cracks.push(cm);
    }
    // The breath: a small wisp that drifts, seeping out of the core.
    const vapor = new THREE.Mesh(gasVaporGeo, gasMat);
    vapor.position.z = face + 0.14;
    vapor.rotation.z = rnd01(c, r, 'gv') * Math.PI * 2;
    const baseScale = S * (0.62 + rnd01(c, r, 'gs') * 0.14);
    vapor.scale.set(baseScale, baseScale, baseScale * 0.55);
    group.add(vapor);
    gasRoot.add(group);
    gasByCell.set(idx, {
      group,
      vapor,
      cracks,
      core,
      authored,
      phase: rnd01(c, r, 'gp') * Math.PI * 2,
      baseScale,
      hot: false,
    });
  }

  // A blown pocket leaves a permanent scar (law §3.5 "vented pocket", D2 permanence). The sim clears
  // the tile outright, so the cell itself is gone — what stays is the split-open lip on the cavity
  // floor, dead gray-green, for as long as this session holds the rock.
  function addVentedScar(c, r) {
    const idx = tileIndex(c, r);
    if (ventedScars.has(idx)) return;
    const m = inclusionKitCatalog
      ? makeAuthoredInclusion('scar', c, r, Z.back + 0.07, 'vented-scar')
      : new THREE.Mesh(ventedScarGeo, ventedMat);
    if (!inclusionKitCatalog) {
      m.position.set(worldX(c), worldY(r), Z.back + 0.07);
      m.rotation.z = rnd01(c, r, 'vs') * Math.PI * 2;
      m.scale.setScalar(S);
      m.receiveShadow = true;
    }
    gasRoot.add(m);
    ventedScars.set(idx, m);
  }

  function clearVentedScars() {
    for (const [, m] of ventedScars) {
      if (m.userData && m.userData.worksInclusionShared) releaseWorksInclusionInstance(m);
      else gasRoot.remove(m);
    }
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
  async function mountAuthoredMachine(rec, kind) {
    const loader = ensureWorksLoader();
    if (!loader) return null;
    let source = null;
    const label = authoredWorksMachineLabel(kind);
    try {
      source = await loader.loadWorksPart(kind);
      if (!source) {
        console.error(`[asteroidRenderer3d] authored ${label} load failed; the accepted machine is absent`);
        return null;
      }
      if (worksTearingDown || disposed || glTeardownDone || !rec.alive
          || machines.get(rec.machineId) !== rec) {
        loader.releaseWorksPart(source);
        return null;
      }
      const authored = bindAuthoredWorksMachine(kind, source);
      rec.group.add(authored.group);
      rec.authoredSource = source;
      rec.authoredSeat = authored.group;
      rec.dyn = authored.dyn;
      rec.pulses = authored.pulses || [];
      return source;
    } catch (error) {
      if (source) loader.releaseWorksPart(source);
      console.error(`[asteroidRenderer3d] authored ${label} mount failed; the accepted machine is absent`, error);
      return null;
    }
  }

  function ownProceduralMachine(group) {
    group.traverse((o) => {
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mt of mats) mt._own = true;
      }
    });
  }

  function ensureCargoPortInstallLifecycle(rec) {
    if (rec.cargoLifecycle) return rec.cargoLifecycle;
    rec.cargoLifecycle = createCargoPortMountLifecycle({
      async load() {
        const loader = ensureWorksLoader();
        return loader ? loader.loadWorksPart('cargo_port') : null;
      },
      prepare(source) {
        return bindAuthoredCargoPort(source);
      },
      mount(record) {
        rec.group.add(record.group);
        rec.authoredSource = record.source;
        rec.authoredSeat = record.group;
        rec.dyn = record.dyn || {};
        rec.pulses = record.pulses || [];
        rec.proceduralFallback = false;
      },
      unmount(record) {
        if (record.group && record.group.parent) record.group.parent.remove(record.group);
        rec.authoredSource = null;
        rec.authoredSeat = null;
      },
      release(source) {
        if (worksLoader) worksLoader.releaseWorksPart(source);
      },
      buildFallback(reason) {
        console.error('[asteroidRenderer3d] authored Cargo Port load failed; the procedural port stands', reason);
        const built = makeMachine('cargo_port', S, envMap);
        ownProceduralMachine(built.group);
        rec.group.add(built.group);
        rec.dyn = built.dyn || {};
        rec.pulses = built.pulses || [];
        rec.proceduralFallback = true;
        rec.fallbackGroup = built.group;
        return built;
      },
      disposeFallback(built) {
        if (built && built.group) {
          if (built.group.parent) built.group.parent.remove(built.group);
          disposeGroup(built.group);
        }
        rec.proceduralFallback = false;
        rec.fallbackGroup = null;
      },
      isClosed: () => !rec.alive || worksTearingDown || disposed || glTeardownDone
        || machines.get(rec.machineId) !== rec,
    });
    return rec.cargoLifecycle;
  }

  function ensureGasTapInstallLifecycle(rec) {
    if (rec.gasLifecycle) return rec.gasLifecycle;
    rec.gasLifecycle = createGasTapMountLifecycle({
      async load() {
        const loader = ensureWorksLoader();
        return loader ? loader.loadWorksPart('gas_tap') : null;
      },
      prepare(source) {
        return bindAuthoredGasTap(source);
      },
      mount(record) {
        rec.group.add(record.group);
        rec.authoredSource = record.source;
        rec.authoredSeat = record.group;
        rec.dyn = record.dyn || {};
        rec.pulses = record.pulses || [];
        rec.proceduralFallback = false;
      },
      unmount(record) {
        if (record.group && record.group.parent) record.group.parent.remove(record.group);
        rec.authoredSource = null;
        rec.authoredSeat = null;
      },
      release(source) {
        if (worksLoader) worksLoader.releaseWorksPart(source);
      },
      buildFallback(reason) {
        console.error('[asteroidRenderer3d] authored Gas Tap load failed; the procedural tap stands', reason);
        const built = makeMachine('gas_tap', S, envMap);
        ownProceduralMachine(built.group);
        rec.group.add(built.group);
        rec.dyn = built.dyn || {};
        rec.pulses = built.pulses || [];
        rec.proceduralFallback = true;
        rec.fallbackGroup = built.group;
        return built;
      },
      disposeFallback(built) {
        if (built && built.group) {
          if (built.group.parent) built.group.parent.remove(built.group);
          disposeGroup(built.group);
        }
        rec.proceduralFallback = false;
        rec.fallbackGroup = null;
      },
      isClosed: () => !rec.alive || worksTearingDown || disposed || glTeardownDone
        || machines.get(rec.machineId) !== rec,
    });
    return rec.gasLifecycle;
  }

  function releaseAuthoredMachine(rec) {
    if (!rec) return;
    rec.alive = false;
    if (rec.cargoLifecycle || rec.gasLifecycle) {
      if (rec.cargoLifecycle) rec.cargoLifecycle.cancel('disposed');
      if (rec.gasLifecycle) rec.gasLifecycle.cancel('disposed');
      rec.cargoLifecycle = null;
      rec.gasLifecycle = null;
      rec.authoredSource = null;
      rec.authoredSeat = null;
      rec.fallbackGroup = null;
      rec.proceduralFallback = false;
      return;
    }
    if (rec.authoredSeat && rec.authoredSeat.parent) rec.authoredSeat.parent.remove(rec.authoredSeat);
    const source = rec.authoredSource;
    rec.authoredSeat = null;
    rec.authoredSource = null;
    if (source && worksLoader) worksLoader.releaseWorksPart(source);
  }

  function buildMachineAt(m) {
    const kind = MACHINE_KIND[m.defId] || 'fabricator';
    const authoredKind = authoredWorksMachineKind(m.defId);
    const built = authoredKind
      ? { group: new THREE.Group(), dyn: {}, pulses: [] }
      : makeMachine(kind, S, envMap);
    if (!authoredKind) ownProceduralMachine(built.group);
    built.group.name = authoredKind ? `authored_${authoredKind}_mount` : built.group.name;
    built.group.position.set(worldX(m.col), worldY(m.row), 0);
    siteRoot.add(built.group);
    const rec = {
      machineId: m.id,
      group: built.group, defId: m.defId, dyn: built.dyn || {}, col: m.col, row: m.row,
      geoSig: '', arms: null, pulses: built.pulses || [], alive: true,
      authoredSource: null, authoredSeat: null,
      proceduralFallback: false, fallbackGroup: null, cargoLifecycle: null, gasLifecycle: null,
    };
    machines.set(m.id, rec);
    if (authoredKind === 'cargo_port') void ensureCargoPortInstallLifecycle(rec).rebuild();
    else if (authoredKind === 'gas_tap') void ensureGasTapInstallLifecycle(rec).rebuild();
    else if (authoredKind) void mountAuthoredMachine(rec, authoredKind);
    return rec;
  }

  function removeMachine(id) {
    const rec = machines.get(id);
    if (!rec) return;
    releaseAuthoredMachine(rec);
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

  // Contact arms follow the LIVE drill field, not the cached projection's geo object. That geo is
  // an alias of rt.geo[id], which is replaced wholesale when a neighbour is bored; until the
  // screen's projection cache catches up the arms would keep clamping a cell that is already hollow.
  const contactSigParts = [];
  function liveContactSig(col, row) {
    contactSigParts.length = 0;
    for (let i = 0; i < CONTACT_RING.length; i++) {
      const dc = CONTACT_RING[i][0], dr = CONTACT_RING[i][1];
      const c = col + dc, r = row + dr;
      const tile = (c >= 0 && c < COLS && r >= 0 && r < ROWS && field && field[c]) ? field[c][r] : null;
      const kind = contactKind(tile);
      contactSigParts.push(`${c},${r},${kind},${kind === 'ore' ? (tile.ore || '') : ''}`);
    }
    return contactSigParts.join(';');
  }

  function syncMachineArms(rec) {
    const isContact = rec.defId === 'sm_extractor' || rec.defId === 'sm_gas_tap';
    const sig = isContact && field ? liveContactSig(rec.col, rec.row) : '';
    if (sig === rec.geoSig) return;
    rec.geoSig = sig;
    if (rec.arms) {
      rec.group.remove(rec.arms);
      disposeGroup(rec.arms);
      rec.arms = null;
    }
    if (!isContact || !field) return;
    const arms = new THREE.Group();
    for (let i = 0; i < CONTACT_RING.length; i++) {
      const dc = CONTACT_RING[i][0], dr = CONTACT_RING[i][1];
      const c = rec.col + dc, r = rec.row + dr;
      const tile = (c >= 0 && c < COLS && r >= 0 && r < ROWS && field[c]) ? field[c][r] : null;
      const kind = contactKind(tile);
      if (kind === 'empty') continue;
      if (rec.defId === 'sm_gas_tap' && kind !== 'gas') continue;
      const cell = { col: c, row: r, kind, ore: kind === 'ore' ? tile.ore : null };
      const dx = Math.sign(c - rec.col);
      const dy = -Math.sign(r - rec.row); // world y is up; rows grow down
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
    wantChipsUsed = 0;
    if (site) {
      for (const m of site.machines) {
        seen.add(m.id);
        let rec = machines.get(m.id);
        if (!rec || rec.defId !== m.defId || rec.col !== m.col || rec.row !== m.row) {
          if (rec) removeMachine(m.id);
          rec = buildMachineAt(m);
        }
        const pm = projection && projection.machines ? projection.machines.find((x) => x.id === m.id) : null;
        // KNOWN LIMIT: pm.status aliases rt.status, which asteroidSites replaces every tick
        // (asteroidSites.js:1468-1470). Under this screen that replacement is unreachable except
        // one open-during-tick window: tetherGameplay emits drill:approachCompleted
        // (tetherGameplay.js:1139), uiRoot.js:948 pushes this screen synchronously, then
        // asteroidSites still runs later in the same update (authoritativeSystemManifest.js:66-69).
        // Closing it needs a generation counter on asteroidSites — out of this lane.
        const status = pm ? pm.status : null;
        const state = (status && status.state) || 'idle';
        syncMachineArms(rec);
        // Law §5 "Machine placed": a 120ms settle. The housing lands a touch proud of its socket
        // and drops into it — the same body seating itself, not a crossfade between two objects.
        const settleLeft = settles.get(tileIndex(m.col, m.row));
        const settling = settleLeft !== undefined;
        if (settling) {
          const u = 1 - settleLeft / SETTLE_S;          // 0 at the snap, 1 when it is seated
          rec.group.scale.setScalar(1 + 0.13 * (1 - u) * (1 - u));
          rec.group.position.z = S * 0.1 * (1 - u);
        } else if (rec.group.scale.x !== 1) {
          rec.group.scale.setScalar(1);
          rec.group.position.z = 0;
        }
        if (rec.dyn.lamp) {
          // Law §5 "Machine starved/unpowered": THE MACHINE GOES DARK. The fault is told by the
          // gold want chip above it, not by an alarm-coloured lamp — a blinking beacon on every
          // stalled housing is exactly the console voice §2.4 deletes. During the settle the lamp
          // lights mint whatever the projection says, because the projection has not run yet.
          const fault = FAULT_STATES.has(state);
          // PQ-130.10b: FAULTED IS NOT STARVED. A machine seated against the wrong rock, or bolted
          // to no lane at all, is not waiting for a delivery — nothing is coming, and the gold want
          // chip has nothing to ask for. That one keeps a lit CORAL lamp (§3.2 "cost you can't
          // pay"). Hungry machines keep .07's dark housing exactly as shipped.
          const coral = !settling && CORAL_FAULTS.has(state);
          const hex = settling ? 0x7cd9a2 : statusColorHex(status);
          const lampMats = rec.dyn.lampMats && rec.dyn.lampMats.length
            ? rec.dyn.lampMats
            : [rec.dyn.lamp];
          for (let i = 0; i < lampMats.length; i++) {
            lampMats[i].color.setHex(hex);
            lampMats[i].emissive.setHex(hex);
            lampMats[i].emissiveIntensity = settling ? 1.2 : (coral ? 0.62 : (fault ? 0.06 : 0.9));
          }
        }
        if (rec.dyn.lampAnchor) {
          // Law §7: at the site register the same drawing simplifies to "lines, lamps, flows". A
          // lamp built for a 110px cell is 2px on a 19px one — not a lamp, a speck. The fixture
          // holds a 5px floor so mint-vs-dark is still the first thing the whole body says.
          const lampPx = S * 0.11 * pxPerWorldUnit();
          rec.dyn.lampAnchor.scale.setScalar(Math.max(1, 5 / Math.max(0.001, lampPx)));
        }
        const running = state === 'running' || state === 'throttled' || state === 'limited';
        rec.lightRunning = running;
        rec.lightState = state;
        if (rec.dyn.setOrbitTheta) rec.dyn.setOrbitTheta(motionReduce ? 0.8 : timeS * 1.1);
        else if (rec.dyn.orbit) rec.dyn.orbit.rotation.z = motionReduce ? 0.8 : timeS * 1.1;
        if (rec.dyn.setWallYaw) rec.dyn.setWallYaw(resolveGasTapWallYaw(field, rec.col, rec.row));
        if (rec.dyn.setWheelSpin) {
          const active = running || !!(status && status.genMW);
          rec.dyn.setWheelSpin(motionReduce ? (active ? 0.4 : 0) : (active ? timeS * 2.4 : 0));
        }
        if (rec.dyn.setNeedleAmount) rec.dyn.setNeedleAmount(gasTapNeedleAmount(status));
        if (rec.dyn.turbine) {
          rec.dyn.turbine.rotation.z = motionReduce
            ? 0.4 : timeS * ((status && status.genMW) ? 5 : 0.5);
        }
        if (rec.dyn.piston) {
          const bob = motionReduce || !running ? 0 : Math.abs(Math.sin(timeS * 3.1)) * S * 0.09;
          rec.dyn.piston.position.x = rec.dyn.pistonBase - bob;
        }
        if (rec.dyn.setBeltPhase) {
          rec.dyn.setBeltPhase(timeS * 0.58, running && !motionReduce);
        }
        if (rec.dyn.setFurnaceIntensity || rec.dyn.furnace || (rec.dyn.furnaceMats && rec.dyn.furnaceMats.length)) {
          const hot = running;
          const intensity = hot
            ? (motionReduce ? 1.5 : 1.25 + 0.55 * Math.sin(timeS * 5)) : 0.08;
          if (rec.dyn.setFurnaceIntensity) rec.dyn.setFurnaceIntensity(intensity);
          else {
            const furnaceMats = rec.dyn.furnaceMats && rec.dyn.furnaceMats.length
              ? rec.dyn.furnaceMats
              : [rec.dyn.furnace];
            for (let i = 0; i < furnaceMats.length; i++) furnaceMats[i].emissiveIntensity = intensity;
          }
        }
        if (rec.dyn.setProgress || rec.dyn.progressBar) {
          const p = status && Number.isFinite(status.progress) ? Math.max(0, Math.min(1, status.progress)) : 0;
          // The gantry head TRAVELS its rail. Same 0..1 contract, a mechanism instead of a bar.
          if (rec.dyn.setProgress) rec.dyn.setProgress(p);
          else rec.dyn.progressBar.position.x = rec.dyn.progressBase + rec.dyn.progressTravel * p;
        }
        if (rec.dyn.setPodLaunch) {
          const launch = cargoLaunch.sample();
          const ready = !!(site.fleet && site.fleet.podsReady > 0);
          rec.dyn.setPodVisible(launch.visible || ready);
          rec.dyn.setPodLaunch(launch.pose);
        } else if (rec.dyn.pod) rec.dyn.pod.visible = !!(site.fleet && site.fleet.podsReady > 0);
        // The want chip: what this machine is waiting for, as a colour or a bolt. `status.limit`
        // is the sim's own answer — `input:<goodId>` when a recipe is starved, `power` when the
        // bus cannot feed it — so the chip names the real shortage, not a guess from the state name.
        if (FAULT_STATES.has(state) && zoomKCur > 0.5) {
          const limit = (status && status.limit) || (state === 'no-power' ? 'power' : null);
          if (limit === 'power' || state === 'no-power') {
            emitWantChip('power', '#ffb648', worldX(m.col), worldY(m.row));
          } else if (typeof limit === 'string' && limit.startsWith('input:')) {
            const goodId = limit.slice(6);
            const swatch = (ORE_TINTS[goodId] || {}).vein || '#bfae94';
            emitWantChip(`in:${goodId}`, swatch, worldX(m.col), worldY(m.row));
          }
        }
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
      else if (FAULT_STATES.has(st)) rank = 1;   // a dim ember so a dark housing is still an object
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
        // Law §5 "Machine starved/unpowered": the machine GOES DARK. Its hue still says which
        // fault (that is .03's language, untouched) — it just stops being a beacon, because the
        // gold want chip above it is now the thing carrying the attention.
        l.intensity = pick.rank === 2 ? 2.1 : 0.45;
      }
    }
  }

  // ---------------------------------------------------------------- overlays (conduits)
  // PQ-130.10b, law §7. The runs rebuild on TOPOLOGY ONLY — which cells carry which overlay, where
  // the machines are, and which zoom register is drawing (site zoom sheds the armour so a 19px cell
  // gets a clean line instead of moire). Everything that MOVES — powered vs dark, island vs live, a
  // lane's flow — is a per-frame material read in syncNetworks(); a state change must never cost a
  // geometry rebuild.
  function overlaySignature(site, projection = null) {
    if (!site) return `none|${zoomRegister}`;
    let h = 17;
    for (const i of site.overlays.power) h = (h * 31 + i + 1) | 0;
    h = (h * 37 + 7) | 0;
    for (const i of site.overlays.lane) h = (h * 31 + i + 1) | 0;
    h = (h * 37 + site.machines.length) | 0;
    for (const m of site.machines) h = (h * 31 + tileIndex(m.col, m.row)) | 0;
    // THE COMPONENT PARTITION IS PART OF THE TOPOLOGY. The runs are bucketed by the projection's own
    // components, and the screen hands the renderer a CACHED projection — so on the frame a newly
    // painted cell changes `site.overlays`, `getProjection()` can still be the answer computed
    // before it, whose components know nothing about the new cell. Hashing the partition itself
    // means the runs re-bucket the moment the sim's answer catches up, instead of being stranded in
    // an unknown bucket forever (measured: every run came back keyed `_` and drew dead).
    let ph = 5;
    if (projection) {
      for (const comp of projection.power) ph = (((ph * 31) ^ hash32(comp.cells.length, comp.cells[0] || 0, 11)) | 0);
      for (const comp of projection.lanes) ph = (((ph * 33) ^ hash32(comp.cells.length, comp.cells[0] || 0, 12)) | 0);
    } else ph = 0;
    // The solved run width depends on the canvas, so a resize is a topology change for this layer.
    return `${h}|${zoomRegister}|${ph}|${Math.round(registerPxPerWu(zoomRegister))}`;
  }

  function conduitDynamicMeshes(group, family) {
    const hook = family === 'power' ? 'powered' : 'flow_mesh';
    return collectNamedMeshes(group, (name) => {
      const stem = String(name || '').replace(/^LOD[012]_/, '');
      return stem === hook;
    });
  }

  function resolveAuthoredOverlayPieces(desired) {
    // A junction is a service variant of a real four-port crossing, never a phantom arm. Pick the
    // lowest-index cross in each live sim component; all later four-way cells use the plain cross.
    const serviceCellByNetwork = new Map();
    for (let i = 0; i < desired.length; i++) {
      const rec = desired[i];
      if (rec.mask !== 15) continue;
      const serviceKey = `${rec.family}:${rec.key}`;
      const prior = serviceCellByNetwork.get(serviceKey);
      if (prior == null || rec.idx < prior) serviceCellByNetwork.set(serviceKey, rec.idx);
    }
    return desired.map((rec) => {
      // A lone painted cell is the existing physical stub: give its end fitting a stable direction
      // without claiming that it connects to a neighbour in the sim.
      const visualMask = rec.mask || [1, 2, 4, 8][hash32(rec.idx, rec.family === 'power' ? 61 : 67) & 3];
      const serviceKey = `${rec.family}:${rec.key}`;
      const piece = resolveWorksConduitPiece(rec.family, visualMask, {
        service: rec.mask === 15 && serviceCellByNetwork.get(serviceKey) === rec.idx,
      });
      return { ...rec, ...piece };
    });
  }

  function prepareAuthoredOverlay(source, rec) {
    const dynamicMeshes = conduitDynamicMeshes(source, rec.family);
    const owned = [];
    const mats = isolateWorksMeshMaterials(dynamicMeshes, owned);
    if (!mats.length) return null;
    recordWorksInstanceResources(source, owned);

    // Source GLBs are Blender Z-up exported as glTF Y-up. The inner +90° X seat maps the
    // authored mount plane onto the Works XY board; the outer Z rotation maps exact ports.
    source.position.set(0, 0, 0);
    source.rotation.set(Math.PI / 2, 0, 0);
    source.scale.set(1, 1, 1);
    const seat = new THREE.Group();
    seat.name = `authored_${rec.assetId}_${rec.idx}`;
    seat.position.set(worldX(rec.c), worldY(rec.r) + rec.off, Z.overlay);
    seat.rotation.z = rec.rotation;
    seat.add(source);
    return { ...rec, seat, mats, dynamicMeshes };
  }

  function disposeProceduralOverlayParts() {
    for (const part of overlayParts) {
      overlayRoot.remove(part.mesh);
      part.mesh.geometry.dispose();
      part.mat.dispose();
    }
    overlayParts.length = 0;
    for (const mesh of overlayCasings) {
      overlayRoot.remove(mesh);
      mesh.geometry.dispose();
    }
    overlayCasings.length = 0;
  }

  function ensureConduitMountLifecycle() {
    if (conduitMountLifecycle) return conduitMountLifecycle;
    conduitMountLifecycle = createConduitMountLifecycle({
      async load(rec) {
        const loader = ensureWorksLoader();
        return loader ? loader.loadWorksPart(rec.assetId) : null;
      },
      prepare: prepareAuthoredOverlay,
      mount(record) {
        overlayRoot.add(record.seat);
        authoredOverlayParts.push(record);
      },
      unmount(record) {
        overlayRoot.remove(record.seat);
        const at = authoredOverlayParts.indexOf(record);
        if (at >= 0) authoredOverlayParts.splice(at, 1);
      },
      release(source) {
        const loader = worksLoader;
        if (loader) loader.releaseWorksPart(source);
        else if (source && source.parent) source.parent.remove(source);
      },
      buildFallback(desired) {
        buildProceduralOverlays(desired);
        return { pieces: desired.length };
      },
      disposeFallback() {
        disposeProceduralOverlayParts();
      },
      isClosed: () => worksTearingDown || disposed || glTeardownDone,
    });
    return conduitMountLifecycle;
  }

  function disposeOverlayParts(reason = 'cancelled') {
    if (conduitMountLifecycle) conduitMountLifecycle.cancel(reason);
    else disposeProceduralOverlayParts();
    // A lifecycle cancellation removes every authored/fallback body. Flow is separate dynamic
    // presentation state and is retired with the same topology generation.
    if (authoredOverlayParts.length) {
      // Defensive only: the lifecycle owns this list. A non-empty residue indicates a callback
      // failed, but detached seats must still not survive renderer teardown.
      for (const rec of authoredOverlayParts) overlayRoot.remove(rec.seat);
      authoredOverlayParts.length = 0;
    }
    laneFlows.length = 0;
    flowDots.count = 0;
  }

  // mergeBufferGeometriesCompat needs an index on every input; the authored network bodies come
  // back non-indexed from mergeGeometries. A sequential index costs nothing and keeps one merge
  // path instead of two.
  function ensureIndexed(g) {
    if (g.index) return g;
    const n = g.attributes.position.count;
    const arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) arr[i] = i;
    g.setIndex(new THREE.BufferAttribute(arr, 1));
    return g;
  }

  const popcount4 = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

  // Screen pixels per world unit at a register's SETTLED zoom. Deliberately not pxPerWorldUnit():
  // that reads the live eased camera, and any geometry keyed to it would rebuild on every frame of
  // a 180ms zoom detent.
  function registerPxPerWu(reg) {
    const k = reg === 'site' ? siteZoomK() : 1;
    const halfW = workHalfW() / Math.max(0.001, k);
    return (canvas.clientHeight || 1) / (2 * (halfW / canvasAspect()));
  }

  function overlayBuildPlan(site, projection = null) {
    const desired = [];
    const siteReg = zoomRegister === 'site';
    const machineCells = new Set(site.machines.map((m) => tileIndex(m.col, m.row)));
    // WHERE THE ISLANDS COME FROM: the projection's own connected components, not a second flood
    // fill in the renderer. A drawn island that disagrees with the economy's island is worse than
    // no island drawing at all. No projection yet -> one unknown bucket that draws dead, which is
    // the honest picture of "the sim has not answered".
    const compOf = { lane: new Map(), power: new Map() };
    if (projection) {
      for (const comp of projection.power) for (const idx of comp.cells) compOf.power.set(idx, comp.key);
      for (const comp of projection.lanes) for (const idx of comp.cells) compOf.lane.set(idx, comp.key);
    }
    // WIDTHS ARE PER REGISTER, THE BODIES ARE NOT. An earlier build stripped the armour at site zoom
    // to avoid moire and the runs became flat coloured lines drawn on the rock — the owner's exact
    // complaint. The armour, the tray, the clamps and the junction boxes are present at BOTH
    // registers; what changes is the CROSS SECTION, widened at whole-body zoom so a real conduit
    // survives a 19px cell instead of collapsing into a hairline.
    // At the site register the cell can be anywhere from 19px (1920x1080) down to the law's 12px
    // floor (1280x720), so a FIXED cell fraction is a conveyor on one screen and a hairline on the
    // other — measured: 8.3px at 1080p, 5.4px at 720p. The width is solved against the register's
    // own nominal scale instead, and clamped so it can never eat the cell either.
    const regPxPerCell = S * registerPxPerWu(zoomRegister);
    const solve = (minFrac, maxFrac, wantPx) => (siteReg
      ? Math.min(maxFrac, Math.max(minFrac, wantPx / Math.max(1, regPxPerCell)))
      : minFrac);
    const laneW = solve(0.34, 0.54, 7.2);
    const powerW = solve(0.2, 0.34, 4.6);
    const offW = siteReg ? S * Math.max(0.26, (laneW + powerW) / 2 * 1.12) : S * 0.17;
    const kinds = [
      {
        name: 'lane', cells: new Set(site.overlays.lane), coreMat: laneCoreMat, tray: true,
        w: laneW, coreK: 0.34, off: offW,
      },
      {
        name: 'power', cells: new Set(site.overlays.power), coreMat: powerCoreMat, tray: false,
        w: powerW, coreK: 0.36, off: offW,
      },
    ];
    const shared = new Set([...kinds[0].cells].filter((i) => kinds[1].cells.has(i)));
    for (const kind of kinds) overlayWidth[kind.name] = kind.w;
    overlayWidth.regPxPerCell = regPxPerCell;
    for (const kind of kinds) {
      const has = (c, r) => {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
        const idx = tileIndex(c, r);
        return kind.cells.has(idx) || machineCells.has(idx);
      };
      for (const idx of kind.cells) {
        const c = idx % COLS;
        const r = Math.floor(idx / COLS);
        // Shared cells split off the centreline so the two systems read in parallel (2D §2 rule).
        const off = shared.has(idx) ? (kind.name === 'lane' ? -kind.off : kind.off) : 0;
        const key = compOf[kind.name].get(idx) || '_';
        const mask = connectivityMask(has, c, r);
        desired.push({
          family: kind.name,
          idx,
          c,
          r,
          key,
          mask,
          off,
          w: kind.w,
          coreK: kind.coreK,
          tray: kind.tray,
          coreMat: kind.coreMat,
        });
      }
    }
    return {
      desired: resolveAuthoredOverlayPieces(desired),
      shared,
      laneOff: kinds[0].off,
    };
  }

  function buildProceduralOverlays(desired) {
    disposeProceduralOverlayParts();
    const trayGeos = [];
    for (const family of ['lane', 'power']) {
      const records = desired.filter((rec) => rec.family === family);
      if (!records.length) continue;
      const kind = records[0];
      const casingGeos = [];
      const coreByComp = new Map();
      const pushCore = (key, g) => {
        let list = coreByComp.get(key);
        if (!list) { list = []; coreByComp.set(key, list); }
        list.push(g);
      };
      const W = S * kind.w;
      const arms = [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]];
      // One armed section of run, built in the arm's own frame and then rotated into place.
      const place = (g, ang, x, y, z) => { g.rotateZ(ang); g.translate(x, y, z); return g; };
      for (const rec of records) {
        const { c, r, key, mask, off } = rec;
        const cx = worldX(c);
        const cy = worldY(r) + off;
        let any = false;
        for (const [bit, dc, dr] of arms) {
          if (!(mask & bit)) continue;
          any = true;
          const dx = dc, dy = -dr;
          const len = S * 0.5 + S * 0.06;
          const ang = Math.atan2(dy, dx);
          const mx = cx + dx * len / 2;
          const my = cy + dy * len / 2;
          if (rec.tray) {
            // A COVERED CONVEYOR: bolted floor plate, two side rails, a narrow lit channel down the
            // middle and a glass lid. The flow dots ride between the rails, under the lid.
            casingGeos.push(place(new THREE.BoxGeometry(len, W, S * 0.05), ang, mx, my, Z.overlay));
            for (const sy of [-1, 1]) {
              const rail = new THREE.BoxGeometry(len, W * 0.15, S * 0.2);
              rail.translate(0, sy * (W / 2 - W * 0.075), 0);
              casingGeos.push(place(rail, ang, mx, my, Z.overlay + 0.1));
            }
            pushCore(key, place(new THREE.BoxGeometry(len, W * rec.coreK, S * 0.05), ang, mx, my, Z.overlay + 0.04));
            trayGeos.push(place(new THREE.BoxGeometry(len, W * 0.92, S * 0.035), ang, mx, my, Z.overlay + 0.21));
          } else {
            // ARMOURED CABLE: a dark casing bolted to the floor with the conductor lit inside it.
            casingGeos.push(place(new THREE.BoxGeometry(len, W, S * 0.14), ang, mx, my, Z.overlay + 0.02));
            pushCore(key, place(new THREE.BoxGeometry(len, W * rec.coreK, S * 0.16), ang, mx, my, Z.overlay + 0.06));
          }
        }
        // Per-cell fitting: a saddle clamp on the cable, a cross strap over the tray. Present at
        // BOTH registers — this is the hardware that stops a run reading as a drawn line.
        if (rec.tray) {
          const strap = new THREE.BoxGeometry(S * 0.1, W * 1.06, S * 0.07);
          strap.translate(cx, cy, Z.overlay + 0.25);
          casingGeos.push(strap);
        } else {
          const clamp = new THREE.CylinderGeometry(W * 0.62, W * 0.7, S * 0.16, 10);
          clamp.rotateX(Math.PI / 2);
          clamp.translate(cx, cy, Z.overlay + 0.04);
          casingGeos.push(clamp);
        }
        // A JUNCTION IS A FITTING. Three or more runs meeting gets a bolted box, so a branch is an
        // object you can see rather than two painted lines crossing. It carries its network's own
        // colour, so a node on a dead island goes dead with it.
        if (popcount4(mask) >= 3) {
          const jg = ensureIndexed(junctionNodeGeo.clone());
          const k = S * (rec.tray ? 1.25 : 1);
          jg.scale(k, k, k);
          jg.translate(cx, cy, Z.overlay + (rec.tray ? 0.16 : 0.06));
          pushCore(key, jg);
        }
        if (!any) {
          // Isolated cell — a lit stub so a lone painted tile still reads as live hardware.
          const dot = new THREE.CylinderGeometry(W * 0.4, W * 0.4, S * 0.18, 10);
          dot.rotateX(Math.PI / 2);
          dot.translate(cx, cy, Z.overlay + 0.08);
          pushCore(key, dot);
        }
      }
      if (casingGeos.length) {
        const mergedGeo = mergeBufferGeometriesCompat(casingGeos);
        if (mergedGeo) {
          const mesh = new THREE.Mesh(mergedGeo, casingMat);
          // IT HAS TO THROW A SHADOW OR IT IS A PAINTED LINE. Straight down at a 0.2-deep run you
          // see no side wall, so the ONLY thing that says "this is a body bolted to the floor" is
          // the raking key's shadow off the rails and clamps. Without castShadow the conduits read
          // exactly as the owner called them: flat yellow and blue lines drawn on the rock.
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          overlayRoot.add(mesh);
          overlayCasings.push(mesh);
        }
        for (const g of casingGeos) g.dispose();
      }
      for (const [key, geos] of coreByComp) {
        const mergedGeo = mergeBufferGeometriesCompat(geos);
        for (const g of geos) g.dispose();
        if (!mergedGeo) continue;
        // One material per NETWORK, cloned off the kind's template. Same defines, same program —
        // only color/emissiveIntensity ever move — so per-island state costs no shader recompile.
        const mat = kind.coreMat.clone();
        const mesh = new THREE.Mesh(mergedGeo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        overlayRoot.add(mesh);
        overlayParts.push({ kind: family, key, mat, mesh });
      }
    }
    if (trayGeos.length) {
      const trayGeo = mergeBufferGeometriesCompat(trayGeos);
      if (trayGeo) {
        const mesh = new THREE.Mesh(trayGeo, trayMat);
        mesh.renderOrder = 3;    // after the dots inside it
        overlayRoot.add(mesh);
        overlayCasings.push(mesh);
      }
      for (const g of trayGeos) g.dispose();
    }
  }

  function rebuildOverlays(site, projection = null) {
    laneFlows.length = 0;
    flowDots.count = 0;
    if (!site) {
      disposeOverlayParts(worksTearingDown ? 'disposed' : 'empty');
      return;
    }
    const plan = overlayBuildPlan(site, projection);
    // The flow rides the lane's OWN centreline, so it takes the offset this build actually used —
    // recomputing it here is how the dots ended up beside the tray instead of inside it.
    rebuildLaneFlows(site, projection, plan.shared, plan.laneOff);
    void ensureConduitMountLifecycle().rebuild(plan.desired).catch((error) => {
      console.error('[asteroidRenderer3d] authored Conduit transaction failed', error);
    });
  }

  // ---- lane flow routes (law §7: dots move TOWARD THE PORT) ------------------------------------
  // A route is a leaf-to-sink walk of one lane network, cached as a polyline with cumulative arc
  // length. The sink is the cargo port; with no port on that network the goods are heading for the
  // entry shaft, which is the only other way off this rock. Dots then ride arc length, so the
  // direction on the glass is the direction the economy actually moves stock.
  function rebuildLaneFlows(site, projection, shared, laneOff) {
    laneFlows.length = 0;
    if (!site || !projection) return;
    const portCells = new Set();
    for (const m of site.machines) {
      if (m.defId === 'sm_cargo_port') portCells.add(tileIndex(m.col, m.row));
    }
    const py = (idx) => worldY(Math.floor(idx / COLS)) - (shared.has(idx) ? laneOff : 0);
    for (const comp of projection.lanes) {
      const cells = new Set(comp.cells);
      let sink = -1;
      for (const idx of comp.cells) { if (portCells.has(idx)) { sink = idx; break; } }
      if (sink < 0) {
        let best = Infinity;
        for (const idx of comp.cells) {
          const score = Math.floor(idx / COLS) * 4 + Math.abs((idx % COLS) - ENTRY_COL);
          if (score < best) { best = score; sink = idx; }
        }
      }
      if (sink < 0) continue;
      const parent = new Map([[sink, -1]]);
      const order = [sink];
      for (let qi = 0; qi < order.length; qi++) {
        const idx = order[qi];
        const c = idx % COLS;
        const r = Math.floor(idx / COLS);
        for (const [dc, dr] of NBR4) {
          const nc = c + dc, nr = r + dr;
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
          const ni = tileIndex(nc, nr);
          if (!cells.has(ni) || parent.has(ni)) continue;
          parent.set(ni, idx);
          order.push(ni);
        }
      }
      const hasChild = new Set();
      for (const [, par] of parent) if (par >= 0) hasChild.add(par);
      const routes = [];
      for (const idx of order) {
        if (idx === sink || hasChild.has(idx)) continue;   // only a dead end starts a run
        const pts = [];
        let cur = idx;
        for (let guard = 0; cur >= 0 && guard < 4096; guard++) {
          pts.push([worldX(cur % COLS), py(cur)]);
          cur = parent.has(cur) ? parent.get(cur) : -1;
        }
        if (pts.length < 2) continue;
        const cum = [0];
        let len = 0;
        for (let i = 1; i < pts.length; i++) {
          len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          cum.push(len);
        }
        routes.push({ pts, cum, len });
      }
      routes.sort((a, b) => b.len - a.len);
      if (routes.length > 4) routes.length = 4;
      if (routes.length) laneFlows.push({ key: comp.key, routes, phase: 0 });
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

  // ---------------------------------------------------------------- networks, live (law §7)
  // Read the projection once, publish per-network state, then drive the jackets, the flow and the
  // port pile off it. NOTHING here rebuilds geometry: state moves every frame, topology does not.
  function syncNetworks(site, projection, dt, timeS) {
    netState.power.clear();
    netState.lane.clear();
    if (projection) {
      const running = new Set();
      for (const pm of projection.machines) {
        if (pm.status && RUNNING_STATES.has(pm.status.state)) running.add(pm.id);
      }
      for (const comp of projection.power) {
        // AN ISLAND IS A NET WITH NO GENERATOR ON IT. Cable bolted to rock, carrying nothing.
        netState.power.set(comp.key, {
          live: comp.gen > 0, ratio: comp.ratio, gen: comp.gen, draw: comp.draw,
        });
      }
      for (const comp of projection.lanes) {
        const active = comp.machineIds.some((id) => running.has(id));
        // `stored` may legally exceed capacity (the A10 over-capacity ruling), so the DISPLAY
        // density clamps — the dots must never claim a spacing tighter than a full lane's.
        const density = comp.capacity > 0 ? Math.min(1, comp.stored / comp.capacity) : 0;
        netState.lane.set(comp.key, {
          live: comp.machineIds.length > 0 && (comp.stored > 0 || active),
          active, density, stored: comp.stored, capacity: comp.capacity,
        });
      }
    }
    // The Network lens brightens what the base board already draws; it never invents a state.
    const lensK = lensName === 'network' ? 2.2 : 1;
    for (const part of overlayParts) {
      if (part.kind === 'power') {
        const st = netState.power.get(part.key);
        const live = !!(st && st.live);
        part.mat.color.copy(live ? CABLE_LIVE : CABLE_DEAD);
        // Ceiling pulled down from .03's 0.36: with the armour, clamps and cast shadow doing the
        // work, a hotter conductor only flattens the run back into a painted stripe.
        const base = live ? (st.ratio >= 1 ? 0.24 : 0.04 + st.ratio * 0.15) : 0.02;
        part.mat.emissiveIntensity = Math.min(0.9, base * lensK);
      } else {
        const st = netState.lane.get(part.key);
        const live = !!(st && st.live);
        part.mat.color.copy(live ? LANE_LIVE : LANE_DEAD);
        let base = 0.04;
        if (live) {
          base = st.active
            ? (motionReduce ? 0.22 : 0.17 + 0.08 * Math.sin(timeS * 4.2))
            : 0.1;    // stock parked on a stalled lane: lit, but not breathing
        }
        part.mat.emissiveIntensity = Math.min(0.9, base * lensK);
      }
    }
    for (const part of authoredOverlayParts) {
      const st = part.family === 'power'
        ? netState.power.get(part.key)
        : netState.lane.get(part.key);
      const live = !!(st && st.live);
      let color = part.family === 'power'
        ? (live ? CABLE_LIVE : CABLE_DEAD)
        : (live ? LANE_LIVE : LANE_DEAD);
      let emissiveIntensity = 0;
      let emissiveHex = 0x000000;
      if (part.family === 'power' && live) {
        emissiveHex = 0xffb648;
        emissiveIntensity = Math.min(0.55, (st.ratio >= 1 ? 0.18 : 0.03 + st.ratio * 0.12) * lensK);
      } else if (part.family === 'lane' && live) {
        // The accepted belt is a physical dark surface; activity is carried primarily by the
        // existing stock dots. This restrained floor prevents a live belt becoming a neon ribbon.
        emissiveHex = 0x5c7480;
        emissiveIntensity = Math.min(0.18, (st.active ? 0.07 : 0.035) * lensK);
      }
      for (let i = 0; i < part.mats.length; i++) {
        const mat = part.mats[i];
        if (mat.color) mat.color.copy(color);
        if (mat.emissive) mat.emissive.setHex(emissiveHex);
        if ('emissiveIntensity' in mat) mat.emissiveIntensity = emissiveIntensity;
      }
    }
    syncFlowDots(dt, lensK);
  }

  // Dots on the lane floor. Constant speed; the BUFFER sets the spacing, so a full lane reads as a
  // dense queue and a nearly-empty one as a trickle. A STALLED LANE'S DOTS STOP where they stand —
  // frozen stock on the track is exactly what a backlog looks like.
  function syncFlowDots(dt, lensK) {
    let used = 0;
    const pxPerWu = pxPerWorldUnit();
    // At the site register a work-zoom dot is under two pixels, which is the moire the law warns
    // about. Hold a 3.6px floor so the flow is still a legible row of beads on a 19px cell.
    const dotScale = Math.max(1, 3.6 / (0.115 * S * pxPerWu));
    for (const flow of laneFlows) {
      const st = netState.lane.get(flow.key);
      // A RUNNING LANE FLOWS EVEN WITH AN EMPTY BUFFER. Measured on the capture's producing site:
      // the extractor throttles, the refinery starves, and the network's stock sits at zero because
      // everything produced is consumed the same tick — a lane in continuous use. Gating the dots on
      // the buffer drew that as a DEAD lane, which is the opposite of the truth. Stock sets the
      // spacing (§7 "the buffer reads as dot density"); ACTIVITY decides whether anything moves.
      if (!st || (!st.active && st.stored <= 0)) continue;
      const moving = st.active && !motionReduce;
      flow.phase += moving ? FLOW_SPEED_WU * dt : 0;
      const gap = FLOW_GAP_EMPTY + (FLOW_GAP_FULL - FLOW_GAP_EMPTY) * st.density;
      for (const route of flow.routes) {
        const n = Math.max(1, Math.min(14, Math.floor(route.len / gap) + 1));
        for (let i = 0; i < n; i++) {
          if (used >= FLOW_DOT_MAX) break;
          const arc = (flow.phase + i * gap) % route.len;
          const pt = pointOnRoute(route, arc);
          // The authored belt sits slightly higher than the procedural tray floor. Keep the stock
          // beads above that belt but below its narrow guard; the fallback retains its old depth.
          const flowZ = authoredOverlayParts.length ? Z.overlay + 0.19 : Z.overlay + 0.115;
          dummy.position.set(pt[0], pt[1], flowZ);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(S * dotScale);
          dummy.updateMatrix();
          flowDots.setMatrixAt(used++, dummy.matrix);
        }
      }
    }
    flowDots.count = used;
    if (used) flowDots.instanceMatrix.needsUpdate = true;
    flowDots.visible = used > 0;
    flowDotMat.emissiveIntensity = Math.min(0.95, 0.42 * lensK);
  }

  function pointOnRoute(route, arc) {
    const { pts, cum } = route;
    let hi = 1;
    while (hi < cum.length - 1 && cum[hi] < arc) hi++;
    const lo = hi - 1;
    const span = cum[hi] - cum[lo];
    const t = span > 1e-6 ? (arc - cum[lo]) / span : 0;
    return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
  }

  // ---- the port stacks crates (law §7) -------------------------------------------------------
  // The pile is keyed to the port's current exportBuffer. The projection cache is not used here:
  // a reassigned buffer object leaves that cache pointing at the previous object, so the drawn
  // stage would depend on when the cache last refreshed rather than on the buffer that exists now.
  function crateStageFor(total) {
    if (!(total > 0)) return 0;
    if (total < 3) return 1;
    if (total < 6) return 2;
    if (total < 12) return 3;    // one pod-load (SITE_BALANCE.podCapacity)
    if (total < 24) return 4;
    return 5;
  }

  function authoredCargoRec() {
    for (const rec of machines.values()) {
      if (rec.defId === 'sm_cargo_port' && rec.dyn && rec.dyn.setCrateStage) return rec;
    }
    return null;
  }

  function syncCrates(site, projection) {
    const port = site ? site.machines.find((m) => m.defId === 'sm_cargo_port') : null;
    const total = site
      ? storeTotal(site.exportBuffer)
      : (projection ? storeTotal(projection.exportBuffer) : 0);
    const stage = port ? crateStageFor(total) : 0;
    crateStageNow = stage;
    const authored = authoredCargoRec();
    if (authored) {
      authored.dyn.setCrateStage(stage);
      if (crateMesh) crateMesh.visible = false;
      crateCell = stage ? [authored.col, authored.row] : null;
      return;
    }
    const pending = [...machines.values()].find((m) => (
      m.defId === 'sm_cargo_port' && m.cargoLifecycle && m.cargoLifecycle.stats().phase === 'loading'
    ));
    if (pending) {
      if (crateMesh) crateMesh.visible = false;
      crateCell = null;
      return;
    }
    if (!stage) { crateCell = null; if (crateMesh) crateMesh.visible = false; return; }
    if (!crateGeos[stage]) crateGeos[stage] = makeCrateStackGeo(stage);
    if (!crateMesh) {
      crateMesh = new THREE.Mesh(crateGeos[stage], crateMat);
      crateMesh.castShadow = true;
      crateMesh.receiveShadow = true;
      siteRoot.add(crateMesh);
    }
    if (crateMesh.geometry !== crateGeos[stage]) crateMesh.geometry = crateGeos[stage];
    // The pile stands on the tunnel floor BESIDE the port: freight a loader could drive up to.
    // MEASURED DEFECT, fixed here: the first build fell back to the port's OWN cell at floor height
    // whenever the four neighbours were taken — and the machine plinth is 0.94 cells wide and 0.14
    // deep, so the whole pile rendered inside it. `crateMesh.visible` was true, the check was green,
    // and the still showed no crates at all. The search now walks the eight neighbours and then a
    // ring further out, and the on-cell fallback stands the pile ON TOP of the plinth where it can
    // still be seen. `cell` is published so a check can tell a placed pile from a buried one.
    const blocked = (c, r) => {
      const tile = field && field[c] && field[c][r];
      if (!tile || tile.type !== 'empty') return true;
      if (site.machines.some((m) => m.col === c && m.row === r)) return true;
      const d = getDrill ? getDrill() : null;
      return !!(d && d.avatar && d.avatar.col === c && d.avatar.row === r);
    };
    // ADJACENT OR ON THE PORT — never further. A pile two cells up the shaft reads as the rover's
    // ore, not as the port's shipment; the whole point of the crates is whose output they are.
    let cell = null;
    for (const [dc, dr] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const c = port.col + dc;
      const r = port.row + dr;
      if (blocked(c, r)) continue;
      cell = [c, r];
      break;
    }
    // The on-port fallback stands the pile on the port's LOADING DECK, not on the floor beside it:
    // the cargo port's collar is 0.53 cells across and a pile at floor height simply hid behind it
    // (measured — one crate corner survived). From a straight-down camera "on top of" and "beside"
    // read the same, and only one of them is actually visible.
    crateMesh.scale.setScalar(cell ? S : S * 0.88);
    crateMesh.position.set(
      cell ? worldX(cell[0]) : worldX(port.col) - S * 0.2,
      (cell ? worldY(cell[1]) : worldY(port.row)) - (cell ? S * 0.26 : S * 0.24),
      cell ? Z.overlay - 0.03 : S * 0.72,
    );
    crateCell = cell;
    crateMesh.visible = true;
  }

  // ---- Faces: which seats a machine can take (law §6.5 / §6.7) --------------------------------
  // WHAT MINT MEANS, in the two contexts it can appear:
  //   • a placement ghost is up  -> mint = asteroidSites.canInstall(THAT machine).ok. The sim's own
  //     answer, so a mint cell can never disagree with the refusal the click would earn; a seat
  //     that fails gets one why-glyph plate carrying the sim's reason.
  //   • the Faces lens with nothing selected -> mint = GEOMETRIC SEATABILITY: hollow, in bounds,
  //     unoccupied, not the rover's cell, and touching at least one solid face (law §1.2 — a
  //     machine in a hollowed hall works nothing, so it is not a seat). Cost, adjacency and
  //     uniqueness are machine-specific and unknowable with nothing in hand, so they are NOT
  //     applied and nothing is glyphed as blocked.
  function facesFor(d, defId, timeS) {
    const sig = `${defId || ''}|${overlaySig}|${d.avatar.col},${d.avatar.row}`;
    // The signature covers topology and the rig; affordability moves on its own as production
    // runs, so a coarse clock re-asks anyway. Without it a mint seat could outlive the materials.
    if (sig === facesCache.sig && timeS - facesCache.t < 0.4) return facesCache;
    facesCache.sig = sig;
    facesCache.t = timeS;
    const seats = [];
    const blocked = [];
    const site = getSite ? getSite() : null;
    const taken = new Set(site ? site.machines.map((m) => tileIndex(m.col, m.row)) : []);
    const astId = d.asteroidId;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const tile = field[c] && field[c][r];
        if (!tile || tile.type !== 'empty') continue;   // solid rock is not a seat, and needs no plate
        let contact = 0;
        for (const [dc, dr] of NBR4) {
          const nc = c + dc, nr = r + dr;
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
          const nt = field[nc][nr];
          if (nt && nt.type !== 'empty') contact++;
        }
        if (!contact) continue;
        const idx = tileIndex(c, r);
        if (taken.has(idx)) { if (defId) blocked.push({ c, r, reason: 'occupied' }); continue; }
        if (d.avatar.col === c && d.avatar.row === r) {
          if (defId) blocked.push({ c, r, reason: 'rover-here' });
          continue;
        }
        if (!defId) { seats.push({ c, r }); continue; }
        let check = null;
        try {
          check = asteroidSites.canInstall({ asteroidId: astId, defId, col: c, row: r });
        } catch (_) { check = null; }
        if (check && check.ok) seats.push({ c, r });
        else blocked.push({ c, r, reason: (check && check.reason) || 'blocked' });
      }
    }
    facesCache.seats = seats;
    facesCache.blocked = blocked;
    return facesCache;
  }

  function whyPlate(reason, wx, wy) {
    let plate = whyPool[whyUsed];
    if (!plate) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
      const mesh = new THREE.Mesh(whyPlateGeo, mat);
      mesh.renderOrder = 28;
      mesh.frustumCulled = false;
      fxRoot.add(mesh);
      plate = { mesh, mat };
      whyPool.push(plate);
    }
    whyUsed++;
    let tex = whyTextures.get(reason);
    if (!tex) { tex = makeWhyGlyphTexture(reason); whyTextures.set(reason, tex); }
    plate.mat.map = tex;
    plate.mat.needsUpdate = true;
    // A CORNER STAMP, NOT A COVER. Centred and cell-sized the plate hid whatever it was explaining;
    // pinned small to the cell's top-left it reads as a tag on the block.
    plate.mesh.position.set(wx - S * 0.28, wy + S * 0.28, Z.face + 0.07);
    plate.mesh.scale.setScalar(S * 0.32);
    plate.mesh.visible = true;
  }

  // Auto-on while a ghost is live (law §6.5), otherwise only under the Faces lens. Seats are marked
  // with corner brackets on the block — never a painted face (owner ruling 2026-08-21).
  function syncFaces(d, ui, timeS) {
    const ghosting = !!(ui && ui.mode === 'build' && ui.buildKind === 'machine' && ui.buildDefId);
    const on = ghosting || lensName === 'faces';
    whyUsed = 0;
    facesShown = 0;
    if (!on || !field) {
      for (const plate of whyPool) plate.mesh.visible = false;
      return;
    }
    const res = facesFor(d, ghosting ? ui.buildDefId : null, timeS);
    for (const seat of res.seats) {
      if (facesShown >= 96) break;
      markSeat(seat.c, seat.r, 'seat');
      facesShown++;
    }
    // WHY-GLYPHS ARE LOCAL, AND ONLY WHERE THE BOARD DOES NOT ALREADY ANSWER. A plate reading
    // "a machine sits here" stacked on a visible machine, or "the rover is here" on the visible
    // rover, is clutter restating what the object under it already says — those two refusals get
    // the coral bracket and nothing else. The plates carry the causes you CANNOT see: an unpaid
    // cost, a rig too far away, a missing gas contact, a rule you have already spent.
    if (ghosting && ui.cursor) {
      const near = res.blocked
        .filter((b) => !SELF_EVIDENT_REFUSALS.has(b.reason))
        .map((b) => ({ ...b, d2: (b.c - ui.cursor.col) ** 2 + (b.r - ui.cursor.row) ** 2 }))
        .filter((b) => b.d2 <= 9)
        .sort((a, b) => a.d2 - b.d2)
        .slice(0, WHY_MAX);
      for (const b of near) whyPlate(b.reason, worldX(b.c), worldY(b.r));
    }
    for (let i = whyUsed; i < whyPool.length; i++) whyPool[i].mesh.visible = false;
  }

  function syncGrid(ui, dt) {
    const want = ui && ui.mode === 'build' ? GRID_BUILD_K : 0;
    gridK += (want - gridK) * Math.min(1, 9 * dt);
    if (Math.abs(gridK - want) < 0.0015) gridK = want;
    gridMat.opacity = gridK;
    gridPlane.visible = gridK > 0.004;
  }

  // ---- Plan lens numerals (law §6.5) ---------------------------------------------------------
  // Mono numerals only: a per-machine rate under every working housing and one port income chip.
  // Zero words, so the §11.3 budget is untouched and a lens can never turn the board into a table.
  function emitPlanChips(site, projection, workZoom) {
    if (!projection) return;
    if (workZoom) {
      for (const pm of projection.machines) {
        const st = pm.status;
        if (!st || !RUNNING_STATES.has(st.state)) continue;
        let rate = 0;
        for (const good of Object.keys(st.ratePerMin || {})) {
          rate += Math.max(0, Number(st.ratePerMin[good]) || 0);
        }
        if (!(rate > 0)) continue;
        emitChip(`${rate.toFixed(1)}/m`, worldX(pm.col), worldY(pm.row) - S * 0.56);
      }
    }
    const income = Number(projection.exportRatePerMin) || 0;
    if (income > 0) {
      const port = site ? site.machines.find((m) => m.defId === 'sm_cargo_port') : null;
      emitChip(
        `+${income.toFixed(1)}/m`,   // a leading + is the income tell; every mono face has it
        port ? worldX(port.col) : worldX(ENTRY_COL),
        (port ? worldY(port.row) : worldY(0)) + S * 0.66,
      );
    }
  }

  // ---- the lens cycle (law §6.5: V cycles, one at a time, Tab belongs to the drawers) ---------
  function setLens(name) {
    const next = LENS_ORDER.includes(name) ? name : null;
    if (next === lensName) return lensName;
    lensName = next;
    facesCache.sig = '';                 // a fresh lens re-asks the sim instead of showing a cache
    splitSig = '';                       // seam outlines carry the lens weight, so re-bake them
    if (lensName === 'network') pulseStarvedOnce();
    return lensName;
  }

  function cycleLens() {
    const at = lensName ? LENS_ORDER.indexOf(lensName) : -1;
    return setLens(at + 1 >= LENS_ORDER.length ? null : LENS_ORDER[at + 1]);
  }

  // "starved machines pulse gold ONCE" (law §6.5). One ring per fault at lens-on, not a heartbeat:
  // §3.4 forbids anything blinking at idle.
  function pulseStarvedOnce() {
    const projection = getProjection ? getProjection() : null;
    if (!projection) return;
    let n = 0;
    for (const pm of projection.machines) {
      if (!pm.status || !FAULT_STATES.has(pm.status.state)) continue;
      firePulseRing(pm.col, pm.row, 0xffb648, 0.9);
      if (++n >= 4) break;
    }
  }

  const onLensKey = (ev) => {
    if (ev.code !== 'KeyV' || ev.repeat || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    cycleLens();
    ev.preventDefault();
  };
  canvas.addEventListener('keydown', onLensKey);

  // ---------------------------------------------------------------- umbilical
  // The tether is the way home: a lit-core cable spooling off the surface derrick's winch drum,
  // down the entry shaft, along every cell the rig has visited, to the socket on its back.
  function syncUmbilical(d, roverX, roverY, moving, dt) {
    if (moving && derrickBuilt && derrickBuilt.dyn.setDrumSpin) {
      derrickDrumTheta += dt * 4.2;
      derrickBuilt.dyn.setDrumSpin(derrickDrumTheta);
    }
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
    const cableAnchor = derrickBuilt && derrickBuilt.dyn.cableAnchor;
    if (cableAnchor) cableAnchor.getWorldPosition(derrickCableWorld);
    else derrickCableWorld.set(worldX(ENTRY_COL), derrickBaseY + S * 1.14, Z.surface);
    const pts = [
      derrickCableWorld.clone(),
      new THREE.Vector3(worldX(ENTRY_COL), worldY(0) + S * 0.6, Z.rover - 0.15),
    ];
    for (const p of trail) pts.push(new THREE.Vector3(worldX(p.col), worldY(p.row), Z.rover - 0.1));
    pts.push(new THREE.Vector3(
      roverX - (roverAnim.flipY > Math.PI / 2 ? -1 : 1) * S * 0.45, roverY + S * 0.04, Z.rover - 0.05,
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
  function applyGhostTransparency(root, { disposeSource = false, instanceOwned = null } = {}) {
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const wasArray = Array.isArray(o.material);
      const cloned = (wasArray ? o.material : [o.material]).map((m) => {
        const t = m.clone();
        t.transparent = true;
        t.opacity = 0.55;
        t.depthWrite = false;
        t.side = THREE.FrontSide;
        t.alphaTest = 0;
        t.alphaMap = null;
        t.premultipliedAlpha = false;
        // Cargo (and some other Works) atlases store unused alpha ≈ 0. Transparent materials
        // then multiply to nothing. Keep albedo RGB and let opacity be the only fade.
        t.customProgramCacheKey = () => 'works-ghost-rgb-alpha';
        t.onBeforeCompile = (shader) => {
          if (!shader || typeof shader.fragmentShader !== 'string') return;
          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <map_fragment>',
              `#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor.rgb *= sampledDiffuseColor.rgb;
#endif`,
            )
            .replace(
              'diffuseColor *= sampledDiffuseColor;',
              'diffuseColor.rgb *= sampledDiffuseColor.rgb;',
            );
        };
        t.needsUpdate = true;
        t._own = true;
        if (instanceOwned) instanceOwned.push(t);
        if (disposeSource) m.dispose();
        return t;
      });
      o.material = wasArray ? cloned : cloned[0];
      o.castShadow = false;
      o.frustumCulled = false;
      o.renderOrder = 24;
    });
  }

  function clearGhost() {
    if (!ghost) return;
    ghost.alive = false;
    fxRoot.remove(ghost.group);
    if (ghost.cargoLifecycle) {
      ghost.cargoLifecycle.cancel('disposed');
    } else if (ghost.gasLifecycle) {
      ghost.gasLifecycle.cancel('disposed');
    } else if (ghost.authoredSource && worksLoader) {
      worksLoader.releaseWorksPart(ghost.authoredSource);
    } else if (!ghost.authoredPending) {
      disposeGroup(ghost.group);
    }
    ghost = null;
  }

  async function mountAuthoredMachineGhost(rec, kind) {
    const loader = ensureWorksLoader();
    if (!loader) return null;
    let source = null;
    const label = authoredWorksMachineLabel(kind);
    try {
      source = await loader.loadWorksPart(kind);
      if (!source) {
        rec.authoredPending = false;
        console.error(`[asteroidRenderer3d] authored ${label} ghost load failed; the build seat stays empty`);
        return null;
      }
      if (worksTearingDown || disposed || glTeardownDone || !rec.alive || ghost !== rec) {
        loader.releaseWorksPart(source);
        return null;
      }
      const instanceOwned = [];
      source.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const wasArray = Array.isArray(obj.material);
        const materials = wasArray ? obj.material : [obj.material];
        const clones = materials.map((material) => {
          const clone = material.clone();
          clone.transparent = true;
          clone.opacity = 0.45;
          clone.depthWrite = false;
          instanceOwned.push(clone);
          return clone;
        });
        obj.material = wasArray ? clones : clones[0];
        obj.castShadow = false;
      });
      recordWorksInstanceResources(source, instanceOwned);
      const seat = new THREE.Group();
      seat.name = `${kind}_ghost_seat`;
      seat.rotation.x = Math.PI / 2;
      seat.add(source);
      rec.group.add(seat);
      rec.authoredSource = source;
      rec.authoredPending = false;
      return source;
    } catch (error) {
      if (source) loader.releaseWorksPart(source);
      rec.authoredPending = false;
      console.error(`[asteroidRenderer3d] authored ${label} ghost mount failed; the build seat stays empty`, error);
      return null;
    }
  }

  function ensureGhost(defId) {
    if (ghost && ghost.defId === defId) return ghost;
    clearGhost();
    if (!defId) return null;
    const authoredKind = authoredWorksMachineKind(defId);
    if (authoredKind === 'cargo_port') {
      const group = new THREE.Group();
      group.name = 'authored_cargo_port_ghost_mount';
      group.renderOrder = 24;
      fxRoot.add(group);
      const rec = {
        defId,
        group,
        alive: true,
        authoredSource: null,
        authoredPending: true,
        proceduralFallback: false,
        cargoLifecycle: null,
      };
      ghost = rec;
      rec.cargoLifecycle = createCargoPortMountLifecycle({
        async load() {
          const loader = ensureWorksLoader();
          return loader ? loader.loadWorksPart('cargo_port') : null;
        },
        prepare(source) {
          const built = bindAuthoredCargoPort(source);
          built.dyn.setCrateStage(0);
          built.dyn.setPodVisible(true);
          built.dyn.setPodLaunch(0);
          const instanceOwned = [];
          applyGhostTransparency(built.group, { instanceOwned });
          recordWorksInstanceResources(source, instanceOwned);
          presentAuthoredCargoPortGhost(source);
          return built;
        },
        mount(record) {
          rec.group.add(record.group);
          rec.authoredSource = record.source;
          rec.authoredSeat = record.group;
          rec.dyn = record.dyn || {};
          rec.authoredPending = false;
          rec.proceduralFallback = false;
        },
        unmount(record) {
          if (record.group && record.group.parent) record.group.parent.remove(record.group);
          rec.authoredSource = null;
        },
        release(source) {
          if (worksLoader) worksLoader.releaseWorksPart(source);
        },
        buildFallback(reason) {
          rec.authoredPending = false;
          rec.proceduralFallback = true;
          console.error('[asteroidRenderer3d] authored Cargo Port ghost load failed; the procedural seat stands', reason);
          const built = makeMachine('cargo_port', S, envMap);
          applyGhostTransparency(built.group, { disposeSource: true });
          rec.group.add(built.group);
          rec.fallbackGroup = built.group;
          return built;
        },
        disposeFallback(built) {
          if (built && built.group) {
            if (built.group.parent) built.group.parent.remove(built.group);
            disposeGroup(built.group);
          }
          rec.fallbackGroup = null;
          rec.proceduralFallback = false;
        },
        isClosed: () => !rec.alive || ghost !== rec || worksTearingDown || disposed || glTeardownDone,
      });
      void rec.cargoLifecycle.rebuild();
      return rec;
    }
    if (authoredKind === 'gas_tap') {
      const group = new THREE.Group();
      group.name = 'authored_gas_tap_ghost_mount';
      group.renderOrder = 24;
      fxRoot.add(group);
      const rec = {
        defId,
        group,
        alive: true,
        authoredSource: null,
        authoredPending: true,
        proceduralFallback: false,
        gasLifecycle: null,
      };
      ghost = rec;
      rec.gasLifecycle = createGasTapMountLifecycle({
        async load() {
          const loader = ensureWorksLoader();
          return loader ? loader.loadWorksPart('gas_tap') : null;
        },
        prepare(source) {
          const built = bindAuthoredGasTap(source);
          built.dyn.setWheelSpin(0);
          built.dyn.setNeedleAmount(0);
          const instanceOwned = [];
          applyGhostTransparency(built.group, { instanceOwned });
          recordWorksInstanceResources(source, instanceOwned);
          presentAuthoredGasTapGhost(source);
          return built;
        },
        mount(record) {
          rec.group.add(record.group);
          rec.authoredSource = record.source;
          rec.authoredSeat = record.group;
          rec.dyn = record.dyn || {};
          rec.authoredPending = false;
          rec.proceduralFallback = false;
        },
        unmount(record) {
          if (record.group && record.group.parent) record.group.parent.remove(record.group);
          rec.authoredSource = null;
        },
        release(source) {
          if (worksLoader) worksLoader.releaseWorksPart(source);
        },
        buildFallback(reason) {
          rec.authoredPending = false;
          rec.proceduralFallback = true;
          console.error('[asteroidRenderer3d] authored Gas Tap ghost load failed; the procedural seat stands', reason);
          const built = makeMachine('gas_tap', S, envMap);
          applyGhostTransparency(built.group, { disposeSource: true });
          rec.group.add(built.group);
          rec.fallbackGroup = built.group;
          return built;
        },
        disposeFallback(built) {
          if (built && built.group) {
            if (built.group.parent) built.group.parent.remove(built.group);
            disposeGroup(built.group);
          }
          rec.fallbackGroup = null;
          rec.proceduralFallback = false;
        },
        isClosed: () => !rec.alive || ghost !== rec || worksTearingDown || disposed || glTeardownDone,
      });
      void rec.gasLifecycle.rebuild();
      return rec;
    }
    if (authoredKind) {
      const group = new THREE.Group();
      group.name = `authored_${authoredKind}_ghost_mount`;
      group.renderOrder = 24;
      fxRoot.add(group);
      const rec = {
        defId,
        group,
        alive: true,
        authoredSource: null,
        authoredPending: true,
      };
      ghost = rec;
      void mountAuthoredMachineGhost(rec, authoredKind);
      return rec;
    }
    const built = makeMachine(MACHINE_KIND[defId] || 'fabricator', S, envMap);
    applyGhostTransparency(built.group, { disposeSource: true });
    built.group.renderOrder = 24;
    fxRoot.add(built.group);
    ghost = { defId, group: built.group, alive: true, authoredSource: null, authoredPending: false };
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

  function seamOutlineColour(ore, siteReg = false) {
    // "a BRIGHTENED perimeter outline, the material's detail color" — the vein hue carried halfway
    // to its glint. The raw glint alone is near-white on the pale ores, and a white box around a
    // cell is a UI selection marker, not a seam.
    const t = ORE_TINTS[ore] || ORE_TINTS.cmdty_silicate;
    // At the site register the lift comes OFF: the glint on iron is a warm gold and at 19px cells
    // it competes with the rover for the same hue. Back on the material's own detail colour, and
    // a shade under it, the yellow rig wins its margin again (PQ-130.05's recorded defect).
    if (siteReg) return new THREE.Color(t.vein).multiplyScalar(0.82);
    return new THREE.Color(t.vein).lerp(new THREE.Color(t.glint || t.vein), 0.35);
  }

  // The inclusions themselves stop sparkling at the site register. Nineteen-pixel cells turn a
  // faceted crystal cluster into per-frame speckle — the moire the law names — so the ore drops its
  // specular and reads as one swatch of its own hue, which is all the body scale can carry anyway.
  let oreRegisterSig = '';
  function syncOreRegister() {
    const siteReg = zoomRegister !== 'work' || zoomKCur <= 0.82;
    const sig = `${siteReg ? 's' : 'w'}|${oreMats.size}`;
    if (sig === oreRegisterSig) return;
    oreRegisterSig = sig;
    for (const m of oreMats.values()) {
      if (m._awRough === undefined) {
        m._awRough = m.roughness;
        m._awMetal = m.metalness;
        m._awEnv = m.envMapIntensity;
      }
      // uniforms only — no defines move, so nothing here recompiles a shader
      m.roughness = siteReg ? Math.min(1, m._awRough + 0.3) : m._awRough;
      m.metalness = siteReg ? m._awMetal * 0.4 : m._awMetal;
      m.envMapIntensity = siteReg ? m._awEnv * 0.25 : m._awEnv;
    }
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

  // A square inner shadow: transparent through the middle, darkening only in the last fifth
  // toward each edge. Four linear gradients, one per side, composited — a radial gradient would
  // round the corners and the cell is a square (law §2.1).
  function makeInnerShadowTexture(size = 96) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const band = size * 0.22;
    const sides = [
      [0, 0, 0, band, 0, 0, size, band],
      [0, size, 0, size - band, 0, size - band, size, band],
      [0, 0, band, 0, 0, 0, band, size],
      [size, 0, size - band, 0, size - band, 0, band, size],
    ];
    for (const [gx0, gy0, gx1, gy1, rx, ry, rw, rh] of sides) {
      const grd = g.createLinearGradient(gx0, gy0, gx1, gy1);
      grd.addColorStop(0, 'rgba(10,7,4,0.85)');
      grd.addColorStop(1, 'rgba(10,7,4,0)');
      g.fillStyle = grd;
      g.fillRect(rx, ry, rw, rh);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

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
  // Screen pixels per world unit under the LIVE camera. Anything the law measures in pixels —
  // the 4px kick, the 1.5px hover outline, a 13px chip — solves its world size through this, so it
  // stays the size the law says at every zoom register and every window size.
  function pxPerWorldUnit() {
    return (canvas.clientHeight || 1) / (2 * viewHalfExtents().halfH);
  }

  function layoutChips() {
    const pxPerWu = pxPerWorldUnit();
    for (let i = 0; i < chipPool.length; i++) {
      const chip = chipPool[i];
      if (i >= chipsUsed) { chip.mesh.visible = false; continue; }
      chip.mesh.scale.set(chip.wPx / pxPerWu, chip.hPx / pxPerWu, 1);
    }
  }

  // ---------------------------------------------------------------- want chips (law §5)
  // "a small gold want chip floats above it showing the missing input's swatch or a power glyph."
  // A SWATCH OR A GLYPH — deliberately no words, so a starving site can never spend the screen's
  // 15-word budget (§11.3). Same mesh-pill construction as the seam counts, on its own pool.
  const WANT_H_PX = 22;
  function wantTexture(key, swatchHex) {
    let rec = wantTextures.get(key);
    if (rec) return rec;
    const SS = 3;
    const cv = document.createElement('canvas');
    cv.width = 34 * SS;
    cv.height = WANT_H_PX * SS;
    const g = cv.getContext('2d');
    const rr = cv.height / 2;
    g.beginPath();
    g.moveTo(rr, 0);
    g.arcTo(cv.width, 0, cv.width, cv.height, rr);
    g.arcTo(cv.width, cv.height, 0, cv.height, rr);
    g.arcTo(0, cv.height, 0, 0, rr);
    g.arcTo(0, 0, cv.width, 0, rr);
    g.closePath();
    g.fillStyle = 'rgba(34,28,21,0.94)';        // --aw-surface
    g.fill();
    g.lineWidth = 1.5 * SS;
    g.strokeStyle = '#ffb648';                  // --aw-gold: this machine WANTS something
    g.stroke();
    const cx = cv.width / 2;
    const cy = cv.height / 2;
    if (key === 'power') {
      // a bolt, drawn as a path — the one glyph everybody already reads
      g.beginPath();
      g.moveTo(cx + 2.4 * SS, cy - 6.2 * SS);
      g.lineTo(cx - 3.4 * SS, cy + 0.9 * SS);
      g.lineTo(cx - 0.2 * SS, cy + 0.9 * SS);
      g.lineTo(cx - 2.2 * SS, cy + 6.2 * SS);
      g.lineTo(cx + 3.6 * SS, cy - 0.9 * SS);
      g.lineTo(cx + 0.4 * SS, cy - 0.9 * SS);
      g.closePath();
      g.fillStyle = '#ffb648';
      g.fill();
    } else {
      // the missing input's own colour, as a chip of that material on a plate
      const w = 9 * SS;
      g.fillStyle = swatchHex;
      g.beginPath();
      g.moveTo(cx - w, cy - w * 0.78);
      g.lineTo(cx + w, cy - w * 0.9);
      g.lineTo(cx + w * 0.86, cy + w * 0.82);
      g.lineTo(cx - w * 0.92, cy + w * 0.7);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(12,9,6,0.7)';
      g.lineWidth = 1 * SS;
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    rec = { tex, wPx: cv.width / SS, hPx: WANT_H_PX };
    wantTextures.set(key, rec);
    return rec;
  }

  function emitWantChip(key, swatchHex, wx, wy) {
    let chip = wantChipPool[wantChipsUsed];
    if (!chip) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
      const mesh = new THREE.Mesh(seamChipGeo, mat);
      mesh.renderOrder = 27;
      mesh.frustumCulled = false;
      fxRoot.add(mesh);
      chip = { mesh, mat, wPx: 0, hPx: 0 };
      wantChipPool.push(chip);
    }
    wantChipsUsed++;
    const rec = wantTexture(key, swatchHex);
    chip.mat.map = rec.tex;
    chip.mat.needsUpdate = true;
    chip.wPx = rec.wPx;
    chip.hPx = rec.hPx;
    // it FLOATS: a slow bob above the housing, so a dark machine still moves on a still board
    const bob = motionReduce ? 0 : Math.sin(timeSNow * 2.1 + wx) * S * 0.045;
    // Straddling its OWN cell's top edge, not floating a whole cell clear of it: machines stack
    // vertically down a shaft, and a chip parked 0.72 cells up sat squarely on the housing above,
    // which reads as that machine's complaint rather than this one's.
    chip.mesh.position.set(wx, wy + S * 0.52 + bob, Z.face + 0.06);
    chip.mesh.visible = true;
  }

  function layoutWantChips() {
    const pxPerWu = pxPerWorldUnit();
    for (let i = 0; i < wantChipPool.length; i++) {
      const chip = wantChipPool[i];
      if (i >= wantChipsUsed) { chip.mesh.visible = false; continue; }
      chip.mesh.scale.set(chip.wPx / pxPerWu, chip.hPx / pxPerWu, 1);
    }
  }

  // ---------------------------------------------------------------- MK refusal (law §5)
  // Law §5 "Locked material": the bit skates off with 6-10 sparks over 300ms and the engraved MK
  // stamp fades in. The sim raises `drill:warn` reason `tier` for a locked face — but the screen
  // shell keeps that subscription for its alert slot and never forwards it to the renderer, and
  // the screen is not this leaf's to edit.
  //
  // It does not have to be. `drillSys.bus` IS the game bus, so the renderer subscribes to the
  // sim's own refusal receipt directly. That is the primary trigger, and it is the reliable one:
  // `avatar.drillBlocked` — the obvious-looking alternative — is set inside tickInput and then
  // cleared again by the input controller's own settleIntent() → clearCommand() → next tick, all
  // before the following render frame can sample it. Measured: polling it caught zero of the
  // refusals a real held keypress produced. The poll below is kept as a belt-and-braces edge (both
  // paths run through the same 5s suppression, so they can never double-speak).
  function refuseTier(col, row) {
    if (col == null || row == null) return;
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
    const idx = tileIndex(col, row);
    if (!allowRefusal(idx, 'tier')) return;
    const d = getDrill();
    // the bit SKATES: sparks thrown off the contact point, which is the face between rig and cell
    const dir = (d && d.avatar && d.avatar.faceDir) || 'down';
    let cx = col * TILE + TILE / 2;
    let cy = row * TILE + TILE / 2;
    if (dir === 'right') cx = col * TILE;
    else if (dir === 'left') cx = col * TILE + TILE;
    else if (dir === 'down') cy = row * TILE;
    else if (dir === 'up') cy = row * TILE + TILE;
    startSkate(cx, cy, 0xffc79a);        // warm, metallic — struck steel, never neon
    eventLog.refusals++;
    mark('refusal', col, row);
  }

  let warnUnsub = null;
  function subscribeWarn() {
    if (warnUnsub || !drillSys || !drillSys.bus || typeof drillSys.bus.on !== 'function') return;
    const off = drillSys.bus.on('drill:warn', (payload) => {
      const pl = payload || {};
      if (pl.reason !== 'tier' || !pl.pos) return;
      refuseTier(pl.pos.col, pl.pos.row);
    });
    warnUnsub = typeof off === 'function' ? off : null;
  }
  function unsubscribeWarn() {
    if (warnUnsub) { try { warnUnsub(); } catch (_) {} }
    warnUnsub = null;
  }

  function syncRefusal(d) {
    const blocked = !!(d.avatar && d.avatar.drillBlocked);
    const t = d.avatar && d.avatar.drillTarget;
    const idx = blocked && t ? tileIndex(t.col, t.row) : -1;
    if (!blocked) { blockedLatch = false; blockedCell = -1; return; }
    if (blockedLatch && idx === blockedCell) return;   // same refusal, still held
    blockedLatch = true;
    blockedCell = idx;
    if (!t) return;
    const tile = field[t.col] && field[t.col][t.row];
    if (!tile) return;
    // Which refusal? drill.js blocks on a machine housing and on the drill-tier gate; only the
    // second one is law §5's "Locked material".
    const structure = tile.type === 'empty' && tile.structure;
    const req = tile.tierReq || (tile.ore ? drillTierReqForOre(tile.ore) : 1);
    const reason = structure ? 'structure' : (drillSys.getDrillTier() < req ? 'tier' : 'other');
    if (reason !== 'tier') return;                     // the housing refusal is .09's ghost language
    refuseTier(t.col, t.row);
  }

  // ---------------------------------------------------------------- courier launch (law §5)
  // `site:courierLaunched` reaches the screen, not the renderer, and the screen is out of this
  // leaf's write set — but the sim increments `fleet.launches` on every departure, and that is a
  // read-only fact the renderer already holds. Baseline it on the first sighting of a site so
  // returning to a producing claim does not replay its whole shipping history.
  function syncCourier(site) {
    if (!site || !site.fleet) return;
    const n = Number(site.fleet.launches) || 0;
    if (lastLaunches === null) { lastLaunches = n; return; }
    if (n <= lastLaunches) return;
    lastLaunches = n;
    eventLog.courierLaunches++;
    mark('courierLaunch', ENTRY_COL, 0);
    const authored = authoredCargoRec();
    if (authored && authored.dyn && authored.dyn.setPodLaunch) {
      cargoLaunch.notifyLaunch();
      if (podMesh) podMesh.visible = false;
      return;
    }
    cargoLaunch.reset();
    if (!podMesh) {
      podMesh = new THREE.Mesh(podGeo, podMat);
      podMesh.castShadow = true;
      podMesh.scale.setScalar(S * 0.9);
      scene.add(podMesh);
    }
    podT = 0;
  }

  // Everything the seam layer draws, once per frame.
  function syncSeamAnnotations(d, site = null, projection = null) {
    if (seamsDirty) rebuildSeams();
    // Chips are a WORK-ZOOM instrument (law §3.5). At site zoom a 13px pill over a 16px cell is
    // noise, so the bodies keep their outlines and drop their counts.
    const workZoom = zoomRegister === 'work' && zoomKCur > 0.82;
    const siteReg = !workZoom;
    // PQ-130.10b site-register legibility. PQ-130.05 recorded the defect plainly: at the site
    // register the rover's safety-yellow margin over the gold seam outlines is thin, because the
    // brightened outline hue and the ore palette crowd the same part of the wheel at 19px cells.
    // Two fixes, both here: the outlines go THIN AND DIM at site zoom, and they drop the halfway
    // lift toward the glint so they sit back on the material's own detail colour instead of gold.
    seamLineMat.opacity = siteReg ? 0.2 : (lensName === 'plan' ? 0.78 : 0.56);

    const aim = aimCell(d);
    const aimIdx = aim ? tileIndex(aim.col, aim.row) : -1;
    const aimBody = aim ? seamOfCell.get(aimIdx) : null;
    const sig = `${seamSerial}|${aimBody ? aimBody.id : -1}|${aimIdx}|${siteReg ? 's' : 'w'}`;
    if (sig !== splitSig) {
      splitSig = sig;
      rebuildSeamLines(aimBody, aimIdx, siteReg);
    }

    chipsUsed = 0;
    // The Plan lens keeps the seam counts up at work zoom and adds the rates beside them.
    if (lensName === 'plan') emitPlanChips(site, projection, workZoom);
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
  function rebuildSeamLines(aimBody, aimIdx, siteReg = false) {
    const pos = [], col = [];
    const inset = S * 0.022;
    for (const b of seamBodies) {
      if (aimBody && b.id === aimBody.id) continue;
      if (b.count < SEAM_MIN_BODY) continue;
      const set = new Set(b.cells.map((cell) => cell.idx));
      perimeterInto(set, b.cells, inset, seamOutlineColour(b.ore, siteReg), pos, col);
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
    if (inclusionKitCatalog) {
      if (mkStamp) {
        oreRoot.remove(mkStamp);
        mkStamp = null;
      }
      if (idx !== mkStampCell) {
        mkStampCell = idx;
        if (idx >= 0) {
          clearAuthoredMkStamp();
          authoredMkStamp = makeAuthoredInclusion(
            'lock',
            aim.col,
            aim.row,
            padZ(aim.col, aim.row) + 0.012,
            'mk-lock',
          );
          authoredMkStamp.userData.worksInclusionTierReq = req;
          authoredMkStamp.traverse((obj) => {
            if (obj.isMesh) obj.renderOrder = 22;
          });
          oreRoot.add(authoredMkStamp);
        }
      }
      const target = idx >= 0 ? 1 : 0;
      mkStampT = Math.max(0, Math.min(1, mkStampT + (target ? dt / 0.6 : -dt / 0.2)));
      if (authoredMkStamp) {
        authoredMkStamp.visible = mkStampT > 0.015;
        authoredMkStamp.scale.setScalar(0.86 + mkStampT * 0.14);
      }
      return;
    }
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

    // ---- law §11.8 "Events on the board" (PQ-130.07) ----
    // A no-vision agent proves the event table through here: what the board last SAID, how many
    // times it said each thing, and the live magnitude of the two things §5 measures in pixels.
    // These are readings off the running expression, not a re-implementation of it: `kickPx` asks
    // the same function that is posing the camera this frame, and `floaters`/`oreChunks`/`vapor`
    // count the objects actually on the glass.
    events() {
      return {
        lastEvent: eventLog.lastEvent ? { ...eventLog.lastEvent } : null,
        yields: eventLog.yields,
        gasBreaches: eventLog.gasBreaches,
        refusals: eventLog.refusals,
        refusalsSuppressed: eventLog.refusalsSuppressed,
        cargoRefusals: eventLog.cargoRefusals,
        installs: eventLog.installs,
        courierLaunches: eventLog.courierLaunches,
      };
    },
    // The camera kick THIS FRAME, back in screen pixels — nonzero for 180ms after a breach.
    kickPx() {
      const w = kickOffsetWorld();
      const k = pxPerWorldUnit();
      return Math.hypot(w.x, w.y) * k;
    },
    // The coral edge vignette's live alpha (law §9: a vignette, never a modal). `full` reports
    // whether it covers the middle of the glass, so "it became a modal dimmer" is assertable.
    vignette() {
      const el = dom.flashGas;
      if (!el) return { alpha: 0, full: false };
      const cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
      const bg = cs ? cs.backgroundImage || '' : '';
      return {
        alpha: Number(el.style.opacity) || 0,
        full: !!bg && !/gradient/.test(bg),
        remainingS: timers.gasFlash,
      };
    },
    // Live counts of the board expressions, so "did anything actually get drawn" is a number.
    fx() {
      return {
        oreChunks: oreArcs.length,
        vapor: vapors.length,
        floaters: dom.floaters.length,
        particles: particles.length,
        wantChips: wantChipsUsed,
        skateLeft: skate.left,
        cellFlashS: cellFlash.t,
        roverScars: roverScarsShown,
        hopperLid: roverAnim.lid,          // .05's lid, latched shut by a hopper-full refusal
        cargoLatch: cargoFullLatch ? 1 : 0,
        ventedScars: ventedScars.size,
        podFlight: podT,
        mkStamp: mkStampT,
      };
    },
    inclusionKit() {
      let authoredGas = 0;
      let fallbackGas = 0;
      for (const rec of gasByCell.values()) {
        if (rec.authored) authoredGas += 1;
        else fallbackGas += 1;
      }
      let authoredScars = 0;
      for (const scar of ventedScars.values()) {
        if (scar.userData && scar.userData.worksInclusionShared) authoredScars += 1;
      }
      return {
        ready: !!inclusionKitCatalog,
        sourceStanding: !!authoredInclusionKitGroup,
        authoredOre: authoredOreByCell.size,
        authoredGas,
        authoredScars,
        authoredLock: !!authoredMkStamp,
        fallbackOre: oreCellIndex.size,
        fallbackGas,
        register: zoomRegister,
      };
    },
    // The contact ring each machine's clamp arms are actually built from THIS frame, read off the
    // live drill field (not the projection cache). geoSig names the eight neighbours by position,
    // kind and ore, so a capture can assert that boring a neighbour RELEASED an arm rather than
    // that a flag flipped. Consumer: scripts/capture-asteroid-works.mjs (not yet wired).
    machineContacts() {
      const out = [];
      for (const [id, rec] of machines) {
        const cargo = rec.cargoLifecycle ? rec.cargoLifecycle.stats() : null;
        const tap = rec.gasLifecycle ? rec.gasLifecycle.stats() : null;
        out.push({
          id, defId: rec.defId, col: rec.col, row: rec.row, geoSig: rec.geoSig,
          authored: !!rec.authoredSource,
          fallback: !!rec.proceduralFallback,
          mountPhase: cargo ? cargo.phase : (tap ? tap.phase : (rec.authoredSource ? 'authored' : null)),
        });
      }
      return out;
    },
    cargoPort() {
      const rec = authoredCargoRec() || [...machines.values()].find((m) => m.defId === 'sm_cargo_port') || null;
      const stats = rec && rec.cargoLifecycle ? rec.cargoLifecycle.stats() : null;
      const ghostRec = ghost && ghost.defId === 'sm_cargo_port' ? ghost : null;
      const ghostStats = ghostRec && ghostRec.cargoLifecycle ? ghostRec.cargoLifecycle.stats() : null;
      const launch = cargoLaunch.sample();
      const ghostRoot = ghostRec && ghostRec.group && ghostRec.group.visible ? ghostRec.group : null;
      let podWorld = null;
      if (rec && rec.dyn && rec.dyn.pod && typeof rec.dyn.pod.getWorldPosition === 'function') {
        const v = rec.dyn.pod.getWorldPosition(new THREE.Vector3());
        podWorld = { x: Number(v.x.toFixed(3)), y: Number(v.y.toFixed(3)), z: Number(v.z.toFixed(3)) };
      }
      return {
        installedPhase: stats ? stats.phase : (rec && rec.authoredSource ? 'authored' : (rec ? 'empty' : 'absent')),
        authored: !!(rec && rec.authoredSource),
        fallback: !!(rec && rec.proceduralFallback),
        crateStage: rec && rec.dyn && rec.dyn.crateStage ? rec.dyn.crateStage() : crateStageNow,
        podLaunch: rec && rec.dyn && rec.dyn.podLaunch ? rec.dyn.podLaunch() : 0,
        podVisible: !!(rec && rec.dyn && rec.dyn.pod && rec.dyn.pod.visible),
        podWorld,
        launchPhase: launch.phase,
        overlayCratesVisible: !!(crateMesh && crateMesh.visible),
        proceduralPodVisible: !!(podMesh && podMesh.visible),
        ghostPhase: ghostStats ? ghostStats.phase : (ghostRec ? (ghostRec.authoredSource ? 'authored' : 'empty') : 'absent'),
        ghostAuthored: !!(ghostRec && ghostRec.authoredSource),
        ghostFallback: !!(ghostRec && ghostRec.proceduralFallback),
        ghostVisible: !!(ghostRec && ghostRec.group && ghostRec.group.visible),
        ghostDrawnMeshes: countDrawnWorksMeshes(ghostRoot),
        ghostCell: ghostRec && Number.isInteger(ghostRec.col) ? [ghostRec.col, ghostRec.row] : null,
      };
    },
    gasTap() {
      const rec = [...machines.values()].find((m) => m.defId === 'sm_gas_tap') || null;
      const stats = rec && rec.gasLifecycle ? rec.gasLifecycle.stats() : null;
      const ghostRec = ghost && ghost.defId === 'sm_gas_tap' ? ghost : null;
      const ghostStats = ghostRec && ghostRec.gasLifecycle ? ghostRec.gasLifecycle.stats() : null;
      const ghostRoot = ghostRec && ghostRec.group && ghostRec.group.visible ? ghostRec.group : null;
      return {
        installedPhase: stats ? stats.phase : (rec && rec.authoredSource ? 'authored' : (rec ? 'empty' : 'absent')),
        authored: !!(rec && rec.authoredSource),
        fallback: !!(rec && rec.proceduralFallback),
        wallYaw: rec && rec.dyn && rec.dyn.wallYaw ? rec.dyn.wallYaw() : 0,
        wheelY: rec && rec.dyn && rec.dyn.wheel ? rec.dyn.wheel.rotation.y : 0,
        needleY: rec && rec.dyn && rec.dyn.needle ? rec.dyn.needle.rotation.y : 0,
        ghostPhase: ghostStats ? ghostStats.phase : (ghostRec ? (ghostRec.authoredSource ? 'authored' : 'empty') : 'absent'),
        ghostAuthored: !!(ghostRec && ghostRec.authoredSource),
        ghostFallback: !!(ghostRec && ghostRec.proceduralFallback),
        ghostVisible: !!(ghostRec && ghostRec.group && ghostRec.group.visible),
        ghostDrawnMeshes: countDrawnWorksMeshes(ghostRoot),
        ghostCell: ghostRec && Number.isInteger(ghostRec.col) ? [ghostRec.col, ghostRec.row] : null,
        bothDrawn: !!(rec && rec.authoredSource && rec.proceduralFallback),
      };
    },
    // ---- law §7 / §6.5 / §6.7 "The site reads" (PQ-130.10b) ----
    // What the NETWORK LAYER is drawing this frame, read off the live objects: which run belongs to
    // which of the sim's own components, the jacket colour and emissive it is actually wearing, the
    // dots on the glass, the crate stage, the lens, and the build-mode board feedback. A check can
    // therefore assert that a state CHANGED SOMETHING, not merely that a flag flipped.
    networks() {
      const mountState = conduitMountLifecycle
        ? conduitMountLifecycle.stats()
        : {
            generation: 0, phase: 'empty', desiredCount: 0, authoredCount: 0,
            fallback: false, failure: null,
          };
      const proceduralRuns = overlayParts.map((part) => ({
        kind: part.kind,
        key: part.key,
        hex: `#${part.mat.color.getHexString()}`,
        emissive: Number(part.mat.emissiveIntensity.toFixed(3)),
        live: part.kind === 'power'
          ? !!(netState.power.get(part.key) || {}).live
          : !!(netState.lane.get(part.key) || {}).live,
      }));
      const authoredRunMap = new Map();
      let authoredPhysicalMeshes = 0;
      for (const part of authoredOverlayParts) {
        part.source.traverse((obj) => {
          if (obj.isMesh && obj.visible) authoredPhysicalMeshes += 1;
        });
        const runKey = `${part.family}:${part.key}`;
        if (authoredRunMap.has(runKey)) continue;
        const mat = part.mats.find((candidate) => candidate && candidate.color) || null;
        authoredRunMap.set(runKey, {
          kind: part.family,
          key: part.key,
          hex: mat ? `#${mat.color.getHexString()}` : null,
          emissive: mat && 'emissiveIntensity' in mat
            ? Number(mat.emissiveIntensity.toFixed(3))
            : 0,
          live: part.family === 'power'
            ? !!(netState.power.get(part.key) || {}).live
            : !!(netState.lane.get(part.key) || {}).live,
        });
      }
      const authoredRuns = [...authoredRunMap.values()];
      const runs = mountState.phase === 'authored' ? authoredRuns : proceduralRuns;
      const lanes = [];
      for (const [key, st] of netState.lane) {
        lanes.push({
          key, live: st.live, active: st.active,
          density: Number(st.density.toFixed(3)), stored: st.stored, capacity: st.capacity,
        });
      }
      const power = [];
      for (const [key, st] of netState.power) {
        power.push({ key, live: st.live, ratio: st.ratio, gen: st.gen, draw: st.draw });
      }
      return {
        runs,
        authoredPieces: authoredOverlayParts.map((part) => ({
          assetId: part.assetId,
          family: part.family,
          kind: part.kind,
          key: part.key,
          cell: part.idx,
          mask: part.mask,
          rotation: Number(part.rotation.toFixed(4)),
        })),
        authoredCount: authoredOverlayParts.length,
        expectedAuthoredCount: mountState.desiredCount,
        authoredCoverageComplete: mountState.phase === 'authored'
          && mountState.desiredCount > 0
          && authoredOverlayParts.length === mountState.desiredCount,
        mountPhase: mountState.phase,
        mountGeneration: mountState.generation,
        mountFailure: mountState.failure,
        proceduralFallback: mountState.phase === 'fallback',
        proceduralBodies: overlayParts.length + overlayCasings.length,
        lanes,
        power,
        islands: runs.filter((r) => !r.live).length,
        flowDots: flowDots.count,
        flowRoutes: laneFlows.reduce((n, f) => n + f.routes.length, 0),
        // Back-compatible capture field: on authored success this is the physical authored mesh
        // count, never the count of hidden procedural casings (there are none). In fallback mode it
        // is the procedural armour count. New checks should use authoredCoverageComplete and
        // proceduralBodies for the exact transaction verdict.
        casings: mountState.phase === 'authored' ? authoredPhysicalMeshes : overlayCasings.length,
        // The run's drawn CROSS SECTION in screen pixels. §7 asks the same drawing to stay legible
        // at the site register; a run that thinned to a hairline there would be a painted line, so
        // this is the number the check holds a floor against.
        laneWidthPx: Number((overlayWidth.lane * (overlayWidth.regPxPerCell || S * pxPerWorldUnit())).toFixed(2)),
        cableWidthPx: Number((overlayWidth.power * (overlayWidth.regPxPerCell || S * pxPerWorldUnit())).toFixed(2)),
        cellPx: Number((overlayWidth.regPxPerCell || 0).toFixed(2)),
        register: zoomRegister,
      };
    },
    // The port pile: 0 = nothing shipped yet, 1..5 = the stages the export buffer has earned.
    crates() {
      const authored = authoredCargoRec();
      return {
        stage: crateStageNow,
        visible: authored ? crateStageNow > 0 : !!(crateMesh && crateMesh.visible),
        authored: !!authored,
        overlayVisible: !!(crateMesh && crateMesh.visible),
        // Where the pile actually stands. `onFloor` false means every neighbour was taken and the
        // pile is sitting on the port's own plinth — legible, but the tighter fallback.
        cell: crateCell ? crateCell.slice() : null,
        onFloor: !!crateCell,
      };
    },
    // The lens cycle, and the two things a lens is allowed to move on the board.
    lens() {
      return {
        active: lensName,
        order: LENS_ORDER.slice(),
        seamAlpha: Number(seamLineMat.opacity.toFixed(3)),
        chips: chipsUsed,
      };
    },
    // Build-mode board feedback (law §6.7): mint seats drawn, why-glyph plates drawn, and the
    // gridline strengthening actually applied to the grooves this frame.
    faces() {
      return {
        seats: facesShown,
        whyGlyphs: whyUsed,
        reasons: facesCache.blocked.slice(0, 24).map((b) => b.reason),
        gridStrength: Number(gridK.toFixed(4)),
        // OWNER RULING 2026-08-21: seats are marked with brackets, never a painted face. This is
        // the DRAWN INK of one seat mark as a fraction of its cell — a solid fill would report ~1.
        seatInkFrac: Number((seatGeo.userData.inkFrac || 0).toFixed(4)),
        seatMarks: seatsUsed,
      };
    },
    setLens,
    cycleLens,
    // The hover box, as drawn (law §3.2: cyan is material FLOW only, so the cursor may not be it).
    hoverFrame() {
      return {
        hex: `#${frameMat.color.getHexString()}`,
        opacity: frameMat.opacity,
        thicknessPx: (cursorBars[0] ? cursorBars[0].scale.y * CURSOR_BAR_H : 0) * pxPerWorldUnit(),
        visible: cursorGroup.visible,
      };
    },
    // PQ-131.00 — authored release-part proof. Off in a normal session.
    rendererInfo: snapshotRendererInfo,
    rendererPresentation: snapshotRendererPresentation,
    scenePassInfo: captureScenePass,
    worksStats() { return worksLoader ? worksLoader.stats() : null; },
    worksProofObserverAttached() { return !!worksHostObs; },
    worksProofArmed() { return !!worksProofArmed; },
    worksRetireSettled() { return worksRetirePromise || Promise.resolve(null); },
    worksProofCell: { col: WORKS_PROOF_CELL.col, row: WORKS_PROOF_CELL.row },
    get worksProofMounted() { return !!worksProofGroup; },
    get worksHostElement() { return worksHost; },
    mountWorksProof,
    async loadWorksPart(id, options = {}) {
      if (worksTearingDown || disposed || glTeardownDone) {
        return { ok: false, reason: 'tearing-down' };
      }
      const loader = ensureWorksLoader();
      if (!loader) return { ok: false, reason: 'no-loader' };
      const group = await loader.loadWorksPart(id, options);
      if (worksTearingDown || disposed || glTeardownDone) {
        if (group) loader.releaseWorksPart(group);
        return { ok: false, reason: 'tearing-down' };
      }
      if (!group) return { ok: false, reason: 'load-null', stats: loader.stats() };
      if (!group.parent) scene.add(group);
      const hookNames = group.userData.worksHooks || {};
      const hooks = {};
      for (const name of Object.keys(hookNames)) hooks[name] = hookNames[name] ? name : null;
      return {
        ok: true,
        id,
        stats: loader.stats(),
        hooks,
        colourSpace: inspectWorksColourSpace(group),
        nodeLod: group.userData.worksNodeLod || null,
        lod: inspectWorksLod(group),
      };
    },
    releaseWorksProof() {
      unmountWorksProof({ forget: true });
      return worksLoader ? worksLoader.stats() : null;
    },
    worksLod() { return inspectWorksLod(worksProofGroup); },
    compareWorksProof,
    worksProofNegativeControl,
    disposeWorksProof() { dispose(); },
    setZoomRegister,
    frameCell(col, row) {
      look.x = worldX(col);
      look.y = worldY(row);
      lookInit = true;
      lookSnapNext = true;
    },
  };

  // ---------------------------------------------------------------- cursor / ghost / ring sync
  // The cursor and the ghost's contact preview. NOTHING here paints a cell face any more: the
  // verdict is the hairline frame's colour, the contacts are corner brackets on the neighbours'
  // own bevel rings, and the ghost machine itself is the object you are placing.
  function syncCursor(ui) {
    const cursor = ui && ui.cursor;
    const showGhost = !!(cursor && ui.mode === 'build' && ui.buildKind === 'machine' && ui.buildDefId);
    cursorGroup.visible = !!cursor;
    // 1.5px, solved against the live camera EVERY frame — before the no-cursor early return, so a
    // reading taken with the pointer off the board still reports the hairline the board will draw
    // rather than the geometry's unscaled 7px slab.
    const barK = (HOVER_PX / pxPerWorldUnit()) / CURSOR_BAR_H;
    for (const b of cursorBars) b.scale.y = barK;
    if (!cursor) {
      if (ghost) {
        if (ui && ui.mode === 'build' && ui.buildDefId) ghost.group.visible = false;
        else clearGhost();
      }
      return;
    }
    const cx = worldX(cursor.col);
    const cy = worldY(cursor.row);
    cursorGroup.position.set(cx, cy, Z.face);
    if (showGhost) {
      const g = ensureGhost(ui.buildDefId);
      if (g) {
        g.group.visible = true;
        g.group.position.set(cx, cy, 0);
        g.col = cursor.col;
        g.row = cursor.row;
        if (g.dyn && g.dyn.setWallYaw) {
          g.dyn.setWallYaw(resolveGasTapWallYaw(field, cursor.col, cursor.row));
        }
      }
      frameMat.color.setHex(ui.canOk ? 0x7cd9a2 : 0xff6242);   // --aw-mint / --aw-coral
      frameMat.opacity = 0.85;   // shared material: the build verdict must not leak into drive
      // Contact-ring preview: which of the eight neighbours would feed this machine. Brackets, not
      // a wash — a face that feeds gets a mint mark, a face already hollow gets a bone one.
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (!dc && !dr) continue;
          const cc = cursor.col + dc;
          const rr = cursor.row + dr;
          if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
          const tile = field[cc] && field[cc][rr];
          markSeat(cc, rr, tile && tile.type !== 'empty' ? 'contact' : 'hollow');
        }
      }
      // The refused verdict is the hairline frame's coral, and that is ALL it is: a bracket in the
      // same cell doubles the ink and starts reading as a filled box again.
    } else {
      if (ghost) {
        if (ui && ui.mode === 'build' && ui.buildDefId) ghost.group.visible = false;
        else clearGhost();
      }
      frameMat.color.setHex(HOVER_INK);
      frameMat.opacity = HOVER_ALPHA;
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
    for (const cm of rec.cracks) {
      if (rec.authored) cm.visible = hot;
      else cm.material = hot ? gasCrackHotMat : gasCrackMat;
    }
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
        // Honour a per-chunk depth exactly as the additive branch below does. Rock-break debris
        // originates at the CUT FACE and belongs on the particle plane; debris that comes off an
        // object down in the tunnel (ore refused by the hopper lid) belongs at that object's depth.
        // Drawing the second at the first's depth is the bloom-blob failure the .05 receipt names.
        dummy.position.set(pxToWorldX(p.x), pxToWorldY(p.y), p._z !== undefined ? p._z : Z.particles);
        // Three axes, not one. A box spun only about z presents the same flat face to a
        // straight-down camera every frame and reads as a paper square; tilting it out of plane is
        // what makes the key light find a different facet on each chip (law §2.7).
        dummy.rotation.set(p.rx || 0, p.ry || 0, p.rot);
        dummy.scale.setScalar(Math.max(0.001, (p.size / TILE) * S * (0.35 + 0.65 * alpha)));
        dummy.updateMatrix();
        chunkMesh.setMatrixAt(nc, dummy.matrix);
        chunkMesh.setColorAt(nc, p._c3 || colScratch.set(0x8a715a));
        nc++;
        continue;
      }
      if (n >= PARTICLE_CAP) continue;
      const sizeW = (p.size / TILE) * S * (p.isDust || p.isSteam ? (1 + (1 - alpha) * 2) : 1);
      dummy.position.set(pxToWorldX(p.x), pxToWorldY(p.y), p._z !== undefined ? p._z : Z.particles);
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

    // ---- ore arcs: the payout, flown to the hopper (law §5 ore row, ~250ms) ----
    // The destination is the LID's live world position, not the cell's, so a chunk released before
    // the rig moved still lands in the bin it belongs to. A parabola in world space with a
    // shrinking lift reads as thrown mass; a straight lerp reads as a UI tween.
    if (oreArcs.length) {
      const lid = roverBuilt.dyn.hopperLid;
      lid.getWorldPosition(v3a);
      for (let i = oreArcs.length - 1; i >= 0; i--) {
        const a = oreArcs[i];
        if (a.delay > 0) { a.delay -= dt; continue; }
        a.t += dt;
        const u = a.t / ARC_DUR_S;
        if (u >= 1) { oreArcs.splice(i, 1); continue; }
        if (nc >= CHUNK_CAP) continue;
        a.rot += a.spin * dt;
        const sx = pxToWorldX(a.x0), sy = pxToWorldY(a.y0);
        const x = sx + (v3a.x - sx) * u;
        const y = sy + (v3a.y - sy) * u + Math.sin(u * Math.PI) * S * a.lift * 0.45;
        // …and DOWN THE HOLE: the chunk leaves the cut face and travels back to the rig's own
        // depth, so it passes behind the block lips on the way instead of skating over them.
        dummy.position.set(x, y, ROCK_FACE + (Z.rover + 0.22 - ROCK_FACE) * u);
        dummy.rotation.set(a.rx + a.rot * 0.6, a.ry, a.rot);
        dummy.scale.setScalar(Math.max(0.001, (a.size / TILE) * S * (1 - u * 0.25)));
        dummy.updateMatrix();
        chunkMesh.setMatrixAt(nc, dummy.matrix);
        chunkMesh.setColorAt(nc, a.c3);
        nc++;
      }
    }

    chunkMesh.count = nc;
    if (nc) {
      chunkMesh.instanceMatrix.needsUpdate = true;
      if (chunkMesh.instanceColor) chunkMesh.instanceColor.needsUpdate = true;
    }

    // ---- vapor: lit bodies rolling out of the breach (law §5, ~1.2s) ----
    let nv = 0;
    for (let i = vapors.length - 1; i >= 0; i--) {
      const v = vapors[i];
      v.t += dt;
      if (v.t >= v.life) { vapors.splice(i, 1); continue; }
      if (nv >= VAPOR_CAP) continue;
      const u = v.t / v.life;
      v.rot += v.spin * dt;
      dummy.position.set(v.x + v.driftX * u, v.y + v.driftY * u, v.z);
      dummy.rotation.set(0, 0, v.rot);
      dummy.scale.setScalar(v.scale * (0.55 + u * 0.85));
      dummy.updateMatrix();
      vaporMesh.setMatrixAt(nv, dummy.matrix);
      nv++;
    }
    vaporMesh.count = nv;
    if (nv) vaporMesh.instanceMatrix.needsUpdate = true;
    // One fade for the WHOLE CLOUD — the puffs are one body of gas, not independent sprites. It
    // gasps out in 120ms and thins for the rest of the 1.2s, which is what a pressure release does.
    if (nv) {
      vaporT += dt;
      const rise = Math.min(1, vaporT / 0.12);
      const fall = Math.max(0, 1 - Math.max(0, vaporT - 0.12) / (VAPOR_LIFE_S - 0.12));
      vaporMat.opacity = 0.26 * rise * fall * (motionReduce ? 0.6 : 1);
    } else {
      vaporMat.opacity = 0;
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

  // ---------------------------------------------------------------- PQ-130.07 event clock
  // Everything on law §5's table that runs on a stopwatch. One place, so the timings are readable
  // as a group and every one of them is the number in the table.
  const v3a = new THREE.Vector3();
  function stepEvents(dt) {
    // camera kick — 4px, 180ms
    if (kick.t > 0) { kick.t = Math.max(0, kick.t - dt); kick.elapsed += dt; }

    // the 150ms yellow-green flash inside the breached cell: a real light, not a painted disc
    if (cellFlash.t > 0) {
      cellFlash.t = Math.max(0, cellFlash.t - dt);
      const u = cellFlash.t / cellFlash.dur;
      flashLight.intensity = (motionReduce ? 9 : 17) * u * u;
      if (cellFlash.t <= 0) { flashLight.intensity = 0; flashLight.position.set(0, 0, -900); }
    }

    // the MK skate: 6-10 sparks strewn across 300ms
    if (skate.t > 0) {
      skate.t = Math.max(0, skate.t - dt);
      skate.next -= dt;
      while (skate.left > 0 && skate.next <= 0) {
        skate.left--;
        skate.next += SKATE_DUR_S / 8;
        const sx = skate.x + (Math.random() - 0.5) * TILE * 0.36;
        const sy = skate.y + (Math.random() - 0.5) * TILE * 0.36;
        // the spark itself: short, hot, thrown along the face and pulled down
        burst({
          x: sx, y: sy,
          count: 3, color: `#${skate.hex.toString(16).padStart(6, '0')}`,
          life: 0.24, size: 2.9, speed: 132, kind: 'spark', gravity: 190, cone: 1.4,
        });
        // …and the swarf it takes off with it, so the refusal has mass and not just light
        if (!motionReduce) spawnChunks(sx, sy, '#7d6c58', 1);
      }
    }

    // machine settles tick down toward their seated pose
    if (settles.size) {
      for (const [idx, left] of settles) {
        const nx = left - dt;
        if (nx <= 0) settles.delete(idx); else settles.set(idx, nx);
      }
    }

    cargoLaunch.step(dt, { motionReduce });
    const authoredCargo = authoredCargoRec();
    const authoredLaunch = !!(authoredCargo && authoredCargo.dyn && authoredCargo.dyn.setPodLaunch);
    if (authoredLaunch && podMesh) podMesh.visible = false;
    // the courier climbing the shaft — only when the authored Cargo Port is not the launch body
    if (podT >= 0 && !authoredLaunch) {
      podT += dt / POD_RISE_S;
      if (podT >= 1) { podT = -1; if (podMesh) podMesh.visible = false; }
      else if (podMesh) {
        const e = podT * podT * (3 - 2 * podT);          // ease so it leaves heavy and clears fast
        const y0 = worldY(ROWS - 1);
        const y1 = derrickBaseY + S * 3.4;               // proud of the derrick: it CLEARED
        podMesh.position.set(worldX(ENTRY_COL), y0 + (y1 - y0) * e, Z.rover + 0.3);
        podMesh.rotation.z = Math.sin(podT * 7) * 0.03;
        podMesh.visible = true;
        if (!motionReduce && Math.random() < 0.5) {
          burst({
            x: (worldX(ENTRY_COL) / S + COLS / 2) * TILE,
            y: (ROWS / 2 - podMesh.position.y / S) * TILE + 10,
            count: 1, color: '#c9b48a', life: 0.5, size: 3.2, speed: 22,
            kind: 'dust', cone: Math.PI * 2,
          }, Z.rover);
        }
      }
    }
  }

  // The camera kick in WORLD units, solved from the live pixel scale so 4px stays 4px (law §5).
  function kickOffsetWorld() {
    if (kick.t <= 0) return { x: 0, y: 0 };
    const trauma = kick.t / KICK_DUR_S;
    const amp = (KICK_PX * trauma * trauma * (motionReduce ? 0.25 : 1)) / pxPerWorldUnit();
    return {
      x: Math.sin(kick.elapsed * 71 + 0.8) * amp,
      y: Math.cos(kick.elapsed * 89 + 0.35) * amp * 0.72,
    };
  }

  // Law §5 ore row: "a floater `+2 Fe` (mono 13px, --aw-gold) rises 24px over 700ms and fades".
  // Twenty-four SCREEN pixels — the rise is applied after the projection, so it is the same gesture
  // at work zoom and site zoom. Consecutive payouts on one cell step up a tier instead of stacking
  // into an unreadable pile of numerals (law §5 repeat rules).
  const FLOATER_LIFE_S = 0.7;
  const FLOATER_RISE_PX = 24;
  function spawnFloater(px, py, text, color, idx = -1) {
    if (!dom.root) return;
    let tier = 0;
    if (idx >= 0 && idx === lastFloater.idx && timeSNow - lastFloater.t < FLOATER_LIFE_S) {
      tier = Math.min(3, lastFloater.tier + 1);
    }
    lastFloater = { idx, t: timeSNow, tier };
    const el = document.createElement('div');
    el.className = 'ast3d-floater';
    el.style.color = color;
    el.textContent = text;
    dom.root.appendChild(el);
    dom.floaters.push({ el, px, py, life: FLOATER_LIFE_S, tier });
  }

  // Law §5 gas row / §9 "Damage: edge vignette + camera kick, never a modal" — 400ms of coral
  // gathered at the FRAME, and a shorter gold one for a refused load. Both live in the renderer's
  // own overlay layer, which is the whole stage box, so they hug the board and never become a
  // panel the player has to dismiss.
  const VIGNETTE_GAS_S = 0.4;
  const VIGNETTE_CARGO_S = 0.22;
  function stepDom(d, dt) {
    if (!dom.root) return;
    if (timers.gasFlash > 0) timers.gasFlash = Math.max(0, timers.gasFlash - dt);
    if (timers.cargoFlash > 0) timers.cargoFlash = Math.max(0, timers.cargoFlash - dt);
    const gasU = timers.gasFlash > 0 ? timers.gasFlash / VIGNETTE_GAS_S : 0;
    const cargoU = timers.cargoFlash > 0 ? timers.cargoFlash / VIGNETTE_CARGO_S : 0;
    dom.flashGas.style.opacity = gasU > 0 ? ((motionReduce ? 0.6 : 1) * gasU).toFixed(3) : '0';
    dom.flashCargo.style.opacity = cargoU > 0 ? ((motionReduce ? 0.6 : 1) * cargoU).toFixed(3) : '0';
    // floaters ride the projection so they stay glued to their cell while the camera settles
    for (let i = dom.floaters.length - 1; i >= 0; i--) {
      const f = dom.floaters[i];
      f.life -= dt;
      if (f.life <= 0) {
        f.el.remove();
        dom.floaters.splice(i, 1);
        continue;
      }
      const u = 1 - f.life / FLOATER_LIFE_S;            // 0 at birth, 1 at death
      const p = worldToScreen(pxToWorldX(f.px), pxToWorldY(f.py), Z.face);
      f.el.style.left = `${p.x.toFixed(1)}px`;
      f.el.style.top = `${(p.y - FLOATER_RISE_PX * u - f.tier * 15).toFixed(1)}px`;
      f.el.style.opacity = String(Math.min(1, f.life / 0.3));
    }
  }

  // ---------------------------------------------------------------- notify (screen → renderer)
  function notify(evt, p = {}) {
    const d = getDrill();
    const centerPx = (col, row) => ({ x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 });
    if (evt === 'break') {
      // WAS THIS A GAS POCKET? Derived HERE, before the cell is carved, from what the renderer can
      // see — never from the payload. Two independent reasons: the screen forwards only {col,row}
      // (so p.wasGas has never once been true on the live path), and drill.js only raises
      // `drill:gasHit` when there is a hull to damage, so a breach against an undamageable player
      // would otherwise lose its scar, its kick, its vignette and its vapor in silence.
      const bIdx = tileIndex(p.col, p.row);
      const preTile = field[p.col] && field[p.col][p.row];
      const wasGas = !!p.wasGas || gasByCell.has(bIdx) || !!(preTile && preTile.type === 'gas');
      carveCell(p.col, p.row);
      refreshCells(neighborhood(p.col, p.row, 1));
      crackDecal.visible = false;
      const { x, y } = centerPx(p.col, p.row);
      const rockColor = wasGas ? '#57601f'
        : (p.type === 'rock' ? '#4a5162' : '#7a6650');
      spawnChunks(x, y, rockColor, motionReduce ? 4 : 8);
      burst({ x, y, count: motionReduce ? 5 : 10, color: '#a78262', life: 0.45, size: 2.8, speed: 60, kind: 'dust', gravity: 55, cone: Math.PI * 2 });
      if (wasGas) gasBreach(p.col, p.row);
      else firePulseRing(p.col, p.row, 0xffb648, 0.3);
      return;
    }
    if (evt === 'yield') {
      // Law §5: 3-5 lit chunks pop 60-120ms apart and arc ~250ms into the hopper, and one gold
      // floater names the take in the seam chips' own symbol bank.
      const { x, y } = centerPx(p.col, p.row);
      const tint = (ORE_TINTS[p.ore] || {}).vein || '#ffb648';
      const n = Math.max(3, Math.min(5, Number(p.qty) || 3));
      spawnOreArc(x, y, tint, n);
      burst({ x, y, count: motionReduce ? 4 : 8, color: tint, life: 0.4, size: 2.2, speed: 48, kind: 'spark', gravity: 40, cone: Math.PI * 2 });
      const sym = ORE_SYMBOL[p.ore] || '';
      spawnFloater(x, y - 8, sym ? `+${p.qty} ${sym}` : `+${p.qty}`, '#ffb648', tileIndex(p.col, p.row));
      eventLog.yields++;
      mark('yield', p.col, p.row);
      return;
    }
    if (evt === 'gasHit') {
      // Reinforcement only. `break` already owns the whole breach expression above, and it fires
      // whether or not the hull gate lets this event through; a second full eruption here would
      // double the kick on the common path.
      gasBreach(p.col, p.row);
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
      // Law §5 "Machine placed": the ghost snaps in with a 120ms settle and its lamp lights mint.
      // The settle is a scale the machine sync applies while this timer runs — the same body,
      // seating itself, not a second ghost object crossfading into a first.
      settles.set(tileIndex(p.col, p.row), SETTLE_S);
      firePulseRing(p.col, p.row, 0x7cd9a2, 0.6);
      const { x, y } = centerPx(p.col, p.row);
      burst({ x, y, count: motionReduce ? 4 : 12, color: '#c9b48a', life: 0.5, size: 2.4, speed: 55, kind: 'dust', cone: Math.PI * 2 });
      eventLog.installs++;
      mark('install', p.col, p.row);
      return;
    }
    if (evt === 'cargoFull') {
      // Law §5 "Hopper full": the lid clunks shut and the next chunk BOUNCES OFF IT. The refusal
      // is one identical event repeated as fast as the player keeps drilling, so it obeys the same
      // 5s repeat rule as the other refusals — the lid stays latched either way, but the bounce and
      // the vignette do not replay into a strobe.
      const ridx = d ? tileIndex(d.avatar.col, d.avatar.row) : -1;
      // The sim refuses on "this unit would not fit", not on a ratio — latch the rover's hopper lid
      // on the same predicate so the cover is shut exactly when ore starts bouncing off it.
      cargoFullLatch = true;
      if (!allowRefusal(ridx, 'cargoFull')) return;
      timers.cargoFlash = VIGNETTE_CARGO_S;
      bounceOffLid(p && p.commodityId);
      eventLog.cargoRefusals++;
      mark('cargoFull', d ? d.avatar.col : -1, d ? d.avatar.row : -1);
    }
  }

  // ---------------------------------------------------------------- law §5 event expressions

  // "identical refusals within 5s do not replay their full effect" — one gate, every refusal.
  function allowRefusal(idx, reason) {
    const key = `${idx}|${reason}`;
    const last = refusalSeen.get(key);
    if (last !== undefined && timeSNow - last < REFUSAL_SUPPRESS_S) {
      eventLog.refusalsSuppressed++;
      return false;
    }
    refusalSeen.set(key, timeSNow);
    return true;
  }

  // THE GAS POCKET, entire (law §5): 150ms yellow-green flash in the cell · vapor floods the
  // adjacent tunnel ~1.2s · camera kicks 4px for 180ms · coral edge vignette 400ms · a scar on the
  // rover · the pocket becomes the vented texture permanently.
  function gasBreach(col, row) {
    if (timeSNow - gasBreachT < 0.25) return;    // break + gasHit are one event, not two
    gasBreachT = timeSNow;
    addVentedScar(col, row);                     // the vented texture, permanently (law D2)
    const x = col * TILE + TILE / 2;
    const y = row * TILE + TILE / 2;
    cellFlash.t = cellFlash.dur;
    cellFlash.col = col;
    cellFlash.row = row;
    flashLight.position.set(worldX(col), worldY(row), Z.rover + 0.5);
    flashLight.intensity = motionReduce ? 9 : 17;
    spawnVapor(col, row);
    kick.t = KICK_DUR_S;
    kick.elapsed = 0;
    timers.gasFlash = VIGNETTE_GAS_S;
    if (roverScarsShown < roverScars.length) roverScars[roverScarsShown++].visible = true;
    spawnChunks(x, y, '#4b5320', motionReduce ? 4 : 9);
    burst({ x, y, count: motionReduce ? 5 : 14, color: '#d8e04a', life: 0.42, size: 2.6, speed: 92, kind: 'spark', cone: Math.PI * 2 });
    eventLog.gasBreaches++;
    mark('gasBreach', col, row);
  }

  // "next chunk bounces off" — ore-coloured debris launched at the shut lid and thrown clear.
  function bounceOffLid(commodityId) {
    const lid = roverBuilt.dyn.hopperLid;
    lid.getWorldPosition(v3a);
    const px = (v3a.x / S + COLS / 2) * TILE;
    const py = (ROWS / 2 - v3a.y / S) * TILE;
    const hex = (ORE_TINTS[commodityId] || {}).vein || '#a78262';
    const c = new THREE.Color(hex);
    for (let i = 0; i < (motionReduce ? 1 : 2); i++) {
      const life = 0.62 + Math.random() * 0.22;
      particles.push({
        x: px + (Math.random() - 0.5) * 5,
        y: py - 5,
        vx: (0.4 + Math.random() * 0.8) * (Math.random() < 0.5 ? -62 : 62),
        vy: -(74 + Math.random() * 34),
        color: hex,
        _c3: c.clone().multiplyScalar(0.7 + Math.random() * 0.4),
        size: 4.4 + Math.random() * 2.2,
        life,
        maxLife: life,
        gravity: 210,
        kind: 'chunk',
        isChunk: true,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 14,
        rx: Math.random() * Math.PI,
        ry: Math.random() * Math.PI,
        _z: Z.rover + 0.25,        // it came off the LID, so it composites at the rig's depth
      });
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
    clearAuthoredOreInstances();
    for (const [, m] of gasByCell) {
      if (m.authored) releaseWorksInclusionInstance(m.authored);
      gasRoot.remove(m.group);
    }
    gasByCell.clear();
    clearVentedScars();
    clearSeamAnnotations();
    seamBodies = [];
    seamOfCell = new Map();
    seamsDirty = true;
    mkStampCell = -1;
    mkStampT = 0;
    if (mkStamp) mkStamp.visible = false;
    clearAuthoredMkStamp();
    for (const id of [...machines.keys()]) removeMachine(id);
    overlaySig = '';
    rebuildOverlays(null);
    // PQ-130.10b — the networks layer resets with the session. A lens is a per-visit choice, not a
    // setting: law §2.5 counts the DEFAULT drive view and a lens left on from the last rock would
    // spend it. The crate pile and the grid come back at zero for the same reason.
    lensName = null;
    gridK = 0;
    gridMat.opacity = 0;
    gridPlane.visible = false;
    facesCache.sig = '';
    facesCache.t = -1e9;
    facesCache.seats = [];
    facesCache.blocked = [];
    seatsUsed = 0;
    facesShown = 0;
    seatBrackets.count = 0;
    seatBrackets.visible = false;
    whyUsed = 0;
    for (const plate of whyPool) plate.mesh.visible = false;
    crateStageNow = 0;
    crateCell = null;
    if (crateMesh) crateMesh.visible = false;
    netState.power.clear();
    netState.lane.clear();
    oreRegisterSig = '';
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
    // PQ-130.07 — the whole law §5 event table resets with the session.
    kick.t = 0; kick.elapsed = 0;
    oreArcs.length = 0;
    vapors.length = 0;
    vaporT = 0;
    vaporMesh.count = 0;
    cellFlash.t = 0; cellFlash.col = -1; cellFlash.row = -1;
    flashLight.intensity = 0;
    flashLight.position.set(0, 0, -900);
    gasBreachT = -99;
    refusalSeen.clear();
    blockedLatch = false;
    blockedCell = -1;
    skate.t = 0; skate.left = 0; skate.next = 0;
    settles.clear();
    wantChipsUsed = 0;
    for (const chip of wantChipPool) chip.mesh.visible = false;
    lastLaunches = null;                       // re-baselined on the first frame that sees the site
    podT = -1;
    cargoLaunch.reset();
    if (podMesh) podMesh.visible = false;
    for (const m of roverScars) m.visible = false;
    roverScarsShown = 0;
    lastFloater = { idx: -1, t: -99, tier: 0 };
    unsubscribeWarn();
    subscribeWarn();
    eventLog.lastEvent = null;
    eventLog.yields = 0; eventLog.gasBreaches = 0; eventLog.refusals = 0;
    eventLog.refusalsSuppressed = 0; eventLog.cargoRefusals = 0;
    eventLog.installs = 0; eventLog.courierLaunches = 0;
    drillTheta = 0;
    derrickDrumTheta = 0;
    lookInit = false;
    zoomRegister = 'work';
    if (worksLoader) worksLoader.setRegister('work');
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
    if (!field) {
      rover.visible = false;
      if (derrickBuilt) derrickBuilt.group.visible = false;
      return;
    }
    // Single-flight: joins the setup-time load if it is still in the air, no-ops once it stands,
    // and only re-arms after a genuine miss.
    void mountAuthoredRover();
    void mountAuthoredInclusionKit();

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
    worksProofGen += 1;
    unmountWorksProof();
    if (worksProofFlagOn()) {
      armWorksProof();
      void mountWorksProof();
    }
  }

  // ---------------------------------------------------------------- frame
  function render(dt, timeS, ui) {
    const d = getDrill();
    if (!d || !field) return;
    timeSNow = timeS;
    const site = getSite ? getSite() : null;
    const projection = getProjection ? getProjection() : null;

    // camera + the law's 4px/180ms kick (law §5 gas row, §9 "camera kick, never a modal").
    // The renderer owns the camera, so the kick moves the CAMERA — not a transform on the canvas
    // element, which would shear the projection every §11.1 flatness assertion is measured against.
    stepEvents(dt);
    const kickW = kickOffsetWorld();
    stepZoom(dt);
    const cam = stepCamera(d, dt);
    poseCamera(cam.x, cam.y, kickW.x, kickW.y);
    syncRefusal(d);
    syncCourier(site);

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
    rover.rotation.set(0, roverBuilt.authored ? 0 : roverAnim.flipY, roverBuilt.authored ? roverAnim.flipY : 0);
    const aimTarget = faceDir === 'down' ? -Math.PI / 2 : (faceDir === 'up' ? Math.PI / 2 : 0);
    roverAnim.armAim += (aimTarget - roverAnim.armAim) * Math.min(1, 10 * dt);
    if (roverBuilt.authored) roverBuilt.dyn.arm.rotation.y = roverAnim.armAim;
    else roverBuilt.dyn.arm.rotation.z = roverAnim.armAim;
    // the auger bites: fast attack, slow retract (asymmetric envelope). The slide runs the bit a
    // third of a cell past its rest stop, so a bore visibly drives INTO the target cell.
    const biteTarget = drilling ? 1 : 0;
    const biteRate = biteTarget > roverAnim.bite ? 9 : 3.5;
    roverAnim.bite += (biteTarget - roverAnim.bite) * Math.min(1, biteRate * dt);
    roverBuilt.dyn.augerSlide.position.x = roverBuilt.dyn.augerRestX
      + roverBuilt.dyn.augerBiteX * roverAnim.bite;
    // The authored cutter turns on its own length (local +X); the procedural auger is a Y-axis
    // spindle. Spinning the authored bit on Y would sweep it around the socket instead.
    if (roverBuilt.dyn.setBitSpin) roverBuilt.dyn.setBitSpin(drillTheta);
    else roverBuilt.dyn.auger.rotation.y = drillTheta;
    // THE BIT HEATS (law §4). Tool steel goes from a dull scorched brown toward a coral glow as
    // the drill temperature climbs. It is the one part of the rig allowed to emit brightly, and
    // its peak (1.5) stays above every lamp on the vehicle so HEAT reads as the hottest thing.
    const temp = Math.max(0, Math.min(100, d.drillTemp || 0));
    const heat = temp / 100;
    const bitMats = roverBuilt.dyn.bitMats;
    if (bitMats) {
      // One clone per LOD cutter. These are per-instance clones on purpose — the authored rover
      // draws every surface from one atlas material, so heating the shared one lights the vehicle.
      for (let i = 0; i < bitMats.length; i++) {
        bitMats[i].emissive.setHex(0x9a6f4a).lerp(HOT_BIT, heat);
        bitMats[i].emissiveIntensity = heat * heat * 1.5;
      }
    } else if (roverBuilt.dyn.bitMat) {
      roverBuilt.dyn.bitMat.emissive.setHex(0x9a6f4a).lerp(HOT_BIT, heat);
      roverBuilt.dyn.bitMat.emissiveIntensity = heat * heat * 1.5;
    }
    // THE RIG VENTS AS IT COOLS (law §5 "Heat critical … steam vents on stop"). Coming off a hot
    // bore, the coolant stack behind the boom puffs steam for a beat. The puff is spawned at the
    // rover's own depth, not the particle plane: a chip 3 world units nearer than the vent it came
    // from composites additively over the rock and reads as a bloom blob, not steam.
    if (temp > 44 && temp < roverAnim.lastTemp - 0.01) roverAnim.vent = Math.max(roverAnim.vent, 0.9);
    roverAnim.lastTemp = temp;
    if (roverAnim.vent > 0) {
      roverAnim.vent = Math.max(0, roverAnim.vent - dt);
      roverAnim.ventTick -= dt;
      if (roverAnim.ventTick <= 0 && !motionReduce) {
        roverAnim.ventTick = 0.13;
        const vo = roverBuilt.dyn.ventOffset;
        const flipped = roverAnim.flipY > Math.PI / 2;
        burst({
          x: drawPos.x + TILE / 2 + (flipped ? -vo.x : vo.x) * TILE,
          y: drawPos.y + TILE / 2 - (vo.y - 0.06) * TILE,
          count: 3, color: '#8d8171', life: 0.5, size: 2.2, speed: 20,
          kind: 'steam', cone: 1.1, angle: -Math.PI / 2, vy0: -26,
        }, Z.rover + 0.3);
      }
    }
    // THE HOPPER FILLS (law §4). Five welded rubble layers switch on against the live hold volume;
    // the sliding lid draws shut on the same predicate the sim refuses ore with, so the cover is
    // never open while the game is bouncing chunks off it.
    const cargo = drillSys && drillSys.state && drillSys.state.player
      ? drillSys.state.player.cargo : null;
    const capVol = cargo && cargo.capVolume > 0 ? cargo.capVolume : 0;
    const holdFrac = capVol > 0 ? Math.max(0, Math.min(1, (Number(cargo.usedVolume) || 0) / capVol)) : 0;
    if (holdFrac < 0.995) cargoFullLatch = false;
    let stage = 0;
    while (stage < HOPPER_STEPS.length && holdFrac >= HOPPER_STEPS[stage]) stage++;
    if (stage !== roverAnim.hopStage) {
      roverAnim.hopStage = stage;
      const layers = roverBuilt.dyn.hopperStages;
      for (let i = 0; i < layers.length; i++) layers[i].visible = i < stage;
    }
    const lidTarget = (cargoFullLatch || holdFrac >= 0.999) ? 1 : 0;
    roverAnim.lid += (lidTarget - roverAnim.lid) * Math.min(1, 7 * dt);
    if (roverBuilt.authored) {
      roverBuilt.dyn.hopperLid.rotation.x = roverAnim.lid * -1.2;
    } else {
      roverBuilt.dyn.hopperLid.position.x = roverBuilt.dyn.lidOpenX
        + (roverBuilt.dyn.lidShutX - roverBuilt.dyn.lidOpenX) * roverAnim.lid;
    }
    // tracks, lean, bob
    const leanTarget = (moving && (faceDir === 'left' || faceDir === 'right')) ? -0.05 : 0;
    if (moving && !motionReduce) {
      roverAnim.wheelSpin -= (TILE / (d.avatar.moveDuration || 0.1)) * dt * 0.09;
      roverAnim.bob = Math.sin(timeS * 11) * S * 0.012;
    } else {
      roverAnim.bob *= Math.max(0, 1 - 6 * dt);
    }
    roverAnim.lean += (leanTarget - roverAnim.lean) * Math.min(1, 8 * dt);
    if (roverBuilt.authored) {
      roverBuilt.dyn.body.position.y = roverAnim.bob;
      roverBuilt.dyn.body.rotation.z = roverAnim.lean;
    } else {
      roverBuilt.dyn.body.position.y = -S * 0.06 + roverAnim.bob;
      roverBuilt.dyn.body.rotation.z = roverAnim.lean;
    }
    for (const w of roverBuilt.dyn.wheels) w.rotation.z = roverAnim.wheelSpin;
    // THE TREAD CRAWLS. The sprocket radius converts the wheel's angle into distance along the
    // loop, so the plates travel exactly as fast as the wheels turn — a spinning wheel inside a
    // static belt is the tell that gives away a fake track.
    const phase = roverAnim.wheelSpin * 0.07;
    if (Math.abs(phase - roverAnim.trackPhase) > 0.0004) {
      roverAnim.trackPhase = phase;
      roverBuilt.dyn.setTrackPhase(phase);
    }
    // beacon: idle pulse, brisk blink rolling, strobe under the bit — peak stays under the bit's
    const beaconBusy = drilling ? 9 : (moving ? 5 : 0);
    const beaconIntensity = motionReduce
      ? (drilling || moving ? 0.9 : 0.35)
      : (beaconBusy ? (Math.sin(timeS * beaconBusy) > 0 ? 1.0 : 0.12) : 0.35);
    const beaconMats = roverBuilt.dyn.beaconMats || [roverBuilt.dyn.beacon];
    for (let i = 0; i < beaconMats.length; i++) beaconMats[i].emissiveIntensity = beaconIntensity;
    // headlight points where the work is (left/right ride the body flip)
    const ht = faceDir === 'down' ? [0, -S * 3.2] : (faceDir === 'up' ? [0, S * 3.2] : [S * 3.2, 0]);
    headTarget.position.set(ht[0], ht[1], S * 0.3);
    // A dead battery dims the whole rig, glass included: a lens still glowing under a lamp that is
    // off is a sticker, not a light.
    const powered = !d.energyDepleted;
    headlight.intensity = powered ? 52 : 12;
    const lampMats = roverBuilt.dyn.lampMats || [roverBuilt.dyn.lampMat];
    for (let i = 0; i < lampMats.length; i++) {
      lampMats[i].emissiveIntensity = powered ? 0.55 : 0.12;
    }
    if (!roverBuilt.authored) {
      roverBuilt.dyn.cabGlass.emissiveIntensity = powered ? 0.42 : 0.14;
    }

    // site: machines + overlays + umbilical
    syncMachines(site, projection, timeS);
    const sig = overlaySignature(site, projection);
    if (sig !== overlaySig) {
      overlaySig = sig;
      rebuildOverlays(site, projection);
    }
    // PQ-130.10b: a live run brightens its own jacket, a dead island goes to bare desaturated
    // metal, and the lanes carry their stock as moving dots. All of it per NETWORK now — the two
    // global emissive writes this replaced painted every cable on the rock with the worst net's
    // news, so one brownout in a corner dimmed a spine that was running fine.
    syncNetworks(site, projection, dt, timeS);
    syncCrates(site, projection);
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
      if (w.instance) {
        if (authoredOreByCell.get(w.idx) !== w.instance) {
          oreWakes.splice(i, 1);
          continue;
        }
        const t = motionReduce ? 1 : (timeS - w.t0) / 0.24;
        const k = t >= 1 ? 1 : (1 - Math.pow(1 - Math.max(0, t), 2));
        const overshoot = t < 1 && !motionReduce
          ? 1 + Math.sin(Math.min(1, t) * Math.PI) * 0.14
          : 1;
        w.instance.scale.setScalar(w.scale * (0.25 + 0.75 * k) * overshoot);
        if (t >= 1) oreWakes.splice(i, 1);
        continue;
      }
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

    // One bracket pool serves the cursor's contact ring AND the Faces seats, so the frame's marks
    // are opened here and flushed once both have had their say.
    seatsUsed = 0;
    seatGeometryForZoom();
    syncCursor(ui);
    syncFaces(d, ui, timeS);
    flushSeats();
    syncGrid(ui, dt);
    syncOreRegister();
    syncSeamAnnotations(d, site, projection);
    syncMkStamp(d, dt);
    syncScanRing(d, rx, ry);
    layoutWantChips();
    stepFx(dt);
    stepDom(d, dt);
    bloom.render(scene, camera);
  }

  // ---------------------------------------------------------------- teardown
  function dispose() {
    worksTearingDown = true;
    worksProofGen += 1;
    worksProofWanted = false;
    if (worksHostObs) {
      worksHostObs.disconnect();
      worksHostObs = null;
    }
    // Before retireWorksAssets drops the loader reference — afterwards there is nothing left to
    // release through, which is why the old teardown branch could never fire.
    releaseAuthoredRover();
    releaseAuthoredDerrick();
    releaseAuthoredInclusionKit();
    Promise.resolve(retireWorksAssets('works-screen-exit')).then(finishDispose, finishDispose);
  }
  function finishDispose() {
    if (glTeardownDone) return;
    glTeardownDone = true;
    for (const [, b] of oreBuckets) { oreRoot.remove(b.mesh); b.mesh.dispose(); }
    oreBuckets.clear();
    for (const [, g] of gasByCell) {
      if (g.authored) releaseWorksInclusionInstance(g.authored);
      gasRoot.remove(g.group);
    }
    gasByCell.clear();
    clearVentedScars();
    for (const id of [...machines.keys()]) removeMachine(id);
    clearGhost();
    if (umbilical) {
      scene.remove(umbilical.casing, umbilical.core);
      umbilical.casing.geometry.dispose();
      umbilical.core.geometry.dispose();
      umbilical = null;
    }
    rebuildOverlays(null);
    // PQ-130.10b teardown. rebuildOverlays(null) already released every per-network material and
    // merged run through disposeOverlayParts; what is left is the layer's own shared kit.
    canvas.removeEventListener('keydown', onLensKey);
    overlayRoot.remove(flowDots);
    flowDots.dispose();
    flowDotGeo.dispose();
    flowDotMat.dispose();
    junctionNodeGeo.dispose();
    if (crateMesh) { siteRoot.remove(crateMesh); crateMesh = null; }
    for (const g of crateGeos) { if (g) g.dispose(); }
    crateGeos.length = 0;
    crateMat.dispose();
    fxRoot.remove(seatBrackets);
    seatBrackets.dispose();
    seatGeo.dispose();
    seatMat.dispose();
    trayMat.dispose();
    for (const plate of whyPool) { fxRoot.remove(plate.mesh); plate.mat.dispose(); }
    whyPool.length = 0;
    for (const tex of whyTextures.values()) tex.dispose();
    whyTextures.clear();
    whyPlateGeo.dispose();
    fxRoot.remove(gridPlane);
    gridPlane.geometry.dispose();
    if (gridMat.map) gridMat.map.dispose();
    gridMat.dispose();
    for (const bucket of ROCK_BUCKETS) {
      for (const inst of rockInst[bucket]) inst.dispose();
      rockInst[bucket] = [];
    }
    for (const bi of bandInsts) { rockGroup.remove(bi); bi.dispose(); }
    bandInsts = [];
    cellRock.clear();
    if (plateauInst) { rockGroup.remove(plateauInst); plateauInst.dispose(); plateauInst = null; }
    if (skirtInst) { rockGroup.remove(skirtInst); skirtInst.dispose(); skirtInst = null; }
    releaseAuthoredDerrick();
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
    // PQ-130.07 event bodies
    unsubscribeWarn();
    for (const chip of wantChipPool) { fxRoot.remove(chip.mesh); chip.mat.dispose(); }
    wantChipPool.length = 0;
    for (const rec of wantTextures.values()) rec.tex.dispose();
    wantTextures.clear();
    fxRoot.remove(vaporMesh); vaporMesh.dispose(); vaporMat.dispose();
    scene.remove(flashLight);
    if (podMesh) { scene.remove(podMesh); podMesh = null; }
    podMat.dispose();
    for (const m of roverScars) { if (m.parent && !roverBuilt.authored) m.parent.remove(m); }
    roverScars.length = 0;
    scarMat.dispose();
    releaseAuthoredRover();
    oreArcs.length = 0;
    vapors.length = 0;
    seamLineMat.dispose(); splitLineMat.dispose();
    gasVaporHotMat.dispose(); gasCoreMat.dispose(); ventedMat.dispose();
    canvas.__ast3d = null;
    laneCoreMat.dispose(); powerCoreMat.dispose(); casingMat.dispose();
    gasMat.dispose(); gasCrackMat.dispose(); gasCrackHotMat.dispose();
    frameMat.dispose();
    scanMat.dispose(); scanRing.geometry.dispose();
    crackDecalMat.dispose(); crackDecal.geometry.dispose();
    for (const m of crackStageMeshes) { fxRoot.remove(m); m.geometry.dispose(); m.material.dispose(); m.dispose(); }
    crackStageMeshes.length = 0;
    for (const t of crackTexs) t.dispose();
    for (const p of pulseRings) { p.mat.dispose(); p.mesh.geometry.dispose(); }
    umbCasingMat.dispose(); umbCoreMat.dispose();
    partGeo.dispose(); partMat.dispose(); chunkGeo.dispose(); chunkMat.dispose();
    if (worksProofMaskMaterial) {
      worksProofMaskMaterial.dispose();
      worksProofMaskMaterial = null;
    }
    if (worksProofBlackMat) {
      worksProofBlackMat.dispose();
      worksProofBlackMat = null;
    }
    if (worksProofFlatMat) {
      worksProofFlatMat.dispose();
      worksProofFlatMat = null;
    }
    if (worksProofGhostMat) {
      worksProofGhostMat.dispose();
      worksProofGhostMat = null;
    }
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

  return {
    begin, render, notify, refreshCells, pickCell, inputZoom, setZoomRegister, toggleZoomRegister,
    // PQ-130.10b — the lens cycle is owned here (the canvas listener below `V` is the shipped path)
    // and exported so the screen can mount §6.5's chip row against the same state later.
    setLens, cycleLens, getLens: () => lensName,
    dispose,
  };
}
