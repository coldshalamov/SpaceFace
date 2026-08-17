import assert from 'node:assert/strict';
import test from 'node:test';

import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import {
  ATMOSPHERE_RESCUE_DEST_SECTOR_ID,
  ATMOSPHERE_RESCUE_VARIANT_ID,
  DEBRIS_RECOVERY_FOLLOWUP_SOURCE,
} from '../src/data/missionVariants.js';
import { PLANET_FLAGS, PLANET_SITE } from '../src/data/planets.js';
import { ZONE_TETHYS_ANVIL } from '../src/data/authoredPlaces.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { actions } from '../src/systems/actions.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { fields } from '../src/systems/fields.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { jettisonImpulse } from '../src/systems/jettisonImpulse.js';
import { missions } from '../src/systems/missions.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { isAttachable, tetherGameplay } from '../src/systems/tetherGameplay.js';

const BOARD_STATION_ID = 'station_helios';
const BOARD_SECTOR_ID = 'sector_helios_prime';
const CENTRE = sectorLocalToGlobalForSector(
  ZONE_TETHYS_ANVIL.center,
  ATMOSPHERE_RESCUE_DEST_SECTOR_ID,
);

function collect(bus, names) {
  const rows = Object.fromEntries(names.map((name) => [name, []]));
  for (const name of names) bus.on(name, (payload) => rows[name].push(structuredClone(payload)));
  return rows;
}

function primeState(state) {
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
}

function boardOffer(system) {
  return system.ensureBoard(BOARD_STATION_ID).slots.find((offer) => (
    offer && offer.variantId === ATMOSPHERE_RESCUE_VARIANT_ID
  ));
}

function findOfferSeed() {
  for (let seed = 1; seed <= 2048; seed++) {
    const sim = createSimulation({ seed, systems: [missions] });
    primeState(sim.state);
    const offer = boardOffer(sim.registry.get('missions'));
    sim.dispose();
    if (offer) return seed;
  }
  throw new Error('bounded ordinary Helios boards produced no Atmosphere Rescue offer');
}

function makeHarness(seed) {
  const systems = [
    combat,
    actions,
    flightV3,
    fields,
    planetRuntime,
    physics,
    tetherGameplay,
    jettisonImpulse,
    cargo,
    missions,
  ];
  const updateOrder = [
    actions,
    flightV3,
    fields,
    planetRuntime,
    physics,
    combat,
    tetherGameplay,
    jettisonImpulse,
    cargo,
    missions,
  ];
  const sim = createSimulation({ seed, systems, updateOrder });
  const { state, bus } = sim;
  primeState(state);
  const player = sim.spawn(makeShipEntitySpec('ship_mule', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
    rot: Math.PI / 2,
  }));
  state.playerId = player.id;
  const events = collect(bus, [
    'planet:plungeStage',
    'tether:latched',
    'mission:completed',
    'mission:failed',
  ]);
  return {
    sim,
    state,
    bus,
    player,
    events,
    missions: sim.registry.get('missions'),
    physicsOwner: sim.registry.get('physics'),
  };
}

function blackBoxFollowups(state) {
  return Object.values(state.missions.boards || {}).flatMap((board) => board && board.slots || [])
    .filter((offer) => offer && offer.source === DEBRIS_RECOVERY_FOLLOWUP_SOURCE
      && offer.cause && offer.cause.tag === 'atmosphere_rescue_burn_up');
}

async function enterRescue(harness, offer) {
  assert.equal(harness.missions.acceptMission(offer.id), true);
  const mission = harness.state.missions.active.find((row) => (
    row && row.variantId === ATMOSPHERE_RESCUE_VARIANT_ID
  ));
  assert.ok(mission);
  harness.state.mode = 'flight';
  harness.state.ui.docked = false;
  harness.state.ui.dockedStationId = null;
  harness.state.world.currentSectorId = ATMOSPHERE_RESCUE_DEST_SECTOR_ID;
  harness.player.pos.x = CENTRE.x;
  harness.player.pos.z = CENTRE.z + 1220;
  harness.player.vel.x = 0;
  harness.player.vel.z = 0;
  harness.player.rot = Math.PI / 2;
  harness.state.input.actions = {
    tetherFire: false,
    tetherCut: false,
    reelDelta: 0,
    massline: null,
  };
  assert.equal(await harness.physicsOwner.prepareBackend(harness.state, { reset: true }), true);
  harness.bus.emit('sector:enter', { sectorId: ATMOSPHERE_RESCUE_DEST_SECTOR_ID });
  for (let tick = 0; tick < 60 && mission.targetEntityIds.length === 0; tick++) {
    harness.sim.step(SIM_DT);
  }
  assert.equal(harness.state.planet.siteId, PLANET_SITE.id);
  assert.equal(mission.targetEntityIds.length, 1);
  const target = harness.state.entities.get(mission.targetEntityIds[0]);
  assert.ok(target && target.alive !== false && target.type === 'ship');
  assert.equal(target.data.atmosphereRescue.missionId, mission.id);
  assert.equal(target.data.masslineTetherable, true);
  assert.equal(isAttachable(target, harness.player.id), true);
  assert.equal(target.angVel, 2.2);
  assert.ok(Math.hypot(target.vel.x, target.vel.z) > 45);
  return { mission, target };
}

function latchTarget(harness, target) {
  harness.state.input.aimWorld = { x: target.pos.x, z: target.pos.z };
  harness.state.input.aimIntentActive = true;
  harness.state.input.aimAngle = Math.atan2(
    target.pos.z - harness.player.pos.z,
    target.pos.x - harness.player.pos.x,
  );
  harness.sim.step(SIM_DT);
  harness.state.input.actions.tetherFire = true;
  harness.sim.step(SIM_DT);
  harness.state.input.actions.tetherFire = false;
  harness.sim.step(SIM_DT);
  assert.equal(harness.events['tether:latched'].length, 1);
  assert.equal(harness.state.player.tether.targetId, target.id);
}

function recoverBlackBox(harness, mission) {
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
  assert.equal(pod.alive, false);
}

test('ordinary Atmosphere Rescue is won by a real Massline pull and burn-up leaves one black box', async (t) => {
  const priorPlanetFlag = PLANET_FLAGS.enabled;
  const priorFieldFlag = FIELD_FLAGS.enabled;
  PLANET_FLAGS.enabled = true;
  FIELD_FLAGS.enabled = true;
  t.after(() => {
    PLANET_FLAGS.enabled = priorPlanetFlag;
    FIELD_FLAGS.enabled = priorFieldFlag;
  });

  const seed = findOfferSeed();
  const success = makeHarness(seed);
  const replay = makeHarness(seed);
  t.after(() => { success.sim.dispose(); replay.sim.dispose(); });

  const offer = boardOffer(success.missions);
  const replayOffer = boardOffer(replay.missions);
  assert.ok(offer, 'ordinary Contracts board exposes Atmosphere Rescue before acceptance');
  assert.equal(offer.id, replayOffer.id);
  assert.equal(offer.title, replayOffer.title);
  assert.match(offer.title, /^Atmosphere Rescue — Tumbling Ship at The Anvil$/);
  assert.match(offer.brief, /tumbling.*two minutes.*burn line.*Massline.*pull.*clear/i);
  assert.equal(offer.destSectorId, ATMOSPHERE_RESCUE_DEST_SECTOR_ID);
  assert.equal(offer.destStationId, null);

  const live = await enterRescue(success, offer);
  const startRadius = Math.hypot(live.target.pos.x - CENTRE.x, live.target.pos.z - CENTRE.z);
  latchTarget(success, live.target);
  success.state.input.moveZ = 1;
  success.state.input.throttle = 1;
  success.state.input.boost = true;
  success.state.input.actions.massline = { lineControl: true, lineLength: -1, cut: false };
  for (let tick = 0; tick < 20 * 60 && success.events['mission:completed'].length === 0; tick++) {
    success.sim.step(SIM_DT);
  }
  const finishRadius = Math.hypot(live.target.pos.x - CENTRE.x, live.target.pos.z - CENTRE.z);
  assert.equal(success.events['mission:completed'].length, 1);
  assert.ok(success.events['planet:plungeStage'].some((row) => (
    row.id === live.target.id && row.stage === 'clear'
  )), 'PlanetRuntime publishes the exact rescued hull clearing the plunge state');
  assert.ok(finishRadius > PLANET_SITE.bands.danger + PLANET_SITE.hysteresis);
  assert.ok(finishRadius > startRadius + 50, 'Flight + Rapier + Massline materially pull the hull outward');
  assert.equal(success.state.missions.receipts.find((row) => row.missionId === live.mission.id)?.outcome,
    'completed');
  assert.equal(blackBoxFollowups(success.state).length, 0);

  const failed = makeHarness(seed);
  t.after(() => failed.sim.dispose());
  const doomed = await enterRescue(failed, boardOffer(failed.missions));
  failed.state.input.moveZ = 1;
  failed.state.input.throttle = 1;
  failed.state.input.boost = true;
  for (let tick = 0; tick < 20 * 60 && failed.events['mission:failed'].length === 0; tick++) {
    failed.sim.step(SIM_DT);
  }
  assert.equal(doomed.target.alive, false, 'the atmosphere kills through the ordinary hull path');
  assert.ok(failed.events['planet:plungeStage'].some((row) => (
    row.id === doomed.target.id && row.stage === 'aftermath'
  )), 'failure is the exact PlanetRuntime aftermath receipt');
  assert.equal(failed.events['mission:failed'].length, 1);
  assert.equal(failed.state.missions.receipts.find((row) => row.missionId === doomed.mission.id)?.reason,
    'rescue_ship_burned');
  assert.equal(blackBoxFollowups(failed.state).length, 1);

  const saved = structuredClone(failed.missions.serialize());
  const restored = makeHarness(seed);
  t.after(() => restored.sim.dispose());
  restored.missions.deserialize(saved);
  restored.state.simTime += 1200;
  restored.missions.ensureBoard(BOARD_STATION_ID);
  assert.equal(blackBoxFollowups(restored.state).length, 1,
    'Continue and board refresh retain exactly one causal recorder recovery');
  const recoveryOffer = blackBoxFollowups(restored.state)[0];
  assert.match(recoveryOffer.title, /^Black Box Recovery — Stricken Hitch$/);
  assert.equal(recoveryOffer.params.debrisRecovery.pods.length, 1);
  assert.equal(restored.missions.acceptMission(recoveryOffer.id), true);
  const recovery = restored.state.missions.active.find((row) => row.sourceOfferId === recoveryOffer.id);
  recoverBlackBox(restored, recovery);
  assert.equal(restored.state.missions.receipts.find((row) => row.missionId === recovery.id)?.outcome,
    'completed');
  assert.equal(restored.state.player.cargo.items.cmdty_salvage_electronics, 1);
  assert.equal(blackBoxFollowups(restored.state).length, 0,
    'the single recovery cannot recurse into another generation');
});
