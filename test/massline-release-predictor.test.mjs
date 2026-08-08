import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as fireControl from '../src/combat/tetherFireControl.js';
import { createGameState } from '../src/core/gameState.js';
import { PROFILE_SETTINGS_KEY } from '../src/core/graphicsProfileBootstrap.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { save } from '../src/save/saveSystem.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import * as cameraModule from '../src/render/camera.js';
import * as masslineHudModule from '../src/ui/masslineHud.js';

test('PQ-006 release prediction samples at 15 Hz and exposes one shared deterministic sample', () => {
  assert.equal(typeof fireControl.sampleThrowSolution, 'function');
  assert.equal(fireControl.RELEASE_PREDICTOR_SAMPLE_TICKS, 4);

  const cache = {};
  const payload = {
    pos: { x: 0, z: 0 },
    vel: { x: 120, z: 0 },
  };
  const aimAngle = 0.03;
  const aim = {
    pos: { x: Math.cos(aimAngle) * 400, z: Math.sin(aimAngle) * 400 },
    vel: { x: 0, z: 0 },
    radius: 2,
  };

  const first = fireControl.sampleThrowSolution(cache, payload, aim, {
    tick: 100,
    omega: 0.9,
    identity: 'payload-2:aim-3',
  });
  assert.equal(first.sampled, true);
  assert.equal(first.sampleTick, 100);
  assert.equal(first.sampleSequence, 1);
  assert.equal(first.sampleAgeTicks, 0);
  assert.equal(first.onSolution, false);

  payload.vel.x = 0;
  payload.vel.z = 120;
  const projected = fireControl.sampleThrowSolution(cache, payload, aim, {
    tick: 102,
    omega: 0.9,
    identity: 'payload-2:aim-3',
  });
  assert.equal(projected.sampled, false, 'intervening fixed ticks consume the cached sample');
  assert.equal(projected.sampleTick, first.sampleTick);
  assert.equal(projected.sampleSequence, first.sampleSequence);
  assert.equal(projected.sampleAgeTicks, 2);
  assert.ok(Math.abs(projected.errorRad) < 1e-9, 'the cached error projects across fixed ticks');
  assert.equal(projected.onSolution, true, 'the release window can open between expensive solves');

  const refreshed = fireControl.sampleThrowSolution(cache, payload, aim, {
    tick: 104,
    omega: 0.9,
    identity: 'payload-2:aim-3',
  });
  assert.equal(refreshed.sampled, true);
  assert.equal(refreshed.sampleTick, 104);
  assert.equal(refreshed.sampleSequence, 2);
});

test('PQ-006 predictor resamples immediately when the armed release identity changes', () => {
  const cache = {};
  const payload = { pos: { x: 0, z: 0 }, vel: { x: 90, z: 0 } };
  const aim = { pos: { x: 300, z: 0 }, vel: { x: 0, z: 0 }, radius: 8 };

  const first = fireControl.sampleThrowSolution(cache, payload, aim, {
    tick: 20,
    omega: 0.5,
    identity: 'payload-2:aim-3',
  });
  const changed = fireControl.sampleThrowSolution(cache, payload, aim, {
    tick: 21,
    omega: 0.5,
    identity: 'payload-2:aim-waypoint',
  });

  assert.equal(first.sampleTick, 20);
  assert.equal(changed.sampled, true);
  assert.equal(changed.sampleTick, 21);
  assert.equal(changed.sampleSequence, 2);
});

test('PQ-006 Arm, HUD mirror, and release validation consume the same projected sample', () => {
  withMasslineFlags(() => {
    const harness = makeThrowHarness({ assist: 'arm', aimAngle: 0.03, omega: 0.9 });
    masslineThrow.init(harness.ctx);

    masslineThrow.update(1 / 60, harness.state);
    assert.equal(harness.cuts.length, 0);
    assert.equal(harness.state.massline2.throw.solution.sampleTick, 100);
    assert.equal(harness.state.massline2.throw.solution.sampled, true);

    harness.advanceSwing(101, 0.015);
    masslineThrow.update(1 / 60, harness.state);
    assert.equal(harness.cuts.length, 0);
    assert.equal(harness.state.massline2.throw.solution.sampleTick, 100);
    assert.equal(harness.state.massline2.throw.solution.sampled, false);

    harness.advanceSwing(102, 0.03);
    masslineThrow.update(1 / 60, harness.state);
    assert.equal(harness.cuts.length, 1, 'Arm cuts on the projected window between solves');
    assert.equal(harness.state.massline2.throw.lastThrow.prediction.sampleTick, 100);
    assert.equal(harness.state.massline2.throw.lastThrow.prediction.sampleSequence, 1);
    assert.equal(harness.state.massline2.throw.lastThrow.prediction.onSolution, true);

    harness.state.tick = 103;
    harness.state.simTime = 103 / 60;
    masslineThrow.update(1 / 60, harness.state);
    const receipt = harness.state.massline2.throw.lastReleaseValidation;
    assert.equal(receipt.releaseId, harness.state.massline2.throw.lastThrow.releaseId);
    assert.equal(receipt.prediction.sampleTick, 100);
    assert.equal(receipt.releaseTick, 102);
    assert.equal(receipt.validatedTick, 103);
    assert.equal(receipt.withinTolerance, true);
    assert.ok(Math.abs(receipt.divergenceRad) < 1e-9);
    assert.ok(receipt.trajectory.divergenceWU < 1e-9,
      'the post-authority exit vector reaches the same predicted point');
    assert.equal(harness.events.filter((event) => event.type === 'massline:releaseValidated').length, 1);

    masslineThrow.destroy();
  });
});

test('PQ-029 Snap may time the cut but never steers the payload exit', () => {
  withMasslineFlags(() => {
    const harness = makeThrowHarness({ assist: 'snap', aimAngle: -0.05, omega: 0.9 });
    const earnedExit = { ...harness.payload.vel };
    masslineThrow.init(harness.ctx);
    masslineThrow.update(1 / 60, harness.state);

    assert.equal(harness.cuts.length, 1);
    assert.equal(harness.impulses.length, 0, 'release assistance must not queue a steering impulse');
    assert.deepEqual(harness.payload.vel, earnedExit, 'the payload must keep its earned exit vector');
    const lastThrow = harness.state.massline2.throw.lastThrow;
    assert.equal(lastThrow.mode, 'snap-manual');
    assert.equal(lastThrow.correction, null);
    assert.deepEqual(lastThrow.impulses, []);

    harness.state.tick = 101;
    harness.state.simTime = 101 / 60;
    masslineThrow.update(1 / 60, harness.state);
    const receipt = harness.state.massline2.throw.lastReleaseValidation;
    assert.deepEqual(receipt.impulses, []);
    assert.ok(Math.abs(lastThrow.errorRad) > 0, "the receipt should retain the player's late release error");
    assert.ok(Math.abs(receipt.divergenceRad) > 0,
      'validation should report the uncorrected late-release divergence honestly');
    assert.ok(receipt.trajectory.divergenceWU > 0,
      'the receipt must not pretend assistance rewrote the earned trajectory');

    masslineThrow.destroy();
  });
});

test('PQ-006 coordinate waypoints retain a world target for the self-sling HUD', () => {
  withMasslineFlags(() => {
    const player = {
      id: 1, type: 'ship', alive: true, mass: 20, radius: 8,
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 100 },
    };
    const anchor = {
      id: 2, type: 'asteroid', alive: true, mass: 2000, radius: 30,
      pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    };
    const state = {
      mode: 'flight', tick: 40, simTime: 40 / 60, playerId: 1,
      entities: new Map([[1, player], [2, anchor]]), entityList: [player, anchor],
      settings: { gameplay: { masslineReleaseAssist: 'arm' } },
      input: { actions: { throwArm: false } },
      player: {
        targetId: null,
        tether: { active: true, targetId: 2, attachmentId: 'att-waypoint', phase: 'loaded' },
        masslineTelemetry: { active: true, tangentialSpeed: 100 },
      },
      nav: { waypoint: { pos: { x: -500, z: 240 }, arrivalRadius: 18 } },
    };
    const bus = makeBus();
    masslineThrow.init({ state, bus, helpers: {}, registry: { get: () => null } });
    masslineThrow.update(1 / 60, state);

    assert.equal(state.massline2.throw.selfSolution.targetKind, 'waypoint');
    assert.equal(state.massline2.throw.selfSolution.targetId, null);
    assert.deepEqual(state.massline2.throw.selfSolution.targetPos, { x: -500, z: 240 });
    assert.equal(state.massline2.throw.selfSolution.sampleTick, 40);

    masslineThrow.destroy();
  });
});

test('PQ-006 release cues clamp offscreen without visor arcs and keep a static non-color state', () => {
  assert.equal(typeof masslineHudModule.resolveReleaseCue, 'function');

  const throwCue = masslineHudModule.resolveReleaseCue({ x: -180, y: 450, onScreen: false }, {
    viewportWidth: 1440,
    viewportHeight: 900,
    kind: 'throw',
    onSolution: true,
    targetKind: 'entity',
  });
  assert.deepEqual(
    {
      visible: throwCue.visible,
      x: throwCue.x,
      y: throwCue.y,
      offscreen: throwCue.offscreen,
      direction: throwCue.direction,
      label: throwCue.label,
      state: throwCue.state,
    },
    { visible: true, x: 30, y: 450, offscreen: true, direction: 'left', label: 'RELEASE', state: 'open' },
  );
  assert.match(throwCue.ariaLabel, /Massline throw release window open/i);
  assert.match(throwCue.ariaLabel, /offscreen left/i);

  const waypointCue = masslineHudModule.resolveReleaseCue({ x: 1720, y: -80, onScreen: false }, {
    viewportWidth: 1440,
    viewportHeight: 900,
    kind: 'self',
    onSolution: false,
    targetKind: 'waypoint',
  });
  assert.deepEqual(
    { x: waypointCue.x, y: waypointCue.y, direction: waypointCue.direction, label: waypointCue.label },
    { x: 1410, y: 30, direction: 'upper right', label: 'ALIGN' },
  );
  assert.match(waypointCue.ariaLabel, /waypoint/i);
});

test('R3B HUD anchors fixed release targets at their captured world point', () => {
  assert.equal(typeof masslineHudModule.resolveThrowMarkWorldPoint, 'function');
  const payload = { id: 2, pos: { x: 10, z: 20 }, vel: { x: 80, z: 0 } };
  const movingTarget = { id: 3, pos: { x: 300, z: -40 }, vel: { x: 12, z: 6 } };
  const state = { entities: new Map([[2, payload], [3, movingTarget]]) };
  const pointThrow = {
    payloadId: payload.id,
    aimTargetId: null,
    releaseTarget: {
      kind: 'waypoint', source: 'waypoint', targetId: null,
      pos: { x: -640, z: 220 }, radius: 24,
    },
    solution: { interceptAngle: Math.PI / 2 },
  };
  assert.deepEqual(
    masslineHudModule.resolveThrowMarkWorldPoint(pointThrow, state),
    { x: -640, z: 220, targetKind: 'waypoint' },
    'fixed waypoints must not fall back to the payload intercept ray',
  );

  const entityThrow = {
    ...pointThrow,
    aimTargetId: movingTarget.id,
    releaseTarget: {
      kind: 'entity', source: 'pointer', targetId: movingTarget.id, pos: null, radius: 0,
    },
  };
  const entityPoint = masslineHudModule.resolveThrowMarkWorldPoint(entityThrow, state);
  assert.equal(entityPoint.targetKind, 'entity');
  assert.ok(Math.abs(entityPoint.x - (movingTarget.pos.x + movingTarget.vel.x * (1 / 120))) < 1e-9);
  assert.ok(Math.abs(entityPoint.z - (movingTarget.pos.z + movingTarget.vel.z * (1 / 120))) < 1e-9);
});

test('PQ-006 HUD declares static reduced-flash and forced-color release states', () => {
  assert.match(masslineHudModule.MASSLINE_HUD_CSS, /ml2-reduced-flash/);
  assert.match(masslineHudModule.MASSLINE_HUD_CSS, /forced-colors:\s*active[\s\S]*ml2-mark/);
  assert.match(masslineHudModule.MASSLINE_HUD_CSS, /ml2-hot[\s\S]*outline/,
    'the open window keeps a shape boundary when pulse/color are unavailable');
});

test('PQ-006 new games declare Arm as the release-assist profile default', () => {
  const state = createGameState(47);
  assert.equal(state.settings.gameplay.masslineReleaseAssist, 'arm');
});

test('PQ-006 profile snapshots retain release assist across fresh runtime initialization', () => {
  withLocalStorage((storage) => {
    const first = createGameState(47);
    const firstBus = makeBus();
    save.init({ state: first, bus: firstBus, helpers: {}, registry: { get: () => null } });
    first.settings.gameplay.masslineReleaseAssist = 'off';
    assert.equal(save._writeProfileSettings(), true);
    const written = JSON.parse(storage.getItem(PROFILE_SETTINGS_KEY));
    assert.equal(written.settings.gameplay.masslineReleaseAssist, 'off');

    written.settings.gameplay.masslineReleaseAssist = 'snap';
    storage.setItem(PROFILE_SETTINGS_KEY, JSON.stringify(written));
    const fresh = createGameState(48);
    save.init({ state: fresh, bus: makeBus(), helpers: {}, registry: { get: () => null } });
    assert.equal(fresh.settings.gameplay.masslineReleaseAssist, 'snap');
  });
});

test('PQ-006 corrupt release-assist profile values fail closed to Arm', () => {
  withLocalStorage((storage) => {
    storage.setItem(PROFILE_SETTINGS_KEY, JSON.stringify({
      version: 1,
      settings: { gameplay: { masslineReleaseAssist: 'destination-autopilot' } },
    }));
    const state = createGameState(49);
    save.init({ state, bus: makeBus(), helpers: {}, registry: { get: () => null } });
    assert.equal(state.settings.gameplay.masslineReleaseAssist, 'arm');
  });
});

test('PQ-006 self-sling publishes earned-speed provenance and one explicit impulse ledger', () => {
  withMasslineFlags(() => {
    const player = {
      id: 1, type: 'ship', alive: true, mass: 20, radius: 8,
      pos: { x: 0, z: 0 }, vel: { x: 100, z: 0 },
    };
    const anchor = {
      id: 2, type: 'asteroid', alive: true, mass: 20_000, radius: 40,
      pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    };
    const state = {
      mode: 'flight', tick: 300, simTime: 5, playerId: 1,
      entities: new Map([[1, player], [2, anchor]]), entityList: [player, anchor],
      settings: { gameplay: { masslineReleaseAssist: 'arm' } },
      input: { actions: { throwArm: false } },
      player: {
        targetId: null,
        tether: { active: true, targetId: 2, attachmentId: 'att-sling', phase: 'loaded', load: 1 },
        masslineTelemetry: { active: true, tangentialSpeed: 100 },
      },
      nav: { waypoint: { pos: { x: 500, z: 0 }, arrivalRadius: 18 } },
    };
    const bus = makeRecordingBus();
    const queued = [];
    const helpers = {
      combatPhysics: {
        applyImpulse(command) {
          queued.push(structuredClone(command));
          player.vel.x += command.impulse.x / player.mass;
          player.vel.z += command.impulse.z / player.mass;
          return true;
        },
      },
    };
    masslineThrow.init({ state, bus, helpers, registry: { get: () => null } });
    masslineThrow.update(1 / 60, state);
    bus.emit('tether:cut', { targetId: anchor.id, slingshot: true });

    const sling = bus.events.find((event) => event.type === 'massline:selfSling')?.payload;
    assert.equal(sling.source, 'massline');
    assert.equal(sling.physicsEarned, true);
    assert.match(sling.releaseId, /^massline:self-sling:/);
    assert.equal(sling.prediction.sampleTick, 300);
    assert.ok(Math.abs(sling.prediction.payloadSpeed - sling.exitSpeed) < 1e-9,
      'the shared self-sling predictor includes the earned-speed impulse');
    assert.equal(sling.impulses.length, 1);
    assert.equal(sling.impulses[0].reason, 'massline_sling_bonus');
    assert.equal(sling.impulses[0].accepted, true);
    assert.equal(queued.length, 1, 'the explicit ledger matches authority commands one-for-one');
    assert.equal(state.massline2.throw.lastSelfSling.releaseId, sling.releaseId);

    state.player.tether.active = false;
    state.tick = 301;
    state.simTime = 301 / 60;
    masslineThrow.update(1 / 60, state);
    const validated = state.massline2.throw.lastReleaseValidation;
    assert.equal(validated.releaseId, sling.releaseId);
    assert.equal(validated.source, 'massline');
    assert.equal(validated.impulses.length, 1);
    assert.equal(validated.actual.speed, sling.exitSpeed);
    assert.ok(validated.trajectory.divergenceWU < 1e-9,
      'earned speed follows the course presented before release');

    masslineThrow.destroy();
  });
});

test('PQ-006 earned Massline release adds a bounded camera push with a reduced-motion static path', () => {
  assert.equal(typeof cameraModule.applyMasslineReleaseCameraCue, 'function');
  const calls = [];
  const cam = {
    pushZoom(factor, durationS) { calls.push({ type: 'push', factor, durationS }); },
    easeRecenter(durationS) { calls.push({ type: 'recenter', durationS }); },
  };
  const state = {
    tick: 301,
    settings: { video: { motionReduce: false }, accessibility: { motionPreference: 'full' } },
    render: {},
  };
  const payload = {
    releaseId: 'massline:self-sling:300:1',
    source: 'massline',
    physicsEarned: true,
    bonusDv: 110,
    exitSpeed: 210,
  };
  const cue = cameraModule.applyMasslineReleaseCameraCue(cam, state, payload);
  assert.equal(cue.source, 'massline');
  assert.ok(cue.zoomFactor >= 0.06 && cue.zoomFactor <= 0.14);
  assert.equal(calls.filter((call) => call.type === 'push').length, 1);
  assert.equal(calls.filter((call) => call.type === 'recenter').length, 1);
  assert.equal(state.render.lastMasslineReleaseCue.releaseId, payload.releaseId);

  const reducedCalls = [];
  const reducedState = {
    tick: 302,
    settings: { video: { motionReduce: false }, accessibility: { motionPreference: 'reduce' } },
    render: {},
  };
  const reducedCue = cameraModule.applyMasslineReleaseCameraCue({
    pushZoom(...args) { reducedCalls.push(['push', ...args]); },
    easeRecenter(...args) { reducedCalls.push(['recenter', ...args]); },
  }, reducedState, payload);
  assert.equal(reducedCue.zoomFactor, 0);
  assert.equal(reducedCalls.some(([type]) => type === 'push'), false);
  assert.equal(reducedCalls.some(([type]) => type === 'recenter'), true);

  const unearnedCalls = [];
  const unearnedCue = cameraModule.applyMasslineReleaseCameraCue({
    pushZoom(...args) { unearnedCalls.push(['push', ...args]); },
    easeRecenter(...args) { unearnedCalls.push(['recenter', ...args]); },
  }, state, { ...payload, physicsEarned: false, bonusDv: 0 });
  assert.equal(unearnedCue.physicsEarned, false);
  assert.deepEqual(unearnedCalls, [], 'correction-only releases do not borrow earned-speed camera language');

  const rendererSource = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(rendererSource, /bus\.on\('massline:selfSling',[\s\S]*applyMasslineReleaseCameraCue/);
});

function makeThrowHarness({ assist, aimAngle, omega }) {
  const speed = 120;
  const payload = {
    id: 2,
    type: 'asteroid',
    alive: true,
    pos: { x: 100, z: 0 },
    vel: { x: speed, z: 0 },
    radius: 8,
    mass: 640,
  };
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: speed, z: -omega * 100 },
    radius: 8,
    mass: 20,
  };
  const aim = {
    id: 3,
    type: 'ship',
    alive: true,
    pos: {
      x: payload.pos.x + Math.cos(aimAngle) * 400,
      z: payload.pos.z + Math.sin(aimAngle) * 400,
    },
    vel: { x: 0, z: 0 },
    radius: 2,
    mass: 20,
  };
  const entities = new Map([[1, player], [2, payload], [3, aim]]);
  const state = {
    mode: 'flight',
    tick: 100,
    simTime: 100 / 60,
    playerId: 1,
    entities,
    entityList: [player, payload, aim],
    settings: { gameplay: { masslineReleaseAssist: assist } },
    input: { actions: { throwArm: true } },
    player: {
      targetId: 3,
      tether: { active: true, targetId: 2, attachmentId: 'att-2', phase: 'loaded' },
      masslineTelemetry: { active: true, tangentialSpeed: speed },
    },
    nav: {},
  };
  const handlers = new Map();
  const events = [];
  const cuts = [];
  const impulses = [];
  const bus = {
    on(type, fn) {
      const list = handlers.get(type) || [];
      list.push(fn);
      handlers.set(type, list);
      return () => handlers.set(type, (handlers.get(type) || []).filter((candidate) => candidate !== fn));
    },
    emit(type, payloadValue) {
      events.push({ type, payload: payloadValue });
      for (const fn of handlers.get(type) || []) fn(payloadValue, type);
    },
  };
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
        entity.vel.x += command.impulse.x / entity.mass;
        entity.vel.z += command.impulse.z / entity.mass;
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
    state,
    payload,
    player,
    events,
    cuts,
    impulses,
    ctx: { state, bus, helpers, registry },
    advanceSwing(tick, heading) {
      state.tick = tick;
      state.simTime = tick / 60;
      payload.vel.x = Math.cos(heading) * speed;
      payload.vel.z = Math.sin(heading) * speed;
      player.vel.x = payload.vel.x;
      player.vel.z = payload.vel.z - omega * 100;
    },
  };
}

function makeBus() {
  const handlers = new Map();
  return {
    on(type, fn) {
      const list = handlers.get(type) || [];
      list.push(fn);
      handlers.set(type, list);
      return () => handlers.set(type, (handlers.get(type) || []).filter((candidate) => candidate !== fn));
    },
    emit(type, payload) {
      for (const fn of handlers.get(type) || []) fn(payload, type);
    },
  };
}

function makeRecordingBus() {
  const bus = makeBus();
  const emit = bus.emit.bind(bus);
  bus.events = [];
  bus.emit = (type, payload) => {
    bus.events.push({ type, payload });
    emit(type, payload);
  };
  return bus;
}

function withLocalStorage(fn) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    fn(storage);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
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
