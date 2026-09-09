// BP-12 packet SECURITY_RESPONSE_READ ("Security Follows Danger") acceptance check.
//
// Contract (src/ui/securityReadout.js):
//   - securityReadoutFor is PURE: maps the enumerated danger tags (concord_patrols / interdiction_wave
//     / reach_pressure) to a {label,detail,advice} readout. An unknown tag renders NOTHING.
//   - concord_patrols is the "security RISING" readout: only surfaces when trend.danger < 0 (the
//     kernel's own gate is trend.danger < -0.0015). A rising trend under the same tag → null.
//   - Each readout maps to a route/avoid decision (advice: 'route'|'caution'|'avoid') — never a
//     glyph that informs nothing.
//   - The wired module refreshes state.ui.securityReadout for the CURRENT sector only (one per sector
//     max — glyph budget), clears it when there's no readout, and NEVER speaks (voice:none).
import assert from 'node:assert/strict';

import {
  securityReadoutSystem, securityReadoutFor, securityReadout, SECURITY_TAGS,
} from '../src/ui/securityReadout.js';
import { SECTORS } from '../src/data/sectors.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in security-readout path'); };
  Date.now = () => { throw new Error('Date.now in security-readout path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

testEnumeratedTagsOnly();
guarded(testConcordPatrolsRequiresFallingDanger);
guarded(testInterdictionWave);
guarded(testReachPressureAvoid);
guarded(testUnknownTagIsNull);
guarded(testSecurityReadoutFieldWins);
guarded(testDeterminism);
testWiredModuleCurrentSectorAndClears();

console.log('Security-readout checks OK');

function signal(driverDanger, trendDanger, extra) {
  return { sectorId: 'sector_x', driver: { danger: driverDanger, pricePressure: 'market_balance', influence: 'territorial_anchor' }, trend: { danger: trendDanger, pricePressure: 0, influence: 0 }, ...(extra || {}) };
}

// ── 1. only enumerated tags render ───────────────────────────────────────────────────────────
function testEnumeratedTagsOnly() {
  assert.deepEqual([...Object.keys(SECURITY_TAGS)].sort(), ['concord_patrols', 'interdiction_wave', 'reach_pressure'],
    'enumerated danger tags only');
  for (const tag in SECURITY_TAGS) {
    const m = SECURITY_TAGS[tag];
    assert.ok(['route', 'caution', 'avoid'].includes(m.advice), `${tag} maps to a route/avoid decision`);
  }
}

// ── 2. concord_patrols requires falling danger (security actually rising) ────────────────────
function testConcordPatrolsRequiresFallingDanger() {
  const rising = securityReadoutFor(signal('concord_patrols', 0.01)); // danger rising → NOT recovering
  assert.equal(rising, null, 'concord_patrols + rising danger → null (would mislead)');
  const falling = securityReadoutFor(signal('concord_patrols', -0.01)); // danger falling → security rising
  assert.ok(falling, 'concord_patrols + falling danger → readout');
  assert.ok(/Concord patrols responding/i.test(falling.label), 'names the responding patrols');
  assert.equal(falling.advice, 'route', 'advises route (safer to travel)');
}

// ── 3. interdiction wave → caution ───────────────────────────────────────────────────────────
function testInterdictionWave() {
  const r = securityReadoutFor(signal('interdiction_wave', 0.02));
  assert.ok(r, 'interdiction_wave renders');
  assert.ok(/interdiction/i.test(r.label), 'names the interdiction wave');
  assert.equal(r.advice, 'caution', 'advises caution (expect checkpoints)');
}

// ── 4. reach_pressure → avoid ────────────────────────────────────────────────────────────────
function testReachPressureAvoid() {
  const r = securityReadoutFor(signal('reach_pressure', 0.03));
  assert.ok(r, 'reach_pressure renders');
  assert.ok(/Reach/i.test(r.label), 'names the Reach raiders');
  assert.equal(r.advice, 'avoid', 'advises avoid (danger)');
}

// ── 5. unknown tag → null ────────────────────────────────────────────────────────────────────
function testUnknownTagIsNull() {
  assert.equal(securityReadoutFor(signal('not_a_real_tag', -0.01)), null, 'unknown tag → null');
  assert.equal(securityReadoutFor(null), null, 'missing signal → null');
}

// ── 6. securityReadout routes through sectorSignalFor (field wins) ───────────────────────────
function testSecurityReadoutFieldWins() {
  const sectorId = SECTORS[0].id;
  const state = {
    simTime: 100, meta: { seed: 7 },
    world: { sectors: {}, currentSectorId: sectorId },
    sectorSim: {
      field: { version: 1, epochDays: 3, nodes: { [sectorId]: {
        danger: 0.4, pricePressure: 0, influence: {}, dominantFactionId: 'faction_scn',
        trend: { danger: -0.01, pricePressure: 0, influence: 0 },
        driver: { danger: 'concord_patrols', pricePressure: 'market_balance', influence: 'territorial_anchor' },
      } } },
      sectors: { [sectorId]: { drift: { security: 0.95, enemyDensity: 0.5 } } }, // contradicting legacy drift
      meta: {},
    },
  };
  const r = securityReadout(state, sectorId);
  assert.ok(r, 'resolves a real sector');
  assert.equal(r.tag, 'concord_patrols', 'routes through sectorSignalFor — the FIELD node wins');
  assert.equal(r.sectorId, sectorId);
}

// ── 7. determinism ──────────────────────────────────────────────────────────────────────────
function testDeterminism() {
  const sig = signal('interdiction_wave', 0.02);
  assert.deepStrictEqual(securityReadoutFor(sig), securityReadoutFor(sig));
}

// ── 8. wired module: current sector only; clears when no readout; never speaks ───────────────
function testWiredModuleCurrentSectorAndClears() {
  const handlers = new Map();
  const voiceCalls = [];
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, p) { for (const fn of (handlers.get(evt) || []).slice()) fn(p); },
  };
  const sectorId = SECTORS[0].id;
  const state = {
    simTime: 100, meta: { seed: 7 }, world: { sectors: {}, currentSectorId: sectorId },
    sectorSim: { field: { version: 1, epochDays: 3, nodes: { [sectorId]: {
      danger: 0.4, pricePressure: 0, influence: {}, dominantFactionId: 'faction_scn',
      trend: { danger: -0.01, pricePressure: 0, influence: 0 },
      driver: { danger: 'concord_patrols', pricePressure: 'market_balance', influence: 'territorial_anchor' },
    } } }, sectors: {}, meta: {} },
  };
  const sys = { ...securityReadoutSystem };
  sys.init({ bus, state, helpers: { voice: { say(m) { voiceCalls.push(m); return true; } } } });
  bus.emit('sector:enter', { sectorId });
  assert.ok(state.ui.securityReadout, 'sector:enter refreshes state.ui.securityReadout');
  assert.equal(state.ui.securityReadout.tag, 'concord_patrols');
  assert.equal(voiceCalls.length, 0, 'never speaks (voice:none)');

  // Move to a calm sector → readout cleared (no stale glyph from the previous sector)
  const calm = SECTORS.find((s) => s.id !== sectorId) || SECTORS[0];
  state.world.currentSectorId = calm.id;
  state.sectorSim.field.nodes[calm.id] = {
    danger: 0.2, pricePressure: 0, influence: {}, dominantFactionId: 'faction_scn',
    trend: { danger: 0, pricePressure: 0, influence: 0 },
    driver: { danger: 'structural_baseline', pricePressure: 'market_balance', influence: 'territorial_anchor' },
  };
  bus.emit('sector:enter', { sectorId: calm.id });
  assert.ok(!state.ui.securityReadout, 'calm sector → readout cleared (no stale glyph)');
  sys.destroy();
}
