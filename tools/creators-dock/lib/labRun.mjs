import { exportProject } from './export.mjs';

export async function validateProject(project) {
  const exported = await exportProject(project);
  const report = {
    ok: exported.ok,
    issues: exported.issues,
    manifest: exported.manifest,
    scenarioId: exported.scenario && exported.scenario.id,
    certifying: false,
    seed: null,
    oracle: null,
    trace: null,
  };
  if (!exported.ok || !exported.scenario) return report;
  const { runLabScenario } = await import('../../../src/testing/lab/runScenario.js');
  const result = await runLabScenario(exported.scenario);
  report.certifying = !!(result && result.certifying === true);
  report.seed = result && result.seed != null ? result.seed : null;
  report.oracle = result && result.oracle ? result.oracle : null;
  report.trace = result && (result.trace || result.oracleTrace || result.traceHash) || null;
  report.ok = exported.ok && result && result.ok === true;
  if (result && result.ok !== true) {
    const reason = result.error || (result.oracle && result.oracle.failed && result.oracle.failed[0]
      && (result.oracle.failed[0].reason || result.oracle.failed[0].id)) || result.status;
    if (reason) report.issues = report.issues.concat([`lab: ${reason}`]);
  }
  return report;
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
    checkpoints: result.checkpoints || null,
    failure: failure ? {
      schema: failure.schema,
      status: failure.status,
      firstBadTick: failure.firstBadTick,
      reason: failure.reason || failure.message || failure.error || null,
      metricWindow: failure.metricWindow || null,
      stateSlice: failure.stateSlice || null,
      inputWindow: failure.inputWindow || null,
      checkpoints: failure.checkpoints || result.checkpoints || null,
    } : null,
    error: result.error || null,
  };
}
