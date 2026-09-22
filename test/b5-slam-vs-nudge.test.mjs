// build_map §22 row B5 — "a 150-unit-per-second slam is not the same answer as an 8-unit nudge."
//
// DONE WHEN (verbatim): "Fixture: hit-stop and trauma are strictly increasing across three
// closing speeds, using pre-solve closing speed. Audio pitch differs by ≥ 1 octave between the
// light kiss and the heavy slam."
//
// Both resolvers are pure data over the receipt — no RNG, no wall clock — so the table is
// identical on every seed; the fixture still prints it on seeds 4242 and 8008, the two the row
// names. The pre-solve channel matters because the solver clamps the receipt's own deltaV/dp
// near mass·40 WU/s: a 150 WU/s ram would otherwise present as a 40 WU/s nudge.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import {
  COLLISION_DELTA_V_FLOOR,
  COLLISION_DELTA_V_REF,
  feel,
  resolveCollisionFeel,
} from '../src/render/feel.js';
import {
  audio,
  resolveCollisionCue,
  AUDIO_RECIPE_BY_ID,
  COLLISION_CUE,
  COLLISION_CUE_COOLDOWN_TICKS,
} from '../src/audio/audioSystem.js';

const SEEDS = [4242, 8008];
// The row's three closing speeds: the nudge floor, a mid knock, the reference slam.
const CLOSING_SPEEDS = [8, 60, 150];
// What the solver reports for the same contacts after its per-tick clamp (MAX_CONTACT_DV = 40).
const SOLVER_CLAMP_DV = 40;
// One ordinary hull pair, held constant so the only variable is how fast they met.
const HULL_MASS = 24;

function contact(overrides = {}) {
  return {
    tick: 120,
    aId: 1,
    bId: 2,
    pos: { x: 40, z: 0 },
    normal: { x: -1, z: 0 },
    ...overrides,
  };
}

function feelHost() {
  const traumas = [];
  const state = {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: 1,
    settings: { video: { motionReduce: false } },
    ui: { screenStack: [], docked: false },
    entities: new Map([
      [1, { id: 1, type: 'ship', mass: HULL_MASS, pos: { x: 0, z: 0 } }],
      [2, { id: 2, type: 'asteroid', mass: 1000, pos: { x: 40, z: 0 } }],
    ]),
    render: { cameraCtrl: { addTrauma: (v) => traumas.push(v) } },
    rng: () => { throw new Error('presentation must not consume sim RNG'); },
  };
  const bus = createBus();
  const host = Object.create(feel);
  host._injectStyle = () => {};
  host._mountVignette = () => {};
  host._ensureVignette = () => null;
  host._updateSpeedLines = () => {};
  host.init({ state, bus, timeEffects: createTimeEffects(state) });
  return { state, bus, host, traumas, frame: (dt = 0) => host.frame(dt, state) };
}

function physicsImpact(closingSpeed, overrides = {}) {
  return {
    consequenceKernelVersion: 1,
    backend: 'rapier-dynamic',
    tick: 120,
    aId: 1,
    bId: 2,
    // The receipt's own momentum is solver-capped at mass·40 — it cannot express the ram.
    dp: HULL_MASS * SOLVER_CLAMP_DV,
    impulse: HULL_MASS * SOLVER_CLAMP_DV,
    playerInvolved: true,
    playerDeltaV: SOLVER_CLAMP_DV,
    preSolveClosingSpeed: closingSpeed,
    pos: { x: 40, z: 0 },
    ...overrides,
  };
}

function collisionCue(closingSpeed) {
  return resolveCollisionCue({
    massA: HULL_MASS, typeA: 'ship',
    massB: HULL_MASS, typeB: 'ship',
    // Live truth: the solver cap lands the same dp whether the ships met at 8 or 150 WU/s.
    dp: HULL_MASS * Math.min(closingSpeed, SOLVER_CLAMP_DV),
    closingSpeed,
  });
}

for (const seed of SEEDS) {
  test(`seed ${seed}: hit-stop and camera trauma strictly increase across closing speeds (pre-solve channel)`, () => {
    const rows = CLOSING_SPEEDS.map((speed) => resolveCollisionFeel(contact(), {
      mode: 'flight',
      playerDistance: 0,
      // The clamped receipt deltaV stays pinned at 40: only the pre-solve speed varies.
      deltaV: SOLVER_CLAMP_DV,
      feelDeltaV: speed,
    }));
    console.log(`[B5 feel ramp] seed=${seed}`);
    console.log('closingSpeed  id              hsDur(ms)  trauma');
    rows.forEach((row, i) => {
      console.log(
        `${String(CLOSING_SPEEDS[i]).padStart(11)}  ${row.id.padEnd(14)}  ${(row.hsDur * 1000).toFixed(1)}      ${row.trauma.toFixed(3)}`,
      );
    });
    assert.deepEqual(rows.map((r) => r.id), ['impact.scrape', 'impact.knock', 'impact.slam']);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i].hsDur > rows[i - 1].hsDur,
        `hit-stop must strictly increase (${rows[i - 1].hsDur} -> ${rows[i].hsDur})`);
      assert.ok(rows[i].trauma > rows[i - 1].trauma,
        `trauma must strictly increase (${rows[i - 1].trauma} -> ${rows[i].trauma})`);
    }
    // The pre-solve channel, not the clamped receipt deltaV, is what the curve reads.
    for (let i = 0; i < CLOSING_SPEEDS.length; i++) {
      assert.deepEqual(rows[i], resolveCollisionFeel(contact(), {
        mode: 'flight', playerDistance: 0, deltaV: CLOSING_SPEEDS[i],
      }), `closing speed ${CLOSING_SPEEDS[i]}: pre-solve must answer exactly like the true speed`);
    }
  });

  test(`seed ${seed}: physics:impact on the live bus scales the beat by preSolveClosingSpeed`, () => {
    const answers = CLOSING_SPEEDS.map((speed) => {
      const { bus, host, traumas, frame } = feelHost();
      bus.emit('physics:impact', physicsImpact(speed));
      frame();
      return { trauma: traumas[0], hsDur: host._hsTimer };
    });
    console.log(`[B5 live receipt] seed=${seed}`);
    answers.forEach((a, i) => console.log(
      `closing ${String(CLOSING_SPEEDS[i]).padStart(3)} WU/s -> trauma ${a.trauma.toFixed(3)}, hit-stop ${(a.hsDur * 1000).toFixed(1)} ms`,
    ));
    for (let i = 1; i < answers.length; i++) {
      assert.ok(answers[i].hsDur > answers[i - 1].hsDur,
        'hit-stop must strictly increase through the physics:impact subscription');
      assert.ok(answers[i].trauma > answers[i - 1].trauma,
        'camera trauma must strictly increase through the physics:impact subscription');
    }
    // A receipt missing the pre-solve field answers like the clamped 40 WU/s it carries —
    // the field, not the row's test setup, is what rescues the ram.
    const { bus, host, traumas, frame } = feelHost();
    bus.emit('physics:impact', physicsImpact(null));
    frame();
    const clamped = resolveCollisionFeel(contact(), {
      mode: 'flight', playerDistance: 0, deltaV: SOLVER_CLAMP_DV,
    });
    assert.equal(host._hsTimer, clamped.hsDur, 'no pre-solve speed -> the solver-clamped answer');
    assert.equal(traumas[0], clamped.trauma);
  });

  test(`seed ${seed}: collision audio pitch drops >= 1 octave from the light kiss to the heavy slam`, () => {
    const cues = CLOSING_SPEEDS.map(collisionCue);
    console.log(`[B5 audio ramp] seed=${seed} — same hull pair, pre-solve closing speed`);
    console.log('closingSpeed  dp(clamped)  rate    forceU  tier   recipeId');
    cues.forEach((cue, i) => console.log(
      `${String(CLOSING_SPEEDS[i]).padStart(11)}  ${String(HULL_MASS * Math.min(CLOSING_SPEEDS[i], SOLVER_CLAMP_DV)).padStart(11)}  ` +
      `${cue.rate.toFixed(3)}   ${cue.forceU.toFixed(3)}   ${cue.tier.padEnd(6)} ${cue.recipeId}`,
    ));
    for (let i = 1; i < cues.length; i++) {
      assert.ok(cues[i].rate < cues[i - 1].rate,
        `pitch must strictly decrease with closing speed (${cues[i - 1].rate} -> ${cues[i].rate})`);
    }
    const octaves = Math.log2(cues[0].rate / cues[cues.length - 1].rate);
    console.log(`[B5 audio bar] seed=${seed} kiss ${cues[0].rate.toFixed(3)} vs slam ${cues[2].rate.toFixed(3)} -> ${octaves.toFixed(2)} octaves`);
    assert.ok(octaves >= 1.0,
      `the kiss and the slam on the same hulls must differ by >= 1 octave, got ${octaves.toFixed(3)}`);
    for (const cue of cues) {
      assert.ok(AUDIO_RECIPE_BY_ID[cue.recipeId], `${cue.recipeId} must be an existing recipe`);
      assert.ok(cue.rate >= COLLISION_CUE.RATE_MIN && cue.rate <= COLLISION_CUE.RATE_MAX);
    }
    // The legacy 'collision' receipt carries no speed field: the dp axis still bends.
    const kissDp = resolveCollisionCue({ massA: HULL_MASS, typeA: 'ship', massB: HULL_MASS, typeB: 'ship', dp: COLLISION_CUE.TIER_KISS_DP });
    const slamDp = resolveCollisionCue({ massA: HULL_MASS, typeA: 'ship', massB: HULL_MASS, typeB: 'ship', dp: 24000 });
    const dpOctaves = Math.log2(kissDp.rate / slamDp.rate);
    console.log(`[B5 audio dp-axis] seed=${seed} dp ${COLLISION_CUE.TIER_KISS_DP} -> ${kissDp.rate.toFixed(3)}, dp 24000 -> ${slamDp.rate.toFixed(3)}: ${dpOctaves.toFixed(2)} octaves`);
    assert.ok(dpOctaves >= 1.0, `the dp fallback axis must also span >= 1 octave, got ${dpOctaves.toFixed(3)}`);
  });
}

test('the audio bend reads the same 8->150 WU/s axis the feel ramp reads', () => {
  assert.equal(COLLISION_CUE.SPEED_TOUCH, COLLISION_DELTA_V_FLOOR,
    'the audio touch floor and the collision-feel floor are one axis');
  assert.equal(COLLISION_CUE.SPEED_SLAM, COLLISION_DELTA_V_REF,
    'the audio slam reference and the collision-feel reference are one axis');
});

test('the live receipt plays the collision cue; the legacy double-emit stays one voice', () => {
  const played = [];
  const ducks = [];
  const state = {
    tick: 200,
    mode: 'flight',
    playerId: 1,
    settings: { audio: { muted: false }, video: {} },
    entities: new Map([
      [1, { id: 1, type: 'ship', mass: HULL_MASS, pos: { x: 0, z: 0 } }],
      [2, { id: 2, type: 'ship', mass: HULL_MASS, pos: { x: 40, z: 0 } }],
    ]),
  };
  const bus = createBus();
  const host = Object.create(audio);
  audio.init.call(host, { state, bus, helpers: {} });
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return { id: played.length }; };
  host._applyWeightDuck = (input) => ducks.push(input);

  // rapier-dynamic publishes physics:impact and never 'collision': the slam must still sound.
  bus.emit('physics:impact', physicsImpact(150, { tick: state.tick }));
  assert.equal(played.length, 1, 'the live receipt plays the collision cue');
  const expected = resolveCollisionCue({
    massA: HULL_MASS, typeA: 'ship', massB: HULL_MASS, typeB: 'ship',
    dp: HULL_MASS * SOLVER_CLAMP_DV, closingSpeed: 150,
  });
  assert.equal(played[0].opts.rate, expected.rate, 'the cue carries the speed-bent rate');
  assert.equal(played[0].opts.ladderId, expected.ladderId);
  assert.equal(ducks.length, 1, 'an audible contact bows the music');

  // The custom backend emits physics:impact AND collision for the same pair in the same tick.
  bus.emit('collision', { aId: 1, bId: 2, dp: HULL_MASS * SOLVER_CLAMP_DV, impulse: 9.6, pos: { x: 40, z: 0 } });
  assert.equal(played.length, 1, 'the legacy twin of the same contact must not double the voice');
  bus.emit('collision', { aId: 2, bId: 1, dp: HULL_MASS * SOLVER_CLAMP_DV, impulse: 9.6, pos: { x: 40, z: 0 } });
  assert.equal(played.length, 1, 'pair order does not make a second contact');

  // A grind re-arms after the pair cooldown; a much harder re-contact interrupts inside it.
  state.tick = 200 + COLLISION_CUE_COOLDOWN_TICKS;
  bus.emit('physics:impact', physicsImpact(60, { tick: state.tick }));
  assert.equal(played.length, 2, 'the same pair on a later tick is a new contact');
  state.tick += 1;
  bus.emit('physics:impact', physicsImpact(150, { tick: state.tick, dp: 24000 }));
  assert.equal(played.length, 3, 'a meaningfully harder re-contact escapes the cooldown');

  // A null payload and a missing-entities payload never crash and never go silent-by-accident.
  bus.emit('physics:impact', null);
  assert.equal(played.length, 3);
  state.tick += COLLISION_CUE_COOLDOWN_TICKS;
  bus.emit('physics:impact', physicsImpact(150, { tick: state.tick, aId: 97, bId: 98 }));
  assert.equal(played.length, 4, 'unresolvable bodies still answer with the fallback cue');
});
