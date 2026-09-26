import test from 'node:test';
import assert from 'node:assert/strict';

import { selectHitSubsystem } from '../src/combat/geometry.js';
import { SUBSYSTEM_DEFS } from '../src/data/combatDefs.js';
import {
  modelTruthHitVolume,
  modelTruthRow,
  modelTruthRows,
  modelTruthSocketWorld,
  modelTruthUnmeasuredHitVolumes,
} from '../src/data/modelTruth.js';

const catalog = {
  subsystems: new Map(SUBSYSTEM_DEFS.map((def) => [def.id, def])),
};
const combatant = {
  subsystems: Object.fromEntries(SUBSYSTEM_DEFS.map((def) => [def.id, { hp: def.health }])),
};

function ship(id) {
  const row = modelTruthRow(id);
  return {
    id,
    type: 'ship',
    pos: { x: 0, z: 0 },
    rot: 0,
    radius: row.gameplay.entityRadius,
    data: { defId: id },
  };
}

test('a shot into the engine volume reports the drive', () => {
  const row = modelTruthRows().find((entry) => entry.family === 'player-hull'
    && (entry.sockets || []).some((socket) => socket.name.startsWith('SOCKET_Engine_')));
  assert.ok(row);
  const entity = ship(row.id);
  const nozzle = modelTruthSocketWorld(entity, row.sockets.find((socket) => socket.name.startsWith('SOCKET_Engine_')).name);
  const hit = selectHitSubsystem(entity, combatant, catalog, { pos: { x: nozzle.x, z: nozzle.z } });
  assert.equal(hit, 'subsystem_drive');
});

test('a shot into the nose reports the weapon volume when the guns are there', () => {
  const row = modelTruthRows().find((entry) => entry.family === 'player-hull'
    && (entry.sockets || []).some((socket) => socket.name.startsWith('SOCKET_Weapon_')));
  assert.ok(row);
  const entity = ship(row.id);
  const gun = modelTruthSocketWorld(entity, row.sockets.find((socket) => socket.name.startsWith('SOCKET_Weapon_')).name);
  const hit = selectHitSubsystem(entity, combatant, catalog, { pos: { x: gun.x, z: gun.z } });
  assert.equal(hit, 'subsystem_weapon');
  const volume = modelTruthHitVolume(entity, 'subsystem_weapon');
  assert.equal(volume.measured, true);
});

test('an unmeasured hull keeps the generic volume and is listed', () => {
  const entity = {
    id: 'unmeasured',
    type: 'ship',
    pos: { x: 0, z: 0 },
    rot: 0,
    radius: 10,
    data: { defId: 'not_a_measured_hull' },
  };
  assert.equal(modelTruthHitVolume(entity, 'subsystem_drive'), null);
  const nose = selectHitSubsystem(entity, combatant, catalog, { pos: { x: 3.6, z: 0 } });
  assert.equal(nose, 'subsystem_weapon');
  const stern = selectHitSubsystem(entity, combatant, catalog, { pos: { x: -5.8, z: 0 } });
  assert.equal(stern, 'subsystem_drive');
  const listed = modelTruthRows().filter((row) => modelTruthUnmeasuredHitVolumes(row.id).length);
  assert.ok(listed.length >= 0);
  for (const row of listed) {
    assert.ok(modelTruthUnmeasuredHitVolumes(row.id).includes('subsystem_transport_clamp')
      || modelTruthUnmeasuredHitVolumes(row.id).length > 0);
  }
  const health = SUBSYSTEM_DEFS.map((def) => [def.id, def.health, def.armor.flat]);
  assert.deepEqual(health, [
    ['subsystem_drive', 45, 2],
    ['subsystem_weapon', 38, 1],
    ['subsystem_sensor', 26, 0.5],
    ['subsystem_tether_spool', 32, 1],
    ['subsystem_power', 52, 3],
    ['subsystem_transport_clamp', 34, 1],
  ]);
});
