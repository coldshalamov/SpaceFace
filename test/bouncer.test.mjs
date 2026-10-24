import test from 'node:test';
import assert from 'node:assert/strict';
import { createBouncer, bouncerSpec } from '../src/systems/bouncer.js';
import { BOUNCER } from '../src/data/bouncer.js';
import { bouncerInRing, bouncerStrikeDecision, bouncerEjectImpulse, bouncerCanEject, bouncerDriftHome } from '../src/characters/bouncerRules.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, getDeclaredSystemClock } from '../src/runtime/authoritativeSystemManifest.js';

const CENTER = BOUNCER.center;
const INSIDE = { x: CENTER.x + 20, z: CENTER.z };
const OUTSIDE = { x: CENTER.x + BOUNCER.ringRadius + 400, z: CENTER.z };

function fixture({ sector = BOUNCER.sectorId, kind = 'adventure' } = {}) {
  const bus = createBus(), events = [];
  const state = {
    simTime: 0, tick: 0, mode: 'flight', run: { kind },
    world: { currentSectorId: sector }, entities: new Map(), entityList: [],
    story: { flags: {} }, playerId: 7, ui: { docked: false },
  };
  let id = 10;
  const helpers = {
    spawnEntity(spec) { const e = makeEntity({ ...spec, id: ++id }); state.entities.set(e.id, e); state.entityList.push(e); return e; },
    removeEntity(rid) { const e = state.entities.get(rid); if (e) e.alive = false; },
  };
  const player = helpers.spawnEntity({ type: 'ship', pos: { ...OUTSIDE }, vel: { x: 0, z: 0 }, radius: 4, mass: 20, hull: 50, hullMax: 50, isPlayer: true });
  state.playerId = player.id;
  for (const t of ['comms:popup', 'bouncer:warned', 'bouncer:ejected']) bus.on(t, (p) => events.push([t, p]));
  const system = createBouncer();
  system.init({ state, bus, helpers });
  const robot = () => state.entityList.filter((e) => e.alive && e.data?.bouncer === true)[0] || null;
  const addCorsair = (over = {}) => helpers.spawnEntity({
    type: 'ship', pos: { ...INSIDE }, vel: { x: 0, z: 0 },
    radius: 4, mass: 25, hull: 30, hullMax: 30, data: {}, ...over,
  });
  const fire = (ownerId) => bus.emit('combat:fire', { ownerId, weaponId: 'wpn_pulse', origin: INSIDE });
  const impulses = (entity) => {
    const cmds = consumePhysicsCommand(entity);
    return cmds && cmds.impulses ? cmds.impulses.splice(0) : [];
  };
  return { bus, state, helpers, system, events, robot, player, addCorsair, fire, impulses };
}

test('registered in both orders on the calendar clock', () => {
  assert.equal(PRODUCTION_INIT_ORDER.filter((x) => x === 'bouncer').length, 1);
  assert.equal(PRODUCTION_UPDATE_ORDER.filter((x) => x === 'bouncer').length, 1);
  assert.equal(getDeclaredSystemClock('bouncer'), 'calendar');
});

test('the robot posts up at Sker adventure and the ring explains itself once ever', () => {
  const f = fixture();
  assert.ok(f.robot(), 'the door robot exists');
  assert.equal(f.robot().data.authoredCharacter, 'bouncer');
  const announces = f.events.filter(([t, p]) => t === 'comms:popup' && p.id === 'bouncer_announce');
  assert.equal(announces.length, 1);
  f.system._sync(); f.system._sync();
  assert.equal(f.state.entityList.filter((e) => e.alive && e.data?.bouncer).length, 1);
  assert.equal(announces.length, 1);
});

test('no robot in survival, lab, or another sector; leaving Sker clears it', () => {
  for (const kind of ['survival', 'lab']) {
    const f = fixture({ kind });
    assert.equal(f.robot(), null, kind);
  }
  const f = fixture();
  f.state.world.currentSectorId = 'sector_helios';
  f.bus.emit('sector:enter', {});
  assert.equal(f.robot(), null, 'the door is Sker property');
});

test('first fire inside warns; the second throws the offender out', () => {
  const f = fixture();
  const c = f.addCorsair();
  f.fire(c.id);
  assert.equal(f.events.filter(([t]) => t === 'bouncer:warned').length, 1);
  assert.equal(f.impulses(c).length, 0, 'a warning is not a throw');
  f.fire(c.id);
  const imp = f.impulses(c);
  assert.equal(imp.length, 1, 'the second strike queues the throw');
  const [i] = imp;
  const dv = Math.hypot(i.x, i.z) / c.mass;
  assert.ok(Math.abs(dv - BOUNCER.ejectDeltaV) < 1e-6, 'the throw is a real delta-V');
  const dx = c.pos.x - CENTER.x;
  assert.ok(i.x * dx > 0, 'the throw points out through the door');
  assert.equal(f.events.filter(([t]) => t === 'bouncer:ejected').length, 1);
  assert.equal(f.state.story.flags[BOUNCER.ejectCountFlag], 1);
});

test('the ring throws the player too — the ring does not read the name on the hull', () => {
  const f = fixture();
  f.player.pos.x = INSIDE.x; f.player.pos.z = INSIDE.z;
  f.fire(f.player.id);
  f.fire(f.player.id);
  const imp = f.impulses(f.player);
  assert.equal(imp.length, 1);
  assert.equal(f.state.story.flags[BOUNCER.playerEjectedFlag], true);
  const ejects = f.events.filter(([t, p]) => t === 'bouncer:ejected' && p.isPlayer === true);
  assert.equal(ejects.length, 1);
});

test('fire outside the ring, and shots by dead or data-less hulls, are not strikes', () => {
  const f = fixture();
  const out = f.addCorsair({ pos: { ...OUTSIDE } });
  f.fire(out.id);
  f.fire(out.id);
  assert.equal(f.impulses(out).length, 0, 'outside the ring is outside the law');
  const dead = f.addCorsair();
  dead.alive = false;
  f.fire(dead.id); f.fire(dead.id); f.fire(dead.id);
  assert.equal(f.impulses(dead).length, 0);
  assert.equal(f.events.filter(([t]) => t === 'bouncer:ejected').length, 0);
  assert.equal(f.events.filter(([t]) => t === 'bouncer:warned').length, 0,
    'a corpse earns no strike and hears no warning — a detonator dart\'s death commit'
    + ' reports itself through combat:fire and must not shout the door law at a wreck');
});

test('the throw respects its cooldown — a burst does not stack impulses', () => {
  const f = fixture();
  const c = f.addCorsair();
  f.fire(c.id); f.fire(c.id); f.fire(c.id); f.fire(c.id);
  assert.equal(f.impulses(c).length, 1, 'cooldown bounds the door\'s arm');
  f.state.simTime += BOUNCER.ejectCooldownS + 1;
  f.fire(c.id);
  assert.equal(f.impulses(c).length, 1, 'after the cooldown the arm is free again');
});

test('the strike window expires — good behavior buys back the warning', () => {
  const f = fixture();
  const c = f.addCorsair();
  f.fire(c.id); // strike one: warned
  f.state.simTime += BOUNCER.strikeWindowS + 1;
  f.fire(c.id); // window expired: warned again, not thrown
  assert.equal(f.events.filter(([t]) => t === 'bouncer:warned').length, 2);
  assert.equal(f.impulses(c).length, 0);
});

test('the rules are honest geometry — ring, strikes, radial throw', () => {
  assert.equal(bouncerInRing(INSIDE), true);
  assert.equal(bouncerInRing(OUTSIDE), false);
  assert.deepEqual(bouncerStrikeDecision(0, undefined, 0).eject, false);
  assert.deepEqual(bouncerStrikeDecision(1, 0, 5).eject, true);
  assert.deepEqual(bouncerStrikeDecision(1, 0, BOUNCER.strikeWindowS + 1).count, 1);
  const imp = bouncerEjectImpulse({ x: CENTER.x + 10, z: CENTER.z }, 20);
  assert.ok(imp.x > 0 && Math.abs(imp.z) < 1e-9, 'outward along the radial');
  assert.equal(bouncerEjectImpulse({ x: CENTER.x, z: CENTER.z }, 20).x > 0, true, 'dead-center still throws');
  assert.equal(bouncerCanEject({ alive: false, pos: INSIDE }), false);
  assert.equal(bouncerCanEject({ alive: true, pos: { x: NaN } }), false);
  const home = bouncerDriftHome({ pos: { x: BOUNCER.post.x + 200, z: BOUNCER.post.z }, vel: { x: 0, z: 0 } });
  assert.ok(home && home.x < 0, 'beyond the leash the drift wants home');
  assert.ok(Math.abs(Math.hypot(home.x, home.z) - BOUNCER.driftSpeed) < 1e-6, 'at drift speed');
  assert.equal(bouncerDriftHome({ pos: { x: BOUNCER.post.x + 10, z: BOUNCER.post.z }, vel: { x: 0, z: 0 } }), null, 'at rest inside the leash it holds');
  const brake = bouncerDriftHome({ pos: { x: BOUNCER.post.x + 10, z: BOUNCER.post.z }, vel: { x: 6, z: 0 } });
  assert.ok(brake && brake.x === -6 && Math.abs(brake.z) < 1e-9, 'still moving inside the leash it brakes');
  assert.equal(bouncerDriftHome({ pos: { x: BOUNCER.post.x + BOUNCER.leashRadius * 0.75, z: BOUNCER.post.z }, vel: { x: -5, z: 0 } }), null, 'the deadband keeps whatever motion it has');
});

test('a save restore drops the door ledger — a restored visit starts clean', () => {
  const f = fixture();
  const c = f.addCorsair();
  f.fire(c.id); // strike one: warned
  f.bus.emit('save:loaded', {});
  f.fire(c.id); // a restored visit must warn again, not reload straight into the throw
  assert.equal(f.events.filter(([t]) => t === 'bouncer:warned').length, 2);
  assert.equal(f.impulses(c).length, 0);
});

test('the strike ledger keys on the hull, not its recycled id', () => {
  const f = fixture();
  const c = f.addCorsair();
  f.fire(c.id); // warned
  c.alive = false; // the rowdy dies inside the window
  const successor = f.helpers.spawnEntity({ type: 'ship', pos: { ...INSIDE }, vel: { x: 0, z: 0 }, radius: 4, mass: 25, hull: 30, hullMax: 30, data: {} });
  successor.id = c.id; // the allocator hands the corpse's id to a fresh occupant
  f.state.entities.set(successor.id, successor);
  f.fire(successor.id);
  assert.equal(f.events.filter(([t]) => t === 'bouncer:warned').length, 2,
    'a fresh occupant of a dead rowdy\'s id earns its own first warning');
  assert.equal(f.impulses(successor).length, 0);
});

test('the robot drifts home through the impulse membrane and brakes inside the leash', () => {
  const f = fixture();
  const r = f.robot();
  r.pos.x = BOUNCER.post.x + 200; r.pos.z = BOUNCER.post.z;
  f.system.update(0.5, f.state);
  const imp = f.impulses(r);
  assert.equal(imp.length, 1, 'the walk home is a queued impulse, not a vel write (a live Rapier body owns linvel)');
  assert.ok(imp[0].x < 0, 'the impulse points back to the post');
  const walkDv = Math.hypot(imp[0].x, imp[0].z) / r.mass;
  assert.ok(Math.abs(walkDv - BOUNCER.driftSpeed) < 1e-6, 'the walk homes at drift speed');
  r.pos.x = BOUNCER.post.x + 10; r.pos.z = BOUNCER.post.z;
  r.vel.x = 0; r.vel.z = 0;
  f.system.update(0.5, f.state);
  assert.equal(f.impulses(r).length, 0, 'inside the leash at rest it stands');
  r.vel.x = 6;
  f.system.update(0.5, f.state);
  const stop = f.impulses(r);
  assert.equal(stop.length, 1, 'inside the leash it brakes to a stop');
  assert.ok(Math.abs(stop[0].x - -6 * r.mass) < 1e-6, 'the brake cancels its drift exactly');
});

test('destroy clears listeners, providers, and the robot; re-init is clean', () => {
  const f = fixture();
  assert.ok(f.robot());
  f.system.destroy();
  assert.equal(f.robot(), null);
  f.system.init({ state: f.state, bus: f.bus, helpers: f.helpers });
  f.system.init({ state: f.state, bus: f.bus, helpers: f.helpers });
  assert.ok(f.robot());
  const c = f.addCorsair();
  f.fire(c.id);
  assert.equal(f.events.filter(([t]) => t === 'bouncer:warned').length, 1, 're-init does not double-count fire');
});
