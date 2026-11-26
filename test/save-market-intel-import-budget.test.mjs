import assert from 'node:assert/strict';
import test from 'node:test';

import { SECTORS } from '../src/data/sectors.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import {
  preflightSaveImport as mainPreflight,
  SAVE_IMPORT_MAX_BYTES,
  SAVE_IMPORT_MAX_NODES,
} from '../src/save/saveSystem.js';
import { preflightSaveImport as workerPreflight } from '../src/save/saveWorker.js';

test('all authored station market memories fit both bounded save import paths', () => {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 7332 });
  try {
    const economy = runtime.getSystem('economy');
    economy.newGame();

    // These are the same owner calls used as sectors enter and the player docks or receives a
    // market-data survey. Every included id comes from shipped sector content, not a synthetic
    // oversize payload.
    for (const sector of SECTORS) economy.populateSector({ sectorId: sector.id });
    const stationIds = SECTORS.flatMap((sector) => (sector.stations || []).map((station) => station.id));
    for (const stationId of stationIds) economy.snapshotIntel(stationId);

    const data = runtime.getSystem('save').serializeData();
    const envelope = { fmt: 'spaceface-save', version: 1, data };
    const encodedLength = JSON.stringify(envelope).length;
    const main = mainPreflight(envelope);

    assert.equal(SAVE_IMPORT_MAX_NODES, 500_000);
    // 6fddfd284f: the closed-form listing now covers all 35 authored stations — the count is
    // incidental; the claim under test is that every one fits the bounded import budget.
    assert.equal(Object.keys(data.economy.marketIntel).length, 35);
    assert.equal(Object.keys(data.player.marketMemory).length, 35);
    assert.ok(main.ok, `canonical owner snapshot should fit the new bounded node ceiling: ${JSON.stringify(main)}`);
    // 6fddfd284f: stored-curve markets shrunk the same intel ~5x — the envelope no longer
    // crosses the retired 200k ceiling. The floor below still proves the fixture is the real
    // authored world, not a token payload; the oversize rejection below proves the bound bites.
    assert.ok(main.nodes > 30_000, `fixture must carry the full authored world: ${main.nodes}`);
    assert.ok(main.nodes < SAVE_IMPORT_MAX_NODES);
    assert.ok(encodedLength < SAVE_IMPORT_MAX_BYTES, 'node headroom does not relax the independent byte limit');
    assert.deepEqual(workerPreflight(envelope), main, 'main and worker import gates must agree');

    const overBudget = {
      fmt: 'spaceface-save',
      version: 1,
      data: { buckets: Array.from({ length: 11 }, () => new Array(50_000).fill(0)) },
    };
    const rejected = mainPreflight(overBudget);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, 'import_node_limit');
    assert.equal(rejected.limit, SAVE_IMPORT_MAX_NODES);
    assert.deepEqual(workerPreflight(overBudget), rejected, 'the 500k node bound remains enforced by the worker');
  } finally {
    runtime.dispose();
  }
});
