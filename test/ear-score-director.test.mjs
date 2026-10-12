import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createScoreDirector, nextPhraseBoundary, scoreChordForBar, scaleChord, resolveScoreIdentity,
  scoreIdentitiesAreDistinct, SECTOR_SCORE_IDENTITY, FACTION_SCORE_COLOUR, AFTERMATH_S, ARRIVAL_S,
  phaseStemWeights, STATE_PROGRESSIONS,
} from '../src/audio/scoreDirector.js';
import { resolveThemeMatrix, resolveThemeState, sectorBedToBandIntent } from '../src/audio/themeMatrix.js';

const HOUSE_SEED = 4242;

function run(director, rows, from = 0, dt = 0.1) {
  let t = from;
  const frames = [];
  for (const [seconds, input] of rows) {
    const end = t + seconds;
    for (; t < end - 1e-9; t += dt) frames.push(director.step(input, t));
  }
  return { frames, t };
}

const helios = { sectorId: 'sector_helios_prime' };

test('a session tape tells its story in phases: arrival, travel, threat, fight, aftermath, dock, departure', () => {
  const d = createScoreDirector();
  d.step({ sectorId: 'sector_ceres_belt' }, 0);
  const { frames } = run(d, [
    [2, { sectorId: 'sector_ceres_belt' }],
    [6, helios],
    [ARRIVAL_S + 2, helios],
    [5, { ...helios, threat: 0.45 }],
    [8, { ...helios, threat: 0.9, inCombat: true }],
    [AFTERMATH_S + 2, { ...helios, threat: 0.05 }],
    [6, { ...helios, docked: true }],
    [4, helios],
  ]);
  const order = frames.reduce((acc, f) => (acc.at(-1) === f.phase ? acc : [...acc, f.phase]), []);
  assert.deepEqual(order, ['travel', 'arrival', 'travel', 'threat', 'fight', 'aftermath', 'travel', 'dock', 'departure']);
});

test('intensity follows the real threat, rises fast and resolves slowly after the fight', () => {
  const d = createScoreDirector();
  const quiet = run(d, [[8, helios]]);
  const quietI = quiet.frames.at(-1).intensity;
  const hot = run(d, [[3, { ...helios, threat: 1, inCombat: true, swarmLift: 0.8 }]], quiet.t);
  const hotI = hot.frames.at(-1).intensity;
  const warm = run(createScoreDirector(), [[8, helios], [3, { ...helios, threat: 0.62, inCombat: true }]]).frames.at(-1).intensity;
  assert.ok(hotI > warm + 0.2, `a full fight (${hotI}) must push harder than a skirmish (${warm})`);
  assert.ok(hotI > quietI + 0.5);
  const after = run(d, [[2, { ...helios, threat: 0 }]], hot.t);
  const a = after.frames.at(-1);
  assert.equal(a.phase, 'aftermath');
  assert.ok(a.intensity > quietI && a.intensity < hotI, 'aftermath holds the fight in the air, then lets it go');
  const resolved = run(d, [[AFTERMATH_S + 6, { ...helios, threat: 0 }]], after.t).frames.at(-1);
  assert.equal(resolved.phase, 'travel');
  assert.ok(resolved.intensity < a.intensity);
  // The resolution carries the calm stem in and lets the fight stem's tail thin out.
  const early = phaseStemWeights('aftermath', 0.5, 0.05);
  const late = phaseStemWeights('aftermath', 0.2, 0.95);
  assert.ok(early.C > late.C && late.A > early.A);
});

test('threat hysteresis: a hunter flickering at the band edge does not flap the score', () => {
  const d = createScoreDirector();
  run(d, [[4, helios]]);
  const tape = [];
  for (let i = 0; i < 60; i += 1) tape.push([0.1, { ...helios, threat: i % 2 ? 0.32 : 0.22 }]);
  const { frames } = run(d, tape, 4);
  const changes = frames.filter((f) => f.changed).length;
  assert.equal(changes, 1, 'enters threat once, then holds while the hunter is still near');
  assert.equal(frames.at(-1).phase, 'threat');
});

test('phase changes land on the musical grid; a fight lands within a beat, a resolution on a phrase', () => {
  assert.equal(nextPhraseBoundary(0, 0, 120, 1), 0);
  assert.equal(nextPhraseBoundary(0.1, 0, 120, 1), 2);
  assert.equal(nextPhraseBoundary(2, 0, 120, 1), 2);
  assert.equal(nextPhraseBoundary(4.1, 0, 120, 2), 8);
  const d = createScoreDirector();
  run(d, [[5.3, helios]]);
  const fight = d.step({ ...helios, threat: 0.9, inCombat: true }, 5.3);
  assert.equal(fight.phase, 'fight');
  const beat = 60 / fight.bpm;
  assert.ok(fight.transitionAt >= 5.3 && fight.transitionAt - 5.3 <= beat + 1e-6);
  const settle = run(d, [[0.8, { ...helios, threat: 0 }]], 5.4).frames.find((f) => f.changed);
  assert.equal(settle.phase, 'aftermath');
  assert.ok(settle.transitionAt - settle.since <= (60 / settle.bpm) * 8 + 1e-6);
});

test('each sector is its own key and mode, and the engine home sector keeps the landed song', () => {
  assert.equal(scoreIdentitiesAreDistinct(), true);
  const ids = Object.keys(SECTOR_SCORE_IDENTITY);
  const chordSets = new Set(ids.map((id) => [0, 1, 2, 3].map((b) => scoreChordForBar(SECTOR_SCORE_IDENTITY[id], 'calm', b).tones.join('.')).join('|')));
  assert.equal(chordSets.size, ids.length, 'no two sectors play the same calm progression');
  // A aeolian travel is the engine's own Am9-F-C-G-Dm-G-C-Em roots.
  const aeolian = { tonic: 0, mode: 'aeolian' };
  const roots = STATE_PROGRESSIONS.calm.map((deg) => ((scaleChord(aeolian, deg)[0] % 12) + 12) % 12);
  assert.deepEqual(roots, [0, 8, 3, 10, 5, 10, 3, 7]);
  // Combat raises the leading tone on the dominant in minor modes (E major under A aeolian).
  const v = scoreChordForBar({ tonic: 0, mode: 'aeolian' }, 'combat', 3).tones;
  assert.equal(((v[1] % 12) + 12) % 12, 11, "G# — the raised leading tone over A");
  // Unknown sectors derive a stable identity from the id, not from ambient randomness.
  assert.deepEqual(resolveScoreIdentity('sector_procgen_4242'), resolveScoreIdentity('sector_procgen_4242'));
  assert.equal(Object.keys(FACTION_SCORE_COLOUR).length >= 13, true);
});

test('theme matrix: a committed hunter is a chase (tension stem), and the place intent carries the state read', () => {
  assert.equal(resolveThemeState({ threat: 0.45 }), 'wanted');
  assert.equal(resolveThemeState({ threat: 0.1 }), 'travel');
  const chase = resolveThemeMatrix({ threat: 0.45, sectorId: 'sector_sker_haven', factionId: 'faction_reach' });
  assert.equal(chase.pursuit, true);
  assert.ok(chase.audibleStemWeights.B > chase.audibleStemWeights.A);
  assert.equal(chase.score.id, 'sector_sker_haven');
  assert.equal(chase.factionColour.id, 'faction_reach');
  const intent = sectorBedToBandIntent(chase.bed);
  assert.equal(intent.layer, 'place');
  assert.equal(intent.place.threat, 0.45);
  assert.equal(intent.place.factionId, 'faction_reach');
  assert.equal(intent.bed.kind, 'bed_sker');
  const law = resolveThemeMatrix({ wanted: true, threat: 0.45 });
  assert.equal(law.pursuit, false);
});

test('fixed-seed tape (house seed) is reproducible frame for frame', () => {
  const tape = [];
  let s = HOUSE_SEED;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 400; i += 1) tape.push([0.1, { ...helios, threat: rand() < 0.3 ? rand() : 0, docked: i > 360 }]);
  const a = run(createScoreDirector(), tape).frames.map((f) => `${f.phase}:${f.intensity.toFixed(6)}:${f.transitionAt}`);
  const b = run(createScoreDirector(), tape).frames.map((f) => `${f.phase}:${f.intensity.toFixed(6)}:${f.transitionAt}`);
  assert.deepEqual(a, b);
});

test('one stale zero-threat read mid-fight does not drop the score into its aftermath', () => {
  const d = createScoreDirector();
  const hot = { ...helios, threat: 0.9, inCombat: true };
  const { t } = run(d, [[3, hot]]);
  assert.equal(d.step(helios, t).phase, 'fight');
  assert.equal(d.step(hot, t + 0.1).phase, 'fight');
  assert.equal(d.frame.transitions, 1);
});

test('sector key and mode move the engine note names; A aeolian home is untouched', async () => {
  const { scoreNoteHz } = await import('../src/audio/scoreDirector.js');
  const { noteToHz } = await import('../src/audio/themeCompose.js');
  assert.equal(scoreNoteHz('F', 3, null), noteToHz('F', 3));
  assert.equal(scoreNoteHz('C', 4, { tonic: 0, mode: 'aeolian' }), noteToHz('C', 4));
  // Helios dorian raises the sixth: F becomes F#.
  assert.ok(Math.abs(scoreNoteHz('F', 4, SECTOR_SCORE_IDENTITY.sector_helios_prime) - noteToHz('F#', 4)) < 1e-9);
  // Sker phrygian on Bb: B (2nd) flattens, then everything moves up a half-step: B -> B.
  assert.ok(Math.abs(scoreNoteHz('B', 4, SECTOR_SCORE_IDENTITY.sector_sker_haven) - noteToHz('B', 4)) < 1e-9);
  // Pallas folds its tonic upward (D above A), so the sub bass never sinks below the engine's.
  assert.ok(scoreNoteHz('A', 1, SECTOR_SCORE_IDENTITY.sector_pallas_drift) > noteToHz('A', 1));
});

test('a sector jump out of a fight opens the new sector with its arrival, not the old fight\'s aftermath', () => {
  const d = createScoreDirector();
  const ceres = { sectorId: 'sector_ceres_belt' };
  let { t } = run(d, [[4, helios], [3, { ...helios, threat: 0.9, inCombat: true }]]);
  const { frames } = run(d, [[6, ceres]], t);
  const phases = new Set(frames.map((f) => f.phase));
  assert.ok(!phases.has('aftermath'), 'the old fight does not resolve over the new sector');
  assert.ok(phases.has('arrival'));
  assert.equal(frames.at(-1).sectorId, 'sector_ceres_belt');
});
