// Mid-game economy heartbeat — the durable field-regrowth clock, its demand-model repricing, and
// the offer-history tiers that keep station boards from serving starter repeats forever.
//
// Proof is fixed-seed numbers and pure state contracts; no captures, no wall time.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import {
  FIELD_REGROWTH_INTERVAL_S,
  FIELD_REGROWTH_MIN_DEPLETION,
  fieldDepletion,
  fieldMemoryReadout,
  fieldRegrowthDue,
  recordFieldExtraction,
  recordFieldRegrowth,
  sectorDepletionPressure,
} from '../src/systems/fieldDepletion.js';
import { effectiveDemandFor } from '../src/economy/demandModel.js';
import { DEMAND_DEPLETION_GATE } from '../src/data/economyDemandProfiles.js';
import { COMMODITIES } from '../src/data/commodities.js';
import {
  OFFER_HISTORY_MIX,
  offerHistoryMultiplier,
  offerHistoryTierFor,
  validateOfferHistoryMix,
} from '../src/data/missions.js';

const HELIOS = 'sector_helios_prime';
const ORE = COMMODITIES.find((c) => c.id === 'cmdty_ore_iron');

function bootWorld(seed = 42) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 4, mass: 12,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.vel = player.vel || { x: 0, z: 0 };
  player.flags = player.flags || { boosting: false, docked: false, invuln: false, noInterp: false };
  const world = Object.assign(Object.create(worldSystem), {});
  world.init({ state, bus, helpers, registry: null });
  return { state, bus, helpers, world };
}

function fieldRocks(state, fieldId) {
  const out = [];
  for (const e of state.entityList || []) {
    if (e && e.alive !== false && e.type === 'asteroid' && e.data && e.data.fieldId === fieldId) out.push(e);
  }
  return out;
}

test('the regrowth clock is durable, deterministic, and gated below the worked band', () => {
  const state = createGameState(77);
  state.simTime = 0;
  for (let i = 0; i < 5; i++) {
    recordFieldExtraction(state, { fieldId: 'f_test', sectorId: HELIOS, yieldU: 32 });
  }
  const rec = state.fieldDepletion.fields.f_test;
  assert.ok(rec.depletion >= FIELD_REGROWTH_MIN_DEPLETION, `depletion ${rec.depletion} crosses the gate`);

  const due = fieldRegrowthDue(state, 'f_test', FIELD_REGROWTH_INTERVAL_S - 1);
  assert.equal(due, null, 'a never-regrown field still waits one interval once the gate is known');
  const first = fieldRegrowthDue(state, 'f_test', FIELD_REGROWTH_INTERVAL_S);
  assert.ok(first);
  assert.equal(first.batches, 0);
  assert.equal(first.band, 'worked');
  assert.ok(first.richnessMult < 1);

  recordFieldRegrowth(state, { fieldId: 'f_test', sectorId: HELIOS, simTime: FIELD_REGROWTH_INTERVAL_S });
  assert.equal(state.fieldDepletion.fields.f_test.regrownBatches, 1);
  assert.equal(fieldRegrowthDue(state, 'f_test', FIELD_REGROWTH_INTERVAL_S * 2 - 1), null,
    'the next seam waits a full interval');
  assert.ok(fieldRegrowthDue(state, 'f_test', FIELD_REGROWTH_INTERVAL_S * 2));

  // Additive save fields survive a serialize/deserialize round trip.
  const sys = { state };
  const data = fieldDepletion.serialize.call(sys);
  assert.equal(data.fields.f_test.regrownBatches, 1);
  const restored = createGameState(77);
  fieldDepletion.deserialize.call({ state: restored }, data);
  assert.equal(restored.fieldDepletion.fields.f_test.regrownBatches, 1);
  assert.equal(restored.fieldDepletion.fields.f_test.lastRegrowT, FIELD_REGROWTH_INTERVAL_S);
});

test('sector depletion pressure weights by extraction and reads the raw-ore premium through demand', () => {
  const state = createGameState(88);
  state.conflicts = {};
  recordFieldExtraction(state, { fieldId: 'f_a', sectorId: HELIOS, yieldU: 32 }); // 0.08
  for (let i = 0; i < 9; i++) recordFieldExtraction(state, { fieldId: 'f_b', sectorId: HELIOS, yieldU: 32 }); // 0.72
  const pressure = sectorDepletionPressure(state, HELIOS);
  assert.equal(pressure.fields, 2);
  assert.ok(pressure.depletion > 0.08 && pressure.depletion < 0.72, 'weighted average, not one field');
  assert.equal(pressure.peak, 0.72);

  const rich = effectiveDemandFor({
    state: createGameState(88), sectorId: HELIOS, commodity: ORE,
  });
  assert.equal(rich.context.depletion, false);
  assert.ok(rich.multiplier >= 1 && rich.multiplier < 1.01);

  const worked = createGameState(88);
  worked.conflicts = {};
  for (let i = 0; i < 10; i++) recordFieldExtraction(worked, { fieldId: 'f_a', sectorId: HELIOS, yieldU: 32 }); // 0.8
  const scarce = effectiveDemandFor({ state: worked, sectorId: HELIOS, commodity: ORE });
  assert.equal(scarce.context.depletion, true);
  assert.ok(scarce.multiplier > 1.05, `raw ore must carry a real scarcity premium, got ${scarce.multiplier}`);
  assert.ok(scarce.drivers.some((d) => d.id === 'depletion-scarcity'));
  const repeat = effectiveDemandFor({ state: worked, sectorId: HELIOS, commodity: ORE });
  assert.deepEqual(repeat, scarce, 'demand projection is deterministic and never compounds');

  // The gate is real: scratch-level depletion prices nothing.
  const scratch = createGameState(88);
  scratch.conflicts = {};
  recordFieldExtraction(scratch, { fieldId: 'f_a', sectorId: HELIOS, yieldU: 32 });
  assert.ok(sectorDepletionPressure(scratch, HELIOS).depletion < DEMAND_DEPLETION_GATE);
  assert.equal(effectiveDemandFor({ state: scratch, sectorId: HELIOS, commodity: ORE }).context.depletion, false);
});

test('offer history tiers shift work away from starter repeats without inventing weight', () => {
  assert.equal(offerHistoryTierFor(0), 'starter');
  assert.equal(offerHistoryTierFor(3), 'working');
  assert.equal(offerHistoryTierFor(10), 'established');
  assert.equal(offerHistoryTierFor(24), 'veteran');
  assert.equal(offerHistoryTierFor(-5), 'starter');

  assert.equal(offerHistoryMultiplier('starter', 'cargo_delivery'), 1);
  assert.ok(offerHistoryMultiplier('veteran', 'cargo_delivery') < 1);
  assert.ok(offerHistoryMultiplier('veteran', 'bounty_hunt') > 1);
  assert.equal(offerHistoryMultiplier('veteran', 'heist_intercept'), 1, 'authored-only types stay law');
  assert.equal(offerHistoryMultiplier('nonsense', 'bounty_hunt'), 1);

  const valid = validateOfferHistoryMix(OFFER_HISTORY_MIX);
  assert.equal(valid.ok, true, valid.errors.join('; '));
  assert.equal(validateOfferHistoryMix({ veteran: { not_a_type: 2 } }).ok, false);
});

test('a worked field reopens real rocks on the slow clock and announces the seam', () => {
  const h = bootWorld(4242);
  try {
    h.world.enterSector(HELIOS, {});
    const field = (h.state.world.activeSector.fields || [])[0];
    assert.ok(field && field.id && field.center, 'Helios materializes at least one authored field');
    for (let i = 0; i < 5; i++) {
      recordFieldExtraction(h.state, { fieldId: field.id, sectorId: HELIOS, yieldU: 32 });
    }
    assert.ok(h.state.fieldDepletion.fields[field.id].depletion >= FIELD_REGROWTH_MIN_DEPLETION);

    h.state.simTime = FIELD_REGROWTH_INTERVAL_S;
    h.state.tick = 300; // the 5 s scan gate
    const events = [];
    h.bus.on('field:regrown', (p) => events.push(p));
    const before = fieldRocks(h.state, field.id).length;
    h.world.update(1 / 60, h.state);
    const after = fieldRocks(h.state, field.id).length;
    assert.ok(after > before, 'the cleared belt gains live rocks');
    assert.equal(events.length, 1, 'one seam announcement per regrowth');
    assert.ok(events[0].rocks >= 3 && events[0].reason === 'slow_clock');
    assert.equal(events[0].fieldId, field.id);
    assert.equal(h.state.fieldDepletion.fields[field.id].regrownBatches, 1);
    const regrown = fieldRocks(h.state, field.id).filter((e) => e.data.regrown === true);
    assert.ok(regrown.length >= events[0].rocks, 'every announced rock is live');
    for (const rock of regrown) {
      assert.ok(rock.data.yieldU >= 1);
      assert.ok(rock.hull > 0 && rock.hull === rock.data.oreHP);
      assert.equal(rock.homeSectorId, HELIOS);
    }

    // Same tick: the clock holds. After a full interval: the next seam.
    h.world.update(1 / 60, h.state);
    assert.equal(h.state.fieldDepletion.fields[field.id].regrownBatches, 1, 'no seam inside the interval');
    h.state.simTime += FIELD_REGROWTH_INTERVAL_S;
    h.state.tick += 300;
    h.world.update(1 / 60, h.state);
    assert.equal(h.state.fieldDepletion.fields[field.id].regrownBatches, 2);
    assert.equal(events.length, 2);
  } finally {
    h.world.destroy && h.world.destroy();
  }
});

test('regrowth placement is identical for identical seed, sector, and field', () => {
  const run = (seed) => {
    const h = bootWorld(seed);
    h.world.enterSector(HELIOS, {});
    const field = (h.state.world.activeSector.fields || [])[0];
    for (let i = 0; i < 5; i++) {
      recordFieldExtraction(h.state, { fieldId: field.id, sectorId: HELIOS, yieldU: 32 });
    }
    h.state.simTime = FIELD_REGROWTH_INTERVAL_S;
    h.state.tick = 300;
    h.world.update(1 / 60, h.state);
    const rocks = fieldRocks(h.state, field.id)
      .map((e) => ({
        x: Math.round(e.pos.x * 1000) / 1000,
        z: Math.round(e.pos.z * 1000) / 1000,
        typeId: e.data.typeId,
        yieldU: e.data.yieldU,
        hp: e.hull,
      }))
      .sort((a, b) => (a.x - b.x) || (a.z - b.z));
    h.world.destroy && h.world.destroy();
    return rocks;
  };
  const a = run(9090);
  const b = run(9090);
  assert.ok(a.length > 0);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, run(9091));
});

test('field memory readout exposes the regrowth memory without changing the band ladder', () => {
  const state = createGameState(55);
  for (let i = 0; i < 5; i++) {
    recordFieldExtraction(state, { fieldId: 'f_read', sectorId: HELIOS, yieldU: 32 });
  }
  recordFieldRegrowth(state, { fieldId: 'f_read', sectorId: HELIOS, simTime: 600 });
  const readout = fieldMemoryReadout(state, 'f_read');
  assert.equal(readout.band, 'worked');
  assert.equal(readout.regrownBatches, 1);
  assert.equal(readout.lastRegrowT, 600);
  assert.equal(readout.label, 'Worked field');
});
