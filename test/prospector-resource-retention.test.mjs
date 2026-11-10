import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { traffic } from '../src/systems/traffic.js';
import { scanner } from '../src/systems/scanner.js';
import { world } from '../src/systems/world.js';
import { save as saveSystem } from '../src/save/saveSystem.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { persistTouchedResourceBody } from '../src/systems/mining.js';
import { forEachFieldRock } from '../src/world/livingWorldViews.js';
import { compactResourceBodyRecords, upsertResourceBody, MAX_RESOURCE_BODIES } from '../src/world/resourceBodyRecords.js';

function syntheticRock(slot, modified = false) {
  return { type: 'asteroid', alive: true, homeSectorId: 'sector_vesta_forge',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    data: { fieldId: 'field_retention_fixture', asteroidSlotId: slot,
      oreHP: modified ? 90 : 100, oreHPMax: 100 } };
}

test('active prospector retains its exact resource under pressure through Continue and releases it normally', async () => {
  const sim = createSimulation({ seed: 4242, systems: [world, npcJobsRuntime, traffic, scanner, flightV3, physics, saveSystem],
    updateOrder: [npcJobsRuntime, flightV3, physics] });
  const { state, bus } = sim;
  try {
    state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'custom';
    state.settings.gameplay.flightBackend = 'v3';
    const worldOwner = sim.registry.get('world'); worldOwner.enterSector('sector_vesta_forge');
    const owner = sim.registry.get('traffic'); owner._ensureState();
    const yard = state.entityList.find(e => e.type === 'station' && e.data?.stationId === 'station_forge');
    assert.ok(yard);
    const rockId = owner._pickWorkableAsteroidNear(state, yard, 0);
    let fieldRock;
    forEachFieldRock(state, r => { if (r.id === rockId) fieldRock = r; });
    assert.ok(fieldRock?.data?.asteroidSlotId);
    const x = fieldRock.pos.x - fieldRock.radius - 70, z = fieldRock.pos.z;
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, team: 0, pos: { x, z: z + 150 }, rot: 0 }));
    state.playerId = player.id;
    const worker = sim.spawn(makeShipEntitySpec('ship_drifter', { team: 2, pos: { x, z }, rot: 0 }));
    Object.assign(worker.data, { trafficRole: 'prospector', worldRecordId: 'prospector:pressure',
      sectorId: state.world.currentSectorId, ai: { passive: true, archetype: 'fleeing_trader' } });
    worker.homeSectorId = state.world.currentSectorId;
    const manifest = owner._assignManifest(worker, 'prospector', yard, state.world.currentSectorId);
    state.traffic.freighters.push({ id: worker.id, role: 'prospector', manifest });
    owner._maybeAssignJob(worker, 'prospector', yard, null, [yard], state.world.currentSectorId);
    const id = worker.data.jobId, jobs = sim.registry.get('npcJobsRuntime'), entry = state.npcJobs.byId[id];
    assert.ok(entry);
    const sourceId = entry.job.payload.prospectorField.sourceRecordId;
    const source = state.world.resourceBodies.byId[sourceId];
    assert.equal(source.tracked, false); assert.equal(source.missionOwned, false);
    assert.equal(source.playerModified, false); assert.equal(source.retentionClass, 'reclaimable');
    state.simTime = 1;
    const firstLoose = syntheticRock('loose_0');
    const looseIds = [persistTouchedResourceBody(state, firstLoose).recordId];
    for (let i = 1; i < MAX_RESOURCE_BODIES + 5; i++) {
      looseIds.push(persistTouchedResourceBody(state, syntheticRock(`loose_${i}`)).recordId);
    }
    assert.ok(state.world.resourceBodies.byId[sourceId], 'older active source survives intact-record pressure');
    assert.ok(looseIds.some(id => !state.world.resourceBodies.byId[id]), 'unreferenced intact records still compact');
    assert.equal(Object.keys(state.world.resourceBodies.byId).length, MAX_RESOURCE_BODIES);
    // Force a genuine protected overflow so save and restore must also honor saved job refs,
    // rather than merely benefiting from an already under-cap serialized bag.
    for (let i = 0; i < MAX_RESOURCE_BODIES; i++) persistTouchedResourceBody(state, syntheticRock(`modified_${i}`, true));
    assert.equal(Object.keys(state.world.resourceBodies.byId).length, MAX_RESOURCE_BODIES + 1);
    assert.ok(state.world.resourceBodies.byId[sourceId]);
    assert.equal(state.world.resourceBodies.byId[sourceId].tracked, false);
    entry.job.phase = 'work'; entry.job.progress = 0.4;
    const save = sim.registry.get('save'), envelope = JSON.parse(JSON.stringify(save.serialize('prospector-pressure')));
    assert.ok(envelope.data.world.resourceBodies.byId[sourceId], 'world serialization keeps the active source');
    assert.equal(envelope.data.npcJobs.byId[id].job.payload.prospectorField.sourceRecordId, sourceId);
    assert.equal(save.loadEnvelope(envelope, 'prospector-pressure'), true);
    state.mode = 'flight';
    const phys = sim.registry.get('physics'); phys._finishNativeRestore();
    assert.equal(await phys.prepareBackend(state), true);
    const restored = [...state.entities.values()].find(e => e.data?.worldRecordId === 'prospector:pressure');
    assert.ok(restored);
    const restoredEntry = state.npcJobs.byId[id];
    assert.ok(restoredEntry); assert.equal(restoredEntry.job.progress, 0.4);
    assert.ok(state.world.resourceBodies.byId[sourceId], 'incoming saved jobs protect the source before job restore');
    let marked = null;
    bus.on('npcjobs:surveyMarked', p => { if (p.jobId === id) marked = p; });
    for (let i = 0; i < 1800 && !marked; i++) sim.step(1 / 60);
    assert.ok(marked, 'the same saved job completes actual physical work');
    assert.equal(restoredEntry._prospectorTarget.entity.data.resourceBodyId, sourceId);
    assert.equal(marked.fieldId, source.fieldId);
    assert.equal(restored.data.cargoManifest.totalQty, 0);
    assert.equal(jobs.release(id), true);
    const compacted = compactResourceBodyRecords(state.world.resourceBodies,
      { npcJobs: state.npcJobs, authoritativeRetirement: true, targetCount: 0 });
    assert.ok(compacted.retired > 0);
    assert.equal(state.world.resourceBodies.byId[sourceId], undefined, 'released source is normally reclaimable again');

    // Restore the same job and destroy the actual rebound source. Terminal truth must win even
    // while the active job temporarily references the record, and later upserts cannot revive it.
    assert.equal(save.loadEnvelope(envelope, 'prospector-pressure'), true);
    state.mode = 'flight'; phys._finishNativeRestore(); assert.equal(await phys.prepareBackend(state), true);
    const resumed = state.npcJobs.byId[id];
    sim.step(1 / 60);
    const rebound = resumed._prospectorTarget?.entity;
    assert.ok(rebound); assert.equal(rebound.data.resourceBodyId, sourceId);
    rebound.alive = false;
    const destroyed = worldOwner.persistResourceBody(rebound);
    assert.equal(destroyed.outcome, 'destroyed');
    sim.step(1 / 60);
    assert.equal(state.npcJobs.byId[id], undefined, 'destroyed source invalidates its booking');
    upsertResourceBody(state.world.resourceBodies, { ...destroyed, outcome: 'active', oreHp: 100 }, { npcJobs: state.npcJobs });
    assert.equal(state.world.resourceBodies.byId[sourceId].outcome, 'destroyed');
  } finally { sim.dispose(); }
});
