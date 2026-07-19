// src/systems/siteThermalModel.js — PURE deterministic SITE THERMAL model (packet A06).
//
// Design: design/ASTEROID_OPS_VISION.md law 4 "Thermal mass" (:51-56), Wave 2 (:127-128).
// Answers exactly one question: "can this machine shed the heat it makes into the rock it touches?"
//
// THE DESIGN STATEMENT THIS SERVES, quoted from the vision: machines shed heat only into solid
// contact rock (rock is the heatsink) or into dedicated cooling. The consequence is the point —
// "the fully-hollow factory asteroid stops being a free win", while "a conservative mine runs cool
// by nature". A machine hall drilled out to open floor has nothing left to conduct into; a modest
// extractor sitting in a full contact ring is comfortable without spending anything on cooling.
//
// WHICH "heat" THIS IS — the word is already taken twice in this codebase, and wiring the wrong one
// downstream is the live review hazard here:
//   • NOT src/systems/heat.js. That is the PLAYER's wanted-level scalar — law pursuit and bounty
//     response. It has nothing to do with temperature. This kernel neither imports nor touches it.
//   • NOT asteroidFormationModel.js `thermalRisk`. That is a cosmetic seed-rolled FIELD-level label
//     on a 0.08 base, and that file's own header (:4-7) explicitly disclaims modelling the interior.
//     Consuming it here would launder a decorative roll into a balance input. Deliberately unused.
//
// CONTRACT
//   • PURE. Mutates nothing passed in, touches no state, creates no render objects, imports no
//     Three.js, no DOM. Returns a deeply frozen JSON-safe record.
//   • DETERMINISTIC. No Math.random, no Date.now, no wall clock, no iteration-order dependence.
//     Machines are canonicalised (sorted by content key) and every sum runs in sorted order, so a
//     shuffled machine list or a shuffled contact ring yields a byte-identical record.
//   • SINGLE-PASS / STEADY-STATE. There is no iterative thermal relaxation and there never may be:
//     relaxation would make the answer depend on visit order, which the order-independence proof
//     forbids outright. Every machine is solved independently from its own ring.
//   • UNWIRED. This kernel writes nothing and nothing in src/ imports it. Classifying a band is this
//     packet's whole job.
//   • FAIL-CLOSED, AND FAIL *HOT*. Malformed input never throws and never leaks NaN/Infinity; it
//     lands in `rejected[]` with a reason. Where a fail-closed default must be chosen it is the one
//     that does NOT grant free cooling: an energy product that overflows saturates to the ceiling
//     rather than collapsing to zero, because a machine that reads as cold is a machine that gets a
//     free pass. Absence of information is not refrigeration.
//
// ===================================================================================================
// THE A06 / A07 BOUNDARY — READ BEFORE EXTENDING
// Bands are CLASSIFIED here and APPLIED in A07 (site production/state; effects/UI mutex,
// 03_SIGNATURE_SYSTEMS.md:112). This file must NEVER derate output, set a fault, mutate a machine,
// or touch a store. It reads a snapshot and returns a label plus the arithmetic behind it. If you
// find yourself reaching for `machine.status` or a production rate here, you are writing A07.
// ===================================================================================================
//
// UNITS. Rates are per MINUTE, matching CONTACT_YIELD (units/min) and SITE_BALANCE
// (laneThroughputPerMin). Steps are taken in SECONDS, matching asteroidSites._tickSite(site, dtS).
// One HEAT UNIT is DEFINED as the heat a machine sheds per MW-minute of power it draws — that is,
// SITE_THERMAL.heatPerMWDraw is 1 by definition of the unit, not by invention. Everything else in
// the thermal vocabulary is expressed as a ratio against that anchor.
//
// AUTHORED CONSTANTS ARE EXPECTED TO MOVE. There is no shipped thermal balance data — SITE_BALANCE
// (src/data/sites.js:134-158) has no heat term, and no cooling machine exists in SITE_MACHINES yet
// (Radiator Mast / Coolant Loop / Battery Bank are the unbuilt Wave 2 roster at VISION:90). So every
// magnitude below is a NAMED, EXPORTED, FROZEN parameter rather than a literal buried in a formula,
// and test/site-thermal-model.test.mjs asserts INVARIANTS — ordering, monotonicity, ratios, the
// hollow-hall floor — instead of magnitudes. Pinning an invented constant to itself proves nothing;
// rebalancing this table must not be able to falsify the suite.

import { SITE_MACHINE_BY_ID } from '../data/sites.js';
import { machineCapability } from './siteProduction.js';

export const THERMAL_MODEL_VERSION = 1;

// --- Authored constants -------------------------------------------------------------------------

export const SITE_THERMAL = Object.freeze({
  /**
   * Heat per MW of power actually DRAWN. This is 1.0 because it DEFINES the heat unit (see the
   * header) — an electrically driven machine ultimately turns essentially all the power it consumes
   * into heat. Changing this rescales the entire vocabulary rather than rebalancing anything.
   */
  heatPerMWDraw: 1,

  /**
   * Heat per MW GENERATED. Strictly below heatPerMWDraw: a gas turbine's waste heat is a fraction of
   * its electrical output, and part of it leaves with the exhaust rather than entering the rock.
   * The ORDER (gen cooler per MW than draw) is the design statement; the value is authored.
   */
  heatPerMWGen: 0.6,

  // --- Conduction, per SOLID contact cell, in heat units per minute. -----------------------------
  // ORDERING IS THE DESIGN STATEMENT: metal conducts better than dense rock, dense rock better than
  // porous rock, and gas conducts nothing at all. Values authored; order pinned by the suite.
  /** Metallic ore veins — the best heatsink a ring can hold. */
  orePerContact: 1.5,
  /** Dense basalt (drill tile 'rock'). */
  basaltPerContact: 1.2,
  /** Silicate matrix (drill tile 'dirt') — more porous, conducts worse. */
  matrixPerContact: 0.7,
  /**
   * Sealed gas pockets. EXACTLY ZERO, and this is load-bearing, not a placeholder.
   * contactProfile (siteProduction.js:34-38) increments `solid` BEFORE classifying, so
   * `solid` = matrix + basalt + gas + ores. Reading `profile.solid` would silently hand every
   * breached gas pocket a heatsink it physically cannot be: a pressurised void is an insulator.
   * rockSinkFor therefore sums the materials individually and never reads `solid`.
   */
  gasPerContact: 0,

  /**
   * Thermal mass (heat units held per 1 °band of headroom) per MW of installed |def.power|, plus a
   * floor every physical object has. Used ONLY to report `saturation` for A07's benefit — the
   * operating band itself is deliberately independent of stored heat (see classifyBand).
   */
  capacityPerMW: 8,
  capacityBase: 6,

  /**
   * Hard finite ceilings. Not balance — numeric safety.
   *
   * A rate × dt product overflows to Infinity long before its inputs do: dt = 1e308 against any
   * positive rate is Infinity after ONE multiply, and an Infinity in `vented` is exactly the class
   * of defect repaired in commit 5c1d9c0c, where r4() returned Infinity for finite inputs above
   * ~1.8e304 because the guard ran on the input instead of the product. Every energy product here is
   * therefore checked AFTER the multiply and saturated to this ceiling, with the clipped excess
   * routed into the reported `vented` term so the conservation identity still closes exactly.
   *
   * Chosen ~18 orders of magnitude below Number.MAX_VALUE (1.797e308) so that site-wide sums over a
   * large machine list cannot re-overflow what the per-machine clamp just made safe.
   */
  maxEnergy: 1e290,
  maxStored: 1e290,
});

/**
 * Operating bands, ascending by `minLoad`. `load` is the steady-state ratio
 * heat / (heat + sink) ∈ [0, 1]: 0 when a machine makes no heat, 0.5 when its ring exactly matches
 * its output, and 1 when it has no heatsink at all.
 *
 * WHY A RATIO AND NOT STORED HEAT. The band must not depend on how the caller chunked time — one
 * 600 s catch-up step and 600 one-second steps have to classify identically, and an accumulator
 * threaded through a floating-point path cannot promise that near a boundary. A ratio of two rates
 * is dt-free by construction, which is the same property that makes the model single-pass and
 * order-independent. Stored heat is still tracked (for conservation and for A07's `saturation`), it
 * simply does not decide the label.
 *
 * `label` is presentation-facing text; `id` is the save-stable key. A07 owns what these DO.
 */
export const THERMAL_BANDS = Object.freeze([
  Object.freeze({ id: 'nominal', label: 'Nominal', minLoad: 0 }),
  Object.freeze({ id: 'warm', label: 'Warm', minLoad: 0.45 }),
  Object.freeze({ id: 'throttle', label: 'Throttling', minLoad: 0.65 }),
  Object.freeze({ id: 'fault', label: 'Thermal Fault', minLoad: 0.85 }),
]);

/** Decimal places every emitted RATIO is rounded to. Energies are deliberately NOT rounded. */
export const THERMAL_PRECISION = 6;

// --- Numeric helpers ----------------------------------------------------------------------------

/** Normalise -0 to 0 so deepStrictEqual across permutations stays stable. */
function nz(n) {
  return n === 0 ? 0 : n;
}

/**
 * Number() that cannot throw. `Number(Symbol())` raises TypeError, which would break the kernel's
 * "malformed input never throws" contract through every public numeric path — the reviewed
 * 4c367cd7 defect. Symbols carry no numeric claim, so they read as NaN like any other non-number.
 */
function toNumber(v) {
  if (typeof v === 'symbol') return NaN;
  try {
    return Number(v);
  } catch (_) {
    return NaN; // boxed Symbols and hostile valueOf/toPrimitive objects coerce by throwing
  }
}

/** Coerce to a finite number, else `fallback`. Never NaN, never Infinity, never -0, never a throw. */
function num(v, fallback = 0) {
  const n = toNumber(v);
  return Number.isFinite(n) ? nz(n) : fallback;
}

function nonNegative(v, fallback = 0) {
  const n = num(v, fallback);
  return n > 0 ? n : 0;
}

/**
 * Coerce a HEAT-SIDE magnitude, saturating upward instead of collapsing to zero.
 *
 * `num()` maps a non-finite value to its fallback, which on the heat side would mean a machine
 * declaring an infinite power draw reads as stone cold — fail-COLD, i.e. a free win, the exact thing
 * this law exists to remove. Anything the heat path cannot represent therefore saturates to the
 * ceiling instead. Only genuine non-numbers (NaN, garbage) read as zero, because those carry no
 * claim of magnitude at all.
 */
function hotNum(v) {
  const n = toNumber(v);
  if (Number.isNaN(n)) return 0;
  if (n === Infinity) return SITE_THERMAL.maxEnergy;
  if (!Number.isFinite(n)) return 0; // -Infinity: a negative magnitude is no magnitude here
  return n > 0 ? nz(n) : 0;
}

/** Clamp a contact COUNT so that count × per-contact conductance can never overflow the multiply. */
function cappedCount(v) {
  const n = nonNegative(v);
  return n > SITE_THERMAL.maxEnergy ? SITE_THERMAL.maxEnergy : n;
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Round a RATIO to THERMAL_PRECISION dp. Guarantees finite output.
 *
 * The finiteness check is re-applied AFTER the scale-round-unscale, not only before it: `n * 1e6`
 * overflows to Infinity for finite inputs above ~1.8e302, so an input-only guard would return
 * Infinity from a function documented to return a finite value — the 5c1d9c0c defect exactly.
 *
 * HONEST STATUS — currently UNREACHABLE defence in depth, not an exercised contract. Every caller
 * clamps to [0,1] before calling, so the largest product this ever sees is 1e6 and the post-check
 * cannot fire. Mutation-testing confirms it: deleting the post-check leaves the whole suite green.
 * It is kept because the pre-clamp is a caller-side property that a future caller can quietly drop,
 * and at that moment this line is the only thing between a rebalance and an Infinity in a save file.
 */
function roundRatio(n) {
  if (!Number.isFinite(n)) return 0;
  const scale = 10 ** THERMAL_PRECISION;
  const v = nz(Math.round(n * scale) / scale);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Sum in a fixed sorted order rather than in caller order, so a permuted machine list produces a
 * bit-identical total. Unlike the equivalent in siteSignatureModel.js this one is OBSERVABLE: the
 * site totals here are not rounded away, so accumulation-order spread would survive to the output
 * and break the deepStrictEqual permutation proof directly.
 */
function stableSum(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  finite.sort((a, b) => a - b);
  let acc = 0;
  for (const v of finite) acc += v;
  return Number.isFinite(acc) ? acc : SITE_THERMAL.maxEnergy;
}

/**
 * Convert a per-minute rate into energy over `dtMin`, saturating at the finite ceiling.
 *
 * FAILS HOT ON PURPOSE. If the product overflows, the honest reading is "unboundedly much heat", so
 * it saturates UP to maxEnergy. Collapsing to 0 — the reflexive fail-closed default — would report a
 * machine being fed 1e308 MW as stone cold, which is the free win this whole law exists to remove.
 */
function energyOf(rate, dtMin) {
  const r = nonNegative(rate);
  const d = nonNegative(dtMin);
  if (r === 0 || d === 0) return 0;
  const e = r * d;
  // Two saturating guards with a deliberate overlap. The explicit non-finite check states the intent
  // (an overflowed product means "unboundedly much heat"); the trailing comparison is what handles
  // the finite-but-over-ceiling case. They overlap on Infinity, because `Infinity > maxEnergy` is
  // true — so the explicit check is redundant TODAY and mutation-testing shows the suite stays green
  // without it. It is kept because relying on that comparison quietly doing double duty is exactly
  // the kind of implicit reasoning the 5c1d9c0c defect was made of.
  if (!Number.isFinite(e)) return SITE_THERMAL.maxEnergy;
  return e > SITE_THERMAL.maxEnergy ? SITE_THERMAL.maxEnergy : e;
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  return obj;
}

// --- Contact ring -------------------------------------------------------------------------------

/**
 * Normalise a contact ring into plain material COUNTS.
 *
 * Accepts either the counts shape produced by siteProduction.contactProfile
 * ({matrix, basalt, gas, ores}) or a raw `cells` array of {kind, ore} — the latter is tallied, and
 * tallying is integer counting, so a shuffled ring is invariant by construction rather than by
 * floating-point luck.
 *
 * NOTE: `solid` is read from neither form. See SITE_THERMAL.gasPerContact for why.
 */
function readContacts(profile) {
  const out = { matrix: 0, basalt: 0, gas: 0, ores: {} };
  if (!profile || typeof profile !== 'object') return out;

  const hasCounts = ['matrix', 'basalt', 'gas', 'ores'].some((k) => profile[k] != null);
  if (hasCounts) {
    // Counts are capped before they ever meet a per-contact multiplier, so no conduction term can
    // overflow to Infinity and then be silently dropped from the sum.
    out.matrix = cappedCount(profile.matrix);
    out.basalt = cappedCount(profile.basalt);
    out.gas = cappedCount(profile.gas);
    const ores = profile.ores && typeof profile.ores === 'object' ? profile.ores : null;
    if (ores) for (const k of Object.keys(ores).sort()) out.ores[k] = cappedCount(ores[k]);
    return out;
  }

  if (Array.isArray(profile.cells)) {
    for (const cell of profile.cells) {
      if (!cell || typeof cell !== 'object') continue;
      if (cell.kind === 'matrix') out.matrix++;
      else if (cell.kind === 'basalt') out.basalt++;
      else if (cell.kind === 'gas') out.gas++;
      else if (cell.kind === 'ore' && typeof cell.ore === 'string') {
        out.ores[cell.ore] = (out.ores[cell.ore] || 0) + 1;
      }
    }
  }
  return out;
}

/**
 * Conduction capacity of a machine's 8-cell contact ring, in heat units per minute.
 *
 * ONLY SOLID ROCK COUNTS. Silicate matrix, dense basalt and ore veins conduct; hollow cells are
 * access and conduct nothing; sealed gas pockets conduct nothing either (they are pressurised voids,
 * and SITE_THERMAL.gasPerContact is 0 to say so in one place).
 *
 * Ore keys are walked in sorted order so ring insertion order cannot move the result.
 *
 * @param {object|null} profile contactProfile-shaped counts, or {cells:[{kind,ore}]}
 * @returns {number} finite, >= 0, heat units per minute
 */
export function rockSinkFor(profile) {
  const c = readContacts(profile);
  const terms = [
    c.matrix * SITE_THERMAL.matrixPerContact,
    c.basalt * SITE_THERMAL.basaltPerContact,
    c.gas * SITE_THERMAL.gasPerContact,
  ];
  for (const oreId of Object.keys(c.ores).sort()) {
    terms.push(c.ores[oreId] * SITE_THERMAL.orePerContact);
  }
  const sum = stableSum(terms);
  return sum > SITE_THERMAL.maxEnergy ? SITE_THERMAL.maxEnergy : nonNegative(sum);
}

// --- Heat generation ----------------------------------------------------------------------------

/**
 * Heat a machine generates, in heat units per minute.
 *
 * Derived from the machine's REAL power behaviour rather than from an invented per-machine table:
 * machineCapability() (siteProduction.js) resolves powerDraw and powerGen from `def.power` in
 * SITE_MACHINES and, for the gas tap, from its mode against CONTACT_YIELD.gasPowerPerContact. So a
 * gas tap in `generate` mode runs hotter than the same tap in `feedstock` mode for the honest reason
 * that it is actually producing more megawatts, and a bigger machine runs hotter because it really
 * does draw more power. Nothing here is a free parameter per machine id.
 *
 * Throttled machines run cooler: heat tracks power ACTUALLY SERVED (draw × powerRatio), so a machine
 * on a browning-out network is not charged for megawatts it never received. A machine with no power
 * component at all falls to powerRatio 0 at the call site (asteroidSites.js:766) and generates no
 * draw heat — correctly, since it is not running.
 *
 * @param {object|null} def       a SITE_MACHINES entry
 * @param {object|null} profile   contact ring (only the gas tap's generation reads it)
 * @param {number} powerRatio     served fraction of demand, clamped to [0,1]
 * @param {string} [mode]         machine mode, for defs that have one
 * @returns {number} finite, >= 0, heat units per minute
 */
export function heatPerMachine(def, profile, powerRatio, mode) {
  // machineCapability dereferences `def` before its own null guard (siteProduction.js:63), so an
  // absent def must be screened HERE rather than passed through.
  if (!def || typeof def !== 'object') return 0;

  const contacts = readContacts(profile);
  // A frozen plain-counts view: machineCapability only reads counts, and handing it a fresh object
  // keeps this function provably incapable of mutating the caller's profile.
  const capProfile = {
    matrix: contacts.matrix,
    basalt: contacts.basalt,
    gas: contacts.gas,
    ores: { ...contacts.ores },
    empty: 0,
    solid: 0,
    cells: [],
  };

  let cap;
  try {
    cap = machineCapability(def, capProfile, typeof mode === 'string' ? mode : undefined);
  } catch {
    return 0;
  }
  if (!cap || typeof cap !== 'object') return 0;

  // hotNum, not nonNegative: an unrepresentable power figure must not read as a cold machine.
  const ratio = clamp01(num(powerRatio, 0));
  const servedDraw = hotNum(cap.powerDraw) * ratio;
  const gen = hotNum(cap.powerGen);

  const sum = stableSum([
    servedDraw * SITE_THERMAL.heatPerMWDraw,
    gen * SITE_THERMAL.heatPerMWGen,
  ]);
  return sum > SITE_THERMAL.maxEnergy ? SITE_THERMAL.maxEnergy : nonNegative(sum);
}

/**
 * Thermal mass of a machine, in heat units. Reported for A07; never decides a band.
 *
 * Saturates UPWARD at the finite stored-heat ceiling when the multiply overflows or exceeds it.
 * The previous fallback returned capacityBase on a non-finite product, so raising installed power
 * from 1e307 to 1e308 COLLAPSED capacity from 8e307 to 6 — non-monotone at the top of the range
 * (the reviewed 4c367cd7 defect). More power can now never report less capacity.
 */
export function thermalCapacityFor(def) {
  // hotNum, not num: a def declaring INFINITE power is an unbounded-magnitude claim and must
  // saturate the capacity UP to the ceiling, not collapse to the base floor (round-3 finding —
  // num() mapped Infinity to 0, reading the largest conceivable machine as the smallest).
  // The abs comes FIRST: draw machines carry NEGATIVE power, and hotNum floors negatives.
  const mw = def && typeof def === 'object' ? hotNum(Math.abs(toNumber(def.power))) : 0;
  const cap = SITE_THERMAL.capacityBase + mw * SITE_THERMAL.capacityPerMW;
  if (!Number.isFinite(cap) || cap > SITE_THERMAL.maxStored) return SITE_THERMAL.maxStored;
  return cap > 0 ? cap : SITE_THERMAL.capacityBase;
}

// --- Band classification ------------------------------------------------------------------------

/**
 * Steady-state thermal load ∈ [0, 1]: heat / (heat + sink).
 *
 * Degenerate readings, each chosen so the fail direction is HOT:
 *   • no heat at all           → 0 (nominal), whatever the sink is. 0/0 included.
 *   • heat > 0 with zero sink  → 1 (the worst band). A machine in a fully hollowed hall has nowhere
 *     to put its heat, and that is precisely the case the law exists to price.
 */
export function thermalLoad(heatRate, sinkRate) {
  // An UNBOUNDED heat claim fails HOT before any coercion can flatten it to zero: +Infinity heat
  // is the loudest possible reading, not an absent one. (An unreadable/infinite SINK claim earns
  // no cooling credit — absence of information is not a heatsink — so it falls through num() to 0
  // and the h>0 path reads 1.) Both directions were reviewed 4c367cd7 defects.
  if (toNumber(heatRate) === Infinity) return 1;
  const h = nonNegative(heatRate);
  const s = nonNegative(sinkRate);
  if (h === 0) return 0;
  if (s === 0) return 1;
  // Normalise both rates by the larger before forming the ratio: load is scale-invariant by
  // construction and the denominator can never overflow (hn + sn <= 2). The previous h + s sum
  // reached Infinity at extreme finite magnitudes, silently turning a balanced 0.5 into 1.
  const m = h > s ? h : s;
  const hn = h / m;
  const sn = s / m;
  return clamp01(hn / (hn + sn));
}

/** Map a load in [0,1] onto THERMAL_BANDS. Walks descending, so the highest satisfied band wins. */
export function classifyBand(load) {
  const v = clamp01(num(load, 1));
  for (let i = THERMAL_BANDS.length - 1; i >= 0; i--) {
    if (v >= THERMAL_BANDS[i].minLoad) return THERMAL_BANDS[i].id;
  }
  return THERMAL_BANDS[0].id;
}

function bandIndexOf(id) {
  return THERMAL_BANDS.findIndex((b) => b.id === id);
}

// --- Per-machine solve --------------------------------------------------------------------------

/**
 * Solve one machine's thermal step. PURE — nothing passed in is touched, and the caller persists
 * `step.storedAfter` itself (A07's job, not this kernel's).
 *
 * THE CONSERVATION IDENTITY, which the suite pins per machine and site-wide:
 *
 *     generated === storedDelta + dissipated,     dissipated === conducted + vented
 *
 * It holds BY CONSTRUCTION rather than by tuning. `conducted` is capped at the heat actually present
 * (so stored can never go negative), `vented` is defined as exactly the excess clipped by the finite
 * ceiling, and `storedDelta` is the residual of the other two. There is no path that discards energy
 * silently: even the overflow saturation shows up as a reported `vented` term.
 *
 * @param {object} input
 *   @prop {object} def            SITE_MACHINES entry
 *   @prop {object} [profile]      contact ring
 *   @prop {number} [powerRatio]   served power fraction
 *   @prop {string} [mode]
 *   @prop {number} [storedHeat]   heat carried in from the previous step
 *   @prop {number} [coolingRate]  external cooling, heat units/min. NO SUPPLIER EXISTS YET — the
 *                                 Radiator Mast and Coolant Loop are unbuilt Wave 2 machines
 *                                 (VISION:90), so this stays a named parameter rather than an
 *                                 invented sm_radiator. Same stance as A08's `masking`.
 *   @prop {number} [dtS]          step length in seconds
 */
export function machineThermalState(input) {
  const inp = input && typeof input === 'object' ? input : {};
  const def = inp.def && typeof inp.def === 'object' ? inp.def : null;

  const heat = heatPerMachine(def, inp.profile, inp.powerRatio, inp.mode);
  const rockSink = rockSinkFor(inp.profile);
  const cooling = nonNegative(inp.coolingRate);
  const sinkRaw = stableSum([rockSink, cooling]);
  const sink = sinkRaw > SITE_THERMAL.maxEnergy ? SITE_THERMAL.maxEnergy : nonNegative(sinkRaw);

  const load = roundRatio(thermalLoad(heat, sink));
  const band = classifyBand(load);

  const dtS = nonNegative(inp.dtS);
  const dtMin = dtS / 60;
  const capacity = thermalCapacityFor(def);

  const storedBefore = Math.min(nonNegative(inp.storedHeat), SITE_THERMAL.maxStored);
  const generated = energyOf(heat, dtMin);
  const sinkEnergy = energyOf(sink, dtMin);

  // Conduction can only shed heat that exists: what came in plus what was made this step.
  const available = Math.min(storedBefore + generated, SITE_THERMAL.maxStored * 2);
  const conducted = Math.min(sinkEnergy, available);

  // Whatever the finite ceiling clips is REPORTED as vented, never silently dropped.
  const rawAfter = available - conducted;
  const storedAfter = Math.min(rawAfter, SITE_THERMAL.maxStored);
  const vented = Math.max(0, rawAfter - storedAfter);

  const dissipated = conducted + vented;
  const storedDelta = storedAfter - storedBefore;

  return {
    id: typeof inp.id === 'string' ? inp.id : null,
    defId: def && typeof def.id === 'string' ? def.id : null,
    // RATES, per minute — the steady-state view the band is read from.
    heat: nonNegative(heat),
    sink: nonNegative(sink),
    net: nz(heat - sink),
    rockSink: nonNegative(rockSink),
    cooling,
    load,
    band,
    bandIndex: bandIndexOf(band),
    capacity,
    // ENERGIES, for this step. Deliberately UNROUNDED: rounding these would break the conservation
    // identity above, which is the packet's required proof. They are finite by construction.
    step: {
      dtS,
      generated,
      conducted,
      vented,
      dissipated,
      storedBefore,
      storedAfter,
      storedDelta,
    },
    saturation: roundRatio(clamp01(capacity > 0 ? storedAfter / capacity : 1)),
  };
}

// --- Whole-site pass ----------------------------------------------------------------------------

/**
 * Canonical sort key for a machine. Content-derived, never the array index — an index-derived key
 * would make the whole result depend on caller order, which is the thing being disproved.
 *
 * The key is a TOTAL order over every normalized observable input: identity fields first, then a
 * canonical projection of the thermal content (powerRatio, storedHeat, coolingRate, contact
 * counts). Two entries can therefore only tie when their normalized content is IDENTICAL, and
 * identical content produces an identical record — so which one a stable sort visits first is
 * unobservable, and permuting the caller's array can never change the output. (An earlier revision
 * keyed identity fields only and documented the anonymous collision as unreachable; the 4c367cd7
 * review proved it reachable through accepted plain-data inputs, and the same hole let the
 * duplicate-id survivor depend on caller order.)
 */
function machineKey(m) {
  const id = typeof m.id === 'string' && m.id.length > 0 ? m.id : '';
  const defId = typeof m.defId === 'string' ? m.defId : '';
  const prof = readContacts(m.profile);
  // JSON-encoded so arbitrary ore identifiers cannot forge delimiter collisions (a round-3
  // review built two DIFFERENT profiles whose comma/colon join encoded identically).
  const ores = Object.fromEntries(Object.keys(prof.ores).sort().map((k) => [k, prof.ores[k]]));
  const content = JSON.stringify([
    num(m.powerRatio, -1), nonNegative(m.storedHeat), nonNegative(m.coolingRate),
    prof.matrix, prof.basalt, prof.gas, ores,
  ]);
  return [id, defId, num(m.col, -1), num(m.row, -1), typeof m.mode === 'string' ? m.mode : '', content]
    .join('\u0000');
}

function sortRejected(list) {
  return list.slice().sort((a, b) => {
    const ka = `${a.id ?? ''}\u0000${a.defId ?? ''}\u0000${a.reason}`;
    const kb = `${b.id ?? ''}\u0000${b.defId ?? ''}\u0000${b.reason}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/**
 * Solve a whole site's thermal step from a serializable snapshot. PURE, order-independent, deeply
 * frozen, JSON-safe.
 *
 * Accepts a minimal plain-data shape rather than an asteroidSites projection, so the kernel is
 * testable without a live drill field and survives an A07 rewiring of the runtime cache.
 *
 * @param {object|null} snapshot
 *   @prop {number}   [dtS]        step length in seconds. 0 is a legal no-op; negative is rejected.
 *   @prop {object[]} [machines]   {id, defId, profile, powerRatio, mode, storedHeat, coolingRate}
 * @returns {object} deeply frozen thermal record
 */
export function stepSiteThermal(snapshot) {
  const snap = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
  const rejected = [];

  // Optional def source override. A snapshot may carry its own {defId -> def} map, which SHADOWS
  // the live SITE_MACHINE_BY_ID catalog. This is the injection seam that lets contract tests run
  // fully self-contained synthetic machines (the 4c367cd7 review's fixture-self-containment
  // finding) and lets a future A07 rewiring feed staged defs without touching this kernel.
  const defSource = snap.defs && typeof snap.defs === 'object' && !Array.isArray(snap.defs)
    ? snap.defs : null;
  const defFor = (defId) => {
    if (!defId) return null;
    const injected = defSource && defSource[defId];
    if (injected && typeof injected === 'object') return injected;
    return SITE_MACHINE_BY_ID.get(defId) || null;
  };

  // dt is validated once, at site scope. A negative dt is meaningless rather than malformed-per-
  // machine, so it degrades the step to a no-op (dt 0) and says so, instead of throwing.
  const dtRaw = toNumber(snap.dtS);
  let dtS = 0;
  if (snap.dtS === undefined || snap.dtS === null) {
    dtS = 0;
  } else if (!Number.isFinite(dtRaw)) {
    rejected.push({ id: null, defId: null, reason: 'invalid-dt' });
  } else if (dtRaw < 0) {
    rejected.push({ id: null, defId: null, reason: 'negative-dt' });
  } else {
    dtS = dtRaw;
  }

  const raw = Array.isArray(snap.machines) ? snap.machines : [];

  // Canonical order FIRST, then dedupe — so which duplicate survives never depends on caller order.
  const keyed = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') {
      rejected.push({ id: null, defId: null, reason: 'not-an-object' });
      continue;
    }
    keyed.push({ m, key: machineKey(m) });
  }
  keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const seenIds = new Set();
  const machines = [];
  for (const { m } of keyed) {
    const id = typeof m.id === 'string' && m.id.length > 0 ? m.id : null;
    const defId = typeof m.defId === 'string' ? m.defId : null;

    if (id !== null && seenIds.has(id)) {
      // A site cannot hold two machines under one id; the ambiguous copy is reported, not guessed at.
      rejected.push({ id, defId, reason: 'duplicate-id' });
      continue;
    }
    if (id !== null) seenIds.add(id);

    const def = defFor(defId);
    if (!def) {
      rejected.push({ id, defId, reason: 'unknown-def' });
      continue;
    }

    machines.push(machineThermalState({
      id,
      def,
      profile: m.profile,
      powerRatio: m.powerRatio,
      mode: m.mode,
      storedHeat: m.storedHeat,
      coolingRate: m.coolingRate,
      dtS,
    }));
  }

  const totals = {
    machineCount: machines.length,
    heat: stableSum(machines.map((r) => r.heat)),
    sink: stableSum(machines.map((r) => r.sink)),
    generated: stableSum(machines.map((r) => r.step.generated)),
    conducted: stableSum(machines.map((r) => r.step.conducted)),
    vented: stableSum(machines.map((r) => r.step.vented)),
    dissipated: stableSum(machines.map((r) => r.step.dissipated)),
    storedBefore: stableSum(machines.map((r) => r.step.storedBefore)),
    storedAfter: stableSum(machines.map((r) => r.step.storedAfter)),
    storedDelta: stableSum(machines.map((r) => r.step.storedDelta)),
  };

  // Band census, keyed in THERMAL_BANDS order so the object's key order is itself deterministic.
  const bandCounts = {};
  for (const b of THERMAL_BANDS) bandCounts[b.id] = 0;
  for (const r of machines) bandCounts[r.band] += 1;

  // The site's headline reading is its WORST machine, not its average: one faulting machine in a
  // hollow hall is the operator's problem even if nine others are comfortable.
  let worst = machines.length ? machines[0] : null;
  for (const r of machines) if (r.bandIndex > worst.bandIndex) worst = r;

  return deepFreeze({
    version: THERMAL_MODEL_VERSION,
    dtS,
    machines,
    totals,
    bandCounts,
    worstBand: worst ? worst.band : THERMAL_BANDS[0].id,
    rejected: sortRejected(rejected),
  });
}
