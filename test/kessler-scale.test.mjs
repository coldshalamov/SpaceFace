import test from 'node:test';
import assert from 'node:assert/strict';
import { createKesslerScale, kesslerScaleSpec } from '../src/systems/kesslerScale.js';
import { KESSLER_SCALE } from '../src/data/kessler.js';
import { kesslerPodEligible, kesslerReadCheck, kesslerPlateRead, kesslerTrueRead, kesslerVarianceSeen } from '../src/characters/kesslerRules.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, getDeclaredSystemClock } from '../src/runtime/authoritativeSystemManifest.js';

const PAD = KESSLER_SCALE.pad;

function fixture({ sector = KESSLER_SCALE.sectorId, kind = 'adventure' } = {}) {
  const bus = createBus(), events = [];
  const state = {
    simTime: 0, tick: 0, mode: 'flight', run: { kind },
    world: { currentSectorId: sector }, entities: new Map(), entityList: [],
    story: { flags: {} }, playerId: 7, ui: { docked: false },
  };
  let id = 10;
  const helpers = {
    spawnEntity(spec) { const e = makeEntity({ ...spec, id: ++id }); state.entities.set(e.id, e); state.entityList.push(e); return e; },
    removeEntity(rid) { const e = state.entities.get(rid); if (e) e.alive = false; },
  };
  helpers.spawnEntity({ type: 'ship', id: 7, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 4, mass: 12, hull: 50, hullMax: 50, isPlayer: true });
  for (const t of ['comms:popup', 'kesslerPod:weighed']) bus.on(t, (p) => events.push([t, p]));
  const system = createKesslerScale();
  system.init({ state, bus, helpers });
  const beacon = () => state.entityList.filter((e) => e.alive && e.data?.kesslerScale === true);
  const addPod = (over = {}) => helpers.spawnEntity({
    type: 'payload', pos: { x: PAD.x, z: PAD.z }, vel: { x: 0, z: 0 },
    radius: 6, mass: 40, hull: 1, hullMax: 1,
    data: { payloadType: 'jettisoned_cargo' }, ...over,
  });
  return { bus, state, helpers, system, events, beacon, addPod };
}

test('registered in both orders on the calendar clock — a seconds-scale plate census', () => {
  assert.equal(PRODUCTION_INIT_ORDER.filter((x) => x === 'kesslerScale').length, 1);
  assert.equal(PRODUCTION_UPDATE_ORDER.filter((x) => x === 'kesslerScale').length, 1);
  assert.equal(getDeclaredSystemClock('kesslerScale'), 'calendar');
});

test('the weigh-slip deck waits at Tethys adventure and announces itself once ever', () => {
  const f = fixture();
  assert.equal(f.beacon().length, 1);
  const announces = f.events.filter(([t, p]) => t === 'comms:popup' && p.id === 'kessler_scale_announce');
  assert.equal(announces.length, 1);
  f.system._sync(); f.system._sync();
  assert.equal(f.beacon().length, 1, 're-entry cannot stack a second plate');
  assert.equal(announces.length, 1, 'the deck explains itself once ever');
});

test('no deck in survival, lab, or another sector; leaving Tethys clears it', () => {
  for (const kind of ['survival', 'lab']) {
    const f = fixture({ kind });
    assert.equal(f.beacon().length, 0, kind);
  }
  const f = fixture();
  f.state.world.currentSectorId = 'sector_helios';
  f.bus.emit('sector:enter', {});
  assert.equal(f.beacon().length, 0, 'the plate is Tethys property');
});

test('a pod at rest inside the ring is weighed once — the plate reads low', () => {
  const f = fixture();
  const pod = f.addPod({ mass: 40 });
  f.system.update(0.5, f.state);
  const weighs = f.events.filter(([t]) => t === 'kesslerPod:weighed');
  assert.equal(weighs.length, 1);
  const { plateRead, trueRead, variance, firstVariance, count } = weighs[0][1];
  assert.equal(trueRead, kesslerTrueRead(40));
  assert.equal(plateRead, kesslerPlateRead(40));
  assert.ok(plateRead < trueRead, 'the thumbed plate under-reads');
  assert.equal(variance, true);
  assert.equal(firstVariance, true);
  assert.equal(count, 1);
  assert.equal(pod.alive, true, 'the deck reports; the freight stays yours');
  assert.equal(f.state.story.flags[KESSLER_SCALE.varianceFlag], true);
  assert.equal(f.state.story.flags[KESSLER_SCALE.countFlag], 1);
  f.system.update(0.5, f.state);
  assert.equal(f.events.filter(([t]) => t === 'kesslerPod:weighed').length, 1, 'a parked pod is read once, not polled');
});

test('the first variance persists as the clue receipt; later reads use the desk line', () => {
  const f = fixture();
  f.addPod({ mass: 40 });
  f.system.update(0.5, f.state);
  f.addPod({ mass: 25, pos: { x: PAD.x + 10, z: PAD.z } });
  f.system.update(0.5, f.state);
  const popups = f.events.filter(([t, p]) => t === 'comms:popup' && p.id.startsWith('kessler_read_'));
  assert.equal(popups.length, 2);
  assert.ok(popups[0][1].text.includes('thumb-width'), 'the first variance calls the skim');
  assert.equal(popups[0][1].persist, true, 'the clue receipt stays in the log');
  assert.ok(!popups[1][1].text.includes('thumb-width'), 'the second read is routine');
  assert.equal(popups[1][1].persist, false);
  assert.equal(f.state.story.flags[KESSLER_SCALE.countFlag], 2);
});

test('a fast flyby and out-of-ring freight are not weighed', () => {
  const f = fixture();
  const fast = f.addPod({ vel: { x: 20, z: 0 } });
  const far = f.addPod({ pos: { x: PAD.x + 500, z: PAD.z } });
  f.system.update(0.5, f.state);
  assert.equal(f.events.filter(([t]) => t === 'kesslerPod:weighed').length, 0);
  assert.equal(fast.data.kesslerRead, undefined);
  assert.equal(far.data.kesslerRead, undefined);
  assert.ok(kesslerReadCheck({ pos: PAD, vel: { x: 5, z: 0 } }).arrived, 'a settled pod arrives');
});

test('wrecks, ships, and already-read pods are not freight for the plate', () => {
  assert.equal(kesslerPodEligible({ mass: 40, data: { payloadType: 'jettisoned_cargo' } }), true);
  assert.equal(kesslerPodEligible({ mass: 40, data: {} }), false, 'an ordinary body is not cargo');
  assert.equal(kesslerPodEligible({ mass: 40, data: { payloadType: 'civilian_manifest' } }), false, 'a manifest pod is not jettison freight');
  assert.equal(kesslerPodEligible({ mass: 40, data: { payloadType: 'jettisoned_cargo', kesslerRead: true } }), false, 'already read this visit');
  assert.equal(kesslerPodEligible({ mass: 40, data: { payloadType: 'jettisoned_cargo' }, alive: false }), false);
  assert.equal(kesslerPodEligible({ mass: 0, data: { payloadType: 'jettisoned_cargo' } }), false, 'no mass, no read');
});

test('the skim is honest arithmetic — plate low, stamp true, variance beyond rounding', () => {
  assert.equal(kesslerPlateRead(100), 94);
  assert.equal(kesslerTrueRead(100), 100);
  assert.equal(kesslerPlateRead(0), 0);
  assert.ok(kesslerVarianceSeen(94, 100));
  assert.equal(kesslerVarianceSeen(100, 100), false);
  assert.equal(kesslerVarianceSeen(94, NaN), false);
});

test('destroy clears listeners, providers, and the beacon; re-init is clean', () => {
  const f = fixture();
  assert.equal(f.beacon().length, 1);
  f.system.destroy();
  assert.equal(f.beacon().length, 0);
  f.system.init({ state: f.state, bus: f.bus, helpers: f.helpers });
  f.system.init({ state: f.state, bus: f.bus, helpers: f.helpers });
  assert.equal(f.beacon().length, 1, 'repeated init still leaves exactly one plate');
  f.system.update(0.5, f.state);
  const announces = f.events.filter(([t, p]) => t === 'comms:popup' && p.id === 'kessler_scale_announce');
  assert.equal(announces.length, 1, 'the once-ever flag survives re-init');
});

test('leaving and re-entering re-reads a fresh pod but never re-announces', () => {
  const f = fixture();
  f.state.world.currentSectorId = 'sector_helios';
  f.bus.emit('sector:enter', {});
  assert.equal(f.beacon().length, 0);
  f.state.world.currentSectorId = KESSLER_SCALE.sectorId;
  f.bus.emit('sector:enter', {});
  assert.equal(f.beacon().length, 1);
  const pod = f.addPod({ mass: 30 });
  f.system.update(0.5, f.state);
  assert.equal(pod.data.kesslerRead, true);
  const announces = f.events.filter(([t, p]) => t === 'comms:popup' && p.id === 'kessler_scale_announce');
  assert.equal(announces.length, 1);
});
