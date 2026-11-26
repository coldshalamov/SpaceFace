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

// DEMO-ADV-2 (opening speaks with one voice): the swing lesson is the opening's throw — the authored
// rock is on the line and the one instruction on the glass names the throw. While that scripted beat
// is current the throw's own payoff receipts (a pilot level, a deed) wait for it to land. (The
// swing-threat read's words are gated for the WHOLE opening by presentationAdapters through
// openingQuiet — a later raid beat that wants the generic banner back switches that gate, not this
// predicate.) Pure read; the beat is written by systems/onboarding.js.
export function openingThrowLessonCurrent(state) {
  const ob = state && state.onboarding;
  if (!ob || ob.active !== true || ob.finished === true) return false;
  const rescue = ob.rescue;
  return !!(rescue && rescue.current === 'swing');
}

// DEMO-ADV-2 (item 2, review): a payoff waits for the whole moment, not only the beat flag. The
// throw clears `rescue.current` in the same dispatch that unlocks the deed it earned, so every
// listener that runs after the throw handler — the achievements ledger, then the caption and
// fanfare — saw the lesson already closed and spoke over the sentence asking for the throw. The
// wait therefore lasts until the instruction that asked for it has left the glass: onboarding
// leaves the `rescue:swing` marker standing through the throw and writes the next objective on its
// following tick. Both callers cap the hold (audio OPENING_PAYOFF_HOLD_MS, toast
// OPENING_HELD_HOLD_MS), so a stuck marker can never swallow a receipt. Pure read.
export function openingThrowPayoffWait(state) {
  if (openingThrowLessonCurrent(state)) return true;
  const ob = state && state.onboarding;
  if (!ob || ob.active !== true || ob.finished === true) return false;
  const rescue = ob.rescue;
  if (!rescue || !rescue.beats || !rescue.beats.swing || rescue.beats.swing.state !== 'done') return false;
  const wp = state.nav && state.nav.waypoint;
  return !!(wp && wp.onboarding === true && wp.markerId === 'rescue:swing');
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
