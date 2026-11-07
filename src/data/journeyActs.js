// W1 Journey framing (campaign W1, owner direction 2026-11-06): the 8-beat spine plays as four
// acts. Titles quote docs/worldbuilding/story/THE-STORYLINE.md canon - this table arranges, it
// does not author. Small, dependency-free module so it survives missions-file consolidation
// unchanged; consumers import it directly rather than through data/missions.js.
//
// Consumers: storyBeatTitle (waypoint labels), the tracker/Codex act paint, and the beat-advance
// direction line. The act is its own field so a beat-specific reason never overwrites it.

export const JOURNEY_ACTS = Object.freeze([
  Object.freeze({
    num: 'I',
    title: 'The Pit',
    beats: Object.freeze([0, 1]),
    verb: 'Sample and haul',
    goal: 'Take the Pit\'s work and learn what the manifest leaves out.',
    line: 'The first thing the Pit asks you not to notice is 12.4 tonnes of alloy.',
  }),
  Object.freeze({
    num: 'II',
    title: 'The Cinder Board',
    beats: Object.freeze([2, 3]),
    verb: 'Trace and clear',
    goal: 'Work the Cinder Board until the names behind it stop being names.',
    line: 'Every contract on the Cinder Board was written by someone who already knew the answer.',
  }),
  Object.freeze({
    num: 'III',
    title: 'Three Doors, One Administrator',
    beats: Object.freeze([4, 5]),
    verb: 'Choose and operate',
    goal: 'Pick a door, run its operation, and prove the branch.',
    line: 'Three factions offer three doors; the desk behind all of them is the same.',
  }),
  Object.freeze({
    num: 'IV',
    title: 'The Deep Reach',
    beats: Object.freeze([6, 7]),
    verb: 'Deploy and commit',
    goal: 'Build income, reach Ashfall, and settle the Deep Reach.',
    line: 'The Deep Reach is where the book stops being paperwork and becomes a disposition.',
  }),
]);

/** The act a beat belongs to, or null past the spine. Null is not beat 0. */
export function journeyActForBeat(beatIndex) {
  if (beatIndex == null || beatIndex === '' || typeof beatIndex === 'boolean') return null;
  const b = Math.floor(Number(beatIndex));
  if (!Number.isFinite(b)) return null;
  return JOURNEY_ACTS.find((act) => act.beats.includes(b)) || null;
}

/** The one-line act heading used by every durable surface: `ACT II - THE CINDER BOARD`. */
export function journeyActLabel(act) {
  if (!act) return '';
  return `ACT ${act.num} - ${String(act.title).toUpperCase()}`;
}
