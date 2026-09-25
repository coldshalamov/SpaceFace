// Optic structures are lattices of stone, metal, and diamond, not hand-placed pebbles.
// One recipe expands into the bodies world.js spawns. Cells share OPTIC_LATTICE_SPACING
// so an 8-way prism hits the next cell or a stone border and nothing else.

import {
  OPTIC_LATTICE_SPACING,
  OPTIC_MATERIALS,
} from '../combat/opticField.js';

export const CERES_PRISM_GALLERY_ID = 'optic_ceres_prism_gallery';
export const CERES_PRISM_GALLERY_ORIGIN = Object.freeze({ x: 1680, z: -2100 });

function cellKey(ix, iz) {
  return `${ix},${iz}`;
}

function putCell(map, ix, iz, material) {
  const key = cellKey(ix, iz);
  if (map.has(key)) return false;
  map.set(key, { ix, iz, material });
  return true;
}

/** A straight fuse. Forward splinters walk +ix. The ±iz rows are stone. */
export function wickCells(map, length, ix0 = 0, iz = 0) {
  const n = Math.max(0, length | 0);
  for (let i = 0; i < n; i++) {
    putCell(map, ix0 + i, iz, 'diamond');
    putCell(map, ix0 + i, iz + 1, 'stone');
    putCell(map, ix0 + i, iz - 1, 'stone');
  }
}

/** A filled diamond block. ix/iz are the minimum corner. */
export function murderFieldCells(map, ix0, iz0, width, height) {
  const w = Math.max(0, width | 0);
  const h = Math.max(0, height | 0);
  for (let ix = ix0; ix < ix0 + w; ix++) {
    for (let iz = iz0; iz < iz0 + h; iz++) putCell(map, ix, iz, 'diamond');
  }
}

/** Stone on every empty cell of the inclusive border. Does not overwrite a diamond. */
export function stoneRingCells(map, ix0, ix1, iz0, iz1) {
  for (let ix = ix0; ix <= ix1; ix++) {
    putCell(map, ix, iz0, 'stone');
    putCell(map, ix, iz1, 'stone');
  }
  for (let iz = iz0; iz <= iz1; iz++) {
    putCell(map, ix0, iz, 'stone');
    putCell(map, ix1, iz, 'stone');
  }
}

/**
 * A walled pocket: the stoneRingCells border with named ring cells knocked out as
 * doors. `doors` is a list of {ix, iz} positions on the border rectangle — each one
 * leaves a single breach, so pick an axis (a fuse tip or a sentry metal usually sits
 * on it). A door key deletes whatever occupies it — name ring cells, not interior.
 */
export function stonePocketCells(map, ix0, ix1, iz0, iz1, doors = []) {
  stoneRingCells(map, ix0, ix1, iz0, iz1);
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    if (d && Number.isInteger(d.ix) && Number.isInteger(d.iz)) map.delete(cellKey(d.ix, d.iz));
  }
}

/**
 * Ceres gallery. A six-crystal fuse runs into a 3×3 field. Stone walls the lane and
 * the field. Two metal rocks sit west of the mouth flanks (not behind the wick stones)
 * so a banked shot can still enter — (0,±2) put stone between metal and the fuse.
 */
export function ceresPrismGalleryCells() {
  const map = new Map();
  const wick = 6;
  wickCells(map, wick, 0, 0);
  const fieldX = wick;
  const fieldZ = -1;
  murderFieldCells(map, fieldX, fieldZ, 3, 3);
  stoneRingCells(map, fieldX - 1, fieldX + 3, -2, 2);
  putCell(map, -2, 1, 'metal');
  putCell(map, -2, -1, 'metal');
  return [...map.values()].sort((a, b) => (a.ix - b.ix) || (a.iz - b.iz));
}

// ── Stamps past Ceres ───────────────────────────────────────────────────────
// One recipe per site, each pinned where pilots already fight — a gate-camp lane
// and a wreck drift. Every spec carries the zone it was authored against.

export const SKER_GATEMOUTH_WICK_ID = 'optic_sker_gatemouth_wick';
// Gateward rim of zone_sker_gatecamp, on the bearing of the Pallas Drift gate.
export const SKER_GATEMOUTH_WICK_ORIGIN = Object.freeze({ x: 1730, z: -1630 });

/**
 * Reach Gate-Camp, Sker Haven — a gate-mouth fuse, not a gallery. Six diamonds
 * run down the inbound lane (heading 90° lays +ix on +z, so the fuse points into
 * the sector and the mouth at ix=0 faces the Pallas gate). A bolt fired along the
 * lane enters the mouth and walks the whole fuse; the far tip dies into a stone
 * end wall instead of a field. Two jaw mirrors sit exactly on the mouth's rear
 * diagonals, so the mouth's own rear splinters bank back off the jaws.
 */
export function skerGatemouthWickCells() {
  const map = new Map();
  wickCells(map, 6, 0, 0);
  // End wall: the tip's forward and diagonal splinters land in stone, not space.
  putCell(map, 6, -1, 'stone');
  putCell(map, 6, 0, 'stone');
  putCell(map, 6, 1, 'stone');
  // Jaw mirrors on the mouth's rear diagonals — the bank mouth.
  putCell(map, -2, -2, 'metal');
  putCell(map, -2, 2, 'metal');
  return [...map.values()].sort((a, b) => (a.ix - b.ix) || (a.iz - b.iz));
}

export const VESTA_FREIGHTER_POCKET_ID = 'optic_vesta_freighter_pocket';
// Inside zone_vesta_derelict, just off the Dead Freighter hulk toward the Forge.
export const VESTA_FREIGHTER_POCKET_ORIGIN = Object.freeze({ x: 768, z: -1340 });

/**
 * Dead Freighter Drift, Vesta Forge — a wreck-site pocket. A closed stone ring
 * holds a 2×2 diamond field beside the hulk; one door cell opens the +iz wall,
 * and a lone sentry metal sits on the door axis outside the ring. Heading 45°
 * swings the door onto the northwest Forge approach so a bolt through the door
 * lights the pocket, while a splinter escaping the door banks off the sentry.
 * No fuse — this is a closed field with a mouth, the mirror of Ceres.
 */
export function vestaFreighterPocketCells() {
  const map = new Map();
  murderFieldCells(map, 1, 1, 2, 2);
  stonePocketCells(map, 0, 4, 0, 3, [{ ix: 2, iz: 3 }]);
  putCell(map, 2, 4, 'metal');
  return [...map.values()].sort((a, b) => (a.ix - b.ix) || (a.iz - b.iz));
}

export const IO_BOLTHOLE_ID = 'optic_io_bolthole';
// North lee of the Cruiser Graveyard hulk, zone_io_derelict — the shelter stands
// where the Vigilant's escorts died covering the lane, door facing the wreck.
export const IO_BOLTHOLE_ORIGIN = Object.freeze({ x: -1420, z: -700 });

/**
 * Cruiser Graveyard, Io Reach — the bolthole. A survivor's box: a stone ring
 * (the shell that eats bolts) sheathed in a diamond skin (the box that fights
 * back once). The diamond apron ring is contiguous, so the first energy bolt
 * that lands lights the whole skin like a fuse — every cell throws its ring
 * outward at the besiegers while the liner eats the inward splinters — then
 * every cell goes dark for the rest of the fight (OPTIC_SPEND_QUIET outlasts
 * one engagement). The hide space is the norm<=1 interior; splinter geometry
 * leaves every interior cell untouched by the shell's own ring.
 *
 * The only way in is the door: a one-cell gap at (0,-2) under a three-cell
 * mouth clearing in the skin. The door lane is the structure's one leak —
 * a bolt threaded through it reaches the interior. The lone metal sentinel
 * at (0,-5) caps the lane: a shot dead on the axis bounces back at the
 * shooter, and a shot grazing its rim banks into the skin's horn cells —
 * the mirror lane of the row, several shot lines arriving at one diamond.
 */
export function ioBoltholeCells() {
  const map = new Map();
  // Diamond skin: the full apron ring, less the three-cell mouth clearing.
  for (let ix = -3; ix <= 3; ix++) {
    for (let iz = -3; iz <= 3; iz++) {
      if (Math.max(Math.abs(ix), Math.abs(iz)) !== 3) continue;
      if (iz === -3 && Math.abs(ix) <= 1) continue; // mouth clearing over the door
      putCell(map, ix, iz, 'diamond');
    }
  }
  // Stone liner: the closed ring with the one-cell door at (0,-2).
  stonePocketCells(map, -2, 2, -2, 2, [{ ix: 0, iz: -2 }]);
  // Door sentinel — the mirror that guards the lane.
  putCell(map, 0, -5, 'metal');
  return [...map.values()].sort((a, b) => (a.ix - b.ix) || (a.iz - b.iz));
}

export function compileOpticCells(cells, spacing = OPTIC_LATTICE_SPACING, heading = 0) {
  const list = Array.isArray(cells) ? cells : [];
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const bodies = [];
  for (let i = 0; i < list.length; i++) {
    const cell = list[i];
    const material = OPTIC_MATERIALS[cell.material];
    if (!material) continue;
    const lx = cell.ix * spacing;
    const lz = cell.iz * spacing;
    bodies.push({
      index: bodies.length,
      ix: cell.ix,
      iz: cell.iz,
      material: material.id,
      typeId: material.typeId,
      tint: material.tint,
      radius: material.radius,
      surfaceMaterial: material.surfaceMaterial,
      x: lx * cos - lz * sin,
      z: lx * sin + lz * cos,
    });
  }
  return bodies;
}

export function compileCeresPrismGallery() {
  return compileOpticCells(ceresPrismGalleryCells(), OPTIC_LATTICE_SPACING, 0);
}

export function opticStructureBounds(bodies) {
  if (!bodies || !bodies.length) return { x: 0, z: 0, radius: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    const reach = Number(body.radius) || 0;
    minX = Math.min(minX, body.x - reach);
    maxX = Math.max(maxX, body.x + reach);
    minZ = Math.min(minZ, body.z - reach);
    maxZ = Math.max(maxZ, body.z + reach);
  }
  return {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    radius: Math.hypot(maxX - minX, maxZ - minZ) / 2,
  };
}

// Each spec binds one recipe to a place pilots already fight: `sectorId` is what
// world.js reads to stamp the lattice; `zoneId` names the authored fight zone the
// stamp was built for (zone record in sectorZones.js / authoredPlaces.js).
export const OPTIC_STRUCTURES = Object.freeze([
  Object.freeze({
    id: CERES_PRISM_GALLERY_ID,
    sectorId: 'sector_ceres_belt',
    zoneId: 'zone_ceres_prism_gallery',
    origin: CERES_PRISM_GALLERY_ORIGIN,
    heading: 0,
    cells: ceresPrismGalleryCells,
  }),
  Object.freeze({
    id: SKER_GATEMOUTH_WICK_ID,
    sectorId: 'sector_sker_haven',
    zoneId: 'zone_sker_gatecamp',
    origin: SKER_GATEMOUTH_WICK_ORIGIN,
    heading: Math.PI / 2,
    cells: skerGatemouthWickCells,
  }),
  Object.freeze({
    id: VESTA_FREIGHTER_POCKET_ID,
    sectorId: 'sector_vesta_forge',
    zoneId: 'zone_vesta_derelict',
    origin: VESTA_FREIGHTER_POCKET_ORIGIN,
    heading: Math.PI / 4,
    cells: vestaFreighterPocketCells,
  }),
  Object.freeze({
    id: IO_BOLTHOLE_ID,
    sectorId: 'sector_io_reach',
    zoneId: 'zone_io_derelict',
    origin: IO_BOLTHOLE_ORIGIN,
    heading: 0,
    cells: ioBoltholeCells,
  }),
]);

export function opticStructuresFor(sectorId) {
  const out = [];
  for (let i = 0; i < OPTIC_STRUCTURES.length; i++) {
    const spec = OPTIC_STRUCTURES[i];
    if (spec.sectorId === sectorId) out.push(spec);
  }
  return out;
}

export function compileOpticStructure(spec) {
  const cells = typeof spec.cells === 'function' ? spec.cells() : spec.cells;
  return compileOpticCells(cells, OPTIC_LATTICE_SPACING, spec.heading || 0);
}

// ── Seeded scatter ──────────────────────────────────────────────────────────
// Ordinary belts grow a few small lattices from the sector seed, so authorship is
// not required for every field. world.js draws them after the rock draw on a
// dedicated stream — mulberry32(hash32(meta.seed, sectorId, epoch, SALT)) — that
// never touches the field/dressing draws. Recipes stay small on purpose: a short
// fuse or a three-crystal cluster, never a Ceres-scale gallery. Structure ids
// (`scatter:<sectorId>:<n>`) are seed-deterministic, so the same seed regrows the
// same cells on re-materialize and the opticSpent ledger keys them exactly like
// the authored stamps.

export const OPTIC_SCATTER_SALT = 'optic-scatter';
export const OPTIC_SCATTER_MAX_LATTICES = 3;
export const OPTIC_SCATTER_PATTERNS = Object.freeze(['fuse', 'triad']);
export const OPTIC_SCATTER_PLACEMENT_TRIES = 8;
// A scatter lattice lands just off its host field's rock disc — close enough to
// read as part of the belt, far enough that no cell sits inside the rock cloud.
export const OPTIC_SCATTER_RIM_PAD = 40;
export const OPTIC_SCATTER_RIM_SPAN = 260;
// …and clear of the anchors a lattice would crowd: stations, gates, POIs, the
// zone cores where authored fight choreography lives, and its sibling lattices.
export const OPTIC_SCATTER_ANCHOR_CLEARANCE = 380;
export const OPTIC_SCATTER_ZONE_CLEARANCE = 320;
export const OPTIC_SCATTER_SEPARATION = 480;

function sortedCells(map) {
  return [...map.values()].sort((a, b) => (a.ix - b.ix) || (a.iz - b.iz));
}

/**
 * Short fuse: 2–4 diamonds on one row with the wick's stone flank rails; half the
 * draws add a cap stone so the tip's forward splinter dies in the lattice.
 */
export function opticScatterFuseCells(rng) {
  const map = new Map();
  const n = 2 + Math.floor((rng ? rng() : 0) * 3); // 2–4 diamonds
  wickCells(map, n, 0, 0);
  if (rng && rng() < 0.5) putCell(map, n, 0, 'stone');
  return sortedCells(map);
}

/**
 * Three-crystal cluster: an L-knee or a straight row of diamonds with a couple of
 * stone ballast cells — enough grammar to walk and eat splinters, nothing more.
 */
export function opticScatterTriadCells(rng) {
  const map = new Map();
  if (!rng || rng() < 0.5) {
    // L-knee: the (0,0) diamond feeds the other two on +x/+z and eats its own
    // −x/−z splinters on the ballast stones.
    putCell(map, 0, 0, 'diamond');
    putCell(map, 1, 0, 'diamond');
    putCell(map, 0, 1, 'diamond');
    putCell(map, 1, 1, 'stone');
    putCell(map, -1, 0, 'stone');
    putCell(map, 0, -1, 'stone');
  } else {
    // Row: the centre diamond's ±z splinters die on the rails.
    putCell(map, 0, 0, 'diamond');
    putCell(map, 1, 0, 'diamond');
    putCell(map, 2, 0, 'diamond');
    putCell(map, 1, -1, 'stone');
    putCell(map, 1, 1, 'stone');
  }
  return sortedCells(map);
}

export function opticScatterCells(pattern, rng) {
  return pattern === 'triad' ? opticScatterTriadCells(rng) : opticScatterFuseCells(rng);
}

function scatterFinitePos(row) {
  const pos = row && (row.center || row.pos || row);
  return pos && Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.z))
    ? { x: Number(pos.x), z: Number(pos.z) }
    : null;
}

function scatterOriginClear(cand, extent, fields, points, zoneCores, placed) {
  // Every cell must stay outside every rock disc — the host field included —
  // so the lattice grows on open ground at the belt's rim, never inside the rocks.
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (Math.hypot(cand.x - field.x, cand.z - field.z) < field.radius + extent) return false;
  }
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (Math.hypot(cand.x - p.x, cand.z - p.z) < OPTIC_SCATTER_ANCHOR_CLEARANCE + extent) return false;
  }
  for (let i = 0; i < zoneCores.length; i++) {
    const zone = zoneCores[i];
    if (Math.hypot(cand.x - zone.x, cand.z - zone.z) < OPTIC_SCATTER_ZONE_CLEARANCE + extent) return false;
  }
  for (let i = 0; i < placed.length; i++) {
    const other = placed[i];
    const gap = OPTIC_SCATTER_SEPARATION + extent + other.extent;
    if (Math.hypot(cand.x - other.x, cand.z - other.z) < gap) return false;
  }
  return true;
}

/**
 * Plan the small lattices one belt grows from its own seed. Pure: `rng` must be
 * the dedicated OPTIC_SCATTER_SALT stream; `anchors` are galactic-global positions
 * from the materialized sector bag. Returns spec-shaped rows ({id, sectorId,
 * origin, heading, cells}) that stamp through the same code as OPTIC_STRUCTURES
 * entries — but `origin` here is already in the caller's frame, so world.js
 * converts it back to sector-local before the shared stamp composes _toGlobal.
 */
export function opticScatterSpecsFor(sectorId, rng, anchors = {}) {
  const fields = (anchors.fields || [])
    .map((row) => {
      const pos = scatterFinitePos(row);
      const radius = Number(row && (row.radius || row.clusterRadius));
      return pos
        ? { x: pos.x, z: pos.z, radius: Number.isFinite(radius) && radius > 0 ? radius : 450 }
        : null;
    })
    .filter(Boolean);
  if (!fields.length) return [];

  const points = [];
  for (const list of [anchors.stations, anchors.gates, anchors.pois]) {
    for (const row of list || []) {
      const pos = scatterFinitePos(row);
      if (pos) points.push(pos);
    }
  }
  const zoneCores = [];
  for (const row of anchors.zones || []) {
    const pos = scatterFinitePos(row);
    if (pos) {
      zoneCores.push({ x: pos.x, z: pos.z, radius: Number(row && row.radius) || 0 });
    }
  }

  const TAU = Math.PI * 2;
  const wanted = 1 + Math.floor((rng ? rng() : 0) * OPTIC_SCATTER_MAX_LATTICES); // 1–3
  const specs = [];
  const placed = [];
  for (let n = 0; n < wanted; n++) {
    const pattern = OPTIC_SCATTER_PATTERNS[
      Math.floor((rng ? rng() : 0) * OPTIC_SCATTER_PATTERNS.length) % OPTIC_SCATTER_PATTERNS.length
    ];
    const cells = opticScatterCells(pattern, rng);
    // Splinters land on the next cell only while the lattice sits on the 8-way
    // grid — an arbitrary heading would strand them between cells, so scatter
    // turns in eighths like the authored stamps.
    const heading = Math.floor((rng ? rng() : 0) * 8) * (Math.PI / 4);
    const bodies = compileOpticCells(cells);
    // Deepest reach of any compiled body from the origin — the clearance radius.
    let extent = OPTIC_LATTICE_SPACING;
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const reach = Math.hypot(body.x, body.z) + (Number(body.radius) || 0);
      if (reach > extent) extent = reach;
    }
    const startField = Math.floor((rng ? rng() : 0) * fields.length) % fields.length;
    let origin = null;
    for (let f = 0; f < fields.length && !origin; f++) {
      const field = fields[(startField + f) % fields.length];
      for (let t = 0; t < OPTIC_SCATTER_PLACEMENT_TRIES && !origin; t++) {
        const ang = rng() * TAU;
        const dist = field.radius + extent + OPTIC_SCATTER_RIM_PAD + rng() * OPTIC_SCATTER_RIM_SPAN;
        const cand = { x: field.x + Math.cos(ang) * dist, z: field.z + Math.sin(ang) * dist };
        if (scatterOriginClear(cand, extent, fields, points, zoneCores, placed)) origin = cand;
      }
    }
    if (!origin) continue;
    placed.push({ x: origin.x, z: origin.z, extent });
    specs.push(Object.freeze({
      id: `scatter:${sectorId}:${specs.length}`,
      sectorId,
      origin: Object.freeze({ x: origin.x, z: origin.z }),
      heading,
      cells: Object.freeze(cells.map((cell) => Object.freeze({ ...cell }))),
      scatter: true,
    }));
  }
  return specs;
}

// Per-arena swarm lattices live beside the arena data in ./swarmOpticArenas.js —
// they are room dressing, not sector structures, so they never enter OPTIC_STRUCTURES.
// Re-exported here so existing imports of this module keep working.
export { compileSwarmOptic, swarmOpticLayout } from './swarmOpticArenas.js';
