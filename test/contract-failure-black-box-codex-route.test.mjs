import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  CONTRACT_FAILURE_BLACK_BOXES,
  CONTRACT_FAILURE_BLACK_BOX_SOURCE_KIND,
  contractFailureBlackBoxRecords,
} from '../src/data/contractFailureBlackBoxes.js';
import { PERSISTENT_CARGO } from '../src/data/narrative.js';
import { save } from '../src/save/saveSystem.js';
import { cargo } from '../src/systems/cargo.js';
import { jettisonImpulse } from '../src/systems/jettisonImpulse.js';
import { missions } from '../src/systems/missions.js';
import { story } from '../src/systems/story.js';

const RECOVERY_CASES = Object.freeze([
  {
    recordId: 'disable_dont_kill',
    method: '_postDisableDontKillBlackBox',
    lossKey: '_disableDontKillLoss',
    loss: { targetName: 'Test Quarry', targetEntityId: 301 },
  },
  {
    recordId: 'wreck_tow',
    method: '_postWreckTowBlackBox',
    lossKey: '_wreckTowLoss',
    loss: { targetName: 'Test Recovery Mule', targetEntityId: 302, killerId: 402 },
  },
  {
    recordId: 'rock_diversion',
    method: '_postRockDiversionRecovery',
    lossKey: '_rockDiversionLoss',
    loss: { encounterId: 'test-rock-impact' },
  },
  {
    recordId: 'atmosphere_rescue',
    method: '_postAtmosphereRescueBlackBox',
    lossKey: '_atmosphereRescueLoss',
    loss: { targetName: 'Test Stricken Hitch', targetEntityId: 303, siteId: 'planet_tethys_anvil' },
  },
  {
    recordId: 'loud_delivery',
    method: '_postLoudDeliveryRecovery',
    lossKey: '_loudDeliveryScanLoss',
    loss: { patrolId: 304 },
  },
  {
    recordId: 'salvage_race',
    method: '_postSalvageRaceRecovery',
    lossKey: '_salvageRaceLoss',
    loss: { targetEntityId: 305, salvorId: 405 },
  },
  {
    recordId: 'escort_the_idiot',
    method: '_postEscortTheIdiotRecovery',
    lossKey: '_escortTheIdiotLoss',
    loss: { targetEntityId: 306, killerId: 406, encounterId: 'test-scenic-raid' },
  },
]);

assert.equal(CONTRACT_FAILURE_BLACK_BOXES.length, 7);
assert.deepEqual(RECOVERY_CASES.map((entry) => entry.recordId),
  CONTRACT_FAILURE_BLACK_BOXES.map((entry) => entry.id));

for (const [index, recoveryCase] of RECOVERY_CASES.entries()) {
  test(`${recoveryCase.recordId} reaches Black Boxes only through its physical follow-up pod`, () => {
    const route = boot(53_510_001 + index);
    try {
      const definition = CONTRACT_FAILURE_BLACK_BOXES[index];
      assert.ok(PERSISTENT_CARGO.some((entry) => entry.id === definition.cargoId
        && entry.name === definition.cargoName));
      const sourceMission = failedSourceMission(recoveryCase, index);
      const offer = route.missions[recoveryCase.method](sourceMission);
      assert.ok(offer, 'the existing failure owner posts its ordinary recovery offer');
      assert.equal(offer.cause.tag, definition.causeTag);
      assert.equal(offer.params.debrisRecovery.sourceMissionId, sourceMission.id);
      assert.deepEqual(contractFailureBlackBoxRecords(route.state.story), []);

      assert.equal(route.missions.acceptMission(offer.id), true);
      enterRecovery(route, offer.id);
      let active = activeRecovery(route, offer.id);
      let pod = recoveryPod(route, active);
      assert.ok(pod && pod.alive !== false && pod.type === 'payload');
      assert.equal(pod.data.recoverableCargoPod, true);
      assert.equal(pod.data.lotSource.sourceKind, CONTRACT_FAILURE_BLACK_BOX_SOURCE_KIND);
      assert.equal(pod.data.lotSource.recordId, definition.id);
      assert.equal(pod.data.lotSource.cargoId, definition.cargoId);
      assert.equal(pod.data.lotSource.causeTag, definition.causeTag);
      assert.equal(pod.data.lotSource.sourceMissionId, sourceMission.id);
      assert.equal(pod.data.lotSource.recoveryOfferId, offer.id);
      assert.deepEqual(contractFailureBlackBoxRecords(route.state.story), [],
        'posting, accepting, and spawning a recorder do not manufacture its account');

      const saveOwner = route.sim.registry.get('save');
      const looseEnvelope = saveOwner.serialize(`plan53-${definition.id}-loose`);
      assert.equal(saveOwner.loadEnvelope(
        structuredClone(looseEnvelope),
        `plan53-${definition.id}-loose`,
      ), true);
      assert.deepEqual(contractFailureBlackBoxRecords(route.state.story), [],
        'Continue with the physical pod still loose earns no account');
      route.bus.emit('sector:enter', { sectorId: sourceMission.destSectorId });
      active = activeRecovery(route, offer.id);
      pod = recoveryPod(route, active);
      assert.ok(pod && pod.alive !== false, 'Continue retains or rematerializes the exact loose pod');
      assert.equal(pod.data.lotSource.provenanceId,
        `contract-failure-recorder:${definition.id}:${sourceMission.id}`);

      recoverPod(route, pod);
      assert.equal(route.state.player.cargo.items.cmdty_salvage_electronics, 1,
        'Cargo accepts the physical electronics before Story projects the account');
      assert.equal(route.state.player.cargo.items[definition.cargoId], 1);
      assert.equal(route.state.missions.receipts.find((entry) => entry.missionId === active.id)?.outcome,
        'completed');
      assert.deepEqual(contractFailureBlackBoxRecords(route.state.story).map((entry) => entry.recordId),
        [definition.id]);
      assert.deepEqual(route.awards, [{
        id: definition.cargoId,
        name: definition.cargoName,
        qty: 1,
        reason: `contract_failure_recorder:${definition.id}`,
      }]);

      route.bus.emit('physics:impact', {
        aId: pod.id,
        bId: route.state.playerId,
        impulse: 8,
        tick: route.state.tick,
      });
      assert.equal(route.state.player.cargo.items[definition.cargoId], 1);
      assert.equal(route.awards.length, 1, 'the physical receipt projects exactly once');

      const recoveredEnvelope = saveOwner.serialize(`plan53-${definition.id}-recovered`);
      assert.equal(saveOwner.loadEnvelope(
        structuredClone(recoveredEnvelope),
        `plan53-${definition.id}-recovered`,
      ), true);
      assert.equal(route.state.player.cargo.items[definition.cargoId], 1);
      assert.deepEqual(contractFailureBlackBoxRecords(route.state.story).map((entry) => entry.recordId),
        [definition.id]);
    } finally {
      route.sim.dispose();
    }
  });
}

test('generic salvage electronics and malformed recorder provenance unlock no Plan 51 account', () => {
  const route = boot(53_510_010);
  try {
    route.bus.emit('pickup:collected', {
      collectorId: route.state.playerId,
      kind: 'cargo',
      commodityId: 'cmdty_salvage_electronics',
      amount: 1,
    });
    route.bus.emit('loot:collected', {
      kind: 'cargo',
      commodityId: 'cmdty_salvage_electronics',
      amount: 1,
      lotSource: {
        provenanceId: 'contract-failure-recorder:disable_dont_kill:forged',
        sourceKind: CONTRACT_FAILURE_BLACK_BOX_SOURCE_KIND,
        recordId: 'disable_dont_kill',
        cargoId: 'codex_contract_recorder:disable_dont_kill',
        causeTag: 'wrong_cause',
        sourceMissionId: 'forged',
        recoveryOfferId: 'forged',
      },
    });
    assert.equal(route.state.player.cargo.items.cmdty_salvage_electronics, 1);
    assert.deepEqual(contractFailureBlackBoxRecords(route.state.story), []);
    assert.equal(route.awards.length, 0);
  } finally {
    route.sim.dispose();
  }
});

function boot(seed) {
  const systems = [cargo, jettisonImpulse, missions, story, save];
  const sim = createSimulation({ seed, systems, updateOrder: systems });
  const { state, bus } = sim;
  state.settings.gameplay.tutorialHints = false;
  state.mode = 'station';
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.cargo.capVolume = 100;
  state.player.cargo.capMass = 1e9;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    flags: { persistent: true }, data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  const awards = [];
  bus.on('story:persistentCargoAwarded', (payload) => awards.push(structuredClone(payload)));
  return { sim, state, bus, awards, missions: sim.registry.get('missions') };
}

function failedSourceMission(recoveryCase, index) {
  return {
    id: `plan51-source-${recoveryCase.recordId}`,
    sourceOfferId: `plan51-offer-${recoveryCase.recordId}`,
    stationId: 'station_helios',
    factionId: 'faction_scn',
    reward_cr: 1000,
    riskTier: 2,
    acceptedAt_s: 0,
    deadline_s: 900,
    destSectorId: 'sector_helios_prime',
    distance: 1,
    [recoveryCase.lossKey]: {
      sectorId: 'sector_helios_prime',
      pos: { x: 60 + index * 4, z: 20 },
      vel: { x: 2, z: -1 },
      ...recoveryCase.loss,
    },
  };
}

function enterRecovery(route, offerId) {
  route.state.mode = 'flight';
  route.state.ui.docked = false;
  route.state.ui.dockedStationId = null;
  route.state.world.currentSectorId = 'sector_helios_prime';
  route.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  assert.ok(activeRecovery(route, offerId));
}

function activeRecovery(route, offerId) {
  return route.state.missions.active.find((entry) => entry.sourceOfferId === offerId) || null;
}

function recoveryPod(route, mission) {
  if (!mission) return null;
  return (mission.targetEntityIds || [])
    .map((id) => route.state.entities.get(id))
    .find((entity) => entity && entity.alive !== false) || route.state.entityList.find((entity) => (
    entity && entity.alive !== false && entity.data?.missionId === mission.id
      && entity.data?.lotSource?.recoveryOfferId === mission.sourceOfferId
  )) || null;
}

function recoverPod(route, pod) {
  const player = route.state.entities.get(route.state.playerId);
  pod.pos.x = player.pos.x + player.radius + pod.radius;
  pod.pos.z = player.pos.z;
  pod.vel.x = player.vel.x;
  pod.vel.z = player.vel.z;
  route.bus.emit('physics:impact', {
    aId: pod.id,
    bId: player.id,
    impulse: 8,
    tick: route.state.tick,
  });
  assert.equal(pod.alive, false);
}
