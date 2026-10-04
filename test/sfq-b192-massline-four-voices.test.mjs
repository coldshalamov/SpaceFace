// test/sfq-b192-massline-four-voices.test.mjs — SFQ-B192 done check (packet: make the Massline
// speak load). The gap the packet names — load-tracking tension layer, release vs break — is
// already built on master (masslineInstrument + audioSystem._updateTetherHum + tetherGameplay
// mirror); this test pins the player outcome so a regression cannot land silently:
//
// DONE WHEN, on seed 4242: latch, tension, safe release and break resolve to FOUR distinct
// authored recipe routes (no two sharing a cue id or sample binding); the tension layer tracks
// the constraint load with smoothing and stays under its voice caps; release is a clean let-go
// while break is the discrete snap receipt.
//
// Deterministic — seed 4242 is the ear fixture seed (test/fb-continuous-voices.test.mjs).

import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES, SAMPLE_BINDINGS } from '../src/data/audioRecipes.js';
import { FIRST_HOUR_AUDIO_SIGNATURES } from '../src/audio/audioSystem.js';
import {
  MASSLINE_INSTRUMENT_SEED,
  MASSLINE_RECIPES,
  resolveMasslineInstrument,
  resolveTetherTone,
  TETHER_TONE_SILENCE,
  TETHER_TONE_ATTACK_S,
  TETHER_TONE_RELEASE_S,
} from '../src/audio/masslineInstrument.js';

const SEED = 4242;

// mulberry32 — the fixture's own tiny deterministic RNG so the load walk is reproducible.
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

// The four player moments SFQ-B192 names, resolved through the SAME resolver the live audio
// system calls from _onMasslineInstrument (src/audio/audioSystem.js:5856).
const FOUR_VOICES = Object.freeze([
  { event: 'attach', label: 'latch', payload: { classification: 'clean' } },
  { event: 'strain', label: 'tension', payload: {} },
  { event: 'release', label: 'safe release', payload: { classification: 'clean' } },
  { event: 'break', label: 'break', payload: { reason: 'physics_break' } },
]);

test(`seed ${SEED}: latch, tension, safe release and break are four distinct authored recipe routes`, () => {
  const rng = makeRng(SEED);
  const resolved = FOUR_VOICES.map((moment, i) => {
    // The seeded walk supplies the live load each moment would read off the tether mirror.
    const load = i === 0 ? rng() * 0.2 : i === 1 ? 0.4 + rng() * 0.6 : rng();
    const voice = resolveMasslineInstrument({
      event: moment.event,
      payload: moment.payload,
      tension: load,
      strain: load,
    });
    assert.ok(voice, `${moment.label} must resolve`);
    return { moment, voice, load };
  });

  const recipeIds = resolved.map((r) => r.voice.recipeId);
  const captions = resolved.map((r) => r.voice.caption);
  const bindingIds = recipeIds.map((id) => SAMPLE_BINDINGS[id] && SAMPLE_BINDINGS[id].id);

  // No two sharing a cue id — pairwise.
  for (let i = 0; i < recipeIds.length; i++) {
    for (let j = i + 1; j < recipeIds.length; j++) {
      assert.notEqual(recipeIds[i], recipeIds[j],
        `${resolved[i].moment.label} and ${resolved[j].moment.label} share cue id ${recipeIds[i]}`);
      assert.notEqual(captions[i], captions[j], 'captions must name the moments apart');
      assert.notEqual(bindingIds[i], bindingIds[j], 'sample bindings must be distinct voices');
    }
  }
  // Each route is authored and bound, and all four are audible on the instrument.
  for (let i = 0; i < recipeIds.length; i++) {
    const { moment, voice } = resolved[i];
    assert.ok(recipeById.has(recipeIds[i]), `${moment.label} route ${recipeIds[i]} is an authored recipe`);
    assert.ok(SAMPLE_BINDINGS[recipeIds[i]], `${moment.label} route ${recipeIds[i]} has a sample binding`);
    assert.equal(voice.seed, MASSLINE_INSTRUMENT_SEED);
    assert.equal(voice.play, true, `${moment.label} must be audible`);
    assert.equal(voice.event, moment.event);
  }

  // The four authored routes are exactly the instrument's mapping.
  assert.equal(recipeIds[0], MASSLINE_RECIPES.attach);
  assert.equal(recipeIds[1], MASSLINE_RECIPES.strain);
  assert.equal(recipeIds[2], MASSLINE_RECIPES.release);
  assert.equal(recipeIds[3], MASSLINE_RECIPES.break);

  // Safe release is the taut let-go (higher, lighter); break is the discrete failure snap
  // (heavier, grittier, layered crack+twang — a receipt, not a continuous state).
  const release = resolved[2].voice;
  const broken = resolved[3].voice;
  assert.ok(release.rate > broken.rate, 'release rings higher than the break');
  assert.ok(release.gain < broken.gain, 'release is lighter than the break');
  assert.equal(recipeById.get(MASSLINE_RECIPES.break).type, 'layered', 'break is a layered snap receipt');
  assert.equal(recipeById.get(MASSLINE_RECIPES.release).type, 'oscillator', 'release is a single let-go tone');
  assert.equal(broken.distinctFrom, 'release');
  assert.equal(release.distinctFrom, 'break');

  console.log(`[sfq-b192] seed=${SEED} routes=${recipeIds.join(' | ')}`);
  console.log(`[sfq-b192] bindings=${bindingIds.join(' | ')} captions=${captions.join(' | ')}`);
});

test(`seed ${SEED}: tension is a continuous layer tracking the constraint load, smoothed, under its caps`, () => {
  const rng = makeRng(SEED);

  // Seeded load walk on the tether mirror (tetherGameplay publishes load each tick):
  // latch settles, then rising tension, all while the line is taut.
  const loads = [];
  let load = 0.12 + rng() * 0.08; // latch
  for (let i = 0; i < 24; i++) {
    loads.push(load);
    load = Math.min(1.25, load + 0.02 + rng() * 0.04); // rising tension
  }

  let prev = null;
  for (const l of loads) {
    const tone = resolveTetherTone({
      tether: { active: true, phase: l > 0.72 ? 'overload' : 'loaded', load: l, strain: l },
      towMass: 120,
    });
    assert.equal(tone.playing, true, 'a taut line sings');
    // Load tracking: hz and gain follow the constraint load upward.
    if (prev) {
      assert.ok(tone.hz >= prev.hz, `hum must not fall while load rises (${prev.hz} -> ${tone.hz})`);
      assert.ok(tone.gain >= prev.gain, 'loudness must not fall while load rises');
    }
    // Smoothing: the tone is driven through a finite time-constant ramp, never a step.
    assert.equal(tone.rampS, TETHER_TONE_ATTACK_S);
    assert.ok(tone.rampS > 0, 'attack is a smoothing ramp, not a click');
    // Cap: the layer's loudness is bounded by its authored gain law, however loaded the line.
    assert.ok(tone.gain <= 0.006 + 0.13 + 1e-9, `gain stays under the authored span (got ${tone.gain})`);
    prev = tone;
  }
  // Rising tension must actually be audible as rising: the walk's ends are far apart.
  assert.ok(prev.hz > 90 + 220 * 0.5, 'a loaded line sits high in the hum range');

  // Silence returns when the line is gone: a slack line is exactly silent, with the fast
  // release ramp so silence lands within a tick.
  const slack = resolveTetherTone({
    tether: { active: false, phase: 'slack', load: 0, strain: 0 }, towMass: 400,
  });
  assert.equal(slack.playing, false);
  assert.equal(slack.gain, TETHER_TONE_SILENCE);
  assert.equal(slack.rampS, TETHER_TONE_RELEASE_S);
  assert.ok(slack.hz < prev.hz, 'released hum falls to its base, it does not hold the load');

  // Voice caps on the receipts: the strain warning fires under a cooldown cap and is marked
  // critical, so the global voice budget cannot evict it mid-warning — but the budget cap
  // itself exists to bound total voices.
  const strain = FIRST_HOUR_AUDIO_SIGNATURES.masslineStrain;
  assert.equal(strain.recipeId, MASSLINE_RECIPES.strain);
  assert.ok(strain.cooldownS > 0, `strain receipts are cooldown-capped (${strain.cooldownS}s)`);
  assert.equal(strain.warning, true);
  const latch = FIRST_HOUR_AUDIO_SIGNATURES.masslineLatch;
  assert.equal(latch.recipeId, MASSLINE_RECIPES.attach, 'the latch signature rides the same authored route');
  const voice = resolveMasslineInstrument({ event: 'strain', tension: 1, strain: 1 });
  assert.equal(voice.critical, true, 'tension warnings are critical voices');
  assert.equal(voice.grit, 1, 'max load reads max grit');

  console.log(`[sfq-b192 tension] n=${loads.length} load ${loads[0].toFixed(2)}->${loads[loads.length - 1].toFixed(2)} hz ${resolveTetherTone({ tether: { active: true, phase: 'loaded', load: loads[0], strain: loads[0] } }).hz}->${prev.hz} slackGain=${slack.gain}`);
});
