// EAR+FIGHT shared packet C — verb presentation census.
// Every bus verb the audit named must resolve to either an audio recipe, an action-VFX
// recipe, or a reasoned SILENT. The next audit is a test run, not a grep session.
//
// This test never touches the dirty files (vfx.js, audioSystem.js): it asserts against the
// two clean tables (combatVerbCues, actionVfx) plus the recipe catalog, and documents the
// one deferred vfx.js subscriber as data the lane owner lands when its hunk clears.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMBAT_VERB_CUES, PLAYER_ACTION_CUES, combatVerbRecipe } from '../src/audio/combatVerbCues.js';
import { ACTION_VFX_RECIPES } from '../src/render/actionVfx.js';
import { RECIPES } from '../src/data/audioRecipes.js';

const RECIPE_IDS = new Set(RECIPES.map((r) => r.id));

// Verbs the packet-C audit named. `audio` = must resolve via combatVerbRecipe to a catalogued
// recipe. `audioSilent` = must resolve to SILENT with the documented reason owner. `noAudioRow`
// = no row by design (a different wire already plays the sound; reason documented in the table).
// `vfx` = must have an ACTION_VFX_RECIPES entry. `vfxElsewhere` = visual presentation owned
// outside actionVfx (named owners). `noVfxRow` = deliberately visual-silent.
const CENSUS = Object.freeze({
  'bombs:detonated': { audio: 'sfx_bomb_concussion_shove', vfx: true },
  'hull:fractured': { audio: 'sfx_mining_fracture_break', vfx: true, vfxNeedsSubscriber: true },
  'dock:docked': { audio: 'sfx_dock_clunk', vfxElsewhere: 'docking cradle holo + dock clunk' },
  'dock:undocked': { audio: 'sfx_undock_release', vfxElsewhere: 'docking cradle release' },
  'jump:start': { audioSilent: true, vfxElsewhere: 'semantic journey cue travel.jump.committed' },
  'jump:arrive': { audioSilent: true, vfxElsewhere: 'semantic journey cue travel.arrival' },
  'mining:heatChanged': { audioSilent: true, noVfxRow: 'meter, not a sting' },
  'mining:ventReady': { audio: 'sfx_vent_chime', vfxElsewhere: 'presentation.mining.vent_ready world cue' },
  'player:respawn': { audio: 'sfx_respawn_chime', vfxElsewhere: 'spawn placement + respawn chime' },
  brake: { noAudioRow: 'no brake bus event; sfx_brake_bite plays direct in audioSystem._updateBrakeHiss', noVfxRow: 'no brake event to answer' },
  // Control rows: pre-existing recipes the audit confirmed must NOT be duplicated.
  'tether:whipSnap': { audio: 'sfx_tether_crack' },
  'tether:whipImpact': { audio: 'sfx_hull_decompress' },
  'tether:snapCatch': { audio: 'sfx_tether_latch_lock' },
});

// The one-line subscriber the vfx.js lane owner lands when its hunk clears. Kept as data so
// the deferred wire is reviewable and greppable without touching the dirty file.
// Payload fields per src/systems/hullFracture.js emit.
export const DEFERRED_VFX_SUBSCRIBERS = Object.freeze([
  Object.freeze({
    file: 'src/render/vfx.js',
    anchor: '_subscribe',
    line: "add('hull:fractured', (p) => this._onActionVfx('hull:fractured', p));",
    event: 'hull:fractured',
    handler: '_onActionVfx',
    payload: ['victimId', 'seamId', 'hullClass', 'closingSpeed', 'pieceIds', 'pieceCount'],
  }),
]);

describe('packet C verb-presentation census', () => {
  for (const [verb, expectation] of Object.entries(CENSUS)) {
    it(`${verb} resolves to a recipe or a reasoned SILENT`, () => {
      const recipe = combatVerbRecipe(verb);
      if (expectation.audio) {
        assert.equal(recipe, expectation.audio, `${verb} should resolve to ${expectation.audio}`);
        assert.ok(RECIPE_IDS.has(recipe), `${verb} recipe ${recipe} must exist in the audio catalog`);
      } else if (expectation.audioSilent) {
        assert.equal(recipe, '', `${verb} must stay SILENT on the verb-cue route (semantic voice owns it)`);
        const row = PLAYER_ACTION_CUES[verb];
        assert.ok(row && typeof row === 'object' && row.recipe === 'SILENT' && row.reason,
          `${verb} must carry a SILENT row with a reason`);
      } else if (expectation.noAudioRow) {
        assert.equal(recipe, '', `${verb} must have no verb-cue row (${expectation.noAudioRow})`);
        assert.ok(!(verb in PLAYER_ACTION_CUES) && !(verb in COMBAT_VERB_CUES),
          `${verb} must not gain a verb-cue row`);
      }
      if (expectation.vfx) {
        assert.ok(ACTION_VFX_RECIPES[verb], `${verb} must have an ACTION_VFX recipe entry`);
      }
    });
  }

  it('documents the deferred vfx.js subscriber without touching vfx.js', () => {
    assert.equal(DEFERRED_VFX_SUBSCRIBERS.length, 1);
    const [row] = DEFERRED_VFX_SUBSCRIBERS;
    assert.equal(row.event, 'hull:fractured');
    assert.ok(ACTION_VFX_RECIPES[row.event], 'deferred subscriber target must already have an actionVfx recipe');
    assert.deepEqual(row.payload, ['victimId', 'seamId', 'hullClass', 'closingSpeed', 'pieceIds', 'pieceCount']);
  });
});
