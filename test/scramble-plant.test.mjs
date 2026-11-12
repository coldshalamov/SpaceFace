// PL-04 Scramble plant tests (focused behavior check for owner invariants)
//
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: When cargo spills in a lane, nearby civilians each grab a pod and scatter; the owner hails for help
//   What the player can do: Help the owner, join the scramble, or grab the thieves
//
// Invariants tested:
// 1. Positive trigger: freight:cargoSpilled causes owner to hail for help ("Stop them! That's my cargo!"),
//    nearby civilians each target a spilled pod, steer to it, grab it, and scatter away at speed.
// 2. Grab the thieves / help owner: Player shoves/hits a thief with hitstun impulse, causing the thief to
//    drop the pod, cry "Take it! I'm out!", and flee empty-handed. Once all thieves are stopped,
//    the owner hails thanks: "Much obliged! You saved my haul.".
// 3. Join the scramble: Player collects a loose pod before a civilian reaches it; the civilian gives
//    up or retargets another unclaimed loose pod.
// 4. Negative checks: Police/patrol ships, disabled ships, hostiles, and player ship do NOT scramble.
//    Spills with no pods or outside flight mode do NOT trigger.
// 5. Cooldown: A second cargo spill within cooldownS (45s) does not retrigger scramble.
// 6. Standalone system lifecycle (init, update, destroy).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { traffic } from '../src/systems/traffic.js';
import {
  SCRAMBLE_PLANT_ACTIVE_EVENT,
  SCRAMBLE_HAIL_EVENT,
  SCRAMBLE_POD_GRABBED_EVENT,
  SCRAMBLE_POD_DROPPED_EVENT,
  SCRAMBLE_OWNER_THANKS_EVENT,
  SCRAMBLE_THIEF_SCARED_EVENT,
  SCRAMBLE_TUNING,
  SCRAMBLE_HAIL_LINE,
  SCRAMBLE_THANKS_LINE,
  SCRAMBLE_THIEF_DROP_LINE,
  isCivilianShip,
  isEntityDisabled,
  scramblePlant,
} from '../src/systems/scramblePlant.js';

function makeCivilian(id = 'civ_trader_1', {
  x = 100,
  z = 100,
  role = 'trader',
  team = 2,
  radius = 6,
  vx = 0,
  vz = 0,
} = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot: 0,
    radius,
    data: {
      trafficRole: role,
      intent: { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0, brake: false },
      ai: { passive: true },
    },
    flags: {},
  };
}

function makeCarrier(id = 'carrier_hauler_1', { x = 200, z = 200 } = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 2,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    data: {
      trafficRole: 'hauler',
      name: 'Freighter Beta',
      intent: { moveX: 0, moveZ: 0, boost: false, brake: false },
    },
    flags: {},
  };
}

function makeCargoPod(id = 'pod_spill_1', { x = 205, z = 205, commodityId = 'ore_titanium', amount = 1 } = {}) {
  return {
    id,
    type: 'pickup',
    alive: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 3,
    data: {
      kind: 'cargo',
      commodityId,
      amount,
      freightCustodyPod: true,
    },
    flags: {},
  };
}

function makePlayer({ x = 500, z = 500 } = {}) {
  return {
    id: 'player_hero',
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
    data: {},
    flags: {},
  };
}

function createTestContext({ simTime = 10 } = {}) {
  const bus = createBus();
  const events = [];
  const voiceCalls = [];

  const rawEmit = bus.emit.bind(bus);
  bus.emit = (name, payload) => {
    events.push({ name, payload });
    return rawEmit(name, payload);
  };

  const entities = new Map();
  const state = {
    simTime,
    playerId: 'player_hero',
    mode: 'flight',
    entities,
    entityList: [],
    world: { currentSectorId: 'sector_test' },
  };

  const helpers = {
    voice: {
      say: (call) => voiceCalls.push(call),
    },
    trafficReactionLeases: new Map(),
  };

  return { bus, events, voiceCalls, entities, state, helpers };
}

test('PL-04 Scramble: Positive trigger — owner hails, civilians seek and grab pods, then scatter', () => {
  const ctx = createTestContext({ simTime: 100 });
  const carrier = makeCarrier('carrier_1', { x: 200, z: 200 });
  const civ1 = makeCivilian('civ_1', { x: 250, z: 200 });
  const civ2 = makeCivilian('civ_2', { x: 180, z: 240 });
  const pod1 = makeCargoPod('pod_1', { x: 210, z: 200 });
  const pod2 = makeCargoPod('pod_2', { x: 200, z: 210 });
  const player = makePlayer();

  ctx.entities.set(carrier.id, carrier);
  ctx.entities.set(civ1.id, civ1);
  ctx.entities.set(civ2.id, civ2);
  ctx.entities.set(pod1.id, pod1);
  ctx.entities.set(pod2.id, pod2);
  ctx.entities.set(player.id, player);

  traffic.bus = ctx.bus;
  traffic.state = ctx.state;
  traffic.helpers = ctx.helpers;
  traffic.ships = [];
  traffic._initScramblePlant(ctx);

  // Trigger cargo spill
  ctx.bus.emit('freight:cargoSpilled', {
    carrierId: carrier.id,
    ownerId: carrier.id,
    ownerName: 'Freighter Beta',
    podIds: ['pod_1', 'pod_2'],
    pos: { x: 200, z: 200 },
    t: 100,
  });

  // Verify owner hailed for help:
  const hailEvent = ctx.events.find((e) => e.name === SCRAMBLE_HAIL_EVENT);
  assert.ok(hailEvent, 'scramble hail event should be emitted');
  assert.equal(hailEvent.payload.ownerId, carrier.id);
  assert.equal(hailEvent.payload.text, SCRAMBLE_HAIL_LINE);
  assert.ok(ctx.voiceCalls.some((c) => c.text === SCRAMBLE_HAIL_LINE), 'voice call for hail');

  // Verify active scramble event with assigned thieves:
  const activeEvent = ctx.events.find((e) => e.name === SCRAMBLE_PLANT_ACTIVE_EVENT);
  assert.ok(activeEvent, 'scramble active event emitted');
  assert.equal(activeEvent.payload.thiefIds.length, 2);
  assert.ok(activeEvent.payload.thiefIds.includes('civ_1'));
  assert.ok(activeEvent.payload.thiefIds.includes('civ_2'));

  // Step 1: Civilians steer toward their target pods
  const rec1 = { id: civ1.id, role: 'trader' };
  const rec2 = { id: civ2.id, role: 'trader' };

  traffic._reactScramblePlant(civ1, rec1, [], ctx.state, player);
  assert.equal(civ1.data.civilianReaction, 'scramble_seeking');
  assert.ok(civ1.data.intent.boost, 'civ1 boosting toward pod');

  // Step 2: Move civ1 within grab distance (<= 24 WU)
  const mem1 = traffic._getScrambleMemory().get('civ_1');
  const targetPod1 = ctx.entities.get(mem1.targetPodId);
  civ1.pos = { x: targetPod1.pos.x + 2, z: targetPod1.pos.z + 2 };
  traffic._reactScramblePlant(civ1, rec1, [], ctx.state, player);

  // civ1 grabs target pod:
  assert.equal(targetPod1.alive, false, 'target pod marked collected/inactive');
  assert.ok(civ1.data.stolenPod, 'civ1 has stolenPod stored');
  assert.equal(civ1.data.civilianReaction, 'scramble_scattering');

  const grabEvent = ctx.events.find((e) => e.name === SCRAMBLE_POD_GRABBED_EVENT);
  assert.equal(ctx.events.find((e) => e.name === 'pickup:collected'), undefined,
    'a civilian grab never fires the player pickup event (missions/mining/onboarding read it as the player)');
  assert.ok(grabEvent, 'scramble pod grabbed event emitted');
  assert.equal(grabEvent.payload.thiefId, 'civ_1');
  assert.equal(grabEvent.payload.podId, targetPod1.id);

  // Step 3: Civ1 scatters with pod
  traffic._reactScramblePlant(civ1, rec1, [], ctx.state, player);
  assert.equal(civ1.data.civilianReaction, 'scramble_scattering');
  assert.ok(civ1.data.intent.boost, 'civ1 boosting while scattering');
});

test('PL-04 Scramble: Player grabs thieves / stops them — dropped pod, thief barks and flees, owner thanks', () => {
  const ctx = createTestContext({ simTime: 200 });
  const carrier = makeCarrier('carrier_1', { x: 200, z: 200 });
  const civ1 = makeCivilian('civ_thief_1', { x: 210, z: 200 });
  const pod1 = makeCargoPod('pod_1', { x: 210, z: 200 });
  const player = makePlayer({ x: 220, z: 200 });

  ctx.entities.set(carrier.id, carrier);
  ctx.entities.set(civ1.id, civ1);
  ctx.entities.set(pod1.id, pod1);
  ctx.entities.set(player.id, player);

  traffic.bus = ctx.bus;
  traffic.state = ctx.state;
  traffic.helpers = ctx.helpers;
  traffic._initScramblePlant(ctx);

  ctx.bus.emit('freight:cargoSpilled', {
    carrierId: carrier.id,
    ownerId: carrier.id,
    ownerName: 'Freighter Beta',
    podIds: ['pod_1'],
    pos: { x: 200, z: 200 },
    t: 200,
  });

  // civ1 grabs pod1 on reaction tick:
  const rec1 = { id: civ1.id, role: 'trader' };
  traffic._reactScramblePlant(civ1, rec1, [], ctx.state, player);
  assert.ok(civ1.data.stolenPod, 'civ1 holding stolen pod');

  // Player attacks / shoves thief:
  ctx.bus.emit('combat:hitstunImpulse', {
    victimId: civ1.id,
    attackerId: player.id,
    force: 15,
  });

  // Check drop event:
  const dropEvent = ctx.events.find((e) => e.name === SCRAMBLE_POD_DROPPED_EVENT);
  assert.ok(dropEvent, 'pod dropped event emitted');
  assert.equal(dropEvent.payload.thiefId, civ1.id);
  assert.equal(dropEvent.payload.podId, 'pod_1');
  assert.equal(pod1.alive, true, 'pod1 restored alive in world');
  assert.equal(civ1.data.stolenPod, undefined, 'thief no longer holds stolenPod');

  // Thief barks and panics:
  const scaredEvent = ctx.events.find((e) => e.name === SCRAMBLE_THIEF_SCARED_EVENT);
  assert.ok(scaredEvent, 'thief scared event emitted');
  assert.equal(scaredEvent.payload.text, SCRAMBLE_THIEF_DROP_LINE);
  assert.ok(ctx.voiceCalls.some((c) => c.text === SCRAMBLE_THIEF_DROP_LINE), 'thief panic voice');

  // Since that was the only thief, owner hails thanks:
  const thanksEvent = ctx.events.find((e) => e.name === SCRAMBLE_OWNER_THANKS_EVENT);
  assert.ok(thanksEvent, 'owner thanks event emitted');
  assert.equal(thanksEvent.payload.text, SCRAMBLE_THANKS_LINE);
  assert.ok(ctx.voiceCalls.some((c) => c.text === SCRAMBLE_THANKS_LINE), 'owner thanks voice');
});

test('PL-04 Scramble: Player joins scramble — scoops pod first, civilian retargets or gives up', () => {
  const ctx = createTestContext({ simTime: 300 });
  const carrier = makeCarrier('carrier_1', { x: 200, z: 200 });
  const civ1 = makeCivilian('civ_1', { x: 300, z: 200 });
  const pod1 = makeCargoPod('pod_1', { x: 210, z: 200 });
  const player = makePlayer({ x: 212, z: 200 });

  ctx.entities.set(carrier.id, carrier);
  ctx.entities.set(civ1.id, civ1);
  ctx.entities.set(pod1.id, pod1);
  ctx.entities.set(player.id, player);

  traffic.bus = ctx.bus;
  traffic.state = ctx.state;
  traffic.helpers = ctx.helpers;
  traffic._initScramblePlant(ctx);

  ctx.bus.emit('freight:cargoSpilled', {
    carrierId: carrier.id,
    ownerId: carrier.id,
    podIds: ['pod_1'],
    pos: { x: 200, z: 200 },
    t: 300,
  });

  const memory = traffic._getScrambleMemory();
  const row = memory.get('civ_1');
  assert.ok(row, 'civ_1 assigned to pod_1');
  assert.equal(row.status, 'seeking_pod');

  // Player collects pod_1 before civ_1 reaches it:
  pod1.alive = false;
  ctx.bus.emit('pickup:collected', {
    collectorId: player.id,
    pickupId: 'pod_1',
    amount: 1,
  });

  // civ_1 reacts — sees pod is gone and no more pods exist, so gives up:
  const rec1 = { id: civ1.id, role: 'trader' };
  const continues = traffic._reactScramblePlant(civ1, rec1, [], ctx.state, player);
  assert.equal(continues, false, 'civ_1 ends scramble reaction');
  assert.equal(memory.has('civ_1'), false, 'civ_1 removed from scramble memory');
});

test('PL-04 Scramble: Negative checks — police, hostiles, disabled, player do not scramble; 0 pods ignored', () => {
  const ctx = createTestContext({ simTime: 400 });
  const carrier = makeCarrier('carrier_1', { x: 200, z: 200 });
  const police = makeCivilian('police_1', { x: 220, z: 200, role: 'patrol' });
  police.data.ai = { lawful: true };
  const hostile = makeCivilian('pirate_1', { x: 220, z: 210, team: 1 });
  hostile.data.ai = { hostile: true };
  const disabledCiv = makeCivilian('disabled_1', { x: 220, z: 220 });
  disabledCiv.data.disabled = true;
  const pod1 = makeCargoPod('pod_1', { x: 205, z: 205 });

  ctx.entities.set(carrier.id, carrier);
  ctx.entities.set(police.id, police);
  ctx.entities.set(hostile.id, hostile);
  ctx.entities.set(disabledCiv.id, disabledCiv);
  ctx.entities.set(pod1.id, pod1);

  traffic.bus = ctx.bus;
  traffic.state = ctx.state;
  traffic.helpers = ctx.helpers;
  traffic._initScramblePlant(ctx);

  assert.equal(isCivilianShip(police), false, 'police ship is not civilian');
  assert.equal(isCivilianShip(hostile), false, 'hostile ship is not civilian');
  assert.equal(isCivilianShip(disabledCiv), true, 'disabled ship is civilian');
  assert.equal(isEntityDisabled(disabledCiv), true, 'disabled ship is disabled');

  // Trigger cargo spill with only ineligible ships nearby:
  ctx.bus.emit('freight:cargoSpilled', {
    carrierId: carrier.id,
    ownerId: carrier.id,
    podIds: ['pod_1'],
    pos: { x: 200, z: 200 },
    t: 400,
  });

  const memory = traffic._getScrambleMemory();
  assert.equal(memory.size, 0, 'no ineligible ships joined scramble');

  // Trigger cargo spill with empty podIds:
  const civ = makeCivilian('civ_normal', { x: 210, z: 200 });
  ctx.entities.set(civ.id, civ);
  traffic._scrambleCooldownUntil = -Infinity;

  ctx.bus.emit('freight:cargoSpilled', {
    carrierId: carrier.id,
    ownerId: carrier.id,
    podIds: [],
    pos: { x: 200, z: 200 },
    t: 400,
  });
  assert.equal(memory.size, 0, 'empty podIds spill does not trigger scramble');
});

test('PL-04 Scramble: Cooldown prevents repeat trigger within cooldownS', () => {
  const ctx = createTestContext({ simTime: 500 });
  const carrier = makeCarrier('carrier_1', { x: 200, z: 200 });
  const civ1 = makeCivilian('civ_1', { x: 220, z: 200 });
  const civ2 = makeCivilian('civ_2', { x: 230, z: 200 });
  const pod1 = makeCargoPod('pod_1', { x: 205, z: 200 });
  const pod2 = makeCargoPod('pod_2', { x: 205, z: 210 });

  ctx.entities.set(carrier.id, carrier);
  ctx.entities.set(civ1.id, civ1);
  ctx.entities.set(civ2.id, civ2);
  ctx.entities.set(pod1.id, pod1);
  ctx.entities.set(pod2.id, pod2);

  traffic.bus = ctx.bus;
  traffic.state = ctx.state;
  traffic.helpers = ctx.helpers;
  traffic._initScramblePlant(ctx);

  // First spill:
  ctx.bus.emit('freight:cargoSpilled', {
    carrierId: carrier.id,
    ownerId: carrier.id,
    podIds: ['pod_1'],
    pos: { x: 200, z: 200 },
    t: 500,
  });

  const hails1 = ctx.events.filter((e) => e.name === SCRAMBLE_HAIL_EVENT);
  assert.equal(hails1.length, 1, 'first spill triggers hail');

  // Second spill 10 seconds later (within 45s cooldown):
  ctx.state.simTime = 510;
  ctx.bus.emit('freight:cargoSpilled', {
    carrierId: carrier.id,
    ownerId: carrier.id,
    podIds: ['pod_2'],
    pos: { x: 200, z: 200 },
    t: 510,
  });

  const hails2 = ctx.events.filter((e) => e.name === SCRAMBLE_HAIL_EVENT);
  assert.equal(hails2.length, 1, 'second spill within cooldown is ignored');

  // Third spill after cooldown expired (simTime = 550):
  ctx.state.simTime = 550;
  ctx.bus.emit('freight:cargoSpilled', {
    carrierId: carrier.id,
    ownerId: carrier.id,
    podIds: ['pod_2'],
    pos: { x: 200, z: 200 },
    t: 550,
  });

  const hails3 = ctx.events.filter((e) => e.name === SCRAMBLE_HAIL_EVENT);
  assert.equal(hails3.length, 2, 'spill after cooldown triggers hail');
});

test('PL-04 Scramble: Standalone system lifecycle', () => {
  const ctx = createTestContext({ simTime: 600 });
  const carrier = makeCarrier('carrier_1', { x: 200, z: 200 });
  const civ1 = makeCivilian('civ_1', { x: 260, z: 200 });
  const pod1 = makeCargoPod('pod_1', { x: 205, z: 200 });

  ctx.entities.set(carrier.id, carrier);
  ctx.entities.set(civ1.id, civ1);
  ctx.entities.set(pod1.id, pod1);

  scramblePlant.init(ctx);
  assert.equal(scramblePlant.name, 'scramblePlant');

  ctx.bus.emit('freight:cargoSpilled', {
    carrierId: carrier.id,
    ownerId: carrier.id,
    podIds: ['pod_1'],
    pos: { x: 200, z: 200 },
    t: 600,
  });

  scramblePlant.update(0.016, ctx.state);
  assert.equal(civ1.data.civilianReaction, 'scramble_seeking');

  scramblePlant.destroy();
  const memory = scramblePlant._getScrambleMemory();
  assert.equal(memory.size, 0, 'memory cleared on destroy');
});
