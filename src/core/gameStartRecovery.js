// Remember the player's public launch intent, rather than rebuilding a failed partial world.
// Registered before the save owner so even an immediate load failure has a retry target.
export function installGameStartRecovery(bus) {
  let intent = null;
  let failed = false;
  const remember = (event) => (payload = {}) => {
    intent = { event, payload: structuredClone(payload) };
    failed = false;
  };
  const unsubs = [
    bus.on('game:new', remember('game:new')),
    bus.on('game:load', remember('game:load')),
    bus.on('game:startFailed', () => { failed = true; }),
    bus.on('game:retryStart', () => {
      if (!failed || !intent) return;
      failed = false;
      bus.emit(intent.event, structuredClone(intent.payload));
    }),
    bus.on('game:exitToMenu', () => { intent = null; failed = false; }),
  ];
  return () => { for (const unsub of unsubs) unsub(); intent = null; failed = false; };
}
