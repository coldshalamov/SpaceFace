import { stationFrameHtml } from '../views/stationFrames.js';
// src/ui/station/stationApp.js — Field Hardware berth chrome (PQ-194 / P33 shell).
// Docking is an arrival on the lit 3D berth: stencil station name, authority legend, one news
// tape, leftover event/ledger/mechanic strips, destination keys along the bottom edge, Undock as
// the primary key with a readiness light, credits and vitals on a quiet engraved plate. The
// Orbital Command website chrome (opaque header, Facilities sidebar, word-underlines) is retired.
//
// Behaviours carried over unchanged (same exported logic, new surface):
//   · Departure readiness  → Undock reads Ready/Check/Risk; launching while not ready opens a
//     Departure Check with the actual issues + jump-to-fix, then "Launch anyway".
//   · Cargo hold manifest  → the Hold vital opens the manifest (qty + what the station pays).
//   · First-dock handoff   → the opening docked route shows the 3-step guidance as a row of words.
import { stationOperationToSurface } from '../commandDeckRefitHooks.js';
import { createCommandDock } from './dock.js';
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';
import { el } from '../kit/index.js';
import { disabledServiceWhy, disabledVitalActHtml } from './serviceQuotes.js';
import { stationIcon } from './stationArt.js';
import { createStationEffects, stationMotionAllowed } from './stationEffects.js';
import { ensureStylesheet } from './stationStyles.js';
import { createStationCommands } from './stationCommands.js';
import { berthSeatDefId, buildDockArrival, writeBerthArrival } from '../dockArrival.js';
import { createFactionsScreen } from './screens/factions.js';
import { createMarketScreen } from './screens/market.js';
import { createContractsScreen } from './screens/contracts.js';
import { createShipworksScreen } from './screens/shipworks.js';
import { createIndustryScreen } from './screens/industry.js';
import { createBarScreen } from './screens/bar.js';
import { createLedgerScreen } from './screens/ledger.js';
import { SECTORS } from '../../data/sectors.js';
import { FACTION_META } from '../../data/factions.js';
import { COMMODITIES } from '../../data/commodities.js';
import { escapeHtml } from '../comms.js';
import { entitySpanHtml, decorateEntityNode } from '../entityResolver.js';
import { confirm } from '../confirm.js';
import {
  holdUnitSellPrice,
  setStationExitOwner,
  stationExitNeedsConfirm,
} from './stationHubModel.js';
import {
  departureReadinessChips,
  departureReadinessSummary,
  firstDockHandoffVisible,
  firstDockHandoffSteps,
} from './stationDepartureModel.js';
import { bindStationMarkup, stationControlAttrs, stationControlLabel } from './stationBindingMap.js';
import { missionDockAttention } from './missionDockAttention.js';
import { yardJobReadout } from './serviceQuotes.js';
import { isChoiceECourierReady } from '../../story/endings/eligibility.js';
import { injectOrreryStation, setVitalDial, vitalDialSvg, vitalValueHtml } from '../orrery/stationLayouts.js';
import { injectOrreryStationTabs } from '../orrery/stationTabsLayouts.js';
import { createStationRow } from '../orrery/stopDial.js';
import { AMMO_BATCH as MUNITIONS_LOAD } from './serviceQuotes.js';

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

// The sheet set lives in ./stationStyles.js so game boot (main.js) can load it without this
// module's graph. Also called by the in-flight THE SHIP screen (src/ui/ship/shipScreen.js): the
// shared shipworks stage wears .sx-sw* classes styled only by this sheet, so opening F2 before
// the first dock must not wait for a dock to inject it.
export { ensureStylesheet };

// The berth: the player's hull in the station's own dock interior — now drawn by the MAIN renderer
// (src/render/uiStage.js, packet P20) on the world canvas behind this screen, not by a second
// WebGLRenderer inside the panel.
//
// The mount this used to open was refused outright on Intel GPUs while docked
// (`secondaryPreviewWebGlBlocked`), which is the owner's own hardware: the berth simply did not
// exist there, and where it did exist it compiled a second hangar against the live context. The
// ScreenManager now asks for the `berth` scene while the station is the top screen and the game's
// own renderer draws it, so there is exactly one GL context on the default route.
//
// This keeps the old object's shape — `show`, `setActive`, `dispose` — because the app calls all
// three from several places and none of them should have to know where the picture comes from.
function createBerth(canvas, ctx) {
  // The panel's own canvas is retired. It stays in the DOM because the layout and the stylesheet
  // both address it, but it never takes a context and never draws; the world is behind the screen.
  if (canvas) {
    canvas.hidden = true;
    canvas.dataset.kStage = 'main-context';
  }
  const stageRequest = () => (ctx && ctx.state && ctx.state.ui ? ctx.state.ui.stageRequest : null);
  return {
    /**
     * Seat the player's live hull. The stage resolves a ship def to its authored whole-ship asset,
     * so the berth shows the ship you actually fly rather than a stand-in.
     */
    show(state, hull) {
      const request = stageRequest();
      if (!request || request.scene !== 'berth') return;
      // Same identity the mechanic line was read from. Not a second living-hull writer.
      const defId = berthSeatDefId(state, hull);
      if (request.hullDefId === defId) return;
      // Re-request rather than mutate. A new request object is the signal: the stage compares the
      // hull it was built for against the hull the live request names and rebuilds on a mismatch,
      // so changing ship changes what is in the berth.
      ctx.state.ui.stageRequest = { ...request, hullDefId: defId, __lastStatus: undefined };
    },
    /** Retained for callers that used to hide a second canvas. The world behind a screen is the world. */
    setActive() {},
    dispose() {
      if (canvas) canvas.hidden = true;
    },
  };
}

const DESTINATIONS = [
  { id: 'market', label: stationControlLabel('market'), icon: 'market', create: createMarketScreen },
  { id: 'shipworks', label: stationControlLabel('shipworks'), icon: 'shipworks', create: createShipworksScreen },
  { id: 'industry', label: stationControlLabel('industry'), icon: 'industry', create: createIndustryScreen },
  // Player-facing label is Missions (contracts is the stable internal rail id + TARGET_MAP alias).
  { id: 'contracts', label: stationControlLabel('contracts'), icon: 'contracts', create: createContractsScreen },
  { id: 'factions', label: stationControlLabel('factions'), icon: 'factions', create: createFactionsScreen },
  { id: 'bar', label: stationControlLabel('bar'), icon: 'bar', create: createBarScreen },
  { id: 'ledger', label: stationControlLabel('ledger'), icon: 'ledger', create: createLedgerScreen },
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
  if (!rec) return { name: 'Station', typeLabel: 'Berth', factionName: '', services: [] };
  const s = rec.station;
  const fac = FACTION_REC.get(s.factionId);
  return {
    name: s.name || String(id),
    typeLabel: titleCaseWords(s.type || 'berth') + (s.size ? ' · Class ' + s.size : ''),
    factionId: s.factionId || null,
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

  // The host `.screen` is the kit screen; `.sx-app` is a plain wrapper (display: contents) so the
  // regions below sit directly on the kit grid. `app.className` is seeded exactly once (the hub-
  // classes check reads that) and never wiped.
  if (rootEl && rootEl.classList) {
    // No `k-screen`: dropping it takes `#screens .sx-berth.k-screen` out of the cascade in one
    // move, and with it the `padding: 22px 400px 14px 32px` that reserved a hole for a floating
    // vitals panel. The frame owns the regions now (design/frontend/THE_BAR.md).
    rootEl.classList.add('screen', 'sx-berth', 'sx-observatory', 'dp-frame', 'dp-frame--screen', 'orr-station');
    // ORRERY: the shell's composition (vitals as dials, the destination rail's Hand, Undock in bone)
    injectOrreryStation(rootEl.ownerDocument || globalThis.document);
    injectOrreryStationTabs(rootEl.ownerDocument || globalThis.document);
    rootEl.dataset.dp = '1';
    rootEl.setAttribute('data-fh-temp', 'docked');
    rootEl.setAttribute('data-fh-register', 'bench');
  }
  const app = document.createElement('div');
  app.className = 'sx-app';
  app.innerHTML = bindStationMarkup(stationFrameHtml());
  rootEl.appendChild(app);

  const berthCanvas = app.querySelector('.sxb-berth__world');
  const berth = createBerth(berthCanvas, ctx);
  const crestName = app.querySelector('.sxb-berth__name');
  const identEl = app.querySelector('.sxb-berth__ident');
  const newsEl = app.querySelector('.sxb-berth__news');
  const eventEl = app.querySelector('.sxb-event');
  const titleBlock = app.querySelector('.sxb-berth');
  const vitalsEl = app.querySelector('.sxb-vitals');
  const creditsEl = app.querySelector('.sxb-purse__value');
  const launchEl = app.querySelector('.sxb-launch');
  const launchStateEl = app.querySelector('.sxb-launch__state');
  const bodyEl = app.querySelector('.sx-screen__body');
  const handoffEl = app.querySelector('.sxb-handoff');
  const popEl = app.querySelector('.sx-pop');
  const helpEl = app.querySelector('.sxb-help');
  const footEl = app.querySelector('.sxb-ops');
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
    allowMotion: () => stationMotionAllowed(state()),
  });
  dock.el.querySelectorAll('.sx-tile').forEach((tile) => {
    tile.classList.add('fh-key', 'fh-key--legend');
  });
  app.querySelector('.sxb-ops__dock').appendChild(dock.el);
  // ORRERY: the destinations stand on a ruled line; the Hand rides it to the open one.
  const dockRail = createStationRow({ row: dock.el.querySelector('.sx-dock__group--nav') });
  let shown = true;
  const effects = createStationEffects({ root: rootEl, app, body: bodyEl, dock: dock.el, credits: creditsEl, getState: state });
  const commands = createStationCommands({
    root: app, trigger: app.querySelector('.so-command-trigger'),
    canOpen: () => shown && !document.hidden && rootEl.isConnected,
    getCommands: () => [
      ...DESTINATIONS.map(d => ({ label: d.label, detail: HELP[d.id]?.[1] || 'Open station facility', icon: d.id,
        run: () => { navigate(d.id); dock.el.querySelector(`[data-nav="${d.id}"]`)?.focus({ preventScroll: true }); } })),
      { label: 'Sell cargo', detail: 'Open your hold in Sell mode', keywords: 'trade unload ore', icon: 'hold', run: () => navigate('market', { tradeMode: 'sell', cargoOnly: true }) },
      { label: 'Buy commodities', detail: 'Browse this station’s exchange', keywords: 'trade goods', icon: 'market', run: () => navigate('market', { tradeMode: 'buy' }) },
      { label: 'Cargo manifest', detail: 'Inspect quantities and local sale values', icon: 'hold', run: () => openHoldPop(app.querySelector('[data-hold]')) },
      ...[['repair','Repair hull','hull'],['refuel','Refuel ship','fuel'],['resupply','Resupply munitions','muni']].map(([id,label,icon]) => {
        const cost = actionCosts()[id] || {};
        return { label, icon, detail: cost.title || cost.text || 'Station service', disabled: !!cost.disabled, run: () => runAction(id) };
      }),
      { label: 'Review departure', detail: 'Check hull, fuel, cargo and tracked mission before undocking', keywords: 'launch flight exit', icon: 'launch', run: openDeparturePop },
    ],
  });


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
  const pendingReceipts = [];
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
            elements.floating.style.maxWidth = `${Math.max(0, availableWidth)}px`;
            elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
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
    popEl.className = 'sx-pop fh-plate fh-plate--raised' + (cls ? ' ' + cls : '');
    popEl.innerHTML = html;
    popEl.hidden = false;
    popEl.setAttribute('role', 'dialog');
    popEl.setAttribute('aria-label', cls === 'sx-pop--dep' ? 'Departure check' : cls === 'sx-pop--hold' ? 'Cargo manifest' : 'Station details');
    popEl.tabIndex = -1;
    positionPop(anchorEl);
    stopPopPositioning = autoUpdate(anchorEl, popEl, () => positionPop(anchorEl), {
      ancestorResize: true,
      ancestorScroll: true,
      elementResize: true,
      animationFrame: false,
    });
    requestAnimationFrame(() => { if (popEl.hidden || !shown) return; popEl.classList.add('is-open'); (popEl.querySelector('button') || popEl).focus({ preventScroll: true }); });
  }
  function closePop() {
    if (popEl.hidden) return;
    stopFloating();
    const returnFocus = popEl.contains(document.activeElement) ? popAnchor : null;
    popAnchor = null;
    popKind = '';
    returnFocus?.focus?.({ preventScroll: true });
    if (helpEl) helpEl.setAttribute('aria-expanded', 'false');
    popEl.classList.remove('is-open');
    // reset the variant class too, or the popover stays "findable" (and styled) while hidden
    popCloseTimer = setTimeout(() => {
      popEl.hidden = true;
      popEl.innerHTML = '';
      popEl.className = 'sx-pop fh-plate fh-plate--raised';
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
    if (!shown || commands.isOpen || ev.key !== 'Escape') return;
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
    // Rows: the surface at body, its state in k-good / k-signal / k-bad text; each row is the
    // jump-to-fix button. "Launch anyway" is the one primary word.
    const rows = dep.chips.map((c) => {
      const cls = c.kind === 'bad' ? 'is-bad k-bad' : (c.kind === 'warn' ? 'is-warn k-signal' : 'is-ok k-good');
      const dest = c.targetTab ? resolveTarget(c.targetTab).destination : null;
      const attr = c.targetScreen ? ` data-pop-screen="${escapeHtml(c.targetScreen)}"`
        : (dest ? ` data-pop-nav="${escapeHtml(dest)}"` : '');
      const aria = escapeHtml((c.actionLabel || (c.label + ' ' + c.text)));
      return `<li><button type="button" ${stationControlAttrs('departure-chip')} class="k-row sx-depchip ${cls}"${attr} aria-label="${aria}">` +
        `<b class="k-row__name">${escapeHtml(c.label)}</b><span class="k-row__num">${escapeHtml(c.text)}</span></button></li>`;
    }).join('');
    const stateCls = dep.state === 'ready' ? 'k-good' : (dep.state === 'check' ? 'k-signal' : 'k-bad');
    openPop(
      `<div class="sx-pop__head k-t-emph">Departure check · <em class="is-${dep.state} ${stateCls}">${escapeHtml(dep.status)}</em></div>` +
      `<ul class="k-rows sx-pop__chips">${rows}</ul>` +
      `<button type="button" ${stationControlAttrs(dep.state === 'ready' ? 'undock' : 'launch-anyway')} class="k-word k-word--emph k-word--primary fh-key fh-key--primary sx-btn-primary" data-pop-launch>${dep.state === 'ready' ? stationControlLabel('undock') : stationControlLabel('launch-anyway')}</button>`,
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
      // One row per commodity: name · category, quantity, the station's quote, and Sell as a word.
      return `<li><button type="button" ${stationControlAttrs('hold-row')} class="k-row sx-holdrow" data-hold-item="${escapeHtml(id)}" data-hold-volume="${volume.toFixed(2)}" aria-label="Sell ${escapeHtml(CMDTY_NAME.get(id) || id)}. ${fmtCr(qty)} units, ${fmtCr(volume)} hold units, ${unit != null ? fmtCr(unit * qty) + ' credits' : 'no quote'}.">` +
        `<span class="sx-holdrow__body"><span class="k-row__name">${escapeHtml(CMDTY_NAME.get(id) || id)}</span><span class="k-row__sub">${escapeHtml(titleCaseWords(def.category || 'cargo'))} · ${escapeHtml(legality)} · ${fmtCr(volume)} u · ${fmtCr(mass)} t</span></span>` +
        `<span class="k-row__num sx-holdrow__load">${fmtCr(qty)}<span class="k-t-data k-38"> u</span></span>` +
        `<span class="k-row__num sx-holdrow__quote">${unit != null ? fmtCr(unit * qty) : '—'}<span class="k-t-data k-38">${unit != null ? ' cr · ' + fmtCr(unit) + ' / u' : ' no local quote'}</span></span>` +
        `<span class="k-word k-word--fine k-word--primary sx-holdrow__go" aria-hidden="true">Sell</span></button></li>`;
    }).join('');
    const used = Number(cargo.usedVolume) || 0;
    const cap = Number(cargo.capVolume) || 0;
    const usedPct = cap > 0 ? Math.max(0, Math.min(100, used / cap * 100)) : 0;
    // The bay is one 2 px k-bar (no per-segment reveal: the rows below name every commodity).
    openPop(
      `<div class="sx-pop__head k-t-emph">Cargo hold <em class="k-62">${fmtCr(used)} / ${fmtCr(cap)} u · ${usedPct.toFixed(0)}%</em></div>` +
      `<div class="k-bar sx-holdbay" role="img" aria-label="Cargo hold ${usedPct.toFixed(0)} percent full, ${fmtCr(used)} of ${fmtCr(cap)} hold units used">` +
        `<span class="k-bar__fill sx-holdbay__used" style="width:${usedPct.toFixed(2)}%"></span>` +
      `</div>` +
      (rows ? `<ul class="k-rows sx-holdlist" style="--k-row-cols: minmax(0,1fr) auto auto auto">${rows}</ul>`
            : `<p class="k-sentence sx-muted">Hold is empty. Buy cargo in the Market or mine it out there.</p>`),
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
    const dismissed = !!(ctx && ctx.screenMemory && ctx.screenMemory.read('station', 'firstDockHandoffDismissed', false));
    let steps = [];
    if (visible && !dismissed) { try { steps = firstDockHandoffSteps(s) || []; } catch (_) { steps = []; } }
    if (!visible || dismissed || !steps.length) {
      if (!handoffEl.hidden) handoffEl.hidden = true;
      if (handoffSignature) handoffEl.replaceChildren();
      handoffSignature = '';
      return;
    }
    // ONBOARDING IS A LAMP ON THE NEXT THING TO DO.
    //
    // This was a row of three bevelled chips under a "Getting started" caps label plus a Dismiss —
    // four controls carrying the same visual weight as UNDOCK, for guidance the player reads once.
    // design/frontend/ONE_PHOTOGRAPH.md §4.7 kills the strip and names the replacement: light the
    // destination that holds the next step, and say the one thing, once, in the reading voice.
    //
    // So: find the first step that is not done, put a travelling lamp on its tile in the dock, and
    // print its sentence as a line of phosphor with a lamp bead. Two objects, not five, and the
    // player's eye goes to the tab they actually have to press.
    const next = steps.find((st) => !st.done) || null;
    const doneCount = steps.filter((st) => st.done).length;
    const target = next ? resolveTarget(next.targetTab) : null;
    const attr = target
      ? (target.destination
        ? ` data-handoff="${escapeHtml(target.destination)}"`
        : (target.action ? ` data-handoff-act="${escapeHtml(target.action)}"` : ''))
      : '';

    // The lamp on the rail. Cleared every pass so a completed step does not leave a lit tab behind.
    const dockEl = app.querySelector('.sxb-ops__dock');
    if (dockEl) {
      for (const lit of dockEl.querySelectorAll('[data-dp-next]')) lit.removeAttribute('data-dp-next');
      if (target && target.destination) {
        // a destination id, matched by value (no CSS.escape: node-run tests have no CSS global)
        const tile = [...dockEl.querySelectorAll('[data-nav]')].find((t) => t.getAttribute('data-nav') === String(target.destination));
        if (tile) tile.setAttribute('data-dp-next', '');
      }
    }

    const html = !next || !attr
      ? ''
      : `<button type="button" ${stationControlAttrs('handoff-step')} class="sxb-next"${attr}` +
          (next.tradeMode === 'sell' || next.tradeMode === 'buy' ? ` data-handoff-mode="${next.tradeMode}"` : '') +
          ` data-why="${escapeHtml(next.text)}" aria-label="${escapeHtml(next.title + '. ' + next.text)}">` +
          `<span class="sxb-next__bead" aria-hidden="true"></span>` +
          `<span class="sxb-next__t">${escapeHtml(next.title)}</span>` +
          `<span class="sxb-next__w">${escapeHtml(next.text)}</span>` +
          (steps.length > 1 ? `<span class="sxb-next__n" aria-hidden="true">${doneCount}/${steps.length}</span>` : '') +
        `</button>` +
        `<button type="button" ${stationControlAttrs('dismiss-handoff')} class="sxb-next__x" data-handoff-dismiss` +
          ` aria-label="${stationControlLabel('dismiss-handoff')} getting started guidance">${stationControlLabel('dismiss-handoff')}</button>`;
    if (!html) {
      if (!handoffEl.hidden) handoffEl.hidden = true;
      if (handoffSignature) handoffEl.replaceChildren();
      handoffSignature = '';
      return;
    }
    if (handoffEl.hidden) handoffEl.hidden = false;
    if (html !== handoffSignature) {
      handoffEl.innerHTML = html;
      handoffSignature = html;
    }
  }
  handoffEl.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-handoff-dismiss]')) {
      if (ctx && ctx.screenMemory) ctx.screenMemory.set('station', { firstDockHandoffDismissed: true });
      renderHandoff();
      return;
    }
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
      const panel = el('div', 'k-panel sx-placeholder');
      panel.append(el('p', 'k-empty', `${dest.label} is not open at this berth.`));
      screen = { el: panel, onShow() {}, refresh() {}, dispose() {} };
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
    const view = stationOperationToSurface(id) || id;
    app.dataset.view = view;
    if (rootEl && rootEl.dataset) {
      rootEl.dataset.operation = id;
      rootEl.dataset.view = view;
    }
    dock.setActive(id);
    bodyEl.setAttribute('aria-labelledby', 'sx-tab-' + id);
    applyDestinationRegister(id);
    const screen = screenFor(dest);
    bodyEl.replaceChildren(screen.el);
    if (typeof screen.onShow === 'function') screen.onShow({ ...ctx, ...options });
    // On later navigation only the panel settles (the arrival choreography owns the first show).
    effects.navigate();
    if (ctx && ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    if (ctx && ctx.screenMemory) ctx.screenMemory.set('station', { destination: id });
    closePop();
  }

  // The register per destination (Task C §1.2): the market and the ledger are dense (the deeper
  // scrim); the name drops from hero to title where the stage needs the room; the berth mount
  // sleeps on Shipworks because the shared stage shows the hull there.
  const DENSE = new Set(['market', 'ledger']);
  const TITLE_SIZED = new Set(['market', 'shipworks', 'contracts']);
  let arriving = false;
  let arrivedOnce = false;
  function applyDestinationRegister(id) {
    if (rootEl && rootEl.classList) rootEl.classList.toggle('k-screen--dense', DENSE.has(id));
    if (rootEl && rootEl.setAttribute) {
      rootEl.setAttribute('data-fh-register', arriving && !arrivedOnce ? 'poster' : 'bench');
    }
    const hero = !TITLE_SIZED.has(id) || (arriving && !arrivedOnce);
    crestName.classList.toggle('k-t-hero', hero);
    crestName.classList.toggle('k-t-title', !hero);
    crestName.classList.toggle('fh-hero', hero);
    crestName.classList.toggle('fh-title', !hero);
    titleBlock.classList.toggle('sxb-berth--clear', TITLE_SIZED.has(id));
    berth.setActive(id !== 'shipworks');
  }

  // Arrival (moment 4): the name stamps in, then the news line, then the foot words, then the
  // panel. The dock swell (sfx_dock_clunk) is the audio system's own on dock:docked.
  function arrive() {
    arriving = false;
    arrivedOnce = true;
    applyDestinationRegister(activeId);
    effects.arrive();
  }

  const HELP = {
    market: ['Trade scope', 'Select a commodity to inspect price, demand and station pressure. Buy or sell against your credits and hold.'],
    shipworks: ['Shipworks bay', 'Select a ship or a physical system slot, preview compatible equipment, then install through the real fitting system.'],
    industry: ['Production line', 'Trace raw stock into refined goods and fabricated modules. Broken paths identify the exact missing input.'],
    contracts: ['Missions board', 'Accept jobs, track routes, and settle objectives that complete at this berth. Highlighted rows need your attention first.'],
    factions: ['Authority network', 'Select a faction to expose its standing thresholds, relationships, recent change and immediate unlocks.'],
    bar: ['Station contacts', 'Contacts turn rumors and local knowledge into actionable leads, survey data and missions.'],
    ledger: ["Ship's Ledger", 'The Tessera keeps what the manifests leave out. Physically recovered evidence pages open to their forensic detail.'],
  };
  helpEl.addEventListener('click', () => {
    // Toggle, not re-open. With the trigger now exempt from close-on-outside-click, a second press
    // would otherwise re-render the same card forever with no way to dismiss it by the same button.
    if (!popEl.hidden && popKind === 'sx-pop--help') { closePop(); return; }
    const help = HELP[activeId] || ['Station operation', 'Pick an operation from the strip above.'];
    helpEl.setAttribute('aria-expanded', 'true');
    openPop(`<div class="sx-pop__head k-t-emph">${escapeHtml(help[0])}</div><p class="k-sentence sx-context-copy">${escapeHtml(help[1])}</p>`, helpEl, 'sx-pop--help');
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
      ? `<div class="k-caps sx-comms__history-head">Berth session · ${receiptHistory.length} events</div>` +
        `<ul class="k-rows" style="--k-row-cols: auto minmax(0,1fr) auto">` +
        receiptHistory.slice().reverse().map((entry, reverseIndex) =>
          `<li class="k-row k-row--static sx-comms-entry" data-comms-entry>` +
            `<span class="k-t-fine k-38 sx-comms-entry__seq">${String(receiptHistory.length - reverseIndex).padStart(2, '0')}</span>` +
            `<span class="sx-comms-entry__body"><span class="k-row__sub">${escapeHtml(titleCaseWords(entry.kind.toLowerCase()))}</span><span class="k-row__name">${escapeHtml(entry.title)}</span></span>` +
            `<span class="k-row__num sx-comms-entry__delta">${escapeHtml(entry.delta || '')}</span>` +
          `</li>`).join('') +
        `</ul>`
      : `<p class="k-empty sx-comms__empty">No berth activity recorded yet.</p>`;
  }

  function setCommsOpen(open) {
    commsOpen = !!open;
    commsEl.classList.toggle('is-open', commsOpen);
    if (commsOpen) commsUnread = 0;
    renderCommsHistory();
  }

  commsToggle.addEventListener('click', () => setCommsOpen(!commsOpen));

  function showReceipt(kind, title, delta = '') {
    // INF-095: receipts are a shown-tree concern. Hidden ones QUEUE (a berth-service debit like
    // the customs toll posts before the screen mounts and must still be witnessed); flight-time
    // noise stays out because producers gate on dock:docked themselves.
    if (!shown) {
      pendingReceipts.push({ kind: String(kind || 'STATION'), title: String(title || ''), delta: String(delta || '') });
      if (pendingReceipts.length > 6) pendingReceipts.shift();
      return;
    }
    if (receiptTimer) clearTimeout(receiptTimer);
    receiptHistory.push({ kind: String(kind || 'STATION'), title: String(title || ''), delta: String(delta || '') });
    if (receiptHistory.length > 12) receiptHistory.shift();
    if (!commsOpen) commsUnread = Math.min(99, commsUnread + 1);
    renderCommsHistory();
    commsEl.classList.add('has-message');
    receiptEl.hidden = false;
    receiptEl.classList.remove('is-settled', 'k-out');
    receiptEl.querySelector('.sx-receipt__kind').textContent = titleCaseWords(String(kind).toLowerCase());
    receiptEl.querySelector('.sx-receipt__title').textContent = title;
    receiptEl.querySelector('.sx-receipt__delta').textContent = delta;
    void receiptEl.offsetWidth;
    receiptEl.classList.add('is-live');
    effects.receipt();
    // One line of text on the world; it fades by the kit's k-out, no plate, no pulse.
    receiptTimer = setTimeout(() => {
      receiptEl.classList.remove('is-live');
      receiptEl.classList.add('is-settled', 'k-out');
      receiptTimer = setTimeout(() => {
        receiptEl.hidden = true;
        receiptEl.classList.remove('k-out');
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
    // INF-095: a hidden app takes no navigation — it would corrupt the active tab for the
    // next dock. onShow re-renders the current destination from live state.
    if (!shown) return;
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
    // INF-095: hidden in flight, this is pure waste (plus hidden auto-opens) — onShow recomputes.
    if (!shown) return;
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
        if (r.disabled) return { text: r.buttonLabel || 'OK', disabled: true, tone: 'gain', title, why: disabledServiceWhy(r) };
        const contents = type === 'ammo' && r.amount > 0 ? `${fmtCr(r.amount)} mun · ` : '';
        return { text: contents + fmtCr(r.cost) + ' cr', tone: 'warn', title };
      };
      const q = (t) => { try { return sq(t, s, playerEntity(s)); } catch (_) { return null; } };
      const washAvailable = resolveStation(ctx).services.includes('repair');
      const rightsQuote = q('redeem_rights');
      return {
        repair: toCost(q('repair'), 'repair'),
        refuel: toCost(q('refuel'), 'refuel'),
        resupply: toCost(q('ammo'), 'ammo'),
        insurance: toCost(q('insurance'), 'insurance'),
        wash: washAvailable
          ? toCost(q('hull_wash'), 'hull_wash')
          : { text: 'Offline', disabled: true, title: 'Hull wash requires a repair berth' },
        // Redemption pays the player, so the verb reads as a gain, not a price.
        rights: rightsQuote && !rightsQuote.disabled
          ? { text: `+${fmtCr(rightsQuote.payout ?? rightsQuote.cost)} cr`, tone: 'gain', title: rightsQuote.detail }
          : { text: rightsQuote ? (rightsQuote.disabledReason || 'Unavailable') : 'Offline', disabled: true, title: rightsQuote ? rightsQuote.detail : 'Salvage rights quote unavailable' },
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
      rights: { text: 'Offline', disabled: true, title: 'Salvage rights quote unavailable' },
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
    const typeMap = { repair: 'repair', refuel: 'refuel', resupply: 'ammo', wash: 'hull_wash', insurance: 'insurance', rights: 'redeem_rights' };
    const type = typeMap[id];
    if (type && bus) {
      if (type === 'hull_wash' && !resolveStation(ctx).services.includes('repair')) return false;
      let quote = null;
      if (typeof opts.serviceQuote === 'function') {
        try { quote = opts.serviceQuote(type, state(), playerEntity(state())); } catch (_) { quote = null; }
      }
      // A stale click on a dead-end verb explains itself instead of dying silently; the
      // quote is recomputed live so the reason always matches current credits/hold.
      if (quote && quote.disabled) {
        const why = disabledServiceWhy(quote) || quote.detail || 'That service is unavailable right now.';
        if (bus) bus.emit('toast', { text: `${quote.buttonLabel || 'Service'} unavailable: ${why}`, kind: 'warn', ttl: 3 });
        return false;
      }
      if (type === 'insurance') {
        if (quote) void runInsuranceService(quote);
        return false;
      }
      bus.emit('ui:service', { type, amount: quote && Number.isFinite(Number(quote.amount)) ? Number(quote.amount) : undefined });
      bus.emit('audio:cue', { id: 'ui_click' });
    }
    setTimeout(refresh, 60);
    return true;
  }

  // ---------- vitals ----------
  let insurancePending = false;
  async function runInsuranceService(quote) {
    if (insurancePending) return;
    insurancePending = true;
    const quotedStation = stationId();
    try {
      const cancelling = Number(quote.amount) === 0;
      const ok = await confirm(cancelling ? {
        title: 'Cancel hull insurance?',
        body: 'Recovery on death goes back to the full uninsured hull-share fee instead of the flat deductible. Cargo loss still applies either way, and cancelling does not refund the paid deductible.',
        confirmLabel: 'Cancel Insurance',
        cancelLabel: 'Keep Insurance',
        danger: true,
      } : {
        title: 'Insure hull recovery?',
        body: `${quote.detail} · ${fmtCr(quote.cost)} cr. If this hull is lost, station recovery charges the flat deductible instead of the uninsured share. Fitted modules are never at risk.`,
        confirmLabel: `Purchase · ${fmtCr(quote.cost)} cr`,
        cancelLabel: 'Not Now',
      });
      if (!ok) return;
      const s = state();
      if (!s.ui?.docked || stationId() !== quotedStation) return;
      const current = opts.serviceQuote('insurance', s, playerEntity(s));
      // A delayed confirmation cannot toggle a policy that changed underneath it.
      if (!current || current.disabled || current.amount !== quote.amount || current.cost !== quote.cost) {
        refresh();
        return;
      }
      ctx.bus.emit('ui:service', { type: 'insurance', amount: current.amount });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      refresh();
    } finally {
      insurancePending = false;
    }
  }

  // A vital is a resource and the verb that changes it, as one object. The verb is only rendered
  // when it is worth offering: a full tank shows "Full", not a Refuel button you cannot use.

  function vitalTone(frac, kind) {
    if (kind === 'hold') return 'live';
    if (frac > 0.6) return 'ok';
    if (frac > 0.3) return 'warn';
    return 'bad';
  }

  /** cost → the trailing element of a vital: the service verb as a fine word, or a quiet fact. */
  function vitalActHtml(id, cost, label, ghost = false) {
    if (!cost) return '';
    const text = String(cost.text == null ? '' : cost.text);
    if (cost.disabled) {
      // A dead-end verb with a speakable reason keeps its tab stop (aria-disabled + data-why)
      // instead of collapsing to a span that never explains itself. Ghost verbs keep their
      // hide-when-unaffordable contract, and done-state facts stay quiet spans.
      if (!ghost && cost.why) return disabledVitalActHtml(id, label, text, cost.why);
      return ghost ? '' : `<span class="sxb-vital__ok k-t-fine k-38">${escapeHtml(text)}</span>`;
    }
    const cls = 'k-word k-word--fine fh-key fh-key--small sxb-vital__act' + (ghost ? ' sxb-vital__act--ghost' : '');
    const why = cost.title ? ` data-why="${escapeHtml(cost.title)}"` : '';
    // the verb over its price (the words read "Repair · 22 cr" to anything that reads text)
    // one line per service: the verb, then its price. A leading detail ("66 mun · ") stays in the
    // text for anything that reads it, visually quiet; a ghost verb shows its price too when it has one.
    const parts = String(text).split(' · ');
    const price = parts.pop() || '';
    const detail = parts.length ? parts.join(' · ') + ' · ' : '';
    const priced = /\d/.test(price);
    const copy = ghost && !priced ? `<span class="orr-act__verb">${escapeHtml(label)}</span>`
      : `<span class="orr-act__verb">${escapeHtml(label)}</span><span class="orr-act__sep"> · </span>` +
        (detail ? `<span class="orr-act__detail">${escapeHtml(detail)}</span>` : '') +
        `<span class="orr-act__cost">${escapeHtml(price)}</span>`;
    return `<button type="button" ${stationControlAttrs(id)} class="${cls}" data-vital-act="${id}"${why}` +
      ` aria-label="${escapeHtml(cost.title || (label + ' ' + text))}">${copy}</button>`;
  }

  // A vital is one static kit row: the label at body 62 %, the value at emphasis (data-tone kept:
  // bad → k-bad, warn → k-signal), the verb as a fine word — and a 2 px k-bar under the label as
  // the track (the tab check reads its width). Hold's head is the manifest button.
  function vitalHtml(v) {
    const pct = Math.max(0, Math.min(100, Math.round(v.frac * 100)));
    const toneCls = v.tone === 'bad' ? ' k-bad' : (v.tone === 'warn' ? ' k-signal' : '');
    const track = v.track === false ? ''
      : `<span class="k-bar sxb-vital__track" role="img" aria-label="${escapeHtml(v.aria)}">` +
        vitalDialSvg({ frac: v.frac }) +
        `<span class="k-bar__fill sxb-vital__fill" style="width:${pct}%"></span></span>`;
    // a track-less unit (Munitions, Rights) still stands on its dial, drawn open (no fill)
    const bareDial = v.track === false
      ? `<span class="orr-vdial-bare" aria-hidden="true">${vitalDialSvg(v.frac > 0 || v.k === 'muni' ? { frac: v.frac } : { bare: true })}</span>` : '';
    const label = `${stationIcon(v.k)}<span class="sxb-vital__label k-t-body k-62">${escapeHtml(v.label)}</span>${track}`;
    const headEl = v.openHold
      ? `<button type="button" ${stationControlAttrs('hold-manifest')} class="k-word k-word--body sxb-vital__head" data-hold data-pop-owner` +
          ` aria-label="${escapeHtml(v.aria)}. Open the cargo manifest.">${label}</button>`
      : `<span class="sxb-vital__head">${label}</span>`;
    const value = `<span class="sxb-vital__value k-t-emph${toneCls}"${v.detail ? ` tabindex="0" data-why="${escapeHtml(v.detail)}"` : ''}>${vitalValueHtml(v.value, escapeHtml)}</span>`;
    const acts = v.acts.filter(Boolean);
    const actsEl = `<span class="sxb-vital__acts">${acts.join('')}</span>`;
    return `<li class="k-row k-row--static sxb-vital sxb-vital--${v.k}" data-tone="${v.tone}">${bareDial}${headEl}${value}${actsEl}</li>`;
  }

  function patchVitals(vitals) {
    const lis = [...vitalsEl.children];
    if (lis.length !== vitals.length || typeof document === 'undefined') return false;
    if (lis.some((li, i) => !li.classList.contains('sxb-vital--' + vitals[i].k))) return false;
    const tpl = document.createElement('template');
    // a DOM without <template> content (the node test shim) rebuilds the row instead
    if (!tpl || !tpl.content || typeof lis[0]?.querySelector !== 'function') return false;
    vitals.forEach((v, i) => {
      const li = lis[i];
      tpl.innerHTML = vitalHtml(v);
      const next = tpl.content.firstElementChild;
      if (!next) return;
      if (li.getAttribute('data-tone') !== v.tone) li.setAttribute('data-tone', v.tone);
      // the dial moves; its words are swapped only where they changed
      const dial = li.querySelector('.orr-vdial');
      if (!dial || !setVitalDial(dial, v.frac)) {
        const oldDial = li.querySelector('.sxb-vital__track, .orr-vdial-bare');
        const newDial = next.querySelector('.sxb-vital__track, .orr-vdial-bare');
        if (oldDial && newDial) oldDial.replaceWith(newDial);
      }
      const fillEl = li.querySelector('.sxb-vital__fill');
      const nextFill = next.querySelector('.sxb-vital__fill');
      if (fillEl && nextFill && fillEl.style.width !== nextFill.style.width) fillEl.style.width = nextFill.style.width;
      const track = li.querySelector('.sxb-vital__track');
      const nextTrack = next.querySelector('.sxb-vital__track');
      if (track && nextTrack && track.getAttribute('aria-label') !== nextTrack.getAttribute('aria-label')) track.setAttribute('aria-label', nextTrack.getAttribute('aria-label'));
      for (const sel of ['.sxb-vital__label', '.sxb-vital__value', '.sxb-vital__acts']) {
        const a = li.querySelector(sel);
        const b = next.querySelector(sel);
        if (a && b && a.outerHTML !== b.outerHTML) a.replaceWith(b);
      }
      const head = li.querySelector('button.sxb-vital__head');
      const nextHead = next.querySelector('button.sxb-vital__head');
      if (head && nextHead && head.getAttribute('aria-label') !== nextHead.getAttribute('aria-label')) head.setAttribute('aria-label', nextHead.getAttribute('aria-label'));
    });
    return true;
  }

  function renderStatus() {
    const s = state();
    effects.credits(credits(s));
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
               vitalActHtml('wash', costs.wash, 'Wash', true),
               vitalActHtml('insurance', costs.insurance, s.player?.insurance?.insuredModules ? 'Insured' : 'Insure', true)],
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
          ? `<button type="button" ${stationControlAttrs('sell')} class="k-word k-word--fine fh-key fh-key--small sxb-vital__act" data-vital-act="sell"` +
            ` aria-label="Sell cargo at this station">Sell</button>`
          : ''],
      },
    ];
    // Munitions has no meter in state, so it appears only when there is something to load — an
    // action-only unit rather than a permanently-present tile reading "Rearm".
    const muniAboard = Math.max(0, Math.floor(Number(cargo.items && cargo.items.cmdty_munitions) || 0));
    if (costs.resupply && !costs.resupply.disabled) {
      vitals.push({
        k: 'muni', label: 'Munitions', frac: Math.min(1, muniAboard / MUNITIONS_LOAD), tone: 'warn', track: false,
        value: `${fmtCr(muniAboard)} / ${MUNITIONS_LOAD}`, aria: `Munitions low: ${fmtCr(muniAboard)} aboard of a ${MUNITIONS_LOAD}-round load`,
        acts: [vitalActHtml('resupply', costs.resupply, 'Resupply')],
      });
    }
    // Claimed rights surface only while there is something to redeem — like Munitions, this is
    // an action unit, not a permanently-present tile.
    const rightsHeld = Math.max(0, Math.floor(Number(s.player && s.player.salvageRights) || 0));
    if (rightsHeld > 0) {
      vitals.push({
        k: 'rights', label: 'Salvage Rights', frac: 0, tone: 'ok', track: false,
        value: `${rightsHeld}`, aria: `${rightsHeld} salvage rights held`,
        acts: [vitalActHtml('rights', costs.rights, 'Redeem')],
      });
    }
    // A paid yard job is work the player is owed visibility on: the meter is the job itself.
    // The periodic re-render keeps progress, queue and holding live while the row exists.
    const yard = yardJobReadout(s);
    if (yard) {
      vitals.push({
        k: 'industry', label: yard.label, frac: yard.frac, tone: yard.tone, track: true,
        value: `${yard.status} · ${yard.value}`,
        aria: yard.aria,
        detail: yard.detail,
        acts: [],
      });
    }

    const vitalsHtml = vitals.map(vitalHtml).join('');
    if (vitalsHtml !== readoutsSignature) {
      // The same vitals in the same order are patched in place, so a repair glides the dial up
      // instead of redrawing it; a vital arriving or leaving rebuilds the row.
      if (!patchVitals(vitals)) vitalsEl.innerHTML = vitalsHtml;
      readoutsSignature = vitalsHtml;
    }

    const dep = costs.undock || {};
    const depState = dep.tone === 'gain' ? 'ready' : (dep.tone === 'warn' ? 'check' : 'risk');
    launchEl.setAttribute('data-state', depState);
    launchEl.classList.toggle('fh-key--hazard', depState === 'risk');
    launchEl.classList.toggle('fh-key--primary', depState !== 'risk');
    if (dep.title) {
      launchEl.setAttribute('title', dep.title);
      launchEl.setAttribute('aria-label', `Undock. ${dep.title}`);
    }
    // The sub-word under Undock: Ready · Check · Risk (the tab check reads exactly these).
    setTextIfChanged(launchStateEl, titleCaseWords(depState));

    const st = resolveStation(ctx);
    setTextIfChanged(crestName, st.name || 'Station');
    // The berth you are docked at is itself a door: the crest name opens the station dossier.
    const dockedRef = stationId() ? 'station:' + stationId() : null;
    if (crestName && crestName.getAttribute('data-entity') !== dockedRef) {
      crestName.classList.remove('sf-entity-link');
      crestName.removeAttribute('data-entity');
      crestName.removeAttribute('role');
      crestName.removeAttribute('tabindex');
      if (dockedRef) decorateEntityNode(crestName, dockedRef);
    }
    // The ident line carries the holding faction's name — a faction door, not just a caption.
    const identSig = `${st.typeLabel}|${st.factionName}`;
    if (identEl && identEl.dataset.identSig !== identSig) {
      identEl.dataset.identSig = identSig;
      const parts = [];
      if (st.typeLabel) parts.push(escapeHtml(st.typeLabel));
      if (st.factionName) {
        parts.push(st.factionId
          ? entitySpanHtml('faction:' + st.factionId, escapeHtml(st.factionName))
          : escapeHtml(st.factionName));
      }
      identEl.innerHTML = parts.join(' · ');
    }
    // Ticker line stays under the name. Leftover event card (badge/title/body/eventId) paints
    // beside it when this berth has a stored leftover card or a live leftover event. Leftover
    // story ledger paints on .sxb-berth__ledger through the same leftover writer.
    let arrival = { news: null, eventCard: null };
    try { arrival = buildDockArrival(s, { id: stationId(), name: st.name, services: st.services, typeLabel: st.typeLabel, factionName: st.factionName }); } catch (_) { /* keep empty arrival */ }
    writeBerthArrival(
      { newsEl, cardEl: eventEl },
      arrival,
      '',
    );
    // Shipworks borrows the bay to preview another hull. Everywhere else the ship in the bay
    // is the hull the mechanic just read.
    if (activeId !== 'shipworks') berth.show(s, arrival && arrival.hull);
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
    // INF-095: the cached app survives undock; event-driven refreshes while hidden are DOM
    // churn nobody sees. onShow renders everything from live state, so resume needs no catch-up.
    if (!shown) return;
    renderStatus();
    effects.syncPolicy();
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
  berth.show(state());
  // Restore the last destination this save left on, unless mission attention re-routes.
  arriving = true; // the first navigate does not settle the panel: arrive() choreographs it
  const remembered = ctx && ctx.screenMemory && ctx.screenMemory.read('station', 'destination', null);
  navigate(DESTINATIONS.some((d) => d.id === remembered) ? remembered : 'market');
  applyDockAttention({ allowAutoOpen: true });
  arriving = false;
  let pendingArrival = true;
  // Undock (moment 5): the panel and the foot k-out in 140 ms before uiRoot's existing fade.
  subscribe('dock:undocked', () => {
    bodyEl.classList.add('k-out');
    footEl.classList.add('k-out');
  });

  function activeScreen() {
    const dest = DESTINATIONS.find((d) => d.id === activeId);
    return dest ? screenCache.get(dest.id) : null;
  }

  return {
    el: app,
    refresh,
    navigate,
    onShow() {
      shown = true; commands.setEnabled(true); effects.show();
      // Fresh dock session: allow one auto-open for the highest-priority physical station action.
      attentionAutoOpenedThisDock = false;
      bodyEl.classList.remove('k-out');
      footEl.classList.remove('k-out');
      renderStatus();
      berth.show(state());
      berth.setActive(activeId !== 'shipworks');
      // Arrival (moment 4) on the station's first show after dock:docked.
      if (pendingArrival) { pendingArrival = false; arrive(); }
      // Berth-service receipts that posted before this show (dock toll, scan-adjacent charges)
      // were queued by showReceipt's hidden gate — drain them now that the surface is live.
      while (pendingReceipts.length) {
        const row = pendingReceipts.shift();
        showReceipt(row.kind, row.title, row.delta);
      }
      // First focus lands on the active dock tile. screenManager focuses the first focusable in DOM
      // order when a screen has not chosen one, and the topbar's HOLD gauge button precedes the
      // dock — so every keyboard-driven arrival painted a focus ring on the cargo readout. The tile
      // is the roving-tabindex owner the dock already maintains; focusing it changes no tabindex.
      const activeTile = dock.el && dock.el.querySelector('.sx-tile.is-active');
      if (activeTile) { try { activeTile.focus({ preventScroll: true }); } catch (_) {} }
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
      shown = false; commands.setEnabled(false); effects.hide();
      if (receiptTimer) { clearTimeout(receiptTimer); receiptTimer = 0; }
      receiptEl.hidden = true;
      setCommsOpen(false);
      const bulletin = app.querySelector('.so-bulletin');
      if (bulletin) bulletin.open = false;
      closePop();
      dock.setAttention(null);
      lastMissionAttention = null;
      berth.setActive(false);
      pendingArrival = true; // the next show is a new arrival
      const scr = activeScreen();
      if (scr && typeof scr.onHide === 'function') { try { scr.onHide(); } catch (_) {} }
    },
    dispose() {
      shown = false; commands.dispose(); effects.dispose();
      rootEl.classList.remove('sx-observatory');
      rootEl.removeAttribute('data-fh-temp');
      rootEl.removeAttribute('data-fh-register');
      berth.dispose();
      stopFloating();
      if (popCloseTimer) clearTimeout(popCloseTimer);
      if (receiptTimer) clearTimeout(receiptTimer);
      window.removeEventListener('keydown', onEscCapture, true);
      if (offExit) offExit();
      subscriptions.splice(0).forEach((off) => off());
      try { dock.dispose && dock.dispose(); } catch (_) {}
      try { dockRail.dispose(); } catch (_) {}
      try { setStationExitOwner(null); } catch (_) {}
      screenCache.forEach((s) => { try { s.dispose && s.dispose(); } catch (_) {} });
      screenCache.clear();
      app.remove();
    },
  };
}
