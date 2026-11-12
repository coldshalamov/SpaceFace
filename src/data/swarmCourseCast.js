// C01-04 — the course's cast table: who actually comes through the gates on each of the
// Pit's thirty rounds. G08-02 gave every round a name and a twist line; this table is the
// roster half of keeping that promise. A round's name is a promise about what the round
// IS — "Bruisers" fields Bruisers, "Lancers at the edges, Wasps in the middle" fields
// Lancers on the edge bearings and Wasps on the middle ones.
//
// Row contract (mirrors SWARM_ACT's package idiom in swarmMode.js):
//   round    — the literal course round, 1..30 only
//   stream   — [{ enemyId, weight }] — the ONLY archetypes the reinforcement stream may
//              draw all round. Roles come from the canonical SWARM_ROSTER at resolution;
//              weights are spawn shares (the named body leads, fodder follows).
//   packages — the authored opening schedule, same shape an act round resolves to:
//              { enemyId, count, gate | gateIndex, atTick, debut, staged, distance }
//                * gate        — a literal bearing id ('nw'…'diagonal_b'), 'free' (first
//                                unused bearing), or 'same' (the previous package's gate —
//                                a pair arriving as one event)
//                * gateIndex   — walks this wave's gate ring like an ordinary arrival
//                * atTick      — dispatch tick inside the round (opening groups stagger
//                                ~12 ticks like a generated wave's own groups)
//                * debut: true — the SF-064 single readable first sighting: alone, a beat
//                                late (~4 s), a little far out, on an unused bearing;
//                                owed like a champion. Reserved for an archetype's FIRST
//                                appearance in the course — the stream holds it until the
//                                arrival lands, exactly like a roster-clock debut, and no
//                                group of the same silhouette may land before it (its pack
//                                follows on the ticks behind the beat, never ahead of it).
//                * staged: true — a body the wave owes landing alone on its own bearing,
//                                same beat, without the first-sighting semantics.
//                * distance    — materialisation distance; defaults to the debut ring on
//                                debut/staged bodies, the ordinary ring otherwise.
//
// Boss rounds (5/10/15/20/25/30) still field their champion through the ordinary boss
// path — the table authors only the round's chaff, picked to serve the boss's counter
// (Iron Maw wants Detonators to eat; the Anvil wants fodder to throw at it).
// Past round 30 the open ladder keeps the generated endless composition — no rows here.
//
// KEEPING THE CURVE: a non-boss row's package bodies sum to the wave's ordinary opening
// pressure (swarmPressureAt(w, 0)) and a boss row's chaff to what the generated burst
// would have fielded beside the champion — concurrency, quota and timing are untouched;
// only the MIX is authored.

import { SURVIVAL_GATE_GROUPS } from './survivalWaves.js';
import { swarmCharacterFor } from './swarmCharacter.js';

function spec(entry) {
  return Object.freeze(entry);
}

function castRound(round, stream, packages) {
  return Object.freeze({
    round,
    stream: Object.freeze(stream.map(spec)),
    packages: Object.freeze(packages.map(spec)),
  });
}

const W = (enemyId, weight) => ({ enemyId, weight });
const P = (enemyId, count, extra = {}) => ({ enemyId, count, ...extra });

export const SWARM_COURSE_CAST = Object.freeze([
  // 1 — ten Wasps, one gate. The opening pressure IS ten hulls: the design's sentence
  // is the wave's literal composition.
  castRound(1, [W('wasp_swarmer', 10)], [
    P('wasp_swarmer', 10, { gateIndex: 0, atTick: 0 }),
  ]),
  // 2 — Wasps from two gates: front and rear doors at once.
  castRound(2, [W('wasp_swarmer', 10)], [
    P('wasp_swarmer', 5, { gate: 'front', atTick: 0 }),
    P('wasp_swarmer', 5, { gate: 'rear', atTick: 12 }),
  ]),
  // 3 — Detonator Darts: the round that teaches throwing things back. Wasps open as the
  // targets; the dart's first sighting steps out alone on the debut beat, its pack behind.
  castRound(3, [W('detonator_dart', 7), W('wasp_swarmer', 3)], [
    P('detonator_dart', 1, { debut: true }),
    P('wasp_swarmer', 3, { gate: 'front', atTick: 0 }),
    P('wasp_swarmer', 3, { gate: 'rear', atTick: 12 }),
    P('detonator_dart', 3, { gate: 'diagonal_a', atTick: 252 }),
  ]),
  // 4 — the lane runs for the first time, with Wasps on both sides of it: the two
  // literal side bearings flank the freight lane wherever it runs.
  castRound(4, [W('wasp_swarmer', 10)], [
    P('wasp_swarmer', 5, { gate: 'diagonal_a', atTick: 0 }),
    P('wasp_swarmer', 5, { gate: 'diagonal_b', atTick: 12 }),
  ]),
  // 5 — Iron Maw (boss). Chaff carries Detonators: "until you throw a Detonator" only
  // works if the room keeps feeding them.
  castRound(5, [W('detonator_dart', 6), W('wasp_swarmer', 4)], [
    P('detonator_dart', 5, { gateIndex: 1, atTick: 0 }),
    P('wasp_swarmer', 4, { gateIndex: 3, atTick: 12 }),
  ]),
  // 6 — Bruisers. Wasps land first as the bait wall; the first sighting commits alone on
  // the debut beat, then the charge packs in behind it.
  castRound(6, [W('bruiser_brawler', 7), W('wasp_swarmer', 3)], [
    P('bruiser_brawler', 1, { debut: true }),
    P('wasp_swarmer', 3, { gateIndex: 0, atTick: 0 }),
    P('wasp_swarmer', 3, { gateIndex: 2, atTick: 12 }),
    P('bruiser_brawler', 3, { gateIndex: 4, atTick: 252 }),
  ]),
  // 7 — Lancers at the edges, Wasps in the middle. The edge bearings are the literal
  // left/right doors (diagonal_a west, diagonal_b east); front/rear are the middle.
  castRound(7, [W('lancer_sniper', 6), W('wasp_swarmer', 4)], [
    P('lancer_sniper', 2, { gate: 'diagonal_a', atTick: 0 }),
    P('lancer_sniper', 2, { gate: 'diagonal_b', atTick: 0 }),
    P('wasp_swarmer', 4, { gate: 'front', atTick: 12 }),
    P('wasp_swarmer', 3, { gate: 'rear', atTick: 24 }),
  ]),
  // 8 — Jackals: Wasp fodder opens, a first solo sowing lands on the debut beat, then
  // the mine-lane pack behind it.
  castRound(8, [W('mine_layer_jackal', 7), W('wasp_swarmer', 3)], [
    P('mine_layer_jackal', 1, { debut: true }),
    P('wasp_swarmer', 4, { gateIndex: 0, atTick: 0 }),
    P('wasp_swarmer', 3, { gateIndex: 2, atTick: 12 }),
    P('mine_layer_jackal', 4, { gateIndex: 4, atTick: 252 }),
  ]),
  // 9 — Tether Raiders: fodder first, the rope's first cast alone on the debut beat, then
  // the pack that keeps the player attached for half the round.
  castRound(9, [W('tether_control_raider', 7), W('wasp_swarmer', 3)], [
    P('tether_control_raider', 1, { debut: true }),
    P('wasp_swarmer', 4, { gateIndex: 0, atTick: 0 }),
    P('wasp_swarmer', 3, { gateIndex: 2, atTick: 12 }),
    P('tether_control_raider', 4, { gateIndex: 4, atTick: 252 }),
  ]),
  // 10 — Corsair Wing (boss): three raider aces flying as one. Light chaff — the wing's
  // own bank-and-tear is the fight.
  castRound(10, [W('wasp_swarmer', 6), W('choir_zealot', 4)], [
    P('wasp_swarmer', 4, { gate: 'front', atTick: 0 }),
    P('choir_zealot', 4, { gate: 'rear', atTick: 12 }),
  ]),
  // 11 — a Warden shielding gunners: the warden rides one Lancer group's own gate —
  // the dome lands inside its ward, not beside it.
  castRound(11, [W('lancer_sniper', 5), W('wasp_swarmer', 4), W('warden_escort', 3)], [
    P('lancer_sniper', 4, { gateIndex: 0, atTick: 0 }),
    P('warden_escort', 1, { gate: 'same', atTick: 0, staged: true }),
    P('lancer_sniper', 3, { gateIndex: 2, atTick: 12 }),
    P('wasp_swarmer', 6, { gateIndex: 4, atTick: 24 }),
  ]),
  // 12 — enemies arrive on the freight (the ride is C01-05's mechanic): the cast is a
  // mixed manifest worth cutting loose.
  castRound(12, [W('wasp_swarmer', 5), W('choir_zealot', 4), W('corsair_raider', 3), W('reaver_pirate', 3)], [
    P('wasp_swarmer', 5, { gate: 'front', atTick: 0 }),
    P('choir_zealot', 4, { gate: 'rear', atTick: 12 }),
    P('corsair_raider', 3, { gate: 'nw', atTick: 24 }),
    P('reaver_pirate', 3, { gate: 'se', atTick: 36 }),
  ]),
  // 13 — Ghosts. Ordinary Wasps open; one shimmer alone on the debut beat — the arena
  // dims (C01-05) and the rest of the cold pack follows behind it.
  castRound(13, [W('quiet_ghost', 7), W('wasp_swarmer', 3)], [
    P('quiet_ghost', 1, { debut: true }),
    P('wasp_swarmer', 3, { gateIndex: 0, atTick: 0 }),
    P('wasp_swarmer', 3, { gateIndex: 2, atTick: 12 }),
    P('wasp_swarmer', 3, { gateIndex: 4, atTick: 24 }),
    P('quiet_ghost', 3, { gateIndex: 6, atTick: 252 }),
    P('quiet_ghost', 3, { gateIndex: 1, atTick: 264 }),
  ]),
  // 14 — Anchor Controllers: fodder and a Corsair escort open, the first anchor stages
  // alone on the debut beat, then the pinning detail behind it.
  castRound(14, [W('field_anchor_controller', 6), W('wasp_swarmer', 3), W('corsair_raider', 2)], [
    P('field_anchor_controller', 1, { debut: true }),
    P('wasp_swarmer', 4, { gateIndex: 0, atTick: 0 }),
    P('wasp_swarmer', 4, { gateIndex: 2, atTick: 12 }),
    P('corsair_raider', 4, { gateIndex: 4, atTick: 24 }),
    P('field_anchor_controller', 4, { gateIndex: 6, atTick: 252 }),
  ]),
  // 15 — Mirrorjaw Foreman (boss). "Hit it with a rock" wants nothing special from the
  // chaff — light bodies to throw or hide behind.
  castRound(15, [W('wasp_swarmer', 5), W('choir_zealot', 3), W('detonator_dart', 3)], [
    P('wasp_swarmer', 4, { gate: 'front', atTick: 0 }),
    P('choir_zealot', 3, { gate: 'rear', atTick: 12 }),
    P('detonator_dart', 3, { gate: 'nw', atTick: 24 }),
  ]),
  // 16 — both lanes, double the traffic, a full pack: the broad mix is the point.
  castRound(16, [W('wasp_swarmer', 4), W('choir_zealot', 3), W('reaver_pirate', 3), W('corsair_raider', 3), W('detonator_dart', 2)], [
    P('wasp_swarmer', 5, { gateIndex: 0, atTick: 0 }),
    P('choir_zealot', 4, { gateIndex: 2, atTick: 12 }),
    P('reaver_pirate', 4, { gateIndex: 4, atTick: 24 }),
    P('corsair_raider', 3, { gateIndex: 6, atTick: 36 }),
    P('detonator_dart', 3, { gateIndex: 1, atTick: 48 }),
  ]),
  // 17 — Point-Defense Screens: the screens shoot down anything small, so the same
  // room fields the big answers — Bruisers and Anchors open as the something-big,
  // the first screen stages alone on the debut beat, its battery line behind it.
  castRound(17, [W('pd_screen_escort', 5), W('bruiser_brawler', 4), W('field_anchor_controller', 3), W('wasp_swarmer', 2)], [
    P('pd_screen_escort', 1, { debut: true }),
    P('bruiser_brawler', 3, { gate: 'nw', atTick: 0 }),
    P('field_anchor_controller', 3, { gate: 'ne', atTick: 12 }),
    P('wasp_swarmer', 8, { gate: 'rear', atTick: 24 }),
    P('pd_screen_escort', 4, { gate: 'front', atTick: 252 }),
  ]),
  // 18 — Reavers: the pack that steals your Scrap, with Wasps to scatter when a
  // caller dies.
  castRound(18, [W('reaver_pirate', 7), W('wasp_swarmer', 4)], [
    P('reaver_pirate', 4, { gateIndex: 0, atTick: 0 }),
    P('reaver_pirate', 3, { gateIndex: 2, atTick: 12 }),
    P('reaver_pirate', 3, { gateIndex: 4, atTick: 24 }),
    P('wasp_swarmer', 9, { gateIndex: 6, atTick: 36 }),
  ]),
  // 19 — Lawmen and Cutters: plated press and the EMP cone, boxing in. The Cutters
  // and fodder open on three bearings; the lawman's first sighting arrives alone on
  // the debut beat, then the plated press closes the box behind it.
  castRound(19, [W('patrol_lawman', 5), W('customs_cutter', 5), W('wasp_swarmer', 2)], [
    P('patrol_lawman', 1, { debut: true }),
    P('customs_cutter', 3, { gate: 'nw', atTick: 0 }),
    P('customs_cutter', 3, { gate: 'ne', atTick: 12 }),
    P('wasp_swarmer', 6, { gate: 'front', atTick: 24 }),
    P('patrol_lawman', 3, { gate: 'sw', atTick: 252 }),
    P('patrol_lawman', 3, { gate: 'se', atTick: 264 }),
  ]),
  // 20 — The Yardmaster (boss): it controls the freight. Chaff is freight-floor life —
  // Wasps, a Corsair wing pair, a Choir knot.
  castRound(20, [W('wasp_swarmer', 5), W('corsair_raider', 3), W('choir_zealot', 3)], [
    P('wasp_swarmer', 4, { gateIndex: 1, atTick: 0 }),
    P('corsair_raider', 3, { gateIndex: 3, atTick: 12 }),
    P('choir_zealot', 3, { gateIndex: 5, atTick: 24 }),
  ]),
  // 21 — heavies, shoulder to shoulder: the plated wall crosses the north bearings as
  // one front (nw, front, ne), Wasps loose behind it as room-ammunition.
  castRound(21, [W('bruiser_brawler', 5), W('field_anchor_controller', 4), W('patrol_lawman', 4)], [
    P('bruiser_brawler', 4, { gate: 'nw', atTick: 0 }),
    P('patrol_lawman', 4, { gate: 'front', atTick: 0 }),
    P('field_anchor_controller', 4, { gate: 'ne', atTick: 0 }),
    P('wasp_swarmer', 7, { gate: 'rear', atTick: 24 }),
  ]),
  // 22 — every enemy is tethered to another (the pairing rope is C01-05's mechanic):
  // a mixed pack — everything on the floor is somebody's partner.
  castRound(22, [W('wasp_swarmer', 4), W('choir_zealot', 4), W('tether_control_raider', 4), W('reaver_pirate', 3)], [
    P('wasp_swarmer', 6, { gate: 'front', atTick: 0 }),
    P('choir_zealot', 5, { gate: 'rear', atTick: 12 }),
    P('reaver_pirate', 4, { gate: 'nw', atTick: 24 }),
    P('tether_control_raider', 4, { gate: 'se', atTick: 36 }),
  ]),
  // 23 — Zealots in rings: one arrival on every bearing at once — the ring is the
  // formation. The singer itself is shepherd_pulse's business (the dealt twist).
  castRound(23, [W('choir_zealot', 8), W('wasp_swarmer', 2)], [
    P('choir_zealot', 3, { gate: 'nw', atTick: 0 }),
    P('choir_zealot', 3, { gate: 'ne', atTick: 0 }),
    P('choir_zealot', 2, { gate: 'se', atTick: 0 }),
    P('choir_zealot', 2, { gate: 'sw', atTick: 0 }),
    P('choir_zealot', 3, { gate: 'front', atTick: 0 }),
    P('choir_zealot', 2, { gate: 'rear', atTick: 0 }),
    P('choir_zealot', 2, { gate: 'diagonal_a', atTick: 0 }),
    P('choir_zealot', 2, { gate: 'diagonal_b', atTick: 0 }),
  ]),
  // 24 — prices halved, enemies doubled (the ×2 count and the 90 s are C01-05's
  // mechanic): the cast is the sell-out crowd — a full-variety pack.
  castRound(24, [W('wasp_swarmer', 4), W('choir_zealot', 3), W('reaver_pirate', 3), W('corsair_raider', 3), W('detonator_dart', 2)], [
    P('wasp_swarmer', 5, { gate: 'front', atTick: 0 }),
    P('choir_zealot', 4, { gate: 'rear', atTick: 12 }),
    P('reaver_pirate', 4, { gate: 'nw', atTick: 24 }),
    P('corsair_raider', 3, { gate: 'se', atTick: 36 }),
    P('detonator_dart', 3, { gate: 'diagonal_a', atTick: 48 }),
  ]),
  // 25 — The Anvil (boss): too heavy to move, so move everything else into it — the
  // chaff is the ammunition the line asks for.
  castRound(25, [W('wasp_swarmer', 5), W('detonator_dart', 4), W('choir_zealot', 3)], [
    P('wasp_swarmer', 3, { gateIndex: 1, atTick: 0 }),
    P('choir_zealot', 2, { gateIndex: 3, atTick: 12 }),
    P('detonator_dart', 2, { gateIndex: 5, atTick: 24 }),
  ]),
  // 26 — two Wardens covering each other: the pair rides one gate as one event —
  // each dome is the other's ward — over a gunner line and fodder.
  castRound(26, [W('lancer_sniper', 5), W('warden_escort', 4), W('wasp_swarmer', 3)], [
    P('lancer_sniper', 4, { gateIndex: 0, atTick: 0 }),
    P('warden_escort', 2, { gate: 'same', atTick: 0, staged: true }),
    P('lancer_sniper', 4, { gateIndex: 2, atTick: 12 }),
    P('wasp_swarmer', 9, { gate: 'rear', atTick: 24 }),
  ]),
  // 27 — a heavy rides the freight round and round. The ride itself is no shipped
  // mechanic (C01-05 covers rounds 12/19/20 freight work but not this one); the cast
  // fields THE heavy, staged alone on its own bearing, plus the pack it rides through.
  castRound(27, [W('bruiser_brawler', 5), W('wasp_swarmer', 4), W('corsair_raider', 3)], [
    P('bruiser_brawler', 1, { staged: true }),
    P('wasp_swarmer', 6, { gateIndex: 0, atTick: 0 }),
    P('wasp_swarmer', 6, { gateIndex: 2, atTick: 12 }),
    P('corsair_raider', 6, { gateIndex: 4, atTick: 24 }),
  ]),
  // 28 — every enemy type in the sheet fields at once (C01-05's own row names the
  // drops half). One of each across two ticks — Black Friday's crowd.
  castRound(28, [
    W('wasp_swarmer', 2), W('reaver_pirate', 2), W('choir_zealot', 2), W('detonator_dart', 2),
    W('mine_layer_jackal', 2), W('lancer_sniper', 2), W('warden_escort', 2), W('corsair_raider', 2),
    W('quiet_ghost', 2), W('customs_cutter', 2), W('pd_screen_escort', 2), W('patrol_lawman', 2),
    W('tether_control_raider', 2), W('bruiser_brawler', 2), W('field_anchor_controller', 2),
  ], [
    P('wasp_swarmer', 5, { gateIndex: 0, atTick: 0 }),
    P('reaver_pirate', 1, { gateIndex: 1, atTick: 0 }),
    P('choir_zealot', 1, { gateIndex: 2, atTick: 0 }),
    P('detonator_dart', 1, { gateIndex: 3, atTick: 0 }),
    P('mine_layer_jackal', 1, { gateIndex: 4, atTick: 0 }),
    P('lancer_sniper', 1, { gateIndex: 5, atTick: 0 }),
    P('warden_escort', 1, { gateIndex: 6, atTick: 0 }),
    P('corsair_raider', 1, { gateIndex: 7, atTick: 0 }),
    P('quiet_ghost', 1, { gateIndex: 0, atTick: 12 }),
    P('customs_cutter', 1, { gateIndex: 1, atTick: 12 }),
    P('pd_screen_escort', 1, { gateIndex: 2, atTick: 12 }),
    P('patrol_lawman', 1, { gateIndex: 3, atTick: 12 }),
    P('tether_control_raider', 1, { gateIndex: 4, atTick: 12 }),
    P('bruiser_brawler', 1, { gateIndex: 5, atTick: 12 }),
    P('field_anchor_controller', 1, { gateIndex: 6, atTick: 12 }),
  ]),
  // 29 — then the gates all open together: every door on one tick (the 40 s hold and
  // its countdown are C01-05's mechanic; the cast's gate set is the composition).
  castRound(29, [W('wasp_swarmer', 5), W('choir_zealot', 3), W('reaver_pirate', 3), W('corsair_raider', 2)], [
    P('wasp_swarmer', 3, { gate: 'nw', atTick: 0 }),
    P('wasp_swarmer', 3, { gate: 'ne', atTick: 0 }),
    P('choir_zealot', 2, { gate: 'se', atTick: 0 }),
    P('choir_zealot', 2, { gate: 'sw', atTick: 0 }),
    P('wasp_swarmer', 3, { gate: 'front', atTick: 0 }),
    P('reaver_pirate', 2, { gate: 'rear', atTick: 0 }),
    P('corsair_raider', 2, { gate: 'diagonal_a', atTick: 0 }),
    P('reaver_pirate', 2, { gate: 'diagonal_b', atTick: 0 }),
  ]),
  // 30 — The Forge Regent (final boss): the last room feeds on the whole course's
  // fodder — Wasps, Darts and a Choir knot as furnace fuel.
  castRound(30, [W('wasp_swarmer', 4), W('detonator_dart', 3), W('choir_zealot', 3)], [
    P('wasp_swarmer', 4, { gateIndex: 1, atTick: 0 }),
    P('detonator_dart', 3, { gateIndex: 3, atTick: 12 }),
    P('choir_zealot', 3, { gateIndex: 5, atTick: 24 }),
  ]),
]);

const CAST_GATE_SET = new Set(SURVIVAL_GATE_GROUPS);

/** The authored cast row for a course wave — literal rounds 1..30 only. */
export function swarmCastFor(wave) {
  const w = Number.isInteger(wave) ? wave : 0;
  return w >= 1 && w <= SWARM_COURSE_CAST.length ? SWARM_COURSE_CAST[w - 1] : null;
}

/**
 * Every enemy id a course wave's cast may field, in row order — stream first (the mix
 * the stream keeps all round), then any package-only extras. Boss bodies are not cast
 * members; the boss path owns them.
 */
export function swarmCastIdsFor(wave) {
  const cast = swarmCastFor(wave);
  if (!cast) return [];
  const ids = [];
  for (const entry of cast.stream) {
    if (!ids.includes(entry.enemyId)) ids.push(entry.enemyId);
  }
  for (const pkg of cast.packages) {
    if (!ids.includes(pkg.enemyId)) ids.push(pkg.enemyId);
  }
  return ids;
}

/** The earliest course round whose cast fields this enemy id, or null. */
export function swarmCastFirstWaveFor(enemyId) {
  for (const cast of SWARM_COURSE_CAST) {
    for (const entry of cast.stream) {
      if (entry.enemyId === enemyId) return cast.round;
    }
    for (const pkg of cast.packages) {
      if (pkg.enemyId === enemyId) return cast.round;
    }
  }
  return null;
}

/**
 * Authoring check for the table itself: every row's ids exist in the character sheet,
 * gates name legal bearings, counts are positive, debut flags ride only a first
 * appearance, and no row opens over the spawn budget. Empty when honest — mirrors
 * swarmActIssues' role.
 */
export function swarmCourseCastIssues() {
  const issues = [];
  for (const cast of SWARM_COURSE_CAST) {
    issues.push(...castIssuesFor(cast));
  }
  return issues;
}

/** The same check, scoped to one wave's row — the planner's guard, like swarmActIssues. */
export function swarmCastIssues(wave) {
  const cast = swarmCastFor(wave);
  return cast ? castIssuesFor(cast) : [];
}

function castIssuesFor(cast) {
  const issues = [];
  if (!Array.isArray(cast.stream) || cast.stream.length === 0) {
    issues.push({ path: `cast[${cast.round}].stream`, message: `round ${cast.round} streams nothing` });
  }
  let opening = 0;
  for (const [i, entry] of cast.stream.entries()) {
    if (!swarmCharacterFor(entry.enemyId)) {
      issues.push({ path: `cast[${cast.round}].stream[${i}]`, message: `round ${cast.round} streams unknown enemy '${entry.enemyId}'` });
    }
    if (!(Number.isFinite(entry.weight) && entry.weight > 0)) {
      issues.push({ path: `cast[${cast.round}].stream[${i}]`, message: `round ${cast.round} stream '${entry.enemyId}' has no legal weight` });
    }
  }
  for (const [i, pkg] of cast.packages.entries()) {
    if (!swarmCharacterFor(pkg.enemyId)) {
      issues.push({ path: `cast[${cast.round}].packages[${i}]`, message: `round ${cast.round} fields unknown enemy '${pkg.enemyId}'` });
    }
    if (!(Number.isInteger(pkg.count) && pkg.count >= 1)) {
      issues.push({ path: `cast[${cast.round}].packages[${i}]`, message: `round ${cast.round} package '${pkg.enemyId}' has no legal count` });
    } else {
      opening += pkg.count;
    }
    if (typeof pkg.gate === 'string' && pkg.gate !== 'free' && pkg.gate !== 'same' && !CAST_GATE_SET.has(pkg.gate)) {
      issues.push({ path: `cast[${cast.round}].packages[${i}]`, message: `round ${cast.round} names unknown gate '${pkg.gate}'` });
    }
    if (pkg.debut === true && swarmCastFirstWaveFor(pkg.enemyId) !== cast.round) {
      issues.push({ path: `cast[${cast.round}].packages[${i}]`, message: `round ${cast.round} debuts '${pkg.enemyId}' after its first appearance` });
    }
  }
  if (opening > 24) {
    issues.push({ path: `cast[${cast.round}].packages`, message: `round ${cast.round} opening burst ${opening} exceeds budget 24` });
  }
  return issues;
}
