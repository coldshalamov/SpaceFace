// Durable, per-owned-ship history for the Living Hull. Simulation systems write this small record;
// render/UI adapters only read it. All changes are rare event reductions, never per-frame mutation.

export const LIVING_HULL_SCHEMA = 'spaceface.livingHull.v1';
export const LIVING_HULL_CYCLE_SECONDS = 600;
export const LIVING_HULL_KILL_TALLY_MAX = 13;
export const LIVING_HULL_REPAIR_PATCH_MAX = 4;
export const LIVING_HULL_HEAT_SCORCH_MAX = 3;
export const LIVING_HULL_GRIME_MAX = 0.72;
export const LIVING_HULL_GRIME_PER_CYCLE = 0.09;

// PQ-142.01 ship history. `design/VISION.md` Part II: "The ship accumulates history — scars,
// repairs, odd fittings, a reputation by hull — until it is my fucking ship."
//
// The history lists are OPTIONAL members of the same record. A hull that has never been hit
// serializes byte-for-byte as it did before this packet: `scars`, `renown` and `historyVersion`
// appear only once there is something to remember. That is not a cosmetic choice — the living-hull
// record is inside `state.player`, which `src/core/simSnapshot.js` hashes, so a confident empty
// array on every hull would move every replay golden for a hull with no history at all. The
// container id (`LIVING_HULL_SCHEMA`) is unchanged for the same reason; `historyVersion` is the
// version of the history members and travels with them.
export const LIVING_HULL_HISTORY_VERSION = 2;
export const LIVING_HULL_SCAR_MAX = 24;
export const LIVING_HULL_RENOWN_MAX = 8;

/** How the hull got marked. `weapon` = a shot that reached armour/hull; `slam` = a real contact. */
export const LIVING_HULL_SCAR_CAUSES = Object.freeze(['weapon', 'slam']);
/** What it hit (collision surfaces mirror `collisionSurface()` in src/combat/impulseKernel.js). */
export const LIVING_HULL_SCAR_SURFACES = Object.freeze([
  'weapon', 'craft', 'terrain', 'structure', 'debris', 'other',
]);
/** Severity band, oldest-to-worst. Derived from closing speed / share of protection removed. */
export const LIVING_HULL_SCAR_BANDS = Object.freeze(['graze', 'hard', 'heavy', 'crushing']);
/** Where on the hull, in the HULL frame (index 0 is dead ahead, then clockwise to starboard). */
export const LIVING_HULL_SCAR_FACINGS = Object.freeze([
  'bow', 'starboard bow', 'starboard beam', 'starboard quarter',
  'stern', 'port quarter', 'port beam', 'port bow',
]);
/** Witnessed acts that attach a reputation to THIS hull rather than to the pilot. */
export const LIVING_HULL_RENOWN_ACTS = Object.freeze(['kill', 'ram', 'rescue']);

const SCAR_CAUSE_SET = new Set(LIVING_HULL_SCAR_CAUSES);
const SCAR_SURFACE_SET = new Set(LIVING_HULL_SCAR_SURFACES);
const SCAR_BAND_SET = new Set(LIVING_HULL_SCAR_BANDS);
const SCAR_FACING_SET = new Set(LIVING_HULL_SCAR_FACINGS);
const RENOWN_ACT_SET = new Set(LIVING_HULL_RENOWN_ACTS);

const GRAFFITI_LINE_MAX = 96;
const GRAFFITI_AUTHOR_MAX = 40;
const RENOWN_ID_MAX = 64;
const EMPTY_LIST = Object.freeze([]);

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

function nonNegativeTick(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

/**
 * One durable scar. Every field is a primitive from a closed vocabulary or a number, so the record
 * survives `clonePlain` in the save path and `sanitize` in the replay snapshot unchanged.
 * `patchedAtT === null` means the scar is still open; a yard repair fills it in and the mark stays.
 */
export function normalizeHullScar(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const cause = SCAR_CAUSE_SET.has(input.cause) ? input.cause : null;
  if (!cause) return null;
  const surface = SCAR_SURFACE_SET.has(input.surface)
    ? input.surface
    : cause === 'weapon' ? 'weapon' : 'other';
  const band = SCAR_BAND_SET.has(input.band) ? input.band : 'graze';
  const facing = SCAR_FACING_SET.has(input.facing) ? input.facing : LIVING_HULL_SCAR_FACINGS[0];
  const tick = nonNegativeTick(input.tick);
  const atT = finiteNonNegative(input.atT, 0);
  const patchedAtT = input.patchedAtT == null ? null : finiteNonNegative(input.patchedAtT, atT);
  return Object.freeze({
    id: clippedText(input.id, RENOWN_ID_MAX) || `${cause}:${tick}:${facing}`,
    cause,
    surface,
    band,
    facing,
    atT,
    tick,
    patchedAtT,
  });
}

/** One witnessed act, attached to the hull that did it. Reputation BY HULL, not by pilot. */
export function normalizeHullRenown(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const act = RENOWN_ACT_SET.has(input.act) ? input.act : null;
  if (!act) return null;
  const tick = nonNegativeTick(input.tick);
  const atT = finiteNonNegative(input.atT, 0);
  return Object.freeze({
    id: clippedText(input.id, RENOWN_ID_MAX) || `${act}:${tick}`,
    act,
    factionId: clippedText(input.factionId, RENOWN_ID_MAX),
    sectorId: clippedText(input.sectorId, RENOWN_ID_MAX),
    atT,
    tick,
  });
}

function normalizeScarList(input) {
  if (!Array.isArray(input) || !input.length) return null;
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const scar = normalizeHullScar(raw);
    if (!scar || seen.has(scar.id)) continue;
    seen.add(scar.id);
    out.push(scar);
    if (out.length >= LIVING_HULL_SCAR_MAX) break;
  }
  return out.length ? Object.freeze(out) : null;
}

function normalizeRenownList(input) {
  if (!Array.isArray(input) || !input.length) return null;
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const act = normalizeHullRenown(raw);
    if (!act || seen.has(act.id)) continue;
    seen.add(act.id);
    out.push(act);
    if (out.length >= LIVING_HULL_RENOWN_MAX) break;
  }
  return out.length ? Object.freeze(out) : null;
}

/**
 * Room for one more scar. The hull keeps its worst and its newest: when the record is full the
 * oldest ALREADY-PATCHED mark is dropped first (the yard covered it once, it can be covered again),
 * and only when every mark is still open does the oldest open one go. Bounded by construction, so
 * no run length can grow this record without limit.
 */
function scarListWithRoom(list) {
  if (list.length < LIVING_HULL_SCAR_MAX) return list.slice();
  const next = list.slice();
  let dropIndex = next.findIndex((scar) => scar.patchedAtT != null);
  if (dropIndex < 0) dropIndex = 0;
  next.splice(dropIndex, 1);
  return next;
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
  const record = {
    schema: LIVING_HULL_SCHEMA,
    killTally: boundedInteger(input.killTally, LIVING_HULL_KILL_TALLY_MAX),
    repairPatches: boundedInteger(input.repairPatches, LIVING_HULL_REPAIR_PATCH_MAX),
    heatScorch: boundedInteger(input.heatScorch, LIVING_HULL_HEAT_SCORCH_MAX),
    lastWashAtT: finiteNonNegative(input.lastWashAtT, now),
    washCount: boundedInteger(input.washCount, Number.MAX_SAFE_INTEGER),
    graffitiLine: clippedText(input.graffitiLine, GRAFFITI_LINE_MAX),
    graffitiAuthor: clippedText(input.graffitiAuthor, GRAFFITI_AUTHOR_MAX),
    updatedAtT: finiteNonNegative(input.updatedAtT, now),
  };
  const scars = normalizeScarList(input.scars);
  const renown = normalizeRenownList(input.renown);
  if (scars) record.scars = scars;
  if (renown) record.renown = renown;
  if (scars || renown) record.historyVersion = LIVING_HULL_HISTORY_VERSION;
  return Object.freeze(record);
}

/** Every scar this hull carries, oldest first. Frozen; readers never own the array. */
export function livingHullScars(input) {
  const hull = normalizeLivingHull(input, 0);
  return hull.scars || EMPTY_LIST;
}

/** Marks the yard has not covered yet. */
export function livingHullOpenScars(input) {
  return livingHullScars(input).filter((scar) => scar.patchedAtT == null);
}

/** Marks a yard repair covered. Still on the record: "repaired here" is history too. */
export function livingHullPatchedScars(input) {
  return livingHullScars(input).filter((scar) => scar.patchedAtT != null);
}

/** Witnessed acts this hull is known for. */
export function livingHullRenown(input) {
  const hull = normalizeLivingHull(input, 0);
  return hull.renown || EMPTY_LIST;
}

/**
 * How likely a stranger is to know this hull on sight: the count of witnessed acts attached to it.
 * Reputation BY HULL. This is a NEW field owned by this record — it never reads or writes faction
 * standing, which `src/systems/factions.js` remains the sole writer of.
 */
export function livingHullNotoriety(input) {
  return livingHullRenown(input).length;
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

/**
 * Record one scar from a real impact. Idempotent by scar id, so the same physics receipt arriving
 * twice in one tick leaves one mark. Returns the SAME record when nothing changed, which is what
 * lets the writer skip the change event entirely (no per-tick allocation on the quiet path).
 */
export function livingHullWithScar(input, scar, simTime = 0) {
  const hull = normalizeLivingHull(input, simTime);
  const next = normalizeHullScar(scar);
  if (!next) return hull;
  const current = hull.scars || EMPTY_LIST;
  for (const existing of current) if (existing.id === next.id) return hull;
  const list = scarListWithRoom(current);
  list.push(next);
  return Object.freeze({
    ...hull,
    scars: Object.freeze(list),
    historyVersion: LIVING_HULL_HISTORY_VERSION,
    updatedAtT: finiteNonNegative(simTime, hull.updatedAtT),
  });
}

/**
 * A yard repair covers every open scar. The marks are NOT deleted — a patched scar is the record
 * of "repaired here", which is the second consequence the scar has to produce.
 */
export function livingHullWithPatchedScars(input, simTime = 0) {
  const hull = normalizeLivingHull(input, simTime);
  const current = hull.scars || EMPTY_LIST;
  if (!current.some((scar) => scar.patchedAtT == null)) return hull;
  const now = finiteNonNegative(simTime, hull.updatedAtT);
  const list = current.map((scar) => (scar.patchedAtT == null
    ? Object.freeze({ ...scar, patchedAtT: now })
    : scar));
  return Object.freeze({
    ...hull,
    scars: Object.freeze(list),
    historyVersion: LIVING_HULL_HISTORY_VERSION,
    updatedAtT: now,
  });
}

/** Attach a witnessed act to this hull. Bounded ring: the oldest act falls off the record. */
export function livingHullWithRenown(input, act, simTime = 0) {
  const hull = normalizeLivingHull(input, simTime);
  const next = normalizeHullRenown(act);
  if (!next) return hull;
  const current = hull.renown || EMPTY_LIST;
  for (const existing of current) if (existing.id === next.id) return hull;
  const list = current.length >= LIVING_HULL_RENOWN_MAX ? current.slice(1) : current.slice();
  list.push(next);
  return Object.freeze({
    ...hull,
    renown: Object.freeze(list),
    historyVersion: LIVING_HULL_HISTORY_VERSION,
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

function sameScarList(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    const a = left[index];
    const b = right[index];
    if (a.id !== b.id || a.cause !== b.cause || a.surface !== b.surface || a.band !== b.band
      || a.facing !== b.facing || a.atT !== b.atT || a.tick !== b.tick
      || a.patchedAtT !== b.patchedAtT) return false;
  }
  return true;
}

function sameRenownList(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    const a = left[index];
    const b = right[index];
    if (a.id !== b.id || a.act !== b.act || a.factionId !== b.factionId
      || a.sectorId !== b.sectorId || a.atT !== b.atT || a.tick !== b.tick) return false;
  }
  return true;
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
    && left.updatedAtT === right.updatedAtT
    && sameScarList(left.scars || EMPTY_LIST, right.scars || EMPTY_LIST)
    && sameRenownList(left.renown || EMPTY_LIST, right.renown || EMPTY_LIST);
}
