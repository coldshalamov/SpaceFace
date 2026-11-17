// The Crucible door's record band — the surface that answers "why come back".
//
// The map's phase-10 exit gate asks for two things that pull against each other: reasons to replay
// beyond raw score, AND a fresh account that stays competitive. They only reconcile if the reward is
// possibility rather than power. These tests hold that line at the presentation layer, where it is
// easiest to break by accident: a band that showed "+2 damage" would satisfy nobody's idea of a
// reward ladder and would quietly undo the arithmetic the catalog is built on.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  unlockConditionText,
  unlockLadderRows,
  lifetimeFigures,
  historyRunRows,
  recentRunRows,
  todayBoardFigures,
} from '../src/ui/screens/crucible.js';
import { SURVIVAL_UNLOCK_CATALOG } from '../src/data/survivalUnlocks.js';
import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { emptyCrucibleProfile } from '../src/systems/survivalRecords.js';

test('a fresh profile shows every closed entry with a condition, never a blank', () => {
  const rows = unlockLadderRows(emptyCrucibleProfile());
  assert.equal(rows.length, SURVIVAL_UNLOCK_CATALOG.length, 'every catalog entry gets a row');
  for (const row of rows) {
    if (row.open) continue;
    assert.ok(row.condition && row.condition.length > 0,
      `${row.id} is closed and must say what opens it`);
    assert.ok(!/undefined|NaN|\[object/.test(row.condition),
      `${row.id} condition reads badly: ${row.condition}`);
  }
});

test('the default-unlocked entries are open on a fresh profile', () => {
  const rows = unlockLadderRows(emptyCrucibleProfile());
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const entry of SURVIVAL_UNLOCK_CATALOG) {
    if (!entry.defaultUnlocked) continue;
    assert.equal(byId.get(entry.id).open, true, `${entry.id} is default-unlocked and must read open`);
  }
});

test('an owned unlock reads open', () => {
  const shut = SURVIVAL_UNLOCK_CATALOG.find((e) => !e.defaultUnlocked);
  assert.ok(shut, 'the catalog must contain something still to earn, or the ladder is pointless');
  const profile = emptyCrucibleProfile();
  profile.unlocks[shut.id] = true;
  const row = unlockLadderRows(profile).find((r) => r.id === shut.id);
  assert.equal(row.open, true);
  assert.equal(row.condition, '', 'an open row states no condition');
});

test('NO POWER IS EVER SHOWN, because none exists to show', () => {
  // The ladder deliberately carries label, blurb and condition and NOT the power block. If a future
  // edit surfaces power here it will almost certainly be because power was added to the catalog,
  // and this is the cheapest place to catch that.
  for (const row of unlockLadderRows(emptyCrucibleProfile())) {
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'power'), false,
      `${row.id} must not carry a power block into the view`);
    const text = `${row.label} ${row.condition}`;
    assert.ok(!/\+\s*\d|\bdamage\b|\bDPS\b/i.test(text),
      `${row.id} reads like a stat reward: ${text}`);
  }
});

test('closed entries sort ahead of open ones — the band is about what is still ahead', () => {
  const profile = emptyCrucibleProfile();
  const rows = unlockLadderRows(profile);
  const ordered = [...rows.filter((r) => !r.open), ...rows.filter((r) => r.open)];
  const firstOpen = ordered.findIndex((r) => r.open);
  if (firstOpen === -1) return;
  assert.ok(ordered.slice(firstOpen).every((r) => r.open),
    'once the open rows start, no closed row may appear after them');
});

test('lifetime figures are six named numbers and never NaN', () => {
  const figs = lifetimeFigures(emptyCrucibleProfile());
  assert.equal(figs.length, 6);
  for (const f of figs) {
    assert.ok(Number.isFinite(f.value), `${f.key} must be a real number`);
    assert.ok(f.label && f.label.length, `${f.key} must keep its word`);
  }
  // A profile with junk in it must still render, because a corrupt local file is not a crash.
  const junk = lifetimeFigures({ records: { lifetime: { runs: 'x', bestScore: null } } });
  assert.ok(junk.every((f) => Number.isFinite(f.value)), 'junk figures fall back to a number');
});

test('recent runs read newest-first and are never re-sorted by score', () => {
  const profile = emptyCrucibleProfile();
  // History stores oldest→newest (settleCrucibleRun appends): the last row is the most recent.
  profile.history = [
    { outcome: 'defeat', wave: 4, score: 10 },
    { outcome: 'victory', wave: 30, score: 999 },
    { outcome: 'aborted', wave: 2, score: 1 },
  ];
  const rows = recentRunRows(profile, 3);
  assert.deepEqual(rows.map((r) => r.wave), [2, 30, 4],
    'newest first from the stored tail; a score sort would give 30,4,2');
  assert.deepEqual(rows.map((r) => r.outcome), ['LEFT', 'WON', 'LOST']);
});

test('an empty or absent history yields no rows rather than throwing', () => {
  assert.deepEqual(recentRunRows(emptyCrucibleProfile()), []);
  assert.deepEqual(recentRunRows(null), []);
  assert.deepEqual(recentRunRows({ history: 'not an array' }), []);
});

test('the run log lists every recorded run newest-first with context and tally', () => {
  const profile = emptyCrucibleProfile();
  profile.history = [
    { outcome: 'defeat', wave: 4, deepestWave: 6, kills: 9, wavesCleared: 4, credits: 120, score: 10, arenaId: 'arena_lagrange_crucible', ruleset: 'scored' },
    { outcome: 'victory', wave: 30, kills: 41, wavesCleared: 30, score: 999, arenaId: 'arena_helios_core', ruleset: 'boss_circuit', mutators: ['glass'], dailyDateKey: '2026-09-26', ghostHash: 'abc', bestLineId: 'line_1' },
    { outcome: 'aborted', wave: 2, score: 1, arenaId: 'arena_cinder_sluice', ruleset: 'scored', mutators: ['a', 'b'] },
  ];
  const log = historyRunRows(profile);
  assert.equal(log.length, 3);
  assert.deepEqual(log.map((r) => r.wave), [2, 30, 4], 'newest run first');
  const won = log[1];
  assert.equal(won.outcome, 'WON');
  assert.match(won.context, /helios core/);
  assert.match(won.context, /boss circuit/);
  assert.match(won.context, /1 mutator/);
  assert.match(won.context, /daily/);
  assert.match(won.context, /ghost on file/);
  assert.match(won.context, /best line/);
  assert.match(won.tally, /41 kills/);
  assert.match(won.tally, /30 cleared/);
  const deepest = log[2];
  assert.equal(deepest.distance, '4/6', 'deepest beats the wave reached');
  const aborted = log[0];
  assert.match(aborted.context, /cinder sluice/);
  assert.match(aborted.context, /2 mutators/);
  assert.deepEqual(historyRunRows(emptyCrucibleProfile()), []);
  assert.deepEqual(historyRunRows(null), []);
});

test('today daily figures surface score and wave when a board row exists', () => {
  const profile = emptyCrucibleProfile();
  assert.equal(todayBoardFigures(profile, '2026-09-06'), null);
  profile.daily.byDate['2026-09-06'] = {
    dateKey: '2026-09-06',
    seed: 1,
    bestScore: 400,
    deepestWave: 10,
    attempts: 1,
    lastOutcome: 'defeat',
    recordedAt: '2026-09-06T12:00:00.000Z',
  };
  const figs = todayBoardFigures(profile, '2026-09-06');
  assert.equal(figs.label, 'Today');
  assert.equal(figs.score, 400);
  assert.equal(figs.wave, 10);
  assert.equal(todayBoardFigures(profile, '2026-09-07'), null);
  assert.equal(todayBoardFigures(null, '2026-09-06'), null);
});

test('every earn kind in the catalog has a readable phrasing', () => {
  for (const entry of SURVIVAL_UNLOCK_CATALOG) {
    if (!entry.earn) continue;
    const text = unlockConditionText(entry);
    assert.ok(text && !/\bundefined\b/.test(text), `${entry.id} has no phrasing: ${text}`);
    assert.doesNotMatch(text, /currently unavailable|authored|physics verb|pick_and_waves/,
      `${entry.id} needs a real instruction using its complete catalog condition`);
  }
});

test('starter unlocks name the actual equipment and require clears in the same run', () => {
  const fittings = new Map([...WEAPONS, ...MODULES].map(row => [row.id, row.name]));
  for (const [id, defId, rounds] of [
    ['unlock_kit_web', 'wpn_snarl_s', 5],
    ['unlock_kit_physics', 'wpn_gravity_marker_s', 5],
    ['unlock_kit_massline', 'mod_elastic_whip_m', 8],
  ]) {
    const text = unlockConditionText(SURVIVAL_UNLOCK_CATALOG.find(row => row.id === id));
    assert.ok(text.includes(fittings.get(defId)), `${id} must use its canonical equipment name`);
    assert.ok(text.includes(`clear ${rounds} rounds in the same run`));
    assert.match(text, /Select .* from equipment offers/);
    assert.match(text, /Practice runs do not count/);
    assert.doesNotMatch(text, /run (?:Web|Tag|Whip)\b|to wave/);
  }
});

test('round requirements distinguish clears from reaching a round', () => {
  assert.match(unlockConditionText(SURVIVAL_UNLOCK_CATALOG.find(row => row.id === 'unlock_kit_bolt')),
    /Clear 10 rounds in one run/);
  assert.match(unlockConditionText(SURVIVAL_UNLOCK_CATALOG.find(row => row.id === 'unlock_mark_act_ii')),
    /Reach round 20/);
});

test('full-course unlocks explain all thirty clears from the beginning and exclude Practice', () => {
  for (const entry of SURVIVAL_UNLOCK_CATALOG.filter(row =>
    ['authored_victory', 'victory_and_physics_pick'].includes(row.earn?.kind))) {
    const text = unlockConditionText(entry);
    assert.match(text, /Win all 30 rounds of Swarm or Gauntlet, starting at round 1/);
    assert.match(text, /One Hull and One Weapon challenges also count/);
    assert.match(text, /Practice runs do not count/);
  }
  const physics = unlockConditionText(SURVIVAL_UNLOCK_CATALOG.find(row => row.id === 'unlock_mutator_physics_only'));
  for (const defId of ['wpn_concussion_cannon_m', 'wpn_gravity_marker_s', 'wpn_momentum_sink_s',
    'wpn_vector_mine_m', 'wpn_rcs_disruptor_m']) {
    assert.ok(physics.includes(WEAPONS.find(row => row.id === defId).name),
      'every qualifying equipment choice must be named');
  }
  assert.match(physics, /equipment offers during that same run/);
});

test('missing or unknown unlock conditions never expose internal identifiers', () => {
  for (const entry of [{}, { earn: { kind: 'internal_future_kind', min: 7 } },
    { earn: { kind: 'pick_and_waves', verb: 'unmapped_internal_verb', minWaves: 5 } }]) {
    assert.equal(unlockConditionText(entry), 'This option is currently unavailable.');
  }
});
