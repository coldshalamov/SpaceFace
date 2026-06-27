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
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));

function tierFor(rep) {
  let t = TIERS[0];
  for (const x of TIERS) if (rep >= x.min) t = x;
  return t;
}

function factionShort(id) {
  const f = FACTION_BY_ID.get(id);
  return (f && (f.short || f.name)) || id;
}

function relationSummary(meta) {
  const allies = [];
  const rivals = [];
  for (const [id, weight] of Object.entries(meta.relations || {})) {
    if (weight >= 0.3) allies.push(factionShort(id));
    else if (weight <= -0.3) rivals.push(factionShort(id));
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

  function repFor(fid) {
    const f = ctx.state.factions && ctx.state.factions[fid];
    if (f && typeof f.rep === 'number') return f.rep;
    // fallback to starting reps (factions system not yet populated)
    if (NEW_GAME.factionRep && typeof NEW_GAME.factionRep[fid] === 'number') return NEW_GAME.factionRep[fid];
    return 0;
  }

  function refresh() {
    const frag = document.createDocumentFragment();
    for (const meta of FACTION_META) {
      const rep = repFor(meta.id);
      const tier = tierFor(rep);
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
        '<div class="st-fac-effect">' + escapeHtml(standingEffect(rep, meta)) + '</div>';
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
