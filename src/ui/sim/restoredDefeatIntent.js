/**
 * SF-285 — synchronous save-boundary predicate for re-presenting the after-action screen.
 * Reads the durable player entity flag because older saves may not carry a defeat receipt.
 */
export function restoredDefeatIntent(state = {}) {
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  return !!player && (player.alive === false || !!(player.flags && player.flags.defeated));
}
