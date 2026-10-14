import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDomainPathUpdate, configureDomainMirroring, createDomainDiffer,
  createDomainProbeChecker, DOMAIN_COLD_BYTES, DOMAIN_COLD_TICKS,
} from '../scripts/lib/simReadModel.mjs';

test('default cold mirrors spread recurring work without delaying initial or urgent values', () => {
  configureDomainMirroring({});
  const marketCount = DOMAIN_COLD_TICKS * 2 + 1;
  const payload = 'x'.repeat(DOMAIN_COLD_BYTES + 1);
  const state = {
    economy: { markets: Object.fromEntries(Array.from({ length: marketCount }, (_, i) => [
      `station${i}`, { payload, revision: 0 },
    ])) },
    fuel: { current: 20 },
    survivalDraftPublic: { payload, revision: 0 },
  };
  const differ = createDomainDiffer({ probe: true });
  const domains = new Map();
  const checker = createDomainProbeChecker(domains);
  const isMarket = update => update.segs[0] === 'economy' && update.segs[1] === 'markets';
  const lastShipped = new Map();
  let firstSignedBytes = 0;
  let maxSignedBytes = 0;

  for (let tick = 0; tick <= DOMAIN_COLD_TICKS * 2; tick++) {
    for (const market of Object.values(state.economy.markets)) market.revision = tick;
    state.fuel.current = 20 + tick;
    if (tick === 1) state.survivalDraftPublic = { payload, revision: 1 };
    const result = differ.diff(state, tick);
    const markets = result.updates.filter(isMarket);
    if (tick === 0) {
      assert.equal(markets.length, marketCount, 'the first reply must contain every market');
      firstSignedBytes = result.signedBytes;
    } else {
      assert.ok(markets.length <= 3, `tick ${tick} clustered ${markets.length} cold markets`);
      maxSignedBytes = Math.max(maxSignedBytes, result.signedBytes);
    }
    for (const update of markets) {
      const station = update.segs[2];
      const previous = lastShipped.get(station);
      if (previous !== undefined) assert.ok(tick - previous <= DOMAIN_COLD_TICKS);
      lastShipped.set(station, tick);
    }
    const touched = new Set();
    for (const update of result.updates) applyDomainPathUpdate(domains, update, touched);
    assert.deepEqual(checker.consume(result.probe).events, [], `probe drift at tick ${tick}`);
    assert.equal(domains.get('fuel').current, state.fuel.current, 'hot values remain immediate');
    if (tick === 1) assert.equal(domains.get('survivalDraftPublic').revision, 1,
      'new immutable draft receipts bypass the cold schedule');
  }
  assert.ok(maxSignedBytes < firstSignedBytes / 8, 'recurring signature work must avoid a cold burst');
  for (const lastTick of lastShipped.values()) {
    assert.ok(lastTick > DOMAIN_COLD_TICKS, 'every market refreshes within each cold interval');
  }

  delete state.economy.markets.station0;
  const result = differ.diff(state, DOMAIN_COLD_TICKS * 2 + 1);
  assert.ok(result.updates.some(update => update.del && update.segs[2] === 'station0'),
    'known market removal must not wait for its cold slot');
  const touched = new Set();
  for (const update of result.updates) applyDomainPathUpdate(domains, update, touched);
  assert.equal(Object.hasOwn(domains.get('economy').markets, 'station0'), false);
  assert.deepEqual(checker.consume(result.probe).events, []);
});
