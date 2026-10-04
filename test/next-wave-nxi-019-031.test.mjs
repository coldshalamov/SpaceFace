// NXI-019 + NXI-031 — the sell detail names the held lot's custody and condition before
// settlement. Two identical commodities under different custody get different truthful
// disposition text; a hazardous shipment carries a state label, never a countdown.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  heldFreightCustodyRows,
  heldShipmentConditionRows,
  sellDispositionText,
} from '../src/ui/station/screens/market.js';

const CMDTY = 'cmdty_ore_iron';

function custodyRecord(overrides = {}) {
  return {
    custodyId: 'custody:a',
    commodityId: CMDTY,
    playerCollectedQty: 6,
    legalOwnerKind: 'civilian',
    legalOwnerStableId: 'encounter:x:carrier:0',
    legalOwnerFactionId: 'faction_mts',
    terminal: false,
    lawTheftIncidentReceiptId: null,
    pods: [
      { podIdentity: 'p1', status: 'player_collected', qty: 6, custodySourceKind: 'lawful_carrier', sourceCustodianStableId: 'encounter:x:carrier:0' },
    ],
    ...overrides,
  };
}

function custodyState(records) {
  return { encounterDirector: { stats: { openFreightCustodies: records.map((record) => ({ record })) } } };
}

test('NXI-019: identical commodities under different custody get different disposition text', () => {
  // Same commodity id, same held count — the only difference is the custody behind it.
  const reported = sellDispositionText(custodyState([custodyRecord({ lawTheftIncidentReceiptId: 'law:incident:1' })]), CMDTY, 10);
  const unreported = sellDispositionText(custodyState([custodyRecord()]), CMDTY, 10);
  const recovered = sellDispositionText(custodyState([custodyRecord({
    pods: [{ podIdentity: 'p1', status: 'player_collected', qty: 6, custodySourceKind: 'hostile_raider', sourceCustodianStableId: 'raider:key' }],
  })]), CMDTY, 10);
  const ordinary = sellDispositionText(custodyState([]), CMDTY, 10);

  assert.match(reported, /reported .*freight.*warrant ledger/);
  assert.match(unreported, /still .*freight.*custody open, no report logged/);
  assert.match(recovered, /recovered from raiders.*yours to settle/);
  assert.equal(ordinary, '');
  assert.notEqual(reported, unreported);
  assert.notEqual(unreported, recovered);
});

test('NXI-019: a partial collect still reports the record aggregate, bounded by the hold', () => {
  // collectFreightPod leaves a partially-collected pod live with qty = the rejected
  // remainder — the accepted units live only in record.playerCollectedQty.
  const record = custodyRecord({
    playerCollectedQty: 6,
    pods: [{ podIdentity: 'p1', status: 'live', qty: 4, custodySourceKind: 'lawful_carrier' }],
  });
  const rows = heldFreightCustodyRows(custodyState([record]), CMDTY, 10);
  assert.equal(rows.length, 1);
  assert.match(rows[0].text, /up to 6 u aboard/);
  // And the claim is bounded by what the hold actually carries — sold freight can't be claimed.
  const clamped = heldFreightCustodyRows(custodyState([record]), CMDTY, 3);
  assert.match(clamped[0].text, /up to 3 u aboard/);
});

test('NXI-019: owner names come from the faction table, never the machine key', () => {
  const rows = heldFreightCustodyRows(custodyState([custodyRecord()]), CMDTY, 10);
  assert.match(rows[0].text, /MTS freight/);
  assert.doesNotMatch(rows[0].text, /encounter:/);
  // Malformed provenance demotes to a generic claim, never a lawful one.
  const other = heldFreightCustodyRows(custodyState([custodyRecord({
    legalOwnerKind: 'other',
    legalOwnerFactionId: null,
    pods: [{ podIdentity: 'p1', status: 'player_collected', qty: 6, custodySourceKind: 'other_carrier' }],
  })]), CMDTY, 10);
  assert.match(other[0].text, /open freight claim/);
});

test('NXI-019: no open custody means silence; malformed state cannot throw', () => {
  assert.equal(sellDispositionText(custodyState([custodyRecord({ playerCollectedQty: 0 })]), CMDTY, 10), '');
  assert.equal(sellDispositionText({ encounterDirector: { stats: {} } }, CMDTY, 10), '');
  assert.equal(sellDispositionText({}, CMDTY, 10), '');
  assert.equal(sellDispositionText(null, CMDTY, 10), '');
  // Terminal custodies have settled — they leave the disposition sentence alone.
  assert.equal(sellDispositionText(custodyState([custodyRecord({ terminal: true })]), CMDTY, 10), '');
  // Nothing held — nothing to explain.
  assert.equal(sellDispositionText(custodyState([custodyRecord()]), CMDTY, 0), '');
});

test('NXI-019: two open custodies split the held stack in custody order', () => {
  const a = custodyRecord({ custodyId: 'custody:a', playerCollectedQty: 6 });
  const b = custodyRecord({ custodyId: 'custody:b', playerCollectedQty: 6 });
  const rows = heldFreightCustodyRows(custodyState([b, a]), CMDTY, 10);
  assert.equal(rows.length, 2);
  assert.match(rows[0].text, /up to 6 u aboard/);   // 'custody:a' sorts first
  assert.match(rows[1].text, /up to 4 u aboard/);   // the remainder is all that can trace to b
  // A third record is out of bounds — the sentence stays a sentence.
  const three = heldFreightCustodyRows(custodyState([b, a, custodyRecord({ custodyId: 'custody:c' })]), CMDTY, 20);
  assert.equal(three.length, 2);
});

test('NXI-019: mixed lineage takes the legally worse claim', () => {
  const mixed = custodyRecord({
    pods: [
      { podIdentity: 'p1', status: 'player_collected', qty: 3, custodySourceKind: 'hostile_raider' },
      { podIdentity: 'p2', status: 'live', qty: 2, custodySourceKind: 'lawful_carrier' },
    ],
  });
  const rows = heldFreightCustodyRows(custodyState([mixed]), CMDTY, 10);
  assert.match(rows[0].text, /still .* freight — custody open/);
  assert.doesNotMatch(rows[0].text, /yours to settle/);
});

test('NXI-019: a bare record (no envelope) still reads', () => {
  const rows = heldFreightCustodyRows({ encounterDirector: { stats: { openFreightCustodies: [custodyRecord()] } } }, CMDTY, 10);
  assert.equal(rows.length, 1);
});

test('NXI-019: a neighboring sealed-contract success is untouched', () => {
  // A fully-owned stack still reads as ordinary freight — the sealed manifest sells via
  // the existing reserved-units note, not this sentence.
  const rows = heldFreightCustodyRows(custodyState([]), CMDTY, 4);
  assert.deepEqual(rows, []);
});

test('NXI-031: a volatile held lot labels a hazard state, never a countdown', () => {
  const text = sellDispositionText({}, 'cmdty_fuel_cells', 5);
  assert.match(text, /Explosive class — stable while it rides/);
  // The done-when, literally: no explosion certainty, no fixed-seconds promise.
  assert.doesNotMatch(text, /\d+\s*s(ec(onds?)?)?\b/i);
  assert.doesNotMatch(text, /countdown|fuse|detonat|explode/i);
});

test('NXI-031: each volatile class speaks its own hazard; superdense never claims cook-off', () => {
  assert.match(sellDispositionText({}, 'cmdty_volatiles', 3), /Corrosive class/);
  assert.match(sellDispositionText({}, 'cmdty_ice_water', 3), /Cryogenic class/);
  const dense = sellDispositionText({}, 'cmdty_ore_goldium', 3);
  assert.match(dense, /Superdense class/);
  assert.doesNotMatch(dense, /cooks off|flashes/);
});

test('NXI-031: fragile handling shows; an ordinary stack stays silent', () => {
  assert.match(sellDispositionText({}, 'cmdty_art', 2), /fragile — hard impacts crack units/i);
  assert.equal(sellDispositionText({}, 'cmdty_ore_iron', 2), '');
  const rows = heldShipmentConditionRows({}, 'cmdty_scrap_metal');
  assert.deepEqual(rows, []);
});

test('NXI-031: a sold-out selection never keeps a hazard label', () => {
  assert.equal(sellDispositionText({}, 'cmdty_fuel_cells', 0), '');
});
