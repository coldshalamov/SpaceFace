// Swarm teaching tokens (DEMO-SWARM-TUTOR-1, owner demo 2026-11-23).
//
// A teaching card names the ONE mechanic it teaches, and that token is what retires it: the first
// Wasp the player actually hooks retires whichever card was explaining the Line. The tokens live
// here — pure data, no DOM and no runtime — because both sides read them: the sim decides which
// card a first sighting is worth (`src/systems/survivalAnnounce.js`), and the lane draws and
// retires it (`src/ui/swarmTeaching.js`). One table, so a rename cannot half-apply.

/** How long a teaching card stays on the glass, in seconds (~6 s, owner demo). */
export const SWARM_TEACHING_TTL_S = 6;

/** The mechanic tokens a card can teach. */
export const SWARM_TEACH_MECHANIC = Object.freeze({
  line: 'line',
  power: (name) => (typeof name === 'string' && name ? `power:${name}` : ''),
});

/**
 * The mechanic a hostile's first-sighting lesson exercises. Only hulls whose lesson IS a verb the
 * player can perform in the next few seconds name one — the card retires when that verb is used.
 * A hull with no entry teaches a fact, so it retires on its own timer and nothing else.
 */
export const SWARM_TEACH_MECHANIC_BY_ENEMY = Object.freeze({
  wasp_swarmer: SWARM_TEACH_MECHANIC.line,
  detonator_dart: SWARM_TEACH_MECHANIC.line,
  corsair_raider: SWARM_TEACH_MECHANIC.line,
  tether_control_raider: SWARM_TEACH_MECHANIC.line,
});
