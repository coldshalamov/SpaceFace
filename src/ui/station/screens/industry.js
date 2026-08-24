// src/ui/station/screens/industry.js — "Industry" fabrication instrument.
// Blueprint list · a fabrication schematic (inputs → output with per-material have/need meters) ·
// a build console. Reuses the crafting system: ctx.crafting.build(bpId, stationId).
import { BLUEPRINTS } from '../../../data/blueprints.js';
import { COMMODITIES } from '../../../data/commodities.js';
import { MODULES } from '../../../data/modules.js';
import { WEAPONS } from '../../../data/weapons.js';
import { SHIPS } from '../../../data/ships.js';
import { SECTORS } from '../../../data/sectors.js';
import { escapeHtml } from '../../comms.js';
import { icon } from '../icons.js';

const NAME = new Map();
for (const c of COMMODITIES) NAME.set('commodity:' + c.id, c.name);
for (const m of MODULES) NAME.set('module:' + m.id, m.name);
for (const w of WEAPONS) NAME.set('weapon:' + w.id, w.name);
for (const s of SHIPS) NAME.set('ship:' + s.id, s.name);
const CMDTY_NAME = new Map(COMMODITIES.map((c) => [c.id, c.name]));
const STATION_TYPE = new Map();
for (const sec of SECTORS) for (const s of (sec.stations || [])) STATION_TYPE.set(s.id, s.type);

const CAT_LABEL = { refine: 'Refine', assemble: 'Assemble', augment: 'Augment', ship: 'Shipyard' };
const CAT_ICON = { refine: 'cargo', assemble: 'industry', augment: 'spark', ship: 'shipworks' };
const CAT_ORDER = ['refine', 'assemble', 'augment', 'ship'];
const FACILITY_LABEL = { refinery: 'refinery station', fab: 'fabrication station' };

function niceName(id, kind) { return NAME.get((kind || 'commodity') + ':' + id) || String(id).replace(/^cmdty_|^mod_|^wpn_|^ship_/, '').replace(/_/g, ' '); }
function matName(id) { return CMDTY_NAME.get(id) || String(id).replace(/^cmdty_/, '').replace(/_/g, ' '); }
function researched(state) { const r = state && state.player && (state.player.researchedNodes || state.player.researched); return new Set(Array.isArray(r) ? r : []); }
function items(state) { return (state && state.player && state.player.cargo && state.player.cargo.items) || {}; }
function stationType(ctx) {
  if (ctx.station && ctx.station.type) return ctx.station.type;
  const id = ctx.state && ctx.state.ui && ctx.state.ui.dockedStationId;
  return (id && STATION_TYPE.get(id)) || null;
}
function facilityName(type) { return FACILITY_LABEL[type] || `${String(type || 'specialist')} station`; }

function ownsModule(state, defId) {
  const player = state && state.player;
  if (!player || !defId) return false;
  if ((player.moduleInventory || []).some((module) => module && module.defId === defId)) return true;
  return (player.ownedShips || []).some((ship) => (ship && ship.fittings || []).includes(defId));
}

export function industryReadiness(bp, state, stnType) {
  if (bp.requiresTech && !researched(state).has(bp.requiresTech)) return { state: 'tech', label: 'Tech locked' };
  if (bp.stationType && stnType && bp.stationType !== stnType) return { state: 'station', label: `Requires ${facilityName(bp.stationType)}` };
  if (bp.category === 'augment' && bp.fromModule && !ownsModule(state, bp.fromModule)) {
    return { state: 'source', label: `Needs ${niceName(bp.fromModule, 'module')}` };
  }
  const it = items(state);
  for (const id in (bp.inputs || {})) if ((it[id] || 0) < bp.inputs[id]) return { state: 'materials', label: 'Missing materials' };
  return { state: 'ready', label: 'Ready to build' };
}

export function createIndustryScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'sx-ind';
  el.innerHTML =
    `<nav class="sx-ind__list" aria-label="Blueprints"></nav>` +
    `<section class="sx-ind__stage"></section>` +
    `<aside class="sx-ind__console"></aside>`;
  const listEl = el.querySelector('.sx-ind__list');
  const stageEl = el.querySelector('.sx-ind__stage');
  const consoleEl = el.querySelector('.sx-ind__console');
  let selectedId = BLUEPRINTS[0] && BLUEPRINTS[0].id;
  let picked = false; // land on a recipe buildable at THIS station on first open

  function renderList(state) {
    const stn = stationType(ctx);
    listEl.innerHTML =
      `<span class="sx-ind-spindle__label" aria-hidden="true">MADE CAPABLE</span>` +
      `<div class="sx-ind-spindle" role="tablist" aria-label="Fabrication process and blueprints">` +
        CAT_ORDER.map((category, processIndex) => {
          const blueprints = BLUEPRINTS.filter((bp) => bp.category === category);
          return `<section class="sx-ind-process" data-process="${category}">` +
            `<header class="sx-ind-process__head"><span>${icon(CAT_ICON[category], 15)}</span><b>${CAT_LABEL[category]}</b><i>${String(processIndex + 1).padStart(2, '0')}</i></header>` +
            `<div class="sx-ind-process__items">` + blueprints.map((bp) => {
              const r = industryReadiness(bp, state, stn);
              const on = bp.id === selectedId ? ' is-active' : '';
              const tone = r.state === 'ready' ? 'var(--gain)' : r.state === 'materials' ? 'var(--warn)' : '#60757a';
              const output = `${niceName(bp.outputs.id, bp.outputs.kind)}${bp.outputs.qty > 1 ? ' ×' + bp.outputs.qty : ''}`;
              return `<button type="button" class="sx-ind-row${on}" data-bp="${escapeHtml(bp.id)}" role="tab" aria-selected="${bp.id === selectedId}" style="--signal:${tone}" aria-label="${escapeHtml(output)}, ${CAT_LABEL[category]} process, tier ${bp.tier}, ${escapeHtml(r.label)}">` +
                `<span class="sx-ind-row__dot" aria-hidden="true"></span>` +
                `<span class="sx-ind-row__process">${CAT_LABEL[category]}</span>` +
                `<span class="sx-ind-row__name">${escapeHtml(output)}</span>` +
                `<span class="sx-ind-row__tier">T${bp.tier} · ${escapeHtml(r.label)}</span>` +
              `</button>`;
            }).join('') + `</div>` +
          `</section>`;
        }).join('') +
      `</div>`;
  }

  function renderStage(state) {
    const bp = BLUEPRINTS.find((b) => b.id === selectedId) || BLUEPRINTS[0];
    if (!bp) { stageEl.innerHTML = ''; return; }
    const it = items(state);
    const inputs = Object.keys(bp.inputs || {}).map((id) => {
      const need = bp.inputs[id]; const have = Math.floor(it[id] || 0);
      const ok = have >= need; const frac = Math.max(0, Math.min(1, need ? have / need : 1));
      const tag = ok ? 'div' : 'button';
      const source = ok ? '' : ` type="button" data-source-cmdty="${escapeHtml(id)}" aria-label="Find missing ${escapeHtml(matName(id))} in Market"`;
      return (
        `<${tag} class="sx-fab-in${ok ? ' is-ok' : ' is-missing'}"${source}>` +
          `<span class="sx-fab-in__ic">${icon('cargo', 16)}</span>` +
          `<span class="sx-fab-in__name">${escapeHtml(matName(id))}</span>` +
          `<span class="sx-fab-in__bar"><span style="width:${(frac * 100).toFixed(0)}%;background:${ok ? 'var(--gain)' : 'var(--warn)'}"></span></span>` +
          `<span class="sx-fab-in__q">${have}<i>/${need}</i></span>` +
          (!ok ? `<span class="sx-fab-in__source">SOURCE IN MARKET</span>` : '') +
        `</${tag}>`
      );
    }).join('');
    stageEl.innerHTML =
      `<header class="sx-fab-head"><span class="sx-fab-head__cat">${CAT_LABEL[bp.category] || bp.category} · Tier ${bp.tier}</span><h2>${escapeHtml(bp.name)}</h2>` +
        (bp.desc ? `<p>${escapeHtml(bp.desc)}</p>` : '') + `</header>` +
      `<div class="sx-fab-flow">` +
        `<div class="sx-fab-inputs"><span class="sx-fab-col-k">Inputs</span>${inputs || '<p class="sx-muted">No inputs</p>'}</div>` +
        `<div class="sx-fab-arrow">${icon('chevron', 22)}<span>${bp.timeS ? bp.timeS + 's' : 'instant'}</span></div>` +
        `<div class="sx-fab-output"><span class="sx-fab-col-k">Output</span>` +
          `<div class="sx-fab-out-card"><span class="sx-fab-out__kind">${bp.outputs.kind}</span>` +
            `<span class="sx-fab-out__name">${escapeHtml(niceName(bp.outputs.id, bp.outputs.kind))}</span>` +
            `<span class="sx-fab-out__qty">×${bp.outputs.qty || 1}</span></div>` +
        `</div>` +
      `</div>`;
  }

  function renderConsole(state) {
    const bp = BLUEPRINTS.find((b) => b.id === selectedId) || BLUEPRINTS[0];
    if (!bp) { consoleEl.innerHTML = ''; return; }
    const stn = stationType(ctx);
    const r = industryReadiness(bp, state, stn);
    const tone = r.state === 'ready' ? 'gain' : r.state === 'materials' ? 'warn' : 'loss';
    const sid = state && state.ui && state.ui.dockedStationId;
    const queue = state && state.crafting && state.crafting.queues && sid && state.crafting.queues[sid];
    const queueBp = queue && BLUEPRINTS.find((item) => item.id === queue.bpId);
    const progress = queue && queue.total > 0 ? Math.max(0, Math.min(1, (Number(queue.elapsed) || 0) / queue.total)) : 0;
    const notes = [];
    if (bp.requiresTech) notes.push({ ok: researched(state).has(bp.requiresTech), text: 'Tech: ' + String(bp.requiresTech).replace(/^tech_/, '').replace(/_/g, ' ') });
    if (bp.stationType) {
      const matches = !stn || bp.stationType === stn;
      notes.push({ ok: matches, text: matches ? `${facilityName(bp.stationType)} online` : `Required: ${facilityName(bp.stationType)}` });
    }
    if (bp.category === 'augment' && bp.fromModule) {
      const sourceName = niceName(bp.fromModule, 'module');
      const sourceOwned = ownsModule(state, bp.fromModule);
      notes.push({ ok: sourceOwned, text: sourceOwned ? `${sourceName} ready to augment` : `Required source: ${sourceName}` });
    }
    consoleEl.innerHTML =
      `<div class="sx-panel">` +
        `<div class="sx-fab-status sx-fab-status--${queue ? 'warn' : tone}"><span class="sx-fab-status__dot"></span>${queue ? 'Fabricator occupied' : r.label}</div>` +
        (queue ? `<div class="sx-fab-queue"><span>ACTIVE LINE / ${escapeHtml((queueBp && queueBp.name) || queue.bpId || 'job')}</span><b>${Math.round(progress * 100)}%</b><i><span style="width:${(progress * 100).toFixed(1)}%"></span></i><em>${Math.max(0, Math.ceil((queue.total || 0) - (queue.elapsed || 0)))}s remaining</em></div>` : `<div class="sx-fab-queue is-idle"><span>ACTIVE LINE</span><b>IDLE</b><em>One strategic build slot available</em></div>`) +
        `<div class="sx-fab-notes">${notes.map((n) => `<div class="sx-fab-note${n.ok ? ' is-ok' : ''}">${icon(n.ok ? 'spark' : 'info', 13)}<span>${escapeHtml(n.text)}</span></div>`).join('')}</div>` +
        `<button type="button" class="sx-btn-primary" data-build="${escapeHtml(bp.id)}" ${r.state === 'ready' && !queue ? '' : 'disabled'}>${queue ? 'Line occupied' : (r.state === 'ready' ? 'Fabricate' : r.label)}</button>` +
      `</div>`;
  }

  function renderAll(state) { renderList(state); renderStage(state); renderConsole(state); }

  listEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-bp]'); if (!b) return;
    selectedId = b.getAttribute('data-bp');
    const state = ctx.state || {};
    renderList(state); renderStage(state); renderConsole(state);
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  });
  stageEl.addEventListener('click', (ev) => {
    const source = ev.target.closest('[data-source-cmdty]');
    if (!source || !ctx.bus) return;
    ctx.bus.emit('station:navigate', {
      destination: 'market',
      options: { tradeMode: 'buy', commodityId: source.getAttribute('data-source-cmdty') },
    });
    ctx.bus.emit('audio:cue', { id: 'ui_accept' });
  });
  consoleEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-build]'); if (!b || b.disabled) return;
    const bpId = b.getAttribute('data-build');
    const sid = ctx.state && ctx.state.ui && ctx.state.ui.dockedStationId;
    const crafting = ctx.crafting || (ctx.registry && ctx.registry.get && ctx.registry.get('crafting'));
    attemptIndustryBuild({ crafting, bpId, stationId: sid });
    setTimeout(() => renderAll(ctx.state || {}), 80);
  });
  const onCraftChanged = () => renderAll(ctx.state || {});
  if (ctx.bus && ctx.bus.on) { ctx.bus.on('craft:complete', onCraftChanged); ctx.bus.on('craft:queueChanged', onCraftChanged); }

  return {
    el,
    onShow(c) {
      const st = (c || ctx).state || {};
      if (!picked) {
        const stn = stationType(ctx);
        const b = BLUEPRINTS.find((bp) => { const s = industryReadiness(bp, st, stn).state; return s === 'ready' || s === 'materials'; });
        if (b) selectedId = b.id;
        picked = true;
      }
      renderAll(st);
    },
    refresh(c) { renderAll((c || ctx).state || {}); },
    dispose() {
      if (ctx.bus && ctx.bus.off) {
        ctx.bus.off('craft:complete', onCraftChanged);
        ctx.bus.off('craft:queueChanged', onCraftChanged);
      }
    },
  };
}

export function attemptIndustryBuild({ crafting, bpId, stationId }) {
  if (!crafting || typeof crafting.build !== 'function') return false;
  try { return crafting.build(bpId, stationId) === true; } catch (_) { return false; }
}
