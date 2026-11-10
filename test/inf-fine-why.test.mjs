// inf-fine-why — the law desk's fine card names a bare number ("FINE 400 CR") and until now
// never said what the number was made of or what it answered for. The why clause reads the
// law's own price and the retained offer's assessed step, plus the heat owner's
// convicting-incident record through the same no-false-witness helper as the flight alert:
// suspicion without a receipt names nothing, and a clean or sub-threshold sheet gets no
// clause at all. The pinned substrings of the existing card copy still hold.

import test from 'node:test';
import assert from 'node:assert/strict';

import { fineWarrantDetail, fineWhyClause } from '../src/ui/impoundPayPrompt.js';
import { LAW_DOCK_FINE_BASE_CR, LAW_DOCK_FINE_PER_LEVEL_CR } from '../src/data/lawDeskTariff.js';
import { heatLevelFor } from '../src/systems/heat.js';

const SEED = 4242;

function state(heat, incident = null) {
  return {
    meta: { seed: SEED },
    player: { heat, credits: 1000, ...(incident ? { heatLastIncident: incident } : {}) },
  };
}

const OFFER = { amount: 250, heatLevel: 1, stationId: 'station_helios', status: 'open' };
const CONVICTION = {
  kind: 'unlawful_kill',
  incidentReceiptId: 'receipt-1',
  affected: 'hauler_7',
  affectedLabel: 'Honest Weight',
  witnessCount: 1,
  jurisdiction: 'station_helios',
  evidenceClass: 'witness',
  at: 100,
};

test('the why clause names the law price and the live heat step', () => {
  const heat = 0.45; // level 3
  const why = fineWhyClause(state(heat));
  assert.ok(why.includes(`${LAW_DOCK_FINE_BASE_CR} cr for the warrant`), 'the base is the law’s own base');
  assert.ok(why.includes(`${LAW_DOCK_FINE_PER_LEVEL_CR} cr for each heat step`), 'the step price is the law’s own');
  assert.ok(why.includes(`step ${heatLevelFor(heat)}`), 'the clause names the pilot’s own step');
  assert.equal(heatLevelFor(heat), 3);
  // The math the card quotes is the fine the desk assesses at that step.
  assert.equal(LAW_DOCK_FINE_BASE_CR + LAW_DOCK_FINE_PER_LEVEL_CR * 3, 450);
});

test('the why clause traces the conviction without inventing a witness', () => {
  const traced = fineWhyClause(state(0.2, CONVICTION));
  assert.ok(traced.includes('It answers for'), 'a recorded receipt is answered for');
  assert.ok(traced.includes('KILL'), 'the kind is named');
  assert.ok(traced.includes('HONEST WEIGHT'), 'the recorded party label is spoken, never the raw handle');
  assert.ok(traced.includes('1 WITNESS'), 'the law’s own witness basis rides along (singular as the alert spells it)');
  assert.ok(!traced.includes('hauler_7'), 'the raw entity handle is never printed');

  const suspected = fineWhyClause(state(0.14, null));
  assert.equal(suspected, '', 'suspicion without a receipt renders no clause');

  const suspectWithStaleRecord = fineWhyClause(state(0.14, CONVICTION));
  assert.equal(suspectWithStaleRecord, '', 'a sub-threshold sheet answers nothing, receipt or not');
});

test('a clean sheet and a missing player get no invented why', () => {
  assert.equal(fineWhyClause(state(0)), '');
  assert.equal(fineWhyClause({ player: { heat: Number.NaN } }), '');
  assert.equal(fineWhyClause(null), '');
  assert.equal(fineWhyClause({}), '');
});

test('the card detail carries the why after the pinned copy, on both card states', () => {
  const offered = fineWarrantDetail(OFFER, state(0.2, CONVICTION));
  assert.ok(offered.includes('Wire the 250 cr'), 'the assessed offer amount is retained');
  assert.ok(offered.includes('clears in 5s'), 'the pinned clear clock survives');
  assert.ok(offered.indexOf('clears in 5s') < offered.indexOf('The price is the read'),
    'the why reads after the warrant sentence');
  assert.ok(offered.includes('It answers for KILL'), 'the conviction rides the card');
  assert.ok(!offered.includes('sThe'), 'the clock and explanation have a sentence boundary');
  assert.ok(!offered.endsWith('..'), 'the receipt gets one final period');

  const working = fineWarrantDetail({ ...OFFER, status: 'working' }, state(0.2, CONVICTION));
  assert.ok(working.includes('The shift is running against the bill'), 'the pinned working copy survives');
  assert.ok(working.includes('The price is the read'), 'the working card carries the same why');
});

test('the composition clause stays honest when the constants move', () => {
  // The clause must be built FROM the constants, not from a copy of them.
  const heat = 0.2; // level 1
  const why = fineWhyClause(state(heat));
  const quotedTotal = LAW_DOCK_FINE_BASE_CR + LAW_DOCK_FINE_PER_LEVEL_CR * 1;
  assert.ok(why.includes(`${LAW_DOCK_FINE_BASE_CR} cr for the warrant plus ${LAW_DOCK_FINE_PER_LEVEL_CR} cr`));
  assert.equal(quotedTotal, 250, 'a level-1 sheet reads 250 cr on this seed’s law book');
  assert.ok(!why.includes(`${quotedTotal} cr for`), 'the clause names the parts, not a baked total');
});

test('a retained fine explains its assessed step after live heat changes', () => {
  const live = state(0.3, CONVICTION);
  assert.equal(heatLevelFor(live.player.heat), 2);
  const before = JSON.stringify(live);
  for (const status of ['offered', 'working']) {
    const detail = fineWarrantDetail({ amount: 450, heatLevel: 3, status }, live);
    assert.match(detail, /450 cr/);
    assert.match(detail, /assessed at step 3/);
    assert.ok(!detail.includes('assessed at step 2'));
  }
  assert.equal(JSON.stringify(live), before, 'explaining a retained offer never reprices the sheet');
});

test('a legacy or inconsistent offer does not invent a tariff breakdown', () => {
  for (const offer of [{ amount: 400 }, { amount: 450, heatLevel: 2 }, { amount: 450, heatLevel: -1 }]) {
    const detail = fineWarrantDetail(offer, state(0.3, CONVICTION));
    assert.ok(detail.includes(`${offer.amount} cr`), 'the actual offered bill is retained');
    assert.ok(!detail.includes('cr for the warrant'), 'unknown or mismatched assessment parts stay unknown');
  }
});
