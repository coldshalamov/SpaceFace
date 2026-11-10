// PQ-133.04 R4 — causal presentation for the compiled ricochet continuation (CRU-031 + SG-08).
//
// The kernel publishes `combat:bounceContinued` at the receipt seam (attackHit.js); the semantic
// arbiter turns it into ONE `combat.bounce` cue that keeps every authored property the direct
// toy route never had: receipt-identity dedupe, lane budgets with the critical reserve intact,
// declared reduced forms, a caption, and the authored armor-hit audio. No `combat:bankShot`
// anywhere on the compiled path.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSurfaceContactReceipt } from '../src/core/surfaceContact.js';
import { compileAttackSpec } from '../src/combat/attackSpec.js';
import { createLineage } from '../src/combat/attackLineage.js';
import { armAttackContinue, bindAttackCausalBus, resolveLiveAttackHit } from '../src/combat/attackHit.js';
import {
  REDUCED_CUE_MODES,
  getPresentationRecipe,
  validatePresentationRecipes,
} from '../src/presentation/cueRecipes.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters, PRESENTATION_AUDIO_CUE_BY_ID } from '../src/systems/presentationAdapters.js';
import { AUDIO_RECIPE_BY_ID, resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';
import { SAMPLE_BINDINGS } from '../src/data/audioRecipes.js';

const PLAYER_ID = 1;
const BOSS_ID = 2;

function bootState(overrides = {}) {
  const state = createGameState(13304);
  state.playerId = PLAYER_ID;
  state.tick = 12;
  state.simTime = 0.2;
  state.settings = {
    video: { motionReduce: false, ...(overrides.motionReduce ? { motionReduce: true } : {}) },
    accessibility: { flashReduce: false, highContrast: false, ...(overrides.flashReduce ? { flashReduce: true } : {}) },
  };
  state.entities = new Map([
    [PLAYER_ID, { id: PLAYER_ID, pos: { x: 0, y: 0, z: 0 } }],
    [BOSS_ID, { id: BOSS_ID, pos: { x: 90, y: 0, z: 0 } }],
  ]);
  return state;
}

function boot(overrides = {}) {
  const state = bootState(overrides);
  const bus = createBus();
  const records = { cues: [], suppressed: [], applied: [], audio: [], captions: [], vfx: [], raw: [] };
  bus.on('presentation:cue', (p) => records.cues.push(p));
  bus.on('presentation:cueSuppressed', (p) => records.suppressed.push(p));
  bus.on('presentation:cueApplied', (p) => records.applied.push(p));
  bus.on('presentation:audioCue', (p) => records.audio.push(p));
  bus.on('presentation:caption', (p) => records.captions.push(p));
  bus.on('presentation:vfxCue', (p) => records.vfx.push(p));
  bus.on('combat:bankShot', (p) => records.raw.push(p));
  presentationOrchestrator.init({ state, bus });
  presentationAdapters.init({ state, bus });
  // The orchestrator binds the causal tap in init; both stands are torn down per test.
  return {
    state, bus, records,
    teardown() {
      presentationOrchestrator.dispose();
      presentationAdapters.dispose();
    },
  };
}

function bounceContinuation({ projectileId = 'bolt-1', ownerId = PLAYER_ID, tick = 12 } = {}) {
  return {
    projectileId,
    ownerId,
    targetId: BOSS_ID,
    surfaceId: BOSS_ID,
    material: 'plate',
    tick,
    receipt: createSurfaceContactReceipt({
      point: { x: 50, z: 0 }, normal: { x: -1, z: 0 }, velocity: { x: 12, z: 0 },
      material: 'plate', tick, projectileId, surfaceId: BOSS_ID,
    }),
    incoming: { x: 12, z: 0 },
    outgoing: { x: -12, z: 0 },
  };
}

test('the combat.bounce recipe validates, is not critical, and declares its reduced forms', () => {
  const report = validatePresentationRecipes();
  assert.equal(report.ok, true, report.issues.join('\n'));
  const recipe = getPresentationRecipe('combat.bounce');
  assert.ok(recipe, 'the bounce cue must have an authored recipe');
  assert.equal(recipe.dedupeWindowTicks, 1, 'one tick, like combat.damage.applied');
  assert.equal(recipe.budgets.voices, 0, 'the armor-hit voice is a mapped semantic cue, not a new voice');
  for (const lane of ['camera', 'vfx', 'audio', 'ui', 'accessibility']) {
    assert.equal(typeof recipe.lanes[lane], 'string', `${lane} lane must be declared`);
  }
  assert.equal(recipe.lanes.audio, 'audio.combat_aftermath');
  assert.ok(recipe.reducedMotionMode, 'reduced motion form is declared, not implied');
  assert.ok(recipe.reducedFlashMode, 'reduced flash form is declared, not implied');
  for (const mode of [recipe.reducedMotionMode, recipe.reducedFlashMode]) {
    assert.ok(REDUCED_CUE_MODES.includes(mode), `declared reduced mode ${mode} must be one the adapters honour`);
  }
});

test('one continuation publishes exactly one cue, with the receipt identity in its dedupe key', () => {
  const h = boot();
  try {
    h.bus.emit('combat:bounceContinued', bounceContinuation());
    h.bus.flush();
    const cues = h.records.cues.filter((c) => c.id === 'combat.bounce');
    assert.equal(cues.length, 1);
    const cue = cues[0];
    assert.equal(cue.sourceEvent, 'combat:bounceContinued');
    assert.equal(cue.sourceId, PLAYER_ID, 'the shooter is the source');
    assert.equal(cue.targetId, BOSS_ID, 'the struck surface is the target');
    assert.equal(cue.playerRelevance, 0.88, 'a player-aimed bank infers participant relevance');
    assert.ok(String(cue.dedupeKey).includes('bolt-1'), 'the receipt identity rides the dedupe key');
    assert.equal(cue.reducedMotionMode, 'static_dim');
    // The adapters answer on the same cue: the direct impact owner, the caption, the voice.
    assert.ok(h.records.applied.some((a) => a.id === 'combat.bounce'));
  } finally { h.teardown(); }
});

test('a re-published continuation dedupes inside the tick; a distinct bank does not', () => {
  const h = boot();
  try {
    h.bus.emit('combat:bounceContinued', bounceContinuation());
    h.bus.emit('combat:bounceContinued', bounceContinuation());
    h.bus.emit('combat:bounceContinued', bounceContinuation({ projectileId: 'bolt-2', tick: 12 }));
    h.bus.flush();
    const cues = h.records.cues.filter((c) => c.id === 'combat.bounce');
    assert.equal(cues.length, 2, 'two continuations, two cues');
    const reasons = h.records.suppressed.filter((s) => s.id === 'combat.bounce').map((s) => s.reason);
    assert.deepEqual(reasons, ['dedupe_window'], 'the same-tick replay is the only suppression');
  } finally { h.teardown(); }
});

test('lane budgets suppress the fourth flavor bank in a tick while the critical reserve stays uncharged', () => {
  const h = boot();
  try {
    // Three non-critical bounces saturate the flavor pools the recipe drives (audio cap 6,
    // general pool 3; the vfx lane is a direct owner). A fourth must lose its slot BY LANE.
    for (let i = 1; i <= 3; i++) {
      h.bus.emit('combat:bounceContinued', bounceContinuation({ projectileId: `bolt-${i}` }));
    }
    h.bus.emit('combat:bounceContinued', bounceContinuation({ projectileId: 'bolt-4' }));
    // A critical cue on the SAME saturated tick (the orchestrator's own receipt for a broken
    // player shield): shield.collapse is in CRITICAL_SLICE_EVENT_IDS.
    h.bus.emit('combat:damage', { brokeShield: true, targetId: PLAYER_ID, attackerId: 9, applied: 10 });
    h.bus.flush();
    const flavors = h.records.cues.filter((c) => c.id === 'combat.bounce');
    assert.equal(flavors.length, 3, 'exactly the general-pool banks land');
    const bounceSuppression = h.records.suppressed.find((s) => s.id === 'combat.bounce');
    assert.ok(bounceSuppression, 'the fourth bank is suppressed');
    assert.match(bounceSuppression.reason, /^lane_budget:/);
    assert.equal(
      h.records.suppressed.find((s) => s.id === 'shield.collapse'),
      undefined,
      'a critical cue still lands: the reserve is not charged by flavor',
    );
    assert.ok(h.records.cues.some((c) => c.id === 'shield.collapse'));
  } finally { h.teardown(); }
});

test('reduced settings scale the cue: the caption carries the settings, the event the declared modes', () => {
  const plain = boot();
  try {
    plain.bus.emit('combat:bounceContinued', bounceContinuation());
    plain.bus.flush();
    const plainCaption = plain.records.captions.at(-1);
    assert.ok(plainCaption, 'a player-relevant bank captions');
    assert.equal(plainCaption.text, 'Shot banked off the surface — ricochet continues.');
    assert.equal(plainCaption.reducedMotion, false);
    assert.equal(plainCaption.flashReduced, false);
  } finally { plain.teardown(); }

  const reduced = boot({ motionReduce: true, flashReduce: true });
  try {
    reduced.bus.emit('combat:bounceContinued', bounceContinuation());
    reduced.bus.flush();
    const cue = reduced.records.cues.find((c) => c.id === 'combat.bounce');
    assert.equal(cue.reducedMotionMode, 'static_dim', 'the declared reduced form rides the event');
    assert.equal(cue.reducedFlashMode, 'static_dim');
    const caption = reduced.records.captions.at(-1);
    assert.equal(caption.reducedMotion, true, 'motionReduce reaches the accessible caption');
    assert.equal(caption.flashReduced, true, 'flashReduce reaches the accessible caption');
    assert.equal(caption.assertive, false, 'a bank is feedback, never an assertive interrupt');
  } finally { reduced.teardown(); }
});

test('the bounce voice resolves to the authored armor-hit recipe (impact_armor), with no new asset', () => {
  const semanticId = PRESENTATION_AUDIO_CUE_BY_ID['combat.bounce'];
  assert.equal(semanticId, 'presentation.combat.bounce');
  const recipeId = resolveAudioCueRecipeId(semanticId);
  assert.equal(recipeId, 'sfx.armorHit', 'the semantic cue must resolve to a concrete authored recipe');
  assert.ok(AUDIO_RECIPE_BY_ID['sfx.armorHit'], 'the armor-hit recipe is authored');
  assert.equal(SAMPLE_BINDINGS['sfx.armorHit'].id, 'impact_armor', 'its designed sample binding is impact_armor');

  // And the live adapter routes the cue to exactly that voice.
  const h = boot();
  try {
    h.bus.emit('combat:bounceContinued', bounceContinuation());
    h.bus.flush();
    assert.equal(h.records.audio.at(-1).id, 'presentation.combat.bounce');
    assert.equal(h.records.audio.at(-1).duck, false, 'feedback must not duck the music bed');
  } finally { h.teardown(); }
});

test('negative: the compiled continuation never publishes the toy-route combat:bankShot', () => {
  const state = createGameState(13304);
  state.playerId = 1;
  const bus = createBus();
  const rawEvents = [];
  // Wrap emit so EVERY event on the bus during the compiled bounce is observed, not just the
  // ones this test remembered to subscribe to.
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (ev, payload) => { rawEvents.push(ev); return rawEmit(ev, payload); };
  const boss = {
    id: 7, type: 'ship', alive: true, pos: { x: 0, z: 0 }, rot: 0, radius: 32,
    data: { lootTableId: 'mirrorjaw_foreman', surfaceMaterial: 'plate' },
  };
  const shooter = { id: 1, type: 'ship', alive: true, pos: { x: 400, z: 0 } };
  state.entities = new Map([[7, boss], [1, shooter]]);
  state.entityList = [boss, shooter];

  const spec = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers: [['mod_bank_shot', 1]] }).spec;
  const runtime = createLineage({ spec });
  const projectile = armAttackContinue({
    id: 'bolt', type: 'projectile', alive: true, radius: 0.7, ownerId: 1,
    pos: { x: 50, z: 0 }, vel: { x: -12, z: 0 }, rot: Math.PI,
  });
  const receipt = createSurfaceContactReceipt({
    point: { x: 50, z: 0 }, normal: { x: -1, z: 0 }, velocity: { x: -12, z: 0 },
    material: 'plate', tick: 12, projectileId: 'bolt', surfaceId: 7,
  });

  presentationOrchestrator.init({ state, bus });
  try {
    const result = resolveLiveAttackHit({
      state, spec, runtime, projectile,
      target: boss, payload: { receipt }, tick: 12,
    });
    assert.equal(result.ok, true, 'a prow contact with a bounce left continues the body');
    assert.equal(result.consume, false);
    assert.equal(runtime.budget.consumed, 1);
    bus.flush();
    assert.ok(!rawEvents.includes('combat:bankShot'), 'the toy-route event is gone from the compiled path');
    assert.ok(rawEvents.includes('combat:bounceContinued'), 'the kernel publishes its own receipt');
  } finally {
    presentationOrchestrator.dispose();
    bindAttackCausalBus(null);
  }
});

test('unbinding the causal tap silences publication without touching the kernel verdict', () => {
  const state = createGameState(13304);
  state.playerId = 1;
  const bus = createBus();
  const rawEvents = [];
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (ev, payload) => { rawEvents.push(ev); return rawEmit(ev, payload); };
  bindAttackCausalBus(null); // no orchestrator mounted — the tap must stay silent
  const boss = {
    id: 7, type: 'ship', alive: true, pos: { x: 0, z: 0 }, rot: 0, radius: 32,
    data: { lootTableId: 'mirrorjaw_foreman', surfaceMaterial: 'plate' },
  };
  state.entities = new Map([[7, boss]]);
  state.entityList = [boss];
  const spec = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers: [['mod_bank_shot', 1]] }).spec;
  const runtime = createLineage({ spec });
  const projectile = armAttackContinue({
    id: 'bolt', type: 'projectile', alive: true, radius: 0.7, ownerId: 1,
    pos: { x: 50, z: 0 }, vel: { x: -12, z: 0 }, rot: Math.PI,
  });
  const receipt = createSurfaceContactReceipt({
    point: { x: 50, z: 0 }, normal: { x: -1, z: 0 }, velocity: { x: -12, z: 0 },
    material: 'plate', tick: 12, projectileId: 'bolt', surfaceId: 7,
  });
  const result = resolveLiveAttackHit({
    state, spec, runtime, projectile, target: boss, payload: { receipt }, tick: 12,
  });
  assert.equal(result.ok, true, 'the bank verdict is unchanged without presentation');
  assert.ok(!rawEvents.includes('combat:bounceContinued'), 'no bus, no publish — and no crash');
  bindAttackCausalBus(null);
});
