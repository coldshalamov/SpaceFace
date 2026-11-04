import { CINDERGLASS_JOB_CUSTODY as C, CINDERGLASS_JOB_OUTCOMES as O,
  CINDERGLASS_JOB_PHASES as P, CINDERGLASS_JOB_TEXT as T,
  CINDERGLASS_JOB_RECEIVE_RADIUS_WU as RECEIVE_RADIUS, CINDERGLASS_JOB_RECEIVE_SPEED as RECEIVE_SPEED,
  CINDERGLASS_JOB_TALA_BASE_CR, CINDERGLASS_JOB_TALA_DAMAGED_CR, CINDERGLASS_JOB_DEPOSIT_CR,
  CINDERGLASS_JOB_BROKER_CR, CINDERGLASS_JOB_DAMAGED_FRACTION,
  CINDERGLASS_JOB_RELEASE_QUIET, CINDERGLASS_JOB_SERVICE_SECONDS } from './definition.js';
import { rememberFact, recordReceipt, cinderglassJobClose } from './operation.js';
import { currentRole } from './identity.js';

export const CINDERGLASS_CLAMP = 'attachment_transport_clamp';
export const attachments = sys => sys.registry?.get('combat')?.kernel?.attachments;
export function podEntity(sys, state) { return currentRole(sys, state, 'podId'); }
export function carrierEntity(sys, state) { return currentRole(sys, state, 'carrierId'); }
export function nativeCinderglassPose(sys, state, entity) {
  const native = sys.registry?.get('physics')?._sg02, rec = entity && native?.records?.get(entity.id);
  if (!rec || rec.entity !== entity || !rec.body || native.world.getRigidBody(rec.body.handle) !== rec.body) return null;
  try {
    if (!rec.body.isEnabled()) return null;
    const p = rec.body.translation(), v = rec.body.linvel(), origin = native._frameOrigin || { x: 0, z: 0 };
    return { pos: { x: p.x + origin.x, z: p.z + origin.z }, vel: { x: v.x, z: v.z } };
  } catch { return null; }
}
export function nativeCinderglassAttachment(sys, state, a) {
  if (a?.state !== 'active') return null;
  try { return sys.registry?.get('physics')?._sg02CombatPhysics?.getAttachmentTelemetry({
    attachmentId: a.id, physicsHandle: a.physicsHandle, tick: state.tick }); } catch { return null; }
}
export function cinderglassJobLiveClamp(sys, state) {
  const carrier = carrierEntity(sys, state), pod = podEntity(sys, state), svc = attachments(sys);
  const a = svc?.get(sys._cg.entities.clampAttachmentId);
  return carrier && pod && a?.state === 'active' && a.ownerId === carrier.id && a.targetId === pod.id
    && a.ownerGeneration === carrier.occupantGeneration && a.targetGeneration === pod.occupantGeneration
    && nativeCinderglassAttachment(sys, state, a) ? a : null;
}
export function podDamageFraction(pod) {
  return pod?.hullMax > 0 ? Math.max(0, Math.min(1, pod.hull / pod.hullMax)) : 0;
}
export const podIntact = pod => podDamageFraction(pod) >= CINDERGLASS_JOB_DAMAGED_FRACTION;
export function cinderglassJobEnsureClamp(sys, state) {
  const st = sys._cg;
  if (st.custody !== C.CARRIED || st.outcome) return false;
  const svc = attachments(sys), carrier = carrierEntity(sys, state), pod = podEntity(sys, state);
  if (!svc || !carrier || !pod) return false;
  if (cinderglassJobLiveClamp(sys, state)) return true;
  const adopt = svc.listForEntity(carrier.id).find(a => a.state === 'active' && a.defId === CINDERGLASS_CLAMP
    && a.ownerId === carrier.id && a.targetId === pod.id && a.ownerGeneration === carrier.occupantGeneration
    && a.targetGeneration === pod.occupantGeneration);
  if (adopt) { st.entities.clampAttachmentId = adopt.id; st.entities.pendingClamp = false; return !!nativeCinderglassAttachment(sys, state, adopt); }
  if (!st.entities.pendingClamp) return false;
  if (!nativeCinderglassPose(sys, state, carrier) || !nativeCinderglassPose(sys, state, pod)) return false;
  const result = svc.create({ defId: CINDERGLASS_CLAMP, ownerId: carrier.id, targetId: pod.id });
  if (!result?.ok) { st.clampRefusal = result?.reason || 'physical_owner_unavailable'; return false; }
  st.entities.clampAttachmentId = result.attachment.id;
  st.entities.pendingClamp = false;
  return !!nativeCinderglassAttachment(sys, state, result.attachment);
}
export function cinderglassJobSetCustody(sys, state, next, extra = {}) {
  const st = sys._cg;
  if (st.custody === next) return;
  st.custody = next;
  if (next === C.RELEASED) { st.podHullAtRelease = podDamageFraction(podEntity(sys, state)); st.entities.clampAttachmentId = null; }
  recordReceipt(st, state.simTime, { kind: 'custody', custody: next, ...extra });
  st.promptRevision++;
}
export function cinderglassJobReleasePod(sys, state, { actorId, reason }) {
  const st = sys._cg, svc = attachments(sys), a = cinderglassJobLiveClamp(sys, state);
  if (st.custody !== C.CARRIED || !a || !svc) return { ok: false, reason: 'stale_latch' };
  if (actorId !== a.ownerId) {
    const destroyedLatch = currentRole(sys, state, 'latchId', true);
    const service = reason === CINDERGLASS_JOB_RELEASE_QUIET && st.serviceActive
      && st.serviceProgressS >= CINDERGLASS_JOB_SERVICE_SECONDS;
    const destroyed = reason === 'cinderglass_latch_destroyed' && st.latchDestroyed
      && destroyedLatch && (destroyedLatch.alive === false || destroyedLatch.hull <= 0);
    if (!service && !destroyed) return { ok: false, reason: 'release_authority_required' };
  }
  const life = sys.token();
  // The verified physical service/destruction requests the carrier's own constraint transition.
  // Combat already attributed the destructive act to its real shooter; no immunity is added.
  const result = svc.cut(a.id, a.ownerId, reason);
  if (!result?.ok) return result || { ok: false, reason: 'cut_refused' };
  if (sys._cg !== st || sys.token() !== life) return { ok: false, reason: 'stale_life' };
  cinderglassJobSetCustody(sys, state, C.RELEASED, { reason });
  return { ok: true };
}
export function cinderglassJobObserveCustody(sys, state) {
  const st = sys._cg;
  if (sys._restoring || !st.cohortAdmitted || st.outcome) return;
  const pod = podEntity(sys, state);
  if (!pod) {
    const prior = currentRole(sys, state, 'podId', true);
    const destroyed = prior?.alive === false || prior?.hull <= 0;
    cinderglassJobSetCustody(sys, state, destroyed ? C.DESTROYED : C.LOST);
    cinderglassJobClose(st, state.simTime, destroyed ? O.DESTROYED : O.LOST);
    rememberFact(st, state.simTime, 'pod_lost', destroyed ? T.podDestroyed : 'The original pod is no longer recoverable. Tala has closed the recovery.');
    return;
  }
  if (st.custody === C.CARRIED && !st.entities.pendingClamp && !cinderglassJobLiveClamp(sys, state)) {
    cinderglassJobSetCustody(sys, state, C.RELEASED, { reason: 'joint_lost' });
    st.phase = P.RECOVERY;
  }
  if ([C.RELEASED, C.TETHERED].includes(st.custody)) {
    const line = attachments(sys)?.listForEntity(pod.id).find(a => a.state === 'active'
      && a.targetId === pod.id && a.ownerId === state.playerId && nativeCinderglassAttachment(sys, state, a));
    cinderglassJobSetCustody(sys, state, line ? C.TETHERED : C.RELEASED);
  }
}
export function cinderglassJobReceiveQuote(sys, state, recipient) {
  const st = sys._cg, pod = podEntity(sys, state), receiver = currentRole(sys, state, recipient === 'tala' ? 'cradleId' : 'brokerId');
  if (!['tala', 'broker'].includes(recipient) || st.outcome || !pod || !receiver
    || ![C.RELEASED, C.TETHERED].includes(st.custody)) return null;
  const p = nativeCinderglassPose(sys, state, pod), r = nativeCinderglassPose(sys, state, receiver);
  const player = state.entities?.get(state.playerId), pilot = nativeCinderglassPose(sys, state, player);
  if (!p || !r || !pilot || player.alive === false) return null;
  if (Math.hypot(p.pos.x - r.pos.x, p.pos.z - r.pos.z) > RECEIVE_RADIUS
    || Math.hypot(p.vel.x - r.vel.x, p.vel.z - r.vel.z) > RECEIVE_SPEED
    || Math.hypot(pilot.pos.x - r.pos.x, pilot.pos.z - r.pos.z) > RECEIVE_RADIUS + 100) return null;
  const intact = podIntact(pod);
  if (recipient === 'broker' && !intact) return null;
  const baseCr = recipient === 'broker' ? CINDERGLASS_JOB_BROKER_CR
    : intact ? CINDERGLASS_JOB_TALA_BASE_CR : CINDERGLASS_JOB_TALA_DAMAGED_CR;
  const refundCr = recipient === 'tala' && st.depositPaid && !st.depositRefunded
    && st.depositReceipt?.amount === CINDERGLASS_JOB_DEPOSIT_CR ? CINDERGLASS_JOB_DEPOSIT_CR : 0;
  const condition = intact ? 'intact' : 'damaged';
  return { recipient, baseCr, refundCr, amount: baseCr + refundCr, condition,
    quoteId: `${st.operationId}:${recipient}:${condition}:${refundCr}`, token: sys.token(), operationId: st.operationId,
    podId: pod.id, receiverId: receiver.id, pod, receiver };
}
export function cinderglassJobStepHandoff(sys, state) {
  // Presence may offer a quote; only an explicit cargo-owner acceptance can receive it.
  const st = sys._cg;
  if (st.outcome) return;
  const quote = cinderglassJobReceiveQuote(sys, state, 'tala') || cinderglassJobReceiveQuote(sys, state, 'broker');
  st.receiveQuote = quote ? Object.fromEntries(Object.entries(quote).filter(([key]) => !['pod', 'receiver'].includes(key))) : null;
  if (st.custodyReceipt && !st.settlement) sys.registry?.get('economy')?.settleCinderglassResult?.(st.operationId, st.custodyReceipt.receiptId);
}
