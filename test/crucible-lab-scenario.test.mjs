// CRU-008 — Combat Lab physics-swarm parity for the deterministic Lab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SIM_SCENARIO_SCHEMA,
  validateSimScenario,
  compileSimScenario,
} from '../src/contracts/simScenarioSchema.js';
import {
  resolveEntityProfile,
  buildEntitySpawnSpec,
  listEntityProfiles,
} from '../src/testing/lab/entityProfiles.js';
import {
  COMBAT_LAB_STARTER_PACKAGES,
  COMBAT_LAB_ENEMY_PACKAGES,
} from '../src/data/combatLabSetups.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SCENARIO_PATH = join(ROOT, '../src/testing/scenarios/crucible-physics-swarm.scenario.json');
const SCENARIO = JSON.parse(readFileSync(SCENARIO_PATH, 'utf8'));

const STARTER_PACKAGE_ID = 'physics_toolkit';
const ENEMY_PACKAGE_ID = 'physics_swarm';

function dummyState() {
  return { player: { credits: 100000 }, playerId: 1 };
}

function compiledEntities() {
  const compiled = compileSimScenario(SCENARIO);
  assert.equal(compiled.ok, true, 'compile must succeed before entity materialization');
  return compiled.canonical.entities;
}

function loadoutDefIds(loadout) {
  if (!Array.isArray(loadout)) return [];
  return loadout.map((item) => (typeof item === 'string' ? item : item && item.defId)).filter(Boolean);
}

test('crucible physics-swarm scenario validates with zero issues', () => {
  const v = validateSimScenario(SCENARIO, { file: SCENARIO_PATH });
  assert.equal(v.ok, true, JSON.stringify(v.issues, null, 2));
  assert.equal(v.issueCount, 0);
});

test('crucible physics-swarm compiles', () => {
  const compiled = compileSimScenario(SCENARIO, { file: SCENARIO_PATH });
  assert.equal(compiled.ok, true, JSON.stringify(compiled.validation && compiled.validation.issues, null, 2));
  assert.ok(compiled.canonical);
  assert.equal(compiled.canonical.id, SCENARIO.id);
});

test('crucible physics-swarm schema is frozen simScenario.v1', () => {
  assert.equal(SCENARIO.schema, SIM_SCENARIO_SCHEMA);
  assert.equal(SIM_SCENARIO_SCHEMA, 'spaceface.simScenario.v1');
});

test('every scenario entity resolves and materializes without error', () => {
  const state = dummyState();
  const entities = compiledEntities();
  assert.ok(entities.length > 0);
  for (const ent of entities) {
    const profile = resolveEntityProfile(ent.profile);
    assert.ok(profile, `profile ${ent.profile}`);
    const built = buildEntitySpawnSpec(ent, state);
    assert.ok(built && built.spec, `spawn spec for ${ent.alias}`);
    assert.equal(built.profile.profileId, profile.profileId);
  }
});

test('scenario hull, fitted modules, and enemy counts match Combat Lab packages', () => {
  const starter = COMBAT_LAB_STARTER_PACKAGES.find((pkg) => pkg.id === STARTER_PACKAGE_ID);
  const enemyPkg = COMBAT_LAB_ENEMY_PACKAGES.find((pkg) => pkg.id === ENEMY_PACKAGE_ID);
  assert.ok(starter, `starter package ${STARTER_PACKAGE_ID}`);
  assert.ok(enemyPkg, `enemy package ${ENEMY_PACKAGE_ID}`);

  const player = (SCENARIO.entities || []).find((ent) => ent && ent.isPlayer);
  assert.ok(player, 'scenario has a player entity');
  const hull = resolveEntityProfile(player.profile);
  assert.equal(hull.kind, 'ship');
  assert.equal(hull.shipId, starter.hullId);

  assert.deepEqual(
    loadoutDefIds(player.loadout),
    starter.loadout.map((entry) => entry.defId),
  );

  const counts = new Map();
  for (const ent of SCENARIO.entities || []) {
    if (!ent || ent.isPlayer) continue;
    const profile = resolveEntityProfile(ent.profile);
    if (profile.kind !== 'enemy') continue;
    counts.set(profile.enemyTypeId, (counts.get(profile.enemyTypeId) || 0) + 1);
  }

  const expectedCounts = new Map();
  for (const entry of enemyPkg.entries) {
    expectedCounts.set(entry.enemyId, (expectedCounts.get(entry.enemyId) || 0) + entry.count);
  }
  assert.deepEqual(
    Object.fromEntries([...counts.entries()].sort()),
    Object.fromEntries([...expectedCounts.entries()].sort()),
  );
  const expectedTotal = enemyPkg.entries.reduce((sum, entry) => sum + entry.count, 0);
  assert.equal([...counts.values()].reduce((sum, n) => sum + n, 0), expectedTotal);
});

test('enemy-archetype profile stamps spawnContext encounter via makeEnemySpawnSpec', () => {
  const profile = resolveEntityProfile('wasp_swarmer');
  assert.equal(profile.kind, 'enemy');
  assert.equal(profile.enemyTypeId, 'wasp_swarmer');

  const built = buildEntitySpawnSpec({
    alias: 'hostile_probe',
    profile: 'wasp_swarmer',
    role: 'hostile',
    team: 1,
    pos: { x: 40, z: -10 },
    vel: { x: 0, z: 0 },
    heading: 0,
    overrides: {},
    persistent: true,
  }, dummyState());

  assert.equal(built.spec.team, 1);
  assert.equal(built.spec.data.ai.spawnContext, 'encounter');
  assert.equal(
    isHostileToPlayer(built.spec, 0, dummyState()),
    true,
    'encounter spawnContext must make the spec hostile to the player',
  );
});

test('enemy entity that omits team stays the builder hostile team, not a compiled friend', () => {
  const doc = JSON.parse(JSON.stringify(SCENARIO));
  doc.entities = [
    doc.entities.find((ent) => ent && ent.isPlayer),
    {
      alias: 'no_team_wasp',
      profile: 'wasp_swarmer',
      role: 'hostile',
      pos: { x: 40, z: -10 },
      vel: { x: 0, z: 0 },
      heading: 0,
      persistent: true,
    },
  ];
  const compiled = compileSimScenario(doc);
  assert.equal(compiled.ok, true, JSON.stringify(compiled.validation && compiled.validation.issues));
  const ent = compiled.canonical.entities.find((row) => row.alias === 'no_team_wasp');
  assert.ok(ent, 'compiled omitted-team enemy');
  assert.equal(ent.team, 0, 'compiler default for a missing team field is 0');

  const built = buildEntitySpawnSpec(ent, dummyState());
  assert.notEqual(built.spec.team, 0);
  assert.equal(built.spec.team, 1);
  assert.equal(
    isHostileToPlayer(built.spec, 0, dummyState()),
    true,
    'omitted team must not compile into a friend',
  );
});

test('enemy overrides.dynamic false is honoured and unknown override keys are reported', () => {
  const base = {
    alias: 'hostile_probe',
    profile: 'wasp_swarmer',
    role: 'hostile',
    pos: { x: 40, z: -10 },
    vel: { x: 0, z: 0 },
    heading: 0,
    persistent: true,
  };
  const inert = buildEntitySpawnSpec({ ...base, overrides: { dynamic: false } }, dummyState());
  assert.ok(inert.spec.physicsBody);
  assert.equal(inert.spec.physicsBody.dynamic, false);

  assert.throws(
    () => buildEntitySpawnSpec({ ...base, overrides: { bogus: 1 } }, dummyState()),
    /bogus/,
  );
});

test('listEntityProfiles includes enemy ids and every listed profile resolves', () => {
  const listed = listEntityProfiles();
  assert.ok(Array.isArray(listed));
  assert.deepEqual(listed, [...listed].sort());
  assert.equal(listed.length, new Set(listed).size);
  assert.ok(listed.includes('ship.starter'));
  assert.ok(listed.some((id) => id === 'wasp_swarmer' || id.startsWith('enemy.')));
  for (const id of listed) {
    const profile = resolveEntityProfile(id);
    assert.ok(profile, `listed profile must resolve: ${id}`);
  }
});

test('scenario capacitor metric fails closed if the gun never spends cap', () => {
  const cap = (SCENARIO.metrics || []).find((m) => m.name === 'trace.min' && m.params && m.params.signal === 'cap');
  assert.ok(cap, 'trace.min cap metric is the shot-fired oracle');
  assert.equal(cap.threshold.op, '<');
  assert.ok(Number.isFinite(cap.threshold.value));
  assert.ok((SCENARIO.assertions || []).some((a) => a.kind === 'metric' && a.metric === 'trace.min'));
  assert.ok((SCENARIO.trace.signals || []).includes('cap'));
  assert.ok((SCENARIO.trace.signals || []).includes('hull'));
});
