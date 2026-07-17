#!/usr/bin/env node
/**
 * check-dock-arrival-mount.mjs — dockArrival presenter is mounted in live Orbital Command shell.
 * Fence: no station shell redesign, no thrusters, no dual-platform claims.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDockArrival } from '../src/ui/dockArrival.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

let n = 0;
function ok(label) {
  n += 1;
  console.log(`  PASS  ${label}`);
}

// Presenter still pure and Helios-capable
const view = buildDockArrival(
  {
    player: { heat: 0, cargo: { usedVolume: 0, items: {} } },
    missions: { active: [] },
    ui: { marketNews: { log: [{ stationId: 'station_helios', text: 'Helios fuel late.' }], lastCard: null } },
    stationLife: { traffic: [{ stationId: 'station_helios', text: 'Ore cleared berth.' }] },
  },
  { id: 'station_helios', name: 'Helios Station', services: ['trade', 'repair'] },
);
assert.equal(view.identity, 'Helios Station');
assert.equal(view.primaryTarget, 'missions');
ok('buildDockArrival Helios fixture still pure/usable');

const app = read('src/ui/station/stationApp.js');
assert.match(app, /from '\.\.\/dockArrival\.js'/, 'stationApp imports buildDockArrival');
assert.match(app, /buildDockArrival/, 'stationApp calls buildDockArrival');
assert.match(app, /class="sx-arrival"/, 'shell hosts sx-arrival mount point');
assert.match(app, /function renderArrival/, 'renderArrival mounts live strip');
assert.match(app, /renderArrival\(\)/, 'status refresh invokes renderArrival');
assert.match(app, /data-arrival-nav/, 'arrival next-action can navigate');
ok('stationApp live mount wiring');

const css = read('styles/station.css');
assert.match(css, /\.sx-arrival\b/, 'station.css styles sx-arrival');
assert.match(css, /\.sx-arrival__id/, 'identity line styled');
// Fence: no wholesale shell rewrite markers
assert.doesNotMatch(css, /sx-shell-redesign-2026/, 'no redesign marker');
ok('station.css arrival strip present without shell redesign marker');

console.log(`\nDock arrival mount checks OK (${n} groups).`);
