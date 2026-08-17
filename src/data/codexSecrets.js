// Pure Codex projection for Plan 30 secrets. Locked rows stay deliberately anonymous; this module
// does not infer discovery from proximity or prose. Only durable facts written by the real owners
// can reveal a row.

import { LISTENING_POST, listeningPostPuzzleState } from './listeningPost.js';

function secret(id, title, lockedHint) {
  return Object.freeze({ id, title, lockedHint });
}

export const CODEX_SECRETS = Object.freeze([
  secret('secret_listening_post', 'The Dione Listening Post', 'A carrier cadence is still missing from the archive.'),
  secret('secret_47a_golden_route', 'Tape 47-A', 'One training tape still disagrees with the manifest.'),
  secret('secret_names_in_stars', 'Names in the Stars', 'Some signatures are too regular to be ordinary sky noise.'),
  secret('secret_cache_chain', 'Unregistered Caches', 'A clean cache leaves no board posting.'),
  secret('secret_face', 'The Face', 'The next image is still resolving.'),
  secret('secret_developer', 'The Developer', 'No verified source has signed this entry.'),
]);

function lockedPage(entry) {
  return { ...entry, unlocked: false, phase: 'locked', body: null, note: null };
}

export function codexSecretPages(state = {}) {
  const story = state && state.story && typeof state.story === 'object' ? state.story : {};
  const flags = story.flags && typeof story.flags === 'object' ? story.flags : {};
  const puzzle = listeningPostPuzzleState(state);
  return CODEX_SECRETS.map((entry) => {
    if (entry.id === 'secret_listening_post' && puzzle.recovered) {
      return {
        ...entry,
        unlocked: true,
        phase: puzzle.decoded ? 'decoded' : 'recovered',
        body: puzzle.decoded
          ? `The relay counted ${LISTENING_POST.pulseGroups.join(' then ')}. The pair charts ${LISTENING_POST.targetStationName}.`
          : `The relay counted ${LISTENING_POST.pulseGroups.join(' then ')} around one long pause. The archive has the signal, not the answer.`,
        note: puzzle.decoded
          ? `Chart fix: ${LISTENING_POST.chartCoordinate.x},${LISTENING_POST.chartCoordinate.y}. The station is now a real map target.`
          : 'Working note: treat the two carrier groups as an ordered chart pair.',
      };
    }
    if (entry.id === 'secret_47a_golden_route' && flags.contract_47a_b0_delivered === true) {
      return {
        ...entry,
        unlocked: true,
        phase: 'filed',
        body: 'The recovered sample matched the instrument reading, not the accepted manifest. Payment remained pending after delivery.',
        note: 'Archive note: New Game keeps a fixed-seed 47-A training tape beside the ordinary route.',
      };
    }
    return lockedPage(entry);
  });
}
