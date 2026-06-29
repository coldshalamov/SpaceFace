// src/ui/screens/stationHub.js — the docked STATION hub screen (id 'station').
// A 7-tab left rail (Market / Shipyard / Outfitting / Missions / Services / Factions / Bar) + a
// right content pane; switching tabs swaps the active panel (state.ui.activeStationTab). An Undock
// button emits dock:undocked. onShow(ctx) resolves the docked station and refreshes panels.
//
// Screen-module interface (ARCHITECTURE §5, uiRoot imports + registers this):
//   { id:'station', mount(rootEl, ctx), onShow(ctx), onHide(), refresh(ctx) }
//
// stationHub imports the tab-panel FACTORIES from sibling files in this set (they each return
// { el, onShow(ctx), refresh(ctx) }). The Missions tab is rendered inline here (the dedicated
// missionBoard.js screen belongs to another agent; the hub needs only a board view).
//
// READS state for display; EMITS intents only — never mutates sim state (§5, invariant 15).
import { createMarketPanel } from './market.js';
import { createShipyardPanel } from './shipyard.js';
import { createOutfittingPanel } from './outfitting.js';
import { createServicesPanel } from './services.js';
import { createManufacturePanel } from './manufacture.js';
import { createFactionsPanel } from './factions.js';
import { createBarPanel } from './bar.js';
import { SECTORS } from '../../data/sectors.js';
import { FACTION_META } from '../../data/factions.js';
import { COMMODITIES } from '../../data/commodities.js';
import { escapeHtml } from '../comms.js';
import { missionPreflight } from '../missionPreflight.js';
import { missionConsequenceSummary } from '../missionPreflight.js';
import { missionStandingRequirement } from '../missionPreflight.js';
import { BINDINGS } from '../bindings.js';

const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_BY_ID = new Map();
for (const sec of SECTORS) {
  for (const stn of sec.stations || []) STATION_BY_ID.set(stn.id, stn);
}

// Tab order = the §5.3 rail. id === state.ui.activeStationTab value.
const TABS = [
  { id: 'market', label: 'Market', icon: '⚖', help: 'Buy cargo, sell cargo, and set profitable trade nav routes.' },
  { id: 'shipyard', label: 'Shipyard', icon: '⛴', help: 'Buy hulls to change cargo space, survivability, handling, and module slots.' },
  { id: 'outfit', label: 'Outfitting', icon: '⚙', help: 'Install modules so your active hull can fight, mine, haul, or survive better.' },
  { id: 'manufacture', label: 'Manufacture', icon: '⚒', help: 'Turn mined and traded materials into modules, upgrades, and hulls.' },
  { id: 'missions', label: 'Missions', icon: '✦', help: 'Accept contracts; accepted missions auto-track and place nav guidance.' },
  { id: 'services', label: 'Services', icon: '⛽', help: 'Refuel, repair, and handle station services before undocking.' },
  { id: 'factions', label: 'Factions', icon: '⚑', help: 'Check standing and learn which groups control stations and contracts.' },
  { id: 'bar', label: 'Bar', icon: '☕', help: 'Find rumors, contacts, and station-side leads.' },
];

const SERVICE_LABELS = {
  trade: 'Market',
  shipyard: 'Shipyard',
  refuel: 'Refuel',
  repair: 'Repair',
  missions: 'Missions',
  ore_buy: 'Ore Buyer',
  refine: 'Refinery',
  module_craft: 'Manufacture',
  toll: 'Customs Toll',
  scan: 'Security Scan',
  black_market: 'Black Market',
  scan_tech: 'Survey Lab',
};

const TAB_SERVICE_RULES = {
  market: {
    any: ['trade', 'black_market'],
    availableLabel: 'trade desk here',
    unavailableLabel: 'no trade desk',
    unavailableHint: 'Use the Local Map or Star Map to find a market station.',
  },
  shipyard: {
    any: ['shipyard'],
    availableLabel: 'shipyard here',
    unavailableLabel: 'no shipyard',
    unavailableHint: 'Look for a trade hub or fabricator with shipyard service.',
  },
  outfit: {
    any: ['shipyard', 'module_craft'],
    availableLabel: 'outfitting here',
    unavailableLabel: 'no outfitting bay',
    unavailableHint: 'Look for shipyards or fabricators before buying gear.',
  },
  manufacture: {
    any: ['module_craft', 'refine'],
    availableLabel: 'fab bay here',
    unavailableLabel: 'no fabrication bay',
    unavailableHint: 'Bring materials to a refinery or fabricator station.',
  },
  missions: {
    any: ['missions', 'black_market'],
    availableLabel: 'contracts here',
    unavailableLabel: 'no mission desk',
    unavailableHint: 'Try a station with missions or a black-market contact.',
  },
  services: {
    any: ['refuel', 'repair', 'toll', 'scan', 'scan_tech'],
    availableLabel: 'services here',
    unavailableLabel: 'limited services',
    unavailableHint: 'Fuel, repair, toll, and scan services vary by station.',
  },
};

const DEPARTURE_SCREEN_LABELS = {
  missionLog: 'Mission Log',
};

const STATION_TYPE_PURPOSE = {
  trade_hub: 'Trade hubs are the safest place to compare prices, find legal cargo, and turn credits into better hulls.',
  refinery: 'Refineries want ore and gas, then turn raw mining runs into refined materials for manufacturing.',
  mining: 'Mining outposts sell field supplies and point you toward asteroid work, bulk contracts, and ore buyers.',
  fab: 'Fabricators consume refined goods and components; bring materials here when you want modules or new hull options.',
  military: 'Military stations favor repair, refuel, combat contracts, and restricted goods tied to faction standing.',
  blackmarket: 'Black markets pay for risky cargo and covert work, but their goods and contracts can attract trouble.',
  research: 'Research stations value scans, exotic materials, and tech-linked opportunities.',
};

function stationTypeLabel(type) {
  if (!type) return 'Station';
  return titleCaseWords(type);
}

function titleCaseWords(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function stationServiceLabel(serviceId) {
  return SERVICE_LABELS[serviceId] || titleCaseWords(serviceId);
}

function tabLabel(tabId) {
  const tab = TABS.find((t) => t.id === tabId);
  return (tab && tab.label) || titleCaseWords(tabId);
}

export function stationTabServiceStatus(tabId, stn) {
  const rule = TAB_SERVICE_RULES[tabId];
  const label = tabLabel(tabId);
  if (!rule) {
    return {
      state: 'neutral',
      offered: true,
      label: 'station-wide',
      title: label + ': station-wide information. ' + tabPurpose(tabId),
    };
  }
  const services = (stn && Array.isArray(stn.services)) ? stn.services : [];
  if (!services.length) {
    return {
      state: 'unknown',
      offered: true,
      label: 'check services',
      title: label + ': service list unknown. ' + tabPurpose(tabId),
    };
  }
  const offered = rule.any.some((service) => services.includes(service));
  if (offered) {
    return {
      state: 'available',
      offered: true,
      label: rule.availableLabel,
      title: label + ': ' + rule.availableLabel + '. ' + tabPurpose(tabId),
    };
  }
  return {
    state: 'unavailable',
    offered: false,
    label: rule.unavailableLabel,
    title: label + ': ' + rule.unavailableLabel + ' at ' + ((stn && stn.name) || 'this station') + '. ' + rule.unavailableHint,
  };
}

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}

function pushDepartureScreen(ctx, screenId) {
  if (!screenId || !Object.prototype.hasOwnProperty.call(DEPARTURE_SCREEN_LABELS, screenId)) return false;
  const mgr = getManager(ctx);
  if (mgr && typeof mgr.pushScreen === 'function') {
    mgr.pushScreen(screenId);
    return true;
  }
  if (ctx && ctx.bus && typeof ctx.bus.emit === 'function') {
    ctx.bus.emit('ui:pushScreen', { id: screenId });
    return true;
  }
  return false;
}

function stationPurpose(stn) {
  const type = stn && stn.type;
  return STATION_TYPE_PURPOSE[type] || 'Dock here to trade, repair, find work, and prepare the ship for the next flight.';
}

function stationServiceSummary(stn) {
  const services = (stn && Array.isArray(stn.services)) ? stn.services : [];
  if (!services.length) return 'Available actions depend on this station type and your standing.';
  return 'Available here: ' + services.map(stationServiceLabel).join(', ') + '.';
}

function stationRecordId(stn) {
  if (!stn) return null;
  if (typeof stn.stationId === 'string' && stn.stationId) return stn.stationId;
  return (typeof stn.id === 'string' && stn.id) ? stn.id : null;
}

function liveStationEntity(state, stationId) {
  for (const e of ((state && state.entityList) || [])) {
    if (e && e.type === 'station' && e.data && e.data.stationId === stationId) return e;
  }
  return null;
}

function stationDefFrom(record, entity, stationId) {
  if (!record && !entity) return null;
  const data = (entity && entity.data) || {};
  return {
    ...(record || {}),
    id: stationId || stationRecordId(record) || data.stationId || null,
    name: (record && record.name) || data.name || data.stationName || data.stationId || stationId || 'Station',
    type: (record && (record.type || record.stationTypeId)) || data.stationTypeId || data.type || '',
    size: (record && record.size) || data.size || 'M',
    services: (record && record.services) || data.services || [],
    factionId: (record && record.factionId) || data.factionId || (entity && entity.factionId) || null,
  };
}

function tabPurpose(tabId) {
  const tab = TABS.find((t) => t.id === tabId);
  return (tab && tab.help) || 'Pick a station action, then undock with a clearer next objective.';
}

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback == null ? 0 : fallback;
  return Math.max(0, Math.min(1, n));
}

function fmtPercent(frac) {
  return Math.round(clamp01(frac, 0) * 100) + '%';
}

function fmtDepartUnits(value) {
  if (!Number.isFinite(value)) return '0';
  return (Math.round(value * 10) / 10).toLocaleString('en-US');
}

function clipDepartureText(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  return raw.length > 42 ? raw.slice(0, 39) + '...' : raw;
}

function departureChipActionTitle(chip) {
  if (!chip) return '';
  if (chip.targetScreen) {
    const screenLabel = DEPARTURE_SCREEN_LABELS[chip.targetScreen] || 'screen';
    return chip.actionLabel || ('Open ' + screenLabel);
  }
  if (!chip.targetTab) return '';
  const tab = TABS.find((t) => t.id === chip.targetTab);
  const tabLabel = tab ? tab.label : 'station tab';
  return chip.actionLabel || ('Open ' + tabLabel);
}

function departureChipHtml(chip) {
  const cls = 'st-departure-chip st-departure-chip--' + chip.kind;
  const body =
    '<b>' + escapeHtml(chip.label) + '</b>' +
    '<span>' + escapeHtml(chip.text) + '</span>';
  const targetAttr = chip.targetScreen
    ? ' data-departure-screen="' + escapeHtml(chip.targetScreen) + '"'
    : (chip.targetTab ? ' data-departure-tab="' + escapeHtml(chip.targetTab) + '"' : '');
  if (!targetAttr) return '<span class="' + cls + '">' + body + '</span>';
  const title = departureChipActionTitle(chip);
  return '<button type="button" class="' + cls + '"' + targetAttr +
    ' title="' + escapeHtml(title) + '" aria-label="' + escapeHtml(title + ': ' + chip.label + ' ' + chip.text) + '">' +
    body +
    '</button>';
}

function playerEntity(state) {
  return state && state.entities && state.entities.get && state.playerId != null
    ? state.entities.get(state.playerId)
    : null;
}

function missionId(m) {
  return m && (m.id != null ? m.id : m.missionId);
}

function departureTradeWaypointChip(state, waypoint) {
  if (!waypoint || waypoint.kind !== 'trade') return null;
  const commodityId = waypoint.commodityId;
  const commodity = commodityId ? COMMODITY_BY_ID.get(commodityId) : null;
  const commodityName = (commodity && commodity.name) ||
    String((waypoint.reason || '').replace(/^Sell\s+/i, '') || 'cargo');
  const rawLabel = waypoint.label || waypoint.stationName || waypoint.stationId || waypoint.sectorName || 'Trade destination';
  const destination = String(rawLabel).split(' · ')[0] || rawLabel;
  const cargo = state && state.player && state.player.cargo || {};
  const qty = commodityId ? Math.max(0, Math.floor(Number(cargo.items && cargo.items[commodityId]) || 0)) : 0;
  if (commodityId && qty <= 0) {
    return {
      kind: 'warn',
      label: 'Route',
      text: clipDepartureText(destination + ': no ' + commodityName + ' aboard'),
      targetTab: 'market',
      actionLabel: 'Open Market to load route cargo',
    };
  }
  if (commodityId) {
    return {
      kind: 'ok',
      label: 'Route',
      text: clipDepartureText(destination + ': ' + fmtDepartUnits(qty) + 'u ' + commodityName),
      targetTab: 'market',
      actionLabel: 'Open Market to review route cargo',
    };
  }
  return {
    kind: 'info',
    label: 'Route',
    text: clipDepartureText(waypoint.reason || rawLabel),
    targetTab: 'market',
    actionLabel: 'Open Market to review route cargo',
  };
}

function departureMissionChip(state) {
  const trackedId = state && state.ui && state.ui.trackedMissionId;
  const active = state && state.missions && Array.isArray(state.missions.active) ? state.missions.active : [];
  const activeJobs = active.filter((m) => m && (m.status == null || m.status === 'active'));
  const tracked = trackedId ? active.find((m) => missionId(m) === trackedId) : null;
  if (tracked) {
    return {
      kind: 'ok',
      label: 'Track',
      text: clipDepartureText(tracked.title || prettyType(tracked.type)),
      targetScreen: 'missionLog',
      actionLabel: 'Open Mission Log to review tracked job',
    };
  }
  if (activeJobs.length > 0) {
    const one = activeJobs.length === 1;
    return {
      kind: 'warn',
      label: 'Track',
      text: one ? '1 untracked job' : activeJobs.length + ' untracked jobs',
      targetScreen: 'missionLog',
      actionLabel: one ? 'Open Mission Log to track the active job' : 'Open Mission Log to pick a tracked job',
    };
  }
  const waypoint = state && state.nav && state.nav.waypoint;
  if (waypoint) {
    const tradeChip = departureTradeWaypointChip(state, waypoint);
    if (tradeChip) return tradeChip;
    const label = waypoint.label || waypoint.reason || waypoint.stationName || waypoint.stationId || waypoint.sectorId || 'Nav guidance set';
    return {
      kind: 'info',
      label: 'Nav',
      text: clipDepartureText(label),
      targetScreen: 'missionLog',
      actionLabel: 'Open Mission Log to review objectives',
    };
  }
  return {
    kind: 'warn',
    label: 'Track',
    text: 'No tracked job',
    targetTab: 'missions',
    actionLabel: 'Open Missions to accept and track a job',
  };
}

function departureCargoChip(state) {
  const cargo = state && state.player && state.player.cargo || {};
  const cap = Number(cargo.capVolume);
  const used = Number(cargo.usedVolume);
  if (!(cap > 0)) return { kind: 'bad', label: 'Hold', text: 'No cargo data' };
  const safeUsed = Number.isFinite(used) ? Math.max(0, used) : 0;
  const free = Math.max(0, cap - safeUsed);
  const freeFrac = free / cap;
  const kind = free <= 0.1 ? 'bad' : (freeFrac < 0.18 ? 'warn' : 'ok');
  return {
    kind,
    label: 'Hold',
    text: fmtDepartUnits(free) + 'u free',
    targetTab: 'market',
    actionLabel: kind === 'ok' ? 'Open Market to review cargo' : 'Open Market to sell cargo',
  };
}

function departureFuelChip(state) {
  const fuel = state && state.fuel || {};
  const current = Number(fuel.current);
  const max = Number(fuel.max);
  if (!(max > 0)) return { kind: 'warn', label: 'Fuel', text: 'Unknown' };
  const frac = clamp01(current / max, 0);
  const kind = frac < 0.25 ? 'bad' : (frac < 0.45 ? 'warn' : 'ok');
  return {
    kind,
    label: 'Fuel',
    text: fmtPercent(frac),
    targetTab: 'services',
    actionLabel: kind === 'ok' ? 'Open Services to review launch supplies' : 'Open Services to refuel',
  };
}

function departureHullChip(state) {
  const ship = playerEntity(state);
  if (!ship || !(ship.hullMax > 0)) return { kind: 'warn', label: 'Hull', text: 'Unknown' };
  const frac = clamp01((ship.hull || 0) / ship.hullMax, 0);
  const kind = frac < 0.35 ? 'bad' : (frac < 0.7 ? 'warn' : 'ok');
  return {
    kind,
    label: 'Hull',
    text: fmtPercent(frac),
    targetTab: 'services',
    actionLabel: kind === 'ok' ? 'Open Services to review ship readiness' : 'Open Services to repair hull',
  };
}

function departureReadinessChips(state) {
  return [
    departureMissionChip(state),
    departureCargoChip(state),
    departureFuelChip(state),
    departureHullChip(state),
  ];
}

function departureReadinessSummary(chips) {
  const list = Array.isArray(chips) ? chips.filter(Boolean) : [];
  const issues = list.filter((chip) => chip.kind === 'bad' || chip.kind === 'warn');
  const hasBad = issues.some((chip) => chip.kind === 'bad');
  const hasWarn = issues.some((chip) => chip.kind === 'warn');
  const state = hasBad ? 'risk' : (hasWarn ? 'check' : 'ready');
  const status = hasBad ? 'RISK' : (hasWarn ? 'CHECK' : 'READY');
  const issueText = issues
    .map((chip) => (String(chip.label || 'Check') + ': ' + String(chip.text || '')).trim())
    .filter((text) => text.length > 2)
    .join('; ');
  return {
    state,
    status,
    label: '⏏ UNDOCK · ' + status,
    title: issueText
      ? 'Departure Check: ' + status + '. ' + issueText + '. Undock remains available.'
      : 'Departure Check: READY. Tracked work, cargo, fuel, and hull look serviceable.',
  };
}

function activeMissionCount(state) {
  const active = state && state.missions && Array.isArray(state.missions.active) ? state.missions.active : [];
  return active.filter((m) => m && (m.status == null || m.status === 'active')).length;
}

function firstDockStoryIndex(state) {
  const story = state && state.story || {};
  const raw = story.beatIndex != null ? story.beatIndex :
    (story.currentBeatIndex != null ? story.currentBeatIndex : story.beat);
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function firstDockHandoffVisible(state, stationId) {
  if (!state || !stationId) return false;
  const ob = state.onboarding || null;
  const done = ob && ob.done || {};
  const storyIndex = firstDockStoryIndex(state);
  const firstLoopOpen = !!ob && ob.finished !== true && done.next !== true;
  const earlyStory = storyIndex != null && storyIndex <= 1;
  if (!firstLoopOpen && !earlyStory) return false;
  if (activeMissionCount(state) > 0 && (done.sell === true || done.next === true || (ob && ob.finished === true))) return false;
  return true;
}

function firstDockDepartureTarget(chips) {
  const issue = (Array.isArray(chips) ? chips : []).find((chip) => chip && (chip.kind === 'bad' || chip.kind === 'warn'));
  if (issue && issue.targetTab) return issue.targetTab;
  return 'services';
}

export function firstDockHandoffSteps(state = {}) {
  const ob = state.onboarding || {};
  const done = ob.done || {};
  const activeJobs = activeMissionCount(state);
  const missionDone = activeJobs > 0 || done.next === true;
  const departureChips = departureReadinessChips(state);
  const departure = departureReadinessSummary(departureChips);
  const marketDone = done.sell === true;
  return [
    {
      key: 'market',
      label: 'Market',
      title: 'Sell / audit sample',
      text: marketDone
        ? 'Sample cleared; credits and hold space are ready.'
        : 'Sell mined cargo, free hold space, and confirm the manifest.',
      kind: marketDone ? 'ok' : 'warn',
      done: marketDone,
      targetTab: 'market',
    },
    {
      key: 'missions',
      label: 'Missions',
      title: 'Accept one low-risk job',
      text: missionDone
        ? (activeJobs === 1 ? 'One job is active; Mission Log carries the route.' : activeJobs + ' jobs active; track the one you want next.')
        : 'Pick a nearby R0-R1 contract; Accept + Track feeds nav.',
      kind: missionDone ? 'ok' : 'warn',
      done: missionDone,
      targetTab: 'missions',
    },
    {
      key: 'departure',
      label: 'Departure Check',
      title: 'Launch when safe',
      text: departure.state === 'ready'
        ? 'Fuel, hull, cargo, and tracked work look serviceable.'
        : departure.status + ': fix the highlighted launch concern.',
      kind: departure.state === 'risk' ? 'bad' : (departure.state === 'check' ? 'warn' : 'ok'),
      done: departure.state === 'ready' && missionDone,
      targetTab: firstDockDepartureTarget(departureChips),
    },
  ];
}

function handoffStepHtml(step) {
  const done = step.done ? ' is-done' : '';
  const cls = 'st-handoff-step st-handoff-step--' + step.kind + done;
  const body =
    '<span class="st-handoff-step-label mono">' + escapeHtml(step.label) + '</span>' +
    '<span class="st-handoff-step-title">' + escapeHtml(step.title) + '</span>' +
    '<span class="st-handoff-step-copy">' + escapeHtml(step.text) + '</span>';
  if (!step.targetTab) return '<span class="' + cls + '">' + body + '</span>';
  return '<button type="button" class="' + cls + '" data-handoff-tab="' + escapeHtml(step.targetTab) + '"' +
    ' title="' + escapeHtml('Open ' + tabLabel(step.targetTab) + ': ' + step.title) + '"' +
    ' aria-label="' + escapeHtml('Open ' + tabLabel(step.targetTab) + ': ' + step.title + '. ' + step.text) + '">' +
    body +
    '</button>';
}

export function missionBoardReadiness(preflight = {}) {
  if (preflight.blocker) {
    return {
      state: 'blocked',
      kind: 'bad',
      label: 'BLOCKED',
      title: preflight.blocker,
    };
  }
  if (preflight.warning) {
    return {
      state: 'caution',
      kind: 'warn',
      label: 'CHECK',
      title: preflight.warning,
    };
  }
  return {
    state: 'ready',
    kind: 'ok',
    label: 'READY',
    title: 'Ready to accept, auto-track, and add to Mission Log.',
  };
}

function missionOfferId(m) {
  return m && (m.id != null ? m.id : m.missionId);
}

function missionRiskTier(m) {
  const raw = m && (m.riskTier != null ? m.riskTier : (m.risk != null ? m.risk : 0));
  const risk = Number(raw);
  return Number.isFinite(risk) ? Math.max(0, Math.round(risk)) : 0;
}

function missionRiskCopy(riskValue) {
  const risk = Math.max(0, Math.round(Number(riskValue) || 0));
  const band = risk >= 4 ? 'severe'
    : risk >= 3 ? 'high'
      : risk >= 2 ? 'elevated'
        : risk >= 1 ? 'moderate'
          : 'low';
  const prep = risk >= 3
    ? 'review hull, fuel, and escape route before accepting'
    : risk >= 2
      ? 'review route and ship readiness before accepting'
      : 'routine work for a prepared ship';
  return 'Risk ' + risk + ': ' + band + ' threat; ' + prep + '.';
}

function missionRecommendationReason(m, preflight, readiness, consequences) {
  const risk = missionRiskTier(m);
  const reward = consequences && consequences.reward > 0
    ? '+' + consequences.reward.toLocaleString('en-US') + ' cr'
    : 'contract payout';
  const routeChip = (preflight.chips || []).find((chip) =>
    chip && (chip.text === 'Local sector' || /^Jump route: /.test(chip.text) || /^Route: /.test(chip.text))
  );
  const route = routeChip ? routeChip.text : missionDestName(m || {});
  if (readiness.state === 'blocked') {
    return 'Prep first: ' + (preflight.blocker || readiness.title || 'clear the blocker') + '.';
  }
  if (readiness.state === 'caution') {
    return 'Strong pick after one check: ' + (preflight.warning || readiness.title || 'review readiness') +
      '. ' + reward + ', Risk ' + risk + ', ' + route + '.';
  }
  return 'Best board pick: ready now, ' + reward + ', Risk ' + risk + ', ' + route + '.';
}

export function recommendMissionBoardOffer(slots = [], state = {}) {
  const candidates = (Array.isArray(slots) ? slots : [])
    .map((mission, index) => {
      if (!mission) return null;
      const id = missionOfferId(mission);
      if (id == null || id === '') return null;
      const preflight = missionPreflight(mission, state);
      const readiness = missionBoardReadiness(preflight);
      const consequences = missionConsequenceSummary(mission);
      const risk = missionRiskTier(mission);
      const collateral = consequences.collateral || 0;
      const reward = consequences.reward || 0;
      const readinessScore = readiness.state === 'ready' ? 10000 : (readiness.state === 'caution' ? 6500 : 1000);
      const score = readinessScore +
        Math.min(2200, reward / 8) -
        risk * 350 -
        Math.min(1600, collateral / 15) -
        (preflight.warning ? 250 : 0);
      return { mission, missionId: id, index, preflight, readiness, consequences, risk, score };
    })
    .filter(Boolean)
    .sort((a, b) => (b.score - a.score) || (a.risk - b.risk) || (a.index - b.index));

  const best = candidates[0];
  if (!best) return null;
  const blocked = best.readiness.state === 'blocked';
  return {
    mission: best.mission,
    missionId: best.missionId,
    kind: best.readiness.kind,
    state: best.readiness.state,
    label: blocked ? 'PREP FIRST' : (best.readiness.state === 'caution' ? 'RECOMMENDED - CHECK' : 'RECOMMENDED'),
    title: best.mission.title || prettyType(best.mission.type),
    reason: missionRecommendationReason(best.mission, best.preflight, best.readiness, best.consequences),
    actionLabel: blocked ? 'Resolve Prep' : 'Accept Recommended',
    disabled: blocked,
  };
}

let cssInjected = false;
function injectCss() {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const style = document.createElement('style');
  style.id = 'ui-station-styles';
  style.textContent = STATION_CSS;
  document.head.appendChild(style);
}

export const stationHub = {
  id: 'station',
  _ctx: null,
  _panels: null,        // { market, shipyard, outfit, services, factions, bar } panel objects
  _missionEls: null,
  _stationId: null,
  _subbed: false,

  /** Build the screen DOM once and cache it. Called by uiRoot/screenManager. */
  mount(rootEl, ctx) {
    this._ctx = ctx;
    injectCss();

    const screen = document.createElement('div');
    screen.className = 'st-hub panel';

    // top bar: station name / faction / services
    const topbar = document.createElement('div');
    topbar.className = 'st-topbar';
    topbar.innerHTML =
      '<div class="st-topbar-l"><span class="st-station-name">Station</span>' +
      '<span class="st-station-fac mono"></span></div>' +
      '<button class="st-undock">⏏ UNDOCK</button>';
    screen.appendChild(topbar);

    // airlock graffiti strip: the threshold the player crosses on entry. Populated from
    // state.ui.graffiti (the comms/narrative overlay stashes airlock/shipyard/clearing/chain_dest
    // lines here as the story advances). Per the worldbuilding: graffiti knows things the HUD won't
    // record. It reads as vandalism; it is the most accurate text in the game.
    const airlock = document.createElement('div');
    airlock.className = 'st-airlock';
    airlock.innerHTML = '<div class="st-airlock__label mono">AIRLOCK</div><div class="st-airlock__graffiti"></div>';
    screen.appendChild(airlock);
    this._airlockEl = airlock.querySelector('.st-airlock__graffiti');

    const purpose = document.createElement('div');
    purpose.className = 'st-purpose';
    purpose.innerHTML =
      '<div class="st-purpose-main"><span class="st-purpose-type mono">Station</span><span class="st-purpose-copy"></span></div>' +
      '<div class="st-purpose-sub"><span class="st-purpose-tab"></span><span class="st-purpose-services"></span></div>';
    screen.appendChild(purpose);
    this._purposeEl = purpose;

    const handoff = document.createElement('div');
    handoff.className = 'st-handoff';
    handoff.hidden = true;
    handoff.innerHTML =
      '<div class="st-handoff-head">' +
        '<span class="st-handoff-label mono">First Dock Handoff</span>' +
        '<span class="st-handoff-copy">Sell the sample, take one safe job, then launch only when Departure Check reads clean.</span>' +
      '</div>' +
      '<div class="st-handoff-steps"></div>';
    screen.appendChild(handoff);
    this._handoffEl = handoff;
    handoff.addEventListener('click', (ev) => {
      const target = ev.target.closest('[data-handoff-tab]');
      if (!target || !this._handoffEl || !this._handoffEl.contains(target)) return;
      const tabId = target.getAttribute('data-handoff-tab');
      if (!TABS.some((t) => t.id === tabId)) return;
      this.setTab(tabId, { focusRail: true });
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    });

    const departure = document.createElement('div');
    departure.className = 'st-departure';
    departure.innerHTML =
      '<div class="st-departure-label mono">Departure Check</div>' +
      '<div class="st-departure-chips"></div>';
    screen.appendChild(departure);
    this._departureEl = departure.querySelector('.st-departure-chips');
    departure.addEventListener('click', (ev) => {
      const chip = ev.target.closest('[data-departure-tab],[data-departure-screen]');
      if (!chip || !this._departureEl || !this._departureEl.contains(chip)) return;
      const screenId = chip.getAttribute('data-departure-screen');
      if (screenId) {
        if (!pushDepartureScreen(ctx, screenId)) return;
        ctx.bus.emit('audio:cue', { id: 'ui_tab' });
        return;
      }
      const tabId = chip.getAttribute('data-departure-tab');
      if (!TABS.some((t) => t.id === tabId)) return;
      this.setTab(tabId, { focusRail: true });
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    });

    // body: rail + content
    const body = document.createElement('div');
    body.className = 'st-body';
    const rail = document.createElement('div');
    rail.className = 'st-rail';
    rail.setAttribute('role', 'tablist');
    rail.setAttribute('aria-label', 'Station sections');
    const content = document.createElement('div');
    content.className = 'st-content';
    body.appendChild(rail);
    body.appendChild(content);
    screen.appendChild(body);

    // build rail buttons (one delegated listener)
    const railFrag = document.createDocumentFragment();
    for (const t of TABS) {
      const b = document.createElement('button');
      b.className = 'st-tab';
      b.type = 'button';
      b.id = 'st-tab-' + t.id;
      b.setAttribute('data-tab', t.id);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'st-panel-' + t.id);
      b.setAttribute('aria-selected', 'false');
      b.setAttribute('tabindex', '-1');
      b.title = t.help;
      b.setAttribute('aria-label', t.label + ': ' + t.help);
      b.innerHTML =
        '<span class="st-tab-icon">' + t.icon + '</span>' +
        '<span class="st-tab-label">' + t.label + '</span>' +
        '<span class="st-tab-service mono" aria-hidden="true"></span>';
      railFrag.appendChild(b);
    }
    rail.appendChild(railFrag);
    rail.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tab]');
      if (!b) return;
      this.setTab(b.getAttribute('data-tab'), { focusRail: true });
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    });
    rail.addEventListener('keydown', (ev) => this._onRailKeydown(ev));

    const undockBtn = topbar.querySelector('.st-undock');
    this._undockBtn = undockBtn;
    undockBtn.addEventListener('click', () => {
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      ctx.bus.emit('dock:undocked', {});
    });

    // instantiate tab panels (factories from this file-set)
    this._panels = {
      market: createMarketPanel(ctx),
      shipyard: createShipyardPanel(ctx),
      outfit: createOutfittingPanel(ctx),
      manufacture: createManufacturePanel(ctx),
      services: createServicesPanel(ctx),
      factions: createFactionsPanel(ctx),
      bar: createBarPanel(ctx),
    };
    // mount each panel's element (hidden until its tab is active)
    for (const id in this._panels) {
      const p = this._panels[id];
      p.el.id = 'st-panel-' + id;
      p.el.classList.add('st-tabpanel');
      p.el.setAttribute('role', 'tabpanel');
      p.el.setAttribute('aria-labelledby', 'st-tab-' + id);
      p.el.setAttribute('tabindex', '0');
      p.el.style.display = 'none';
      content.appendChild(p.el);
    }
    // inline Missions panel
    this._buildMissionsPanel(content, ctx);

    this._el = screen;
    this._rail = rail;
    this._content = content;
    this._topbar = topbar;
    rootEl.appendChild(screen);

    this._subscribe();
    return screen;
  },

  /** Inline mission board (state.missions.boards[stationId]) → Accept emits ui:acceptMission. */
  _buildMissionsPanel(content, ctx) {
    const panel = document.createElement('div');
    panel.className = 'st-tabpanel st-panel st-missions';
    panel.id = 'st-panel-missions';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'st-tab-missions');
    panel.setAttribute('tabindex', '0');
    panel.style.display = 'none';
    panel.innerHTML =
      '<div class="st-sub-h">Mission Board</div>' +
      '<div class="st-mission-guide">Accepting a contract adds it to the Mission Log (' + BINDINGS.missionLog.label + '), auto-tracks it, and sets nav guidance when a destination exists. Rewards fund hulls, modules, repairs, and fuel.</div>' +
      '<div class="st-mission-recommend" hidden></div>' +
      '<div class="st-mission-accepted" hidden></div>' +
      '<div class="st-mission-list"></div>';
    const status = panel.querySelector('.st-mission-accepted');
    const recommend = panel.querySelector('.st-mission-recommend');
    const list = panel.querySelector('.st-mission-list');
    const handleMissionAction = (ev) => {
      const btn = ev.target.closest('[data-mid]');
      if (!btn) return;
      const missionId = btn.getAttribute('data-mid');
      const act = btn.getAttribute('data-act');
      if (act === 'accept') ctx.bus.emit('ui:acceptMission', { missionId });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
    };
    list.addEventListener('click', handleMissionAction);
    recommend.addEventListener('click', handleMissionAction);
    content.appendChild(panel);
    this._missionEls = { panel, list, status, recommend };
  },

  _setMissionAcceptedStatus(missionId) {
    this._missionAcceptedId = missionId || null;
    this._refreshMissionAcceptedStatus();
  },

  _refreshMissionAcceptedStatus() {
    const status = this._missionEls && this._missionEls.status;
    if (!status) return;
    const active = this._ctx && this._ctx.state && this._ctx.state.missions && this._ctx.state.missions.active || [];
    const mission = this._missionAcceptedId
      ? active.find((m) => m && m.id === this._missionAcceptedId && m.status === 'active')
      : null;
    if (!mission) {
      status.hidden = true;
      status.innerHTML = '';
      return;
    }
    const waypoint = this._ctx.state.nav && this._ctx.state.nav.waypoint;
    const routeLine = waypoint && waypoint.reason
      ? waypoint.reason
      : missionAfterAcceptText(mission);
    status.hidden = false;
    status.innerHTML =
      '<div class="st-mission-accepted-label mono">ACCEPTED + TRACKED</div>' +
      '<div class="st-mission-accepted-title">' + escapeHtml(mission.title || prettyType(mission.type)) + '</div>' +
      '<div class="st-mission-accepted-next">' + escapeHtml(routeLine) + '</div>' +
      '<div class="st-mission-accepted-log mono">Mission Log (' + BINDINGS.missionLog.label + ') now carries the route, timer, and progress. Undock when Departure Check is green.</div>';
  },

  _refreshMissions() {
    const ctx = this._ctx;
    if (!this._missionEls) return;
    this._refreshMissionAcceptedStatus();
    const list = this._missionEls.list;
    const recommend = this._missionEls.recommend;
    const board = ctx.state.missions && ctx.state.missions.boards && ctx.state.missions.boards[this._stationId];
    const slots = (board && board.slots) || [];
    list.textContent = '';
    const recommendation = recommendMissionBoardOffer(slots, ctx.state);
    if (recommend) {
      if (!recommendation) {
        recommend.hidden = true;
        recommend.innerHTML = '';
      } else {
        const acceptTitle = recommendation.disabled
          ? recommendation.reason
          : 'Accept, auto-track, and add ' + recommendation.title + ' to Mission Log.';
        recommend.hidden = false;
        recommend.className = 'st-mission-recommend st-mission-recommend--' + recommendation.kind;
        recommend.innerHTML =
          '<div class="st-mission-recommend-copy">' +
            '<div class="st-mission-recommend-label mono">' + escapeHtml(recommendation.label) + '</div>' +
            '<div class="st-mission-recommend-title">' + escapeHtml(recommendation.title) + '</div>' +
            '<div class="st-mission-recommend-reason">' + escapeHtml(recommendation.reason) + '</div>' +
          '</div>' +
          '<button data-act="accept" data-mid="' + escapeHtml(recommendation.missionId) + '"' +
            (recommendation.disabled ? ' disabled' : '') +
            ' title="' + escapeHtml(acceptTitle) + '" aria-label="' + escapeHtml(acceptTitle) + '">' +
            escapeHtml(recommendation.actionLabel) +
          '</button>';
      }
    }
    if (!slots.length) {
      list.innerHTML = '<div class="st-empty">No contracts posted right now. Try the Bar for leads, check another station, or undock and use the Mission Log (' + BINDINGS.missionLog.label + ') for active objectives.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    const tracked = ctx.state.ui && ctx.state.ui.trackedMissionId;
    for (const m of slots) {
      const fac = m.factionId ? FACTION_BY_ID.get(m.factionId) : null;
      const risk = missionRiskTier(m);
      const riskTitle = missionRiskCopy(risk);
      const mid = m.id != null ? m.id : m.missionId;
      const preflight = missionPreflight(m, ctx.state);
      const readiness = missionBoardReadiness(preflight);
      const consequences = missionConsequenceSummary(m);
      const standing = missionStandingRequirement(m, ctx.state);
      const unmet = m.requirementUnmet || m.lockedReason || preflight.blocker || null;
      const expires = m.expiresInS != null ? m.expiresInS : m.time_limit_s;
      const acceptTitle = unmet
        ? 'Cannot accept: ' + unmet
        : 'Accept, auto-track, and add ' + (m.title || prettyType(m.type)) + ' to Mission Log.';
      const preflightHtml = preflight.chips.map((chip) =>
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--' + chip.kind + '">' + escapeHtml(chip.text) + '</span>'
      ).join('');
      const consequenceHtml = consequences.chips.map((chip) =>
        '<span class="st-mission-consequence st-mission-consequence--' + chip.kind + '"><b>' + escapeHtml(chip.label) + '</b> ' + escapeHtml(chip.text) + '</span>'
      ).join('');
      const standingHtml = standing
        ? '<div class="st-mission-standing st-mission-standing--' + (standing.ok ? 'ok' : 'locked') + '">' +
            '<span class="mono">' + escapeHtml(standing.ok ? 'Standing ready' : 'Standing locked') + '</span>' +
            '<span>' + escapeHtml(standing.gateName + ': ' + standing.faction + ' ' + signedRep(standing.currentRep) +
              ' / needs ' + signedRep(standing.minRep)) + '</span>' +
          '</div>'
        : '';
      const card = document.createElement('div');
      const recommended = recommendation && recommendation.missionId === mid;
      card.className = 'st-mission-card' +
        (tracked && tracked === mid ? ' tracked' : '') +
        (recommended ? ' recommended recommended--' + recommendation.kind : '');
      card.innerHTML =
        '<div class="st-mission-top">' +
          '<span class="st-mission-title">' + escapeHtml(m.title || prettyType(m.type)) + '</span>' +
          '<span class="st-mission-badges">' +
            (recommended ? '<span class="st-mission-recommended st-mission-recommended--' + recommendation.kind + '">PICK</span>' : '') +
            '<span class="st-mission-readiness st-mission-readiness--' + readiness.kind + '" title="' + escapeHtml(readiness.title) + '" aria-label="' + escapeHtml(readiness.title) + '">' + escapeHtml(readiness.label) + '</span>' +
            '<span class="st-mission-risk r' + risk + '" title="' + escapeHtml(riskTitle) + '" aria-label="' + escapeHtml(riskTitle) + '">RISK ' + risk + '</span>' +
          '</span>' +
        '</div>' +
        '<div class="st-mission-meta mono">' +
          (fac ? '<span class="st-mission-fac" style="color:' + (fac.color || '#aaa') + '">' + escapeHtml(fac.short || fac.name) + '</span> · ' : '') +
          escapeHtml(prettyType(m.type)) +
          (m.destStationId || m.destSectorId || m.dest ? ' → ' + escapeHtml(missionDestName(m)) : '') +
        '</div>' +
        '<div class="st-mission-brief">' + escapeHtml(missionBriefText(m)) + '</div>' +
        '<div class="st-mission-purpose">' + escapeHtml(missionValueText(m)) + '</div>' +
        '<div class="st-mission-next">' + escapeHtml(missionNextStepText(m)) + '</div>' +
        '<div class="st-mission-preflight">' + preflightHtml + '</div>' +
        standingHtml +
        (preflight.warning ? '<div class="st-mission-preflight-warn">' + escapeHtml(preflight.warning) + '</div>' : '') +
        '<div class="st-mission-rewards mono">' +
          '<span class="st-mission-cr">+' + (consequences.reward || 0).toLocaleString('en-US') + ' cr</span>' +
          (consequences.repReward ? '<span class="st-mission-rep">+' + consequences.repReward + ' rep</span>' : '') +
          (expires != null ? '<span class="st-mission-exp">' + fmtTime(expires) + '</span>' : '') +
        '</div>' +
        '<div class="st-mission-consequences mono">' + consequenceHtml + '</div>' +
        '<div class="st-mission-btns">' +
          '<button data-act="accept" data-mid="' + escapeHtml(mid) + '"' + (unmet ? ' disabled' : '') +
            ' title="' + escapeHtml(acceptTitle) + '" aria-label="' + escapeHtml(acceptTitle) + '">Accept + Track</button>' +
          (unmet ? '<span class="st-mission-unmet">' + escapeHtml(unmet) + '</span>' : '') +
        '</div>';
      frag.appendChild(card);
    }
    list.appendChild(frag);
  },

  /** Activate a tab: toggle rail highlight + panel visibility, persist ui.activeStationTab. */
  setTab(tabId, options = {}) {
    if (!TABS.some((t) => t.id === tabId)) tabId = 'market';
    const prevTab = this._activePanelId();
    if (prevTab !== tabId) {
      const prev = this._panels && this._panels[prevTab];
      if (prev && typeof prev.onHide === 'function') {
        try { prev.onHide(); } catch (e) { console.error(e); }
      }
    }
    this._ctx.state.ui.activeStationTab = tabId;
    // rail highlight
    let activeButton = null;
    this._rail.querySelectorAll('[data-tab]').forEach((b) => {
      const isActive = b.getAttribute('data-tab') === tabId;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      b.setAttribute('tabindex', isActive ? '0' : '-1');
      if (isActive) activeButton = b;
    });
    // panel visibility
    for (const id in this._panels) {
      const isActive = id === tabId;
      this._panels[id].el.style.display = isActive ? '' : 'none';
      this._panels[id].el.hidden = !isActive;
    }
    if (this._missionEls) {
      const isActive = tabId === 'missions';
      this._missionEls.panel.style.display = isActive ? '' : 'none';
      this._missionEls.panel.hidden = !isActive;
    }
    this._refreshRailServiceStatus();
    this._refreshPurpose();
    this._refreshHandoff();
    if (options.focusRail && activeButton && document.activeElement !== activeButton) {
      activeButton.focus({ preventScroll: true });
    }
    // refresh the now-visible panel
    this._refreshActive(true);
  },

  _onRailKeydown(ev) {
    const currentButton = ev.target && ev.target.closest && ev.target.closest('[role="tab"][data-tab]');
    if (!currentButton || !this._rail || !this._rail.contains(currentButton)) return;
    const buttons = Array.from(this._rail.querySelectorAll('[role="tab"][data-tab]'));
    if (!buttons.length) return;

    const key = ev.key;
    const currentIndex = Math.max(0, buttons.indexOf(currentButton));
    let nextIndex = currentIndex;
    if (key === 'ArrowDown' || key === 'ArrowRight' || key === 'PageDown') nextIndex = (currentIndex + 1) % buttons.length;
    else if (key === 'ArrowUp' || key === 'ArrowLeft' || key === 'PageUp') nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    else if (key === 'Home') nextIndex = 0;
    else if (key === 'End') nextIndex = buttons.length - 1;
    else if (key === 'Enter' || key === ' ') nextIndex = currentIndex;
    else return;

    ev.preventDefault();
    ev.stopPropagation();
    const nextButton = buttons[nextIndex];
    const tabId = nextButton && nextButton.getAttribute('data-tab');
    if (!tabId) return;
    this.setTab(tabId, { focusRail: true });
    this._ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  },

  _activePanelId() { return (this._ctx.state.ui && this._ctx.state.ui.activeStationTab) || 'market'; },

  _refreshActive(isShow) {
    const id = this._activePanelId();
    if (id === 'missions') { this._refreshMissions(); return; }
    const p = this._panels[id];
    if (!p) return;
    if (isShow && typeof p.onShow === 'function') p.onShow({ stationId: this._stationId, state: this._ctx.state });
    else if (typeof p.refresh === 'function') p.refresh({ stationId: this._stationId, state: this._ctx.state });
  },

  /** Resolve the station def the player is docked at (set by dock:docked → uiRoot before onShow). */
  _resolveStation() {
    const state = this._ctx.state;
    // 1) explicit dockedStationId if the docking flow stashed one
    let sid = (state.ui && state.ui.dockedStationId) || this._stationId;
    // 2) else first station of the active sector
    const sect = state.world && state.world.activeSector;
    if (!sid && sect && sect.stations && sect.stations.length) {
      const first = sect.stations[0];
      sid = first.stationId || first.id;
    }
    // 3) else first station of the current sector's static def
    if (!sid) {
      const curId = state.world && state.world.currentSectorId;
      const sectorDef = (state.world && state.world.sectors && state.world.sectors[curId]) ||
        SECTORS.find((s) => s.id === curId) || SECTORS[0];
      if (sectorDef && sectorDef.stations && sectorDef.stations.length) sid = sectorDef.stations[0].id;
    }
    this._stationId = sid || null;
    return this._stationId;
  },

  _stationDef() {
    const state = this._ctx.state;
    const sid = this._stationId;
    if (!sid) return null;
    const sect = state.world && state.world.activeSector;
    const activeRecord = sect && (sect.stations || []).find((x) => stationRecordId(x) === sid);
    let catalogRecord = null;
    const sectors = state.world && state.world.sectors;
    for (const s of (sectors ? Object.values(sectors) : [])) {
      const f = (s.stations || []).find((x) => stationRecordId(x) === sid);
      if (f) { catalogRecord = f; break; }
    }
    if (!catalogRecord) {
      for (const s of SECTORS) {
        const f = (s.stations || []).find((x) => stationRecordId(x) === sid);
        if (f) { catalogRecord = f; break; }
      }
    }
    return stationDefFrom(catalogRecord || activeRecord, liveStationEntity(state, sid), sid);
  },

  _refreshTopbar() {
    const stn = this._stationDef();
    const nameEl = this._topbar.querySelector('.st-station-name');
    const facEl = this._topbar.querySelector('.st-station-fac');
    if (stn) {
      nameEl.textContent = stn.name || stn.id;
      const fac = stn.factionId ? FACTION_BY_ID.get(stn.factionId) : null;
      facEl.textContent = (fac ? (fac.short || fac.name) : '') + '  ·  ' + (stn.type || '').replace('_', ' ');
      if (fac) facEl.style.color = fac.color || '';
    } else {
      nameEl.textContent = 'Station';
      facEl.textContent = '';
    }
  },

  _refreshRailServiceStatus() {
    if (!this._rail) return;
    const stn = this._stationDef();
    this._rail.querySelectorAll('[data-tab]').forEach((b) => {
      const tabId = b.getAttribute('data-tab');
      const status = stationTabServiceStatus(tabId, stn);
      b.setAttribute('data-service-status', status.state);
      b.classList.toggle('st-tab--service-unavailable', status.state === 'unavailable');
      b.title = status.title;
      b.setAttribute('aria-label', tabLabel(tabId) + ': ' + status.label + '. ' + tabPurpose(tabId));
      const badge = b.querySelector('.st-tab-service');
      if (badge) {
        const showBadge = status.state === 'available' || status.state === 'unavailable';
        badge.hidden = !showBadge;
        badge.textContent = showBadge ? status.label : '';
      }
    });
  },

  _refreshPurpose() {
    if (!this._purposeEl) return;
    const stn = this._stationDef();
    const typeEl = this._purposeEl.querySelector('.st-purpose-type');
    const copyEl = this._purposeEl.querySelector('.st-purpose-copy');
    const tabEl = this._purposeEl.querySelector('.st-purpose-tab');
    const servicesEl = this._purposeEl.querySelector('.st-purpose-services');
    if (typeEl) typeEl.textContent = stationTypeLabel(stn && stn.type);
    if (copyEl) copyEl.textContent = stationPurpose(stn);
    if (tabEl) {
      const tabId = this._activePanelId();
      const status = stationTabServiceStatus(tabId, stn);
      const note = status.state === 'unavailable' ? ' Service note: ' + status.label + '.' : '';
      tabEl.textContent = 'Current tab: ' + tabPurpose(tabId) + note;
    }
    if (servicesEl) servicesEl.textContent = stationServiceSummary(stn);
  },

  _refreshDeparture() {
    if (!this._departureEl) return;
    const chips = departureReadinessChips(this._ctx && this._ctx.state);
    this._departureEl.innerHTML = chips.map((chip) => departureChipHtml(chip)).join('');
    if (this._undockBtn) {
      const summary = departureReadinessSummary(chips);
      this._undockBtn.textContent = summary.label;
      this._undockBtn.title = summary.title;
      this._undockBtn.setAttribute('aria-label', summary.title);
      this._undockBtn.setAttribute('data-readiness', summary.state);
    }
  },

  _refreshHandoff() {
    if (!this._handoffEl) return;
    const state = this._ctx && this._ctx.state;
    const visible = firstDockHandoffVisible(state, this._stationId);
    this._handoffEl.hidden = !visible;
    if (!visible) return;
    const stepsEl = this._handoffEl.querySelector('.st-handoff-steps');
    if (stepsEl) stepsEl.innerHTML = firstDockHandoffSteps(state).map((step) => handoffStepHtml(step)).join('');
  },

  /** Called by screenManager when this screen becomes the top of the stack. */
  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    this._resolveStation();
    this._refreshTopbar();
    this._refreshGraffiti();
    this._refreshRailServiceStatus();
    this._refreshPurpose();
    this._refreshDeparture();
    this._refreshHandoff();
    // restore the last active tab (or default 'market')
    const tab = this._activePanelId();
    this.setTab(tab); // also refreshes the active panel via onShow
  },

  onHide() {
    const p = this._panels && this._panels[this._activePanelId()];
    if (p && typeof p.onHide === 'function') {
      try { p.onHide(); } catch (e) { console.error(e); }
    }
  },

  /** Generic refresh (data-event driven). Refreshes only the active panel for cheapness. */
  refresh(ctx, options = {}) {
    if (ctx) this._ctx = ctx;
    if (!this._el) return;
    this._refreshTopbar();
    this._refreshGraffiti();
    this._refreshRailServiceStatus();
    this._refreshPurpose();
    this._refreshDeparture();
    this._refreshHandoff();
    if (!(options.periodic && this._activePanelId() === 'bar')) this._refreshActive(false);
  },

  /** Render the airlock graffiti from state.ui.graffiti (stashed by the narrative overlay).
   *  Lines accumulate across beats — the airlock remembers everything painted on it. */
  _refreshGraffiti() {
    if (!this._airlockEl) return;
    const ctx = this._ctx;
    const stash = (ctx.state.ui && ctx.state.ui.graffiti) || [];
    // only surface non-bulkhead graffiti at the airlock (bulkhead is the player's own ship)
    const lines = stash.filter((g) => g.where !== 'bulkhead');
    if (!lines.length) { this._airlockEl.innerHTML = '<span class="st-airlock__empty">clean bulkhead</span>'; return; }
    const frag = document.createDocumentFragment();
    for (const g of lines) {
      const ln = document.createElement('div');
      ln.className = 'st-airlock__line';
      ln.textContent = g.line;
      // vary the skew/offset slightly per line so it reads as hand-sprayed, not typeset
      ln.style.setProperty('--graffiti-skew', ((g.line.length % 5) - 2) * 0.4 + 'deg');
      ln.title = g.author ? ('— ' + g.author) : '';
      frag.appendChild(ln);
    }
    this._airlockEl.innerHTML = '';
    this._airlockEl.appendChild(frag);
  },

  /** Subscribe to the data-change events that should rebuild the relevant panel (§5.5). Only the
   *  active panel is refreshed to stay cheap; switching tabs refreshes on demand. */
  _subscribe() {
    if (this._subbed) return;
    this._subbed = true;
    const bus = this._ctx.bus;
    const onActive = (wantTab) => () => {
      if (!this._visible()) return;
      const id = this._activePanelId();
      if (!wantTab || wantTab.includes(id)) this._refreshActive(false);
    };
    const refreshDeparture = () => { if (this._visible()) this._refreshDeparture(); };
    const refreshHandoff = () => { if (this._visible()) this._refreshHandoff(); };
    // market-affecting
    bus.on('economy:tradeCompleted', onActive(['market', 'services']));
    bus.on('economy:tradeCompleted', refreshHandoff);
    bus.on('economy:tick', onActive(['market']));
    bus.on('cargo:changed', onActive(['market', 'outfit', 'services']));
    bus.on('cargo:changed', refreshDeparture);
    bus.on('cargo:changed', refreshHandoff);
    bus.on('credits:changed', onActive(['market', 'shipyard', 'outfit', 'services']));
    bus.on('credits:changed', refreshDeparture);
    // ship/outfitting-affecting
    bus.on('ship:statsChanged', onActive(['outfit', 'shipyard', 'services']));
    bus.on('ship:statsChanged', refreshDeparture);
    bus.on('ship:statsChanged', refreshHandoff);
    bus.on('ship:purchased', onActive(['shipyard', 'outfit']));
    bus.on('ship:sold', onActive(['shipyard', 'outfit']));
    bus.on('module:equipped', onActive(['outfit']));
    bus.on('module:unequipped', onActive(['outfit']));
    bus.on('module:purchased', onActive(['outfit']));
    bus.on('tech:researched', onActive(['shipyard', 'outfit']));
    // services-affecting
    bus.on('fuel:changed', onActive(['services']));
    bus.on('fuel:changed', refreshDeparture);
    bus.on('fuel:changed', refreshHandoff);
    bus.on('nav:waypoint', refreshDeparture);
    bus.on('nav:waypoint', refreshHandoff);
    // factions
    bus.on('faction:repChanged', onActive(['factions']));
    // missions
    bus.on('mission:updated', () => {
      if (!this._visible()) return;
      if (this._activePanelId() === 'missions') this._refreshMissions();
      this._refreshDeparture();
      this._refreshHandoff();
    });
    bus.on('mission:accepted', (payload) => {
      if (!this._visible()) return;
      this._setMissionAcceptedStatus(payload && payload.missionId);
      if (this._activePanelId() === 'missions') this._refreshMissions();
      this._refreshDeparture();
      this._refreshHandoff();
    });
    bus.on('mission:completed', () => { this._refreshMissionAcceptedStatus(); refreshDeparture(); refreshHandoff(); });
    bus.on('mission:failed', () => { this._refreshMissionAcceptedStatus(); refreshDeparture(); refreshHandoff(); });
    bus.on('mission:expired', () => { this._refreshMissionAcceptedStatus(); refreshDeparture(); refreshHandoff(); });
    bus.on('economy:eventStarted', onActive(['market']));
    bus.on('economy:eventEnded', onActive(['market']));
  },

  _visible() {
    const ui = this._ctx && this._ctx.state && this._ctx.state.ui;
    if (!ui || !ui.screenStack) return !!this._el; // be permissive if stack not wired
    return ui.screenStack[ui.screenStack.length - 1] === 'station';
  },
};

// ---- small format helpers --------------------------------------------------------------------
function prettyType(t) {
  if (!t) return 'Contract';
  return String(t).split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function signedRep(value) {
  const n = Math.round(Number(value) || 0);
  return (n > 0 ? '+' : '') + n;
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  if (m >= 60) return (m / 60).toFixed(1) + 'h';
  if (m >= 1) return m + 'm';
  return s + 's';
}

function prettyId(id) {
  return String(id || '')
    .replace(/^(station|sector|cmdty|faction)_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function plural(count, singular, pluralForm) {
  return count === 1 ? singular : (pluralForm || singular + 's');
}

function missionDestName(m) {
  const direct = m.destName || m.destStationName;
  if (direct) return direct;
  const rawDest = m.dest || '';
  const stationId = m.destStationId || (String(rawDest).startsWith('station_') ? rawDest : null);
  const station = stationId ? STATION_BY_ID.get(stationId) : null;
  if (station) return station.name;
  const sectorId = m.destSectorId || (String(rawDest).startsWith('sector_') ? rawDest : null);
  const sector = sectorId ? SECTOR_BY_ID.get(sectorId) : null;
  if (sector) return sector.name;
  if (rawDest) return prettyId(rawDest);
  return 'the target area';
}

function missionClientName(m) {
  const fac = m && m.factionId ? FACTION_BY_ID.get(m.factionId) : null;
  return (fac && (fac.short || fac.name)) || 'The client';
}

function missionCommodityName(m) {
  const id = m && m.params && m.params.cmdtyId;
  const commodity = id ? COMMODITY_BY_ID.get(id) : null;
  return (commodity && commodity.name) || 'cargo';
}

function missionCargoAmount(m) {
  const p = m && m.params || {};
  const cargo = missionCommodityName(m);
  return p.qty ? p.qty + 'u ' + cargo : cargo;
}

function missionBriefText(m) {
  const p = m && m.params || {};
  const client = missionClientName(m);
  const dest = missionDestName(m || {});
  const cargo = missionCommodityName(m);
  const amount = missionCargoAmount(m);
  switch (m && m.type) {
    case 'cargo_delivery':
      return client + ' wants ' + amount + ' delivered to ' + dest + ' with the manifest clean and the route quiet.';
    case 'bulk_trade':
      return dest + ' is short on ' + cargo + '; sell the quota there before the board reprices the lane.';
    case 'mining_quota':
      return client + ' has a buyer waiting for ' + amount + '. Mine the quota and return with cargo space to spare.';
    case 'salvage_retrieval':
      return client + ' marked recoverable ' + amount + ' in hostile drift. Bring it back before another crew logs the claim.';
    case 'smuggling_run':
      return client + ' pays for ' + amount + ' that should not become a customs story. Reach ' + dest + ' without inviting scans.';
    case 'bounty_hunt':
      return client + ' posted a tag near ' + dest + '; expect a pilot who knows why the bounty is high.';
    case 'escort':
      return client + ' needs a convoy visible, intact, and boring all the way to ' + dest + '.';
    case 'patrol_clear': {
      const count = p.clearCount || 1;
      return client + ' wants ' + count + ' hostile ' + plural(count, 'signature') + ' erased from the lane before traders notice.';
    }
    case 'recon_scan': {
      const count = p.scanTargets || 1;
      return client + ' needs ' + count + ' quiet scan ' + plural(count, 'sweep') + ' near ' + dest + '; measure the site and leave clean.';
    }
    case 'passenger_transport':
      return client + ' has one passenger who paid for a dull manifest and a quiet berth to ' + dest + '.';
    default:
      return client + ' posted a contract with enough detail to plan the work before undocking.';
  }
}

function missionValueText(m) {
  switch (m && m.type) {
    case 'cargo_delivery':
      return 'Pays for hauling cargo; useful when you have free cargo space and need credits for refits.';
    case 'bulk_trade':
      return 'Turns market buying/selling into a contract payout on top of normal trade profit.';
    case 'mining_quota':
      return 'Rewards asteroid work; better mining beams and cargo modules make this faster.';
    case 'salvage_retrieval':
      return 'Pays for recovery runs; bring cargo room and expect debris or hostile space.';
    case 'bounty_hunt':
    case 'patrol_clear':
      return 'Combat work for credits and standing; hull, shield, and weapon upgrades matter here.';
    case 'escort':
      return 'Convoy work that rewards survivability, weapons, and staying near the objective.';
    case 'smuggling_run':
      return 'High-risk cargo pay; restricted routes can be profitable but invite scans and trouble.';
    case 'passenger_transport':
      return 'Straight route work; faster ships and safer paths reduce deadline pressure.';
    case 'recon_scan':
      return 'Exploration work; scanners, utility slots, and map awareness shorten the job.';
    default:
      return 'Contract reward feeds the upgrade loop: credits, standing, fuel, repairs, and better gear.';
  }
}

function missionNextStepText(m) {
  const dest = missionDestName(m || {});
  switch (m && m.type) {
    case 'mining_quota':
      return 'Next: accept, undock to an asteroid field, mine the quota, then follow the tracked objective.';
    case 'bulk_trade':
      return 'Next: accept, buy or carry the requested goods, then sell them where the tracker points.';
    case 'bounty_hunt':
    case 'patrol_clear':
      return 'Next: accept, undock, follow the tracked nav, and be ready to fight.';
    case 'recon_scan':
      return 'Next: accept, undock, follow tracked nav, and scan the marked sites.';
    default:
      return 'Next: accept to auto-track it, undock, then follow nav guidance toward ' + dest + '.';
  }
}

function missionAfterAcceptText(m) {
  const dest = missionDestName(m || {});
  switch (m && m.type) {
    case 'mining_quota':
      return 'Undock to an asteroid field, mine the quota, then follow the tracker back for payout.';
    case 'bulk_trade':
      return 'Buy or carry the requested goods, then sell them where the tracked market points.';
    case 'bounty_hunt':
    case 'patrol_clear':
      return 'Undock, follow tracked nav, and be ready to fight before the timer runs down.';
    case 'recon_scan':
      return 'Undock, follow tracked nav, and scan each marked site before returning.';
    case 'cargo_delivery':
    case 'passenger_transport':
    case 'escort':
    case 'smuggling_run':
    case 'salvage_retrieval':
      return 'Undock, follow nav guidance toward ' + dest + ', then dock to resolve the handoff.';
    default:
      return 'Undock, follow the tracked objective, and check Mission Log (' + BINDINGS.missionLog.label + ') for progress.';
  }
}

// ---- scoped CSS (injected once; uses theme vars from styles/ui.css) --------------------------
const STATION_CSS = `
.st-hub { width: min(1100px, 94vw); height: min(760px, 92vh); display: flex; flex-direction: column;
  pointer-events: auto; overflow: hidden; animation: sf-fadein .3s var(--ease) both; }
.st-topbar { display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid var(--panel-edge);
  background: linear-gradient(180deg, rgba(14,24,42,.7), rgba(8,14,26,.5)); }
.st-station-name { font-size: var(--t-xl); letter-spacing: .04em; color: #fff; font-weight: 600;
  text-shadow: 0 0 16px rgba(57,208,255,.25); }
.st-station-fac { margin-left: 14px; color: var(--accent); font-size: var(--t-xs);
  letter-spacing: .14em; text-transform: uppercase; padding: 2px 10px; border-radius: var(--r-pill);
  border: 1px solid rgba(57,208,255,.3); background: rgba(57,208,255,.08); }
.st-undock { border-color: var(--accent); color: var(--accent); letter-spacing: .08em; font-weight: 600; }
.st-undock[data-readiness="ready"] { border-color: var(--good); color: var(--good); }
.st-undock[data-readiness="check"] { border-color: var(--warn); color: var(--warn); }
.st-undock[data-readiness="risk"] { border-color: var(--danger); color: var(--danger); }
/* airlock graffiti strip — the threshold on entry. Reads as vandalism; is the most accurate text. */
.st-airlock { display:flex; align-items:stretch; gap:0; border-bottom:1px solid var(--panel-edge);
  background:linear-gradient(180deg, rgba(6,10,18,.6), rgba(4,7,14,.4)); min-height:0; }
.st-airlock__label { writing-mode:vertical-rl; transform:rotate(180deg); padding:6px 4px; font-size:8px;
  letter-spacing:.2em; color:var(--ink-mute); border-right:1px solid var(--panel-edge); align-self:stretch; }
.st-airlock__graffiti { flex:1; padding:7px 12px; display:flex; flex-direction:column; gap:3px;
  overflow:hidden; }
.st-airlock__line { --graffiti-skew:0deg; font-family:var(--mono); font-size:11px; letter-spacing:.14em;
  color:#9aa6b8; text-transform:uppercase; opacity:.82; transform:rotate(var(--graffiti-skew));
  text-shadow:0 1px 2px #000; line-height:1.3; }
.st-airlock__empty { font-size:10px; color:var(--ink-mute); font-style:italic; opacity:.5; }
.st-purpose { display: grid; gap: 4px; padding: 9px 20px 10px; border-bottom: 1px solid var(--panel-edge);
  background: rgba(8,14,26,.54); }
.st-purpose-main { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.st-purpose-type { color: var(--accent); font-size: .68rem; letter-spacing: .14em; text-transform: uppercase; flex: none; }
.st-purpose-copy { color: var(--ink); font-size: .82rem; line-height: 1.35; }
.st-purpose-sub { display: flex; flex-wrap: wrap; gap: 10px 18px; color: var(--ink-mute); font-size: .72rem; line-height: 1.35; }
.st-purpose-tab { color: var(--ink-dim); }
.st-handoff { display: grid; gap: 8px; padding: 9px 20px 10px; border-bottom: 1px solid rgba(57,208,255,.18);
  background: linear-gradient(90deg, rgba(57,208,255,.07), rgba(10,18,32,.38)); }
.st-handoff[hidden] { display: none; }
.st-handoff-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 12px; min-width: 0; }
.st-handoff-label { color: var(--accent); font-size: .62rem; letter-spacing: .14em; text-transform: uppercase; }
.st-handoff-copy { color: var(--ink-dim); font-size: .74rem; line-height: 1.35; }
.st-handoff-steps { display: flex; flex-wrap: wrap; gap: 7px; }
.st-handoff-step { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "label title" "copy copy";
  gap: 2px 7px; min-width: min(100%, 188px); max-width: 286px; border: 1px solid rgba(57,208,255,.22);
  border-radius: 6px; padding: 7px 9px; color: var(--ink-dim); background: rgba(6,12,22,.45); text-align: left; }
button.st-handoff-step { appearance: none; cursor: pointer; font: inherit; }
button.st-handoff-step:hover { background: rgba(57,208,255,.09); color: var(--ink); }
button.st-handoff-step:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.st-handoff-step-label { grid-area: label; align-self: center; color: var(--ink-mute); font-size: .6rem; letter-spacing: .1em; text-transform: uppercase; }
.st-handoff-step-title { grid-area: title; min-width: 0; color: var(--ink); font-size: .78rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-handoff-step-copy { grid-area: copy; color: var(--ink-dim); font-size: .7rem; line-height: 1.3; }
.st-handoff-step--ok { border-color: rgba(98,224,138,.34); }
.st-handoff-step--ok .st-handoff-step-label { color: var(--good); }
.st-handoff-step--warn { border-color: rgba(255,198,77,.34); }
.st-handoff-step--warn .st-handoff-step-label { color: var(--warn); }
.st-handoff-step--bad { border-color: rgba(255,84,112,.38); }
.st-handoff-step--bad .st-handoff-step-label { color: var(--danger); }
.st-handoff-step.is-done { background: rgba(98,224,138,.06); }
.st-undock:hover { background: var(--grad-accent); color: #04121a; box-shadow: 0 0 16px rgba(57,208,255,.4); }
.st-undock[data-readiness="ready"]:hover { background: var(--good); color: #021008; box-shadow: 0 0 16px rgba(98,224,138,.34); }
.st-undock[data-readiness="check"]:hover { background: var(--warn); color: #1a1000; box-shadow: 0 0 16px rgba(255,198,77,.28); }
.st-undock[data-readiness="risk"]:hover { background: var(--danger); color: #21040a; box-shadow: 0 0 16px rgba(255,84,112,.3); }
.st-departure { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 7px 20px;
  border-bottom: 1px solid var(--panel-edge); background: rgba(4,9,18,.58); }
.st-departure-label { flex: none; color: var(--ink-mute); font-size: .62rem; text-transform: uppercase; }
.st-departure-chips { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.st-departure-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 24px; max-width: 230px;
  padding: 2px 8px; border: 1px solid var(--panel-edge); border-radius: 4px; background: rgba(10,18,32,.46);
  color: var(--ink-dim); font: inherit; font-size: .72rem; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button.st-departure-chip { margin: 0; appearance: none; cursor: pointer; text-align: left; }
button.st-departure-chip:hover { background: rgba(57,208,255,.08); color: var(--ink); }
button.st-departure-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.st-departure-chip b { color: var(--ink-mute); font-weight: 600; text-transform: uppercase; }
.st-departure-chip span { overflow: hidden; text-overflow: ellipsis; }
.st-departure-chip--ok { color: var(--good); border-color: rgba(98,224,138,.34); }
.st-departure-chip--warn { color: var(--warn); border-color: rgba(255,198,77,.34); }
.st-departure-chip--bad { color: var(--danger); border-color: rgba(255,84,112,.34); }
.st-departure-chip--info { color: var(--accent); border-color: rgba(57,208,255,.28); }
.st-body { display: flex; flex: 1; min-height: 0; }
.st-rail { width: 176px; flex: none; display: flex; flex-direction: column; gap: 3px; padding: var(--sp-3) var(--sp-2);
  border-right: 1px solid var(--panel-edge); background: rgba(6,10,20,.55); }
.st-tab { display: flex; align-items: center; gap: 10px; text-align: left; background: transparent;
  border: 1px solid transparent; border-radius: var(--r-md); padding: 9px 12px; color: var(--ink-dim);
  transition: all var(--dur) var(--ease); }
.st-tab:hover { color: var(--ink); background: rgba(57,208,255,.06); }
.st-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; color: var(--ink);
  background: rgba(57,208,255,.08); }
.st-tab.active { color: #fff; background: linear-gradient(90deg, rgba(57,208,255,.18), rgba(57,208,255,.04));
  border-color: rgba(57,208,255,.35); box-shadow: inset 3px 0 0 var(--accent), 0 0 12px rgba(57,208,255,.12); }
.st-tab-icon { width: 18px; text-align: center; opacity: .85; }
.st-tab-label { letter-spacing: .04em; font-size: .92rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-tab-service { margin-left: auto; max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: .5rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-mute); opacity: .78; }
.st-tab-service[hidden] { display: none; }
.st-tab[data-service-status="available"] .st-tab-service { color: var(--accent-2); }
.st-tab[data-service-status="unavailable"] { opacity: .72; }
.st-tab[data-service-status="unavailable"] .st-tab-service { color: var(--warn); }
.st-tab[data-service-status="unavailable"].active { opacity: 1; border-color: rgba(255,198,77,.35);
  box-shadow: inset 3px 0 0 var(--warn), 0 0 12px rgba(255,198,77,.10); }
.st-content { flex: 1; min-width: 0; overflow: hidden; position: relative; }
.st-tabpanel { position: absolute; inset: 0; overflow-y: auto; padding: var(--sp-4) var(--sp-5);
  animation: sf-fadein .22s var(--ease) both; }
.st-sub-h { font-size: .72rem; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-mute);
  margin: 2px 0 10px; }
.st-empty { color: var(--ink-mute); font-size: .85rem; padding: 18px 4px; font-style: italic; }
.st-tag { font-size: .6rem; letter-spacing: .08em; text-transform: uppercase; padding: 1px 5px; border-radius: 4px;
  background: var(--panel-2); color: var(--ink-dim); vertical-align: middle; }
.st-tag-restricted { color: var(--warn); border: 1px solid var(--warn); }
.st-tag-contraband { color: var(--danger); border: 1px solid var(--danger); }
.st-tag-owned, .st-tag-active { color: var(--accent-2); border: 1px solid var(--accent-2); }

/* generic rows */
.st-row { display: grid; grid-template-columns: 2.4fr .8fr 1fr 1fr 2.2fr 1.6fr; align-items: center;
  gap: 8px; padding: 7px 8px; border-bottom: 1px solid rgba(29,51,80,.5); font-size: .85rem; }
.st-row-head { color: var(--ink-mute); font-size: .68rem; letter-spacing: .12em; text-transform: uppercase;
  border-bottom: 1px solid var(--panel-edge); position: sticky; top: -14px; background: var(--panel); z-index: 1; }
.st-row .c-num { text-align: right; }
.st-row.locked { opacity: .55; }
.st-list { display: block; }
.st-slotline { color: var(--ink-mute); font-size: .68rem; letter-spacing: .04em; }

/* market */
.st-market-head { display: flex; gap: 24px; margin-bottom: 10px; }
.st-stat { display: flex; flex-direction: column; }
.st-stat-l { font-size: .62rem; letter-spacing: .14em; color: var(--ink-mute); text-transform: uppercase; }
.st-credits { color: var(--energy); font-size: 1.05rem; }
.st-cargo { color: var(--cargo); font-size: 1.05rem; }
.st-market-purpose { margin: -2px 0 10px; border: 1px solid var(--panel-edge); border-radius: 6px;
  padding: 9px 11px; background: rgba(10,18,32,.5); color: var(--ink-dim); font-size: .8rem; line-height: 1.4; }
.st-market-purpose b { color: var(--ink); font-weight: 600; }
.st-market-mission { margin: -2px 0 10px; border: 1px solid rgba(57,208,255,.46); border-radius: 6px;
  padding: 9px 11px; background: rgba(15,37,54,.38); box-shadow: 0 0 12px rgba(57,208,255,.12); }
.st-market-mission[hidden] { display: none; }
.st-market-mission-label { color: var(--accent); font-size: .6rem; letter-spacing: .14em; margin-bottom: 4px; }
.st-market-mission-title { color: var(--ink); font-weight: 700; font-size: .88rem; line-height: 1.3; }
.st-market-mission-body { color: var(--ink-dim); font-size: .78rem; line-height: 1.35; margin-top: 4px; }
.st-market-mission-meta { color: var(--energy); font-size: .66rem; margin-top: 5px; }
.st-cmdty-purpose { display: block; margin-top: 3px; white-space: normal; line-height: 1.25; }
.st-market-mission-line { display: block; margin-top: 3px; color: var(--accent); white-space: normal; line-height: 1.25; }
.st-market-mission-line[hidden] { display: none; }
.st-row.tracked-mission { border-color: rgba(57,208,255,.45); background: rgba(57,208,255,.045); }
.st-market-route { margin: -2px 0 10px; border: 1px solid rgba(98,224,138,.42); border-radius: 6px;
  padding: 9px 11px; background: rgba(18,48,34,.34); box-shadow: 0 0 12px rgba(98,224,138,.10); }
.st-market-route[hidden] { display: none; }
.st-market-route-label { color: var(--good); font-size: .6rem; letter-spacing: .14em; margin-bottom: 4px; }
.st-market-route-title { color: var(--ink); font-weight: 700; font-size: .88rem; line-height: 1.3; }
.st-market-route-body { color: var(--ink-dim); font-size: .78rem; line-height: 1.35; margin-top: 4px; }
.st-market-route-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 7px; }
.st-market-route-meta { color: var(--good); font-size: .66rem; }
.st-market-route button { padding: 4px 9px; font-size: .72rem; border-radius: 5px; cursor: pointer;
  border-color: var(--good); color: var(--good); background: rgba(98,224,138,.08); white-space: nowrap; }
.st-market-route button:hover:not(:disabled) { background: rgba(98,224,138,.15); }
.st-row .c-qty { display: flex; align-items: center; gap: 3px; justify-content: flex-end; }
.st-row .c-qty button { padding: 2px 7px; font-size: .72rem; }
.st-row .c-qty button.on { border-color: var(--accent); color: var(--accent); }
.st-qty-val { min-width: 34px; text-align: right; color: var(--accent); }
.st-row .c-act { display: flex; gap: 5px; justify-content: flex-end; }
.st-buy-btn { border-color: var(--good); color: var(--good); }
.st-buy-btn:hover:not(:disabled) { background: var(--good); color: #021008; }
.st-sell-btn { border-color: var(--warn); color: var(--warn); }
.st-sell-btn:hover:not(:disabled) { background: var(--warn); color: #1a1000; }
.st-market-foot { margin-top: 10px; color: var(--ink-dim); font-size: .8rem; }
/* market footer message (e.g. "Select a quantity, then Buy or Sell." / the live trade result) —
   referenced in market.js but never defined, so it was inheriting unstyled. */
.st-foot-msg { font-family: var(--mono); font-size: .76rem; letter-spacing: .04em; }
.st-foot-msg.st-foot-msg--ok { color: var(--good); }
.st-foot-msg.st-foot-msg--bad { color: var(--danger); }

/* Phase 7: Manufacturing panel */
.st-manufacture { display: flex; flex-direction: column; gap: 6px; }
.st-manuf-intro { color: var(--ink-dim); font-size: .82rem; margin-bottom: 8px; line-height: 1.4; }
.st-manuf-group-h { font-family: var(--mono); font-size: var(--t-xs); letter-spacing: .16em;
  text-transform: uppercase; color: var(--accent); margin: 14px 0 6px;
  display: flex; align-items: center; gap: 10px; }
.st-manuf-group-h::after { content:''; flex:1; height:1px; background:linear-gradient(90deg, var(--panel-edge), transparent); }
.st-manuf-list { display: flex; flex-direction: column; gap: 8px; }
.st-manuf-card { padding: 12px 14px; }
.st-manuf-card.st-manuf-locked { opacity: .5; filter: saturate(.3); }
.st-manuf-card-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.st-manuf-title { font-size: var(--t-md); font-weight: 600; color: var(--ink); display: flex; align-items: center; gap: 8px; }
.st-manuf-desc { color: var(--ink-dim); font-size: .78rem; margin: 4px 0 2px; line-height: 1.35; }
.st-manuf-augnote { color: var(--warn); font-size: .72rem; margin-top: 2px; }
.st-manuf-out { color: var(--good); font-size: .8rem; margin: 4px 0; font-weight: 600; }
.st-manuf-mats { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.st-mat-chip { font-size: .7rem; padding: 2px 7px; border-radius: var(--r-pill); font-family: var(--mono);
  background: rgba(98,224,138,.12); color: var(--good); border: 1px solid rgba(98,224,138,.25); }
.st-mat-chip.st-mat-missing { background: rgba(255,84,112,.12); color: var(--danger); border-color: rgba(255,84,112,.25); }

/* Phase 4: trade route planner + price heat */
.st-market-planner { margin-bottom: 12px; border: 1px solid var(--panel-edge); border-radius: 8px;
  padding: 10px 12px; background: linear-gradient(180deg, rgba(57,208,255,.06), rgba(10,18,32,.4)); }
.st-planner-hint { color: var(--ink-mute); font-weight: 400; font-size: .7rem; letter-spacing: .02em; text-transform: none; }
.st-planner-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.st-planner-empty { color: var(--ink-dim); font-size: .82rem; font-style: italic; padding: 4px 0; }
.st-planner-row { display: grid; grid-template-columns: 1.25fr 1.8fr 1.25fr 1.35fr 1.15fr auto auto; align-items: center; gap: 8px;
  padding: 6px 9px; background: rgba(10,18,32,.5); border: 1px solid var(--panel-edge); border-radius: 6px; font-size: .82rem; }
.st-pl-cmdty { color: var(--ink); font-weight: 600; }
.st-pl-prices { color: var(--ink-dim); font-size: .78rem; }
.st-pl-margin { font-weight: 600; }
.st-pl-up { color: var(--good); }
.st-pl-run { font-family: var(--mono); font-size: .76rem; }
.st-pl-run--ok { color: var(--energy); }
.st-pl-run--blocked { color: var(--ink-mute); font-style: italic; }
.st-pl-dest { color: var(--ink-mute); font-size: .78rem; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.st-pl-intel { color: var(--accent-2); font-size: .62rem; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; }
.st-pl-nav, .st-pl-load { padding: 4px 9px; font-size: .72rem; border-radius: 5px; cursor: pointer; white-space: nowrap; }
.st-pl-load { border-color: var(--good); color: var(--good); background: rgba(98,224,138,.08); }
.st-pl-load:hover { background: rgba(98,224,138,.15); }
.st-pl-nav { border-color: var(--accent); color: var(--accent); }
.st-pl-nav:hover { background: rgba(57,208,255,.14); }
.st-heat-up { color: var(--danger); }     /* dear = sell opportunity (red = you can sell high) */
.st-heat-down { color: var(--good); }     /* cheap = buy opportunity (green = buy low) */
.st-heat-flat { color: var(--ink-dim); }
/* UX-4: inline price-trend sparkline next to each commodity name. Small + muted so it reads as a
   secondary cue (the ▲/▼ heat is the primary); trend-colored by sparkline.js (warm up / cool down). */
.st-spark { display:inline-block; width:56px; height:14px; vertical-align:middle; margin-left:8px;
  opacity:.85; }

/* shipyard */
/* The hulls-for-sale table has 7 columns (Hull name, Tier, Hull, Shield, Cargo, Price, action) but
   the shared .st-row grid only defines 6 tracks — so shipyard rows were misaligning / squishing the
   last column. Scope a 7-track grid under .st-shipyard so the market table (6 cols) is unaffected. */
.st-shipyard .st-row { grid-template-columns: 2.6fr .6fr .8fr .9fr .9fr 1.3fr 1fr; }
.st-sy-owned { margin-bottom: 16px; }
.st-sy-owned-list { display: flex; gap: 10px; flex-wrap: wrap; }
.st-sy-card { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 10px 12px; min-width: 180px;
  background: rgba(10,18,32,.6); }
.st-sy-card.active { border-color: var(--accent); box-shadow: 0 0 12px rgba(57,208,255,.25); }
.st-sy-name { font-size: .95rem; margin-bottom: 3px; }
.st-sy-meta { color: var(--ink-dim); font-size: .72rem; margin-bottom: 8px; }
.st-sy-guide, .st-sy-purpose, .st-sy-card-purpose { color: var(--ink-dim); font-size: .74rem; line-height: 1.35; }
.st-sy-guide { margin: -2px 0 10px; border: 1px solid var(--panel-edge); border-radius: 6px;
  padding: 9px 11px; background: rgba(10,18,32,.5); }
.st-sy-job-guide { border-color: rgba(57,208,255,.34); background: linear-gradient(90deg, rgba(57,208,255,.10), rgba(10,18,32,.54)); }
.st-sy-job-title { color: var(--ink); font-weight: 700; font-size: .84rem; margin-top: 6px; }
.st-sy-job-body { color: var(--ink-dim); font-size: .76rem; line-height: 1.35; margin-top: 3px; }
.st-sy-purpose { display: block; margin-top: 3px; white-space: normal; }
.st-sy-fitline { display: block; margin-top: 3px; white-space: normal; font-size: .7rem; line-height: 1.3; }
.st-sy-fitline--ok { color: var(--good); }
.st-sy-fitline--warn { color: var(--warn); }
.st-sy-fitline--bad { color: var(--ink-mute); }
.st-shipyard .st-row.mission-fit-ok { border-color: rgba(98,224,138,.34); background: rgba(98,224,138,.045); }
.st-shipyard .st-row.mission-fit-warn { border-color: rgba(255,198,77,.26); background: rgba(255,198,77,.035); }
.st-sy-card-purpose { margin: -3px 0 8px; color: var(--ink-mute); }
.st-sy-btns { display: flex; gap: 6px; }
.st-sy-btns button { font-size: .75rem; padding: 4px 8px; }

/* outfitting */
/* the two-column wrapper (slot grid + stat table) referenced in outfitting.js — was undefined. */
.st-outfit-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 18px; align-items: start; }
.st-outfit-top { display: grid; grid-template-columns: 1.6fr 1fr; gap: 18px; margin-bottom: 16px; }
.st-slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.st-slot { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 8px 10px; cursor: pointer;
  background: rgba(10,18,32,.5); position: relative; }
.st-slot.empty { border-style: dashed; }
.st-slot.filled { border-color: var(--panel-edge-2); }
.st-slot.sel { border-color: var(--accent); box-shadow: 0 0 8px rgba(57,208,255,.3); }
/* Type-coded left accent so slot kinds are scannable at a glance. The .st-slot-{type} modifier
   is emitted by outfitting.js per cell; these cover every slotType in data/ships.js + modules.js. */
.st-slot-weapon { border-left: 3px solid var(--danger); }
.st-slot-shield { border-left: 3px solid var(--shield); }
.st-slot-engine { border-left: 3px solid var(--warn); }
.st-slot-cargo { border-left: 3px solid var(--cargo); }
.st-slot-mining { border-left: 3px solid var(--accent-2); }
.st-slot-utility { border-left: 3px solid var(--accent-3); }
.st-slot-type { font-size: .62rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-mute); }
.st-slot-facing { display: inline-block; margin-left: 5px; padding: 0 5px; border-radius: 3px;
  background: rgba(57,208,255,.14); color: var(--accent); font-size: .58rem; letter-spacing: .08em;
  border: 1px solid rgba(57,208,255,.35); }
.st-slot-mod { font-size: .85rem; margin-top: 3px; min-height: 1.1em; }
.st-slot-unfit { position: absolute; top: 6px; right: 6px; font-size: .62rem; padding: 1px 6px;
  border-color: var(--danger); color: var(--danger); }
.st-stat-table { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 6px 10px; background: rgba(10,18,32,.5); }
.st-stat-row { display: grid; grid-template-columns: 1.4fr 1fr .9fr; align-items: baseline; gap: 6px;
  padding: 3px 0; font-size: .82rem; }
.st-stat-row .st-stat-l { color: var(--ink-dim); text-transform: none; letter-spacing: normal; font-size: .82rem; }
.st-stat-row--drive { grid-template-columns: 1.4fr 1fr; border-bottom: 1px solid var(--panel-edge);
  margin-bottom: 3px; padding-bottom: 4px; }
.st-stat-row--drive .st-stat-v { color: var(--accent); letter-spacing: .04em; }
.st-stat-v { text-align: right; }
.st-delta { text-align: right; font-size: .75rem; font-family: var(--mono); }
.st-delta.up { color: var(--good); } .st-delta.down { color: var(--danger); }
.st-inv-list { display: flex; flex-wrap: wrap; gap: 8px; }
.st-inv-item { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 6px 10px; cursor: pointer;
  background: rgba(10,18,32,.6); display: flex; flex-direction: column; }
.st-inv-item:hover { border-color: var(--accent); }
.st-inv-item.incompat { opacity: .55; }
.st-inv-name { font-size: .82rem; }
.st-inv-meta { font-size: .64rem; color: var(--ink-mute); letter-spacing: .06em; text-transform: uppercase; }

/* module shop (outfitting) */
.st-outfit-shop { margin-top: 20px; border-top: 1px solid var(--panel-edge); padding-top: 12px; }
.st-shop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.st-shop-credits { color: var(--energy); font-size: .92rem; }
.st-shop-head-row.st-row { grid-template-columns: 2.2fr .8fr 2.4fr 1fr 1.2fr; }
.st-shop-list { display: block; max-height: 340px; overflow-y: auto; }
.st-shop-row { display: grid; grid-template-columns: 2.2fr .8fr 2.4fr 1fr 1.2fr; align-items: center;
  gap: 8px; padding: 7px 8px; border-bottom: 1px solid rgba(29,51,80,.4); font-size: .82rem;
  transition: background var(--dur) var(--ease); }
.st-shop-row:hover { background: rgba(57,208,255,.05); }
.st-shop-row.locked { opacity: .45; filter: saturate(.3); }
.st-shop-row.noafford { opacity: .6; }
.st-shop-row.nofit .c-name { color: var(--ink-mute); }
.st-shop-slot { color: var(--ink-mute); text-transform: uppercase; letter-spacing: .06em; font-size: .72rem; }
.st-shop-stats { color: var(--ink-dim); font-size: .74rem; line-height: 1.35; }
.st-shop-price { text-align: right; color: var(--energy); }
.st-shop-delta { margin-top: 2px; display: flex; flex-wrap: wrap; gap: 4px; }
.st-shop-delta .st-delta { font-size: .68rem; }
.st-shop-group { font-family: var(--mono); font-size: var(--t-xs); letter-spacing: .16em;
  text-transform: uppercase; color: var(--accent); margin: 12px 0 4px; padding: 4px 8px;
  display: flex; align-items: center; gap: 10px; }
.st-shop-group::after { content:''; flex:1; height:1px; background:linear-gradient(90deg, var(--panel-edge), transparent); }
.st-shop-row .c-act button { font-size: .74rem; padding: 3px 10px; }
.st-shop-row .c-act button:not(:disabled) { border-color: var(--good); color: var(--good); cursor: pointer; }
.st-shop-row .c-act button:not(:disabled):hover { background: var(--good); color: #021008; }

/* services */
.st-svc-list { display: flex; flex-direction: column; gap: 8px; }
.st-svc-row { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  border: 1px solid var(--panel-edge); border-radius: 6px; padding: 10px 14px; background: rgba(10,18,32,.5); }
.st-svc-row.disabled { opacity: .5; }
.st-svc-row--blocked { border-color: rgba(255,84,112,.32); }
.st-svc-row--recommend { border-color: rgba(57,208,255,.34); background: linear-gradient(90deg, rgba(57,208,255,.12), rgba(10,18,32,.58)); }
.st-svc-row--recommend-ok { border-color: rgba(98,224,138,.3); background: linear-gradient(90deg, rgba(98,224,138,.1), rgba(10,18,32,.56)); }
.st-svc-row--recommend-warn { border-color: rgba(255,198,77,.36); background: linear-gradient(90deg, rgba(255,198,77,.12), rgba(10,18,32,.58)); }
.st-svc-row--recommend-bad { border-color: rgba(255,84,112,.42); background: linear-gradient(90deg, rgba(255,84,112,.14), rgba(10,18,32,.58)); }
.st-svc-row--recommend .st-svc-name { color: var(--accent); font-family: var(--mono); font-size: .72rem;
  letter-spacing: .11em; text-transform: uppercase; }
.st-svc-name { font-size: .92rem; }
.st-svc-detail { font-size: .72rem; color: var(--ink-dim); margin-top: 2px; }
.st-svc-meta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.st-svc-chip { font-family: var(--mono); font-size: .68rem; line-height: 1.2; padding: 2px 7px; border-radius: 999px;
  border: 1px solid var(--panel-edge); color: var(--ink-dim); background: rgba(132,160,200,.08); }
.st-svc-chip--ok { color: var(--good); border-color: rgba(98,224,138,.32); background: rgba(98,224,138,.1); }
.st-svc-chip--warn { color: var(--warn); border-color: rgba(255,198,77,.34); background: rgba(255,198,77,.1); }
.st-svc-chip--bad { color: var(--danger); border-color: rgba(255,84,112,.34); background: rgba(255,84,112,.1); }
.st-svc-chip--cost { color: var(--energy); border-color: rgba(255,216,74,.28); background: rgba(255,216,74,.08); }

/* factions */
.st-fac-note { font-size: .68rem; color: var(--ink-mute); margin-bottom: 12px; letter-spacing: .06em; }
.st-fac-list { display: flex; flex-direction: column; gap: 12px; }
.st-fac-row { border-bottom: 1px solid rgba(29,51,80,.4); padding-bottom: 10px; }
.st-fac-head { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.st-fac-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.st-fac-name { flex: 1; font-size: .92rem; }
.st-fac-tier { font-size: .66rem; letter-spacing: .08em; text-transform: uppercase; padding: 1px 7px; border-radius: 4px; }
.st-fac-val { min-width: 56px; text-align: right; font-size: .85rem; }
.st-fac-bar { position: relative; height: 8px; border-radius: 4px; background: var(--panel-2);
  overflow: hidden; border: 1px solid var(--panel-edge); }
.st-fac-bar-mid { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--ink-mute); opacity: .6; }
.st-fac-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: left;
  background: var(--accent); opacity: .7; }
.st-fac-ctrl, .st-fac-rel { font-size: .66rem; color: var(--ink-mute); margin-top: 5px; }
.st-fac-rel { color: var(--ink-dim); }
.st-fac-effect { font-size: .74rem; color: var(--ink); line-height: 1.35; margin-top: 5px; }
.st-fac-guidance { display: grid; grid-template-columns: minmax(52px, auto) 1fr; gap: 4px 10px;
  margin-top: 8px; padding: 8px 9px; border: 1px solid rgba(57,208,255,.12); border-radius: 6px;
  background: rgba(4,12,24,.34); color: var(--ink-dim); font-size: .7rem; line-height: 1.35; }
.st-fac-guidance-label { color: var(--accent); text-transform: uppercase; letter-spacing: .08em; font-size: .62rem; }
.st-fac-contracts { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.st-fac-contract { font-size: .62rem; line-height: 1.25; padding: 3px 6px; border-radius: 4px;
  border: 1px solid rgba(148,163,184,.18); color: var(--ink-mute); background: rgba(255,255,255,.025); }
.st-fac-contract b { font-family: var(--mono); font-size: .58rem; letter-spacing: .06em; text-transform: uppercase;
  color: var(--ink-dim); margin-right: 3px; }
.st-fac-contract.unlocked { color: var(--good); border-color: rgba(98,224,138,.28); background: rgba(98,224,138,.08); }
.st-fac-contract.unlocked b { color: var(--good); }
.st-fac-contract.locked:not(.aspirational) { color: var(--warn); border-color: rgba(255,198,77,.26); }
.st-fac-contract.aspirational { border-style: dashed; }
.st-fac-hostile { color: var(--danger); background: rgba(255,84,112,.12); }
.st-fac-cool { color: var(--warn); background: rgba(255,179,71,.12); }
.st-fac-neutral { color: var(--ink-dim); background: rgba(132,160,200,.1); }
.st-fac-warm, .st-fac-good { color: var(--good); background: rgba(98,224,138,.12); }
.st-fac-allied { color: var(--accent-2); background: rgba(122,247,208,.14); }
.st-fac-bar-fill.st-fac-hostile { background: var(--danger); }
.st-fac-bar-fill.st-fac-cool { background: var(--warn); }
.st-fac-bar-fill.st-fac-good, .st-fac-bar-fill.st-fac-warm { background: var(--good); }
.st-fac-bar-fill.st-fac-allied { background: var(--accent-2); }

/* bar */
.st-bar-list { display: flex; flex-direction: column; gap: 14px; }
.st-bar-card { display: flex; gap: 14px; border: 1px solid var(--panel-edge); border-radius: 8px;
  padding: 12px 14px; background: rgba(10,18,32,.5); }
.st-bar-avatar { width: 64px; height: 64px; border-radius: 6px; flex: none; border: 1px solid var(--panel-edge); }
.st-bar-body { flex: 1; }
.st-bar-name { font-size: .98rem; }
.st-bar-role { color: var(--ink-mute); font-size: .68rem; letter-spacing: .06em; text-transform: uppercase; }
.st-bar-line { color: var(--ink-dim); font-size: .85rem; margin: 6px 0 8px; font-style: italic; }
.st-bar-intel { display: flex; gap: 5px; flex-wrap: wrap; margin: -2px 0 8px; }
.st-bar-intel-chip { font-size: .66rem; line-height: 1.25; border: 1px solid rgba(57,208,255,.22);
  border-radius: 5px; padding: 2px 6px; color: var(--ink-dim); background: rgba(6,12,22,.48); }
.st-bar-intel-chip b { font-family: var(--mono); color: var(--accent); font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
.st-bar-intel-chip--ok { border-color: rgba(98,224,138,.3); color: var(--good); }
.st-bar-intel-chip--ok b { color: var(--good); }
.st-bar-intel-chip--warn { border-color: rgba(255,198,77,.32); color: var(--warn); }
.st-bar-intel-chip--warn b { color: var(--warn); }
.st-bar-intel-chip--bad { border-color: rgba(255,84,112,.36); color: var(--danger); }
.st-bar-intel-chip--bad b { color: var(--danger); }
.st-bar-intel-chip--story { border-color: rgba(192,139,255,.36); color: var(--accent-2); }
.st-bar-intel-chip--story b { color: var(--accent-2); }
.st-bar-choices { display: flex; gap: 6px; flex-wrap: wrap; }
.st-bar-choices button { font-size: .78rem; }
.st-bar-reply { margin-top: 8px; font-size: .82rem; color: var(--accent-2); max-height: 0; overflow: hidden;
  transition: max-height .2s ease; }
.st-bar-reply.show { max-height: 120px; }
.st-bar-offer { margin-top: 8px; display: grid; gap: 6px; justify-items: start; }
.st-bar-offer .st-mission-preflight { margin: 0; }
.st-bar-offer .st-mission-consequences { margin: 0; }
.st-bar-offer.accepted { opacity: .82; }
.st-bar-offer-warn { margin: -1px 0 0; }
.st-bar-offer-blocker { margin: -1px 0 0; }
.st-bar-accept-btn { font-size: .78rem; }
.st-bar-log-btn { border-color: rgba(98,224,138,.42); color: var(--good); }
.st-bar-log-btn:hover { background: rgba(98,224,138,.12); }

/* missions */
.st-mission-guide { margin: -2px 0 12px; border: 1px solid var(--panel-edge); border-radius: 6px;
  padding: 9px 11px; background: rgba(10,18,32,.5); color: var(--ink-dim); font-size: .8rem; line-height: 1.4; }
.st-mission-recommend { margin: -2px 0 12px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 12px; border: 1px solid rgba(57,208,255,.34); border-radius: 6px; padding: 10px 12px;
  background: linear-gradient(90deg, rgba(57,208,255,.12), rgba(10,18,32,.58)); }
.st-mission-recommend[hidden] { display: none; }
.st-mission-recommend--ok { border-color: rgba(98,224,138,.36); background: linear-gradient(90deg, rgba(98,224,138,.11), rgba(10,18,32,.58)); }
.st-mission-recommend--warn { border-color: rgba(255,198,77,.38); background: linear-gradient(90deg, rgba(255,198,77,.12), rgba(10,18,32,.58)); }
.st-mission-recommend--bad { border-color: rgba(255,84,112,.42); background: linear-gradient(90deg, rgba(255,84,112,.13), rgba(10,18,32,.58)); }
.st-mission-recommend-copy { min-width: 0; display: grid; gap: 3px; }
.st-mission-recommend-label { color: var(--accent); font-size: .62rem; letter-spacing: .14em; }
.st-mission-recommend--ok .st-mission-recommend-label { color: var(--good); }
.st-mission-recommend--warn .st-mission-recommend-label { color: var(--warn); }
.st-mission-recommend--bad .st-mission-recommend-label { color: var(--danger); }
.st-mission-recommend-title { color: var(--ink); font-weight: 700; font-size: .88rem; line-height: 1.3; }
.st-mission-recommend-reason { color: var(--ink-dim); font-size: .74rem; line-height: 1.34; }
.st-mission-recommend button { flex: none; max-width: 100%; font-size: .75rem; white-space: nowrap; }
.st-mission-accepted { margin: -2px 0 12px; border: 1px solid rgba(98,224,138,.42); border-radius: 6px;
  padding: 10px 12px; background: rgba(25,54,42,.36); box-shadow: 0 0 12px rgba(98,224,138,.12); }
.st-mission-accepted[hidden] { display: none; }
.st-mission-accepted-label { color: var(--good); font-size: .62rem; letter-spacing: .14em; margin-bottom: 4px; }
.st-mission-accepted-title { color: var(--ink); font-weight: 700; font-size: .9rem; line-height: 1.3; }
.st-mission-accepted-next { color: var(--ink-dim); font-size: .78rem; line-height: 1.35; margin-top: 4px; }
.st-mission-accepted-log { color: var(--ink-mute); font-size: .68rem; line-height: 1.35; margin-top: 6px; }
.st-mission-list { display: flex; flex-direction: column; gap: 10px; }
.st-mission-card { border: 1px solid var(--panel-edge); border-radius: 8px; padding: 11px 14px;
  background: rgba(10,18,32,.55); }
.st-mission-card.tracked { border-color: var(--accent); box-shadow: 0 0 10px rgba(57,208,255,.2); }
.st-mission-card.recommended--ok { border-color: rgba(98,224,138,.38); box-shadow: 0 0 12px rgba(98,224,138,.16); }
.st-mission-card.recommended--warn { border-color: rgba(255,198,77,.4); box-shadow: 0 0 12px rgba(255,198,77,.14); }
.st-mission-card.recommended--bad { border-color: rgba(255,84,112,.42); box-shadow: 0 0 12px rgba(255,84,112,.14); }
.st-mission-card.tracked.recommended { border-color: var(--accent); box-shadow: 0 0 12px rgba(57,208,255,.22); }
.st-mission-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 10px; }
.st-mission-title { font-size: .95rem; min-width: 0; }
.st-mission-badges { display: inline-flex; align-items: center; gap: 6px; flex: none; }
.st-mission-recommended { font-family: var(--mono); font-size: .62rem; letter-spacing: .08em; padding: 1px 7px;
  border-radius: 4px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.04); }
.st-mission-recommended--ok { color: var(--good); border-color: rgba(98,224,138,.34); }
.st-mission-recommended--warn { color: var(--warn); border-color: rgba(255,198,77,.34); }
.st-mission-recommended--bad { color: var(--danger); border-color: rgba(255,84,112,.36); }
.st-mission-readiness { font-family: var(--mono); font-size: .62rem; letter-spacing: .08em; padding: 1px 7px;
  border-radius: 4px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.04); }
.st-mission-readiness--ok { color: var(--good); border-color: rgba(98,224,138,.32); }
.st-mission-readiness--warn { color: var(--warn); border-color: rgba(255,198,77,.34); }
.st-mission-readiness--bad { color: var(--danger); border-color: rgba(255,84,112,.36); }
.st-mission-risk { font-size: .62rem; letter-spacing: .08em; padding: 1px 7px; border-radius: 4px;
  background: var(--panel-2); color: var(--ink-dim); }
.st-mission-risk.r0 { color: var(--good); } .st-mission-risk.r1 { color: var(--accent-2); }
.st-mission-risk.r2 { color: var(--warn); } .st-mission-risk.r3, .st-mission-risk.r4 { color: var(--danger); }
.st-mission-meta { font-size: .72rem; color: var(--ink-dim); margin: 4px 0; }
.st-mission-brief { color: var(--ink); font-size: .82rem; line-height: 1.38; margin-top: 6px; }
.st-mission-purpose { color: var(--ink); font-size: .78rem; line-height: 1.35; margin-top: 5px; }
.st-mission-next { color: var(--ink-mute); font-size: .72rem; line-height: 1.35; margin: 3px 0 8px; }
.st-mission-preflight { display: flex; flex-wrap: wrap; gap: 5px; margin: 0 0 8px; }
.st-mission-preflight-chip { font-family: var(--mono); font-size: .66rem; letter-spacing: .04em;
  border: 1px solid var(--panel-edge); border-radius: 4px; padding: 2px 6px; color: var(--ink-dim);
  background: rgba(10,18,32,.48); }
.st-mission-preflight-chip--ok { color: var(--good); border-color: rgba(98,224,138,.34); }
.st-mission-preflight-chip--warn { color: var(--warn); border-color: rgba(255,198,77,.34); }
.st-mission-preflight-chip--bad { color: var(--danger); border-color: rgba(255,84,112,.34); }
.st-mission-preflight-chip--info { color: var(--accent); border-color: rgba(57,208,255,.28); }
.st-mission-standing { display: flex; gap: 8px; align-items: baseline; font-size: .68rem; line-height: 1.3;
  margin: -3px 0 8px; color: var(--ink-mute); }
.st-mission-standing .mono { font-size: .6rem; letter-spacing: .08em; text-transform: uppercase; }
.st-mission-standing--ok .mono { color: var(--good); }
.st-mission-standing--locked .mono { color: var(--danger); }
.st-mission-preflight-warn { color: var(--warn); font-size: .7rem; line-height: 1.3; margin: -3px 0 8px; }
.st-mission-rewards { display: flex; gap: 14px; font-size: .8rem; margin-bottom: 8px; }
.st-mission-cr { color: var(--energy); }
.st-mission-rep { color: var(--accent-2); }
.st-mission-exp { color: var(--ink-mute); }
.st-mission-consequences { display: flex; flex-wrap: wrap; gap: 5px; margin: -2px 0 8px; }
.st-mission-consequence { font-size: .64rem; letter-spacing: .02em; line-height: 1.25;
  padding: 3px 6px; border: 1px solid rgba(148,163,184,.18); border-radius: 4px;
  color: var(--ink-dim); background: rgba(255,255,255,.025); }
.st-mission-consequence b { color: var(--ink); font-weight: 700; text-transform: uppercase; }
.st-mission-consequence--ok { border-color: rgba(98,224,138,.3); color: var(--good); }
.st-mission-consequence--warn { border-color: rgba(255,198,77,.3); color: var(--warn); }
.st-mission-consequence--bad { border-color: rgba(255,84,112,.34); color: var(--danger); }
.st-mission-btns { display: flex; gap: 8px; align-items: center; }
.st-mission-btns button { font-size: .78rem; }
.st-mission-unmet { font-size: .7rem; color: var(--danger); }
`;
