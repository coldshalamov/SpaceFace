// trafficReactionLease — one intent writer for world reactions on any hull.
//
// PL-03/05/06 reactions (rubberneckers, road rage, tailgater) steer a hull for a bounded beat.
// An ambient hull has no movement owner but traffic, so the reaction writes data.intent directly,
// exactly as it always has. A hull carrying data.jobId belongs to npcJobsRuntime (registry: it is
// the SOLE movement writer for a job hull), so the reaction must go through the job owner's
// control path instead of writing over it:
//
//   1. helpers.npcJobs.interrupt(jobId, threat) — the kernel parks the job in FLEE: progress,
//      routeIndex and the unfinished leg freeze exactly where they are (advance() never
//      progresses a fleeing job), and the stamp bounds the fallback flee if the lease is lost.
//   2. helpers.npcJobs.claimControl(jobId, { claimId, holder }) — the control lease suspends the
//      job runtime's own intent write, so the reaction's write is again the single writer. This
//      is the same lease trafficNearMiss's jink, the yard call-out and the heist pursuit use;
//      the reaction keeps its authored motion instead of inheriting the job's flee/hold reflex.
//   3. releaseTrafficReaction — releaseControl hands the hull back and resume(jobId) returns the
//      kernel to the exact phase/progress it left. The reaction ends by resuming the job.
//
// A hull that cannot be leased (a foreign controller holds it, the job is gone, or the jobs API
// is absent) answers nothing: the request returns false and the caller's reaction stays silent,
// so there is never a second intent writer on a job hull.

export const TRAFFIC_REACTION_HOLDER = 'traffic:reaction';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function reactionClaimId(entity) {
  return `traffic-reaction:${entity && entity.id}`;
}

function leaseBook(host) {
  if (!(host._trafficReactionLeases instanceof Map)) host._trafficReactionLeases = new Map();
  return host._trafficReactionLeases;
}

function releaseReactionLease(jobs, session) {
  if (!jobs || !session) return;
  const claim = typeof jobs.controlClaim === 'function' ? jobs.controlClaim(session.jobId) : null;
  if (claim && claim.claimId === session.claimId && typeof jobs.releaseControl === 'function') {
    jobs.releaseControl(session.jobId, session.claimId);
  }
  // The reaction is over: the job picks its route back up at the exact phase it left.
  if (typeof jobs.resume === 'function') jobs.resume(session.jobId);
}

// A session whose reaction stopped asking is dead weight on the hull. Sessions carry the
// caller-declared bound; past it, the lease goes back before it can freeze a worker in place.
function sweepReactionLeases(jobs, leases, now) {
  if (!leases.size) return;
  for (const [entityId, session] of leases) {
    if (Number.isFinite(session.untilSimT) && now < session.untilSimT) continue;
    leases.delete(entityId);
    releaseReactionLease(jobs, session);
  }
}

/**
 * Write the reaction's intent bundle. The caller passes exactly the fields it wants changed;
 * every other field keeps its previous value so each module's historical write shape survives
 * (rubberneckers' strafe/throttle/aim extras included).
 */
export function writeTrafficReactionIntent(entity, fields = {}) {
  if (!entity) return null;
  const data = entity.data || (entity.data = {});
  const intent = data.intent
    || (data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 });
  if (fields.moveX != null) intent.moveX = fields.moveX;
  if (fields.moveZ != null) intent.moveZ = fields.moveZ;
  if (fields.boost != null) intent.boost = fields.boost === true;
  if (fields.brake != null) intent.brake = fields.brake === true;
  if (fields.fire !== undefined) intent.fire = fields.fire === true;
  if (fields.fireGroup !== undefined) intent.fireGroup = fields.fireGroup;
  if (fields.aimAngle != null) intent.aimAngle = fields.aimAngle;
  if (fields.strafe !== undefined) intent.strafe = fields.strafe;
  if (fields.throttle !== undefined) intent.throttle = fields.throttle;
  if (fields.aim !== undefined) intent.aim = fields.aim;
  return intent;
}

/**
 * One tick of a world reaction's steering. `intent` is the field bundle the reaction wants the
 * hull to fly this tick; `durationS` is the reaction's remaining lifetime and only bounds the
 * interrupt fallback stamp + the lease session's expiry.
 *
 * Returns true when the reaction's intent is now the hull's single writer for the tick —
 * directly for an ambient hull, through the job owner's interrupt + control lease for a job
 * hull. Returns false when the hull belongs to a job that cannot be leased right now; the
 * caller must then leave the hull (and its job) alone.
 */
export function requestTrafficReaction(host, entity, intent, durationS) {
  if (!entity || !entity.data) return false;
  const jobs = host && host.helpers && host.helpers.npcJobs;
  const jobsLive = jobs && typeof jobs.claimControl === 'function'
    && typeof jobs.releaseControl === 'function'
    && typeof jobs.interrupt === 'function' && typeof jobs.resume === 'function';
  const now = finite(host && host.state && host.state.simTime, 0);
  // Whatever this request answers, stale sessions bound to an earlier tick go home first —
  // a reaction row that died without releasing must not hold a worker's hull forever.
  if (jobsLive) sweepReactionLeases(jobs, leaseBook(host), now);

  const jobId = entity.data.jobId;
  // Ambient hull: traffic is the only civilian movement owner — the direct write stands.
  if (jobId == null) {
    writeTrafficReactionIntent(entity, intent);
    return true;
  }
  if (!jobsLive) return false;
  const leases = leaseBook(host);
  const boundS = Math.max(0.1, finite(durationS, 5));

  const claimId = reactionClaimId(entity);
  const held = leases.get(entity.id);
  if (held) {
    // Still ours only if the job still wears the claim we placed; anything else means the hull
    // changed jobs or owners underneath the reaction — drop the stale record and re-request.
    const live = held.jobId === jobId && typeof jobs.controlClaim === 'function'
      ? jobs.controlClaim(held.jobId)
      : null;
    if (live && live.claimId === held.claimId) {
      held.untilSimT = now + boundS;
      writeTrafficReactionIntent(entity, intent);
      return true;
    }
    // The hull changed jobs or somebody released/re-claimed underneath us: whatever claim the
    // old job still carries under our key is ours to hand back before the fresh request runs.
    leases.delete(entity.id);
    releaseReactionLease(jobs, held);
  }

  const existing = typeof jobs.controlClaim === 'function' ? jobs.controlClaim(jobId) : null;
  if (existing && existing.claimId !== claimId) return false; // another owner flies this hull

  if (!existing) {
    // Pause the job first — a controller borrows the hull, it does not buy the shift. Kernel
    // FLEE freezes progress so the job resumes exactly where the reaction found it; the stamp
    // bounds the fallback flee if the claim below is ever lost without a release.
    jobs.interrupt(jobId, {
      entityId: null,
      hold: false,
      slow: false,
      x: finite(entity.pos && entity.pos.x),
      z: finite(entity.pos && entity.pos.z),
      untilSimT: now + boundS,
    });
    const out = jobs.claimControl(jobId, { claimId, holder: TRAFFIC_REACTION_HOLDER });
    if (!out || out.granted !== true) {
      jobs.resume(jobId); // nobody is steering: hand the pause straight back
      return false;
    }
  }
  leases.set(entity.id, { jobId, claimId, untilSimT: now + boundS });
  writeTrafficReactionIntent(entity, intent);
  return true;
}

/**
 * End a reaction on a hull. Releases only the lease this module placed — a foreign claim, a
 * gone job, or an ambient hull all resolve without touching the hull's owner. Safe to call
 * unconditionally at any reaction end.
 */
export function releaseTrafficReaction(host, entity) {
  if (!host || !entity) return;
  const leases = host._trafficReactionLeases;
  const session = leases instanceof Map ? leases.get(entity.id) : null;
  if (!session) return;
  leases.delete(entity.id);
  const jobs = host.helpers && host.helpers.npcJobs;
  if (jobs) releaseReactionLease(jobs, session);
}
