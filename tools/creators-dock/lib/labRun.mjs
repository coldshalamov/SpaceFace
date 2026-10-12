import { exportProject } from './export.mjs';

export async function validateProject(project) {
  const exported = await exportProject(project);
  return {
    ok: exported.ok,
    issues: exported.issues,
    manifest: exported.manifest,
    scenarioId: exported.scenario && exported.scenario.id,
  };
}

export async function runProject(project) {
  const exported = await exportProject(project);
  if (!exported.ok) {
    return {
      ok: false,
      certifying: false,
      issues: exported.issues,
      manifest: exported.manifest,
      run: null,
    };
  }
  const { runLabScenario } = await import('../../../src/testing/lab/runScenario.js');
  const result = await runLabScenario(exported.scenario);
  return {
    ok: result.ok === true,
    certifying: result.certifying === true,
    issues: exported.issues,
    manifest: exported.manifest,
    scenario: exported.scenario,
    run: slimRun(result, exported.scenario),
  };
}

function slimRun(result, scenario) {
  const failure = result && result.failure;
  return {
    ok: result.ok === true,
    exitClass: result.exitClass,
    status: result.status,
    certifying: result.certifying === true,
    seed: result.seed,
    ticks: result.ticks,
    scenarioId: result.scenarioId,
    scenarioDigest: result.scenarioDigest,
    inputDigest: result.inputDigest,
    evidenceClass: result.evidenceClass,
    evidenceNote: result.evidenceNote,
    rendering: result.rendering || { detached: true },
    metrics: result.metrics || [],
    oracle: {
      ok: result.oracle && result.oracle.ok,
      firstBadTick: result.oracle && result.oracle.firstBadTick,
      failed: (result.oracle && result.oracle.failed) || [],
      assertionConsumption: result.oracle && result.oracle.assertionConsumption,
    },
    live: result.live || null,
    inputTape: {
      frames: scenario.frames || [],
      inputEvents: scenario.inputEvents || [],
    },
    failure: failure ? {
      schema: failure.schema,
      status: failure.status,
      firstBadTick: failure.firstBadTick,
      reason: failure.reason || failure.message || failure.error || null,
    } : null,
    error: result.error || null,
  };
}
