#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  storyBeatDisplayName,
  storyIntroducesDisplayName,
} from '../src/ui/screens/missionLog.js';

const hudMetaSource = readFileSync(new URL('../src/ui/hudMeta.js', import.meta.url), 'utf8');
const stationHubSource = readFileSync(new URL('../src/ui/screens/stationHub.js', import.meta.url), 'utf8');
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

assert.match(stationHubSource, /const SERVICE_LABELS = \{/, 'station hub should keep authored service labels');
assert.match(stationHubSource, /black_market: 'Black Market'/, 'black-market services should display with storefront copy');
assert.match(stationHubSource, /services\.map\(stationServiceLabel\)/, 'station service summary should use the service-label helper');
assert.doesNotMatch(
  stationHubSource,
  /services\.map\(\(s\) => String\(s\)\.replace\(/,
  'station service summary must not print raw service ids with underscores',
);

assert.match(missionLogSource, /storyBeatDisplayName\(sb\.id\)/, 'mission log should title-case story beat IDs');
assert.match(missionLogSource, /storyIntroducesDisplayName\(sb\.introduces\)/, 'mission log should render readable introduced systems');
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
