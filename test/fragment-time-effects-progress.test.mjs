// Fragment-storm clock-ownership contract — "offscreen wreck junk cannot hold the world."
//
// Defect (oct18-recording-1702): player position and speed froze ~2.5 s while the HUD and
// canvas cosmetics kept animating — worst while the tether was held, and only after physical
// breakup was introduced. The mechanism was feel.js's hit-stop: 'feel:hit-stop' requests into
// timeEffects re-armed faster than they expired — capital kills re-armed inside their own
// window, rated moment beats wrote outside every gate, and third-body chain beats fired per
// player-caused contact chain (a held tether makes every fragment contact player-caused).
//
// The structural repair: automatic presentation beats never write the world clock at all.
// 'feel:hit-stop' is a retired request name — nothing in feel sets it, and init/reset/destroy
// still clear it defensively so a lease parked by an older generation cannot linger. Impact,
// kill, moment, and chain beats keep their FOV punch, trauma, directed kick, vignette,
// killCam, and audio stinger — only the clock write is gone. The world clock belongs to
// explicit owners alone: pauses, save restore, and the player's own Focus/bulletTime.
//
// This fixture drives the REAL feel singleton — real init(), real bus subscriptions, real
// frame() — against the real event bus and the real timeEffects service, with production
// receipt shapes and a held-tether context. Only DOM/canvas methods are replaced.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { BEAT_STINGER, feel } from '../src/render/feel.js';

const FRAME_60 = 1 / 60;
const FRAME_20 = 1 / 20;
const PLAYER_ID = 1;
// The retired request name: a lease parked under it by an older generation, a hot re-init, or
// a stale realm snapshot must be released on lifecycle reset and teardown — and never re-armed.
const RETIRED_SOURCE = 'feel:hit-stop';

// Internal beat-window field, whichever the implementation calls it — used only as evidence
// that a beat armed, never as a contract. The clock assertions below are the contract.
function beatWindow(host) {
  return host._beatTimer ?? host._hsTimer ?? 0;
}

function makeFixture({ seed = 9, motionReduce = false } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.playerId = PLAYER_ID;
  state.ui.screenStack = [];
  state.ui.docked = false;
  state.settings.video = state.settings.video || {};
  state.settings.video.motionReduce = motionReduce;
  const player = {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    collides: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 7,
    mass: 20,
    hull: 200,
    hullMax: 200,
    flags: {},
    data: {},
  };
  state.entities.set(PLAYER_ID, player);
  state.entityList.push(player);
  // Held-tether context: the storm's contacts and kills are all player-caused remote work —
  // exactly the conditions where the recorded hold was worst.
  state.player.tether = { active: true, targetId: 'flung-mass-1', sourceId: PLAYER_ID };

  const bus = createBus();
  const effects = createTimeEffects(state);
  // A stub camera controller records every visual callback the beats still owe: trauma,
  // directed kicks, kill/death cams, moment holds. These are the effects that survive —
  // only the clock write is gone.
  const calls = { trauma: [], kick: [], killCam: [], hold: [], cue: [] };
  state.render.cameraCtrl = {
    addTrauma: (v) => calls.trauma.push(v),
    impactKick: (x, z, wu) => calls.kick.push({ x, z, wu }),
    killCam: (m, opts) => calls.killCam.push({ m, opts }),
    deathCam: () => calls.killCam.push({ death: true }),
    hold: (s) => calls.hold.push(s),
    pushZoom: () => {},
  };
  bus.on('audio:cue', (c) => calls.cue.push(c));
  const host = Object.create(feel);
  // Only DOM/canvas work is replaced; init, listeners, frame, trigger and time authority run.
  host._injectStyle = () => {};
  host._mountVignette = () => {};
  host._ensureVignette = () => null;
  host._ensureHullCrit = () => null;
  host._updateSpeedLines = () => {};
  host.init({ state, bus, timeEffects: effects });
  return { state, bus, effects, host, calls, nextId: 100 };
}

// Production wreck-fragment shape (src/systems/hullFracture.js): a live, colliding,
// physics-driven tear-off/breakup piece — not a cosmetic shard.
function spawnFragment(fx, { x = 40, z = 30 } = {}) {
  const id = fx.nextId++;
  const ent = {
    id,
    type: 'wreck',
    alive: true,
    collides: true,
    pos: { x, z },
    vel: { x: 4, z: -2 },
    angVel: 0.3,
    radius: 3,
    mass: 4,
    hull: 1,
    hullMax: 1,
    flags: {},
    data: {
      parentType: 'ship',
      kind: 'wreck',
      fracturePiece: true,
      physicalBreakup: true,
      fractureOf: 'ship-1',
      fractureVisual: 'torn',
      fractureVictimRadius: 18,
      killedAt: fx.state.simTime,
      collisionTearOff: false,
      salvagePool: 0,
      salvageTimeLeft: 0,
    },
    physicsBody: { type: 'dynamic', mass: 4 },
  };
  fx.state.entities.set(id, ent);
  fx.state.entityList.push(ent);
  return ent;
}

function spawnShip(fx, { x = 120, z = 60, mass = 20, radius = 10 } = {}) {
  const id = fx.nextId++;
  const ent = {
    id,
    type: 'ship',
    alive: true,
    collides: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius,
    mass,
    hull: 0,
    hullMax: 120,
    shipClass: 'gunship',
    flags: {},
    data: {},
  };
  fx.state.entities.set(id, ent);
  fx.state.entityList.push(ent);
  return ent;
}

// entity:killed — the combat.js emit shape (buildKillPresentationReceipt rides `presentation`).
function emitKill(fx, victim, { victimClass = 'wreck' } = {}) {
  fx.bus.emit('entity:killed', {
    id: victim.id,
    killerId: fx.state.playerId,
    type: victim.type,
    pos: { x: victim.pos.x, z: victim.pos.z },
    factionId: null,
    factionLawful: false,
    bountyCr: 0,
    lootTableId: null,
    victimClass,
    targetHostileToPlayer: true,
    baseKind: null,
    presentation: { version: 1, cause: 'ship_collision', playerCaused: true },
  });
}

// physics:impact — the core/physics.js _impactPayload shape; the held tether owns the contact.
function emitImpact(fx, a, b, { closing = 60 } = {}) {
  fx.bus.emit('physics:impact', {
    consequenceKernelVersion: 1,
    backend: 'custom',
    tick: fx.state.tick,
    aId: a.id,
    bId: b.id,
    pairKey: `${Math.min(a.id, b.id)}${Math.max(a.id, b.id)}`,
    dp: closing * Math.min(a.mass, b.mass),
    impulse: closing * Math.min(a.mass, b.mass),
    trauma: 0.2,
    playerInvolved: false,
    playerDeltaV: 0,
    causalActorId: fx.state.playerId,
    pos: { x: a.pos.x, z: a.pos.z },
    normal: { x: 1, z: 0 },
    preSolveClosingSpeed: closing,
  });
}

// combat:collisionConsequence — the collisionConsequences.js emit shape; provenance makes the
// held tether the actor and rootId keys the chain for the third-body beat.
function emitConsequence(fx, target, other, { rootId, rootTick, deltaV = 80 } = {}) {
  fx.bus.emit('combat:collisionConsequence', {
    exchangedMomentum: deltaV * target.mass,
    deltaV,
    feelDeltaV: deltaV,
    targetId: target.id,
    otherId: other.id,
    tick: fx.state.tick,
    pos: { x: target.pos.x, z: target.pos.z },
    normal: { x: 1, z: 0 },
    provenance: {
      actorId: fx.state.playerId,
      weaponId: 'massline',
      tag: 'massline',
      tick: rootTick,
      rootId,
    },
    surface: 'craft',
  });
}

// moment:holyShit with no presentationOwner — the non-stuntGrammar beat path.
function emitMoment(fx, score = 9) {
  fx.bus.emit('moment:holyShit', { score, trickId: 'wrecking_ball', tick: fx.state.tick });
}

// The storm: every beat source, player-caused, sustained — fragment kills, capital-class kills
// near and far, physics contacts, consequence chains, and rated moments.
function fragmentStorm(fx, i) {
  if (i % 3 === 0) {
    const v = spawnFragment(fx, { x: 30 + (i % 90), z: 20 });
    v.alive = false;
    emitKill(fx, v, { victimClass: 'wreck' });
  }
  if (i % 24 === 6) {
    const v = spawnShip(fx, { x: 120, z: 60 });
    v.alive = false;
    emitKill(fx, v, { victimClass: i % 48 === 6 ? 'gunship' : 'cruiser' });
  }
  if (i % 30 === 12) {
    const v = spawnShip(fx, { x: 4000 + i, z: 4000 });
    v.alive = false;
    emitKill(fx, v, { victimClass: 'gunship' });
  }
  if (i % 4 === 1) {
    const a = spawnFragment(fx, { x: 55, z: 35 });
    const b = spawnFragment(fx, { x: 60, z: 38 });
    emitImpact(fx, a, b, { closing: 50 + (i % 30) });
  }
  if (i % 20 === 9) {
    const t = spawnFragment(fx, { x: 70, z: 40 });
    const o1 = spawnFragment(fx, { x: 74, z: 42 });
    const o2 = spawnFragment(fx, { x: 78, z: 44 });
    // The second consequence must carry the greater deltaV — same-frame pending records only
    // replace on a strictly larger presented strength, and the chainBeat flag rides the winner.
    emitConsequence(fx, t, o1, { rootId: `root-${i}`, rootTick: fx.state.tick, deltaV: 80 });
    emitConsequence(fx, t, o2, { rootId: `root-${i}`, rootTick: fx.state.tick, deltaV: 120 });
  }
  if (i % 15 === 7) emitMoment(fx, 9);
}

function driveStorm(fx, seconds, emit, frameDt = FRAME_60) {
  const frames = Math.max(1, Math.round(seconds / frameDt));
  const samples = [];
  for (let i = 0; i < frames; i += 1) {
    fx.state.tick += 1;
    emit(fx, i);
    fx.host.frame(frameDt, fx.state);
    fx.state.simTime += frameDt * fx.state.timeScale;
    samples.push({
      i,
      t: (i + 1) * frameDt,
      scale: fx.state.timeScale,
      beat: beatWindow(fx.host),
      fov: fx.host._fovPunch + fx.host._fovPunchApplied,
    });
  }
  return samples;
}

for (const [label, frameDt] of [['60 fps', FRAME_60], ['20 fps', FRAME_20]]) {
  test(`a sustained fragment storm lands its beats and never writes the clock (${label})`, () => {
    const fx = makeFixture();
    const samples = driveStorm(fx, 8, fragmentStorm, frameDt);
    for (const s of samples) {
      assert.equal(
        s.scale,
        1,
        `frame ${s.i}: a presentation beat wrote the world clock (scale ${s.scale})`,
      );
    }
    // The simulation clock itself: a full 8 s of storm must advance 8 s of sim time — the
    // recorded defect is the ~2.5 s this used to lose under the held dip.
    assert.ok(
      Math.abs(fx.state.simTime - 8) < 1e-6,
      `the world must run at full speed through the storm (simTime ${fx.state.simTime})`,
    );
    assert.deepEqual(
      fx.effects.describeRequests(),
      {},
      'no time-effects request may be armed by feel — beats are presentation only',
    );
    // The beats themselves still land — every surviving channel.
    assert.ok(samples.some((s) => s.beat > 0 || s.fov > 0), 'beats still arm their authored windows');
    assert.ok(samples.some((s) => s.fov > 0), 'the storm must still land its FOV punch');
    assert.ok(fx.calls.trauma.length > 0, 'impact trauma must still land');
    assert.ok(fx.calls.kick.length > 0, 'directed impact kicks must still land');
    assert.ok(fx.calls.killCam.length > 0, 'kill cam must still answer player-caused kills');
    assert.ok(fx.calls.hold.length > 0, 'the rated-moment camera hold must still arm');
    assert.ok(
      fx.calls.cue.some((c) => c && c.id === BEAT_STINGER),
      'the rated-moment stinger must still fire',
    );
  });
}

test('a receipt burst between delayed or missing frames cannot write the clock', () => {
  // The recorded hold surfaced at LOW frame rates: receipts arrived faster than delayed
  // frames could drain the dip. With the writer gone this is structural, not a race.
  const fx = makeFixture();
  for (let burst = 0; burst < 3; burst += 1) {
    for (let i = 0; i < 24; i += 1) fragmentStorm(fx, burst * 24 + i);
    assert.equal(
      fx.state.timeScale,
      1,
      `burst ${burst}: the receipts alone must never move the clock`,
    );
    fx.host.frame(0.6, fx.state); // ~600 ms hitch between render frames
    assert.equal(fx.state.timeScale, 1, `burst ${burst}: the delayed frame must not dip`);
    assert.deepEqual(fx.effects.describeRequests(), {});
  }
  assert.ok(
    fx.calls.trauma.length > 0 && fx.calls.killCam.length > 0,
    'the beats themselves still landed between delayed frames',
  );
});

test('explicit pause and Focus owners survive the storm untouched', () => {
  const fx = makeFixture();
  fx.effects.set('flyby-focus', { scale: 0.5 });
  driveStorm(fx, 2, fragmentStorm);
  assert.equal(
    fx.state.timeScale,
    0.5,
    'the player Focus bound must hold while beats land underneath it',
  );
  fx.effects.set('ui:pausing-screen', { scale: 0 });
  driveStorm(fx, 0.5, fragmentStorm);
  assert.equal(
    fx.state.timeScale,
    0,
    'the pause owner must keep its freeze through the storm',
  );
  fx.effects.clear('ui:pausing-screen');
  fx.effects.clear('flyby-focus');
  fx.host.frame(FRAME_60, fx.state);
  assert.equal(
    fx.state.timeScale,
    1,
    'releasing the explicit owners returns the world to full speed',
  );
});

test('a stale feel:hit-stop lease is released on lifecycle reset and on teardown', () => {
  const fx = makeFixture();
  fx.effects.set(RETIRED_SOURCE, { scale: 0.12 });
  assert.equal(fx.state.timeScale, 0.12, 'fixture must begin with the stale lease held');
  fx.bus.emit('sim:pause', {});
  assert.equal(
    fx.effects.describeRequests()[RETIRED_SOURCE],
    undefined,
    'the lifecycle reset must release the retired source name',
  );
  assert.equal(fx.state.timeScale, 1);
  for (const event of ['game:new', 'save:restoring', 'save:loaded']) {
    fx.effects.set(RETIRED_SOURCE, { scale: 0.12 });
    fx.bus.emit(event, {});
    assert.equal(
      fx.effects.describeRequests()[RETIRED_SOURCE],
      undefined,
      `${event} must release the retired source name`,
    );
  }
  driveStorm(fx, 2, fragmentStorm);
  assert.equal(fx.state.timeScale, 1, 'the storm must never re-arm the retired source');
  assert.deepEqual(fx.effects.describeRequests(), {});
  fx.effects.set(RETIRED_SOURCE, { scale: 0.12 });
  fx.host.destroy();
  assert.equal(
    fx.effects.describeRequests()[RETIRED_SOURCE],
    undefined,
    'teardown must release the retired source name',
  );
});

test('the death beat is presentation too — punch, wash, cam; never the clock', () => {
  const fx = makeFixture();
  fx.bus.emit('player:death', { pos: { x: 0, z: 0 } });
  assert.equal(fx.state.timeScale, 1, 'the biggest beat in the game still leaves the clock alone');
  assert.ok(
    fx.calls.killCam.some((k) => k && k.death === true),
    'the death cam still arms',
  );
  assert.ok(
    fx.host._fovPunch > 0 || fx.host._fovPunchApplied > 0,
    'the death FOV punch still lands',
  );
  for (let i = 0; i < 90; i += 1) {
    fx.state.tick += 1;
    fx.host.frame(FRAME_60, fx.state);
    assert.equal(
      fx.state.timeScale,
      1,
      'the death beat is presentation only — the clock never dips',
    );
  }
  assert.deepEqual(fx.effects.describeRequests(), {});
});

test('reduced motion keeps the clock untouched and still silences the vestibular channels', () => {
  const fx = makeFixture({ motionReduce: true });
  const samples = driveStorm(fx, 4, fragmentStorm);
  for (const s of samples) {
    assert.equal(s.scale, 1, `motionReduce frame ${s.i} wrote the clock`);
    assert.equal(s.fov, 0, `motionReduce frame ${s.i} still punched FOV`);
    assert.equal(s.beat, 0, `motionReduce frame ${s.i} still armed a beat window`);
  }
  assert.equal(fx.calls.kick.length, 0, 'motionReduce keeps the directed kick off');
  assert.equal(fx.calls.cue.length, 0, 'motionReduce keeps the moment stinger off');
  assert.equal(fx.calls.hold.length, 0, 'motionReduce keeps the moment camera hold off');
  assert.deepEqual(fx.effects.describeRequests(), {});
});
