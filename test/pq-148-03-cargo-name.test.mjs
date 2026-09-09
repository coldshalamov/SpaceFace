// PQ-148.03 — cargo with a name.
// A spilled pod carries origin/destination/owner. The owner reacts
// (restitution / bounty / thanks). Player jettison of their own hold is not a bounty.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  CARGO_OWNER_REACTIONS,
  cargoIdentityOf,
  reactionForSpill,
} from '../src/data/cargoIdentity.js';
import { addCargo, cargo } from '../src/systems/cargo.js';
import {
  barkDirector,
  cargoSpillBarkText,
  cargoSpillLedgerText,
} from '../src/systems/barkDirector.js';
import {
  JETTISONED_CARGO_PAYLOAD_TYPE,
  lootShards,
  spawnJettisonedCargoPod,
} from '../src/systems/lootShards.js';

const COMMODITY_ID = 'cmdty_ore_iron';
const OWNER_ID = 'lane_mira_bluepack';
const OWNER_NAME = 'Mira Bluepack';
const ORIGIN_ID = 'station_ceres';
const DESTINATION_ID = 'station_helios_prime';

function findPods(state) {
  return (state.entityList || []).filter((entity) => entity
    && entity.alive !== false
    && entity.type === 'payload'
    && entity.data
    && entity.data.payloadType === JETTISONED_CARGO_PAYLOAD_TYPE);
}

function boot(seed = 14803) {
  const state = createGameState(seed);
  state.mode = 'flight';
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 8, z: 0 },
    rot: 0,
    radius: 14,
    mass: 18,
    factionId: 'player',
    flags: {},
    data: { defId: 'ship_kestrel', displayName: 'Tessera' },
  };
  const hauler = {
    id: 7,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x: 40, z: 0 },
    vel: { x: 4, z: 0 },
    rot: 0,
    radius: 16,
    mass: 40,
    factionId: 'faction_free',
    flags: {},
    data: {
      defId: 'ship_pelican',
      displayName: OWNER_NAME,
      cargoManifest: {
        manifestId: 'mira-ceres-helios',
        role: 'hauler',
        ownerId: OWNER_ID,
        ownerName: OWNER_NAME,
        originId: ORIGIN_ID,
        destStationId: DESTINATION_ID,
        lines: [{ commodityId: COMMODITY_ID, qty: 8 }],
        totalQty: 8,
      },
    },
  };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entities.set(hauler.id, hauler);
  state.entityList = [player, hauler];

  const bus = createBus();
  const spoken = [];
  const logs = [];
  const voices = [];
  bus.on('barkDirector:voice', (payload) => { voices.push(payload); });
  bus.on('comms:log', (payload) => { logs.push(payload); });
  const helpers = {
    spawnEntity(spec) {
      const id = (state.nextEntityId = (state.nextEntityId || 20) + 1);
      const entity = {
        id,
        ...spec,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        flags: { ...(spec.flags || {}) },
        data: spec.data ? { ...spec.data } : {},
        alive: true,
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
      return !!entity;
    },
    voice: {
      say(payload) {
        spoken.push(payload);
        return true;
      },
    },
  };

  const shards = Object.create(lootShards);
  shards.init({ state, bus, helpers });
  const hold = Object.create(cargo);
  hold.init({ state, bus, helpers });
  const barks = Object.create(barkDirector);
  barks.init({ state, bus, helpers });

  return {
    state,
    bus,
    helpers,
    shards,
    hold,
    barks,
    player,
    hauler,
    spoken,
    logs,
    voices,
    destroy() {
      barks.destroy();
      shards.destroy();
      if (typeof hold.destroy === 'function') hold.destroy();
    },
  };
}

test('PQ-148.03: spilled named hauler pod stamps identity and owner demands restitution', () => {
  const h = boot();
  try {
    const pod = spawnJettisonedCargoPod(h.state, {
      pos: { x: 36, z: 2 },
      vel: { x: 4, z: 1 },
      commodityId: COMMODITY_ID,
      amount: 8,
      unitMass: 0.5,
      ownerId: OWNER_ID,
      ownerName: OWNER_NAME,
      originId: ORIGIN_ID,
      destinationId: DESTINATION_ID,
      factionId: 'faction_free',
    }, h.helpers);
    assert.ok(pod, 'named pod spawned');
    const identity = cargoIdentityOf(pod);
    assert.ok(identity, 'pod carries cargo identity');
    assert.equal(identity.ownerId, OWNER_ID);
    assert.equal(identity.ownerName, OWNER_NAME);
    assert.equal(identity.originId, ORIGIN_ID);
    assert.equal(identity.destinationId, DESTINATION_ID);
    assert.equal(pod.data.ownerId, OWNER_ID);
    assert.equal(pod.data.ownerName, OWNER_NAME);
    assert.equal(pod.data.originId, ORIGIN_ID);
    assert.equal(pod.data.destinationId, DESTINATION_ID);

    h.bus.emit('freight:cargoSpilled', {
      encounterId: 'pq-148-03',
      custodyId: 'mira-ceres-helios:custody',
      manifestId: 'mira-ceres-helios',
      carrierId: h.hauler.id,
      ownerId: OWNER_ID,
      ownerName: OWNER_NAME,
      originId: ORIGIN_ID,
      destinationId: DESTINATION_ID,
      cause: 'drive_disabled',
      qty: 8,
      podCount: 1,
      role: 'hauler',
      isCivilian: true,
    });

    const reaction = reactionForSpill({
      ownerId: OWNER_ID,
      playerId: h.player.id,
      cause: 'spill',
      role: 'hauler',
      isCivilian: true,
    });
    assert.equal(reaction, 'restitution');
    assert.equal(CARGO_OWNER_REACTIONS.restitution.ledgerVerb, 'restitution');

    const barkText = cargoSpillBarkText(OWNER_NAME, 'restitution');
    const ledgerText = cargoSpillLedgerText(OWNER_NAME, 'restitution');
    assert.equal(h.spoken.length, 1, 'owner bark spoken once');
    assert.equal(h.spoken[0].kind, 'cargoSpill');
    assert.equal(h.spoken[0].text, barkText);
    assert.ok(h.spoken[0].text.includes(OWNER_NAME), 'bark cites the owner');
    assert.equal(h.voices.length, 1, 'barkDirector:voice emitted');
    assert.equal(h.voices[0].ownerName, OWNER_NAME);
    assert.equal(h.voices[0].reaction, 'restitution');
    assert.equal(h.voices[0].text, barkText);
    assert.equal(h.voices[0].ledgerText, ledgerText);
    assert.equal(h.logs.length, 1, 'comms:log ledger line emitted');
    assert.equal(h.logs[0].from, OWNER_NAME);
    assert.equal(h.logs[0].text, ledgerText);
    assert.ok(h.logs[0].text.includes(OWNER_NAME), 'ledger cites the owner');
    assert.ok(h.logs[0].text.includes('restitution'), 'ledger cites the reaction');

    const stamped = cargoIdentityOf(findPods(h.state)[0]);
    assert.equal(stamped.ownerName, OWNER_NAME);

    console.log(`OWNER: ${OWNER_NAME}`);
    console.log(`REACTION: ${reaction}`);
    console.log(`BARK: ${barkText}`);
    console.log(`LEDGER: ${ledgerText}`);

    assert.ok(h.state.barkDirector.cargoSpill.count >= 1);
  } finally {
    h.destroy();
  }
});

test('PQ-148.03: player jettison of own pod does not bounty themselves', () => {
  const h = boot(148031);
  try {
    addCargo(h.state, COMMODITY_ID, 4);
    const dumped = h.hold.jettison(COMMODITY_ID, 4);
    assert.equal(dumped, 4);

    const pods = findPods(h.state);
    assert.equal(pods.length, 1, 'player jettison spawned one pod');
    const identity = cargoIdentityOf(pods[0]);
    assert.ok(identity, 'own pod still has an owner stamp');
    assert.equal(String(identity.ownerId), String(h.player.id));

    const reaction = reactionForSpill({
      ownerId: h.player.id,
      playerId: h.player.id,
      cause: 'jettison',
    });
    assert.equal(reaction, null, 'player does not bounty themselves');
    assert.equal(h.spoken.length, 0, 'no owner bark on self-jettison');
    assert.equal(h.voices.length, 0, 'no barkDirector:voice on self-jettison');
    assert.equal(h.logs.filter((row) => row.reaction === 'bounty').length, 0, 'no self-bounty ledger');
    assert.equal(h.state.barkDirector?.cargoSpill?.count || 0, 0);
  } finally {
    h.destroy();
  }
});
