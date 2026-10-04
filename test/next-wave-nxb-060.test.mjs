import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createRunTransitionGuard } from '../src/core/runTransitionGuard.js';
import {
  describeGameStartFailure,
  runNewGameStartTransition,
} from '../src/core/newGameStartTransition.js';
import {
  classifyRequiredPackageAdmission,
  settleRequiredPackageAdmission,
  waitForOpeningGpuResources,
} from '../src/render/pipelineReadiness.js';

function loadingState(render, world) {
  return {
    mode: 'loading',
    world: world || { currentSectorId: 'sector_helios_prime' },
    render,
  };
}

function defer() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function until(predicate, label) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(label || 'condition was not reached');
}

test('a rejected package stays rejected when the live cook fulfills and New Game does not launch', async () => {
  const guard = createRunTransitionGuard();
  const token = guard.begin('new-game');
  const timeline = [];
  const state = loadingState({
    admissionRunGeneration: token.generation,
    prepareOpeningGpuResources: async () => {
      timeline.push('prepare');
      throw new Error('ship_kestrel content-hash mismatch');
    },
    prepareLiveSectorBeforeFlight: async () => {
      timeline.push('live-sector');
      return { skipped: false };
    },
  });
  let flights = 0;
  let discarded = 0;

  await assert.rejects(
    runNewGameStartTransition({
      guard,
      token,
      prepareRun() {},
      discardRun() { discarded += 1; },
      waitForLibrary: () => true,
      waitForVisuals: () => true,
      waitForWarmup: () => true,
      waitForGpuResources: () => waitForOpeningGpuResources(state, 1000),
      readPackageAdmission: () => state.render.requiredPackageAdmission,
      awaitSettledPackageAdmission: () => settleRequiredPackageAdmission(state),
      enterFlight() { flights += 1; },
    }),
    (error) => {
      assert.equal(error.code, 'GPU_RESIDENCY_UNAVAILABLE');
      assert.equal(error.retryable, true);
      const failure = describeGameStartFailure(error);
      assert.match(failure.text, /Retry Launch/);
      assert.match(failure.text, /ship_kestrel/);
      assert.match(failure.text, /content-hash mismatch/);
      return true;
    },
  );

  const record = state.render.requiredPackageAdmission;
  assert.equal(record.status, 'rejected');
  assert.equal(record.ready, false);
  assert.equal(record.packageId, 'ship_kestrel');
  assert.match(record.reason, /content-hash mismatch/);
  assert.deepEqual(timeline, ['prepare', 'live-sector']);
  assert.equal(flights, 0);
  assert.equal(discarded, 1);

  const later = classifyRequiredPackageAdmission({
    capturedGeneration: token.generation,
    currentGeneration: token.generation,
    existing: record,
    settled: { ok: true, value: { skipped: false, packageId: 'ship_kestrel' } },
  });
  assert.equal(later.status, 'rejected');
  assert.equal(later.ready, false);
  assert.equal(later.publish, false);
});

test('a timed-out opening package is not ready and New Game waits for the cook already in flight', async () => {
  const guard = createRunTransitionGuard();
  const token = guard.begin('new-game');
  const prepare = defer();
  const timeline = [];
  const progress = [];
  const state = loadingState({
    admissionRunGeneration: token.generation,
    prepareOpeningGpuResources: () => {
      timeline.push('prepare-started');
      return prepare.promise;
    },
    prepareLiveSectorBeforeFlight: async () => {
      timeline.push('live-sector');
      return { skipped: false, packageId: 'ship_kestrel' };
    },
  });
  let flights = 0;
  const pending = runNewGameStartTransition({
    guard,
    token,
    prepareRun() {},
    waitForLibrary: () => true,
    waitForVisuals: () => true,
    waitForWarmup: () => true,
    waitForGpuResources: () => waitForOpeningGpuResources(state, 40),
    readPackageAdmission: () => state.render.requiredPackageAdmission,
    awaitSettledPackageAdmission: () => settleRequiredPackageAdmission(state),
    reportProgress(stage) { progress.push(stage); },
    enterFlight() { flights += 1; },
  });

  await until(() => progress.some((stage) => stage.id === 'gpu-resources' && stage.detail === 'The opening package is still preparing'));
  assert.equal(flights, 0);
  assert.equal(state.render.requiredPackageAdmission.status, 'pending');
  assert.equal(state.render.requiredPackageAdmission.ready, false);
  assert.notEqual(state.render.requiredPackageAdmission.status, 'rejected');
  assert.ok(timeline.includes('live-sector'));

  prepare.resolve({ skipped: false, packageId: 'ship_kestrel' });
  assert.deepEqual(await pending, { stale: false, enteredFlight: true });
  assert.equal(flights, 1);
  assert.equal(state.render.requiredPackageAdmission.status, 'accepted');
  assert.equal(state.render.requiredPackageAdmission.ready, true);
  assert.equal(state.render.requiredPackageAdmission.packageId, 'ship_kestrel');
});

test('a replaced run cannot publish its package into the run that superseded it', async () => {
  const guard = createRunTransitionGuard();
  const token = guard.begin('first-launch');
  const newer = {
    status: 'rejected',
    ready: false,
    packageId: 'ship_kestrel',
    reason: 'ship_kestrel content-hash mismatch',
    generation: token.generation + 1,
  };
  const called = [];
  const state = loadingState({
    admissionRunGeneration: token.generation,
    requiredPackageAdmission: null,
    prepareOpeningGpuResources: async () => {
      state.render.admissionRunGeneration = newer.generation;
      state.render.requiredPackageAdmission = { ...newer };
      guard.begin('replacement-launch');
      return { skipped: false, packageId: 'ship_mule' };
    },
    prepareLiveSectorBeforeFlight: async () => {
      called.push('live-sector');
      return { skipped: false, packageId: 'ship_mule' };
    },
  });
  let flights = 0;
  const result = await runNewGameStartTransition({
    guard,
    token,
    prepareRun() {},
    waitForLibrary: () => true,
    waitForVisuals: () => true,
    waitForWarmup: () => true,
    waitForGpuResources: () => waitForOpeningGpuResources(state, 1000),
    readPackageAdmission: () => state.render.requiredPackageAdmission,
    awaitSettledPackageAdmission: () => settleRequiredPackageAdmission(state),
    enterFlight() { flights += 1; },
  });

  assert.equal(result.stale, true);
  assert.equal(result.enteredFlight, false);
  assert.equal(flights, 0);
  assert.deepEqual(called, []);
  assert.equal(state.render.requiredPackageAdmission.packageId, 'ship_kestrel');
  assert.equal(state.render.requiredPackageAdmission.status, 'rejected');
  assert.equal(state.render.requiredPackageAdmission.ready, false);
  assert.equal(state.render.requiredPackageAdmission.generation, newer.generation);
});

test('a sector stamp from another run is not ready until this run accepts the package', async () => {
  const called = [];
  const state = loadingState({
    admissionRunGeneration: 3,
    requiredPackageAdmission: {
      status: 'accepted',
      ready: true,
      packageId: 'ship_kestrel',
      reason: '',
      generation: 1,
    },
    sessionLiveSectorCookedId: 'sector_helios_prime',
    prepareOpeningGpuResources: async () => {
      called.push('prepare');
      return { skipped: false, packageId: 'ship_kestrel' };
    },
    prepareLiveSectorBeforeFlight: async () => {
      called.push('live-sector');
      return { skipped: false };
    },
  });
  assert.equal(await waitForOpeningGpuResources(state, 1000), true);
  assert.deepEqual(called, ['prepare', 'live-sector']);
  assert.equal(state.render.requiredPackageAdmission.status, 'accepted');
  assert.equal(state.render.requiredPackageAdmission.ready, true);
  assert.equal(state.render.requiredPackageAdmission.generation, 3);
  assert.equal(state.render.requiredPackageAdmission.packageId, 'ship_kestrel');
});

test('an accepted package with no id still resumes after the sector is stamped', async () => {
  const state = loadingState({
    admissionRunGeneration: 5,
    prepareOpeningGpuResources: async () => ({ skipped: false }),
    prepareLiveSectorBeforeFlight: async () => ({ skipped: false }),
  });
  assert.equal(await waitForOpeningGpuResources(state, 1000), true);
  assert.equal(state.render.requiredPackageAdmission.status, 'accepted');
  assert.equal(state.render.requiredPackageAdmission.ready, true);
  assert.equal(state.render.requiredPackageAdmission.packageId, null);

  const called = [];
  state.render.sessionLiveSectorCookedId = 'sector_helios_prime';
  state.render.prepareOpeningGpuResources = async () => {
    called.push('prepare');
    return { skipped: false };
  };
  state.render.prepareLiveSectorBeforeFlight = async () => {
    called.push('live-sector');
    return { skipped: false };
  };
  assert.equal(await waitForOpeningGpuResources(state, 1000), true);
  assert.deepEqual(called, ['live-sector']);
  assert.equal(state.render.requiredPackageAdmission.status, 'accepted');
  assert.equal(state.render.requiredPackageAdmission.ready, true);
  assert.equal(state.render.requiredPackageAdmission.packageId, null);
});

test('a pending admission stays pending when the sector stamp appears', async () => {
  const state = loadingState({
    admissionRunGeneration: 6,
    prepareOpeningGpuResources: () => new Promise(() => {}),
    prepareLiveSectorBeforeFlight: async () => ({ skipped: false }),
  });
  assert.equal(await waitForOpeningGpuResources(state, 30), false);
  assert.equal(state.render.requiredPackageAdmission.status, 'pending');
  assert.equal(state.render.requiredPackageAdmission.ready, false);

  const called = [];
  state.render.sessionLiveSectorCookedId = 'sector_helios_prime';
  state.render.prepareOpeningGpuResources = async () => {
    called.push('prepare');
    return { skipped: false, packageId: 'ship_kestrel' };
  };
  state.render.prepareLiveSectorBeforeFlight = async () => {
    called.push('live-sector');
    return { skipped: false };
  };
  assert.equal(await waitForOpeningGpuResources(state, 1000), false);
  assert.deepEqual(called, []);
  assert.equal(state.render.requiredPackageAdmission.status, 'pending');
  assert.equal(state.render.requiredPackageAdmission.ready, false);
  assert.equal(state.render.requiredPackageAdmission.generation, 6);
  assert.doesNotMatch(state.render.requiredPackageAdmission.reason || '', /canceled run/);
});

test('a live-sector timeout does not demote an accepted same-sector package', async () => {
  const state = loadingState({
    admissionRunGeneration: 6,
    requiredPackageAdmission: {
      status: 'accepted',
      ready: true,
      packageId: 'ship_kestrel',
      reason: '',
      generation: 6,
    },
    sessionLiveSectorCookedId: 'sector_helios_prime',
    prepareOpeningGpuResources: async () => {
      throw new Error('prepare should not run on an accepted resume');
    },
    prepareLiveSectorBeforeFlight: () => new Promise(() => {}),
  });
  assert.equal(await waitForOpeningGpuResources(state, 20), false);
  const record = state.render.requiredPackageAdmission;
  assert.equal(record.status, 'accepted');
  assert.equal(record.ready, true);
  assert.equal(record.packageId, 'ship_kestrel');
  assert.equal(record.generation, 6);
  assert.doesNotMatch(record.reason || '', /canceled run/);

  const called = [];
  state.render.prepareLiveSectorBeforeFlight = async () => {
    called.push('live-sector');
    return { skipped: false };
  };
  assert.equal(await waitForOpeningGpuResources(state, 1000), true);
  assert.deepEqual(called, ['live-sector']);
  assert.equal(state.render.requiredPackageAdmission.status, 'accepted');
  assert.equal(state.render.requiredPackageAdmission.ready, true);
  assert.equal(state.render.requiredPackageAdmission.packageId, 'ship_kestrel');
});

test('an accepted package is ready, and a stand-in or missing package is not', async () => {
  const accepted = loadingState({
    admissionRunGeneration: 8,
    prepareOpeningGpuResources: async () => ({ skipped: false, packageId: 'ship_kestrel' }),
    prepareLiveSectorBeforeFlight: async () => ({ skipped: false }),
  });
  assert.equal(await waitForOpeningGpuResources(accepted, 1000), true);
  assert.equal(accepted.render.requiredPackageAdmission.status, 'accepted');
  assert.equal(accepted.render.requiredPackageAdmission.ready, true);
  assert.equal(accepted.render.requiredPackageAdmission.packageId, 'ship_kestrel');

  const procedural = loadingState({
    admissionRunGeneration: 8,
    prepareOpeningGpuResources: async () => ({ skipped: false, authoredAssetState: 'procedural-settled' }),
    prepareLiveSectorBeforeFlight: async () => ({ skipped: false }),
  });
  assert.equal(await waitForOpeningGpuResources(procedural, 1000), false);
  assert.equal(procedural.render.requiredPackageAdmission.status, 'rejected');
  assert.equal(procedural.render.requiredPackageAdmission.ready, false);

  const missing = loadingState({
    admissionRunGeneration: 8,
    prepareOpeningGpuResources: async () => null,
    prepareLiveSectorBeforeFlight: async () => ({ skipped: false }),
  });
  assert.equal(await waitForOpeningGpuResources(missing, 1000), false);
  assert.equal(missing.render.requiredPackageAdmission.status, 'rejected');
  assert.equal(missing.render.requiredPackageAdmission.ready, false);
  assert.match(missing.render.requiredPackageAdmission.reason, /missing/);

  const incomplete = loadingState({
    admissionRunGeneration: 8,
    prepareOpeningGpuResources: async () => ({ skipped: true, reason: 'opening-plan-incomplete' }),
    prepareLiveSectorBeforeFlight: async () => ({ skipped: false }),
  });
  assert.equal(await waitForOpeningGpuResources(incomplete, 1000), true);
  assert.ok(!incomplete.render.requiredPackageAdmission || incomplete.render.requiredPackageAdmission.status !== 'accepted');
  assert.ok(!incomplete.render.requiredPackageAdmission || incomplete.render.requiredPackageAdmission.status !== 'rejected');
});

test('the opening budgets stay the existing ceilings and a failed package does not clear another body', () => {
  const readiness = readFileSync(new URL('../src/render/pipelineReadiness.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const loader = readFileSync(new URL('../src/render/renderPackageLoader.js', import.meta.url), 'utf8');
  assert.match(readiness, /Math\.max\(timeoutMs, 360000\)/);
  assert.match(readiness, /Math\.max\(timeoutMs, 120000\)/);
  // 1e75f5b68 added the settle-tail options argument to the same 20000 opening budget;
  // the ceiling, not the call's arity, is the contract this pin guards.
  assert.match(main, /waitForOpeningGpuResources\(state, 20000[,)]/);
  assert.match(main, /void cook\.catch/);
  assert.match(main, /admissionRunGeneration = transitionToken\.generation/);
  assert.match(loader, /if \(cache\.get\(contentHash\) === entry\) cache\.delete\(contentHash\)/);
  assert.doesNotMatch(loader, /cache\.clear\(/);
});
