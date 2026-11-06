// src/ui/attentionGlass.js — what a flight screen may interrupt the player with.
//
// X3 carries SWARM lane S2's quiet-glass policy to Adventure. The mechanism is S2's: one pure
// predicate, every shared surface asks it, and a callout has to survive a plain-word check. The
// difference is scope — S2's `isSwarmGlass` is false for Adventure, so Adventure had no policy.
//
// Rules (design/program/finish/campaigns/X3/DIAGNOSIS.md):
//   - Adventure flight admits fight, objective, system and error receipts;
//   - prose sources (bark, chatter, news, landmark, codex, discovery, faction, contract, lore)
//     do not draw over the action; they belong to the bar, codex or station;
//   - a stunt/massline callout must be plain words: ≤ 3 words, no mass/tonnage/strain jargon,
//     no bare ids or counters;
//   - station and map screens are unchanged (their own surfaces own their words).
//
// Pure. No DOM, no state writes.

import { isSwarmGlass, swarmCalloutText } from './swarmGlass.js';

/** The Adventure flight transient stack: S2's three-word rule, no new budget. */
export const ADVENTURE_CALLOUT_WORDS = 3;
export const ADVENTURE_TRANSIENT_MAX = 3;

// Sources whose copy is world texture, not something the player must act on mid-flight.
const QUIET_SOURCES = new Set([
  'bark', 'chatter', 'news', 'landmark', 'codex', 'discovery', 'faction', 'contract',
  'lore', 'radio', 'ambient', 'flavor', 'briefing',
]);

// Kinds whose copy is actionable even in flight.
const ACTIONABLE_KINDS = new Set(['error', 'danger', 'warning']);
// A sentence with more than one clause is prose, not a flight callout. The store-page tagline
// ("Light ships are ammunition. Swing a rock. Keep the speed.") is the test case: the lesson
// stays in onboarding, but it does not draw over the action.
const MULTI_SENTENCE = /[.!?]\s+[A-Z]/;

export function isAdventureFlight(state) {
  if (!state || state.mode !== 'flight') return false;
  if (isSwarmGlass(state)) return false;
  if (state.ui && state.ui.docked === true) return false;
  return true;
}

/**
 * The S2 readability bar, generalised: a callout is a claim the player can read at a glance.
 * Returns the upper-case line or null. Kept identical to `swarmCalloutText` so the two modes
 * cannot drift into two vocabularies.
 */
export function plainCallout(text) {
  return swarmCalloutText(text);
}

export function attentionAdmits(state, { source = '', kind = 'info', text = '' } = {}) {
  if (!isAdventureFlight(state)) return true;
  const k = String(kind || 'info');
  const s = String(source || '');
  if (ACTIONABLE_KINDS.has(k)) return true;
  if (k === 'stunt' || s === 'stunt' || s === 'massline') return plainCallout(text) != null;
  if (QUIET_SOURCES.has(s) || QUIET_SOURCES.has(k)) return false;
  if (k === 'info' && MULTI_SENTENCE.test(String(text || ''))) return false;
  return true;
}
