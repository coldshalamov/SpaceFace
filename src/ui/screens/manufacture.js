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
import { TECH_NODES } from '../../data/tech.js';
import { escapeHtml } from '../comms.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const MOD_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const WPN_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const TECH_BY_ID = new Map(TECH_NODES.map((t) => [t.id, t]));
const TIER_LABEL = { refine: 'REFINE', assemble: 'ASSEMBLE', augment: 'AUGMENT', ship: 'SHIPYARD' };

function rawName(id, kind) {
  return (() => {
    if (kind === 'ship') return (SHIP_BY_ID.get(id) || {}).name || id;
    if (kind === 'weapon') return (WPN_BY_ID.get(id) || {}).name || id;
    if (kind === 'module') return (MOD_BY_ID.get(id) || {}).name || id;
    return (CMDTY_BY_ID.get(id) || {}).name || id;
  })();
}

function niceName(id, kind) {
  return escapeHtml(rawName(id, kind));
}

function techName(id) {
  const node = TECH_BY_ID.get(id);
  return (node && node.name) || String(id || 'required tech').replace(/^tech_/, '').replace(/_/g, ' ');
}

function blueprintOutputLabel(bp) {
  if (!bp || !bp.outputs) return 'unknown output';
  const qty = Math.max(1, Number(bp.outputs.qty) || 1);
  return rawName(bp.outputs.id, bp.outputs.kind) + (qty > 1 ? ' ×' + qty : '');
}

function blueprintBusy(bp, opts = {}) {
  if (!opts.busy) return false;
  if (typeof opts.busyForBlueprint === 'function') return !!opts.busyForBlueprint(bp);
  if (typeof opts.buildTime === 'function') return Number(opts.buildTime(bp)) > 0;
  return true;
}

export function describeManufactureBuildAction(bp, player = {}, opts = {}) {
  if (!bp) {
    return {
      state: 'missing',
      disabled: true,
      label: 'Unavailable',
      title: 'Select a blueprint to inspect build options.',
    };
  }
  const researched = new Set(player.researchedNodes || []);
  const items = (player.cargo && player.cargo.items) || {};
  if (bp.requiresTech && !researched.has(bp.requiresTech)) {
    const req = techName(bp.requiresTech);
    return {
      state: 'tech',
      disabled: true,
      label: 'Research ' + req,
      title: bp.name + ' requires ' + req + ' before manufacturing.',
    };
  }
  if (bp.category === 'augment' && bp.fromModule && countOwnedModule(player, bp.fromModule) <= 0) {
    const source = rawName(bp.fromModule, 'module');
    return {
      state: 'source',
      disabled: true,
      label: 'Need ' + source,
      title: bp.name + ' consumes one owned ' + source + '.',
    };
  }
  for (const id in (bp.inputs || {})) {
    const need = Math.max(0, Number(bp.inputs[id]) || 0);
    const have = Math.max(0, Number(items[id]) || 0);
    if (have < need) {
      const missing = need - have;
      const material = rawName(id, 'commodity');
      return {
        state: 'materials',
        disabled: true,
        label: 'Need ' + missing + ' ' + material,
        title: bp.name + ' needs ' + need + ' ' + material + '; you have ' + have + '.',
      };
    }
  }
  if (opts.busy) {
    return {
      state: 'busy',
      disabled: true,
      label: 'Fab busy',
      title: 'Finish ' + (opts.inProgress || 'the current fabrication job') + ' before starting ' + bp.name + '.',
    };
  }
  return {
    state: 'available',
    disabled: false,
    label: 'Build',
    title: 'Build ' + bp.name + '.',
  };
}

export function recommendManufactureStep(player = {}, opts = {}) {
  const blueprints = Array.isArray(opts.blueprints) ? opts.blueprints : BLUEPRINTS;
  const entries = blueprints.map((bp) => ({
    bp,
    action: describeManufactureBuildAction(bp, player, {
      ...opts,
      busy: blueprintBusy(bp, opts),
    }),
  }));
  const available = entries.find((entry) => entry.action.state === 'available');
  if (available) {
    return {
      state: 'available',
      kind: 'ok',
      title: 'Ready build: ' + available.bp.name,
      detail: available.action.title + ' Output: ' + blueprintOutputLabel(available.bp) + '.',
    };
  }
  const busy = entries.find((entry) => entry.action.state === 'busy');
  if (busy) {
    return {
      state: 'busy',
      kind: 'warn',
      title: 'Fabricator occupied',
      detail: busy.action.title + ' Review the queue before committing more materials.',
    };
  }
  const materials = entries.find((entry) => entry.action.state === 'materials');
  if (materials) {
    return {
      state: 'materials',
      kind: 'warn',
      title: materials.action.label,
      detail: materials.action.title + ' Mine, salvage, buy cargo, or follow a trade route for the missing input.',
    };
  }
  const source = entries.find((entry) => entry.action.state === 'source');
  if (source) {
    return {
      state: 'source',
      kind: 'warn',
      title: source.action.label,
      detail: source.action.title + ' Buy, build, or unfit the source module before augmenting it.',
    };
  }
  const tech = entries.find((entry) => entry.action.state === 'tech');
  if (tech) {
    return {
      state: 'tech',
      kind: 'warn',
      title: tech.action.label,
      detail: tech.action.title + ' Track the prerequisite in the Tech Tree, then return to this station.',
    };
  }
  return {
    state: 'empty',
    kind: 'info',
    title: 'No manufacturing step available',
    detail: 'This station has no usable blueprint path right now. Check another fab/refinery or bring more inputs.',
  };
}

function countOwnedModule(player, defId) {
  let count = 0;
  for (const item of (player.moduleInventory || [])) if (item && item.defId === defId) count++;
  for (const ship of (player.ownedShips || [])) {
    for (const fitting of (ship && ship.fittings) || []) if (fitting === defId) count++;
  }
  return count;
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

  const advisor = document.createElement('div');
  advisor.className = 'st-mission-guide st-manuf-advisor';
  root.appendChild(advisor);

  const list = document.createElement('div');
  list.className = 'st-manuf-list';
  root.appendChild(list);

  list.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-act="build"]');
    if (!btn || btn.disabled) return;
    const bpId = btn.getAttribute('data-bp');
    const crafting = ctx.crafting || (ctx.registry && ctx.registry.get('crafting'));
    // pass the docked station id so the build lands in that station's queue (V2 cut-list #3)
    const sid = ctx.state.ui && ctx.state.ui.dockedStationId;
    if (crafting && crafting.build(bpId, sid)) refresh();
  });
  // refresh when cargo/credits/research change so costs + availability update live
  ctx.bus.on('cargo:changed', () => { if (root.closest('.st-tabpanel') && root.closest('.st-tabpanel').style.display !== 'none') refresh(); });
  ctx.bus.on('credits:changed', () => { if (root.closest('.st-tabpanel') && root.closest('.st-tabpanel').style.display !== 'none') refresh(); });
  ctx.bus.on('craft:complete', () => refresh());
  ctx.bus.on('craft:queueChanged', () => refresh());   // build enqueued/completed -> re-render
  ctx.bus.on('tech:researched', () => refresh());

  function refresh() {
    const crafting = ctx.crafting || (ctx.registry && ctx.registry.get('crafting'));
    const state = ctx.state;
    const p = state.player;
    const items = p.cargo.items || {};
    const sid = ctx.state.ui && ctx.state.ui.dockedStationId;
    const busy = crafting && crafting.isBusy && crafting.isBusy(sid);
    const inProgress = busy && crafting.progress && crafting._currentJobName
      ? crafting._currentJobName(sid) : null;
    const nextStep = recommendManufactureStep(p, {
      busy,
      inProgress,
      buildTime: (bp) => (crafting ? crafting.buildTime(bp) : 0),
    });
    advisor.innerHTML =
      '<div class="st-mission-preflight">' +
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--info">MANUFACTURING ADVISOR</span>' +
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--' + (nextStep.kind === 'ok' ? 'ok' : 'warn') + '">' + escapeHtml(nextStep.state.toUpperCase()) + '</span>' +
      '</div>' +
      '<div class="st-mission-purpose"><b>' + escapeHtml(nextStep.title) + ':</b> ' + escapeHtml(nextStep.detail) + '</div>';
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
        const techLabel = (!techOk && bp.requiresTech) ? `<span class="sf-badge sf-badge--warn">🔒 ${escapeHtml(techName(bp.requiresTech))}</span>` : '';

        // augment: note the consumed source module
        const augNote = (bp.category === 'augment' && bp.fromModule)
          ? `<div class="st-manuf-augnote">Consumes 1× ${niceName(bp.fromModule, 'module')}</div>` : '';

        // V2 cut-list #3: timed recipes share a 1-slot queue per station — disable build while busy
        const timeS = crafting ? crafting.buildTime(bp) : 0;
        const bpBusy = timeS > 0 && busy;
        const buildAction = describeManufactureBuildAction(bp, p, { busy: bpBusy, inProgress });
        const canBuild = !buildAction.disabled;

        const timeLabel = timeS > 0 ? `<span class="st-manuf-time">${Math.round(timeS)}s fab</span>` : '';

        card.innerHTML =
          `<div class="st-manuf-card-h">
             <div class="st-manuf-title">${escapeHtml(bp.name)}${techLabel}</div>
             <button class="sf-btn sf-btn--primary st-manuf-build" data-act="build" data-bp="${escapeHtml(bp.id)}" title="${escapeHtml(buildAction.title)}" aria-label="${escapeHtml(buildAction.title)}" ${canBuild ? '' : 'disabled'}>${escapeHtml(buildAction.label)}</button>
           </div>
           <div class="st-manuf-desc">${escapeHtml(bp.desc || '')}${timeLabel}</div>
           ${augNote}
           <div class="st-manuf-out">→ ${outNm}${qtyLabel}</div>
           <div class="st-manuf-mats">${matsHtml}</div>`;
        frag.appendChild(card);
      }
    }
    list.appendChild(frag);
  }

  return { el: root, refresh, onShow: () => refresh(), panel: { refresh } };
}
