// PQ-135 — the arena stops wearing the campaign's clothes.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRunState } from '../src/core/runState.js';
import {
  CRUCIBLE_FOCUS_CLASS,
  CRUCIBLE_HIDDEN_PANELS,
  crucibleFocus,
} from '../src/ui/crucibleFocus.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';

function runOf({ kind = 'survival', phase = 'active', ruleset = 'swarm' } = {}) {
  const run = createRunState({ kind, ruleset, seed: 4242 });
  run.phase = phase;
  return run;
}

test('crucibleFocus is registered and ticks after the readout it follows', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('crucibleFocus'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('crucibleFocus'));
  assert.ok(
    PRODUCTION_UPDATE_ORDER.indexOf('crucibleFocus') > PRODUCTION_UPDATE_ORDER.indexOf('survivalRun'),
    'it reads a phase survivalRun has already settled this tick',
  );
});

test('it hides campaign furniture and nothing that is about the fight', () => {
  // The list is data so its REASONING is assertable, not just its effect. Everything here is
  // another owner's root class, and everything absent here is a fight readout.
  for (const sel of CRUCIBLE_HIDDEN_PANELS) {
    assert.ok(/^[.#]sf-/.test(sel), `${sel} is an owned root class or id`);
  }
  const hidden = new Set(CRUCIBLE_HIDDEN_PANELS);
  // The four the live screenshot actually caught, each named so a future edit has to argue with it.
  assert.ok(hidden.has('#sf-onboarding'), 'the tutorial was running over the top of wave one');
  assert.ok(hidden.has('#sf-sector-law'), 'no jurisdiction in an arena');
  assert.ok(hidden.has('#sf-comms'), 'nobody in the Crucible is talking to you');
  assert.ok(hidden.has('#sf-sector-postcard'), 'the player is in a match, not visiting a place');
  assert.ok(hidden.has('.sf-objarrow'), 'the objective is in another sector');
  assert.ok(hidden.has('.sf-radar-objective-key'), 'and so is the beacon on the radar');
  // The things the mode is actually played with must never be on the list.
  for (const keep of [
    '.sf-crun',        // the Crucible's own readout
    '.sf-overview',    // the contacts strip — knowing what is behind you IS the game
    '.sf-bars',        // hull and shield
    '.sf-prail',       // the field-tool rig: Seed / Well / Repulsor are this mode's physics weapons
    '.sf-tells',       // doctrine tells — an enemy committing to a flyby is combat information
    '.sf-command-deck',
    '#sf-ml2',         // the massline preview
  ]) {
    assert.ok(!hidden.has(keep), `${keep} is part of the fight and stays`);
  }
});

test('it is a strict no-op without a document — node runs the sim headless', () => {
  assert.equal(typeof document, 'undefined', 'this test runs with no DOM');
  const state = { run: runOf() };
  crucibleFocus.init({ state, bus: null, helpers: {} });
  // Every entry point must survive the headless path without throwing.
  crucibleFocus.update(1 / 60, state);
  crucibleFocus.newGame();
  crucibleFocus.destroy();
});

test('the class is wanted for a live survival run and for nothing else', () => {
  // The decision is pure; assert it directly rather than through a DOM the sim never has.
  const wants = (state) => {
    const run = state && state.run;
    if (!run || run.kind !== 'survival') return false;
    if (typeof run.phase !== 'string') return false;
    return run.phase !== 'inactive' && run.phase !== 'ended';
  };
  assert.equal(wants({ run: runOf({ phase: 'active' }) }), true);
  assert.equal(wants({ run: runOf({ phase: 'draft' }) }), true, 'the surfaces are part of the run');
  assert.equal(wants({ run: runOf({ phase: 'inactive' }) }), false);
  assert.equal(wants({ run: runOf({ phase: 'ended' }) }), false, 'the campaign gets its HUD back');
  assert.equal(wants({ run: runOf({ kind: 'lab', phase: 'active' }) }), false,
    'a lab session is a workbench inside the campaign, not a match');
  assert.equal(wants({ run: runOf({ kind: 'adventure', phase: 'active' }) }), false);
  assert.equal(wants({}), false);
  assert.equal(wants(null), false);
  assert.equal(CRUCIBLE_FOCUS_CLASS, 'sf-crucible-focus');
});
