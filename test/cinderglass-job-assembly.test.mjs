// Exercise the current production assembly and its canonical owner seams.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeProductionSystemLookup } from '../src/runtime/nodeSystemFactoryTable.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, validateSystemClockDeclarations } from '../src/runtime/authoritativeSystemManifest.js';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';
import { DOMAIN_MIRROR_KEYS } from '../scripts/lib/simReadModel.mjs';
import { FRESH_RUN_SYSTEMS } from '../src/core/runReset.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { COMBAT_PROFILES, ATTACHMENT_DEFS } from '../src/data/combatDefs.js';

test('production assembly connects Node factories, clock, worker commands/mirror/reset and strict owner methods',()=>{
  const lookup = createNodeProductionSystemLookup();
  for(const id of ['cinderglassJob','cinderglassJobPrompt']) {
    assert.ok(lookup.get(id)); assert.equal(PRODUCTION_INIT_ORDER.filter(x=>x===id).length,1);
    assert.ok(FRESH_RUN_SYSTEMS.includes(id));
  }
  assert.equal(PRODUCTION_UPDATE_ORDER.filter(x=>x==='cinderglassJob').length,1);
  assert.deepEqual(validateSystemClockDeclarations(),[]);
  for(const e of ['cinderglassJob:action','cinderglassJob:presentationReady']) assert.ok(MAIN_TO_SIM_BUS_EVENTS.has(e));
  assert.ok(DOMAIN_MIRROR_KEYS.includes('cinderglassJobView'));
  assert.equal(typeof economy.settleCounterweightResult,'function','concurrent Counterweight owner preserved');
  assert.equal(typeof economy.settleCinderglassResult,'function');
  assert.equal(typeof cargo.receiveCinderglassPod,'function');
  assert.ok(COMBAT_PROFILES.some(r=>r.id==='combat_profile_cinderglass_latch'));
  assert.ok(ATTACHMENT_DEFS.some(r=>r.id==='attachment_cinderglass_latch_mount'));
});
