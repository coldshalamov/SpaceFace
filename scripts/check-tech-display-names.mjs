import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { techDisplayName } from '../src/data/tech.js';

assert.equal(techDisplayName('tech_combat_basics'), 'Combat Basics');
assert.equal(techDisplayName('tech_outpost_charter'), 'Outpost Charter');
assert.equal(techDisplayName('tech_unknown_future'), 'unknown future');

const sources = [
  ['claims', readFileSync(new URL('../src/systems/claims.js', import.meta.url), 'utf8')],
  ['crafting', readFileSync(new URL('../src/systems/crafting.js', import.meta.url), 'utf8')],
  ['ships', readFileSync(new URL('../src/systems/ships.js', import.meta.url), 'utf8')],
];

for (const [name, source] of sources) {
  assert.match(source, /techDisplayName/, `${name} should use display names in research-required toasts`);
  assert.doesNotMatch(source, /Research required: ' \+ (?:mod\.techReq|def\.requiresTech)/,
    `${name} should not concatenate raw tech ids into research toasts`);
  assert.doesNotMatch(source, /Research required: ' \+ \((?:bp|def)\.requiresTech/,
    `${name} should not use raw fallback tech ids in research toasts`);
}

console.log('Tech display names OK - research-required system toasts use player-facing tech names.');
