// src/ui/attentionGlass.js — what a flight screen may interrupt the player with.
//
// X3 carries SWARM lane S2's quiet-glass policy to Adventure. The mechanism is S2's: one pure
// predicate, every shared surface asks it, and a callout has to survive a plain-word check. The
// difference is scope — S2's `isSwarmGlass` is false for Adventure, so Adventure had no policy.
//
// Rules (design/program/finish/campaigns/X3/DIAGNOSIS.md):
//   - Adventure flight admits only actionable receipts: combat, objective, system, error,
//     danger and warning; an unknown source stays off the glass;
//   - prose sources (bark, chatter, news, landmark, codex, discovery, faction, contract, lore)
//     do not draw over the action; they belong to the bar, codex or station;
//   - a stunt/massline callout must be plain words: ≤ 3 words, no mass/tonnage/strain jargon,
//     no bare ids or counters;
//   - station and map screens are unchanged (their own surfaces own their words).
//
// Pure. No DOM, no state writes.

import { isSwarmGlass, swarmCalloutText } from './swarmGlass.js';
import { isMapContext } from '../data/inputContexts.js';

// The transient stack is the receipt lane's own `RECEIPT_MAX` (2), which already sits inside
// S2's three-line budget; there is no second Adventure constant to keep in sync.

// Adventure glass is an ALLOWLIST, like S2's: a receipt draws only when its source is one the
// player must act on mid-flight. An unknown source (a new rumor/market feed, a future narrator)
// therefore stays off the glass by default instead of leaking through a denylist.
const ACTIONABLE_SOURCES = new Set([
  'combat', 'objective', 'system', 'error', 'danger', 'warning',
  // A capital-boss receipt is a fight receipt; Adventure has capital encounters too.
  'boss',
]);
// Kinds whose copy is actionable even in flight. 'warn' is the legacy spelling of 'warning'.
const ACTIONABLE_KINDS = new Set(['error', 'danger', 'warning', 'warn']);
// Kinds that describe mechanical feedback rather than a narrative channel. A receipt that names
// no channel but carries one of these is a system receipt, so it keeps drawing.
const MECHANICAL_KINDS = new Set(['success', 'good', 'credits', 'rep', 'info']);
// A sentence with more than one clause is prose, not a flight callout. The store-page tagline
// ("Light ships are ammunition. Swing a rock. Keep the speed.") is the test case: the lesson
// stays in onboarding, but it does not draw over the action.
const MULTI_SENTENCE = /[.!?]\s+[A-Z]/;

/** The policy source a receipt carries: an explicit channel, a boss, or its mechanical kind. */
export function receiptSource(kind, channel) {
  if (channel === 'capitalBoss') return 'boss';
  const channelText = String(channel || '');
  if (channelText) return channelText;
  const k = String(kind || 'info');
  return MECHANICAL_KINDS.has(k) ? 'system' : k;
}

export function isAdventureFlight(state) {
  if (!state || state.mode !== 'flight') return false;
  if (isSwarmGlass(state)) return false;
  if (state.ui && state.ui.docked === true) return false;
  // A chart overlay keeps mode 'flight' underneath; it is a map screen, not the flight glass.
  // One predicate with inputContexts: ui.mapOpen, mode 'map', ui.screen and the screen stack all
  // resolve the same surface, so the glass and the input context cannot disagree.
  if (isMapContext(state)) return false;
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
  // A stunt/massline line is a fight receipt only when it reads as a plain callout.
  if (k === 'stunt' || s === 'stunt' || s === 'massline') return plainCallout(text) != null;
  if (ACTIONABLE_KINDS.has(k)) return true;
  // Prose never draws even when it arrives on an otherwise actionable channel.
  if (MULTI_SENTENCE.test(String(text || ''))) return false;
  return ACTIONABLE_SOURCES.has(s);
}
