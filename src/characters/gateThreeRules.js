// src/characters/gateThreeRules.js — pure rules for the Gate 3 weir (row 542 / 03 §4.1).
// No state, no bus, no Math.random. The adapter reads the player's hull and the freight
// around it; these answer: is the hull inside the cordon, what does the scale read, and
// whose name goes on the receipt — Hale's filed fine or Dree's one waved weir.

import { GATE_THREE_WEIR } from '../data/gateThree.js';
import { SWEEP_SCANNER_PROFILES, weighingRead, weighingVerdict, castsMassShadow } from '../data/massSignature.js';

const BARGE_PROFILE = SWEEP_SCANNER_PROFILES.scale_barge;
// Loose freight this close to the hull reads as YOUR mass — the encounter's same radius.
const CARGO_NEAR_WU = 260;

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** Inside the cordon ring — crossing it is submitting, whatever the speed. */
export function gateThreeInWeir(pos, post = GATE_THREE_WEIR.post, radius = GATE_THREE_WEIR.weirRadius) {
  if (!finiteXZ(pos) || !finiteXZ(post)) return false;
  return Math.hypot(pos.x - post.x, pos.z - post.z) <= radius;
}

/** Swept entry: the hull was outside last census and this pass it is inside — or its
 *  path clipped the cordon disc on the way through. Occupancy alone misses a hull that
 *  tunnels through the ring's edge between passes, and `to`-inside alone re-fires on a
 *  hull parked in the ring every census — the characters rule says gate crossings are
 *  swept, not sampled. A non-finite `from` (first census, fresh materialization) reads
 *  as outside: a hull parked inside at that point still submits once. */
export function gateThreeEntered(from, to, post = GATE_THREE_WEIR.post, radius = GATE_THREE_WEIR.weirRadius) {
  if (gateThreeInWeir(from, post, radius)) return false;
  if (gateThreeInWeir(to, post, radius)) return true;
  if (!finiteXZ(from) || !finiteXZ(to) || !finiteXZ(post)) return false;
  const dx = to.x - from.x, dz = to.z - from.z;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 0) return false;
  // Closest approach of the segment from→to to the disc center.
  const t = Math.max(0, Math.min(1, ((post.x - from.x) * dx + (post.z - from.z) * dz) / len2));
  const cx = from.x + dx * t, cz = from.z + dz * t;
  return Math.hypot(cx - post.x, cz - post.z) <= radius;
}

/** The cargo-body predicate the Scale Barge uses: pickups, cargo kinds, commodity-tagged
 *  bodies, custody pods, debris — freight loose near the hull. Mirrors encounter 700's
 *  isCargoBody so the standing post reads the same bodies the barge would. */
export function gateThreeCargoBody(e, subjectId) {
  if (!e || e.alive === false || !e.pos || e.id === subjectId) return false;
  const d = e.data || {};
  return e.type === 'pickup' || d.kind === 'cargo' || !!d.commodityId
    || !!d.freightCustodyPod || d.parentType === 'debris' || d.cargoBody === true;
}

/** Freight near enough to the hull to count as carried — the barge's CARGO_NEAR_WU. */
export function gateThreeCargoNear(player, entityList) {
  const out = [];
  if (!finiteXZ(player && player.pos)) return out;
  for (const e of entityList || []) {
    if (!gateThreeCargoBody(e, player.id)) continue;
    if (Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) <= CARGO_NEAR_WU) out.push(e);
  }
  return out;
}

/** What the papers declare the hull weighs — the manifest minimum, same law as 700. */
export function gateThreeManifestT(player) {
  return Math.max(GATE_THREE_WEIR.manifestMinT, Math.round((player && player.mass) || 0));
}

/** The weighing: the standing post runs the shared row-513 model — hull signature plus
 *  loose freight, mass shadows and decoys and Hush Heads all read exactly as the barge's. */
export function gateThreeWeigh(player, entityList) {
  const bodies = gateThreeCargoNear(player, entityList);
  // The barge's own caster set (encounter 700): only mass-shadow bodies occlude.
  // Raw entityList would let any small body on the post->hull line shadow the read —
  // a fighter crossing the cordon's sightline could zero a smuggler's hull once.
  const casters = [];
  for (const e of entityList || []) if (castsMassShadow(e)) casters.push(e);
  const read = weighingRead(BARGE_PROFILE, GATE_THREE_WEIR.post, player, bodies, casters);
  const manifestMassT = gateThreeManifestT(player);
  const verdict = weighingVerdict(read.readMassT, manifestMassT);
  return { read, verdict, manifestMassT };
}

/** The verdict's name: Dree's wave covers one small over-mass once ever; anything else —
 *  or anything after — is Hale's REF 44-C filed correctly. */
export function gateThreeOutcome(verdict, waveUsed, waveMaxT = GATE_THREE_WEIR.dreeWaveMaxT) {
  if (!verdict || verdict.outcome === 'clean') return { kind: 'clean' };
  const overT = Math.max(0, Math.round((verdict.overByT || 0) * 10) / 10);
  if (!waveUsed && overT <= waveMaxT) return { kind: 'waived', overT };
  const fine = Math.max(GATE_THREE_WEIR.fineMinCr, Math.round(overT * GATE_THREE_WEIR.finePerTCr));
  return { kind: 'fined', overT, fine };
}
