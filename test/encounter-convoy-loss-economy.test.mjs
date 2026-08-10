// PQ-047 — scripted convoy loss becomes bounded market scarcity through owner events.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { stableLossIntentId } from '../src/economy/freightCausality.js';
import { economy } from '../src/systems/economy.js';
import { encounterDirector, planEncounterShape } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const SECTOR_ID = 'sector_tethys_junction';
const STATION_ID = 'st_tethys_hub';
const LANE_POS = Object.freeze({ x: 500, z: 1500 });
const STATION_POS = Object.freeze({ x: 1050, z: 380 });

function boot(seed) {
  // Relevant systems are registered in their production relative order: economy owns stock,
  // spawnBudget owns admission, and the director emits the consequence intent.
  const sim = createSimulation({ seed, systems: [economy, spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.world.activeSector = {
    stations: [{ id: STATION_ID, pos: { ...STATION_POS }, name: 'Meridian Exchange' }],
  };
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { ...LANE_POS },
    vel: { x: 0, z: 0 },
    hull: 200,
    hullMax: 200,
    radius: 6,
  });
  state.playerId = player.id;

  const log = { pressure: [], losses: [], news: [], resolved: [], receipts: [] };
  bus.on('economy:applyTradePressure', (payload) => log.pressure.push(payload));
  bus.on('freight:loss', (payload) => log.losses.push(payload));
  bus.on('news:headline', (payload) => log.news.push(payload));
  bus.on('encounter:resolved', (payload) => log.resolved.push(payload));
  bus.on('encounter:receipt', (payload) => log.receipts.push(payload));
  bus.emit('sector:enter', { sectorId: SECTOR_ID });
  return {
    sim,
    state,
    bus,
    player,
    log,
    economy: sim.registry.get('economy'),
    director: sim.registry.get('encounterDirector'),
  };
}

function fireConvoy(harness) {
  const { state, director } = harness;
  const shape = ENCOUNTERS.convoy_departure;
  const zone = zonesForSector(SECTOR_ID).find((candidate) => shape.zoneTypes.includes(candidate.type));
  assert.ok(zone, 'Tethys exposes a convoy-compatible route zone');
  const item = planEncounterShape(
    shape,
    zone,
    SECTOR_ID,
    0,
    50,
    mulberry32(hash32(state.meta.seed, shape.id, 'pq047-force')),
  );
  state.encounterDirector.pressure[shape.deck] = 140;
  director._fire(state.encounterDirector, state, item, shape, state.simTime || 0);
  const live = state.encounterDirector.live[item.encounterId];
  assert.ok(live, 'convoy materializes on the production director path');
  return live;
}

function killEntity(harness, id, killerId) {
  const entity = harness.state.entities.get(id);
  assert.ok(entity && entity.alive !== false);
  harness.bus.emit('entity:killed', {
    id,
    killerId,
    sectorId: SECTOR_ID,
    pos: { x: entity.pos.x, z: entity.pos.z },
  });
  entity.alive = false;
}

function killHaulers(harness, live, killerId) {
  const ids = live.ids.filter((id) => live.roles[id] === 'hauler');
  assert.ok(ids.length > 0, 'convoy carries at least one live hauler');
  for (const id of ids) killEntity(harness, id, killerId);
}

function tickDirector(harness, seconds = 2) {
  harness.sim.runTicks(Math.ceil(seconds * 60));
}

function assertOneBoundedLoss(harness, live, outcome) {
  const { log } = harness;
  assert.equal(log.losses.length, 1, `${outcome} emits one freight loss intent`);
  assert.equal(log.news.length, 1, `${outcome} emits one market headline intent`);
  assert.equal(log.pressure.length, 1, `${outcome} applies destination pressure exactly once`);

  const [intent] = log.losses;
  const [pressure] = log.pressure;
  assert.equal(intent.encounterId, live.id);
  assert.equal(intent.cause, 'freight_loss');
  assert.equal(intent.stationId, STATION_ID);
  assert.equal(intent.manifestId, live.data.freightManifest.manifestId);
  assert.equal(intent.totalQty, live.data.initialCargoUnits, 'loss intent retains the pre-destruction cargo quantity');
  assert.equal(pressure.intentId, intent.intentId);
  assert.equal(pressure.encounterId, live.id);
  assert.equal(pressure.stationId, STATION_ID);
  assert.equal(pressure.good, live.data.cargoId);
  assert.equal(pressure.cause, 'freight_loss');
  assert.ok(pressure.vol < 0 && pressure.vol >= -12, `scarcity pressure is negative and bounded (got ${pressure.vol})`);
  assert.equal(log.news[0].intentId, intent.intentId);
  assert.equal(log.news[0].kind, 'freight_loss');
  assert.ok(log.resolved.some((entry) => entry.encounterId === live.id && entry.outcome === outcome));
}

test('player robbery applies one bounded negative destination pressure from the retained manifest', () => {
  const harness = boot(4201);
  const live = fireConvoy(harness);
  const market = harness.economy.ensureMarket(STATION_ID);
  const stockBefore = market[live.data.cargoId].stock;
  killHaulers(harness, live, harness.player.id);
  tickDirector(harness);
  assertOneBoundedLoss(harness, live, 'robbed');
  assert.equal(
    market[live.data.cargoId].stock,
    Math.max(1, stockBefore + harness.log.pressure[0].vol),
    'the registered economy owner consumes the negative intent and drains stock',
  );

  const counts = {
    pressure: harness.log.pressure.length,
    losses: harness.log.losses.length,
    news: harness.log.news.length,
  };
  tickDirector(harness, 5);
  assert.deepEqual(
    { pressure: harness.log.pressure.length, losses: harness.log.losses.length, news: harness.log.news.length },
    counts,
    'later terminal ticks cannot repeat the consequence',
  );
  assert.equal(harness.director.freightLoss(live), false, 'direct duplicate terminal call is ledger-blocked');
});

test('non-player convoy loss produces the same scarcity bridge but resolves lost', () => {
  const harness = boot(4202);
  const live = fireConvoy(harness);
  harness.state.encounterDirector.stats.appliedFreightLossIds = {
    fl_legacy_first: true,
    fl_legacy_second: true,
  };
  killHaulers(harness, live, 999_001);
  tickDirector(harness);
  assertOneBoundedLoss(harness, live, 'lost');
  assert.equal(harness.log.losses[0].killerId, 999_001);
  assert.deepEqual(
    harness.state.encounterDirector.stats.appliedFreightLossIds.slice(0, 2),
    ['fl_legacy_first', 'fl_legacy_second'],
    'legacy object-shaped membership normalizes without losing its application order',
  );
});

test('successful convoy arrival remains positive and does not emit loss/news', () => {
  const harness = boot(4203);
  const live = fireConvoy(harness);
  const market = harness.economy.ensureMarket(STATION_ID);
  const stockBefore = market[live.data.cargoId].stock;
  for (const id of live.ids) {
    const entity = harness.state.entities.get(id);
    if (entity && entity.alive !== false) entity.pos = { ...live.data.end };
  }
  tickDirector(harness);

  assert.equal(harness.log.pressure.length, 1, 'arrival pressure still applies once');
  assert.ok(harness.log.pressure[0].vol > 0 && harness.log.pressure[0].vol <= 12);
  assert.equal(
    market[live.data.cargoId].stock,
    stockBefore + harness.log.pressure[0].vol,
    'the same economy owner applies positive arrival supply',
  );
  assert.equal(harness.log.losses.length, 0);
  assert.equal(harness.log.news.length, 0);
  assert.ok(harness.log.resolved.some((entry) => entry.encounterId === live.id && entry.outcome === 'arrived'));
});

test('stationless loss remains unreserved and retries once when a destination appears', () => {
  const harness = boot(4206);
  const live = fireConvoy(harness);
  live.data.destId = null;

  assert.equal(harness.director.freightLoss(live), false, 'stationless consequence has no owner route');
  assert.deepEqual(
    {
      pressure: harness.log.pressure.length,
      losses: harness.log.losses.length,
      news: harness.log.news.length,
      receipts: harness.log.receipts.length,
    },
    { pressure: 0, losses: 0, news: 0, receipts: 0 },
    'stationless attempt emits no economy or presentation receipt',
  );
  assert.equal(harness.state.encounterDirector.stats.appliedFreightLossIds.length, 0);

  live.data.destId = STATION_ID;
  assert.equal(harness.director.freightLoss(live), true, 'destination arrival makes the same intent routable');
  assert.equal(harness.log.pressure.length, 1);
  assert.equal(harness.log.losses.length, 1);
  assert.equal(harness.log.news.length, 1);
  assert.equal(harness.director.freightLoss(live), false, 'routable retry is then reserved exactly once');
  assert.equal(harness.log.pressure.length, 1);
  assert.equal(harness.log.losses.length, 1);
  assert.equal(harness.log.news.length, 1);
});

test('player robbery attribution is monotonic for both mixed-killer orders', () => {
  for (const order of ['player-first', 'player-last']) {
    const harness = boot(order === 'player-first' ? 4207 : 4208);
    const live = fireConvoy(harness);
    const haulerIds = live.ids.filter((id) => live.roles[id] === 'hauler');
    assert.ok(haulerIds.length >= 2, `${order} fixture needs multiple haulers`);
    const npcKillerId = order === 'player-first' ? 880_001 : 880_002;

    if (order === 'player-first') {
      killEntity(harness, haulerIds[0], harness.player.id);
      for (const id of haulerIds.slice(1)) killEntity(harness, id, npcKillerId);
    } else {
      killEntity(harness, haulerIds[0], npcKillerId);
      for (const id of haulerIds.slice(1)) killEntity(harness, id, harness.player.id);
    }
    tickDirector(harness);

    assertOneBoundedLoss(harness, live, 'robbed');
    assert.equal(
      harness.log.losses[0].killerId,
      harness.player.id,
      `${order} retains player causal attribution once robbery latches`,
    );
  }
});

test('serialized Continue preserves the applied loss identity and blocks stale replay', () => {
  const harness = boot(4204);
  const live = fireConvoy(harness);
  killHaulers(harness, live, harness.player.id);
  tickDirector(harness);
  assertOneBoundedLoss(harness, live, 'robbed');
  const intentId = harness.log.losses[0].intentId;

  // saveSystem persists the director's stats bag while intentionally dropping transient live actors.
  const durable = JSON.parse(JSON.stringify({
    named: harness.state.encounterDirector.named,
    receipts: harness.state.encounterDirector.receipts,
    cooldowns: harness.state.encounterDirector.cooldowns,
    stats: harness.state.encounterDirector.stats,
  }));
  assert.ok(durable.stats.appliedFreightLossIds.includes(intentId));
  harness.state.encounterDirector = durable;
  harness.bus.emit('save:loaded', {});
  assert.equal(Object.keys(harness.state.encounterDirector.live).length, 0, 'Continue drops transient convoy actors');

  const before = {
    pressure: harness.log.pressure.length,
    losses: harness.log.losses.length,
    news: harness.log.news.length,
  };
  assert.equal(harness.director.freightLoss(live), false, 'same stable intent is rejected after Continue');
  assert.deepEqual(
    { pressure: harness.log.pressure.length, losses: harness.log.losses.length, news: harness.log.news.length },
    before,
  );
});

test('65th lower-sorting loss ID evicts the true oldest and remains blocked after Continue', () => {
  const harness = boot(4205);
  const live = fireConvoy(harness);
  const intentId = stableLossIntentId(
    harness.state.meta.seed,
    `encounter:${live.id}`,
    0,
  );
  const prior = Array.from({ length: 64 }, (_, index) => `fl_z${String(index).padStart(3, '0')}`);
  assert.ok(intentId.localeCompare(prior[0]) < 0, 'adversarial new intent sorts before every retained ID');
  harness.state.encounterDirector.stats.appliedFreightLossIds = prior.slice();

  killHaulers(harness, live, harness.player.id);
  tickDirector(harness);
  assertOneBoundedLoss(harness, live, 'robbed');

  const applied = harness.state.encounterDirector.stats.appliedFreightLossIds;
  assert.equal(applied.length, 64);
  assert.equal(applied.at(-1), intentId, 'newly applied intent is newest regardless of lexical order');
  assert.equal(applied.includes(prior[0]), false, 'the true oldest insertion is evicted');
  assert.equal(applied.includes(prior[1]), true, 'newer prior insertions remain');

  const durable = JSON.parse(JSON.stringify({
    named: harness.state.encounterDirector.named,
    receipts: harness.state.encounterDirector.receipts,
    cooldowns: harness.state.encounterDirector.cooldowns,
    stats: harness.state.encounterDirector.stats,
  }));
  harness.state.encounterDirector = durable;
  harness.bus.emit('save:loaded', {});
  assert.ok(harness.state.encounterDirector.stats.appliedFreightLossIds.includes(intentId));
  const before = {
    pressure: harness.log.pressure.length,
    losses: harness.log.losses.length,
    news: harness.log.news.length,
  };
  assert.equal(harness.director.freightLoss(live), false, 'Continue replay sees the retained 65th intent');
  assert.deepEqual(
    { pressure: harness.log.pressure.length, losses: harness.log.losses.length, news: harness.log.news.length },
    before,
    'no pressure or presentation event replays after Continue',
  );
});
