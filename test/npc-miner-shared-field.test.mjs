import test from 'node:test';
import assert from 'node:assert/strict';

import { fieldDepletion } from '../src/systems/fieldDepletion.js';
import { traffic } from '../src/systems/traffic.js';

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
    data: { stationId: 'station_refinery' },
  };
  const asteroid = {
    id: 30, type: 'asteroid', alive: true, pos: { x: 300, z: 0 },
    data: { typeId: 'ast_metallic', fieldId: 'field_shared_belt', yieldU: 18 },
  };
  const miner = {
    id: 20, type: 'ship', alive: true, isPlayer: false, pos: { x: 300, z: 0 },
    data: {
      trafficRole: 'miner',
      worldRecordId: 'wr_working_miner',
    },
  };
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 }, data: {},
  };
  const rec = {
    id: miner.id,
    role: 'miner',
    targetId: asteroid.id,
    waitT: 0,
    nextTradeT: 0,
    dockSeq: 0,
    manifest: { lines: [{ commodityId: 'cmdty_food', qty: 9 }], totalQty: 9 },
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
    meta: { seed: 91 },
    tick: 1200,
    simTime: 50,
    world: { currentSectorId: 'sector_ceres_belt' },
    entities: new Map([[player.id, player], [refinery.id, refinery], [asteroid.id, asteroid], [miner.id, miner]]),
    entityList: [player, refinery, asteroid, miner],
    playerId: player.id,
    player: { credits: 2000, cargo: { items: { cmdty_food: 1 } } },
    economy: {
      markets: {
        station_refinery: {
          cmdty_ore_iron: { stock: 100 },
          cmdty_ore_copper: { stock: 80 },
        },
      },
    },
    traffic: {
      freighters: [rec],
      appliedArrivalIds: [],
      appliedLossIds: [],
      appliedMinerWorkIds: [],
    },
  };
  return { state, helpers, assigned, refinery, asteroid, miner, player, rec };
}

test('materialized miner work depletes the shared field and delivers the mined ore once', () => {
  const h = fixture();
  const bus = eventBus();
  fieldDepletion.init({ state: h.state, bus });
  traffic.init({ state: h.state, bus, helpers: h.helpers, registry: null });

  traffic._maybeAssignJob(
    h.miner, 'miner', h.refinery, h.asteroid, [h.refinery], 'sector_ceres_belt',
  );
  assert.equal(h.assigned.length, 1);
  assert.equal(h.rec.manifest.totalQty, 0, 'a commissioned miner leaves the refinery empty');

  const walletBefore = JSON.parse(JSON.stringify(h.state.player));
  const work = {
    event: 'npcjobs:work',
    jobId: h.miner.data.jobId,
    kind: 'miner',
    seq: 7,
    completed: true,
    field: `field:${h.asteroid.id}`,
  };
  bus.emit(work.event, work);

  const field = h.state.fieldDepletion.fields.field_shared_belt;
  assert.equal(field.extractedU, 8);
  assert.equal(field.destroyedCount, 0, 'a completed work stop does not pretend the rock was destroyed');
  assert.equal(field.depletion, 0.02);
  assert.deepEqual(h.rec.manifest.lines, [{ commodityId: 'cmdty_ore_iron', qty: 8 }]);
  assert.deepEqual(h.miner.data.cargoManifest, h.rec.manifest);
  assert.equal(
    bus.log.filter((entry) => entry.event === 'field:depletedChanged'
      && entry.payload.reason === 'npc_mining').length,
    1,
  );
  const depletionEvent = bus.log.find((entry) => entry.event === 'fieldDepletion:changed'
    && entry.payload.reason === 'npc_mining');
  assert.equal(depletionEvent.payload.source, 'traffic_npc_job');
  assert.equal(depletionEvent.payload.minerId, h.miner.id);

  bus.emit(work.event, work);
  assert.equal(h.state.fieldDepletion.fields.field_shared_belt.extractedU, 8,
    'replaying one completed work intent cannot extract twice');

  const loadedManifestId = h.rec.manifest.manifestId;
  const unload = {
    event: 'npcjobs:unload',
    jobId: h.miner.data.jobId,
    kind: 'miner',
    seq: 11,
    completed: true,
    destination: 'home:station_refinery',
    payload: null,
  };
  bus.emit(unload.event, unload);
  const arrivals = bus.log.filter((entry) => entry.event === 'freight:arrival');
  const trades = bus.log.filter((entry) => entry.event === 'aiTrader:requestTrade');
  assert.equal(arrivals.length, 1);
  assert.equal(arrivals[0].payload.manifestId, loadedManifestId);
  assert.ok(trades.length > 0);
  assert.ok(trades.every((entry) => entry.payload.commodityId === 'cmdty_ore_iron'));
  assert.equal(h.rec.manifest.totalQty, 0, 'the barge is empty after its visible unload');
  assert.deepEqual(h.miner.data.cargoManifest, h.rec.manifest);
  assert.deepEqual(h.state.player, walletBefore, 'NPC extraction never writes player cargo or credits');

  bus.emit(unload.event, unload);
  assert.equal(bus.log.filter((entry) => entry.event === 'freight:arrival').length, 1,
    'replaying one unload cannot move market stock twice');
});
