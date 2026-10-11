// Kinetic League — six match grammars, four arenas, a twelve-event solo circuit.
// Isolated from the persistent world. Expand BRACKET; do not replace it.

export { ARENAS, arenaById } from './arenas.js';
export { EVENTS, WIN_KINDS, eventById, eventsInArena, arenaList } from './circuit.js';
export { RIVAL_IDS, describeRival, rivalForceFor } from './rivals.js';
export {
  freshLeagueMemory,
  normalizeLeagueMemory,
  tierUnlocked,
  claimPurse,
  TIERS,
} from './memory.js';
export {
  noteBracketDiscovery,
  maybeEnterLeague,
  nextUnlockedEvent,
  discoveryCopy,
  leagueGateWorld,
  LEAGUE_GATE,
} from './discover.js';
export {
  createSession,
  stepSession,
  runMatch,
  retrySession,
  leaveVenue,
  unload,
  destroySession,
  worldFootprint,
  applyMatchDamage,
  serializeSession,
  deserializeSession,
  summaryOf,
  exhibitTrace,
  commandFromSolution,
  resultView,
} from './session.js';
export { sweptDiskCross, sweptEnterDisk, DT } from './geometry.js';
export { createKineticLeague } from './system.js';
export { writeGallery, renderArena, GALLERY_FILES, pngSize } from './gallery.js';

export const LEAGUE_ID = 'kinetic-league';

export function sportManifest() {
  return {
    id: LEAGUE_ID,
    sports: ['keeper', 'bank', 'curl', 'relay', 'magnet', 'contain'],
    arenas: ['yard', 'house', 'slip', 'dock'],
    events: 12,
    physics: 'xz-semi-implicit-euler',
    rng: 'injected-mulberry32',
  };
}
