import { DYNAMIC_BUFFER_FULL_SPAN_VARIANT } from './releaseSoakProbe.mjs';

export const PERFORMANCE_DIRTY_RANGE_ACCEPTANCE_SCHEMA =
  'spaceface.performanceDirtyRangeAcceptance.v1';
export const MIN_DIRTY_RANGE_BYTE_REDUCTION_FRACTION = 0.25;

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function fractionReduced(smaller, larger) {
  return Number.isFinite(smaller) && Number.isFinite(larger) && larger > 0
    ? 1 - (smaller / larger)
    : null;
}

function perLogicalByte(uploadBytes, logicalBytes) {
  return Number.isFinite(uploadBytes) && Number.isFinite(logicalBytes) && logicalBytes > 0
    ? uploadBytes / logicalBytes
    : null;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function windowByVariant(document, variantId) {
  return (document?.windows || []).find((window) => (
    window?.routeTag === 'combat_vfx_burst' && window?.diagnosticVariant === variantId
  )) || null;
}

// The settings slice also carries `timeScale`, which releaseSoakProbe itself classifies as
// authored transient runtime state (hit-stop/focus), not a quality setting. combat_vfx_burst
// intrinsically produces hit-stop on kills, so window edges land at arbitrary dilation phases
// and the equality gate would fail on game feel rather than quality drift. The comparison
// strips it; the recorded slice keeps it for inspection.
function qualitySettingsJson(settingsSlice) {
  if (!settingsSlice || typeof settingsSlice !== 'object') return stableJson(settingsSlice ?? null);
  const { timeScale, ...quality } = settingsSlice;
  return stableJson(quality);
}

export function evaluateDirtyRangeComparison(document, { runtimeKind = 'browser' } = {}) {
  const failures = [];
  const ranged = windowByVariant(document, 'baseline');
  const fullSpan = windowByVariant(document, DYNAMIC_BUFFER_FULL_SPAN_VARIANT);
  if (!ranged) failures.push('ranged baseline combat_vfx_burst window is missing');
  if (!fullSpan) failures.push('full-span control combat_vfx_burst window is missing');

  const rangedLogical = finite(ranged?.dynamicBuffers?.delta?.logicalBytesChanged);
  const fullLogical = finite(fullSpan?.dynamicBuffers?.delta?.logicalBytesChanged);
  const rangedRequested = finite(ranged?.dynamicBuffers?.delta?.requestedUploadBytes);
  const fullRequested = finite(fullSpan?.dynamicBuffers?.delta?.requestedUploadBytes);
  const rangedDriver = finite(ranged?.tier1?.postBoot?.bufferUploadBytes);
  const fullDriver = finite(fullSpan?.tier1?.postBoot?.bufferUploadBytes);
  // The driver leg must measure bytes the dirty-range system controls. Tier-1 counts every
  // bufferSubData including ambient foreign writers (weapon ribbons, VFX pools re-pose their
  // whole buffers per frame no matter which upload policy is active) — on this scenario that
  // ambient dominates the raw total and swings with which combat phase lands in each window
  // (observed 13.8%↔58% run-to-run on identical code). The upload census resolves each driver
  // write back to its CPU-side source view; only views the coordinator tracks count here —
  // the same attribution precedent as the settings gate stripping authored hit-stop timeScale.
  const rangedManagedDriver = finite(ranged?.dynamicBuffers?.partialUploadCensus?.coordinatorOwnedBytes);
  const fullSpanManagedDriver = finite(fullSpan?.dynamicBuffers?.partialUploadCensus?.coordinatorOwnedBytes);
  const rangedRequestedBytesPerLogicalByte = perLogicalByte(rangedRequested, rangedLogical);
  const fullSpanRequestedBytesPerLogicalByte = perLogicalByte(fullRequested, fullLogical);
  const rangedDriverBytesPerLogicalByte = perLogicalByte(rangedDriver, rangedLogical);
  const fullSpanDriverBytesPerLogicalByte = perLogicalByte(fullDriver, fullLogical);
  const ownerRequestedByteReductionFraction = fractionReduced(
    rangedRequestedBytesPerLogicalByte,
    fullSpanRequestedBytesPerLogicalByte,
  );
  const rangedManagedDriverBytesPerLogicalByte = perLogicalByte(rangedManagedDriver, rangedLogical);
  const fullSpanManagedDriverBytesPerLogicalByte = perLogicalByte(fullSpanManagedDriver, fullLogical);
  const driverUploadByteReductionFraction = fractionReduced(
    rangedManagedDriverBytesPerLogicalByte,
    fullSpanManagedDriverBytesPerLogicalByte,
  );
  const rawDriverUploadByteReductionFraction = fractionReduced(
    rangedDriverBytesPerLogicalByte,
    fullSpanDriverBytesPerLogicalByte,
  );
  const logicalByteDriftFraction = Number.isFinite(rangedLogical) && Number.isFinite(fullLogical)
    ? Math.abs(rangedLogical - fullLogical) / Math.max(1, rangedLogical, fullLogical)
    : null;
  const rangedFrameP95 = finite(ranged?.frameMs?.p95);
  const fullFrameP95 = finite(fullSpan?.frameMs?.p95);

  if (ranged?.dynamicBuffers?.probeForceFullUploads !== false) {
    failures.push('ranged baseline did not retain the shipped partial-upload mode');
  }
  if (fullSpan?.dynamicBuffers?.probeForceFullUploads !== true) {
    failures.push('full-span control was not active during its measurement window');
  }
  for (const [label, window] of [['ranged', ranged], ['full-span', fullSpan]]) {
    if (window?.dynamicBuffers?.available !== true) {
      failures.push(`${label} dynamic-buffer owner diagnostics are unavailable`);
    }
    if (window?.tier1?.enabled !== true || finite(window?.tier1?.postBootFrames) <= 0) {
      failures.push(`${label} Tier-1 GL counters are not live post-boot evidence`);
    }
    if (window?.restoration?.restored !== true) {
      failures.push(`${label} scenario or probe control did not restore exactly`);
    }
    if (qualitySettingsJson(window?.settings?.start) !== qualitySettingsJson(window?.settings?.end)) {
      failures.push(`${label} quality/settings changed inside the capture window`);
    }
    for (const field of ['shaderLinks', 'shaderCompiles', 'renderTargetAllocations']) {
      if (finite(window?.tier1?.postBoot?.[field]) !== 0) {
        failures.push(`${label} window was contaminated by post-boot ${field}`);
      }
    }
    // Without the census the driver leg cannot separate managed bytes from ambient foreign
    // traffic — fail closed rather than grade an unattributed total.
    if (!Number.isFinite(finite(window?.dynamicBuffers?.partialUploadCensus?.coordinatorOwnedBytes))) {
      failures.push(`${label} window is missing the partial-upload census needed to attribute driver bytes`);
    }
  }
  if (ranged && fullSpan
      && qualitySettingsJson(ranged.settings?.start) !== qualitySettingsJson(fullSpan.settings?.start)) {
    failures.push('ranged and full-span windows do not share identical quality settings');
  }
  if (!(rangedLogical > 0) || !(fullLogical > 0)) {
    failures.push('both windows must contain positive logical dynamic-buffer writes');
  }
  if (!Number.isFinite(ownerRequestedByteReductionFraction)
      || ownerRequestedByteReductionFraction < MIN_DIRTY_RANGE_BYTE_REDUCTION_FRACTION) {
    failures.push(`owner requested bytes did not fall by at least ${MIN_DIRTY_RANGE_BYTE_REDUCTION_FRACTION * 100}%`);
  }
  if (!Number.isFinite(driverUploadByteReductionFraction)
      || driverUploadByteReductionFraction < MIN_DIRTY_RANGE_BYTE_REDUCTION_FRACTION) {
    failures.push(`driver upload bytes did not fall by at least ${MIN_DIRTY_RANGE_BYTE_REDUCTION_FRACTION * 100}%`);
  }

  return {
    schema: PERFORMANCE_DIRTY_RANGE_ACCEPTANCE_SCHEMA,
    generatedAt: new Date().toISOString(),
    runtimeKind,
    pass: failures.length === 0,
    variant: {
      shipping: 'baseline',
      control: DYNAMIC_BUFFER_FULL_SPAN_VARIANT,
      controlIsDiagnosticOnly: true,
    },
    thresholds: {
      minByteReductionFraction: MIN_DIRTY_RANGE_BYTE_REDUCTION_FRACTION,
    },
    metrics: {
      rangedLogicalBytes: rangedLogical,
      fullSpanLogicalBytes: fullLogical,
      logicalByteDriftFraction,
      rangedRequestedUploadBytes: rangedRequested,
      fullSpanRequestedUploadBytes: fullRequested,
      rangedRequestedBytesPerLogicalByte,
      fullSpanRequestedBytesPerLogicalByte,
      ownerRequestedByteReductionFraction,
      rangedDriverUploadBytes: rangedDriver,
      fullSpanDriverUploadBytes: fullDriver,
      rangedDriverBytesPerLogicalByte,
      fullSpanDriverBytesPerLogicalByte,
      // Raw driver totals including ambient foreign writers — kept for transparency but not
      // gated: foreign buffers re-write regardless of the upload policy under test.
      rawDriverUploadByteReductionFraction,
      rangedManagedDriverUploadBytes: rangedManagedDriver,
      fullSpanManagedDriverUploadBytes: fullSpanManagedDriver,
      rangedManagedDriverBytesPerLogicalByte,
      fullSpanManagedDriverBytesPerLogicalByte,
      driverUploadByteReductionFraction,
      // Transient dilation at the window edges stays on the record even though it is exempt
      // from the quality-equality gate — a grossly asymmetric hit-stop phase is still visible.
      rangedTimeScaleStart: finite(ranged?.settings?.start?.timeScale),
      rangedTimeScaleEnd: finite(ranged?.settings?.end?.timeScale),
      fullSpanTimeScaleStart: finite(fullSpan?.settings?.start?.timeScale),
      fullSpanTimeScaleEnd: finite(fullSpan?.settings?.end?.timeScale),
      rangedFrameP95,
      fullSpanFrameP95: fullFrameP95,
      frameP95DeltaMs: Number.isFinite(rangedFrameP95) && Number.isFinite(fullFrameP95)
        ? rangedFrameP95 - fullFrameP95
        : null,
    },
    failures,
  };
}
