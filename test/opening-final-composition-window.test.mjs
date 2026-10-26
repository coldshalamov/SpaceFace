import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { waitForOpeningCompositionSettled } from '../src/render/partsLibrary.js';
import { openingLoadPolicy } from '../src/render/openingLoadPolicy.js';

// Execute the actual final composition handoff without constructing a GPU. The broad cook
// has spent its work allowance; a completed boundary still needs two fresh observations.
const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
const start = source.indexOf('let finalOpening = opening;');
const result = 'return { skipped: false, resumed, opening: finalOpening, upgrades, pending, cook, leftover };';
const end = source.indexOf(result, start);
assert.ok(start > 0 && end > start);
const body = source.slice(start, end + result.length);

function fixture({ status = 'authored', supersede = false } = {}) {
  const player = { id: 1, isPlayer: true, alive: true, type: 'ship',
    pos: { x: 0, z: 0 }, mesh: { userData: { authoredAssetState: status } } };
  const state = { mode: 'loading', playerId: 1, entities: new Map([[1, player]]),
    entityList: [player], render: {}, world: { currentSectorId: 'test' } };
  const owner = {}, observations = [];
  let stale = false, yields = 0;
  const values = {
    state, opening: { settled: false, reason: 'timeout', pending: 1 }, recook: false,
    cookStale: () => stale, cookSuperseded: { skipped: true, reason: 'sector-superseded' },
    prepareNow: () => 30000, remainingMs: () => 400,
    loadPolicy: openingLoadPolicy({ shouldAwaitGpuCook: true, mode: 'loading' }),
    waitForOpeningCompositionSettled: (live, options) => waitForOpeningCompositionSettled(live, {
      ...options, request: () => { observations.push(status); return { requested: 0, ids: [] }; },
      pump() {},
    }),
    yieldAndFlushLiveSectorGpu: async () => {
      yields++;
      await delay(500); // A slow presented loading frame, not unfinished authored work.
      if (supersede) stale = true;
    },
    renderer: {}, scene: {}, meshes: new Map(), sectorId: 'test',
    recordOpeningCookStep() {}, console: { info() {}, warn() {} },
    resumed: true, upgrades: {}, pending: {}, cook: {}, leftover: {},
  };
  // Renderer methods access their captured state through this.
  owner._meshes = values.meshes;
  const run = new Function(...Object.keys(values), `return async function() { ${body} };`)(...Object.values(values)).bind(owner);
  return { run, owner, state, observations, get yields() { return yields; } };
}

test('a completed opening gets both final observations after the broad cook allowance is spent', async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.opening.settled, true, JSON.stringify(result.opening));
  assert.equal(f.observations.length, 2, 'a slow frame cannot replace the second fresh observation');
  assert.equal(f.yields, 1);
  assert.equal(f.state.render.sessionLiveSectorCookedId, 'test');
});

test('a missing boundary remains refused instead of turning a larger final window into admission', async () => {
  const f = fixture({ status: 'missing' });
  const result = await f.run();
  assert.equal(result.opening.settled, false);
  assert.equal(result.opening.pending, 1);
  assert.equal(f.state.render.sessionLiveSectorCookedId, undefined);
});

test('replacement during the final observation cannot stamp the new run', async () => {
  const f = fixture({ supersede: true });
  const result = await f.run();
  assert.equal(result.reason, 'sector-superseded');
  assert.equal(f.owner._sessionLiveSectorCookedId, undefined);
  assert.equal(f.state.render.openingCompositionSettle, undefined);
});
