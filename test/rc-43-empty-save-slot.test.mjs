// RC-43: an empty save slot says "empty" once — one heading plus one sentence.

import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySlotDetailCopy } from '../src/ui/screens/saveLoad.js';
import { readFileSync } from 'node:fs';

test('empty slot copy is one heading and one sentence', () => {
  for (const saveAllowed of [true, false]) {
    const copy = emptySlotDetailCopy(saveAllowed);
    assert.equal(copy.heading, 'Empty slot');
    assert.ok(copy.sentence.endsWith('.'), 'one sentence');
    assert.equal(copy.sentence.split(/[.!?]/).filter(Boolean).length, 1, 'exactly one sentence');
    assert.equal(/empty/i.test(copy.sentence), false, 'the sentence need not repeat "empty"');
  }
});

test('the empty pane has no third empty caption', () => {
  const src = readFileSync(new URL('../src/ui/screens/saveLoad.js', import.meta.url), 'utf8');
  assert.equal(src.includes('No hull on file'), false, 'the berth mark stays wordless');
  assert.equal(/'empty',\s*$/.test(src), false, 'no etched "empty" badge');
});
