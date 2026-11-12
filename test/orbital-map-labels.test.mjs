import test from 'node:test';
import assert from 'node:assert/strict';
import { drawPlayerHull, drawObjectiveBracket, TACTICAL_MAP_PALETTE, contrastRatio } from '../src/ui/map/tacticalMapGrammar.js';

function context() {
  const calls = [];
  const g = new Proxy({ calls }, {
    get(target, key) { return key in target ? target[key] : (...args) => calls.push([key, ...args]); },
    set(target, key, value) { target[key] = value; return true; },
  });
  return g;
}
test('native player mark draws its label without an undeclared font resolver', () => {
  const g = context();
  assert.doesNotThrow(() => drawPlayerHull(g, 100, 100));
  assert.match(g.font, /12px/);
  assert.ok(g.calls.some(([key, text]) => key === 'fillText' && text === 'YOU'));
});
test('native objective label renders with resolved readable type', () => {
  const g = context();
  assert.doesNotThrow(() => drawObjectiveBracket(g, 120, 70, { unresolved: true }));
  assert.ok(g.calls.some(([key, text]) => key === 'fillText' && text === '?'));
  assert.match(g.font, /12px/);
});
test('primary navigation roles retain high contrast on the native chart ground', () => {
  for (const role of ['ink','player','objective','hostile','station','gate']) {
    assert.ok(contrastRatio(TACTICAL_MAP_PALETTE[role], TACTICAL_MAP_PALETTE.ground) >= 4.5, role);
  }
});
