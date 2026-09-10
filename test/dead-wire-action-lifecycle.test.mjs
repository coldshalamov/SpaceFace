import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import {
  COMBAT_ACTION_LIFECYCLE_EVENTS,
  COMBAT_ACTION_QUIET_CUES,
  COMBAT_ACTION_SCORED_CUES,
  MINIMAL_ACTION_AUDIO,
  isQuietCombatActionCue,
  requestCombatActionAudio,
  resolveCombatActionLifecycleCue,
  shouldPlayCombatActionCue,
} from '../src/audio/minimalActionAudio.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { bindCombatDenialToasts, formatCombatActionRejectLine } from '../src/ui/toasts.js';

const SEED = 47;

const SCORED_RECIPES = [
  'combat.action.dash.active',
  'combat.action.attach.lock',
  'combat.action.sling.release',
  'combat.action.cut.snap',
  'combat.action.burst.fire',
  'combat.action.cancel',
  'combat.action.reject',
];

function recipeIds() {
  return new Set(RECIPES.map((row) => row.id));
}

function ship(id, team, x) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    hull: 100,
    hullMax: 100,
    shield: 100,
    shieldMax: 100,
    cap: 80,
    capMax: 100,
    data: { intent: {}, ai: {} },
  };
}

function stubPhysics() {
  return {
    applyImpulse() { return true; },
    createAttachment() { return { handle: 1 }; },
    cutAttachment() { return true; },
    setAttachmentReel() { return true; },
    getAttachmentTelemetry() {
      return { tension: 0, length: 40, restLength: 40, stretch: 0 };
    },
  };
}

function bootRaiderScenario() {
  const player = ship(1, 0, 0);
  const raider = ship(2, 1, 40);
  raider.data.ai = { combatDoctrineId: 'tether_control_raider', hostileTeams: [0] };
  const state = {
    tick: 100,
    simTime: 100 / 60,
    playerId: player.id,
    player: { heat: 0 },
    meta: { seed: SEED },
    world: { currentSectorId: 'sector_ceres_belt' },
    entities: new Map([[player.id, player], [raider.id, raider]]),
    entityList: [player, raider],
  };
  const bus = createBus();
  const audioCues = [];
  const lifecycle = [];
  for (const evt of COMBAT_ACTION_LIFECYCLE_EVENTS) {
    bus.on(evt, (payload) => lifecycle.push({ evt, tick: state.tick, payload }));
  }
  bus.on('audio:cue', (payload) => {
    audioCues.push({ id: payload && payload.id, tick: state.tick, cueId: payload && payload.cueId });
  });
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  bindCombatDenialToasts(bus, () => state);
  const presenter = Object.create(presentationOrchestrator);
  presenter.init({ state, bus, helpers: {} });
  const kernel = getCombatKernel({
    state,
    bus,
    helpers: { combatPhysics: stubPhysics() },
  });
  return { state, bus, kernel, presenter, player, raider, audioCues, lifecycle, toasts };
}

function step(kernel, state, n = 1) {
  for (let i = 0; i < n; i++) {
    state.tick += 1;
    state.simTime = state.tick / 60;
    kernel.prePhysics(1 / 60);
    kernel.postPhysics();
    if (typeof state.busFlush === 'function') state.busFlush();
  }
}

function peakBeatsPerSecond(cues, windowTicks = 60) {
  if (!cues.length) return 0;
  const ticks = cues.map((row) => row.tick).sort((a, b) => a - b);
  let peak = 0;
  for (let i = 0; i < ticks.length; i++) {
    const end = ticks[i] + windowTicks;
    let count = 0;
    for (let j = i; j < ticks.length && ticks[j] < end; j++) count += 1;
    peak = Math.max(peak, count);
  }
  return peak;
}

test('PQ-158.06 table length is unchanged by the combat lifecycle router', () => {
  assert.equal(MINIMAL_ACTION_AUDIO.length, 10);
});

test('authored combat.action cue recipes exist for the scored beats', () => {
  const ids = recipeIds();
  for (const id of SCORED_RECIPES) {
    assert.ok(ids.has(id), `missing recipe ${id}`);
    assert.equal(shouldPlayCombatActionCue(id), true, id);
  }
  for (const id of COMBAT_ACTION_QUIET_CUES) {
    assert.equal(isQuietCombatActionCue(id), true, id);
    assert.equal(shouldPlayCombatActionCue(id), false, id);
  }
});

test('each lifecycle event resolves its authored cue string', () => {
  assert.equal(
    resolveCombatActionLifecycleCue('combat:actionPhase', { cueId: 'combat.action.attach.lock' }),
    'combat.action.attach.lock',
  );
  assert.equal(
    resolveCombatActionLifecycleCue('combat:actionCompleted', { actionId: 'action_attach' }),
    'combat.action.attach.end',
  );
  assert.equal(
    resolveCombatActionLifecycleCue('combat:actionCancelled', { actionId: 'action_attach', reason: 'external_cancel' }),
    'combat.action.cancel',
  );
  assert.equal(
    resolveCombatActionLifecycleCue('combat:actionRejected', { actionId: 'action_attach', reason: 'insufficient_capacitor' }),
    'combat.action.reject',
  );
});

test('reel.tick and end cues stay quiet', () => {
  const host = { state: { tick: 10, playerId: 1, entities: new Map() }, play() { this.played = true; } };
  const reel = requestCombatActionAudio(host, 'combat:actionPhase', {
    actorId: 1, actionId: 'action_reel', cueId: 'combat.action.reel.tick',
  }, 10);
  const ended = requestCombatActionAudio(host, 'combat:actionCompleted', {
    actorId: 1, actionId: 'action_attach',
  }, 11);
  assert.equal(reel.cueId, 'combat.action.reel.tick');
  assert.equal(reel.played, false);
  assert.equal(ended.cueId, 'combat.action.attach.end');
  assert.equal(ended.played, false);
  assert.equal(host.played, undefined);
});

test('seed 47 tether-raider scenario: four lifecycle events produce authored cues', () => {
  const h = bootRaiderScenario();
  try {
    h.kernel.actions.requestAction({
      actorId: h.raider.id,
      actionId: 'action_attach',
      source: 'ai',
      target: { entityId: h.player.id },
    });
    step(h.kernel, h.state, 6);

    h.kernel.actions.requestAction({
      actorId: h.player.id,
      actionId: 'action_dash',
      source: 'player',
    });
    step(h.kernel, h.state, 1);
    h.kernel.actions.cancelActive(h.player.id, 'external_cancel');
    step(h.kernel, h.state, 1);

    h.kernel.actions.requestAction({
      actorId: h.player.id,
      actionId: 'action_attach',
      source: 'player',
    });
    step(h.kernel, h.state, 1);

    const kinds = new Set(h.lifecycle.map((row) => row.evt));
    for (const evt of COMBAT_ACTION_LIFECYCLE_EVENTS) {
      assert.ok(kinds.has(evt), `missing ${evt} in ${[...kinds].join(',')}`);
    }

    const log = h.presenter.inspect().combatActionLifecycle || [];
    const playedRows = (cueId, sourceEvent) => log.filter((row) => (
      row.sourceEvent === sourceEvent && row.cueId === cueId
    ));
    assert.ok(playedRows('combat.action.attach.lock', 'combat:actionPhase').some((row) => row.played));
    assert.ok(playedRows('combat.action.attach.end', 'combat:actionCompleted').some((row) => row.quiet && !row.played));
    assert.ok(playedRows('combat.action.cancel', 'combat:actionCancelled').some((row) => row.played));
    assert.ok(playedRows('combat.action.reject', 'combat:actionRejected').some((row) => row.played));

    const played = h.audioCues.map((row) => row.id);
    assert.ok(played.includes('combat.action.attach.lock'), `lock missing in ${played.join(',')}`);
    assert.ok(played.includes('combat.action.cancel'), `cancel missing in ${played.join(',')}`);
    assert.ok(played.includes('combat.action.reject'), `reject missing in ${played.join(',')}`);
    assert.equal(played.includes('combat.action.attach.end'), false);
    assert.equal(played.includes('combat.action.reel.tick'), false);

    assert.ok(h.toasts.some((row) => row.text === 'Need a target' && row.kind === 'error'), `got ${JSON.stringify(h.toasts)}`);
    assert.equal(formatCombatActionRejectLine('insufficient_capacitor'), 'Not enough capacitor');

    const peak = peakBeatsPerSecond(h.audioCues.filter((row) => String(row.id || '').startsWith('combat.action.')));
    assert.ok(peak <= 4, `peak ${peak} cue beats/s`);
    console.log(`DEAD-WIRE action lifecycle seed ${SEED}: peak ${peak} combat.action cue beats/s; played ${played.join(',')}`);
  } finally {
    h.presenter.dispose();
  }
});
