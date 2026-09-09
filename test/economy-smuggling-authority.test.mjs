// Shared smuggling authority — deterministic integration evidence.
//
// Proves the live seams stay consistent:
//   • fitted hiddenCargoPct / scannerCloak are max-not-additive derived ratings
//   • hidden capacity exposes only overflow illicit quantity
//   • fine projection only counts exposed stacks
//   • mission preflight consumes active entity derived ratings
//   • economyContracts serialize/deserialize preserves station-epoch dedupe
//
// Run:
//   node --test test/economy-smuggling-authority.test.mjs
//   node scripts/check-economy-smuggling-authority.mjs
//
// Fixtures only — no expected goldens. Does not edit production or package.json.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '../src/data/modules.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  getDerivedStats,
  fittingsFromDefaultModules,
} from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import {
  economyContracts,
  ensureFieldContractState,
  markStationEpochEvaluated,
  isStationEpochEvaluated,
} from '../src/systems/economyContracts.js';
import {
  hiddenHoldCapacity,
  remainingIllicit,
  estimatedFine,
  FINE_MULT,
  smugglingPreflightCopy,
} from '../src/economy/customsRisk.js';
import { missionSmugglingRisk, missionPreflight } from '../src/ui/missionPreflight.js';

const CMDTY_NARC = COMMODITIES.find((c) => c.id === 'cmdty_narcotics');
assert.ok(CMDTY_NARC, 'catalog has cmdty_narcotics');
assert.equal(CMDTY_NARC.legality, 'contraband');
assert.equal(CMDTY_NARC.volPerU, 0.6);
assert.equal(CMDTY_NARC.basePrice, 220);

const HOME = SECTORS.find((s) => (s.stations || []).length > 0);
assert.ok(HOME, 'catalog has a sector with stations');
const STATION = HOME.stations[0];

const SHIP_ID = 'ship_mule'; // 3× cargo M + 1× utility S — dual smuggler holds fit

// ── determinism guard ────────────────────────────────────────────────────────────────────────

function guarded(fn) {
  const r = Math.random;
  const n = Date.now;
  Math.random = () => { throw new Error('Math.random in smuggling-authority path'); };
  Date.now = () => { throw new Error('Date.now in smuggling-authority path'); };
  try {
    return fn();
  } finally {
    Math.random = r;
    Date.now = n;
  }
}

/** Temporarily inject scannerCloak on catalog modules; always restores. */
function withTempScannerCloak(patches, fn) {
  const restores = [];
  for (const { id, value } of patches) {
    const def = MODULES.find((m) => m.id === id);
    assert.ok(def && def.mods, `module ${id} exists for fixture patch`);
    const had = Object.prototype.hasOwnProperty.call(def.mods, 'scannerCloak');
    const prev = def.mods.scannerCloak;
    restores.push({ def, had, prev });
    def.mods.scannerCloak = value;
  }
  try {
    return fn();
  } finally {
    for (const { def, had, prev } of restores) {
      if (had) def.mods.scannerCloak = prev;
      else delete def.mods.scannerCloak;
    }
  }
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
      const list = handlers.get(evt) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(evt, payload) {
      emitLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function makeState({
  derived = null,
  efficiencyMods = {},
  cargoItems = {},
  capVolume = 100,
  simTime = 100,
  seed = 17,
} = {}) {
  const entity = {
    id: 1,
    type: 'ship',
    hull: 100,
    hullMax: 100,
    data: derived ? { derived: { ...derived } } : {},
  };
  return {
    mode: 'flight',
    simTime,
    playerId: 1,
    meta: { seed },
    world: { currentSectorId: HOME.id, sectors: {} },
    entities: new Map([[1, entity]]),
    player: {
      credits: 50_000,
      cargo: {
        items: { ...cargoItems },
        usedVolume: 0,
        usedMass: 0,
        capVolume,
        capMass: 500,
      },
      efficiencyMods: { ...efficiencyMods },
      stats: {},
    },
    factions: { [STATION.factionId || HOME.factionId]: { rep: 50 } },
    nav: {},
    ui: {},
    fuel: { current: 100, max: 100 },
    missions: {
      active: [],
      config: {
        refreshSec: 600,
        maxActive: 8,
      },
    },
    sectorSim: {
      field: { version: 1, epochDays: 2, nodes: {} },
      sectors: {},
      meta: {},
    },
  };
}

function dualSmugglerFittings() {
  return fittingsFromDefaultModules(SHIP_ID, [
    'mod_smuggler_hold',
    'mod_smuggler_hold',
  ]);
}

// ── 1. max-not-additive derived ratings ──────────────────────────────────────────────────────

test('fitted hiddenCargoPct and scannerCloak are max-not-additive derived values', () => {
  guarded(() => {
    const dual = dualSmugglerFittings();
    assert.ok(
      dual.filter((id) => id === 'mod_smuggler_hold').length === 2,
      'fixture seats two smuggler holds',
    );

    // Catalog holds are both hiddenCargoPct:0.20 — max must stay 0.20, never 0.40.
    const bare = getDerivedStats(SHIP_ID, dual, null);
    assert.equal(bare.hiddenCargoPct, 0.20);
    assert.notEqual(bare.hiddenCargoPct, 0.40);

    // Efficiency bag lower than fitted → fitted wins (max, not sum).
    const lowerEff = getDerivedStats(SHIP_ID, dual, {
      efficiencyMods: { hiddenCargoPct: 0.10, scannerCloak: 0.05 },
    });
    assert.equal(lowerEff.hiddenCargoPct, 0.20);
    assert.equal(lowerEff.scannerCloak, 0.05);

    // Efficiency bag higher than fitted → bag wins.
    const higherEff = getDerivedStats(SHIP_ID, dual, {
      efficiencyMods: { hiddenCargoPct: 0.35, scannerCloak: 0.40 },
    });
    assert.equal(higherEff.hiddenCargoPct, 0.35);
    assert.equal(higherEff.scannerCloak, 0.40);

    // Two fitted cloak ratings of different strengths: max wins, sum rejected.
    withTempScannerCloak(
      [
        { id: 'mod_smuggler_hold', value: 0.20 },
        { id: 'mod_drill_amp', value: 0.45 },
      ],
      () => {
        const fit = fittingsFromDefaultModules(SHIP_ID, [
          'mod_smuggler_hold',
          'mod_smuggler_hold',
          'mod_drill_amp',
        ]);
        assert.ok(fit.includes('mod_drill_amp'), 'drill amp seats in utility');
        const d = getDerivedStats(SHIP_ID, fit, null);
        assert.equal(d.hiddenCargoPct, 0.20, 'dual holds stay max-not-additive');
        assert.equal(d.scannerCloak, 0.45, 'cloak takes strongest fitted rating');
        assert.notEqual(d.scannerCloak, 0.20 + 0.20 + 0.45);
        assert.notEqual(d.scannerCloak, 0.20 + 0.45);
      },
    );

    // Dual holds with identical fitted cloak must not stack.
    withTempScannerCloak([{ id: 'mod_smuggler_hold', value: 0.30 }], () => {
      const d = getDerivedStats(SHIP_ID, dual, null);
      assert.equal(d.scannerCloak, 0.30);
      assert.notEqual(d.scannerCloak, 0.60);
    });
  });
});

// ── 2. hidden capacity exposes only overflow ─────────────────────────────────────────────────

test('hidden capacity exposes only overflow illicit quantity via economy.illicitCargo', () => {
  guarded(() => {
    const fit = dualSmugglerFittings();
    const derived = getDerivedStats(SHIP_ID, fit, null);
    assert.equal(derived.hiddenCargoPct, 0.20);

    // capVolume 10 → hidden hold 2.0 vol. 20u narcotics @ 0.6 vol = 12 vol.
    // hide floor(2.0/0.6)=3 units; expose 17.
    const qty = 20;
    const capVolume = 10;
    const state = makeState({
      derived: {
        hiddenCargoPct: derived.hiddenCargoPct,
        scannerCloak: derived.scannerCloak,
      },
      // Misleading bag — authority must ignore when derived is present.
      efficiencyMods: { hiddenCargoPct: 0.99, scannerCloak: 0.99 },
      cargoItems: { cmdty_narcotics: qty },
      capVolume,
    });

    const caps = economy.smugglingCapabilities(state);
    assert.equal(caps.hiddenCargoPct, 0.20, 'derived authority over efficiency bag');
    assert.equal(caps.scannerCloak, 0, 'derived cloak, not bag 0.99');

    const hiddenCap = hiddenHoldCapacity({
      capVolume,
      hiddenCargoPct: caps.hiddenCargoPct,
    });
    assert.equal(hiddenCap, 2.0);

    const pure = remainingIllicit({
      stacks: [{
        commodityId: 'cmdty_narcotics',
        qty,
        basePrice: CMDTY_NARC.basePrice,
        legality: 'contraband',
        volPerU: CMDTY_NARC.volPerU,
      }],
      hiddenCapacity: hiddenCap,
    });
    assert.equal(pure.hiddenStacks[0].qty, 3);
    assert.equal(pure.exposedStacks[0].qty, 17);
    assert.equal(pure.remainingQty, 17);
    assert.equal(pure.fullyCovered, false);

    const exposed = economy.illicitCargo(state);
    assert.equal(exposed.length, 1);
    assert.equal(exposed[0].commodityId, 'cmdty_narcotics');
    assert.equal(exposed[0].qty, 17, 'engine exposes only overflow');

    // Fully covered: smaller load fits the same hidden budget.
    state.player.cargo.items = { cmdty_narcotics: 3 }; // 1.8 vol < 2.0
    assert.deepEqual(economy.illicitCargo(state), []);

    // Zero rating → full exposure.
    state.entities.get(1).data.derived = { hiddenCargoPct: 0, scannerCloak: 0 };
    state.player.cargo.items = { cmdty_narcotics: 5 };
    const full = economy.illicitCargo(state);
    assert.equal(full.length, 1);
    assert.equal(full[0].qty, 5);
  });
});

// ── 3. fine projection only counts exposed ───────────────────────────────────────────────────

test('fine projection only counts exposed illicit (never hidden remainder)', () => {
  guarded(() => {
    const stacks = [{
      commodityId: 'cmdty_narcotics',
      qty: 20,
      basePrice: 220,
      legality: 'contraband',
      volPerU: 0.6,
    }];
    const hiddenCapacity = 2.0; // hide 3u, expose 17u
    const rem = remainingIllicit({ stacks, hiddenCapacity });
    assert.equal(rem.hiddenStacks[0].qty, 3);
    assert.equal(rem.exposedStacks[0].qty, 17);

    const fullFine = estimatedFine(stacks);
    const exposedFine = estimatedFine(rem.exposedStacks);
    const hiddenFine = estimatedFine(rem.hiddenStacks);

    assert.equal(FINE_MULT.contraband, 1.5);
    assert.equal(fullFine, 220 * 20 * 1.5); // 6600
    assert.equal(exposedFine, 220 * 17 * 1.5); // 5610
    assert.equal(hiddenFine, 220 * 3 * 1.5); // 990
    assert.equal(exposedFine + hiddenFine, fullFine);
    assert.ok(exposedFine < fullFine, 'projection must not charge hidden units');

    // Preflight copy uses exposed-only fine.
    const copy = smugglingPreflightCopy({
      security: 0.4,
      cloak: 0.1,
      hot: false,
      stacks,
      capVolume: 10,
      hiddenCargoPct: 0.20,
    });
    assert.equal(copy.projectionOnly, true);
    assert.equal(copy.hiddenCapacity, 2.0);
    assert.equal(copy.estFine, exposedFine);
    assert.equal(copy.estFine, estimatedFine(copy.remaining.exposedStacks));
    assert.notEqual(copy.estFine, fullFine);

    // Idempotent projection (no accumulation).
    const copy2 = smugglingPreflightCopy({
      security: 0.4,
      cloak: 0.1,
      hot: false,
      stacks,
      capVolume: 10,
      hiddenCargoPct: 0.20,
    });
    assert.equal(copy2.estFine, copy.estFine);

    // Live engine illicit qty matches exposed projection input.
    const state = makeState({
      derived: { hiddenCargoPct: 0.20, scannerCloak: 0.1 },
      cargoItems: { cmdty_narcotics: 20 },
      capVolume: 10,
    });
    const illicit = economy.illicitCargo(state);
    assert.equal(illicit[0].qty, 17);
    // Mirror engine fine line: basePrice * qty * FINE_MULT[legality]
    const engineLine = illicit.reduce(
      (sum, s) => sum + s.def.basePrice * s.qty * FINE_MULT[s.def.legality],
      0,
    );
    assert.equal(Math.round(engineLine), exposedFine);
  });
});

// ── 4. mission preflight consumes active entity derived ratings ──────────────────────────────

test('mission preflight consumes active entity derived ratings over efficiency bag', () => {
  guarded(() => {
    const offer = {
      id: 'offer_smug_auth',
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
      title: 'Authority preflight',
      params: { cmdtyId: 'cmdty_narcotics', qty: 20, taskTime: 20 },
    };

    // Bag says weak cloak/hold; active entity derived says strong — preflight must use derived.
    const state = makeState({
      derived: { hiddenCargoPct: 0.50, scannerCloak: 0.40 },
      efficiencyMods: { hiddenCargoPct: 0.05, scannerCloak: 0.05 },
      capVolume: 10,
      cargoItems: {}, // project mission cargo
    });

    const risk = missionSmugglingRisk(offer, state);
    assert.ok(risk, 'smuggling_run surfaces risk');
    assert.equal(risk.projectionOnly, true);
    assert.equal(risk.hiddenCapacity, 5.0, '0.50 × capVolume 10 from derived');
    assert.equal(risk.scan.cloak, 0.40, 'cloak from entity.derived');

    // With derived 0.50 on 10u cap → hide 5 vol → floor(5/0.6)=8 units of 20; expose 12.
    assert.equal(risk.remaining.exposedStacks[0].qty, 12);
    assert.equal(risk.estFine, 220 * 12 * 1.5);

    // Bag-only path when derived ratings are absent.
    const bagOnly = makeState({
      derived: null,
      efficiencyMods: { hiddenCargoPct: 0.20, scannerCloak: 0.15 },
      capVolume: 10,
    });
    bagOnly.entities.get(1).data = {}; // no derived block
    const riskBag = missionSmugglingRisk(offer, bagOnly);
    assert.equal(riskBag.hiddenCapacity, 2.0);
    assert.equal(riskBag.scan.cloak, 0.15);

    // missionPreflight composes smuggling chips without authority writes.
    const creditsBefore = state.player.credits;
    const cargoBefore = JSON.stringify(state.player.cargo.items);
    const pf = missionPreflight(offer, state);
    assert.ok(pf.smuggling);
    assert.equal(pf.smuggling.estFine, risk.estFine);
    assert.ok(pf.chips.some((c) => /Scan ~\d+%/.test(c.text)));
    assert.equal(state.player.credits, creditsBefore);
    assert.equal(JSON.stringify(state.player.cargo.items), cargoBefore);
    assert.equal(state.missions.active.length, 0);
  });
});

// ── 5. economyContracts serialize/deserialize preserves station-epoch dedupe ─────────────────

test('economyContracts serialize/deserialize preserves station-epoch dedupe', () => {
  guarded(() => {
    const bus = makeBus();
    const state = makeState({ seed: 42, simTime: 100 });
    const sys = { ...economyContracts };
    sys.init({
      state,
      bus,
      helpers: { voice: { say() { return true; } } },
    });

    const own = ensureFieldContractState(state);
    markStationEpochEvaluated(own, 'station_alpha', 3);
    markStationEpochEvaluated(own, 'station_beta', 7);
    markStationEpochEvaluated(own, STATION.id, 1);

    assert.equal(isStationEpochEvaluated(own, 'station_alpha', 3), true);
    assert.equal(sys.hasEvaluated('station_alpha', 3), true);
    assert.equal(sys.hasEvaluated('station_alpha', 4), false);
    assert.equal(sys.hasEvaluated('station_beta', 7), true);

    const blob = sys.serialize();
    assert.deepEqual(blob.evaluatedEpochByStation, {
      station_alpha: 3,
      station_beta: 7,
      [STATION.id]: 1,
    });

    // Mutate live bag, then restore from blob.
    markStationEpochEvaluated(own, 'station_alpha', 99);
    assert.equal(sys.hasEvaluated('station_alpha', 3), false);

    sys.deserialize(blob);
    assert.equal(sys.hasEvaluated('station_alpha', 3), true);
    assert.equal(sys.hasEvaluated('station_beta', 7), true);
    assert.equal(sys.hasEvaluated(STATION.id, 1), true);
    assert.equal(sys.hasEvaluated('station_alpha', 99), false);

    // Round-trip identity.
    assert.deepEqual(sys.serialize().evaluatedEpochByStation, blob.evaluatedEpochByStation);

    // Non-finite / non-numeric epochs dropped; finite Number(...) values floor.
    // Number(null) === 0 is finite, so null coerces to epoch 0 (live deserialize contract).
    sys.deserialize({
      evaluatedEpochByStation: {
        keep: 2.7, // floored
        drop_nan: Number.NaN,
        drop_str: 'nope',
        null_as_zero: null,
      },
    });
    assert.deepEqual(sys.serialize().evaluatedEpochByStation, {
      keep: 2,
      null_as_zero: 0,
    });

    // Empty / missing payload resets cleanly.
    sys.deserialize(null);
    assert.deepEqual(sys.serialize().evaluatedEpochByStation, {});
    sys.deserialize(blob);
    assert.equal(sys.hasEvaluated('station_beta', 7), true);
  });
});
