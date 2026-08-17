import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { MEMORIAL_FIELD } from '../src/data/memorialFieldLandmark.js';
import { frontierRumorOffer } from '../src/data/frontierRumors.js';
import { save } from '../src/save/saveSystem.js';
import { isCausalSurvivorPod, survivorPod } from '../src/systems/survivorPod.js';
import { world } from '../src/systems/world.js';

function liveBy(state, predicate) {
  return state.entityList.filter((entity) => entity && entity.alive !== false && predicate(entity));
}

function boot(seed = 2507) {
  const sim = createSimulation({
    seed,
    systems: [world, survivorPod, save],
    updateOrder: [world, survivorPod],
  });
  const { state, bus } = sim;
  state.mode = 'station';
  state.player.credits = 20_000;
  state.ui.docked = true;
  state.ui.dockedStationId = MEMORIAL_FIELD.sourceStationId;
  const charges = [];
  const rescues = [];
  const reputation = [];
  bus.on('economy:chargeCredits', (payload) => {
    charges.push(payload);
    state.player.credits -= payload.amount;
  });
  bus.on('survivorPod:rescued', (payload) => rescues.push(payload));
  bus.on('faction:repDelta', (payload) => reputation.push(payload));
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'player', pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 8, hull: 100, hullMax: 100, flags: {},
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  return { sim, state, bus, charges, rescues, reputation };
}

test('Coalition sells one approximate Memorial Field lead to the admitted physical Candle Fleet', () => {
  const route = boot();
  try {
    const offer = frontierRumorOffer(route.state, MEMORIAL_FIELD.sourceStationId);
    assert.ok(offer, 'the ordinary Coalition bar has the survivor watch log');
    assert.equal(offer.id, MEMORIAL_FIELD.rumorId);
    assert.equal(offer.targetId, MEMORIAL_FIELD.poiId);
    assert.equal(offer.targetPlaceKind, 'poi');
    assert.equal(offer.kind, 'cache');
    assert.equal(Object.hasOwn(offer, 'targetPos'), false, 'the rumor remains a search circle, not a waypoint');

    const beforeCredits = route.state.player.credits;
    route.bus.emit('ui:purchaseFrontierRumor', {
      rumorId: offer.id,
      stationId: MEMORIAL_FIELD.sourceStationId,
    });
    assert.equal(route.charges.length, 1);
    assert.equal(route.state.player.credits, beforeCredits - offer.price);
    assert.equal(route.state.world.frontierRumors.byId[offer.id].phase, 'rumored');

    route.state.mode = 'flight';
    route.state.ui.docked = false;
    route.state.ui.dockedStationId = null;
    route.sim.registry.get('world').enterSector(MEMORIAL_FIELD.sectorId, { placePlayer: false });
    const memorials = liveBy(route.state, (entity) => entity.data?.poiId === MEMORIAL_FIELD.poiId);
    assert.equal(memorials.length, 1);
    assert.equal(memorials[0].data.landmarkGlb, MEMORIAL_FIELD.landmarkGlb);
    assert.equal(memorials[0].type, 'fx', 'World retains the quiet non-combat landmark carrier');
  } finally {
    route.sim.dispose();
  }
});

test('reaching the lanterns reveals one physical SurvivorPod that Continue preserves and lawful custody resolves', () => {
  const route = boot(2519);
  try {
    const offer = frontierRumorOffer(route.state, MEMORIAL_FIELD.sourceStationId);
    route.bus.emit('ui:purchaseFrontierRumor', {
      rumorId: offer.id,
      stationId: MEMORIAL_FIELD.sourceStationId,
    });
    route.state.mode = 'flight';
    route.state.ui.docked = false;
    route.state.ui.dockedStationId = null;
    const worldOwner = route.sim.registry.get('world');
    const podOwner = route.sim.registry.get('survivorPod');
    worldOwner.enterSector(MEMORIAL_FIELD.sectorId, { placePlayer: false });

    let player = route.state.entities.get(route.state.playerId);
    const memorial = liveBy(route.state, (entity) => entity.data?.poiId === MEMORIAL_FIELD.poiId)[0];
    player.pos.x = memorial.pos.x;
    player.pos.z = memorial.pos.z;
    podOwner.update(1 / 60, route.state);

    let pods = liveBy(route.state, isCausalSurvivorPod);
    assert.equal(pods.length, 1, 'arrival produces one real physical survivor payload');
    let pod = pods[0];
    assert.equal(pod.collides, true);
    assert.ok(pod.mass > 0 && pod.radius > 0, 'the pod enters ordinary collision/physics ownership');
    assert.equal(pod.data.masslineTetherable, true);
    assert.equal(pod.data.survivorPodCausal.source, MEMORIAL_FIELD.podSource);
    assert.equal(pod.data.survivorPodCausal.memoryId, MEMORIAL_FIELD.memoryId);
    assert.equal(route.state.world.frontierRumors.byId[offer.id].phase, 'resolved');

    const saveOwner = route.sim.registry.get('save');
    const envelope = saveOwner.serialize('plan25-memorial-field');
    assert.equal(saveOwner.loadEnvelope(structuredClone(envelope), 'plan25-memorial-field'), true);
    player = route.state.entities.get(route.state.playerId);
    podOwner.update(1 / 60, route.state);
    pods = liveBy(route.state, isCausalSurvivorPod);
    assert.equal(pods.length, 1, 'Continue restores exactly the same unresolved physical custody');
    pod = pods[0];
    assert.equal(route.state.survivorPod.causal.byEntityId[pod.id]?.memoryId, MEMORIAL_FIELD.memoryId,
      'the existing owner re-adopts the restored pod instead of spawning a second one');

    const station = liveBy(route.state, (entity) => entity.type === 'station'
      && entity.data?.stationId === 'station_helios')[0];
    assert.ok(station, 'ordinary Helios re-entry materializes lawful rescue custody');
    player.pos.x = station.pos.x;
    player.pos.z = station.pos.z;
    pod.pos.x = station.pos.x;
    pod.pos.z = station.pos.z;
    route.state.player.tether = { active: true, targetId: pod.id, attachmentId: 'massline:memorial-rescue' };
    route.bus.emit('tether:latched', {
      ownerId: player.id,
      targetId: pod.id,
      attachmentId: 'massline:memorial-rescue',
    });
    assert.equal(route.rescues.length, 1);
    assert.equal(route.rescues[0].source, MEMORIAL_FIELD.podSource);
    assert.ok(route.reputation.some((entry) => entry.reason === 'survivorPod:rescued' && entry.delta > 0));
    assert.equal(liveBy(route.state, isCausalSurvivorPod).length, 0);

    const finalEnvelope = saveOwner.serialize('plan25-memorial-field-rescued');
    assert.equal(saveOwner.loadEnvelope(structuredClone(finalEnvelope), 'plan25-memorial-field-rescued'), true);
    route.sim.registry.get('survivorPod').update(1 / 60, route.state);
    assert.equal(liveBy(route.state, isCausalSurvivorPod).length, 0,
      'durable moral memory prevents the rescued life from being manufactured again');
  } finally {
    route.sim.dispose();
  }
});
