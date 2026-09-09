#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  storyBeatDisplayName,
  storyIntroducesDisplayName,
} from '../src/ui/screens/missionLog.js';
import { stationServiceLabel } from '../src/ui/station/stationHubModel.js';

const hudMetaSource = readFileSync(new URL('../src/ui/hudMeta.js', import.meta.url), 'utf8');
const stationModelSource = readFileSync(new URL('../src/ui/station/stationHubModel.js', import.meta.url), 'utf8');
const missionLogSource = readFileSync(new URL('../src/ui/screens/missionLog.js', import.meta.url), 'utf8');
const drillSource = readFileSync(new URL('../src/ui/screens/drill.js', import.meta.url), 'utf8');

assert.equal(storyBeatDisplayName('honest_work'), 'Honest Work');
assert.equal(storyIntroducesDisplayName('chaining+passive_preview'), 'Chaining + Passive Preview');

assert.match(hudMetaSource, /COMMODITY_BY_ID/, 'manifest ghost should resolve normal cargo from authored commodity names');
assert.match(hudMetaSource, /PERSISTENT_CARGO_BY_ID/, 'manifest ghost should resolve persistent story cargo from narrative names');
assert.doesNotMatch(
  hudMetaSource,
  /function labelOf\(id\) \{\s*return String\(id\)\.replace/,
  'manifest ghost label helper must not be a raw cmdty_* string replacement',
);

assert.match(stationModelSource, /const SERVICE_LABELS = \{/, 'station model should keep authored service labels');
assert.match(stationModelSource, /black_market: 'Black Market'/, 'black-market services should display with storefront copy');
for (const [svc, expected] of [
  ['black_market', 'Black Market'],
  ['ore_buy', 'Ore Buyer'],
  ['module_craft', 'Manufacture'],
  ['scan_tech', 'Survey Lab'],
  ['totally_unknown_service', 'Totally Unknown Service'],
]) {
  const label = stationServiceLabel(svc);
  assert.equal(label, expected, `station service "${svc}" must display as authored/title-cased copy`);
  assert.ok(!label.includes('_'), 'station service labels must never print raw underscore ids');
}

assert.match(
  missionLogSource,
  /title:\s*storyBeatDisplayName\(beat\.id\)/,
  'mission log current action should title-case story beat IDs',
);
assert.doesNotMatch(
  missionLogSource,
  /sb\.introduces\.replace\(/,
  'mission log introduced-system text must not be a raw underscore replacement',
);
assert.doesNotMatch(
  missionLogSource,
  /\(sb\.id \|\| ''\)\.replace\(/,
  'mission log story beat text must not be a raw underscore replacement',
);

assert.match(drillSource, /COMMODITY_BY_ID/, 'drill yield flashes should resolve authored commodity names');
assert.match(drillSource, /commodityName\(p\.commodityId\)/, 'drill yield copy should use authored commodity display names');
assert.doesNotMatch(
  drillSource,
  /p\.commodityId \|\| ''\)\.replace\('cmdty_ore_'/,
  'drill yield copy must not leak ore ids through prefix replacement',
);

console.log('Player-facing label polish checks OK');
