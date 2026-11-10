// src/ui/swarmGlass.js — what a live Swarm round may show (design/program/finish/swarm/README.md §4).
// Pure. Outside a live Swarm run every rule admits, so Adventure is untouched.
import { SWARM_RULESET } from '../data/swarmMode.js';

export const SWARM_CALLOUT_MAX = 3;
export const SWARM_CALLOUT_WORDS = 3;
const FIGHT_SOURCES = new Set(['swarm-callout', 'boss', 'danger', 'round', 'system', 'warn']);
const JARGON = /\b(snag|messy|window|logged|mass|tonn|winch|strain|payload|ride|budge|shunted)\b|\d+\s*t\b/i;
const BARE_NUMBER = /(^|\s)\d{2,}(\s|$)/;

export function isSwarmGlass(state) {
  const run = state && state.run;
  return !!(run && run.kind === 'survival' && run.phase !== 'inactive' && run.ruleset === SWARM_RULESET);
}
export function swarmGlassAdmits(state, { source = '' } = {}) {
  return !isSwarmGlass(state) || FIGHT_SOURCES.has(String(source));
}
export function swarmCalloutText(text) {
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  if (!line || JARGON.test(line) || BARE_NUMBER.test(line)) return null;
  const words = line.split(' ').filter((w) => !/^[—–-]$/.test(w));
  return words.length > SWARM_CALLOUT_WORDS ? null : line.toUpperCase();
}
