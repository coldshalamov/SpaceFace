// Opt-in lane-local observation of impulses the physics owner already applied.
// Both transports share the collector and its receipt/identity semantics; no motion is written here.
import { registerStuntImpulseObserver, journalFor } from '../../combat/stuntEvidence.js';
import { createBoundedImpulseReceiptCollector } from './impulseReceipts.js';

const BOUNDARIES = ['game:new', 'game:newGame', 'game:started', 'run:started', 'save:restoring', 'save:loaded'];
export function createPlayerTruthImpulseObserver({ getState, getBus = () => null, getFields = () => null }) {
  let session = null;

  function detachImpulse() {
    session?.unsubscribe?.();
    if (session) session.unsubscribe = null;
  }
  function dispose() {
    detachImpulse();
    for (const off of session?.lifecycleUnsubs || []) off();
    session = null;
  }
  function invalidate(reason) {
    if (!session || session.reason) return;
    session.reason = reason;
    detachImpulse();
  }
  function bindEpoch() {
    const state = session.state;
    session.entities = state.entities;
    session.journal = journalFor(state);
    session.tickFloor = state.tick;
    session.lastTick = state.tick;
  }
  function validSession() {
    if (!session || session.reason) return false;
    const state = getState();
    if (state !== session.state || state.entities !== session.entities
      || journalFor(state) !== session.journal || state.tick < session.lastTick) {
      invalidate('authoritative-epoch-changed');
      return false;
    }
    session.lastTick = state.tick;
    return true;
  }
  function boundary(name) {
    if (!session || session.reason) return;
    const capture = session.collector.snapshot();
    // Public New Game/Continue is allowed after install. Once flight evidence exists (or begin
    // ran), a lifecycle change must reject it rather than relabel it as another run's proof.
    if (capture.started || capture.receiptCount || capture.pendingReceiptCount || capture.invalidCount || capture.overflow) {
      invalidate(`boundary:${name}`);
    } else if (getState() === session.state) bindEpoch();
    else invalidate('authoritative-state-replaced');
  }
  function staleResult() {
    return { ok: false, status: 'stale-session', readOnly: true, reason: session.reason, receipts: [] };
  }
  function rpc(args = {}) {
    const action = typeof args.action === 'string' ? args.action : 'status';
    if (action === 'install') {
      dispose();
      const state = getState();
      if (!state) return { ok: false, status: 'unsupported', reason: 'host-not-initialized' };
      const collector = createBoundedImpulseReceiptCollector({
        maxReceipts: Number.isSafeInteger(args.maxReceipts) ? args.maxReceipts : undefined,
        maxTicks: Number.isSafeInteger(args.maxTicks) ? args.maxTicks : undefined,
      });
      collector.arm();
      session = { state, collector, lifecycleUnsubs: [], reason: null };
      bindEpoch();
      session.unsubscribe = registerStuntImpulseObserver(state, observation => {
        if (!validSession()) return;
        if (state.entities?.get(observation?.entity?.id) !== observation?.entity) return;
        if (!Number.isSafeInteger(observation?.tick) || observation.tick < session.tickFloor || observation.tick > state.tick) return;
        let delivered = observation;
        if (observation?.kind === 'field' && typeof getFields === 'function') {
          const evidenceField = observation.provenance?.field;
          let fieldSystem = null;
          try { fieldSystem = getFields(); } catch { /* a diagnostic source miss cannot alter physics */ }
          if (fieldSystem && evidenceField?.id != null) {
            let liveField = null;
            try {
              const liveFields = fieldSystem.kernelList?.();
              if (Array.isArray(liveFields) && evidenceField?.id != null) {
                liveField = liveFields.find(field => field?.id === evidenceField.id) || null;
              }
            } catch { /* no exact live record means no admissible field proof */ }
            const liveCenter = liveField?.center;
            const sourceCurrent = !!liveField && liveField.ownerId === evidenceField?.ownerId
              && liveField.kind != null && observation.provenance?.tag === `field_${liveField.kind}`
              && liveField.radius === evidenceField?.radius
              && liveCenter?.x === evidenceField?.x && liveCenter?.z === evidenceField?.z
              && liveField.expireAt > (Number.isFinite(state.simTime) ? state.simTime : 0);
            // Environmental fields have no entity owner. They explain motion only when the
            // authoritative kernel still exposes the exact source at the delivered native tick.
            // A missing/mismatched record stays a claimed invalid receipt, never a quiet omission.
            delivered = {
              ...observation,
              provenance: {
                ...observation.provenance,
                field: {
                  ...evidenceField,
                  sourceTag: liveField?.tag ?? null,
                  sourceCurrent,
                  sourceKind: liveField?.kind ?? null,
                },
              },
            };
          }
        }
        collector.record({ ...delivered, mode: state.mode });
      });
      const bus = getBus();
      if (bus?.on) for (const name of BOUNDARIES) {
        const off = bus.on(name, () => boundary(name));
        if (typeof off === 'function') session.lifecycleUnsubs.push(off);
      }
      const limits = collector.snapshot();
      return { ok: true, status: 'armed', readOnly: true, installedTick: state.tick,
        maxReceipts: limits.maxReceipts, maxTicks: limits.maxTicks };
    }
    if (!session) return { ok: false, status: 'unsupported', reason: 'observer-not-installed' };
    if (!validSession()) return staleResult();
    if (action === 'begin') {
      if (!Number.isSafeInteger(args.tick) || args.tick < session.tickFloor || args.tick > session.state.tick) {
        return { ok: false, status: 'missing-start', reason: 'flight-tick-invalid' };
      }
      return session.collector.begin(args.tick);
    }
    if (action === 'finalize') {
      detachImpulse();
      return { ok: true, ...session.collector.snapshot() };
    }
    if (action === 'status') return { ok: true, ...session.collector.snapshot() };
    return { ok: false, status: 'unsupported', reason: `unknown-action:${action}` };
  }
  return Object.freeze({ rpc, dispose });
}
