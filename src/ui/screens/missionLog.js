// src/ui/screens/missionLog.js — In-flight mission log.
// Shows all active + recently completed missions with progress, timer, reward, and a TRACK button.
// READ-ONLY on state; emits ui:trackMission + ui:abandonMission (+ career origin/ladder intents)
// intents only (§5, §0.6). No career progression or owner writes from this surface.
//
// Export: missionLogScreen  (id 'missionLog').

import { SECTORS } from '../../data/sectors.js';
import { COMMODITIES } from '../../data/commodities.js';
import { confirm } from '../confirm.js';
import { FACTION_META } from '../../data/factions.js';
import { STORY_BEATS } from '../../data/missions.js';
import { postEndingReplayChain } from '../../data/postEndingReplayChains.js';
import {
  evaluateEndingEligibility,
  snapshotEndingFacts,
} from '../../story/endings/eligibility.js';
import { ENDING_IDS, endingDef } from '../../story/endings/endingDefs.js';
import { escapeHtml } from '../comms.js';
import { BINDINGS } from '../bindings.js';
import { entitySpanHtml } from '../entityResolver.js';
import {
  missionClauseTerms,
  missionConsequenceSummary,
  missionTimePacing,
  missionUpfrontCost,
} from '../missionPreflight.js';
import { MAP_FOCUS, mapHandoffAction, openGalaxyMap } from '../mapAuthority.js';
import {
  buildMissionLogCareerChip,
  buildMissionLogOriginChoiceModel,
} from '../careerLadderView.js';

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
export function objectiveText(m) {
  const p = m.params || {};
  const prog = m.objectiveProgress || 0;
  const tgt = m.objectiveTarget || 1;
  const dest = m.destStationId ? destStationName(m.destStationId) : 'destination';
  if (p.setPieceObjective === 'long_read_rumor_survey') {
    const rumorLabel = p.rumorAlreadyKnown ? 'RUMOR KNOWN' : 'RUMOR PURCHASED';
    return `${rumorLabel} ${p.rumorPurchased ? '✓' : '○'} / BEARING FIXED ${p.bearingFixed ? '✓' : '○'}`;
  }
  if (p.setPieceObjective === 'long_read_salvage') {
    return `COMPLICATION LIVE ${p.complicationObserved ? '✓' : '○'} / WRECK RECOVERED ${p.salvageDecisionReady ? '✓' : '○'}`;
  }
  if (p.setPieceObjective === 'long_read_fence') {
    return `CHOOSE / CONFIRM DISPOSITION · ${titleCaseWords(p.wreckChoiceId || 'wreck outcome')}`;
  }
  switch (m.type) {
    case 'cargo_delivery': {
      const serviceClass = `${m.originChoiceId || ''} ${m.title || ''} ${m.mapLabel || ''}`.toLowerCase();
      const cargo = `${Math.max(1, Number(p.qty) || tgt)}u ${cmdtyName(p.cmdtyId)}`;
      if (m.originCareer === 'hauler' && serviceClass.includes('bonded express')) {
        return `EXPRESS · Deliver ${cargo} to ${dest} · short clock · ${m.collateral_cr || 0} cr bond at risk`;
      }
      if (m.originCareer === 'hauler' && serviceClass.includes('open manifest')) {
        return `OPEN · Deliver ${cargo} to ${dest} · longer window · no collateral`;
      }
      return `Deliver to ${dest}`;
    }
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
      if (p.originSurveySample) {
        const scans = Math.max(1, p.scanTargets || 1);
        const mined = Math.max(0, prog - scans);
        return p.surveyComplete
          ? `Mine sample ${mined}/${Math.max(1, p.sampleQty || 1)} ${cmdtyName(p.sampleCmdtyId)}`
          : 'Scan a Ceres asteroid field';
      }
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
  const wreckName = p.wreckName || 'the marked wreck';
  const complicationKind = Array.isArray(p.complicationKinds) && p.complicationKinds[0]
    ? titleCaseWords(p.complicationKinds[0])
    : p.hasReactorComplication ? 'unstable reactor'
      : p.hasHazardComplication ? 'local hazard' : 'live complication';
  if (p.setPieceObjective === 'long_read_rumor_survey') {
    if (p.rumorAlreadyKnown) {
      return `Next: follow the known bearing ring and pulse scan until ${wreckName} fixes to a point.`;
    }
    return p.rumorPurchased
      ? `Next: follow the purchased bearing ring and pulse scan until ${wreckName} fixes to a point.`
      : `Next: purchase the brokered rumor, follow its bearing ring, and pulse scan until ${wreckName} fixes.`;
  }
  if (p.setPieceObjective === 'long_read_salvage') {
    if (p.salvageDecisionReady && !p.complicationObserved) {
      return `Next: survive or observe ${wreckName}'s ${complicationKind} before confirming recovery.`;
    }
    if (p.complicationObserved) {
      return `Next: recover ${wreckName} until its live disposition decision opens.`;
    }
    return `Next: reach ${wreckName}, survive or observe its ${complicationKind}, and recover the wreck to decision.`;
  }
  if (p.setPieceObjective === 'long_read_fence') {
    const choice = titleCaseWords(p.wreckChoiceId || 'wreck outcome');
    return `Next: confirm ${choice} for ${wreckName}; this is a disposition receipt, not a freight handoff.`;
  }
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
      return p.originSurveySample && p.surveyComplete
        ? 'Next: mine the requested sample from the scanned field; only your extraction counts.'
        : 'Next: follow tracked nav and scan each marked site.';
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
  // Paperwork deep-read: authorization / admin field / full contract body (B0 mass story).
  if (m.description && String(m.description).includes('MASS ON ACCEPT')) {
    return String(m.description).trim();
  }
  if (m.authorization) {
    const base = m.summary || m.brief || m.instruction || '';
    return String(`${base}\n${m.authorization}`).trim();
  }
  if (m.adminField) {
    const base = m.summary || m.brief || m.instruction || m.title || '';
    return String(`${base}\nADMINISTRATOR: ${m.adminField}`).trim();
  }
  const authored = m.why || m.motive || m.brief || m.description || m.instruction || m.summary
    || (m.params && (m.params.why || m.params.reason || m.params.authorization));
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

  const upfrontCost = missionUpfrontCost(m);
  if (upfrontCost > 0) {
    terms.push({
      kind: 'info',
      label: 'Paid',
      text: formatCredits(upfrontCost) + ' non-refundable first-attempt service fee',
    });
  }

  for (const clause of missionClauseTerms(m)) {
    const bonus = clause.bonusPct > 0 ? ' / +' + clause.bonusPct + '% if kept' : '';
    terms.push({
      kind: 'warn',
      label: 'Clause',
      text: clause.label + ': ' + clause.prose + bonus,
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

  return terms.slice(0, 8);
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
    return '<div class="sf-mlog-terms" aria-label="Contract terms">' + terms.map((term) => {
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
  if (typeof chip.choiceSummary === 'string' && chip.choiceSummary.trim()) {
    return chip.choiceSummary.trim();
  }
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

/** HTML for mission-log career chips (pure presenter → DOM). Emits intents; no owner writes. */
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
  const choiceAction = chip.choiceAction || 'choose';
  const linkedId = chip.linkedMissionId || null;
  const collapsed = !!chip.collapsed;
  const place = careerContactLocation(chip, state);
  const consequence = careerConsequencePreview(chip, state);
  const placeLine = [place.contact, place.location].filter(Boolean).join(' · ');

  let actions = '';
  if (chip.canOriginAccept) {
    const acceptText = chip.originAcceptLabel || ('START ' + title.toUpperCase());
    actions += '<button class="sf-mlog-career-btn sf-mlog-career-btn-choice" type="button"'
      + ' data-career-act="originAccept" data-career-id="' + escapeHtml(careerId) + '"'
      + ' aria-label="' + escapeHtml(acceptText + ' — ' + title) + '">' + escapeHtml(acceptText) + '</button>';
  }
  if (chip.canOriginDecline) {
    actions += '<button class="sf-mlog-career-btn sf-mlog-career-btn-abandon" type="button"'
      + ' data-career-act="originDecline" data-career-id="' + escapeHtml(careerId) + '"'
      + ' aria-label="' + escapeHtml('Decline ' + title + ' for now') + '">NOT NOW</button>';
  }
  if (chip.canOriginRecover) {
    actions += '<button class="sf-mlog-career-btn sf-mlog-career-btn-recover" type="button"'
      + ' data-career-act="originRecover" data-career-id="' + escapeHtml(careerId) + '"'
      + ' aria-label="' + escapeHtml('Reissue ' + title + ' origin contract') + '">REISSUE</button>';
  }
  if (mapAction) {
    actions += '<button class="sf-mlog-career-btn sf-mlog-career-btn-map" type="button"'
      + ' data-career-act="openMap" data-career-id="' + escapeHtml(careerId) + '"'
      + mapActionButtonAttrs(mapAction, linkedId || mapAction.missionId || '')
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
        const selected = c.selected === true;
        return '<button class="sf-mlog-career-btn sf-mlog-career-btn-choice" type="button"'
          + ' data-career-act="' + escapeHtml(choiceAction) + '" data-career-id="' + escapeHtml(careerId) + '"'
          + ' data-choice-id="' + escapeHtml(c.id) + '"'
          + ' data-choice-selected="' + (selected ? 'true' : 'false') + '"'
          + ' aria-pressed="' + (selected ? 'true' : 'false') + '"'
          + (blocked ? ' disabled' : '')
          + ' aria-label="' + escapeHtml(label + ' for ' + (stepTitle || title)) + '">'
          + escapeHtml((selected ? 'SELECTED · ' : '') + label) + '</button>';
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
      ? '<span class="sf-mlog-career-status" role="status">' + escapeHtml(String(statusLabel)) + '</span>'
      : '')
    + '</div>'
    + (stepTitle
      ? '<div class="sf-mlog-career-step">' + escapeHtml(stepTitle) + '</div>'
      : '')
    + (placeLine
      ? '<div class="sf-mlog-career-place" aria-label="'
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
      ? '<div class="sf-mlog-career-progress sf-fig" aria-label="' + escapeHtml(progressAria) + '">'
        + escapeHtml(progressLabel) + '</div>'
      : '')
    + (chip.nextAction
      ? '<div class="sf-mlog-career-next" aria-live="polite">' + escapeHtml(chip.nextAction) + '</div>'
      : '')
    + (consequence
      ? '<div class="sf-mlog-career-consequence" aria-label="Consequence preview">'
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

function stationRouteAction(stationId, title = 'Open Star Map') {
  const station = STATION_INFO.get(stationId);
  return mapHandoffAction({
    focus: MAP_FOCUS.GALAXY,
    label: 'STAR MAP',
    title,
    body: station
      ? `Plot a route to ${station.name} in ${station.sectorName}.`
      : 'Open the chart and review the next campaign destination.',
    stationId,
    sectorId: station && station.sectorId,
    source: 'missionLog-story',
  });
}

const FINAL_DISPOSITION_ROUTES = Object.freeze({
  A: Object.freeze({
    interfaceLabel: 'ASH CACHE MISSIONS',
    routeInstruction: 'Dock at Ash Cache, open Ash Cache Missions, and review the Concord commission row.',
  }),
  B: Object.freeze({
    interfaceLabel: 'ASH CACHE MISSIONS',
    routeInstruction: 'Dock at Ash Cache, open Ash Cache Missions, and review the Quiet routing row.',
  }),
  C: Object.freeze({
    interfaceLabel: 'ASHFALL · UNFILED DRIVE',
    routeInstruction: 'In Ashfall with a full hold and no active contract, charge the destinationless drive.',
  }),
  D: Object.freeze({
    interfaceLabel: 'ASHFALL · DEPARTURE PREFLIGHT',
    routeInstruction: 'Carry the Kurtz ledger, start a normal Ashfall departure, then choose STAY.',
  }),
  E: Object.freeze({
    interfaceLabel: 'ASH CACHE BAR · COURIER',
    routeInstruction: 'After declining A-D, dock at Ash Cache, open Bar, and speak to the Courier.',
  }),
});
const FINAL_DISPOSITION_PRIORITY = Object.freeze(['E', 'C', 'D', 'A', 'B']);

/** Read-only truth for the five authored interfaces; never files or advances an ending. */
export function finalDispositionRoutes(state) {
  const declinedIds = new Set(Array.isArray(state?.story?.endgameDeclined)
    ? state.story.endgameDeclined : []);
  return ENDING_IDS.map((id) => {
    const def = endingDef(id);
    const eligibility = evaluateEndingEligibility(state, id);
    const declined = declinedIds.has(id);
    const ready = eligibility.eligible && !declined;
    const route = FINAL_DISPOSITION_ROUTES[id];
    return Object.freeze({
      id,
      title: def.title,
      interfaceLabel: route.interfaceLabel,
      routeInstruction: route.routeInstruction,
      status: declined ? 'declined' : ready ? 'ready' : 'locked',
      ready,
      declined,
      reason: declined
        ? 'Previously declined; another disposition may still be filed.'
        : ready ? 'Requirements met at this physical interface.'
          : (eligibility.unmet[0]?.text || 'Requirements not yet met.'),
      unmetCount: eligibility.unmet.length,
    });
  });
}

function dispositionRouteRowsHtml(routes) {
  if (!Array.isArray(routes) || !routes.length) return '';
  return '<div class="sf-mlog-ending-routes" role="list" aria-label="Five final disposition routes">'
    + routes.map((route) => {
      const status = route.status === 'ready' || route.status === 'declined' ? route.status : 'locked';
      return '<div class="sf-mlog-ending-route sf-mlog-ending-route--' + status + '" role="listitem" data-ending-route="' + escapeHtml(route.id) + '">' +
        '<span class="sf-mlog-ending-code">' + escapeHtml(route.id) + '</span>' +
        '<span class="sf-mlog-ending-title">' + escapeHtml(route.title) + '</span>' +
        '<span class="sf-mlog-ending-interface">' + escapeHtml(route.interfaceLabel) + '</span>' +
        '<span class="sf-mlog-ending-reason">' + escapeHtml(route.reason) + '</span>' +
      '</div>';
    }).join('')
    + '</div>';
}

export function setPieceContinuationAction(state) {
  const missions = state && state.missions || {};
  const boards = missions.boards && typeof missions.boards === 'object' ? missions.boards : {};
  const receipts = Array.isArray(missions.receipts) ? missions.receipts : [];
  const posted = [];
  for (const [boardStationId, board] of Object.entries(boards)) {
    for (const offer of board && Array.isArray(board.slots) ? board.slots : []) {
      const cause = offer && offer.cause;
      if (!offer || offer.source !== 'setPieceMission' || !cause || !cause.chainId) continue;
      if ((cause.stageIndex | 0) <= 0 && (cause.attempt | 0) <= 0) continue;
      posted.push({ offer, cause, stationId: offer.stationId || boardStationId });
    }
  }
  if (!posted.length) return null;

  const postedChains = new Set(posted.map((row) => row.cause.chainId));
  const stationIdsByChain = new Map();
  for (const row of posted) {
    const ids = stationIdsByChain.get(row.cause.chainId) || new Set();
    if (row.stationId) ids.add(row.stationId);
    stationIdsByChain.set(row.cause.chainId, ids);
  }
  const latestReceipt = receipts.find((receipt) => {
    if (!receipt || !postedChains.has(receipt.chainId)) return false;
    const expected = stationIdsByChain.get(receipt.chainId) || new Set();
    return Array.isArray(receipt.nextStationIds)
      && receipt.nextStationIds.some((stationId) => expected.has(stationId));
  }) || receipts.find((receipt) => receipt && postedChains.has(receipt.chainId)) || null;
  const selectedChainId = latestReceipt && latestReceipt.chainId || [...postedChains].sort()[0];
  const selected = posted.filter((row) => row.cause.chainId === selectedChainId);

  const maxStage = Math.max(...selected.map((row) => row.cause.stageIndex | 0));
  const atStage = selected.filter((row) => (row.cause.stageIndex | 0) === maxStage);
  const maxAttempt = Math.max(...atStage.map((row) => row.cause.attempt | 0));
  const current = atStage.filter((row) => (row.cause.attempt | 0) === maxAttempt)
    .sort((a, b) => String(a.offer.id).localeCompare(String(b.offer.id)));
  const stationIds = [...new Set(current.map((row) => row.stationId).filter(Boolean))];
  const stationNames = stationIds.map((stationId) => {
    const info = STATION_INFO.get(stationId);
    return info && info.name ? info.name : prettyId(stationId, 'the posted contract board');
  });
  const first = current[0];
  const receipt = latestReceipt && latestReceipt.chainId === first.cause.chainId ? latestReceipt : null;
  const retrying = maxAttempt > 0 || !!(receipt && receipt.outcome && receipt.outcome !== 'completed');
  const house = receipt && receipt.house || first.cause.house || 'Contract House';
  const voice = receipt && (receipt.recoveryText || receipt.houseText) || '';
  const destination = stationNames.length === 1
    ? stationNames[0]
    : stationNames.length > 1 ? stationNames.join(' or ') : 'the posted contract board';
  const title = current.length === 1
    ? (first.offer.title || 'Continue the authored contract')
    : 'Choose the next contract route';
  const routeBody = `${voice ? voice + ' ' : ''}Dock at ${destination} and open Missions.`;
  const oneStation = stationIds.length === 1 ? STATION_INFO.get(stationIds[0]) : null;

  return {
    tone: retrying ? 'warn' : 'primary',
    label: retrying ? 'RECOVERY POSTED' : 'NEXT CONTRACT',
    title,
    body: `${house}: ${routeBody}`,
    meta: `STAGE ${maxStage + 1} · ${destination}`,
    mapAction: mapHandoffAction({
      focus: MAP_FOCUS.GALAXY,
      label: 'STAR MAP',
      title: stationIds.length === 1 ? `Plot route to ${destination}` : 'Compare continuation boards',
      body: stationIds.length === 1
        ? `Plot the route to ${destination} for the next contract stage.`
        : 'Open the galaxy chart and compare the posted continuation boards.',
      stationId: stationIds.length === 1 ? stationIds[0] : null,
      sectorId: oneStation && oneStation.sectorId || null,
      source: 'missionLog-setPiece',
    }),
  };
}

function replayStage(state, chain, run) {
  if (!chain || !run) return null;
  if (run.stageIndex === 0) return { stage: chain.opening, branch: null };
  const branch = chain.branches.find((option) => option.id === run.branchId) || null;
  if (run.stageIndex === 1) return branch ? { stage: branch.mission, branch } : null;
  if (run.stageIndex === 2) return branch ? { stage: branch.finale, branch } : null;
  return null;
}

function postEndingStoryAction(state) {
  const story = state && state.story || {};
  if (!story.endgameResolved && !story.endgameChoice && !(story.flags && story.flags.sandboxContinued)) return null;
  const continuity = story.postEnding || null;
  if (continuity && continuity.status !== 'complete') {
    const progress = Math.max(0, Number(continuity.progress) || 0);
    const target = Math.max(1, Number(continuity.target) || 1);
    return {
      tone: 'primary',
      label: story.endgameChoice ? `ENDING ${story.endgameChoice}` : 'OPEN FRONTIER',
      title: continuity.title || 'The work continues',
      body: continuity.objective || 'Continue career and world activity after the final disposition.',
      meta: `${progress}/${target} · WORLD CONTINUES`,
    };
  }

  const choiceId = continuity && continuity.choiceId;
  const chain = choiceId && postEndingReplayChain(choiceId);
  const run = state && state.missions && state.missions.postEndingReplay;
  if (!chain) {
    return {
      tone: 'info',
      label: 'SANDBOX',
      title: 'The frontier remains open',
      body: 'Career contracts, claims, trade, mining, combat, and exploration continue after 47-A.',
      meta: 'NO CREDITS ROLL · KEEP FLYING',
    };
  }

  if (run && run.status === 'completed') {
    return {
      tone: 'info',
      label: 'SANDBOX',
      title: `${chain.title} changed the world`,
      body: 'Continue careers and regional work. This route returns after the next board refresh.',
      meta: `CYCLE ${(Number(run.cycle) || 0) + 1} COMPLETE`,
    };
  }

  if (run && run.stageIndex === 1 && !run.branchId) {
    const options = chain.branches.map((option) => {
      const station = STATION_INFO.get(option.mission.boardStationId);
      return `${option.label} at ${station ? station.name : option.mission.boardStationId}`;
    });
    return {
      tone: 'primary',
      label: 'AFTER 47-A',
      title: 'Choose the consequence you will carry',
      body: `${chain.choicePrompt} ${options.join(' · ')}. Dock at either board to commit.`,
      meta: 'TWO ROUTES · ONE PERSISTENT OUTCOME',
      mapAction: mapHandoffAction({
        focus: MAP_FOCUS.GALAXY,
        label: 'STAR MAP',
        title: 'Compare branch destinations',
        body: 'Open the galaxy chart and compare the two authored continuation routes.',
        source: 'missionLog-story-branch',
      }),
    };
  }

  const descriptor = replayStage(state, chain, run || { stageIndex: 0, branchId: null });
  if (descriptor && descriptor.stage) {
    const stationId = descriptor.stage.boardStationId;
    const station = STATION_INFO.get(stationId);
    const stateLabel = run && run.status === 'recovering'
      ? 'Recovery copy ready'
      : run && run.status === 'offered'
        ? 'Offer posted'
        : 'Next route';
    return {
      tone: run && run.status === 'recovering' ? 'warn' : 'primary',
      label: 'AFTER 47-A',
      title: descriptor.stage.title || chain.title,
      body: `${descriptor.stage.instruction} ${stateLabel}: dock at ${station ? station.name : stationId} and open Missions.`,
      meta: `${chain.title.toUpperCase()} · ${(Number(run && run.stageIndex) || 0) + 1}/3`,
      mapAction: stationRouteAction(stationId, `Plot route to ${station ? station.name : 'the next board'}`),
    };
  }

  return {
    tone: 'info',
    label: 'SANDBOX',
    title: 'The frontier remains open',
    body: 'Continue career contracts, claims, trade, mining, combat, and exploration while the next route settles.',
    meta: 'WORLD CONTINUES',
  };
}

function offeredEndingAction(state) {
  const story = state && state.story || {};
  if (!story.endgameOffered || story.endgameResolved || story.endgameChoice) return null;
  const routes = finalDispositionRoutes(state);
  const primary = FINAL_DISPOSITION_PRIORITY
    .map((id) => routes.find((route) => route.id === id))
    .find((route) => route?.ready) || null;
  const nearest = primary || routes
    .filter((route) => !route.declined)
    .sort((a, b) => a.unmetCount - b.unmetCount || a.id.localeCompare(b.id))[0] || routes[0];
  const station = STATION_INFO.get('station_ashcache');
  const readyCount = routes.filter((route) => route.ready).length;
  const declinedCount = routes.filter((route) => route.declined).length;
  let title = 'Prepare a final disposition';
  let body = nearest
    ? `${nearest.routeInstruction} First unmet condition: ${nearest.reason}`
    : 'Return to Ash Cache to review the final disposition routes.';
  let action;
  let actionLabel;
  let mapAction = stationRouteAction('station_ashcache', `Plot route to ${station ? station.name : 'Ash Cache'}`);

  if (primary?.id === 'A' || primary?.id === 'B') {
    title = 'File 47-A at Ash Cache';
    body = primary.routeInstruction;
  } else if (primary?.id === 'C') {
    title = 'Charge an unfiled jump from Ashfall';
    body = primary.routeInstruction;
    action = 'endgameUnfiledJump';
    actionLabel = 'CHARGE UNFILED JUMP';
    mapAction = null;
  } else if (primary?.id === 'D') {
    title = 'Choose whether the ledger leaves Ashfall';
    body = primary.routeInstruction;
    mapAction = mapHandoffAction({
      focus: MAP_FOCUS.GALAXY,
      label: 'STAR MAP',
      title: 'Choose a registered Ashfall departure',
      body: 'Plot a normal destination, then start the departure to reach the stay-or-leave preflight.',
      sectorId: 'sector_ashfall_reach',
      source: 'missionLog-ending-d',
    });
  } else if (primary?.id === 'E') {
    title = 'Meet the next Courier at Ash Cache';
    body = primary.routeInstruction;
  }

  return {
    tone: 'primary',
    label: 'FINAL DISPOSITION',
    title,
    body,
    meta: `${readyCount} READY · ${declinedCount} DECLINED · CONFIRMATION REQUIRED`,
    primaryEndingId: primary?.id || null,
    routeOptions: routes,
    action,
    actionLabel,
    secondaryAction: 'endgameSandbox',
    secondaryActionLabel: 'CONTINUE WITHOUT FILING',
    mapAction,
  };
}

export function storyActionForBeat(beat, state) {
  const story = state && state.story || {};
  const postEnding = postEndingStoryAction(state);
  if (postEnding) return postEnding;
  const offered = offeredEndingAction(state);
  if (offered) return offered;
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
        body: 'Fit the Hitch for a low-risk bounty, track the target, and cash the first kill.',
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
      {
        const facts = snapshotEndingFacts(state);
        const worth = Math.min(facts.netWorthCr, 100000).toLocaleString();
        const rep = Math.min(facts.branchRep, 50);
      return {
        tone: 'primary',
        label: 'ENDGAME',
        title: 'Build sector power',
        body: `Reach 100,000cr net worth and 50 branch standing. Own a capital hull, claim, or outpost to qualify for a filed ending.`,
        meta: `${worth}/100,000 CR · ${rep}/50 REP`,
      };
      }
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

const PERSISTENT_CAMPAIGN_LABELS = new Set([
  'FINAL DISPOSITION', 'OPEN FRONTIER', 'AFTER 47-A', 'SANDBOX',
]);

/**
 * Keep the final disposition / post-ending thread visible beside ordinary work whenever that
 * work owns CURRENT ACTION. Earlier story beats remain folded into the single-command policy.
 */
export function persistentCampaignAction(state, activeMissions = [], trackedMissionId = null) {
  const beatIndex = state && state.story ? (state.story.beatIndex || 0) : 0;
  const action = storyActionForBeat(STORY_BEATS[beatIndex], state);
  const label = String(action && action.label || '');
  const isEndingLabel = /^ENDING [A-E]$/.test(label);
  if (!action || (!PERSISTENT_CAMPAIGN_LABELS.has(label) && !isEndingLabel)) return null;
  const active = (activeMissions || []).filter((mission) => mission && mission.status === 'active');
  const tracked = trackedMissionId ? active.find((mission) => mission.id === trackedMissionId) : null;
  const ordinaryWorkOwnsCurrent = !!tracked || active.length > 0 || !!tradeRouteAction(state);
  return ordinaryWorkOwnsCurrent ? action : null;
}

/** True while the staged first-session tutorial owns the single opening command surface. */
export function stagedOpeningOwnsCommand(state) {
  const gameplay = state && state.settings && state.settings.gameplay;
  if (gameplay && gameplay.tutorialHints === false) return false;
  const ob = state && state.onboarding;
  return !!(ob && ob.active && !ob.finished);
}

export function recommendedActions(state, activeMissions, trackedMissionId) {
  const active = (activeMissions || []).filter((m) => m && m.status === 'active');
  const tracked = trackedMissionId ? active.find((m) => m.id === trackedMissionId) : null;
  const beatIndex = state && state.story ? (state.story.beatIndex || 0) : 0;
  const storyBeat = STORY_BEATS[beatIndex];
  const storyAction = storyActionForBeat(storyBeat, state);
  const activeTradeRoute = tradeRouteAction(state);
  const setPieceContinuation = setPieceContinuationAction(state);
  const cargo = cargoLoad(state);
  const readiness = serviceReadinessAction(state, tracked ? [tracked] : active);
  const actions = [];
  // Staged tutorial owns one opening command (story first-route / "Follow the anomaly").
  // Cold-start 47-A stays tracked for later handoff and still appears in ACTIVE MISSIONS cards,
  // but must not promote a competing CURRENT ACTION or mission-kind waypoint during teaching.
  const openingOwns = stagedOpeningOwnsCommand(state);

  if (openingOwns && storyAction) {
    actions.push(storyAction);
  } else if (tracked) {
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
  } else if (setPieceContinuation) {
    actions.push(setPieceContinuation);
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

    const voice = [];
    if (receipt.houseText) {
      voice.push((receipt.house ? receipt.house + ': ' : '') + receipt.houseText);
    }
    if (receipt.recoveryText) voice.push(receipt.recoveryText);
    const nextStationIds = Array.isArray(receipt.nextStationIds)
      ? receipt.nextStationIds : receipt.nextStationId ? [receipt.nextStationId] : [];
    const nextStations = [...new Set(nextStationIds)].map((stationId) => {
      const info = STATION_INFO.get(stationId);
      return info && info.name ? info.name : prettyId(stationId, 'posted board');
    });

    const dest = receiptDestinationLabel(receipt);
    const meta = [
      prettyType(receipt.type),
      dest,
      receipt.reason ? 'Reason: ' + receiptReasonLabel(receipt.reason) : '',
      nextStations.length ? 'Next: ' + nextStations.join(' or ') : '',
    ].filter(Boolean).join(' · ');

    return {
      tone: receiptTone(outcome),
      outcome: receiptOutcomeLabel(outcome),
      title: receipt.title || prettyType(receipt.type),
      body: [...voice, parts.join(' · ')].filter(Boolean).join(' · '),
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
    rootEl.classList.add('panel', 'sf-menu', 'sf-mlog');
    // Diegetic fascia stamp (styles/menu.css .sf-menu::before reads it).
    rootEl.dataset.stamp = 'CONTRACT LEDGER / ACTIVE';

    // Header
    const head = el('div', 'sf-mlog-head sf-crest');
    head.innerHTML =
      '<span class="sf-mlog-title">MISSION LOG</span>' +
      '<span class="sf-mlog-hint">' + BINDINGS.missionLog.label + ' to close</span>' +
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

    const list = el('div', 'sf-mlog-list sf-apron');
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
    const recEl = el('div', 'sf-mlog-recommend sf-stage');
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

    const handleCampaignAction = (ev) => {
      const btn = ev.target.closest('[data-rec-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-rec-act');
      if (act === 'track') {
        ctx.bus.emit('ui:trackMission', { missionId: btn.getAttribute('data-mid') });
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
        this._render();
      } else if (act === 'endgameSandbox') {
        ctx.bus.emit('ui:endgameSandbox', { source: 'missionLog' });
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
        this._render();
      } else if (act === 'endgameUnfiledJump') {
        ctx.bus.emit('ui:endgameUnfiledJump', { source: 'missionLog' });
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
        this._render();
      } else if (act === 'openMap') {
        openMapScreen(ctx, mapOpenIntentFromButton(btn));
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
      }
    };
    recEl.addEventListener('click', handleCampaignAction);
    storyEl.addEventListener('click', handleCampaignAction);

    careerEl.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-career-act]');
      if (!btn || !careerEl.contains(btn) || btn.disabled) return;
      const act = btn.getAttribute('data-career-act');
      const careerId = btn.getAttribute('data-career-id');
      if (!act) return;

      if (act === 'originAccept') {
        if (!careerId) return;
        ctx.bus.emit('career:origin:accept', { careerId, source: 'missionLog' });
        ctx.bus.emit('audio:cue', { id: 'ui_accept' });
        this._render();
        return;
      }
      if (act === 'originDecline') {
        if (!careerId) return;
        ctx.bus.emit('career:origin:decline', { careerId, source: 'missionLog' });
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
        this._render();
        return;
      }
      if (act === 'originRecover') {
        if (!careerId) return;
        ctx.bus.emit('career:origin:reoffer', { careerId, source: 'missionLog' });
        ctx.bus.emit('audio:cue', { id: 'ui_accept' });
        this._render();
        return;
      }
      if (act === 'originChoose') {
        const choiceId = btn.getAttribute('data-choice-id');
        if (!careerId || !choiceId) return;
        ctx.bus.emit('career:origin:choose', { careerId, choiceId, source: 'missionLog' });
        ctx.bus.emit('audio:cue', { id: 'ui_accept' });
        this._render();
        return;
      }

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
      'button[data-rec-act="endgameUnfiledJump"]:not([disabled]),'
      + 'button[data-rec-act="endgameSandbox"]:not([disabled]),'
      + 'button[data-rec-act="track"]:not([disabled]),button[data-rec-act="openMap"]:not([disabled])',
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
    bus.on('career:origins:offered', refresh);
    bus.on('career:origins:accepted', refresh);
    bus.on('career:origins:declined', refresh);
    bus.on('career:origins:progress', refresh);
    bus.on('endgame:eligibility', refresh);
    bus.on('endgame:confirmRequired', refresh);
    bus.on('endgame:chosen', refresh);
    bus.on('endgame:sandboxContinued', refresh);
    bus.on('story:postEndingProgress', refresh);
    bus.on('story:replayHookUnlocked', refresh);
    bus.on('postEndingReplay:route', refresh);
    bus.on('postEndingReplay:cycleCompleted', refresh);
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
        '<span class="sf-mlog-card-type">' + (m.id ? entitySpanHtml('contract:' + m.id, escapeHtml(prettyType(m.type))) : escapeHtml(prettyType(m.type))) + '</span>' +
        '<span class="sf-mlog-card-risk sf-fig r' + risk + '">R' + risk + '</span>';
      card.appendChild(top);

      // Objective progress
      const objLine = el('div', 'sf-mlog-obj');
      const prog = m.objectiveProgress || 0;
      const tgt = m.objectiveTarget || 1;
      const pct = Math.max(0, Math.min(100, Math.round((prog / tgt) * 100)));
      objLine.innerHTML =
        '<span class="sf-mlog-obj-text">' + escapeHtml(objectiveText(m)) + '</span>' +
        '<span class="sf-mlog-obj-pct sf-fig">' + pct + '%</span>';
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
      const meta = el('div', 'sf-mlog-meta');
      const fac = m.factionId ? FACTION_BY_ID.get(m.factionId) : null;
      const destStn = m.destStationId ? STATION_INFO.get(m.destStationId) : null;
      const destSec = m.destSectorId ? SECTOR_BY_ID.get(m.destSectorId) : null;
      const destHtml = destStn
        ? entitySpanHtml('station:' + m.destStationId, escapeHtml(destStn.name))
          + (destSec ? ' (' + entitySpanHtml('sector:' + m.destSectorId, escapeHtml(destSec.name)) + ')' : '')
        : destSec
          ? entitySpanHtml('sector:' + m.destSectorId, escapeHtml(destSec.name + ' sector'))
          : escapeHtml(destLabel(m));
      const facHtml = fac
        ? entitySpanHtml('faction:' + m.factionId, escapeHtml(fac.short || fac.name))
        : '';
      meta.innerHTML =
        '<span class="sf-mlog-dest">' + destHtml + '</span>' +
        (remaining > 0 ? '<span class="sf-mlog-time sf-fig' + (urgent ? ' urgent' : '') + '">' + fmtTime(remaining) + '</span>' : '') +
        '<span class="sf-mlog-cr sf-fig">+' + (m.reward_cr || 0).toLocaleString() + ' cr</span>' +
        (facHtml ? '<span class="sf-mlog-fac">' + facHtml + '</span>' : '');
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
        (mapAction ? '<button class="sf-mlog-btn-map" type="button" data-act="openMap"' + mapActionButtonAttrs(mapAction, m.id) + ' aria-label="' + escapeHtml(mapAction.title) + '">' + escapeHtml(mapAction.label) + '</button>' : '') +
        '<button class="sf-mlog-btn-abandon" type="button" data-act="abandon" data-mid="' + escapeHtml(m.id) + '" aria-label="' + escapeHtml('Abandon ' + titleText) + '">ABANDON</button>';
      card.appendChild(btns);

      frag.appendChild(card);
    }
    this._listEl.appendChild(frag);

    if (this._compVisible) this._renderCompleted();
  },

  // Only final disposition / post-ending continuity persists beside normal work. Earlier story
  // beats remain folded into CURRENT ACTION so this screen never returns to competing commands.
  _renderStory(state) {
    if (!this._storyEl) return;
    const active = (state.missions && state.missions.active) || [];
    const tracked = state.ui && state.ui.trackedMissionId;
    const action = persistentCampaignAction(state, active, tracked);
    if (!action) {
      this._storyEl.innerHTML = '';
      this._storyEl.hidden = true;
      if (this._storyHeader) this._storyHeader.hidden = true;
      return;
    }
    if (this._storyHeader) {
      this._storyHeader.textContent = 'CAMPAIGN THREAD';
      this._storyHeader.hidden = false;
    }
    this._storyEl.hidden = false;
    this._storyEl.innerHTML =
      '<div class="sf-mlog-story-tile" data-campaign-thread="true">' +
        '<div class="sf-mlog-story-beat">' + escapeHtml(action.label || 'STORY') + '</div>' +
        '<div class="sf-mlog-story-objective">' + escapeHtml(action.title || 'Campaign continues') + '</div>' +
        '<div class="sf-mlog-story-introduces">' + escapeHtml(action.body || '') + '</div>' +
        dispositionRouteRowsHtml(action.routeOptions) +
        (action.meta ? '<div class="sf-mlog-rec-meta sf-fig">' + escapeHtml(action.meta) + '</div>' : '') +
        (action.action === 'endgameSandbox' || action.action === 'endgameUnfiledJump' || action.secondaryAction === 'endgameSandbox' || action.mapAction ? '<div class="sf-mlog-rec-actions">' +
          (action.action === 'endgameSandbox' || action.action === 'endgameUnfiledJump' ? '<button class="sf-mlog-rec-action" type="button" data-rec-act="' + escapeHtml(action.action) + '">' + escapeHtml(action.actionLabel || 'CONTINUE OPEN') + '</button>' : '') +
          (action.secondaryAction === 'endgameSandbox' && action.action !== 'endgameSandbox' ? '<button class="sf-mlog-rec-action sf-mlog-rec-secondary" type="button" data-rec-act="endgameSandbox">' + escapeHtml(action.secondaryActionLabel || 'CONTINUE WITHOUT FILING') + '</button>' : '') +
          (action.mapAction ? '<button class="sf-mlog-rec-action sf-mlog-rec-map" type="button" data-rec-act="openMap"' + mapActionButtonAttrs(action.mapAction, action.mapAction.missionId || '') + ' data-why="' + escapeHtml(action.mapAction.body || action.mapAction.title || '') + '">' + escapeHtml(action.mapAction.label) + '</button>' : '') +
        '</div>' : '') +
      '</div>';
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
        dispositionRouteRowsHtml(a.routeOptions) +
        (a.meta ? '<div class="sf-mlog-rec-meta sf-fig">' + escapeHtml(a.meta) + '</div>' : '') +
        '<div class="sf-mlog-rec-marker">' + (a.mapAction
          ? '◆ BRIGHT AMBER DIAMOND = CURRENT GOAL'
          : (a.action === 'track' ? 'NO GOAL MARKER · TRACK NAV TO CREATE ONE' : 'NO GOAL MARKER YET')) + '</div>' +
        ((a.action === 'track' && a.missionId) || a.action === 'endgameSandbox' || a.action === 'endgameUnfiledJump' || a.secondaryAction === 'endgameSandbox' || a.mapAction ? '<div class="sf-mlog-rec-actions">' +
          (a.action === 'track' && a.missionId ? '<button class="sf-mlog-rec-action" type="button" data-rec-act="track" data-mid="' + escapeHtml(a.missionId) + '">' + escapeHtml(a.actionLabel || 'TRACK NAV') + '</button>' : '') +
          (a.action === 'endgameSandbox' || a.action === 'endgameUnfiledJump' ? '<button class="sf-mlog-rec-action" type="button" data-rec-act="' + escapeHtml(a.action) + '">' + escapeHtml(a.actionLabel || 'CONTINUE OPEN') + '</button>' : '') +
          (a.secondaryAction === 'endgameSandbox' && a.action !== 'endgameSandbox' ? '<button class="sf-mlog-rec-action sf-mlog-rec-secondary" type="button" data-rec-act="endgameSandbox">' + escapeHtml(a.secondaryActionLabel || 'CONTINUE WITHOUT FILING') + '</button>' : '') +
          (a.mapAction ? '<button class="sf-mlog-rec-action sf-mlog-rec-map" type="button" data-rec-act="openMap"' + mapActionButtonAttrs(a.mapAction, a.missionId || a.mapAction.missionId || '') + ' data-why="' + escapeHtml(a.mapAction.body || a.mapAction.title || '') + '">' + escapeHtml(a.mapAction.label) + '</button>' : '') +
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
   * Career strip for the flight log (origin selection followed by CL-UI-03 ladder state).
   * Presenter-only model; every button emits an owner intent and never writes career state.
   */
  _renderCareerChip(state) {
    if (!this._careerEl) return;
    const focusToken = this._captureCareerFocusToken();
    const registry = this._ctx && this._ctx.registry;
    let model = null;
    let originModel = null;
    try {
      model = buildMissionLogCareerChip(state, registry);
      originModel = buildMissionLogOriginChoiceModel(state, registry);
    } catch (_) {
      model = null;
      originModel = null;
    }
    const originCards = (originModel && originModel.visible && Array.isArray(originModel.cards))
      ? originModel.cards : [];
    const ladderChips = (model && model.visible && Array.isArray(model.chips)) ? model.chips : [];
    const chips = originCards.length ? originCards : ladderChips;
    if (!chips.length) {
      this._careerEl.innerHTML = '';
      this._careerEl.hidden = true;
      if (this._careerHeader) this._careerHeader.hidden = true;
      return;
    }
    if (this._careerHeader) {
      this._careerHeader.hidden = false;
      this._careerHeader.textContent = originCards.length ? 'CHOOSE A FIRST CONTRACT' : 'CAREER LADDER';
    }
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
        '<div class="sf-mlog-receipt-outcome">' + escapeHtml(rowData.outcome) + '</div>' +
        '<div class="sf-mlog-receipt-main">' +
          '<div class="sf-mlog-receipt-title">' + escapeHtml(rowData.title) + '</div>' +
          '<div class="sf-mlog-receipt-body">' + escapeHtml(rowData.body) + '</div>' +
          (rowData.meta ? '<div class="sf-mlog-receipt-meta sf-fig">' + escapeHtml(rowData.meta) + '</div>' : '') +
        '</div>';
      frag.appendChild(row);
    }
    if (log.length) {
      frag.appendChild(el('div', 'sf-mlog-comp-subhead', 'CAREER TOTALS'));
    }
    for (const rec of log) {
      const row = el('div', 'sf-mlog-comp-row');
      const success = Math.max(0, Number(rec.success) || 0);
      const count = Math.max(success, Number(rec.count) || 0);
      const failed = Math.max(0, count - success);
      row.innerHTML =
        '<span class="sf-mlog-comp-type">' + escapeHtml(prettyType(rec.type)) + '</span>' +
        '<span class="sf-mlog-comp-count sf-fig">' + success + ' completed · ' + failed + ' failed</span>' +
        '<span class="sf-mlog-comp-cr sf-fig">+' + (rec.totalCr || 0).toLocaleString() + ' cr paid</span>';
      frag.appendChild(row);
    }
    this._compListEl.appendChild(frag);
  },
};

// ---- CSS (injected once) ----
const CSS = `
/* Contract ledger. styles/menu.css still owns the plate; this sheet is instrument grammar:
   one DISPLAY (the current-action title), colour by meaning, 12px floor, --sf-data-face on figures.
   Selectors that have to beat menu.css's (0,2,0) keep .sf-menu so they tie on source order. */
.sf-menu.sf-mlog {
  width: min(92vw, 700px); max-height: min(88vh, 720px); display: flex;
  flex-direction: column; gap: 0; padding: var(--sp-4) 0 var(--sp-1); overflow: hidden;
  pointer-events: auto; font-family: var(--sf-body-face); font-size: 14px; color: var(--sf-paper);
  background: var(--sf-surface);
}
.sf-menu.sf-mlog button { border-radius: 2px; font-family: var(--sf-body-face); font-size: 13px; }
.sf-menu.sf-mlog button:hover { box-shadow: none; }

.sf-mlog .sf-fig {
  font-family: var(--sf-data-face); font-weight: 500; font-variant-numeric: tabular-nums;
  font-size: 13px; letter-spacing: 0;
}

.sf-mlog-head {
  display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--sf-edge);
  background: var(--sf-surface);
}
.sf-mlog-title, .sf-mlog-section-h, .sf-mlog-rec-label, .sf-mlog-card-type,
.sf-mlog-story-beat, .sf-mlog-career-status, .sf-mlog-career-step, .sf-mlog-term b,
.sf-mlog-command-fact b, .sf-mlog-receipt-outcome, .sf-mlog-comp-subhead, .sf-mlog-ending-code {
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase; color: var(--sf-calm);
}
.sf-mlog-hint {
  font-family: var(--sf-body-face); font-size: 13px; color: var(--sf-calm); letter-spacing: 0;
}
.sf-mlog-close { font-size: 13px; padding: var(--sp-1) var(--sp-3); color: var(--sf-paper); }

.sf-mlog-section-h { padding: var(--sp-3) var(--sp-4) var(--sp-1); }
.sf-mlog-section-comp {
  display: flex; align-items: center; justify-content: space-between;
  border-top: 1px solid var(--sf-edge); margin-top: var(--sp-1); padding-top: var(--sp-2);
}
.sf-mlog-toggle { font-size: 12px; padding: var(--sp-1) var(--sp-2); color: var(--sf-calm); }

.sf-mlog-story { padding: var(--sp-1) var(--sp-4) var(--sp-2); }
.sf-mlog-story-tile {
  border: 1px solid var(--sf-edge); border-left: var(--sf-rail-w) solid var(--sf-goal);
  border-radius: 2px; padding: var(--sp-3);
  background: color-mix(in srgb, var(--sf-surface) 88%, transparent);
}
.sf-mlog-story-beat { margin-bottom: var(--sp-1); color: var(--sf-goal); }
.sf-mlog-story-objective {
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 19px; line-height: 1.25;
  color: var(--sf-paper);
}
.sf-mlog-story-introduces {
  font-family: var(--sf-body-face); font-size: 13px; color: var(--sf-calm); margin-top: var(--sp-2); line-height: 1.4;
}
.sf-mlog-ending-routes { display: grid; gap: var(--sp-1); margin-top: var(--sp-2); }
.sf-mlog-ending-route {
  display: grid; grid-template-columns: 24px minmax(96px,.8fr) minmax(120px,1.2fr);
  gap: var(--sp-1) var(--sp-2); align-items: baseline; padding: var(--sp-1) var(--sp-2);
  border-left: var(--sf-rail-w) solid var(--sf-edge);
  background: color-mix(in srgb, var(--sf-surface) 80%, transparent);
}
.sf-mlog-ending-route--ready { border-left-color: var(--sf-goal); }
.sf-mlog-ending-route--declined { opacity: .62; }
.sf-mlog-ending-title {
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 15px; color: var(--sf-paper);
  overflow-wrap: anywhere;
}
.sf-mlog-ending-interface { font-family: var(--sf-body-face); font-size: 13px; color: var(--sf-calm); overflow-wrap: anywhere; }
.sf-mlog-ending-reason {
  grid-column: 2 / -1; font-family: var(--sf-body-face); font-size: 13px; line-height: 1.3;
  color: var(--sf-calm); overflow-wrap: anywhere;
}

.sf-mlog-recommend { padding: var(--sp-1) var(--sp-4) var(--sp-2); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-2); }
.sf-mlog-rec-item {
  min-width: 0; border: 1px solid var(--sf-edge); border-radius: 2px; padding: var(--sp-3);
  background: color-mix(in srgb, var(--sf-surface) 88%, transparent);
}
.sf-mlog-rec-item--primary { border-color: var(--sf-goal-edge); border-left: var(--sf-rail-w) solid var(--sf-goal); }
.sf-mlog-rec-item--warn { border-color: var(--sf-goal-edge); border-left: var(--sf-rail-w) solid var(--sf-goal); }
.sf-mlog-rec-item--bad { border-left: var(--sf-rail-w) solid var(--sf-foe); }
.sf-mlog-rec-label { margin-bottom: var(--sp-1); overflow-wrap: anywhere; color: var(--sf-goal); }
.sf-mlog-rec-item--warn .sf-mlog-rec-label { color: var(--sf-goal); }
.sf-mlog-rec-item--bad .sf-mlog-rec-label { color: var(--sf-foe); }
.sf-mlog-rec-title {
  font-family: var(--sf-display-face); font-weight: 700; font-size: 28px; line-height: 1.1;
  color: var(--sf-paper); letter-spacing: 0; text-transform: none; margin-bottom: var(--sp-1);
  overflow-wrap: anywhere;
}
.sf-mlog-rec-body { font-family: var(--sf-body-face); font-size: 14px; line-height: 1.4; color: var(--sf-calm); overflow-wrap: anywhere; }
.sf-mlog-command-brief { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-2) var(--sp-3); margin-top: var(--sp-2); }
.sf-mlog-command-fact {
  min-width: 0; display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: var(--sp-2);
  align-items: start; padding-top: var(--sp-1); border-top: 1px solid var(--sf-edge);
  font-family: var(--sf-body-face); font-size: 13px; line-height: 1.35; color: var(--sf-calm); overflow-wrap: anywhere;
}
.sf-mlog-command-fact:nth-child(5) span { color: var(--sf-you); font-family: var(--sf-data-face); font-variant-numeric: tabular-nums; }
.sf-mlog-command-fact:nth-child(6) span { color: var(--sf-foe); }
.sf-mlog-rec-meta { margin-top: var(--sp-2); color: var(--sf-you); overflow-wrap: anywhere; }
.sf-mlog-rec-marker {
  margin-top: var(--sp-2); color: var(--sf-goal); font-family: var(--sf-subhead-face); font-weight: 600;
  font-size: 12px; letter-spacing: var(--sf-track-micro); text-transform: uppercase; line-height: 1.3;
}
.sf-mlog-rec-actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-2); }
.sf-mlog-rec-action {
  font-size: 13px; padding: var(--sp-1) var(--sp-2); border-color: var(--sf-goal);
  color: var(--sf-goal); background: color-mix(in srgb, var(--sf-goal) 10%, transparent);
}
.sf-mlog-rec-action:hover { border-color: var(--sf-goal); color: var(--sf-paper); background: color-mix(in srgb, var(--sf-goal) 18%, transparent); }
.sf-mlog-rec-map { border-color: var(--sf-goal-edge); color: var(--sf-goal); background: color-mix(in srgb, var(--sf-goal) 8%, transparent); }
.sf-mlog-rec-secondary { border-color: var(--sf-edge); color: var(--sf-calm); background: transparent; }

.sf-mlog-section-career { color: var(--sf-calm); }
.sf-mlog-career-list { padding: var(--sp-1) var(--sp-4) var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-2); }
.sf-mlog-career-list[hidden], .sf-mlog-section-career[hidden] { display: none; }
.sf-mlog-career {
  border: 1px solid var(--sf-edge); border-radius: 2px; padding: var(--sp-3);
  background: color-mix(in srgb, var(--sf-surface) 88%, transparent);
}
.sf-mlog-career--collapsed { opacity: .72; }
.sf-mlog-career--active { border-left: var(--sf-rail-w) solid var(--sf-you); }
.sf-mlog-career--offered { border-left: var(--sf-rail-w) solid var(--sf-you); }
.sf-mlog-career--failed, .sf-mlog-career--recovering { border-left: var(--sf-rail-w) solid var(--sf-foe); }
.sf-mlog-career--complete { border-left: var(--sf-rail-w) solid var(--sf-you); }
.sf-mlog-career--abandoned { opacity: .78; }
.sf-mlog-career-top { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-1); }
.sf-mlog-career-title {
  flex: 1; font-family: var(--sf-subhead-face); font-weight: 600; font-size: 19px; color: var(--sf-paper);
  overflow-wrap: anywhere;
}
.sf-mlog-career-status {
  flex: none; padding: 1px var(--sp-2); border-radius: 2px;
  background: color-mix(in srgb, var(--sf-calm) 12%, transparent); border: 1px solid var(--sf-edge);
}
.sf-mlog-career--failed .sf-mlog-career-status,
.sf-mlog-career--recovering .sf-mlog-career-status {
  color: var(--sf-foe); border-color: var(--sf-foe); background: color-mix(in srgb, var(--sf-foe) 10%, transparent);
}
.sf-mlog-career--complete .sf-mlog-career-status {
  color: var(--sf-you); border-color: var(--sf-you); background: color-mix(in srgb, var(--sf-you) 10%, transparent);
}
.sf-mlog-career--offered .sf-mlog-career-status {
  color: var(--sf-you); border-color: var(--sf-you); background: color-mix(in srgb, var(--sf-you) 10%, transparent);
}
.sf-mlog-career-step { margin-bottom: var(--sp-1); }
.sf-mlog-career-place {
  font-family: var(--sf-body-face); font-size: 13px; color: var(--sf-calm);
  margin-bottom: var(--sp-1); overflow-wrap: anywhere;
}
.sf-mlog-career-contact { color: var(--sf-calm); }
.sf-mlog-career-location { color: var(--sf-goal); }
.sf-mlog-career-objective {
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 15px; line-height: 1.35;
  color: var(--sf-paper); margin-bottom: var(--sp-1); overflow-wrap: anywhere;
}
.sf-mlog-career-progress { color: var(--sf-calm); margin-bottom: var(--sp-1); }
.sf-mlog-career-next {
  font-family: var(--sf-body-face); font-size: 14px; line-height: 1.35; color: var(--sf-calm);
  margin-bottom: var(--sp-1); overflow-wrap: anywhere;
}
.sf-mlog-career-consequence {
  font-family: var(--sf-body-face); font-size: 13px; color: var(--sf-goal);
  margin-bottom: var(--sp-1); overflow-wrap: anywhere;
}
.sf-mlog-career-fail {
  font-family: var(--sf-body-face); font-size: 14px; line-height: 1.35; color: var(--sf-foe);
  margin-bottom: var(--sp-1); overflow-wrap: anywhere;
}
.sf-mlog-career-receipt {
  font-family: var(--sf-body-face); font-size: 13px; line-height: 1.3; color: var(--sf-calm);
  margin-bottom: var(--sp-1); overflow-wrap: anywhere;
}
.sf-mlog-career-choices { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin: var(--sp-2) 0 var(--sp-1); }
.sf-mlog-career-actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-2); }
.sf-mlog-career-btn {
  font-size: 13px; padding: var(--sp-2) var(--sp-3); min-height: 44px; min-width: 44px;
  border-color: var(--sf-edge); color: var(--sf-calm); background: transparent;
}
.sf-mlog-career-btn:hover:not(:disabled) { border-color: var(--sf-you); color: var(--sf-you); }
.sf-mlog-career-btn:focus-visible { outline: 2px solid var(--sf-goal); outline-offset: 2px; }
.sf-mlog-career-btn:disabled { opacity: .4; cursor: default; }
.sf-mlog-career-btn-map { border-color: var(--sf-goal-edge); color: var(--sf-goal); background: color-mix(in srgb, var(--sf-goal) 8%, transparent); }
.sf-mlog-career-btn-recover { border-color: var(--sf-goal-edge); color: var(--sf-goal); background: color-mix(in srgb, var(--sf-goal) 8%, transparent); }
.sf-mlog-career-btn-track { border-color: var(--sf-edge); }
.sf-mlog-career-btn-abandon { border-color: var(--sf-edge); color: var(--sf-calm); }
.sf-mlog-career-btn-abandon:hover:not(:disabled) { border-color: var(--sf-foe); color: var(--sf-foe); }
.sf-mlog-career-btn-choice { border-color: var(--sf-goal-edge); color: var(--sf-paper); background: color-mix(in srgb, var(--sf-goal) 8%, transparent); }

.sf-mlog-list { flex: 1; overflow-y: auto; padding: var(--sp-2) var(--sp-4) var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-3); }
.sf-mlog-empty { color: var(--sf-calm); font-size: 14px; padding: var(--sp-4) var(--sp-1); }

.sf-mlog-card {
  border: 1px solid var(--sf-edge); border-radius: 2px; padding: var(--sp-3);
  background: color-mix(in srgb, var(--sf-surface) 88%, transparent);
}
.sf-mlog-card.tracked { border-left: var(--sf-rail-w) solid var(--sf-you); }
.sf-mlog-card.urgent { border-color: var(--sf-foe); }

.sf-mlog-card-top { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.sf-mlog-card-title { font-family: var(--sf-subhead-face); font-weight: 600; font-size: 15px; flex: 1; color: var(--sf-paper); overflow-wrap: anywhere; }
.sf-mlog-card-type { padding: 1px var(--sp-2); border-radius: 2px; background: color-mix(in srgb, var(--sf-calm) 10%, transparent); }
.sf-mlog-card-risk { padding: 1px var(--sp-1); border-radius: 2px; background: color-mix(in srgb, var(--sf-calm) 10%, transparent); color: var(--sf-calm); }
.sf-mlog-card-risk.r0 { color: var(--sf-calm); }
.sf-mlog-card-risk.r1 { color: var(--sf-you); }
.sf-mlog-card-risk.r2 { color: var(--sf-goal); }
.sf-mlog-card-risk.r3, .sf-mlog-card-risk.r4 { color: var(--sf-foe); }

.sf-mlog-obj { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2);
  font-family: var(--sf-body-face); font-size: 14px; margin-bottom: var(--sp-1); }
.sf-mlog-obj-text { color: var(--sf-calm); }
.sf-mlog-obj-pct { color: var(--sf-you); min-width: 36px; text-align: right; }

.sf-mlog-pbar { height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--sf-calm) 18%, transparent); overflow: hidden; margin-bottom: var(--sp-2); border: 1px solid var(--sf-edge); }
.sf-mlog-pbar-fill { height: 100%; background: var(--sf-you); border-radius: 2px; }
.sf-mlog-next { color: var(--sf-calm); font-family: var(--sf-body-face); font-size: 13px; line-height: 1.35; margin: 0 0 var(--sp-2); }

.sf-mlog-meta { display: flex; flex-wrap: wrap; gap: var(--sp-3); font-family: var(--sf-body-face); font-size: 13px; margin-bottom: var(--sp-2); }
.sf-mlog-dest { color: var(--sf-calm); }
.sf-mlog-time { color: var(--sf-calm); }
.sf-mlog-time.urgent { color: var(--sf-foe); font-weight: 600; }
.sf-mlog-cr { color: var(--sf-you); }
.sf-mlog-fac { font-size: 13px; color: var(--sf-calm); }
.sf-mlog-terms { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: var(--sp-2); margin: 0 0 var(--sp-2); }
.sf-mlog-term {
  min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: var(--sp-1) var(--sp-2);
  border: 1px solid var(--sf-edge); border-radius: 2px;
  font-family: var(--sf-body-face); font-size: 13px; line-height: 1.3; color: var(--sf-calm); overflow-wrap: anywhere;
}
.sf-mlog-term--ok { border-color: var(--sf-you); color: var(--sf-you); }
.sf-mlog-term--info { border-color: var(--sf-edge); color: var(--sf-calm); }
.sf-mlog-term--warn { border-color: var(--sf-goal); color: var(--sf-goal); }
.sf-mlog-term--bad { border-color: var(--sf-foe); color: var(--sf-foe); }

.sf-mlog-btns { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.sf-mlog-btn-track { font-size: 13px; padding: var(--sp-1) var(--sp-3); border-color: var(--sf-edge); color: var(--sf-calm); }
.sf-mlog-btn-track:hover { border-color: var(--sf-you); color: var(--sf-you); }
.sf-mlog-btn-track.active { border-color: var(--sf-you); color: var(--sf-you); background: color-mix(in srgb, var(--sf-you) 10%, transparent); }
.sf-mlog-btn-map { font-size: 13px; padding: var(--sp-1) var(--sp-3); border-color: var(--sf-goal-edge); color: var(--sf-goal); background: color-mix(in srgb, var(--sf-goal) 8%, transparent); }
.sf-mlog-btn-map:hover { border-color: var(--sf-goal); color: var(--sf-paper); }
.sf-mlog-btn-abandon { font-size: 13px; padding: var(--sp-1) var(--sp-3); border-color: var(--sf-edge); color: var(--sf-calm); }
.sf-mlog-btn-abandon:hover { border-color: var(--sf-foe); color: var(--sf-foe); }

.sf-mlog-comp-list { padding: var(--sp-1) var(--sp-4) var(--sp-3); }
.sf-mlog-receipt-row {
  display: grid; grid-template-columns: 82px 1fr; gap: var(--sp-2); align-items: start;
  padding: var(--sp-2); margin-bottom: var(--sp-2); border: 1px solid var(--sf-edge); border-radius: 2px;
  background: color-mix(in srgb, var(--sf-surface) 88%, transparent);
}
.sf-mlog-receipt-row--ok { border-left: var(--sf-rail-w) solid var(--sf-you); }
.sf-mlog-receipt-row--warn { border-left: var(--sf-rail-w) solid var(--sf-goal); }
.sf-mlog-receipt-row--bad { border-left: var(--sf-rail-w) solid var(--sf-foe); }
.sf-mlog-receipt-outcome { overflow-wrap: anywhere; }
.sf-mlog-receipt-row--ok .sf-mlog-receipt-outcome { color: var(--sf-you); }
.sf-mlog-receipt-row--warn .sf-mlog-receipt-outcome { color: var(--sf-goal); }
.sf-mlog-receipt-row--bad .sf-mlog-receipt-outcome { color: var(--sf-foe); }
.sf-mlog-receipt-main { min-width: 0; }
.sf-mlog-receipt-title { color: var(--sf-paper); font-family: var(--sf-subhead-face); font-weight: 600; font-size: 15px; line-height: 1.25; overflow-wrap: anywhere; }
.sf-mlog-receipt-body { color: var(--sf-calm); font-family: var(--sf-body-face); font-size: 13px; line-height: 1.35; margin-top: var(--sp-1); overflow-wrap: anywhere; }
.sf-mlog-receipt-meta { color: var(--sf-calm); margin-top: var(--sp-1); overflow-wrap: anywhere; }
.sf-mlog-comp-subhead { margin: var(--sp-3) var(--sp-1) var(--sp-1); }
.sf-mlog-comp-row {
  display: flex; gap: var(--sp-4); align-items: center; padding: var(--sp-1) var(--sp-2);
  border-bottom: 1px solid var(--sf-edge); font-family: var(--sf-body-face); font-size: 13px; color: var(--sf-calm);
}
.sf-mlog-comp-type { flex: 1; }
.sf-mlog-comp-count { color: var(--sf-calm); }
.sf-mlog-comp-cr { color: var(--sf-you); }

@media (max-width: 700px), (max-height: 620px) {
  .sf-mlog-command-brief { grid-template-columns: minmax(0, 1fr); }
  .sf-mlog-command-fact { grid-template-columns: 44px minmax(0, 1fr); }
  .sf-mlog-list { gap: var(--sp-2); }
  .sf-mlog-card { padding: var(--sp-2); }
  .sf-mlog-rec-title { font-size: 28px; }
}
@media (prefers-reduced-motion: reduce) {
  .sf-menu.sf-mlog, .sf-menu.sf-mlog * { animation: none; transition: none; }
}
@media (forced-colors: active) {
  .sf-menu.sf-mlog, .sf-mlog-card, .sf-mlog-rec-item, .sf-mlog-career, .sf-mlog-story-tile, .sf-mlog-receipt-row {
    background: Canvas; color: CanvasText; border-color: CanvasText;
  }
  .sf-mlog-card.tracked, .sf-mlog-rec-item--primary, .sf-mlog-career--active, .sf-mlog-story-tile {
    border-left-color: CanvasText;
  }
}
`;
