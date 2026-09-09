// Shared faction-standing tiers and player guidance.
// DOM rendering belongs to src/ui/station/screens/factions.js.

// src/ui/screens/factions.js — STATION "Factions" tab panel.
// Read-only rep standings. Reputation is [-1000, +1000] with 9 tiers (ARCHITECTURE §0.9).
// Reads state.factions[id].rep; the factions system is the sole writer (§0.6). Falls back to the
// NEW_GAME starting reps and FACTION_META when state.factions hasn't been populated yet (stub).
import { FACTION_META } from '../data/factions.js';
import { MISSION_STANDING_LADDER } from '../data/missions.js';
import { NEW_GAME } from '../data/newGameDefaults.js';
import { REP_REASON_LABELS } from '../data/repReasons.js';

// 9 tiers over -1000..1000. Thresholds are the lower bound of each tier.
const TIERS = [
  { min: -1000, name: 'Sworn Enemy', cls: 'hostile' },
  { min: -700,  name: 'Hated',       cls: 'hostile' },
  { min: -400,  name: 'Hostile',     cls: 'hostile' },
  { min: -149,  name: 'Disliked',    cls: 'cool' },
  { min: -29,   name: 'Neutral',     cls: 'neutral' },
  { min: 30,    name: 'Accepted',    cls: 'warm' },
  { min: 150,   name: 'Trusted',     cls: 'good' },
  { min: 400,   name: 'Allied',      cls: 'good' },
  { min: 700,   name: 'Hero',        cls: 'allied' },
];

const AGGRO_THRESHOLD = -150;
const REP_CAP = 1000;
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));

export const FACTION_TIERS = TIERS;
export const FACTION_AGGRO_THRESHOLD = AGGRO_THRESHOLD;
export { REP_REASON_LABELS } from '../data/repReasons.js';

function safeRep(rep) {
  const n = Number(rep);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-REP_CAP, Math.min(REP_CAP, Math.round(n)));
}

function signed(value) {
  const n = Number(value) || 0;
  return (n > 0 ? '+' : '') + n;
}

function repMark(value) {
  return '(' + signed(value) + ')';
}

export function tierFor(rep) {
  const r = safeRep(rep);
  let t = TIERS[0];
  for (const x of TIERS) if (r >= x.min) t = x;
  return t;
}

function nextTierFor(rep) {
  const r = safeRep(rep);
  for (const t of TIERS) if (r < t.min) return t;
  return null;
}

function repReasonLabel(reason) {
  const raw = String(reason || '').trim();
  if (!raw) return 'unknown event';
  if (raw.startsWith('spillover:')) {
    const base = repReasonLabel(raw.slice('spillover:'.length));
    return 'ally/rival spillover (' + base + ')';
  }
  return REP_REASON_LABELS[raw] || raw.replace(/[_-]+/g, ' ');
}

function factionShort(meta = {}) {
  const f = meta && meta.id ? FACTION_BY_ID.get(meta.id) : null;
  return (meta && (meta.short || meta.name)) || (f && (f.short || f.name)) || 'this faction';
}

export function factionLastDeltaText(lastDelta) {
  const value = Number(lastDelta && lastDelta.value);
  if (!lastDelta || !Number.isFinite(value) || value === 0) return 'none recorded this save';
  return signed(value) + ' rep from ' + repReasonLabel(lastDelta.reason);
}

export function factionNextTierText(rep) {
  const r = safeRep(rep);
  const next = nextTierFor(r);
  if (!next) return 'Hero tier secured (+1000 cap)';
  return (next.min - r) + ' rep to ' + next.name + ' ' + repMark(next.min);
}

export function factionRiskText(rep) {
  const r = safeRep(rep);
  if (r <= AGGRO_THRESHOLD) {
    const needed = (AGGRO_THRESHOLD + 1) - r;
    return 'aggro active; earn ' + needed + ' rep to cross -149 and calm patrol locks';
  }
  const buffer = r - AGGRO_THRESHOLD;
  if (buffer <= 40) return buffer + ' rep above aggro; one failed job, kill, or scan can turn patrols hostile';
  if (r < 0) return 'below neutral; repair before failures or scans push the faction into aggro';
  if (r >= 400) return 'high standing; rival contracts and contraband scans can still spill back';
  return buffer + ' rep above aggro; stable enough for normal contracts and trade';
}

export function factionActionPlan(rep, meta = {}) {
  const r = safeRep(rep);
  const short = factionShort(meta);
  if (r <= AGGRO_THRESHOLD) {
    return 'repair standing with low-risk ' + short + ' contracts or station trade; avoid kills and scans in their space';
  }
  if (r < 0) {
    return 'repair reputation with ' + short + ' before taking risky opposing work';
  }
  if (r < 30) {
    return 'earn trust with ' + short + ' contracts; station trade gives smaller, safer gains';
  }
  if (r < 150) {
    return 'push to Trusted by chaining ' + short + ' work and avoiding their named rivals';
  }
  if (r < 400) {
    return 'push to Allied with higher-value ' + short + ' contracts; protect the route from failures';
  }
  if (r < 700) {
    return 'push to Hero with sustained ' + short + ' wins, then stop bleeding trust to rival work';
  }
  return 'hold Hero standing: keep work clean and avoid contraband or rival spillover';
}

export function factionStandingGuidance(rep, meta = {}, lastDelta = null, options = {}) {
  const r = safeRep(rep);
  return {
    next: factionNextTierText(r),
    last: options.hideLastDelta ? 'routing record withheld' : factionLastDeltaText(lastDelta),
    plan: factionActionPlan(r, meta),
    risk: factionRiskText(r),
  };
}

export function factionContractLadderRows(rep) {
  const r = safeRep(rep);
  return MISSION_STANDING_LADDER.map((gate) => ({
    name: gate.name,
    short: gate.short,
    minRep: gate.minRep,
    unlocks: gate.unlocks,
    aspirational: !!gate.aspirational,
    unlocked: !gate.aspirational && r >= gate.minRep,
  }));
}

export function factionContractLadderText(rep) {
  const rows = factionContractLadderRows(rep);
  const next = rows.find((row) => !row.aspirational && !row.unlocked);
  if (!next) return 'Trusted work unlocked; Allied retainers are the next long-term faction target.';
  return (next.minRep - safeRep(rep)) + ' rep to unlock ' + next.name + ' (' + next.short + ')';
}

function factionShortById(id) {
  const f = FACTION_BY_ID.get(id);
  return (f && (f.short || f.name)) || id;
}

function relationSummary(meta) {
  const allies = [];
  const rivals = [];
  for (const [id, weight] of Object.entries(meta.relations || {})) {
    if (weight >= 0.3) allies.push(factionShortById(id));
    else if (weight <= -0.3) rivals.push(factionShortById(id));
  }
  return {
    allies: allies.length ? allies.join(', ') : 'none',
    rivals: rivals.length ? rivals.join(', ') : 'none',
  };
}

function standingEffect(rep, meta) {
  const short = meta.short || meta.name;
  if (rep <= AGGRO_THRESHOLD) return short + ' forces may treat you as hostile on sight.';
  if (rep >= 400) return short + ' stations regard you as a trusted operator.';
  if (rep >= 150) return short + ' contract handlers are more likely to trust your work.';
  if (rep <= -400) return short + ' crews are looking for a reason to escalate.';
  if (rep < 0) return short + ' contacts are cold; small mistakes will travel.';
  return short + ' remains neutral; contracts and trade can still move the needle.';
}
