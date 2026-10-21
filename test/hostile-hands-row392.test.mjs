import test from 'node:test';
import assert from 'node:assert/strict';
import { incomingBodyThreatFor } from '../src/ai/reflexes.js';
import { selectIncomingMassCue } from '../src/render/incomingMassCue.js';
import { BODY_LAUNCH, bodyLaunchStep, isBodyLauncherEnemy, selectBodyLaunchCandidate } from '../src/ai/specialistPlans.js';
import { createTacticalAISystem, emitIncomingMassCue, stepHostileBodyLaunches } from '../src/systems/tacticalAI.js';
import { recordImpulseProvenance, readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
import { collisionConsequences, contactImpulseProvenance } from '../src/systems/collisionConsequences.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { doctrineTellKind, resolveDoctrineTellPlacement } from '../src/ui/hud.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { normalizeActivity } from '../src/ai/doctrine.js';
import { fields } from '../src/systems/fields.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { FIELD_FLAGS } from '../src/data/fields.js';

const DT = 1 / 60;
function ship(id, team, x, ai = null) {
  return { id, type: 'ship', team, alive: true, pos: { x, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, mass: 50, hull: 100, hullMax: 100, shield: 0, shieldMax: 0,
    armor: 0, armorMax: 0, rot: 0, collides: true,
    physicsBody: { mass: 50, dynamic: true }, data: { ...(ai ? { ai } : {}), intent: {}, combat: {} } };
}
function fixture() {
  const player = ship('player', 0, 300);
  const enemy = ship('enemy', 1, 0, { passive: false, lawful: false, forcePlayerTarget: true,
    hostileTeams: [0], motive: 'assigned_interdiction', engagementTrigger: 'authorized_hostile_spawn',
    zoneId: 'sector_hostile_zone', approachTelegraph: 'engine_flare', noFireResponseWindowS: 1,
    combatDoctrineId: 'brawler_commit', roe: 'weapons_free',
    activity: normalizeActivity({ kind: 'attack_run', reason: 'fixture', anchor: { x: 0, z: 0 },
      leashRadius: 2200, startedTick: 0 }) });
  enemy.data.weapons = [{ defId: 'wpn_concussion_cannon_m' }];
  const body = { id: 'body', type: 'wreck', alive: true, pos: { x: 80, z: 0 },
    vel: { x: 0, z: 0 }, mass: 60, radius: 8, hull: 1000, collides: true,
    physicsBody: { dynamic: true, mass: 60 }, data: {} };
  const state = { tick: 100, simTime: 100 / 60, mode: 'flight', playerId: player.id,
    player: { heat: 0 }, world: { currentSectorId: 'sector_ceres_belt' }, meta: { seed: 4242 },
    entities: new Map([player, enemy, body].map(e => [e.id, e])), entityList: [player, enemy, body],
    combat: { beams: [], entities: {}, threatTables: new Map() } };
  const events = [];
  const bus = createBus();
  bus.on('ai:telegraph', e => events.push(structuredClone(e)));
  const runtime = new Map();
  const doctrine = { byEntity: new Map([[enemy.id,
    { doctrineId: 'brawler_commit', phase: 'commit', targetId: player.id }]]) };
  return { state, player, enemy, body, bus, events, runtime, doctrine };
}
function tickLaunch(h, tick) {
  h.state.tick = tick;
  h.state.simTime = tick / 60;
  stepHostileBodyLaunches(h.state, h.bus, h.runtime, h.doctrine);
  return consumePhysicsCommand(h.body)?.impulses.map(v => ({ x: v.x, z: v.z })) || [];
}
function bodyContact(id, x = 160, vx = -160, z = 0) {
  return { id, kind: 'hazard', alive: true, radius: 8, pos: { x, z }, vel: { x: vx, z: 0 } };
}

test('incoming mass: closing/ETA/miss boundaries, classification, and stable single choice', () => {
  const self = ship('pilot', 0, 0);
  const c = bodyContact('a');
  assert.equal(incomingBodyThreatFor(self, [c]).eta, 1);
  for (const bad of [bodyContact('a', 160, 160), bodyContact('a', 200, -160),
    bodyContact('a', 160, -160, 80), { ...c, kind: 'projectile' },
    { ...c, kind: 'ship' }, { ...c, alive: false }]) {
    assert.equal(incomingBodyThreatFor(self, [bad]), null);
  }
  self.vel.x = -70; // absolute body speed is fast, but relative closing is only 90
  assert.equal(incomingBodyThreatFor(self, [c]), null);
  self.vel.x = -60;
  assert.equal(incomingBodyThreatFor(self, [bodyContact('a', 100)]).closingSpeed, 100);
  self.vel.x = 0;
  assert.equal(incomingBodyThreatFor(self, [bodyContact('a', 176)]).eta, 1.1);
  for (const flag of ['tumbling', 'disabled']) {
    assert(incomingBodyThreatFor(self, [{ ...c, kind: 'ship', [flag]: true }]));
  }
  const near = bodyContact('z', 80);
  assert.equal(incomingBodyThreatFor(self, [c, near]).bodyId, 'z');
  for (const list of [[{ ...c, id: 'b' }, c], [c, { ...c, id: 'b' }]]) {
    assert.equal(incomingBodyThreatFor(self, list).bodyId, 'a');
  }
  assert.deepEqual(selectIncomingMassCue(self, [c]), { bodyId: 'a', eta: 1, direction: { x: 1, z: 0 } });
});

test('per-tick cue refresh selects exactly one body; 3,600 calm ticks emit zero', () => {
  const h = fixture();
  h.body.pos.x = 140; h.body.vel.x = 160;
  const second = { ...h.body, id: 'later', pos: { x: 130, z: 0 } };
  h.state.entities.set(second.id, second);
  for (let tick = 0; tick < 3; tick++) {
    h.state.tick = tick;
    emitIncomingMassCue(h.state, h.bus);
  }
  assert.equal(h.events.length, 3);
  assert(h.events.every(e => e.entityId === h.body.id && e.phase === 'incoming_mass'
    && e.durationTicks === 24 && !('doctrineId' in e)));
  h.events.length = 0;
  h.body.vel.x = 0; second.vel = { x: 0, z: 0 };
  for (let tick = 0; tick < 3600; tick++) { h.state.tick = tick; emitIncomingMassCue(h.state, h.bus); }
  assert.equal(h.events.length, 0);
  h.body.vel.x = 160;
  h.state.mode = 'menu'; emitIncomingMassCue(h.state, h.bus);
  h.state.mode = 'flight'; h.player.alive = false; emitIncomingMassCue(h.state, h.bus);
  assert.equal(h.events.length, 0);
});

test('the HUD tell consumer resolves launch windup and incoming mass on the real event payloads', () => {
  const h = fixture();
  h.state.tick = 100; h.state.simTime = 100 / 60;
  stepHostileBodyLaunches(h.state, h.bus, h.runtime, h.doctrine);
  const windup = h.events.find(e => e.phase === 'body_launch');
  assert(windup, 'windup telegraph emitted');
  assert.equal(doctrineTellKind(windup), 'LAUNCH');
  // The incoming cue anchors on the thrown body itself — a non-ship entity the chip resolves
  // through the same state.entities lookup the tell updater uses every frame.
  h.body.pos.x = 140; h.body.vel.x = 160;
  emitIncomingMassCue(h.state, h.bus);
  const inbound = h.events.find(e => e.phase === 'incoming_mass');
  assert(inbound, 'incoming-mass telegraph emitted');
  assert.equal(doctrineTellKind(inbound), 'INCOMING');
  assert.equal(h.state.entities.get(inbound.entityId), h.body);
  // A targetless telegraph surfaces as aimed at the player (the HUD's legacy rule); a targetId
  // here would also steal the ActionVfx anchor from the body onto the pilot's own hull.
  assert.equal(inbound.targetId, undefined);
  assert.equal(windup.targetId, undefined);
  // On-screen the chip anchors to the body; off-screen it clamps to an edge with a direction.
  const on = resolveDoctrineTellPlacement(1280, 720, { x: 640, y: 360, onScreen: true });
  assert(on && on.onScreen === true);
  const off = [{ x: -200, y: 360 }, { x: 1400, y: 360 }, { x: 640, y: -100 }, { x: 640, y: 800 }]
    .map(p => resolveDoctrineTellPlacement(1280, 720, { ...p, onScreen: false })).find(Boolean);
  assert(off && off.onScreen === false && Number.isFinite(off.directionDeg));
});

test('the real ActionVfx consumer anchors the body cue and the launch charge on the right hulls', async () => {
  const THREE = await import('three');
  const { ActionVfx } = await import('../src/render/actionVfx.js');
  const h = fixture();
  const av = new ActionVfx(new THREE.Scene());
  h.state.tick = 100; h.state.simTime = 100 / 60;
  stepHostileBodyLaunches(h.state, h.bus, h.runtime, h.doctrine);
  const windup = h.events.find(e => e.phase === 'body_launch');
  assert.equal(av.emit('ai:telegraph', windup, h.state), true);
  let slot = av.slots.find(s => s.alive && s.event === 'ai:telegraph' && s.kind === 'weapon_charge');
  assert.equal(slot.target, h.enemy, 'charge tributaries draw on the charging hull');
  h.body.pos.x = 140; h.body.vel.x = 160;
  emitIncomingMassCue(h.state, h.bus);
  const inbound = h.events.find(e => e.phase === 'incoming_mass');
  assert.equal(av.emit('ai:telegraph', inbound, h.state), true);
  slot = av.slots.find(s => s.alive && s.event === 'ai:telegraph' && s.kind === 'engine_flare');
  assert.equal(slot.target, h.body, 'the flare rides the incoming body, not the pilot');
  // The same payloads keep their HUD tell routing (consumer surfaces agree on one emission).
  assert.equal(doctrineTellKind(inbound), 'INCOMING');
  assert.equal(doctrineTellKind(windup), 'LAUNCH');
});

test('registered tactical owner warns even with no thinking NPCs', () => {
  const tactical = createTacticalAISystem();
  const sim = createSimulation({ seed: 4242, systems: [aiPorts, tactical] });
  sim.state.mode = 'flight';
  const player = sim.spawn(ship(undefined, 0, 0)); sim.state.playerId = player.id;
  const body = sim.spawn({ ...fixture().body, id: undefined, pos: { x: 160, z: 0 }, vel: { x: -160, z: 0 } });
  const events = []; sim.bus.on('ai:telegraph', e => events.push(e));
  sim.step(); sim.step();
  assert.equal(events.length, 2);
  assert(events.every(e => e.entityId === body.id));
});

test('registered tactical stack launches during real doctrine cycles and abandons save-load windups', () => {
  const tactical = createTacticalAISystem({ config: { enemyMind: { enabled: false } } });
  const sim = createSimulation({ seed: 4242, systems: [aiPorts, tactical] });
  sim.state.mode = 'flight'; sim.state.world.currentSectorId = 'sector_ceres_belt';
  const player = sim.spawn(ship(undefined, 0, 300)); sim.state.playerId = player.id;
  const enemy = sim.spawn(makeEnemySpawnSpec('mirrorjaw_foreman', 4, { x: 0, z: 0 }, { startedTick: 0 }));
  enemy.data.ai.forcePlayerTarget = true;
  // Ammunition has to be physically present and leave once thrown: integrate each body every
  // step so a spent wreck cannot satisfy a second launch from a frozen pose.
  const bodies = [];
  for (let i = 0; i < 3; i++) {
    bodies.push(sim.spawn({ ...fixture().body, id: undefined,
      pos: { x: 70 + i * 35, z: i * 24 }, vel: { x: 0, z: 0 },
      physicsBody: { dynamic: true, mass: 60 }, data: {} }));
  }
  const events = []; sim.bus.on('ai:telegraph', e => events.push(structuredClone(e)));
  const launches = [];
  for (let i = 0; i < 1800; i++) {
    sim.step();
    for (const body of bodies) {
      const impulses = consumePhysicsCommand(body)?.impulses;
      if (impulses?.length) {
        launches.push({ tick: sim.state.tick, bodyId: body.id, count: impulses.length });
        for (const impulse of impulses) { body.vel.x += impulse.x / body.mass; body.vel.z += impulse.z / body.mass; }
      }
      body.pos.x += body.vel.x * DT; body.pos.z += body.vel.z * DT;
    }
  }
  assert(launches.length >= 2, JSON.stringify({ launches, cues: events.filter(e => e.phase === 'body_launch') }));
  assert.equal(new Set(launches.map(l => l.bodyId)).size, launches.length,
    'each launch must spend a different real body');
  for (const launch of launches) {
    assert.equal(launch.count, 1);
    const cue = events.filter(e => e.phase === 'body_launch' && e.tick <= launch.tick).at(-1);
    assert(launch.tick - cue.tick >= 54);
  }
  const owner = sim.registry.get('tacticalAI');
  owner.init({ state: sim.state, bus: sim.bus, helpers: sim.helpers, registry: sim.registry });
  events.length = 0;
  let fireTick = null;
  const spare = sim.spawn({ ...fixture().body, id: undefined, pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 },
    physicsBody: { dynamic: true, mass: 60 }, data: {} });
  for (let i = 0; i < 800 && fireTick == null; i++) {
    sim.step(); consumePhysicsCommand(spare);
    const cue = events.find(e => e.phase === 'body_launch');
    if (cue) fireTick = cue.tick + BODY_LAUNCH.WINDUP_TICKS;
  }
  assert.notEqual(fireTick, null);
  sim.bus.emit('save:loaded', {});
  const afterRestore = [];
  while (sim.state.tick <= fireTick) {
    sim.step();
    if (consumePhysicsCommand(spare)?.impulses.length) afterRestore.push(sim.state.tick);
  }
  assert.deepEqual(afterRestore, [], 'restore cannot finish a pre-load windup');
});

test('real concussion loadouts qualify; unarmed, passive, dead, and non-ship actors do not', () => {
  for (const id of ['mirrorjaw_foreman', 'forge_regent']) {
    const def = ENEMY_TYPES.find(e => e.id === id);
    assert(def);
    const spec = makeEnemySpawnSpec(id, 4, { x: 0, z: 0 }, { startedTick: 0 });
    assert.equal(isBodyLauncherEnemy(spec), true, id);
  }
  const { enemy } = fixture();
  assert.equal(isBodyLauncherEnemy(enemy), true);
  for (const change of [e => { e.alive = false; }, e => { e.data.ai.passive = true; },
    e => { e.type = 'asteroid'; }, e => { e.data.weapons = [{ defId: 'wpn_pulse_laser_s' }]; }]) {
    const copy = structuredClone(enemy); change(copy); assert.equal(isBodyLauncherEnemy(copy), false);
  }
});

test('candidate selection rejects heavy, fixed, fast, distant and uninterceptable bodies', () => {
  const h = fixture();
  assert.equal(selectBodyLaunchCandidate(h.state, h.enemy, h.player), h.body);
  for (const change of [b => { b.physicsBody.mass = 401; }, b => { b.physicsBody.dynamic = false; },
    b => { b.vel.x = 61; }, b => { b.pos.x = -161; }, b => { b.collides = false; },
    b => { b.type = 'ship'; }, b => { b.alive = false; }]) {
    const copy = structuredClone(h.body); change(copy); h.state.entities.set(copy.id, copy);
    assert.equal(selectBodyLaunchCandidate(h.state, h.enemy, h.player), null);
  }
  h.state.entities.set(h.body.id, h.body);
  h.player.vel.x = 200;
  assert.equal(selectBodyLaunchCandidate(h.state, h.enemy, h.player), null);
  h.player.vel.x = 0;
  const twin = { ...h.body, id: 'aaa' }; h.state.entities.set(twin.id, twin);
  assert.equal(selectBodyLaunchCandidate(h.state, h.enemy, h.player), twin);
});

test('windup emits once, fires at 54 ticks, leads motion and cancels lost/recycled bodies', () => {
  const h = fixture(); const rt = { phase: 'idle', nextEligibleTick: 0 };
  h.player.vel.z = 30;
  const step = tick => bodyLaunchStep(rt, { ...h, tick });
  assert(step(100).telegraph);
  assert.equal(step(153), null);
  const launch = step(154).launch;
  const velocity = { x: launch.impulse.x / 60, z: launch.impulse.z / 60 };
  assert(Math.abs(Math.hypot(velocity.x, velocity.z) - 170) < 1e-9);
  assert(velocity.z > 0);
  assert.equal(step(155), null);
  for (const change of [() => { h.body.pos.x = -161; },
    () => { h.state.entities.set(h.body.id, structuredClone(h.body)); },
    () => { h.player.alive = false; }]) {
    h.body.pos.x = 80; h.player.alive = true; h.state.entities.set(h.body.id, h.body);
    Object.assign(rt, { phase: 'idle', nextEligibleTick: 0 });
    assert(step(200).telegraph); change(); assert(step(201).cancel);
    assert.equal(rt.nextEligibleTick, 381);
  }
});

test('owner launches twice per sustained fight, each after its own >=48 tick telegraph', () => {
  // Each named fight runs the REAL registered stack — live doctrine cycles (ingress/fire/recover),
  // not a permanently committed phase — with the fight's own encounter stamp. Ammunition integrates
  // impulse→velocity→position every step so a spent wreck cannot satisfy a second launch.
  for (const fight of ['Crucible Act I', 'Helios raid']) {
    const tactical = createTacticalAISystem({ config: { enemyMind: { enabled: false } } });
    const sim = createSimulation({ seed: 4242, systems: [aiPorts, tactical] });
    sim.state.mode = 'flight';
    const player = sim.spawn(ship(undefined, 0, 300)); sim.state.playerId = player.id;
    const enemy = sim.spawn(makeEnemySpawnSpec(
      fight === 'Helios raid' ? 'forge_regent' : 'mirrorjaw_foreman', 4, { x: 0, z: 0 }, { startedTick: 0 }));
    enemy.data.ai.forcePlayerTarget = true;
    if (fight === 'Crucible Act I') {
      sim.state.world.currentSectorId = 'sector_ceres_belt';
      sim.state.run = { kind: 'survival', phase: 'combat' };
      enemy.data.runCohort = 'survival';
    } else {
      sim.state.world.currentSectorId = 'sector_helios_gate';
    }
    const bodies = [];
    for (let i = 0; i < 3; i++) {
      bodies.push(sim.spawn({ ...fixture().body, id: undefined,
        pos: { x: 70 + i * 35, z: i * 24 }, vel: { x: 0, z: 0 },
        physicsBody: { dynamic: true, mass: 60 }, data: {} }));
    }
    const events = []; sim.bus.on('ai:telegraph', e => events.push(structuredClone(e)));
    const launches = [];
    for (let i = 0; i < 1800; i++) {
      sim.step();
      for (const body of bodies) {
        const impulses = consumePhysicsCommand(body)?.impulses || [];
        if (impulses.length) {
          for (const impulse of impulses) { body.vel.x += impulse.x / body.mass; body.vel.z += impulse.z / body.mass; }
          const cue = events.filter(e => e.phase === 'body_launch' && e.tick <= sim.state.tick).at(-1);
          launches.push({ tick: sim.state.tick, bodyId: body.id, count: impulses.length, cue,
            provenance: readRecentImpulseProvenance(body, sim.state.tick) });
        }
        body.pos.x += body.vel.x * DT; body.pos.z += body.vel.z * DT;
      }
    }
    assert(launches.length >= 2, JSON.stringify({ fight, launches: launches.map(l => l.tick),
      cues: events.filter(e => e.phase === 'body_launch').map(e => e.tick) }));
    assert.equal(new Set(launches.map(l => l.bodyId)).size, launches.length,
      `${fight}: distinct ammunition per launch`);
    for (const launch of launches) {
      assert.equal(launch.count, 1);
      assert(launch.cue, `${fight}: every launch follows its windup telegraph`);
      assert(launch.tick - launch.cue.tick >= 54, `${fight}: >=54-tick telegraph before the throw`);
      assert.equal(launch.provenance.actorId, enemy.id, `${fight}: enemy provenance`);
    }
    assert.equal(consumePhysicsCommand(player), null, 'no direct shove of player hull');
    sim.dispose();
  }
});

test('fire-tick authority, actual live phase and target identity all fail closed', () => {
  for (const deny of [h => { h.enemy.data.ai.roe = 'hold_fire'; },
    h => { h.enemy.data.ai.motive = ''; }, h => { h.doctrine.byEntity.get(h.enemy.id).phase = 'engine_flare'; },
    h => { h.doctrine.byEntity.get(h.enemy.id).targetId = 'someone_else'; },
    h => { h.doctrine.byEntity.clear(); }, h => { h.enemy.data.ai.noFireResponseWindowS = 100; },
    h => { h.enemy.data.ai.hostileTeams = []; h.enemy.data.ai.forcePlayerTarget = false; h.enemy.team = 0; }]) {
    const h = fixture(); assert.equal(tickLaunch(h, 100).length, 0);
    deny(h);
    for (let tick = 101; tick <= 154; tick++) assert.equal(tickLaunch(h, tick).length, 0);
    assert.equal(readRecentImpulseProvenance(h.body, 154), null);
  }
});

test('sidestep tape after incoming cue avoids an otherwise contacting launched body', () => {
  function tape(sidestep) {
    const h = fixture(); tickLaunch(h, 100);
    const [impulse] = tickLaunch(h, 154);
    h.body.vel.x += impulse.x / h.body.mass; h.body.vel.z += impulse.z / h.body.mass;
    let cueTick = null, hits = 0;
    for (let tick = 155; tick < 300; tick++) {
      h.state.tick = tick; emitIncomingMassCue(h.state, h.bus);
      if (h.events.some(e => e.phase === 'incoming_mass') && cueTick == null) cueTick = tick;
      if (sidestep && cueTick != null) h.player.vel.z = 90;
      h.body.pos.x += h.body.vel.x * DT; h.body.pos.z += h.body.vel.z * DT;
      h.player.pos.x += h.player.vel.x * DT; h.player.pos.z += h.player.vel.z * DT;
      if (Math.hypot(h.body.pos.x - h.player.pos.x, h.body.pos.z - h.player.pos.z) < 18) hits++;
    }
    return { hits, cueTick, events: h.events };
  }
  assert(tape(false).hits > 0);
  assert.equal(tape(true).hits, 0);
  assert.notEqual(tape(true).cueTick, null);
  assert.deepEqual(tape(true), tape(true));
});

test('catch and return passes player provenance through a lethal collision and real damage owner', () => {
  const previousFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  const h = fixture(); tickLaunch(h, 100); tickLaunch(h, 154);
  assert.equal(readRecentImpulseProvenance(h.body, 154).actorId, h.enemy.id);
  recordImpulseProvenance(h.body, { actorId: h.player.id, weaponId: 'wpn_concussion_cannon_m',
    tag: 'concussion', appliedTick: 155, magnitude: 2000 });
  assert.equal(contactImpulseProvenance(h.body, h.enemy, 156).actorId, h.player.id);
  h.state.tick = 156; h.enemy.hull = 1; h.enemy.hullMax = 1;
  const kills = [];
  const registry = { get: name => name === 'combat' ? { kernel } : null };
  const kernel = createCombatKernel({ state: h.state, bus: h.bus, helpers: {}, registry }, {
    onKill: (target, killerId) => { kills.push({ targetId: target.id, killerId }); target.alive = false; } });
  const consequences = Object.create(collisionConsequences);
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  consequences.init({ state: h.state, bus: h.bus, helpers: {}, registry });
  try {
    h.bus.emit('physics:impact', { aId: h.body.id, bId: h.enemy.id, tick: 156,
      impulse: 5000, dp: 5000, consequenceKernelVersion: 1, backend: 'rapier-dynamic',
      pos: { x: 0, z: 0 }, normal: { x: 1, z: 0 } });
    h.bus.flush();
    assert.deepEqual(kills, [{ targetId: h.enemy.id, killerId: h.player.id }]);
  } finally { consequences.destroy(); COMBAT_FLAGS.weaponImpulseConsequences = previousFlag; }
});

function wellFixture(identity = 'corsair') {
  const sim = createSimulation({ seed: 4242, systems: [aiPorts, fields] });
  sim.state.mode = 'flight';
  const player = sim.spawn(ship(undefined, 0, 600)); sim.state.playerId = player.id;
  const observer = sim.spawn(ship(undefined, 1, 0, { passive: true, roe: 'hold_fire',
    combatDoctrineId: identity === 'interceptor' ? 'interceptor_flyby' : 'brawler_commit' }));
  if (identity === 'corsair') observer.data.silhouette = 'corsair_blade';
  if (identity === 'ace') observer.data.aceMemory = { aceId: 'ace_fixture', role: 'boss' };
  const well = { id: 'player-well', kind: 'well', ownerId: player.id, center: { x: 120, z: 0 },
    radius: 45, strength: 900, durationS: 30, createdAt: 0 };
  sim.state.fields.active = [well];
  return { sim, player, observer, well,
    frame: () => sim.helpers.aiSensors.frameFor(observer.id, sim.state.tick) };
}

test('only corsairs/aces see player well obstacles; contacts are neither ships nor hostile targets', () => {
  for (const identity of ['corsair', 'ace', 'interceptor', 'ordinary']) {
    const h = wellFixture(identity);
    const contacts = h.frame().contacts.filter(c => c.tags.includes('field_well'));
    assert.equal(contacts.length, identity === 'ordinary' ? 0 : 1, identity);
    if (contacts.length) {
      assert.equal(contacts[0].kind, 'waypoint'); assert.equal(contacts[0].hostile, false);
      assert.equal(contacts[0].radius, 45); assert.equal(contacts[0].threat, 0);
    }
    h.well.ownerId = -1; assert.equal(h.frame().contacts.filter(c => c.tags.includes('field_well')).length, 0);
    h.well.ownerId = h.player.id; h.well.center.x = 10000;
    assert.equal(h.frame().contacts.filter(c => c.tags.includes('field_well')).length, 0);
  }
});

test('real maneuver planner clears the well on at least three of four seeded approaches', () => {
  const h = wellFixture();
  const tracks = [];
  for (const z of [-8, -3, 3, 8]) {
    h.observer.pos.z = z; h.observer.vel.x = 60;
    const planner = new ManeuverPlanner({ seed: 4242, config: { inputSlewPerTick: 1,
      emergencyInputSlewPerTick: 1, torqueSlewPerTick: 1 } });
    const frame = h.frame();
    const request = planner.plan({ entityId: h.observer.id, tick: 1, perception: frame,
      behavior: { maneuver: { kind: 'intercept', targetId: h.player.id, flightPoint: { x: 600, z: 0 },
        formationSlot: { x: 600, z: 0 }, formationBound: 170, breakFormation: true } } });
    assert(request.trajectory.length > 0);
    const clear = request.trajectory.every(p => Math.hypot(p.x - 120, p.z) >= h.well.radius);
    tracks.push({ z, clear, heading: request.targetHeading });
  }
  assert(tracks.filter(t => t.clear).length >= 3, JSON.stringify(tracks));
});

test('forced entry still gets a well impulse through the real fields owner', () => {
  const previousFlag = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    const h = wellFixture();
    const owner = h.sim.registry.get('fields');
    owner.registerExternal(h.well);
    h.observer.pos.x = 130;
    owner.update(DT, h.sim.state);
    const command = consumePhysicsCommand(h.observer);
    assert(command?.impulses.some(v => v.x < 0), 'corsair still pulled toward well center');
  } finally { FIELD_FLAGS.enabled = previousFlag; }
});

test('same seed/tape produces identical selection, warnings, impulses and kill-credit records', () => {
  function run() {
    const h = fixture(); const output = [];
    for (let tick = 100; tick <= 900; tick++) {
      const impulses = tickLaunch(h, tick);
      if (impulses.length) {
        const launchedBy = readRecentImpulseProvenance(h.body, tick);
        recordImpulseProvenance(h.body, { actorId: h.player.id, weaponId: 'wpn_concussion_cannon_m',
          tag: 'concussion', appliedTick: tick + 1, magnitude: 2000 });
        output.push({ tick, impulses, launchedBy,
          returnedBy: contactImpulseProvenance(h.body, h.enemy, tick + 2) });
      }
    }
    return { events: h.events, output };
  }
  assert.deepEqual(run(), run());
});
