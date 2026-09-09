import test from 'node:test';
import assert from 'node:assert/strict';

import { CERES_ACTIVITY_POCKETS } from '../src/data/sectorActivityPockets.js';
import { fieldDepletion } from '../src/systems/fieldDepletion.js';
import { economy } from '../src/systems/economy.js';
import { traffic, TRAFFIC_ROLES } from '../src/systems/traffic.js';

function eventBus() {
  const listeners = new Map();
  const log = [];
  return {
    log,
    on(event, handler) {
      const handlers = listeners.get(event) || [];
      handlers.push(handler);
      listeners.set(event, handlers);
    },
    off(event, handler) {
      listeners.set(event, (listeners.get(event) || []).filter((candidate) => candidate !== handler));
    },
    emit(event, payload) {
      log.push({ event, payload });
      for (const handler of listeners.get(event) || []) handler(payload);
    },
  };
}

function fixture() {
  const refinery = {
    id: 10, type: 'station', alive: true, pos: { x: 0, z: 0 },
    data: { stationId: 'station_ceres' },
  };
  const asteroid = {
    id: 30, type: 'asteroid', alive: true, pos: { x: 300, z: 0 },
    data: {
      typeId: 'ast_metallic',
      fieldId: 'field_ceres_working_seam',
      activityObjectSlotId: 'ceres_seam_ore_clast',
      yieldU: 18,
    },
  };
  const barge = {
    id: 20, type: 'ship', alive: true, isPlayer: false, pos: { x: 300, z: 0 },
    data: {
      trafficRole: 'ore_carrier',
      trafficLabel: 'Ore Barge',
      worldRecordId: 'wr_ceres_ore_barge',
    },
  };
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 }, data: {},
  };
  const rec = {
    id: barge.id,
    role: 'ore_carrier',
    targetId: asteroid.id,
    waitT: 0,
    nextTradeT: 0,
    dockSeq: 0,
    manifest: { lines: [], totalQty: 0 },
  };
  const assigned = [];
  const helpers = {
    npcJobs: {
      assign(entity, spec) {
        const jobId = `job:${entity.data.worldRecordId}`;
        entity.data.jobId = jobId;
        assigned.push({ entity, spec, jobId });
        return jobId;
      },
    },
  };
  const state = {
    meta: { seed: 0x0480_0001 },
    tick: 1200,
    simTime: 50,
    mode: 'flight',
    world: { currentSectorId: 'sector_ceres_belt', sectors: {} },
    entities: new Map([[player.id, player], [refinery.id, refinery], [asteroid.id, asteroid], [barge.id, barge]]),
    entityList: [player, refinery, asteroid, barge],
    playerId: player.id,
    player: {
      credits: 2000,
      cargo: { items: { cmdty_food: 1 }, usedVolume: 1, usedMass: 1, capVolume: 20, capMass: 20 },
      marketMemory: {},
    },
    economy: {
      markets: {
        station_ceres: {
          cmdty_ore_iron: { stock: 100, equilibrium: 160, basePrice: 18, price: 18, role: 'consume' },
          cmdty_ore_copper: { stock: 80, equilibrium: 120, basePrice: 24, price: 24, role: 'consume' },
        },
      },
      cycles: {},
      econEvents: [],
      econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 },
      marketIntel: {},
    },
    traffic: {
      freighters: [rec],
      appliedArrivalIds: [],
      appliedLossIds: [],
      appliedMinerWorkIds: [],
    },
  };
  return { state, helpers, assigned, refinery, asteroid, barge, player, rec };
}

function boot(h) {
  const bus = eventBus();
  economy.init({ state: h.state, bus, helpers: {}, registry: null });
  fieldDepletion.init({ state: h.state, bus });
  traffic.init({ state: h.state, bus, helpers: h.helpers, registry: null });
  return bus;
}

function extract(h, bus, seq = 7) {
  traffic._maybeAssignJob(
    h.barge, 'ore_carrier', h.refinery, h.asteroid, [h.refinery], 'sector_ceres_belt',
  );
  assert.equal(h.assigned.length, 1, 'Ore Barge must receive the existing physical mining job');
  assert.equal(h.assigned[0].spec.kind, 'miner', 'job kernel is reused without inventing a new owner');
  assert.equal(h.rec.manifest.totalQty, 0, 'the barge leaves the refinery empty');
  bus.emit('npcjobs:work', {
    jobId: h.barge.data.jobId,
    kind: 'miner',
    seq,
    completed: true,
    field: `field:${h.asteroid.id}`,
  });
  return h.rec.manifest;
}

test('the authored Ceres seam actor is a distinct Ore Barge on a seam-to-refinery route', () => {
  const seam = CERES_ACTIVITY_POCKETS
    .flatMap((pocket) => pocket.actorSlots || [])
    .find((slot) => slot.id === 'ceres_seam_miner');
  assert.ok(seam);
  assert.equal(seam.presentationRole, 'ore_carrier');
  assert.equal(TRAFFIC_ROLES.ore_carrier.label, 'Ore Barge');
  assert.equal(TRAFFIC_ROLES.ore_carrier.trades, true);
  assert.equal(TRAFFIC_ROLES.ore_carrier.seeks, 'asteroid');
  assert.ok(seam.route.marks.some((mark) => mark.targetRef === 'field:slot:ceres_seam_ore_clast'));
  assert.ok(seam.route.marks.some((mark) => mark.targetRef === 'dest:station_ceres'));
});

test('one physical extraction lot stays on the Ore Barge and settles at Ceres exactly once', () => {
  const h = fixture();
  const bus = boot(h);
  const playerBefore = JSON.parse(JSON.stringify(h.state.player));
  const stockBefore = h.state.economy.markets.station_ceres.cmdty_ore_iron.stock;
  const manifest = extract(h, bus);

  assert.equal(h.state.fieldDepletion.fields.field_ceres_working_seam.extractedU, 8);
  assert.equal(manifest.role, 'ore_carrier');
  assert.deepEqual(manifest.lines, [{ commodityId: 'cmdty_ore_iron', qty: 8 }]);
  assert.equal(manifest.totalQty, 8);
  assert.equal(manifest.lotId, manifest.manifestId, 'the stable manifest identity is the ore lot identity');
  assert.equal(manifest.lotSource.asteroidId, h.asteroid.id);
  assert.equal(manifest.lotSource.fieldId, h.asteroid.data.fieldId);
  assert.equal(manifest.custody.holderId, h.barge.data.worldRecordId);
  assert.deepEqual(h.barge.data.cargoManifest, manifest);

  bus.emit('npcjobs:unload', {
    jobId: h.barge.data.jobId,
    kind: 'miner',
    seq: 11,
    completed: true,
    destination: 'home:station_ceres',
    payload: null,
  });
  const arrivals = bus.log.filter((entry) => entry.event === 'freight:arrival');
  assert.equal(arrivals.length, 1);
  assert.equal(arrivals[0].payload.manifestId, manifest.manifestId);
  assert.equal(arrivals[0].payload.lotId, manifest.lotId);
  assert.deepEqual(arrivals[0].payload.lotSource, manifest.lotSource);
  assert.equal(h.state.economy.markets.station_ceres.cmdty_ore_iron.stock, stockBefore + 8);
  assert.equal(h.rec.manifest.totalQty, 0, 'the same hull leaves the visible unload empty');
  assert.deepEqual(h.state.player, playerBefore, 'NPC work never writes the player wallet or hold');

  bus.emit('save:loaded', {});
  bus.emit('npcjobs:unload', {
    jobId: h.barge.data.jobId,
    kind: 'miner',
    seq: 11,
    completed: true,
    destination: 'home:station_ceres',
    payload: null,
  });
  assert.equal(bus.log.filter((entry) => entry.event === 'freight:arrival').length, 1);
  assert.equal(h.state.economy.markets.station_ceres.cmdty_ore_iron.stock, stockBefore + 8,
    'Continue/replay cannot settle the lot twice');
});

test('destroying a loaded Ore Barge produces one loss for the same lot and never also delivers it', () => {
  const h = fixture();
  const bus = boot(h);
  const manifest = extract(h, bus);
  const stockBefore = h.state.economy.markets.station_ceres.cmdty_ore_iron.stock;

  h.barge.alive = false;
  bus.emit('entity:killed', {
    id: h.barge.id,
    killerId: h.player.id,
    sectorId: 'sector_ceres_belt',
  });
  const losses = bus.log.filter((entry) => entry.event === 'freight:loss');
  assert.equal(losses.length, 1);
  assert.equal(losses[0].payload.manifestId, manifest.manifestId);
  assert.equal(losses[0].payload.lotId, manifest.lotId);
  assert.deepEqual(losses[0].payload.lotSource, manifest.lotSource);

  bus.emit('entity:killed', { id: h.barge.id, killerId: h.player.id, sectorId: 'sector_ceres_belt' });
  bus.emit('npcjobs:unload', {
    jobId: h.barge.data.jobId,
    kind: 'miner',
    seq: 11,
    completed: true,
    destination: 'home:station_ceres',
  });
  assert.equal(bus.log.filter((entry) => entry.event === 'freight:loss').length, 1);
  assert.equal(bus.log.filter((entry) => entry.event === 'freight:arrival').length, 0);
  assert.notEqual(h.state.economy.markets.station_ceres.cmdty_ore_iron.stock, stockBefore + 8,
    'a lost lot cannot also arrive');

  const twin = fixture();
  const twinBus = boot(twin);
  const twinManifest = extract(twin, twinBus);
  assert.equal(twinManifest.lotId, manifest.lotId,
    'same seed, durable hull, source, and work sequence recreate the same saved lot identity');
});
