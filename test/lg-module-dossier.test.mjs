// VERB-33 — opening a module record says what the fit screen already says.
//
// The Does line is partFacts' sentence (the same one the fitter prints). The raw key dump is what
// this replaces for any module that has that sentence; Mass and Power draw stay behind Details.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '../src/data/modules.js';
import { resolveEntity } from '../src/ui/entityResolver.js';
import { partFacts } from '../src/ui/ship/partFacts.js';

test('seed 4242 a module record says what the module does', () => {
  const filter = MODULES.find((row) => row.id === 'mod_filter_stack_s');
  assert.equal(filter.mods.bioFilterMult, 0.35);
  const facts = partFacts('mod_filter_stack_s');
  const dossier = resolveEntity({ meta: { seed: 4242 } }, 'module:mod_filter_stack_s');
  assert.ok(dossier);
  const does = dossier.lines.find((line) => line.label === 'Does');
  assert.ok(does);
  assert.equal(does.text, facts.sentence);
  assert.match(does.text, /fouls the hull more slowly/);
  assert.match(dossier.kicker, /Bio filter/);
  assert.match(dossier.kicker, /Mk I/);
  const blob = dossier.lines.map((line) => line.text).join(' ');
  assert.equal(/bio filter mult/i.test(blob), false);
  assert.equal(dossier.lines.some((line) => line.label === 'Changes'), false);
  assert.equal(dossier.facts.some((fact) => fact.k === 'Mass'), false, 'Mass is not a decision fact');
  assert.equal(dossier.facts.some((fact) => fact.k === 'Power draw'), false);
  assert.deepEqual(dossier.details.map((fact) => fact.k).sort(), ['Mass', 'Power draw']);
});
