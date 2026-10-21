import test from 'node:test';
import assert from 'node:assert/strict';
import { rockName } from '../src/ui/asteroid/rockNames.js';

test('RC-32: the site name is a name, never "AST-"', () => {
  for (const id of ['ast_355', 355, 'drill_target_9', 'ast_vi']) {
    const name = rockName(id);
    assert.doesNotMatch(name, /AST-/i);
    assert.match(name, /^[A-Z][a-z]+ [A-Z][a-z]+$/, `unexpected shape: ${name}`);
  }
});

test('RC-32: the name is stable per rock and differs across rocks', () => {
  assert.equal(rockName('ast_355'), rockName('ast_355'));
  const names = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => rockName(`ast_${i}`)));
  assert.ok(names.size > 1, 'every rock named the same');
});

test('RC-32: an unknown rock is honest, not "AST—"', () => {
  assert.equal(rockName(null), 'Nameless Rock');
  assert.doesNotMatch(rockName(null), /AST-/);
});
