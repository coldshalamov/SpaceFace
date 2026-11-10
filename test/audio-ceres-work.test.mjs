import assert from 'node:assert/strict';
import test from 'node:test';

import { audio, AUDIO_RECIPE_BY_ID, resolveCeresWorkAudioCue } from '../src/audio/audioSystem.js';
import { resolveSampleBinding } from '../src/audio/sampleLibrary.js';

const SCHEMA = 'spaceface.trafficJobActionReceipt.v1';
const SECTOR = 'sector_ceres_belt';

const SLOT_EXPECTATIONS = [
  { slotId: 'ceres_refinery_hauler', jobKind: 'hauler', action: 'unload', recipeId: 'sfx_mining_cargo_settle', gain: 0.6, rates: [0.94, 1, 1.06], preferTarget: true },
  { slotId: 'ceres_seam_miner', jobKind: 'miner', action: 'work', recipeId: 'sfx_mining_drill_contact', gain: 0.58, rates: [0.92, 1, 1.08], preferTarget: true },
  { slotId: 'ceres_seam_surveyor', jobKind: 'surveyor', action: 'work', recipeId: 'sfx_mining_scan_return', gain: 0.46, rates: [0.96, 1, 1.04], preferTarget: false },
  { slotId: 'ceres_ambush_loaded_hauler', jobKind: 'hauler', action: 'unload', recipeId: 'sfx_mining_cargo_settle', gain: 0.52, rates: [0.94, 1, 1.06], preferTarget: false },
  { slotId: 'ceres_cathedral_salvor', jobKind: 'salvor', action: 'work', recipeId: 'sfx_mining_drill_break', gain: 0.54, rates: [0.9, 0.98, 1.06], preferTarget: true },
];

function actorFor(slotId, overrides = {}) {
  return {
    id: `actor:${slotId}`,
    alive: true,
    pos: { x: 120, z: -40 },
    data: { activityActorSlotId: slotId },
    ...overrides,
  };
}

function targetFor(overrides = {}) {
  return { id: 'target:work-site', alive: true, pos: { x: 900, z: 640 }, ...overrides };
}

function receiptFor(expected, overrides = {}) {
  return {
    schema: SCHEMA,
    sectorId: SECTOR,
    actorSlotId: expected.slotId,
    actorId: `actor:${expected.slotId}`,
    targetId: 'target:work-site',
    jobKind: expected.jobKind,
    action: expected.action,
    sequence: 0,
    ...overrides,
  };
}

function stateWith(...entities) {
  return { entities: new Map(entities.filter(Boolean).map((entity) => [entity.id, entity])) };
}

test('all five authored slots resolve their exact recipe, gain, and position source', () => {
  for (const expected of SLOT_EXPECTATIONS) {
    const actor = actorFor(expected.slotId);
    const target = targetFor();
    const cue = resolveCeresWorkAudioCue(receiptFor(expected), stateWith(actor, target));
    assert.ok(cue, `${expected.slotId} resolves`);
    assert.equal(cue.recipeId, expected.recipeId);
    assert.equal(cue.gain, expected.gain);
    const source = expected.preferTarget ? target : actor;
    assert.deepEqual(cue.position, { x: source.pos.x, z: source.pos.z },
      `${expected.slotId} hears the ${expected.preferTarget ? 'target' : 'actor'}`);
    assert.notEqual(cue.position, source.pos, 'the position copy is detached');
    assert.deepEqual(Object.keys(cue).sort(), ['gain', 'position', 'rate', 'recipeId']);
    assert.deepEqual(Object.keys(cue.position), ['x', 'z']);
  }
});

test('sequence cycles the profile rates deterministically', () => {
  const expected = SLOT_EXPECTATIONS.find((entry) => entry.slotId === 'ceres_seam_miner');
  const state = stateWith(actorFor(expected.slotId), targetFor());
  const rateAt = (sequence) => resolveCeresWorkAudioCue(
    receiptFor(expected, { sequence }), state,
  ).rate;
  assert.equal(rateAt(0), 0.92);
  assert.equal(rateAt(1), 1);
  assert.equal(rateAt(2), 1.08);
  assert.equal(rateAt(3), 0.92);
  assert.equal(rateAt(4), 1);
  assert.equal(rateAt(-1), 1.08);
  assert.equal(rateAt(-3), 0.92);
  assert.equal(rateAt(Number.MAX_SAFE_INTEGER), expected.rates[Number.MAX_SAFE_INTEGER % 3]);
  assert.equal(rateAt(1.5), 0.92);
  assert.equal(rateAt(NaN), 0.92);
  assert.equal(rateAt('7'), 0.92);
  assert.equal(rateAt(undefined), 0.92);
});

test('receipts outside the authored contract return null', () => {
  const expected = SLOT_EXPECTATIONS.find((entry) => entry.slotId === 'ceres_seam_miner');
  const state = stateWith(actorFor(expected.slotId), targetFor());
  const receipt = receiptFor(expected);
  const rejections = [
    null, 'receipt', 42, [receipt],
    { ...receipt, schema: 'spaceface.ceresCausalChain.v1' },
    { ...receipt, schema: 'spaceface.trafficJobActionReceipt.v2' },
    { ...receipt, sectorId: 'sector_vesta_forge' },
    { ...receipt, sectorId: null },
    { ...receipt, jobKind: 'patrol' },
    { ...receipt, jobKind: 'salvor' },
    { ...receipt, action: 'hold' },
    { ...receipt, action: 'load' },
    { ...receipt, actorSlotId: 'ceres_refinery_tender' },
    { ...receipt, actorSlotId: 'toString' },
  ];
  for (const candidate of rejections) {
    assert.equal(resolveCeresWorkAudioCue(candidate, state), null, JSON.stringify(candidate));
  }
  for (const slotId of ['ceres_ambush_escort', 'ceres_cathedral_patrol']) {
    const patrolExpected = { slotId, jobKind: 'patrol', action: 'hold' };
    const patrolState = stateWith(actorFor(slotId), targetFor());
    assert.equal(resolveCeresWorkAudioCue(receiptFor(patrolExpected), patrolState), null,
      `${slotId} is not an authored audio slot`);
  }
});

test('a missing, dead, mismatched, or non-finite actor returns null', () => {
  const expected = SLOT_EXPECTATIONS.find((entry) => entry.slotId === 'ceres_seam_miner');
  const receipt = receiptFor(expected);
  const actor = actorFor(expected.slotId);
  assert.equal(resolveCeresWorkAudioCue(receipt, stateWith(targetFor())), null);
  assert.equal(resolveCeresWorkAudioCue({ ...receipt, actorId: null }, stateWith(actor, targetFor())), null);
  assert.equal(resolveCeresWorkAudioCue({ ...receipt, actorId: 'actor:absent' }, stateWith(actor, targetFor())), null);
  assert.equal(resolveCeresWorkAudioCue(receipt,
    stateWith(actorFor(expected.slotId, { alive: false }), targetFor())), null);
  assert.equal(resolveCeresWorkAudioCue(receipt,
    stateWith(actorFor(expected.slotId, { data: { activityActorSlotId: 'ceres_cathedral_patrol' } }), targetFor())), null);
  assert.equal(resolveCeresWorkAudioCue(receipt,
    stateWith(actorFor(expected.slotId, { data: null }), targetFor())), null);
  for (const pos of [{ x: NaN, z: 0 }, { x: 0, z: Infinity }, null, undefined]) {
    assert.equal(resolveCeresWorkAudioCue(receipt,
      stateWith(actorFor(expected.slotId, { pos }), targetFor())), null);
  }
});

test('state without a Map-like entities owner returns null', () => {
  const receipt = receiptFor(SLOT_EXPECTATIONS[1]);
  assert.equal(resolveCeresWorkAudioCue(receipt, null), null);
  assert.equal(resolveCeresWorkAudioCue(receipt, undefined), null);
  assert.equal(resolveCeresWorkAudioCue(receipt, {}), null);
  assert.equal(resolveCeresWorkAudioCue(receipt, { entities: [] }), null);
  assert.equal(resolveCeresWorkAudioCue(receipt, { entities: { get: 'nope' } }), null);
});

test('prefer-target slots fall back to the live actor when the target is unusable', () => {
  const expected = SLOT_EXPECTATIONS.find((entry) => entry.slotId === 'ceres_cathedral_salvor');
  const actor = actorFor(expected.slotId);
  const expectActorPosition = (entities, overrides = {}) => {
    const cue = resolveCeresWorkAudioCue(receiptFor(expected, overrides), stateWith(actor, ...entities));
    assert.ok(cue);
    assert.deepEqual(cue.position, { x: actor.pos.x, z: actor.pos.z });
  };
  expectActorPosition([], { targetId: null });
  expectActorPosition([], { targetId: 'target:absent' });
  expectActorPosition([targetFor({ alive: false })]);
  expectActorPosition([targetFor({ pos: { x: NaN, z: 0 } })]);
  expectActorPosition([targetFor({ pos: null })]);
  const cue = resolveCeresWorkAudioCue(receiptFor(expected), stateWith(actor, targetFor()));
  assert.deepEqual(cue.position, { x: 900, z: 640 }, 'a valid target still wins');
});

test('_onCeresWorkAction plays the resolved cue exactly once and stays silent otherwise', () => {
  const played = [];
  const expected = SLOT_EXPECTATIONS.find((entry) => entry.slotId === 'ceres_refinery_hauler');
  const host = Object.create(audio);
  host.state = stateWith(actorFor(expected.slotId), targetFor());
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
  host._onCeresWorkAction(receiptFor(expected, { sequence: 2 }));
  assert.equal(played.length, 1);
  assert.equal(played[0].recipeId, 'sfx_mining_cargo_settle');
  assert.deepEqual(played[0].opts, { position: { x: 900, z: 640 }, gain: 0.6, rate: 1.06 });
  host._onCeresWorkAction(null);
  host._onCeresWorkAction(receiptFor(expected, { schema: 'other.v1' }));
  host._onCeresWorkAction(receiptFor(expected, { actorSlotId: 'ceres_ambush_escort' }));
  host._onCeresWorkAction(receiptFor(expected, { actorId: 'actor:absent' }));
  host._onCeresWorkAction(receiptFor(expected, { jobKind: 'patrol', action: 'hold' }));
  assert.equal(played.length, 1, 'unsupported receipts stay silent');
});

test('every mapped recipe is bound, mining/ambient-category audio data', () => {
  const recipeIds = [...new Set(SLOT_EXPECTATIONS.map((entry) => entry.recipeId))];
  assert.equal(recipeIds.length, 4);
  for (const recipeId of recipeIds) {
    const recipe = AUDIO_RECIPE_BY_ID[recipeId];
    assert.ok(recipe, `${recipeId} exists in AUDIO_RECIPE_BY_ID`);
    assert.ok(recipe.category === 'mining' || recipe.category === 'ambient',
      `${recipeId} rides the ${recipe.category} category`);
    const binding = resolveSampleBinding(recipeId);
    assert.ok(binding, `${recipeId} resolves a sample binding`);
    assert.equal(typeof binding.file, 'string');
  }
});
