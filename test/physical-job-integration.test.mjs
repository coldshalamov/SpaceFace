import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { buildEntitySpawnSpec } from '../src/testing/lab/entityProfiles.js';
import { actions } from '../src/systems/actions.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay, isAttachable } from '../src/systems/tetherGameplay.js';
import { world } from '../src/systems/world.js';
import { economy } from '../src/systems/economy.js';
import { heat } from '../src/systems/heat.js';
import { missions } from '../src/systems/missions.js';
import { createMercyServiceSystem } from '../src/response/mercyService/index.js';
import { createWreckCourtSystem, buildAdventureOffer } from '../src/systems/wreckCourt.js';
import { isEnvironmentalBody } from '../src/core/physicalResponse.js';
import { queryPhysicalBodies, deliverPhysicalImpulseDetailed } from '../src/combat/physicalEffects.js';

async function boot(pos = { x: 400, z: 200 }) {
  const rt = createAuthoritativeRuntime({ profileId: 'production', seed: 63103,
    systems: [actions, flightV3, physics, combat, tetherGameplay, world, economy, heat, missions,
      createMercyServiceSystem(), createWreckCourtSystem()] });
  rt.state.mode = 'flight'; rt.state.world.currentSectorId = 'sector_ceres_belt';
  const { spec } = buildEntitySpawnSpec({ alias: 'player', profile: 'ship.starter', role: 'player', isPlayer: true,
    team: 0, pos, vel: { x: 0, z: 0 }, heading: 0 }, rt.state);
  rt.state.playerId = rt.spawn(spec).id;
  assert.equal(await rt.getSystem('physics').prepareBackend(rt.state, {}), true);
  return rt;
}

function postCourt(rt) {
  const base = buildAdventureOffer(7, { caseId: 'wc_faked_collision' });
  const offer = { ...base, stationId: 'station_beltout', destStationId: 'station_beltout', destSectorId: 'sector_ceres_belt', minRep: -1000,
    params: { ...base.params, wreckCourtOrigin: { x: 0, z: 0 } } };
  rt.bus.emit('mission:offered', offer);
  assert.equal(rt.getSystem('missions').acceptMission(offer.id), true);
  const m = rt.state.missions.active.find((m) => m.sourceOfferId === offer.id);
  assert.equal(m.source, 'wreckCourt');
  return { host: rt.getSystem('wreckCourt'), mission: m };
}

test('scanner discovery adopts a native Mercy mission and rejects forged completion/failure receipts', async () => {
  const rt = await boot({ x: -50, z: 0 });
  try {
    const host = rt.getSystem('mercyService');
    rt.bus.emit('scan:pulse', { source: 'player-scanner' });
    assert.ok(Object.values(rt.state.missions.boards).some((b) => b.slots.some((o) => o.id === host.offer.id && o.source === 'mercyService')));
    rt.bus.emit('signal:investigate', { signalId: host.offer.signalId });
    const m = rt.state.missions.active.find((m) => m.params?.mercyIncidentId);
    assert.equal(m.source, 'mercyService');
    assert.deepEqual(m.targetEntityIds || [], []);
    assert.equal(m.params.settlesExternally, true);
    assert.equal(m.reward_cr, 0);
    assert.equal(m.factionId, null);
    rt.bus.emit('scan:completed', { targetId: null });
    const receipt = { missionId: m.id, source: 'mercyService', receiptId: host.rt.focus.uid, kind: 'rescue-delivered' };
    for (const p of [receipt, { ...receipt, receiptId: 'forged' }, { ...receipt, source: 'wreckCourt' }, { ...receipt, missionId: 'wrong' }]) rt.bus.emit('mission:venueProof', p);
    rt.bus.emit('mission:venueFailure', { ...receipt, kind: 'rescue-lost' });
    assert.equal(m.status, 'active');
    rt.bus.emit('sector:exit', {});
    assert.equal(rt.state.missions.active.some((row) => row.id === m.id), false);
    assert.ok(host.serialize().failures[receipt.receiptId]);
  } finally { rt.dispose(); }
});

test('real Court filing completes its mission, applies deduped law/world consequences, and saves custody', async () => {
  const rt = await boot();
  try {
    const { host, mission } = postCourt(rt);
    assert.deepEqual(mission.targetEntityIds || [], []);
    assert.equal(host.session.missionId, mission.id);
    rt.bus.emit('scan:completed', { targetId: null });
    rt.bus.emit('mission:venueProof', { missionId: mission.id, source: 'wreckCourt', receiptId: 'forged', kind: 'court-ruled' });
    rt.bus.emit('mission:venueFailure', { missionId: mission.id, source: 'wreckCourt', receiptId: host.session.uid, kind: 'rescue-left' });
    assert.equal(mission.status, 'active');
    const balance = rt.state.player.credits;
    const repIntents = []; rt.bus.on('faction:repDelta', (p) => { if (p.delta) repIntents.push(p); });
    const factEvents = []; rt.bus.on('world:courtRulingRecorded', (p) => factEvents.push(p));
    const beforeHeat = rt.state.player.heat;
    for (const b of host.session.bodies) assert.equal(host.action({ verb: 'scan', targetId: b.id, mode: 'visual' }).ok, true);
    const filing = host.action({ verb: 'file', hypothesisId: 'mutual_impact' });
    assert.equal(filing.ruling.status, 'accepted');
    assert.equal(rt.state.missions.active.some((m) => m.id === mission.id), false);
    assert.equal(rt.state.player.credits, balance, 'a non-player beneficiary must not mint pilot credits');
    assert.deepEqual(repIntents, [], 'generic mission settlement must not duplicate venue consequences');
    assert.ok(Math.abs(rt.state.player.heat - beforeHeat - 0.02) < 1e-9);
    const s = host.session, fact = s.ruling.intents.worldFacts[0];
    const worldFact = { ...fact, source: 'wreckCourt', caseId: s.caseId, receiptId: s.receipt };
    const lawFact = { ...s.ruling.intents.heat, source: 'wreckCourt', caseId: s.caseId, receiptId: s.receipt };
    assert.equal(rt.state.world.wreckCourtRulings[fact.id].value, fact.value);
    const h = rt.state.player.heat;
    rt.bus.emit('wreckCourt:lawFact', lawFact);
    rt.bus.emit('wreckCourt:lawFact', { ...lawFact, delta: 4, receiptId: 'forged' });
    rt.bus.emit('wreckCourt:worldFact', { ...worldFact, value: 'forged' });
    rt.bus.emit('wreckCourt:worldFact', worldFact);
    assert.equal(rt.state.player.heat, h);
    assert.equal(rt.state.world.wreckCourtRulings[fact.id].value, fact.value);
    assert.equal(factEvents.length, 1, 'replayed world receipts must not re-announce a ruling');
    const worldSave = JSON.parse(JSON.stringify(rt.getSystem('world').serialize()));
    assert.deepEqual(worldSave.wreckCourtRulings, JSON.parse(JSON.stringify(rt.state.world.wreckCourtRulings)));
    const courtSave = JSON.parse(JSON.stringify(host.serialize()));
    const stamp = host.session.bodies.find((b) => b.stamp);
    assert.ok(stamp);
    assert.equal(host.deserialize(courtSave), true);
    assert.equal(host.session.bodies.find((b) => b.id === stamp.id).stamp, stamp.stamp);
    assert.equal(rt.state.entities.get(stamp.entityId).data.wreckCourt.stamp, stamp.stamp);
    assert.equal(rt.state.player.heat, h, 'restoration must not replay settlement');
    assert.equal(host.verifyRulingFact({ ...worldFact, delta: 4 }).ok, false, 'a valid world receipt does not authorize a different law effect');
  } finally { rt.dispose(); }
});

test('an actual combat loss fails the active rescue through its guarded mission receipt', async () => {
  const rt = await boot({ x: -50, z: 0 });
  try {
    const host = rt.getSystem('mercyService');
    rt.bus.emit('scan:pulse', { source: 'player-scanner' });
    rt.bus.emit('signal:investigate', { signalId: host.offer.signalId });
    const m = rt.state.missions.active.find((m) => m.params?.mercyIncidentId);
    assert.ok(m);
    const player = rt.state.entities.get(rt.state.playerId);
    const result = rt.getSystem('combat').onHit({ targetId: player.id, ownerId: null, damage: 1000000, damageType: 'kinetic', pos: player.pos });
    assert.equal(result.ok, true); assert.equal(player.alive, false);
    rt.step(1 / 60);
    assert.equal(rt.state.missions.active.some((row) => row.id === m.id), false);
    assert.ok(Object.values(host.serialize().failures).some((p) => p.missionId === m.id && p.kind === 'rescue-lost'));
  } finally { rt.dispose(); }
});

test('tagged authored props use normal Massline eligibility, damage and environmental response', async () => {
  const rt = await boot({ x: -50, z: 0 });
  try {
    const host = rt.getSystem('mercyService'); host.startIncident({ incidentId: 'ms_pod_traffic', origin: { x: 0, z: 0 } });
    rt.step(1 / 60);
    const body = host.rt.focus.bodyList.find((b) => b.localId === 'capsule'), e = rt.state.entities.get(body.entityId);
    assert.equal(isAttachable(e, rt.state.playerId, rt.state), true);
    assert.equal(isEnvironmentalBody(e), true);
    assert.ok(queryPhysicalBodies(rt.state, e.pos, 10, host.ctx.helpers).includes(e), 'real area effects must discover the body');
    const beforeVelocity = e.vel.x;
    const force = deliverPhysicalImpulseDetailed(rt.state, e, { x: 16, z: 0 }, { tag: 'integration-physical-pulse' }, { port: host.ctx.helpers.combatPhysics });
    assert.equal(force.accepted, true, 'the actual physics port must accept the force');
    rt.step(1 / 60);
    assert.ok(e.vel.x > beforeVelocity, 'the force must move the native prop');
    const hull = e.hull;
    const hit = rt.getSystem('combat').onHit({ targetId: e.id, ownerId: rt.state.playerId, damage: 2, damageType: 'kinetic', pos: e.pos });
    assert.equal(hit.ok, true, JSON.stringify(hit));
    assert.ok(e.hull < hull);
    const decoration = rt.spawn({ type: 'fx', ttl: Infinity, pos: { x: 600, z: 600 }, radius: 3, mass: 4, hull: 40, hullMax: 40, physicsBody: { dynamic: true, radius: 3, mass: 4 } });
    assert.equal(isEnvironmentalBody(decoration), false);
    const denied = rt.getSystem('combat').onHit({ targetId: decoration.id, ownerId: rt.state.playerId, damage: 2, damageType: 'kinetic', pos: decoration.pos });
    assert.equal(denied.ok, false);
    assert.equal(decoration.hull, 40);
  } finally { rt.dispose(); }
});

test('temporary physics challenge sessions cannot arm Adventure rescue or court jobs', async () => {
  const rt = await boot();
  try {
    const mercy = rt.getSystem('mercyService'), court = rt.getSystem('wreckCourt');
    rt.state.physicsVenueSession = true;
    rt.bus.emit('scan:pulse', { source: 'player-scanner' });
    assert.equal(mercy.offer, undefined);
    assert.equal(mercy.startIncident().ok, false);
    assert.equal(court.open().ok, false);
    rt.state.physicsVenueSession = false; rt.state.physicsVenue = { active: true };
    assert.equal(mercy.startIncident().ok, false);
    assert.equal(court.open().ok, false);
  } finally { rt.dispose(); }
});
