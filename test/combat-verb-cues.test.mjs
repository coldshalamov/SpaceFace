// Wave C5 — every combat verb names a recipe that already exists.
// fire, hit, shield, hull, shove, throw release, latch, break, slam, kill, dock, undock.
//
// Second half of the row lives below the table pin: the hit-answer harness counts a `play`
// for each mapped recipe. Same rig as hit-answer-channels.test.mjs — the REAL audio system's
// own subscriptions on a REAL bus (audio.init installs every production handler, including
// installCombatVerbCueDispatch's table rows), with audio.play stubbed to a counter. A stubbed
// play still proves which recipe the dispatch asked for; what this half pins is that each
// verb's real emit path reaches play() at all — a table row alone is not a sound.

import test from 'node:test';
import assert from 'node:assert/strict';

import { RECIPES } from '../src/data/audioRecipes.js';
import { COMBAT_VERB_CUES, COMBAT_VERB_IDS, combatVerbRecipe } from '../src/audio/combatVerbCues.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { audio, AUDIO_RECIPE_BY_ID } from '../src/audio/audioSystem.js';

const RECIPE_IDS = new Set(RECIPES.map((recipe) => recipe && recipe.id).filter(Boolean));

const REQUIRED = Object.freeze([
  'fire', 'hit', 'shield', 'hull', 'shove', 'throwRelease',
  'latch', 'break', 'slam', 'kill', 'dock', 'undock',
]);

test('each combat verb maps to one existing recipe, and no two verbs share a recipe', () => {
  assert.deepEqual(COMBAT_VERB_IDS, REQUIRED);
  const used = new Set();
  for (const verbId of REQUIRED) {
    const recipeId = combatVerbRecipe(verbId);
    assert.equal(recipeId, COMBAT_VERB_CUES[verbId]);
    assert.ok(recipeId, `${verbId} has no recipe`);
    assert.ok(RECIPE_IDS.has(recipeId), `${verbId} recipe ${recipeId} is not in the catalog`);
    assert.equal(used.has(recipeId), false, `${verbId} reuses ${recipeId}`);
    used.add(recipeId);
  }
});

// ---- hit-answer half: emit the production receipt, count a play of the mapped recipe ----

// verb -> the real emit that answers it. Every row names the emitter production already
// fires (file:line at authoring time) and the handler chain that lands on play().
const VERB_EMIT = Object.freeze({
  // src/systems/weapons.js fires combat:fire per shot -> _onFire -> resolveWeaponAudioSignature
  // -> recipeForWeapon: the starter pulse bolt owns WEAPON_VARIANT_RECIPE['pulse-bolt'].
  fire: (h) => h.bus.emit('combat:fire', {
    weaponId: 'wpn_pulse_laser_s', ownerId: h.player.id, origin: { x: 2, z: 0 },
  }),
  // src/core/physics.js emits physics:impact per contact -> _onCollision ->
  // resolveCollisionCue: a rock contact at/under SCRAPE_SPEED with no hullDamage is the
  // terrain glance — the scrape is the hull-hit voice for grazing a world body.
  hit: (h) => h.bus.emit('physics:impact', {
    aId: h.player.id, bId: h.rock.id, pos: { x: 6, z: 0 },
    dp: 120, preSolveClosingSpeed: 12, tick: h.state.tick,
  }),
  // src/combat/damage.js emits shieldDown when a hit breaks the layer; the player branch
  // plays the blowout pop (NPC shield breaks take the sfx.shieldBreak signature instead).
  shield: (h) => h.bus.emit('shieldDown', { combatantId: h.player.id, pos: { x: 0, z: 0 } }),
  // src/systems/salvageActions.js emits salvage:reactorVented; the verb-table dispatch
  // (installCombatVerbCueDispatch inside audio.init) answers with the stress groan.
  // The breach poller (_updateHullBreach) owns the same recipe while the cabin vents —
  // pinned in the breach test below.
  hull: (h) => h.bus.emit('salvage:reactorVented', { wreckId: 'c5-wreck' }),
  // combat:shove (onboarding.js combat shove, combat.js) -> handler plays
  // combatVerbRecipe('shove') = the concussion shove.
  shove: (h) => h.bus.emit('combat:shove', { pos: { x: 4, z: 0 } }),
  // tetherGameplay.js emits tether:cut when the line is let go — the release twang. (The
  // rated release rides the massline instrument's own sfx_massline_release by design.)
  throwRelease: (h) => h.bus.emit('tether:cut', { targetId: 'c5-haul' }),
  // tetherGameplay.js latch -> combatVerbRecipe('tether:latched') = the latch lock.
  latch: (h) => h.bus.emit('tether:latched', { targetId: 'c5-haul' }),
  // tetherGameplay.js break -> combatVerbRecipe('tether:broke') = the crack.
  break: (h) => h.bus.emit('tether:broke', { targetId: 'c5-haul' }),
  // masslineImpacts.js emits tether:whipImpact — a snapped line slamming a hull; verb-table
  // dispatch plays the decompress voice.
  slam: (h) => h.bus.emit('tether:whipImpact', { pos: { x: 10, z: 0 } }),
  // combat/damage.js + combat/kernel.js emit entity:killed; a player-killed hull answers
  // with resolveKillMassVoice.confirmRecipeId = the kill confirm under the body voice.
  kill: (h) => h.bus.emit('entity:killed', {
    id: 'c5-victim', killerId: h.player.id, type: 'ship', mass: 9, pos: { x: 8, z: 0 },
  }),
  // dock:docked -> _onDocked plays the clunk; dock:undocked -> _onUndocked the release.
  dock: (h) => h.bus.emit('dock:docked', { stationId: 'st_c5' }),
  undock: (h) => h.bus.emit('dock:undocked', { stationId: 'st_c5' }),
});

function bootHitAnswerHarness() {
  const state = createGameState(4242);
  state.mode = 'flight';
  const bus = createBus();
  const player = {
    id: state.playerId, type: 'ship', alive: true, team: 0, mass: 16,
    hull: 200, hullMax: 200, shield: 40, shieldMax: 40, armorHp: 40, armorMax: 40,
    radius: 6, pos: { x: 0, z: 0 }, rot: 0,
  };
  const rock = {
    id: 'c5-rock', type: 'asteroid', alive: true, mass: 120,
    radius: 30, pos: { x: 20, z: 0 },
  };
  state.entities.set(player.id, player);
  state.entities.set(rock.id, rock);
  audio.init({ state, bus, helpers: {} });

  const played = [];
  const originalPlay = audio.play;
  audio.play = (recipeId, opts) => { played.push(recipeId); return { id: recipeId }; };
  return {
    state, bus, player, rock, played,
    restore() {
      audio.play = originalPlay;
      audio.state = null;
      audio.rt = null;
      audio.bus = null;
    },
  };
}

test('hit-answer harness: every combat verb emit counts a play of its mapped recipe', () => {
  const h = bootHitAnswerHarness();
  try {
    for (const verbId of COMBAT_VERB_IDS) {
      const recipeId = combatVerbRecipe(verbId);
      assert.ok(AUDIO_RECIPE_BY_ID[recipeId],
        `${verbId}: ${recipeId} must exist in the recipe map real play() consults`);
      const emit = VERB_EMIT[verbId];
      assert.ok(emit, `${verbId} has no production emit wired in the harness`);
      const before = h.played.length;
      emit(h);
      assert.ok(h.played.slice(before).includes(recipeId),
        `${verbId}: its emit must reach play('${recipeId}') — got ${h.played.slice(before).join(', ') || 'nothing'}`);
    }
  } finally {
    h.restore();
  }
});

test('hull breach: cabin venting counts the slam voice and the stress groan', () => {
  const h = bootHitAnswerHarness();
  try {
    // The breach poller is the other owner of hull's groan and slam's decompress — it runs
    // off player hull state, not a bus emit. It only speaks while a context is running;
    // the play stub already proves dispatch, so a running-state stand-in is all it reads.
    audio.rt.ctx = { state: 'running', currentTime: 0 };
    h.player.hull = h.player.hullMax * 0.2; // under HULL_BREACH_MIX.engageBelow (0.34)
    audio._updateHullBreach(0, 1 / 60);   // enter edge: the decompress (slam's recipe)
    audio._updateHullBreach(2, 1 / 60);   // past _breachNextGroanS (now + 1.4 s): the groan
    assert.ok(h.played.includes(combatVerbRecipe('slam')),
      'breach enter must play the slam decompress voice');
    assert.ok(h.played.includes(combatVerbRecipe('hull')),
      'breach hold must play the hull stress groan');
  } finally {
    h.restore();
  }
});
