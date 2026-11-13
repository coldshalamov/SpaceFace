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

test('a due scalar leaf retains exact signature bytes and publishes signed zero and kind changes', () => {
  configureDomainMirroring({});
  const differ = createDomainDiffer({ probe: true });
  const state = { run: { phase: 'active', wave: 1, spawnedThreat: 0 } };
  const segs = ['run', 'spawnedThreat'];
  const path = segs.join('.');
  const find = result => result.updates.find(update => update.segs.join('.') === path);
  const due = tick => {
    assert.equal(differ.invalidateLeaf(path), true);
    return differ.diff(state, tick);
  };
  const first = differ.diff(state, 0);
  const slot = differ.paths.get(path);
  assert.deepEqual(find(first), { segs, v: 0, bytes: 3 });
  const initialDigest = slot.digest;
  const unchanged = due(1);
  assert.equal(find(unchanged), undefined);
  assert.equal(slot.lastSign, 1, 'an unchanged due scalar still counts as signed');
  assert.equal(slot.bytes, 3);
  assert.equal(slot.digest, initialDigest);

  state.run.spawnedThreat = -0;
  const negativeZero = due(2);
  assert.deepEqual(find(negativeZero), { segs, v: -0, bytes: 4 });
  assert.notEqual(slot.digest, initialDigest);
  state.run.spawnedThreat = NaN;
  assert.deepEqual(find(due(3)), { segs, v: NaN, bytes: 5 });
  assert.equal(find(due(4)), undefined, 'a second NaN has the same wire signature');

  const mutable = { count: 0 };
  state.run.spawnedThreat = mutable;
  const objectBytes = canonicalSignature(mutable).length;
  assert.deepEqual(find(due(5)), { segs, v: { count: 0 }, bytes: objectBytes });
  mutable.count = 1;
  assert.deepEqual(find(due(6)), { segs, v: { count: 1 }, bytes: objectBytes });
  state.run.spawnedThreat = 0;
  assert.deepEqual(find(due(7)), { segs, v: 0, bytes: 3 });
  assert.equal(slot.digest, initialDigest);
});
