// Pure Codex projection for Plan 30 secrets. Locked rows stay deliberately anonymous; this module
// does not infer discovery from proximity or prose. Only durable facts written by the real owners
// can reveal a row.

import { LISTENING_POST, listeningPostPuzzleState } from './listeningPost.js';
import { starSignatureProgress, STAR_SIGNATURE_PLATES } from './starSignatures.js';
import { UNREGISTERED_CACHE_BY_ID, unregisteredCacheProgress } from './unregisteredCaches.js';
import { normalizeTheFaceState, THE_FACE } from './theFace.js';
import { normalizeTheDeveloperState, THE_DEVELOPER } from './theDeveloper.js';

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

function unlockedPage(entry, phase, body, note) {
  return { ...entry, unlocked: true, phase, body, note };
}

/**
 * Names in the Stars unlocks from fabricator plates read on real hardware, never from the chart.
 * A partly-read set is a real, honest intermediate: you have handles but not the pattern yet.
 */
function namesInStarsPage(entry, state) {
  const progress = starSignatureProgress(state);
  if (progress.read <= 0) return lockedPage(entry);
  if (!progress.complete) {
    return unlockedPage(entry, 'partial',
      `${progress.handles.join(', ')} — stamped into lane hardware by whoever set it running. ${progress.read} of ${progress.total} plates read.`,
      'Working note: the same hand scratched a four-point figure under every plate so far.');
  }
  const labels = STAR_SIGNATURE_PLATES.map((plate) => plate.handle).join(', ');
  return unlockedPage(entry, 'complete',
    `All ${progress.total} builder plates read: ${labels}. The four-point figure scratched beneath each one is a star pattern, and every one of those patterns is already on the chart's background sky, carrying the same name.`,
    'Archive note: the sky labels are older than the beacons. Somebody signed the chart first, then the hardware.');
}

/**
 * The cache chain unlocks on the FIRST cache opened and deepens as it fills. The forbidden find is
 * called out because it is the one item in the chain with a real downside attached.
 */
function cacheChainPage(entry, state) {
  const progress = unregisteredCacheProgress(state);
  if (progress.opened <= 0) return lockedPage(entry);
  const names = progress.openedIds
    .map((id) => UNREGISTERED_CACHE_BY_ID.get(id))
    .filter(Boolean)
    .map((def) => def.name);
  const complete = progress.opened >= progress.total;
  return unlockedPage(entry, complete ? 'complete' : 'partial',
    `${progress.opened} of ${progress.total} unregistered caches opened: ${names.join(', ')}. None of them appears on any board, in any manifest, or against any custody tag.`,
    progress.forbiddenFound
      ? 'Archive note: one of these held hardware that is illegal to own, let alone fit. It is aboard.'
      : 'Working note: cache coordinates bought at a bar are deliberately blurred — the last stretch is always flown by eye.');
}

function facePage(entry, state) {
  const own = normalizeTheFaceState(state && state.world && state.world.theFace);
  if (own.phase !== 'seen') return lockedPage(entry);
  return unlockedPage(entry, 'seen',
    `Scanned across the far side of the ${THE_FACE.bodyName} on a bearing of ${Math.round(own.bearingDeg)}°. From that arc and no other, the crater field is a face. The survey charter is four generations old. The face is not on it.`,
    `Archive note: filed as "${THE_FACE.codexTitle}". The yard will cut the mark for you now.`);
}

function developerPage(entry, state) {
  const seed = state && state.meta ? state.meta.seed : null;
  const own = normalizeTheDeveloperState(state && state.world && state.world.theDeveloper, seed);
  if (own.phase === 'unseen') return lockedPage(entry);
  if (own.phase !== 'killed') {
    return unlockedPage(entry, 'seen',
      `${THE_DEVELOPER.name}: no registry, no yard mark, no wear, holding station behind a gate that has not worked in a lifetime. It carries nothing that can shoot. It did not need to.`,
      'Working note: it will not fight and it will not leave. Whatever it is doing there, it was doing before the gate died.');
  }
  return unlockedPage(entry, 'killed',
    `${THE_DEVELOPER.name}, destroyed. It shed one chip of every denomination in circulation — a complete set, as if it had been carrying the example rather than the money — and said one word on an open channel.`,
    `Archive note: the word was "${THE_DEVELOPER.bark}" It was back the next time the universe was.`);
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
    if (entry.id === 'secret_names_in_stars') return namesInStarsPage(entry, state);
    if (entry.id === 'secret_cache_chain') return cacheChainPage(entry, state);
    if (entry.id === 'secret_face') return facePage(entry, state);
    if (entry.id === 'secret_developer') return developerPage(entry, state);
    return lockedPage(entry);
  });
}
