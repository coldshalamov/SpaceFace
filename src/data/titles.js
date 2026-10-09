// Cross-faction world titles. systems/titles.js is the sole writer of title state; morale,
// presentation, news, and Ledger readers consume its semantic state/events.

export const TITLES_SCHEMA_VERSION = 2;
export const THUNDERCHILD_TITLE_ID = 'title_thunderchild';

// Small deterministic bounds keep the durable receipt surface save-friendly. Candidate eviction
// keeps the best successors; the other arrays retain their newest entries.
export const TITLE_CANDIDATE_LIMIT = 16;
export const TITLE_ACTIVE_HOLD_LIMIT = 16;
export const TITLE_HISTORY_LIMIT = 32;
export const TITLE_PROCESSED_RECEIPT_LIMIT = 128;
export const TITLES_SEEN_LIMIT = 32;

export const THUNDERCHILD = Object.freeze({
  id: THUNDERCHILD_TITLE_ID,
  title: 'Thunderchild',
  minDurationTicks: 3600,
  holdContinuityTicks: 600,
  threatRatio: Object.freeze({ hostileMultiplier: 2, alliedMultiplier: 3 }),
  minHostileOutcomes: 3,
  maxKillMarks: 12,
  aura: Object.freeze({ radius: 1200, morale: 0.15 }),
  news: Object.freeze({
    earnedSuffix: ' has earned the title Thunderchild.',
    successionPrefix: 'The Thunderchild is dead. ',
    successionSuffix: ' carries the title now.',
    vacant: 'The Thunderchild is dead. The title waits.',
  }),
});

// FB-060 — three more earned world titles, keyed to counters the game already keeps. Same
// aura/succession law as Thunderchild; the earn verbs differ: rescue deliveries, razor releases,
// and wanted clears with no kill during the wanted window. `counter` names the semantic ledger
// field the titles system keeps per holder; `counterTarget` is the count that qualifies.
export const LIFELINE_TITLE_ID = 'title_lifeline';
export const RAZORLINE_TITLE_ID = 'title_razorline';
export const QUIET_CLEAR_TITLE_ID = 'title_quiet_clear';

export const LIFELINE = Object.freeze({
  id: LIFELINE_TITLE_ID,
  title: 'Lifeline',
  counter: 'rescues',            // survivor pods delivered to lawful custody
  counterTarget: 3,
  aura: Object.freeze({ radius: 1200, morale: 0.12 }),
  news: Object.freeze({
    earnedSuffix: ' has earned the title Lifeline.',
    successionPrefix: 'The Lifeline is dead. ',
    successionSuffix: ' carries the title now.',
    vacant: 'The Lifeline is dead. The title waits.',
  }),
});

export const RAZORLINE = Object.freeze({
  id: RAZORLINE_TITLE_ID,
  title: 'Razorline',
  counter: 'razorReleases',      // swing releases rated razor
  counterTarget: 5,
  aura: Object.freeze({ radius: 1200, morale: 0.08 }),
  news: Object.freeze({
    earnedSuffix: ' has earned the title Razorline.',
    successionPrefix: 'The Razorline is dead. ',
    successionSuffix: ' carries the title now.',
    vacant: 'The Razorline is dead. The title waits.',
  }),
});

export const QUIET_CLEAR = Object.freeze({
  id: QUIET_CLEAR_TITLE_ID,
  title: 'Quiet-Clear',
  counter: 'quietClears',        // WANTED crossings ended with no kill during the window
  counterTarget: 2,
  aura: Object.freeze({ radius: 1200, morale: 0.10 }),
  news: Object.freeze({
    earnedSuffix: ' has earned the title Quiet-Clear.',
    successionPrefix: 'The Quiet-Clear is dead. ',
    successionSuffix: ' carries the title now.',
    vacant: 'The Quiet-Clear is dead. The title waits.',
  }),
});

export const COUNTER_TITLES = Object.freeze([LIFELINE, RAZORLINE, QUIET_CLEAR]);

/** Every title carrying the aura law — the thunderchild hold plus the counter titles. */
export const AURA_TITLES = Object.freeze([THUNDERCHILD, ...COUNTER_TITLES]);

export const TITLE_DEFS_BY_ID = new Map(AURA_TITLES.map((def) => [def.id, def]));

export function titleDefFor(titleId) {
  return TITLE_DEFS_BY_ID.get(titleId) || null;
}

export const TITLES = Object.freeze([THUNDERCHILD, ...COUNTER_TITLES]);

/** Live titlesSeen ids are authoredId:succession:holder or authoredId:holder:tick. */
export function authoredTitleId(value) {
  const id = String(value == null ? '' : value).trim();
  if (!id) return '';
  if (id === THUNDERCHILD_TITLE_ID || id.startsWith(`${THUNDERCHILD_TITLE_ID}:`)) {
    return THUNDERCHILD_TITLE_ID;
  }
  if (id.startsWith('title_')) {
    const colon = id.indexOf(':');
    return colon === -1 ? id : id.slice(0, colon);
  }
  return id;
}

/**
 * A title record whose holder is the player: keyed to the player, or a stunt title. Stunt titles
 * are the only titles the live route awards the player; their holderKey is the pilot id
 * (`pilot:<seed>`), so the trickId is what marks them. A Thunderchild holderKey is always an NPC
 * world record id — titles.js only opens holds for durable NPC ships.
 */
export function isPlayerTitleHolder(record) {
  if (!record || typeof record !== 'object') return false;
  const key = String(record.holderKey || '');
  if (key === 'player' || key === 'player_ship' || key.startsWith('player')) return true;
  return !!record.trickId;
}

/**
 * A title the player actually holds. Same rule as the save slot card's reader
 * (saveLoad.js isPlayerHeldTitle), so every surface agrees on whose title it is.
 */
export function isPlayerHeldTitleRecord(record) {
  return !!record && typeof record === 'object' && record.status === 'held' && isPlayerTitleHolder(record);
}
