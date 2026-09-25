// build_map §24 optic-asteroids: OPTIC_STRUCTURES grows past the Ceres reference
// gallery — a gate-mouth fuse at Sker Haven's Reach Gate-Camp and a walled pocket
// at Vesta Forge's Dead Freighter Drift. This fixture proves the new stamps bind
// to real sectors and real fight zones, compile through the shared compiler to
// legal lattices, differ from each other and from Ceres, and that world.js's
// opticStructuresFor lookup stamps them as live colliders. Harness idioms and
// the seed mirror optic-field.test.mjs.

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
  CERES_PRISM_GALLERY_ID,
  OPTIC_STRUCTURES,
  SKER_GATEMOUTH_WICK_ID,
  VESTA_FREIGHTER_POCKET_ID,
  compileOpticStructure,
  opticStructuresFor,
} from '../src/data/opticStructures.js';
import { SECTORS } from '../src/data/sectors.js';
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

// Distance from point p to the ray leaving cell (ix,iz) along world heading h.
function distanceToCellRay(spec, p, ix, iz, h) {
  const cos = Math.cos(spec.heading || 0);
  const sin = Math.sin(spec.heading || 0);
  const cx = (ix * OPTIC_LATTICE_SPACING) * cos - (iz * OPTIC_LATTICE_SPACING) * sin;
  const cz = (ix * OPTIC_LATTICE_SPACING) * sin + (iz * OPTIC_LATTICE_SPACING) * cos;
  const rx = p.x - cx;
  const rz = p.z - cz;
  return Math.abs(rx * Math.sin(h) - rz * Math.cos(h));
}

function cellWorld(spec, ix, iz) {
  const cos = Math.cos(spec.heading || 0);
  const sin = Math.sin(spec.heading || 0);
  return {
    x: (ix * OPTIC_LATTICE_SPACING) * cos - (iz * OPTIC_LATTICE_SPACING) * sin,
    z: (ix * OPTIC_LATTICE_SPACING) * sin + (iz * OPTIC_LATTICE_SPACING) * cos,
  };
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

test('both new stamps bind to real fight zones in sectors that are not Ceres', () => {
  // The Io bolthole shelter (focus-and-shelter row) joined the registry after this
  // fixture: it binds its own sector and is exercised by optic-focus-shelter.test.mjs.
  assert.equal(OPTIC_STRUCTURES.length, 4);
  assert.equal(new Set(OPTIC_STRUCTURES.map((s) => s.id)).size, 4);

  const sites = [
    { id: SKER_GATEMOUTH_WICK_ID, zoneType: 'ambush_lane' },
    { id: VESTA_FREIGHTER_POCKET_ID, zoneType: 'derelict_field' },
  ];
  const seenSectors = new Set();
  for (const site of sites) {
    const spec = specById(site.id);
    assert.notEqual(spec.sectorId, 'sector_ceres_belt', `${spec.id} must not be a second Ceres stamp`);
    seenSectors.add(spec.sectorId);
    const sector = sectorById(spec.sectorId);
    const zone = zoneForSpec(spec);
    assert.equal(zone.type, site.zoneType);
    // A stamp belongs where people already fight: the zone must carry hostile presence.
    assert.ok(zone.presence && zone.presence.hostile === true,
      `${spec.zoneId} has no hostile presence`);
    // The recipe id and sector-local origin sit inside the named fight zone.
    const d = Math.hypot(spec.origin.x - zone.center.x, spec.origin.z - zone.center.z);
    assert.ok(d <= zone.radius, `${spec.id} origin ${d.toFixed(0)} escapes ${zone.id} r=${zone.radius}`);
    assert.ok(Math.hypot(spec.origin.x, spec.origin.z) <= sector.worldRadius,
      `${spec.id} origin escapes the sector`);
  }
  assert.equal(seenSectors.size, 2, 'the two new stamps must live in two different sectors');

  // The Sker wick is genuinely a gate mouth: the stamp sits on the gateward rim of
  // the camp zone, nearer the real Pallas Drift gate than the zone centre is.
  const sker = specById(SKER_GATEMOUTH_WICK_ID);
  const skerSector = sectorById(sker.sectorId);
  const gate = (skerSector.gates || []).find((g) => g.to === 'sector_pallas_drift');
  assert.ok(gate && gate.pos, 'Sker Haven has no Pallas Drift gate');
  const camp = zoneForSpec(sker);
  const dOrigin = Math.hypot(gate.pos.x - sker.origin.x, gate.pos.z - sker.origin.z);
  const dCenter = Math.hypot(gate.pos.x - camp.center.x, gate.pos.z - camp.center.z);
  assert.ok(dOrigin < dCenter, `gate-mouth stamp ${dOrigin.toFixed(0)} not gateward of centre ${dCenter.toFixed(0)}`);

  // The Vesta pocket stands on the wreck drift: its zone IS the dead freighter.
  const vesta = specById(VESTA_FREIGHTER_POCKET_ID);
  const hulk = (sectorById(vesta.sectorId).pois || []).find((p) => p.id === 'poi_freighter');
  assert.ok(hulk && hulk.pos, 'Vesta Forge lost the dead freighter POI');
  const drift = zoneForSpec(vesta);
  assert.equal(drift.center.x, hulk.pos.x);
  assert.equal(drift.center.z, hulk.pos.z);
});

test('both new stamps compile to non-empty lattices on the shared 64-grid', () => {
  for (const id of [SKER_GATEMOUTH_WICK_ID, VESTA_FREIGHTER_POCKET_ID]) {
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
  }
});

test('the Sker stamp is a six-crystal fuse with a banked jaw mouth, not a field', () => {
  const bodies = bodiesFor(SKER_GATEMOUTH_WICK_ID);
  assert.deepEqual(countMaterials(bodies), { stone: 15, metal: 2, diamond: 6 });

  // Pure fuse: all six diamonds share row iz=0 on consecutive ix — no diamond block.
  const diamonds = bodies.filter((b) => b.material === 'diamond');
  assert.ok(diamonds.every((b) => b.iz === 0), 'fuse diamonds must share one row');
  assert.deepEqual(diamonds.map((b) => b.ix).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);

  // Heading 90° lays the fuse on world +z: the mouth faces -z back at the gate.
  const mouth = indexOfCell(bodies, 0, 0);
  const next = traceOpticRay(bodies, mouth, Math.PI / 2);
  assert.ok(next >= 0 && bodies[next].material === 'diamond' && bodies[next].ix === 1,
    'mouth splinter must walk the fuse');
  assert.equal(traceOpticRay(bodies, mouth, (3 * Math.PI) / 2), -1,
    'the gateward heading must leave the lattice — that is the mouth');

  // The bank mouth: both rear diagonals land on jaw mirrors at ix=-2.
  for (const h of [(5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const hit = traceOpticRay(bodies, mouth, h);
    assert.ok(hit >= 0 && bodies[hit].material === 'metal' && bodies[hit].ix === -2,
      `mouth rear diagonal ${h} must bank on a jaw`);
  }

  // The far tip dies into a stone end wall, and every walled diamond is closed.
  const tip = indexOfCell(bodies, 5, 0);
  const cap = traceOpticRay(bodies, tip, Math.PI / 2);
  assert.ok(cap >= 0 && bodies[cap].material === 'stone' && bodies[cap].ix === 6,
    'the fuse tip needs its end wall');
  for (const body of diamonds) {
    for (let step = 0; step < HEADINGS.length; step++) {
      const hit = traceOpticRay(bodies, bodies.indexOf(body), HEADINGS[step]);
      if (body.ix === 0 && step >= 5) continue; // mouth rear fan: jaws + open gate lane
      assert.ok(hit >= 0, `fuse diamond ${body.ix} leaks on heading ${step}`);
      assert.notEqual(bodies[hit].material, 'metal', `fuse diamond ${body.ix} ray ${step} hits metal`);
    }
  }
});

test('the Vesta stamp is a walled pocket whose only breach is one door on a sentry', () => {
  const spec = specById(VESTA_FREIGHTER_POCKET_ID);
  const bodies = bodiesFor(spec.id);
  assert.deepEqual(countMaterials(bodies), { stone: 13, metal: 1, diamond: 4 });

  // A 2x2 field sealed inside a 5x4 ring — the mirror of the Ceres fuse-into-field.
  const diamonds = bodies.filter((b) => b.material === 'diamond');
  assert.deepEqual(diamonds.map((b) => `${b.ix},${b.iz}`).sort(), ['1,1', '1,2', '2,1', '2,2']);

  // The stone ring is intact except the single door cell at (2,3).
  const stones = new Set(bodies.filter((b) => b.material === 'stone').map((b) => `${b.ix},${b.iz}`));
  for (let ix = 0; ix <= 4; ix++) for (const iz of [0, 3]) {
    const door = ix === 2 && iz === 3;
    assert.equal(stones.has(`${ix},${iz}`), !door, `ring cell ${ix},${iz}`);
  }
  for (let iz = 1; iz <= 2; iz++) for (const ix of [0, 4]) {
    assert.ok(stones.has(`${ix},${iz}`), `ring cell ${ix},${iz}`);
  }

  // The only light out of the pocket is the door: every splinter that escapes the
  // lattice or reaches metal must cross the door cell on its way out.
  const doorCentre = cellWorld(spec, 2, 3);
  const leaks = [];
  for (const body of diamonds) {
    for (let step = 0; step < HEADINGS.length; step++) {
      const hit = traceOpticRay(bodies, bodies.indexOf(body), HEADINGS[step]);
      if (hit >= 0 && bodies[hit].material !== 'metal') continue;
      leaks.push({ ix: body.ix, iz: body.iz, step, material: hit >= 0 ? bodies[hit].material : 'escape' });
    }
  }
  assert.equal(leaks.length, 2, `expected exactly the door leaks, got ${JSON.stringify(leaks)}`);
  for (const leak of leaks) {
    const miss = distanceToCellRay(spec, doorCentre, leak.ix, leak.iz, HEADINGS[leak.step]);
    assert.ok(miss <= OPTIC_LATTICE_SPACING / 2,
      `leak at ${leak.ix},${leak.iz} heading ${leak.step} bypasses the door by ${miss.toFixed(1)}`);
  }

  // The door axis itself ends on the lone sentry metal outside the ring.
  const doorDiamond = indexOfCell(bodies, 2, 2);
  const sentry = traceOpticRay(bodies, doorDiamond, (3 * Math.PI) / 4);
  assert.ok(sentry >= 0 && bodies[sentry].material === 'metal'
    && bodies[sentry].ix === 2 && bodies[sentry].iz === 4,
    'a bolt out the door must bank on the sentry metal');
});

test('the three stamps are three structurally different arrangements', () => {
  const signature = (id) => {
    const bodies = bodiesFor(id);
    const counts = countMaterials(bodies);
    const diamonds = bodies.filter((b) => b.material === 'diamond');
    const cells = new Set(diamonds.map((b) => `${b.ix},${b.iz}`));

    // Longest straight fuse run (consecutive ix on one row) and largest filled square.
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

  const ceres = signature(CERES_PRISM_GALLERY_ID);
  const sker = signature(SKER_GATEMOUTH_WICK_ID);
  const vesta = signature(VESTA_FREIGHTER_POCKET_ID);

  // Reference layout: fuse into a 3x3 field, mouth open on a three-heading fan.
  // The field's middle row continues the fuse row, so the diamond run is 9 long.
  assert.deepEqual(ceres, { stone: 25, metal: 2, diamond: 15, fuseRun: 9, block: 3, escapes: 3 });
  // Gate-mouth fuse: same six-row spine, no field, one escape up the gate lane.
  assert.deepEqual(sker, { stone: 15, metal: 2, diamond: 6, fuseRun: 6, block: 0, escapes: 1 });
  // Wreck pocket: sealed field, two-deep fuse walls at most, one leak through the door.
  assert.deepEqual(vesta, { stone: 13, metal: 1, diamond: 4, fuseRun: 2, block: 2, escapes: 1 });

  assert.notDeepEqual(sker, ceres);
  assert.notDeepEqual(vesta, ceres);
  assert.notDeepEqual(vesta, sker);
});

test('world.js stamps both new lattices as live colliders in their own sectors', () => {
  const { state, world } = bootWorld(4242);

  for (const id of [SKER_GATEMOUTH_WICK_ID, VESTA_FREIGHTER_POCKET_ID]) {
    const spec = specById(id);
    // The exact lookup world._ensureOpticStructures runs for a sector bag.
    assert.deepEqual(opticStructuresFor(spec.sectorId).map((s) => s.id), [id],
      `${spec.sectorId} must resolve exactly ${id}`);

    world.enterSector(spec.sectorId);
    const expected = compileOpticStructure(spec);
    const live = state.entityList.filter((e) => e.alive && e.data && e.data.opticStructureId === id);
    assert.equal(live.length, expected.length, `${id} live body count`);

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

  // Neither new sector sprouts the Ceres reference layout.
  assert.equal(
    state.entityList.filter((e) => e.data && e.data.opticStructureId === CERES_PRISM_GALLERY_ID).length,
    0,
  );
});
