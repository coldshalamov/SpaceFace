import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  audio,
  anchorSnareCaption,
  DEATH_CAPTION,
  discoveryMotifVoices,
  fieldDeployRecipe,
  fieldLifeCaption,
  keyedIntervalRate,
  missionMomentCaption,
  payoffCaption,
  RESPAWN_CAPTION,
  saleCaption,
} from '../src/audio/audioSystem.js';
import { stuntScoreBpm } from '../src/audio/stuntScore.js';
import { jumpTollCr, resolveGalaxyMapPrimaryAction } from '../src/ui/galaxyMap.js';
import { attractFlashSize } from '../src/render/titleAttractStage.js';
import { resolveGateVerdictRingRate } from '../src/render/infrastructureMotion.js';
import { emitAdmittedRecipeCaption } from '../src/audio/recipeCaptions.js';

function earWith(state) {
  const bus = createBus();
  const captions = [];
  const plays = [];
  bus.on('presentation:caption', (p) => captions.push(p));
  const ear = Object.create(audio);
  ear.init({ state, bus });
  ear.play = (recipeId, opts) => {
    plays.push({ recipeId, opts: opts || {} });
    return { recipeId };
  };
  ear._duckMusic = () => {};
  ear._triggerHush = () => {};
  return { ear, bus, captions, plays };
}

const quietState = {
  tick: 1,
  simTime: 1,
  settings: { accessibility: { captions: true, audioCues: true } },
  player: { heat: 0 },
  entities: new Map(),
  entityList: [],
};

test('payoff stingers name themselves, and two deeds in one tick each speak once', () => {
  assert.equal(payoffCaption('tech:researched', { nodeId: 'node_a' }), 'Research complete.');
  assert.equal(payoffCaption('ship:purchased', {}), 'Ship purchased.');
  assert.equal(payoffCaption('ship:purchased', { name: 'Hitch' }), 'Ship purchased: Hitch.');
  assert.equal(payoffCaption('achievement:unlocked', { name: 'First Blood' }), 'Achievement: First Blood.');
  assert.equal(payoffCaption('career:ladder:completed', {}), 'Rank attained.');
  const { ear, bus, captions } = earWith(quietState);
  try {
    bus.emit('achievement:unlocked', { name: 'First Blood' });
    bus.emit('career:ladder:completed', { ladderId: 'hauler' });
    bus.flush();
    assert.deepEqual(captions.map((c) => c.text), ['Achievement: First Blood.', 'Rank attained.']);
  } finally {
    ear.destroy();
  }
});

test('seed 4242 death speaks once and respawn speaks once, not twice for the fifth', () => {
  const { ear, bus, captions, plays } = earWith({ ...quietState, simTime: 4242 / 60 });
  const deferred = [];
  ear._defer = (fn) => { deferred.push(fn); };
  try {
    bus.emit('player:death', { cause: 'hull' });
    bus.emit('player:respawn', {});
    bus.flush();
    while (deferred.length) deferred.shift()();
    const death = captions.filter((c) => c.text === DEATH_CAPTION);
    const back = captions.filter((c) => c.text === RESPAWN_CAPTION);
    assert.equal(death.length, 1);
    assert.equal(death[0].assertive, true);
    assert.equal(back.length, 1);
    assert.equal(captions.length, 2);
    assert.equal(plays.filter((p) => p.recipeId === 'sfx_player_death').length, 1);
    assert.equal(plays.filter((p) => p.recipeId === 'sfx_respawn_chime').length, 2);
    for (const play of plays) assert.equal(play.opts.captionOwned, true);
  } finally {
    ear.destroy();
  }
});

test('a settled sale says credits landed and a buy stays quiet', () => {
  assert.equal(saleCaption({ side: 'sell', profit: 12 }), 'Credits received.');
  assert.equal(saleCaption({ side: 'buy', profit: 12 }), null);
  const { ear, bus, captions } = earWith(quietState);
  try {
    bus.emit('economy:tradeCompleted', { side: 'sell', profit: 40 });
    bus.emit('economy:tradeCompleted', { side: 'buy', profit: 10 });
    bus.flush();
    assert.deepEqual(captions.map((c) => c.text), ['Credits received.']);
  } finally {
    ear.destroy();
  }
});

test('seed 4242 a recipe line does not stack on a caption the moment already owns', () => {
  const captions = [];
  const owner = {
    state: { settings: { accessibility: { captions: true } }, entities: new Map(), simTime: 4242 },
    rt: {},
    _emitPresentationCaption(text) { captions.push(text); },
  };
  const recipe = { category: 'cue' };
  emitAdmittedRecipeCaption(owner, 'sfx_wanted_alert', recipe, {}, 'cue');
  emitAdmittedRecipeCaption(owner, 'sfx_respawn_chime', recipe, {}, 'cue');
  emitAdmittedRecipeCaption(owner, 'sfx_player_death', recipe, {}, 'cue');
  assert.deepEqual(captions, ['You are wanted.', 'Respawn chime.', 'Player death.']);
  captions.length = 0;
  emitAdmittedRecipeCaption(owner, 'sfx_wanted_alert', recipe, { captionOwned: true }, 'cue');
  emitAdmittedRecipeCaption(owner, 'sfx_respawn_chime', recipe, { captionOwned: true }, 'cue');
  emitAdmittedRecipeCaption(owner, 'sfx_player_death', recipe, { captionOwned: true }, 'cue');
  emitAdmittedRecipeCaption(owner, 'sfx_snare_arm_tick', recipe, { captionOwned: true }, 'cue');
  assert.deepEqual(captions, []);
});

test('seed 4242 an anchor snare speaks once at the hull and a player well does not use that path', () => {
  const entities = new Map([[7, { id: 7, pos: { x: 12, z: -4 } }]]);
  const { ear, bus, captions, plays } = earWith({ ...quietState, entities });
  try {
    bus.emit('fields:anchorRegistered', { kind: 'anchorSnare', sourceId: 7, fieldId: 'field_anchor_7' });
    bus.emit('fields:anchorRegistered', { kind: 'well', sourceId: 7, fieldId: 'field_player' });
    bus.flush();
    assert.equal(anchorSnareCaption({ kind: 'well' }), null);
    assert.equal(captions.length, 1);
    assert.equal(captions[0].text, 'Anchor snare.');
    assert.equal(plays.length, 1);
    assert.equal(plays[0].recipeId, fieldDeployRecipe('well'));
    assert.deepEqual(plays[0].opts.position, { x: 12, z: -4 });
  } finally {
    ear.destroy();
  }
});

test('field lifecycle captions name deploy, warning, and collapse once each', () => {
  const { ear, bus, captions, plays } = earWith(quietState);
  try {
    bus.emit('massSeed:deployed', { spawnPos: { x: 1, z: 2 } });
    bus.emit('massSeed:warning', { seedId: 3 });
    bus.emit('massSeed:collapsing', { seedId: 3 });
    bus.flush();
    assert.equal(plays.length, 3);
    for (const play of plays) assert.equal(play.opts.captionOwned, true);
    assert.equal(fieldLifeCaption('massSeed:warning').assertive, true);
    assert.deepEqual(captions.map((c) => c.text), [
      'Mass seed deployed.',
      'Seed unstable.',
      'Seed collapses.',
    ]);
    assert.equal(captions[1].assertive, true);
    assert.equal(missionMomentCaption('mission:accepted'), 'Mission accepted.');
    bus.emit('mission:accepted', {});
    bus.emit('mission:completed', {});
    bus.flush();
    assert.deepEqual(captions.slice(3).map((c) => c.text), ['Mission accepted.', 'Mission complete.']);
  } finally {
    ear.destroy();
  }
});

test('slam and chain climb sit on the grid and move with the sector key', () => {
  assert.equal(keyedIntervalRate(1.122, 880, 440) / keyedIntervalRate(1, 880, 440), 1.122);
  assert.notEqual(keyedIntervalRate(0.8, 880, 440), keyedIntervalRate(0.8, 440, 440));
  // Each cue owns the stinger family for its cooldown, so the two keys are separate ears.
  // Each ear needs its own runtime. A shared state object shares audioRuntime,
  // and the stinger family then drops the second cue.
  const isolated = () => {
    const state = { ...quietState, entities: new Map() };
    delete state.audioRuntime;
    return state;
  };
  const high = earWith(isolated());
  const low = earWith(isolated());
  try {
    high.ear._stuntGridTime = () => 8;
    high.ear._noteFreq = () => 880;
    high.bus.emit('audio:cue', { id: 'swarm.slamStinger', gain: 0.45, rate: 0.8 });
    high.bus.flush();
    low.ear._stuntGridTime = () => 8;
    low.ear._noteFreq = () => 440;
    low.bus.emit('audio:cue', { id: 'swarm.chainTier', gain: 0.5, rate: 1.122 });
    low.bus.flush();
    assert.equal(high.plays.length, 1);
    assert.equal(low.plays.length, 1);
    assert.equal(high.plays[0].opts.startTime, 8);
    assert.equal(high.plays[0].opts.lockRate, true);
    assert.equal(high.plays[0].opts.rate, keyedIntervalRate(0.8, 880, 440));
    assert.equal(low.plays[0].opts.startTime, 8);
    assert.equal(low.plays[0].opts.rate, keyedIntervalRate(1.122, 440, 440));
    assert.notEqual(high.plays[0].opts.rate, low.plays[0].opts.rate);
  } finally {
    high.ear.destroy();
    low.ear.destroy();
  }
});

test('discovery motif notes land on grid sixteenths and two keys differ', () => {
  const sixteenth = 60 / stuntScoreBpm('explore') / 4;
  const low = discoveryMotifVoices((note) => (note === 'C' ? 523 : note === 'E' ? 659 : 784), 4, sixteenth, 523);
  const high = discoveryMotifVoices((note) => (note === 'C' ? 392 : note === 'E' ? 494 : 587), 4, sixteenth, 523);
  assert.equal(low.length, 3);
  assert.equal(low[0].startTime, 4);
  assert.equal(low[1].startTime, 4 + sixteenth);
  assert.equal(low[2].startTime, 4 + 2 * sixteenth);
  assert.notEqual(low[1].rate, high[1].rate);
  const { ear, plays } = earWith(quietState);
  try {
    ear._stuntGridTime = () => 4;
    ear._noteFreq = (note) => (note === 'C' ? 523 : note === 'E' ? 659 : 784);
    ear.rt.musicState = 'explore';
    ear._onDiscoveryUnlocked({ sectorId: 'sector_helios_prime', poiId: 'poi_test' });
    assert.equal(plays.length, 3);
    assert.equal(plays[0].opts.startTime, 4);
    assert.equal(plays[2].opts.startTime, 4 + 2 * sixteenth);
    assert.equal(plays.every((p) => p.recipeId === 'sfx_discovery_plate_note'), true);
  } finally {
    ear.destroy();
  }
});

test('Helios to Ceres names the toll and Helios to Vesta does not', () => {
  const state = {
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: {
        sector_helios_prime: {
          id: 'sector_helios_prime',
          neighbors: ['sector_ceres_belt', 'sector_tethys_junction', 'sector_vesta_forge'],
        },
      },
    },
    entities: new Map(),
    playerId: 1,
  };
  const ceres = resolveGalaxyMapPrimaryAction(state, {
    kind: 'sector', id: 'sector_ceres_belt', name: 'Ceres Belt',
  });
  const vesta = resolveGalaxyMapPrimaryAction(state, {
    kind: 'sector', id: 'sector_vesta_forge', name: 'Vesta Forge',
  });
  assert.equal(ceres.label, 'Set Course & Jump');
  assert.equal(ceres.tollCr, jumpTollCr(state, 'sector_ceres_belt'));
  assert.equal(ceres.tollCr, 194);
  assert.equal(ceres.tollLine, '194 cr toll');
  assert.equal(vesta.label, 'Set Course & Jump');
  assert.equal(vesta.tollCr, 0);
  assert.equal(vesta.tollLine, '');
});

test('title attract impact blooms shrink under flash reduction and restore when it is off', () => {
  assert.equal(attractFlashSize(7, true), 1.6);
  assert.equal(attractFlashSize(7, false), 7);
  assert.equal(attractFlashSize(1.2, true), 1.2);
});

test('live gate verdicts move the rings: hostile stops, toll and scan wait, silence does not', () => {
  const base = 0.2;
  assert.equal(resolveGateVerdictRingRate(base, 'hostile'), base * 0.35);
  assert.equal(resolveGateVerdictRingRate(base, 'mts_toll'), base * 0.85);
  assert.equal(resolveGateVerdictRingRate(base, 'scn_scan'), base * 0.85);
  assert.equal(resolveGateVerdictRingRate(base, 'queue'), base * 0.85);
  assert.equal(resolveGateVerdictRingRate(base, 'silent'), base);
  assert.equal(resolveGateVerdictRingRate(base, 'pass'), base * 1.65);
});
