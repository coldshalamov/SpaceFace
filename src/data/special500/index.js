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
//   dormant  true = authored but deliberately unarmed (needs dormantReason): the
//            director skips it because its copy states facts the world cannot yet
//            back, or its trigger cannot be made reliable. Never ships to a player.
//   after    [ids] extra gate: every listed entry must already have fired
//   notBeforeS  simTime floor ("N days in")
//   trigger.where / trigger.nth  receipt filter (payload equality) / fire on Nth hit
//   trigger.raceOutcome  narrow mission:completed receipt predicate: a finished circuit or
//                        a classified last-place finish with a complete terminal standings row
//   trigger.min  flag trigger: counter flag must be >= min
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
import { ENTRIES_ANNEX } from './entries-annex.js';
import { ENTRIES_ANNEX2_A } from './entries-annex2-a.js';
import { ENTRIES_ANNEX2_B } from './entries-annex2-b.js';
import { ENTRIES_ANNEX2_C } from './entries-annex2-c.js';
import { ENTRIES_ANNEX2_D } from './entries-annex2-d.js';
import { ENTRIES_ANNEX_3 } from './entries-annex3.js';

export const SPECIAL500 = Object.freeze([
  ...ENTRIES_SLICE, ...ENTRIES_COMMS_A, ...ENTRIES_EGG_A,
  ...ENTRIES_ANOMALY_A, ...ENTRIES_VISUAL_A,
  ...ENTRIES_COMMS_B, ...ENTRIES_EGG_B, ...ENTRIES_ANOMALY_B,
  ...ENTRIES_VISUAL_B, ...ENTRIES_WORLD_A,
  ...ENTRIES_WORLD_B, ...ENTRIES_INTERACT_A, ...ENTRIES_INTERACT_B,
  ...ENTRIES_INTERACT_C, ...ENTRIES_INTERACT_D,
]);
export const SPECIAL500_COMPLETE = true; // all 500 ratified entries authored

// The annex wave: the 20 ratified bench spares (CONSENSUS_500 ranks 501-520) plus
// 30 new SPX-D proposals, riding the same director and flag/memory schema. The
// ratified catalog above stays exactly 500; the director sweeps SPECIAL500_ALL.
export const SPECIAL500_ANNEX = Object.freeze([...ENTRIES_ANNEX]);

// Annex wave 2: two hundred new SPX-E proposals in four batches — place records
// at virgin anchors, receipt beats on verified emitters, calendar/hashDaily/
// sectorEntry/simWindow ambience, and after/flag chains that make earlier
// entries into continuing documents. Same director, same flag/memory schema.
export const SPECIAL500_ANNEX_2 = Object.freeze([
  ...ENTRIES_ANNEX2_A, ...ENTRIES_ANNEX2_B, ...ENTRIES_ANNEX2_C, ...ENTRIES_ANNEX2_D,
]);
// Annex wave 3: the dock remembers — receipt entries filtered by where.stationId and
// fired on the Nth dock, so a berth acknowledges a second visit and a signature port
// stops pretending a fifth. Same director, same flag/memory schema.
export const SPECIAL500_ANNEX_3 = Object.freeze([...ENTRIES_ANNEX_3]);
export const SPECIAL500_ALL = Object.freeze([
  ...SPECIAL500, ...SPECIAL500_ANNEX, ...SPECIAL500_ANNEX_2, ...SPECIAL500_ANNEX_3,
]);

const BY_ID = new Map(SPECIAL500_ALL.map((e) => [e.id, e]));
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
export const SPECIAL500_RACE_OUTCOMES = Object.freeze(['finish', 'lastPlace']);

/** Validate the catalog shape; returns a list of human-readable problems (empty = valid). */
export function validateSpecial500(entries = SPECIAL500) {
  const problems = [];
  const seen = new Set();
  const ids = new Set(entries.map((x) => x.id));
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
    if (e.dormant && !(typeof e.dormantReason === 'string' && e.dormantReason.trim())) {
      problems.push(`${at}: dormant entry needs a dormantReason`);
    }
    if (t.nth != null && !(Number.isInteger(t.nth) && t.nth >= 1)) problems.push(`${at}: bad nth`);
    if (t.where != null && (typeof t.where !== 'object' || Array.isArray(t.where))) problems.push(`${at}: bad where`);
    if (t.raceOutcome != null) {
      if (!SPECIAL500_RACE_OUTCOMES.includes(t.raceOutcome)) {
        problems.push(`${at}: unknown race outcome ${t.raceOutcome}`);
      }
      if (t.type !== 'receipt' || t.event !== 'mission:completed') {
        problems.push(`${at}: race outcome requires a mission:completed receipt`);
      }
    }
    if (e.after != null && !(Array.isArray(e.after) && e.after.every((id) => ids.has(id)))) {
      problems.push(`${at}: after must list existing entry ids`);
    }
    for (const s of e.sectors || []) {
      if (!String(s).startsWith('sector_')) problems.push(`${at}: suspicious sector id ${s}`);
    }
  }
  return problems;
}
