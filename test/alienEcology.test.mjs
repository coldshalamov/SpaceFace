import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALIEN_SITES,
  CONTAMINATION_BANDS,
  alienSitesForSector,
  alienStrainById,
  contaminationAt,
  contaminationBand,
  contaminationFromComponents,
  ecologyEncounterWeights,
  planFaunaCast,
  planInfestationModules,
  scannerBiologyLabel,
} from '../src/data/alienEcology.js';
import { FAUNA_SPECIES, faunaSpeciesById } from '../src/data/alienFauna.js';
import { createAlienEcologyState, ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { validateWorldSiteManifest } from '../src/systems/worldSiteKernel.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  deserializeAlienEcologyState,
  handleAlienEcologyEvent,
  materializeAlienEcology,
  refreshAlienLabels,
  serializeAlienEcologyState,
  setRevelation,
  tickAlienEcology,
} from '../src/systems/alienEcology.js';

const NURSERY = ALIEN_SITES.cinder_nursery;

function makeState() {
  return {
    meta: { seed: 47 },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_charon_expanse', sectors: {} },
  };
}

// Minimal world stub: the real seams are helpers.mulberry32/hash32/spawnEntity, _toGlobal, bus.
function makeWorld(state, spawnLog) {
  return {
    state,
    helpers: {
      mulberry32,
      hash32,
      spawnEntity: (spec) => {
        const e = { ...spec, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
        e.id = state.entities.size + 1;
        state.entities.set(e.id, e);
        state.entityList.push(e);
        spawnLog.push(e);
        return e;
      },
    },
    _toGlobal: (local) => ({ x: local.x, z: local.z }), // identity: site coords only need consistency
    bus: { emit: () => {} },
  };
}

test('contamination model: components clamp to [0,1] and map to bands C0–C5', () => {
  assert.equal(contaminationFromComponents({}), 0);
  assert.equal(contaminationFromComponents({ geometry: 0.4, leakage: 0.4, topology: 0.4, ecologySupport: 0.4 }), 1);
  assert.equal(contaminationBand(0), 'C0');
  assert.equal(contaminationBand(0.05), 'C1');
  assert.equal(contaminationBand(0.5), 'C3');
  assert.equal(contaminationBand(0.99), 'C5');
  assert.equal(CONTAMINATION_BANDS.length, 6);
});

test('scanner vocabulary is revelation-gated, not distance-gated', () => {
  assert.equal(scannerBiologyLabel(0, 'site'), 'CORROSION ANOMALY');
  assert.equal(scannerBiologyLabel(1, 'growth'), 'ORGANIC MASS');
  assert.equal(scannerBiologyLabel(2, 'fauna'), 'COLONIAL FAUNA — BIOLOGICAL');
  assert.equal(scannerBiologyLabel(3, 'relay'), 'VETHARI RELAY NODE');
  // Revelation is monotonic — a higher tier never degrades to unknown terms.
  assert.notEqual(scannerBiologyLabel(3, 'site'), scannerBiologyLabel(0, 'site'));
});

test('cinder nursery sits in charon expanse on a derelict-field contamination lean', () => {
  const sites = alienSitesForSector('sector_charon_expanse');
  assert.equal(sites.length, 1);
  assert.equal(sites[0].siteId, 'cinder_nursery');
  assert.equal(sites[0].worldSiteId, 'world_site_charon_cinder_nursery');
  const zone = zonesForSector('sector_charon_expanse').find((z) => z.id === NURSERY.zoneId);
  assert.ok(zone, 'nursery zone exists');
  assert.equal(zone.type, 'derelict_field');
  assert.ok(contaminationAt({}, 'sector_charon_expanse') > contaminationAt({}, 'sector_helios_prime'));
  const weights = ecologyEncounterWeights({}, 'sector_charon_expanse');
  assert.ok(weights.anomalyBias > 1);
  assert.ok(weights.contamination > 0);
});

test('planners are deterministic for a given seed stream', () => {
  const a = planInfestationModules(NURSERY, mulberry32(7));
  const b = planInfestationModules(NURSERY, mulberry32(7));
  assert.deepEqual(a, b);
  assert.equal(a.length, NURSERY.growthRing.count);
  const castA = planFaunaCast(NURSERY, mulberry32(11));
  const castB = planFaunaCast(NURSERY, mulberry32(11));
  assert.deepEqual(castA, castB);
  assert.equal(castA.filter((m) => m.speciesId === 'needle_swarm').length, NURSERY.faunaCast.needle_swarm);
  assert.equal(castA.filter((m) => m.speciesId === 'blind_shepherd').length, 1);
});

test('materializeAlienEcology seeds growth dressing + the fauna cast deterministically', () => {
  const run = () => {
    const state = makeState();
    const log = [];
    const world = makeWorld(state, log);
    const active = { dressing: [] };
    materializeAlienEcology(world, { id: 'sector_charon_expanse' }, active);
    return { state, log, active };
  };
  const first = run();
  const second = run();
  const fauna = first.log;
  const growth = first.active.dressing.filter((d) => d.placeId && d.placeId.startsWith('alien_growth_'));
  assert.equal(fauna.length, 10); // 6 swarm + 2 ray + 1 shepherd + 1 leech
  assert.equal(growth.length, NURSERY.growthRing.count);
  assert.deepEqual(fauna.map((e) => [e.type, e.pos.x, e.pos.z]), second.log.map((e) => [e.type, e.pos.x, e.pos.z]));
  for (const e of fauna) {
    assert.equal(e.type, 'fauna');
    assert.equal(e.collides, false);
    assert.equal(e.physicsBody, false);
    assert.equal(e.data.ecology.driveState, 'drift');
    assert.equal(e.data.strainId, 'charon_grave');
    assert.ok(e.data.scanLabel.length > 0);
  }
});

test('killed fauna never respawn: deadFauna excludes them on re-materialize', () => {
  const state = makeState();
  const log = [];
  const world = makeWorld(state, log);
  materializeAlienEcology(world, { id: 'sector_charon_expanse' }, { dressing: [] });
  const victim = state.entityList.find((e) => e.type === 'fauna');
  handleAlienEcologyEvent(world, 'entity:killed', { id: victim.id });
  const before = state.entityList.length;
  materializeAlienEcology(world, { id: 'sector_charon_expanse' }, { dressing: [] });
  assert.equal(state.entityList.length - before, 9); // one of ten stays dead
});

test('site events drive the arc: power wakes, sever breaks coherence, black box completes', () => {
  const state = makeState();
  const world = makeWorld(state, []);
  handleAlienEcologyEvent(world, 'alienEcology:nurseryPowered', { siteId: 'cinder_nursery' });
  let rec = ensureAlienEcologyState(state).sites.cinder_nursery;
  assert.equal(rec.state, 'awake');
  assert.equal(ensureAlienEcologyState(state).revelation, 1);
  handleAlienEcologyEvent(world, 'alienEcology:relaySevered', { siteId: 'cinder_nursery' });
  assert.equal(rec.state, 'severed');
  assert.equal(ensureAlienEcologyState(state).revelation, 2);
  handleAlienEcologyEvent(world, 'alienEcology:blackBoxRecovered', { siteId: 'cinder_nursery' });
  const ae = ensureAlienEcologyState(state);
  assert.equal(rec.objectiveDone, true);
  assert.equal(ae.taxonomy.filamentousContamination, true);
  assert.equal(ae.machineProtocol, 'observed');
  assert.equal(ae.revelation, 3);
  // Revelation is monotonic: re-severing cannot roll knowledge back.
  handleAlienEcologyEvent(world, 'alienEcology:relaySevered', { siteId: 'cinder_nursery' });
  assert.equal(ae.revelation, 3);
});

test('tick moves fauna kinematically and severed relay slows their reaction', () => {
  const state = makeState();
  const log = [];
  const world = makeWorld(state, log);
  materializeAlienEcology(world, { id: 'sector_charon_expanse' }, { dressing: [] });
  const player = { id: 1, pos: { x: 1700, z: -1400 } }; // at the site → inside alertR
  state.entities.set(1, player);
  state.entityList.push(player);
  const swarm = state.entityList.find((e) => e.type === 'fauna' && e.data.ecology.speciesId === 'needle_swarm');
  const posBefore = { ...swarm.pos };
  for (let i = 0; i < 120; i += 1) { state.simTime += 1 / 60; tickAlienEcology(world, 1 / 60); }
  assert.notDeepEqual(swarm.pos, posBefore); // it steered
  assert.notEqual(swarm.data.ecology.driveState, 'drift'); // stimulus promoted the drive

  // Severed relay: reaction requires accumulated stimulus time.
  const state2 = makeState();
  const world2 = makeWorld(state2, []);
  materializeAlienEcology(world2, { id: 'sector_charon_expanse' }, { dressing: [] });
  handleAlienEcologyEvent(world2, 'alienEcology:relaySevered', { siteId: 'cinder_nursery' });
  state2.entities.set(1, { id: 1, pos: { x: 1700, z: -1400 } });
  state2.entityList.push(state2.entities.get(1));
  const swarm2 = state2.entityList.find((e) => e.type === 'fauna' && e.data.ecology.speciesId === 'needle_swarm');
  tickAlienEcology(world2, 1 / 60); // one tick of stimulus, below the latency floor
  assert.equal(swarm2.data.ecology.driveState, 'drift'); // has not reacted yet
  for (let i = 0; i < 600; i += 1) { state2.simTime += 1 / 60; tickAlienEcology(world2, 1 / 60); }
  assert.notEqual(swarm2.data.ecology.driveState, 'drift'); // reacted after latency
});

test('alienEcology state serializes and round-trips with validation', () => {
  const state = makeState();
  const world = makeWorld(state, []);
  handleAlienEcologyEvent(world, 'alienEcology:nurseryPowered', { siteId: 'cinder_nursery' });
  setRevelation(state, 2);
  const saved = serializeAlienEcologyState(state);
  const restored = makeState();
  deserializeAlienEcologyState(restored, JSON.parse(JSON.stringify(saved)));
  const ae = ensureAlienEcologyState(restored);
  assert.equal(ae.revelation, 2);
  assert.equal(ae.sites.cinder_nursery.state, 'awake');
  // Garbage input is ignored, not fatal.
  const blank = makeState();
  deserializeAlienEcologyState(blank, { schema: 'bogus' });
  assert.equal(ensureAlienEcologyState(blank).revelation, 0);
  assert.equal(createAlienEcologyState().schema, 'spaceface.alienEcology.v1');
});

test('relay sever is a permanent axis: a later bloom never restores coherence', () => {
  const state = makeState();
  const world = makeWorld(state, []);
  materializeAlienEcology(world, { id: 'sector_charon_expanse' }, { dressing: [] });
  handleAlienEcologyEvent(world, 'alienEcology:relaySevered', { siteId: 'cinder_nursery' });
  handleAlienEcologyEvent(world, 'alienEcology:nurseryBloom', { siteId: 'cinder_nursery' });
  const rec = ensureAlienEcologyState(state).sites.cinder_nursery;
  assert.equal(rec.relaySevered, true);
  assert.equal(rec.state, 'severed'); // bloom must not overwrite the severed stage
  state.entities.set(1, { id: 1, pos: { x: 1700, z: -1400 } });
  state.entityList.push(state.entities.get(1));
  const swarm = state.entityList.find((e) => e.type === 'fauna' && e.data.ecology.speciesId === 'needle_swarm');
  tickAlienEcology(world, 1 / 60);
  assert.equal(swarm.data.ecology.driveState, 'drift'); // still latency-gated, not re-cohered
  // Legacy saves carrying only state:'severed' deserialize into the flag.
  const saved = serializeAlienEcologyState(state);
  delete saved.sites.cinder_nursery.relaySevered;
  const restored = makeState();
  deserializeAlienEcologyState(restored, JSON.parse(JSON.stringify(saved)));
  assert.equal(ensureAlienEcologyState(restored).sites.cinder_nursery.relaySevered, true);
});

test('spawned fauna names obey the reveal ladder, not the taxonomy table', () => {
  const state = makeState();
  const world = makeWorld(state, []);
  materializeAlienEcology(world, { id: 'sector_charon_expanse' }, { dressing: [] });
  const ray = state.entityList.find((e) => e.type === 'fauna' && e.data.ecology.speciesId === 'veil_ray');
  assert.equal(ray.data.name, scannerBiologyLabel(0, 'fauna')); // 'DEBRIS DRIFT', not 'Veil-Ray'
  setRevelation(state, 3);
  refreshAlienLabels(world);
  assert.equal(ray.data.name, 'Veil-Ray'); // revealed knowledge upgrades the display name
});

test('released payload depletion persists: remainingPool survives normalize + narrows the plan', async () => {
  const { normalizeWorldSiteRecord, planWorldSiteMaterialization, createWorldSiteRecord, applyWorldSiteOperation }
    = await import('../src/systems/worldSiteKernel.js');
  const manifest = worldSiteManifestById('world_site_charon_cinder_nursery');
  let record = createWorldSiteRecord(manifest, { tick: 0 });
  // Drive the authored chain: power → unseal releases the flight recorder pod.
  record = applyWorldSiteOperation(manifest, record, {
    operationId: 'restore_power_bus', requestStreamId: 'player-industrial-beam',
    requestSequence: 1, tick: 1, amount: 99, earnedAtS: 0,
  }).record;
  record = applyWorldSiteOperation(manifest, record, {
    operationId: 'unseal_black_box', requestStreamId: 'player-industrial-beam',
    requestSequence: 2, tick: 2, amount: 99, earnedAtS: 0,
  }).record;
  assert.equal(record.payloads.dmc_black_box.status, 'released');
  // Fresh plan: full authored pool.
  let plan = planWorldSiteMaterialization(manifest, normalizeWorldSiteRecord(manifest, record), { tick: 3 });
  assert.equal(plan.payloads.length, 1);
  assert.equal(plan.payloads[0].salvagePool.cmdty_dmc_black_box, 1);
  // Player took the recorder → durable remainder is empty → the pod never respawns.
  record.payloads.dmc_black_box.remainingPool = {};
  plan = planWorldSiteMaterialization(manifest, normalizeWorldSiteRecord(manifest, record), { tick: 4 });
  assert.equal(plan.payloads.length, 0);
  // Partial pools narrow to what remains (filament sample: 1 of 3 taken). Status is derived
  // from the op chain, so release it through the authored operation before trimming the pool.
  record = applyWorldSiteOperation(manifest, record, {
    operationId: 'extract_cyst_cluster', requestStreamId: 'player-industrial-beam',
    requestSequence: 3, tick: 5, amount: 99, earnedAtS: 0,
  }).record;
  assert.equal(record.payloads.filament_sample.status, 'released');
  record.payloads.filament_sample.remainingPool = { cmdty_filament_sample: 2 };
  plan = planWorldSiteMaterialization(manifest, normalizeWorldSiteRecord(manifest, record), { tick: 6 });
  const sample = plan.payloads.find((p) => p.payloadId === 'filament_sample');
  assert.equal(sample.salvagePool.cmdty_filament_sample, 2);
});

test('nursery manifest passes the world-site validator end to end', () => {
  const manifest = worldSiteManifestById('world_site_charon_cinder_nursery');
  assert.ok(manifest, 'manifest registered');
  const report = validateWorldSiteManifest(manifest);
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  // The four slice operations are the authored verbs.
  const ops = new Set(manifest.operations.map((o) => o.id));
  for (const op of ['restore_power_bus', 'sever_relay_node', 'unseal_black_box', 'extract_cyst_cluster']) {
    assert.ok(ops.has(op), op);
  }
  assert.equal(alienStrainById(NURSERY.strainId).id, 'charon_grave');
  for (const id of Object.keys(NURSERY.faunaCast)) assert.ok(FAUNA_SPECIES[id], id);
  assert.ok(faunaSpeciesById('blind_shepherd').relay);
});
