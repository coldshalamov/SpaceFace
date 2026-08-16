import assert from 'node:assert/strict';
import test from 'node:test';

import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';

test('AC-07 taut manual cut keeps earned velocity and adds no release impulse', () => {
  withMasslineFlags(() => {
    const harness = makeSwingHarness({ phase: 'loaded', load: 1, playerSpeed: 100 });
    const playerWrites = watchVelocity(harness.player);
    const payloadWrites = watchVelocity(harness.payload);
    const earnedPlayer = { x: harness.player.vel.x, z: harness.player.vel.z };
    const earnedPayload = { x: harness.payload.vel.x, z: harness.payload.vel.z };

    masslineThrow.init(harness.ctx);
    masslineThrow.update(1 / 60, harness.state);
    assert.equal(harness.state.massline2.throw.selfSolution.anticipatedBonusDv, 0,
      'the self-sling predictor must not invent a release flourish');
    assert.ok(Math.abs(harness.state.massline2.throw.selfSolution.payloadSpeed - 100) < 1e-9,
      'the predictor must read the real body speed');

    harness.bus.emit('tether:cut', { targetId: harness.payload.id, slingshot: true });

    assert.equal(harness.impulses.length, 0, 'release must not call combat physics');
    assert.deepEqual(playerWrites, [], 'release must not write player velocity');
    assert.deepEqual(payloadWrites, [], 'release must not write payload velocity');
    assert.deepEqual({ x: harness.player.vel.x, z: harness.player.vel.z }, earnedPlayer);
    assert.deepEqual({ x: harness.payload.vel.x, z: harness.payload.vel.z }, earnedPayload);

    const receipt = harness.state.massline2.throw.lastSelfSling;
    const sling = harness.events.find((event) => event.type === 'massline:selfSling')?.payload;
    assert.ok(receipt, 'a taut moving cut still publishes release telemetry');
    assert.equal(receipt.releaseId, sling.releaseId);
    assert.equal(receipt.physicsEarned, true,
      'telemetry must identify the retained tether-earned velocity without claiming a release kick');
    assert.equal(receipt.bonusDv, 0);
    assert.equal(receipt.releaseAddedDv, 0);
    assert.deepEqual(receipt.impulses, []);
    assert.equal(receipt.exitSpeed, 100);
    assert.deepEqual(receipt.preReleaseVelocity, earnedPlayer);
    assert.deepEqual(receipt.postReleaseVelocity, earnedPlayer);
    assert.ok(!harness.events.some((event) => event.type === 'massline:selfSling'
      && (event.payload.bonusDv > 0 || event.payload.releaseAddedDv > 0
        || (event.payload.impulses && event.payload.impulses.length > 0))));

    harness.state.player.tether.active = false;
    harness.state.tick = 301;
    harness.state.simTime = 301 / 60;
    masslineThrow.update(1 / 60, harness.state);
    const validated = harness.state.massline2.throw.lastReleaseValidation;
    assert.equal(validated.releaseId, receipt.releaseId);
    assert.deepEqual(validated.impulses, []);
    assert.equal(validated.actual.speed, 100);

    masslineThrow.destroy();
  });
});

test('AC-07 slack manual cut is still a no-kick cut', () => {
  withMasslineFlags(() => {
    const harness = makeSwingHarness({ phase: 'slack', load: 0, playerSpeed: 100 });
    const playerWrites = watchVelocity(harness.player);
    const payloadWrites = watchVelocity(harness.payload);

    masslineThrow.init(harness.ctx);
    masslineThrow.update(1 / 60, harness.state);
    harness.bus.emit('tether:cut', { targetId: harness.payload.id, slingshot: false });

    assert.equal(harness.impulses.length, 0);
    assert.deepEqual(playerWrites, []);
    assert.deepEqual(payloadWrites, []);
    assert.equal(harness.state.massline2.throw.lastSelfSling, null);
    assert.equal(harness.events.filter((event) => event.type === 'massline:selfSling').length, 0);

    masslineThrow.destroy();
  });
});

test('AC-07 assisted payload throw remains a cut-only action', () => {
  withMasslineFlags(() => {
    const harness = makeThrowHarness();
    const playerWrites = watchVelocity(harness.player);
    const payloadWrites = watchVelocity(harness.payload);
    const earnedPayload = { x: harness.payload.vel.x, z: harness.payload.vel.z };

    masslineThrow.init(harness.ctx);
    masslineThrow.update(1 / 60, harness.state);

    assert.equal(harness.cuts.length, 1, 'the armed throw must still cut the attachment');
    assert.deepEqual(harness.cuts[0], ['att-2', harness.player.id, 'tether_cut']);
    assert.equal(harness.impulses.length, 0, 'an assisted throw must not apply a release impulse');
    assert.deepEqual(playerWrites, []);
    assert.deepEqual(payloadWrites, []);
    assert.deepEqual({ x: harness.payload.vel.x, z: harness.payload.vel.z }, earnedPayload);

    const lastThrow = harness.state.massline2.throw.lastThrow;
    assert.equal(lastThrow.mode, 'arm');
    assert.equal(lastThrow.correction, null);
    assert.deepEqual(lastThrow.impulses, []);
    assert.equal(lastThrow.cut.accepted, true);
    assert.equal(lastThrow.cut.reason, 'tether_cut');

    masslineThrow.destroy();
  });
});

function makeSwingHarness({ phase, load, playerSpeed }) {
  const player = {
    id: 1, type: 'ship', alive: true, mass: 20, radius: 8,
    pos: { x: 0, z: 0 }, vel: { x: playerSpeed, z: 0 },
  };
  const payload = {
    id: 2, type: 'asteroid', alive: true, mass: 20_000, radius: 40,
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
  };
  const state = {
    mode: 'flight', tick: 300, simTime: 5, playerId: 1,
    entities: new Map([[1, player], [2, payload]]), entityList: [player, payload],
    settings: { gameplay: { masslineReleaseAssist: 'arm' } },
    input: { actions: { throwArm: false } },
    player: {
      targetId: null,
      tether: { active: true, targetId: 2, attachmentId: 'att-sling', phase, load },
      masslineTelemetry: { active: true, tangentialSpeed: playerSpeed },
    },
    nav: { waypoint: { pos: { x: 500, z: 0 }, arrivalRadius: 18 } },
  };
  const impulses = [];
  const events = [];
  const bus = makeRecordingBus(events);
  const helpers = {
    combatPhysics: {
      applyImpulse(command) {
        impulses.push(structuredClone(command));
        const entity = state.entities.get(command.entityId);
        if (entity && entity.vel && command.impulse) {
          entity.vel.x += command.impulse.x / entity.mass;
          entity.vel.z += command.impulse.z / entity.mass;
        }
        return true;
      },
    },
  };
  return {
    state,
    player,
    payload,
    impulses,
    events,
    bus,
    ctx: { state, bus, helpers, registry: { get: () => null } },
  };
}

function makeThrowHarness() {
  const speed = 120;
  const payload = {
    id: 2, type: 'asteroid', alive: true, mass: 640, radius: 8,
    pos: { x: 100, z: 0 }, vel: { x: speed, z: 0 },
  };
  const player = {
    id: 1, type: 'ship', alive: true, mass: 20, radius: 8,
    pos: { x: 0, z: 0 }, vel: { x: speed, z: -0.9 * 100 },
  };
  const aim = {
    id: 3, type: 'ship', alive: true, mass: 20, radius: 2,
    pos: { x: payload.pos.x + 400, z: payload.pos.z },
    vel: { x: 0, z: 0 },
  };
  const entities = new Map([[1, player], [2, payload], [3, aim]]);
  const state = {
    mode: 'flight', tick: 100, simTime: 100 / 60, playerId: 1,
    entities, entityList: [player, payload, aim],
    settings: { gameplay: { masslineReleaseAssist: 'arm' } },
    input: { actions: { throwArm: true } },
    player: {
      targetId: 3,
      tether: { active: true, targetId: 2, attachmentId: 'att-2', phase: 'loaded', load: 1 },
      masslineTelemetry: { active: true, tangentialSpeed: speed },
    },
    nav: {},
  };
  const events = [];
  const cuts = [];
  const impulses = [];
  const bus = makeRecordingBus(events);
  const attachments = {
    cut(...args) {
      cuts.push(args);
      state.player.tether.active = false;
      return { ok: true, attachmentId: 'att-2', reason: 'tether_cut' };
    },
  };
  const helpers = {
    combatPhysics: {
      applyImpulse(command) {
        impulses.push(structuredClone(command));
        const entity = entities.get(command.entityId);
        if (entity && entity.vel && command.impulse) {
          entity.vel.x += command.impulse.x / entity.mass;
          entity.vel.z += command.impulse.z / entity.mass;
        }
        return true;
      },
    },
  };
  const registry = {
    get(name) {
      return name === 'actions' ? { kernel: { attachments } } : null;
    },
  };
  return {
    state, player, payload, events, cuts, impulses,
    ctx: { state, bus, helpers, registry },
  };
}

function watchVelocity(entity) {
  const writes = [];
  const stored = { x: entity.vel.x, z: entity.vel.z };
  entity.vel = {
    get x() { return stored.x; },
    set x(value) { writes.push({ axis: 'x', value }); stored.x = value; },
    get z() { return stored.z; },
    set z(value) { writes.push({ axis: 'z', value }); stored.z = value; },
  };
  return writes;
}

function makeRecordingBus(events) {
  const handlers = new Map();
  return {
    on(type, fn) {
      const list = handlers.get(type) || [];
      list.push(fn);
      handlers.set(type, list);
      return () => handlers.set(type, (handlers.get(type) || []).filter((candidate) => candidate !== fn));
    },
    emit(type, payload) {
      events.push({ type, payload });
      for (const fn of handlers.get(type) || []) fn(payload, type);
    },
  };
}

function withMasslineFlags(fn) {
  const saved = { ...MASSLINE2_FLAGS };
  for (const key of Object.keys(MASSLINE2_FLAGS)) MASSLINE2_FLAGS[key] = true;
  try {
    fn();
  } finally {
    Object.assign(MASSLINE2_FLAGS, saved);
    masslineThrow.destroy();
  }
}
