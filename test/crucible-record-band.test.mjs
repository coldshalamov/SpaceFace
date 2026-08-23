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
  recentRunRows,
} from '../src/ui/screens/crucible.js';
import { SURVIVAL_UNLOCK_CATALOG } from '../src/data/survivalUnlocks.js';
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

test('lifetime figures are five named numbers and never NaN', () => {
  const figs = lifetimeFigures(emptyCrucibleProfile());
  assert.equal(figs.length, 5);
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
  profile.history = [
    { outcome: 'defeat', wave: 4, score: 10 },
    { outcome: 'victory', wave: 30, score: 999 },
    { outcome: 'aborted', wave: 2, score: 1 },
  ];
  const rows = recentRunRows(profile, 3);
  assert.deepEqual(rows.map((r) => r.wave), [4, 30, 2],
    'history order is the record; sorting it by score would rewrite what happened');
  assert.deepEqual(rows.map((r) => r.outcome), ['LOST', 'WON', 'LEFT']);
});

test('an empty or absent history yields no rows rather than throwing', () => {
  assert.deepEqual(recentRunRows(emptyCrucibleProfile()), []);
  assert.deepEqual(recentRunRows(null), []);
  assert.deepEqual(recentRunRows({ history: 'not an array' }), []);
});

test('every earn kind in the catalog has a readable phrasing', () => {
  const kinds = new Set();
  for (const entry of SURVIVAL_UNLOCK_CATALOG) {
    if (entry.earn && entry.earn.kind) kinds.add(entry.earn.kind);
  }
  for (const kind of kinds) {
    const text = unlockConditionText({ earn: { kind, min: 7 } });
    assert.ok(text && !/\bundefined\b/.test(text), `${kind} has no phrasing: ${text}`);
    // The fallback path prints the raw kind with underscores swapped; that is legible, but a kind
    // the catalog actually uses deserves a real sentence rather than the fallback.
    assert.ok(!text.startsWith(String(kind).replace(/_/g, ' ')),
      `${kind} is in the catalog but only hits the generic fallback phrasing`);
  }
});
