// PQ-139.01 — "Sound tells weight." Collision audio must differ by at least one octave of pitch
// and at least 12 dB between a scout kissing a rock and a freighter broadsiding a station
// (design/FEEL_CONTRACT.md bar B9). Pure routing/math characterization: the AudioContext is never
// created here.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  audio,
  resolveCollisionCue,
  AUDIO_RECIPE_BY_ID,
  COLLISION_CUE,
} from '../src/audio/audioSystem.js';

// Case A — a scout kissing a rock. dp is the exchanged momentum (physics emits it on every
// 'collision'); a 16-mass scout nudging an immovable asteroid at docking speed exchanges only a
// few dozen momentum-units, and a light grazing touch sits at the very bottom of that band. dp 40
// is a bump the player barely feels — the kind of contact that must get QUIETER and higher than
// today's one-recipe-for-everything cue, not a slam.
const SCOUT_KISSES_ROCK = { massA: 16, typeA: 'ship', massB: null, typeB: 'asteroid', dp: 40, impulse: 40 };
// Case B — a heavy freighter (mass 200) ramming an immovable station at speed: the top of the
// real dp range (physics divides trauma by 8000; 24000 is a hull-shattering exchange).
const FREIGHTER_BROADSIDES_STATION = { massA: 200, typeA: 'ship', massB: null, typeB: 'station', dp: 24000, impulse: 24000 };

function octavesBetween(a, b) {
  return Math.log2(a.rate / b.rate);
}

function dbBetween(a, b) {
  return 20 * Math.log10(b.gain / a.gain);
}

test('Sound tells weight: scout-kiss vs freighter-broadside is >= 1 octave and >= 12 dB apart', () => {
  const kiss = resolveCollisionCue(SCOUT_KISSES_ROCK);
  const broadside = resolveCollisionCue(FREIGHTER_BROADSIDES_STATION);
  const octaves = octavesBetween(kiss, broadside);
  const db = dbBetween(kiss, broadside);
  console.log('collision-weight bar cases:');
  console.log('case        recipeId              rate    gain    octaves  dB');
  console.log(
    `kiss        ${kiss.recipeId.padEnd(20)}  ${kiss.rate.toFixed(3)}  ${kiss.gain.toFixed(3)}  ${octaves.toFixed(2)}      ${db.toFixed(2)}`,
  );
  console.log(
    `broadside   ${broadside.recipeId.padEnd(20)}  ${broadside.rate.toFixed(3)}  ${broadside.gain.toFixed(3)}`,
  );
  assert.ok(octaves >= 1.0, `Sound tells weight: pitch must differ by >= 1 octave, got ${octaves.toFixed(3)}`);
  assert.ok(db >= 12, `Sound tells weight: loudness must differ by >= 12 dB, got ${db.toFixed(2)}`);
  assert.equal(kiss.tier, 'kiss', 'Sound tells weight: the kiss case lands on the kiss tier');
  assert.equal(broadside.tier, 'broadside', 'Sound tells weight: the broadside case lands on the broadside tier');
});

test('Sound tells weight: rate is strictly decreasing in acoustic mass at fixed dp', () => {
  const masses = [16, 32, 90, 200, 400];
  let previous = Infinity;
  for (const mass of masses) {
    const cue = resolveCollisionCue({ massA: mass, typeA: 'ship', massB: mass, typeB: 'ship', dp: 400, impulse: 400 });
    assert.equal(cue.acousticMass, mass, 'Sound tells weight: movable bodies use their own mass');
    assert.ok(
      cue.rate < previous,
      `Sound tells weight: rate must strictly decrease with mass (mass ${mass}: ${cue.rate.toFixed(3)} after ${previous.toFixed(3)})`,
    );
    previous = cue.rate;
  }
});

test('Sound tells weight: gain is non-decreasing in dp and strictly increasing somewhere', () => {
  const dps = [40, 400, 4000, 24000];
  const gains = dps.map((dp) => resolveCollisionCue({
    massA: 16, typeA: 'ship', massB: 16, typeB: 'ship', dp, impulse: dp,
  }).gain);
  for (let i = 1; i < gains.length; i++) {
    assert.ok(gains[i] >= gains[i - 1], `Sound tells weight: gain must be non-decreasing in dp (${gains[i]} after ${gains[i - 1]})`);
  }
  assert.ok(gains.some((g, i) => i > 0 && g > gains[i - 1]), 'Sound tells weight: gain must strictly increase somewhere in dp');
});

test('Sound tells weight: absurd inputs stay bounded and zero-dp stays audible', () => {
  const absurd = resolveCollisionCue({ massA: 1e6, typeA: 'ship', massB: 1e6, typeB: 'ship', dp: 1e9, impulse: 1e9 });
  assert.ok(absurd.rate >= COLLISION_CUE.RATE_MIN && absurd.rate <= COLLISION_CUE.RATE_MAX,
    `Sound tells weight: rate stays clamped (${absurd.rate})`);
  assert.ok(absurd.gain <= COLLISION_CUE.GAIN_MAX, `Sound tells weight: gain stays clamped (${absurd.gain})`);
  const silent = resolveCollisionCue({ massA: 16, typeA: 'ship', massB: 16, typeB: 'ship', dp: 0, impulse: 0 });
  assert.ok(Number.isFinite(silent.gain) && silent.gain > 0, 'Sound tells weight: a zero-dp contact still has a finite positive gain');
});

test('Sound tells weight: every tier picks an existing recipe — no invented content', () => {
  const tiers = [
    ['kiss', { massA: 16, typeA: 'ship', massB: null, typeB: 'asteroid', dp: 40, impulse: 40 }],
    ['knock', { massA: 32, typeA: 'ship', massB: 32, typeB: 'ship', dp: 1000, impulse: 1000 }],
    ['slam', { massA: 16, typeA: 'ship', massB: 16, typeB: 'ship', dp: 6000, impulse: 6000 }],
    ['broadside', FREIGHTER_BROADSIDES_STATION],
  ];
  const expected = {
    kiss: 'sfx_dock_clunk',
    knock: 'sfx_mining_impact',
    slam: 'sfx_explosion_small',
    broadside: 'sfx_explosion_large',
  };
  for (const [tier, input] of tiers) {
    const cue = resolveCollisionCue(input);
    assert.equal(cue.tier, tier, `Sound tells weight: input lands on tier ${tier}`);
    assert.ok(AUDIO_RECIPE_BY_ID[cue.recipeId], `Sound tells weight: ${cue.recipeId} exists in AUDIO_RECIPE_BY_ID`);
    assert.equal(cue.recipeId, expected[tier], `Sound tells weight: tier ${tier} rides ${expected[tier]}`);
  }
});

test('Sound tells weight: the same contact always sounds the same (deterministic)', () => {
  const first = resolveCollisionCue(SCOUT_KISSES_ROCK);
  const second = resolveCollisionCue(SCOUT_KISSES_ROCK);
  assert.deepEqual(second, first, 'Sound tells weight: identical inputs give identical cues');
});

test('Sound tells weight: _onCollision plays the resolved cue and never crashes on missing entities', () => {
  const played = [];
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
  const entities = new Map([
    [1, { id: 1, type: 'ship', mass: 200 }],
    [2, { id: 2, type: 'station' }],
  ]);
  host.state = { entities };
  host._onCollision({ aId: 1, bId: 2, dp: 24000, impulse: 24000, pos: { x: 5, z: 6 } });
  assert.equal(played.length, 1, 'Sound tells weight: a real collision plays exactly one cue');
  assert.equal(played[0].recipeId, 'sfx_explosion_large', 'Sound tells weight: a station broadside rides the broadside recipe');
  assert.deepEqual(played[0].opts.position, { x: 5, z: 6 }, 'Sound tells weight: the cue keeps the collision position');
  assert.ok(Number.isFinite(played[0].opts.gain) && Number.isFinite(played[0].opts.rate),
    'Sound tells weight: gain and rate are finite numbers');

  played.length = 0;
  host.state = { entities: new Map() };
  host._onCollision({ aId: 99, bId: 98, dp: 40, impulse: 40, pos: { x: 0, z: 0 } });
  assert.equal(played.length, 1, 'Sound tells weight: an unresolvable collision still plays (never silent)');
  assert.ok(AUDIO_RECIPE_BY_ID[played[0].recipeId], 'Sound tells weight: the fallback cue is an existing recipe');

  played.length = 0;
  host._onCollision(null);
  assert.equal(played.length, 0, 'Sound tells weight: a null payload stays silent');
});

// PQ-139.01 hardening (adversarial review finding d): the tier ladder tested `slammed || heavy`
// BEFORE the kiss threshold, so ANY contact with a station or a heavy hull took the explosion
// recipe — a docking nudge played sfx_explosion_small at gain 0.087. How hard it was picks the
// recipe; how heavy it was picks the pitch.
test('Sound tells weight: touching a station is a LOW clunk, not a whisper-quiet explosion', () => {
  const nudge = resolveCollisionCue({ massA: 16, typeA: 'ship', massB: null, typeB: 'station', dp: 40, impulse: 40 });
  assert.equal(nudge.tier, 'kiss',
    'Sound tells weight: a light contact is a kiss whatever it touched');
  assert.equal(nudge.recipeId, 'sfx_dock_clunk',
    'Sound tells weight: how HARD it was picks the recipe');

  const kissRock = resolveCollisionCue({ massA: 16, typeA: 'ship', massB: null, typeB: 'asteroid', dp: 40, impulse: 40 });
  assert.ok(nudge.rate < kissRock.rate,
    `Sound tells weight: how HEAVY it was picks the pitch — the station clunk (${nudge.rate.toFixed(3)}) is lower than the rock clunk (${kissRock.rate.toFixed(3)})`);

  // The heavy tiers are untouched: a real slam into a station is still a broadside.
  const broadside = resolveCollisionCue({ massA: 200, typeA: 'ship', massB: null, typeB: 'station', dp: 24000, impulse: 24000 });
  assert.equal(broadside.tier, 'broadside', 'Sound tells weight: a real slam is still a broadside');
  const heavyMid = resolveCollisionCue({ massA: 400, typeA: 'ship', massB: 400, typeB: 'ship', dp: 1000, impulse: 1000 });
  assert.equal(heavyMid.tier, 'slam', 'Sound tells weight: a mid-momentum heavy contact is still a slam');
});
