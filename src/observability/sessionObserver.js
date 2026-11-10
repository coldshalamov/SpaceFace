// Passive in-memory Gameplay Observatory recorder. Phase A deliberately has no registry/main or
// filesystem integration: callers opt in, invoke guarded hooks, and periodically drain records.

import {
  OBSERVATORY_CADENCE,
  canonicalStateHash,
  cloneObservatoryValue,
  sampleAppliedInput,
  sampleAssetExposure,
  sampleFramePerformance,
  sampleState,
} from './sessionSamplers.js';

export const OBSERVER_RECORD_SCHEMA_VERSION = 1;
export const DEFAULT_OBSERVER_BUFFER_CAPACITY = 16384;

export function createSessionObserver(options = {}) {
  const enabled = options.enabled === true;
  const capacity = normalizeCapacity(options.capacity);
  const sessionId = String(options.sessionId || 'observatory-session');
  const samplers = {
    sampleAppliedInput,
    sampleState,
    sampleAssetExposure,
    sampleFramePerformance,
    canonicalStateHash,
    ...(options.samplers && typeof options.samplers === 'object' ? options.samplers : {}),
  };
  const getAIIntent = typeof options.getAIIntent === 'function' ? options.getAIIntent : () => null;
  const getAssetExposure = typeof options.getAssetExposure === 'function' ? options.getAssetExposure : () => null;
  const getRenderDiagnostics = typeof options.getRenderDiagnostics === 'function'
    ? options.getRenderDiagnostics : (state) => state && state.render && state.render.diagnostics || null;

  const records = [];
  let nextSeq = 1;
  let frameId = 0;
  let stopped = false;
  let lastState = null;
  const counters = {
    acceptedRecordCount: 0,
    drainedRecordCount: 0,
    droppedRecordCount: 0,
    observerFaultCount: 0,
    rateShortfallCount: 0,
    appliedInputCount: 0,
    stateSampleCount: 0,
    assetSampleCount: 0,
    frameSampleCount: 0,
    eventReceiptCount: 0,
    hashCheckpointCount: 0,
    assetLifecycleCount: 0,
    overflowed: false,
  };

  function afterInput(state) {
    if (!active()) return false;
    lastState = state || lastState;
    return guarded('afterInput', state, () => {
      const sampled = samplers.sampleAppliedInput(state);
      const stored = append('applied_input', sampled, state);
      if (stored) counters.appliedInputCount += 1;
      return stored;
    });
  }

  function afterSimStep(state) {
    if (!active()) return false;
    lastState = state || lastState;
    return guarded('afterSimStep', state, () => {
      const tick = tickOf(state);
      let storedAny = false;
      if (tick > 0 && tick % OBSERVATORY_CADENCE.stateEveryTicks === 0) {
        const intent = cloneObservatoryValue(getAIIntent(state));
        const stored = append('state_sample', samplers.sampleState(state, intent), state);
        if (stored) counters.stateSampleCount += 1;
        storedAny = storedAny || stored;
      }
      if (tick > 0 && tick % OBSERVATORY_CADENCE.assetEveryTicks === 0) {
        const exposure = cloneObservatoryValue(getAssetExposure(state));
        const stored = append('asset_exposure', samplers.sampleAssetExposure(state, exposure), state);
        if (stored) counters.assetSampleCount += 1;
        storedAny = storedAny || stored;
      }
      if (tick > 0 && tick % OBSERVATORY_CADENCE.hashEveryTicks === 0) {
        const stored = append('hash_checkpoint', {
          seed: seedOf(state), tick, simTime: timeOf(state), final: false,
          hash: samplers.canonicalStateHash(state),
        }, state);
        if (stored) counters.hashCheckpointCount += 1;
        storedAny = storedAny || stored;
      }
      return storedAny;
    });
  }

  function onRenderFrame(state, frameDt, alpha, alignment = {}) {
    if (!active()) return false;
    lastState = state || lastState;
    return guarded('onRenderFrame', state, () => {
      frameId += 1;
      const sampled = samplers.sampleFramePerformance(state, frameDt, alpha, {
        frameId,
        wallOffsetMs: alignment.wallOffsetMs,
        diagnostics: getRenderDiagnostics(state),
      });
      const stored = append('frame_perf', sampled, state);
      if (stored) counters.frameSampleCount += 1;
      return stored;
    });
  }

  function recordEvent(type, payload, state = lastState) {
    if (!active()) return false;
    lastState = state || lastState;
    return guarded('recordEvent', state, () => {
      const stored = append('event_receipt', {
        seed: seedOf(state), tick: tickOf(state), simTime: timeOf(state),
        type: String(type || 'unknown'), payload: cloneObservatoryValue(payload),
      }, state);
      if (stored) counters.eventReceiptCount += 1;
      return stored;
    });
  }

  function recordAssetLifecycle(exposure, state = lastState) {
    if (!active()) return false;
    lastState = state || lastState;
    return guarded('recordAssetLifecycle', state, () => {
      const stored = append('asset_lifecycle', samplers.sampleAssetExposure(state, exposure), state);
      if (stored) counters.assetLifecycleCount += 1;
      return stored;
    });
  }

  function drain() {
    const drained = records.map((record) => cloneObservatoryValue(record));
    records.length = 0;
    counters.drainedRecordCount += drained.length;
    return { records: drained, health: health() };
  }

  function stop(spec = {}) {
    if (stopped) return drain();
    const state = spec && spec.state || lastState;
    if (enabled && state && !counters.overflowed && counters.observerFaultCount === 0) {
      guarded('stop', state, () => {
        const stored = append('hash_checkpoint', {
          seed: seedOf(state), tick: tickOf(state), simTime: timeOf(state), final: true,
          hash: samplers.canonicalStateHash(state),
        }, state);
        if (stored) counters.hashCheckpointCount += 1;
        return stored;
      });
    }
    if (enabled && Number.isInteger(spec && spec.expectedTicks)) {
      applyRateExpectation(spec.expectedTicks);
    }
    stopped = true;
    return drain();
  }

  function health() {
    const invalid = counters.droppedRecordCount > 0
      || counters.observerFaultCount > 0
      || counters.rateShortfallCount > 0;
    return {
      enabled,
      capacity,
      totalRecordCount: nextSeq - 1,
      acceptedRecordCount: counters.acceptedRecordCount,
      bufferedRecordCount: records.length,
      drainedRecordCount: counters.drainedRecordCount,
      droppedRecordCount: counters.droppedRecordCount,
      observerFaultCount: counters.observerFaultCount,
      rateShortfallCount: counters.rateShortfallCount,
      appliedInputCount: counters.appliedInputCount,
      stateSampleCount: counters.stateSampleCount,
      assetSampleCount: counters.assetSampleCount,
      frameSampleCount: counters.frameSampleCount,
      eventReceiptCount: counters.eventReceiptCount,
      hashCheckpointCount: counters.hashCheckpointCount,
      assetLifecycleCount: counters.assetLifecycleCount,
      overflowed: counters.overflowed,
      stopped,
      validForRecording: enabled && !invalid,
    };
  }

  function append(kind, fields, state) {
    const sampledFields = fields && typeof fields === 'object'
      ? cloneObservatoryValue(fields)
      : {};
    const record = {
      ...sampledFields,
      schemaVersion: OBSERVER_RECORD_SCHEMA_VERSION,
      sessionId,
      seq: nextSeq,
      kind,
      seed: seedOf(state),
      tick: tickOf(state),
      simTime: timeOf(state),
    };
    nextSeq += 1;
    if (records.length >= capacity) {
      counters.droppedRecordCount += 1;
      counters.overflowed = true;
      return false;
    }
    records.push(record);
    counters.acceptedRecordCount += 1;
    return true;
  }

  function guarded(hook, state, callback) {
    try { return callback(); }
    catch (error) {
      counters.observerFaultCount += 1;
      append('observer_fault', {
        seed: seedOf(state), tick: tickOf(state), simTime: timeOf(state), hook,
        message: String(error && error.message || error || 'observer fault').slice(0, 300),
      }, state);
      return false;
    }
  }

  function applyRateExpectation(expectedTicks) {
    const expected = {
      appliedInputCount: expectedTicks,
      stateSampleCount: Math.floor(expectedTicks / OBSERVATORY_CADENCE.stateEveryTicks),
      assetSampleCount: Math.floor(expectedTicks / OBSERVATORY_CADENCE.assetEveryTicks),
    };
    for (const [key, value] of Object.entries(expected)) {
      counters.rateShortfallCount += Math.abs(counters[key] - value);
    }
  }

  function active() {
    return enabled && !stopped;
  }

  return Object.freeze({
    enabled,
    afterInput,
    afterSimStep,
    onRenderFrame,
    recordEvent,
    recordAssetLifecycle,
    drain,
    stop,
    health,
    hooks: Object.freeze({ afterInput, afterSimStep, onRenderFrame }),
  });
}

function normalizeCapacity(value) {
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_OBSERVER_BUFFER_CAPACITY;
}

function seedOf(state) {
  return Number(state && state.meta && state.meta.seed) >>> 0;
}

function tickOf(state) {
  return Number.isFinite(state && state.tick) ? Math.max(0, Math.trunc(state.tick)) : 0;
}

function timeOf(state) {
  return Number.isFinite(state && state.simTime)
    ? Math.round(state.simTime * 1e6) / 1e6 : 0;
}
