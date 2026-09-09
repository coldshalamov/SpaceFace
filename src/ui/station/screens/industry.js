// src/ui/station/screens/industry.js — "Industry" fabrication as a kit panel (Frontend Task C §1.7).
// Left: the processes under a k-caps per category — each blueprint a row (output × qty, the tier
// and its one-line readiness as the sub-line, the readiness as the name's colour only). Right: the
// output's name, the quantity at hero size ("per run"), the time as a hero ("seconds"), the inputs
// as static rows (have / need at emphasis; a missing input's name in k-bad with a "Source in
// market" word), the line's state as one sentence, and Fabricate as a word. Reuses the crafting
// system: ctx.crafting.build(bpId, stationId). `.sx-ind`, `.sx-ind-row[data-bp]`,
// `.sx-ind-row__name`, `.sx-ind-row__process`, `[data-source-cmdty]`, `[data-build]` are hooks.
import { fabricationArtworkHtml, fabricationProgress } from '../../art/operationArtwork.js';
import { BLUEPRINTS } from '../../../data/blueprints.js';
import { COMMODITIES } from '../../../data/commodities.js';
import { MODULES } from '../../../data/modules.js';
import { WEAPONS } from '../../../data/weapons.js';
import { SHIPS } from '../../../data/ships.js';
import { SECTORS } from '../../../data/sectors.js';
import { escapeHtml } from '../../comms.js';

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

// Short, single-line readiness reason for the row sub-line and the disabled verb. The full
// sentence — the industryReadiness label — is the status sentence and the accessible names, so a
// blocked requirement is stated once per surface.
function shortBlockLabel(bp, r) {
  if (r.state === 'station') return 'Needs ' + (bp.stationType === 'fab' ? 'fabricator' : 'refinery');
  if (r.state === 'materials') return 'Needs materials';
  return r.label;
}

/** The readiness as the row name's colour only: a gain · a signal · against you. */
function toneClass(r) {
  return r.state === 'ready' ? 'k-good' : (r.state === 'materials' ? 'k-signal' : 'k-bad');
}

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
  el.className = 'k-panel sx-ind';
  el.innerHTML =
    `<nav class="k-hang sx-ind__list" aria-label="Blueprints"></nav>` +
    `<section class="k-stage sx-ind__stage"></section>`;
  const listEl = el.querySelector('.sx-ind__list');
  const stageEl = el.querySelector('.sx-ind__stage');
  let selectedId = BLUEPRINTS[0] && BLUEPRINTS[0].id;
  let picked = false; // land on a recipe buildable at THIS station on first open
  let lastListHtml = '';
  let lastStageHtml = '';
  let buildError = '';
  let disposed = false;

  function renderList(state) {
    const stn = stationType(ctx);
    const html =
      `<div class="sx-ind-spindle" role="tablist" aria-label="Fabrication process and blueprints">` +
        CAT_ORDER.map((category) => {
          const blueprints = BLUEPRINTS.filter((bp) => bp.category === category);
          if (!blueprints.length) return '';
          return `<section class="sx-ind-process" data-process="${category}">` +
            `<p class="k-caps sx-ind-process__head">${CAT_LABEL[category]}</p>` +
            `<ul class="k-rows sx-ind-process__items">` + blueprints.map((bp) => {
              const r = industryReadiness(bp, state, stn);
              const selected = bp.id === selectedId;
              const output = `${niceName(bp.outputs.id, bp.outputs.kind)}${bp.outputs.qty > 1 ? ' × ' + bp.outputs.qty : ''}`;
              return `<li><button type="button" class="sx-ind-row k-row${selected ? ' is-active' : ''}" data-bp="${escapeHtml(bp.id)}" role="tab" aria-selected="${selected}" tabindex="${selected ? 0 : -1}"` +
                ` aria-label="${escapeHtml(output)}, ${CAT_LABEL[category]} process, tier ${bp.tier}, ${escapeHtml(r.label)}">` +
                `<span class="sx-ind-row__body">` +
                  `<span class="k-row__name sx-ind-row__name ${toneClass(r)}">${escapeHtml(output)}</span>` +
                  `<span class="k-row__sub sx-ind-row__tier">T${bp.tier} · ${escapeHtml(shortBlockLabel(bp, r))}</span>` +
                `</span>` +
                `<span class="k-row__sub sx-ind-row__process">${CAT_LABEL[category]}</span>` +
              `</button></li>`;
            }).join('') + `</ul>` +
          `</section>`;
        }).join('') +
      `</div>`;
    if (html !== lastListHtml) { listEl.innerHTML = html; lastListHtml = html; }
  }

  function renderStage(state) {
    const bp = BLUEPRINTS.find((b) => b.id === selectedId) || BLUEPRINTS[0];
    if (!bp) { stageEl.innerHTML = ''; return; }
    const it = items(state);
    const stn = stationType(ctx);
    const r = industryReadiness(bp, state, stn);
    const sid = state && state.ui && state.ui.dockedStationId;
    const queue = state && state.crafting && state.crafting.queues && sid && state.crafting.queues[sid];
    const queueBp = queue && BLUEPRINTS.find((item) => item.id === queue.bpId);
    const telemetry = fabricationProgress(queue);
    const progress = telemetry ? telemetry.percent / 100 : 0;

    const inputs = Object.keys(bp.inputs || {}).map((id) => {
      const need = bp.inputs[id]; const have = Math.floor(it[id] || 0);
      const ok = have >= need;
      return (
        `<li class="k-row k-row--static sx-fab-in${ok ? ' is-ok' : ' is-missing'}">` +
          `<span class="${ok ? 'k-row__name' : 'k-bad'} sx-fab-in__name">${escapeHtml(matName(id))}</span>` +
          (ok ? '' : `<button type="button" class="k-word k-word--fine sx-fab-in__source" data-source-cmdty="${escapeHtml(id)}" aria-label="Find missing ${escapeHtml(matName(id))} in Market">Source in market</button>`) +
          `<span class="k-row__num sx-fab-in__q${ok ? '' : ' k-bad'}">${have} <span class="k-62">/ ${need}</span></span>` +
        `</li>`
      );
    }).join('');

    // Notes that confirm a MATCHING facility, owned source or researched tech; a mismatch is already
    // the status sentence, so the requirement is never printed three times.
    const notes = [];
    if (bp.requiresTech) notes.push({ ok: researched(state).has(bp.requiresTech), text: 'Tech: ' + String(bp.requiresTech).replace(/^tech_/, '').replace(/_/g, ' ') });
    if (bp.stationType && (!stn || bp.stationType === stn)) notes.push({ ok: true, text: `${facilityName(bp.stationType)} online` });
    if (bp.category === 'augment' && bp.fromModule && ownsModule(state, bp.fromModule)) {
      notes.push({ ok: true, text: `${niceName(bp.fromModule, 'module')} ready to augment` });
    }

    const statusClass = queue ? 'k-signal' : (r.state === 'ready' ? 'k-good' : (r.state === 'materials' ? 'k-signal' : 'k-bad'));
    const status = queue
      ? `Fabricator occupied — ${escapeHtml((queueBp && queueBp.name) || queue.bpId || 'job')}, ${Math.round(progress * 100)}%, ${Math.max(0, Math.ceil((queue.total || 0) - (queue.elapsed || 0)))} s remaining.`
      : `${escapeHtml(r.label)}. One build slot, idle.`;
    const canBuild = r.state === 'ready' && !queue;

    const html =
      `<div class="sx-fab" data-line-state="${queue ? 'running' : r.state}">` +
        `<p class="k-caps sx-fab-head__cat">${CAT_LABEL[bp.category] || bp.category} · Tier ${bp.tier}</p>` +
        `<h2 class="k-display k-t-title sx-fab-head__name">${escapeHtml(niceName(bp.outputs.id, bp.outputs.kind))}</h2>` +
        (bp.desc ? `<p class="k-sentence sx-fab-head__desc">${escapeHtml(bp.desc)}</p>` : '') +
        `<div class="cd-fabricator-plinth">${fabricationArtworkHtml(bp.category)}</div>` +
        `<div class="sx-fab-heroes">` +
          `<div class="k-hero k-hero--hero sx-fab-out"><span class="k-hero__n">${bp.outputs.qty || 1}</span><span class="k-hero__w">${escapeHtml(bp.outputs.kind)} per run</span></div>` +
          `<div class="k-hero sx-fab-time"><span class="k-hero__n">${bp.timeS ? bp.timeS : '0'}</span><span class="k-hero__w">seconds</span></div>` +
        `</div>` +
        `<p class="k-caps sx-fab-col-k">Needs</p>` +
        (inputs ? `<ul class="k-rows sx-fab-inputs">${inputs}</ul>` : `<p class="k-sentence sx-muted">No inputs.</p>`) +
        (notes.length ? `<ul class="k-words k-words--row sx-fab-notes">${notes.map((n) => `<li class="k-t-fine ${n.ok ? 'k-62' : 'k-bad'} sx-fab-note">${escapeHtml(n.text)}</li>`).join('')}</ul>` : '') +
        `<div class="cd-fabrication-line">` +
          `<p class="k-sentence ${statusClass} sx-fab-status">${status}</p>` +
          (telemetry ? `<div class="cd-fabrication-progress" role="progressbar" aria-label="Current fabrication job" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${telemetry.percent}"><span style="transform:scaleX(${progress})"></span></div>` : '') +
        `</div>` +
        (buildError ? `<p class="cd-operation-error" role="alert">${escapeHtml(buildError)}</p>` : '') +
        `<ul class="k-words k-words--row sx-fab-foot"><li>` +
          `<button type="button" class="k-word k-word--emph k-word--primary sx-fab-build" data-build="${escapeHtml(bp.id)}"${canBuild ? '' : ' disabled aria-disabled="true"'}>` +
            `${queue ? 'Line occupied' : (r.state === 'ready' ? 'Fabricate' : escapeHtml(shortBlockLabel(bp, r)))}` +
          `</button>` +
        `</li></ul>` +
      `</div>`;
    if (html !== lastStageHtml) {
      const focused = stageEl.contains(document.activeElement) ? document.activeElement : null;
      const key = focused?.hasAttribute('data-build') ? '[data-build]' : focused?.getAttribute('data-source-cmdty');
      stageEl.innerHTML = html; lastStageHtml = html;
      if (key) {
        const target = key === '[data-build]' ? stageEl.querySelector(key)
          : stageEl.querySelector(`[data-source-cmdty="${CSS.escape(key)}"]`);
        if (target && !target.disabled) target.focus({ preventScroll: true });
      }
    }
  }

  function renderAll(state) { if (!disposed) { renderList(state); renderStage(state); } }

  function select(id, focus) {
    if (!id) return;
    selectedId = id;
    buildError = '';
    const state = ctx.state || {};
    renderAll(state);
    if (focus) {
      const row = listEl.querySelector(`[data-bp="${CSS.escape(id)}"]`);
      if (row && typeof row.focus === 'function') row.focus();
    }
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  }

  listEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-bp]'); if (!b) return;
    select(b.getAttribute('data-bp'), false);
  });
  // Arrow keys walk every blueprint across the categories (one tablist, roving tabindex).
  listEl.addEventListener('keydown', (ev) => {
    const rows = [...listEl.querySelectorAll('[data-bp]')];
    const cur = rows.indexOf(ev.target.closest('[data-bp]'));
    if (cur < 0 || !rows.length) return;
    let next = -1;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') next = (cur + 1) % rows.length;
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') next = (cur - 1 + rows.length) % rows.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = rows.length - 1;
    else return;
    ev.preventDefault();
    select(rows[next].getAttribute('data-bp'), true);
  });
  stageEl.addEventListener('click', (ev) => {
    const source = ev.target.closest('[data-source-cmdty]');
    if (source) {
      if (!ctx.bus) return;
      ctx.bus.emit('station:navigate', {
        destination: 'market',
        options: { tradeMode: 'buy', commodityId: source.getAttribute('data-source-cmdty') },
      });
      ctx.bus.emit('audio:cue', { id: 'ui_accept' });
      return;
    }
    const b = ev.target.closest('[data-build]'); if (!b || b.disabled) return;
    const bpId = b.getAttribute('data-build');
    const sid = ctx.state && ctx.state.ui && ctx.state.ui.dockedStationId;
    const crafting = ctx.crafting || (ctx.registry && ctx.registry.get && ctx.registry.get('crafting'));
    const accepted = attemptIndustryBuild({ crafting, bpId, stationId: sid });
    buildError = accepted ? '' : 'Build not accepted. Check materials and facility availability.';
    renderAll(ctx.state || {});
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
      disposed = true;
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
