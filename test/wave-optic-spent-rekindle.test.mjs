import test from 'node:test';
import assert from 'node:assert/strict';

import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import {
  OPTIC_MATERIALS,
  OPTIC_SPEND_QUIET,
  collectOpticSpentIds,
  normalizeOpticSpendLedger,
  opticBookFor,
  opticMaterialOf,
  opticSpendLedger,
  recordOpticSpend,
  settleOpticContact,
  tickOpticRekindle,
} from '../src/combat/opticField.js';
import {
  CERES_PRISM_GALLERY_ID,
  compileCeresPrismGallery,
} from '../src/data/opticStructures.js';

// build_map §24 "Spent crystals": a diamond that throws its ring goes dark and eats bolts
// until it has been quiet for OPTIC_SPEND_QUIET sim-seconds; then the same cell is live
// crystal again. The dark state is durable — it rides the world save as a per-cell sim-time
// stamp, so a mid-cooldown load restores the dark and a long-closed load restores the live.

function bootWorld(seed = 42) {
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
  return { state, world, bus };
}

function diamond(id, x = 0, z = 0, extra = {}) {
  return makeEntity({
    id,
    type: 'asteroid',
    pos: { x, z },
    radius: 13,
    collides: true,
    data: { opticMaterial: 'diamond', typeId: 'ast_crystalline', tint: OPTIC_MATERIALS.diamond.tint, ...extra },
  });
}

function bolt(id, x = -40, z = 0, vx = 300) {
  return makeEntity({
    id,
    type: 'projectile',
    pos: { x, z },
    vel: { x: vx, z: 0 },
    radius: 0.7,
    collides: true,
    ownerId: 1,
    team: 0,
    data: {
      damage: 8,
      damageType: 'energy',
      kind: 'bullet',
      weaponId: 'wpn_pulse_laser_s',
      spawnPos: { x, z },
      maxDistance: 800,
    },
  });
}

const HIT = { pos: { x: -13, z: 0 }, normal: { x: -1, z: 0 } };

test('a diamond that throws its ring is spent: it eats the next shot and stays dark', () => {
  const state = { simTime: 0, world: {} };
  const ledger = opticSpendLedger(state);
  const target = diamond(7, 0, 0, {
    opticStructureId: 'optic_test', opticCell: '0,0', homeSectorId: 'sector_ceres_belt',
  });

  const first = settleOpticContact(bolt(8), target, HIT, opticBookFor(new Map(), 'f1'), {
    simTime: 10,
    ledger,
  });
  assert.equal(first.kind, 'prism');
  assert.equal(first.spentAt, 10);
  assert.equal(opticMaterialOf(target).id, 'spent');
  assert.equal(target.data.opticMaterial, 'spent');
  assert.equal(target.data.opticSpentAt, 10);
  assert.equal(target.data.tint, OPTIC_MATERIALS.spent.tint, 'the dark cell reads dark');
  assert.equal(ledger.optic_test['0,0'], 10, 'the durable ledger holds the spend stamp');

  // A later bolt (a different family) dies in the dark crystal like a stone hit.
  const second = settleOpticContact(bolt(9), target, HIT, opticBookFor(new Map(), 'f2'), {
    simTime: 40,
    ledger,
  });
  assert.equal(second.kind, 'absorb');
  assert.equal(second.reason, 'spent');
});

test('a spent prism rekindles after the quiet window and splits again', () => {
  const state = { simTime: 0, world: {} };
  const ledger = opticSpendLedger(state);
  const target = diamond(7, 0, 0, {
    opticStructureId: 'optic_test', opticCell: '0,0', homeSectorId: 'sector_ceres_belt',
  });
  const events = [];
  const emit = (name, payload) => events.push({ name, payload });

  settleOpticContact(bolt(8), target, HIT, opticBookFor(new Map(), 'f1'), { simTime: 0, ledger });
  assert.equal(target.data.opticMaterial, 'spent');

  // Still inside the window: nothing heals.
  const early = tickOpticRekindle([target], OPTIC_SPEND_QUIET - 1, ledger, emit);
  assert.equal(early.length, 0);
  assert.equal(target.data.opticMaterial, 'spent');
  assert.equal(events.length, 0);

  // Past the window with no contact: the same cell is live crystal again.
  const healed = tickOpticRekindle([target], OPTIC_SPEND_QUIET + 1, ledger, emit);
  assert.equal(healed.length, 1);
  assert.deepEqual(events.map((e) => e.name), ['optic:rekindled']);
  assert.equal(events[0].payload.targetId, 7);
  assert.equal(events[0].payload.materialId, 'diamond');
  assert.equal(target.data.opticMaterial, 'diamond');
  assert.equal(target.data.tint, OPTIC_MATERIALS.diamond.tint);
  assert.equal(target.data.opticSpentAt, undefined);
  assert.deepEqual(ledger, {}, 'the healed cell leaves the durable ledger');

  // And it answers the next bolt with the ring again.
  const again = settleOpticContact(bolt(9), target, HIT, opticBookFor(new Map(), 'f2'), {
    simTime: OPTIC_SPEND_QUIET + 2,
    ledger,
  });
  assert.equal(again.kind, 'prism');
  assert.equal(again.rays.length, 8);
});

test('a fresh hit on a dark crystal is a re-discharge — the quiet clock restarts', () => {
  const state = { simTime: 0, world: {} };
  const ledger = opticSpendLedger(state);
  const target = diamond(7, 0, 0, {
    opticStructureId: 'optic_test', opticCell: '0,0', homeSectorId: 'sector_ceres_belt',
  });

  settleOpticContact(bolt(8), target, HIT, opticBookFor(new Map(), 'f1'), { simTime: 0, ledger });
  assert.equal(target.data.opticSpentAt, 0);

  // The same cell eats a second energy bolt late inside the window — that hit is a spend,
  // so the crystal has to stay quiet for a full window *from that hit*.
  const second = settleOpticContact(bolt(9), target, HIT, opticBookFor(new Map(), 'f2'), {
    simTime: OPTIC_SPEND_QUIET - 30,
    ledger,
  });
  assert.equal(second.kind, 'absorb');
  assert.equal(second.reason, 'spent');
  assert.equal(target.data.opticSpentAt, OPTIC_SPEND_QUIET - 30, 'the absorb refreshed the clock');
  assert.equal(ledger.optic_test['0,0'], OPTIC_SPEND_QUIET - 30);

  // OPTIC_SPEND_QUIET after the FIRST spend is not enough — the second spend owns the clock.
  const stillDark = tickOpticRekindle([target], OPTIC_SPEND_QUIET + 29, ledger, null);
  assert.equal(stillDark.length, 0);
  assert.equal(target.data.opticMaterial, 'spent');

  const healed = tickOpticRekindle([target], 2 * OPTIC_SPEND_QUIET - 29, ledger, null);
  assert.equal(healed.length, 1);
  assert.equal(target.data.opticMaterial, 'diamond');
});

test('a contact past the window rekindles lazily — the bolt meets live crystal', () => {
  const state = { simTime: 0, world: {} };
  const ledger = opticSpendLedger(state);
  const target = diamond(7, 0, 0, {
    opticStructureId: 'optic_test', opticCell: '0,0', homeSectorId: 'sector_ceres_belt',
  });
  const events = [];
  const emit = (name, payload) => events.push({ name, payload });

  settleOpticContact(bolt(8), target, HIT, opticBookFor(new Map(), 'f1'), { simTime: 0, ledger });
  // No tick ran — the crystal healed on the away-clock and the next bolt finds it live.
  const plan = settleOpticContact(bolt(9), target, HIT, opticBookFor(new Map(), 'f2'), {
    simTime: OPTIC_SPEND_QUIET + 5,
    ledger,
    emit,
  });
  assert.equal(plan.kind, 'prism');
  assert.deepEqual(events.map((e) => e.name), ['optic:rekindled']);
  assert.equal(target.data.opticMaterial, 'spent', 'the rekindled prism spent itself again');
  assert.equal(target.data.opticSpentAt, OPTIC_SPEND_QUIET + 5);
});

test('the quiet window rides the world save — dark mid-cooldown, healed while closed', () => {
  const { state, world } = bootWorld(42);
  world.enterSector('sector_ceres_belt');
  const gallery = state.entityList.filter(
    (e) => e.alive && e.data && e.data.opticStructureId === CERES_PRISM_GALLERY_ID,
  );
  assert.ok(gallery.length > 0, 'gallery live');
  const byCell = new Map(gallery.map((e) => [e.data.opticCell, e]));
  const burned = byCell.get('6,0'); // first murder-field cell
  const untouched = byCell.get('7,0');
  assert.equal(burned.data.opticMaterial, 'diamond');
  assert.equal(untouched.data.opticMaterial, 'diamond');

  // Burn one cell at simTime 5 through the real settle path; leave the neighbor live.
  state.simTime = 5;
  const ledger = opticSpendLedger(state);
  const plan = settleOpticContact(bolt(900, burned.pos.x - 40, burned.pos.z), burned, {
    pos: { x: burned.pos.x - burned.radius, z: burned.pos.z },
    normal: { x: -1, z: 0 },
  }, opticBookFor(new Map(), 'save-family'), { simTime: state.simTime, ledger });
  assert.equal(plan.kind, 'prism');
  assert.equal(burned.data.opticMaterial, 'spent');

  const saved = JSON.parse(JSON.stringify(world.serialize()));
  assert.equal(saved.opticSpent[CERES_PRISM_GALLERY_ID]['6,0'], 5, 'the save carries the stamp');

  // Load mid-quiet: the same cell comes back dark with its original stamp, neighbor live.
  const mid = bootWorld(43);
  mid.state.simTime = 20; // saveSystem restores the saved clock before enterSector
  mid.world.deserialize(saved);
  mid.world.enterSector('sector_ceres_belt');
  const midCells = new Map(
    mid.state.entityList
      .filter((e) => e.alive && e.data && e.data.opticStructureId === CERES_PRISM_GALLERY_ID)
      .map((e) => [e.data.opticCell, e]),
  );
  assert.equal(midCells.get('6,0').data.opticMaterial, 'spent', 'mid-cooldown cell stays dark');
  assert.equal(midCells.get('6,0').data.opticSpentAt, 5, 'the timer kept its absolute stamp');
  assert.equal(midCells.get('6,0').data.tint, OPTIC_MATERIALS.spent.tint);
  assert.equal(midCells.get('7,0').data.opticMaterial, 'diamond', 'untouched cells load live');
  assert.equal(midCells.get('7,0').data.opticSpentAt, undefined);
  // The restored dark cell is discoverable for the rekindle watch.
  assert.ok(collectOpticSpentIds(mid.state).has(midCells.get('6,0').id));

  // Load after the window: the field healed while the game was closed — live, no entry left.
  const late = bootWorld(44);
  late.state.simTime = 5 + OPTIC_SPEND_QUIET + 30;
  late.world.deserialize(saved);
  late.world.enterSector('sector_ceres_belt');
  const lateCells = new Map(
    late.state.entityList
      .filter((e) => e.alive && e.data && e.data.opticStructureId === CERES_PRISM_GALLERY_ID)
      .map((e) => [e.data.opticCell, e]),
  );
  assert.equal(lateCells.get('6,0').data.opticMaterial, 'diamond', 'healed-while-away loads live');
  assert.equal(lateCells.get('6,0').data.opticSpentAt, undefined);
  assert.equal(collectOpticSpentIds(late.state).size, 0, 'nothing left for the watch');
  assert.deepEqual(late.state.world.opticSpent[CERES_PRISM_GALLERY_ID] || {}, {},
    'the stale ledger entry was dropped at materialize');
});

test('recordOpticSpend ignores non-diamond optics and normalize drops junk', () => {
  const stone = makeEntity({
    id: 5, type: 'asteroid', pos: { x: 0, z: 0 }, radius: 34, collides: true,
    data: { opticMaterial: 'stone' },
  });
  assert.equal(recordOpticSpend(stone, 10, {}), null);
  assert.equal(stone.data.opticMaterial, 'stone');
  assert.equal(recordOpticSpend(makeEntity({ id: 6, type: 'asteroid', pos: { x: 0, z: 0 }, data: {} }), 10, {}), null);

  const clean = normalizeOpticSpendLedger({
    [CERES_PRISM_GALLERY_ID]: { '6,0': 5, bad: 'x', worse: NaN },
    empty: {},
    junk: 7,
  });
  assert.deepEqual(clean, { [CERES_PRISM_GALLERY_ID]: { '6,0': 5 } });
  assert.deepEqual(normalizeOpticSpendLedger(null), {});
});
