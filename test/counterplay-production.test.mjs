import test from 'node:test';
import assert from 'node:assert/strict';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { weapons } from '../src/systems/weapons.js';
import { combat } from '../src/systems/combat.js';
import { counterplayDoctrineById } from '../src/ai/counterplay/catalog.js';
import { createCounterplayMemory } from '../src/ai/counterplay/memory.js';
import { counterplaySensorInput, driveCounterplay, rebindCounterplayCast } from '../src/ai/counterplay/live.js';
import { applyCounterplayPhysical } from '../src/ai/counterplay/adapterPatch.js';
import { COUNTERPLAY_ADVENTURE, placeCounterplayAdventure } from '../src/ai/counterplay/adventure.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { runCounterplayScenario } from '../tools/doctrine-arena/run.mjs';
import { createCombatCatalog, ensureCombatant } from '../src/combat/runtime.js';
import { SECTORS } from '../src/data/sectors.js';

const systems = [flightV3, createTacticalAISystem(), aiPorts, weapons, combat];
function ctx(host) { return { state: host.state, bus: host.bus, helpers: host.runtime.getHelpers(), registry: { get: (name) => host.runtime.getSystem(name) } }; }
function stamp(actor, id, player, objective = {}) {
  const doctrine = counterplayDoctrineById(id);
  actor.data.ai = { passive: false, roe: doctrine.roe, motive: doctrine.motive, zoneId: 'counterplay_test',
    approachTelegraph: doctrine.telegraphKind, engagementTrigger: 'player_attack', noFireResponseWindowS: 1,
    combatDoctrineId: doctrine.legalFireDoctrineId || 'ranged_disengager', counterplayDoctrineId: id,
    counterplayObjective: objective, hostileTeams: doctrine.fires ? [0] : [],
    activity: { kind: doctrine.fires ? 'attack_run' : 'transit', reason: `counterplay:${id}`, startedTick: 0,
      targetId: player.id, anchor: { x: 0, z: 0 }, leashRadius: 900 } };
}

async function host() { return bootRealPath({ seed: 277, systems,
  prepareState({state}) { state.mode = 'flight'; state.run = { kind: 'adventure' }; },
  hulls: [{ hullId: 'ship_kestrel', pos: { x: -200, z: -200 }, isPlayer: true, team: 0 },
    { hullId: 'ship_hawser', pos: { x: 0, z: 90 }, team: 1 }] }); }

test('live tactical owner telegraphs then builds a native anchor rope; cut uses the same custody writer', async () => {
  const h = await host();
  try {
    const actor = h.hulls[1], anchor = h.spawnObstacle({ pos: { x: 0, z: 0 }, radius: 20, mass: 4000,
      data: { counterplayRole: 'anchor', combatProfileId: 'combat_profile_tether_anchor' } });
    stamp(actor, 'cp_heavy_anchor_grappler', h.player, { anchor: { x: 0, z: 0 }, anchorId: anchor.id, flank: { x: 10, z: -130 } });
    const telegraphs = []; h.bus.on('ai:telegraph', p => telegraphs.push(p));
    h.step(30);
    assert.equal(Object.values(h.state.combat.attachments.byId).some(a => a.ownerId === actor.id), false);
    h.step(50);
    const line = Object.values(h.state.combat.attachments.byId).find(a => a.ownerId === actor.id && a.targetId === anchor.id && a.state === 'active');
    assert.ok(line, JSON.stringify(actor.data.counterplay));
    assert.ok(line.physicsHandle);
    assert.ok(telegraphs.some(p => p.entityId === actor.id && p.kind === 'anchor_spool'));
    assert.equal(actor.data.intent.fire, false);
    const memory = actor.data.ai.counterplayMemory;
    assert.equal(applyCounterplayPhysical({ ctx: ctx(h), entity: actor, decision: { verb: { kind: 'cut', attachmentId: line.id } }, memory }).ok, true);
    assert.equal(line.state, 'broken');
  } finally { h.dispose(); }
});

test('Counterplay consumes sensor poses and delays sightings, with no fire beyond live ROE', async () => {
  const h = await host();
  try {
    const actor = h.hulls[1]; stamp(actor, 'cp_collateral_hold', h.player);
    const row = { id: h.player.id, kind: 'ship', team: 0, pos: { x: 30, z: 50 }, vel: { x: 0, z: 0 }, alive: true };
    const input = counterplaySensorInput(h.state, actor, { contacts: [row] });
    assert.deepEqual(input.contacts[0].pos, row.pos);
    assert.notDeepEqual(input.contacts[0].pos, { x: h.player.pos.x, z: h.player.pos.z });
    const port = { frameFor: () => ({ contacts: [row] }) }, requests = [];
    h.state.tick = 100;
    driveCounterplay({ ctx: ctx(h), entities: [actor], sensorPort: port, maneuverPort: { request: p => { requests.push(p); return true; } } });
    assert.equal(actor.data.counterplay.phase, 'search');
    assert.equal(actor.data.intent.fire, false);
    actor.data.ai.roe = 'hold_fire';
    for (let tick = 101; tick < 150; tick++) { h.state.tick = tick; driveCounterplay({ ctx: ctx(h), entities: [actor], sensorPort: port, maneuverPort: { request: () => true } }); }
    assert.equal(actor.data.intent.fire, false);
    assert.ok(requests.length);
  } finally { h.dispose(); }
});

test('repair and companion orders require sensed allied cast members and preserve foreign AI', async () => {
  const h = await host();
  try {
    const actor = h.hulls[1], patient = h.spawnShip({ hullId: 'ship_wasp', pos: { x: 25, z: 90 }, team: 1 });
    patient.data.counterplayControllerId = actor.id;
    const runtime = ensureCombatant(h.state, patient, createCombatCatalog()); runtime.subsystems.subsystem_drive.health = 8;
    const sensed = [{ id: patient.id, generation: patient.occupantGeneration, role: 'patient' }];
    const result = applyCounterplayPhysical({ ctx: ctx(h), entity: actor, sensed, decision: { verb: { kind: 'repair', targetRole: 'patient', amount: 0.25 } } });
    assert.equal(result.applied, 0.25);
    const requests = [];
    const decision = { doctrineId: 'cp_corridor_pack_leader', companions: [{ role: 'patient', waypoint: { x: 100, z: 100 } }] };
    applyCounterplayPhysical({ ctx: ctx(h), entity: actor, sensed, decision, maneuverPort: { request: p => { requests.push(p); return true; } } });
    assert.equal(requests.length, 1); assert.equal(requests[0].entityId, patient.id);
    delete patient.data.counterplayControllerId;
    applyCounterplayPhysical({ ctx: ctx(h), entity: actor, sensed, decision, maneuverPort: { request: p => { requests.push(p); return true; } } });
    assert.equal(requests.length, 1);
    assert.equal(applyCounterplayPhysical({ ctx: ctx(h), entity: actor, sensed: [], decision: { verb: { kind: 'repair', targetRole: 'patient' } } }).ok, false);
  } finally { h.dispose(); }
});

test('public Adventure situations persist in discovery and rebind recycled cast slots by durable roles', async () => {
  const h = await host();
  try {
    const row = COUNTERPLAY_ADVENTURE.find(r => r.doctrineId === 'cp_rescue_tow');
    assert.ok(COUNTERPLAY_ADVENTURE.every(r => SECTORS.some(s => s.id === r.sectorId)));
    h.state.world.currentSectorId = row.sectorId; h.player.pos.copy(sectorLocalToGlobalForSector(row, row.sectorId));
    placeCounterplayAdventure(ctx(h));
    const actors = h.state.entityList.filter(e => e.data?.counterplayCaseKey === `${row.sectorId}:${row.doctrineId}`);
    assert.equal(actors.length, 2); assert.ok(actors.every(e => e.flags.persistent));
    const leader = actors.find(e => e.data.counterplayRole === 'opponent'), patient = actors.find(e => e.data.counterplayRole === 'patient');
    patient.data.counterplayControllerId = 999;
    leader.data.ai.counterplayObjective.patientId = 999;
    leader.data.ai.counterplayMemory = createCounterplayMemory(row.doctrineId);
    leader.data.ai.counterplayMemory.delay = [{ tick: 1, contacts: [{ id: 999 }] }];
    rebindCounterplayCast(h.state, h.state.entityList);
    assert.equal(patient.data.counterplayControllerId, leader.id);
    assert.equal(leader.data.ai.counterplayObjective.patientId, patient.id);
    assert.deepEqual(leader.data.ai.counterplayMemory.delay, []);
    placeCounterplayAdventure(ctx(h));
    assert.equal(h.state.entityList.filter(e => e.data?.counterplayCaseKey === `${row.sectorId}:${row.doctrineId}`).length, 2);
    assert.ok(h.state.world.discovery[row.sectorId].pois[`counterplay:${row.sectorId}:${row.doctrineId}`]);
  } finally { h.dispose(); }
});

test('live clear-lane fire announces its window, enters SG03 and stops immediately when ROE changes', async () => {
  const h = await host();
  try {
    const actor = h.spawnShip({ hullId: 'ship_wasp', pos: { x: -20, z: -200 }, team: 1, rot: Math.PI, fittings: ['wpn_pulse_laser_s'] });
    stamp(actor, 'cp_collateral_hold', h.player);
    const start = h.player.hull + h.player.shield, cues = [];
    h.bus.on('ai:telegraph', p => { if (p.entityId === actor.id) cues.push(p); });
    h.step(30);
    assert.equal(actor.data.intent.fire, false);
    assert.ok(cues.some(p => p.kind === 'clear_lane'));
    h.step(180);
    assert.ok(h.state.combat.trace.events.some(e => e.kind === 'action.requested' && e.actorId === actor.id && e.actionId === 'action_burst'), JSON.stringify({ cp: actor.data.counterplay, intent: actor.data.intent, pos: actor.pos, rot: actor.rot, trace: h.state.combat.trace.events.slice(-8) }));
    assert.ok(h.player.hull + h.player.shield < start);
    actor.data.ai.roe = 'hold_fire'; h.step(1);
    assert.equal(actor.data.intent.fire, false);
  } finally { h.dispose(); }
});

test('a charted peek produces real projectile damage and arena scoring starts from actual vitals', async () => {
  const receipt = await runCounterplayScenario({ doctrineId: 'cp_cover_peel', seed: 101, ticks: 500, pilotId: 'stationary' });
  assert.equal(receipt.sg02Ready, true);
  assert.ok(receipt.phaseTrace.includes('probe_peel'));
  assert.ok(receipt.telegraphTicks >= 30);
  assert.ok(receipt.fireAuthorized > 0);
  assert.ok(receipt.playerDamage > 16, JSON.stringify(receipt));
  assert.equal(receipt.goalComplete, true);
});
