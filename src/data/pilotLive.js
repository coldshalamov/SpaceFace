// OVH-01a2 — the live set of the Pilot Tree. A node joins only when its effect is built and
// tested — the director edits this list. Until a node's effect ships (OVH-01c…), the engine
// deals nothing for it: isPilotCardEligible gates on this set, so the draw, the re-roll and the
// choose all refuse a card whose effect does not exist in the build yet. The set stays EMPTY
// between packets on purpose — an empty tree deals no hands (OVH-01a2 step 2), so no player ever
// sees a card that does nothing.
//
// Tests that need eligible cards inject a live set with withPilotLiveNodesForTest below — the
// exported set itself is frozen and is never mutated.

export const PILOT_LIVE_NODE_IDS = Object.freeze(new Set([]));

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
