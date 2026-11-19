// OVH-01a2 — the live set of the Pilot Tree. A node joins only when its effect is built and
// tested — the director edits this list. Until a node's effect ships (OVH-01c…), the engine
// deals nothing for it: isPilotCardEligible gates on this set, so the draw, the re-roll and the
// choose all refuse a card whose effect does not exist in the build yet. The set stays EMPTY
// between packets on purpose — an empty tree deals no hands (OVH-01a2 step 2), so no player ever
// sees a card that does nothing.
//
// Tests that need eligible cards inject a live set with withPilotLiveNodesForTest below — the
// exported set itself is frozen and is never mutated.

export const PILOT_LIVE_NODE_IDS = Object.freeze(new Set([
  // OVH-01c1 (director review 2026-11-19): Juggernaut and the Bruiser kick chain.
  // juggernaut_unstoppable stays out: the player already never loses the helm to a contact,
  // so the card would grant nothing — it needs a new effect first (board OVH-01c4).
  'juggernaut_ram_plate',
  'juggernaut_ballast',
  'juggernaut_thick_skin',
  'juggernaut_run_up',
  'juggernaut_shoulder_check',
  'juggernaut_snowplough',
  'juggernaut_last_stand',
  'juggernaut_juggernaut',
  'bruiser_heavy_slugs',
  'bruiser_stagger',
  'bruiser_billiards',
  'bruiser_pass_it_on',
  'bruiser_wall_splat',
  'bruiser_newtons_cradle',
  // OVH-01c3 (director review 2026-11-19): the Gunner wave.
  'gunner_hollow_point',
  'gunner_steady_hands',
  'gunner_drum',
  'gunner_spin_up',
  'gunner_execution',
  'gunner_ricochet',
  // OVH-01c2 (director review 2026-11-19): the rope and the powers. Left out: rigger_free_hand (no
  // latched aim penalty exists to remove) and conjurer_deep_cast (its hold is read from the
  // presentation grip, not the recorded input — the fix carries the hold time in the input command).
  'rigger_long_reel',
  'rigger_quick_latch',
  'rigger_sweet_spot',
  'rigger_crane',
  'rigger_second_line',
  'rigger_whip_snap',
  'conjurer_quick_cast',
  'conjurer_wide_bore',
  'conjurer_echo',
  'conjurer_combo',
]));

let liveOverride = null;

/** The live set the tree gates on: the director's frozen list, or a test's injected stand-in. */
export function pilotLiveNodeIds() {
  return liveOverride || PILOT_LIVE_NODE_IDS;
}

/**
 * Test seam: run `fn` with `ids` as the live node set, restoring the director's list afterwards
 * (and on throw). Re-entrant calls stack; the outermost restore wins. Never mutate the frozen
 * set — this swap is the only sanctioned way to broaden the live set inside a test.
 */
export function withPilotLiveNodesForTest(ids, fn) {
  const previous = liveOverride;
  liveOverride = new Set(ids);
  try {
    return fn();
  } finally {
    liveOverride = previous;
  }
}
