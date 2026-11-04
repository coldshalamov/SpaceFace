// Cinderglass Job — reconnaissance + the quiet interception lane.
// Recon is a real scan event in range. The quiet release is a timed service
// action on the physical rack latch: close aboard, matched drift, unwatched —
// and it ends at the same canonical clamp cut as every other release.

import {
  CINDERGLASS_JOB_SCAN_RADIUS_WU,
  CINDERGLASS_JOB_MARK_RANGE_WU,
  CINDERGLASS_JOB_LATCH_REACH_WU,
  CINDERGLASS_JOB_LATCH_REL_SPEED,
  CINDERGLASS_JOB_SIGHT_RANGE_WU,
  CINDERGLASS_JOB_SERVICE_SECONDS,
  CINDERGLASS_JOB_RELEASE_QUIET,
  CINDERGLASS_JOB_PHASES as P,
  CINDERGLASS_JOB_TEXT as T,
} from './definition.js';
import { rememberFact, recordReceipt, cinderglassJobCommitApproach } from './operation.js';
import { carrierEntity, podEntity, cinderglassJobReleasePod } from './custody.js';
import { witnessLineOfSight } from '../../combat/lineOfSight.js';
import { lawWitnessesNear } from '../../systems/lawSecurity.js';
import { scannerProfileForState, playerSensorBlock } from '../../systems/scanner.js';
import { cloakHidesEntityFrom } from '../../systems/cloak.js';
import { currentRole } from './identity.js';

const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);

function findPlayerEntity(state) {
  const player = state.entities?.get?.(state.playerId);
  return player?.alive !== false && player?.isPlayer && finitePoint(player.pos) ? player : null;
}

function convoyObservers(sys, state) {
  const out = [];
  for (const key of ['carrierId', 'escortAId', 'escortBId']) {
    const e = currentRole(sys, state, key);
    if (e && e.alive !== false && e.data && e.data.cinderglassRole) out.push(e);
  }
  return out;
}

/* Retained legacy geometry helper for old callers. The service gate below uses
   current perception and the shared physical sightline owner, never this cone. */
export function observerSees(observer, targetPos) {
  if (!observer || !observer.pos || !targetPos) return false;
  const dx = targetPos.x - observer.pos.x;
  const dz = targetPos.z - observer.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > CINDERGLASS_JOB_SIGHT_RANGE_WU) return false;
  const rot = Number(observer.rot) || 0;
  const fx = Math.cos(rot), fz = Math.sin(rot);
  if (dist < 1e-6) return true;
  const dot = (dx * fx + dz * fz) / dist;
  return dot > -0.2;
}

export function cinderglassJobWatched(sys, state, atPos) {
  const pe = findPlayerEntity(state);
  const pos = atPos || (pe && pe.pos);
  if (!pos || !pe) return { watched: false };
  // Lawful traffic and explicitly authored witnesses use the ordinary bounded
  // witness query, including real compound occlusion. Cloaking is shared with AI.
  for (const row of lawWitnessesNear(state, {
    pos, offenderEntityId: pe.id, radius: CINDERGLASS_JOB_SIGHT_RANGE_WU,
  })) {
    const observer = state.entities?.get(row.entityId);
    if (observer && !cloakHidesEntityFrom(state, observer, pe)) {
      return { watched: true, by: observer.data?.displayName || observer.data?.name || 'nearby witness', entityId: observer.id };
    }
  }
  // A non-lawful escort still has its canonical current sensor frame. Remembered
  // or stale contacts cannot watch service through cover.
  for (const o of convoyObservers(sys, state)) {
    const frame = sys.helpers?.aiSensors?.liveFrameFor?.(o.id, state.tick);
    const contact = frame?.tick === state.tick && frame.contacts?.find(c => c.id === pe.id
      && c.visible !== false && c.alive !== false && c.valid !== false && (c.confidence ?? 1) > 0);
    if (contact && Math.hypot(pos.x - o.pos.x, pos.z - o.pos.z) <= CINDERGLASS_JOB_SIGHT_RANGE_WU
      && !cloakHidesEntityFrom(state, o, pe)
      && witnessLineOfSight(state, o, pos, [pe.id])) {
      return { watched: true, by: o.data?.displayName || 'convoy', entityId: o.id };
    }
  }
  return { watched: false };
}

/* The access point belongs to the admitted external latch, never an inferred
   carrier radius. Its authored local point rotates with the actual body. */
export function latchWorld(sys, state) {
  const carrier = carrierEntity(sys, state);
  const latch = currentRole(sys, state, 'latchId');
  if (!carrier || !latch || latch.alive === false || (Number.isFinite(latch.hull) && latch.hull <= 0) || latch.data?.cinderglassRole !== 'latch'
    || (sys._cg.operationId && latch.data.cinderglassOperationId !== sys._cg.operationId)
    || !finitePoint(latch.pos)) return null;
  const rot = Number(latch.rot) || 0;
  const point = latch.data?.cinderglassAccessPoint;
  const lx = finitePoint(point) ? point.x : 0, lz = finitePoint(point) ? point.z : 0;
  return {
    x: latch.pos.x + Math.cos(rot) * lx - Math.sin(rot) * lz,
    z: latch.pos.z + Math.sin(rot) * lx + Math.cos(rot) * lz,
    carrier, latch,
  };
}

export function cinderglassJobObserveMarkings(sys, state) {
  const st = sys._cg, pe = findPlayerEntity(state), pod = podEntity(sys, state);
  if (!pe || !pod || pod.alive === false || !finitePoint(pod.pos)) return false;
  if (Math.hypot(pe.pos.x - pod.pos.x, pe.pos.z - pod.pos.z) > CINDERGLASS_JOB_MARK_RANGE_WU
    || cloakHidesEntityFrom(state, pe, pod) || !witnessLineOfSight(state, pe, pod.pos, [pod.id])) return false;
  st.hardwareObservation = { pos: { x: pod.pos.x, z: pod.pos.z }, atS: Number(state.simTime) || 0 };
  if (st.podMarked) return true;
  st.podMarked = true;
  rememberFact(st, Number(state.simTime) || 0, 'marked',
    'Visible freight plate: CG-7. The sealed pod matches Tala’s description; its hardware still needs a scanner read.');
  return true;
}

/* Only the production scanner's fresh pulse can inspect the original hardware.
   A sector completion, escort target, close plate, or replay is not that receipt. */
export function cinderglassJobObserveScan(sys, state, payload) {
  const st = sys._cg;
  const pe = findPlayerEntity(state);
  const pod = podEntity(sys, state);
  const access = latchWorld(sys, state);
  if (st.scanDone || !pe || !pod || pod.alive === false || !access || playerSensorBlock(state, pe)
    || payload?.source !== 'player-scanner' || payload.scannerId !== pe.id
    || payload.scannerGeneration !== pe.occupantGeneration
    || !Number.isSafeInteger(payload.seq) || payload.seq <= (sys._cgScanSeq ?? -1)
    || payload.simTime !== state.simTime || !finitePoint(payload.pos)
    || Math.hypot(payload.pos.x - pe.pos.x, payload.pos.z - pe.pos.z) > 1e-4) return false;
  sys._cgScanSeq = payload.seq;
  const range = Math.min(CINDERGLASS_JOB_SCAN_RADIUS_WU,
    scannerProfileForState(state).nearRadius, Number(payload.radius) || 0);
  for (const hardware of [pod, access.latch]) {
    if (!finitePoint(hardware.pos) || Math.hypot(pe.pos.x - hardware.pos.x, pe.pos.z - hardware.pos.z) > range
      || cloakHidesEntityFrom(state, pe, hardware)
      || !witnessLineOfSight(state, pe, hardware.pos, [hardware.id])) return false;
  }
  st.scanDone = true;
  st.hardwareObservation = { pos: { x: pod.pos.x, z: pod.pos.z }, atS: Number(state.simTime) || 0 };
  st.phase = st.phase === P.RECON ? P.DECIDE : st.phase;
  const atS = Number(state.simTime) || 0;
  rememberFact(st, atS, 'scanned', 'Scanner confirms the original CG-7 controller, its condition and the external yellow latch. Dask’s next inspection is at the freight pull-off.');
  recordReceipt(st, atS, { kind: 'scan', entityId: pod.id, latchId: access.latch.id,
    podGeneration: pod.occupantGeneration, latchGeneration: access.latch.occupantGeneration });
  cinderglassJobObserveMarkings(sys, state);
  return true;
}

/* Can the quiet service begin right now? Honest refusal reasons. */
export function cinderglassJobServiceGate(sys, state) {
  const st = sys._cg;
  if (st.phase !== P.DECIDE && st.phase !== P.RECON) return { ok: false, reason: 'not_ready' };
  if (!st.scanDone) return { ok: false, reason: 'no_scan' };
  if (st.custody !== 'carried') return { ok: false, reason: 'not_carried' };
  if (st.atLayby !== true || st.laybyHoldActive !== true) return { ok: false, reason: 'not_at_layby' };
  const lw = latchWorld(sys, state);
  const pe = findPlayerEntity(state);
  if (!lw || !pe || !pe.pos) return { ok: false, reason: 'no_latch' };
  const d = Math.hypot(pe.pos.x - lw.x, pe.pos.z - lw.z);
  if (d > CINDERGLASS_JOB_LATCH_REACH_WU) return { ok: false, reason: 'range' };
  const rel = Math.hypot(
    (pe.vel && pe.vel.x || 0) - (lw.carrier.vel && lw.carrier.vel.x || 0),
    (pe.vel && pe.vel.z || 0) - (lw.carrier.vel && lw.carrier.vel.z || 0));
  if (rel > CINDERGLASS_JOB_LATCH_REL_SPEED) return { ok: false, reason: 'too_fast' };
  if (!witnessLineOfSight(state, pe, lw, [lw.latch.id])) return { ok: false, reason: 'obstructed' };
  const watched = cinderglassJobWatched(sys, state, pe.pos);
  if (watched.watched) return { ok: false, reason: 'watched', by: watched.by };
  return { ok: true };
}

/* Timed service: the player holds position for SERVICE_SECONDS. Any observer
   gaining sight, a speed spike, or separation interrupts — the latch is
   untouched on interrupt, no partial release. */
export function cinderglassJobServiceProgress(sys, state, actionId, dt) {
  const st = sys._cg;
  if (actionId == null || actionId !== sys._serviceActionId) return { status: 'interrupted', reason: 'stale_service' };
  const gate = cinderglassJobServiceGate(sys, state);
  if (!gate.ok) return { status: 'interrupted', reason: gate.reason };
  const next = (st.serviceProgressS || 0) + Math.max(0, Number(dt) || 0);
  st.serviceProgressS = next;
  if (next < CINDERGLASS_JOB_SERVICE_SECONDS) {
    return { status: 'running', progress: next / CINDERGLASS_JOB_SERVICE_SECONDS };
  }
  const pe = findPlayerEntity(state);
  const out = cinderglassJobReleasePod(sys, state, {
    actorId: pe ? pe.id : null,
    reason: CINDERGLASS_JOB_RELEASE_QUIET,
  });
  if (!out.ok) return { status: 'interrupted', reason: out.reason || 'cut_refused' };
  st.serviceProgressS = 0;
  cinderglassJobCommitApproach(st, 'quiet');
  st.phase = P.RECOVERY;
  const atS = Number(state.simTime) || 0;
  rememberFact(st, atS, 'released_quiet', T.releasedQuiet);
  recordReceipt(st, atS, { kind: 'release', approach: 'quiet' });
  return { status: 'complete' };
}

export function cinderglassJobServiceAbort(sys, state, reason) {
  const st = sys._cg;
  st.serviceProgressS = 0;
  st.suspicion = Math.min(3, (st.suspicion | 0) + (reason === 'watched' ? 1 : 0));
  st.actors.dask.suspicion = st.suspicion;
  if (reason) {
    rememberFact(st, Number(state.simTime) || 0, `service_${reason}`,
      reason === 'watched' ? T.watchedLine : T.serviceInterrupted);
  }
}
