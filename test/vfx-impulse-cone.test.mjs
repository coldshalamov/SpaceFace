// PQ-139.03 — concussion, rail, and impulse-charge impacts are directional families, not spheres.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { SIM_DT } from '../src/core/sim.js';
import { vfx } from '../src/render/vfx.js';
import { resolveImpactPresentationProfile } from '../src/render/vfxProfiles.js';
import {
  IMPULSE_CHARGE_SHOVE_CAP,
  impulseCharges,
} from '../src/systems/impulseCharges.js';

const source = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const flashKind = Number(source.match(/const SPR_FLASH = (\d+);/)[1]);
const ringKind = Number(source.match(/const SPR_RING = (\d+);/)[1]);

const PLAYER_ID = 1;
const TARGET_ID = 9;
const CHARGE_ID = 50;
const EAST_ID = 60;
const WEST_ID = 61;

function makeCanvas() {
  const listeners = [];
  return {
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    removeEventListener(type, fn) {
      for (let i = listeners.length - 1; i >= 0; i--) {
        if (listeners[i].type === type && listeners[i].fn === fn) listeners.splice(i, 1);
      }
    },
    dispatchEvent() { return true; },
  };
}

function liveSprites(system) {
  return (system._spr || []).filter((sprite) => sprite && sprite.alive);
}

function liveStreaks(system) {
  const out = [];
  const count = system._liveTrailStreakCount || 0;
  for (let i = 0; i < count; i++) out.push(system._ts[system._activeTrailStreaks[i]]);
  return out;
}

function liveParticles(system) {
  const out = [];
  const cap = system._cap || 0;
  for (let i = 0; i < cap; i++) {
    if (system._alive && system._alive[i]) out.push({ vx: system._vx[i], vz: system._vz[i] });
  }
  return out;
}

function makeVfxHarness({ motionReduce = false, flashReduce = false } = {}) {
  const scene = new THREE.Scene();
  const player = {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 4, z: 1 },
    rot: 0,
    radius: 6,
    shield: 0,
  };
  const target = {
    id: TARGET_ID,
    type: 'ship',
    alive: true,
    pos: { x: 8, z: 3 },
    vel: { x: -2, z: 0 },
    rot: 0,
    radius: 8,
    shield: 0,
  };
  const state = {
    playerId: PLAYER_ID,
    player: { targetId: TARGET_ID },
    entities: new Map([[PLAYER_ID, player], [TARGET_ID, target]]),
    entityList: [player, target],
    simTime: 12,
    tick: 720,
    settings: {
      video: { particleQuality: 'high', motionReduce, engineTrails: true },
      accessibility: { flashReduce },
    },
    render: {
      scene,
      renderer: { domElement: makeCanvas() },
    },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => player } });
  return { system, state, bus, player, target, scene };
}

function hitPayload(weaponId) {
  return {
    weaponId,
    targetId: TARGET_ID,
    pos: { x: 8, z: 3 },
    approach: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
  };
}

function makeChargeWorld() {
  const player = {
    id: PLAYER_ID, type: 'ship', alive: true, team: 'player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, mass: 32,
    hull: 100, data: {},
  };
  const charge = {
    id: CHARGE_ID, type: 'charge', alive: true, team: 'player',
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 1.2, mass: 0.5,
    data: {
      kind: 'impulse_charge', chargeId: 'charge_standard', ownerId: PLAYER_ID,
      hostId: null, localOffset: null, armed: true, spawnedAt: 0,
    },
  };
  const east = {
    id: EAST_ID, type: 'ship', alive: true, team: 'pirate',
    pos: { x: 120, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 32,
    hull: 100, data: {},
  };
  const west = {
    id: WEST_ID, type: 'ship', alive: true, team: 'pirate',
    pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 32,
    hull: 100, data: {},
  };
  const state = {
    mode: 'flight',
    tick: 500,
    simTime: 500 / 60,
    playerId: PLAYER_ID,
    entities: new Map([
      [PLAYER_ID, player], [CHARGE_ID, charge], [EAST_ID, east], [WEST_ID, west],
    ]),
    entityList: [player, charge, east, west],
    input: { actions: { chargeThrow: false, chargeDetonate: false } },
  };
  return { player, charge, east, west, state };
}

test('declared families stay cone/sheet/ribbon, not rings', () => {
  const concussion = resolveImpactPresentationProfile('wpn_concussion_cannon_m');
  const rail = resolveImpactPresentationProfile('wpn_railgun_m');
  const mine = resolveImpactPresentationProfile('wpn_vector_mine_m');
  assert.equal(concussion.mode, 'concussive-slam');
  assert.equal(rail.mode, 'penetration-streak');
  assert.equal(mine.mode, 'radial-shove');
  assert.notEqual(concussion.primaryShape, 'ring');
  assert.notEqual(rail.primaryShape, 'ring');
  assert.notEqual(mine.primaryShape, 'ring');
});

test('concussion projectile hit reaches its signed shock-sheet family', () => {
  const { system, bus } = makeVfxHarness();
  bus.emit('projectile:hit', hitPayload('wpn_concussion_cannon_m'));
  const sprites = liveSprites(system);
  const flashes = sprites.filter((sprite) => sprite.kind === flashKind);
  const collapsing = flashes.filter((sprite) => sprite.size0 > sprite.size1);
  const sheets = flashes.filter((sprite) => sprite.aspect >= 2.5);
  assert.ok(collapsing.length >= 1, 'concussion keeps a collapsing core flash');
  assert.ok(sheets.length >= 2, 'concussion shock fronts are elongated sheets, not discs');
  assert.equal(sprites.some((sprite) => sprite.kind === ringKind), false);
  const streaks = liveStreaks(system);
  assert.ok(streaks.length >= 2, 'concussion debris ribbons must spawn');
  assert.ok(streaks.every((streak) => Number.isFinite(streak.ax) && Number.isFinite(streak.az)));
  const particles = liveParticles(system);
  assert.ok(particles.length >= 4, 'concussion spark cone must spawn');
  const left = particles.filter((p) => p.vx < 0).length;
  assert.ok(left > particles.length * 0.6, 'spall opens back along the signed approach, not as a sphere');
  system.destroy();
});

test('rail projectile hit reaches its axial family with the weapon presenter live', () => {
  const { system, bus } = makeVfxHarness();
  assert.ok(system._weaponPresenter, 'the shipping presenter must be mounted');
  bus.emit('projectile:hit', hitPayload('wpn_railgun_m'));
  const streaks = liveStreaks(system);
  const axial = streaks.filter((streak) => Math.abs(streak.ax) > 0.85 && Math.abs(streak.az) < 0.35);
  assert.ok(axial.length >= 2, 'rail must keep its penetration cut while the presenter is active');
  assert.equal(liveSprites(system).some((sprite) => sprite.kind === ringKind), false);
  const particles = liveParticles(system);
  assert.ok(particles.length >= 2, 'rail keeps a tight exit cone, not generic impact clutter alone');
  system.destroy();
});

test('impulse charge producer emits bounded per-hit directions and no spherical explosion cue', () => {
  const { state } = makeChargeWorld();
  const bus = createBus();
  const detonated = [];
  const cues = [];
  bus.on('charge:detonated', (payload) => detonated.push(payload));
  bus.on('presentation:vfxCue', (payload) => cues.push(payload));
  const system = Object.create(impulseCharges);
  system.init({
    state,
    bus,
    helpers: {
      combatPhysics: { applyImpulse() { return true; } },
      routeCombatDamage() { return { ok: true }; },
    },
    registry: null,
  });
  state.input.actions.chargeDetonate = true;
  system.update(SIM_DT, state);

  assert.equal(detonated.length, 1);
  const payload = detonated[0];
  assert.ok(payload.hits.includes(EAST_ID) && payload.hits.includes(WEST_ID));
  assert.ok(Array.isArray(payload.shoves));
  assert.ok(payload.shoves.length >= 2);
  assert.ok(payload.shoves.length <= IMPULSE_CHARGE_SHOVE_CAP);
  const east = payload.shoves.find((row) => row.id === EAST_ID);
  const west = payload.shoves.find((row) => row.id === WEST_ID);
  assert.ok(east && east.dx > 0.9 && Math.abs(east.dz) < 0.1);
  assert.ok(west && west.dx < -0.9 && Math.abs(west.dz) < 0.1);
  assert.ok(east.mag > 0 && west.mag > 0);
  assert.equal(cues.some((cue) => cue && cue.id === 'combat.explosion.small'), false,
    'impulse charges must not emit the generic spherical explosion cue');
});

test('live charge handler paints real shove sheets and ribbons, not rings', () => {
  const world = makeChargeWorld();
  const bus = createBus();
  const charges = Object.create(impulseCharges);
  charges.init({
    state: world.state,
    bus,
    helpers: {
      combatPhysics: { applyImpulse() { return true; } },
      routeCombatDamage() { return { ok: true }; },
    },
    registry: null,
  });
  world.state.settings = {
    video: { particleQuality: 'high', motionReduce: false, engineTrails: true },
    accessibility: { flashReduce: false },
  };
  world.state.render = {
    scene: new THREE.Scene(),
    renderer: { domElement: makeCanvas() },
  };
  const fx = Object.create(vfx);
  fx.init({ state: world.state, bus, helpers: {} });

  world.state.input.actions.chargeDetonate = true;
  charges.update(SIM_DT, world.state);

  assert.equal(liveSprites(fx).some((sprite) => sprite.kind === ringKind), false,
    'charge detonation must not keep the old spherical ring identity');
  const flashes = liveSprites(fx).filter((sprite) => sprite.kind === flashKind);
  assert.ok(flashes.some((sprite) => sprite.size0 > sprite.size1), 'compact collapsing core remains');
  assert.ok(flashes.some((sprite) => sprite.aspect >= 2.5), 'shock sheets carry the shove family');
  const streaks = liveStreaks(fx);
  assert.ok(streaks.some((streak) => streak.ax > 0.9));
  assert.ok(streaks.some((streak) => streak.ax < -0.9),
    'two opposite victims must produce two real directions, not one invented axis');
  fx.destroy();
});

test('reduced-motion keeps causal axes for concussion, rail, and impulse charge', () => {
  const concussion = makeVfxHarness({ motionReduce: true, flashReduce: true });
  concussion.bus.emit('projectile:hit', hitPayload('wpn_concussion_cannon_m'));
  const concSprites = liveSprites(concussion.system);
  const concStreaks = liveStreaks(concussion.system);
  assert.ok(concSprites.some((sprite) => sprite.kind === flashKind && sprite.aspect >= 2.5));
  assert.ok(concStreaks.some((streak) => Number.isFinite(streak.ax) && Number.isFinite(streak.az)));
  assert.ok(concSprites.length + concStreaks.length < 20, 'reduced concussion uses fewer primitives');
  concussion.system.destroy();

  const rail = makeVfxHarness({ motionReduce: true, flashReduce: true });
  assert.ok(rail.system._weaponPresenter);
  rail.bus.emit('projectile:hit', hitPayload('wpn_railgun_m'));
  const railStreaks = liveStreaks(rail.system);
  assert.ok(railStreaks.some((streak) => Math.abs(streak.ax) > 0.85));
  const fullRail = makeVfxHarness();
  fullRail.bus.emit('projectile:hit', hitPayload('wpn_railgun_m'));
  assert.ok(railStreaks.length <= liveStreaks(fullRail.system).length);
  rail.system.destroy();
  fullRail.system.destroy();

  const world = makeChargeWorld();
  const bus = createBus();
  const charges = Object.create(impulseCharges);
  charges.init({
    state: world.state,
    bus,
    helpers: {
      combatPhysics: { applyImpulse() { return true; } },
      routeCombatDamage() { return { ok: true }; },
    },
    registry: null,
  });
  world.state.settings = {
    video: { particleQuality: 'high', motionReduce: true, engineTrails: true },
    accessibility: { flashReduce: true },
  };
  world.state.render = {
    scene: new THREE.Scene(),
    renderer: { domElement: makeCanvas() },
  };
  const fx = Object.create(vfx);
  fx.init({ state: world.state, bus, helpers: {} });
  world.state.input.actions.chargeDetonate = true;
  charges.update(SIM_DT, world.state);
  const reducedStreaks = liveStreaks(fx);
  assert.ok(reducedStreaks.some((streak) => streak.ax > 0.9));
  assert.ok(reducedStreaks.some((streak) => streak.ax < -0.9));
  assert.equal(liveSprites(fx).some((sprite) => sprite.kind === ringKind), false);
  fx.destroy();
});

test('ordinary collision consequences stay bilateral with no invented signed departure', () => {
  const run = (normalX) => {
    const { system } = makeVfxHarness();
    const admitted = system._onCollisionConsequence({
      tick: 40,
      targetId: PLAYER_ID,
      otherId: TARGET_ID,
      pos: { x: 2, z: 0 },
      normal: { x: normalX, z: 0 },
      control: 'tumble',
      impactDamage: 6,
      deltaV: 18,
      surface: 'terrain',
    });
    assert.equal(admitted, true);
    const streaks = liveStreaks(system).map((streak) => [streak.ax, streak.az]);
    system.destroy();
    return streaks;
  };
  const positive = run(1);
  const negative = run(-1);
  assert.deepEqual(negative, positive, 'unoriented contact cannot pick a signed departure');
  assert.ok(positive.some(([x]) => x > 0.9) && positive.some(([x]) => x < -0.9),
    'medium collision retains both contact-axis halves');
});
