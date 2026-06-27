#!/usr/bin/env node
// Guards Local Map route metrics against regressing to catalog IDs as entity IDs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const localmapSrc = readFileSync(join(ROOT, 'src/ui/screens/localmap.js'), 'utf8');

assert.match(localmapSrc, /function stationPositionForRoute\(state, stationId\)/,
  'localmap should resolve route station positions through a named helper');
assert.match(localmapSrc, /function stationNameForRoute\(state, stationId\)/,
  'localmap should resolve route station names through a named helper');
assert.match(localmapSrc, /state\.entityIndex && state\.entityIndex\.byStationId/,
  'localmap route metrics should prefer the live byStationId index');
assert.match(localmapSrc, /data\.stationId === stationId/,
  'localmap route metrics should fall back to entity.data.stationId lookup');
assert.match(localmapSrc, /state\.player && state\.player\.cargo/,
  'localmap route capacity should read the live player cargo state');
assert.doesNotMatch(localmapSrc, /state\.entities\.get\(id\)/,
  'localmap route metrics and labels must not treat station catalog ids as entity ids');

console.log('Local map route metrics OK - station ids resolve to live station positions and cargo capacity.');
