// src/ui/station/stationMissionModel.js — station mission-board projections.
// Pure, DOM-free mission-board logic shared by station surfaces and checks: the board
// recommendation policy (best next contract or prep blocker), the active-mission reader, and the
// keyboard-activation rule for focusable mission cards.
import { SECTORS } from '../../data/sectors.js';
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
 * Best next contract from the posted slots, or null. Readiness dominates, then reward over risk;
 * the first loop is gated to Risk 0-1 work (prep-gated, never hidden) until a choice is made.
 */
export function recommendMissionBoardOffer(slots = [], state = {}) {
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
