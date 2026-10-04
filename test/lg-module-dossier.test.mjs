// VERB-33 — opening a module record says what the fit screen already says.
//
// The Does line is airSentenceForId. The raw key dump is what this replaces
// for any module that has that sentence.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '../src/data/modules.js';
import { resolveEntity } from '../src/ui/entityResolver.js';
import { airSentenceForId } from '../src/ui/ship/fitReadout.js';

test('seed 4242 a module record says what the module does', () => {
  const filter = MODULES.find((row) => row.id === 'mod_filter_stack_s');
  assert.equal(filter.mods.bioFilterMult, 0.35);
  const dossier = resolveEntity({ meta: { seed: 4242 } }, 'module:mod_filter_stack_s');
  assert.ok(dossier);
  const does = dossier.lines.find((line) => line.label === 'Does');
  assert.ok(does);
  assert.equal(does.text, airSentenceForId('mod_filter_stack_s'));
  assert.match(does.text, /fouls the hull more slowly/);
  const blob = dossier.lines.map((line) => line.text).join(' ');
  assert.equal(/bio filter mult/i.test(blob), false);
  assert.equal(dossier.lines.some((line) => line.label === 'Changes'), false);
});
