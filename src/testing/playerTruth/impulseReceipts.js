// Bounded, read-only provenance for the opening-motion oracle.
//
// The collector records what the authoritative physics observer actually delivered. It does
// not infer field membership from positions, alter the simulation, or grant a body an opening
// exemption. A check may subtract a receipt only when the raw body id + occupant generation
// resolve to the same reader life and the receipt is complete field provenance.

export const IMPULSE_RECEIPT_SCHEMA_VERSION = 2;
// `maxReceipts` bounds distinct delivered impulse streams. Field streams are compacted into
// exact per-tick samples, so a steady field does not overflow merely because it is applied to
// the same body repeatedly. `maxSeriesPoints` keeps that compact representation bounded too.
export const IMPULSE_RECEIPT_LIMITS = Object.freeze({
  maxReceipts: 256,
  maxTicks: 120,
  maxSeriesPoints: 4096,
});

const finite = (value) => Number.isFinite(value) ? Number(value) : null;
const safeTick = (value) => Number.isSafeInteger(value) ? value : null;
const safeGeneration = (value) => Number.isSafeInteger(value) ? value : null;
const safeRawEntityId = (value) => Number.isSafeInteger(value) ? value : null;

function point(value) {
  return value && typeof value === 'object'
    ? { x: finite(value.x), z: finite(value.z) }
    : { x: null, z: null };
}
function validPoint(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.z);
}

function normalizeLimits(options = {}) {
  const maxReceipts = Number.isSafeInteger(options.maxReceipts) && options.maxReceipts > 0
    ? options.maxReceipts : IMPULSE_RECEIPT_LIMITS.maxReceipts;
  const maxTicks = Number.isSafeInteger(options.maxTicks) && options.maxTicks > 0
    ? options.maxTicks : IMPULSE_RECEIPT_LIMITS.maxTicks;
  const maxSeriesPoints = Number.isSafeInteger(options.maxSeriesPoints) && options.maxSeriesPoints > 0
    ? options.maxSeriesPoints : IMPULSE_RECEIPT_LIMITS.maxSeriesPoints;
  return { maxReceipts, maxTicks, maxSeriesPoints };
}

function normalizeReceipt(observation) {
  const rawEntityId = safeRawEntityId(observation?.entity?.id);
  const occupantGeneration = safeGeneration(observation?.entity?.occupantGeneration);
  const tick = safeTick(observation?.tick);
  const before = point(observation?.before);
  const after = point(observation?.after);
  const field = observation?.provenance?.field;
  const fieldCenter = field ? { x: finite(field.x), z: finite(field.z) } : { x: null, z: null };
  const actualDeltaV = validPoint(before) && validPoint(after)
    ? { x: after.x - before.x, z: after.z - before.z }
    : { x: null, z: null };
  const fieldId = field?.id ?? null;
  const fieldOwnerId = field?.ownerId ?? null;
  const fieldRadius = finite(field?.radius);
  const kind = typeof observation?.kind === 'string' ? observation.kind : null;
  const fieldKind = typeof observation?.provenance?.tag === 'string' ? observation.provenance.tag
    : typeof field?.kind === 'string' ? field.kind : null;
  const mode = typeof observation?.mode === 'string' ? observation.mode : null;
  const fieldComplete = kind !== 'field' || (fieldId != null && fieldOwnerId != null
    && fieldKind != null && validPoint(fieldCenter) && fieldRadius != null && fieldRadius > 0);
  const valid = rawEntityId != null && occupantGeneration != null && tick != null
    && validPoint(before) && validPoint(after) && validPoint(actualDeltaV)
    && kind != null && fieldComplete;
  return {
    valid,
    // Overlapping fields are intentionally reported without provenance. They cannot explain
    // motion, but they are not a malformed claimed receipt. Keep them out of the bounded proof
    // stream while retaining fail-closed grading for a claimed field with incomplete metadata.
    ignorable: kind === 'field' && field == null,
    receipt: {
      rawEntityId: rawEntityId ?? null,
      occupantGeneration,
      tick,
      mode,
      before,
      after,
      actualDeltaV,
      fieldId,
      fieldOwnerId,
      fieldKind,
      kind,
      fieldCenter,
      fieldRadius,
      readerLifeId: null,
    },
  };
}

function fieldStreamKey(receipt) {
  return JSON.stringify([receipt.rawEntityId, receipt.occupantGeneration, receipt.fieldId,
    receipt.fieldOwnerId, receipt.fieldKind]);
}

function receiptFirstTick(receipt) {
  if (Array.isArray(receipt?.samples) && receipt.samples.length) return receipt.samples[0].tick;
  return receipt?.tick ?? null;
}

function receiptLastTick(receipt) {
  if (Array.isArray(receipt?.samples) && receipt.samples.length) {
    return receipt.samples[receipt.samples.length - 1].tick;
  }
  return receipt?.tick ?? null;
}

function cloneReceipt(receipt) {
  return {
    ...receipt,
    before: receipt?.before ? { ...receipt.before } : receipt?.before,
    after: receipt?.after ? { ...receipt.after } : receipt?.after,
    actualDeltaV: receipt?.actualDeltaV ? { ...receipt.actualDeltaV } : receipt?.actualDeltaV,
    fieldCenter: receipt?.fieldCenter ? { ...receipt.fieldCenter } : receipt?.fieldCenter,
    samples: Array.isArray(receipt?.samples)
      ? receipt.samples.map((sample) => ({ ...sample, actualDeltaV: { ...sample.actualDeltaV } }))
      : undefined,
  };
}

function refreshAggregateBounds(receipt) {
  const first = receipt.samples[0];
  const last = receipt.samples[receipt.samples.length - 1];
  receipt.firstTick = first.tick;
  receipt.lastTick = last.tick;
  receipt.tick = last.tick;
}

function addFieldSample(receipt, incoming, maxSeriesPoints, seriesPointCount) {
  const sample = { tick: incoming.tick, actualDeltaV: { ...incoming.actualDeltaV } };
  const last = receipt.samples[receipt.samples.length - 1];
  if (last && last.tick === sample.tick) {
    last.actualDeltaV.x += sample.actualDeltaV.x;
    last.actualDeltaV.z += sample.actualDeltaV.z;
  } else {
    if (seriesPointCount.value >= maxSeriesPoints) return false;
    receipt.samples.push(sample);
    seriesPointCount.value++;
  }
  receipt.actualDeltaV.x += sample.actualDeltaV.x;
  receipt.actualDeltaV.z += sample.actualDeltaV.z;
  receipt.after = { ...incoming.after };
  receipt.fieldCenter = { ...incoming.fieldCenter };
  receipt.fieldRadius = incoming.fieldRadius;
  refreshAggregateBounds(receipt);
  return true;
}

function compactFieldReceipt(receipt) {
  const compact = {
    ...receipt,
    samples: [{ tick: receipt.tick, actualDeltaV: { ...receipt.actualDeltaV } }],
    firstTick: receipt.tick,
    lastTick: receipt.tick,
  };
  return compact;
}

/**
 * Create a bounded collector. `arm()` is safe before public launch; `begin(tick)` fixes the
 * authoritative first-flight tick. Only receipts in [tick, tick + maxTicks) are retained.
 */
export function createBoundedImpulseReceiptCollector(options = {}) {
  const { maxReceipts, maxTicks, maxSeriesPoints } = normalizeLimits(options);
  let armed = false;
  let started = false;
  let flightStartTick = null;
  let overflow = false;
  let invalidCount = 0;
  let ignoredCount = 0;
  const receipts = [];
  const pending = [];
  const fieldBuckets = new Map();
  let seriesPointCount = 0;

  const storedCount = () => receipts.length + pending.length;

  const rebuildIndexes = () => {
    fieldBuckets.clear();
    seriesPointCount = 0;
    for (const receipt of [...receipts, ...pending]) {
      if (receipt?.kind !== 'field') continue;
      fieldBuckets.set(fieldStreamKey(receipt), receipt);
      seriesPointCount += Array.isArray(receipt.samples) ? receipt.samples.length : 0;
    }
  };

  const trimReceiptWindow = (receipt, start, end) => {
    if (receipt?.kind !== 'field' || !Array.isArray(receipt.samples)) {
      return receipt && receipt.tick >= start && receipt.tick < end ? receipt : null;
    }
    receipt.samples = receipt.samples.filter((sample) => (
      Number.isSafeInteger(sample?.tick) && sample.tick >= start && sample.tick < end
    ));
    if (!receipt.samples.length) return null;
    receipt.actualDeltaV = receipt.samples.reduce((total, sample) => ({
      x: total.x + sample.actualDeltaV.x,
      z: total.z + sample.actualDeltaV.z,
    }), { x: 0, z: 0 });
    refreshAggregateBounds(receipt);
    return receipt;
  };

  const storeReceipt = (receipt, target) => {
    if (receipt.kind === 'field') {
      const key = fieldStreamKey(receipt);
      const bucket = fieldBuckets.get(key);
      if (bucket) {
        const series = { value: seriesPointCount };
        if (!addFieldSample(bucket, receipt, maxSeriesPoints, series)) {
          overflow = true;
          return false;
        }
        seriesPointCount = series.value;
        return true;
      }
      if (storedCount() >= maxReceipts || seriesPointCount >= maxSeriesPoints) {
        overflow = true;
        return false;
      }
      const compact = compactFieldReceipt(receipt);
      fieldBuckets.set(key, compact);
      target.push(compact);
      seriesPointCount++;
      return true;
    }
    if (storedCount() >= maxReceipts) {
      overflow = true;
      return false;
    }
    target.push(receipt);
    return true;
  };

  const arm = () => {
    armed = true;
    return status();
  };

  const begin = (tick) => {
    const normalized = safeTick(tick);
    if (!armed) return { ok: false, status: 'unsupported', reason: 'not-armed' };
    if (normalized == null) return { ok: false, status: 'missing-start', reason: 'flight-tick-invalid' };
    if (started) return { ok: true, status: 'already-started', flightStartTick };
    started = true;
    // The reader is deliberately installed before the public route. The actor can announce
    // flight after the first field impulses have already been delivered, so begin() chooses the
    // earliest retained flight receipt when it precedes the announcement. It establishes the
    // bounded grading window and never clears those pre-start receipts.
    const earliestPending = pending.reduce((earliest, receipt) => (
      receipt && (receipt.mode == null || receipt.mode === 'flight')
        && (earliest == null || receiptFirstTick(receipt) < earliest)
        ? receiptFirstTick(receipt) : earliest
    ), null);
    flightStartTick = earliestPending != null && earliestPending < normalized ? earliestPending : normalized;
    const end = flightStartTick + maxTicks;
    for (const receipt of pending) {
      const trimmed = trimReceiptWindow(receipt, flightStartTick, end);
      if (trimmed) receipts.push(trimmed);
      else ignoredCount++;
    }
    pending.length = 0;
    rebuildIndexes();
    return { ok: true, status: 'started', flightStartTick, preStartReceiptCount: receipts.length };
  };

  const record = (observation) => {
    if (!armed) return false;
    // Host observations carry the authoritative mode. Unknown mode is accepted for pure
    // fixtures, while menu/loading impulses cannot contaminate the opening-flight proof.
    const mode = observation?.mode;
    if (mode != null && mode !== 'flight') {
      ignoredCount++;
      return false;
    }
    const tick = safeTick(observation?.tick);
    if (tick == null) {
      ignoredCount++;
      return false;
    }
    const normalized = normalizeReceipt(observation);
    if (!normalized.valid) {
      if (normalized.ignorable) {
        ignoredCount++;
        return false;
      }
      invalidCount++;
      return false;
    }
    if (!started) {
      return storeReceipt(normalized.receipt, pending);
    }
    if (tick < flightStartTick || tick >= flightStartTick + maxTicks) {
      ignoredCount++;
      return false;
    }
    return storeReceipt(normalized.receipt, receipts);
  };

  const status = () => {
    if (!armed) return 'unsupported';
    if (!started) return 'missing-start';
    if (overflow) return 'overflow';
    if (invalidCount > 0) return 'invalid-receipt';
    return 'complete';
  };

  const snapshot = () => {
    const firstReceiptTick = receipts.length
      ? Math.min(...receipts.map((receipt) => receiptFirstTick(receipt))) : null;
    const lastReceiptTick = receipts.length
      ? Math.max(...receipts.map((receipt) => receiptLastTick(receipt))) : null;
    return {
      schemaVersion: IMPULSE_RECEIPT_SCHEMA_VERSION,
      status: status(),
      armed,
      started,
      flightStartTick,
      endTickExclusive: started ? flightStartTick + maxTicks : null,
      maxReceipts,
      maxTicks,
      maxSeriesPoints,
      receiptCount: receipts.length,
      seriesPointCount,
      pendingReceiptCount: pending.length,
      firstReceiptTick,
      lastReceiptTick,
      overflow,
      invalidCount,
      ignoredCount,
      unresolvedIdentityCount: 0,
      receipts: receipts.map(cloneReceipt),
    };
  };

  return Object.freeze({
    arm,
    begin,
    record,
    status,
    snapshot,
  });
}

/** Map raw receipts onto the exact reader life observed for the same generation. */
export function mapImpulseReceiptIdentities(capture, identityFor) {
  const source = capture && typeof capture === 'object' ? capture : {};
  const receipts = Array.isArray(source.receipts) ? source.receipts : [];
  let unresolvedIdentityCount = 0;
  const mapped = receipts.map((receipt) => {
    let readerLifeId = null;
    if (typeof identityFor === 'function'
      && receipt?.rawEntityId != null && Number.isSafeInteger(receipt?.occupantGeneration)) {
      readerLifeId = identityFor(receipt.rawEntityId, receipt.occupantGeneration) ?? null;
    }
    if (readerLifeId == null) unresolvedIdentityCount++;
    return { ...receipt, readerLifeId };
  });
  return { ...source, receipts: mapped, unresolvedIdentityCount };
}

function validFieldReceipt(receipt) {
  const samplesValid = Array.isArray(receipt?.samples)
    ? receipt.samples.length > 0 && receipt.samples.every((sample) => (
      Number.isSafeInteger(sample?.tick) && validPoint(sample.actualDeltaV)
    ))
    : validPoint(receipt?.actualDeltaV);
  return receipt?.kind === 'field'
    && receipt.fieldId != null
    && receipt.fieldOwnerId != null
    && typeof receipt.fieldKind === 'string' && receipt.fieldKind.length > 0
    && Number.isFinite(receipt.fieldRadius) && receipt.fieldRadius > 0
    && validPoint(receipt.fieldCenter)
    && validPoint(receipt.actualDeltaV)
    && samplesValid;
}

function fieldDeltaThrough(receipt, startTick, throughTick) {
  if (Array.isArray(receipt?.samples)) {
    let x = 0; let z = 0; let matched = 0;
    for (const sample of receipt.samples) {
      if (sample.tick < startTick || sample.tick > throughTick) continue;
      x += sample.actualDeltaV.x;
      z += sample.actualDeltaV.z;
      matched++;
    }
    return matched ? { x, z, matched } : null;
  }
  if (!Number.isSafeInteger(receipt?.tick)
    || receipt.tick < startTick || receipt.tick > throughTick) return null;
  return { x: receipt.actualDeltaV.x, z: receipt.actualDeltaV.z, matched: 1 };
}

/**
 * Grade only delivered field impulses for one observed reader life. A non-complete capture,
 * overflow, missing identity, or generation mismatch never explains motion.
 */
export function gradeCausalResidual(capture, {
  readerLifeId,
  rawEntityId = null,
  occupantGeneration = null,
  throughTick,
  velocity,
  threshold = 8,
} = {}) {
  const fail = (reason, extra = {}) => ({ ok: false, reason, deltaV: { x: 0, z: 0 }, matchedReceipts: 0, ...extra });
  if (!capture || capture.status !== 'complete') return fail(capture?.status || 'missing-proof');
  if (capture.overflow || capture.invalidCount > 0) return fail(capture.overflow ? 'overflow' : 'invalid-receipt');
  if (capture.unresolvedIdentityCount > 0) return fail('missing-identity');
  if (readerLifeId == null || !Number.isSafeInteger(rawEntityId)
    || !Number.isSafeInteger(occupantGeneration) || !Number.isSafeInteger(throughTick)) return fail('missing-identity');
  const vx = finite(velocity?.x); const vz = finite(velocity?.z);
  if (vx == null || vz == null) return fail('invalid-velocity');
  const startTick = Number.isSafeInteger(capture.flightStartTick) ? capture.flightStartTick : -Infinity;
  const receipts = (Array.isArray(capture.receipts) ? capture.receipts : []).filter((receipt) => receipt
    && receipt.readerLifeId === readerLifeId
    && receipt.rawEntityId === rawEntityId
    && receipt.occupantGeneration === occupantGeneration
    && validFieldReceipt(receipt));
  if (!receipts.length) return fail('missing-proof');
  let dx = 0; let dz = 0;
  let matchedReceipts = 0;
  for (const receipt of receipts) {
    const contribution = fieldDeltaThrough(receipt, startTick, throughTick);
    if (!contribution) continue;
    dx += contribution.x;
    dz += contribution.z;
    matchedReceipts += contribution.matched;
  }
  if (!matchedReceipts) return fail('missing-proof');
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return fail('invalid-delta');
  const residual = { x: vx - dx, z: vz - dz };
  const speed = Math.hypot(residual.x, residual.z);
  return {
    ok: Number.isFinite(speed) && speed <= threshold,
    reason: Number.isFinite(speed) && speed <= threshold ? 'field-impulses-explain-motion' : 'residual-motion',
    deltaV: { x: dx, z: dz },
    residual,
    speed,
    matchedReceipts,
  };
}
