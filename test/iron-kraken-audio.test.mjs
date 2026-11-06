import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { IRON_KRAKEN_AUDIO_RECIPES } from '../src/data/ironKrakenAudio.js';
import { IRON_KRAKEN_PROFILES } from '../src/data/ironKraken.js';
import { bindIronKrakenAudio, resolveIronKrakenAudioCue, IRON_KRAKEN_AUDIO_MEMORY_LIMIT } from '../src/audio/ironKrakenAudio.js';
import { AUDIO_RECIPE_BY_ID, getBusForRecipe } from '../src/audio/audioSystem.js';
import { playRecipe } from '../src/audio/synth.js';
import { createCapitalBossFight, stepCapitalBossFight } from '../src/combat/capitalBossScore.js';

function fixture(variant = 'heavy') {
  const p = IRON_KRAKEN_PROFILES[variant], bus = createBus();
  const boss = { id: 'kraken', alive: true, hull: p.hull, hullMax: p.hull,
    pos: { x: 110, z: -35 }, rot: .2, radius: p.coreRadius };
  const target = { id: 'pilot', alive: true, hull: 100, hullMax: 100,
    pos: { x: 30, z: 40 }, radius: 12 };
  const fight = createCapitalBossFight({ encounterId: p.scoreId, fightId: 'sound:kraken', bossId: boss.id, targetId: target.id });
  const calls = [], dropped = [];
  const state = { tick: 1, simTime: 1 / 60, mode: 'flight', playerId: target.id,
    entities: new Map([[boss.id, boss], [target.id, target]]),
    capitalBossEncounters: { fights: { [fight.fightId]: fight } } };
  const rt = { ctx: { state: 'running', currentTime: 0 }, voices: [], _paused: false };
  const host = { state, rt, bus, muted: false, _isMuted() { return this.muted; },
    play(recipeId, options) {
      assert.ok(AUDIO_RECIPE_BY_ID[recipeId], 'every live call must resolve through the production registry');
      const voice = { recipeId, stopAt: rt.ctx.currentTime + .7 };
      calls.push({ recipeId, options }); rt.voices.push(voice); return voice;
    },
    _dropVoiceAt(index) { dropped.push(rt.voices[index]); rt.voices.splice(index, 1); },
  };
  const dispose = bindIronKrakenAudio(host);
  const tell = (id = 'cast:1', beatId = 'arm_rake') => {
    fight.phase = 'tell'; fight.cast = { id, beatId, startedAt: 0, fired: false };
    return { fightId: fight.fightId, encounterId: p.scoreId, beatId, castId: id, tick: state.tick };
  };
  return { host, state, rt, bus, boss, target, fight, calls, dropped, dispose, tell };
}

for (const variant of ['heavy', 'colossus']) test(`native ${variant} score reaches all five mechanical sound recipes`, () => {
  const run = fixture(variant);
  try {
    for (let tick = 0; tick < 3000; tick++) {
      run.state.tick = tick; run.state.simTime = tick / 60; run.rt.ctx.currentTime = tick / 60;
      const events = stepCapitalBossFight(run.fight, { tick, simTime: tick / 60,
        boss: run.boss, target: run.target, active: true });
      for (const event of events) run.bus.emit(`capitalBoss:${event.type}`, event);
      if (new Set(run.calls.map(c => c.recipeId)).size === 5) break;
    }
    assert.deepEqual(new Set(run.calls.map(c => c.recipeId)), new Set(IRON_KRAKEN_AUDIO_RECIPES.map(r => r.id)));
    for (const call of run.calls) {
      assert.deepEqual(call.options.position, run.boss.pos);
      assert.equal(call.options.entityId, run.boss.id);
      assert.equal(call.options.captionOwned, true, 'existing encounter receipts own the text');
      assert.equal(call.options.lockRate, true);
    }
  } finally { run.dispose(); }
});

test('tracking and lock repeat one tell; attack and recovery are separate, deduplicated stages', () => {
  const run = fixture();
  try {
    const payload = run.tell();
    const before = JSON.stringify(run.fight);
    for (let i = 0; i < 9; i++) run.bus.emit('capitalBoss:telegraph', { ...payload, locked: i > 5 });
    assert.equal(run.calls.length, 1);
    assert.equal(JSON.stringify(run.fight), before);
    run.fight.phase = 'active'; run.fight.cast.fired = true;
    run.bus.emit('capitalBoss:attack', payload); run.bus.emit('capitalBoss:attack', payload);
    assert.deepEqual(run.calls.map(c => c.recipeId), ['sfx_kraken_charge', 'sfx_kraken_rake']);
    assert.equal(run.dropped.length, 1, 'attack replaces the charging phrase');
    run.fight.phase = 'recovery'; run.fight.cast = null;
    run.fight.recovery = { beatId: 'arm_rake', startedAt: 170, durationTicks: 150, cancelled: false };
    run.bus.emit('capitalBoss:recovery', payload); run.bus.emit('capitalBoss:recovery', payload);
    assert.equal(run.calls.length, 3); assert.equal(run.calls[2].recipeId, 'sfx_kraken_vent');
    assert.equal(run.rt.voices.length, 1);
  } finally { run.dispose(); }
});

test('cancellation stops only the matching creature and never voices its unfired attack', () => {
  const run = fixture();
  try {
    const payload = run.tell('cancelled', 'siphon_jet');
    run.bus.emit('capitalBoss:telegraph', payload);
    const unrelated = { recipeId: 'sfx_wpn_autocannon', stopAt: 5 }; run.rt.voices.push(unrelated);
    run.bus.emit('capitalBoss:telegraphEnd', { fightId: run.fight.fightId, castId: 'some-other-cast' });
    assert.equal(run.rt.voices.length, 2);
    run.bus.emit('capitalBoss:telegraphEnd', {});
    assert.equal(run.rt.voices.length, 2, 'malformed stop events cannot silence the audio pool');
    run.bus.emit('capitalBoss:telegraphEnd', { ...payload, reason: 'subsystem_disabled' });
    assert.deepEqual(run.rt.voices, [unrelated]);
    run.fight.cast = null; run.fight.phase = 'recovery';
    run.fight.recovery = { beatId: 'siphon_jet', startedAt: 40, durationTicks: 150, cancelled: true };
    run.bus.emit('capitalBoss:attack', payload);
    assert.equal(run.calls.length, 1);
    run.bus.emit('capitalBoss:countered', payload);
    assert.equal(run.calls[1].recipeId, 'sfx_kraken_vent');
    assert.ok(run.rt.voices.includes(unrelated));
  } finally { run.dispose(); }
});

test('pause, muted/unstarted audio, suspension and dead bosses cannot start mechanical voices', () => {
  for (const block of [
    run => { run.rt.ctx = null; },
    run => { run.rt.ctx.state = 'suspended'; },
    run => { run.rt._paused = true; },
    run => { run.host.muted = true; },
    run => { run.rt._lifecycleSuspended = true; },
    run => { run.rt._destroyed = true; },
    run => { run.fight.suspended = true; },
    run => { run.fight.terminal = 'victory'; },
    run => { run.boss.alive = false; },
    run => { run.boss.hull = 0; },
  ]) {
    const run = fixture();
    try {
      const payload = run.tell(); block(run);
      run.bus.emit('capitalBoss:telegraph', payload);
      assert.equal(run.calls.length, 0);
    } finally { run.dispose(); }
  }
});

test('stale casts, unknown scores and nonfinite positions have no sound authority', () => {
  const run = fixture();
  try {
    const p = run.tell();
    assert.equal(resolveIronKrakenAudioCue(run.state, 'capitalBoss:telegraph', { ...p, castId: 'expired' }), null);
    assert.equal(resolveIronKrakenAudioCue(run.state, 'capitalBoss:telegraph', { ...p, encounterId: 'capital_boss_iron_maw' }), null);
    assert.equal(resolveIronKrakenAudioCue(run.state, 'capitalBoss:telegraph', { ...p, beatId: 'constructor' }), null);
    run.boss.pos.z = NaN;
    assert.equal(resolveIronKrakenAudioCue(run.state, 'capitalBoss:telegraph', p), null);
  } finally { run.dispose(); }
});

test('stop, save, retry and teardown respect current voice ownership and rearm fresh encounters', () => {
  for (const event of ['sim:pause', 'capitalBoss:suspended', 'capitalBoss:ended', 'capitalBoss:detach',
    'save:restoring', 'save:loaded', 'game:new', 'game:newGame', 'game:exitToMenu', 'capitalBoss:actRetried']) {
    const run = fixture();
    try {
      const payload = run.tell(); run.bus.emit('capitalBoss:telegraph', payload);
      run.bus.emit(event, payload);
      assert.equal(run.rt.voices.length, 0, `${event} must retire the mechanism voice`);
      if (event.startsWith('save:') || event.startsWith('game:') || event.endsWith('actRetried')) {
        run.bus.emit('capitalBoss:telegraph', payload);
        assert.equal(run.calls.length, 2, `${event} must clear the old cast identity`);
      }
      run.dispose(); run.dispose();
      run.bus.emit('capitalBoss:telegraph', run.tell('fresh-after-dispose'));
      assert.equal(run.rt.voices.length, 0);
    } finally { run.dispose(); }
  }
});

test('dedupe stays bounded and clock reversal discards the old session identity', () => {
  const run = fixture();
  try {
    for (let i = 0; i < IRON_KRAKEN_AUDIO_MEMORY_LIMIT + 10; i++) {
      run.state.tick = i + 10; run.rt.ctx.currentTime = i;
      run.bus.emit('capitalBoss:telegraph', run.tell(`cast:${i}`));
    }
    const count = run.calls.length;
    run.bus.emit('capitalBoss:telegraph', run.tell('cast:0'));
    assert.equal(run.calls.length, count + 1, 'oldest cosmetic identity is evicted at the fixed bound');
    run.bus.emit('capitalBoss:telegraph', run.tell('cast:0'));
    assert.equal(run.calls.length, count + 1);
    run.state.tick = 1;
    run.bus.emit('capitalBoss:telegraph', run.tell('cast:0'));
    assert.equal(run.calls.length, count + 2, 'rewound simulation starts a new presentation identity');
  } finally { run.dispose(); }
});

function audioGraph() {
  const nodes = [];
  const param = (value = 0) => ({ value, events: [],
    cancelScheduledValues() {},
    setValueAtTime(value, t) { this.value = value; this.events.push([value, t]); },
    linearRampToValueAtTime(value, t) { this.value = value; this.events.push([value, t]); },
    exponentialRampToValueAtTime(value, t) { this.value = value; this.events.push([value, t]); },
  });
  const node = () => {
    const n = { outputs: [], started: [], stopped: [], gain: param(1), frequency: param(440),
      detune: param(), Q: param(1), playbackRate: param(1),
      connect(dest) { this.outputs.push(dest); }, disconnect() {},
      start(t) { this.started.push(t); }, stop(t) { this.stopped.push(t); } };
    nodes.push(n); return n;
  };
  return { nodes, destination: node(), currentTime: 2, sampleRate: 8000,
    createGain: node, createOscillator: node, createBiquadFilter: node,
    createBufferSource: node, createWaveShaper: node,
    createBuffer(channels, length, sampleRate) {
      const data = new Float32Array(length);
      return { sampleRate, length, getChannelData: () => data };
    },
  };
}

test('all new recipes build a finite connected synth voice on the canonical combat bus', () => {
  assert.equal(IRON_KRAKEN_AUDIO_RECIPES.length, 5);
  const ids = new Set();
  for (const recipe of IRON_KRAKEN_AUDIO_RECIPES) {
    assert.equal(AUDIO_RECIPE_BY_ID[recipe.id], recipe);
    assert.equal(getBusForRecipe(recipe, recipe.id), 'combat');
    assert.ok(!ids.has(recipe.id)); ids.add(recipe.id);
    const graph = audioGraph();
    const voice = playRecipe(graph, recipe, graph.destination, { peakGain: .2, lockRate: true }, {});
    assert.equal(voice.loop, false);
    assert.ok(Number.isFinite(voice.stopAt) && voice.stopAt > graph.currentTime && voice.stopAt < graph.currentTime + 1.2);
    assert.ok(voice.sources.length >= 1);
    assert.ok(voice.sources.every(source => source.started.length === 1));
    assert.ok(voice.sources.every(source => source.stopped.some(Number.isFinite)));
    assert.ok(voice.gain.outputs.includes(graph.destination));
    assert.ok(graph.nodes.some(n => n.gain.events.some(([value]) => value >= .1)), 'voice graph must schedule audible energy');
  }
});
