// Dev-only Adventure sector jump (G17-02): `?sector=<id>` skips the title and launches a fresh
// Adventure game with the default seed (or `?seed=N`), placing the player in sector `<id>` at
// that sector's normal arrival point, in flight. `?shot=1` sets window.__sfShotReady = true after
// the sector finishes loading and 3 s of simulation have passed. An unknown sector name must
// leave the ordinary boot alone: no launch, no overrides, one plain log line.
export async function applyDevSectorJump({
  searchParams,
  state,
  bus,
  registry,
  sessionStorage = typeof globalThis.sessionStorage !== 'undefined' ? globalThis.sessionStorage : null,
  resolveSector = null,
  newGameDefaults = null,
  dismissConfirm = null,
  logger = console.log,
  windowRef = typeof window !== 'undefined' ? window : null,
  pollArrival = true,
} = {}) {
  const devSectorQuery = searchParams || new URLSearchParams();
  const rawSectorId = devSectorQuery.get('sector');
  const resolveFn = resolveSector || (await import('./world.js')).resolveStartSectorId;
  const targetSectorId = resolveFn(rawSectorId);
  if (!targetSectorId) {
    logger(`[SpaceFace] unknown sector '${rawSectorId}', starting normally`);
    return { launched: false, targetSectorId: null };
  }

  // Emulate a returning player so First Light cannot intercept the launch.
  const access = state && state.settings && state.settings.accessibility;
  if (access && typeof access === 'object') access.firstLightOffered = true;
  try { if (sessionStorage) sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}

  const devSeed = devSectorQuery.has('seed') ? Number.parseInt(devSectorQuery.get('seed'), 10) : undefined;
  const seedOpt = Number.isFinite(devSeed) && devSeed > 0 ? { seed: devSeed } : {};

  const wantsShot = devSectorQuery.get('shot') === '1';

  const NEW_GAME = newGameDefaults || (await import('../data/newGameDefaults.js')).NEW_GAME;
  NEW_GAME.startingSectorId = targetSectorId;

  try {
    const dismiss = dismissConfirm || (await import('../ui/confirm.js')).dismissConfirm;
    dismiss();
  } catch (_) {}

  bus.emit('game:new', seedOpt);

  const ensureArrivalAndShot = () => {
    let waited = 0;
    const checkArrival = async () => {
      if (state && state.mode === 'flight') {
        try {
          const dismiss = dismissConfirm || (await import('../ui/confirm.js')).dismissConfirm;
          dismiss();
        } catch (_) {}
        const worldSystem = registry && registry.get('world');
        if (targetSectorId && worldSystem && state.world && state.world.currentSectorId !== targetSectorId) {
          worldSystem.enterSector(targetSectorId);
        }
        if (wantsShot) {
          const startSimTime = Number.isFinite(state.simTime) ? state.simTime : 0;
          const checkShot = () => {
            if (state && state.mode === 'flight' && (state.simTime - startSimTime) >= 3) {
              if (windowRef) {
                windowRef.__sfShotReady = true;
              }
              return;
            }
            setTimeout(checkShot, 50);
          };
          setTimeout(checkShot, 50);
        }
        return;
      }
      waited += 1;
      if (waited < 1200) setTimeout(checkArrival, 100);
      else console.error('[SpaceFace] dev sector route timed out waiting for flight mode');
    };
    setTimeout(checkArrival, 100);
  };
  if (pollArrival) {
    ensureArrivalAndShot();
  }
  return { launched: true, targetSectorId };
}
