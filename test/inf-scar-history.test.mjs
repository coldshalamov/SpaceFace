// inf-scar-history — a hull you worked over stays worked over.
//
// Every weapon scar used to retire in 2.4–8 s: HullScorchPool's persistent, target-bound slot
// path existed (evict-transient-first, fade floor, retained across dispose) but nothing spawned
// it, so a hull you had been chewing on for a minute read brand-new once the sparks cooled —
// only the player's own Living Hull kept history. Now sustained bare-hull fire makes the last
// marks cool to charcoal and STAY on the hull for the rest of the fight.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SCAR_HISTORY_AFTER_HITS,
  SCAR_HISTORY_GLOBAL,
  SCAR_HISTORY_LIFE_S,
  SCAR_HISTORY_PER_TARGET,
  SCAR_HISTORY_TARGET_CAP,
  createScarHistory,
  noteHullScorchStrike,
  resetScarHistory,
} from '../src/render/weapons/scarHistory.js';

test('the first strikes are transient; sustained fire starts keeping scars', () => {
  const book = createScarHistory();
  for (let i = 0; i < SCAR_HISTORY_AFTER_HITS - 1; i++) {
    const plan = noteHullScorchStrike(book, 'hull-a', i * 0.5);
    assert.equal(plan.persistent, false, `strike ${i + 1} is still transient`);
    assert.equal(plan.life, null);
  }
  const kept = noteHullScorchStrike(book, 'hull-a', 3);
  assert.equal(kept.persistent, true, 'the third bare-hull strike stays on the hull');
  assert.equal(kept.life, SCAR_HISTORY_LIFE_S);
  assert.ok(kept.grantRef, 'the grant is tracked so the slot can be reconciled later');
  assert.equal(book.kept, 1);
});

test('kept scars are capped per hull', () => {
  const book = createScarHistory();
  let persistentCount = 0;
  for (let i = 0; i < 12; i++) {
    const plan = noteHullScorchStrike(book, 'hull-a', i * 0.5);
    if (plan.persistent) persistentCount++;
  }
  assert.equal(persistentCount, SCAR_HISTORY_PER_TARGET);
  assert.equal(book.kept, SCAR_HISTORY_PER_TARGET);
});

test('kept scars are capped across all hulls — the pool shares slots with live impacts', () => {
  const book = createScarHistory();
  // Many hulls past the eligibility bar: the global cap holds the line.
  for (let t = 0; t < 8; t++) {
    for (let i = 0; i < SCAR_HISTORY_AFTER_HITS + 2; i++) {
      noteHullScorchStrike(book, `hull-${t}`, i * 0.5);
    }
  }
  assert.equal(book.kept, SCAR_HISTORY_GLOBAL);
  // The cap is shared, not per-hull: no hull got all ten.
  const grantsPerHull = [];
  for (let t = 0; t < 8; t++) {
    const record = book.byTarget.get(`hull-${t}`);
    grantsPerHull.push(record ? record.grants.length : 0);
  }
  assert.ok(Math.max(...grantsPerHull) <= SCAR_HISTORY_PER_TARGET);
});

test('a grant whose slot died or changed hands stops counting — the budget returns', () => {
  const book = createScarHistory();
  let grant = null;
  for (let i = 0; i < SCAR_HISTORY_AFTER_HITS; i++) {
    const plan = noteHullScorchStrike(book, 'hull-a', i, (g) => g.slot === 7);
    if (plan.persistent) grant = plan.grantRef;
  }
  grant.slot = 7;
  // Pool reality: the slot was reclaimed and now belongs to another hull.
  const evicted = noteHullScorchStrike(book, 'hull-a', 10, (g) => !(g.slot === 7));
  const record = book.byTarget.get('hull-a');
  assert.ok(!record.grants.includes(grant), 'the dead grant was pruned');
  assert.equal(record.grants.length, 1, 'exactly the fresh grant remains');
  assert.equal(evicted.persistent, true, 'the freed budget keeps the next mark instead');
  assert.equal(book.kept, 1);
});

test('the target book stays bounded and retires its stalest hull', () => {
  const book = createScarHistory();
  for (let t = 0; t < SCAR_HISTORY_TARGET_CAP + 6; t++) {
    noteHullScorchStrike(book, `hull-${t}`, t);
  }
  assert.ok(book.byTarget.size <= SCAR_HISTORY_TARGET_CAP, `size ${book.byTarget.size}`);
  // The stalest entries went first; the freshest hull is still accounted.
  assert.ok(book.byTarget.has(`hull-${SCAR_HISTORY_TARGET_CAP + 5}`));
  resetScarHistory(book);
  assert.equal(book.kept, 0);
  assert.equal(book.byTarget.size, 0);
});

test('a kept scar outlives the ordinary transient layer', () => {
  const book = createScarHistory();
  // Longest authored scorchLife in the recipe table is 8.0 s (torpedo).
  let keptPlan = null;
  for (let i = 0; i < SCAR_HISTORY_AFTER_HITS; i++) {
    keptPlan = noteHullScorchStrike(book, 'hull-a', i);
  }
  assert.equal(keptPlan.persistent, true);
  assert.ok(keptPlan.life > 8, `kept life ${keptPlan.life} must outlast the longest transient scorch`);
});

test('a recycled renderer target id starts a fresh scar history for its new occupant', () => {
  const book = createScarHistory();
  let oldGrant = null;
  for (let i = 0; i < SCAR_HISTORY_AFTER_HITS; i++) {
    const plan = noteHullScorchStrike(book, 'recycled-id', i, null, 'old-occupant');
    if (plan.grantRef) oldGrant = plan.grantRef;
  }
  assert.ok(oldGrant, 'the prior occupant earned a persistent scar');
  assert.equal(book.kept, 1);

  const replacementFirstStrike = noteHullScorchStrike(book, 'recycled-id', 4, null, 'new-occupant');
  assert.equal(replacementFirstStrike.persistent, false, 'the new hull starts at its first hit');
  assert.equal(book.byTarget.get('recycled-id').hits, 1);
  assert.equal(book.kept, 0, 'the prior occupant no longer consumes persistent scar budget');
});

test('the live owner is wired: the presenter keeps hull history, mining faces stay transient', () => {
  const presenter = readFileSync(new URL('../src/render/weapons/presenter.js', import.meta.url), 'utf8');
  assert.match(presenter, /import \{ createScarHistory, noteHullScorchStrike, resetScarHistory \} from '\.\/scarHistory\.js';/);
  assert.match(
    presenter,
    /const history = noteHullScorchStrike\(\s*this\._scarHistory,\s*payload\.targetId,/,
    'the bare-hull scorch consults the sustained-fire book',
  );
  assert.match(
    presenter,
    /persistent: history\.persistent === true,/,
    "the pool's persistent path is finally driven",
  );
  assert.match(presenter, /resetScarHistory\(this\._scarHistory\);/, 'dispose clears the book');
  // The mining work-face keeps its own (consumed-with-the-rock) life.
  assert.match(presenter, /stampMiningScar\(/);
  const pool = readFileSync(new URL('../src/render/weapons/contactMarks.js', import.meta.url), 'utf8');
  assert.match(pool, /persistent scars and the shared material stay/i,
    "the pool's persistent path holds marks target-bound");
});
