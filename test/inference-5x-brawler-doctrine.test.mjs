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

test('U2: engagement authority admits fire during brawler commit', () => {
  // Structural proof on the shipped fire table — authorizeAIEngagement needs a full hostility
  // graph; the causal defect was a missing DOCTRINE_FIRE_PHASES key, which this asserts.
  const src = readFileSync(new URL('../src/ai/engagementAuthority.js', import.meta.url), 'utf8');
  assert.match(src, /brawler_commit:\s*new Set\(\[\s*['"]commit['"]\s*\]\)/,
    'DOCTRINE_FIRE_PHASES must admit brawler_commit during commit phase');
  const choreo = readFileSync(new URL('../src/presentation/combatChoreography.js', import.meta.url), 'utf8');
  assert.match(choreo, /brawler_commit:\s*grammar/,
    'combat choreography must treat brawler_commit as a live doctrine');
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
