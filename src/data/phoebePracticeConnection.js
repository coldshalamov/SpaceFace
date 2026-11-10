// Read-only connection between Cantor's lesson and CB-9's existing chime floor.
// Neither activity is the four-scanner-fragment Schism archive contract.
import { BELLHOP } from './bellhop.js';
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

export const PHOEBE_CHIME_POST = Object.freeze(sectorLocalToGlobalForSector(BELLHOP.post, BELLHOP.sectorId));
export const PHOEBE_CHIME_RECOGNITION_RANGE = 450;

export function phoebePracticeOutcome(state) {
  const outcome = state?.encounterDirector?.stats?.livedSeen?.scene_struck_bell;
  return outcome === 'a' || outcome === 'b' ? outcome : null;
}

export function livePhoebeTuner(state, candidate) {
  if (state?.world?.currentSectorId !== BELLHOP.sectorId) return null;
  const robot = candidate || state.entityList?.find(e => e?.alive && e.data?.bellhop === true);
  if (!robot || robot.alive !== true || state.entities?.get(robot.id) !== robot
      || robot.data?.bellhop !== true || robot.data.authoredCharacter !== 'bellhop'
      || robot.data.homeSectorId !== BELLHOP.sectorId
      || !Number.isFinite(robot.pos?.x) || !Number.isFinite(robot.pos?.z)
      || Math.hypot(robot.pos.x - PHOEBE_CHIME_POST.x, robot.pos.z - PHOEBE_CHIME_POST.z) > 1000
      || state.story?.flags?.[BELLHOP.goneFlag] === true) return null;
  return robot;
}

export function phoebeChimeStatus(state) {
  const flags = state?.story?.flags || {};
  if (flags[BELLHOP.goneFlag] === true) return { key: 'gone', text: 'CB-9 is gone. The chime crystals keep their own time; there is no tuner to judge a new phrase.' };
  if (flags[BELLHOP.sungFlag] === true) return { key: 'tuned', text: 'Your five-note chime phrase still holds. You can return to hear it; the tuning fee is not paid again.' };
  const raw = flags[BELLHOP.progressFlag];
  const count = Number.isInteger(raw) && raw > 0 && raw < BELLHOP.song.length ? raw : 0;
  return count
    ? { key: `notes_${count}`, text: `CB-9 remembers ${count} of five notes in your current phrase. Continue with the next crystal; a wrong note restarts the phrase.` }
    : { key: 'untuned', text: 'CB-9 tends five chime crystals. Strike them in the right order and follow the tuner’s calls; a wrong note restarts the phrase.' };
}

export function livePhoebeChimeFloor(state, candidate) {
  const robot = livePhoebeTuner(state, candidate);
  if (!robot) return null;
  const seats = new Set();
  for (const entity of state.entityList || []) {
    const data = entity?.data;
    if (!entity?.alive || data?.bellhopCrystal !== true) continue;
    const seat = data.bellhopCrystalIndex;
    if (state.entities?.get(entity.id) !== entity || data.runtimeOwner !== 'bellhop'
        || data.homeSectorId !== BELLHOP.sectorId || !Number.isInteger(seat) || seat < 0 || seat >= 5
        || !Number.isFinite(entity.pos?.x) || !Number.isFinite(entity.pos?.z)
        || Math.hypot(entity.pos.x-PHOEBE_CHIME_POST.x,entity.pos.z-PHOEBE_CHIME_POST.z)>1000
        || seats.has(seat)) return null;
    seats.add(seat);
  }
  return seats.size === BELLHOP.crystalCount ? robot : null;
}

export function phoebePracticeDirection(state) {
  const outcome = phoebePracticeOutcome(state);
  if (!outcome) return null;
  const status = phoebeChimeStatus(state);
  if (status.key === 'gone') return status.text;
  const robot = livePhoebeChimeFloor(state);
  if (!robot) return 'The chime floor lies west of Echo Shrine, but its full tuning set is not available here. This practice lesson has not completed a chime phrase or recovered an archive fragment.';
  // Legacy saves used the same outcomes for an instant choice. A remembered
  // outcome is not proof that this particular historical pilot made a throw.
  const preface = outcome === 'a' ? 'Cantor’s striking lesson is on record.' : 'Your Vael-observer choice is on record; it did not tune a crystal.';
  return `${preface} If you want another task, visit BELLHOP / CB-9 at the five-crystal chime floor west of Echo Shrine. ${status.text} This is played with impacts, not the Shard Sphere’s four scanner fragments.`;
}

export function phoebePracticeRecognition(state, candidate, previousKey = null) {
  const outcome = phoebePracticeOutcome(state);
  if (!outcome) return null;
  const robot = livePhoebeTuner(state, candidate);
  const player = state?.entities?.get(state.playerId);
  if (!outcome || !robot || state.mode !== 'flight' || state.ui?.docked
      || !player?.alive || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)
      || Math.hypot(player.pos.x-robot.pos.x, player.pos.z-robot.pos.z) > PHOEBE_CHIME_RECOGNITION_RANGE) return null;
  const status = phoebeChimeStatus(state);
  const key = `${outcome}:${status.key}`;
  // The tuner owns per-note calls. Do not cover LOWER/HIGHER/THERE with a
  // second long welcome as the phrase advances during this same visit.
  if (previousKey?.startsWith(`${outcome}:`) || !livePhoebeChimeFloor(state, robot)) return null;
  const welcome = outcome === 'a' ? 'CANTOR’S STRIKING LESSON IS ON RECORD. FIVE CRYSTALS THIS TIME.' : 'THE OBSERVER’S PILOT. A BEARING IS NOT A NOTE. YOU MAY STILL PLAY.';
  return { key, text: `${welcome} ${status.text}` };
}
