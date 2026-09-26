import test from 'node:test';
import assert from 'node:assert/strict';

import { vfx } from '../src/render/vfx.js';
import { resolveAudioCueRecipeId, AUDIO_CUE_TO_RECIPE } from '../src/audio/audioSystem.js';

// PQ-134.02 audio half: the causal grammar declares a semantic audio id per cause
// (causalVfxGrammar.audioCue). An admitted structural cue must route that id onto the audio
// lanes at ADMISSION — spawn refusal is visual-only and must not swallow the ear's share.

function harness(tick = 100) {
  const cues = [];
  const fake = Object.create(vfx);
  fake._scene = null;
  fake.bus = { emit: (name, p) => cues.push({ name, p }) };
  fake.state = { tick, simTime: tick / 60, entities: new Map() };
  fake._causalAudioTick = undefined;
  fake._causalAudioSeen = undefined;
  return { fake, cues };
}

const audioCues = (cues) => cues.filter((c) => c.name === 'audio:cue').map((c) => c.p);

test('admitted field cue emits a resolved audio voice', () => {
  const { fake, cues } = harness();
  fake._admitAndSpawnArcadeStructural('combat:statusApplied', { statusId: 'grav_well' });
  const audio = audioCues(cues);
  assert.equal(audio.length, 1);
  assert.equal(audio[0].id, 'combat.causal.field');
  assert.equal(audio[0].cueId, 'combat.causal.field');
  assert.equal(audio[0].playbackOwnedByRaw, false);
  assert.ok(Number.isFinite(audio[0].position.x));
  assert.ok(resolveAudioCueRecipeId(audio[0].id), 'field cue must resolve to an authored recipe');
});

test('reaction status emits the reaction family voice', () => {
  const { fake, cues } = harness();
  fake._admitAndSpawnArcadeStructural('combat:statusApplied', { statusId: 'burn' });
  const audio = audioCues(cues);
  assert.equal(audio[0].id, 'combat.causal.reaction');
  assert.equal(audio[0].playbackOwnedByRaw, false);
});

test('owned families ride the bus with playbackOwnedByRaw', () => {
  const { fake, cues } = harness();
  fake._admitAndSpawnArcadeStructural('entity:killed', { id: 'e1', pos: { x: 3, z: -4 } });
  const audio = audioCues(cues);
  assert.equal(audio.length, 1);
  assert.equal(audio[0].id, 'combat.causal.direct');
  assert.equal(audio[0].playbackOwnedByRaw, true, 'entity:killed already owns its voice');
  // Semantic lane still carries the cue for observability.
  assert.ok(cues.some((c) => c.name === 'presentation:audioCue' && c.p.id === 'combat.causal.direct'));
});

test('same cue id emits at most once per tick', () => {
  const { fake, cues } = harness(200);
  fake._admitAndSpawnArcadeStructural('combat:statusApplied', { statusId: 'grav_well' });
  fake._admitAndSpawnArcadeStructural('combat:statusApplied', { statusId: 'ion_field' });
  assert.equal(audioCues(cues).length, 1, 'two same-family cues in one tick collapse to one voice');
  fake.state.tick = 201;
  fake._admitAndSpawnArcadeStructural('combat:statusApplied', { statusId: 'grav_well' });
  assert.equal(audioCues(cues).length, 2, 'the next tick releases the floor');
});

test('inadmissible receipts emit nothing', () => {
  const { fake, cues } = harness();
  fake._admitAndSpawnArcadeStructural('combat:collisionConsequence', { control: 'hold' });
  assert.equal(cues.length, 0, 'non-tumble consequence is not a causal family');
});

test('every declared causal cue id resolves to an authored recipe', () => {
  for (const id of [
    'combat.causal.direct', 'combat.causal.bank', 'combat.causal.chain',
    'combat.causal.collision', 'combat.causal.terrain', 'combat.causal.tether',
    'combat.causal.field', 'combat.causal.reaction',
  ]) {
    assert.equal(typeof AUDIO_CUE_TO_RECIPE[id], 'string', `${id} must be mapped`);
    assert.ok(resolveAudioCueRecipeId(id), `${id} must resolve to a real recipe id`);
  }
});
