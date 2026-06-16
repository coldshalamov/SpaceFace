// src/ui/screens/factions.js — STATION "Factions" tab panel.
// Read-only rep standings. Reputation is [-1000, +1000] with 9 tiers (ARCHITECTURE §0.9).
// Reads state.factions[id].rep; the factions system is the sole writer (§0.6). Falls back to the
// NEW_GAME starting reps and FACTION_META when state.factions hasn't been populated yet (stub).
import { FACTION_META } from '../../data/factions.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';

// 9 tiers over -1000..1000. Thresholds are the lower bound of each tier.
const TIERS = [
  { min: -1000, name: 'Nemesis',    cls: 'hostile' },
  { min: -700,  name: 'Hated',      cls: 'hostile' },
  { min: -400,  name: 'Hostile',    cls: 'hostile' },
  { min: -150,  name: 'Unfriendly', cls: 'cool' },
  { min: -40,   name: 'Neutral',    cls: 'neutral' },
  { min: 40,    name: 'Cordial',    cls: 'warm' },
  { min: 150,   name: 'Friendly',   cls: 'good' },
  { min: 400,   name: 'Honored',    cls: 'good' },
  { min: 700,   name: 'Allied',     cls: 'allied' },
];

function tierFor(rep) {
  let t = TIERS[0];
  for (const x of TIERS) if (rep >= x.min) t = x;
  return t;
}

export function createFactionsPanel(ctx) {
  const root = document.createElement('div');
  root.className = 'st-panel st-factions';
  root.innerHTML = '<div class="st-sub-h">Faction Standings</div>' +
    '<div class="st-fac-note mono">Reputation −1000 … +1000 · 9 tiers</div>' +
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
      const row = document.createElement('div');
      row.className = 'st-fac-row';
      row.innerHTML =
        '<div class="st-fac-head">' +
          '<span class="st-fac-dot" style="background:' + (meta.color || '#888') + '"></span>' +
          '<span class="st-fac-name">' + meta.name + '</span>' +
          '<span class="st-fac-tier st-fac-' + tier.cls + '">' + tier.name + '</span>' +
          '<span class="st-fac-val mono">' + (rep > 0 ? '+' : '') + rep + '</span>' +
        '</div>' +
        '<div class="st-fac-bar"><div class="st-fac-bar-mid"></div>' +
          '<div class="st-fac-bar-fill st-fac-' + tier.cls + '" style="transform:scaleX(' + fill.toFixed(3) + ')"></div>' +
        '</div>' +
        '<div class="st-fac-ctrl mono">' + (meta.controls || []).join(' · ') + '</div>';
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
