import { contractDossierView, termRow, commitWordHtml } from '../../views/contractPresentation.js';
import { contractsFrameHtml } from '../../views/stationFrames.js';
// src/ui/station/screens/contracts.js — station Missions board (internal id remains contracts).
// A kit panel (Frontend Task C §1.5): the posted jobs and the player's own missions as rows down
// the hang column, the open job's dossier on the stage — its title, client, payout at hero size,
// the route and the risk each as one sentence, the terms as static rows, Accept as a word. Emits
// ui:acceptMission / ui:trackMission {missionId}; the trade of words for plates changes nothing
// about what the board does (the readiness authority is missionPreflight, the map opens through
// mapAuthority, final-disposition filings still go through their separate confirmation).
//
// When the station shell passes attention / missionId (from missionDockAttention), that job is
// sorted first and selected so turn-in / accept is not a scavenger hunt.
// `.sx-ct`, `.sx-ct__board`, `.sx-ct__dossier`, `.sx-ct__active`, `.sx-ct-row[data-mid]`,
// `.sx-job[data-active-mid]`, `.sx-job__track[data-track]`, `.sx-ct-commit[data-accept]`,
// `.sx-dossier__summary` and `.sx-tag[data-why]` are inert hooks the checks and probes query.
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
import { factionIcon, icon } from '../icons.js';
import { missionBoardReadiness } from '../stationHubModel.js';
import { recommendMissionBoardOffer } from '../stationMissionModel.js';

const CMDTY = new Map(COMMODITIES.map((c) => [c.id, c]));
const FAC = new Map(FACTION_META.map((f) => [f.id, f]));
const MISSION_DEF = new Map(MISSION_TYPES.map((def) => [def.type, def]));
const STATION_DEF = new Map(SECTORS.flatMap((sector) => (
  (sector.stations || []).map((station) => [station.id, station])
)));

const RISK_LABEL = ['Routine', 'Low', 'Elevated', 'High', 'Severe', 'Severe'];
const FIRST_TRADE_SOURCE = 'firstTradeContract';
const ONBOARDING_CHOICE_SOURCE = 'onboardingChoice';

const mid = (m) => (m && (m.id != null ? m.id : m.missionId));
const num = (v) => Math.max(0, Math.round(Number(v) || 0));
const cr = (v) => `${num(v).toLocaleString('en-US')} cr`;

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

/** The client's crest at row size (the kit's `.k-crest--row`; a generic mark when unknown). */
function crestHtml(factionId) {
  const svg = factionIcon(factionId, 24) || icon('contracts', 24);
  return svg.replace(/class="sx-ico[^"]*"/, 'class="k-crest k-crest--row sx-ico"');
}

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

/** One static row of the dossier's terms: label · value (· a fine note). */
function finalDispositionDossierHtml(mission, filing, options = {}) {
  const origin = options.origin || 'Ash Cache';
  const blocked = cleanText(options.blockedReason);
  const ready = !blocked;
  const focus = !!(options.focusAccept && ready);
  const title = cleanText(mission && mission.title) || `FINAL DISPOSITION — CHOICE ${filing.choiceId}`;
  const summary = missionDossierSummary(mission) || filing.confirmHint;
  const readiness = ready ? 'Eligibility verified · separate confirmation required' : blocked;
  return (
    `<div class="sx-dossier sx-dossier--filing${focus ? ' is-attention' : ''}">` +
      `<p class="k-caps">Final disposition</p>` +
      `<h2 class="k-display k-t-title sx-dossier__title">${escapeHtml(title)}</h2>` +
      `<p class="k-sentence k-sentence--emph">${escapeHtml(filing.issuerName)} · filing</p>` +
      `<div class="k-hero k-hero--hero k-hero--signal"><span class="k-hero__n">Choice ${escapeHtml(filing.choiceId)}</span><span class="k-hero__w">irreversible after confirmation</span></div>` +
      `<p class="k-sentence sx-dossier__summary">${escapeHtml(summary)}</p>` +
      `<p class="k-sentence" aria-label="Final disposition filing path">${escapeHtml(origin)} → review → confirm. Nothing files on selection; the confirmation is a separate prompt.</p>` +
      `<p class="k-sentence">${escapeHtml(filing.resolution)} The same world remains playable.</p>` +
      `<ul class="k-rows sx-dossier__terms">` +
        termRow('Issuer', escapeHtml(filing.issuerName)) +
        termRow('Confirmation', 'Separate prompt', 'nothing files on selection') +
        termRow('Continuity', escapeHtml(filing.continuityTitle), escapeHtml(filing.continuityObjective)) +
        termRow('Readiness', ready ? 'Ready to review' : 'Blocked', escapeHtml(readiness)) +
      `</ul>` +
      (ready ? '' : `<p class="k-sentence k-bad sx-dossier__gate">${escapeHtml(blocked)}</p>`) +
      commitWordHtml({
        id: mid(mission), ready, focus,
        readyLabel: 'Review Final Disposition', blockedLabel: 'Resolve Readiness',
        aria: `Review final disposition Choice ${filing.choiceId}; opens a separate irreversible confirmation`,
        reason: readiness,
      }) +
    `</div>`
  );
}

/** The risk in one sentence: the tier, then what success and failure do to the account. */
function riskSentence(m, consequences, facShort) {
  const r = Math.min(risk(m), 5);
  const gain = `+${cr(reward(m))}${consequences.repReward > 0 ? ` and +${consequences.repReward} ${facShort} standing` : ''}`;
  const loss = consequences.collateral
    ? `costs ${cr(consequences.collateral)} collateral${consequences.repPenalty < 0 ? ` and ${consequences.repPenalty} ${facShort} standing` : ''}`
    : (consequences.repPenalty < 0 ? `costs ${consequences.repPenalty} ${facShort} standing` : 'costs nothing');
  return `${RISK_LABEL[r]} risk. Success pays ${gain}; failure ${loss}.`;
}

/**
 * The briefing dossier for an ordinary contract — the markup the player reads before accepting.
 * Pure so the readiness it prints can be tested against the sim without a browser; `renderDossier`
 * is its only production caller. Final-disposition filings take `finalDispositionDossierHtml`
 * instead: the sim stages those through `ui:endgameChoose` and its separate irreversible
 * confirmation, deliberately ahead of mission accept preflight.
 */
export function missionDossierHtml(m, state, options = {}) {
  const origin = options.origin || 'This station';
  const focusAccept = !!options.focusAccept;
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

  return contractDossierView({
    typeName: typeLabel(m.type),
    titleHtml: entitySpanHtml('contract:' + String(mid(m)), escapeHtml(title)),
    clientHtml: clientEntityHtml(m),
    reward: reward(m).toLocaleString('en-US'),
    summary: authoredSummary,
    routeHtml: `${originEntityHtml(state, origin)} → ${destEntityHtml(m)} · ${escapeHtml(routeText)}`,
    riskHtml: riskSentence(m, consequences, facShort),
    termsHtml: (cargoName ? termRow('Payload', cargoEntityHtml(cargo, cargoName), cargo.qty ? `${num(cargo.qty)} u` : '') : '')
      + termRow('Time', escapeHtml(m.timeLabel || (m.timeLimitMin ? m.timeLimitMin + ' min' : 'Flexible')))
      + (consequences.collateral ? termRow('Collateral', cr(consequences.collateral), 'on failure') : '')
      + (upfrontCr ? termRow('Upfront', cr(upfrontCr), 'to accept') : '')
      + (missionOffersFollowUp(m) ? termRow('Follow-up', 'Posted on success', 'same contract family') : '')
      + termRow('Readiness', escapeHtml(readiness.label), escapeHtml(readiness.detail)),
    readiness,
    clausesHtml: clauses.map((c) => `<li class="k-t-fine k-62"><span class="sx-tag"${clauseWhyAttr(c)}>${escapeHtml(c.label || c.id || 'clause')}</span></li>`).join(''),
    focusAccept,
    action: { id: mid(m), ready, focus: focusAccept && ready,
      readyLabel: 'Accept', blockedLabel: 'Resolve Readiness', aria: acceptAria, reason: readiness.detail },
  });
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function createContractsScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'k-panel sx-ct';
  el.innerHTML = contractsFrameHtml();
  const dispatchEl = el.querySelector('.sx-ct-dispatch__label');
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
    const dispatch = missionBoardDispatchLabel(state, stationId, list.length);
    if (dispatchEl.textContent !== dispatch) dispatchEl.textContent = dispatch;
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
      `<ul class="k-rows sx-ct__rows">` +
      list.map((m) => {
        const id = String(mid(m));
        const selected = id === selectedId;
        const rowClasses = ` k-row${selected ? ' is-active' : ''}`;
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
          `<li><button type="button" class="sx-ct-row${rowClasses}${needs}" data-mid="${escapeHtml(id)}" role="tab" aria-selected="${selected}" tabindex="${selected ? 0 : -1}"` +
            ` aria-label="${escapeHtml(rowAria)}${needs ? ', needs attention' : ''}">` +
            `<span class="sx-ct-row__crest" aria-hidden="true">${crestHtml(m.factionId)}</span>` +
            `<span class="k-row__name sx-ct-row__title">` +
              (badge ? `<span class="k-t-fine k-signal sx-ct-row__badge">${escapeHtml(badge)}</span> ` : '') +
              `${escapeHtml(m.title || typeLabel(m.type))}` +
            `</span>` +
            `<span class="k-row__num sx-ct-row__rew">${filing ? 'Review' : reward(m).toLocaleString('en-US')}</span>` +
          `</button></li>`
        );
      }).join('') +
      `</ul>`;
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
        origin: (ctx.station && ctx.station.name) || 'Ash Cache',
        focusAccept,
        blockedReason: m.requirementUnmet || m.lockedReason || null,
      });
      return;
    }
    dossierEl.innerHTML = missionDossierHtml(m, state, {
      origin: (ctx.station && ctx.station.name) || 'This station',
      focusAccept,
    });
  }

  function renderActive(state) {
    const jobs = sortFocusFirst(activeJobs(state), focusId());
    const trackedId = state && state.ui && state.ui.trackedMissionId;
    const sid = state && state.ui && state.ui.dockedStationId;
    activeEl.innerHTML = jobs.length
      ? `<ul class="k-rows sx-ct__jobs">` + jobs.map((m) => {
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
          return (
            `<li class="k-row k-row--static sx-job${tracked ? ' is-tracked' : ''}${needs ? ' is-attention' : ''}" data-active-mid="${escapeHtml(id)}">` +
              `<span class="k-row__name sx-job__title">${escapeHtml(m.title || typeLabel(m.type))}</span>` +
              `<span class="k-row__sub sx-job__meta${needs ? ' k-signal' : ''}">${escapeHtml(status)}</span>` +
              `<button type="button" class="k-word k-word--fine sx-job__track" data-track="${escapeHtml(id)}" aria-pressed="${tracked}">${tracked ? 'Tracked' : 'Track'}</button>` +
            `</li>`
          );
        }).join('') + `</ul>`
      : `<p class="k-sentence sx-ct__none">No active missions. Accept a job from the board to begin.</p>`;
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

  function select(id, focus) {
    if (id == null) return;
    selectedId = String(id);
    const state = ctx.state || {};
    renderBoard(state); renderDossier(state);
    if (focus) {
      const row = boardEl.querySelector(`[data-mid="${selectedId}"]`);
      if (row && typeof row.focus === 'function') row.focus();
    }
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  }

  boardEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-mid]');
    if (!btn) return;
    select(btn.getAttribute('data-mid'), false);
  });

  // Arrow keys walk the posted jobs (a tablist: roving tabindex, selection follows focus).
  boardEl.addEventListener('keydown', (ev) => {
    const rows = [...boardEl.querySelectorAll('[data-mid]')];
    const cur = rows.indexOf(ev.target.closest('[data-mid]'));
    if (cur < 0 || !rows.length) return;
    let next = -1;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') next = (cur + 1) % rows.length;
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') next = (cur - 1 + rows.length) % rows.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = rows.length - 1;
    else return;
    ev.preventDefault();
    select(rows[next].getAttribute('data-mid'), true);
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
