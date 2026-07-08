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
import { createFactionsPanel, tierFor, factionStandingGuidance } from './factions.js';
import { createBarPanel } from './bar.js';
import { SECTORS } from '../../data/sectors.js';
import { FACTION_META } from '../../data/factions.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { COMMODITIES } from '../../data/commodities.js';
import { escapeHtml } from '../comms.js';
import { missionPreflight } from '../missionPreflight.js';
import { missionConsequenceSummary } from '../missionPreflight.js';
import { missionStandingRequirement } from '../missionPreflight.js';
import { missionRouteIntel, missionCargoFootprint, fmtHoldUnits } from '../missionPreflight.js';
import { BINDINGS } from '../bindings.js';
import { glyphSvg } from '../uiPrimitives.js';
import { STATION_BROADCASTS } from '../../systems/stationBroadcast.js';
// Command-deck effect layer (vanilla DOM/canvas factories; view-only, no sim import).
// See design/revamp/COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md §1 and src/ui/effects/README.md.
import {
  createFlickerGrid,
  createRippleField,
  createRouteBeam,
  createMorphLabel,
  createCircularGauge,
  createDockRail,
} from '../effects/index.js';

const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_BY_ID = new Map();
for (const sec of SECTORS) {
  for (const stn of sec.stations || []) STATION_BY_ID.set(stn.id, stn);
}

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

// Text glyphs for the Service Dock nodes (dockRail renders icon as textContent, not SVG — so these
// are single unicode marks, distinct from the tab rail's SVG glyphs). One per berth service.
const SERVICE_ICON = {
  refuel: '⛽', repair: '⚒', trade: '⚖', ore_buy: '⛏', refine: '♨',
  module_craft: '⚙', shipyard: '⛴', missions: '✦', toll: '⛨', scan: '⌖',
  black_market: '☣', scan_tech: '⌕',
};

// The physical berth services the Service Dock always shows — offered ones read ONLINE, the rest read
// OFFLINE (the "unavailable nodes visibly offline" requirement). This is a SERVICE strip (what this
// berth can physically do), deliberately NOT a copy of the section tab rail (bible §1.10 forbidden).
const CANONICAL_BERTH_SERVICES = [
  'refuel', 'repair', 'trade', 'ore_buy', 'refine', 'module_craft', 'shipyard', 'missions',
];

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

function tabLabel(tabId) {
  if (tabId === 'hold') return 'HOLD';
  const tab = TABS.find((t) => t.id === tabId);
  return (tab && tab.label) || titleCaseWords(tabId);
}

export function stationTabServiceStatus(tabId, stn) {
  if (tabId === 'hold') {
    return {
      state: 'available',
      offered: true,
      label: 'manifest',
      title: 'HOLD: View cargo hold manifest. ' + tabPurpose(tabId),
    };
  }
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
  if (tabId === 'hold') return 'View cargo hold manifest, capacity, and item values.';
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
  let icon = '●';
  const l = (chip.label || '').toLowerCase();
  if (l.includes('nav') || l.includes('obj') || l.includes('mission')) icon = '◆';
  else if (l.includes('hold') || l.includes('cargo') || l.includes('mass')) icon = '■';

  const cls = 'st-departure-chip st-departure-chip--' + chip.kind;
  const body =
    '<b>' + escapeHtml(chip.label) + '</b>' +
    '<span>' + icon + ' ' + escapeHtml(chip.text) + '</span>';

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

const STATION_RISKS = {
  trade_hub: 'Low risk. Customs scans are active but predictable. High security presence.',
  refinery: 'Industrial hazard zone. Toxic exhausts, heavy transport lanes, and high cargo shipping traffic.',
  mining: 'Navigational warning. Uncharted debris, drifting rocks, and active scavenger groups nearby.',
  fab: 'Industrial workspace. Automated construction frames and heavy logistics tug traffic.',
  military: 'Combat operations alert. High-intensity security scans and active perimeter defense grids.',
  blackmarket: 'Hostile environment. Unregulated flight paths, frequent local raids, and no security response.',
  research: 'Anomalous telemetry zone. Sensor wash warnings, local radiation leaks, and scientific testing hazard fields.',
};

function tabForService(svc) {
  if (svc === 'trade' || svc === 'black_market') return 'market';
  if (svc === 'shipyard') return 'shipyard';
  if (svc === 'module_craft' || svc === 'refine') return 'manufacture';
  if (svc === 'missions') return 'missions';
  if (['refuel', 'repair', 'toll', 'scan', 'scan_tech'].includes(svc)) return 'services';
  return 'services';
}

export function stationServiceLabel(svc) {
  return SERVICE_LABELS[svc] || titleCaseWords(svc);
}

const SERVICE_DESC = {
  refuel: 'Top off reactor fuel so the next jump route stays in range.',
  repair: 'Restore hull and armor before undocking into hostile lanes.',
  trade: 'Buy and sell cargo; compare prices and set profitable routes.',
  ore_buy: 'Sell raw mined ore to the station ore buyer.',
  refine: 'Refine raw ore and gas into materials for manufacturing.',
  module_craft: 'Fabricate modules, upgrades, and hulls from materials.',
  shipyard: 'Buy hulls to change cargo, survivability, and slot layout.',
  missions: 'Accept contracts that auto-track and set nav guidance.',
  toll: 'Pay the customs toll levied on cargo passing through.',
  scan: 'Station security scan of your manifest for contraband.',
  black_market: 'Move restricted cargo and take covert contracts.',
  scan_tech: 'Buy survey data and frontier charts from the survey lab.',
};

function berthServiceDesc(svc) {
  return SERVICE_DESC[svc] || tabPurpose(tabForService(svc));
}

/** Readiness badge for a Service Dock node: OFFLINE if not offered here; live fuel/hull % for
 *  refuel/repair; ONLINE otherwise. state maps to the dockRail badge colour (good/warn/danger). */
function berthServiceReadiness(svc, offered, state) {
  if (!offered) return { state: 'danger', label: 'OFFLINE' };
  if (svc === 'refuel') {
    const fuel = (state && state.fuel) || {};
    const frac = clamp01(Number(fuel.current) / Number(fuel.max), 1);
    return { state: frac < 0.25 ? 'danger' : (frac < 0.5 ? 'warn' : 'good'), label: fmtPercent(frac) };
  }
  if (svc === 'repair') {
    const ship = playerEntity(state);
    const frac = ship && ship.hullMax > 0 ? clamp01((ship.hull || 0) / ship.hullMax, 1) : 1;
    return { state: frac < 0.35 ? 'danger' : (frac < 0.7 ? 'warn' : 'good'), label: fmtPercent(frac) };
  }
  return { state: 'good', label: 'ONLINE' };
}

/** The authored sector a station id belongs to (static catalog scan; deterministic). */
function stationSectorId(stationId) {
  for (const sec of SECTORS) {
    if ((sec.stations || []).some((s) => s.id === stationId)) return sec.id;
  }
  return null;
}

/** Nearest station that offers `svc`, preferring the same sector, then a neighbour, then anywhere.
 *  Returns { name, sector } or null. Used for the inspector's "route to nearest service" hint. */
function nearestStationOffering(svc, fromStationId) {
  const homeSectorId = stationSectorId(fromStationId);
  const home = homeSectorId ? SECTOR_BY_ID.get(homeSectorId) : null;
  const neighbors = new Set((home && home.neighbors) || []);
  let sameSector = null;
  let neighbour = null;
  let anywhere = null;
  for (const sec of SECTORS) {
    for (const s of (sec.stations || [])) {
      if (s.id === fromStationId) continue;
      if (!Array.isArray(s.services) || !s.services.includes(svc)) continue;
      const rec = { name: s.name, sector: sec.name };
      if (sec.id === homeSectorId) sameSector = sameSector || rec;
      else if (neighbors.has(sec.id)) neighbour = neighbour || rec;
      else anywhere = anywhere || rec;
    }
  }
  return sameSector || neighbour || anywhere || null;
}

function stationSchematicSvg(type) {
  const norm = String(type || '').trim().toLowerCase();

  let paths = '';
  if (norm === 'military') {
    paths = `
      <circle cx="50" cy="50" r="14" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <circle cx="50" cy="50" r="6" fill="none" stroke="var(--st-accent)" stroke-width="1.2" />
      <path d="M 50 10 L 50 90 M 10 50 L 90 50 M 20 20 L 80 80 M 20 80 L 80 20" fill="none" stroke="var(--st-accent)" stroke-width="0.8" stroke-dasharray="2, 2" />
      <polygon points="50,5 55,20 80,20 65,35 75,60 50,45 25,60 35,35 20,20 45,20" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
    `;
  } else if (norm === 'refinery') {
    paths = `
      <rect x="25" y="40" width="16" height="45" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <rect x="45" y="30" width="20" height="55" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <rect x="70" y="50" width="12" height="35" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <path d="M 33 40 L 33 22 L 38 22 M 55 30 L 55 12 L 60 12 M 76 50 L 76 32 L 81 32" fill="none" stroke="var(--st-accent)" stroke-width="1" />
      <path d="M 15 85 L 85 85" stroke="var(--st-accent)" stroke-width="2" />
    `;
  } else if (norm === 'mining') {
    paths = `
      <path d="M 30 20 Q 15 35 20 60 Q 25 85 50 80 Q 75 75 80 50 Q 85 25 60 20 Z" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <circle cx="45" cy="40" r="4" fill="none" stroke="var(--st-accent)" stroke-width="1" />
      <circle cx="65" cy="55" r="6" fill="none" stroke="var(--st-accent)" stroke-width="1" />
      <path d="M 50 80 L 50 95 M 50 95 L 65 95" fill="none" stroke="var(--st-accent)" stroke-width="1.2" stroke-dasharray="2, 2" />
    `;
  } else if (norm === 'fab') {
    paths = `
      <polygon points="50,12 85,32 85,72 50,92 15,72 15,32" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <line x1="50" y1="12" x2="50" y2="92" stroke="var(--st-accent)" stroke-width="1.2" />
      <line x1="15" y1="32" x2="50" y2="52" stroke="var(--st-accent)" stroke-width="1" />
      <line x1="85" y1="32" x2="50" y2="52" stroke="var(--st-accent)" stroke-width="1" />
      <circle cx="50" cy="52" r="8" fill="none" stroke="var(--st-accent)" stroke-width="1.2" />
    `;
  } else if (norm === 'blackmarket') {
    paths = `
      <circle cx="35" cy="35" r="14" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <circle cx="65" cy="42" r="9" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <circle cx="48" cy="68" r="11" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <line x1="35" y1="35" x2="65" y2="42" stroke="var(--st-accent)" stroke-width="1" stroke-dasharray="2, 2" />
      <line x1="65" y1="42" x2="48" y2="68" stroke="var(--st-accent)" stroke-width="1" stroke-dasharray="2, 2" />
      <line x1="35" y1="35" x2="48" y2="68" stroke="var(--st-accent)" stroke-width="1" stroke-dasharray="2, 2" />
    `;
  } else if (norm === 'research') {
    paths = `
      <circle cx="50" cy="50" r="32" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <circle cx="50" cy="50" r="18" fill="none" stroke="var(--st-accent)" stroke-width="1" stroke-dasharray="3, 3" />
      <path d="M 50 10 L 50 90 M 10 50 L 90 50" stroke="var(--st-accent)" stroke-width="0.8" />
      <path d="M 30 30 Q 50 5 70 30" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
    `;
  } else {
    paths = `
      <circle cx="50" cy="50" r="35" fill="none" stroke="var(--st-accent)" stroke-width="1.8" />
      <circle cx="50" cy="50" r="22" fill="none" stroke="var(--st-accent)" stroke-width="1.2" stroke-dasharray="4, 3" />
      <circle cx="50" cy="50" r="8" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <line x1="50" y1="15" x2="50" y2="85" stroke="var(--st-accent)" stroke-width="1" />
      <line x1="15" y1="50" x2="85" y2="50" stroke="var(--st-accent)" stroke-width="1" />
    `;
  }

  return `
    <svg viewBox="0 0 100 100" width="120" height="120" style="display:block; margin: 0 auto;">
      ${paths}
    </svg>
  `;
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

    // airlock graffiti strip
    const airlock = document.createElement('div');
    airlock.className = 'st-airlock';
    airlock.innerHTML = '<div class="st-airlock__label mono">AIRLOCK</div><div class="st-airlock__graffiti"></div>';
    screen.appendChild(airlock);
    this._airlockEl = airlock.querySelector('.st-airlock__graffiti');

    // main body: rail + workspace + inspector
    const body = document.createElement('div');
    body.className = 'st-body';

    const rail = document.createElement('div');
    rail.className = 'st-rail';
    rail.setAttribute('role', 'tablist');
    rail.setAttribute('aria-label', 'Station sections');

    const workspaceWrapper = document.createElement('div');
    workspaceWrapper.className = 'st-workspace-wrapper';

    // Center Stage
    const centerStage = document.createElement('div');
    centerStage.className = 'st-center-stage';

    // Faction stripe
    const factionStripe = document.createElement('div');
    factionStripe.className = 'st-faction-stripe';
    centerStage.appendChild(factionStripe);

    // Console Center Stage: schematic (with scanner-grid backdrop) + Service Dock + effect overlay.
    // The scan layer hosts flickerGrid (console acquisition on dock); the fx overlay hosts the ripple
    // field (service-select ping). The route beam lives on the workspace wrapper so it can reach the
    // inspector column. Effects are view-only and parked when the screen hides.
    const consoleConsole = document.createElement('div');
    consoleConsole.className = 'st-console-deck';
    consoleConsole.setAttribute('data-centerpiece', 'station-service-console');
    consoleConsole.innerHTML = `
      <div class="st-schematic-pane">
        <div class="st-fx-scan" aria-hidden="true"></div>
        <div class="st-schematic-art"></div>
      </div>
      <div class="st-service-nodes-pane" role="group" aria-label="Berth services"></div>
      <div class="st-fx-overlay" aria-hidden="true"></div>
    `;
    centerStage.appendChild(consoleConsole);
    this._schematicPane = consoleConsole.querySelector('.st-schematic-art');
    this._nodesPane = consoleConsole.querySelector('.st-service-nodes-pane');
    this._scanLayer = consoleConsole.querySelector('.st-fx-scan');
    this._fxOverlay = consoleConsole.querySelector('.st-fx-overlay');

    // Badges / status row. The econ badge carries a morphLabel mount so station state/event changes
    // animate the readout (morphLabel fires on value change only).
    const statusRow = document.createElement('div');
    statusRow.className = 'st-status-row';
    statusRow.innerHTML = `
      <div class="st-econ-badge mono"><span class="st-econ-mount"></span></div>
      <div class="st-readiness-summary mono"></div>
    `;
    centerStage.appendChild(statusRow);
    this._econBadge = statusRow.querySelector('.st-econ-badge');
    this._econMorphMount = statusRow.querySelector('.st-econ-mount');
    this._readinessSummary = statusRow.querySelector('.st-readiness-summary');

    // Handoff panel
    const handoff = document.createElement('div');
    handoff.className = 'st-handoff';
    handoff.hidden = true;
    handoff.innerHTML =
      '<div class="st-handoff-head">' +
        '<span class="st-handoff-label mono">First Dock Handoff</span>' +
        '<span class="st-handoff-copy">Sell the sample, take one safe job, then launch only when Departure Check reads clean.</span>' +
      '</div>' +
      '<div class="st-handoff-steps"></div>';
    centerStage.appendChild(handoff);
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
    centerStage.appendChild(departure);
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
      if (!TABS.some((t) => t.id === tabId) && tabId !== 'hold') return;
      this.setTab(tabId, { focusRail: true });
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    });

    const content = document.createElement('div');
    content.className = 'st-content';
    centerStage.appendChild(content);

    workspaceWrapper.appendChild(centerStage);

    // Right Inspector Column
    const inspector = document.createElement('div');
    inspector.className = 'st-inspector';

    const inspectorHead = document.createElement('div');
    inspectorHead.className = 'st-inspector-header mono';
    inspectorHead.textContent = 'System Diagnostics';
    inspector.appendChild(inspectorHead);

    const inspectorContent = document.createElement('div');
    inspectorContent.className = 'st-inspector-content';
    inspector.appendChild(inspectorContent);

    // Keep the .st-purpose elements inside the inspector so they are read by checks
    const purpose = document.createElement('div');
    purpose.className = 'st-purpose';
    purpose.innerHTML =
      '<div class="st-purpose-main"><span class="st-purpose-type mono">Station</span><span class="st-purpose-copy"></span></div>' +
      '<div class="st-purpose-sub"><span class="st-purpose-tab"></span><span class="st-purpose-services"></span></div>';
    inspector.appendChild(purpose);
    this._purposeEl = purpose;

    workspaceWrapper.appendChild(inspector);

    // Route-beam overlay spans the whole workspace (center stage → inspector) so a selected service
    // can draw a routing beam toward the diagnostics column. pointer-events:none; parked when hidden.
    const fxBeamLayer = document.createElement('div');
    fxBeamLayer.className = 'st-fx-beamlayer';
    fxBeamLayer.setAttribute('aria-hidden', 'true');
    workspaceWrapper.appendChild(fxBeamLayer);
    this._fxBeamLayer = fxBeamLayer;

    body.appendChild(rail);
    body.appendChild(workspaceWrapper);
    screen.appendChild(body);

    // Comms Side Panel
    const commsPanel = document.createElement('div');
    commsPanel.className = 'st-comms-panel';
    commsPanel.innerHTML = `
      <div class="st-comms-panel-head">
        <span>Comms Log</span>
        <span class="st-comms-panel-close">CLOSE [X]</span>
      </div>
      <div class="st-comms-panel-body">
        <div class="st-comms-panel-row"><span class="sender">ATCX</span> CLEARED FOR DEPARTURE.</div>
        <div class="st-comms-panel-row"><span class="sender">TRADER</span> ANYONE SELLING ORE?</div>
        <div class="st-comms-panel-row"><span class="sender">STATION</span> REMINDER: CONTRABAND SCANS ARE ACTIVE.</div>
      </div>
    `;
    screen.appendChild(commsPanel);

    commsPanel.querySelector('.st-comms-panel-close').addEventListener('click', () => {
      commsPanel.classList.remove('open');
    });

    // Comms Ticker
    const commsTicker = document.createElement('div');
    commsTicker.className = 'st-comms-ticker';
    commsTicker.innerHTML = '<span class="sender">ATCX</span> CLEARED FOR DEPARTURE. &nbsp;&nbsp;&nbsp; <span class="sender">TRADER</span> ANYONE SELLING ORE?';
    commsTicker.addEventListener('click', () => {
      commsPanel.classList.toggle('open');
    });
    screen.appendChild(commsTicker);

    // build rail buttons (one delegated listener, dynamically inject HOLD tab button next to MARKET)
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
        '<span class="st-tab-icon sf-glyph" aria-hidden="true">' + (glyphSvg(t.id) || t.icon) + '</span>' +
        '<span class="st-tab-label">' + t.label + '</span>' +
        '<span class="st-tab-service mono" aria-hidden="true"></span>';
      railFrag.appendChild(b);

      if (t.id === 'market') {
        const holdBtn = document.createElement('button');
        holdBtn.className = 'st-tab';
        holdBtn.type = 'button';
        holdBtn.id = 'st-tab-hold';
        holdBtn.setAttribute('data-tab', 'hold');
        holdBtn.setAttribute('role', 'tab');
        holdBtn.setAttribute('aria-controls', 'st-panel-hold');
        holdBtn.setAttribute('aria-selected', 'false');
        holdBtn.setAttribute('tabindex', '-1');
        holdBtn.title = 'View cargo hold manifest, capacity, and item values.';
        holdBtn.setAttribute('aria-label', 'Hold: View cargo hold manifest, capacity, and item values.');
        holdBtn.innerHTML =
          '<span class="st-tab-icon sf-glyph" aria-hidden="true">' + (glyphSvg('hold') || '■') + '</span>' +
          '<span class="st-tab-label">Hold</span>' +
          '<span class="st-tab-service mono" aria-hidden="true"></span>';
        railFrag.appendChild(holdBtn);
      }
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

    let chargeTimer = null;
    undockBtn.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || undockBtn.disabled) return;
      undockBtn.classList.remove('abort');
      undockBtn.classList.add('charging');
      ctx.bus.emit('audio:cue', { id: 'ui_charge_start' });

      chargeTimer = setTimeout(() => {
        undockBtn.classList.remove('charging');
        ctx.bus.emit('audio:cue', { id: 'ui_undock' });
        ctx.bus.emit('dock:undocked', {});
        chargeTimer = null;
      }, 600);
    });

    undockBtn.addEventListener('mouseup', () => {
      if (chargeTimer) {
        clearTimeout(chargeTimer);
        chargeTimer = null;
        undockBtn.classList.remove('charging');
        undockBtn.classList.add('abort');
        ctx.bus.emit('audio:cue', { id: 'ui_charge_abort' });
      }
    });

    undockBtn.addEventListener('mouseleave', () => {
      if (chargeTimer) {
        clearTimeout(chargeTimer);
        chargeTimer = null;
        undockBtn.classList.remove('charging');
        undockBtn.classList.add('abort');
      }
    });

    // Keep click for keyboard accessibility
    undockBtn.addEventListener('click', (e) => {
      if (e.detail === 0) { // synthetic click (e.g. keyboard Enter/Space)
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
        ctx.bus.emit('dock:undocked', {});
      }
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

    // inline Hold panel
    this._panels.hold = this._buildHoldPanel(content, ctx);

    this._el = screen;
    this._rail = rail;
    this._content = content;
    this._topbar = topbar;

    // Command-deck effects: create ONCE here, update-many via refresh, park on hide (frame-sleep
    // contract). Instances are inert until their verb fires (flicker until reveal(), ripple until
    // ping(), beam until setPath(), morph until set()), so building them now costs nothing at rest.
    this._selectedService = null;
    this._selectedMissionId = null;
    this._lastRevealStationId = null;
    this._lastEconKey = null;
    this._lastOpsStateKey = null;
    this._fx = {};
    try {
      this._fx.flicker = createFlickerGrid(this._scanLayer, { width: 300, height: 168, cell: 12, gap: 3, token: '--accent' });
      this._fx.ripple = createRippleField(this._fxOverlay, { width: 300, height: 200 });
      this._fx.beam = createRouteBeam(this._fxBeamLayer, { width: 760, height: 420 });
      this._fx.morph = createMorphLabel(this._econMorphMount, { numeric: false });
      this._fx.dock = createDockRail(this._nodesPane, { onSelect: (svc) => this._selectService(svc) });
      // Operations board (Missions tab) instrument effects — mounted into the create-once scaffold
      // from _buildMissionsPanel; all park with the rest of this._fx via _setEffectsActive.
      const mEls = this._missionEls;
      if (mEls) {
        this._fx.mBeam = createRouteBeam(mEls.beamMount, { width: 320, height: 96 });
        this._fx.mPing = createRippleField(mEls.pingMount, { width: 320, height: 96 });
        this._fx.mState = createMorphLabel(mEls.stateMount, { numeric: false });
        this._fx.mRisk = createCircularGauge(mEls.gRiskMount, { size: 46, stroke: 5 });
        this._fx.mFuel = createCircularGauge(mEls.gFuelMount, { size: 46, stroke: 5 });
        this._fx.mCargo = createCircularGauge(mEls.gCargoMount, { size: 46, stroke: 5 });
      }
    } catch (e) { console.error('[stationHub] effect init failed', e); }

    rootEl.appendChild(screen);

    this._subscribe();
    return screen;
  },

  _buildHoldPanel(content, ctx) {
    const el = document.createElement('div');
    el.className = 'st-tabpanel st-panel st-hold';
    el.id = 'st-panel-hold';
    el.setAttribute('role', 'tabpanel');
    el.setAttribute('aria-labelledby', 'st-tab-hold');
    el.setAttribute('tabindex', '0');
    el.style.display = 'none';

    content.appendChild(el);

    const refresh = () => {
      const state = ctx.state;
      const cargo = state && state.player && state.player.cargo || {};
      const cap = Number(cargo.capVolume) || 40;
      const used = Number(cargo.usedVolume) || 0;
      const free = Math.max(0, cap - used);
      const percent = Math.round((used / cap) * 100);

      let html = `
        <div class="st-sub-h">Cargo Hold Manifest</div>
        <div class="st-hold-header">
          <div class="st-hold-meter-label mono">HOLD STORAGE: ${used}/${cap} units (${percent}%)</div>
          <div class="st-hold-meter">
            <div class="st-hold-meter-fill" style="width: ${percent}%"></div>
          </div>
        </div>
      `;

      const items = cargo.items || {};
      const list = Object.entries(items).filter(([id, qty]) => Number(qty) > 0);

      if (list.length === 0) {
        html += `<div class="st-empty">Cargo hold is currently empty.</div>`;
      } else {
        html += `
          <div class="st-hold-grid">
            <div class="st-row st-row-head">
              <span>Commodity</span>
              <span class="c-num">Qty</span>
              <span class="c-num">Vol</span>
              <span class="c-num">Local Price</span>
              <span></span>
            </div>
        `;

        const getMarketMemoryForStation = (s, stationId, cmdtyId) => {
          const markets = s.economy && s.economy.markets;
          const m = markets && markets[stationId];
          return (m && m[cmdtyId]) || null;
        };

        for (const [id, qty] of list) {
          const com = COMMODITY_BY_ID.get(id) || { name: prettyId(id), volume: 1 };
          const vol = (com.volume || 1) * qty;

          const stn = this._stationDef();
          const marketData = stn ? getMarketMemoryForStation(state, stn.id, id) : null;
          const priceText = marketData ? `${marketData.sell} cr` : 'no memory';

          html += `
            <div class="st-row">
              <span style="font-weight:700; color:#fff;">${com.name}</span>
              <span class="c-num">${qty}</span>
              <span class="c-num">${vol}</span>
              <span class="c-num">${priceText}</span>
              <span class="c-act">
                <button type="button" class="st-sell-btn" data-sell-cmdty="${id}" style="padding: 2px 8px; font-size:0.7rem;">Sell One</button>
              </span>
            </div>
          `;
        }

        html += `</div>`;
      }

      el.innerHTML = html;

      el.querySelectorAll('[data-sell-cmdty]').forEach(btn => {
        btn.addEventListener('click', () => {
          const cmdtyId = btn.getAttribute('data-sell-cmdty');
          ctx.bus.emit('ui:trade', {
            stationId: this._stationId,
            commodityId: cmdtyId,
            qty: -1,
          });
          ctx.bus.emit('audio:cue', { id: 'ui_click' });
        });
      });
    };

    return {
      el,
      onShow() { refresh(); },
      refresh,
    };
  },

  _playArrivalBroadcast() {
    const stn = this._stationDef();
    if (!stn || !stn.type) return;
    const def = STATION_BROADCASTS[stn.type];
    if (!def || !def.lines.length) return;

    const text = def.lines[0];
    const bus = this._ctx && this._ctx.bus;
    const helpers = this._ctx && this._ctx.helpers;

    if (helpers && helpers.voice && typeof helpers.voice.say === 'function') {
      helpers.voice.say({
        channel: 'news',
        text: `[STATION ANNOUNCEMENT] ${text}`,
        kind: 'info',
        factionId: stn.factionId || null,
        priority: 30,
        ttl: 6,
      });
    } else if (bus && typeof bus.emit === 'function') {
      bus.emit('toast', {
        text: `[STATION ANNOUNCEMENT] ${text}`,
        kind: 'info',
        ttl: 6,
      });
    }
  },

  _triggerArrivalEdgeTrace() {
    if (typeof document === 'undefined' || !this._el) return;
    this._el.classList.remove('trace-active');
    void this._el.offsetWidth;
    this._el.classList.add('trace-active');
  },

  _refreshSchematicAndNodes() {
    if (typeof document === 'undefined' || !this._schematicPane || !this._nodesPane) return;
    const stn = this._stationDef();
    if (!stn) return;

    this._schematicPane.innerHTML = stationSchematicSvg(stn.type);

    // Service Dock: the canonical berth services, each ONLINE (offered here) or OFFLINE. Built via the
    // dockRail effect (create-once, update-many) so hover/focus magnify + readiness badges are shared
    // with the rest of the command deck. Selecting a node routes through the inspector, not the tab.
    if (this._fx && this._fx.dock) {
      this._fx.dock.setItems(this._berthServiceItems(stn));
      if (this._selectedService) this._fx.dock.setFocus(this._selectedService);
    }
  },

  /** Build the Service Dock item list for the current station (offered/offline + live readiness). */
  _berthServiceItems(stn) {
    const state = this._ctx && this._ctx.state;
    const offered = new Set(Array.isArray(stn.services) ? stn.services : []);
    return CANONICAL_BERTH_SERVICES.map((svc) => ({
      id: svc,
      label: stationServiceLabel(svc),
      icon: SERVICE_ICON[svc] || '●',
      readiness: berthServiceReadiness(svc, offered.has(svc), state),
    }));
  },

  _serviceOffered(svc) {
    const stn = this._stationDef();
    return !!(stn && Array.isArray(stn.services) && stn.services.includes(svc));
  },

  /** A Service Dock node was chosen: focus the inspector on it, ping it, and beam it to diagnostics.
   *  Select ≠ open — the bottom command strip's "Open" action switches the section panel. */
  _selectService(svc) {
    if (!svc) return;
    this._selectedService = svc;
    if (this._fx && this._fx.dock) this._fx.dock.setFocus(svc);
    if (this._visible()) {
      this._pingServiceNode(svc);
      this._plotServiceBeam(svc);
    }
    this._updateInspector();
    if (typeof this._updateCommandStrip === 'function') this._updateCommandStrip();
    if (this._ctx && this._ctx.bus) this._ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  },

  /** One ripple from the selected node (one event = one ripple; never on hover or a timer). */
  _pingServiceNode(svc) {
    const fx = this._fx;
    if (!fx || !fx.ripple || !this._fxOverlay || !this._nodesPane) return;
    const btn = this._nodesPane.querySelector('[data-service="' + svc + '"]');
    if (!btn) return;
    const oRect = this._fxOverlay.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    if (!(oRect.width > 0) || !(bRect.width > 0)) return;
    fx.ripple.resize(oRect.width, oRect.height);
    fx.ripple.ping(bRect.left + bRect.width / 2 - oRect.left, bRect.top + bRect.height / 2 - oRect.top,
      { kind: this._serviceOffered(svc) ? 'good' : 'danger' });
  },

  /** Plot the route beam from the selected node to the diagnostics inspector (flows only if offered). */
  _plotServiceBeam(svc) {
    const fx = this._fx;
    if (!fx || !fx.beam || !this._fxBeamLayer || !this._nodesPane || !this._el) return;
    const layer = this._fxBeamLayer.getBoundingClientRect();
    const btn = this._nodesPane.querySelector('[data-service="' + svc + '"]');
    const inspector = this._el.querySelector('.st-inspector');
    if (!btn || !inspector || !(layer.width > 0)) return;
    const b = btn.getBoundingClientRect();
    const i = inspector.getBoundingClientRect();
    if (!(b.width > 0) || !(i.width > 0)) return;
    fx.beam.resize(layer.width, layer.height);
    const from = { x: b.left + b.width / 2 - layer.left, y: b.top + b.height / 2 - layer.top };
    const to = { x: i.left - layer.left + 8, y: i.top - layer.top + 26 };
    const offered = this._serviceOffered(svc);
    fx.beam.setPath([from, { x: (from.x + to.x) / 2, y: from.y }, to],
      { active: offered, kind: offered ? 'route' : 'warn' });
  },

  /** Bounded scanner-grid "console acquisition" sweep — fires only on a genuine dock transition. */
  _revealScan() {
    const fx = this._fx && this._fx.flicker;
    if (!fx || !this._scanLayer) return;
    const r = this._scanLayer.getBoundingClientRect();
    if (r.width > 4 && r.height > 4) fx.resize(r.width, r.height);
    fx.reveal({ resolveTo: (c, row, cols, rows) => {
      const dx = (c + 0.5) / cols - 0.5;
      const dy = (row + 0.5) / rows - 0.5;
      return clamp01(1 - Math.sqrt(dx * dx + dy * dy) * 1.7);
    } });
  },

  /** Start/stop every command-deck effect. setActive(false) MUST park all rAF (frame-sleep contract);
   *  idempotent and tolerant of being called mid-reveal or twice. */
  _setEffectsActive(on) {
    if (!this._fx) return;
    for (const k in this._fx) {
      const f = this._fx[k];
      if (f && typeof f.setActive === 'function') {
        try { f.setActive(!!on); } catch (e) { /* effect teardown is best-effort */ }
      }
    }
  },

  _refreshEconAndReadiness() {
    if (typeof document === 'undefined' || !this._econBadge || !this._readinessSummary) return;
    const stn = this._stationDef();
    if (!stn) return;

    const state = this._ctx.state;

    const stripe = this._el.querySelector('.st-faction-stripe');
    if (stripe) {
      const color = factionColorOf(stn.factionId);
      stripe.style.background = `linear-gradient(90deg, ${color}, transparent)`;
    }

    const activeEvents = state.economy && state.economy.econEvents || [];
    const affected = activeEvents.filter(e => e.stationId === stn.id);
    // Station state/event readout morphs on CHANGE only (the key omits the live countdown so the morph
    // does not re-fire every refresh tick — only when the event itself starts, ends, or swaps).
    let econText;
    let econKey;
    if (affected.length > 0) {
      const e = affected[0];
      econText = '⚠ ' + String(e.type || 'event').replace(/_/g, ' ').toUpperCase() + ' ACTIVE';
      econKey = 'alert:' + e.type;
      this._econBadge.className = 'st-econ-badge active mono';
    } else {
      econText = 'STATUS NOMINAL · MARKET ACTIVE';
      econKey = 'nominal';
      this._econBadge.className = 'st-econ-badge nominal mono';
    }
    if (this._fx && this._fx.morph) {
      if (econKey !== this._lastEconKey) { this._fx.morph.set(econText); this._lastEconKey = econKey; }
    } else if (this._econMorphMount) {
      this._econMorphMount.textContent = econText;
    }

    const chips = departureReadinessChips(state);
    const summary = departureReadinessSummary(chips);
    this._readinessSummary.className = `st-readiness-summary st-readiness--${summary.state} mono`;
    this._readinessSummary.innerHTML = `DEPARTURE SYSTEM: ${summary.status}`;
  },

  _updateInspector() {
    if (typeof document === 'undefined' || !this._el) return;
    const inspectorEl = this._el.querySelector('.st-inspector-content');
    if (!inspectorEl) return;

    const stn = this._stationDef();
    if (!stn) {
      inspectorEl.innerHTML = `<div class="st-inspector-empty">Offline</div>`;
      return;
    }

    const state = this._ctx.state;
    // Dual focus: a chosen Service Dock node describes THAT service (offered/offline + route hint);
    // otherwise the inspector follows the active section tab.
    const sel = this._selectedService;
    const usingService = !!(sel && SERVICE_LABELS[sel]);
    const tabId = usingService ? tabForService(sel) : this._activePanelId();
    const tab = TABS.find((t) => t.id === tabId) || { id: 'hold', label: 'HOLD', icon: '■', help: 'View cargo hold manifest, capacity, and item values.' };
    const tabStatus = stationTabServiceStatus(tabId, stn);
    const offered = usingService ? this._serviceOffered(sel) : tabStatus.offered;
    const headKind = usingService ? 'Selected Service' : 'Selected Subsystem';
    const headIcon = usingService ? escapeHtml(SERVICE_ICON[sel] || '●') : (glyphSvg(tabId) || tab.icon);
    const headName = usingService ? escapeHtml(stationServiceLabel(sel).toUpperCase()) : tab.label;
    const headDesc = usingService ? escapeHtml(berthServiceDesc(sel)) : tab.help;
    const availLabel = usingService ? (offered ? 'ONLINE' : 'OFFLINE') : tabStatus.label.toUpperCase();
    const availState = usingService ? (offered ? 'available' : 'unavailable') : tabStatus.state;

    const fid = stn.factionId;
    const factionMeta = fid ? FACTION_BY_ID.get(fid) : null;
    const factionName = factionNameOf(fid);
    const factionColor = factionColorOf(fid);

    let rep = 0;
    if (fid && state.factions && state.factions[fid]) {
      rep = state.factions[fid].rep;
    } else if (fid && NEW_GAME.factionRep && typeof NEW_GAME.factionRep[fid] === 'number') {
      rep = NEW_GAME.factionRep[fid];
    }
    const tier = tierFor(rep);
    const guidance = factionStandingGuidance(rep, factionMeta || { id: fid }, state.factions && state.factions[fid] && state.factions[fid].lastDelta);

    const risks = STATION_RISKS[stn.type] || 'Standard industrial dock safety parameters apply.';

    let html = `
      <div class="st-ins-section">
        <div class="st-ins-title">${headKind}</div>
        <div class="st-ins-tab-header">
          <span class="st-ins-tab-icon">${headIcon}</span>
          <span class="st-ins-tab-name">${headName}</span>
        </div>
        <div class="st-ins-desc">${headDesc}</div>
      </div>

      <div class="st-ins-section">
        <div class="st-ins-title">Service Status</div>
        <div class="st-ins-row">
          <span>Availability</span>
          <span class="st-ins-row-val st-ins-status--${availState}">${availLabel}</span>
        </div>
    `;

    if (!offered) {
      if (usingService) {
        const near = nearestStationOffering(sel, stn.id);
        html += `<div class="st-ins-hint">⚠️ Not offered at ${escapeHtml(stn.name || 'this berth')}.</div>`;
        html += near
          ? `<div class="st-ins-row-detail">Route: nearest ${escapeHtml(stationServiceLabel(sel))} at ${escapeHtml(near.name)} · ${escapeHtml(near.sector)}.</div>`
          : `<div class="st-ins-row-detail">No known ${escapeHtml(stationServiceLabel(sel))} on your charts yet.</div>`;
      } else {
        const rule = TAB_SERVICE_RULES[tabId];
        const hint = rule ? rule.unavailableHint : 'Service unavailable at this facility.';
        html += `<div class="st-ins-hint">⚠️ ${hint}</div>`;
      }
    }

    html += `
      </div>

      <div class="st-ins-section">
        <div class="st-ins-title">Faction Standing</div>
        <div class="st-ins-row">
          <span>Authority</span>
          <span class="st-ins-row-val" style="color:${factionColor}">${factionName}</span>
        </div>
        <div class="st-ins-row">
          <span>Standing</span>
          <span class="st-ins-row-val">${tier.name} (${rep > 0 ? '+' : ''}${rep})</span>
        </div>
        <div class="st-ins-row-detail">${guidance.next}</div>
        <div class="st-ins-row-detail" style="margin-top: 4px; font-style: italic;">Plan: ${guidance.plan}</div>
      </div>

      <div class="st-ins-section">
        <div class="st-ins-title">Local Station Risks</div>
        <div class="st-ins-risk-desc">${risks}</div>
      </div>
    `;

    inspectorEl.innerHTML = html;
  },

  /** Operations contract board (state.missions.boards[stationId]). The left rail is a set of compact
   *  contract selectors; picking one drives the CENTER preflight instrument (route beam + destination
   *  ping + risk/fuel/hold ring gauges + broker comms slate + morph contract state + full preflight
   *  and consequence readouts). Accept emits ui:acceptMission; the accepted receipt plots the route. */
  _buildMissionsPanel(content, ctx) {
    const panel = document.createElement('div');
    panel.className = 'st-tabpanel st-panel st-missions';
    panel.id = 'st-panel-missions';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'st-tab-missions');
    panel.setAttribute('tabindex', '0');
    panel.style.display = 'none';
    const gauge = (key, label) =>
      '<div class="st-ops-gauge st-ops-gauge--' + key + '">' +
        '<div class="st-ops-gauge-mount" data-g="' + key + '"></div>' +
        '<div class="st-ops-gauge-meta">' +
          '<div class="st-ops-gauge-val" data-g="' + key + '">-</div>' +
          '<div class="st-ops-gauge-label mono">' + label + '</div>' +
        '</div>' +
      '</div>';
    panel.innerHTML =
      '<div class="st-sub-h">Operations Board</div>' +
      '<div class="st-mission-guide">Pick a contract to preflight its route, risk, cargo, fuel, and consequences before accepting. Accepting adds it to the Mission Log (' + BINDINGS.missionLog.label + '), auto-tracks it, and sets nav guidance. Rewards fund hulls, modules, repairs, and fuel.</div>' +
      '<div class="st-mission-recommend" hidden></div>' +
      '<div class="st-mission-accepted" hidden></div>' +
      '<div class="st-ops">' +
        '<div class="st-ops-rail">' +
          '<div class="st-ops-rail-h mono">Contracts</div>' +
          '<div class="st-mission-list"></div>' +
        '</div>' +
        '<div class="st-ops-center" data-centerpiece="contract-route-board">' +
          '<div class="st-ops-empty">No contract selected. Pick one from the left to run its route preflight.</div>' +
          '<div class="st-ops-dossier" hidden>' +
            '<div class="st-ops-head">' +
              '<div class="st-ops-head-copy">' +
                '<div class="st-ops-eyebrow mono">CONTRACT PREFLIGHT</div>' +
                '<div class="st-ops-title"></div>' +
              '</div>' +
              '<div class="st-ops-state"></div>' +
            '</div>' +
            '<div class="st-ops-route">' +
              '<div class="st-ops-beam"></div>' +
              '<div class="st-ops-ping"></div>' +
              '<div class="st-ops-node st-ops-node--origin"><span class="st-ops-node-tag mono">ORIGIN</span><span class="st-ops-node-name"></span></div>' +
              '<div class="st-ops-node st-ops-node--dest"><span class="st-ops-node-tag mono">DESTINATION</span><span class="st-ops-node-name"></span></div>' +
            '</div>' +
            '<div class="st-ops-gauges">' + gauge('risk', 'Risk') + gauge('fuel', 'Fuel') + gauge('cargo', 'Hold') + '</div>' +
            '<div class="st-ops-comms">' +
              '<div class="st-ops-comms-head"><span class="st-ops-comms-from"></span><span class="st-ops-comms-tag mono">&#9650; INCOMING</span></div>' +
              '<div class="st-ops-comms-msg"></div>' +
            '</div>' +
            '<div class="st-mission-preflight st-ops-preflight"></div>' +
            '<div class="st-ops-standing"></div>' +
            '<div class="st-mission-preflight-warn st-ops-warn" hidden></div>' +
            '<div class="st-mission-consequences st-ops-consequences"></div>' +
            '<div class="st-ops-actions"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    const status = panel.querySelector('.st-mission-accepted');
    const recommend = panel.querySelector('.st-mission-recommend');
    const list = panel.querySelector('.st-mission-list');
    const center = panel.querySelector('.st-ops-center');
    const handleMissionAction = (ev) => {
      const actionEl = ev.target.closest('[data-act]');
      // A click on the card body (not a control) selects the contract → drives the center preflight.
      if (!actionEl) {
        const card = ev.target.closest('.st-mission-card');
        if (card && card.getAttribute('data-mid')) {
          this._selectContract(card.getAttribute('data-mid'));
          ctx.bus.emit('audio:cue', { id: 'ui_tab' });
        }
        return;
      }
      const missionId = actionEl.getAttribute('data-mid');
      const act = actionEl.getAttribute('data-act');
      if (act === 'accept') {
        if (missionId) this._selectContract(missionId);
        ctx.bus.emit('ui:acceptMission', { missionId });
      } else if (act === 'plotRoute') {
        this._plotContractRoute(missionId);
      }
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
    };
    list.addEventListener('click', handleMissionAction);
    recommend.addEventListener('click', handleMissionAction);
    center.addEventListener('click', handleMissionAction);
    status.addEventListener('click', handleMissionAction);
    content.appendChild(panel);
    this._missionEls = {
      panel, list, status, recommend, center,
      empty: panel.querySelector('.st-ops-empty'),
      dossier: panel.querySelector('.st-ops-dossier'),
      title: panel.querySelector('.st-ops-title'),
      stateMount: panel.querySelector('.st-ops-state'),
      route: panel.querySelector('.st-ops-route'),
      beamMount: panel.querySelector('.st-ops-beam'),
      pingMount: panel.querySelector('.st-ops-ping'),
      originName: panel.querySelector('.st-ops-node--origin .st-ops-node-name'),
      destName: panel.querySelector('.st-ops-node--dest .st-ops-node-name'),
      gRiskMount: panel.querySelector('.st-ops-gauge-mount[data-g="risk"]'),
      gFuelMount: panel.querySelector('.st-ops-gauge-mount[data-g="fuel"]'),
      gCargoMount: panel.querySelector('.st-ops-gauge-mount[data-g="cargo"]'),
      gRiskVal: panel.querySelector('.st-ops-gauge-val[data-g="risk"]'),
      gFuelVal: panel.querySelector('.st-ops-gauge-val[data-g="fuel"]'),
      gCargoVal: panel.querySelector('.st-ops-gauge-val[data-g="cargo"]'),
      commsFrom: panel.querySelector('.st-ops-comms-from'),
      commsMsg: panel.querySelector('.st-ops-comms-msg'),
      preflight: panel.querySelector('.st-ops-preflight'),
      standing: panel.querySelector('.st-ops-standing'),
      warn: panel.querySelector('.st-ops-warn'),
      consequences: panel.querySelector('.st-ops-consequences'),
      actions: panel.querySelector('.st-ops-actions'),
    };
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
    // One clean contract receipt: the singular confirmation the accept produces. A one-shot border
    // trace marks it as freshly printed (the sanctioned state-change motion, not a rest animation).
    status.innerHTML =
      '<div class="st-mission-accepted-label mono">ACCEPTED + TRACKED</div>' +
      '<div class="st-mission-accepted-title">' + escapeHtml(mission.title || prettyType(mission.type)) + '</div>' +
      '<div class="st-mission-accepted-next">' + escapeHtml(routeLine) + '</div>' +
      '<div class="st-mission-accepted-log mono">Mission Log (' + BINDINGS.missionLog.label + ') now carries the route, timer, and progress. Undock when Departure Check is green.</div>' +
      '<div class="st-mission-accepted-actions">' +
        '<button class="st-ops-btn st-ops-btn--plot" data-act="plotRoute" data-mid="' + escapeHtml(String(mission.id)) + '" ' +
          'title="Open the map and ping this contract\'s destination" aria-label="Plot route and ping destination for ' + escapeHtml(mission.title || prettyType(mission.type)) + '">Plot Route</button>' +
      '</div>';
    // One-shot "freshly printed" edge sweep marking the receipt as new (state-change motion only).
    status.classList.remove('trace-run');
    void status.offsetWidth;
    status.classList.add('trace-run');
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
      this._selectedMissionId = null;
      this._refreshOpsCenter();
      return;
    }
    // Resolve the selected contract BEFORE rendering so the correct card carries `.selected`: keep the
    // current pick if still posted, else follow the recommendation, else the first contract.
    const slotIds = slots.map((s) => String(s && (s.id != null ? s.id : s.missionId)));
    if (this._selectedMissionId == null || !slotIds.includes(String(this._selectedMissionId))) {
      this._selectedMissionId = (recommendation && recommendation.missionId != null)
        ? String(recommendation.missionId) : (slotIds[0] || null);
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
      const cargoNeed = missionCargoFootprint(m);
      const unmet = m.requirementUnmet || m.lockedReason || preflight.blocker || null;
      const expires = m.expiresInS != null ? m.expiresInS : m.time_limit_s;
      const acceptTitle = unmet
        ? 'Cannot accept: ' + unmet
        : 'Accept, auto-track, and add ' + (m.title || prettyType(m.type)) + ' to Mission Log.';
      // Compact selector row: risk + reward + faction rep + cargo + timer at a glance (brief WORK 1).
      const cslot =
        '<span class="st-mission-chip st-mission-chip--r' + risk + '">R' + risk + '</span>' +
        '<span class="st-mission-chip st-mission-chip--cr">+' + (consequences.reward || 0).toLocaleString('en-US') + ' cr</span>' +
        (consequences.repReward ? '<span class="st-mission-chip st-mission-chip--rep">' + (fac ? escapeHtml(fac.short || fac.name) + ' ' : '') + '+' + consequences.repReward + ' rep</span>' : '') +
        (cargoNeed.volume > 0 ? '<span class="st-mission-chip st-mission-chip--hold">' + fmtHoldUnits(cargoNeed.volume) + 'u hold</span>' : '') +
        (expires != null ? '<span class="st-mission-chip st-mission-chip--time">' + fmtTime(expires) + '</span>' : '');
      const card = document.createElement('div');
      const recommended = recommendation && recommendation.missionId === mid;
      const selected = this._selectedMissionId != null && String(this._selectedMissionId) === String(mid);
      card.className = 'st-mission-card' +
        (tracked && tracked === mid ? ' tracked' : '') +
        (selected ? ' selected' : '') +
        (recommended ? ' recommended recommended--' + recommendation.kind : '');
      card.setAttribute('data-mid', String(mid));
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
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
        '<div class="st-mission-cslot">' + cslot + '</div>' +
        '<div class="st-mission-next">' + escapeHtml(missionNextStepText(m)) + '</div>' +
        '<div class="st-mission-btns">' +
          '<button data-act="accept" data-mid="' + escapeHtml(mid) + '"' + (unmet ? ' disabled' : '') +
            ' title="' + escapeHtml(acceptTitle) + '" aria-label="' + escapeHtml(acceptTitle) + '">Accept + Track</button>' +
          (unmet ? '<span class="st-mission-unmet">' + escapeHtml(unmet) + '</span>' : '') +
        '</div>';
      frag.appendChild(card);
    }
    list.appendChild(frag);
    // Drive the center preflight instrument for the selected contract.
    this._refreshOpsCenter();
  },

  /** Pick a contract from the rail → drive the center preflight instrument and ping its destination.
   *  Selection is an instance property (never gameState) so it stays out of the save schema. */
  _selectContract(missionId) {
    if (missionId == null || missionId === '') return;
    this._selectedMissionId = String(missionId);
    if (this._missionEls && this._missionEls.list) {
      this._missionEls.list.querySelectorAll('.st-mission-card').forEach((c) => {
        c.classList.toggle('selected', c.getAttribute('data-mid') === this._selectedMissionId);
      });
    }
    this._refreshOpsCenter();
    this._pingContractDest('nav'); // one ripple per discrete selection event (never on a refresh tick)
  },

  /** The center preflight instrument for the selected contract: route beam + destination nodes, the
   *  risk / fuel / hold ring gauges, the broker comms slate, the morph contract-state readout, and the
   *  full preflight + consequence detail. Effects are updated by verb — the scaffold is never rebuilt. */
  _refreshOpsCenter() {
    const els = this._missionEls;
    if (!els || !els.center) return;
    const ctx = this._ctx;
    const board = ctx.state.missions && ctx.state.missions.boards && ctx.state.missions.boards[this._stationId];
    const slots = (board && board.slots) || [];
    const m = this._selectedMissionId != null
      ? slots.find((s) => String(s && (s.id != null ? s.id : s.missionId)) === String(this._selectedMissionId))
      : null;
    if (!m) {
      els.empty.hidden = false;
      els.dossier.hidden = true;
      this._lastOpsStateKey = null;
      return;
    }
    els.empty.hidden = true;
    els.dossier.hidden = false;

    const preflight = missionPreflight(m, ctx.state);
    const readiness = missionBoardReadiness(preflight);
    const consequences = missionConsequenceSummary(m);
    const standing = missionStandingRequirement(m, ctx.state);
    const risk = missionRiskTier(m);
    const mid = String(m.id != null ? m.id : m.missionId);
    const unmet = m.requirementUnmet || m.lockedReason || preflight.blocker || null;

    els.title.textContent = m.title || prettyType(m.type);

    // Contract state morph — fires ONLY when the state label changes (never per refresh tick).
    const stateLabel = unmet ? 'BLOCKED'
      : readiness.state === 'ready' ? 'READY TO ACCEPT'
        : readiness.state === 'caution' ? 'CHECK PREP' : 'OFFERED';
    els.stateMount.setAttribute('data-kind', readiness.kind);
    const stateKey = mid + ':' + stateLabel;
    if (this._fx && this._fx.mState && this._lastOpsStateKey !== stateKey) {
      this._fx.mState.set(stateLabel);
      this._lastOpsStateKey = stateKey;
    }

    this._refreshOpsRoute(m);
    this._refreshOpsGauges(m, risk);

    // Broker comms slate — the contact and their message (mission-as-conversation).
    els.commsFrom.textContent = missionClientName(m) + ' · ' + prettyType(m.type);
    els.commsMsg.textContent = missionBriefText(m) + ' ' + missionValueText(m);

    // Full preflight chips + standing + non-blocking warning + consequence stakes — every part of the
    // centerpiece contract (route, risk, cargo, fuel, consequences) visible before accept.
    els.preflight.innerHTML = preflight.chips.map((chip) =>
      '<span class="st-mission-preflight-chip st-mission-preflight-chip--' + chip.kind + '">' + escapeHtml(chip.text) + '</span>').join('');
    els.standing.innerHTML = standing
      ? '<div class="st-mission-standing st-mission-standing--' + (standing.ok ? 'ok' : 'locked') + '">' +
          '<span class="mono">' + escapeHtml(standing.ok ? 'Standing ready' : 'Standing locked') + '</span>' +
          '<span>' + escapeHtml(standing.gateName + ': ' + standing.faction + ' ' + signedRep(standing.currentRep) +
            ' / needs ' + signedRep(standing.minRep)) + '</span>' +
        '</div>'
      : '';
    if (preflight.warning) { els.warn.hidden = false; els.warn.textContent = preflight.warning; }
    else { els.warn.hidden = true; els.warn.textContent = ''; }
    els.consequences.innerHTML = consequences.chips.map((chip) =>
      '<span class="st-mission-consequence st-mission-consequence--' + chip.kind + '"><b>' + escapeHtml(chip.label) + '</b> ' + escapeHtml(chip.text) + '</span>').join('');

    const acceptTitle = unmet ? 'Cannot accept: ' + unmet
      : 'Accept, auto-track, and add ' + (m.title || prettyType(m.type)) + ' to Mission Log.';
    els.actions.innerHTML =
      '<button class="st-ops-btn st-ops-btn--accept" data-act="accept" data-mid="' + escapeHtml(mid) + '"' + (unmet ? ' disabled' : '') +
        ' title="' + escapeHtml(acceptTitle) + '" aria-label="' + escapeHtml(acceptTitle) + '">Accept + Track</button>' +
      '<button class="st-ops-btn st-ops-btn--plot" data-act="plotRoute" data-mid="' + escapeHtml(mid) + '" ' +
        'title="Ping the destination and preview the route" aria-label="Preview route and ping destination for ' + escapeHtml(m.title || prettyType(m.type)) + '">Plot Route</button>' +
      (unmet ? '<span class="st-mission-unmet">' + escapeHtml(unmet) + '</span>' : '');
  },

  /** Draw the contract route lane (origin → destination) with the route beam, colour it by route risk,
   *  and set the node labels. Beam needs real pixel size, so plot only when the Missions tab is visible
   *  and laid out (getBoundingClientRect is 0 while display:none). */
  _refreshOpsRoute(m) {
    const els = this._missionEls;
    if (!els || !els.route) return;
    const origin = this._stationDef();
    els.originName.textContent = (origin && origin.name) || 'Current dock';
    els.destName.textContent = missionDestName(m);
    const intel = missionRouteIntel(m, this._ctx.state);
    const danger = intel ? (Number(intel.danger) || 0) : 0;
    const kind = danger >= 0.84 ? 'danger' : danger >= 0.72 ? 'warn' : 'route';
    els.route.setAttribute('data-kind', kind);
    if (!this._visible() || this._activePanelId() !== 'missions') return;
    const r = els.route.getBoundingClientRect();
    if (!(r.width > 8) || !(r.height > 8)) return;
    const W = r.width, H = r.height;
    const from = { x: W * 0.14, y: H * 0.5 };
    const to = { x: W * 0.86, y: H * 0.5 };
    if (this._fx && this._fx.mBeam) {
      this._fx.mBeam.resize(W, H);
      this._fx.mBeam.setPath([from, { x: (from.x + to.x) / 2, y: from.y }, to], { active: true, kind });
    }
  },

  /** The three preflight ring gauges: contract risk tier, fuel readiness, and hold readiness. */
  _refreshOpsGauges(m, risk) {
    const els = this._missionEls;
    if (!els) return;
    const state = this._ctx.state;
    const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
    // Risk ring fills toward the danger tiers.
    const riskV = clamp(risk / 4);
    const riskKind = risk >= 3 ? 'danger' : risk >= 2 ? 'warn' : 'good';
    if (this._fx && this._fx.mRisk) this._fx.mRisk.setValue(riskV, { kind: riskKind, label: 'Risk tier ' + risk + ' of 4' });
    if (els.gRiskVal) els.gRiskVal.textContent = 'R' + risk;
    // Fuel readiness: current fuel fraction.
    const fuel = state.fuel || {};
    const fMax = Number(fuel.max) || 0;
    const fFrac = fMax > 0 ? clamp((Number(fuel.current) || 0) / fMax) : null;
    const fuelKind = fFrac == null ? 'info' : (fFrac < 0.25 ? 'danger' : fFrac < 0.45 ? 'warn' : 'good');
    if (this._fx && this._fx.mFuel) this._fx.mFuel.setValue(fFrac == null ? 0 : fFrac, { kind: fuelKind, label: fFrac == null ? 'Fuel level unknown' : 'Fuel ' + Math.round(fFrac * 100) + '%' });
    if (els.gFuelVal) els.gFuelVal.textContent = fFrac == null ? '—' : Math.round(fFrac * 100) + '%';
    // Hold readiness: projected fill after loading contract cargo, else current hold fill.
    const cargo = (state.player && state.player.cargo) || {};
    const cap = Number(cargo.capVolume) || 0;
    const used = Number(cargo.usedVolume) || 0;
    const need = missionCargoFootprint(m).volume;
    let holdV, holdKind, holdTxt;
    if (need > 0) {
      holdV = cap > 0 ? clamp((used + need) / cap) : 1;
      holdKind = cap < need ? 'danger' : (cap - used >= need ? 'good' : 'warn');
      holdTxt = fmtHoldUnits(need) + 'u';
    } else {
      holdV = cap > 0 ? clamp(used / cap) : 0;
      holdKind = 'info';
      holdTxt = cap > 0 ? Math.round((used / cap) * 100) + '%' : '—';
    }
    if (this._fx && this._fx.mCargo) this._fx.mCargo.setValue(holdV, { kind: holdKind, label: 'Hold readiness' });
    if (els.gCargoVal) els.gCargoVal.textContent = holdTxt;
  },

  /** One ripple at the destination node (the 'destination ping' — one discrete event, never a timer). */
  _pingContractDest(kind) {
    const els = this._missionEls;
    const fx = this._fx;
    if (!els || !els.route || !fx || !fx.mPing) return;
    if (!this._visible() || this._activePanelId() !== 'missions') return;
    const r = els.route.getBoundingClientRect();
    if (!(r.width > 8) || !(r.height > 8)) return;
    fx.mPing.resize(r.width, r.height);
    fx.mPing.ping(r.width * 0.86, r.height * 0.5, { kind: kind || 'nav' });
  },

  /** Plot Route: select + ping the destination, and — once the contract is accepted/tracked — open the
   *  Local or Star Map for its waypoint (same local-vs-jump split the Mission Log uses). */
  _plotContractRoute(missionId) {
    if (missionId != null) this._selectContract(missionId);
    const ctx = this._ctx;
    const state = ctx.state;
    const active = (state.missions && state.missions.active) || [];
    const tracked = state.ui && state.ui.trackedMissionId;
    const mission = active.find((mm) => mm && String(mm.id) === String(missionId) && mm.status === 'active');
    if (mission && String(tracked) === String(missionId)) {
      const wp = state.nav && state.nav.waypoint;
      const cur = state.world && state.world.currentSectorId;
      const local = !!(wp && (wp.pos || (wp.sectorId && cur && wp.sectorId === cur)));
      ctx.bus.emit('ui:pushScreen', { id: local ? 'localmap' : 'starmap' });
      return;
    }
    const board = state.missions && state.missions.boards && state.missions.boards[this._stationId];
    const offer = board && board.slots && board.slots.find((s) => String(s && (s.id != null ? s.id : s.missionId)) === String(missionId));
    ctx.bus.emit('toast', { text: 'Accept this contract to plot its nav route' + (offer ? ' to ' + missionDestName(offer) : '') + '.', kind: 'info', ttl: 3 });
  },

  /** Activate a tab: toggle rail highlight + panel visibility, persist ui.activeStationTab. */
  setTab(tabId, options = {}) {
    if (!TABS.some((t) => t.id === tabId) && tabId !== 'hold') tabId = 'market';
    // Navigating a section clears the Service Dock selection so the inspector follows the tab again,
    // and retracts the route beam that pointed at the previously selected service.
    this._selectedService = null;
    if (this._fx && this._fx.beam) this._fx.beam.setPath([], { active: false });
    const prevTab = this._activePanelId();
    if (prevTab !== tabId) {
      const prev = this._panels && this._panels[prevTab];
      if (prev && typeof prev.onHide === 'function') {
        try { prev.onHide(); } catch (e) { console.error(e); }
      }
    }
    this._ctx.state.ui.activeStationTab = tabId;
    if (this._el) {
      this._el.dataset.activeTab = tabId;
      this._el.classList.toggle('st-hub--engineering', tabId === 'shipyard' || tabId === 'outfit');
    }
    // rail highlight
    let activeButton = null;
    this._rail.querySelectorAll('[data-tab]').forEach((b) => {
      const isActive = b.getAttribute('data-tab') === tabId;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      if (b.getAttribute('role') === 'tab') {
        b.setAttribute('tabindex', isActive ? '0' : '-1');
      } else {
        b.setAttribute('tabindex', '-1');
      }
      if (isActive) activeButton = b;
    });
    // Trigger channel wipe animation
    if (this._content) {
      this._content.classList.remove('switching');
      void this._content.offsetWidth;
      this._content.classList.add('switching');
      setTimeout(() => this._content && this._content.classList.remove('switching'), 130);
    }
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
    this._refreshSchematicAndNodes();
    this._refreshEconAndReadiness();
    this._updateInspector();
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
    // Error boundary: a child panel's onShow/refresh throwing must not crash the whole station hub or
    // bubble to an uncaught page error (matches the onHide guard). Degrade to a warning; rail stays usable.
    try {
      if (isShow && typeof p.onShow === 'function') p.onShow({ stationId: this._stationId, state: this._ctx.state });
      else if (typeof p.refresh === 'function') p.refresh({ stationId: this._stationId, state: this._ctx.state });
    } catch (e) {
      console.warn('[stationHub] panel "' + id + '" refresh failed', e);
    }
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
    if (this._el) {
      const stn = this._stationDef();
      this._el.className = 'st-hub panel';
      if (stn && stn.type) {
        this._el.classList.add(`st-hub--${stn.type}`);
      }
    }
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
      const targetName = stn.name || stn.id;
      if (nameEl.textContent !== targetName && nameEl.dataset.acquireTarget !== targetName) {
        this._signalAcquire(nameEl, targetName, { duration: 400 });
      }
      const fac = stn.factionId ? FACTION_BY_ID.get(stn.factionId) : null;
      facEl.textContent = (fac ? (fac.short || fac.name) : '') + '  ·  ' + (stn.type || '').replace('_', ' ');
      if (fac) facEl.style.color = fac.color || '';
    } else {
      nameEl.textContent = 'Station';
      facEl.textContent = '';
    }
  },

  _signalAcquire(element, finalText, opts = {}) {
    const duration = opts.duration || 400;
    const token = String(Date.now()) + ':' + Math.random().toString(36).slice(2);

    element.dataset.acquireTarget = finalText;
    element.dataset.acquireToken = token;
    element.textContent = finalText;
    element.style.opacity = '1';
    element.classList.remove('acquiring');
    void element.offsetWidth;
    element.classList.add('acquiring');
    setTimeout(() => {
      if (element.dataset.acquireToken !== token) return;
      delete element.dataset.acquireTarget;
      delete element.dataset.acquireToken;
    }, duration);
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
    const oldId = this._stationId;
    this._resolveStation();
    if (this._stationId && this._stationId !== oldId) {
      this._triggerArrivalEdgeTrace();
      this._playArrivalBroadcast();
    }
    this._refreshTopbar();
    this._refreshGraffiti();
    this._refreshRailServiceStatus();
    this._refreshPurpose();
    this._refreshDeparture();
    this._refreshHandoff();
    this._refreshSchematicAndNodes();
    this._refreshEconAndReadiness();
    // Command-deck effects resume on show; the scanner-grid "console acquisition" sweep fires ONLY on
    // a genuine dock transition (returning from the map while still docked must not replay it).
    this._setEffectsActive(true);
    if (this._stationId && this._stationId !== this._lastRevealStationId) {
      this._lastRevealStationId = this._stationId;
      this._revealScan();
    }
    // restore the last active tab (or default 'market')
    const tab = this._activePanelId();
    this.setTab(tab); // also refreshes the active panel via onShow
  },

  onHide() {
    // Park every effect's rAF while the screen is hidden (frame-sleep contract).
    this._setEffectsActive(false);
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
    this._refreshSchematicAndNodes();
    this._refreshEconAndReadiness();
    this._updateInspector();
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
    bus.on('economy:tradeCompleted', onActive(['market', 'services', 'hold']));
    bus.on('economy:tradeCompleted', refreshHandoff);
    bus.on('economy:tick', onActive(['market', 'hold']));
    bus.on('cargo:changed', onActive(['market', 'outfit', 'services', 'hold']));
    bus.on('cargo:changed', refreshDeparture);
    bus.on('cargo:changed', refreshHandoff);
    bus.on('credits:changed', onActive(['market', 'shipyard', 'outfit', 'services', 'hold']));
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

function factionNameOf(fid) {
  const f = fid ? FACTION_BY_ID.get(fid) : null;
  return (f && f.name) || 'Independent';
}

function factionColorOf(fid) {
  const f = fid ? FACTION_BY_ID.get(fid) : null;
  return (f && f.color) || '#d7e6ff';
}

// ---- scoped CSS (injected once; uses theme vars from styles/ui.css) --------------------------
const STATION_CSS = `
/* Magic UI Animations */
@keyframes sf-signal-acquire { 0% { opacity: 0; filter: blur(4px); } 100% { opacity: 1; filter: blur(0); } }
.acquiring { animation: sf-signal-acquire .4s var(--ease) forwards; color: #ffca58; }
.st-undock { transition: background-color 0.2s, box-shadow 0.2s; position: relative; overflow: hidden; }
.st-undock::after { content: ''; position: absolute; left: 0; bottom: 0; height: 2px; width: 0%; background: #ffca58; transition: none; }
.st-undock.charging::after { width: 100%; transition: width 0.6s linear; }
.st-undock.abort::after { width: 0%; transition: width 0.2s ease-out; }
@keyframes channel-wipe { 0% { clip-path: inset(0 100% 0 0); filter: brightness(2) contrast(1.5); } 100% { clip-path: inset(0 0 0 0); filter: brightness(1) contrast(1); } }
.switching { animation: channel-wipe .13s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; }
@keyframes market-tick { 0% { background-color: rgba(255, 202, 88, 0.15); border-color: rgba(255, 202, 88, 0.4); } 100% { background-color: transparent; border-color: transparent; } }
.st-card-spark-wrap { border: 1px solid transparent; border-radius: 4px; transition: border-color 0.5s; }
.st-card-spark-wrap.tick { animation: market-tick .5s ease-out; }
.trend-up { color: #f2a83b; font-size: 0.8em; margin-left: 4px; }
.trend-down { color: #8fb0c0; font-size: 0.8em; margin-left: 4px; }

/* Station type accents (without arbitrary hue drifts, strictly themed) */
.st-hub {
  --st-accent: #39d0ff; /* default cyan */
  --st-glow: rgba(57, 208, 255, 0.15);
}
.st-hub--military {
  --st-accent: #ff5c5c; /* red */
  --st-glow: rgba(255, 92, 92, 0.15);
}
.st-hub--mining, .st-hub--refinery {
  --st-accent: #ffb35c; /* amber/rust */
  --st-glow: rgba(255, 179, 92, 0.15);
}
.st-hub--blackmarket {
  --st-accent: #8d66ff; /* violet */
  --st-glow: rgba(141, 102, 255, 0.15);
}

.st-hub { width: min(1560px, 96vw); height: min(920px, 95vh); display: flex; flex-direction: column;
  pointer-events: auto; overflow: hidden; animation: sf-fadein .3s var(--ease) both;
  background:
    radial-gradient(120% 80% at 82% -10%, color-mix(in srgb, var(--st-accent) 7%, transparent), transparent 60%),
    linear-gradient(180deg, rgba(15,20,33,0.95), rgba(10,14,24,0.97));
  border: 1px solid var(--st-line);
  border-radius: 18px;
  box-shadow: 0 44px 130px -36px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.02) inset; }
.st-topbar { display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid var(--panel-edge);
  background: linear-gradient(180deg, rgba(14,24,42,.7), rgba(8,14,26,.5)); }
.st-station-name { font-size: var(--t-xl); letter-spacing: .04em; color: #fff; font-weight: 600;
  text-shadow: 0 0 16px var(--st-glow); }
.st-station-fac { margin-left: 14px; color: var(--st-accent); font-size: var(--t-xs);
  letter-spacing: .14em; text-transform: uppercase; padding: 2px 10px; border-radius: var(--r-pill);
  border: 1px solid rgba(57,208,255,.3); background: rgba(57,208,255,.08); }
.st-undock { border-color: var(--st-accent); color: var(--st-accent); letter-spacing: .08em; font-weight: 600; }
.st-undock[data-readiness="ready"] { border-color: var(--good); color: var(--good); }
.st-undock[data-readiness="check"] { border-color: var(--warn); color: var(--warn); }
.st-undock[data-readiness="risk"] { border-color: var(--danger); color: var(--danger); }
/* airlock graffiti strip */
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

/* Keep .st-purpose styled cleanly inside the inspector, hiding native borders */
.st-purpose {
  display: flex; flex-direction: column; gap: 4px; padding: 12px;
  background: rgba(8,14,26,.4); border-top: 1px solid var(--panel-edge);
}
.st-purpose-main { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.st-purpose-type { color: var(--st-accent); font-size: .68rem; letter-spacing: .14em; text-transform: uppercase; flex: none; }
.st-purpose-copy { color: var(--ink); font-size: .78rem; line-height: 1.35; }
.st-purpose-sub { display: flex; flex-direction: column; gap: 4px; color: var(--ink-mute); font-size: .72rem; line-height: 1.35; margin-top: 4px; }
.st-purpose-tab { color: var(--ink-dim); }

.st-handoff { display: grid; gap: 6px; padding: 8px 16px; border-bottom: 1px solid rgba(57,208,255,.18); flex: none; }
.st-handoff-head { display: flex; flex-direction: column; gap: 1px; }
.st-handoff-label { color: var(--st-accent); font-size: .58rem; letter-spacing: .16em; text-transform: uppercase; }
.st-handoff-copy { color: var(--ink-dim); font-size: .7rem; line-height: 1.3; }
.st-handoff-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 6px; }
.st-handoff-step { display: grid; grid-template-areas: "label" "title" "copy"; gap: 1px; align-content: start;
  text-align: left; padding: 6px 9px; border: 1px solid var(--panel-edge); border-radius: 4px;
  background: rgba(10,18,32,.42); color: var(--ink-dim); font: inherit; cursor: pointer; }
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
.st-tab-icon { width: 18px; height: 18px; opacity: .85; }
.st-tab-label { letter-spacing: .04em; font-size: .92rem; text-transform: uppercase; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-tab-service { margin-left: auto; max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: .5rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-mute); opacity: .78; }
.st-tab-service[hidden] { display: none; }
.st-tab[data-service-status="available"] .st-tab-service { color: var(--accent-2); }
.st-tab[data-service-status="unavailable"] { opacity: .72; }
.st-tab[data-service-status="unavailable"] .st-tab-service { color: var(--warn); }
.st-tab[data-service-status="unavailable"].active { opacity: 1; border-color: rgba(255,198,77,.35);
  box-shadow: inset 3px 0 0 var(--warn), 0 0 12px rgba(255,198,77,.10); }
/* ===== Docked service console: center stage · Service Dock · inspector · effect layers ========== */
.st-workspace-wrapper { position: relative; display: flex; flex: 1; min-width: 0; min-height: 0; }
.st-center-stage { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; overflow: hidden; position: relative; }
.st-content { position: relative; flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
.st-faction-stripe { height: 3px; flex: none; opacity: .85; }
.st-hub--engineering .st-console-deck,
.st-hub--engineering .st-status-row,
.st-hub--engineering .st-handoff,
.st-hub--engineering .st-departure {
  display: none;
}

/* Console deck: station schematic (with scanner-grid backdrop) above the Service Dock berth strip.
   Column layout so the dock is always a horizontal berth strip that uses the full stage width. */
.st-console-deck { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 10px 16px; flex: none; border-bottom: 1px solid var(--panel-edge);
  background: radial-gradient(120% 100% at 50% 0%, rgba(57,208,255,.07), transparent 60%); }
.st-schematic-pane { position: relative; width: 100%; height: 100px; display: flex; align-items: center; justify-content: center; }
.st-fx-scan { position: absolute; inset: 0; overflow: hidden; opacity: .45; pointer-events: none; z-index: 0; }
.st-fx-scan canvas { width: 100%; height: 100%; display: block; }
.st-schematic-art { position: relative; z-index: 1; filter: drop-shadow(0 0 9px var(--st-glow)); }
.st-schematic-art svg { display: block; width: 92px; height: 92px; }
.st-service-nodes-pane { position: relative; z-index: 1; width: 100%; }
.st-fx-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 2; }

/* Service Dock — the dockRail effect provides base styling; these are hub-scoped accents. */
.st-hub .sf-fx-dock { flex-wrap: nowrap; gap: 6px; align-items: stretch; justify-content: center;
  max-width: 100%; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; }
.st-hub .sf-fx-dock__item { min-width: 58px; padding: 6px 7px; background: rgba(10,18,32,.55);
  border-color: color-mix(in srgb, var(--st-accent) 34%, transparent); }
.st-hub .sf-fx-dock__item:focus-visible { outline-color: var(--st-accent); }
.st-hub .sf-fx-dock__item.is-focus { border-color: var(--st-accent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--st-accent) 26%, transparent); }
.st-hub .sf-fx-dock__icon { color: var(--st-accent); font-size: 1.05em; }
.st-hub .sf-fx-dock__label { font-size: .62rem; letter-spacing: .04em; }
.st-hub .sf-fx-dock__badge { font-size: .58rem; }

/* Status row: economy/state readout (morphs on change) + departure system light. */
.st-status-row { display: flex; align-items: center; gap: 12px; padding: 6px 18px; flex: none;
  border-bottom: 1px solid var(--panel-edge); font-size: .66rem; }
.st-econ-badge { flex: 1; min-width: 0; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-dim);
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.st-econ-badge.active { color: var(--warn); }
.st-econ-badge.nominal { color: var(--good); }
.st-readiness-summary { flex: none; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-mute); }
.st-readiness--risk { color: var(--danger); }
.st-readiness--check { color: var(--warn); }
.st-readiness--ready { color: var(--good); }

/* .st-content occupies the remaining center-stage flex space below the station console/status strips;
   the absolute tabpanels inside it fill that scoped area instead of covering the station chrome. */

/* Right inspector column (diagnostics for the selected service / section). */
.st-inspector { position: relative; z-index: 1; flex: none; width: 244px; display: flex; flex-direction: column;
  min-height: 0; border-left: 1px solid var(--panel-edge); background: rgba(6,11,22,.5); }
.st-inspector-header { flex: none; padding: 9px 14px; border-bottom: 1px solid var(--panel-edge);
  color: var(--st-accent); font-size: .6rem; letter-spacing: .18em; text-transform: uppercase; }
.st-inspector-content { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 14px; }
.st-inspector-empty { color: var(--ink-mute); font-style: italic; padding: 10px 2px; }
.st-ins-section { display: flex; flex-direction: column; gap: 5px; }
.st-ins-title { font-size: .56rem; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-mute); }
.st-ins-tab-header { display: flex; align-items: center; gap: 8px; }
.st-ins-tab-icon { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; color: var(--st-accent); }
.st-ins-tab-icon svg { width: 16px; height: 16px; }
.st-ins-tab-name { font-family: var(--font-display, var(--mono)); font-size: .9rem; letter-spacing: .05em; color: var(--ink); }
.st-ins-desc { font-size: .74rem; line-height: 1.42; color: var(--ink-dim); }
.st-ins-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: .76rem; color: var(--ink-dim); }
.st-ins-row-val { color: var(--ink); font-weight: 600; text-align: right; }
.st-ins-status--available { color: var(--good); }
.st-ins-status--unavailable { color: var(--danger); }
.st-ins-status--unknown, .st-ins-status--neutral { color: var(--warn); }
.st-ins-row-detail { font-size: .72rem; line-height: 1.4; color: var(--ink-mute); }
.st-ins-hint { font-size: .72rem; line-height: 1.35; color: var(--warn); }
.st-ins-risk-desc { font-size: .72rem; line-height: 1.4; color: var(--ink-dim); }

/* Route-beam overlay spans the whole workspace so a node can beam toward the inspector. */
.st-fx-beamlayer { position: absolute; inset: 0; pointer-events: none; z-index: 3; overflow: visible; }
.st-fx-beamlayer > svg { position: absolute; left: 0; top: 0; overflow: visible; }

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

/* ── Market rebuild: trade-intelligence scope ── */
/* Dense commodity row readouts: a stock-pressure mini-gauge + sparkline + supply/demand glyph read as
   one scope strip. Palette tokens only; no glow/pulse at rest (motion = state change only). */
.st-card-spark-wrap { display: flex; align-items: center; gap: 10px; padding: 2px 0; }
.st-row-gauge { flex: 0 0 auto; }
.st-row-gauge__track { stroke: color-mix(in srgb, var(--ink-mute) 30%, transparent); }
.st-spark { margin-left: 0; flex: 1 1 auto; width: 120px; height: 26px; }
.st-row-role { flex: 0 0 auto; display: inline-flex; flex-direction: column; align-items: center;
  line-height: 1; gap: 2px; min-width: 46px; }
.st-row-role-glyph { font-size: .92rem; }
.st-row-role-lbl { font-family: var(--mono); font-size: .54rem; letter-spacing: .12em; color: var(--ink-mute); }
.st-role--produce .st-row-role-glyph { color: var(--good); }
.st-role--consume .st-row-role-glyph { color: var(--warn); }
.st-role--none .st-row-role-glyph { color: var(--ink-mute); }
.st-card-header { display: flex; align-items: center; gap: 8px; }
.st-card-cat-badge { margin-left: auto; font-size: .56rem; letter-spacing: .1em; text-transform: uppercase;
  color: var(--ink-mute); }
.st-expand-btn { margin-left: 2px; padding: 0 5px; font-size: .68rem; line-height: 1.3; border-radius: 4px;
  color: var(--ink-mute); border-color: transparent; background: transparent; cursor: pointer; opacity: .5;
  transition: opacity .12s var(--ease, ease-out), color .12s, border-color .12s; }
.st-cmdty-card:hover .st-expand-btn { opacity: 1; }
.st-expand-btn:hover { color: var(--accent); border-color: var(--accent); opacity: 1; }
.st-cmdty-card { cursor: pointer; transition: border-color .12s var(--ease, ease-out);
  display: grid; grid-template-columns: 1fr auto; grid-template-areas:
    "head head" "scope scope" "purpose purpose" "mission mission" "best best" "prices qty" "actions actions";
  align-items: center; gap: 4px 10px; }
.st-cmdty-card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--panel-edge)); }
.st-cmdty-card.is-selected { border-color: var(--accent); box-shadow: inset 2px 0 0 var(--accent); }
.st-cmdty-card > .st-card-header { grid-area: head; }
.st-cmdty-card > .st-card-spark-wrap { grid-area: scope; }
.st-cmdty-card > .st-cmdty-purpose { grid-area: purpose; }
.st-cmdty-card > .st-market-mission-line { grid-area: mission; }
.st-cmdty-card > .st-best-known-line { grid-area: best; }
.st-cmdty-card > .st-card-prices { grid-area: prices; }
.st-cmdty-card > .st-card-qty-row { grid-area: qty; }
.st-cmdty-card > .c-act { grid-area: actions; }
.st-card-prices { display: flex; gap: 18px; align-items: baseline; }
.st-card-price-col { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; }
.st-price-lbl { font-family: var(--mono); font-size: .52rem; letter-spacing: .14em; text-transform: uppercase;
  color: var(--ink-mute); }
.st-card-qty-row { display: flex; justify-content: flex-end; }

/* Selected-commodity analysis stage — the centerpiece. Four cells in a 2x2 grid: price/regime + cone,
   supply chain spindle, best-margin route beam, trade inspector. */
.st-market-stage { position: relative; margin-top: 10px; border: 1px solid var(--panel-edge);
  border-radius: var(--r-lg, 8px); background: color-mix(in srgb, var(--panel) 80%, transparent);
  padding: 10px 12px 12px; }
.st-market-stage[hidden] { display: none; }
.st-stage-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.st-stage-title { font-family: var(--mono); font-size: .62rem; letter-spacing: .18em; color: var(--accent);
  text-transform: uppercase; }
.st-stage-close { padding: 0 7px; font-size: 1rem; line-height: 1.4; border-radius: 4px; color: var(--ink-mute);
  border-color: var(--panel-edge); background: transparent; cursor: pointer; }
.st-stage-close:hover { color: var(--ink); border-color: var(--ink-mute); }
.st-stage-grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 10px; }
.st-stage-cell { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 10px 12px;
  background: color-mix(in srgb, var(--panel-2) 60%, transparent); min-height: 150px;
  display: flex; flex-direction: column; }
.st-stage-lbl { font-family: var(--mono); font-size: .62rem; letter-spacing: .14em; text-transform: uppercase;
  color: var(--ink-mute); margin-bottom: 8px; }
.st-stage-price-row { display: flex; align-items: center; gap: 10px; }
.st-stage-spark-wrap { flex: 0 0 auto; }
.st-stage-spark { width: 170px; height: 46px; display: block; }
.st-stage-regime { font-family: var(--mono); font-size: .82rem; color: var(--ink); }
.st-stage-forecast-lbl { font-family: var(--mono); font-size: .58rem; letter-spacing: .14em; text-transform: uppercase;
  color: var(--ink-mute); margin: 8px 0 2px; }
.st-stage-cone { width: 100%; height: 80px; display: block; }
.st-stage-supply-mount, .st-stage-route-mount { flex: 1 1 auto; display: flex; align-items: center;
  justify-content: center; min-height: 96px; }
.st-stage-route-meta { font-family: var(--mono); font-size: .68rem; color: var(--accent-2); text-align: center;
  margin-top: 6px; }
.st-inspector-row { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-size: .74rem; padding: 4px 0; }
.st-insp-lbl { font-family: var(--mono); font-size: .58rem; letter-spacing: .1em; text-transform: uppercase;
  color: var(--ink-mute); }
.st-insp-quote, .st-insp-profit { font-size: .78rem; color: var(--ink); }
.st-insp-flood-mount { display: inline-flex; }
.st-inspector-actions { margin-top: 8px; display: flex; justify-content: flex-end; }
.st-insp-route { padding: 4px 12px; font-size: .72rem; border-radius: 5px; color: var(--accent);
  border-color: var(--accent); background: transparent; cursor: pointer; }
.st-insp-route:hover:not(:disabled) { background: rgba(57,208,255,.12); }
.st-insp-route:disabled { color: var(--ink-mute); border-color: var(--panel-edge); cursor: not-allowed; opacity: .6; }
/* ripple overlay sits above the stage cells to catch event-mode pings */
.st-market-stage-overlay { position: absolute; inset: 0; pointer-events: none; }

@media (max-width: 900px) {
  .st-stage-grid { grid-template-columns: 1fr; grid-template-rows: none; }
}

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
.st-shipyard { display: flex; flex-direction: column; gap: 12px; }
.st-shipyard .st-sy-engineering { order: 0; }
.st-shipyard .st-sy-job-guide { order: 1; margin: 0; }
.st-shipyard .st-sy-owned { order: 2; margin: 0; }
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

/* ===== Premium Engineering Stage (Shipyard + Outfitting) ===== */
.st-eng-stage { display: flex; flex-direction: column; height: 100%; }
.st-eng-stage__frame {
  position: relative; flex: 1; min-height: 220px;
  border: 1px solid var(--panel-edge); border-radius: 8px; overflow: hidden;
  background: radial-gradient(ellipse at 50% 70%, #0a1426, #05070d 80%);
}
.st-eng-stage__frame::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(57,208,255,.03) 0, rgba(57,208,255,.03) 1px, transparent 1px, transparent 24px);
  z-index: 1;
}
.st-eng-stage__canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; opacity: 0; transition: opacity .25s ease; }
.st-eng-stage.is-ready .st-eng-stage__canvas { opacity: 1; }
.st-eng-stage__overlay { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.st-eng-stage__gauges {
  position: absolute; left: 10px; top: 10px; z-index: 3;
  display: flex; flex-wrap: wrap; gap: 8px; max-width: 180px;
  pointer-events: none;
}
.st-eng-gauge { background: rgba(5,7,13,.55); border-radius: 50%; padding: 2px; }
.st-eng-stage__label {
  margin-top: 8px; text-align: center; font-size: .78rem; color: var(--ink-dim);
  min-height: 1.2em;
}
.st-eng-stage__label .mono { color: var(--accent); }
.st-outfit-ghost-label { color: var(--warn); font-style: italic; }

/* ===== Fit Tree (file-tree-inspired) ===== */
.st-fit-tree { font-size: .8rem; overflow-y: auto; max-height: 520px; padding-right: 4px; }
.st-fit-empty { color: var(--ink-mute); font-style: italic; padding: 8px 0; }
.st-fit-node { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; padding: 5px 8px; border-radius: 5px; cursor: pointer; }
.st-fit-node--root { font-weight: 600; color: var(--ink); background: rgba(10,18,32,.5); border: 1px solid var(--panel-edge); margin-bottom: 6px; }
.st-fit-node--slot { padding-left: 18px; border-left: 2px solid transparent; margin: 1px 0; }
.st-fit-node--slot:hover { background: rgba(57,208,255,.08); }
.st-fit-node--selected { background: rgba(57,208,255,.12); border-color: var(--accent); }
.st-fit-node--filled { color: var(--ink); }
.st-fit-node--empty { color: var(--ink-mute); font-style: italic; }
.st-fit-node--preview-ok { border-left-color: var(--good); }
.st-fit-node--preview-bad { border-left-color: var(--danger); animation: st-fit-blink 1s ease-in-out 2; }
.st-fit-node--invalid { border-color: var(--danger); }
.st-fit-icon { width: 18px; text-align: center; }
.st-fit-icon--hull { color: var(--accent); }
.st-fit-icon--weapon { color: var(--danger); }
.st-fit-icon--shield { color: var(--shield); }
.st-fit-icon--engine { color: var(--warn); }
.st-fit-icon--cargo { color: var(--cargo); }
.st-fit-icon--mining { color: var(--accent-2); }
.st-fit-icon--utility { color: var(--accent-3); }
.st-fit-branch { margin-bottom: 8px; }
.st-fit-branch-head { display: flex; align-items: center; gap: 6px; padding: 4px 8px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: .08em; font-size: .68rem; }
.st-fit-branch-label { flex: 1; }
.st-fit-branch-count { color: var(--ink-dim); }
.st-fit-label { flex: 1; }
.st-fit-meta { color: var(--ink-mute); font-size: .68rem; }
.st-fit-slot-size { color: var(--accent); min-width: 18px; }
.st-fit-slot-name { flex: 1; }
.st-fit-slot-facing { color: var(--ink-mute); font-size: .64rem; text-transform: capitalize; }
.st-fit-preview-arrow { color: var(--accent); }
.st-fit-preview-name { color: var(--good); }
.st-fit-preview-name--bad { color: var(--danger); }
.st-fit-mods { width: 100%; padding-left: 24px; }
.st-fit-mod { color: var(--ink-dim); font-size: .68rem; line-height: 1.35; }
.st-fit-mod--preview { color: var(--good); }
@keyframes st-fit-blink { 0%,100% { background: transparent; } 50% { background: rgba(255,84,112,.12); } }

/* ===== Shipyard premium layout ===== */
.st-sy-engineering { display: grid; grid-template-columns: 240px 1fr 240px; gap: 16px; min-height: 420px; }
.st-sy-rail { display: flex; flex-direction: column; gap: 10px; }
.st-sy-rail-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.st-sy-rail-credits { color: var(--energy); font-size: .82rem; }
.st-sy-rail-controls { display: flex; flex-direction: column; gap: 6px; }
.st-sy-rail-header { display: grid; grid-template-columns: 1.4fr .6fr 1fr; align-items: center; gap: 6px; padding: 4px 8px; font-size: .66rem; color: var(--ink-mute); border-bottom: 1px solid var(--panel-edge); }
.st-sy-rail-list { flex: 1; overflow-y: auto; max-height: 420px; display: flex; flex-direction: column; gap: 6px; padding-right: 2px; }
.st-sy-rail-card { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 8px 10px; cursor: pointer; background: rgba(10,18,32,.5); transition: border-color .12s, background .12s; }
.st-sy-rail-card:hover { border-color: var(--accent); background: rgba(57,208,255,.06); }
.st-sy-rail-card.selected { border-color: var(--accent); box-shadow: 0 0 10px rgba(57,208,255,.18); }
.st-sy-rail-card.owned { opacity: .7; }
.st-sy-rail-card.mission-fit-ok { border-color: rgba(98,224,138,.42); background: rgba(98,224,138,.06); }
.st-sy-rail-card.mission-fit-warn { border-color: rgba(255,198,77,.36); background: rgba(255,198,77,.05); }
.st-sy-rail-name { font-weight: 600; font-size: .88rem; margin-bottom: 2px; }
.st-sy-rail-meta { color: var(--ink-dim); font-size: .66rem; margin-bottom: 3px; }
.st-sy-rail-slots { color: var(--ink-mute); font-size: .62rem; margin-bottom: 4px; }
.st-sy-rail-price { color: var(--energy); font-size: .74rem; }
.st-sy-center { display: flex; flex-direction: column; min-height: 0; }
.st-sy-stage-wrap { flex: 1; min-height: 260px; }
.st-sy-identity { margin-top: 12px; padding: 10px 12px; border: 1px solid var(--panel-edge); border-radius: 6px; background: rgba(10,18,32,.5); }
.st-sy-identity-role { font-family: var(--mono); font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); margin-bottom: 3px; }
.st-sy-identity-name { font-size: 1.05rem; font-weight: 600; margin-bottom: 4px; }
.st-sy-identity-slots { color: var(--ink-mute); font-size: .7rem; margin-bottom: 6px; }
.st-sy-identity-purpose { color: var(--ink-dim); font-size: .76rem; line-height: 1.35; margin-bottom: 8px; }
.st-sy-identity-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.st-sy-id-chip { font-size: .64rem; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--panel-edge); color: var(--ink-dim); background: rgba(10,18,32,.5); }
.st-sy-id-chip--role { color: var(--accent); border-color: rgba(57,208,255,.35); }
.st-sy-id-chip--combat { color: var(--danger); border-color: rgba(255,84,112,.35); }
.st-sy-id-chip--cargo { color: var(--cargo); border-color: rgba(122,247,208,.35); }
.st-sy-side { display: flex; flex-direction: column; gap: 12px; }
.st-sy-requirements { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 12px; background: rgba(10,18,32,.5); }
.st-sy-req-head { font-family: var(--mono); font-size: .6rem; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-mute); margin-bottom: 8px; }
.st-sy-req-price { font-size: 1.1rem; color: var(--energy); margin-bottom: 4px; }
.st-sy-req-price--short { color: var(--danger); }
.st-sy-req-credits { font-size: .72rem; color: var(--ink-dim); margin-bottom: 10px; }
.st-sy-req-state { font-family: var(--mono); font-size: .7rem; letter-spacing: .08em; text-transform: uppercase; padding: 4px 8px; border-radius: 4px; margin-bottom: 8px; }
.st-sy-req-state--available { color: var(--good); border: 1px solid rgba(98,224,138,.35); background: rgba(98,224,138,.08); }
.st-sy-req-state--funding { color: var(--danger); border: 1px solid rgba(255,84,112,.35); background: rgba(255,84,112,.08); }
.st-sy-req-state--locked { color: var(--warn); border: 1px solid rgba(255,179,71,.35); background: rgba(255,179,71,.08); }
.st-sy-req-state--owned { color: var(--ink-mute); border: 1px solid var(--panel-edge); background: rgba(10,18,32,.5); }
.st-sy-req-title { font-size: .74rem; color: var(--ink-dim); line-height: 1.35; margin-bottom: 10px; }
.st-sy-buy-btn { width: 100%; }

/* ===== Outfitting premium layout ===== */
.st-outfit-engineering { display: grid; grid-template-columns: 260px 1fr 280px; gap: 16px; min-height: 480px; }
.st-outfit-tree-wrap { min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.st-outfit-stage-wrap { min-height: 260px; }
.st-outfit-right { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; }

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

/* operations board — two-column: compact contract selectors (rail) + preflight instrument (center) */
.st-ops { display: flex; gap: 16px; align-items: flex-start; }
.st-ops-rail { flex: 0 0 300px; min-width: 0; max-width: 340px; }
.st-ops-rail-h { color: var(--ink-mute); font-size: .6rem; letter-spacing: .16em; margin: 0 0 8px; text-transform: uppercase; }
.st-ops-center { flex: 1 1 auto; min-width: 0; align-self: stretch; border: 1px solid var(--panel-edge);
  border-radius: 10px; background: linear-gradient(180deg, rgba(10,18,32,.6), rgba(6,12,22,.5)); padding: 14px 16px; }
@media (max-width: 900px) { .st-ops { flex-direction: column; } .st-ops-rail { flex: 1 1 auto; max-width: none; width: 100%; } }
.st-ops-empty { color: var(--ink-mute); font-size: .82rem; line-height: 1.5; padding: 30px 10px; text-align: center; }
.st-ops-empty[hidden], .st-ops-dossier[hidden] { display: none; }
.st-ops-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 13px; }
.st-ops-eyebrow { color: var(--accent); font-size: .58rem; letter-spacing: .18em; }
.st-ops-title { color: var(--ink); font-weight: 700; font-size: 1.02rem; line-height: 1.25; margin-top: 3px; }
.st-ops-state { flex: none; font-family: var(--mono); font-size: .68rem; letter-spacing: .1em; font-weight: 700;
  padding: 4px 10px; border: 1px solid var(--panel-edge); border-radius: 5px; background: rgba(255,255,255,.03);
  white-space: nowrap; color: var(--ink-dim); }
.st-ops-state[data-kind="ok"] { color: var(--good); border-color: rgba(98,224,138,.42); background: rgba(98,224,138,.08); }
.st-ops-state[data-kind="warn"] { color: var(--warn); border-color: rgba(255,198,77,.42); background: rgba(255,198,77,.08); }
.st-ops-state[data-kind="bad"] { color: var(--danger); border-color: rgba(255,84,112,.44); background: rgba(255,84,112,.08); }
/* route lane */
.st-ops-route { position: relative; height: 92px; margin: 0 0 14px; border: 1px solid var(--panel-edge);
  border-radius: 8px; overflow: hidden;
  background: radial-gradient(120% 140% at 50% 130%, rgba(57,208,255,.1), transparent 62%), rgba(6,12,22,.5); }
.st-ops-route[data-kind="warn"] { border-color: rgba(255,198,77,.34); }
.st-ops-route[data-kind="danger"] { border-color: rgba(255,84,112,.36); }
.st-ops-beam, .st-ops-ping { position: absolute; inset: 0; pointer-events: none; }
.st-ops-node { position: absolute; top: 50%; transform: translateY(-50%); display: grid; gap: 3px; max-width: 42%; z-index: 1; }
.st-ops-node--origin { left: 14px; text-align: left; }
.st-ops-node--dest { right: 14px; text-align: right; }
.st-ops-node-tag { font-size: .52rem; letter-spacing: .14em; color: var(--ink-mute); }
.st-ops-node-name { font-size: .82rem; font-weight: 700; color: var(--ink); line-height: 1.2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-ops-node--dest .st-ops-node-name { color: var(--accent); }
/* preflight ring gauges */
.st-ops-gauges { display: flex; gap: 18px; margin: 0 0 14px; flex-wrap: wrap; }
.st-ops-gauge { display: flex; align-items: center; gap: 9px; }
.st-ops-gauge-mount { flex: none; display: flex; }
.st-ops-gauge-meta { display: grid; gap: 1px; }
.st-ops-gauge-val { font-family: var(--mono); font-size: .86rem; font-weight: 700; color: var(--ink); line-height: 1.05; }
.st-ops-gauge-label { font-size: .56rem; letter-spacing: .12em; color: var(--ink-mute); text-transform: uppercase; }
/* broker comms slate */
.st-ops-comms { border: 1px solid rgba(57,208,255,.24); border-left: 3px solid rgba(57,208,255,.55);
  border-radius: 7px; padding: 9px 12px; margin: 0 0 12px;
  background: linear-gradient(90deg, rgba(57,208,255,.09), rgba(6,12,22,.4)); }
.st-ops-comms-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
.st-ops-comms-from { color: var(--accent-2); font-weight: 700; font-size: .8rem; min-width: 0; }
.st-ops-comms-tag { flex: none; color: var(--accent); font-size: .54rem; letter-spacing: .14em; }
.st-ops-comms-msg { color: var(--ink-dim); font-size: .8rem; line-height: 1.45; font-style: italic; }
/* dossier detail + actions */
.st-ops-standing { margin: 0 0 8px; }
.st-ops-warn[hidden] { display: none; }
.st-ops-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 2px; }
.st-ops-btn { font-size: .82rem; }
.st-ops-btn--plot { border-color: rgba(57,208,255,.44); color: var(--accent); }
.st-ops-btn--plot:hover { background: rgba(57,208,255,.12); }
/* compact selector card additions (board-only — .st-mission-card is not shared with the Bar) */
.st-mission-card { cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease, background .15s ease; }
.st-mission-card:hover { border-color: rgba(57,208,255,.4); }
.st-mission-card.selected { border-color: var(--accent); background: rgba(57,208,255,.07);
  box-shadow: inset 3px 0 0 var(--accent), 0 0 12px rgba(57,208,255,.14); }
.st-mission-cslot { display: flex; flex-wrap: wrap; gap: 5px; margin: 7px 0 6px; }
.st-mission-chip { font-family: var(--mono); font-size: .62rem; letter-spacing: .03em; padding: 2px 6px;
  border: 1px solid var(--panel-edge); border-radius: 4px; color: var(--ink-dim); background: rgba(10,18,32,.42); }
.st-mission-chip--cr { color: var(--energy); }
.st-mission-chip--rep { color: var(--accent-2); }
.st-mission-chip--r0 { color: var(--good); } .st-mission-chip--r1 { color: var(--accent-2); }
.st-mission-chip--r2 { color: var(--warn); } .st-mission-chip--r3, .st-mission-chip--r4 { color: var(--danger); }
.st-mission-chip--time { color: var(--ink-mute); }
/* accepted receipt: singular confirmation + one-shot freshly-printed edge sweep + Plot Route */
.st-mission-accepted { position: relative; }
.st-mission-accepted-actions { margin-top: 9px; display: flex; gap: 10px; flex-wrap: wrap; }
.st-mission-accepted.trace-run::after { content: ''; position: absolute; inset: -1px; border-radius: 7px;
  border: 1px solid var(--good); pointer-events: none; animation: st-receipt-trace 620ms ease-out 1 both; }
@keyframes st-receipt-trace { 0% { clip-path: inset(0 100% 100% 0); opacity: 1; } 60% { clip-path: inset(0 0 0 0); opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .st-mission-accepted.trace-run::after { animation: none; } }
html.sf-reduce-motion .st-mission-accepted.trace-run::after { animation: none; }

/* --- SCORCHED BULKHEAD CONSOLE OVERRIDES --- */
/* No remote @font import: the game must run offline/packaged (and a mid-stylesheet @import is invalid
   anyway). --font-display / --font-body below fall back to the local --mono + system stacks. */

.st-hub {
  /* Refined mission-console theme: readable system type, soft slate surfaces, restrained accent,
     generous corners + soft elevation (replaces the hard 1px cyan-wireframe "bulkhead" look). */
  --font-display: 'Segoe UI Variable Display', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-body: 'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --panel-edge: rgba(150,167,193,0.13);
  --st-line: rgba(150,167,193,0.16);
  --st-surface: rgba(21,28,44,0.72);
  --st-surface-2: rgba(28,38,58,0.5);
  --st-raised: rgba(33,45,68,0.82);
  --st-r: 14px; --st-r-sm: 10px; --st-r-xs: 7px;
  --st-shadow: 0 14px 36px -18px rgba(0,0,0,0.72);
  --st-accent-soft: color-mix(in srgb, var(--st-accent) 20%, transparent);
  --ink: #eef2f9; --ink-dim: #bcc7db; --ink-mute: #8695ad;
  color: var(--ink);
  font-family: var(--font-body);
}
.st-station-name {
  font-family: var(--font-display);
  font-size: 25px;
  font-weight: 650;
  letter-spacing: 0.005em;
  text-transform: none;
  color: #fff;
  position: relative;
}
.st-station-name::after {
  content: ''; position: absolute; bottom: -2px; left: 0; height: 1px;
  background: var(--accent); width: 0; box-shadow: 0 0 6px var(--accent);
}
.st-station-name.acquiring::after {
  animation: signal-sweep 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes signal-sweep {
  from { width: 0; opacity: 1; }
  to { width: 100%; opacity: 0.3; }
}
.st-tab-label {
  font-family: var(--font-display);
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-transform: none;
}
.c-name, .st-sy-name, .st-svc-name, .st-inv-name, .st-mission-title, .st-bar-name {
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--ink);
}
.st-cmdty-purpose, .st-market-mission-body, .st-sy-guide, .st-sy-purpose, .st-mission-brief, .st-mission-purpose, .st-bar-line {
  font-family: var(--font-body);
  font-size: 13.5px;
  font-weight: 400;
  line-height: 1.55;
  color: var(--ink-dim);
}
.st-row-head, .st-sub-h, .st-manuf-group-h {
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-mute);
}
.st-topbar {
  height: 52px;
  padding: 0 20px;
}
/* Soft corners (was a hard 1px !important wireframe on every element). */
.st-hub button, .st-hub .st-tab, .st-hub input, .st-hub select, .st-hub .st-chip { border-radius: var(--st-r-xs); }
.st-undock {
  font-family: var(--font-display); font-weight: 650; letter-spacing: 0.01em; text-transform: none;
  border-radius: var(--st-r-sm); padding: 9px 18px;
}
.st-undock::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, var(--accent), transparent 70%);
  opacity: 0; transform: scaleX(0); transform-origin: left;
  transition: none; pointer-events: none; z-index: 0;
}
.st-undock.charging::before {
  opacity: 0.25; transform: scaleX(1);
  transition: transform 600ms cubic-bezier(0.33, 1, 0.68, 1), opacity 80ms ease;
}
.st-undock.abort::before {
  opacity: 0; transform: scaleX(0);
  transition: all 150ms ease;
}
.st-undock > * { position: relative; z-index: 1; }
.st-content::after {
  content: ''; position: absolute; left: 0; right: 0; height: 4px;
  background: repeating-linear-gradient(90deg, rgba(242,168,59,0.6) 0px, transparent 2px, rgba(242,168,59,0.3) 4px, transparent 6px);
  opacity: 0; pointer-events: none; z-index: 10; top: 0;
}
.st-content.switching::after {
  animation: channel-wipe-trace 120ms ease-out forwards;
}
@keyframes channel-wipe-trace {
  0% { top: 0; opacity: 0.9; }
  100% { top: 100%; opacity: 0; }
}
.st-trend-arrow {
  display: inline-block; font-size: 1.4em; line-height: 1;
  transition: transform 0.3s var(--ease), color 0.3s var(--ease);
}
.st-trend-arrow.up { color: var(--danger); transform: rotate(-90deg); }
.st-trend-arrow.down { color: var(--good); transform: rotate(90deg); }
.st-trend-arrow.flat { color: var(--ink-mute); opacity: 0.4; }
.st-trend-arrow.strong { font-size: 1.8em; }

.st-faction-gauge {
  height: 6px; border-radius: 1px; position: relative; width: 140px; margin-top: 4px;
  background: linear-gradient(90deg, var(--danger) 0%, var(--danger) 20%, var(--warn) 20%, var(--warn) 40%, var(--ink-mute) 40%, var(--ink-mute) 60%, var(--accent-2) 60%, var(--accent-2) 80%, var(--good) 80%, var(--good) 100%);
}
.st-faction-gauge::after {
  content: ''; position: absolute; top: -3px; width: 2px; height: 12px;
  background: var(--ink); box-shadow: 0 0 4px rgba(0,0,0,0.8);
  left: var(--rep-pct, 50%); transition: left 0.5s var(--ease);
}
.st-comms-ticker {
  font-family: var(--mono); font-size: 11px; color: var(--ink-mute);
  letter-spacing: 0.04em; white-space: nowrap; overflow: hidden;
  border-top: 1px solid var(--panel-edge); padding: 5px 16px; background: var(--sh-black);
  cursor: pointer; transition: background-color 0.2s ease;
}
.st-comms-ticker:hover {
  background: rgba(57,208,255,0.05);
}
.st-comms-ticker .sender {
  color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em;
  font-size: 9px; margin-right: 8px;
}
#sf-comms, #sf-comm-backlog, #sf-comm-backlog-btn {
  display: none !important;
}
.st-comms-panel {
  position: absolute; right: 0; top: 53px; bottom: 25px; width: 340px;
  background: rgba(8,14,26,0.97); border-left: 1px solid var(--panel-edge);
  transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex; flex-direction: column; z-index: 100;
  /* no backdrop-filter: it composites over the live WebGL canvas every frame; the 0.97 fill reads
     the same without the per-frame blur (perf-sensitive iGPUs + the ui:perf compositor-shell rule). */
}
.st-comms-panel.open {
  transform: translateX(0);
}
.st-comms-panel-head {
  padding: 10px 16px; border-bottom: 1px solid var(--panel-edge);
  display: flex; justify-content: space-between; align-items: center;
  font-family: var(--font-display); font-size: 13px; font-weight: 600;
  letter-spacing: 0.09em; text-transform: uppercase; color: var(--accent);
}
.st-comms-panel-close {
  cursor: pointer; color: var(--ink-mute); font-family: var(--mono); font-size: 11px;
}
.st-comms-panel-close:hover { color: var(--ink); }
.st-comms-panel-body {
  flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px;
}
.st-comms-panel-row {
  font-family: var(--font-body); font-size: 13px; line-height: 1.45; color: var(--ink);
}
.st-hub button:active:not(:disabled) {
  transform: scale(0.96); transition: transform 50ms ease;
}
[data-tip]::after {
  border-left: 3px solid var(--tip-accent, var(--panel-edge-2));
}
[data-tip-severity="ok"]   { --tip-accent: var(--good); }
[data-tip-severity="warn"] { --tip-accent: var(--warn); }
[data-tip-severity="bad"]  { --tip-accent: var(--danger); }

/* ===== Refined surfaces: soft elevated cards, calm separators, restrained accent ================ */
.st-hub { line-height: 1.5; }
.st-topbar { height: 60px; padding: 0 24px; border-bottom: 1px solid var(--st-line);
  background: linear-gradient(180deg, rgba(255,255,255,0.028), transparent); }
.st-station-fac { border: 1px solid var(--st-line); background: rgba(255,255,255,0.03); color: var(--ink-dim);
  letter-spacing: .07em; padding: 3px 11px; }
.st-airlock { border-bottom: 1px solid var(--st-line); background: rgba(255,255,255,0.012); }

/* Left rail */
.st-rail { width: 202px; padding: 12px 10px; gap: 2px; border-right: 1px solid var(--st-line);
  background: linear-gradient(180deg, rgba(255,255,255,0.014), transparent); }
.st-tab { padding: 10px 12px; gap: 11px; color: var(--ink-dim); border: 1px solid transparent;
  transition: background .16s ease, color .16s ease, border-color .16s ease; }
.st-tab:hover { background: rgba(255,255,255,0.05); color: var(--ink); }
.st-tab:focus-visible { outline: 2px solid var(--st-accent); outline-offset: 2px; }
.st-tab.active { color: #fff; border-color: var(--st-line);
  background: linear-gradient(90deg, var(--st-accent-soft), rgba(255,255,255,0.02));
  box-shadow: inset 2px 0 0 var(--st-accent); }
.st-tab[data-service-status="unavailable"].active { border-color: color-mix(in srgb, var(--warn) 32%, transparent);
  box-shadow: inset 2px 0 0 var(--warn); }
.st-tab-icon { color: var(--ink-mute); }
.st-tab.active .st-tab-icon { color: var(--st-accent); }
.st-tab-service { font-size: .56rem; letter-spacing: .05em; }

/* Console deck + status row */
.st-console-deck { padding: 18px 24px 14px; gap: 12px; border-bottom: 1px solid var(--st-line);
  background: radial-gradient(130% 130% at 50% -30%, var(--st-accent-soft), transparent 58%); }
.st-status-row { padding: 10px 24px; border-bottom: 1px solid var(--st-line); font-size: .72rem; }
.st-econ-badge, .st-readiness-summary { letter-spacing: .06em; }

/* Service Dock nodes → soft raised chips */
.st-hub .sf-fx-dock { gap: 9px; }
.st-hub .sf-fx-dock__item { min-width: 80px; padding: 10px 12px; border-radius: var(--st-r-sm);
  background: var(--st-raised); border: 1px solid var(--st-line); box-shadow: 0 6px 16px -12px rgba(0,0,0,0.8);
  transition: transform .14s ease, border-color .14s ease, background .14s ease; }
.st-hub .sf-fx-dock__item:hover { background: color-mix(in srgb, var(--st-accent) 9%, var(--st-raised)); }
.st-hub .sf-fx-dock__item.is-focus { border-color: color-mix(in srgb, var(--st-accent) 55%, transparent);
  box-shadow: 0 8px 22px -10px color-mix(in srgb, var(--st-accent) 42%, transparent); }
.st-hub .sf-fx-dock__label { font-size: .68rem; letter-spacing: .01em; color: var(--ink-dim); }
.st-hub .sf-fx-dock__icon { color: var(--st-accent); font-size: 1.22em; }
.st-hub .sf-fx-dock__badge { font-size: .62rem; letter-spacing: .04em; }

/* Departure strip → soft pills */
.st-departure { padding: 11px 24px; gap: 8px; border-bottom: 1px solid var(--st-line); min-height: 46px; }
.st-departure-label { font-size: .62rem; }
.st-departure-chip { border-radius: 999px; padding: 4px 12px; min-height: 27px; background: var(--st-surface);
  border: 1px solid var(--st-line); font-size: .74rem; }
button.st-departure-chip:hover { background: rgba(255,255,255,0.055); }

/* First-dock handoff → soft cards */
.st-handoff { padding: 13px 24px; gap: 8px; border-bottom: 1px solid var(--st-line); }
.st-handoff-copy { color: var(--ink-dim); font-size: .78rem; }
.st-handoff-step { padding: 11px 14px; border-radius: var(--st-r-sm); border: 1px solid var(--st-line);
  background: var(--st-surface); box-shadow: var(--st-shadow); }
.st-handoff-step-title { font-size: .84rem; }
.st-handoff-step-copy { font-size: .76rem; line-height: 1.5; color: var(--ink-dim); }

/* Tab panels + content */
.st-tabpanel { padding: 22px 26px; }
.st-empty { font-size: .9rem; }

/* Inspector */
.st-inspector { width: 292px; border-left: 1px solid var(--st-line);
  background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent), rgba(12,17,28,0.45); }
.st-inspector-header { padding: 13px 20px; font-size: .62rem; letter-spacing: .16em; border-bottom: 1px solid var(--st-line); }
.st-inspector-content { padding: 18px 20px; gap: 20px; }
.st-ins-section { gap: 6px; padding-bottom: 18px; border-bottom: 1px solid var(--st-line); }
.st-ins-section:last-child { border-bottom: none; padding-bottom: 0; }
.st-ins-title { font-size: .6rem; letter-spacing: .14em; color: var(--ink-mute); }
.st-ins-tab-icon { color: var(--st-accent); }
.st-ins-tab-name { font-size: 1.02rem; font-weight: 650; letter-spacing: 0; }
.st-ins-desc { font-size: .82rem; line-height: 1.55; color: var(--ink-dim); }
.st-ins-row { font-size: .84rem; }
.st-ins-row-detail, .st-ins-risk-desc { font-size: .79rem; line-height: 1.55; }
.st-ins-hint { font-size: .79rem; line-height: 1.5; }

/* Cards across panels → soft elevated (replaces hard borders + cyan glows) */
.st-mission-card, .st-svc-row, .st-bar-card, .st-sy-card, .st-slot, .st-manuf-card, .st-market-planner,
.st-market-purpose, .st-sy-guide, .st-mission-guide, .st-svc-row {
  border-radius: var(--st-r-sm); border: 1px solid var(--st-line); background: var(--st-surface);
  box-shadow: var(--st-shadow); }
.st-mission-card.tracked, .st-sy-card.active, .st-slot.sel {
  border-color: color-mix(in srgb, var(--st-accent) 45%, transparent);
  box-shadow: 0 10px 26px -12px color-mix(in srgb, var(--st-accent) 34%, transparent); }
.st-shop-row { border-radius: var(--st-r-xs); }
.st-shop-row:hover { background: rgba(255,255,255,0.04); }

/* Undock refined (readiness colours preserved; pinned label/attrs untouched) */
.st-undock { background: var(--st-surface); border: 1px solid var(--st-line); box-shadow: var(--st-shadow); }
.st-undock[data-readiness="ready"] { color: var(--good); border-color: color-mix(in srgb, var(--good) 42%, transparent);
  background: color-mix(in srgb, var(--good) 13%, var(--st-surface)); }
.st-undock[data-readiness="ready"]:hover { background: color-mix(in srgb, var(--good) 26%, var(--st-surface)); box-shadow: 0 10px 24px -12px color-mix(in srgb, var(--good) 40%, transparent); }
.st-undock[data-readiness="check"] { border-color: color-mix(in srgb, var(--warn) 42%, transparent); background: color-mix(in srgb, var(--warn) 12%, var(--st-surface)); }
.st-undock[data-readiness="risk"] { border-color: color-mix(in srgb, var(--danger) 42%, transparent); background: color-mix(in srgb, var(--danger) 12%, var(--st-surface)); }

/* Comms rail */
.st-comms-ticker { padding: 8px 24px; font-size: 11.5px; border-top: 1px solid var(--st-line); background: rgba(8,12,20,0.6); }

@media (prefers-reduced-motion: reduce) {
  .st-hub *, .st-modal * {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important;
  }
  .st-station-name.acquiring::after { animation: none; }
  .st-undock::before { transition: none; }
  .st-content::after { animation: none; }
}
`;
