// M3 Hunter origin chain — pure data (no systems, no Math.random, no wall clock).
// Candidate module: lead integrator wires shared seams; do not import this from registry.

import { CombatDoctrineId } from '../../ai/combatDoctrine.js';

export const HUNTER_ORIGIN_ID = 'hunter';
export const HUNTER_ORIGIN_SCHEMA_VERSION = 1;
export const HUNTER_ORIGIN_STATE_KEY = 'hunterOrigin';

/** Non-binding career offer id for first-dock handoff. */
export const HUNTER_ORIGIN_OFFER_ID = 'origin_hunter';

/**
 * Three meaningful steps. Copy is terse working-space voice (MASTER_TASTE §5).
 * Each step names one verb and teaches combat readability.
 */
export const HUNTER_ORIGIN_STEPS = Object.freeze([
  Object.freeze({
    id: 'identify',
    index: 0,
    title: 'Mark the Mark',
    verb: 'Identify',
    line: 'Lock a HOSTILE. Leave patrols clean.',
    teach: 'target_identification',
    objective: 'Confirm a legal hostile mark (HOSTILE), not PATROL or TRADER.',
    successEvent: 'hunterOrigin:identified',
    failCodes: Object.freeze(['marked_lawful', 'marked_civilian', 'no_mark']),
  }),
  Object.freeze({
    id: 'pursuit',
    index: 1,
    title: 'Hold the Line',
    verb: 'Pursue',
    line: 'Stay on the mark through its doctrine.',
    teach: 'pursuit_under_doctrine',
    objective: 'Maintain pursuit contact until the doctrine telegraph window opens.',
    // Fixed-timestep: 60 Hz × 4.5 s ≈ 270 ticks of sustained pursuit contact.
    pursuitContactTicks: 270,
    successEvent: 'hunterOrigin:pursuitHeld',
    failCodes: Object.freeze(['mark_lost', 'illegal_fire', 'heat_spiked']),
  }),
  Object.freeze({
    id: 'counterplay',
    index: 2,
    title: 'Answer Clean',
    verb: 'Counter',
    line: 'Read the telegraph. Finish the bag clean.',
    teach: 'counterplay_and_clean_finish',
    objective: 'Survive the counter window or clean-kill the hostile mark without raising WANTED heat.',
    successEvent: 'hunterOrigin:counterplayDone',
    failCodes: Object.freeze(['illegal_kill', 'heat_spiked', 'counter_failed']),
  }),
]);

export const HUNTER_STEP_BY_ID = Object.freeze(
  Object.fromEntries(HUNTER_ORIGIN_STEPS.map((s) => [s.id, s])),
);

/** Visible reward: modest cash + ledger unlock. Must not dominate hauler/prospector. */
export const HUNTER_ORIGIN_REWARD = Object.freeze({
  credits: 650,
  reason: 'origin:hunter:complete',
  unlockId: 'hunter_ledger_starter',
  unlockLabel: 'Hunter Ledger',
  // Soft board bias only — not a weapon, hull, or exclusive career lock.
  boardBias: Object.freeze({ bounty_hunt: 0.12, patrol_clear: 0.08 }),
  // Ceiling note for balance lab: starter bank is 5000 cr; 650 is ~13% one-time.
  balanceNote: 'one_time_sub_15pct_starter_bank',
});

/** Doctrine pool for step 2–3 quarry picks — live M1.5 combat doctrine ids only. */
export const HUNTER_ORIGIN_DOCTRINE_POOL = Object.freeze([
  CombatDoctrineId.INTERCEPTOR_FLYBY,
  CombatDoctrineId.TETHER_CONTROL_RAIDER,
  CombatDoctrineId.RANGED_DISENGAGER,
]);

/** Contact words that are legal bounty marks for the identify step. */
export const HUNTER_LEGAL_MARK_WORDS = Object.freeze(['HOSTILE']);

/** Contact words that must never be marked (lawful / civilian identification drill). */
export const HUNTER_FORBIDDEN_MARK_WORDS = Object.freeze(['PATROL', 'TRADER', 'MINER', 'ALLY', 'WINGMAN']);

export const HUNTER_OFFER_STATUS = Object.freeze({
  LATENT: 'latent',
  OFFERED: 'offered',
  DECLINED: 'declined',
  ACCEPTED: 'accepted',
  ABANDONED: 'abandoned',
  COMPLETED: 'completed',
});

export const HUNTER_PHASE = Object.freeze({
  IDLE: 'idle',
  ACTIVE: 'active',
  FAILED: 'failed',
  RECOVERING: 'recovering',
  COMPLETE: 'complete',
});

/** Event names this candidate emits (lead wires UI / economy / missions). */
export const HUNTER_ORIGIN_EVENTS = Object.freeze({
  OFFERED: 'hunterOrigin:offered',
  DECLINED: 'hunterOrigin:declined',
  ACCEPTED: 'hunterOrigin:accepted',
  STEP_ENTER: 'hunterOrigin:stepEnter',
  STEP_COMPLETE: 'hunterOrigin:stepComplete',
  STEP_FAILED: 'hunterOrigin:stepFailed',
  RECOVERED: 'hunterOrigin:recovered',
  COMPLETED: 'hunterOrigin:completed',
  REWARD: 'hunterOrigin:reward',
  // Intent for economy single-writer — never mutates credits here.
  GRANT_CREDITS: 'economy:grantCredits',
});

/**
 * Recovery copy for lawful failure paths. One voice, imperative, ≤12 words.
 */
export const HUNTER_RECOVERY_HINTS = Object.freeze({
  marked_lawful: 'Lawful marks void the bag. Re-mark a HOSTILE.',
  marked_civilian: 'Traders are not quarry. Re-mark a HOSTILE.',
  no_mark: 'No mark locked. Pulse and try again.',
  mark_lost: 'Mark broke contact. Reacquire and hold.',
  illegal_fire: 'Hold fire on clean hulls. Reset the mark.',
  illegal_kill: 'Piracy voids the bag. Clear heat, re-mark.',
  heat_spiked: 'WANTED heat burns the contract. Slip the zone.',
  counter_failed: 'Missed the telegraph. Wait the next window.',
});

export function stepDefAt(index) {
  if (!Number.isInteger(index) || index < 0 || index >= HUNTER_ORIGIN_STEPS.length) return null;
  return HUNTER_ORIGIN_STEPS[index];
}

export function isTerminalOfferStatus(status) {
  return status === HUNTER_OFFER_STATUS.COMPLETED;
}
