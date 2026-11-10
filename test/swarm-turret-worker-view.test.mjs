import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { BROOD_CASCADE_PANIC } from '../src/data/swarmBrood.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { projectSwarmTurretPresentation, readSwarmBroodPresentation } from '../src/data/swarmTurretPresentation.js';
import { configureDomainMirroring, createDomainDiffer } from '../scripts/lib/simReadModel.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createBroodPresentation } from '../src/render/broodPresentation.js';
import { vfx } from '../src/render/vfx.js';

const DT = 1 / 60;
function arrange(sim, registry, state = sim.state) {
  state.mode = 'flight';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), phase: 'active', wave: 64 };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 40, hull: 100, hullMax: 100, collides: true, data: {} });
  state.playerId = player.id; noteSwarmPilotAction(state);
  const rock = sim.spawn({ type: 'asteroid', pos: { x: 45, z: 0 }, radius: 12, mass: 50, collides: true });
  const engine = registry.get('swarmArena')._brood;
  engine.prepareWave(state.run, 64); engine.spawnWave(state);
  const b = engine._bodies;
  const turret = b.alive.findIndex((n, i) => n && b.liveFamilyId[b.family[i]] === 'beam_turret');
  for (let i = 0; i < b.alive.length; i++) if (i !== turret) b.alive[i] = 0;
  b.px[turret] = b.teleX[turret] = 0; b.pz[turret] = b.teleZ[turret] = 0; b.timer[turret] = 0;
  const step = () => { state.tick++; state.simTime += DT; engine.step(state); };
  return { sim, state, engine, b, turret, rock, step };
}
function fixture(t) {
  const sim = createSimulation({ seed: 4242, systems: [swarmArena] });
  t.after(() => sim.dispose()); return arrange(sim, sim.registry);
}
function live(h) {
  for (let i = 0; i < 600 && !h.engine._machine().beams; i++) h.step();
  assert.equal(h.engine._machine().beams, 1);
  const n = h.engine._beams.alive.findIndex(Boolean);
  h.engine._beams.a0[n] = h.engine._beams.a1[n] = 0; h.step();
}
async function mainLane(t, initial = {}) {
  const main = { entities: new Map(), entityList: [], settings: {}, meta: { seed: 4242 },
    tick: 0, simTime: 0, accumulator: 0, timeScale: 0, ui: { screenStack: [] }, world: {} };
  const posts = []; let receive;
  const lane = createSimLaneRuntime({ state: main, helpers: {}, registry: {}, bus: createBus(),
    flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
    channelFactory: () => ({ post: m => posts.push(m), onMessage: fn => { receive = fn; }, terminate() {} }) });
  t.after(() => lane.close());
  receive({ lifecycleGeneration: 0, stateTick: 0, spawnInfos: [], domainUpdates: [], ...structuredClone(initial), kind: 'ready', seq: posts[0].seq });
  await lane.readyPromise;
  const pres = createBroodPresentation(new THREE.Scene()); t.after(() => pres.dispose());
  const host = Object.create(vfx); host.state = main; host._broodPresentation = pres;
  const send = reply => {
    // Ordinary worker values cross a clone boundary before the production main consumer.
    receive({ lifecycleGeneration: 0, ...structuredClone(reply), kind: 'clockTick' });
    return host._updateBroodPresentation(DT);
  };
  return { main, pres, send, lane, draw: () => host._updateBroodPresentation(DT) };
}
function span(mesh) {
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  mesh.getMatrixAt(0, matrix); matrix.decompose(position, new THREE.Quaternion(), scale);
  return { x: position.x, z: position.z, range: scale.x, finite: matrix.elements.every(Number.isFinite) };
}

test('projection contains only compact turret draw fields and exact beam rows', t => {
  const h = fixture(t); live(h);
  h.engine.view.privateSentinel = 'must-not-ship';
  const projected = projectSwarmTurretPresentation(h.state);
  assert.equal(projected.cap, 1); assert.equal(projected.aliveCount, 1);
  assert.equal(projected.beams[0].range, 28);
  assert.equal(projected.px.length, 1); assert.equal(projected.px[0], 0);
  for (const key of ['hp', 'vx', 'vz', 'reserveBudget', 'machineReserve', 'shielded', 'privateSentinel', 'lobX', 'poolX'])
    assert.equal(key in projected, false, key);
  assert.ok(JSON.stringify(projected).length < 1000);
  projected.px[0] = 999; projected.beams[0].range = 1;
  assert.equal(h.b.px[h.turret], 0); assert.equal(h.engine.view.beams[0].range, 28);
});

test('ordinary differ and actual main VFX draw clipped, reopened, zero-length and cleared edges in the same reply', async t => {
  const h = fixture(t); live(h); const m = await mainLane(t), differ = createDomainDiffer();
  let tick = 0;
  const ship = () => { const reply = { stateTick: ++tick, simTime: h.state.simTime, spawnInfos: [], events: [],
    domainUpdates: differ.diff(h.state, tick).updates }; m.send(reply); return reply; };
  const first = ship();
  assert.ok(first.domainUpdates.some(u => u.segs[0] === 'swarmTurretPublic'));
  assert.equal(m.main.swarmBrood, undefined, 'no general Brood tree crosses');
  assert.equal(m.pres.mesh.count, 1); assert.equal(m.pres.mesh.visible, true, 'the original mount is visible');
  assert.equal(m.pres.mbeams.count, 1); assert.equal(m.pres.mbeams.visible, true);
  assert.deepEqual(span(m.pres.mbeams), { x: 14, z: 0, range: 28, finite: true });
  assert.equal(ship().domainUpdates.some(u => u.segs[0] === 'swarmTurretPublic'), false, 'unchanged view does not resend');
  h.rock.pos.z = 50; h.step(); ship();
  assert.deepEqual(span(m.pres.mbeams), { x: 65, z: 0, range: 130, finite: true });
  h.rock.pos.x = 0; h.rock.pos.z = 0; h.step(); ship();
  assert.equal(m.main.swarmTurretPublic.beams[0].range, 0);
  assert.equal(m.pres.mbeams.count, 0, 'zero range is hidden, never a singular instance sanitized into a visible stub');
  h.engine.clear(); ship();
  assert.equal(m.main.swarmTurretPublic, null); assert.equal(m.pres.mesh.count, 0); assert.equal(m.pres.mbeams.count, 0);
});

test('actual production host reply reaches the real main consumer with a live mount and its changing cover edge', async t => {
  const worker = createSimHost(); t.after(() => worker.shutdown());
  const initial = await worker.init({ profile: 'production', seed: 4242, viewport: { w: 1440, h: 900 },
    scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
  const m = await mainLane(t, initial), h = arrange(worker.host.sim, worker.host.registry, worker.host.state);
  let wound = false, clipped = false, frames = 0;
  for (let i = 0; i < 600; i++) {
    h.step();
    const reply = await worker.tick({ steps: 0, commands: [] }); m.send(reply);
    const actual = h.engine.view.beams;
    if (actual.some(b => b.state === 0)) { wound = true; assert.equal(m.pres.mbeams.count, 2, JSON.stringify({ mainMode: m.main.mode, run: m.main.run, view: m.main.swarmTurretPublic, updates: reply.domainUpdates.map(u => u.segs) })); }
    const beam = actual.find(b => b.state === 1);
    if (beam) {
      frames++;
      assert.equal(m.pres.mesh.count, 1); assert.equal(m.pres.mbeams.count, 1);
      assert.ok(Math.abs(span(m.pres.mbeams).range - beam.range) < 0.0001, 'no delayed scalar/cold snapshot');
      if (beam.range < 100) clipped = true;
    }
    if (frames && !h.engine._machine().beams) break;
  }
  assert.equal(wound, true); assert.equal(clipped, true); assert.ok(frames >= 59);
  worker.host.bus.emit('run:ended', {}); m.send(await worker.tick({ steps: 0, commands: [] }));
  assert.equal(m.pres.mesh.count, 0); assert.equal(m.pres.mbeams.count, 0);
  t.diagnostic(`Production worker → cloned reply → main lane → VFX: ${frames} live sweep frames, original turret mount, exact clipped edge, clear.`);
});

test('pause, death, next wave and run replacement clear or retain only the authoritative snapshot', async t => {
  const h = fixture(t); live(h); const m = await mainLane(t), differ = createDomainDiffer(); let tick = 0;
  const ship = () => m.send({ stateTick: ++tick, simTime: h.state.simTime, spawnInfos: [], events: [], domainUpdates: differ.diff(h.state, tick).updates });
  ship(); h.state.mode = 'pause'; ship(); assert.equal(m.pres.mbeams.count, 1);
  h.engine._killDirectForTest(h.turret, 'collision'); ship(); assert.equal(m.pres.mbeams.count, 0);
  h.state.mode = 'flight'; h.engine.prepareWave(h.state.run, 64); h.engine.spawnWave(h.state); ship();
  assert.ok(m.pres.mesh.count > 0); assert.equal(m.pres.mbeams.count, 0);
  h.state.run.wave = 65; ship(); assert.equal(m.pres.mesh.count, 0);
  h.state.run = createRunState({ kind: 'adventure', seed: 4242 }); ship(); assert.equal(m.pres.mesh.count, 0);
});

test('transport absence preserves local full view; explicit null or wrong context suppresses stale local state', t => {
  const h = fixture(t); live(h); assert.equal(readSwarmBroodPresentation(h.state), h.engine.view);
  h.state.swarmTurretPublic = projectSwarmTurretPresentation(h.state);
  assert.equal(readSwarmBroodPresentation(h.state), h.state.swarmTurretPublic);
  h.state.swarmTurretPublic.wave--; assert.equal(readSwarmBroodPresentation(h.state), null);
  h.state.swarmTurretPublic = null; assert.equal(readSwarmBroodPresentation(h.state), null);
});

test('invalid, oversized and non-current authoritative views fail closed rather than expanding the wire', t => {
  const h = fixture(t); live(h); const source = h.state.swarmBrood;
  for (const change of [v => { v.cap = 401; }, v => { v.beams = Array(409).fill(source.beams[0]); },
    v => { v.beams = [{ ...source.beams[0], range: NaN }]; }, v => { v.wave = 65; }]) {
    const copy = { ...source }; change(copy); h.state.swarmBrood = copy;
    assert.equal(projectSwarmTurretPresentation(h.state), null);
  }
  h.state.swarmBrood = source; h.state.run.phase = 'cleared'; assert.equal(projectSwarmTurretPresentation(h.state), null);
});

test('diagnostic root expansion cannot bypass the bounded atomic presentation contract', t => {
  const h = fixture(t); live(h);
  configureDomainMirroring({ expandPaths: [{ segs: ['swarmTurretPublic'], depth: 8 }] });
  t.after(() => configureDomainMirroring({}));
  const updates = createDomainDiffer().diff(h.state, 0).updates.filter(u => u.segs[0] === 'swarmTurretPublic');
  assert.equal(updates.length, 1); assert.deepEqual(updates[0].segs, ['swarmTurretPublic']);
  assert.equal(updates[0].v.aliveCount, 1);
});

test('turret-only drawing preserves native mount pose and existing affix/cascade color without admitting other bodies', t => {
  const h = fixture(t); live(h);
  const view = h.engine.view;
  view.affix[h.turret] = 1;
  view.cascade = BROOD_CASCADE_PANIC;
  const actual = createBroodPresentation(new THREE.Scene()), projected = createBroodPresentation(new THREE.Scene());
  t.after(() => { actual.dispose(); projected.dispose(); });
  actual.update(view, DT, { simTime: 2, reducedMotion: true });
  const row = projectSwarmTurretPresentation(h.state); projected.update(row, DT, { simTime: 2, reducedMotion: true });
  const a = new THREE.Matrix4(), b = new THREE.Matrix4(), ca = new THREE.Color(), cb = new THREE.Color();
  actual.mesh.getMatrixAt(0, a); projected.mesh.getMatrixAt(0, b); assert.deepEqual(a.elements, b.elements);
  actual.mesh.getColorAt(0, ca); projected.mesh.getColorAt(0, cb); assert.deepEqual(ca.toArray(), cb.toArray());
  const mite = h.b.family.findIndex(n => n === h.b.liveFamilyId.indexOf('mite'));
  h.b.alive[mite] = 1;
  assert.equal(projectSwarmTurretPresentation(h.state).cap, 1, 'other living Brood remain outside this narrow patch');
});

test('local generation advance immediately clears the turret and rejects old in-flight replies', async t => {
  const h = fixture(t); live(h); const m = await mainLane(t), differ = createDomainDiffer();
  const oldReply = { stateTick: 1, lifecycleGeneration: 0, simTime: h.state.simTime,
    spawnInfos: [], events: [], domainUpdates: differ.diff(h.state, 1).updates };
  m.send(oldReply); assert.equal(m.pres.mbeams.count, 1);
  m.lane.runner.setLifecycleGeneration(1); m.draw();
  assert.equal(m.main.swarmTurretPublic, null); assert.equal(m.pres.mesh.count, 0); assert.equal(m.pres.mbeams.count, 0);
  m.send(oldReply); assert.equal(m.pres.mbeams.count, 0, 'the late old room is not visible');
  m.send({ ...oldReply, lifecycleGeneration: 1, stateTick: 2 });
  assert.equal(m.pres.mesh.count, 1); assert.equal(m.pres.mbeams.count, 1, 'a new current-generation view is admitted');
  m.lane.runner.setLifecycleGeneration(1); m.draw(); assert.equal(m.pres.mbeams.count, 1, 'same generation does not blank a live threat');
});

function assertBeamEndpoints(mesh, index, beam, angle) {
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
  const start = new THREE.Vector3(-0.5, 0, 0).applyMatrix4(matrix);
  const end = new THREE.Vector3(0.5, 0, 0).applyMatrix4(matrix);
  const expected = [beam.x, beam.z, beam.x + Math.cos(angle) * beam.range, beam.z + Math.sin(angle) * beam.range];
  const actual = [start.x, start.z, end.x, end.z];
  assert.ok(actual.every((value, i) => Math.abs(value - expected[i]) < 0.0001),
    JSON.stringify({ angle, actual, expected }));
}

for (const winding of [true, false]) test(`oblique ${winding ? 'windup markers' : 'live clipped edge'} has the authoritative endpoints after worker transport`, async t => {
  for (const angle of [Math.PI / 4, -Math.PI / 3, Math.PI / 2]) {
    const h = fixture(t), m = await mainLane(t), differ = createDomainDiffer();
    const player = h.state.entities.get(h.state.playerId);
    player.pos.x = 90 * Math.cos(angle); player.pos.z = 90 * Math.sin(angle);
    h.rock.pos.x = 45 * Math.cos(angle); h.rock.pos.z = 45 * Math.sin(angle);
    if (winding) {
      for (let i = 0; i < 10 && !h.engine.view.beams.some(beam => beam.state === 0); i++) h.step();
    } else {
      live(h);
      const slot = h.engine._beams.alive.findIndex(Boolean);
      h.engine._beams.a0[slot] = h.engine._beams.a1[slot] = angle; h.step();
    }
    const beam = h.engine.view.beams.find(beam => beam.state === (winding ? 0 : 1));
    assert.ok(beam);
    m.send({ stateTick: 1, simTime: h.state.simTime, spawnInfos: [], events: [], domainUpdates: differ.diff(h.state, 1).updates });
    assert.equal(m.pres.mbeams.count, winding ? 2 : 1);
    if (winding) {
      assertBeamEndpoints(m.pres.mbeams, 0, beam, beam.a0);
      assertBeamEndpoints(m.pres.mbeams, 1, beam, beam.a1);
    } else {
      assert.ok(Math.abs(beam.range - 28) < 0.0001);
      const matrix = new THREE.Matrix4(); m.pres.mbeams.getMatrixAt(0, matrix);
      const left = new THREE.Vector3(0, 0, -0.07).applyMatrix4(matrix);
      const right = new THREE.Vector3(0, 0, 0.07).applyMatrix4(matrix);
      assert.ok(Math.abs(left.distanceTo(right) - 2 * beam.width) < 0.0001,
        'the live strip spans both sides of the collision half-width');
      assertBeamEndpoints(m.pres.mbeams, 0, beam, beam.a0 + (beam.a1 - beam.a0) * Math.min(1, beam.t / beam.total));
    }
  }
});

test('paused production host resends the unchanged turret once after a presentation generation change', async t => {
  const worker = createSimHost(); t.after(() => worker.shutdown());
  const initial = await worker.init({ profile: 'production', seed: 4242, viewport: { w: 1440, h: 900 },
    scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
  const m = await mainLane(t, initial), h = arrange(worker.host.sim, worker.host.registry, worker.host.state);
  live(h); h.state.mode = 'pause';
  const first = await worker.tick({ steps: 0, generation: 0, commands: [] }); m.send(first);
  assert.equal(m.pres.mbeams.count, 1);
  const snapshot = structuredClone(m.main.swarmTurretPublic);
  const unchanged = await worker.tick({ steps: 0, generation: 0, commands: [] });
  assert.equal(unchanged.domainUpdates.some(u => u.segs[0] === 'swarmTurretPublic'), false);
  const tick = h.state.tick, time = h.state.simTime;
  m.lane.runner.setLifecycleGeneration(1); m.draw(); assert.equal(m.pres.mbeams.count, 0);
  const restored = await worker.tick({ steps: 0, generation: 1, commands: [] });
  assert.equal(restored.lifecycleGeneration, 1);
  assert.ok(restored.domainUpdates.some(u => u.segs[0] === 'swarmTurretPublic'), 'unchanged presentation needs a fresh-generation receipt');
  m.send(restored);
  assert.deepEqual(m.main.swarmTurretPublic, snapshot);
  assert.equal(m.pres.mesh.count, 1); assert.equal(m.pres.mbeams.count, 1);
  assert.equal(h.state.tick, tick); assert.equal(h.state.simTime, time);
  const next = await worker.tick({ steps: 0, generation: 1, commands: [] }); m.send(next);
  assert.equal(next.domainUpdates.some(u => u.segs[0] === 'swarmTurretPublic'), false, 'same generation resumes normal deduplication');
  m.send(first); assert.deepEqual(m.main.swarmTurretPublic, snapshot, 'late prior-generation update remains rejected');
  h.engine.clear(); m.send(await worker.tick({ steps: 0, generation: 1, commands: [] }));
  assert.equal(m.pres.mesh.count, 0); assert.equal(m.pres.mbeams.count, 0);
});
