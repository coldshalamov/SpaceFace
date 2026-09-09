/**
 * U2 — first-class brawler_commit doctrine for Bruiser Brawler ordinary fights.
 * Drives CombatDoctrineRuntime + enemy spawn data, not a reimplementation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  normalizeCombatDoctrineId,
} from '../src/ai/combatDoctrine.js';
import { ContactKind } from '../src/ai/contracts.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

test('U2: brawler_commit is a typed CombatDoctrineId', () => {
  assert.equal(CombatDoctrineId.BRAWLER_COMMIT, 'brawler_commit');
  assert.equal(normalizeCombatDoctrineId('brawler_commit'), 'brawler_commit');
  assert.ok(Object.values(CombatDoctrineId).includes('brawler_commit'));
});

test('U2: bruiser_brawler spawns with brawler_commit (not interceptor flyby)', () => {
  const def = ENEMY_TYPES.find((e) => e.id === 'bruiser_brawler');
  assert.ok(def);
  assert.equal(def.combatDoctrineId, CombatDoctrineId.BRAWLER_COMMIT);
  const spec = makeEnemySpawnSpec(def.id, 1, { x: 0, z: 0 });
  assert.equal(spec.data.ai.combatDoctrineId, CombatDoctrineId.BRAWLER_COMMIT);
});

function perception(selfOverrides = {}, contacts = []) {
  const selfPos = selfOverrides.pos || { x: 0, z: 0 };
  return {
    self: {
      id: 2,
      pos: selfPos,
      vel: selfOverrides.vel || { x: 40, z: 0 },
      rot: 0,
      activity: { kind: 'attack_run' },
      roe: 'weapons_free',
      operationalMassBand: selfOverrides.operationalMassBand || 'medium',
      ...selfOverrides,
      pos: selfPos,
    },
    contacts,
  };
}

function shipContact(id, pos, extra = {}) {
  return {
    id,
    kind: ContactKind.SHIP,
    alive: true,
    valid: true,
    visible: true,
    confidence: 1,
    hostile: true,
    threat: 4,
    pos,
    vel: { x: 0, z: 0 },
    mobilityBand: 'medium',
    operationalMassBand: 'medium',
    cargoBand: 'empty',
    tetherabilityBand: 'fair',
    ...extra,
  };
}

test('U2: brawler_commit runtime enters commit phase (not flyby strike/extend)', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 99 });
  // Match combat-doctrines fixture pacing: far ingress → close for flare → hold for commit.
  let snap = runtime.update({
    tick: 0,
    entityId: 2,
    doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: perception({}, [shipContact(1, { x: 620, z: 0 })]),
  });
  assert.ok(snap, 'eligible brawler returns a doctrine snapshot');
  assert.equal(snap.flightProfile, 'brawler_commit');
  assert.equal(snap.phase, 'ingress');

  snap = runtime.update({
    tick: 5,
    entityId: 2,
    doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: perception({}, [shipContact(1, { x: 210, z: 0 })]),
  });
  assert.equal(snap.phase, 'engine_flare');

  snap = runtime.update({
    tick: 35,
    entityId: 2,
    doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: perception({}, [shipContact(1, { x: 180, z: 0 })]),
  });
  assert.equal(snap.phase, 'commit', 'after telegraph, brawler commits (not flyby strike)');
  assert.equal(snap.fireWindow, true);
  assert.equal(snap.maneuverKind, 'orbit', 'commit is sticky orbit, not flyby intercept pass');
  assert.ok(snap.preferredRange <= 160, 'commit holds inside knife range');
  assert.equal(snap.faceTarget, true);
  assert.notEqual(snap.phase, 'extend');
  assert.notEqual(snap.phase, 'strike');

  // Stay close through mid-commit: must NOT breakaway on pass geometry (flyby residual).
  snap = runtime.update({
    tick: 80,
    entityId: 2,
    doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: perception(
      { pos: { x: 200, z: 0 }, vel: { x: 60, z: 0 } },
      [shipContact(1, { x: 180, z: 0 })],
    ),
  });
  assert.equal(snap.phase, 'commit', 'sticky commit ignores flyby pass-geometry egress');
});

test('U2: engagement authority admits fire during brawler commit on live authorize path', async () => {
  const { authorizeAIEngagement } = await import('../src/ai/engagementAuthority.js');
  const { ActivityKind, RulesOfEngagement, normalizeActivity } = await import('../src/ai/doctrine.js');

  function ship(id, team, pos, ai = {}) {
    return {
      id, type: 'ship', alive: true, team,
      pos: { ...pos }, vel: { x: 0, z: 0 }, rot: 0,
      data: { ai: { ...ai }, intent: { fire: false }, combat: {} },
    };
  }

  const player = ship(1, 0, { x: 1600, z: 0 });
  const bruiser = ship(2, 1, { x: 1200, z: 0 }, {
    passive: false,
    lawful: false,
    forcePlayerTarget: true,
    hostileTeams: [0],
    motive: 'cargo_extortion',
    engagementTrigger: 'explicit_refusal',
    zoneId: 'zone_ceres_ambush',
    approachTelegraph: 'engine_flare',
    noFireResponseWindowS: 1,
    combatDoctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    activity: normalizeActivity({
      kind: ActivityKind.ATTACK_RUN,
      reason: 'brawler_commit_test',
      anchor: { x: 1400, z: 0 },
      leashRadius: 2200,
      startedTick: 100,
    }),
    roe: RulesOfEngagement.WEAPONS_FREE,
  });
  const state = {
    tick: 200,
    playerId: 1,
    player: { heat: 0 },
    world: { currentSectorId: 'sector_ceres_belt' },
    entities: new Map([[1, player], [2, bruiser]]),
    entityList: [player, bruiser],
    combat: { trace: { events: [] } },
  };

  const deniedWrongPhase = authorizeAIEngagement({
    state, self: bruiser, target: player, tick: 200,
    objectiveReason: 'combat_doctrine:brawler_commit:engine_flare',
    hostile: true,
  });
  assert.equal(deniedWrongPhase.ok, false);
  assert.equal(deniedWrongPhase.reason, 'doctrine_fire_window',
    'engine_flare is not a fire phase for brawler_commit');

  const allowed = authorizeAIEngagement({
    state, self: bruiser, target: player, tick: 200,
    objectiveReason: 'combat_doctrine:brawler_commit:commit',
    hostile: true,
  });
  assert.equal(allowed.ok, true, `commit must authorize fire; got ${allowed.reason}`);
  assert.equal(allowed.reason, 'authorized');

  // Missing fire-table key must fail closed (simulate wrong id not in DOCTRINE_FIRE_PHASES).
  bruiser.data.ai.combatDoctrineId = 'not_a_real_doctrine';
  const unknown = authorizeAIEngagement({
    state, self: bruiser, target: player, tick: 200,
    objectiveReason: 'combat_doctrine:not_a_real_doctrine:commit',
    hostile: true,
  });
  assert.equal(unknown.ok, false);
  assert.match(unknown.reason, /doctrine|combat_doctrine/);
});

test('U2: brawler audio and choreography are not flyby aliases', () => {
  const audio = readFileSync(new URL('../src/audio/audioSystem.js', import.meta.url), 'utf8');
  assert.match(audio, /presentation\.combat\.brawler_commit\.setup':\s*'sfx_doctrine_brawler_commit'/);
  assert.doesNotMatch(audio, /presentation\.combat\.brawler_commit\.setup':\s*'sfx_doctrine_flyby'/);
  const recipes = readFileSync(new URL('../src/data/audioRecipes.js', import.meta.url), 'utf8');
  assert.match(recipes, /id:\s*'sfx_doctrine_brawler_commit'/);
  assert.match(recipes, /id:\s*'sfx_doctrine_brawler_break'/);
  assert.match(recipes, /id:\s*'sfx_doctrine_brawler_withdraw'/);
  const choreo = readFileSync(new URL('../src/presentation/combatChoreography.js', import.meta.url), 'utf8');
  assert.match(choreo, /brawler_commit:\s*grammar\('brawler_commit',\s*'ring'/);
});

test('U2: interceptor_flyby still uses strike for light fighters (no regression)', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 7 });
  let snap = runtime.update({
    tick: 0,
    entityId: 3,
    doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception(
      { operationalMassBand: 'light' },
      [shipContact(1, { x: 620, z: 0 })],
    ),
  });
  assert.equal(snap.flightProfile, 'flyby');
  snap = runtime.update({
    tick: 5,
    entityId: 3,
    doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception(
      { operationalMassBand: 'light' },
      [shipContact(1, { x: 210, z: 0 })],
    ),
  });
  assert.equal(snap.phase, 'engine_flare');
  snap = runtime.update({
    tick: 35,
    entityId: 3,
    doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception(
      { operationalMassBand: 'light' },
      [shipContact(1, { x: 160, z: 0 })],
    ),
  });
  assert.equal(snap.phase, 'strike');
});
