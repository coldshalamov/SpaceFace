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
assert.match(localmapSrc, /import \{ applyTradeNavigation \} from '\.\/market\.js';/,
  'localmap route cards should reuse the production market navigation hook');
assert.match(localmapSrc, /data-act="route-nav"/,
  'localmap route cards should render as actionable navigation controls');
assert.match(localmapSrc, /Set course/,
  'localmap route cards should visibly invite the player to set a course');
assert.match(localmapSrc, /lm-route-meta/,
  'localmap route cards should expose load/profit/fuel decision metadata');
assert.match(localmapSrc, /expectedProfit/,
  'localmap route cards should show expected route profit, not only profit per minute');
assert.match(localmapSrc, /function tradeRouteActionLabel\(route\)/,
  'localmap route cards should centralize the accessible route action label');
assert.match(localmapSrc, /Set sell course/,
  'localmap route cards should make clear the action commits the sell-side course');
assert.match(localmapSrc, /projected profit \+/,
  'localmap route action labels should include projected profit for accessibility');
assert.match(localmapSrc, /stale intel/,
  'localmap route action labels should include stale-intel risk when applicable');
assert.match(localmapSrc, /Number\.isFinite\(Number\(r\.reliability\)\)/,
  'localmap stale-intel detection should not treat 0% reliability as fresh');
assert.doesNotMatch(localmapSrc, /r\.reliability \|\| 1/,
  'localmap stale-intel detection must preserve explicit zero reliability');
assert.match(localmapSrc, /title="' \+ escapeAttr\(routeActionLabel\)/,
  'localmap route cards should expose full route commitment context as a title');
assert.match(localmapSrc, /aria-label="' \+ escapeAttr\(routeActionLabel\)/,
  'localmap route cards should expose full route commitment context to assistive tech');
assert.doesNotMatch(localmapSrc, /state\.entities\.get\(id\)/,
  'localmap route metrics and labels must not treat station catalog ids as entity ids');

console.log('Local map route metrics OK - routes resolve live station metrics, economics, and trade nav.');
