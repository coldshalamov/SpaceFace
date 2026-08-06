import assert from 'node:assert/strict';
import test from 'node:test';

import { ObjectiveKind } from '../src/ai/contracts.js';
import { COUNTER_TETHER_RESPONSE_TICKS, createSG03ActionPort } from '../src/ai/sg03ActionPort.js';
import { createBus } from '../src/core/eventBus.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';

test('SG-06 overload waits through one real response window and warns once', () => {
  const h = createHarness({ ownerId: 1, targetId: 2 });
  const warnings = [];
  h.bus.on('ai:counterTether', (payload) => warnings.push(payload));

  const first = h.port.canStart(2, 'action_dash', counterRequest(h, ObjectiveKind.COUNTER_TETHER_OVERLOAD));
  assert.deepEqual(first, {
    ok: false,
    reason: 'counter_tether_response_window',
    retryAtTick: h.state.tick + COUNTER_TETHER_RESPONSE_TICKS,
  });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].targetId, h.state.playerId, 'a player-endpoint rope addresses the warning to the player');
  assert.equal(warnings[0].durationTicks, COUNTER_TETHER_RESPONSE_TICKS);

  h.state.tick += 2;
  assert.equal(h.port.canStart(2, 'action_dash', counterRequest(h, ObjectiveKind.COUNTER_TETHER_OVERLOAD)).ok, false);
  assert.equal(warnings.length, 1, 'retries inside the same response window must not spam warnings');

  h.state.tick = first.retryAtTick;
  assert.deepEqual(
    h.port.canStart(2, 'action_dash', counterRequest(h, ObjectiveKind.COUNTER_TETHER_OVERLOAD)),
    { ok: true, reason: 'sg03_predictive_gate' },
  );
});

test('the response gate is AI-only and does not delay an immediate player cut', () => {
  const h = createHarness({ ownerId: 1, targetId: 2 });
  const request = {
    ...counterRequest(h, ObjectiveKind.COUNTER_TETHER_CUT),
    source: 'player',
    actorId: 1,
    target: {
      ...counterRequest(h, ObjectiveKind.COUNTER_TETHER_CUT).target,
      ownedBySelf: true,
      tags: ['owned_by_self', 'cuttable_by_self'],
    },
  };
  assert.deepEqual(h.port.canStart(1, 'action_cut', request), { ok: true, reason: 'sg03_predictive_gate' });
});

test('release during the warning window cancels stale SG-06 action admission', () => {
  const h = createHarness({ ownerId: 1, targetId: 2 });
  const request = counterRequest(h, ObjectiveKind.COUNTER_TETHER_OVERLOAD);
  const first = h.port.canStart(2, 'action_dash', request);
  delete h.state.combat.attachments.byId.att_counter;
  h.state.tick = first.retryAtTick;
  request.tick = h.state.tick;
  assert.deepEqual(h.port.canStart(2, 'action_dash', request), {
    ok: false,
    reason: 'counter_tether_resolved',
  });
});

test('a player-relevant counter-tether warning reaches specific HUD and caption semantics', () => {
  const h = createHarness({ ownerId: 2, targetId: 1 });
  h.state.settings = { video: {}, accessibility: {} };
  const presenter = Object.create(presentationOrchestrator);
  const adapters = Object.create(presentationAdapters);
  const alerts = [];
  const captions = [];
  h.bus.on('alert', (payload) => alerts.push(payload));
  h.bus.on('presentation:caption', (payload) => captions.push(payload));
  presenter.init({ state: h.state, bus: h.bus });
  adapters.init({ state: h.state, bus: h.bus });
  try {
    const request = counterRequest(h, ObjectiveKind.COUNTER_TETHER_CUT);
    request.target.ownedBySelf = true;
    request.target.tags = ['owned_by_self', 'cuttable_by_self'];
    const gate = h.port.canStart(2, 'action_cut', request);
    assert.equal(gate.reason, 'counter_tether_response_window');
    h.bus.flush();

    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].text, 'LINE CUT');
    assert.equal(alerts[0].shape, 'arc');
    assert.equal(captions.length, 1);
    assert.match(captions[0].text, /preparing to cut/i);
    assert.equal(captions[0].assertive, true);
  } finally {
    adapters.dispose();
    presenter.dispose();
  }
});

function createHarness({ ownerId, targetId }) {
  const player = ship(1, 0, 0);
  const enemy = ship(2, 1, 80);
  const state = {
    tick: 10,
    simTime: 10 / 60,
    playerId: player.id,
    player: { heat: 0 },
    world: { currentSectorId: 'sector_ceres_belt' },
    entities: new Map([[player.id, player], [enemy.id, enemy]]),
    entityList: [player, enemy],
  };
  const bus = createBus();
  const port = createSG03ActionPort({ state, bus, helpers: {} });
  state.combat.attachments.byId.att_counter = {
    id: 'att_counter',
    defId: 'tether_standard',
    ownerId,
    targetId,
    state: 'active',
  };
  return { state, bus, port };
}

function counterRequest(h, objective) {
  return {
    source: 'ai',
    tick: h.state.tick,
    actionId: objective === ObjectiveKind.COUNTER_TETHER_CUT ? 'action_cut' : 'action_dash',
    actorId: 2,
    targetId: 'att_counter',
    target: {
      id: 'att_counter',
      attachmentId: 'att_counter',
      ownerId: h.state.combat.attachments.byId.att_counter.ownerId,
      targetId: h.state.combat.attachments.byId.att_counter.targetId,
    },
    objective,
    objectiveReason: objective === ObjectiveKind.COUNTER_TETHER_CUT ? 'exposed_tether' : 'tethered_member',
    squadId: 'counter_squad',
  };
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
    cap: 100,
    capMax: 100,
    data: {
      intent: {},
      ai: id === 2 ? { scenarioActorId: 'counter_raider', hostileTeams: [0] } : {},
    },
  };
}
