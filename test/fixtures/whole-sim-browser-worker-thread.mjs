import { parentPort, workerData } from 'node:worker_threads';

// The browser fixture runs the actual worker entrypoint in a separate module
// realm. That separation matters: simLaneMain's command sink is intentionally
// main-realm state and must never be visible to authoritative worker systems.
const pending = [];
// Keep `self` equal to the real worker global.  Rapier's wasm-bindgen bootstrap
// resolves its global object through `self`; a detached facade makes its wasm
// borrow state invalid in Node worker threads and the first World.step() panics
// with `unreachable`.  Only replace postMessage, which is the browser surface
// the fixture needs to bridge to parentPort.
const workerSelf = globalThis;
workerSelf.postMessage = function postMessage(message, transfer) {
  parentPort.postMessage(message, Array.isArray(transfer) ? transfer : []);
};
globalThis.self = workerSelf;

// D204's active-clock failure happens in a separate worker realm, so the
// parent cannot inspect the owner just before Rapier's first step.  This is an
// opt-in fixture diagnostic; normal worker tests never install the wrapper.
if (workerData?.d204StepDiagnostics === true) {
  const { Sg02DynamicBodyOwner } = await import('../../src/core/sg02DynamicBodyOwner.js');
  const originalStepFixed = Sg02DynamicBodyOwner.prototype._stepFixed;
  const originalRemoveRecord = Sg02DynamicBodyOwner.prototype._removeRecord;
  const safe = (fn, fallback = null) => {
    try { return fn(); } catch (_) { return fallback; }
  };
  const finite = (value) => Number.isFinite(value) ? value : null;
  const vector = (value) => {
    if (!value || typeof value !== 'object') return null;
    return { x: finite(value.x), y: finite(value.y), z: finite(value.z) };
  };
  const integration = (owner) => {
    const p = owner.world?.integrationParameters;
    if (!p) return null;
    const names = [
      'dt', 'erp', 'lengthUnit', 'allowedLinearError', 'normalizedAllowedLinearError',
      'predictionDistance', 'normalizedPredictionDistance', 'maxCcdSubsteps',
      'numSolverIterations', 'numInternalPgsIterations', 'numInternalPgsIterations',
      'contactNaturalFrequency', 'contact_natural_frequency', 'warmstartCoefficient',
      'maxVelocityIterations', 'maxVelocityFrictionIterations', 'maxStabilizationIterations',
      'minIslandSize',
    ];
    return Object.fromEntries(names.map((name) => [name, finite(p[name])]));
  };
  const recordState = (rec) => {
    const body = rec?.body;
    const entity = rec?.entity;
    const spec = rec?.spec;
    const colliders = Array.isArray(rec?.colliders) ? rec.colliders : [];
    return {
      id: entity?.id ?? null,
      type: entity?.type ?? null,
      dynamic: spec?.dynamic === true,
      shape: spec?.shape ?? null,
      material: spec?.material ?? null,
      mass: finite(spec?.mass),
      inertiaY: finite(spec?.inertiaY),
      bodyHandle: safe(() => body?.handle),
      enabled: safe(() => body?.isEnabled()),
      sleeping: safe(() => body?.isSleeping()),
      translation: safe(() => vector(body?.translation())),
      rotation: safe(() => body?.rotation()),
      linvel: safe(() => vector(body?.linvel())),
      angvel: safe(() => vector(body?.angvel())),
      massNative: safe(() => finite(body?.mass())),
      invMassNative: safe(() => finite(body?.invMass())),
      colliders: colliders.map((collider) => ({
        handle: safe(() => collider?.handle),
        shapeType: safe(() => collider?.shapeType()),
        enabled: safe(() => collider?.isEnabled()),
        sensor: safe(() => collider?.isSensor()),
        parentHandle: safe(() => collider?.parent()?.handle),
        collisionGroups: safe(() => collider?.collisionGroups()),
        activeHooks: safe(() => collider?.activeHooks()),
        translationWrtParent: safe(() => vector(collider.translationWrtParent())),
        rotationWrtParent: safe(() => collider.rotationWrtParent()),
        geometry: safe(() => {
          const type = collider?.shapeType();
          if (type === 0) return { type, radius: finite(collider.radius()) };
          if (type === 1 || type === 12) return {
            type,
            halfExtents: vector(collider.halfExtents()),
            roundRadius: type === 12 ? finite(collider.roundRadius()) : null,
          };
          if (type === 2) return {
            type,
            radius: finite(collider.radius()),
            halfHeight: finite(collider.halfHeight()),
          };
          if (type === 9 || type === 16) {
            const vertices = collider.vertices();
            const indices = collider.indices();
            const values = Array.from(vertices || []);
            const indexValues = Array.from(indices || []);
            const bad = values.filter((value) => !Number.isFinite(value)).length;
            return {
              type,
              vertices: values.length,
              indices: indexValues.length,
              indexMin: indexValues.length ? Math.min(...indexValues) : null,
              indexMax: indexValues.length ? Math.max(...indexValues) : null,
              bad,
              min: values.length ? Math.min(...values) : null,
              max: values.length ? Math.max(...values) : null,
              roundRadius: type === 16 ? finite(collider.roundRadius()) : null,
            };
          }
          return { type };
        }),
      })),
      expected: rec?.expected ? {
        x: finite(rec.expected.x), z: finite(rec.expected.z),
        vx: finite(rec.expected.vx), vz: finite(rec.expected.vz),
        yaw: finite(rec.expected.yaw), wy: finite(rec.expected.wy),
      } : null,
      entityPose: entity ? {
        x: finite(entity.pos?.x), z: finite(entity.pos?.z),
        rot: finite(entity.rot), vx: finite(entity.vel?.x), vz: finite(entity.vel?.z),
        angVel: finite(entity.angVel),
      } : null,
    };
  };
  const collect = (owner) => {
    const records = owner?.records instanceof Map ? Array.from(owner.records.values()) : [];
    const dynamic = owner?.dynamicRecords instanceof Set ? Array.from(owner.dynamicRecords) : [];
    return {
      tick: owner?.tick,
      simTick: owner?._simTick,
      fixedDt: owner?.fixedDt,
      worldTimestep: safe(() => owner.world?.timestep),
      integration: integration(owner),
      recordCount: records.length,
      dynamicCount: dynamic.length,
      liveCount: owner?._liveEntityIds instanceof Set ? owner._liveEntityIds.size : null,
      liveDynamicCount: owner?._liveDynamicEntityIds instanceof Set ? owner._liveDynamicEntityIds.size : null,
      worldBodies: safe(() => owner.world?.bodies?.len()),
      worldColliders: safe(() => owner.world?.colliders?.len()),
      worldImpulseJoints: safe(() => owner.world?.impulseJoints?.len()),
      worldMultibodyJoints: safe(() => owner.world?.multibodyJoints?.len()),
      attachments: owner?.attachments instanceof Map ? owner.attachments.size : null,
      suspendedAttachments: owner?._suspendedAttachments instanceof Map ? owner._suspendedAttachments.size : null,
      records: records.slice(0, 64).map(recordState),
    };
  };
  Sg02DynamicBodyOwner.prototype._stepFixed = function d204StepFixed(...args) {
    const before = collect(this);
    parentPort.postMessage({ kind: 'd204-step-input', before });
    const savedEventQueue = this._eventQueue;
    if (workerData.d204DisableEventQueue === true) this._eventQueue = null;
    try {
      const disabled = new Set(Array.isArray(workerData.d204DisableEntityIds)
        ? workerData.d204DisableEntityIds : []);
      if (disabled.size > 0 && this.records instanceof Map) {
        for (const rec of this.records.values()) {
          if (disabled.has(Number(rec?.entity?.id)) && typeof rec.body?.setEnabled === 'function') {
            rec.body.setEnabled(false);
          }
        }
      }
      if (Array.isArray(workerData.d204KeepEntityIds) && this.records instanceof Map) {
        const keep = new Set(workerData.d204KeepEntityIds);
        for (const rec of this.records.values()) {
          if (keep.has(Number(rec?.entity?.id))) continue;
          try { this.world.removeRigidBody(rec.body); } catch (_) {}
        }
      }
      if (workerData.d204DirectWorldStep === true) {
        parentPort.postMessage({ kind: 'd204-direct-world-step-input', afterRemoval: collect(this) });
        this.world.step(this._eventQueue || undefined);
        parentPort.postMessage({ kind: 'd204-direct-world-step-ok', after: collect(this) });
        return;
      }
      const result = originalStepFixed.apply(this, args);
      parentPort.postMessage({ kind: 'd204-step-output', after: collect(this) });
      return result;
    } catch (error) {
      parentPort.postMessage({
        kind: 'd204-step-error',
        error: { name: error?.name, message: error?.message, stack: error?.stack },
        before,
        after: collect(this),
      });
      throw error;
    } finally {
      this._eventQueue = savedEventQueue;
    }
  };
  if (workerData.d204SkipRemovals === true) {
    Sg02DynamicBodyOwner.prototype._removeRecord = function d204KeepRecord(id, rec) {
      parentPort.postMessage({ kind: 'd204-skip-removal', id: rec?.entity?.id ?? id });
      return true;
    };
    // Keep the original available for debugging in a worker realm without changing production.
    Sg02DynamicBodyOwner.prototype._d204OriginalRemoveRecord = originalRemoveRecord;
  }
}

parentPort.on('message', (data) => {
  if (typeof workerSelf.onmessage === 'function') workerSelf.onmessage({ data });
  else pending.push(data);
});

await import(`../../src/core/wholeSimBrowserWorker.js?node-worker-${Date.now()}`);
for (const data of pending.splice(0)) workerSelf.onmessage({ data });
