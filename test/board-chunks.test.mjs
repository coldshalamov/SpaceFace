import assert from 'node:assert/strict';
import test from 'node:test';

import { readBoard } from '../scripts/board-chunks.mjs';

test('every open board row is in exactly one seam, except the five area lanes', () => {
  const board = readBoard();
  assert.ok(board.seams.length >= 5, 'five agents need at least five seams');
  assert.deepEqual(board.orphans.map((row) => row.number), []);
  assert.deepEqual(board.missing, []);
  assert.deepEqual(board.dupes, []);
  const free = board.seams.filter((seam) => seam.claim === 'free');
  assert.ok(free.length >= 5, 'a fresh board has five free seams to claim');
});
