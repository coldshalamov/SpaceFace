import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { KILL_MACHINE_BY_ID } from '../src/data/environmentalMachinery.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';
import { fields } from '../src/systems/fields.js';
import { combat } from '../src/systems/combat.js';
import { mining } from '../src/systems/mining.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { cargo } from '../src/systems/cargo.js';
import { world } from '../src/systems/world.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { createDomainDiffer, createReadModel, applyDomainPathUpdate, readModelDomain } from '../scripts/lib/simReadModel.mjs';

const SHAPE = 'the_working_battlefield';
const MACHINE = KILL_MACHINE_BY_ID.excavator_jaws;

async function boot() {
  const host = await bootRealPath({
    seed: 4242,
    systems: [environmentalMachinery, fields, 'physics', 'collisionConsequences', combat,
      terrainAnchors, mining, economy, factions, cargo, missions, encounterDirector],
    hulls: [{ hullId: 'ship_kestrel', isPlayer: true,
      pos: { x: MACHINE.globalPos.x - 160, z: MACHINE.globalPos.z + 180 } }],
    bounds: { center: { ...MACHINE.globalPos }, radius: 3500, hardRadius: 4000 },
  });
  host.state.world.currentSectorId = MACHINE.sectorId;
  host.owner = host.runtime.getSystem('missions');
  host.director = host.runtime.getSystem('encounterDirector');
  host.lines = [];
  host.payments = [];
  host.choices = [];
  host.bus.on('toast', p => host.lines.push(p.text));
  host.bus.on('encounter:voice', p => host.lines.push(p.text));
  host.bus.on('economy:grantCredits', p => host.payments.push(p));
  host.bus.on('encounter:choiceOffered', p => host.choices.push(p));
  host.step(1);
  return host;
}

function offer(host, choice = 'accept') {
  const id = 'scene:working-battlefield';
  const requested = host.director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: id, sectorId: MACHINE.sectorId,
    anchor: { ...MACHINE.globalPos },
  });
  assert.equal(requested.ok, true, JSON.stringify(requested));
  const credits = host.state.player.credits;
  const inventory = JSON.stringify(host.state.player.cargo);
  assert.equal(host.state.missions.active.length, 0, 'a hail is not acceptance');
  host.bus.emit('encounter:choose', { encounterId: id, choiceId: choice });
  assert.equal(host.state.player.credits, credits, 'acceptance has no fee or deposit');
  if (choice === 'decline') {
    assert.equal(JSON.stringify(host.state.player.cargo), inventory, 'declining moves no cargo');
    assert.equal(host.state.missions.active.length, 0);
    return null;
  }
  const mission = host.state.missions.active.find(m => m.params?.workingBattlefield);
  assert.ok(mission, 'accepting starts a real demolition contract');
  return mission;
}

function actor(host, role) {
  return host.state.entityList.find(e => e.alive !== false && e.data?.physicalRole === role);
}

function shoot(host, entity, damage = 10000) {
  host.withFeatures(() => host.bus.emit('projectile:hit', {
    targetId: entity.id, ownerId: host.player.id, damage, damageType: 'kinetic', pos: { ...entity.pos },
  }));
}

function stopMachine(host) {
  const plate = host.state.entityList.find(e => e.data?.killMachineAnvilId === MACHINE.anvil.id);
  assert.ok(plate, 'the terrain owner supplies the real machine plate');
  host.withFeatures(() => host.runtime.getSystem('mining').applyMining(plate.id, 100000, 1 / 60));
  assert.equal(host.state.world.discovery[MACHINE.sectorId].machineShutdowns[MACHINE.id].cause,
    'machine_destroyed');
}

test('the working battlefield is offered by the default Ceres encounter deck', () => {
  assert.ok(ENCOUNTERS[SHAPE], 'the working battlefield must be in the live encounter catalog');
  const planned = planEncounters(4242, MACHINE.sectorId, 0, zonesForSector(MACHINE.sectorId),
    null, { [SHAPE]: ENCOUNTERS[SHAPE] });
  assert.ok(planned.some(row => row.shapeId === SHAPE), 'the ordinary day-zero deck offers the job');
});

test('decline leaves the working yard, wallet and hold alone', async () => {
  const host = await boot();
  try {
    offer(host, 'decline');
    assert.equal(actor(host, 'demolition_tower'), undefined);
    assert.equal(actor(host, 'crusher_workpiece'), undefined);
    assert.equal(host.payments.length, 0);
  } finally { host.dispose(); }
});

test('the working crusher throws its workpiece through the real tower and settles once', async t => {
  const host = await boot();
  try {
    const mission = offer(host);
    const tower = actor(host, 'demolition_tower');
    const workpiece = actor(host, 'crusher_workpiece');
    assert.ok(tower && workpiece, 'the mission owns real target and workpiece bodies');
    assert.equal(host.state.player.cargo.items.cmdty_polymers, 2, 'one bounded job allotment');
    const hits = [];
    host.bus.on('combat:damage', p => { if (p.targetId === tower.id) hits.push(p); });
    host.step(240);
    assert.ok(tower.hull < tower.hullMax, 'the working machine lands the first physical blow');
    // A heavy tower takes more than one crumple. Re-aim the loose workpiece through the
    // same impulse membrane the tether/ordnance owners use; only native contact can finish it.
    for (let swing = 0; swing < 3 && tower.alive; swing++) {
      const dx = tower.pos.x - workpiece.pos.x, dz = tower.pos.z - workpiece.pos.z;
      const distance = Math.hypot(dx, dz);
      queuePhysicsImpulse(workpiece, {
        x: workpiece.mass * (tower.vel.x - workpiece.vel.x + dx / distance * 120),
        z: workpiece.mass * (tower.vel.z - workpiece.vel.z + dz / distance * 120),
      });
      host.step(180, { after() { if (mission.params.workingBattlefield.towerBroken) return false; } });
    }
    assert.equal(tower.alive, false, 'actual machine force and native contacts must break the tower');
    assert.ok(hits.some(p => p.origin?.kind === 'collision'), 'combat applies native collision damage');
    assert.equal(mission.status, 'active', 'destruction alone does not settle the aftermath');
    stopMachine(host);
    host.step(60);
    assert.equal(mission.status, 'completed');
    assert.equal(mission.params.completionMethod, 'wrecking_ball');
    assert.equal(host.payments.filter(p => p.reason === `mission:${mission.id}`).length, 1);
    const credits = host.state.player.credits;
    host.bus.emit('entity:killed', { id: tower.id, killerId: host.player.id });
    host.step(60);
    assert.equal(host.state.player.credits, credits, 'duplicate death and ticks cannot pay twice');
    assert.equal(host.state.missions.receipts.filter(r => r.missionId === mission.id).length, 1);
    assert.equal(host.state.factions.faction_mts.rep, 4, 'the faction owner applies standing once');
    assert.ok(host.lines.every(line => !/excavator_jaws|crusher_workpiece|tower_destroyed/.test(line)));
    const wire = projectBridgeEvent('toast', { text: host.lines.at(-1), kind: 'info', ttl: 4 });
    assert.equal(wire.dropped, false);
    t.diagnostic(`seed=4242 native crusher: tower ${tower.hullMax} -> ${tower.hull}; reward ${mission.reward_cr} cr once`);
  } finally { host.dispose(); }
});

test('shut down first, then use guns: a second ordinary approach completes', async () => {
  const host = await boot();
  try {
    const mission = offer(host);
    stopMachine(host);
    const tower = actor(host, 'demolition_tower');
    shoot(host, tower);
    host.step(60);
    assert.equal(tower.alive, false);
    assert.equal(mission.status, 'completed');
    assert.equal(mission.params.completionMethod, 'cut_down');
    assert.equal(host.payments.filter(p => p.reason === `mission:${mission.id}`).length, 1);
  } finally { host.dispose(); }
});

test('losing the workpiece preserves a conventional recovery and output loss deducts pay', async () => {
  const host = await boot();
  try {
    const mission = offer(host);
    shoot(host, actor(host, 'crusher_workpiece'));
    host.step(60);
    assert.equal(mission.status, 'active', 'a failed throw does not reset the scene');
    assert.equal(actor(host, 'crusher_workpiece'), undefined, 'no infinite replacement stock');
    assert.ok(host.lines.some(line => /workpiece.*(?:lost|gone)|cut.*tower/i.test(line)), 'recovery is explained');
    const output = actor(host, 'crusher_output');
    shoot(host, output);
    stopMachine(host);
    shoot(host, actor(host, 'demolition_tower'));
    host.step(60);
    assert.equal(mission.status, 'completed');
    assert.ok(mission.reward_cr > 0 && mission.reward_cr < 635, 'output damage reduces the current demolition reward');
  } finally { host.dispose(); }
});

test('abort ends the contract without payment and a full hold denies acceptance before cargo moves', async () => {
  const host = await boot();
  try {
    const mission = offer(host);
    host.owner.abandonMission(mission.id);
    assert.notEqual(mission.status, 'active');
    assert.equal(host.payments.length, 0);
    const stock = host.state.player.cargo.items.cmdty_polymers;
    host.step(60);
    const retry = offer(host);
    assert.equal(host.state.player.cargo.items.cmdty_polymers, stock, 'aborting and taking the job again grants no refill');
    host.owner.abandonMission(retry.id);
  } finally { host.dispose(); }
  const full = await boot();
  try {
    full.state.player.cargo.capVolume = 0;
    const id = 'scene:full-hold';
    assert.equal(full.director.requestAuthoredEncounter({ shapeId: SHAPE, encounterId: id,
      sectorId: MACHINE.sectorId, anchor: { ...MACHINE.globalPos } }).ok, true);
    const before = JSON.stringify(full.state.player.cargo);
    full.bus.emit('encounter:choose', { encounterId: id, choiceId: 'accept' });
    assert.equal(full.state.missions.active.length, 0);
    assert.equal(JSON.stringify(full.state.player.cargo), before);
    assert.ok(full.lines.some(line => /cargo.*(?:room|capacity)|(?:room|capacity).*polymer/i.test(line)));
  } finally { full.dispose(); }
});

test('moving the target changes the real marker; a whip receipt cannot substitute for destruction', async () => {
  const host = await boot();
  try {
    const mission = offer(host), tower = actor(host, 'demolition_tower');
    const before = { ...tower.pos };
    queuePhysicsImpulse(tower, { x: tower.mass * 50, z: 0 });
    host.step(30);
    assert.ok(Math.hypot(tower.pos.x - before.x, tower.pos.z - before.z) > 10);
    host.bus.emit('tether:whipImpact', { victimId: tower.id, rating: 'solid', momentum: 0 });
    assert.equal(mission.status, 'active');
    assert.equal(mission.params.workingBattlefield.towerBroken, undefined);
    host.owner.trackMission(mission.id);
    assert.equal(host.state.nav.waypoint.targetEntityId, tower.id);
    assert.deepEqual(host.state.nav.waypoint.pos, { x: tower.pos.x, z: tower.pos.z });
    stopMachine(host);
    shoot(host, tower);
    host.step(60);
    assert.equal(mission.status, 'completed', 'a moved tower remains the same physical objective');
  } finally { host.dispose(); }
});

test('save during a live machine shove restores pose, velocity and finite stock without duplicate actors', async () => {
  const host = await boot();
  let saved, clock, position, velocity;
  try {
    offer(host);
    host.step(160);
    const workpiece = actor(host, 'crusher_workpiece');
    assert.ok(Math.hypot(workpiece.vel.x, workpiece.vel.z) > 1, 'save catches machinery actually driving the workpiece');
    position = { ...workpiece.pos };
    velocity = { ...workpiece.vel };
    clock = host.state.simTime;
    saved = JSON.parse(JSON.stringify(host.owner.serialize()));
    host.state.ui.screenStack = ['pause'];
    host.step(30);
    assert.deepEqual({ ...workpiece.pos }, position, 'pause preserves the physical work');
    host.state.ui.screenStack = [];
    const frameOwner = Object.create(world);
    frameOwner.bus = host.bus;
    frameOwner._tickFrameOrigin(host.state);
    assert.ok(host.state.world.frameOriginSeq > 0, 'the real world owner rebases the native frame');
    assert.deepEqual({ ...workpiece.pos }, position, 'a frame rebase preserves the global body position');
  } finally { host.dispose(); }
  const restored = await boot();
  try {
    restored.state.simTime = clock;
    restored.owner.deserialize(saved);
    restored.owner._ensureMissionTargets(restored.state.missions.active[0]);
    const workpiece = actor(restored, 'crusher_workpiece');
    assert.deepEqual({ ...workpiece.pos }, position);
    assert.deepEqual({ ...workpiece.vel }, velocity);
    assert.equal(restored.state.missions.active.length, 1);
    restored.owner._ensureMissionTargets(restored.state.missions.active[0]);
    assert.equal(restored.state.entityList.filter(e => e.alive && e.data?.physicalRole === 'crusher_workpiece').length, 1);
    const mission = restored.state.missions.active[0];
    stopMachine(restored);
    shoot(restored, actor(restored, 'demolition_tower'));
    restored.step(60);
    assert.equal(mission.status, 'completed');
    assert.equal(restored.payments.filter(p => p.reason === `mission:${mission.id}`).length, 1);
  } finally { restored.dispose(); }
});

test('the actual choice, mission and cargo producers survive the existing worker projections', async () => {
  const host = await boot();
  try {
    const mission = offer(host);
    const choice = projectBridgeEvent('encounter:choiceOffered', host.choices[0]);
    assert.equal(choice.dropped, false);
    assert.equal(choice.flat.options[0].label, 'Take the demolition job');
    const model = createReadModel(), differ = createDomainDiffer();
    const projected = differ.diff(host.state, host.state.tick);
    for (const update of projected.updates) applyDomainPathUpdate(model.domains, update);
    assert.equal(readModelDomain(model, 'missions').active.find(m => m.id === mission.id).title, mission.title);
    assert.equal(readModelDomain(model, 'player').cargo.items.cmdty_polymers, 2);
  } finally { host.dispose(); }
});
