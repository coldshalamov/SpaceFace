// BP-12 packet BLOCKADE_RELIEF_CONTRACTS ("Blockade & Relief Runs") acceptance check.
//
// Contract (src/data/economyContractTemplates.js + src/systems/economyContracts.js):
//   - A sector driven to infrastructure_disruption + HIGH scarcity (pricePressure > blockadeScarcity)
//     selects the `blockade_relief` template (a cargo_delivery), beating station_loss_salvage.
//   - The relief run's pay SCALES WITH the live modeled scarcity (BLOCKADE_PAY_SCALE on pricePressure)
//     — never a constant (the failureMode). A higher-pressure field pays strictly more.
//   - The headline + offer AGREE on the same driver (infrastructure_disruption) — the title and the
//     cause line both name the blockade.
//   - Relief cargo comes from the enumerated BLOCKADE_RELIEF_CMDTYS pool (medical/food/fuel).
//   - Seeded (shares the economyContracts stream); deterministic per (seed, stationId, epoch, field).
//   - A disrupted-but-fed station (pricePressure below the blockade threshold) does NOT get a relief
//     run — it gets salvage (the existing station_loss_salvage path), unchanged.
import assert from 'node:assert/strict';

import {
  selectEconContract, ECON_CONTRACT_TEMPLATES, ECON_CONTRACT_THRESHOLDS,
  BLOCKADE_PAY_SCALE, BLOCKADE_RELIEF_CMDTYS,
} from '../src/data/economyContractTemplates.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { SECTORS } from '../src/data/sectors.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in blockade-relief path'); };
  Date.now = () => { throw new Error('Date.now in blockade-relief path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

testTemplatePresentAndFirst();
guarded(testSelectsReliefWhenDisruptedAndStarving);
guarded(testDisruptedButFedSelectsSalvageNotRelief);
guarded(testCalmFieldSelectsNothing);
guarded(testReliefCargoPool);
guarded(testPayScalesWithLiveScarcity);
testHeadlineAndOfferAgreeOnDriver();
guarded(testDeterminism);

console.log('Blockade-relief checks OK');

function disruptedStarvingSignal(pricePressure) {
  return {
    sectorId: 'sector_x', dominantFactionId: 'faction_scn',
    danger: 0.7, pricePressure,
    influence: {}, trend: { danger: 0.01, pricePressure: 0.05, influence: 0 },
    driver: { danger: 'infrastructure_disruption', pricePressure: 'infrastructure_disruption', influence: 'territorial_anchor' },
  };
}

// ── 1. the template exists, is first (tie-break winner), and gates on disruption+starvation ──
function testTemplatePresentAndFirst() {
  const keys = ECON_CONTRACT_TEMPLATES.map((t) => t.key);
  assert.ok(keys.includes('blockade_relief'), 'blockade_relief template present');
  assert.equal(keys[0], 'blockade_relief', 'first in authored order → wins the disruption+scarcity tie');
  assert.ok(ECON_CONTRACT_THRESHOLDS.blockadeScarcity > ECON_CONTRACT_THRESHOLDS.scarcityPressure,
    'blockade threshold is above the plain scarcity band (only a besieged station qualifies)');
}

// ── 2. disrupted + starving → relief template selected ───────────────────────────────────────
function testSelectsReliefWhenDisruptedAndStarving() {
  const sig = disruptedStarvingSignal(0.6); // well above blockadeScarcity (0.45)
  const sel = selectEconContract(sig);
  assert.ok(sel, 'a besieged sector selects a contract');
  assert.equal(sel.template.key, 'blockade_relief', 'selects the relief run');
  assert.equal(sel.template.offerType, 'cargo_delivery', 'relief is a cargo_delivery');
  assert.equal(sel.causeTag, 'infrastructure_disruption', 'cause tag is the blockade driver');
}

// ── 3. disrupted but FED (below blockade threshold) → salvage, not relief ────────────────────
function testDisruptedButFedSelectsSalvageNotRelief() {
  // Disrupted but pricePressure only 0.3 (above scarcity 0.25, below blockade 0.45) → not starving
  const sig = disruptedStarvingSignal(0.3);
  const sel = selectEconContract(sig);
  assert.ok(sel, 'a disrupted sector still selects a contract');
  assert.equal(sel.template.key, 'station_loss_salvage',
    'disrupted-but-fed station → salvage, NOT relief (relief needs real starvation)');
}

// ── 4. calm field → nothing ─────────────────────────────────────────────────────────────────
function testCalmFieldSelectsNothing() {
  const calm = {
    sectorId: 's', dominantFactionId: 'faction_scn', danger: 0.1, pricePressure: 0.05,
    influence: {}, trend: { danger: 0, pricePressure: 0, influence: 0 },
    driver: { danger: 'structural_baseline', pricePressure: 'market_balance', influence: 'territorial_anchor' },
  };
  assert.equal(selectEconContract(calm), null, 'calm field → no contract (golden-sim safe)');
}

// ── 5. relief cargo pool is the enumerated medical/food/fuel set ─────────────────────────────
function testReliefCargoPool() {
  assert.deepEqual([...BLOCKADE_RELIEF_CMDTYS].sort(), ['cmdty_food', 'cmdty_fuel_cells', 'cmdty_medical'],
    'relief cargo = medical/food/fuel (the besieged-station essentials)');
}

// ── 6. pay scales with the LIVE scarcity (failureMode: a constant payout) ────────────────────
function testPayScalesWithLiveScarcity() {
  // The relief template's fField at plan time = 1 + max(0, pricePressure) * BLOCKADE_PAY_SCALE.
  // Verify the scale constant + that a hungrier field yields a strictly larger factor.
  const fAt = (pp) => 1 + Math.max(0, pp) * BLOCKADE_PAY_SCALE;
  assert.ok(fAt(0.6) > fAt(0.5), 'higher scarcity → strictly higher pay factor');
  assert.ok(fAt(0.45) > 1, 'at the blockade threshold the premium is already > 1 (war-priced)');
  assert.ok(BLOCKADE_PAY_SCALE > 1, 'BLOCKADE_PAY_SCALE is a real premium, not a constant 1.0');
  // And the relief template's own strength rises with scarcity (so a hungrier station is more
  // likely to surface the relief offer at all).
  const s = ECON_CONTRACT_TEMPLATES.find((t) => t.key === 'blockade_relief');
  assert.ok(s.strength(disruptedStarvingSignal(0.7)) > s.strength(disruptedStarvingSignal(0.5)),
    'strength rises with scarcity');

  // CRITICAL: verify the PLANNER's actual reward_cr scales with the live field, not just the
  // formula in isolation (this is the control that catches a constant-payout regression in the
  // planner). Two besieged fields, same station/epoch/seed, only pricePressure differs → the
  // hungrier field must pay strictly more.
  const sec = SECTORS.find((s2) => (s2.stations || []).length > 0);
  const st = sec.stations[0];
  const info = { id: st.id, name: st.name, type: st.type, factionId: st.factionId || sec.factionId, sectorId: sec.id };
  const stateAt = (pp) => ({
    simTime: 1000, meta: { seed: 42 }, world: { sectors: {}, currentSectorId: sec.id },
    sectorSim: { field: { version: 1, epochDays: 5, nodes: { [sec.id]: {
      danger: 0.7, pricePressure: pp, influence: {}, dominantFactionId: sec.factionId || 'faction_scn',
      trend: { danger: 0.01, pricePressure: 0.05, influence: 0 },
      driver: { danger: 'infrastructure_disruption', pricePressure: 'infrastructure_disruption', influence: 'territorial_anchor' },
    } } }, sectors: {}, meta: {} }, missions: {},
  });
  const sys = { ...economyContracts };
  sys.state = stateAt(0.5); sys.bus = { on() {}, off() {}, emit() {} }; sys.helpers = { voice: { say: () => true } };
  if (sys._ensureState) sys._ensureState();
  const lo = sys.planOffer(info, 1);
  sys.state = stateAt(0.8);
  const hi = sys.planOffer(info, 1);
  assert.ok(lo && hi, 'planner produces relief offers at both scarcities');
  assert.equal(lo.type, 'cargo_delivery');
  assert.equal(hi.type, 'cargo_delivery');
  assert.ok(hi.reward_cr > lo.reward_cr,
    `planner pay scales with live scarcity: hungry(${hi.reward_cr}) > fed(${lo.reward_cr})`);
  // Same commodity pick (seeded, same stream) so the reward delta is purely the field premium.
  assert.equal(hi.params.cmdtyId, lo.params.cmdtyId, 'same seeded commodity pick');
}

// ── 7. headline + offer agree on the same driver (infrastructure_disruption) ────────────────
function testHeadlineAndOfferAgreeOnDriver() {
  const s = ECON_CONTRACT_TEMPLATES.find((t) => t.key === 'blockade_relief');
  // The cause prose names the blockade / siege; the title (in economyContracts.js) names the
  // disrupted-infrastructure driver. Both trace to the same `appliesTag`.
  assert.ok(/besieged|blockade/i.test(s.cause), 'cause line names the blockade');
  assert.equal(s.appliesTag, 'infrastructure_disruption', 'cause tag is the disruption driver');
}

// ── 8. determinism: same signal → same selection ────────────────────────────────────────────
function testDeterminism() {
  const sig = disruptedStarvingSignal(0.6);
  assert.deepStrictEqual(selectEconContract(sig), selectEconContract(sig));
}
