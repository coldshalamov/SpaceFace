import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  QUIET_DELIVERY_RECOVERY_SOURCE,
  QUIET_DELIVERY_TERM_IDS,
  QUIET_DELIVERY_VARIANT_ID,
} from '../src/data/missionVariants.js';
import { cargo } from '../src/systems/cargo.js';
import { contractClausesSystem } from '../src/systems/contractClauses.js';
import { fragileCargo } from '../src/systems/fragileCargo.js';
import { jettisonImpulse } from '../src/systems/jettisonImpulse.js';
import { missions } from '../src/systems/missions.js';

const BOARD_STATION_ID = 'station_helios';
const SYSTEMS = [jettisonImpulse, cargo, fragileCargo, missions, contractClausesSystem];
const UPDATE_ORDER = [jettisonImpulse, cargo, missions];

function makeHarness(seed = 1) {
  const sim = createSimulation({ seed, systems: SYSTEMS, updateOrder: UPDATE_ORDER });
  const { state } = sim;
  state.settings.gameplay.tutorialHints = false;
  state.mode = 'station';
  state.world.currentSectorId = 'sector_helios_prime';
  state.ui.docked = true;
  state.ui.dockedStationId = BOARD_STATION_ID;
  state.player.credits = 100000;
  state.player.cargo.capVolume = 500;
  state.player.cargo.capMass = 500;
  const player = sim.spawn({
    type: 'ship',
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 40, z: -25 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 18,
    hull: 100,
    hullMax: 100,
    collides: true,
    data: {},
  });
  state.playerId = player.id;
  return { sim, state, bus: sim.bus, player, missions: sim.registry.get('missions') };
}

function quietOffer(harness) {
  const board = harness.missions.ensureBoard(BOARD_STATION_ID);
  return board.slots.find((offer) => offer && offer.variantId === QUIET_DELIVERY_VARIANT_ID);
}

function recoveryOffers(state) {
  return Object.values(state.missions.boards || {}).flatMap((board) => board && board.slots || [])
    .filter((offer) => offer && offer.source === QUIET_DELIVERY_RECOVERY_SOURCE);
}

test('ordinary board names a deterministic Quiet Delivery and a gentle delivery honors both physical terms', (t) => {
  const first = makeHarness();
  const second = makeHarness();
  t.after(() => { first.sim.dispose(); second.sim.dispose(); });

  const offer = quietOffer(first);
  const replay = quietOffer(second);
  assert.ok(offer, 'seeded ordinary Helios board contains the variant');
  assert.equal(offer.id, replay.id);
  assert.equal(offer.title, replay.title);
  assert.match(offer.title, /^Quiet Delivery — Haul /);
  assert.equal(offer.type, 'cargo_delivery');
  assert.equal(offer.preloadedCargo, true);
  assert.deepEqual(offer.clauses.map((row) => row.conditionId), QUIET_DELIVERY_TERM_IDS);
  assert.match(offer.brief, /Hold under 40 wu\/s\./);
  assert.match(offer.brief, /Do not crack the freight\./);

  assert.equal(first.missions.acceptMission(offer.id), true);
  const active = first.state.missions.active.find((mission) => mission.variantId === QUIET_DELIVERY_VARIANT_ID);
  assert.ok(active);
  assert.equal(first.state.player.cargo.items[active.params.cmdtyId], active.params.qty,
    'the normal cargo owner loads the sealed fragile manifest');

  first.state.mode = 'flight';
  first.player.vel.x = 20;
  first.sim.runTicks(90, SIM_DT);
  assert.equal(active._clauseState && active._clauseState.steady_hands?.breached, undefined);
  first.state.mode = 'station';
  first.bus.emit('dock:docked', { stationId: active.destStationId });

  assert.equal(first.state.missions.active.some((mission) => mission.id === active.id), false);
  const receipt = first.state.missions.receipts.find((row) => row.missionId === active.id);
  assert.equal(receipt?.outcome, 'completed');
  assert.deepEqual(new Set(receipt.termsHonored), new Set(QUIET_DELIVERY_TERM_IDS));
  assert.equal(recoveryOffers(first.state).length, 0);
});

test('real fragile loss fails once, survives Continue as one debris follow-on, and completes from a physical pod recovery', (t) => {
  const failed = makeHarness();
  t.after(() => failed.sim.dispose());
  const offer = quietOffer(failed);
  assert.ok(offer);
  assert.equal(failed.missions.acceptMission(offer.id), true);
  const mission = failed.state.missions.active.find((row) => row.variantId === QUIET_DELIVERY_VARIANT_ID);
  const cargoBefore = failed.state.player.cargo.items[mission.params.cmdtyId];

  failed.state.mode = 'flight';
  failed.player.vel.x = 64;
  failed.state.simTime = 12;
  failed.bus.emit('physics:impact', {
    playerInvolved: true,
    playerDeltaV: 42,
    simTime: failed.state.simTime,
    tick: failed.state.tick,
    aId: failed.player.id,
    bId: 9001,
    dp: 42,
  });

  assert.ok((failed.state.player.cargo.items[mission.params.cmdtyId] || 0) < cargoBefore,
    'fragileCargo performed a real inventory loss');
  const failedReceipt = failed.state.missions.receipts.find((row) => row.missionId === mission.id);
  assert.equal(failedReceipt?.outcome, 'failed');
  assert.equal(failedReceipt?.reason, 'clause_broken:fragile_intact');
  assert.equal(recoveryOffers(failed.state).length, 1);

  // The board row is ordinary missions state: one mission snapshot/reload keeps exactly one copy.
  const offeredSave = structuredClone(failed.missions.serialize());
  const offeredReload = makeHarness();
  t.after(() => offeredReload.sim.dispose());
  offeredReload.missions.deserialize(offeredSave);
  assert.equal(recoveryOffers(offeredReload.state).length, 1);
  const recoveryOffer = recoveryOffers(offeredReload.state)[0];
  assert.match(recoveryOffer.title, /^Debris Recovery — /);
  assert.equal(offeredReload.missions.acceptMission(recoveryOffer.id), true);

  const recovery = offeredReload.state.missions.active.find((row) => (
    row.source === QUIET_DELIVERY_RECOVERY_SOURCE
  ));
  assert.ok(recovery);
  const firstPod = offeredReload.state.entities.get(recovery.targetEntityIds[0]);
  assert.ok(firstPod);
  assert.equal(firstPod.type, 'payload');
  assert.equal(firstPod.data.recoverableCargoPod, true);
  assert.equal(firstPod.data.missionTag, recovery.id);
  assert.equal(firstPod.physicsBody.dynamic, true);

  // Active objective progress is also ordinary mission state. Continue respawns only unfinished
  // durable slots, then the canonical pod-contact -> pickup -> cargo path closes the follow-on.
  const activeSave = structuredClone(offeredReload.missions.serialize());
  const activeReload = makeHarness();
  t.after(() => activeReload.sim.dispose());
  activeReload.missions.deserialize(activeSave);
  activeReload.bus.emit('save:loaded', {});
  const restored = activeReload.state.missions.active.find((row) => (
    row.source === QUIET_DELIVERY_RECOVERY_SOURCE
  ));
  assert.ok(restored);
  assert.equal(restored.targetEntityIds.length, 1);
  const pod = activeReload.state.entities.get(restored.targetEntityIds[0]);
  assert.ok(pod && pod.alive !== false);
  pod.pos.x = activeReload.player.pos.x + activeReload.player.radius + pod.radius;
  pod.pos.z = activeReload.player.pos.z;
  pod.vel.x = activeReload.player.vel.x;
  pod.vel.z = activeReload.player.vel.z;
  const recoveredQty = pod.data.amount;
  activeReload.bus.emit('physics:impact', {
    aId: pod.id,
    bId: activeReload.player.id,
    impulse: 8,
    tick: activeReload.state.tick,
  });

  assert.equal(pod.alive, false);
  assert.equal(activeReload.state.missions.active.some((row) => row.id === restored.id), false);
  const recoveryReceipt = activeReload.state.missions.receipts.find((row) => row.missionId === restored.id);
  assert.equal(recoveryReceipt?.outcome, 'completed');
  assert.equal(recoveryOffers(activeReload.state).length, 0,
    'the accepted follow-on is removed from the board and never duplicated');
  assert.equal(activeReload.state.player.cargo.items[pod.data.commodityId], recoveredQty);
});
