/**
 * Structural preload/cache/readiness ordering (ASSET-STARTUP-STRUCTURAL-PRELOAD-GROK-001).
 *
 * Locks the boot gate contract without a browser:
 *   1. Soft-failed / empty preload payloads are not "ready"
 *   2. The player hull must be present; opening-runway entities use live-boundary admission
 *   3. Rejected library promises must not stick in the per-renderer cache forever
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  authoredBootstrapPreloadPlan,
  isAuthoredPartLibraryUsable,
  PART_LIBRARY_CONTRACT,
} from '../src/render/partsLibrary.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAIN_JS = path.join(ROOT, 'src', 'main.js');
const PARTS_LIBRARY_JS = path.join(ROOT, 'src', 'render', 'partsLibrary.js');

function testUsableLibraryRejectsNullAndEmpty() {
  assert.equal(isAuthoredPartLibraryUsable(null), false, 'null soft-fail is not usable');
  assert.equal(isAuthoredPartLibraryUsable(undefined), false, 'undefined is not usable');
  assert.equal(isAuthoredPartLibraryUsable({}), false, 'plain object is not a library map');
  assert.equal(isAuthoredPartLibraryUsable(new Map()), false, 'empty map is not usable');
  assert.equal(
    isAuthoredPartLibraryUsable(new Map([['hull', []]])),
    false,
    'zero hull records is not usable',
  );
}

function testUsableLibraryRequiresBootCriticalAssets() {
  const plan = authoredBootstrapPreloadPlan();
  const modularOnly = new Map([['hull', [{
    url: `${PART_LIBRARY_CONTRACT.releaseRoot}hulls/hull_starter.glb`,
    assetId: 'SF_HULL_STARTER',
  }]]]);
  assert.equal(
    isAuthoredPartLibraryUsable(modularOnly),
    false,
    'an unrelated modular hull must not satisfy player readiness',
  );

  const playerOnly = new Map([['hull', plan.hull.map((file) => ({
    url: `${PART_LIBRARY_CONTRACT.releaseRoot}${file}`,
    assetId: 'SF_K0_KESTREL_BORROWED_TIME',
  }))]]);
  assert.equal(isAuthoredPartLibraryUsable(playerOnly), true,
    'the exact player body satisfies bootstrap while opening-runway entities own their residency');

  const complete = new Map(Object.entries(plan).map(([slot, files]) => [slot, files.map((file) => ({
    url: `${PART_LIBRARY_CONTRACT.releaseRoot}${file}`,
  }))]));
  assert.equal(isAuthoredPartLibraryUsable(complete), true,
    'the scoped player bootstrap plan satisfies the boot gate');
}

/**
 * Mirrors main.js waitForAuthoredPartLibrary settlement semantics without booting the game.
 * The previous bug treated any fulfillment (including null) as ready.
 */
async function waitForAuthoredPartLibraryContract(readyPromise, isUsable, timeoutMs = 50) {
  if (!readyPromise || typeof readyPromise.then !== 'function') return false;
  return Promise.race([
    readyPromise.then(
      (value) => isUsable(value),
      () => false,
    ),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

async function testWaitGateRequiresUsablePayload() {
  const softFail = Promise.resolve(null);
  const rejected = Promise.reject(new Error('decoder failed'));
  // Prevent unhandled rejection noise; gate must still observe the rejection path.
  rejected.catch(() => {});
  const empty = Promise.resolve(new Map([['hull', []]]));
  const ok = Promise.resolve(new Map(Object.entries(authoredBootstrapPreloadPlan())
    .map(([slot, files]) => [slot, files.map((file) => ({
      url: `${PART_LIBRARY_CONTRACT.releaseRoot}${file}`,
    }))])));

  assert.equal(await waitForAuthoredPartLibraryContract(softFail, isAuthoredPartLibraryUsable), false,
    'soft-failed null preload must not pass the boot gate');
  assert.equal(await waitForAuthoredPartLibraryContract(rejected, isAuthoredPartLibraryUsable), false,
    'rejected preload must not pass the boot gate');
  assert.equal(await waitForAuthoredPartLibraryContract(empty, isAuthoredPartLibraryUsable), false,
    'empty hull cache must not pass the boot gate');
  assert.equal(await waitForAuthoredPartLibraryContract(ok, isAuthoredPartLibraryUsable), true,
    'usable library payload must pass the boot gate');
}

/**
 * Structural pattern regression: a rejected library promise must leave the cache so a later
 * attempt can run. Before the fix, promises.set(key, rejected) permanently poisoned retries.
 */
async function testRejectedLibraryPromiseIsNotSticky() {
  const promises = new Map();
  const partRoot = 'assets/ships/release/parts/';

  function loadOnce(shouldFail) {
    let promise = promises.get(partRoot);
    if (!promise) {
      const pending = shouldFail
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(new Map([['hull', [{ url: `${partRoot}hulls/hull_starter.glb` }]]]));
      promise = pending.then(
        (library) => library,
        (error) => {
          if (promises.get(partRoot) === promise) promises.delete(partRoot);
          throw error;
        },
      );
      promises.set(partRoot, promise);
    }
    return promise;
  }

  await assert.rejects(() => loadOnce(true), /boom/);
  assert.equal(promises.has(partRoot), false, 'failed load must drop the cached promise');

  const recovered = await loadOnce(false);
  assert.equal(recovered.get('hull').length, 1, 'retry after failure must be able to succeed');
  assert.equal(promises.has(partRoot), true, 'successful load remains cached');
}

function testMainAndPartsLibraryWireTheUsabilityGate() {
  const mainSrc = readFileSync(MAIN_JS, 'utf8');
  const partsSrc = readFileSync(PARTS_LIBRARY_JS, 'utf8');
  assert.match(mainSrc, /isAuthoredPartLibraryUsable/,
    'main boot gate must import/use isAuthoredPartLibraryUsable');
  assert.match(mainSrc, /isAuthoredPartLibraryUsable\(value\)/,
    'waitForAuthoredPartLibrary must inspect the settled payload, not ignore it');
  assert.match(partsSrc, /export function isAuthoredPartLibraryUsable/,
    'partsLibrary must export the usability predicate');
  assert.match(partsSrc, /promises\.delete\(cacheKey\)/,
    'loadCanonicalLibrary must drop failed promises so retries are not sticky');
  assert.match(partsSrc, /invalidateFailedAuthoredAssets/,
    'retry must evict inner fulfilled-null loader tasks, not only the outer library promise');
  assert.match(partsSrc, /assertLibraryPlanUsable/,
    'preload must refuse to publish an unusable library into the resolved cache');
  assert.match(partsSrc, /loadPlanIntoLibrary/,
    'boot and entity admission must share the bounded preload planner');
  assert.doesNotMatch(partsSrc, /Promise\.all\(batch\.map/,
    'resolved-library upgrades must not decode every queued ship in one burst');
  assert.match(partsSrc, /One entity admission per frame/,
    'post-boot authored upgrades must stay frame-bounded');
  assert.match(mainSrc, /authoredCriticalVisualReadiness/,
    'flight readiness must be scoped to the player and current-sector critical landmark');
  assert.doesNotMatch(mainSrc, /allLiveShipsAuthored\s*&&\s*queueIdle/,
    'noncritical NPC residency and global queue drain must not hold the flight gate');
}

testUsableLibraryRejectsNullAndEmpty();
testUsableLibraryRequiresBootCriticalAssets();
await testWaitGateRequiresUsablePayload();
await testRejectedLibraryPromiseIsNotSticky();
testMainAndPartsLibraryWireTheUsabilityGate();
console.log('asset-startup-structural-preload: ok');
