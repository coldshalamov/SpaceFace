import test from 'node:test';
import assert from 'node:assert/strict';
import { missions } from '../src/systems/missions.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { resolveAutopilotTarget } from '../src/systems/flightV3.js';
import { resolveWaypointPresentationPosition } from '../src/ui/navigationWaypoint.js';

const FIX = { x: -15187.322021484375, z: 7062.294677734375 };
const SECTOR = 'sector_ceres_belt';
function harness() {
  const handlers = new Map(), events = [];
  const bus = {
    on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); },
    emit(name, payload) { events.push({ name, payload }); for (const fn of handlers.get(name) || []) fn(payload); },
  };
  const state = {
    mode: 'flight', simTime: 20, meta: { seed: 47 },
    missions: { boards: {}, active: [], completedLog: [], nextId: 1, config: null },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    world: { currentSectorId: SECTOR }, nav: { route: null, autoTravel: false, waypoint: null },
    ui: { trackedMissionId: null }, entities: new Map(), entityList: [],
    entityIndex: { byStationId: new Map() }, playerId: 'player',
    player: { credits: 10000, cargo: { items: {}, capVolume: 10, capMass: 10 }, stats: {} },
  };
  const mission = Object.create(missions); mission.init({ state, bus, helpers: {} });
  const saver = Object.assign(Object.create(save), { state, bus });
  const course = Object.assign(Object.create(world), { state, bus });
  return { state, bus, events, mission, saver, course,
    restore(data = saver._serializeNav()) { saver._restoreNav(data); bus.emit('save:loaded', { slot: 'quick' }); },
    plot(extra = {}) { course._onSetCourse({ pos: FIX, label: 'Remembered survey fix', autopilot: false, ...extra }); },
  };
}
function targetsAgree(state, expected) {
  assert.deepEqual(resolveWaypointPresentationPosition(state, state.nav.waypoint), expected);
  const target = resolveAutopilotTarget(state, state.nav.autopilot);
  assert.deepEqual(target && { x: target.x, z: target.z }, expected);
}
for (const active of [false, true]) test(`Continue preserves a coordinate-only local course with autopilot ${active ? 'active' : 'armed'}`, () => {
  const h = harness(); h.plot({ autopilot: active });
  const before = h.saver._serializeNav(); h.restore(before);
  assert.deepEqual(h.saver._serializeNav(), before);
  targetsAgree(h.state, FIX);
  h.bus.emit('save:loaded');
  assert.deepEqual(h.saver._serializeNav(), before, 'reconciliation is idempotent');
});
for (const pos of [null, { x: NaN, z: 2 }, { x: 1, z: Infinity }]) test(`Continue rejects an invalid local coordinate ${JSON.stringify(pos)}`, () => {
  const h = harness(); h.plot(); const nav = h.saver._serializeNav();
  nav.waypoint.pos = pos; // Independently damaged waypoint must not leave an armed hidden target.
  h.restore(nav);
  assert.equal(h.state.nav.waypoint.kind, 'story');
  assert.equal(h.state.nav.autopilot.active, false);
  assert.equal(h.state.nav.autopilot.target, null);
  assert.equal(resolveAutopilotTarget(h.state, h.state.nav.autopilot), null);
});
test('a restored local fix cannot impersonate a different-sector course', () => {
  const h = harness(); h.plot(); const nav = h.saver._serializeNav();
  nav.waypoint.sectorId = 'sector_helios_prime'; h.restore(nav);
  assert.equal(h.state.nav.waypoint.kind, 'story');
  assert.equal(h.state.nav.autopilot.target, null);
});
test('active missions keep Continue priority and retire a superseded local burn', () => {
  const h = harness(); h.plot({ autopilot: true });
  const m = { id: 'saved-mission', status: 'active', type: 'cargo_delivery', title: 'Deliver provisions',
    params: { cmdtyId: 'cmdty_food', qty: 2 }, destSectorId: SECTOR, destStationId: 'station_ceres',
    objectiveProgress: 0, objectiveTarget: 2, targetEntityIds: [] };
  h.state.missions.active = [m]; h.state.ui.trackedMissionId = m.id; h.restore();
  assert.equal(h.state.nav.waypoint.kind, 'mission');
  assert.equal(h.state.nav.waypoint.missionId, m.id);
  assert.equal(h.state.nav.autopilot.active, false);
  assert.equal(h.state.nav.autopilot.target, null);
});
test('trade guidance and normal story restoration are unchanged', () => {
  const h = harness();
  const trade = { kind: 'trade', label: 'Provisions', sectorId: SECTOR, commodityId: 'cmdty_food', pos: FIX };
  h.state.nav.waypoint = trade; h.restore(); assert.deepEqual(h.state.nav.waypoint, trade);
  h.state.nav.waypoint = null; h.restore(); assert.equal(h.state.nav.waypoint.kind, 'story');
});
for (const id of [47, 'transient-target']) test(`a recycled ${typeof id} entity handle cannot acquire the restored local course`, () => {
  const h = harness();
  const original = { id, type: 'ship', alive: true, pos: FIX, data: { name: 'Original contact' } };
  h.state.entities.set(id, original); h.state.entityList = [original]; h.plot({ targetEntityId: id });
  const nav = h.saver._serializeNav();
  const replacement = { id, type: 'ship', alive: true, pos: { x: 999, z: 888 }, data: { name: 'Unrelated contact' } };
  h.state.entities.set(id, replacement); h.state.entityList = [replacement]; h.restore(nav);
  assert.equal(h.state.nav.waypoint.kind, 'local');
  assert.equal(h.state.nav.waypoint.targetEntityId ?? null, null);
  assert.equal(h.state.nav.waypoint.stable ?? null, null, 'load must not stamp the recycled occupant');
  assert.equal(h.state.nav.autopilot.targetEntityId, null);
  targetsAgree(h.state, FIX);
});
test('durable local targets resolve their restored identity rather than an old recycled slot', () => {
  const h = harness(), record = 'survey-original-record';
  const original = { id: 47, type: 'wreck', alive: true, pos: FIX, data: { worldRecordId: record } };
  h.state.entities.set(47, original); h.state.entityList = [original]; h.plot({ targetEntityId: 47 });
  const nav = h.saver._serializeNav();
  const replacement = { id: 99, type: 'wreck', alive: true, pos: { x: -15000, z: 7000 }, data: { worldRecordId: record } };
  const recycled = { id: 47, type: 'ship', alive: true, pos: { x: 999, z: 888 }, data: {} };
  h.state.entities = new Map([[47, recycled], [99, replacement]]); h.state.entityList = [recycled, replacement];
  h.restore(nav); assert.equal(h.state.nav.waypoint.kind, 'local'); targetsAgree(h.state, replacement.pos);
  h.state.entities.delete(99); h.state.entityList = [recycled]; targetsAgree(h.state, FIX);
});

test('an invalid restored course explains its safe fallback once without replaying the warning', () => {
  const h = harness(); h.plot({ autopilot: true }); const nav = h.saver._serializeNav();
  nav.waypoint.sectorId = 'sector_other'; h.restore(nav);
  const warnings = () => h.events.filter(e => e.name === 'toast' && /Saved local course/.test(e.payload?.text));
  assert.equal(warnings().length, 1);
  assert.match(warnings()[0].payload.text, /plot a new course/);
  assert.equal(h.state.nav.autopilot.active, false);
  assert.equal(resolveAutopilotTarget(h.state, h.state.nav.autopilot), null);
  h.bus.emit('save:loaded'); assert.equal(warnings().length, 1);
});
