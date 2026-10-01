// PQ-140.02 specialist verbs. Ports are injected so the sim owners stay the single writers.
// The player must see the doctrine telegraph before the verb lands — the cutter commits at the
// spool telegraph and cuts inside the attach window, the disruptor fires after fire_window opens.
// Hostiles are not the Massline owner, so the cut uses breakAttachment (cut() would fail
// not_attachment_owner).
//
// SF-046 (PB-TAC-A): the cut is a committed pass, not a tracking aura. At the spool telegraph the
// blade snapshots the rope's geometry (anchor point + bearing + attachment id). Every later
// decision tick revalidates the snapshot against the LIVE rope: swinging the line's angle past
// the sweep tolerance, or re-anchoring, kills the committed intercept into a vulnerable recovery.
// The landing itself is real segment contact — the blade's authored cut envelope must reach the
// live rope segment, not merely stand near the player.
//
// SF-052 (PB-TAC-A): cutter and disruptor passes are mutually exclusive. While one specialist's
// pass is committed the other defers, and each landed verb reserves a breather before the other
// may commit — the pressures alternate and one counter is always available.
//
// SF-047 (PB-TAC-B): the disruptor's collapse is a committed working interval, not an instant
// aura. At the weapon_charge telegraph the ghost snapshots its position and vitality; it must
// hold that spot unhit through the whole wind-up, and only inside the fire window does the
// field owner receive the disruption request — its count is the only success claim. Damage or
// displacement mid-work kills the pass into the full disrupt cooldown: protecting the field by
// shooting the ghost is a real choice.
//
// SF-049 (PB-TAC-B): the anchor's snare zone is gated on the doctrine cycle through the field
// owner — it arms only across the telegraphed commit (field_spool -> anchor_hold) and dies on
// the recovery, so every bite is preceded by a visible wind-up and a full re-approach.
import { specialistPlanByEnemyId } from './specialistPlans.js';
import { wrapAngle } from './contracts.js';
import { entityIndexLaneVersion, entityIndexVersion } from '../world/livingWorldViews.js';

const CUT_COOLDOWN_TICKS = 90;
const DISRUPT_COOLDOWN_TICKS = 120;
// Commit at the telegraph (the visible cue), land only in the attach window.
const CUT_PHASES = new Set(['spool_cue', 'attach_window']);
// SF-047: the disruptor's working interval spans the charge telegraph into the fire window —
// acquire at the readable cue, land only once the window is actually open.
const DISRUPT_PHASES = new Set(['charge_cue', 'fire_window']);
const WARD_ID = 'warden_escort';
// SF-052: after a disrupt lands, the cutter may not open a committed pass for this long — the
// breather that keeps the paired pressure solvable. It is a composition property of the pair,
// not of one plan, so it lives beside the dispatcher that enforces it.
const DISRUPT_COMMIT_LOCK_TICKS = 60;
// Per-state ledger of the currently committed pass: { kind, untilTick }. Keyed by the GameState
// object (never serialized) and advanced purely by sim ticks — no ambient randomness.
const commitLedger = new WeakMap();

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function shipsOf(state) {
  if (!state) return [];
  if (Array.isArray(state.entityList)) return state.entityList;
  if (state.entities && typeof state.entities.values === 'function') return [...state.entities.values()];
  return [];
}

function enemyTypeId(entity) {
  const data = entity && entity.data;
  return (data && (data.lootTableId || data.enemyTypeId)) || null;
}

// Warden membership is spawn-fixed — enemyTypeId is stamped on the spec before the entity
// enters the index — so the roster latches on the entity-index version instead of walking
// the whole map per routed hit. Volatile gates (alive/pos/team/distance) still run per call.
// Members are always type 'ship' (warden_escort → ship_bastion), so the live index path
// latches the shipLike lane only: projectile spawn/expire churn bumps the whole-map version
// several times a frame under fire while shipLike stays still, and the rebuild pool is the
// ship bucket, not every entity. Membership and order are identical on both paths.
const WARD_LANES = ['shipLike'];
const _wardRoster = { version: null, source: null, list: [] };
function wardRosterFor(state) {
  const index = state && state.entityIndex;
  const useIndex = !!(index && index.__spacefaceEntityIndexV1 === true && index.ready === true
    && Array.isArray(index.shipLike));
  const version = useIndex ? entityIndexLaneVersion(state, WARD_LANES) : entityIndexVersion(state);
  const src = useIndex ? index.shipLike : (state && state.entities);
  const cache = _wardRoster;
  if (version == null || version === -1 || cache.version !== version || cache.source !== src) {
    cache.version = version;
    cache.source = src;
    cache.list.length = 0;
    const pool = useIndex ? index.shipLike : shipsOf(state);
    for (const e of pool) {
      if (e && enemyTypeId(e) === WARD_ID) cache.list.push(e);
    }
  }
  return cache.list;
}

/** Distance from a point to the segment AB, in the XZ plane. */
export function pointSegmentDistance(point, a, b) {
  if (!point || !a || !b) return Infinity;
  const ax = finite(a.x);
  const az = finite(a.z);
  const bx = finite(b.x);
  const bz = finite(b.z);
  const px = finite(point.x);
  const pz = finite(point.z);
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  if (len2 < 1e-8) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / len2));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

/**
 * The warden is the only specialist who stands on the shot. A hit aimed at a
 * packmate is taken by the escort when the escort's body is on that segment.
 * Cutters, disruptors, and anchors do not screen.
 */
export function wardScreenTarget(state, attacker, target, origin) {
  const kind = origin && origin.kind;
  if (kind !== 'weapon' && kind !== 'action') return null;
  if (!attacker || !target || attacker.id === target.id) return null;
  if (!attacker.pos || !target.pos) return null;
  if (target.type !== 'ship') return null;
  if (enemyTypeId(target) === WARD_ID) return null;
  let best = null;
  let bestDist = Infinity;
  for (const ent of wardRosterFor(state)) {
    if (!ent || ent.alive === false || !ent.pos || ent.id === target.id) continue;
    if (target.team == null || ent.team !== target.team) continue;
    const radius = finite(ent.collisionRadius, 21) + 6;
    const dist = pointSegmentDistance(ent.pos, attacker.pos, target.pos);
    if (dist > radius || dist >= bestDist) continue;
    best = ent;
    bestDist = dist;
  }
  return best;
}

function specialistBreakLine(attachments, attachmentId, specialistId) {
  if (!attachments) return null;
  if (typeof attachments.breakAttachment === 'function') {
    return attachments.breakAttachment(attachmentId, 'specialist_cut', specialistId);
  }
  if (typeof attachments.cut === 'function') {
    return attachments.cut(attachmentId, null, 'specialist_cut');
  }
  return null;
}

function bearingAt(from, anchor) {
  return Math.atan2(from.z - anchor.z, from.x - anchor.x);
}

function angleDelta(a, b) {
  return wrapAngle(a - b);
}

/** SF-052 ledger: is another specialist's committed pass holding the instant? */
function commitLockHeld(state, tick, kind) {
  if (!state) return false;
  const lock = commitLedger.get(state);
  return !!(lock && lock.untilTick > tick && lock.kind !== kind);
}

function claimCommitLock(state, tick, kind, untilTick) {
  if (!state) return;
  commitLedger.set(state, { kind, untilTick });
}

function releaseCommitLock(state, kind) {
  if (!state) return;
  const lock = commitLedger.get(state);
  if (lock && lock.kind === kind) commitLedger.delete(state);
}

/** The attachment endpoint that is NOT the player — the rock (or hull) the rope is tied to. */
function lineAnchorOf(attachment, player, state) {
  if (!attachment || !player || !state || !state.entities
    || typeof state.entities.get !== 'function') return null;
  const isPlayerId = (id) => id != null && player.id != null && String(id) === String(player.id);
  const ownerIsPlayer = isPlayerId(attachment.ownerId);
  const targetIsPlayer = isPlayerId(attachment.targetId);
  if (ownerIsPlayer && targetIsPlayer) return null;
  const anchorId = ownerIsPlayer ? attachment.targetId : (targetIsPlayer ? attachment.ownerId : null);
  if (anchorId == null) return null;
  const anchor = state.entities.get(anchorId);
  return anchor && anchor.alive !== false && anchor.pos ? anchor.pos : null;
}

function playerAttachments(attachments, player) {
  if (!attachments || typeof attachments.listForEntity !== 'function' || !player) return [];
  const list = attachments.listForEntity(player.id);
  return (Array.isArray(list) ? list : []).filter((a) => a && a.id != null);
}

/** SF-046: a committed pass that failed (angle beaten, re-anchor, expired window) buys the
 * player a vulnerable recovery — the blade may not open another pass until it expires. */
function missCutterPass(data, tick, recoveryTicks) {
  delete data._cutterCommit;
  data._cutterRecoverUntil = tick + recoveryTicks;
}

/** SF-047: the disruptor's live vitality (hull + shield) — the damage interrupt reads a drop. */
function specialistVitality(entity) {
  return (Number(entity && entity.hull) || 0) + (Number(entity && entity.shield) || 0);
}

/** SF-047: an interrupted working interval costs the full disrupt cooldown — the ghost must
 * fly a whole new approach + charge telegraph before it may try again. */
function interruptDisruptWork(state, data, tick) {
  delete data._disruptWork;
  releaseCommitLock(state, 'disrupt_field');
  data._pq140LastVerbTick = tick;
}

export function applySpecialistCounterplay({
  state,
  specialist,
  enemyId,
  doctrinePhase,
  tick,
  attachments,
  fields,
}) {
  const id = enemyId
    || (specialist && specialist.data && (specialist.data.lootTableId || specialist.data.enemyTypeId))
    || null;
  const plan = specialistPlanByEnemyId(id);
  if (!plan || !specialist || specialist.alive === false) return null;
  const data = specialist.data || (specialist.data = {});
  const last = Number.isFinite(data._pq140LastVerbTick) ? data._pq140LastVerbTick : -Infinity;
  if (plan.verb === 'cut_line') {
    const commitTicks = Number.isFinite(plan.commitTicks) ? plan.commitTicks : 45;
    const sweepTolerance = Number.isFinite(plan.sweepToleranceRad) ? plan.sweepToleranceRad : 0.6;
    const recoveryTicks = Number.isFinite(plan.missRecoveryTicks) ? plan.missRecoveryTicks : 120;
    if (!CUT_PHASES.has(doctrinePhase)) {
      // The committed pass exists only across the telegraph + attach window. A window that
      // closed without landing (egress, control, lost visibility) is a miss: resolve the
      // dangling commit here so the recovery follows the blade out of the window.
      if (data._cutterCommit) missCutterPass(data, tick, recoveryTicks);
      return null;
    }
    if (tick - last < CUT_COOLDOWN_TICKS) return null;
    if (Number.isFinite(data._cutterRecoverUntil) && tick < data._cutterRecoverUntil) return null;
    if (commitLockHeld(state, tick, 'cut_line')) return null;
    const player = state && state.entities && state.entities.get && state.playerId != null
      ? state.entities.get(state.playerId)
      : null;
    if (!player) return null;
    const lines = playerAttachments(attachments, player);
    if (!lines.length) {
      // Rope gone mid-pass: nothing to cut. Cancel the pass without a recovery penalty —
      // dropping the rope is a cost the player already paid.
      delete data._cutterCommit;
      releaseCommitLock(state, 'cut_line');
      return null;
    }
    const range = plan.cutRangeWu || 180;
    const commit = data._cutterCommit;
    if (!commit) {
      // Commitment: one snapshot of the rope's geometry at the telegraph. The pass never
      // re-targets after this tick — that is the whole player-facing difference.
      const activeLine = lines[0];
      const anchor = lineAnchorOf(activeLine, player, state);
      if (!anchor) return null;
      // The blade only commits to a rope its authored cut envelope can actually reach.
      if (pointSegmentDistance(specialist.pos, player.pos, anchor) > range) return null;
      data._cutterCommit = {
        attachmentId: activeLine.id,
        anchor: { x: anchor.x, z: anchor.z },
        bearing: bearingAt(player.pos, anchor),
        committedTick: tick,
        deadline: tick + commitTicks,
      };
      claimCommitLock(state, tick, 'cut_line', data._cutterCommit.deadline);
      return null;
    }
    // Freshness: the committed intercept must still be the rope the player is flying.
    if (tick > commit.deadline) { missCutterPass(data, tick, recoveryTicks); return null; }
    const activeLine = lines.find((a) => String(a.id) === String(commit.attachmentId));
    if (!activeLine) { missCutterPass(data, tick, recoveryTicks); return null; }
    const anchor = lineAnchorOf(activeLine, player, state);
    if (!anchor) { missCutterPass(data, tick, recoveryTicks); return null; }
    if (Math.hypot(anchor.x - commit.anchor.x, anchor.z - commit.anchor.z) > 40) {
      missCutterPass(data, tick, recoveryTicks);
      return null;
    }
    // The beat: the line's angle at its anchor swept past tolerance — the segment moved away
    // from the committed intercept, the pass whiffs, and the blade is exposed while recovering.
    const sweep = Math.abs(angleDelta(bearingAt(player.pos, anchor), commit.bearing));
    if (sweep > sweepTolerance) { missCutterPass(data, tick, recoveryTicks); return null; }
    // The telegraph must be seen before the verb lands: the cut itself only exists inside the
    // attach window. Freshness above still runs on the telegraph, so an early angle change
    // beats the pass before its window even opens.
    if (doctrinePhase !== 'attach_window') return null;
    if (tick === commit.committedTick) return null;
    // Landing: real segment contact — the cut envelope must reach the live rope segment.
    const segDist = pointSegmentDistance(specialist.pos, player.pos, anchor);
    if (segDist > range) return null;
    const result = specialistBreakLine(attachments, activeLine.id, specialist.id);
    if (result && result.ok) {
      data._pq140LastVerbTick = tick;
      delete data._cutterCommit;
    }
    return result && result.ok ? { verb: 'cut_line', ok: true, segmentDistance: segDist } : null;
  }
  if (plan.verb === 'disrupt_field') {
    const workTicks = Number.isFinite(plan.disruptWorkTicks) ? plan.disruptWorkTicks : 36;
    const holdRadius = Number.isFinite(plan.disruptHoldRadiusWu) ? plan.disruptHoldRadiusWu : 120;
    if (!DISRUPT_PHASES.has(doctrinePhase)) {
      // The working interval exists only across the telegraph + fire window. A window that
      // closed without landing (closing_interrupt retreat, egress) is an interrupt: resolve
      // the dangling work here so the cooldown follows the ghost out of the window.
      if (data._disruptWork) interruptDisruptWork(state, data, tick);
      return null;
    }
    if (tick - last < DISRUPT_COOLDOWN_TICKS) return null;
    // SF-052: while the cutter's pass is committed, the ghost holds — the pressures never
    // overlap into one unavoidable instant.
    if (commitLockHeld(state, tick, 'disrupt_field')) return null;
    if (!fields || typeof fields.disruptNear !== 'function') return null;
    if (!specialist.pos) return null;
    const work = data._disruptWork;
    if (!work) {
      // SF-047 commitment: one readable snapshot at the weapon_charge telegraph. The collapse
      // is no longer an instant aura — the ghost must hold THIS spot, unhit, for the whole
      // wind-up. That hold is the player's shot at stopping it: damage or displace the hull
      // mid-work and the pass dies into the full disrupt cooldown.
      data._disruptWork = {
        pos: { x: specialist.pos.x, z: specialist.pos.z },
        vitality: specialistVitality(specialist),
        startedTick: tick,
        deadline: tick + workTicks,
      };
      claimCommitLock(state, tick, 'disrupt_field', data._disruptWork.deadline);
      return null;
    }
    // Freshness beat 1 — damage: the working ghost is interruptible by the existing damage
    // rules. Any real hull/shield drop since acquire kills the pass.
    if (specialistVitality(specialist) < work.vitality - 1e-6) {
      interruptDisruptWork(state, data, tick);
      return null;
    }
    // Freshness beat 2 — commitment: a working ghost holds the acquired position. Displacement
    // (a shove, a massline throw, its own panic retreat) breaks the pass the same way.
    if (Math.hypot(specialist.pos.x - work.pos.x, specialist.pos.z - work.pos.z) > holdRadius) {
      interruptDisruptWork(state, data, tick);
      return null;
    }
    if (tick > work.deadline) {
      interruptDisruptWork(state, data, tick);
      return null;
    }
    // The telegraph must be seen before the verb lands: the collapse itself only exists inside
    // the fire window, and only once the committed wind-up has actually elapsed. Freshness
    // above still runs on the telegraph, so an early hit or shove beats the pass before its
    // window even opens.
    if (doctrinePhase !== 'fire_window') return null;
    if (tick === work.startedTick) return null;
    if (tick < work.deadline) return null;
    // Landing: the field OWNER receives the actual disruption request and confirms it — the
    // verb only claims success on the owner's count, never on the intention alone.
    const range = plan.disruptRangeWu || 780;
    const n = fields.disruptNear(state, specialist.pos, range, specialist.id);
    delete data._disruptWork;
    if (n > 0) {
      data._pq140LastVerbTick = tick;
      claimCommitLock(state, tick, 'disrupt_field', tick + DISRUPT_COMMIT_LOCK_TICKS);
    }
    return n > 0 ? { verb: 'disrupt_field', ok: true, count: n } : null;
  }
  if (plan.verb === 'snare_field') {
    const player = state && state.entities && state.entities.get && state.playerId != null
      ? state.entities.get(state.playerId)
      : null;
    if (!player || !player.pos || !specialist.pos) return null;
    const anchor = specialist.data && specialist.data.fieldAnchor;
    if (!anchor) return null;
    // SF-049 arena cycle: the zone is a fight tool owned by the doctrine clock, not a
    // spawn-time aura. It arms only across the telegraphed commit (field_spool wind-up ->
    // anchor_hold) and dies the moment the hull leaves the hold — a recovery (or the plain
    // approach leg) always stands between one bite and the next, and the re-arm restarts the
    // hull's own spinup. Placement stays honest: the center is the HULL (fields owner), never
    // the player.
    if (!fields || typeof fields.setAnchorArmed !== 'function') return null;
    const armedWanted = doctrinePhase === 'field_spool' || doctrinePhase === 'anchor_hold';
    const result = fields.setAnchorArmed(state, specialist.id, armedWanted, tick);
    if (!result) return null;
    return {
      verb: 'snare_field',
      ok: true,
      armed: result.armed === true,
      active: result.armed === true && tick >= result.activateTick,
      activateTick: result.activateTick,
      radius: result.radius,
    };
  }
  if (plan.verb === 'ward_screen') {
    const player = state && state.entities && state.entities.get && state.playerId != null
      ? state.entities.get(state.playerId)
      : null;
    if (!player) return null;
    for (const ent of shipsOf(state)) {
      if (!ent || ent.alive === false || ent.id === specialist.id || ent.id === player.id) continue;
      if (ent.team != null && specialist.team != null && ent.team !== specialist.team) continue;
      const blocked = wardScreenTarget(state, player, ent, { kind: 'weapon' });
      if (blocked && blocked.id === specialist.id) return { verb: 'ward_screen', ok: true, targetId: ent.id };
    }
    return null;
  }
  return null;
}
