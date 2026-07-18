// Massline invariant vocabulary and tolerances (packet T02).
//
// PURE CONTRACT MODULE. Declares — machine-readably — what the massline system MEANS by capture,
// stable orbit, pump gain, release quality, break, and escape: the name, the quantity space, the
// tolerance values, the band ordering, the edge inclusivity, and which live constant is the source
// of truth for each number.
//
// It computes and observes. It writes no state, emits no events, imports no Three.js, calls no
// Math.random / Date.now, and holds no mutable module state. Same input -> byte-identical output.
//
// ---------------------------------------------------------------------------------------------
// WHY THIS MODULE EXISTS: the denominator collision
//
// Three different quantities are compared against the SAME 0..1 band literals (0.45 / 0.65 / 0.75
// / 0.85) as if they were interchangeable. They are not:
//
//   T01 loadRatio  = clamp01(lineStiffness * stretch / breakTension) with the module's PLACEHOLDER
//                    defaults lineStiffness 120 / breakTension 6000.
//                    -> src/combat/masslineOrbitTelemetry.js
//   tether.strain  = attachment.lastTension / breakTension, where the LIVE tether_standard
//                    breakTension is 1_050_000.
//                    -> src/systems/tetherGameplay.js
//   tether.load    = presentation load with per-phase FLOORS (slack 0 / capture 0.35 / loaded 0.55
//                    / overload 0.9). Not a physical ratio at all.
//                    -> src/systems/tetherGameplay.js computeTetherLoad
//
// The first two are both "fraction of the break budget", i.e. the same DIMENSIONAL space, but they
// are calibrated against denominators that differ by 175x. A value of 0.5 does not mean the same
// physical tension in each. Nothing in the codebase asserts that a band is only ever applied to a
// value from the calibration it was tuned against. Naming that is this module's main job; see
// MASSLINE_KNOWN_COLLISIONS and the `calibration` guard in classifyMassline().
//
// ---------------------------------------------------------------------------------------------
// DERIVATION HONESTY (read this before trusting any number below)
//
// Every tolerance carries a `derivation` saying how it got here. This distinction is the integrity
// of the whole module, because two of these classes CANNOT detect drift:
//
//   'imported'    — the value is read at import time from the live exported source. Schema and
//                   source cannot diverge; there is exactly one copy.
//   'derived'     — the value is a live constant applied through a named physical or control law
//                   (e.g. conservation through the winch). Schema and source share a number, but
//                   the MEANING is the law; tests pin the literal independently.
//   'behavioural' — the number is a private literal, but the function that applies it IS exported,
//                   so the test calls the real function at the band edge and asserts the
//                   classification flips. Drift in the source fails the test.
//   'structural'  — not a tuned value. It falls out of a definition (e.g. an overload RATIO crosses
//                   at exactly 1.0 because that is what "ratio to budget" means).
//   'copied'      — an UNPINNED COPY of a module-private literal. If the source changes, this
//                   diverges SILENTLY and no test will catch it. These are listed explicitly in
//                   MASSLINE_UNPINNED_COPIES so the drift surface is at least named and small.
//
// A schema that re-declared everything would be a fourth copy of constants that already exist in
// three places, which makes drift worse rather than better. So: import wherever an export exists,
// pin behaviourally where a function exists, and copy only where neither does — under disclosure.
//
// ---------------------------------------------------------------------------------------------
// GROUNDING NOTES (pump gain + escape)
//
// Pump GAIN is not yet a live measured quantity (T06 owns authored stroke budgets), but the
// physical ceiling is: conservation through the winch says a stroke cannot bank more swing energy
// than the winch's own efficiency of what the player paid. The stacking law is already live as the
// REEL_PUMP_ARM / REEL_PUMP_RESET debounce (one stroke per arm->reset cycle).
//
// Escape tolerances are COPIES of the live masslineThreats contest predicate numbers. T09 may
// refine the mechanics; the numbers here are live copies, not inventions. Terminal-reason
// consistency for "escaped" remains T10's job.

import { MASSLINE_ORBIT_DEFAULTS } from './masslineOrbitTelemetry.js';
import { DEFAULT_MASSLINE_DEF } from '../core/constraints/masslineController.js';
import { ATTACHMENT_DEFS } from '../data/combatDefs.js';

export const MASSLINE_INVARIANTS_SCHEMA = 'spaceface.masslineInvariants.v1';
export const MASSLINE_INVARIANTS_VERSION = 1;

/** Derivation classes, ordered from strongest drift protection to weakest. */
export const DERIVATIONS = Object.freeze([
  'imported',
  'derived',
  'behavioural',
  'structural',
  'copied',
]);

/** Packet ids allowed to own an unresolved tolerance. */
const OWNER_PATTERN = /^[A-Z]\d{2}$/;

/** Exact v1 term set. Missing or extra is a validation error. */
export const MASSLINE_REQUIRED_TERMS = Object.freeze([
  'capture',
  'stableOrbit',
  'pumpGain',
  'releaseQuality',
  'break',
  'escape',
]);

/** Exact v1 top-level document keys. */
export const MASSLINE_REQUIRED_TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'version',
  'quantitySpaces',
  'alphabets',
  'bandSets',
  'terms',
  'collisions',
  'unpinnedCopies',
]);

// ---------------------------------------------------------------------------------------------
// live source lookups (imported, never copied) — only for the production calibrationSource
// ---------------------------------------------------------------------------------------------

function attachmentDef(id) {
  const def = ATTACHMENT_DEFS.find((d) => d && d.id === id);
  if (!def) throw new Error(`masslineInvariants: ATTACHMENT_DEFS is missing '${id}'`);
  return def;
}

/**
 * Live calibration drawn from the content catalog + exported sim defaults.
 * Contract tests MUST NOT import this; they pass a frozen local fixture into the builder.
 */
export function liveCalibrationSource() {
  const tetherStandard = attachmentDef('tether_standard');
  const attachmentMassline = attachmentDef('attachment_massline');
  const D = MASSLINE_ORBIT_DEFAULTS;
  return {
    orbit: {
      breakTension: D.breakTension,
      slackEpsilon: D.slackEpsilon,
      loadedLoadRatio: D.loadedLoadRatio,
      overloadLoadRatio: D.overloadLoadRatio,
      stableTangentQuality: D.stableTangentQuality,
      stableTensionBalance: D.stableTensionBalance,
      reelRiskHighLoad: D.reelRiskHighLoad,
      reelRiskMediumLoad: D.reelRiskMediumLoad,
      reelIntentDeadzone: D.reelIntentDeadzone,
      releaseUsefulLoad: D.releaseUsefulLoad,
      releaseOverloadKnee: D.releaseOverloadKnee,
      releaseOverloadSpan: D.releaseOverloadSpan,
      releaseRazorScore: D.releaseRazorScore,
      releaseCleanScore: D.releaseCleanScore,
      releaseGoodScore: D.releaseGoodScore,
      releaseAdviseScore: D.releaseAdviseScore,
      demandEpsilon: D.demandEpsilon,
    },
    masslineDef: {
      efficiency: DEFAULT_MASSLINE_DEF.efficiency,
      catastrophicRatio: DEFAULT_MASSLINE_DEF.catastrophicRatio,
      overloadGraceS: DEFAULT_MASSLINE_DEF.overloadGraceS,
    },
    tetherStandard: {
      breakTension: tetherStandard.breakTension,
      captureS: tetherStandard.spring.captureS,
      overloadGraceS: tetherStandard.massline.overloadGraceS,
    },
    attachmentMassline: {
      maxTension: attachmentMassline.break.maxTension,
      captureS: attachmentMassline.spring.captureS,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// unresolved tolerances
// ---------------------------------------------------------------------------------------------

/**
 * Build an explicitly-unresolved tolerance. JSON-serializable so the schema stays machine-readable,
 * and structurally distinct from a number so no consumer can accidentally treat it as one.
 */
function unresolved(owner, note) {
  return { unresolved: true, owner, note };
}

/** True for the unresolved descriptor shape. */
export function isUnresolved(value) {
  return !!value && typeof value === 'object' && value.unresolved === true;
}

// ---------------------------------------------------------------------------------------------
// pure document builder
//
// Contract tests exercise this with a frozen LOCAL fixture so concurrent content-lane balance
// edits cannot break the pure-contract suite. The live document is built once at import from
// liveCalibrationSource() and re-exported as MASSLINE_INVARIANTS / MASSLINE_TERMS / …
// ---------------------------------------------------------------------------------------------

/**
 * Build a complete massline-invariants document from a self-contained calibration source.
 *
 * @param {object} cal calibration numbers (orbit defaults, massline def, attachment denominators)
 * @returns {object} deep-frozen document matching MASSLINE_INVARIANTS shape
 */
export function buildMasslineInvariants(cal) {
  if (!cal || typeof cal !== 'object') {
    throw new Error('masslineInvariants: calibrationSource must be a plain object');
  }
  const D = cal.orbit;
  const M = cal.masslineDef;
  const TS = cal.tetherStandard;
  const AM = cal.attachmentMassline;
  for (const [name, obj] of [
    ['orbit', D],
    ['masslineDef', M],
    ['tetherStandard', TS],
    ['attachmentMassline', AM],
  ]) {
    if (!obj || typeof obj !== 'object') {
      throw new Error(`masslineInvariants: calibrationSource.${name} is required`);
    }
  }

  const quantitySpaces = {
    breakFraction01: {
      id: 'breakFraction01',
      unit: 'ratio',
      domain: [0, null],
      description:
        'Fraction of the line break budget: tension / breakTension. Dimensionless, but only '
        + 'meaningful alongside the calibration that supplies the denominator. The domain is '
        + 'UNBOUNDED above: the T01 telemetry path clamps loadRatio to 0..1, but the live '
        + 'tetherGameplay strain path (Math.max(0, lastTension / threshold)) does NOT clamp — '
        + 'overload strain legitimately exceeds 1. Clamping is a PATH property, not a space '
        + 'property; see each calibration\'s `clamped` flag.',
      calibrations: {
        t01Placeholder: {
          id: 't01Placeholder',
          denominator: D.breakTension,
          status: 'placeholder',
          clamped: true,
          source: 'src/combat/masslineOrbitTelemetry.js MASSLINE_ORBIT_DEFAULTS.breakTension',
          note:
            'Self-documented placeholder ("pass the def value"), NOT balance truth. T01 clamps '
            + 'loadRatio to 0..1 on this path.',
        },
        tetherStandard: {
          id: 'tetherStandard',
          denominator: TS.breakTension,
          status: 'live',
          clamped: false,
          source: "src/data/combatDefs.js ATTACHMENT_DEFS['tether_standard'].breakTension",
          note:
            'The denominator tetherGameplay actually divides by to produce tether.strain. Unclamped: '
            + 'overload strain may exceed 1.',
        },
        attachmentMassline: {
          id: 'attachmentMassline',
          denominator: AM.maxTension,
          status: 'live',
          clamped: false,
          source: "src/data/combatDefs.js ATTACHMENT_DEFS['attachment_massline'].break.maxTension",
          note:
            'The short massline attachment carries a far smaller budget than the standard tether. '
            + 'Unclamped strain path, same as tetherStandard.',
        },
      },
    },
    presentationLoad01: {
      id: 'presentationLoad01',
      unit: 'ratio',
      domain: [0, 1],
      calibrations: {},
      description:
        'HUD/VFX "how worked does the line look" value. Carries per-phase FLOORS, so it is NOT a '
        + 'physical break fraction and must never be fed to a breakFraction01 band set.',
    },
    quality01: {
      id: 'quality01',
      unit: 'ratio',
      domain: [0, 1],
      calibrations: {},
      description:
        'Dimensionless conversion/goodness fraction: tangent quality, release score, snap-catch '
        + 'quality. 0 is worst, 1 is best.',
    },
    overloadRatio: {
      id: 'overloadRatio',
      unit: 'ratio',
      domain: [0, null],
      calibrations: {},
      description:
        'max(tensionRatio, impulseRatio, yankRatio) against the def budgets. UNBOUNDED above: 1.0 is '
        + 'the budget edge by definition, not a tuned threshold.',
    },
    balanceSigned: {
      id: 'balanceSigned',
      unit: 'ratio',
      domain: [null, null],
      calibrations: {},
      description:
        '(tension - centripetalDemand) / centripetalDemand. Zero-centred and signed: positive means '
        + 'the line over-pulls (orbit tightens), negative means it under-pulls (orbit widens).',
    },
    tensionForce: {
      id: 'tensionForce',
      unit: 'sim-force',
      domain: [0, null],
      calibrations: {},
      description:
        'An ABSOLUTE force in the simulation\'s own force units (mass * length / time^2), not a '
        + 'fraction of anything: line tension and centripetal demand before either is divided by a '
        + 'break budget. Deliberately distinct from breakFraction01 — dividing by a denominator is '
        + 'what turns this space into that one, and the denominator is the thing that collides.',
    },
    timeS: {
      id: 'timeS',
      unit: 'seconds',
      domain: [0, null],
      calibrations: {},
      description: 'Simulation seconds. Sourced from state.simTime, never wall clock.',
    },
    speedWu: {
      id: 'speedWu',
      unit: 'world-units-per-second',
      domain: [0, null],
      calibrations: {},
      description: 'Scalar speed in world units per second, XZ plane.',
    },
    lengthWu: {
      id: 'lengthWu',
      unit: 'world-units',
      domain: [0, null],
      calibrations: {},
      description: 'Scalar length in world units, XZ plane.',
    },
    count: {
      id: 'count',
      unit: 'count',
      domain: [0, null],
      calibrations: {},
      description:
        'Discrete occurrence count. Integer-valued by convention; the schema does not enforce '
        + 'integrality.',
    },
    distanceWu: {
      id: 'distanceWu',
      unit: 'world-units',
      domain: [0, null],
      calibrations: {},
      description: 'Scalar distance in world units, XZ plane.',
    },
  };

  const alphabets = {
    tetherPhase: {
      id: 'tetherPhase',
      source: 'src/systems/tetherGameplay.js _phaseFor',
      members: ['slack', 'capture', 'loaded', 'overload'],
      note: "'capture' is TEMPORAL: the first captureS seconds after the line goes taut.",
    },
    orbitLoadBand: {
      id: 'orbitLoadBand',
      source: 'src/combat/masslineOrbitTelemetry.js loadBand',
      members: ['slack', 'taut', 'loaded', 'overload'],
      note:
        "'capture' is deliberately absent (it cannot be derived from instantaneous state); 'taut' "
        + 'fills the "touching but not yet doing real work" slot instead.',
    },
    cutReason: {
      id: 'cutReason',
      source: 'src/core/constraints/masslineController.js cutReason',
      members: ['pilot', 'snap', 'catastrophic-overload', 'integrity-failure', 'sustained-overload'],
      note: 'Terminal reasons a line stops existing. T10 owns making these consistent for AI too.',
    },
    observationReason: {
      id: 'observationReason',
      source: 'src/combat/masslineOrbitTelemetry.js MASSLINE_ORBIT_REASONS',
      members: [
        'missing-host',
        'missing-target',
        'non-finite-input',
        'invalid-rest-length',
        'degenerate-distance',
        'zero-mass',
      ],
      note: 'Fail-closed reasons. null (nominal) is the absence of a reason, not a member.',
    },
  };

  const bandSets = {
    'release.quality': {
      id: 'release.quality',
      term: 'releaseQuality',
      space: 'quality01',
      calibration: null,
      edge: 'inclusive-lower',
      source: 'src/combat/masslineOrbitTelemetry.js release.classification',
      mirrors: 'src/systems/tetherGameplay.js rateRelease (identical bands, re-declared inline)',
      tiers: [
        { id: 'razor', min: D.releaseRazorScore, derivation: 'imported' },
        { id: 'clean', min: D.releaseCleanScore, derivation: 'imported' },
        { id: 'good', min: D.releaseGoodScore, derivation: 'imported' },
        { id: 'messy', min: null, derivation: 'structural' },
      ],
    },
    'snapCatch.quality': {
      id: 'snapCatch.quality',
      term: 'capture',
      space: 'quality01',
      calibration: null,
      edge: 'inclusive-lower',
      source: 'src/systems/masslineTelemetry.js SNAP_CATCH_CLEAN / SNAP_CATCH_GOOD',
      mirrors: null,
      tiers: [
        { id: 'clean', min: 0.85, derivation: 'copied' },
        { id: 'good', min: 0.55, derivation: 'copied' },
        { id: 'rough', min: null, derivation: 'structural' },
      ],
    },
    'orbit.load': {
      id: 'orbit.load',
      term: 'stableOrbit',
      space: 'breakFraction01',
      calibration: 't01Placeholder',
      edge: 'inclusive-lower',
      source: 'src/combat/masslineOrbitTelemetry.js loadBand',
      mirrors: 'src/systems/tetherGameplay.js _phaseFor (0.75 loaded -> overload)',
      // NOTE: 'slack' is in the orbitLoadBand ALPHABET but is NOT a tier here. Slack is decided by
      // stretch vs slackEpsilon (a lengthWu comparison), not by the load fraction. A consumer that
      // classifies loadRatio alone can never obtain 'slack', and that is correct.
      tiers: [
        { id: 'overload', min: D.overloadLoadRatio, derivation: 'imported' },
        { id: 'loaded', min: D.loadedLoadRatio, derivation: 'imported' },
        { id: 'taut', min: null, derivation: 'structural' },
      ],
    },
    'reel.risk': {
      id: 'reel.risk',
      term: 'pumpGain',
      space: 'breakFraction01',
      calibration: 't01Placeholder',
      edge: 'inclusive-lower',
      source: 'src/combat/masslineOrbitTelemetry.js reelRisk',
      mirrors:
        'src/systems/masslineTelemetry.js REEL_PUMP_RISK_HIGH / REEL_PUMP_RISK_MED, which read '
        + 'tether.strain (tetherStandard calibration) rather than a T01 loadRatio — see collisions.',
      tiers: [
        { id: 'high', min: D.reelRiskHighLoad, derivation: 'imported' },
        { id: 'medium', min: D.reelRiskMediumLoad, derivation: 'imported' },
        { id: 'low', min: null, derivation: 'structural' },
      ],
    },
    'break.overload': {
      id: 'break.overload',
      term: 'break',
      space: 'overloadRatio',
      calibration: null,
      edge: 'inclusive-lower',
      source: 'src/core/constraints/masslineController.js stepMassline overloadRatio',
      mirrors: null,
      tiers: [
        { id: 'catastrophic', min: M.catastrophicRatio, derivation: 'imported' },
        { id: 'overload', min: 1, derivation: 'structural' },
        { id: 'nominal', min: null, derivation: 'structural' },
      ],
    },
  };

  const terms = {
    capture: {
      id: 'capture',
      status: 'live',
      owner: 'T04',
      quantitySpace: 'timeS',
      bandSets: ['snapCatch.quality'],
      summary:
        'The line latching and taking hold. TEMPORAL, not instantaneous: capture is the first '
        + 'captureS seconds after a slack line goes taut, so it cannot be derived from a single '
        + 'frame of state. Snap-catch is the trick variant — taut fast, on a genuinely moving catch, '
        + 'and it LANDS (reaches loaded/overload rather than falling back to slack).',
      sources: [
        { path: 'src/systems/tetherGameplay.js', symbol: '_phaseFor', derivation: 'copied' },
        { path: 'src/systems/masslineTelemetry.js', symbol: '_stepSnapCatch', derivation: 'copied' },
        { path: 'src/data/combatDefs.js', symbol: 'ATTACHMENT_DEFS[].spring.captureS', derivation: 'imported' },
      ],
      tolerances: {
        captureWindowStandardS: {
          value: TS.captureS,
          space: 'timeS',
          derivation: 'imported',
          source: "ATTACHMENT_DEFS['tether_standard'].spring.captureS",
        },
        captureWindowMasslineS: {
          value: AM.captureS,
          space: 'timeS',
          derivation: 'imported',
          source: "ATTACHMENT_DEFS['attachment_massline'].spring.captureS",
        },
        slackBeforeCaptureS: {
          value: 0.1,
          space: 'timeS',
          derivation: 'copied',
          source: 'src/systems/tetherGameplay.js CAPTURE_SLACK_S (module-private)',
        },
        stretchEpsilonWu: {
          value: D.slackEpsilon,
          space: 'lengthWu',
          derivation: 'imported',
          source: 'MASSLINE_ORBIT_DEFAULTS.slackEpsilon, which mirrors tetherGameplay STRETCH_EPSILON',
        },
        snapCatchWindowS: {
          value: 1.0,
          space: 'timeS',
          derivation: 'copied',
          source: 'src/systems/masslineTelemetry.js SNAP_CATCH_WINDOW_S (module-private)',
        },
        snapCatchMinSpeedWu: {
          value: 25,
          space: 'speedWu',
          derivation: 'copied',
          source: 'src/systems/masslineTelemetry.js SNAP_CATCH_MIN_SPEED (module-private)',
        },
      },
    },

    stableOrbit: {
      id: 'stableOrbit',
      status: 'live',
      owner: 'T01',
      quantitySpace: 'balanceSigned',
      bandSets: ['orbit.load'],
      summary:
        'The line is holding a radius rather than yanking the host through a radial pass. Two '
        + 'conditions, both required: motion is swing-dominant (tangentQuality at/above the '
        + 'threshold) AND the line pulls close to what the orbit demands (|tensionBalance| at/below '
        + 'the tolerance). Forced closed when there is no centripetal demand to balance against.',
      sources: [
        { path: 'src/combat/masslineOrbitTelemetry.js', symbol: 'stableOrbit', derivation: 'imported' },
      ],
      tolerances: {
        tangentQualityMin: {
          value: D.stableTangentQuality,
          space: 'quality01',
          derivation: 'imported',
          source: 'MASSLINE_ORBIT_DEFAULTS.stableTangentQuality',
        },
        tensionBalanceAbsMax: {
          value: D.stableTensionBalance,
          space: 'balanceSigned',
          derivation: 'imported',
          source: 'MASSLINE_ORBIT_DEFAULTS.stableTensionBalance',
        },
        demandEpsilon: {
          value: D.demandEpsilon,
          space: 'tensionForce',
          derivation: 'imported',
          source:
            'MASSLINE_ORBIT_DEFAULTS.demandEpsilon — floor on centripetalDemand, which is a FORCE '
            + '(reducedMass * tangentialSpeed^2 / distance), not a ratio. Below it there is no orbit '
            + 'to balance against, so tensionBalance is defined as 0 rather than a bogus infinity.',
        },
      },
    },

    pumpGain: {
      id: 'pumpGain',
      status: 'partial',
      owner: 'T06',
      quantitySpace: 'breakFraction01',
      bandSets: ['reel.risk'],
      summary:
        'DETECTION is live: a pump stroke is a sustained reel-in against a genuinely loaded line, '
        + 'armed and debounced so a held reel is one pump rather than one per tick, with the strain '
        + 'at the pump moment reported as risk. GAIN measurement is not live (no quantity records '
        + 'energy delivered to the swing), but the PHYSICAL CEILING is grounded: a stroke cannot bank '
        + 'more swing energy than the winch efficiency of mechanical energy paid. The stacking law is '
        + 'the live REEL_PUMP_ARM/RESET debounce (one stroke per arm->reset cycle). T06 owns authored '
        + 'budgets that must sit at or below that ceiling.',
      sources: [
        { path: 'src/systems/masslineTelemetry.js', symbol: '_stepReelPump', derivation: 'copied' },
        { path: 'src/combat/masslineOrbitTelemetry.js', symbol: 'reelRisk', derivation: 'imported' },
        { path: 'src/core/constraints/masslineController.js', symbol: 'workJ (cost-side only)', derivation: 'imported' },
      ],
      tolerances: {
        pumpArmStrength: {
          value: 0.55,
          space: 'quality01',
          derivation: 'copied',
          source: 'src/systems/masslineTelemetry.js REEL_PUMP_ARM (module-private)',
        },
        pumpResetStrength: {
          value: 0.15,
          space: 'quality01',
          derivation: 'copied',
          source: 'src/systems/masslineTelemetry.js REEL_PUMP_RESET (module-private)',
        },
        reelIntentDeadzone: {
          value: D.reelIntentDeadzone,
          space: 'quality01',
          derivation: 'imported',
          source: 'MASSLINE_ORBIT_DEFAULTS.reelIntentDeadzone',
        },
        winchEfficiency: {
          value: M.efficiency,
          space: 'quality01',
          derivation: 'imported',
          source: 'DEFAULT_MASSLINE_DEF.efficiency — COST side: mechanicalEnergy = radialWork / this',
        },
        gainBudgetPerStroke: {
          value: M.efficiency,
          space: 'quality01',
          derivation: 'derived',
          source:
            'src/core/constraints/masslineController.js workJ and DEFAULT_MASSLINE_DEF.efficiency',
          note:
            'Per-stroke swing energy gained over mechanical energy paid. Conservation through the '
            + 'winch: the swing cannot bank more than the winch\'s own efficiency of what the player '
            + 'paid (mechanicalEnergy = radialWork / efficiency on the cost side, so '
            + 'gain <= paid * efficiency). T06\'s authored budget must sit at or below this physical '
            + 'ceiling; above it is perpetual motion.',
        },
        gainStackingLimit: {
          value: 1,
          space: 'count',
          derivation: 'behavioural',
          source:
            'src/systems/masslineTelemetry.js _stepReelPump REEL_PUMP_ARM/RESET debounce',
          note:
            'Strokes per arm->reset cycle. The shipped debounce law: a held reel fires ONE stroke '
            + 'when reelStrength crosses 0.55 while loaded and cannot fire again until it decays '
            + 'below 0.15. This IS the roadmap\'s non-stacking spool invariant, already live in '
            + 'telemetry.',
        },
      },
    },

    releaseQuality: {
      id: 'releaseQuality',
      status: 'live',
      owner: 'T07',
      quantitySpace: 'quality01',
      bandSets: ['release.quality'],
      summary:
        'How well a cut converts the swing into exit velocity. score = tangentQuality * usefulLoad * '
        + '(1 - overloadPenalty): you are rewarded for swinging rather than being dragged, for '
        + 'having real load to release, and penalised for cutting an overloaded line.',
      sources: [
        { path: 'src/combat/masslineOrbitTelemetry.js', symbol: 'release', derivation: 'imported' },
        { path: 'src/systems/tetherGameplay.js', symbol: 'rateRelease', derivation: 'behavioural' },
      ],
      tolerances: {
        usefulLoad: {
          value: D.releaseUsefulLoad,
          space: 'breakFraction01',
          derivation: 'imported',
          source: 'MASSLINE_ORBIT_DEFAULTS.releaseUsefulLoad',
        },
        overloadKnee: {
          value: D.releaseOverloadKnee,
          space: 'breakFraction01',
          derivation: 'imported',
          source: 'MASSLINE_ORBIT_DEFAULTS.releaseOverloadKnee',
        },
        overloadSpan: {
          value: D.releaseOverloadSpan,
          space: 'breakFraction01',
          derivation: 'imported',
          source: 'MASSLINE_ORBIT_DEFAULTS.releaseOverloadSpan',
        },
        adviseScore: {
          value: D.releaseAdviseScore,
          space: 'quality01',
          derivation: 'imported',
          source: 'MASSLINE_ORBIT_DEFAULTS.releaseAdviseScore',
        },
      },
    },

    break: {
      id: 'break',
      status: 'live',
      owner: 'T10',
      quantitySpace: 'overloadRatio',
      bandSets: ['break.overload'],
      summary:
        'The line ceasing to exist. Overload is the max of the tension, impulse, and yank ratios '
        + 'against their budgets, so 1.0 is the budget edge by construction. A ratio above 1 '
        + 'accumulates overload time and eats integrity; crossing the grace window, exhausting '
        + 'integrity, or hitting the catastrophic ratio cuts the line. The sustained-load harden '
        + 'term only ever RAISES the yank budget, so it can never introduce a break that would not '
        + 'have happened at rest.',
      sources: [
        { path: 'src/core/constraints/masslineController.js', symbol: 'stepMassline', derivation: 'imported' },
        { path: 'src/data/combatDefs.js', symbol: 'ATTACHMENT_DEFS[].break', derivation: 'imported' },
      ],
      tolerances: {
        overloadRatioEdge: {
          value: 1,
          space: 'overloadRatio',
          derivation: 'structural',
          source: 'Definition of a ratio-to-budget; not a tuned threshold.',
        },
        catastrophicRatio: {
          value: M.catastrophicRatio,
          space: 'overloadRatio',
          derivation: 'imported',
          source: 'DEFAULT_MASSLINE_DEF.catastrophicRatio',
        },
        overloadGraceDefaultS: {
          value: M.overloadGraceS,
          space: 'timeS',
          derivation: 'imported',
          source: 'DEFAULT_MASSLINE_DEF.overloadGraceS',
        },
        overloadGraceTetherStandardS: {
          value: TS.overloadGraceS,
          space: 'timeS',
          derivation: 'imported',
          source: "ATTACHMENT_DEFS['tether_standard'].massline.overloadGraceS",
        },
        hardenMax: {
          value: 0.85,
          space: 'quality01',
          derivation: 'copied',
          source: 'src/core/constraints/masslineController.js harden clamp ceiling (inline literal)',
        },
        nearBreakStrain: {
          value: 0.75,
          space: 'breakFraction01',
          derivation: 'copied',
          source:
            'src/systems/masslineThreats.js THREAT_NEAR_BREAK_STRAIN (module-private). Applied to '
            + 'tether.strain, i.e. the tetherStandard calibration — see collisions.',
        },
      },
    },

    escape: {
      id: 'escape',
      status: 'live',
      owner: 'T09',
      quantitySpace: null,
      bandSets: [],
      summary:
        'Breaking free of a line that something else put on you, and the player-readable response '
        + 'window for doing so. Tolerances below are COPIES of the LIVE masslineThreats contest '
        + 'predicate (THREAT_HOSTILE_ETA_S / THREAT_COLLISION_HORIZON_S / THREAT_HOSTILE_RADIUS / '
        + 'THREAT_HOSTILE_CLOSING_MIN) — T09 may refine the mechanics; the numbers are live copies, '
        + 'not inventions. Escaped when the live contest predicate de-asserts: every contesting '
        + 'hostile is beyond escapeRadiusWu OR closing below escapeClosingMaxWu. T10 still owns '
        + 'making terminal reasons consistent for player and AI.',
      sources: [
        {
          path: 'src/systems/masslineThreats.js',
          symbol: 'contest predicate (THREAT_* live copies)',
          derivation: 'copied',
        },
      ],
      tolerances: {
        responseWindowS: {
          value: 8,
          space: 'timeS',
          derivation: 'copied',
          source: 'src/systems/masslineThreats.js THREAT_HOSTILE_ETA_S',
          note: 'The horizon within which a closing hostile is telegraphed as actionable.',
        },
        collisionHorizonS: {
          value: 1.5,
          space: 'timeS',
          derivation: 'copied',
          source: 'src/systems/masslineThreats.js THREAT_COLLISION_HORIZON_S',
          note: 'Predicted-impact look-ahead.',
        },
        escapeRadiusWu: {
          value: 260,
          space: 'distanceWu',
          derivation: 'copied',
          source: 'src/systems/masslineThreats.js THREAT_HOSTILE_RADIUS',
          note: 'A hostile beyond this cannot contest the swing.',
        },
        escapeClosingMaxWu: {
          value: 12.5,
          space: 'speedWu',
          derivation: 'copied',
          source: 'src/systems/masslineThreats.js THREAT_HOSTILE_CLOSING_MIN',
          note: 'Below this closing speed a hostile is not genuinely closing.',
        },
      },
      laws:
        'Escaped when the live contest predicate de-asserts — every contesting hostile is beyond '
        + 'escapeRadiusWu OR closing below escapeClosingMaxWu. T10 owns terminal-reason consistency.',
    },
  };

  const collisions = [
    {
      id: 'denominator-mismatch',
      kind: 'calibration',
      severity: 'high',
      summary:
        'The same breakFraction01 band literals are applied to values calibrated against denominators '
        + `that differ by ~${Math.round(TS.breakTension / D.breakTension)}x.`,
      detail:
        `T01 loadRatio divides by ${D.breakTension} (a self-documented placeholder) while live `
        + `tether.strain divides by ${TS.breakTension}. A 0.75 in one is not a 0.75 in `
        + 'the other. classifyMassline() therefore REQUIRES the caller to declare the calibration '
        + 'whenever the band set has one.',
      affects: ['orbit.load', 'reel.risk'],
      owner: 'T06',
    },
    {
      id: 'good-word-reuse',
      kind: 'vocabulary',
      severity: 'medium',
      summary: "The word 'good' names two different tolerances in two different ladders.",
      detail:
        "release.quality/good is 0.35; snapCatch.quality/good is 0.55. Both are quality01, so the "
        + 'space guard cannot separate them — only the namespace can. Never pass a bare band name '
        + 'across a module boundary.',
      affects: ['release.quality', 'snapCatch.quality'],
      owner: 'T07',
    },
    {
      id: 'phase-alphabet-split',
      kind: 'vocabulary',
      severity: 'medium',
      summary: "'capture' and 'taut' occupy the same slot in two different phase alphabets.",
      detail:
        'tetherPhase has slack/capture/loaded/overload; orbitLoadBand has slack/taut/loaded/overload. '
        + 'A consumer switching on "the phase" gets a different alphabet depending on which subtree '
        + 'it read. The split is intentional (capture is temporal, taut is instantaneous) but it is '
        + 'nowhere declared, so it reads as a bug to anyone who meets it cold.',
      affects: ['tetherPhase', 'orbitLoadBand'],
      owner: 'T04',
    },
    {
      id: 'triplicated-release-ladder',
      kind: 'duplication',
      severity: 'medium',
      summary: 'The release/catch quality ladder exists in three independent copies.',
      detail:
        'masslineOrbitTelemetry (razor .85 / clean .65 / good .35), tetherGameplay.rateRelease (the '
        + 'same bands re-declared as inline literals), and masslineTelemetry snap-catch (clean .85 / '
        + 'good .55 / rough). T02 documents this without editing any of the three; consolidation is '
        + 'a gameplay write and belongs to T07.',
      affects: ['release.quality', 'snapCatch.quality'],
      owner: 'T07',
    },
    {
      id: 'presentation-load-is-not-strain',
      kind: 'calibration',
      severity: 'high',
      summary: 'tether.load carries phase FLOORS and is not a physical break fraction.',
      detail:
        'computeTetherLoad returns max(strain * 2.5, phaseFloor), so a freshly-captured line reads '
        + '0.35 at essentially zero physical tension. Feeding it to a breakFraction01 band set would '
        + 'report load the line is not carrying. presentationLoad01 is a separate space for exactly '
        + 'this reason.',
      affects: ['orbit.load', 'reel.risk'],
      owner: 'T15',
    },
  ];

  const unpinnedCopies = collectUnpinnedCopies(terms, bandSets);

  return deepFreeze({
    schema: MASSLINE_INVARIANTS_SCHEMA,
    version: MASSLINE_INVARIANTS_VERSION,
    quantitySpaces,
    alphabets,
    bandSets,
    terms,
    collisions,
    unpinnedCopies,
  });
}

function collectUnpinnedCopies(terms, bandSets) {
  const out = [];
  for (const term of Object.values(terms)) {
    for (const [key, tol] of Object.entries(term.tolerances)) {
      if (isUnresolved(tol)) continue;
      if (tol.derivation === 'copied') out.push({ term: term.id, tolerance: key, source: tol.source });
    }
  }
  for (const set of Object.values(bandSets)) {
    for (const tier of set.tiers) {
      if (tier.derivation === 'copied') {
        out.push({ bandSet: set.id, tier: tier.id, source: set.source });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// the assembled machine-readable document (live calibration)
// ---------------------------------------------------------------------------------------------

export const MASSLINE_INVARIANTS = buildMasslineInvariants(liveCalibrationSource());
export const MASSLINE_QUANTITY_SPACES = MASSLINE_INVARIANTS.quantitySpaces;
export const MASSLINE_ALPHABETS = MASSLINE_INVARIANTS.alphabets;
export const MASSLINE_BAND_SETS = MASSLINE_INVARIANTS.bandSets;
export const MASSLINE_TERMS = MASSLINE_INVARIANTS.terms;
export const MASSLINE_KNOWN_COLLISIONS = MASSLINE_INVARIANTS.collisions;
export const MASSLINE_UNPINNED_COPIES = MASSLINE_INVARIANTS.unpinnedCopies;

// ---------------------------------------------------------------------------------------------
// accessors
// ---------------------------------------------------------------------------------------------

/**
 * Classify a value against a namespaced band set.
 *
 * The caller MUST declare the quantity space the value came from, and MUST declare the calibration
 * when the band set has one. This is the whole point: a band tuned against one denominator being
 * silently applied to a value from another is the defect class this module exists to name.
 *
 * Fail-closed and total: never throws, never returns undefined. Non-finite input is a rejection,
 * not a NaN comparison that quietly lands in the floor tier. Values outside the declared quantity
 * space domain are rejected with reason 'out-of-domain' before band lookup. Values inside an
 * unbounded domain (e.g. overloadRatio at Number.MAX_VALUE) classify deterministically.
 *
 * @returns {{ok: boolean, band: string|null, reason: string|null, bandSet: string|null}}
 */
export function classifyMassline(bandSetId, value, declared = {}) {
  const set = MASSLINE_BAND_SETS[bandSetId];
  if (!set) return reject('unknown-band-set', null);

  const opts = declared && typeof declared === 'object' ? declared : {};

  if (opts.space === undefined || opts.space === null) {
    return reject('undeclared-space', bandSetId);
  }
  if (opts.space !== set.space) return reject('space-mismatch', bandSetId);

  if (set.calibration) {
    if (opts.calibration === undefined || opts.calibration === null) {
      return reject('undeclared-calibration', bandSetId);
    }
    if (opts.calibration !== set.calibration) return reject('calibration-mismatch', bandSetId);
  }

  if (!Number.isFinite(value)) return reject('non-finite-value', bandSetId);

  // Domain enforcement BEFORE band lookup. Fail-closed: out-of-domain never reaches a tier.
  const space = MASSLINE_QUANTITY_SPACES[set.space];
  if (space && Array.isArray(space.domain)) {
    const [lo, hi] = space.domain;
    if (Number.isFinite(lo) && value < lo) return reject('out-of-domain', bandSetId);
    if (Number.isFinite(hi) && value > hi) return reject('out-of-domain', bandSetId);
  }

  for (const tier of set.tiers) {
    if (tier.min === null) return { ok: true, band: tier.id, reason: null, bandSet: bandSetId };
    if (value >= tier.min) return { ok: true, band: tier.id, reason: null, bandSet: bandSetId };
  }
  // Unreachable while the floor tier invariant holds; kept so the function stays total.
  return reject('no-matching-tier', bandSetId);
}

function reject(reason, bandSetId) {
  return { ok: false, band: null, reason, bandSet: bandSetId };
}

/**
 * Read a resolved tolerance value.
 *
 * THROWS for an unresolved (forward-referenced) tolerance rather than returning 0. A silent zero is
 * precisely how an invented threshold enters a contract, so this refuses to be convenient.
 */
export function toleranceOf(termId, key) {
  const term = MASSLINE_TERMS[termId];
  if (!term) throw new Error(`masslineInvariants: unknown term '${termId}'`);
  const tol = term.tolerances[key];
  if (tol === undefined) throw new Error(`masslineInvariants: unknown tolerance '${termId}.${key}'`);
  if (isUnresolved(tol)) {
    throw new Error(
      `masslineInvariants: '${termId}.${key}' is unresolved and owned by packet ${tol.owner}. `
      + 'It has no value yet, by design. Do not substitute a default.',
    );
  }
  return tol.value;
}

/** Non-throwing counterpart: null for unresolved or unknown, the number otherwise. */
export function toleranceOrNull(termId, key) {
  const term = MASSLINE_TERMS[termId];
  if (!term) return null;
  const tol = term.tolerances[key];
  if (tol === undefined || isUnresolved(tol)) return null;
  return tol.value;
}

/** Every term id whose status is not yet 'live', with the packet that owns resolving it. */
export function pendingTerms() {
  return Object.values(MASSLINE_TERMS)
    .filter((t) => t.status !== 'live')
    .map((t) => ({ id: t.id, status: t.status, owner: t.owner }));
}

// ---------------------------------------------------------------------------------------------
// validator
//
// Takes an arbitrary document so tests can feed it malformed input. Returns a result rather than
// throwing, matching the src/contracts/*Schemas.js precedent.
// ---------------------------------------------------------------------------------------------

/**
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateMasslineInvariants(doc) {
  const errors = [];
  const push = (msg) => errors.push(msg);

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, errors: ['document must be a plain object'] };
  }

  // Exact top-level key set: missing OR extra is an error.
  const topKeys = Object.keys(doc).sort();
  const requiredTop = [...MASSLINE_REQUIRED_TOP_LEVEL_KEYS].sort();
  for (const key of requiredTop) {
    if (!(key in doc)) push(`missing required top-level key '${key}'`);
  }
  for (const key of topKeys) {
    if (!MASSLINE_REQUIRED_TOP_LEVEL_KEYS.includes(key)) {
      push(`unexpected top-level key '${key}'`);
    }
  }

  if (doc.schema !== MASSLINE_INVARIANTS_SCHEMA) push(`schema must be '${MASSLINE_INVARIANTS_SCHEMA}'`);
  if (!Number.isInteger(doc.version) || doc.version < 1) push('version must be a positive integer');

  const spaces = plainObject(doc.quantitySpaces);
  if (!spaces) push('quantitySpaces must be a plain object');
  else validateSpaces(spaces, push);

  const alphabets = plainObject(doc.alphabets);
  if (!alphabets) push('alphabets must be a plain object');
  else validateAlphabets(alphabets, push);

  const bandSets = plainObject(doc.bandSets);
  if (!bandSets) push('bandSets must be a plain object');
  else validateBandSets(bandSets, spaces || {}, push);

  const terms = plainObject(doc.terms);
  if (!terms) push('terms must be a plain object');
  else validateTerms(terms, spaces || {}, bandSets || {}, push);

  // Both directions: every band set must be referenced by at least one term.
  if (terms && bandSets) {
    const referenced = new Set();
    for (const term of Object.values(terms)) {
      if (Array.isArray(term.bandSets)) {
        for (const id of term.bandSets) referenced.add(id);
      }
    }
    for (const id of Object.keys(bandSets)) {
      if (!referenced.has(id)) {
        push(`bandSets.${id} is not referenced by any term`);
      }
    }
  }

  if (!Array.isArray(doc.collisions)) {
    push('collisions must be an array');
  }

  if (!Array.isArray(doc.unpinnedCopies)) {
    push('unpinnedCopies must be an array');
  }

  return { ok: errors.length === 0, errors };
}

function validateSpaces(spaces, push) {
  for (const [key, space] of Object.entries(spaces)) {
    const at = `quantitySpaces.${key}`;
    if (!plainObject(space)) { push(`${at} must be a plain object`); continue; }
    if (space.id !== key) push(`${at}.id must equal its key`);
    if (!nonEmptyString(space.unit)) push(`${at}.unit must be a non-empty string`);
    if (!nonEmptyString(space.description)) push(`${at}.description must be a non-empty string`);
    if (!Array.isArray(space.domain) || space.domain.length !== 2) {
      push(`${at}.domain must be a [min, max] pair`);
    } else {
      const [min, max] = space.domain;
      for (const [i, bound] of [min, max].entries()) {
        if (bound !== null && !Number.isFinite(bound)) push(`${at}.domain[${i}] must be finite or null`);
      }
      if (Number.isFinite(min) && Number.isFinite(max) && !(min < max)) {
        push(`${at}.domain must be ordered min < max`);
      }
    }
    const cals = plainObject(space.calibrations);
    if (!cals) { push(`${at}.calibrations must be a plain object`); continue; }
    for (const [calKey, cal] of Object.entries(cals)) {
      const calAt = `${at}.calibrations.${calKey}`;
      if (!plainObject(cal)) { push(`${calAt} must be a plain object`); continue; }
      if (cal.id !== calKey) push(`${calAt}.id must equal its key`);
      if (!Number.isFinite(cal.denominator) || cal.denominator <= 0) {
        push(`${calAt}.denominator must be a positive finite number`);
      }
      if (cal.status !== 'live' && cal.status !== 'placeholder') {
        push(`${calAt}.status must be 'live' or 'placeholder'`);
      }
      if (!nonEmptyString(cal.source)) push(`${calAt}.source must be a non-empty string`);
    }
  }
}

function validateAlphabets(alphabets, push) {
  for (const [key, alphabet] of Object.entries(alphabets)) {
    const at = `alphabets.${key}`;
    if (!plainObject(alphabet)) { push(`${at} must be a plain object`); continue; }
    if (alphabet.id !== key) push(`${at}.id must equal its key`);
    if (!nonEmptyString(alphabet.source)) push(`${at}.source must be a non-empty string`);
    if (!Array.isArray(alphabet.members) || alphabet.members.length === 0) {
      push(`${at}.members must be a non-empty array`);
      continue;
    }
    const seen = new Set();
    for (const member of alphabet.members) {
      if (!nonEmptyString(member)) { push(`${at}.members entries must be non-empty strings`); continue; }
      if (seen.has(member)) push(`${at}.members has duplicate '${member}'`);
      seen.add(member);
    }
  }
}

function validateBandSets(bandSets, spaces, push) {
  for (const [key, set] of Object.entries(bandSets)) {
    const at = `bandSets.${key}`;
    if (!plainObject(set)) { push(`${at} must be a plain object`); continue; }
    if (set.id !== key) push(`${at}.id must equal its key`);
    if (set.edge !== 'inclusive-lower') push(`${at}.edge must be 'inclusive-lower'`);
    if (!nonEmptyString(set.source)) push(`${at}.source must be a non-empty string`);

    const space = spaces[set.space];
    if (!space) { push(`${at}.space '${set.space}' is not a declared quantity space`); }
    else if (set.calibration !== null) {
      const cals = plainObject(space.calibrations) || {};
      if (!cals[set.calibration]) {
        push(`${at}.calibration '${set.calibration}' is not declared on space '${set.space}'`);
      }
    }

    if (!Array.isArray(set.tiers) || set.tiers.length < 2) {
      push(`${at}.tiers must be an array of at least two tiers`);
      continue;
    }

    const seen = new Set();
    let previousMin = null;
    for (const [i, tier] of set.tiers.entries()) {
      const tierAt = `${at}.tiers[${i}]`;
      if (!plainObject(tier)) { push(`${tierAt} must be a plain object`); continue; }
      if (!nonEmptyString(tier.id)) push(`${tierAt}.id must be a non-empty string`);
      else if (seen.has(tier.id)) push(`${tierAt}.id duplicates '${tier.id}'`);
      else seen.add(tier.id);

      if (!DERIVATIONS.includes(tier.derivation)) {
        push(`${tierAt}.derivation must be one of ${DERIVATIONS.join('|')}`);
      }

      const isLast = i === set.tiers.length - 1;
      if (isLast) {
        if (tier.min !== null) push(`${tierAt} is the floor tier and must have min: null`);
      } else if (!Number.isFinite(tier.min)) {
        push(`${tierAt}.min must be a finite number (only the last tier may be null)`);
      } else {
        if (previousMin !== null && !(tier.min < previousMin)) {
          push(`${tierAt}.min ${tier.min} must be strictly below the previous tier's ${previousMin}`);
        }
        if (space && Array.isArray(space.domain)) {
          const [lo, hi] = space.domain;
          if (Number.isFinite(lo) && tier.min < lo) push(`${tierAt}.min is below the space domain`);
          if (Number.isFinite(hi) && tier.min > hi) push(`${tierAt}.min is above the space domain`);
        }
        previousMin = tier.min;
      }
    }
  }
}

function validateTerms(terms, spaces, bandSets, push) {
  const STATUSES = new Set(['live', 'partial', 'provisional']);

  // Exact v1 term set: missing OR extra is an error.
  const termKeys = Object.keys(terms);
  for (const required of MASSLINE_REQUIRED_TERMS) {
    if (!(required in terms)) push(`missing required term '${required}'`);
  }
  for (const key of termKeys) {
    if (!MASSLINE_REQUIRED_TERMS.includes(key)) {
      push(`unexpected term '${key}' (v1 requires exactly: ${MASSLINE_REQUIRED_TERMS.join(', ')})`);
    }
  }

  for (const [key, term] of Object.entries(terms)) {
    const at = `terms.${key}`;
    if (!plainObject(term)) { push(`${at} must be a plain object`); continue; }
    if (term.id !== key) push(`${at}.id must equal its key`);
    if (!STATUSES.has(term.status)) push(`${at}.status must be live|partial|provisional`);
    if (!nonEmptyString(term.summary)) push(`${at}.summary must be a non-empty string`);
    if (!OWNER_PATTERN.test(String(term.owner))) push(`${at}.owner must look like a packet id`);

    if (term.quantitySpace !== null && !spaces[term.quantitySpace]) {
      push(`${at}.quantitySpace '${term.quantitySpace}' is not a declared quantity space`);
    }

    if (!Array.isArray(term.bandSets)) push(`${at}.bandSets must be an array`);
    else {
      for (const id of term.bandSets) {
        if (!bandSets[id]) push(`${at}.bandSets references unknown band set '${id}'`);
        else if (bandSets[id].term !== key) push(`${at}.bandSets '${id}' does not point back at this term`);
      }
    }

    if (!Array.isArray(term.sources) || term.sources.length === 0) {
      push(`${at}.sources must be a non-empty array`);
    } else {
      for (const [i, src] of term.sources.entries()) {
        const srcAt = `${at}.sources[${i}]`;
        if (!plainObject(src)) { push(`${srcAt} must be a plain object`); continue; }
        if (!nonEmptyString(src.path)) push(`${srcAt}.path must be a non-empty string`);
        if (!nonEmptyString(src.symbol)) push(`${srcAt}.symbol must be a non-empty string`);
        if (!DERIVATIONS.includes(src.derivation)) {
          push(`${srcAt}.derivation must be one of ${DERIVATIONS.join('|')}`);
        }
      }
    }

    const tolerances = plainObject(term.tolerances);
    if (!tolerances) { push(`${at}.tolerances must be a plain object`); continue; }

    let resolvedCount = 0;
    for (const [tolKey, tol] of Object.entries(tolerances)) {
      const tolAt = `${at}.tolerances.${tolKey}`;
      if (isUnresolved(tol)) {
        if (!OWNER_PATTERN.test(String(tol.owner))) {
          push(`${tolAt} is unresolved and must name an owning packet`);
        }
        if (!nonEmptyString(tol.note)) push(`${tolAt} is unresolved and must carry a note`);
        if ('value' in tol) push(`${tolAt} is unresolved and must not carry a value`);
        continue;
      }
      resolvedCount += 1;
      if (!plainObject(tol)) { push(`${tolAt} must be a plain object`); continue; }
      if (!Number.isFinite(tol.value)) push(`${tolAt}.value must be a finite number`);
      if (!spaces[tol.space]) push(`${tolAt}.space '${tol.space}' is not a declared quantity space`);
      if (!DERIVATIONS.includes(tol.derivation)) {
        push(`${tolAt}.derivation must be one of ${DERIVATIONS.join('|')}`);
      }
      if (!nonEmptyString(tol.source)) push(`${tolAt}.source must be a non-empty string`);
      if (spaces[tol.space] && Array.isArray(spaces[tol.space].domain)) {
        const [lo, hi] = spaces[tol.space].domain;
        if (Number.isFinite(lo) && Number.isFinite(tol.value) && tol.value < lo) {
          push(`${tolAt}.value is below the '${tol.space}' domain`);
        }
        if (Number.isFinite(hi) && Number.isFinite(tol.value) && tol.value > hi) {
          push(`${tolAt}.value is above the '${tol.space}' domain`);
        }
      }
    }

    // A provisional term must not smuggle in a number: that would be inventing a threshold.
    if (term.status === 'provisional' && resolvedCount > 0) {
      push(`${at} is provisional and must not carry any resolved tolerance`);
    }
    // A live term that resolved nothing is mislabelled.
    if (term.status === 'live' && resolvedCount === 0) {
      push(`${at} is marked live but resolves no tolerance`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

// Descends into ALREADY-FROZEN objects. The sub-documents above are declared with a shallow
// Object.freeze({...}), so an `Object.isFrozen` early-return would stop at the top level and leave
// every nested tier and tolerance mutable. A visited set (not frozen-ness) is what terminates the
// recursion.
function deepFreeze(value, visited = new WeakSet()) {
  if (!value || typeof value !== 'object') return value;
  if (visited.has(value)) return value;
  visited.add(value);
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child, visited);
  return value;
}

// unresolved() is kept for the validator's unresolved-tolerance path and for future forward refs.
void unresolved;
