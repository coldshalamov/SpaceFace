import { stationFrameHtml } from '../views/stationFrames.js';
// src/ui/station/stationApp.js — the station as a place (Frontend Task C §1.2).
// Docking is an arrival, not a menu: the berth with the player's hull in it (the world canvas is
// frozen while docked, so the hull rig is the picture), the station's name at hero size, one line of
// local news plus the leftover event card when this berth is under a leftover event, leftover
// story ledger when leftover receipts can retell the campaign, the destinations
// as words along the bottom edge with Undock as the one primary word, credits and the vitals with
// their service verbs as a quiet column top-right. Every destination sits over that berth on the
// kit grid; no plates, no fascia, no operation rail.
//
// Behaviours carried over unchanged (same exported logic, new surface):
//   · Departure readiness  → Undock reads Ready/Check/Risk; launching while not ready opens a
//     Departure Check with the actual issues + jump-to-fix, then "Launch anyway".
//   · Cargo hold manifest  → the Hold vital opens the manifest (qty + what the station pays).
//   · First-dock handoff   → the opening docked route shows the 3-step guidance as a row of words.
import { stationOperationToSurface } from '../commandDeckRefitHooks.js';
import { createCommandDock } from './dock.js';
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';
import { el, settle, stamp, reducedMotion } from '../kit/index.js';
import { buildDockArrival, writeBerthArrival } from '../dockArrival.js';
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
import { missionDockAttention } from './missionDockAttention.js';
import { isChoiceECourierReady } from '../../story/endings/eligibility.js';

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

// One sheet. It holds the station's layout rules (kit tokens only) and the shared ship stage's;
// the kit (styles/kit.css) carries everything else. station-workbench.css and station-berth.css
// are gone (Task C §1.2).
const STATION_STYLES = [
  { id: 'sx-station-css', href: '/styles/station.css' },
];
// Also called by the in-flight THE SHIP screen (src/ui/ship/shipScreen.js): the shared shipworks
// stage wears .sx-sw* classes styled only by this sheet, so opening F2 before the first dock must
// not wait for a dock to inject it.
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
    show(state) {
      const request = stageRequest();
      if (!request || request.scene !== 'berth') return;
      const player = state && state.player;
      const ships = (player && player.ownedShips) || [];
      const ship = ships[Number(player && player.activeShipIndex) || 0] || ships[0] || null;
      const defId = (ship && ship.defId) || 'ship_kestrel';
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
  { id: 'market', label: 'Market', icon: 'market', tagline: 'Live prices · demand · trade', create: createMarketScreen },
  { id: 'shipworks', label: 'Shipworks', icon: 'shipworks', tagline: 'Buy ships · fit modules · compare', create: createShipworksScreen },
  { id: 'industry', label: 'Industry', icon: 'industry', tagline: 'Refine ore · fabricate modules', create: createIndustryScreen },
  // Player-facing label is Missions (contracts is the stable internal rail id + TARGET_MAP alias).
  { id: 'contracts', label: 'Missions', icon: 'contracts', tagline: 'Jobs · turn-ins · station leads', create: createContractsScreen },
  { id: 'factions', label: 'Factions', icon: 'factions', tagline: 'Standing & relations', create: createFactionsScreen },
  { id: 'bar', label: 'Bar', icon: 'bar', tagline: 'Rumors · contacts · leads', create: createBarScreen },
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

  // The host `.screen` is the kit screen; `.sx-app` is a plain wrapper (display: contents) so the
  // regions below sit directly on the kit grid. `app.className` is seeded exactly once (the hub-
  // classes check reads that) and never wiped.
  if (rootEl && rootEl.classList) rootEl.classList.add('k-screen');
  const app = document.createElement('div');
  app.className = 'sx-app';
  app.innerHTML = stationFrameHtml();
  rootEl.appendChild(app);

  const berthCanvas = app.querySelector('.sxb-berth__world');
  const berth = createBerth(berthCanvas, ctx);
  const crestName = app.querySelector('.sxb-berth__name');
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
    // Rows: the surface at body, its state in k-good / k-signal / k-bad text; each row is the
    // jump-to-fix button. "Launch anyway" is the one primary word.
    const rows = dep.chips.map((c) => {
      const cls = c.kind === 'bad' ? 'is-bad k-bad' : (c.kind === 'warn' ? 'is-warn k-signal' : 'is-ok k-good');
      const dest = c.targetTab ? resolveTarget(c.targetTab).destination : null;
      const attr = c.targetScreen ? ` data-pop-screen="${escapeHtml(c.targetScreen)}"`
        : (dest ? ` data-pop-nav="${escapeHtml(dest)}"` : '');
      const aria = escapeHtml((c.actionLabel || (c.label + ' ' + c.text)));
      return `<li><button type="button" class="k-row sx-depchip ${cls}"${attr} aria-label="${aria}">` +
        `<b class="k-row__name">${escapeHtml(c.label)}</b><span class="k-row__num">${escapeHtml(c.text)}</span></button></li>`;
    }).join('');
    const stateCls = dep.state === 'ready' ? 'k-good' : (dep.state === 'check' ? 'k-signal' : 'k-bad');
    openPop(
      `<div class="sx-pop__head k-t-emph">Departure check · <em class="is-${dep.state} ${stateCls}">${escapeHtml(dep.status)}</em></div>` +
      `<ul class="k-rows sx-pop__chips">${rows}</ul>` +
      `<button type="button" class="k-word k-word--emph k-word--primary sx-btn-primary" data-pop-launch>Launch anyway</button>`,
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
      return `<li><button type="button" class="k-row sx-holdrow" data-hold-item="${escapeHtml(id)}" data-hold-volume="${volume.toFixed(2)}" aria-label="Sell ${escapeHtml(CMDTY_NAME.get(id) || id)}. ${fmtCr(qty)} units, ${fmtCr(volume)} hold units, ${unit != null ? fmtCr(unit * qty) + ' credits' : 'no quote'}.">` +
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
    // The three steps as fine words in a row under the news line; a done step reads at 38 %.
    const html =
      `<span class="k-caps sxb-handoff__k">Getting started</span>` +
      steps.map((st, i) => {
        // A step whose target is a verb (`services` → undock) carries the verb. It previously fell
        // through `TARGET_MAP[tab] || 'market'`, so "Launch · safe to undock" opened the Market.
        const target = resolveTarget(st.targetTab);
        const cls = st.done ? 'is-done k-38' : (st.kind === 'bad' ? 'is-bad k-bad' : (st.kind === 'warn' ? 'is-warn' : 'is-ok'));
        const mode = st.tradeMode === 'sell' || st.tradeMode === 'buy' ? st.tradeMode : '';
        const attr = target.destination
          ? ` data-handoff="${escapeHtml(target.destination)}"`
          : (target.action ? ` data-handoff-act="${escapeHtml(target.action)}"` : '');
        if (!attr) return '';
        return `<button type="button" class="k-word k-word--fine sxb-hstep ${cls}"${attr}` +
          (mode ? ` data-handoff-mode="${mode}"` : '') +
          ` data-why="${escapeHtml(st.text)}" aria-label="${escapeHtml(st.title + '. ' + st.text)}">` +
          `<span class="sxb-hstep__n">${i + 1}</span> ` +
          `<span class="sxb-hstep__t">${escapeHtml(st.title)}</span></button>`;
      }).join('') +
      `<button type="button" class="k-word k-word--fine k-38 sxb-handoff__x" data-handoff-dismiss aria-label="Dismiss getting started guidance">Dismiss</button>`;
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
    if (!arriving) settle(screen.el, { from: DESTINATIONS.indexOf(dest) < 3 ? 'left' : 'right', state: 'station:navigate' });
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
    const hero = !TITLE_SIZED.has(id) || (arriving && !arrivedOnce);
    crestName.classList.toggle('k-t-hero', hero);
    crestName.classList.toggle('k-t-title', !hero);
    titleBlock.classList.toggle('sxb-berth--clear', TITLE_SIZED.has(id));
    berth.setActive(id !== 'shipworks');
  }

  // Arrival (moment 4): the name stamps in, then the news line, then the foot words, then the
  // panel. The dock swell (sfx_dock_clunk) is the audio system's own on dock:docked.
  function arrive() {
    arriving = true;
    arrivedOnce = false;
    const reduced = reducedMotion();
    const finish = () => {
      arrivedOnce = true;
      arriving = false;
      applyDestinationRegister(activeId);
    };
    if (reduced || typeof requestAnimationFrame !== 'function') { finish(); return; }
    const nameWords = splitWords(crestName);
    stamp(nameWords, { gap: 60, state: 'station:arrive' });
    settle(newsEl, { from: 'top', delay: 200, state: 'station:arrive' });
    const footWords = [...footEl.querySelectorAll('.sx-tile'), launchEl].filter(Boolean);
    setTimeout(() => stamp(footWords, { gap: 60, state: 'station:arrive' }), 400);
    const screen = screenCache.get(activeId);
    if (screen && screen.el) settle(screen.el, { from: 'left', delay: 700, state: 'station:arrive' });
    setTimeout(finish, 1200);
  }
  /** Wrap each word of the name in a span so stamp() can land them one by one. */
  function splitWords(h1) {
    const text = h1.textContent || '';
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return [h1];
    h1.replaceChildren(...parts.flatMap((w, i) => {
      const span = el('span', 'sxb-berth__word', w);
      return i < parts.length - 1 ? [span, document.createTextNode(' ')] : [span];
    }));
    return [...h1.children];
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
        insurance: toCost(q('insurance'), 'insurance'),
        wash: washAvailable
          ? toCost(q('hull_wash'), 'hull_wash')
          : { text: 'Offline', disabled: true, title: 'Hull wash requires a repair berth' },
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
    const typeMap = { repair: 'repair', refuel: 'refuel', resupply: 'ammo', wash: 'hull_wash', insurance: 'insurance' };
    const type = typeMap[id];
    if (type && bus) {
      if (type === 'hull_wash' && !resolveStation(ctx).services.includes('repair')) return false;
      let quote = null;
      if (typeof opts.serviceQuote === 'function') {
        try { quote = opts.serviceQuote(type, state(), playerEntity(state())); } catch (_) { quote = null; }
      }
      if (quote && quote.disabled) return false;
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
        body: 'Station recovery will no longer protect installed modules on death. Cargo loss still applies either way, and cancelling does not refund the paid deductible.',
        confirmLabel: 'Cancel Insurance',
        cancelLabel: 'Keep Insurance',
        danger: true,
      } : {
        title: 'Insure installed modules?',
        body: `${quote.detail} · ${fmtCr(quote.cost)} cr`,
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
      return ghost ? '' : `<span class="sxb-vital__ok k-t-fine k-38">${escapeHtml(text)}</span>`;
    }
    const cls = 'k-word k-word--fine sxb-vital__act' + (ghost ? ' sxb-vital__act--ghost' : '');
    const why = cost.title ? ` data-why="${escapeHtml(cost.title)}"` : '';
    const copy = ghost ? label : `${label} · ${text}`;
    return `<button type="button" class="${cls}" data-vital-act="${id}"${why}` +
      ` aria-label="${escapeHtml(cost.title || (label + ' ' + text))}">${escapeHtml(copy)}</button>`;
  }

  // A vital is one static kit row: the label at body 62 %, the value at emphasis (data-tone kept:
  // bad → k-bad, warn → k-signal), the verb as a fine word — and a 2 px k-bar under the label as
  // the track (the tab check reads its width). Hold's head is the manifest button.
  function vitalHtml(v) {
    const pct = Math.max(0, Math.min(100, Math.round(v.frac * 100)));
    const toneCls = v.tone === 'bad' ? ' k-bad' : (v.tone === 'warn' ? ' k-signal' : '');
    const track = v.track === false ? ''
      : `<span class="k-bar sxb-vital__track" role="img" aria-label="${escapeHtml(v.aria)}">` +
        `<span class="k-bar__fill sxb-vital__fill" style="width:${pct}%"></span></span>`;
    const label = `<span class="sxb-vital__label k-t-body k-62">${escapeHtml(v.label)}</span>${track}`;
    const headEl = v.openHold
      ? `<button type="button" class="k-word k-word--body sxb-vital__head" data-hold data-pop-owner` +
          ` aria-label="${escapeHtml(v.aria)}. Open the cargo manifest.">${label}</button>`
      : `<span class="sxb-vital__head">${label}</span>`;
    const value = `<span class="sxb-vital__value k-t-emph${toneCls}">${escapeHtml(v.value)}</span>`;
    const acts = v.acts.filter(Boolean);
    const actsEl = `<span class="sxb-vital__acts">${acts.join('')}</span>`;
    return `<li class="k-row k-row--static sxb-vital sxb-vital--${v.k}" data-tone="${v.tone}">${headEl}${value}${actsEl}</li>`;
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
               vitalActHtml('wash', costs.wash, 'Wash', true),
               vitalActHtml('insurance', costs.insurance, s.player?.insurance?.insuredModules ? 'Insurance · Active' : 'Insurance', true)],
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
    // The sub-word under Undock: Ready · Check · Risk (the tab check reads exactly these).
    setTextIfChanged(launchStateEl, titleCaseWords(depState));

    const st = resolveStation(ctx);
    setTextIfChanged(crestName, st.name || 'Station');
    // Ticker line stays under the name. Leftover event card (badge/title/body/eventId) paints
    // beside it when this berth has a stored leftover card or a live leftover event. Leftover
    // story ledger paints on .sxb-berth__ledger through the same leftover writer.
    let arrival = { news: null, eventCard: null };
    try { arrival = buildDockArrival(s, { id: stationId(), name: st.name, services: st.services }); } catch (_) { /* keep empty arrival */ }
    writeBerthArrival(
      { newsEl, cardEl: eventEl },
      arrival,
      [st.factionName, st.typeLabel].filter(Boolean).join(' · '),
    );
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
      // Fresh dock session: allow one auto-open for the highest-priority physical station action.
      attentionAutoOpenedThisDock = false;
      bodyEl.classList.remove('k-out');
      footEl.classList.remove('k-out');
      renderStatus();
      berth.show(state());
      berth.setActive(activeId !== 'shipworks');
      // Arrival (moment 4) on the station's first show after dock:docked.
      if (pendingArrival) { pendingArrival = false; arrive(); }
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
      closePop();
      dock.setAttention(null);
      lastMissionAttention = null;
      berth.setActive(false);
      pendingArrival = true; // the next show is a new arrival
      const scr = activeScreen();
      if (scr && typeof scr.onHide === 'function') { try { scr.onHide(); } catch (_) {} }
    },
    dispose() {
      berth.dispose();
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
