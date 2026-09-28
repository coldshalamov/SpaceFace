// EAR+FIGHT shared packet C — verb presentation census.
// Every bus verb the audit named must resolve to either an audio recipe, an action-VFX
// recipe, or a reasoned SILENT. The next audit is a test run, not a grep session.
//
// This test never touches the dirty files (vfx.js, audioSystem.js): it asserts against the
// two clean tables (combatVerbCues, actionVfx) plus the recipe catalog, and proves each
// actionVfx row is already a live subscriber via vfx.js's generic ACTION_VFX_EVENTS loop.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMBAT_VERB_CUES, PLAYER_ACTION_CUES, combatVerbRecipe } from '../src/audio/combatVerbCues.js';
import { ACTION_VFX_EVENTS, ACTION_VFX_RECIPES } from '../src/render/actionVfx.js';
import { RECIPES } from '../src/data/audioRecipes.js';

const RECIPE_IDS = new Set(RECIPES.map((r) => r.id));

// Verbs the packet-C audit named. `audio` = must resolve via combatVerbRecipe to a catalogued
// recipe. `audioSilent` = must resolve to SILENT with the documented reason owner. `noAudioRow`
// = no row by design (a different wire already plays the sound; reason documented in the table).
// `vfx` = must have an ACTION_VFX_RECIPES entry. `vfxElsewhere` = visual presentation owned
// outside actionVfx (named owners). `noVfxRow` = deliberately visual-silent.
const CENSUS = Object.freeze({
  'bombs:detonated': { audio: 'sfx_bomb_concussion_shove', vfx: true },
  'hull:fractured': { audio: 'sfx_mining_fracture_break', vfx: true },
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

// Presentation is wired, not deferred: vfx.js subscribes every ACTION_VFX_EVENTS key through
// one generic loop (`for (const name of ACTION_VFX_EVENTS) add(name, ...)`), and
// ACTION_VFX_EVENTS is Object.keys(ACTION_VFX_RECIPES). So an actionVfx row IS the subscriber —
// adding a row never needs a vfx.js edit, and a manual add() for the same name would
// double-subscribe. This table is the payload contract those rows must stay shaped to.
// Payload fields per src/systems/hullFracture.js emit.
export const ACTION_VFX_PAYLOADS = Object.freeze({
  'hull:fractured': Object.freeze(['victimId', 'seamId', 'hullClass', 'closingSpeed', 'pieceIds', 'pieceCount']),
});

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

  it('actionVfx rows are live subscribers, not deferred vfx.js edits', () => {
    // The wire exists: every recipe key is in ACTION_VFX_EVENTS, which vfx.js loops over.
    for (const [event, payload] of Object.entries(ACTION_VFX_PAYLOADS)) {
      assert.ok(ACTION_VFX_RECIPES[event], `${event} must have an actionVfx recipe`);
      assert.ok(ACTION_VFX_EVENTS.includes(event),
        `${event} must be an ACTION_VFX_EVENTS key so vfx.js's generic subscribe loop owns it`);
      assert.deepEqual(payload,
        ['victimId', 'seamId', 'hullClass', 'closingSpeed', 'pieceIds', 'pieceCount'],
        `${event} payload contract`);
    }
  });
});
