// SF-230 — a field heard through its force direction. While a field is live it carries a
// sustained loop anchored to the source the force leans toward, gain/pitch riding the
// kernel's lifecycle strength, released on expiry or destruction.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { FIELD_DEFS, FIELD_FLAGS } from '../src/data/fields.js';
import { FIELD_DISSIPATE_S, fields } from '../src/systems/fields.js';
import {
  collectFieldLoopSpecs,
  fieldLoopKey,
  fieldLoopPitch,
  syncFieldAudioLoops,
  stopAllFieldLoops,
  FIELD_LOOP_RECIPES,
} from '../src/audio/fieldAudio.js';

const SEED = 23030;
const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

function withFlag(on, fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = on;
  try {
    return fn();
  } finally {
    FIELD_FLAGS.enabled = prev;
  }
}

function boot(seed = SEED) {
  const sim = createSimulation({ seed, bus: createBus(), systems: [fields] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 200, hullMax: 200,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  });
  state.playerId = player.id;
  return { sim, state, player };
}

function press(t, name, steps = 3) {
  t.state.input.actions[name] = true;
  t.sim.step();
  t.state.input.actions[name] = false;
  for (let i = 0; i < steps; i++) t.sim.step();
}

function fakeHost(state) {
  const started = [];
  const ended = [];
  const rates = [];
  const host = {
    state,
    rt: { loops: {}, _bulletTimePitch: 1 },
    _startLoopVoice(recipeId, position, gain, options) {
      const voice = {
        recipeId, position, gain, options, loop: false, _stopped: false,
        sources: [], gain: { gain: { value: gain, setTargetAtTime() {} } },
      };
      started.push(voice);
      return voice;
    },
    _endLoopVoice(voice) { voice._stopped = true; ended.push(voice); },
    _setVoiceRate(voice, rate) { voice._rate = rate; rates.push({ voice, rate }); },
    _markLoopPositionDirty() {},
    started,
    ended,
    rates,
  };
  return host;
}

test('every sustained field kind resolves to a registered loop recipe, distinct from its deploy one-shot', () => {
  for (const [kind, spec] of Object.entries(FIELD_LOOP_RECIPES)) {
    const recipe = recipeById.get(spec.recipeId);
    assert.ok(recipe, `${kind} loop recipe ${spec.recipeId} must be registered`);
    assert.ok(String(recipe.type).startsWith('continuous'), `${spec.recipeId} must be a loopable voice type`);
    assert.notEqual(spec.recipeId, `sfx_field_deploy_${kind}`);
  }
});

test('a live well publishes a loop spec anchored to its emitter — the pull direction', () => {
  withFlag(true, () => {
    const t = boot();
    press(t, 'deployWell');
    const specs = collectFieldLoopSpecs(t.state);
    const active = t.state.fields.active;
    assert.ok(active.length > 0, 'kernel publishes a live field record');
    const well = specs.find((s) => s.kind === 'well');
    assert.ok(well, 'the well yields a loop spec');
    assert.equal(well.recipeId, 'sfx_field_loop_well');
    // The loop tracks the emitter entity — the point the well drags bodies toward.
    const rec = active.find((r) => r.id === well.fieldId);
    const emitter = t.state.entities.get(rec.sourceId);
    assert.ok(emitter, 'deployed well has a live emitter entity');
    assert.equal(well.trackId, emitter.id);
    assert.equal(well.position, emitter.pos);
    assert.ok(well.envelope > 0 && well.envelope <= 1);
  });
});

test('winding fields start quiet; dissipating fields sag before expiry — strength is the envelope', () => {
  withFlag(true, () => {
    const t = boot();
    press(t, 'deployWell');
    const rec = t.state.fields.active.find((r) => r.kind === 'well');
    assert.ok(rec, 'well record published');
    const deployed = t.state.fields.deployed[rec.id];
    assert.ok(deployed, 'deployed record carries expireAt');
    // Windup: just deployed, inside FIELD_WINDUP_S — envelope below full.
    const windup = collectFieldLoopSpecs(t.state).find((s) => s.fieldId === rec.id);
    assert.ok(windup.envelope < 1, `winding envelope ${windup.envelope} should sit below 1`);
    // Mid-life: full strength.
    const target = t.state.simTime + 2;
    while (t.state.simTime < target) t.sim.step();
    const mid = collectFieldLoopSpecs(t.state).find((s) => s.fieldId === rec.id);
    assert.ok(mid.envelope > windup.envelope, 'active phase is louder than windup');
    // Dissipating: the last FIELD_DISSIPATE_S of life sags toward silence.
    const end = deployed.expireAt - FIELD_DISSIPATE_S / 2;
    while (t.state.simTime < end) t.sim.step();
    const tail = collectFieldLoopSpecs(t.state).find((s) => s.fieldId === rec.id);
    assert.ok(tail, 'dissipating field still wanted — the sag is heard, not cut');
    assert.ok(tail.envelope < 0.6, `dissipating envelope ${tail.envelope} should sag`);
    assert.ok(fieldLoopPitch(tail.envelope) < fieldLoopPitch(mid.envelope), 'pitch sags with strength');
  });
});

test('reconcile starts a tracked loop per live field, retunes it, and releases it on expiry', () => {
  withFlag(true, () => {
    const t = boot();
    const host = fakeHost(t.state);
    press(t, 'deployWell');
    syncFieldAudioLoops(host);
    const rec = t.state.fields.active.find((r) => r.kind === 'well');
    const key = fieldLoopKey(rec.id);
    const voice = host.rt.loops[key];
    assert.ok(voice, 'a live field owns a loop voice');
    assert.equal(voice.recipeId, 'sfx_field_loop_well');
    assert.equal(voice.trackId, rec.sourceId);
    assert.equal(voice.busName, 'combat');
    assert.ok(voice.loop, 'sustaining voice');
    // Reconcile is idempotent: a second pass retunes rather than stacking a second voice.
    const count = host.started.length;
    syncFieldAudioLoops(host);
    assert.equal(host.started.length, count, 'no stacked voice');
    assert.equal(host.rt.loops[key], voice, 'same voice keeps the key');
    // Expiry: the record leaves rt.active and the loop is released — no stale hum.
    while (t.state.fields.active.length > 0) t.sim.step();
    syncFieldAudioLoops(host);
    assert.equal(host.rt.loops[key], undefined, 'dead field releases its loop');
    assert.ok(voice._stopped, 'the released voice was ended, not orphaned');
  });
});

test('contrary cases: a force-less ring never voices, distant sources stay silent, stopAll clears the table', () => {
  withFlag(true, () => {
    const t = boot();
    const host = fakeHost(t.state);
    // Seed: registers a kind=well ring at strength 0 — a lock ring, not standing gravity.
    press(t, 'deploySeed');
    const seedSpecs = collectFieldLoopSpecs(t.state);
    assert.equal(seedSpecs.length, 0, 'strength-0 lock ring collects no loop spec');
    // Far source: drop a well beyond hearing — the spec culls before a voice is burned.
    const player = t.state.entities.get(t.state.playerId);
    player.pos.x = -40000;
    press(t, 'deployWell');
    const far = collectFieldLoopSpecs(t.state).filter((s) => s.kind === 'well' && s.envelope > 0);
    for (const s of far) {
      const d = Math.hypot(s.position.x - player.pos.x, s.position.z - player.pos.z);
      assert.ok(d <= 4000, `wanted loop ${s.fieldId} sits inside hearing`);
    }
    player.pos.x = 0;
    syncFieldAudioLoops(host);
    const n = Object.keys(host.rt.loops).length;
    if (n > 0) {
      assert.ok(stopAllFieldLoops(host) === n, 'stopAll releases every field loop');
      assert.equal(Object.keys(host.rt.loops).length, 0);
    }
  });
});

test('an NPC-tagged field (hostile snare) is collected — the thing dragging you is heard', () => {
  const state = {
    playerId: 1,
    entities: new Map(),
    fields: {
      active: [{
        id: 'field_snare_9', kind: 'well', tag: 'npc', sourceId: 9,
        center: { x: 300, z: 0 }, dir: { x: 1, z: 0 },
        radius: 235, strength: FIELD_DEFS.anchorSnare.strength,
        phase: 'active',
      }],
    },
  };
  state.entities.set(1, { id: 1, pos: { x: 0, z: 0 }, alive: true });
  state.entities.set(9, { id: 9, pos: { x: 300, z: 0 }, alive: true });
  const specs = collectFieldLoopSpecs(state);
  assert.equal(specs.length, 1, 'the hostile snare is wanted');
  assert.equal(specs[0].trackId, 9, 'panned toward the hull doing the dragging');
  assert.ok(specs[0].envelope > 0 && specs[0].envelope < 1, 'snare strength reads against the well nominal');
  // Dead source: the loop must not anchor to a corpse.
  state.entities.get(9).alive = false;
  state.fields.active[0].center = { x: 300, z: 0 };
  const fallen = collectFieldLoopSpecs(state);
  assert.ok(fallen.length === 0 || fallen[0].trackId == null, 'a dead source cannot keep a tracked loop');
});
