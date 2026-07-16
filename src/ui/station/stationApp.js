// src/ui/station/stationApp.js — "Orbital Command" station shell.
// Zones: status strip · command dock · workspace. Routes destinations, fires dock actions, and
// hosts instrument screens.
//
// Behaviours carried over from the legacy hub (same exported logic, new surface):
//   · Departure readiness  → the Undock tile reads READY/CHECK/RISK; launching while not ready
//     opens a Departure Check with the actual issues + jump-to-fix, then "Launch Anyway".
//   · Cargo hold manifest  → the Hold readout opens the manifest (qty + what the station pays).
//   · First-dock handoff   → the opening docked route shows the 3-step guidance strip.
import { createCommandDock } from './dock.js';
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';
import { createFactionsScreen } from './screens/factions.js';
import { createMarketScreen } from './screens/market.js';
import { createContractsScreen } from './screens/contracts.js';
import { createShipworksScreen } from './screens/shipworks.js';
import { createIndustryScreen } from './screens/industry.js';
import { createBarScreen } from './screens/bar.js';
import { icon } from './icons.js';
import { SECTORS } from '../../data/sectors.js';
import { FACTION_META } from '../../data/factions.js';
import { COMMODITIES } from '../../data/commodities.js';
import { escapeHtml } from '../comms.js';
import {
  departureReadinessChips,
  departureReadinessSummary,
  firstDockHandoffVisible,
  firstDockHandoffSteps,
  holdUnitSellPrice,
  setStationExitOwner,
  stationExitNeedsConfirm,
} from '../screens/stationHub.js';

const STATION_REC = new Map();
for (const sec of SECTORS) for (const s of (sec.stations || [])) STATION_REC.set(s.id, { station: s, sector: sec });
const FACTION_REC = new Map(FACTION_META.map((f) => [f.id, f]));
const CMDTY_NAME = new Map(COMMODITIES.map((c) => [c.id, c.name]));
function titleCaseWords(v) { return String(v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

// Legacy handoff/departure targets → the new destinations. 'services' is now the dock actions.
const TARGET_MAP = {
  market: 'market', hold: 'market', missions: 'contracts', shipyard: 'shipworks',
  outfit: 'shipworks', manufacture: 'industry', factions: 'factions', bar: 'bar', services: null,
};

const STATION_STYLES = [
  { id: 'sx-station-css', href: '/styles/station.css' },
  { id: 'sx-station-workbench-css', href: '/styles/station-workbench.css' },
];
function ensureStylesheet() {
  if (typeof document === 'undefined') return;
  for (const style of STATION_STYLES) {
    if (document.getElementById(style.id)) continue;
    const link = document.createElement('link');
    link.id = style.id;
    link.rel = 'stylesheet';
    link.href = style.href;
    document.head.appendChild(link);
  }
}

const DESTINATIONS = [
  { id: 'market', label: 'Market', icon: 'market', tagline: 'Live prices · demand · trade', create: createMarketScreen },
  { id: 'shipworks', label: 'Shipworks', icon: 'shipworks', tagline: 'Buy ships · fit modules · compare', create: createShipworksScreen },
  { id: 'industry', label: 'Industry', icon: 'industry', tagline: 'Refine ore · fabricate modules', create: createIndustryScreen },
  { id: 'contracts', label: 'Contracts', icon: 'contracts', tagline: 'Jobs · bounties · station leads', create: createContractsScreen },
  { id: 'factions', label: 'Factions', icon: 'factions', tagline: 'Standing & relations', create: createFactionsScreen },
  { id: 'bar', label: 'Bar', icon: 'bar', tagline: 'Rumors · contacts · leads', create: createBarScreen },
];

const ACTIONS = [
  { id: 'repair', label: 'Repair', icon: 'repair', title: 'Repair hull' },
  { id: 'refuel', label: 'Refuel', icon: 'refuel', title: 'Refuel to full' },
  { id: 'resupply', label: 'Resupply', icon: 'resupply', title: 'Rearm munitions' },
  { id: 'undock', label: 'Undock', icon: 'undock', title: 'Leave the station' },
];

// ---- state readers ----
function playerEntity(state) {
  return state && state.entities && state.entities.get && state.playerId != null
    ? state.entities.get(state.playerId) : null;
}
function credits(state) { return Math.max(0, Math.round(Number(state && state.player && state.player.credits) || 0)); }
function hullFrac(state) { const s = playerEntity(state); return (s && s.hullMax > 0) ? Math.max(0, Math.min(1, (s.hull || 0) / s.hullMax)) : 1; }
function fuelFrac(state) { const f = state && state.fuel; return (f && f.max > 0) ? Math.max(0, Math.min(1, (f.current || 0) / f.max)) : 1; }
function cargoFrac(state) { const c = state && state.player && state.player.cargo; return (c && c.capVolume > 0) ? Math.max(0, Math.min(1, (c.usedVolume || 0) / c.capVolume)) : 0; }
function fmtCr(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
function meterTone(frac, kind) {
  if (kind === 'cargo') return frac >= 0.85 ? '#f2b04a' : '#5fd0c0';
  if (frac > 0.6) return '#3fd07f';
  if (frac > 0.3) return '#f2b04a';
  return '#ff6a72';
}

function resolveStation(ctx) {
  if (ctx && ctx.station) return ctx.station;
  const id = ctx && ctx.state && ctx.state.ui && ctx.state.ui.dockedStationId;
  const rec = id && STATION_REC.get(id);
  if (!rec) return { name: 'Station', typeLabel: 'Orbital Berth', factionName: '' };
  const s = rec.station;
  const fac = FACTION_REC.get(s.factionId);
  return {
    name: s.name || String(id),
    typeLabel: titleCaseWords(s.type || 'berth') + (s.size ? ' · Class ' + s.size : ''),
    factionName: fac ? fac.name : '',
  };
}

export function createStationApp(rootEl, ctx, opts = {}) {
  ensureStylesheet();
  const state = () => (ctx && ctx.state) || {};
  const stationId = () => (state().ui && state().ui.dockedStationId) || null;

  const app = document.createElement('div');
  app.className = 'sx-app';
  app.innerHTML =
    `<div class="sx-backplane" aria-hidden="true">` +
      `<span class="sx-backplane__rail sx-backplane__rail--a"></span>` +
      `<span class="sx-backplane__rail sx-backplane__rail--b"></span>` +
      `<span class="sx-backplane__stamp">ORBITAL OPERATIONS / LOCAL AUTHORITY</span>` +
    `</div>` +
    `<header class="sx-topbar">` +
      `<div class="sx-crest">` +
        `<span class="sx-crest__mark">${icon('factions', 30)}</span>` +
        `<span class="sx-crest__text"><span class="sx-crest__name"></span><span class="sx-crest__meta"></span></span>` +
      `</div>` +
      `<div class="sx-status">` +
        `<div class="sx-readouts"></div>` +
        `<div class="sx-credits"><span class="sx-credits__ico">${icon('credits', 20)}</span><span class="sx-credits__v">0</span><span class="sx-credits__u">cr</span></div>` +
      `</div>` +
    `</header>` +
    `<div class="sx-dockzone">` +
      `<div class="sx-dockwrap"></div>` +
      `<div class="sx-handoff" hidden></div>` +
    `</div>` +
    `<main class="sx-workspace">` +
      `<div class="sx-operation-rail" aria-hidden="true"><span class="sx-operation-rail__index">01</span><span class="sx-operation-rail__track"></span><span class="sx-operation-rail__mode">MARKET</span></div>` +
      `<section class="sx-screen">` +
        `<header class="sx-screen__head">` +
          `<span class="sx-screen__sigil" aria-hidden="true"></span>` +
          `<div class="sx-screen__id"><h1 class="sx-screen__title"></h1><p class="sx-screen__sub"></p></div>` +
          `<button type="button" class="sx-context-help" aria-label="Explain the active station operation" title="Context help">?</button>` +
        `</header>` +
        `<div class="sx-screen__body" id="sx-panel" role="tabpanel" tabindex="0"></div>` +
      `</section>` +
    `</main>` +
    `<div class="sx-pop" hidden></div>` +
    `<aside class="sx-comms" aria-label="Station communications">` +
      `<div class="sx-comms__channel"><span class="sx-comms__signal" aria-hidden="true"></span><span>STATION COMMS</span></div>` +
      `<div class="sx-receipt" role="status" aria-live="polite" aria-atomic="true" hidden>` +
        `<span class="sx-receipt__pulse" aria-hidden="true"></span>` +
        `<span class="sx-receipt__kind"></span><strong class="sx-receipt__title"></strong><span class="sx-receipt__delta"></span>` +
      `</div>` +
    `</aside>`;
  rootEl.appendChild(app);

  const crestName = app.querySelector('.sx-crest__name');
  const crestMeta = app.querySelector('.sx-crest__meta');
  const readoutsEl = app.querySelector('.sx-readouts');
  const creditsEl = app.querySelector('.sx-credits__v');
  const titleEl = app.querySelector('.sx-screen__title');
  const subEl = app.querySelector('.sx-screen__sub');
  const bodyEl = app.querySelector('.sx-screen__body');
  const handoffEl = app.querySelector('.sx-handoff');
  const popEl = app.querySelector('.sx-pop');
  const screenSigil = app.querySelector('.sx-screen__sigil');
  const helpEl = app.querySelector('.sx-context-help');
  const operationIndexEl = app.querySelector('.sx-operation-rail__index');
  const operationModeEl = app.querySelector('.sx-operation-rail__mode');
  const commsEl = app.querySelector('.sx-comms');
  const receiptEl = app.querySelector('.sx-receipt');

  const dock = createCommandDock({
    destinations: DESTINATIONS,
    actions: ACTIONS,
    onNavigate: (id) => navigate(id),
    onAction: (id) => runAction(id),
  });
  app.querySelector('.sx-dockwrap').appendChild(dock.el);

  const screenCache = new Map();
  let activeId = null;
  let stopPopPositioning = null;
  let popCloseTimer = 0;
  let receiptTimer = 0;
  const subscriptions = [];

  // ---------- popover ----------
  function stopFloating() {
    if (stopPopPositioning) { try { stopPopPositioning(); } catch (_) {} }
    stopPopPositioning = null;
  }

  function positionPop(anchorEl) {
    if (!anchorEl || !anchorEl.isConnected || popEl.hidden) return;
    computePosition(anchorEl, popEl, {
      strategy: 'fixed',
      placement: 'bottom',
      middleware: [
        offset(12),
        flip({ padding: 14 }),
        shift({ padding: 14 }),
        size({
          padding: 14,
          apply({ availableWidth, availableHeight, elements }) {
            elements.floating.style.maxWidth = `${Math.max(280, availableWidth)}px`;
            elements.floating.style.maxHeight = `${Math.max(220, availableHeight)}px`;
          },
        }),
      ],
    }).then(({ x, y }) => {
      if (popEl.hidden) return;
      Object.assign(popEl.style, { left: `${x}px`, top: `${y}px` });
    }).catch(() => {});
  }

  function openPop(html, anchorEl, cls) {
    if (popCloseTimer) clearTimeout(popCloseTimer);
    stopFloating();
    popEl.className = 'sx-pop' + (cls ? ' ' + cls : '');
    popEl.innerHTML = html;
    popEl.hidden = false;
    positionPop(anchorEl);
    stopPopPositioning = autoUpdate(anchorEl, popEl, () => positionPop(anchorEl), {
      ancestorResize: true,
      ancestorScroll: true,
      elementResize: true,
      animationFrame: false,
    });
    requestAnimationFrame(() => popEl.classList.add('is-open'));
  }
  function closePop() {
    if (popEl.hidden) return;
    stopFloating();
    popEl.classList.remove('is-open');
    // reset the variant class too, or the popover stays "findable" (and styled) while hidden
    popCloseTimer = setTimeout(() => {
      popEl.hidden = true;
      popEl.innerHTML = '';
      popEl.className = 'sx-pop';
      popCloseTimer = 0;
    }, 150);
  }
  app.addEventListener('click', (ev) => {
    if (popEl.hidden) return;
    if (popEl.contains(ev.target)) return;
    if (ev.target.closest('[data-act="undock"]') || ev.target.closest('[data-hold]')) return;
    closePop();
  });
  // Esc closes an open popover and must NOT fall through to the game's exit handler (which would
  // immediately re-open it). Capture-phase on window so we win regardless of where focus sits.
  // With no popover open, Esc falls through normally → exit request → Departure Check.
  const onEscCapture = (ev) => {
    if (ev.key !== 'Escape' || popEl.hidden) return;
    ev.stopPropagation();
    ev.preventDefault();
    closePop();
  };
  window.addEventListener('keydown', onEscCapture, true);

  // ---------- departure readiness ----------
  function departureNow() {
    const s = state();
    let chips = [];
    try { chips = departureReadinessChips(s) || []; } catch (_) { chips = []; }
    let sum = { state: 'ready', status: 'READY', title: 'Ready to launch.' };
    try { sum = departureReadinessSummary(chips) || sum; } catch (_) {}
    return { chips, state: sum.state, status: sum.status, title: sum.title };
  }

  function openDeparturePop() {
    const dep = departureNow();
    const anchor = dock.el.querySelector('[data-act="undock"]');
    if (!anchor) return;
    const rows = dep.chips.map((c) => {
      const cls = c.kind === 'bad' ? 'is-bad' : (c.kind === 'warn' ? 'is-warn' : 'is-ok');
      const dest = c.targetTab ? TARGET_MAP[c.targetTab] : null;
      const attr = c.targetScreen ? ` data-pop-screen="${escapeHtml(c.targetScreen)}"`
        : (dest ? ` data-pop-nav="${escapeHtml(dest)}"` : '');
      const aria = escapeHtml((c.actionLabel || (c.label + ' ' + c.text)));
      return `<button type="button" class="sx-depchip ${cls}"${attr} aria-label="${aria}">` +
        `<b>${escapeHtml(c.label)}</b><span>${escapeHtml(c.text)}</span></button>`;
    }).join('');
    openPop(
      `<div class="sx-pop__head">Departure Check · <em class="is-${dep.state}">${escapeHtml(dep.status)}</em></div>` +
      `<div class="sx-pop__chips">${rows}</div>` +
      `<button type="button" class="sx-btn-primary" data-pop-launch>Launch Anyway</button>`,
      anchor, 'sx-pop--dep');
  }

  // ---------- cargo hold manifest ----------
  function openHoldPop(anchor) {
    const s = state();
    const cargo = (s.player && s.player.cargo) || {};
    const items = cargo.items || {};
    const sid = stationId();
    const ids = Object.keys(items).filter((id) => Number(items[id]) > 0);
    const rows = ids.map((id) => {
      const qty = Math.floor(Number(items[id]) || 0);
      let unit = null;
      try { unit = holdUnitSellPrice(s, sid, id); } catch (_) { unit = null; }
      return `<div class="sx-holdrow"><span>${escapeHtml(CMDTY_NAME.get(id) || id)}</span>` +
        `<b>${fmtCr(qty)}u</b><em>${unit != null ? fmtCr(unit * qty) + ' cr' : '—'}</em></div>`;
    }).join('');
    const used = Number(cargo.usedVolume) || 0;
    const cap = Number(cargo.capVolume) || 0;
    openPop(
      `<div class="sx-pop__head">Cargo Hold · <em>${fmtCr(used)} / ${fmtCr(cap)}u</em></div>` +
      (rows ? `<div class="sx-holdlist">${rows}</div>`
            : `<p class="sx-muted" style="padding:10px 2px 2px">Hold is empty. Buy cargo in the Market or mine it out there.</p>`),
      anchor, 'sx-pop--hold');
  }

  popEl.addEventListener('click', (ev) => {
    const nav = ev.target.closest('[data-pop-nav]');
    if (nav) { navigate(nav.getAttribute('data-pop-nav')); closePop(); return; }
    const scr = ev.target.closest('[data-pop-screen]');
    if (scr) { if (ctx.bus) ctx.bus.emit('ui:pushScreen', { id: scr.getAttribute('data-pop-screen') }); closePop(); return; }
    if (ev.target.closest('[data-pop-launch]')) { closePop(); commitUndock(); }
  });

  // ---------- first-dock handoff ----------
  function renderHandoff() {
    const s = state();
    let visible = false;
    try { visible = !!firstDockHandoffVisible(s, stationId()); } catch (_) { visible = false; }
    let steps = [];
    if (visible) { try { steps = firstDockHandoffSteps(s) || []; } catch (_) { steps = []; } }
    if (!visible || !steps.length) { handoffEl.hidden = true; handoffEl.innerHTML = ''; return; }
    handoffEl.hidden = false;
    handoffEl.innerHTML =
      `<span class="sx-handoff__k">First Dock Handoff</span>` +
      steps.map((st) => {
        const dest = TARGET_MAP[st.targetTab] || 'market';
        const cls = st.done ? 'is-done' : (st.kind === 'bad' ? 'is-bad' : (st.kind === 'warn' ? 'is-warn' : 'is-ok'));
        const mode = st.tradeMode === 'sell' || st.tradeMode === 'buy' ? st.tradeMode : '';
        return `<button type="button" class="sx-hstep ${cls}" data-handoff="${escapeHtml(dest)}"` +
          (mode ? ` data-handoff-mode="${mode}"` : '') +
          ` title="${escapeHtml(st.text)}" aria-label="${escapeHtml(st.title + '. ' + st.text)}">` +
          `<span class="sx-hstep__n">${escapeHtml(st.label)}</span>` +
          `<span class="sx-hstep__t">${escapeHtml(st.title)}</span></button>`;
      }).join('');
  }
  handoffEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-handoff]');
    if (b) navigate(b.getAttribute('data-handoff'), { tradeMode: b.getAttribute('data-handoff-mode') || undefined });
  });

  // ---------- screens ----------
  function screenFor(dest) {
    if (screenCache.has(dest.id)) return screenCache.get(dest.id);
    let screen;
    if (typeof dest.create === 'function') {
      screen = dest.create(ctx);
    } else {
      const el = document.createElement('div');
      el.className = 'sx-placeholder';
      el.innerHTML = `<div class="sx-placeholder__glyph">${icon(dest.icon, 64)}</div>` +
        `<div class="sx-placeholder__title">${dest.label}</div>` +
        `<div class="sx-placeholder__sub">Instrument coming online</div>`;
      screen = { el, onShow() {}, refresh() {}, dispose() {} };
    }
    screenCache.set(dest.id, screen);
    return screen;
  }

  function navigate(id, options = {}) {
    const dest = DESTINATIONS.find((d) => d.id === id);
    if (!dest) return;
    if (id === activeId) {
      const active = screenCache.get(activeId);
      if (active && typeof active.onShow === 'function') active.onShow({ ...ctx, ...options });
      return;
    }
    const prev = activeId && screenCache.get(activeId);
    if (prev && typeof prev.onHide === 'function') { try { prev.onHide(); } catch (_) {} }
    activeId = id;
    app.dataset.operation = id;
    dock.setActive(id);
    bodyEl.setAttribute('aria-labelledby', 'sx-tab-' + id);
    titleEl.textContent = dest.label;
    subEl.textContent = dest.tagline || '';
    screenSigil.innerHTML = icon(dest.icon, 26);
    const operationIndex = DESTINATIONS.indexOf(dest) + 1;
    operationIndexEl.textContent = String(operationIndex).padStart(2, '0');
    operationModeEl.textContent = dest.label.toUpperCase();
    const screen = screenFor(dest);
    bodyEl.replaceChildren(screen.el);
    screen.el.classList.remove('sx-enter');
    void screen.el.getBoundingClientRect();
    screen.el.classList.add('sx-enter');
    if (typeof screen.onShow === 'function') screen.onShow({ ...ctx, ...options });
    if (ctx && ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    closePop();
  }

  const HELP = {
    market: ['Trade scope', 'Select a commodity to inspect price, demand and station pressure. Buy or sell against your credits and hold.'],
    shipworks: ['Shipworks bay', 'Select a ship or a physical system slot, preview compatible equipment, then install through the real fitting system.'],
    industry: ['Production line', 'Trace raw stock into refined goods and fabricated modules. Broken paths identify the exact missing input.'],
    contracts: ['Contract plotting', 'Choose a job to see its route, preparation, faction consequence and payout before accepting it.'],
    factions: ['Authority network', 'Select a faction to expose its standing thresholds, relationships, recent change and immediate unlocks.'],
    bar: ['Station contacts', 'Contacts turn rumors and local knowledge into actionable leads, survey data and contracts.'],
  };
  helpEl.addEventListener('click', () => {
    const help = HELP[activeId] || ['Station operation', 'Select an operation from the command dock.'];
    openPop(`<div class="sx-pop__head">${escapeHtml(help[0])}</div><p class="sx-context-copy">${escapeHtml(help[1])}</p>`, helpEl, 'sx-pop--help');
  });

  // ---------- causal receipts ----------
  function showReceipt(kind, title, delta = '') {
    if (receiptTimer) clearTimeout(receiptTimer);
    commsEl.classList.add('has-message');
    receiptEl.hidden = false;
    receiptEl.classList.remove('is-settled');
    receiptEl.querySelector('.sx-receipt__kind').textContent = kind;
    receiptEl.querySelector('.sx-receipt__title').textContent = title;
    receiptEl.querySelector('.sx-receipt__delta').textContent = delta;
    void receiptEl.offsetWidth;
    receiptEl.classList.add('is-live');
    receiptTimer = setTimeout(() => {
      receiptEl.classList.remove('is-live');
      receiptEl.classList.add('is-settled');
      receiptTimer = setTimeout(() => {
        receiptEl.hidden = true;
        commsEl.classList.remove('has-message');
      }, 280);
    }, 3600);
  }

  function subscribe(event, handler) {
    const bus = ctx && ctx.bus;
    if (!bus || typeof bus.on !== 'function') return;
    bus.on(event, handler);
    subscriptions.push(() => { try { bus.off && bus.off(event, handler); } catch (_) {} });
  }

  subscribe('station:navigate', (request = {}) => {
    const destination = DESTINATIONS.some((d) => d.id === request.destination)
      ? request.destination : null;
    if (!destination) return;
    navigate(destination, request.options && typeof request.options === 'object' ? request.options : {});
  });

  subscribe('economy:tradeCompleted', (p = {}) => {
    const name = CMDTY_NAME.get(p.commodityId) || titleCaseWords(p.commodityId || 'cargo');
    const verb = p.side === 'sell' ? 'SOLD' : 'BOUGHT';
    const sign = p.side === 'sell' ? '+' : '−';
    showReceipt('TRADE CLEARED', `${verb} ${fmtCr(p.qty)}u ${name}`, `${sign}${fmtCr(p.total)} cr`);
    // The cargo handoff is a live task shortcut, not static onboarding copy. A completed trade
    // changes hold contents, credits, and whether the shortcut must open owned-only Sell mode.
    refresh();
  });
  subscribe('module:purchased', (p = {}) => showReceipt('SHIPWORKS', 'MODULE ACQUIRED', `−${fmtCr(p.price)} cr`));
  subscribe('module:equipped', () => showReceipt('SHIPWORKS', 'FIT COMMITTED', 'LOADOUT RECALCULATED'));
  subscribe('module:unequipped', () => showReceipt('SHIPWORKS', 'MODULE RETURNED', 'INVENTORY UPDATED'));
  subscribe('ship:purchased', (p = {}) => showReceipt('SHIPWORKS', 'SHIP ACQUIRED', p.price ? `−${fmtCr(p.price)} cr` : 'FABRICATION COMPLETE'));
  subscribe('mission:accepted', () => showReceipt('CONTRACT BOUND', 'ROUTE ADDED TO NAVIGATION', 'STAGE 01 ACTIVE'));
  subscribe('credits:changed', (p = {}) => {
    const reason = String(p.reason || '');
    if (!reason.startsWith('service:')) return;
    showReceipt('BERTH SERVICE', `${titleCaseWords(reason.slice(8))} COMPLETE`, `${p.delta < 0 ? '−' : '+'}${fmtCr(Math.abs(p.delta))} cr`);
  });

  // ---------- dock actions ----------
  function actionCosts() {
    const s = state();
    const dep = departureNow();
    const undock = {
      text: dep.status,
      tone: dep.state === 'ready' ? 'gain' : (dep.state === 'check' ? 'warn' : 'loss'),
      title: dep.title,
    };
    const sq = opts.serviceQuote;
    if (typeof sq === 'function') {
      const toCost = (r) => {
        if (!r) return { text: '—' };
        if (r.disabled) return { text: r.buttonLabel || 'OK', disabled: true, tone: 'gain' };
        return { text: fmtCr(r.cost) + ' cr', tone: 'warn' };
      };
      const q = (t) => { try { return sq(t, s, playerEntity(s)); } catch (_) { return null; } };
      return { repair: toCost(q('repair')), refuel: toCost(q('refuel')), resupply: toCost(q('ammo')), undock };
    }
    const hp = playerEntity(s);
    const hullMissing = hp && hp.hullMax > 0 ? Math.max(0, hp.hullMax - (hp.hull || 0)) : 0;
    const fuel = s.fuel || {};
    const fuelMissing = fuel.max > 0 ? Math.max(0, fuel.max - (fuel.current || 0)) : 0;
    return {
      repair: hullMissing > 0 ? { text: fmtCr(Math.ceil(hullMissing * 6)) + ' cr', tone: 'warn' } : { text: 'Hull OK', disabled: true, tone: 'gain' },
      refuel: fuelMissing > 0 ? { text: fmtCr(Math.ceil(fuelMissing * 3)) + ' cr', tone: 'warn' } : { text: 'Fuel OK', disabled: true, tone: 'gain' },
      resupply: { text: 'Rearm', tone: '' },
      undock,
    };
  }

  function commitUndock() {
    if (ctx && ctx.bus) ctx.bus.emit('dock:undocked', { committed: true, intent: 'explicit', source: 'sx-dock' });
  }

  function runAction(id) {
    const bus = ctx && ctx.bus;
    if (id === 'undock') {
      const dep = departureNow();
      if (dep.state !== 'ready') { openDeparturePop(); return; } // surface the risk, don't strand them
      commitUndock();
      return;
    }
    const typeMap = { repair: 'repair', refuel: 'refuel', resupply: 'ammo' };
    const type = typeMap[id];
    if (type && bus) { bus.emit('ui:service', { type }); bus.emit('audio:cue', { id: 'ui_click' }); }
    setTimeout(refresh, 60);
  }

  // ---------- status strip ----------
  function renderStatus() {
    const s = state();
    creditsEl.textContent = fmtCr(credits(s));
    const meters = [
      { k: 'hull', ic: 'hull', label: 'Hull', frac: hullFrac(s) },
      { k: 'fuel', ic: 'fuel', label: 'Fuel', frac: fuelFrac(s) },
      { k: 'cargo', ic: 'cargo', label: 'Hold', frac: cargoFrac(s) },
    ];
    readoutsEl.innerHTML = meters.map((m) => {
      const pct = (m.frac * 100).toFixed(0);
      const inner =
        `<span class="sx-readout__ico">${icon(m.ic, 16)}</span>` +
        `<span class="sx-readout__meter"><span class="sx-readout__fill" style="height:${pct}%;background:${meterTone(m.frac, m.k)}"></span></span>` +
        `<span class="sx-readout__v">${pct}<i>%</i></span>`;
      return m.k === 'cargo'
        ? `<button type="button" class="sx-readout sx-readout--cargo sx-readout--btn" data-hold title="Cargo hold ${pct}% — open manifest" aria-label="Cargo hold ${pct} percent. Open manifest.">${inner}</button>`
        : `<div class="sx-readout sx-readout--${m.k}" title="${m.label} ${pct}%">${inner}</div>`;
    }).join('');
    const st = resolveStation(ctx);
    crestName.textContent = st.name || 'Station';
    crestMeta.textContent = [st.typeLabel, st.factionName].filter(Boolean).join(' · ');
    const costs = actionCosts();
    for (const a of ACTIONS) dock.setActionCost(a.id, costs[a.id]);
    renderHandoff();
  }
  readoutsEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-hold]');
    if (!b) return;
    if (!popEl.hidden && popEl.classList.contains('sx-pop--hold')) { closePop(); return; }
    openHoldPop(b);
  });

  function refresh() {
    renderStatus();
    const dest = DESTINATIONS.find((d) => d.id === activeId);
    if (dest) {
      const screen = screenCache.get(dest.id);
      if (screen && typeof screen.refresh === 'function') screen.refresh(ctx);
    }
  }

  // Implicit exits (Esc / B / E / backdrop) must resolve here — otherwise they do nothing (Esc dead,
  // backdrop dead). Two paths reach us: the exit gate calls the registered owner (Esc/keys), and the
  // screen-manager backdrop emits station:exitRequest straight on the bus. Handle both.
  function requestStationExit(req = {}) {
    const dep = departureNow();
    const intent = req.intent === 'explicit' ? 'explicit' : 'implicit';
    if (stationExitNeedsConfirm(intent, dep.state, !!req.held)) { openDeparturePop(); return; }
    commitUndock();
  }
  try { setStationExitOwner({ requestStationExit }); } catch (_) {}
  let offExit = null;
  if (ctx && ctx.bus && typeof ctx.bus.on === 'function') {
    const handler = (req) => requestStationExit(req || {});
    ctx.bus.on('station:exitRequest', handler);
    offExit = () => { try { ctx.bus.off && ctx.bus.off('station:exitRequest', handler); } catch (_) {} };
  }

  renderStatus();
  navigate('market');

  function activeScreen() {
    const dest = DESTINATIONS.find((d) => d.id === activeId);
    return dest ? screenCache.get(dest.id) : null;
  }

  return {
    el: app,
    refresh,
    navigate,
    onShow() {
      const scr = activeScreen();
      if (scr && typeof scr.onShow === 'function') { try { scr.onShow(ctx); } catch (_) {} }
      renderStatus();
    },
    onHide() {
      closePop();
      const scr = activeScreen();
      if (scr && typeof scr.onHide === 'function') { try { scr.onHide(); } catch (_) {} }
    },
    dispose() {
      stopFloating();
      if (popCloseTimer) clearTimeout(popCloseTimer);
      if (receiptTimer) clearTimeout(receiptTimer);
      window.removeEventListener('keydown', onEscCapture, true);
      if (offExit) offExit();
      subscriptions.splice(0).forEach((off) => off());
      try { dock.dispose && dock.dispose(); } catch (_) {}
      try { setStationExitOwner(null); } catch (_) {}
      screenCache.forEach((s) => { try { s.dispose && s.dispose(); } catch (_) {} });
      screenCache.clear();
      app.remove();
    },
  };
}
