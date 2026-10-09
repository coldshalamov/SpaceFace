// NXI-111 — the market's tracked-contract line explains a partial settlement before the
// pilot commits to it. NXB-028 made a short freight manifest a real settlement on the
// contract's recorded terms (accepted reward / contracted units, never a live price), but
// the quote stage only knew "aboard" vs "missing": a hold that looked full could still
// settle partial because the units were sealed to another contract, and the line never
// named what the dock would actually pay. Now the line counts deliverable units the
// owner's way — a sealed manifest draws only its own reservation, loose freight only
// unsealed stock — and a short manifest names the accepted quantity and the payment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { trackedCargoGuidance } from '../src/ui/station/screens/market.js';
import { marketQuoteHtml } from '../src/ui/views/marketPresentation.js';

const MARKET_SRC = readFileSync(
  fileURLToPath(new URL('../src/ui/station/screens/market.js', import.meta.url)),
  'utf8',
);

const ORE = 'cmdty_ore_iron';
const NAME = 'Iron Ore';

function deliveryMission(over = {}) {
  return {
    id: 'm1', type: 'cargo_delivery', status: 'active',
    stationId: 'station_helios', destStationId: 'station_ceres',
    reward_cr: 1000, objectiveProgress: 0,
    params: { cmdtyId: ORE, qty: 10 },
    ...over,
  };
}

// A second preloaded contract sealing `qty` units of the same commodity.
function siblingSeal(id, qty) {
  return {
    id, type: 'cargo_delivery', status: 'active',
    stationId: 'station_helios', destStationId: 'station_io',
    reward_cr: 600, preloadedCargo: true, objectiveProgress: 0,
    params: { cmdtyId: ORE, qty, sealedRemaining: qty, sealAccounted: true },
  };
}

function marketState({ cargo = {}, missions = [], tracked = 'm1' } = {}) {
  return {
    simTime: 0,
    player: { credits: 0, cargo: { items: cargo, capVolume: 80, usedVolume: 0, usedMass: 0 } },
    missions: { active: missions },
    ui: { dockedStationId: 'station_helios', trackedMissionId: tracked },
  };
}

test('a short loose manifest names the delivered units and what the dock pays', () => {
  const m = deliveryMission();
  const guidance = trackedCargoGuidance(marketState({ cargo: { [ORE]: 4 }, missions: [m] }), ORE, NAME);
  assert.equal(guidance.state, 'partial');
  assert.ok(guidance.text.includes('4'), 'names the deliverable units');
  assert.ok(guidance.text.includes('10'), 'names the contracted units');
  assert.ok(guidance.text.includes('400'), 'names the partial payment on recorded terms');
  assert.ok(guidance.text.includes('1,000'), 'contrasts the full contract reward');
  assert.ok(guidance.text.includes('6'), 'says what settles the manifest in full');
});

test('a full-looking hold still settles partial when units are sealed to another contract', () => {
  // 10u aboard, but a sibling contract seals 6 of them — only 4 are deliverable on this
  // contract. The old line said "cargo is aboard"; the dock would have paid 400, not 1,000.
  const m = deliveryMission();
  const guidance = trackedCargoGuidance(
    marketState({ cargo: { [ORE]: 10 }, missions: [m, siblingSeal('m2', 6)] }),
    ORE, NAME,
  );
  assert.equal(guidance.state, 'partial', 'a sealed-out hold must not read as a full manifest');
  assert.ok(guidance.text.includes('4 of 10'), 'names the honest deliverable count');
  assert.ok(guidance.text.includes('400'), 'names the payment the dock will actually make');
});

test('a damaged sealed manifest settles its remaining reservation honestly', () => {
  const m = deliveryMission({
    preloadedCargo: true,
    params: { cmdtyId: ORE, qty: 10, sealedRemaining: 10, sealAccounted: true },
  });
  const guidance = trackedCargoGuidance(marketState({ cargo: { [ORE]: 3 }, missions: [m] }), ORE, NAME);
  assert.equal(guidance.state, 'partial');
  assert.ok(guidance.text.includes('3 of 10'), 'names the surviving units');
  assert.ok(guidance.text.includes('300'), 'pays recorded terms on the survivors');
});

test('a full manifest still reads as cargo aboard', () => {
  const m = deliveryMission();
  const guidance = trackedCargoGuidance(marketState({ cargo: { [ORE]: 10 }, missions: [m] }), ORE, NAME);
  assert.equal(guidance.state, 'aboard');
  assert.ok(guidance.text.includes('Cargo is aboard'), 'the full-load line is unchanged');
});

test('an empty hold keeps the plain load-more line', () => {
  const m = deliveryMission();
  const guidance = trackedCargoGuidance(marketState({ cargo: {}, missions: [m] }), ORE, NAME);
  assert.equal(guidance.state, 'missing');
  assert.ok(guidance.text.includes('Load 10u more'), 'the shortfall count is the contract quantity');
});

test('units held entirely for a sibling seal do not count as deliverable', () => {
  const m = deliveryMission();
  const guidance = trackedCargoGuidance(
    marketState({ cargo: { [ORE]: 10 }, missions: [m, siblingSeal('m2', 10)] }),
    ORE, NAME,
  );
  assert.equal(guidance.state, 'missing', 'sealed units are not deliverable on this contract');
  assert.ok(guidance.text.includes('Load 10u more'), 'the whole manifest is still owed');
  assert.ok(guidance.text.includes('sealed to other contracts'), 'says why the held units do not count');
});

test('a non-delivery tracked contract keeps the held-based line', () => {
  const m = deliveryMission({ type: 'bulk_trade' });
  const guidance = trackedCargoGuidance(marketState({ cargo: { [ORE]: 4 }, missions: [m] }), ORE, NAME);
  assert.equal(guidance.state, 'missing');
  assert.ok(guidance.text.includes('Load 6u more'), 'non-delivery rows keep the old held-based count');
});

test('the partial line renders through the quote stage markup', () => {
  const guidance = trackedCargoGuidance(
    marketState({ cargo: { [ORE]: 4 }, missions: [deliveryMission()] }),
    ORE, NAME,
  );
  const html = marketQuoteHtml({ id: ORE, name: NAME, mode: 'sell', sell: 30, trackedGuidance: guidance });
  assert.ok(html.includes('data-tracked-state="partial"'), 'the quote stage carries the partial state');
  assert.ok(html.includes('the dock pays 400 cr'), 'the player reads the honest payment');
});

test('the ordinary aboard line still renders through the quote stage', () => {
  const guidance = trackedCargoGuidance(
    marketState({ cargo: { [ORE]: 10 }, missions: [deliveryMission()] }),
    ORE, NAME,
  );
  const html = marketQuoteHtml({ id: ORE, name: NAME, mode: 'sell', sell: 30, trackedGuidance: guidance });
  assert.ok(html.includes('data-tracked-state="aboard"'), 'the full-load state still renders');
});

test('the quote stage asks the guidance view-model and passes its line to the markup', () => {
  // Wires the view-model to the render: the stage computes the line for the tracked
  // commodity and hands it to marketQuoteHtml, which owns the .sx-mkt-tracked element.
  assert.match(MARKET_SRC, /trackedCargoGuidance\(state, r\.id, def\.name\)/);
  assert.match(MARKET_SRC, /marketQuoteHtml\(\{[^}]*trackedGuidance/s);
});
