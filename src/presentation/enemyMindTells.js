// CW-TELLS (INV-21 item 5): the Enemy Mind's own facts become the same player-facing tells
// the doctrine cues already are. Pure data + classifiers only: no DOM, no Three, no systems,
// no writes. The mind's publisher (src/ai/enemyMind/port.js) emits `ai:mind:decision|phase|
// pursuit_read|mistake`; this mapper decides which of those facts may speak, and with what
// words. The HUD chip ids land in src/ui/hud.js; the caption sentence rides the presentation
// orchestrator's cue.

/**
 * The verbs that earn a player tell. `press` and `regroup` are the ordinary states of any
 * fight — announcing them would be noise, not legibility (the mind's value is its readable
 * decisions, not a heartbeat). Everything hostile-acting or breaking speaks once per plan.
 */
export const MIND_TELL_BY_VERB = Object.freeze({
  flank_left: 'FLANK',
  flank_right: 'FLANK',
  bait: 'BAIT',
  punish: 'PUNISH',
  cover: 'COVER',
  withdraw: 'PEEL',
  panic: 'PEEL',
});

/** One player-facing sentence per tell, for captions / the accessibility announce. */
export const MIND_TELL_SENTENCE = Object.freeze({
  FLANK: 'It is sliding to your flank — a crossfire is opening.',
  BAIT: 'It offers the chase — do not follow.',
  PUNISH: 'It read your pursuit and is cutting across you.',
  COVER: 'It is interposing on its wounded.',
  PEEL: 'It is breaking off — punish the window.',
});

/** The mind's readable mistakes, mapped onto the tell the player can act on. */
export const MIND_MISTAKE_TELL = Object.freeze({
  overcommitted_under_pressure: 'PUNISH',
});

/**
 * Map one `ai:mind:*` fact to the tell it may speak, or null when the fact is not a tell.
 * Only decisions (and the authored mistakes) speak; phase and pursuit-read facts stay
 * supporting evidence so the surface stays quiet at 50 bodies.
 */
export function enemyMindTell(fact) {
  if (!fact || typeof fact !== 'object') return null;
  if (fact.kind === 'mistake') {
    const tellId = MIND_MISTAKE_TELL[String(fact.reason || '')] || null;
    if (!tellId) return null;
    return { tellId, verb: fact.verb || null, sentence: MIND_TELL_SENTENCE[tellId] || null,
      mistake: fact.reason, urgent: true };
  }
  if (fact.kind !== 'decision') return null;
  const tellId = MIND_TELL_BY_VERB[String(fact.verb || '')] || null;
  if (!tellId) return null;
  // A peel is the player's opportunity, not a new threat aimed at them.
  const urgent = fact.verb !== 'withdraw' && fact.verb !== 'panic';
  return { tellId, verb: fact.verb, sentence: MIND_TELL_SENTENCE[tellId] || null,
    mistake: null, urgent };
}
