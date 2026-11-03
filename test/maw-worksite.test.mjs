import test from 'node:test';
import assert from 'node:assert/strict';
import { syncMawWorksite, snapshotMawWorksite, restoreMawWorksite, parkMawWorksite,
  acceptMawImpact, loseMawBody, isMawWorksiteBody, mawWorksiteFocus } from '../src/missions/mawWorksite.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { isBeamTargetEligible } from '../src/systems/miningBeamTargetingRead.js';

const globalPos = p => ({ x: p.x + 4096, z: p.z });
function fixture() {
  const m = { id: 'test-maw', type: 'tow_recovery', status: 'active', storyTag: 'campaign47a:b3:maw',
    destSectorId: 'sector_ceres_belt', destStationId: 'station_ceres', targetEntityIds: [],
    params: { mawWorksiteVersion: 1, mawStunsNeeded: 3 } };
  const state = { mode: 'flight', simTime: 1, tick: 60, playerId: 1, player: {},
    world: { currentSectorId: m.destSectorId }, missions: { active: [m] }, entities: new Map(), entityList: [] };
  let id = 1;
  const owner = { state, helpers: { spawnEntity(spec) {
    const e = { ...spec, id: ++id, alive: true }; state.entities.set(e.id, e); state.entityList.push(e); return e;
  } }, _sayStoryLine() {}, _failMission(mission, index, reason) { mission.status = 'failed'; mission.failure = reason; } };
  syncMawWorksite(owner, m, globalPos);
  const body = slot => state.entities.get(m.params.mawBodies[slot].entityId);
  return { owner, state, m, body };
}
test('one anchored physical Maw and three lawful finite throw pods, not generic loot', () => {
  const f = fixture(); const { m, body } = f;
  assert.equal(f.state.entityList.length, 4);
  assert.deepEqual(body(0).pos, globalPos({ x: 1880, z: 2140 }));
  assert.equal(isMawWorksiteBody(body(0)), true);
  assert.equal(body(0).type, 'asteroid');
  assert.equal(body(0).physicsBody.radius, 27.839999999999996);
  for (let slot = 1; slot < 4; slot++) {
    const e = body(slot);
    assert.equal(e.type, 'payload'); assert.equal(e.ttl, Infinity);
    assert.equal(e.flags.missionPinned, true); assert.equal(e.data.missionPinned, true);
    assert.equal(e.data.tetherPayload, true); assert.equal(e.data.commodityId, undefined);
    assert.equal(e.data.salvagePool, undefined);
  }
  syncMawWorksite(f.owner, m, globalPos);
  assert.equal(f.state.entityList.length, 4);
});
test('real massline observer emits three energetic player payload impacts; duplicates cannot spend twice', () => {
  const f = fixture(); const detector = Object.create(masslineImpacts);
  const receipts = [];
  detector.init({ state: f.state, bus: { emit(name, p) {
    if (name === 'tether:whipImpact') { receipts.push(p); acceptMawImpact(f.owner, f.m, p); }
  } } });
  for (let slot = 1; slot <= 3; slot++) {
    const mass = f.body(slot), maw = f.body(0);
    mass.pos = { x: maw.pos.x - 35, z: maw.pos.z }; mass.vel = { x: 60, z: 0 };
    f.state.player.tether = { active: true, targetId: mass.id };
    detector.update(1 / 60, f.state);
    assert.equal(f.m.params.mawStuns, slot);
    assert.equal(acceptMawImpact(f.owner, f.m, receipts.at(-1)), false);
  }
  assert.equal(receipts.length, 3);
  assert.equal(receipts[0].rating, 'solid');
  assert.equal(receipts[0].playerRelevance, 0.88);
  assert.deepEqual(f.m.targetEntityIds, [f.body(0).id]);
});
test('a parked or glancing pod earns no stun through the real observer', () => {
  const f = fixture(), detector = Object.create(masslineImpacts), mass = f.body(1), maw = f.body(0);
  detector.init({ state: f.state, bus: { emit(name, p) { if (name === 'tether:whipImpact') acceptMawImpact(f.owner, f.m, p); } } });
  mass.pos = { ...maw.pos }; f.state.player.tether = { active: true, targetId: mass.id };
  detector.update(1 / 60, f.state); assert.equal(f.m.params.mawStuns, 0);
  mass.vel.x = 30; detector.update(1 / 60, f.state); assert.equal(f.m.params.mawStuns, 0);
});
test('wrong body, foreign pod, targetless and unrated receipts do not satisfy the scene', () => {
  const f = fixture(); const valid = { victimId: f.body(0).id, targetId: f.body(1).id, rating: 'solid' };
  for (const p of [{ ...valid, targetId: null }, { ...valid, victimId: f.body(2).id }, { ...valid, rating: undefined }])
    assert.equal(acceptMawImpact(f.owner, f.m, p), false);
  f.body(1).data.mawMissionId = 'another-job';
  assert.equal(acceptMawImpact(f.owner, f.m, valid), false);
  assert.equal(f.m.params.mawStuns, 0);
});
test('Continue retains spent slots, actual pose, velocity and damage without duplicate supply', () => {
  const f = fixture();
  acceptMawImpact(f.owner, f.m, { victimId: f.body(0).id, targetId: f.body(1).id, rating: 'solid' });
  f.body(2).pos.x += 90; f.body(2).vel.z = 5; f.body(2).hull = 107;
  snapshotMawWorksite(f.owner, f.m);
  const restored = JSON.parse(JSON.stringify(f.m)); restoreMawWorksite(restored);
  f.state.entities.clear(); f.state.entityList = []; restored.targetEntityIds = []; f.state.missions.active = [restored];
  syncMawWorksite(f.owner, restored, globalPos);
  assert.equal(restored.params.mawStuns, 1); assert.equal(f.state.entityList.length, 3);
  const pod = f.state.entities.get(restored.params.mawBodies[2].entityId);
  assert.equal(pod.pos.x, globalPos({ x: 1710 }).x + 90); assert.equal(pod.vel.z, 5); assert.equal(pod.hull, 107);
  syncMawWorksite(f.owner, restored, globalPos); assert.equal(f.state.entityList.length, 3);
});
test('deferred death cannot respawn; save before the destroyed receipt retains the loss', () => {
  const f = fixture(), dead = f.body(1); dead.alive = false;
  syncMawWorksite(f.owner, f.m, globalPos); assert.equal(f.state.entityList.length, 4);
  snapshotMawWorksite(f.owner, f.m); assert.equal(f.m.params.mawBodies[1].lost, true);
  assert.equal(loseMawBody(f.owner, f.m, { id: dead.id, entity: dead }), true, 'preclassified loss still settles current session');
  const restored = JSON.parse(JSON.stringify(f.m)); restoreMawWorksite(restored);
  f.state.entities.clear(); f.state.entityList = []; f.state.missions.active = [restored];
  syncMawWorksite(f.owner, restored, globalPos);
  assert.equal(restored.status, 'failed'); assert.equal(f.state.entityList.length, 0);
});
test('hard exit is retirement, not destruction, and retains surviving moved material', () => {
  const f = fixture(); f.body(0).pos.x += 60;
  parkMawWorksite(f.owner, f.m); assert.deepEqual(f.m.targetEntityIds, []);
  snapshotMawWorksite(f.owner, f.m);
  syncMawWorksite(f.owner, f.m, globalPos);
  assert.equal(f.state.entityList.filter(e => e.alive).length, 4);
  assert.equal(f.body(0).pos.x, globalPos({ x: 1880 }).x + 60);
  assert.equal(f.m.params.mawBodies.some(row => row.lost), false);
});
test('malformed and zero-hull saves void the detail instead of creating material or success', () => {
  for (const corrupt of [m => m.params.mawBodies = [], m => m.params.mawBodies[2].hull = 0]) {
    const f = fixture(); corrupt(f.m); restoreMawWorksite(f.m);
    const count = f.state.entityList.length; syncMawWorksite(f.owner, f.m, globalPos);
    assert.equal(f.m.status, 'failed'); assert.equal(f.state.entityList.length, count);
  }
});
test('waypoint teaches supply, impact, latch and actual receiving station in order', () => {
  const f = fixture(); let focus = mawWorksiteFocus(f.m, f.state, globalPos);
  assert.match(focus.label, /staging/); assert.equal(focus.stationId, null);
  f.state.player.tether = { active: true, targetId: f.body(1).id };
  focus = mawWorksiteFocus(f.m, f.state, globalPos); assert.match(focus.label, /Furnace Maw/);
  for (let slot = 1; slot <= 3; slot++) acceptMawImpact(f.owner, f.m,
    { victimId: f.body(0).id, targetId: f.body(slot).id, rating: 'solid' });
  f.state.player.tether = null;
  assert.match(mawWorksiteFocus(f.m, f.state, globalPos).reason, /Latch/);
  f.state.player.tether = { active: true, targetId: f.body(0).id };
  focus = mawWorksiteFocus(f.m, f.state, globalPos); assert.equal(focus.stationId, 'station_ceres');
});
test('ordinary tow jobs and generic furnace flags retain their existing owners', () => {
  const f = fixture(); f.m.storyTag = 'campaign47a:b3:berth';
  assert.equal(syncMawWorksite(f.owner, f.m, globalPos), false);
  assert.equal(mawWorksiteFocus(f.m, f.state, globalPos), null);
  assert.equal(isMawWorksiteBody({ type: 'asteroid', data: { furnaceMaw: true } }), false);
});
test('Maw is not beam-mining ore; ordinary asteroids remain eligible', () => {
  const f = fixture();
  assert.equal(isBeamTargetEligible(f.body(0), f.state), false);
  assert.equal(isBeamTargetEligible({ type: 'asteroid', alive: true, data: {} }, f.state), true);
});

test('real visual factory selects the existing Maw geometry and keeps its breathing footprint near the collider', async () => {
  const THREE = await import('three');
  const { createVisualFactory } = await import('../src/render/visualFactory.js');
  const f = fixture(), maw = f.body(0);
  const root = createVisualFactory().build(maw);
  assert.equal(root.name, 'SF_MawWorksite');
  assert.equal(root.children[0].name, 'SF_Fauna_furnace_maw');
  assert.equal(root.children[0].children.length, 9, 'existing vent bowl, throat and seven jaws');
  const projected = { ...maw, physicsBody: undefined, mawPresentationRadius: maw.physicsBody.radius };
  const workerRoot = createVisualFactory().build(projected);
  assert.equal(workerRoot.scale.x, root.scale.x, 'worker presentation uses the native collider radius');
  projected.mawPresentationRadius = 30;
  workerRoot.userData.updateAuthoredMotion(projected, 1, {}, f.state);
  assert.equal(workerRoot.scale.x, 30 / 18, 'updated worker radius reaches the visual without owning physics');
  const initialScale = root.scale.x;
  let min = Infinity, max = 0;
  for (let step = 0; step <= 120; step++) {
    root.userData.updateAuthoredMotion(maw, step / 10, {}, f.state);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const extent = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
    min = Math.min(min, extent); max = Math.max(max, extent);
    assert.equal(root.scale.x, initialScale, 'animation never resets or compounds parent scale');
  }
  assert.ok(min > maw.physicsBody.radius * 0.95, `no large invisible collision halo (${min})`);
  assert.ok(max < maw.physicsBody.radius * 1.05, `quiet breath stays near the physical footprint (${max})`);
  root.userData.updateAuthoredMotion(maw, 3, { reducedMotion: true, reducedFlash: true }, f.state);
  assert.equal(root.userData.faunaMotionRead, 'quiet');
  assert.equal(maw.mass, 120, 'rendering does not write simulation');
});

test('missing saved bodies after earned stuns fail closed instead of minting replacement pods', () => {
  const f = fixture();
  const saved = { ...f.m, params: { ...f.m.params, mawStuns: 1 } };
  delete saved.params.mawBodies;
  restoreMawWorksite(saved);
  assert.equal(saved.params.mawLedgerInvalid, true);
});
