import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import {
  FLIGHT_DRILL_BEATS,
  FLIGHT_DRILL_BURST_SHOTS,
  maxWeaponHeatFraction,
} from '../src/onboarding/flightDrill.js';
import { flybyFocus, pickFlybyTarget } from '../src/systems/flybyFocus.js';
import { onboarding } from '../src/systems/onboarding.js';

test('flight drill teaches one clear lesson at a time in the required order', () => {
  assert.deepEqual(
    FLIGHT_DRILL_BEATS.map((beat) => beat.key),
    ['thrust', 'brake', 'marker', 'focus', 'tether', 'burst', 'disengage'],
  );
  const lines = FLIGHT_DRILL_BEATS.flatMap((beat) => [beat.line, ...(beat.followups || []).map((f) => f.line)]);
  for (const line of lines) {
    assert.ok(line.trim().split(/\s+/).length <= 12, `tutorial line too long: ${line}`);
    assert.doesNotMatch(line, /\b(?:Key[A-Z]|Arrow|LMB|RMB|Space|Shift|[WASDFG])\b/,
      `copy must not hard-code a physical binding: ${line}`);
  }
});

test('training actor is the only non-hostile contact eligible for flyby Focus', () => {
  const player = makeEntity({ id: 1, type: 'ship', team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8 });
  player.id = 1;
  const trainer = makeEntity({
    id: 2,
    type: 'ship',
    team: 0,
    pos: { x: 138, z: 52 },
    vel: { x: -118, z: 0 },
    radius: 8,
    data: { onboardingTraining: true, trainingFocusEligible: true, ai: { passive: true }, weapons: [] },
  });
  trainer.id = 2;
  const ordinaryFriendly = makeEntity({
    id: 3,
    type: 'ship',
    team: 0,
    pos: { x: 130, z: 0 },
    vel: { x: -130, z: 0 },
    radius: 8,
    data: { ai: { passive: true }, weapons: [] },
  });
  ordinaryFriendly.id = 3;
  const state = { playerId: 1, player: {}, entities: new Map([[1, player], [2, trainer], [3, ordinaryFriendly]]) };
  assert.equal(pickFlybyTarget(state, player, [ordinaryFriendly, trainer])?.id, 2);
  assert.equal(pickFlybyTarget(state, player, [ordinaryFriendly]), null);
});

test('marker trainer cannot consume Focus before its authored flyby', () => {
  const bus = createBus();
  const state = makeState();
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const tutorial = Object.create(onboarding);
  tutorial.init({ state, bus, helpers, registry: null });
  state.onboarding = freshOnboarding();
  state.onboarding.currentBeat = 2;
  state.simTime = 0;

  const player = state.entities.get(state.playerId);
  player.vel.x = 100;
  const trainer = tutorial._spawnTrainer('marker');
  assert.ok(trainer);
  trainer.pos.x = 240;
  trainer.pos.z = 0;
  trainer.prevPos.copy(trainer.pos);

  const focus = Object.create(flybyFocus);
  focus.init({ state, bus });
  focus.update(1 / 60, state);
  assert.equal(state.player.flybyFocus.active, false,
    'the marker trainer is ineligible even when a fast player enters its focus envelope');

  state.simTime = 4.1;
  tutorial._beginTrainerFlyby();
  focus.update(1 / 60, state);
  assert.equal(state.player.flybyFocus.active, true);
  assert.equal(state.player.flybyFocus.targetId, trainer.id,
    'the marked trainer opens Focus only once its flyby starts');
  focus.destroy();
});

test('nonlethal trainer and real event receipts complete the hands-on drill', () => {
  const bus = createBus();
  const state = makeState();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const sys = Object.create(onboarding);
  sys.init({ state, bus, helpers, registry: null });
  state.onboarding = freshOnboarding();

  const player = state.entities.get(state.playerId);
  state.onboarding.currentBeat = 0;
  player.vel.x = 41;
  sys._resolveProximityDone();
  assert.ok(state.onboarding.beatDoneAt.thrust != null);

  state.onboarding.currentBeat = 1;
  player.vel.x = 0;
  sys._resolveProximityDone();
  assert.ok(state.onboarding.beatDoneAt.brake != null);

  state.onboarding.currentBeat = 2;
  const trainer = sys._spawnTrainer('marker');
  assert.ok(trainer);
  assert.equal(trainer.type, 'drone');
  assert.equal(trainer.collides, true);
  assert.equal(trainer.physicsBody.material, 'projectile');
  assert.equal(trainer.flags.invuln, true);
  assert.equal(trainer.data.ai.passive, true);
  assert.equal(trainer.data.ai.roe, 'hold_fire');
  assert.deepEqual(trainer.data.weapons, []);
  trainer.pos.x = 100;
  trainer.pos.z = 0;
  sys._resolveProximityDone();
  assert.ok(state.onboarding.beatDoneAt.marker != null);

  state.onboarding.currentBeat = 3;
  bus.emit('flybyFocus:start', { targetId: trainer.id });
  assert.ok(state.onboarding.beatDoneAt.focus != null);

  state.onboarding.currentBeat = 4;
  const derelict = sys._spawnDerelict() || state.entities.get(sys._derelictId);
  assert.ok(derelict);
  player.data.targetId = 'wrong-target';
  bus.emit('tether:latched', { targetId: 'wrong-target' });
  bus.emit('tether:released', { targetId: 'wrong-target' });
  assert.equal(state.onboarding.beatDoneAt.tether, undefined, 'unrelated tether cannot skip training');
  state.player.targetId = derelict.id;
  sys._resolveProximityDone();
  assert.equal(state.onboarding.firedFollowups['tether:target:acquired'], true);
  bus.emit('tether:latched', { targetId: derelict.id });
  bus.emit('tether:broke', { targetId: derelict.id, reason: 'overload' });
  assert.equal(state.onboarding.beatDoneAt.tether, undefined, 'broken line is recovery, not success');
  assert.equal(state.onboarding.tetherBreaks, 1);
  assert.match(state.onboarding.beatAction, /Latch the derelict again/);
  bus.emit('tether:latched', { targetId: derelict.id });
  bus.emit('tether:nearBreak', { targetId: derelict.id, tensionRatio: 0.8 });
  assert.equal(state.onboarding.beatAction, 'Ease off. Let the line settle.');
  bus.emit('tether:reel', { targetId: derelict.id, before: 80, after: 58 });
  bus.emit('tether:released', { targetId: derelict.id });
  assert.ok(state.onboarding.beatDoneAt.tether != null);

  state.onboarding.currentBeat = 5;
  player.data.weapons[0]._heat = 36;
  for (let i = 0; i < FLIGHT_DRILL_BURST_SHOTS; i++) {
    bus.emit('combat:fire', { ownerId: player.id, weaponId: 'pulse_laser_s' });
  }
  assert.equal(state.onboarding.burstCooling, true);
  assert.equal(state.onboarding.burstShots, FLIGHT_DRILL_BURST_SHOTS);
  player.data.weapons[0]._heat = 2;
  sys._resolveProximityDone();
  assert.ok(state.onboarding.beatDoneAt.burst != null);

  state.onboarding.currentBeat = 6;
  trainer.pos.x = 901;
  trainer.pos.z = 0;
  sys._resolveProximityDone();
  assert.ok(state.onboarding.beatDoneAt.disengage != null);
  assert.equal(trainer.alive, false, 'trainer exits cleanly after disengagement');
  assert.equal(spawned.some((entity) => entity.data?.weapons?.length), false,
    'no training actor can shoot the player');

  state.onboarding.currentBeat = 7;
  state.onboarding.beatAction = 'Pulse the scanner.';
  const rock = sys._spawnMiningRock();
  assert.ok(rock && rock.data.trainingMining, 'seam lesson owns a marked mineable rock');
  rock.data.scanHighlightUntil = state.simTime + 5;
  bus.emit('scan:completed', { found: { asteroids: 1, wrecks: 0, anomalies: 0 } });
  assert.equal(state.onboarding.beatAction, 'Beam the bright seams.');
  bus.emit('mining:yield', {
    minerId: player.id,
    qty: 3,
    commodityId: 'cmdty_ore_iron',
    pos: { x: rock.pos.x, z: rock.pos.z },
  });
  assert.ok(state.onboarding.beatDoneAt.seam != null, 'three units from the marked rock complete mining');
});

test('weapon heat helper ignores invalid/no-heat mounts', () => {
  assert.equal(maxWeaponHeatFraction({ data: { weapons: [{ _heat: 30, heatMax: 100 }] } }), 0.3);
  assert.equal(maxWeaponHeatFraction({ data: { weapons: [{ _heat: 30, heatMax: 0 }, {}] } }), 0);
});

function freshOnboarding() {
  return {
    active: true,
    finished: false,
    currentBeat: 0,
    beatDoneAt: {},
    firedFollowups: {},
    tutorialLog: [],
    oreCollected: 0,
    burstShots: 0,
    burstPeakHeat: 0,
    burstCooling: false,
    trainingOre: 0,
    tetherReeled: false,
    tetherBreaks: 0,
    beatAction: '',
  };
}

function makeState() {
  const player = makeEntity({
    type: 'ship',
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    data: {
      weapons: [{ defId: 'pulse_laser_s', _heat: 0, heatMax: 100 }],
      combat: {},
      ai: {},
    },
  });
  player.id = 1;
  return {
    meta: { seed: 47 },
    simTime: 10,
    mode: 'flight',
    settings: { gameplay: { tutorialHints: true } },
    playerId: 1,
    player: { hints: {}, targetId: null },
    entities: new Map([[1, player]]),
    entityList: [player],
    nextEntityId: 10,
    nav: {},
    world: { activeSector: { stations: [], gates: [] } },
    story: { beatIndex: 0 },
  };
}
