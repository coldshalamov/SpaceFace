// build_map §24 optic-asteroids "More stamps, same compiler" (second pass):
// OPTIC_STRUCTURES grows two more sites past Sker/Vesta/Io — a forked fuse at
// Pallas Drift's Sker-Run Ambush and an open bank-mouth redoubt on Ashfall
// Reach's Iron Maw Approach. This fixture proves the new stamps bind to real
// fight sectors and real fight zones, compile through the shared compiler to
// legal lattices, differ from each other and from the four existing stamps,
// and that world.js's opticStructuresFor lookup stamps them as live colliders.
// Harness idioms and the boot mirror optic-stamps.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import {
  OPTIC_LATTICE_SPACING,
  OPTIC_MATERIALS,
  OPTIC_RAY_COUNT,
  opticHeadings,
  traceOpticRay,
} from '../src/combat/opticField.js';
import {
  ASHFALL_PICKET_REDOUBT_ID,
  CERES_PRISM_GALLERY_ID,
  IO_BOLTHOLE_ID,
  OPTIC_STRUCTURES,
  PALLAS_AMBUSH_KNOT_ID,
  SKER_GATEMOUTH_WICK_ID,
  VESTA_FREIGHTER_POCKET_ID,
  compileOpticStructure,
  opticStructuresFor,
} from '../src/data/opticStructures.js';
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

const HEADINGS = opticHeadings(OPTIC_RAY_COUNT); // world-space, 8-way

function specById(id) {
  const spec = OPTIC_STRUCTURES.find((s) => s.id === id);
  assert.ok(spec, `OPTIC_STRUCTURES missing ${id}`);
  return spec;
}

function bodiesFor(id) {
  return compileOpticStructure(specById(id));
}

function countMaterials(bodies) {
  const counts = { stone: 0, metal: 0, diamond: 0 };
  for (const body of bodies) counts[body.material] += 1;
  return counts;
}

function indexOfCell(bodies, ix, iz) {
  return bodies.findIndex((body) => body.ix === ix && body.iz === iz);
}

function sectorById(id) {
  const sector = SECTORS.find((s) => s.id === id);
  assert.ok(sector, `unknown sector ${id}`);
  return sector;
}

function zoneForSpec(spec) {
  const zone = zonesForSector(spec.sectorId).find((z) => z.id === spec.zoneId);
  assert.ok(zone, `${spec.zoneId} is not a zone of ${spec.sectorId}`);
  return zone;
}

function cellWorld(spec, ix, iz) {
  const cos = Math.cos(spec.heading || 0);
  const sin = Math.sin(spec.heading || 0);
  return {
    x: (ix * OPTIC_LATTICE_SPACING) * cos - (iz * OPTIC_LATTICE_SPACING) * sin,
    z: (ix * OPTIC_LATTICE_SPACING) * sin + (iz * OPTIC_LATTICE_SPACING) * cos,
  };
}

function structureExtent(bodies) {
  let extent = 0;
  for (const body of bodies) {
    extent = Math.max(extent, Math.hypot(body.x, body.z) + (Number(body.radius) || 0));
  }
  return extent;
}

function bootWorld(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 4, mass: 12, hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  return { state, world };
}

test('both new stamps bind to real fight zones in two more un-stamped sectors', () => {
  const stampedBefore = new Set([
    'sector_ceres_belt', 'sector_sker_haven', 'sector_vesta_forge', 'sector_io_reach',
  ]);
  const seenSectors = new Set();
  for (const id of [PALLAS_AMBUSH_KNOT_ID, ASHFALL_PICKET_REDOUBT_ID]) {
    const spec = specById(id);
    assert.ok(!stampedBefore.has(spec.sectorId),
      `${spec.id} must stamp a sector with no optic structure yet`);
    seenSectors.add(spec.sectorId);
    const sector = sectorById(spec.sectorId);
    const zone = zoneForSpec(spec);
    assert.equal(zone.type, 'ambush_lane', `${spec.zoneId} should be a named fight lane`);
    // A stamp belongs where people already fight: the zone carries hostile presence.
    assert.ok(zone.presence && zone.presence.hostile === true,
      `${spec.zoneId} has no hostile presence`);
    // The recipe id and sector-local origin sit inside the named fight zone.
    const d = Math.hypot(spec.origin.x - zone.center.x, spec.origin.z - zone.center.z);
    assert.ok(d <= zone.radius, `${spec.id} origin ${d.toFixed(0)} escapes ${zone.id} r=${zone.radius}`);
    assert.ok(Math.hypot(spec.origin.x, spec.origin.z) <= sector.worldRadius,
      `${spec.id} origin escapes the sector`);
  }
  assert.equal(seenSectors.size, 2, 'the two new stamps must live in two different sectors');

  // The Pallas knot lies on the wreck the camp already made: the ambush zone's
  // core IS the drifting hulk the raiders killed, and the stamp sits inside it.
  const pallas = specById(PALLAS_AMBUSH_KNOT_ID);
  const hulk = (sectorById(pallas.sectorId).pois || []).find((p) => p.id === 'poi_pwreck');
  assert.ok(hulk, 'Pallas Drift lost the pirate wreck POI');
  const camp = zoneForSpec(pallas);
  assert.equal(camp.center.x, SECTOR_ANCHORS[pallas.sectorId].pois.find((p) => p.id === 'poi_pwreck').pos.x);
  assert.equal(camp.center.z, SECTOR_ANCHORS[pallas.sectorId].pois.find((p) => p.id === 'poi_pwreck').pos.z);
});

test('both new stamps compile to legal lattices and stand clear of belts and berths', () => {
  for (const id of [PALLAS_AMBUSH_KNOT_ID, ASHFALL_PICKET_REDOUBT_ID]) {
    const spec = specById(id);
    const bodies = compileOpticStructure(spec);
    assert.ok(bodies.length > 0, `${id} compiled empty`);

    // The structure heading must keep cells on the eight splinter axes.
    const quarters = (spec.heading || 0) / (Math.PI / 4);
    assert.ok(Math.abs(quarters - Math.round(quarters)) < 1e-9,
      `${id} heading ${spec.heading} is off the compass grid`);

    const seen = new Set();
    for (const body of bodies) {
      assert.ok(OPTIC_MATERIALS[body.material], `${id} unknown material ${body.material}`);
      assert.ok(Number.isInteger(body.ix) && Number.isInteger(body.iz), `${id} cell off grid`);
      const key = `${body.ix},${body.iz}`;
      assert.ok(!seen.has(key), `${id} duplicate cell ${key}`);
      seen.add(key);
      const expect = cellWorld(spec, body.ix, body.iz);
      assert.ok(Math.abs(body.x - expect.x) < 1e-9 && Math.abs(body.z - expect.z) < 1e-9,
        `${id} body ${key} is not where the lattice put it`);
    }
    // A diamond never overlaps another body; stone-on-stone overlap is the lattice rule.
    for (let i = 0; i < bodies.length; i++) {
      if (bodies[i].material !== 'diamond') continue;
      for (let j = 0; j < bodies.length; j++) {
        if (i === j) continue;
        const gap = Math.hypot(bodies[i].x - bodies[j].x, bodies[i].z - bodies[j].z);
        assert.ok(gap + 1e-6 >= bodies[i].radius + bodies[j].radius,
          `${id} diamond ${bodies[i].ix},${bodies[i].iz} overlaps ${bodies[j].ix},${bodies[j].iz}`);
      }
    }

    // Placement: no cell sits inside a rock disc, and the lattice keeps clear
    // of the sector's stations, gates (player entry points), and POI anchors.
    const anchor = SECTOR_ANCHORS[spec.sectorId] || {};
    const extent = structureExtent(bodies);
    for (const field of anchor.fields || []) {
      const gap = Math.hypot(spec.origin.x - field.center.x, spec.origin.z - field.center.z);
      assert.ok(gap >= (field.clusterRadius || 450) + extent - 1e-6,
        `${id} reaches inside ${field.id} (${gap.toFixed(0)} < ${(field.clusterRadius || 450) + extent})`);
    }
    for (const station of anchor.stations || []) {
      const gap = Math.hypot(spec.origin.x - station.pos.x, spec.origin.z - station.pos.z);
      assert.ok(gap >= 800, `${id} crowds ${station.id} berth (${gap.toFixed(0)})`);
    }
    for (const gate of anchor.gates || []) {
      const gap = Math.hypot(spec.origin.x - gate.pos.x, spec.origin.z - gate.pos.z);
      assert.ok(gap >= extent + 800, `${id} crowds the ${gate.to} gate spawn (${gap.toFixed(0)})`);
    }
  }
});

test('the Pallas stamp is a forked fuse: a branch knot with an open banked muzzle', () => {
  const bodies = bodiesFor(PALLAS_AMBUSH_KNOT_ID);
  assert.deepEqual(countMaterials(bodies), { stone: 16, metal: 2, diamond: 8 });

  // Spine: five diamonds on row iz=0; branch: three more down column ix=2.
  const diamonds = bodies.filter((b) => b.material === 'diamond');
  assert.deepEqual(
    diamonds.map((b) => `${b.ix},${b.iz}`).sort(),
    ['0,0', '1,0', '2,-1', '2,-2', '2,-3', '2,0', '3,0', '4,0'],
  );

  // One bolt in the mouth lights both arms: the junction's splinters walk the
  // spine and the branch alike. Rays trace in world headings — spec.heading is
  // local +ix, so the branch's local -iz leaves at spec.heading - π/2.
  const spec = specById(PALLAS_AMBUSH_KNOT_ID);
  const junction = indexOfCell(bodies, 2, 0);
  const spineHit = traceOpticRay(bodies, junction, spec.heading);
  const branchHit = traceOpticRay(bodies, junction, spec.heading - Math.PI / 2);
  assert.ok(spineHit >= 0 && bodies[spineHit].material === 'diamond' && bodies[spineHit].ix === 3,
    'the junction must feed the spine');
  assert.ok(branchHit >= 0 && bodies[branchHit].material === 'diamond' && bodies[branchHit].iz === -1,
    'the junction must feed the branch');

  // The mouth is open on its rear fan (the trap's approach), and nowhere else
  // on the spine's walled side.
  const mouth = indexOfCell(bodies, 0, 0);
  const mouthEscapes = [];
  for (let step = 0; step < HEADINGS.length; step++) {
    if (traceOpticRay(bodies, mouth, HEADINGS[step]) < 0) mouthEscapes.push(step);
  }
  assert.equal(mouthEscapes.length, 3, `mouth should leak a three-ray fan, got ${mouthEscapes}`);

  // The branch tip dies into its three-cell cap wall.
  const branchTip = indexOfCell(bodies, 2, -3);
  for (let step = 0; step < HEADINGS.length; step++) {
    const hit = traceOpticRay(bodies, branchTip, HEADINGS[step]);
    assert.ok(hit >= 0, `branch tip leaks on heading ${step}`);
    const target = bodies[hit];
    assert.ok(target.material !== 'metal', `branch tip ray ${step} hits metal`);
  }

  // The muzzle: one free ray down-lane (the trap's reply) and both diagonal
  // splinters banked off the (6,±2) mirrors.
  const muzzle = indexOfCell(bodies, 4, 0);
  const muzzleEscapes = [];
  const muzzleMetals = [];
  for (let step = 0; step < HEADINGS.length; step++) {
    const hit = traceOpticRay(bodies, muzzle, HEADINGS[step]);
    if (hit < 0) muzzleEscapes.push(step);
    else if (bodies[hit].material === 'metal') muzzleMetals.push(bodies[hit]);
  }
  assert.equal(muzzleEscapes.length, 1, 'the muzzle fires exactly one free ray');
  assert.equal(muzzleMetals.length, 2, 'both muzzle diagonals must bank on mirrors');
  assert.deepEqual(
    muzzleMetals.map((b) => `${b.ix},${b.iz}`).sort(),
    ['6,-2', '6,2'],
  );

  // Every other diamond is fully walled — no ray leaves the lattice but the
  // mouth fan and the muzzle shot.
  let escapes = 0;
  for (const body of diamonds) {
    for (const h of HEADINGS) {
      if (traceOpticRay(bodies, bodies.indexOf(body), h) < 0) escapes++;
    }
  }
  assert.equal(escapes, 4, `expected the 4-ray signature (3 mouth + 1 muzzle), got ${escapes}`);
});

test('the Ashfall stamp is an open bank mouth: a walled block with one whole face open', () => {
  const bodies = bodiesFor(ASHFALL_PICKET_REDOUBT_ID);
  assert.deepEqual(countMaterials(bodies), { stone: 8, metal: 2, diamond: 4 });

  // A 2x2 kill block; the -iz parapet row is entirely missing — no doors, a mouth.
  const diamonds = bodies.filter((b) => b.material === 'diamond');
  assert.deepEqual(diamonds.map((b) => `${b.ix},${b.iz}`).sort(), ['0,0', '0,1', '1,0', '1,1']);
  const stones = new Set(bodies.filter((b) => b.material === 'stone').map((b) => `${b.ix},${b.iz}`));
  for (const key of ['-1,0', '-1,1', '-1,2', '0,2', '1,2', '2,0', '2,1', '2,2']) {
    assert.ok(stones.has(key), `parapet cell ${key} is missing`);
  }
  for (const key of ['-1,-1', '0,-1', '1,-1', '2,-1']) {
    assert.ok(!stones.has(key) && indexOfCell(bodies, ...key.split(',').map(Number)) < 0,
      `mouth cell ${key} should be empty — the face is open`);
  }

  // The two front diamonds each spit the open face and bank one corner ray on
  // the jaw mirrors at (-2,-2) and (3,-2).
  const front = [indexOfCell(bodies, 0, 0), indexOfCell(bodies, 1, 0)];
  const banked = new Set();
  for (const idx of front) {
    let open = 0;
    for (let step = 0; step < HEADINGS.length; step++) {
      const hit = traceOpticRay(bodies, idx, HEADINGS[step]);
      if (hit < 0) open++;
      else if (bodies[hit].material === 'metal') banked.add(`${bodies[hit].ix},${bodies[hit].iz}`);
    }
    assert.equal(open, 2, `front diamond ${bodies[idx].ix} must spit two rays out the mouth`);
  }
  assert.deepEqual([...banked].sort(), ['-2,-2', '3,-2'],
    'each corner splinter must bank on its jaw mirror');

  // The back row is fully walled: a splinter out the rear never happens.
  for (const idx of [indexOfCell(bodies, 0, 1), indexOfCell(bodies, 1, 1)]) {
    for (let step = 0; step < HEADINGS.length; step++) {
      const hit = traceOpticRay(bodies, idx, HEADINGS[step]);
      assert.ok(hit >= 0, `rear diamond leaks on heading ${step}`);
      assert.notEqual(bodies[hit].material, 'metal', `rear diamond ray ${step} hits metal`);
    }
  }
});

test('the two new stamps are two structurally different arrangements', () => {
  const signature = (id) => {
    const bodies = bodiesFor(id);
    const counts = countMaterials(bodies);
    const diamonds = bodies.filter((b) => b.material === 'diamond');
    const cells = new Set(diamonds.map((b) => `${b.ix},${b.iz}`));

    const rows = new Map();
    for (const d of diamonds) {
      if (!rows.has(d.iz)) rows.set(d.iz, new Set());
      rows.get(d.iz).add(d.ix);
    }
    let fuseRun = 0;
    for (const xs of rows.values()) {
      const sorted = [...xs].sort((a, b) => a - b);
      let run = 1;
      for (let i = 1; i < sorted.length; i++) {
        run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
        if (run > fuseRun) fuseRun = run;
      }
    }
    let block = 0;
    for (const d of diamonds) {
      for (let n = 2; n <= 4; n++) {
        let filled = true;
        for (let dx = 0; dx < n && filled; dx++) {
          for (let dz = 0; dz < n && filled; dz++) {
            if (!cells.has(`${d.ix + dx},${d.iz + dz}`)) filled = false;
          }
        }
        if (filled) block = Math.max(block, n);
      }
    }
    let escapes = 0;
    for (const d of diamonds) {
      for (const h of HEADINGS) {
        if (traceOpticRay(bodies, bodies.indexOf(d), h) < 0) escapes++;
      }
    }
    return { ...counts, fuseRun, block, escapes };
  };

  const pallas = signature(PALLAS_AMBUSH_KNOT_ID);
  const ashfall = signature(ASHFALL_PICKET_REDOUBT_ID);

  // Forked fuse: a five-run spine plus the branch — no filled block, and the
  // mouth fan plus the muzzle shot make the open signature.
  assert.deepEqual(pallas, { stone: 16, metal: 2, diamond: 8, fuseRun: 5, block: 0, escapes: 4 });
  // Bank-mouth redoubt: a sealed 2x2 block behind a three-side parapet — its
  // whole open face is the mouth, the two corner rays bank on the jaws.
  assert.deepEqual(ashfall, { stone: 8, metal: 2, diamond: 4, fuseRun: 2, block: 2, escapes: 4 });

  // And both differ from every stamp already on the registry.
  const existing = [
    CERES_PRISM_GALLERY_ID,
    SKER_GATEMOUTH_WICK_ID,
    VESTA_FREIGHTER_POCKET_ID,
    IO_BOLTHOLE_ID,
  ].map(signature);
  for (const sig of existing) {
    assert.notDeepEqual(pallas, sig);
    assert.notDeepEqual(ashfall, sig);
  }
  assert.notDeepEqual(pallas, ashfall);
});

test('world.js stamps both new lattices as field-resident bodies in their own sectors', () => {
  const { state, world } = bootWorld(4242);

  for (const id of [PALLAS_AMBUSH_KNOT_ID, ASHFALL_PICKET_REDOUBT_ID]) {
    const spec = specById(id);
    // The exact lookup world._ensureOpticStructures runs for a sector bag.
    assert.deepEqual(opticStructuresFor(spec.sectorId).map((s) => s.id), [id],
      `${spec.sectorId} must resolve exactly ${id}`);

    world.enterSector(spec.sectorId);
    const expected = compileOpticStructure(spec);
    const opticRocks = ((state.world.asteroidField && state.world.asteroidField.rocks) || []);
    const live = opticRocks.filter((e) => e.alive !== false && e.data && e.data.opticStructureId === id);
    assert.equal(live.length, expected.length, `${id} field-resident body count`);

    const origin = sectorGlobalOrigin(spec.sectorId);
    const counts = { stone: 0, metal: 0, diamond: 0 };
    for (const ent of live) {
      counts[ent.data.opticMaterial] += 1;
      assert.equal(ent.homeSectorId, spec.sectorId);
      assert.equal(ent.collides, true);
      assert.equal(ent.data.masslineTetherable, false);
      const [ix, iz] = ent.data.opticCell.split(',').map(Number);
      const body = expected.find((b) => b.ix === ix && b.iz === iz);
      assert.ok(body, `${id} spawned an off-recipe cell ${ix},${iz}`);
      const wantX = origin.x + spec.origin.x + body.x;
      const wantZ = origin.z + spec.origin.z + body.z;
      assert.ok(Math.abs(ent.pos.x - wantX) < 1e-6 && Math.abs(ent.pos.z - wantZ) < 1e-6,
        `${id} cell ${ix},${iz} spawned off its lattice point`);
    }
    for (const body of expected) counts[body.material] -= 1;
    assert.deepEqual(counts, { stone: 0, metal: 0, diamond: 0 }, `${id} material multiset`);
  }

  // Neither new sector sprouts the Ceres reference layout — and Pallas/Ashfall
  // carry no scatter lattices now that they are authored (scatter ids are
  // `scatter:<sectorId>:<n>` — authored sectors are excluded from the draw).
  const allOpticRocks = (state.world.asteroidField && state.world.asteroidField.rocks) || [];
  assert.equal(
    allOpticRocks.filter((e) => e.data && e.data.opticStructureId === CERES_PRISM_GALLERY_ID).length,
    0,
  );
  assert.equal(
    allOpticRocks.filter((e) => e.data && typeof e.data.opticStructureId === 'string'
      && e.data.opticStructureId.startsWith('scatter:')).length,
    0,
    'an authored sector must not also grow a seeded scatter lattice',
  );
});
