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
import { createLedgerScreen } from './screens/ledger.js';
import { createTrialsScreen } from './screens/trials.js';
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
import { missionDockAttention } from './missionDockAttention.js';
import { isChoiceECourierReady } from '../../story/endings/eligibility.js';
import { heatLevelFor } from '../../systems/heat.js';

const STATION_REC = new Map();
for (const sec of SECTORS) for (const s of (sec.stations || [])) STATION_REC.set(s.id, { station: s, sector: sec });
const FACTION_REC = new Map(FACTION_META.map((f) => [f.id, f]));
const CMDTY_NAME = new Map(COMMODITIES.map((c) => [c.id, c.name]));
const CMDTY_REC = new Map(COMMODITIES.map((c) => [c.id, c]));
function titleCaseWords(v) { return String(v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

// Legacy handoff/departure targets → the new destinations.
const TARGET_MAP = {
  market: 'market', hold: 'market', missions: 'contracts', shipyard: 'shipworks',
  outfit: 'shipworks', manufacture: 'industry', factions: 'factions', bar: 'bar', services: null,
};

// `services` legitimately maps to no destination — services are verbs on the fascia now, not a
// screen. Resolving it through `TARGET_MAP[tab] || 'market'` silently converted that deliberate
// null into "open the Market", which is why the "Launch · safe to undock" handoff step opened the
// commodity list. A target that is a verb resolves to the verb.
const TARGET_ACTION = { services: 'undock' };
function resolveTarget(tab) {
  const destination = TARGET_MAP[tab] || null;
  if (destination) return { destination };
  const action = TARGET_ACTION[tab] || null;
  return action ? { action } : {};
}

// Order matters. station-berth.css must load LAST: it re-points the --ink-/--line-/--surface-
// tokens the older sheets read, and it restores grid placement for panels that later override
// blocks in station-workbench.css had lifted into absolute overlays.
const STATION_STYLES = [
  { id: 'sx-station-css', href: '/styles/station.css' },
  { id: 'sx-station-workbench-css', href: '/styles/station-workbench.css' },
  { id: 'sx-station-berth-css', href: '/styles/station-berth.css' },
];
// Also called by the in-flight THE SHIP screen (src/ui/ship/shipScreen.js): the shared shipworks
// stage wears .sx-* classes styled only by these sheets, so opening F2 before the first dock must
// not wait for a dock to inject them.
export function ensureStylesheet() {
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
  // Player-facing label is Missions (contracts is the stable internal rail id + TARGET_MAP alias).
  { id: 'contracts', label: 'Missions', icon: 'contracts', tagline: 'Jobs · turn-ins · station leads', create: createContractsScreen },
  { id: 'factions', label: 'Factions', icon: 'factions', tagline: 'Standing & relations', create: createFactionsScreen },
  { id: 'bar', label: 'Bar', icon: 'bar', tagline: 'Rumors · contacts · leads', create: createBarScreen },
  { id: 'trials', label: 'Trials', icon: 'trials', tagline: 'Local records · own-best ghost · arena', create: createTrialsScreen },
  { id: 'ledger', label: 'Ledger', icon: 'ledger', tagline: "The Tessera's record · evidence", create: createLedgerScreen },
];

// The service verbs used to be dock tiles declared here. They now live on the vital they change
// (Repair on Hull, Refuel on Fuel, Sell on Hold), so each verb is named at its own meter and the
// dock is destinations only. `runAction` still owns the id → service-type mapping.

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
// Meter colour is no longer chosen here. A vital carries a data-tone and the sheet owns the hue,
// so the "gain / caution / loss" contract lives in one place instead of being re-picked per meter.

function resolveStation(ctx) {
  if (ctx && ctx.station) {
    return {
      ...ctx.station,
      services: Array.isArray(ctx.station.services) ? ctx.station.services.slice() : [],
    };
  }
  const id = ctx && ctx.state && ctx.state.ui && ctx.state.ui.dockedStationId;
  const rec = id && STATION_REC.get(id);
  if (!rec) return { name: 'Station', typeLabel: 'Orbital Berth', factionName: '', services: [] };
  const s = rec.station;
  const fac = FACTION_REC.get(s.factionId);
  return {
    name: s.name || String(id),
    typeLabel: titleCaseWords(s.type || 'berth') + (s.size ? ' · Class ' + s.size : ''),
    factionName: fac ? fac.name : '',
    services: Array.isArray(s.services) ? s.services.slice() : [],
  };
}

function setTextIfChanged(node, value) {
  const next = String(value == null ? '' : value);
  if (node && node.textContent !== next) node.textContent = next;
}

function departureChipIntent(chip) {
  if (!chip) return null;
  const signal = [
    chip.getAttribute('data-departure-check'),
    chip.getAttribute('data-check'),
    chip.getAttribute('aria-label'),
    chip.textContent,
  ].filter(Boolean).join(' ').toLowerCase();
  if (/\b(hull|armor|repair)\b/.test(signal)) return { service: 'repair' };
  if (/\b(fuel|refuel)\b/.test(signal)) return { service: 'refuel' };
  if (/\b(ammo|ammunition|rearm|resupply)\b/.test(signal)) return { service: 'resupply' };
  if (/\b(hold|cargo|capacity|contraband)\b/.test(signal)) return { surface: 'hold' };
  if (/\b(route|track|mission|objective|contract)\b/.test(signal)) return { navigate: 'contracts' };
  const explicitNav = chip.getAttribute('data-pop-nav');
  return explicitNav ? { navigate: explicitNav } : null;
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
    // One seated instrument panel bolted to the very top. Previously identity/status sat in a
    // header and the command dock floated as a centred island ~120px below it, with dead space
    // above — which is why it never read as an encapsulating HUD.
    `<header class="sxb-fascia">` +
      `<div class="sxb-crown">` +
        `<div class="sxb-berth">` +
          `<span class="sxb-berth__crest">${icon('factions', 26)}</span>` +
          `<span class="sxb-berth__text">` +
            `<span class="sxb-berth__name"></span><span class="sxb-berth__meta"></span>` +
          `</span>` +
        `</div>` +
        `<div class="sxb-vitals"></div>` +
        `<div class="sxb-purse">` +
          `<span class="sxb-purse__label">Credits</span>` +
          `<span class="sxb-purse__value">0</span>` +
        `</div>` +
        `<button type="button" class="sxb-launch" data-act="undock" data-pop-owner>` +
          `<span class="sxb-launch__label">Undock</span>` +
          `<span class="sxb-launch__state"></span>` +
        `</button>` +
      `</div>` +
      `<div class="sxb-ops">` +
        `<div class="sxb-ops__dock"></div>` +
        `<button type="button" class="sxb-help" aria-expanded="false" aria-label="Explain the active station operation" title="Context help">?</button>` +
      `</div>` +
      `<div class="sxb-handoff" hidden></div>` +
    `</header>` +
    `<main class="sx-workspace">` +
      `<div class="sx-operation-rail" aria-hidden="true"><span class="sx-operation-rail__index">01</span><span class="sx-operation-rail__track"></span><span class="sx-operation-rail__mode">MARKET</span></div>` +
      `<section class="sx-screen">` +
        `<header class="sx-screen__head">` +
          `<span class="sx-screen__sigil" aria-hidden="true"></span>` +
          `<div class="sx-screen__id"><h1 class="sx-screen__title"></h1><p class="sx-screen__sub"></p></div>` +
        `</header>` +
        `<div class="sx-screen__body" id="sx-panel" role="tabpanel" tabindex="0"></div>` +
      `</section>` +
    `</main>` +
    `<div class="sx-pop" hidden></div>` +
    `<aside class="sx-comms" aria-label="Station communications">` +
      `<button type="button" class="sx-comms__toggle" aria-expanded="false" aria-controls="sx-comms-history" aria-label="Open station communications history">` +
        `<span class="sx-comms__signal" aria-hidden="true"></span><span>STATION COMMS</span><span class="sx-comms__count" hidden>0</span>` +
      `</button>` +
      `<div class="sx-receipt" role="status" aria-live="polite" aria-atomic="true" hidden>` +
        `<span class="sx-receipt__pulse" aria-hidden="true"></span>` +
        `<span class="sx-receipt__kind"></span><strong class="sx-receipt__title"></strong><span class="sx-receipt__delta"></span>` +
      `</div>` +
      `<div class="sx-comms__history" id="sx-comms-history" aria-label="Berth session log" hidden></div>` +
    `</aside>`;
  rootEl.appendChild(app);

  const crestName = app.querySelector('.sxb-berth__name');
  const crestMeta = app.querySelector('.sxb-berth__meta');
  const vitalsEl = app.querySelector('.sxb-vitals');
  const creditsEl = app.querySelector('.sxb-purse__value');
  const launchEl = app.querySelector('.sxb-launch');
  const launchStateEl = app.querySelector('.sxb-launch__state');
  const titleEl = app.querySelector('.sx-screen__title');
  const subEl = app.querySelector('.sx-screen__sub');
  const bodyEl = app.querySelector('.sx-screen__body');
  const handoffEl = app.querySelector('.sxb-handoff');
  const popEl = app.querySelector('.sx-pop');
  const screenSigil = app.querySelector('.sx-screen__sigil');
  const helpEl = app.querySelector('.sxb-help');
  const operationIndexEl = app.querySelector('.sx-operation-rail__index');
  const operationModeEl = app.querySelector('.sx-operation-rail__mode');
  const commsEl = app.querySelector('.sx-comms');
  const commsToggle = app.querySelector('.sx-comms__toggle');
  const commsCount = app.querySelector('.sx-comms__count');
  const commsHistoryEl = app.querySelector('.sx-comms__history');
  const receiptEl = app.querySelector('.sx-receipt');

  // Destinations only. Repair/Refuel/Resupply/Wash used to sit here as tiles carrying their own
  // cost labels, ~600px from the Hull/Fuel/Hold meters that justify them — the same fact stated
  // twice, with the verb detached from its number. They are now attached to their vital, so the
  // dock is a clean tab strip and keeps its ARIA tablist semantics undiluted by toolbar buttons.
  const dock = createCommandDock({
    destinations: DESTINATIONS,
    actions: [],
    onNavigate: (id) => navigate(id),
    onAction: (id) => runAction(id),
  });
  app.querySelector('.sxb-ops__dock').appendChild(dock.el);

  const screenCache = new Map();
  let activeId = null;
  let stopPopPositioning = null;
  let popCloseTimer = 0;
  /** Whatever opened the live popover. Exempt from close-on-outside-click by construction. */
  let popAnchor = null;
  let popKind = '';
  let receiptTimer = 0;
  let commsOpen = false;
  let commsUnread = 0;
  let readoutsSignature = '';
  let handoffSignature = '';
  /** @type {null|ReturnType<typeof missionDockAttention>} */
  let lastMissionAttention = null;
  /** One auto-open per dock session so refreshes do not yank the player mid-flow. */
  let attentionAutoOpenedThisDock = false;
  const receiptHistory = [];
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
    popAnchor = anchorEl || null;
    popKind = cls || '';
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
    popAnchor = null;
    popKind = '';
    if (helpEl) helpEl.setAttribute('aria-expanded', 'false');
    popEl.classList.remove('is-open');
    // reset the variant class too, or the popover stays "findable" (and styled) while hidden
    popCloseTimer = setTimeout(() => {
      popEl.hidden = true;
      popEl.innerHTML = '';
      popEl.className = 'sx-pop';
      popCloseTimer = 0;
    }, 150);
  }
  // Close-on-outside-click, defined as a contract rather than a list.
  //
  // This used to carry a hand-written exemption list — [data-act="undock"] and [data-hold] — and
  // anything not on it was closed. A trigger's own handler runs during the same click that then
  // bubbles to here, so any NEW trigger opened a popover and this handler immediately shut it.
  // The help button was exactly that: it opened and closed on one click, which is why the card was
  // unreadable. Two entries on the list meant two people had already hit this and patched only
  // their own trigger.
  //
  // The element that opened the popover is now exempt by construction, whatever it is.
  app.addEventListener('click', (ev) => {
    if (popEl.hidden) return;
    if (popEl.contains(ev.target)) return;
    if (popAnchor && popAnchor.contains(ev.target)) return;
    closePop();
  });
  // Esc closes an open popover and must NOT fall through to the game's exit handler (which would
  // immediately re-open it). Capture-phase on window so we win regardless of where focus sits.
  // With no popover open, Esc falls through normally → exit request → Departure Check.
  const onEscCapture = (ev) => {
    if (ev.key !== 'Escape') return;
    if (!popEl.hidden) {
      ev.stopPropagation();
      ev.preventDefault();
      closePop();
      return;
    }
    if (commsOpen) {
      ev.stopPropagation();
      ev.preventDefault();
      setCommsOpen(false);
    }
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
    const anchor = launchEl;
    if (!anchor) return;
    const rows = dep.chips.map((c) => {
      const cls = c.kind === 'bad' ? 'is-bad' : (c.kind === 'warn' ? 'is-warn' : 'is-ok');
      const dest = c.targetTab ? resolveTarget(c.targetTab).destination : null;
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
      const def = CMDTY_REC.get(id) || {};
      const volume = qty * Math.max(0, Number(def.volPerU) || 1);
      const mass = qty * Math.max(0, Number(def.massPerU) || 0);
      let unit = null;
      try { unit = holdUnitSellPrice(s, sid, id); } catch (_) { unit = null; }
      const legality = titleCaseWords(def.legality || 'legal');
      return `<button type="button" class="sx-holdrow" data-hold-item="${escapeHtml(id)}" data-hold-volume="${volume.toFixed(2)}" aria-label="Sell ${escapeHtml(CMDTY_NAME.get(id) || id)}. ${fmtCr(qty)} units, ${fmtCr(volume)} hold units, ${unit != null ? fmtCr(unit * qty) + ' credits' : 'no quote'}.">` +
        `<span class="sx-holdrow__mark" aria-hidden="true"></span>` +
        `<span class="sx-holdrow__body"><strong>${escapeHtml(CMDTY_NAME.get(id) || id)}</strong><small>${escapeHtml(titleCaseWords(def.category || 'cargo'))} · ${escapeHtml(legality)}</small></span>` +
        `<span class="sx-holdrow__load"><b>${fmtCr(qty)}<i> units</i></b><small>${fmtCr(volume)} u · ${fmtCr(mass)} t</small></span>` +
        `<span class="sx-holdrow__quote"><b>${unit != null ? fmtCr(unit * qty) : '—'}<i> cr</i></b><small>${unit != null ? fmtCr(unit) + ' / unit' : 'No local quote'}</small></span>` +
        `<span class="sx-holdrow__go" aria-hidden="true">SELL ›</span></button>`;
    }).join('');
    const used = Number(cargo.usedVolume) || 0;
    const cap = Number(cargo.capVolume) || 0;
    const usedPct = cap > 0 ? Math.max(0, Math.min(100, used / cap * 100)) : 0;
    const baySegments = ids.map((id) => {
      const qty = Math.floor(Number(items[id]) || 0);
      const def = CMDTY_REC.get(id) || {};
      const volume = qty * Math.max(0, Number(def.volPerU) || 1);
      const pct = cap > 0 ? Math.max(2, volume / cap * 100) : 0;
      return `<span title="${escapeHtml(CMDTY_NAME.get(id) || id)}: ${fmtCr(volume)}u" style="--bay-share:${pct.toFixed(2)}%"></span>`;
    }).join('');
    openPop(
      `<div class="sx-pop__head">Cargo Hold <em>${fmtCr(used)} / ${fmtCr(cap)} u · ${usedPct.toFixed(0)}%</em></div>` +
      `<div class="sx-holdbay" role="img" aria-label="Cargo hold ${usedPct.toFixed(0)} percent full, ${fmtCr(used)} of ${fmtCr(cap)} hold units used">` +
        `<span class="sx-holdbay__used" style="width:${usedPct.toFixed(2)}%">${baySegments}</span><span class="sx-holdbay__free"></span>` +
      `</div>` +
      (rows ? `<div class="sx-holdlist">${rows}</div>`
            : `<p class="sx-muted" style="padding:10px 2px 2px">Hold is empty. Buy cargo in the Market or mine it out there.</p>`),
      anchor, 'sx-pop--hold');
  }

  popEl.addEventListener('click', (ev) => {
    const departureChip = ev.target.closest('.sx-pop--dep .sx-depchip');
    if (departureChip) {
      const intent = departureChipIntent(departureChip);
      if (intent && intent.service) {
        const applied = runAction(intent.service);
        if (applied !== false) closePop();
        return;
      }
      if (intent && intent.surface === 'hold') {
        openHoldPop(vitalsEl.querySelector('[data-hold]'));
        return;
      }
      if (intent && intent.navigate) {
        navigate(intent.navigate);
        closePop();
        return;
      }
    }
    const holdItem = ev.target.closest('[data-hold-item]');
    if (holdItem) {
      navigate('market', { tradeMode: 'sell', commodityId: holdItem.getAttribute('data-hold-item') });
      closePop();
      return;
    }
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
    if (!visible || !steps.length) {
      if (!handoffEl.hidden) handoffEl.hidden = true;
      if (handoffSignature) handoffEl.replaceChildren();
      handoffSignature = '';
      return;
    }
    const html =
      `<span class="sxb-handoff__k">Getting started</span>` +
      steps.map((st, i) => {
        // A step whose target is a verb (`services` → undock) carries the verb. It previously fell
        // through `TARGET_MAP[tab] || 'market'`, so "Launch · safe to undock" opened the Market.
        const target = resolveTarget(st.targetTab);
        const cls = st.done ? 'is-done' : (st.kind === 'bad' ? 'is-bad' : (st.kind === 'warn' ? 'is-warn' : 'is-ok'));
        const mode = st.tradeMode === 'sell' || st.tradeMode === 'buy' ? st.tradeMode : '';
        const attr = target.destination
          ? ` data-handoff="${escapeHtml(target.destination)}"`
          : (target.action ? ` data-handoff-act="${escapeHtml(target.action)}"` : '');
        if (!attr) return '';
        return `<button type="button" class="sxb-hstep ${cls}"${attr}` +
          (mode ? ` data-handoff-mode="${mode}"` : '') +
          ` title="${escapeHtml(st.text)}" aria-label="${escapeHtml(st.title + '. ' + st.text)}">` +
          `<span class="sxb-hstep__n">${i + 1}</span>` +
          `<span class="sxb-hstep__t">${escapeHtml(st.title)}</span></button>`;
      }).join('');
    if (handoffEl.hidden) handoffEl.hidden = false;
    if (html !== handoffSignature) {
      handoffEl.innerHTML = html;
      handoffSignature = html;
    }
  }
  handoffEl.addEventListener('click', (ev) => {
    const verb = ev.target.closest('[data-handoff-act]');
    if (verb) { runAction(verb.getAttribute('data-handoff-act')); return; }
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
    contracts: ['Missions board', 'Accept jobs, track routes, and settle objectives that complete at this berth. Highlighted rows need your attention first.'],
    factions: ['Authority network', 'Select a faction to expose its standing thresholds, relationships, recent change and immediate unlocks.'],
    bar: ['Station contacts', 'Contacts turn rumors and local knowledge into actionable leads, survey data and missions.'],
    trials: ['Local flight records', 'Select your own-best ghost and earned trail tint, or launch the optional Forgeyard combat ladder.'],
    ledger: ["Ship's Ledger", 'The Tessera keeps what the manifests leave out. Physically recovered evidence pages open to their forensic detail.'],
  };
  helpEl.addEventListener('click', () => {
    // Toggle, not re-open. With the trigger now exempt from close-on-outside-click, a second press
    // would otherwise re-render the same card forever with no way to dismiss it by the same button.
    if (!popEl.hidden && popKind === 'sx-pop--help') { closePop(); return; }
    const help = HELP[activeId] || ['Station operation', 'Pick an operation from the strip above.'];
    helpEl.setAttribute('aria-expanded', 'true');
    openPop(`<div class="sx-pop__head">${escapeHtml(help[0])}</div><p class="sx-context-copy">${escapeHtml(help[1])}</p>`, helpEl, 'sx-pop--help');
  });

  // ---------- causal receipts ----------
  function renderCommsHistory() {
    commsToggle.setAttribute('aria-expanded', commsOpen ? 'true' : 'false');
    commsToggle.setAttribute('aria-label', commsOpen ? 'Close station communications history' : 'Open station communications history');
    commsHistoryEl.hidden = !commsOpen;
    commsCount.hidden = commsUnread <= 0;
    commsCount.textContent = String(commsUnread);
    if (!commsOpen) return;
    commsHistoryEl.innerHTML = receiptHistory.length
      ? `<div class="sx-comms__history-head"><span>BERTH SESSION</span><b>${receiptHistory.length} EVENTS</b></div>` +
        receiptHistory.slice().reverse().map((entry, reverseIndex) =>
          `<div class="sx-comms-entry" data-comms-entry>` +
            `<span class="sx-comms-entry__seq">${String(receiptHistory.length - reverseIndex).padStart(2, '0')}</span>` +
            `<span class="sx-comms-entry__body"><small>${escapeHtml(entry.kind)}</small><strong>${escapeHtml(entry.title)}</strong></span>` +
            `<span class="sx-comms-entry__delta">${escapeHtml(entry.delta || '')}</span>` +
          `</div>`).join('')
      : `<p class="sx-comms__empty">No berth activity recorded yet.</p>`;
  }

  function setCommsOpen(open) {
    commsOpen = !!open;
    commsEl.classList.toggle('is-open', commsOpen);
    if (commsOpen) commsUnread = 0;
    renderCommsHistory();
  }

  commsToggle.addEventListener('click', () => setCommsOpen(!commsOpen));

  function showReceipt(kind, title, delta = '') {
    if (receiptTimer) clearTimeout(receiptTimer);
    receiptHistory.push({ kind: String(kind || 'STATION'), title: String(title || ''), delta: String(delta || '') });
    if (receiptHistory.length > 12) receiptHistory.shift();
    if (!commsOpen) commsUnread = Math.min(99, commsUnread + 1);
    renderCommsHistory();
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
  subscribe('mission:accepted', () => showReceipt('MISSION BOUND', 'ROUTE ADDED TO NAVIGATION', 'STAGE 01 ACTIVE'));
  subscribe('mission:completed', (p = {}) => {
    const reward = Number(p.rewardCr);
    const delta = Number.isFinite(reward) && reward > 0 ? `+${fmtCr(reward)} cr` : 'OBJECTIVE SETTLED';
    showReceipt('MISSION COMPLETE', String(p.type || 'JOB').replace(/_/g, ' ').toUpperCase(), delta);
  });
  subscribe('mission:updated', (payload = {}) => {
    // Board/active list can change while docked (accept, auto turn-in). Refresh rail attention.
    // A newly posted B5 choice may claim this dock session's one existing auto-open. If an earlier
    // mission handoff already used it, the Missions badge updates without yanking the player back.
    applyDockAttention({ allowAutoOpen: payload.onboardingChoice === true });
  });
  subscribe('credits:changed', (p = {}) => {
    const reason = String(p.reason || '');
    if (!reason.startsWith('service:')) return;
    const serviceResult = {
      repair: 'HULL REPAIRED',
      refuel: 'FUEL RESTORED',
      ammo: 'MUNITIONS LOADED',
      hull_wash: 'HULL WASHED',
    }[reason.slice(8)] || `${titleCaseWords(reason.slice(8))} COMPLETE`;
    showReceipt('BERTH SERVICE', serviceResult, `${p.delta < 0 ? '−' : '+'}${fmtCr(Math.abs(p.delta))} cr`);
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
      const toCost = (r, type) => {
        if (!r) return { text: '—' };
        const title = [r.buttonLabel, r.detail, r.cost > 0 ? `${fmtCr(r.cost)} credits` : '']
          .filter(Boolean).join(' · ');
        if (r.disabled) return { text: r.buttonLabel || 'OK', disabled: true, tone: 'gain', title };
        const contents = type === 'ammo' && r.amount > 0 ? `${fmtCr(r.amount)} mun · ` : '';
        return { text: contents + fmtCr(r.cost) + ' cr', tone: 'warn', title };
      };
      const q = (t) => { try { return sq(t, s, playerEntity(s)); } catch (_) { return null; } };
      const washAvailable = resolveStation(ctx).services.includes('repair');
      return {
        repair: toCost(q('repair'), 'repair'),
        refuel: toCost(q('refuel'), 'refuel'),
        resupply: toCost(q('ammo'), 'ammo'),
        wash: washAvailable
          ? toCost(q('hull_wash'), 'hull_wash')
          : { text: 'Offline', disabled: true, title: 'Hull wash requires a repair berth' },
        restitution: toCost(q('restitution'), 'restitution'),
        undock,
      };
    }
    const hp = playerEntity(s);
    const hullMissing = hp && hp.hullMax > 0 ? Math.max(0, hp.hullMax - (hp.hull || 0)) : 0;
    const fuel = s.fuel || {};
    const fuelMissing = fuel.max > 0 ? Math.max(0, fuel.max - (fuel.current || 0)) : 0;
    return {
      repair: hullMissing > 0 ? { text: fmtCr(Math.ceil(hullMissing * 6)) + ' cr', tone: 'warn' } : { text: 'Hull OK', disabled: true, tone: 'gain' },
      refuel: fuelMissing > 0 ? { text: fmtCr(Math.ceil(fuelMissing * 3)) + ' cr', tone: 'warn' } : { text: 'Fuel OK', disabled: true, tone: 'gain' },
      resupply: { text: 'Rearm', tone: '' },
      wash: { text: 'Offline', disabled: true, title: 'Hull wash quote unavailable' },
      restitution: { text: 'Unavailable', disabled: true, title: 'Restitution quote unavailable' },
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
      if (dep.state !== 'ready') { openDeparturePop(); return false; } // surface the risk, don't strand them
      commitUndock();
      return true;
    }
    const typeMap = { repair: 'repair', refuel: 'refuel', resupply: 'ammo', wash: 'hull_wash', restitution: 'restitution' };
    const type = typeMap[id];
    if (type && bus) {
      if (type === 'hull_wash' && !resolveStation(ctx).services.includes('repair')) return false;
      let quote = null;
      if (typeof opts.serviceQuote === 'function') {
        try { quote = opts.serviceQuote(type, state(), playerEntity(state())); } catch (_) { quote = null; }
      }
      if (quote && quote.disabled) return false;
      bus.emit('ui:service', { type, amount: quote && Number.isFinite(Number(quote.amount)) ? Number(quote.amount) : undefined });
      bus.emit('audio:cue', { id: 'ui_click' });
    }
    setTimeout(refresh, 60);
    return true;
  }

  // ---------- vitals ----------
  // A vital is a resource and the verb that changes it, as one object. The verb is only rendered
  // when it is worth offering: a full tank shows "Full", not a Refuel button you cannot use.

  function vitalTone(frac, kind) {
    if (kind === 'hold') return 'live';
    if (frac > 0.6) return 'ok';
    if (frac > 0.3) return 'warn';
    return 'bad';
  }

  /** cost → the trailing element of a vital: an amber verb, or a quiet fact. */
  function vitalActHtml(id, cost, label, ghost = false) {
    if (!cost) return '';
    const text = String(cost.text == null ? '' : cost.text);
    if (cost.disabled) {
      return ghost ? '' : `<span class="sxb-vital__ok">${escapeHtml(text)}</span>`;
    }
    const cls = 'sxb-vital__act' + (ghost ? ' sxb-vital__act--ghost' : '');
    const title = cost.title ? ` title="${escapeHtml(cost.title)}"` : '';
    const copy = ghost ? label : `${label} · ${text}`;
    return `<button type="button" class="${cls}" data-vital-act="${id}"${title}` +
      ` aria-label="${escapeHtml(cost.title || (label + ' ' + text))}">${escapeHtml(copy)}</button>`;
  }

  function vitalHtml(v) {
    const pct = Math.max(0, Math.min(100, Math.round(v.frac * 100)));
    const head =
      `<span class="sxb-vital__label">${escapeHtml(v.label)}</span>` +
      `<span class="sxb-vital__value">${escapeHtml(v.value)}</span>`;
    const headEl = v.openHold
      ? `<button type="button" class="sxb-vital__head" data-hold data-pop-owner` +
          ` aria-label="${escapeHtml(v.aria)}. Open the cargo manifest.">${head}</button>`
      : `<span class="sxb-vital__head">${head}</span>`;
    const track = v.track === false ? ''
      : `<span class="sxb-vital__track" role="img" aria-label="${escapeHtml(v.aria)}">` +
        `<span class="sxb-vital__fill" style="width:${pct}%"></span></span>`;
    const acts = v.acts.filter(Boolean);
    const actsEl = acts.length
      ? (acts.length > 1 ? `<span class="sxb-vital__acts">${acts.join('')}</span>` : acts[0])
      : '';
    return `<div class="sxb-vital sxb-vital--${v.k}" data-tone="${v.tone}">${headEl}${track}${actsEl}</div>`;
  }

  function renderStatus() {
    const s = state();
    setTextIfChanged(creditsEl, fmtCr(credits(s)));
    const ship = playerEntity(s);
    const fuel = (s && s.fuel) || {};
    const cargo = (s && s.player && s.player.cargo) || {};
    const costs = actionCosts();

    const hullF = hullFrac(s);
    const fuelF = fuelFrac(s);
    const holdF = cargoFrac(s);
    const carrying = Number(cargo.usedVolume) > 0;

    const vitals = [
      {
        k: 'hull', label: 'Hull', frac: hullF, tone: vitalTone(hullF, 'hull'),
        value: `${fmtCr(ship && ship.hull)} / ${fmtCr(ship && ship.hullMax)}`,
        aria: `Hull ${(hullF * 100).toFixed(0)} percent`,
        acts: [vitalActHtml('repair', costs.repair, 'Repair'),
               vitalActHtml('wash', costs.wash, 'Wash', true)],
      },
      {
        k: 'fuel', label: 'Fuel', frac: fuelF, tone: vitalTone(fuelF, 'fuel'),
        value: `${fmtCr(fuel.current)} / ${fmtCr(fuel.max)}`,
        aria: `Fuel ${(fuelF * 100).toFixed(0)} percent`,
        acts: [vitalActHtml('refuel', costs.refuel, 'Refuel')],
      },
      {
        k: 'hold', label: 'Hold', frac: holdF, tone: vitalTone(holdF, 'hold'), openHold: true,
        value: `${fmtCr(cargo.usedVolume)} / ${fmtCr(cargo.capVolume)} u`,
        aria: `Cargo hold ${fmtCr(cargo.usedVolume)} of ${fmtCr(cargo.capVolume)} units`,
        acts: [carrying
          ? `<button type="button" class="sxb-vital__act" data-vital-act="sell"` +
            ` aria-label="Sell cargo at this station">Sell</button>`
          : ''],
      },
    ];
    // Munitions has no meter in state, so it appears only when there is something to load — an
    // action-only unit rather than a permanently-present tile reading "Rearm".
    if (costs.resupply && !costs.resupply.disabled) {
      vitals.push({
        k: 'muni', label: 'Munitions', frac: 0, tone: 'warn', track: false,
        value: 'Low', aria: 'Munitions low',
        acts: [vitalActHtml('resupply', costs.resupply, 'Resupply')],
      });
    }
    const wantedLevel = heatLevelFor(Number(s && s.player && s.player.heat || 0));
    if (wantedLevel > 0 && costs.restitution) {
      vitals.push({
        k: 'law', label: 'Law', frac: Math.min(1, wantedLevel / 5), tone: 'bad', track: false,
        value: `WANTED ${wantedLevel}`, aria: `WANTED level ${wantedLevel}`,
        acts: [vitalActHtml('restitution', costs.restitution, 'Pay')],
      });
    }

    const vitalsHtml = vitals.map(vitalHtml).join('');
    if (vitalsHtml !== readoutsSignature) {
      vitalsEl.innerHTML = vitalsHtml;
      readoutsSignature = vitalsHtml;
    }

    const dep = costs.undock || {};
    const depState = dep.tone === 'gain' ? 'ready' : (dep.tone === 'warn' ? 'check' : 'risk');
    launchEl.setAttribute('data-state', depState);
    if (dep.title) {
      launchEl.setAttribute('title', dep.title);
      launchEl.setAttribute('aria-label', `Undock. ${dep.title}`);
    }
    setTextIfChanged(launchStateEl, titleCaseWords(String(dep.text || '').toLowerCase()));

    const st = resolveStation(ctx);
    setTextIfChanged(crestName, st.name || 'Station');
    setTextIfChanged(crestMeta, [st.typeLabel, st.factionName].filter(Boolean).join(' · '));
    renderHandoff();
  }

  vitalsEl.addEventListener('click', (ev) => {
    const hold = ev.target.closest('[data-hold]');
    if (hold) {
      if (!popEl.hidden && popKind === 'sx-pop--hold') { closePop(); return; }
      openHoldPop(hold);
      return;
    }
    const act = ev.target.closest('[data-vital-act]');
    if (!act) return;
    const id = act.getAttribute('data-vital-act');
    if (id === 'sell') { navigate('market', { tradeMode: 'sell' }); return; }
    runAction(id);
  });

  launchEl.addEventListener('click', () => runAction('undock'));

  function applyDockAttention({ allowAutoOpen = false, refreshActive = true } = {}) {
    const s = state();
    if (isChoiceECourierReady(s, stationId())) {
      lastMissionAttention = null;
      const courierAttention = {
        kind: 'courier',
        autoOpen: true,
        destination: 'bar',
        title: 'Settlement courier waiting',
      };
      dock.setAttention('bar', {
        badge: '!',
        title: "Bar — settlement courier: Contract settled. New one's open.",
      });
      if (allowAutoOpen && !attentionAutoOpenedThisDock) {
        attentionAutoOpenedThisDock = true;
        navigate('bar');
      }
      return courierAttention;
    }
    const attention = missionDockAttention(s, stationId());
    lastMissionAttention = attention;
    if (attention) {
      const why = attention.kind === 'accept'
        ? `Missions — ${attention.reason}`
        : `Missions — ${attention.title}: ${attention.reason}`;
      dock.setAttention('contracts', { badge: attention.badge, title: why });
    } else {
      dock.setAttention(null);
    }
    if (allowAutoOpen && attention && attention.autoOpen && !attentionAutoOpenedThisDock) {
      attentionAutoOpenedThisDock = true;
      navigate('contracts', {
        missionId: attention.focusMissionId,
        attention,
        focusSurface: attention.surface,
      });
      return attention;
    }
    // If already on Missions, re-focus the attention row without changing tab.
    if (refreshActive && activeId === 'contracts' && attention) {
      const screen = screenCache.get('contracts');
      if (screen && typeof screen.onShow === 'function') {
        screen.onShow({
          ...ctx,
          missionId: attention.focusMissionId,
          attention,
          focusSurface: attention.surface,
        });
      }
    }
    return attention;
  }

  function refresh(_nextCtx, options = {}) {
    renderStatus();
    applyDockAttention({ allowAutoOpen: false, refreshActive: !options.periodic });
    // The global UI loop calls this every 18 frames so live hull/fuel/credit readouts stay current.
    // Station operation screens are event-driven and contain real pointer targets. Rebuilding them
    // on that cadence replaces hovered nodes and briefly leaves new Shipworks labels at their
    // unprojected/default position until the following animation frame.
    if (options.periodic) return;
    const dest = DESTINATIONS.find((d) => d.id === activeId);
    if (dest) {
      const screen = screenCache.get(dest.id);
      if (screen && typeof screen.refresh === 'function') {
        screen.refresh({
          ...ctx,
          missionId: lastMissionAttention && lastMissionAttention.focusMissionId,
          attention: lastMissionAttention,
        });
      }
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
  // Default desk is Market, then mission attention may immediately re-route to Missions.
  navigate('market');
  applyDockAttention({ allowAutoOpen: true });

  function activeScreen() {
    const dest = DESTINATIONS.find((d) => d.id === activeId);
    return dest ? screenCache.get(dest.id) : null;
  }

  return {
    el: app,
    refresh,
    navigate,
    onShow() {
      // Fresh dock session: allow one auto-open for the highest-priority physical station action.
      attentionAutoOpenedThisDock = false;
      renderStatus();
      const attention = applyDockAttention({ allowAutoOpen: true });
      if (!(attention && attention.autoOpen)) {
        const scr = activeScreen();
        if (scr && typeof scr.onShow === 'function') {
          try {
            scr.onShow({
              ...ctx,
              missionId: lastMissionAttention && lastMissionAttention.focusMissionId,
              attention: lastMissionAttention,
            });
          } catch (_) {}
        }
      }
    },
    onHide() {
      closePop();
      dock.setAttention(null);
      lastMissionAttention = null;
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
