import assert from 'node:assert/strict';
import test from 'node:test';

import { isLawfulStationFaction } from '../src/ai/engagementAuthority.js';
import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  DEBRIS_RECOVERY_FOLLOWUP_SOURCE,
  WRECK_TOW_VARIANT_ID,
} from '../src/data/missionVariants.js';
import { SECTORS } from '../src/data/sectors.js';
import { actions } from '../src/systems/actions.js';
import { bountyHunt } from '../src/systems/bountyHunt.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { jettisonImpulse } from '../src/systems/jettisonImpulse.js';
import { missions } from '../src/systems/missions.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { surrenderRecovery } from '../src/systems/surrenderRecovery.js';
import { isAttachable, tetherGameplay } from '../src/systems/tetherGameplay.js';

const BOARD_STATION_ID = 'station_helios';
const BOARD_SECTOR_ID = 'sector_helios_prime';
const STATION_BY_ID = new Map(SECTORS.flatMap((sector) => (
  (sector.stations || []).map((station) => [station.id, { ...station, sectorId: sector.id }])
)));

function collect(bus, names) {
  const rows = Object.fromEntries(names.map((name) => [name, []]));
  for (const name of names) bus.on(name, (payload) => rows[name].push(structuredClone(payload)));
  return rows;
}

function makeHarness(seed) {
  const systems = [
    combat,
    actions,
    physics,
    tetherGameplay,
    surrenderRecovery,
    bountyHunt,
    jettisonImpulse,
    cargo,
    missions,
  ];
  const sim = createSimulation({ seed, systems, updateOrder: systems });
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

  const player = sim.spawn(makeShipEntitySpec('ship_mule', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  const events = collect(bus, [
    'combat:subsystemDisabled',
    'surrender:option',
    'tether:latched',
    'tether:reel',
    'surrender:secured',
    'bountyHunt:towIntercepted',
    'law:custodyTransfer',
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

function towOffer(harness) {
  return harness.missions.ensureBoard(BOARD_STATION_ID).slots.find((offer) => (
    offer && offer.variantId === WRECK_TOW_VARIANT_ID
  ));
}

function findTowSeed() {
  for (let seed = 1; seed <= 512; seed++) {
    const harness = makeHarness(seed);
    const offer = towOffer(harness);
    harness.sim.dispose();
    if (offer) return seed;
  }
  throw new Error('bounded ordinary Helios boards produced no Wreck Tow offer');
}

function blackBoxFollowups(state) {
  return Object.values(state.missions.boards || {}).flatMap((board) => board && board.slots || [])
    .filter((offer) => offer && offer.source === DEBRIS_RECOVERY_FOLLOWUP_SOURCE
      && offer.cause && offer.cause.tag === 'wreck_tow_stripped');
}

async function enterTow(harness, offer) {
  assert.equal(harness.missions.acceptMission(offer.id), true);
  const mission = harness.state.missions.active.find((row) => (
    row.variantId === WRECK_TOW_VARIANT_ID
  ));
  assert.ok(mission);
  harness.state.mode = 'flight';
  harness.state.ui.docked = false;
  harness.state.ui.dockedStationId = null;
  harness.state.world.currentSectorId = mission.destSectorId;
  harness.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  assert.equal(mission.targetEntityIds.length, 1);
  const target = harness.state.entities.get(mission.targetEntityIds[0]);
  assert.ok(target && target.alive !== false && target.type === 'ship');
  assert.equal(target.data.wreckTow.disabled, true);
  assert.equal(target.data.masslineTetherable, true);
  assert.equal(isAttachable(target, harness.player.id), true);

  const stationDef = STATION_BY_ID.get(mission.destStationId);
  assert.ok(stationDef && isLawfulStationFaction(stationDef.factionId));
  const station = harness.sim.spawn({
    type: 'station', team: 2, factionId: stationDef.factionId,
    pos: { x: target.pos.x - 900, z: target.pos.z },
    vel: { x: 0, z: 0 }, radius: 90, mass: 100000,
    hull: 100000, hullMax: 100000, collides: true,
    data: {
      stationId: stationDef.id,
      sectorId: mission.destSectorId,
      factionId: stationDef.factionId,
      size: stationDef.size || 'M',
    },
  });
  harness.player.pos.x = target.pos.x - 120;
  harness.player.pos.z = target.pos.z;
  harness.player.vel = { x: -45, z: 0 };
  target.vel = { x: -45, z: 0 };
  harness.state.player.targetId = target.id;
  assert.equal(await harness.physicsOwner.prepareBackend(harness.state, { reset: true }), true);
  harness.sim.step(SIM_DT);
  assert.equal(harness.events['combat:subsystemDisabled'].length, 1);
  assert.equal(harness.events['combat:subsystemDisabled'][0].attackerId, null,
    'the pre-existing drive loss cannot be misattributed to the player');
  assert.equal(harness.events['surrender:option'].length, 1,
    'the shipped disabled-hull recovery owner adopts the exact contract tow');
  const inspection = harness.sim.registry.get('combat').ensureKernel().inspect({ entityId: target.id });
  assert.equal(inspection.entity.combat.subsystems.subsystem_drive.effectiveDisabled, true,
    'combat owns a real disabled drive, not a mission-only label');
  assert.equal(target.data.wreckTow.driveDisabled, true);
  assert.equal(target.data.ai.fsm, 'disabled');
  assert.equal(target.data.ai.passive, true);
  assert.equal(target.data.intent, null, 'the advertised dead drive has no propulsion writer');
  return { mission, target, station };
}

function attachAndSecure(harness, target) {
  harness.state.input.aimWorld = { x: target.pos.x, z: target.pos.z };
  harness.state.input.aimIntentActive = true;
  harness.state.input.aimAngle = 0;
  harness.state.input.actions = {
    tetherFire: false,
    tetherCut: false,
    reelDelta: 0,
    massline: null,
  };
  harness.sim.step(SIM_DT);
  harness.state.input.actions.tetherFire = true;
  harness.sim.step(SIM_DT);
  harness.state.input.actions.tetherFire = false;
  harness.sim.step(SIM_DT);
  assert.equal(harness.events['tether:latched'].length, 1);
  assert.equal(harness.state.player.tether.targetId, target.id);

  harness.state.input.actions.massline = { lineControl: true, lineLength: -1, cut: false };
  for (let tick = 0; tick < 8 * 60 && harness.events['surrender:secured'].length === 0; tick++) {
    harness.sim.step(SIM_DT);
  }
  assert.ok(harness.events['tether:reel'].length > 0);
  assert.equal(harness.events['surrender:secured'].length, 1);
  assert.equal(harness.events['bountyHunt:towIntercepted'].length, 1,
    'the shipped mid-tow route-defense owner commits one scavenger interceptor');
  const interceptorId = harness.events['bountyHunt:towIntercepted'][0].hunterEntityId;
  const interceptor = harness.state.entities.get(interceptorId);
  assert.ok(interceptor && interceptor.alive !== false);
  assert.equal(interceptor.data.towInterceptionTargetSlot, target.data.missionTargetSlot);
  return interceptor;
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
  assert.equal(pod.alive, false);
}

test('ordinary Wreck Tow hauls a heavy dead hull through route defense and a stripped tow leaves one black box', async (t) => {
  const seed = findTowSeed();
  const success = makeHarness(seed);
  const replay = makeHarness(seed);
  t.after(() => { success.sim.dispose(); replay.sim.dispose(); });

  const offer = towOffer(success);
  const replayOffer = towOffer(replay);
  assert.ok(offer, 'ordinary Contracts board exposes Wreck Tow before acceptance');
  assert.equal(offer.id, replayOffer.id);
  assert.equal(offer.title, replayOffer.title);
  assert.match(offer.title, /^Wreck Tow — Disabled Mule to /);
  assert.match(offer.brief, /drive is dead.*scavengers.*heavy hull.*Massline/i);

  const live = await enterTow(success, offer);
  const targetAtLatch = { ...live.target.pos };
  attachAndSecure(success, live.target);
  for (let tick = 0; tick < 20 * 60 && success.events['law:custodyTransfer'].length === 0; tick++) {
    success.sim.step(SIM_DT);
  }
  success.state.input.actions.massline = null;
  assert.equal(success.events['law:custodyTransfer'].length, 1);
  assert.ok(Math.hypot(live.target.pos.x - targetAtLatch.x, live.target.pos.z - targetAtLatch.z) > 250,
    'Rapier advances the heavy hull materially while the real Massline stays attached');
  assert.equal(success.state.missions.receipts.find((row) => row.missionId === live.mission.id)?.outcome,
    'completed');
  assert.equal(blackBoxFollowups(success.state).length, 0);

  const failed = makeHarness(seed);
  t.after(() => failed.sim.dispose());
  const doomed = await enterTow(failed, towOffer(failed));
  const scavenger = attachAndSecure(failed, doomed.target);
  failed.bus.emit('projectile:hit', {
    targetId: doomed.target.id,
    ownerId: scavenger.id,
    damage: 100000,
    damageType: 'kinetic',
    penetration: 1,
    pos: { ...doomed.target.pos },
  });
  assert.equal(doomed.target.alive, false, 'combat owns the scavenger stripping loss');
  assert.equal(failed.events['mission:failed'].length, 1);
  assert.equal(failed.state.missions.receipts.find((row) => row.missionId === doomed.mission.id)?.reason,
    'tow_hull_stripped');
  assert.equal(blackBoxFollowups(failed.state).length, 1);
  const followup = blackBoxFollowups(failed.state)[0];
  assert.match(followup.title, /^Black Box Recovery — Disabled Recovery Mule$/);
  assert.equal(followup.cause.killerId, scavenger.id);
  assert.equal(followup.params.debrisRecovery.pods.length, 1);

  const saved = structuredClone(failed.missions.serialize());
  const restored = makeHarness(seed);
  t.after(() => restored.sim.dispose());
  restored.missions.deserialize(saved);
  restored.state.simTime += 1200;
  restored.missions.ensureBoard(BOARD_STATION_ID);
  assert.equal(blackBoxFollowups(restored.state).length, 1,
    'Continue and an ordinary board epoch retain exactly one causal recovery');
  const restoredOffer = blackBoxFollowups(restored.state)[0];
  assert.equal(restored.missions.acceptMission(restoredOffer.id), true);
  const recovery = restored.state.missions.active.find((row) => row.sourceOfferId === restoredOffer.id);
  recoverBlackBox(restored, recovery);
  assert.equal(restored.state.missions.receipts.find((row) => row.missionId === recovery.id)?.outcome,
    'completed');
  assert.equal(restored.state.player.cargo.items.cmdty_salvage_electronics, 1);
  assert.equal(blackBoxFollowups(restored.state).length, 0,
    'the sole recovery cannot recurse into another generation');
});
