// A thin, lazy dispatch boundary. The existing executors still own systems, oracles and seals.
// Importing this file (or asking for help) must not initialize Rapier or a browser.
export async function executeLabRequest(action, doc, options = {}) {
  const { file, verbosity = 1 } = options;
  if (action === 'run') {
    const { runLabScenario, runLabScenarioInternal } = await import('../../src/testing/lab/runScenario.js');
    if (options.observer || options.saveLoadAt != null) {
      return runLabScenarioInternal(doc, { file, verbosity,
        observerEnabled: options.observer === true, saveLoadAt: options.saveLoadAt });
    }
    return runLabScenario(doc);
  }
  if (action === 'trace') {
    const { runLabScenarioInternal } = await import('../../src/testing/lab/runScenario.js');
    // Trace retention is deliberately diagnostic. Never add systems, skip assertions, or promote
    // this arm into a repeat/save-load/public-route result just to obtain a trajectory.
    return runLabScenarioInternal(doc, { file, verbosity: 4 });
  }
  if (action === 'repeat') {
    const { repeatScenario } = await import('../../src/testing/lab/repeat.js');
    return repeatScenario(doc, { file, verbosity, runs: options.runs ?? 2, observerEnabled: options.observer === true });
  }
  if (action === 'compare') {
    if (options.runtimes) {
      const runtimes = String(options.runtimes).split(',').map(s => s.trim().toLowerCase());
      if (!runtimes.includes('node') || !runtimes.some(s => s === 'chromium' || s === 'browser')
        || runtimes.some(s => !['node', 'chromium', 'browser'].includes(s))) {
        throw new Error('compare --runtimes supports node,chromium (both required)');
      }
      const { runDifferentialReplay } = await import('../../src/testing/lab/differentialReplay.js');
      return runDifferentialReplay(doc, { file, verbosity, checkpointEvery: options.checkpointEvery,
        timeoutMs: options.timeoutMs ?? 120_000 });
    }
    if (options.kind && options.kind !== 'save-load') throw new Error(`Unsupported compare kind: ${options.kind}`);
    const { compareSaveLoad } = await import('../../src/testing/lab/saveLoadCompare.js');
    return compareSaveLoad(doc, { file, verbosity, saveLoadAt: options.saveLoadAt });
  }
  if (action === 'replay') {
    const { replayScenario } = await import('../../src/testing/lab/replay.js');
    return replayScenario(doc, { file, verbosity, fingerprint: options.fingerprint ?? null });
  }
  throw new Error(`Unknown execution action: ${action}`);
}

export function labExitCode(result) {
  if (!result || !Number.isInteger(result.exitClass)) return 3;
  // Preserve the established CLI rule: a successful internal arm is not a green acceptance gate.
  return result.nonPromoting === true && result.exitClass === 0 ? 4 : result.exitClass;
}

export async function selectHeadlessAction(doc) {
  const { collectDeclaredEquivalences, executorOwnsEquivalence } = await import('../../src/testing/lab/equivalenceOwnership.js');
  const claims = collectDeclaredEquivalences(doc);
  if (!claims.length) return 'run';
  if (claims.every(c => executorOwnsEquivalence('repeat', c))) return 'repeat';
  if (claims.every(c => executorOwnsEquivalence('save-load', c))) return 'compare';
  // Never boot Chromium as a side effect of a supposedly headless command, or drop foreign claims.
  throw new Error(`No single headless executor owns all declared equivalences: ${claims.join(', ')}. Use the named parent/broker; no browser was launched.`);
}
