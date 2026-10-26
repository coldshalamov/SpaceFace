// Focused proof for the sub-tumble weapon reaction (render) and the player-caused heavy-shot
// camera answer (feel).
//
// Contract under test:
//   - a weapon hit below the solver's tumble threshold still visibly staggers the struck hull:
//     roll/pitch/yaw, contact yield, drive disruption and a recovery pose;
//   - concussive outranks explosive/kinetic/thermal/induction/coherent (family authority, not
//     damage), and the concussive hit takes the hull's helm off its line for a beat;
//   - the reaction never touches sim state: no tumble status, no event, no heading write;
//   - the player's authored heading is untouched even by a (spurious) tumble receipt;
//   - motion-reduce drops the vestibular pose but keeps the readable state;
//   - the player's own heavy shots get a bounded directional camera kick + the shared bounded
//     presentation hold, with no added shake/FOV/sim pause;
//   - the reaction path allocates nothing per frame/hit and creates no lights, points or pools.
import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshStandardMaterial } from 'three';

import {
  SUB_TUMBLE_HELM_MAX,
  SUB_TUMBLE_ROLL_MAX,
  SUB_TUMBLE_S_MAX,
  SUB_TUMBLE_S_MIN,
  createShipMicroMotionTracker,
  resolveSubTumbleReaction,
} from '../src/render/shipMicroMotion.js';
import {
  CRUNCH_HOLD_MAX_S,
  HS_CAMERA_HOLD_MAX,
  WEAPON_KICK_WU_MAX,
  feel,
  resolveWeaponImpactKick,
} from '../src/render/feel.js';
import { readTumbleStatus } from '../src/combat/tumbleStatus.js';
import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';

const DT = 1 / 60;

// --- fixtures -------------------------------------------------------------------------------

function createRecorderBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return () => {
        const list = handlers.get(event);
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    },
    emit(event, payload) {
      emitted.push(event);
      for (const fn of handlers.get(event) || []) fn(payload);
    },
  };
}

function vector3(x = 0, y = 0, z = 0) {
  return {
    x,
    y,
    z,
    set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; },
  };
}

function createCraft({ baseYaw = 0, bell = false } = {}) {
  const hull = {
    position: vector3(),
    rotation: { x: 0, y: baseYaw, z: 0 },
    scale: vector3(1, 1, 1),
    children: [],
  };
  if (bell) {
    hull.children.push({
      name: 'LOD0_engine_fan_Mechanical',
      rotation: { x: 0, y: 0, z: 0 },
      scale: vector3(1, 1, 1),
      material: new MeshStandardMaterial({ name: 'SF_Shared_mechanical_dark' }),
      children: [],
    });
  }
  const mesh = {
    userData: { hull, weapons: [] },
    position: vector3(),
    rotation: { x: 0, y: -baseYaw, z: 0 },
    children: [hull],
  };
  return { mesh, hull };
}

function npc(id = 5, over = {}) {
  return {
    id,
    type: 'ship',
    mass: 280,
    pos: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    vel: { x: 0, z: 0 },
    flags: {},
    ...over,
  };
}

// The renderer resets the hull's child roll/pitch to the entity's bank/pitch (and the root yaw to
// −rot) every presented frame before micro-motion writes; reproduce that contract here so `+=`
// channels are measured as a frame pose, not an accumulator.
function presentFrame(tracker, entity, mesh, hull, t, options = {}) {
  hull.position.x = 0;
  hull.position.y = 0;
  hull.position.z = 0;
  hull.rotation.x = 0;
  hull.rotation.z = 0;
  if (mesh.rotation) mesh.rotation.y = -entity.rot;
  tracker.updateCraftMicroMotion(entity, mesh, t, DT, options);
}

function concussiveHit(over = {}) {
  return {
    targetId: 5,
    amount: 12,
    weaponId: 'wpn_concussion_cannon_m',
    hitNormal: { x: 0, z: 1 },
    pos: { x: 0, z: 10 },
    ...over,
  };
}

// --- 1. family ladder ------------------------------------------------------------------------

test('concussive outranks every other family; sub-tumble reaction is bounded and never a tumble', () => {
  const ladder = [
    ['concussive', 'wpn_concussion_cannon_m'],
    ['explosive', 'wpn_torpedo_l'],
    ['kinetic', 'wpn_railgun_m'],
    ['thermal', 'wpn_plasma_cannon_m'],
    ['induction', 'wpn_emp_disruptor_m'],
    ['coherent', 'wpn_pulse_laser_s'],
  ];
  const reactions = ladder.map(([family, weaponId]) => {
    const r = resolveSubTumbleReaction({ weaponId, amount: 20 });
    assert.ok(r, `${family} produces a reaction`);
    assert.equal(r.family, family, `${weaponId} maps to its authored family, not an id fragment`);
    assert.equal(r.setsTumble, false, `${family} presentation never sets a tumble`);
    assert.ok(r.recoveryS >= SUB_TUMBLE_S_MIN && r.recoveryS <= SUB_TUMBLE_S_MAX,
      `${family} beat stays inside the authored window (${r.recoveryS})`);
    assert.ok(r.helmAmp >= 0 && r.helmAmp <= SUB_TUMBLE_HELM_MAX);
    assert.ok(r.rollAmp >= 0 && r.rollAmp <= SUB_TUMBLE_ROLL_MAX);
    return r;
  });
  for (let i = 1; i < reactions.length; i++) {
    const prev = reactions[i - 1];
    const next = reactions[i];
    assert.ok(prev.severity > next.severity,
      `severity ladder ${ladder[i - 1][0]} ${prev.severity} > ${ladder[i][0]} ${next.severity}`);
    assert.ok(prev.helmAmp > next.helmAmp,
      `helm ladder ${ladder[i - 1][0]} ${prev.helmAmp} > ${ladder[i][0]} ${next.helmAmp}`);
    assert.ok(prev.spool > next.spool,
      `drive-disruption ladder ${ladder[i - 1][0]} ${prev.spool} > ${ladder[i][0]} ${next.spool}`);
  }
  // The concussive family's signature: a real heading loss even on a hit that will not tumble.
  assert.ok(reactions[0].helmAmp > 0.2, `concussive takes the helm: ${reactions[0].helmAmp}`);
  assert.ok(reactions[0].severity > reactions[5].severity * 4,
    `concussive is not a reskin of coherent (${reactions[0].severity} vs ${reactions[5].severity})`);

  // With no weapon metadata the same delivered damage still follows the family ladder.
  const typed = ['explosive', 'kinetic', 'thermal', 'ion', 'energy']
    .map((damageType) => resolveSubTumbleReaction({ amount: 20, damageType }));
  for (let i = 1; i < typed.length; i++) {
    assert.ok(typed[i - 1].severity > typed[i].severity,
      `typed severity ladder: ${typed[i - 1].family} > ${typed[i].family}`);
  }
});

test('a sub-tumble concussive hit staggers the hull without setting a tumble or emitting a receipt', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createRecorderBus();
  tracker.bindEvents(bus);
  const { mesh, hull } = createCraft();
  const entity = npc(5);
  const sim = { combat: { entities: { 5: { statuses: {} } } } };
  assert.equal(readTumbleStatus(sim, 5), null, 'baseline: no tumble');

  for (let i = 0; i < 12; i++) presentFrame(tracker, entity, mesh, hull, i * DT);
  // Diagonal contact so the beat has to answer with both roll and pitch.
  tracker.onDamage(concussiveHit({ hitNormal: { x: Math.SQRT1_2, z: Math.SQRT1_2 } }));

  const rec = tracker.getRecord(5);
  assert.equal(rec.subTumbleT, 0, 'the sub-tumble beat is armed without any sim status');
  assert.ok(rec.subTumbleSeverity > 1, `concussive severity is a real hit: ${rec.subTumbleSeverity}`);

  let peakRoll = 0;
  let peakPitch = 0;
  let peakYaw = 0;
  let peakHeave = 0;
  let peakSpool = 0;
  let peakBellHeat = 0;
  for (let i = 0; i < 70; i++) {
    presentFrame(tracker, entity, mesh, hull, 0.2 + i * DT);
    peakRoll = Math.max(peakRoll, Math.abs(hull.rotation.x));
    peakPitch = Math.max(peakPitch, Math.abs(hull.rotation.z));
    peakYaw = Math.max(peakYaw, Math.abs(hull.rotation.y));
    peakHeave = Math.max(peakHeave, Math.abs(hull.position.y));
    peakSpool = Math.max(peakSpool, rec.subTumbleSpoolNow);
    peakBellHeat = Math.max(peakBellHeat, rec.bellHeat || 0);
  }
  assert.ok(peakRoll > 0.06, `hull rocks in roll: ${peakRoll}`);
  assert.ok(peakPitch > 0.03, `hull rocks in pitch: ${peakPitch}`);
  assert.ok(peakYaw > 0.12, `helm visibly leaves its line: ${peakYaw}`);
  assert.ok(peakHeave > 0.01, `the body drops into the hit: ${peakHeave}`);
  assert.ok(peakSpool > 0.5, `engine servos/disruption answer: ${peakSpool}`);
  assert.ok(peakBellHeat > 0.05, `exhaust heat skin flashes: ${peakBellHeat}`);
  assert.equal(readTumbleStatus(sim, 5), null, 'presentation never applies a tumble status');
  assert.equal(bus.emitted.includes('combat:tumbled'), false, 'presentation never announces a tumble');
  assert.equal(bus.emitted.includes('combat:statusApplied'), false, 'presentation never applies a status');

  // The beat ends and the body settles back to its authored pose.
  assert.equal(rec.subTumbleT, -1, 'the sub-tumble beat expires on its own');
  assert.ok(Math.abs(hull.rotation.x) < 0.01, `roll recovers: ${hull.rotation.x}`);
  assert.ok(Math.abs(hull.rotation.z) < 0.01, `pitch recovers: ${hull.rotation.z}`);
  assert.ok(Math.abs(hull.rotation.y) < 1e-3, `heading returns to the authored base: ${hull.rotation.y}`);
});

test('the same concussive shot crumples a light hull and barely flexes a hauler', () => {
  function reactionFor(mass) {
    const tracker = createShipMicroMotionTracker();
    const { mesh, hull } = createCraft();
    const entity = npc(21, { mass, pos: { x: 0, z: 0 } });
    for (let i = 0; i < 8; i++) presentFrame(tracker, entity, mesh, hull, i * DT);
    tracker.onDamage(concussiveHit({ targetId: 21, hitNormal: { x: 1, z: 0 }, pos: { x: 0, z: 0 } }));
    const rec = tracker.getRecord(21);
    let minX = 1;
    let peakTilt = 0;
    for (let i = 0; i < 24; i++) {
      presentFrame(tracker, entity, mesh, hull, 0.2 + i * DT);
      minX = Math.min(minX, hull.scale.x);
      peakTilt = Math.max(peakTilt, Math.abs(hull.rotation.x), Math.abs(hull.rotation.z));
    }
    return { minX, peakTilt, pitchAmp: Math.abs(rec.subTumblePitchAmp) };
  }
  const light = reactionFor(16);
  const hauler = reactionFor(2200);
  assert.ok(light.minX < 0.97, `a fighter folds under the shot's delivered momentum: ${light.minX}`);
  assert.ok(hauler.minX > 0.995, `the same momentum barely flexes a hauler: ${hauler.minX}`);
  assert.ok(light.peakTilt > 0.05, `the fighter visibly tilts: ${light.peakTilt}`);
  assert.ok(hauler.peakTilt > 0.02, `the hauler still reads the hit: ${hauler.peakTilt}`);
  assert.ok(light.pitchAmp > hauler.pitchAmp * 2,
    `the body beat is mass-relative too (${light.pitchAmp} vs ${hauler.pitchAmp})`);
});

// --- 2. player heading ownership -------------------------------------------------------------
test('the player authored heading is untouched by a concussive hit (and even a stray tumble receipt)', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createRecorderBus();
  tracker.bindEvents(bus);
  const baseYaw = 0.35;
  const { mesh, hull } = createCraft({ baseYaw });
  const entity = npc(1, { pos: { x: 40, z: 0 }, vel: { x: 60, z: 0 } });
  entity.angVel = 0;
  const options = { playerId: 1 };

  presentFrame(tracker, entity, mesh, hull, 0, options);
  assert.equal(hull.rotation.y, baseYaw, 'authored child yaw seeded');

  tracker.onDamage(concussiveHit({ targetId: 1, isPlayer: true }));
  // A receipt the sim will never issue for the player: presentation must still refuse it.
  tracker.onTumbled({ victimId: 1, startedAt: 0.1, until: 2, spin: 7, durationS: 1.9, tick: 6 });

  let staggered = false;
  for (let i = 0; i < 40; i++) {
    entity.rot = 0.02 * i;
    presentFrame(tracker, entity, mesh, hull, 0.2 + i * DT, options);
    assert.equal(hull.rotation.y, baseYaw, `player heading frame ${i}`);
    assert.equal(mesh.rotation.y, -entity.rot, `root yaw is the live sim heading frame ${i}`);
    if (Math.abs(hull.rotation.x) > 0.02 || Math.abs(hull.rotation.z) > 0.02) staggered = true;
  }
  assert.ok(staggered, 'the player hull still physically staggers (roll/pitch), only the heading is protected');
  assert.equal(entity.rot, 0.02 * 39, 'presentation never writes sim yaw');
  assert.equal(entity.angVel, 0, 'presentation never writes sim angular velocity');
});

// --- 3. accessibility -------------------------------------------------------------------------

test('motion-reduce keeps the readable reaction state and drops the vestibular pose', () => {
  function run(motionReduce) {
    const tracker = createShipMicroMotionTracker();
    const { mesh, hull } = createCraft({ bell: true });
    const entity = npc(7);
    const options = { motionReduce };
    for (let i = 0; i < 10; i++) presentFrame(tracker, entity, mesh, hull, i * DT, options);
    tracker.onDamage(concussiveHit({ targetId: 7 }));
    const rec = tracker.getRecord(7);
    let peakRoll = 0;
    let peakHeave = 0;
    let peakSpool = 0;
    let peakHeat = 0;
    for (let i = 0; i < 60; i++) {
      presentFrame(tracker, entity, mesh, hull, 0.2 + i * DT, options);
      peakRoll = Math.max(peakRoll, Math.abs(hull.rotation.x));
      peakHeave = Math.max(peakHeave, Math.abs(hull.position.y));
      peakSpool = Math.max(peakSpool, rec.subTumbleSpoolNow);
      peakHeat = Math.max(peakHeat, rec.bellHeat || 0);
    }
    return {
      peakRoll,
      peakHeave,
      peakSpool,
      peakHeat,
      severity: rec.subTumbleSeverity,
      family: rec.subTumbleScratch && rec.subTumbleScratch.family,
    };
  }
  const normal = run(false);
  const reduced = run(true);

  assert.ok(reduced.peakRoll > 0 && reduced.peakRoll < normal.peakRoll * 0.5,
    `reduced roll ${reduced.peakRoll} is suppressed below half of ${normal.peakRoll}`);
  assert.equal(reduced.peakHeave, 0, 'reduced motion keeps the vertical heave channel off');
  assert.ok(reduced.peakSpool > 0.5, `reduced motion keeps the drive disruption readable: ${reduced.peakSpool}`);
  assert.ok(reduced.peakHeat > 0.05, `reduced motion keeps the exhaust heat state readable: ${reduced.peakHeat}`);
  assert.equal(reduced.severity, normal.severity, 'the tier/severity state is identical');
  assert.equal(reduced.family, 'concussive', 'the family readout survives motion-reduce');
});

// --- 4. camera answer -------------------------------------------------------------------------

test('player-caused heavy weapon hits get a bounded directional kick and the shared bounded hold', () => {
  const ctx = { mode: 'flight', playerId: 1 };
  const heavy = [
    ['wpn_railgun_m', 60],
    ['wpn_torpedo_l', 320],
    ['wpn_siege_lance_l', 420],
    ['wpn_concussion_cannon_m', 12],
  ];
  for (const [weaponId, amount] of heavy) {
    const kick = resolveWeaponImpactKick({
      attackerId: 1,
      targetId: 2,
      weaponId,
      amount,
      hullHit: true,
      approach: { x: 3, z: 4 },
    }, ctx);
    assert.ok(kick, `${weaponId} answers the player's shot`);
    assert.ok(kick.kickWu > 0 && kick.kickWu <= WEAPON_KICK_WU_MAX,
      `${weaponId} kick bounded: ${kick.kickWu}`);
    assert.ok(kick.holdS > 0 && kick.holdS <= HS_CAMERA_HOLD_MAX,
      `${weaponId} hold bounded by the shared contact ceiling: ${kick.holdS}`);
    assert.ok(kick.holdS <= CRUNCH_HOLD_MAX_S, `${weaponId} hold is a 1–2 frame beat`);
    assert.ok(Math.abs(Math.hypot(kick.dirX, kick.dirZ) - 1) < 1e-6, `${weaponId} direction is unit`);
    assert.equal(kick.holdsPose, false);
    assert.equal(kick.stallsSim, false);
    assert.equal(kick.trauma, undefined, 'the weapon kick adds no trauma/shake channel');
  }

  assert.equal(resolveWeaponImpactKick({
    attackerId: 1, targetId: 2, weaponId: 'wpn_pulse_laser_s', amount: 5, armorHit: true,
  }, ctx), null, 'a light repeater is silent');
  assert.equal(resolveWeaponImpactKick({
    attackerId: 9, targetId: 2, weaponId: 'wpn_siege_lance_l', amount: 420, hullHit: true,
  }, ctx), null, 'an NPC shot never kicks the player camera');
  assert.equal(resolveWeaponImpactKick({
    attackerId: 1, targetId: 1, isPlayer: true, weaponId: 'wpn_siege_lance_l', amount: 420, hullHit: true,
  }, ctx), null, 'the player being hit is the other feel ladder');
  assert.equal(resolveWeaponImpactKick({
    attackerId: 1, targetId: 2, weaponId: 'wpn_siege_lance_l', amount: 420, hullHit: true,
  }, { ...ctx, motionReduce: true }), null, 'motion-reduce silences the kick');
  assert.equal(resolveWeaponImpactKick({
    attackerId: 1, targetId: 2, weaponId: 'wpn_siege_lance_l', amount: 420, hullHit: true,
  }, { ...ctx, photoMode: true }), null, 'photo mode silences the kick');
  assert.equal(resolveWeaponImpactKick({
    attackerId: 1, targetId: 2, weaponId: 'wpn_siege_lance_l', amount: 420, hullHit: true,
  }, { ...ctx, mode: 'menu' }), null, 'non-flight routes are silent');
});

function feelHost(over = {}) {
  const kicks = [];
  const holds = [];
  const traumas = [];
  const state = {
    tick: 40,
    simTime: 1,
    mode: 'flight',
    playerId: 1,
    timeScale: 1,
    settings: { video: { motionReduce: false } },
    ui: { screenStack: [], docked: false },
    entities: new Map([
      [1, { id: 1, type: 'ship', mass: 16, pos: { x: 0, z: 0 } }],
      [2, { id: 2, type: 'ship', mass: 20, pos: { x: 400, z: 0 } }],
    ]),
    render: {
      photoMode: { active: false },
      cameraCtrl: {
        addTrauma: (value) => traumas.push(value),
        impactKick: (dirX, dirZ, magnitude) => kicks.push({ dirX, dirZ, magnitude }),
        hold: (seconds) => { holds.push(seconds); return true; },
      },
    },
    ...over,
  };
  const bus = createBus();
  const effects = createTimeEffects(state);
  const host = Object.create(feel);
  host._injectStyle = () => {};
  host._mountVignette = () => {};
  host._ensureVignette = () => null;
  host._updateSpeedLines = () => {};
  host.init({ state, bus, timeEffects: effects });
  return { state, bus, host, kicks, holds, traumas };
}

test('the live damage queue applies the kick and hold, adds no shake, and never pauses the sim', () => {
  const { state, bus, host, kicks, holds, traumas } = feelHost();
  bus.emit('combat:damage', {
    attackerId: 1,
    targetId: 2,
    weaponId: 'wpn_siege_lance_l',
    amount: 420,
    hullHit: true,
    damageType: 'kinetic',
    approach: { x: 1, z: 0 },
    pos: { x: 400, z: 0 },
  });

  assert.equal(kicks.length, 1, 'one directed kick for one heavy player shot');
  assert.ok(kicks[0].magnitude > 0 && kicks[0].magnitude <= WEAPON_KICK_WU_MAX,
    `live kick bounded: ${kicks[0].magnitude}`);
  assert.ok(Math.abs(kicks[0].dirX - 1) < 1e-6 && Math.abs(kicks[0].dirZ) < 1e-6,
    'the kick follows the shot travel direction');
  assert.ok(holds.length >= 1, 'the camera hold rides the same beat');
  for (const seconds of holds) {
    assert.ok(seconds > 0 && seconds <= HS_CAMERA_HOLD_MAX,
      `every live hold respects the contact ceiling: ${seconds}`);
  }
  assert.equal(state.timeScale, 1, 'no simulation pause');

  // Prove the new path itself contributes no trauma (the separate slug-crunch owner still does).
  traumas.length = 0;
  const direct = resolveWeaponImpactKick({
    attackerId: 1, targetId: 2, weaponId: 'wpn_concussion_cannon_m', amount: 12,
    hullHit: true, approach: { x: 0, z: 1 },
  }, { mode: 'flight', playerId: 1, state });
  assert.ok(host._applyWeaponKick(direct));
  assert.deepEqual(traumas, [], 'the weapon kick adds no screen shake');
});

test('the live weapon kick honours motion-reduce and photo mode', () => {
  const reduced = feelHost();
  reduced.state.settings.video.motionReduce = true;
  reduced.bus.emit('combat:damage', {
    attackerId: 1, targetId: 2, weaponId: 'wpn_concussion_cannon_m', amount: 12,
    hullHit: true, approach: { x: 0, z: 1 },
  });
  assert.deepEqual(reduced.kicks, [], 'motion-reduce: no directional kick');
  assert.deepEqual(reduced.holds, [], 'motion-reduce: no hold');

  const photo = feelHost();
  photo.state.render.photoMode.active = true;
  photo.bus.emit('combat:damage', {
    attackerId: 1, targetId: 2, weaponId: 'wpn_concussion_cannon_m', amount: 12,
    hullHit: true, approach: { x: 0, z: 1 },
  });
  assert.deepEqual(photo.kicks, [], 'photo mode: no directional kick');
  assert.deepEqual(photo.holds, [], 'photo mode: no hold');
});

// --- 5. allocation / object-graph discipline -------------------------------------------------

function graphWalk(root) {
  let count = 0;
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    assert.ok(!node.isLight, 'no per-ship light was added');
    assert.ok(!node.isPoints && !node.isSprite, 'no new points/sprite pool was added');
    count += 1;
    const children = node.children;
    if (children) for (let i = 0; i < children.length; i++) stack.push(children[i]);
  }
  return count;
}

test('the reaction reuses retained state: no per-frame objects, lights or pools', () => {
  const tracker = createShipMicroMotionTracker();
  const { mesh } = createCraft({ bell: true });
  const entity = npc(11);
  const nodesBefore = graphWalk(mesh);

  for (let i = 0; i < 10; i++) presentFrame(tracker, entity, mesh, mesh.userData.hull, i * DT);
  tracker.onDamage(concussiveHit({ targetId: 11 }));
  presentFrame(tracker, entity, mesh, mesh.userData.hull, 0.3);

  const rec = tracker.getRecord(11);
  const poseRef = rec.yieldPose;
  const scratchRef = rec.subTumbleScratch;
  const bellsRef = rec.bells;
  const keyCount = Object.keys(rec).length;
  assert.ok(poseRef && scratchRef, 'retained scratch records exist');

  // Same retained output object every hit: the pure resolver never allocates for the live path.
  const out = {};
  for (let i = 0; i < 20; i++) {
    assert.equal(resolveSubTumbleReaction(concussiveHit({ targetId: 11 }), out), out);
  }
  assert.equal(Object.keys(out).length > 0, true);

  for (let i = 0; i < 40; i++) {
    tracker.onDamage(concussiveHit({ targetId: 11, amount: 8 + (i % 5) }));
    presentFrame(tracker, entity, mesh, mesh.userData.hull, 0.4 + i * DT);
  }
  assert.equal(graphWalk(mesh), nodesBefore, 'the presented object graph did not grow');
  assert.equal(Object.keys(rec).length, keyCount, 'the record gained no per-hit/per-frame keys');
  assert.equal(rec.yieldPose, poseRef, 'the yield pose scratch is reused');
  assert.equal(rec.subTumbleScratch, scratchRef, 'the reaction scratch is reused');
  assert.equal(rec.bells, bellsRef, 'the bell pivot list is reused');
  assert.equal(tracker.peekRecord(999), null, 'no record fabricated for an untouched id');
});

test('a live solver tumble reads as a rolling body, and the read ends with the sim envelope', () => {
  const tracker = createShipMicroMotionTracker();
  const bus = createRecorderBus();
  tracker.bindEvents(bus);
  const { mesh, hull } = createCraft();
  const entity = npc(13);
  for (let i = 0; i < 8; i++) presentFrame(tracker, entity, mesh, hull, i * DT);

  tracker.onTumbled({
    victimId: 13,
    startedAt: 0.2,
    until: 1.6,
    durationS: 1.4,
    spin: 6,
    u: 0.6,
    tick: 12,
  });
  let peakRoll = 0;
  let peakPitch = 0;
  let peakSpool = 0;
  for (let i = 0; i < 70; i++) {
    presentFrame(tracker, entity, mesh, hull, 0.2 + i * DT);
    peakRoll = Math.max(peakRoll, Math.abs(hull.rotation.x));
    peakPitch = Math.max(peakPitch, Math.abs(hull.rotation.z));
    peakSpool = Math.max(peakSpool, tracker.getRecord(13).subTumbleSpoolNow);
  }
  assert.ok(peakRoll > 0.04, `live tumble precesses in roll: ${peakRoll}`);
  assert.ok(peakPitch > 0.02, `live tumble precesses in pitch: ${peakPitch}`);
  assert.ok(peakSpool > 0.2, `live tumble carries drive distress: ${peakSpool}`);
  assert.equal(tracker.getRecord(13).tumbleReadUntil, 1.6);

  tracker.onTumbleEnd({ victimId: 13 });
  assert.equal(tracker.getRecord(13).tumbleReadUntil, -1, 'the stabilization receipt ends the read');
  assert.equal(bus.emitted.some((name) => name.startsWith('combat:status')), false,
    'the render tumble read never writes combat statuses');
});
