import assert from 'node:assert/strict';
import test from 'node:test';

import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import {
  DEBRIS_RECOVERY_FOLLOWUP_SOURCE,
  ROCK_DIVERSION_VARIANT_ID,
} from '../src/data/missionVariants.js';
import { cargo } from '../src/systems/cargo.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { jettisonImpulse } from '../src/systems/jettisonImpulse.js';
import { missions } from '../src/systems/missions.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

const BOARD_STATION_ID = 'station_helios';
const BOARD_SECTOR_ID = 'sector_helios_prime';
const FALLING_ROCK_SHAPE_ID = 'event_falling_rock';

function collect(bus, names) {
  const rows = Object.fromEntries(names.map((name) => [name, []]));
  for (const name of names) bus.on(name, (payload) => rows[name].push(structuredClone(payload)));
  return rows;
}

async function makeHarness(seed) {
  const systems = [
    impulseCharges,
    physics,
    encounterDirector,
    jettisonImpulse,
    cargo,
    missions,
  ];
  const updateOrder = [impulseCharges, physics, encounterDirector, missions];
  const sim = createSimulation({ seed, systems, updateOrder });
  const { state, bus } = sim;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.tutorialHints = false;
  state.mode = 'station';
  state.world.currentSectorId = BOARD_SECTOR_ID;
  state.ui.docked = true;
  state.ui.dockedStationId = BOARD_STATION_ID;
  state.player.credits = 100000;
  state.player.cargo.capVolume = 500;
  state.player.cargo.capMass = 500;
  state.factions.faction_scn = { rep: 100 };

  const player = sim.spawn(makeShipEntitySpec('ship_bastion', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 230, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;
  state.player.targetId = null;
  state.input.actions = {};
  state.input.aimWorld = null;

  const physicsOwner = sim.registry.get('physics');
  assert.equal(await physicsOwner.prepareBackend(state, { reset: true }), true);
  assert.equal(state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');
  const events = collect(bus, [
    'charge:stuck',
    'charge:detonated',
    'physics:impact',
    'encounter:resolved',
    'mission:completed',
    'mission:failed',
    'cargo:podRecovered',
  ]);
  return {
    sim,
    state,
    bus,
    player,
    events,
    missions: sim.registry.get('missions'),
    physicsOwner,
  };
}

function rockOffer(harness) {
  return harness.missions.ensureBoard(BOARD_STATION_ID).slots.find((offer) => (
    offer && offer.variantId === ROCK_DIVERSION_VARIANT_ID
  ));
}

function findRockSeed() {
  for (let seed = 1; seed <= 1024; seed++) {
    const sim = createSimulation({ seed, systems: [missions], updateOrder: [] });
    const state = sim.state;
    state.settings.gameplay.tutorialHints = false;
    state.mode = 'station';
    state.world.currentSectorId = BOARD_SECTOR_ID;
    state.ui.docked = true;
    state.ui.dockedStationId = BOARD_STATION_ID;
    state.factions.faction_scn = { rep: 100 };
    const offer = sim.registry.get('missions').ensureBoard(BOARD_STATION_ID).slots.find((row) => (
      row && row.variantId === ROCK_DIVERSION_VARIANT_ID
    ));
    sim.dispose();
    if (offer) return seed;
  }
  throw new Error('bounded ordinary Helios boards produced no Rock Diversion offer');
}

function activeRock(harness) {
  return harness.state.missions.active.find((mission) => (
    mission && mission.variantId === ROCK_DIVERSION_VARIANT_ID
  ));
}

function activeRockEncounter(harness) {
  const mission = activeRock(harness);
  const encounterId = mission && mission.params.rockDiversion.encounterId;
  return encounterId && harness.state.encounterDirector.live[encounterId] || null;
}

function runUntil(harness, predicate, maxTicks) {
  for (let tick = 0; tick < maxTicks; tick++) {
    if (predicate()) return true;
    harness.sim.step(SIM_DT);
  }
  return predicate();
}

function physicalPair(payload, firstId, secondId) {
  return !!payload && ((payload.aId === firstId && payload.bId === secondId)
    || (payload.aId === secondId && payload.bId === firstId));
}

function enterRockContract(harness, offer) {
  assert.equal(harness.missions.acceptMission(offer.id), true);
  const mission = activeRock(harness);
  assert.ok(mission);
  harness.state.mode = 'flight';
  harness.state.ui.docked = false;
  harness.state.ui.dockedStationId = null;
  harness.state.world.currentSectorId = mission.destSectorId;
  harness.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  const live = activeRockEncounter(harness);
  assert.ok(live && live.shapeId === FALLING_ROCK_SHAPE_ID);
  assert.equal(live.phase, 'warning');
  return mission;
}

function revealRock(harness) {
  assert.equal(runUntil(harness, () => {
    const live = activeRockEncounter(harness);
    return live && live.phase === 'physical' && live.data.rockId != null;
  }, 450), true);
  const live = activeRockEncounter(harness);
  const rock = harness.state.entities.get(live.data.rockId);
  assert.ok(rock && rock.alive !== false && rock.type === 'asteroid');
  assert.equal(rock.physicsBody.dynamic, true);
  assert.equal(isAttachable(rock, harness.player.id), true);
  return { live, rock };
}

function solveWithCharges(harness) {
  const { live, rock } = revealRock(harness);
  harness.state.player.cargo.items.cmdty_impulse_charge = 3;
  harness.state.player.cargo.usedVolume = 6;
  harness.state.player.cargo.usedMass = 6;
  harness.player.rot = 0;
  harness.state.input.aimWorld = rock.pos;
  for (let count = 0; count < 3; count++) {
    harness.state.input.actions.chargeThrow = true;
    harness.sim.step(SIM_DT);
    assert.equal(runUntil(harness, () => (
      harness.events['charge:stuck'].filter((row) => row.hostId === rock.id).length > count
    ), 180), true);
    if (count < 2) {
      assert.equal(runUntil(harness, () => (
        (harness.player.data.impulseCharges && harness.player.data.impulseCharges.throwCdT || 0) <= 0
      ), 420), true);
      harness.state.input.aimWorld = rock.pos;
    }
  }
  harness.state.input.actions.chargeDetonate = true;
  harness.sim.step(SIM_DT);
  assert.equal(runUntil(harness, () => (
    harness.events['mission:completed'].some((row) => row.missionId != null)
  ), 180), true);
  assert.ok(harness.events['charge:detonated'].length >= 3);
  const station = harness.state.entities.get(live.data.stationId);
  const dx = rock.pos.x - station.pos.x;
  const dz = rock.pos.z - station.pos.z;
  const distance = Math.hypot(dx, dz) || 1;
  const outwardSpeed = (rock.vel.x * dx + rock.vel.z * dz) / distance;
  assert.ok(outwardSpeed >= 3, 'the shipped Rapier/charge route turns the exact contracted rock');
}

function impactFollowups(state) {
  return Object.values(state.missions.boards || {}).flatMap((board) => board && board.slots || [])
    .filter((offer) => offer && offer.source === DEBRIS_RECOVERY_FOLLOWUP_SOURCE
      && offer.cause && offer.cause.tag === 'rock_diversion_impact');
}

function recoverFollowupPod(harness, offer) {
  assert.equal(harness.missions.acceptMission(offer.id), true);
  const mission = harness.state.missions.active.find((row) => row.sourceOfferId === offer.id);
  assert.ok(mission);
  harness.state.mode = 'flight';
  harness.state.ui.docked = false;
  harness.state.ui.dockedStationId = null;
  harness.state.world.currentSectorId = mission.destSectorId;
  harness.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  assert.equal(mission.targetEntityIds.length, 1);
  const pod = harness.state.entities.get(mission.targetEntityIds[0]);
  assert.ok(pod && pod.alive !== false && pod.type === 'payload');
  assert.equal(pod.physicsBody.dynamic, true);
  assert.equal(pod.data.recoverableCargoPod, true);
  assert.equal(isAttachable(pod, harness.player.id), true);
  assert.ok(Math.hypot(pod.vel.x, pod.vel.z) > 0);
  pod.pos.x = harness.player.pos.x + harness.player.radius + pod.radius;
  pod.pos.z = harness.player.pos.z;
  pod.vel = { ...harness.player.vel };
  harness.bus.emit('physics:impact', {
    aId: pod.id,
    bId: harness.player.id,
    impulse: 8,
    tick: harness.state.tick,
  });
  assert.equal(harness.events['cargo:podRecovered'].length, 1);
  assert.equal(harness.state.missions.receipts.find((row) => row.missionId === mission.id)?.outcome,
    'completed');
}

test('ordinary Rock Diversion survives Continue, turns through real charges, and impact leaves one recoverable recorder', async (t) => {
  const previousImpulseFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previousImpulseFlag; });
  const seed = findRockSeed();
  const offered = await makeHarness(seed);
  const replay = await makeHarness(seed);
  t.after(() => {
    offered.physicsOwner._disableSg02DynamicAuthority?.();
    replay.physicsOwner._disableSg02DynamicAuthority?.();
    offered.sim.dispose();
    replay.sim.dispose();
  });

  const offer = rockOffer(offered);
  const replayOffer = rockOffer(replay);
  assert.ok(offer, 'ordinary Contracts board exposes Rock Diversion before acceptance');
  assert.equal(offer.id, replayOffer.id);
  assert.equal(offer.title, replayOffer.title);
  assert.match(offer.title, /^Rock Diversion — Collision Course near /);
  assert.match(offer.brief, /falling rock.*burn line.*charges.*mass-driver.*Massline/i);

  const preContinueMission = enterRockContract(offered, offer);
  offered.sim.runTicks(120);
  const savedActive = structuredClone(offered.missions.serialize());
  const encounterId = preContinueMission.params.rockDiversion.encounterId;

  const resumed = await makeHarness(seed);
  t.after(() => {
    resumed.physicsOwner._disableSg02DynamicAuthority?.();
    resumed.sim.dispose();
  });
  resumed.missions.deserialize(savedActive);
  const resumedMission = activeRock(resumed);
  assert.ok(resumedMission);
  assert.equal(resumedMission.params.rockDiversion.encounterId, encounterId);
  resumed.state.mode = 'flight';
  resumed.state.ui.docked = false;
  resumed.state.ui.dockedStationId = null;
  resumed.state.world.currentSectorId = resumedMission.destSectorId;
  resumed.bus.emit('sector:enter', { sectorId: resumedMission.destSectorId });
  assert.equal(activeRockEncounter(resumed)?.id, encounterId,
    'Continue re-requests the same deterministic physical event instead of fabricating success');
  solveWithCharges(resumed);
  assert.equal(resumed.state.missions.receipts.find((row) => row.missionId === resumedMission.id)?.outcome,
    'completed');
  assert.equal(impactFollowups(resumed.state).length, 0);

  const failed = await makeHarness(seed);
  t.after(() => {
    failed.physicsOwner._disableSg02DynamicAuthority?.();
    failed.sim.dispose();
  });
  const failedMission = enterRockContract(failed, rockOffer(failed));
  const failureBodies = revealRock(failed);
  const stationId = failureBodies.live.data.stationId;
  assert.equal(runUntil(failed, () => failed.events['mission:failed'].length === 1, 3000), true);
  assert.equal(failed.events['mission:failed'][0].reason, 'rock_hit_station');
  assert.ok(failed.events['physics:impact'].some((row) => (
    physicalPair(row, failureBodies.rock.id, stationId)
  )), 'the authored failure begins at a real Rapier rock/station contact');
  assert.equal(failed.state.entityList.filter((entity) => (
    entity && entity.alive !== false && entity.data && entity.data.setpieceDebris === 'falling_rock_impact'
  )).length, 6);
  assert.equal(impactFollowups(failed.state).length, 1);
  failed.bus.emit('encounter:resolved', {
    encounterId: failedMission.params.rockDiversion.encounterId,
    shape: FALLING_ROCK_SHAPE_ID,
    outcome: 'rock_hit_station',
  });
  assert.equal(impactFollowups(failed.state).length, 1, 'replayed receipts cannot duplicate the follow-on');

  const failedSave = structuredClone(failed.missions.serialize());
  const continuedRecovery = await makeHarness(seed);
  t.after(() => {
    continuedRecovery.physicsOwner._disableSg02DynamicAuthority?.();
    continuedRecovery.sim.dispose();
  });
  continuedRecovery.missions.deserialize(failedSave);
  const followups = impactFollowups(continuedRecovery.state);
  assert.equal(followups.length, 1, 'the physical consequence survives Continue on its ordinary board');
  recoverFollowupPod(continuedRecovery, followups[0]);
});
