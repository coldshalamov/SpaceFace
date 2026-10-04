// FB-142 — skimming, harvesting, plunging and the recovery burn at the Anvil have voices and
// cues. Each of the five planet events emits one composed world cue beside the event (the
// planet.* variants in worldCueRecipes, drawn by the shared ActionVfx cue budget — never a new
// particle pool) and owns one audio route. A refused deposit rides the capacity-refusal voice,
// never a success tone. Band physics is untouched.
import assert from 'node:assert/strict';
import test from 'node:test';

import { planetRuntime } from '../src/systems/planetRuntime.js';
import {
  WORLD_CUE_ACTION_RECIPE,
  isComposedPlanetCue,
  resolveWorldCueReceipt,
} from '../src/render/vfx/worldCueRecipes.js';
import {
  audio,
  PLANET_EVENT_AUDIO,
  PLANET_PLUNGE_VOICE,
  MINE_CAP_REFUSAL_RECIPE,
} from '../src/audio/audioSystem.js';
import { RECIPES } from '../src/data/audioRecipes.js';

const FIVE = [
  'planet:collector',
  'planet:harvest',
  'planet:harvestDenied',
  'planet:plungeStage',
  'planet:recoveryBurn',
];

const FIVE_CUES = [
  'planet.skim.intake',
  'planet.harvest.deposit',
  'planet.harvest.denied',
  'planet.plunge.stage',
  'planet.recovery.burn',
];

function harness() {
  const emitted = [];
  const bus = { emit: (name, p) => emitted.push({ name, p }), on: () => () => {} };
  const player = {
    id: 'p1', type: 'ship', alive: true,
    pos: { x: 120, z: 0 }, vel: { x: 60, z: 0 }, rot: 0, radius: 6,
  };
  const state = {
    simTime: 40, tick: 2400, playerId: 'p1', mode: 'flight',
    entities: new Map([[player.id, player]]),
    input: { boost: true, actions: {} },
  };
  planetRuntime.init({ state, bus, helpers: {}, registry: null });
  return { emitted, state, player, rt: state.planet };
}

function cues(emitted) {
  return emitted.filter((e) => e.name === 'presentation:cue').map((e) => e.p);
}

function hostWith(played = []) {
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
  host.state = { playerId: 'p1', entities: new Map() };
  return host;
}

test('each of the five planet verbs declares one world-cue variant', () => {
  for (const id of FIVE_CUES) {
    const recipe = WORLD_CUE_ACTION_RECIPE.variants[id];
    assert.ok(recipe, `${id} is an admitted world cue`);
    assert.ok(isComposedPlanetCue(id), `${id} is a composed planet cue`);
    assert.ok(recipe.life > 0 && recipe.life < 1.2 && recipe.continuous === false,
      `${id} is a bounded cue, not a pool`);
  }
  // The closed hold is a capacity warning — the same register as mining.cargo.full — never a
  // harvest/yield verb that would read as a successful deposit.
  assert.equal(WORLD_CUE_ACTION_RECIPE.variants['planet.harvest.denied'].verb, 'prime');
});

test('all five events emit one cue beside the event, and every cue resolves to the working ship', () => {
  const { emitted, state, player, rt } = harness();

  // planet:collector → planet.skim.intake (mouth opens; the off transition emits no world cue —
  // its shape rides the action recipe's 'off' variant on the same event).
  state.input.actions.toggleSkimCollector = true;
  planetRuntime._tickHarvest(0.016, state, rt, {});
  state.input.actions.toggleSkimCollector = true;
  planetRuntime._tickHarvest(0.016, state, rt, {});
  const collectorEvents = emitted.filter((e) => e.name === 'planet:collector');
  assert.deepEqual(collectorEvents.map((e) => e.p.on), [true, false]);
  const intake = cues(emitted).filter((c) => c.id === 'planet.skim.intake');
  assert.equal(intake.length, 1, 'one intake cue on the opening edge, none on close');

  // planet:recoveryBurn → planet.recovery.burn on the burn onset.
  rt.player.stage = 'commit'; rt.player.stageAt = 999;
  planetRuntime._tickRecovery(0.016, state, rt,
    { recovery: { assistAccel: 30, tangentialDamp: 1, heatSpike: 0.1 } },
    player, rt.player, 120, 40);
  assert.ok(emitted.some((e) => e.name === 'planet:recoveryBurn' && e.p.on === true));
  assert.equal(cues(emitted).filter((c) => c.id === 'planet.recovery.burn').length, 1);
  // Throttle back: the off transition fires the event but not a second world cue.
  state.input.boost = false;
  planetRuntime._tickRecovery(0.016, state, rt,
    { recovery: { assistAccel: 30, tangentialDamp: 1, heatSpike: 0.1 } },
    player, rt.player, 120, 41);
  assert.ok(emitted.some((e) => e.name === 'planet:recoveryBurn' && e.p.on === false));
  assert.equal(cues(emitted).filter((c) => c.id === 'planet.recovery.burn').length, 1,
    'burn-off rides the action recipe, not a doubled cue');

  // planet:plungeStage → planet.plunge.stage.
  const rec = { stage: 'skim', stageAt: 0, outwardS: 0, burnNextAt: 0 };
  planetRuntime._setStage(rt, player, rec, 'commit', 40, true);
  assert.ok(emitted.some((e) => e.name === 'planet:plungeStage' && e.p.stage === 'commit'));
  const stage = cues(emitted).filter((c) => c.id === 'planet.plunge.stage');
  assert.equal(stage.length, 1);
  assert.equal(stage[0].stage, 'commit', 'the stage rides the cue');

  // planet:harvest → planet.harvest.deposit; a full hold → planet:harvestDenied →
  // planet.harvest.denied.
  const cargoSys = { addCargo: () => 2 };
  rt.player.pendingShallow = 2.4;
  planetRuntime._settle(rt, rt.player, cargoSys, 'pendingShallow', 'cmdty_gas_helium3');
  assert.ok(emitted.some((e) => e.name === 'planet:harvest' && e.p.qty === 2));
  assert.equal(cues(emitted).filter((c) => c.id === 'planet.harvest.deposit').length, 1);

  const fullHold = { addCargo: () => 0 };
  rt.player.pendingRich = 2;
  planetRuntime._settle(rt, rt.player, fullHold, 'pendingRich', 'cmdty_gas_helium3');
  assert.ok(emitted.some((e) => e.name === 'planet:harvestDenied' && e.p.reason === 'cargo_full'));
  assert.equal(cues(emitted).filter((c) => c.id === 'planet.harvest.denied').length, 1);

  // Five events, five cues — and every emitted cue resolves to a receipt on the working ship.
  const emittedCues = cues(emitted);
  assert.equal(emittedCues.length, 5);
  assert.deepEqual(emittedCues.map((c) => c.id).sort(), [...FIVE_CUES].sort());
  for (const cue of emittedCues) {
    const receipt = resolveWorldCueReceipt(cue, state);
    assert.ok(receipt, `${cue.id} resolves to a draw receipt`);
    assert.equal(receipt.pos.x, player.pos.x, `${cue.id} anchors on the ship, not the planet centre`);
    assert.equal(receipt.targetId, player.id);
    assert.ok(receipt.direction && Math.hypot(receipt.direction.x, receipt.direction.z) > 0.5,
      `${cue.id} carries the ship's motion direction`);
  }
});

test('the cue envelope is a bare receipt — the planet verbs add no lanes and no new budgets', () => {
  const { emitted, state, player, rt } = harness();
  state.input.actions.toggleSkimCollector = true;
  planetRuntime._tickHarvest(0.016, state, rt, {});
  const cue = cues(emitted)[0];
  assert.equal(cue.lanes, undefined, 'no adapter lanes — the ActionVfx cue budget owns the picture');
  assert.equal(cue.budgets, undefined, 'no particle budget beyond the shared cue pool');
});

test('five events own five audio routes, and denial speaks in the refusal voice', () => {
  assert.deepEqual(Object.keys(PLANET_EVENT_AUDIO).sort(), [...FIVE].sort());
  const ids = new Set(RECIPES.map((r) => r.id));
  for (const [event, row] of Object.entries(PLANET_EVENT_AUDIO)) {
    assert.ok(ids.has(row.recipeId), `${event} → ${row.recipeId} is an authored recipe`);
  }
  assert.equal(PLANET_EVENT_AUDIO['planet:harvestDenied'].recipeId, MINE_CAP_REFUSAL_RECIPE,
    'deny goes to the refusal voice, never a yield chime');
  for (const stage of ['skim', 'commit', 'breakup', 'descent', 'aftermath', 'clear']) {
    assert.ok(PLANET_PLUNGE_VOICE[stage], `plunge voice covers stage ${stage}`);
  }
});

test('each route plays its recipe: onsets at full voice, releases quieter and lower', () => {
  const played = [];
  const host = hostWith(played);
  host._onPlanetVerb('planet:collector', { on: true });
  host._onPlanetVerb('planet:collector', { on: false });
  assert.deepEqual(played.map((p) => p.recipeId), ['sfx_planet_collector', 'sfx_planet_collector']);
  assert.ok(played[1].opts.rate < played[0].opts.rate && played[1].opts.gain < played[0].opts.gain,
    'closing the mouth is the same voice settling, not a menu blip');

  played.length = 0;
  host._onPlanetVerb('planet:harvest', { commodityId: 'cmdty_gas_helium3', qty: 3 });
  host._onPlanetVerb('planet:harvestDenied', { reason: 'cargo_full' });
  host._onPlanetVerb('planet:recoveryBurn', { on: true });
  assert.deepEqual(played.map((p) => p.recipeId),
    ['sfx_mining_yield', MINE_CAP_REFUSAL_RECIPE, 'sfx_planet_recovery_burn']);
});

test('the plunge ladder escalates with the stage and a foreign hull answers at its position', () => {
  const played = [];
  const host = hostWith(played);
  host.state.entities.set('npc1', { id: 'npc1', pos: { x: 400, z: -60 } });
  host._onPlanetVerb('planet:plungeStage', { id: 'p1', stage: 'commit', isPlayer: true });
  host._onPlanetVerb('planet:plungeStage', { id: 'p1', stage: 'clear', isPlayer: true });
  host._onPlanetVerb('planet:plungeStage', { id: 'npc1', stage: 'breakup', isPlayer: false });
  assert.deepEqual(played.map((p) => p.recipeId), ['sfx_planet_plunge', 'sfx_planet_plunge', 'sfx_planet_plunge']);
  assert.ok(played[0].opts.gain > played[1].opts.gain, 'commit outranks the released stage');
  assert.deepEqual(played[2].opts.position, { x: 400, z: -60 }, 'a foreign plunge answers at its hull');
});
