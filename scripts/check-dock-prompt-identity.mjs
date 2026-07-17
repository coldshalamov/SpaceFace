#!/usr/bin/env node
/**
 * check-dock-prompt-identity.mjs — first-hour dock prompt names the station.
 *
 * Proves shipped production path:
 *   physics emits dock:range { stationId, inRange }
 *   alerts formats named place via formatDockRangePromptText (not generic STATION only)
 *
 * Fence: no thrusters/materials, no station shell redesign, no dual-platform claim.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatDockRangePromptText,
  resolveDockStationLabel,
} from '../src/ui/alerts.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

let n = 0;
function ok(label) {
  n += 1;
  console.log(`  PASS  ${label}`);
}

// ── Pure formatter (shipped code path) ────────────────────────────────────────
assert.equal(
  resolveDockStationLabel({ stationId: 'station_helios' }),
  'Helios',
  'station_helios → Helios',
);
assert.match(
  formatDockRangePromptText({ bindingLabel: 'F', stationId: 'station_helios' }),
  /DOCK AT Helios/,
);
assert.doesNotMatch(
  formatDockRangePromptText({ bindingLabel: 'F', stationId: 'station_helios' }),
  /DOCK AT STATION$/,
  'Helios must not collapse to generic STATION',
);
assert.match(
  formatDockRangePromptText({ bindingLabel: 'F', stationId: null }),
  /DOCK AT STATION/,
  'missing stationId still has fallback',
);
assert.match(
  formatDockRangePromptText({
    bindingLabel: 'F',
    stationId: 'station_helios',
    stationName: 'Helios Station',
  }),
  /DOCK AT Helios Station/,
);
// Live entity name wins when state provides it
assert.equal(
  resolveDockStationLabel({
    stationId: 'station_helios',
    state: {
      entityList: [
        { id: 1, type: 'station', name: 'Helios Orbital', data: { stationId: 'station_helios' } },
      ],
    },
  }),
  'Helios Orbital',
);
ok('formatDockRangePromptText / resolveDockStationLabel product path');

// ── Source wiring: physics emits stationId ────────────────────────────────────
const physics = read('src/core/physics.js');
assert.match(
  physics,
  /emit\('dock:range',\s*\{\s*stationId:\s*nextStationId/,
  'physics dock:range in-range must include stationId',
);
assert.match(
  physics,
  /emit\('dock:range',\s*\{\s*stationId:\s*this\._dockStationId/,
  'physics dock:range out-of-range must include stationId',
);
ok('physics dock:range carries stationId');

// ── Source wiring: alerts consumes stationId via formatter ────────────────────
const alerts = read('src/ui/alerts.js');
assert.match(alerts, /export function formatDockRangePromptText/);
assert.match(alerts, /export function resolveDockStationLabel/);
assert.match(
  alerts,
  /bus\.on\('dock:range'[\s\S]{0,400}formatDockRangePromptText/,
  'dock:range handler must call formatDockRangePromptText',
);
assert.match(
  alerts,
  /bus\.on\('dock:range'[\s\S]{0,200}stationId/,
  'dock:range handler must read stationId from payload',
);
// Must not hardcode only generic STATION without formatter
assert.doesNotMatch(
  alerts,
  /bus\.on\('dock:range',\s*\(\{\s*inRange\s*\}\)\s*=>\s*\{\s*if\s*\(inRange\)\s*raise\(\{\s*key:\s*'dock'[\s\S]{0,80}DOCK AT STATION/,
  'must not use legacy generic DOCK AT STATION-only handler',
);
ok('alerts dock:range uses named formatter');

console.log(`\nDock prompt identity checks OK (${n} groups).`);
