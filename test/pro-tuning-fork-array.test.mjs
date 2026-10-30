import test from 'node:test';
import assert from 'node:assert/strict';
import { defineEncounter, bodySpec } from '../src/features/tuning-fork-array/definition.mjs';
import { solveSignal } from '../src/features/tuning-fork-array/signal.mjs';
import { createPuzzle, observe, readPulse, reverseJumper, serialize, restore } from '../src/features/tuning-fork-array/core.mjs';
import { createTuningForkArray } from '../src/features/tuning-fork-array/adapter.mjs';
import { readoutModel } from '../src/features/tuning-fork-array/presentation.mjs';

const placement = { id: 'tuning_fork_array', sectorId: 'sector_test', anchor: { x: 400, z: -200 } };
const seeded = seed => () => { seed = Math.imul(seed ^ (seed >>> 15), 1 | seed); seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed); return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296; };
function definition(seed = 22) { return defineEncounter({ rng: seeded(seed) }, placement); }
function ideal(def, emitter = { ...def.emitter, rot: 0 }) {
  return [...def.buoys.map((b, i) => { const angle = i * Math.PI * 2 / 3; return {
    x: emitter.x + Math.cos(angle) * b.radius, z: emitter.z + Math.sin(angle) * b.radius, rot: angle + Math.PI,
  }; }), emitter];
}
function harness(saved = null) {
  const listeners = new Map(), log = [], jobs = new Map(); let id = 10, life = 100;
  const state = { rng: seeded(22), simTime: 20, world: { currentSectorId: placement.sectorId },
    entities: new Map(), playerId: 1, player: { credits: 5000 } };
  const bus = { on(n, fn) { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n).add(fn); },
    off(n, fn) { listeners.get(n)?.delete(fn); }, emit(n, p) { log.push([n, p]); for (const fn of [...(listeners.get(n) || [])]) fn(p); } };
  const helpers = { spawnEntity(spec) { const e = { alive: true, ...structuredClone(spec), id: id++, occupantGeneration: life++ }; state.entities.set(e.id, e); return e; },
    removeEntity(entityId) { const e = state.entities.get(entityId); if (!e) return false; e.alive = false; return true; },
    queryRadius() { return [...state.entities.values()]; },
    npcJobs: { assign(e, spec) { const key = `job:${e.data.worldRecordId}`; if (!jobs.has(key)) jobs.set(key, {
      worldRecordId: e.data.worldRecordId, entityId: e.id, job: { ...structuredClone(spec), loopCount: 0 } }); e.data.jobId = key; return key; },
      get: key => jobs.get(key), release(key) { const entry = jobs.get(key); if (!entry) return false; jobs.delete(key); const e = state.entities.get(entry.entityId); if (e) delete e.data.jobId; return true; } } };
  state.entities.set(1, { id: 1, occupantGeneration: 1, alive: true, pos: { x: 400, z: -200 }, rot: 0 });
  const economy = { grantCredits(amount, reason) { state.player.credits += amount; bus.emit('credits:changed', { delta: amount, reason, total: state.player.credits }); return state.player.credits; } };
  const registry = { get: name => name === 'economy' ? economy : null };
  const api = createTuningForkArray({ state, bus, helpers, registry }, placement, saved);
  const bodies = () => api.readout().bodyIds.map(key => state.entities.get(key));
  function setIdeal(emitter) { const def = api.readout().state.definition; const ps = ideal(def, emitter); bodies().forEach((e, i) => { e.pos = { x: ps[i].x, z: ps[i].z }; e.rot = ps[i].rot; }); return ps; }
  let sequence = 0;
  function pulse() { const ship = state.entities.get(1); bus.emit('scan:pulse', { source: 'player-scanner', scannerId: 1,
    seq: ++sequence, pos: { ...ship.pos }, simTime: state.simTime, radius: 1000 }); }
  function recover() { const ps = setIdeal(); state.entities.get(1).pos = { x: ps[3].x, z: ps[3].z }; pulse(); assert.equal(api.readout().state.stage, 'record'); }
  function surveyActor() { return helpers.spawnEntity({ type: 'ship', pos: { x: 400, z: -200 }, rot: 0, collides: true, radius: 5, data: { worldRecordId: 'array_survey_hull' } }); }
  return { state, bus, helpers, registry, economy, api, bodies, setIdeal, pulse, recover, jobs, log, listeners, surveyActor };
}

test('seeded definition and physical specs are deterministic and bounded', () => {
  assert.deepEqual(definition(), definition()); assert.notDeepEqual(definition(4), definition(8));
  const def = definition(); assert.equal(def.buoys.length, 3);
  const spec = bodySpec(def, 0, { x: 1, z: 2, rot: 3 }, 1);
  assert.equal(spec.physicsBody, true); assert.equal(spec.data.masslineTetherable, true); assert.equal(spec.mass, 6);
  assert.equal(bodySpec(def, 3, { x: 1, z: 2 }, 1).data.masslineTetherable, false);
});

test('physical axes intersect at emitter; coherent range bands solve across 128 seeds', () => {
  for (let seed = 1; seed <= 128; seed++) {
    const def = definition(seed), ps = ideal(def), s = solveSignal(def, ps.slice(0, 3), ps[3], 20);
    assert.equal(s.valid, true); assert.ok(s.uncertainty < 1e-8); assert.ok(s.quality > .99);
  }
});

test('forgiving partial signal is useful; backward mouth, phase error and collapsed geometry cannot solve', () => {
  const def = definition(), ps = ideal(def);
  ps[0].rot += .2;
  let s = solveSignal(def, ps.slice(0, 3), ps[3], 20); assert.ok(s.rows[0].amplitude > .9); assert.equal(s.valid, true);
  ps[0].rot += Math.PI;
  s = solveSignal(def, ps.slice(0, 3), ps[3], 20); assert.equal(s.valid, false); assert.equal(s.rows[0].backwards, true);
  const good = ideal(def); assert.equal(solveSignal(def, good.slice(0, 3), good[3], 20, [-1, 1, 1]).valid, false);
  const line = [{ x: 0, z: 0, rot: 0 }, { x: 10, z: 0, rot: 0 }, { x: 20, z: 0, rot: 0 }];
  assert.equal(solveSignal(def, line, { x: 100, z: 0, rot: 0 }, 20).estimate, null);
});

test('range-phase interference responds continuously to towing and moving emitter', () => {
  const def = definition(), ps = ideal(def), before = solveSignal(def, ps.slice(0, 3), ps[3], 20);
  ps[1].x += 80;
  const after = solveSignal(def, ps.slice(0, 3), ps[3], 20);
  assert.ok(after.quality < before.quality); assert.equal(after.valid, false);
  const moved = { x: ps[3].x + 50, z: ps[3].z - 30, rot: 0 }, adjusted = ideal(def, moved);
  const signal = solveSignal(def, adjusted.slice(0, 3), moved, 20);
  assert.ok(Math.abs(signal.estimate.x - moved.x) < 1e-8); assert.ok(signal.valid);
});

test('squall is periodic, bounded and never erases tuning', () => {
  const def = definition(), ps = ideal(def);
  assert.equal(solveSignal(def, ps.slice(0, 3), ps[3], 2).pressure, .12);
  assert.deepEqual(solveSignal(def, ps.slice(0, 3), ps[3], 2), solveSignal(def, ps.slice(0, 3), ps[3], 62));
  assert.ok(solveSignal(def, ps.slice(0, 3), ps[3], 2).valid);
});

test('mid-puzzle restore retains jumper, scan replay guard, poses and absence', () => {
  const def = definition(), p = createPuzzle(def, 20), ps = ideal(def);
  readPulse(p, { source: 'player-scanner', seq: 1, radius: 320, simTime: 20 }, ps[0], ps, 20, 1);
  p.stage = 'tuning'; assert.ok(reverseJumper(p, 0, ps[0], ps));
  observe(p, [ps[0], null, ps[2], ps[3]], 21);
  const saved = serialize(p), restored = restore(saved); assert.deepEqual(restored, saved);
  assert.equal(restored.missing[1], true); assert.equal(restored.polarities[0], -1);
  assert.equal(readPulse(restored, { source: 'player-scanner', seq: 1, radius: 320, simTime: 20 }, ps[0], ps, 20, 1), false);
  assert.ok(reverseJumper(restored, 0, ps[0], ps)); assert.equal(restored.polarities[0], 1);
});

test('canonical pulse gates remote recovery; fake, duplicate and stale pulses are rejected', () => {
  const h = harness(), ps = h.setIdeal(); h.state.entities.get(1).pos = { ...ps[0] };
  h.bus.emit('scan:pulse', { scannerId: 1, source: 'other', seq: 1, radius: 1000, pos: ps[0], simTime: 20 });
  assert.equal(h.api.readout().state.stage, 'unread');
  h.pulse(); assert.equal(h.api.readout().state.stage, 'fixed');
  const saved = h.api.serialize(), event = h.log.find(([n, p]) => n === 'scan:pulse' && p.source === 'player-scanner')[1];
  h.bus.emit('scan:pulse', event); assert.deepEqual(h.api.serialize(), saved);
  h.state.entities.get(1).pos = { ...ps[3] }; h.state.simTime++; h.pulse();
  assert.equal(h.api.readout().state.stage, 'record');
});

test('lost / towed body cannot be replaced near home; far replacement retires serial once', () => {
  const h = harness(); h.pulse(); const old = h.bodies()[0];
  assert.equal(h.api.replace(0), false);
  old.pos.x += 3000; h.api.update(); assert.equal(h.api.replace(0), true);
  assert.equal(old.alive, false); assert.equal(h.api.readout().state.serials[0], 2);
  assert.equal(h.api.replace(0), false);
  const b = h.bodies()[1]; b.alive = false; h.api.update();
  assert.equal(h.api.readout().state.missing[1], true); assert.equal(h.api.replace(1), true);
});

test('recycled IDs and old serial callbacks cannot bind a foreign body', () => {
  const h = harness(), old = h.bodies()[0];
  h.state.entities.set(old.id, { ...old, occupantGeneration: old.occupantGeneration + 1, data: {} });
  h.api.update(); assert.equal(h.api.readout().bodyIds[0], null);
  assert.equal(h.api.bindBody(0, old), false);
  assert.equal(h.api.bindBody(0, h.state.entities.get(old.id)), false);
});

test('sector exit freezes encounter; return retains towed pose without multiplying bodies', () => {
  const h = harness(); h.pulse(); const b = h.bodies()[0], count = h.state.entities.size;
  h.bus.emit('sector:exit', { sectorId: placement.sectorId }); h.state.world.currentSectorId = 'elsewhere';
  b.pos.x += 45; h.state.simTime++; h.pulse(); assert.equal(h.api.readout().state.active, false);
  h.state.world.currentSectorId = placement.sectorId; h.bus.emit('sector:enter', { sectorId: placement.sectorId });
  h.bus.emit('sector:enter', { sectorId: placement.sectorId });
  assert.equal(h.state.entities.size, count); assert.equal(h.api.readout().state.poses[0].x, b.pos.x);
});

test('restore waits for canonical bodies, never duplicates them, and rejects a wrong serial', () => {
  const h = harness(); h.pulse(); const saved = h.api.serialize(), bodies = h.bodies();
  h.bus.emit('save:restoring'); h.api.restoreState(saved, bodies);
  assert.equal(h.state.entities.size, 5); assert.equal(h.api.readout().bodyIds.filter(Boolean).length, 4);
  assert.throws(() => h.api.restoreState(saved, [{ ...bodies[0], data: {} }]), /identity/);
  const fresh = harness(saved); assert.equal(fresh.state.entities.size, 1);
  fresh.api.restoreState(saved, []); fresh.api.materialize(); assert.equal(fresh.state.entities.size, 1);
});

for (const choice of ['sell', 'publish']) test(`${choice}: one reward, matching receipt and real survey job; no duplicate after restore`, () => {
  const h = harness(); h.recover(); let nested;
  h.bus.on('credits:changed', () => { nested = h.api.choose(choice); assert.throws(() => h.api.serialize(), /transaction/); });
  const receipt = h.api.choose(choice), expected = choice === 'sell' ? 1200 : 450;
  assert.equal(nested, null); assert.equal(h.state.player.credits, 5000 + expected); assert.equal(receipt.credits, expected);
  assert.equal(h.api.choose(choice), null); assert.equal(h.api.publicCorridor(), null);
  const saved = h.api.serialize(); assert.deepEqual(restore(saved), saved);
  h.api.restoreState(saved, h.bodies()); assert.equal(h.api.choose(choice), null);
  h.state.simTime = 51; const actor = h.surveyActor(), jobId = h.api.commissionSurvey(actor);
  assert.ok(jobId); assert.equal(h.api.commissionSurvey(actor), null);
  h.jobs.get(jobId).job.loopCount = receipt.corridor.validationPasses - 1;
  assert.equal(h.api.advanceSurvey(), false); assert.equal(h.api.publicCorridor(), null);
  h.jobs.get(jobId).job.loopCount++;
  assert.equal(h.api.advanceSurvey(), true); assert.equal(h.api.advanceSurvey(), false);
  assert.equal(h.api.trafficConsequence().progress.publicOpen, choice === 'publish');
  assert.equal(!!h.api.publicCorridor(), choice === 'publish');
  assert.equal(h.state.player.credits, 5000 + expected);
});

test('unknown economy outcome is quarantined without fake receipt or second grant', () => {
  const h = harness(); h.recover(); let calls = 0;
  h.economy.grantCredits = amount => { calls++; h.state.player.credits += amount; throw new Error('owner failure'); };
  assert.throws(() => h.api.choose('sell'), /owner failure/); assert.equal(h.api.choose('sell'), null);
  assert.equal(calls, 1); assert.equal(h.api.readout().state.receipt, null);
  assert.equal(h.api.readout().settlementBlocked, true); assert.equal(restore(h.api.serialize()).settlement.status, 'uncertain');
});

test('obstructed or crowded corridor never commissions or advertises safe traffic', () => {
  const h = harness(); h.recover(); const receipt = h.api.choose('publish'); h.state.simTime = 51;
  const actor = h.surveyActor(), blocker = h.helpers.spawnEntity({ type: 'asteroid', pos: receipt.corridor.from, rot: 0, collides: true, radius: 20 });
  assert.equal(h.api.commissionSurvey(actor), null); assert.equal(h.api.publicCorridor(), null);
  blocker.alive = false; assert.ok(h.api.commissionSurvey(actor));
});

test('retirement and disposal reject late work, release owned jobs, and remove only bound bodies', () => {
  const h = harness(); h.recover(); h.api.choose('publish'); h.state.simTime = 51;
  const actor = h.surveyActor(); h.api.commissionSurvey(actor); const foreign = h.helpers.spawnEntity({ type: 'wreck', pos: { x: 0, z: 0 }, rot: 0 });
  h.api.retire(); assert.equal(h.jobs.size, 0); assert.equal(foreign.alive, true);
  assert.equal(h.api.choose('sell'), null); h.pulse(); assert.equal(h.api.readout().state.stage, 'retired');
  h.api.destroy(); h.api.destroy(); for (const set of h.listeners.values()) assert.equal(set.size, 0);
});

test('readout has text for bearings, reversible mistake, absence and the economic choice', () => {
  const h = harness(); h.recover(); const model = readoutModel(h.api.readout());
  assert.equal(model.choices.length, 2); assert.match(model.choices[0].text, /1,200/);
  assert.match(model.rows[0], /reception/); assert.match(model.rows[1], /jumper/);
});

test('a moving carrier must be approached at its current position after acquiring a fix', () => {
  const h = harness(), ps = h.setIdeal(); h.state.entities.get(1).pos = { ...ps[0] }; h.pulse();
  assert.equal(h.api.readout().state.stage, 'fixed');
  const wreck = h.bodies()[3], old = { ...wreck.pos }; wreck.pos.x += 200;
  h.state.entities.get(1).pos = old; h.state.simTime++; h.pulse();
  assert.equal(h.api.readout().state.stage, 'fixed'); assert.equal(h.api.choose('publish'), null);
  h.api.trackFix(); assert.equal(h.log.at(-1)[1].pos.x, wreck.pos.x);
  h.state.entities.get(1).pos = { ...wreck.pos }; h.state.simTime++; h.pulse();
  assert.equal(h.api.readout().state.stage, 'record');
});

test('lost survey job is reported honestly without another hull or duplicate reward', () => {
  const h = harness(); h.recover(); h.api.choose('publish'); h.state.simTime = 51;
  const actor = h.surveyActor(), jobId = h.api.commissionSurvey(actor); h.jobs.delete(jobId);
  assert.equal(h.api.advanceSurvey(), false); assert.equal(h.api.trafficConsequence().progress.status, 'survey_lost');
  assert.equal(h.api.commissionSurvey(h.surveyActor()), null); assert.equal(h.api.publicCorridor(), null);
  assert.equal(h.state.player.credits, 5450);
});

test('corrupt / future state and mismatched reward receipt fail closed', () => {
  const h = harness(), saved = h.api.serialize();
  assert.throws(() => restore({ ...saved, version: 2 }));
  assert.throws(() => restore({ ...saved, polarities: [1, 1, 0] }));
  assert.throws(() => restore({ ...saved, poses: [] }));
  h.recover(); h.api.choose('sell'); const paid = h.api.serialize(); paid.receipt.choice = 'publish';
  assert.throws(() => restore(paid), /receipt/);
});
