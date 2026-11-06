// inf-sac-death-voice — the Hive sac's death speaks the Hive's own acid voice.
//
// WHAT THIS OWNS
// --------------
// A Hive spawn sac is the room's win lever: the tide the sac was feeding stops early, the
// brood mourn the corpse, and survivalAnnounce names the tide law the first time one dies.
// Yet on the glass the sac was an anonymous rock that died an anonymous rock's death — the
// same grey conchoidal cleavage and the same default-ore flash as every barren stone. You
// could never tell WHICH body you had broken, or that its death took the tide with it.
//
// The sac is meat on rock: the fracture stays physical (it breaks through the ordinary
// shatter grammar), but the voice is the Hive's — the same acid family the brood's own
// attack language speaks (the windup rings' green, the acid lob's lit body). When the tag
// says the broken body is a sac, the shatter reads:
//
//   light   the shatter light wears the marker green instead of the ore default.
//   tear    the membrane's white-green burn — bigger and hotter than the rock's flash beat.
//   vent    the acid breath — the sac's own pool colour drifting out over the corpse.
//   star    the lit acid body that outlives the tear (the lob's green), so the eye keeps
//           the read after the flash dies.
//
// Sprites spawn through vfx.js's normal admission and its automatic flash accessibility
// pass. This file invents no pool, no clock and no randomness.

import { HIVE_SAC_TAG } from '../../systems/theHiveArena.js';

/** True when the broken body carries the Hive's spawn-sac tag. Pure. */
export function isHiveSacBody(entity) {
  return !!(entity && entity.data && entity.data[HIVE_SAC_TAG] === true);
}

/**
 * The sac's death voice: the two-beat burst layered over the ordinary shatter, in the
 * Hive's acid family. Frozen — the numbers are the whole authored read.
 */
export const HIVE_SAC_VOICE = Object.freeze({
  // The marker green — the windup ring's own colour — for the room-reaching shatter light.
  lightColor: '#6cff9a',
  // The membrane tear: white-green, hot, gone fast.
  tear: Object.freeze({ color: '#d6ffe2', life: 0.45, size0: 3.2, size1: 14, op0: 0.9 }),
  // The acid breath: the pool's family green drifting out over where it fed.
  vent: Object.freeze({ color: '#5fd98a', life: 1.1, size0: 4.0, size1: 16, op0: 0.55, drift: 8 }),
  // The lit acid body: outlives the tear ~3:1 so the read survives the flash.
  star: Object.freeze({ color: '#8affb0', life: 1.4, size0: 2.0, size1: 7, op0: 0.8 }),
});
