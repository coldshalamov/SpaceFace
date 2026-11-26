// The sim worker's boot rehearsal must never reach the player's shared save store. Its storage
// writes land in the worker's lane shim (cleared before the real init), but the save stack also
// mirrors sf.save.* keys to the loopback store over the network, and nothing clears that: the
// rehearsal's checkpoint opening (a throwaway Swarm fight started at round 3) reached a brand-new
// player's title as "Resume round 3". The rehearsal now holds the store shut for its whole life,
// including its save system's async boot sync.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));

function stubStoreNetwork() {
  const saved = { location: globalThis.location, fetch: globalThis.fetch };
  const traffic = [];
  // A worker served over http(s) is what makes the store reachable (sharedPlayerStoreAvailable).
  globalThis.location = { protocol: 'http:', origin: 'http://127.0.0.1:9', host: '127.0.0.1:9', href: 'http://127.0.0.1:9/' };
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('__spaceface_player_store')) {
      const method = String(init.method || 'GET').toUpperCase();
      traffic.push({ method, keys: method === 'PUT' ? Object.keys(JSON.parse(init.body).keys || {}) : [] });
      return new Response(JSON.stringify({ ok: true, keys: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('', { status: 404 });
  };
  return {
    traffic,
    restore() {
      if (saved.location === undefined) delete globalThis.location; else globalThis.location = saved.location;
      globalThis.fetch = saved.fetch;
    },
  };
}

test('a held store reads as absent: nothing is fetched from it or mirrored to it until released', async () => {
  const net = stubStoreNetwork();
  try {
    const store = await import('../src/save/sharedPlayerStore.js');
    store.resetSharedPlayerStoreMemoForTests();
    const release = store.holdSharedPlayerStore();
    assert.equal(store.sharedPlayerStoreAvailable(), false);
    assert.equal(await store.pushSharedPlayerStore({ 'sf.save.crucible_meta': '{"resume":{"wave":2}}' }), false);
    assert.equal(await store.fetchSharedPlayerStore(), null);
    assert.deepEqual(net.traffic, [], 'no request reached the player store while held');
    release();
    release(); // idempotent: a double release cannot open a hold someone else still owns
    assert.equal(store.sharedPlayerStoreAvailable(), true);
    assert.equal(await store.pushSharedPlayerStore({ 'sf.save.crucible_meta': '{}' }), true);
    assert.equal(net.traffic.filter((r) => r.method === 'PUT').length, 1, 'the store works again once released');
  } finally {
    net.restore();
  }
});

test('the boot rehearsal fights without touching the player store, then the store opens for the real game', async () => {
  const net = stubStoreNetwork();
  try {
    const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
    const { rehearseSimWorkload } = await import('../scripts/lib/simRehearsal.mjs');
    const { sharedPlayerStoreAvailable } = await import('../src/save/sharedPlayerStore.js');
    const real = createSimHost(); // the worker builds its host at module load, before the rehearsal
    try {
      const receipt = await rehearseSimWorkload(createSimHost, { scenarioContract, steps: 60, budgetMs: 20000 });
      assert.equal(receipt.ok, true, JSON.stringify(receipt));
      // Let any async tail of the rehearsal host's save stack run before counting.
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.deepEqual(net.traffic, [], `the rehearsal reached the player store: ${JSON.stringify(net.traffic)}`);
      assert.equal(sharedPlayerStoreAvailable(), true, 'the rehearsal released its hold for the real game');
    } finally {
      real.shutdown();
    }
  } finally {
    net.restore();
  }
});
