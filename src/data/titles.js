// Cross-faction world titles. systems/titles.js is the sole writer of title state; morale,
// presentation, news, and Ledger readers consume its semantic state/events.

export const TITLES_SCHEMA_VERSION = 3;
export const THUNDERCHILD_TITLE_ID = 'title_thunderchild';
export const PLAYER_DEED_HOLDER_KEY = 'player';

// Small deterministic bounds keep the durable receipt surface save-friendly. Candidate eviction
// keeps the best successors; the other arrays retain their newest entries.
export const TITLE_CANDIDATE_LIMIT = 16;
export const TITLE_ACTIVE_HOLD_LIMIT = 16;
export const TITLE_HISTORY_LIMIT = 32;
export const TITLE_PROCESSED_RECEIPT_LIMIT = 128;
export const TITLES_SEEN_LIMIT = 32;
export const PLAYER_DEED_RECEIPT_LIMIT = 64;

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

function deed(id, title, description, trigger) {
  return Object.freeze({ id, title, description, trigger: Object.freeze(trigger) });
}

export const PLAYER_DEEDS = Object.freeze([
  deed('deed_rockbreaker', 'Rockbreaker', 'Broke a tumbling hostile against terrain.', {
    event: 'entity:killed', killCause: 'terrain_smash',
  }),
  deed('deed_undertow', 'Undertow', 'Slung one tumbling hull through another.', {
    event: 'entity:killed', killCause: 'chain',
  }),
  deed('deed_wellhand', 'Wellhand', 'Put a hostile into a collapsing gravity well.', {
    event: 'entity:killed', killCause: 'well_collapse',
  }),
  deed('deed_smokewalker', 'Smokewalker', 'Fed a hostile to atmospheric burn-up.', {
    event: 'entity:killed', killCause: 'burn_up',
  }),
  deed('deed_yardhand', 'Yardhand', 'Stripped a heavy hull down to a towable barge.', {
    event: 'heavyPart:detached', condition: 'player_heavy_strip',
  }),
  deed('deed_linehauler', 'Linehauler', 'Put a stripped heavy hull on the Massline.', {
    event: 'tether:latched', condition: 'player_heavy_tow',
  }),
]);

export const PLAYER_DEED_BY_ID = Object.freeze(Object.fromEntries(
  PLAYER_DEEDS.map((entry) => [entry.id, entry]),
));

export const PLAYER_DEED_BY_KILL_CAUSE = Object.freeze(Object.fromEntries(
  PLAYER_DEEDS
    .filter((entry) => entry.trigger.event === 'entity:killed')
    .map((entry) => [entry.trigger.killCause, entry]),
));

export const TITLES = Object.freeze([THUNDERCHILD, ...PLAYER_DEEDS]);
