import { createCinderglassJobState } from './operation.js';
import { CINDERGLASS_JOB_PHASES as P, CINDERGLASS_JOB_CUSTODY as C } from './definition.js';

const ADAPTERS = new WeakMap();
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const SCALARS = ['runId', 'operationId', 'everAdmitted', 'cohortAdmitted', 'phase', 'approach',
  'outcome', 'custody', 'offerEpoch', 'nextOfferAtS', 'declinedCount', 'scanDone', 'podMarked',
  'depositPaid', 'depositRefunded', 'depositEpoch', 'depositReceipt', 'serviceAttemptId',
  'suspicion', 'captainAlive', 'runFinished', 'laybyDone', 'laybyRemainingS', 'laybyHoldS',
  'routeLeg', 'podHullAtRelease', 'runStartedAtS', 'custodyReceipt', 'settlement', 'pendingReceive',
  'cohortRetired', 'forceUnlawful', 'lawReceipt', 'keepAcknowledged', 'latchMountCreated',
  'latchDestroyed', 'hardwareObservation', 'effectsApplied'];

export function serializeCinderglassJob(st, state) {
  if (!st || st.version !== 1) return null;
  const out = { version: 1 };
  for (const key of SCALARS) if (st[key] !== undefined) out[key] = clone(st[key]);
  out.rememberedFacts = clone((st.rememberedFacts || []).slice(-24));
  out.receipts = clone((st.receipts || []).slice(-12));
  out.actors = clone(st.actors);
  // A cut native joint must not resurrect from a stale carried projection.
  if (state && st.cohortAdmitted && out.custody === C.CARRIED) {
    const a = state.combat?.attachments?.byId?.[st.entities.clampAttachmentId];
    const carrier = state.entities?.get(st.entities.carrierId);
    const latch = state.entities?.get(st.entities.latchId);
    if (!a || a.state !== 'active' || !carrier || carrier.alive === false) out.custody = C.RELEASED;
    if (carrier?.alive === false) { out.captainAlive = false; out.actors.dask.alive = false; }
    if (latch?.alive === false || latch?.hull <= 0) { out.latchDestroyed = true; out.approach = 'violent'; }
  }
  return out;
}
export function validateCinderglassJob(data) {
  if (data == null) return true;
  return typeof data === 'object' && data.version === 1
    && Object.values(P).includes(data.phase) && Object.values(C).includes(data.custody)
    && (data.operationId == null || typeof data.operationId === 'string' && data.operationId.length <= 100)
    && (!data.receipts || Array.isArray(data.receipts) && data.receipts.length <= 12)
    && (!data.rememberedFacts || Array.isArray(data.rememberedFacts) && data.rememberedFacts.length <= 24)
    && (!data.settlement || ['tala', 'broker'].includes(data.settlement.recipient)
      && Number.isSafeInteger(data.settlement.creditedCr) && data.settlement.creditedCr >= 0);
}
export function normalizeCinderglassJob(data) {
  const st = createCinderglassJobState();
  if (data == null) return st;
  if (!validateCinderglassJob(data)) throw new Error('cinderglass_invalid_save');
  for (const key of SCALARS) if (data[key] !== undefined) st[key] = clone(data[key]);
  for (const role of ['tala', 'dask', 'broker']) Object.assign(st.actors[role], clone(data.actors?.[role] || {}));
  st.receipts = clone((data.receipts || []).slice(-12));
  st.rememberedFacts = clone((data.rememberedFacts || []).slice(-24));
  st.entities.pendingClamp = st.custody === C.CARRIED && !st.outcome;
  if ([C.RELEASED, C.TETHERED].includes(st.custody) && [P.RECON, P.DECIDE].includes(st.phase)) st.phase = P.RECOVERY;
  st.serviceProgressS = 0;
  st.pendingReceive = data.pendingReceive ? clone(data.pendingReceive) : null;
  return st;
}
export function restoreCinderglassJob(state, data) {
  state.world ||= {};
  return state.world.cinderglassJob = normalizeCinderglassJob(data);
}
// Both capture lanes call world.serialize. Rebinding waits for save:loaded.
export function installCinderglassJobSave(sys) {
  const world = sys.registry?.get('world');
  if (!world?.serialize || !world.deserializeChunked) return;
  let a = ADAPTERS.get(world);
  if (a) { a.sys = sys; return; }
  a = { sys, beforeSerialize: world.serialize, beforeRestore: world.deserializeChunked };
  a.serialize = function (...args) {
    const out = a.beforeSerialize.apply(this, args);
    if (a.sys && out) out.cinderglassJob = serializeCinderglassJob(a.sys._cg, a.sys.state);
    return out;
  };
  a.restore = function* (...args) {
    if (!validateCinderglassJob(args[0]?.cinderglassJob)) throw new Error('cinderglass_invalid_save');
    const result = yield* a.beforeRestore.apply(this, args);
    a.sys?.restoreFeatureState(args[0]?.cinderglassJob);
    return result;
  };
  world.serialize = a.serialize;
  world.deserializeChunked = a.restore;
  ADAPTERS.set(world, a);
}
export function uninstallCinderglassJobSave(sys) {
  const world = sys.registry?.get('world'), a = world && ADAPTERS.get(world);
  if (!a || a.sys !== sys) return;
  a.sys = null;
  // Do not unwrap another feature's later wrapper. Inert inner wrappers are harmless.
  if (world.serialize === a.serialize) world.serialize = a.beforeSerialize;
  if (world.deserializeChunked === a.restore) world.deserializeChunked = a.beforeRestore;
  if (world.serialize === a.beforeSerialize && world.deserializeChunked === a.beforeRestore) ADAPTERS.delete(world);
}
