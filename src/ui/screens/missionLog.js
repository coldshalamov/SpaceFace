// src/ui/screens/missionLog.js — In-flight mission log.
// Shows all active + recently completed missions with progress, timer, reward, and a TRACK button.
// READ-ONLY on state; emits ui:trackMission + ui:abandonMission (+ career:ladder choose/recover/abandon)
// intents only (§5, §0.6). No career progression or owner writes from this surface.
//
// Export: missionLogScreen  (id 'missionLog').

import { SECTORS } from '../../data/sectors.js';
import { COMMODITIES } from '../../data/commodities.js';
import { confirm } from '../confirm.js';
import { FACTION_META } from '../../data/factions.js';
import { STORY_BEATS } from '../../data/missions.js';
import { escapeHtml } from '../comms.js';
import { BINDINGS } from '../bindings.js';
import {
  missionConsequenceSummary,
  missionTimePacing,
} from '../missionPreflight.js';
import { MAP_FOCUS, mapHandoffAction, openGalaxyMap } from '../mapAuthority.js';
import { buildMissionLogCareerChip } from '../careerLadderView.js';

const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

// Build a station lookup from the static SECTORS graph.
const STATION_INFO = new Map();
const SECTOR_BY_ID = new Map();
for (const sec of SECTORS) {
  SECTOR_BY_ID.set(sec.id, sec);
  for (const st of sec.stations || []) {
    STATION_INFO.set(st.id, { name: st.name, sectorId: sec.id, sectorName: sec.name });
  }
}

const STYLE_ID = 'sf-missionlog-style';
const FUEL_WARN_FRAC = 0.45;
const FUEL_CRITICAL_FRAC = 0.25;
const PROTECTION_WARN_FRAC = 0.70;
const PROTECTION_CRITICAL_FRAC = 0.35;
const DANGEROUS_MISSION_TYPES = new Set(['bounty_hunt', 'patrol_clear', 'escort', 'smuggling_run']);

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function cmdtyName(id) {
  const c = CMDTY_BY_ID.get(id);
  return c ? c.name : (id || 'cargo').replace('cmdty_', '').replace(/_/g, ' ');
}

function prettyType(t) {
  if (!t) return 'Contract';
  return titleCaseWords(t);
}

function titleCaseWords(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettyId(value, fallback = 'Target') {
  const text = String(value || '')
    .replace(/^__probe_/, 'probe_')
    .replace(/^station_/, '')
    .replace(/^sector_/, '')
    .replace(/_/g, ' ')
    .trim();
  return text ? titleCaseWords(text) : fallback;
}

export function storyBeatDisplayName(id) {
  return titleCaseWords(id || 'Story');
}

export function storyIntroducesDisplayName(value) {
  return String(value || '')
    .split('+')
    .map((part) => titleCaseWords(part.trim()))
    .filter(Boolean)
    .join(' + ');
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h >= 1) return h + 'h ' + m + 'm';
  if (m >= 1) return m + 'm ' + sec + 's';
  return sec + 's';
}

/** Build a human-readable objective description from the mission instance. */
function objectiveText(m) {
  const p = m.params || {};
  const prog = m.objectiveProgress || 0;
  const tgt = m.objectiveTarget || 1;
  const dest = m.destStationId ? destStationName(m.destStationId) : 'destination';
  switch (m.type) {
    case 'cargo_delivery':
    case 'salvage_retrieval':
    case 'passenger_transport':
      return `Deliver to ${dest}`;
    case 'bulk_trade':
      return `Sell ${prog}/${tgt} ${cmdtyName(p.cmdtyId)}`;
    case 'mining_quota':
      return `Mine ${prog}/${tgt} ${cmdtyName(p.cmdtyId)}`;
    case 'bounty_hunt':
      return 'Eliminate target';
    case 'patrol_clear':
      return `Clear ${prog}/${tgt} hostiles`;
    case 'escort':
      return `Escort to ${dest}`;
    case 'recon_scan':
      return `Scan ${prog}/${tgt} targets`;
    case 'smuggling_run':
      return `Deliver contraband to ${dest}`;
    default:
      return `${prog}/${tgt}`;
  }
}

function nextStepText(m) {
  const p = m.params || {};
  const dest = m.destStationId ? destStationName(m.destStationId) : 'the tracked marker';
  switch (m.type) {
    case 'cargo_delivery':
    case 'passenger_transport':
      return 'Next: follow tracked nav to ' + dest + ', dock, and complete the handoff.';
    case 'bulk_trade':
      return 'Next: buy or carry ' + cmdtyName(p.cmdtyId) + ', then sell into the tracked destination market.';
    case 'mining_quota':
      return 'Next: mine ' + cmdtyName(p.cmdtyId) + ' in an asteroid field, keep cargo space open, then follow the tracker.';
    case 'salvage_retrieval':
      return 'Next: recover the marked cargo, keep enough hold space, and deliver it to ' + dest + '.';
    case 'bounty_hunt':
      return 'Next: follow tracked nav, engage the target, then check this log for completion.';
    case 'patrol_clear':
      return 'Next: follow tracked nav and clear hostiles until the progress bar fills.';
    case 'escort':
      return 'Next: stay near the convoy route and protect the objective until arrival.';
    case 'recon_scan':
      return 'Next: follow tracked nav and scan each marked site.';
    case 'smuggling_run':
      return 'Next: deliver quietly to ' + dest + '; avoid scans and keep an escape route.';
    default:
      return 'Next: track this mission, undock, and follow the nav/objective marker.';
  }
}

function stripNextPrefix(text) {
  return String(text || '').replace(/^Next:\s*/i, '');
}

function missionPurposeText(m) {
  if (!m) return 'Complete the contract and secure its payout.';
  const authored = m.why || m.motive || m.brief || m.description || m.instruction
    || (m.params && (m.params.why || m.params.reason));
  if (authored) return String(authored).trim();
  switch (m.type) {
    case 'cargo_delivery': return 'Protect chain of custody and complete the contracted handoff.';
    case 'bulk_trade': return 'Fill destination demand before the route or price window closes.';
    case 'mining_quota': return 'Supply the requested ore quota and convert extraction time into a guaranteed payout.';
    case 'salvage_retrieval': return 'Recover marked property before another crew claims or strips it.';
    case 'bounty_hunt': return 'Remove the named threat and collect the posted bounty.';
    case 'patrol_clear': return 'Restore local transit safety by clearing the marked hostile presence.';
    case 'escort': return 'Keep the client alive and preserve the route through arrival.';
    case 'recon_scan': return 'Resolve the requested sensor evidence for the issuing contact.';
    case 'smuggling_run': return 'Move restricted cargo without surrendering it to customs.';
    case 'passenger_transport': return 'Deliver the passenger safely and on schedule.';
    default: return 'Complete the stated objective and close the contract cleanly.';
  }
}

function missionWaypoint(state, mission) {
  const wp = state && state.nav && state.nav.waypoint;
  if (!wp || !mission || wp.missionId !== mission.id) return null;
  return wp;
}

export function missionMapAction(state, mission, isTracked) {
  if (!state || !mission || !isTracked) return null;
  const wp = missionWaypoint(state, mission);
  const currentSectorId = state.world && state.world.currentSectorId || null;
  const targetSectorId = (wp && wp.sectorId) || mission.destSectorId || null;
  const sameSector = targetSectorId && currentSectorId && targetSectorId === currentSectorId;
  const hasLocalFix = !!(wp && wp.pos);
  if (hasLocalFix || sameSector || !targetSectorId) {
    return mapHandoffAction({
      focus: MAP_FOCUS.LOCAL,
      label: 'LOCAL MAP',
      title: 'Open Local Map',
      body: 'Show the live objective marker and nearby contacts.',
      missionId: mission.id,
      sectorId: targetSectorId,
      stationId: mission.destStationId || (wp && wp.stationId) || null,
      pos: wp && wp.pos ? wp.pos : null,
      source: 'missionLog',
    });
  }
  return mapHandoffAction({
    focus: MAP_FOCUS.GALAXY,
    label: 'STAR MAP',
    title: 'Open Star Map',
    body: 'Plot or review the jump route to this objective.',
    missionId: mission.id,
    sectorId: targetSectorId,
    stationId: mission.destStationId || (wp && wp.stationId) || null,
    pos: null,
    source: 'missionLog',
  });
}

function tradeRouteWaypoint(state) {
  const waypoint = state && state.nav && state.nav.waypoint;
  return waypoint && waypoint.kind === 'trade' && waypoint.stationId ? waypoint : null;
}

function tradeRouteStationName(waypoint) {
  if (!waypoint) return 'Trade destination';
  const info = STATION_INFO.get(waypoint.stationId);
  if (info && info.name) return info.name;
  const label = String(waypoint.label || '').split('·')[0].trim();
  return label || prettyId(waypoint.stationId, 'Trade destination');
}

function tradeRouteSectorName(waypoint) {
  if (!waypoint) return '';
  const info = waypoint.stationId ? STATION_INFO.get(waypoint.stationId) : null;
  const sectorId = waypoint.sectorId || (info && info.sectorId) || null;
  const sec = sectorId ? SECTOR_BY_ID.get(sectorId) : null;
  return waypoint.sectorName || (sec && sec.name) || prettyId(sectorId, '');
}

function tradeRouteCommodityName(waypoint) {
  const commodityId = waypoint && waypoint.commodityId;
  const def = commodityId ? CMDTY_BY_ID.get(commodityId) : null;
  return def ? def.name : prettyId(commodityId, 'cargo');
}

function tradeRouteCargoUnits(state, commodityId) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  const raw = commodityId && items ? items[commodityId] : 0;
  const qty = Math.max(0, Number(raw) || 0);
  return Math.round(qty * 10) / 10;
}

function formatUnits(value) {
  return (Math.round((Number(value) || 0) * 10) / 10).toLocaleString('en-US');
}

export function tradeRouteMapAction(state, waypoint = tradeRouteWaypoint(state)) {
  if (!state || !waypoint) return null;
  const info = waypoint.stationId ? STATION_INFO.get(waypoint.stationId) : null;
  const targetSectorId = waypoint.sectorId || (info && info.sectorId) || null;
  const currentSectorId = state.world && state.world.currentSectorId || null;
  const sameSector = targetSectorId && currentSectorId && targetSectorId === currentSectorId;
  const hasLocalFix = !!waypoint.pos;
  if (hasLocalFix || sameSector || !targetSectorId) {
    return mapHandoffAction({
      focus: MAP_FOCUS.LOCAL,
      label: 'LOCAL MAP',
      title: 'Open Local Map',
      body: 'Show the trade destination marker and nearby station contacts.',
      sectorId: targetSectorId,
      stationId: waypoint.stationId || null,
      pos: waypoint.pos || null,
      source: 'missionLog-trade',
    });
  }
  return mapHandoffAction({
    focus: MAP_FOCUS.GALAXY,
    label: 'STAR MAP',
    title: 'Open Star Map',
    body: 'Plot or review the jump route to this trade destination.',
    sectorId: targetSectorId,
    stationId: waypoint.stationId || null,
    pos: null,
    source: 'missionLog-trade',
  });
}

function tradeRouteAction(state) {
  const waypoint = tradeRouteWaypoint(state);
  if (!waypoint) return null;
  const commodityName = tradeRouteCommodityName(waypoint);
  const stationName = tradeRouteStationName(waypoint);
  const sectorName = tradeRouteSectorName(waypoint);
  const owned = tradeRouteCargoUnits(state, waypoint.commodityId);
  const mapAction = tradeRouteMapAction(state, waypoint);
  const body = owned > 0
    ? `Sell ${formatUnits(owned)}u ${commodityName} at ${stationName}; use the map handoff if the route needs a jump.`
    : `Route set to ${stationName} for ${commodityName}. Load cargo from the Market, or review the destination before launch.`;
  const meta = [
    owned > 0 ? `${formatUnits(owned)}u aboard` : 'No cargo aboard',
    sectorName,
  ].filter(Boolean).join(' · ');
  return {
    tone: owned > 0 ? 'primary' : 'warn',
    label: 'TRADE ROUTE',
    title: stationName,
    body,
    meta,
    mapAction,
  };
}

function missionTitle(m) {
  return (m && (m.title || m.name)) || prettyType(m && m.type);
}

function missionProgressLabel(m) {
  const prog = Math.max(0, Number(m && m.objectiveProgress) || 0);
  const tgt = Math.max(1, Number(m && m.objectiveTarget) || 1);
  return Math.min(100, Math.round((prog / tgt) * 100)) + '% complete';
}

function formatCredits(value) {
  return (Math.max(0, Math.round(Number(value) || 0))).toLocaleString('en-US') + ' cr';
}

function cargoLoad(state) {
  const cargo = state && state.player && state.player.cargo;
  const cap = Math.max(0, Number(cargo && cargo.capVolume) || 0);
  const used = Math.max(0, Number(cargo && cargo.usedVolume) || 0);
  return { cap, used, free: Math.max(0, cap - used), ratio: cap > 0 ? used / cap : 0 };
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function pct(frac) {
  return Math.round(clamp01(frac, 0) * 100) + '%';
}

function fuelFraction(state) {
  const fuel = state && state.fuel || {};
  const max = Number(fuel.max);
  if (!(max > 0)) return null;
  return clamp01((Number(fuel.current) || 0) / max, 0);
}

function playerShip(state) {
  return state && state.entities && state.entities.get && state.playerId != null
    ? state.entities.get(state.playerId)
    : null;
}

function protectionFraction(state) {
  const ship = playerShip(state);
  if (!ship) return null;
  const hullMax = Number(ship.hullMax);
  const armorMax = Number(ship.armorMax);
  const hull = hullMax > 0 ? clamp01((Number(ship.hull) || 0) / hullMax, 0) : 1;
  const armor = armorMax > 0 ? clamp01((Number(ship.armorHp) || 0) / armorMax, 0) : 1;
  return Math.min(hull, armor);
}

function missionRiskTier(m) {
  const raw = Number(m && (m.riskTier != null ? m.riskTier : m.risk));
  return Number.isFinite(raw) ? Math.max(0, Math.min(4, Math.round(raw))) : 0;
}

function missionDestSectorId(m) {
  if (!m) return null;
  if (m.destSectorId) return m.destSectorId;
  const stnInfo = m.destStationId ? STATION_INFO.get(m.destStationId) : null;
  if (stnInfo && stnInfo.sectorId) return stnInfo.sectorId;
  const raw = String(m.dest || '');
  return raw.startsWith('sector_') ? raw : null;
}

function missionLeavesSector(state, m) {
  const target = missionDestSectorId(m);
  const current = state && state.world && state.world.currentSectorId || null;
  return !!(target && current && target !== current);
}

function missionRouteTermText(state, m) {
  const target = missionDestSectorId(m);
  const current = state && state.world && state.world.currentSectorId || null;
  if (target && current && target !== current) return 'off-sector route';
  if (target && current && target === current) return 'local route';
  return 'route pending';
}

function isRiskWork(m) {
  return !!(m && (DANGEROUS_MISSION_TYPES.has(m.type) || missionRiskTier(m) >= 2));
}

export function activeMissionContractTerms(m, state) {
  if (!m) return [];
  const terms = [];
  const consequences = missionConsequenceSummary(m);
  const pays = [];
  if (consequences.reward > 0) pays.push('+' + formatCredits(consequences.reward));
  if (consequences.repReward > 0) pays.push('+' + consequences.repReward + ' rep');
  terms.push({
    kind: 'ok',
    label: 'Pays',
    text: pays.length ? pays.join(' / ') : 'close cleanly',
  });

  const pacing = missionTimePacing(m, state);
  if (pacing && pacing.chip) {
    terms.push({
      kind: pacing.chip.kind || 'info',
      label: 'Clock',
      text: pacing.chip.text,
    });
  }

  const risk = missionRiskTier(m);
  terms.push({
    kind: risk >= 3 ? 'warn' : (risk >= 2 ? 'info' : 'ok'),
    label: 'Risk',
    text: 'R' + risk + ' / ' + missionRouteTermText(state, m),
  });

  if (consequences.collateral > 0) {
    terms.push({
      kind: 'warn',
      label: 'Stake',
      text: formatCredits(consequences.collateral) + ' collateral',
    });
  }

  const miss = [];
  if (consequences.repPenalty < 0) miss.push(consequences.repPenalty + ' rep');
  if (consequences.collateral > 0) miss.push('stake forfeited');
  miss.push('no payout');
  terms.push({
    kind: (consequences.repPenalty < 0 || consequences.collateral > 0) ? 'warn' : 'info',
    label: 'Miss',
    text: miss.join(' / '),
  });

  if (m.type === 'smuggling_run') {
    terms.push({ kind: 'bad', label: 'Heat', text: 'customs scans escalate' });
  }

  return terms.slice(0, 6);
}

export function missionCommandBrief(m, state) {
  if (!m) return null;
  const terms = activeMissionContractTerms(m, state);
  const term = (label, fallback) => terms.find((item) => item.label === label)?.text || fallback;
  const stake = terms.find((item) => item.label === 'Stake');
  return Object.freeze({
    what: objectiveText(m),
    where: destLabel(m),
    how: stripNextPrefix(nextStepText(m)),
    why: missionPurposeText(m),
    reward: term('Pays', 'close cleanly'),
    risk: [term('Risk', 'R0 / route pending'), stake ? stake.text : 'no collateral'].join(' · '),
    completion: missionProgressLabel(m),
  });
}

function commandBriefHtml(brief) {
  if (!brief) return '';
  const facts = [
    ['What', brief.what],
    ['Where', brief.where],
    ['How', brief.how],
    ['Why', brief.why],
    ['Reward', brief.reward],
    ['Risk', brief.risk],
  ];
  return '<div class="sf-mlog-command-brief" role="list" aria-label="Tracked mission command brief">' +
    facts.map(([label, value]) => (
      '<div class="sf-mlog-command-fact" role="listitem">' +
        '<b>' + escapeHtml(label) + '</b>' +
        '<span>' + escapeHtml(value || '—') + '</span>' +
      '</div>'
    )).join('') +
  '</div>';
}

function contractTermsHtml(m, state) {
  const terms = activeMissionContractTerms(m, state);
  if (!terms.length) return '';
  return '<div class="sf-mlog-terms mono" aria-label="Contract terms">' + terms.map((term) => {
    const kind = ['ok', 'info', 'warn', 'bad'].includes(term.kind) ? term.kind : 'info';
    return '<span class="sf-mlog-term sf-mlog-term--' + kind + '">' +
      '<b>' + escapeHtml(term.label) + '</b>' +
      '<span>' + escapeHtml(term.text) + '</span>' +
    '</span>';
  }).join('') + '</div>';
}

function serviceReadinessAction(state, activeMissions) {
  const active = activeMissions || [];
  const fuel = fuelFraction(state);
  const protection = protectionFraction(state);
  const routePressure = active.some((m) => missionLeavesSector(state, m));
  const riskPressure = active.some((m) => isRiskWork(m));

  if (fuel != null && (fuel < FUEL_CRITICAL_FRAC || (fuel < FUEL_WARN_FRAC && (active.length || routePressure)))) {
    const critical = fuel < FUEL_CRITICAL_FRAC;
    return {
      tone: critical ? 'bad' : 'warn',
      label: 'SERVICE',
      title: critical ? 'Refuel before committing' : 'Top off fuel',
      body: critical
        ? 'Fuel reserves are critical. Dock for Services before trusting a jump route or timed handoff.'
        : 'Fuel reserves are thin. Refuel at the next station before a contract sends you off-route.',
      meta: pct(fuel) + ' fuel',
    };
  }

  if (protection != null && (protection < PROTECTION_CRITICAL_FRAC || (protection < PROTECTION_WARN_FRAC && riskPressure))) {
    const critical = protection < PROTECTION_CRITICAL_FRAC;
    return {
      tone: critical ? 'bad' : 'warn',
      label: 'SERVICE',
      title: critical ? 'Repair before committing' : 'Patch hull before risk work',
      body: critical
        ? 'Hull or armor is critical. Dock for repairs before taking fire, debris, or hard docking bumps.'
        : 'This contract may turn hostile. Patch hull and armor before you turn the tracker into a fight.',
      meta: pct(protection) + ' protection',
    };
  }

  return null;
}

function mapOpenIntentFromButton(btn) {
  if (!btn) return { focus: MAP_FOCUS.SYSTEM, source: 'missionLog' };
  const sectorId = btn.getAttribute('data-map-sector-id') || null;
  const stationId = btn.getAttribute('data-map-station-id') || null;
  const missionId = btn.getAttribute('data-mid') || null;
  const focus = btn.getAttribute('data-map-focus')
    || btn.getAttribute('data-screen-id')
    || MAP_FOCUS.SYSTEM;
  let pos = null;
  const px = Number(btn.getAttribute('data-map-pos-x'));
  const pz = Number(btn.getAttribute('data-map-pos-z'));
  if (Number.isFinite(px) && Number.isFinite(pz)) pos = { x: px, z: pz };
  return {
    focus,
    screenId: btn.getAttribute('data-screen-id') || 'galaxyMap',
    sectorId,
    stationId,
    missionId,
    pos,
    source: btn.getAttribute('data-map-source') || 'missionLog',
  };
}

function openMapScreen(ctx, screenIdOrIntent, maybeIntent) {
  const intent = (screenIdOrIntent && typeof screenIdOrIntent === 'object')
    ? screenIdOrIntent
    : { screenId: screenIdOrIntent, ...(maybeIntent || {}) };
  // Normal-player map authority: always open galaxyMap; preserve LOCAL/STAR focus + target intent.
  openGalaxyMap(ctx, {
    ...intent,
    source: (intent && intent.source) || 'missionLog',
  });
}

function mapActionButtonAttrs(mapAction, missionId) {
  if (!mapAction) return '';
  const pos = mapAction.pos;
  return ' data-screen-id="' + escapeHtml(mapAction.screenId) + '"'
    + ' data-map-focus="' + escapeHtml(mapAction.focus || MAP_FOCUS.SYSTEM) + '"'
    + (mapAction.sectorId ? ' data-map-sector-id="' + escapeHtml(mapAction.sectorId) + '"' : '')
    + (mapAction.stationId ? ' data-map-station-id="' + escapeHtml(mapAction.stationId) + '"' : '')
    + (pos && Number.isFinite(pos.x) ? ' data-map-pos-x="' + escapeHtml(String(pos.x)) + '"' : '')
    + (pos && Number.isFinite(pos.z) ? ' data-map-pos-z="' + escapeHtml(String(pos.z)) + '"' : '')
    + (mapAction.source ? ' data-map-source="' + escapeHtml(mapAction.source) + '"' : '')
    + ' data-mid="' + escapeHtml(missionId || mapAction.missionId || '') + '"';
}

/** Resolve named contact + location for a career chip (read-only map + mission join). */
function careerContactLocation(chip, state) {
  if (!chip) return { contact: null, location: null };
  const map = chip.mapAction || null;
  const stationId = map && map.stationId ? map.stationId : null;
  const stn = stationId ? STATION_INFO.get(stationId) : null;
  const sectorId = (map && map.sectorId) || (stn && stn.sectorId) || null;
  const sec = sectorId ? SECTOR_BY_ID.get(sectorId) : null;
  const locationParts = [];
  if (stn && stn.name) locationParts.push(stn.name);
  else if (stationId) locationParts.push(prettyId(stationId, 'Station'));
  if (sec && sec.name) locationParts.push(sec.name);
  else if (sectorId && !(stn && stn.sectorName)) locationParts.push(prettyId(sectorId, 'Sector'));
  else if (stn && stn.sectorName && !(sec && sec.name)) locationParts.push(stn.sectorName);
  const location = locationParts.length ? locationParts.join(' · ') : null;

  // Contact: faction short (linked ladder mission) or professional path title — never portraits.
  let contact = chip.title || null;
  const linkedId = chip.linkedMissionId || null;
  if (linkedId && state && state.missions && Array.isArray(state.missions.active)) {
    const m = state.missions.active.find((x) => x && x.id === linkedId);
    if (m && m.factionId) {
      const fac = FACTION_BY_ID.get(m.factionId);
      if (fac && (fac.short || fac.name)) {
        contact = String(fac.short || fac.name);
      }
    }
  }
  return { contact, location };
}

/**
 * Compact consequence preview — linked mission stakes, choice seal, or recovery hint.
 * Labels only; no raw receipt dumps or owner-field math beyond missionConsequenceSummary.
 */
function careerConsequencePreview(chip, state) {
  if (!chip) return null;
  if (chip.canChoose && Array.isArray(chip.choices) && chip.choices.length) {
    const labels = chip.choices
      .filter((c) => c && c.id && c.enabled !== false)
      .map((c) => c.label || c.id)
      .filter(Boolean)
      .slice(0, 3);
    if (labels.length) return 'Seals: ' + labels.join(' · ');
  }
  const linkedId = chip.linkedMissionId || null;
  if (linkedId && state && state.missions && Array.isArray(state.missions.active)) {
    const m = state.missions.active.find((x) => x && x.id === linkedId);
    if (m) {
      const c = missionConsequenceSummary(m);
      const bits = [];
      if (c.reward > 0) bits.push('+' + formatCredits(c.reward));
      if (c.repReward > 0) bits.push('+' + c.repReward + ' rep');
      if (c.collateral > 0) bits.push(formatCredits(c.collateral) + ' stake');
      if (c.repPenalty < 0) bits.push(c.repPenalty + ' rep miss');
      if (bits.length) return bits.join(' · ');
    }
  }
  const recovery = chip.recovery;
  if (
    recovery
    && (chip.status === 'recovering' || chip.status === 'step_failed')
    && !chip.canRecover
    && Number.isFinite(recovery.secondsLeft)
    && recovery.secondsLeft > 0
  ) {
    return 'Retry in ' + Math.ceil(recovery.secondsLeft) + 's';
  }
  return null;
}

function careerStatusMod(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 'active';
  if (s === 'offered') return 'offered';
  if (s === 'step_failed' || s === 'failed') return 'failed';
  if (s === 'recovering') return 'recovering';
  if (s === 'completed' || s === 'complete') return 'complete';
  if (s === 'abandoned') return 'abandoned';
  return 'idle';
}

/** HTML for mission-log career ladder chips (pure presenter → DOM). No accept; no owner writes. */
function careerChipHtml(chip, state) {
  if (!chip) return '';
  const careerId = chip.careerId || '';
  const title = chip.title || careerId || 'Career path';
  const stepTitle = chip.stepTitle || '';
  const statusLabel = chip.statusLabel || chip.status || '';
  const statusMod = careerStatusMod(chip.status || statusLabel);
  const progressLabel = chip.progressLabel
    || ((chip.stepsTotal > 0)
      ? ('Step ' + (chip.stepsDone || 0) + '/' + chip.stepsTotal)
      : '');
  const progressAria = (chip.stepsTotal > 0)
    ? ('Progress: step ' + Math.min(chip.stepsTotal, Math.max(1, (chip.stepsDone || 0) + (chip.status === 'completed' ? 0 : 1))) + ' of ' + chip.stepsTotal)
    : (progressLabel || 'Progress');
  const mapAction = chip.mapAction;
  const mapLabel = (mapAction && mapAction.label) || 'MAP';
  const mapTitle = (mapAction && (mapAction.title || mapAction.body)) || ('Open map for ' + (stepTitle || title));
  const choices = (chip.canChoose && Array.isArray(chip.choices)) ? chip.choices : [];
  const linkedId = chip.linkedMissionId || null;
  const collapsed = !!chip.collapsed;
  const place = careerContactLocation(chip, state);
  const consequence = careerConsequencePreview(chip, state);
  const placeLine = [place.contact, place.location].filter(Boolean).join(' · ');

  let actions = '';
  if (mapAction) {
    actions += '<button class="sf-mlog-career-btn sf-mlog-career-btn-map" type="button"'
      + ' data-career-act="openMap" data-career-id="' + escapeHtml(careerId) + '"'
      + mapActionButtonAttrs(mapAction, linkedId || mapAction.missionId || '')
      + ' title="' + escapeHtml(mapTitle) + '"'
      + ' aria-label="' + escapeHtml(mapTitle) + '">'
      + escapeHtml(mapLabel) + '</button>';
  }
  if (chip.canRecover) {
    actions += '<button class="sf-mlog-career-btn sf-mlog-career-btn-recover" type="button"'
      + ' data-career-act="recover" data-career-id="' + escapeHtml(careerId) + '"'
      + ' aria-label="' + escapeHtml('Retry ' + (stepTitle || title)) + '">RETRY</button>';
  }
  if (linkedId) {
    actions += '<button class="sf-mlog-career-btn sf-mlog-career-btn-track" type="button"'
      + ' data-career-act="track" data-career-id="' + escapeHtml(careerId) + '"'
      + ' data-mid="' + escapeHtml(linkedId) + '"'
      + ' aria-label="' + escapeHtml('Track navigation for ' + title) + '">TRACK NAV</button>';
  }
  if (chip.canAbandon && !collapsed) {
    actions += '<button class="sf-mlog-career-btn sf-mlog-career-btn-abandon" type="button"'
      + ' data-career-act="abandon" data-career-id="' + escapeHtml(careerId) + '"'
      + ' data-career-title="' + escapeHtml(title) + '"'
      + ' aria-label="' + escapeHtml('Abandon ' + title) + '">ABANDON</button>';
  }

  let choiceHtml = '';
  if (choices.length) {
    choiceHtml = '<div class="sf-mlog-career-choices" role="group" aria-label="Path decisions">'
      + choices.map((c) => {
        if (!c || !c.id) return '';
        const label = c.label || c.id;
        const blocked = c.enabled === false;
        return '<button class="sf-mlog-career-btn sf-mlog-career-btn-choice" type="button"'
          + ' data-career-act="choose" data-career-id="' + escapeHtml(careerId) + '"'
          + ' data-choice-id="' + escapeHtml(c.id) + '"'
          + (blocked ? ' disabled' : '')
          + ' aria-label="' + escapeHtml(label + ' for ' + (stepTitle || title)) + '">'
          + escapeHtml(label) + '</button>';
      }).join('')
      + '</div>';
  }

  return '<div class="sf-mlog-career'
    + (collapsed ? ' sf-mlog-career--collapsed' : '')
    + ' sf-mlog-career--' + statusMod + '"'
    + ' data-testid="mission-log-career-chip"'
    + ' data-career-id="' + escapeHtml(careerId) + '"'
    + ' data-career-status="' + escapeHtml(String(chip.status || statusLabel || '')) + '"'
    + ' role="region"'
    + ' aria-label="' + escapeHtml(title + (statusLabel ? (', ' + statusLabel) : '')) + '">'
    + '<div class="sf-mlog-career-top">'
    +   '<span class="sf-mlog-career-title">' + escapeHtml(title) + '</span>'
    +   (statusLabel
      ? '<span class="sf-mlog-career-status mono" role="status">' + escapeHtml(String(statusLabel)) + '</span>'
      : '')
    + '</div>'
    + (stepTitle
      ? '<div class="sf-mlog-career-step mono">' + escapeHtml(stepTitle) + '</div>'
      : '')
    + (placeLine
      ? '<div class="sf-mlog-career-place mono" aria-label="'
        + escapeHtml([place.contact ? ('Contact ' + place.contact) : '', place.location ? ('Location ' + place.location) : ''].filter(Boolean).join(', '))
        + '">'
        + (place.contact
          ? '<span class="sf-mlog-career-contact">' + escapeHtml(place.contact) + '</span>'
          : '')
        + (place.contact && place.location ? '<span class="sf-mlog-career-place-sep" aria-hidden="true"> · </span>' : '')
        + (place.location
          ? '<span class="sf-mlog-career-location">' + escapeHtml(place.location) + '</span>'
          : '')
        + '</div>'
      : '')
    + (chip.objective
      ? '<div class="sf-mlog-career-objective">' + escapeHtml(chip.objective) + '</div>'
      : '')
    + (progressLabel
      ? '<div class="sf-mlog-career-progress mono" aria-label="' + escapeHtml(progressAria) + '">'
        + escapeHtml(progressLabel) + '</div>'
      : '')
    + (chip.nextAction
      ? '<div class="sf-mlog-career-next" aria-live="polite">' + escapeHtml(chip.nextAction) + '</div>'
      : '')
    + (consequence
      ? '<div class="sf-mlog-career-consequence mono" aria-label="Consequence preview">'
        + escapeHtml(consequence) + '</div>'
      : '')
    + (chip.failureLine
      ? '<div class="sf-mlog-career-fail" aria-live="polite">' + escapeHtml(chip.failureLine) + '</div>'
      : '')
    + (chip.receiptLine
      ? '<div class="sf-mlog-career-receipt" aria-live="polite">' + escapeHtml(chip.receiptLine) + '</div>'
      : '')
    + choiceHtml
    + (actions ? '<div class="sf-mlog-career-actions" role="group" aria-label="Career actions">' + actions + '</div>' : '')
    + '</div>';
}


function isMissionLogKey(ev) {
  const key = ev && ev.key;
  return key === BINDINGS.missionLog.key || key === BINDINGS.missionLog.label;
}

function storyActionForBeat(beat, state) {
  const story = state && state.story || {};
  const branch = story.branch || null;
  const chainProgress = story.chainProgress || 0;
  switch (beat && beat.beat) {
    case 0:
      return {
        tone: 'primary',
        label: 'STORY',
        title: 'Follow the anomaly',
        body: 'Mine the 47-A signal, then dock at Helios before the manifest rolls over.',
        meta: 'Mining',
      };
    case 1:
      return {
        tone: 'primary',
        label: 'CONTRACT',
        title: 'Take a haul',
        body: 'Pick a low-risk cargo or trade contract from a station board, then track it before undocking.',
        meta: 'Trade',
      };
    case 2:
      return {
        tone: 'primary',
        label: 'COMBAT',
        title: 'Arm for a bounty',
        body: 'Fit the Kestrel for a low-risk bounty, track the target, and cash the first kill.',
        meta: 'Bounty',
      };
    case 3:
      return {
        tone: 'primary',
        label: 'SHIPYARD',
        title: 'Fund the next hull',
        body: 'Run short hauls, mining, or safe bounty work until a tier-2 hull is affordable.',
        meta: ((state && state.player && state.player.credits) || 0).toLocaleString() + ' cr',
      };
    case 4:
      return {
        tone: 'primary',
        label: 'FACTION',
        title: 'Choose a sponsor',
        body: 'Accept an intro contract from MTS, SCN, or the Free Captains to lock your first path.',
        meta: 'Branch',
      };
    case 5:
      return {
        tone: 'primary',
        label: 'CHAIN',
        title: branch ? 'Advance ' + storyBeatDisplayName(branch) + ' work' : 'Prove a path',
        body: 'Complete your faction chain and keep the next contract tracked between docks.',
        meta: chainProgress ? (chainProgress + ' done') : 'Faction',
      };
    case 6:
      return {
        tone: 'primary',
        label: 'ASSET',
        title: 'Plant income',
        body: 'Deploy a drone, trader, or outpost so the sector starts earning while you fly.',
        meta: 'Passive',
      };
    case 7:
      return {
        tone: 'primary',
        label: 'ENDGAME',
        title: 'Build sector power',
        body: 'Push toward 100,000cr net worth and 50 rep with your chosen faction.',
        meta: 'Deep Reach',
      };
    default:
      return beat ? {
        tone: 'primary',
        label: 'STORY',
        title: storyBeatDisplayName(beat.id),
        body: beat.objective || 'Follow the current story objective.',
        meta: 'Beat ' + beat.beat,
      } : null;
  }
}

export function recommendedActions(state, activeMissions, trackedMissionId) {
  const active = (activeMissions || []).filter((m) => m && m.status === 'active');
  const tracked = trackedMissionId ? active.find((m) => m.id === trackedMissionId) : null;
  const beatIndex = state && state.story ? (state.story.beatIndex || 0) : 0;
  const storyBeat = STORY_BEATS[beatIndex];
  const storyAction = storyActionForBeat(storyBeat, state);
  const activeTradeRoute = tradeRouteAction(state);
  const cargo = cargoLoad(state);
  const readiness = serviceReadinessAction(state, tracked ? [tracked] : active);
  const actions = [];

  if (tracked) {
    const mapAction = missionMapAction(state, tracked, true);
    const brief = missionCommandBrief(tracked, state);
    actions.push({
      tone: 'primary',
      label: 'TRACKED',
      title: missionTitle(tracked),
      body: stripNextPrefix(nextStepText(tracked)),
      meta: missionProgressLabel(tracked),
      brief,
      missionId: tracked.id,
      mapAction,
    });
  } else if (activeTradeRoute) {
    actions.push(activeTradeRoute);
  } else if (active.length) {
    const candidate = active.find((m) => (m.deadline_s || 0) > (state && state.simTime || 0)) || active[0];
    actions.push({
      tone: 'warn',
      label: 'UNTRACKED',
      title: 'Track ' + missionTitle(candidate),
      body: 'Set one active contract as your nav target before leaving the station lane.',
      meta: active.length === 1 ? '1 active' : active.length + ' active',
      action: 'track',
      actionLabel: 'TRACK NAV',
      missionId: candidate.id,
    });
  } else if (storyAction) {
    actions.push(storyAction);
  }

  if (readiness) actions.push(readiness);

  if (cargo.cap > 0 && cargo.ratio >= 0.9) {
    actions.push({
      tone: 'warn',
      label: 'HOLD',
      title: 'Unload cargo',
      body: 'The hold is nearly full. Sell goods or finish a delivery before taking another one-load contract.',
      meta: cargo.free.toFixed(cargo.free < 10 ? 1 : 0) + 'u free',
    });
  } else if (!active.length && cargo.cap > 0 && storyBeat && (storyBeat.beat === 0 || storyBeat.beat === 1)) {
    actions.push({
      tone: 'info',
      label: 'READINESS',
      title: 'Keep the hold open',
      body: 'Early mining and haul jobs pay fastest when you leave enough room for contract cargo.',
      meta: cargo.free.toFixed(cargo.free < 10 ? 1 : 0) + 'u free',
    });
  }

  if (storyAction && actions.every((a) => a.title !== storyAction.title) && actions.length < 3) {
    actions.push(storyAction);
  }

  if (!active.length && actions.length < 3) {
    actions.push({
      tone: 'info',
      label: 'BOARD',
      title: 'Favor low risk',
      body: 'Pick a nearby R0-R1 contract first; reliable payouts beat distant prestige early.',
      meta: 'Starter work',
    });
  }

  return actions.slice(0, 3);
}

function receiptDestinationLabel(receipt) {
  const stnInfo = receipt && receipt.destStationId ? STATION_INFO.get(receipt.destStationId) : null;
  if (stnInfo && stnInfo.name) return stnInfo.name;
  const secInfo = receipt && receipt.destSectorId ? SECTOR_BY_ID.get(receipt.destSectorId) : null;
  return secInfo && secInfo.name ? secInfo.name : '';
}

function receiptOutcomeLabel(outcome) {
  switch (outcome) {
    case 'completed': return 'Completed';
    case 'failed': return 'Failed';
    case 'expired': return 'Expired';
    default: return 'Settled';
  }
}

function receiptTone(outcome) {
  if (outcome === 'completed') return 'ok';
  if (outcome === 'failed') return 'bad';
  return 'warn';
}

function receiptReasonLabel(reason) {
  switch (reason) {
    case 'deadline': return 'Deadline missed';
    case 'abandoned': return 'Abandoned by pilot';
    case 'escort_abandoned': return 'Convoy left behind';
    case 'escortee_lost': return 'Escort lost';
    case 'busted': return 'Customs scan detected contraband';
    case 'failed': return 'Contract failed';
    default: return reason ? prettyId(reason, 'settled') : '';
  }
}

export function missionReceiptRows(state, limit = 5) {
  const receipts = state && state.missions && Array.isArray(state.missions.receipts)
    ? state.missions.receipts
    : [];
  const max = Math.max(0, Math.floor(Number(limit) || 0));
  return receipts.filter(Boolean).slice(0, max).map((receipt) => {
    const outcome = receipt.outcome || 'settled';
    const completed = outcome === 'completed';
    const rewardCr = Math.max(0, Number(receipt.rewardCr) || 0);
    const refundCr = Math.max(0, Number(receipt.collateralRefundCr) || 0);
    const lostCr = Math.max(0, Number(receipt.collateralLostCr) || 0);
    const repDelta = Math.round(Number(receipt.repDelta) || 0);
    const researchPoints = Math.max(0, Math.round(Number(receipt.researchPoints) || 0));
    const parts = [];

    if (completed) {
      parts.push(rewardCr > 0 ? 'Paid +' + formatCredits(rewardCr) : 'Closed without payout');
      if (repDelta > 0) parts.push('+' + repDelta + ' contract standing');
      if (refundCr > 0) parts.push(formatCredits(refundCr) + ' stake returned');
      if (researchPoints > 0) parts.push('+' + researchPoints + ' research');
    } else {
      parts.push('No payout');
      if (repDelta < 0) parts.push(repDelta + ' contract standing');
      if (lostCr > 0) parts.push(formatCredits(lostCr) + ' stake forfeited');
    }

    const dest = receiptDestinationLabel(receipt);
    const meta = [
      prettyType(receipt.type),
      dest,
      receipt.reason ? 'Reason: ' + receiptReasonLabel(receipt.reason) : '',
    ].filter(Boolean).join(' · ');

    return {
      tone: receiptTone(outcome),
      outcome: receiptOutcomeLabel(outcome),
      title: receipt.title || prettyType(receipt.type),
      body: parts.join(' · '),
      meta,
    };
  });
}

function destStationName(id) {
  const info = STATION_INFO.get(id);
  return info ? info.name : 'destination';
}

function destLabel(m) {
  const stnInfo = m.destStationId ? STATION_INFO.get(m.destStationId) : null;
  const secInfo = m.destSectorId ? SECTOR_BY_ID.get(m.destSectorId) : null;
  if (stnInfo) return stnInfo.name + (secInfo ? ' (' + secInfo.name + ')' : '');
  if (secInfo) return secInfo.name + ' sector';
  return '—';
}

export const missionLogScreen = {
  id: 'missionLog',
  _ctx: null,
  _listEl: null,
  _compListEl: null,
  _recommendEl: null,
  _subbed: false,

  mount(rootEl, ctx) {
    this._ctx = ctx;
    this._rootEl = rootEl;
    injectStyle();

    rootEl.innerHTML = '';
    rootEl.classList.add('panel', 'sf-mlog');

    // Header
    const head = el('div', 'sf-mlog-head');
    head.innerHTML =
      '<span class="sf-mlog-title">MISSION LOG</span>' +
      '<span class="sf-mlog-hint mono">' + BINDINGS.missionLog.label + ' to close</span>' +
      '<button class="sf-mlog-close" type="button" aria-label="Close Mission Log">CLOSE</button>';
    rootEl.appendChild(head);
    this._closeBtn = head.querySelector('.sf-mlog-close');

    this._closeBtn.addEventListener('click', () => {
      const mgr = getManager(ctx);
      if (mgr) mgr.popScreen();
    });

    // Active missions section
    const activeH = el('div', 'sf-mlog-section-h', 'ACTIVE MISSIONS');
    rootEl.appendChild(activeH);

    const list = el('div', 'sf-mlog-list');
    rootEl.appendChild(list);
    this._listEl = list;

    // Story context is retained in the data model but not painted as a parallel command card.
    // CURRENT ACTION below owns "what now"; the active list owns contract detail.
    const storyH = el('div', 'sf-mlog-section-h sf-mlog-section-story', 'STORY OBJECTIVE');
    storyH.hidden = true;
    rootEl.insertBefore(storyH, activeH);
    const storyEl = el('div', 'sf-mlog-story');
    storyEl.hidden = true;
    rootEl.insertBefore(storyEl, activeH);
    this._storyHeader = storyH;
    this._storyEl = storyEl;

    // Replaces the equal-weight RECOMMENDED NEXT grid with one explicit command rail.
    const recH = el('div', 'sf-mlog-section-h sf-mlog-section-rec', 'CURRENT ACTION');
    recH.id = 'sf-mlog-current-action-heading';
    rootEl.insertBefore(recH, activeH);
    const recEl = el('div', 'sf-mlog-recommend');
    recEl.setAttribute('role', 'region');
    recEl.setAttribute('aria-labelledby', recH.id);
    rootEl.insertBefore(recEl, activeH);
    this._recommendHeader = recH;
    this._recommendEl = recEl;

    // Career ladder chip (CL-UI-03): after story/recommended, before active missions.
    // Read-only path strip — choose/recover/abandon + map/track only; no accept from flight log.
    const careerH = el('div', 'sf-mlog-section-h sf-mlog-section-career', 'CAREER LADDER');
    careerH.id = 'sf-mlog-career-heading';
    careerH.hidden = true;
    rootEl.insertBefore(careerH, activeH);
    const careerEl = el('div', 'sf-mlog-career-list');
    careerEl.setAttribute('role', 'region');
    careerEl.setAttribute('aria-labelledby', 'sf-mlog-career-heading');
    careerEl.hidden = true;
    rootEl.insertBefore(careerEl, activeH);
    this._careerHeader = careerH;
    this._careerEl = careerEl;

    // Completed missions section
    const compH = el('div', 'sf-mlog-section-h sf-mlog-section-comp');
    compH.innerHTML = '<span>COMPLETED</span><button class="sf-mlog-toggle" type="button" aria-expanded="false" aria-controls="sf-mlog-completed-list">Show</button>';
    rootEl.appendChild(compH);
    this._compHeader = compH;

    const compList = el('div', 'sf-mlog-comp-list');
    compList.id = 'sf-mlog-completed-list';
    compList.style.display = 'none';
    rootEl.appendChild(compList);
    this._compListEl = compList;
    this._compVisible = false;

    compH.querySelector('.sf-mlog-toggle').addEventListener('click', () => {
      this._compVisible = !this._compVisible;
      compList.style.display = this._compVisible ? 'block' : 'none';
      const toggle = compH.querySelector('.sf-mlog-toggle');
      toggle.textContent = this._compVisible ? 'Hide' : 'Show';
      toggle.setAttribute('aria-expanded', this._compVisible ? 'true' : 'false');
      if (this._compVisible) this._renderCompleted();
    });

    recEl.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-rec-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-rec-act');
      if (act === 'track') {
        ctx.bus.emit('ui:trackMission', { missionId: btn.getAttribute('data-mid') });
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
        this._render();
      } else if (act === 'openMap') {
        openMapScreen(ctx, mapOpenIntentFromButton(btn));
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
      }
    });

    careerEl.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-career-act]');
      if (!btn || !careerEl.contains(btn) || btn.disabled) return;
      const act = btn.getAttribute('data-career-act');
      const careerId = btn.getAttribute('data-career-id');
      if (!act) return;

      if (act === 'openMap') {
        openMapScreen(ctx, mapOpenIntentFromButton(btn));
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
        return;
      }
      if (act === 'track') {
        const missionId = btn.getAttribute('data-mid');
        if (missionId) {
          ctx.bus.emit('ui:trackMission', { missionId });
          ctx.bus.emit('audio:cue', { id: 'ui_click' });
          this._render();
        }
        return;
      }
      if (act === 'choose') {
        const choiceId = btn.getAttribute('data-choice-id');
        if (!careerId || !choiceId) return;
        ctx.bus.emit('career:ladder:choose', { careerId, choiceId });
        ctx.bus.emit('audio:cue', { id: 'ui_accept' });
        this._render();
        return;
      }
      if (act === 'recover') {
        if (!careerId) return;
        ctx.bus.emit('career:ladder:recover', { careerId });
        ctx.bus.emit('audio:cue', { id: 'ui_accept' });
        this._render();
        return;
      }
      if (act === 'abandon') {
        if (!careerId) return;
        const title = btn.getAttribute('data-career-title') || careerId;
        const ok = await confirm({
          title: 'Abandon path?',
          body: 'Close ' + title + '? Other professional paths stay open.',
          confirmLabel: 'Abandon',
          cancelLabel: 'Keep path',
          danger: true,
        });
        if (!ok) return;
        ctx.bus.emit('career:ladder:abandon', { careerId });
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
        this._render();
      }
    });

    // Keyboard/controller-friendly roving among career CTAs (Arrow keys). Enter/Space are native.
    careerEl.addEventListener('keydown', (ev) => {
      const key = ev.key;
      if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'ArrowDown' && key !== 'ArrowUp') {
        return;
      }
      const buttons = Array.from(careerEl.querySelectorAll('button[data-career-act]:not([disabled])'));
      if (buttons.length < 2) return;
      const i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      ev.preventDefault();
      const dir = (key === 'ArrowRight' || key === 'ArrowDown') ? 1 : -1;
      const next = buttons[(i + dir + buttons.length) % buttons.length];
      if (next) next.focus();
    });

    // Delegated click handler for buttons
    list.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-mid]');
      if (!btn) return;
      const missionId = btn.getAttribute('data-mid');
      const act = btn.getAttribute('data-act');
      if (act === 'track') {
        ctx.bus.emit('ui:trackMission', { missionId });
      } else if (act === 'openMap') {
        openMapScreen(ctx, mapOpenIntentFromButton(btn));
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
        return;
      } else if (act === 'abandon') {
        // Abandoning a mission forfeits progress + any standing/reputation gain — confirm (UX-2).
        const active = (ctx.state.missions && ctx.state.missions.active) || [];
        const m = active.find((x) => x.id === missionId);
        const title = (m && (m.title || m.name)) || 'this mission';
        const consequences = m ? missionConsequenceSummary(m) : null;
        const loss = ['You will lose all progress on this contract.'];
        if (consequences && consequences.collateral > 0) loss.push(formatCredits(consequences.collateral) + ' stake forfeited');
        if (consequences && consequences.repPenalty < 0) loss.push(consequences.repPenalty + ' contract standing');
        loss.push('No payout will be issued.');
        const ok = await confirm({
          title: 'Abandon ' + title + '?',
          body: loss.join(' '),
          confirmLabel: 'Abandon', danger: true,
        });
        if (!ok) return;
        ctx.bus.emit('ui:abandonMission', { missionId });
      }
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      this._render();
    });

    this._subscribe();
    this._render();
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    this._render();
    this._focusPrimaryControl();
  },

  onHide() {},

  /**
   * Event-driven refresh. Periodic low-cadence ticks from uiRoot must no-op:
   * a full repaint every 18 frames recreates aria-live nodes, detaches confirm
   * openers, and wipes focus. Real bus handlers call _render() directly.
   */
  refresh(ctx, options = {}) {
    if (ctx) this._ctx = ctx;
    if (options && options.periodic) return;
    this._render();
  },

  onKey(ev) {
    if (isMissionLogKey(ev)) {
      const mgr = getManager(this._ctx);
      if (mgr) mgr.popScreen();
      return true; // consumed
    }
    return false;
  },

  /** Focus the current action first, then a career CTA, else CLOSE. */
  _focusPrimaryControl() {
    const career = this._careerEl;
    let target = this._recommendEl && this._recommendEl.querySelector(
      'button[data-rec-act="track"]:not([disabled]),button[data-rec-act="openMap"]:not([disabled])',
    );
    if (career && !career.hidden) {
      target = target || career.querySelector(
        'button[data-career-act="openMap"]:not([disabled]),'
        + 'button[data-career-act="recover"]:not([disabled]),'
        + 'button[data-career-act="choose"]:not([disabled]),'
        + 'button[data-career-act]:not([disabled])',
      );
    }
    if (!target) target = this._closeBtn || null;
    if (target && typeof target.focus === 'function') {
      try { target.focus({ preventScroll: true }); } catch (_) {
        try { target.focus(); } catch (__) { /* ignore */ }
      }
    }
  },

  _subscribe() {
    if (this._subbed || !this._ctx) return;
    this._subbed = true;
    const bus = this._ctx.bus;
    const refresh = () => { if (this._visible()) this._render(); };
    bus.on('mission:updated', refresh);
    bus.on('mission:accepted', refresh);
    bus.on('mission:completed', refresh);
    bus.on('mission:failed', refresh);
    bus.on('mission:expired', refresh);
    bus.on('career:ladder:progress', refresh);
    bus.on('career:ladder:stepActive', refresh);
    bus.on('career:ladder:stepFailed', refresh);
    bus.on('career:ladder:stepDone', refresh);
    bus.on('career:ladder:stepRecovered', refresh);
    bus.on('career:ladder:choiceResolved', refresh);
    bus.on('career:ladder:completed', refresh);
  },

  _visible() {
    const ui = this._ctx && this._ctx.state && this._ctx.state.ui;
    if (!ui || !ui.screenStack) return false;
    return ui.screenStack[ui.screenStack.length - 1] === 'missionLog';
  },

  _render() {
    const ctx = this._ctx;
    if (!ctx || !this._listEl) return;
    const state = ctx.state;
    const active = (state.missions && state.missions.active) || [];
    const activeMissions = active.filter((m) => m && m.status === 'active');
    const tracked = state.ui && state.ui.trackedMissionId;
    const simTime = state.simTime || 0;

    // Story is folded into CURRENT ACTION when no tracked/active contract owns the next verb.
    this._renderStory(state);
    this._renderRecommendations(state, activeMissions, tracked);
    this._renderCareerChip(state);

    this._listEl.innerHTML = '';

    if (!activeMissions.length) {
      this._listEl.innerHTML = '<div class="sf-mlog-empty">No active missions. Dock at a station, open Missions or the Bar, accept a contract, then undock and follow the tracked nav marker.</div>';
      if (this._compVisible) this._renderCompleted();
      return;
    }

    const frag = document.createDocumentFragment();
    for (const m of activeMissions) {
      const isTracked = tracked === m.id;
      const remaining = Math.max(0, (m.deadline_s || 0) - simTime);
      const urgent = remaining > 0 && remaining < 120;

      const card = el('div', 'sf-mlog-card' + (isTracked ? ' tracked' : '') + (urgent ? ' urgent' : ''));
      card.setAttribute('role', 'group');
      card.setAttribute('aria-label', (isTracked ? 'Tracked mission: ' : 'Mission: ') + missionTitle(m));

      // Top row: title + type badge
      const top = el('div', 'sf-mlog-card-top');
      const risk = m.riskTier != null ? m.riskTier : 0;
      top.innerHTML =
        '<span class="sf-mlog-card-title">' + escapeHtml(missionTitle(m)) + '</span>' +
        '<span class="sf-mlog-card-type">' + escapeHtml(prettyType(m.type)) + '</span>' +
        '<span class="sf-mlog-card-risk r' + risk + '">R' + risk + '</span>';
      card.appendChild(top);

      // Objective progress
      const objLine = el('div', 'sf-mlog-obj mono');
      const prog = m.objectiveProgress || 0;
      const tgt = m.objectiveTarget || 1;
      const pct = Math.min(100, Math.round((prog / tgt) * 100));
      objLine.innerHTML =
        '<span class="sf-mlog-obj-text">' + escapeHtml(objectiveText(m)) + '</span>' +
        '<span class="sf-mlog-obj-pct">' + pct + '%</span>';
      card.appendChild(objLine);

      // Progress bar
      const barWrap = el('div', 'sf-mlog-pbar');
      barWrap.setAttribute('role', 'progressbar');
      barWrap.setAttribute('aria-label', missionTitle(m) + ' completion');
      barWrap.setAttribute('aria-valuemin', '0');
      barWrap.setAttribute('aria-valuemax', '100');
      barWrap.setAttribute('aria-valuenow', String(pct));
      const barFill = el('div', 'sf-mlog-pbar-fill');
      barFill.style.width = pct + '%';
      barWrap.appendChild(barFill);
      card.appendChild(barWrap);

      // CURRENT ACTION already owns the tracked mission verb. Repeat next-step prose only for
      // untracked contracts, where it explains why TRACK NAV is the next interaction.
      if (!isTracked) card.appendChild(el('div', 'sf-mlog-next', nextStepText(m)));

      // Meta row: destination, time, rewards
      const meta = el('div', 'sf-mlog-meta mono');
      const fac = m.factionId ? FACTION_BY_ID.get(m.factionId) : null;
      meta.innerHTML =
        '<span class="sf-mlog-dest">' + escapeHtml(destLabel(m)) + '</span>' +
        (remaining > 0 ? '<span class="sf-mlog-time' + (urgent ? ' urgent' : '') + '">' + fmtTime(remaining) + '</span>' : '') +
        '<span class="sf-mlog-cr">+' + (m.reward_cr || 0).toLocaleString() + ' cr</span>' +
        (fac ? '<span class="sf-mlog-fac" style="color:' + (fac.color || 'var(--accent-2)') + '">' + escapeHtml(fac.short || fac.name) + '</span>' : '');
      card.appendChild(meta);
      card.insertAdjacentHTML('beforeend', contractTermsHtml(m, state));

      // Buttons: Track / map handoff / abandon
      const mapAction = missionMapAction(state, m, isTracked);
      const btns = el('div', 'sf-mlog-btns');
      const titleText = missionTitle(m);
      btns.innerHTML =
        '<button class="sf-mlog-btn-track' + (isTracked ? ' active' : '') + '" type="button" data-act="track" data-mid="' + escapeHtml(m.id) + '" aria-label="' + escapeHtml(isTracked ? 'Tracking ' + titleText : 'Track navigation for ' + titleText) + '">' +
          (isTracked ? 'TRACKING' : 'TRACK NAV') +
        '</button>' +
        (mapAction ? '<button class="sf-mlog-btn-map" type="button" data-act="openMap"' + mapActionButtonAttrs(mapAction, m.id) + ' title="' + escapeHtml(mapAction.title) + '" aria-label="' + escapeHtml(mapAction.title) + '">' + escapeHtml(mapAction.label) + '</button>' : '') +
        '<button class="sf-mlog-btn-abandon" type="button" data-act="abandon" data-mid="' + escapeHtml(m.id) + '" aria-label="' + escapeHtml('Abandon ' + titleText) + '">ABANDON</button>';
      card.appendChild(btns);

      frag.appendChild(card);
    }
    this._listEl.appendChild(frag);

    if (this._compVisible) this._renderCompleted();
  },

  // Long-form story context no longer paints beside the current action. It remains available to
  // recommendedActions() as the fallback when no contract or trade route owns navigation.
  _renderStory(state) {
    if (!this._storyEl) return;
    this._storyEl.innerHTML = '';
    this._storyEl.hidden = true;
    if (this._storyHeader) this._storyHeader.hidden = true;
  },

  _renderRecommendations(state, activeMissions, trackedMissionId) {
    if (!this._recommendEl) return;
    // The policy may produce secondary readiness advice for other consumers, but this screen paints
    // exactly one command. Readiness and terms remain in the detailed mission cards below.
    const actions = recommendedActions(state, activeMissions, trackedMissionId).slice(0, 1);
    if (!actions.length) {
      this._recommendEl.innerHTML = '';
      return;
    }
    this._recommendEl.innerHTML = actions.map((a) => (
      '<div class="sf-mlog-rec-item sf-mlog-rec-item--' + escapeHtml(a.tone || 'info') + '" data-current-action="true">' +
        '<div class="sf-mlog-rec-label">' + escapeHtml(a.label || 'NEXT') + '</div>' +
        '<div class="sf-mlog-rec-title">' + escapeHtml(a.title || 'Next action') + '</div>' +
        (a.brief ? commandBriefHtml(a.brief) : '<div class="sf-mlog-rec-body">' + escapeHtml(a.body || '') + '</div>') +
        (a.meta ? '<div class="sf-mlog-rec-meta mono">' + escapeHtml(a.meta) + '</div>' : '') +
        '<div class="sf-mlog-rec-marker mono">' + (a.mapAction
          ? '◆ BRIGHT AMBER DIAMOND = CURRENT GOAL'
          : (a.action === 'track' ? 'NO GOAL MARKER · TRACK NAV TO CREATE ONE' : 'NO GOAL MARKER YET')) + '</div>' +
        ((a.action === 'track' && a.missionId) || a.mapAction ? '<div class="sf-mlog-rec-actions">' +
          (a.action === 'track' && a.missionId ? '<button class="sf-mlog-rec-action" type="button" data-rec-act="track" data-mid="' + escapeHtml(a.missionId) + '">' + escapeHtml(a.actionLabel || 'TRACK NAV') + '</button>' : '') +
          (a.mapAction ? '<button class="sf-mlog-rec-action sf-mlog-rec-map" type="button" data-rec-act="openMap"' + mapActionButtonAttrs(a.mapAction, a.missionId || a.mapAction.missionId || '') + ' title="' + escapeHtml(a.mapAction.body || a.mapAction.title || '') + '">' + escapeHtml(a.mapAction.label) + '</button>' : '') +
        '</div>' : '') +
      '</div>'
    )).join('');
  },

  /**
   * Capture focused career CTA semantics before chip repaint.
   * Null when focus is outside the career list (never steal).
   */
  _captureCareerFocusToken() {
    if (typeof document === 'undefined' || !this._careerEl) return null;
    const active = document.activeElement;
    if (!active || typeof this._careerEl.contains !== 'function') return null;
    if (!this._careerEl.contains(active)) return null;
    const btn = active.closest && active.closest('[data-career-act]');
    if (!btn || !this._careerEl.contains(btn)) return null;
    return {
      act: btn.getAttribute('data-career-act') || '',
      careerId: btn.getAttribute('data-career-id') || '',
      choiceId: btn.getAttribute('data-choice-id') || '',
      mid: btn.getAttribute('data-mid') || '',
    };
  },

  /**
   * Restore focus to the matching enabled career CTA when the semantic action still exists.
   */
  _restoreCareerFocusToken(token) {
    if (!token || !token.act || !this._careerEl || this._careerEl.hidden) return;
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    if (active
      && active !== document.body
      && active !== document.documentElement
      && typeof this._careerEl.contains === 'function'
      && !this._careerEl.contains(active)
      && this._rootEl
      && typeof this._rootEl.contains === 'function'
      && this._rootEl.contains(active)) {
      return;
    }
    let sel = 'button[data-career-act="' + token.act + '"]';
    if (token.careerId) sel += '[data-career-id="' + token.careerId + '"]';
    if (token.choiceId) sel += '[data-choice-id="' + token.choiceId + '"]';
    if (token.mid) sel += '[data-mid="' + token.mid + '"]';
    const target = this._careerEl.querySelector(sel + ':not([disabled])');
    if (!target || target.disabled || target.hidden) return;
    if (typeof target.focus !== 'function') return;
    try { target.focus({ preventScroll: true }); } catch (_) {
      try { target.focus(); } catch (__) { /* ignore */ }
    }
  },

  /**
   * Career ladder strip for the flight log (CL-UI-03).
   * Presenter-only model; emits career:ladder choose/recover/abandon + map/track intents.
   * Never accept/decline from this surface; never write ladder/owner state.
   */
  _renderCareerChip(state) {
    if (!this._careerEl) return;
    const focusToken = this._captureCareerFocusToken();
    const registry = this._ctx && this._ctx.registry;
    let model = null;
    try {
      model = buildMissionLogCareerChip(state, registry);
    } catch (_) {
      model = null;
    }
    const chips = (model && model.visible && Array.isArray(model.chips)) ? model.chips : [];
    if (!chips.length) {
      this._careerEl.innerHTML = '';
      this._careerEl.hidden = true;
      if (this._careerHeader) this._careerHeader.hidden = true;
      return;
    }
    if (this._careerHeader) this._careerHeader.hidden = false;
    this._careerEl.hidden = false;
    this._careerEl.innerHTML = chips.map((chip) => careerChipHtml(chip, state)).join('');
    this._restoreCareerFocusToken(focusToken);
  },

  _renderCompleted() {
    if (!this._compListEl || !this._ctx) return;
    const log = (this._ctx.state.missions && this._ctx.state.missions.completedLog) || [];
    const receipts = missionReceiptRows(this._ctx.state, 5);
    this._compListEl.innerHTML = '';
    if (!receipts.length && !log.length) {
      this._compListEl.innerHTML = '<div class="sf-mlog-empty">No settlement receipts yet.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    if (!receipts.length && log.length) {
      frag.appendChild(el('div', 'sf-mlog-empty', 'No recent receipts in this save yet. Career totals below were restored from older records.'));
    }
    for (const rowData of receipts) {
      const row = el('div', 'sf-mlog-receipt-row sf-mlog-receipt-row--' + rowData.tone);
      row.innerHTML =
        '<div class="sf-mlog-receipt-outcome mono">' + escapeHtml(rowData.outcome) + '</div>' +
        '<div class="sf-mlog-receipt-main">' +
          '<div class="sf-mlog-receipt-title">' + escapeHtml(rowData.title) + '</div>' +
          '<div class="sf-mlog-receipt-body">' + escapeHtml(rowData.body) + '</div>' +
          (rowData.meta ? '<div class="sf-mlog-receipt-meta mono">' + escapeHtml(rowData.meta) + '</div>' : '') +
        '</div>';
      frag.appendChild(row);
    }
    if (log.length) {
      frag.appendChild(el('div', 'sf-mlog-comp-subhead mono', 'CAREER TOTALS'));
    }
    for (const rec of log) {
      const row = el('div', 'sf-mlog-comp-row mono');
      const success = Math.max(0, Number(rec.success) || 0);
      const count = Math.max(success, Number(rec.count) || 0);
      const failed = Math.max(0, count - success);
      row.innerHTML =
        '<span class="sf-mlog-comp-type">' + escapeHtml(prettyType(rec.type)) + '</span>' +
        '<span class="sf-mlog-comp-count">' + success + ' completed · ' + failed + ' failed</span>' +
        '<span class="sf-mlog-comp-cr">+' + (rec.totalCr || 0).toLocaleString() + ' cr paid</span>';
      frag.appendChild(row);
    }
    this._compListEl.appendChild(frag);
  },
};

// ---- CSS (injected once) ----
const CSS = `
.sf-mlog { width: min(92vw, 700px); max-height: min(88vh, 720px); display: flex; flex-direction: column;
  overflow: hidden; pointer-events: auto; animation: sf-fadein .3s var(--ease) both; }

.sf-mlog-head { display: flex; align-items: center; justify-content: space-between; gap: 14px;
  padding: 14px 20px; border-bottom: 1px solid var(--panel-edge);
  background: linear-gradient(180deg, rgba(14,24,42,.7), rgba(8,14,26,.5)); }
.sf-mlog-title { font-family: var(--mono); font-size: 1.15rem; letter-spacing: .22em; color: var(--accent);
  text-shadow: 0 0 18px rgba(57,208,255,.45); text-transform: uppercase; }
.sf-mlog-hint { font-size: .68rem; color: var(--ink-mute); letter-spacing: .12em; }
.sf-mlog-close { font-size: .78rem; padding: 5px 14px; }

.sf-mlog-section-h { font-family: var(--mono); font-size: .68rem; letter-spacing: .18em; text-transform: uppercase;
  color: var(--ink-mute); padding: 12px 20px 4px; }
.sf-mlog-section-comp { display: flex; align-items: center; justify-content: space-between;
  border-top: 1px solid var(--panel-edge); margin-top: 4px; padding-top: 10px; }
.sf-mlog-toggle { font-size: .68rem; padding: 3px 10px; }

/* Story objective section (P2-14) — always present so the log answers "what now". */
.sf-mlog-story { padding: 4px 16px 6px; }
.sf-mlog-story-card { border: 1px solid var(--accent); border-radius: 8px; padding: 11px 14px;
  background: linear-gradient(180deg, rgba(20,40,60,.55), rgba(10,18,32,.55));
  box-shadow: 0 0 12px rgba(57,208,255,.15); }
.sf-mlog-story-beat { font-family: var(--mono); font-size: .68rem; letter-spacing: .14em;
  text-transform: uppercase; color: var(--accent); margin-bottom: 5px; }
.sf-mlog-story-objective { font-size: .92rem; color: var(--ink); line-height: 1.4; font-weight: 600; }
.sf-mlog-story-introduces { font-size: .72rem; color: var(--ink-mute); margin-top: 6px; font-style: italic; }

.sf-mlog-recommend { padding: 4px 16px 8px; display: grid; grid-template-columns: minmax(0, 1fr);
  gap: 8px; }
.sf-mlog-rec-item { min-width: 0; border: 1px solid var(--panel-edge); border-radius: 8px; padding: 10px 12px;
  background: rgba(8,16,28,.58); }
.sf-mlog-rec-item--primary { border-color: rgba(57,208,255,.7); box-shadow: 0 0 10px rgba(57,208,255,.12); }
.sf-mlog-rec-item--warn { border-color: rgba(255,205,76,.7); box-shadow: 0 0 10px rgba(255,205,76,.1); }
.sf-mlog-rec-item--bad { border-color: rgba(255,84,112,.76); box-shadow: 0 0 12px rgba(255,84,112,.14); }
.sf-mlog-rec-label { font-family: var(--mono); font-size: .58rem; letter-spacing: .14em; color: var(--accent);
  text-transform: uppercase; margin-bottom: 4px; overflow-wrap: anywhere; }
.sf-mlog-rec-item--warn .sf-mlog-rec-label { color: var(--warn); }
.sf-mlog-rec-item--bad .sf-mlog-rec-label { color: var(--danger); }
.sf-mlog-rec-title { font-size: .86rem; line-height: 1.25; color: var(--ink); font-weight: 700; margin-bottom: 4px;
  overflow-wrap: anywhere; }
.sf-mlog-rec-body { font-size: .74rem; line-height: 1.35; color: var(--ink-dim); overflow-wrap: anywhere; }
.sf-mlog-command-brief { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px;
  margin-top: 7px; }
.sf-mlog-command-fact { min-width: 0; display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 6px;
  align-items: start; padding-top: 5px; border-top: 1px solid rgba(88,112,145,.24); font-size: .7rem;
  line-height: 1.3; color: var(--ink-dim); overflow-wrap: anywhere; }
.sf-mlog-command-fact b { font-family: var(--mono); font-size: .55rem; letter-spacing: .1em;
  text-transform: uppercase; color: var(--ink-mute); }
.sf-mlog-command-fact:nth-child(5) span { color: var(--energy); }
.sf-mlog-command-fact:nth-child(6) span { color: var(--warn); }
.sf-mlog-rec-meta { margin-top: 6px; color: var(--energy); font-size: .68rem; overflow-wrap: anywhere; }
.sf-mlog-rec-marker { margin-top: 7px; color: #ffb35c; font-size: .65rem; font-weight: 700;
  letter-spacing: .08em; line-height: 1.3; }
.sf-mlog-rec-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }
.sf-mlog-rec-action { font-size: .66rem; padding: 4px 10px; border-color: var(--warn);
  color: var(--warn); background: rgba(255,205,76,.08); }
.sf-mlog-rec-action:hover { border-color: var(--accent); color: var(--accent); background: rgba(57,208,255,.1); }
.sf-mlog-rec-map { border-color: rgba(57,208,255,.55); color: var(--accent); background: rgba(57,208,255,.08); }

/* Career ladder chip (CL-UI-03) — non-diegetic strip; no visor/portrait chrome. */
.sf-mlog-section-career { color: var(--accent-2, var(--accent)); }
.sf-mlog-career-list { padding: 4px 16px 8px; display: flex; flex-direction: column; gap: 8px; }
.sf-mlog-career-list[hidden], .sf-mlog-section-career[hidden] { display: none; }
.sf-mlog-career { border: 1px solid rgba(57,208,255,.45); border-radius: 8px; padding: 11px 14px;
  background: rgba(8,16,28,.62); }
.sf-mlog-career--collapsed { opacity: .72; border-color: rgba(88,112,145,.4); }
.sf-mlog-career--active { border-color: rgba(57,208,255,.7); box-shadow: 0 0 10px rgba(57,208,255,.1); }
.sf-mlog-career--offered { border-color: rgba(141,102,255,.45); }
.sf-mlog-career--failed, .sf-mlog-career--recovering {
  border-color: rgba(255,198,77,.5); box-shadow: 0 0 8px rgba(255,198,77,.08); }
.sf-mlog-career--complete { border-color: rgba(98,224,138,.35); }
.sf-mlog-career--abandoned { border-color: rgba(88,112,145,.4); opacity: .78; }
.sf-mlog-career-top { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.sf-mlog-career-title { flex: 1; font-size: .9rem; font-weight: 700; color: var(--ink); overflow-wrap: anywhere; }
.sf-mlog-career-status { flex: none; font-size: .58rem; letter-spacing: .12em; text-transform: uppercase;
  color: var(--accent); padding: 1px 6px; border-radius: 4px; background: rgba(57,208,255,.1);
  border: 1px solid rgba(57,208,255,.28); }
.sf-mlog-career--failed .sf-mlog-career-status,
.sf-mlog-career--recovering .sf-mlog-career-status { color: var(--warn, #ffc64d);
  border-color: rgba(255,198,77,.4); background: rgba(255,198,77,.1); }
.sf-mlog-career--complete .sf-mlog-career-status { color: var(--good, #62e08a);
  border-color: rgba(98,224,138,.35); background: rgba(98,224,138,.08); }
.sf-mlog-career--offered .sf-mlog-career-status { color: #b89cff;
  border-color: rgba(141,102,255,.4); background: rgba(141,102,255,.1); }
.sf-mlog-career-step { font-size: .68rem; letter-spacing: .08em; text-transform: uppercase;
  color: var(--ink-mute); margin-bottom: 4px; }
.sf-mlog-career-place { font-size: .66rem; letter-spacing: .04em; color: var(--ink-mute);
  margin-bottom: 4px; overflow-wrap: anywhere; }
.sf-mlog-career-contact { color: var(--ink-dim); }
.sf-mlog-career-location { color: var(--accent); }
.sf-mlog-career-objective { font-size: .84rem; line-height: 1.35; color: var(--ink); font-weight: 600;
  margin-bottom: 4px; overflow-wrap: anywhere; }
.sf-mlog-career-progress { font-size: .68rem; color: var(--ink-mute); letter-spacing: .06em;
  margin-bottom: 4px; }
.sf-mlog-career-next { font-size: .74rem; line-height: 1.35; color: var(--ink-dim); margin-bottom: 4px;
  overflow-wrap: anywhere; }
.sf-mlog-career-consequence { font-size: .64rem; letter-spacing: .03em; color: var(--energy, #9fd4ff);
  margin-bottom: 4px; overflow-wrap: anywhere; }
.sf-mlog-career-fail { font-size: .74rem; line-height: 1.35; color: var(--warn, #ffc64d); margin-bottom: 4px;
  overflow-wrap: anywhere; }
.sf-mlog-career-receipt { font-size: .7rem; line-height: 1.3; color: var(--ink-mute); margin-bottom: 4px;
  overflow-wrap: anywhere; }
.sf-mlog-career-choices { display: flex; flex-wrap: wrap; gap: 7px; margin: 6px 0 4px; }
.sf-mlog-career-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }
.sf-mlog-career-btn { font-size: .66rem; padding: 8px 12px; min-height: 44px; min-width: 44px;
  border-color: var(--panel-edge); color: var(--ink-dim); background: rgba(255,255,255,.03); }
.sf-mlog-career-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.sf-mlog-career-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.sf-mlog-career-btn:disabled { opacity: .4; cursor: default; }
.sf-mlog-career-btn-map { border-color: rgba(57,208,255,.55); color: var(--accent);
  background: rgba(57,208,255,.08); }
.sf-mlog-career-btn-recover { border-color: rgba(255,198,77,.45); color: var(--warn, #ffc64d);
  background: rgba(255,198,77,.08); }
.sf-mlog-career-btn-track { border-color: var(--panel-edge-2); }
.sf-mlog-career-btn-abandon { border-color: rgba(255,84,112,.35); color: var(--ink-mute); }
.sf-mlog-career-btn-abandon:hover:not(:disabled) { border-color: var(--danger); color: var(--danger); }
.sf-mlog-career-btn-choice { border-color: rgba(57,208,255,.4); color: var(--ink);
  background: rgba(57,208,255,.06); }

.sf-mlog-list { flex: 1; overflow-y: auto; padding: 6px 16px 10px; display: flex; flex-direction: column; gap: 10px; }

.sf-mlog-empty { color: var(--ink-mute); font-size: .85rem; padding: 18px 4px; font-style: italic; }

.sf-mlog-card { border: 1px solid var(--panel-edge); border-radius: 8px; padding: 12px 14px;
  background: rgba(10,18,32,.55); transition: border-color .15s ease, box-shadow .15s ease; }
.sf-mlog-card.tracked { border-color: var(--accent); box-shadow: 0 0 12px rgba(57,208,255,.2); }
.sf-mlog-card.urgent { border-color: var(--warn); }

.sf-mlog-card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.sf-mlog-card-title { font-size: .95rem; flex: 1; color: var(--ink); }
.sf-mlog-card-type { font-size: .6rem; letter-spacing: .08em; text-transform: uppercase; padding: 1px 6px;
  border-radius: 4px; background: var(--panel-2); color: var(--ink-dim); }
.sf-mlog-card-risk { font-size: .58rem; letter-spacing: .06em; padding: 1px 5px; border-radius: 4px;
  background: var(--panel-2); color: var(--ink-dim); }
.sf-mlog-card-risk.r0 { color: var(--good); } .sf-mlog-card-risk.r1 { color: var(--accent-2); }
.sf-mlog-card-risk.r2 { color: var(--warn); } .sf-mlog-card-risk.r3, .sf-mlog-card-risk.r4 { color: var(--danger); }

.sf-mlog-obj { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-size: .8rem; margin-bottom: 4px; }
.sf-mlog-obj-text { color: var(--ink-dim); }
.sf-mlog-obj-pct { color: var(--accent); font-weight: 600; min-width: 36px; text-align: right; }

.sf-mlog-pbar { height: 4px; border-radius: 2px; background: var(--panel-2); overflow: hidden; margin-bottom: 8px;
  border: 1px solid rgba(29,51,80,.5); }
.sf-mlog-pbar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-2));
  border-radius: 2px; transition: width .3s ease; }
.sf-mlog-next { color: var(--ink-mute); font-size: .74rem; line-height: 1.35; margin: 0 0 8px; }

.sf-mlog-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: .74rem; margin-bottom: 8px; }
.sf-mlog-dest { color: var(--ink-dim); }
.sf-mlog-time { color: var(--ink-mute); }
.sf-mlog-time.urgent { color: var(--warn); font-weight: 600; }
.sf-mlog-cr { color: var(--energy); }
.sf-mlog-fac { font-size: .7rem; }
.sf-mlog-terms { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 6px;
  margin: 0 0 9px; }
.sf-mlog-term { min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 5px 7px;
  border: 1px solid rgba(88,112,145,.34); border-radius: 6px; background: rgba(255,255,255,.035);
  font-size: .64rem; line-height: 1.25; color: var(--ink-dim); overflow-wrap: anywhere; }
.sf-mlog-term b { font-size: .55rem; letter-spacing: .11em; text-transform: uppercase; color: var(--ink-mute); }
.sf-mlog-term--ok { border-color: rgba(98,224,138,.34); color: var(--good); }
.sf-mlog-term--info { border-color: rgba(57,208,255,.28); color: var(--accent); }
.sf-mlog-term--warn { border-color: rgba(255,198,77,.38); color: var(--warn); }
.sf-mlog-term--bad { border-color: rgba(255,84,112,.46); color: var(--danger); }

.sf-mlog-btns { display: flex; flex-wrap: wrap; gap: 8px; }
.sf-mlog-btn-track { font-size: .72rem; padding: 4px 12px; border-color: var(--panel-edge-2); color: var(--ink-dim); }
.sf-mlog-btn-track:hover { border-color: var(--accent); color: var(--accent); }
.sf-mlog-btn-track.active { border-color: var(--accent); color: var(--accent);
  box-shadow: 0 0 8px rgba(57,208,255,.25); background: rgba(57,208,255,.1); }
.sf-mlog-btn-map { font-size: .72rem; padding: 4px 12px; border-color: rgba(57,208,255,.55); color: var(--accent);
  background: rgba(57,208,255,.08); }
.sf-mlog-btn-map:hover { border-color: var(--energy); color: var(--energy); }
.sf-mlog-btn-abandon { font-size: .72rem; padding: 4px 12px; border-color: var(--panel-edge); color: var(--ink-mute); }
.sf-mlog-btn-abandon:hover { border-color: var(--danger); color: var(--danger); }

.sf-mlog-comp-list { padding: 4px 16px 12px; }
.sf-mlog-receipt-row { display: grid; grid-template-columns: 82px 1fr; gap: 9px; align-items: start;
  padding: 8px 9px; margin-bottom: 7px; border: 1px solid rgba(88,112,145,.28); border-radius: 6px;
  background: rgba(8,16,28,.5); }
.sf-mlog-receipt-row--ok { border-color: rgba(98,224,138,.34); }
.sf-mlog-receipt-row--warn { border-color: rgba(255,198,77,.36); }
.sf-mlog-receipt-row--bad { border-color: rgba(255,84,112,.42); }
.sf-mlog-receipt-outcome { font-size: .58rem; letter-spacing: .11em; text-transform: uppercase; color: var(--ink-mute);
  overflow-wrap: anywhere; }
.sf-mlog-receipt-row--ok .sf-mlog-receipt-outcome { color: var(--good); }
.sf-mlog-receipt-row--warn .sf-mlog-receipt-outcome { color: var(--warn); }
.sf-mlog-receipt-row--bad .sf-mlog-receipt-outcome { color: var(--danger); }
.sf-mlog-receipt-main { min-width: 0; }
.sf-mlog-receipt-title { color: var(--ink); font-size: .82rem; font-weight: 700; line-height: 1.25;
  overflow-wrap: anywhere; }
.sf-mlog-receipt-body { color: var(--ink-dim); font-size: .72rem; line-height: 1.35; margin-top: 3px;
  overflow-wrap: anywhere; }
.sf-mlog-receipt-meta { color: var(--ink-mute); font-size: .62rem; line-height: 1.3; margin-top: 4px;
  overflow-wrap: anywhere; }
.sf-mlog-comp-subhead { color: var(--ink-mute); font-size: .58rem; letter-spacing: .14em; margin: 10px 2px 4px; }
.sf-mlog-comp-row { display: flex; gap: 16px; align-items: center; padding: 5px 8px;
  border-bottom: 1px solid rgba(29,51,80,.35); font-size: .76rem; color: var(--ink-mute); }
.sf-mlog-comp-type { flex: 1; }
.sf-mlog-comp-count { color: var(--ink-dim); }
.sf-mlog-comp-cr { color: var(--energy); opacity: .7; }
@media (max-width: 700px), (max-height: 620px) {
  .sf-mlog-command-brief { grid-template-columns: minmax(0, 1fr); }
  .sf-mlog-command-fact { grid-template-columns: 44px minmax(0, 1fr); }
  .sf-mlog-list { gap: 7px; }
  .sf-mlog-card { padding: 9px 10px; }
}
`;
