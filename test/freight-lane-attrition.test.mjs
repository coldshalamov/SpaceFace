// WF-06 lane attrition — real freight outcomes (freight:loss / freight:cargoSpilled) become
// bounded sector-field impulses on the lane where the cargo died. The impulse then flows through
// the ordinary kernel: field node -> sectorSignalFor -> driver tag -> CAUSE_PHRASES prose.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { CAUSE_PHRASES } from '../src/data/causePhrases.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { sectorFieldDigest } from '../src/systems/dangerModel.js';
import { sectorSim, sectorSignalFor } from '../src/systems/sectorSim.js';

const SEED = 4242;

function makeCtx(seed = SEED, currentSectorId = 'sector_ceres_belt') {
  const state = createGameState(seed);
  state.meta.seed = seed;
  state.world.currentSectorId = currentSectorId;
  for (const s of SECTORS) {
    state.world.sectors[s.id] = { ...s, owner: s.factionId };
  }
  const bus = createBus();
  const registry = {
    get(name) {
      if (name === 'factions') return { addOffscreenTension() {}, contestedSectorFor() { return null; } };
      if (name === 'automation') return { offscreenRiskPass() { return 0; } };
      return null;
    },
  };
  return { state, bus, registry, helpers: {} };
}

function boot(ctx) {
  sectorSim.init(ctx);
  return sectorSim;
}

function lossPayload(overrides = {}) {
  return {
    intentId: 'fl_lane_attrition_001',
    kind: 'loss',
    cause: 'freight_loss',
    freighterKey: 'wr_test_hauler_1',
    freighterId: 'ent_hauler_1',
    stationId: 'station_ceres',
    sectorId: 'sector_ceres_belt',
    killerId: null,
    manifestId: 'fm_test_1',
    totalQty: 30,
    primaryCommodityId: 'cmdty_ore_iron',
    pressures: [
      { stationId: 'station_ceres', good: 'cmdty_ore_iron', commodityId: 'cmdty_ore_iron', vol: -30, sectorId: 'sector_ceres_belt', source: 'freight_loss', cause: 'freight_loss' },
    ],
    source: 'traffic_live',
    ...overrides,
  };
}

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── event → impulse ────────────────────────────────────────────────────────────

test('freight:loss queues a bounded freight_loss impulse on the death sector', () => {
  const ctx = makeCtx();
  boot(ctx);
  ctx.bus.emit('freight:loss', lossPayload());

  const impulses = ctx.state.sectorSim.impulses;
  assert.equal(impulses.length, 1);
  const imp = impulses[0];
  assert.equal(imp.kind, 'freight_loss');
  assert.equal(imp.sectorId, 'sector_ceres_belt');
  // qty=30: 0.018 + 30*0.0012 = 0.054 price; 0.012 + 30*0.0003 = 0.021 danger.
  assert.ok(near(imp.pricePressure, 0.054), `pricePressure ${imp.pricePressure}`);
  assert.ok(near(imp.danger, 0.021), `danger ${imp.danger}`);
});

test('loss sector resolution: explicit sectorId wins, stationId maps, fallback is current sector', () => {
  const ctx = makeCtx();
  boot(ctx);

  // station-only loss resolves through STATION_TO_SECTOR.
  ctx.bus.emit('freight:loss', lossPayload({ sectorId: null, stationId: 'station_tethys', totalQty: 10 }));
  // no sector hints at all -> the live sector (the only place freight can physically die).
  ctx.bus.emit('freight:loss', lossPayload({ sectorId: null, stationId: null, totalQty: 10 }));
  // bogus sector is dropped entirely — no impulse, no crash.
  ctx.bus.emit('freight:loss', lossPayload({ sectorId: 'sector_nowhere', stationId: null }));

  const imps = ctx.state.sectorSim.impulses;
  assert.equal(imps.length, 2);
  assert.equal(imps[0].sectorId, 'sector_tethys_junction');
  assert.equal(imps[1].sectorId, 'sector_ceres_belt');
});

test('volatile freight dying marks the lane more dangerous', () => {
  const ctx = makeCtx();
  boot(ctx);
  // qty=40 non-volatile reference: danger = 0.012 + 0.012 = 0.024.
  ctx.bus.emit('freight:loss', lossPayload({ totalQty: 40, primaryCommodityId: 'cmdty_ore_iron' }));
  // same qty of explosive fuel cells: (0.024) * 1.6 = 0.0384 -> clamped to 0.028 cap.
  ctx.bus.emit('freight:loss', lossPayload({ totalQty: 40, primaryCommodityId: 'cmdty_fuel_cells' }));

  const [plain, volatile] = ctx.state.sectorSim.impulses;
  assert.ok(near(plain.danger, 0.024));
  assert.ok(near(volatile.danger, 0.028), `volatile danger ${volatile.danger}`);
  assert.ok(volatile.danger > plain.danger);
  // Volatility moves the danger axis only — lost fuel cells are not "more scarce" than lost ore.
  assert.ok(near(volatile.pricePressure, 0.06));
  assert.ok(near(plain.pricePressure, 0.06));
});

test('empty/law-manifest loss annotates lawful_kill violence, never scarcity', () => {
  const ctx = makeCtx();
  boot(ctx);
  ctx.bus.emit('freight:loss', lossPayload({ totalQty: 0, pressures: [], primaryCommodityId: null, source: 'traffic_law' }));
  const imp = ctx.state.sectorSim.impulses[0];
  assert.equal(imp.kind, 'lawful_kill');
  assert.ok(near(imp.danger, 0.02));
  assert.equal(imp.pricePressure, 0);
});

test('freight:cargoSpilled marks danger only — spilled pods may still be recovered', () => {
  const ctx = makeCtx();
  boot(ctx);
  ctx.bus.emit('freight:cargoSpilled', {
    carrierId: 'ent_hauler_9',
    entityId: 'ent_hauler_9',
    commodityId: 'cmdty_ore_copper',
    qty: 12,
    podCount: 1,
    podIds: ['pod_1'],
    cause: 'combat_fire',
  });
  const imp = ctx.state.sectorSim.impulses[0];
  assert.equal(imp.kind, 'freight_spill');
  assert.equal(imp.sectorId, 'sector_ceres_belt');
  // 0.007 + 12*0.0002 = 0.0094
  assert.ok(near(imp.danger, 0.0094), `spill danger ${imp.danger}`);
  assert.equal(imp.pricePressure, 0, 'a recoverable spill must not price scarcity');
});

// ── impulse → field → player-readable signal ──────────────────────────────────

test('loss impulse advances into the field: scarcity + danger + freight_attrition driver', () => {
  const ctx = makeCtx();
  boot(ctx);
  const before = sectorSignalFor(ctx.state, 'sector_ceres_belt');

  ctx.bus.emit('freight:loss', lossPayload({ totalQty: 40 }));
  sectorSim._advanceModel(0.25, 'test');

  const node = ctx.state.sectorSim.field.nodes.sector_ceres_belt;
  assert.ok(node.pricePressure > before.pricePressure + 0.04, 'lost shipment raises lane scarcity');
  assert.ok(node.danger > before.danger, 'a dead hull raises lane danger');

  const signal = sectorSignalFor(ctx.state, 'sector_ceres_belt');
  assert.equal(signal.driver.pricePressure, 'freight_attrition');
  assert.equal(signal.driver.danger, 'freight_attrition');
  // Scarcity means the sector demands inflow — the published flow figure turns negative.
  assert.ok(signal.marketFlowUnitsPerDay < 0);

  // The cause phrase bank resolves for every axis the kernel may tag.
  assert.equal(typeof CAUSE_PHRASES.pricePressure.freight_attrition, 'string');
  assert.ok(CAUSE_PHRASES.pricePressure.freight_attrition.length > 12);
  assert.equal(typeof CAUSE_PHRASES.danger.freight_attrition, 'string');
});

test('sustained losses accumulate past route_scarcity while the field owns persistence', () => {
  const ctx = makeCtx();
  boot(ctx);

  // A day of predation: five manifested haulers die on the lane (0.06 cap each => +0.30 gross).
  for (let i = 0; i < 5; i++) {
    ctx.bus.emit('freight:loss', lossPayload({ intentId: `fl_attr_${i}`, freighterKey: `wr_h_${i}`, totalQty: 40 }));
  }
  sectorSim._advanceModel(0.5, 'test');
  let node = ctx.state.sectorSim.field.nodes.sector_ceres_belt;
  assert.ok(node.pricePressure > 0.12, `stacked attrition should read scarce, got ${node.pricePressure}`);
  assert.equal(node.driver.pricePressure, 'freight_attrition');

  // With no new losses the annotation expires but the scarcity stays in the field — the state,
  // not the event, is what persists and decays under the kernel.
  sectorSim._advanceModel(0.5, 'test');
  node = ctx.state.sectorSim.field.nodes.sector_ceres_belt;
  assert.ok(node.pricePressure > 0.12, `scarcity persists after the events stop, got ${node.pricePressure}`);
  assert.notEqual(node.driver.pricePressure, 'freight_attrition');
});

// ── honesty: determinism, persistence, no shadow writes ───────────────────────

test('fixed seed 4242: identical loss streams produce identical field digests', () => {
  const run = () => {
    // sectorSim is a module singleton: boot, drive the event stream, and advance while it is
    // the live ctx — handlers read this.state, so interleaving two boots would cross-write.
    const ctx = makeCtx(4242);
    boot(ctx);
    ctx.bus.emit('freight:loss', lossPayload({ intentId: 'fl_d1', totalQty: 24 }));
    ctx.bus.emit('freight:cargoSpilled', { commodityId: 'cmdty_volatiles', qty: 6 });
    ctx.bus.emit('freight:loss', lossPayload({ intentId: 'fl_d2', totalQty: 55, primaryCommodityId: 'cmdty_fuel_cells' }));
    ctx.bus.emit('freight:cargoSpilled', { commodityId: 'cmdty_ore_iron', qty: 3 });
    ctx.bus.emit('freight:loss', lossPayload({ intentId: 'fl_d3', totalQty: 8, sectorId: 'sector_tethys_junction' }));
    sectorSim._advanceModel(1.25, 'test');
    return sectorFieldDigest(ctx.state.sectorSim.field);
  };
  assert.equal(run(), run());
});

test('queued lane-attrition impulses survive serialize/deserialize', () => {
  const ctx = makeCtx();
  boot(ctx);
  ctx.bus.emit('freight:loss', lossPayload({ totalQty: 30 }));
  const blob = sectorSim.serialize();

  const ctx2 = makeCtx();
  boot(ctx2);
  sectorSim.deserialize(blob);
  const restored = ctx2.state.sectorSim.impulses;
  assert.equal(restored.length, 1);
  assert.equal(restored[0].kind, 'freight_loss');
  assert.equal(restored[0].sectorId, 'sector_ceres_belt');

  const before = ctx2.state.sectorSim.field.nodes.sector_ceres_belt.pricePressure;
  sectorSim._advanceModel(0.25, 'test');
  const node = ctx2.state.sectorSim.field.nodes.sector_ceres_belt;
  assert.ok(node.pricePressure > before + 0.03,
    `restored impulse still lands after load (${before} -> ${node.pricePressure})`);
});

test('single writer: the freight-attrition path never touches credits, cargo, or factions', () => {
  const ctx = makeCtx();
  boot(ctx);
  const credits = ctx.state.player.credits;
  const factions = JSON.stringify(ctx.state.factions);

  ctx.bus.emit('freight:loss', lossPayload({ totalQty: 40 }));
  ctx.bus.emit('freight:cargoSpilled', { commodityId: 'cmdty_munitions', qty: 10 });
  sectorSim._advanceModel(1, 'test');

  assert.equal(ctx.state.player.credits, credits);
  assert.equal(JSON.stringify(ctx.state.factions), factions);
});
