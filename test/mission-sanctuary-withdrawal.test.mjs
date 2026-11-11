import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { protectedStationAt, isHostileForAI, authorizeAIEngagement } from '../src/ai/engagementAuthority.js';
import { RECORD_KIND, stableRecordId } from '../src/world/worldRecords.js';

// Synthetic owner fixtures, not evidence of earned mission progress. The production Continue
// replay is separately run against the unmodified earned patrol save.
function fixture() {
  const sim = createSimulation({ seed: 8008, systems: [lawSecurity] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 8000, z: 0 }, hull: 140, hullMax: 140 });
  state.playerId = player.id;
  const station = sim.spawn({ type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: 1280, z: -420 }, radius: 42, data: { stationId: 'station_helios', dockRadius: 72 } });
  const mission = { id: 'm_10', type: 'patrol_clear', status: 'active', objectiveTarget: 3,
    objectiveProgress: 1, completedTargetSlots: [1], destSectorId: 'sector_helios_prime',
    acceptedAt_s: 4032, deadline_s: 4733, targetEntityIds: [] };
  state.missions.active = [mission];
  const key = 'mission:m_10:2';
  const raider = sim.spawn({ type: 'ship', team: 1, factionId: 'faction_reach',
    pos: { x: 9000, z: 0 }, vel: { x: 245, z: 0 }, hull: 202, hullMax: 202,
    data: { missionId: 'm_10', missionTag: 'm_10', missionTargetSlot: 2,
      identityKey: key, worldRecordId: stableRecordId(state.meta.seed, mission.destSectorId, RECORD_KIND.MISSION_TARGET, key),
      homeSectorId: mission.destSectorId, sectorId: mission.destSectorId,
      lootTableId: 'corsair_raider', missionPinned: true,
      ai: { archetype: 'pirate', lawful: false, spawnContext: 'mission', motive: 'accepted_combat_contract',
        engagementTrigger: 'jurisdiction_withdrawal', zoneId: 'sector_hostile_zone',
        noFireResponseWindowS: 1, approachTelegraph: 'weapon_charge',
        hostileTeams: [0], passive: true, sanctuaryWithdrawn: true, motiveSatisfied: true,
        pirateDisengaged: true, roe: 'hold_fire', activity: { kind: 'disengage',
          reason: 'station_jurisdiction:station_helios:withdraw', anchor: { x: 1280, z: -420 }, leashRadius: 1600 } },
      intent: { moveX: 1, moveZ: 0, boost: true, brake: false, fire: false }, combat: {} } });
  const law = sim.registry.get('lawSecurity');
  const enforce = () => { state.tick += 40; law._enforceSanctuaryWithdrawals(state); };
  return { sim, state, player, station, mission, raider, law, enforce };
}

test('legacy mission withdrawal resumes authored hostile activity outside sanctuary without outcome/pose writes', () => {
  const t = fixture(), e = t.raider;
  assert.equal(protectedStationAt(t.state, e), null);
  const before = JSON.stringify({ pos: e.pos, vel: e.vel, hull: e.hull, mission: t.mission, credits: t.state.player.credits });
  t.enforce();
  assert.equal(e.data.intent.boost, false);
  assert.equal(e.data.ai.passive, false);
  assert.equal(e.data.ai.activity.kind, 'attack_run');
  assert.equal(e.data.ai.activity.targetId, t.player.id);
  assert.equal(e.data.ai.activity.reason, 'archetype:corsair_raider');
  assert.equal(e.data.ai.activity.leashRadius, 2800);
  assert.equal(isHostileForAI(t.state, e, t.player), true);
  assert.equal(JSON.stringify({ pos: e.pos, vel: e.vel, hull: e.hull, mission: t.mission, credits: t.state.player.credits }), before);
  const activity = e.data.ai.activity;
  t.enforce();
  assert.equal(e.data.ai.activity, activity, 'repeat update does not restart attack');
});

test('protected player holds quarry safely outside; leaving protection resumes; reentry withdraws again', () => {
  const t = fixture(), e = t.raider;
  t.player.pos = { ...t.station.pos };
  t.enforce();
  assert.equal(e.data.ai.passive, true);
  assert.equal(e.data.ai.roe, 'hold_fire');
  assert.equal(e.data.intent.boost, false);
  assert.equal(e.data.intent.brake, true);
  assert.equal(e.data.intent.fire, false);
  assert.equal(authorizeAIEngagement({ state: t.state, self: e, target: t.player, tick: t.state.tick }).ok, false);
  t.player.pos = { x: 8000, z: 0 };
  t.enforce();
  assert.equal(e.data.ai.passive, false);
  t.player.pos = { ...t.station.pos };
  t.enforce();
  assert.equal(e.data.ai.sanctuaryWithdrawn, true);
  assert.equal(e.data.ai.roe, 'hold_fire');
  t.enforce();
  assert.equal(e.data.intent.boost, false);
  assert.equal(e.data.intent.brake, true);
});

test('actor still inside sanctuary cannot resume even with player outside', () => {
  const t = fixture(); t.raider.pos = { ...t.station.pos };
  t.enforce();
  assert.equal(t.raider.data.ai.passive, true);
  assert.equal(t.raider.data.ai.activity.kind, 'disengage');
  assert.equal(t.raider.data.intent.boost, true);
});

test('durable Continue identity can recover without materialized numeric slot', () => {
  const t = fixture(); delete t.raider.data.missionTargetSlot;
  t.enforce(); assert.equal(t.raider.data.ai.passive, false);
});

test('ordinary, rescue, settled, completed, foreign and duplicate identities never regain mission hostility', () => {
  for (const change of [
    t => { delete t.raider.data.missionId; },
    t => { t.mission.type = 'escort'; },
    t => { t.mission.status = 'completed'; },
    t => { t.mission.completedTargetSlots.push(2); },
    t => { t.raider.data.worldRecordId += '_foreign'; },
    t => { t.raider.data.missionTargetSlot = 0; },
    t => { t.raider.data.ai.motive = 'toll'; },
    t => { t.sim.spawn({ type: 'ship', data: { worldRecordId: t.raider.data.worldRecordId } }); },
  ]) {
    const t = fixture(); change(t); t.enforce();
    assert.equal(t.raider.data.ai.passive, true);
    assert.equal(t.raider.data.ai.roe, 'hold_fire');
  }
});

test('stale object cannot recover after its numeric id belongs to another generation', () => {
  const t = fixture();
  const replacement = { ...t.raider, occupantGeneration: (t.raider.occupantGeneration || 0) + 1 };
  t.state.entities.set(t.raider.id, replacement);
  t.enforce();
  assert.equal(t.raider.data.ai.passive, true);
  assert.equal(t.raider.data.intent.boost, true);
});

test('resumption uses saved sanctuary safe perimeter rather than far escape coordinates', () => {
  const t = fixture();
  const center = { ...t.raider.data.ai.activity.anchor };
  const original = { ...t.raider.pos };
  t.enforce();
  const anchor = t.raider.data.ai.activity.anchor;
  assert.ok(Math.abs(Math.hypot(anchor.x-center.x,anchor.z-center.z)-1920)<1e-8);
  assert.ok(Math.hypot(anchor.x-original.x,anchor.z-original.z)>5000);
  assert.equal(protectedStationAt(t.state,{pos:anchor}),null);
  assert.deepEqual({...t.raider.pos},original,'anchor selection never teleports the actor');
});

test('overlapping sanctuary at proposed return point holds safely instead of resuming assault', () => {
  const t = fixture();
  const a=t.raider.data.ai.activity.anchor, dx=t.raider.pos.x-a.x, dz=t.raider.pos.z-a.z, len=Math.hypot(dx,dz);
  t.sim.spawn({ type:'station', factionId:'faction_scn', pos:{x:a.x+dx/len*1920,z:a.z+dz/len*1920},
    data:{stationId:'station_coalition',dockRadius:72} });
  t.enforce();
  assert.equal(t.raider.data.ai.passive,true);
  assert.equal(t.raider.data.ai.roe,'hold_fire');
  assert.equal(t.raider.data.intent.boost,false);
  assert.equal(t.raider.data.intent.brake,true);
});
