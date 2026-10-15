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
import { entityLocalPointToWorld } from '../combat/geometry.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';
import { SCISSORWAKE } from '../data/scissorwake.js';

const CUT_COOLDOWN_TICKS = 90;
const DISRUPT_COOLDOWN_TICKS = 120;
// Commit at the telegraph (the visible cue), land only in the attach window.
const CUT_PHASES = new Set(['spool_cue', 'attach_window']);
// SF-047: the disruptor's working interval spans the charge telegraph into the fire window —
// acquire at the readable cue, land only once the window is actually open.
const DISRUPT_PHASES = new Set(['charge_cue', 'fire_window']);
const WARD_ID = 'warden_escort';
// SF-052: after a disrupt lands, the cutter may not open a committed pass for this long — the
// breather that keeps the paired pressure solvable. A landed cut reserves CUT_COMMIT_LOCK_TICKS
// on the same ledger so a late-window cut still buys a breather before the ghost acquires.
const CUT_COMMIT_LOCK_TICKS = 43;
const DISRUPT_COMMIT_LOCK_TICKS = 60;
// Per-state ledger of the currently committed pass: { kind, untilTick, phase, holderId, capability }.
// Keyed by the GameState object (never serialized) and advanced purely by sim ticks — no ambient randomness.
const commitLedger = new WeakMap();
// The screen function still RETURNS the warden (damage routes the hit onto that hull).
// The warded id is a side channel so the halo can mark the hull that is being covered
// until a later weapon/action check of the same pair finds no screen.
const wardPublications = new WeakMap();

export function publishedWardTarget(state) {
  const pub = state ? wardPublications.get(state) : null;
  return pub && pub.wardedId != null ? pub.wardedId : null;
}

export function refreshWardScreenPublication(state) {
  const pub = state ? wardPublications.get(state) : null;
  if (!pub) return null;
  const ships = shipsOf(state);
  let attacker = null;
  let target = null;
  for (const ent of ships) {
    if (!ent) continue;
    if (ent.id === pub.attackerId) attacker = ent;
    if (ent.id === pub.wardedId) target = ent;
  }
  if (!attacker || !target || attacker.alive === false || target.alive === false) {
    wardPublications.delete(state);
    return null;
  }
  wardScreenTarget(state, attacker, target, { kind: 'weapon' });
  return publishedWardTarget(state);
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function specialistIncapacitated(state, entity, capability = null) {
  if (!entity || entity.alive === false) return true;
  if (Number.isFinite(entity.hull) && entity.hull <= 0) return true;
  const data = entity.data;
  if (data && (data.disabled === true || data.stunned === true)) return true;
  if (capability && state && state.combat && state.combat.entities && entity.id != null) {
    const runtime = state.combat.entities[String(entity.id)];
    if (runtime && runtime.capabilities && runtime.capabilities[capability] === false) return true;
  }
  return false;
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
    if (specialistIncapacitated(state, ent, 'drive')) continue;
    if (target.team == null || ent.team !== target.team) continue;
    const radius = finite(ent.collisionRadius, 21) + 6;
    const dist = pointSegmentDistance(ent.pos, attacker.pos, target.pos);
    if (dist > radius || dist >= bestDist) continue;
    best = ent;
    bestDist = dist;
  }
  if (state) {
    const prev = wardPublications.get(state);
    if (best) {
      wardPublications.set(state, {
        wardedId: target.id,
        wardenId: best.id,
        attackerId: attacker.id,
      });
    } else if (prev && prev.wardedId === target.id && prev.attackerId === attacker.id) {
      wardPublications.delete(state);
    }
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
  if (!lock || lock.untilTick <= tick) return false;
  if (lock.phase === 'committed' && lock.holderId != null && state.entities && typeof state.entities.get === 'function') {
    const holder = state.entities.get(lock.holderId);
    if (!holder || specialistIncapacitated(state, holder, lock.capability || null)) {
      commitLedger.delete(state);
      return false;
    }
  }
  return lock.kind !== kind;
}

function claimCommitLock(state, tick, kind, untilTick, phase = 'committed', holderId = null, capability = null) {
  if (!state) return;
  commitLedger.set(state, { kind, untilTick, phase, holderId, capability });
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
function missCutterPass(state, data, tick, recoveryTicks) {
  delete data._cutterCommit;
  data._cutterRecoverUntil = tick + recoveryTicks;
  releaseCommitLock(state, 'cut_line');
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

function scissorwakeCut({ state, specialist, doctrine, doctrinePhase, tick, attachments, plan }) {
  const data = specialist.data, player = state.entities?.get(state.playerId);
  const miss = reason => {
    const commit = data._cutterCommit;
    if (commit) data.scissorwakeLastResolvedAttack = commit.attackId;
    missCutterPass(state, data, tick, SCISSORWAKE.recoveryTicks);
    data.scissorwakeOutcome = reason;
    return null;
  };
  if (!CUT_PHASES.has(doctrinePhase)) return data._cutterCommit ? miss('miss_window') : null;
  if (tick < (data._cutterRecoverUntil || 0) || tick - (data._pq140LastVerbTick ?? -Infinity) < CUT_COOLDOWN_TICKS
    || commitLockHeld(state, tick, 'cut_line')) return null;
  const sourceRuntime = state.combat?.entities?.[String(specialist.id)];
  if (!player?.alive || specialist.hull <= 0 || data.disabled === true || data.stunned === true
    || sourceRuntime?.capabilities?.drive === false || !physicsBodyNativeReady(specialist)) {
    return data._cutterCommit ? miss('miss_disabled') : null;
  }
  const line = playerAttachments(attachments, player).find(a => a.state === 'active'
    && String(a.id) === String(doctrine?.cutterAttachmentId));
  const owner = line && state.entities.get(line.ownerId), target = line && state.entities.get(line.targetId);
  const corridor = doctrine?.attackLine;
  if (!line || !owner?.alive || !target?.alive || !corridor?.origin || !corridor?.dir) {
    return data._cutterCommit ? miss('miss_line') : null;
  }
  let commit = data._cutterCommit;
  if (!commit) {
    // A restored/late attach window must announce a fresh cue before it can do anything.
    if (doctrinePhase !== 'spool_cue') return null;
    const attackId = `${specialist.id}:${specialist.occupantGeneration}:${doctrine.phaseStartedTick}`;
    if (data.scissorwakeLastResolvedAttack === attackId) return null;
    commit = data._cutterCommit = { attackId, attachmentId: line.id,
      sourceLife: specialist.occupantGeneration, ownerLife: owner.occupantGeneration,
      targetLife: target.occupantGeneration, ownerId: owner.id, targetId: target.id,
      committedTick: tick, deadline: tick + plan.commitTicks,
      corridor: { origin: { ...corridor.origin }, dir: { ...corridor.dir }, range: corridor.range, halfWidth: corridor.halfWidth },
      lastPos: { x: specialist.pos.x, z: specialist.pos.z } };
    delete data.scissorwakeOutcome;
    claimCommitLock(state, tick, 'cut_line', commit.deadline, 'committed', specialist.id, 'drive');
    return null;
  }
  if (commit.attachmentId !== line.id || commit.sourceLife !== specialist.occupantGeneration
    || commit.ownerId !== owner.id || commit.targetId !== target.id
    || commit.ownerLife !== owner.occupantGeneration || commit.targetLife !== target.occupantGeneration) return miss('miss_life');
  if (tick > commit.deadline) return miss('miss_expired');
  const cutLine = commit.corridor;
  const end = { x: cutLine.origin.x + cutLine.dir.x * cutLine.range, z: cutLine.origin.z + cutLine.dir.z * cutLine.range };
  if (pointSegmentDistance(specialist.pos, cutLine.origin, end) > cutLine.halfWidth + (specialist.radius || 17)) return miss('miss_displaced');
  const previous = commit.lastPos, current = { x: specialist.pos.x, z: specialist.pos.z };
  commit.lastPos = current;
  if (doctrinePhase !== 'attach_window' || tick - commit.committedTick < SCISSORWAKE.windupTicks) return null;
  const dx = current.x - previous.x, dz = current.z - previous.z;
  const forward = dx * cutLine.dir.x + dz * cutLine.dir.z;
  if (forward < -0.01) return miss('miss_reversed');
  if (!(forward > 0.01)) return null;
  const a = entityLocalPointToWorld(owner, line.sourceAnchorLocal || { x: 0, z: 0 });
  const b = entityLocalPointToWorld(target, line.targetAnchorLocal || { x: 0, z: 0 });
  const cross = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const boundsOverlap = Math.max(Math.min(previous.x, current.x), Math.min(a.x, b.x)) <= Math.min(Math.max(previous.x, current.x), Math.max(a.x, b.x))
    && Math.max(Math.min(previous.z, current.z), Math.min(a.z, b.z)) <= Math.min(Math.max(previous.z, current.z), Math.max(a.z, b.z));
  const crossing = boundsOverlap && cross(previous, current, a) * cross(previous, current, b) <= 0
    && cross(a, b, previous) * cross(a, b, current) <= 0;
  const separation = Math.min(pointSegmentDistance(a, previous, current), pointSegmentDistance(b, previous, current),
    pointSegmentDistance(previous, a, b), pointSegmentDistance(current, a, b));
  if (!crossing && separation > SCISSORWAKE.bladeRadiusWu) return null;
  const result = specialistBreakLine(attachments, line.id, specialist.id);
  if (!result?.ok) return miss('miss_owner');
  data._pq140LastVerbTick = tick; data.scissorwakeLastResolvedAttack = commit.attackId;
  data.scissorwakeOutcome = 'cut'; delete data._cutterCommit;
  data._cutterRecoverUntil = tick + SCISSORWAKE.recoveryTicks;
  releaseCommitLock(state, 'cut_line');
  return { verb: 'cut_line', ok: true, attackId: commit.attackId };
}

export function applySpecialistCounterplay({
  state,
  specialist,
  enemyId,
  doctrinePhase,
  doctrine = null,
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
  if (plan.engineeredPass) return scissorwakeCut({ state, specialist, doctrine, doctrinePhase, tick, attachments, plan });
  const last = Number.isFinite(data._pq140LastVerbTick) ? data._pq140LastVerbTick : -Infinity;
  if (plan.verb === 'cut_line') {
    const commitTicks = Number.isFinite(plan.commitTicks) ? plan.commitTicks : 45;
    const sweepTolerance = Number.isFinite(plan.sweepToleranceRad) ? plan.sweepToleranceRad : 0.6;
    const recoveryTicks = Number.isFinite(plan.missRecoveryTicks) ? plan.missRecoveryTicks : 120;
    if (specialistIncapacitated(state, specialist, 'drive')) {
      if (data._cutterCommit) missCutterPass(state, data, tick, recoveryTicks);
      return null;
    }
    if (!CUT_PHASES.has(doctrinePhase)) {
      // The committed pass exists only across the telegraph + attach window. A window that
      // closed without landing (egress, control, lost visibility) is a miss: resolve the
      // dangling commit here so the recovery follows the blade out of the window.
      if (data._cutterCommit) missCutterPass(state, data, tick, recoveryTicks);
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
      claimCommitLock(state, tick, 'cut_line', data._cutterCommit.deadline, 'committed', specialist.id, 'drive');
      return null;
    }
    // Freshness: the committed intercept must still be the rope the player is flying.
    if (tick > commit.deadline) { missCutterPass(state, data, tick, recoveryTicks); return null; }
    const activeLine = lines.find((a) => String(a.id) === String(commit.attachmentId));
    if (!activeLine) { missCutterPass(state, data, tick, recoveryTicks); return null; }
    const anchor = lineAnchorOf(activeLine, player, state);
    if (!anchor) { missCutterPass(state, data, tick, recoveryTicks); return null; }
    if (Math.hypot(anchor.x - commit.anchor.x, anchor.z - commit.anchor.z) > 40) {
      missCutterPass(state, data, tick, recoveryTicks);
      return null;
    }
    // The beat: the line's angle at its anchor swept past tolerance — the segment moved away
    // from the committed intercept, the pass whiffs, and the blade is exposed while recovering.
    const sweep = Math.abs(angleDelta(bearingAt(player.pos, anchor), commit.bearing));
    if (sweep > sweepTolerance) { missCutterPass(state, data, tick, recoveryTicks); return null; }
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
      claimCommitLock(state, tick, 'cut_line', Math.max(commit.deadline, tick + CUT_COMMIT_LOCK_TICKS), 'breather');
    }
    return result && result.ok ? { verb: 'cut_line', ok: true, segmentDistance: segDist } : null;
  }
  if (plan.verb === 'disrupt_field') {
    const workTicks = Number.isFinite(plan.disruptWorkTicks) ? plan.disruptWorkTicks : 36;
    const holdRadius = Number.isFinite(plan.disruptHoldRadiusWu) ? plan.disruptHoldRadiusWu : 120;
    if (specialistIncapacitated(state, specialist, 'weapons')) {
      if (data._disruptWork) interruptDisruptWork(state, data, tick);
      return null;
    }
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
      claimCommitLock(state, tick, 'disrupt_field', data._disruptWork.deadline, 'committed', specialist.id, 'weapons');
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
      claimCommitLock(state, tick, 'disrupt_field', tick + DISRUPT_COMMIT_LOCK_TICKS, 'breather');
    } else {
      releaseCommitLock(state, 'disrupt_field');
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
    const incapacitated = specialistIncapacitated(state, specialist);
    const armedWanted = !incapacitated && (doctrinePhase === 'field_spool' || doctrinePhase === 'anchor_hold');
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
    // Screen targets resolve to hulls — wardScreenTarget gates on type==='ship', so the
    // stations lane is dead iteration: every member is rejected at the type check. The
    // shipLike lane alone answers identically; the unindexed pool keeps its full walk.
    const index = state && state.entityIndex;
    const indexed = index && index.__spacefaceEntityIndexV1 === true && index.ready === true
      && Array.isArray(index.shipLike);
    const pool = indexed ? null : shipsOf(state);
    const lanes = indexed ? [index.shipLike] : [pool];
    // Pick the lowest entity id among valid screeners, not first-in-lane: the shipLike lane's
    // append order and entityList's swap-pop order diverge, and a replay/test pinning a
    // targetId must observe the same pick on both paths.
    let best = null;
    for (const lane of lanes) {
      for (const ent of lane) {
        if (!ent || ent.alive === false || ent.id === specialist.id || ent.id === player.id) continue;
        if (ent.team != null && specialist.team != null && ent.team !== specialist.team) continue;
        if (best !== null && ent.id >= best) continue;
        const blocked = wardScreenTarget(state, player, ent, { kind: 'weapon' });
        if (blocked && blocked.id === specialist.id) best = ent.id;
      }
    }
    if (best === null) return null;
    return { verb: 'ward_screen', ok: true, targetId: best };
  }
  return null;
}
