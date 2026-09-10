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

export const TITLES = Object.freeze([THUNDERCHILD]);

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
