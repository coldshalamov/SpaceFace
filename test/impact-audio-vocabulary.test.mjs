// Impact audio vocabulary — the ear must be able to name the matter and the event.
//
// The causal VFX grammar authors a material cue id and an event-class cue id for every impact
// (src/presentation/causalVfxGrammar.js). This suite pins the audio half: every authored id resolves
// to an existing synthesized recipe, a material-specific contact never also speaks the generic
// impact voice, the presentation seam carries position/distance/priority metadata, and an unknown
// surface degrades to `combat.impact.generic` instead of throwing or going silent.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  IMPACT_EVENT_CLASSES,
  IMPACT_EVENT_GRAMMAR,
  IMPACT_MATERIAL_GRAMMAR,
  IMPACT_MATERIALS,
  classifyImpactAudioEvent,
  impactMaterialForTarget,
  normalizeImpactMaterial,
  resolveImpactAudioCue,
} from '../src/presentation/causalVfxGrammar.js';
import {
  AUDIO_CUE_TO_RECIPE,
  AUDIO_RECIPE_BY_ID,
  audio,
  resolveAudioCueRecipeId,
  resolveImpactDamageVoice,
} from '../src/audio/audioSystem.js';
import {
  emitImpactAudioCue,
  impactAudioCueForCue,
  presentationAdapters,
} from '../src/systems/presentationAdapters.js';

// The authored material family and its one existing voice. Every row is a distinct recipe: the
// ear can tell a hull from a rock from ice without a new sample bank.
const MATERIAL_RECIPE = Object.freeze({
  hull: 'sfx.hullHit',
  armor: 'sfx.armorHit',
  rock: 'sfx_mining_impact',
  ice: 'sfx_optic_reflect',
  ceramic: 'sfx_optic_split',
  composite: 'sfx_salvage_plate',
  shield: 'sfx.shieldHit',
  unknown: 'sfx_hull_scrape',
});

// The structural event family. Graze/slam/breach/fracture/detonation/breakup are the owner's
// named stages; pinprick/cut stay mapped for owners that declare them explicitly.
const EVENT_RECIPE = Object.freeze({
  graze: 'sfx_hull_scrape',
  pinprick: 'sfx_mining_cutter_lock',
  cut: 'sfx_mining_drill_contact',
  slam: 'sfx_swarm_slam_thud',
  breach: 'sfx_hull_decompress',
  fracture: 'sfx_mining_fracture_break',
  detonation: 'sfx.chargeDetonate',
  breakup: 'sfx_explosion_large',
});

const MATERIAL_FAMILY = Object.freeze(['hull', 'armor', 'rock', 'ice', 'ceramic', 'composite', 'shield']);
const EVENT_FAMILY = Object.freeze(['graze', 'slam', 'breach', 'fracture', 'detonation', 'breakup']);

function bootAudio() {
  const state = createGameState(4242);
  state.mode = 'flight';
  const bus = createBus();
  const player = {
    id: state.playerId, type: 'ship', alive: true, team: 0,
    hull: 200, hullMax: 200, shield: 40, shieldMax: 40, armorHp: 40, armorMax: 40,
    radius: 6, pos: { x: 0, z: 0 }, rot: 0, data: {},
  };
  state.entities.set(player.id, player);
  audio.init({ state, bus, helpers: {} });

  const played = [];
  const originalPlay = audio.play;
  audio.play = (recipeId, opts) => {
    played.push({ recipeId, opts: opts || {} });
    return { id: recipeId };
  };
  return {
    state,
    bus,
    player,
    played,
    addTarget(target) { state.entities.set(target.id, target); },
    restore() {
      audio.play = originalPlay;
      audio.state = null;
      audio.rt = null;
      audio.bus = null;
    },
  };
}

function damagePayload(over = {}) {
  return {
    targetId: null,
    attackerId: 1,
    amount: 2,
    applied: 2,
    shieldDamage: 0,
    armorDamage: 0,
    hullDamage: 0,
    shieldAbsorbed: false,
    brokeShield: false,
    dominantLayer: 'hull',
    isPlayer: false,
    pos: { x: 30, z: 0 },
    ...over,
  };
}

function target(id, type, over = {}) {
  return {
    id,
    type,
    alive: true,
    hull: 200,
    hullMax: 200,
    armorHp: 40,
    armorMax: 40,
    shield: 40,
    shieldMax: 40,
    pos: { x: 30, z: 0 },
    data: {},
    ...over,
  };
}

test('every authored material and impact-event cue resolves to an existing synthesized recipe', () => {
  for (const materialId of Object.keys(IMPACT_MATERIALS)) {
    const cueId = IMPACT_MATERIAL_GRAMMAR[materialId].audioCue;
    assert.equal(AUDIO_CUE_TO_RECIPE[cueId], MATERIAL_RECIPE[materialId],
      `${materialId} must route ${cueId} to its authored recipe`);
    assert.ok(AUDIO_RECIPE_BY_ID[MATERIAL_RECIPE[materialId]],
      `${cueId} must resolve to a recipe real play() accepts`);
    assert.equal(resolveAudioCueRecipeId(cueId), MATERIAL_RECIPE[materialId]);
  }
  for (const eventClass of IMPACT_EVENT_CLASSES) {
    const cueId = IMPACT_EVENT_GRAMMAR[eventClass].audioCue;
    assert.equal(AUDIO_CUE_TO_RECIPE[cueId], EVENT_RECIPE[eventClass],
      `${eventClass} must route ${cueId} to its authored recipe`);
    assert.ok(AUDIO_RECIPE_BY_ID[EVENT_RECIPE[eventClass]],
      `${cueId} must resolve to a recipe real play() accepts`);
    assert.equal(resolveAudioCueRecipeId(cueId), EVENT_RECIPE[eventClass]);
  }
});

test('the material and structural event families are distinct cue families at the recipe level', () => {
  const materialRecipes = MATERIAL_FAMILY.map((id) => resolveAudioCueRecipeId(
    IMPACT_MATERIAL_GRAMMAR[id].audioCue,
  ));
  assert.equal(new Set(materialRecipes).size, MATERIAL_FAMILY.length,
    `material voices must not share a recipe: ${materialRecipes.join(', ')}`);

  const eventRecipes = EVENT_FAMILY.map((id) => resolveAudioCueRecipeId(
    IMPACT_EVENT_GRAMMAR[id].audioCue,
  ));
  assert.equal(new Set(eventRecipes).size, EVENT_FAMILY.length,
    `structural voices must not share a recipe: ${eventRecipes.join(', ')}`);

  for (const materialId of MATERIAL_FAMILY) {
    const resolved = resolveImpactAudioCue({ eventClass: 'pinprick', materialId });
    assert.equal(resolved.cueId, IMPACT_MATERIAL_GRAMMAR[materialId].audioCue,
      `${materialId} ordinary contact speaks its material`);
    assert.equal(resolved.eventOwnsVoice, false);
  }
  for (const eventClass of EVENT_FAMILY) {
    const resolved = resolveImpactAudioCue({ eventClass, materialId: 'hull' });
    assert.equal(resolved.cueId, IMPACT_EVENT_GRAMMAR[eventClass].audioCue,
      `${eventClass} speaks its event class`);
    assert.equal(resolved.eventOwnsVoice, true);
  }
});

test('a material-specific impact never selects the generic cue', () => {
  for (const materialId of MATERIAL_FAMILY) {
    const resolved = resolveImpactAudioCue({ eventClass: 'pinprick', materialId });
    assert.notEqual(resolved.cueId, 'combat.impact.generic',
      `${materialId} must not collapse to the generic impact id`);
  }
  // A declared structural event outranks the material but still carries both authored ids for
  // observability, so a caller can log the material without playing a second voice.
  const fracture = resolveImpactAudioCue({ eventClass: 'fracture', materialId: 'ice' });
  assert.equal(fracture.cueId, 'combat.impact.fracture');
  assert.equal(fracture.materialCueId, 'combat.impact.ice');
  assert.equal(fracture.eventCueId, 'combat.impact.fracture');
});

test('one raw damage contact requests exactly one material recipe, never a generic stack', () => {
  const h = bootAudio();
  try {
    h.addTarget(target('ice-rock', 'asteroid', {
      hull: 100, hullMax: 100, data: { substance: 'ice' },
    }));
    h.bus.emit('combat:damage', damagePayload({
      targetId: 'ice-rock', amount: 3, applied: 3, hullDamage: 3, hullHit: true,
    }));
    assert.deepEqual(h.played.map((entry) => entry.recipeId), ['sfx_optic_reflect'],
      'an ice hit speaks only the ice voice');

    // The same projectile also emits projectile:hit on this tick. The damage owner already spoke;
    // the asteroid chip must yield instead of stacking a second voice.
    h.bus.emit('projectile:hit', {
      targetId: 'ice-rock', projectileId: 'ice-bolt', pos: { x: 30, z: 0 },
    });
    assert.equal(h.played.length, 1, 'the same contact must not play twice across raw owners');

    // A projectile-only hit on the next tick keeps its fallback voice when no damage receipt owns it.
    h.state.tick += 1;
    h.bus.emit('projectile:hit', {
      targetId: 'ice-rock', projectileId: 'ice-bolt', pos: { x: 30, z: 0 },
    });
    assert.equal(h.played.length, 2);
    assert.equal(h.played[1].recipeId, 'sfx_optic_reflect');
    assert.equal(h.played[1].opts.gain, 0.5, 'the asteroid chip keeps its restrained gain law');
  } finally {
    h.restore();
  }
});

test('live damage receipts speak the struck surface, not the three generic layer voices', () => {
  const h = bootAudio();
  try {
    const cases = [
      {
        target: target('t-hull', 'ship'),
        payload: damagePayload({ targetId: 't-hull', amount: 2, hullDamage: 2, hullHit: true }),
        recipe: 'sfx.hullHit',
      },
      {
        target: target('t-armor', 'ship', { surfaceMaterial: 'plate' }),
        payload: damagePayload({ targetId: 't-armor', amount: 2, armorDamage: 2, armorHit: true, dominantLayer: 'armor' }),
        recipe: 'sfx.armorHit',
      },
      {
        target: target('t-shield', 'ship'),
        payload: damagePayload({
          targetId: 't-shield', amount: 2, shieldDamage: 2, shieldAbsorbed: true, dominantLayer: 'shield',
        }),
        recipe: 'sfx.shieldHit',
      },
      {
        target: target('t-rock', 'asteroid', { data: { material: 'rock' } }),
        payload: damagePayload({ targetId: 't-rock', amount: 2, hullDamage: 2, hullHit: true }),
        recipe: 'sfx_mining_impact',
      },
      {
        target: target('t-ice', 'asteroid', { data: { substance: 'ice' } }),
        payload: damagePayload({ targetId: 't-ice', amount: 2, hullDamage: 2, hullHit: true }),
        recipe: 'sfx_optic_reflect',
      },
      {
        target: target('t-ceramic', 'asteroid', { data: { substance: 'crystal' } }),
        payload: damagePayload({ targetId: 't-ceramic', amount: 2, hullDamage: 2, hullHit: true }),
        recipe: 'sfx_optic_split',
      },
      {
        target: target('t-composite', 'asteroid', { data: { substance: 'metallic_ore' } }),
        payload: damagePayload({ targetId: 't-composite', amount: 2, hullDamage: 2, hullHit: true }),
        recipe: 'sfx_salvage_plate',
      },
    ];
    for (const entry of cases) {
      h.addTarget(entry.target);
      h.bus.emit('combat:damage', entry.payload);
    }
    assert.deepEqual(h.played.map((entry) => entry.recipeId), cases.map((entry) => entry.recipe));
  } finally {
    h.restore();
  }
});

test('the cross-owner rock voice survives a deferred drain and a destroyed target', () => {
  const h = bootAudio();
  const realClock = audio._wallClockMs;
  let now = 1000;
  audio._wallClockMs = () => now;
  try {
    const rock = target('t-rock', 'asteroid', { data: { material: 'rock' } });
    h.addTarget(rock);
    h.bus.claimPresentationDrain();
    h.bus.emit('projectile:hit', {
      targetId: 't-rock',
      type: 'asteroid',
      projectileId: 500,
      pos: { x: 30, z: 0 },
    });
    assert.deepEqual(h.played.map((entry) => entry.recipeId), ['sfx_mining_impact'],
      'the inline chip speaks first');

    // A catch-up step (tick moved) and the rock destroyed before the presentation drain runs.
    h.state.tick += 4;
    h.state.entities.delete('t-rock');
    now += 90;
    h.bus.emit('combat:damage', damagePayload({
      targetId: 't-rock', amount: 2, hullDamage: 2, hullHit: true, pos: { x: 30, z: 0 },
    }));
    assert.equal(h.played.length, 1, 'the presentation-deferred damage is still queued');
    h.bus.drainPresentationTail();
    assert.deepEqual(h.played.map((entry) => entry.recipeId), ['sfx_mining_impact'],
      'the layer voice yields to the chip even though the rock is gone and the tick advanced');
  } finally {
    audio._wallClockMs = realClock;
    h.restore();
  }
});

test('a declared structural event takes its authored voice over the material', () => {
  const h = bootAudio();
  try {
    const cases = [
      ['graze', 'sfx_hull_scrape'],
      ['slam', 'sfx_swarm_slam_thud'],
      ['breach', 'sfx_hull_decompress'],
      ['fracture', 'sfx_mining_fracture_break'],
      ['detonation', 'sfx.chargeDetonate'],
      ['breakup', 'sfx_explosion_large'],
    ];
    cases.forEach(([eventClass], index) => {
      const id = `event-${index}`;
      h.addTarget(target(id, 'ship'));
      h.bus.emit('combat:damage', damagePayload({
        targetId: id, amount: 4, hullDamage: 4, hullHit: true, eventClass,
      }));
    });
    assert.deepEqual(h.played.map((entry) => entry.recipeId), cases.map(([, recipe]) => recipe));
  } finally {
    h.restore();
  }
});

test('the presentation seam emits one specific impact cue with position, distance and priority', () => {
  const state = {
    playerId: 1,
    entities: new Map([
      [1, { id: 1, type: 'ship', pos: { x: 0, z: 0 } }],
      [2, {
        id: 2, type: 'asteroid', hull: 100, hullMax: 100,
        pos: { x: 300, z: 400 }, data: { substance: 'ice' },
      }],
    ]),
    settings: { video: { motionReduce: true }, accessibility: {} },
  };
  const cue = {
    id: 'combat.damage.applied',
    targetId: 2,
    material: 'hull',
    magnitude: 2,
    importance: 0.72,
    playerRelevance: 1,
    position: { x: 300, z: 400 },
    lanes: { audio: 'audio.combat' },
    tags: [],
  };
  const payload = impactAudioCueForCue(cue, state);
  assert.equal(payload.id, 'combat.impact.ice', 'the material id is carried, not the layer generic');
  assert.deepEqual(payload.position, { x: 300, z: 400 });
  assert.equal(payload.distance, 500, 'distance is measured from the live player to the contact');
  assert.equal(payload.importance, 0.72);
  assert.equal(payload.playerRelevance, 1);
  assert.equal(payload.reducedMotion, true);
  assert.equal(payload.playbackOwnedByRaw, true,
    'the raw damage receipt remains the physical owner; the semantic cue is observability');
  assert.equal(payload.duck, false, 'a damage contact does not bow the mix');
  assert.equal(impactAudioCueForCue({ ...cue, importance: 0.9 }, state).duck, false,
    'combat-aftermath policy keeps damage cues out of the priority-duck family');

  const bus = createBus();
  const presentation = [];
  const audioLane = [];
  bus.on('presentation:audioCue', (entry) => presentation.push(entry));
  bus.on('audio:cue', (entry) => audioLane.push(entry));
  const emitted = emitImpactAudioCue(bus, { eventClass: 'slam', materialId: 'hull' }, {
    position: { x: 12, z: -4 },
    distance: 20,
    importance: 0.9,
    playerRelevance: 1,
    duck: true,
    reducedMotion: true,
    playbackOwnedByRaw: false,
  });
  assert.equal(emitted.id, 'combat.impact.slam');
  assert.equal(presentation.length, 1);
  assert.equal(audioLane.length, 1, 'an owner with no raw voice gets the playable lane');
  assert.equal(audioLane[0].importance, 0.9);
  assert.equal(audioLane[0].duck, true);
  assert.equal(audioLane[0].playbackOwnedByRaw, false);

  // Raw-owned contacts stay on the semantic lane: no second playback request is minted.
  presentation.length = 0;
  audioLane.length = 0;
  emitImpactAudioCue(bus, { eventClass: 'breach', materialId: 'hull' }, {
    position: { x: 12, z: -4 }, playbackOwnedByRaw: true,
  });
  assert.equal(presentation.length, 1);
  assert.equal(audioLane.length, 0, 'the raw receipt remains the only physical voice');
});

test('an unknown material falls back to the generic impact cue without throwing', () => {
  assert.equal(normalizeImpactMaterial('unobtanium'), 'unknown');
  const resolved = resolveImpactAudioCue({ eventClass: 'pinprick', materialId: 'unobtanium' });
  assert.equal(resolved.materialId, 'unknown');
  assert.equal(resolved.cueId, 'combat.impact.generic');
  assert.ok(resolveAudioCueRecipeId(resolved.cueId), 'the fallback still names a real recipe');

  assert.equal(impactMaterialForTarget({ type: 'asteroid', data: { substance: 'unobtanium' } }, 'hull'),
    'rock', 'an unrecognized rock substance stays a rock');
  assert.equal(impactMaterialForTarget(null, 'hull'), 'hull',
    'a missing body falls back to the layer the damage router named');
  assert.equal(impactMaterialForTarget(null, null), 'unknown');
  assert.equal(impactMaterialForTarget({ type: 'ship', data: {} }, 'hull'), 'hull');

  const bus = createBus();
  const emitted = emitImpactAudioCue(bus, { materialId: 'unobtanium' });
  assert.equal(emitted.id, 'combat.impact.generic');
  assert.equal(emitted.materialId, 'unknown');
});

test('impact classification stays structural for explicit classes and material-led for ordinary contact', () => {
  assert.equal(classifyImpactAudioEvent({ eventClass: 'breach', materialId: 'hull', severity: 0.4 }), 'breach');
  assert.equal(classifyImpactAudioEvent({ materialId: 'hull', severity: 0.02 }), 'pinprick');
  assert.equal(classifyImpactAudioEvent({ materialId: 'hull', severity: 0.35 }), 'breach');
  assert.equal(classifyImpactAudioEvent({ materialId: 'rock', severity: 0.6 }), 'fracture');
  assert.equal(classifyImpactAudioEvent({ materialId: 'ice', severity: 0.9 }), 'breakup');
  assert.equal(classifyImpactAudioEvent({ materialId: 'shield', severity: 0.9 }), 'pinprick',
    'a shield absorbs; it never becomes a hull breach/detonation');
  assert.equal(classifyImpactAudioEvent({ materialId: 'unobtanium', severity: 0.9 }), 'pinprick',
    'an unknown surface stays on the generic fallback even at high severity');

  const voice = resolveImpactDamageVoice(
    damagePayload({ amount: 2, hullDamage: 2, hullHit: true }),
    target('voice-hull', 'ship'),
  );
  assert.equal(voice.recipeId, 'sfx.hullHit');
  assert.equal(voice.layer, 'hull');
  assert.equal(voice.materialId, 'hull');
});
