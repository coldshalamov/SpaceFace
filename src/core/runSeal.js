// The run seal (PQ-135).
//
// "Nothing you earn here follows you home" is the Crucible's own promise, printed on its door. The
// credit path was built to honour it — a run chip settles into `state.run.credits` and campaign
// money never moves. Reputation and heat were not, and a live browser walk of five swarm waves
// found both moving: eight factions' standing shifted (one of them by twenty-five points) and the
// player's heat rose far enough to raise WANTED · HUNTERS INBOUND on the HUD, which then sends law
// hunters into the arena to compete for spawn slots with the wave.
//
// So a player could go to the Crucible for ten minutes and come back to the campaign hated by a
// faction they had never met, hunted, and none of it visible as a choice they made.
//
// This is the one question those writers have to ask. It is deliberately a GLOBAL question about
// the session rather than a per-victim one, and that is the opposite of the rule the reward path
// follows — for good reason. Rewards must be per-victim, because ambient traffic inside an arena
// should still settle through the campaign path. The campaign BOUNDARY is the other way round: the
// run is a sealed box, and nothing that happens inside it — including shooting a passing trader —
// is allowed to change who the player is when they leave.
//
// Pure and dependency-free so the two sole-writers (factions.applyRep, heat._raise/_setHeat) can
// ask it without either of them importing a run system.

/**
 * Is a scored run live? True from the moment `run:beginRequested` is honoured until the run ends.
 *
 * Deliberately tolerant of a malformed run: an unreadable envelope answers `false`, because a
 * campaign write is the safe default for a state we cannot identify, and the alternative — silently
 * freezing reputation for the rest of a campaign session — is far worse than one leaked kill.
 */
export function isRunSealed(state) {
  const run = state && state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return false;
  if (run.kind !== 'survival' && run.kind !== 'lab') return false;
  if (typeof run.phase !== 'string') return false;
  return run.phase !== 'inactive' && run.phase !== 'ended';
}
