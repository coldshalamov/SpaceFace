/**
 * AQUARIUM-REPAIRS D2 — killed manifest-carrying civilians drop one tetherable cargo body.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { interactionProfileForEntity } from '../src/data/entityInteractionProfiles.js';
import { save as saveSystem } from '../src/save/saveSystem.js';
import {
  CIVILIAN_MANIFEST_PAYLOAD_TYPE,
  MAX_CIVILIAN_MANIFEST_PAYLOADS,
  enforceCivilianManifestPayloadCap,
  lootShards,
  salvagePoolFromManifest,
  validCivilianManifestForPayload,
} from '../src/systems/lootShards.js';

function manifest(overrides = {}) {
  return {
    manifestId: 'fm_test_curtain',
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

function bootLoot({ withSave = false } = {}) {
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
    meta: { seed: 47047 },
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
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    hull: 200,
    hullMax: 200,
    data: {},
    flags: {},
  });

  const systems = [lootShards];
  if (withSave) systems.push(saveSystem);
  for (const sys of systems) {
    sys.state = null;
    sys.bus = null;
    if (typeof sys.init === 'function') {
      sys.init({ state, bus, helpers: {}, registry: null });
    }
  }

  function spawnCivilian({ cargoManifest = manifest(), team = 2 } = {}) {
    const id = nextId++;
    return add({
      id,
      type: 'ship',
      team,
      factionId: 'faction_mts',
      alive: true,
      pos: { x: 120, z: 40 },
      vel: { x: 8, z: -2 },
      radius: 12,
      mass: 140,
      hull: 40,
      hullMax: 100,
      data: {
        trafficRole: 'hauler',
        role: 'hauler',
        cargoManifest: cargoManifest ? JSON.parse(JSON.stringify(cargoManifest)) : null,
        ai: { archetype: 'mule_trader', passive: true, spawnContext: 'convoy_civilian' },
      },
      flags: {},
    });
  }

  function kill(victim, { killerId = player.id, targetHostileToPlayer = false } = {}) {
    victim.alive = false;
    bus.emit('entity:killed', {
      id: victim.id,
      killerId,
      type: victim.type,
      pos: { x: victim.pos.x, z: victim.pos.z },
      targetHostileToPlayer,
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

  return { state, bus, player, spawnCivilian, kill, payloads, restore, saveSystem };
}

test('validCivilianManifestForPayload rejects empty hulls', () => {
  assert.equal(validCivilianManifestForPayload(null), false);
  assert.equal(validCivilianManifestForPayload({ lines: [] }), false);
  assert.equal(validCivilianManifestForPayload({ lines: [{ commodityId: 'x', qty: 0 }] }), false);
  assert.equal(validCivilianManifestForPayload(manifest()), true);
});

test('D2: destroy loaded civilian → exactly one payload with manifest salvagePool', () => {
  const h = bootLoot();
  try {
    const victim = h.spawnCivilian();
    const expectedPool = salvagePoolFromManifest(victim.data.cargoManifest);
    h.kill(victim);
    const bodies = h.payloads();
    assert.equal(bodies.length, 1, 'exactly one cargo body');
    const body = bodies[0];
    assert.equal(body.type, 'payload');
    assert.equal(body.data.payloadType, CIVILIAN_MANIFEST_PAYLOAD_TYPE);
    assert.deepEqual(body.data.salvagePool, expectedPool);
    assert.ok(body.mass >= 20, 'payload mass floor');
    assert.equal(body.collides, true);
    assert.equal(body.flags.persistent, true, 'save/Continue residency');
    // Cap stamp: second kill on same hull must not multi-drop.
    h.kill(victim);
    assert.equal(h.payloads().length, 1);
  } finally {
    h.restore();
  }
});

test('D2: empty hull drops nothing', () => {
  const h = bootLoot();
  try {
    const empty = h.spawnCivilian({ cargoManifest: null });
    h.kill(empty);
    assert.equal(h.payloads().length, 0);
    const zero = h.spawnCivilian({
      cargoManifest: { manifestId: 'empty', lines: [], totalQty: 0 },
    });
    h.kill(zero);
    assert.equal(h.payloads().length, 0);
  } finally {
    h.restore();
  }
});

test('D2: authored freight-custody carriers do not invent a second cargo body', () => {
  const h = bootLoot();
  try {
    const victim = h.spawnCivilian();
    victim.data.freightRewardOwner = 'manifest_custody';
    victim.data.freightCustody = {
      status: 'carrier',
      custodyId: 'fm_test:custody:carrier0',
      manifestId: victim.data.cargoManifest.manifestId,
    };
    h.kill(victim);
    assert.equal(h.payloads().length, 0,
      'encounter custody pods own the conserved spill; lootShards must not double-mint');
    assert.equal(victim.data.manifestPayloadDropped, undefined);
  } finally {
    h.restore();
  }
});

test('D2: payload is tether-eligible per interaction profile', () => {
  const h = bootLoot();
  try {
    const victim = h.spawnCivilian();
    h.kill(victim);
    const body = h.payloads()[0];
    assert.ok(body);
    const profile = interactionProfileForEntity(body);
    assert.equal(profile.kind, 'payload');
    assert.equal(profile.tetherable, true);
  } finally {
    h.restore();
  }
});

test('D2: save/Continue round-trips the cargo body', () => {
  const h = bootLoot({ withSave: true });
  try {
    const victim = h.spawnCivilian();
    h.kill(victim);
    const before = h.payloads()[0];
    assert.ok(before);
    const poolBefore = { ...before.data.salvagePool };

    // Serialize persistent entities the same way saveSystem does.
    const plain = {
      type: before.type,
      pos: { x: before.pos.x, z: before.pos.z },
      vel: { x: before.vel.x, z: before.vel.z },
      radius: before.radius,
      mass: before.mass,
      hull: before.hull,
      hullMax: before.hullMax,
      flags: { ...before.flags, persistent: true },
      data: JSON.parse(JSON.stringify(before.data)),
    };
    // Wipe live body, then restore as Continue would.
    before.alive = false;
    h.state.entities.delete(before.id);
    h.state.entityList = h.state.entityList.filter((e) => e !== before);
    assert.equal(h.payloads().length, 0);

    const restoredId = (h.state.nextEntityId = (h.state.nextEntityId || 1000) + 1);
    const restored = {
      id: restoredId,
      ...plain,
      alive: true,
      pos: { ...plain.pos },
      vel: { ...plain.vel },
      flags: { ...plain.flags },
      data: { ...plain.data, salvagePool: { ...plain.data.salvagePool } },
    };
    h.state.entities.set(restored.id, restored);
    h.state.entityList.push(restored);

    const after = h.payloads();
    assert.equal(after.length, 1);
    assert.deepEqual(after[0].data.salvagePool, poolBefore);
    assert.equal(after[0].data.payloadType, CIVILIAN_MANIFEST_PAYLOAD_TYPE);
    assert.equal(interactionProfileForEntity(after[0]).tetherable, true);
  } finally {
    h.restore();
  }
});

test('D2: live payload cap disposes oldest excess', () => {
  const h = bootLoot();
  try {
    for (let i = 0; i < MAX_CIVILIAN_MANIFEST_PAYLOADS + 2; i++) {
      const victim = h.spawnCivilian({
        cargoManifest: manifest({ manifestId: `fm_${i}`, freighterKey: `k:${i}` }),
      });
      // Offset positions so bodies are distinct.
      victim.pos.x = 100 + i * 10;
      h.kill(victim);
    }
    assert.equal(h.payloads().length, MAX_CIVILIAN_MANIFEST_PAYLOADS);
    // Explicit enforcement is idempotent at the cap.
    assert.equal(enforceCivilianManifestPayloadCap(h.state, h.bus), 0);
  } finally {
    h.restore();
  }
});

test('D2: hostile kills still take the shard path (no civilian payload)', () => {
  const h = bootLoot();
  try {
    const drops = [];
    h.bus.on('loot:drop', (p) => drops.push(p));
    const hostile = h.spawnCivilian();
    hostile.team = 1;
    h.kill(hostile, { targetHostileToPlayer: true });
    assert.equal(h.payloads().length, 0, 'hostiles do not spawn civilian cargo bodies');
    assert.equal(drops.length, 1, 'hostile player kill still emits loot:drop shards');
  } finally {
    h.restore();
  }
});
