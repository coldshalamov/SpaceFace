/**
 * NXI-029 — volatile identity survives dump and recovery. A spilled manifest pod keeps the
 * hazard of the lot it carries (lamp, class, field pull); an inert manifest marks nothing;
 * a jettisoned volatile lot re-collects as the same volatile commodity.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { volatileClassOf } from '../src/data/commodityVolatileClasses.js';
import {
  CIVILIAN_MANIFEST_PAYLOAD_TYPE,
  SUPERDENSE_FIELD_RESPONSE,
  dominantVolatileCommodityId,
  fieldProfileForVolatilePod,
  lootShards,
  spawnJettisonedCargoPod,
} from '../src/systems/lootShards.js';

function manifest(overrides = {}) {
  return {
    manifestId: 'fm_test_volatile',
    freighterKey: 'test-convoy:hauler:0',
    role: 'hauler',
    lines: [
      { commodityId: 'cmdty_food', qty: 5 },
      { commodityId: 'cmdty_fuel_cells', qty: 3 },
    ],
    totalQty: 8,
    ...overrides,
  };
}

function bootLoot() {
  const prior = {
    enabled: MASSLINE2_FLAGS.enabled,
    lootShards: MASSLINE2_FLAGS.lootShards,
  };
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;

  const bus = createBus();
  let nextId = 100;
  const state = {
    mode: 'flight',
    tick: 10,
    simTime: 12,
    playerId: 1,
    meta: { seed: 4242 },
    nextEntityId: 500,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_tethys_junction', records: { byId: {} } },
  };

  function add(entity) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  }

  const player = add({
    id: 1, type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, data: {}, flags: {},
  });

  lootShards.state = null;
  lootShards.bus = null;
  lootShards.init({ state, bus, helpers: {}, registry: null });

  function spawnCivilian({ cargoManifest = manifest() } = {}) {
    const id = nextId++;
    return add({
      id, type: 'ship', team: 2, factionId: 'faction_mts', alive: true,
      pos: { x: 120, z: 40 }, vel: { x: 8, z: -2 }, radius: 12, mass: 140,
      hull: 40, hullMax: 100,
      data: {
        trafficRole: 'hauler', role: 'hauler',
        cargoManifest: cargoManifest ? JSON.parse(JSON.stringify(cargoManifest)) : null,
        ai: { archetype: 'mule_trader', passive: true, spawnContext: 'convoy_civilian' },
      },
      flags: {},
    });
  }

  function kill(victim) {
    victim.alive = false;
    bus.emit('entity:killed', {
      id: victim.id, killerId: player.id, type: victim.type,
      pos: { x: victim.pos.x, z: victim.pos.z }, targetHostileToPlayer: false,
    });
  }

  function payloads() {
    return state.entityList.filter(
      (e) => e && e.alive !== false && e.type === 'payload'
        && e.data && e.data.payloadType === CIVILIAN_MANIFEST_PAYLOAD_TYPE,
    );
  }

  function restore() {
    MASSLINE2_FLAGS.enabled = prior.enabled;
    MASSLINE2_FLAGS.lootShards = prior.lootShards;
    if (typeof lootShards.destroy === 'function') lootShards.destroy();
  }

  return { state, bus, player, spawnCivilian, kill, payloads, restore };
}

test('a spilled fuel-cell haul keeps its explosive identity on the pod body', () => {
  const h = bootLoot();
  try {
    const victim = h.spawnCivilian();
    h.kill(victim);
    const pod = h.payloads()[0];
    assert.ok(pod, 'the manifest spill produced a body');
    assert.equal(pod.data.volatileClass, 'explosive');
    assert.equal(pod.data.volatileLamp, 'amber');
    assert.ok(pod.data.volatileSilhouette, 'the warning silhouette travels with the stamp');
    // volatileClassOf sees the stamped hazard even though the pod has no single commodityId.
    assert.equal(volatileClassOf(pod.data).id, 'explosive');
  } finally {
    h.restore();
  }
});

test('an inert manifest marks nothing — the pod stays plainly cargo', () => {
  const h = bootLoot();
  try {
    const victim = h.spawnCivilian({
      cargoManifest: manifest({
        lines: [
          { commodityId: 'cmdty_food', qty: 5 },
          { commodityId: 'cmdty_scrap_metal', qty: 4 },
        ],
      }),
    });
    h.kill(victim);
    const pod = h.payloads()[0];
    assert.ok(pod);
    assert.equal(pod.data.volatileClass, undefined);
    assert.equal(pod.data.volatileLamp, undefined);
    assert.equal(volatileClassOf(pod.data), null, 'inert cargo remains inert');
    assert.equal(pod.data.primaryCommodityId, 'cmdty_food', 'headline commodity still records');
  } finally {
    h.restore();
  }
});

test('the dominant volatile lot wins over a minor one; a superdense pod keeps its field pull', () => {
  const h = bootLoot();
  try {
    // 9 corrosive + 2 explosive → corrosive is the hazard the pod mostly is.
    const mixed = h.spawnCivilian({
      cargoManifest: manifest({
        lines: [
          { commodityId: 'cmdty_fuel_cells', qty: 2 },
          { commodityId: 'cmdty_volatiles', qty: 9 },
        ],
      }),
    });
    h.kill(mixed);
    const pod = h.payloads()[0];
    assert.equal(pod.data.volatileClass, 'corrosive');
    assert.equal(dominantVolatileCommodityId(pod.data.salvagePool), 'cmdty_volatiles');

    const dense = h.spawnCivilian({
      cargoManifest: manifest({
        manifestId: 'fm_dense',
        freighterKey: 'k:dense',
        lines: [{ commodityId: 'cmdty_ore_einsteinium', qty: 6 }],
      }),
    });
    dense.pos.x = 400;
    h.kill(dense);
    const densePod = h.payloads().find((p) => p.data.salvagePool.cmdty_ore_einsteinium);
    assert.equal(densePod.data.volatileClass, 'superdense');
    const profile = fieldProfileForVolatilePod(densePod);
    assert.equal(profile.fieldResponseMult, SUPERDENSE_FIELD_RESPONSE,
      'a superdense lot still answers the field after the spill');
  } finally {
    h.restore();
  }
});

test('a jettisoned volatile lot recollects as the same volatile commodity', () => {
  const h = bootLoot();
  try {
    const pod = spawnJettisonedCargoPod(h.state, {
      commodityId: 'cmdty_volatiles',
      amount: 7,
      pos: { x: 10, z: 10 },
      vel: { x: 0, z: 0 },
      ownerId: h.player.id,
    });
    assert.ok(pod, 'the jettison spawned a pod');
    assert.equal(pod.data.volatileClass, 'corrosive');
    // Pickup hands cargo the pod's own commodityId — the same lot, the same hazard.
    const collectedId = pod.data.commodityId;
    assert.equal(collectedId, 'cmdty_volatiles');
    assert.equal(volatileClassOf(collectedId).id, 'corrosive',
      'the recovered lot is still the volatile commodity it was');
  } finally {
    h.restore();
  }
});
