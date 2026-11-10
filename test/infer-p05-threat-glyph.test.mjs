// SFQ-I020: every doctrine on the live enemy roster paints a specialist threat glyph.
// The glyph is the doctrine's existing telegraph, not a hull name and not a new set.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { LEFTOVER_TELEGRAPH_KINDS, leftoverTelegraphKind } from '../src/ui/threatHalo.js';

const SPECIALIST = new Set(LEFTOVER_TELEGRAPH_KINDS);

function rosterDoctrineIds() {
  return [...new Set(ENEMY_TYPES.map((row) => row.combatDoctrineId).filter(Boolean))];
}

test('every live enemy doctrine resolves to a specialist threat glyph', () => {
  const ids = rosterDoctrineIds();
  assert.ok(ids.length > 0);
  const misses = [];
  for (const doctrineId of ids) {
    const glyph = leftoverTelegraphKind({ doctrineId });
    if (!glyph || !SPECIALIST.has(glyph)) misses.push(doctrineId);
  }
  assert.deepEqual(misses, []);
});

test('the missing specialist glyph matches that hull\'s telegraphed action', () => {
  const row = ENEMY_TYPES.find((enemy) => enemy.combatDoctrineId === 'scissorwake');
  assert.ok(row && row.telegraph && row.telegraph.cue);
  assert.equal(leftoverTelegraphKind({ doctrineId: row.combatDoctrineId }), row.telegraph.cue);
  assert.ok(SPECIALIST.has(row.telegraph.cue));
});
