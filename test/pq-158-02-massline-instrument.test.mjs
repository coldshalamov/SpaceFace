// test/pq-158-02-massline-instrument.test.mjs — PQ-158.02 leaf gate.
//
// DONE WHEN: all massline events audible and distinct; captions name them.
// Seed 15802. Tension→pitch, strain→grit, reel whine, release snap distinct from break, bridle chord.

import test from 'node:test';
import assert from 'node:assert/strict';

import { RECIPES, SAMPLE_BINDINGS } from '../src/data/audioRecipes.js';
import { AUDIO_CUE_TO_RECIPE, audio } from '../src/audio/audioSystem.js';
import {
  MASSLINE_INSTRUMENT_SEED,
  MASSLINE_INSTRUMENT_EVENTS,
  MASSLINE_CAPTIONS,
  MASSLINE_RECIPES,
  resolveMasslineInstrument,
  masslinePitchRate,
  masslineGrit,
  masslineHumHz,
  masslineEventsAreDistinct,
} from '../src/audio/masslineInstrument.js';

const MEASURE_SEED = 15802;
const recipeIds = new Set(RECIPES.map((r) => r.id));

test(`seed ${MEASURE_SEED}: every Massline event has its own recipe, sample binding, and named caption`, () => {
  const distinct = masslineEventsAreDistinct();
  assert.equal(distinct.recipes, true, 'each event must have its own recipe');
  assert.equal(distinct.captions, true, 'captions must name distinct events');
  assert.equal(distinct.releaseVsBreak, true, 'release snap must not be the break');
  for (const event of MASSLINE_INSTRUMENT_EVENTS) {
    const recipeId = MASSLINE_RECIPES[event];
    assert.ok(recipeIds.has(recipeId), `${event} recipe ${recipeId} missing`);
    assert.ok(SAMPLE_BINDINGS[recipeId], `${event} has no sample binding`);
    assert.equal(MASSLINE_CAPTIONS[event].toLowerCase().includes(event === 'bridle' ? 'bridle' : event), true,
      `caption for ${event} must name it: ${MASSLINE_CAPTIONS[event]}`);
    const voice = resolveMasslineInstrument({ event, tension: 0.4, strain: 0.4 });
    assert.equal(voice.seed, MEASURE_SEED);
    assert.equal(voice.recipeId, recipeId);
    assert.equal(voice.caption, MASSLINE_CAPTIONS[event]);
    assert.equal(voice.event, event);
    assert.ok(voice.audible !== false);
  }
  console.log(`[pq-158.02] seed=${MEASURE_SEED} events=${MASSLINE_INSTRUMENT_EVENTS.join(',')} release=${MASSLINE_RECIPES.release} break=${MASSLINE_RECIPES.break}`);
});

test('B9-style table: tension raises pitch, strain raises grit, hum Hz follows the live bed law', () => {
  const rows = [];
  for (const tension of [0, 0.35, 0.7, 1]) {
    const rate = masslinePitchRate(tension);
    const grit = masslineGrit(tension);
    const hz = masslineHumHz(tension);
    rows.push({ tension, rate, grit, hz });
    if (rows.length > 1) {
      assert.ok(rate > rows[rows.length - 2].rate, 'pitch must climb with tension');
      assert.ok(grit >= rows[rows.length - 2].grit, 'grit must climb with strain');
      assert.ok(hz > rows[rows.length - 2].hz, 'hum must climb with strain');
    }
  }
  assert.ok(masslinePitchRate(1) - masslinePitchRate(0) >= 0.5, 'tension span must be musically wide');
  const low = resolveMasslineInstrument({ event: 'strain', tension: 0.1, strain: 0.1 });
  const high = resolveMasslineInstrument({ event: 'strain', tension: 1, strain: 1 });
  assert.ok(high.rate - low.rate >= 0.4, 'loaded strain is a higher string');
  assert.ok(high.grit > low.grit, 'loaded strain is grittier');
  assert.equal(masslineHumHz(0), 90);
  assert.equal(masslineHumHz(1), 310);
  console.log(`[pq-158.02 pitch/grit] ${rows.map((r) => `${r.tension}:${r.rate}/${r.grit}`).join(' ')}`);
});

test('release snap is distinct from break: recipe, caption, and pitch contour', () => {
  const release = resolveMasslineInstrument({ event: 'release', classification: 'clean' });
  const messy = resolveMasslineInstrument({ event: 'release', classification: 'messy' });
  const broken = resolveMasslineInstrument({ event: 'break' });
  assert.equal(release.recipeId, 'sfx_massline_release');
  assert.equal(broken.recipeId, 'sfx.tetherSnap');
  assert.notEqual(release.recipeId, broken.recipeId);
  assert.notEqual(release.caption, broken.caption);
  assert.equal(release.caption, 'Massline release.');
  assert.equal(broken.caption, 'Massline break.');
  assert.ok(release.rate > broken.rate, 'release is the higher taut let-go; break is the lower failure');
  assert.equal(release.play, true);
  assert.equal(messy.play, false, 'messy release stays on the 158.06 snap so the two leaves do not double');
  assert.equal(broken.play, true, 'break is audible on the instrument');
  const releaseRecipe = RECIPES.find((r) => r.id === 'sfx_massline_release');
  const breakRecipe = RECIPES.find((r) => r.id === 'sfx.tetherSnap');
  assert.equal(releaseRecipe.type, 'oscillator');
  assert.equal(breakRecipe.type, 'layered');
  assert.ok(AUDIO_CUE_TO_RECIPE['massline.release'] === 'sfx_massline_release');
  assert.ok(AUDIO_CUE_TO_RECIPE['massline.reel'] === 'sfx_massline_reel_whine');
  assert.ok(AUDIO_CUE_TO_RECIPE['massline.bridle'] === 'sfx_massline_bridle_chord');
});

test('reel, bridle, attach, strain, and break all speak on the instrument', () => {
  const reel = resolveMasslineInstrument({ event: 'reel', before: 40, after: 28, tension: 0.6, strain: 0.5 });
  const bridle = resolveMasslineInstrument({ event: 'bridle' });
  const attach = resolveMasslineInstrument({ event: 'attach' });
  const strain = resolveMasslineInstrument({ event: 'strain', tension: 0.7, strain: 0.7 });
  const broken = resolveMasslineInstrument({ event: 'break' });
  assert.equal(reel.play, true);
  assert.equal(bridle.play, true);
  assert.equal(attach.play, true);
  assert.equal(strain.play, true);
  assert.equal(broken.play, true);
  assert.equal(reel.caption, 'Massline reel.');
  assert.equal(bridle.caption, 'Twin bridle chord.');
  assert.ok(reel.rate > 1, 'a real winch-in is a rising whine');
});

test('_onMasslineInstrument plays all six events and captions them', () => {
  const plays = [];
  const captions = [];
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { plays.push({ recipeId, opts }); return { recipeId }; };
  host.bus = { emit(ev, p) { captions.push({ ev, p }); } };
  host.state = { tick: 40, player: { tether: { active: true, load: 0.6, strain: 0.4 } } };
  host.rt = { _masslineReelLastTick: -1e9 };
  host._onMasslineInstrument('attach', {});
  host._onMasslineInstrument('strain', {});
  host._onMasslineInstrument('reel', { before: 50, after: 30 });
  host._onMasslineInstrument('release', { classification: 'clean' });
  host._onMasslineInstrument('bridle', { headId: 'twin_bridle' });
  host._onMasslineInstrument('break', {});
  const recipes = plays.map((p) => p.recipeId);
  assert.ok(recipes.includes('sfx.tetherLatch'));
  assert.ok(recipes.includes('sfx_tether_strain_creak'));
  assert.ok(recipes.includes('sfx_massline_reel_whine'));
  assert.ok(recipes.includes('sfx_massline_release'));
  assert.ok(recipes.includes('sfx_massline_bridle_chord'));
  assert.ok(recipes.includes('sfx.tetherSnap'), 'break plays on the instrument');
  const texts = captions.filter((c) => c.ev === 'presentation:caption').map((c) => c.p.text);
  assert.ok(texts.includes('Massline attached.'));
  assert.ok(texts.includes('Massline strain.'));
  assert.ok(texts.includes('Massline reel.'));
  assert.ok(texts.includes('Massline release.'));
  assert.ok(texts.includes('Twin bridle chord.'));
  assert.ok(texts.includes('Massline break.'));
  console.log(`[pq-158.02 wiring] plays=${recipes.join(',')} captions=${texts.join(' | ')}`);
});

test('a player cut is not voiced as a cable break', () => {
  const plays = [];
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { plays.push({ recipeId, opts }); return { recipeId }; };
  host.bus = { emit() {} };
  host.state = { tick: 40, player: { tether: { active: true, load: 0.6, strain: 0.4 } } };
  host.rt = { _masslineReelLastTick: -1e9 };
  const bus = {
    handlers: Object.create(null),
    on(ev, fn) { (this.handlers[ev] ||= []).push(fn); },
    emit(ev, p) { for (const fn of this.handlers[ev] || []) fn(p); },
  };
  host.init({ state: host.state, bus, helpers: {} });
  host.play = (recipeId, opts) => { plays.push({ recipeId, opts }); return { recipeId }; };
  plays.length = 0;
  bus.emit('tether:broken', { reason: 'tether_cut' });
  assert.equal(plays.some((p) => p.recipeId === 'sfx.tetherSnap'), false, 'player cut must not play break');
  bus.emit('tether:broken', { reason: 'physics_break' });
  assert.equal(plays.some((p) => p.recipeId === 'sfx.tetherSnap'), true, 'a failed line still snaps');
});
