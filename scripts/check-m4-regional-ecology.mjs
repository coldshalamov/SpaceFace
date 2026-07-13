#!/usr/bin/env node
/**
 * Named acceptance gate for Milestone 4 regional ecology.
 *
 * Proves: 24 unique fingerprints, ≥6 macro-families pairwise distinguishable,
 * validation, consumer seams (traffic/world/encounter/law), durable aftermath,
 * bounded state growth, and focused unit tests.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  REGIONAL_ECOLOGY_PROFILES,
  REGIONAL_ECOLOGY_FAMILY_IDS,
  getRegionalEcologyProfile,
  regionalEcologyFamilyDistance,
  validateRegionalEcologyProfile,
} from '../src/data/regionalEcology.js';
import {
  regionalEcology,
  regionalEcologyReadout,
  regionalEncounterWeight,
  regionalResourceYieldMultiplier,
  regionalTrafficDensityMultiplier,
  regionalTrafficRoleWeights,
  effectiveRegionalSecurity,
} from '../src/systems/regionalEcology.js';
import { trafficRoleMixForSector } from '../src/systems/traffic.js';
import { planEncounters } from '../src/systems/encounterDirector.js';
import { createBus } from '../src/core/eventBus.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
  const system = Object.create(regionalEcology);
  system.init({ state, bus, helpers: {} });
  system.newGame();
  return { state, bus, system };
}

// ── Catalog coverage ──────────────────────────────────────────────────────────
assert.equal(REGIONAL_ECOLOGY_PROFILES.length, 24, 'catalog must cover 24 regions');
assert.equal(
  new Set(REGIONAL_ECOLOGY_PROFILES.map((p) => p.fingerprint)).size,
  24,
  'each region needs a unique fingerprint',
);
assert.deepEqual(
  new Set(REGIONAL_ECOLOGY_PROFILES.map((p) => p.sectorId)),
  new Set(SECTORS.map((s) => s.id)),
);

const byFamily = new Map();
for (const profile of REGIONAL_ECOLOGY_PROFILES) {
  assert.equal(validateRegionalEcologyProfile(profile), true, `invalid profile ${profile.sectorId}`);
  assert.ok(REGIONAL_ECOLOGY_FAMILY_IDS.includes(profile.familyId), profile.familyId);
  if (!byFamily.has(profile.familyId)) byFamily.set(profile.familyId, profile);
}
assert.ok(byFamily.size >= 6, `need ≥6 macro-families, got ${byFamily.size}`);

const familyIds = [...byFamily.keys()].sort();
const distances = [];
for (let i = 0; i < familyIds.length; i++) {
  for (let j = i + 1; j < familyIds.length; j++) {
    const dist = regionalEcologyFamilyDistance(byFamily.get(familyIds[i]), byFamily.get(familyIds[j]));
    distances.push({ a: familyIds[i], b: familyIds[j], ...dist });
    assert.ok(dist.total >= 3.5, `${familyIds[i]} vs ${familyIds[j]} not distinguishable (total=${dist.total})`);
  }
}

// Anchored story-core identities (player-legible anchors).
assert.equal(getRegionalEcologyProfile('sector_helios_prime').familyId, 'civic_core');
assert.equal(getRegionalEcologyProfile('sector_ceres_belt').familyId, 'industrial_belt');
assert.equal(getRegionalEcologyProfile('sector_tethys_junction').familyId, 'trade_corridor');
assert.equal(getRegionalEcologyProfile('sector_sker_haven').familyId, 'outlaw_predation');
assert.equal(getRegionalEcologyProfile('sector_veil_nebula').familyId, 'anomaly_research');

// ── Determinism: static catalog is pure ───────────────────────────────────────
assert.deepEqual(
  REGIONAL_ECOLOGY_PROFILES.map((p) => p.fingerprint),
  REGIONAL_ECOLOGY_PROFILES.map((p) => getRegionalEcologyProfile(p.sectorId).fingerprint),
);

// ── Consumer seams + aftermath continuity ─────────────────────────────────────
const { state, bus, system } = makeHarness(91);
const ceres = SECTORS.find((s) => s.id === 'sector_ceres_belt');
const io = SECTORS.find((s) => s.id === 'sector_io_reach');
const sker = SECTORS.find((s) => s.id === 'sector_sker_haven');

bus.emit('sector:enter', { sectorId: ceres.id, sector: ceres });
const ceresReadout = regionalEcologyReadout(state, ceres.id);
assert.ok(ceresReadout);
assert.ok(ceresReadout.summary);
assert.ok(ceresReadout.hazards.types.includes('dense_asteroid'));
assert.ok(regionalTrafficDensityMultiplier(state, ceres.id) > 0);
assert.ok(regionalResourceYieldMultiplier(state, ceres.id) > 0);
const baseMix = trafficRoleMixForSector(ceres, state);
assert.ok(baseMix.miner > baseMix.smuggler, 'industrial belt tilts miner over smuggler');

// POI outcome settles once, mutates yield, and bounds receipts.
const beforeYield = regionalResourceYieldMultiplier(state, ceres.id);
bus.emit('poi:behaviorOutcome', {
  behaviorId: 'poib:sector_ceres_belt:0:mining_field',
  familyId: 'mining_field',
  sectorId: ceres.id,
  zoneId: 'zone_ceres_belt',
  outcome: 'worked',
  fingerprint: 'pb_check_ceres_worked',
});
bus.emit('poi:behaviorOutcome', {
  behaviorId: 'poib:sector_ceres_belt:0:mining_field',
  familyId: 'mining_field',
  sectorId: ceres.id,
  zoneId: 'zone_ceres_belt',
  outcome: 'worked',
  fingerprint: 'pb_check_ceres_worked',
});
assert.ok(regionalResourceYieldMultiplier(state, ceres.id) < beforeYield);
assert.equal(state.regionalEcology.receipts.length, 1);

// Aftermath counterplay bias + save/reload equality.
bus.emit('sector:enter', { sectorId: io.id, sector: io });
const shape = { id: 'patrol_beat', weight: 5 };
const before = regionalEncounterWeight(state, io.id, shape);
bus.emit('aftermath:causeRecorded', {
  fingerprint: 'efp_check_io_predation',
  sectorId: io.id,
  motiveId: 'predation',
  consequenceKind: 'security',
  status: 'open',
});
const during = regionalEncounterWeight(state, io.id, shape);
assert.ok(during > before, 'open predation should raise lawful counter weight');

const saved = system.serialize();
assert.ok(Object.keys(saved.sectors || {}).length <= 24);
assert.ok((saved.receipts || []).length <= 96);
assert.ok(Object.keys(saved.causes || {}).length <= 48);

const reloaded = makeHarness(91);
reloaded.system.deserialize(saved);
reloaded.bus.emit('sector:enter', { sectorId: io.id, sector: io });
assert.deepEqual(reloaded.system.serialize(), saved);
assert.equal(regionalEncounterWeight(reloaded.state, io.id, shape), during);

// Lawful security seam + nest clearance improves law.
bus.emit('sector:enter', { sectorId: sker.id, sector: sker });
const beforeSec = effectiveRegionalSecurity(state, sker.id, sker.security);
bus.emit('poi:behaviorOutcome', {
  behaviorId: 'poib:sector_sker_haven:0:pirate_contested_nest',
  familyId: 'pirate_contested_nest',
  sectorId: sker.id,
  zoneId: 'zone_sker_gatecamp',
  outcome: 'nest_broken',
  fingerprint: 'pb_check_sker_nest',
});
assert.ok(effectiveRegionalSecurity(state, sker.id, sker.security) > beforeSec);

// Encounter planner consumes ecology weights without ambient aggression path.
state.world.currentSectorId = io.id;
let patrolWeight = 0;
for (let seed = 1; seed <= 40; seed++) {
  for (const item of planEncounters(seed, io.id, 3, zonesForSector(io.id), state)) {
    if (item.shapeId === 'patrol_beat') patrolWeight += item.regionalWeight || 0;
  }
}
assert.ok(patrolWeight > 0, 'planner must emit regionalWeight for patrol_beat under ecology');

// Role-weight helper remains finite and non-negative.
const weights = regionalTrafficRoleWeights(state, ceres.id, { hauler: 10, miner: 10, patrol: 10, pirate: 10 });
for (const [role, w] of Object.entries(weights)) {
  assert.ok(w >= 0 && Number.isFinite(w), `role weight ${role}=${w}`);
}

// Determinism: no Math.random / wall-clock in ecology owners.
for (const rel of [
  'src/data/regionalEcology.js',
  'src/systems/regionalEcology.js',
]) {
  const source = readFileSync(join(ROOT, rel), 'utf8');
  assert.doesNotMatch(source, /Math\.random\s*\(/, `${rel} must stay deterministic`);
  assert.doesNotMatch(source, /Date\.now\s*\(|performance\.now\s*\(/, `${rel} cannot use wall time`);
}

// Registry wiring still present (ecology before encounter director in newGame order).
const registrySource = readFileSync(join(ROOT, 'src/core/registry.js'), 'utf8');
assert.match(registrySource, /regionalEcology/);
assert.ok(registrySource.indexOf('world, regionalEcology, encounterDirector') >= 0);

// Focused unit suite.
const child = spawnSync(process.execPath, ['--test', 'test/m4-regional-ecology.test.mjs'], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
assert.equal(child.status, 0, 'm4-regional-ecology unit tests must pass');

const familySummary = familyIds.map((id) => {
  const members = REGIONAL_ECOLOGY_PROFILES.filter((p) => p.familyId === id).map((p) => p.sectorId);
  return `${id}(${members.length})`;
}).join(', ');

console.log(`M4 regional ecology PASS — 24 unique fingerprints · ${byFamily.size} macro-families: ${familySummary}`);
console.log(`  min pairwise family distance total=${Math.min(...distances.map((d) => d.total)).toFixed(2)}`);
console.log('  seams: traffic · world yield · encounter weights · law security · aftermath save/reload');
