import test from 'node:test';
import assert from 'node:assert/strict';

import { vfx } from '../src/render/vfx.js';
import {
  modelTruthPlumeSocketName,
  modelTruthRow,
  modelTruthRows,
  modelTruthSocketWorld,
  modelTruthTrailSocketName,
} from '../src/data/modelTruth.js';

// SFQ-B181 — nozzle/history continuity. The plume pose keeps the owner-pinned contract
// ("the drawn plume anchor is the nozzle socket", test/model-truth-mounts.test.mjs), but the
// recorded wake must anchor where the exhaust stream leaves the body — the authored 'vfx'
// SOCKET_Trail_* stations — or a hull whose drive mount is not its trailing edge records
// history from mid-hull. ship_saucer is the shipped case: SOCKET_Engine_Main is the ventral
// field core at hull center [0,-3.1,0] while the trail stations sit on the rear rim.

function hull(id, pos = { x: 12, z: -6 }, rot = 0.35) {
  const row = modelTruthRow(id);
  assert.ok(row, id);
  return {
    id,
    type: 'ship',
    alive: true,
    pos,
    rot,
    radius: row.gameplay.entityRadius || 14,
    data: { defId: id },
  };
}

function socketView(row) {
  const objects = (row.sockets || [])
    .filter((socket) => socket.name.startsWith('SOCKET_Engine_') || socket.name.startsWith('SOCKET_Trail_'))
    .map((socket) => ({ name: socket.name, userData: { spacefaceSocket: true } }));
  const root = {
    children: objects,
    userData: {},
    traverse(fn) { for (const object of objects) fn(object); },
  };
  return { root };
}

function dist(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
}

test('saucer wake anchors at the rear-rim trail station, not the ventral drive mount', () => {
  const row = modelTruthRow('ship_saucer');
  const engine = (row.sockets || []).find((socket) => socket.name === 'SOCKET_Engine_Main');
  const trail = (row.sockets || []).find((socket) => socket.name === 'SOCKET_Trail_Main');
  assert.ok(engine && trail, 'saucer authors both a drive mount and rim trail stations');
  // The authored defect: mount face and wake station disagree by most of the hull's length.
  const entity = hull('ship_saucer');
  const separated = dist(
    modelTruthSocketWorld(entity, 'SOCKET_Engine_Main'),
    modelTruthSocketWorld(entity, 'SOCKET_Trail_Main'),
  );
  assert.ok(separated > 5, `saucer mount↔rim separation ${separated.toFixed(1)} wu should stay large`);

  const view = socketView(row);
  vfx._trailSocketObjects({ view });
  const cache = view.__vfxTrailSockets;
  // Plume contract preserved: live jets and the plume still draw from the nozzle mount.
  assert.equal(cache.sockets[0].name, 'SOCKET_Engine_Main');
  // History fix: the wake samples the authored rim trail station, not the belly mount.
  assert.equal(cache.wake[0].name, 'SOCKET_Trail_Main');
});

test('the wake socket pick prefers SOCKET_Trail_* over SOCKET_Engine_* fleet-wide', () => {
  const rows = modelTruthRows().filter((row) => (row.sockets || [])
    .some((socket) => socket.name.startsWith('SOCKET_Engine_') || socket.name.startsWith('SOCKET_Trail_')));
  assert.ok(rows.length > 10);
  for (const row of rows) {
    const hasTrail = (row.sockets || []).some((socket) => socket.name.startsWith('SOCKET_Trail_'));
    const name = modelTruthTrailSocketName(hull(row.id));
    assert.ok(name, row.id);
    if (hasTrail) assert.equal(name.startsWith('SOCKET_Trail_'), true, `${row.id} picks ${name}`);
    else assert.equal(name.startsWith('SOCKET_Engine_'), true, `${row.id} falls back to ${name}`);
    // The plume pick stays nozzle-first — the pinned contract is untouched.
    const plume = modelTruthPlumeSocketName(hull(row.id));
    if ((row.sockets || []).some((socket) => socket.name.startsWith('SOCKET_Engine_'))) {
      assert.equal(plume.startsWith('SOCKET_Engine_'), true, `${row.id} plume picks ${plume}`);
    }
  }
});

test('socket-less views resolve the same trail station through the census chain', () => {
  const saucer = hull('ship_saucer');
  const mkProbe = (sink) => ({
    _trailSocketObjects() { return []; },
    helpers: {
      socketWorldPos(_id, name) { sink.name = name; return { x: 0, y: 0, z: 0 }; },
    },
    _writeTrailSocketPose(x, y, z) { return { x, y, z }; },
  });
  const wakeSink = {};
  const plumeSink = {};
  vfx._wakeTrailSocketWorldPose.call(mkProbe(wakeSink), { ...saucer, view: null });
  vfx._trailSocketWorldPose.call(mkProbe(plumeSink), { ...saucer, view: null });
  assert.equal(wakeSink.name, 'SOCKET_Trail_Main');
  assert.equal(plumeSink.name, 'SOCKET_Engine_Main');
});

test('conventional hulls wake from the trail station just aft of the bell mouth', () => {
  const row = modelTruthRow('ship_hornet');
  const view = socketView(row);
  vfx._trailSocketObjects({ view });
  const cache = view.__vfxTrailSockets;
  assert.equal(cache.sockets[0].name, 'SOCKET_Engine_Main');
  assert.equal(cache.wake[0].name, 'SOCKET_Trail_Main');
  const entity = hull('ship_hornet');
  const gap = dist(
    modelTruthSocketWorld(entity, 'SOCKET_Trail_Main'),
    modelTruthSocketWorld(entity, 'SOCKET_Engine_Main'),
  );
  assert.ok(gap > 0.05 && gap < 3, `hornet trail station sits ${gap.toFixed(2)} wu aft of the mount face`);
});
