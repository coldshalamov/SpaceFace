// D92 — lawful civilian hulls must not contact-consume custody freight pods.
//
// `physics._applyPickupCollection` used to full-consume any pickup for any live ship/drone
// collector (the legacy no-receipt path): in world.reaction_trio seed 4242 an express liner swept
// three lawful-custody freight pods (`freightCustodyPod`, `cargoIdentity.ownerId`,
// `salvorClaimedBy` all stamped) at ~4.3 s with no theft report, no custody check, no claim
// respect. The rule pinned here: a custody pod is contact-collectable by its owner, by the salvor
// holding the claim, by an outlaw, or by the player — never by a lawful passer-by. Free loot keeps
// the legacy contract.
//
// Deterministic: no rng, no wall clock, a fixed-step call sequence on the physics collection seam.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import {
  isOutlawPickupCollector,
  pickupCustodyAllowsCollector,
  pickupCustodyIdentity,
} from '../src/core/pickupCustody.js';
import { cargo } from '../src/systems/cargo.js';

const COMMODITY_ID = 'cmdty_alloys';
const POD_QTY = 12;
const CARRIER_RECORD_ID = 'wr_mule_carrier_7';
const SALVOR_RECORD_ID = 'wr_yard_cutter_3';
const OTHER_SALVOR_RECORD_ID = 'wr_yard_cutter_9';
const LINER_POS = Object.freeze({ x: 520, z: 300 });

let nextId = 1;

function entity(spec) {
  const value = makeEntity(spec);
  value.id = nextId++;
  return value;
}

function ship(pos, data, extra = {}) {
  return entity({
    type: 'ship', team: 2, pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 9,
    factionId: 'faction_scn', data: { intent: {}, ...data }, ...extra,
  });
}

/** A custody freight pod exactly as the reaction_trio spill + lootShards identity stamp leave it. */
function custodyPod(pos, extra = {}) {
  return entity({
    type: 'pickup', pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 4, mass: 0.6, collides: true,
    data: {
      kind: 'cargo',
      commodityId: COMMODITY_ID,
      amount: POD_QTY,
      despawnAt: 600,
      encounterId: 'world.reaction_trio:4242',
      freightCustodyPod: { custodyId: 'cust:4242', qty: POD_QTY, custodySourceKind: 'lawful_carrier' },
      ownerId: CARRIER_RECORD_ID,
      cargoIdentity: { commodityId: COMMODITY_ID, ownerId: CARRIER_RECORD_ID, ownerName: 'Mule 7' },
      ...extra,
    },
  });
}

function freeLoot(pos) {
  return entity({
    type: 'pickup', pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 2.2, collides: true,
    data: { kind: 'ore', commodityId: 'cmdty_ore_iron', amount: 3 },
  });
}

function boot({ pickups, collectors }) {
  nextId = 1;
  const player = entity({
    type: 'ship', team: 0, pos: { x: -4000, z: -4000 }, vel: { x: 0, z: 0 }, radius: 8,
    data: { intent: {} },
  });
  const collectorList = [player, ...collectors.map((make) => make())];
  const pickupList = pickups.map((make) => make());
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    rng: () => 0.5,
    playerId: player.id,
    player: {
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 },
      moduleInventory: [],
      magnetRange: 0,
    },
    input: { fireGroup: 0 },
    entities: new Map([...collectorList, ...pickupList].map((e) => [e.id, e])),
    entityList: [...collectorList, ...pickupList],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      pickups: pickupList,
      shipLike: collectorList,
      collidable: [...collectorList, ...pickupList],
      asteroids: [],
    },
  };
  const bus = createBus();
  cargo.init({ state, bus, helpers: {} });
  physics.init({ state, bus, helpers: {} });
  const events = [];
  bus.on('pickup:collected', (payload) => events.push(structuredClone(payload)));
  return {
    state,
    bus,
    player,
    collectors: collectorList.slice(1),
    pickups: pickupList,
    events,
    step(ticks = 1) {
      for (let i = 0; i < ticks; i++) {
        physics.collectPickups(state);
        state.tick += 1;
        state.simTime += 1 / 60;
      }
    },
  };
}

const liner = (extra = {}) => () => ship(LINER_POS, {
  trafficRole: 'express', role: 'express', ai: { lawful: true, archetype: 'liner' }, ...extra,
});
const claimedPod = (claimantId) => () => custodyPod(LINER_POS, { salvorClaimedBy: claimantId });

test('a lawful express liner passing through a custody spill consumes none of it', () => {
  const h = boot({
    pickups: [claimedPod(SALVOR_RECORD_ID), claimedPod(SALVOR_RECORD_ID), claimedPod(SALVOR_RECORD_ID)],
    collectors: [liner()],
  });
  h.step(1);
  for (const pod of h.pickups) {
    assert.equal(pod.alive, true, `pod ${pod.id} was eaten by a lawful liner on first contact`);
    assert.equal(pod.data.amount, POD_QTY, 'the pod keeps its whole physical quantity');
    assert.equal(pod.data.salvorClaimedBy, SALVOR_RECORD_ID, 'the salvor claim survives the pass');
  }
  assert.equal(h.events.length, 0, 'a denied contact asks for no receipt — no phantom pickup:collected');

  // Sitting inside the spill for five seconds changes nothing: no retry churn, no slow leak.
  h.step(300);
  assert.equal(h.pickups.filter((pod) => pod.alive).length, 3);
  assert.equal(h.events.length, 0);
  assert.equal(physics._diag.pickupCollections, 0);
});

test('free loot beside the same spill keeps the legacy contract: the liner still hoovers it', () => {
  const h = boot({
    pickups: [claimedPod(SALVOR_RECORD_ID), () => freeLoot(LINER_POS)],
    collectors: [liner()],
  });
  h.step(1);
  const [pod, loot] = h.pickups;
  assert.equal(pod.alive, true, 'custody pod survives');
  assert.equal(loot.alive, false, 'ordinary ore chip is consumed by an NPC hull exactly as before');
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].pickupId, loot.id);
  assert.equal(h.events[0].collectorId, h.collectors[0].id);
});

test('the salvor holding the claim collects on contact; a cutter without the claim does not', () => {
  const h = boot({
    pickups: [claimedPod(SALVOR_RECORD_ID), claimedPod(OTHER_SALVOR_RECORD_ID)],
    collectors: [() => ship(LINER_POS, {
      trafficRole: 'salvor', jobKind: 'salvor', worldRecordId: SALVOR_RECORD_ID, ai: { lawful: true },
    })],
  });
  h.step(1);
  const [mine, theirs] = h.pickups;
  assert.equal(mine.alive, false, 'the claim holder takes its own claim');
  assert.equal(theirs.alive, true, 'another cutter\'s claim is respected');
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].pickupId, mine.id);
  assert.equal(h.events[0].collectorId, h.collectors[0].id);
});

test('the cargo owner recovers its own spill on contact; a different lawful hauler cannot', () => {
  const h = boot({
    pickups: [() => custodyPod(LINER_POS), () => custodyPod({ x: LINER_POS.x + 200, z: LINER_POS.z })],
    collectors: [
      () => ship(LINER_POS, { trafficRole: 'hauler', worldRecordId: CARRIER_RECORD_ID, ai: { lawful: true } }),
      () => ship({ x: LINER_POS.x + 200, z: LINER_POS.z }, {
        trafficRole: 'hauler', worldRecordId: 'wr_some_other_hauler', ai: { lawful: true },
      }),
    ],
  });
  h.step(1);
  const [ownersPod, strangersPod] = h.pickups;
  assert.equal(ownersPod.alive, false, 'the owner may recover its own freight');
  assert.equal(strangersPod.alive, true, 'a stranger with no title passes through');
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].collectorId, h.collectors[0].id);
});

test('outlaws stay eligible: the stamped custody raider and a pirate both take the pod on contact', () => {
  const h = boot({
    pickups: [() => custodyPod(LINER_POS), () => custodyPod({ x: LINER_POS.x + 200, z: LINER_POS.z })],
    collectors: [
      // The exact raider after the predation clear: `predationRole` is gone, the custody stamp stays.
      () => ship(LINER_POS, {
        role: 'raider', freightCustodyRaiderIdentityKey: 'enc:raider:0',
        ai: { archetype: 'reaver_pirate', passive: true, pirateDisengaged: true },
      }, { team: 1, factionId: 'faction_red' }),
      () => ship({ x: LINER_POS.x + 200, z: LINER_POS.z }, {
        trafficRole: 'pirate', ai: { pirate: true },
      }, { team: 1, factionId: 'faction_red' }),
    ],
  });
  h.step(1);
  assert.equal(h.pickups.filter((pod) => pod.alive).length, 0, 'both outlaws took their pod');
  assert.deepEqual(
    h.events.map((event) => event.collectorId).sort((a, b) => a - b),
    h.collectors.map((col) => col.id).sort((a, b) => a - b),
  );
});

test('the player still collects a custody pod on contact and cargo writes the receipt', () => {
  const h = boot({ pickups: [claimedPod(SALVOR_RECORD_ID)], collectors: [] });
  const pod = h.pickups[0];
  h.player.pos.x = pod.pos.x;
  h.player.pos.z = pod.pos.z;
  h.step(1);
  assert.equal(pod.alive, false);
  assert.equal(h.state.player.cargo.items[COMMODITY_ID], POD_QTY);
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].collectorId, h.player.id);
  assert.equal(h.events[0].acceptedAmount, POD_QTY);
  assert.equal(h.events[0].rejectedAmount, 0);
});

test('pickupCustody helpers: identity, outlaw marks, and the allow rule are pure and exact', () => {
  assert.equal(pickupCustodyIdentity(null), null);
  assert.equal(pickupCustodyIdentity({ kind: 'ore', amount: 3 }), null, 'ore chips carry no custody');
  assert.deepEqual(
    pickupCustodyIdentity({ salvorClaimedBy: SALVOR_RECORD_ID }),
    { ownerId: null, claimantId: SALVOR_RECORD_ID, freight: null },
  );
  const freight = { custodyId: 'c', legalOwnerStableId: 'station_helios' };
  assert.deepEqual(
    pickupCustodyIdentity({ freightCustodyPod: freight }),
    { ownerId: 'station_helios', claimantId: null, freight },
  );
  assert.equal(pickupCustodyIdentity({ cargoIdentity: { ownerId: 42 } }).ownerId, '42');

  assert.equal(isOutlawPickupCollector({ data: { trafficRole: 'express', ai: { lawful: true } } }), false);
  assert.equal(isOutlawPickupCollector({ data: { trafficRole: 'salvor' } }), false);
  assert.equal(isOutlawPickupCollector({ data: { trafficRole: 'scavenger' } }), true);
  assert.equal(isOutlawPickupCollector({ data: { ai: { archetype: 'mine_layer_jackal', encounterRole: 'raider' } } }), true);
  assert.equal(isOutlawPickupCollector({ data: { predationRole: 'raider' } }), true);
  assert.equal(isOutlawPickupCollector({ data: {} }), false);

  const pod = { data: { freightCustodyPod: { custodyId: 'c' }, salvorClaimedBy: SALVOR_RECORD_ID, ownerId: CARRIER_RECORD_ID } };
  const playerId = 1;
  assert.equal(pickupCustodyAllowsCollector(pod, { id: 1, data: {} }, playerId), true, 'player');
  assert.equal(pickupCustodyAllowsCollector(pod, { id: 2, data: { worldRecordId: SALVOR_RECORD_ID } }, playerId), true, 'claimant');
  assert.equal(pickupCustodyAllowsCollector(pod, { id: 3, data: { worldRecordId: CARRIER_RECORD_ID } }, playerId), true, 'owner');
  assert.equal(pickupCustodyAllowsCollector(pod, { id: 4, type: 'drone', ownerId: 3, data: {} }, playerId), false, 'a drone of a stranger');
  assert.equal(pickupCustodyAllowsCollector(pod, { id: 5, type: 'drone', ownerId: CARRIER_RECORD_ID, data: {} }, playerId), true, 'the owner\'s drone');
  assert.equal(pickupCustodyAllowsCollector(pod, { id: 6, data: { trafficRole: 'express', ai: { lawful: true } } }, playerId), false, 'lawful liner');
  assert.equal(pickupCustodyAllowsCollector(pod, null, playerId), false);
  assert.equal(pickupCustodyAllowsCollector({ data: { kind: 'ore' } }, { id: 6, data: { trafficRole: 'express' } }, playerId), true, 'free loot');
});
