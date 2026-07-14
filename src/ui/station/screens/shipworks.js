// src/ui/station/screens/shipworks.js — "Shipworks": shipyard (buy hulls) + outfitter (fit
// modules) merged around ONE central ship preview. Fleet/Buy modes on the left; the ship is the
// hero object; slots are clickable — clicking one dims the room and reveals compatible modules.
// One reused preview mount (createShipPreviewMount) = the perf fix vs. a renderer-per-open.
// Emits ui:buyShip / ui:setActiveShip / ui:sellShip / ui:buyModule / ui:fitModule / ui:unfitModule.
//
// Engineering numbers come only from presenters/engineeringPreview.js → ships.getDerivedStats.
// Never invent simplified fittings/geometry or raw module.mods key diffs as flight stats.
import { buildSlotList, fits } from '../../../systems/ships.js';
import { SHIPS } from '../../../data/ships.js';
import { MODULES } from '../../../data/modules.js';
import { WEAPONS } from '../../../data/weapons.js';
import { escapeHtml } from '../../comms.js';
import { icon } from '../icons.js';
import { createShipPreviewMount } from '../../shipPreviewMount.js';
import {
  formatPreviewDelta,
  presentDerivedReadout,
  presentModuleFitPreview,
  presentShopModuleDelta,
  stockPreviewPlayer,
} from '../../presenters/engineeringPreview.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const FITTABLE = MODULES.concat(WEAPONS);
const FITTABLE_BY_ID = new Map(FITTABLE.map((d) => [d.id, d]));

const SLOT_ICON = { weapon: 'target', shield: 'hull', engine: 'refuel', cargo: 'cargo', mining: 'industry', utility: 'spark' };
const SLOT_LABEL = { weapon: 'Weapon', shield: 'Shield', engine: 'Engine', cargo: 'Cargo', mining: 'Mining', utility: 'Utility' };

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const shipName = (id) => { const s = SHIP_BY_ID.get(id); return s ? s.name : id; };

function researched(state) {
  const r = state && state.player && (state.player.researchedNodes || state.player.researched);
  return new Set(Array.isArray(r) ? r : []);
}
function moduleLocked(d, state) { return !!(d.requiresTech && !researched(state).has(d.requiresTech)); }

/** Sum catalog DPS from real fitted weapons only (not mining beams, not invented flats). */
function fittedWeaponDps(fittings) {
  let dps = 0;
  for (const id of fittings || []) {
    if (!id) continue;
    const d = FITTABLE_BY_ID.get(id);
    if (d && d.slotType === 'weapon' && Number.isFinite(d.dps)) dps += d.dps;
  }
  return dps;
}

function fittedIdentityLine(def) {
  if (!def) return '';
  const parts = [];
  if (def.size) parts.push(String(def.size));
  if (def.tier != null) parts.push('T' + def.tier);
  return parts.join(' · ');
}

export function createShipworksScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'sx-sw';
  el.innerHTML =
    `<nav class="sx-sw__rail">` +
      `<div class="sx-seg"><button type="button" class="sx-seg__btn is-on" data-mode="fleet">My Fleet</button><button type="button" class="sx-seg__btn" data-mode="buy">Buy Hull</button></div>` +
      `<div class="sx-sw__list"></div>` +
    `</nav>` +
    `<section class="sx-sw__main">` +
      `<div class="sx-sw__stage"><canvas class="sx-sw__canvas"></canvas><div class="sx-sw__nameplate"></div></div>` +
      `<div class="sx-sw__stats"></div>` +
    `</section>` +
    `<aside class="sx-sw__side"></aside>` +
    `<div class="sx-sw__chooser" hidden></div>`;

  const railListEl = el.querySelector('.sx-sw__list');
  const canvas = el.querySelector('.sx-sw__canvas');
  const nameplateEl = el.querySelector('.sx-sw__nameplate');
  const statsEl = el.querySelector('.sx-sw__stats');
  const sideEl = el.querySelector('.sx-sw__side');
  const chooserEl = el.querySelector('.sx-sw__chooser');

  // Authored mesh required — never treat box-LOD / false warmup as primary truth.
  canvas.dataset.authoredRequired = 'true';
  canvas.dataset.fallbackAllowed = 'false';
  canvas.dataset.previewReady = 'false';

  let mode = 'fleet';
  let viewIdx = 0;          // owned ship index being viewed/fitted
  let buyId = SHIPS[0].id;  // hull being previewed in Buy mode
  let mount = null;
  let curPreviewKey = '';
  let expectedPreviewDefId = null;
  let ghostActive = false;

  function owned() { return (ctx.state.player && ctx.state.player.ownedShips) || []; }
  function viewedShip() { const o = owned(); return o[viewIdx] || o[ctx.state.player && ctx.state.player.activeShipIndex] || o[0] || null; }

  function writeCanvasPreviewMeta(defId, fittings, meta) {
    canvas.dataset.previewDefId = defId || '';
    canvas.dataset.previewFittings = JSON.stringify(Array.isArray(fittings) ? fittings : []);
    canvas.dataset.fallbackAllowed = 'false';
    if (meta && meta.mode === 'module') {
      canvas.dataset.previewMode = 'module';
      canvas.dataset.previewModule = meta.moduleId || '';
    } else {
      delete canvas.dataset.previewMode;
      delete canvas.dataset.previewModule;
    }
  }

  function ensureMount() {
    if (mount) return mount;
    canvas.dataset.authoredRequired = 'true';
    canvas.dataset.fallbackAllowed = 'false';
    canvas.dataset.previewReady = 'false';
    mount = createShipPreviewMount(canvas, {
      allowFastFallback: false,
      authoredShips: true,
      authoredWarmup: true,
      onFirstFrame: ({ defId } = {}) => {
        // Ready only when the mount actually rendered the requested def — never on false/fallback.
        if (!defId || defId !== expectedPreviewDefId) return;
        canvas.dataset.previewReady = 'true';
        canvas.dataset.previewDefId = defId;
      },
    });
    // Warm authored assets; do not mark ready from a false/failed warmup.
    try {
      const warm = mount.warmAssets && mount.warmAssets();
      if (warm && typeof warm.then === 'function') {
        warm.then((ok) => {
          if (ok !== true) return;
          // Warm success alone is not readiness; onFirstFrame still owns previewReady.
        }).catch(() => { /* keep previewReady false */ });
      }
    } catch (_) { /* keep previewReady false */ }
    return mount;
  }

  function previewShip(defId, fittings, isPlayer, meta) {
    ensureMount();
    writeCanvasPreviewMeta(defId, fittings, meta);
    expectedPreviewDefId = defId || null;
    canvas.dataset.previewReady = 'false';
    const key = defId + '|' + (fittings || []).join(',') + '|' + (isPlayer ? 'p' : 's') + '|' + ((meta && meta.mode) || 'base');
    if (key === curPreviewKey) {
      mount.setActive(true);
      canvas.dataset.previewReady = mount.getDefId() === defId ? 'true' : 'false';
      return;
    }
    curPreviewKey = key;
    try {
      mount.show(defId, { fittings: fittings || [], isPlayer: !!isPlayer, rotating: true });
      mount.setActive(true);
      mount.resize();
      canvas.dataset.previewReady = mount.getDefId() === defId ? 'true' : 'false';
    } catch (e) { /* preview optional; UI still works — ready stays false */ }
  }

  function currentPreviewContext() {
    if (mode === 'fleet') {
      const s = viewedShip();
      const def = s ? SHIP_BY_ID.get(s.defId) : null;
      if (!def) return null;
      return {
        defId: def.id,
        fittings: Array.isArray(s.fittings) ? s.fittings.slice() : [],
        isPlayer: true,
        player: ctx.state.player,
        stock: false,
      };
    }
    const def = SHIP_BY_ID.get(buyId);
    if (!def) return null;
    return {
      defId: def.id,
      fittings: [],
      isPlayer: def.id === 'ship_kestrel',
      player: stockPreviewPlayer(ctx.state.player),
      stock: true,
    };
  }

  function renderDerivedStats(readout, fittingsForDps) {
    if (!readout || !readout.ok || !readout.derived) {
      statsEl.innerHTML = '';
      statsEl.removeAttribute('data-preview-source');
      return;
    }
    const d = readout.derived;
    const fit = fittingsForDps != null ? fittingsForDps : readout.fittings;
    const firepower = fittedWeaponDps(fit);
    const mass = Number.isFinite(d.operationalMass) ? d.operationalMass : d.mass;
    const cells = [
      { metric: 'firepower', k: 'Firepower', value: firepower, show: firepower > 0 ? Math.round(firepower) : '—', u: 'dps' },
      { metric: 'shieldMax', k: 'Shield', value: d.shieldMax, show: fmt(d.shieldMax), u: '' },
      { metric: 'hullMax', k: 'Hull', value: d.hullMax, show: fmt(d.hullMax), u: '' },
      { metric: 'cargoCap', k: 'Cargo', value: d.cargoCap, show: fmt(d.cargoCap), u: 'u' },
      { metric: 'maxSpeed', k: 'Top speed', value: d.maxSpeed, show: d.maxSpeed ? fmt(d.maxSpeed) : '—', u: '' },
      { metric: 'operationalMass', k: 'Mass', value: mass, show: fmt(mass), u: 't' },
    ];
    statsEl.setAttribute('data-preview-source', 'ships.getDerivedStats');
    statsEl.innerHTML = cells.map((c) => {
      const num = Number.isFinite(Number(c.value)) ? String(Number(c.value)) : '';
      return (
        `<div class="sx-stat" data-metric="${escapeHtml(c.metric)}" data-value="${escapeHtml(num)}">` +
          `<span class="sx-stat__k">${c.k}</span>` +
          `<span class="sx-stat__v">${c.show}${c.u ? `<i>${c.u}</i>` : ''}</span>` +
        `</div>`
      );
    }).join('');
  }

  function restoreCurrentPreview() {
    ghostActive = false;
    const ctxPrev = currentPreviewContext();
    if (!ctxPrev) {
      nameplateEl.innerHTML = '';
      statsEl.innerHTML = '';
      statsEl.removeAttribute('data-preview-source');
      return;
    }
    previewShip(ctxPrev.defId, ctxPrev.fittings, ctxPrev.isPlayer, null);
    const readout = presentDerivedReadout(ctxPrev.defId, ctxPrev.fittings, ctxPrev.player);
    renderDerivedStats(readout, ctxPrev.fittings);
  }

  // ---------- left rail ----------
  function renderRail() {
    if (mode === 'fleet') {
      const o = owned();
      const activeIdx = (ctx.state.player && ctx.state.player.activeShipIndex) || 0;
      railListEl.innerHTML = o.length ? o.map((s, i) => {
        const def = SHIP_BY_ID.get(s.defId) || {};
        const on = i === viewIdx ? ' is-active' : '';
        const isActive = i === activeIdx;
        return (
          `<button type="button" class="sx-sw-row${on}" data-fleet="${i}">` +
            `<span class="sx-sw-row__ic">${icon('shipworks', 20)}</span>` +
            `<span class="sx-sw-row__body"><span class="sx-sw-row__name">${escapeHtml(def.name || s.defId)}</span>` +
              `<span class="sx-sw-row__sub">${escapeHtml((def.role || 'ship'))} · T${def.tier != null ? def.tier : '?'}</span></span>` +
            (isActive ? `<span class="sx-sw-row__flag">Active</span>` : '') +
          `</button>`
        );
      }).join('') : `<p class="sx-muted" style="padding:12px">No ships owned.</p>`;
    } else {
      railListEl.innerHTML = SHIPS.filter((s) => (s.price || 0) >= 0).map((s) => {
        const on = s.id === buyId ? ' is-active' : '';
        return (
          `<button type="button" class="sx-sw-row${on}" data-buy="${escapeHtml(s.id)}">` +
            `<span class="sx-sw-row__ic">${icon('shipworks', 20)}</span>` +
            `<span class="sx-sw-row__body"><span class="sx-sw-row__name">${escapeHtml(s.name)}</span>` +
              `<span class="sx-sw-row__sub">${escapeHtml(s.role || 'ship')} · T${s.tier}</span></span>` +
            `<span class="sx-sw-row__price">${s.price > 0 ? fmt(s.price) : 'Owned'}</span>` +
          `</button>`
        );
      }).join('');
    }
  }

  // ---------- center: preview + stats ----------
  function renderCenter() {
    ghostActive = false;
    if (mode === 'fleet') {
      const s = viewedShip();
      const def = s ? SHIP_BY_ID.get(s.defId) : null;
      if (!def) { nameplateEl.innerHTML = ''; statsEl.innerHTML = ''; statsEl.removeAttribute('data-preview-source'); return; }
      const fittings = s.fittings || [];
      previewShip(def.id, fittings, true, null);
      nameplateEl.innerHTML = `<h2>${escapeHtml(def.name)}</h2><span>${escapeHtml(def.role || '')} hull · Tier ${def.tier}</span>`;
      const readout = presentDerivedReadout(def.id, fittings, ctx.state.player);
      renderDerivedStats(readout, fittings);
    } else {
      const def = SHIP_BY_ID.get(buyId);
      if (!def) return;
      previewShip(def.id, [], def.id === 'ship_kestrel', null);
      nameplateEl.innerHTML = `<h2>${escapeHtml(def.name)}</h2><span>${escapeHtml(def.role || '')} hull · Tier ${def.tier}</span>`;
      const readout = presentDerivedReadout(def.id, [], stockPreviewPlayer(ctx.state.player));
      renderDerivedStats(readout, []);
    }
  }

  // ---------- right: slots (fleet) or spec+buy (buy) ----------
  function renderSide() {
    if (mode === 'buy') {
      const def = SHIP_BY_ID.get(buyId);
      if (!def) { sideEl.innerHTML = ''; return; }
      const slotSummary = Object.entries(def.slots || {}).filter(([, arr]) => (arr || []).length)
        .map(([t, arr]) => `<span class="sx-tag">${(arr || []).length}× ${SLOT_LABEL[t] || t}</span>`).join('');
      const credits = (ctx.state.player && ctx.state.player.credits) || 0;
      const afford = def.price <= credits;
      const isOwned = owned().some((s) => s.defId === def.id);
      sideEl.innerHTML =
        `<div class="sx-panel"><div class="sx-panel__head">${icon('shipworks', 15)}<span>Hull Spec</span></div>` +
          `<div class="sx-spec">` +
            specRow('Class', (def.role || 'ship') + ' · T' + def.tier) +
            specRow('Base hull', fmt(def.hull)) + specRow('Base shield', fmt(def.shield)) +
            specRow('Base cargo', fmt(def.cargo) + ' u') + specRow('Mass', fmt(def.mass) + ' t') +
          `</div>` +
          `<div class="sx-spec__slots"><span class="sx-spec__k">Hardpoints</span><div class="sx-tags">${slotSummary}</div></div>` +
        `</div>` +
        `<div class="sx-buybar">` +
          `<div class="sx-buybar__price"><span>Price</span><b>${def.price > 0 ? fmt(def.price) + ' cr' : 'Starter'}</b></div>` +
          (isOwned
            ? `<button type="button" class="sx-btn-ghost" disabled>In your fleet</button>`
            : `<button type="button" class="sx-btn-primary" data-buyship="${escapeHtml(def.id)}" ${afford ? '' : 'disabled'}>${afford ? 'Buy Hull' : 'Not enough credits'}</button>`) +
        `</div>`;
      return;
    }
    // fleet: slots
    const s = viewedShip();
    const def = s ? SHIP_BY_ID.get(s.defId) : null;
    if (!def) { sideEl.innerHTML = ''; return; }
    const slots = buildSlotList(def);
    const fittings = s.fittings || [];
    // group by type, keep flat index
    const groups = new Map();
    slots.forEach((slot, i) => { const t = slot.type; if (!groups.has(t)) groups.set(t, []); groups.get(t).push({ slot, i }); });
    let html = `<div class="sx-panel__head sx-panel__head--bare">${icon('spark', 15)}<span>Loadout</span><em class="sx-sw__hint">Click a slot to change it</em></div>`;
    for (const [t, arr] of groups) {
      html += `<div class="sx-slotgroup"><div class="sx-slotgroup__k">${SLOT_LABEL[t] || t}</div>`;
      html += arr.map(({ slot, i }) => {
        const fittedId = fittings[i];
        const fitted = fittedId ? FITTABLE_BY_ID.get(fittedId) : null;
        const identity = fitted ? fittedIdentityLine(fitted) : '';
        return (
          `<button type="button" class="sx-slot${fitted ? ' is-filled' : ' is-empty'}" data-slot="${i}">` +
            `<span class="sx-slot__ic">${icon(SLOT_ICON[t] || 'spark', 18)}</span>` +
            `<span class="sx-slot__body">` +
              `<span class="sx-slot__name">${fitted ? escapeHtml(fitted.name) : 'Empty ' + (SLOT_LABEL[t] || t) + ' · ' + (slot.size || '')}</span>` +
              (fitted
                ? `<span class="sx-slot__stat">${escapeHtml(identity)}</span>`
                : `<span class="sx-slot__stat sx-slot__stat--empty">Install a module</span>`) +
            `</span>` +
            `<span class="sx-slot__size">${escapeHtml(slot.size || '')}</span>` +
            `<span class="sx-slot__chev">${icon('chevron', 16)}</span>` +
          `</button>`
        );
      }).join('');
      html += `</div>`;
    }
    sideEl.innerHTML = html;
  }

  function specRow(k, v) { return `<div class="sx-kv"><span>${k}</span><b>${v}</b></div>`; }

  function shopDeltaChipsHtml(shopDelta) {
    if (!shopDelta) return '';
    if (shopDelta.ok && shopDelta.chips && shopDelta.chips.length) {
      return shopDelta.chips.map((chip) => {
        const label = chip.label || formatPreviewDelta(chip);
        if (!label) return '';
        const tone = chip.tone === 'better' ? 'up' : (chip.tone === 'worse' ? 'down' : '');
        return `<span class="sx-modrow__chip${tone ? ' is-' + tone : ''}">${escapeHtml(label)}</span>`;
      }).filter(Boolean).join(' ');
    }
    if (!shopDelta.ok && shopDelta.detail) {
      return `<span class="sx-modrow__chip is-unavail">${escapeHtml(shopDelta.detail)}</span>`;
    }
    return '';
  }

  // ---------- slot chooser (dim + reveal compatible modules) ----------
  function openChooser(slotIndex) {
    const s = viewedShip(); const def = s ? SHIP_BY_ID.get(s.defId) : null;
    if (!def) return;
    const slots = buildSlotList(def); const slot = slots[slotIndex]; if (!slot) return;
    const fittings = s.fittings || [];
    const fittedId = fittings[slotIndex];
    const credits = (ctx.state.player && ctx.state.player.credits) || 0;
    const compat = FITTABLE.filter((d) => d.slotType === slot.type && fits(slot, d) && d.purchasable !== false)
      .sort((a, b) => (a.tier - b.tier) || (a.price - b.price));

    const list = compat.map((d) => {
      const locked = moduleLocked(d, ctx.state);
      const equipped = d.id === fittedId;
      const afford = (d.price || 0) <= credits;
      const shopDelta = presentShopModuleDelta({
        defId: def.id,
        fittings,
        moduleId: d.id,
        slotIndex,
        player: ctx.state.player,
      });
      const chips = shopDeltaChipsHtml(shopDelta);
      const metaFallback = escapeHtml(d.size || '') + ' · T' + d.tier;
      const btn = equipped
        ? `<span class="sx-modrow__eq">Equipped</span>`
        : locked
          ? `<span class="sx-modrow__lock">${icon('info', 13)} Tech locked</span>`
          : `<button type="button" class="sx-modrow__buy" data-buyfit="${escapeHtml(d.id)}" data-slot="${slotIndex}" ${afford ? '' : 'disabled'}>${d.price > 0 ? (afford ? 'Buy · ' + fmt(d.price) : fmt(d.price) + ' cr') : 'Fit'}</button>`;
      return (
        `<div class="sx-modrow${equipped ? ' is-eq' : ''}${locked ? ' is-locked' : ''}" data-preview-module="${escapeHtml(d.id)}" data-preview-slot="${slotIndex}" tabindex="0">` +
          `<span class="sx-modrow__ic">${icon(SLOT_ICON[slot.type] || 'spark', 18)}</span>` +
          `<span class="sx-modrow__body"><span class="sx-modrow__name">${escapeHtml(d.name)}</span>` +
            `<span class="sx-modrow__meta">${chips || metaFallback}</span></span>` +
          btn +
        `</div>`
      );
    }).join('');

    chooserEl.innerHTML =
      `<div class="sx-chooser__scrim" data-close></div>` +
      `<div class="sx-chooser__panel">` +
        `<header class="sx-chooser__head">` +
          `<div><span class="sx-chooser__kicker">${SLOT_LABEL[slot.type] || slot.type} slot · Size ${escapeHtml(slot.size || '')}${slot.facing ? ' · ' + escapeHtml(slot.facing) : ''}</span>` +
          `<h3>Compatible Modules</h3></div>` +
          `<button type="button" class="sx-chooser__x" data-close aria-label="Close">${icon('undock', 18)}</button>` +
        `</header>` +
        (fittedId ? `<button type="button" class="sx-chooser__unfit" data-unfit="${slotIndex}">Unfit ${escapeHtml((FITTABLE_BY_ID.get(fittedId) || {}).name || 'module')}</button>` : '') +
        `<div class="sx-chooser__list">${list || '<p class="sx-muted" style="padding:14px">No compatible modules.</p>'}</div>` +
      `</div>`;
    chooserEl.hidden = false;
    requestAnimationFrame(() => chooserEl.classList.add('is-open'));
  }

  function closeChooser() {
    restoreCurrentPreview();
    chooserEl.classList.remove('is-open');
    setTimeout(() => { chooserEl.hidden = true; chooserEl.innerHTML = ''; }, 200);
  }

  function applyModuleGhost(moduleId, slotIndex) {
    const s = viewedShip();
    const def = s ? SHIP_BY_ID.get(s.defId) : null;
    if (!def || !moduleId) return;
    const ghost = presentModuleFitPreview({
      defId: def.id,
      fittings: s.fittings || [],
      moduleId,
      slotIndex: Number.isInteger(slotIndex) ? slotIndex : undefined,
      player: ctx.state.player,
    });
    if (!ghost.ok || !Array.isArray(ghost.afterFittings)) return;
    ghostActive = true;
    previewShip(ghost.defId, ghost.afterFittings, true, {
      mode: 'module',
      moduleId: ghost.moduleId || moduleId,
    });
    const readout = presentDerivedReadout(ghost.defId, ghost.afterFittings, ctx.state.player);
    renderDerivedStats(readout, ghost.afterFittings);
  }

  // ---------- events ----------
  el.querySelector('.sx-seg').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-mode]'); if (!b) return;
    const m = b.getAttribute('data-mode'); if (m === mode) return;
    mode = m;
    el.querySelectorAll('.sx-seg__btn').forEach((x) => x.classList.toggle('is-on', x.getAttribute('data-mode') === mode));
    renderRail(); renderCenter(); renderSide();
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tick' });
  });

  railListEl.addEventListener('click', (ev) => {
    const f = ev.target.closest('[data-fleet]');
    if (f) { viewIdx = Number(f.getAttribute('data-fleet')); if (ctx.bus) ctx.bus.emit('ui:setActiveShip', { index: viewIdx }); renderRail(); renderCenter(); renderSide(); return; }
    const b = ev.target.closest('[data-buy]');
    if (b) { buyId = b.getAttribute('data-buy'); renderRail(); renderCenter(); renderSide(); if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' }); }
  });

  sideEl.addEventListener('click', (ev) => {
    const slot = ev.target.closest('[data-slot]');
    if (slot) { openChooser(Number(slot.getAttribute('data-slot'))); if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_click' }); return; }
    const buy = ev.target.closest('[data-buyship]');
    if (buy && !buy.disabled) { if (ctx.bus) { ctx.bus.emit('ui:buyShip', { defId: buy.getAttribute('data-buyship') }); ctx.bus.emit('audio:cue', { id: 'ui_accept' }); } setTimeout(refresh, 60); }
  });

  chooserEl.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-close]')) { closeChooser(); return; }
    const bf = ev.target.closest('[data-buyfit]');
    if (bf && !bf.disabled) {
      const defId = bf.getAttribute('data-buyfit'); const slotIndex = Number(bf.getAttribute('data-slot'));
      if (ctx.bus) { ctx.bus.emit('ui:buyModule', { defId, fitSlotIndex: slotIndex }); ctx.bus.emit('audio:cue', { id: 'ui_click' }); }
      closeChooser(); setTimeout(refresh, 70); return;
    }
    const uf = ev.target.closest('[data-unfit]');
    if (uf) { if (ctx.bus) { ctx.bus.emit('ui:unfitModule', { slotIndex: Number(uf.getAttribute('data-unfit')) }); ctx.bus.emit('audio:cue', { id: 'ui_click' }); } closeChooser(); setTimeout(refresh, 70); }
  });

  // Hover/focus: ghost afterFittings geometry + derived stats; leave restores current loadout.
  chooserEl.addEventListener('pointerover', (ev) => {
    const row = ev.target.closest('[data-preview-module]');
    if (!row || !chooserEl.contains(row)) return;
    const moduleId = row.getAttribute('data-preview-module');
    const slotIndex = Number(row.getAttribute('data-preview-slot'));
    applyModuleGhost(moduleId, Number.isInteger(slotIndex) ? slotIndex : undefined);
  });
  chooserEl.addEventListener('pointerleave', () => {
    if (ghostActive || !chooserEl.hidden) restoreCurrentPreview();
  });
  chooserEl.addEventListener('focusin', (ev) => {
    const row = ev.target.closest('[data-preview-module]');
    if (!row || !chooserEl.contains(row)) return;
    const moduleId = row.getAttribute('data-preview-module');
    const slotIndex = Number(row.getAttribute('data-preview-slot'));
    applyModuleGhost(moduleId, Number.isInteger(slotIndex) ? slotIndex : undefined);
  });
  chooserEl.addEventListener('focusout', (ev) => {
    const next = ev.relatedTarget;
    if (next && chooserEl.contains(next)) return;
    if (ghostActive || !chooserEl.hidden) restoreCurrentPreview();
  });

  el.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !chooserEl.hidden) closeChooser(); });

  function refresh(periodicCtx) {
    // The shell owns its 18-frame status cadence. Shipworks is event-driven; repainting its full
    // body on that cadence destroys live pointer targets and wastes the authored preview frame.
    if (periodicCtx === ctx) return;
    renderRail();
    // Periodic station refreshes must not erase a pointer/focus after-fittings preview.
    if (!ghostActive) renderCenter();
    if (chooserEl.hidden) renderSide();
  }

  return {
    el,
    onShow() { refresh(); if (mount) mount.setActive(true); },
    onHide() { if (mount) mount.setActive(false); }, // stop the render loop when leaving (perf)
    refresh,
    dispose() { if (mount) { try { mount.dispose(); } catch (_) {} mount = null; } },
  };
}
