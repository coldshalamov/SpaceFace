// Contract tests for the massline invariant vocabulary (packet T02).
//
// HONEST FRAMING: this is a NEW pure contract module, so these tests are CHARACTERIZATION-GREEN
// against existing behaviour at the ownership seam. They do not expose a defect and are not
// dressed up as if they did. What they defend is that the schema stays FAITHFUL to the live
// constants it claims to describe, which is the only way a vocabulary module earns its keep.
//
// The tests treat tolerances differently according to how the schema obtained them:
//
//   imported    -> assert schema value === the live exported source. Real single-sourcing.
//   behavioural -> call the real exported function at the band edge, assert the classification
//                  flips. Detects drift in a module-private literal.
//   copied      -> CANNOT be drift-checked (the source literal is module-private and no exported
//                  function applies it cheaply). We assert only that every such value is disclosed
//                  in MASSLINE_UNPINNED_COPIES. Asserting the literal against itself would be a
//                  self-consistency test wearing a drift-detection costume, so we do not do it.
//
// INDEPENDENT FULL TABLE: EXPECTED_TOLERANCES hard-codes every resolved term.key -> {value, space}
// as literals. ANY drift — including in an imported source module — reds the suite. Band bounds
// are pinned the same way in DECLARED_BOUNDS.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DERIVATIONS,
  MASSLINE_ALPHABETS,
  MASSLINE_BAND_SETS,
  MASSLINE_INVARIANTS,
  MASSLINE_INVARIANTS_SCHEMA,
  MASSLINE_INVARIANTS_VERSION,
  MASSLINE_KNOWN_COLLISIONS,
  MASSLINE_QUANTITY_SPACES,
  MASSLINE_REQUIRED_TERMS,
  MASSLINE_REQUIRED_TOP_LEVEL_KEYS,
  MASSLINE_TERMS,
  MASSLINE_UNPINNED_COPIES,
  buildMasslineInvariants,
  classifyMassline,
  isUnresolved,
  pendingTerms,
  toleranceOf,
  toleranceOrNull,
  validateMasslineInvariants,
} from '../src/combat/masslineInvariants.js';

// Live sources used for imported-spot-checks and behavioural pinning against real implementations.
// Catalog IDs (tether_standard / attachment_massline) are NOT pinned as expectations here.
import { MASSLINE_ORBIT_DEFAULTS, MASSLINE_ORBIT_REASONS } from '../src/combat/masslineOrbitTelemetry.js';
import { DEFAULT_MASSLINE_DEF } from '../src/core/constraints/masslineController.js';
import { computeTetherLoad, rateRelease } from '../src/systems/tetherGameplay.js';

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

/** The declaration classifyMassline() demands for a given band set. */
function declFor(setId) {
  const set = MASSLINE_BAND_SETS[setId];
  return { space: set.space, calibration: set.calibration };
}

function bandOf(setId, value) {
  const result = classifyMassline(setId, value, declFor(setId));
  assert.equal(result.ok, true, `classify ${setId}@${value} should succeed: ${result.reason}`);
  return result.band;
}

function clone(doc) {
  return JSON.parse(JSON.stringify(doc));
}

/** Seed the telemetry subtree rateRelease reads. Pure fixture; writes no real state. */
function releaseState(strain, { tangentialSpeed = 100, radialSpeed = 0 } = {}) {
  return { player: { masslineTelemetry: { strain, tangentialSpeed, radialSpeed } } };
}

const EPS = 1e-9;
const BOUND_PROBE = 0.001;

// ---------------------------------------------------------------------------------------------
// INDEPENDENT FULL TABLE (P1-1) — hard-coded literals; copy values BY HAND from live sources.
// Editing a threshold in the vocabulary OR in an imported module cannot keep this table in sync.
// ---------------------------------------------------------------------------------------------

/**
 * Every resolved term.key -> {value, space}.
 * Literals written by hand from the live grounding at base f1a210cf + T02 repair:
 *   - orbit defaults from masslineOrbitTelemetry
 *   - efficiency / catastrophic / grace from DEFAULT_MASSLINE_DEF
 *   - attachment windows / denominators as observed at grounding time
 *   - pump/escape grounded constants from the lead's rulings
 */
const EXPECTED_TOLERANCES = Object.freeze({
  'capture.captureWindowStandardS': { value: 0.35, space: 'timeS' },
  'capture.captureWindowMasslineS': { value: 0.3, space: 'timeS' },
  'capture.slackBeforeCaptureS': { value: 0.1, space: 'timeS' },
  'capture.stretchEpsilonWu': { value: 0.05, space: 'lengthWu' },
  'capture.snapCatchWindowS': { value: 1, space: 'timeS' },
  'capture.snapCatchMinSpeedWu': { value: 25, space: 'speedWu' },
  'stableOrbit.tangentQualityMin': { value: 0.85, space: 'quality01' },
  'stableOrbit.tensionBalanceAbsMax': { value: 0.25, space: 'balanceSigned' },
  'stableOrbit.demandEpsilon': { value: 1e-9, space: 'tensionForce' },
  'pumpGain.pumpArmStrength': { value: 0.55, space: 'quality01' },
  'pumpGain.pumpResetStrength': { value: 0.15, space: 'quality01' },
  'pumpGain.reelIntentDeadzone': { value: 0.001, space: 'quality01' },
  'pumpGain.winchEfficiency': { value: 0.72, space: 'quality01' },
  'pumpGain.gainBudgetPerStroke': { value: 0.72, space: 'quality01' },
  'pumpGain.gainStackingLimit': { value: 1, space: 'count' },
  'releaseQuality.usefulLoad': { value: 0.65, space: 'breakFraction01' },
  'releaseQuality.overloadKnee': { value: 0.85, space: 'breakFraction01' },
  'releaseQuality.overloadSpan': { value: 0.35, space: 'breakFraction01' },
  'releaseQuality.adviseScore': { value: 0.65, space: 'quality01' },
  'break.overloadRatioEdge': { value: 1, space: 'overloadRatio' },
  'break.catastrophicRatio': { value: 1.75, space: 'overloadRatio' },
  'break.overloadGraceDefaultS': { value: 0.22, space: 'timeS' },
  'break.overloadGraceTetherStandardS': { value: 1.1, space: 'timeS' },
  'break.hardenMax': { value: 0.85, space: 'quality01' },
  'break.nearBreakStrain': { value: 0.75, space: 'breakFraction01' },
  'escape.responseWindowS': { value: 8, space: 'timeS' },
  'escape.collisionHorizonS': { value: 1.5, space: 'timeS' },
  'escape.escapeRadiusWu': { value: 260, space: 'distanceWu' },
  'escape.escapeClosingMaxWu': { value: 12.5, space: 'speedWu' },
});

// Band-tier bounds (the 11 non-floor thresholds). Independent of the schema's tier.min fields.
const DECLARED_BOUNDS = Object.freeze({
  'release.quality': [0.85, 0.65, 0.35],
  'snapCatch.quality': [0.85, 0.55],
  'orbit.load': [0.75, 0.25],
  'reel.risk': [0.75, 0.45],
  'break.overload': [1.75, 1],
});

/** Frozen local calibration fixture for builder contract tests. No live catalog IDs. */
const FIXTURE_CALIBRATION = Object.freeze({
  orbit: Object.freeze({
    breakTension: 6000,
    slackEpsilon: 0.05,
    loadedLoadRatio: 0.25,
    overloadLoadRatio: 0.75,
    stableTangentQuality: 0.85,
    stableTensionBalance: 0.25,
    reelRiskHighLoad: 0.75,
    reelRiskMediumLoad: 0.45,
    reelIntentDeadzone: 0.001,
    releaseUsefulLoad: 0.65,
    releaseOverloadKnee: 0.85,
    releaseOverloadSpan: 0.35,
    releaseRazorScore: 0.85,
    releaseCleanScore: 0.65,
    releaseGoodScore: 0.35,
    releaseAdviseScore: 0.65,
    demandEpsilon: 1e-9,
  }),
  masslineDef: Object.freeze({
    efficiency: 0.72,
    catastrophicRatio: 1.75,
    overloadGraceS: 0.22,
  }),
  tetherStandard: Object.freeze({
    breakTension: 1_050_000,
    captureS: 0.35,
    overloadGraceS: 1.1,
  }),
  attachmentMassline: Object.freeze({
    maxTension: 10_250,
    captureS: 0.3,
  }),
});

// ---------------------------------------------------------------------------------------------
// machine-readable schema
// ---------------------------------------------------------------------------------------------

test('the exported document validates against its own schema', () => {
  const result = validateMasslineInvariants(MASSLINE_INVARIANTS);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(MASSLINE_INVARIANTS.schema, MASSLINE_INVARIANTS_SCHEMA);
  assert.equal(MASSLINE_INVARIANTS.version, MASSLINE_INVARIANTS_VERSION);
});

test('the document is machine-readable: a JSON round-trip is lossless and still valid', () => {
  const round = clone(MASSLINE_INVARIANTS);
  assert.deepEqual(round, MASSLINE_INVARIANTS);
  assert.equal(validateMasslineInvariants(round).ok, true);
});

test('the document and every nested tier/tolerance is deeply frozen', () => {
  const seen = new WeakSet();
  const walk = (node, path) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    assert.ok(Object.isFrozen(node), `${path} must be frozen`);
    for (const [key, child] of Object.entries(node)) walk(child, `${path}.${key}`);
  };
  walk(MASSLINE_INVARIANTS, 'MASSLINE_INVARIANTS');

  // Frozen-ness must actually take, not merely report true.
  const before = MASSLINE_BAND_SETS['release.quality'].tiers[0].min;
  try { MASSLINE_BAND_SETS['release.quality'].tiers[0].min = 0.01; } catch { /* strict mode throws */ }
  assert.equal(MASSLINE_BAND_SETS['release.quality'].tiers[0].min, before);
});

test('the module is pure: no clock, no RNG, no state, byte-identical repeat reads', () => {
  // Strip comments first: the module's own header DISCUSSES these names while promising not to
  // call them, and a naive substring scan would flag the promise as the violation.
  const source = readFileSync(new URL('../src/combat/masslineInvariants.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['Math.random', 'Date.now', 'new Date(']) {
    assert.equal(source.includes(forbidden), false, `pure kernel must not use ${forbidden}`);
  }
  assert.equal(source.includes("from 'three'"), false, 'pure kernel must not import Three.js');
  // Guard the guard: the scan must still be able to see real code.
  assert.ok(source.includes('export function classifyMassline'), 'comment stripping ate the source');

  const a = classifyMassline('release.quality', 0.7, declFor('release.quality'));
  const b = classifyMassline('release.quality', 0.7, declFor('release.quality'));
  assert.deepEqual(a, b);
  assert.deepEqual(validateMasslineInvariants(MASSLINE_INVARIANTS), validateMasslineInvariants(MASSLINE_INVARIANTS));
});

// ---------------------------------------------------------------------------------------------
// independent full table (P1-1)
// ---------------------------------------------------------------------------------------------

test('every resolved tolerance matches the independent hard-coded table (value + space + key set)', () => {
  const actualKeys = [];
  for (const [termId, term] of Object.entries(MASSLINE_TERMS)) {
    for (const [key, tol] of Object.entries(term.tolerances)) {
      if (isUnresolved(tol)) {
        assert.fail(`${termId}.${key} is unresolved — the independent table expects all resolved`);
      }
      actualKeys.push(`${termId}.${key}`);
      const expected = EXPECTED_TOLERANCES[`${termId}.${key}`];
      assert.ok(expected, `unexpected tolerance ${termId}.${key} not in EXPECTED_TOLERANCES`);
      assert.equal(toleranceOf(termId, key), expected.value, `${termId}.${key} value`);
      assert.equal(tol.space, expected.space, `${termId}.${key} space`);
    }
  }
  assert.deepEqual(
    actualKeys.sort(),
    Object.keys(EXPECTED_TOLERANCES).sort(),
    'resolved tolerance key set must match the independent table exactly',
  );
});

// ---------------------------------------------------------------------------------------------
// imported tolerances are genuinely single-sourced (non-catalog)
// ---------------------------------------------------------------------------------------------

test('every tolerance marked imported matches its live exported source', () => {
  // Spot-check the load-bearing ones against the real modules, not against copies.
  // Catalog attachment IDs are NOT asserted here (see integration smoke + independent table).
  assert.equal(toleranceOf('stableOrbit', 'tangentQualityMin'), MASSLINE_ORBIT_DEFAULTS.stableTangentQuality);
  assert.equal(toleranceOf('stableOrbit', 'tensionBalanceAbsMax'), MASSLINE_ORBIT_DEFAULTS.stableTensionBalance);
  assert.equal(toleranceOf('stableOrbit', 'demandEpsilon'), MASSLINE_ORBIT_DEFAULTS.demandEpsilon);

  assert.equal(toleranceOf('releaseQuality', 'usefulLoad'), MASSLINE_ORBIT_DEFAULTS.releaseUsefulLoad);
  assert.equal(toleranceOf('releaseQuality', 'overloadKnee'), MASSLINE_ORBIT_DEFAULTS.releaseOverloadKnee);
  assert.equal(toleranceOf('releaseQuality', 'overloadSpan'), MASSLINE_ORBIT_DEFAULTS.releaseOverloadSpan);
  assert.equal(toleranceOf('releaseQuality', 'adviseScore'), MASSLINE_ORBIT_DEFAULTS.releaseAdviseScore);

  assert.equal(toleranceOf('break', 'catastrophicRatio'), DEFAULT_MASSLINE_DEF.catastrophicRatio);
  assert.equal(toleranceOf('break', 'overloadGraceDefaultS'), DEFAULT_MASSLINE_DEF.overloadGraceS);

  assert.equal(toleranceOf('capture', 'stretchEpsilonWu'), MASSLINE_ORBIT_DEFAULTS.slackEpsilon);

  assert.equal(toleranceOf('pumpGain', 'winchEfficiency'), DEFAULT_MASSLINE_DEF.efficiency);
  assert.equal(toleranceOf('pumpGain', 'gainBudgetPerStroke'), DEFAULT_MASSLINE_DEF.efficiency);
  assert.equal(toleranceOf('pumpGain', 'reelIntentDeadzone'), MASSLINE_ORBIT_DEFAULTS.reelIntentDeadzone);
});

test('imported band tiers match their live exported source', () => {
  const release = MASSLINE_BAND_SETS['release.quality'].tiers;
  assert.equal(release[0].min, MASSLINE_ORBIT_DEFAULTS.releaseRazorScore);
  assert.equal(release[1].min, MASSLINE_ORBIT_DEFAULTS.releaseCleanScore);
  assert.equal(release[2].min, MASSLINE_ORBIT_DEFAULTS.releaseGoodScore);

  const load = MASSLINE_BAND_SETS['orbit.load'].tiers;
  assert.equal(load[0].min, MASSLINE_ORBIT_DEFAULTS.overloadLoadRatio);
  assert.equal(load[1].min, MASSLINE_ORBIT_DEFAULTS.loadedLoadRatio);

  const risk = MASSLINE_BAND_SETS['reel.risk'].tiers;
  assert.equal(risk[0].min, MASSLINE_ORBIT_DEFAULTS.reelRiskHighLoad);
  assert.equal(risk[1].min, MASSLINE_ORBIT_DEFAULTS.reelRiskMediumLoad);

  assert.equal(MASSLINE_BAND_SETS['break.overload'].tiers[0].min, DEFAULT_MASSLINE_DEF.catastrophicRatio);
});

test('breakFraction01 calibrations disclose clamp path property (P1-5)', () => {
  const cals = MASSLINE_QUANTITY_SPACES.breakFraction01.calibrations;
  assert.equal(MASSLINE_QUANTITY_SPACES.breakFraction01.domain[0], 0);
  assert.equal(MASSLINE_QUANTITY_SPACES.breakFraction01.domain[1], null);
  assert.equal(cals.t01Placeholder.clamped, true);
  assert.equal(cals.tetherStandard.clamped, false);
  assert.equal(cals.attachmentMassline.clamped, false);
  assert.equal(cals.t01Placeholder.status, 'placeholder');
  assert.equal(cals.tetherStandard.status, 'live');
  assert.equal(cals.attachmentMassline.status, 'live');
  // Denominators must be positive finite (shape); values are pinned by EXPECTED_TOLERANCES
  // and the fixture builder path, not by live catalog IDs.
  for (const cal of Object.values(cals)) {
    assert.ok(Number.isFinite(cal.denominator) && cal.denominator > 0);
  }
});

// ---------------------------------------------------------------------------------------------
// band-edge inclusivity, pinned exactly at every declared threshold
// ---------------------------------------------------------------------------------------------

test('every band edge is inclusive-lower at exactly its declared threshold', () => {
  for (const set of Object.values(MASSLINE_BAND_SETS)) {
    const decl = declFor(set.id);
    for (const [i, tier] of set.tiers.entries()) {
      if (tier.min === null) continue;
      // AT the threshold the upper tier wins (>=, not >).
      assert.equal(bandOf(set.id, tier.min), tier.id, `${set.id} at ${tier.min} must be '${tier.id}'`);
      // A hair below it falls to the next tier down.
      const below = classifyMassline(set.id, tier.min - EPS, decl);
      assert.equal(below.ok, true);
      assert.equal(below.band, set.tiers[i + 1].id, `${set.id} just below ${tier.min} must fall through`);
    }
  }
});

test('the specific declared thresholds land where the vocabulary says they do', () => {
  assert.equal(bandOf('release.quality', 0.85), 'razor');
  assert.equal(bandOf('release.quality', 0.65), 'clean');
  assert.equal(bandOf('release.quality', 0.35), 'good');
  assert.equal(bandOf('release.quality', 0), 'messy');

  assert.equal(bandOf('snapCatch.quality', 0.85), 'clean');
  assert.equal(bandOf('snapCatch.quality', 0.55), 'good');
  assert.equal(bandOf('snapCatch.quality', 0), 'rough');

  assert.equal(bandOf('orbit.load', 0.75), 'overload');
  assert.equal(bandOf('orbit.load', 0.25), 'loaded');
  assert.equal(bandOf('orbit.load', 0), 'taut');

  assert.equal(bandOf('reel.risk', 0.75), 'high');
  assert.equal(bandOf('reel.risk', 0.45), 'medium');
  assert.equal(bandOf('reel.risk', 0), 'low');

  assert.equal(bandOf('break.overload', 1.75), 'catastrophic');
  assert.equal(bandOf('break.overload', 1), 'overload');
  assert.equal(bandOf('break.overload', 0.999), 'nominal');
});

test('every declared threshold is pinned from both sides through classifyMassline (±0.001)', () => {
  // Completeness, both halves: a NEW band set, or a new tier inside an existing one, must fail here
  // rather than quietly enter the vocabulary unpinned.
  assert.deepEqual(
    Object.keys(DECLARED_BOUNDS).sort(),
    Object.keys(MASSLINE_BAND_SETS).sort(),
    'every band set must appear in the pinned-threshold table',
  );

  for (const [setId, bounds] of Object.entries(DECLARED_BOUNDS)) {
    const set = MASSLINE_BAND_SETS[setId];
    assert.equal(
      bounds.length,
      set.tiers.length - 1,
      `${setId} has a tier with no pinned threshold (the floor tier is the only unpinned one)`,
    );

    for (const [i, bound] of bounds.entries()) {
      const upper = set.tiers[i].id;
      const lower = set.tiers[i + 1].id;
      // AT the declared number the upper tier wins (>=, not >). Catches a threshold RAISED.
      assert.equal(bandOf(setId, bound), upper, `${setId} at ${bound} must be '${upper}'`);
      // A hair BELOW it must fall through. Catches a threshold LOWERED.
      assert.equal(
        bandOf(setId, bound - BOUND_PROBE),
        lower,
        `${setId} just below ${bound} must be '${lower}': the declared threshold has moved`,
      );
      // A hair ABOVE it must still be the upper tier (or higher if multi-tier, but at least not lower).
      assert.equal(
        bandOf(setId, bound + BOUND_PROBE),
        upper,
        `${setId} just above ${bound} must still be '${upper}'`,
      );
    }
  }
});

test('band ordering is monotone under a sweep, not merely ordered in the table', () => {
  for (const set of Object.values(MASSLINE_BAND_SETS)) {
    const decl = declFor(set.id);
    const [lo, hi] = set.space === 'overloadRatio' || set.space === 'breakFraction01' ? [0, 3] : [0, 1];
    let previousIndex = set.tiers.length;
    for (let step = 0; step <= 300; step += 1) {
      const value = lo + ((hi - lo) * step) / 300;
      const result = classifyMassline(set.id, value, decl);
      assert.equal(result.ok, true, `${set.id} @ ${value}: ${result.reason}`);
      const index = set.tiers.findIndex((t) => t.id === result.band);
      assert.ok(index >= 0, `${set.id} produced an off-alphabet band '${result.band}'`);
      // Tiers are listed best/highest first, so a rising value may only move the index DOWN.
      assert.ok(index <= previousIndex, `${set.id} band ordering inverted at ${value}`);
      previousIndex = index;
    }
    // The sweep must actually traverse the whole ladder, or it proved nothing.
    assert.equal(previousIndex, 0, `${set.id} sweep never reached the top tier`);
  }
});

// ---------------------------------------------------------------------------------------------
// behavioural pinning against the real (non-importable) implementations
// ---------------------------------------------------------------------------------------------

test('tetherGameplay.rateRelease flips classification at the schema release bands', () => {
  // rateRelease: score = tangentQuality * clamp01(strain/usefulLoad) * (1 - overloadPenalty).
  // With radialSpeed 0 the tangent quality is 1 and, below the overload knee, score = strain/0.65.
  const useful = toleranceOf('releaseQuality', 'usefulLoad');
  const knee = toleranceOf('releaseQuality', 'overloadKnee');

  for (const tier of MASSLINE_BAND_SETS['release.quality'].tiers) {
    if (tier.min === null) continue;
    const strainAtEdge = tier.min * useful;
    assert.ok(strainAtEdge < knee, 'fixture must stay below the overload knee for this algebra');

    const above = rateRelease(releaseState(strainAtEdge + 1e-6), 'fixture-target');
    const below = rateRelease(releaseState(strainAtEdge - 1e-6), 'fixture-target');

    assert.equal(above.classification, tier.id, `rateRelease just above ${tier.min} must be '${tier.id}'`);
    assert.notEqual(below.classification, tier.id, `rateRelease just below ${tier.min} must not be '${tier.id}'`);
    assert.equal(bandOf('release.quality', above.releaseScore), above.classification);
    assert.equal(bandOf('release.quality', below.releaseScore), below.classification);
  }
});

test('rateRelease and the schema agree across a full strain sweep', () => {
  for (let step = 0; step <= 100; step += 1) {
    const strain = step / 100;
    const rated = rateRelease(releaseState(strain), 'fixture-target');
    assert.equal(
      bandOf('release.quality', rated.releaseScore),
      rated.classification,
      `schema and rateRelease disagree at strain ${strain}`,
    );
  }
});

test('computeTetherLoad proves presentationLoad01 is not a break fraction', () => {
  // The phase floors are private literals, but computeTetherLoad is exported, so they pin
  // behaviourally: at ZERO physical strain the presentation load already reads 0.35 / 0.55 / 0.9.
  assert.equal(computeTetherLoad('slack', 0), 0);
  const captureFloor = computeTetherLoad('capture', 0);
  const loadedFloor = computeTetherLoad('loaded', 0);
  const overloadFloor = computeTetherLoad('overload', 0);
  assert.ok(captureFloor > 0 && loadedFloor > captureFloor && overloadFloor > loadedFloor);

  // This is the concrete harm the space split prevents: a line carrying NO tension would classify
  // as a genuinely 'loaded' line if its presentation value were fed to a breakFraction01 ladder.
  assert.equal(bandOf('orbit.load', captureFloor), 'loaded');
  assert.equal(bandOf('orbit.load', overloadFloor), 'overload');

  // And the schema refuses that call outright.
  const rejected = classifyMassline('orbit.load', captureFloor, { space: 'presentationLoad01' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'space-mismatch');
});

// ---------------------------------------------------------------------------------------------
// the unit-space / calibration / domain guard
// ---------------------------------------------------------------------------------------------

test('classifyMassline refuses an undeclared or mismatched quantity space', () => {
  assert.equal(classifyMassline('release.quality', 0.9, {}).reason, 'undeclared-space');
  assert.equal(classifyMassline('release.quality', 0.9, { space: null }).reason, 'undeclared-space');
  assert.equal(classifyMassline('release.quality', 0.9, { space: 'timeS' }).reason, 'space-mismatch');
  assert.equal(classifyMassline('break.overload', 2, { space: 'quality01' }).reason, 'space-mismatch');
  assert.equal(classifyMassline('nope.missing', 1, { space: 'quality01' }).reason, 'unknown-band-set');
  for (const bad of [NaN, Infinity, -Infinity, null, undefined, '0.9']) {
    assert.equal(classifyMassline('release.quality', bad, declFor('release.quality')).reason, 'non-finite-value');
  }
});

test('classifyMassline rejects out-of-domain values and accepts domain edges (P1-2)', () => {
  // quality01 is [0, 1] — bounded both sides.
  const qDecl = declFor('release.quality');
  assert.equal(classifyMassline('release.quality', -1e308, qDecl).reason, 'out-of-domain');
  assert.equal(classifyMassline('release.quality', 1e308, qDecl).reason, 'out-of-domain');
  assert.equal(classifyMassline('release.quality', -0.001, qDecl).reason, 'out-of-domain');
  assert.equal(classifyMassline('release.quality', 1.001, qDecl).reason, 'out-of-domain');
  assert.equal(classifyMassline('release.quality', 0, qDecl).ok, true);
  assert.equal(classifyMassline('release.quality', 1, qDecl).ok, true);

  // overloadRatio is [0, null] — unbounded above; extremes must classify deterministically.
  const oDecl = declFor('break.overload');
  assert.equal(classifyMassline('break.overload', -1e308, oDecl).reason, 'out-of-domain');
  assert.equal(classifyMassline('break.overload', -0.001, oDecl).reason, 'out-of-domain');
  assert.equal(classifyMassline('break.overload', 0, oDecl).ok, true);
  const hugeA = classifyMassline('break.overload', 1e308, oDecl);
  const hugeB = classifyMassline('break.overload', Number.MAX_VALUE, oDecl);
  assert.equal(hugeA.ok, true);
  assert.equal(hugeB.ok, true);
  assert.equal(hugeA.band, hugeB.band);
  assert.equal(hugeA.band, 'catastrophic');

  // breakFraction01 is now unbounded above: overload strain 1.7 is legitimate.
  const loadDecl = declFor('orbit.load');
  assert.equal(classifyMassline('orbit.load', -0.1, loadDecl).reason, 'out-of-domain');
  const strain = classifyMassline('orbit.load', 1.7, loadDecl);
  assert.equal(strain.ok, true);
  assert.equal(strain.band, 'overload');
  // Still rejects negative extreme.
  assert.equal(classifyMassline('orbit.load', -1e308, loadDecl).reason, 'out-of-domain');
  // Extreme positive is in-domain for unbounded breakFraction01.
  const bfHuge = classifyMassline('orbit.load', 1e308, loadDecl);
  assert.equal(bfHuge.ok, true);
  assert.equal(bfHuge.band, 'overload');
});

test('magnitude fixtures for every quantity space used by a band set', () => {
  for (const set of Object.values(MASSLINE_BAND_SETS)) {
    const space = MASSLINE_QUANTITY_SPACES[set.space];
    const decl = declFor(set.id);
    const [lo, hi] = space.domain;

    if (Number.isFinite(lo)) {
      // Below lower bound is out-of-domain.
      assert.equal(
        classifyMassline(set.id, lo - Math.max(1, Math.abs(lo)), decl).reason,
        'out-of-domain',
        `${set.id} below domain lower`,
      );
      // At lower edge is accepted.
      assert.equal(classifyMassline(set.id, lo, decl).ok, true, `${set.id} at lower domain edge`);
    }
    if (Number.isFinite(hi)) {
      assert.equal(
        classifyMassline(set.id, hi + Math.max(1, Math.abs(hi)), decl).reason,
        'out-of-domain',
        `${set.id} above domain upper`,
      );
      assert.equal(classifyMassline(set.id, hi, decl).ok, true, `${set.id} at upper domain edge`);
      // Extreme magnitude out of bound.
      assert.equal(classifyMassline(set.id, 1e308, decl).reason, 'out-of-domain');
      assert.equal(classifyMassline(set.id, -1e308, decl).reason, 'out-of-domain');
    } else {
      // Unbounded above: 1e308 and MAX_VALUE classify, never reject.
      const a = classifyMassline(set.id, 1e308, decl);
      const b = classifyMassline(set.id, Number.MAX_VALUE, decl);
      assert.equal(a.ok, true, `${set.id} 1e308 must classify`);
      assert.equal(b.ok, true, `${set.id} MAX_VALUE must classify`);
      assert.equal(a.band, b.band);
      if (Number.isFinite(lo)) {
        assert.equal(classifyMassline(set.id, -1e308, decl).reason, 'out-of-domain');
      }
    }
  }
});

test('a band set with a calibration refuses a value from a different calibration', () => {
  const risk = declFor('reel.risk');
  assert.equal(risk.calibration, 't01Placeholder');
  assert.equal(classifyMassline('reel.risk', 0.8, { space: 'breakFraction01' }).reason, 'undeclared-calibration');
  assert.equal(
    classifyMassline('reel.risk', 0.8, { space: 'breakFraction01', calibration: 'tetherStandard' }).reason,
    'calibration-mismatch',
  );
  assert.equal(classifyMassline('reel.risk', 0.8, risk).ok, true);
});

test('the denominator collision is real: one tension, two calibrations, opposite bands', () => {
  const cals = MASSLINE_QUANTITY_SPACES.breakFraction01.calibrations;
  const placeholder = cals.t01Placeholder.denominator;   // 6000
  const live = cals.tetherStandard.denominator;          // 1_050_000

  assert.ok(live / placeholder > 100, 'the two denominators must differ by orders of magnitude');

  // One physical tension, expressed in each calibration.
  const tension = 4500;
  const asPlaceholder = tension / placeholder;           // 0.75 -> 'high'
  const asLive = tension / live;                         // ~0.0043 -> 'low'

  assert.equal(bandOf('reel.risk', asPlaceholder), 'high');
  assert.equal(bandOf('reel.risk', asLive), 'low');
  assert.notEqual(bandOf('reel.risk', asPlaceholder), bandOf('reel.risk', asLive));

  const collision = MASSLINE_KNOWN_COLLISIONS.find((c) => c.id === 'denominator-mismatch');
  assert.ok(collision, 'the denominator mismatch must be declared, not merely survivable');
  assert.equal(collision.severity, 'high');
  assert.deepEqual([...collision.affects].sort(), ['orbit.load', 'reel.risk']);
});

// ---------------------------------------------------------------------------------------------
// vocabulary collisions
// ---------------------------------------------------------------------------------------------

test("the reused word 'good' is namespaced, and the two tolerances stay distinct", () => {
  const release = MASSLINE_BAND_SETS['release.quality'].tiers.find((t) => t.id === 'good');
  const snap = MASSLINE_BAND_SETS['snapCatch.quality'].tiers.find((t) => t.id === 'good');
  assert.ok(release && snap);
  assert.notEqual(release.min, snap.min, "the two 'good' thresholds are genuinely different");

  // Same space, so only the namespace separates them — the guard cannot, and must not pretend to.
  assert.equal(MASSLINE_BAND_SETS['release.quality'].space, MASSLINE_BAND_SETS['snapCatch.quality'].space);
  // 0.5 sits between the two 'good' thresholds (release 0.35, snapCatch 0.55), so the SAME number
  // is a 'good' release but a 'rough' catch. That is the collision, stated as a fixture.
  const value = 0.5;
  assert.ok(release.min < value && value < snap.min);
  assert.equal(bandOf('release.quality', value), 'good');
  assert.equal(bandOf('snapCatch.quality', value), 'rough');

  assert.ok(MASSLINE_KNOWN_COLLISIONS.some((c) => c.id === 'good-word-reuse'));
});

test('no band-set id is ambiguous and no term maps to two tolerances under one name', () => {
  const ids = Object.keys(MASSLINE_BAND_SETS);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(id.includes('.'), `band set '${id}' must be namespaced`);

  for (const term of Object.values(MASSLINE_TERMS)) {
    const keys = Object.keys(term.tolerances);
    assert.equal(new Set(keys).size, keys.length, `${term.id} has a duplicate tolerance key`);
  }
});

test('the two phase alphabets differ exactly at capture/taut, and that is declared', () => {
  const tether = new Set(MASSLINE_ALPHABETS.tetherPhase.members);
  const orbit = new Set(MASSLINE_ALPHABETS.orbitLoadBand.members);
  assert.ok(tether.has('capture') && !orbit.has('capture'));
  assert.ok(orbit.has('taut') && !tether.has('taut'));
  assert.deepEqual([...tether].filter((m) => !orbit.has(m)), ['capture']);
  assert.deepEqual([...orbit].filter((m) => !tether.has(m)), ['taut']);
  assert.ok(MASSLINE_KNOWN_COLLISIONS.some((c) => c.id === 'phase-alphabet-split'));

  // 'slack' is in the alphabet but is NOT reachable from the load ladder: it is decided by stretch,
  // not by load fraction. A consumer classifying loadRatio alone can never obtain it.
  const reachable = new Set(MASSLINE_BAND_SETS['orbit.load'].tiers.map((t) => t.id));
  assert.equal(reachable.has('slack'), false);
  for (const band of reachable) assert.ok(orbit.has(band), `'${band}' must be in the orbit alphabet`);
});

// ---------------------------------------------------------------------------------------------
// fail-closed reason coverage
// ---------------------------------------------------------------------------------------------

test('the observation-reason alphabet matches T01 exactly and does not widen it', () => {
  const live = Object.values(MASSLINE_ORBIT_REASONS).filter((r) => r !== null);
  const declared = MASSLINE_ALPHABETS.observationReason.members;
  assert.deepEqual([...declared].sort(), [...live].sort());
  assert.equal(declared.length, live.length, 'the schema must not add reasons T01 cannot produce');
  assert.equal(declared.includes(null), false, 'nominal is the absence of a reason, not a member');
});

test('every terminal cut reason is enumerated', () => {
  assert.deepEqual(MASSLINE_ALPHABETS.cutReason.members, [
    'pilot',
    'snap',
    'catastrophic-overload',
    'integrity-failure',
    'sustained-overload',
  ]);
  // The break term must own them.
  assert.equal(MASSLINE_TERMS.break.owner, 'T10');
});

// ---------------------------------------------------------------------------------------------
// grounded pump gain + escape (P0-1)
// ---------------------------------------------------------------------------------------------

test('pump gain and escape tolerances are grounded (no unresolved placeholders)', () => {
  for (const [termId, key] of [
    ['pumpGain', 'gainBudgetPerStroke'],
    ['pumpGain', 'gainStackingLimit'],
    ['escape', 'responseWindowS'],
    ['escape', 'collisionHorizonS'],
    ['escape', 'escapeRadiusWu'],
    ['escape', 'escapeClosingMaxWu'],
  ]) {
    const raw = MASSLINE_TERMS[termId].tolerances[key];
    assert.equal(isUnresolved(raw), false, `${termId}.${key} must be resolved`);
    assert.ok(Number.isFinite(toleranceOf(termId, key)), `${termId}.${key} must resolve to a number`);
    assert.equal(toleranceOrNull(termId, key), EXPECTED_TOLERANCES[`${termId}.${key}`].value);
  }
  // escapeSuccessThreshold removed: predicate lives in summary/laws text.
  assert.equal('escapeSuccessThreshold' in MASSLINE_TERMS.escape.tolerances, false);
  assert.ok(
    MASSLINE_TERMS.escape.summary.includes('contest predicate')
      || MASSLINE_TERMS.escape.laws?.includes('contest predicate'),
  );
});

test('escape is live with grounded contest copies; pump gain remains partial', () => {
  assert.equal(MASSLINE_TERMS.escape.status, 'live');
  assert.equal(MASSLINE_TERMS.escape.quantitySpace, null);
  assert.deepEqual(MASSLINE_TERMS.escape.bandSets, []);
  for (const tol of Object.values(MASSLINE_TERMS.escape.tolerances)) {
    assert.equal(isUnresolved(tol), false);
    assert.ok(Number.isFinite(tol.value));
  }

  // Pump DETECTION is live; gain ceiling is grounded but status stays partial (T06 owns authored budgets).
  assert.equal(MASSLINE_TERMS.pumpGain.status, 'partial');
  assert.ok(Number.isFinite(toleranceOf('pumpGain', 'pumpArmStrength')));
  assert.ok(Number.isFinite(toleranceOf('pumpGain', 'gainBudgetPerStroke')));
  assert.equal(toleranceOf('pumpGain', 'gainStackingLimit'), 1);

  assert.deepEqual(pendingTerms(), [
    { id: 'pumpGain', status: 'partial', owner: 'T06' },
  ]);
});

test('accessors reject unknown terms and keys rather than defaulting', () => {
  assert.throws(() => toleranceOf('nope', 'x'), /unknown term/);
  assert.throws(() => toleranceOf('break', 'nope'), /unknown tolerance/);
  assert.equal(toleranceOrNull('nope', 'x'), null);
  assert.equal(toleranceOrNull('break', 'nope'), null);
});

// ---------------------------------------------------------------------------------------------
// drift-surface disclosure
// ---------------------------------------------------------------------------------------------

test('every unpinned copy is disclosed, and nothing else claims to be one', () => {
  const disclosed = new Set(
    MASSLINE_UNPINNED_COPIES.map((c) => (c.term ? `${c.term}.${c.tolerance}` : `${c.bandSet}/${c.tier}`)),
  );

  const actual = new Set();
  for (const term of Object.values(MASSLINE_TERMS)) {
    for (const [key, tol] of Object.entries(term.tolerances)) {
      if (!isUnresolved(tol) && tol.derivation === 'copied') actual.add(`${term.id}.${key}`);
    }
  }
  for (const set of Object.values(MASSLINE_BAND_SETS)) {
    for (const tier of set.tiers) {
      if (tier.derivation === 'copied') actual.add(`${set.id}/${tier.id}`);
    }
  }

  assert.deepEqual([...disclosed].sort(), [...actual].sort());
  assert.ok(actual.size > 0, 'the drift surface is non-empty and must stay visible');
  for (const entry of MASSLINE_UNPINNED_COPIES) {
    assert.ok(entry.source && entry.source.length > 0, 'every copy must name where it came from');
  }
});

test('the schema declares a derivation for every value it carries', () => {
  for (const term of Object.values(MASSLINE_TERMS)) {
    for (const [key, tol] of Object.entries(term.tolerances)) {
      if (isUnresolved(tol)) continue;
      assert.ok(DERIVATIONS.includes(tol.derivation), `${term.id}.${key} needs a known derivation`);
      assert.ok(tol.source.length > 0, `${term.id}.${key} needs a source`);
    }
  }
  for (const set of Object.values(MASSLINE_BAND_SETS)) {
    for (const tier of set.tiers) assert.ok(DERIVATIONS.includes(tier.derivation));
  }
});

// ---------------------------------------------------------------------------------------------
// catalog decoupling (P1-4) — builder + local fixture
// ---------------------------------------------------------------------------------------------

test('buildMasslineInvariants accepts a frozen local fixture and validates', () => {
  const doc = buildMasslineInvariants(FIXTURE_CALIBRATION);
  const result = validateMasslineInvariants(doc);
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(doc.terms.pumpGain.tolerances.gainBudgetPerStroke.value, 0.72);
  assert.equal(doc.terms.escape.tolerances.escapeRadiusWu.value, 260);
  assert.equal(doc.quantitySpaces.count.id, 'count');
  assert.equal(doc.quantitySpaces.distanceWu.id, 'distanceWu');
  // Fixture denominators flow into calibrations without live catalog lookup.
  assert.equal(doc.quantitySpaces.breakFraction01.calibrations.tetherStandard.denominator, 1_050_000);
  assert.equal(doc.quantitySpaces.breakFraction01.calibrations.attachmentMassline.denominator, 10_250);
});

test('live document integration smoke: shape only (no catalog ID / balance pins)', () => {
  // Shape honesty for the production document. Does NOT pin catalog IDs or balance numbers.
  const result = validateMasslineInvariants(MASSLINE_INVARIANTS);
  assert.equal(result.ok, true, result.errors.join('; '));
  const cals = MASSLINE_QUANTITY_SPACES.breakFraction01.calibrations;
  for (const cal of Object.values(cals)) {
    assert.ok(Number.isFinite(cal.denominator) && cal.denominator > 0);
  }
  for (const term of Object.values(MASSLINE_TERMS)) {
    for (const tol of Object.values(term.tolerances)) {
      if (isUnresolved(tol)) continue;
      assert.ok(Number.isFinite(tol.value));
    }
  }
  assert.deepEqual(Object.keys(MASSLINE_TERMS), [...MASSLINE_REQUIRED_TERMS]);
  assert.deepEqual(
    Object.keys(MASSLINE_INVARIANTS).sort(),
    [...MASSLINE_REQUIRED_TOP_LEVEL_KEYS].sort(),
  );
});

// ---------------------------------------------------------------------------------------------
// validator: degenerate and malformed documents
// ---------------------------------------------------------------------------------------------

test('the validator rejects non-documents', () => {
  for (const bad of [null, undefined, 0, '', 'doc', [], true]) {
    const result = validateMasslineInvariants(bad);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
  }
});

test('the validator rejects a bad schema id or version', () => {
  for (const mutate of [
    (d) => { d.schema = 'spaceface.somethingElse.v1'; },
    (d) => { delete d.schema; },
    (d) => { d.version = 0; },
    (d) => { d.version = 1.5; },
    (d) => { d.version = 'one'; },
  ]) {
    const doc = clone(MASSLINE_INVARIANTS);
    mutate(doc);
    assert.equal(validateMasslineInvariants(doc).ok, false);
  }
});

test('the validator rejects non-finite, negative, and zero tolerance values', () => {
  for (const bad of [Number.NaN, Infinity, -Infinity, null, undefined, 'x', {}]) {
    const doc = clone(MASSLINE_INVARIANTS);
    doc.terms.releaseQuality.tolerances.usefulLoad.value = bad;
    const result = validateMasslineInvariants(doc);
    assert.equal(result.ok, false, `value ${String(bad)} must be rejected`);
  }
  // Out of the declared breakFraction01 domain lower bound.
  for (const bad of [-0.5]) {
    const doc = clone(MASSLINE_INVARIANTS);
    doc.terms.releaseQuality.tolerances.usefulLoad.value = bad;
    assert.equal(validateMasslineInvariants(doc).ok, false, `value ${bad} escapes the space domain`);
  }
  // quality01 is still [0,1]; 1.5 is out of domain for adviseScore.
  {
    const doc = clone(MASSLINE_INVARIANTS);
    doc.terms.releaseQuality.tolerances.adviseScore.value = 1.5;
    assert.equal(validateMasslineInvariants(doc).ok, false, 'value 1.5 escapes quality01 domain');
  }
  // A zero denominator would make every fraction infinite.
  const doc = clone(MASSLINE_INVARIANTS);
  doc.quantitySpaces.breakFraction01.calibrations.tetherStandard.denominator = 0;
  assert.equal(validateMasslineInvariants(doc).ok, false);
});

test('the validator rejects out-of-order bands', () => {
  // clean > razor: the ladder inverts.
  const inverted = clone(MASSLINE_INVARIANTS);
  inverted.bandSets['release.quality'].tiers[1].min = 0.95;
  assert.equal(validateMasslineInvariants(inverted).ok, false);

  // medium > high in the risk ladder.
  const risk = clone(MASSLINE_INVARIANTS);
  risk.bandSets['reel.risk'].tiers[1].min = 0.9;
  assert.equal(validateMasslineInvariants(risk).ok, false);

  // Equal thresholds are not an ordering either: the lower tier becomes unreachable.
  const tied = clone(MASSLINE_INVARIANTS);
  tied.bandSets['release.quality'].tiers[1].min = tied.bandSets['release.quality'].tiers[0].min;
  assert.equal(validateMasslineInvariants(tied).ok, false);
});

test('the validator rejects a missing or misplaced floor tier', () => {
  const noFloor = clone(MASSLINE_INVARIANTS);
  noFloor.bandSets['release.quality'].tiers[3].min = 0.1;
  assert.equal(validateMasslineInvariants(noFloor).ok, false);

  const earlyFloor = clone(MASSLINE_INVARIANTS);
  earlyFloor.bandSets['release.quality'].tiers[1].min = null;
  assert.equal(validateMasslineInvariants(earlyFloor).ok, false);

  const tooFew = clone(MASSLINE_INVARIANTS);
  tooFew.bandSets['release.quality'].tiers = [{ id: 'only', min: null, derivation: 'structural' }];
  assert.equal(validateMasslineInvariants(tooFew).ok, false);
});

test('the validator rejects duplicate and empty names', () => {
  const dupTier = clone(MASSLINE_INVARIANTS);
  dupTier.bandSets['release.quality'].tiers[1].id = 'razor';
  assert.equal(validateMasslineInvariants(dupTier).ok, false);

  const emptyTier = clone(MASSLINE_INVARIANTS);
  emptyTier.bandSets['release.quality'].tiers[1].id = '';
  assert.equal(validateMasslineInvariants(emptyTier).ok, false);

  const dupMember = clone(MASSLINE_INVARIANTS);
  dupMember.alphabets.cutReason.members = ['pilot', 'pilot'];
  assert.equal(validateMasslineInvariants(dupMember).ok, false);

  const emptyAlphabet = clone(MASSLINE_INVARIANTS);
  emptyAlphabet.alphabets.cutReason.members = [];
  assert.equal(validateMasslineInvariants(emptyAlphabet).ok, false);

  const mismatchedKey = clone(MASSLINE_INVARIANTS);
  mismatchedKey.terms.break.id = 'notBreak';
  assert.equal(validateMasslineInvariants(mismatchedKey).ok, false);
});

test('the validator rejects dangling space, calibration, and band-set references', () => {
  const badSpace = clone(MASSLINE_INVARIANTS);
  badSpace.bandSets['release.quality'].space = 'noSuchSpace';
  assert.equal(validateMasslineInvariants(badSpace).ok, false);

  const badCal = clone(MASSLINE_INVARIANTS);
  badCal.bandSets['reel.risk'].calibration = 'noSuchCalibration';
  assert.equal(validateMasslineInvariants(badCal).ok, false);

  const badRef = clone(MASSLINE_INVARIANTS);
  badRef.terms.break.bandSets = ['release.quality'];
  assert.equal(validateMasslineInvariants(badRef).ok, false, 'a band set must point back at its term');

  const missingRef = clone(MASSLINE_INVARIANTS);
  missingRef.terms.break.bandSets = ['nope.missing'];
  assert.equal(validateMasslineInvariants(missingRef).ok, false);

  const badTolSpace = clone(MASSLINE_INVARIANTS);
  badTolSpace.terms.break.tolerances.catastrophicRatio.space = 'noSuchSpace';
  assert.equal(validateMasslineInvariants(badTolSpace).ok, false);
});

test('the validator enforces exact v1 term set and top-level keys (P1-3)', () => {
  // Deletion of terms.escape -> not ok
  const noEscape = clone(MASSLINE_INVARIANTS);
  delete noEscape.terms.escape;
  {
    const r = validateMasslineInvariants(noEscape);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('escape')));
  }

  // Extra term -> not ok
  const extra = clone(MASSLINE_INVARIANTS);
  extra.terms.bonus = {
    id: 'bonus',
    status: 'live',
    owner: 'T99',
    quantitySpace: null,
    bandSets: [],
    summary: 'An extra term that must not be accepted by the v1 required set.',
    sources: [{ path: 'x', symbol: 'y', derivation: 'copied' }],
    tolerances: {
      x: { value: 1, space: 'count', derivation: 'structural', source: 'fixture' },
    },
  };
  {
    const r = validateMasslineInvariants(extra);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('bonus') || e.includes('unexpected term')));
  }

  // Band rename (dangling reference) -> not ok
  const renamed = clone(MASSLINE_INVARIANTS);
  renamed.bandSets['release.qualityRenamed'] = renamed.bandSets['release.quality'];
  renamed.bandSets['release.qualityRenamed'].id = 'release.qualityRenamed';
  delete renamed.bandSets['release.quality'];
  renamed.terms.releaseQuality.bandSets = ['release.qualityRenamed'];
  // Original band set missing; also unreferenced check may fire depending on structure.
  {
    const r = validateMasslineInvariants(renamed);
    // Renaming is ok IF both directions update — so rename without updating term refs:
    const dangling = clone(MASSLINE_INVARIANTS);
    dangling.bandSets['release.quality'].id = 'release.quality.moved';
    // id mismatch is already an error
    assert.equal(validateMasslineInvariants(dangling).ok, false);
    // And pure rename of key without term update:
    const keyRename = clone(MASSLINE_INVARIANTS);
    keyRename.bandSets['release.quality.moved'] = {
      ...keyRename.bandSets['release.quality'],
      id: 'release.quality.moved',
    };
    delete keyRename.bandSets['release.quality'];
    // term still points at old name
    const r2 = validateMasslineInvariants(keyRename);
    assert.equal(r2.ok, false);
    assert.ok(
      r2.errors.some((e) => e.includes('release.quality') || e.includes('not referenced')),
      r2.errors.join('; '),
    );
  }

  // Top-level section deletion -> not ok
  for (const key of ['collisions', 'unpinnedCopies', 'alphabets', 'bandSets']) {
    const doc = clone(MASSLINE_INVARIANTS);
    delete doc[key];
    const r = validateMasslineInvariants(doc);
    assert.equal(r.ok, false, `missing ${key} must fail`);
    assert.ok(r.errors.some((e) => e.includes(key)), r.errors.join('; '));
  }

  // Canonical document -> ok
  assert.equal(validateMasslineInvariants(MASSLINE_INVARIANTS).ok, true);
});

test('the validator rejects a provisional term that smuggles in a number', () => {
  const doc = clone(MASSLINE_INVARIANTS);
  // Inject a provisional term status onto a live term that already has resolved numbers.
  doc.terms.escape.status = 'provisional';
  const result = validateMasslineInvariants(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('provisional')));
});

test('the validator rejects an unresolved tolerance with no owner, note, or a stray value', () => {
  for (const mutate of [
    (d) => {
      d.terms.pumpGain.tolerances.gainBudgetPerStroke = { unresolved: true, note: 'x' };
    },
    (d) => {
      d.terms.pumpGain.tolerances.gainBudgetPerStroke = {
        unresolved: true, owner: 'somebody', note: 'x',
      };
    },
    (d) => {
      d.terms.pumpGain.tolerances.gainBudgetPerStroke = { unresolved: true, owner: 'T06' };
    },
    (d) => {
      d.terms.pumpGain.tolerances.gainBudgetPerStroke = {
        unresolved: true, owner: 'T06', note: 'x', value: 0,
      };
    },
  ]) {
    const doc = clone(MASSLINE_INVARIANTS);
    mutate(doc);
    assert.equal(validateMasslineInvariants(doc).ok, false);
  }
});

test('the validator rejects bad statuses, owners, derivations, and empty sources', () => {
  for (const mutate of [
    (d) => { d.terms.break.status = 'mostly'; },
    (d) => { d.terms.break.owner = 'the physics team'; },
    (d) => { d.terms.break.summary = ''; },
    (d) => { d.terms.break.sources = []; },
    (d) => { d.terms.break.sources[0].derivation = 'vibes'; },
    (d) => { d.terms.break.sources[0].path = ''; },
    (d) => { d.terms.break.tolerances.catastrophicRatio.derivation = 'vibes'; },
    (d) => { d.terms.break.tolerances.catastrophicRatio.source = ''; },
    (d) => { d.bandSets['release.quality'].edge = 'exclusive-lower'; },
    (d) => { d.bandSets['release.quality'].tiers[0].derivation = 'vibes'; },
    (d) => { d.quantitySpaces.quality01.domain = [1, 0]; },
    (d) => { d.quantitySpaces.quality01.domain = [0, 1, 2]; },
    (d) => { d.quantitySpaces.quality01.unit = ''; },
  ]) {
    const doc = clone(MASSLINE_INVARIANTS);
    mutate(doc);
    assert.equal(validateMasslineInvariants(doc).ok, false);
  }
});

test('a live term that resolves nothing is rejected as mislabelled', () => {
  const doc = clone(MASSLINE_INVARIANTS);
  doc.terms.stableOrbit.tolerances = {};
  assert.equal(validateMasslineInvariants(doc).ok, false);
});

// ---------------------------------------------------------------------------------------------
// coverage of the six T02 terms
// ---------------------------------------------------------------------------------------------

test('all six T02 vocabulary terms are declared with an owner and a summary', () => {
  assert.deepEqual(Object.keys(MASSLINE_TERMS), [
    'capture',
    'stableOrbit',
    'pumpGain',
    'releaseQuality',
    'break',
    'escape',
  ]);
  for (const term of Object.values(MASSLINE_TERMS)) {
    assert.ok(term.summary.length > 40, `${term.id} needs a real summary`);
    assert.match(term.owner, /^[A-Z]\d{2}$/);
    assert.ok(Array.isArray(term.sources) && term.sources.length > 0);
  }
});

test('every declared collision names what it affects and who owns it', () => {
  assert.ok(MASSLINE_KNOWN_COLLISIONS.length >= 5);
  const ids = MASSLINE_KNOWN_COLLISIONS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  const known = new Set([...Object.keys(MASSLINE_BAND_SETS), ...Object.keys(MASSLINE_ALPHABETS)]);
  for (const collision of MASSLINE_KNOWN_COLLISIONS) {
    assert.ok(['high', 'medium', 'low'].includes(collision.severity));
    assert.match(collision.owner, /^[A-Z]\d{2}$/);
    assert.ok(collision.affects.length > 0);
    for (const ref of collision.affects) {
      assert.ok(known.has(ref), `collision '${collision.id}' references unknown '${ref}'`);
    }
  }
});

test('new quantity spaces count and distanceWu are declared', () => {
  assert.equal(MASSLINE_QUANTITY_SPACES.count.unit, 'count');
  assert.deepEqual(MASSLINE_QUANTITY_SPACES.count.domain, [0, null]);
  assert.equal(MASSLINE_QUANTITY_SPACES.distanceWu.unit, 'world-units');
  assert.deepEqual(MASSLINE_QUANTITY_SPACES.distanceWu.domain, [0, null]);
});
