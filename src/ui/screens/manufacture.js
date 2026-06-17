// src/ui/screens/manufacture.js – the Manufacturing panel (Phase 7 builder profession).
//
// Surfaces the crafting blueprints (refine / assemble / augment / ship) with live material costs,
// tech gating, and a one-click Build. This is the screen that turns "mine ore → sell it" into
// "mine ore → build an empire". Lives as a station-hub tab at fab/refinery stations.
import { BLUEPRINTS } from '../../data/blueprints.js';
import { COMMODITIES } from '../../data/commodities.js';
import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import { SHIPS } from '../../data/ships.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const MOD_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const WPN_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const TIER_LABEL = { refine: 'REFINE', assemble: 'ASSEMBLE', augment: 'AUGMENT', ship: 'SHIPYARD' };

function niceName(id, kind) {
  if (kind === 'ship') return (SHIP_BY_ID.get(id) || {}).name || id;
  if (kind === 'weapon') return (WPN_BY_ID.get(id) || {}).name || id;
  if (kind === 'module') return (MOD_BY_ID.get(id) || {}).name || id;
  return (CMDTY_BY_ID.get(id) || {}).name || id;
}

export function createManufacturePanel(ctx) {
  const root = document.createElement('div');
  root.className = 'st-manufacture';

  const header = document.createElement('div');
  header.className = 'st-sub-h';
  header.textContent = 'Manufacturing';
  root.appendChild(header);

  const intro = document.createElement('div');
  intro.className = 'st-manuf-intro';
  intro.textContent = 'Convert mined ore and salvaged materials into refined stock, modules, and whole ships. Research unlocks higher tiers.';
  root.appendChild(intro);

  const list = document.createElement('div');
  list.className = 'st-manuf-list';
  root.appendChild(list);

  list.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act="build"]');
    if (!btn || btn.disabled) return;
    const bpId = btn.getAttribute('data-bp');
    const crafting = ctx.crafting || (ctx.registry && ctx.registry.get('crafting'));
    if (crafting && crafting.build(bpId)) refresh();
  });
  // refresh when cargo/credits/research change so costs + availability update live
  ctx.bus.on('cargo:changed', () => { if (root.closest('.st-tabpanel') && root.closest('.st-tabpanel').style.display !== 'none') refresh(); });
  ctx.bus.on('credits:changed', () => { if (root.closest('.st-tabpanel') && root.closest('.st-tabpanel').style.display !== 'none') refresh(); });
  ctx.bus.on('craft:complete', () => refresh());
  ctx.bus.on('tech:researched', () => refresh());

  function refresh() {
    const crafting = ctx.crafting || (ctx.registry && ctx.registry.get('crafting'));
    const state = ctx.state;
    const p = state.player;
    const items = p.cargo.items || {};
    list.textContent = '';
    const frag = document.createDocumentFragment();

    // group blueprints by category for legibility
    const groups = { refine: [], assemble: [], augment: [], ship: [] };
    for (const bp of BLUEPRINTS) {
      const techOk = !bp.requiresTech || p.researchedNodes.includes(bp.requiresTech);
      // hide locked categories entirely? No — show them greyed so the player sees the path.
      (groups[bp.category] || (groups[bp.category] = [])).push({ bp, techOk });
    }

    for (const cat of ['refine', 'assemble', 'augment', 'ship']) {
      const arr = groups[cat];
      if (!arr || !arr.length) continue;
      const gh = document.createElement('div');
      gh.className = 'st-manuf-group-h';
      gh.textContent = TIER_LABEL[cat] || cat;
      frag.appendChild(gh);

      for (const { bp, techOk } of arr) {
        const card = document.createElement('div');
        card.className = 'sf-card st-manuf-card' + (techOk ? '' : ' st-manuf-locked');

        // material chips
        const matsHtml = Object.keys(bp.inputs).map((id) => {
          const need = bp.inputs[id], have = items[id] || 0;
          const ok = have >= need;
          const nm = niceName(id, 'commodity');
          return `<span class="st-mat-chip ${ok ? '' : 'st-mat-missing'}" title="${nm}">${nm} ${have}/${need}</span>`;
        }).join('');

        const outNm = niceName(bp.outputs.id, bp.outputs.kind);
        const qtyLabel = bp.outputs.qty > 1 ? ' ×' + bp.outputs.qty : '';
        const techLabel = (!techOk && bp.requiresTech) ? `<span class="sf-badge sf-badge--warn">🔒 ${bp.requiresTech}</span>` : '';

        // augment: note the consumed source module
        const augNote = (bp.category === 'augment' && bp.fromModule)
          ? `<div class="st-manuf-augnote">Consumes 1× ${niceName(bp.fromModule, 'module')}</div>` : '';

        // buildable check (mirror crafting.status, but cheap local version for the button state)
        let canBuild = techOk;
        for (const id in bp.inputs) if ((items[id] || 0) < bp.inputs[id]) canBuild = false;

        card.innerHTML =
          `<div class="st-manuf-card-h">
             <div class="st-manuf-title">${bp.name}${techLabel}</div>
             <button class="sf-btn sf-btn--primary st-manuf-build" data-act="build" data-bp="${bp.id}" ${canBuild ? '' : 'disabled'}>BUILD</button>
           </div>
           <div class="st-manuf-desc">${bp.desc || ''}</div>
           ${augNote}
           <div class="st-manuf-out">→ ${outNm}${qtyLabel}</div>
           <div class="st-manuf-mats">${matsHtml}</div>`;
        frag.appendChild(card);
      }
    }
    list.appendChild(frag);
  }

  return { root, refresh, panel: { refresh } };
}
