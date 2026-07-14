// src/ui/station/stationApp.js — "Orbital Command" station shell.
// Owns the three zones: status strip · command dock · workspace. Routes destinations,
// fires dock actions, and hosts instrument screens. Designed to become the real 'station'
// screen module; for now createStationApp(root, ctx) also drives the isolated lab harness.
import { createCommandDock } from './dock.js';
import { createFactionsScreen } from './screens/factions.js';
import { createMarketScreen } from './screens/market.js';
import { createContractsScreen } from './screens/contracts.js';
import { createShipworksScreen } from './screens/shipworks.js';
import { createIndustryScreen } from './screens/industry.js';
import { createBarPanel } from '../screens/bar.js';
import { icon } from './icons.js';

// Bar: reuse the existing (functional) bar panel so rumors/contacts/leads stay reachable — the old
// hub was its only doorway. Wrapped + guarded; still on legacy styling pending a bespoke rebuild.
function createBarScreen(ctx) {
  try {
    const bp = createBarPanel(ctx);
    return { el: bp.el, onShow: (c) => bp.onShow && bp.onShow(c), refresh: (c) => bp.refresh && bp.refresh(c), dispose() {} };
  } catch (_) {
    const el = document.createElement('div');
    el.className = 'sx-placeholder';
    el.innerHTML = `<div class="sx-placeholder__title">Bar</div><div class="sx-placeholder__sub">Unavailable at this berth</div>`;
    return { el, onShow() {}, refresh() {}, dispose() {} };
  }
}
import { SECTORS } from '../../data/sectors.js';
import { FACTION_META } from '../../data/factions.js';

const STATION_REC = new Map();
for (const sec of SECTORS) for (const s of (sec.stations || [])) STATION_REC.set(s.id, { station: s, sector: sec });
const FACTION_REC = new Map(FACTION_META.map((f) => [f.id, f]));
function titleCaseWords(v) { return String(v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

const STATION_CSS_HREF = '/styles/station.css';

function ensureStylesheet() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('sx-station-css')) return;
  const link = document.createElement('link');
  link.id = 'sx-station-css';
  link.rel = 'stylesheet';
  link.href = STATION_CSS_HREF;
  document.head.appendChild(link);
}

const DESTINATIONS = [
  { id: 'market', label: 'Market', icon: 'market', tagline: 'Live prices · demand · trade', create: createMarketScreen },
  { id: 'shipworks', label: 'Shipworks', icon: 'shipworks', tagline: 'Buy hulls · fit modules · compare', create: createShipworksScreen },
  { id: 'industry', label: 'Industry', icon: 'industry', tagline: 'Refine ore · fabricate modules', create: createIndustryScreen },
  { id: 'contracts', label: 'Contracts', icon: 'contracts', tagline: 'Jobs · bounties · station leads', create: createContractsScreen },
  { id: 'factions', label: 'Factions', icon: 'factions', tagline: 'Standing & relations', create: createFactionsScreen },
  { id: 'bar', label: 'Bar', icon: 'bar', tagline: 'Rumors · contacts · leads', create: createBarScreen },
];

const ACTIONS = [
  { id: 'repair', label: 'Repair', icon: 'repair', title: 'Repair hull (no confirm)' },
  { id: 'refuel', label: 'Refuel', icon: 'refuel', title: 'Refuel to full' },
  { id: 'resupply', label: 'Resupply', icon: 'resupply', title: 'Rearm munitions' },
  { id: 'undock', label: 'Undock', icon: 'undock', title: 'Leave the station' },
];

// ---- state readers (defensive; match live shapes) ----
function playerEntity(state) {
  return state && state.entities && state.entities.get && state.playerId != null
    ? state.entities.get(state.playerId) : null;
}
function credits(state) { return Math.max(0, Math.round(Number(state && state.player && state.player.credits) || 0)); }
function hullFrac(state) {
  const s = playerEntity(state);
  if (s && s.hullMax > 0) return Math.max(0, Math.min(1, (s.hull || 0) / s.hullMax));
  return 1;
}
function fuelFrac(state) {
  const f = state && state.fuel;
  if (f && f.max > 0) return Math.max(0, Math.min(1, (f.current || 0) / f.max));
  return 1;
}
function cargoFrac(state) {
  const c = state && state.player && state.player.cargo;
  if (c && c.capVolume > 0) return Math.max(0, Math.min(1, (c.usedVolume || 0) / c.capVolume));
  return 0;
}
function fmtCr(n) { return Math.round(n).toLocaleString('en-US'); }
// Readout fill colour by LEVEL (meaning), not by system identity: healthy→caution→critical.
function meterTone(frac, kind) {
  if (kind === 'cargo') return frac >= 0.85 ? '#f2b04a' : '#5fd0c0'; // near-full hold = sell soon
  if (frac > 0.6) return '#3fd07f';
  if (frac > 0.3) return '#f2b04a';
  return '#ff6a72';
}

function resolveStation(ctx) {
  if (ctx && ctx.station) return ctx.station; // harness override
  const id = ctx && ctx.state && ctx.state.ui && ctx.state.ui.dockedStationId;
  const rec = id && STATION_REC.get(id);
  if (!rec) return { name: 'Station', typeLabel: 'Orbital Berth', factionName: '' };
  const s = rec.station;
  const fac = FACTION_REC.get(s.factionId);
  const typeLabel = titleCaseWords(s.type || 'berth') + (s.size ? ' · Class ' + s.size : '');
  return { name: s.name || String(id), typeLabel, factionName: fac ? fac.name : '' };
}

export function createStationApp(rootEl, ctx, opts = {}) {
  ensureStylesheet();
  const state = () => (ctx && ctx.state) || {};

  const app = document.createElement('div');
  app.className = 'sx-app';
  app.innerHTML =
    `<header class="sx-topbar">` +
      `<div class="sx-crest">` +
        `<span class="sx-crest__mark">${icon('factions', 30)}</span>` +
        `<span class="sx-crest__text">` +
          `<span class="sx-crest__name"></span>` +
          `<span class="sx-crest__meta"></span>` +
        `</span>` +
      `</div>` +
      `<div class="sx-status">` +
        `<div class="sx-readouts"></div>` +
        `<div class="sx-credits"><span class="sx-credits__ico">${icon('credits', 20)}</span><span class="sx-credits__v">0</span><span class="sx-credits__u">cr</span></div>` +
      `</div>` +
    `</header>` +
    `<div class="sx-dockwrap"></div>` +
    `<main class="sx-workspace">` +
      `<section class="sx-screen">` +
        `<header class="sx-screen__head">` +
          `<div class="sx-screen__id"><h1 class="sx-screen__title"></h1><p class="sx-screen__sub"></p></div>` +
        `</header>` +
        `<div class="sx-screen__body"></div>` +
      `</section>` +
    `</main>`;
  rootEl.appendChild(app);

  const crestName = app.querySelector('.sx-crest__name');
  const crestMeta = app.querySelector('.sx-crest__meta');
  const readoutsEl = app.querySelector('.sx-readouts');
  const creditsEl = app.querySelector('.sx-credits__v');
  const titleEl = app.querySelector('.sx-screen__title');
  const subEl = app.querySelector('.sx-screen__sub');
  const bodyEl = app.querySelector('.sx-screen__body');

  const dock = createCommandDock({
    destinations: DESTINATIONS,
    actions: ACTIONS,
    onNavigate: (id) => navigate(id),
    onAction: (id) => runAction(id),
  });
  app.querySelector('.sx-dockwrap').appendChild(dock.el);

  const screenCache = new Map();
  let activeId = null;

  function screenFor(dest) {
    if (screenCache.has(dest.id)) return screenCache.get(dest.id);
    let screen;
    if (typeof dest.create === 'function') {
      screen = dest.create(ctx);
    } else {
      const el = document.createElement('div');
      el.className = 'sx-placeholder';
      el.innerHTML =
        `<div class="sx-placeholder__glyph">${icon(dest.icon, 64)}</div>` +
        `<div class="sx-placeholder__title">${dest.label}</div>` +
        `<div class="sx-placeholder__sub">Instrument coming online</div>` +
        `<div class="sx-placeholder__scan" aria-hidden="true"></div>`;
      screen = { el, onShow() {}, refresh() {}, dispose() {} };
    }
    screenCache.set(dest.id, screen);
    return screen;
  }

  function navigate(id) {
    const dest = DESTINATIONS.find((d) => d.id === id);
    if (!dest || id === activeId) return;
    // stop the outgoing screen (e.g. Shipworks preview render loop) before switching
    const prev = activeId && screenCache.get(activeId);
    if (prev && typeof prev.onHide === 'function') { try { prev.onHide(); } catch (_) {} }
    activeId = id;
    dock.setActive(id);
    titleEl.textContent = dest.tagline ? dest.label : dest.label;
    subEl.textContent = dest.tagline || '';
    const screen = screenFor(dest);
    bodyEl.replaceChildren(screen.el);
    // enter animation
    screen.el.classList.remove('sx-enter');
    void screen.el.getBoundingClientRect();
    screen.el.classList.add('sx-enter');
    if (typeof screen.onShow === 'function') screen.onShow(ctx);
    if (ctx && ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  }

  // ---- dock actions (slice 1: local cost estimate + intent emit; serviceQuote wired at integration) ----
  function actionCosts() {
    const s = state();
    // Real game: authoritative costs via serviceQuote (injected by the screen adapter).
    const sq = opts.serviceQuote;
    if (typeof sq === 'function') {
      const toCost = (r) => {
        if (!r) return { text: '—' };
        if (r.disabled) return { text: r.buttonLabel || 'OK', disabled: true, tone: 'gain' };
        return { text: fmtCr(r.cost) + ' cr', tone: 'warn' };
      };
      const q = (t) => { try { return sq(t, s, playerEntity(s)); } catch (_) { return null; } };
      return { repair: toCost(q('repair')), refuel: toCost(q('refuel')), resupply: toCost(q('ammo')), undock: { text: 'Ready', tone: 'gain' } };
    }
    // Harness fallback: local estimate.
    const hp = playerEntity(s);
    const hullMissing = hp && hp.hullMax > 0 ? Math.max(0, hp.hullMax - (hp.hull || 0)) : 0;
    const fuel = s.fuel || {};
    const fuelMissing = fuel.max > 0 ? Math.max(0, fuel.max - (fuel.current || 0)) : 0;
    return {
      repair: hullMissing > 0
        ? { text: fmtCr(Math.ceil(hullMissing * 6)) + ' cr', tone: 'warn' }
        : { text: 'Hull OK', disabled: true, tone: 'gain' },
      refuel: fuelMissing > 0
        ? { text: fmtCr(Math.ceil(fuelMissing * 3)) + ' cr', tone: 'warn' }
        : { text: 'Fuel OK', disabled: true, tone: 'gain' },
      resupply: { text: 'Rearm', tone: '' },
      undock: { text: 'Ready', tone: 'gain' },
    };
  }

  function runAction(id) {
    const bus = ctx && ctx.bus;
    if (id === 'undock') {
      if (bus) bus.emit('dock:undocked', { committed: true, intent: 'explicit', source: 'sx-dock' });
      return;
    }
    const typeMap = { repair: 'repair', refuel: 'refuel', resupply: 'ammo' };
    const type = typeMap[id];
    if (type && bus) { bus.emit('ui:service', { type }); bus.emit('audio:cue', { id: 'ui_click' }); }
    // optimistic refresh so cost tiles update after the sim applies the service
    setTimeout(refresh, 60);
  }

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
      return (
        `<div class="sx-readout sx-readout--${m.k}" title="${m.label} ${pct}%">` +
          `<span class="sx-readout__ico">${icon(m.ic, 16)}</span>` +
          `<span class="sx-readout__meter"><span class="sx-readout__fill" style="height:${pct}%;background:${meterTone(m.frac, m.k)}"></span></span>` +
          `<span class="sx-readout__v">${pct}<i>%</i></span>` +
        `</div>`
      );
    }).join('');
    const st = resolveStation(ctx);
    crestName.textContent = st.name || 'Station';
    crestMeta.textContent = [st.typeLabel, st.factionName].filter(Boolean).join(' · ');
    const costs = actionCosts();
    for (const a of ACTIONS) dock.setActionCost(a.id, costs[a.id]);
  }

  function refresh() {
    renderStatus();
    const dest = DESTINATIONS.find((d) => d.id === activeId);
    if (dest) {
      const screen = screenCache.get(dest.id);
      if (screen && typeof screen.refresh === 'function') screen.refresh(ctx);
    }
  }

  // boot
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
      const scr = activeScreen();
      if (scr && typeof scr.onHide === 'function') { try { scr.onHide(); } catch (_) {} } // stop preview render loop
    },
    dispose() {
      screenCache.forEach((s) => { try { s.dispose && s.dispose(); } catch (_) {} });
      screenCache.clear();
      app.remove();
    },
  };
}
