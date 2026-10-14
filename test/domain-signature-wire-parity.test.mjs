import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDomainPathUpdate, canonicalSignature, configureDomainMirroring,
  createDomainDiffer, createDomainProbeChecker, DOMAIN_COLD_TICKS,
} from '../scripts/lib/simReadModel.mjs';

test('production signature comparison preserves complete probe wire values through mutation and reset', () => {
  configureDomainMirroring({});
  const state = {
    fuel: { current: 20 },
    player: { credits: 100, cargo: { ore: 2 } },
    run: { kind: 'survival', phase: 'active', wave: 1 },
    economy: { markets: { station: { history: Array.from({ length: 64 }, (_, tick) => ({ tick, price: 100 + tick })) } } },
    combat: { attachments: { byId: { line: { restLength: 80, state: 'active' } } } },
  };
  const production = createDomainDiffer();
  const probed = createDomainDiffer({ probe: true });
  const mirror = new Map();
  const checker = createDomainProbeChecker(mirror);
  for (let tick = 0; tick <= DOMAIN_COLD_TICKS * 2; tick++) {
    state.fuel.current = tick;
    if (tick === 3) state.player.cargo.ore = 0;
    if (tick === 5) state.economy.markets.station.history[0].price = 777;
    if (tick === 7) state.combat.attachments.byId.line.restLength = 18;
    if (tick === 11) state.run = null;
    if (tick === 12) state.run = { kind: 'survival', phase: 'draft', wave: 2 };
    if (tick === 13) state.run = null;
    if (tick === 15) delete state.player.cargo.ore;
    if (tick === 21) delete state.economy.markets.station;
    if (tick === 35) state.economy.markets.station = { history: [{ tick, price: 12 }] };
    const live = production.diff(state, tick);
    const diagnostic = probed.diff(state, tick);
    assert.deepEqual(live.updates, diagnostic.updates, `wire at reply ${tick}`);
    assert.equal(live.shipBytes, diagnostic.shipBytes);
    assert.equal(live.signedBytes, diagnostic.signedBytes);
    assert.equal(live.probe, null);
    for (const update of live.updates) applyDomainPathUpdate(mirror, update, new WeakSet());
    assert.deepEqual(checker.consume(diagnostic.probe).events, [], `probe at reply ${tick}`);
  }
  assert.equal(canonicalSignature(mirror.get('economy')), canonicalSignature(state.economy));
  assert.deepEqual(mirror.get('player'), state.player);
  assert.equal(mirror.get('run'), null);
});
