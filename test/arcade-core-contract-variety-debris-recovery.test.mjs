import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  DEBRIS_RECOVERY_FOLLOWUP_SOURCE,
  DEBRIS_RECOVERY_VARIANT_ID,
} from '../src/data/missionVariants.js';
import { cargo } from '../src/systems/cargo.js';
import { jettisonImpulse } from '../src/systems/jettisonImpulse.js';
import { missions } from '../src/systems/missions.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

const BOARD_STATION_ID = 'station_helios';
const BOARD_SECTOR_ID = 'sector_helios_prime';

function makeHarness(seed) {
  const sim = createSimulation({
    seed,
    systems: [jettisonImpulse, cargo, missions],
    updateOrder: [jettisonImpulse, cargo, missions],
  });
  const { state } = sim;
  state.settings.gameplay.tutorialHints = false;
  state.mode = 'station';
  state.world.currentSectorId = BOARD_SECTOR_ID;
  state.ui.docked = true;
  state.ui.dockedStationId = BOARD_STATION_ID;
  state.player.credits = 100000;
  state.player.cargo.capVolume = 500;
  state.player.cargo.capMass = 500;
  const player = sim.spawn({
    type: 'ship', isPlayer: true, team: 0, factionId: 'faction_free',
    pos: { x: 30, z: -20 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 8, mass: 20, hull: 100, hullMax: 100, collides: true, data: {},
  });
  state.playerId = player.id;
  return { sim, state, bus: sim.bus, player, missions: sim.registry.get('missions') };
}

function debrisOffer(harness) {
  return harness.missions.ensureBoard(BOARD_STATION_ID).slots.find((offer) => (
    offer && offer.variantId === DEBRIS_RECOVERY_VARIANT_ID
      && offer.source !== DEBRIS_RECOVERY_FOLLOWUP_SOURCE
  ));
}

function findDebrisSeed() {
  for (let seed = 1; seed <= 128; seed++) {
    const harness = makeHarness(seed);
    const offer = debrisOffer(harness);
    harness.sim.dispose();
    if (offer) return seed;
  }
  throw new Error('bounded ordinary Helios boards produced no Debris Recovery offer');
}

function enterTargetSector(harness, mission) {
  harness.state.mode = 'flight';
  harness.state.ui.docked = false;
  harness.state.ui.dockedStationId = null;
  harness.state.world.currentSectorId = mission.destSectorId;
  harness.bus.emit('sector:enter', { sectorId: mission.destSectorId });
}

function followups(state) {
  return Object.values(state.missions.boards || {}).flatMap((board) => board && board.slots || [])
    .filter((offer) => offer && offer.source === DEBRIS_RECOVERY_FOLLOWUP_SOURCE);
}

function physicalPods(harness, mission) {
  assert.equal(mission.targetEntityIds.length, mission.objectiveTarget);
  return mission.targetEntityIds.map((id) => {
    const pod = harness.state.entities.get(id);
    assert.ok(pod && pod.alive !== false);
    assert.equal(pod.type, 'payload');
    assert.equal(pod.physicsBody.dynamic, true);
    assert.equal(pod.data.recoverableCargoPod, true);
    assert.equal(pod.data.debrisRecovery, true);
    assert.equal(pod.data.missionTag, mission.id);
    assert.equal(isAttachable(pod, harness.player.id), true, 'each pod is a real Massline target');
    assert.ok(Math.hypot(pod.vel.x, pod.vel.z) > 0, 'the field is physically moving');
    return pod;
  });
}

function recoverByContact(harness, pod) {
  pod.pos.x = harness.player.pos.x + harness.player.radius + pod.radius;
  pod.pos.z = harness.player.pos.z;
  pod.vel.x = harness.player.vel.x;
  pod.vel.z = harness.player.vel.z;
  harness.bus.emit('physics:impact', {
    aId: pod.id,
    bId: harness.player.id,
    impulse: 8,
    tick: harness.state.tick,
  });
  assert.equal(pod.alive, false, 'physical contact hands the complete pod to cargo');
}

test('ordinary Debris Recovery pulls multiple moving pods and a destroyed pod leaves one fragment sweep', (t) => {
  const seed = findDebrisSeed();
  const success = makeHarness(seed);
  const replay = makeHarness(seed);
  t.after(() => { success.sim.dispose(); replay.sim.dispose(); });

  const offer = debrisOffer(success);
  const deterministicReplay = debrisOffer(replay);
  assert.ok(offer, 'ordinary Contracts board exposes Debris Recovery before acceptance');
  assert.equal(offer.id, deterministicReplay.id);
  assert.equal(offer.title, deterministicReplay.title);
  assert.match(offer.title, /^Debris Recovery — [23] Tumbling Pods near /);
  assert.match(offer.brief, /specific pods from a tumbling debris field/i);
  assert.equal(offer.destStationId, null, 'the physical field, not a dock turn-in, is the objective');
  assert.ok(offer.duration_s > 0);

  assert.equal(success.missions.acceptMission(offer.id), true);
  const recovery = success.state.missions.active.find((row) => row.variantId === DEBRIS_RECOVERY_VARIANT_ID);
  enterTargetSector(success, recovery);
  const pods = physicalPods(success, recovery);
  const expectedUnits = pods.reduce((sum, pod) => sum + pod.data.amount, 0);
  for (const pod of pods) recoverByContact(success, pod);

  assert.equal(success.state.missions.active.some((row) => row.id === recovery.id), false);
  assert.equal(success.state.missions.receipts.find((row) => row.missionId === recovery.id)?.outcome, 'completed');
  assert.equal(success.state.player.cargo.items[offer.params.cmdtyId], expectedUnits,
    'cargo remains the only inventory writer for every recovered pod');
  assert.equal(followups(success.state).length, 0);

  const failed = makeHarness(seed);
  t.after(() => failed.sim.dispose());
  const failedOffer = debrisOffer(failed);
  assert.equal(failed.missions.acceptMission(failedOffer.id), true);
  const doomed = failed.state.missions.active.find((row) => row.variantId === DEBRIS_RECOVERY_VARIANT_ID);
  enterTargetSector(failed, doomed);
  const doomedPods = physicalPods(failed, doomed);
  const originalUnits = doomedPods.reduce((sum, pod) => sum + pod.data.amount, 0);
  const destroyed = doomedPods[0];
  const obstacle = failed.sim.spawn({
    type: 'drone', team: 2, pos: { x: destroyed.pos.x, z: destroyed.pos.z },
    vel: { x: 0, z: 0 }, radius: 10, mass: 80, hull: 100, hullMax: 100, data: {},
  });
  const strikes = [];
  failed.bus.on('cargo:podStrike', (payload) => strikes.push(payload));
  failed.bus.emit('physics:impact', {
    aId: destroyed.id,
    bId: obstacle.id,
    impulse: 140,
    tick: failed.state.tick,
  });

  assert.equal(strikes.length, 1, 'the physical pod owner publishes one hard-contact loss receipt');
  assert.equal(destroyed.alive, false, 'mission target cleanup retires the physically lost pod');
  assert.equal(failed.state.missions.active.some((row) => row.id === doomed.id), false);
  const failedReceipt = failed.state.missions.receipts.find((row) => row.missionId === doomed.id);
  assert.equal(failedReceipt?.outcome, 'failed');
  assert.equal(failedReceipt?.reason, 'recovery_pod_destroyed');
  assert.equal(followups(failed.state).length, 1);
  const fragmentOffer = followups(failed.state)[0];
  assert.match(fragmentOffer.title, /^Debris Recovery — Fragment Sweep near /);
  assert.equal(fragmentOffer.params.debrisRecovery.generation, 1);
  assert.ok(fragmentOffer.params.debrisRecovery.pods.length > doomedPods.length,
    'the destroyed field mutates into more physical fragments without duplicating units');
  assert.equal(fragmentOffer.params.debrisRecovery.pods.reduce((sum, pod) => sum + pod.amount, 0), originalUnits);

  const saved = structuredClone(failed.missions.serialize());
  const restored = makeHarness(seed);
  t.after(() => restored.sim.dispose());
  restored.missions.deserialize(saved);
  restored.state.simTime += 1200;
  restored.missions.ensureBoard(BOARD_STATION_ID);
  assert.equal(followups(restored.state).length, 1,
    'save/load and an ordinary board epoch retain exactly one causal fragment sweep');

  const restoredOffer = followups(restored.state)[0];
  assert.equal(restored.missions.acceptMission(restoredOffer.id), true);
  const fragments = restored.state.missions.active.find((row) => (
    row.source === DEBRIS_RECOVERY_FOLLOWUP_SOURCE
  ));
  enterTargetSector(restored, fragments);
  const fragmentPods = physicalPods(restored, fragments);
  for (const pod of fragmentPods) recoverByContact(restored, pod);

  assert.equal(restored.state.missions.receipts.find((row) => row.missionId === fragments.id)?.outcome, 'completed');
  assert.equal(followups(restored.state).length, 0,
    'the accepted fragment sweep leaves the board and cannot recurse');
});
