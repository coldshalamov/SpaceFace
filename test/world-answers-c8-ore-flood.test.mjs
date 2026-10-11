/**
 * §15.6 C8 — mass slam × asteroid: a shattered rock floods the lane with loose ore.
 *
 * environmentMaterials fractures a rock into ore-bearing fragments and emits
 * `environment:fractured`. sectorSim reads the fragments' yield, names the dominant commodity,
 * credits the actor from impulse provenance, emits one `economy:oreFlood` receipt and a negative
 * price-pressure impulse. A big enough rock crosses the kernel's route_surplus band, so the
 * existing surplus_haul_out board template answers — "the board answers". Dust is not a flood.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import { oreTableForAsteroidType, oreTableByWeight } from '../src/data/mining.js';
import { CAUSE_PHRASES } from '../src/data/causePhrases.js';
import {
  sectorSim, sectorSignalFor, ORE_FLOOD_PRESSURE_BASE, ORE_FLOOD_PRESSURE_PER_U, ORE_FLOOD_PRESSURE_MAX, ORE_FLOOD_MIN_U,
} from '../src/systems/sectorSim.js';

const SECTOR = 'sector_ceres_belt';
const ROCK_ID = 500;

function makeCtx(seed, { yieldU = 24, typeId = 'ast_metallic', fragments = 4, actorId = 1, deferFragments = false } = {}) {
  const state = createGameState(seed);
  state.meta.seed = seed;
  state.mode = 'flight';
  state.simTime = 60;
  state.tick = 3600;
  state.playerId = 1;
  state.world.currentSectorId = SECTOR;
  for (const s of SECTORS) state.world.sectors[s.id] = { ...s, owner: s.factionId };
  const player = { id: 1, type: 'ship', alive: true, isPlayer: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: {} };
  // The parent is already dead when the cue fires (environmentMaterials sets alive=false first).
  const rock = {
    id: ROCK_ID, type: 'asteroid', alive: false, pos: { x: 300, z: 40 }, radius: 9,
    data: { typeId, material: 'rock', asteroidSlotId: 'slot_rock_a', yieldU, yieldMaxU: yieldU, yieldRemainingU: 0, pctEjected: 0, fractured: true, destroyed: true },
  };
  const entities = [player, rock];
  if (!deferFragments) {
    for (let i = 0; i < fragments; i++) {
      entities.push({
        id: 600 + i, type: 'asteroid', alive: true, pos: { x: 300 + i, z: 40 }, radius: 5,
        data: { typeId, material: 'rock', isChunk: true, materialFragment: true, fractured: true, asteroidSlotId: `slot_rock_a:shard:${i}`, yieldU: yieldU / fragments },
      });
    }
  }
  // A fragment from some other rock must not be counted.
  entities.push({ id: 700, type: 'asteroid', alive: true, pos: { x: 900, z: 0 }, radius: 4, data: { materialFragment: true, asteroidSlotId: 'slot_rock_b:shard:0', yieldU: 50 } });
  state.entities = new Map(entities.map((e) => [e.id, e]));
  state.entityList = entities;
  if (actorId != null) recordImpulseProvenance(rock, { actorId, tag: 'tether_sling', appliedTick: state.tick - 2 });
  const bus = createBus();
  const floods = [];
  bus.on('economy:oreFlood', (p) => floods.push(p));
  const registry = {
    get(name) {
      if (name === 'factions') return { addOffscreenTension() {}, contestedSectorFor() { return null; } };
      if (name === 'automation') return { offscreenRiskPass() { return 0; } };
      return null;
    },
  };
  sectorSim.init({ state, bus, helpers: {}, registry });
  return { state, bus, floods, rock };
}

const cue = (rock, count = 4) => ({ id: rock.id, pos: { ...rock.pos }, x: rock.pos.x, z: rock.pos.z, radius: rock.radius, material: rock.data.material, count });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

for (const seed of [4242, 8008]) {
  test(`C8: a 24 u metallic rock shattered by the player floods the lane and crosses route_surplus (seed ${seed})`, () => {
    const { state, bus, floods, rock } = makeCtx(seed, { yieldU: 24 });
    bus.emit('environment:fractured', cue(rock));

    assert.equal(floods.length, 1, 'one fracture, one flood receipt');
    const r = floods[0];
    assert.equal(r.schemaVersion, 1);
    assert.equal(r.sectorId, SECTOR);
    assert.equal(r.bodyId, ROCK_ID);
    assert.equal(r.fragments, 4, 'only this rock\'s shards are counted');
    assert.ok(near(r.yieldU, 24), `yield ${r.yieldU}`);
    const expectedCommodity = oreTableByWeight(oreTableForAsteroidType('ast_metallic'))[0].commodityId;
    assert.equal(r.commodityId, expectedCommodity, 'the dominant ore of the rock type is named');
    assert.equal(r.actorId, 1);
    assert.equal(r.byPlayer, true);
    const expectedPressure = -Math.min(ORE_FLOOD_PRESSURE_MAX, ORE_FLOOD_PRESSURE_BASE + 24 * ORE_FLOOD_PRESSURE_PER_U);
    assert.ok(near(r.pricePressure, expectedPressure), `pressure ${r.pricePressure}`);
    assert.ok(r.pricePressure < -0.12, 'a 24 u rock crosses the route_surplus band so the board can post a haul-out');

    const imps = state.sectorSim.impulses.filter((i) => i.kind === 'ore_flood');
    assert.equal(imps.length, 1);
    assert.equal(imps[0].sectorId, SECTOR);
    assert.ok(near(imps[0].pricePressure, expectedPressure));
    assert.ok(!imps[0].danger, 'loose ore is a market event, not a danger event');
  });

  test(`C8: a small rock dips the chart but does not reach the board; dust is not a flood (seed ${seed})`, () => {
    const small = makeCtx(seed, { yieldU: 10 });
    small.bus.emit('environment:fractured', cue(small.rock));
    assert.equal(small.floods.length, 1);
    assert.ok(near(small.floods[0].pricePressure, -(ORE_FLOOD_PRESSURE_BASE + 10 * ORE_FLOOD_PRESSURE_PER_U)));
    assert.ok(small.floods[0].pricePressure > -0.12, 'a 10 u rock stays under the surplus band');

    const dust = makeCtx(seed, { yieldU: ORE_FLOOD_MIN_U - 0.5 });
    dust.bus.emit('environment:fractured', cue(dust.rock));
    assert.equal(dust.floods.length, 0, 'dust is not a flood');
    assert.equal(dust.state.sectorSim.impulses.filter((i) => i.kind === 'ore_flood').length, 0);
  });
}

test('C8: a rich seam saturates at the pressure cap; an NPC-caused flood is not credited to the player', () => {
  const { bus, floods, rock } = makeCtx(4242, { yieldU: 90, actorId: 42 });
  bus.emit('environment:fractured', cue(rock));
  assert.equal(floods.length, 1);
  assert.ok(near(floods[0].pricePressure, -ORE_FLOOD_PRESSURE_MAX), `capped ${floods[0].pricePressure}`);
  assert.equal(floods[0].actorId, 42);
  assert.equal(floods[0].byPlayer, false);
});

test('C8: when fragments are budget-deferred the parent record\'s remaining yield is the flood', () => {
  const { bus, floods, rock } = makeCtx(8008, { yieldU: 18, deferFragments: true, actorId: null });
  bus.emit('environment:fractured', cue(rock, 0));
  assert.equal(floods.length, 1);
  assert.equal(floods[0].fragments, 0);
  assert.ok(near(floods[0].yieldU, 18));
  assert.equal(floods[0].actorId, null, 'no provenance, no credit');
});

test('C8: the chart names the flood — the field dips and the pricePressure driver reads ore_flood', () => {
  const { state, bus, rock } = makeCtx(4242, { yieldU: 30 });
  const before = sectorSignalFor(state, SECTOR);
  bus.emit('environment:fractured', cue(rock));
  sectorSim._advanceModel(0.25, 'test');
  const node = state.sectorSim.field.nodes[SECTOR];
  assert.ok(node.pricePressure < before.pricePressure - 0.05, `loose ore pushes the lane toward surplus (${before.pricePressure} -> ${node.pricePressure})`);
  const signal = sectorSignalFor(state, SECTOR);
  assert.equal(signal.driver.pricePressure, 'ore_flood');
  assert.notEqual(signal.driver.danger, 'ore_flood', 'loose ore does not re-explain danger');
  assert.equal(typeof CAUSE_PHRASES.pricePressure.ore_flood, 'string');
  assert.ok(CAUSE_PHRASES.pricePressure.ore_flood.length > 12);
});

test('C8: a cue for an unknown body in no known sector is ignored', () => {
  const { state, bus, floods } = makeCtx(4242);
  state.world.currentSectorId = 'sector_not_a_place';
  bus.emit('environment:fractured', { id: 999, x: 0, z: 0 });
  assert.equal(floods.length, 0);
  state.world.currentSectorId = SECTOR;
  bus.emit('environment:fractured', null);
  bus.emit('environment:fractured', { x: 0, z: 0 });
  assert.equal(floods.length, 0);
});
