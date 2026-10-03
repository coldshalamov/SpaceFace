// FB-042 — a declared war is one cited headline. A skirmish under the threshold is not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createMarketNews } from '../src/ui/marketNews.js';
import { declaredWarHeadline } from '../src/ui/worldNewsBeats.js';

test('war at the threshold is news and a lower tension is not', () => {
  assert.equal(declaredWarHeadline({ pairKey: 'a:b', sides: ['A', 'B'], tension: 10 }), null);
  const headline = declaredWarHeadline({ pairKey: 'faction_scn:faction_dmc', sides: ['Concord', 'Drift'] });
  assert.match(headline.text, /war/);
  assert.ok(headline.sourceRef.includes('faction_scn:faction_dmc'));
  const state = { simTime: 0, meta: { seed: 4242 }, ui: {} };
  const bus = createBus();
  createMarketNews({ state, bus, helpers: { voice: { say: () => false } } });
  bus.emit('conflict:warDeclared', { pairKey: 'faction_scn:faction_dmc', sides: ['Concord', 'Drift'], tension: 40 });
  assert.equal(state.ui.marketNews.log.length, 0);
  bus.emit('conflict:warDeclared', { pairKey: 'faction_scn:faction_dmc', sides: ['Concord', 'Drift'] });
  assert.equal(state.ui.marketNews.log.length, 1);
  assert.ok(state.ui.marketNews.log[0].sourceRef);
});
