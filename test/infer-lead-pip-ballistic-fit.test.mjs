import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLeadPipOverlay, hasBallisticWeapon, leadSolution, primaryProjSpeed } from '../src/ai/gunnery.js';
import { solveLeadAngle } from '../src/systems/weapons.js';

const target = { id: 2, type: 'ship', alive: true, team: 1,
  pos: { x: 150, z: 0 }, vel: { x: 0, z: 70 } };
const fitted = (weapons) => ({ id: 1, type: 'ship', alive: true, team: 0, rot: 0,
  pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { weapons } });

test('a missile-only fit has no ballistic lead marker to misdirect the pilot', () => {
  const ship = fitted([{ defId: 'wpn_missile_rack_m' }]);
  assert.equal(hasBallisticWeapon(ship), false);
  const pip = computeLeadPipOverlay(ship, target, { input: { aimAngle: 0 } }, {
    isHostileToPlayer: () => true,
    worldToScreen: (p) => ({ x: p.x, y: p.z, onScreen: true }),
  });
  assert.equal(pip.visible, false);
});

test('a missile rack before a railgun cannot supply the railgun lead speed', () => {
  const ship = fitted([{ defId: 'wpn_missile_rack_m' }, { defId: 'wpn_railgun_m' }]);
  assert.equal(hasBallisticWeapon(ship), true);
  assert.equal(primaryProjSpeed(ship), 700);
  assert.equal(leadSolution(ship, target).angle, solveLeadAngle(ship, target, 700));
});

test('resolved mount tracking overrides the catalog for the ballistic eligibility gate', () => {
  assert.equal(hasBallisticWeapon(fitted([{ defId: 'wpn_railgun_m', tracking: 'homing' }])), false);
  assert.equal(hasBallisticWeapon(fitted([{ defId: 'wpn_railgun_m', tracking: 'deploy' }])), false);
});
