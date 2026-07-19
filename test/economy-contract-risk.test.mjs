// ECON-P4 — field contracts + smuggling risk adapters.
//
// Covers:
//   calm silent · threshold deterministic/deduped · percent clamp · illicit remainder ·
//   no double fine · no Math.random
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  selectEconContract,
  isCalmField,
  thresholdGate,
  ECON_CONTRACT_THRESHOLDS,
} from '../src/data/economyContractTemplates.js';
import {
  economyContracts,
  stableFieldOfferId,
  fieldContractEpoch,
  isStationEpochEvaluated,
  markStationEpochEvaluated,
  ensureFieldContractState,
} from '../src/systems/economyContracts.js';
import {
  BASE_SCAN,
  SCAN_LO,
  SCAN_HI,
  FINE_MULT,
  BRIBE_FRAC,
  HOT_SCAN_BONUS,
  clampScanChance,
  scanChance,
  scanChanceInputs,
  hiddenHoldCapacity,
  remainingIllicit,
  estimatedFine,
  estimatedBribe,
  hotUntilActive,
  hotScanModifier,
  smugglingPreflightCopy,
  buildProjectedMissionStacks,
  buildIllicitStacksFromCargo,
} from '../src/economy/customsRisk.js';
import { missionPreflight, missionSmugglingRisk } from '../src/ui/missionPreflight.js';
import { SECTORS } from '../src/data/sectors.js';

// Self-contained station fixtures — independent of live catalog order (kills the
// HOME.stations[0] → stations[1] coverage-erasure mutant from REVIEW-CORRIDOR P1-4).
const HELIOS_STATION = Object.freeze({
  id: 'station_helios',
  name: 'Helios Station',
  factionId: 'faction_scn',
  size: 'M',
  type: 'trade_hub',
});
const NON_HELIOS_STATION = Object.freeze({
  id: 'station_ceres',
  name: 'Ceres Refinery',
  factionId: 'faction_scn',
  size: 'M',
  type: 'refinery',
});
// Live catalog still used for smuggling/preflight tests that need a real sector context.
const HOME = SECTORS.find((s) => (s.stations || []).length > 0);
assert.ok(HOME, 'catalog has a sector with stations');
const STATION = HOME.stations[0];

function fieldNode(overrides = {}) {
  return {
    danger: 0.2,
    pricePressure: 0,
    influence: { faction_scn: 0.4 },
    dominantFactionId: 'faction_scn',
    dominantInfluence: 0.4,
    contestMargin: 0.1,
    trend: { danger: 0, pricePressure: 0, influence: 0 },
    driver: {
      danger: 'structural_baseline',
      pricePressure: 'market_balance',
      influence: 'territorial_anchor',
    },
    ...overrides,
    trend: { danger: 0, pricePressure: 0, influence: 0, ...(overrides.trend || {}) },
    driver: {
      danger: 'structural_baseline',
      pricePressure: 'market_balance',
      influence: 'territorial_anchor',
      ...(overrides.driver || {}),
    },
  };
}

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const l = handlers.get(evt) || [];
      const i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
    },
    emit(evt, payload) {
      emitLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function makeState(node, { seed = 7, simTime = 100, sectorId = null, station = null } = {}) {
  const sector = sectorId || HOME.id;
  const st = station || STATION;
  return {
    mode: 'flight',
    simTime,
    playerId: 1,
    meta: { seed },
    world: { currentSectorId: sector, sectors: {} },
    entities: new Map([[1, { id: 1, type: 'ship', hull: 100, hullMax: 100 }]]),
    player: {
      credits: 50000,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 50, capMass: 500 },
      efficiencyMods: {},
      stats: {},
    },
    factions: { [st.factionId || HOME.factionId || 'faction_scn']: { rep: 50 } },
    nav: {},
    ui: {},
    fuel: { current: 100, max: 100 },
    missions: { active: [], config: { refreshSec: 600, maxActive: 8 } },
    sectorSim: {
      field: { version: 1, epochDays: 2, nodes: { [sector]: node } },
      sectors: {},
      meta: {},
    },
  };
}

function guarded(fn) {
  const r = Math.random;
  const n = Date.now;
  Math.random = () => { throw new Error('Math.random in economy-contract-risk path'); };
  Date.now = () => { throw new Error('Date.now in economy-contract-risk path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

// ── calm silent ──────────────────────────────────────────────────────────────────────────────

test('calm field is silent: no template, no offer, no emit', () => {
  guarded(() => {
    const calm = fieldNode();
    assert.equal(selectEconContract(calm), null);
    assert.equal(isCalmField(calm), true);

    // Unconditional Helios first-trade path (self-contained fixture, not catalog order).
    {
      const bus = makeBus();
      const state = makeState(calm, {
        sectorId: 'sector_helios_prime',
        station: HELIOS_STATION,
      });
      const sys = { ...economyContracts };
      sys.init({ state, bus, helpers: { voice: { say() { return true; } } } });
      bus.emit('dock:docked', { stationId: HELIOS_STATION.id });
      const fieldOffers = bus.emitLog.filter((e) => e.evt === 'mission:offered'
        && e.payload && e.payload.source === 'economyContract');
      assert.equal(fieldOffers.length, 0, 'calm field emits no field contract');
      const firstTrade = bus.emitLog.filter((e) => e.evt === 'mission:offered'
        && e.payload && e.payload.source === 'firstTradeContract');
      assert.equal(firstTrade.length, 1, 'Helios posts the authored first-trade teach offer once');
      assert.equal(sys.hasEvaluated(HELIOS_STATION.id), true);
    }

    // Unconditional non-Helios: no first-trade offer.
    {
      const bus = makeBus();
      const state = makeState(calm, {
        sectorId: 'sector_ceres_belt',
        station: NON_HELIOS_STATION,
      });
      const sys = { ...economyContracts };
      sys.init({ state, bus, helpers: { voice: { say() { return true; } } } });
      bus.emit('dock:docked', { stationId: NON_HELIOS_STATION.id });
      const fieldOffers = bus.emitLog.filter((e) => e.evt === 'mission:offered'
        && e.payload && e.payload.source === 'economyContract');
      assert.equal(fieldOffers.length, 0, 'calm field emits no field contract');
      const firstTrade = bus.emitLog.filter((e) => e.evt === 'mission:offered'
        && e.payload && e.payload.source === 'firstTradeContract');
      assert.equal(firstTrade.length, 0, 'non-Helios calm dock never posts first-trade');
      assert.equal(sys.hasEvaluated(NON_HELIOS_STATION.id), true);
    }
  });
});

// ── threshold deterministic + station-epoch dedupe ───────────────────────────────────────────

test('threshold gates are deterministic and field offers dedupe per station+epoch', () => {
  guarded(() => {
    const scarce = fieldNode({
      pricePressure: 0.32,
      driver: { pricePressure: 'route_scarcity' },
    });
    assert.equal(thresholdGate(scarce, 'scarcity'), true);
    assert.equal(thresholdGate(fieldNode({
      pricePressure: 0.20,
      driver: { pricePressure: 'route_scarcity' },
    }), 'scarcity'), false, 'below scarcityPressure is silent');
    assert.equal(ECON_CONTRACT_THRESHOLDS.scarcityPressure, 0.25);

    const a = selectEconContract(scarce);
    const b = selectEconContract(scarce);
    assert.ok(a && a.template.key === 'scarcity_fuel_run');
    assert.equal(a.template.key, b.template.key);
    assert.equal(a.causeTag, b.causeTag);
    assert.equal(a.strength, b.strength);

    // Helios: field offer + first-trade once (unconditional, self-contained fixture).
    {
      const bus = makeBus();
      const state = makeState(scarce, {
        seed: 11,
        simTime: 100,
        sectorId: 'sector_helios_prime',
        station: HELIOS_STATION,
      });
      const sys = { ...economyContracts };
      sys.init({ state, bus, helpers: { voice: { say() { return true; } } } });
      bus.emit('dock:docked', { stationId: HELIOS_STATION.id });
      bus.emit('dock:docked', { stationId: HELIOS_STATION.id }); // same epoch
      const fieldOffers = bus.emitLog.filter((e) => e.evt === 'mission:offered'
        && e.payload && e.payload.source === 'economyContract');
      assert.equal(fieldOffers.length, 1, 'one field offer per station-epoch');
      const offer = fieldOffers[0].payload;
      const epoch = fieldContractEpoch(100, 600);
      assert.equal(offer.id, stableFieldOfferId(HELIOS_STATION.id, epoch));
      assert.equal(offer.source, 'economyContract');
      assert.ok(offer.cause && offer.cause.tag === 'route_scarcity', 'cause-named');
      assert.match(offer.summary, /scarcity|scarce|premium|route/i);
      const firstTrade = bus.emitLog.filter((e) => e.evt === 'mission:offered'
        && e.payload && e.payload.source === 'firstTradeContract');
      assert.equal(firstTrade.length, 1, 'first-trade teach offer once per run at Helios');
      assert.equal(state.missions.active.length, 0);
      assert.equal(state.missions.boards, undefined);
    }

    // Non-Helios: field offer only, never first-trade.
    {
      const bus = makeBus();
      const state = makeState(scarce, {
        seed: 11,
        simTime: 100,
        sectorId: 'sector_ceres_belt',
        station: NON_HELIOS_STATION,
      });
      const sys = { ...economyContracts };
      sys.init({ state, bus, helpers: { voice: { say() { return true; } } } });
      bus.emit('dock:docked', { stationId: NON_HELIOS_STATION.id });
      bus.emit('dock:docked', { stationId: NON_HELIOS_STATION.id });
      const fieldOffers = bus.emitLog.filter((e) => e.evt === 'mission:offered'
        && e.payload && e.payload.source === 'economyContract');
      assert.equal(fieldOffers.length, 1, 'non-Helios still posts one field offer per epoch');
      assert.equal(fieldOffers[0].payload.id, stableFieldOfferId(NON_HELIOS_STATION.id, fieldContractEpoch(100, 600)));
      const firstTrade = bus.emitLog.filter((e) => e.evt === 'mission:offered'
        && e.payload && e.payload.source === 'firstTradeContract');
      assert.equal(firstTrade.length, 0, 'non-Helios never posts first-trade');
    }

    // Pure dedupe API
    const bag = ensureFieldContractState({ economyContracts: { evaluatedEpochByStation: {} } });
    assert.equal(isStationEpochEvaluated(bag, 'st_x', 3), false);
    markStationEpochEvaluated(bag, 'st_x', 3);
    assert.equal(isStationEpochEvaluated(bag, 'st_x', 3), true);
    assert.equal(isStationEpochEvaluated(bag, 'st_x', 4), false);
  });
});

// ── percent clamp ────────────────────────────────────────────────────────────────────────────

test('scan chance percent clamp stays in [SCAN_LO, SCAN_HI]', () => {
  guarded(() => {
    assert.equal(clampScanChance(-1), SCAN_LO);
    assert.equal(clampScanChance(0), SCAN_LO);
    assert.equal(clampScanChance(2), SCAN_HI);
    assert.equal(clampScanChance(NaN), SCAN_LO);

    const low = scanChanceInputs({ security: 0, cloak: 1, hot: false });
    assert.ok(low.chance >= SCAN_LO && low.chance <= SCAN_HI);
    assert.equal(low.chance, SCAN_LO, 'heavy cloak floors at SCAN_LO');

    // BASE_SCAN*(1+3) + hot = 0.25*4 + 0.15 = 1.15 → clamps to SCAN_HI (0.95)
    const high = scanChanceInputs({ security: 3, cloak: 0, hot: true });
    assert.equal(high.chance, SCAN_HI, 'high security + hot caps at SCAN_HI');
    assert.equal(high.hotBonus, HOT_SCAN_BONUS);
    assert.ok(high.raw > SCAN_HI, 'raw exceeds hi before clamp');

    const mid = scanChance({ security: 0.5, cloak: 0, hot: false });
    // BASE_SCAN * (1+0.5) = 0.375
    assert.ok(Math.abs(mid - BASE_SCAN * 1.5) < 1e-9);
  });
});

// ── illicit remainder (hidden hold capped) ───────────────────────────────────────────────────

test('hidden hold is capped; remaining illicit is deterministic remainder', () => {
  guarded(() => {
    assert.equal(hiddenHoldCapacity({ capVolume: 100, hiddenCargoPct: 0.2 }), 20);
    assert.equal(hiddenHoldCapacity({ capVolume: 100, hiddenCargoPct: 1.5 }), 100, 'pct clamp 1');
    assert.equal(hiddenHoldCapacity({ capVolume: 100, hiddenCargoPct: -0.5 }), 0, 'pct clamp 0');
    assert.equal(hiddenHoldCapacity({ capVolume: -10, hiddenCargoPct: 0.5 }), 0);

    // 4u narcotics volPerU 0.6 → 2.4u; hidden 2.0u → hide floor(2.0/0.6)=3 units, expose 1
    const rem = remainingIllicit({
      stacks: [
        { commodityId: 'cmdty_narcotics', qty: 4, basePrice: 220, legality: 'contraband', volPerU: 0.6 },
      ],
      hiddenCapacity: 2.0,
    });
    assert.equal(rem.hiddenStacks[0].qty, 3);
    assert.equal(rem.exposedStacks[0].qty, 1);
    assert.equal(rem.remainingQty, 1);
    assert.equal(rem.fullyCovered, false);

    const covered = remainingIllicit({
      stacks: [
        { commodityId: 'cmdty_narcotics', qty: 2, basePrice: 220, legality: 'contraband', volPerU: 0.6 },
      ],
      hiddenCapacity: 10,
    });
    assert.equal(covered.fullyCovered, true);
    assert.equal(covered.remainingQty, 0);
    assert.equal(covered.exposedStacks.length, 0);

    // Stable order across two commodities
    const multi = remainingIllicit({
      stacks: [
        { commodityId: 'cmdty_stolen_goods', qty: 5, basePrice: 150, legality: 'contraband', volPerU: 1 },
        { commodityId: 'cmdty_narcotics', qty: 2, basePrice: 220, legality: 'contraband', volPerU: 0.6 },
      ],
      hiddenCapacity: 1.2, // fully covers 2u narcotics (1.2 vol), exposes stolen goods
    });
    assert.equal(multi.hiddenStacks[0].commodityId, 'cmdty_narcotics');
    assert.equal(multi.exposedStacks[0].commodityId, 'cmdty_stolen_goods');
    assert.equal(multi.exposedStacks[0].qty, 5);
  });
});

// ── no double fine ───────────────────────────────────────────────────────────────────────────

test('estimated fine is projection-only and never doubles hidden cargo', () => {
  guarded(() => {
    const stacks = [
      { commodityId: 'cmdty_narcotics', qty: 4, basePrice: 220, legality: 'contraband', volPerU: 0.6 },
    ];
    // Full fine if fully exposed: 220*4*1.5 = 1320
    assert.equal(estimatedFine(stacks), 1320);
    assert.equal(FINE_MULT.contraband, 1.5);
    assert.equal(estimatedBribe(1320), Math.round(1320 * BRIBE_FRAC));

    const rem = remainingIllicit({ stacks, hiddenCapacity: 2.0 }); // exposes 1u
    const exposedFine = estimatedFine(rem.exposedStacks);
    const hiddenFine = estimatedFine(rem.hiddenStacks);
    assert.equal(exposedFine, 220 * 1 * 1.5, 'fine only on exposed remainder');
    assert.equal(hiddenFine, 220 * 3 * 1.5);
    // Sum of parts equals full — but preflight/authority must charge ONLY exposed.
    assert.equal(exposedFine + hiddenFine, 1320);
    // Critical: estimatedFine(exposed) !== full — no double-count of hidden units.
    assert.ok(exposedFine < 1320);

    const copy = smugglingPreflightCopy({
      security: 0.5,
      cloak: 0,
      hot: false,
      stacks,
      capVolume: 10,
      hiddenCargoPct: 0.2, // 2.0u hidden
    });
    assert.equal(copy.projectionOnly, true);
    assert.equal(copy.estFine, exposedFine);
    assert.equal(copy.estBribe, estimatedBribe(exposedFine));
    // Calling copy twice is identical (no accumulation / double fine).
    const copy2 = smugglingPreflightCopy({
      security: 0.5, cloak: 0, hot: false, stacks, capVolume: 10, hiddenCargoPct: 0.2,
    });
    assert.equal(copy2.estFine, copy.estFine);
  });
});

// ── hot-until modifier ───────────────────────────────────────────────────────────────────────

test('hot-until modifier raises scan chance by HOT_SCAN_BONUS while active', () => {
  guarded(() => {
    assert.equal(hotUntilActive(500, 100), true);
    assert.equal(hotUntilActive(100, 100), false);
    assert.equal(hotUntilActive(null, 100), false);
    assert.equal(hotUntilActive({ faction_scn: 400 }, 100, 'faction_scn'), true);
    assert.equal(hotUntilActive({ faction_scn: 50 }, 100, 'faction_scn'), false);
    assert.equal(hotScanModifier(500, 100), HOT_SCAN_BONUS);
    assert.equal(hotScanModifier(50, 100), 0);

    const cold = scanChance({ security: 0.4, cloak: 0, hot: false });
    const hot = scanChance({ security: 0.4, cloak: 0, hot: true });
    assert.ok(hot > cold);
    assert.ok(Math.abs((hot - cold) - HOT_SCAN_BONUS) < 1e-9 || hot === SCAN_HI);
  });
});

// ── preflight adapter + no Math.random ───────────────────────────────────────────────────────

test('mission preflight surfaces smuggling risk copy without authority writes', () => {
  guarded(() => {
    const offer = {
      id: 'offer_smug',
      type: 'smuggling_run',
      stationId: STATION.id,
      factionId: 'faction_quiet',
      reward_cr: 1800,
      collateral_cr: 0,
      riskTier: 2,
      time_limit_s: 540,
      destStationId: STATION.id,
      destSectorId: HOME.id,
      distance: 800,
      title: 'Quiet run',
      params: { cmdtyId: 'cmdty_narcotics', qty: 4, taskTime: 20 },
    };
    const state = makeState(fieldNode());
    state.player.cargo.capVolume = 50;
    state.player.efficiencyMods = { hiddenCargoPct: 0.2, scannerCloak: 0 };
    state.player.customsHotUntil = 999;

    const projected = buildProjectedMissionStacks(offer);
    assert.equal(projected.length, 1);
    assert.equal(projected[0].commodityId, 'cmdty_narcotics');

    const risk = missionSmugglingRisk(offer, state);
    assert.ok(risk);
    assert.equal(risk.projectionOnly, true);
    assert.ok(risk.chips.some((c) => /Scan ~\d+%/.test(c.text)));
    assert.ok(risk.chips.some((c) => /hot/i.test(c.text)));

    const creditsBefore = state.player.credits;
    const cargoBefore = JSON.stringify(state.player.cargo.items);
    const pf = missionPreflight(offer, state);
    assert.ok(pf.smuggling);
    assert.ok(pf.chips.some((c) => /Scan ~\d+%/.test(c.text)));
    assert.equal(state.player.credits, creditsBefore, 'no credit write');
    assert.equal(JSON.stringify(state.player.cargo.items), cargoBefore, 'no cargo write');
    assert.equal(state.missions.active.length, 0, 'no missions write');

    // Legal cargo mission → no smuggling risk surface
    assert.equal(missionSmugglingRisk({ type: 'cargo_delivery', params: { cmdtyId: 'cmdty_fuel_cells', qty: 4 } }, state), null);

    // Live hold preferred when staged
    state.player.cargo.items = { cmdty_stolen_goods: 3 };
    const live = buildIllicitStacksFromCargo(state.player.cargo);
    assert.equal(live[0].commodityId, 'cmdty_stolen_goods');
    const riskLive = missionSmugglingRisk(offer, state);
    assert.ok(riskLive.remaining.totalVolume > 0);
  });
});
