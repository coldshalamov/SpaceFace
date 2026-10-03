// FB-124 — cargo insurance is a real station service: priced on the legal manifest and the
// sector's danger, good until the next dock, and honored once at the recovery berth.
import assert from 'node:assert/strict';
import test from 'node:test';

import { economy, cargoPolicyQuoteFor, legalManifestValueCr } from '../src/systems/economy.js';
import { buildRecoveryPlan } from '../src/combat/playerDefeat.js';
import { COMMODITIES } from '../src/data/commodities.js';

const ORE = COMMODITIES.find((c) => c.id === 'cmdty_ore_iron');
const ILLEGAL = COMMODITIES.find((c) => c.legality === 'illegal') || COMMODITIES.find((c) => c.legality && c.legality !== 'legal');

function harness({ credits = 5000, items = {}, stationId = 'station_helios' } = {}) {
  const state = {
    player: {
      credits,
      cargo: { items: { ...items } },
      activeShipIndex: 0,
      ownedShips: [{ defId: 'ship_kestrel' }],
      insurance: {},
    },
    entities: new Map(),
    entityList: [],
    fuel: { current: 50, max: 100 },
    meta: { seed: 7 },
    factions: {},
    ui: { docked: true, dockedStationId: stationId },
    world: { currentSectorId: 'sector_helios' },
    content: {},
    simTime: 0,
    story: {},
  };
  const bus = { emit() {}, on() {} };
  const econ = Object.create(economy);
  econ.state = state;
  econ.bus = bus;
  econ._registry = { get: () => null };
  econ._lastDockedStation = stationId;
  return { state, bus, econ };
}

test('a policy prices on the legal manifest and danger tier — contraband is never insurable', () => {
  const items = { [ORE.id]: 20 };
  if (ILLEGAL) items[ILLEGAL.id] = 50;   // illicit stacks must not raise the covered value
  const { state } = harness({ items });
  const legal = 20 * ORE.basePrice;
  assert.equal(legalManifestValueCr(state), legal, 'illicit units do not join the manifest');
  const quote = cargoPolicyQuoteFor(state);
  assert.ok(quote, 'a loaded legal hold earns a quote');
  assert.equal(quote.manifestCr, legal);
  assert.ok(quote.premiumCr > 0 && quote.premiumCr < legal, 'premium is a fraction of manifest');
  assert.ok(quote.coverCr === Math.round(legal * quote.coverFrac));
});

test('a bought policy pays the covered fraction of the destroyed manifest once', () => {
  const { state, econ } = harness({ items: { [ORE.id]: 20 }, credits: 5000 });
  econ.handleService({ type: 'cargo_insurance' });
  const policy = state.player.cargoPolicy;
  assert.ok(policy && policy.coverCr > 0, 'policy written');
  const premiumPaid = 5000 - state.player.credits;
  assert.equal(premiumPaid, policy.premiumCr, 'the wallet paid the quoted premium');

  const plan = buildRecoveryPlan(state, null);
  // Death destroys half the hold — the policy pays coverFrac of the destroyed value.
  const lostValue = plan.cargoLosses.reduce((n, l) => n + l.qty * ORE.basePrice, 0);
  const expected = Math.min(policy.coverCr, Math.round(lostValue * policy.coverFrac));
  assert.equal(plan.cargoPayoutCr, expected, 'claim covers the fraction of what was lost');
  assert.equal(plan.cargoPolicyName, 'cargo policy');
  assert.match(plan.insuranceStatus, /CARGO POLICY/, 'the claim is named in the coverage line');
});

test('a policy that reached a dock expired — a later defeat pays nothing', () => {
  const { state, econ } = harness({ items: { [ORE.id]: 20 } });
  econ.handleService({ type: 'cargo_insurance' });
  assert.ok(state.player.cargoPolicy, 'policy written');
  econ._expireTripServices();   // the dock:docked handler's expiry — the trip is over
  assert.equal(state.player.cargoPolicy, undefined, 'the next dock ended the policy');
  const plan = buildRecoveryPlan(state, null);
  assert.equal(plan.cargoPayoutCr, 0, 'an expired policy never invents a claim');
});

test('the berth refuses a policy on an empty or all-illicit hold', () => {
  const items = ILLEGAL ? { [ILLEGAL.id]: 10 } : {};
  const { state, econ } = harness({ items, credits: 5000 });
  const creditsBefore = state.player.credits;
  econ.handleService({ type: 'cargo_insurance' });
  assert.equal(state.player.cargoPolicy, undefined, 'no legal manifest, no policy');
  assert.equal(state.player.credits, creditsBefore, 'nothing was charged');
});
