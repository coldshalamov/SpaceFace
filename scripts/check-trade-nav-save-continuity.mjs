#!/usr/bin/env node
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error('[check-trade-nav-save-continuity] FAIL:', message);
    process.exit(1);
  }
}

const nav = read('src/save/navContinuity.js');
const registry = read('src/core/registry.js');
const saveVersion = read('src/data/saveVersion.js');
const migrations = read('src/save/migrations.js');

assert(nav.includes('serializeDataWithNavContinuity'), 'save serializer must be patched to include data.nav');
assert(/data\.nav\s*=\s*serializeNavState/.test(nav), 'serializer must write sanitized nav state');
assert(nav.includes('restoreWithNavContinuity'), 'save restore must be patched for nav');
assert(nav.includes('this.state.nav = emptyNavState()'), 'restore must clear stale nav before loading a save');
assert(nav.includes("this.bus.on('dock:undocked'"), 'station departure must trigger the continuity autosave seam');
assert(nav.includes("saveSystem.save(AUTOSAVE_SLOT)"), 'departure autosave must bypass the generic flight debounce');
assert(nav.includes('normalizeWaypoint'), 'waypoint payload must be normalized before persistence');
assert(nav.includes('liveStationPos'), 'same-sector station waypoints should rehydrate from live station entities');

assert(registry.includes("import { navContinuity } from '../save/navContinuity.js';"), 'navContinuity must be imported by registry');
assert(/ui,\s*navContinuity,\s*save/.test(registry.replace(/\n/g, ' ')), 'navContinuity must initialize immediately before save');

assert(/CURRENT_VERSION\s*=\s*6/.test(saveVersion), 'save schema version must be bumped to v6');
assert(/from:\s*5[\s\S]*to:\s*6[\s\S]*data\.nav/.test(migrations), 'v5→v6 migration must seed data.nav');

console.log('[check-trade-nav-save-continuity] OK: nav save/restore/departure autosave contract present');
