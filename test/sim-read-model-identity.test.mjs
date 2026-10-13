// Read-model row identity + presentationAdmission contract.
//
// The facade entities Map is the boundary the render realm resolves
// (boundaryLiveEntity). Two invariants keep the authored-presentation
// admit path alive across the hop:
//   1. A re-delivered spawn (init replay, rebuild) updates fields but
//      keeps the SAME row object — admission jobs capture entity refs at
//      enqueue and stamp presentationAdmission at commit; replacing the
//      object strands the live row while a dead twin collects the stamp.
//   2. presentationAdmission is stamped 'pending' at mint for types the
//      authored path owns, and a settled verdict ('ready') outranks a
//      fresh spawn's re-stamp.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createReadModel,
  applySpawnInfos,
  applyDestroyIds,
} from '../scripts/lib/simReadModel.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { PRESENTATION_ADMISSION } from '../src/core/presentationAdmission.js';

const spawn = (over = {}) => ({
  entityId: 42,
  type: 'ship',
  x: 10, y: 0, z: -5,
  vx: 0, vz: 0, rot: 0.5,
  radius: 12,
  sectorId: 'sector_helios',
  data: { callsign: 'TEST', role: 'trader' },
  ...over,
});

test('spawn mint stamps presentationAdmission for authored types', () => {
  const model = createReadModel();
  applySpawnInfos(model, [spawn()]);
  const row = model.entities.get(42);
  assert.ok(row);
  assert.equal(row.presentationAdmission, PRESENTATION_ADMISSION.pending);
});

test('spawn mint leaves admission absent for non-authored types', () => {
  const model = createReadModel();
  applySpawnInfos(model, [spawn({ type: 'asteroid' })]);
  const row = model.entities.get(42);
  assert.ok(row);
  assert.equal(row.presentationAdmission, undefined);
});

test('re-delivered spawn preserves row identity and prevPos', () => {
  const model = createReadModel();
  applySpawnInfos(model, [spawn()]);
  const first = model.entities.get(42);
  const prevPos = { x: 9, y: 0, z: -4 };
  first.prevPos = prevPos;

  applySpawnInfos(model, [spawn({ x: 20, z: 30, rot: 1.25 })]);
  const second = model.entities.get(42);
  assert.equal(second, first, 'map slot must keep the live object');
  assert.equal(second.pos.x, 20);
  assert.equal(second.pos.z, 30);
  assert.equal(second.rot, 1.25);
  assert.equal(second.prevPos, prevPos, 'pose continuity survives re-delivery');
});

test('a stamped admission verdict survives spawn re-delivery', () => {
  const model = createReadModel();
  applySpawnInfos(model, [spawn()]);
  const row = model.entities.get(42);
  row.presentationAdmission = PRESENTATION_ADMISSION.ready;

  applySpawnInfos(model, [spawn()]);
  assert.equal(model.entities.get(42).presentationAdmission,
    PRESENTATION_ADMISSION.ready);
});

test('same native occupant redelivery preserves render refs and its admission verdict', () => {
  const model = createReadModel();
  applySpawnInfos(model, [spawn({ occupantGeneration: 11 })]);
  const row = model.entities.get(42), mesh = {}, view = { root: mesh };
  row.mesh = mesh; row.view = view; row.presentationAdmission = PRESENTATION_ADMISSION.ready;
  applySpawnInfos(model, [spawn({ occupantGeneration: 11, x: 20 })]);
  assert.strictEqual(model.entities.get(42), row);
  assert.strictEqual(row.mesh, mesh); assert.strictEqual(row.view, view);
  assert.equal(row.presentationAdmission, PRESENTATION_ADMISSION.ready);
  assert.equal(row.occupantGeneration, 11);
  assert.equal(Object.keys(row).includes('occupantGeneration'), false);
});

test('a recycled numeric id starts a fresh facade and retires its captured old owner', () => {
  const model = createReadModel();
  applySpawnInfos(model, [spawn({ occupantGeneration: 11 })]);
  const old = model.entities.get(42);
  old.mesh = {}; old.view = {}; old.presentationAdmission = PRESENTATION_ADMISSION.ready;
  applySpawnInfos(model, [spawn({ occupantGeneration: 12, type: 'asteroid', x: -1700 })]);
  const next = model.entities.get(42);
  assert.notStrictEqual(next, old);
  assert.equal(old.alive, false, 'captured admission owner becomes inactive');
  assert.equal(next.occupantGeneration, 12); assert.equal(next.type, 'asteroid');
  assert.equal(next.mesh, undefined); assert.equal(next.view, undefined);
  assert.equal(next.presentationAdmission, undefined, 'the new occupant cannot inherit ready');
  applyDestroyIds(model, [42]);
  assert.equal(next.alive, false); assert.equal(model.entities.has(42), false);
});

test('the production worker transports the real non-enumerable native life token', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const native = lane.host.runtime.spawn({ type: 'ship', team: 1, radius: 10, data: { defId: 'ship_wasp' } });
    const reply = await lane.tick({ tick: 1, steps: 0, commands: [], ackEnd: init.initRebuild?.end ?? 0 });
    const info = reply.spawnInfos.find(row => row.entityId === native.id);
    assert.ok(Number.isSafeInteger(native.occupantGeneration) && native.occupantGeneration > 0);
    assert.equal(Object.keys(native).includes('occupantGeneration'), false);
    assert.equal(info.occupantGeneration, native.occupantGeneration);
    const model = createReadModel(); applySpawnInfos(model, [info]);
    assert.equal(model.entities.get(native.id).occupantGeneration, native.occupantGeneration);
  } finally { lane.shutdown(); }
});
