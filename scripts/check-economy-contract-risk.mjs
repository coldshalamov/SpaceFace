#!/usr/bin/env node
// ECON-P4 — field contracts + smuggling risk adapters acceptance check.
//
// Contract:
//   • Field contracts: cause-named board-ready offers, stable id, station+epoch dedupe API,
//     emit-only (never writes state.missions). Calm field is a strict silent no-op.
//   • customsRisk pure math: hidden hold capped, remaining illicit, scan chance inputs,
//     hot-until modifier, estimated fine (projection only — no double fine), preflight copy.
//   • No Math.random / no wall clock. No authority writes (credits/cargo/heat/missions boards).
//
// Lead seam: register as npm run check:economy-contract-risk when package.json is open.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  selectEconContract,
  isCalmField,
  thresholdGate,
  ECON_CONTRACT_THRESHOLDS,
  fillCause,
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
  smugglingPreflightCopy,
  buildProjectedMissionStacks,
} from '../src/economy/customsRisk.js';
import { missionPreflight, missionSmugglingRisk } from '../src/ui/missionPreflight.js';
import { SECTORS } from '../src/data/sectors.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

const HOME = SECTORS.find((s) => s.id !== 'sector_helios_prime' && (s.stations || []).length > 0)
  || SECTORS.find((s) => (s.stations || []).length > 0);
assert.ok(HOME, 'catalog has a sector with stations');
const STATION = HOME.stations[0];

let sections = 0;
function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const r = Math.random;
  const n = Date.now;
  Math.random = () => { throw new Error('Math.random in economy-contract-risk path'); };
  Date.now = () => { throw new Error('Date.now in economy-contract-risk path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

function fieldNode(overrides = {}) {
  return {
    danger: 0.2,
    pricePressure: 0,
    influence: { faction_scn: 0.4 },
    dominantFactionId: 'faction_scn',
    dominantInfluence: 0.4,
    contestMargin: 0.1,
    trend: { danger: 0, pricePressure: 0, influence: 0, ...(overrides.trend || {}) },
    driver: {
      danger: 'structural_baseline',
      pricePressure: 'market_balance',
      influence: 'territorial_anchor',
      ...(overrides.driver || {}),
    },
    ...overrides,
    // re-apply nested after spread so caller overrides win
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

function makeState(node, { seed = 7, simTime = 100 } = {}) {
  return {
    mode: 'flight',
    simTime,
    playerId: 1,
    meta: { seed },
    world: { currentSectorId: HOME.id, sectors: {} },
    entities: new Map([[1, { id: 1, type: 'ship', hull: 100, hullMax: 100 }]]),
    player: {
      credits: 50000,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 50, capMass: 500 },
      efficiencyMods: {},
      stats: {},
    },
    factions: { [STATION.factionId || HOME.factionId]: { rep: 50 } },
    nav: {},
    ui: {},
    fuel: { current: 100, max: 100 },
    missions: { active: [], config: { refreshSec: 600, maxActive: 8, BASE: { cargo_delivery: 100 }, RISK_MULT: { 0: 1, 1: 1.2, 2: 1.5, 3: 1.8, 4: 2.2 }, distDivisor: 2000, cruiseSpeedRef: 140, slackDefault: 2.2, collateralPct: 0.25 } },
    sectorSim: {
      field: { version: 1, epochDays: 2, nodes: { [HOME.id]: node } },
      sectors: {},
      meta: {},
    },
  };
}

// ── 1. calm silent ───────────────────────────────────────────────────────────────────────────
function testCalmSilent() {
  guarded(() => {
    const calm = fieldNode();
    assert.equal(isCalmField(calm), true);
    assert.equal(selectEconContract(calm), null);

    const bus = makeBus();
    const state = makeState(calm);
    const sys = { ...economyContracts };
    sys.init({ state, bus, helpers: { voice: { say() { return true; } } } });
    bus.emit('dock:docked', { stationId: STATION.id });
    // Field contracts stay silent on a calm field. Helios may still post the authored G06
    // first-trade teach offer once — that is not a field-born contract.
    const fieldOffers = bus.emitLog.filter((e) => e.evt === 'mission:offered'
      && e.payload && e.payload.source === 'economyContract');
    assert.equal(fieldOffers.length, 0, 'calm field emits no field contract');
    const firstTrade = bus.emitLog.filter((e) => e.evt === 'mission:offered'
      && e.payload && e.payload.source === 'firstTradeContract');
    if (STATION.id === 'station_helios') {
      assert.equal(firstTrade.length, 1, 'Helios posts first-trade teach offer once');
    } else {
      assert.equal(firstTrade.length, 0);
    }
    assert.equal(sys.hasEvaluated(STATION.id), true, 'dedupe marks calm evaluation');
  });
  ok('calm field is silent (no field offer emit)');
}

// ── 2. threshold deterministic + station-epoch dedupe ────────────────────────────────────────
function testThresholdDeterministicDeduped() {
  guarded(() => {
    const scarce = fieldNode({
      pricePressure: 0.40,
      driver: { pricePressure: 'route_scarcity' },
    });
    assert.equal(thresholdGate(scarce, 'scarcity'), true);
    assert.ok(scarce.pricePressure > ECON_CONTRACT_THRESHOLDS.scarcityPressure);

    const bus = makeBus();
    const state = makeState(scarce, { seed: 42, simTime: 100 });
    const sys = { ...economyContracts };
    sys.init({ state, bus, helpers: { voice: { say() { return true; } } } });

    bus.emit('dock:docked', { stationId: STATION.id });
    bus.emit('dock:docked', { stationId: STATION.id });
    const offers = bus.emitLog.filter((e) => e.evt === 'mission:offered'
      && e.payload && e.payload.source === 'economyContract');
    assert.equal(offers.length, 1, 'station+epoch field dedupe');

    const offer = offers[0].payload;
    const epoch = fieldContractEpoch(100, 600);
    assert.equal(offer.id, stableFieldOfferId(STATION.id, epoch));
    assert.equal(offer.source, 'economyContract');
    assert.ok(offer.cause && offer.cause.line, 'cause-named board-ready offer');
    assert.equal(offer.cause.tag, 'route_scarcity');
    const firstTrade = bus.emitLog.filter((e) => e.evt === 'mission:offered'
      && e.payload && e.payload.source === 'firstTradeContract');
    if (STATION.id === 'station_helios') {
      assert.equal(firstTrade.length, 1, 'first-trade teach offer once per run');
    }

    // Bit-identical replan
    const info = {
      id: STATION.id,
      name: STATION.name,
      type: STATION.type,
      factionId: STATION.factionId || HOME.factionId,
      sectorId: HOME.id,
    };
    const again = sys.planOffer(info, epoch);
    assert.deepEqual(
      { id: again.id, type: again.type, title: again.title, summary: again.summary, reward_cr: again.reward_cr },
      { id: offer.id, type: offer.type, title: offer.title, summary: offer.summary, reward_cr: offer.reward_cr },
    );

    // Pure API
    const bag = ensureFieldContractState({});
    markStationEpochEvaluated(bag, 'st_a', 1);
    assert.equal(isStationEpochEvaluated(bag, 'st_a', 1), true);
    assert.equal(isStationEpochEvaluated(bag, 'st_a', 2), false);

    // Emit-only: no missions board write
    assert.equal(state.missions.boards, undefined);
    assert.equal(state.missions.active.length, 0);

    // fillCause is pure
    const line = fillCause('{station} needs {commodity} in {sector}', {
      station: 'Dock', commodity: 'Fuel', sector: 'Helios',
    });
    assert.equal(line, 'Dock needs Fuel in Helios');
  });
  ok('threshold deterministic + station-epoch dedupe + stable id');
}

// ── 3. percent clamp ─────────────────────────────────────────────────────────────────────────
function testPercentClamp() {
  guarded(() => {
    assert.equal(clampScanChance(-99), SCAN_LO);
    assert.equal(clampScanChance(99), SCAN_HI);
    const s = scanChanceInputs({ security: 5, cloak: 0, hot: true });
    assert.equal(s.chance, SCAN_HI);
    assert.equal(s.pct, Math.round(SCAN_HI * 100));
    assert.ok(scanChance({ security: 0, cloak: 10 }) === SCAN_LO);
    assert.equal(BASE_SCAN, 0.25);
  });
  ok('scan chance percent clamp');
}

// ── 4. illicit remainder ─────────────────────────────────────────────────────────────────────
function testIllicitRemainder() {
  guarded(() => {
    assert.equal(hiddenHoldCapacity({ capVolume: 40, hiddenCargoPct: 0.2 }), 8);
    const rem = remainingIllicit({
      stacks: [
        { commodityId: 'cmdty_narcotics', qty: 10, basePrice: 220, legality: 'contraband', volPerU: 0.6 },
      ],
      hiddenCapacity: 3.0, // hide floor(3/0.6)=5 units
    });
    assert.equal(rem.hiddenStacks[0].qty, 5);
    assert.equal(rem.exposedStacks[0].qty, 5);
    assert.equal(rem.remainingQty, 5);
    assert.equal(rem.fullyCovered, false);
  });
  ok('hidden hold capped + illicit remainder');
}

// ── 5. no double fine ────────────────────────────────────────────────────────────────────────
function testNoDoubleFine() {
  guarded(() => {
    assert.deepEqual({ ...FINE_MULT }, {
      legal: 0, restricted: 0.8, illegal: 1.2, contraband: 1.5,
    });
    assert.equal(BRIBE_FRAC, 0.30);

    const stacks = [
      { commodityId: 'cmdty_narcotics', qty: 4, basePrice: 220, legality: 'contraband', volPerU: 0.6 },
    ];
    const full = estimatedFine(stacks); // 1320
    const rem = remainingIllicit({ stacks, hiddenCapacity: 1.8 }); // hide 3u (1.8 vol)
    const exposed = estimatedFine(rem.exposedStacks);
    assert.equal(rem.exposedStacks[0].qty, 1);
    assert.equal(exposed, 330);
    assert.ok(exposed < full);
    // Re-running estimate does not accumulate
    assert.equal(estimatedFine(rem.exposedStacks), exposed);
    assert.equal(estimatedBribe(exposed), Math.round(exposed * BRIBE_FRAC));

    const copy = smugglingPreflightCopy({
      security: 0.3, cloak: 0, hot: false, stacks, capVolume: 9, hiddenCargoPct: 0.2,
    });
    assert.equal(copy.projectionOnly, true);
    assert.equal(copy.estFine, estimatedFine(copy.remaining.exposedStacks));
  });
  ok('no double fine (projection on exposed only)');
}

// ── 6. hot-until + preflight + no authority writes ───────────────────────────────────────────
function testHotAndPreflight() {
  guarded(() => {
    assert.equal(hotUntilActive(200, 50), true);
    assert.equal(HOT_SCAN_BONUS, 0.15);

    const offer = {
      id: 'offer_smug',
      type: 'smuggling_run',
      stationId: STATION.id,
      factionId: 'faction_quiet',
      reward_cr: 1200,
      riskTier: 2,
      destStationId: STATION.id,
      destSectorId: HOME.id,
      distance: 600,
      params: { cmdtyId: 'cmdty_narcotics', qty: 4, taskTime: 20 },
    };
    const state = makeState(fieldNode());
    state.player.efficiencyMods = { hiddenCargoPct: 0.2 };
    state.player.customsHotUntil = state.simTime + 300;

    assert.equal(buildProjectedMissionStacks(offer).length, 1);
    const risk = missionSmugglingRisk(offer, state);
    assert.ok(risk && risk.projectionOnly);
    assert.ok(risk.chips.some((c) => /Scan ~\d+%/.test(c.text)));

    const credits = state.player.credits;
    const pf = missionPreflight(offer, state);
    assert.ok(pf.smuggling);
    assert.equal(state.player.credits, credits, 'no credit authority write');
    assert.equal(state.missions.active.length, 0, 'no missions authority write');
  });
  ok('hot-until modifier + smuggling preflight copy (no authority writes)');
}

// ── 7. node:test suite green ─────────────────────────────────────────────────────────────────
function testNodeTestSuite() {
  const here = dirname(fileURLToPath(import.meta.url));
  const testFile = join(here, '..', 'test', 'economy-contract-risk.test.mjs');
  const result = spawnSync(process.execPath, ['--test', testFile], {
    encoding: 'utf8',
    cwd: join(here, '..'),
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
  }
  assert.equal(result.status, 0, 'node:test economy-contract-risk suite green');
  ok('node:test suite green');
}

testCalmSilent();
testThresholdDeterministicDeduped();
testPercentClamp();
testIllicitRemainder();
testNoDoubleFine();
testHotAndPreflight();
testNodeTestSuite();

console.log(`[check-economy-contract-risk] PASS — ${sections} sections green`);
