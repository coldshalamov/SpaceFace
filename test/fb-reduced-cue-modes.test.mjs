// FB-077 — every presentation cue declares its reduced-motion form, and no event light is
// deleted outright under reduced motion.
//
// The declaration half lives in cueRecipes.js (the factory derives an honest form when a leaf
// does not name one, and the validator rejects a missing reducedMotionMode). The light half
// lives in vfxAccessibility.js: reduced motion keeps the grammar's 0.1 light floor and a
// longer hold, and it is NOT the same thing as reduced flash.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  PRESENTATION_RECIPES,
  REDUCED_CUE_MODES,
  getPresentationRecipe,
  validatePresentationRecipes,
} from '../src/presentation/cueRecipes.js';
import { IMPACT_REDUCED_FORM } from '../src/presentation/causalVfxGrammar.js';
import {
  applyFlashAccessibility,
  resolveVfxAccessibilityProfile,
} from '../src/render/vfxAccessibility.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';

const PLAYER_ID = 1;

function boot() {
  const state = createGameState(13304);
  state.playerId = PLAYER_ID;
  state.tick = 12;
  state.simTime = 0.2;
  state.settings = { video: {}, accessibility: {} };
  state.entities = new Map([
    [PLAYER_ID, { id: PLAYER_ID, pos: { x: 0, y: 0, z: 0 } }],
  ]);
  const bus = createBus();
  const cues = [];
  bus.on('presentation:cue', (p) => cues.push(p));
  presentationOrchestrator.init({ state, bus });
  return {
    state, bus, cues,
    teardown() { presentationOrchestrator.dispose(); },
  };
}

test('every presentation recipe declares a reduced-motion form', () => {
  const ids = Object.keys(PRESENTATION_RECIPES);
  assert.ok(ids.length >= 80, `expected the full registry, found ${ids.length}`);
  for (const id of ids) {
    const recipe = PRESENTATION_RECIPES[id];
    assert.ok(
      REDUCED_CUE_MODES.includes(recipe.reducedMotionMode),
      `${id} must declare a reducedMotionMode the adapters honour`,
    );
    assert.ok(
      REDUCED_CUE_MODES.includes(recipe.reducedFlashMode),
      `${id} must declare a reducedFlashMode the adapters honour`,
    );
  }
  const report = validatePresentationRecipes();
  assert.equal(report.ok, true, report.issues.join('\n'));
});

test('a recipe with no declared reducedMotionMode fails validation', () => {
  const damage = getPresentationRecipe('world_site.damage');
  const result = validatePresentationRecipes({
    'x.y': { ...damage, id: 'x.y', reducedMotionMode: undefined },
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.includes('reducedMotionMode')));
});

test('the derived forms are honest: critical visual cues hold still, gentle ones slow, silent ones do nothing', () => {
  // A critical cue with a real vfx lane must not simply vanish — it holds its shape.
  assert.equal(getPresentationRecipe('tether.break').reducedMotionMode, 'static_dim');
  // A non-critical visual cue keeps its shape at a reduced rate.
  assert.equal(getPresentationRecipe('mining.drill.contact').reducedMotionMode, 'slow');
  // A cue that drives no visual lane at all is already safe in reduced modes.
  const missed = getPresentationRecipe('massline.release.missed');
  assert.equal(missed.lanes.vfx, 'vfx.none');
  assert.equal(missed.reducedMotionMode, 'unchanged');
  // An explicitly declared leaf keeps its own answer, not the derived one.
  assert.equal(getPresentationRecipe('world_site.damage').reducedMotionMode, 'static_dim');
});

test('the declared form rides the emitted cue for every recipe, not just opted-in leaves', () => {
  const h = boot();
  try {
    // mining.drill.contact declares nothing in source — the derived form must still emit.
    h.bus.emit('drill:spark', { hpFrac: 0.5, hardness: 1, type: 'contact' });
    h.bus.flush();
    const cue = h.cues.find((c) => c.id === 'mining.drill.contact');
    assert.ok(cue, 'the drill contact cue must emit');
    assert.ok(REDUCED_CUE_MODES.includes(cue.reducedMotionMode),
      'the emitted cue carries its declared reduced form');
  } finally { h.teardown(); }
});

test('reduced motion keeps a non-zero light floor and a longer hold — and is not reduced flash', () => {
  const full = resolveVfxAccessibilityProfile({ video: {}, accessibility: {} });
  const motion = resolveVfxAccessibilityProfile({ video: { motionReduce: true }, accessibility: {} });
  const flash = resolveVfxAccessibilityProfile({ video: {}, accessibility: { flashReduce: true } });
  const both = resolveVfxAccessibilityProfile({
    video: { motionReduce: true }, accessibility: { flashReduce: true },
  });

  // No light is deleted outright: every reduced profile keeps the grammar's 0.1 floor.
  assert.equal(IMPACT_REDUCED_FORM.lightFloor, 0.1);
  assert.ok(motion.eventLightPeakScale > 0, 'reduced motion may dim an event light, never delete it');
  assert.equal(motion.eventLightPeakScale, IMPACT_REDUCED_FORM.lightFloor);
  assert.equal(both.eventLightPeakScale, IMPACT_REDUCED_FORM.lightFloor,
    'the combined profile keeps the same floor');
  assert.equal(full.eventLightPeakScale, 1);

  // Reduced motion is NOT reduced flash: the flash profile keeps its own, brighter light level.
  assert.equal(flash.eventLightPeakScale, 0.24);
  assert.ok(flash.eventLightPeakScale > motion.eventLightPeakScale);

  // The hold is appropriately longer — the grammar's 1.8x hold on the flash floor — while the
  // cue still never restores full motion (size/opacity stay scaled down).
  assert.ok(motion.flashMinLife >= full.flashMinLife + 0.15,
    'reduced motion trades the instant spike for a longer readable hold');
  const authored = { life: 0.06, size0: 30, size1: 90, opacity0: 1, opacity1: 0 };
  const held = applyFlashAccessibility(authored, motion);
  assert.ok(held.life >= motion.flashMinLife, 'a short authored flash is held, not cut');
  assert.ok(held.size1 < authored.size1, 'reduced motion is not full motion');
  assert.ok(held.opacity0 < authored.opacity0);
});
