// src/ui/station/screens/contracts.js — station Missions board (internal id remains contracts).
// Board list · briefing dossier (centerpiece) · active operations. Progressive disclosure:
// the list is scannable, the dossier is the full brief, no wall of text. Emits
// ui:acceptMission / ui:trackMission / ui:abandonMission {missionId}.
//
// When the station shell passes attention / missionId (from missionDockAttention), that job is
// sorted first, selected, and given a glowing "needs action" treatment so turn-in / accept is
// not a scavenger hunt under an old "Contracts" label.
import { COMMODITIES } from '../../../data/commodities.js';
import { FACTION_META } from '../../../data/factions.js';
import { MISSION_TYPES } from '../../../data/missions.js';
import { SECTORS } from '../../../data/sectors.js';
import { contractTermById } from '../../../data/contractClauses.js';
import { escapeHtml } from '../../comms.js';
import { entitySpanHtml } from '../../entityResolver.js';
import { MAP_FOCUS, openGalaxyMap } from '../../mapAuthority.js';
import {
  missionCargoFootprint,
  missionConsequenceSummary,
  missionPreflight,
  missionRouteScope,
  missionStandingRequirement,
  missionUpfrontCost,
} from '../../missionPreflight.js';
import { mountDataState } from '../../uiPrimitives.js';
import { icon } from '../icons.js';
import { missionBoardReadiness } from '../stationHubModel.js';
import { recommendMissionBoardOffer } from '../stationMissionModel.js';

const CMDTY = new Map(COMMODITIES.map((c) => [c.id, c]));
const FAC = new Map(FACTION_META.map((f) => [f.id, f]));
const MISSION_DEF = new Map(MISSION_TYPES.map((def) => [def.type, def]));
const STATION_DEF = new Map(SECTORS.flatMap((sector) => (
  (sector.stations || []).map((station) => [station.id, station])
)));

const TYPE_ICON = {
  cargo_delivery: 'cargo', bulk_trade: 'cargo', passenger_transport: 'cargo', smuggling_run: 'cargo',
  mining_quota: 'industry', salvage_retrieval: 'industry',
  bounty_hunt: 'target', patrol_clear: 'target', escort: 'target',
  recon_scan: 'spark',
};
const RISK_LABEL = ['Routine', 'Low', 'Elevated', 'High', 'Severe', 'Severe'];
const FAC_TINT = { faction_scn: '#5b8dd6', faction_mts: '#d8b25a', faction_dmc: '#d17a4b', faction_reach: '#c1543f', faction_quiet: '#9b8bd0', faction_vael: '#cf5d86', faction_free: '#46b4a4', faction_choir: '#78c6d8' };
const FIRST_TRADE_SOURCE = 'firstTradeContract';
const ONBOARDING_CHOICE_SOURCE = 'onboardingChoice';

const mid = (m) => (m && (m.id != null ? m.id : m.missionId));
const num = (v) => Math.max(0, Math.round(Number(v) || 0));

/** Tier-2 "why" for a clause/condition chip, from the ENUMERATED catalog only (grammar §7):
 * CONTRACT_CLAUSES / missionConditions via contractTermById. An unknown id renders NOTHING —
 * never the offer row's free text, never a guess. `tabindex` makes the reveal answer keyboard
 * focus, not just hover. Exported for the tier-2 check. */
export function clauseWhyAttr(clause) {
  const term = clause && clause.id ? contractTermById(clause.id) : null;
  const prose = term && term.prose ? String(term.prose).trim() : '';
  if (!prose) return '';
  return ` data-why="${escapeHtml(prose)}" tabindex="0"`;
}
const reward = (m) => num(m.reward != null ? m.reward : (m.reward_cr != null ? m.reward_cr : (m.rewardCr != null ? m.rewardCr : m.payout)));
const risk = (m) => num(m.riskTier != null ? m.riskTier : m.risk);
const typeLabel = (t) => String(t || 'mission').replace(/_/g, ' ');
const facName = (m) => { const f = FAC.get(m.factionId); return (f && f.name) || (m.factionName) || 'Open mission'; };
const facTint = (m) => FAC_TINT[m.factionId] || '#4aa8ff';

export function missionOffersFollowUp(mission) {
  const def = mission && MISSION_DEF.get(mission.type);
  return !!(def && def.chainable);
}

export function missionBoardDispatchLabel(state, stationId, offerCount = 0) {
  const ob = state && state.onboarding;
  const choiceIds = ob && Array.isArray(ob.choiceOfferIds) ? ob.choiceOfferIds : [];
  if (ob && ob.active && !ob.finished && ob.choiceStationId === stationId && choiceIds.length === 3) {
    return 'FIRST FLIGHT / PICK ONE · HAUL / BOUNTY / SURVEY';
  }
  const board = state && state.missions && state.missions.boards
    && state.missions.boards[stationId];
  const hasFirstTrade = board && Array.isArray(board.slots)
    && board.slots.some((offer) => offer && offer.source === FIRST_TRADE_SOURCE);
  if (ob && ob.active && !ob.finished && hasFirstTrade) {
    return 'FIRST FLIGHT / RECOMMENDED DELIVERY';
  }
  const station = STATION_DEF.get(stationId);
  if (!station || !station.dispatchConflictKey) return 'LIVE DISPATCH / SELECT A MISSION';
  const conflict = state && state.conflicts && state.conflicts[station.dispatchConflictKey] || {};
  const phase = ['cold', 'tense', 'war'].includes(conflict.state) ? conflict.state.toUpperCase() : 'COLD';
  const tension = Math.max(0, Math.min(100, Math.round(Number(conflict.tension) || 0)));
  // The dispatch instrument needs terse operational identifiers (DMC/MTS), not the conversational
  // faction `short` labels (Drift/Meridian) used in prose elsewhere in Station OS.
  const sides = station.dispatchConflictKey.split(':')
    .map((id) => id.replace(/^faction_/, '').replace(/_/g, ' ').toUpperCase());
  return `${station.dispatchLabel || 'LIVE DISPATCH'} / ${Math.max(0, offerCount | 0)} LIVE / ${sides.join('–')} FRONT ${phase} · ${tension}/100`;
}

function riskColor(r) { return r <= 1 ? 'var(--gain)' : r === 2 ? 'var(--warn)' : 'var(--loss)'; }
function destName(m) {
  const params = (m && m.params) || {};
  return m.destinationName || m.destName || params.destinationName || params.destName
    || (m.local ? 'Local sector' : (m.destSectorId || params.destSectorId || 'Destination'));
}

function destEntityHtml(m) {
  const params = (m && m.params) || {};
  const stn = m.destStationId || params.destStationId;
  const sec = m.destSectorId || params.destSectorId;
  if (stn) {
    const rec = STATION_DEF.get(stn);
    return entitySpanHtml('station:' + stn, escapeHtml((rec && rec.name) || destName(m)));
  }
  if (sec) return entitySpanHtml('sector:' + sec, escapeHtml(destName(m)));
  return escapeHtml(destName(m));
}

function originEntityHtml(state, label) {
  const id = state && state.ui && state.ui.dockedStationId;
  return id ? entitySpanHtml('station:' + id, escapeHtml(label)) : escapeHtml(label);
}

function clientEntityHtml(m) {
  return m.factionId
    ? entitySpanHtml('faction:' + m.factionId, escapeHtml(facName(m)))
    : escapeHtml(facName(m));
}

function cargoEntityHtml(cargo, cargoName) {
  if (!cargo || !cargoName) return '';
  return entitySpanHtml('commodity:' + cargo.commodityId, escapeHtml(cargoName));
}

/**
 * Readiness for the briefing dossier. `missionPreflight` is the authority — the station does not
 * keep its own standing/funds/route/ship policy. Warnings stay warnings: a caution offer is still
 * acceptable, which is what the sim does with it. Consumed by `renderDossier`.
 */
export function missionDossierReadiness(mission, state) {
  const preflight = missionPreflight(mission, state);
  const blocker = preflight.blocker || null;
  const warning = blocker ? null : (preflight.warning || null);
  const readiness = missionBoardReadiness({ blocker, warning });
  const standing = missionStandingRequirement(mission, state);
  return {
    state: readiness.state,
    label: readiness.state === 'ready' ? 'ROUTE CLEAR' : (readiness.state === 'caution' ? 'CHECK' : 'BLOCKED'),
    detail: blocker || warning || 'Ship and account ready',
    blocker,
    warning,
    canAccept: !blocker,
    standingShort: !!(standing && !standing.ok),
    preflight,
  };
}

function cargoRequirement(m) {
  const params = m && m.params || {};
  const cargo = m && m.cargo || {};
  const footprint = missionCargoFootprint(m);
  const commodityId = params.cmdtyId || cargo.commodityId || cargo.cmdtyId
    || (m && m.cargoCommodityId);
  const qty = footprint.qty > 0
    ? footprint.qty
    : num(params.qty || cargo.qty || (m && m.cargoQty));
  return commodityId && qty > 0 ? { commodityId, qty } : null;
}

function riskPips(r, size) {
  let s = '';
  for (let i = 0; i < 5; i++) s += `<i class="${i < r ? 'on' : ''}" style="${i < r ? 'background:' + riskColor(r) : ''}"></i>`;
  return `<span class="sx-pips${size ? ' sx-pips--' + size : ''}">${s}</span>`;
}

function sortFocusFirst(list, focusId) {
  if (!focusId || !list.length) return list.slice();
  const fid = String(focusId);
  return list.slice().sort((a, b) => {
    const aHit = String(mid(a)) === fid ? 0 : 1;
    const bHit = String(mid(b)) === fid ? 0 : 1;
    return aHit - bHit;
  });
}

/** First-hour board labels are presentation over mission-owned provenance, never a second offer. */
export function firstHourBoardOfferPresentation(state, offer) {
  const ob = state && state.onboarding;
  if (!ob || !ob.active || ob.finished || !offer) return null;
  const id = String(mid(offer));
  const choiceIds = Array.isArray(ob.choiceOfferIds) ? ob.choiceOfferIds.map(String) : [];
  const choiceIndex = choiceIds.indexOf(id);
  if (offer.source === ONBOARDING_CHOICE_SOURCE && choiceIndex >= 0) {
    const authored = offer.onboardingChoice || {};
    const fallback = ['HAUL', 'BOUNTY', 'SURVEY'][choiceIndex] || 'CHOICE';
    return { label: String(authored.label || fallback).toUpperCase(), rank: choiceIndex, kind: 'choice' };
  }
  if (offer.source === FIRST_TRADE_SOURCE && choiceIds.length === 0) {
    return { label: 'RECOMMENDED', rank: -1, kind: 'recommended' };
  }
  return null;
}

/**
 * The one best-next pick for an ORDINARY board, as `{ missionId, label }` — the shared policy in
 * stationMissionModel decides it, this only decides whether the board is allowed to show one.
 * Two suppressions, both about not competing with a stronger authored voice:
 *  · any authored first-hour presentation on the board owns the badge slot outright, so a second
 *    "RECOMMENDED"-class badge cannot appear on a different row;
 *  · final-disposition filings are withdrawn from the input — a filing carries no payout and no
 *    accept blocker, so the score would happily "recommend" an irreversible ending.
 * The result is a badge and aria prefix only: order, selection, and every other offer are untouched.
 */
export function boardRecommendedOfferId(list = [], state = {}) {
  const offers = (Array.isArray(list) ? list : []).filter(Boolean);
  if (offers.some((offer) => firstHourBoardOfferPresentation(state, offer))) return { missionId: null, label: '' };
  const ordinary = offers.filter((offer) => !finalDispositionPresentation(offer));
  if (!ordinary.length) return { missionId: null, label: '' };
  const pick = recommendMissionBoardOffer(ordinary, state);
  if (!pick || pick.missionId == null) return { missionId: null, label: '' };
  return { missionId: String(pick.missionId), label: String(pick.label || '') };
}

function sortBoardOffers(list, state, focusId) {
  const decorated = list.map((offer, index) => ({
    offer,
    index,
    firstHour: firstHourBoardOfferPresentation(state, offer),
  }));
  decorated.sort((a, b) => {
    const aRank = a.firstHour ? a.firstHour.rank : Number.POSITIVE_INFINITY;
    const bRank = b.firstHour ? b.firstHour.rank : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    if (focusId) {
      const aFocus = String(mid(a.offer)) === String(focusId) ? 0 : 1;
      const bFocus = String(mid(b.offer)) === String(focusId) ? 0 : 1;
      if (aFocus !== bFocus) return aFocus - bFocus;
    }
    return a.index - b.index;
  });
  return decorated.map((row) => row.offer);
}

/** Authored mission copy shown in the dossier; missing copy leaves the existing preflight intact. */
export function missionDossierSummary(mission) {
  return typeof (mission && mission.summary) === 'string' ? mission.summary.trim() : '';
}

/** Final-disposition offers reuse the mission board transport, but are filings rather than jobs. */
export function finalDispositionPresentation(mission) {
  const choiceId = String(mission && mission.storyDisposition || '').trim();
  const raw = mission && mission.finalDisposition;
  if (!choiceId || !raw || String(raw.choiceId || '') !== choiceId) return null;
  const clean = (value, fallback = '') => {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || fallback;
  };
  return {
    choiceId,
    issuerName: clean(raw.issuerName, facName(mission)),
    confirmPrompt: clean(raw.confirmPrompt, 'FILE THIS FINAL DISPOSITION?'),
    confirmHint: clean(raw.confirmHint, 'Irreversible after the separate confirmation.'),
    resolution: clean(raw.resolution, 'The world continues from the position you file.'),
    continuityTitle: clean(raw.continuityTitle, 'CONTINUING OPERATIONS'),
    continuityObjective: clean(raw.continuityObjective, 'Continue working in the same living world.'),
    destinationName: clean(mission.destinationName, 'ASH CACHE FILING DESK'),
  };
}

function finalDispositionDossierHtml(mission, filing, options = {}) {
  const tint = options.tint || '#4aa8ff';
  const origin = options.origin || 'Ash Cache';
  const blocked = cleanText(options.blockedReason);
  const ready = !blocked;
  const focus = options.focusAccept && ready ? ' is-attention' : '';
  const title = cleanText(mission && mission.title) || `FINAL DISPOSITION — CHOICE ${filing.choiceId}`;
  const summary = missionDossierSummary(mission) || filing.confirmHint;
  const readiness = ready ? 'Eligibility verified · separate confirmation required' : blocked;
  return (
    `<div class="sx-dossier${focus}">` +
      `<header class="sx-dossier__head">` +
        `<span class="sx-dossier__crest" style="--tint:${tint}">${icon('contracts', 26)}</span>` +
        `<div class="sx-dossier__id">` +
          `<span class="sx-dossier__client">${escapeHtml(filing.issuerName)} · final disposition</span>` +
          `<h2>${escapeHtml(title)}</h2>` +
        `</div>` +
      `</header>` +
      `<p class="sx-dossier__summary">${escapeHtml(summary)}</p>` +
      `<div class="sx-dossier__topline">` +
        `<div class="sx-dossier__reward"><span>Filing</span><b>CHOICE ${escapeHtml(filing.choiceId)}</b></div>` +
        `<div class="sx-dossier__risk"><span>Decision</span><div class="sx-dossier__riskrow"><em style="color:var(--warn)">IRREVERSIBLE AFTER CONFIRMATION</em></div></div>` +
      `</div>` +
      `<div class="sx-dossier__route" aria-label="Final disposition filing path">` +
        `<div class="sx-route">` +
          `<span class="sx-route__node"><i></i>${escapeHtml(origin)}</span>` +
          `<span class="sx-route__line"><span class="sx-route__jumps">AT BERTH</span></span>` +
          `<span class="sx-route__stage"><i></i><b>REVIEW</b><em>no filing yet</em></span>` +
          `<span class="sx-route__line sx-route__line--short"></span>` +
          `<span class="sx-route__node sx-route__node--dest"><i></i>CONFIRM</span>` +
        `</div>` +
      `</div>` +
      `<div class="sx-dossier__grid">` +
        `<div class="sx-brief"><span class="sx-brief__ic">${icon('info', 16)}</span><span class="sx-brief__k">Issuer</span><span class="sx-brief__v">${escapeHtml(filing.issuerName)}</span></div>` +
        `<div class="sx-brief"><span class="sx-brief__ic">${icon('clock', 16)}</span><span class="sx-brief__k">Confirmation</span><span class="sx-brief__v">Separate prompt</span><span class="sx-brief__sub">nothing files on selection</span></div>` +
        `<div class="sx-brief"><span class="sx-brief__ic">${icon('spark', 16)}</span><span class="sx-brief__k">Continuity</span><span class="sx-brief__v">${escapeHtml(filing.continuityTitle)}</span><span class="sx-brief__sub">${escapeHtml(filing.continuityObjective)}</span></div>` +
      `</div>` +
      `<div class="sx-contract-sim" aria-label="Previewed final disposition consequences">` +
        `<span class="sx-contract-sim__label">POSITION</span>` +
        `<div><span>FILED POSITION</span><b>${escapeHtml(filing.resolution)}</b><em>The same world remains playable.</em></div>` +
        `<div><span>NEXT WORK</span><b>${escapeHtml(filing.continuityTitle)}</b><em>${escapeHtml(filing.continuityObjective)}</em></div>` +
        `<div class="${ready ? 'is-ready' : 'is-blocked'}"><span>READINESS</span><b>${ready ? 'READY TO REVIEW' : 'BLOCKED'}</b><em>${escapeHtml(readiness)}</em></div>` +
      `</div>` +
      `<div class="sx-dossier__foot">` +
        `<button type="button" class="sx-btn-primary sx-ct-commit${focus}" data-accept="${escapeHtml(String(mid(mission)))}"${ready ? '' : ' disabled'} aria-label="Review final disposition Choice ${escapeHtml(filing.choiceId)}; opens a separate irreversible confirmation">` +
          `<span>${ready ? 'Review Final Disposition' : 'Resolve Readiness'}</span>` +
          // The readiness module above already carries this sentence — the verb
          // must not repeat it at its right end. Kept only when blocked, where
          // it is the disabled button's reason.
          (ready ? '' : `<em>${escapeHtml(readiness)}</em>`) +
        `</button>` +
      `</div>` +
    `</div>`
  );
}

function briefCell(ic, k, v, sub) {
  return `<div class="sx-brief"><span class="sx-brief__ic">${icon(ic, 16)}</span><span class="sx-brief__k">${k}</span><span class="sx-brief__v">${v}</span>${sub ? `<span class="sx-brief__sub">${sub}</span>` : ''}</div>`;
}

/**
 * The briefing dossier for an ordinary contract — the markup the player reads before accepting.
 * Pure so the readiness it prints can be tested against the sim without a browser; `renderDossier`
 * is its only production caller. Final-disposition filings take `finalDispositionDossierHtml`
 * instead: the sim stages those through `ui:endgameChoose` and its separate irreversible
 * confirmation, deliberately ahead of mission accept preflight.
 */
export function missionDossierHtml(m, state, options = {}) {
  const tint = options.tint || facTint(m);
  const origin = options.origin || 'This station';
  const focusAccept = !!options.focusAccept;
  const r = risk(m);
  const cargo = cargoRequirement(m);
  const cargoName = cargo ? ((CMDTY.get(cargo.commodityId) || {}).name || cargo.commodityId) : null;
  const jumps = m.jumps != null ? m.jumps : (m.routeJumps != null ? m.routeJumps : 0);
  const clauses = Array.isArray(m.clauses) ? m.clauses : [];
  const readiness = missionDossierReadiness(m, state);
  const ready = readiness.canAccept;
  const consequences = missionConsequenceSummary(m);
  const upfrontCr = missionUpfrontCost(m);
  const facShort = escapeHtml((FAC.get(m.factionId) || {}).short || 'faction');
  const authoredSummary = missionDossierSummary(m);
  const title = m.title || typeLabel(m.type);
  const routeScope = missionRouteScope(m, state);
  const routeText = routeScope && routeScope.text
    ? routeScope.text
    : (jumps > 0 ? `${jumps} jump${jumps > 1 ? 's' : ''}` : 'Route pending');
  // Restores the guidance the retired hub gave assistive tech: the verb must say what pressing it
  // does AND why it cannot be pressed, without depending on the visual readiness module.
  const acceptAria = ready
    ? `Accept ${title} and bind its route. ${readiness.detail}.`
    : `Cannot accept ${title}. ${readiness.detail}.`;

  return (
    `<div class="sx-dossier${focusAccept ? ' is-attention' : ''}">` +
      `<header class="sx-dossier__head">` +
        `<span class="sx-dossier__crest" style="--tint:${tint}">${icon(TYPE_ICON[m.type] || 'contracts', 26)}</span>` +
        `<div class="sx-dossier__id">` +
          `<span class="sx-dossier__client">${clientEntityHtml(m)} · ${escapeHtml(typeLabel(m.type))}</span>` +
          `<h2>${entitySpanHtml('contract:' + String(mid(m)), escapeHtml(title))}</h2>` +
        `</div>` +
      `</header>` +
      (authoredSummary
        ? `<p class="sx-dossier__summary">${escapeHtml(authoredSummary)}</p>`
        : '') +

      `<div class="sx-dossier__topline">` +
        `<div class="sx-dossier__reward"><span>Reward</span><b>${reward(m).toLocaleString('en-US')}<i>cr</i></b></div>` +
        `<div class="sx-dossier__risk"><span>Risk assessment</span><div class="sx-dossier__riskrow">${riskPips(r, 'lg')}<em style="color:${riskColor(r)}">${RISK_LABEL[Math.min(r, 5)]}</em></div></div>` +
      `</div>` +

      `<div class="sx-dossier__route" aria-label="Mission operation route">` +
        `<div class="sx-route">` +
          `<span class="sx-route__node"><i></i>${originEntityHtml(state, origin)}</span>` +
          `<span class="sx-route__line"><span class="sx-route__jumps">${escapeHtml(routeText)}</span></span>` +
          `<span class="sx-route__stage"><i></i><b>PREP</b><em>${cargoName ? `${num(cargo.qty)}u payload` : 'fit + fuel'}</em></span>` +
          `<span class="sx-route__line sx-route__line--short"></span>` +
          `<span class="sx-route__node sx-route__node--dest"><i></i>${destEntityHtml(m)}</span>` +
        `</div>` +
      `</div>` +

      `<div class="sx-dossier__grid">` +
        (cargoName ? briefCell('cargo', 'Payload', cargoEntityHtml(cargo, cargoName), (cargo.qty ? cargo.qty + ' u' : '')) : '') +
        briefCell('clock', 'Time', m.timeLabel || (m.timeLimitMin ? m.timeLimitMin + ' min' : 'Flexible'), '') +
        (consequences.collateral ? briefCell('info', 'Collateral', consequences.collateral.toLocaleString('en-US') + ' cr', 'on failure') : '') +
        (upfrontCr ? briefCell('credits', 'Upfront', upfrontCr.toLocaleString('en-US') + ' cr', 'to accept') : '') +
        (missionOffersFollowUp(m) ? briefCell('spark', 'Follow-up', 'Posted on success', 'same contract family') : '') +
        // One gate line, in the slot the standing gate already occupied. A blocker names what stops
        // the accept; a warning names what to check and leaves the accept available.
        (readiness.blocker || readiness.warning
          ? `<p class="sx-dossier__gate">${icon(readiness.standingShort ? 'factions' : 'info', 14)}<span>${escapeHtml(readiness.blocker || readiness.warning)}</span></p>`
          : '') +
        (clauses.length ? `<div class="sx-dossier__clauses">${clauses.map((c) => `<span class="sx-tag"${clauseWhyAttr(c)}>${escapeHtml(c.label || c.id || 'clause')}</span>`).join('')}</div>` : '') +
      `</div>` +

      `<div class="sx-contract-sim" aria-label="Previewed mission consequences">` +
        `<span class="sx-contract-sim__label">OUTCOME</span>` +
        `<div><span>SUCCESS</span><b>+${reward(m).toLocaleString('en-US')} cr</b><em>${consequences.repReward > 0 ? `+${consequences.repReward} ${facShort} rep` : 'no standing change'}</em></div>` +
        `<div><span>FAILURE</span><b>${consequences.collateral ? `−${consequences.collateral.toLocaleString('en-US')} cr collateral` : 'No collateral loss'}</b><em>${consequences.repPenalty < 0 ? `${consequences.repPenalty} ${facShort} rep` : 'no standing change'}</em></div>` +
        `<div class="${ready ? (readiness.warning ? 'is-check' : 'is-ready') : 'is-blocked'}"><span>READINESS</span><b>${readiness.label}</b><em>${escapeHtml(readiness.detail)}</em></div>` +
      `</div>` +
      `<div class="sx-dossier__foot">` +
        `<button type="button" class="sx-btn-primary sx-ct-commit${focusAccept && ready ? ' is-attention' : ''}" data-accept="${escapeHtml(String(mid(m)))}"${ready ? '' : ' disabled'} aria-label="${escapeHtml(acceptAria)}">` +
          `<span>${ready ? (focusAccept ? 'Accept Mission + Bind Route' : 'Accept + Bind Route') : 'Resolve Readiness'}</span>` +
          // The OUTCOME readiness module directly above already carries this
          // sentence ("Ship and account ready"); the verb drops the duplicate
          // and keeps an <em> only as the reason while blocked.
          (ready ? '' : `<em>${escapeHtml(readiness.detail)}</em>`) +
        `</button>` +
      `</div>` +
    `</div>`
  );
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const STYLE_ID = 'sf-contracts-style';

function injectStyle() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  if (typeof document.getElementById === 'function' && document.getElementById(STYLE_ID)) return;
  if (!document.head || typeof document.head.appendChild !== 'function') return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

// Stated at three-class specificity so these rules win regardless of stylesheet
// load order (the station sheets restyle these same selectors at two classes).
const CSS = `
/* The mission ticker used fixed 268px cards: the sixth card ended flush against
   the frame edge, reading as a hard cut. Flexible cards share the lane instead —
   every card fits the board, longer copy ellipsizes cleanly inside its card. */
.sx-app .sx-ct .sx-ct-row {
  flex: 1 1 236px; width: auto; min-width: 200px; max-width: 340px;
}
.sx-app .sx-ct .sx-ct-row .sx-ct-row__title {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  white-space: normal; overflow-wrap: anywhere;
}
/* OPEN DEFECT (2026-08-30 polish pipeline): the Active Missions attention card still
   renders clipped inside this band — the card is cut by the .sx-ct grid row budget, not
   by this strip's own overflow, so band-level sizing cannot reach it. Needs the missions
   grid row revisited (give the band a content-sized row or move the attention card into
   the dossier). Documented in review/VISUAL_BUG_SWEEP_2026-08-30.md as open. */
/* The dossier grid gave the route row minmax(150px,1fr) — on a tall host it
   stretched into a near-black void between the header and the outcome row — and
   never gave the authored summary a cell, so it auto-placed BELOW the accept
   button. Every block now has an explicit placement: the summary reads under the
   title, the route keeps only its own height, and the brief/simulator sit side
   by side so the whole brief fits its area (the accept verb stays above the
   fold). It reads top-down from the offer rail: the earlier "centre vertically when the host is
   taller" put a 150px void between the rail and the mission title on every 1080p frame, with an
   equal void under the commit verb, and the screen read as unfinished. */
.sx-app .sx-ct .sx-ct__dossier { justify-content: flex-start; overflow-y: auto; }
.sx-app .sx-ct .sx-dossier {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: auto auto auto auto auto;
  gap: 8px 10px;
  height: auto; min-height: 0; flex-shrink: 0;
  padding: 14px 18px 10px;
}
.sx-app .sx-ct .sx-dossier__head { grid-column: 1; grid-row: 1; }
.sx-app .sx-ct .sx-dossier__topline { grid-column: 2; grid-row: 1; }
.sx-app .sx-ct .sx-dossier__summary { grid-column: 1 / -1; grid-row: 2; }
.sx-app .sx-ct .sx-dossier__route { grid-column: 1 / -1; grid-row: 3; min-height: 0; padding: 8px 16px; }
.sx-app .sx-ct .sx-dossier__grid { grid-column: 1; grid-row: 4; }
.sx-app .sx-ct .sx-contract-sim { grid-column: 2; grid-row: 4; min-height: 0; max-height: none; }
.sx-app .sx-ct .sx-dossier__foot { grid-column: 1 / -1; grid-row: 5; }
/* ONE interaction accent, flat. The commit verb wore an amber left-to-right
   gradient (plus a glow) — gradient fills and glows are out of bounds, and amber
   is reserved for pressable chrome elsewhere on the fascia. */
.sx-app .sx-ct .sx-ct-commit {
  background: var(--accent, #4f8fdd); color: #fff; box-shadow: none;
}
/* Readiness has three honest states, not two: a CHECK offer is acceptable — the sim takes it —
   so it must not borrow the blocked row's loss colour. */
.sx-app .sx-ct .sx-contract-sim > div.is-check b { color: var(--warn); }
.sx-app .sx-ct .sx-ct-commit:disabled {
  background: var(--sxb-panel-hi, #232a2f); color: var(--sxb-ink-3, #78838a);
  border: 1px solid var(--sxb-line-2, rgba(255,255,255,.14));
  box-shadow: none; cursor: not-allowed;
}
@media (prefers-reduced-motion: reduce) {
  .sx-ct, .sx-ct * { animation: none !important; transition: none !important; }
}
`;

export function createContractsScreen(ctx) {
  injectStyle();
  const el = document.createElement('div');
  el.className = 'sx-ct';
  el.innerHTML =
    `<nav class="sx-ct__board" aria-label="Available missions"></nav>` +
    `<section class="sx-ct__dossier" aria-live="polite"></section>` +
    `<aside class="sx-ct__active" aria-label="Active missions"></aside>`;
  const boardEl = el.querySelector('.sx-ct__board');
  const dossierEl = el.querySelector('.sx-ct__dossier');
  const activeEl = el.querySelector('.sx-ct__active');

  let selectedId = null;
  /** @type {null|{ focusMissionId?: string, kind?: string, reason?: string, title?: string, surface?: string }} */
  let attention = null;
  boardEl.setAttribute('role', 'tablist');

  function offers(state) {
    const sid = state && state.ui && state.ui.dockedStationId;
    const boards = state && state.missions && state.missions.boards;
    const board = boards && sid && boards[sid];
    return (board && Array.isArray(board.slots) ? board.slots : []).filter(Boolean);
  }
  function activeJobs(state) {
    const a = state && state.missions && state.missions.active;
    return (Array.isArray(a) ? a : []).filter((m) => m && (m.status == null || m.status === 'active'));
  }

  function focusId() {
    return attention && attention.focusMissionId != null
      ? String(attention.focusMissionId)
      : (selectedId != null ? String(selectedId) : null);
  }

  function renderBoard(state) {
    const list = sortBoardOffers(offers(state), state, focusId());
    const stationId = state && state.ui && state.ui.dockedStationId;
    if (list.length && (!selectedId || !list.some((offer) => String(mid(offer)) === selectedId))) {
      selectedId = String(mid(list[0]));
    }
    if (!list.length) {
      mountDataState(boardEl, 'empty', {
        code: 'BOARD_EMPTY',
        headline: 'No missions posted at this berth.',
        fills: 'Boards fill when a station has cargo it cannot move itself. A mission desk or a black-market contact at another berth will have work.',
        verb: {
          label: 'Open the Chart',
          onActivate: () => openGalaxyMap(ctx, { focus: MAP_FOCUS.SYSTEM, source: 'contracts-empty' }),
        },
      });
      return;
    }
    const recommended = boardRecommendedOfferId(list, state);
    boardEl.innerHTML =
      `<span class="sx-ct-dispatch__label">${escapeHtml(missionBoardDispatchLabel(state, stationId, list.length))}</span>` +
      list.map((m, index) => {
      const id = String(mid(m));
      const active = id === selectedId ? ' is-active' : '';
      const needs = attention && String(attention.focusMissionId) === id && attention.surface === 'board'
        ? ' is-attention' : '';
      const r = risk(m);
      const filing = finalDispositionPresentation(m);
      const firstHour = firstHourBoardOfferPresentation(state, m);
      // Authored first-hour provenance keeps the badge slot when it owns this offer; otherwise the
      // shared board policy may name one best-next pick. Never both, never a reorder.
      const badge = firstHour ? firstHour.label
        : (recommended.label && recommended.missionId === id ? recommended.label : '');
      const badgePrefix = badge ? `${badge} · ` : '';
      const rowAria = filing
        ? `${m.title || `Choice ${filing.choiceId}`}, final disposition from ${filing.issuerName}, separate irreversible confirmation required`
        : `${badgePrefix}${m.title || typeLabel(m.type)}, ${reward(m).toLocaleString('en-US')} credits, ${RISK_LABEL[Math.min(r, 5)]} risk${missionOffersFollowUp(m) ? ', follow-up available on success' : ''}`;
      return (
        `<button type="button" class="sx-ct-row${active}${needs}" data-mid="${escapeHtml(id)}" role="tab" aria-selected="${id === selectedId}"` +
          ` style="--signal:${facTint(m)}"` +
          ` aria-label="${escapeHtml(rowAria)}${needs ? ', needs attention' : ''}">` +
          `<span class="sx-ct-row__seq" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>` +
          `<span class="sx-ct-row__ic" style="--tint:${facTint(m)}">${icon(filing ? 'contracts' : (TYPE_ICON[m.type] || 'contracts'), 18)}</span>` +
          `<span class="sx-ct-row__mid">` +
            `<span class="sx-ct-row__title">${escapeHtml(m.title || typeLabel(m.type))}</span>` +
            `<span class="sx-ct-row__meta">${filing
              ? `${escapeHtml(filing.issuerName)} · FINAL DISPOSITION · ${escapeHtml(filing.destinationName)}`
              : `${badge ? `<b>${escapeHtml(badge)}</b> · ` : ''}${escapeHtml(facName(m))} · ${escapeHtml(destName(m))}${missionOffersFollowUp(m) ? ' · FOLLOW-UP' : ''}`}</span>` +
          `</span>` +
          `<span class="sx-ct-row__route" aria-hidden="true"><i></i><b></b><i></i></span>` +
          `<span class="sx-ct-row__risk">${filing ? 'FINAL' : riskPips(r, 'xs')}</span>` +
          `<span class="sx-ct-row__rew">${filing ? `REVIEW<i> choice ${escapeHtml(filing.choiceId)}</i>` : `${reward(m).toLocaleString('en-US')}<i> cr</i>`}</span>` +
          (needs ? `<span class="sx-ct-row__flag">ACT</span>` : '') +
        `</button>`
      );
    }).join('');
  }

  function renderDossier(state) {
    const list = sortBoardOffers(offers(state), state, focusId());
    const m = list.find((x) => String(mid(x)) === selectedId) || list[0];
    if (!m) {
      mountDataState(dossierEl, 'empty', {
        code: 'BRIEF_UNSELECTED',
        headline: 'No mission selected.',
        fills: 'Pick a job from the board to open its briefing. The dossier is the full brief; the list stays scannable.',
        verb: {
          label: 'Open the Chart',
          onActivate: () => openGalaxyMap(ctx, { focus: MAP_FOCUS.SYSTEM, source: 'contracts-brief' }),
        },
      });
      return;
    }
    const focusAccept = attention && attention.kind === 'accept'
      && String(attention.focusMissionId) === String(mid(m));
    const filing = finalDispositionPresentation(m);
    if (filing) {
      dossierEl.innerHTML = finalDispositionDossierHtml(m, filing, {
        tint: facTint(m),
        origin: (ctx.station && ctx.station.name) || 'Ash Cache',
        focusAccept,
        blockedReason: m.requirementUnmet || m.lockedReason || null,
      });
      return;
    }
    dossierEl.innerHTML = missionDossierHtml(m, state, {
      tint: facTint(m),
      origin: (ctx.station && ctx.station.name) || 'This station',
      focusAccept,
    });
  }

  function renderActive(state) {
    const jobs = sortFocusFirst(activeJobs(state), focusId());
    const trackedId = state && state.ui && state.ui.trackedMissionId;
    const sid = state && state.ui && state.ui.dockedStationId;
    activeEl.innerHTML =
      `<div class="sx-panel__head">${icon('spark', 15)}<span>Active Missions</span><em class="sx-ct__count">${jobs.length}</em></div>` +
      (jobs.length
        ? jobs.map((m) => {
            const id = String(mid(m));
            const tracked = trackedId != null && String(trackedId) === id;
            const needs = attention && String(attention.focusMissionId) === id
              && (attention.surface === 'active' || attention.kind === 'turn_in' || attention.kind === 'pickup');
            const atDest = sid && m.destStationId === sid;
            const status = needs && attention.kind === 'turn_in'
              ? 'Ready at this berth'
              : (needs && attention.kind === 'pickup'
                ? 'Starts here'
                : (atDest ? 'Destination berth' : destName(m)));
            const actionFlag = attention && attention.kind === 'turn_in' ? 'TURN IN'
              : attention && attention.kind === 'pickup' ? 'PICK UP'
                : 'ACTIVE';
            return (
              `<div class="sx-job${tracked ? ' is-tracked' : ''}${needs ? ' is-attention' : ''}" data-active-mid="${escapeHtml(id)}">` +
                `<span class="sx-job__ic">${icon(TYPE_ICON[m.type] || 'contracts', 16)}</span>` +
                `<span class="sx-job__body"><span class="sx-job__title">${escapeHtml(m.title || typeLabel(m.type))}</span>` +
                  `<span class="sx-job__meta">${reward(m).toLocaleString('en-US')} cr · ${escapeHtml(status)}</span></span>` +
                (needs ? `<span class="sx-job__flag">${actionFlag}</span>` : '') +
                `<button type="button" class="sx-job__track" data-track="${escapeHtml(id)}" aria-pressed="${tracked}">` +
                  `<span aria-hidden="true">${tracked ? '◆' : '◇'}</span><b>${tracked ? 'Tracked' : 'Track'}</b>` +
                `</button>` +
              `</div>`
            );
          }).join('')
        : `<p class="sx-muted" style="padding:10px 4px">No active missions. Accept a job from the board to begin.</p>`);
  }

  function renderAll(state) {
    renderBoard(state);
    renderDossier(state);
    renderActive(state);
  }

  function applyShowOptions(options = {}) {
    if (options.attention) attention = options.attention;
    else if (options.missionId != null) {
      attention = {
        focusMissionId: String(options.missionId),
        kind: options.focusSurface === 'board' ? 'accept' : 'active',
        reason: options.reason || 'Focused mission',
        title: options.title || 'Mission',
        surface: options.focusSurface || 'board',
      };
    }
    if (options.missionId != null) selectedId = String(options.missionId);
    else if (attention && attention.focusMissionId != null) selectedId = String(attention.focusMissionId);
  }

  boardEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-mid]');
    if (!btn) return;
    selectedId = btn.getAttribute('data-mid');
    const state = ctx.state || {};
    renderBoard(state); renderDossier(state);
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  });

  el.addEventListener('click', (ev) => {
    const acc = ev.target.closest('[data-accept]');
    if (acc && !acc.disabled) {
      acc.disabled = true;
      if (ctx.bus) { ctx.bus.emit('ui:acceptMission', { missionId: acc.getAttribute('data-accept') }); ctx.bus.emit('audio:cue', { id: 'ui_accept' }); }
      setTimeout(() => renderAll(ctx.state || {}), 60);
      return;
    }
    const trk = ev.target.closest('[data-track]');
    if (trk) {
      const id = trk.getAttribute('data-track');
      if (ctx.bus) { ctx.bus.emit('ui:trackMission', { missionId: id }); ctx.bus.emit('audio:cue', { id: 'ui_accept' }); }
      setTimeout(() => renderAll(ctx.state || {}), 60);
    }
  });

  const onMissionChanged = () => renderAll(ctx.state || {});
  if (ctx.bus && ctx.bus.on) ctx.bus.on('mission:updated', onMissionChanged);

  return {
    el,
    onShow(c) {
      const next = c || ctx;
      applyShowOptions(next || {});
      renderAll(next.state || {});
    },
    refresh(c) {
      const next = c || ctx;
      if (next && (next.attention || next.missionId != null)) applyShowOptions(next);
      renderAll((next && next.state) || ctx.state || {});
    },
    dispose() {
      if (ctx.bus && ctx.bus.off) ctx.bus.off('mission:updated', onMissionChanged);
    },
  };
}
