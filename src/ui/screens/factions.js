// src/ui/screens/factions.js — STATION "Factions" tab panel.
// Read-only rep standings. Reputation is [-1000, +1000] with 9 tiers (ARCHITECTURE §0.9).
// Reads state.factions[id].rep; the factions system is the sole writer (§0.6). Falls back to the
// NEW_GAME starting reps and FACTION_META when state.factions hasn't been populated yet (stub).
import { FACTION_META } from '../../data/factions.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { escapeHtml } from '../comms.js';

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

const REP_REASON_LABELS = {
  init: 'new-save baseline',
  complete_faction_mission: 'completed faction mission',
  fail_faction_mission: 'failed or expired mission',
  trade_at_faction_station: 'station trade',
  caught_contraband: 'contraband scan',
  rescue_faction_distress: 'distress rescue',
  kill_faction_ship: 'faction ship kill',
  kill_faction_enemy_ship: 'rival kill bounty',
  war_won: 'war outcome support',
  war_lost: 'war outcome loss',
  decay: 'reputation decay',
};

export const FACTION_TIERS = TIERS;
export const FACTION_AGGRO_THRESHOLD = AGGRO_THRESHOLD;

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

export function factionStandingGuidance(rep, meta = {}, lastDelta = null) {
  const r = safeRep(rep);
  return {
    next: factionNextTierText(r),
    last: factionLastDeltaText(lastDelta),
    plan: factionActionPlan(r, meta),
    risk: factionRiskText(r),
  };
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

export function createFactionsPanel(ctx) {
  const root = document.createElement('div');
  root.className = 'st-panel st-factions';
  root.innerHTML = '<div class="st-sub-h">Faction Standings</div>' +
    '<div class="st-fac-note mono">Reputation -1000 ... +1000 · aggro at -150 · 9 tiers</div>' +
    '<div class="st-fac-list"></div>';
  const list = root.querySelector('.st-fac-list');

  function recordFor(fid) {
    return ctx.state.factions && ctx.state.factions[fid] || null;
  }

  function repFor(fid) {
    const f = recordFor(fid);
    if (f && typeof f.rep === 'number') return f.rep;
    // fallback to starting reps (factions system not yet populated)
    if (NEW_GAME.factionRep && typeof NEW_GAME.factionRep[fid] === 'number') return NEW_GAME.factionRep[fid];
    return 0;
  }

  function refresh() {
    const frag = document.createDocumentFragment();
    for (const meta of FACTION_META) {
      const rec = recordFor(meta.id);
      const rep = repFor(meta.id);
      const tier = tierFor(rep);
      const guidance = factionStandingGuidance(rep, meta, rec && rec.lastDelta);
      const fill = (rep + 1000) / 2000; // 0..1
      const rel = relationSummary(meta);
      const row = document.createElement('div');
      row.className = 'st-fac-row';
      row.innerHTML =
        '<div class="st-fac-head">' +
          '<span class="st-fac-dot" style="background:' + (meta.color || '#888') + '"></span>' +
          '<span class="st-fac-name">' + escapeHtml(meta.name) + '</span>' +
          '<span class="st-fac-tier st-fac-' + tier.cls + '">' + tier.name + '</span>' +
          '<span class="st-fac-val mono">' + (rep > 0 ? '+' : '') + rep + '</span>' +
        '</div>' +
        '<div class="st-fac-bar"><div class="st-fac-bar-mid"></div>' +
          '<div class="st-fac-bar-fill st-fac-' + tier.cls + '" style="transform:scaleX(' + fill.toFixed(3) + ')"></div>' +
        '</div>' +
        '<div class="st-fac-ctrl mono">Controls: ' + escapeHtml((meta.controls || []).join(' · ')) + '</div>' +
        '<div class="st-fac-rel mono">Allies: ' + escapeHtml(rel.allies) + ' · Rivals: ' + escapeHtml(rel.rivals) + '</div>' +
        '<div class="st-fac-effect">' + escapeHtml(standingEffect(rep, meta)) + '</div>' +
        '<div class="st-fac-guidance" aria-label="' + escapeHtml(meta.name) + ' standing guidance">' +
          '<span class="st-fac-guidance-label mono">Next</span><span>' + escapeHtml(guidance.next) + '</span>' +
          '<span class="st-fac-guidance-label mono">Last</span><span>' + escapeHtml(guidance.last) + '</span>' +
          '<span class="st-fac-guidance-label mono">Risk</span><span>' + escapeHtml(guidance.risk) + '</span>' +
          '<span class="st-fac-guidance-label mono">Plan</span><span>' + escapeHtml(guidance.plan) + '</span>' +
        '</div>';
      frag.appendChild(row);
    }
    list.textContent = '';
    list.appendChild(frag);
  }

  return {
    el: root,
    stationId: null,
    onShow(c) { if (c && c.stationId) this.stationId = c.stationId; refresh(); },
    refresh,
  };
}
