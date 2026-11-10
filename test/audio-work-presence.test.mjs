import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveAudioWorkPresence, AUDIO_WORK_RADIUS_WU, AUDIO_WORK_SATURATION,
} from '../src/audio/audioSystem.js';
import { resolveThemeMatrix, sectorBedToBandIntent } from '../src/audio/themeMatrix.js';
import { createScoreDirector, phaseRoomMix, ARRIVAL_S } from '../src/audio/scoreDirector.js';

// House seed 4242 convention: these tests use fixed geometry only — the read is positional.
const player = { id: 1, alive: true, type: 'ship', team: 1, pos: { x: 0, z: 0 }, data: {} };

function ship(id, x, z, data = {}, alive = true, type = 'ship') {
  return { id, alive, type, team: 3, pos: { x, z }, data };
}

function stateWith(...entities) {
  const list = [player, ...entities];
  return {
    entities: new Map(list.map((e) => [e.id, e])),
    entityList: list,
  };
}

test('an empty pocket is not work', () => {
  const read = resolveAudioWorkPresence(stateWith(), player, []);
  assert.equal(read.working, false);
  assert.equal(read.actors, 0);
  assert.equal(read.presence, 0);
});

test('a crew at the face makes the pocket work; count saturates the presence', () => {
  const miner = ship(10, 300, 0, { jobKind: 'miner', jobPhase: 'work' });
  const read = resolveAudioWorkPresence(stateWith(miner), player, []);
  assert.equal(read.working, true);
  assert.equal(read.actors, 1);
  assert.ok(read.presence > 0 && read.presence < 1);
  const pocket = resolveAudioWorkPresence(stateWith(
    ship(10, 300, 0, { jobKind: 'miner', jobPhase: 'work' }),
    ship(11, -200, 150, { jobKind: 'hauler', jobPhase: 'load' }),
    ship(12, 100, -450, { jobKind: 'salvor', jobPhase: 'unload' }),
    ship(13, 60, 60, { jobKind: 'tender', jobPhase: 'work' }),
  ), player, []);
  assert.equal(pocket.actors, AUDIO_WORK_SATURATION, 'the count saturates — the mix cannot climb forever');
  assert.equal(pocket.presence, 1);
});

test('lanes, patrols, corpses, and the far field are not work', () => {
  const read = resolveAudioWorkPresence(stateWith(
    ship(20, 100, 0, { jobKind: 'hauler', jobPhase: 'transit' }),   // in the lane, not at a face
    ship(21, -150, 0, { jobKind: 'miner', jobPhase: 'return' }),   // done for the day
    ship(22, 0, 200, { jobKind: 'patrol', jobPhase: 'work' }),     // guards are not din
    ship(23, 50, 50, { jobKind: 'miner', jobPhase: 'work' }, false), // dead crews are silent
    ship(24, AUDIO_WORK_RADIUS_WU + 200, 0, { jobKind: 'miner', jobPhase: 'work' }),
    ship(25, 80, -80, { jobKind: 'miner' }),                        // kind without a phase stamp
  ), player, []);
  assert.equal(read.working, false);
  assert.equal(read.actors, 0);
});

test('the theme matrix carries the work read into the place intent the director steps', () => {
  const theme = resolveThemeMatrix({ working: true, workPresence: 0.8, sectorId: 'sector_ceres_belt' });
  const place = sectorBedToBandIntent(theme.bed).place;
  assert.equal(place.working, true);
  assert.equal(place.workPresence, 0.8);
  const quiet = resolveThemeMatrix({ sectorId: 'sector_ceres_belt' });
  assert.equal(sectorBedToBandIntent(quiet.bed).place.working, false);
  assert.equal(sectorBedToBandIntent(quiet.bed).place.workPresence, 0);
});

test('the director spends its authored work phase on a real pocket, scaled by the crews present', () => {
  const d = createScoreDirector();
  // Past the arrival window: a fresh sector read starts on arrival, so the work read is
  // judged after the door opens (arrivalS is the authored precedence the unit keeps).
  d.step({ sectorId: 'sector_ceres_belt', working: true, workPresence: 1 }, ARRIVAL_S + 30);
  const frame = d.step({ sectorId: 'sector_ceres_belt', working: true, workPresence: 1 }, ARRIVAL_S + 30.1);
  assert.equal(frame.phase, 'work');
  assert.ok(frame.stemWeights.B > 0, 'the work register brings its authored stem up');
  assert.ok(frame.room.events > 1, 'a full pocket pulses the place events denser than travel');
  const lone = phaseRoomMix('work', 0.3, 1, 1 / AUDIO_WORK_SATURATION);
  const full = phaseRoomMix('work', 0.3, 1, 1);
  assert.ok(lone.events < full.events && lone.events > 0.7, 'the room scales with presence, not a switch');
  assert.ok(full.level > lone.level);
  // Phase changes debounce (0.3 s): the pocket emptying holds 'work' for one pending window,
  // then releases to travel — the same smoothing every other phase exit already gets.
  d.step({ sectorId: 'sector_ceres_belt' }, ARRIVAL_S + 30.2);
  const empty = d.step({ sectorId: 'sector_ceres_belt' }, ARRIVAL_S + 30.6);
  assert.equal(empty.phase, 'travel');
});

test('work never outranks a fight, the law, or the dock', () => {
  const busy = { sectorId: 'sector_ceres_belt', working: true, workPresence: 1 };
  const d = createScoreDirector();
  assert.equal(d.step({ ...busy, threat: 0.9, inCombat: true }, 10).phase, 'fight');
  const d2 = createScoreDirector();
  assert.equal(d2.step({ ...busy, wanted: true }, 10).phase, 'threat');
  const d3 = createScoreDirector();
  assert.equal(d3.step({ ...busy, docked: true }, 10).phase, 'dock');
});
