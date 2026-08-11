import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { normalizeFactionBehaviorProfile } from '../src/ai/factionBehavior.js';
import { SquadCommander } from '../src/ai/squad.js';
import { hash32 } from '../src/core/rng.js';
import { sampleFactionBehavior } from '../src/data/factionDoctrines.js';
import { FACTION_KITS } from '../src/data/factions/index.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

const SEED = 0xd1_47a;
const SAMPLE_COUNT = 64;
const FORMATIONS = Object.freeze(['line', 'ring', 'wedge']);
const TOLERANCE = Object.freeze({
  pursuit: 0.04,
  preferredRange: 0.04,
  liveFormation: 0.05,
  retreat: 0.04,
});
const EVIDENCE_PATH = resolve('.devshots', 'depth-program-d1-doctrine-matrix.json');

test('all 14 registered faction kits produce deterministic, complete doctrine samples', () => {
  assert.equal(FACTION_KITS.length, 14, 'the audit must fail closed if the registered faction canon changes');
  for (const kit of FACTION_KITS) {
    const first = sampleFactionBehavior(kit.id, SEED, SAMPLE_COUNT);
    const replay = sampleFactionBehavior(kit.id, SEED, SAMPLE_COUNT);
    assert.equal(first.length, SAMPLE_COUNT, `${kit.id} must define a sampled doctrine`);
    assert.deepEqual(replay, first, `${kit.id} must replay exactly from the same seed`);
    for (const row of first) {
      assert.ok(normalizeFactionBehaviorProfile(row), `${kit.id} must normalize without defaults`);
    }
  }
});

test('no live faction pair is within tolerance on pursuit, range, formation, and retreat', () => {
  const profiles = FACTION_KITS.map((kit) => summarize(kit.id));
  for (let leftIndex = 0; leftIndex < profiles.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < profiles.length; rightIndex++) {
      const left = profiles[leftIndex];
      const right = profiles[rightIndex];
      const distance = distances(left, right);
      assert.equal(Object.entries(TOLERANCE).every(([axis, tolerance]) => distance[axis] <= tolerance), false,
        `${left.factionId} and ${right.factionId} are indistinguishable: ${JSON.stringify(distance)}`);
    }
  }
});

test('the production squad and combat-doctrine consumers expose each sampled profile', () => {
  for (const [index, kit] of FACTION_KITS.entries()) {
    const profile = normalizeFactionBehaviorProfile(sampleFactionBehavior(kit.id, SEED, 1)[0]);
    assert.ok(profile, `${kit.id} must expose a complete profile to tactical consumers`);
    const entityId = index + 10;
    const squadId = `doctrine_audit_${kit.id}`;
    const commander = new SquadCommander({ seed: SEED });
    commander.registerSquad({
      id: squadId,
      faction: kit.id,
      doctrine: 'balanced',
      formation: 'line',
      factionBehavior: profile,
      members: [{
        id: entityId,
        capabilities: ['drive', 'weapon', 'sensor', 'ranged', 'disable'],
        combatDoctrineId: profile.combatDoctrineId,
      }],
    });

    const ready = commander.update(squadId, 100, new Map([[entityId, perception(entityId, profile, 0.99)]]));
    assert.equal(ready.directives.get(entityId).formation.kind, profile.liveFormation,
      `${kit.id} live formation must reach the squad directive`);
    const retreat = commander.update(squadId, 101, new Map([[
      entityId,
      perception(entityId, profile, Math.max(0, profile.retreatHullFraction - 0.01)),
    ]]));
    assert.equal(retreat.tactic, 'fighting_retreat', `${kit.id} retreat threshold must reach squad selection`);

    const combat = new CombatDoctrineRuntime({ seed: SEED }).update({
      tick: 100,
      entityId,
      doctrineId: profile.combatDoctrineId,
      perception: perception(entityId, profile, 0.99),
      directive: ready.directives.get(entityId),
    });
    assert.equal(combat.preferredRange, profile.preferredRange,
      `${kit.id} preferred range must reach the combat doctrine runtime`);
  }
});

test('ordinary combat spawns carry their owning faction doctrine without replacing their tactical verb', () => {
  const startedTick = 101;
  const expected = sampleFactionBehavior(
    'faction_dmc',
    hash32(startedTick, 'faction_dmc', 'combat-spawn-doctrine'),
    1,
  )[0];
  const first = makeEnemySpawnSpec('reaver_pirate', 3, { x: 200, z: -80 }, {
    factionId: 'faction_dmc',
    startedTick,
  });
  const squadMate = makeEnemySpawnSpec('reaver_pirate', 3, { x: 260, z: -20 }, {
    factionId: 'faction_dmc',
    startedTick,
  });

  assert.deepEqual(first.data.ai.factionPresenceDoctrine, expected,
    'the faction selected at the natural spawn boundary must reach the tactical profile');
  assert.deepEqual(squadMate.data.ai.factionPresenceDoctrine, expected,
    'same-tick members of one faction must receive one coherent doctrine sample');
  assert.equal(first.data.ai.combatDoctrineId, 'interceptor_flyby',
    'the Reaver archetype must keep its non-specialist direct tactical verb');
  assert.equal(first.data.ai.motive, 'assigned_interdiction');
  assert.equal(first.data.ai.engagementTrigger, 'authorized_hostile_spawn');
});

test('lawful natural spawns gain Concord behavior without widening their hostility contract', () => {
  const startedTick = 202;
  const patrol = makeEnemySpawnSpec('patrol_lawman', 3, { x: 180, z: 0 }, { startedTick });
  const expected = sampleFactionBehavior(
    'faction_scn',
    hash32(startedTick, 'faction_scn', 'combat-spawn-doctrine'),
    1,
  )[0];

  assert.deepEqual(patrol.data.ai.factionPresenceDoctrine, expected);
  assert.equal(patrol.data.ai.lawful, true);
  assert.equal(patrol.data.ai.motive, 'law_enforcement');
  assert.equal(patrol.data.ai.engagementTrigger, 'wanted_status');
  assert.equal(patrol.data.ai.factionPresenceDoctrine.firstFire, false,
    'Concord doctrine may not invent first fire against a clean player');
});

test('the doctrine audit writes byte-identical durable evidence for the same seed', () => {
  rmSync(EVIDENCE_PATH, { force: true });
  execFileSync(process.execPath, ['scripts/sim-doctrine-audit.mjs'], {
    cwd: resolve('.'),
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(existsSync(EVIDENCE_PATH), true, 'the audit must write its durable .devshots report');
  const first = readFileSync(EVIDENCE_PATH, 'utf8');
  execFileSync(process.execPath, ['scripts/sim-doctrine-audit.mjs'], {
    cwd: resolve('.'),
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  const replay = readFileSync(EVIDENCE_PATH, 'utf8');
  assert.equal(replay, first, 'same-seed audit reports must serialize byte-identically');
});

function summarize(factionId) {
  const rows = sampleFactionBehavior(factionId, SEED, SAMPLE_COUNT)
    .map((row) => normalizeFactionBehaviorProfile(row));
  assert.equal(rows.length, SAMPLE_COUNT, `${factionId} must be auditable`);
  assert.equal(rows.every(Boolean), true, `${factionId} must expose complete live fields`);
  const formations = Object.fromEntries(FORMATIONS.map((formation) => [formation, 0]));
  for (const row of rows) formations[row.liveFormation]++;
  return {
    factionId,
    pursuit: mean(rows.map((row) => row.pursuitCommitment)),
    preferredRange: mean(rows.map((row) => row.preferredRange)),
    formations: Object.fromEntries(FORMATIONS.map((formation) => [formation, formations[formation] / rows.length])),
    retreat: mean(rows.map((row) => row.retreatHullFraction)),
  };
}

function distances(left, right) {
  const formationDelta = FORMATIONS.reduce((sum, formation) => (
    sum + Math.abs(left.formations[formation] - right.formations[formation])
  ), 0) / 2;
  return {
    pursuit: Math.abs(left.pursuit - right.pursuit),
    preferredRange: Math.abs(left.preferredRange - right.preferredRange) / 600,
    liveFormation: formationDelta,
    retreat: Math.abs(left.retreat - right.retreat),
  };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function perception(entityId, profile, hullFraction) {
  return {
    self: {
      id: entityId,
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 12,
      hullFraction,
      energyFraction: 1,
      heatFraction: 0,
      disabled: false,
      tethered: false,
      capabilities: ['drive', 'weapon', 'sensor', 'ranged', 'disable'],
      activity: { kind: 'attack_run', reason: 'doctrine_audit', startedTick: 0 },
      roe: 'weapons_free',
      combatDoctrineId: profile.combatDoctrineId,
      factionBehavior: profile,
    },
    contacts: [{
      id: 1,
      kind: 'ship',
      team: 0,
      classification: 'ship',
      pos: { x: 700, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 12,
      alive: true,
      valid: true,
      visible: true,
      confidence: 1,
      threat: 0.9,
      hostile: true,
      tethered: false,
      disabled: false,
      operationalMassBand: 'medium',
      mobilityBand: 'medium',
      cargoBand: 'valuable',
      tetherabilityBand: 'good',
      tags: [],
    }],
    events: [],
  };
}
