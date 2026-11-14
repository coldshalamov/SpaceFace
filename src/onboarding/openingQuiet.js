// OPENING-1b — the first minutes carry one guidance voice (design/game/20, rule 2). While the
// opening rail is live and the pilot has not yet docked, ambient notices (landmark IDs, crew
// chatter) stay off the screen: the objective line says what is next, the aim tag says the verb.
// Pure read of onboarding state; never mutates, never touches the RNG.
// The opening's first consequence is the claimed-salvage choice (after the raid), not a police
// report: until the raid is done, latching a hauler's loose cargo must not open a theft case.
export function openingBeforeClaim(state) {
  const ob = state && state.onboarding;
  return openingQuiet(state) && !(ob.beatDoneAt && ob.beatDoneAt.raid != null);
}

export function openingQuiet(state) {
  const ob = state && state.onboarding;
  if (!ob || ob.active !== true || ob.finished === true) return false;
  if (ob.beatDoneAt && ob.beatDoneAt.dock != null) return false;
  return true;
}
