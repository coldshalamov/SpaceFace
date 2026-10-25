/**
 * Linked Shield Pylons (packet 06) — every attack path reads the SAME panel geometry, through the
 * real SG-02 physics authority and the real combat system (no mocks).
 *
 *   projectile sweep  core/physics.js  sweepProjectiles   (hostile stops, owner/ally pass, fast shells)
 *   beam ray          systems/combat.js _applyBeamDamage  (hostile ends at the wall, owner passes)
 *   blast occlusion   combat/physicalEffects.js drainBlast (path centre->body, once per blast per pair)
 *   chain selection   combat/attackHit.js collectAttackCandidates
 *   endpoint counterplay: hostile fire reaches and destroys an endpoint, which retires the pair
 *
 * Exactly one owner debits shield energy and emits the contact receipt: the attack paths only
 * record, the shieldPylons system drains the inbox once.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { weapons } from '../src/systems/weapons.js';
import { shieldPylons } from '../src/systems/shieldPylons.js';
import { PYLON_MODULE_ID, SHIELD_PYLON_DEF as DEF, PYLON_STATES as S } from '../src/data/shieldPylons.js';
import { pylonMirror } from '../src/combat/pylonShieldQuery.js';
import { schedulePhysicalBlast } from '../src/combat/physicalEffects.js';
import { collectAttackCandidates } from '../src/combat/attackHit.js';

const COOLDOWN_TICKS = Math.ceil(DEF.deployCooldownS / SIM_DT) + 3;

async function boot({ seed = 6161, withWeapons = false } = {}) {
  const sim = createSimulation({ seed, bus: createBus(), systems: withWeapons ? [shieldPylons, physics, weapons, combat] : [shieldPylons, physics, combat] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  state.player.credits = 5000;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const physicsSys = sim.registry.get('physics');
  assert.equal(await physicsSys.prepareBackend(state), true, 'SG-02 rapier-dynamic backend should initialize headless');
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: -200 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 500, hullMax: 500, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship', fittings: [PYLON_MODULE_ID] },
  });
  state.playerId = player.id;
  const events = [];
  for (const name of ['shieldPylon:contact', 'shieldPylon:intercepted', 'shieldPylon:retired', 'shieldPylon:overloaded',
    'projectile:hit', 'entity:killed']) {
    sim.bus.on(name, (p) => events.push({ name, p, tick: state.tick }));
  }
  const t = { sim, state, bus: sim.bus, player, events, physicsSys };
  t.cleanup = () => { if (typeof physicsSys._disableSg02DynamicAuthority === 'function') physicsSys._disableSg02DynamicAuthority(); };
  return t;
}

function steps(t, n) { for (let i = 0; i < n; i++) t.sim.step(); }
function press(t, aim) {
  t.state.input.aimWorld = { x: aim.x, z: aim.z };
  t.state.input.actions.deployShieldPylon = true;
  t.sim.step();
}

// A wall along x=100 from z=-60 to z=+60. The player (at the origin line, range 170) places it.
function placeWall(t, x = 100) {
  t.player.pos.x = 0; t.player.pos.z = 0;
  press(t, { x, z: -60 });
  steps(t, COOLDOWN_TICKS);
  press(t, { x, z: 60 });
  steps(t, Math.ceil(DEF.linkS / SIM_DT) + 8);
  const pair = pylonMirror(t.state).pairs.find((p) => p.panel && Math.abs(p.panel.ax - x) < 1e-6);
  assert.ok(pair && pair.state === S.ACTIVE, 'the wall is up');
  t.player.pos.z = -400; // park the owner well clear of every lane under test
  return pair;
}

function ship(t, x, z, { team = 1, hull = 100, radius = 10, data = {} } = {}) {
  return t.sim.spawn({
    type: 'ship', team, pos: { x, z }, radius, collides: true, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    hull, hullMax: hull, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, flightModel: { inertia: 40 }, flags: {},
    physicsBody: { schemaVersion: 1, radius, mass: 14, inertiaY: 40, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship', ...(team === 1 ? { encounter: true } : {}), ...data },
  });
}

function bolt(t, owner, x, z, vx, vz, { damage = 30, radius = 2 } = {}) {
  return t.sim.spawn({
    type: 'projectile', pos: { x, z }, vel: { x: vx, z: vz }, rot: Math.atan2(vz, vx), radius, mass: 0.1,
    team: owner.team, ownerId: owner.id, ttl: 20, collides: true,
    data: { damage, weaponId: 'wpn_test', damageType: 'kinetic' },
  });
}

const contacts = (t, kind) => t.events.filter((e) => e.name === 'shieldPylon:contact' && (!kind || e.p.kind === kind));
const hits = (t) => t.events.filter((e) => e.name === 'projectile:hit');

test('projectile sweep: a hostile round stops at the wall from either face; the target behind is untouched; one debit', async () => {
  const t = await boot();
  try {
    const pair = placeWall(t);
    const shooterW = ship(t, 20, 0, { team: 1 });
    const shooterE = ship(t, 180, 20, { team: 1 });
    const victimE = ship(t, 150, 0, { team: 0, hull: 400 });
    const victimW = ship(t, 60, 20, { team: 0, hull: 400 });
    const before = pair.energy;
    const a = bolt(t, shooterW, 40, 0, 500, 0, { damage: 30 });
    const b = bolt(t, shooterE, 160, 20, -500, 0, { damage: 45 });
    steps(t, 20);
    assert.equal(a.alive, false, 'the west round ended');
    assert.equal(b.alive, false, 'the east round ended');
    assert.ok(a.pos.x <= 100 - DEF.halfThickness - a.radius + 1e-6 && a.pos.x > 90, `west round ends at the face, x=${a.pos.x}`);
    assert.ok(b.pos.x >= 100 + DEF.halfThickness + b.radius - 1e-6 && b.pos.x < 112, `east round ends at the face, x=${b.pos.x}`);
    assert.equal(hits(t).length, 0, 'no round also hit the body behind the wall in the same step');
    assert.equal(victimE.hull, 400); assert.equal(victimW.hull, 400);
    const cs = contacts(t, 'projectile');
    assert.equal(cs.length, 2, 'one contact receipt per accepted interception');
    assert.deepEqual(cs.map((c) => c.p.amount).sort((x, y) => x - y), [30, 45]);
    steps(t, 2);
    assert.ok(Math.abs((before - pair.energy) - 75) < 1e-6 + DEF.regenPerS * 0.1, `energy debited exactly once per contact, delta=${before - pair.energy}`);
    assert.ok(t.events.some((e) => e.name === 'shieldPylon:intercepted'));
  } finally { t.cleanup(); }
});

test('projectile sweep: the owner\'s and an ally\'s rounds pass through the wall and hit what is behind it', async () => {
  const t = await boot();
  try {
    const pair = placeWall(t);
    const owner = t.player;
    owner.pos.x = 40; owner.pos.z = 0; // the owner stands west of the wall and shoots east
    const ally = ship(t, 40, 30, { team: 0 });
    const targetA = ship(t, 150, 0, { team: 1, hull: 400 });
    const targetB = ship(t, 150, 30, { team: 1, hull: 400 });
    const before = pair.energy;
    bolt(t, owner, 60, 0, 500, 0, { damage: 30 });
    bolt(t, ally, 60, 30, 500, 0, { damage: 30 });
    steps(t, 30);
    const hitIds = hits(t).map((e) => e.p.targetId).sort();
    assert.deepEqual(hitIds, [targetA.id, targetB.id].sort(), 'both friendly rounds crossed and landed');
    assert.equal(contacts(t).length, 0, 'the wall absorbed nothing');
    assert.equal(pair.energy, before);
  } finally { t.cleanup(); }
});

test('projectile sweep: a 6000 WU/s shell cannot tunnel the wall in one tick', async () => {
  const t = await boot();
  try {
    placeWall(t);
    const shooter = ship(t, 20, 0, { team: 1 });
    const victim = ship(t, 400, 0, { team: 0, hull: 400 });
    const shell = bolt(t, shooter, 90, 0, 6000, 0, { damage: 60, radius: 1 });
    steps(t, 6);
    assert.equal(shell.alive, false);
    assert.ok(shell.pos.x < 100, `the shell ended on the near face, x=${shell.pos.x}`);
    assert.equal(victim.hull, 400);
    assert.equal(hits(t).length, 0);
  } finally { t.cleanup(); }
});

test('projectile sweep: a round that reaches an endpoint first hits the endpoint, not the wall; fire destroys it and the pair collapses', async () => {
  const t = await boot();
  try {
    const pair = placeWall(t);
    const endpoint = t.state.entities.get(pair.a.id);
    const shooter = ship(t, 100, -200, { team: 1 });
    // Straight down the axis into endpoint A: the endpoint (radius 7) is met before the cap (2.2).
    const first = bolt(t, shooter, 100, -150, 0, 600, { damage: 30 });
    steps(t, 12);
    assert.equal(first.alive, false);
    const hit = hits(t).find((e) => e.p.projectileId === first.id);
    assert.ok(hit, 'the round produced a projectile:hit');
    assert.equal(hit.p.targetId, endpoint.id, 'on the endpoint, not the wall');
    assert.equal(contacts(t, 'projectile').length, 0, 'the wall absorbed nothing for an endpoint hit');
    assert.ok(endpoint.hull < DEF.endpointHull, `endpoint took damage, hull=${endpoint.hull}`);
    // Keep firing until it dies.
    for (let i = 0; i < 6 && endpoint.alive !== false; i++) {
      bolt(t, shooter, 100, -150, 0, 600, { damage: 40 });
      steps(t, 12);
    }
    steps(t, 4);
    assert.equal(endpoint.alive, false, 'hostile fire destroyed the endpoint');
    const m = pylonMirror(t.state);
    assert.equal(m.pairs.length, 0, 'the whole pair collapsed with it');
    assert.equal(m.blocking, 0);
    const retired = t.events.filter((e) => e.name === 'shieldPylon:retired');
    assert.equal(retired.length, 1);
    assert.equal(retired[0].p.reason, 'endpoint_destroyed');
    const partner = t.state.entities.get(pair.b.id);
    assert.equal(!partner || partner.alive === false, true, 'no orphan endpoint');
  } finally { t.cleanup(); }
});

test('beam: a hostile ray ends at the wall and hurts nothing behind it; the owner\'s ray passes', async () => {
  const t = await boot();
  try {
    const pair = placeWall(t);
    const hostile = ship(t, 20, 0, { team: 1 });
    const victim = ship(t, 150, 0, { team: 0, hull: 400 });
    const energyBefore = pair.energy;
    const beam = { ownerId: hostile.id, factionId: hostile.factionId, weaponId: 'wpn_test_beam',
      from: { x: 30, z: 0 }, to: { x: 260, z: 0 }, dmgType: 'energy', dpsThisTick: 5, beamKey: 'k1' };
    t.state.combat.beams.push(beam);
    steps(t, 1);
    assert.ok(beam.to.x < 100 && beam.to.x > 95, `the ray ends on the near face, x=${beam.to.x}`);
    assert.equal(victim.hull, 400, 'nothing behind the wall was damaged');
    assert.equal(contacts(t, 'beam').length >= 0, true);
    steps(t, 1);
    assert.ok(contacts(t, 'beam').length >= 1, 'the beam contact receipt came from the one owner');
    assert.ok(pair.energy < energyBefore);
    // The owner's own ray crosses and damages the hostile standing behind the wall.
    t.state.combat.beams.length = 0;
    const behind = ship(t, 150, 15, { team: 1, hull: 400 });
    const ownBeam = { ownerId: t.player.id, factionId: t.player.factionId, weaponId: 'wpn_test_beam',
      from: { x: 40, z: 15 }, to: { x: 260, z: 15 }, dmgType: 'energy', dpsThisTick: 5, beamKey: 'k2' };
    t.state.combat.beams.push(ownBeam);
    const hullBefore = behind.hull;
    steps(t, 1);
    assert.ok(ownBeam.to.x > 130, `the owner's ray reached the target, x=${ownBeam.to.x}`);
    assert.ok(behind.hull < hullBefore, 'and hurt it');
  } finally { t.cleanup(); }
});

test('blast: a hostile explosion is occluded along the real path; the owner\'s is not; one debit per blast per pair', async () => {
  const t = await boot();
  try {
    const pair = placeWall(t);
    const hostile = ship(t, 20, 0, { team: 1 });
    const near = ship(t, 70, 10, { team: 0 });   // same side as the blast: takes it
    const far1 = ship(t, 140, -10, { team: 0 });  // behind the wall: shielded
    const far2 = ship(t, 150, 30, { team: 0 });   // behind the wall: shielded
    const reached = [];
    steps(t, 2); // let the spatial hash see the new hulls
    const energyBefore = pair.energy;
    schedulePhysicalBlast(t.state, {
      center: { x: 60, z: 0 }, radius: 140, helpers: t.sim.helpers,
      payload: { kind: 'test_blast', sourceId: hostile.id, damage: 80, baseImpulse: 100 },
      onBody: (body) => reached.push(body.id),
    });
    assert.ok(reached.includes(near.id), 'a body on the blast\'s own side is reached');
    assert.ok(!reached.includes(far1.id) && !reached.includes(far2.id), 'bodies behind the wall are shielded');
    steps(t, 2);
    assert.equal(contacts(t, 'blast').length, 1, 'two shielded bodies, ONE receipt for the blast');
    assert.ok(Math.abs((energyBefore - pair.energy) - 80) < 1e-6 + DEF.regenPerS * 0.1, `one debit, delta=${energyBefore - pair.energy}`);
    // The owner's blast crosses freely.
    const own = [];
    schedulePhysicalBlast(t.state, {
      center: { x: 60, z: 0 }, radius: 140, helpers: t.sim.helpers,
      payload: { kind: 'test_blast', sourceId: t.player.id, damage: 80, baseImpulse: 100 },
      onBody: (body) => own.push(body.id),
    });
    assert.ok(own.includes(far1.id) && own.includes(far2.id) && own.includes(near.id));
    // A blast centred ON the wall is not occluded by it (it does not cancel an explosion that
    // originates inside the footprint).
    const onWall = [];
    schedulePhysicalBlast(t.state, {
      center: { x: 100, z: 0 }, radius: 100, helpers: t.sim.helpers,
      payload: { kind: 'test_blast', sourceId: hostile.id, damage: 80, baseImpulse: 100 },
      onBody: (body) => onWall.push(body.id),
    });
    assert.ok(onWall.includes(far1.id) && onWall.includes(near.id));
  } finally { t.cleanup(); }
});

test('blast: a pair\'s own endpoints are never occluded by their own wall, so blasts can destroy them', async () => {
  const t = await boot();
  try {
    const pair = placeWall(t);
    const endpoint = t.state.entities.get(pair.b.id);
    const hostile = ship(t, 20, 90, { team: 1 });
    const reached = [];
    t.player.pos.x = 0; t.player.pos.z = -80;
    steps(t, 3);
    schedulePhysicalBlast(t.state, {
      center: { x: 100, z: 80 }, radius: 60, helpers: t.sim.helpers,
      payload: { kind: 'test_blast', sourceId: hostile.id, damage: 20, baseImpulse: 50 },
      onBody: (body) => reached.push(body.id),
    });
    assert.ok(reached.includes(endpoint.id), 'the endpoint is reachable');
  } finally { t.cleanup(); }
});

test('chain: a hostile arc cannot select a target behind a wall; the owner\'s arc can', async () => {
  const t = await boot();
  try {
    placeWall(t);
    const hostile = ship(t, 20, 0, { team: 1 });
    const victim = ship(t, 150, 0, { team: 0 });
    const behind = ship(t, 150, 5, { team: 1 });
    t.player.pos.x = 0; t.player.pos.z = -80; // keep the hulls inside the spatial hash's near ring
    steps(t, 3);
    const scratch = [];
    const origin = { x: 60, z: 0 };
    const blocked = collectAttackCandidates(t.state, origin, 300, scratch, hostile.id, hostile.team);
    assert.ok(!blocked.some((c) => c.id === victim.id), 'a hostile arc is stopped by the wall');
    // The same hop from the owner's side of the relation: the owner's chain passes. (Hostile target
    // behind the wall, owner shooting.)
    const own = collectAttackCandidates(t.state, origin, 300, [], t.player.id, t.player.team);
    assert.ok(own.some((c) => c.id === behind.id), 'the owner\'s arc reaches a hostile behind the wall');
    // And with no wall at all the hostile arc would have found the victim.
    const m = pylonMirror(t.state);
    const saved = m.blocking;
    m.blocking = 0;
    const open = collectAttackCandidates(t.state, origin, 300, [], hostile.id, hostile.team);
    m.blocking = saved;
    assert.ok(open.some((c) => c.id === victim.id), 'without the wall the same hop selects the victim');
  } finally { t.cleanup(); }
});

test('two overlapping panels: a shot across both is charged to the NEARER wall only (one debit)', async () => {
  const t = await boot();
  try {
    const first = placeWall(t, 100);
    steps(t, COOLDOWN_TICKS);
    t.player.pos.x = 0; t.player.pos.z = 0;
    press(t, { x: 120, z: -60 });
    steps(t, COOLDOWN_TICKS);
    press(t, { x: 120, z: 60 });
    steps(t, Math.ceil(DEF.linkS / SIM_DT) + 8);
    const second = pylonMirror(t.state).pairs.find((p) => p.panel && Math.abs(p.panel.ax - 120) < 1e-6);
    assert.ok(second && second.state === S.ACTIVE);
    t.player.pos.z = -400;
    const shooter = ship(t, 20, 0, { team: 1 });
    const e1 = first.energy; const e2 = second.energy;
    const shot = bolt(t, shooter, 60, 0, 600, 0, { damage: 30 });
    steps(t, 10);
    assert.equal(shot.alive, false);
    assert.ok(shot.pos.x < 100, 'stopped by the nearer wall');
    steps(t, 2);
    assert.ok(first.energy < e1, 'the nearer wall paid');
    assert.ok(second.energy >= e2, 'the farther wall did not');
  } finally { t.cleanup(); }
});

test('determinism: the same seed and the same shots give the same energy ledger', async () => {
  const run = async () => {
    const t = await boot({ seed: 7171 });
    try {
      const pair = placeWall(t);
      const shooter = ship(t, 20, 0, { team: 1 });
      for (let i = 0; i < 5; i++) { bolt(t, shooter, 60, i * 4, 500, 0, { damage: 20 + i }); steps(t, 8); }
      steps(t, 5);
      return [pair.energy, pair.state, t.state.tick];
    } finally { t.cleanup(); }
  };
  assert.deepEqual(await run(), await run());
});

test('an explosive round detonates at the intercept point on the attacker\'s side; the wall shields what is behind it', async () => {
  const t = await boot({ withWeapons: true });
  try {
    const pair = placeWall(t);
    const shooter = ship(t, 20, 0, { team: 1 });
    t.player.pos.x = 0; t.player.pos.z = -90;
    const west = ship(t, 82, 45, { team: 0, hull: 400 });   // attacker's side, inside the splash
    const east = ship(t, 118, 45, { team: 0, hull: 400 });  // behind the wall, inside the splash
    const missile = bolt(t, shooter, 40, 25, 400, 0, { damage: 30, radius: 2 });
    missile.data.splashRadius = 70; missile.data.splashDmg = 60;
    steps(t, 3);
    const westBefore = west.hull; const eastBefore = east.hull;
    steps(t, 20);
    assert.equal(missile.alive, false);
    assert.ok(west.hull < westBefore, `the attacker's side took the blast, hull=${west.hull}`);
    assert.equal(east.hull, eastBefore, 'the wall shielded the far side from the same blast');
    assert.ok(contacts(t, 'projectile').length >= 1 && contacts(t, 'blast').length === 1,
      `one projectile receipt and ONE blast receipt, got ${contacts(t).map((c) => c.p.kind)}`);
    assert.ok(pair.energy < pair.capacity);
  } finally { t.cleanup(); }
});
