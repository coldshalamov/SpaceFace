// CL-UI-00 pure career ladder presenter unit tests.
// Run: node --test test/career-ladder-ui-view.test.mjs
// Touches only presenter + registers defs in-process; no stationHub/missionLog/package edits.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import {
  LADDER_STATUS,
  clearLadderDefinitions,
  createCareerLaddersSystem,
  registerLadderDefinition,
} from '../src/careers/ladders/careerLadders.js';
import { ensureLadderLeaf, ensureCareerLaddersState } from '../src/careers/ladders/ladderSchema.js';
import { HAULER_LADDER_DEF, HAULER_STEP_PARAMS } from '../src/careers/ladders/haulerLadderDefs.js';
import { HUNTER_LADDER_DEF } from '../src/careers/ladders/hunterLadderDefs.js';
import { PROSPECTOR_LADDER_DEF } from '../src/careers/ladders/prospectorLadderDefs.js';
import { MAP_FOCUS } from '../src/ui/mapAuthority.js';
import {
  buildLadderMapAction,
  buildLadderRailModel,
  buildMissionLogCareerChip,
  resolveObjective,
} from '../src/ui/careerLadderView.js';

function registerAll() {
  clearLadderDefinitions();
  assert.equal(registerLadderDefinition(HAULER_LADDER_DEF).ok, true);
  assert.equal(registerLadderDefinition(HUNTER_LADDER_DEF).ok, true);
  assert.equal(registerLadderDefinition(PROSPECTOR_LADDER_DEF).ok, true);
}

function makeState(opts = {}) {
  const state = createGameState(opts.seed ?? 9101);
  state.mode = 'flight';
  state.simTime = opts.simTime ?? 100;
  state.tick = 6000;
  state.player = state.player || {};
  state.player.credits = 5000;
  state.player.heat = 0;
  state.world = state.world || {};
  state.world.currentSectorId = opts.currentSectorId || 'sector_helios_prime';
  state.careers = state.careers || {};
  state.careers.origins = {
    __meta: { schemaId: 'spaceface.careerOrigins.v1', schemaVersion: 1 },
    hauler: { status: opts.haulerOrigin || 'idle' },
    hunter: { status: opts.hunterOrigin || 'idle' },
    prospector: { status: opts.prospectorOrigin || 'idle' },
  };
  state.missions = state.missions || { active: [], receipts: [], completedLog: [] };
  if (opts.tutorialHints === false) {
    state.settings = state.settings || {};
    state.settings.gameplay = { ...(state.settings.gameplay || {}), tutorialHints: false };
  }
  ensureCareerLaddersState(state);
  return state;
}

function leaf(state, careerId) {
  const def = careerId === 'hauler'
    ? HAULER_LADDER_DEF
    : careerId === 'hunter'
      ? HUNTER_LADDER_DEF
      : PROSPECTOR_LADDER_DEF;
  return ensureLadderLeaf(state, def);
}

function cardById(model, careerId) {
  return model.cards.find((c) => c.careerId === careerId) || null;
}

function assertNoDebugLeak(obj, path = 'root') {
  if (!obj || typeof obj !== 'object') return;
  const forbidden = [
    'rngSeed',
    'ignorePrereqs',
    'skillProof',
    '_recoverReadyEmitted',
  ];
  for (const k of forbidden) {
    assert.equal(Object.prototype.hasOwnProperty.call(obj, k), false, `${path} leaks ${k}`);
  }
  // receipts raw object dump must not appear as a player field
  if (Object.prototype.hasOwnProperty.call(obj, 'receipts')) {
    assert.fail(`${path} leaks receipts map`);
  }
  if (Object.prototype.hasOwnProperty.call(obj, 'orphan')) {
    assert.fail(`${path} leaks orphan flag`);
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertNoDebugLeak(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') assertNoDebugLeak(v, `${path}.${k}`);
  }
}

test('empty registry hides rail', () => {
  clearLadderDefinitions();
  const state = makeState();
  const model = buildLadderRailModel(state, null);
  assert.equal(model.visible, false);
  assert.equal(model.cards.length, 0);
  assert.equal(model.nonBinding, true);
  assert.match(model.note, /never lock/i);
});

test('latent locked: prereq fail disables accept and keeps card hidden', () => {
  registerAll();
  const state = makeState({ haulerOrigin: 'idle' });
  leaf(state, 'hauler');
  const model = buildLadderRailModel(state);
  // Locked latent without prereqMet is not soft-available → no card
  assert.equal(cardById(model, 'hauler'), null);
});

test('latent ready after origin complete: Start-enabled, non-binding peers', () => {
  registerAll();
  const state = makeState({
    haulerOrigin: 'completed',
    hunterOrigin: 'completed',
    prospectorOrigin: 'completed',
  });
  leaf(state, 'hauler');
  leaf(state, 'hunter');
  leaf(state, 'prospector');

  const model = buildLadderRailModel(state);
  assert.equal(model.visible, true);
  assert.equal(model.nonBinding, true);
  assert.match(model.note, /never lock/i);

  const hauler = cardById(model, 'hauler');
  const hunter = cardById(model, 'hunter');
  const prospector = cardById(model, 'prospector');
  assert.ok(hauler && hunter && prospector);
  assert.equal(hauler.nonBinding, true);
  assert.equal(hunter.nonBinding, true);
  assert.equal(prospector.nonBinding, true);

  assert.equal(hauler.status, LADDER_STATUS.LATENT);
  assert.equal(hauler.statusLabel, 'available');
  assert.equal(hauler.prereqMet, true);
  assert.equal(hauler.prereqLabel, null);
  assert.equal(hauler.canAccept, true);
  assert.equal(hauler.canDecline, false);
  assert.equal(hauler.nextAction, 'Start this professional path when ready.');
  assert.match(hauler.objective, /Desk wants real tickets/i);

  assertNoDebugLeak(model);
});

test('offered: accept + decline, next action ready', () => {
  registerAll();
  const state = makeState({ haulerOrigin: 'completed' });
  const own = leaf(state, 'hauler');
  own.status = LADDER_STATUS.OFFERED;
  own.stepId = 'broker_desk';
  own.stepIndex = 0;

  const model = buildLadderRailModel(state);
  const hauler = cardById(model, 'hauler');
  assert.ok(hauler);
  assert.equal(hauler.statusLabel, 'offered');
  assert.equal(hauler.canAccept, true);
  assert.equal(hauler.canDecline, true);
  assert.equal(hauler.canAbandon, true);
  assert.equal(hauler.nextAction, 'Start this professional path when ready.');
});

test('declined: still Start-enabled when prereqs met (not sole offer.canAccept)', () => {
  registerAll();
  const state = makeState({ haulerOrigin: 'completed' });
  const own = leaf(state, 'hauler');
  own.status = LADDER_STATUS.DECLINED;

  const model = buildLadderRailModel(state);
  const hauler = cardById(model, 'hauler');
  assert.ok(hauler);
  assert.equal(hauler.statusLabel, 'passed');
  assert.equal(hauler.canAccept, true);
  assert.equal(hauler.canDecline, false);
  assert.equal(hauler.nextAction, 'Still available later. Start when ready.');
});

test('active hauler broker: objective + progress + map action', () => {
  registerAll();
  const state = makeState({
    haulerOrigin: 'completed',
    currentSectorId: 'sector_helios_prime',
  });
  const own = leaf(state, 'hauler');
  own.status = LADDER_STATUS.ACTIVE;
  own.stepId = 'broker_desk';
  own.stepIndex = 0;
  own.steps.broker_desk.status = 'active';

  const model = buildLadderRailModel(state);
  const hauler = cardById(model, 'hauler');
  assert.ok(hauler);
  assert.equal(hauler.statusLabel, 'active');
  assert.equal(hauler.canAccept, false);
  assert.equal(hauler.stepTitle, 'Broker Desk');
  assert.match(hauler.progressLabel, /Step 1\/6/);
  assert.match(hauler.progressLabel, /Broker Desk/);
  assert.equal(hauler.objective, HAULER_STEP_PARAMS.broker_desk.acceptLine);
  assert.ok(hauler.mapAction);
  assert.equal(hauler.mapAction.focus, MAP_FOCUS.LOCAL);
  assert.equal(hauler.mapAction.source, 'careerLadder:hauler');
  assert.equal(hauler.mapAction.stationId, 'station_coalition');
  assert.equal(hauler.choices.length, 0);
  assert.equal(hauler.canChoose, false);
});

test('active hauler risk_lane_tax: all three choice labels', () => {
  registerAll();
  const state = makeState({ haulerOrigin: 'completed' });
  const own = leaf(state, 'hauler');
  own.status = LADDER_STATUS.ACTIVE;
  own.stepId = 'risk_lane_tax';
  own.stepIndex = 2;
  own.steps.risk_lane_tax.status = 'active';
  own.steps.risk_lane_tax.choiceId = null;

  const model = buildLadderRailModel(state);
  const hauler = cardById(model, 'hauler');
  assert.ok(hauler);
  assert.equal(hauler.canChoose, true);
  assert.equal(hauler.choices.length, 3);
  const ids = hauler.choices.map((c) => c.id);
  assert.deepEqual(ids, ['pay_toll', 'run_guns', 'veer_slip']);
  assert.equal(hauler.choices[0].label, 'Pay the lane toll');
  assert.equal(hauler.choices[1].label, 'Run the guns');
  assert.equal(hauler.choices[2].label, 'Veer the slip');
  assert.equal(hauler.nextAction, 'Pay, run, or veer — pick the lane.');
  // No raw consequence amounts / credit dumps on choice objects
  for (const ch of hauler.choices) {
    assert.equal(Object.prototype.hasOwnProperty.call(ch, 'consequences'), false);
    assert.ok(ch.enabled);
  }
});

test('hunter capture_window + ledger_choice labels; prospector has no choices', () => {
  registerAll();
  const state = makeState({
    hunterOrigin: 'completed',
    prospectorOrigin: 'completed',
  });

  const hunter = leaf(state, 'hunter');
  hunter.status = LADDER_STATUS.ACTIVE;
  hunter.stepId = 'capture_window';
  hunter.stepIndex = 3;
  hunter.steps.capture_window.status = 'active';
  hunter.steps.capture_window.choiceId = null;

  const prospector = leaf(state, 'prospector');
  prospector.status = LADDER_STATUS.ACTIVE;
  prospector.stepId = 'survey_circuit';
  prospector.stepIndex = 0;
  prospector.steps.survey_circuit.status = 'active';

  const model = buildLadderRailModel(state);
  const h = cardById(model, 'hunter');
  const p = cardById(model, 'prospector');
  assert.ok(h && p);

  assert.equal(h.canChoose, true);
  assert.deepEqual(h.choices.map((c) => c.id), ['capture', 'execute']);
  assert.deepEqual(h.choices.map((c) => c.label), ['Take them in', 'Finish clean']);
  assert.equal(h.nextAction, 'Choose how this closes.');
  assert.match(h.objective, /Disable the mark/i);

  // Prospector non-choice: no invented moral fork
  assert.equal(p.canChoose, false);
  assert.equal(p.choices.length, 0);
  assert.match(p.objective, /Survey three sites/i);

  // Ledger choices when on that step
  hunter.stepId = 'ledger_choice';
  hunter.stepIndex = 4;
  hunter.steps.ledger_choice.status = 'active';
  hunter.steps.ledger_choice.choiceId = null;
  const model2 = buildLadderRailModel(state);
  const h2 = cardById(model2, 'hunter');
  assert.deepEqual(h2.choices.map((c) => c.id), ['file_law', 'sell_dark']);
  assert.deepEqual(h2.choices.map((c) => c.label), ['File with law', 'Sell dark']);
});

test('recovering countdown from simTime; ready unlocks recover', () => {
  registerAll();
  const state = makeState({ haulerOrigin: 'completed', simTime: 100 });
  const own = leaf(state, 'hauler');
  own.status = LADDER_STATUS.RECOVERING;
  own.stepId = 'broker_desk';
  own.stepIndex = 0;
  own.recoverReadyAtS = 130;
  own.attemptMult = 0.85;
  own.steps.broker_desk.status = 'recovering';
  own.steps.broker_desk.failures = 1;

  let model = buildLadderRailModel(state);
  let hauler = cardById(model, 'hauler');
  assert.ok(hauler);
  assert.equal(hauler.statusLabel, 'recovering');
  assert.equal(hauler.recovery.ready, false);
  assert.equal(hauler.recovery.secondsLeft, 30);
  assert.equal(hauler.recovery.readyAtS, 130);
  assert.equal(hauler.canRecover, false);
  assert.equal(hauler.nextAction, 'Wait 30s, then retry.');
  assert.equal(hauler.attemptMultLabel, 'Pay reduced (×0.85)');
  assert.ok(hauler.failureLine);

  // Advance simTime past ready
  state.simTime = 130;
  model = buildLadderRailModel(state);
  hauler = cardById(model, 'hauler');
  assert.equal(hauler.recovery.ready, true);
  assert.equal(hauler.recovery.secondsLeft, 0);
  assert.equal(hauler.canRecover, true);
  assert.equal(hauler.nextAction, 'Retry the step.');
});

test('step_failed status supported for recover/abandon gates', () => {
  registerAll();
  const state = makeState({ haulerOrigin: 'completed', simTime: 200 });
  const own = leaf(state, 'hauler');
  own.status = LADDER_STATUS.STEP_FAILED;
  own.stepId = 'bonded_convoy';
  own.stepIndex = 1;
  own.recoverReadyAtS = 200;
  own.steps.bonded_convoy.status = 'failed';

  const model = buildLadderRailModel(state);
  const hauler = cardById(model, 'hauler');
  assert.ok(hauler);
  assert.equal(hauler.statusLabel, 'failed');
  assert.equal(hauler.canRecover, true);
  assert.equal(hauler.canAbandon, true);
  assert.equal(hauler.canAccept, false);
});

test('completed: collapsed chip, peers stay open copy', () => {
  registerAll();
  const state = makeState({ haulerOrigin: 'completed' });
  const own = leaf(state, 'hauler');
  own.status = LADDER_STATUS.COMPLETED;
  own.stepId = 'lane_infrastructure';
  own.stepIndex = 4;

  const model = buildLadderRailModel(state);
  const hauler = cardById(model, 'hauler');
  assert.ok(hauler);
  assert.equal(hauler.statusLabel, 'complete');
  assert.equal(hauler.collapsed, true);
  assert.equal(hauler.canAccept, false);
  assert.equal(hauler.nextAction, 'Path complete. Others stay open.');
  assert.equal(hauler.nonBinding, true);
});

test('readable receipt lines never expose raw receipt ids', () => {
  registerAll();
  const state = makeState({ hunterOrigin: 'completed' });
  const own = leaf(state, 'hunter');
  own.status = LADDER_STATUS.ACTIVE;
  own.stepId = 'capture_window';
  own.stepIndex = 3;
  own.steps.capture_window.choiceId = 'capture';
  own.history = [
    { t: 50, kind: 'step_done', stepId: 'escalation_package' },
    { t: 80, kind: 'choice', stepId: 'capture_window', choiceId: 'capture' },
  ];
  own.receipts = { 'choice:hunter:capture_window:capture': true };
  own.rngSeed = 999;

  const model = buildLadderRailModel(state);
  const h = cardById(model, 'hunter');
  assert.ok(h);
  assert.equal(h.receiptLine, 'Chose Take them in.');
  assert.equal(h.canChoose, false); // choice already resolved
  assertNoDebugLeak(h);
  assert.equal(Object.prototype.hasOwnProperty.call(h, 'rngSeed'), false);
  assert.doesNotMatch(JSON.stringify(h), /choice:hunter:capture_window:capture/);
});

test('mission log chip surfaces active ladder only', () => {
  registerAll();
  const state = makeState({
    haulerOrigin: 'completed',
    hunterOrigin: 'completed',
  });
  const hauler = leaf(state, 'hauler');
  hauler.status = LADDER_STATUS.ACTIVE;
  hauler.stepId = 'broker_desk';
  hauler.stepIndex = 0;

  leaf(state, 'hunter'); // latent ready → rail yes, chip no

  const chip = buildMissionLogCareerChip(state);
  assert.equal(chip.nonBinding, true);
  assert.equal(chip.visible, true);
  assert.ok(chip.primary);
  assert.equal(chip.primary.careerId, 'hauler');
  assert.equal(chip.primary.status, LADDER_STATUS.ACTIVE);
  assert.ok(chip.primary.mapAction);
  assert.equal(chip.chips.some((c) => c.careerId === 'hunter'), false);
});

test('buildLadderMapAction: hauler cross-sector uses STAR MAP', () => {
  registerAll();
  const state = makeState({
    haulerOrigin: 'completed',
    currentSectorId: 'sector_helios_prime',
  });
  const own = leaf(state, 'hauler');
  own.status = LADDER_STATUS.ACTIVE;
  own.stepId = 'bonded_convoy';
  own.stepIndex = 1;

  const action = buildLadderMapAction(state, 'hauler');
  assert.ok(action);
  assert.equal(action.focus, MAP_FOCUS.GALAXY);
  assert.equal(action.label, 'STAR MAP');
  assert.equal(action.sectorId, 'sector_ceres_belt');
  assert.equal(action.stationId, 'station_ceres');
  assert.equal(action.source, 'careerLadder:hauler');
  assert.equal(action.screenId, 'galaxyMap');
});

test('buildLadderMapAction: hunter/prospector local focus', () => {
  registerAll();
  const state = makeState({
    hunterOrigin: 'completed',
    prospectorOrigin: 'completed',
    currentSectorId: 'sector_helios_prime',
  });
  const h = leaf(state, 'hunter');
  h.status = LADDER_STATUS.ACTIVE;
  h.stepId = 'doctrine_pursuit';
  h.stepIndex = 1;

  const p = leaf(state, 'prospector');
  p.status = LADDER_STATUS.ACTIVE;
  p.stepId = 'survey_circuit';
  p.stepIndex = 0;

  const ha = buildLadderMapAction(state, 'hunter');
  const pa = buildLadderMapAction(state, 'prospector');
  assert.equal(ha.focus, MAP_FOCUS.LOCAL);
  assert.equal(ha.source, 'careerLadder:hunter');
  assert.equal(pa.focus, MAP_FOCUS.LOCAL);
  assert.equal(pa.source, 'careerLadder:prospector');
});

test('resolveObjective order: string / playerVisible / acceptLine / fallback', () => {
  assert.equal(resolveObjective({ objective: 'Alpha line.' }), 'Alpha line.');
  assert.equal(
    resolveObjective({ objective: { playerVisible: 'Visible obj.' } }),
    'Visible obj.',
  );
  assert.equal(
    resolveObjective({ dialogue: { acceptLine: 'Accept me.' } }),
    'Accept me.',
  );
  assert.equal(resolveObjective(null), 'Continue the path.');
  assert.equal(
    resolveObjective({ id: 'broker_desk' }, 'hauler'),
    HAULER_STEP_PARAMS.broker_desk.acceptLine,
  );
});

test('tutorialHints false suppresses teach', () => {
  registerAll();
  const state = makeState({ haulerOrigin: 'completed', tutorialHints: false });
  const own = leaf(state, 'hauler');
  own.status = LADDER_STATUS.ACTIVE;
  own.stepId = 'broker_desk';
  own.stepIndex = 0;

  const model = buildLadderRailModel(state);
  const hauler = cardById(model, 'hauler');
  assert.equal(hauler.teach, null);
});

test('api bag + registry-style resolution', () => {
  registerAll();
  const state = makeState({ haulerOrigin: 'completed' });
  leaf(state, 'hauler');
  const system = createCareerLaddersSystem();
  system.init({ state, bus: { on() {}, emit() {} }, registry: null });

  const viaSystem = buildLadderRailModel(state, system);
  assert.ok(cardById(viaSystem, 'hauler'));

  const viaRegistry = buildLadderRailModel(state, {
    get: (name) => (name === 'careerLadders' ? system : null),
  });
  assert.ok(cardById(viaRegistry, 'hauler'));
});

test('presenter is pure: no state mutation of ladder leaves', () => {
  registerAll();
  const state = makeState({ haulerOrigin: 'completed', simTime: 50 });
  const own = leaf(state, 'hauler');
  own.status = LADDER_STATUS.RECOVERING;
  own.recoverReadyAtS = 80;
  own.stepId = 'broker_desk';
  const before = JSON.stringify(state.careers.ladders);

  buildLadderRailModel(state);
  buildMissionLogCareerChip(state);
  buildLadderMapAction(state, 'hauler');

  assert.equal(JSON.stringify(state.careers.ladders), before);
});

test('skillProof unlock path without origin complete', () => {
  registerAll();
  const state = makeState({ haulerOrigin: 'idle' });
  ensureCareerLaddersState(state);
  state.careers.ladders.__meta.skillProof = { cargo_delivery_complete: 1 };
  leaf(state, 'hauler');

  const model = buildLadderRailModel(state);
  const hauler = cardById(model, 'hauler');
  assert.ok(hauler);
  assert.equal(hauler.prereqMet, true);
  assert.equal(hauler.canAccept, true);
});

test('abandoned path hidden from rail', () => {
  registerAll();
  const state = makeState({ haulerOrigin: 'completed' });
  const own = leaf(state, 'hauler');
  own.status = LADDER_STATUS.ABANDONED;

  const model = buildLadderRailModel(state);
  assert.equal(cardById(model, 'hauler'), null);
});
