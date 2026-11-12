import test from 'node:test';
import assert from 'node:assert/strict';

import { automation } from '../src/systems/automation.js';

// INF-087: a distressed (upkeep-stalled) trader card must be actionable — Resume settles
// upkeep arrears immediately instead of leaving the player watching a frozen pill.
function boot({ credits, debt, status, prevStatus }) {
  const state = {
    player: { credits },
    automation: {
      traders: [{
        id: 'au_1', defId: 'trader_hauler', status,
        _prevStatus: prevStatus,
        route: { from: 'station_a', to: 'station_b', good: 'ore_iron' },
      }],
      accumulators: { upkeepDebt: debt },
      meta: { graceTimer: 42 },
    },
  };
  const emitted = [];
  const inst = Object.create(automation);
  Object.assign(inst, {
    state,
    bus: {
      emit(ev, p) {
        emitted.push({ ev, p });
        if (ev === 'economy:chargeCredits') state.player.credits -= p.amount;
      },
    },
    helpers: {},
  });
  return { state, inst, emitted };
}

test('INF-087 resumeTrader settles arrears and restores the pre-distress status', () => {
  const { state, inst, emitted } = boot({ credits: 500, debt: 37.6, status: 'distressed', prevStatus: 'enroute' });
  const ok = inst.handleOrder({ order: 'resumeTrader', shipId: 'au_1' });
  assert.equal(ok, true);
  const t = state.automation.traders[0];
  assert.equal(t.status, 'enroute');
  assert.equal(t._prevStatus, undefined);
  assert.equal(state.player.credits, 500 - 37);
  assert.ok(state.automation.accumulators.upkeepDebt < 1);
  assert.equal(state.automation.meta.graceTimer, 0);
  const charge = emitted.find((e) => e.ev === 'economy:chargeCredits');
  assert.equal(charge.p.reason, 'automation:upkeep');
  assert.ok(emitted.some((e) => e.ev === 'automation:assetResumed' && e.p.id === 'au_1'));
});

test('INF-087 resumeTrader fails closed when credits cannot cover arrears', () => {
  const { state, inst } = boot({ credits: 5, debt: 37, status: 'distressed', prevStatus: 'enroute' });
  const ok = inst.resumeTrader('au_1');
  assert.equal(ok, false);
  assert.equal(state.automation.traders[0].status, 'distressed');
  assert.equal(state.player.credits, 5);
  assert.equal(state.automation.accumulators.upkeepDebt, 37);
});

test('INF-087 resumeTrader ignores traders that are not stalled', () => {
  const { state, inst } = boot({ credits: 500, debt: 0, status: 'enroute', prevStatus: undefined });
  assert.equal(inst.resumeTrader('au_1'), false);
  assert.equal(state.automation.traders[0].status, 'enroute');
  assert.equal(inst.resumeTrader('au_missing'), false);
});

test('INF-087 resumeTrader with no arrears still unfreezes for free', () => {
  const { inst, state } = boot({ credits: 500, debt: 0.4, status: 'distressed', prevStatus: 'idle' });
  assert.equal(inst.resumeTrader('au_1'), true);
  assert.equal(state.automation.traders[0].status, 'idle');
  assert.equal(state.player.credits, 500);
});
