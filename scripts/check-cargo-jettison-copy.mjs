#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');

assert.match(
  source,
  /function cargoDisplayName\(id\)/,
  'HUD cargo panel must keep a shared player-facing cargo display-name helper',
);
assert.match(
  source,
  /const name = cargoDisplayName\(commodityId\);[\s\S]*Jettisoned \$\{dumped\}x \$\{name\}/,
  'cargo jettison toast must use authored commodity names rather than raw cargo ids',
);
assert.doesNotMatch(
  source,
  /Jettisoned \$\{dumped\}x \$\{commodityId\.replace\('cmdty_'/,
  'cargo jettison toast must not leak raw cmdty_* ids through simple string replacement',
);
assert.match(
  source,
  /Personal effects cannot be jettisoned/,
  'personal effects must remain protected from cargo jettison copy/actions',
);
assert.match(
  source,
  /PERSISTENT_CARGO_BY_ID/,
  'persistent cargo names must still resolve from narrative data',
);

console.log('Cargo jettison copy checks OK');
