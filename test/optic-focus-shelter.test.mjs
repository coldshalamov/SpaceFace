import test from 'node:test';
import assert from 'node:assert/strict';

import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { core } from '../src/core/coreSystem.js';
import { combat } from '../src/systems/combat.js';
import { world as worldSystem } from '../src/systems/world.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  OPTIC_LATTICE_SPACING,
  OPTIC_MATERIALS,
  OPTIC_SPEND_QUIET,
  opticBookFor,
  opticChildSpec,
  opticFamilyIdOf,
  opticGenerationOf,
  opticSpendLedger,
  settleOpticContact,
  tickOpticRekindle,
} from '../src/combat/opticField.js';
import {
  IO_BOLTHOLE_ID,
  IO_BOLTHOLE_ORIGIN,
  OPTIC_STRUCTURES,
  compileOpticStructure,
  ioBoltholeCells,
} from '../src/data/opticStructures.js';

// "Focus and shelter" (build_map §24): an authored bolthole in the Cruiser Graveyard —
// a diamond skin over a closed stone ring with a one-cell door, capped by a mirror
// sentinel. Hostile bolts land on the shell, not the occupant; the skin's first
// eruption spends every crystal for the rest of the fight (the §24 spent-crystal
// quiet window), and the door is the only line of fire that reaches inside.
// Fixtures run the real projectile sweep + the weapons.js optic settle seam.

const SPEC = OPTIC_STRUCTURES.find((s) => s.id === IO_BOLTHOLE_ID);
const SECTOR_ID = 'sector_io_reach';
const ZONE_ID = 'zone_io_derelict';
const HIDE = { x: -OPTIC_LATTICE_SPACING, z: 0 }; // interior cell (-1,0): deepest off the door lane
const ENEMY_ID = 900;

// ---------------------------------------------------------------------------
// Recipe legality + site binding
// ---------------------------------------------------------------------------

test('the bolthole recipe compiles legal: lattice cells, 45-degree heading, no overlaps', () => {
  assert.ok(SPEC, 'the shelter is registered in OPTIC_STRUCTURES');
  assert.equal(SPEC.sectorId, SECTOR_ID);
  assert.equal(SPEC.zoneId, ZONE_ID);

  const cells = ioBoltholeCells();
  assert.ok(cells.length > 0);
  const keys = new Set();
  for (const cell of cells) {
    assert.ok(Number.isInteger(cell.ix) && Number.isInteger(cell.iz),
      `cell ${cell.ix},${cell.iz} must sit on integer lattice coordinates`);
    assert.ok(OPTIC_MATERIALS[cell.material], `cell ${cell.ix},${cell.iz} has a real material`);
    const key = `${cell.ix},${cell.iz}`;
    assert.ok(!keys.has(key), `duplicate cell ${key}`);
    keys.add(key);
  }

  // Heading is a multiple of 45 degrees so the lattice stays axis/diagonal aligned.
  const step = Math.PI / 4;
  const units = SPEC.heading / step;
  assert.ok(Math.abs(units - Math.round(units)) < 1e-9,
    `heading ${SPEC.heading} must be a multiple of PI/4`);

  const bodies = compileOpticStructure(SPEC);
  assert.equal(bodies.length, cells.length);
  for (const body of bodies) {
    // Heading 0: every body lands exactly on the lattice grid.
    assert.ok(Math.abs(body.x - Math.round(body.x / OPTIC_LATTICE_SPACING) * OPTIC_LATTICE_SPACING) < 1e-6,
      `body ${body.ix},${body.iz} x off the lattice`);
    assert.ok(Math.abs(body.z - Math.round(body.z / OPTIC_LATTICE_SPACING) * OPTIC_LATTICE_SPACING) < 1e-6,
      `body ${body.ix},${body.iz} z off the lattice`);
  }

  // No unexpected overlaps: nothing may sit inside another body, and the only
  // overlapping pair allowed is the authored stone wall seam (adjacent stones whose
  // radii lap to close the ring).
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(d + Math.min(a.radius, b.radius) > Math.max(a.radius, b.radius),
        `body ${a.ix},${a.iz} is contained by ${b.ix},${b.iz}`);
      if (d < a.radius + b.radius) {
        assert.equal(a.material, 'stone', `overlapping pair ${a.ix},${a.iz}/${b.ix},${b.iz} must be a stone seam`);
        assert.equal(b.material, 'stone', `overlapping pair ${a.ix},${a.iz}/${b.ix},${b.iz} must be a stone seam`);
        assert.ok(
          Math.max(Math.abs(a.ix - b.ix), Math.abs(a.iz - b.iz)) === 1,
          'only adjacent stones may lap',
        );
      }
    }
  }

  // The enclosure: a contiguous diamond skin ring, a closed stone ring with exactly
  // one door cell, an empty interior, and one metal sentinel on the door lane.
  const byKey = new Map(cells.map((c) => [`${c.ix},${c.iz}`, c]));
  const diamonds = cells.filter((c) => c.material === 'diamond');
  const stones = cells.filter((c) => c.material === 'stone');
  const metals = cells.filter((c) => c.material === 'metal');
  assert.equal(diamonds.length, 21, 'the diamond skin is the norm-3 ring minus the mouth clearing');
  assert.equal(stones.length, 15, 'the stone ring is the norm-2 ring minus the door');
  assert.deepEqual(metals.map((m) => `${m.ix},${m.iz}`), ['0,-5'], 'one sentinel caps the door lane');
  for (let ix = -1; ix <= 1; ix++) {
    for (let iz = -1; iz <= 1; iz++) {
      assert.ok(!byKey.has(`${ix},${iz}`), `interior ${ix},${iz} must stay empty — that is the hide space`);
    }
  }
  assert.ok(!byKey.has('0,-2'), 'the door cell is open');
  assert.ok(byKey.get('-1,-2').material === 'stone' && byKey.get('1,-2').material === 'stone',
    'the door is a one-cell gap between stone jambs');
  assert.ok(!byKey.has('0,-3') && !byKey.has('1,-3') && !byKey.has('-1,-3'),
    'the mouth clearing opens the skin over the door');
  // The skin must be one connected fuse so a single hit burns the whole shell.
  const adj = new Set(diamonds.map((d) => `${d.ix},${d.iz}`));
  const seen = new Set([`${diamonds[0].ix},${diamonds[0].iz}`]);
  const queue = [diamonds[0]];
  while (queue.length) {
    const cur = queue.pop();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const key = `${cur.ix + dx},${cur.iz + dz}`;
        if (adj.has(key) && !seen.has(key)) {
          seen.add(key);
          queue.push(diamonds.find((d) => `${d.ix},${d.iz}` === key));
        }
      }
    }
  }
  assert.equal(seen.size, diamonds.length, 'the diamond skin is contiguous — one shot lights it all');
});

test('the bolthole binds to a real hostile fight zone in a real sector — not Ceres', () => {
  assert.notEqual(SPEC.sectorId, 'sector_ceres_belt', 'the shelter must not sit in the tutorial belt');
  const sector = SECTORS.find((s) => s.id === SPEC.sectorId);
  assert.ok(sector, 'sector id must exist in SECTORS');
  const zone = zonesForSector(SPEC.sectorId).find((z) => z.id === SPEC.zoneId);
  assert.ok(zone, 'zone id must exist in sectorZones');
  assert.equal(zone.type, 'derelict_field');
  assert.ok(zone.presence && zone.presence.hostile === true,
    'the zone must field hostiles — this is a fight the player survives inside the box');
  const dist = Math.hypot(SPEC.origin.x - zone.center.x, SPEC.origin.z - zone.center.z);
  assert.ok(dist + 320 < zone.radius,
    `origin must sit inside the zone with the structure's reach (dist ${dist.toFixed(1)}, radius ${zone.radius})`);
  assert.deepEqual(SPEC.origin, IO_BOLTHOLE_ORIGIN);
});

// ---------------------------------------------------------------------------
// Real-stamp + real-sweep fixtures
// ---------------------------------------------------------------------------

function bootWorld(seed = 42) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  return { state, world, bus };
}

test('world.js stamps the bolthole into the Cruiser Graveyard on sector entry', () => {
  const { state, world } = bootWorld(42);
  world.enterSector(SECTOR_ID);
  const stamped = state.entityList.filter(
    (e) => e.alive && e.data && e.data.opticStructureId === IO_BOLTHOLE_ID,
  );
  const bodies = compileOpticStructure(SPEC);
  assert.equal(stamped.length, bodies.length, 'every recipe cell becomes a live body');
  const sectorOrigin = sectorGlobalOrigin(SECTOR_ID);
  const byCell = new Map(stamped.map((e) => [e.data.opticCell, e]));
  for (const body of bodies) {
    const ent = byCell.get(`${body.ix},${body.iz}`);
    assert.ok(ent, `cell ${body.ix},${body.iz} must be stamped`);
    const ex = sectorOrigin.x + SPEC.origin.x + body.x;
    const ez = sectorOrigin.z + SPEC.origin.z + body.z;
    assert.ok(Math.hypot(ent.pos.x - ex, ent.pos.z - ez) < 1e-6,
      `cell ${body.ix},${body.iz} must land on the authored site`);
    assert.equal(ent.data.homeSectorId, SECTOR_ID);
    assert.equal(ent.data.opticMaterial, body.material);
    assert.equal(ent.collides, true);
  }
});

// ---------------------------------------------------------------------------
// Physics fixtures — mirror the friendly-fire harness, now with the spend ctx
// ---------------------------------------------------------------------------

function sweepHost(state, bus) {
  const host = Object.create(physics);
  host.init({ state, bus, helpers: {} });
  return host;
}

function bolt(id, x, z, vx, vz = 0, ownerId = ENEMY_ID) {
  return makeEntity({
    id,
    type: 'projectile',
    pos: { x, z },
    vel: { x: vx, z: vz },
    radius: 0.7,
    collides: true,
    ownerId,
    team: 1,
    data: {
      damage: 8,
      damageType: 'energy',
      kind: 'bullet',
      weaponId: 'wpn_pulse_laser_s',
      spawnPos: { x, z },
      maxDistance: 4000,
    },
  });
}

function opticRock(id, body) {
  return makeEntity({
    id,
    type: 'asteroid',
    pos: { x: body.x, z: body.z },
    radius: body.radius,
    collides: true,
    data: {
      opticMaterial: body.material,
      typeId: body.typeId,
      tint: body.tint,
      opticStructureId: IO_BOLTHOLE_ID,
      opticCell: `${body.ix},${body.iz}`,
      homeSectorId: SECTOR_ID,
    },
  });
}

function suppressHitPayload(payload) {
  payload.damage = 0;
  payload.damagePacket = null;
  payload.packet = null;
  payload.statuses = [];
  payload.heat = 0;
  payload.impulse = null;
}

// Mirrors handleOpticProjectileHit in weapons.js, including the spend bookkeeping ctx.
function wireOpticGrammar(state, bus) {
  const families = new Map();
  const contacts = [];
  const hits = [];
  let nextId = 5000;
  bus.on('projectile:hit', (payload) => {
    hits.push(payload);
    const projectile = state.entities.get(payload.projectileId);
    const target = state.entities.get(payload.targetId);
    if (!projectile || projectile.type !== 'projectile' || !target) return;
    const book = opticBookFor(families, opticFamilyIdOf(projectile));
    const plan = settleOpticContact(projectile, target, payload, book, {
      simTime: Number.isFinite(state.simTime) ? state.simTime : 0,
      ledger: opticSpendLedger(state),
      emit: (name, event) => bus.emit(name, event),
    });
    if (!plan) return;
    contacts.push({ plan, projectileId: payload.projectileId, targetId: payload.targetId });
    suppressHitPayload(payload);
    if (plan.kind !== 'prism') return;
    for (const ray of plan.rays) {
      const child = makeEntity({ ...opticChildSpec(projectile, ray), id: nextId++ });
      state.entityList.push(child);
      state.entities.set(child.id, child);
    }
  });
  return { families, contacts, hits };
}

function makeState(seed) {
  return {
    tick: 0,
    simTime: 0,
    meta: { seed },
    playerId: 1,
    entityList: [],
    entities: new Map(),
    world: {},
  };
}

function addEntity(state, entity) {
  state.entityList.push(entity);
  state.entities.set(entity.id, entity);
  return entity;
}

function addPlayer(state, x, z) {
  return addEntity(state, makeEntity({
    id: 1,
    type: 'ship',
    pos: { x, z },
    radius: 4,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
  }));
}

function runTicks(host, state, ticks) {
  for (let i = 0; i < ticks; i++) {
    for (const e of state.entityList) {
      if (e.type !== 'projectile' || e.alive === false) continue;
      e.prevPos.x = e.pos.x;
      e.prevPos.z = e.pos.z;
      e.pos.x += (Number(e.vel && e.vel.x) || 0) / 60;
      e.pos.z += (Number(e.vel && e.vel.z) || 0) / 60;
    }
    state.tick += 1;
    state.simTime = state.tick / 60;
    host.sweepProjectiles(1 / 60, state);
  }
}

function buildShelter(state) {
  const bodies = compileOpticStructure(SPEC);
  const rocks = bodies.map((body, i) => addEntity(state, opticRock(100 + i, body)));
  const byCell = new Map(bodies.map((body, i) => [`${body.ix},${body.iz}`, rocks[i]]));
  return { bodies, rocks, byCell };
}

// ---------------------------------------------------------------------------
// The shelter behaves
// ---------------------------------------------------------------------------

test('a hostile bolt aimed at the player inside lands on the shell, never the hull', () => {
  const state = makeState(4242);
  const bus = createBus();
  const grammar = wireOpticGrammar(state, bus);
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const host = sweepHost(state, bus);
  const { byCell } = buildShelter(state);
  const player = addPlayer(state, HIDE.x, HIDE.z);

  // Four hostile bolts, each aimed at the hide point from a different approach.
  // Whatever line of fire the fight picks, the first thing the bolt meets is the
  // box — diamond skin or stone liner — never the ship.
  const lanes = [
    { x: 500, z: HIDE.z, vx: -300, vz: 0, first: '3,0' },      // east face
    { x: -500, z: HIDE.z, vx: 300, vz: 0, first: '-3,0' },     // west face
    { x: HIDE.x, z: 500, vx: 0, vz: -300, first: '-1,3' },     // south apron diamond
    { x: HIDE.x, z: -500, vx: 0, vz: 300, first: '-1,-2' },    // north liner, off the door lane
  ];
  lanes.forEach((lane, i) => {
    const before = grammar.hits.length;
    addEntity(state, bolt(200 + i, lane.x, lane.z, lane.vx, lane.vz));
    runTicks(host, state, 160);
    const fresh = grammar.hits.slice(before);
    assert.ok(fresh.length > 0, `lane ${i}: the bolt must meet something`);
    const firstHit = fresh.find((h) => state.entities.get(h.projectileId)
      && opticGenerationOf(state.entities.get(h.projectileId)) === 0);
    assert.ok(firstHit, `lane ${i}: the parent bolt must record a first contact`);
    const firstEnt = state.entities.get(firstHit.targetId);
    assert.equal(`${firstEnt.data.opticCell}`, lane.first,
      `lane ${i}: expected the bolt to land on cell ${lane.first}, got ${firstEnt.data && firstEnt.data.opticCell}`);
    assert.equal(firstHit.targetId, byCell.get(lane.first).id);
    assert.ok(firstEnt.data.opticMaterial !== undefined, 'the first contact is a shell body');
  });
  assert.equal(grammar.hits.filter((h) => h.targetId === player.id).length, 0,
    'no bolt or splinter may touch the occupant');
  assert.equal(player.hull, player.hullMax, 'the player inside the box is untouched');
});

test('the door is the only leak — a bolt threaded through it dies on the inner wall', () => {
  const state = makeState(4242);
  const bus = createBus();
  const grammar = wireOpticGrammar(state, bus);
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const host = sweepHost(state, bus);
  const { byCell } = buildShelter(state);
  const player = addPlayer(state, HIDE.x, HIDE.z);

  // The one-cell door at (0,-2) with the mouth clearing above it leaves a firing
  // lane roughly between the sentinel rim and the stone jambs. x=+24 threads it.
  const leak = addEntity(state, bolt(300, 24, -500, 0, 300));
  runTicks(host, state, 180);
  const leakHit = grammar.hits.find((h) => h.projectileId === leak.id);
  assert.ok(leakHit, 'the threaded bolt must land somewhere');
  assert.equal(leakHit.targetId, byCell.get('0,2').id,
    'the leak bolt crosses the interior and dies on the back wall — through the door, not through stone');

  // Dead-center down the lane the sentinel answers instead: the shot is banked back.
  const axis = addEntity(state, bolt(301, 0, -500, 0, 300));
  runTicks(host, state, 60);
  const axisHit = grammar.contacts.find((c) => c.projectileId === axis.id);
  assert.ok(axisHit, 'the axis bolt must meet the sentinel');
  assert.equal(axisHit.plan.kind, 'reflect', 'the sentinel reflects the dead-center shot');
  assert.equal(axisHit.targetId, byCell.get('0,-5').id);
  assert.ok(axis.vel.z < 0, 'the bounced shot heads back at the shooter');
  assert.equal(grammar.hits.filter((h) => h.targetId === player.id).length, 0);
  assert.equal(player.hull, player.hullMax);
});

test('the mirror lane banks grazing shots into the shell — several lines arrive at one diamond', () => {
  const state = makeState(4242);
  const bus = createBus();
  const grammar = wireOpticGrammar(state, bus);
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const host = sweepHost(state, bus);
  const { byCell } = buildShelter(state);
  addPlayer(state, HIDE.x, HIDE.z);

  // Shots grazing the sentinel's rim bank inward and land on the horn diamonds —
  // the east rim feeds the east horn, the west rim the west horn.
  const grazingEast = addEntity(state, bolt(400, 15, -500, 0, 300));
  const grazingWest = addEntity(state, bolt(401, -15, -500, 0, 300));
  runTicks(host, state, 240);

  for (const [shot, horn] of [[grazingEast, '3,-3'], [grazingWest, '-3,-3']]) {
    const bounce = grammar.contacts.find((c) => c.projectileId === shot.id && c.plan.kind === 'reflect');
    assert.ok(bounce, 'the grazing shot must bank off the sentinel');
    assert.equal(bounce.targetId, byCell.get('0,-5').id);
    const arrival = grammar.contacts.find((c) => c.projectileId === shot.id && c.plan.kind === 'prism');
    assert.ok(arrival, 'the banked shot must arrive at a diamond, not fly free');
    assert.equal(arrival.targetId, byCell.get(horn).id,
      `the lane delivers the shot into horn ${horn}`);
  }
});

test('one fight: the eruption spends the skin, then the field goes dark for the duration', () => {
  const state = makeState(4242);
  const bus = createBus();
  const grammar = wireOpticGrammar(state, bus);
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const host = sweepHost(state, bus);
  const { rocks, byCell } = buildShelter(state);
  const player = addPlayer(state, HIDE.x, HIDE.z);
  const shell = rocks.filter((r) => r.data.opticMaterial === 'diamond');
  assert.equal(shell.length, 21);

  // The bolt that starts it: into the east face diamond.
  addEntity(state, bolt(500, 500, 0, -300, 0));
  runTicks(host, state, 400);

  // The fuse burned the contiguous skin — the family cap leaves at most one cell lit.
  const stillLit = shell.filter((r) => r.data.opticMaterial === 'diamond');
  const spent = shell.filter((r) => r.data.opticMaterial === 'spent');
  assert.ok(spent.length >= 20, `the eruption must burn the skin (${spent.length}/21 spent)`);
  assert.ok(stillLit.length <= 1, 'at most one cell survives the first family');

  // Splinters never tunnel to the occupant — not during the whole eruption.
  assert.equal(grammar.hits.filter((h) => h.targetId === player.id).length, 0,
    'the full eruption must not put one splinter on the occupant');
  assert.equal(player.hull, player.hullMax);
  const inwardDied = grammar.contacts.filter(
    (c) => c.plan.kind === 'absorb' && c.plan.reason === 'stone'
      && c.targetId !== byCell.get('0,-5').id,
  );
  assert.ok(inwardDied.length > 0, 'the stone liner must eat the inward splinters');

  // Second volley finishes the skin — the survivor cell spends on a fresh family.
  // Approach on its outward normal so the bolt meets that cell first, not the
  // dark wall in front of it.
  for (const last of stillLit) {
    const out = Math.hypot(last.pos.x, last.pos.z) || 1;
    const nx = last.pos.x / out;
    const nz = last.pos.z / out;
    addEntity(state, bolt(501, last.pos.x + nx * 500, last.pos.z + nz * 500, -nx * 300, -nz * 300));
    runTicks(host, state, 200);
  }
  assert.equal(
    shell.filter((r) => r.data.opticMaterial === 'diamond').length, 0,
    'the second volley spends the last lit cell',
  );
  const ledger = state.world.opticSpent[IO_BOLTHOLE_ID];
  assert.ok(ledger, 'the durable ledger records the burn');
  assert.equal(Object.keys(ledger).length, 21, 'every shell cell holds a spend stamp');

  // Now the field is spent: a fresh bolt on a dark cell dies like a stone hit —
  // absorbed, zero splinters spawned, and the quiet clock restarts.
  const dark = byCell.get('3,0');
  assert.equal(dark.data.opticMaterial, 'spent');
  const spawnCount = state.entityList.filter((e) => e.type === 'projectile').length;
  const bolt3 = addEntity(state, bolt(502, dark.pos.x + 400, dark.pos.z, -300, 0));
  runTicks(host, state, 120);
  const third = grammar.contacts.filter((c) => c.projectileId === bolt3.id);
  assert.equal(third.length, 1, 'the bolt on the dark shell resolves exactly once');
  assert.equal(third[0].plan.kind, 'absorb');
  assert.equal(third[0].plan.reason, 'spent');
  assert.equal(
    state.entityList.filter((e) => e.type === 'projectile').length,
    spawnCount + 1,
    'a spent cell throws no ring — the shelter is just a dark box now',
  );
  assert.equal(player.hull, player.hullMax, 'the occupant survived the whole fight inside');

  // After the quiet window the crystals heal — the box re-arms for the next visit,
  // long after this fight is over.
  const emitLog = [];
  const healed = tickOpticRekindle(
    shell, state.simTime + OPTIC_SPEND_QUIET + 1,
    state.world.opticSpent, (name, payload) => emitLog.push({ name, payload }),
  );
  assert.equal(healed.length, 21, 'the quiet window rekindles the whole skin');
  assert.equal(emitLog.length, 21);
  assert.ok(shell.every((r) => r.data.opticMaterial === 'diamond'), 'the skin is live again');
});
