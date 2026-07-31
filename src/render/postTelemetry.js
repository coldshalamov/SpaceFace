// Post-processing render-target allocation telemetry (bloom + render graph).
// Counters are read by renderer diagnostics and probe-performance-profile budgets.

let allocationsTotal = 0;
let allocationsDuringSample = 0;
let lastAllocationReason = null;
const ALLOCATION_EVENT_LIMIT = 64;
const allocationEvents = new Array(ALLOCATION_EVENT_LIMIT);
let allocationEventHead = 0;
let allocationEventCount = 0;
let nextAllocationId = 1;
let nextFrameToken = 1;
let activeFrameToken = 0;
let activeDisplayFrameId = null;
let activeRenderFrameId = null;
let activeSimTick = null;

function allocationEventSnapshot() {
  const out = [];
  const start = (allocationEventHead - allocationEventCount + ALLOCATION_EVENT_LIMIT)
    % ALLOCATION_EVENT_LIMIT;
  for (let i = 0; i < allocationEventCount; i++) {
    out.push(allocationEvents[(start + i) % ALLOCATION_EVENT_LIMIT]);
  }
  return out;
}

export function beginPostRenderTargetFrameOrigin(origin) {
  if (!Number.isSafeInteger(origin?.displayFrameId) || origin.displayFrameId <= 0
      || !Number.isSafeInteger(origin?.renderFrameId) || origin.renderFrameId <= 0
      || !Number.isSafeInteger(origin?.simTick) || origin.simTick < 0) {
    throw new TypeError('post-target frame origin requires display/render IDs and sim tick');
  }
  if (nextFrameToken > Number.MAX_SAFE_INTEGER) throw new Error('post-target frame token exhausted');
  activeFrameToken = nextFrameToken++;
  activeDisplayFrameId = origin.displayFrameId;
  activeRenderFrameId = origin.renderFrameId;
  activeSimTick = origin.simTick;
  return activeFrameToken;
}

export function endPostRenderTargetFrameOrigin(token) {
  if (token !== activeFrameToken || token === 0) return false;
  activeFrameToken = 0;
  activeDisplayFrameId = null;
  activeRenderFrameId = null;
  activeSimTick = null;
  return true;
}

export function recordPostRenderTargetAllocation(reason, count = 1) {
  const n = Math.max(0, count | 0) || 1;
  allocationsTotal += n;
  allocationsDuringSample += n;
  if (reason) lastAllocationReason = reason;
  if (nextAllocationId > Number.MAX_SAFE_INTEGER) throw new Error('post-target allocation identity exhausted');
  allocationEvents[allocationEventHead] = Object.freeze({
    allocationId: nextAllocationId++,
    reason: reason || null,
    count: n,
    displayFrameId: activeDisplayFrameId,
    renderFrameId: activeRenderFrameId,
    simTick: activeSimTick,
  });
  allocationEventHead = (allocationEventHead + 1) % ALLOCATION_EVENT_LIMIT;
  if (allocationEventCount < ALLOCATION_EVENT_LIMIT) allocationEventCount++;
}

export function resetPostRenderTargetSampleCounter() {
  allocationsDuringSample = 0;
}

export function resetPostRenderTargetTotals() {
  allocationsTotal = 0;
  allocationsDuringSample = 0;
  lastAllocationReason = null;
  allocationEvents.fill(undefined);
  allocationEventHead = 0;
  allocationEventCount = 0;
  activeFrameToken = 0;
  activeDisplayFrameId = null;
  activeRenderFrameId = null;
  activeSimTick = null;
}

export function getPostRenderTargetTelemetry() {
  return {
    renderTargetAllocationsTotal: allocationsTotal,
    renderTargetAllocationsDuringSample: allocationsDuringSample,
    lastAllocationReason,
    allocationEventSchema: 'spaceface.postTargetAllocationEvent.v1',
    allocationEvents: allocationEventSnapshot(),
  };
}
