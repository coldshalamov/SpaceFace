import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { weapons } from '../src/systems/weapons.js';
import { vfx } from '../src/render/vfx.js';
import { contextualAttachmentWorlds } from '../src/systems/tetherGameplay.js';
import {
  modelTruthNozzleOrigin,
  modelTruthPlumeSocketName,
  modelTruthRopeEnd,
  modelTruthRow,
  modelTruthRows,
  modelTruthSocketWorld,
  modelTruthWeaponSocketName,
} from '../src/data/modelTruth.js';

const ROOT = resolve(import.meta.dirname, '..');

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

function dist(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
}

test('shot, flash, and socket are the same point', () => {
  const ships = modelTruthRows().filter((row) => row.family === 'player-hull' && (row.sockets || []).some((socket) => socket.name.startsWith('SOCKET_Weapon_')));
  assert.ok(ships.length >= 10);
  for (const row of ships) {
    const entity = hull(row.id);
    const weapon = { slotIndex: 0 };
    const shot = weapons._muzzle(entity, weapon, entity.rot);
    const shotOffNose = weapons._muzzle(entity, weapon, entity.rot + 0.2);
    const flash = weapons.flashOrigin(entity, weapon);
    const socket = modelTruthSocketWorld(entity, modelTruthWeaponSocketName(entity, weapon));
    assert.ok(socket, row.id);
    assert.ok(dist(shot, socket) <= 0.5, `${row.id} shot ${dist(shot, socket)}`);
    assert.ok(dist(shotOffNose, socket) <= 0.5, `${row.id} off-nose ${dist(shotOffNose, socket)}`);
    assert.ok(dist(flash, socket) <= 0.5, `${row.id} flash`);
    assert.equal(weapons._muzzle.length >= 1, true);
  }
});

test('the drawn plume anchor is the nozzle socket', () => {
  const ships = modelTruthRows().filter((row) => (row.sockets || []).some((socket) => socket.name.startsWith('SOCKET_Engine_') || socket.name.startsWith('SOCKET_Trail_')));
  assert.ok(ships.length > 10);
  for (const row of ships) {
    const entity = hull(row.id);
    const objects = (row.sockets || [])
      .filter((socket) => socket.name.startsWith('SOCKET_Engine_') || socket.name.startsWith('SOCKET_Trail_'))
      .map((socket) => ({ name: socket.name, userData: { spacefaceSocket: true } }));
    const root = {
      children: objects,
      traverse(fn) { for (const object of objects) fn(object); },
    };
    const picked = vfx._trailSocketObjects({ view: { root } });
    assert.ok(picked.length, row.id);
    const nozzle = modelTruthNozzleOrigin(entity);
    const drawn = modelTruthSocketWorld(entity, picked[0].name);
    assert.ok(nozzle && drawn, row.id);
    assert.ok(dist(drawn, nozzle) <= 0.5, `${row.id} ${picked[0].name} ${dist(drawn, nozzle)}`);
    const trail = (row.sockets || []).find((socket) => socket.name.startsWith('SOCKET_Trail_'));
    if (trail) {
      const trailWorld = modelTruthSocketWorld(entity, trail.name);
      if (dist(trailWorld, nozzle) > 0.5) assert.notEqual(picked[0].name, trail.name, row.id);
    }
  }
  const boss = hull('dreadnought_boss');
  let asked = null;
  vfx._trailSocketWorldPose.call({
    _trailSocketObjects() { return []; },
    helpers: {
      socketWorldPos(_id, name) {
        asked = name;
        return { x: 0, y: 0, z: 0 };
      },
    },
    _writeTrailSocketPose(x, y, z) { return { x, y, z }; },
  }, boss);
  assert.equal(asked, modelTruthPlumeSocketName(boss));
  assert.equal(String(asked).startsWith('SOCKET_Engine_'), true);
});

test('a wreck with no tether socket uses the measured hardpoint', () => {
  const wreck = modelTruthRows().find((row) => row.family === 'wreck' && !(row.sockets || []).some((socket) => /tether/i.test(socket.name)));
  assert.ok(wreck);
  const player = hull('ship_hornet', { x: 0, z: 0 }, 0);
  const target = {
    id: wreck.id,
    type: 'wreck',
    pos: { x: 80, z: 20 },
    rot: 0,
    radius: wreck.gameplay.entityRadius || 12,
    data: { placeId: wreck.id },
  };
  const ends = contextualAttachmentWorlds(player, target, { x: target.pos.x, y: 0, z: target.pos.z });
  const measured = modelTruthRopeEnd(target);
  assert.ok(dist(ends.targetWorld, measured) <= 0.5);
  assert.ok(dist(ends.targetWorld, target.pos) > 0.5, 'far end is not the origin');
  const playerEnd = modelTruthRopeEnd(player);
  assert.ok(dist(ends.sourceWorld, playerEnd) <= 0.5);
});

test('the radius stand-in and the old mount tables are gone', () => {
  const weaponsSrc = readFileSync(resolve(ROOT, 'src/systems/weapons.js'), 'utf8');
  assert.equal(weaponsSrc.includes('muzzleOffset'), false);
  assert.equal(weaponsSrc.includes('* r * 0.35'), false);
  assert.equal(weaponsSrc.includes('[0.8, 0]'), false);
  const readers = [
    'src/ui/station/screens/shipworks.js',
    'src/ui/shipPreviewMount.js',
    'src/render/partsLibrary.js',
    'src/render/visualFactory.js',
  ];
  for (const file of readers) {
    const text = readFileSync(resolve(ROOT, file), 'utf8');
    assert.equal(text.includes('visuals.hardpoints'), false, file);
    assert.equal(text.includes('visuals.engineMounts'), false, file);
  }
  const ships = readFileSync(resolve(ROOT, 'src/data/ships.js'), 'utf8');
  assert.equal(ships.includes('hardpoints:'), false);
  assert.equal(ships.includes('engineMounts:'), false);
});
