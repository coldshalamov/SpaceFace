import test from 'node:test';
import assert from 'node:assert/strict';

import { serviceQuote } from '../src/ui/station/serviceQuotes.js';
import { respawnToastText } from '../src/ui/hud.js';

// WF-07 (INFERENCE-23): hull insurance was a 500-cr purchase whose payoff lived only in dead
// code — the service row sold a "60% payout" that capped nothing the player could see, and the
// starter hull made the policy a literal no-op. The quote now prices recovery on the ACTIVE
// hull and the insured receipt names the credits it covered.

function insuredState(defId, insured, credits = 50000) {
  return {
    player: {
      credits,
      insurance: { rate: 0.6, deductibleCr: 500, insuredModules: insured, lastStationId: null },
      ownedShips: [{ defId }],
      activeShipIndex: 0,
    },
    ui: { docked: true, dockedStationId: 'station_helios' },
  };
}

test('insurance row prices recovery on the active hull', () => {
  const q = serviceQuote('insurance', insuredState('ship_pelican', false), null);
  assert.equal(q.disabled, false);
  assert.equal(q.cost, 500);
  assert.ok(q.detail.includes('Pelican'), q.detail);
  assert.ok(q.detail.includes('6,000'), q.detail);
  assert.ok(q.detail.includes('500'), q.detail);
  assert.ok(q.chips.some((c) => c.text.includes('saves 5,500')), JSON.stringify(q.chips));
});

test('starter hull tells the truth: the flat deductible applies either way', () => {
  const q = serviceQuote('insurance', insuredState('ship_kestrel', false), null);
  assert.equal(q.disabled, false);
  assert.ok(q.detail.includes('deductible'), q.detail);
  assert.ok(!q.detail.includes('uninsured →'), q.detail);
  assert.ok(!q.chips.some((c) => c.text.includes('saves')), JSON.stringify(q.chips));
});

test('active policy names the covered hull share and stays cancelable', () => {
  const q = serviceQuote('insurance', insuredState('ship_drifter', true), null);
  assert.equal(q.buttonLabel, 'Cancel');
  assert.ok(q.detail.includes('38,000'), q.detail);
  assert.ok(q.detail.includes('500'), q.detail);
  assert.ok(q.chips.some((c) => c.text.includes('covers 37,500')), JSON.stringify(q.chips));
});

test('respawn toast surfaces the live recovery receipt, not only the dead refund field', () => {
  const text = respawnToastText({
    stationId: 'station_helios',
    costCr: 500,
    insuranceStatus: 'INSURED · COVERED 5,500 CR',
    cargoLostQty: 3,
  });
  assert.ok(text.includes('500 cr'), text);
  assert.ok(text.includes('covered 5,500 cr'), text);
  assert.ok(text.includes('cargo lost 3u'), text);
});
