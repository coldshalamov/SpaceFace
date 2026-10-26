// ── W-CANON interludes (build_map row 537, §34.7) ────────────────────────────────
//
// The six authored interludes from docs/worldbuilding/story/THE-STORYLINE.md play as
// quiet vignette scenes on the live route between books. This module is the data
// seam: it names each interlude, the encounter shape that performs it, the beat that
// unlocks it, and the sector it prefers. It owns no cursor and pays nothing —
// missions/missionStoryOps reads this table to request the scene through the existing
// encounterDirector.requestAuthoredEncounter seam, and the story flags record that
// the player stood in the quiet.
//
// Gating rule: the scene is due once story.beatIndex >= minBeat (the previous book
// has closed). It fires in def.sectorId when the player is there; once the book
// cursor has run `staleBeats` past the gate the scene follows the player into any
// sector — the log object is a lane object, and the lane is wherever the pilot is.

export const CAMPAIGN_INTERLUDE_FLAG_PREFIX = 'interlude_';
export const CAMPAIGN_INTERLUDE_ENCOUNTER_PREFIX = 'interlude:';

export const CAMPAIGN_INTERLUDES = Object.freeze([
  {
    // Between Book 0 (COLD START) and Book 1 (HONEST WORK): the hull-spotter's buoy
    // on the 47-A lane kept the Cycle 17 log — the unknown vessel's only witness.
    id: 'unknown_vessel',
    shapeId: 'interlude_unknown_vessel',
    flag: 'interlude_unknown_vessel',
    minBeat: 1,
    staleBeats: 2,
    sectorId: 'sector_helios_prime',
    stationId: 'station_helios',
    anchorOffset: { x: 780, z: -460 },
    citation: 'THE-STORYLINE.md · INTERLUDE — THE UNKNOWN VESSEL',
  },
  {
    // Between Book 1 (HONEST WORK) and Book 2 (FIRST BLOOD): Ivo paints Bulkhead 4
    // for the fourth time this week. The wall comes back.
    id: 'the_hand',
    shapeId: 'interlude_the_hand',
    flag: 'interlude_the_hand',
    minBeat: 2,
    staleBeats: 2,
    sectorId: 'sector_helios_prime',
    stationId: 'station_helios',
    anchorOffset: { x: -420, z: 300 },
    citation: 'THE-STORYLINE.md · INTERLUDE — THE HAND',
  },
  {
    // Between Book 2 (FIRST BLOOD) and Book 3 (BIGGER BOAT): Rook's booth tally —
    // two payers, the second redacted under the same glyph as Contract 47-A.
    id: 'second_client',
    shapeId: 'interlude_second_client',
    flag: 'interlude_second_client',
    minBeat: 3,
    staleBeats: 2,
    sectorId: 'sector_ceres_belt',
    stationId: 'station_ceres',
    anchorOffset: { x: 640, z: 520 },
    citation: 'THE-STORYLINE.md · INTERLUDE — THE SECOND CLIENT',
  },
  {
    // Between Book 3 (BIGGER BOAT) and Book 4 (PICK A SIDE): the exchange tape
    // priced the news the player made, with nobody's name attached.
    id: 'the_ticker',
    shapeId: 'interlude_the_ticker',
    flag: 'interlude_the_ticker',
    minBeat: 4,
    staleBeats: 2,
    sectorId: 'sector_tethys_junction',
    stationId: 'station_tethys',
    anchorOffset: { x: -560, z: -640 },
    citation: 'THE-STORYLINE.md · INTERLUDE — THE TICKER',
  },
  {
    // Between Book 4 (PICK A SIDE) and Book 5 (THE REUNION): the annex drawer —
    // nineteen years of chits, one year-3 entry in a different hand.
    id: 'the_drawer',
    shapeId: 'interlude_the_drawer',
    flag: 'interlude_the_drawer',
    minBeat: 5,
    staleBeats: 2,
    sectorId: 'sector_ceres_belt',
    stationId: 'station_ceres',
    anchorOffset: { x: 480, z: -700 },
    citation: 'THE-STORYLINE.md · INTERLUDE — THE DRAWER',
  },
  {
    // Between Book 5 (THE REUNION) and Book 6 (THE EMPIRE SEED): the 12.4-tonne
    // catalyst grid still racked off Bay 7 — ticket 88,214, closed.
    id: 'the_smell_ticket',
    shapeId: 'interlude_the_smell_ticket',
    flag: 'interlude_the_smell_ticket',
    minBeat: 6,
    staleBeats: 2,
    sectorId: 'sector_helios_prime',
    stationId: 'station_helios',
    anchorOffset: { x: 340, z: 560 },
    citation: 'THE-STORYLINE.md · INTERLUDE — THE SMELL TICKET',
  },
]);

const BY_ID = new Map(CAMPAIGN_INTERLUDES.map((def) => [def.id, def]));
const BY_SHAPE = new Map(CAMPAIGN_INTERLUDES.map((def) => [def.shapeId, def]));
const BY_ENCOUNTER = new Map(CAMPAIGN_INTERLUDES.map((def) => [CAMPAIGN_INTERLUDE_ENCOUNTER_PREFIX + def.id, def]));

export function interludeById(id) { return BY_ID.get(id) || null; }
export function interludeByShape(shapeId) { return BY_SHAPE.get(shapeId) || null; }
export function interludeByEncounterId(encounterId) { return BY_ENCOUNTER.get(encounterId) || null; }

/** Is this interlude still owed to the player? Flags are story-owned durable records. */
export function interludeSeen(state, def) {
  return !!(state && state.story && state.story.flags && state.story.flags[def.flag]);
}

/**
 * Eligibility on the live route:
 *  - the campaign cursor must have passed the interlude's book boundary, and
 *  - the player must be in the authored sector, OR the cursor has run `staleBeats`
 *    books past the gate — a missed quiet scene follows the pilot into any sector
 *    rather than becoming unreachable content.
 * Returns { ok, roaming } — `roaming` marks the stale-follow branch for receipts/tests.
 */
export function interludeEligible(state, def) {
  const story = state && state.story;
  const beatIndex = story && Number.isFinite(story.beatIndex) ? story.beatIndex : 0;
  if (interludeSeen(state, def) || beatIndex < def.minBeat) return { ok: false, roaming: false };
  const sectorId = state && state.world && state.world.currentSectorId;
  if (sectorId === def.sectorId) return { ok: true, roaming: false };
  if (beatIndex >= def.minBeat + (def.staleBeats || 2)) return { ok: true, roaming: true };
  return { ok: false, roaming: false };
}
