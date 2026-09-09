// BP-12 packet CAUSE_LEDGER_TOOLTIP acceptance check ("why prices changed").
//
// Contract (src/data/causePhrases.js + src/ui/causeLedger.js):
//   - The phrase bank maps EVERY enumerated dangerModel.classifyDrivers tag to prose, per axis,
//     and contains NOTHING the kernel can't produce (no free-text cause invention) — pinned by
//     extracting the literal tag set from the classifyDrivers source itself.
//   - driverPhrase is pure: meridian_transmission + rising trend → a sentence naming Meridian and
//     the direction; unknown tags render NOTHING (null), never invented text.
//   - causeFor routes through sectorSim.sectorSignalFor: the live field node wins over the legacy
//     drift mirror; deterministic given a fixed field digest; degrades to phrased structural
//     defaults when no field exists.
//   - The wired module is SYSTEMS-only, event-driven, refreshes state.ui.causeLedger, and NEVER
//     speaks (voice budget: none). Headless (no document) is a strict no-DOM path.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { CAUSE_PHRASES, CAUSE_AXES, DIRECTION_WORDS } from '../src/data/causePhrases.js';
import { driverPhrase, causeFor, causeLedger } from '../src/ui/causeLedger.js';
import { SECTORS } from '../src/data/sectors.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Run body with Math.random / Date.now poisoned (pure read layer — any roll or clock read throws).
function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in cause-ledger path'); };
  Date.now = () => { throw new Error('Date.now in cause-ledger path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

testBankPinnedToKernelTags();
guarded(testDriverPhraseAcceptance);
guarded(testNoFreeTextInvention);
guarded(testCauseForFieldWinsAndDeterminism);
guarded(testCauseForNoFieldDefaults);
guarded(testWiredModuleHeadless);

console.log('Cause-ledger checks OK');

// ── 1. the bank covers the kernel's enumerated tags EXACTLY (both directions) ──────────────────
function testBankPinnedToKernelTags() {
  const src = readFileSync(path.join(ROOT, 'src', 'systems', 'dangerModel.js'), 'utf8');
  const fnStart = src.indexOf('function classifyDrivers');
  assert.ok(fnStart >= 0, 'dangerModel.js still defines classifyDrivers');
  const fnEnd = src.indexOf('\nfunction ', fnStart + 1);
  const body = src.slice(fnStart, fnEnd > fnStart ? fnEnd : undefined);

  const kernelTags = { danger: new Set(), pricePressure: new Set(), influence: new Set() };
  // Assignments: `danger = 'tag'` / `pricePressure = 'tag'` / `influence = 'tag'` (covers the
  // `let x = '...'` defaults too). Comparison literals like `impulseKind === 'trade'` are NOT
  // matched — those are impulse kinds, not driver tags.
  for (const axis of CAUSE_AXES) {
    const re = new RegExp(`\\b${axis} = '([a-z_]+)'`, 'g');
    for (const m of body.matchAll(re)) kernelTags[axis].add(m[1]);
  }
  // The influence default is a ternary expression — pull every quoted literal in that statement.
  const ternary = body.match(/let influence = [^;]+;/s);
  assert.ok(ternary, 'classifyDrivers still declares the influence ternary');
  for (const m of ternary[0].matchAll(/'([a-z_]+)'/g)) kernelTags.influence.add(m[1]);

  for (const axis of CAUSE_AXES) {
    const kernel = [...kernelTags[axis]].sort();
    const bank = Object.keys(CAUSE_PHRASES[axis]).sort();
    assert.ok(kernel.length >= 3, `extracted a real tag set for ${axis} (got ${kernel.length})`);
    assert.deepStrictEqual(bank, kernel,
      `causePhrases.${axis} must map the kernel's enumerated tags EXACTLY (missing → unexplained cause; extra → invented cause)`);
    for (const tag of bank) {
      const line = CAUSE_PHRASES[axis][tag];
      assert.ok(typeof line === 'string' && line.trim().length >= 12, `${axis}.${tag} maps to real prose`);
    }
  }
}

// ── 2. packet acceptance: meridian_transmission + rising → names Meridian + direction ──────────
function testDriverPhraseAcceptance() {
  const signal = {
    sectorId: 'sector_x',
    dominantFactionId: 'faction_mts',
    driver: { danger: 'reach_pressure', pricePressure: 'meridian_transmission', influence: 'territorial_anchor' },
    trend: { danger: 0.01, pricePressure: 0.02, influence: 0 },
  };
  const lines = driverPhrase(signal, 'Tethys Reach');
  assert.ok(lines.pricePressure, 'pricePressure line rendered');
  assert.ok(/Meridian/.test(lines.pricePressure), `names Meridian: "${lines.pricePressure}"`);
  assert.ok(lines.pricePressure.includes(DIRECTION_WORDS.pricePressure.up),
    `names the rising direction: "${lines.pricePressure}"`);
  // Falling trend flips the direction word — the phrase tracks the live trend, not a constant.
  const falling = driverPhrase({ ...signal, trend: { ...signal.trend, pricePressure: -0.02 } }, 'Tethys Reach');
  assert.ok(falling.pricePressure.includes(DIRECTION_WORDS.pricePressure.down),
    `falling trend names the falling direction: "${falling.pricePressure}"`);
  assert.notEqual(lines.pricePressure, falling.pricePressure, 'direction changes the sentence');
  // Danger axis phrased from ITS tag; influence names the dominant faction.
  assert.ok(/Reach/.test(lines.danger), `danger line names the Reach: "${lines.danger}"`);
  assert.ok(/Meridian/.test(lines.influence), `influence line names the dominant faction: "${lines.influence}"`);
  // Determinism: same signal → same lines.
  assert.deepStrictEqual(driverPhrase(signal, 'Tethys Reach'), lines, 'pure: same inputs → same prose');
}

// ── 3. no free-text invention: unknown tags render NOTHING ─────────────────────────────────────
function testNoFreeTextInvention() {
  const lines = driverPhrase({
    sectorId: 'sector_x', dominantFactionId: 'faction_scn',
    driver: { danger: 'not_a_kernel_tag', pricePressure: 'also_fake', influence: 'territorial_anchor' },
    trend: { danger: 0, pricePressure: 0, influence: 0 },
  }, 'X');
  assert.equal(lines.danger, null, 'unknown danger tag → null (never invented prose)');
  assert.equal(lines.pricePressure, null, 'unknown pricePressure tag → null');
  assert.ok(lines.influence, 'known tag on another axis still renders');
  assert.deepStrictEqual(driverPhrase(null, 'X'), { danger: null, pricePressure: null, influence: null },
    'missing signal → all-null, never throws');
}

// ── 4. causeFor: the field node wins over legacy drift; deterministic per digest ───────────────
function fixedFieldState(sectorId) {
  return {
    simTime: 100,
    meta: { seed: 7 },
    world: { sectors: {}, currentSectorId: sectorId },
    sectorSim: {
      field: {
        version: 1, epochDays: 3,
        nodes: {
          [sectorId]: {
            danger: 0.55, pricePressure: 0.3,
            influence: { faction_mts: 0.5, faction_scn: 0.3, faction_reach: 0.2 },
            dominantFactionId: 'faction_mts', dominantInfluence: 0.5, contestMargin: 0.2,
            trend: { danger: 0.001, pricePressure: 0.02, influence: 0 },
            driver: { danger: 'reach_pressure', pricePressure: 'meridian_transmission', influence: 'territorial_anchor' },
          },
        },
      },
      // A CONTRADICTING legacy drift mirror: if causeFor read this instead of the field, the
      // surfaced cause would be the structural default, not meridian_transmission.
      sectors: { [sectorId]: { drift: { security: 0.95, enemyDensity: 0 } } },
      meta: {},
    },
  };
}

function testCauseForFieldWinsAndDeterminism() {
  const sectorId = SECTORS[0].id;
  const a = causeFor(fixedFieldState(sectorId), sectorId);
  assert.ok(a, 'causeFor resolves a real sector');
  assert.equal(a.danger, 0.55, 'exposes the current danger value from the sanctioned field read');
  assert.equal(a.pricePressure, 0.3, 'exposes the current price-pressure value from the sanctioned field read');
  assert.deepStrictEqual(a.influence, { faction_mts: 0.5, faction_scn: 0.3, faction_reach: 0.2 },
    'exposes the current influence snapshot without consulting a second read model');
  assert.equal(a.dominantInfluence, 0.5);
  assert.equal(a.contestMargin, 0.2);
  assert.equal(a.ownerId, SECTORS[0].factionId || null,
    'keeps legal ownership distinct from modeled dominant influence');
  assert.equal(a.driver.pricePressure, 'meridian_transmission',
    'routes through sectorSignalFor — the live FIELD node wins over the legacy drift mirror');
  assert.ok(/Meridian/.test(a.lines.pricePressure), 'phrased from the field driver');
  assert.deepStrictEqual(a.receipts.map((receipt) => receipt.axis), ['danger', 'pricePressure', 'influence'],
    'cause receipts have a stable danger → price → influence order');
  assert.deepStrictEqual(a.receipts.map((receipt) => receipt.line), [a.lines.danger, a.lines.pricePressure, a.lines.influence],
    'each receipt is exactly sanctioned phrase-bank prose, never a separately invented explanation');
  assert.ok(a.receipts.length >= 1 && a.receipts.length <= 3, 'causeFor exposes a compact 1–3 receipt budget');
  const b = causeFor(fixedFieldState(sectorId), sectorId);
  assert.deepStrictEqual(a, b, 'deterministic given a fixed field digest');
  assert.equal(causeFor(fixedFieldState(sectorId), 'sector_does_not_exist'), null, 'unknown sector → null');
}

// ── 5. no field yet → phrased structural defaults (never blank, never invented) ────────────────
function testCauseForNoFieldDefaults() {
  const sectorId = SECTORS[0].id;
  const cause = causeFor({ meta: { seed: 7 }, world: { sectors: {} }, sectorSim: {} }, sectorId);
  assert.ok(cause, 'degrades gracefully with no field');
  assert.equal(cause.driver.danger, 'structural_baseline');
  assert.equal(cause.driver.pricePressure, 'market_balance');
  assert.ok(cause.lines.danger && cause.lines.pricePressure && cause.lines.influence,
    'the structural defaults are themselves enumerated tags with prose');
}

// ── 6. wired module: headless-safe, refreshes state.ui, ZERO voice ─────────────────────────────
function testWiredModuleHeadless() {
  const sectorId = SECTORS[0].id;
  const withStations = SECTORS.find((s) => (s.stations || []).length > 0);
  const handlers = new Map();
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, p) { for (const fn of (handlers.get(evt) || []).slice()) fn(p); },
  };
  const voiceCalls = [];
  const state = fixedFieldState(sectorId);
  const sys = { ...causeLedger };
  sys.init({ bus, state, helpers: { voice: { say(m) { voiceCalls.push(m); return true; } } } });

  bus.emit('sector:enter', { sectorId });
  assert.ok(state.ui && state.ui.causeLedger, 'sector:enter refreshes state.ui.causeLedger');
  assert.equal(state.ui.causeLedger.sectorId, sectorId);
  assert.equal(state.ui.causeLedger.driver.pricePressure, 'meridian_transmission');

  if (withStations) {
    const st = withStations.stations[0];
    bus.emit('dock:docked', { stationId: st.id });
    assert.equal(state.ui.causeLedger.sectorId, withStations.id, 'dock:docked resolves station → sector');
  }
  assert.equal(voiceCalls.length, 0, 'the cause ledger is tooltip text — it NEVER speaks (voice:none)');
  sys.destroy();
  bus.emit('sector:enter', { sectorId });
  assert.ok(true, 'destroy unsubscribes cleanly');
}
