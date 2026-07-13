#!/usr/bin/env node
// check-station-hub-classes.mjs — Station OS hub root class invariants.
// Proves _resolveStation / applyStationHubRootClasses preserves desk+os bases,
// swaps exclusive type modifiers without stale accumulation, and does not
// destroy st-hub--engineering or trace-active (UIUX-STATION-OS-IMPL-001).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyStationHubRootClasses,
  dockRailItemKey,
  STATION_HUB_ROOT_BASE_CLASSES,
  STATION_HUB_TYPE_CLASSES,
} from '../src/ui/screens/stationHub.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const hubPath = join(ROOT, 'src/ui/screens/stationHub.js');
const hubSrc = readFileSync(hubPath, 'utf8');

// ── Lightweight classList stub (no browser DOM required) ─────────────────────
function makeClassList(initial = []) {
  const set = new Set(initial);
  return {
    add(...tokens) {
      for (const t of tokens) {
        if (t) set.add(String(t));
      }
    },
    remove(...tokens) {
      for (const t of tokens) set.delete(String(t));
    },
    contains(token) {
      return set.has(String(token));
    },
    toggle(token, force) {
      const t = String(token);
      if (force === true) { set.add(t); return true; }
      if (force === false) { set.delete(t); return false; }
      if (set.has(t)) { set.delete(t); return false; }
      set.add(t);
      return true;
    },
    toArray() {
      return [...set];
    },
  };
}

function makeEl(initialClasses = []) {
  return { classList: makeClassList(initialClasses) };
}

function assertBases(el, label) {
  for (const c of STATION_HUB_ROOT_BASE_CLASSES) {
    assert.ok(el.classList.contains(c), `${label}: missing invariant base "${c}"`);
  }
}

// ── Static anti-regression: the exact wipe line must not return ──────────────
assert.doesNotMatch(
  hubSrc,
  /this\._el\.className\s*=\s*['"]st-hub panel['"]/,
  'hub root must not wholesale-assign className to incomplete "st-hub panel"',
);
assert.match(
  hubSrc,
  /applyStationHubRootClasses\s*\(\s*this\._el/,
  '_resolveStation must call applyStationHubRootClasses on the hub root',
);
assert.match(
  hubSrc,
  /className\s*=\s*['"]st-hub panel['"]/,
  'mount seeds gold framed hub bases (st-hub panel)',
);
assert.ok(
  STATION_HUB_ROOT_BASE_CLASSES.includes('st-hub') && STATION_HUB_ROOT_BASE_CLASSES.includes('panel'),
  'STATION_HUB_ROOT_BASE_CLASSES must include st-hub + panel',
);
console.log('ok   static: no className wipe; resolve uses helper; mount bases present');

// ── Service Dock refresh identity: status changes must not rebuild hoverable buttons ────────────
{
  const stable = [
    { id: 'refuel', label: 'Refuel', icon: '⛽', readiness: { state: 'good', label: '100%' } },
    { id: 'repair', label: 'Repair', icon: '⚒', readiness: { state: 'warn', label: '7%' } },
  ];
  const changedStatus = [
    { id: 'refuel', label: 'Refuel', icon: '⛽', readiness: { state: 'good', label: '99%' } },
    { id: 'repair', label: 'Repair', icon: '⚒', readiness: { state: 'good', label: '100%' } },
  ];
  const changedStructure = [
    { id: 'refuel', label: 'Refuel', icon: '⛽', readiness: { state: 'good', label: '99%' } },
    { id: 'repair', label: 'Hull Repair', icon: '⚒', readiness: { state: 'good', label: '100%' } },
  ];
  assert.equal(dockRailItemKey(stable), dockRailItemKey(changedStatus),
    'readiness-only updates must preserve the dock item identity and therefore hover/focus state');
  assert.notEqual(dockRailItemKey(stable), dockRailItemKey(changedStructure),
    'a real service-layout change must still rebuild the dock controls');
  assert.match(hubSrc, /if\s*\(this\._dockRailItemKey\s*!==\s*itemKey\)[\s\S]*?setItems\(items\)[\s\S]*?else\s*\{[\s\S]*?setReadiness\(item\.id, item\.readiness\)/,
    'station refresh must update dock readiness in place instead of rebuilding pointer targets');
  assert.match(hubSrc, /if\s*\(options\.periodic\)\s*return;/,
    'the periodic modal heartbeat must not rebuild the docked station DOM while simulation is paused');
  assert.match(hubSrc, /const refreshServiceDock[\s\S]*?_refreshSchematicAndNodes\(\)[\s\S]*?bus\.on\(['"]ship:statsChanged['"],\s*refreshServiceDock\)[\s\S]*?bus\.on\(['"]fuel:changed['"],\s*refreshServiceDock\)/,
    'event-driven ship and fuel changes must update Service Dock readiness after the periodic refresh sleeps');
  console.log('ok   service dock refresh keeps hover/focus targets stable across live status updates');
}

// ── 1) Mount-equivalent bases + N× resolve same station (trade_hub) ──────────
{
  const el = makeEl(['st-hub', 'panel']);
  for (let i = 0; i < 3; i++) {
    applyStationHubRootClasses(el, 'trade_hub');
  }
  assertBases(el, 'repeated resolve trade_hub');
  assert.ok(el.classList.contains('st-hub--trade_hub'), 'trade_hub type present after 3× resolve');
  for (const t of STATION_HUB_TYPE_CLASSES) {
    if (t === 'st-hub--trade_hub') continue;
    assert.ok(!el.classList.contains(t), `no stale type ${t} after same-station resolve`);
  }
  console.log('ok   3× resolve same station preserves bases + trade_hub type');
}

// ── 2) Station-type change: trade_hub → military (no stale type) ─────────────
{
  const el = makeEl(['st-hub', 'panel']);
  applyStationHubRootClasses(el, 'trade_hub');
  applyStationHubRootClasses(el, 'military');
  assertBases(el, 'type change');
  assert.ok(el.classList.contains('st-hub--military'), 'military type after swap');
  assert.ok(!el.classList.contains('st-hub--trade_hub'), 'trade_hub type removed on swap');
  console.log('ok   type swap trade_hub → military: exclusive, bases intact');
}

// ── 3) engineering + trace-active survive resolve ────────────────────────────
{
  const el = makeEl(['st-hub', 'panel', 'st-hub--engineering', 'trace-active']);
  applyStationHubRootClasses(el, 'refinery');
  assertBases(el, 'preserve engineering/trace');
  assert.ok(el.classList.contains('st-hub--engineering'), 'st-hub--engineering survives resolve');
  assert.ok(el.classList.contains('trace-active'), 'trace-active survives resolve');
  assert.ok(el.classList.contains('st-hub--refinery'), 'refinery type applied');
  console.log('ok   engineering + trace-active preserved across resolve');
}

// ── 4) null/missing type: drop type classes, keep bases + concurrent mods ────
{
  const el = makeEl([
    'st-hub', 'panel',
    'st-hub--mining', 'st-hub--engineering', 'trace-active',
  ]);
  applyStationHubRootClasses(el, null);
  assertBases(el, 'null type');
  assert.ok(!el.classList.contains('st-hub--mining'), 'type cleared when station type missing');
  assert.ok(el.classList.contains('st-hub--engineering'), 'engineering kept when type null');
  assert.ok(el.classList.contains('trace-active'), 'trace-active kept when type null');
  console.log('ok   null type removes type class only');
}

// ── 5) multi-step: map-return style re-show (bases + eng + type) ─────────────
{
  const el = makeEl();
  // mount-equivalent
  applyStationHubRootClasses(el, 'trade_hub');
  // setTab engineering while on shipyard
  el.classList.add('st-hub--engineering');
  // arrival edge
  el.classList.add('trace-active');
  // onShow → resolve again (map return while docked)
  applyStationHubRootClasses(el, 'trade_hub');
  applyStationHubRootClasses(el, 'trade_hub');
  assertBases(el, 'map-return re-show');
  assert.ok(el.classList.contains('st-hub--trade_hub'), 'type still trade_hub');
  assert.ok(el.classList.contains('st-hub--engineering'), 'engineering after map re-show');
  assert.ok(el.classList.contains('trace-active'), 'trace-active after map re-show');
  console.log('ok   map-return re-show path preserves bases + engineering + trace');
}

// ── 6) unknown type: closed allowlist rejects unowned modifier ───────────────
{
  const el = makeEl(['st-hub', 'panel']);
  applyStationHubRootClasses(el, 'unknown_station_type');
  assertBases(el, 'unknown type');
  assert.ok(!el.classList.contains('st-hub--unknown_station_type'), 'unknown type class rejected');
  console.log('ok   unknown station type cannot add an unowned root modifier');
}

console.log('Station hub root classes OK — bases, exclusive type swap, engineering/trace preserved');
