import test from 'node:test';
import assert from 'node:assert/strict';
import { createKesslerScale, kesslerScaleSpec } from '../src/systems/kesslerScale.js';
import { kesslerPadPosition, kesslerWorksiteSpecs, KESSLER_WORKSITE } from '../src/systems/kesslerScaleWorksite.js';
import { KESSLER_SCALE } from '../src/data/kessler.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { modelTruthRow } from '../src/data/modelTruth.js';
import { makeEntity } from '../src/core/entity.js';
import { insertDressingRow } from '../src/world/dressingTable.js';

function fixture(over = {}) {
  const listeners = new Map(), events = [];
  const bus = {
    on(name, fn) { const set = listeners.get(name) || new Set(); set.add(fn); listeners.set(name, set); return () => set.delete(fn); },
    emit(name, payload) { events.push([name, payload]); for (const fn of listeners.get(name) || []) fn(payload); },
  };
  const state = { world: { currentSectorId: KESSLER_SCALE.sectorId }, story: { flags: {} }, run: { kind: 'adventure' }, entityList: [], entities: new Map(), nextEntityId: 1, ...over };
  const helpers = {
    spawnEntity(spec) { const entity = makeEntity({ ...spec, id: state.nextEntityId++ }); state.entityList.push(entity); state.entities.set(entity.id, entity); return entity; },
    removeEntity(id) { const entity = state.entities.get(id); if (entity) entity.alive = false; },
  };
  const system = createKesslerScale();
  const init = () => system.init({ state, bus, helpers });
  const pod = (spec = {}) => helpers.spawnEntity({ type: 'payload', mass: 40, pos: kesslerPadPosition(), vel: { x: 0, z: 0 }, data: { payloadType: 'jettisoned_cargo', commodityId: 'cmdty_ore_iron', scanLabel: 'Iron freight' }, ...spec });
  const rows = () => (state.world.dressing?.rows || []).filter((r) => r.alive && r.data.kesslerWorksite);
  const ticks = () => system.update(0.5, state);
  const reads = () => events.filter(([name]) => name === 'kesslerPod:weighed');
  init();
  return { state, bus, events, helpers, system, init, pod, rows, ticks, reads };
}

test('single canonical global frame: ring, four worksite rows, and real pod read agree', () => {
  const f = fixture();
  const center = sectorLocalToGlobalForSector(KESSLER_SCALE.pad, KESSLER_SCALE.sectorId);
  assert.deepEqual(center, { x: 13008, z: 7212 });
  assert.deepEqual(kesslerPadPosition(), center);
  const spec = kesslerScaleSpec();
  assert.deepEqual(spec.pos, center);
  assert.equal(spec.physicsBody, false, 'a ring must not become a native solid');
  assert.equal(spec.collides, false);
  assert.equal(spec.data.circuitMark, true);
  assert.equal(spec.data.ringRadius, 90);
  assert.equal(spec.data.visualRadius, 90, 'renderer culling includes the open ring');
  assert.equal(f.rows().length, 4);
  const near = f.pod(), stranded = f.pod({ pos: { ...KESSLER_SCALE.pad } });
  const before = JSON.stringify(stranded);
  f.ticks();
  assert.equal(f.reads()[0][1].entityId, near.id);
  assert.equal(f.reads().length, 1);
  assert.equal(JSON.stringify(stranded), before, 'old raw-local freight is neither moved nor read');
  assert.equal(near.mass, 40); assert.equal(near.alive, true);
  assert.equal(near.data.commodityId, 'cmdty_ore_iron');
  assert.deepEqual(near.data.kesslerReceipt, { plateRead: 37.6, trueRead: 40 });
  assert.match(near.data.scanLabel, /Iron freight.*37.6t.*40.0t.*freight retained/);
});

test('measured skins and entire drawn envelopes flank the open ring and station approach', () => {
  const f = fixture(), center = kesslerPadPosition();
  const toward = { x: 330 / Math.hypot(330, 1360), z: 1360 / Math.hypot(330, 1360) };
  for (const row of f.rows()) {
    const truth = modelTruthRow(row.data.placeId);
    assert.equal(truth.proposedSkin.adopted, true);
    assert.equal(row.collides, true);
    assert.equal(row.data.collisionProxy, `skin:${row.data.placeId}`);
    assert.equal(row.physicsBody.dynamic, false);
    const scale = row.radius / truth.gameplay.entityRadius;
    // Bound the FULL model footprint (not just its thinner flight-plane skin).
    const halfX = truth.bounds.size[0] * scale / 2;
    const halfZ = truth.bounds.size[2] * scale / 2;
    const envelope = Math.hypot(halfX, halfZ);
    const dx = row.pos.x - center.x, dz = row.pos.z - center.z;
    const authored = KESSLER_WORKSITE.find((part) => part.key === row.data.kesslerWorksite);
    assert.ok(Math.hypot(dx, dz) < 180, 'furniture stays local to the global pad on BOTH axes');
    assert.ok(Math.abs(dx - (toward.z * authored.across + toward.x * authored.along)) < 1e-9);
    assert.ok(Math.abs(dz - (-toward.x * authored.across + toward.z * authored.along)) < 1e-9);
    assert.ok(Math.hypot(dx, dz) - envelope > 100, `${row.data.placeId}: ring + 10 WU cargo margin`);
    const across = Math.abs(dx * toward.z - dz * toward.x);
    const along = dx * toward.x + dz * toward.z;
    assert.ok(along + envelope < 0 || across - envelope > 90, 'full-width station-side approach stays clear');
    assert.equal(row.data.poi, undefined, 'no added navigational POI');
    assert.equal(row.data.scannerSignalKind, undefined);
  }
  assert.deepEqual(f.rows().map((r) => ({ x: r.pos.x, z: r.pos.z })), kesslerWorksiteSpecs().map((r) => r.pos));
});

test('speed and boundary remain real: fast loads wait once per incursion, then settle once', () => {
  const f = fixture(), pad = kesslerPadPosition();
  const load = f.pod({ vel: { x: 9, z: 0 } });
  f.ticks(); f.ticks();
  const waiting = () => f.events.filter(([, p]) => String(p.id).startsWith('kessler_settle_'));
  assert.equal(waiting().length, 1); assert.equal(f.reads().length, 0);
  load.pos.x = pad.x + 90.01; load.vel.x = 0; f.ticks();
  assert.equal(f.reads().length, 0);
  load.pos.x = pad.x + 90; load.vel.x = 8; f.ticks(); f.ticks();
  assert.equal(f.reads().length, 1); assert.equal(load.data.kesslerRead, true);
  assert.equal(f.state.story.flags.kessler_reads_counted, 1);
});

test('repeated sync/load/return owns four rows only and preserves ordinary dressing and freight', () => {
  const f = fixture();
  const foreign = insertDressingRow(f.state, { pos: { x: 1, z: 2 }, data: { name: 'ordinary yard' } });
  const load = f.pod(); f.ticks();
  const saved = JSON.parse(JSON.stringify(load.data));
  const ids = f.rows().map((r) => r.id);
  for (let i = 0; i < 3; i++) f.bus.emit('save:loaded', {});
  assert.deepEqual(f.rows().map((r) => r.id), ids);
  f.state.world.currentSectorId = 'sector_helios_prime'; f.bus.emit('sector:enter', {});
  assert.equal(f.rows().length, 0); assert.equal(foreign.alive, true); assert.equal(load.alive, true);
  f.state.world.currentSectorId = KESSLER_SCALE.sectorId; f.bus.emit('sector:enter', {});
  assert.equal(f.rows().length, 4); f.ticks();
  assert.equal(f.reads().length, 1); assert.deepEqual(load.data, saved);
  assert.equal(f.events.filter(([, p]) => p.id === 'kessler_scale_announce').length, 1);
  f.init(); f.init(); assert.equal(f.rows().length, 4);
  f.system.destroy(); assert.equal(f.rows().length, 0); assert.equal(foreign.alive, true);
});

test('persisted first variance remains once-only; next actual pod receives its own reading', () => {
  const f = fixture({ story: { flags: { kessler_variance_seen: true, kessler_reads_counted: 3, kessler_scale_announced: true } } });
  f.pod({ mass: 25 }); f.ticks();
  assert.equal(f.reads()[0][1].firstVariance, false);
  assert.equal(f.reads()[0][1].count, 4);
  assert.equal(f.reads()[0][1].plateRead, 23.5);
  assert.equal(f.events.filter(([, p]) => p.persist === true).length, 0);
});

test('legacy physical markers and freight are preserved; only explicitly nonphysical old marker retires', () => {
  const f = fixture(); f.system.destroy();
  const legacy = f.helpers.spawnEntity({ type: 'beacon', pos: { ...KESSLER_SCALE.pad }, collides: false, physicsBody: { dynamic: true }, data: { kesslerScale: true } });
  const safe = f.helpers.spawnEntity({ type: 'beacon', pos: { ...KESSLER_SCALE.pad }, collides: false, physicsBody: false, data: { kesslerScale: true } });
  const before = JSON.stringify(legacy);
  f.init(); f.bus.emit('save:loaded', {});
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(safe.alive, false);
  assert.equal(f.state.entityList.filter((e) => e.alive && e.data?.kesslerWorksiteVersion === 1).length, 1);
  f.system.destroy(); assert.equal(legacy.alive, true);
});

test('other sectors/modes spawn no worksite and deferred enter does not duplicate it', () => {
  for (const kind of ['swarm', 'survival', 'lab']) assert.equal(fixture({ run: { kind } }).rows().length, 0);
  const f = fixture(); f.system.destroy();
  f.state.render = { sectorEnterCookWillRun: () => true };
  f.init(); const ids = f.rows().map((r) => r.id);
  f.bus.emit('sector:enter', { enterEpoch: 2 }); f.bus.emit('sector:enter', { enterEpoch: 2 });
  assert.equal(f.state.render.deferredEnterMaterializers.length, 1);
  f.state.render.deferredEnterMaterializers[0].provider();
  assert.deepEqual(f.rows().map((r) => r.id), ids);
  f.system.destroy(); assert.equal(f.state.render.deferredEnterMaterializers.length, 0);
});

// Positive navigation probes bind production methods, not copied implementations.
import { missions } from '../src/systems/missions.js';
import { initCampaignSidecar } from '../src/story/campaign47a/campaignTransitions.js';
import { kesslerScalePending, kesslerScaleWaypoint } from '../src/systems/kesslerScaleWorksite.js';

function navigationFixture() {
  const state = { simTime: 10, story: { beatIndex: 1, flags: {} }, world: { currentSectorId: 'sector_tethys_junction' }, missions: { active: [] }, ui: {}, nav: {}, entities: new Map() };
  const events = [];
  const owner = Object.assign(Object.create(missions), {
    state, bus: { emit: (name, data) => events.push([name, data]) },
    _releaseCampaignNavForSwarm: () => false, _onboardingOwnsOpeningNav: () => false,
    _nearestStation: () => null,
    _ensureCampaignSidecar: () => initCampaignSidecar(state, state.simTime),
    _refreshEmbodiedStoryBoards: () => {},
  });
  initCampaignSidecar(state, state.simTime);
  return { state, owner, events };
}

test('ordinary alloy-completion signal hands the existing story navigation to actual Scale 4', () => {
  const f = navigationFixture();
  assert.equal(kesslerScaleWaypoint(f.state), null, 'no direction before delivery');
  assert.equal(f.owner._recordCampaignBookSignal('mission:completed', { storyTag: 'campaign47a:b1:alloy_run' }), true);
  assert.equal(kesslerScalePending(f.state), true);
  assert.equal(f.state.nav.waypoint.kind, 'story');
  assert.equal(f.state.nav.waypoint.stationId, null);
  assert.deepEqual(f.state.nav.waypoint.pos, { x: 13008, z: 7212 });
  assert.match(f.state.nav.waypoint.reason, /fresh jettisoned cargo pod.*delivered alloys are not required.*Buy or mine unreserved cargo/);
  assert.match(f.state.nav.waypoint.reason, /8 WU\/s/);
  f.owner._recordCampaignBookSignal('kesslerPod:weighed', { variance: true, entityId: 42 });
  assert.equal(kesslerScalePending(f.state), false);
  assert.notEqual(f.state.nav.waypoint?.label, 'Scale 4 · weigh your own freight');
  assert.equal(f.state.story.beatIndex, 1, 'furnace detail still follows; weighing is not the whole book');
});

test('pending weigh stays optional behind active contracts and explicit pilot courses', () => {
  for (const waypoint of [{ kind: 'local', pos: { x: 9, z: 8 } }, { kind: 'trade', sectorId: 'sector_helios_prime' }, { kind: 'story', onboarding: true }]) {
    const f = navigationFixture(); f.state.nav.waypoint = waypoint;
    f.owner._recordCampaignBookSignal('mission:completed', { storyTag: 'campaign47a:b1:alloy_run' });
    assert.equal(f.state.nav.waypoint, waypoint, 'completion forceStory must not hijack a pilot course');
  }
  const f = navigationFixture();
  f.state.missions.active.push({ id: 'other-contract', status: 'active' });
  let selected = null;
  f.owner._refreshTrackedMissionNav = (mission) => { selected = mission.id; };
  f.owner._recordCampaignBookSignal('mission:completed', { storyTag: 'campaign47a:b1:alloy_run' });
  assert.equal(selected, 'other-contract');
  assert.equal(f.state.nav.waypoint, undefined);
});

test('legacy/completed/unordered book states do not invent pending scale work; saved pending route restores', () => {
  for (const completed of [[], ['scale_4'], ['alloy_run', 'scale_4'], ['alloy_run', 'scale_4', 'infested'], ['alloy_run', 'infested']]) {
    const f = navigationFixture();
    f.state.story.campaign47a.stepProgress['1'] = { completed };
    assert.equal(kesslerScaleWaypoint(f.state), null);
  }
  const f = navigationFixture();
  f.owner._recordCampaignBookSignal('mission:completed', { storyTag: 'campaign47a:b1:alloy_run' });
  const saved = JSON.parse(JSON.stringify(f.state.story));
  f.state.story = saved; f.state.nav.waypoint = null;
  f.owner._refreshNavigation({ forceStory: true });
  assert.deepEqual(f.state.nav.waypoint.pos, { x: 13008, z: 7212 });
  f.state.story.beatIndex = 2;
  assert.equal(kesslerScaleWaypoint(f.state), null);
  assert.equal(kesslerScaleWaypoint({ story: { beatIndex: 1, flags: { kessler_variance_seen: true } } }), null);
});
