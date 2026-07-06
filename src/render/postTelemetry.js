// Post-processing render-target allocation telemetry (bloom + render graph).
// Counters are read by renderer diagnostics and probe-performance-profile budgets.

let allocationsTotal = 0;
let allocationsDuringSample = 0;
let lastAllocationReason = null;

export function recordPostRenderTargetAllocation(reason, count = 1) {
  const n = Math.max(0, count | 0) || 1;
  allocationsTotal += n;
  allocationsDuringSample += n;
  if (reason) lastAllocationReason = reason;
}

export function resetPostRenderTargetSampleCounter() {
  allocationsDuringSample = 0;
}

export function resetPostRenderTargetTotals() {
  allocationsTotal = 0;
  allocationsDuringSample = 0;
  lastAllocationReason = null;
}

export function getPostRenderTargetTelemetry() {
  return {
    renderTargetAllocationsTotal: allocationsTotal,
    renderTargetAllocationsDuringSample: allocationsDuringSample,
    lastAllocationReason,
  };
}