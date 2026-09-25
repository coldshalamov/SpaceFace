import { briefingDiagramHtml, contractDossierView, termRow, commitWordHtml } from '../../views/contractPresentation.js';
import { contractsFrameHtml } from '../../views/stationFrames.js';
// src/ui/station/screens/contracts.js — station Missions board (internal id remains contracts).
// A kit panel (Frontend Task C §1.5): the posted jobs and the player's own missions as rows down
// the hang column, the open job's dossier on the stage — its title, client, payout at hero size,
// the route and the risk each as one sentence, the terms as static rows, Accept as a word. Emits
// ui:acceptMission / ui:trackMission {missionId}; Field Hardware chrome (kit plates, keys, quiet
// type) is pinned from this module. Accept stays the same verb.
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
  missionBriefingDiagram,
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
import { chooseAdventureDecision, presentSurfaceDecisions } from '../../adventureDecisions.js';
import { objectiveText } from '../../screens/missionLog.js';
import {
  dressState,
  ensureInteriorStyle,
  paintCap,
  paintHero,
  paintKey,
  paintLegend,
  paintMarking,
  paintPlate,
  paintRow,
  pinKeyrack,
  syncKeys,
} from './fhChrome.js';
import { bindStationMarkup, stationControlAttrs } from '../stationBindingMap.js';
import { createRouteOrrery, sectorOfStation } from '../../orrery/routeOrrery.js';
import { createCounter, decrypt } from '../../orrery/text.js';
import { reducedMotion, stagger } from '../../orrery/motion.js';
import { attachHoldVerb } from '../../kit/holdVerb.js';
import { syncScrollExtent } from '../../orrery/scrollExtent.js';
import { dressLampKey } from '../../orrery/lampKey.js';

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

const SECTOR_NAME = new Map(SECTORS.map((sector) => [sector.id, sector.name]));

// A live mission carries destStationId / destSectorId, not a name: resolve the berth, then the
// sector, before any fallback. (The row used to print the raw sector id, or "Destination".)
function destName(m) {
  const params = (m && m.params) || {};
  const named = m.destinationName || m.destName || m.destStationName
    || params.destinationName || params.destName || params.destStationName;
  if (named) return named;
  const stationRec = STATION_DEF.get(m.destStationId || params.destStationId);
  if (stationRec && stationRec.name) return stationRec.name;
  if (m.local) return 'Local sector';
  const sectorId = m.destSectorId || params.destSectorId;
  return (sectorId && SECTOR_NAME.get(sectorId)) || 'Destination';
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
    label: readiness.state === 'ready' ? 'Route clear' : (readiness.state === 'caution' ? 'Check' : 'Blocked'),
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
  return bindStationMarkup(
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

/**
 * The consequences as scales of light (ORRERY §3.2: a quantity is an arc or a scale): RISK as a
 * five-tick ruler with a light cursor at the tier, STANDING as a centred scale with the gain
 * marked to the right and the loss (red: a loss is the threat) to the left of zero.
 */
export function consequenceScalesSvg(m, { compact = false } = {}) {
  // compact: a short screen draws the scales at 1:1 in a 400x60 box (no endpoint captions), so the labels never shrink
  const w = compact ? 400 : 520; const h = compact ? 60 : 84;
  const f = (n) => Math.round(n * 100) / 100;
  const r = Math.min(risk(m), 5);
  const consequences = missionConsequenceSummary(m);
  const gain = Math.max(0, Number(consequences.repReward) || 0);
  const loss = Math.max(0, -(Number(consequences.repPenalty) || 0));
  let out = `<svg class="orr-svg" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">`;
  // risk: five stops
  const rx0 = compact ? 84 : 96; const rx1 = compact ? 300 : 336; const ry = compact ? 14 : 20;
  out += `<text class="orr-ct-scale__key" x="0" y="${ry + 4}">RISK</text>`;
  out += `<path class="orr-core orr-ct-scale__rule" d="M ${rx0} ${ry} L ${rx1} ${ry}" stroke-width="1"/>`;
  let ticks = '';
  for (let i = 0; i <= 5; i += 1) { const x = rx0 + ((rx1 - rx0) * i) / 5; ticks += `M ${f(x)} ${ry - 4} L ${f(x)} ${ry + 5} `; }
  out += `<path class="orr-core orr-ct-scale__tick" d="${ticks}" stroke-width="1"/>`;
  const rxc = rx0 + ((rx1 - rx0) * r) / 5;
  out += `<path class="orr-bloom orr-ct-scale__cursor${r >= 3 ? ' is-high' : ''}" d="M ${f(rxc)} ${ry - 9} L ${f(rxc)} ${ry + 10}" stroke-width="6"/>`;
  out += `<path class="orr-core orr-ct-scale__cursor${r >= 3 ? ' is-high' : ''}" d="M ${f(rxc)} ${ry - 9} L ${f(rxc)} ${ry + 10}" stroke-width="1.6"/>`;
  // the reading rides above its own cursor tick, never in a column 150px away
  out += `<text class="orr-ct-scale__word" x="${f(rxc)}" y="${ry - 12}" text-anchor="middle">${escapeHtml(String(RISK_LABEL[r] || '').toUpperCase())}</text>`;
  if (!compact) out += `<text class="orr-ct-scale__end" x="${rx0}" y="${ry + 20}" text-anchor="start">ROUTINE</text><text class="orr-ct-scale__end" x="${rx1}" y="${ry + 20}" text-anchor="end">SEVERE</text>`;
  // standing: a centred scale, the loss to the left of zero in red, the gain to the right in light
  const sy = compact ? 44 : 62; const sx0 = rx0; const sx1 = rx1; const mid = (sx0 + sx1) / 2; const span = 10;
  const xOf = (v) => mid + ((sx1 - sx0) / 2) * Math.max(-1, Math.min(1, v / span));
  out += `<text class="orr-ct-scale__key" x="0" y="${sy + 4}">STANDING</text>`;
  out += `<path class="orr-core orr-ct-scale__rule" d="M ${sx0} ${sy} L ${sx1} ${sy}" stroke-width="1"/>`;
  out += `<path class="orr-core orr-ct-scale__tick" d="M ${mid} ${sy - 5} L ${mid} ${sy + 6}" stroke-width="1.2"/>`;
  if (gain > 0) out += `<path class="orr-core orr-ct-scale__fill" d="M ${mid} ${sy} L ${f(xOf(gain))} ${sy}" stroke-width="3" stroke-linecap="butt"/>`;
  if (loss > 0) out += `<path class="orr-core orr-ct-scale__loss" d="M ${f(xOf(-loss))} ${sy} L ${mid} ${sy}" stroke-width="3" stroke-linecap="butt"/>`;
  // the reading runs the way the scale does: the loss to the left, the gain to the right
  const words = [];
  if (loss > 0) words.push(`<tspan class="orr-ct-scale__lossword">−${loss}</tspan>`);
  if (gain > 0) words.push(`<tspan class="orr-ct-scale__gain">+${gain}</tspan>`);
  out += `<text class="orr-ct-scale__word" x="${sx1 + 12}" y="${sy + 4}">${words.length ? words.join('<tspan class="orr-ct-scale__sep">  ·  </tspan>') : 'NO CHANGE'}</text>`;
  if (!compact) out += `<text class="orr-ct-scale__end" x="${sx0}" y="${sy + 20}" text-anchor="start">ON FAILURE</text><text class="orr-ct-scale__end" x="${sx1}" y="${sy + 20}" text-anchor="end">ON SUCCESS</text>`;
  out += `</svg>`;
  return out;
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

  // INF-065: one mission (escort) briefed as a physical situation from its live target,
  // route, and known hazards, paired with a concrete approach — not another flavor paragraph.
  const briefing = missionBriefingDiagram(m, state, origin);
  return bindStationMarkup(contractDossierView({
    typeName: typeLabel(m.type),
    titleHtml: entitySpanHtml('contract:' + String(mid(m)), escapeHtml(title)),
    clientHtml: clientEntityHtml(m),
    reward: reward(m).toLocaleString('en-US'),
    summary: authoredSummary,
    routeHtml: `${originEntityHtml(state, origin)} → ${destEntityHtml(m)} · ${escapeHtml(routeText)}`,
    briefingHtml: briefingDiagramHtml(briefing),
    riskHtml: riskSentence(m, consequences, facShort),
    termsHtml: (cargoName ? termRow('Payload', cargoEntityHtml(cargo, cargoName), cargo.qty ? `${num(cargo.qty)} u` : '') : '')
      + termRow('Time', escapeHtml(m.timeLabel || (m.timeLimitMin ? m.timeLimitMin + ' min' : 'Flexible')))
      // a forfeit is a loss: the one term that carries the threat channel's red tick
      // the collateral term always holds its line, so the commit key never moves between missions
      + (consequences.collateral ? termRow('Collateral', cr(consequences.collateral), 'on failure', { cls: 'sx-term--threat' }) : termRow('Collateral', 'None', '', { cls: 'sx-term--none' }))
      + (upfrontCr ? termRow('Upfront', cr(upfrontCr), 'to accept') : '')
      + (missionOffersFollowUp(m) ? termRow('Follow-up', 'Posted on success', 'same contract family') : '')
      + (m.featured ? termRow('Featured', 'Day rate', `pays ×${m.featured.rewardMult} · +${m.featured.repBonus} rep`) : '')
      + termRow('Readiness', escapeHtml(readiness.label), escapeHtml(readiness.detail)),
    readiness,
    clausesHtml: clauses.map((c) => `<li class="k-t-fine k-62"><span class="sx-tag"${clauseWhyAttr(c)}>${escapeHtml(c.label || c.id || 'clause')}</span></li>`).join(''),
    focusAccept,
    action: { id: mid(m), ready, focus: focusAccept && ready,
      readyLabel: 'Accept', blockedLabel: 'Resolve Readiness', aria: acceptAria, reason: readiness.detail },
  }));
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
  // ORRERY (design/frontend/ORRERY.md §6 Contracts): the route as a beam on a mini orrery beside the
  // dossier, the dossier's words resolving on arrival, the reward rolling, and Accept held (a ring
  // fills) when collateral is at risk. The tab arrives once per show; a selection re-renders quietly.
  let routeInstrument = null;
  let holdVerb = null;
  let holdFired = false;
  let arriving = false;
  const stopDecrypt = [];
  const raf = typeof globalThis.requestAnimationFrame === 'function' ? globalThis.requestAnimationFrame : null;

  function dressHangLabels() {
    ensureInteriorStyle();
    for (const cap of el.querySelectorAll('.sx-ct__hang > .k-caps')) paintLegend(cap, true);
    paintLegend(dispatchEl);
  }

  function dressBoard() {
    ensureInteriorStyle();
    if (boardEl.querySelector('.sf-state')) { dressState(boardEl); return; }
    for (const row of boardEl.querySelectorAll('.sx-ct-row')) {
      paintRow(row, row.classList.contains('is-active') || row.getAttribute('aria-selected') === 'true');
    }
  }

  function dressDossier() {
    ensureInteriorStyle();
    if (dossierEl.querySelector('.sf-state')) { dressState(dossierEl); return; }
    const dossier = dossierEl.querySelector('.sx-dossier') || dossierEl;
    paintPlate(dossier, 'sunk');
    paintLegend(dossier.querySelector('.k-caps'), true);
    paintMarking(dossier.querySelector('.sx-dossier__title, .k-t-title'));
    paintHero(dossier.querySelector('.k-hero__n'));
    paintLegend(dossier.querySelector('.k-hero__w'));
    for (const row of dossier.querySelectorAll('.k-row')) paintRow(row, false);
    pinKeyrack(dossier.querySelector('.sx-dossier__foot'));
    pinKeyrack(dossier.querySelector('.sx-dossier__clauses'));
    const accept = dossier.querySelector('.sx-ct-commit[data-accept]');
    if (accept) paintKey(accept, 'primary');
    for (const tag of dossier.querySelectorAll('.sx-tag')) paintCap(tag);
    syncKeys(dossier);
  }

  function dressActive() {
    ensureInteriorStyle();
    for (const job of activeEl.querySelectorAll('.sx-job')) paintRow(job, job.classList.contains('is-tracked'));
    for (const btn of activeEl.querySelectorAll('[data-track]')) paintKey(btn, 'small');
    syncKeys(activeEl);
  }

  dressHangLabels();

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

  // a short screen's ladder window ends on a row boundary: the dissolve runs in the gap between rows, never
  // through a live row. Measured after paint; a taller window keeps its CSS height.
  function fitLadderWindow() {
    try {
      if (typeof window === 'undefined' || window.innerHeight > 800) { boardEl.style.maxHeight = ''; return; }
      boardEl.style.maxHeight = '';
      const top = boardEl.getBoundingClientRect().top;
      const limit = top + boardEl.clientHeight;
      const rows = [...boardEl.querySelectorAll('.sx-ct__rows .sx-ct-row, .sx-decision .sx-ct-row')];
      let cut = 0;
      for (const row of rows) {
        const r = row.getBoundingClientRect();
        if (r.bottom <= limit - 2) cut = r.bottom;
        else { if (cut) boardEl.style.maxHeight = `${Math.round(Math.min(cut, r.top) - top)}px`; return; }
      }
    } catch (_) { /* a headless host has no boxes to fit */ }
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
      dressBoard();
      return;
    }
    const recommended = boardRecommendedOfferId(list, state);
    // ORRERY: the dispatch's choice hangs off the jobs it names, as flagged sub-rows on the same
    // ladder; only an option that names no posted job keeps its own section under the list.
    const decisions = presentSurfaceDecisions(state, stationId, 'contracts');
    const optionsByMission = new Map();
    const loose = [];
    for (const decision of decisions) {
      for (const option of decision.options) {
        const target = option.effect && option.effect.missionId != null ? String(option.effect.missionId) : null;
        const entry = { decision, option };
        if (target && list.some((m) => String(mid(m)) === target)) {
          if (!optionsByMission.has(target)) optionsByMission.set(target, []);
          optionsByMission.get(target).push(entry);
        } else loose.push(entry);
      }
    }
    // A sub-row that would only repeat its job's title carries the dispatch's flag instead, and the
    // tradeoff is its line; a loose option keeps its own label.
    // A sub-row is one tick line of facts (the first three of the tradeoff's clauses); the whole
    // tradeoff stays in the accessible name.
    const optionHtml = ({ decision, option }, sub, jobTitle = '') => {
      const repeats = sub && jobTitle && String(option.label || '').trim().toLowerCase() === String(jobTitle).trim().toLowerCase();
      // the row already shows the pay: the sub-line says only what dispatching changes
      const facts = sub ? String(option.tradeoff || '').split(' · ').filter((c) => !/^pays\b/i.test(c.trim())).slice(0, 3).join(' · ') : String(option.tradeoff || '');
      return (
        `<button type="button" ${stationControlAttrs('decision-option')} class="k-row sx-ct-row sx-decision__opt${sub ? ' sx-decision__opt--sub' : ''}" data-adventure-id="${escapeHtml(decision.id)}" data-adventure-option="${escapeHtml(option.id)}" aria-label="${escapeHtml(`${option.label}. ${option.tradeoff}`)}">` +
          `<span class="k-row__name">${repeats ? 'Dispatch this job' : escapeHtml(option.label)}</span>` +
          `<span class="k-row__sub">${escapeHtml(facts)}</span>` +
        `</button>`
      );
    };
    const decisionHtml = loose.length
      ? decisions.filter((d) => loose.some((e) => e.decision === d)).map((decision) => (
        `<section class="sx-decision">` +
          `<p class="k-sentence">${escapeHtml(decision.situation)}</p>` +
          loose.filter((e) => e.decision === decision).map((e) => optionHtml(e, false)).join('') +
        `</section>`
      )).join('')
      : '';
    boardEl.innerHTML = decisionHtml +
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
        // Authored first-hour provenance keeps the badge slot when it owns this offer; otherwise a
        // featured day's premium mark outranks the best-next pick. Never more than one, never a reorder.
        const badge = firstHour ? firstHour.label
          : (m.featured ? 'FEATURED'
            : (recommended.label && recommended.missionId === id ? recommended.label : ''));
        const badgePrefix = badge ? `${badge} · ` : '';
        const rowAria = filing
          ? `${m.title || `Choice ${filing.choiceId}`}, final disposition from ${filing.issuerName}, separate irreversible confirmation required`
          : `${badgePrefix}${m.title || typeLabel(m.type)}, ${reward(m).toLocaleString('en-US')} credits, ${RISK_LABEL[Math.min(r, 5)]} risk${missionOffersFollowUp(m) ? ', follow-up available on success' : ''}`;
        return (
          `<li><button type="button" ${stationControlAttrs('mission-row')} class="sx-ct-row${rowClasses}${needs}" data-mid="${escapeHtml(id)}" role="tab" aria-selected="${selected}" tabindex="${selected ? 0 : -1}"` +
            ` aria-label="${escapeHtml(rowAria)}${needs ? ', needs attention' : ''}">` +
            `<span class="sx-ct-row__crest" aria-hidden="true">${crestHtml(m.factionId)}</span>` +
            `<span class="k-row__name sx-ct-row__title">` +
              (badge ? `<span class="k-t-fine k-signal sx-ct-row__badge">${escapeHtml(badge)}</span> ` : '') +
              `${escapeHtml(m.title || typeLabel(m.type))}` +
            `</span>` +
            `<span class="k-row__num sx-ct-row__rew">${filing ? 'Review' : reward(m).toLocaleString('en-US')}</span>` +
          `</button>` +
          (optionsByMission.get(id) || []).map((e) => optionHtml(e, true, m.title || typeLabel(m.type))).join('') +
          `</li>`
        );
      }).join('') +
      `</ul>`;
    dressBoard();
    syncScrollExtent(boardEl);
    fitLadderWindow();
    if (arriving && !reducedMotion()) {
      const rows = boardEl.querySelectorAll('.sx-ct-row');
      stagger(rows, { base: 60, step: 34 });
      for (const row of rows) row.classList.add('orr-rise');
    }
  }

  /** Where the docked berth stands, so the route beam starts from the right sector. */
  function originSectorId(state) {
    const sid = state && state.ui && state.ui.dockedStationId;
    return sectorOfStation(sid) || (state && state.world && state.world.currentSectorId) || null;
  }

  function destSectorIdOf(m) {
    const params = (m && m.params) || {};
    return m.destSectorId || params.destSectorId || sectorOfStation(m.destStationId || params.destStationId) || null;
  }

  /** The ORRERY instruments on a rendered dossier: the route beam, the words that resolve, the
   *  rolling reward, the hold ring on Accept. Everything here is presentation over the markup the
   *  pure builder made; tests read that markup, not this. */
  // The tether: choosing a mission draws one line across the whole screen — the ladder's arm, the terms'
  // spine, the key, then this line from the key's edge across the glass into the orrery's origin, where
  // the beam takes over to the destination. The route reading (jumps, destination) rides the line.
  function layTether(dossier, routeHost, g) {
    try {
      const SVG_NS = 'http://www.w3.org/2000/svg';
      let tether = dossier.querySelector(':scope > .sx-ct-tether');
      let cap = dossier.querySelector(':scope > .sx-ct-tether__caption');
      if (!tether) {
        tether = document.createElementNS(SVG_NS, 'svg');
        tether.setAttribute('class', 'sx-ct-tether');
        tether.setAttribute('aria-hidden', 'true');
        for (const [name, cls] of [['path', 'sx-ct-tether__bloom'], ['path', 'sx-ct-tether__core'], ['circle', 'sx-ct-tether__bead']]) {
          const el = document.createElementNS(SVG_NS, name);
          el.setAttribute('class', cls);
          if (name === 'circle') el.setAttribute('r', '2.5');
          tether.appendChild(el);
        }
        dossier.appendChild(tether);
      }
      if (!cap) {
        cap = document.createElement('p');
        cap.className = 'sx-ct-tether__caption';
        cap.setAttribute('aria-hidden', 'true');
        cap.innerHTML = '<span class="orr-route__jumps"></span><span class="orr-route__via"></span>';
        dossier.appendChild(cap);
      }
      const key = dossier.querySelector('.sx-dossier__foot .orr-lampkey, .sx-dossier__foot button');
      const dr = dossier.getBoundingClientRect();
      const rr = routeHost.getBoundingClientRect();
      const kr = key ? key.getBoundingClientRect() : null;
      const hide = () => { tether.style.display = 'none'; cap.style.display = 'none'; };
      if (!kr || !(dr.width > 0) || !(kr.width > 0)) { hide(); return; }
      const kx = kr.right - dr.left + 20;
      // snapped to the pixel grid so the 1px core reads as one row, not two half rows
      const ky = Math.round(kr.top - dr.top + kr.height / 2) + 0.5;
      const ox = rr.left - dr.left + g.origin.x;
      const oy = rr.top - dr.top + g.origin.y;
      if (!(ox > kx + 80)) { hide(); return; }
      const dy = ky - oy;
      const ex = ox - Math.abs(dy);
      const d = ex > kx + 24 ? `M ${kx} ${ky} H ${ex.toFixed(1)} L ${ox.toFixed(1)} ${oy.toFixed(1)}` : `M ${kx} ${ky} L ${ox.toFixed(1)} ${oy.toFixed(1)}`;
      tether.setAttribute('viewBox', `0 0 ${Math.max(1, dr.width)} ${Math.max(1, dr.height)}`);
      tether.querySelector('.sx-ct-tether__core').setAttribute('d', d);
      tether.querySelector('.sx-ct-tether__bloom').setAttribute('d', d);
      const bead = tether.querySelector('.sx-ct-tether__bead');
      bead.setAttribute('cx', String(kx)); bead.setAttribute('cy', String(ky));
      cap.querySelector('.orr-route__jumps').textContent = g.jumpsText || '';
      cap.querySelector('.orr-route__via').textContent = g.viaText || '';
      cap.style.left = `${Math.round(kx + 22)}px`;
      // the reading hangs from the line (never up into the terms at a short height)
      // at 720 the reading stands above the line (the column's foot fades below it); at full size it hangs under the line
      cap.style.top = `${Math.round(ky + (window.innerHeight <= 800 ? -30 : 15))}px`;
      tether.style.display = '';
      cap.style.display = '';
      // the ladder's foot closes on the tether's line: the YOURS block bottom-anchors six px above it, so the
      // left column ends where the instrument's line begins (no push when it already reaches the foot)
      try {
        const yours = document.querySelector('.sx-ct__yours');
        const firstJob = document.querySelector('.sx-job');
        const list = firstJob ? firstJob.parentElement : null;
        if (yours && list) {
          yours.style.removeProperty('margin-top');
          const bottom = list.getBoundingClientRect().bottom;
          // the line as drawn (its path's lowest row is the horizontal run), not the key box's arithmetic
          const drawn = tether.querySelector('.sx-ct-tether__core').getBoundingClientRect();
          const lineY = drawn.height > 0 ? drawn.bottom - 0.5 : dr.top + ky;
          const push = (lineY - 6) - bottom;
          // the sheet's own margin is !important: the push must be too
          if (push > 0) yours.style.setProperty('margin-top', `${Math.round(push)}px`, 'important');
          // the seam between the board and YOURS carries the rail, so the ladder stays one scale with a block gap
          const board = document.querySelector('.sx-ct__board');
          const seam = board ? Math.max(0, yours.getBoundingClientRect().top - board.getBoundingClientRect().bottom) : 0;
          yours.style.setProperty('--ct-seam', `${Math.round(seam)}px`);
          // the seam's ticks keep the ladder's own 8px pitch from its first tick
          const railTop = (document.querySelector('.sx-ct__rows') || board).getBoundingClientRect().top;
          const seamTop = yours.getBoundingClientRect().top - seam;
          yours.style.setProperty('--ct-seam-phase', `${Math.round((((railTop - seamTop) % 8) + 8) % 8)}px`);
        }
      } catch (_) { /* cosmetic */ }
      // the dossier settles after the orrery's first layout (the scales land, the key seats): measure again on
      // the next frames and redraw if anything moved; at most two extra passes per layout
      if (!g.__settled && typeof requestAnimationFrame === 'function') {
        const again = (n) => requestAnimationFrame(() => {
          const kr2 = key.getBoundingClientRect(); const dr2 = dossier.getBoundingClientRect();
          const moved = Math.abs(kr2.top - kr.top) > 0.5 || Math.abs(kr2.right - kr.right) > 0.5 || Math.abs(dr2.top - dr.top) > 0.5 || Math.abs(dr2.left - dr.left) > 0.5 || Math.abs(dr2.width - dr.width) > 0.5;
          if (moved) layTether(dossier, routeHost, { ...g, __settled: n >= 2 });
          else if (n < 2) again(n + 1);
        });
        again(1);
      }
    } catch (_) { /* a headless host has no boxes to tether */ }
  }

  function composeDossier(m, state) {
    const dossier = dossierEl.querySelector('.sx-dossier');
    if (!dossier) return;
    for (const stop of stopDecrypt.splice(0)) stop();
    if (routeInstrument) { routeInstrument.dispose(); routeInstrument = null; }
    if (holdVerb) { holdVerb.dispose(); holdVerb = null; }
    // the route orrery beside the reading
    const routeHost = document.createElement('div');
    routeHost.className = 'orr-ct-route';
    routeHost.setAttribute('aria-hidden', 'true');
    dossier.appendChild(routeHost);
    routeInstrument = createRouteOrrery(routeHost, { caption: 'tether', onLayout: (g) => layTether(dossier, routeHost, g) });
    routeInstrument.set({
      origin: originSectorId(state),
      originName: (ctx.station && ctx.station.name) || 'This station',
      dest: destSectorIdOf(m),
      destName: destName(m),
      tether: true,
    });
    // the consequences as instruments: the risk on a five-tick scale, the standing as a gain and a
    // loss on one small scale (the loss red: it is the one threat here). The sentence stays for the ear.
    const risky = dossier.querySelector('.sx-dossier__risk');
    if (risky) {
      const scales = document.createElement('div');
      scales.className = 'orr-ct-scales';
      scales.setAttribute('aria-hidden', 'true');
      scales.innerHTML = consequenceScalesSvg(m, { compact: typeof window !== 'undefined' && window.innerHeight > 0 && window.innerHeight <= 800 });
      risky.insertAdjacentElement('afterend', scales);
    }
    // the words resolve; the reward rolls
    if (!reducedMotion()) {
      const targets = [
        dossier.querySelector('.sx-dossier__title .sf-entity-link') || dossier.querySelector('.sx-dossier__title'),
        dossier.querySelector(':scope > .k-caps'),
        dossier.querySelector('.k-hero__w'),
        ...dossier.querySelectorAll('.sx-dossier__terms > li > .k-62'),
      ].filter(Boolean);
      targets.forEach((node, i) => {
        const text = node.textContent;
        if (text) stopDecrypt.push(decrypt(node, text, { duration: 240, delay: 40 + i * 50 }));
      });
    }
    const heroN = dossier.querySelector('.sx-dossier__reward .k-hero__n');
    if (heroN && !heroN.querySelector('.orr-counter__digit')) {
      const value = reward(m);
      const counter = createCounter(heroN);
      if (raf && !reducedMotion()) { counter.set(0); raf(() => raf(() => counter.set(value))); }
      else counter.set(value);
    }
    // Accept is the tab's Lamp Key. When collateral is at risk it is held: the ring at its side
    // fills with the Hand, and letting go early empties it.
    const accept = dossier.querySelector('.sx-ct-commit[data-accept]');
    const consequences = missionConsequenceSummary(m);
    if (accept && !accept.disabled && consequences.collateral > 0) {
      accept.setAttribute('aria-label', `${accept.getAttribute('aria-label') || 'Accept'} Hold to accept: ${cr(consequences.collateral)} collateral is at risk.`);
      holdVerb = attachHoldVerb(accept, { ms: 720, onFire: () => { holdFired = true; accept.classList.remove('is-holding'); acceptMission(accept); holdFired = false; } });
      dressLampKey(accept, { hold: true, note: 'hold' });
    } else if (accept) {
      dressLampKey(accept);
    }
    // a short screen takes the smaller key
    if (accept && typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(max-height:800px)').matches) accept.classList.add('orr-lampkey--small');
  }

  function feedHold(held) {
    if (!holdVerb) return;
    holdVerb.feed(held);
    const accept = dossierEl.querySelector('.sx-ct-commit[data-hold]');
    if (accept) accept.classList.toggle('is-holding', !!held);
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
      dressDossier();
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
      dressDossier();
      return;
    }
    dossierEl.innerHTML = missionDossierHtml(m, state, {
      origin: (ctx.station && ctx.station.name) || 'This station',
      focusAccept,
    });
    dressDossier();
    composeDossier(m, state);
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
          // INF-058: the station row carries the same objective wording as the HUD, log and map —
          // the next concrete action with its live progress, not a title and a berth alone.
          const sub = [objectiveText(m), status].filter(Boolean).join(' · ');
          return (
            `<li class="k-row k-row--static sx-job${tracked ? ' is-tracked' : ''}${needs ? ' is-attention' : ''}" data-active-mid="${escapeHtml(id)}">` +
              `<span class="k-row__name sx-job__title">${escapeHtml(m.title || typeLabel(m.type))}</span>` +
              `<span class="k-row__sub sx-job__meta${needs ? ' k-signal' : ''}">${escapeHtml(sub)}</span>` +
              `<button type="button" ${stationControlAttrs('track')} class="k-word k-word--fine sx-job__track" data-track="${escapeHtml(id)}" aria-pressed="${tracked}">${tracked ? 'Tracked' : 'Track'}</button>` +
            `</li>`
          );
        }).join('') + `</ul>`
      : `<p class="k-sentence sx-ct__none">No active missions. Accept a job from the board to begin.</p>`;
    dressActive();
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
    const adventure = ev.target.closest('[data-adventure-option]');
    if (adventure) {
      const state = ctx.state || {};
      const chosen = chooseAdventureDecision(state, adventure.getAttribute('data-adventure-id'), adventure.getAttribute('data-adventure-option'), {
        bus: ctx.bus,
      });
      renderAll(state);
      if (ctx.bus) ctx.bus.emit('audio:cue', { id: chosen && chosen.ok ? 'ui_accept' : 'ui_deny' });
      return;
    }
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

  function acceptMission(acc) {
    if (!acc || acc.disabled) return;
    acc.disabled = true;
    const missionId = acc.getAttribute('data-accept');
    const state = ctx.state || {};
    const stationId = state.ui && state.ui.dockedStationId;
    const shown = presentSurfaceDecisions(state, stationId, 'contracts');
    const match = shown.find((decision) => decision.options.some((option) => (
      option.effect && option.effect.missionId === missionId
    )));
    if (match && ctx.bus) {
      const option = match.options.find((row) => row.effect && row.effect.missionId === missionId);
      const chosen = chooseAdventureDecision(state, match.id, option.id, { bus: ctx.bus });
      ctx.bus.emit('audio:cue', { id: chosen && chosen.ok ? 'ui_accept' : 'ui_deny' });
    } else if (ctx.bus) {
      ctx.bus.emit('ui:acceptMission', { missionId });
      ctx.bus.emit('audio:cue', { id: 'ui_accept' });
    }
    setTimeout(() => renderAll(state), 60);
  }

  // A held Accept fires from its ring, never from the tap that started the hold. Pointer, keyboard
  // and the pad's confirm all feed the same clock; the plain click is swallowed while it is armed.
  const holdTarget = (ev) => (holdVerb && ev.target && ev.target.closest ? ev.target.closest('.sx-ct-commit[data-hold]') : null);
  el.addEventListener('pointerdown', (ev) => { if (holdTarget(ev) && ev.button === 0) feedHold(true); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    el.addEventListener(type, (ev) => { if (holdTarget(ev)) feedHold(false); }, true);
  }
  el.addEventListener('keydown', (ev) => {
    if (!holdTarget(ev) || ev.repeat || (ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault();
    feedHold(true);
  });
  el.addEventListener('keyup', (ev) => { if (holdTarget(ev) && (ev.key === 'Enter' || ev.key === ' ')) feedHold(false); });
  el.addEventListener('click', (ev) => {
    if (holdTarget(ev) && !holdFired) { ev.preventDefault(); ev.stopImmediatePropagation(); }
  }, true);

  el.addEventListener('click', (ev) => {
    const acc = ev.target.closest('[data-accept]');
    if (acc && !acc.disabled) {
      acceptMission(acc);
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
      arriving = true;
      renderAll(next.state || {});
      arriving = false;
    },
    refresh(c) {
      const next = c || ctx;
      if (next && (next.attention || next.missionId != null)) applyShowOptions(next);
      renderAll((next && next.state) || ctx.state || {});
    },
    dispose() {
      if (ctx.bus && ctx.bus.off) ctx.bus.off('mission:updated', onMissionChanged);
      for (const stop of stopDecrypt.splice(0)) stop();
      if (routeInstrument) { routeInstrument.dispose(); routeInstrument = null; }
      if (holdVerb) { holdVerb.dispose(); holdVerb = null; }
    },
  };
}
