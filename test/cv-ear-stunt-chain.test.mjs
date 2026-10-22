// CV-EAR — the stunt chain is audible (build_map §23, slice 3).
// Done-when: a player trick plucks `sfx_stunt_link` one pentatonic step up per combo link,
// NPC/amended tricks and bridges stay silent, a bank lands exactly one `sfx_stunt_bank`, and
// both recipes exist in the registry, distinct from the scoop ladder and the UI voices.
// Drives the real audio owner: init() against a bare state + real bus, play() stubbed —
// no AudioContext is created (the jettison test's pattern).
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { createBus } from '../src/core/eventBus.js';
import { audio, getBusForRecipe } from '../src/audio/audioSystem.js';
import { MODES, resolveScoreIdentity, foldTonic } from '../src/audio/scoreDirector.js';
import { resolveThemeMatrix, scoreStemWeights, swarmChainLift } from '../src/audio/themeMatrix.js';

const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

function hostWith(state, played = []) {
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
  const bus = createBus();
  host.init({ state, bus, helpers: {} });
  return { host, bus };
}

function bareState() {
  return {
    mode: 'flight',
    playerId: 7,
    entities: new Map(),
    entityList: [],
    input: { actions: {} },
    stunts: { combo: { acts: [] } },
  };
}

const trick = (over = {}) => ({ trickId: 'barrel_roll', name: 'Barrel Roll', actorId: 7, ...over });

test('three consecutive player tricks pluck strictly rising steps on the combo ladder', () => {
  const state = bareState();
  const played = [];
  const { bus } = hostWith(state, played);
  for (let i = 0; i < 3; i++) {
    state.stunts.combo.acts.push({ episodeId: `ep${i}` }); // recordTrick commits before the emit
    bus.emit('stunt:trickDetected', trick({ episodeId: `ep${i}` }));
  }
  const links = played.filter((p) => p.recipeId === 'sfx_stunt_link');
  assert.equal(links.length, 3);
  const rates = links.map((p) => p.opts.rate);
  assert.ok(rates[0] < rates[1] && rates[1] < rates[2],
    `the chain must climb — got rates ${rates.join(', ')}`);
  assert.equal(rates[0], 0.5, 'the first link leaves four octaves of audible headroom');
});

test('links 7 through 32 keep climbing; a bank resets the next phrase', () => {
  const state = bareState();
  const played = [];
  const { bus } = hostWith(state, played);
  for (let i = 0; i < 32; i++) {
    state.stunts.combo.acts.push({});
    bus.emit('stunt:trickDetected', trick());
  }
  for (let i = 1; i < played.length; i++) assert.ok(played[i].opts.rate > played[i - 1].opts.rate);
  assert.ok(played[31].opts.rate * 880 < 12000, 'the capacity-length chain remains audible');
  // Combo reset (acts emptied by a bank/decay) drops the next link back to the base note.
  state.stunts.combo.acts = [{}];
  bus.emit('stunt:trickDetected', trick());
  assert.equal(played[32].opts.rate, played[0].opts.rate, 'a reset combo plucks at base rate again');
});

function pitchClass(hz) { return ((Math.round(12 * Math.log2(hz / 440)) % 12) + 12) % 12; }

test('links 1–12 follow two sector modes and rated moments land on the performance grid within 70 ms', () => {
  const phrases = [];
  for (const sector of ['sector_helios_prime', 'sector_sker_haven']) {
    const state = bareState(), played = [];
    const { host, bus } = hostWith(state, played);
    host.rt._scoreIdentity = resolveScoreIdentity(sector);
    host.rt.ctx = { currentTime: 1.003 };
    const identity = host.rt._scoreIdentity;
    for (let i = 0; i < 12; i++) {
      state.stunts.combo.acts.push({});
      bus.emit('stunt:trickDetected', trick());
    }
    const pitches = played.map(p => pitchClass(880 * p.opts.rate));
    phrases.push(pitches);
    const allowed = MODES[identity.mode].map(n => ((n + foldTonic(identity.tonic)) % 12 + 12) % 12);
    assert.ok(pitches.every(p => allowed.includes(p)));
    for (const musicState of ['calm', 'tense', 'combat', 'docked']) {
      host.rt.musicState = musicState;
      for (let i = 0; i < 125; i++) {
        host.rt.ctx.currentTime = 1 + i / 1000;
        host._onCue({ id: 'moment.stinger' });
        const moment = played.at(-1);
        assert.equal(moment.recipeId, 'sfx_moment_stinger');
        assert.equal(pitchClass(110 * moment.opts.rate), ((foldTonic(identity.tonic) % 12) + 12) % 12);
        const wait = moment.opts.startTime - host.rt.ctx.currentTime;
        assert.ok(wait >= -1e-9 && wait <= 0.07, `grid wait ${wait}`);
        assert.equal(moment.opts.startTime, host._stuntGridTime(host.rt.ctx.currentTime));
      }
    }
  }
  assert.notDeepEqual(phrases[0], phrases[1]);
});

test('three bank sizes have three bounded cadences ending in the sector tonic', () => {
  const { host, bus } = hostWith(bareState());
  host.rt.ctx = { currentTime: 10 };
  host.rt._scoreIdentity = resolveScoreIdentity('sector_sker_haven');
  const cadences = [];
  for (const points of [100, 800, 3000]) {
    const notes = [];
    host.play = (recipeId, opts) => notes.push({ recipeId, opts });
    bus.emit('stunt:styleBanked', { points });
    cadences.push(notes);
    assert.equal(notes.filter(n => n.recipeId === 'sfx_stunt_bank').length, 1);
    assert.ok(notes.every(n => n.opts.gain <= 0.85));
    assert.equal(pitchClass(notes[0].opts.rate * 660), 1);
    assert.ok(notes.every(n => n.opts.startTime <= notes[0].opts.startTime));
  }
  assert.deepEqual(cadences.map(n => n.length), [1, 2, 3]);
});

test('deadline fuse quickens on the grid, deduplicates frames, and goes quiet after a bank', () => {
  const state = bareState(), played = [];
  const { host } = hostWith(state, played);
  state.stunts.combo = { acts: [{}], activeCount: 1, deadlineTick: 300 };
  host.rt.ctx = { currentTime: 0 };
  const bins = [0, 0, 0];
  for (let tick = 0; tick < 360; tick++) {
    state.tick = tick;
    host.rt.ctx.currentTime = tick / 60;
    const before = played.length;
    host._tickStuntFuse();
    host._tickStuntFuse();
    assert.ok(played.length - before <= 1, 'one tick per boundary');
    if (tick < 240 || tick >= 300) assert.equal(played.length, before);
    else bins[tick < 264 ? 0 : tick < 285 ? 1 : 2] += played.length - before;
  }
  assert.ok(bins[1] / 21 > bins[0] / 24 && bins[2] / 15 > bins[1] / 21, `${bins} must quicken`);
  for (const note of played) assert.equal(note.opts.startTime, host._stuntGridTime(note.opts.startTime));
  state.tick = 260;
  state.stunts.combo.activeCount = 0;
  const count = played.length;
  host._tickStuntFuse();
  assert.equal(played.length, count);
});

test('five stunt acts lift the real score faders like five swarm kills, then decay on bank', () => {
  const state = bareState();
  const { host, bus } = hostWith(state);
  host.rt.ctx = { currentTime: 0 };
  for (let i = 0; i < 5; i++) {
    state.stunts.combo.acts.push({});
    bus.emit('stunt:trickDetected', trick());
  }
  assert.equal(host._stuntScoreLift(), swarmChainLift(5));
  const base = resolveThemeMatrix({ sectorId: 'sector_helios_prime' });
  const stunt = resolveThemeMatrix({ sectorId: 'sector_helios_prime', swarmLift: host._stuntScoreLift() });
  const swarm = resolveThemeMatrix({ sectorId: 'sector_helios_prime', swarmLift: swarmChainLift(5) });
  const frame = { phase: 'travel', stem: 'A', stemWeights: { A: 1, B: 0.1, C: 0, D: 0 } };
  assert.deepEqual(scoreStemWeights(frame, stunt), scoreStemWeights(frame, swarm));
  assert.ok(scoreStemWeights(frame, stunt).C > scoreStemWeights(frame, base).C);
  state.stunts.combo.acts = [];
  bus.emit('stunt:styleBanked', { points: 600 });
  host.rt.ctx.currentTime = 0.6;
  assert.equal(host._stuntScoreLift(), swarmChainLift(5) / 2);
  host.rt.ctx.currentTime = 1.3;
  assert.equal(host._stuntScoreLift(), 0);
  assert.equal(host.rt._swarmChain || 0, 0, 'stunt presentation never writes swarm counter');
});

test('only the player\'s links speak: NPC tricks, amendments, and bridges stay silent', () => {
  const state = bareState();
  const played = [];
  const { bus } = hostWith(state, played);
  state.stunts.combo.acts.push({});
  bus.emit('stunt:trickDetected', trick({ actorId: 99 }));           // foreign actor
  bus.emit('stunt:trickAmended', trick({ amendment: true }));        // same link upgraded
  bus.emit('stunt:bridge', { trickId: 'near_miss', actorId: 7 });    // Close Shave — bark speaks
  assert.deepEqual(played.map((p) => p.recipeId), [], `silence expected, got ${JSON.stringify(played)}`);
  // Sanity: the same lane DOES speak for a player trick.
  bus.emit('stunt:trickDetected', trick());
  assert.equal(played.length, 1);
});

test('a bank cashes out with exactly one sfx_stunt_bank', () => {
  const state = bareState();
  const played = [];
  const { bus } = hostWith(state, played);
  bus.emit('stunt:styleBanked', { bankId: 3, points: 420 });
  bus.emit('stunt:styleBanked', { bankId: 4, points: 300 });
  assert.deepEqual(played.map((p) => p.recipeId), ['sfx_stunt_bank', 'sfx_stunt_bank']);
  bus.emit('stunt:styleBanked', null);
  assert.equal(played.length, 2, 'a malformed bank payload stays silent');
});

test('both stunt recipes exist on the SFX bus, distinct from the scoop ladder and UI voices', () => {
  for (const id of ['sfx_stunt_link', 'sfx_stunt_bank']) {
    const recipe = recipeById.get(id);
    assert.ok(recipe, `${id} must be registered`);
    assert.equal(getBusForRecipe(recipe, id), 'combat', `${id} must ride the SFX/combat bus`);
    assert.notEqual(recipe.category, 'ui');
    assert.notEqual(recipe.category, 'mining');
  }
  assert.notEqual('sfx_stunt_link', 'sfx_pickup_chime');
  const link = recipeById.get('sfx_stunt_link'), bank = recipeById.get('sfx_stunt_bank'), chime = recipeById.get('sfx_pickup_chime');
  assert.notDeepEqual(link, chime, 'the link pluck is not a renamed scoop chime');
  assert.notDeepEqual(link, bank);
});
