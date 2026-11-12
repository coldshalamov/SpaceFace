// W1 Journey framing (campaign W1, owner direction 2026-11-06): the 8-beat spine plays as four
// acts. The table ARRANGES canon; it does not author. Titles are canon act names, goals reuse the
// live beat objectives/hand-off names, and every line is an existing graffiti/ledger line from
// docs/worldbuilding (THEY KNEW THE MASS, THE COUNT NEVER ENDS, THE WALLS WERE NEVER THE REAL
// PRISON, the endgame variant). Small, dependency-free module so it survives missions-file
// consolidation unchanged; consumers import it directly rather than through data/missions.js.
//
// Consumers: storyBeatTitle (waypoint labels), the tracker/Codex act paint, the beat-advance
// direction line, and the Journal campaign strip. The act is its own field so a beat-specific
// reason never overwrites it. `trackerTitle` is the short form the 290px nowrap tracker can show.

export const JOURNEY_ACTS = Object.freeze([
  Object.freeze({
    num: 'I',
    title: 'The Pit',
    trackerTitle: 'The Pit',
    beats: Object.freeze([0, 1]),
    verb: 'Sample and haul',
    goal: 'Sample the 47-A mass discrepancy, then dock at Helios.',
    line: 'THEY KNEW THE MASS.',
  }),
  Object.freeze({
    num: 'II',
    title: 'The Cinder Board',
    trackerTitle: 'The Cinder Board',
    beats: Object.freeze([2, 3]),
    verb: 'Work the marks',
    goal: 'Cinder marks, the Compost Run, the Nest, and the register.',
    line: 'THE COUNT NEVER ENDS.',
  }),
  Object.freeze({
    num: 'III',
    title: 'Three Doors, One Administrator',
    trackerTitle: 'Three Doors',
    beats: Object.freeze([4, 5]),
    verb: 'Choose and operate',
    goal: 'Pick a side and run the door’s operation.',
    line: 'THE WALLS WERE NEVER THE REAL PRISON.',
  }),
  Object.freeze({
    num: 'IV',
    title: 'The Deep Reach',
    trackerTitle: 'The Deep Reach',
    beats: Object.freeze([6, 7]),
    verb: 'Deploy and commit',
    goal: 'Deploy the Empire Seed and run the Deep Reach operation.',
    line: 'THEY KNEW THE MASS. THEY ALWAYS KNEW THE MASS.',
  }),
]);

/** The act a beat belongs to, or null past the spine. Null is not beat 0. */
export function journeyActForBeat(beatIndex) {
  if (beatIndex == null || beatIndex === '' || typeof beatIndex === 'boolean') return null;
  const b = Math.floor(Number(beatIndex));
  if (!Number.isFinite(b)) return null;
  return JOURNEY_ACTS.find((act) => act.beats.includes(b)) || null;
}

export function journeyActByNum(num) {
  return JOURNEY_ACTS.find((act) => act.num === num) || null;
}

/** Every act that starts at or before `beatIndex` (including the current one). */
export function journeyActsThroughBeat(beatIndex) {
  if (beatIndex == null || beatIndex === '' || typeof beatIndex === 'boolean') return [];
  const b = Math.floor(Number(beatIndex));
  if (!Number.isFinite(b)) return [];
  return JOURNEY_ACTS.filter((act) => Math.min(...act.beats) <= b);
}

/** The book is closed after endgame/sandbox — no live act to name on any surface. */
export function journeyActStoryClosed(story) {
  if (!story || typeof story !== 'object') return true;
  const flags = story.flags || {};
  return flags.endgame === true || flags.sandboxContinued === true
    || story.endgameChoice != null || story.endgameResolved === true;
}

/** The one-line act heading used by every durable surface: `ACT II - THE CINDER BOARD`. */
export function journeyActLabel(act) {
  if (!act) return '';
  return `ACT ${act.num} - ${String(act.title).toUpperCase()}`;
}

/** The short heading the 290px nowrap flight tracker can show without clipping. */
export function journeyActTrackerLabel(act) {
  if (!act) return '';
  return `ACT ${act.num} - ${String(act.trackerTitle || act.title).toUpperCase()}`;
}

/**
 * The durable act record lives on state.story so a missed popup, an Adventure-side gate, a
 * feed eviction or a save/load can still paint the current/recent act. `seen` is append-only
 * history; `current` mirrors the live beat (null once the book closes).
 */
export function journeyActRecord(story) {
  if (!story || typeof story !== 'object') return null;
  const rec = story.journeyActs;
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
    story.journeyActs = { seen: [], current: null };
  }
  if (!Array.isArray(story.journeyActs.seen)) story.journeyActs.seen = [];
  return story.journeyActs;
}
