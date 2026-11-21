// The live set of the Pilot Tree: a node is dealt, shown on the tree and choosable only when its
// effect is built and tested. isPilotCardEligible gates on this set, so the draw, the re-roll, the
// choose and the tree screen all refuse a node whose effect does not exist in the build.
//
// Tests that need a different live set inject one with withPilotLiveNodesForTest below — the
// exported set itself is frozen and is never mutated.

export const PILOT_LIVE_NODE_IDS = Object.freeze(new Set([
  // Guns
  'gunner_steady_hands',
  'gunner_hollow_point',
  'gunner_drum',
  'gunner_spin_up',
  'gunner_execution',
  'gunner_ricochet',
  'gunner_gold_thread',
  // Knockback
  'bruiser_heavy_slugs',
  'bruiser_stagger',
  'bruiser_billiards',
  'bruiser_pass_it_on',
  'bruiser_wall_splat',
  'bruiser_newtons_cradle',
  // Line
  'rigger_long_reel',
  'rigger_quick_latch',
  'rigger_sweet_spot',
  'rigger_crane',
  'rigger_whip_snap',
  'rigger_hurricane',
  // Powers
  'conjurer_quick_cast',
  'conjurer_wide_bore',
  'conjurer_implode',
  'conjurer_heavy_shove',
  'conjurer_echo',
  'conjurer_combo',
  'conjurer_avalanche',
  // Ramming
  'juggernaut_ram_plate',
  'juggernaut_ballast',
  'juggernaut_thick_skin',
  'juggernaut_snowplough',
  'juggernaut_run_up',
  'juggernaut_shoulder_check',
  'juggernaut_last_stand',
  'juggernaut_juggernaut',
  // Stealth
  'ghost_cloak',
  'ghost_cold_drift',
  'ghost_ambush',
  'ghost_deep_shroud',
  'ghost_vanish',
  'ghost_phantom',
  // Evolutions
  'evolution_orbital_saw',
  'evolution_wrecking_ball',
  'evolution_freight_train',
  'evolution_meteor_shower',
  'evolution_black_hole',
]));

let liveOverride = null;

/** The live set the tree gates on: the list above, or a test's injected stand-in. */
export function pilotLiveNodeIds() {
  return liveOverride || PILOT_LIVE_NODE_IDS;
}

/**
 * Test seam: run `fn` with `ids` as the live node set, restoring the list afterwards (and on
 * throw). Re-entrant calls stack; the outermost restore wins. Never mutate the frozen set — this
 * swap is the only sanctioned way to change the live set inside a test.
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
