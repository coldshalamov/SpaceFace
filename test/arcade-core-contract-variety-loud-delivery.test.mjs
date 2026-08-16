import assert from 'node:assert/strict';
import test from 'node:test';

import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  DEBRIS_RECOVERY_FOLLOWUP_SOURCE,
  LOUD_DELIVERY_VARIANT_ID,
} from '../src/data/missionVariants.js';
import { customsScanSample } from '../src/data/smugglingStealth.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { jettisonImpulse } from '../src/systems/jettisonImpulse.js';
import { missions } from '../src/systems/missions.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

const BOARD_STATION_ID = 'station_helios';
const BOARD_SECTOR_ID = 'sector_helios_prime';

function collect(bus, names) {
  const rows = Object.fromEntries(names.map((name) => [name, []]));
  for (const name of names) bus.on(name, (payload) => rows[name].push(structuredClone(payload)));
  return rows;
}

function seedState(sim) {
  const { state } = sim;
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

function boardHarness(seed) {
  const sim = createSimulation({ seed, systems: [missions], updateOrder: [missions] });
  seedState(sim);
  const player = sim.spawn({
    type: 'ship', isPlayer: true, team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 20,
    hull: 100, hullMax: 100, collides: true, data: {},
  });
  sim.state.playerId = player.id;
  return { sim, state: sim.state, missions: sim.registry.get('missions') };
}

function loudOffer(harness) {
  return harness.missions.ensureBoard(BOARD_STATION_ID).slots.find((offer) => (
    offer && offer.variantId === LOUD_DELIVERY_VARIANT_ID
  ));
}

function findLoudSeed() {
  for (let seed = 1; seed <= 256; seed++) {
    const harness = boardHarness(seed);
    const offer = loudOffer(harness);
    harness.sim.dispose();
    if (offer) return seed;
  }
  throw new Error('bounded ordinary Helios boards produced no Loud Delivery offer');
}

async function routeHarness(seed, { playerVelocity = 0, inputThrust = 0 } = {}) {
  const tactical = createTacticalAISystem();
  const systems = [
    encounterDirector,
    tactical,
    flightV3,
    aiPorts,
    physics,
    jettisonImpulse,
    cargo,
    economy,
    missions,
  ];
  const sim = createSimulation({ seed, systems, updateOrder: systems });
  seedState(sim);
  const { state, bus } = sim;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  state.input.thrust = inputThrust;
  const spec = makeShipEntitySpec('ship_hitch', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
    rot: Math.PI,
    fittings: fittingsFromDefaultModules('ship_hitch'),
  });
  spec.vel = { x: playerVelocity, z: 0 };
  const player = sim.spawn(spec);
  state.playerId = player.id;
  const log = collect(bus, [
    'encounter:resolved',
    'patrol:proximity',
    'player:scannedByPatrol',
    'contraband:scanned',
    'smuggling:patrolEvaded',
    'smuggling:patrolDecoyCommitted',
    'smuggling:patrolDecoyResolved',
    'mission:completed',
    'mission:failed',
  ]);
  const physicsOwner = sim.registry.get('physics');
  assert.equal(await physicsOwner.prepareBackend(state, { reset: true }), true);
  return {
    sim,
    state,
    bus,
    player,
    log,
    physicsOwner,
    cargo: sim.registry.get('cargo'),
    missions: sim.registry.get('missions'),
  };
}

function disposeRoute(route) {
  route.physicsOwner?._disableSg02DynamicAuthority?.();
  route.sim.dispose();
}

function burnedDropFollowups(state) {
  return Object.values(state.missions.boards || {}).flatMap((board) => board && board.slots || [])
    .filter((offer) => offer && offer.source === DEBRIS_RECOVERY_FOLLOWUP_SOURCE
      && offer.cause && offer.cause.tag === 'loud_delivery_burned');
}

function acceptAndEnter(route) {
  const offer = loudOffer(route);
  assert.ok(offer);
  assert.equal(route.missions.acceptMission(offer.id), true);
  const mission = route.state.missions.active.find((row) => row.variantId === LOUD_DELIVERY_VARIANT_ID);
  assert.ok(mission);
  assert.equal(route.state.player.cargo.items[offer.params.cmdtyId], offer.params.qty,
    'the contract cargo is physically aboard before the scan net');
  route.state.mode = 'flight';
  route.state.ui.docked = false;
  route.state.ui.dockedStationId = null;
  route.state.world.currentSectorId = mission.destSectorId;
  route.state.world.currentSector = { id: mission.destSectorId, factionId: 'faction_scn', security: 1 };
  route.state.world.activeSector = { id: mission.destSectorId, factionId: 'faction_scn', stations: [] };
  route.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  const encounterId = mission.params.loudDelivery.encounterId;
  const live = route.state.encounterDirector.live[encounterId];
  assert.ok(live && live.ids.length === 2, 'destination entry requests the shipped patrol_scan');
  const patrol = route.state.entities.get(live.ids[0]);
  assert.equal(patrol.data.smugglingScanCone.kind, 'customs_scan_lattice');
  return { offer, mission, live, patrol };
}

function recoverRecorder(route, mission) {
  route.state.mode = 'flight';
  route.state.ui.docked = false;
  route.state.ui.dockedStationId = null;
  route.state.world.currentSectorId = mission.destSectorId;
  route.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  assert.equal(mission.targetEntityIds.length, 1);
  const pod = route.state.entities.get(mission.targetEntityIds[0]);
  assert.ok(pod && pod.alive !== false && pod.type === 'payload');
  assert.equal(pod.physicsBody.dynamic, true);
  assert.equal(pod.data.recoverableCargoPod, true);
  assert.equal(isAttachable(pod, route.player.id), true);
  assert.ok(Math.hypot(pod.vel.x, pod.vel.z) > 0);
  pod.pos.x = route.player.pos.x + route.player.radius + pod.radius;
  pod.pos.z = route.player.pos.z;
  pod.vel = { ...route.player.vel };
  route.bus.emit('physics:impact', {
    aId: pod.id,
    bId: route.player.id,
    impulse: 8,
    tick: route.state.tick,
  });
  assert.equal(pod.alive, false);
}

test('ordinary Loud Delivery clears a physical scan net by decoy and a real scan leaves one burned-drop recovery', async (t) => {
  const seed = findLoudSeed();
  const replay = boardHarness(seed);
  t.after(() => replay.sim.dispose());
  const replayOffer = loudOffer(replay);

  const success = await routeHarness(seed, { playerVelocity: -30 });
  t.after(() => disposeRoute(success));
  const offer = loudOffer(success);
  assert.ok(offer, 'ordinary Contracts board exposes Loud Delivery before acceptance');
  assert.equal(offer.id, replayOffer.id);
  assert.equal(offer.title, replayOffer.title);
  assert.match(offer.title, /^Loud Delivery — Smuggle /);
  assert.match(offer.brief, /customs scan net.*cold.*ion storm.*physical decoy/i);
  assert.equal(offer.preloadedCargo, true);

  const cleared = acceptAndEnter(success);
  success.bus.emit('dock:docked', { stationId: cleared.mission.destStationId });
  assert.ok(success.state.missions.active.some((row) => row.id === cleared.mission.id),
    'the ordinary dock cannot bypass the advertised physical scan net');
  assert.equal(success.cargo.addCargo(cleared.offer.params.cmdtyId, 2), 2);
  assert.equal(success.cargo.jettison(cleared.offer.params.cmdtyId, 2, { purpose: 'customs_decoy' }), 2);
  assert.equal(success.log['smuggling:patrolDecoyCommitted'].length, 1);
  const podId = success.log['smuggling:patrolDecoyCommitted'][0].podId;
  const decoy = success.state.entities.get(podId);
  assert.ok(decoy && decoy.data.customsScanDecoy.encounterId === cleared.live.id);
  assert.equal(cleared.patrol.data.ai.activity.targetId, decoy.id);
  const startDistance = Math.hypot(
    cleared.patrol.pos.x - decoy.pos.x,
    cleared.patrol.pos.z - decoy.pos.z,
  );
  for (let tick = 0; tick < 1500 && success.log['smuggling:patrolDecoyResolved'].length === 0; tick++) {
    success.sim.step(SIM_DT);
  }
  assert.equal(success.log['smuggling:patrolDecoyResolved'].length, 1);
  assert.ok(Math.hypot(cleared.patrol.pos.x - decoy.pos.x, cleared.patrol.pos.z - decoy.pos.z)
    < startDistance - 80, 'the exact patrol body materially closes on the exact physical decoy');
  assert.equal(cleared.mission.params.loudDelivery.scanNetCleared, true);
  assert.equal(cleared.mission.params.loudDelivery.method, 'decoyed');
  assert.equal(success.log['patrol:proximity'].length, 0);
  success.bus.emit('dock:docked', { stationId: cleared.mission.destStationId });
  assert.equal(success.state.missions.receipts.find((row) => row.missionId === cleared.mission.id)?.outcome,
    'completed');
  assert.equal(burnedDropFollowups(success.state).length, 0);

  const failed = await routeHarness(seed);
  t.after(() => disposeRoute(failed));
  const burned = acceptAndEnter(failed);
  failed.player.pos.x = burned.patrol.pos.x + Math.cos(burned.patrol.rot) * 120;
  failed.player.pos.z = burned.patrol.pos.z + Math.sin(burned.patrol.rot) * 120;
  failed.player.vel = { x: burned.patrol.vel.x, z: burned.patrol.vel.z };
  assert.equal(await failed.physicsOwner.prepareBackend(failed.state, { reset: true }), true);
  assert.equal(customsScanSample(failed.state, burned.patrol, failed.player, 1).insideCone, true,
    'the failure bot enters the patrol body\'s real hard scan lattice before submitting');
  failed.bus.emit('encounter:choose', { encounterId: burned.live.id, choiceId: 'submit' });
  assert.equal(failed.log['patrol:proximity'].length, 1,
    'a visible hot burn reaches the ordinary customs scan authority');
  assert.equal(failed.log['player:scannedByPatrol'][0]?.hasContraband, true);
  assert.equal(failed.log['mission:failed'].length, 1);
  assert.equal(failed.state.missions.receipts.find((row) => row.missionId === burned.mission.id)?.reason,
    'busted');
  assert.equal(failed.state.player.cargo.items[burned.offer.params.cmdtyId] || 0, 0,
    'the cargo owner removes the burned contract manifest');
  assert.equal(burnedDropFollowups(failed.state).length, 1);
  const recoveryOffer = burnedDropFollowups(failed.state)[0];
  assert.match(recoveryOffer.title, /^Black Box Recovery — Burned Drop Recorder$/);
  assert.equal(recoveryOffer.params.debrisRecovery.pods.length, 1);

  const saved = structuredClone(failed.missions.serialize());
  const restored = await routeHarness(seed);
  t.after(() => disposeRoute(restored));
  restored.missions.deserialize(saved);
  restored.state.simTime += 1200;
  restored.missions.ensureBoard(BOARD_STATION_ID);
  assert.equal(burnedDropFollowups(restored.state).length, 1,
    'save/load and a normal epoch retain exactly one causal recovery');
  const restoredOffer = burnedDropFollowups(restored.state)[0];
  assert.equal(restored.missions.acceptMission(restoredOffer.id), true);
  const recovery = restored.state.missions.active.find((row) => row.sourceOfferId === restoredOffer.id);
  recoverRecorder(restored, recovery);
  assert.equal(restored.state.missions.receipts.find((row) => row.missionId === recovery.id)?.outcome,
    'completed');
  assert.equal(restored.state.player.cargo.items.cmdty_salvage_electronics, 1);
  assert.equal(burnedDropFollowups(restored.state).length, 0,
    'accepting the one recovery removes it and cannot create another generation');
});
