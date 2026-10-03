// PQ-177.07 — visible operational limits for a programmed miner.
// Pure projection: names the physical stage that is actually stopping work, the operating
// state a player can see, and whether another machine would help. Runtime owners still
// write credits, cargo, and the drone roster.

export const LIMIT_STAGE = Object.freeze({
  NO_EXPOSED_FACE: 'no_exposed_face',
  NO_POWER: 'no_power',
  FULL_STORAGE: 'full_storage',
  BLOCKED_LANE: 'blocked_lane',
  MISSING_INPUT: 'missing_input',
  LAUNCH_CAPACITY: 'launch_capacity',
  POOR_DESTINATION: 'poor_destination',
  DEMAND_SATURATION: 'demand_saturation',
});

export const OPERATING_STATE = Object.freeze({
  RUNNING: 'running',
  STRANDED: 'stranded',
  WAITING: 'waiting',
  STALLED: 'stalled',
});

export const THROUGHPUT_SETTLEMENT_SOURCES = Object.freeze(['drone:program']);

const LIMIT_COPY = Object.freeze({
  [LIMIT_STAGE.NO_EXPOSED_FACE]: {
    label: 'No rock to cut',
    reason: 'There is no exposed face left. Another machine would sit idle too.',
    helps: false,
  },
  [LIMIT_STAGE.NO_POWER]: {
    label: 'No power',
    reason: 'The line has no power. Adding a machine will not start it.',
    helps: false,
  },
  [LIMIT_STAGE.FULL_STORAGE]: {
    label: 'Hold is full',
    reason: 'This hold is full and waiting to unload. Another machine with empty space would still cut.',
    helps: true,
  },
  [LIMIT_STAGE.BLOCKED_LANE]: {
    label: 'Lane blocked',
    reason: 'It cannot reach the depot. Another machine on the same lane would stall too.',
    helps: false,
  },
  [LIMIT_STAGE.MISSING_INPUT]: {
    label: 'Out of fuel',
    reason: 'It is waiting for fuel. The machine is still here. Refuel to start it again.',
    helps: false,
  },
  [LIMIT_STAGE.LAUNCH_CAPACITY]: {
    label: 'No launch room',
    reason: 'The bay is full. Another machine cannot launch until one is recalled.',
    helps: false,
  },
  [LIMIT_STAGE.POOR_DESTINATION]: {
    label: 'Depot is not buying',
    reason: 'This depot will not pay for the load. Send it somewhere that still wants the ore.',
    helps: false,
  },
  [LIMIT_STAGE.DEMAND_SATURATION]: {
    label: 'Depot is full of this ore',
    reason: 'The depot is saturated. Another machine would not sell more here.',
    helps: false,
  },
});

export function isThroughputSettledSource(source) {
  return THROUGHPUT_SETTLEMENT_SOURCES.includes(String(source || ''));
}

export function isFuelStranded(group) {
  if (!group || typeof group !== 'object') return false;
  if (group.status === 'distressed') return false;
  if (group.fuel != null && Number.isFinite(Number(group.fuel)) && Number(group.fuel) <= 0) return true;
  if (group.status === OPERATING_STATE.STRANDED) return true;
  const op = group.operation;
  return !!(op && op.operatingState === OPERATING_STATE.STRANDED);
}

export function operatingCostPerMin(upkeepPerMin, operatingState) {
  const upkeep = Math.max(0, Number(upkeepPerMin) || 0);
  if (operatingState === OPERATING_STATE.RUNNING) return upkeep;
  return 0;
}

export function boundDemandQty(have, quote) {
  const want = Math.max(0, Math.floor(Number(have) || 0));
  if (want <= 0 || !quote) return 0;
  if (quote.fillable != null) return Math.max(0, Math.min(want, Math.floor(Number(quote.fillable) || 0)));
  if ((Number(quote.unitAvg) || 0) > 0 && (Number(quote.total) || 0) > 0) return want;
  return 0;
}

export function ensureOperation(group) {
  if (!group || typeof group !== 'object') return null;
  if (!group.operation || typeof group.operation !== 'object' || Array.isArray(group.operation)) {
    group.operation = {
      grossUnits: 0,
      storedUnits: 0,
      storedCap: 0,
      limitStage: null,
      operatingState: OPERATING_STATE.RUNNING,
      reason: 'Waiting for the first cut.',
      lastSale: null,
      operatingCostPerMin: 0,
      netThroughputPerMin: 0,
      addingMachineHelps: true,
      throughputPrimary: true,
    };
  }
  const op = group.operation;
  if (!Number.isFinite(op.grossUnits)) op.grossUnits = 0;
  if (op.throughputPrimary !== true) op.throughputPrimary = true;
  ensureCycle(op);
  return op;
}

// SF-115 — the per-cycle ledger. Every field is accumulated from committed events (a cut unit, a
// burned fuel point, an accrued upkeep credit, a signed sale receipt, a non-sale withdrawal), so
// the closed breakdown reconciles: carryIn + mined === sold + withdrawn + held. Stock still in the
// shipment at close is held, never booked as income.
function ensureCycle(op) {
  if (!op.cycle || typeof op.cycle !== 'object' || Array.isArray(op.cycle)) {
    op.cycle = {
      carryInUnits: 0,
      minedUnits: 0,
      soldUnits: 0,
      withdrawnUnits: 0,
      fuelUsed: 0,
      upkeepAccrued: 0,
      credited: 0,
    };
  }
  const c = op.cycle;
  for (const key of ['carryInUnits', 'minedUnits', 'soldUnits', 'withdrawnUnits']) {
    c[key] = Math.max(0, Math.floor(Number(c[key]) || 0));
  }
  c.fuelUsed = Math.max(0, Number(c.fuelUsed) || 0);
  c.upkeepAccrued = Math.max(0, Number(c.upkeepAccrued) || 0);
  c.credited = Math.max(0, Math.round(Number(c.credited) || 0));
  return c;
}

/** Operating inputs consumed since the last sale: fuel units burned and upkeep credits accrued. */
export function recordCycleInput(group, { fuelUnits = 0, upkeepCr = 0 } = {}) {
  const op = ensureOperation(group);
  if (!op) return null;
  const cycle = ensureCycle(op);
  cycle.fuelUsed += Math.max(0, Number(fuelUnits) || 0);
  cycle.upkeepAccrued += Math.max(0, Number(upkeepCr) || 0);
  return cycle;
}

/** Shipment units that left without a depot sale (recall bank, destruction). */
export function recordOperationWithdrawal(group, units) {
  const op = ensureOperation(group);
  if (!op) return 0;
  const cycle = ensureCycle(op);
  const removed = Math.max(0, Math.floor(Number(units) || 0));
  cycle.withdrawnUnits += removed;
  return removed;
}

/**
 * A copy of the open cycle for terminal paths (the machine is being deleted, so no later sale
 * will ever close it). The caller names `heldUnits` — stock still aboard — so the entry's
 * inventory identity (`carryIn + mined === sold + withdrawn + held`) still reconciles.
 */
export function cycleSnapshot(group, heldUnits = 0) {
  const op = ensureOperation(group);
  if (!op) return null;
  const cycle = ensureCycle(op);
  const upkeep = Math.round(cycle.upkeepAccrued);
  return {
    carryInUnits: cycle.carryInUnits,
    minedUnits: cycle.minedUnits,
    soldUnits: cycle.soldUnits,
    withdrawnUnits: cycle.withdrawnUnits,
    fuelUsed: Math.round(cycle.fuelUsed * 10) / 10,
    upkeepAccrued: upkeep,
    credited: cycle.credited,
    heldUnits: Math.max(0, Math.floor(Number(heldUnits) || 0)),
    netCr: cycle.credited - upkeep,
  };
}

function closeCycle(op, sale, heldUnits) {
  const cycle = ensureCycle(op);
  const upkeep = Math.round(cycle.upkeepAccrued);
  op.lastCycle = {
    stationId: sale.stationId || null,
    quantity: cycle.soldUnits,
    credited: cycle.credited,
    carryInUnits: cycle.carryInUnits,
    minedUnits: cycle.minedUnits,
    withdrawnUnits: cycle.withdrawnUnits,
    fuelUsed: Math.round(cycle.fuelUsed * 10) / 10,
    upkeepAccrued: upkeep,
    heldUnits: Math.max(0, Math.floor(Number(heldUnits) || 0)),
    netCr: cycle.credited - upkeep,
  };
  op.cycle = {
    carryInUnits: op.lastCycle.heldUnits,
    minedUnits: 0,
    soldUnits: 0,
    withdrawnUnits: 0,
    fuelUsed: 0,
    upkeepAccrued: 0,
    credited: 0,
  };
  return op.lastCycle;
}

export function applyFuelShortage(group) {
  if (!group || typeof group !== 'object') return null;
  group.fuel = 0;
  if (group.status !== 'distressed') group.status = OPERATING_STATE.STRANDED;
  const prior = group.operation || {};
  return stampOperation(group, {
    fuel: 0,
    distressed: false,
    hasRock: true,
    hasDepot: true,
    shipmentUsed: Number(prior.storedUnits) || 0,
    shipmentCap: Number(prior.storedCap) || 0,
    grossUnits: Number(prior.grossUnits) || 0,
    lastSale: prior.lastSale || null,
    quoteOk: true,
    demandOpen: true,
    bayFull: false,
    upkeepPerMin: 0,
  });
}

export function resumeAfterFuel(group, fuelMax, upkeepPerMin) {
  if (!group || typeof group !== 'object') return null;
  const max = Math.max(0, Number(fuelMax) || 0);
  group.fuel = max;
  if (group.status === OPERATING_STATE.STRANDED) {
    group.status = group.program && group.program.templateId ? 'program' : 'mining';
  }
  return stampOperation(group, {
    fuel: max,
    distressed: group.status === 'distressed',
    hasRock: true,
    hasDepot: true,
    shipmentUsed: Number(group.operation && group.operation.storedUnits) || 0,
    shipmentCap: Number(group.operation && group.operation.storedCap) || 0,
    quoteOk: true,
    demandOpen: true,
    bayFull: false,
    upkeepPerMin,
  });
}

export function recordGrossUnits(group, units) {
  const op = ensureOperation(group);
  if (!op) return 0;
  const add = Math.max(0, Math.floor(Number(units) || 0));
  op.grossUnits = (Number(op.grossUnits) || 0) + add;
  ensureCycle(op).minedUnits += add;
  return add;
}

export function recordRealisedSale(group, sale) {
  const op = ensureOperation(group);
  if (!op || !sale) return null;
  const quantity = Math.max(0, Math.floor(Number(sale.quantity) || 0));
  const credited = Math.max(0, Math.round(Number(sale.credited) || 0));
  op.lastSale = {
    stationId: sale.stationId || null,
    quantity,
    unitPrice: Math.max(0, Number(sale.unitPrice) || 0),
    credited,
    operatingCostPerMin: Math.max(0, Number(sale.operatingCostPerMin) || 0),
  };
  // Close the accounting cycle this sale ends: inputs mined/burned since the last sale roll into
  // lastCycle, and whatever the depot refused or never received stays aboard as held stock —
  // unresolved inventory, not income.
  const cycle = ensureCycle(op);
  cycle.soldUnits += quantity;
  cycle.credited += credited;
  closeCycle(op, sale, sale.heldUnits);
  return op.lastSale;
}

export function evaluateProgrammedMiner(facts = {}) {
  const distressed = !!facts.distressed;
  const fuel = Math.max(0, Number(facts.fuel) || 0);
  const stored = Math.max(0, Number(facts.shipmentUsed) || 0);
  const cap = Math.max(0, Number(facts.shipmentCap) || 0);
  const hasRock = facts.hasRock !== false;
  const hasDepot = facts.hasDepot !== false;
  const quoteOk = facts.quoteOk !== false;
  const demandOpen = facts.demandOpen !== false;
  const bayFull = !!facts.bayFull;
  const selling = facts.programStep === 'sell';
  const mining = facts.programStep === 'mine' || facts.programStep == null;
  const storageFull = cap > 0 && stored >= cap - 1e-9;

  let limitStage = null;
  let operatingState = OPERATING_STATE.RUNNING;

  if (distressed) {
    limitStage = LIMIT_STAGE.NO_POWER;
    operatingState = OPERATING_STATE.STALLED;
  } else if (fuel <= 0) {
    limitStage = LIMIT_STAGE.MISSING_INPUT;
    operatingState = OPERATING_STATE.STRANDED;
  } else if (!hasRock && (stored <= 0 || (mining && !storageFull))) {
    limitStage = LIMIT_STAGE.NO_EXPOSED_FACE;
    operatingState = OPERATING_STATE.STALLED;
  } else if (storageFull && mining) {
    limitStage = LIMIT_STAGE.FULL_STORAGE;
    operatingState = OPERATING_STATE.WAITING;
  } else if (!hasDepot && (selling || facts.programStep === 'haul')) {
    limitStage = LIMIT_STAGE.BLOCKED_LANE;
    operatingState = OPERATING_STATE.STALLED;
  } else if (selling && !quoteOk) {
    limitStage = LIMIT_STAGE.POOR_DESTINATION;
    operatingState = OPERATING_STATE.STALLED;
  } else if (selling && !demandOpen) {
    limitStage = LIMIT_STAGE.DEMAND_SATURATION;
    operatingState = OPERATING_STATE.WAITING;
  } else if (bayFull && facts.considerLaunch) {
    limitStage = LIMIT_STAGE.LAUNCH_CAPACITY;
    operatingState = OPERATING_STATE.RUNNING;
  }

  const copy = limitStage ? LIMIT_COPY[limitStage] : null;
  const operatingCost = operatingCostPerMin(facts.upkeepPerMin, operatingState);
  const lastSale = facts.lastSale && typeof facts.lastSale === 'object' ? facts.lastSale : null;
  const grossValuePerMin = Math.max(0, Number(facts.grossValuePerMin) || 0);
  const netThroughputPerMin = operatingState === OPERATING_STATE.RUNNING
    ? grossValuePerMin - operatingCost : 0;

  let addingMachineHelps;
  let reason;
  if (copy) {
    addingMachineHelps = copy.helps;
    reason = copy.reason;
  } else {
    addingMachineHelps = !bayFull;
    reason = addingMachineHelps
      ? 'This machine is running. Another would add cut unless the depot fills.'
      : LIMIT_COPY[LIMIT_STAGE.LAUNCH_CAPACITY].reason;
  }

  return {
    grossUnits: Math.max(0, Number(facts.grossUnits) || 0),
    storedUnits: stored,
    storedCap: cap,
    limitStage,
    operatingState,
    reason,
    lastSale,
    operatingCostPerMin: operatingCost,
    netThroughputPerMin,
    addingMachineHelps,
    throughputPrimary: true,
    label: copy ? copy.label : 'Running',
  };
}

export function stampOperation(group, facts = {}) {
  const op = ensureOperation(group);
  if (!op) return null;
  const next = evaluateProgrammedMiner({
    ...facts,
    grossUnits: facts.grossUnits != null ? facts.grossUnits : op.grossUnits,
    lastSale: facts.lastSale != null ? facts.lastSale : op.lastSale,
    shipmentUsed: facts.shipmentUsed != null ? facts.shipmentUsed : op.storedUnits,
    shipmentCap: facts.shipmentCap != null ? facts.shipmentCap : op.storedCap,
  });
  op.grossUnits = next.grossUnits;
  op.storedUnits = next.storedUnits;
  op.storedCap = next.storedCap;
  op.limitStage = next.limitStage;
  op.operatingState = next.operatingState;
  op.reason = next.reason;
  op.lastSale = next.lastSale;
  op.operatingCostPerMin = next.operatingCostPerMin;
  op.netThroughputPerMin = next.netThroughputPerMin;
  op.addingMachineHelps = next.addingMachineHelps;
  op.throughputPrimary = true;
  op.label = next.label;
  if (group.status !== 'distressed' && next.operatingState === OPERATING_STATE.STRANDED) {
    group.status = OPERATING_STATE.STRANDED;
  }
  return op;
}

export function migrateDroneOperation(group) {
  if (!group || typeof group !== 'object') return null;
  ensureOperation(group);
  if ((Number(group.fuel) || 0) <= 0 && group.status !== 'distressed') {
    return applyFuelShortage(group);
  }
  return group.operation;
}

export function describeProgrammedMinerOperation(group, def = {}) {
  const op = group && group.operation ? group.operation : {};
  const stored = Math.max(0, Number(op.storedUnits) || 0);
  const cap = Math.max(0, Number(op.storedCap != null ? op.storedCap : def.bufferCap) || 0);
  const last = op.lastSale;
  const lastText = last && last.credited > 0
    ? `${last.credited} cr for ${last.quantity}u`
    : 'No sale yet';
  const cost = Math.max(0, Number(op.operatingCostPerMin) || 0);
  const net = Number(op.netThroughputPerMin) || 0;
  const state = op.operatingState || OPERATING_STATE.RUNNING;
  const tone = state === OPERATING_STATE.RUNNING
    ? 'ok'
    : state === OPERATING_STATE.STRANDED || state === OPERATING_STATE.STALLED
      ? 'bad'
      : 'warn';
  const statusLabel = op.label || 'Running';
  const reason = op.reason || 'Waiting for the first cut.';
  // SF-115 — the closed cycle in one line: inputs and the receipt, net of upkeep, with held stock
  // named as stock rather than income. Nothing here is an estimate; every term was a committed event.
  const lc = op.lastCycle && typeof op.lastCycle === 'object' ? op.lastCycle : null;
  const cycleText = lc
    ? `Last run: cut ${lc.minedUnits}u, sold ${lc.quantity}u for ${lc.credited} cr`
      + ` · upkeep -${lc.upkeepAccrued} cr · fuel ${lc.fuelUsed}u`
      + (lc.withdrawnUnits > 0 ? ` · lost ${lc.withdrawnUnits}u` : '')
      + (lc.heldUnits > 0 ? ` · ${lc.heldUnits}u still held` : '')
      + ` → net ${lc.netCr} cr`
    : null;
  const accessibleSummary = [
    statusLabel,
    `Gross cut ${Math.max(0, Number(op.grossUnits) || 0)} units`,
    `Stored ${stored} of ${cap} units`,
    `Last sale ${lastText}`,
    `Operating cost ${cost} credits per minute`,
    `Estimated net ${net} credits per minute`,
    ...(cycleText ? [cycleText] : []),
    reason,
  ].join('. ');
  return {
    state,
    tone,
    statusLabel,
    reason,
    grossUnits: Math.max(0, Number(op.grossUnits) || 0),
    stored,
    cap,
    lastText,
    operatingCostPerMin: cost,
    netThroughputPerMin: net,
    addingMachineHelps: op.addingMachineHelps !== false,
    cycle: op.cycle || null,
    lastCycle: lc,
    cycleText,
    accessibleSummary,
  };
}
