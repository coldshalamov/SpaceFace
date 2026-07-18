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
  MASSLINE_TERMS,
  MASSLINE_UNPINNED_COPIES,
  classifyMassline,
  isUnresolved,
  pendingTerms,
  toleranceOf,
  toleranceOrNull,
  validateMasslineInvariants,
} from '../src/combat/masslineInvariants.js';

// Live sources, imported so the "imported" claims are checked against the real thing.
import { MASSLINE_ORBIT_DEFAULTS, MASSLINE_ORBIT_REASONS } from '../src/combat/masslineOrbitTelemetry.js';
import { DEFAULT_MASSLINE_DEF } from '../src/core/constraints/masslineController.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { computeTetherLoad, rateRelease } from '../src/systems/tetherGameplay.js';

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

const TETHER_STANDARD = ATTACHMENT_DEFS.find((d) => d.id === 'tether_standard');
const ATTACHMENT_MASSLINE = ATTACHMENT_DEFS.find((d) => d.id === 'attachment_massline');

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
// imported tolerances are genuinely single-sourced
// ---------------------------------------------------------------------------------------------

test('every tolerance marked imported matches its live exported source', () => {
  // Spot-check the load-bearing ones against the real modules, not against copies.
  assert.equal(toleranceOf('stableOrbit', 'tangentQualityMin'), MASSLINE_ORBIT_DEFAULTS.stableTangentQuality);
  assert.equal(toleranceOf('stableOrbit', 'tensionBalanceAbsMax'), MASSLINE_ORBIT_DEFAULTS.stableTensionBalance);
  assert.equal(toleranceOf('stableOrbit', 'demandEpsilon'), MASSLINE_ORBIT_DEFAULTS.demandEpsilon);

  assert.equal(toleranceOf('releaseQuality', 'usefulLoad'), MASSLINE_ORBIT_DEFAULTS.releaseUsefulLoad);
  assert.equal(toleranceOf('releaseQuality', 'overloadKnee'), MASSLINE_ORBIT_DEFAULTS.releaseOverloadKnee);
  assert.equal(toleranceOf('releaseQuality', 'overloadSpan'), MASSLINE_ORBIT_DEFAULTS.releaseOverloadSpan);
  assert.equal(toleranceOf('releaseQuality', 'adviseScore'), MASSLINE_ORBIT_DEFAULTS.releaseAdviseScore);

  assert.equal(toleranceOf('break', 'catastrophicRatio'), DEFAULT_MASSLINE_DEF.catastrophicRatio);
  assert.equal(toleranceOf('break', 'overloadGraceDefaultS'), DEFAULT_MASSLINE_DEF.overloadGraceS);
  assert.equal(toleranceOf('break', 'overloadGraceTetherStandardS'), TETHER_STANDARD.massline.overloadGraceS);

  assert.equal(toleranceOf('capture', 'captureWindowStandardS'), TETHER_STANDARD.spring.captureS);
  assert.equal(toleranceOf('capture', 'captureWindowMasslineS'), ATTACHMENT_MASSLINE.spring.captureS);
  assert.equal(toleranceOf('capture', 'stretchEpsilonWu'), MASSLINE_ORBIT_DEFAULTS.slackEpsilon);

  assert.equal(toleranceOf('pumpGain', 'winchEfficiency'), DEFAULT_MASSLINE_DEF.efficiency);
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

test('the live calibration denominators come from the defs, not from T01 placeholders', () => {
  const cals = MASSLINE_QUANTITY_SPACES.breakFraction01.calibrations;
  assert.equal(cals.tetherStandard.denominator, TETHER_STANDARD.breakTension);
  assert.equal(cals.attachmentMassline.denominator, ATTACHMENT_MASSLINE.break.maxTension);
  assert.equal(cals.t01Placeholder.denominator, MASSLINE_ORBIT_DEFAULTS.breakTension);

  // The placeholder must be labelled as such so it can never be laundered into balance truth.
  assert.equal(cals.t01Placeholder.status, 'placeholder');
  assert.equal(cals.tetherStandard.status, 'live');
  assert.equal(cals.attachmentMassline.status, 'live');
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

// The fixture above probes only AT each boundary, and the inclusivity sweep before it derives its
// probe FROM the tier it is checking. Neither can catch a threshold that MOVES DOWN: classification
// is inclusive-lower, so lowering snapCatch.quality/clean from 0.85 to 0.80 still classifies 0.85 as
// 'clean' and still passes a self-derived edge probe. T02's deliverable IS the threshold vocabulary,
// so every declared boundary is pinned here from BOTH sides.
//
// The BOUNDS below are hard-coded deliberately. An independent copy living in the test file is what
// makes this a pin at all: editing a threshold in the vocabulary cannot keep this table in sync, so
// the edit surfaces. The expected TIER NAMES, by contrast, are read positionally out of the
// vocabulary (tiers[i] / tiers[i + 1]) rather than by matching a probe value back to a `min` —
// value-matching would re-introduce exactly the self-reference this test exists to remove.
const DECLARED_BOUNDS = {
  'release.quality': [0.85, 0.65, 0.35],
  'snapCatch.quality': [0.85, 0.55],
  'orbit.load': [0.75, 0.25],
  'reel.risk': [0.75, 0.45],
  'break.overload': [1.75, 1],
};

test('every declared threshold is pinned from both sides, not merely met at the bound', () => {
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
      // A hair BELOW it must fall through. Catches a threshold LOWERED — the half that was missing.
      assert.equal(
        bandOf(setId, bound - EPS),
        lower,
        `${setId} just below ${bound} must be '${lower}': the declared threshold has moved`,
      );
    }
  }
});

test('band ordering is monotone under a sweep, not merely ordered in the table', () => {
  for (const set of Object.values(MASSLINE_BAND_SETS)) {
    const decl = declFor(set.id);
    const [lo, hi] = set.space === 'overloadRatio' ? [0, 3] : [0, 1];
    let previousIndex = set.tiers.length;
    for (let step = 0; step <= 300; step += 1) {
      const value = lo + ((hi - lo) * step) / 300;
      const result = classifyMassline(set.id, value, decl);
      assert.equal(result.ok, true);
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
// the unit-space / calibration guard
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
// provisional / forward-referenced terms
// ---------------------------------------------------------------------------------------------

test('pump gain and escape are unresolved with a named owner, never a silent zero', () => {
  for (const [termId, key, owner] of [
    ['pumpGain', 'gainBudgetPerStroke', 'T06'],
    ['pumpGain', 'gainStackingLimit', 'T06'],
    ['escape', 'responseWindowS', 'T09'],
    ['escape', 'contestRadiusWu', 'T09'],
    ['escape', 'escapeSuccessThreshold', 'T10'],
  ]) {
    const raw = MASSLINE_TERMS[termId].tolerances[key];
    assert.equal(isUnresolved(raw), true, `${termId}.${key} must be unresolved`);
    assert.equal(raw.owner, owner);
    assert.equal('value' in raw, false, 'an unresolved tolerance must carry no value at all');

    assert.throws(() => toleranceOf(termId, key), /unresolved/, `${termId}.${key} must refuse to resolve`);
    assert.equal(toleranceOrNull(termId, key), null);
    assert.notEqual(toleranceOrNull(termId, key), 0, 'null is not zero: a zero would be an invented threshold');
  }
});

test('escape is fully provisional and pump gain is only partly live', () => {
  assert.equal(MASSLINE_TERMS.escape.status, 'provisional');
  assert.equal(MASSLINE_TERMS.escape.quantitySpace, null);
  assert.deepEqual(MASSLINE_TERMS.escape.bandSets, []);
  for (const tol of Object.values(MASSLINE_TERMS.escape.tolerances)) {
    assert.equal(isUnresolved(tol), true, 'a provisional term must not smuggle in a number');
  }

  // Pump DETECTION is live; pump GAIN is not.
  assert.equal(MASSLINE_TERMS.pumpGain.status, 'partial');
  assert.ok(Number.isFinite(toleranceOf('pumpGain', 'pumpArmStrength')));
  assert.equal(toleranceOrNull('pumpGain', 'gainBudgetPerStroke'), null);

  assert.deepEqual(pendingTerms(), [
    { id: 'pumpGain', status: 'partial', owner: 'T06' },
    { id: 'escape', status: 'provisional', owner: 'T09' },
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
  // Out of the declared 0..1 domain, in both directions.
  for (const bad of [-0.5, 1.5]) {
    const doc = clone(MASSLINE_INVARIANTS);
    doc.terms.releaseQuality.tolerances.usefulLoad.value = bad;
    assert.equal(validateMasslineInvariants(doc).ok, false, `value ${bad} escapes the space domain`);
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

test('the validator rejects a provisional term that smuggles in a number', () => {
  const doc = clone(MASSLINE_INVARIANTS);
  doc.terms.escape.tolerances.responseWindowS = {
    value: 2.5,
    space: 'timeS',
    derivation: 'copied',
    source: 'invented from prose',
  };
  const result = validateMasslineInvariants(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('provisional')));
});

test('the validator rejects an unresolved tolerance with no owner, note, or a stray value', () => {
  for (const mutate of [
    (d) => { delete d.terms.escape.tolerances.responseWindowS.owner; },
    (d) => { d.terms.escape.tolerances.responseWindowS.owner = 'somebody'; },
    (d) => { delete d.terms.escape.tolerances.responseWindowS.note; },
    (d) => { d.terms.escape.tolerances.responseWindowS.value = 0; },
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
