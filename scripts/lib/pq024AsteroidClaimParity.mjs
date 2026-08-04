export function projectPq024RouteSemantics(receipt) {
  const observations = receipt?.observations || {};
  const productionReceipt = observations.production?.receipt || {};
  const cargo = Array.isArray(observations.cargo) ? observations.cargo : [];
  return {
    schema: 'spaceface.pq024-asteroid-claim-semantics.v1',
    fixedSeed: Number(receipt?.fixedSeed),
    recordedSeed: Number(receipt?.recordedSeed),
    cargo: cargo.map((row) => ({
      commodityId: row?.commodityId || null,
      requested: Number(row?.qty),
      acquired: Number(row?.after?.owned) - Number(row?.before?.owned),
    })),
    asteroidSiteId: observations.asteroid?.siteId || null,
    survey: {
      revealed: Number(observations.surveyReveal?.revealed),
      cells: Number(observations.surveyReveal?.cells),
    },
    core: {
      siteId: observations.core?.siteId || null,
      anchored: observations.core?.anchored === true,
      lifecycle: observations.core?.lifecycle || null,
      cell: normalizeCell(observations.core?.cell),
    },
    extractor: {
      siteId: observations.extractor?.siteId || null,
      cell: normalizeCell(observations.extractor?.cell),
    },
    production: {
      siteId: observations.production?.siteId || null,
      lifecycle: observations.production?.lifecycle || null,
      outputId: productionReceipt.outputId || null,
      positiveQuantity: Number(productionReceipt.positiveQuantity),
      eventCount: Number(observations.production?.eventCount),
    },
    relay: normalizeRelay(observations.relay),
    continue: {
      siteId: observations.continued?.siteId || null,
      lifecycle: observations.continued?.lifecycle || null,
      outputId: observations.continued?.outputId || null,
      positiveQuantity: Number(observations.continued?.positiveQuantity),
      receiptMatches: observations.continued?.receiptMatches === true,
      relayCount: Number(observations.continued?.relayCount),
    },
    restoredAsteroidSiteId: observations.restoredAsteroid?.siteId || null,
    reentered: {
      siteId: observations.reentered?.siteId || null,
      lifecycle: observations.reentered?.lifecycle || null,
      producingChip: Array.isArray(observations.reentered?.chips)
        && observations.reentered.chips.includes('Producing'),
    },
    restoredRelay: normalizeRelay(observations.restoredRelay),
  };
}

/**
 * Wait for the public dock prompt without making the diagnostic sampling cadence the actor's
 * reaction cadence. `waitForVisible` is the Playwright locator wait in production; the injected
 * seams keep the timing contract deterministic and Browser-free in the focused regression.
 */
export async function observePq024DockPrompt({
  waitForVisible,
  readSnapshot,
  waitForSample,
  timeoutMs,
  sampleIntervalMs = 500,
} = {}) {
  if (typeof waitForVisible !== 'function') throw new TypeError('waitForVisible must be a function');
  if (typeof readSnapshot !== 'function') throw new TypeError('readSnapshot must be a function');
  if (typeof waitForSample !== 'function') throw new TypeError('waitForSample must be a function');

  const budgetMs = Math.max(0, finiteOrZero(timeoutMs));
  const cadenceMs = Math.max(1, finiteOrZero(sampleIntervalMs) || 500);
  let visibilityOutcome = null;
  const visible = Promise.resolve()
    .then(() => waitForVisible())
    .then(
      (prompt) => (visibilityOutcome = { prompt, error: null }),
      (error) => (visibilityOutcome = { prompt: null, error }),
    );

  let elapsedMs = 0;
  let sampleCount = 0;
  let bestBerthDistance = Infinity;
  let bestCenterDistance = Infinity;
  let last = null;
  while (!visibilityOutcome && elapsedMs < budgetMs) {
    const stepMs = Math.min(cadenceMs, budgetMs - elapsedMs);
    const sampleDue = Promise.resolve()
      .then(() => waitForSample(stepMs))
      .then(() => null);
    const outcome = await Promise.race([visible, sampleDue]);
    if (outcome) break;
    elapsedMs += stepMs;
    last = await readSnapshot();
    sampleCount += 1;
    if (Number.isFinite(last?.dockingCorridor?.distToBerth)) {
      bestBerthDistance = Math.min(bestBerthDistance, last.dockingCorridor.distToBerth);
    }
    if (Number.isFinite(last?.dockingCorridor?.distCenter)) {
      bestCenterDistance = Math.min(bestCenterDistance, last.dockingCorridor.distCenter);
    }
  }

  const outcome = visibilityOutcome || await visible;
  return {
    prompt: outcome.prompt,
    waitError: outcome.error,
    evidence: {
      timeoutMs: budgetMs,
      sampleCount,
      bestBerthDistance,
      bestCenterDistance,
      last,
    },
  };
}

/**
 * Retract the public Asteroid Ops build cursor without turning Escape into an unconditional
 * screen-exit command. In the shipped controller Escape means Build -> Drive only while Build is
 * active; the same key in Drive exits Asteroid Ops. The injected seams keep that mode-sensitive
 * actor contract Browser-free in the focused regression.
 */
export async function retractPq024BuildMode({ readMode, pressEscape } = {}) {
  if (typeof readMode !== 'function') throw new TypeError('readMode must be a function');
  if (typeof pressEscape !== 'function') throw new TypeError('pressEscape must be a function');

  const before = await readMode();
  if (before === 'drive') {
    return { before, after: before, escapePressed: false };
  }
  if (before !== 'build') {
    throw new Error(`PQ-024 public console mode is neither Build nor Drive: ${String(before)}`);
  }

  await pressEscape();
  const after = await readMode();
  if (after !== 'drive') {
    throw new Error(`PQ-024 Escape did not retract Build mode: observed ${String(after)}`);
  }
  return { before, after, escapePressed: true };
}

export function formatPq024DockApproachTimeout({
  timeoutMs,
  sampleCount,
  bestBerthDistance,
  bestCenterDistance,
  last,
} = {}) {
  const evidence = {
    timeoutMs: finiteOrNull(timeoutMs),
    sampleCount: finiteOrNull(sampleCount),
    bestBerthDistance: finiteOrNull(bestBerthDistance),
    bestCenterDistance: finiteOrNull(bestCenterDistance),
    last: last && typeof last === 'object' ? last : null,
  };
  return `public Helios approach did not expose the dock prompt; evidence=${JSON.stringify(evidence)}`;
}

export function formatPq024MasslineReleaseTimeout({ samples, events } = {}) {
  const evidence = {
    samples: Array.isArray(samples) ? samples : [],
    events: Array.isArray(events) ? events : [],
  };
  return `public Massline tap did not release the active tether; evidence=${JSON.stringify(evidence)}`;
}

export function formatPq024MasslineLatchTimeout({ targetEntityId, samples, events } = {}) {
  const evidence = {
    targetEntityId: targetEntityId ?? null,
    samples: Array.isArray(samples) ? samples : [],
    events: Array.isArray(events) ? events : [],
  };
  return `public Massline did not latch the selected asteroid; evidence=${JSON.stringify(evidence)}`;
}

function normalizeCell(cell) {
  return {
    col: Number(cell?.col),
    row: Number(cell?.row),
  };
}

function normalizeRelay(relay) {
  return {
    count: Number(relay?.count),
    placeId: relay?.placeId || null,
    siteId: relay?.siteId || null,
  };
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? Number(value) : 0;
}
