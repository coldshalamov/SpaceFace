// Phase-14 simulation-worker host.
//
// The default production route is intentionally null: the current renderer still owns a main-
// thread snapshot and the active-set membership is not transported as an authoritative command
// stream. A caller may opt into the SAB-only seam with `state.__simWorkerPhase14 === true` after
// supplying those prerequisites. The opt-in uses three shared slots and scalar command messages;
// it never clones the abstract world records each frame. Without SAB prerequisites the caller
// receives the deterministic main-thread path instead.

import { ballisticDrift } from '../world/worldCatchup.js';
import { SIM_TIER } from '../world/activityClassification.js';
import {
  SIM_WORKER_HEADER_WORDS,
  SIM_WORKER_RECORD_STRIDE,
  SIM_WORKER_SLOT_STATUS,
  SIM_WORKER_TRANSPORT,
  createSharedSimWorkerBuffers,
  hasSharedSimWorkerPrerequisites,
  isSimulationWorkerEnabled,
  selectSimWorkerTransport,
} from './simWorkerProtocol.js';

export {
  hasSharedSimWorkerPrerequisites,
  isSimulationWorkerEnabled,
  selectSimWorkerTransport,
};

const HEADER_BYTES = SIM_WORKER_HEADER_WORDS * Int32Array.BYTES_PER_ELEMENT;
// Worker results may arrive just after the main-thread boundary, but never get to move it
// backwards or beyond the authoritative current simulation time.
const ABSTRACT_RESULT_TIME_EPSILON = 1e-6;

export function stepAbstractRecords(records, fromT, toT) {
  const dt = (Number(toT) || 0) - (Number(fromT) || 0);
  if (!(dt > 0) || !Array.isArray(records)) return records || [];
  const out = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (!rec || rec.alive === false) continue;
    const next = ballisticDrift(rec.pos, rec.vel, rec.rot, rec.angVel, dt);
    out.push({
      id: rec.id,
      pos: next.pos,
      vel: next.vel,
      rot: next.rot,
      angVel: next.angVel,
      lastExactT: toT,
    });
  }
  return out;
}

function rootObject() {
  return typeof globalThis !== 'undefined' ? globalThis : {};
}

function phase14OptedIn(state) {
  if (!state || typeof state !== 'object') return false;
  // Private runtime seam only. Do not let a persisted/profile setting silently change simulation
  // authority before the active-set and presentation handoff have been integrated.
  return state.__simWorkerPhase14 === true;
}

function makeMainThreadHost() {
  return {
    transport: SIM_WORKER_TRANSPORT.MAIN_THREAD,
    productionEnabled: false,
    startupPending: false,
    submitAbstract(records, fromT, toT) {
      return stepAbstractRecords(records, fromT, toT);
    },
    takeResults() { return null; },
    dispose() {},
  };
}

function makeSabHost(options = {}) {
  const root = rootObject();
  if (typeof root.Worker !== 'function' || !hasSharedSimWorkerPrerequisites()) {
    return makeMainThreadHost();
  }
  const shared = createSharedSimWorkerBuffers(options.capacity || 1024);
  if (!shared) return makeMainThreadHost();

  let worker = null;
  let workerReady = false;
  let disposed = false;
  let requestSequence = 0;
  let appliedSequence = 0;
  let pending = null;
  let cursor = 0;
  let lastError = null;
  const slots = shared.buffers.map((buffer) => ({
    header: new Int32Array(buffer, 0, SIM_WORKER_HEADER_WORDS),
    values: new Float64Array(buffer, HEADER_BYTES, shared.capacity * SIM_WORKER_RECORD_STRIDE),
    ids: [],
    toT: 0,
  }));

  const release = (index) => {
    const slot = slots[index];
    if (!slot) return;
    slot.ids.length = 0;
    slot.toT = 0;
    Atomics.store(slot.header, 0, SIM_WORKER_SLOT_STATUS.FREE);
  };

  const releaseAll = () => {
    for (let index = 0; index < slots.length; index++) release(index);
    pending = null;
  };

  const chooseFreeSlot = () => {
    for (let offset = 0; offset < slots.length; offset++) {
      const index = (cursor + offset) % slots.length;
      if (Atomics.load(slots[index].header, 0) === SIM_WORKER_SLOT_STATUS.FREE) {
        cursor = (index + 1) % slots.length;
        return index;
      }
    }
    return -1;
  };

  const onMessage = (event) => {
    const message = event && event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'ready') {
      workerReady = true;
      return;
    }
    if (message.type === 'error') {
      lastError = message.reason || 'worker_error';
      workerReady = false;
      releaseAll();
      try { worker.terminate(); } catch (_) {}
      worker = null;
      return;
    }
    if (message.type !== 'result') return;
    const index = message.slot | 0;
    const sequence = message.sequence >>> 0;
    const slot = slots[index];
    if (!slot || Atomics.load(slot.header, 0) !== SIM_WORKER_SLOT_STATUS.DONE) return;
    if (Atomics.load(slot.header, 1) !== sequence || sequence <= appliedSequence) {
      release(index);
      return;
    }
    // Keep only the newest completed slot. An older late result must never overwrite a newer
    // result or occupy one of the three buffers indefinitely.
    if (pending && pending.sequence >= sequence) {
      release(index);
      return;
    }
    if (pending) release(pending.slot);
    pending = { slot: index, sequence, count: Math.max(0, message.count | 0) };
  };

  try {
    // A module worker is a real production entry, but creation remains explicitly phase-14 gated.
    worker = new root.Worker(new URL('./simWorker.js', import.meta.url), {
      type: 'module',
      name: 'spaceface-sim-phase14',
    });
    worker.onmessage = onMessage;
    worker.onerror = (error) => {
      lastError = error && error.message ? String(error.message) : 'worker_failed';
      workerReady = false;
      releaseAll();
      try { worker.terminate(); } catch (_) {}
      worker = null;
    };
    worker.postMessage({ type: 'init', buffers: shared.buffers, capacity: shared.capacity });
  } catch (error) {
    lastError = error && error.message ? String(error.message) : 'worker_setup_failed';
    worker = null;
    return makeMainThreadHost();
  }

  return {
    get transport() {
      return worker && !disposed && workerReady
        ? SIM_WORKER_TRANSPORT.SHARED_ARRAY_BUFFER
        : SIM_WORKER_TRANSPORT.MAIN_THREAD;
    },
    get productionEnabled() { return !!(worker && !disposed && workerReady); },
    get startupPending() { return !!(worker && !disposed && !workerReady); },
    get lastError() { return lastError; },

    submitAbstract(records, fromT, toT) {
      if (!Array.isArray(records) || records.length === 0) return stepAbstractRecords(records, fromT, toT);
      if (!((Number(toT) || 0) - (Number(fromT) || 0) > 0)) {
        return stepAbstractRecords(records, fromT, toT);
      }
      // Do not allocate a fallback record array while the phase-14 worker is still handshaking;
      // the caller may simply skip this optional lane until readiness arrives.
      if (!worker || disposed) return stepAbstractRecords(records, fromT, toT);
      if (!workerReady) return null;
      const index = chooseFreeSlot();
      if (index < 0 || records.length > shared.capacity) return stepAbstractRecords(records, fromT, toT);
      const slot = slots[index];
      // Keep the SAB result shape identical to the deterministic kernel, which omits dead or
      // missing records. The filter is performed while packing so the phase-14 path does not
      // allocate a cloned structured record array.
      let count = 0;
      const sequence = ++requestSequence;
      slot.toT = Number.isFinite(Number(toT)) ? Number(toT) : 0;
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (!record || record.alive === false) continue;
        const packedOffset = count * SIM_WORKER_RECORD_STRIDE;
        slot.ids[count] = record.id;
        slot.values[packedOffset] = Number(record.pos && record.pos.x) || 0;
        slot.values[packedOffset + 1] = Number(record.pos && record.pos.z) || 0;
        slot.values[packedOffset + 2] = Number(record.vel && record.vel.x) || 0;
        slot.values[packedOffset + 3] = Number(record.vel && record.vel.z) || 0;
        slot.values[packedOffset + 4] = Number(record.rot) || 0;
        slot.values[packedOffset + 5] = Number(record.angVel) || 0;
        count++;
      }
      slot.ids.length = count;
      if (count === 0) {
        release(index);
        return [];
      }
      Atomics.store(slot.header, 1, sequence >>> 0);
      Atomics.store(slot.header, 2, count);
      Atomics.store(slot.header, 0, SIM_WORKER_SLOT_STATUS.READY);
      try {
        // Only scalar metadata crosses the worker boundary. The records remain in the SAB slot.
        worker.postMessage({ type: 'step', slot: index, sequence, fromT: Number(fromT) || 0, toT: slot.toT });
        return null;
      } catch (error) {
        lastError = error && error.message ? String(error.message) : 'worker_dispatch_failed';
        release(index);
        return stepAbstractRecords(records, fromT, toT);
      }
    },

    takeResults() {
      if (!pending) return null;
      const result = pending;
      pending = null;
      const slot = slots[result.slot];
      if (!slot || result.sequence <= appliedSequence) {
        if (slot) release(result.slot);
        return null;
      }
      const count = Math.min(result.count, slot.ids.length, shared.capacity);
      const updates = [];
      for (let i = 0; i < count; i++) {
        const offset = i * SIM_WORKER_RECORD_STRIDE;
        updates.push({
          id: slot.ids[i],
          pos: { x: slot.values[offset], z: slot.values[offset + 1] },
          vel: { x: slot.values[offset + 2], z: slot.values[offset + 3] },
          rot: slot.values[offset + 4],
          angVel: slot.values[offset + 5],
          lastExactT: slot.toT,
        });
      }
      appliedSequence = result.sequence;
      release(result.slot);
      return updates;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      releaseAll();
      if (worker && typeof worker.terminate === 'function') {
        try { worker.terminate(); } catch (_) {}
      }
      worker = null;
    },
  };
}

export function createSimWorkerHost(options = {}) {
  const transport = selectSimWorkerTransport({
    enabled: options.enable === true,
    allowPostMessage: false,
  });
  if (options.enable !== true || transport !== SIM_WORKER_TRANSPORT.SHARED_ARRAY_BUFFER) {
    return makeMainThreadHost();
  }
  return makeSabHost(options);
}

export function ensureSimWorker(state) {
  // Do not silently turn a Worker constructor into a gameplay authority. The current render
  // snapshot and active-set command/event transport are not yet shared with this seam.
  if (!phase14OptedIn(state) || !hasSharedSimWorkerPrerequisites()) return null;
  if (state.__simWorker) {
    if (state.__simWorker.transport === SIM_WORKER_TRANSPORT.MAIN_THREAD
      && state.__simWorker.startupPending !== true) {
      try { state.__simWorker.dispose(); } catch (_) {}
      delete state.__simWorker;
      return null;
    }
    return state.__simWorker;
  }
  const host = createSimWorkerHost({ enable: true });
  if (host.transport === SIM_WORKER_TRANSPORT.MAIN_THREAD && host.startupPending !== true) return null;
  state.__simWorker = host;
  return host;
}

export function applyAbstractCatchupToEntities(state, updates) {
  if (!state || !Array.isArray(updates) || !state.entities || typeof state.entities.get !== 'function') {
    return 0;
  }
  const currentT = state.simTime;
  if (!Number.isFinite(currentT)) return 0;
  let applied = 0;
  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    const entity = update && state.entities.get(update.id);
    const activity = entity && entity.activity;
    if (!entity || entity.alive === false || !entity.pos
      || !activity || activity.simTier !== SIM_TIER.S2_ABSTRACT) continue;
    if (!Number.isFinite(update.lastExactT)) continue;
    if (update.lastExactT > currentT + ABSTRACT_RESULT_TIME_EPSILON) continue;
    if (Number.isFinite(activity.lastExactT)
      && update.lastExactT < activity.lastExactT - ABSTRACT_RESULT_TIME_EPSILON) continue;
    if (!update.pos || !Number.isFinite(update.pos.x) || !Number.isFinite(update.pos.z)) continue;
    if (!update.vel || !Number.isFinite(update.vel.x) || !Number.isFinite(update.vel.z)) continue;
    entity.pos.x = update.pos.x;
    entity.pos.z = update.pos.z;
    if (!entity.vel || typeof entity.vel !== 'object') entity.vel = { x: update.vel.x, z: update.vel.z };
    else {
      entity.vel.x = update.vel.x;
      entity.vel.z = update.vel.z;
    }
    entity.rot = Number.isFinite(update.rot) ? update.rot : entity.rot;
    entity.angVel = Number.isFinite(update.angVel) ? update.angVel : entity.angVel;
    if (entity.activity) entity.activity.lastExactT = update.lastExactT;
    applied++;
  }
  return applied;
}
