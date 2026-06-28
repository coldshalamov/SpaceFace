#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stationTabServiceStatus } from '../src/ui/screens/stationHub.js';

const source = readFileSync(new URL('../src/ui/screens/stationHub.js', import.meta.url), 'utf8');

const helios = {
  name: 'Helios Station',
  type: 'trade_hub',
  services: ['trade', 'shipyard', 'refuel', 'repair', 'missions'],
};

const forge = {
  name: 'Forge Foundry',
  type: 'fab',
  services: ['trade', 'shipyard', 'repair', 'refine', 'module_craft'],
};

const depot = {
  name: 'Refuel Depot',
  type: 'mining',
  services: ['refuel'],
};

assert.equal(stationTabServiceStatus('market', helios).state, 'available');
assert.equal(stationTabServiceStatus('shipyard', helios).state, 'available');
assert.equal(stationTabServiceStatus('services', helios).state, 'available');
assert.equal(stationTabServiceStatus('missions', helios).state, 'available');

const heliosFab = stationTabServiceStatus('manufacture', helios);
assert.equal(heliosFab.state, 'unavailable');
assert.equal(heliosFab.offered, false);
assert.match(heliosFab.title, /no fabrication bay/i);
assert.match(heliosFab.title, /Helios Station/);

assert.equal(stationTabServiceStatus('manufacture', forge).state, 'available');
assert.equal(stationTabServiceStatus('outfit', forge).state, 'available');

assert.equal(stationTabServiceStatus('services', depot).state, 'available');
assert.equal(stationTabServiceStatus('missions', depot).state, 'unavailable');
assert.equal(stationTabServiceStatus('shipyard', depot).state, 'unavailable');
assert.equal(stationTabServiceStatus('manufacture', depot).state, 'unavailable');

const factions = stationTabServiceStatus('factions', depot);
assert.equal(factions.state, 'neutral');
assert.equal(factions.offered, true);

assert.match(source, /const TAB_SERVICE_RULES = /);
assert.match(source, /export function stationTabServiceStatus/);
assert.match(source, /data-service-status/);
assert.match(source, /st-tab-service/);
assert.match(source, /_refreshRailServiceStatus/);
assert.doesNotMatch(
  source,
  /disabled[^\n]+data-service-status/,
  'service rail should inform without disabling station tabs',
);

console.log('Station service rail OK - station-specific service availability is visible without changing the player route.');
