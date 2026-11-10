import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { custodyConsequences } from '../src/systems/custodyConsequences.js';

function boot(t) {
  const state = { player: {}, meta: { seed: 47 }, simTime: 40,
    world: { currentSectorId: 'sector_tethys_junction' } };
  const bus = createBus();
  const owner = { ...custodyConsequences };
  owner.init({ state, bus, helpers: {} });
  t.after(() => owner.destroy());
  const post = (billId, owedCr) => bus.emit('law:impoundPosted', { billId, owedCr });
  const close = (billId, method, more = {}) => bus.emit('law:impoundRecovered', {
    accepted: true, source: 'lawSecurity', billId, method, t: state.simTime, ...more,
  });
  return { state, bus, post, close, bill: () => state.player.custodyLedger.impound };
}

test('replayed recovery of a previous impound never discharges the currently open bill', (t) => {
  const h = boot(t);
  h.post('old-yard', 1200);
  h.close('old-yard', 'pay');
  h.post('new-yard', 1800);
  h.bus.emit('law:impoundWorked', { billId: 'new-yard', dt: 1 });
  const before = structuredClone(h.bill());
  for (const method of ['pay', 'work', 'steal']) h.close('old-yard', method);
  assert.deepEqual(h.bill(), before);
  assert.equal(h.bill().status, 'open');
  assert.equal(h.bill().remainingCr, 1350, 'the current yard retains its earned credit and remaining debt');
  h.close('new-yard', 'work');
  assert.equal(h.bill().status, 'worked');
  assert.equal(h.bill().remainingCr, 0);
});

for (const [method, status, remaining] of [['pay', 'paid', 0], ['work', 'worked', 0], ['steal', 'stolen', 1200]]) {
  test(`a matching native ${method} recovery closes only its own impound`, (t) => {
    const h = boot(t);
    h.post('current-yard', 1200);
    h.close('current-yard', method);
    assert.equal(h.bill().status, status);
    assert.equal(h.bill().remainingCr, remaining);
    const settled = structuredClone(h.bill());
    h.close('current-yard', method);
    assert.deepEqual(h.bill(), settled, 'the terminal receipt stays once-only');
  });
}

test('unbound or unauthorised recovery receipts cannot settle a current bill', (t) => {
  const h = boot(t);
  h.post('current-yard', 1200);
  const before = structuredClone(h.bill());
  h.close(undefined, 'pay');
  h.close('', 'pay');
  h.close('current-yard', 'pay', { accepted: false });
  h.close('current-yard', 'pay', { source: 'old-prompt' });
  assert.deepEqual(h.bill(), before);
});
