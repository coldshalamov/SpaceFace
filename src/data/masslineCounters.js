// src/data/masslineCounters.js — player-facing tell + counter for every Massline tether head.
//
// One entry per head granted by the `masslineHeadId` module mod (src/data/modules.js) and derived
// onto `entity.data.derived.masslineHeadId` (src/systems/ships.js). Prose is data, not flavor:
// each `tell` names how you recognize the head working on or against you, each `counter` is the
// verb phrase that beats it, and both are pinned to implemented mechanics — the head springs in
// src/combat/attachments.js (PQ-029), the sweep/snare/bridle paths in src/systems/tetherGameplay.js
// and src/systems/masslineSnares.js (PQ-030/PQ-031), and the npc-counterplay proofs in
// test/pq-030-02-counter-first.test.mjs and test/pq-031-02-npc-counterplay.test.mjs.
// Pure data + one selector: no imports, no state, no DOM.

export const MASSLINE_COUNTERS = Object.freeze([
  Object.freeze({
    headId: 'tractor',
    label: 'Tractor',
    tell: 'An enemy line latches you or your cargo and hauls straight in — steady pull toward the owner, no steering arc.',
    counter: 'Displace sideways, break the anchor, or outmass the pull until the line overloads and snaps.',
    source: 'PQ-029 tractor tow spring; tether_control_raider telegraph',
  }),
  Object.freeze({
    headId: 'elastic_whip',
    label: 'Elastic Whip',
    tell: 'The line goes taut and keeps stretching — it glows as the return stroke stores.',
    counter: 'Cut early while the stretch is shallow, or burn axial until the line breaks — a load-break dumps the stored snap empty.',
    source: 'PQ-029 whip spring; modules.js load-break note',
  }),
  Object.freeze({
    headId: 'frame_coupler',
    label: 'Frame Coupler',
    tell: 'Your hull starts riding the enemy’s turn — a winched hitch is holding you at fixed length.',
    counter: 'Cut the line and burn axial; the hitch only steers you while it stays taut.',
    source: 'PQ-029 coupler spring; shipRoleLattice hawser counterplay',
  }),
  Object.freeze({
    headId: 'monofilament_sweep',
    label: 'Monofilament Sweep',
    tell: 'A corsair blade telegraphs a massline spool, then your taut lines die in one crossing sweep.',
    counter: 'Slack your lines and displace off the blade’s path — a sweep only severs a taut rope.',
    source: 'PQ-030 taut one-pass cut; tether_control_raider',
  }),
  Object.freeze({
    headId: 'transverse_snare',
    label: 'Transverse Snare',
    tell: 'A strung line with two lit anchors deploys across your path — the HUD counts DEPLOYING, then ARMED.',
    counter: 'Shoot either anchor down (28 hull apiece) or route around the segment — a fast cross is the catch.',
    source: 'PQ-030/SF-28 snare anchors; hud DEPLOYING/ARMED/CAUGHT',
  }),
  Object.freeze({
    headId: 'twin_bridle',
    label: 'Twin Bridle',
    tell: 'A second latch fires within two seconds of the first — a bolas pair loading to tumble both lights.',
    counter: 'Cut either leg before it loads, or outmass the throw — heavy hulls shrug it off.',
    source: 'PQ-031 bolas window; pq-031-02 counterplay proof',
  }),
]);

const COUNTER_BY_HEAD_ID = new Map(MASSLINE_COUNTERS.map((entry) => [entry.headId, entry]));

/** The counter entry for a `masslineHeadId`, or null for an unknown head. Fails closed. */
export function masslineCounterByHead(headId) {
  return COUNTER_BY_HEAD_ID.get(headId) || null;
}
