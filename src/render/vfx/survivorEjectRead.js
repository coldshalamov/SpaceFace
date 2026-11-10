// Survivor-ejection read — the mayday's opening shot, as pure decisions.
//
// WHAT THIS OWNS
// --------------
// A causal survivor pod ejecting from a killed crew used to arrive silently: a toast and a
// voice bark, and on the glass itself nothing — the rescue loop's START was invisible, so in a
// fight you never saw the mayday being born. This module owns the moment's picture plan:
//
//   gate      only a causal eject plays. The player-wreck pod re-emits its event on every
//             sector re-entry while parked (`source: 'player_wreck'`) — a re-entry is not an
//             ejection, and the player's own death already carries its own defeat read.
//   flash     the retro burn that flung the pod clear: white-hot, small, gone fast.
//   vent      a cold gas whiff from the torn hull mount — pale, drifting, settling.
//   star      the beacon's first full-power shout: the lamp's own warning red, slow enough
//             that the eye keeps it after the flash dies. This is the part that reads at
//             gameplay range and pulls the player toward the rescue.
//   light     the event light rides the director's tell/mayday row (vfxColorLightDirector);
//             this module only names the severity.
//
// The sprites themselves spawn through vfx.js's normal admission and its automatic flash
// accessibility pass — this file invents no pool, no clock and no randomness.

/** The one event that is a real ejection. Rematerialized pods are not re-born. */
export function isSurvivorEjectMoment(payload) {
  return !!(payload
    && payload.source === 'causal_eject'
    && payload.entityId != null);
}

/** The presentation:audio cue id for the ejection (lane prefix 'presentation'). */
export const SURVIVOR_EJECT_CUE_ID = 'presentation.survivor.eject';

/** Sprite admission priority for the whole moment — above scenery, below combat deaths. */
export const SURVIVOR_EJECT_PRIORITY = 0.55;

/**
 * The ejection's sprite plan. Frozen; the numbers are the whole authored moment:
 *   flash  the retro burn — 0.28 s, tight, white-hot.
 *   vent   the mount's cold gas — 0.9 s, pale, small drift.
 *   star   the beacon's first shout — 1.6 s of lamp red at full power, the pull.
 */
export const SURVIVOR_EJECT_FLARE_PLAN = Object.freeze({
  flash: Object.freeze({ color: '#fff3e2', life: 0.28, size0: 0.5, size1: 3.2, op0: 0.85, op1: 0.0 }),
  vent: Object.freeze({ color: '#c8d4da', life: 0.9, size0: 0.6, size1: 2.6, op0: 0.5, op1: 0.0, drift: 5 }),
  star: Object.freeze({ color: '#ff4a3c', life: 1.6, size0: 0.9, size1: 2.2, op0: 0.9, op1: 0.0 }),
});
