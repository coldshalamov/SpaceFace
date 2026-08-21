// Simulation Worker host. Abstract catch-up runs off the present thread when
// Worker exists; the same kernel runs synchronously as fallback.

import { ballisticDrift } from '../world/worldCatchup.js';
import { SIM_WORKER_TRANSPORT } from './simWorkerProtocol.js';

export function isSimulationWorkerEnabled() {
  return typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && typeof Worker === 'function'
    && typeof Blob === 'function';
}

export function selectSimWorkerTransport(options = {}) {
  if (!isSimulationWorkerEnabled() && options.force !== true) return null;
  try {
    if (typeof SharedArrayBuffer === 'function') return SIM_WORKER_TRANSPORT.SHARED_ARRAY_BUFFER;
  } catch (_) {}
  return SIM_WORKER_TRANSPORT.FALLBACK_POST_MESSAGE;
}

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

const WORKER_SOURCE = `
self.onmessage = function (event) {
  const data = event.data || {};
  const records = data.records || [];
  const dt = (Number(data.toT) || 0) - (Number(data.fromT) || 0);
  const out = [];
  if (dt > 0) {
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (!rec) continue;
      var px = Number(rec.pos && rec.pos.x) || 0;
      var pz = Number(rec.pos && rec.pos.z) || 0;
      var vx = Number(rec.vel && rec.vel.x) || 0;
      var vz = Number(rec.vel && rec.vel.z) || 0;
      var rot = Number(rec.rot) || 0;
      var ang = Number(rec.angVel) || 0;
      out.push({
        id: rec.id,
        pos: { x: px + vx * dt, z: pz + vz * dt },
        vel: { x: vx, z: vz },
        rot: rot + ang * dt,
        angVel: ang,
        lastExactT: data.toT
      });
    }
  }
  self.postMessage({ id: data.id, records: out });
};
`;

export function createSimWorkerHost() {
  let worker = null;
  let objectUrl = null;
  let requestId = 0;
  let pending = null;
  if (isSimulationWorkerEnabled()) {
    try {
      objectUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
      worker = new Worker(objectUrl, { name: 'spaceface-sim-catchup' });
      worker.onmessage = function onSimWorkerMessage(event) {
        pending = event.data && Array.isArray(event.data.records) ? event.data.records : null;
      };
    } catch (_) {
      worker = null;
    }
  }

  return {
    get transport() {
      return worker ? SIM_WORKER_TRANSPORT.FALLBACK_POST_MESSAGE : null;
    },
    submitAbstract(records, fromT, toT) {
      if (!Array.isArray(records) || records.length === 0) return stepAbstractRecords(records, fromT, toT);
      if (!worker) return stepAbstractRecords(records, fromT, toT);
      requestId++;
      try {
        worker.postMessage({ id: requestId, records, fromT, toT });
      } catch (_) {
        return stepAbstractRecords(records, fromT, toT);
      }
      return null;
    },
    takeResults() {
      const next = pending;
      pending = null;
      return next;
    },
    dispose() {
      if (worker) {
        try { worker.terminate(); } catch (_) {}
        worker = null;
      }
      if (objectUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        try { URL.revokeObjectURL(objectUrl); } catch (_) {}
        objectUrl = null;
      }
    },
  };
}

export function ensureSimWorker(state) {
  if (!state || typeof state !== 'object') return null;
  if (state.__simWorker) return state.__simWorker;
  state.__simWorker = createSimWorkerHost();
  return state.__simWorker;
}

export function applyAbstractCatchupToEntities(state, updates) {
  if (!state || !Array.isArray(updates) || !state.entities || typeof state.entities.get !== 'function') {
    return 0;
  }
  let applied = 0;
  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    const entity = update && state.entities.get(update.id);
    if (!entity || !entity.pos) continue;
    entity.pos.x = update.pos.x;
    entity.pos.z = update.pos.z;
    if (!entity.vel || typeof entity.vel !== 'object') entity.vel = { x: update.vel.x, z: update.vel.z };
    else {
      entity.vel.x = update.vel.x;
      entity.vel.z = update.vel.z;
    }
    entity.rot = update.rot;
    entity.angVel = update.angVel;
    if (entity.activity) entity.activity.lastExactT = update.lastExactT;
    applied++;
  }
  return applied;
}
