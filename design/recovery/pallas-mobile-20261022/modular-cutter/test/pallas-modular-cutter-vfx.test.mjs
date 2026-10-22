import test from 'node:test';
import assert from 'node:assert/strict';
import { vfx, initNpcJobContactScratch } from '../src/render/vfx.js';
import { PALLAS_REEF_CREW as C } from '../src/data/pallasReefCrew.js';
import {
  installNpcJobLiveSignatureDraw, createNpcJobSignatureFrameScratch, isPallasReefCutter,
  resolvePallasReefCutTarget, NPC_JOB_SIGNATURE_PROFILES,
} from '../src/render/npcJobSignatureVfx.js';

function fixture({ installed = true, capacity = 12 } = {}) {
  const ent = { id: 1, type: 'ship', alive: true, occupantGeneration: 1, radius: 8,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { worldRecordId: C.actors[0].id, identityKey: C.actors[0].id,
      pallasReefRole: C.actors[0].role, defId: C.actors[0].ship,
      homeSectorId: C.sectorId, sectorId: C.sectorId, jobId: 'cut',
      minerShiftActive: true, minerShiftRockId: 2, pallasReefCutTargetGeneration: 2 } };
  const target = { id: 2, type: 'wreck', alive: true, occupantGeneration: 2, radius: 6,
    pos: { x: 40, z: 20 }, data: { worldRecordId: C.sectionId,
      salvageSourceKey: C.sourceKey, salvagePointId: C.salvagePointId } };
  const job = { id: 'cut', kind: 'salvor', phase: 'work', route: [], payload: { role: 'cutter' } };
  const entry = { entityId: 1, worldRecordId: C.actors[0].id, kind: 'salvor', job };
  const state = { mode: 'flight', tick: 30, simTime: 0, world: { currentSectorId: C.sectorId },
    traffic: { pallasReefCrew: { id: C.id, phase: 'cutting', observedTick: 30 } },
    entities: new Map([[1, ent], [2, target]]), entityList: [ent, target],
    npcJobs: { byId: { cut: entry } }, settings: { video: { motionReduce: false } } };
  const output = [];
  const host = Object.assign(Object.create(vfx), {
    state, _ent: id => state.entities.get(id), _npcJobSignatureGen: 0,
    _npcJobSignatureSlots: Array.from({ length: capacity }, () => initNpcJobContactScratch({
      jobId: null, profileId: null, elapsed: 0, lastEmitStep: -1, seed: 0, gen: -1,
      deploy: 0, reaction: 'none', reactionT: 0, frame: createNpcJobSignatureFrameScratch(),
    })), _pirateInterceptScratch: null,
    _spawnStationSideEventStreak(...args) { output.push(['streak', ...args]); return 1; },
    _spawnJobLamp(...args) { output.push(['lamp', ...args]); return 1; },
    _spawnSprite(...args) { output.push(['sprite', ...args]); return true; },
  });
  if (installed) installNpcJobLiveSignatureDraw(host);
  const draw = (step = 1) => { output.length = 0; return host._updateNpcJobSignatures(step); };
  return { host, ent, target, job, entry, state, output, draw };
}

test('all generic output channels remain dark for authored cutter in every non-cut state', () => {
  for (const invalidate of [
    f => { f.ent.data.minerShiftActive = false; },
    f => { f.state.traffic.pallasReefCrew.phase = 'retired'; },
    f => { f.job.phase = 'flee'; }, f => { f.job.phase = 'complete'; },
    f => { f.entry.control = {}; }, f => { f.entry.towAssist = {}; },
    f => { f.ent.alive = false; }, f => { f.job.corrupt = true; },
    f => { f.state.mode = 'docked'; },
  ]) {
    const f = fixture(); invalidate(f);
    for (const phase of ['spawn', 'transit', 'work', 'load', 'return']) {
      // Preserve explicit flee/complete invalidation; otherwise stress every generic profile.
      if (!['flee', 'complete'].includes(f.job.phase)) f.job.phase = phase;
      assert.equal(f.draw(), 0); assert.deepEqual(f.output, []);
    }
  }
});

test('each generic dispatcher suppresses cutter before lamp, streak or sprite primitives', () => {
  const f = fixture(); f.draw(); const slot = f.host._npcJobSignatureSlots[0];
  for (const profile of Object.values(NPC_JOB_SIGNATURE_PROFILES)) {
    f.output.length = 0;
    assert.equal(f.host._emitNpcJobSignature(slot, profile, f.ent, f.job, false), 0);
    assert.equal(f.host._emitNpcJobContact(slot, profile, f.ent, f.job, false), 0);
    assert.equal(f.host._emitNpcJobReaction(slot, f.ent, false), 0);
    assert.deepEqual(f.output, []);
  }
});

test('exact identities and authority reject malformed and lookalike snapshots', () => {
  for (const key of ['worldRecordId', 'identityKey', 'pallasReefRole', 'defId', 'homeSectorId', 'sectorId']) {
    const f = fixture(); f.ent.data[key] = 'lookalike';
    assert.equal(isPallasReefCutter(f.ent), false, key);
    assert.equal(resolvePallasReefCutTarget(f.state, f.ent, f.job), null, key);
  }
  for (const invalidate of [
    f => { f.ent.type = 'wreck'; }, f => { f.ent.pos.x = Infinity; },
    f => { f.target.pos.z = NaN; }, f => { f.target.pos.x = 96; f.target.pos.z = 0; },
    f => { f.target.occupantGeneration = 2.1; }, f => { f.target.data.salvagePointId = 'foreign'; },
    f => { f.target.type = 'asteroid'; }, f => { f.ent.data.minerShiftRockId = '2'; },
    f => { f.state.entities.set(1, { ...f.ent }); }, f => { f.entry.worldRecordId = 'foreign'; },
    f => { f.job.id = 'different'; }, f => { f.state.traffic.pallasReefCrew.id = 'foreign'; },
    f => { f.state.tick = NaN; }, f => { f.state.traffic.pallasReefCrew.observedTick = 31; },
  ]) {
    const f = fixture(); invalidate(f);
    assert.equal(resolvePallasReefCutTarget(f.state, f.ent, f.job), null);
  }
  assert.equal(isPallasReefCutter(null), false);
  assert.equal(resolvePallasReefCutTarget(null, null, null), null);
});

test('finite beam geometry and normal/reduced particle counts', () => {
  const f = fixture(); assert.equal(f.draw(), 2);
  for (const row of f.output) for (const value of row.slice(1)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
  f.state.settings.video.motionReduce = true; assert.equal(f.draw(), 1);
  f.ent.radius = Infinity; f.target.radius = NaN; assert.equal(f.draw(), 1);
  for (const value of f.output[0].slice(1)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
});

test('cutter cadence is miner 5.5/2 Hz regardless of generic phases, cues or projected job replacement', () => {
  for (const reduced of [false, true]) {
    const stable = fixture(), varied = fixture();
    stable.state.settings.video.motionReduce = varied.state.settings.video.motionReduce = reduced;
    const expected = [], actual = [];
    for (let i = 0; i < 120; i++) {
      varied.entry.job = { ...varied.entry.job, phase: ['work', 'transit', 'load'][i % 3] };
      varied.ent.data.ceresCausalCue = ['extraction', 'ore_intake', null][i % 3];
      expected.push(stable.draw(1 / 60)); actual.push(varied.draw(1 / 60));
      const s = stable.host._npcReefCutterScratch[0];
      assert.equal(s.frame.emitStep, Math.floor(s.elapsed * (reduced ? 2 : 5.5)
        + stable.host._npcJobSignatureSlots[0].seed / 1000 * 4));
    }
    assert.deepEqual(actual, expected);
  }
});

test('duplicate installation preserves wrappers and unrelated delegate this, arguments and return', () => {
  const calls = [], result = {};
  const host = { init() {}, _updateNpcJobSignatures() { return 0; } };
  for (const name of ['_emitNpcJobSignature', '_emitNpcJobContact', '_emitNpcJobReaction']) {
    host[name] = function (...args) { calls.push([this, args]); return result; };
  }
  installNpcJobLiveSignatureDraw(host);
  const wrapped = host._emitNpcJobSignature;
  installNpcJobLiveSignatureDraw(host); assert.equal(host._emitNpcJobSignature, wrapped);
  const ent = { type: 'ship', data: {} }, args = [{}, {}, ent, {}, false, 'extra'];
  assert.equal(host._emitNpcJobSignature(...args), result);
  assert.equal(calls[0][0], host); assert.deepEqual(calls[0][1], args);
  assert.equal(host._emitNpcJobContact(...args), result);
  assert.equal(host._emitNpcJobReaction(args[0], ent, true, 'extra'), result);
});

test('unrelated worker real output is identical before and after installation', () => {
  for (const kind of ['miner', 'salvor', 'tender', 'hauler', 'surveyor', 'patrol']) {
    const plain = fixture({ installed: false }), guarded = fixture();
    for (const f of [plain, guarded]) {
      f.ent.data = { jobId: 'cut' }; f.entry.kind = f.job.kind = kind;
    }
    for (const phase of ['spawn', 'transit', 'approach', 'work', 'load', 'return', 'flee', 'complete']) {
      plain.job.phase = guarded.job.phase = phase;
      assert.equal(guarded.draw(), plain.draw(), `${kind}/${phase}`);
      assert.deepEqual(guarded.output, plain.output, `${kind}/${phase}`);
      assert.deepEqual(guarded.host._npcJobSignatureSlots.map(({ contactVisit, ...s }) => s),
        plain.host._npcJobSignatureSlots.map(({ contactVisit, ...s }) => s));
    }
  }
});

test('early returns cannot replay stale generation and no-slot cases stay dark', () => {
  const f = fixture(); assert.equal(f.draw(), 2);
  const saved = f.state.npcJobs; f.state.npcJobs = null;
  assert.equal(f.draw(), 0); assert.deepEqual(f.output, []);
  assert.equal(f.host._npcReefCutterScratch[0].entity, null);
  f.state.npcJobs = saved; assert.equal(f.draw(), 2);
  const noSlots = fixture({ capacity: 0 }); assert.equal(noSlots.draw(), 0);
});

test('slot release, reuse and occupant replacement reset only bounded private scratch', () => {
  const f = fixture({ capacity: 1 }); f.draw(0.01);
  const scratch = f.host._npcReefCutterScratch[0]; assert.equal(scratch.elapsed, 0.01);
  f.state.npcJobs.byId = {}; f.draw(); assert.equal(scratch.entity, null);
  f.state.npcJobs.byId = { cut: f.entry }; f.draw(0.01); assert.equal(scratch.elapsed, 0.01);
  f.ent.occupantGeneration++; f.draw(0.01); assert.equal(scratch.elapsed, 0.01);
  assert.equal(f.host._npcReefCutterScratch.length, 12);
  const ordinary = { ...f.ent, id: 3, data: { jobId: 'ordinary' } };
  f.state.entities.set(3, ordinary);
  f.state.npcJobs.byId = { ordinary: { entityId: 3, kind: 'hauler', job: { id: 'ordinary', phase: 'transit' } }, cut: f.entry };
  f.draw(); assert.equal(scratch.entity, null, 'saturated pool does not invent an extra cutter slot');
});

test('queued intake and threat emit no cutter work, including skipped cadence fallback', () => {
  const f = fixture(); f.draw(); f.entry.kind = f.job.kind = 'miner';
  f.ent.data.minerShiftActive = false;
  f.host._npcIntakePending = new Map([['one', { carrierId: 1 }]]);
  f.host._npcThreatPending = new Map([['cut', {}]]); f.host._npcThreatShown = new Set();
  assert.equal(f.draw(), 0); assert.deepEqual(f.output, []);
  assert.equal(f.host._npcIntakePending.size, 0); assert.equal(f.host._npcThreatPending.size, 0);
  const skipped = fixture({ installed: false });
  skipped.host.update = function () { return 77; };
  installNpcJobLiveSignatureDraw(skipped.host);
  skipped.host._npcIntakePending = new Map([['one', { carrierId: 1 }]]);
  assert.equal(skipped.host.update(0.001, skipped.state), 77);
  assert.deepEqual(skipped.output, []); assert.equal(skipped.host._npcIntakePending.size, 0);
});

test('new game, initialization and destroy reset cutter lifetime scratch', () => {
  const f = fixture({ installed: false }), listeners = new Map();
  f.host.bus = { on(name, fn) { listeners.set(name, fn); }, off(name) { listeners.delete(name); } };
  f.host.init = function () { return 19; }; f.host.destroy = function () { return 23; };
  installNpcJobLiveSignatureDraw(f.host); assert.equal(f.host.init(), 19);
  f.draw(); const scratch = f.host._npcReefCutterScratch[0];
  listeners.get('game:newGame')(); assert.equal(scratch.entity, null);
  f.draw(); f.host.init(); assert.equal(scratch.entity, null);
  f.draw(); assert.equal(f.host.destroy(), 23); assert.equal(scratch.entity, null);
});

test('stop changes authorize no new particles and never mutate simulation facts', () => {
  const f = fixture(); const before = JSON.stringify({ ent: f.ent, target: f.target, job: f.job, report: f.state.traffic });
  assert.equal(f.draw(), 2);
  assert.equal(JSON.stringify({ ent: f.ent, target: f.target, job: f.job, report: f.state.traffic }), before);
  f.ent.data.minerShiftActive = false;
  for (let i = 0; i < 60; i++) { assert.equal(f.draw(1 / 60), 0); assert.deepEqual(f.output, []); }
  // Already submitted 0.20/0.34-second strokes belong to the existing particle pool's fade clock.
  // No cancellation or invented instantaneous-clear behavior is asserted here.
});
