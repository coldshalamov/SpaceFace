#!/usr/bin/env node
// Milestone-3 engineering preview contract.
// Every Shipyard/Outfitting compare/delta path must derive from ships.getDerivedStats
// with real hull + fittings — never fabricated module.mods key diffs or fake fittings.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  buildSlotList,
  fittingsFromDefaultModules,
  getDerivedStats,
} from '../src/systems/ships.js';
import {
  ENGINEERING_PREVIEW_SCHEMA,
  formatPreviewDelta,
  normalizeFittings,
  presentDerivedReadout,
  presentGaugePacket,
  presentHullCompare,
  presentLoadoutDelta,
  presentModuleFitPreview,
  presentShopModuleDelta,
  stockPreviewPlayer,
} from '../src/ui/presenters/engineeringPreview.js';

const presenterSrc = readFileSync(new URL('../src/ui/presenters/engineeringPreview.js', import.meta.url), 'utf8');
const liveShipworksSrc = readFileSync(new URL('../src/ui/station/screens/shipworks.js', import.meta.url), 'utf8');

assert.equal(typeof window, 'undefined', 'engineering preview contract runs headless');
assert.equal(ENGINEERING_PREVIEW_SCHEMA, 'spaceface.engineeringPreview.v1');

let sections = 0;
function ok(label) {
  sections++;
  console.log('  PASS ' + label);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random forbidden in engineering preview'); };
  Date.now = () => { throw new Error('Date.now forbidden in engineering preview'); };
  try { return fn(); } finally {
    Math.random = random;
    Date.now = now;
  }
}

assert.match(presenterSrc, /getDerivedStats/,
  'presenter must call ships.getDerivedStats');
assert.doesNotMatch(presenterSrc, /document\.|createElement|innerHTML/,
  'presenter must stay pure (no DOM)');
assert.match(liveShipworksSrc, /presentDerivedReadout|presentModuleFitPreview|presentShopModuleDelta/,
  'live Shipworks must consume the canonical engineering presenter');
assert.doesNotMatch(liveShipworksSrc, /function\s+shipStats\s*\(|function\s+moduleStat\s*\(/,
  'live Shipworks must not retain simplified parallel stat authorities');
assert.doesNotMatch(liveShipworksSrc, /allowFastFallback:\s*true/,
  'live Shipworks must refuse the fabricated fast preview fallback');
assert.match(liveShipworksSrc, /if\s*\(!\(ghostActive\s*&&\s*ghostSource\s*===\s*['"]module['"]\)\)\s*renderCenter\(\)/,
  'periodic station refresh must preserve an active pointer/focus module preview while still refreshing ordinary and preset views');
assert.match(liveShipworksSrc, /if\s*\(chooserEl\.hidden\)\s*renderSide\(\)/,
  'periodic station refresh must not rebuild the active module chooser');
assert.match(liveShipworksSrc, /if\s*\(periodicCtx\s*===\s*ctx\)\s*return/,
  'station cadence must not replace event-driven Shipworks pointer targets');
ok('live Shipworks uses the canonical engineering presenter');

// ---- stock player zeros cargo ----
const stock = stockPreviewPlayer({ cargo: { usedMass: 40 }, efficiencyMods: { cargoCapMult: 1.1 } });
assert.equal(stock.cargo.usedMass, 0, 'stock preview player zeros cargo mass');
assert.equal(stock.efficiencyMods.cargoCapMult, 1.1, 'stock preview keeps efficiency mods');
ok('stock preview player');

// ---- gauge packet equals live getDerivedStats ----
const kestrel = SHIPS.find((s) => s.id === 'ship_kestrel');
const starterFit = fittingsFromDefaultModules('ship_kestrel', ['wpn_pulse_laser_s', 'mod_engine_ion_m']);
const live = getDerivedStats('ship_kestrel', starterFit, null);
const gauges = presentGaugePacket('ship_kestrel', starterFit, null);
assert.equal(gauges.ok, true);
assert.equal(gauges.shieldMax, live.shieldMax);
assert.equal(gauges.cargoCap, live.cargoCap);
assert.equal(gauges.maxSpeed, live.maxSpeed);
assert.equal(gauges.mass, live.mass);
assert.equal(gauges.continuousDrain, live.continuousDrain);
ok('gauge packet matches getDerivedStats');

// ---- hull compare uses stock empty fittings both sides ----
const player = {
  credits: 100000,
  activeShipIndex: 0,
  ownedShips: [{ defId: 'ship_kestrel', fittings: starterFit }],
  cargo: { usedMass: 25 },
  efficiencyMods: {},
};
const cmp = guarded(() => presentHullCompare(SHIPS.find((s) => s.id === 'ship_mule'), player));
assert.equal(cmp.kind, 'compare');
assert.equal(cmp.basis, 'stock');
assert.ok(cmp.compare && cmp.compare.rows.length >= 5);
const emptyK = normalizeFittings('ship_kestrel', []);
const emptyM = normalizeFittings('ship_mule', []);
assert.deepEqual([...cmp.candidateFittings], emptyM);
assert.deepEqual([...cmp.currentFittings], emptyK);
// Numbers must match stock getDerivedStats (not fitted current, not cargo-inflated)
const stockP = stockPreviewPlayer(player);
const muleStock = getDerivedStats('ship_mule', [], stockP);
const kestrelStock = getDerivedStats('ship_kestrel', [], stockP);
const hullRow = cmp.compare.rows.find((r) => r.label === 'Hull');
assert.ok(hullRow);
assert.equal(hullRow.candidate, muleStock.hullMax);
assert.equal(hullRow.current, kestrelStock.hullMax);
const self = presentHullCompare(kestrel, player);
assert.equal(self.kind, 'current');
ok('hull compare is stock getDerivedStats both sides');

// ---- loadout delta: cargo pod on mule changes cargo + handling ----
const muleSlots = buildSlotList(SHIPS.find((s) => s.id === 'ship_mule'));
const cargoIdx = muleSlots.findIndex((s) => s.type === 'cargo');
assert.ok(cargoIdx >= 0);
const cargoPod = MODULES.find((m) => m.id === 'mod_cargo_pod_m') || MODULES.find((m) => m.slotType === 'cargo' && m.size === 'M');
assert.ok(cargoPod, 'need a cargo module for delta proof');
const afterFit = normalizeFittings('ship_mule', []);
afterFit[cargoIdx] = cargoPod.id;
const delta = presentLoadoutDelta({
  defId: 'ship_mule',
  beforeFittings: [],
  afterFittings: afterFit,
  player: null,
});
assert.equal(delta.ok, true);
const cargoRow = delta.rows.find((r) => r.key === 'cargoCap');
assert.ok(cargoRow && cargoRow.delta > 0, 'cargo module must raise derived cargoCap');
const beforeLive = getDerivedStats('ship_mule', [], null);
const afterLive = getDerivedStats('ship_mule', afterFit, null);
assert.equal(cargoRow.before, beforeLive.cargoCap);
assert.equal(cargoRow.after, afterLive.cargoCap);
ok('loadout delta rows are live getDerivedStats before/after');

// ---- module fit preview: install, replace, unavailable reasons ----
const install = presentModuleFitPreview({
  defId: 'ship_mule',
  fittings: [],
  moduleId: cargoPod.id,
});
assert.equal(install.ok, true);
assert.equal(install.mode, 'install');
assert.equal(install.slotIndex, cargoIdx);
assert.ok(install.rows.some((r) => r.key === 'cargoCap' && r.delta > 0));

const impossible = presentModuleFitPreview({
  defId: 'ship_kestrel',
  fittings: [],
  moduleId: cargoPod.id, // M cargo on S-only kestrel cargo
});
assert.equal(impossible.ok, false);
assert.ok(['size_mismatch', 'no_compatible_slot', 'slot_occupied'].includes(impossible.reason),
  'impossible fit reason was ' + impossible.reason);
assert.match(String(impossible.detail || ''), /hardpoint|size|slot|compatible/i);

const shield = MODULES.find((m) => m.id === 'mod_shield_booster_s') || MODULES.find((m) => m.slotType === 'shield');
const wpn = WEAPONS.find((w) => w.id === 'wpn_pulse_laser_s') || WEAPONS[0];
const filled = fittingsFromDefaultModules('ship_kestrel', [wpn.id, shield.id]);
const swap = presentModuleFitPreview({
  defId: 'ship_kestrel',
  fittings: filled,
  moduleId: shield.id,
  allowReplace: true,
});
// Same shield re-fit may be no-op deltas but must resolve a slot
assert.ok(swap.ok === true || swap.reason === 'slot_occupied' || swap.mode === 'replace' || swap.mode === 'install');

const missing = presentModuleFitPreview({ defId: 'ship_kestrel', fittings: [], moduleId: 'mod_does_not_exist' });
assert.equal(missing.ok, false);
assert.equal(missing.reason, 'unknown_module');
ok('fit preview install/unavailable reasons');

// ---- shop packet chips format from derived, not mods keys ----
const shop = presentShopModuleDelta({
  defId: 'ship_mule',
  fittings: [],
  moduleId: cargoPod.id,
});
assert.equal(shop.ok, true);
assert.ok(shop.chips.length >= 1, 'shop chips should surface at least one derived delta');
for (const chip of shop.chips) {
  assert.ok(chip.label, 'chip has label');
  assert.doesNotMatch(chip.label, /shieldFlat|cargoFlat|accelMult|topSpeed/,
    'chip must not use raw module.mods property names');
}
const shopBad = presentShopModuleDelta({
  defId: 'ship_kestrel',
  fittings: [],
  moduleId: cargoPod.id,
});
assert.equal(shopBad.ok, false);
assert.ok(shopBad.detail);
ok('shop module delta chips are derived labels');

// ---- readout fail-closed ----
const bad = presentDerivedReadout('ship_not_real', [], null);
assert.equal(bad.ok, false);
assert.equal(bad.reason, 'unknown_ship');
assert.ok(formatPreviewDelta({ delta: 12, label: 'Shield' }).includes('shield'));
ok('fail-closed unknown ship + format helper');

// ---- cargo must not leak into stock hull gauges ----
const heavyPlayer = { cargo: { usedMass: 80 }, efficiencyMods: {} };
const stockGauge = presentGaugePacket('ship_wasp', [], stockPreviewPlayer(heavyPlayer));
const liveHeavy = getDerivedStats('ship_wasp', [], heavyPlayer);
const liveStock = getDerivedStats('ship_wasp', [], stockPreviewPlayer(heavyPlayer));
assert.equal(stockGauge.mass, liveStock.mass);
assert.notEqual(liveHeavy.mass, liveStock.mass, 'cargo mass must affect operational mass when not zeroed');
assert.equal(stockGauge.mass, liveStock.mass);
ok('stock gauges ignore hangar cargo mass');

console.log('[check-engineering-preview] PASS — ' + sections + ' sections green');
