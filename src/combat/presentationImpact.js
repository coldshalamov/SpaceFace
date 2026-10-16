// Small, pure combat presentation helpers shared by the domain mirror and the
// pause screen. The worker keeps the complete combat trace authoritative; this
// module only derives the one player-facing impact receipt the pause screen
// needs.

const PAUSE_IMPACT_CAUSES = new Set(['gun', 'shove', 'slam', 'rock']);
const PAUSE_SHOVE_TAGS = new Set(['inertial_shunt', 'impulse_charge_blast', 'bomb_blast']);
const PAUSE_SHOVE_ORIGINS = new Set(['impulse_charge', 'bomb', 'massline_whip']);

export function pauseImpactCause(value) {
  return typeof value === 'string' && PAUSE_IMPACT_CAUSES.has(value) ? value : '';
}

export function causeFromCombatTraceEvent(event) {
  if (!event || typeof event !== 'object') return '';
  const named = pauseImpactCause(event.cause);
  if (named) return named;
  if (event.kind === 'collision.consequence') {
    if (event.surface === 'terrain') return 'rock';
    if (event.control === 'tumble' || event.surface === 'structure') return 'slam';
    if (event.surface === 'craft' || event.surface === 'debris') return 'shove';
    return '';
  }
  if (event.kind === 'physics.impulse') {
    const tag = typeof event.provenance === 'string' ? event.provenance : '';
    if (pauseImpactCause(tag)) return pauseImpactCause(tag);
    if (PAUSE_SHOVE_TAGS.has(tag)) return 'shove';
    if (event.reason === 'weapon_hit' || event.reason === 'damage') return 'gun';
    return '';
  }
  if (event.kind !== 'damage.routed' && event.kind !== 'damage') return '';
  const origin = event.origin && typeof event.origin === 'object' ? event.origin : null;
  const kind = origin && typeof origin.kind === 'string' ? origin.kind : '';
  if (kind === 'weapon' || kind === 'legacy') return 'gun';
  if (PAUSE_SHOVE_ORIGINS.has(kind)) return 'shove';
  if (kind === 'collision' || kind.startsWith('collision')) {
    const surface = String((origin && origin.id) || kind);
    if (surface === 'terrain' || surface.endsWith('terrain')) return 'rock';
    return 'slam';
  }
  return '';
}

/**
 * Return the newest recognized trace impact for this player, or null.
 *
 * This scans the producer-owned event array without cloning or canonicalizing
 * any event. The mirror uses it while creating a tiny presentation snapshot;
 * pause uses it as the compatibility fallback when a full trace is present.
 */
export function latestPlayerImpactFromTrace(trace, playerId) {
  const events = trace && typeof trace === 'object' ? trace.events : null;
  if (!Array.isArray(events) || playerId == null) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event || event.targetId !== playerId) continue;
    const cause = causeFromCombatTraceEvent(event);
    if (!cause) continue;
    return { tick: Number.isFinite(event.tick) ? event.tick : 0, cause };
  }
  return null;
}
