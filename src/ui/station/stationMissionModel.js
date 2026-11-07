// src/ui/station/stationMissionModel.js — station mission-board projections.
// Pure, DOM-free mission-board logic shared by station surfaces and checks: the board
// recommendation policy (best next contract or prep blocker), the active-mission reader, and the
// keyboard-activation rule for focusable mission cards.
import { SECTORS } from '../../data/sectors.js';
import { STORY_BEATS } from '../../data/missions.js';
import { missionPreflight, missionConsequenceSummary } from '../missionPreflight.js';
import { prettyId, prettyType } from './stationHubFormatters.js';
import { missionBoardReadiness } from './stationHubModel.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_BY_ID = new Map();
for (const sec of SECTORS) {
  for (const stn of sec.stations || []) STATION_BY_ID.set(stn.id, stn);
}

/** Count live active jobs (status null/active) from sim state. */
export function activeMissionCount(state) {
  const active = state && state.missions && Array.isArray(state.missions.active) ? state.missions.active : [];
  return active.filter((m) => m && (m.status == null || m.status === 'active')).length;
}

function missionOfferId(m) {
  return m && (m.id != null ? m.id : m.missionId);
}

function missionRiskTier(m) {
  const raw = m && (m.riskTier != null ? m.riskTier : (m.risk != null ? m.risk : 0));
  const risk = Number(raw);
  return Number.isFinite(risk) ? Math.max(0, Math.round(risk)) : 0;
}

function firstLoopNeedsSafeWork(state) {
  const ob = state && state.onboarding;
  if (!ob || ob.finished === true) return false;
  const beatDoneAt = ob.beatDoneAt || {};
  return beatDoneAt.choice == null && activeMissionCount(state) === 0;
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

/**
 * The live spine beat, or null once the book is closed/past the spine. While a beat is live the
 * board does not compete with it: no journey row posted means no recommendation badge at all
 * (B0 and B6 post world work, not board rows), rather than promoting procedural side work.
 */
function liveSpineBeat(state) {
  const story = state && state.story;
  if (!story) return null;
  const flags = story.flags || {};
  if (flags.endgame === true || flags.sandboxContinued === true
    || story.endgameChoice || story.endgameResolved === true) return null;
  const beatIndex = Math.floor(Number(story.beatIndex) || 0);
  if (beatIndex < 0 || beatIndex > 7) return null;
  const def = STORY_BEATS[beatIndex];
  return def && def.beat === beatIndex ? def : null;
}

/**
 * W1 Journey (owner direction 2026-11-06): a campaign47a book/chain/intro offer on the board IS
 * the journey's next step, so it outranks the procedural rows — reward/risk scoring is meaningless
 * for rows whose acceptance floor is the story contract's own. Final-disposition filings are not
 * journey steps (the contracts screen filters them before this runs; the guard repeats that
 * policy here so the model stays safe for any caller). The doubled interdiction contract is
 * explicitly "never a book step" and keeps its own row.
 *
 * The row must belong to the live beat (`campaign47aBeat`) and carry a real id; a stale or
 * unposted tag must not badge as THE BOOK. The first ready row wins over a blocked one; when
 * every posted journey row is blocked, the first blocked row becomes the prep target.
 */
function journeyStepCandidate(slots, state) {
  const beat = liveSpineBeat(state);
  if (!beat) return null;
  const rows = (Array.isArray(slots) ? slots : [])
    .filter((m) => m
      && typeof m.storyTag === 'string'
      && !m.storyDisposition
      && m.storyTag !== 'campaign47a:b4:doubled'
      && (m.storyTag.startsWith('campaign47a:') || m.storyTag === 'story.branch_intro')
      && m.campaign47aBeat != null
      && Math.floor(Number(m.campaign47aBeat)) === beat.beat
      && missionOfferId(m) != null && missionOfferId(m) !== '')
    .map((mission) => {
      const preflight = missionPreflight(mission, state);
      return {
        mission,
        preflight,
        readiness: missionBoardReadiness(preflight),
        consequences: missionConsequenceSummary(mission),
      };
    });
  return rows.find((row) => row.readiness.state !== 'blocked') || rows[0] || null;
}

/**
 * Best next contract from the posted slots, or null. A journey step (the spine's own book job,
 * branch intro, or chain leg) dominates when one is posted; otherwise readiness dominates, then
 * reward over risk; the first loop is gated to Risk 0-1 work (prep-gated, never hidden) until a
 * choice is made. The journey row is exempt from the first-loop gate: it is the authored route,
 * not side work.
 */
export function recommendMissionBoardOffer(slots = [], state = {}) {
  const journey = journeyStepCandidate(slots, state);
  if (journey) {
    const { mission, preflight, readiness, consequences } = journey;
    const risk = missionRiskTier(mission);
    const route = missionDestName(mission || {});
    const reward = consequences.reward || 0;
    const blocked = readiness.state === 'blocked';
    return {
      mission,
      missionId: String(missionOfferId(mission)),
      kind: blocked ? 'warn' : readiness.kind,
      state: readiness.state,
      label: blocked ? 'PREP FIRST' : 'THE BOOK',
      // The badge stays compact; the specific blocker is a separate field the board can paint.
      blocker: blocked ? (preflight.blocker || readiness.title || null) : null,
      title: mission.title || prettyType(mission.type),
      reason: blocked
        ? 'The book posts this job. Prep first: ' + (preflight.blocker || readiness.title || 'clear the blocker') + '.'
        : 'The book posts this job — the journey\'s next step. ' + reward + ' cr, Risk ' + risk + ', ' + route + '.',
      actionLabel: blocked ? 'Resolve Prep' : 'Accept the Book Job',
      disabled: blocked,
    };
  }
  // A live spine with no posted journey row keeps the board quiet. Procedural work stays
  // available as rows; it just does not claim the one recommendation badge.
  if (liveSpineBeat(state)) return null;
  const firstLoopSafeWork = firstLoopNeedsSafeWork(state);
  let candidates = (Array.isArray(slots) ? slots : [])
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
    .filter(Boolean);
  if (firstLoopSafeWork) {
    const safeReady = candidates.filter((candidate) => candidate.risk <= 1 && candidate.readiness.state !== 'blocked');
    if (safeReady.length) candidates = safeReady;
  }
  candidates.sort((a, b) => (b.score - a.score) || (a.risk - b.risk) || (a.index - b.index));

  const best = candidates[0];
  if (!best) return null;
  const firstLoopRiskBlocked = firstLoopSafeWork && best.risk >= 2;
  const blocked = best.readiness.state === 'blocked' || firstLoopRiskBlocked;
  const reason = firstLoopRiskBlocked
    ? 'Prep first: take a Risk 0-1 contract before elevated work. Risk ' + best.risk + ' stays on the board.'
    : missionRecommendationReason(best.mission, best.preflight, best.readiness, best.consequences);
  return {
    mission: best.mission,
    missionId: best.missionId,
    kind: firstLoopRiskBlocked ? 'warn' : best.readiness.kind,
    state: firstLoopRiskBlocked ? 'blocked' : best.readiness.state,
    label: blocked ? 'PREP FIRST' : (best.readiness.state === 'caution' ? 'RECOMMENDED - CHECK' : 'RECOMMENDED'),
    blocker: blocked
      ? (firstLoopRiskBlocked
        ? 'take a Risk 0-1 contract first'
        : (best.preflight.blocker || best.readiness.title || null))
      : null,
    title: best.mission.title || prettyType(best.mission.type),
    reason,
    actionLabel: blocked ? 'Resolve Prep' : 'Accept Recommended',
    disabled: blocked,
  };
}

/**
 * Keyboard activation for focusable mission cards (role=button).
 * Enter/Space on the card itself select it — same path as a body click.
 * Nested native action controls (Accept etc.) must not re-trigger card selection.
 * Returns { missionId } when the key should activate selection; null otherwise.
 */
export function resolveMissionCardKeyboardSelection(ev) {
  if (!ev || (ev.key !== 'Enter' && ev.key !== ' ')) return null;
  const target = ev.target;
  if (!target || typeof target.closest !== 'function') return null;
  const card = target.closest('.st-mission-card');
  // Nested buttons/inputs own their own activation; do not also select the card.
  if (!card || target !== card) return null;
  const mid = card.getAttribute('data-mid');
  if (mid == null || mid === '') return null;
  return { missionId: String(mid) };
}
