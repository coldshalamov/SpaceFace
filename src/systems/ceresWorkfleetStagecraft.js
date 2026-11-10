// Local yard calls describe the original site's actual work. This is a transient presentation
// cursor, never an operation, cargo owner, saved job, or source of control over the workfleet.
import { CERES_WORKFLEET_CONTRACT as C } from '../data/ceresWorkfleet.js';

const visits = new WeakMap();
const HEARING_RADIUS = 420;
const CALL_SPACING_S = 8;
const STALL_S = 5;
const calls = Object.freeze({
  awaiting_brace: 'Long plate is still clamped. Use the site beam on the marked long-plate brace: the yard pays 400 credits for the completed brace. Brace before cutting; the support cannot catch a freed plate. You can leave it alone.',
  unbraced_cut: 'That seam was cut before the brace. The long plate is free, and the support cannot catch it now. This lift cannot start; keep clear of the loose plate.',
  awaiting_release: 'The seam is cut. The support clamp still holds the long plate. Cut that clamp to release it, then leave the breaker room to take the original plate to the cradle.',
  cutting: 'Brace is in. Cut the long-plate seam and release its clamp yourself to get the breaker moving sooner.',
  lifting: 'The breaker has the plate on its own line. It is too heavy for a small tug; keep the path clear.',
  receiving: 'The plate is at the cradle. Give the breaker room to withdraw.',
  stalled: 'The cutter has not lined up. If you are in the work area, clear the head and seam to let it settle.',
  secured: 'Long plate secured. The cradle has it.',
  retained: 'Work stopped: someone has taken custody of the equipment or plate.',
  destroyed: 'Long plate is gone. The crew cannot finish that lift.',
  disabled: 'Work stopped. The breaker or cutter is disabled.',
  interrupted: 'Work stopped. The load is out of the crew’s safe handling path.',
});

/** Read the actual finite job; never infer a completed action from a planned route. */
export function ceresWorkfleetYardCall(record, job, blockedSeconds = 0) {
  if (!record) return null;
  const phase = job?.phase;
  // A destroyed original outranks a still-visible last job phase during its next tick.
  if (phase === 'section-destroyed' || record.payloads?.long_plate?.destroyed) return 'destroyed';
  if (phase === 'secured') return 'secured';
  if (phase === 'player-retained') return 'retained';
  if (phase === 'worker-disabled' || phase === 'head-disabled') return 'disabled';
  if (phase === 'recovery-interrupted') return 'interrupted';
  if (!record.completedOperations?.brace_long_plate) {
    // The canonical site owner refuses bracing after the seam is cut. The same
    // saved consequence needs an explanation even though no crew job can start.
    if (record.completedOperations?.cut_long_plate_seam) return 'unbraced_cut';
    if (record.completedOperations?.release_long_plate_clamp) return null;
    return 'awaiting_brace';
  }
  if (!job) return null;
  if (record.completedOperations?.release_long_plate_clamp
    && ['head_dock', 'head_out', 'head_cut', 'head_retract', 'tow_attach', 'reacquire'].includes(phase)) return null;
  if (record.completedOperations?.cut_long_plate_seam
    && record.components?.long_plate_clamp?.status === 'braced'
    && ['head_dock', 'head_out', 'head_cut', 'head_retract', 'tow_attach'].includes(phase)) return 'awaiting_release';
  if (phase === 'head_cut' && job.blockedReason === 'physical-cutter-not-ready' && blockedSeconds >= STALL_S) return 'stalled';
  if (['extract', 'seat', 'loaded', 'receiver', 'unshoe'].includes(phase)) return 'lifting';
  if (['withdraw', 'pads'].includes(phase)) return 'receiving';
  if (['head_dock', 'head_out', 'head_cut', 'head_retract', 'tow_attach', 'reacquire'].includes(phase)) return 'cutting';
  return null;
}

/** Called from the existing workfleet tick, including before its voluntary brace gate. */
export function stepCeresWorkfleetStagecraft(owner, record) {
  const state = owner?.state;
  if (!state || !owner.bus?.emit) return;
  let visit = visits.get(state);
  if (!visit) { visit = { inside: false, sent: new Set(), lastCall: -Infinity, blockedAt: null }; visits.set(state, visit); }
  const player = state.entities?.get(state.playerId);
  const inside = state.mode === 'flight' && state.world?.currentSectorId === C.sectorId
    && player?.alive !== false && player?.pos && !player.flags?.docked && !state.ui?.docked
    && Math.hypot(player.pos.x - C.sitePlacement.pos.x, player.pos.z - C.sitePlacement.pos.z) <= HEARING_RADIUS;
  if (!inside) { visit.inside = false; visit.blockedAt = null; return; }
  const now = Number.isFinite(state.simTime) ? state.simTime : 0;
  if (!visit.inside || now < visit.lastCall) {
    visit.inside = true; visit.sent.clear(); visit.lastCall = -Infinity; visit.blockedAt = null;
  }
  // Do not spend the one arrival call while the pilot is passing at travel speed.
  // It stays available as soon as the ship actually slows near the worksite.
  if (Math.hypot(player.vel?.x || 0, player.vel?.z || 0) > 35) return;
  const job = state.npcJobs?.ceresWorkfleet;
  const blocked = job?.phase === 'head_cut' && job.blockedReason === 'physical-cutter-not-ready';
  if (blocked && visit.blockedAt == null) visit.blockedAt = now;
  if (!blocked) visit.blockedAt = null;
  const key = ceresWorkfleetYardCall(record, job, visit.blockedAt == null ? 0 : Math.max(0, now - visit.blockedAt));
  if (!key || visit.sent.has(key) || now - visit.lastCall < CALL_SPACING_S) return;
  visit.sent.add(key); visit.lastCall = now;
  owner.bus.emit('comms:message', { sender: 'SECOND MEASURE YARD', channel: 'machine', text: calls[key] });
}
