// W1 Journey framing (campaign W1, owner direction 2026-11-06): the 8-beat spine plays as four
// acts. Titles quote docs/worldbuilding/story/THE-STORYLINE.md canon — this table arranges, it
// does not author. Small, dependency-free module so it survives missions-file consolidation
// unchanged; consumers import it directly rather than through data/missions.js.
//
// Consumers: storyBeatTitle (tracker/story waypoint labels) and the beat-advance direction toast,
// which opens the act only on the beat where the act turns.

export const JOURNEY_ACTS = Object.freeze([
  Object.freeze({ num: 'I', title: 'The Pit', beats: Object.freeze([0, 1]) }),
  Object.freeze({ num: 'II', title: 'The Cinder Board', beats: Object.freeze([2, 3]) }),
  Object.freeze({ num: 'III', title: 'Three Doors, One Administrator', beats: Object.freeze([4, 5]) }),
  Object.freeze({ num: 'IV', title: 'The Deep Reach', beats: Object.freeze([6, 7]) }),
]);

/** The act a beat belongs to, or null past the spine. */
export function journeyActForBeat(beatIndex) {
  const b = Math.floor(Number(beatIndex));
  if (!Number.isFinite(b)) return null;
  return JOURNEY_ACTS.find((act) => act.beats.includes(b)) || null;
}
