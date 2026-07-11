// Prospector origin chain — pure data + balance constants.
// Isolated M3 candidate. Lead wires shared seams; do not import from registries/HUD here.
// Taste: dry rigger voice, ≤12 words per line (spec2/00 §5). Non-binding career offer.

/** Stable career id used by contract harness + save schema. */
export const PROSPECTOR_ORIGIN_ID = 'prospector';

/** Save blob schema id (versioned separately from numeric schemaVersion). */
export const PROSPECTOR_ORIGIN_SCHEMA_ID = 'spaceface.prospectorOrigin.v1';

/** Numeric schema for migrate(). Bump only with a migration branch. */
export const PROSPECTOR_ORIGIN_SCHEMA_VERSION = 1;

/** Career family for cross-origin balance / mutual non-exclusion contracts. */
export const PROSPECTOR_ORIGIN_FAMILY = 'extraction';

/**
 * Balance envelope vs Hauler/Hunter (M3 peer careers).
 * Gross cash reward stays under 600 cr so no origin invalidates the others.
 * Visible reward is cash + a soft survey-kit mark (no exclusive hull/weapon).
 */
export const PROSPECTOR_REWARD = Object.freeze({
  credits: 450,
  reason: 'origin:prospector:complete',
  /** Soft unlock flag for lead integration (scanner tip / survey board weight). */
  markId: 'prospector_survey_kit',
  /** Comparable gross value used by balance schemas (credits + mark proxy). */
  grossValueCr: 520,
  /** Upper bound any single origin completion should grant in early game. */
  peerCapCr: 600,
});

/** How much ore the extract step needs from live mining:yield authority. */
export const PROSPECTOR_EXTRACT_TARGET_U = 3;

/** Minimum appraised grade that counts as a "worthwhile" first deposit. */
export const PROSPECTOR_MIN_APPRAISAL_GRADE = 'fair';

/** Re-offer after decline: next dock after this many sim-seconds. */
export const PROSPECTOR_REOFFER_COOLDOWN_S = 120;

/** Max decline re-offers before the chain rests (still non-binding; never hard-locks). */
export const PROSPECTOR_MAX_OFFERS = 4;

/** Extraction risk: cargo mass fraction that triggers a strain warning (read-only mass). */
export const PROSPECTOR_MASS_STRAIN_FRAC = 0.65;

/** Step ids — fixed order; contract harness may key on these. */
export const PROSPECTOR_STEP_IDS = Object.freeze([
  'appraise',
  'extract',
  'sell',
]);

/**
 * Step definitions. Objectives reference live authorities by event name only;
 * this module never writes cargo/credits/heat itself.
 */
export const PROSPECTOR_STEPS = Object.freeze({
  appraise: Object.freeze({
    id: 'appraise',
    index: 0,
    title: 'Appraise a deposit',
    objective: 'Pulse the scanner. Grade one rock.',
    teach: 'deposit_appraisal',
    authorities: Object.freeze(['scanner', 'mining_data']),
    listen: Object.freeze(['scan:completed', 'scan:pulse']),
    successNeed: Object.freeze({ minAppraisals: 1, minGrade: PROSPECTOR_MIN_APPRAISAL_GRADE }),
    failure: Object.freeze({
      id: 'empty_pulse',
      copy: 'Nothing in range. Close on a rock.',
      recovery: 'retry_scan',
    }),
  }),
  extract: Object.freeze({
    id: 'extract',
    index: 1,
    title: 'Extract under load',
    objective: 'Beam seams. Watch mass and hold.',
    teach: 'extraction_risk',
    authorities: Object.freeze(['mining', 'tether', 'cargo', 'mass']),
    listen: Object.freeze([
      'mining:yield',
      'mining:tick',
      'tether:latched',
      'tether:broke',
      'cargo:full',
      'cargo:changed',
    ]),
    successNeed: Object.freeze({ oreUnits: PROSPECTOR_EXTRACT_TARGET_U }),
    failure: Object.freeze({
      id: 'hold_jammed',
      copy: 'Hold full. Free space, then resume.',
      recovery: 'free_cargo_then_resume',
    }),
  }),
  sell: Object.freeze({
    id: 'sell',
    index: 2,
    title: 'Sell the take',
    objective: 'Dock and sell the ore.',
    teach: 'market_sell',
    authorities: Object.freeze(['economy', 'cargo']),
    listen: Object.freeze(['economy:tradeCompleted', 'dock:docked']),
    successNeed: Object.freeze({ sellSide: 'sell', minQty: 1 }),
    failure: Object.freeze({
      id: 'empty_hold',
      copy: 'Hold empty. Pull more ore first.',
      recovery: 'return_to_extract',
    }),
  }),
});

/** First-dock offer copy (non-binding). */
export const PROSPECTOR_OFFER = Object.freeze({
  originId: PROSPECTOR_ORIGIN_ID,
  binding: false,
  title: 'Prospector path',
  blurb: 'Scan, crack, sell. No contract binds you.',
  acceptLabel: 'Take the kit',
  declineLabel: 'Not now',
  stepsPreview: PROSPECTOR_STEP_IDS.map((id) => PROSPECTOR_STEPS[id].title),
});

/** Status vocabulary (string enum for contracts). */
export const PROSPECTOR_STATUS = Object.freeze({
  IDLE: 'idle',
  OFFERED: 'offered',
  ACTIVE: 'active',
  DECLINED: 'declined',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
});

export const PROSPECTOR_STEP_STATUS = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  FAILED: 'failed',
  RECOVERING: 'recovering',
  DONE: 'done',
});

/** Grade ladder used by appraisal (lowest → highest). */
export const PROSPECTOR_GRADE_ORDER = Object.freeze([
  'barren',
  'poor',
  'fair',
  'rich',
  'prime',
]);

/** Event names this candidate emits (lead may route to UI/voice). */
export const PROSPECTOR_EVENTS = Object.freeze({
  OFFERED: 'origin:prospector:offered',
  ACCEPTED: 'origin:prospector:accepted',
  DECLINED: 'origin:prospector:declined',
  STEP_ACTIVE: 'origin:prospector:stepActive',
  STEP_DONE: 'origin:prospector:stepDone',
  STEP_FAILED: 'origin:prospector:stepFailed',
  STEP_RECOVERED: 'origin:prospector:stepRecovered',
  APPRAISAL: 'origin:prospector:appraisal',
  RISK: 'origin:prospector:risk',
  COMPLETED: 'origin:prospector:completed',
  REWARD: 'origin:prospector:reward',
  PROGRESS: 'origin:prospector:progress',
});

/** Word-count gate for player-facing strings in this package. */
export function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Assert taste: every tutorial/objective line ≤ 12 words. */
export function assertProspectorCopyBudget(maxWords = 12) {
  const lines = [
    PROSPECTOR_OFFER.blurb,
    ...PROSPECTOR_STEP_IDS.map((id) => PROSPECTOR_STEPS[id].objective),
    ...PROSPECTOR_STEP_IDS.map((id) => PROSPECTOR_STEPS[id].failure.copy),
  ];
  const offenders = lines.filter((line) => countWords(line) > maxWords);
  return { ok: offenders.length === 0, offenders, maxWords };
}
