// PQ-174.04 — arena laws change the top strategy.
//
// Done when: for each arena, the top build differs from the Foundry's, and the
// difference is visible in the results screen. Same kits, same sixty-second
// budget, fixed seed. If two non-Foundry arenas share a winner, that is the
// finding — do not fudge it.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ARENA_MODULE_LIBRARY, listArenaToys, validateArenaModuleLibrary } from '../src/data/arenaModuleLibrary.js';
import {
  ARENA_LAW_KITS,
  ARENA_LAW_WINDOW_S,
  ARENA_LAWS,
  FOUNDRY_ARENA_ID,
  PQ_174_04_SEED,
  arenaBuildMatrix,
  measureArenaYields,
  resultsCardForCell,
} from '../src/data/survivalArenas.js';
import { SURVIVAL_LIVE_CIRCUIT_ARENAS } from '../src/data/survivalWaves.js';
import { compactRunResult } from '../src/systems/survivalRecords.js';
import { buildCodeFor } from '../src/systems/survivalResults.js';
import { debrisLayoutForArena } from '../src/systems/swarmArena.js';

function printMatrix(matrix) {
  const header = ['arena', 'law', ...ARENA_LAW_KITS, 'top'].join('\t');
  console.log(`[pq-174.04 scenario seed ${matrix.seed} window ${matrix.windowS}s]`);
  console.log(header);
  for (const arenaId of matrix.arenas) {
    const block = matrix.byArena[arenaId];
    const scores = ARENA_LAW_KITS.map((kit) => {
      const cell = block.ranking.find((row) => row.kitId === kit);
      return String(cell.score);
    });
    console.log([arenaId, block.law.law, ...scores, block.top.kitId].join('\t'));
  }
}

test('library toys still validate after the law rooms stopped sharing Foundry furniture', () => {
  const check = validateArenaModuleLibrary();
  assert.equal(check.ok, true, JSON.stringify(check.issues));
  assert.equal(ARENA_MODULE_LIBRARY.length, 4);
});

test(`seed ${PQ_174_04_SEED}: each live arena's top kit differs from Foundry, and the results card shows it`, () => {
  const matrix = arenaBuildMatrix(PQ_174_04_SEED);
  printMatrix(matrix);
  assert.equal(matrix.seed, PQ_174_04_SEED);
  assert.equal(matrix.windowS, ARENA_LAW_WINDOW_S);
  assert.deepEqual(matrix.arenas, SURVIVAL_LIVE_CIRCUIT_ARENAS.slice());
  assert.ok(matrix.foundryTop, 'Foundry must name a top kit');

  const foundryCard = resultsCardForCell(matrix.byArena[FOUNDRY_ARENA_ID].top);
  console.log(`[pq-174.04] Foundry top ${matrix.foundryTop} score=${foundryCard.score} build=${foundryCard.buildCode}`);

  const shared = [];
  for (const arenaId of matrix.arenas) {
    if (arenaId === FOUNDRY_ARENA_ID) continue;
    const block = matrix.byArena[arenaId];
    const top = block.top;
    const card = resultsCardForCell(top);
    console.log(
      `[pq-174.04] ${arenaId} top=${top.kitId} score=${top.score} verb=${top.verb} `
      + `build=${card.buildCode} foundryDiff=${matrix.differsFromFoundry[arenaId]}`,
    );
    assert.equal(matrix.differsFromFoundry[arenaId], true, `${arenaId} top ${top.kitId} must differ from Foundry ${matrix.foundryTop}`);
    assert.notEqual(top.kitId, matrix.foundryTop);
    assert.equal(card.kitId, top.kitId);
    assert.equal(card.arenaId, arenaId);
    assert.notEqual(card.arenaId, FOUNDRY_ARENA_ID);
    assert.notEqual(card.score, foundryCard.score, `${arenaId} score must not match Foundry on the results card`);
    assert.equal(card.score, top.score);
    assert.equal(buildCodeFor(top.picks), top.buildCode);
    assert.notEqual(card.buildCode, foundryCard.buildCode, `${arenaId} build code must read differently than Foundry`);
    const compact = compactRunResult(card, { kind: 'survival', seed: PQ_174_04_SEED, arenaId, ruleset: 'swarm' }, []);
    assert.equal(compact.kitId, top.kitId);
    assert.equal(compact.arenaId, arenaId);
    for (const otherId of matrix.arenas) {
      if (otherId === FOUNDRY_ARENA_ID || otherId === arenaId) continue;
      if (matrix.byArena[otherId].top.kitId === top.kitId) shared.push(`${arenaId}=${otherId}:${top.kitId}`);
    }
  }
  if (shared.length) {
    console.log(`[pq-174.04] shared non-Foundry winners (honest): ${[...new Set(shared)].join('; ')}`);
  }
});

test('the rooms pay different verbs: Foundry banks, Lagrange slings, Cinder rides, Cryo plates, Storm conducts', () => {
  const foundry = measureArenaYields(FOUNDRY_ARENA_ID, PQ_174_04_SEED);
  const lagrange = measureArenaYields('lagrange_crucible', PQ_174_04_SEED);
  const cinder = measureArenaYields('cinder_sluice', PQ_174_04_SEED);
  const cryo = measureArenaYields('cryo_drift', PQ_174_04_SEED);
  const storm = measureArenaYields('storm_lattice', PQ_174_04_SEED);
  console.log('[pq-174.04 yields]', JSON.stringify({ foundry, lagrange, cinder, cryo, storm }));

  assert.ok(foundry.rockBank > lagrange.rockBank, 'Foundry banks must out-yield Lagrange rocks');
  assert.ok(foundry.rockBank > cinder.rockBank);
  assert.ok(foundry.plateBank === 0);
  assert.ok(lagrange.well > foundry.well, 'Lagrange wells must move marked mass');
  assert.ok(lagrange.sling > foundry.sling);
  assert.ok(cinder.ride > foundry.ride, 'Cinder current must out-ride Foundry');
  assert.ok(cinder.machinery > foundry.machinery);
  assert.ok(cryo.plateBank > foundry.plateBank, 'Cryo ice plates are the bank surface');
  assert.ok(storm.conduct > foundry.conduct);
  assert.equal(listArenaToys({ toys: [] }).length, 0);

  const banks = debrisLayoutForArena(FOUNDRY_ARENA_ID);
  const wells = debrisLayoutForArena('lagrange_crucible');
  assert.ok(banks.target > wells.target);
  assert.equal(ARENA_LAWS[FOUNDRY_ARENA_ID].verb, 'bank');
  assert.equal(ARENA_LAWS.lagrange_crucible.verb, 'sling');
  assert.equal(ARENA_LAWS.cinder_sluice.verb, 'ride');
  assert.equal(ARENA_LAWS.cryo_drift.verb, 'plate');
  assert.equal(ARENA_LAWS.storm_lattice.verb, 'conduct');
});
