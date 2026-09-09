#!/usr/bin/env node
// BP-02 FRAGILE-ORE verification.
//
// Proves the backend half of "ram it and lose it": live physics impacts feed
// a deterministic fragile-cargo loss system, cargo mutation stays in cargo.js,
// fragile stacks expose a glyph/readout, and ordinary cargo is untouched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { cargo } from '../src/systems/cargo.js';
import {
  FRAGILE_CARGO_HARD_DELTA_V,
  applyFragileCargoImpact,
  fragileCargo,
  fragileCargoReadout,
  fragileImpactLossFraction,
  isFragileCommodity,
} from '../src/systems/fragileCargo.js';

let sections = 0;

function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function makeHarness() {
  const bus = createBus();
  const log = { fragileLost: [], toasts: [], voices: [] };
  bus.on('cargo:fragileLost', (payload) => log.fragileLost.push(payload));
  bus.on('toast', (payload) => log.toasts.push(payload));
  const helpers = {
    voice: {
      say(payload) {
        log.voices.push(payload);
        return true;
      },
    },
  };
  const sim = createSimulation({ seed: 5202, bus, helpers, systems: [cargo, fragileCargo] });
  const state = sim.state;
  state.player.cargo.capVolume = 200;
  state.player.cargo.items = {
    cmdty_crystal_lumin: 10,
    cmdty_gem_emerald: 3,
    cmdty_ore_iron: 12,
  };
  sim.registry.get('cargo').recompute();
  return { sim, state, bus, helpers, log, sys: sim.registry.get('fragileCargo') };
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in fragile cargo path'); };
  Date.now = () => { throw new Error('Date.now in fragile cargo path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

testFragileCatalogAndGlyph();
guarded(testPhysicsImpactLossPath);
guarded(testLowImpactAndNonPlayerSafety);
testRuntimeScope();

console.log(`[check-fragile-cargo] PASS - ${sections} sections green`);

function testFragileCatalogAndGlyph() {
  assert.equal(isFragileCommodity('cmdty_crystal_lumin'), true, 'crystal-tagged ore is fragile');
  assert.equal(isFragileCommodity('cmdty_gem_emerald'), true, 'gem/crystal rare ore is fragile');
  assert.equal(isFragileCommodity('cmdty_exotic_xenium'), true, 'exotic rare ore is fragile');
  assert.equal(isFragileCommodity('cmdty_ore_iron'), false, 'plain metal ore is not fragile');
  const h = makeHarness();
  const readout = fragileCargoReadout(h.state);
  assert.deepEqual(readout.map((s) => s.commodityId), ['cmdty_crystal_lumin', 'cmdty_gem_emerald'],
    'readout exposes only fragile stacks');
  assert.equal(readout[0].glyph.token, 'fragile', 'fragile stacks expose the cargo glyph token');
  assert.equal(readout[0].glyph.hint, 'Fragile - fly gently', 'glyph gives the gentle-flying hint');
  ok('fragile ore catalog and stack glyphs are data-backed');
}

function testPhysicsImpactLossPath() {
  const h = makeHarness();
  const fraction = fragileImpactLossFraction({ playerDeltaV: 42 });
  assert.equal(fraction, 0.1567, 'impact loss fraction is deterministic and pinned');
  h.bus.emit('physics:impact', {
    aId: h.state.playerId,
    bId: 'ast_test_crystal',
    playerInvolved: true,
    playerDeltaV: 42,
    dp: 4200,
    pos: { x: 10, z: 20 },
  });

  assert.equal(h.state.player.cargo.items.cmdty_crystal_lumin, 9, 'hard impact removes a small crystal quantity');
  assert.equal(h.state.player.cargo.items.cmdty_gem_emerald, 2, 'hard impact removes a small gem quantity');
  assert.equal(h.state.player.cargo.items.cmdty_ore_iron, 12, 'non-fragile ore quantity is untouched');
  assert.equal(h.log.fragileLost.length, 1, 'system emits one fragile-loss receipt');
  assert.equal(h.log.voices.length, 1, 'loss notice goes through the voice helper when present');
  assert.equal(h.log.toasts.length, 0, 'voice acceptance avoids duplicate toast fallback');
  const receipt = h.log.fragileLost[0];
  assert.equal(receipt.totalQty, 2, 'receipt totals the lost fragile units');
  assert.equal(receipt.glyph.token, 'fragile', 'receipt carries the fragile glyph token');
  assert.equal(h.state.fragileCargo.receipts.length, 1, 'state keeps a bounded fragile-loss receipt');
  assert.deepEqual(h.state.fragileCargo.readout.map((s) => s.commodityId), ['cmdty_crystal_lumin', 'cmdty_gem_emerald'],
    'post-loss readout remains available for cargo UI consumers');
  ok('hard physics impact deterministically cracks fragile cargo only');
}

function testLowImpactAndNonPlayerSafety() {
  const h = makeHarness();
  const before = JSON.stringify(h.state.player.cargo.items);
  assert.equal(fragileImpactLossFraction({ playerDeltaV: FRAGILE_CARGO_HARD_DELTA_V - 0.01 }), 0,
    'below-threshold impacts have no loss fraction');
  h.bus.emit('physics:impact', {
    aId: h.state.playerId,
    bId: 'station_soft_bump',
    playerInvolved: true,
    playerDeltaV: 4,
    dp: 400,
  });
  h.bus.emit('physics:impact', {
    aId: 'npc_1',
    bId: 'ast_test',
    playerInvolved: false,
    playerDeltaV: 80,
    dp: 8000,
  });
  assert.equal(JSON.stringify(h.state.player.cargo.items), before,
    'soft bumps and non-player impacts do not mutate the player hold');
  assert.equal(h.log.fragileLost.length, 0, 'no receipt is emitted for ignored impacts');

  const direct = applyFragileCargoImpact(h.state, { playerInvolved: true, playerDeltaV: 42, dp: 4200 }, { cooldown: false });
  assert.ok(direct, 'direct helper remains testable without a browser/render path');
  const repeat = applyFragileCargoImpact(h.state, { playerInvolved: true, playerDeltaV: 42, dp: 4200 }, { bus: h.bus });
  assert.equal(repeat, null, 'cooldown prevents repeated same-moment collision spam');
  ok('low-impact, non-player, and repeat-collision safety gates hold');
}

function testRuntimeScope() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:fragile-cargo'], 'node scripts/check-fragile-cargo.mjs',
    'package exposes check:fragile-cargo');

  const registrySrc = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  const physicsSrc = readFileSync(new URL('../src/core/physics.js', import.meta.url), 'utf8');
  const fragileSrc = readFileSync(new URL('../src/systems/fragileCargo.js', import.meta.url), 'utf8');
  assert.match(registrySrc, /import \{ fragileCargo \} from '\.\.\/systems\/fragileCargo\.js';/,
    'registry imports fragileCargo');
  assert.match(registrySrc, /fieldDepletion, cargo, fragileCargo, economy/,
    'fragileCargo is registered after cargo and before economy');
  assert.match(physicsSrc, /bus\.emit\('physics:impact'/,
    'live physics emits the hard-impact seam');
  assert.match(fragileSrc, /import \{ removeCargo \} from '\.\/cargo\.js';/,
    'fragileCargo uses the cargo owner helper for mutation');
  assert.doesNotMatch(fragileSrc, /Math\.random|Date\.now/,
    'fragileCargo does not use unseeded RNG or wall-clock time');
  ok('runtime wiring and determinism contracts are pinned');
}
