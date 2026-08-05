import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { FRESH_RUN_SYSTEMS } from '../src/core/runReset.js';
import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import {
  REGIONAL_ECOLOGY_PROFILES,
  REGIONAL_ECOLOGY_FAMILY_IDS,
  getRegionalEcologyProfile,
  regionalEcologyFamilyDistance,
  validateRegionalEcologyProfile,
} from '../src/data/regionalEcology.js';
import {
  effectiveRegionalSecurity,
  regionalEcology,
  regionalEcologyReadout,
  regionalEncounterWeight,
  regionalResourceYieldMultiplier,
  regionalTrafficRoleWeights,
} from '../src/systems/regionalEcology.js';
import { planEncounters } from '../src/systems/encounterDirector.js';
import { effectiveLawSecurity } from '../src/systems/lawSecurity.js';
import { trafficRoleMixForSector } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';

function makeState(seed = 47) {
  return {
    meta: { seed },
    simTime: 240,
    mode: 'flight',
    playerId: 1,
    player: { heat: 0 },
    entities: new Map([[1, { id: 1, type: 'ship', isPlayer: true, pos: { x: 0, z: 0 } }]]),
    world: {
      currentSectorId: 'sector_ceres_belt',
      sectors: Object.fromEntries(SECTORS.map((sector) => [sector.id, sector])),
      activeSector: { stations: [], fields: [], hazards: [], pois: [], gates: [] },
    },
  };
}

function makeHarness(seed = 47) {
  const state = makeState(seed);
  const bus = createBus();
  const log = [];
  const emit = bus.emit;
  bus.emit = (name, payload) => {
    log.push({ name, payload });
    return emit(name, payload);
  };
  const system = Object.create(regionalEcology);
  system.init({ state, bus, helpers: {} });
  system.newGame();
  return { state, bus, log, system };
}

test('regional ecology catalog covers all 24 regions with bounded distinct identities', () => {
  assert.equal(REGIONAL_ECOLOGY_PROFILES.length, 24);
  assert.deepEqual(
    new Set(REGIONAL_ECOLOGY_PROFILES.map((profile) => profile.sectorId)),
    new Set(SECTORS.map((sector) => sector.id)),
  );
  assert.equal(new Set(REGIONAL_ECOLOGY_PROFILES.map((profile) => profile.fingerprint)).size, 24);
  const liveFamilies = new Set(REGIONAL_ECOLOGY_PROFILES.map((profile) => profile.familyId));
  assert.ok(liveFamilies.size >= 6, `need ≥6 macro-families, got ${liveFamilies.size}`);
  for (const familyId of liveFamilies) {
    assert.ok(REGIONAL_ECOLOGY_FAMILY_IDS.includes(familyId), `unknown family ${familyId}`);
  }
  for (const profile of REGIONAL_ECOLOGY_PROFILES) {
    assert.equal(validateRegionalEcologyProfile(profile), true, profile.sectorId);
    assert.ok(profile.resource.yieldMultiplier >= 0.75 && profile.resource.yieldMultiplier <= 1.35);
    assert.ok(profile.law.security >= 0 && profile.law.security <= 1);
    assert.ok(profile.danger.baseline >= 0 && profile.danger.baseline <= 1);
    assert.ok(Array.isArray(profile.hazards.types));
    assert.ok(profile.faction.net >= 0 && profile.faction.net <= 1);
    assert.ok(profile.poi.hostedCount >= 0);
  }
  assert.equal(getRegionalEcologyProfile('sector_helios_prime').familyId, 'civic_core');
  assert.equal(getRegionalEcologyProfile('sector_ceres_belt').familyId, 'industrial_belt');
  assert.equal(getRegionalEcologyProfile('sector_sker_haven').familyId, 'outlaw_predation');
  assert.equal(getRegionalEcologyProfile('sector_veil_nebula').familyId, 'anomaly_research');
});

test('macro-families are pairwise distinguishable in traffic and encounter mix', () => {
  const byFamily = new Map();
  for (const profile of REGIONAL_ECOLOGY_PROFILES) {
    if (!byFamily.has(profile.familyId)) byFamily.set(profile.familyId, profile);
  }
  assert.ok(byFamily.size >= 6);
  const ids = [...byFamily.keys()].sort();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const dist = regionalEcologyFamilyDistance(byFamily.get(ids[i]), byFamily.get(ids[j]));
      assert.ok(
        dist.total >= 3.5,
        `${ids[i]} vs ${ids[j]} too similar (role=${dist.role.toFixed(2)} enc=${dist.enc.toFixed(2)})`,
      );
      assert.ok(dist.role >= 1.5 || dist.enc >= 1.5, `${ids[i]} vs ${ids[j]} needs role or encounter separation`);
    }
  }
});

test('entering a region publishes one quiet gameplay readout without spawning or alarming', () => {
  const { state, bus, log } = makeHarness();
  const sector = SECTORS.find((row) => row.id === 'sector_ceres_belt');
  bus.emit('sector:enter', { sectorId: sector.id, sector });
  const readout = regionalEcologyReadout(state, sector.id);
  assert.equal(readout.sectorId, sector.id);
  assert.equal(readout.familyId, 'industrial_belt');
  assert.equal(readout.resource.kind, 'metallic');
  assert.ok(readout.summary.includes('Industrial') || readout.summary.includes('industrial') || readout.summary.includes('metallic'));
  assert.ok(Array.isArray(readout.hazards.types));
  assert.ok(readout.hazards.types.includes('dense_asteroid'));
  assert.equal(typeof readout.faction.net, 'number');
  assert.ok(readout.poi.hostedCount >= 1);
  assert.ok(readout.traffic.roleBias.miner > readout.traffic.roleBias.smuggler);
  assert.equal(log.filter((entry) => entry.name === 'regionalEcology:applied').length, 1);
  const applied = log.find((entry) => entry.name === 'regionalEcology:applied');
  assert.equal(applied.payload.fingerprint, readout.fingerprint);
  assert.equal(applied.payload.summary, readout.summary);
  assert.equal(log.some((entry) => ['spawn:request', 'combat:fire', 'alert', 'toast'].includes(entry.name)), false);
});

test('one POI outcome changes real regional inputs once and records its causal fingerprint', () => {
  const { state, bus, log, system } = makeHarness(73);
  const sector = SECTORS.find((row) => row.id === 'sector_ceres_belt');
  bus.emit('sector:enter', { sectorId: sector.id, sector });
  const beforeYield = regionalResourceYieldMultiplier(state, sector.id);
  const beforeTraffic = regionalTrafficRoleWeights(state, sector.id, { hauler: 10, miner: 10, patrol: 10 });
  const outcome = {
    behaviorId: 'poib:sector_ceres_belt:0:mining_field',
    familyId: 'mining_field',
    sectorId: sector.id,
    zoneId: 'zone_ceres_belt',
    outcome: 'worked',
    fingerprint: 'pb_ceres_worked_1',
  };
  bus.emit('poi:behaviorOutcome', outcome);
  bus.emit('poi:behaviorOutcome', outcome);
  const afterYield = regionalResourceYieldMultiplier(state, sector.id);
  const afterTraffic = regionalTrafficRoleWeights(state, sector.id, { hauler: 10, miner: 10, patrol: 10 });
  assert.ok(afterYield < beforeYield, 'worked seam should persist finite depletion');
  assert.ok(afterTraffic.hauler > beforeTraffic.hauler, 'worked seam should attract embodied freight');
  const impulses = log.filter((entry) => entry.name === 'sectorsim:impulse' && entry.payload.fingerprint === outcome.fingerprint);
  assert.equal(impulses.length, 1, 'same causal outcome must never settle twice');
  assert.equal(state.regionalEcology.receipts.length, 1);
  assert.equal(state.regionalEcology.receipts[0].fingerprint, outcome.fingerprint);
  assert.deepEqual(system.serialize(), system.serialize());
});

test('causal aftermath biases counterplay motives until the remedy persists', () => {
  const { state, bus, system } = makeHarness(91);
  const sector = SECTORS.find((row) => row.id === 'sector_io_reach');
  bus.emit('sector:enter', { sectorId: sector.id, sector });
  const shape = { id: 'patrol_beat', weight: 5 };
  const before = regionalEncounterWeight(state, sector.id, shape);
  bus.emit('aftermath:causeRecorded', {
    fingerprint: 'efp_io_predation_1',
    sectorId: sector.id,
    motiveId: 'predation',
    consequenceKind: 'security',
    status: 'open',
  });
  bus.emit('aftermath:causeRecorded', {
    fingerprint: 'efp_io_predation_1',
    sectorId: sector.id,
    motiveId: 'predation',
    consequenceKind: 'security',
    status: 'open',
  });
  const during = regionalEncounterWeight(state, sector.id, shape);
  assert.ok(during > before, 'open predation should bias a lawful counter-response, not another random attack');
  assert.equal(Object.keys(state.regionalEcology.causes).length, 1);

  const saved = system.serialize();
  const loaded = makeHarness(91);
  loaded.system.deserialize(saved);
  loaded.bus.emit('sector:enter', { sectorId: sector.id, sector });
  assert.equal(regionalEncounterWeight(loaded.state, sector.id, shape), during);
  loaded.bus.emit('aftermath:remedied', { fingerprint: 'efp_io_predation_1' });
  assert.equal(regionalEncounterWeight(loaded.state, sector.id, shape), before);
});

test('nest clearance improves law/danger inputs while preserving save determinism', () => {
  const { state, bus, system } = makeHarness(117);
  const sector = SECTORS.find((row) => row.id === 'sector_sker_haven');
  bus.emit('sector:enter', { sectorId: sector.id, sector });
  const beforeSecurity = effectiveRegionalSecurity(state, sector.id, sector.security);
  const beforeDanger = regionalEcologyReadout(state, sector.id).danger.effective;
  bus.emit('poi:behaviorOutcome', {
    behaviorId: 'poib:sector_sker_haven:0:pirate_contested_nest',
    familyId: 'pirate_contested_nest',
    sectorId: sector.id,
    zoneId: 'zone_sker_gatecamp',
    outcome: 'nest_broken',
    fingerprint: 'pb_sker_broken_1',
  });
  assert.ok(effectiveRegionalSecurity(state, sector.id, sector.security) > beforeSecurity);
  assert.ok(regionalEcologyReadout(state, sector.id).danger.effective < beforeDanger);

  const saved = system.serialize();
  const loaded = makeHarness(117);
  loaded.system.deserialize(saved);
  loaded.bus.emit('sector:enter', { sectorId: sector.id, sector });
  assert.deepEqual(loaded.system.serialize(), saved);
  assert.deepEqual(regionalEcologyReadout(loaded.state, sector.id), regionalEcologyReadout(state, sector.id));
});

test('world asteroid yield and traffic role mix consume durable ecology inputs', () => {
  const baseHarness = makeHarness(211);
  const changedHarness = makeHarness(211);
  const sector = SECTORS.find((row) => row.id === 'sector_ceres_belt');
  for (const harness of [baseHarness, changedHarness]) {
    harness.bus.emit('sector:enter', { sectorId: sector.id, sector });
  }
  changedHarness.bus.emit('poi:behaviorOutcome', {
    behaviorId: 'poib:sector_ceres_belt:0:mining_field',
    familyId: 'mining_field',
    sectorId: sector.id,
    zoneId: 'zone_ceres_belt',
    outcome: 'worked',
    fingerprint: 'pb_ceres_world_integration',
  });

  const spawnAsteroid = (state) => {
    const system = Object.create(world);
    let nextId = 10;
    system.state = state;
    system.helpers = {
      hash32,
      mulberry32,
      spawnEntity(spec) {
        const entity = { id: nextId++, alive: true, data: {}, ...spec };
        state.entities.set(entity.id, entity);
        return entity;
      },
    };
    const values = [0.15, 0.36, 0.62, 0.48, 0.70];
    let index = 0;
    const rng = () => values[index++ % values.length];
    return system._spawnAsteroid(
      { id: 'field_ceres_probe', type: 'ast_metallic' },
      { tierCap: 4, respawnSec: 120, _homeSectorId: sector.id },
      { x: 0, z: 0 },
      300,
      rng,
    );
  };

  const baseAsteroid = spawnAsteroid(baseHarness.state);
  const changedAsteroid = spawnAsteroid(changedHarness.state);
  assert.ok(changedAsteroid.data.yieldU < baseAsteroid.data.yieldU);
  assert.equal(changedAsteroid.data.ecologyFingerprint, getRegionalEcologyProfile(sector.id).fingerprint);

  const baseMix = trafficRoleMixForSector(sector, baseHarness.state);
  const changedMix = trafficRoleMixForSector(sector, changedHarness.state);
  assert.ok(changedMix.hauler > baseMix.hauler);
  assert.ok(baseMix.miner > baseMix.smuggler);
});

test('law and encounter planners consume ecology without authorizing ambient aggression', () => {
  const { state, bus } = makeHarness(307);
  const sector = SECTORS.find((row) => row.id === 'sector_io_reach');
  state.world.currentSectorId = sector.id;
  bus.emit('sector:enter', { sectorId: sector.id, sector });
  assert.equal(effectiveLawSecurity(state), effectiveRegionalSecurity(state, sector.id, sector.security));

  let baselinePatrolWeight = 0;
  for (let seed = 1; seed <= 160; seed++) {
    for (const item of planEncounters(seed, sector.id, 3, zonesForSector(sector.id), state)) {
      if (item.shapeId === 'patrol_beat') baselinePatrolWeight += item.regionalWeight || 0;
    }
  }
  bus.emit('aftermath:causeRecorded', {
    fingerprint: 'efp_io_planner_predation',
    sectorId: sector.id,
    motiveId: 'predation',
    consequenceKind: 'security',
    status: 'open',
  });
  let counterPatrolWeight = 0;
  for (let seed = 1; seed <= 160; seed++) {
    for (const item of planEncounters(seed, sector.id, 3, zonesForSector(sector.id), state)) {
      if (item.shapeId === 'patrol_beat') counterPatrolWeight += item.regionalWeight || 0;
    }
  }
  assert.ok(counterPatrolWeight > baselinePatrolWeight);
  assert.equal(state.regionalEcology.causes.efp_io_planner_predation.status, 'open');
});

test('registry and save pipeline wire ecology before sector materialization', () => {
  const saveSource = readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  const worldUpdateIndex = PRODUCTION_UPDATE_ORDER.indexOf('world');
  const ecologyUpdateIndex = PRODUCTION_UPDATE_ORDER.indexOf('regionalEcology');
  const encounterUpdateIndex = PRODUCTION_UPDATE_ORDER.indexOf('encounterDirector');
  assert.ok(worldUpdateIndex >= 0 && worldUpdateIndex < ecologyUpdateIndex
    && ecologyUpdateIndex < encounterUpdateIndex);
  const worldResetIndex = FRESH_RUN_SYSTEMS.indexOf('world');
  const ecologyResetIndex = FRESH_RUN_SYSTEMS.indexOf('regionalEcology');
  const factionsResetIndex = FRESH_RUN_SYSTEMS.indexOf('factions');
  assert.ok(worldResetIndex >= 0 && worldResetIndex < ecologyResetIndex
    && ecologyResetIndex < factionsResetIndex);
  assert.match(saveSource, /data\.regionalEcology = this\._callSerialize\('regionalEcology'\)/);
  const restoreEcology = saveSource.indexOf("this._callDeserialize('regionalEcology'");
  const enterSectorCall = /worldSys\.enterSector\(sectorId\s*,\s*(?:options|\{[\s\S]*?\})\s*\)/.exec(saveSource);
  const enterSector = enterSectorCall ? enterSectorCall.index : -1;
  assert.ok(restoreEcology >= 0 && enterSector > restoreEcology);
});
