import test from 'node:test';
import assert from 'node:assert/strict';
import { freshIona, beginAppearance, currentAppearance, chooseTerms, observeBody,
  stepIona, pauseIona, recordTheft, recordDamage, restoreIona, serializeIona } from '../src/features/iona-vey-rival/model.js';
import { createIonaAdapter } from '../src/features/iona-vey-rival/adapter.js';
import { APPEARANCES, TUG_KEY } from '../src/features/iona-vey-rival/catalog.js';

const placement = index => ({ index, sectorId: 'sector_helios_prime', anchor: { x: 0, z: 0 }, receiver: { x: 400, z: 0 } });
function start(s, index, time = 0) { assert.equal(beginAppearance(s, placement(index), time).ok, true); return currentAppearance(s); }
function arrive(s, b, carrier, time = 0) {
  const a = currentAppearance(s), def = APPEARANCES[s.active].bodies.find(d => d.id === b.id);
  for (let j = 0; j <= 9; j++) observeBody(s, b.key, { pos: a.receiver, vel: { x: 0, z: 0 },
    hull: def.hull, pool: b.pool, playerLine: carrier === 'player', rivalLine: carrier === 'iona' }, time + j * 0.25);
}
test('three physical joint recoveries earn alliance; choices alone never do', () => {
  const s = freshIona();
  for (let i = 0; i < 3; i++) {
    const a = start(s, i, i * 10); chooseTerms(s, 'cooperate');
    assert.equal(stepIona(s, i * 10, true), false);
    arrive(s, a.bodies[0], i === 0 ? 'player' : 'iona', i * 10);
    if (a.bodies[1]) arrive(s, a.bodies[1], 'player', i * 10);
    assert.equal(stepIona(s, i * 10 + 3, true), true);
    assert.equal(a.cooperation, true);
  }
  assert.equal(s.outcome, 'alliance');
});
test('clean competition is lawful rivalry, not compulsory combat', () => {
  const s = freshIona();
  for (let i = 0; i < 3; i++) {
    const a = start(s, i, i * 10); chooseTerms(s, 'compete');
    arrive(s, a.bodies[0], 'iona', i * 10);
    if (a.bodies[1]) arrive(s, a.bodies[1], 'player', i * 10);
    stepIona(s, i * 10 + 3, true);
  }
  assert.equal(s.outcome, 'lawful_rivalry');
});
test('stolen frame and player damage cannot become cooperation', () => {
  const s = freshIona(), a = start(s, 0);
  assert.equal(recordTheft(s, a.bodies[0].key), true);
  assert.equal(recordTheft(s, a.bodies[0].key), false);
  chooseTerms(s, 'cooperate'); recordDamage(s, a.bodies[0].key, true);
  arrive(s, a.bodies[0], 'player'); stepIona(s, 3, true);
  assert.equal(a.cooperation, false);
});
test('intervention is recorded separately from player aggression', () => {
  const s = freshIona(), a = start(s, 0); chooseTerms(s, 'cooperate');
  recordDamage(s, TUG_KEY, false); arrive(s, a.bodies[0], 'player'); stepIona(s, 3, true);
  assert.equal(a.intervention, true); assert.equal(a.damagedByPlayer, false); assert.equal(a.cooperation, true);
});
test('fast flythrough, drift and touching a load once do not earn cooperative recovery', () => {
  const s = freshIona(), a = start(s, 0); chooseTerms(s, 'cooperate');
  const b = a.bodies[0];
  observeBody(s, b.key, { pos: a.receiver, vel: { x: 50, z: 0 }, hull: 120, pool: b.pool, playerLine: true }, 0);
  assert.equal(b.status, 'live');
  arrive(s, b, 'iona', 1); stepIona(s, 4, true);
  assert.equal(b.arrivalBy, 'iona'); assert.equal(a.cooperation, false);
});
test('sector absence does not accumulate grace or delivery dwell', () => {
  const s = freshIona(), a = start(s, 0), b = a.bodies[0];
  stepIona(s, 0, true); stepIona(s, 0.25, true);
  arrive(s, b, 'player'); // reset below to test an in-progress dwell boundary
  b.status = 'live'; b.dwell = 1; b.lastSampleAt = 2;
  const grace = a.remainingGrace;
  pauseIona(s); stepIona(s, 1000, false); stepIona(s, 1001, true);
  assert.equal(a.remainingGrace, grace); assert.equal(b.dwell, 0);
});
test('restore is bounded, versioned, and does not replenish spent cargo', () => {
  const s = freshIona(), a = start(s, 0); a.bodies[0].pool = { cmdty_scrap_metal: 2 };
  const restored = restoreIona(serializeIona(s));
  assert.deepEqual(restored.appearances[0].bodies[0].pool, { cmdty_scrap_metal: 2 });
  restored.tug.status = 'destroyed'; restored.retired = true;
  assert.equal(restoreIona(serializeIona(restored)).tug.status, 'destroyed');
  assert.throws(() => restoreIona({ ...s, schema: 'future' }));
  assert.throws(() => restoreIona({ ...s, appearances: Array(100).fill(a) }));
  assert.equal(beginAppearance(restored, placement(1), 4).ok, false);
});
test('duplicate admission and wrong sequence cannot create another appearance', () => {
  const s = freshIona(); start(s, 0);
  assert.equal(beginAppearance(s, placement(0), 4).duplicate, true);
  assert.equal(beginAppearance(s, placement(2), 4).ok, false);
  assert.equal(beginAppearance(s, { ...placement(1), sectorId: 'elsewhere' }, 4).ok, false);
  assert.equal(s.appearances.length, 1);
});

// Owner doubles model the inspected signatures, including one job per stable record,
// claim-control refusal, numeric id generations, and real finite body pools. These are
// adapter contract tests, not a claim of native physics or headed acceptance.
function fixture() {
  const listeners = new Map();
  const bus = { on(name, fn) { const set = listeners.get(name) || new Set(); set.add(fn); listeners.set(name, set); return () => set.delete(fn); },
    emit(name, p) { for (const fn of [...listeners.get(name) || []]) fn(p); } };
  let id = 1, generation = 1;
  const state = { simTime: 0, mode: 'flight', entities: new Map(), entityList: [],
    playerId: 0, world: { currentSectorId: 'sector_helios_prime' }, player: { credits: 123 },
    factions: { faction_free: { rep: 0 } } };
  state.entities.set(0, { id: 0, alive: true, pos: { x: 0, z: 0 } });
  const entries = new Map(), lines = new Set(), calls = [];
  const helpers = {
    spawnBudget: { request: () => 1, release() {}, bindEntity: () => true },
    spawnEntity(spec) { const e = { ...spec, id: id++, occupantGeneration: generation++, alive: true, hull: spec.hull ?? 380 };
      state.entities.set(e.id, e); state.entityList.push(e); bus.emit('entity:spawned', { entity: e }); return e; },
    removeEntity(id) { state.entities.delete(id); state.entityList = state.entityList.filter(e => e.id !== id); },
    npcJobs: {
      get: key => entries.get(key),
      assign(e, spec) { calls.push({ method: 'assign', spec }); const key = `job:${e.data.worldRecordId}`;
        entries.set(key, { entityId: e.id, worldRecordId: e.data.worldRecordId, job: { ...spec, id: key, phase: 'load' } }); return key; },
      release(key) { calls.push({ method: 'release', key }); entries.delete(key); },
      claimControl(key, value) { const e = entries.get(key); if (e) e.control = value; return { granted: !!e }; },
      releaseControl(key) { const e = entries.get(key); if (e) e.control = null; },
      interrupt(key, target) { calls.push({ method: 'interrupt', key, target }); },
    },
  };
  const adapter = createIonaAdapter({ state, bus, helpers }, {
    shipSpec(defId, options) { return { type: 'ship', ...options, hull: 380, hullMax: 380, data: { defId } }; },
    lineBetween(a, b) { return lines.has(`${a.id}:${b.id}`) ? { id: `${a.id}:${b.id}` } : null; },
  });
  const byKey = key => state.entityList.find(e => e.data?.worldRecordId === key);
  const advance = dt => { state.simTime += dt; adapter.update(); };
  adapter.begin(placement(0)); adapter.update();
  return { state, bus, helpers, entries, adapter, byKey, advance, lines, calls, listeners };
}
test('adapter creates one authored Hawser and visible finite frame, using native job signature', () => {
  const f = fixture(), tug = f.byKey(TUG_KEY);
  assert.equal(tug.data.defId, 'ship_hawser');
  assert.equal(f.state.entityList.length, 2);
  for (let i = 0; i < 10; i++) f.adapter.update();
  assert.equal(f.state.entityList.length, 2);
  const frame = f.byKey('iona_vey_0_frame');
  assert.equal(frame.data.salvorClaimedBy, TUG_KEY);
  assert.equal(tug.data.towTargetId, frame.id);
  assert.equal(f.entries.get(`job:${TUG_KEY}`).job.kind, 'hauler');
  assert.equal(f.state.player.credits, 123);
});
test('cooperative first lift releases the real claim and movement job, no cargo or credits minted', () => {
  const f = fixture(), r = f.adapter.read();
  assert.equal(f.adapter.action({ appearanceId: r.appearanceId, revision: r.revision, verb: 'cooperate' }).ok, true);
  const frame = f.byKey('iona_vey_0_frame');
  assert.equal(frame.data.salvorClaimedBy, null); assert.equal(f.entries.size, 0);
  f.lines.add(`0:${frame.id}`); frame.pos = { x: 400, z: 0 };
  for (let i = 0; i < 10; i++) f.advance(0.25);
  assert.equal(f.adapter.serialize().appearances[0].cooperation, true);
  assert.equal(frame.data.salvagePool.cmdty_scrap_metal, 6);
  assert.equal(f.state.player.credits, 123);
});
test('job completion cannot masquerade as physical delivery', () => {
  const f = fixture(); f.entries.get(`job:${TUG_KEY}`).job.phase = 'complete'; f.advance(0.25);
  assert.equal(f.adapter.read().closed, false);
  assert.equal(f.adapter.serialize().appearances[0].bodies[0].status, 'live');
});
test('stale revision and out-of-range actions refuse; duplicate action has no side effect', () => {
  const f = fixture(), r = f.adapter.read(), action = { appearanceId: r.appearanceId, revision: r.revision, verb: 'cooperate' };
  assert.equal(f.adapter.action({ ...action, revision: -1 }).ok, false);
  f.state.entities.get(0).pos.x = 10000; assert.equal(f.adapter.action(action).ok, false);
  f.state.entities.get(0).pos.x = 0; assert.equal(f.adapter.action(action).ok, true);
  assert.equal(f.adapter.action(action).ok, false);
});
test('destruction, repeated destruction and reused numeric ids never print a new tug', () => {
  const f = fixture(), tug = f.byKey(TUG_KEY);
  tug.alive = false; f.bus.emit('entity:killed', { entity: tug });
  f.bus.emit('entity:destroyed', { entity: tug });
  f.state.entities.set(tug.id, { ...tug, occupantGeneration: 999, alive: true });
  f.bus.emit('entity:destroyed', { entity: tug });
  f.adapter.update(); assert.equal(f.adapter.serialize().retired, true);
  f.bus.emit('sector:exit', {}); f.adapter.update();
  assert.equal(f.state.entityList.filter(e => e.data?.worldRecordId === TUG_KEY && e.alive).length, 0);
  assert.equal(f.state.entities.get(tug.id).occupantGeneration, 999);
});
test('sector exit, re-entry and save continuity preserve cargo remainder and tug health', () => {
  const f = fixture(), tug = f.byKey(TUG_KEY), frame = f.byKey('iona_vey_0_frame');
  tug.hull = 215; frame.data.salvagePool.cmdty_scrap_metal = 2;
  f.bus.emit('sector:exit', {});
  assert.equal(f.state.entityList.length, 0);
  const saved = f.adapter.serialize(); f.state.simTime = 800;
  f.bus.emit('save:restoring', {}); f.adapter.deserialize(saved);
  f.bus.emit('save:loaded', {}); f.adapter.update();
  assert.equal(f.byKey(TUG_KEY).hull, 215);
  assert.equal(f.byKey('iona_vey_0_frame').data.salvagePool.cmdty_scrap_metal, 2);
  assert.equal(f.state.entityList.length, 2);
});
test('destroyed cargo stays destroyed across re-entry; intervention reaches NPC flee owner', () => {
  const f = fixture(), tug = f.byKey(TUG_KEY), frame = f.byKey('iona_vey_0_frame');
  f.bus.emit('combat:damage', { targetId: tug.id, attackerId: 999, applied: 2 });
  assert.ok(f.calls.some(c => c.method === 'interrupt'));
  frame.alive = false; f.bus.emit('entity:killed', { entity: frame });
  f.adapter.update(); f.bus.emit('sector:exit', {}); f.adapter.update();
  assert.equal(f.byKey('iona_vey_0_frame'), undefined);
  assert.equal(f.adapter.serialize().appearances[0].bodies[0].status, 'destroyed');
});
test('partial theft uses canonical claim-jump event; stale ids and duplicate events are bounded', () => {
  const f = fixture(), frame = f.byKey('iona_vey_0_frame');
  f.bus.emit('salvage:claimJumped', { wreckId: 999, claimantId: TUG_KEY, offenderId: 0 });
  assert.equal(f.adapter.serialize().appearances[0].theft, false);
  const p = { wreckId: frame.id, claimantId: TUG_KEY, offenderId: 0 };
  f.bus.emit('salvage:claimJumped', p); const r = f.adapter.serialize().revision;
  f.bus.emit('salvage:claimJumped', p);
  assert.equal(f.adapter.serialize().revision, r); assert.equal(f.adapter.serialize().appearances[0].theft, true);
});
test('mission association is read-only and refuses unrelated targets', () => {
  const f = fixture(), frame = f.byKey('iona_vey_0_frame');
  const mission = { id: 'mission_recovery', type: 'tow_recovery', status: 'active', targetEntityIds: [999] };
  f.state.missions = { active: [mission] };
  assert.equal(f.adapter.bindMission(mission.id), false);
  mission.targetEntityIds = [frame.id]; const before = JSON.stringify(mission);
  assert.equal(f.adapter.bindMission(mission.id), true);
  assert.equal(JSON.stringify(mission), before); assert.equal(f.adapter.read().mission.status, 'active');
});
test('retirement and teardown are idempotent and unsubscribe all callbacks', () => {
  const f = fixture(); f.adapter.retire(); f.adapter.retire(); f.adapter.destroy(); f.adapter.destroy();
  assert.equal(f.state.entityList.length, 0);
  assert.ok([...f.listeners.values()].every(s => s.size === 0));
  assert.equal(f.adapter.begin(placement(1)).ok, false);
});
