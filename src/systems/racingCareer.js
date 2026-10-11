// Local circuit progression. No campaign credits, faction standing or gameplay authority.
import { RACE_LEVELS, practiceContractForLevel, raceContractById } from '../data/raceLevels.js';
import { RACING_PERSONALITIES } from '../ai/racingDriver.js';
import { NEW_GAME_STARTERS } from '../data/newGameDefaults.js';

export const RACING_RIVALS = RACING_PERSONALITIES;

export const RACING_MODES = Object.freeze([
  { id: 'time-trial', name: 'Time trial', description: 'Solo flight against your compatible best ghost.' },
  { id: 'race', name: 'Pack race', description: 'A physical race against two other pilots.' },
  { id: 'cup', name: 'Circuit cup', description: 'Three heats. Keep your hull; change drives between heats.' },
]);
export const RACING_DIFFICULTIES = Object.freeze([
  { id: 'rookie', name: 'Rookie' }, { id: 'club', name: 'Club' }, { id: 'expert', name: 'Expert' },
]);
export const CUP_HEATS = Object.freeze(RACE_LEVELS.map(level => Object.freeze({
  levelId: level.id, name: level.name, contractId: practiceContractForLevel(level.id).id,
})));
const CAREER_KEY = 'spaceface.racingCareer.v1';
const POINTS = Object.freeze([6, 3, 1]);
const COUNT_LIMIT = 1000000, writeStatus = new WeakMap();
const count = value => Number.isInteger(value) && value >= 0 && value <= COUNT_LIMIT;
const serial = value => Number.isSafeInteger(value) && value >= 0;
const knownLevel = value => RACE_LEVELS.some(row => row.id === value);
const knownDifficulty = value => RACING_DIFFICULTIES.some(row => row.id === value);
let cup = null, nextCupId = 1, continuationRead = false;
const validDifficulty = value => RACING_DIFFICULTIES.some(row => row.id === value) ? value : 'club';
const defaultStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const knownStarter = value => NEW_GAME_STARTERS.some(row => row.id === value);
export function normalizeRaceOptions(options = {}) {
  return { raceMode: RACING_MODES.some(row => row.id === options.raceMode) ? options.raceMode : 'time-trial',
    raceDifficulty: validDifficulty(options.raceDifficulty), raceGhostEnabled: options.raceGhostEnabled !== false,
    raceOpponents: options.raceMode === 'race' || options.raceMode === 'cup' ? 2 : 0 };
}

export function currentRacingCup() { return cup; }
export function abandonRacingCup(storage = defaultStorage()) {
  continuationRead = true; cup = null;
  return persistCup(storage);
}

/** Read once per app session. A reload preserves completed heats, never a mid-lap ship. */
export function restoreRacingCup(storage = defaultStorage()) {
  if (continuationRead) return cup;
  continuationRead = true;
  const { career } = readCareer(storage);
  nextCupId = Math.max(nextCupId, (career.cupSerial || 0) + 1);
  if (career.continuation) cup = { ...career.continuation, status: 'ready', saved: true };
  return cup;
}

/** Called only after the player confirms a launch. A canceled dialog cannot spend a heat. */
export function stageRacingCupHeat(contractId, { starter, raceDifficulty } = {}, storage = defaultStorage()) {
  restoreRacingCup(storage);
  if (!cup || cup.status === 'complete') {
    if (contractId !== CUP_HEATS[0].contractId || !knownStarter(starter) || !Number.isSafeInteger(nextCupId)) return null;
    cup = { id: nextCupId++, starter, difficulty: validDifficulty(raceDifficulty), nextHeat: 0,
      points: 0, results: [], status: 'ready', ticket: 0 };
  }
  if (cup.status !== 'ready' || CUP_HEATS[cup.nextHeat]?.contractId !== contractId || cup.starter !== starter
      || cup.difficulty !== validDifficulty(raceDifficulty) || cup.ticket >= Number.MAX_SAFE_INTEGER) return null;
  cup.status = 'racing'; cup.ticket++;
  cup.saved = persistCup(storage);
  return { raceCupId: cup.id, raceCupHeat: cup.nextHeat, raceCupTicket: cup.ticket };
}
export function releaseRacingCupHeat(payload, storage = defaultStorage()) {
  if (!cup || cup.status !== 'racing') return false;
  if (payload?.raceCupId != null && (payload.raceCupId !== cup.id || payload.raceCupTicket !== cup.ticket)) return false;
  cup.status = 'ready';
  cup.saved = persistCup(storage);
  return true;
}

function readContinuation(row, cupSerial) {
  if (!row || !serial(row.id) || row.id < 1 || row.id !== cupSerial || !knownStarter(row.starter)
      || !knownDifficulty(row.difficulty) || !['ready', 'racing'].includes(row.status)
      || !Number.isInteger(row.nextHeat) || row.nextHeat < 0 || row.nextHeat >= CUP_HEATS.length
      || !serial(row.ticket) || row.ticket < row.nextHeat + (row.status === 'racing' ? 1 : 0)
      || !Array.isArray(row.results) || row.results.length !== row.nextHeat) return null;
  const results = [];
  for (let index = 0; index < row.results.length; index++) {
    const result = row.results[index];
    if (result?.name !== CUP_HEATS[index].name || !Number.isInteger(result.position)
        || result.position < 1 || result.position > POINTS.length || result.points !== POINTS[result.position - 1]
        || !Number.isFinite(result.elapsedS) || result.elapsedS <= 0 || result.elapsedS > 36000) return null;
    results.push({ name: CUP_HEATS[index].name, position: result.position, elapsedS: result.elapsedS, points: result.points });
  }
  if (row.points !== results.reduce((total, result) => total + result.points, 0)) return null;
  return { id: row.id, starter: row.starter, difficulty: row.difficulty, nextHeat: row.nextHeat,
    points: row.points, results, status: row.status, ticket: row.ticket };
}

function readCareer(storage) {
  try {
    if (!storage?.getItem) return { career: { cups: {} }, available: false };
    const raw = storage?.getItem?.(CAREER_KEY);
    if (!raw) return { career: { cups: {} }, available: !!storage.setItem };
    if (typeof raw !== 'string' || raw.length > 12000) return { career: { cups: {} }, available: false };
    const data = JSON.parse(raw), cups = {}, career = { cups };
    if (data?.version !== 1 || !data.cups || Array.isArray(data.cups)) return { career, available: false };
    for (const difficulty of RACING_DIFFICULTIES) {
      const row = data.cups[difficulty.id];
      if (Number.isInteger(row?.points) && row.points >= 0 && row.points <= 18
          && Number.isInteger(row?.finishes) && row.finishes > 0 && row.finishes <= 1000000) {
        cups[difficulty.id] = { points: row.points, finishes: row.finishes, medal: cupMedal(row.points) };
      }
    }
    if (serial(data.meetingSerial) && serial(data.lastMeeting) && data.lastMeeting <= data.meetingSerial) {
      career.meetingSerial = data.meetingSerial; career.lastMeeting = data.lastMeeting;
    }
    if (serial(data.cupSerial)) career.cupSerial = data.cupSerial;
    const continuation = readContinuation(data.continuation, career.cupSerial);
    if (continuation) career.continuation = continuation;
    const rivals = {};
    for (const rival of RACING_RIVALS) {
      const row = data.rivals?.[rival.id];
      if (!count(row?.meetings) || !row.meetings || !count(row.wins) || row.wins > row.meetings
          || !knownLevel(row.lastLevelId) || !knownDifficulty(row.lastDifficulty)
          || !['ahead', 'behind', 'retired'].includes(row.lastOutcome)) continue;
      rivals[rival.id] = { meetings: row.meetings, wins: row.wins, lastLevelId: row.lastLevelId,
        lastDifficulty: row.lastDifficulty, lastOutcome: row.lastOutcome };
      if (Number.isFinite(row.lastGapS) && Math.abs(row.lastGapS) <= 36000 && row.lastOutcome !== 'retired') {
        rivals[rival.id].lastGapS = row.lastGapS;
      }
    }
    if (Object.keys(rivals).length) career.rivals = rivals;
    return { career, available: !!storage.setItem };
  } catch { return { career: { cups: {} }, available: false }; }
}
export function readRacingCareer(storage = defaultStorage()) { return readCareer(storage).career; }
function writeCareer(storage, career) {
  let saved = false;
  try {
    if (storage?.setItem) {
      const raw = JSON.stringify({ version: 1, ...career });
      storage.setItem(CAREER_KEY, raw);
      saved = storage.getItem(CAREER_KEY) === raw;
    }
  } catch { /* Recognition is optional; completing a race never depends on storage. */ }
  if (storage && typeof storage === 'object') writeStatus.set(storage, saved);
  return saved;
}
function persistCup(storage, career = readRacingCareer(storage)) {
  nextCupId = Math.max(nextCupId, (career.cupSerial || 0) + 1);
  career.cupSerial = Math.max(career.cupSerial || 0, nextCupId - 1);
  if (cup && cup.status !== 'complete') {
    const { id, starter, difficulty, nextHeat, points, results, status, ticket } = cup;
    career.continuation = { id, starter, difficulty, nextHeat, points, results, status, ticket };
  } else delete career.continuation;
  return writeCareer(storage, career);
}
export function racingRecognitionStatus(storage = defaultStorage()) {
  return !readCareer(storage).available ? 'unavailable' : writeStatus.get(storage) === false ? 'not_stored' : 'ready';
}

/** Local receipt identity only: no simulation, physics, wallet or campaign-save significance.
 * Reserve after launch checks. A monotonic high-water mark rejects every older completion
 * without retaining an unbounded set of UUIDs. Abandoned reservations award nothing. */
export function stageRacingMeeting(storage) {
  const { career, available } = readCareer(storage);
  if (!available || (career.meetingSerial || 0) >= Number.MAX_SAFE_INTEGER) return null;
  career.meetingSerial = (career.meetingSerial || 0) + 1;
  career.lastMeeting ||= 0;
  return writeCareer(storage, career) ? { raceMeetingId: career.meetingSerial } : null;
}

/** Consume only the finalized mission:completed snapshot, after any cup settlement. */
export function recordRaceMeeting(payload, storage) {
  const { career, available } = readCareer(storage);
  if (!available) return { ok: false, saved: false, reason: 'storage_unavailable' };
  const contract = raceContractById(payload?.racingContractId), rows = payload?.raceStandings;
  if (payload?.type !== 'race' || !['race', 'cup'].includes(payload.raceMode)
      || !contract || contract.levelId !== payload.levelId || !knownDifficulty(payload.raceDifficulty)
      || !Number.isFinite(payload.raceElapsedS) || payload.raceElapsedS <= 0 || payload.raceElapsedS > 36000
      || !serial(payload.raceMeetingId) || payload.raceMeetingId < 1
      || payload.raceMeetingId > (career.meetingSerial || 0)
      || !Array.isArray(rows) || rows.length < 2 || rows.length > RACING_RIVALS.length + 1
      || rows.length !== payload.raceEntrants) return { ok: false, saved: false, reason: 'invalid_result' };
  if (payload.raceMeetingId <= (career.lastMeeting || 0)) return { ok: false, saved: false, reason: 'duplicate_or_stale' };
  const player = rows.find(row => row?.id === 'player' && row.player === true);
  if (!player || player.status !== 'finished' || player.position !== payload.racePosition
      || !Number.isFinite(player.elapsedS) || Math.abs(player.elapsedS - payload.raceElapsedS) > 0.011
      || new Set(rows.map(row => row?.id)).size !== rows.length
      || new Set(rows.map(row => row?.position)).size !== rows.length
      || rows.some(row => !Number.isInteger(row?.position) || row.position < 1 || row.position > rows.length
        || !['finished', 'racing', 'dnf'].includes(row.status)
        || (row !== player && !RACING_RIVALS.some(rival => rival.id === row.id))
        || (row.status === 'finished' && (!Number.isFinite(row.elapsedS) || row.elapsedS <= 0 || row.elapsedS > 36000)))) {
    return { ok: false, saved: false, reason: 'invalid_result' };
  }
  const rivals = career.rivals ||= {};
  for (const row of rows) {
    if (row === player) continue;
    const previous = rivals[row.id], won = player.position < row.position;
    rivals[row.id] = { meetings: Math.min(COUNT_LIMIT, (previous?.meetings || 0) + 1),
      wins: Math.min(COUNT_LIMIT, (previous?.wins || 0) + (won ? 1 : 0)),
      lastLevelId: payload.levelId, lastDifficulty: payload.raceDifficulty,
      lastOutcome: row.status === 'dnf' ? 'retired' : won ? 'ahead' : 'behind',
      ...(row.status === 'finished' ? { lastGapS: Math.round((player.elapsedS - row.elapsedS) * 100) / 100 } : {}) };
  }
  career.lastMeeting = payload.raceMeetingId;
  const saved = writeCareer(storage, career);
  return { ok: saved, saved, reason: saved ? 'recorded' : 'storage_failed' };
}
export function cupMedal(points) { return points >= 15 ? 'Gold' : points >= 9 ? 'Silver' : points >= 3 ? 'Bronze' : 'Finish'; }

/** Duplicate receipts, stale attempts and an unfinished heat cannot award cup points. */
export function finishRacingCupHeat(payload, storage = defaultStorage()) {
  if (!cup || cup.status !== 'racing' || payload?.raceCupId !== cup.id
      || payload.raceCupHeat !== cup.nextHeat || payload.raceCupTicket !== cup.ticket
      || payload.racingContractId !== CUP_HEATS[cup.nextHeat]?.contractId
      || !Number.isFinite(payload.raceElapsedS) || payload.raceElapsedS <= 0 || payload.raceElapsedS > 36000
      || !Number.isInteger(payload.racePosition) || payload.racePosition < 1 || payload.racePosition > 3) return null;
  const points = POINTS[payload.racePosition - 1];
  cup.results.push({ name: CUP_HEATS[cup.nextHeat].name, position: payload.racePosition,
    elapsedS: payload.raceElapsedS, points });
  cup.points += points; cup.nextHeat++;
  cup.status = cup.nextHeat === CUP_HEATS.length ? 'complete' : 'ready';
  if (cup.status === 'complete') {
    cup.medal = cupMedal(cup.points);
    const career = readRacingCareer(storage), previous = career.cups[cup.difficulty];
    career.cups[cup.difficulty] = { points: Math.max(previous?.points || 0, cup.points),
      finishes: Math.min(1000000, (previous?.finishes || 0) + 1) };
    cup.saved = persistCup(storage, career);
  } else cup.saved = persistCup(storage);
  return cup;
}
