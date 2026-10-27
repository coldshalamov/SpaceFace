// src/ui/commodityNames.js — the ONE place a cargo / commodity id becomes words a player reads.
//
// Cargo ids reach the screen from four tables, not one:
//   1. COMMODITIES (src/data/commodities.js)       — everything a market trades;
//   2. PERSISTENT_CARGO (src/data/narrative.js)    — story cargo: the 47-A assay sample, the
//                                                    personal ledger, the Vols letter. These are
//                                                    deliberately NOT market goods;
//   3. MISSION_CARGO_NAMES (below)                 — ids that encounter / mission scripts spawn but
//                                                    no catalogue lists;
//   4. a humanised fallback                        — so a future id degrades to readable words.
//
// Before this module each screen carried its own `id.replace(/_/g, ' ')` fallback, and none of them
// knew table 2, so the opening contract read "1 47a assay sample short". Use this instead of
// writing another fallback. Pure: no state, no DOM, no randomness.

import { COMMODITIES } from '../data/commodities.js';
import { PERSISTENT_CARGO } from '../data/narrative.js';

/**
 * Ids that scripted encounters / missions put in a hold or a pod but that neither catalogue lists.
 * Authored here once so every screen agrees; add a line when a new script mints a cargo id.
 */
export const MISSION_CARGO_NAMES = Object.freeze({
  cmdty_machine_parts: 'Machine Parts',
  cmdty_contraband_med: 'Contraband Medicine',
});

const FALLBACK_NAME = 'Cargo';

// Namespaces the codebase puts in front of a cargo id; they are bookkeeping, never part of the name.
const ID_NAMESPACE = /^(?:cmdty|depth|item|cargo)_+/i;

// Words kept lower-case inside a title ("Letter to the Tessera"), except as the first word.
const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);

const NAME_BY_ID = new Map();
for (const c of COMMODITIES) if (c && c.id && c.name) NAME_BY_ID.set(c.id, String(c.name));
// Story cargo is authored in capitals ("47-A ASSAY SAMPLE"); inside a sentence that shouts, so it
// is set in title case here. Names that already carry lower-case letters are kept verbatim.
for (const c of PERSISTENT_CARGO) {
  if (c && c.id && c.name && !NAME_BY_ID.has(c.id)) NAME_BY_ID.set(c.id, sentenceSafe(String(c.name)));
}
for (const id of Object.keys(MISSION_CARGO_NAMES)) {
  if (!NAME_BY_ID.has(id)) NAME_BY_ID.set(id, MISSION_CARGO_NAMES[id]);
}

function capitalise(word) {
  // A token with a digit ("47-A", "3I") is a designation, not a word: it stays in capitals.
  if (/\d/.test(word)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCase(text) {
  return text
    .split(' ')
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : capitalise(word)))
    .join(' ');
}

function sentenceSafe(name) {
  const letters = name.replace(/[^A-Za-z]/g, '');
  const allCaps = letters.length > 0 && letters === letters.toUpperCase();
  return allCaps ? titleCase(name) : name;
}

function humanise(id) {
  const words = id
    .replace(ID_NAMESPACE, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase ids
    .replace(/[_\s]+/g, ' ')
    .trim();
  return words ? titleCase(words) : FALLBACK_NAME;
}

/**
 * The display name for any id the game can put in a cargo hold or a mission.
 * Always a non-empty string with no underscore; never the raw id.
 * @param {string} id  a commodity id (`cmdty_ore_iron`), a story cargo id, or any other cargo id.
 * @returns {string}
 */
export function commodityDisplayName(id) {
  if (typeof id !== 'string') return FALLBACK_NAME;
  const key = id.trim();
  if (!key) return FALLBACK_NAME;
  const authored = NAME_BY_ID.get(key);
  if (authored) return authored.replace(/_/g, ' ');
  return humanise(key);
}
