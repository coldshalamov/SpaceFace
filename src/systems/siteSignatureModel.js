// src/systems/siteSignatureModel.js — PURE deterministic OPERATING-SITE signature model.
//
// Design: design/ASTEROID_SITES_BRIEF.md; design/ASTEROID_OPS_VISION.md law 6 (signature).
// Answers exactly one question: "how loud does this site read to somebody looking for it?"
//
// WHICH "signature" THIS IS — three unrelated vocabularies already carry the word, and wiring the
// wrong one downstream is the live review hazard here:
//   • NOT src/systems/ambushSignatures.js. Those are deterministic passive TELLS placed before an
//     encounterDirector ambush fires, revealed through scan:pulse. Encounter telegraph.
//   • NOT src/systems/signatureAdapters.js. Those are AUDIO cue signatures (tether.strain,
//     mining.seam_chime, sensor.lock) over src/presentation/cueRecipesSignatures.js. Sound design.
//   • NOT a duplicate of asteroidFormationModel.js `sensorSignature`. THAT is the DORMANT rock's
//     natural loudness — mass and material only. It knows nothing of hollowing, machines, power or
//     transport. It is the BACKGROUND term this model sits on top of, and it is accepted here as
//     `snapshot.background`. A site must never read quieter than the untouched rock it occupies.
//
// CONTRACT
//   • PURE. Mutates nothing passed in, touches no state, creates no render objects, imports no
//     Three.js, no DOM. Returns a deeply frozen JSON-safe record.
//   • DETERMINISTIC. No Math.random, no Date.now, no wall clock, no iteration-order dependence.
//     Every input list is canonicalised (cleared cells, machine keys, ore keys and source keys are
//     sorted before use) so a shuffled snapshot yields a byte-identical record.
//   • UNWIRED. This kernel writes nothing. state.sites has a single writer (asteroidSites.js);
//     persisting a signature field and feeding the runtime is A09's job, not this packet's.
//   • FAIL-CLOSED, AND FAIL *LOUD*. Malformed input never throws and never leaks NaN/Infinity.
//     Where a fail-closed default must be chosen, it is the one that does NOT grant free stealth:
//     unreadable masking reads as no masking, and a machine with unreadable telemetry is assumed
//     to be running. Absence of information is not concealment.
//
// THE FIVE CONTRIBUTORS (packet A08), four anchored in shipped data and one honestly not:
//   1. EXPOSED GEOLOGY — cleared cell count, attenuated by depth (a bore at row 0 vents to space,
//      one at row 44 does not), plus the material of the contact ring.
//   2. POWER — MW generated and drawn (src/data/sites.js CONTACT_YIELD + SITE_MACHINES).
//   3. MACHINERY — what is installed, and whether it is actually turning.
//   4. TRANSPORT — export throughput and couriers in flight (SITE_BALANCE).
//   5. MASKING — attenuation. NO authored data source exists: there is no baffle machine in
//      SITE_MACHINES and no masking term in SITE_BALANCE. It stays a named parameter with no
//      supplier until A09 wires counterplay. Do NOT invent an sm_baffle here.
//
// THE ONE SANCTIONED MONOTONICITY BREAK — A05's irreversibility law. Hollowing permanently removes
// contact (drill.js:441 exempts site rocks from recoverClearedGeometry, so bores never heal). A cut
// you cannot take back is a tell you cannot take back, so exposed geology forms a FLOOR that
// masking attenuates toward but never through. An anchored Massline Core is a permanent physical
// claim; the rock stays loud.
//
// SEAM LEFT OPEN, DELIBERATELY NOT STUBBED: no A06 thermal kernel exists yet. Heat is a plausible
// sixth contributor and A11 names heat and signature as sibling bottleneck causes, but this model
// takes no heat input it cannot obtain. When A06 lands, add it as a source with its own weight.
//
// WEIGHTS ARE AUTHORED AND EXPECTED TO MOVE. The five sources have no shipped relative-loudness
// data. Everything here is a named, exported parameter precisely so A09 can rebalance without
// touching logic — and test/site-signature-model.test.mjs asserts invariants (ordering,
// monotonicity, the floor, determinism) rather than magnitudes, so rebalancing cannot falsify it.

import { CONTACT_YIELD, SITE_BALANCE, SITE_MACHINE_BY_ID } from '../data/sites.js';

export const SIGNATURE_MODEL_VERSION = 1;

// --- Authored constants ---------------------------------------------------------------------

/**
 * The drill cross-section this model reads depth against. Mirrors the COLS/ROWS in
 * src/systems/drill.js (which does not export them) so depth attenuation is anchored to the real
 * playfield rather than invented. Carried locally to keep the kernel dependency-free and fully
 * fixture-testable; the caller may override per-snapshot via `snapshot.grid`.
 */
export const SIGNATURE_GRID = Object.freeze({ cols: 28, rows: 45 });

/**
 * Relative contribution of each source. A PARTITION OF UNITY: these sum to 1, and every source
 * curve saturates strictly below 1, so the aggregate is always < 1 and the final clamp never
 * binds for valid input. That is what keeps the model strictly monotone everywhere instead of
 * flattening into a saturated tail where counterplay stops mattering.
 */
export const SIGNATURE_WEIGHTS = Object.freeze({
  geology: 0.34,
  power: 0.22,
  machinery: 0.28,
  transport: 0.16,
});

export const SIGNATURE_GEOLOGY = Object.freeze({
  /** Weight of raw hollowed volume against contact-ring material. */
  clearedWeight: 1,
  contactWeight: 0.6,
  /**
   * Loudness multiplier of a cleared cell at the deepest row, relative to one at the surface.
   * Row 0 opens straight to space; the bottom of the shaft is most of an asteroid away from it.
   */
  depthDeepFloor: 0.25,
  /** Exposure score at which the geology source reads exactly 0.5. */
  halfExposure: 60,
});

/**
 * Per-contact loudness by material. Ordering is the design statement — a breached gas pocket or a
 * live ore face reads louder than inert silicate, and dense basalt is the quietest thing a ring can
 * hold. Only the gas term has a real shipped anchor (CONTACT_YIELD.gasPowerPerContact MW); the rest
 * are authored, which is why the suite pins their ORDER and not their values.
 */
export const SIGNATURE_CONTACT = Object.freeze({
  gasPerMW: 0.15, // × CONTACT_YIELD.gasPowerPerContact (8 MW) = 1.2
  ore: 1,
  matrix: 0.45,
  basalt: 0.2,
});

export const SIGNATURE_POWER = Object.freeze({
  /** Generation radiates waste heat; draw is comparatively quiet but not silent. */
  genPerMW: 1,
  drawPerMW: 0.6,
  /** Weighted MW at which the power source reads exactly 0.5 (2× a Massline Core's 12 MW). */
  halfPowerMW: 24,
});

export const SIGNATURE_MACHINERY = Object.freeze({
  /** Every installed machine is a physical object, however dormant. */
  baseLoudness: 0.6,
  /** Scaled by |def.power| from SITE_MACHINES, so bigger hardware reads bigger. */
  perMW: 0.05,
  /** Share of a machine's loudness that is present even at a dead stop. */
  dormantShare: 0.2,
  /** Weighted machine activity at which the machinery source reads exactly 0.5. */
  halfActivity: 4,
  /** Fail-loud defaults: unreadable telemetry is not stealth. */
  defaultPowerRatio: 1,
  defaultStateMult: 1,
});

/** Run-state multipliers, keyed by the states asteroidSites.js projection() reports. */
export const SIGNATURE_STATE_LOUDNESS = Object.freeze({
  running: 1,
  building: 0.75,
  throttled: 0.65,
  backlogged: 0.5,
  starved: 0.35,
  idle: 0.15,
  'no-power': 0.05,
});

export const SIGNATURE_TRANSPORT = Object.freeze({
  /** Export rate is read as a share of SITE_BALANCE.laneThroughputPerMin (12 u/min). */
  exportWeight: 1,
  /** Each courier pod in flight is a moving object with a departure point. */
  inFlightWeight: 0.5,
  /** Weighted transport activity at which the transport source reads exactly 0.5. */
  halfTransport: 1.5,
});

export const SIGNATURE_MASKING = Object.freeze({
  /**
   * Share of the maskable band a perfect baffle removes. Deliberately < 1: nothing in this game is
   * invisible, and leaving headroom keeps every masking step strictly monotone.
   */
  maxAttenuation: 0.9,
  /**
   * Share of the geology contribution that masking can NEVER touch — the A05 irreversibility floor.
   * See the header. This is the packet's exception contract.
   */
  geologyFloorShare: 0.35,
});

/** Decimal places every emitted scalar is rounded to. */
export const SIGNATURE_PRECISION = 4;

// --- Numeric helpers ----------------------------------------------------------------------------

/** Normalise -0 to 0 so deepStrictEqual across transforms stays stable. */
function nz(n) {
  return n === 0 ? 0 : n;
}

/**
 * Round to SIGNATURE_PRECISION dp and normalise -0. Guarantees finite output.
 *
 * The finiteness check is re-applied AFTER the scale-round-unscale, not only before it. `n * 1e4`
 * overflows to Infinity for finite inputs above ~1.8e304, so an input-only guard would return
 * Infinity from a function documented to return finite values — the exact defect repaired in
 * commit 5c1d9c0c. Values that large are degenerate rather than meaningful, so they fail closed
 * to 0 like any other rejected value.
 */
function round(n) {
  if (!Number.isFinite(n)) return 0;
  const scale = 10 ** SIGNATURE_PRECISION;
  const v = nz(Math.round(n * scale) / scale);
  return Number.isFinite(v) ? v : 0;
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Coerce to a finite number, or `fallback`. Never NaN, never Infinity, never -0. */
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? nz(n) : fallback;
}

function nonNegative(v, fallback = 0) {
  const n = num(v, fallback);
  return n > 0 ? n : 0;
}

/**
 * Sum in a fixed sorted order rather than in caller order.
 *
 * HONEST STATUS — defence in depth, not an observed contract. Every term this model sums today is
 * non-negative, so there is no catastrophic cancellation, and the worst accumulation-order spread
 * measures ~1e-18 at the output: fourteen orders of magnitude below the 1e-4 the record is rounded
 * to. Mutation-testing confirms it — deleting this sort leaves the whole suite green, because the
 * OBSERVABLE order-independence comes from canonicalising the inputs (cleared cells, machine keys,
 * ore keys and source keys are each sorted before use, and each of those IS pinned by a test).
 * It is kept because it is free and because an A09 that introduces a SIGNED contribution (a masking
 * term expressed as a negative, say) would make cancellation real without anyone remembering to
 * revisit this function.
 */
function stableSum(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  finite.sort((a, b) => a - b);
  let acc = 0;
  for (const v of finite) acc += v;
  return Number.isFinite(acc) ? acc : 0;
}

/**
 * Saturating normaliser: v / (v + half). Strictly increasing on [0, ∞), maps to [0, 1), never
 * reaches 1. Strictness is what lets the suite assert real gradients instead of ≤.
 */
function saturate(v, half) {
  const x = nonNegative(v);
  const h = half > 0 && Number.isFinite(half) ? half : 1;
  if (!Number.isFinite(x)) return 0;
  const out = x / (x + h);
  return Number.isFinite(out) ? clamp01(out) : 1;
}

function asArray(v) {
  return Array.isArray(v) ? v : (v && typeof v === 'object' ? [v] : []);
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  return obj;
}

// --- Source: exposed geology ----------------------------------------------------------------

function readGrid(raw) {
  const cols = Math.trunc(num(raw && raw.cols, 0));
  const rows = Math.trunc(num(raw && raw.rows, 0));
  if (cols > 0 && rows > 0) return { cols, rows };
  return { cols: SIGNATURE_GRID.cols, rows: SIGNATURE_GRID.rows };
}

/**
 * Normalise a cleared-cell index list the way drill.js normalizeClearedTiles does: truncate,
 * bounds-check against the grid, dedupe, sort ascending. The bore is a SET, not a log.
 */
function readCleared(raw, grid) {
  const limit = grid.cols * grid.rows;
  const seen = new Set();
  for (const value of Array.isArray(raw) ? raw : []) {
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    const idx = Math.trunc(n);
    if (idx < 0 || idx >= limit) continue;
    seen.add(idx);
  }
  return Array.from(seen).sort((a, b) => a - b);
}

/**
 * Loudness of a cleared cell by depth. Row 0 is the surface and vents straight to space; the
 * deepest row retains only SIGNATURE_GEOLOGY.depthDeepFloor of that.
 */
function depthLoudness(row, rows) {
  const span = Math.max(1, rows - 1);
  const t = clamp01(row / span);
  const floor = clamp01(SIGNATURE_GEOLOGY.depthDeepFloor);
  return floor + (1 - floor) * (1 - t);
}

/**
 * Contact-ring material loudness. Takes the plain COUNTS produced by siteProduction.contactProfile
 * — deliberately NOT the profile function itself, so this kernel stays testable without booting a
 * live drill field and so an A09 rewiring of the runtime cache cannot break it.
 */
function contactLoudness(contacts) {
  const gasPer = SIGNATURE_CONTACT.gasPerMW * num(CONTACT_YIELD.gasPowerPerContact, 0);
  const terms = [];
  for (const raw of contacts) {
    if (!raw || typeof raw !== 'object') continue;
    terms.push(nonNegative(raw.matrix) * SIGNATURE_CONTACT.matrix);
    terms.push(nonNegative(raw.basalt) * SIGNATURE_CONTACT.basalt);
    terms.push(nonNegative(raw.gas) * gasPer);
    const ores = raw.ores && typeof raw.ores === 'object' ? raw.ores : null;
    if (ores) {
      // Sorted key walk so ore insertion order cannot move the result.
      for (const oreId of Object.keys(ores).sort()) {
        terms.push(nonNegative(ores[oreId]) * SIGNATURE_CONTACT.ore);
      }
    }
  }
  return stableSum(terms);
}

function geologySource(snapshot, grid) {
  const cleared = readCleared(snapshot.cleared, grid);
  const perCell = cleared.map((idx) => depthLoudness(Math.floor(idx / grid.cols), grid.rows));
  const exposure = stableSum(perCell);
  const contacts = contactLoudness(asArray(snapshot.contacts));
  const score = exposure * SIGNATURE_GEOLOGY.clearedWeight
    + contacts * SIGNATURE_GEOLOGY.contactWeight;
  return {
    value: saturate(score, SIGNATURE_GEOLOGY.halfExposure),
    exposedCells: cleared.length,
    exposureScore: exposure,
    contactLoudness: contacts,
  };
}

// --- Source: power --------------------------------------------------------------------------

/**
 * Emission tracks BOTH channels on purpose. Generation radiates waste heat; draw is the load that
 * heat is doing work against. Which dominates is a design choice with no shipped anchor, which is
 * why both multipliers are exported parameters rather than buried literals.
 */
function powerSource(snapshot) {
  const gens = [];
  const draws = [];
  for (const net of asArray(snapshot.power)) {
    if (!net || typeof net !== 'object') continue;
    gens.push(nonNegative(net.gen));
    draws.push(nonNegative(net.draw));
  }
  const gen = stableSum(gens);
  const draw = stableSum(draws);
  const score = stableSum([gen * SIGNATURE_POWER.genPerMW, draw * SIGNATURE_POWER.drawPerMW]);
  return {
    value: saturate(score, SIGNATURE_POWER.halfPowerMW),
    genMW: gen,
    drawMW: draw,
  };
}

// --- Source: machinery ----------------------------------------------------------------------

/**
 * Dedupe key for one machine. Ids are identity when present. Without one, fall back to CONTENT
 * (defId + cell) so shuffling the array stays invariant — never to the array index, which would
 * make the whole result order-dependent. Two anonymous machines sharing a defId and cell therefore
 * collapse into one; that is accepted, because two machines cannot occupy one cell anyway.
 */
function machineIdentity(m) {
  const id = typeof m.id === 'string' && m.id.length > 0 ? m.id : null;
  if (id) return `id:${id}`;
  const defId = typeof m.defId === 'string' ? m.defId : '?';
  return `anon:${defId}|${num(m.col, -1)}|${num(m.row, -1)}`;
}

function stateMultiplier(status) {
  const state = status && typeof status === 'object' ? status.state : status;
  if (typeof state !== 'string') return SIGNATURE_MACHINERY.defaultStateMult;
  const mult = SIGNATURE_STATE_LOUDNESS[state];
  return Number.isFinite(mult) ? mult : SIGNATURE_MACHINERY.defaultStateMult;
}

/**
 * Loudness term for one machine record. Fail LOUD on telemetry: powerRatio is a ratio only when
 * it is an actual finite number. null, '', arrays, singleton arrays — anything Number() would
 * silently coerce — is unreadable telemetry, and an unreadable machine is assumed to be turning
 * at defaultPowerRatio. Numeric 0 remains the one deliberate powered-off reading.
 */
function machineTerm(m) {
  const def = typeof m.defId === 'string' ? SITE_MACHINE_BY_ID.get(m.defId) : null;
  const defPower = def ? Math.abs(num(def.power, 0)) : 0;
  const base = SIGNATURE_MACHINERY.baseLoudness + SIGNATURE_MACHINERY.perMW * defPower;

  const ratio = typeof m.powerRatio === 'number' && Number.isFinite(m.powerRatio)
    ? clamp01(m.powerRatio)
    : clamp01(SIGNATURE_MACHINERY.defaultPowerRatio);
  const activity = clamp01(stateMultiplier(m.status)) * ratio;

  const dormant = clamp01(SIGNATURE_MACHINERY.dormantShare);
  return base * (dormant + (1 - dormant) * activity);
}

function machinerySource(snapshot) {
  const raw = asArray(snapshot.machines).filter((m) => m && typeof m === 'object');

  // Dedupe by identity, keeping the LOUDEST term for each key. Conflicting same-key duplicates
  // are a telemetry fault, and faults fail LOUD: the quieter record is the one that gets dropped.
  // max() is also order-independent, so which duplicate the caller listed first can never change
  // the aggregate. (A stable sort on key alone kept first-in-input for equal keys, which made the
  // result caller-order-dependent — the reviewed 491b0726 defect.)
  const byKey = new Map();
  for (const m of raw) {
    const key = machineIdentity(m);
    const term = machineTerm(m);
    const prev = byKey.get(key);
    if (prev === undefined || term > prev) byKey.set(key, term);
  }

  const keys = Array.from(byKey.keys()).sort();
  const terms = keys.map((key) => byKey.get(key));
  const score = stableSum(terms);
  return {
    value: saturate(score, SIGNATURE_MACHINERY.halfActivity),
    machineCount: byKey.size,
    activityScore: score,
  };
}

// --- Source: transport ----------------------------------------------------------------------

function transportSource(snapshot) {
  const t = snapshot.transport && typeof snapshot.transport === 'object' ? snapshot.transport : {};
  const exportRate = nonNegative(t.exportRatePerMin);
  const inFlight = nonNegative(t.inFlightCount);
  const laneCap = num(SITE_BALANCE.laneThroughputPerMin, 12) || 12;
  const score = stableSum([
    (exportRate / laneCap) * SIGNATURE_TRANSPORT.exportWeight,
    inFlight * SIGNATURE_TRANSPORT.inFlightWeight,
  ]);
  return {
    value: saturate(score, SIGNATURE_TRANSPORT.halfTransport),
    exportRatePerMin: exportRate,
    inFlightCount: inFlight,
  };
}

// --- Aggregation ------------------------------------------------------------------------------

/**
 * Map a serializable site snapshot to a signature record. PURE — the snapshot is never touched.
 *
 * Accepts a minimal plain-data shape rather than an asteroidSites.projection() result, so the
 * kernel is testable without a live drill field and survives an A09 rewiring of the runtime cache.
 *
 * @param {object|null} snapshot
 *   @prop {{cols:number,rows:number}} [grid]      drill cross-section; defaults to SIGNATURE_GRID
 *   @prop {number[]}  [cleared]                   cleared cell indices (drill.js tileIndex space)
 *   @prop {object[]}  [contacts]                  contactProfile-shaped COUNTS {matrix,basalt,gas,ores}
 *   @prop {object[]}  [power]                     per-network {gen,draw} in MW
 *   @prop {object[]}  [machines]                  {id,defId,powerRatio,status:{state}}
 *   @prop {object}    [transport]                 {exportRatePerMin,inFlightCount}
 *   @prop {number}    [masking]                   attenuation in [0,1]; no data source until A09
 *   @prop {number}    [background]                A01 formation sensorSignature of the dormant rock
 * @returns {object} deeply frozen, JSON-safe signature record
 */
export function buildSiteSignature(snapshot) {
  const snap = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
  const grid = readGrid(snap.grid);

  const geology = geologySource(snap, grid);
  const power = powerSource(snap);
  const machinery = machinerySource(snap);
  const transport = transportSource(snap);

  const sources = { geology, power, machinery, transport };

  // Weighted aggregate. Summed in sorted key order so the partition is order-independent, and
  // strictly < 1 because the weights partition unity and every source curve saturates below 1.
  const raw = stableSum(
    Object.keys(sources).sort().map((k) => sources[k].value * num(SIGNATURE_WEIGHTS[k], 0)),
  );

  // A05 irreversibility floor: the share of exposed geology masking can never reach.
  const floor = clamp01(
    geology.value * num(SIGNATURE_WEIGHTS.geology, 0) * clamp01(SIGNATURE_MASKING.geologyFloorShare),
  );

  // Fail LOUD: unreadable masking reads as no masking. Out-of-band values clamp, never invert.
  const maskingRaw = Number(snap.masking);
  const masking = Number.isFinite(maskingRaw) ? clamp01(maskingRaw) : 0;
  const attenuation = clamp01(masking * clamp01(SIGNATURE_MASKING.maxAttenuation));

  const band = Math.max(0, raw - floor);
  const emitted = clamp01(floor + band * (1 - attenuation));

  // Background ordering: the operating site is layered ON the dormant rock's own loudness, so the
  // total can never read below it, collapses to exactly it when nothing is operating, and stays
  // monotone in `emitted`.
  const background = clamp01(num(snap.background, 0));
  const totalValue = clamp01(background + (1 - background) * emitted);

  return deepFreeze({
    version: SIGNATURE_MODEL_VERSION,
    total: round(totalValue),
    background: round(background),
    emitted: round(emitted),
    floor: round(floor),
    masking: round(masking),
    attenuation: round(attenuation),
    sources: {
      geology: round(geology.value),
      power: round(power.value),
      machinery: round(machinery.value),
      transport: round(transport.value),
    },
    detail: {
      exposedCells: geology.exposedCells,
      exposureScore: round(geology.exposureScore),
      contactLoudness: round(geology.contactLoudness),
      powerGenMW: round(power.genMW),
      powerDrawMW: round(power.drawMW),
      machineCount: machinery.machineCount,
      machineActivity: round(machinery.activityScore),
      exportRatePerMin: round(transport.exportRatePerMin),
      inFlightCount: round(transport.inFlightCount),
    },
  });
}
