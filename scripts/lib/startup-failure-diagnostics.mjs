// Probe-only observer. These functions are self-contained for page.evaluate / CDP serialization.
// Never await, touch a promise, call a render method, or walk the scene/entity graph.
export function captureStartupFailureDiagnostics(sf, observer = null) {
  const read = (object, key) => {
    try { return Object.getOwnPropertyDescriptor(object || {}, key)?.value; }
    catch (_) { return undefined; }
  };
  const scalar = value => typeof value === 'string' ? value.slice(0, 512)
    : typeof value === 'boolean' || value === null ? value
      : typeof value === 'number' && Number.isFinite(value) ? value : null;
  const select = (object, keys) => Object.fromEntries(keys.map(key => [key, scalar(read(object, key))]));
  const tail = (array, limit, keys) => {
    const result = [];
    const length = read(array, 'length');
    if (!Number.isSafeInteger(length) || length < 0) return result;
    for (let index = Math.max(0, length - limit); index < length; index++) {
      result.push(select(read(array, String(index)), keys));
    }
    return result;
  };
  const state = read(sf, 'state');
  const render = read(state, 'render');
  const world = read(state, 'world');
  const ledger = read(render, 'openingCookLedger');
  const events = read(observer, 'events');
  return {
    schema: 'spaceface.startupFailureDiagnostics.v1',
    capturedAtMs: performance.now(),
    state: select(state, ['mode', 'tick', 'playerId', 'contextRestoreSeq']),
    world: select(world, ['enterSerial', 'currentSectorId']),
    render: select(render, ['admissionRunGeneration', 'openingFirstPictureReady',
      'openingGraphPublicationFrozen', 'deferNoncriticalMeshStreaming', 'contextLost']),
    firstPicturePhase: select(read(render, 'openingFirstPicturePhase'),
      ['stage', 'startedAt', 'budgetMs', 'outcome', 'ms']),
    requiredPackageAdmission: select(read(render, 'requiredPackageAdmission'),
      ['status', 'ready', 'reason', 'packageId', 'generation']),
    cookLedger: tail(ledger, 24,
      ['step', 'stage', 'outcome', 'startedAt', 't', 'ms', 'budgetMs', 'reason']),
    events: tail(events, 12,
      ['event', 'atMs', 'id', 'stage', 'code', 'progress', 'label', 'detail', 'transition', 'error']),
  };
}

export function observeStartupFailureEvents(sf) {
  const events = [];
  const removers = [];
  const bus = sf?.bus;
  const observer = { events, dispose() {
    for (const remove of removers.splice(0)) { try { remove(); } catch (_) {} }
  } };
  if (typeof bus?.on !== 'function') return observer;
  for (const event of ['game:loadingProgress', 'game:startFailed']) {
    const listener = (payload) => {
      try {
        const row = { event, atMs: performance.now() };
        for (const key of ['id', 'stage', 'code', 'progress', 'label', 'detail', 'transition', 'error']) {
          const value = Object.getOwnPropertyDescriptor(payload || {}, key)?.value;
          if (typeof value === 'string') row[key] = value.slice(0, 512);
          else if (typeof value === 'number' && Number.isFinite(value)) row[key] = value;
        }
        events.push(row);
        if (events.length > 12) events.shift();
      } catch (_) { /* Malformed diagnostics must not interrupt the game's event dispatch. */ }
    };
    try {
      const unsubscribe = bus.on(event, listener);
      if (typeof unsubscribe === 'function') removers.push(unsubscribe);
      else if (typeof bus.off === 'function') removers.push(() => bus.off(event, listener));
    } catch (_) { /* Observing must never prevent startup. */ }
  }
  return observer;
}
