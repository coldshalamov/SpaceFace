// Adventure combat input lock for clickable flight HUD chrome.
// Agreed UI rule: while weapons are hot in Adventure, primary clicks belong to the game, so HUD
// buttons (the race-tape Circuits / Overhead row) step out of the pointer path and cannot open
// menus. Crucible is handled separately: #327 hides the race tape outright during a sealed run.
//
// "Hot" is event-driven (no per-frame entity scans): the player fired, or the player was hit,
// within the last HUD_COMBAT_HOLD_S of sim time.

export const HUD_COMBAT_HOLD_S = 4;

export function createHudCombatLock({ bus, state, holdS = HUD_COMBAT_HOLD_S } = {}) {
  let hotUntil = -Infinity;
  // Under the worker sim lane the mounted state can trail the live frame state, so arm from the
  // newest sim time either one has shown.
  let lastNow = 0;
  const offs = [];
  const arm = () => { hotUntil = Math.max(Number(state?.simTime) || 0, lastNow) + holdS; };
  const on = (name, fn) => {
    const off = bus?.on?.(name, fn, { presentation: true });
    if (typeof off === 'function') offs.push(off);
  };
  on('combat:fire', (p) => { if (p && p.ownerId != null && p.ownerId === state?.playerId) arm(); });
  on('combat:damage', (p) => { if (p && p.isPlayer) arm(); });
  return {
    hot(st = state) {
      const now = Number(st?.simTime) || 0;
      // A load or restart can rewind simTime; never let a stale window outlive it.
      if (hotUntil - now > holdS) hotUntil = -Infinity;
      lastNow = now;
      return now < hotUntil;
    },
    dispose() { for (const off of offs.splice(0)) { try { off(); } catch {} } },
  };
}
