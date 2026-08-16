import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  AFTERMATH_FRESH_WINDOW_S,
  COLD_DERELICT_CUT_THRESHOLD,
  aftermathForSector,
  aftermathWrecks,
  coldDerelictHasSurvivor,
} from '../src/systems/aftermathWrecks.js';
import { mining } from '../src/systems/mining.js';
import {
  countLiveCausalSurvivorPods,
  isCausalSurvivorPod,
  survivorPod,
} from '../src/systems/survivorPod.js';

const SECTOR_ID = 'sector_helios_prime';
const SEED = 5; // ordinary deterministic loss: no kill-eject, but a survivor remains in the cold hulk

function boot() {
  const sim = createSimulation({
    seed: SEED,
    systems: [aftermathWrecks, survivorPod, mining],
    updateOrder: [aftermathWrecks, mining, survivorPod],
  });
  const state = sim.state;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  const zone = zonesForSector(SECTOR_ID)[0];
  const pos = sectorLocalToGlobalForSector(zone.center, SECTOR_ID);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 8,
    hull: 100, hullMax: 100, flags: {}, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  state.player.miningBeam = {
    tierId: 'beam_mk1', range: 220, dps: 18, directToCargo: true,
    heat: 0, heatMax: 10_000, heatRate: 0.1, coolRate: 100,
  };
  const victim = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_reach', pos: { x: pos.x + 30, z: pos.z },
    vel: { x: 0, z: 0 }, radius: 7, hull: 0, hullMax: 80, flags: {},
    data: { defId: 'ship_corsair', shipClass: 'corsair_raider', name: 'Cold Ledger' },
  });
  victim.alive = false;
  sim.bus.emit('entity:killed', {
    id: victim.id,
    killerId: player.id,
    type: 'ship',
    victimClass: 'corsair_raider',
    factionId: victim.factionId,
    pos: { ...victim.pos },
    vel: { ...victim.vel },
    sectorId: SECTOR_ID,
    data: victim.data,
  });
  return {
    sim, state, player,
    aftermath: sim.registry.get('aftermathWrecks'),
    pods: sim.registry.get('survivorPod'),
  };
}

function liveMarkerWreck(state, markerId) {
  return state.entityList.find((entity) => entity && entity.alive !== false
    && entity.type === 'wreck' && entity.data && entity.data.markerId === markerId);
}

function retireLiveWreck(state, wreck) {
  wreck.alive = false;
  state.entities.delete(wreck.id);
}

test('a cold derelict must be tether-stabilized, cuts open physically, and yields one rescuable pod across Continue', () => {
  const ctx = boot();
  try {
    const { sim, state, player, aftermath, pods } = ctx;
    const marker = aftermathForSector(state, SECTOR_ID)[0];
    let wreck = liveMarkerWreck(state, marker.markerId);
    assert.ok(marker && wreck, 'ordinary combat produced the durable physical aftermath wreck');
    assert.equal(countLiveCausalSurvivorPods(state), 0, 'this loss did not already eject a survivor');
    assert.equal(coldDerelictHasSurvivor(state, marker), true);

    const blocked = [];
    const extracted = [];
    const rescued = [];
    const rep = [];
    sim.bus.on('derelictBoarding:requiresStabilization', (payload) => blocked.push(payload));
    sim.bus.on('derelictBoarding:survivorExtracted', (payload) => extracted.push(payload));
    sim.bus.on('survivorPod:rescued', (payload) => rescued.push(payload));
    sim.bus.on('faction:repDelta', (payload) => rep.push(payload));

    state.simTime = marker.t + AFTERMATH_FRESH_WINDOW_S;
    state.tick = 30;
    aftermath.update(0.5, state);
    assert.equal(wreck.data.wreckLifecycle, 'cold');
    assert.match(wreck.data.scanLabel, /FAINT LIFE SIGN/);

    state.player.targetId = wreck.id;
    state.input.fireGroup = 2;
    sim.step(0.25);
    assert.equal(blocked.length, 1, 'the industrial beam cannot board an unstabilized cold hull');
    assert.equal(wreck.data.coldDerelictBoarding.cutProgress, 0);

    state.player.tether = { active: true, targetId: wreck.id, attachmentId: 'massline:test' };
    sim.bus.emit('tether:latched', { ownerId: player.id, targetId: wreck.id, attachmentId: 'massline:test' });
    sim.step(1);
    assert.equal(wreck.data.coldDerelictBoarding.phase, 'sealed');
    const partialProgress = wreck.data.coldDerelictBoarding.cutProgress;
    assert.ok(partialProgress > 0 && partialProgress < COLD_DERELICT_CUT_THRESHOLD);

    const partialSave = structuredClone(aftermath.serialize());
    retireLiveWreck(state, wreck);
    sim.bus.emit('save:restoring', {});
    aftermath.deserialize(partialSave);
    sim.bus.emit('save:loaded', {});
    sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    wreck = liveMarkerWreck(state, marker.markerId);
    assert.ok(wreck, 'Continue rematerializes the same cold boarding source');
    assert.equal(wreck.data.coldDerelictBoarding.cutProgress, partialProgress, 'partial hatch work survives Continue');

    state.player.targetId = wreck.id;
    state.player.tether = { active: true, targetId: wreck.id, attachmentId: 'massline:continued' };
    state.input.fireGroup = 2;
    sim.step(1);
    sim.step(1);
    assert.equal(extracted.length, 1);
    assert.equal(wreck.data.coldDerelictBoarding.phase, 'extracted');
    assert.equal(wreck.data.coldDerelictBoarding.cutProgress, COLD_DERELICT_CUT_THRESHOLD);
    let pod = state.entityList.find(isCausalSurvivorPod);
    assert.ok(pod, 'cut hatch produced a real physical SurvivorPod payload');
    assert.equal(pod.data.masslineTetherable, true);
    assert.equal(pod.data.survivorPodCausal.source, 'cold_derelict_boarding');
    assert.equal(pod.data.survivorPodCausal.sourceMarkerId, marker.markerId);

    const completedSave = structuredClone(aftermath.serialize());
    pods.newGame();
    assert.equal(Object.keys(state.survivorPod.causal.byEntityId).length, 0);
    pods.update(1 / 60, state);
    assert.ok(state.survivorPod.causal.byEntityId[pod.id], 'Continue re-adopts the persistent physical pod');
    retireLiveWreck(state, wreck);
    sim.bus.emit('save:restoring', {});
    aftermath.deserialize(completedSave);
    sim.bus.emit('save:loaded', {});
    sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    wreck = liveMarkerWreck(state, marker.markerId);
    state.player.targetId = wreck.id;
    state.player.tether = { active: true, targetId: wreck.id, attachmentId: 'massline:idempotence' };
    state.input.fireGroup = 2;
    sim.step(0.25);
    assert.equal(extracted.length, 1, 'restored open hatch cannot produce a second survivor');
    assert.equal(countLiveCausalSurvivorPods(state), 1);

    pod = state.entityList.find(isCausalSurvivorPod);
    const station = sim.spawn({
      type: 'station', team: 2, factionId: 'faction_scn', pos: { ...pod.pos },
      vel: { x: 0, z: 0 }, radius: 80, flags: { persistent: true },
      data: { stationId: 'station_test_concord', factionId: 'faction_scn' },
    });
    player.pos.x = pod.pos.x;
    player.pos.z = pod.pos.z;
    state.player.tether = { active: true, targetId: pod.id, attachmentId: 'massline:rescue' };
    sim.bus.emit('tether:latched', { ownerId: player.id, targetId: pod.id, attachmentId: 'massline:rescue' });
    pods.update(1 / 60, state);
    assert.equal(station.alive, true);
    assert.equal(rescued.length, 1);
    assert.equal(rescued[0].reason, 'station_delivery');
    assert.equal(rescued[0].sourceMarkerId, marker.markerId);
    assert.ok(rep.some((entry) => entry.reason === 'survivorPod:rescued' && entry.delta > 0));
    assert.equal(countLiveCausalSurvivorPods(state), 0, 'the existing rescue owner consumes the pod once');
  } finally {
    ctx.sim.dispose();
  }
});
