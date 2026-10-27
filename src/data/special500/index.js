// src/data/special500/index.js — catalog assembly for the special-500 campaign.
//
// The catalog holds the 500 owner-commissioned "special things" ratified in
// design/program/special-500/CONSENSUS_500.json (three-lens debate, round 4
// ratification). Each entry keeps its consensus id so saves, tests and the
// catalog stay traceable to the debate artifact.
//
// Entry shape (validated by validateSpecial500):
//   id       consensus id, e.g. 'SP3-002' (unique key)
//   kind     encounter | oneoff-mission | easter-egg | anomaly | comms-event |
//            visual-setpiece | world-oneoff
//   title    display title
//   sectors  real sector ids the entry lives in ([] = any sector)
//   trigger  discriminated union, see src/systems/special500Director.js
//   recurring  true = calendar entries re-arm every cycle (tracked per year)
//   channel  comms | commsLog | news | mail | memory | spectacle
//   payload  channel-shaped: { from, text } comms; { text, kind? } news;
//            { event? } mail receipt; { text } memory/spectacle flavor line.
//
// One-time semantics persist as state.story.flags['special500.<id>'] (save-carried);
// encounter-shaped entries additionally record
// state.story.depthProgramEncounters.completed['special500.<id>'] so numbered
// encounter files can gate on them through crSituationKit.priorOutcome.

import { ENTRIES_SLICE } from './entries.js';
import { ENTRIES_COMMS_A } from './entries-comms-a.js';
import { ENTRIES_EGG_A } from './entries-egg-a.js';
import { ENTRIES_ANOMALY_A } from './entries-anomaly-a.js';
import { ENTRIES_VISUAL_A } from './entries-visual-a.js';
import { ENTRIES_COMMS_B } from './entries-comms-b.js';
import { ENTRIES_EGG_B } from './entries-egg-b.js';
import { ENTRIES_ANOMALY_B } from './entries-anomaly-b.js';
import { ENTRIES_VISUAL_B } from './entries-visual-b.js';
import { ENTRIES_WORLD_A } from './entries-world-a.js';
import { ENTRIES_WORLD_B } from './entries-world-b.js';
import { ENTRIES_INTERACT_A } from './entries-interact-a.js';
import { ENTRIES_INTERACT_B } from './entries-interact-b.js';
import { ENTRIES_INTERACT_C } from './entries-interact-c.js';
import { ENTRIES_INTERACT_D } from './entries-interact-d.js';

export const SPECIAL500 = Object.freeze([
  ...ENTRIES_SLICE, ...ENTRIES_COMMS_A, ...ENTRIES_EGG_A,
  ...ENTRIES_ANOMALY_A, ...ENTRIES_VISUAL_A,
  ...ENTRIES_COMMS_B, ...ENTRIES_EGG_B, ...ENTRIES_ANOMALY_B,
  ...ENTRIES_VISUAL_B, ...ENTRIES_WORLD_A,
  ...ENTRIES_WORLD_B, ...ENTRIES_INTERACT_A, ...ENTRIES_INTERACT_B,
  ...ENTRIES_INTERACT_C, ...ENTRIES_INTERACT_D,
]);
export const SPECIAL500_COMPLETE = true; // all 500 ratified entries authored

const BY_ID = new Map(SPECIAL500.map((e) => [e.id, e]));
export function special500ById(id) {
  return BY_ID.get(id) || null;
}

export const SPECIAL500_KINDS = Object.freeze([
  'encounter', 'oneoff-mission', 'easter-egg', 'anomaly',
  'comms-event', 'visual-setpiece', 'world-oneoff',
]);
export const SPECIAL500_CHANNELS = Object.freeze([
  'comms', 'commsLog', 'news', 'mail', 'memory', 'spectacle',
]);
export const SPECIAL500_TRIGGER_TYPES = Object.freeze([
  'calendar', 'sectorEntry', 'proximity', 'receipt', 'hashDaily', 'simWindow', 'flag',
]);

/** Validate the catalog shape; returns a list of human-readable problems (empty = valid). */
export function validateSpecial500(entries = SPECIAL500) {
  const problems = [];
  const seen = new Set();
  for (const e of entries) {
    const at = `${e.id || '(no id)'}`;
    if (!e.id || seen.has(e.id)) problems.push(`${at}: missing or duplicate id`);
    seen.add(e.id);
    if (!SPECIAL500_KINDS.includes(e.kind)) problems.push(`${at}: unknown kind ${e.kind}`);
    if (!SPECIAL500_CHANNELS.includes(e.channel)) problems.push(`${at}: unknown channel ${e.channel}`);
    const t = e.trigger || {};
    if (!SPECIAL500_TRIGGER_TYPES.includes(t.type)) problems.push(`${at}: unknown trigger ${t.type}`);
    if (!e.title || !e.title.trim()) problems.push(`${at}: empty title`);
    const text = e.payload && e.payload.text;
    if (e.channel !== 'mail' && (!text || !String(text).trim())) problems.push(`${at}: empty payload text`);
    for (const s of e.sectors || []) {
      if (!String(s).startsWith('sector_')) problems.push(`${at}: suspicious sector id ${s}`);
    }
  }
  return problems;
}
