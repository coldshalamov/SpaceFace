import {
  CINDERGLASS_JOB_DEPOSIT_CR as DEPOSIT, CINDERGLASS_JOB_TEXT as T,
  CINDERGLASS_JOB_RELEASE_NEGOTIATED, CINDERGLASS_JOB_NEGOTIATE_RANGE_WU,
  CINDERGLASS_JOB_PHASES as P,
} from './definition.js';
import { rememberFact, recordReceipt } from './operation.js';
import { carrierEntity, podEntity, cinderglassJobReleasePod, cinderglassJobLiveClamp } from './custody.js';

export function cinderglassJobNearCarrier(sys, state) {
  const carrier = carrierEntity(sys, state), player = state.entities?.get(state.playerId);
  return !!carrier && player?.alive !== false && !!player?.pos
    && Math.hypot(player.pos.x - carrier.pos.x, player.pos.z - carrier.pos.z) <= CINDERGLASS_JOB_NEGOTIATE_RANGE_WU;
}
export function cinderglassJobCarrierHalted(sys, state) {
  const c = carrierEntity(sys, state);
  return !!c && Math.hypot(c.vel.x, c.vel.z) < 3;
}
export function cinderglassJobProposalAvailable(sys, state) {
  const st = sys._cg;
  return [P.DECIDE, P.RECON].includes(st.phase) && st.scanDone && !st.depositPaid
    && !st.outcome && !st.actors.dask.dealAccepted
    && st.suspicion < 3 && st.custody === 'carried' && st.captainAlive
    && st.atLayby === true && st.laybyHoldActive === true
    && cinderglassJobCarrierHalted(sys, state) && cinderglassJobNearCarrier(sys, state)
    && !!cinderglassJobLiveClamp(sys, state);
}
export function cinderglassJobQuote(sys) {
  return { depositCr: DEPOSIT, disposition: sys._cg.suspicion >= 2 ? 'wary' : 'receptive',
    line: 'Dask will release the scanned original at this layby for a 150CR inspection deposit. Tala refunds it only on accepted return.' };
}
export function cinderglassJobPropose(sys, state, { token, requestId } = {}) {
  const st = sys._cg;
  if (token !== sys.token()) return { ok: false, reason: 'stale_life' };
  if (st.depositPaid) return { ok: false, reason: 'already_paid' };
  if (st.suspicion >= 3) return { ok: false, reason: 'dask_refused' };
  if (!cinderglassJobProposalAvailable(sys, state)) return { ok: false, reason: 'proposal_unavailable' };
  const expectedCredits = Number(state.player.credits);
  if (!Number.isSafeInteger(expectedCredits) || expectedCredits < DEPOSIT) return { ok: false, reason: 'insufficient' };
  const carrier = carrierEntity(sys, state), pod = podEntity(sys, state);
  const clamp = cinderglassJobLiveClamp(sys, state), life = sys.token();
  const receiptId = `${st.operationId}:inspection-deposit`;
  const charge = {
    amount: DEPOSIT, expectedCredits, requireFull: true, reason: receiptId, result: false,
    commit: () => {
      // Pure feature-state commit: no emissions or physical calls until economy has debited.
      if (sys._cg !== st || sys.token() !== life || token !== life
        || carrierEntity(sys, state) !== carrier || podEntity(sys, state) !== pod
        || cinderglassJobLiveClamp(sys, state) !== clamp || !cinderglassJobProposalAvailable(sys, state)) return false;
      st.depositPaid = true;
      st.depositReceipt = { receiptId, amount: DEPOSIT, operationId: st.operationId };
      st.actors.dask.dealAccepted = true;
      st.approach = 'negotiated';
      recordReceipt(st, state.simTime, { kind: 'deposit', receiptId, amount: DEPOSIT });
      rememberFact(st, state.simTime, 'deposit', T.depositTaken);
      rememberFact(st, state.simTime, 'dask_accepted', T.daskAccepted);
      st.promptRevision++;
      return true;
    },
  };
  sys.bus.emit('economy:chargeCredits', charge);
  return charge.result === true
    ? { ok: true, accepted: true, receiptId, requestId }
    : { ok: false, reason: 'charge_refused' };
}
// No external callback can confer a deposit: only the economy's exact commit above may do so.
export function cinderglassJobDepositCommitted() { return { ok: false, reason: 'owner_commit_required' }; }
export function cinderglassJobDaskRelease(sys, state) {
  const st = sys._cg;
  if (!st.depositPaid || !st.depositReceipt || !st.actors.dask.dealAccepted || st.custody !== 'carried') return { ok: false };
  const carrier = carrierEntity(sys, state);
  if (!carrier || !st.atLayby || !cinderglassJobCarrierHalted(sys, state)) return { ok: false, reason: 'awaiting_layby' };
  const out = cinderglassJobReleasePod(sys, state, { actorId: carrier.id, reason: CINDERGLASS_JOB_RELEASE_NEGOTIATED });
  if (out.ok) {
    st.phase = P.RECOVERY;
    rememberFact(st, state.simTime, 'released_negotiated', T.releasedNegotiated);
  }
  return out;
}
