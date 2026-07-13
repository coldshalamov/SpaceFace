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
    enterFlight,
  } = options;
  requireTransitionDependencies({ guard, prepareRun, waitForLibrary, waitForVisuals, enterFlight });

  const current = () => guard.isCurrent(token);
  const stale = () => ({ stale: true, enteredFlight: false });
  if (!current()) return stale();

  let preparationStarted = false;
  try {
    preparationStarted = true;
    await prepareRun();
    if (!current()) return stale();

    const libraryReady = await waitForLibrary();
    if (!current()) return stale();
    if (!libraryReady) {
      throw new GameStartReadinessError(
        'AUTHORED_LIBRARY_UNAVAILABLE',
        'authored-library',
        'Authored ship asset library did not preload; refusing to start flight with procedural fallback ships.',
      );
    }

    const visualsReady = await waitForVisuals();
    if (!current()) return stale();
    if (!visualsReady) {
      throw new GameStartReadinessError(
        'AUTHORED_VISUALS_UNAVAILABLE',
        'authored-visuals',
        'Initial authored ship visuals did not become ready; refusing to enter flight with procedural fallback ships.',
      );
    }

    if (typeof waitForWarmup === 'function') await waitForWarmup();
    if (!current()) return stale();
    const enteredFlight = guard.commit(token, enterFlight);
    return enteredFlight ? { stale: false, enteredFlight: true } : stale();
  } catch (error) {
    if (preparationStarted && current() && typeof discardRun === 'function') {
      try { await discardRun(); }
      catch (cleanupError) { error.cleanupError = cleanupError; }
    }
    throw error;
  }
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
