// Remember the player's public launch intent, rather than rebuilding a failed partial world.
// Registered before the save owner so even an immediate load failure has a retry target.
export function installGameStartRecovery(bus, { retryPreparedRun } = {}) {
  let intent = null;
  let failed = false;
  // A payload that cannot be cloned must not throw inside the bus listener — the retry
  // would die with the exception and the failure latch would stay set forever.
  const cloneIntent = (payload) => {
    try { return structuredClone(payload); } catch (_) { return payload; }
  };
  const remember = (event) => (payload = {}) => {
    intent = { event, payload: cloneIntent(payload) };
    failed = false;
  };
  const unsubs = [
    bus.on('game:new', remember('game:new')),
    bus.on('game:load', remember('game:load')),
    bus.on('game:startFailed', () => { failed = true; }),
    bus.on('game:retryStart', () => {
      if (!failed || !intent) return;
      failed = false;
      if (intent.event === 'game:new' && retryPreparedRun?.() === true) return;
      bus.emit(intent.event, cloneIntent(intent.payload));
    }),
    bus.on('game:exitToMenu', () => { intent = null; failed = false; }),
  ];
  return () => { for (const unsub of unsubs) unsub(); intent = null; failed = false; };
}
