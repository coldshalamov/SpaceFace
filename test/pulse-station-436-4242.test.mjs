import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { stationLifeProfile, stationPALine, stationBayPose, stationBayCalls, BAY_SLOTS, BAY_PERIOD_S } from '../src/data/stationLife.js';
import { STATION_LIFE_AUDIO_RECIPES } from '../src/data/stationLifeAudio.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { createStationLifePresenter } from '../src/ui/station/stationLife.js';
import { createStationBayTraffic } from '../src/render/stationBayTraffic.js';
import { bindStationLifeClock, stationLifeClockFor } from '../src/presentation/stationLifeClock.js';

function fixture() {
  let time = 0, serial = 0;
  const timers = new Map(), handlers = new Map(), events = [], receipts = [];
  const bus = {
    on(event, fn) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(fn); },
    off(event, fn) { handlers.get(event)?.delete(fn); },
    emit(event, payload) { events.push({ event, payload }); for (const fn of handlers.get(event) || []) fn(payload); },
  };
  const state = { simTime: 100, factions: { faction_scn: { rep: 0 } },
    world: { currentSectorId: 'sector_helios_prime' },
    ui: { docked: true, dockedStationId: 'station_helios', stageRequest: { scene: 'berth' } },
    settings: { audio: { muted: true } } };
  const options = {
    now: () => time, setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, showReceipt(...args) { receipts.push(args); },
  };
  const presenter = createStationLifePresenter({ state, bus }, options);
  const advance = ms => {
    const end = time + ms;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      time = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    time = end;
  };
  return { state, bus, events, receipts, presenter, advance, timers, handlers };
}

test('station sound reads actual type, faction, standing and the existing watch calendar', () => {
  const { state, presenter } = fixture();
  const helios = stationLifeProfile(state, 'station_helios');
  const ceres = stationLifeProfile(state, 'station_ceres');
  assert.equal(helios.type, 'trade_hub');
  assert.equal(ceres.type, 'refinery');
  assert.notEqual(helios.crowdHz, ceres.crowdHz);
  assert.notEqual(helios.authority, ceres.authority);
  assert.match(stationPALine(ceres), /Hot-work/);
  state.factions.faction_scn.rep = -50;
  assert.match(stationPALine(stationLifeProfile(state, 'station_helios'), 2), /Additional manifest checks/);
  state.factions.faction_scn.rep = 60;
  assert.match(stationPALine(stationLifeProfile(state, 'station_helios'), 2), /trusted pilots/);
  state.simTime += helios.shift.endsInS + 1;
  assert.notEqual(stationLifeProfile(state, 'station_helios').shift.index, helios.shift.index);
  assert.equal(stationLifeProfile(state, 'not-a-station'), null);
  presenter.dispose();
});

test('docked paused simulation gets crowd, PA, watch bell and calls matching visible bay transfers', () => {
  const f = fixture();
  const before = JSON.stringify({ simTime: f.state.simTime, factions: f.state.factions, world: f.state.world });
  f.presenter.show(); f.advance(70000);
  assert.ok(stationLifeClockFor(f.state.ui.stageRequest));
  assert.deepEqual(f.state.ui.stageRequest, { scene: 'berth' }, 'cosmetic clock stays out of serialized UI state');
  assert.equal(JSON.stringify({ simTime: f.state.simTime, factions: f.state.factions, world: f.state.world }), before);
  assert.ok(f.events.some(e => e.event === 'audio:cue' && e.payload.id === 'ambient_station_crowd'));
  assert.equal(f.events.filter(e => e.event === 'audio:cue' && e.payload.id === 'ambient_station_shift_bell').length, 1);
  assert.ok(f.receipts.some(r => r[0] === 'Public address'));
  assert.ok(f.receipts.some(r => r[0] === 'Berth control' && /berth 7 is clear/.test(r[1])));
  assert.ok(f.receipts.some(r => /Berth 7 released/.test(r[1])));
  assert.ok(f.receipts.some(r => /berth 12 is clear/.test(r[1])));
  const slot = BAY_SLOTS[0];
  const call = stationBayCalls(11.9, 12.1, stationLifeProfile(f.state, 'station_helios'))[0];
  assert.equal(call.at, slot.offset);
  assert.equal(stationBayPose(call.at, slot).phase, 'arriving');
  assert.equal(stationBayPose(38, slot).phase, 'departing');
  assert.equal(f.timers.size, 1);
  f.presenter.dispose();
  assert.equal(f.timers.size, 0);
  assert.ok([...f.handlers.values()].every(set => set.size === 0));
});

test('arrival/priority speech wins; hidden or stale visits never chatter or replay a backlog', () => {
  const f = fixture();
  f.presenter.show(); f.advance(3500);
  f.bus.emit('barkDirector:voice', { text: 'Existing barkeep greeting' });
  f.advance(6500);
  assert.equal(f.receipts.length, 0, 'PA yielded the existing arrival voice');
  f.advance(2000);
  assert.ok(f.receipts.length > 0);
  f.presenter.hide();
  const n = f.events.length;
  f.advance(60000);
  assert.equal(f.events.length, n);
  f.presenter.show(); f.advance(1000);
  assert.equal(f.receipts.filter(r => r[0] === 'Watch bell').length, 1, 'cover/resume does not repeat arrival bell');
  f.state.ui.docked = false;
  f.bus.emit('dock:undocked');
  const m = f.events.length;
  f.advance(10000);
  assert.equal(f.events.length, m);
  f.presenter.dispose();
});

test('a real shift edge rings once and reads the new watch without inventing simulated time', () => {
  const f = fixture();
  f.presenter.show(); f.advance(9000);
  const profile = stationLifeProfile(f.state, 'station_helios');
  f.state.simTime += profile.shift.endsInS + 1;
  f.advance(1000);
  assert.equal(f.events.filter(e => e.event === 'audio:cue' && e.payload.id === 'ambient_station_shift_bell').length, 2);
  assert.match(f.receipts.at(-1)[1], new RegExp(stationLifeProfile(f.state, 'station_helios').shift.name));
  f.advance(4000);
  assert.equal(f.events.filter(e => e.event === 'audio:cue' && e.payload.id === 'ambient_station_shift_bell').length, 2);
  f.presenter.dispose();
});

test('the bay schedule continuously arrives, dwells, departs and clears; old intervals are discarded', () => {
  const slot = BAY_SLOTS[0];
  const a = stationBayPose(12, slot), b = stationBayPose(18, slot), c = stationBayPose(26, slot);
  assert.ok(a.x < b.x && b.x < c.x);
  assert.equal(c.phase, 'moored');
  assert.equal(stationBayPose(40, slot).phase, 'departing');
  assert.equal(stationBayPose(52, slot).visible, false);
  assert.deepEqual(stationBayPose(18 + BAY_PERIOD_S, slot), b);
  assert.deepEqual(stationBayCalls(0, 900, {}), []);
});

test('bay instances share authored GPU resources, remain presentation-only, and honor reduced motion', () => {
  const geometry = new THREE.BoxGeometry(2, 1, 4), material = new THREE.MeshStandardMaterial();
  const record = { geometry, material };
  const bay = createStationBayTraffic(record, r => {
    const group = new THREE.Group(); group.add(new THREE.Mesh(r.geometry, r.material)); return group;
  }, (group, p) => group.scale.setScalar(p.fit / 4));
  assert.equal(bay.roots.length, 2);
  assert.equal(bay.roots[0].children[0].children[0].geometry, geometry);
  assert.equal(bay.roots[1].children[0].children[0].material, material);
  assert.equal(bay.roots[0].children[0].children[0].castShadow, false);
  const clock = { elapsedS: 12, updatedAt: 0, running: true };
  bay.update(clock, 0); const start = bay.roots[0].position.clone();
  bay.update(clock, 6000); assert.ok(start.distanceTo(bay.roots[0].position) > 20);
  bay.update(clock, 6000, false); const still = bay.roots[0].position.clone();
  bay.update(clock, 60000, false); assert.deepEqual(bay.roots[0].position, still);
  bay.update(null, 60000); assert.ok(bay.roots.every(root => !root.visible));
  geometry.dispose(); material.dispose();
});

test('all station cues resolve in the production recipe catalog and have finite low ambient envelopes', () => {
  for (const recipe of STATION_LIFE_AUDIO_RECIPES) {
    assert.equal(RECIPES.find(r => r.id === recipe.id), recipe);
    assert.equal(recipe.category, 'ambient');
    assert.ok(recipe.duration > 0 && recipe.duration < 6);
    assert.ok(recipe.gainEnvelope.peak <= .3);
    assert.ok(recipe.gainEnvelope.sustain <= 1);
    assert.ok(recipe.gainEnvelope.attack + recipe.gainEnvelope.decay + recipe.gainEnvelope.release <= 6);
  }
});

test('the real berth stage admits both traffic roots with the hull and poses them from the docked clock', async t => {
  const { presentUiStage, releaseUiStage, releaseUiStagePrewarm, setUiStagePartLoaderForTest, uiStageReport } = await import('../src/render/uiStage.js');
  releaseUiStage(); releaseUiStagePrewarm();
  t.after(() => { releaseUiStage(); releaseUiStagePrewarm(); setUiStagePartLoaderForTest(null); });
  const geometry = new THREE.BoxGeometry(2, 1, 4), material = new THREE.MeshStandardMaterial();
  t.after(() => { geometry.dispose(); material.dispose(); });
  setUiStagePartLoaderForTest(async () => ({ primitives: [{ geometry, material, matrix: new THREE.Matrix4() }] }));
  let target = null, shown = [];
  const renderer = {
    domElement: { isConnected: false }, shadowMap: { enabled: false }, info: { programs: [] }, autoClear: true,
    async compileAsync() {}, initTexture() {}, getSize(v) { return v.set(960, 540); },
    getRenderTarget() { return target; }, setRenderTarget(t) { target = t; },
    getClearColor(c) { return c.set(0); }, getClearAlpha() { return 1; }, setClearColor() {},
    render(scene) { shown = scene.children.filter(r => r.name.startsWith('StationBay_')).map(r => ({ name: r.name, visible: r.visible, x: r.position.x })); },
  };
  const state = { mode: 'flight', ui: { docked: true, screenStack: [], stageRequest: { scene: 'berth', hullDefId: 'ship_kestrel' } },
    settings: { video: { motionReduce: false } }, render: {} };
  const clock = { elapsedS: 12, updatedAt: 0, running: false };
  bindStationLifeClock(state.ui.stageRequest, clock);
  presentUiStage({ render: { renderer }, state });
  for (let i = 0; i < 100 && uiStageReport().phase !== 'live'; i++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(uiStageReport().phase, 'live');
  presentUiStage({ render: { renderer }, state });
  assert.equal(shown.length, 2);
  assert.equal(shown[0].visible, true);
  const x = shown[0].x;
  clock.elapsedS = 18;
  presentUiStage({ render: { renderer }, state });
  assert.notEqual(shown[0].x, x, 'the actual renderer sees the moving authored transfer craft');
});
