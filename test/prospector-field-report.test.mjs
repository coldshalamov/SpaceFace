import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { traffic } from '../src/systems/traffic.js';
import { scanner } from '../src/systems/scanner.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { save as saveSystem } from '../src/save/saveSystem.js';
import { world } from '../src/systems/world.js';
import { forEachFieldRock } from '../src/world/livingWorldViews.js';

async function fixture(native = false) {
  const sim = createSimulation({ seed: 1903, systems: [world, npcJobsRuntime, traffic, scanner, flightV3, physics, saveSystem],
    updateOrder: [npcJobsRuntime, flightV3, physics] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.world.currentSectorId = 'sector_vesta_forge';
  state.settings.gameplay.physicsBackend = native ? 'rapier-dynamic' : 'legacy';
  state.settings.gameplay.flightBackend = 'v3';
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, pos: { x: -180, z: 100 }, rot: 0 }));
  state.playerId = player.id;
  const yard = sim.spawn({ type: 'station', pos: { x: -100, z: 0 }, radius: 20,
    data: { stationId: 'station_forge' } });
  const rock = sim.spawn({ type: 'asteroid', pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    radius: 14, mass: 10000, hull: 100, collides: true,
    data: { fieldId: 'field_test', asteroidSlotId: 'fixture-rock', oreHP: 100, oreHPMax: 100 } });
  const worker = sim.spawn(makeShipEntitySpec('ship_drifter', { pos: { x: -160, z: 0 }, rot: 0 }));
  Object.assign(worker.data, { trafficRole: 'prospector', worldRecordId: 'prospector:test',
    ai: { passive: true, archetype: 'fleeing_trader' } });
  worker.team = 2; state.player.targetId = worker.id;
  state.fieldDepletion = { fields: { field_test: { depletion: 0.08 } } };
  const t = sim.registry.get('traffic'); t._ensureState();
  const manifest = t._assignManifest(worker, 'prospector', yard, state.world.currentSectorId);
  state.traffic.freighters.push({ id: worker.id, role: 'prospector', manifest });
  t._maybeAssignJob(worker, 'prospector', yard, null, [yard], state.world.currentSectorId);
  const entry = state.npcJobs.byId[worker.data.jobId];
  assert.ok(entry, 'ordinary traffic commissions a real target');
  assert.equal(entry.job.kind, 'surveyor');
  assert.equal(manifest.totalQty, 0);
  if (native) assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  return { sim, state, bus, player, yard, rock, worker, entry, traffic: t,
    jobs: sim.registry.get('npcJobsRuntime'), radio: sim.registry.get('scanner') };
}

function hail(h) {
  const responses = [];
  const listen = p => responses.push(p);
  h.bus.on('contactHail:response', listen);
  assert.equal(h.radio._requestContactHail({ targetId: h.worker.id }), true);
  const offer = h.radio._contactHail;
  assert.ok(offer.actions.some(a => a.id === 'status'));
  assert.equal(h.radio._chooseContactHail({ requestId: offer.requestId, targetId: h.worker.id, choice: 'status' }), true);
  h.bus.off('contactHail:response', listen);
  return responses[0].lines.join(' ');
}

test('prospector flies to its real face, measures, and Hail reports the dated field snapshot', async () => {
  const h = await fixture(true);
  try {
    assert.match(hail(h), /NO RECENT COMPLETED FIELD READING/);
    const before = { credits: h.state.player.credits, hp: h.rock.data.oreHP };
    const initialX = h.worker.pos.x;
    let marks = [];
    h.bus.on('npcjobs:surveyMarked', p => { if (p.jobId === h.entry.job.id) marks.push(p); });
    for (let i = 0; i < 6000 && !marks.length; i++) h.sim.step(1 / 60);
    assert.equal(marks.length, 1, `should physically complete work: ${JSON.stringify({ pos: h.worker.pos, vel: h.worker.vel, rot: h.worker.rot, phase: h.entry.job.phase, progress: h.entry.job.progress, intent: h.worker.data.intent })}`);
    assert.equal(marks[0].fieldId, 'field_test');
    assert.ok(h.worker.pos.x > initialX + 50, 'the hull actually traveled to its face');
    assert.equal(marks[0].depletion, 0.08);
    assert.match(hail(h), /8% DEPLETED WHEN MEASURED.*RECORDED POSITION/);
    assert.equal(h.state.player.credits, before.credits);
    assert.equal(h.rock.data.oreHP, before.hp);
    assert.equal(h.worker.data.cargoManifest.totalQty, 0);
    // Choice reads the current ledger, not a stale copy captured by the offer.
    assert.equal(h.radio._requestContactHail({ targetId: h.worker.id }), true);
    const offer = h.radio._contactHail;
    const mark = h.state.npcJobs.surveyMarks[h.state.world.currentSectorId][0];
    mark.jobId = 'job:other-surveyor';
    let response;
    const capture = p => { response = p; };
    h.bus.on('contactHail:response', capture);
    assert.equal(h.radio._chooseContactHail({ requestId: offer.requestId, targetId: h.worker.id, choice: 'status' }), true);
    h.bus.off('contactHail:response', capture);
    assert.match(response.lines.join(' '), /NO RECENT COMPLETED FIELD READING/);
    mark.jobId = h.entry.job.id;
    h.state.simTime = marks[0].measuredAt + 421;
    assert.match(hail(h), /NO RECENT COMPLETED FIELD READING/);
  } finally { h.sim.dispose(); }
});

test('work waits for contact geometry and ownership; replacement cannot certify the booking', async () => {
  const h = await fixture(false);
  try {
    const { jobs, entry, worker, rock, state } = h;
    entry.job.phase = 'work'; entry.job.progress = 0.99;
    worker.pos.x = -500; worker.pos.z = 0; worker.vel.x = worker.vel.z = 0; worker.rot = 0;
    h.sim.step(1 / 60);
    assert.equal(entry.job.progress, 0.99, 'distant hull cannot complete');
    worker.pos.x = 50; worker.rot = Math.PI;
    h.sim.step(1 / 60);
    assert.equal(entry.job.progress, 0.99, 'facing away cannot complete');
    worker.rot = 0; worker.vel.x = 20;
    h.sim.step(1 / 60);
    assert.equal(entry.job.progress, 0.99, 'excess relative velocity cannot complete');
    worker.vel.x = 0;
    entry.control = { claimId: 'borrowed' };
    h.sim.step(1 / 60);
    assert.equal(entry.job.progress, 0.99, 'borrowed worker cannot complete');
    entry.control = null;
    state.world.currentSectorId = 'sector_ceres_belt';
    h.sim.step(1 / 60);
    assert.equal(entry.job.progress, 0.99, 'off-sector work cannot complete');
    state.world.currentSectorId = 'sector_vesta_forge';
    const replacement = { ...rock, data: { ...rock.data } };
    state.entities.set(rock.id, replacement);
    h.sim.step(1 / 60);
    assert.equal(entry.job.progress, 0.99);
    assert.equal(state.npcJobs.surveyMarks?.[state.world.currentSectorId]?.length || 0, 0);
    state.entities.set(rock.id, rock);
    assert.equal(jobs._prospectorWorkTarget(entry, worker).blocked, true, 'lost binding cannot be revived');
    // A new occupant in the same entity object is a different rock.
    rock.occupantGeneration++;
    assert.equal(jobs._prospectorWorkTarget(entry, worker).blocked, true);
  } finally { h.sim.dispose(); }
});

test('a pre-existing loaded miner job survives recommission and Continue', async () => {
  const h = await fixture(false);
  try {
    const { jobs, worker, yard, traffic: owner, state } = h;
    assert.equal(jobs.release(worker.data.jobId), true);
    const manifest = { manifestId: 'old-load', lines: [{ commodityId: 'cmdty_ore_iron', qty: 3 }], totalQty: 3 };
    worker.data.cargoManifest = manifest;
    const id = jobs.assign(worker, { kind: 'miner', sectorId: state.world.currentSectorId,
      route: [{ id: 'home', pos: { ...yard.pos } }, { id: 'field', pos: { ...h.rock.pos } }] });
    assert.ok(id);
    owner._maybeAssignJob(worker, 'prospector', yard, null, [yard], state.world.currentSectorId);
    assert.equal(state.npcJobs.byId[id].job.kind, 'miner');
    assert.equal(worker.data.cargoManifest, manifest);
    const save = h.sim.registry.get('save');
    const saved = JSON.parse(JSON.stringify(save.serialize('prospector-legacy')));
    assert.equal(save.loadEnvelope(saved, 'prospector-legacy'), true);
    const restored = [...state.entities.values()].find(e => e.data?.worldRecordId === 'prospector:test');
    assert.ok(restored);
    assert.equal(state.npcJobs.byId[id].job.kind, 'miner');
    assert.equal(restored.data.cargoManifest.manifestId, 'old-load');
    assert.equal(restored.data.cargoManifest.totalQty, 3);
  } finally { h.sim.dispose(); }
});

test('Continue resumes the same saved prospector job at its exact world resource body and refuses terminal loss', async () => {
  const sim = createSimulation({ seed: 4242, systems: [world, npcJobsRuntime, traffic, scanner, flightV3, physics, saveSystem],
    updateOrder: [npcJobsRuntime, flightV3, physics] });
  const { state, bus } = sim;
  try {
    state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'custom';
    state.settings.gameplay.flightBackend = 'v3';
    const worldOwner = sim.registry.get('world');
    worldOwner.enterSector('sector_vesta_forge');
    const owner = sim.registry.get('traffic'); owner._ensureState();
    const yard = state.entityList.find(e => e.type === 'station' && e.data?.stationId === 'station_forge');
    assert.ok(yard, 'ordinary sector provides a real berth');
    const rockId = owner._pickWorkableAsteroidNear(state, yard, 0);
    let fieldRock = null;
    forEachFieldRock(state, rock => { if (rock.id === rockId) fieldRock = rock; });
    assert.ok(fieldRock?.data?.asteroidSlotId, 'use a world-generated, stable-slot seam');
    const x = fieldRock.pos.x - fieldRock.radius - 70, z = fieldRock.pos.z;
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, team: 0, pos: { x, z: z + 150 }, rot: 0 }));
    state.playerId = player.id;
    const worker = sim.spawn(makeShipEntitySpec('ship_drifter', { team: 2, pos: { x, z }, rot: 0 }));
    Object.assign(worker.data, { trafficRole: 'prospector', worldRecordId: 'prospector:continue',
      sectorId: state.world.currentSectorId, ai: { passive: true, archetype: 'fleeing_trader' } });
    worker.homeSectorId = state.world.currentSectorId;
    state.player.targetId = worker.id;
    const manifest = owner._assignManifest(worker, 'prospector', yard, state.world.currentSectorId);
    state.traffic.freighters.push({ id: worker.id, role: 'prospector', manifest });
    owner._maybeAssignJob(worker, 'prospector', yard, null, [yard], state.world.currentSectorId);
    const id = worker.data.jobId, entry = state.npcJobs.byId[id], jobs = sim.registry.get('npcJobsRuntime');
    assert.ok(entry);
    const sourceId = entry.job.payload.prospectorField.sourceRecordId;
    const source = state.world.resourceBodies.byId[sourceId];
    assert.equal(source.fieldId, fieldRock.data.fieldId);
    assert.equal(source.slotId, fieldRock.data.asteroidSlotId);
    let measurements = [];
    bus.on('npcjobs:surveyMarked', event => { if (event.jobId === id) measurements.push(event); });
    for (let i = 0; i < 2400 && !measurements.length; i++) sim.step(1 / 60);
    assert.equal(measurements.length, 1, 'the original live crew completes a real work phase');
    const first = measurements[0];
    // Save a second measurement partway through; the prior report must not be restamped.
    entry.job.phase = 'work'; entry.job.progress = 0.4;
    const save = sim.registry.get('save'), envelope = JSON.parse(JSON.stringify(save.serialize('prospector-same-source')));
    assert.equal(envelope.data.world.resourceBodies.byId[sourceId].recordId, sourceId);
    assert.equal(save.loadEnvelope(envelope, 'prospector-same-source'), true);
    state.mode = 'flight';
    // Continue selects the native backend. Supply its actual post-restore authority before
    // expecting a physical worker to advance; the runtime must not use mirrored poses here.
    const phys = sim.registry.get('physics');
    phys._finishNativeRestore();
    assert.equal(await phys.prepareBackend(state), true);
    const restored = [...state.entities.values()].find(e => e.data?.worldRecordId === 'prospector:continue');
    assert.ok(restored);
    state.player.targetId = restored.id;
    const restoredEntry = state.npcJobs.byId[id];
    assert.ok(restoredEntry);
    assert.equal(restoredEntry.job.progress, 0.4, 'no offscreen completion was invented');
    assert.equal(restoredEntry.job.payload.prospectorField.sourceRecordId, sourceId);
    const h = { worker: restored, radio: sim.registry.get('scanner'), bus };
    assert.match(hail(h), /FIELD REPORT.*RECORDED POSITION/);
    assert.equal(state.npcJobs.surveyMarks[state.world.currentSectorId].find(m => m.jobId === id).measuredAt, first.measuredAt);
    measurements = [];
    for (let i = 0; i < 1200 && !measurements.length; i++) sim.step(1 / 60);
    const rebound = restoredEntry._prospectorTarget?.entity;
    assert.ok(rebound, 'world source is rebound to its new live occupant');
    assert.equal(rebound.data.resourceBodyId, sourceId);
    assert.equal(rebound.data.fieldId, source.fieldId);
    assert.equal(rebound.data.asteroidSlotId, source.slotId);
    assert.equal(measurements.length, 1, 'same job resumes and completes physical work');
    assert.equal(measurements[0].fieldId, source.fieldId);
    assert.ok(measurements[0].measuredAt > first.measuredAt);
    assert.equal(restored.data.cargoManifest.totalQty, 0);
    // A real terminal owner record ends this job; the previous report remains a dated ledger fact.
    rebound.alive = false;
    const dead = worldOwner.persistResourceBody(rebound);
    assert.equal(dead.outcome, 'destroyed');
    const last = state.npcJobs.surveyMarks[state.world.currentSectorId].find(m => m.jobId === id).measuredAt;
    sim.step(1 / 60);
    assert.equal(state.npcJobs.byId[id], undefined);
    assert.equal(state.npcJobs.surveyMarks[state.world.currentSectorId].find(m => m.jobId === id).measuredAt, last);
    assert.match(hail(h), /SOURCE UNAVAILABLE/);
  } finally { sim.dispose(); }
});
