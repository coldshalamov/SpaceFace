// NXI-061: a disabled weapon bank does not commit and does not advertise ready.
// A healthy bank on the same hull still does.
import assert from 'node:assert/strict';
import test from 'node:test';

import { weaponBankReadiness, weapons } from '../src/systems/weapons.js';

test('a disabled bank is not a ready shot, and the other bank on the hull still fires', () => {
  const runtime = {
    subsystems: {
      subsystem_weapon: { effectiveDisabled: true, destroyed: false },
      subsystem_sensor: { effectiveDisabled: false, destroyed: false },
    },
  };
  const broken = { subsystemId: 'subsystem_weapon', _cooldown: 0, _heat: 0, heatMax: 10 };
  const healthy = { subsystemId: 'subsystem_sensor', _cooldown: 0, _heat: 0, heatMax: 10 };
  const brokenRead = weaponBankReadiness(broken, runtime);
  const healthyRead = weaponBankReadiness(healthy, runtime);
  assert.equal(brokenRead.disabled, true);
  assert.equal(brokenRead.ready, false);
  assert.equal(brokenRead.advertised, 'disabled');
  assert.notEqual(brokenRead.advertised, 'ready');
  assert.equal(healthyRead.advertised, 'ready');
  assert.equal(healthyRead.ready, true);

  const committed = [];
  const shipEntity = {
    id: 'maw',
    rot: 0,
    data: {
      weapons: [
        { defId: 'dead', subsystemId: 'subsystem_weapon' },
        { defId: 'live', subsystemId: 'subsystem_sensor' },
      ],
    },
  };
  const state = { meta: { seed: 4242 }, combat: { entities: { maw: runtime } }, simTime: 0 };
  weapons._serviceShip.call({
    _byId: new Map(),
    _mountRoleOpen() { return true; },
    _serviceProjectileWeapon(entity, mount) { committed.push(mount.defId); return 0; },
    _serviceBeam() { return 0; },
    _serviceDeployWeapon() { return 0; },
    _serviceEmergent() { return 0; },
  }, shipEntity, true, false, 1 / 60, state, 0, null, null);
  assert.deepEqual(committed, ['live']);
});
