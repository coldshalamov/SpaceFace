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
import { arcGauge } from '../../orrery/instruments.js';
import { polar } from '../../orrery/svg.js';
import { createCounter, decrypt } from '../../orrery/text.js';
import { reducedMotion, stagger } from '../../orrery/motion.js';
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
 * The STANDING gauge's arc in each scales box: a shallow arc over the row's centre, bipolar
 * about the top (bearing 0). The loss half runs 0 to -half, the gain half 0 to +half; the labels
 * stand outside the arc's ends. composeDossier mounts the two arcGauge halves into the
 * `.orr-ct-standgauge` placeholder; the ticks, key and labels below are static string.
 */
const CT_STAND = { cx: 264, cy: 96, r: 46, half: 40, keyY: 61, labelY: 61, labelL: 226, labelR: 302, flatY: 42 };
const CT_STAND_COMPACT = { cx: 192, cy: 76, r: 40, half: 40, keyY: 48, labelY: 51, labelL: 158, labelR: 226, flatY: 28 };

/**
 * The consequences as instruments of light (ORRERY §3.2: a quantity is an arc or a scale): RISK
 * as a banded track — a luminous band under a 1.5 core, the stretch from ROUTINE to the cursor
 * lit, a blade for a cursor — and STANDING as a library Arc Gauge, bipolar about a centre tick:
 * the failure half dim (the gauge's ghost tone), the success half lit, each half's head marking
 * the live end. Pure string; composeDossier mounts the gauge halves into the placeholder.
 */
export function consequenceScalesSvg(m, { compact = false } = {}) {
  // compact: a short screen draws the scales at 1:1 in a 400x60 box (no endpoint captions), so the labels never shrink
  const w = compact ? 400 : 520; const h = compact ? 60 : 84;
  const f = (n) => Math.round(n * 100) / 100;
  const r = Math.min(risk(m), 5);
  const high = r >= 3;
  const consequences = missionConsequenceSummary(m);
  const gain = Math.max(0, Number(consequences.repReward) || 0);
  const loss = Math.max(0, -(Number(consequences.repPenalty) || 0));
  let out = `<svg class="orr-svg" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">`;
  // risk: a banded track with a lit stretch and a blade cursor
  const rx0 = compact ? 84 : 96; const rx1 = compact ? 300 : 336; const ry = compact ? 14 : 20;
  const rxc = rx0 + ((rx1 - rx0) * r) / 5;
  out += `<text class="orr-ct-scale__key" x="0" y="${ry + 4}">RISK</text>`;
  out += `<path class="orr-ct-scale__band" d="M ${rx0} ${ry} L ${rx1} ${ry}" fill="none" stroke="rgb(236 230 216 / .27)" stroke-width="7" stroke-linecap="butt"/>`;
  out += `<path class="orr-ct-scale__fill${high ? ' is-high' : ''}" d="M ${rx0} ${ry} L ${f(rxc)} ${ry}" stroke-width="3.5" opacity=".6" stroke-linecap="butt"/>`;
  out += `<path class="orr-core orr-ct-scale__rule" d="M ${rx0} ${ry} L ${rx1} ${ry}" stroke-width="1.5"/>`;
  let ticks = '';
  for (let i = 0; i <= 5; i += 1) { const x = rx0 + ((rx1 - rx0) * i) / 5; ticks += `M ${f(x)} ${ry - 4} L ${f(x)} ${ry + 5} `; }
  out += `<path class="orr-core orr-ct-scale__tick" d="${ticks}" stroke-width="1"/>`;
  const blade = high ? 'rgb(255 80 56)' : 'rgb(248 244 234)';
  out += `<g class="orr-ct-scale__blade"><rect x="${f(rxc - 5)}" y="${ry - 11}" width="10" height="22" fill="${blade}" opacity=".16"/><rect x="${f(rxc - 2)}" y="${ry - 9}" width="4" height="18" fill="${blade}"/></g>`;
  // the reading rides above its own cursor tick, never in a column 150px away
  out += `<text class="orr-ct-scale__word" x="${f(rxc)}" y="${ry - 12}" text-anchor="middle">${escapeHtml(String(RISK_LABEL[r] || '').toUpperCase())}</text>`;
  if (!compact) out += `<text class="orr-ct-scale__end" x="${rx0}" y="${ry + 20}" text-anchor="start">ROUTINE</text><text class="orr-ct-scale__end" x="${rx1}" y="${ry + 20}" text-anchor="end">SEVERE</text>`;
  // standing: the gauge's skeleton — centre tick, end ticks, key and labels; the halves arrive as DOM
  const P = compact ? CT_STAND_COMPACT : CT_STAND;
  const [ccx0, ccy0] = polar(P.cx, P.cy, P.r - 5, 0);
  const [ccx1, ccy1] = polar(P.cx, P.cy, P.r + 5, 0);
  out += `<path class="orr-core orr-tick orr-tick--major" d="M ${f(ccx0)} ${f(ccy0)} L ${f(ccx1)} ${f(ccy1)}"/>`;
  for (const a of [-P.half, P.half]) {
    const [ix, iy] = polar(P.cx, P.cy, P.r - 4, a);
    const [ox, oy] = polar(P.cx, P.cy, P.r + 4, a);
    out += `<path class="orr-core orr-tick" d="M ${f(ix)} ${f(iy)} L ${f(ox)} ${f(oy)}"/>`;
  }
  out += `<g class="orr-ct-standgauge"></g>`;
  out += `<text class="orr-ct-scale__key" x="0" y="${P.keyY}">STANDING</text>`;
  // the reading runs the way the gauge does: the loss outside the left end, the gain outside the right
  if (compact) {
    if (loss > 0) out += `<text class="orr-ct-scale__word" x="${P.labelL}" y="${P.labelY}" text-anchor="end"><tspan class="orr-ct-scale__lossword">−${loss}</tspan></text>`;
    if (gain > 0) out += `<text class="orr-ct-scale__word" x="${P.labelR}" y="${P.labelY}" text-anchor="start"><tspan class="orr-ct-scale__gain">+${gain}</tspan></text>`;
    if (!loss && !gain) out += `<text class="orr-ct-scale__word" x="${P.cx}" y="${P.flatY}" text-anchor="middle">NO CHANGE</text>`;
  } else {
    out += `<text class="orr-ct-scale__end" x="${P.labelL}" y="${P.labelY}" text-anchor="end">${loss > 0 ? `<tspan class="orr-ct-scale__lossword">−${loss}</tspan><tspan> · ON FAILURE</tspan>` : 'ON FAILURE'}</text>`;
    out += `<text class="orr-ct-scale__end" x="${P.labelR}" y="${P.labelY}" text-anchor="start">${gain > 0 ? `<tspan class="orr-ct-scale__gain">+${gain}</tspan><tspan> · ON SUCCESS</tspan>` : 'ON SUCCESS'}</text>`;
    if (!loss && !gain) out += `<text class="orr-ct-scale__word" x="${P.cx}" y="${P.flatY}" text-anchor="middle">NO CHANGE</text>`;
  }
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
  // SF-112: the premium names its cause when the offer was priced on a real complication —
  // a customs weir on the lane, or the destination sector's thin patrol cover.
  const note = typeof m.riskNote === 'string' && m.riskNote ? ` — ${m.riskNote}` : '';
  return `${RISK_LABEL[r]} risk${note}. Success pays ${gain}; failure ${loss}.`;
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
  // The commit hold owns its own clock (the Industry FABRICATE pattern): pointer, keyboard and
  // the pad's A feed one rAF loop that fills the key's ring AND the route's combined hold path
  // together. hold = { frac, dir, source, ms, last, frame, done }.
  let hold = null;
  let acceptHoldMs = 450;
  let pointerAt = -1;
  let keyAt = -1;
  // the tether's hold painter, armed by layTether once the combined path is measured; the bench
  // reaches it as dossier.__ctHoldPath.set(p) for the deterministic 50%-hold still
  let paintHoldPath = null;
  let lastTetherG = null;
  let tetherTailArmed = false;
  let tetherTailTimer = 0;
  const standGauges = [];
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
            // The badge sits in the row's top pad zone, above the title — emitted as a row child,
            // not inside the title: the title's overflow:hidden would clip it entirely.
            (badge ? `<span class="k-t-fine k-signal sx-ct-row__badge" aria-hidden="true">${escapeHtml(badge)}</span>` : '') +
            `<span class="k-row__name sx-ct-row__title">` +
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
  // The hold IS the route: one combined path (tether, then beam, key to station to berth) in one mpath
  // carries the one ambient pulse, and the hold's progress lights a fill along that same path.
  let tetherSeq = 0;
  function layTether(dossier, routeHost, g) {
    try {
      const SVG_NS = 'http://www.w3.org/2000/svg';
      const mk = (name, cls) => {
        const node = document.createElementNS(SVG_NS, name);
        node.setAttribute('class', cls);
        return node;
      };
      let tether = dossier.querySelector(':scope > .sx-ct-tether');
      let cap = dossier.querySelector(':scope > .sx-ct-tether__caption');
      if (!tether) {
        tether = document.createElementNS(SVG_NS, 'svg');
        tether.setAttribute('class', 'sx-ct-tether');
        tether.setAttribute('aria-hidden', 'true');
        for (const [name, cls] of [['path', 'sx-ct-tether__bloom'], ['path', 'sx-ct-tether__core']]) tether.appendChild(mk(name, cls));
        const bead = mk('circle', 'sx-ct-tether__bead');
        bead.setAttribute('r', '2.5');
        tether.appendChild(bead);
        // the hold's light on the combined path: amber bloom under an amber core, pathLength 100 so the
        // hold fraction paints it, plus a head bead the clock seats with getPointAtLength each frame
        const holdBloom = mk('path', 'sx-ct-tether__holdbloom');
        holdBloom.setAttribute('fill', 'none');
        holdBloom.setAttribute('stroke-width', '10');
        holdBloom.setAttribute('stroke-linecap', 'round');
        holdBloom.setAttribute('stroke-linejoin', 'round');
        holdBloom.setAttribute('opacity', '.3');
        holdBloom.style.stroke = 'var(--dp-hand, #f2b950)';
        const holdCore = mk('path', 'sx-ct-tether__hold');
        holdCore.setAttribute('fill', 'none');
        holdCore.setAttribute('stroke-width', '2.5');
        holdCore.setAttribute('stroke-linecap', 'round');
        holdCore.setAttribute('stroke-linejoin', 'round');
        holdCore.style.stroke = 'var(--dp-hand, #f2b950)';
        tether.append(holdBloom, holdCore);
        const headBloom = mk('circle', 'sx-ct-tether__headbloom');
        headBloom.setAttribute('r', '8');
        headBloom.setAttribute('opacity', '.3');
        headBloom.style.fill = 'var(--dp-hand-hot, #ffd98c)';
        const head = mk('circle', 'sx-ct-tether__head');
        head.setAttribute('r', '3');
        head.style.fill = 'var(--dp-hand-hot, #ffd98c)';
        headBloom.style.display = 'none';
        head.style.display = 'none';
        tether.append(headBloom, head);
        // the pulse: one bead of ice on the ONE combined path — it rests at the key, runs key to
        // station to berth, rests, and goes again. The only moving light on the tab, so the eye learns
        // the key and the chart are one instrument. (The orrery's own beam pulse is off on this tab.)
        const reduce = document.documentElement && document.documentElement.classList.contains('sf-reduce-motion');
        if (!reduce) {
          const id = `sx-ct-route-core-${++tetherSeq}`;
          holdCore.setAttribute('id', id);
          const pulse = document.createElementNS(SVG_NS, 'g');
          pulse.setAttribute('class', 'sx-ct-tether__pulse');
          for (const [r, cls] of [['6', 'sx-ct-tether__pulse-bloom'], ['2.2', 'sx-ct-tether__pulse-dot']]) {
            const c = document.createElementNS(SVG_NS, 'circle');
            c.setAttribute('r', r); c.setAttribute('class', cls);
            pulse.appendChild(c);
          }
          const motion = document.createElementNS(SVG_NS, 'animateMotion');
          for (const [k, v] of [['dur', '4.6s'], ['repeatCount', 'indefinite'], ['calcMode', 'spline'], ['keyPoints', '0;0;1;1'], ['keyTimes', '0;0.22;0.86;1'], ['keySplines', '0 0 1 1;0.45 0 0.2 1;0 0 1 1']]) motion.setAttribute(k, v);
          const mpath = document.createElementNS(SVG_NS, 'mpath');
          mpath.setAttribute('href', `#${id}`);
          motion.appendChild(mpath);
          pulse.appendChild(motion);
          tether.appendChild(pulse);
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
      // at 1440p the station shell is zoomed: rects come back in zoomed px while the route orrery's origin and
      // every style length are the element's own css px. The tether's viewBox is the dossier's rect, so path
      // coordinates stay in rect px; the orrery's origin is scaled INTO rect px and style lengths OUT of it.
      let z = dossier.offsetWidth > 0 ? dr.width / dossier.offsetWidth : 1;
      if (!Number.isFinite(z) || z <= 0) z = 1;
      let zr = routeHost.offsetWidth > 0 ? rr.width / routeHost.offsetWidth : z;
      if (!Number.isFinite(zr) || zr <= 0) zr = z;
      // the bead stands 20 css px off the key's edge, never closer than 16 at any scale: the key's hold
      // silhouette reaches 9 px past the field, and the r11 fusion put the hold ring on the bead
      const kx = kr.right - dr.left + Math.max(16, 20) * z;
      // snapped to the pixel grid so the 1px core reads as one row, not two half rows
      const ky = Math.round(kr.top - dr.top + kr.height / 2) + 0.5;
      const ox = rr.left - dr.left + g.origin.x * zr;
      const oy = rr.top - dr.top + g.origin.y * zr;
      if (!(ox > kx + 80 * z)) { hide(); return; }
      lastTetherG = g;
      const dy = ky - oy;
      const ex = ox - Math.abs(dy);
      const d = ex > kx + 24 * z ? `M ${kx} ${ky} H ${ex.toFixed(1)} L ${ox.toFixed(1)} ${oy.toFixed(1)}` : `M ${kx} ${ky} L ${ox.toFixed(1)} ${oy.toFixed(1)}`;
      // the combined path: the tether, then the beam's own points (the first is the origin again, so it
      // is dropped) carried from the orrery's css px into this rect. One path, key to station to berth.
      const beamTail = (Array.isArray(g.beam) ? g.beam : []).slice(1)
        .map((p) => `L ${(rr.left - dr.left + p.x * zr).toFixed(1)} ${(rr.top - dr.top + p.y * zr).toFixed(1)}`)
        .join(' ');
      const combinedD = beamTail ? `${d} ${beamTail}` : d;
      tether.setAttribute('viewBox', `0 0 ${Math.max(1, dr.width)} ${Math.max(1, dr.height)}`);
      const core = tether.querySelector('.sx-ct-tether__core');
      core.setAttribute('d', d);
      tether.querySelector('.sx-ct-tether__bloom').setAttribute('d', d);
      const holdCore = tether.querySelector('.sx-ct-tether__hold');
      const holdBloom = tether.querySelector('.sx-ct-tether__holdbloom');
      const head = tether.querySelector('.sx-ct-tether__head');
      const headBloom = tether.querySelector('.sx-ct-tether__headbloom');
      if (holdCore) {
        holdCore.setAttribute('d', combinedD);
        holdCore.setAttribute('pathLength', '100');
        holdCore.setAttribute('stroke-dasharray', '100');
        holdCore.setAttribute('stroke-dashoffset', '100');
      }
      if (holdBloom) {
        holdBloom.setAttribute('d', combinedD);
        holdBloom.setAttribute('pathLength', '100');
        holdBloom.setAttribute('stroke-dasharray', '100');
        holdBloom.setAttribute('stroke-dashoffset', '100');
      }
      const bead = tether.querySelector('.sx-ct-tether__bead');
      bead.setAttribute('cx', String(kx)); bead.setAttribute('cy', String(ky));
      // where the tether ends on the combined run: the hold's midpoint lands exactly on THIS STATION —
      // the first half of the press charges the tether, the second half the beam
      let junction = 0.45;
      let runLen = 0;
      try {
        const tl = core.getTotalLength ? core.getTotalLength() : 0;
        const al = holdCore && holdCore.getTotalLength ? holdCore.getTotalLength() : 0;
        if (tl > 0 && al > 0) { junction = Math.max(0.05, Math.min(0.95, tl / al)); runLen = al; }
      } catch (_) { /* a headless host has no lengths to measure */ }
      const fracOf = (p) => {
        const c = Math.max(0, Math.min(1, p));
        if (c <= 0) return 0;
        if (c >= 1) return 1;
        return c <= 0.5 ? (c / 0.5) * junction : junction + ((c - 0.5) / 0.5) * (1 - junction);
      };
      paintHoldPath = (p) => {
        const frac = fracOf(p);
        const off = String(100 - frac * 100);
        if (holdCore) holdCore.setAttribute('stroke-dashoffset', off);
        if (holdBloom) holdBloom.setAttribute('stroke-dashoffset', off);
        const show = head && headBloom && frac > 0.001 && frac < 0.999 && runLen > 0;
        if (head) head.style.display = show ? '' : 'none';
        if (headBloom) headBloom.style.display = show ? '' : 'none';
        if (show) {
          try {
            const pt = holdCore.getPointAtLength(frac * runLen);
            head.setAttribute('cx', pt.x.toFixed(1)); head.setAttribute('cy', pt.y.toFixed(1));
            headBloom.setAttribute('cx', pt.x.toFixed(1)); headBloom.setAttribute('cy', pt.y.toFixed(1));
          } catch (_) { head.style.display = 'none'; headBloom.style.display = 'none'; }
        }
        return { p: Math.max(0, Math.min(1, p)), frac, junction };
      };
      // the deterministic hold still: dossier.__ctHoldPath.set(0.5) seats the head on THIS STATION
      try { dossier.__ctHoldPath = { set: (p) => (paintHoldPath ? paintHoldPath(p) : null) }; } catch (_) { /* inert */ }
      if (hold && hold.frac > 0) paintHoldPath(hold.frac);
      cap.querySelector('.orr-route__jumps').textContent = g.jumpsText || '';
      cap.querySelector('.orr-route__via').textContent = g.viaText || '';
      cap.style.left = `${Math.round(kx / z + 22)}px`;
      // the reading hangs from the line (never up into the terms at a short height)
      // at 720 the reading stands above the line (the column's foot fades below it); at full size it hangs under the line
      cap.style.top = `${Math.round(ky / z + (window.innerHeight <= 800 ? -30 : 18))}px`;
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
          const push = ((lineY - 6) - bottom) / z;
          // the sheet's own margin is !important: the push must be too
          if (push > 0) yours.style.setProperty('margin-top', `${Math.round(push)}px`, 'important');
          // the seam between the board and YOURS carries the rail, so the ladder stays one scale with a block gap
          const board = document.querySelector('.sx-ct__board');
          const seam = board ? Math.max(0, (yours.getBoundingClientRect().top - board.getBoundingClientRect().bottom) / z) : 0;
          yours.style.setProperty('--ct-seam', `${Math.round(seam)}px`);
          // ONE tick series for the whole ladder: every block, the seam and the section and row ticks are
          // phased from the ladder's first tick, so the pitch never breaks at a joint
          const hang = yours.parentElement;
          const kids = hang ? [...hang.children] : [];
          // on whole pixels: a box's background is painted from its snapped top, so the phase is taken between
          // rounded tops and every minor tick lands as one crisp row
          // phases in css px (rect px / z): the 8 px tick pitch is the sheet's own length
          const cssTop = (node) => node.getBoundingClientRect().top / z;
          const origin = Math.round(kids.length ? cssTop(kids[0]) : cssTop(yours));
          const phase = (y) => (((origin - Math.round(y)) % 8) + 8) % 8;
          const snap = (y) => origin + Math.round((y - origin) / 8) * 8;
          for (const kid of kids) kid.style.setProperty('--ct-tick-y', `${phase(cssTop(kid))}px`);
          const yrRect = yours.getBoundingClientRect();
          const yr = { top: yrRect.top / z, height: yrRect.height / z };
          yours.style.setProperty('--ct-seam-phase', `${phase(yr.top - seam)}px`);
          // YOURS's major tick on the series point nearest its label's centre (it replaces that minor tick)
          const padTop = parseFloat(getComputedStyle(yours).paddingTop) || 0;
          const labelMid = yr.top + padTop + (yr.height - padTop) / 2;
          yours.style.setProperty('--ct-yours-major', `${snap(labelMid) - Math.round(yr.top)}px`);
          // each tracked row's tick on the series point nearest its title's first line
          for (const job of list.querySelectorAll('.sx-job')) {
            const name = job.querySelector('.k-row__name') || job;
            const nrRect = name.getBoundingClientRect();
            const nr = { top: nrRect.top / z, height: nrRect.height / z };
            const lh = parseFloat(getComputedStyle(name).lineHeight) || nr.height;
            const mid = nr.top + Math.min(nr.height, lh) / 2;
            job.style.setProperty('--ct-row-y', `${snap(mid) - Math.round(cssTop(job))}px`);
          }
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
      // the tail: the reward counter and the resolving words keep nudging the key's edge for most of a
      // second after the settle passes run, which once reseated the bead on the key's edge at 1920. One
      // re-lay per dossier, after the arrival motion lands.
      if (!tetherTailArmed && typeof setTimeout === 'function') {
        tetherTailArmed = true;
        if (tetherTailTimer) clearTimeout(tetherTailTimer);
        tetherTailTimer = setTimeout(() => {
          tetherTailTimer = 0;
          try {
            if (dossier.isConnected && routeHost.isConnected && lastTetherG) layTether(dossier, routeHost, { ...lastTetherG, __settled: true });
          } catch (_) { /* cosmetic */ }
        }, 900);
      }
    } catch (_) { /* a headless host has no boxes to tether */ }
  }

  function composeDossier(m, state) {
    const dossier = dossierEl.querySelector('.sx-dossier');
    if (!dossier) return;
    for (const stop of stopDecrypt.splice(0)) stop();
    if (routeInstrument) { routeInstrument.dispose(); routeInstrument = null; }
    endHold();
    for (const gauge of standGauges.splice(0)) { try { gauge.dispose(); } catch (_) { /* inert */ } }
    paintHoldPath = null;
    lastTetherG = null;
    tetherTailArmed = false;
    if (tetherTailTimer) { clearTimeout(tetherTailTimer); tetherTailTimer = 0; }
    // the route orrery beside the reading
    const routeHost = document.createElement('div');
    routeHost.className = 'orr-ct-route';
    routeHost.setAttribute('aria-hidden', 'true');
    dossier.appendChild(routeHost);
    // pulse:false: the tab's one ambient pulse rides the combined key-to-berth path in layTether,
    // not a second loop on the beam
    routeInstrument = createRouteOrrery(routeHost, { caption: 'tether', pulse: false, onLayout: (g) => layTether(dossier, routeHost, g) });
    routeInstrument.set({
      origin: originSectorId(state),
      originName: (ctx.station && ctx.station.name) || 'This station',
      dest: destSectorIdOf(m),
      destName: destName(m),
      tether: true,
    });
    // the consequences as instruments: the risk on a banded track, the standing as a bipolar Arc
    // Gauge — the loss half dim like a ghost, the gain half lit. The sentence stays for the ear.
    const risky = dossier.querySelector('.sx-dossier__risk');
    if (risky) {
      const scales = document.createElement('div');
      scales.className = 'orr-ct-scales';
      scales.setAttribute('aria-hidden', 'true');
      const compact = typeof window !== 'undefined' && window.innerHeight > 0 && window.innerHeight <= 800;
      scales.innerHTML = consequenceScalesSvg(m, { compact });
      risky.insertAdjacentElement('afterend', scales);
      const slot = scales.querySelector('.orr-ct-standgauge');
      if (slot) {
        const cons = missionConsequenceSummary(m);
        const sLoss = Math.max(0, -(Number(cons.repPenalty) || 0));
        const sGain = Math.max(0, Number(cons.repReward) || 0);
        const P = compact ? CT_STAND_COMPACT : CT_STAND;
        try {
          const lossGauge = arcGauge({ cx: P.cx, cy: P.cy, r: P.r, from: 0, to: -P.half, width: 3, tone: 'hi', head: false });
          const gainGauge = arcGauge({ cx: P.cx, cy: P.cy, r: P.r, from: 0, to: P.half, width: 3, tone: 'phos', head: true });
          slot.append(lossGauge.el, gainGauge.el);
          lossGauge.set(sLoss / 10, { instant: true });
          gainGauge.set(sGain / 10, { instant: true });
          standGauges.push(lossGauge, gainGauge);
        } catch (_) { /* a headless host keeps the static skeleton */ }
      }
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
    // Accept is the tab's Lamp Key, and every Accept is held: 450 ms with nothing at risk,
    // 720 ms with collateral. The hold's progress lights the combined key-to-berth path; letting go
    // early retracts it; at full the berth ignites and the mission commits.
    const accept = dossier.querySelector('.sx-ct-commit[data-accept]');
    const consequences = missionConsequenceSummary(m);
    acceptHoldMs = consequences.collateral > 0 ? 720 : 450;
    if (accept && !accept.disabled) {
      const hint = consequences.collateral > 0
        ? ` Hold to accept: ${cr(consequences.collateral)} collateral is at risk.`
        : ' Hold to accept.';
      accept.setAttribute('aria-label', `${accept.getAttribute('aria-label') || 'Accept'}${hint}`);
      if (!accept.querySelector('.dp-holdring')) {
        const ring = document.createElement('span');
        ring.className = 'dp-holdring';
        ring.setAttribute('aria-hidden', 'true');
        accept.appendChild(ring);
      }
      dressLampKey(accept, { hold: true, note: consequences.collateral > 0 ? 'hold' : '' });
    } else if (accept) {
      dressLampKey(accept);
    }
    // a short screen takes the smaller key
    if (accept && typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(max-height:800px)').matches) accept.classList.add('orr-lampkey--small');
  }

  const holdClock = () => (globalThis.performance && performance.now ? performance.now() : Date.now());
  const acceptKey = () => dossierEl.querySelector('.sx-ct-commit[data-accept]:not(:disabled)');
  function padHeld() {
    try {
      const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads || []) if (p && p.buttons && p.buttons[0] && p.buttons[0].pressed) return true;
    } catch (_) { /* no pads */ }
    return false;
  }
  /** One paint for the whole hold: the key's ring and the route's combined path move together. */
  function paintHold() {
    const key = acceptKey();
    const frac = hold ? hold.frac : 0;
    if (key) {
      const ring = key.querySelector('.dp-holdring');
      if (ring && ring.style) ring.style.setProperty('--sf-hold-p', String(frac));
      key.classList.toggle('is-holding', !!hold && hold.dir > 0 && !hold.done);
    }
    if (paintHoldPath) paintHoldPath(frac);
  }
  function endHold() {
    if (hold && hold.frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(hold.frame);
    hold = null;
    paintHold();
  }
  function stepHold() {
    if (!hold) return;
    hold.frame = 0;
    const t = holdClock();
    const dt = Math.min(64, Math.max(0, t - hold.last));
    hold.last = t;
    if (hold.source === 'pad' && hold.dir > 0 && !padHeld()) hold.dir = -1;
    // filling runs at the hold's pace; a released hold falls back twice as fast
    hold.frac += (dt / hold.ms) * (hold.dir > 0 ? 1 : -2);
    if (hold.frac >= 1) { hold.frac = 1; paintHold(); fireHold(); return; }
    // reduced motion shows the end state at once: no retract travel, the light simply goes out
    if (hold.frac <= 0 && hold.dir < 0) { endHold(); return; }
    paintHold();
    if (typeof requestAnimationFrame === 'function') hold.frame = requestAnimationFrame(stepHold);
  }
  function startHold(source) {
    const key = acceptKey();
    if (!key) return;
    if (hold && hold.done) return;
    if (!hold) hold = { frac: 0, dir: 1, source, ms: acceptHoldMs, last: holdClock(), frame: 0, done: false };
    else { hold.dir = 1; hold.source = source; }
    if (!hold.frame && typeof requestAnimationFrame === 'function') { hold.last = holdClock(); hold.frame = requestAnimationFrame(stepHold); }
    else if (typeof requestAnimationFrame !== 'function') { hold.frac = 1; fireHold(); }
  }
  function releaseHold(source) {
    if (!hold || hold.done || hold.source === 'auto') return;
    if (source && hold.source !== source) return;
    if (reducedMotion()) { endHold(); return; }
    hold.dir = -1;
    if (!hold.frame && typeof requestAnimationFrame === 'function') { hold.last = holdClock(); hold.frame = requestAnimationFrame(stepHold); }
  }
  function fireHold() {
    if (!hold || hold.done) return;
    hold.done = true;
    const key = acceptKey();
    drainAndCommit(key);
  }
  /**
   * The commit beat, in order: the berth flashes hot amber; the lit run retracts berth-to-key
   * into the tether's bead, which flares; the mission commits; and a pulse flies home from the
   * key to the new YOURS row's Track control. Reduced motion skips the travel and commits.
   */
  function drainAndCommit(key) {
    const missionId = key ? key.getAttribute('data-accept') : null;
    const fromRect = key && typeof key.getBoundingClientRect === 'function' ? key.getBoundingClientRect() : null;
    if (routeInstrument && typeof routeInstrument.flashBerth === 'function') {
      try { routeInstrument.flashBerth(); } catch (_) { /* cosmetic */ }
    }
    const commit = () => {
      const acc = key && key.isConnected ? key : acceptKey();
      if (key) key.classList.remove('is-holding');
      endHold();
      if (acc) acceptMission(acc);
      if (missionId && fromRect && !reducedMotion() && typeof setTimeout === 'function') {
        setTimeout(() => flyHomeTrack(missionId, fromRect), 160);
      }
    };
    if (reducedMotion() || typeof requestAnimationFrame !== 'function') { commit(); return; }
    // the retract: the head travels the run backwards, berth to key, in about a quarter second
    const t0 = holdClock();
    const bead = dossierEl.querySelector('.sx-ct-tether__bead');
    const step = () => {
      const t = Math.min(1, (holdClock() - t0) / 260);
      if (hold) { hold.frac = 1 - t; paintHold(); }
      if (t < 1) { requestAnimationFrame(step); return; }
      // the bead takes the light back: it swells as the run lands in it, then settles
      try {
        if (bead && bead.isConnected) {
          bead.setAttribute('r', '4.5');
          setTimeout(() => { if (bead.isConnected) bead.setAttribute('r', '2.5'); }, 280);
        }
      } catch (_) { /* cosmetic */ }
      commit();
    };
    requestAnimationFrame(step);
  }
  /** The last leg of the commit: a pulse from the key to the new YOURS row's Track control. */
  function flyHomeTrack(missionId, fromRect) {
    try {
      const target = activeEl.querySelector(`[data-active-mid="${missionId}"] .sx-job__track`)
        || el.querySelector(`[data-active-mid="${missionId}"] .sx-job__track`);
      if (!target || typeof target.getBoundingClientRect !== 'function') return;
      const tr = target.getBoundingClientRect();
      if (!(tr.width > 0) || !(fromRect.width > 0)) return;
      // fixed overlay, so viewport rects come back in the shell's zoomed px and must be carried
      // into css px before they are drawn
      const dr = dossierEl.getBoundingClientRect();
      const z = dossierEl.offsetWidth > 0 ? dr.width / dossierEl.offsetWidth : 1;
      const zz = Number.isFinite(z) && z > 0 ? z : 1;
      const x1 = (fromRect.left + fromRect.right) / 2 / zz;
      const y1 = (fromRect.top + fromRect.bottom) / 2 / zz;
      const x2 = (tr.left + tr.right) / 2 / zz;
      const y2 = (tr.top + tr.bottom) / 2 / zz;
      const SVG_NS = 'http://www.w3.org/2000/svg';
      const ov = document.createElementNS(SVG_NS, 'svg');
      ov.setAttribute('class', 'sx-ct-flyhome');
      ov.setAttribute('aria-hidden', 'true');
      ov.setAttribute('width', '100vw');
      ov.setAttribute('height', '100vh');
      ov.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:50;overflow:visible;';
      const ex = x2 + Math.abs(y1 - y2) * Math.sign(x1 - x2 || 1);
      const dd = `M ${x1.toFixed(1)} ${y1.toFixed(1)} H ${ex.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      const mk = (name, attrs) => {
        const n = document.createElementNS(SVG_NS, name);
        for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
        return n;
      };
      const id = `sx-ct-flyhome-${Date.now() % 100000}`;
      const trail = mk('path', { d: dd, fill: 'none', stroke: '#f2b950', 'stroke-width': '2', 'stroke-linejoin': 'round', opacity: '.8', id });
      const dot = mk('circle', { r: '3', fill: '#ffd98c' });
      const motion = mk('animateMotion', { dur: '.45s', repeatCount: '1', calcMode: 'spline', keyPoints: '0;1', keyTimes: '0;1', keySplines: '.4 0 .2 1' });
      motion.appendChild(mk('mpath', { href: `#${id}` }));
      dot.appendChild(motion);
      ov.append(trail, dot);
      el.appendChild(ov);
      setTimeout(() => { if (ov.isConnected) ov.remove(); }, 650);
    } catch (_) { /* cosmetic */ }
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
    if (hold && !hold.done) endHold();
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

  // Accept is held, never clicked: pointer down arms, up / cancel / leave lets go; keyboard
  // Enter/Space arms on keydown and lets go on keyup. The click that follows a pointer or key hold
  // belongs to that hold; the pad's A (a synthetic click) arms a hold that lasts while A stays down;
  // a bare activation with nothing held (assistive tech) runs the hold through on its own.
  const onAccept = (ev) => (ev.target && ev.target.closest ? ev.target.closest('.sx-ct-commit[data-accept]:not(:disabled)') : null);
  el.addEventListener('pointerdown', (ev) => { if (onAccept(ev) && ev.button === 0) { pointerAt = holdClock(); startHold('pointer'); } });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    el.addEventListener(type, (ev) => { if (onAccept(ev)) { pointerAt = holdClock(); releaseHold('pointer'); } }, true);
  }
  el.addEventListener('keydown', (ev) => {
    if (!onAccept(ev) || (ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault();
    keyAt = holdClock();
    if (!ev.repeat) startHold('key');
  });
  el.addEventListener('keyup', (ev) => {
    if (!onAccept(ev) || (ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault();
    keyAt = holdClock();
    releaseHold('key');
  });

  el.addEventListener('click', (ev) => {
    const acc = ev.target.closest('[data-accept]');
    if (acc && !acc.disabled) {
      // a held Accept fires from its ring, never from the tap that started the hold
      const t = holdClock();
      if (t - pointerAt < 1500 || t - keyAt < 1500) return;
      startHold(padHeld() ? 'pad' : 'auto');
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
      endHold();
      for (const gauge of standGauges.splice(0)) { try { gauge.dispose(); } catch (_) { /* inert */ } }
      if (tetherTailTimer) { clearTimeout(tetherTailTimer); tetherTailTimer = 0; }
      paintHoldPath = null;
    },
  };
}
