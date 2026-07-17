#!/usr/bin/env node
/**
 * check-bar-place-identity.mjs — Bar instrument names the docked place.
 *
 * Proves shipped production path:
 *   stationId available → quiet place line (station name + faction/sector cantina flavor)
 *   missing stationId → no place chrome
 *
 * Fence: no thrusters/materials, no station shell redesign, no dual-platform claim.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatBarPlaceLine } from '../src/ui/station/screens/bar.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

let n = 0;
function ok(label) {
  n += 1;
  console.log(`  PASS  ${label}`);
}

// ── Pure formatter (shipped code path) ────────────────────────────────────────
assert.equal(formatBarPlaceLine(null), null, 'missing stationId → no place line');
assert.equal(formatBarPlaceLine(''), null, 'empty stationId → no place line');
assert.equal(formatBarPlaceLine(undefined), null, 'undefined stationId → no place line');

const helios = formatBarPlaceLine('station_helios');
assert.ok(helios, 'station_helios must produce a place line');
assert.match(helios, /Helios Station/, 'Helios place line names the station');
assert.match(helios, /cantina/i, 'place line includes cantina flavor');
assert.match(helios, /Concord|Solar Concord Navy|Helios Prime/, 'Helios flavor uses faction or sector');
assert.doesNotMatch(helios, /^cantina$/i, 'must not be flavor-only');

const smuggler = formatBarPlaceLine('station_smuggler');
assert.ok(smuggler, 'station_smuggler must produce a place line');
assert.match(smuggler, /Smuggler Den/, 'smuggler den is named');
assert.match(smuggler, /Quiet|Pallas Drift/i, 'smuggler flavor uses Quiet faction or sector');

// Catalog name preferred for known stations (stable place identity).
assert.equal(
  formatBarPlaceLine('station_helios', {
    entityList: [
      { id: 1, type: 'station', name: 'Helios Orbital', data: { stationId: 'station_helios' } },
    ],
  }),
  'Helios Station · Concord cantina',
  'authored catalog name preferred over live entity alias',
);

// Unknown id: live entity name fills the gap, else titled id + local cantina.
assert.equal(
  formatBarPlaceLine('station_unknown_xyz', {
    entityList: [
      { id: 9, type: 'station', name: 'Ghost Berth', data: { stationId: 'station_unknown_xyz' } },
    ],
  }),
  'Ghost Berth · local cantina',
  'unknown id uses live entity name when catalog has no row',
);
const unknown = formatBarPlaceLine('station_unknown_xyz');
assert.ok(unknown);
assert.match(unknown, /Unknown Xyz/);
assert.match(unknown, /local cantina/);
ok('formatBarPlaceLine product path');

// ── Source wiring: live Bar mounts place chrome from stationId ────────────────
const bar = read('src/ui/station/screens/bar.js');
assert.match(bar, /export function formatBarPlaceLine/);
assert.match(bar, /sx-bar__place/, 'Bar DOM includes place header');
assert.match(bar, /function renderPlace/, 'Bar renders place identity');
assert.match(bar, /renderPlace\(state\)/, 'renderAll/path calls renderPlace');
assert.match(
  bar,
  /currentStationId[\s\S]{0,200}formatBarPlaceLine|formatBarPlaceLine\(sid\(\)/,
  'place line consumes sid()/stationId plumbing',
);
assert.match(bar, /onShow\(c\)[\s\S]{0,120}stationId/, 'onShow still captures stationId');
ok('createBarScreen place chrome wiring');

// ── CSS: quiet place line, no shell redesign ──────────────────────────────────
const css = read('styles/station.css');
assert.match(css, /\.sx-bar__place\s*\{/, 'station.css styles place line');
assert.match(css, /\.sx-bar__place-name/, 'station name style hook');
assert.match(css, /\.sx-bar__place-flavor/, 'cantina flavor style hook');
assert.match(css, /\.sx-bar__body\s*\{/, 'body grid preserves 3-column instrument');
assert.match(
  css,
  /\.sx-bar__body\s*\{[^}]*grid-template-columns:\s*250px\s+minmax\(380px,\s*1fr\)\s+300px/s,
  'body keeps original bar column proportions',
);
// Shell destinations remain owned by stationApp — this slice must not rewrite them.
const stationApp = read('src/ui/station/stationApp.js');
assert.match(stationApp, /id: 'bar', label: 'Bar'/, 'Bar destination still registered in shell');
assert.match(stationApp, /createBarScreen/, 'shell still mounts createBarScreen');
ok('CSS place chrome + shell fence');

console.log(`\nBar place identity checks OK (${n} groups).`);
