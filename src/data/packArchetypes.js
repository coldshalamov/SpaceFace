// Pack-brain archetypes: the per-kind numbers that give each Swarm ship its fighting character
// under the context-steering brain (src/ai/pack/packBrain.js). One row per enemy id. A kind with
// no row stays on the tactical stack.
//
// Row contract:
//   doctrineId      — the doctrine id the hull carries for fire authority and for the existing
//                     tell/phase listeners (HUD chips, lane VFX, barks). Never a new doctrine.
//   windupPhase/windupKind — the phase name and ai:telegraph kind of the ≥ 0.6 s tell
//   strikePhase     — the phase name published while the attack is live (fire window)
//   attack          — 'gun_pass' (run through the player's predicted position with guns hot),
//                     'ram_fuse' (close to a hold ring, light the fuse, commit straight in),
//                     'gun_hold' (hold a firing post and burst)
//   speed           — cruise WU/s (the character sheet's number; the archetype owns its pace)
//   strikeSpeedMult — committed-run speed as a fraction of cruise
//   ringWU          — the radius it presses at around the player before a strike
//   ingressWU       — the distance at which a strike may begin
//   windupTicks     — tell length (floored at PACK_TELL_FLOOR_TICKS)
//   strikeMinTicks/strikeMaxTicks — committed-run bounds
//   recoverTicks    — break-off after the run
//   cooldownTicks   — minimum gap between strikes for one hull
//   separationWU    — clearance kept from flight-mates (fodder bunches tight so it bowls)
//   dodgeTier       — thrown-body table (03_COMBAT.md §9): fodder never, light/medium/heavy
//   interest        — goal / flow (flight alignment) / cohesion / side (flank lobe width)
//   danger          — hazard (rock/hull) and body (incoming thrown body) strengths
//   anchorToFlight  — 'centroid' parks the hull inside its flight (the Zealot sits in the river)

export const PACK_TELL_FLOOR_TICKS = 36;

const row = (r) => Object.freeze({ ...r,
  interest: Object.freeze(r.interest), danger: Object.freeze(r.danger) });

export const PACK_ARCHETYPES = Object.freeze({
  wasp_swarmer: row({
    doctrineId: 'swarm_pack', windupPhase: 'engine_flare', windupKind: 'engine_flare', strikePhase: 'strike',
    attack: 'gun_pass', speed: 120, strikeSpeedMult: 1.2, ringWU: 210, ingressWU: 330,
    // Fodder chip fire: a short engine-flare muzzle cue, not a 0.6 s pause — a horde that stops
    // to announce every burst is not a horde. Dangerous attacks keep the 0.6 s floor.
    windupTicks: 15, strikeMinTicks: 30, strikeMaxTicks: 96, recoverTicks: 60, cooldownTicks: 150,
    separationWU: 60, dodgeTier: 'fodder',
    interest: { goal: 1, flow: 0.55, cohesion: 0.45, side: 0.15 },
    danger: { hazard: 1, body: 0 },
  }),
  detonator_dart: row({
    doctrineId: 'detonator_run', windupPhase: 'fuse_cue', windupKind: 'detonator_fuse', strikePhase: 'commit',
    attack: 'ram_fuse', speed: 170, strikeSpeedMult: 1.05, ringWU: 190, ingressWU: 240,
    windupTicks: 40, strikeMinTicks: 20, strikeMaxTicks: 90, recoverTicks: 75, cooldownTicks: 60,
    separationWU: 60, dodgeTier: 'fodder',
    interest: { goal: 1, flow: 0.2, cohesion: 0.15, side: 0.2 },
    danger: { hazard: 1, body: 0 },
  }),
  choir_zealot: row({
    doctrineId: 'escort_screen', windupPhase: 'screen_deploy', windupKind: 'engine_flare', strikePhase: 'screen_hold',
    attack: 'gun_hold', speed: 95, strikeSpeedMult: 0.45, ringWU: 250, ingressWU: 380,
    windupTicks: 36, strikeMinTicks: 90, strikeMaxTicks: 120, recoverTicks: 90, cooldownTicks: 150,
    separationWU: 70, dodgeTier: 'medium', anchorToFlight: 'centroid',
    interest: { goal: 0.7, flow: 0.4, cohesion: 1, side: 0.2 },
    danger: { hazard: 1, body: 0.9 },
  }),
});

/** The fire phase each doctrine's authority row admits (engagementAuthority DOCTRINE_FIRE_PHASES). */
export const PACK_FIRE_PHASE_BY_DOCTRINE = Object.freeze({
  swarm_pack: 'strike',
  pack_pursuit: 'press',
  escort_screen: 'screen_hold',
  interceptor_flyby: 'strike',
  brawler_commit: 'commit',
});

export function packArchetypeFor(enemyId) {
  return typeof enemyId === 'string' ? PACK_ARCHETYPES[enemyId] || null : null;
}
