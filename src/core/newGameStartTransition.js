// Deterministic New Game readiness sequence. World/player preparation is synchronous and happens
// before any authored-asset await so the loading route always represents a real canonical run.
// Async completions remain generation-owned: a repeated Launch invalidates the older sequence and
// only the latest issued token may publish flight.

export class GameStartReadinessError extends Error {
  constructor(code, stage, message) {
    super(message);
    this.name = 'GameStartReadinessError';
    this.code = code;
    this.stage = stage;
    this.retryable = true;
  }
}

export async function runNewGameStartTransition(options = {}) {
  const {
    guard,
    token,
    prepareRun,
    discardRun,
    waitForLibrary,
    waitForVisuals,
    waitForWarmup,
    waitForGpuResources,
    waitForPhysics,
    enterFlight,
    reportProgress,
    yieldForPresentation,
    readPackageAdmission,
    awaitSettledPackageAdmission,
  } = options;
  requireTransitionDependencies({ guard, prepareRun, waitForLibrary, waitForVisuals, enterFlight });

  const current = () => guard.isCurrent(token);
  const stale = () => ({ stale: true, enteredFlight: false });
  if (!current()) return stale();

  let preparationStarted = false;
  try {
    publishProgress(reportProgress, current, 'preparing-run', 0.08, 'Preparing flight systems');
    if (typeof yieldForPresentation === 'function') await yieldForPresentation();
    if (!current()) return stale();
    preparationStarted = true;
    await prepareRun();
    if (!current()) return stale();

    publishProgress(reportProgress, current, 'authored-library', 0.25, 'Loading the ships');
    const libraryReady = await waitForLibrary();
    if (!current()) return stale();
    if (!libraryReady) {
      throw new GameStartReadinessError(
        'AUTHORED_LIBRARY_UNAVAILABLE',
        'authored-library',
        'Authored ship asset library did not preload; refusing to start flight with procedural fallback ships.',
      );
    }

    publishProgress(reportProgress, current, 'authored-visuals', 0.5, 'Building the opening scene');
    const visualsReady = await waitForVisuals();
    if (!current()) return stale();
    if (!visualsReady) {
      throw new GameStartReadinessError(
        'AUTHORED_VISUALS_UNAVAILABLE',
        'authored-visuals',
        'Initial authored ship visuals did not become ready; refusing to enter flight with procedural fallback ships.',
      );
    }

    if (typeof waitForWarmup === 'function') {
      publishProgress(reportProgress, current, 'render-pipelines', 0.78, 'Preparing the visuals');
      const warmupReady = await waitForWarmup();
      if (!current()) return stale();
      if (warmupReady === false) {
        throw new GameStartReadinessError(
          'RENDER_PIPELINE_UNAVAILABLE',
          'render-pipeline',
          'Authored render pipelines did not finish preparing; refusing to enter flight with first-use shader stalls.',
        );
      }
    }
    if (!current()) return stale();
    if (typeof waitForGpuResources === 'function') {
      publishProgress(reportProgress, current, 'gpu-resources', 0.9, 'Preparing the opening route');
      let gpuReady = await waitForGpuResources();
      if (!current()) return stale();
      let admission = typeof readPackageAdmission === 'function' ? readPackageAdmission() : null;
      if (gpuReady !== true && admission && admission.status === 'pending') {
        const detail = admission.packageId
          ? `Still preparing ${admission.packageId}`
          : 'The opening package is still preparing';
        publishProgress(reportProgress, current, 'gpu-resources', 0.9, 'Preparing the opening route', detail);
        if (typeof awaitSettledPackageAdmission === 'function') {
          admission = await awaitSettledPackageAdmission();
        }
        if (!current()) return stale();
        gpuReady = !!(admission && (
          (admission.status === 'accepted' && admission.ready === true)
          || admission.continueOpening === true
        ));
      }
      if (!current()) return stale();
      if (gpuReady !== true) {
        const packageId = admission && admission.packageId;
        const reason = admission && typeof admission.reason === 'string' ? admission.reason : '';
        let detail = 'Required opening package was not accepted.';
        if (packageId && reason) detail = `Required package ${packageId} was not accepted: ${reason}`;
        else if (packageId) detail = `Required package ${packageId} was not accepted.`;
        else if (reason) detail = reason;
        throw new GameStartReadinessError('GPU_RESIDENCY_UNAVAILABLE', 'gpu-resources', detail);
      }
    }
    if (!current()) return stale();
    if (typeof waitForPhysics === 'function') {
      // The loading route runs at timeScale 0, so no live tick ever initializes the
      // dynamic physics owner: the first unfrozen flight tick would start the async
      // Rapier/SG-02 bring-up and early-return until it resolved — thrust demanded,
      // speed and displacement exactly 0 (D26). Hand over flight only with the
      // authority already stepped-ready.
      publishProgress(reportProgress, current, 'physics-authority', 0.94, 'Preparing flight dynamics');
      const physicsReady = await waitForPhysics();
      if (!current()) return stale();
      if (physicsReady === false) {
        throw new GameStartReadinessError(
          'PHYSICS_BACKEND_UNAVAILABLE',
          'physics-authority',
          'The dynamic physics backend did not initialize; refusing to enter flight frozen in place.',
        );
      }
    }
    if (!current()) return stale();
    publishProgress(reportProgress, current, 'entering-flight', 0.96, 'Handing over flight control');
    const enteredFlight = guard.commit(token, enterFlight);
    return enteredFlight ? { stale: false, enteredFlight: true } : stale();
  } catch (error) {
    if (!current()) return stale();
    if (preparationStarted && current() && typeof discardRun === 'function') {
      try { await discardRun(); }
      catch (cleanupError) { error.cleanupError = cleanupError; }
    }
    if (!current()) return stale();
    throw error;
  }
}

function publishProgress(reportProgress, current, id, progress, label, detail) {
  if (typeof reportProgress !== 'function' || !current()) return;
  try {
    const stage = { id, progress, label };
    if (typeof detail === 'string' && detail) stage.detail = detail;
    reportProgress(stage);
  }
  catch (error) { console.warn('[startup] loading progress reporter failed', error); }
}

export function describeGameStartFailure(error) {
  const code = typeof error?.code === 'string' ? error.code : 'GAME_START_FAILED';
  const stage = typeof error?.stage === 'string' ? error.stage : 'startup';
  const retryable = error?.retryable !== false;
  let text = 'The game could not start. Retry Launch; saved games are unchanged.';
  if (code === 'AUTHORED_LIBRARY_UNAVAILABLE') {
    text = 'The authored starter ship could not be loaded. Retry Launch; saved games are unchanged.';
  } else if (code === 'AUTHORED_VISUALS_UNAVAILABLE') {
    text = 'The starter ship did not finish preparing. Retry Launch; saved games are unchanged.';
  } else if (code === 'RENDER_PIPELINE_UNAVAILABLE') {
    text = 'The flight renderer did not finish preparing. Retry Launch; saved games are unchanged.';
  } else if (code === 'GPU_RESIDENCY_UNAVAILABLE') {
    text = 'The opening flight materials did not finish preparing. Retry Launch; saved games are unchanged.';
    const reason = typeof error?.message === 'string' ? error.message.trim() : '';
    if (reason) text = `${text} ${reason}`;
  } else if (code === 'PHYSICS_BACKEND_UNAVAILABLE') {
    text = 'The flight physics systems did not finish preparing. Retry Launch; saved games are unchanged.';
  } else if (code === 'NEW_GAME_PLUS_UNAVAILABLE') {
    text = 'That New Run+ legacy could not be restored. Choose it again or launch a fresh run; saved games are unchanged.';
  }
  return { code, stage, retryable, text };
}

function requireTransitionDependencies({ guard, prepareRun, waitForLibrary, waitForVisuals, enterFlight }) {
  if (!guard || typeof guard.isCurrent !== 'function' || typeof guard.commit !== 'function') {
    throw new TypeError('New Game transition requires an issued-token guard');
  }
  for (const [name, value] of Object.entries({ prepareRun, waitForLibrary, waitForVisuals, enterFlight })) {
    if (typeof value !== 'function') throw new TypeError(`New Game transition requires ${name}()`);
  }
}
