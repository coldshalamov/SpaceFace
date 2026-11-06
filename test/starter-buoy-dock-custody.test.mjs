import test from 'node:test';
import assert from 'node:assert/strict';
import { missions } from '../src/systems/missions.js';
import { starterBuoySpec, registerStarterBuoyTow, starterBuoyRouteFocus } from '../src/missions/starterWorkday.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';

function fixture(step = 1) {
  const mission = { id: `starter-buoy-${step}`, status: 'active', source: 'starterJob', type: 'tow_recovery',
    destStationId: 'station_helios', destSectorId: 'sector_helios_prime', targetEntityIds: [2],
    objectiveTarget: 1, objectiveProgress: 0,
    params: { starterJobId: 'starter_pelican', starterStep: step, starterWorkdayVersion: 1, requiredModule: 'mod_winch_hd' } };
  const buoy = { ...starterBuoySpec(mission, () => ({ x: 0, z: 0 })), id: 2, alive: true, occupantGeneration: 20 };
  Object.assign(buoy.data, { physicalRole: 'slag_core', missionId: mission.id, missionTargetSlot: 0,
    identityKey: `mission:${mission.id}:0`, worldRecordId: 'buoy-original', homeSectorId: mission.destSectorId });
  const player = { id: 1, type: 'ship', alive: true, isPlayer: true, occupantGeneration: 10,
    pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12, mass: 30, hull: 100, hullMax: 100, data: {} };
  const state = { tick: 1, simTime: 0, playerId: player.id, world: { currentSectorId: mission.destSectorId },
    entities: new Map([[player.id, player], [buoy.id, buoy]]), missions: { active: [mission] },
    player: { activeShipIndex: 0, ownedShips: [{ defId: 'ship_pelican', fittings: ['mod_winch_hd'] }] } };
  ensureCombatState(state);
  assert.equal(registerStarterBuoyTow(state, buoy, mission), true);
  // Keep receipt delivery paused: the cut test deliberately exercises stale reader mirrors.
  const bus = { on() {}, emit() {} }, helpers = { combatPhysics: { createAttachment: () => 1, cutAttachment: () => true } };
  const service = createAttachmentService({ state, catalog: createCombatCatalog(), bus, helpers });
  const created = service.create({ defId: 'tether_standard', ownerId: player.id, targetId: buoy.id });
  assert.equal(created.ok, true, created.reason);
  const attachment = created.attachment;
  state.player.tether = { active: true, targetId: buoy.id, attachmentId: attachment.id };
  mission.params.latchedTargetId = buoy.id;
  let completions = 0;
  const owner = Object.assign(Object.create(missions), {
    state, bus, _missionBerthPos: () => ({ x: 0, z: 0 }), _bookExtrasSatisfied: () => true,
    _offerSetPieceFollowOn() {},
    _completeMission(row) { completions++; row.status = 'completed'; },
  });
  // Registered owners acquire their objective operations through the canonical init seam.
  owner.init({ state, bus, helpers });
  return { state, mission, buoy, player, attachment, service, owner, completions: () => completions };
}

for (const step of [1, 2, 3]) test(`buoy ${step}: a live admitted winch can settle on docking once`, () => {
  const f = fixture(step);
  const route = starterBuoyRouteFocus(f.mission, f.state);
  assert.equal(route.stationId, 'station_helios');
  assert.match(route.reason, /Dock at Helios/);
  assert.equal(f.owner._tryPhysicalDockComplete(f.mission, 0), true);
  assert.equal(f.completions(), 1);
  assert.equal(f.mission.params.completionMethod, 'tow_in');
  assert.equal(f.owner._tryPhysicalDockComplete(f.mission, 0), false);
  assert.equal(f.completions(), 1);
});

test('cutting the actual attachment prevents dock settlement before stale tether mirrors are refreshed', () => {
  const f = fixture();
  assert.equal(f.service.cut(f.attachment.id, f.player.id, 'player_released').ok, true);
  assert.equal(f.state.player.tether.active, true, 'the stale reader mirror is intentional fixture input');
  assert.equal(f.mission.params.latchedTargetId, f.buoy.id);
  assert.equal(starterBuoyRouteFocus(f.mission, f.state).stationId, null);
  assert.equal(f.owner._tryPhysicalDockComplete(f.mission, 0), false);
  assert.equal(f.completions(), 0);
  assert.equal(f.mission.status, 'active');
});

test('stale, foreign, recycled or missing custody cannot turn the docking event into a delivery', () => {
  for (const mutate of [
    f => { f.state.player.tether.active = false; },
    f => { f.state.player.tether.targetId = null; f.state.player.tether.attachmentId = null; },
    f => { f.attachment.ownerId = 99; },
    f => { f.attachment.ownerGeneration = 9; },
    f => { delete f.attachment.ownerGeneration; },
    f => { f.attachment.targetGeneration = 19; },
    f => { f.attachment.id = 'different-line'; },
    f => { f.state.entities.set(f.buoy.id, structuredClone(f.buoy)); },
    f => { f.buoy.occupantGeneration++; },
    f => { f.state.player.ownedShips[0].defId = 'ship_wasp'; },
    f => { f.state.player.ownedShips[0].fittings = []; },
    f => { f.state.world.currentSectorId = 'sector_ceres_belt'; },
  ]) {
    const f = fixture(); mutate(f);
    assert.equal(f.owner._tryPhysicalDockComplete(f.mission, 0), false);
    assert.equal(f.completions(), 0);
    assert.equal(f.mission.objectiveProgress, 0);
  }
});

test('pre-workday accepted towing jobs retain their existing compatibility path', () => {
  const f = fixture();
  delete f.mission.params.starterWorkdayVersion;
  f.state.player.tether = { active: false, targetId: null, attachmentId: null };
  assert.equal(f.owner._tryPhysicalDockComplete(f.mission, 0), true);
  assert.equal(f.completions(), 1);
});
