import test from 'node:test';
import assert from 'node:assert/strict';
import { addCargo } from '../src/systems/cargo.js';
import { starvedIndustryNeedFor } from '../src/systems/economy.js';
import { tradeClearedReceipt } from '../src/ui/station/tradeReceipt.js';
import { economyScenario, STATION, GOOD } from './helpers/infEconomyScenario.mjs';

test('ECON-10 seed 4242: a shortage sale pays its posted quote and names the included premium once', () => {
  const h = economyScenario();
  try {
    for (const entry of Object.values(h.market)) entry.stock = entry.baseEq;
    const ordinary = h.econ.quote(STATION, GOOD, 'sell', 10);
    h.market[GOOD].stock = 1;
    assert.equal(starvedIndustryNeedFor('refinery', 1, h.market).inputId, GOOD);
    addCargo(h.state, GOOD, 10);
    const posted = h.econ.quote(STATION, GOOD, 'sell', 10);
    assert.ok(posted.total > ordinary.total, 'the existing price curve pays more for scarce feedstock');
    assert.equal(posted.shortagePremium, true);
    const before = h.state.player.credits;
    h.bus.emit('ui:sell', { commodityId: GOOD, qty: 10, expectedTotal: posted.total });
    assert.equal(h.state.player.credits - before, posted.total, 'premium is included, never paid twice');
    assert.equal(h.market[GOOD].stock, 11, 'the sale feeds the posted shortage');
    assert.equal(h.events.length, 1);
    const receipt = tradeClearedReceipt(h.state, h.events[0]);
    assert.equal(receipt.detail, `+${posted.total.toLocaleString('en-US')} cr · shortage premium included`);
    assert.equal((receipt.detail.match(/shortage premium/g) || []).length, 1);

    h.market[GOOD].stock = h.market[GOOD].baseEq;
    addCargo(h.state, GOOD, 10);
    const normal = h.econ.quote(STATION, GOOD, 'sell', 10);
    assert.notEqual(normal.shortagePremium, true);
    h.bus.emit('ui:sell', { commodityId: GOOD, qty: 10, expectedTotal: normal.total });
    assert.equal(h.events.length, 2);
    assert.doesNotMatch(tradeClearedReceipt(h.state, h.events[1]).detail, /premium/i);
  } finally { h.sim.dispose(); }
});
