// Replay: reproduce a failure fingerprint from a prior lab run.
// Uses internal non-certifying path (diagnostic / nonPromoting).

import { runLabScenarioInternal } from './runScenario.js';

/**
 * Re-run a scenario and check that the failure fingerprint matches (or that the run still fails
 * at the same firstBadTick + oracle id when fingerprint is provided).
 * @param {object} scenarioDoc
 * @param {{ fingerprint?: string, expectedFailure?: object, verbosity?: number }} [options]
 */
export async function replayScenario(scenarioDoc, options = {}) {
  const result = await runLabScenarioInternal(scenarioDoc, {
    file: options.file,
    verbosity: options.verbosity,
    observerEnabled: options.observerEnabled,
    runId: options.runId || `replay_${Date.now().toString(36)}`,
  });

  const expectedFp = options.fingerprint
    || (options.expectedFailure && options.expectedFailure.failureFingerprint)
    || null;

  if (expectedFp) {
    const actualFp = result.failure && result.failure.failureFingerprint;
    const match = actualFp === expectedFp;
    return {
      schema: 'spaceface.labReplayResult.v1',
      ok: match,
      exitClass: match ? (result.ok ? 0 : 1) : 5,
      status: match ? 'fingerprint-reproduced' : 'fingerprint-mismatch',
      expectedFingerprint: expectedFp,
      actualFingerprint: actualFp || null,
      firstBadTick: result.oracle && result.oracle.firstBadTick,
      result,
    };
  }

  // No fingerprint: replay is just a re-run; report pass/fail of the scenario itself.
  return {
    schema: 'spaceface.labReplayResult.v1',
    ok: result.ok,
    exitClass: result.exitClass,
    status: result.status,
    expectedFingerprint: null,
    actualFingerprint: result.failure && result.failure.failureFingerprint,
    firstBadTick: result.oracle && result.oracle.firstBadTick,
    result,
  };
}

/**
 * Given a prior failing run result, re-run and confirm fingerprint stability.
 */
export async function replayFailure(scenarioDoc, priorResult, options = {}) {
  if (!priorResult || !priorResult.failure) {
    return {
      schema: 'spaceface.labReplayResult.v1',
      ok: false,
      exitClass: 4,
      status: 'invalid-config',
      error: 'prior result has no failure artifact to replay',
    };
  }
  return replayScenario(scenarioDoc, {
    ...options,
    fingerprint: priorResult.failure.failureFingerprint,
    expectedFailure: priorResult.failure,
  });
}
