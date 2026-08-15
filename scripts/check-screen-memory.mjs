#!/usr/bin/env node
// check-screen-memory.mjs — J4 "Screen state memory" (CANONICAL_BUILD_MAP §11.12).
//
// The store is pure, so most of this is a real behavioural test rather than substring matching.
// The rest guards decisions that only source can express, each one a trap this codebase supplies:
//
//   A  caps and eviction actually hold — §11.12's trap is "declare a cap and an eviction policy
//      with the new save key, or it grows unbounded"
//   B  the deny policy holds: a pending destructive confirmation must never be restorable, and a
//      value that cannot survive JSON must never reach the save file
//   C  recency survives a save/load round trip, and is ordered by a monotonic counter rather than
//      simTime — MENUS PAUSE THE WORLD, so simTime is frozen for exactly as long as screens are in
//      use and every bag would otherwise carry an identical timestamp
//   D  the save wiring exists in BOTH of saveSystem's duplicated key plans, and the schema version
//      was bumped with a migration
//   E  it stays out of the sim snapshot hash — the bag lives on state.ui, which
//      core/simSnapshot.js's explicit ALLOW-LIST does not include
//
// Run: node scripts/check-screen-memory.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScreenMemory, sanitizeValue, MAX_SCREENS, MAX_KEYS_PER_SCREEN } from '../src/ui/screenMemory.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const notes = [];
const fail = (rule, detail) => failures.push(`${rule}: ${detail}`);
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// ── A. caps and eviction ───────────────────────────────────────────────────────────────────────
{
  // A PAUSED clock is the realistic case: menus pause the world, so simTime does not advance while
  // the player is using screens.
  const mem = createScreenMemory({ simTime: 12.5 });
  for (let i = 0; i < MAX_SCREENS * 3; i++) mem.set('screen' + i, { k: i });
  if (mem.screenCount() !== MAX_SCREENS) {
    fail('A/cap', `${MAX_SCREENS * 3} screens written but ${mem.screenCount()} retained (cap is ${MAX_SCREENS})`);
  }
  // Least-recently-written evicted first, PROVEN under a frozen clock. Fill exactly to the cap in
  // order, RE-TOUCH the first bag, then write one more. Correct LRU evicts the second bag and keeps
  // the re-touched first. Ordering by simTime instead would compare equal for every pair, leaving
  // Array.sort to fall back on insertion order and evict the re-touched bag — which is the whole
  // reason recency is a monotonic counter here. (An earlier version of this test could not tell the
  // two apart and passed the broken ordering.)
  const lru = createScreenMemory({ simTime: 12.5 });
  const ids = Array.from({ length: MAX_SCREENS }, (_, i) => 'lru' + i);
  for (const id of ids) lru.set(id, { a: 1 });
  lru.set(ids[0], { a: 2 });          // re-touch the oldest -> it is now the newest
  lru.set('overflow', { a: 3 });      // forces exactly one eviction
  if (lru.read(ids[0], 'a', null) !== 2) {
    fail('A/lru', 'a re-touched bag was evicted — eviction is not ordered by write recency (a frozen simTime cannot order it)');
  }
  if (lru.read(ids[1], 'a', null) !== null) {
    fail('A/lru', 'the least-recently-written bag survived while the cap was enforced elsewhere');
  }
  const patch = {};
  for (let i = 0; i < MAX_KEYS_PER_SCREEN * 3; i++) patch['k' + i] = i;
  mem.set('fat', patch);
  const kept = Object.keys(mem.get('fat')).length;
  if (kept !== MAX_KEYS_PER_SCREEN) {
    fail('A/cap', `${MAX_KEYS_PER_SCREEN * 3} keys written but ${kept} retained (cap is ${MAX_KEYS_PER_SCREEN})`);
  }
  notes.push(`caps hold: ${MAX_SCREENS} screens / ${MAX_KEYS_PER_SCREEN} keys, least-recently-written evicted`);
}

// ── B. the deny policy ─────────────────────────────────────────────────────────────────────────
{
  const mem = createScreenMemory({ simTime: 1 });
  // Restoring one of these would re-arm a decision the player never made twice.
  // ONE token per key: compound names like `pendingUndockConfirm` are caught by three different
  // alternatives at once, so a weakened deny list still passed. Each key here isolates one rule.
  const denied = {
    confirmStep: true, pendingSale: true, armedCharge: true, destructTarget: 'x',
    deleteSlot: 'slot1', undockIntent: 'now', exitStage: 'confirm', tokenValue: 't',
    secretKey: 'k', passwordHash: 'h', sessionId: 's', handleRef: 1, callbackName: 'cb',
    rootElement: {}, hostEl: {},
  };
  mem.set('station', { ...denied, activeTab: 'market' });
  const bag = mem.get('station');
  for (const k of Object.keys(denied)) {
    if (k in bag) fail('B/deny', `"${k}" was stored — a restored ${k} re-arms state the player did not choose`);
  }
  if (bag.activeTab !== 'market') fail('B/deny', 'the deny screen also rejected a legitimate key');

  // Shape screening: anything that cannot survive JSON must be dropped at WRITE time, so a bad
  // value never reaches the save file and load never has to defend against one.
  class Widget { constructor() { this.x = 1; } }
  const unstorable = { fn: () => {}, inst: new Widget(), map: new Map(), set: new Set(), nan: NaN, inf: Infinity, sym: Symbol('s'), nested: { a: { b: 1 } } };
  for (const [k, v] of Object.entries(unstorable)) {
    if (sanitizeValue(v) !== undefined) fail('B/shape', `sanitizeValue accepted ${k} (${typeof v}) — it cannot survive a save`);
  }
  // A cyclic graph must not hang or throw.
  const cyc = { a: 1 }; cyc.self = cyc;
  let cycOk = true;
  try { JSON.stringify(sanitizeValue(cyc)); } catch (_) { cycOk = false; }
  if (!cycOk) fail('B/shape', 'a cyclic value survived sanitization and broke JSON.stringify');

  // What MUST survive: the flat layer-toggle object galaxyMap actually stores.
  const layers = sanitizeValue({ route: true, market: false, hazard: true });
  if (!layers || layers.route !== true || layers.market !== false) {
    fail('B/shape', 'a flat boolean map (galaxyMap._layers) did not survive — the primary payload');
  }
  notes.push(`${Object.keys(denied).length} denied keys and ${Object.keys(unstorable).length} unstorable shapes rejected`);
}

// ── C. recency survives the round trip ─────────────────────────────────────────────────────────
{
  const mem = createScreenMemory({ simTime: 12.5 });
  mem.set('old', { a: 1 }); mem.set('mid', { a: 2 }); mem.set('new', { a: 3 });
  const raw = JSON.parse(JSON.stringify(mem.serialize()));
  const order = Object.values(raw.bags).map((b) => Number(b.n));
  if (new Set(order).size !== order.length) {
    fail('C/recency', 'bags share a recency value — eviction order is undefined (simTime is frozen while menus are open)');
  }
  const mem2 = createScreenMemory({ simTime: 0 });
  mem2.deserialize(raw);
  if (mem2.read('old', 'a', null) !== 1) fail('C/roundtrip', 'a bag did not survive serialize -> deserialize');
  mem2.set('fresh', { a: 4 });
  const after = mem2.serialize().bags;
  const maxRestored = Math.max(...['old', 'mid', 'new'].map((k) => Number(after[k] && after[k].n) || 0));
  if (!(Number(after.fresh.n) > maxRestored)) {
    fail('C/recency', 'a post-load write got a recency value below a restored bag — it would be evicted first');
  }
  // Hostile input must not throw and must not pass anything through unscreened.
  for (const bad of [null, undefined, 42, 'x', [], { bags: null }, { bags: { x: { d: { evil: { a: { b: 2 } } } } } }]) {
    try { mem2.deserialize(bad); } catch (e) { fail('C/hostile', `deserialize(${JSON.stringify(bad)}) threw: ${e.message}`); }
  }
  notes.push('recency is monotonic and survives save -> load');
}

// ── D. save wiring, in BOTH duplicated plans ───────────────────────────────────────────────────
{
  const save = read('src/save/saveSystem.js');
  // saveSystem lists its save keys TWICE — an ordered [key, fn] plan array and serializeData().
  // Updating one and not the other diverges the two save paths silently, and a test on one path
  // cannot see it. (This repo already carries one such divergence: `entropy` is in serializeData
  // but not in the plan array, so autosaves ship without it. Reported below, not failed on.)
  const inPlan = /\['uiScreenMemory',\s*\(\)\s*=>\s*this\._serializeScreenMemory\(\)\]/.test(save);
  const inData = /data\.uiScreenMemory\s*=\s*this\._serializeScreenMemory\(\)/.test(save);
  if (!inPlan) fail('D/plan', 'uiScreenMemory is missing from the ordered save-key plan — autosaves would omit it');
  if (!inData) fail('D/plan', 'uiScreenMemory is missing from serializeData() — manual saves would omit it');
  if (!/_restoreScreenMemory\(data\.uiScreenMemory\)/.test(save)) {
    fail('D/restore', 'nothing restores uiScreenMemory on load — it would be written and never read');
  }
  if (CURRENT_VERSION < 13) fail('D/version', `CURRENT_VERSION is ${CURRENT_VERSION}; the new save key needs a bump`);
  const migrations = read('src/save/migrations.js');
  if (!/from:\s*12,\s*to:\s*13/.test(migrations)) fail('D/migration', 'no v12 -> v13 migration step for the new save key');

  // Report the pre-existing divergence without failing on it — it is not J4's to fix, but it is
  // exactly the class of defect this rule exists to prevent, and it should stay visible.
  const planRegion = save.slice(save.indexOf('_saveCapturePlan'), save.indexOf('serializeData()'));
  if (!/\['entropy'/.test(planRegion) && /data\.entropy\s*=/.test(save)) {
    notes.push('WARNING (pre-existing, not J4): `entropy` is in serializeData() but not the plan array, so autosaves omit it; check:sim reloads via the manual path and cannot see this');
  }
}

// ── E. hash containment ────────────────────────────────────────────────────────────────────────
{
  const snap = read('src/core/simSnapshot.js');
  const fn = snap.slice(snap.indexOf('export function snapshotSimState'), snap.indexOf('const physics ='));
  if (/\bstate\.ui\b/.test(fn)) {
    fail('E/hash', 'simSnapshot now reads state.ui — screen memory would enter the replay hash and drift the 47a goldens');
  }
  const memSrc = read('src/ui/screenMemory.js');
  if (!/state\.ui\.screenMemory/.test(memSrc)) {
    fail('E/hash', 'the bag no longer lives on state.ui — that is the only location outside the sim snapshot allow-list');
  }
  notes.push('bag lives on state.ui, which simSnapshot\'s allow-list excludes');
}

for (const n of notes) console.log(`  · ${n}`);
if (failures.length) {
  console.error('\ncheck:screen-memory FAILED');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('check:screen-memory OK — caps hold, denies hold, round-trips, wired to both save plans, out of the hash');
