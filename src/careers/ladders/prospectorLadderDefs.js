// CL-03 Prospector professional ladder — pure data definition (candidate).
// Registers against quality-PASS CL-00 framework via registerLadderDefinition().
// Never writes credits/cargo/rep/heat/story; rewards are intent-shaped only.
// Not registered in registry/save — lead wires. Deterministic: simTime + ladder rng only.
//
// Live payload truth (verified emitters — do not invent fields):
//   scan:completed  → { targetId, sectorId, found }          scanner.js
//   scan:pulse      → { pos }                                 scanner.js
//   mission:accepted→ { missionId, type, storyTag? }          missions.js
//   mission:completed→ { missionId, type, factionId, repMult } missions.js
//   mission:failed  → { missionId, reason }                   missions.js
//   mission:expired → { missionId, reason:'deadline' }        missions.js
//   mining:yield    → { commodityId, qty, pos?, minerId, richCore? }
//   mining:bulkHaulDelivered → { stationId, chunkId, massU, … } (not qty)
//   entity:killed   → { id, killerId, type, pos, factionLawful, … } (NPCs only)
//   player:death    → { pos, killerId }                       combat.js
//   encounter:*     → claim_threat shape for defense gating
//   fieldDepletion:changed → { fieldId, depleted, extractedU, … } (no refined)

import { CLAIM_COST } from '../../data/claimableBodies.js';
import { LADDER_REWARD_EVENTS } from './ladderShared.js';

/** Stable career id — matches origin careerId and ladder leaf key. */
export const PROSPECTOR_LADDER_ID = 'prospector';
export const PROSPECTOR_ROLE_HULL_DEF_ID = 'ship_pelican';

/** Soft skill-proof key for alternate unlock (no exclusive lock). */
export const PROSPECTOR_SKILL_PROOF_KEY = 'mining_yield_u';
export const PROSPECTOR_SKILL_PROOF_MIN = 3;

/** Step ids in fixed order (six embodied professional beats). */
export const PROSPECTOR_LADDER_STEP_IDS = Object.freeze([
  'survey_circuit',
  'seam_fracture_mastery',
  'claim_stake',
  'claim_conflict',
  'refinery_sector_consequence',
  'role_hull_capstone',
]);

/**
 * Live bus events this branch adapter may consume.
 * Only events with verified emitters + payload fields the FSM actually reads.
 */
export const PROSPECTOR_LADDER_LISTEN = Object.freeze({
  survey_circuit: Object.freeze([
    'scan:completed',
    'scan:pulse',
    'mission:accepted',
    'mission:completed',
    'mission:failed',
    'mission:expired',
  ]),
  seam_fracture_mastery: Object.freeze([
    'mining:yield',
    'mining:seamHit',
    'mining:richCoreExposed',
    'mining:richCoreCompleted',
    'mining:richCoreFizzle',
    'cargo:full',
    'tether:latched',
    'tether:broke',
    // weapons:vent = weapon overheat cosmetic (weapons.js) — NOT heat.js WANTED
    'weapons:vent',
  ]),
  claim_stake: Object.freeze([
    'claim:claimed',
  ]),
  claim_conflict: Object.freeze([
    'encounter:spawned',
    'encounter:resolved',
    'encounter:receipt',
    'entity:killed',
    'player:death',
    'heat:changed',
    'dock:docked',
  ]),
  refinery_sector_consequence: Object.freeze([
    'claim:moduleBuilt',
    'economy:tradeCompleted',
    'mining:bulkHaulDelivered',
    'fieldDepletion:changed',
  ]),
  role_hull_capstone: Object.freeze([
    'ship:purchased',
  ]),
});

/** Deterministic balance / success thresholds (no wall clock). */
export const PROSPECTOR_LADDER_PARAMS = Object.freeze({
  survey: Object.freeze({
    missionType: 'recon_scan',
    scanTargets: 3,
    minAppraisalGrade: 'fair',
    minSurveySites: 3,
    emptyPulsesToFail: 3,
    baseRewardCr: 200,
    recoveryCooldownS: 25,
    storyTag: 'ladder.prospector:survey_circuit',
  }),
  seam: Object.freeze({
    yieldUnits: 8,
    seamHits: 3,
    requireCoreOrFracture: true,
    recoveryCooldownS: 15,
  }),
  claim: Object.freeze({
    claimCost: CLAIM_COST, // 15000 — live claims.js charge via economy:chargeCredits
    recoveryCooldownS: 10,
  }),
  conflict: Object.freeze({
    threatsRequired: 1,
    successRequiresClaimOwned: true,
    successRequiresNotWanted: true,
    recoveryCooldownS: 40,
    encounterShape: 'claim_threat',
    /** Match encounterScripts CLAIM_ENGAGE_R — defend radius around claim body. */
    claimDefendRadius: 700,
  }),
  refinery: Object.freeze({
    moduleId: 'mod_refinery',
    moduleCost: 12000,
    techReq: 'tech_deep_core_mining',
    pathBMinQty: 8,
    recoveryCooldownS: 30,
    pathA: 'path_a_mod_refinery',
    pathB: 'path_b_station_sell',
  }),
  roleHull: Object.freeze({
    roleHullDefId: PROSPECTOR_ROLE_HULL_DEF_ID,
    recoveryCooldownS: 0,
  }),
  unlock: Object.freeze({
    skillProofKey: PROSPECTOR_SKILL_PROOF_KEY,
    skillProofMin: PROSPECTOR_SKILL_PROOF_MIN,
  }),
});

/**
 * Unlock prerequisites for step 0 / soft offer:
 * origin completed OR soft skill proof (mining yield units observed).
 */
export const PROSPECTOR_LADDER_UNLOCK = Object.freeze({
  type: 'or',
  any: Object.freeze([
    Object.freeze({ type: 'originCompleted', careerId: PROSPECTOR_LADDER_ID }),
    Object.freeze({
      type: 'skillProof',
      key: PROSPECTOR_SKILL_PROOF_KEY,
      min: PROSPECTOR_SKILL_PROOF_MIN,
    }),
  ]),
});

/** Soft unlock hints (presentation only — never granted as direct inventory). */
export const PROSPECTOR_LADDER_SOFT = Object.freeze({
  survey_circuit: Object.freeze({ unlockHints: Object.freeze(['mod_survey_suite']) }),
  seam_fracture_mastery: Object.freeze({ unlockHints: Object.freeze(['mod_drill_amp']) }),
  claim_conflict: Object.freeze({ unlockHints: Object.freeze(['mod_defense_battery']) }),
  refinery_sector_consequence: Object.freeze({
    boardBias: Object.freeze({ recon_scan: 0.12, mining_quota: 0.12 }),
  }),
});

/**
 * Failure codes per step — ONLY codes real live events/timers can produce.
 * Dropped (no bus surface): targets_despawned, claim_stake toast denials,
 * refinery toast denials (claims.js/module build has no fail events).
 */
export const PROSPECTOR_LADDER_FAILURE = Object.freeze({
  survey_circuit: Object.freeze({
    /** Three consecutive empty scan:completed (found.asteroids === 0). */
    empty_pulse: 'empty_pulse',
    /** mission:expired{reason:'deadline'} or mission:failed for stamped recon_scan. */
    timer: 'timer',
  }),
  seam_fracture_mastery: Object.freeze({
    hold_jammed: 'hold_jammed',
    core_miss: 'core_miss_if_required',
  }),
  claim_stake: Object.freeze({
    // Success-only: claims.js denials toast without a fail bus event.
  }),
  claim_conflict: Object.freeze({
    heat_spiked: 'heat_spiked',
    player_destroyed: 'player_destroyed',
    abandoned_claim_radius: 'abandoned_claim_radius',
    lawful_kill: 'lawful_kill',
  }),
  refinery_sector_consequence: Object.freeze({
    // Success-only: module/tech denials are toast-only in claims.js.
  }),
});

/**
 * Player-facing copy — dry rigger voice, ≤12 words (spec2/00 taste).
 * Stored outside rewards so validateRewardSpec allowlist stays clean.
 */
export const PROSPECTOR_LADDER_DIALOGUE = Object.freeze({
  survey_circuit: Object.freeze({
    acceptLine: 'Survey three sites. Grade what you pulse.',
    successLine: 'Circuit filed. Map remembers.',
    failLine: 'Survey empty. Close the rocks.',
    recoveryLine: 'Pulse again. Hold near seams.',
  }),
  seam_fracture_mastery: Object.freeze({
    acceptLine: 'Seams first. Fracture clean. Watch hold.',
    successLine: 'Take secured. Fracture skill shown.',
    failLine: 'Hold jammed or core wasted.',
    recoveryLine: 'Free space. Beam the bright seams.',
  }),
  claim_stake: Object.freeze({
    acceptLine: 'Stake a body. Pay the claim fee.',
    successLine: 'Claim sealed. Modules wait.',
    failLine: 'Fee short or body taken.',
    recoveryLine: 'Earn the fee. Find open rock.',
  }),
  claim_conflict: Object.freeze({
    acceptLine: 'Raiders on your stake. Hold the claim.',
    successLine: 'Claim held. Threat broken.',
    failLine: 'Heat or retreat voided the defense.',
    recoveryLine: 'Clear heat. Return to the stake.',
  }),
  refinery_sector_consequence: Object.freeze({
    acceptLine: 'Refine the take. Leave the belt changed.',
    successLine: 'Refinery loop closed. Prospector sealed.',
    failLine: 'No feedstock. Pull ore or build later.',
    recoveryLine: 'Mine again. Sell at the refinery.',
  }),
  role_hull_capstone: Object.freeze({
    acceptLine: 'Own a Pelican. Bring the next seam home.',
    successLine: 'Pelican registered. Belt work is yours.',
    failLine: 'No Pelican on the ownership ledger.',
    recoveryLine: 'Register a Pelican. Belt work waits.',
  }),
});

/** Word-count gate for player-facing strings. */
export function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Assert taste: every dialogue line ≤ maxWords. */
export function assertProspectorLadderCopyBudget(maxWords = 12) {
  const offenders = [];
  for (const stepId of PROSPECTOR_LADDER_STEP_IDS) {
    const d = PROSPECTOR_LADDER_DIALOGUE[stepId];
    if (!d) continue;
    for (const [key, line] of Object.entries(d)) {
      const n = countWords(line);
      if (n > maxWords) offenders.push({ stepId, key, words: n, line });
    }
  }
  return { ok: offenders.length === 0, offenders };
}

/**
 * Canonical ladder definition for registerLadderDefinition().
 * Rewards use only credits / chargeCredits / rep / intents (CL-00 DEF-04).
 * No heat:delta; no cargo/beatIndex direct writes; nonBinding always true.
 */
export const PROSPECTOR_LADDER_DEF = Object.freeze({
  careerId: PROSPECTOR_LADDER_ID,
  title: 'Prospector Professional',
  nonBinding: true,
  theme: 'survey/seam mastery → claim conflict → heat/vent/fracture skill → refinery/sector consequence',
  steps: Object.freeze([
    Object.freeze({
      id: 'survey_circuit',
      index: 0,
      title: 'Survey Circuit',
      theme: 'survey_seam_mastery',
      prerequisites: Object.freeze([PROSPECTOR_LADDER_UNLOCK]),
      listen: PROSPECTOR_LADDER_LISTEN.survey_circuit,
      objective: 'Survey three sites. Grade what you pulse.',
      teach: 'Map memory, not a single scan checkbox.',
      params: PROSPECTOR_LADDER_PARAMS.survey,
      dialogue: PROSPECTOR_LADDER_DIALOGUE.survey_circuit,
      soft: PROSPECTOR_LADDER_SOFT.survey_circuit,
      recovery: Object.freeze({
        cooldownS: PROSPECTOR_LADDER_PARAMS.survey.recoveryCooldownS,
        hint: PROSPECTOR_LADDER_DIALOGUE.survey_circuit.recoveryLine,
      }),
      rewards: Object.freeze({
        credits: 200,
        rep: Object.freeze([
          Object.freeze({ factionId: 'faction_mts', delta: 2 }),
        ]),
      }),
      // Note: recon_scan mission may grant research points via missions authority —
      // ladder does not double-grant RP.
    }),
    Object.freeze({
      id: 'seam_fracture_mastery',
      index: 1,
      title: 'Seam & Fracture',
      theme: 'heat_vent_fracture_skill',
      prerequisites: Object.freeze([
        Object.freeze({
          type: 'ladderStepDone',
          careerId: PROSPECTOR_LADDER_ID,
          stepId: 'survey_circuit',
        }),
      ]),
      listen: PROSPECTOR_LADDER_LISTEN.seam_fracture_mastery,
      objective: 'Seams first. Fracture clean. Watch the hold.',
      teach: 'Weapon overheat is not WANTED heat.',
      params: PROSPECTOR_LADDER_PARAMS.seam,
      dialogue: PROSPECTOR_LADDER_DIALOGUE.seam_fracture_mastery,
      soft: PROSPECTOR_LADDER_SOFT.seam_fracture_mastery,
      recovery: Object.freeze({
        cooldownS: PROSPECTOR_LADDER_PARAMS.seam.recoveryCooldownS,
        hint: PROSPECTOR_LADDER_DIALOGUE.seam_fracture_mastery.recoveryLine,
      }),
      rewards: Object.freeze({
        credits: 250,
      }),
    }),
    Object.freeze({
      id: 'claim_stake',
      index: 2,
      title: 'Claim Stake',
      theme: 'claim_conflict_setup',
      prerequisites: Object.freeze([
        Object.freeze({
          type: 'ladderStepDone',
          careerId: PROSPECTOR_LADDER_ID,
          stepId: 'seam_fracture_mastery',
        }),
      ]),
      listen: PROSPECTOR_LADDER_LISTEN.claim_stake,
      objective: 'Stake a body. Pay the claim fee.',
      teach: 'Ownership costs real credits.',
      params: PROSPECTOR_LADDER_PARAMS.claim,
      dialogue: PROSPECTOR_LADDER_DIALOGUE.claim_stake,
      recovery: Object.freeze({
        cooldownS: PROSPECTOR_LADDER_PARAMS.claim.recoveryCooldownS,
        hint: PROSPECTOR_LADDER_DIALOGUE.claim_stake.recoveryLine,
      }),
      // Stamp only — claim fee is charged by claims.js via economy:chargeCredits.
      rewards: Object.freeze({
        credits: 150,
      }),
    }),
    Object.freeze({
      id: 'claim_conflict',
      index: 3,
      title: 'Claim Conflict',
      theme: 'claim_conflict',
      prerequisites: Object.freeze([
        Object.freeze({
          type: 'ladderStepDone',
          careerId: PROSPECTOR_LADDER_ID,
          stepId: 'claim_stake',
        }),
      ]),
      listen: PROSPECTOR_LADDER_LISTEN.claim_conflict,
      objective: 'Raiders on your stake. Hold the claim.',
      teach: 'Lawful responders are not free kills.',
      params: PROSPECTOR_LADDER_PARAMS.conflict,
      dialogue: PROSPECTOR_LADDER_DIALOGUE.claim_conflict,
      soft: PROSPECTOR_LADDER_SOFT.claim_conflict,
      recovery: Object.freeze({
        cooldownS: PROSPECTOR_LADDER_PARAMS.conflict.recoveryCooldownS,
        hint: PROSPECTOR_LADDER_DIALOGUE.claim_conflict.recoveryLine,
      }),
      rewards: Object.freeze({
        credits: 400,
      }),
    }),
    Object.freeze({
      id: 'refinery_sector_consequence',
      index: 4,
      title: 'Refinery Consequence',
      theme: 'refinery_sector_consequence',
      prerequisites: Object.freeze([
        Object.freeze({
          type: 'ladderStepDone',
          careerId: PROSPECTOR_LADDER_ID,
          stepId: 'claim_conflict',
        }),
      ]),
      listen: PROSPECTOR_LADDER_LISTEN.refinery_sector_consequence,
      objective: 'Refine the take. Leave the belt changed.',
      teach: 'Sector consequence is field memory + market supply.',
      params: PROSPECTOR_LADDER_PARAMS.refinery,
      dialogue: PROSPECTOR_LADDER_DIALOGUE.refinery_sector_consequence,
      soft: PROSPECTOR_LADDER_SOFT.refinery_sector_consequence,
      // Path A / B are event-driven, not career:ladder:choose (no exclusive moral fork UI required).
      paths: Object.freeze([
        PROSPECTOR_LADDER_PARAMS.refinery.pathA,
        PROSPECTOR_LADDER_PARAMS.refinery.pathB,
      ]),
      recovery: Object.freeze({
        cooldownS: PROSPECTOR_LADDER_PARAMS.refinery.recoveryCooldownS,
        hint: PROSPECTOR_LADDER_DIALOGUE.refinery_sector_consequence.recoveryLine,
      }),
      // Step stamp omitted — completionBonus carries the professional seal payout.
      rewards: Object.freeze({}),
    }),
    Object.freeze({
      id: 'role_hull_capstone',
      index: 5,
      title: 'Pelican Command',
      theme: 'physical_role_hull_ownership',
      prerequisites: Object.freeze([
        Object.freeze({
          type: 'ladderStepDone',
          careerId: PROSPECTOR_LADDER_ID,
          stepId: 'refinery_sector_consequence',
        }),
      ]),
      listen: PROSPECTOR_LADDER_LISTEN.role_hull_capstone,
      objective: 'Own a Pelican. Bring the next seam home.',
      teach: 'A career becomes physical when the right hull is yours.',
      params: PROSPECTOR_LADDER_PARAMS.roleHull,
      dialogue: PROSPECTOR_LADDER_DIALOGUE.role_hull_capstone,
      recovery: Object.freeze({
        cooldownS: PROSPECTOR_LADDER_PARAMS.roleHull.recoveryCooldownS,
        hint: PROSPECTOR_LADDER_DIALOGUE.role_hull_capstone.recoveryLine,
      }),
      rewards: Object.freeze({}),
    }),
  ]),
  completionBonus: Object.freeze({
    credits: 1000,
    rep: Object.freeze([
      Object.freeze({ factionId: 'faction_mts', delta: 6 }),
    ]),
  }),
});

/** Event names this candidate may emit (framework + soft progress only). */
export const PROSPECTOR_LADDER_EVENTS = Object.freeze({
  // Framework owns career:ladder:* — branch never redefines them.
  PROGRESS: 'career:ladder:progress',
  // Soft branch telemetry (presentation optional; not a second authority).
  SURVEY: 'ladder:prospector:survey',
  SEAM: 'ladder:prospector:seam',
  CLAIM: 'ladder:prospector:claim',
  CONFLICT: 'ladder:prospector:conflict',
  REFINE: 'ladder:prospector:refine',
});

/** Canonical reward intents this ladder may emit (owners elsewhere). */
export const PROSPECTOR_LADDER_REWARD_EVENTS = Object.freeze({
  GRANT: LADDER_REWARD_EVENTS.GRANT_CREDITS,
  CHARGE: LADDER_REWARD_EVENTS.CHARGE_CREDITS,
  REP: LADDER_REWARD_EVENTS.REP_DELTA,
});

/**
 * Save-safe payload keys allowed on step runtime (leaf.steps[id].payload).
 * Framework serializes step.payload as plain data; keep primitives only.
 */
export const PROSPECTOR_LADDER_PAYLOAD_KEYS = Object.freeze([
  'missionId',
  'surveyCount',
  'appraisals',
  'fairAppraisals',
  'emptyPulses',
  'missionCompleted',
  'seamHits',
  'yieldU',
  'richCoreHit',
  'richCoreFizzle',
  'fractureChunksHauled',
  'ventCount',
  'holdJammed',
  'activeClaimId',
  'threatReceiptId',
  'threatActive',
  'threatsKilled',
  'threatResolved',
  'wantedDuring',
  'lawfulKill',
  'refinePath',
  'moduleBuilt',
  'soldQty',
  'bulkMassU',
  'fieldTouched',
  'fieldId',
  'fieldExtractedU',
]);

export default PROSPECTOR_LADDER_DEF;
