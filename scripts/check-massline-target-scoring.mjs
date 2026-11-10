// Massline rung 07 acceptance check: pure target-scoring.
//
// scoreMasslineTarget(player, target, opts) is a PURE function — no state, no bus, no side effects,
// deterministic. It ranks a candidate tether/slingshot anchor by swing geometry (perpendicular
// motion), mass appropriateness, range comfort, and a caller-resolved hostility bonus.
//
// Contract (src/combat/masslineTargetScoring.js):
//   - out of range          -> score 0, rating 'out'
//   - tangential > radial   -> swing geometry favors perpendicular motion (the slingshot read)
//   - static target         -> swing factor 0 (nothing to convert)
//   - mass sweet spot       -> 120..1200 mass scores higher than <40 (too light) or >2500 (heavy)
//   - range comfort         -> 30-75% of max range is ideal; <15% / >90% penalized
//   - hostility bonus       -> hostile=true strictly increases score vs identical non-hostile
//   - rating bands          -> clean>=0.8, good>=0.55, rough>=0.3, poor<0.3, out=0
//   - ranking               -> descending score, deterministic tiebreak by id
//   - purity                -> input array + objects never mutated; same args -> identical result
//
// Unlike the rung 05/06 checks, this is PURE unit testing — no sim harness, no tetherGameplay.
import assert from 'node:assert/strict';

import { scoreMasslineTarget, rankMasslineTargets } from '../src/combat/masslineTargetScoring.js';

const MAX_RANGE = 390;

assertOutOfRangeGatesToZero();
assertSwingGeometryFavorsPerpendicular();
assertStaticTargetHasZeroSwing();
assertMassBand();
assertRangeComfort();
assertHostilityBonus();
assertRatingBands();
assertRankingSortsDescendingAndStable();
assertPurityNoMutation();
assertDeterministic();

console.log('Massline target-scoring checks OK');

// Out of range (> maxRange) -> score 0, rating 'out'. So is degenerate (zero distance).
function assertOutOfRangeGatesToZero() {
  const player = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const far = { id: 1, pos: { x: 500, z: 0 }, vel: { x: 0, z: 80 }, mass: 500, radius: 10 };
  const r = scoreMasslineTarget(player, far, { maxRange: MAX_RANGE });
  assert.equal(r.score, 0, 'out-of-range target must score 0');
  assert.equal(r.rating, 'out', `out-of-range rating must be 'out'; got ${r.rating}`);

  // Degenerate distance (target on player) also gates to out.
  const onPlayer = { id: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 500, radius: 10 };
  const r2 = scoreMasslineTarget(player, onPlayer, { maxRange: MAX_RANGE });
  assert.equal(r2.score, 0, 'degenerate distance must score 0');
  assert.equal(r2.rating, 'out', `degenerate rating must be 'out'; got ${r2.rating}`);
}

// A purely tangential target (motion perpendicular to the line) scores higher than a purely radial
// one (motion along the line). This is the core massline swing read.
function assertSwingGeometryFavorsPerpendicular() {
  const player = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  // Target at (100,0): line is +x. Tangential = z motion; radial = x motion.
  const tangential = { id: 1, pos: { x: 100, z: 0 }, vel: { x: 0, z: 80 }, mass: 500, radius: 10 };
  const radial = { id: 2, pos: { x: 100, z: 0 }, vel: { x: -80, z: 0 }, mass: 500, radius: 10 };
  const st = scoreMasslineTarget(player, tangential, { maxRange: MAX_RANGE });
  const sr = scoreMasslineTarget(player, radial, { maxRange: MAX_RANGE });
  assert.ok(st.score > sr.score,
    `tangential must outscore radial; got tangential ${st.score} vs radial ${sr.score}`);
  assert.ok(st.reasons.swing > 0.9, `tangential swing ~1.0; got ${st.reasons.swing}`);
  assert.ok(sr.reasons.swing < 0.1, `radial swing ~0.0; got ${sr.reasons.swing}`);
}

// A static target (zero relative velocity) has swing=0 — nothing to convert into a whip.
function assertStaticTargetHasZeroSwing() {
  const player = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const stat = { id: 1, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, mass: 500, radius: 10 };
  const r = scoreMasslineTarget(player, stat, { maxRange: MAX_RANGE });
  assert.equal(r.reasons.swing, 0, 'static target swing must be 0');
}

// Mass band: 500 (in 120..1200 sweet spot) beats 30 (too light). Heavy (3000) decays but stays
// above the too-light floor.
function assertMassBand() {
  const player = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const ideal = { id: 1, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, mass: 500, radius: 10 };
  const light = { id: 2, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, mass: 30, radius: 4 };
  const heavy = { id: 3, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, mass: 3000, radius: 40 };
  const ri = scoreMasslineTarget(player, ideal);
  const rl = scoreMasslineTarget(player, light);
  const rh = scoreMasslineTarget(player, heavy);
  assert.equal(ri.reasons.mass, 1.0, `ideal mass factor 1.0; got ${ri.reasons.mass}`);
  assert.ok(rl.reasons.mass < 0.2, `light mass factor <0.2; got ${rl.reasons.mass}`);
  assert.ok(rh.reasons.mass >= 0.4 && rh.reasons.mass < 1.0,
    `heavy mass factor decays but stays mid; got ${rh.reasons.mass}`);
  assert.ok(ri.reasons.mass > rl.reasons.mass, 'ideal mass must beat light');
  assert.ok(rh.reasons.mass > rl.reasons.mass, 'heavy mass must beat light');
}

// Range comfort: mid-band (60% of max) beats near-edge (95%) and near-point (10%).
function assertRangeComfort() {
  const player = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const mid = { id: 1, pos: { x: 234, z: 0 }, vel: { x: 0, z: 0 }, mass: 500, radius: 10 }; // ~60%
  const edge = { id: 2, pos: { x: 370, z: 0 }, vel: { x: 0, z: 0 }, mass: 500, radius: 10 }; // ~95%
  const close = { id: 3, pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 }, mass: 500, radius: 10 }; // ~8%
  const rm = scoreMasslineTarget(player, mid).reasons.range;
  const re = scoreMasslineTarget(player, edge).reasons.range;
  const rc = scoreMasslineTarget(player, close).reasons.range;
  assert.equal(rm, 1.0, `mid-range comfort 1.0; got ${rm}`);
  assert.ok(re < 0.3, `edge range comfort <0.3; got ${re}`);
  assert.ok(rc < 0.3, `close range comfort <0.3; got ${rc}`);
}

// Hostility bonus: identical target with hostile=true scores strictly higher than hostile=false.
function assertHostilityBonus() {
  const player = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const t = { id: 1, pos: { x: 100, z: 0 }, vel: { x: 0, z: 80 }, mass: 500, radius: 10 };
  const friendly = scoreMasslineTarget(player, t, { maxRange: MAX_RANGE, hostile: false });
  const hostile = scoreMasslineTarget(player, t, { maxRange: MAX_RANGE, hostile: true });
  assert.ok(hostile.score > friendly.score,
    `hostile must outscore friendly; got hostile ${hostile.score} vs friendly ${friendly.score}`);
  assert.equal(hostile.reasons.hostile, 1, 'hostile reason flag must be 1');
  assert.equal(friendly.reasons.hostile, 0, 'friendly reason flag must be 0');
}

// Rating bands: clean>=0.8, good>=0.55, rough>=0.3, poor<0.3.
function assertRatingBands() {
  // A clean target: tangential + ideal mass + mid range + hostile.
  const player = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const clean = scoreMasslineTarget(player,
    { id: 1, pos: { x: 234, z: 0 }, vel: { x: 0, z: 90 }, mass: 500, radius: 10 },
    { hostile: true });
  assert.ok(clean.score >= 0.8 && clean.rating === 'clean',
    `clean band; got ${clean.score} ${clean.rating}`);

  // A poor target: radial + too light + edge range + not hostile.
  const poor = scoreMasslineTarget(player,
    { id: 2, pos: { x: 370, z: 0 }, vel: { x: -10, z: 0 }, mass: 30, radius: 4 });
  assert.ok(poor.score < 0.3 && poor.rating === 'poor',
    `poor band; got ${poor.score} ${poor.rating}`);
}

// Ranking: descending by score; ties broken by id ascending (deterministic).
function assertRankingSortsDescendingAndStable() {
  const player = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const candidates = [
    { id: 'low', pos: { x: 370, z: 0 }, vel: { x: 0, z: 0 }, mass: 30, radius: 4 },     // poor
    { id: 'high', pos: { x: 234, z: 0 }, vel: { x: 0, z: 90 }, mass: 500, radius: 10 }, // clean
    { id: 'mid', pos: { x: 234, z: 0 }, vel: { x: 0, z: 40 }, mass: 500, radius: 10 },  // good
  ];
  const ranked = rankMasslineTargets(player, candidates, { maxRange: MAX_RANGE });
  assert.equal(ranked.length, 3, 'all three candidates scored');
  assert.equal(ranked[0].id, 'high', `best must be 'high'; got ${ranked[0].id}`);
  assert.equal(ranked[ranked.length - 1].id, 'low', `worst must be 'low'; got ${ranked[ranked.length - 1].id}`);
  // Monotonic non-increasing scores.
  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok(ranked[i - 1].score >= ranked[i].score, 'scores must be non-increasing');
  }

  // Deterministic tiebreak: two identical-score targets sort by id ascending.
  const tied = rankMasslineTargets(player, [
    { id: 'b', pos: { x: 234, z: 0 }, vel: { x: 0, z: 90 }, mass: 500, radius: 10 },
    { id: 'a', pos: { x: 234, z: 0 }, vel: { x: 0, z: 90 }, mass: 500, radius: 10 },
  ], { maxRange: MAX_RANGE });
  assert.equal(tied[0].id, 'a', `tie must break to id 'a'; got ${tied[0].id}`);
  assert.equal(tied[1].id, 'b', `tie runner-up 'b'; got ${tied[1].id}`);
}

// Purity: the input array and its objects are never mutated.
function assertPurityNoMutation() {
  const player = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const candidates = [
    { id: 1, pos: { x: 100, z: 0 }, vel: { x: 0, z: 80 }, mass: 500, radius: 10 },
  ];
  const snapshot = JSON.stringify(candidates);
  const snapshotPlayer = JSON.stringify(player);
  rankMasslineTargets(player, candidates, { maxRange: MAX_RANGE, hostile: true });
  assert.equal(JSON.stringify(candidates), snapshot, 'candidates array + objects must be unmutated');
  assert.equal(JSON.stringify(player), snapshotPlayer, 'player must be unmutated');
}

// Determinism: same arguments always produce the same result (no Math.random, no wall-clock).
function assertDeterministic() {
  const player = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const t = { id: 1, pos: { x: 234, z: 0 }, vel: { x: 0, z: 90 }, mass: 500, radius: 10 };
  const a = JSON.stringify(scoreMasslineTarget(player, t, { maxRange: MAX_RANGE, hostile: true }));
  const b = JSON.stringify(scoreMasslineTarget(player, t, { maxRange: MAX_RANGE, hostile: true }));
  assert.equal(a, b, 'identical args must produce identical results');
}
