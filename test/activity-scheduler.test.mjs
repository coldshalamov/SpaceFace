import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hashOwnerKey,
  isActiveOwner,
  nextRunTick,
  ownerPhase,
  shouldAmbientHaulerPlan,
  shouldOwnerThink,
  shouldRunOnTick,
} from '../src/core/activityScheduler.js';
import {
  TABLE_AI_AUTHORITY_WU,
  submitCullHalfExtents,
  tableAiAuthorityWu,
  tableAiAuthorityWuFromState,
} from '../src/render/tabletopPolicy.js';

test('period 1 always runs and phases are deterministic', () => {
  for (let tick = 0; tick < 24; tick++) {
    assert.equal(shouldRunOnTick(tick, 'traffic:planner', 1), true);
  }
  const phase = ownerPhase('traffic:planner', 4);
  assert.ok(phase >= 0 && phase < 4);
  assert.equal(ownerPhase('traffic:planner', 4), phase);
  assert.equal(hashOwnerKey('a'), hashOwnerKey('a'));
  assert.notEqual(hashOwnerKey('a'), hashOwnerKey('b'));
});

test('quantized owners fire exactly once per period on their phase', () => {
  const hits = [];
  for (let tick = 0; tick < 16; tick++) {
    if (shouldRunOnTick(tick, 'story:remote', 4)) hits.push(tick);
  }
  assert.equal(hits.length, 4);
  const spacing = hits.slice(1).map((tick, i) => tick - hits[i]);
  assert.deepEqual(spacing, [4, 4, 4]);
  assert.equal(nextRunTick(hits[0], 'story:remote', 4), hits[0]);
  assert.equal(nextRunTick(hits[0] + 1, 'story:remote', 4), hits[1]);
});

test('combatants and the player stay awake; far passive traffic may sleep', () => {
  const player = { id: 'p', isPlayer: true, pos: { x: 0, z: 0 } };
  const foe = { id: 'e', team: 1, ai: { combatant: true, passive: false }, pos: { x: 400, z: 0 } };
  const hauler = { id: 'h', team: 2, ai: { passive: true }, pos: { x: 400, z: 0 } };
  const opts = { playerId: 'p', playerTeam: 0, origin: { x: 0, z: 0 }, authorityRadius: 120 };
  assert.equal(isActiveOwner(player, opts), true);
  assert.equal(isActiveOwner(foe, opts), true);
  assert.equal(isActiveOwner(hauler, opts), false);
  assert.equal(shouldOwnerThink(0, foe, { ...opts, activePeriodTicks: 1 }), true);
  const sleepHits = [];
  for (let tick = 0; tick < 16; tick++) {
    if (shouldOwnerThink(tick, hauler, { ...opts, sleepPeriodTicks: 8 })) sleepHits.push(tick);
  }
  assert.ok(sleepHits.length >= 1 && sleepHits.length <= 3);
});

test('ambient haulers plan slower when far; hostiles still think every tick', () => {
  const far = { id: 9, pos: { x: 8000, z: 0 }, ai: { passive: true } };
  const hostile = { id: 10, pos: { x: 8000, z: 0 }, team: 3, ai: { passive: false } };
  const opts = {
    playerId: 1,
    playerTeam: 1,
    authorityRadius: TABLE_AI_AUTHORITY_WU,
    origin: { x: 0, z: 0 },
  };
  let farHits = 0;
  let hostileHits = 0;
  for (let tick = 0; tick < 8; tick++) {
    if (shouldAmbientHaulerPlan(tick, far, opts)) farHits++;
    if (shouldAmbientHaulerPlan(tick, hostile, opts)) hostileHits++;
  }
  assert.ok(farHits < 8, 'far passive haulers must not plan every tick');
  assert.equal(hostileHits, 8);

  const liveHostile = {
    id: 11,
    pos: { x: 8000, z: 0 },
    data: { team: 3, ai: { passive: false, combatant: true } },
  };
  let liveHits = 0;
  for (let tick = 0; tick < 8; tick++) {
    if (shouldAmbientHaulerPlan(tick, liveHostile, opts)) liveHits++;
  }
  assert.equal(liveHits, 8, 'live ships store AI on data.ai, not owner.ai');
});

test('passive AI sleeps beyond the largest table, not a 1400 WU horizon', () => {
  const submit = submitCullHalfExtents(330, 50, 16 / 9);
  const tableCorner = Math.hypot(submit.halfX, submit.halfZ);
  assert.equal(tableAiAuthorityWu(), tableCorner);
  assert.ok(TABLE_AI_AUTHORITY_WU < 1400, `table AI ${TABLE_AI_AUTHORITY_WU} must beat the old 1400 horizon`);
  assert.ok(TABLE_AI_AUTHORITY_WU >= tableCorner - 1e-6);
  const near = { id: 'n', ai: { passive: true }, pos: { x: 200, z: 0 } };
  const far = { id: 'f', ai: { passive: true }, pos: { x: 1400, z: 0 } };
  const opts = { origin: { x: 0, z: 0 }, authorityRadius: TABLE_AI_AUTHORITY_WU };
  assert.equal(isActiveOwner(near, opts), true);
  assert.equal(isActiveOwner(far, opts), false);
});

test('live traffic consults the ambient hauler planner', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/systems/traffic.js', import.meta.url), 'utf8');
  assert.match(source, /shouldAmbientHaulerPlan\(/);
  assert.match(source, /tableAiAuthorityWuFromState/);
  const ai = await readFile(new URL('../src/ai/stack.js', import.meta.url), 'utf8');
  assert.match(ai, /TABLE_AI_AUTHORITY_WU/);
  const bark = await readFile(new URL('../src/systems/barkDirector.js', import.meta.url), 'utf8');
  assert.match(bark, /tableAiAuthorityWuFromState/);
});

test('AI authority follows the live camera including a 90 degree FOV', () => {
  const tight = tableAiAuthorityWuFromState({
    camera: { zoom: 144, fov: 50, aspect: 16 / 9 },
  });
  const wide = tableAiAuthorityWuFromState({
    settings: { video: { fov: 90 } },
    camera: { zoom: 330, aspect: 16 / 9 },
  });
  assert.ok(tight < 800, `default play AI ${tight} stays table-sized`);
  assert.ok(wide > 1500, `90-degree max-zoom AI ${wide} covers the live glass`);
  const hauler = { id: 'h', ai: { passive: true }, pos: { x: 800, z: 0 } };
  assert.equal(isActiveOwner(hauler, { origin: { x: 0, z: 0 }, authorityRadius: tight }), false);
  assert.equal(isActiveOwner(hauler, { origin: { x: 0, z: 0 }, authorityRadius: wide }), true);
});
