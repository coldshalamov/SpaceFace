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
const CAT_ORDER = ['refine', 'assemble', 'augment', 'ship'];

function niceName(id, kind) { return NAME.get((kind || 'commodity') + ':' + id) || String(id).replace(/^cmdty_|^mod_|^wpn_|^ship_/, '').replace(/_/g, ' '); }
function matName(id) { return CMDTY_NAME.get(id) || String(id).replace(/^cmdty_/, '').replace(/_/g, ' '); }
function researched(state) { const r = state && state.player && (state.player.researchedNodes || state.player.researched); return new Set(Array.isArray(r) ? r : []); }
function items(state) { return (state && state.player && state.player.cargo && state.player.cargo.items) || {}; }
function stationType(ctx) {
  if (ctx.station && ctx.station.type) return ctx.station.type;
  const id = ctx.state && ctx.state.ui && ctx.state.ui.dockedStationId;
  return (id && STATION_TYPE.get(id)) || null;
}

function readiness(bp, state, stnType) {
  if (bp.requiresTech && !researched(state).has(bp.requiresTech)) return { state: 'tech', label: 'Tech locked' };
  if (bp.stationType && stnType && bp.stationType !== stnType) return { state: 'station', label: 'Not buildable here' };
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
    const byCat = new Map();
    for (const bp of BLUEPRINTS) { if (!byCat.has(bp.category)) byCat.set(bp.category, []); byCat.get(bp.category).push(bp); }
    let html = '';
    for (const cat of CAT_ORDER) {
      const list = byCat.get(cat); if (!list) continue;
      html += `<div class="sx-ind-cat">${CAT_LABEL[cat] || cat}</div>`;
      html += list.map((bp) => {
        const r = readiness(bp, state, stn);
        const on = bp.id === selectedId ? ' is-active' : '';
        const dot = r.state === 'ready' ? 'var(--gain)' : r.state === 'materials' ? 'var(--warn)' : 'var(--ink-3)';
        return (
          `<button type="button" class="sx-ind-row${on}" data-bp="${escapeHtml(bp.id)}" role="tab" aria-selected="${bp.id === selectedId}">` +
            `<span class="sx-ind-row__dot" style="background:${dot}"></span>` +
            `<span class="sx-ind-row__name">${escapeHtml(niceName(bp.outputs.id, bp.outputs.kind))}${bp.outputs.qty > 1 ? ' ×' + bp.outputs.qty : ''}</span>` +
            `<span class="sx-ind-row__tier">T${bp.tier}</span>` +
          `</button>`
        );
      }).join('');
    }
    listEl.innerHTML = html;
  }

  function renderStage(state) {
    const bp = BLUEPRINTS.find((b) => b.id === selectedId) || BLUEPRINTS[0];
    if (!bp) { stageEl.innerHTML = ''; return; }
    const it = items(state);
    const inputs = Object.keys(bp.inputs || {}).map((id) => {
      const need = bp.inputs[id]; const have = Math.floor(it[id] || 0);
      const ok = have >= need; const frac = Math.max(0, Math.min(1, need ? have / need : 1));
      return (
        `<div class="sx-fab-in${ok ? ' is-ok' : ''}">` +
          `<span class="sx-fab-in__ic">${icon('cargo', 16)}</span>` +
          `<span class="sx-fab-in__name">${escapeHtml(matName(id))}</span>` +
          `<span class="sx-fab-in__bar"><span style="width:${(frac * 100).toFixed(0)}%;background:${ok ? 'var(--gain)' : 'var(--warn)'}"></span></span>` +
          `<span class="sx-fab-in__q">${have}<i>/${need}</i></span>` +
        `</div>`
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
    const r = readiness(bp, state, stn);
    const tone = r.state === 'ready' ? 'gain' : r.state === 'materials' ? 'warn' : 'loss';
    const notes = [];
    if (bp.requiresTech) notes.push({ ok: researched(state).has(bp.requiresTech), text: 'Tech: ' + String(bp.requiresTech).replace(/^tech_/, '').replace(/_/g, ' ') });
    if (bp.stationType) notes.push({ ok: !stn || bp.stationType === stn, text: 'Facility: ' + bp.stationType + ' bay' });
    consoleEl.innerHTML =
      `<div class="sx-panel">` +
        `<div class="sx-fab-status sx-fab-status--${tone}"><span class="sx-fab-status__dot"></span>${r.label}</div>` +
        `<div class="sx-fab-notes">${notes.map((n) => `<div class="sx-fab-note${n.ok ? ' is-ok' : ''}">${icon(n.ok ? 'spark' : 'info', 13)}<span>${escapeHtml(n.text)}</span></div>`).join('')}</div>` +
        `<button type="button" class="sx-btn-primary" data-build="${escapeHtml(bp.id)}" ${r.state === 'ready' ? '' : 'disabled'}>${r.state === 'ready' ? 'Fabricate' : r.label}</button>` +
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
  consoleEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-build]'); if (!b || b.disabled) return;
    const bpId = b.getAttribute('data-build');
    const sid = ctx.state && ctx.state.ui && ctx.state.ui.dockedStationId;
    const crafting = ctx.crafting || (ctx.registry && ctx.registry.get && ctx.registry.get('crafting'));
    if (crafting && typeof crafting.build === 'function') { try { crafting.build(bpId, sid); } catch (_) {} }
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_accept' });
    setTimeout(() => renderAll(ctx.state || {}), 80);
  });
  if (ctx.bus && ctx.bus.on) { ctx.bus.on('craft:complete', () => renderAll(ctx.state || {})); ctx.bus.on('craft:queueChanged', () => renderAll(ctx.state || {})); }

  return {
    el,
    onShow(c) {
      const st = (c || ctx).state || {};
      if (!picked) {
        const stn = stationType(ctx);
        const b = BLUEPRINTS.find((bp) => { const s = readiness(bp, st, stn).state; return s === 'ready' || s === 'materials'; });
        if (b) selectedId = b.id;
        picked = true;
      }
      renderAll(st);
    },
    refresh(c) { renderAll((c || ctx).state || {}); },
    dispose() {},
  };
}
