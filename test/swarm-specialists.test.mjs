import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { applySpecialistCounterplay, wardScreenTarget } from '../src/ai/specialistCounterplay.js';
import { applyMineLayerVerb } from '../src/ai/mineLayerVerb.js';
import { CombatDoctrineRuntime, CombatDoctrineId } from '../src/ai/combatDoctrine.js';
import { ObjectiveKind } from '../src/ai/contracts.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { mines, listMines, countOwnerMines, MINE_THROW_GRACE_S } from '../src/systems/mines.js';
import { fields } from '../src/systems/fields.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';

function ship(x, data = {}, team = 1) {
  return { type: 'ship', team, alive: true, pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 12, collisionRadius: 12, mass: 40, hull: 1000, hullMax: 1000, shield: 0,
    shieldMax: 0, armorHp: 0, armorMax: 0, cap: 100, capMax: 100,
    physicsBody: { schemaVersion: 1, radius: 12, mass: 40, inertiaY: 80,
      dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship', ...data } };
}
function boot(t, systems = []) {
  const sim = createSimulation({ seed: 4242, systems }); t.after(() => sim.dispose());
  const s = sim.state; s.mode = 'flight'; s.run = { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 9 };
  const player = sim.spawn(ship(0, {}, 0)); s.playerId = player.id; noteSwarmPilotAction(s);
  return { sim, s, player };
}
function specialist(sim, id, x = 100, extra = {}) {
  return sim.spawn(ship(x, { runCohort: 'survival', runWave: 9, lootTableId: id, ...extra }));
}
function stepVerb(h, e, phase, tick, started = tick, fieldOwner = null) {
  h.s.tick = tick; h.s.simTime = tick / 60;
  return applySpecialistCounterplay({ state: h.s, specialist: e, enemyId: e.data.lootTableId,
    doctrinePhase: phase, doctrine: { phaseStartedTick: started }, tick, fields: fieldOwner });
}
function guardFixture(t) {
  const h = boot(t); const ward = specialist(h.sim, 'wasp_swarmer', 200);
  const guard = specialist(h.sim, 'warden_escort', 100);
  stepVerb(h, guard, 'screen_deploy', 0, 0);
  assert.equal(guard.data.swarmSpecialist.phase, 'windup');
  stepVerb(h, guard, 'screen_hold', 30, 30);
  assert.equal(guard.data.swarmSpecialist.targetId, ward.id);
  return { ...h, ward, guard, kernel: getCombatKernel({ state: h.s, bus: h.sim.bus, helpers: h.sim.helpers }) };
}
const packet = (amount) => ({ channels: { kinetic: amount }, penetration: 0,
  shieldBypass: 1, subsystemShare: 0 });

test('Warden routes only the bounded share at its actual body and emits one ward receipt', (t) => {
  const h = guardFixture(t); const events = []; h.sim.bus.on('combat:warded', e => events.push(e));
  const hit = (amount, kind = 'weapon') => h.kernel.routeDamage({ attackerId: h.player.id,
    targetId: h.ward.id, packet: packet(amount), origin: { kind } });
  hit(20);
  assert.equal(h.ward.hull, 988); assert.equal(h.guard.hull, 992);
  assert.equal(h.guard.data.swarmSpecialist.linkEnergy, 84);
  assert.equal(events.length, 1); assert.equal(events[0].escortId, h.guard.id);
  h.guard.pos.z = 100;
  hit(20); assert.equal(h.ward.hull, 968, 'flanking bypasses the body screen');
  assert.equal(h.guard.data.swarmSpecialist.linkEnergy, 84);
  h.guard.pos.z = 0;
  hit(20, 'collision'); assert.equal(h.ward.hull, 948, 'collision bypasses interception');
  h.s.tick = 60; hit(500);
  assert.equal(h.guard.hull, 908, 'remaining 84 points, not the whole hit, reach the guard');
  assert.equal(h.ward.hull, 532); assert.equal(events.length, 2);
  assert.equal(h.guard.data.swarmSpecialist.phase, 'recovery');
  assert.equal(h.guard.data.swarmSpecialist.linkHp, 0);
  stepVerb(h, h.guard, 'screen_hold', 61, 30);
  assert.equal(h.guard.data.swarmSpecialist.phaseStartedAt, 60, 'AI cannot erase routed recovery');
});

test('real direct hits break the guard; rejected zero-damage packets do not', (t) => {
  const h = guardFixture(t);
  h.kernel.routeDamage({ attackerId: h.player.id, targetId: h.guard.id,
    packet: packet(0), origin: { kind: 'weapon' } });
  assert.equal(h.guard.data.swarmSpecialist.phase, 'active');
  h.s.tick = 42;
  h.kernel.routeDamage({ attackerId: h.player.id, targetId: h.guard.id,
    packet: packet(5), origin: { kind: 'weapon' } });
  assert.equal(h.guard.data.swarmSpecialist.phase, 'recovery');
  assert.equal(h.guard.data.swarmSpecialist.targetId, null);
  assert.equal(h.guard.data.swarmSpecialist.linkReadyAt, 132);
});

for (const cause of ['disable', 'dart', 'expiry', 'stretch', 'dead ward']) {
  test(`Warden ${cause} pays recovery and a fresh relink tell`, (t) => {
    const h = guardFixture(t); const v = h.guard.data.swarmSpecialist;
    const tick = cause === 'expiry' ? 210 : 50;
    if (cause === 'disable') h.guard.data.disabled = true;
    if (cause === 'stretch') h.guard.pos.x = 600;
    if (cause === 'dead ward') h.ward.alive = false;
    stepVerb(h, h.guard, cause === 'dart' ? 'shield_dart' : cause === 'expiry' ? 'screen_approach' : 'screen_hold', tick, 30);
    assert.equal(v.phase, 'recovery'); assert.equal(v.linkReadyAt, tick + 90); assert.equal(v.targetId, null);
    h.guard.pos.x = 100; h.ward.alive = true;
    stepVerb(h, h.guard, 'screen_hold', tick + 89, 30);
    assert.equal(v.phase, 'recovery'); assert.equal(v.phaseStartedAt, tick);
    if (cause === 'disable') {
      stepVerb(h, h.guard, 'screen_hold', tick + 90, 30);
      assert.equal(v.phase, 'recovery', 'a disabled source never flashes back to active');
      h.guard.data.disabled = false;
    }
    stepVerb(h, h.guard, 'screen_hold', tick + 90, 30);
    assert.equal(v.phase, 'windup'); assert.equal(v.phaseEndsAt, tick + 120);
    stepVerb(h, h.guard, 'screen_hold', tick + 119, 30); assert.equal(v.phase, 'windup');
    stepVerb(h, h.guard, 'screen_hold', tick + 120, 30);
    assert.equal(v.phase, 'active'); assert.equal(v.targetId, h.ward.id); assert.equal(v.linkEnergy, 92);
  });
}

test('guard selection is same-wave/team, excludes guards, and breaks on stretch at damage time', (t) => {
  const h = guardFixture(t);
  const otherWave = specialist(h.sim, 'reaver_pirate', 102); otherWave.data.runWave = 10;
  const secondGuard = specialist(h.sim, 'warden_escort', 103);
  stepVerb(h, secondGuard, 'screen_hold', 40, 40);
  assert.equal(secondGuard.data.swarmSpecialist.targetId, h.ward.id);
  h.guard.pos.x = 650;
  assert.notEqual(wardScreenTarget(h.s, h.player, h.ward, { kind: 'weapon' }), h.guard);
  assert.equal(h.guard.data.swarmSpecialist.phase, 'recovery');
});

test('Jackal freezes a three-mine lane before release, arms real mines, and cleans only its hazards', (t) => {
  const h = boot(t, [mines]); const owner = h.sim.registry.get('mines');
  const jackal = specialist(h.sim, 'mine_layer_jackal', 1000); jackal.vel.x = 70;
  const drop = (phase, tick) => { h.s.tick = tick; h.s.simTime = tick / 60;
    return applyMineLayerVerb({ state: h.s, entity: jackal, doctrinePhase: phase, tick,
      placeMine: (opts) => owner.placeMine(opts) }); };
  assert.equal(drop('wake_cue', 0), null);
  const points = structuredClone(jackal.data.swarmSpecialist.salvoPoints);
  assert.equal(points.length, 3); assert.ok(points.every(p => Math.sign(p.z) === Math.sign(points[0].z)));
  jackal.pos.x += 300; jackal.vel.x = -200;
  assert.equal(drop('mine_drop', 29), null, 'the tell has to finish');
  const first = drop('mine_drop', 30); assert.ok(first);
  assert.equal(drop('mine_drop', 47), null);
  const second = drop('mine_drop', 48), third = drop('mine_drop', 66);
  const deployed = [first, second, third];
  assert.deepEqual(deployed.map(m => ({ x: m.pos.x, z: m.pos.z })), points);
  for (const mine of deployed) {
    assert.deepEqual({ x: mine.vel.x, z: mine.vel.z }, { x: 0, z: 0 }, 'the warned fence does not inherit cruise drift');
    assert.equal(mine.hull, 24); assert.equal(mine.data.triggerRadius, 52);
    assert.ok(Math.abs(mine.data.armedAt - mine.data.placedAt - 1.5) < 1e-9);
    assert.equal(mine.data.despawnAt - mine.data.placedAt, 12);
  }
  assert.equal(jackal.data.swarmSpecialist.phase, 'recovery');
  assert.equal(drop('mine_drop', 84), null); assert.equal(listMines(h.s).length, 3);
  h.s.simTime = 2; owner.update(1 / 60, h.s); assert.equal(first.data.armed, true);
  second.hull = 0; owner.update(1 / 60, h.s); assert.equal(second.alive, false, 'stock damage disables a mine before trigger');
  const unrelated = owner.placeMine({ ownerId: h.player.id, pos: { x: -1000, z: 0 }, telegraph: false });
  h.sim.bus.emit('run:ended', {});
  assert.equal(first.alive, false); assert.equal(third.alive, false); assert.equal(unrelated.alive, true);
});

test('wave clear releases only tagged Jackal hazards through the canonical mine owner', (t) => {
  const h = boot(t, [mines]); const owner = h.sim.registry.get('mines');
  const jackal = specialist(h.sim, 'mine_layer_jackal', 1000);
  const receipts = []; h.sim.bus.on('mines:released', event => receipts.push(event));
  const hazard = owner.placeMine({ ownerId: jackal.id, pos: { x: 900, z: 0 },
    swarmSpecialistMine: true, telegraph: false });
  const playerMine = owner.placeMine({ ownerId: h.player.id, pos: { x: -1000, z: 0 }, telegraph: false });
  // The same hull's ordinary Adventure ordnance must not be removed by owner-id coincidence.
  const adventureMine = owner.placeMine({ ownerId: jackal.id, pos: { x: 950, z: 0 }, telegraph: false });
  h.sim.bus.emit('run:waveCleared', { wave: 9 });
  assert.equal(hazard.alive, false);
  assert.equal(playerMine.alive, true); assert.equal(adventureMine.alive, true);
  assert.deepEqual(receipts, [{ count: 1, reason: 'wave_cleared' }]);
  h.sim.bus.emit('run:waveCleared', { wave: 9 });
  assert.equal(receipts.length, 1, 'repeated lifecycle delivery is idempotent');
});

test('a player-thrown Jackal mine damages another Swarm hostile through the real router', (t) => {
  const h = boot(t, [mines]); const owner = h.sim.registry.get('mines');
  const jackal = specialist(h.sim, 'mine_layer_jackal', 1000);
  const target = specialist(h.sim, 'wasp_swarmer', 500);
  const nearby = specialist(h.sim, 'wasp_swarmer', 510);
  const kernel = getCombatKernel({ state: h.s, bus: h.sim.bus, helpers: h.sim.helpers });
  const routed = [];
  h.sim.helpers.routeCombatDamage = request => {
    const result = kernel.routeDamage(request);
    routed.push({ request, result });
    return result;
  };
  const mine = owner.placeMine({ ownerId: jackal.id, team: jackal.team,
    pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 }, armDelayS: 0,
    blastDamage: 34, triggerRadius: 52, swarmSpecialistMine: true });
  owner.update(1 / 60, h.s);
  assert.equal(mine.alive, true, 'an unthrown hostile mine ignores its own Swarm cohort');
  assert.equal(routed.length, 0);

  h.sim.bus.emit('massline:throw', { payloadId: mine.id });
  assert.equal(mine.ownerId, jackal.id);
  assert.equal(mine.data.ownerId, jackal.id, 'deployment ownership is retained');
  assert.equal(mine.team, jackal.team);
  assert.equal(countOwnerMines(h.s, jackal.id), 1, 'throwing does not free a deployment slot');
  assert.equal(countOwnerMines(h.s, h.player.id), 0, 'throwing does not consume a player mine slot');

  h.player.pos.x = 500;
  h.s.simTime = MINE_THROW_GRACE_S - 1 / 60;
  owner.update(1 / 60, h.s);
  assert.equal(routed.length, 1);
  assert.equal(routed[0].request.attackerId, h.player.id);
  assert.equal(routed[0].request.targetId, target.id, 'the victim differs from the deploying Jackal');
  assert.equal(routed[0].result.ok, true, 'the real friendly-fire gate admits the player throw');
  assert.equal(routed[0].result.rawTotal, 34);
  assert.ok(routed[0].result.hullDamage > 0);
  assert.equal(target.hull, 1000 - routed[0].result.hullDamage);
  assert.equal(nearby.hull, 1000, 'the blast still damages only its one trigger victim');
  assert.equal(h.player.hull, 1000, 'release grace still excludes the throwing player');
  assert.equal(mine.alive, false);
  assert.equal(countOwnerMines(h.s, jackal.id), 0);
});

test('mine throw attribution preserves unthrown hostility and the half-second release grace', (t) => {
  const h = boot(t, [mines]); const owner = h.sim.registry.get('mines');
  const jackal = specialist(h.sim, 'mine_layer_jackal', 1000);
  const kernel = getCombatKernel({ state: h.s, bus: h.sim.bus, helpers: h.sim.helpers });
  const routed = [];
  h.sim.helpers.routeCombatDamage = request => {
    const result = kernel.routeDamage(request);
    routed.push({ request, result });
    return result;
  };
  const place = () => owner.placeMine({ ownerId: jackal.id, team: jackal.team,
    pos: { x: 5, z: 0 }, vel: { x: 0, z: 0 }, armDelayS: 0,
    blastDamage: 34, triggerRadius: 52, swarmSpecialistMine: true });
  const parked = place();
  owner.update(1 / 60, h.s);
  assert.equal(parked.alive, false);
  assert.equal(routed[0].request.attackerId, jackal.id);
  assert.equal(routed[0].request.targetId, h.player.id);
  assert.equal(routed[0].result.ok, true);
  assert.equal(routed[0].result.rawTotal, 34);
  assert.ok(h.player.hull < 1000, 'an unthrown Jackal mine still hurts the player');
  const hullBeforeThrow = h.player.hull;

  const thrown = place();
  h.sim.bus.emit('massline:throw', { payloadId: thrown.id });
  assert.equal(MINE_THROW_GRACE_S, 0.5);
  h.s.simTime = MINE_THROW_GRACE_S - 1 / 60;
  owner.update(1 / 60, h.s);
  assert.equal(thrown.alive, true);
  assert.equal(routed.length, 1);
  assert.equal(h.player.hull, hullBeforeThrow, 'release grace applies through its last tick');
  h.s.simTime = MINE_THROW_GRACE_S;
  owner.update(1 / 60, h.s);
  assert.equal(thrown.alive, false);
  assert.equal(routed.length, 2);
  assert.equal(routed[1].request.attackerId, h.player.id);
  assert.equal(routed[1].request.targetId, h.player.id);
  assert.equal(routed[1].result.ok, true);
  assert.equal(routed[1].result.rawTotal, 34);
  assert.ok(h.player.hull < hullBeforeThrow, 'a thrown mine can hurt its thrower after the unchanged grace');
});

test('Jackal mines expire through the existing owner and Adventure keeps its 42-tick trail', (t) => {
  const h = boot(t, [mines]); const owner = h.sim.registry.get('mines');
  const e = specialist(h.sim, 'mine_layer_jackal', 1000);
  const drop = (phase, tick) => applyMineLayerVerb({ state: h.s, entity: e, doctrinePhase: phase, tick,
    placeMine: opts => owner.placeMine(opts) });
  drop('wake_cue', 0); const m = drop('mine_drop', 30);
  h.s.simTime = m.data.despawnAt; owner.update(1 / 60, h.s);
  assert.equal(m.alive, false);
  h.s.run.ruleset = 'adventure';
  const a = drop('mine_drop', 42); assert.ok(a); assert.equal(a.data.swarmSpecialistMine, undefined);
  assert.equal(drop('mine_drop', 83), null); assert.ok(drop('mine_drop', 84));
});

function anchorFixture(t) {
  const flag = FIELD_FLAGS.enabled; FIELD_FLAGS.enabled = true; t.after(() => { FIELD_FLAGS.enabled = flag; });
  const h = boot(t, [fields]); h.player.pos.x = 100;
  const anchor = specialist(h.sim, 'field_anchor_controller', 0, {
    fieldAnchor: { defKey: 'anchorSnare', radius: 235, strength: 185, spinupTicks: 45, damping: 3.2 },
  });
  const owner = h.sim.registry.get('fields'); owner._registerAnchoredField(anchor);
  const record = Object.values(h.s.fields.anchored)[0];
  return { ...h, anchor, owner, record };
}

test('Anchor displacement during spool is latched even after return; next approach permits a fresh cycle', (t) => {
  const h = anchorFixture(t); const { anchor: a, owner } = h;
  assert.equal(h.record.armed, false); assert.equal(h.record.spinupTicks, 0);
  stepVerb(h, a, 'field_spool', 100, 100, owner);
  a.pos.x = 36; stepVerb(h, a, 'field_spool', 110, 100, owner);
  assert.equal(a.data.swarmSpecialist.phase, 'recovery'); assert.equal(a.data.swarmSpecialist.interrupted, true);
  a.pos.x = 0; stepVerb(h, a, 'anchor_hold', 130, 130, owner);
  assert.equal(h.record.armed, false); assert.equal(a.data.swarmSpecialist.phaseStartedAt, 110);
  stepVerb(h, a, 'approach', 400, 400, owner);
  stepVerb(h, a, 'field_spool', 401, 401, owner);
  stepVerb(h, a, 'anchor_hold', 431, 431, owner);
  assert.equal(h.record.armed, true); assert.equal(a.data.swarmSpecialist.anchorActive, true);
  a.pos.x = 37; stepVerb(h, a, 'anchor_hold', 450, 431, owner);
  assert.equal(h.record.armed, false); assert.equal(a.data.swarmSpecialist.anchorActive, false);
});

test('real Anchor field queues force only inside its radius and run-end removes a missing source', (t) => {
  const h = anchorFixture(t); const outside = h.sim.spawn(ship(500, {}, 0));
  stepVerb(h, h.anchor, 'field_spool', 100, 100, h.owner);
  h.s.spatialHash.rebuild(h.s.entityList); h.owner.update(1 / 60, h.s);
  assert.equal(consumePhysicsCommand(h.player)?.impulses?.length || 0, 0);
  stepVerb(h, h.anchor, 'anchor_hold', 130, 130, h.owner);
  h.owner.update(1 / 60, h.s);
  assert.ok(consumePhysicsCommand(h.player)?.impulses?.some(p => p.x < 0), 'canonical force pulls the inside body toward the real hull');
  assert.equal(consumePhysicsCommand(outside)?.impulses?.length || 0, 0);
  assert.equal(h.owner._kernel.get(h.record.fieldId).radius, 220);
  h.s.entities.delete(h.anchor.id); h.sim.bus.emit('run:ended', {});
  assert.equal(h.owner._kernel.has(h.record.fieldId), false);
  assert.equal(Object.keys(h.s.fields.anchored).length, 0);
});

test('production sensor enum activates configured Anchor hold inside the ring and bounded recovery', (t) => {
  const h = boot(t, [aiPorts]); h.player.pos.x = 100;
  const anchor = specialist(h.sim, 'field_anchor_controller', 0, {
    ai: { forcePlayerTarget: true, combatDoctrineId: 'field_anchor_controller', roe: 'weapons_free',
      activity: { kind: 'attack_run', reason: 'survival_wave', targetId: h.player.id, startedTick: 0 } },
  });
  h.s.spatialHash.rebuild(h.s.entityList);
  const frame = h.sim.helpers.aiSensors.frameFor(anchor.id, 0);
  assert.equal(frame.self.swarmSpecialistKind, 'anchor');
  assert.ok(frame.contacts.some(c => c.id === h.player.id && c.hostile));
  const runtime = new CombatDoctrineRuntime({ seed: 4242 });
  const directive = { objective: { kind: ObjectiveKind.ENGAGE, targetId: h.player.id }, formation: {} };
  const phases = new Map();
  for (let tick = 0; tick <= 411; tick++) {
    const result = runtime.update({ tick, entityId: anchor.id,
      doctrineId: CombatDoctrineId.FIELD_ANCHOR_CONTROLLER, perception: frame, directive });
    phases.set(tick, result.phase);
  }
  assert.equal(phases.get(29), 'field_spool'); assert.equal(phases.get(30), 'anchor_hold');
  assert.equal(phases.get(209), 'anchor_hold', 'entering the ring must not cancel its active field');
  assert.equal(phases.get(210), 'recover'); assert.equal(phases.get(409), 'recover');
  assert.equal(phases.get(410), 'reform', 'recovery is capped even while player remains close');
  h.s.run.ruleset = 'adventure';
  assert.equal(h.sim.helpers.aiSensors.frameFor(anchor.id, 412).self.swarmSpecialistKind, null);
});
