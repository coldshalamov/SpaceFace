// Phase-14 simulation worker entry. It owns only the abstract ballistic kernel and communicates
// through a host-provided SAB triple buffer. The normal game does not opt into this entry yet;
// `simWorkerHost.js` requires an explicit phase-14 opt-in plus shared-memory prerequisites.

import {
  SIM_WORKER_HEADER_WORDS,
  SIM_WORKER_RECORD_STRIDE,
  SIM_WORKER_SLOT_STATUS,
} from './simWorkerProtocol.js';

const HEADER_BYTES = SIM_WORKER_HEADER_WORDS * Int32Array.BYTES_PER_ELEMENT;

function wrapAngle(value) {
  let angle = Number.isFinite(value) ? value : 0;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

let slots = [];
let capacity = 0;

function attachBuffers(buffers, nextCapacity) {
  if (!Array.isArray(buffers) || buffers.length === 0) return false;
  const count = Math.max(16, nextCapacity | 0);
  try {
    slots = buffers.map((buffer) => ({
      header: new Int32Array(buffer, 0, SIM_WORKER_HEADER_WORDS),
      values: new Float64Array(buffer, HEADER_BYTES, count * SIM_WORKER_RECORD_STRIDE),
    }));
    capacity = count;
    return true;
  } catch (_) {
    slots = [];
    capacity = 0;
    return false;
  }
}

function processSlot(slotIndex, sequence, fromT, toT) {
  const slot = slots[slotIndex];
  if (!slot || Atomics.compareExchange(
    slot.header,
    0,
    SIM_WORKER_SLOT_STATUS.READY,
    SIM_WORKER_SLOT_STATUS.PROCESSING,
  ) !== SIM_WORKER_SLOT_STATUS.READY) return;

  const count = Math.min(Math.max(0, Atomics.load(slot.header, 2)), capacity);
  // Timestamps are scalar command metadata, never a world payload clone.
  const dt = Math.max(0, finite(toT) - finite(fromT));
  for (let index = 0; index < count; index++) {
    const offset = index * SIM_WORKER_RECORD_STRIDE;
    const x = finite(slot.values[offset]);
    const z = finite(slot.values[offset + 1]);
    const vx = finite(slot.values[offset + 2]);
    const vz = finite(slot.values[offset + 3]);
    const rot = finite(slot.values[offset + 4]);
    const angVel = finite(slot.values[offset + 5]);
    slot.values[offset] = x + vx * dt;
    slot.values[offset + 1] = z + vz * dt;
    slot.values[offset + 2] = vx;
    slot.values[offset + 3] = vz;
    slot.values[offset + 4] = wrapAngle(rot + angVel * dt);
    slot.values[offset + 5] = angVel;
  }
  Atomics.store(slot.header, 1, sequence >>> 0);
  Atomics.store(slot.header, 0, SIM_WORKER_SLOT_STATUS.DONE);
  self.postMessage({ type: 'result', slot: slotIndex, sequence, count });
}

if (typeof self !== 'undefined') {
  self.onmessage = (event) => {
    const message = event && event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'init') {
      const ok = attachBuffers(message.buffers, message.capacity);
      self.postMessage({ type: ok ? 'ready' : 'error', reason: ok ? null : 'buffer_init_failed' });
      return;
    }
    if (message.type !== 'step') return;
    processSlot(
      message.slot | 0,
      message.sequence >>> 0,
      finite(Number(message.fromT)),
      finite(Number(message.toT)),
    );
  };
}
