// Durable, per-owned-ship history for the Living Hull. Simulation systems write this small record;
// render/UI adapters only read it. All changes are rare event reductions, never per-frame mutation.

export const LIVING_HULL_SCHEMA = 'spaceface.livingHull.v1';
export const LIVING_HULL_CYCLE_SECONDS = 600;
export const LIVING_HULL_KILL_TALLY_MAX = 13;
export const LIVING_HULL_REPAIR_PATCH_MAX = 4;
export const LIVING_HULL_HEAT_SCORCH_MAX = 3;
export const LIVING_HULL_GRIME_MAX = 0.72;
export const LIVING_HULL_GRIME_PER_CYCLE = 0.09;

const GRAFFITI_LINE_MAX = 96;
const GRAFFITI_AUTHOR_MAX = 40;

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function boundedInteger(value, max) {
  return Math.max(0, Math.min(max, Math.floor(finiteNonNegative(value, 0))));
}

function clippedText(value, max) {
  if (value == null) return null;
  const valueText = String(value).trim().replace(/\s+/g, ' ');
  return valueText ? valueText.slice(0, max) : null;
}

/** Old saves begin clean at the moment they first acquire this optional record. */
export function defaultLivingHull(simTime = 0) {
  const now = finiteNonNegative(simTime, 0);
  return Object.freeze({
    schema: LIVING_HULL_SCHEMA,
    killTally: 0,
    repairPatches: 0,
    heatScorch: 0,
    lastWashAtT: now,
    washCount: 0,
    graffitiLine: null,
    graffitiAuthor: null,
    updatedAtT: now,
  });
}

export function normalizeLivingHull(input, simTime = 0) {
  const now = finiteNonNegative(simTime, 0);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return defaultLivingHull(now);
  return Object.freeze({
    schema: LIVING_HULL_SCHEMA,
    killTally: boundedInteger(input.killTally, LIVING_HULL_KILL_TALLY_MAX),
    repairPatches: boundedInteger(input.repairPatches, LIVING_HULL_REPAIR_PATCH_MAX),
    heatScorch: boundedInteger(input.heatScorch, LIVING_HULL_HEAT_SCORCH_MAX),
    lastWashAtT: finiteNonNegative(input.lastWashAtT, now),
    washCount: boundedInteger(input.washCount, Number.MAX_SAFE_INTEGER),
    graffitiLine: clippedText(input.graffitiLine, GRAFFITI_LINE_MAX),
    graffitiAuthor: clippedText(input.graffitiAuthor, GRAFFITI_AUTHOR_MAX),
    updatedAtT: finiteNonNegative(input.updatedAtT, now),
  });
}

export function livingHullCyclesSinceWash(input, simTime = 0) {
  const hull = normalizeLivingHull(input, simTime);
  const elapsed = Math.max(0, finiteNonNegative(simTime, 0) - hull.lastWashAtT);
  return Math.floor(elapsed / LIVING_HULL_CYCLE_SECONDS);
}

export function livingHullGrimeAt(input, simTime = 0) {
  return Math.min(
    LIVING_HULL_GRIME_MAX,
    livingHullCyclesSinceWash(input, simTime) * LIVING_HULL_GRIME_PER_CYCLE,
  );
}

export function livingHullWithKill(input, simTime = 0) {
  const hull = normalizeLivingHull(input, simTime);
  if (hull.killTally >= LIVING_HULL_KILL_TALLY_MAX) return hull;
  return Object.freeze({
    ...hull,
    killTally: hull.killTally + 1,
    updatedAtT: finiteNonNegative(simTime, hull.updatedAtT),
  });
}

export function livingHullWithRepair(input, repair = {}, simTime = 0) {
  const hull = normalizeLivingHull(input, simTime);
  const restored = finiteNonNegative(repair.restoredHull) + finiteNonNegative(repair.restoredArmor);
  const totalMax = finiteNonNegative(repair.hullMax) + finiteNonNegative(repair.armorMax);
  const beforeProtection = Number(repair.beforeProtection);
  const heavy = restored >= Math.max(8, totalMax * 0.12)
    || (Number.isFinite(beforeProtection) && beforeProtection <= 0.65 && restored > 0);
  if (!heavy || hull.repairPatches >= LIVING_HULL_REPAIR_PATCH_MAX) return hull;
  return Object.freeze({
    ...hull,
    repairPatches: hull.repairPatches + 1,
    updatedAtT: finiteNonNegative(simTime, hull.updatedAtT),
  });
}

export function livingHullWithVent(input, simTime = 0) {
  const hull = normalizeLivingHull(input, simTime);
  if (hull.heatScorch >= LIVING_HULL_HEAT_SCORCH_MAX) return hull;
  return Object.freeze({
    ...hull,
    heatScorch: hull.heatScorch + 1,
    updatedAtT: finiteNonNegative(simTime, hull.updatedAtT),
  });
}

export function livingHullWithGraffiti(input, payload = {}, simTime = 0) {
  const hull = normalizeLivingHull(input, simTime);
  const line = clippedText(payload.line, GRAFFITI_LINE_MAX);
  const author = clippedText(payload.author, GRAFFITI_AUTHOR_MAX);
  if (!line || (line === hull.graffitiLine && author === hull.graffitiAuthor)) return hull;
  return Object.freeze({
    ...hull,
    graffitiLine: line,
    graffitiAuthor: author,
    updatedAtT: finiteNonNegative(simTime, hull.updatedAtT),
  });
}

export function livingHullAfterWash(input, simTime = 0) {
  const hull = normalizeLivingHull(input, simTime);
  const now = finiteNonNegative(simTime, hull.updatedAtT);
  return Object.freeze({
    ...hull,
    lastWashAtT: now,
    washCount: Math.min(Number.MAX_SAFE_INTEGER, hull.washCount + 1),
    updatedAtT: now,
  });
}

export function sameLivingHull(a, b) {
  const left = normalizeLivingHull(a, 0);
  const right = normalizeLivingHull(b, 0);
  return left.killTally === right.killTally
    && left.repairPatches === right.repairPatches
    && left.heatScorch === right.heatScorch
    && left.lastWashAtT === right.lastWashAtT
    && left.washCount === right.washCount
    && left.graffitiLine === right.graffitiLine
    && left.graffitiAuthor === right.graffitiAuthor
    && left.updatedAtT === right.updatedAtT;
}
