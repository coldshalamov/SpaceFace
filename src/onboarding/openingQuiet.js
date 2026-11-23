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

// Demo route (2026-11-23): the game's first instruction is the loose rock. Until it has been latched
// and thrown, the "[E] Fly to berth" chip stays off the glass so the screen asks one thing at a time
// (the E key itself still flies to the berth; a pilot who docks early is credited the berth). Once
// the throw lands, the berth is the instruction and the chip returns with it.
export function openingHoldsBerthOffer(state) {
  if (!openingQuiet(state)) return false;
  const ob = state.onboarding;
  const done = ob.beatDoneAt || {};
  if (done.berth != null) return false;
  if (done.tether == null) return true;
  return !!(ob.rescue && ob.rescue.current === 'swing');
}

// OPENING-1b: until the raid is done no NPC tractor may take a body the pilot is latched to, nor work
// within reach of the pilot's line (a passing hauler must not steal the first rock or the swing).
export const OPENING_NPC_TOW_KEEPOUT_WU = 420;
export function npcTowAllowedInOpening(state, target) {
  if (!openingBeforeClaim(state) && !(state && state.onboarding && state.onboarding.finished !== true
      && !(state.onboarding.beatDoneAt && state.onboarding.beatDoneAt.raid != null))) return true;
  if (!target) return true;
  const held = state.player && state.player.tether && state.player.tether.targetId;
  if (held != null && held === target.id) return false;
  const me = state.entities && state.entities.get && state.entities.get(state.playerId);
  if (me && me.pos && target.pos && Math.hypot(target.pos.x - me.pos.x, target.pos.z - me.pos.z) < OPENING_NPC_TOW_KEEPOUT_WU) return false;
  return true;
}
