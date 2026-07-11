// ECON-P2 — freight embodiment + conservation.
// Pure kernel + traffic/sectorSim adapter invariants. No Math.random / wall-clock in path.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FREIGHT_SCHEMA_ID,
  FREIGHT_CAUSE,
  FREIGHT_MARKET_KEYS_FALLBACK,
  buildCargoManifest,
  buildArrivalIntent,
  buildLossIntent,
  buildFreightNewsPayload,
  pressureShareRecipe,
  abstractBaselineVolume,
  estimateLiveVolume,
  liveVolumeForSector,
  scaleVolume,
  filterNewFreightIntents,
  mergeAppliedFreightIds,
  isPlainSerializable,
  stableSerialize,
  freightDigest,
  marketKeysFrom,
} from '../src/economy/freightCausality.js';
import { traffic } from '../src/systems/traffic.js';
import { sectorSim } from '../src/systems/sectorSim.js';
import { normalizeKind, HEADLINE_TEMPLATES, fillTemplate } from '../src/data/newsTemplates.js';
import { hash32 } from '../src/core/rng.js';

// ── guards ──────────────────────────────────────────────────────────────────────────────────

function guarded(fn) {
  const r = Math.random;
  const n = Date.now;
  Math.random = () => { throw new Error('Math.random forbidden in freight causality path'); };
  Date.now = () => { throw new Error('Date.now forbidden in freight causality path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

const MARKET = Object.freeze({
  cmdty_ore_iron: { stock: 100 },
  cmdty_fuel_cells: { stock: 80 },
  cmdty_food: { stock: 60 },
  cmdty_scrap_metal: { stock: 40 },
});

// ── pure: stable manifest ───────────────────────────────────────────────────────────────────

test('stable manifest: same seed+key+role ⇒ identical lines', () => {
  guarded(() => {
    const a = buildCargoManifest({
      seed: 42, freighterKey: 'wr_convoy_abc', role: 'hauler', market: MARKET,
    });
    const b = buildCargoManifest({
      seed: 42, freighterKey: 'wr_convoy_abc', role: 'hauler', market: MARKET,
    });
    assert.equal(a.manifestId, b.manifestId);
    assert.deepEqual(a.lines, b.lines);
    assert.equal(a.totalQty, b.totalQty);
    assert.equal(a.schemaId, FREIGHT_SCHEMA_ID);
    assert.ok(a.totalQty > 0, 'hauler carries cargo');
    for (const line of a.lines) {
      assert.ok(Object.prototype.hasOwnProperty.call(MARKET, line.commodityId)
        || FREIGHT_MARKET_KEYS_FALLBACK.includes(line.commodityId),
      'manifest keys come from market');
      assert.ok(line.qty > 0);
    }
  });
});

test('stable manifest: different freighter keys diverge', () => {
  guarded(() => {
    const a = buildCargoManifest({ seed: 7, freighterKey: 'a', role: 'hauler', market: MARKET });
    const b = buildCargoManifest({ seed: 7, freighterKey: 'b', role: 'hauler', market: MARKET });
    assert.notEqual(a.manifestId, b.manifestId);
  });
});

test('non-trading roles get empty manifests', () => {
  guarded(() => {
    const m = buildCargoManifest({ seed: 1, freighterKey: 'p1', role: 'patrol', market: MARKET });
    assert.equal(m.totalQty, 0);
    assert.deepEqual(m.lines, []);
  });
});

test('marketKeysFrom sorts and falls back', () => {
  assert.deepEqual(marketKeysFrom({ z: 1, a: 1 }), ['a', 'z']);
  assert.deepEqual(marketKeysFrom(null), FREIGHT_MARKET_KEYS_FALLBACK.slice().sort((a, b) => a.localeCompare(b)));
});

// ── pressure-share: no double pressure ──────────────────────────────────────────────────────

test('pressure-share: live + abstract never exceeds baseline', () => {
  guarded(() => {
    const cases = [
      { baselineVolume: 100, liveVolume: 0 },
      { baselineVolume: 100, liveVolume: 40 },
      { baselineVolume: 100, liveVolume: 100 },
      { baselineVolume: 100, liveVolume: 250 },
      { baselineVolume: 0, liveVolume: 50 },
      { baselineVolume: 72, liveVolume: 18 },
    ];
    for (const c of cases) {
      const r = pressureShareRecipe(c);
      assert.ok(r.liveShare + r.abstractShare <= r.baselineVolume + 1e-9,
        `budget exceeded for ${JSON.stringify(c)} → ${JSON.stringify(r)}`);
      assert.equal(r.totalVolume, r.liveShare + r.abstractShare);
      assert.ok(r.withinBudget);
      assert.ok(r.liveScale >= 0 && r.liveScale <= 1);
      assert.ok(r.abstractScale >= 0 && r.abstractScale <= 1);
      if (c.liveVolume === 0 && c.baselineVolume > 0) {
        assert.equal(r.abstractShare, r.baselineVolume);
        assert.equal(r.liveShare, 0);
      }
      if (c.liveVolume >= c.baselineVolume && c.baselineVolume > 0) {
        assert.equal(r.abstractShare, 0);
        assert.equal(r.liveShare, r.baselineVolume);
      }
    }
  });
});

test('abstractBaselineVolume matches pre-P2 share sum', () => {
  const lanePressure = 0.4;
  const days = 0.25;
  const goodsCount = 3;
  const total = Math.round(Math.abs(lanePressure) * 72 * days);
  const share = Math.max(1, Math.round(total / goodsCount));
  assert.equal(abstractBaselineVolume({ lanePressure, days, goodsCount }), share * goodsCount);
});

test('scaleVolume respects abstractScale', () => {
  assert.equal(scaleVolume(10, 0.5), 5);
  assert.equal(scaleVolume(-10, 0.5), -5);
  assert.equal(scaleVolume(10, 0), 0);
  assert.equal(scaleVolume(0, 1), 0);
});

// ── arrival / loss intents + idempotency ────────────────────────────────────────────────────

test('arrival intent idempotent by intentId ledger', () => {
  guarded(() => {
    const manifest = buildCargoManifest({
      seed: 11, freighterKey: 'ship_1', role: 'hauler', market: MARKET,
    });
    const intent = buildArrivalIntent({
      seed: 11, freighterKey: 'ship_1', freighterId: 9,
      stationId: 'station_helios', sectorId: 'sector_helios_prime',
      dockSeq: 0, manifest, liveScale: 1,
    });
    assert.equal(intent.cause, FREIGHT_CAUSE.ARRIVAL);
    assert.ok(intent.trades.length > 0);
    assert.ok(isPlainSerializable(intent));

    let applied = [];
    const fresh1 = filterNewFreightIntents([intent], applied);
    assert.equal(fresh1.length, 1);
    applied = mergeAppliedFreightIds(applied, fresh1);
    const fresh2 = filterNewFreightIntents([intent], applied);
    assert.equal(fresh2.length, 0, 'second apply is a no-op');
  });
});

test('loss intent idempotent + named news cause', () => {
  guarded(() => {
    const manifest = buildCargoManifest({
      seed: 3, freighterKey: 'ship_x', role: 'courier', market: MARKET,
    });
    const intent = buildLossIntent({
      seed: 3, freighterKey: 'ship_x', freighterId: 4,
      stationId: 'station_a', sectorId: 'sector_a',
      manifest, killerId: 1, seq: 100,
    });
    assert.equal(intent.cause, FREIGHT_CAUSE.LOSS);
    assert.ok(intent.pressures.length > 0);
    for (const pr of intent.pressures) {
      assert.ok(pr.vol < 0, 'loss drains stock (scarcity)');
      assert.equal(pr.cause, FREIGHT_CAUSE.LOSS);
    }
    assert.equal(intent.news.kind, 'freight_loss');
    assert.equal(intent.news.cause, FREIGHT_CAUSE.LOSS);
    assert.ok(isPlainSerializable(intent));

    let applied = mergeAppliedFreightIds([], [intent]);
    assert.equal(filterNewFreightIntents([intent], applied).length, 0);
  });
});

test('news templates cover freight kinds', () => {
  assert.equal(normalizeKind('freight_loss'), 'freight_loss');
  assert.equal(normalizeKind('freight_arrival'), 'freight_arrival');
  assert.ok(HEADLINE_TEMPLATES.freight_loss.length >= 3);
  assert.ok(HEADLINE_TEMPLATES.freight_arrival.length >= 3);
  const line = fillTemplate(HEADLINE_TEMPLATES.freight_loss[0], {
    station: 'Helios Dock', noun: 'fuel cells', name: 'Fuel Cells',
  });
  assert.ok(line.includes('Helios'));
  const news = buildFreightNewsPayload({
    kind: 'freight_loss', stationId: 's1', commodityId: 'cmdty_fuel_cells',
  });
  assert.equal(news.kind, 'freight_loss');
  assert.ok(isPlainSerializable(news));
});

// ── serializable + no Math.random ───────────────────────────────────────────────────────────

test('manifests and intents are plain-serializable + digest stable', () => {
  guarded(() => {
    const m = buildCargoManifest({ seed: 99, freighterKey: 'k', role: 'hauler', market: MARKET });
    const a = buildArrivalIntent({
      seed: 99, freighterKey: 'k', stationId: 'st', dockSeq: 2, manifest: m,
    });
    const l = buildLossIntent({
      seed: 99, freighterKey: 'k', stationId: 'st', seq: 5, manifest: m,
    });
    assert.ok(isPlainSerializable(m));
    assert.ok(isPlainSerializable(a));
    assert.ok(isPlainSerializable(l));
    // round-trip JSON
    assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
    const d1 = freightDigest([a, l, m]);
    const d2 = freightDigest([l, m, a]); // order-independent via sort
    assert.equal(d1, d2);
    assert.equal(typeof stableSerialize(m), 'string');
  });
});

test('no Math.random / Date.now in pure path', () => {
  guarded(() => {
    buildCargoManifest({ seed: 1, freighterKey: 'z', role: 'miner', marketKeys: FREIGHT_MARKET_KEYS_FALLBACK.slice() });
    pressureShareRecipe({ baselineVolume: 50, liveVolume: 20 });
    estimateLiveVolume([{ totalQty: 10 }, { manifest: { totalQty: 5 } }]);
  });
});

// ── traffic adapter: no wallet mutation, kill/arrival idempotency ───────────────────────────

function makeTrafficCtx(seed = 42) {
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, team: 1,
    pos: { x: 0, z: 0 }, rot: 0, data: {},
  };
  const station = {
    id: 10, type: 'station', alive: true, team: 0,
    pos: { x: 200, z: 0 },
    data: { stationId: 'station_test_dock' },
  };
  const freighter = {
    id: 20, type: 'ship', alive: true, team: 2, isPlayer: false,
    pos: { x: 210, z: 0 }, rot: 0,
    homeSectorId: 'sector_test',
    data: {
      trafficRole: 'hauler',
      trafficLabel: 'Cargo Hauler',
      worldRecordId: 'wr_test_hauler_1',
      homeSectorId: 'sector_test',
      sectorId: 'sector_test',
      durable: true,
    },
  };
  const entities = new Map([
    [player.id, player],
    [station.id, station],
    [freighter.id, freighter],
  ]);
  const emitLog = [];
  const bus = {
    emitLog,
    on() {},
    off() {},
    emit(evt, payload) { emitLog.push({ evt, payload }); },
  };
  const state = {
    mode: 'flight',
    simTime: 100,
    tick: 500,
    playerId: 1,
    meta: { seed },
    world: { currentSectorId: 'sector_test', sectors: {} },
    entities,
    entityList: [player, station, freighter],
    player: {
      credits: 99999,
      cargo: { items: { cmdty_food: 3 }, usedVolume: 3, usedMass: 2, capVolume: 200, capMass: 200 },
    },
    economy: {
      markets: {
        station_test_dock: {
          cmdty_ore_iron: { stock: 100, mid: 30 },
          cmdty_fuel_cells: { stock: 50, mid: 90 },
          cmdty_food: { stock: 70, mid: 40 },
        },
      },
    },
    traffic: {
      freighters: [],
      appliedArrivalIds: [],
      appliedLossIds: [],
      rngSeed: hash32(seed, 'traffic', 'boot'),
    },
    factions: {},
  };
  // snapshot for wallet / cargo mutation checks
  const walletSnap = {
    credits: state.player.credits,
    cargo: JSON.parse(JSON.stringify(state.player.cargo)),
    heat: state.player.heat,
    rep: JSON.parse(JSON.stringify(state.factions)),
  };
  return { state, bus, emitLog, freighter, station, player, walletSnap, helpers: {} };
}

function bootTraffic(ctx) {
  traffic.state = ctx.state;
  traffic.bus = ctx.bus;
  traffic.helpers = ctx.helpers;
  traffic._active = [];
  traffic._ensureState();
  return traffic;
}

test('traffic arrival: emits owner-safe trades, no wallet/cargo mutation, idempotent', () => {
  guarded(() => {
    const ctx = makeTrafficCtx(42);
    const sys = bootTraffic(ctx);
    const manifest = buildCargoManifest({
      seed: 42,
      freighterKey: 'wr_test_hauler_1',
      role: 'hauler',
      market: ctx.state.economy.markets.station_test_dock,
    });
    ctx.freighter.data.cargoManifest = manifest;
    const rec = {
      id: ctx.freighter.id,
      role: 'hauler',
      targetId: ctx.station.id,
      waitT: 0,
      nextTradeT: 0,
      dockSeq: 0,
      manifest,
    };
    ctx.state.traffic.freighters.push(rec);

    sys._emitArrival(ctx.freighter, rec, ctx.station);
    const trades1 = ctx.emitLog.filter((e) => e.evt === 'aiTrader:requestTrade');
    const arrivals1 = ctx.emitLog.filter((e) => e.evt === 'freight:arrival');
    assert.ok(trades1.length >= 1, 'emits stock-pressure trades');
    assert.equal(arrivals1.length, 1);
    assert.equal(arrivals1[0].payload.cause, FREIGHT_CAUSE.ARRIVAL);
    for (const t of trades1) {
      assert.equal(t.payload.cause, FREIGHT_CAUSE.ARRIVAL);
      assert.equal(t.payload.side, 'sell');
      assert.ok(t.payload.qty > 0);
    }

    // wallet / cargo / rep / heat untouched (traffic never writes owners)
    assert.equal(ctx.state.player.credits, ctx.walletSnap.credits);
    assert.deepEqual(ctx.state.player.cargo, ctx.walletSnap.cargo);
    assert.deepEqual(ctx.state.factions, ctx.walletSnap.rep);

    // idempotent: replaying same dockSeq intent is a no-op (dockSeq already advanced;
    // force same intent id by resetting dockSeq + ledger check via applied ids)
    const before = ctx.emitLog.length;
    // re-fire with old dockSeq=0 intent still in appliedArrivalIds
    rec.dockSeq = 0;
    sys._emitArrival(ctx.freighter, rec, ctx.station);
    const tradesAfter = ctx.emitLog.slice(before).filter((e) => e.evt === 'aiTrader:requestTrade');
    // dockSeq 0 already applied → no new trades for that intent
    assert.equal(tradesAfter.length, 0, 'arrival intent idempotent');
  });
});

test('traffic kill: loss intent once, no wallet mutation', () => {
  guarded(() => {
    const ctx = makeTrafficCtx(7);
    const sys = bootTraffic(ctx);
    const manifest = buildCargoManifest({
      seed: 7, freighterKey: 'wr_test_hauler_1', role: 'hauler',
      market: ctx.state.economy.markets.station_test_dock,
    });
    ctx.freighter.data.cargoManifest = manifest;
    ctx.state.traffic.freighters.push({
      id: ctx.freighter.id, role: 'hauler', targetId: ctx.station.id,
      waitT: 0, nextTradeT: 0, dockSeq: 1, manifest,
    });
    sys._active = [ctx.freighter.id];

    sys._onEntityKilled({
      id: ctx.freighter.id,
      killerId: ctx.player.id,
      type: 'ship',
      sectorId: 'sector_test',
    });
    const losses = ctx.emitLog.filter((e) => e.evt === 'freight:loss');
    const pressures = ctx.emitLog.filter((e) => e.evt === 'economy:applyTradePressure');
    const headlines = ctx.emitLog.filter((e) => e.evt === 'news:headline');
    assert.equal(losses.length, 1);
    assert.ok(pressures.length >= 1);
    assert.equal(headlines.length, 1);
    assert.equal(headlines[0].payload.kind, 'freight_loss');
    assert.equal(ctx.state.player.credits, ctx.walletSnap.credits);
    assert.deepEqual(ctx.state.player.cargo, ctx.walletSnap.cargo);

    // second kill event — idempotent (freighter already removed + intent applied)
    const before = ctx.emitLog.length;
    // re-add tracking to force path; ledger still blocks
    ctx.state.traffic.freighters.push({
      id: ctx.freighter.id, role: 'hauler', targetId: ctx.station.id,
      waitT: 0, nextTradeT: 0, dockSeq: 1, manifest,
    });
    sys._onEntityKilled({
      id: ctx.freighter.id,
      killerId: ctx.player.id,
      type: 'ship',
      sectorId: 'sector_test',
    });
    const losses2 = ctx.emitLog.slice(before).filter((e) => e.evt === 'freight:loss');
    assert.equal(losses2.length, 0, 'loss intent idempotent');
  });
});

// ── sectorSim pressure-share wiring ─────────────────────────────────────────────────────────

test('sectorSim abstract pressure scales with live freighters (no double pressure)', () => {
  // Math.random banned; Date.now may still exist in sectorSim offline meta (pre-P2, not our path).
  const r = Math.random;
  Math.random = () => { throw new Error('Math.random forbidden in freight causality path'); };
  try {
    const emitLog = [];
    const bus = { emit(evt, payload) { emitLog.push({ evt, payload }); }, on() {}, off() {} };
    const seed = 42;
    const freighterManifest = buildCargoManifest({
      seed, freighterKey: 'live_1', role: 'hauler', market: MARKET,
    });
    // Large live volume to force abstractScale → 0 on the current sector.
    freighterManifest.totalQty = 10_000;
    freighterManifest.lines = [{ commodityId: 'cmdty_ore_iron', qty: 10_000 }];

    const state = {
      meta: { seed },
      simTime: 1000,
      world: { currentSectorId: 'sector_helios_prime', sectors: {} },
      entities: new Map(),
      entityList: [],
      traffic: {
        freighters: [{ id: 99, role: 'hauler', manifest: freighterManifest }],
        appliedArrivalIds: [],
        appliedLossIds: [],
      },
      player: { credits: 1000, cargo: { items: {} } },
      economy: { markets: {} },
    };

    sectorSim.state = state;
    sectorSim.bus = bus;
    sectorSim.helpers = {};
    sectorSim.registry = { get() { return null; } };
    sectorSim._graph = null;
    // Avoid newGame() wall-clock meta; seed state via _ensureState + field create only.
    sectorSim._ensureState();
    sectorSim._initRng && sectorSim._initRng();
    const field = sectorSim._ensureField();
    for (const id of Object.keys(field.nodes)) {
      field.nodes[id].pricePressure = 0.5;
      field.nodes[id].danger = 0.5;
    }
    const currentId = Object.keys(field.nodes).sort()[0];
    state.world.currentSectorId = currentId;
    state.traffic.freighters[0].manifest = freighterManifest;
    assert.ok(liveVolumeForSector(state, currentId) >= 10_000);

    emitLog.length = 0;
    sectorSim._emitEconomyPressure(0.25);

    const pressures = emitLog.filter((e) => e.evt === 'economy:applyTradePressure');
    const currentPressures = pressures.filter((e) => e.payload.sectorId === currentId);
    for (const p of currentPressures) {
      assert.ok(p.payload.pressureShare, 'pressureShare metadata present when live shares budget');
      assert.ok(
        p.payload.pressureShare.liveShare + p.payload.pressureShare.abstractShare
          <= p.payload.pressureShare.baselineVolume + 1e-9,
      );
    }
    // live >> baseline ⇒ abstractShare 0 ⇒ no current-sector abstract emits
    const anyPositive = currentPressures.some((p) => Math.abs(p.payload.vol) > 0);
    assert.equal(anyPositive, false, 'no abstract double-pressure when live covers baseline');

    // Offscreen sectors still receive abstract pressure (liveVolume 0 there).
    const otherPressures = pressures.filter((e) => e.payload.sectorId !== currentId);
    assert.ok(otherPressures.length > 0, 'offscreen abstract pressure still emits');

    assert.equal(state.player.credits, 1000);
  } finally {
    Math.random = r;
  }
});

test('liveVolumeForSector is zero offscreen', () => {
  const state = {
    world: { currentSectorId: 'sector_a' },
    traffic: {
      freighters: [{ id: 1, role: 'hauler', manifest: { totalQty: 50, lines: [] } }],
    },
    entities: new Map(),
  };
  assert.equal(liveVolumeForSector(state, 'sector_a'), 50);
  assert.equal(liveVolumeForSector(state, 'sector_b'), 0);
});
